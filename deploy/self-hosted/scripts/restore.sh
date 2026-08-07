#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

log() {
  printf '[refkit:restore] %s\n' "$*"
}

fail() {
  log "ERROR: $*" >&2
  exit 1
}

for variable in PGHOST PGDATABASE PGUSER PGPASSWORD REFKIT_IMAGE REFKIT_VERSION RESTORE_BACKUP; do
  [[ -n "${!variable:-}" ]] || fail "$variable is required."
done

[[ "$PGDATABASE" != "postgres" ]] || fail "The application database cannot be named postgres for restore."
[[ "$RESTORE_BACKUP" != */* && "$RESTORE_BACKUP" != *..* ]] \
  || fail "RESTORE_BACKUP must be a backup filename, not a path."
[[ "$RESTORE_CONFIRM" == "restore-$PGDATABASE" ]] \
  || fail "Set RESTORE_CONFIRM=restore-$PGDATABASE to confirm destructive restore."

archive="/backups/$RESTORE_BACKUP"
[[ -f "$archive" ]] || fail "Backup not found: $archive"
[[ -d /uploads ]] || fail "The uploads volume is not mounted at /uploads."

work_directory="$(mktemp -d /tmp/refkit-restore.XXXXXX)"
trap 'rm -rf -- "$work_directory"' EXIT
bundle_directory="$work_directory/bundle"
uploads_directory="$work_directory/uploads"
mkdir -m 0700 "$bundle_directory" "$uploads_directory"

validate_archive_paths() {
  local archive_path="$1"
  local label="$2"
  local listing_path="$3"
  local grep_status=0

  if ! tar --quoting-style=escape -tzf "$archive_path" > "$listing_path"; then
    fail "The $label archive could not be listed completely."
  fi

  grep -E '(^/|(^|/)\.\.(/|$)|\\)' "$listing_path" > /dev/null \
    || grep_status=$?
  case "$grep_status" in
    0) fail "The $label archive contains an unsafe path." ;;
    1) ;;
    *) fail "The $label archive path listing could not be validated." ;;
  esac
}

validate_extracted_tree() {
  local directory="$1"
  local label="$2"
  local allow_directories="$3"
  local unsafe_types_path="$work_directory/$label-unsafe-types"
  local hard_links_path="$work_directory/$label-hard-links"

  if [[ "$allow_directories" == "true" ]]; then
    find "$directory" -mindepth 1 ! \( -type f -o -type d \) -print0 \
      > "$unsafe_types_path" \
      || fail "The $label archive entry types could not be validated."
  else
    find "$directory" -mindepth 1 ! -type f -print0 > "$unsafe_types_path" \
      || fail "The $label archive entry types could not be validated."
  fi
  [[ ! -s "$unsafe_types_path" ]] \
    || fail "The $label archive contains links or unsupported entry types."

  find "$directory" -type f -links +1 -print0 > "$hard_links_path" \
    || fail "The $label archive hard links could not be validated."
  [[ ! -s "$hard_links_path" ]] \
    || fail "The $label archive contains hard links."
}

validate_archive_paths "$archive" "backup" "$work_directory/backup-members"
if ! tar \
  --no-overwrite-dir \
  --no-same-owner \
  --no-same-permissions \
  -C "$bundle_directory" \
  -xzf "$archive"; then
  fail "The backup archive could not be extracted safely."
fi
validate_extracted_tree "$bundle_directory" "backup" "false"

shopt -s dotglob nullglob
bundle_entries=("$bundle_directory"/*)
shopt -u dotglob nullglob
[[ "${#bundle_entries[@]}" -eq 4 ]] \
  || fail "The backup archive must contain exactly the four supported files."

for file in manifest SHA256SUMS database.dump uploads.tar.gz; do
  [[ -f "$bundle_directory/$file" ]] || fail "Backup is missing $file."
done

manifest_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$bundle_directory/manifest" | tail -n 1
}

[[ "$(manifest_value format_version)" == "1" ]] \
  || fail "Unsupported backup format version."

backup_version="$(manifest_value refkit_version)"
[[ "$backup_version" == "$REFKIT_VERSION" ]] \
  || fail "Backup version $backup_version does not match target version $REFKIT_VERSION. Restore with the matching RefKit image."
backup_image="$(manifest_value refkit_image)"
[[ "$backup_image" == "$REFKIT_IMAGE" ]] \
  || fail "Backup image $backup_image does not match target image $REFKIT_IMAGE. Restore with the exact image recorded in the backup."

(
  cd "$bundle_directory"
  sha256sum --check SHA256SUMS
)

validate_archive_paths \
  "$bundle_directory/uploads.tar.gz" \
  "uploads" \
  "$work_directory/uploads-members"
if ! tar \
  --no-overwrite-dir \
  --no-same-owner \
  --no-same-permissions \
  -C "$uploads_directory" \
  -xzf "$bundle_directory/uploads.tar.gz"; then
  fail "The uploads archive could not be extracted safely."
fi
validate_extracted_tree "$uploads_directory" "uploads" "true"

log "Replacing database $PGDATABASE from $RESTORE_BACKUP."
dropdb --if-exists --force --maintenance-db=postgres "$PGDATABASE"
createdb --maintenance-db=postgres --owner="$PGUSER" "$PGDATABASE"
pg_restore \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  --dbname="$PGDATABASE" \
  "$bundle_directory/database.dump"

log "Replacing persistent uploads."
find /uploads -mindepth 1 -delete
cp -a -- "$uploads_directory/." /uploads/
chown -R "${UPLOADS_UID:-1000}:${UPLOADS_GID:-1000}" /uploads
find /uploads -type d -exec chmod 0700 {} +
find /uploads -type f -exec chmod 0600 {} +

log "Restore completed. Start the matching RefKit image and verify readiness before admitting traffic."
