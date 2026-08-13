import { resolve as resolvePath, relative, sep, isAbsolute } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';

export class UnsafeProjectPathError extends Error {
  readonly code = 'PROJECT_PATH_OUTSIDE_ROOT';
  constructor(message: string) {
    super(`PROJECT_PATH_OUTSIDE_ROOT: ${message}`);
    this.name = 'UnsafeProjectPathError';
  }
}

/** A legitimate project slug is a single bare directory-name segment: lowercase-ish
 *  alphanumerics, dots, dashes, underscores — never a path separator, and never starting with
 *  a dot/dash (rules out hidden-file and CLI-flag-looking shapes). `slugify()` in constants.ts
 *  already only ever produces strings matching this; the point of this check is to reject
 *  anything that *doesn't* come from slugify() — i.e. an explicit user-supplied slug. */
const BARE_SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * The single canonical choke point for turning a project slug into a filesystem path. Every
 * entry point that does this (CLI `create`/`generate <slug>`/`validate <slug>`, the generation
 * pipeline, desktop IPC if it ever takes an explicit slug) must go through this rather than
 * `join(root, slug)` directly — see docs/METROFORGE_CURRENT_BUILD.md §47: `metroforge generate
 * <slug>` previously joined a raw CLI argument straight into a path with zero sanitization,
 * since `slugify()` was only ever applied to the *auto-derived* slug fallback, not to an
 * explicitly-supplied one. A value like `../../../elsewhere` would resolve outside
 * `GeneratedGames/` entirely.
 *
 * Throws UnsafeProjectPathError (code PROJECT_PATH_OUTSIDE_ROOT) rather than silently
 * sanitizing, so a caller passing a bad slug finds out immediately instead of writing to an
 * unexpected location.
 */
export function resolveProjectPathSafe(root: string, slug: string): string {
  if (typeof slug !== 'string' || slug.trim().length === 0) {
    throw new UnsafeProjectPathError('slug is empty');
  }
  if (
    slug.includes('/') ||
    slug.includes('\\') ||
    slug.includes('..') ||
    slug.includes('\0') ||
    // eslint-disable-next-line no-control-regex
    /[\x00-\x1f]/.test(slug) ||
    !BARE_SLUG_RE.test(slug)
  ) {
    throw new UnsafeProjectPathError(`"${slug}" is not a valid project slug`);
  }

  const resolvedRoot = resolvePath(root);
  const target = resolvePath(resolvedRoot, slug);

  // Belt-and-braces on top of the shape check above: prove the resolved path is genuinely a
  // direct child of root, not just string-prefixed by it (e.g. a sibling directory named
  // "GeneratedGamesEvil" would pass a naive startsWith(root) check but isn't actually inside
  // root). relative() being anything other than exactly the slug itself means something
  // unexpected happened during resolution (should be unreachable given the shape check above,
  // but this is the actual security invariant, not the regex — kept as the real guarantee).
  const rel = relative(resolvedRoot, target);
  if (rel === '' || rel !== slug || rel.startsWith('..') || isAbsolute(rel)) {
    throw new UnsafeProjectPathError(`resolved path for "${slug}" escapes the approved root`);
  }

  // Symlink boundary: if `root` itself already exists and turns out to be a symlink pointing
  // elsewhere, resolve against its real location instead of the symlink path — a deliberately
  // configured symlinked data directory (e.g. GeneratedGames mounted on another drive) is a
  // legitimate setup, so this follows it rather than rejecting, but always relative to the
  // real, final destination rather than trusting the symlink's apparent location blindly.
  if (existsSync(resolvedRoot)) {
    const realRoot = realpathSync(resolvedRoot);
    if (realRoot !== resolvedRoot) {
      return resolvePath(realRoot, slug);
    }
  }

  return target;
}

/** True if `candidate` resolves to a path inside `root` — used where a boolean check reads
 *  more naturally than catching UnsafeProjectPathError (e.g. validating an already-resolved
 *  path rather than a raw slug). */
export function isPathWithinRoot(root: string, candidate: string): boolean {
  const resolvedRoot = resolvePath(root);
  const resolvedCandidate = resolvePath(candidate);
  if (resolvedCandidate === resolvedRoot) return true;
  return resolvedCandidate.startsWith(resolvedRoot + sep);
}
