@echo off
REM =========================================
REM HuePick Desktop Launcher - ASCII only
REM =========================================
REM Priority: packed exe -> dev mode
cd /d "%~dp0"

REM 1. Start GUI exe if packed build exists
set "PACKED=%~dp0dist\win-unpacked\HuePick.exe"
if exist "%PACKED%" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%PACKED%'"
    exit /b 0
)

REM 2. Dev mode: compile then launch
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

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npx electron .' -WorkingDirectory '%cd%'"