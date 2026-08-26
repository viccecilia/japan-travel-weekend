#!/usr/bin/env bash
set -u

app_dir="/home/ubuntu/japan-travel-weekend-api"
node_bin="/home/ubuntu/.local/jtw-node22/bin/node"

cd "${app_dir}"
mkdir -p .runtime
flock -n .runtime/test-api-monitor.lock "${node_bin}" \
  --env-file=.env.alerts-mail.local \
  scripts/monitor-test-api.mjs \
  >> .runtime/test-api-monitor.log 2>&1 || true
