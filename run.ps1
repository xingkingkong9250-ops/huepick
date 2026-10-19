# 拾色 HuePick — 开发/测试/打包启动器（Windows PowerShell 5+）
# 运行：右键 → 使用 PowerShell 运行；或 ./run.ps1
# 依赖：node >= 18、npm >= 9（已在下方自检）

[CmdletBinding()]
param(
    [ValidateSet('check', 'install', 'compile', 'test', 'package', 'all', 'install-vsix', 'dev')]
    [string]$Command,
    # 安装 vsix 时自动查找第一个编辑器（Trae > VS Code）
    [switch]$UseTrae
)

$ErrorActionPreference = 'Stop'

# ---------- 路径 ----------
$ProjectRoot = $PSScriptRoot
$VsixPath    = Join-Path $ProjectRoot 'huepick-0.5.0.vsix'
$LogDir      = Join-Path $ProjectRoot '.logs'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

# ---------- 控制台样式 ----------
function Write-Title   ([string]$s) { Write-Host "`n=== $s ===" -ForegroundColor Cyan }
function Write-Step    ([string]$s) { Write-Host "  ▶ $s"     -ForegroundColor Yellow }
function Write-OK      ([string]$s) { Write-Host "    ✓ $s"   -ForegroundColor Green }
function Write-Fail    ([string]$s) { Write-Host "    ✗ $s"   -ForegroundColor Red    }
function Write-Info    ([string]$s) { Write-Host "    ℹ $s"   -ForegroundColor Gray   }

function Invoke-Step {
    param(
        [string]$Title,
        [scriptblock]$Body,
        [scriptblock]$OnError
    )
    Write-Title $Title
    Push-Location $ProjectRoot
    try {
        & $Body
        Write-OK '通过'
        return $true
    } catch {
        Write-Fail ($_.Exception.Message)
        if ($OnError) { & $OnError }
        return $false
    } finally {
        Pop-Location
    }
}

# ---------- 步骤 0：环境自检 ----------
function Test-Environment {
    Write-Title '0/6 环境自检'
    $ok = $true

    # node
    try {
        $nv = (node --version)
        Write-OK "node $nv"
        $major = [int]($nv -replace '^v','' -split '\.')[0]
        if ($major -lt 18) { Write-Fail 'node 版本需 >= 18'; $ok = $false }
    } catch { Write-Fail 'node 未找到'; $ok = $false }

    # npm
    try { Write-OK ("npm " + (npm.cmd --version)) }
    catch { Write-Fail 'npm 未找到'; $ok = $false }

    # npx
    try { Write-OK ("npx " + (npx.cmd --version)) }
    catch { Write-Fail 'npx 未找到'; $ok = $false }

    # node_modules
    if (Test-Path (Join-Path $ProjectRoot 'node_modules')) { Write-OK 'node_modules 存在' }
    else { Write-Info 'node_modules 不存在，将在首次运行时安装' }

    # vsix
    if (Test-Path $VsixPath) { Write-OK ("vsix 产物已就绪 (" + (Get-Item $VsixPath).Length.ToString() + ' bytes)') }
    else { Write-Info '尚未打包 vsix' }

    return $ok
}

# ---------- 步骤 1：安装依赖 ----------
function Install-Dependencies {
    Write-Title '1/6 安装依赖'
    & npm.cmd install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm install 退出码 $LASTEXITCODE" }
}

# ---------- 步骤 2：编译 ----------
function Invoke-Compile {
    Write-Title '2/6 TypeScript 编译'
    & npm.cmd run compile
    if ($LASTEXITCODE -ne 0) { throw "tsc 退出码 $LASTEXITCODE" }
    $src = (Get-ChildItem (Join-Path $ProjectRoot 'src') -Recurse -File).Count
    $out = (Get-ChildItem (Join-Path $ProjectRoot 'out') -Recurse -File).Count
    Write-Info ("src {0} 文件 → out {1} 文件" -f $src, $out)
}

# ---------- 步骤 3：单元 + 端到端测试 ----------
function Invoke-Test {
    Write-Title '3/6 单元 + 端到端测试'
    # 直接跑 node --test，避免 npm test 里先 compile 再 test（已在步骤 2 编译过）
    & node --test "out/test/**/*.test.js" 2>&1 | Tee-Object -FilePath (Join-Path $LogDir "test_$(Get-Date -Format 'yyyyMMdd_HHmmss').log")
    if ($LASTEXITCODE -ne 0) { throw "node --test 退出码 $LASTEXITCODE" }
}

# ---------- 步骤 4：打包 vsix ----------
function Invoke-Package {
    Write-Title '4/6 打包 vsix'
    Remove-Item $VsixPath -ErrorAction SilentlyContinue
    & npm.cmd run package
    if ($LASTEXITCODE -ne 0) { throw "vsce package 退出码 $LASTEXITCODE" }

    if (-not (Test-Path $VsixPath)) {
        # vsce 可能改了产物名，搜索 huepick-*.vsix
        $alt = Get-ChildItem (Join-Path $ProjectRoot 'huepick-*.vsix') -ErrorAction SilentlyContinue
        if ($alt) { Rename-Item $alt.FullName $VsixPath }
        else { throw '未找到 vsix 产物' }
    }
    $sizeMB = [math]::Round((Get-Item $VsixPath).Length / 1MB, 2)
    Write-OK ("huepick-0.5.0.vsix — {0} MB" -f $sizeMB)
}

