@echo off
powershell.exe -NoProfile -File "%~dp0scripts\play-test-game.ps1" -Genre metroidvania
if errorlevel 1 pause
