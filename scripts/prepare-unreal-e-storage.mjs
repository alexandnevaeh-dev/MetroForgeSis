/** Prepare an isolated UBT runtime with E:-resident installed-engine settings.
 * The installed engine is unchanged. Epic's private build-library source stays
 * local; only this preparation script is suitable for repository publication.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
const engine=resolve(process.argv[2]||'E:/Metroforge/unreal/UE_5.8/Engine');
const output=resolve(process.argv[3]||'E:/MetroForgeData/Toolchains/UBT-E-20261003');
assert.match(engine,/^E:[/\\]/i);assert.match(output,/^E:[/\\]/i);
assert.ok(!existsSync(output),'Preserve existing isolated runtime');
const original=join(engine,'Binaries/DotNET/UnrealBuildTool');
const source=join(engine,'Source/Programs/Shared/EpicGames.Build');
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const version=JSON.parse(readFileSync(join(engine,'Build/Build.version'),'utf8'));
assert.equal(version.MajorVersion,5);assert.equal(version.MinorVersion,8);
mkdirSync(output,{recursive:true});
cpSync(original,join(output,'runtime'),{recursive:true});
const project=join(output,'build-library');mkdirSync(project);
const inputs=[];
function copyCs(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
 const path=join(dir,entry.name);
 if(entry.isDirectory()&&!['obj','bin'].includes(entry.name))copyCs(path);
 else if(entry.isFile()&&entry.name.endsWith('.cs')){
  const target=join(project,relative(source,path));mkdirSync(resolve(target,'..'),{recursive:true});
  cpSync(path,target);inputs.push({path:relative(engine,path).replaceAll('\\','/'),sha256:sha(path)});
 }
}}
copyCs(source);
cpSync(join(engine,'Source/Programs/Shared/MetaData.cs'),join(project,'MetaData.cs'));
const unreal=join(project,'Unreal.cs');const before=readFileSync(unreal,'utf8');
const anchor='private static DirectoryReference GetUserSettingDirectory()\n\t\t{';
const normalized=before.replaceAll('\r\n','\n');assert.equal(normalized.split(anchor).length,2);
const after=normalized.replace(anchor,anchor+`\n            // MetroForge local build integration: never write installed-engine caches on C:.\n            string? metroforgeSettings = Environment.GetEnvironmentVariable("METROFORGE_UBT_SETTINGS");\n            if (!String.IsNullOrWhiteSpace(metroforgeSettings))\n            {\n                string settings = Path.GetFullPath(metroforgeSettings);\n                if (!OperatingSystem.IsWindows() || !settings.StartsWith("E:\\\\", StringComparison.OrdinalIgnoreCase))\n                    throw new InvalidOperationException("MetroForge UBT settings must be on E:");\n                return new DirectoryReference(settings);\n            }\n`);
writeFileSync(unreal,after);
const dotnet=join(engine,'Binaries/ThirdParty/DotNet/10.0/win-x64');
const sdk=join(dotnet,'sdk',readdirSync(join(dotnet,'sdk')).sort().at(-1));
const references=[...readdirSync(original).filter(name=>/^(EpicGames\.|Microsoft\.Extensions\.).*\.dll$/.test(name)&&name!=='EpicGames.Build.dll').map(name=>join(original,name)),...['Microsoft.Build.dll','Microsoft.Build.Framework.dll','Microsoft.Build.Utilities.Core.dll','Microsoft.Build.Tasks.Core.dll'].map(name=>join(sdk,name))];
for(const path of references)assert.ok(existsSync(path),path);
writeFileSync(join(project,'EpicGames.Build.csproj'),`<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><AssemblyName>EpicGames.Build</AssemblyName><RootNamespace>UnrealBuildBase</RootNamespace><AllowUnsafeBlocks>true</AllowUnsafeBlocks><Nullable>enable</Nullable><GenerateAssemblyInfo>false</GenerateAssemblyInfo><GenerateTargetFrameworkAttribute>false</GenerateTargetFrameworkAttribute></PropertyGroup><ItemGroup>${references.map(path=>`<Reference Include="${path.replaceAll('\\','/')}" />`).join('')}</ItemGroup></Project>`);
writeFileSync(join(project,'NuGet.Config'),'<configuration><packageSources><clear /></packageSources></configuration>');
// Compile against the bundled reference pack directly. A framework-only library
// needs no NuGet restore, user-profile config creation or network dependency.
const refVersions=join(dotnet,'packs/Microsoft.NETCore.App.Ref');
const refRoot=join(refVersions,readdirSync(refVersions).sort().at(-1),'ref/net10.0');
const frameworkReferences=readdirSync(refRoot).filter(name=>name.endsWith('.dll')).map(name=>join(refRoot,name));
const sourcePaths=inputs.map(input=>join(project,input.path.replace('Source/Programs/Shared/EpicGames.Build/','')));
sourcePaths.push(join(project,'MetaData.cs'));
writeFileSync(join(project,'compile.rsp'),['/nologo','/target:library','/nostdlib+','/unsafe+','/nullable:enable','/langversion:latest',`/out:"${join(project,'EpicGames.Build.dll')}"`,...[...references,...frameworkReferences].map(path=>`/reference:"${path}"`),...sourcePaths.map(path=>`"${path}"`)].join('\n'));
const receipt={engine,output,version,inputs,installedBuildLibrarySha256:sha(join(original,'EpicGames.Build.dll')),ubtSha256:sha(join(original,'UnrealBuildTool.dll')),patchedSourceSha256:sha(unreal),scope:'Private isolated build library adds only an E: settings-directory override. Original installed engine and UBT executable are unchanged. Build and native game acceptance remain required.'};
writeFileSync(join(output,'preparation.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify({output,project,sourceFiles:inputs.length,dotnet:join(dotnet,'dotnet.exe')}));
