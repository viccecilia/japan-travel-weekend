#!/usr/bin/env bash
set -euo pipefail
current=/var/www/japan-travel-weekend-test
expected=/var/www/jtw-test-releases/jtw-20260909-referral-monitor-v27
test "$(readlink -f "$current")" = "$expected"
test -s "$expected/index.html"
test -s "$expected/sw.js"
grep -q 'index-S3m-t1VF.js' "$expected/index.html"
curl -fsSI https://weekend.japan-travel.info/app/referral | grep -Ei 'HTTP/|x-robots-tag|content-security-policy'
curl -fsS https://weekend.japan-travel.info/app/operations >/dev/null
curl -fsS https://weekend.japan-travel.info/staff >/dev/null
curl -fsS https://weekend.japan-travel.info/api/ready
echo
echo release_verified
