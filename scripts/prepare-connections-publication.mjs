/** Admit reviewed connection/workflow files on the confirmed branch, preserving the canonical index. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
const source = resolve('.');
const store = 'E:/MetroForgeData/GitHubUpload/20261003/quantum-publish-objectdb';
const parent = '08cd67fa799ba9d461fb7306bb84447c69ccc759';
const tree = 'E:/MetroForgeData/GitHubUpload/20261003/connections-review';
const report = join(source, 'reports/game-tests/20261003-connections-publication');
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
assert.equal(execFileSync('git', ['--git-dir='+store, 'rev-parse', 'refs/heads/codex/metroforge-epic-20261001'], { encoding:'utf8', windowsHide:true }).trim(), parent);
assert.ok(existsSync(join(tree, 'parent.tar')));
const files = ['.gitignore', 'README.md', 'DESIGN.md', 'UX-CONTRACT.md', 'premium-ui.json',
  'apps/desktop/electron/credentials.ts', 'apps/desktop/electron/credentials.test.ts',
  'apps/desktop/electron/handlers.ts', 'apps/desktop/electron/preload.ts', 'apps/desktop/src/App.tsx',
  ...['ApiKeysScreen.tsx','CreateScreen.tsx','ForgeAssistPanel.tsx','GenerateAsset.tsx','GenerationStudio.tsx',
  'HealthPopover.tsx','ItemDefinitionEditor.tsx','ProvidersScreen.tsx','SettingsScreen.tsx','StatusBar.tsx',
  'StoryWorkspace.tsx','StudioContext.tsx','TopDownPropInspector.tsx','aiOpsShared.ts','aiOpsShared.test.ts',
  'metroforge-api.ts','nav.ts','ui/index.tsx'].map(file=>'apps/desktop/src/studio/'+file),
  'apps/desktop/src/styles.css','scripts/verify-connections-ui.mjs','scripts/verify-quantum-create-ui.mjs'];
const backup = 'E:/MetroForgeData/Backups/20261003-connections-publication/'+Date.now();
for (const file of files) {
  assert.ok(!file.includes('..') && !file.endsWith('.env'));
  mkdirSync(dirname(join(backup,file)),{recursive:true}); cpSync(join(source,file),join(backup,file));
  mkdirSync(dirname(join(tree,file)),{recursive:true}); cpSync(join(source,file),join(tree,file));
}
const workspaces = [...readdirSync(join(tree,'packages')).map(name=>'packages/'+name),'apps/cli','apps/desktop']
  .filter(path=>existsSync(join(tree,path,'package.json')));
const names = Object.fromEntries(workspaces.map(path=>[JSON.parse(readFileSync(join(tree,path,'package.json'),'utf8')).name,join(tree,path)]));
function dependencies(path) {
  const origin=join(source,path,'node_modules'),target=join(tree,path,'node_modules');
  if (!existsSync(origin)) return;
  mkdirSync(target,{recursive:true});
  for (const entry of readdirSync(origin,{withFileTypes:true})) {
    if (['.bin','.vite','@metroforge'].includes(entry.name)) continue;
    if (entry.name.startsWith('@')) {
      mkdirSync(join(target,entry.name),{recursive:true});
      for (const name of readdirSync(join(origin,entry.name))) symlinkSync(realpathSync(join(origin,entry.name,name)),join(target,entry.name,name),'junction');
    } else symlinkSync(realpathSync(join(origin,entry.name)),join(target,entry.name),'junction');
  }
  mkdirSync(join(target,'@metroforge'),{recursive:true});
  for (const [name,directory] of Object.entries(names)) symlinkSync(directory,join(target,name),'junction');
}
dependencies(''); for (const path of workspaces) dependencies(path);
const review = { parent, tree, source, store, files, backup, originalIndexSha256:sha(join(source,'.git/index')),
  hashes:Object.fromEntries(files.map(file=>[file,sha(join(tree,file))])), status:'ready-for-build', productionReady:false };
mkdirSync(report,{recursive:true}); writeFileSync(join(report,'latest.json'),JSON.stringify(review,null,2));
writeFileSync(join(tree,'connections-review.json'),JSON.stringify(review,null,2));
console.log(JSON.stringify({tree,files:files.length,backup,indexPreserved:true}));
