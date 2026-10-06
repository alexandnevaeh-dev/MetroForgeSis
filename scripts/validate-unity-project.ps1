param(
  [Parameter(Mandatory = $true)][string]$Project,
  [Parameter(Mandatory = $true)][string]$Editor,
  [Parameter(Mandatory = $true)][string]$Output,
  [string]$CertificateBundle = $env:NODE_EXTRA_CA_CERTS,
  [string[]]$Methods = @('MetroForgeAcceptance.CompileOnly', 'MetroForgeAnimationValidation.Run', 'MetroForgeSolidValidation.Run', 'MetroForgeSpriteGridValidation.Run', 'MetroForgeBuild.BuildWindows')
)
$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath $Project).Path
$outputPath = [IO.Path]::GetFullPath($Output)
foreach ($path in @($projectPath, $outputPath)) {
  if ([IO.Path]::GetPathRoot($path) -ine 'E:\') { throw 'Project, caches, and validation outputs must be on E:.' }
}
if (-not (Test-Path -LiteralPath $Editor -PathType Leaf)) { throw 'Unity Editor is missing.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectPath 'ProjectSettings\ProjectVersion.txt'))) { throw 'Not a Unity project.' }
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
$cacheRoot = 'E:\MetroForgeData\UnityCache'
$env:TEMP = 'E:\MetroForgeData\Temp'
$env:TMP = $env:TEMP
$env:UPM_CACHE_ROOT = Join-Path $cacheRoot 'upm'
$env:BEE_CACHE_DIRECTORY = Join-Path $cacheRoot 'bee'
$env:METROFORGE_GAME_SAVE_DIR = Join-Path $outputPath 'saves'
$giCache = Join-Path $cacheRoot 'gi'
foreach ($path in @($env:TEMP, $env:UPM_CACHE_ROOT, $env:BEE_CACHE_DIRECTORY, $env:METROFORGE_GAME_SAVE_DIR, $giCache)) {
  New-Item -ItemType Directory -Path $path -Force | Out-Null
}
if ($CertificateBundle) {
  $env:NODE_EXTRA_CA_CERTS = (Resolve-Path -LiteralPath $CertificateBundle).Path
}
$results = @()
foreach ($method in $Methods) {
  $label = $method.Replace('.', '-')
  $log = Join-Path $outputPath "$label.log"
  if (Test-Path -LiteralPath $log) { throw "Preserve existing evidence by choosing a new output directory: $log" }
  $arguments = @('-batchmode', '-nographics', '-quit', '-projectPath', "`"$projectPath`"", '-executeMethod', $method,
    '-giCacheFolder', "`"$giCache`"", '-logFile', "`"$log`"")
  $started = [DateTime]::UtcNow
  Write-Output "Unity validation starting: $method"
  $process = Start-Process -FilePath $Editor -ArgumentList $arguments -WindowStyle Hidden -PassThru
  Write-Output "Unity process: $($process.Id)"
  $process.WaitForExit()
  $results += @{ method = $method; exitCode = $process.ExitCode; log = $log; startedUtc = $started; finishedUtc = [DateTime]::UtcNow }
  $results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $outputPath 'results.json')
  Write-Output "Unity validation finished: $method exit=$($process.ExitCode)"
  if ($process.ExitCode -ne 0) { exit $process.ExitCode }
}
exit 0
