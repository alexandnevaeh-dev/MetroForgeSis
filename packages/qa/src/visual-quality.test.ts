import { describe, expect, it } from 'vitest';
import { mapDefectToRepair, scoreVisualQuality, VISUAL_QUALITY_GATES } from '../src/visual-quality.js';
import { planVisualRepairs } from '../src/visual-repair.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Visual Quality Director V2', () => {
  it('hard-fails wallpaper captures and missing player', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vgf2-qa-'));
    const result = scoreVisualQuality({
      projectPath: dir,
      playerVisible: false,
      enemyVisible: true,
      terrainTextureExists: false,
      uiTextureExists: false,
      wallpaperCapture: true,
      placeholderRatio: 0.9,
    });
    expect(result.hardFail).toBe(true);
    expect(result.verdict).toBe('AUTOMATED_VISUAL_FAIL');
    expect(result.defects).toContain('WALLPAPER_CAPTURE');
    expect(result.verdict).not.toBe('HUMAN_APPROVED');
  });

  it('maps defects to targeted repairs and never auto-human-approves', () => {
    expect(mapDefectToRepair('BACKGROUND_TOO_FLAT').action).toBe('regenerate_background_layers');
    expect(mapDefectToRepair('PROP_DENSITY_LOW').target).toBe('props');
    const dir = mkdtempSync(join(tmpdir(), 'vgf2-qa2-'));
    writeFileSync(join(dir, 'dummy'), 'x');
    const result = scoreVisualQuality({
      projectPath: dir,
      playerVisible: true,
      enemyVisible: true,
      terrainTextureExists: true,
      uiTextureExists: true,
      parallaxFingerprints: { far: 'aaa', mid: 'bbb', near: 'ccc' },
      propCount: 12,
      placeholderRatio: 0.1,
    });
    expect(result.verdict === 'HUMAN_APPROVED' || result.verdict === 'HUMAN_REJECTED').toBe(false);
    const plan = planVisualRepairs(result, 0);
    expect(Array.isArray(plan)).toBe(true);
    expect(VISUAL_QUALITY_GATES.overall).toBe(80);
  });
});
