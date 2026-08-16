import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { critiqueGameplayScreenshot } from '@metroforge/assets';
import {
  DEFAULT_QUALITY_BUDGETS,
  type QualityBudgets,
  type QualityIssue,
  type QualityPlan,
  type QualityProvenanceSummary,
  type QualitySnapshot,
  type QualityTier,
  type RepairAction,
} from './quality-types.js';
import {
  combineQualityScores,
  emptySnapshot,
  scorePresentation,
  scoreTechnical,
  type TechnicalInputs,
} from './quality-scoring.js';

export interface StylePaletteColor {
  name?: string;
  hex?: string;
  usage?: string;
}

export interface StyleBibleLike {
  styleId?: string;
  renderingStyle?: string;
  lighting?: string;
  environmentDensity?: string;
  UIStyle?: string;
  outlineRules?: string;
  palette?: StylePaletteColor[];
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function hexToRgb01(hex: string | undefined): [number, number, number] {
  if (!hex || !/^#?[0-9a-fA-F]{6}$/.test(hex)) return [0.08, 0.09, 0.12];
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

export function resolveQualityTier(projectPath: string, override?: QualityTier): QualityTier {
  if (override) return override;
  const dna = readJson<{ profile?: string }>(join(projectPath, 'game_dna.json'));
  if (dna?.profile === 'RELEASE_CANDIDATE' || dna?.profile === 'TINY_TEST' || dna?.profile === 'VISUAL_VERTICAL_SLICE')
    return 'LOW';
  if (dna?.profile === 'LARGE') return 'HIGH';
  return 'MEDIUM';
}

function loadSnapshot(projectPath: string): QualitySnapshot {
  const shot = join(projectPath, 'qa', 'screenshot_gameplay.png');
  const sidecar = readJson<{
    score?: number;
    lumaStdDev?: number;
    uniqueColors?: number;
    occupancy?: number;
    passed?: boolean;
    issues?: string[];
  }>(join(projectPath, 'qa', 'screenshot_critique.json'));
  const capture = readJson<{ strategy?: string }>(join(projectPath, 'qa', 'capture_telemetry.json'));

  if (existsSync(shot)) {
    try {
      const critique = critiqueGameplayScreenshot(readFileSync(shot));
      return {
        criticScore: critique.score,
        lumaStdDev: critique.lumaStdDev,
        uniqueColors: critique.uniqueColors,
        occupancy: critique.occupancy,
        criticPassed: critique.passed,
        criticIssues: critique.issues,
        screenshotStrategy: capture?.strategy,
      };
    } catch {
      /* fall through to sidecar */
    }
  }

  if (sidecar) {
    return {
      criticScore: sidecar.score ?? 0,
      lumaStdDev: sidecar.lumaStdDev ?? 0,
      uniqueColors: sidecar.uniqueColors ?? 0,
      occupancy: sidecar.occupancy ?? 0,
      criticPassed: sidecar.passed ?? false,
      criticIssues: sidecar.issues ?? [],
      screenshotStrategy: capture?.strategy,
    };
  }
  return { ...emptySnapshot(), screenshotStrategy: capture?.strategy };
}

function loadTechnical(projectPath: string): TechnicalInputs {
  const validation = readJson<{
    passed?: boolean;
    results?: Array<{ gate: string; passed: boolean }>;
  }>(join(projectPath, 'validation_report.json'));
  const playtest = readJson<{
    transitionsCompleted?: number;
    transitionsPlanned?: number;
    gameComplete?: boolean;
    victoryState?: boolean;
    inputSimulationUsed?: boolean;
  }>(join(projectPath, 'playtest_telemetry.json'));
  const license = readJson<{ commercialSafe?: boolean }>(join(projectPath, 'license_report.json'));
  const gates = validation?.results ?? [];
  const gatePassed = (name: string) => gates.find((g) => g.gate === name)?.passed === true;
  return {
    validationPassed: validation?.passed === true,
    playtestPassed: gatePassed('godot_playtest') || Boolean(playtest?.victoryState && playtest.inputSimulationUsed),
    transitionsCompleted: playtest?.transitionsCompleted ?? 0,
    transitionsPlanned: playtest?.transitionsPlanned ?? 0,
    commercialSafe: license?.commercialSafe === true,
    placeholderCount: countPlaceholders(projectPath),
    godotImportPassed: gatePassed('godot_imports'),
  };
}

function countPlaceholders(projectPath: string): number {
  const coverage = readJson<{
    placeholderCount?: number;
    entries?: Array<{ maturity?: string }>;
  }>(join(projectPath, 'asset_coverage.json'));
  if (typeof coverage?.placeholderCount === 'number') return coverage.placeholderCount;
  if (coverage?.entries) {
    return coverage.entries.filter((e) => String(e.maturity).toUpperCase() === 'PLACEHOLDER').length;
  }
  const manifest = readJson<{
    artifacts?: Array<{ maturity?: string; assetMaturity?: string }>;
  }>(join(projectPath, 'generation_manifest.json'));
  return (manifest?.artifacts ?? []).filter((a) => {
    const m = String(a.maturity ?? a.assetMaturity ?? '').toUpperCase();
    return m === 'PLACEHOLDER';
  }).length;
}

function countRejectedDeathSheets(projectPath: string): number {
  const manifest = readJson<{
    artifacts?: Array<{ path?: string; maturity?: string; assetMaturity?: string }>;
  }>(join(projectPath, 'generation_manifest.json'));
  return (manifest?.artifacts ?? []).filter((a) => {
    const p = String(a.path ?? '');
    const m = String(a.maturity ?? a.assetMaturity ?? '').toUpperCase();
    return m === 'REJECTED' && /death/i.test(p);
  }).length;
}

function countNvidiaVfx(projectPath: string): number {
  const vfxDir = join(projectPath, 'assets', 'vfx');
  if (!existsSync(vfxDir)) return 0;
  return readdirSync(vfxDir).filter((n) => n.endsWith('.png') && !n.endsWith('_source.png')).length;
}

function loadProvenance(projectPath: string, technical: TechnicalInputs): QualityProvenanceSummary {
  return {
    commercialSafe: technical.commercialSafe,
    placeholderCount: technical.placeholderCount,
    rejectedDeathSheets: countRejectedDeathSheets(projectPath),
    nvidiaVfxCount: countNvidiaVfx(projectPath),
  };
}

function paletteFromBible(bible: StyleBibleLike | null): {
  shadow: [number, number, number];
  steel: [number, number, number];
  accent: [number, number, number];
  danger: [number, number, number];
} {
  const colors = bible?.palette ?? [];
  const byUsage = (usage: string, fallback: [number, number, number]) => {
    const found = colors.find((c) => String(c.usage ?? '').toLowerCase().includes(usage));
    return found?.hex ? hexToRgb01(found.hex) : fallback;
  };
  const byName = (name: string, fallback: [number, number, number]) => {
    const found = colors.find((c) => String(c.name ?? '').toLowerCase() === name.toLowerCase());
    return found ? hexToRgb01(found.hex) : fallback;
  };
  return {
    shadow: byName('Shadow', byUsage('background', [0.08, 0.09, 0.125])),
    steel: byName('Steel', byUsage('structure', [0.24, 0.27, 0.33])),
    accent: byName('Accent', byUsage('player', [0.35, 0.55, 0.86])),
    danger: byName('Danger', byUsage('enem', [0.78, 0.28, 0.28])),
  };
}

function worldUsesStretchedTilesetBg(projectPath: string): boolean {
  const roomsDir = join(projectPath, 'scenes', 'rooms');
  if (!existsSync(roomsDir)) return false;
  const sample = readdirSync(roomsDir).find((n) => n.endsWith('.tscn'));
  if (!sample) return false;
  const text = readFileSync(join(roomsDir, sample), 'utf-8');
  return text.includes('[node name="Background" type="TextureRect"') && text.includes('stretch_mode = 6');
}

function hasCameraDirector(projectPath: string): boolean {
  return existsSync(join(projectPath, 'scripts', 'player', 'CameraDirector.gd'));
}

function hasQualityPresentation(projectPath: string): boolean {
  return existsSync(join(projectPath, 'scripts', 'core', 'QualityPresentation.gd'));
}

function projectGodotHasBusFile(projectPath: string): boolean {
  const godot = existsSync(join(projectPath, 'project.godot'))
    ? readFileSync(join(projectPath, 'project.godot'), 'utf-8')
    : '';
  return /default_bus_layout/.test(godot);
}

function hudLooksUnstyled(projectPath: string): boolean {
  const world = join(projectPath, 'scenes', 'world', 'World.tscn');
  if (!existsSync(world)) return true;
  const text = readFileSync(world, 'utf-8');
  return !text.includes('theme_override_colors/font_color') && text.includes('text = "Victory!"');
}

/**
 * Analyze an assembled project and emit a typed repair plan.
 * QualityDirector never writes project files — call QualityRepairEngine to apply actions.
 */
export class QualityDirector {
  analyze(
    projectPath: string,
    options?: { tier?: QualityTier; budgets?: Partial<QualityBudgets> },
  ): QualityPlan {
    const tier = resolveQualityTier(projectPath, options?.tier);
    const budgets: QualityBudgets = { ...DEFAULT_QUALITY_BUDGETS, ...options?.budgets };
    const snapshot = loadSnapshot(projectPath);
    const technical = loadTechnical(projectPath);
    const provenance = loadProvenance(projectPath, technical);
    const bible = readJson<StyleBibleLike>(join(projectPath, 'style_bible.json'));
    const dna = readJson<{ profile?: string }>(join(projectPath, 'game_dna.json'));
    const palette = paletteFromBible(bible);
    const before = combineQualityScores(scoreTechnical(technical), scorePresentation(snapshot));

    const issues: QualityIssue[] = [];
    const actions: RepairAction[] = [];

    const needRuntime = !hasQualityPresentation(projectPath) || !hasCameraDirector(projectPath);
    if (needRuntime) {
      issues.push({
        id: 'missing_quality_runtime',
        category: 'VISUAL_COHERENCE',
        severity: 'warn',
        title: 'Quality runtime scripts are not installed',
        evidence: 'CameraDirector / QualityPresentation missing from project scripts',
      });
    }
    actions.push({
      kind: 'INSTALL_RUNTIME_SCRIPTS',
      category: 'VISUAL_COHERENCE',
      reason: 'Install Lighting, CameraDirector, CombatFeedback, HUD, audio mix helpers from the Godot template',
      payload: { tier },
    });
    actions.push({
      kind: 'PATCH_PROJECT_AUTOLOADS',
      category: 'VISUAL_COHERENCE',
      reason: 'Register QualityPresentation and CombatFeedback autoloads',
      payload: {},
    });

    if (snapshot.lumaStdDev < 4 || snapshot.criticScore < 70) {
      issues.push({
        id: 'flat_luminance',
        category: 'CONTRAST',
        severity: snapshot.lumaStdDev < 4 ? 'error' : 'warn',
        title: 'Gameplay frame lacks spatial luminance structure',
        evidence: snapshot.criticIssues.join('; ') || `lumaStdDev ${snapshot.lumaStdDev.toFixed(2)}`,
        metric: 'lumaStdDev',
        beforeValue: snapshot.lumaStdDev,
        target: 4,
      });
    }

    if (worldUsesStretchedTilesetBg(projectPath) || snapshot.lumaStdDev < 8) {
      issues.push({
        id: 'stretched_tileset_background',
        category: 'DEPTH',
        severity: 'warn',
        title: 'Rooms use a stretched tileset atlas as the background',
        evidence: 'Background TextureRect stretch_mode=6 plus empty camera margins flatten the 3x3 luma grid',
      });
    }

    actions.push({
      kind: 'APPLY_LIGHTING_PROFILE',
      category: 'LIGHTING',
      reason: 'LOW-tier CanvasModulate + 2 PointLight2D, StyleBible palette parallax (no asset regen)',
      payload: { tier, palette, lighting: bible?.lighting ?? 'low-key rim lighting' },
    });
    actions.push({
      kind: 'SET_CLEAR_COLOR',
      category: 'CONTRAST',
      reason: 'Match default clear color to StyleBible shadow so camera margins are not grey void',
      payload: { color: palette.shadow },
    });
    actions.push({
      kind: 'APPLY_CAMERA_PROFILE',
      category: 'CAMERA',
      reason: 'Room-lock / dead-zone / look-ahead; do not change transition colliders',
      payload: {
        tier,
        zoom: dna?.profile === 'VISUAL_VERTICAL_SLICE' ? 3 : tier === 'LOW' ? 2.4 : tier === 'MEDIUM' ? 2.1 : 1.85,
        deadZone: dna?.profile === 'VISUAL_VERTICAL_SLICE' ? 0.14 : 0.18,
        lookAheadPx: dna?.profile === 'VISUAL_VERTICAL_SLICE' ? 40 : 28,
      },
    });
    actions.push({
      kind: 'PLACE_ROOM_DECOR',
      category: 'ROOM_COMPOSITION',
      reason: 'Data-driven palette props with exclusion zones around spawn, doors, combat, pickups',
      payload: {
        density: tier === 'HIGH' ? 'rich' : tier === 'MEDIUM' ? 'moderate' : 'sparse',
        exclusion: ['spawn', 'doors', 'jumps', 'combat', 'pickups'],
      },
    });

    actions.push({
      kind: 'INSTALL_READABILITY_OUTLINE',
      category: 'READABILITY',
      reason: 'Subtle 1px StyleBible outline on player/enemy sprites only',
      payload: { width: 1, color: [0.96, 0.94, 0.88, 0.7] },
    });

    actions.push({
      kind: 'APPLY_COMBAT_FEEDBACK',
      category: 'COMBAT_JUICE',
      reason: 'Configurable hitstop/flash/VFX scale with a11y shake/flash toggles',
      payload: {
        hitstopMs: 40,
        flashMs: 70,
        vfxScale: 1.15,
        shakeEnabledDefault: true,
        flashEnabledDefault: true,
      },
    });

    actions.push({
      kind: 'APPLY_TRANSITION_FADE',
      category: 'TRANSITIONS',
      reason: 'Presentation-only ColorRect fade; physics transition path unchanged',
      payload: { fadeMs: 80 },
    });

    if (hudLooksUnstyled(projectPath)) {
      issues.push({
        id: 'hud_unstyled',
        category: 'HUD',
        severity: 'warn',
        title: 'GameHUD uses default theme without StyleBible contrast',
        evidence: 'World.tscn Victory overlay and health bar lack theme_override polish',
      });
    }
    actions.push({
      kind: 'POLISH_HUD',
      category: 'HUD',
      reason: 'High-contrast GameHUD theming from StyleBible (generated HUD only)',
      payload: { palette, uiStyle: bible?.UIStyle ?? 'high contrast minimal' },
    });

    if (!projectGodotHasBusFile(projectPath)) {
      issues.push({
        id: 'audio_bus_mix',
        category: 'AUDIO',
        severity: 'info',
        title: 'No UI/Ambience buses in the generated mix',
        evidence: 'AudioManager currently ensures Master/Music/SFX only',
      });
    }
    actions.push({
      kind: 'APPLY_AUDIO_BUS_MIX',
      category: 'AUDIO',
      reason: 'Procedural Master/Music/SFX/UI/Ambience bus mix — no FFmpeg',
      payload: {
        master: 1,
        music: 0.62,
        sfx: 0.9,
        ui: 0.8,
        ambience: 0.45,
      },
    });

    const expectedVfx = [
      'hit_spark',
      'death_puff',
      'dash_trail',
      'pickup_spark',
      'ability_unlock',
      'boss_phase_shift',
      'area_burst',
      'slam_shock',
    ];
    const missingVfx = expectedVfx.filter(
      (id) => !existsSync(join(projectPath, 'assets', 'vfx', `${id}.png`)),
    );
    issues.push({
      id: 'vfx_audit',
      category: 'VFX_INTEGRATION',
      severity: missingVfx.length > 0 ? 'error' : 'info',
      title: missingVfx.length > 0 ? `Missing VFX textures: ${missingVfx.join(', ')}` : 'NVIDIA VFX textures present',
      evidence: `${provenance.nvidiaVfxCount} vfx pngs on disk; regen budget ${budgets.maxRegenerationsPerAsset}`,
    });
    actions.push({
      kind: 'AUDIT_VFX_INTEGRATION',
      category: 'VFX_INTEGRATION',
      reason: 'Scale/layer/timing via CombatFeedbackProfile; do not regen NVIDIA VFX unless missing',
      payload: {
        missing: missingVfx,
        scale: 1.15,
        zIndex: 80,
        maxRegenerationsPerAsset: budgets.maxRegenerationsPerAsset,
      },
    });

    const playtest = readJson<{
      avgTransitionMs?: number;
      attacksPerformed?: number;
      balanceHints?: string[];
    }>(join(projectPath, 'playtest_telemetry.json'));
    if ((playtest?.attacksPerformed ?? 0) > 40 || (playtest?.balanceHints ?? []).length > 0) {
      issues.push({
        id: 'pacing_telemetry',
        category: 'PACING',
        severity: 'info',
        title: 'Playtest telemetry hints at combat density',
        evidence: `attacks=${playtest?.attacksPerformed ?? 0} avgTransitionMs=${playtest?.avgTransitionMs ?? 0}`,
      });
    }
    actions.push({
      kind: 'TWEAK_ROOM_PACING',
      category: 'REPETITION',
      reason: 'Biome-tinted lighting/decor variety only — no room layout or transition changes',
      payload: { mode: 'presentation_variety' },
    });

    actions.push({
      kind: 'WRITE_QUALITY_PROFILE',
      category: 'VISUAL_COHERENCE',
      reason: 'Persist data/quality profiles consumed by runtime and future UI',
      payload: {
        tier,
        palette,
        criticTargetPreferred: 70,
        commercialSafeMustRemain: true,
        placeholdersMustRemainZero: true,
        excludeRejectedDeathSheets: true,
      },
    });

    return {
      projectPath,
      createdAt: new Date().toISOString(),
      tier,
      budgets,
      before,
      snapshot,
      provenance,
      issues,
      actions,
    };
  }
}
