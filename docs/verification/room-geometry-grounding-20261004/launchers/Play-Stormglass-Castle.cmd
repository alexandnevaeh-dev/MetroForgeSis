@echo off
if /I not "%~d0"=="E:" exit /b 1
set "APPDATA=%~dp0UserData\appdata"
set "LOCALAPPDATA=%~dp0UserData\localappdata"
set "TEMP=%~dp0UserData\temp"
set "TMP=%TEMP%"
for %%D in ("%APPDATA%" "%LOCALAPPDATA%" "%TEMP%") do if not exist "%%~D" mkdir "%%~D"
set "GODOT_EXECUTABLE=E:\MetroForgeData\Godot\4.6\Godot_v4.6-stable_win64_console.exe"
"%GODOT_EXECUTABLE%" --headless --path "%~dp0UserData\games\stormglass-castle" --editor --import --quit
if errorlevel 1 exit /b 1
start "" "%GODOT_EXECUTABLE%" --path "%~dp0UserData\games\stormglass-castle" --rendering-driver opengl3
