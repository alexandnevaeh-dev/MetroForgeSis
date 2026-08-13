import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface GodotResourceReference {
  resourcePath: string;
  referencedBy: Array<{
    file: string;
    kind: 'ext_resource' | 'preload' | 'load' | 'scene_change';
  }>;
}

export interface GodotResourceGraph {
  resources: Map<string, GodotResourceReference>;
  scannedFiles: number;
}

const RES_PATH_RE = /res:\/\/[^\s"']+/g;
const EXT_RESOURCE_RE = /\[ext_resource[^\]]*path="(res:\/\/[^"]+)"/g;
const PRELOAD_RE = /preload\s*\(\s*"(res:\/\/[^"]+)"/g;
const LOAD_RE = /load\s*\(\s*"(res:\/\/[^"]+)"/g;
const SCENE_CHANGE_RE = /change_scene_to_file\s*\(\s*"(res:\/\/[^"]+)"/g;

function walkFiles(root: string, exts: Set<string>, out: string[] = []): string[] {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (entry === '.godot' || entry === 'node_modules') continue;
      walkFiles(full, exts, out);
    } else if (st.isFile()) {
      const dot = entry.lastIndexOf('.');
      const ext = dot >= 0 ? entry.slice(dot) : '';
      if (exts.has(ext)) out.push(full);
    }
  }
  return out;
}

function ensureResource(
  graph: Map<string, GodotResourceReference>,
  resourcePath: string,
): GodotResourceReference {
  if (!graph.has(resourcePath)) {
    graph.set(resourcePath, { resourcePath, referencedBy: [] });
  }
  return graph.get(resourcePath)!;
}

function scanTextFile(
  graph: Map<string, GodotResourceReference>,
  absPath: string,
  projectRoot: string,
  text: string,
): void {
  const relFile = relative(projectRoot, absPath).replace(/\\/g, '/');

  for (const match of text.matchAll(EXT_RESOURCE_RE)) {
    const resourcePath = match[1];
    ensureResource(graph, resourcePath).referencedBy.push({
      file: relFile,
      kind: 'ext_resource',
    });
  }

  for (const match of text.matchAll(PRELOAD_RE)) {
    ensureResource(graph, match[1]).referencedBy.push({ file: relFile, kind: 'preload' });
  }

  for (const match of text.matchAll(LOAD_RE)) {
    ensureResource(graph, match[1]).referencedBy.push({ file: relFile, kind: 'load' });
  }

  for (const match of text.matchAll(SCENE_CHANGE_RE)) {
    ensureResource(graph, match[1]).referencedBy.push({ file: relFile, kind: 'scene_change' });
  }

  // Catch remaining res:// strings in .tscn/tres property values (textures, etc.)
  if (relFile.endsWith('.tscn') || relFile.endsWith('.tres')) {
    for (const match of text.matchAll(RES_PATH_RE)) {
      const resourcePath = match[0];
      if (resourcePath.includes('uid://')) continue;
      const ref = ensureResource(graph, resourcePath);
      const already = ref.referencedBy.some((r) => r.file === relFile && r.kind === 'ext_resource');
      if (!already) {
        ref.referencedBy.push({ file: relFile, kind: 'ext_resource' });
      }
    }
  }
}

/** Walk a generated Godot project and index res:// references from scenes, resources, and scripts. */
export function scanGodotResourceGraph(projectRoot: string): GodotResourceGraph {
  const resources = new Map<string, GodotResourceReference>();
  const files = walkFiles(projectRoot, new Set(['.tscn', '.tres', '.gd']));

  for (const absPath of files) {
    let text: string;
    try {
      text = readFileSync(absPath, 'utf-8');
    } catch {
      continue;
    }
    scanTextFile(resources, absPath, projectRoot, text);
  }

  return { resources, scannedFiles: files.length };
}

/** Map a filesystem asset path to res:// form for cross-referencing manifest entries. */
export function assetPathToResPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `res://${normalized}`;
}
