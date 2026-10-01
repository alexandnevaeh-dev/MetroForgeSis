param([switch]$IncludePlaythrough)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$engine = 'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe'
if (!(Test-Path -LiteralPath $engine)) { throw 'The E: Godot runtime is missing.' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$output = Join-Path $repo "reports/game-tests/$stamp"
New-Item -ItemType Directory -Path $output -Force | Out-Null
$rows = @()
foreach ($genre in @('topdown', 'metroidvania')) {
  $project = Join-Path $repo "GeneratedGames/test-games/$genre/current"
  $manifest = Get-Content -LiteralPath (Join-Path $project 'GAME_SET.json') -Raw | ConvertFrom-Json
  if ($manifest.genre -ne $genre) { throw "Wrong game set: $genre" }
  $env:TEMP = 'E:/MetroForgeData/Temp'
  $env:TMP = $env:TEMP
  $env:APPDATA = Join-Path $output "$genre/save-data"
  $env:LOCALAPPDATA = Join-Path $output "$genre/local"
  foreach ($folder in @($env:TEMP, $env:APPDATA, $env:LOCALAPPDATA)) {
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
  }
  # Fresh generated projects intentionally exclude .godot caches. Import once so
  # globally named GDScript classes are registered before runtime scenes compile.
  $classCache = Join-Path $project '.godot/global_script_class_cache.cfg'
  if (!(Test-Path -LiteralPath $classCache)) {
    Write-Host "Importing fresh $genre project..."
    $importLog = Join-Path $output "$genre-import.log"
    $importErrors = Join-Path $output "$genre-import-stderr.log"
    $import = Start-Process -FilePath $engine -ArgumentList @('--headless', '--path', ('"' + $project + '"'), '--import') -PassThru -WindowStyle Hidden -RedirectStandardOutput $importLog -RedirectStandardError $importErrors
    $importComplete = $import.WaitForExit(180000)
    if (!$importComplete) { $import.Kill(); $import.WaitForExit() }
    elseif ($importComplete) { $import.WaitForExit() }
    $import.Refresh()
    if (!$importComplete -or $import.ExitCode -ne 0) { throw "Godot import failed for $genre. Inspect $importLog and $importErrors" }
  }
  $checks = @(@{Name='smoke'; Scene='RuntimeSmokeTest'; Marker='SMOKE_TEST_RESULTS_END'})
  if ($IncludePlaythrough) { $checks += @{Name='playthrough'; Scene='PlaytestRunner'; Marker='PLAYTEST_RESULTS_END'} }
  foreach ($check in $checks) {
    Write-Host "Running $genre $($check.Name)..."
    $log = Join-Path $output "$genre-$($check.Name).log"
    $errors = Join-Path $output "$genre-$($check.Name)-stderr.log"
    $args = @('--headless', '--path', ('"' + $project + '"'), "res://scenes/test/$($check.Scene).tscn")
    $process = Start-Process -FilePath $engine -ArgumentList $args -PassThru -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $errors
    $complete = $process.WaitForExit(180000)
    if (!$complete) { $process.Kill(); $process.WaitForExit() }
    elseif ($complete) { $process.WaitForExit() }
    $process.Refresh()
    $text = Get-Content -LiteralPath $log -Raw
    $passed = [regex]::Matches($text, '(?m)^PASS:').Count
    $failed = [regex]::Matches($text, '(?m)^FAIL:').Count
    # Windows PowerShell can lose ExitCode after a redirected console process has
    # fully exited even though WaitForExit returned true. In that case the emitted
    # completion marker and assertion counts are the authoritative test contract.
    $exitCode = if ($null -eq $process.ExitCode -and $complete) { 0 } else { $process.ExitCode }
    $ok = $complete -and $exitCode -eq 0 -and $failed -eq 0 -and $passed -gt 0 -and $text.Contains($check.Marker)
    $status = if ($ok) {'PASS'} else {'FAIL'}
    $rows += [pscustomobject]@{genre=$genre; test=$check.Name; status=$status; passed=$passed; failed=$failed; completed=$complete; exitCode=$exitCode; log=$log; diagnostics=$errors}
    Write-Host "$genre $($check.Name): $status ($passed passed, $failed failed)"
  }
}
$rows | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $output 'results.json') -Encoding utf8
$report = @('# Native game tests', '', 'Gameplay smoke checks use separate game sets and isolated test saves. Visual quality, complete playthroughs, Unity and Unreal builds require separate validation.', '', '| Game | Test | Result | Passed | Failed |', '|---|---|---|---|---|')
foreach ($row in $rows) { $report += "| $($row.genre) | $($row.test) | $($row.status) | $($row.passed) | $($row.failed) |" }
$report += @('', 'Inspect stderr logs for engine warnings and resource cleanup diagnostics even when assertions pass.')
$reportPath = Join-Path $output 'RESULTS.md'
$report | Set-Content -LiteralPath $reportPath -Encoding utf8
Write-Host "Results: $reportPath"
if (@($rows | Where-Object { $_.status -ne 'PASS' }).Count -gt 0) { exit 1 }
