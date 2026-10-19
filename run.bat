@echo off
REM =========================================
REM HuePick Desktop Launcher - ASCII only
REM =========================================
REM Always runs dev mode from source (no stale exe)
REM For final release run "npm run dist" then use dist\win-unpacked\HuePick.exe
cd /d "%~dp0"

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
start "" npx electron .