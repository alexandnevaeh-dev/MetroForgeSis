$nodeHome = 'E:\MetroForgeData\Node\node-v22.19.0-win-x64'
$env:Path = "$nodeHome;" + $env:Path
$env:TEMP = 'E:\MetroForgeData\Temp'
$env:TMP = 'E:\MetroForgeData\Temp'
$env:METROFORGE_DATA_DIR = 'E:\MetroForgeData'
$env:METROFORGE_GODOT_APPDATA = 'E:\MetroForgeData\AppData\Roaming'
$env:METROFORGE_GODOT_LOCALAPPDATA = 'E:\MetroForgeData\AppData\Local'
$env:NODE_OPTIONS = '--max-old-space-size=8192'
$env:NODE_EXTRA_CA_CERTS = 'E:\MetroForgeData\certs\windows-roots.pem'
Set-Location 'E:\Metroforge\MetroForge-Publish'
Get-Content .env | ForEach-Object {
  if ($_ -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$' -and $Matches[1] -notmatch '^(Path|TEMP|TMP|NODE_OPTIONS)$') {
    Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2]
  }
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$log = "E:\Metroforge\MetroForge-Publish\.vitest-run-$stamp.log"
$err = "E:\Metroforge\MetroForge-Publish\.vitest-run-$stamp.exit"
$marker = 'E:\Metroforge\MetroForge-Publish\.vitest-run-latest.txt'
Set-Content -Path $marker -Value "$log`n$err"
node node_modules/vitest/vitest.mjs run --reporter=dot --pool=forks --poolOptions.forks.singleFork=true *> $log
$code = $LASTEXITCODE
Set-Content -Path $err -Value $code -NoNewline
exit $code
