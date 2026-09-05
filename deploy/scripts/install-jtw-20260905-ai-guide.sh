#!/usr/bin/env bash
set -euo pipefail
bundle="/home/ubuntu/jtw-test-deploy-jtw-20260905-ai-guide"
release="/var/www/jtw-test-releases/jtw-20260905-ai-guide"
current="/var/www/japan-travel-weekend-test"
test -s "${bundle}/dist/index.html"
test -s "${bundle}/supabase/202609050067_guided_tour_companion.sql"
if [[ -e "${release}" ]]; then echo "release already exists: ${release}" >&2; exit 1; fi
if [[ -e "${current}" && ! -L "${current}" ]]; then echo "refusing to replace non-symlink: ${current}" >&2; exit 1; fi
sudo install -d -m 0755 /var/www/jtw-test-releases
sudo cp -a "${bundle}/dist" "${release}"
sudo chown -R root:root "${release}"
sudo find "${release}" -type d -exec chmod 0755 {} +
sudo find "${release}" -type f -exec chmod 0644 {} +
sudo ln -sfn "${release}" "${current}"
sudo nginx -t
sudo systemctl reload nginx
test "$(readlink -f "${current}")" = "${release}"
curl -fsS https://weekend.japan-travel.info/app >/dev/null
curl -fsS https://weekend.japan-travel.info/api-test/health
