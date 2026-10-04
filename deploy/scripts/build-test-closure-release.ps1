param(
  [Parameter(Mandatory = $true)][string]$ReleaseId
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$expectedBranch = 'feature/production-app-foundation'
$releaseRoot = Join-Path $env:TEMP $ReleaseId
$bundle = Join-Path $releaseRoot 'bundle'
$archive = Join-Path $releaseRoot "$ReleaseId.tar.gz"

function Get-GitText {
  param([string[]]$Arguments)
  $value = & git.exe -c "safe.directory=$repo" @Arguments
  if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') failed" }
  return ($value -join "`n").Trim()
}

function Get-Sha256 {
  param([string]$Path)
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

if (Test-Path -LiteralPath $releaseRoot) { throw "release directory already exists: $releaseRoot" }
$branch = Get-GitText @('branch', '--show-current')
if ($branch -ne $expectedBranch) { throw "branch must be $expectedBranch; actual=$branch" }
$sha = Get-GitText @('rev-parse', 'HEAD')
if ((Get-GitText @('status', '--short'))) { throw 'working tree is not clean' }
if ($ReleaseId -notmatch [regex]::Escape($sha.Substring(0, 7))) { throw 'release ID must include the source short SHA' }

New-Item -ItemType Directory -Path $bundle -Force | Out-Null
Push-Location $repo
try {
  npm.cmd run typecheck
  $env:JTW_RELEASE_SHA = $sha
  try { npm.cmd run build } finally { Remove-Item Env:JTW_RELEASE_SHA -ErrorAction SilentlyContinue }
  npm.cmd run build:server
  & git.exe -c "safe.directory=$repo" diff --check
  if ($LASTEXITCODE -ne 0) { throw 'git diff --check failed' }

  Copy-Item -LiteralPath 'dist' -Destination (Join-Path $bundle 'dist') -Recurse
  Copy-Item -LiteralPath '.server-dist' -Destination (Join-Path $bundle '.server-dist') -Recurse
  Copy-Item -LiteralPath 'deploy\nginx\weekend-test-common.conf' -Destination (Join-Path $bundle 'weekend-test-common.conf')
  [IO.File]::WriteAllText((Join-Path $bundle 'RELEASE_SHA'), "$sha`n", [Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText((Join-Path $bundle 'BUILD_SOURCE.txt'), "GitHub branch: $expectedBranch`nGitHub commit: $sha`nWorking tree clean: true`n", [Text.UTF8Encoding]::new($false))

  $hashLines = Get-ChildItem -LiteralPath $bundle -Recurse -File | Where-Object { $_.Name -ne 'CHECKSUMS.sha256' } | Sort-Object FullName | ForEach-Object {
    $relative = $_.FullName.Substring($bundle.Length).TrimStart([char]92, [char]47).Replace([char]92, '/')
    "$(Get-Sha256 $_.FullName)  $relative"
  }
  [IO.File]::WriteAllText((Join-Path $bundle 'CHECKSUMS.sha256'), (($hashLines -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))

  $install = @'
#!/usr/bin/env bash
set -euo pipefail
release_id="__RELEASE_ID__"
expected="__SHA__"
bundle="/home/ubuntu/${release_id}/bundle"
release="/var/www/jtw-test-releases/${release_id}"
current="/var/www/japan-travel-weekend-test"
api_root="/home/ubuntu/japan-travel-weekend-api"
api_dist="${api_root}/.server-dist"
api_backup="${api_root}/.server-dist.before-${release_id}"
env_file="${api_root}/.env.server.test.local"
env_backup="${api_root}/.env.server.test.local.before-${release_id}"
nginx_common="/etc/nginx/snippets/jtw-weekend-test-common.conf"
nginx_backup="${release}/nginx-common.before"
previous_frontend=''
frontend_switched=0
api_switched=0
nginx_changed=0
rollback() {
  status=$?
  if [ "$api_switched" = 1 ] && sudo test -d "$api_backup"; then
    sudo rm -rf "$api_dist"
    sudo mv "$api_backup" "$api_dist"
    if sudo test -f "$env_backup"; then sudo cp "$env_backup" "$env_file"; fi
    sudo systemctl restart japan-travel-weekend-api.service || true
  fi
  if [ "$frontend_switched" = 1 ] && [ -n "$previous_frontend" ]; then
    sudo ln -sfn "$previous_frontend" "$current"
  fi
  if [ "$nginx_changed" = 1 ] && sudo test -f "$nginx_backup"; then
    sudo cp "$nginx_backup" "$nginx_common"
  fi
  if [ "$frontend_switched" = 1 ] || [ "$nginx_changed" = 1 ]; then sudo systemctl reload nginx || true; fi
  echo "INSTALL_FAILED exit=$status" >&2
  exit "$status"
}
trap rollback ERR
test -s "$bundle/dist/index.html"
test -s "$bundle/.server-dist/server/runtime.js"
test -s "$bundle/RELEASE_SHA"
test "$(tr -d '\r\n ' < "$bundle/RELEASE_SHA")" = "$expected"
test ! -e "$release"
test ! -e "$api_backup"
test -e "$env_file"
cd "$bundle"
sha256sum -c CHECKSUMS.sha256
previous_frontend="$(readlink -f "$current" || true)"
sudo install -d -m 0755 /var/www/jtw-test-releases
sudo cp -a "$bundle/dist" "$release"
sudo cp "$bundle/RELEASE_SHA" "$bundle/BUILD_SOURCE.txt" "$bundle/CHECKSUMS.sha256" "$release/"
printf '%s\n' "$previous_frontend" | sudo tee "$release/ROLLBACK_FROM" >/dev/null
sudo chown -R root:root "$release"
sudo find "$release" -type d -exec chmod 0755 {} +
sudo find "$release" -type f -exec chmod 0644 {} +
if sudo test -f "$nginx_common"; then sudo cp "$nginx_common" "$nginx_backup"; fi
sudo install -m 0644 "$bundle/weekend-test-common.conf" "$nginx_common"
nginx_changed=1
sudo nginx -t
sudo ln -sfn "$release" "$current"
frontend_switched=1
sudo systemctl reload nginx
sudo cp "$env_file" "$env_backup"
sudo mv "$api_dist" "$api_backup"
sudo cp -a "$bundle/.server-dist" "$api_dist"
sudo chown -R ubuntu:ubuntu "$api_dist"
if sudo grep -q '^JTW_RELEASE_SHA=' "$env_file"; then
  sudo sed -i "s/^JTW_RELEASE_SHA=.*/JTW_RELEASE_SHA=${expected}/" "$env_file"
else
  printf 'JTW_RELEASE_SHA=%s\n' "$expected" | sudo tee -a "$env_file" >/dev/null
fi
api_switched=1
sudo systemctl restart japan-travel-weekend-api.service
for attempt in $(seq 1 15); do
  health="$(curl -fsS http://127.0.0.1:18773/health || true)"
  if printf '%s' "$health" | grep -q '"mode":"test"' && printf '%s' "$health" | grep -q "$expected"; then break; fi
  sleep 2
done
printf '%s' "$health" | grep -q '"mode":"test"'
printf '%s' "$health" | grep -q "$expected"
test "$(readlink -f "$current")" = "$release"
test "$(tr -d '\r\n ' < "$current/RELEASE_SHA")" = "$expected"
curl -fsS https://weekend.japan-travel.info/app >/dev/null
public_health="$(curl -fsS https://weekend.japan-travel.info/api/health)"
printf '%s' "$public_health" | grep -q '"mode":"test"'
printf '%s' "$public_health" | grep -q "$expected"
echo "DEPLOYED=${release_id} PREVIOUS_FRONTEND=${previous_frontend} API_BACKUP=${api_backup}"
'@
  $install = $install.Replace('__RELEASE_ID__', $ReleaseId).Replace('__SHA__', $sha)
  [IO.File]::WriteAllText((Join-Path $bundle 'install-test-release.sh'), ($install.Replace("`r`n", "`n") + "`n"), [Text.UTF8Encoding]::new($false))
  $hashLines = Get-ChildItem -LiteralPath $bundle -Recurse -File | Where-Object { $_.Name -ne 'CHECKSUMS.sha256' } | Sort-Object FullName | ForEach-Object {
    $relative = $_.FullName.Substring($bundle.Length).TrimStart([char]92, [char]47).Replace([char]92, '/')
    "$(Get-Sha256 $_.FullName)  $relative"
  }
  [IO.File]::WriteAllText((Join-Path $bundle 'CHECKSUMS.sha256'), (($hashLines -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
  & tar.exe -czf $archive -C $releaseRoot 'bundle'
  if ($LASTEXITCODE -ne 0) { throw 'tar failed' }
  $archiveHash = Get-Sha256 $archive
  [IO.File]::WriteAllText((Join-Path $releaseRoot 'ARCHIVE_SHA256.txt'), "$archiveHash  $ReleaseId.tar.gz`n", [Text.UTF8Encoding]::new($false))
  Write-Output "RELEASE_ID=$ReleaseId"
  Write-Output "SOURCE_SHA=$sha"
  Write-Output "ARCHIVE=$archive"
  Write-Output "ARCHIVE_SHA256=$archiveHash"
} finally { Pop-Location }
