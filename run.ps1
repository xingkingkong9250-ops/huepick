# HuePick Desktop Launcher (PowerShell 5+)
# 参考 PianAssistant: 关闭旧实例 → 环境检查 → 启动 dist/dev
# 日志：%TEMP%\HuePick.run.log

$ErrorActionPreference = 'Continue'
$LogPath = Join-Path $env:TEMP 'HuePick.run.log'
$ProjectRoot = $PSScriptRoot

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$ts] [$Level] $Message"
    Add-Content -Path $LogPath -Value $line -Encoding UTF8
    if ($Level -eq 'ERROR') { Write-Host $line -ForegroundColor Red }
    elseif ($Level -eq 'WARN') { Write-Host $line -ForegroundColor Yellow }
    else { Write-Host $line -ForegroundColor Gray }
}

Write-Log '=== HuePick Launcher Started ==='
Write-Log "ProjectRoot: $ProjectRoot"

# 1. 关闭已有 HuePick 实例
Write-Log '关闭已有 HuePick 进程...'
$existing = Get-Process -Name 'HuePick' -ErrorAction SilentlyContinue
if ($existing) {
    $existing | Stop-Process -Force
    Write-Log "已关闭 $($existing.Count) 个实例" 'WARN'
    Start-Sleep -Milliseconds 500
}

# 2. 环境检查（Node.js 仅 dev 模式需要）
$hasNode = $false
try {
    $nodeVer = (node --version 2>$null)
    if ($nodeVer -match '^v(\d+)') {
        $major = [int]$Matches[1]
        if ($major -ge 18) { $hasNode = $true; Write-Log "Node.js $nodeVer" }
    }
} catch {
    Write-Log 'Node.js 未找到（仅 dev 模式需要）' 'WARN'
}

# 3. 读取版本号
$version = 'unknown'
try {
    $pkg = Get-Content (Join-Path $ProjectRoot 'package.json') -Raw | ConvertFrom-Json
    $version = $pkg.version
    Write-Log "版本：v$version"
} catch {
    Write-Log '读取 package.json 失败' 'WARN'
}

# 4. 启动：打包版仅在「不比源码旧」时使用，否则回落到 dev 模式保证测到最新代码
$packedExe = Join-Path $ProjectRoot 'dist\win-unpacked\HuePick.exe'
$packedAsar = Join-Path $ProjectRoot 'dist\win-unpacked\resources\app.asar'
$usePacked = (Test-Path $packedExe) -and (Test-Path $packedAsar)

if ($usePacked) {
    $asarTime = (Get-Item $packedAsar).LastWriteTime
    $newerSource = Get-ChildItem @(
        (Join-Path $ProjectRoot 'src'),
        (Join-Path $ProjectRoot 'electron')
    ) -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -gt $asarTime } |
        Select-Object -First 1
    if ($newerSource) {
        $usePacked = $false
        Write-Log "源码（$($newerSource.Name)）比打包版新，改用 dev 模式" 'WARN'
    }
}

if ($usePacked) {
    Write-Log "启动打包版：$packedExe"
    Start-Process -FilePath $packedExe
    Write-Log '已启动打包版' 'OK'
} else {
    Write-Log '未找到打包版，尝试 dev 模式...'
    if (-not $hasNode) {
        Write-Log 'dev 模式需要 Node.js >= 18，但未找到' 'ERROR'
        Write-Host "`n按任意键退出..." -ForegroundColor Yellow
        $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
        exit 1
    }

    # 检查 node_modules
    if (-not (Test-Path (Join-Path $ProjectRoot 'node_modules'))) {
        Write-Log 'node_modules 不存在，执行 npm install...'
        Set-Location $ProjectRoot
        & npm.cmd install --no-audit --no-fund 2>&1 | ForEach-Object { Write-Log $_ }
        if ($LASTEXITCODE -ne 0) {
            Write-Log 'npm install 失败' 'ERROR'
            exit 1
        }
    }

    # 编译 TypeScript
    Write-Log '编译 TypeScript...'
    Set-Location $ProjectRoot
    & npm.cmd run compile 2>&1 | ForEach-Object { Write-Log $_ }
    if ($LASTEXITCODE -ne 0) {
        Write-Log 'TypeScript 编译失败' 'ERROR'
        exit 1
    }

    # 启动 dev 模式
    Write-Log '启动 dev 模式（npx electron .）'
    Start-Process -FilePath 'npx.cmd' -ArgumentList 'electron', '.' -WorkingDirectory $ProjectRoot
    Write-Log '已启动 dev 模式' 'OK'
}

Write-Log '=== Launcher Finished ==='