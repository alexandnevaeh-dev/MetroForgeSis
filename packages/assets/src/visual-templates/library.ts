import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  VisualReferenceLibrarySchema,
  type VisualReferenceLibrary,
  type VisualReferenceTemplate,
  type VisualReferenceAssetRole,
} from '@metroforge/schemas';

/** Repo-relative location of the reference library, matching the docs/asset-pipeline/ convention
 *  established this session — analogous to how test-packs/<id>/manifest.json anchors an external
 *  visual pack. */
export const REFERENCE_LIBRARY_DIR = 'docs/asset-pipeline/reference-library';
const LIBRARY_MANIFEST_PATH = 'templates/library.json';

export class VisualReferenceLibraryError extends Error {}

/**
 * Loads and validates the visual reference template library. Follows the same "no manufactured
 * fallback" discipline as packages/godot/src/external-visual-pack.ts's loadExternalVisualPack():
 * every template's referencePaths must resolve to a real file on disk, or this throws rather than
 * silently proceeding with a template whose evidence doesn't actually exist.
 */
export function loadVisualReferenceLibrary(root: string): VisualReferenceLibrary {
  const libDir = join(root, REFERENCE_LIBRARY_DIR);
  const manifestPath = join(libDir, LIBRARY_MANIFEST_PATH);
  if (!existsSync(manifestPath)) {
    throw new VisualReferenceLibraryError(`visual reference library manifest not found: ${manifestPath}`);
  }
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const parsed = VisualReferenceLibrarySchema.safeParse(raw);
  if (!parsed.success) {
    throw new VisualReferenceLibraryError(
      `visual reference library manifest failed schema validation: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  for (const template of parsed.data.templates) {
    for (const refPath of template.referencePaths) {
      const full = join(libDir, refPath);
      if (!existsSync(full)) {
        throw new VisualReferenceLibraryError(
          `template ${template.id} references a missing file: ${refPath} (resolved to ${full})`,
        );
      }
    }
  }
  return parsed.data;
}

export interface TemplateSelector {
  assetRole: VisualReferenceAssetRole;
  biome: string;
}

/** Exact (assetRole, biome) match. Returns undefined rather than a nearest-match guess — callers
 *  must decide their own fallback behavior and disclose it, per this milestone's "no silent
 *  fallback" instruction. */
export function resolveVisualReferenceTemplate(
  library: VisualReferenceLibrary,
  selector: TemplateSelector,
): VisualReferenceTemplate | undefined {
  return library.templates.find((t) => t.assetRole === selector.assetRole && t.biome === selector.biome);
}

/** All templates for a given asset role, across every biome — useful for enumerating variation
 *  (task 6's "two variations of one enemy archetype" sample). */
export function templatesForRole(
  library: VisualReferenceLibrary,
  assetRole: VisualReferenceAssetRole,
): VisualReferenceTemplate[] {
  return library.templates.filter((t) => t.assetRole === assetRole);
}
