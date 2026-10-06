@echo off
REM Read a UTF-8 prompt file and invoke metroforge create without PowerShell parsing.
REM Usage: scripts\metroforge-create-from-prompt-file.cmd path\to\prompt.txt [create options...]
setlocal EnableExtensions
cd /d "%~dp0.."

if /I not "%CD:~0,2%"=="E:" (
  echo Keep MetroForge on drive E:. Current: %CD%
  exit /b 1
)

call "%~dp0metroforge-env.cmd"
if errorlevel 1 exit /b 1

if "%~1"=="" (
  echo Usage: scripts\metroforge-create-from-prompt-file.cmd path\to\prompt.txt [create options...]
  exit /b 2
)

if not exist "%~1" (
  echo Missing prompt file: %~1
  exit /b 2
)

"%METROFORGE_NODE%" --no-warnings "%~dp0metroforge-create-from-prompt-file.mjs" %*
set "EXITCODE=%ERRORLEVEL%"
exit /b %EXITCODE%
