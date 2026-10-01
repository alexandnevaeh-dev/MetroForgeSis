import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,statSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
const repo=resolve('.'),report=resolve('reports/game-tests/20261001-canopy-depth');
const excluded=path=>/^(reports|review-artifacts|\.metroforge|\.worktrees|\.cache|node_modules|models|Exports|release)\//i.test(path)||/(^|\/)(\.env(?!\.example$)[^/]*|\.godot|\.qa|__pycache__|Library|Temp|Logs|obj|bin)(\/|$)/i.test(path)||/\.(log|zip|db|bak|pyc|tsbuildinfo)$/i.test(path);
const list=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{encoding:'utf8'}).split('\0').filter(Boolean);
const selected=new Set(list.filter(path=>!excluded(path)&&existsSync(path)));
const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const privateLocal=path=>/^\.metroforge\//i.test(path)||/^review-artifacts\/ENGINE_(ENV|ACCEPTANCE)\.json$/i.test(path)||/(^|\/)(\.env(?!\.example$)[^/]*|\.godot|\.qa|__pycache__|Library|Temp|Logs)(\/|$)/i.test(path)||/\.(log|zip|db|bak|pyc|tsbuildinfo)$/i.test(path);
// Retain already tracked project evidence and reference assets. Only new machine output is omitted.
for(const path of tracked)if(!privateLocal(path)&&existsSync(path))selected.add(path);
const collect=(folder)=>{
 for(const item of readdirSync(folder,{withFileTypes:true})){
  const path=join(folder,item.name).replaceAll('\\','/');
  if(excluded(path))continue;
  if(item.isDirectory())collect(path);else if(item.isFile())selected.add(path);
 }
};
for(const genre of ['topdown','metroidvania'])collect('GeneratedGames/test-games/'+genre+'/current');
const secrets=[/gh[pousr]_[A-Za-z0-9]{35,}/g,/github_pat_[A-Za-z0-9_]{70,}/g,/sk-(?:proj-)?[A-Za-z0-9_-]{40,}/g,/nvapi-[A-Za-z0-9_-]{45,}/g,/AIza[0-9A-Za-z_-]{35}/g,/hf_[A-Za-z0-9]{30,}/g,/gsk_[A-Za-z0-9]{40,}/g,/AKIA[A-Z0-9]{16}/g,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g];
const findings=[],oversize=[];
let bytes=0;
const files=[...selected].sort();
for(const path of files){
 const size=statSync(path).size;bytes+=size;
 if(size>50*1024*1024)oversize.push({path,size});
 if(/\.(png|wav|jpg|jpeg|webp|gif|ico|mp4|dll|exe|pdf|woff2?)$/i.test(path))continue;
 const text=readFileSync(path,'utf8');
 for(const pattern of secrets){pattern.lastIndex=0;for(const match of text.matchAll(pattern))findings.push({path,line:text.slice(0,match.index).split('\n').length,kind:pattern.source});}
}
const excludedTracked=tracked.filter(path=>privateLocal(path)||!existsSync(path));
const result={repo,branch:'codex/metroforge-epic-20261001',head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),files:files.length,bytes,findings,oversize,excludedTracked,scope:'Source plus separate current playable top-down and side-view sets; local reports, caches, backups, models and machine metadata excluded. This scans snapshot files, not all historical Git objects.'};
writeFileSync(join(report,'github-snapshot-review.json'),JSON.stringify(result,null,2));
writeFileSync(join(report,'github-snapshot-files.nul'),files.join('\0')+'\0');
writeFileSync(join(report,'github-snapshot-excluded.nul'),excludedTracked.join('\0')+'\0');
console.log(JSON.stringify({files:files.length,megabytes:Math.round(bytes/1048576),secretFindings:findings.length,oversize:oversize.length,excludedTracked:excludedTracked.length}));
if(findings.length||oversize.length)process.exitCode=1;
