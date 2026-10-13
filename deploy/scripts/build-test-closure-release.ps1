param(
  [Parameter(Mandatory = $true)][string]$ReleaseId,
  [Parameter(Mandatory = $true)][string]$PublicConfigPath
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$expectedBranch = 'feature/production-app-foundation'
$releaseRoot = Join-Path $env:TEMP $ReleaseId
$bundle = Join-Path $releaseRoot 'bundle'
$archive = Join-Path $releaseRoot "$ReleaseId.tar.gz"
$expectedSupabaseUrl = 'https://hzxoofvodpqpdomtmzlf.supabase.co'
$approvedPublicKeys = @(
  'VITE_RUNTIME_MODE',
  'VITE_API_BASE_URL',
  'VITE_ENABLE_SEED_DATA',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_STRIPE_PUBLISHABLE_KEY',
  'VITE_STRIPE_MODE',
  'VITE_LIVE_PAYMENTS_ENABLED',
  'VITE_GOOGLE_MAPS_BROWSER_KEY'
)

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

function Read-PublicConfig {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "public config not found: $Path" }
  $config = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { continue }
    $name = $matches[1]
    if ($name -notin $approvedPublicKeys) { continue }
    $value = $matches[2].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $config[$name] = $value
  }
  return $config
}

function Require-PublicValue {
  param([hashtable]$Config, [string]$Name)
  if (-not $Config.ContainsKey($Name) -or [string]::IsNullOrWhiteSpace($Config[$Name])) {
    throw "public config is missing $Name"
  }
  return $Config[$Name]
}

if (Test-Path -LiteralPath $releaseRoot) { throw "release directory already exists: $releaseRoot" }
$branch = Get-GitText @('branch', '--show-current')
$sha = Get-GitText @('rev-parse', 'HEAD')
$remoteSha = Get-GitText @('rev-parse', "origin/$expectedBranch")
if ($sha -ne $remoteSha) { throw "HEAD must match origin/$expectedBranch; local=$sha remote=$remoteSha" }
if ((Get-GitText @('status', '--short'))) { throw 'working tree is not clean' }
if ($ReleaseId -notmatch [regex]::Escape($sha.Substring(0, 7))) { throw 'release ID must include the source short SHA' }

$publicConfig = Read-PublicConfig -Path (Resolve-Path -LiteralPath $PublicConfigPath).Path
$runtimeMode = Require-PublicValue -Config $publicConfig -Name 'VITE_RUNTIME_MODE'
$apiBase = Require-PublicValue -Config $publicConfig -Name 'VITE_API_BASE_URL'
$seedEnabled = Require-PublicValue -Config $publicConfig -Name 'VITE_ENABLE_SEED_DATA'
$supabaseUrl = Require-PublicValue -Config $publicConfig -Name 'VITE_SUPABASE_URL'
$null = Require-PublicValue -Config $publicConfig -Name 'VITE_SUPABASE_PUBLISHABLE_KEY'
$stripeMode = Require-PublicValue -Config $publicConfig -Name 'VITE_STRIPE_MODE'
$livePayments = Require-PublicValue -Config $publicConfig -Name 'VITE_LIVE_PAYMENTS_ENABLED'
if ($runtimeMode -ne 'production') { throw 'Test frontend must use VITE_RUNTIME_MODE=production' }
if ($apiBase -ne '/api-test') { throw 'Test frontend must use VITE_API_BASE_URL=/api-test' }
if ($seedEnabled -ne 'false') { throw 'Test frontend must disable seed data' }
if ($supabaseUrl -ne $expectedSupabaseUrl) { throw 'public config does not target the approved Test Supabase project' }
if ($stripeMode -ne 'test') { throw 'Test frontend must use Stripe test mode' }
if ($livePayments -ne 'false') { throw 'Test frontend must disable live payments' }

