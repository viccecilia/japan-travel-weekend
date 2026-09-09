#!/usr/bin/env bash
set -euo pipefail
current=/var/www/japan-travel-weekend-test
expected=/var/www/jtw-test-releases/jtw-20260909-route-stories-v30
test "$(readlink -f "$current")" = "$expected"
test -s "$expected/index.html"
test -s "$expected/sw.js"
grep -q 'index-D4Mb81mG.js' "$expected/index.html"
grep -q 'skipWaiting' "$expected/sw.js"
grep -q 'clientsClaim' "$expected/sw.js"
curl -fsSI https://weekend.japan-travel.info/app/trips | grep -Ei 'HTTP/|x-robots-tag|content-security-policy'
curl -fsS https://weekend.japan-travel.info/api/ready
echo
echo release_verified
