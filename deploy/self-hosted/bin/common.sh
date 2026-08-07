#!/usr/bin/env bash

self_hosted_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${REFKIT_ENV_FILE:-$self_hosted_directory/.env}"
compose_file="$self_hosted_directory/compose.yaml"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf '[refkit:ops] ERROR: Required command not found: %s\n' "$1" >&2
    exit 1
  }
}

require_runtime() {
  require_command docker
  [[ -f "$env_file" ]] || {
    printf '[refkit:ops] ERROR: Environment file not found: %s\n' "$env_file" >&2
    exit 1
  }
  docker compose version >/dev/null
}

refkit_compose() {
  docker compose \
    --project-directory "$self_hosted_directory" \
    --env-file "$env_file" \
    -f "$compose_file" \
    "$@"
}

read_env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$env_file" | tail -n 1
}

resolved_backup_directory() {
  local configured
  configured="${BACKUP_DIR:-$(read_env_value BACKUP_DIR)}"
  configured="${configured:-./backups}"

  if [[ "$configured" = /* ]]; then
    printf '%s\n' "$configured"
  else
    printf '%s/%s\n' "$self_hosted_directory" "${configured#./}"
  fi
}

service_is_running() {
  refkit_compose ps --status running --services | grep -Fxq "$1"
}
