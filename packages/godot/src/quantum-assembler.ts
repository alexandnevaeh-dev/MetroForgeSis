import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { QuantumProjectSpecSchema, QuantumTemplateManifestSchema, type QuantumProjectSpec } from '@metroforge/schemas';
import { getResourceRoot } from '@metroforge/shared';

const hash = (bytes: Buffer)=>createHash('sha256').update(bytes).digest('hex');
export interface QuantumAssemblyInput {
  outputDir: string;
  spec: QuantumProjectSpec;
  resourceRoot?: string;
}
export interface QuantumAssemblyResult {
  projectPath: string;
  templateSha256: string;
  configSha256: string;
  files: number;
}

/** Dedicated material runtime; it never enters either room-based assembler. */
export function assembleQuantumProject(input: QuantumAssemblyInput): QuantumAssemblyResult {
  const spec = QuantumProjectSpecSchema.parse(input.spec);
  const output = resolve(input.outputDir);
  if (process.platform === 'win32' && !/^E:[/\\]/i.test(output)) throw new Error('Quantum projects must be written on E:');
  if (existsSync(output)) throw new Error('Quantum output already exists; choose a new project folder to preserve existing work');
  const template = realpathSync(join(input.resourceRoot ?? getResourceRoot(),'templates/godot-quantum-divergence'));
  const manifestBytes = readFileSync(join(template,'quantum-template.json'));
  const manifest = QuantumTemplateManifestSchema.parse(JSON.parse(manifestBytes.toString('utf8')));
  const files = Object.entries(manifest.hashes).map(([path,sha])=>{
    if (isAbsolute(path) || path.split('/').some(part=>part==='..' || part==='.' || !part)) throw new Error('Unsafe Quantum template path: '+path);
    if (!/^(?:scripts\/[A-Za-z]+\.gd|scenes\/[A-Za-z]+\.tscn|assets\/[a-z0-9/-]+\.(?:png|json|tscn)|assets\/[a-z0-9/-]+\/(?:README\.md|\.gitattributes)|project\.godot|\.gitattributes)$/.test(path)) throw new Error('Unexpected Quantum template file: '+path);
    const location = realpathSync(join(template,path));
    const inside = relative(template,location);
    if (inside.startsWith('..'+sep) || inside==='..' || isAbsolute(inside) || !lstatSync(location).isFile()) throw new Error('Quantum template file escapes its root: '+path);
    const bytes = readFileSync(location);
    if (hash(bytes)!==sha) throw new Error('Quantum template hash mismatch: '+path);
    return {path,bytes,sha};
  });
  for (const required of ['project.godot','scripts/GeneratedMines.gd',manifest.entryScene,'assets/mine-kit-candidate-v1/manifest.json','assets/cast-candidate-v2/manifest.json','assets/diver-candidate-v1/manifest.json']) {
    if (!manifest.hashes[required]) throw new Error('Incomplete Quantum template: '+required);
  }
  const project = files.find(file=>file.path==='project.godot')!.bytes.toString('utf8');
  if (!project.includes('run/main_scene="res://'+manifest.entryScene+'"')) throw new Error('Quantum template main scene mismatch');
  const configBytes = Buffer.from(JSON.stringify(spec,null,2)+'\n');
  mkdirSync(dirname(output),{recursive:true});
  const stage = output+'.quantum-stage-'+randomUUID();
  mkdirSync(stage);
  for (const file of files) {
    mkdirSync(dirname(join(stage,file.path)),{recursive:true});
    writeFileSync(join(stage,file.path),file.bytes,{flag:'wx'});
  }
  writeFileSync(join(stage,'quantum_project.json'),configBytes,{flag:'wx'});
  writeFileSync(join(stage,'quantum-template.json'),manifestBytes,{flag:'wx'});
  // rename cannot silently merge into or overwrite an existing project.
  if (existsSync(output)) throw new Error('Quantum output appeared during assembly; staged files are retained at '+stage);
  renameSync(stage,output);
  return {projectPath:output,templateSha256:hash(manifestBytes),configSha256:hash(configBytes),files:files.length+2};
}
