#!/usr/bin/env bash
set -Eeuo pipefail

interval="${BACKUP_INTERVAL_SECONDS:-86400}"

if [[ ! "$interval" =~ ^[0-9]+$ ]] || (( interval < 300 )); then
  printf '[refkit:backup] ERROR: BACKUP_INTERVAL_SECONDS must be at least 300.\n' >&2
  exit 1
fi

printf '[refkit:backup] Scheduled backups enabled every %s seconds.\n' "$interval"

while true; do
  /opt/refkit/bin/backup.sh
  printf '[refkit:backup] Next backup is scheduled in %s seconds.\n' "$interval"
  sleep "$interval"
done
