@echo off
rem BeatOS one-click launcher (Windows). Double-click me.
rem All logic lives in scripts\launcher\start-beatos.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launcher\start-beatos.ps1" %*
if errorlevel 1 pause
