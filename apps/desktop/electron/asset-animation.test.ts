import { describe, it, expect } from 'vitest';
import { resolveAssetAnimation } from './asset-animation.js';
describe('gallery animation metadata', () => {
  const sources = {frameCount:2,sourceFrames:['assets/qa/a.png','assets/qa/b.png'],sourceRegions:[[0,0,1254,1254],[0,0,1254,1254]],frameFootAnchors:[[625,1078],[597.3,1081]],displayScale:64/843,fps:6,loop:false};
  it('uses independent-source count and timing instead of stale sheet manifest data', () => {
    const result=resolveAssetAnimation('assets/enemies/enemy_000_attack.png',{frameCount:8,fps:12,loop:true},()=>({attack:sources}));
    expect(result).toMatchObject({...sources,isAnimation:true});
    expect(result.animationSourceError).toBeUndefined();
  });
  it('preserves existing single-source regions and scalar foot anchors', () => {
    const result=resolveAssetAnimation('assets/player_attack.png',{},()=>({attack:{sourceSheet:'assets/source.png',sourceRegions:[[5,10,100,200],[105,10,100,200]],displayScale:0.3,footAnchorY:180,fps:12,loop:false}}));
    expect(result).toMatchObject({frameCount:2,sourceSheet:'assets/source.png',frameFootAnchors:[[50,180],[50,180]],displayScale:0.3});
  });
  it.each(['traversal','absolute','ambiguous','count','regions','anchors','scale','fps','loop'])('rejects malformed %s source metadata without guessed sheet frames',(kind: string)=>{
    const value=structuredClone(sources) as Record<string,unknown>;
    if(kind==='traversal')value.sourceFrames=['assets/../secret.png','assets/qa/b.png'];
    if(kind==='absolute')value.sourceFrames=['E:/outside.png','assets/qa/b.png'];
    if(kind==='ambiguous')value.sourceSheet='assets/source.png';
    if(kind==='count')value.frameCount=3;
    if(kind==='regions')value.sourceRegions=[[0,0,-1,1254],[0,0,1254,1254]];
    if(kind==='anchors')value.frameFootAnchors=[[625,NaN],[625,1081]];
    if(kind==='scale')value.displayScale=Infinity;
    if(kind==='fps')value.fps=-1;
    if(kind==='loop')value.loop='true';
    const result=resolveAssetAnimation('assets/enemies/enemy_000_attack.png',{frameCount:8},()=>({attack:value}));
    expect(result.animationSourceError).toBeTruthy();
    expect(result.frameCount).toBeUndefined();
    expect(result.sourceFrames).toBeUndefined();
  });
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
