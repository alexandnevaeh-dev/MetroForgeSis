@echo off
if /I not "%~d0"=="E:" exit /b 1
set "APPDATA=%~dp0UserData\appdata"
set "LOCALAPPDATA=%~dp0UserData\localappdata"
set "TEMP=%~dp0UserData\temp"
set "TMP=%TEMP%"
for %%D in ("%APPDATA%" "%LOCALAPPDATA%" "%TEMP%") do if not exist "%%~D" mkdir "%%~D"
start "" "%~dp0UserData\games\quantum-ui-expedition\build\windows\game.exe"
