@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required for this development launcher.
  pause
  exit /b 1
)
node "%~dp0scripts\launch-desktop.mjs"
if errorlevel 1 pause
