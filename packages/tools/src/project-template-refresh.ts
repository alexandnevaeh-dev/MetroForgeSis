import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { GENRE_DEFINITIONS, getResourceRoot } from '@metroforge/shared';

export interface TemplateRefreshResult {
  success: boolean;
  projectPath?: string;
  errors: string[];
  copied: string[];
  removed: string[];
  dryRun?: boolean;
  planDigest?: string;
  templateName?: string;
  backupPath?: string;
  validationInvalidated?: boolean;
}
export interface TemplateRefreshOptions {
  templateDir?: string;
  dryRun?: boolean;
  expectedPlanDigest?: string;
}
export const ORPHANED_TEMPLATE_FILES = [
  'scripts/world/AbilityGate.gd',
  'scenes/world/AbilityGate.tscn',
  'scripts/core/AssetSprite.gd',
];
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
type Change = { path: string; before: Buffer | null; after: Buffer | null };

function safeFile(root: string, path: string): string {
  const target = resolve(root, path),
    rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))
    throw new Error('Refresh path leaves its project');
  let current = root;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink())
        throw new Error('Refresh cannot follow project links: ' + path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return target;
}
function json(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (!value || Array.isArray(value) || typeof value !== 'object')
    throw new Error('Invalid project metadata: ' + path);
  return value;
}
function projectConfig(previous: string, template: string, title: string | null): string {
  let result = previous;
  if (title)
    result = result.replace(/^config\/name=.*$/m, () => 'config/name=' + JSON.stringify(title));
  // Add missing runtime bindings without replacing custom actions or renderer settings.
  for (const section of ['autoload', 'input']) {
    const header = new RegExp('^\\[' + section + '\\]\\r?\\n', 'm');
    const block = (text: string) =>
      text.match(
        new RegExp('^\\[' + section + '\\]\\r?\\n([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))', 'm'),
      )?.[1] ?? '';
    const entries = (text: string) => [
      ...block(text).matchAll(
        /^([A-Za-z_][A-Za-z_0-9]*)=([\s\S]*?)(?=^[A-Za-z_][A-Za-z_0-9]*=|$(?![\s\S]))/gm,
      ),
    ];
    const present = new Set(entries(result).map((match) => match[1]));
    const additions = entries(template)
      .filter((match) => !present.has(match[1]!))
      .map((match) => match[0].trimEnd());
    if (additions.length) {
      if (header.test(result))
        result = result.replace(header, (match) => match + additions.join('\n') + '\n');
      else result += '\n[' + section + ']\n' + additions.join('\n') + '\n';
    }
  }
  return result;
}

