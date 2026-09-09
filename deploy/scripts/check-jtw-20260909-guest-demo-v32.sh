#!/usr/bin/env bash
set -euo pipefail
current=/var/www/japan-travel-weekend-test
expected=/var/www/jtw-test-releases/jtw-20260909-guest-demo-v32
test "$(readlink -f "$current")" = "$expected"
test -s "$expected/index.html"
test -s "$expected/sw.js"
grep -q 'index-W9GqIzQW.js' "$expected/index.html"
grep -q 'skipWaiting' "$expected/sw.js"
grep -q 'clientsClaim' "$expected/sw.js"
for path in /app /staff /app/operations; do curl -fsSI "https://weekend.japan-travel.info$path" | grep -q 'HTTP/1.1 200'; done
curl -fsS https://weekend.japan-travel.info/api/ready
echo
echo guest_demo_verified
