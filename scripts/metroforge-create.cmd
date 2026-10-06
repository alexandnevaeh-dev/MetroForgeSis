@echo off
REM Durable MetroForge create launcher for Windows.
REM - Uses E: Node + Python (never WindowsApps stubs)
REM - Runs via cmd.exe so Node ExperimentalWarning on stderr does NOT become a
REM   PowerShell NativeCommandError / false exit 1
REM - Loads repo .env into the process environment

setlocal EnableExtensions
cd /d "%~dp0.."

if /I not "%CD:~0,2%"=="E:" (
  echo Keep MetroForge on drive E:. Current: %CD%
  exit /b 1
)

call "%~dp0metroforge-env.cmd"
if errorlevel 1 exit /b 1

if "%~1"=="" (
  echo Usage: scripts\metroforge-create.cmd --prompt "..." [create options...]
  echo Example:
  echo   scripts\metroforge-create.cmd --prompt "Ashen foundry side-view VVS" --profile VISUAL_VERTICAL_SLICE --mode HYBRID_FREE --engine godot --hardware-profile HIGH_QUALITY --asset-generation-backend foundry-with-legacy-fallback --visual-mode auto --slug vvs-godot-foundry-hq
  exit /b 2
)

REM --no-warnings suppresses ExperimentalWarning (SQLite etc.) so hosts that
REM treat stderr as failure do not flip exit codes.
"%METROFORGE_NODE%" --no-warnings apps\cli\dist\index.js create %*
set "EXITCODE=%ERRORLEVEL%"
exit /b %EXITCODE%
