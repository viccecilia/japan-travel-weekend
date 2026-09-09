#!/usr/bin/env bash
set -euo pipefail
current=/var/www/japan-travel-weekend-test
expected=/var/www/jtw-test-releases/jtw-20260909-route-content-v33
test "$(readlink -f "$current")" = "$expected"
test -s "$expected/index.html"
test -s "$expected/sw.js"
test -s "$expected/images/routes/kinkaku/kinkaku-01.webp"
grep -q 'index-u7Sm0L_a.js' "$expected/index.html"
grep -q '京都经典一日游' "$expected/assets/index-u7Sm0L_a.js"
grep -q '胜尾寺、爱宕念佛寺与岚山' "$expected/assets/index-u7Sm0L_a.js"
for path in /app/trips /app/trips/arashiyama-train-hozugawa /app/booking/arashiyama-train-hozugawa /staff /app/operations /images/routes/kinkaku/kinkaku-01.webp; do curl -fsSI "https://weekend.japan-travel.info$path" | grep -q 'HTTP/1.1 200'; done
curl -fsS https://weekend.japan-travel.info/api/ready
echo
echo route_content_v33_verified
