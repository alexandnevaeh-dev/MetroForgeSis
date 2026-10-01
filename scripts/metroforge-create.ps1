# MetroForge create from PowerShell without false failures
#
# PowerShell treats Node writing ExperimentalWarning to stderr as NativeCommandError
# when $ErrorActionPreference is Stop / Continue with redirection quirks. Prefer the
# cmd wrapper (scripts/metroforge-create.cmd). This script mirrors that path.
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CreateArgs
)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$envCmd = Join-Path $PSScriptRoot 'metroforge-env.cmd'
$createCmd = Join-Path $PSScriptRoot 'metroforge-create.cmd'
if (-not (Test-Path $createCmd)) { throw "Missing $createCmd" }

# Delegate entirely to cmd so stderr warnings do not become terminating errors.
$argLine = ($CreateArgs | ForEach-Object {
  if ($_ -match '\s') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
}) -join ' '

cmd.exe /c "`"$createCmd`" $argLine"
exit $LASTEXITCODE
