#!/usr/bin/env bash
set -euo pipefail
bundle=/home/ubuntu/jtw-20260909-guest-demo-v32
release=/var/www/jtw-test-releases/jtw-20260909-guest-demo-v32
current=/var/www/japan-travel-weekend-test
test -s "$bundle/dist/index.html"
test -s "$bundle/dist/sw.js"
test -s "$bundle/dist/assets/index-W9GqIzQW.js"
if [[ -e "$current" && ! -L "$current" ]]; then echo "refusing to replace non-symlink: $current" >&2; exit 1; fi
sudo install -d -m 0755 /var/www/jtw-test-releases
sudo rm -rf "$release"
sudo cp -a "$bundle/dist" "$release"
sudo chown -R root:root "$release"
sudo find "$release" -type d -exec chmod 0755 {} +
sudo find "$release" -type f -exec chmod 0644 {} +
sudo ln -sfn "$release" "$current"
sudo nginx -t
sudo systemctl reload nginx
test "$(readlink -f "$current")" = "$release"
for path in /app /staff /app/operations; do curl -fsS "https://weekend.japan-travel.info$path" >/dev/null; done
curl -fsS https://weekend.japan-travel.info/api/ready
echo
echo 'Deployment finished. Press Enter to close.'
read -r
