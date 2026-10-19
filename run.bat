@echo off
REM =========================================
REM HuePick launcher (ASCII-only - cmd-safe)
REM =========================================
REM run.bat               -> interactive menu
REM run.bat check         -> env check
REM run.bat install       -> npm install
REM run.bat compile       -> tsc compile
REM run.bat test          -> unit + e2e tests
REM run.bat package       -> build vsix
REM run.bat all           -> compile + test + package
REM run.bat install-vsix  -> install vsix into editor
REM run.bat dev           -> start F5 dev host

if "%~1"=="" goto interactive
cd /d "%~dp0"
powershell -NoLogo -ExecutionPolicy Bypass -File "%~dp0run.ps1" -Command %*
exit /b %errorlevel%

:interactive
chcp 65001 >nul 2>&1
cd /d "%~dp0"
powershell -NoLogo -ExecutionPolicy Bypass -File "%~dp0run.ps1"
exit /b %errorlevel%