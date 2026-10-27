#!/usr/bin/env bash
set -euo pipefail
umask 077

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
install -d -m 700 private/backups
exec 9>private/backups/.backup.lock
flock -n 9 || { printf '%s\n' 'Ya hay un respaldo en curso.' >&2; exit 1; }

backup_dir="$(mktemp -d "private/backups/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
cleanup() {
    rm -f -- "$backup_dir/database.sql.gz.partial" "$backup_dir/configuration.tar.gz.partial"
}
trap cleanup EXIT

docker compose exec -T mysql sh -ec '
    export MYSQL_PWD="$MYSQL_PASSWORD"
    exec mysqldump --user="$MYSQL_USER" --default-character-set=utf8mb4 \
        --single-transaction --skip-lock-tables --skip-triggers --no-tablespaces \
        --set-gtid-purged=OFF sysmant_cloud
' | gzip > "$backup_dir/database.sql.gz.partial"
gzip -t "$backup_dir/database.sql.gz.partial"
mv -- "$backup_dir/database.sql.gz.partial" "$backup_dir/database.sql.gz"

config_files=(.env private/stations.json)
if [[ -f private/portal.key ]]; then config_files+=(private/portal.key); fi
if [[ -f private/station-networks.conf ]]; then config_files+=(private/station-networks.conf); fi
for directory in private/acme private/tls; do
    if [[ -d "$directory" ]]; then config_files+=("$directory"); fi
done
tar -czf "$backup_dir/configuration.tar.gz.partial" -- "${config_files[@]}"
mv -- "$backup_dir/configuration.tar.gz.partial" "$backup_dir/configuration.tar.gz"
(
    cd "$backup_dir"
    sha256sum database.sql.gz configuration.tar.gz > SHA256SUMS
)
printf 'Respaldo UTC: %s/%s\n' "$project_root" "$backup_dir"
