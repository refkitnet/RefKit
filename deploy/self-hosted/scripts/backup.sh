#!/usr/bin/env bash
set -Eeuo pipefail

log() {
  printf '[refkit:backup] %s\n' "$*"
}

fail() {
  log "ERROR: $*" >&2
  exit 1
}

for variable in PGHOST PGDATABASE PGUSER PGPASSWORD REFKIT_VERSION REFKIT_IMAGE; do
  [[ -n "${!variable:-}" ]] || fail "$variable is required."
done

retention_days="${BACKUP_RETENTION_DAYS:-14}"
minimum_free_mb="${BACKUP_MIN_FREE_MB:-1024}"

[[ "$retention_days" =~ ^[0-9]+$ ]] || fail "BACKUP_RETENTION_DAYS must be a non-negative integer."
[[ "$minimum_free_mb" =~ ^[0-9]+$ ]] || fail "BACKUP_MIN_FREE_MB must be a non-negative integer."
[[ -d /uploads ]] || fail "The uploads volume is not mounted at /uploads."

mkdir -p /backups
umask 077

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
safe_version="$(printf '%s' "$REFKIT_VERSION" | tr -c 'A-Za-z0-9._-' '_')"
archive_name="refkit-${timestamp}-${safe_version}.tar.gz"
staging_directory="$(mktemp -d "/backups/.refkit-backup-${timestamp}.XXXXXX")"
temporary_archive="/backups/.${archive_name}.partial"

cleanup() {
  rm -rf -- "$staging_directory" "$temporary_archive"
}
trap cleanup EXIT

database_bytes="$(psql --no-psqlrc --tuples-only --no-align --command='select pg_database_size(current_database())')"
uploads_bytes="$(du -sb /uploads | awk '{print $1}')"
available_bytes="$(( $(df -Pk /backups | awk 'NR == 2 {print $4}') * 1024 ))"
reserve_bytes="$(( minimum_free_mb * 1024 * 1024 ))"
required_bytes="$(( (database_bytes + uploads_bytes) * 2 + reserve_bytes ))"

log "Database size: ${database_bytes} bytes. Upload size: ${uploads_bytes} bytes. Backup filesystem available: ${available_bytes} bytes."

if (( available_bytes < required_bytes )); then
  fail "Insufficient backup space. Need at least ${required_bytes} bytes before creating this backup."
fi

log "Creating a consistent PostgreSQL logical dump."
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$staging_directory/database.dump" \
  "$PGDATABASE"

log "Archiving persistent uploads."
tar -C /uploads -czf "$staging_directory/uploads.tar.gz" .

cat > "$staging_directory/manifest" <<EOF
format_version=1
created_at=${timestamp}
refkit_version=${REFKIT_VERSION}
refkit_image=${REFKIT_IMAGE}
database=${PGDATABASE}
database_format=postgresql_custom
uploads_format=tar_gzip
EOF

(
  cd "$staging_directory"
  sha256sum database.dump uploads.tar.gz > SHA256SUMS
)

tar -C "$staging_directory" -czf "$temporary_archive" \
  manifest SHA256SUMS database.dump uploads.tar.gz
mv -- "$temporary_archive" "/backups/$archive_name"
chmod 600 "/backups/$archive_name"

if (( retention_days > 0 )); then
  find /backups -maxdepth 1 -type f -name 'refkit-*.tar.gz' \
    -mtime "+$retention_days" -print -delete
fi

trap - EXIT
rm -rf -- "$staging_directory"

log "Backup completed: /backups/$archive_name"
printf 'BACKUP_FILE=%s\n' "$archive_name"