# ---------- 步骤 5：安装 vsix 到编辑器 ----------
function Install-Vsix {
    param([string]$Editor)
    Write-Title '5/6 安装 vsix'

    if (-not (Test-Path $VsixPath)) {
        Invoke-Package
    }

    $candidates = @(
        'C:\Users\' + $env:USERNAME + '\AppData\Local\Programs\Trae\Trae.exe',
        'C:\Users\' + $env:USERNAME + '\AppData\Local\Programs\Microsoft VS Code\Code.exe',
        'C:\Program Files\Microsoft VS Code\Code.exe'
    )
    if ($Editor) { $candidates = @($Editor) }

    $installed = $null
    foreach ($p in $candidates) {
        if (Test-Path $p) { $installed = $p; break }
    }
    if (-not $installed) {
        Write-Fail '未找到 Trae / VS Code 可执行文件'
        Write-Info '请在编辑器命令面板中手动执行 "Extensions: Install from VSIX…"'
        Write-Info ("产物路径：$VsixPath")
        return $false
    }

    Write-Info ("目标编辑器：$installed")
    & $installed --install-extension $VsixPath --force
    if ($LASTEXITCODE -ne 0) { Write-Fail '安装可能失败（部分编辑器对此退出码不报零）' }
    else { Write-OK '安装完成' }
    return $true
}

# ---------- 步骤 6：启动开发宿主（F5 等价） ----------
function Start-DevHost {
    Write-Title '6/6 启动开发宿主'

    # 找 Code CLI（Trae 通常也兼容）
    $code = $null
    foreach ($c in @('trae','code')) {
        try { $null = Get-Command $c -ErrorAction Stop; $code = $c; break } catch {}
    }
    if (-not $code) {
        Write-Fail '未找到 trae / code CLI，无法启动开发宿主'
        Write-Info '请手动在编辑器中打开项目目录并按 F5'
        return $false
    }

    Write-Info ('正在启动开发宿主… 主窗口关闭后即停止。')
    & $code --extensionDevelopmentPath $ProjectRoot (Join-Path $ProjectRoot 'media')
    return $true
}

# ---------- 菜单 ----------
function Show-Menu {
    Write-Host @"

  ┌───────────────────────────────────────────────────────┐
  │           拾色 HuePick  v0.5.0  启动器                 │
  ├───────────────────────────────────────────────────────┤
  │   1  环境自检                                          │
  │   2  安装依赖                                          │
  │   3  编译 TypeScript                                  │
  │   4  运行单元 + 端到端测试                            │
  │   5  打包 vsix                                        │
  │   6  安装 vsix 到 Trae / VS Code                       │
  │   7  启动开发宿主（F5 等价）                           │
  │                                                        │
  │   a  完整流程：编译 → 测试 → 打包                      │
  │   b  编译 → 测试 → 打包 → 安装                         │
  │                                                        │
  │   0  退出                                              │
  └───────────────────────────────────────────────────────┘

"@ -ForegroundColor Cyan
}

function Invoke-Menu {
    param([string]$Choice)
    switch ($Choice) {
        '1' { Test-Environment | Out-Null }
        '2' { Invoke-Step '安装依赖' { Install-Dependencies } }
        '3' { Invoke-Step '编译' { Invoke-Compile } }
        '4' { Invoke-Step '测试'  { Invoke-Test  } }
        '5' { Invoke-Step '打包'  { Invoke-Package } }
        '6' { Install-Vsix }
        '7' { Start-DevHost }
        'a' {
            Invoke-Step '编译' { Invoke-Compile } | Out-Null
            Invoke-Step '测试' { Invoke-Test   } | Out-Null
            Invoke-Step '打包' { Invoke-Package } | Out-Null
        }
        'b' {
            Invoke-Step '编译' { Invoke-Compile } | Out-Null
            Invoke-Step '测试' { Invoke-Test   } | Out-Null
            Invoke-Step '打包' { Invoke-Package } | Out-Null
            Install-Vsix | Out-Null
        }
        '0' { Write-Host '再见' -ForegroundColor Gray; return $false }
        default { Write-Host '无效选项' -ForegroundColor Red }
    }
    return $true
}

# ---------- 入口 ----------
Write-Host "`nHuePick v0.5.0 启动器" -ForegroundColor Green
Write-Host "项目根：$ProjectRoot" -ForegroundColor Gray

if ($Command) {
    $map = @{
        'check'       = { Test-Environment | Out-Null }
        'install'     = { Invoke-Step '安装依赖' { Install-Dependencies } | Out-Null }
        'compile'     = { Invoke-Step '编译'     { Invoke-Compile     } | Out-Null }
        'test'        = { Invoke-Step '测试'     { Invoke-Test        } | Out-Null }
        'package'     = { Invoke-Step '打包'     { Invoke-Package     } | Out-Null }
        'all'         = { & { Invoke-Menu -Choice 'a' } }
        'install-vsix'= { Install-Vsix }
        'dev'         = { Start-DevHost }
    }
    if ($map.ContainsKey($Command)) { & $map[$Command] }
    else { Write-Fail "未知命令：$Command" }
    return
}

# 交互式循环
while ($true) {
    Show-Menu
    $choice = Read-Host '请选择'
    if (-not (Invoke-Menu -Choice $choice)) { break }
    Write-Host "`n按 Enter 继续…" -ForegroundColor Gray
    Read-Host | Out-Null
}
