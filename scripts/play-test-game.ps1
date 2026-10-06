param([Parameter(Mandatory=$true)][ValidateSet('topdown','metroidvania')][string]$Genre)
$ErrorActionPreference='Stop'
$repositoryRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$project=Join-Path $repositoryRoot "GeneratedGames/test-games/$Genre/current"
$godot=if($env:GODOT_EXECUTABLE){$env:GODOT_EXECUTABLE}else{'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64.exe'}
if(!(Test-Path -LiteralPath (Join-Path $project 'GAME_SET.json'))){throw 'Refresh this test-game set first.'}
$manifest=Get-Content -LiteralPath (Join-Path $project 'GAME_SET.json') -Raw | ConvertFrom-Json
if($manifest.genre -ne $Genre){throw 'Test-game genre mismatch.'}
if(!(Test-Path -LiteralPath $godot)){throw 'Set GODOT_EXECUTABLE to the installed Godot binary.'}
$storageRoot="E:/MetroForgeData/AppData/TestGames/$Genre"
foreach($entry in @{TEMP="E:/MetroForgeData/Temp";TMP="E:/MetroForgeData/Temp";APPDATA="$storageRoot/roaming";LOCALAPPDATA="$storageRoot/local"}.GetEnumerator()){
 New-Item -ItemType Directory -Path $entry.Value -Force | Out-Null
 Set-Item -LiteralPath "Env:$($entry.Key)" -Value $entry.Value
}
& $godot --path $project
