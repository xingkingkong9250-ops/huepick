@echo off
REM =========================================
REM HuePick Desktop Launcher - ASCII only
REM =========================================
REM Prefer packed exe; fallback to npm run dev
cd /d "%~dp0"

set "PACKED=%~dp0dist\win-unpacked\HuePick.exe"
if exist "%PACKED%" (
    start "" "%PACKED%"
    exit /b 0
)

REM Fallback: dev mode
echo [HuePick] Packed exe not found, starting dev mode...
where node >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Node.js not installed
    pause
    exit /b 1
)
if not exist "node_modules" (
    echo [HuePick] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [FAIL] npm install failed
        pause
        exit /b 1
    )
)
call npm run compile
if errorlevel 1 (
    echo [FAIL] TypeScript compile failed
    pause
    exit /b 1
)
start "" npx electron .