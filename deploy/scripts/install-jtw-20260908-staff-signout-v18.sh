#!/usr/bin/env bash
set -euo pipefail
bundle=/home/ubuntu/jtw-test-deploy-jtw-20260908-staff-signout-v18
release=/var/www/jtw-test-releases/jtw-20260908-staff-signout-v18
current=/var/www/japan-travel-weekend-test
test -s "$bundle/dist/index.html"
test -s "$bundle/dist/sw.js"
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
curl -fsS https://weekend.japan-travel.info/staff >/dev/null
curl -fsS https://weekend.japan-travel.info/api/health
echo
echo 'Deployment finished. Press Enter to close.'
read -r
