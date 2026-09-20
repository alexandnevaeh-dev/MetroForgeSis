param(
  [Parameter(Mandatory = $true)][string]$UnityProject,
  [Parameter(Mandatory = $true)][string]$UnrealProject,
  [string]$UnityEditor = $env:UNITY_EDITOR,
  [string]$UnrealRoot = $env:UE_ROOT,
  [string]$StorageRoot = 'E:\Metroforge\Recovery-Audit\native-validation'
)
$ErrorActionPreference = 'Stop'
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$storagePath = [IO.Path]::GetFullPath($StorageRoot)
if ([IO.Path]::GetPathRoot($storagePath) -ine 'E:\') {
  throw 'Native validation storage must be on E: for this workspace.'
}
foreach ($projectPath in @($UnityProject, $UnrealProject)) {
  $resolvedProject = (Resolve-Path -LiteralPath $projectPath).Path
  if ([IO.Path]::GetPathRoot($resolvedProject) -ine 'E:\') {
    throw 'Test projects must be on E: because editors create project-local caches and build outputs.'
  }
}
$runPath = Join-Path $storagePath ([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
$paths = @{
  TEMP = (Join-Path $storagePath 'temp')
  TMP = (Join-Path $storagePath 'temp')
  APPDATA = (Join-Path $storagePath 'appdata\roaming')
  LOCALAPPDATA = (Join-Path $storagePath 'appdata\local')
  UPM_CACHE_ROOT = (Join-Path $storagePath 'cache\unity-upm')
  BEE_CACHE_DIRECTORY = (Join-Path $storagePath 'cache\unity-bee')
  'UE-LocalDataCachePath' = (Join-Path $storagePath 'cache\unreal-ddc')
  'UE-ZenDataPath' = (Join-Path $storagePath 'cache\unreal-zen')
  METROFORGE_ENGINE_REPORT_DIR = $runPath
}
foreach ($entry in $paths.GetEnumerator()) {
  New-Item -ItemType Directory -Path $entry.Value -Force | Out-Null
  Set-Item -LiteralPath "Env:$($entry.Key)" -Value $entry.Value
}
$env:METROFORGE_UNITY_TEST_PROJECT = (Resolve-Path -LiteralPath $UnityProject).Path
$env:METROFORGE_UNREAL_TEST_PROJECT = (Resolve-Path -LiteralPath $UnrealProject).Path
if ($UnityEditor) { $env:UNITY_EDITOR = $UnityEditor }
if ($UnrealRoot) { $env:UE_ROOT = $UnrealRoot }
@{
  unityProject = $env:METROFORGE_UNITY_TEST_PROJECT
  unrealProject = $env:METROFORGE_UNREAL_TEST_PROJECT
  cachePaths = $paths
  note = 'Native compile/play/build remain unverified unless the acceptance report proves them.'
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runPath 'validation-inputs.json')
Push-Location $repositoryRoot
try {
  & node (Join-Path $PSScriptRoot 'engine-acceptance.mjs')
  $validationExit = $LASTEXITCODE
} finally { Pop-Location }
Write-Output "Native engine report directory: $runPath"
exit $validationExit
