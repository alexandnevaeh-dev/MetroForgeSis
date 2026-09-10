import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const sourceRoot = path.join(root, 'assets/external/sunnyland_forest/original/Sunny-land-forest-files/Assets/PNG/sprites/player');
const referenceRoot = path.join(root, 'assets/external/sunnyland_forest/authoring_reference');
const briefRoot = path.join(referenceRoot, 'briefs');
const incomingRoot = path.join(root, 'assets/external/sunnyland_forest/authored_incoming');
const direct = ['idle', 'jump', 'fall', 'hurt'];
const authored = {
  walk: [6, 12, true, 'Walk cycle: left contact, pass, right contact, pass; mild torso sway and opposing arms.', 'Idle to first left contact; exits on either contact pose.'],
  run: [8, 14, true, 'Run cycle: longer alternating stride, forward torso lean, stronger opposing arm drive.', 'Walk/run locomotion entry; exits on contact or pass pose.'],
  jump_start: [3, 12, false, 'Neutral, two-pixel compression, then extended launch with both feet leaving the baseline.', 'Idle/run entry; final pose connects to jump ascent.'],
  land: [3, 14, false, 'Airborne impact, deep knee compression, upright recovery.', 'Fall entry; recovery must return toward idle/run without lingering.'],
  attack: [5, 18, false, 'Guarded startup, horizontal strike, extended hit silhouette, follow-through, recovery.', 'Idle/run/jump entry; frame 1 is the visual hit during the 0.15s hitbox window.'],
  attack_2: [5, 18, false, 'Reverse-weight slash: recoil, rising diagonal strike, extended hit, follow-through, recovery.', 'Attack 1 combo entry; frame 1 is the visual hit.'],
  attack_3: [6, 18, false, 'Finisher: coiled startup, broad overhead/downward strike, largest reach, heavy follow-through, recovery.', 'Attack 2 combo entry; frame 2 is the visual hit.'],
  dash: [4, 24, false, 'Low anticipation, compact forward lean, full horizontal drive, recovery.', 'Ground dash lasts config.dash_duration (default 0.15s).'],
  air_dash: [4, 24, false, 'Airborne tuck, forward extension, held horizontal drive, open airborne recovery.', 'Air dash lasts config.dash_duration (default 0.15s).'],
  double_jump: [4, 14, false, 'Airborne recoil, compact impulse, upward extension, jump-compatible recovery.', 'Triggered mid-air; no long anticipation.'],
  wall_slide: [4, 8, true, 'Hands and feet brace toward the wall; body descends with alternating friction contacts.', 'Flip-safe: face and hands must point toward the contact wall.'],
  wall_jump: [4, 14, false, 'Wall brace, explosive push away, tucked travel, jump-compatible extension.', 'Visual readability window is approximately 0.18s.'],
  ground_slam_start: [3, 12, false, 'Airborne tuck, arms draw in, body compresses into a committed downward preparation.', 'Begins while airborne; final pose enters slam fall.'],
  ground_slam_fall: [3, 12, false, 'Narrow vertical silhouette, legs together, arms down/close; distinct from ordinary fall.', 'Collision-driven duration until floor impact.'],
  ground_slam_impact: [5, 16, false, 'Impact spread, deepest compression, shock reaction, rising recovery, neutral-ready recovery.', 'Starts on collision; must not read as crouch.'],
  swim: [6, 10, true, 'Horizontal propulsion: reaching arm, pull, kick, glide, opposite reach, opposite pull.', 'Water locomotion; use floating baseline, not ground foot contacts.'],
  swim_idle: [4, 8, true, 'Buoyant tread: small torso rise, alternating hands, relaxed bent legs.', 'Water idle; visibly distinct from standing idle.'],
  grapple: [5, 12, false, 'Look toward upper-forward grapple point, one arm reaches, torso pulls under tension, travel tuck, release.', 'Distance-driven until within 14px of target; maintain directional force read.'],
  phase: [5, 12, false, 'Silhouette contracts, staggered limb offsets/fragment gaps, re-forms in a forward-ready pose.', 'Phase dash default duration is 0.22s; pose must read without relying on tint/VFX.'],
  death: [8, 10, false, 'Hit instability, knee buckle, sideward collapse, prone defeated hold.', 'Animation completion hides player; final pose must clearly differ from hurt.'],
  respawn: [6, 10, false, 'Low fragmented/re-entry silhouette, kneel, rise, settle into ready stance.', 'Event-driven; should read as reconstruction rather than idle.'],
  interact: [4, 10, false, 'Neutral step/lean, one-hand reach, use/press pose, return to ready.', 'Generic interactable use; keep weapon/hand silhouette clear.'],
  ability_acquire: [6, 12, false, 'Look up, arms gather, raised/open celebration, empowered wide silhouette, settle.', 'Event-driven progression reward; largest non-combat silhouette.'],
};
const sourceDirs = { idle: 'player-idle', jump: 'player-jump', fall: 'player-fall', hurt: 'player-hurt' };
const category = (rgba) => ({ '71,25,27,255': 'outline', '72,26,28,255': 'outline', '232,200,179,255': 'skin/highlight', '176,49,20,255': 'clothing shadow', '217,103,37,255': 'clothing', '179,126,109,255': 'skin shadow', '217,137,147,255': 'accent' }[rgba] ?? 'minor accent');
const hex = ([r,g,b,a]) => '#' + [r,g,b,a].map((v) => v.toString(16).padStart(2, '0')).join('');
const png = (file, width, height) => sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toFile(file);
const text = (value, width, height, size = 13) => Buffer.from(`<svg width="${width}" height="${height}"><text x="4" y="${Math.max(size, 14)}" font-family="monospace" font-size="${size}" fill="#eef4ff">${value}</text></svg>`);

