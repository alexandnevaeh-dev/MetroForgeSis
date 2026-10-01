@echo off
set "TEMP=E:\MetroForgeData\Temp"
set "TMP=%TEMP%"
set "APPDATA=E:\MetroForgeData\AppData\QuantumGodot"
set "LOCALAPPDATA=E:\MetroForgeData\AppData\QuantumGodotLocal"
"E:\MetroForgeData\Godot\4.6\Godot_v4.6-stable_win64.exe" --path "%~dp0" res://scenes/WorldPlayground.tscn
