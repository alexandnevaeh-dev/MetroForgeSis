param([Parameter(Mandatory=$true)][string]$Project, [string]$Output)
$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath $Project).Path
if ([IO.Path]::GetPathRoot($projectPath) -ine 'E:\') { throw 'Validation project must be on E:.' }
$output = if ($Output) { [IO.Path]::GetFullPath($Output) } else { Join-Path $projectPath 'qa/terrain-material' }
if ([IO.Path]::GetPathRoot($output) -ine 'E:\') { throw 'Validation output must be on E:.' }
New-Item -ItemType Directory -Path $output -Force | Out-Null
$log = Join-Path $output 'editor.log'
if (Test-Path -LiteralPath $log) { throw 'Preserve existing review evidence; use a fresh fixture.' }
$env:TEMP='E:\MetroForgeData\Temp'
$env:TMP=$env:TEMP
$env:UPM_CACHE_ROOT='E:\MetroForgeData\UnityCache\upm'
$env:BEE_CACHE_DIRECTORY='E:\MetroForgeData\UnityCache\bee'
$env:METROFORGE_GAME_SAVE_DIR=Join-Path $output 'saves'
$env:METROFORGE_TERRAIN_REVIEW_DIR=$output
New-Item -ItemType Directory -Path $env:METROFORGE_GAME_SAVE_DIR -Force | Out-Null
$arguments=@('-batchmode','-projectPath',('"'+$projectPath+'"'),'-executeMethod','TerrainMaterialReview.Run',
  '-giCacheFolder','E:\MetroForgeData\UnityCache\gi','-logFile',('"'+$log+'"'))
$process=Start-Process -FilePath 'E:\Metroforge\Programs\Editor\Unity.exe' -ArgumentList $arguments -WindowStyle Hidden -PassThru
Write-Output "Native terrain review PID $($process.Id); log $log"
if (-not $process.WaitForExit(600000)) {
  Stop-Process -Id $process.Id -Force
  throw 'Owned terrain review exceeded its ten-minute import/runtime deadline.'
}
Write-Output "Native terrain review exit $($process.ExitCode)"
exit $process.ExitCode
