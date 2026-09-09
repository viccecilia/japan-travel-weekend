#!/usr/bin/env bash
set -euo pipefail
current=/var/www/japan-travel-weekend-test
expected=/var/www/jtw-test-releases/jtw-20260909-nine-routes-v28
test "$(readlink -f "$current")" = "$expected"
test -s "$expected/index.html"
test -s "$expected/sw.js"
test -s "$expected/images/uji-nara.jpg"
test -s "$expected/images/miyama-katsuoji.jpg"
test -s "$expected/images/hozugawa.jpg"
test -s "$expected/images/kyoto-autumn.jpg"
grep -q 'index-CH2XM8Qo.js' "$expected/index.html"
curl -fsSI https://weekend.japan-travel.info/app/trips | grep -Ei 'HTTP/|x-robots-tag|content-security-policy'
curl -fsS https://weekend.japan-travel.info/app/trips/sanzenin-kibune-arashiyama-autumn >/dev/null
curl -fsS https://weekend.japan-travel.info/app/operations >/dev/null
curl -fsS https://weekend.japan-travel.info/api/ready
echo
echo release_verified
