#!/usr/bin/env bash
set -euo pipefail
app_dir=/home/ubuntu/japan-travel-weekend-api
archive=/tmp/jtw-phase41-server.tgz
test -f "$archive"
test -f "$app_dir/.env.server.test.local"
grep -qx 'JTW_RUNTIME_MODE=test' "$app_dir/.env.server.test.local" || printf '\nJTW_RUNTIME_MODE=test\n' >> "$app_dir/.env.server.test.local"
stamp=$(date +%Y%m%d%H%M%S)
mv "$app_dir/.server-dist/server" "$app_dir/.server-dist/server.phase41-backup-$stamp"
tar -xzf "$archive" -C "$app_dir/.server-dist"
sudo systemctl restart japan-travel-weekend-api.service
systemctl is-active --quiet japan-travel-weekend-api.service
curl --fail --silent --show-error https://api-test.japan-travel.info/health
curl --silent --show-error https://api-test.japan-travel.info/ready || true
sudo journalctl -u japan-travel-weekend-api.service -n 60 --no-pager | tail -n 60
