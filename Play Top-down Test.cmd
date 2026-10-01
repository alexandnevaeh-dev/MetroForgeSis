@echo off
powershell.exe -NoProfile -File "%~dp0scripts\play-test-game.ps1" -Genre topdown
if errorlevel 1 pause
