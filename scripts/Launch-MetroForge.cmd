@echo off
if /I not "%~d0"=="E:" (
  echo Keep this MetroForge build on drive E.
  exit /b 1
)
set "TEMP=%~dp0UserData\temp"
set "TMP=%~dp0UserData\temp"
set "APPDATA=%~dp0UserData\appdata"
set "LOCALAPPDATA=%~dp0UserData\localappdata"
set "METROFORGE_DATA_DIR=%~dp0UserData\data"
set "METROFORGE_GENERATED_GAMES_DIR=%~dp0UserData\games"
for %%D in ("%TEMP%" "%APPDATA%" "%LOCALAPPDATA%" "%METROFORGE_DATA_DIR%" "%METROFORGE_GENERATED_GAMES_DIR%") do if not exist "%%~D" mkdir "%%~D"
start "" "%~dp0MetroForge.exe"
