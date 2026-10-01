@echo off
REM Shared MetroForge Windows toolchain env (E:-only). Safe to call from other .cmd scripts.
REM Repo .env is loaded by Node (@metroforge/shared loadDotenv) — do not parse it here
REM (API key characters break cmd.exe for /f).

if not defined METROFORGE_DATA_DIR set "METROFORGE_DATA_DIR=E:\MetroForgeData"
set "METROFORGE_NODE=%METROFORGE_DATA_DIR%\Node\node-v22.19.0-win-x64\node.exe"
if not defined METROFORGE_PYTHON set "METROFORGE_PYTHON=%METROFORGE_DATA_DIR%\Python\diffusers-native\Scripts\python.exe"
if not defined DIFFUSERS_PYTHON set "DIFFUSERS_PYTHON=%METROFORGE_PYTHON%"

if not exist "%METROFORGE_NODE%" (
  echo Missing Node: %METROFORGE_NODE%
  exit /b 1
)
if not exist "%DIFFUSERS_PYTHON%" (
  echo Missing Python: %DIFFUSERS_PYTHON%
  echo Expected physical E: runtime at %METROFORGE_DATA_DIR%\Python\diffusers-native
  echo Disable App execution aliases for python.exe/python3.exe if PATH hits WindowsApps.
  exit /b 1
)

set "TEMP=%METROFORGE_DATA_DIR%\Temp"
set "TMP=%METROFORGE_DATA_DIR%\Temp"
set "PATH=%METROFORGE_DATA_DIR%\Node\node-v22.19.0-win-x64;%METROFORGE_DATA_DIR%\Python\diffusers-native\Scripts;%PATH%"
set "HF_HOME=%METROFORGE_DATA_DIR%\HuggingFace"
set "TORCH_HOME=%METROFORGE_DATA_DIR%\Torch"
set "PIP_CACHE_DIR=%METROFORGE_DATA_DIR%\PipCache"
set "CUDA_CACHE_PATH=%METROFORGE_DATA_DIR%\CudaCache"
if not defined NODE_OPTIONS set "NODE_OPTIONS=--max-old-space-size=8192"
exit /b 0
