import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppliedRepair, QualityPlan, RepairAction } from './quality-types.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TEMPLATE_DIR = join(REPO_ROOT, 'templates', 'godot-metroidvania');

export const QUALITY_TEMPLATE_FILES = [
  'scripts/core/QualityPresentation.gd',
  'scripts/combat/CombatFeedback.gd',
  'scripts/player/CameraDirector.gd',
  'scripts/core/ReadabilityOutline.gd',
  'scripts/shaders/sprite_outline.gdshader',
  'scripts/world/TransitionFader.gd',
] as const;

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function copyFromTemplate(projectPath: string, rel: string): boolean {
  const src = join(TEMPLATE_DIR, rel);
  const dest = join(projectPath, rel);
  if (!existsSync(src)) return false;
  ensureDir(dirname(dest));
  copyFileSync(src, dest);
  return true;
}

function writeText(projectPath: string, rel: string, contents: string): string {
  const dest = join(projectPath, rel);
  ensureDir(dirname(dest));
  writeFileSync(dest, contents);
  return rel;
}

function insertAutoload(godot: string, name: string, resPath: string): string {
  const text = godot.replace(/\r\n/g, '\n');
  if (new RegExp(`^${name}=`, 'm').test(text)) return text;
  if (!text.includes('[autoload]')) {
    return `${text.replace(/\s+$/, '')}\n\n[autoload]\n${name}="*${resPath}"\n`;
  }
  return text.replace(/\[autoload\]\n/, `[autoload]\n${name}="*${resPath}"\n`);
}

function setClearColor(godot: string, rgb: number[]): string {
  const text = godot.replace(/\r\n/g, '\n');
  const color = `Color(${rgb[0]?.toFixed(3)}, ${rgb[1]?.toFixed(3)}, ${rgb[2]?.toFixed(3)}, 1)`;
  if (/environment\/defaults\/default_clear_color=/.test(text)) {
    return text.replace(
      /environment\/defaults\/default_clear_color=.*/,
      `environment/defaults/default_clear_color=${color}`,
    );
  }
  if (text.includes('[rendering]')) {
    return text.replace(
      '[rendering]\n',
      `[rendering]\n\nenvironment/defaults/default_clear_color=${color}\n`,
    );
  }
  return `${text.replace(/\s+$/, '')}\n\n[rendering]\n\nenvironment/defaults/default_clear_color=${color}\n`;
}

function attachCameraDirector(playerTscn: string): string {
  let next = playerTscn;
  if (!next.includes('CameraDirector.gd')) {
    const loadMatch = next.match(/load_steps=(\d+)/);
    if (loadMatch) {
      next = next.replace(/load_steps=\d+/, `load_steps=${Number(loadMatch[1]) + 1}`);
    }
    next = next.replace(
      '[ext_resource type="Script" path="res://scripts/player/AbilityController.gd" id="6_ability"]',
      '[ext_resource type="Script" path="res://scripts/player/AbilityController.gd" id="6_ability"]\n[ext_resource type="Script" path="res://scripts/player/CameraDirector.gd" id="7_camera"]',
    );
  }
  if (!next.includes('id="7_camera"') && next.includes('CameraDirector.gd')) {
    /* already wired */
  }
  if (!/\[node name="Camera2D"[\s\S]*script = ExtResource\("7_camera"\)/.test(next)) {
    next = next.replace(
      /\[node name="Camera2D" type="Camera2D" parent="."\]\nposition = Vector2\(0, -20\)\nzoom = Vector2\([^)]+\)/,
      `[node name="Camera2D" type="Camera2D" parent="."]
position = Vector2(0, -20)
zoom = Vector2(1.85, 1.85)
script = ExtResource("7_camera")`,
    );
  }
  return next;
}