await fs.mkdir(briefRoot, { recursive: true });
await fs.mkdir(incomingRoot, { recursive: true });
const palette = new Map(); const measures = [];
for (const [state, directory] of Object.entries(sourceDirs)) {
  const files = (await fs.readdir(path.join(sourceRoot, directory))).filter((file) => file.endsWith('.png')).sort();
  for (const file of files) {
    const image = await sharp(path.join(sourceRoot, directory, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = image.info.width, right = -1, top = image.info.height, bottom = -1;
    for (let index = 0; index < image.data.length; index += 4) {
      const rgba = [...image.data.subarray(index, index + 4)]; if (rgba[3] < 16) continue;
      const x = (index / 4) % image.info.width, y = Math.floor(index / 4 / image.info.width);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      const key = rgba.join(','); palette.set(key, (palette.get(key) ?? 0) + 1);
    }
    measures.push({ state, file, left, right, top, bottom, width: right - left + 1, height: bottom - top + 1 });
  }
}
const colors = [...palette.entries()].sort((a,b) => b[1]-a[1]).map(([rgba, frequency]) => { const values = rgba.split(',').map(Number); return { rgba: values, hex: hex(values), frequency, category: category(rgba) }; });
await fs.writeFile(path.join(referenceRoot, 'sunnyland-player-palette.json'), JSON.stringify(colors, null, 2));
await sharp({ create: { width: colors.length * 64, height: 64, channels: 4, background: '#17202a' } }).composite(colors.map((item, index) => ({ input: { create: { width: 64, height: 64, channels: 4, background: item.hex } }, left: index * 64, top: 0 }))).png().toFile(path.join(referenceRoot, 'sunnyland-player-palette.png'));
for (const [state, directory] of Object.entries(sourceDirs)) await fs.cp(path.join(sourceRoot, directory), path.join(referenceRoot, 'original_frames', state), { recursive: true });
const standard = measures.filter((item) => item.state === 'idle');
const range = (items, key) => `${Math.min(...items.map((item) => item[key]))}-${Math.max(...items.map((item) => item[key]))}`;
await fs.writeFile(path.join(referenceRoot, 'CHARACTER_PROPORTIONS.md'), `# SunnyLand Character Proportions\n\nMeasured from ${measures.length} accepted original idle/jump/fall/hurt frames on 37x32 source canvases.\n\n| Metric | Source-pixel range | Normalized 64px-cell target |\n|---|---:|---:|\n| Opaque height | ${range(measures, 'height')} px | ${range(measures.map((item) => ({ height: Math.round(item.height * 64 / 37) })), 'height')} px |\n| Opaque width | ${range(measures, 'width')} px | ${range(measures.map((item) => ({ width: Math.round(item.width * 64 / 37) })), 'width')} px |\n| Resting idle width | ${range(standard, 'width')} px | ${range(standard.map((item) => ({ width: Math.round(item.width * 64 / 37) })), 'width')} px |\n| Resting center X | 16-18 px | 28-31 px |\n| Grounded feet baseline | 31 px | 63 px |\n| Typical left padding | 5-9 px | 9-16 px |\n| Typical top padding (idle) | ${range(standard, 'top')} px | ${range(standard.map((item) => ({ top: Math.round(item.top * 64 / 37) })), 'top')} px |\n\nUse the dark brown/red outlines, peach skin, orange clothing, and one-pixel source clusters. Grounded authored frames must place an opaque foot pixel at normalized Y=63 with baseline variance no greater than 1px. Airborne frames may vary intentionally. Preserve the 37x32 source model's head, torso, arms, legs, and feet; do not scale a whole character to animate it.\n`);
const directSamples = []; let sampleIndex = 0;
for (const [state, directory] of Object.entries(sourceDirs)) { const file = path.join(sourceRoot, directory, (await fs.readdir(path.join(sourceRoot, directory))).filter((item) => item.endsWith('.png')).sort()[0]); directSamples.push({ input: await sharp(file).resize(111,96,{kernel:'nearest'}).png().toBuffer(), left: sampleIndex * 160 + 24, top: 45 }); directSamples.push({ input: text(state.toUpperCase(), 130, 20), left: sampleIndex * 160 + 4, top: 18 }); sampleIndex++; }
const annotations = ['SOURCE: 37x32px', 'CELL: 64x64px', 'ANCHOR: bottom-center', 'DISPLAY HEIGHT: 42-55px', 'BASELINE: Y=63', 'FACING: right; mirror left'];
await sharp({create:{width:640,height:210,channels:4,background:'#17202a'}}).composite([...directSamples,...annotations.map((item,index)=>({input:text(item,300,18,12),left:10+(index%3)*210,top:155+Math.floor(index/3)*22}))]).png().toFile(path.join(referenceRoot, 'SUNNYLAND_CHARACTER_REFERENCE.png'));
for (const [state, [frames, fps, loop, poses, transition]] of Object.entries(authored)) {
  const plan = Array.from({length:frames}, (_, index) => `Frame ${index}: ${index === 0 ? 'entry/readable setup' : index === frames - 1 ? 'transition-ready ending pose' : 'anatomical in-between progressing the stated action'}; redraw limbs, torso and head for this pose, not the whole sprite.`).join('\n\n');
  await fs.writeFile(path.join(briefRoot, `${state}.md`), `# ${state}\n\n## Purpose\n${poses}\n\n## Gameplay Timing\n${transition}\n\n## Target Frame Count\n${frames}\n\n## Target FPS\n${fps}\n\n## Loop / Non-Loop\n${loop ? 'Loop' : 'Non-loop'}\n\n## Starting Pose\nMatch the transition-in state while preserving the SunnyLand head, orange clothing, peach skin, dark outline, and 37x32-source proportions.\n\n## Key Poses\n${poses}\n\n## Ending Pose\n${transition}\n\n## Silhouette Goal\nReadable at the existing 64px cell presentation without changing character identity.\n\n## Body Motion\nRedraw torso lean/compression for each key pose; no whole-body translation, rotation, or scale animation.\n\n## Head Motion\nMaintain head size and face direction; aim or look toward the active force where applicable.\n\n## Arm Motion\nUse state-specific opposing arm, reach, brace, strike, or propulsion motion.\n\n## Leg Motion\nUse state-specific contacts, tuck, kick, brace, or collapse; do not reuse a static leg silhouette.\n\n## Foot Contact\nGrounded feet: Y=63 ±1. Airborne/water states: intentional lift only.\n\n## Center-of-Mass Motion\nMove through anatomical pose change, not by shifting a complete sprite cell.\n\n## Expected Baseline\nGrounded baseline at normalized Y=63 ±1.\n\n## Transition In\n${transition}\n\n## Transition Out\n${transition}\n\n## Do Not Use\nUnrelated SunnyLand poses, a repeated single frame, whole-sprite transforms, softened resampling, or V2 art.\n\n## Acceptance Criteria\nDistinct action-specific pose sequence; crisp palette-constrained pixels; stable identity; valid 64x64 horizontal strip; no duplicate frames.\n\n## Frame-by-Frame Plan\n${plan}\n`);
}
const batch = ['walk','run','jump_start','land'];
for (const state of batch) { const [frames] = authored[state]; await png(path.join(referenceRoot, `${state}_template.png`), frames * 64, 64); }
await fs.writeFile(path.join(referenceRoot, 'AUTHORING_BATCH_A.md'), `# Batch A: Core Movement\n\nDeliver four transparent PNG horizontal strips to \`authored_incoming/\`: walk (6x64), run (8x64), jump_start (3x64), land (3x64). Use \`SUNNYLAND_CHARACTER_REFERENCE.png\`, \`sunnyland-player-palette.json\`, \`CHARACTER_PROPORTIONS.md\`, and the corresponding briefs.\n\nGameplay targets: walk 12fps loop; run 14fps loop; jump_start 12fps non-loop with short anticipation; land 14fps non-loop over the controller's 0.18s landing visual window. Grounded frames use baseline Y=63 ±1. Review transitions as idle -> walk -> run, idle -> jump_start -> jump, and fall -> land -> idle.\n`);
const statuses = Object.fromEntries([...direct.map((state) => [state, { state, source: 'original', status: 'ACCEPTED', notes: 'Accepted SunnyLand source animation.' }]), ...Object.keys(authored).map((state) => [state, { state, source: 'authored', status: 'PENDING', notes: 'Awaiting frame-by-frame SunnyLand-character art review.' }])]);
await fs.writeFile(path.join(referenceRoot, 'player_v3_1_art_status.json'), JSON.stringify(statuses, null, 2));
console.log(JSON.stringify({ referenceRoot, authoredBriefs: Object.keys(authored).length, directAccepted: direct.length }, null, 2));