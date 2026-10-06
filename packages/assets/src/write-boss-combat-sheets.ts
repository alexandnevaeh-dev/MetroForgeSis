import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileBossCombatSheets,
  extractSheetFramePng,
  type SpriteSpec,
} from './png.js';

const here = dirname(fileURLToPath(import.meta.url));
const bossDir = join(here, '../../../templates/godot-metroidvania/assets/bosses');

const spec: SpriteSpec = {
  id: 'boss_final',
  width: 160,
  height: 160,
  fill: [70, 82, 96, 255],
  shape: 'boss',
};

const idleStrip = readFileSync(join(bossDir, 'boss_final_idle.png'));
const still = extractSheetFramePng(idleStrip, 160, 160, 0);
const sheets = compileBossCombatSheets(spec, still);
mkdirSync(bossDir, { recursive: true });
writeFileSync(join(bossDir, 'boss_final_idle.png'), sheets.idle);
writeFileSync(join(bossDir, 'boss_final_telegraph.png'), sheets.telegraph);
writeFileSync(join(bossDir, 'boss_final_recovery.png'), sheets.recovery);
writeFileSync(join(bossDir, 'boss_final_attack.png'), sheets.attack);
writeFileSync(join(bossDir, 'boss_final_attack_projectile.png'), sheets.attack_projectile);
writeFileSync(join(bossDir, 'boss_final_attack_burst.png'), sheets.attack_burst);
writeFileSync(join(bossDir, 'boss_final_hurt.png'), sheets.hurt);
writeFileSync(join(bossDir, 'boss_final_death.png'), sheets.death);
writeFileSync(join(bossDir, 'boss_final_walk.png'), sheets.walk);
console.log('Wrote boss combat sheets to', bossDir);