function polishWorldHud(worldTscn: string, palette: { accent: number[]; danger: number[]; steel: number[] }): string {
  let next = worldTscn;
  if (!next.includes('TransitionFader.gd')) {
    const loadMatch = next.match(/load_steps=(\d+)/);
    if (loadMatch) {
      next = next.replace(/load_steps=\d+/, `load_steps=${Number(loadMatch[1]) + 1}`);
    }
    const fadeExt = `[ext_resource type="Script" path="res://scripts/world/TransitionFader.gd" id="8_fade"]\n`;
    const lastExt = next.lastIndexOf('[ext_resource');
    if (lastExt >= 0) {
      const lineEnd = next.indexOf('\n', lastExt);
      next = `${next.slice(0, lineEnd + 1)}${fadeExt}${next.slice(lineEnd + 1)}`;
    } else {
      next = fadeExt + next;
    }
  }
  if (!next.includes('[node name="WorldCanvasModulate"')) {
    next += `
[node name="WorldCanvasModulate" type="CanvasModulate" parent="."]
color = Color(0.62, 0.66, 0.78, 1)

[node name="TransitionFader" type="CanvasLayer" parent="."]
layer = 80
script = ExtResource("8_fade")

[node name="FadeRect" type="ColorRect" parent="TransitionFader"]
visible = false
anchors_preset = 15
anchor_right = 1.0
anchor_bottom = 1.0
mouse_filter = 2
color = Color(0.05, 0.06, 0.08, 0)
`;
  }
  const danger = palette.danger ?? [0.78, 0.28, 0.28];
  const accent = palette.accent ?? [0.35, 0.55, 0.86];
  if (!next.includes('theme_override_colors/font_color = Color(')) {
    next = next.replace(
      '[node name="AbilityLabel" type="Label" parent="GameHUD/HUD/MarginContainer/VBox"]\nlayout_mode = 2\ntext = "Abilities: None"',
      `[node name="AbilityLabel" type="Label" parent="GameHUD/HUD/MarginContainer/VBox"]
layout_mode = 2
theme_override_colors/font_color = Color(0.92, 0.93, 0.96, 1)
theme_override_colors/font_shadow_color = Color(0.05, 0.06, 0.08, 0.85)
theme_override_constants/shadow_offset_x = 1
theme_override_constants/shadow_offset_y = 1
text = "Abilities: None"`,
    );
    next = next.replace(
      '[node name="HealthBar" type="ProgressBar" parent="GameHUD/HUD/MarginContainer/VBox"]\ncustom_minimum_size = Vector2(200, 20)\nlayout_mode = 2\nmax_value = 100.0\nvalue = 100.0\nshow_percentage = false',
      `[node name="HealthBar" type="ProgressBar" parent="GameHUD/HUD/MarginContainer/VBox"]
custom_minimum_size = Vector2(220, 16)
layout_mode = 2
max_value = 100.0
value = 100.0
show_percentage = false
modulate = Color(${danger[0]}, ${danger[1]}, ${danger[2]}, 1)`,
    );
    next = next.replace(
      'color = Color(0, 0, 0, 0.7)',
      'color = Color(0.04, 0.05, 0.08, 0.78)',
    );
    next = next.replace(
      'theme_override_font_sizes/font_size = 36\ntext = "Victory!"',
      `theme_override_font_sizes/font_size = 40
theme_override_colors/font_color = Color(${accent[0]}, ${accent[1]}, ${accent[2]}, 1)
theme_override_colors/font_shadow_color = Color(0.02, 0.03, 0.05, 1)
text = "Victory!"`,
    );
  }
  return next;
}

export class QualityRepairEngine {
  apply(plan: QualityPlan): AppliedRepair[] {
    return plan.actions.map((action) => this.applyOne(plan.projectPath, action));
  }

  applyOne(projectPath: string, action: RepairAction): AppliedRepair {
    try {
      switch (action.kind) {
        case 'INSTALL_RUNTIME_SCRIPTS':
          return this.installScripts(projectPath, action);
        case 'PATCH_PROJECT_AUTOLOADS':
          return this.patchAutoloads(projectPath, action);
        case 'WRITE_QUALITY_PROFILE':
          return this.writeProfiles(projectPath, action);
        case 'SET_CLEAR_COLOR':
          return this.writeClearColor(projectPath, action);
        case 'POLISH_HUD':
          return this.polishHud(projectPath, action);
        case 'APPLY_CAMERA_PROFILE':
          return this.patchCamera(projectPath, action);
        case 'APPLY_LIGHTING_PROFILE':
        case 'APPLY_COMBAT_FEEDBACK':
        case 'APPLY_AUDIO_BUS_MIX':
        case 'APPLY_TRANSITION_FADE':
        case 'INSTALL_READABILITY_OUTLINE':
        case 'AUDIT_VFX_INTEGRATION':
        case 'PLACE_ROOM_DECOR':
        case 'TWEAK_ROOM_PACING':
          return this.writeActionSidecar(projectPath, action);
        default:
          return { kind: action.kind, ok: false, detail: 'unknown repair kind', filesWritten: [] };
      }
    } catch (err) {
      return {
        kind: action.kind,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        filesWritten: [],
      };
    }
  }

  private installScripts(projectPath: string, action: RepairAction): AppliedRepair {
    const written: string[] = [];
    for (const rel of QUALITY_TEMPLATE_FILES) {
      if (copyFromTemplate(projectPath, rel)) written.push(rel);
    }
    for (const extra of [
      'scripts/core/AudioManager.gd',
      'scripts/core/SettingsManager.gd',
      'scripts/core/VFXManager.gd',
      'scripts/combat/HealthComponent.gd',
      'scripts/world/WorldManager.gd',
      'scripts/UI/GameHUD.gd',
      'scenes/world/World.tscn',
      'scenes/player/Player.tscn',
    ]) {
      if (copyFromTemplate(projectPath, extra)) written.push(extra);
    }
    return {
      kind: action.kind,
      ok: written.length > 0,
      detail: `copied ${written.length} template files`,
      filesWritten: written,
    };
  }

  private patchAutoloads(projectPath: string, action: RepairAction): AppliedRepair {
    const rel = 'project.godot';
    const dest = join(projectPath, rel);
    if (!existsSync(dest)) {
      return { kind: action.kind, ok: false, detail: 'project.godot missing', filesWritten: [] };
    }
    let godot = readFileSync(dest, 'utf-8');
    godot = insertAutoload(godot, 'QualityPresentation', 'res://scripts/core/QualityPresentation.gd');
    godot = insertAutoload(godot, 'CombatFeedback', 'res://scripts/combat/CombatFeedback.gd');
    writeFileSync(dest, godot);
    return { kind: action.kind, ok: true, detail: 'autoloads QualityPresentation, CombatFeedback', filesWritten: [rel] };
  }

