#!/usr/bin/env bash
set -euo pipefail

release_id="dcdf1df-20260826"
bundle="/home/ubuntu/jtw-test-deploy-${release_id}"
release_root="/var/www/jtw-test-releases"
release="${release_root}/${release_id}"
current="/var/www/japan-travel-weekend-test"

test -s "${bundle}/dist/index.html"
test -s "${bundle}/weekend-test.conf"
test -s "${bundle}/weekend-test-common.conf"
if [[ -e "${release}" ]]; then echo "release already exists: ${release}" >&2; exit 1; fi
if [[ -e "${current}" && ! -L "${current}" ]]; then echo "refusing to replace non-symlink: ${current}" >&2; exit 1; fi

sudo install -d -m 0755 "${release_root}"
sudo cp -a "${bundle}/dist" "${release}"
sudo chown -R root:root "${release}"
sudo find "${release}" -type d -exec chmod 0755 {} +
sudo find "${release}" -type f -exec chmod 0644 {} +
sudo ln -sfn "${release}" "${current}"

if [[ -f /etc/nginx/sites-available/jtw-weekend-test ]]; then sudo cp -an /etc/nginx/sites-available/jtw-weekend-test /etc/nginx/sites-available/jtw-weekend-test.before-${release_id}; fi
if [[ -f /etc/nginx/snippets/jtw-weekend-test-common.conf ]]; then sudo cp -an /etc/nginx/snippets/jtw-weekend-test-common.conf /etc/nginx/snippets/jtw-weekend-test-common.conf.before-${release_id}; fi
sudo install -m 0644 "${bundle}/weekend-test.conf" /etc/nginx/sites-available/jtw-weekend-test
sudo install -m 0644 "${bundle}/weekend-test-common.conf" /etc/nginx/snippets/jtw-weekend-test-common.conf
sudo ln -sfn /etc/nginx/sites-available/jtw-weekend-test /etc/nginx/sites-enabled/jtw-weekend-test

sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx --domain weekend.japan-travel.info --non-interactive --agree-tos --email s_pang@daitora-jp.com --redirect
sudo nginx -t
sudo systemctl reload nginx

curl -fsS https://weekend.japan-travel.info/app >/dev/null
curl -fsS https://weekend.japan-travel.info/api-test/health
