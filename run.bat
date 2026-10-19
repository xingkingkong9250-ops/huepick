@echo off
REM =========================================
REM HuePick Desktop Launcher - ASCII only
REM =========================================
REM Priority: packed exe -> dev mode (background, no console window)
REM For final release run "npm run dist" to refresh the exe
cd /d "%~dp0"

REM 1. 打包产物存在则直接启动（GUI exe，不弹命令行窗口）
set "PACKED=%~dp0dist\win-unpacked\HuePick.exe"
if exist "%PACKED%" (
    start "" "%PACKED%"
    exit /b 0
)

REM 2. 开发模式：先编译再后台启动
where node >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Node.js not installed
    pause
    exit /b 1
)
if not exist "node_modules" (
    echo [HuePick] Installing dependencies...
    call npm install
    if errorlevel 1 ( echo [FAIL] npm install failed & pause & exit /b 1 )
)
call npm run compile
if errorlevel 1 ( echo [FAIL] TypeScript compile failed & pause & exit /b 1 )

REM 后台启动 Electron，bat 立即退出，不占住命令行窗口
start "" cmd /c "npx electron ."