New-Item -ItemType Directory -Path $bundle -Force | Out-Null
Push-Location $repo
try {
  npm.cmd run typecheck
  $originalEnvironment = @{}
  foreach ($name in $approvedPublicKeys + 'JTW_RELEASE_SHA') {
    $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
  }
  try {
    foreach ($name in $approvedPublicKeys) {
      if ($publicConfig.ContainsKey($name)) { [Environment]::SetEnvironmentVariable($name, $publicConfig[$name], 'Process') }
      else { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
    }
    $env:JTW_RELEASE_SHA = $sha
    npm.cmd run build
  } finally {
    foreach ($name in $originalEnvironment.Keys) {
      [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process')
    }
  }
  npm.cmd run build:server
  & git.exe -c "safe.directory=$repo" diff --check
  if ($LASTEXITCODE -ne 0) { throw 'git diff --check failed' }

  $builtJavascript = (Get-ChildItem -LiteralPath 'dist\assets' -Filter '*.js' -File | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw }) -join "`n"
  if (-not $builtJavascript.Contains($expectedSupabaseUrl)) { throw 'built frontend is missing the approved Test Supabase URL' }
  if (-not $builtJavascript.Contains($publicConfig['VITE_SUPABASE_PUBLISHABLE_KEY'])) { throw 'built frontend is missing the approved Supabase publishable key' }
  if ($builtJavascript -match 'https://[a-z]{20}\.supabase\.co' -and $builtJavascript -match 'https://(?!hzxoofvodpqpdomtmzlf)[a-z]{20}\.supabase\.co') {
    throw 'built frontend contains an unapproved Supabase project URL'
  }
  if ($builtJavascript.Contains('pk_live_')) { throw 'built frontend contains a live Stripe publishable key' }

  Copy-Item -LiteralPath 'dist' -Destination (Join-Path $bundle 'dist') -Recurse
  Copy-Item -LiteralPath '.server-dist' -Destination (Join-Path $bundle '.server-dist') -Recurse
  Copy-Item -LiteralPath 'deploy\nginx\weekend-test-common.conf' -Destination (Join-Path $bundle 'weekend-test-common.conf')
  [IO.File]::WriteAllText((Join-Path $bundle 'RELEASE_SHA'), "$sha`n", [Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText((Join-Path $bundle 'BUILD_SOURCE.txt'), "GitHub branch: $expectedBranch`nGitHub commit: $sha`nWorking tree clean: true`n", [Text.UTF8Encoding]::new($false))
  $publishableKeyHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($publicConfig['VITE_SUPABASE_PUBLISHABLE_KEY']))).ToLowerInvariant()
  $fingerprint = "runtime_mode=$runtimeMode`napi_base=$apiBase`nsupabase_host=hzxoofvodpqpdomtmzlf.supabase.co`nsupabase_publishable_key_sha256=$publishableKeyHash`nstripe_mode=$stripeMode`nlive_payments=$livePayments`nseed_data=$seedEnabled`n"
  [IO.File]::WriteAllText((Join-Path $bundle 'PUBLIC_BUILD_FINGERPRINT.txt'), $fingerprint, [Text.UTF8Encoding]::new($false))

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
test -s "$bundle/PUBLIC_BUILD_FINGERPRINT.txt"
test "$(tr -d '\r\n ' < "$bundle/RELEASE_SHA")" = "$expected"
grep -qx 'supabase_host=hzxoofvodpqpdomtmzlf.supabase.co' "$bundle/PUBLIC_BUILD_FINGERPRINT.txt"
grep -qx 'api_base=/api-test' "$bundle/PUBLIC_BUILD_FINGERPRINT.txt"
grep -qx 'stripe_mode=test' "$bundle/PUBLIC_BUILD_FINGERPRINT.txt"
grep -qx 'live_payments=false' "$bundle/PUBLIC_BUILD_FINGERPRINT.txt"
test ! -e "$release"
test ! -e "$api_backup"
test -e "$env_file"
cd "$bundle"
sha256sum -c CHECKSUMS.sha256
previous_frontend="$(readlink -f "$current" || true)"
sudo install -d -m 0755 /var/www/jtw-test-releases
sudo cp -a "$bundle/dist" "$release"
sudo cp "$bundle/RELEASE_SHA" "$bundle/BUILD_SOURCE.txt" "$bundle/PUBLIC_BUILD_FINGERPRINT.txt" "$bundle/CHECKSUMS.sha256" "$release/"
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
