import { describe, it, expect } from 'vitest';
import { resolveAssetAnimation } from './asset-animation.js';
describe('gallery animation metadata', () => {
  it('reads the authored clip instead of assuming four frames', () => {
    let readPath = '';
    const result = resolveAssetAnimation('assets/characters/player_attack_2.png', {}, path => {
      readPath = path; return { attack_2: { frameCount: 14, fps: 18, loop: false } };
    });
    expect(readPath).toBe('assets/characters/player_animations.json');
    expect(result).toMatchObject({ isAnimation: true, frameCount: 14, fps: 18, loop: false });
  });
  it('recognizes run and transition clips and keeps unknown counts unknown', () => {
    expect(resolveAssetAnimation('assets/player_jump_start.png', {}, () => { throw Error('missing'); }))
      .toMatchObject({ isAnimation: true, frameCount: undefined });
  });
  it('uses explicit grid metadata and rejects invalid values', () => {
    expect(resolveAssetAnimation('custom.png', { frameCount: 8, frameWidth: 256, frameHeight: 384 }, () => null))
      .toMatchObject({ isAnimation: true, frameCount: 8, frameWidth: 256, frameHeight: 384 });
    expect(resolveAssetAnimation('player_walk.png', { frameCount: -1, fps: NaN }, () => ({ walk: { frameCount: 10, fps: 10 } })))
      .toMatchObject({ frameCount: 10, fps: 10 });
  });
  it('reads boss, flying enemy and NPC clips from their exact sidecar keys', () => {
    for (const name of ['attack_projectile', 'attack_burst', 'telegraph', 'recovery', 'locomotion', 'fly', 'hover', 'talk', 'listen', 'air_dash']) {
      let resource = '';
      const result = resolveAssetAnimation('assets/bosses/boss_final_' + name + '.png', {}, path => {
        resource = path; return { [name]: { frameCount: 8, fps: 11, loop: name === 'fly' } };
      });
      expect(resource).toBe('assets/bosses/boss_final_animations.json');
      expect(result).toMatchObject({ isAnimation: true, frameCount: 8, fps: 11, loop: name === 'fly' });
    }
  });
});
