#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
docker compose --profile tls run --rm acme --cron --home /acme.sh
nginx -t
systemctl reload nginx
