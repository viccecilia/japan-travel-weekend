param(
  [switch]$PrepareOnly,
  [switch]$SkipInstallDependencies
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repo = 'C:\Users\pangv\Documents\Codex\2026-08-21\japan-travel-weekend-production-work\work\japan-travel-weekend'
$expectedBranch = 'feature/production-app-foundation'
$key = Join-Path $env:USERPROFILE '.ssh\tourflow_sakura_vps_ed25519'
$remote = 'ubuntu@133.167.79.170'
$site = 'https://weekend.japan-travel.info'
$runRoot = $null
$transcriptStarted = $false
$exitCode = 0

function Invoke-Checked {
  param([Parameter(Mandatory)][string]$File, [Parameter(Mandatory)][string[]]$Arguments)
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$File failed with exit code $LASTEXITCODE"
  }
}

function Get-GitText {
  param([Parameter(Mandatory)][string[]]$Arguments)
  $value = & git.exe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') failed" }
  return ($value -join "`n").Trim()
}

try {
  Write-Host 'Japan Travel Weekend 测试站一键部署' -ForegroundColor Cyan
  Write-Host '关闭窗口不会回滚已成功完成的发布。部署过程中请保持窗口打开。'

  if (-not (Test-Path -LiteralPath $repo -PathType Container)) { throw "正式工作区不存在：$repo" }
  if (-not (Test-Path -LiteralPath $key -PathType Leaf)) { throw "SSH 密钥不存在：$key" }
  Set-Location -LiteralPath $repo

  $branch = Get-GitText @('branch', '--show-current')
  if ($branch -ne $expectedBranch) { throw "当前分支是 $branch，应为 $expectedBranch。已停止部署。" }

  Invoke-Checked git.exe @('fetch', 'origin', $expectedBranch)
  $sha = Get-GitText @('rev-parse', 'HEAD')
  $remoteSha = Get-GitText @('rev-parse', "origin/$expectedBranch")
  if ($sha -ne $remoteSha) {
    throw "本地 HEAD 与 GitHub 不一致。local=$sha remote=$remoteSha。请先处理提交或同步。"
  }

  $shortSha = $sha.Substring(0, 7)
  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $releaseId = "jtw-manual-$timestamp-$shortSha"
  $runRoot = Join-Path $repo "runtime\one-click-deploy\$releaseId"
  $bundle = Join-Path $runRoot 'bundle'
  $archive = Join-Path $runRoot "$releaseId.tar.gz"
  New-Item -ItemType Directory -Path $bundle -Force | Out-Null
  Start-Transcript -Path (Join-Path $runRoot 'deployment.log') | Out-Null
  $transcriptStarted = $true

  $status = Get-GitText @('status', '--short')
  $trackedChanges = Get-GitText @('diff', '--name-only', 'HEAD', '--', 'src', 'public', 'content-import', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts')
  $sourceStatus = (& git.exe status --short --untracked-files=all -- src public content-import index.html package.json package-lock.json vite.config.ts) -join "`n"
  if ($LASTEXITCODE -ne 0) { throw '无法读取构建来源状态' }

  Write-Host "提交：$sha"
  if ($sourceStatus) {
    Write-Host '本次构建包含未提交源码或素材，发布记录将明确保存这些文件。' -ForegroundColor Yellow
  } else {
    Write-Host '构建相关路径没有未提交修改。'
  }

  if (-not $SkipInstallDependencies) {
    Invoke-Checked npm.cmd @('ci')
  }
  Invoke-Checked npm.cmd @('test')
  $env:JTW_RELEASE_SHA = $sha
  try {
    Invoke-Checked npm.cmd @('run', 'build')
  } finally {
    Remove-Item Env:JTW_RELEASE_SHA -ErrorAction SilentlyContinue
  }
  Invoke-Checked npm.cmd @('run', 'check:content')
  Invoke-Checked npm.cmd @('run', 'check:launch')

  Copy-Item -LiteralPath (Join-Path $repo 'dist') -Destination (Join-Path $bundle 'dist') -Recurse
  [IO.File]::WriteAllText((Join-Path $bundle 'RELEASE_SHA'), "$sha`n", [Text.UTF8Encoding]::new($false))

  $sourceLines = @(
    "GitHub branch: $expectedBranch"
    "GitHub commit: $sha"
    "Build time (Asia/Tokyo): $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
    "Working tree clean: $([string]::IsNullOrWhiteSpace($status))"
    'Build-related uncommitted paths:'
    $(if ($sourceStatus) { $sourceStatus } else { '(none)' })
    'Tracked build-related changes:'
    $(if ($trackedChanges) { $trackedChanges } else { '(none)' })
  )
  [IO.File]::WriteAllText((Join-Path $bundle 'BUILD_SOURCE.txt'), (($sourceLines -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))

  $hashLines = Get-ChildItem (Join-Path $bundle 'dist') -Recurse -File | Sort-Object FullName | ForEach-Object {
    $relative = [IO.Path]::GetRelativePath($bundle, $_.FullName).Replace('\', '/')
    $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $relative"
  }
  [IO.File]::WriteAllText((Join-Path $bundle 'CHECKSUMS.sha256'), (($hashLines -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))

  $install = @"
#!/usr/bin/env bash
set -euo pipefail
switched=0
previous=''
rollback_on_error() {
  status=`$?
  if [ "`$switched" = 1 ] && [ -n "`$previous" ]; then
    sudo ln -sfn "`$previous" /var/www/japan-travel-weekend-test || true
    sudo systemctl reload nginx || true
    echo "ROLLBACK_RESTORED=`$previous" >&2
  fi
  echo "INSTALL_FAILED line=`$LINENO exit=`$status" >&2
  exit "`$status"
}
trap rollback_on_error ERR
bundle=/home/ubuntu/$releaseId/bundle
release=/var/www/jtw-test-releases/$releaseId
current=/var/www/japan-travel-weekend-test
expected=$sha
test -s "`$bundle/dist/index.html"
test -s "`$bundle/dist/sw.js"
test "`$(tr -d '\r\n ' < "`$bundle/RELEASE_SHA")" = "`$expected"
test ! -e "`$release"
if [[ -e "`$current" && ! -L "`$current" ]]; then echo 'refusing non-symlink current' >&2; exit 1; fi
cd "`$bundle"
sha256sum -c CHECKSUMS.sha256
previous="`$(readlink -f "`$current" || true)"
sudo install -d -m 0755 /var/www/jtw-test-releases
sudo cp -a "`$bundle/dist" "`$release"
sudo cp "`$bundle/RELEASE_SHA" "`$bundle/BUILD_SOURCE.txt" "`$bundle/CHECKSUMS.sha256" "`$release/"
printf '%s\n' "`$previous" | sudo tee "`$release/ROLLBACK_FROM" >/dev/null
sudo chown -R root:root "`$release"
sudo find "`$release" -type d -exec chmod 0755 {} +
sudo find "`$release" -type f -exec chmod 0644 {} +
sudo nginx -t
sudo ln -sfn "`$release" "`$current"
switched=1
sudo systemctl reload nginx
test "`$(readlink -f "`$current")" = "`$release"
test "`$(tr -d '\r\n ' < "`$current/RELEASE_SHA")" = "`$expected"
for path in /app /staff /app/operations /app/operations/products; do curl -fsS "https://weekend.japan-travel.info`$path" >/dev/null; done
curl -fsS https://weekend.japan-travel.info/api/health; echo
curl -fsS https://weekend.japan-travel.info/api/ready; echo
switched=0
echo "DEPLOYED=$releaseId ROLLBACK_FROM=`$previous"
"@
  [IO.File]::WriteAllText((Join-Path $bundle 'install.sh'), ($install.Replace("`r`n", "`n") + "`n"), [Text.UTF8Encoding]::new($false))

  Invoke-Checked tar.exe @('-czf', $archive, '-C', $runRoot, 'bundle')
  $archiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText((Join-Path $runRoot 'ARCHIVE_SHA256.txt'), "$archiveHash  $releaseId.tar.gz`n", [Text.UTF8Encoding]::new($false))
  Write-Host "发布包已生成：$archive"
  Write-Host "压缩包 SHA256：$archiveHash"

  if ($PrepareOnly) {
    Write-Host '准备模式完成；没有上传或切换服务器。' -ForegroundColor Green
  } else {
    $remoteArchive = "/home/ubuntu/$releaseId.tar.gz"
    $remoteStage = "/home/ubuntu/$releaseId"
    $remoteRelease = "/var/www/jtw-test-releases/$releaseId"
    Invoke-Checked ssh.exe @('-o', 'BatchMode=yes', '-i', $key, $remote, "bash -lc 'test ! -e $remoteStage; test ! -e $remoteRelease'")
    Invoke-Checked scp.exe @('-i', $key, $archive, "${remote}:$remoteArchive")
    Invoke-Checked ssh.exe @('-i', $key, $remote, "bash -lc 'mkdir $remoteStage; tar -xzf $remoteArchive -C $remoteStage; bash -n $remoteStage/bundle/install.sh; test -s $remoteStage/bundle/dist/index.html; sha256sum $remoteArchive'")

    Write-Host '请输入服务器 sudo 密码以切换发布版本。' -ForegroundColor Yellow
    Invoke-Checked ssh.exe @('-tt', '-i', $key, $remote, "bash -lc 'bash $remoteStage/bundle/install.sh'")

    $remoteResult = & ssh.exe -o BatchMode=yes -i $key $remote "bash -lc 'readlink -f /var/www/japan-travel-weekend-test; cat /var/www/japan-travel-weekend-test/RELEASE_SHA; systemctl is-active nginx; systemctl is-active japan-travel-weekend-api.service'"
    if ($LASTEXITCODE -ne 0) { throw '服务器发布后状态检查失败' }
    $remoteText = $remoteResult -join "`n"
    if ($remoteText -notmatch [regex]::Escape($remoteRelease) -or $remoteText -notmatch [regex]::Escape($sha)) {
      throw "服务器版本核对失败：$remoteText"
    }

    $health = Invoke-RestMethod -Uri "$site/api/health" -TimeoutSec 15
    $ready = Invoke-RestMethod -Uri "$site/api/ready" -TimeoutSec 15
    if (-not $health.ok -or -not $ready.ok -or -not $ready.checks.database -or -not $ready.checks.stripeModeSafe) {
      throw '公网 API 健康检查未通过'
    }
    $app = Invoke-WebRequest -Uri "$site/app/operations/products" -UseBasicParsing -TimeoutSec 15
    $sw = Invoke-WebRequest -Uri "$site/sw.js" -UseBasicParsing -TimeoutSec 15
    if ($app.StatusCode -ne 200 -or $sw.StatusCode -ne 200) { throw '公网前端检查未通过' }
    Write-Host "部署成功：$releaseId" -ForegroundColor Green
    Write-Host "回滚信息：服务器 $remoteRelease/ROLLBACK_FROM"
    Write-Host "验证：Nginx、API、数据库、应用页面和 Service Worker 均正常。"
  }
} catch {
  $exitCode = 1
  Write-Host ''
  Write-Host "部署失败：$($_.Exception.Message)" -ForegroundColor Red
  Write-Host '若失败发生在版本切换前，线上版本没有变化；安装脚本在切换后失败会自动恢复上一版本。'
} finally {
  if ($transcriptStarted) { Stop-Transcript | Out-Null }
  if ($runRoot) { Write-Host "本次日志：$runRoot" }
  Read-Host '按 Enter 关闭窗口'
  exit $exitCode
}
