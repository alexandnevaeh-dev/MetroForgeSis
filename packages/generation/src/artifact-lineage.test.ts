import { describe, it, expect } from 'vitest';
import { defaultCharacterLineageEdges, descendantsOf, markDescendantsDirty } from '../src/artifact-lineage.js';
import { inheritDerivativeLicense } from '../src/derivative-license.js';

describe('artifact lineage', () => {
  it('invalidates pose and sheet descendants of the canonical character, not unrelated rooms', () => {
    const edges = defaultCharacterLineageEdges('player');
    const { ids } = descendantsOf(edges, 'player');
    expect(ids).toContain('player_idle_pose');
    expect(ids).toContain('player_walk_sheet');
    expect(ids).toContain('Player.tscn');
    expect(ids.some((id) => id.startsWith('room_'))).toBe(false);
  });

  it('exposes a dirty-state reason for logs', () => {
    const { dirtyIds, reason } = markDescendantsDirty(defaultCharacterLineageEdges(), 'player');
    expect(dirtyIds.length).toBeGreaterThan(3);
    expect(reason).toContain('invalidate player');
  });
});

describe('derivative license inheritance', () => {
  it('inherits allowed commercial use and never upgrades unknown', () => {
    const allowed = inheritDerivativeLicense({
      parent: { id: 'player', provider: 'nvidia-image', commercialUse: 'allowed', license: 'NVIDIA API Terms / model card' },
      child: { id: 'player_idle_pose', provider: 'pixel-art-processor', commercialUse: 'unknown' },
      transformation: 'pose-compile',
    });
    expect(allowed.derivedLicense).toBe('allowed');
    expect(allowed.parentArtifactId).toBe('player');

    const unknown = inheritDerivativeLicense({
      parent: { id: 'src', provider: 'comfyui', commercialUse: 'unknown' },
      child: { id: 'out', provider: 'pixel-art-processor' },
      transformation: 'compile',
    });
    expect(unknown.derivedLicense).toBe('unknown');
  });
});
