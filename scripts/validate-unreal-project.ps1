param(
  [Parameter(Mandatory=$true)][string]$Project,
  [Parameter(Mandatory=$true)][string]$EngineRoot,
  [Parameter(Mandatory=$true)][string]$BuildToolRuntime,
  [Parameter(Mandatory=$true)][string]$Output
)
$ErrorActionPreference='Stop'
$projectPath=(Resolve-Path -LiteralPath $Project).Path
$enginePath=(Resolve-Path -LiteralPath $EngineRoot).Path
$runtimePath=(Resolve-Path -LiteralPath $BuildToolRuntime).Path
$outputPath=[IO.Path]::GetFullPath($Output)
foreach($path in @($projectPath,$enginePath,$runtimePath,$outputPath)) {
  if([IO.Path]::GetPathRoot($path) -ine 'E:\') { throw 'Unreal project, engine, runtime, and evidence must stay on E:.' }
}
if(Test-Path -LiteralPath $outputPath) { throw 'Choose a fresh evidence directory.' }
$receiptPath=Join-Path (Split-Path $runtimePath -Parent) 'preparation.json'
if(-not(Test-Path -LiteralPath $receiptPath)) { throw 'Use the preserved E:-configured build-tool runtime from prepare-unreal-e-storage.mjs.' }
$receipt=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json
if([IO.Path]::GetFullPath($receipt.engine) -ine (Join-Path $enginePath 'Engine')) { throw 'Build-tool receipt refers to a different engine.' }
$projectFile=Join-Path $projectPath 'MetroForgeGame.uproject'
if(-not(Test-Path -LiteralPath $projectFile)) { throw 'MetroForgeGame.uproject is missing.' }
New-Item -ItemType Directory -Path $outputPath|Out-Null
$toolPath=Join-Path $outputPath 'tool'
Copy-Item -LiteralPath $runtimePath -Destination $toolPath -Recurse
$dotnetRoot=Join-Path $enginePath 'Engine\Binaries\ThirdParty\DotNet\10.0\win-x64'
$dotnet=Join-Path $dotnetRoot 'dotnet.exe'
$sdk=(Get-ChildItem -LiteralPath (Join-Path $dotnetRoot 'sdk') -Directory|Sort-Object Name|Select-Object -Last 1).FullName
$referencePack=(Get-ChildItem -LiteralPath (Join-Path $dotnetRoot 'packs\Microsoft.NETCore.App.Ref') -Directory|Sort-Object Name|Select-Object -Last 1).FullName
$source=Join-Path $toolPath 'MetroForgeBuildHost.cs'
@'
using System;
using System.IO;
using System.Linq;
using System.Reflection;
using EpicGames.Core;
using UnrealBuildBase;

// The public engine-location override lets an isolated UBT retain its original
// engine root without changing installed binaries or creating filesystem links.
public static class MetroForgeBuildHost
{
    public static int Main(string[] args)
    {
        if (args.Length < 2) throw new ArgumentException("Engine root and UBT arguments are required.");
        Unreal.LocationOverride.RootDirectory = new DirectoryReference(args[0]);
        var assembly = Assembly.LoadFrom(Path.Combine(AppContext.BaseDirectory, "UnrealBuildTool.dll"));
        var entry = assembly.GetType("UnrealBuildTool.UnrealBuildTool", true)
            .GetMethod("Main", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
        if (entry == null) throw new MissingMethodException("UnrealBuildTool.Main");
        try { return (int)entry.Invoke(null, new object[] { args.Skip(1).ToArray() }); }
        catch (TargetInvocationException error)
        {
            Console.Error.WriteLine(error.InnerException ?? error);
            return 1;
        }
    }
}
'@ | Set-Content -LiteralPath $source
$assembly=Join-Path $toolPath 'MetroForgeBuildHost.dll'
$rsp=Join-Path $toolPath 'compile.rsp'
$references=@(Get-ChildItem -LiteralPath (Join-Path $referencePack 'ref\net10.0') -Filter '*.dll'|ForEach-Object FullName)
$references+=@(Join-Path $toolPath 'EpicGames.Core.dll'; Join-Path $toolPath 'EpicGames.Build.dll')
$arguments=@('/nologo','/target:exe','/nostdlib+','/langversion:latest',('/out:"'+$assembly+'"'))
$arguments+=@($references|ForEach-Object { '/reference:"'+$_+'"' })
$arguments+='"'+$source+'"'
$arguments|Set-Content -LiteralPath $rsp
$env:TEMP=Join-Path $outputPath 'temp'; $env:TMP=$env:TEMP
$env:APPDATA=Join-Path $outputPath 'appdata'; $env:LOCALAPPDATA=Join-Path $outputPath 'localappdata'
$env:METROFORGE_UBT_SETTINGS=Join-Path $outputPath 'settings'
$env:DOTNET_CLI_HOME=Join-Path $outputPath 'dotnet-home'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE='1'
$env:NUGET_PACKAGES='E:\MetroForgeData\Toolchains\NuGet'
$env:NUGET_HTTP_CACHE_PATH=Join-Path $outputPath 'nuget-http'
foreach($folder in @($env:TEMP,$env:APPDATA,$env:LOCALAPPDATA,$env:METROFORGE_UBT_SETTINGS,$env:DOTNET_CLI_HOME,$env:NUGET_HTTP_CACHE_PATH)) {
  New-Item -ItemType Directory -Path $folder -Force|Out-Null
}
& $dotnet (Join-Path $sdk 'Roslyn\bincore\csc.dll') ('@'+$rsp) *> (Join-Path $outputPath 'host-compile.log')
if($LASTEXITCODE -ne 0) { throw 'Isolated build host failed to compile; inspect host-compile.log.' }
Copy-Item -LiteralPath (Join-Path $toolPath 'UnrealBuildTool.runtimeconfig.json') -Destination (Join-Path $toolPath 'MetroForgeBuildHost.runtimeconfig.json')
Copy-Item -LiteralPath (Join-Path $toolPath 'UnrealBuildTool.deps.json') -Destination (Join-Path $toolPath 'MetroForgeBuildHost.deps.json')
$command=@('"'+$assembly+'"','"'+$enginePath+'"','MetroForgeGameEditor','Win64','Development',
  '"-Project='+$projectFile+'"','-WaitMutex','-NoHotReload','"-Log='+(Join-Path $outputPath 'native-build.log')+'"')
$started=[DateTime]::UtcNow
$process=Start-Process -FilePath $dotnet -ArgumentList $command -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $outputPath 'stdout.log') -RedirectStandardError (Join-Path $outputPath 'stderr.log')
Write-Output "Unreal native compilation PID $($process.Id); evidence $outputPath"
$finished=$process.WaitForExit(900000)
if(-not $finished) { Stop-Process -Id $process.Id -Force; $code=124 } else { $code=$process.ExitCode }
@{exitCode=$code;timedOut=(-not $finished);startedUtc=$started;finishedUtc=[DateTime]::UtcNow;
  engine=$enginePath;project=$projectPath;runtime=$runtimePath;
  scope='Native C++ editor compilation only. Gameplay, capture, and packaging require separate evidence.';
  installedUBTSha256=(Get-FileHash (Join-Path $enginePath 'Engine\Binaries\DotNET\UnrealBuildTool\UnrealBuildTool.dll')).Hash;
  isolatedBuildLibrarySha256=(Get-FileHash (Join-Path $toolPath 'EpicGames.Build.dll')).Hash
}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $outputPath 'result.json')
Write-Output "Unreal native compilation exit=$code"
exit $code
