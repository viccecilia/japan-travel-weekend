#!/usr/bin/env bash
set -euo pipefail

release_dir=/home/ubuntu/jtw-live-release
app_dir=/home/ubuntu/japan-travel-weekend-live-api
env_file="$app_dir/.env.server.live.local"

read -rsp 'Stripe live secret key (sk_live_...): ' stripe_secret
printf '\n'
read -rsp 'Stripe webhook signing secret (whsec_...): ' webhook_secret
printf '\n'
[[ "$stripe_secret" == sk_live_* ]] || { echo 'Invalid live key prefix'; exit 1; }
[[ "$webhook_secret" == whsec_* ]] || { echo 'Invalid webhook secret prefix'; exit 1; }

mkdir -p "$app_dir"
cp -a "$release_dir/.server-dist" "$app_dir/"
rm -f "$app_dir/node_modules"
ln -s /home/ubuntu/japan-travel-weekend-api/node_modules "$app_dir/node_modules"

supabase_url=$(grep '^SUPABASE_URL=' /home/ubuntu/japan-travel-weekend-api/.env.server.test.local)
supabase_role=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' /home/ubuntu/japan-travel-weekend-api/.env.server.test.local)
umask 027
{
  printf '%s\n' "$supabase_url" "$supabase_role"
  printf 'STRIPE_SECRET_KEY=%s\n' "$stripe_secret"
  printf 'STRIPE_WEBHOOK_SECRET=%s\n' "$webhook_secret"
  printf 'JTW_STRIPE_MODE=live\nALLOWED_ORIGIN=https://weekend.japan-travel.info\nPORT=18774\n'
} > "$env_file"
unset stripe_secret webhook_secret supabase_role
chmod 640 "$env_file"

sudo cp "$release_dir/japan-travel-weekend-live-api.service" /etc/systemd/system/
if ! sudo grep -q 'location /api/' /etc/nginx/snippets/jtw-weekend-test-common.conf; then
  sudo cp /etc/nginx/snippets/jtw-weekend-test-common.conf /etc/nginx/snippets/jtw-weekend-test-common.conf.pre-live-api
  sudo sed -i '/location \/api-test\//i location /api/ {\n    proxy_pass http://127.0.0.1:18774/;\n    proxy_http_version 1.1;\n    proxy_set_header Host $host;\n    proxy_set_header Origin $http_origin;\n    proxy_set_header X-Forwarded-Proto $scheme;\n    proxy_read_timeout 20s;\n    proxy_send_timeout 20s;\n}\n' /etc/nginx/snippets/jtw-weekend-test-common.conf
fi
sudo systemctl daemon-reload
sudo systemctl enable --now japan-travel-weekend-live-api.service
sudo nginx -t
sudo systemctl reload nginx
systemctl is-active japan-travel-weekend-live-api.service
curl -fsS https://weekend.japan-travel.info/api/health
echo
echo 'Live API deployment finished. Press Enter to close.'
read -r
