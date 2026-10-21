@echo off
REM HuePick Desktop Launcher — 极简入口
REM 参考 PianAssistant: wscript 静默启动 → run.ps1
wscript.exe //B "%~dp0run-hidden.vbs"
exit /b 0
