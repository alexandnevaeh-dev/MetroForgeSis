@echo off
call "%~dp0metroforge-env.cmd"
if errorlevel 1 exit /b 1
echo NODE=%METROFORGE_NODE%
echo PY=%DIFFUSERS_PYTHON%
"%METROFORGE_NODE%" -v
"%DIFFUSERS_PYTHON%" -c "print('py-ok')"