/** Review a genre-specific refresh; preserve preimages and roll back partial failure. */
export function refreshProjectTemplate(
  projectPath: string,
  options: TemplateRefreshOptions = {},
): TemplateRefreshResult {
  const result: TemplateRefreshResult = {
    success: false,
    projectPath,
    errors: [],
    copied: [],
    removed: [],
    dryRun: !!options.dryRun,
  };
  let backupPath: string | undefined;
  const changes: Change[] = [];
  const applied: Change[] = [];
  try {
    if (!existsSync(join(projectPath, 'project.godot')))
      throw new Error('Invalid project: project.godot not found');
    const root = realpathSync(projectPath);
    if (process.platform === 'win32' && !/^E:[\\/]/i.test(root))
      throw new Error('Refresh projects and backups must stay on E:');
    const dna = json(safeFile(root, 'game_dna.json')),
      meta = json(safeFile(root, 'project.json'));
    const declared = dna?.archetype ?? meta?.archetype ?? 'SIDE_VIEW_METROIDVANIA';
    if (typeof declared !== 'string' || !Object.hasOwn(GENRE_DEFINITIONS, declared))
      throw new Error('Unsupported project genre; runtime files were not changed');
    if (dna?.archetype && meta?.archetype && dna.archetype !== meta.archetype)
      throw new Error('Project genre metadata disagrees; runtime files were not changed');
    if (
      declared === 'QUANTUM_SIMULATION_ROGUELITE' ||
      existsSync(safeFile(root, 'quantum_project.json'))
    )
      throw new Error(
        'Quantum uses a sealed material-world runtime. Create a fresh Quantum project to update it; room-template refresh is unsupported.',
      );
    const genre = GENRE_DEFINITIONS[declared as keyof typeof GENRE_DEFINITIONS];
    const template = realpathSync(
      options.templateDir ?? join(getResourceRoot(), genre.runtime.godotTemplate),
    );
    result.templateName = genre.displayName;
    if (!existsSync(join(template, 'project.godot')))
      throw new Error('Matching runtime template not found');
    const identity = dna?.identity as { title?: unknown } | undefined;
    const title =
      typeof identity?.title === 'string'
        ? identity.title
        : typeof meta?.title === 'string'
          ? meta.title
          : null;
    function change(path: string, after: Buffer | null) {
      const file = safeFile(root, path),
        before = existsSync(file) ? readFileSync(file) : null;
      if ((before === null && after === null) || (before && after && before.equals(after))) return;
      changes.push({ path, before, after });
    }
    function walk(directory: string) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name),
          path = relative(template, full).replaceAll('\\', '/');
        if (entry.isSymbolicLink()) throw new Error('Template links are unsupported');
        if (entry.isDirectory()) {
          if (!['.godot', '.git', '.metroforge', 'assets'].includes(entry.name)) walk(full);
          continue;
        }
        if (!entry.isFile() || !/\.(gd|tscn)$/.test(path) || path.startsWith('scenes/rooms/'))
          continue;
        let bytes = readFileSync(full);
        if (path === 'scenes/boot/Main.tscn' && title)
          bytes = Buffer.from(
            bytes
              .toString('utf8')
              .replace(/text = "MetroForge Game"/g, () => 'text = ' + JSON.stringify(title)),
          );
        change(path, bytes);
      }
    }
    walk(template);
    change(
      'project.godot',
      Buffer.from(
        projectConfig(
          readFileSync(safeFile(root, 'project.godot'), 'utf8'),
          readFileSync(join(template, 'project.godot'), 'utf8'),
          title,
        ),
      ),
    );
    if (declared === 'SIDE_VIEW_METROIDVANIA')
      for (const path of ORPHANED_TEMPLATE_FILES) change(path, null);
    if (changes.length && existsSync(safeFile(root, 'validation_report.json'))) {
      const validation = json(safeFile(root, 'validation_report.json'))!;
      change(
        'validation_report.json',
        Buffer.from(
          JSON.stringify(
            {
              ...validation,
              passed: false,
              productionReady: false,
              validationLevel: 'NEEDS_RUNTIME_VALIDATION',
              invalidatedBy: 'template_refresh',
            },
            null,
            2,
          ) + '\n',
        ),
      );
      result.validationInvalidated = true;
    }
    result.copied = changes.filter((change) => change.after !== null).map((change) => change.path);
    result.removed = changes.filter((change) => change.after === null).map((change) => change.path);
    result.planDigest = digest(
      JSON.stringify({
        root,
        genre: declared,
        changes: changes.map((change) => ({
          path: change.path,
          before: change.before ? digest(change.before) : null,
          after: change.after ? digest(change.after) : null,
        })),
      }),
    );
    if (options.expectedPlanDigest && options.expectedPlanDigest !== result.planDigest)
      throw new Error('Files changed since refresh review. Review the current plan again.');
    if (options.dryRun || changes.length === 0) {
      result.success = true;
      return result;
    }
    backupPath = safeFile(root, '.metroforge/template-refresh/' + randomUUID());
    mkdirSync(backupPath, { recursive: true });
    result.backupPath = backupPath;
    const receipt = {
      projectPath: root,
      template,
      planDigest: result.planDigest,
      status: 'prepared',
      files: changes.map((change) => ({
        path: change.path,
        existed: change.before !== null,
        beforeSha256: change.before ? digest(change.before) : null,
        afterSha256: change.after ? digest(change.after) : null,
      })),
    };
    for (const change of changes)
      if (change.before) {
        const backup = safeFile(root, relative(root, join(backupPath, 'files', change.path)));
        mkdirSync(dirname(backup), { recursive: true });
        writeFileSync(backup, change.before, { flag: 'wx' });
      }
    writeFileSync(join(backupPath, 'receipt.json'), JSON.stringify(receipt, null, 2));
    // Reject drift during backup preparation before replacing any project file.
    for (const change of changes) {
      const file = safeFile(root, change.path);
      const current = existsSync(file) ? readFileSync(file) : null;
      if (
        (current === null) !== (change.before === null) ||
        (current && change.before && !current.equals(change.before))
      )
        throw new Error('Files changed during refresh preparation. Review the current plan again.');
    }
    for (const change of changes) {
      const file = safeFile(root, change.path);
      applied.push(change);
      if (change.after) {
        mkdirSync(dirname(file), { recursive: true });
        safeFile(root, change.path);
        writeFileSync(file, change.after);
      } else unlinkSync(file);
    }
    writeFileSync(
      join(backupPath, 'receipt.json'),
      JSON.stringify({ ...receipt, status: 'applied' }, null, 2),
    );
    result.success = true;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    if (applied.length) {
      const root = realpathSync(projectPath);
      let rollbackFailed = false;
      for (const change of [...applied].reverse())
        try {
          const file = safeFile(root, change.path);
          if (change.before) {
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(file, change.before);
          } else if (existsSync(file)) unlinkSync(file);
        } catch (cause) {
          rollbackFailed = true;
          result.errors.push('Restore failed for ' + change.path + ': ' + String(cause));
        }
      if (backupPath)
        try {
          writeFileSync(
            join(backupPath, 'rollback.json'),
            JSON.stringify(
              {
                status: rollbackFailed ? 'rollback_incomplete' : 'rolled_back',
                errors: result.errors,
              },
              null,
              2,
            ),
          );
        } catch (cause) {
          result.errors.push('Could not write rollback receipt: ' + String(cause));
        }
    }
  }
  return result;
}
