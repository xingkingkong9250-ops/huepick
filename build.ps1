# HuePick · 版本发布脚本
#
# 用法：
#   .\build.ps1 -Mode Prepare    # 完整发布流程：tsc + electron-builder + 输出到 artifacts\staging\
#
# 参考：PianAssistant\build.ps1

[CmdletBinding()]
param(
  [ValidateSet('Prepare')]
  [string]$Mode = 'Prepare'
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

function Get-PackageVersion {
  $pkg = Get-Content 'package.json' -Raw | ConvertFrom-Json
  return $pkg.version
}

function Invoke-Prepare {
  $version = Get-PackageVersion
  Write-Host "[Prepare] HuePick v$version" -ForegroundColor Cyan

  # 1. TypeScript 编译
  Write-Host "[Prepare] 1/3 TypeScript compile"
  npx tsc
  if ($LASTEXITCODE -ne 0) { throw "tsc failed: $LASTEXITCODE" }

  # 2. Electron Builder 打包
  Write-Host "[Prepare] 2/3 electron-builder --win --x64"
  $env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
  npx electron-builder --win --x64
  if ($LASTEXITCODE -ne 0) { throw "electron-builder failed: $LASTEXITCODE" }

  # 3. 拷贝到 artifacts\staging\HuePick_v{version}\
  Write-Host "[Prepare] 3/3 staging output"
  $stageDir = "artifacts\staging\HuePick_v$version"
  if (Test-Path $stageDir) { Remove-Item $stageDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

  # 拷贝便携版
  $unpackedSrc = 'dist\win-unpacked'
  $unpackedDst = "$stageDir\win-unpacked"
  Copy-Item $unpackedSrc $unpackedDst -Recurse -Force
  Write-Host "  → $unpackedDst" -ForegroundColor Gray

  # 拷贝 NSIS 安装包
  $setupFile = Get-ChildItem 'dist' -Filter "*Setup*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($setupFile) {
    Copy-Item $setupFile.FullName "$stageDir\$($setupFile.Name)" -Force
    Write-Host "  → $stageDir\$($setupFile.Name)" -ForegroundColor Gray
  }

  Write-Host "[Prepare] done → $stageDir" -ForegroundColor Green
}

switch ($Mode) {
  'Prepare' { Invoke-Prepare }
  default { throw "Unknown mode: $Mode" }
}
