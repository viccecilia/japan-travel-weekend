#!/usr/bin/env bash
set -euo pipefail
bundle=/home/ubuntu/jtw-test-deploy-jtw-20260905-places
release=/var/www/jtw-test-releases/jtw-20260905-places
test -f "$bundle/dist/index.html"
test -f "$bundle/supabase/migrations/202609050070_guided_tour_photo_sources.sql"
sudo install -d -m 0755 /var/www/jtw-test-releases
sudo rm -rf "$release"
sudo cp -a "$bundle/dist" "$release"
sudo chown -R root:root "$release"
sudo chmod -R a+rX "$release"
sudo ln -sfn "$release" /var/www/japan-travel-weekend-test
sudo nginx -t
sudo systemctl reload nginx
readlink -f /var/www/japan-travel-weekend-test
curl -fsS https://weekend.japan-travel.info/api-test/health