  private writeProfiles(projectPath: string, action: RepairAction): AppliedRepair {
    const files = [
      writeText(projectPath, 'data/quality/quality_plan_payload.json', JSON.stringify(action.payload, null, 2)),
    ];
    return { kind: action.kind, ok: true, detail: 'wrote quality profile payload', filesWritten: files };
  }

  private writeClearColor(projectPath: string, action: RepairAction): AppliedRepair {
    const rel = 'project.godot';
    const dest = join(projectPath, rel);
    if (!existsSync(dest)) {
      return { kind: action.kind, ok: false, detail: 'project.godot missing', filesWritten: [] };
    }
    const rgb = (action.payload.color as number[]) ?? [0.08, 0.09, 0.12];
    writeFileSync(dest, setClearColor(readFileSync(dest, 'utf-8'), rgb));
    return { kind: action.kind, ok: true, detail: `clear color ${rgb.join(',')}`, filesWritten: [rel] };
  }

  private polishHud(projectPath: string, action: RepairAction): AppliedRepair {
    const rel = 'scenes/world/World.tscn';
    const dest = join(projectPath, rel);
    if (!existsSync(dest)) {
      return { kind: action.kind, ok: false, detail: 'World.tscn missing', filesWritten: [] };
    }
    const palette = (action.payload.palette as { accent: number[]; danger: number[]; steel: number[] }) ?? {
      accent: [0.35, 0.55, 0.86],
      danger: [0.78, 0.28, 0.28],
      steel: [0.24, 0.27, 0.33],
    };
    writeFileSync(dest, polishWorldHud(readFileSync(dest, 'utf-8'), palette));
    if (copyFromTemplate(projectPath, 'scripts/UI/GameHUD.gd')) {
      return { kind: action.kind, ok: true, detail: 'polished GameHUD + World.tscn', filesWritten: [rel, 'scripts/UI/GameHUD.gd'] };
    }
    return { kind: action.kind, ok: true, detail: 'polished World.tscn HUD nodes', filesWritten: [rel] };
  }

  private patchCamera(projectPath: string, action: RepairAction): AppliedRepair {
    const rel = 'scenes/player/Player.tscn';
    const dest = join(projectPath, rel);
    if (!existsSync(dest)) {
      return { kind: action.kind, ok: false, detail: 'Player.tscn missing', filesWritten: [] };
    }
    writeFileSync(dest, attachCameraDirector(readFileSync(dest, 'utf-8')));
    const zoom = Number(action.payload.zoom ?? 1.85);
    const profileRel = writeText(
      projectPath,
      'data/quality/camera_profile.json',
      JSON.stringify(
        {
          zoom,
          deadZone: action.payload.deadZone ?? 0.18,
          lookAheadPx: action.payload.lookAheadPx ?? 28,
        },
        null,
        2,
      ),
    );
    const files = [rel, profileRel];
    if (copyFromTemplate(projectPath, 'scripts/player/CameraDirector.gd')) {
      files.push('scripts/player/CameraDirector.gd');
    }
    return { kind: action.kind, ok: true, detail: `camera zoom ${zoom}`, filesWritten: files };
  }

  private writeActionSidecar(projectPath: string, action: RepairAction): AppliedRepair {
    const name = action.kind.toLowerCase();
    const rel = writeText(
      projectPath,
      `data/quality/${name}.json`,
      JSON.stringify({ kind: action.kind, category: action.category, ...action.payload }, null, 2),
    );
    const extra: string[] = [];
    if (action.kind === 'APPLY_AUDIO_BUS_MIX' && copyFromTemplate(projectPath, 'scripts/core/AudioManager.gd')) {
      extra.push('scripts/core/AudioManager.gd');
    }
    if (action.kind === 'APPLY_COMBAT_FEEDBACK') {
      if (copyFromTemplate(projectPath, 'scripts/combat/CombatFeedback.gd')) extra.push('scripts/combat/CombatFeedback.gd');
      if (copyFromTemplate(projectPath, 'scripts/combat/HealthComponent.gd')) extra.push('scripts/combat/HealthComponent.gd');
      if (copyFromTemplate(projectPath, 'scripts/core/SettingsManager.gd')) extra.push('scripts/core/SettingsManager.gd');
      if (copyFromTemplate(projectPath, 'scripts/core/VFXManager.gd')) extra.push('scripts/core/VFXManager.gd');
    }
    if (action.kind === 'APPLY_TRANSITION_FADE' && copyFromTemplate(projectPath, 'scripts/world/WorldManager.gd')) {
      extra.push('scripts/world/WorldManager.gd');
    }
    return {
      kind: action.kind,
      ok: true,
      detail: 'wrote typed quality data consumed by runtime',
      filesWritten: [rel, ...extra],
    };
  }
}
