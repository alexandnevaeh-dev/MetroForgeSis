import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const WINDOWS_PRESET_NAME = 'Windows Desktop';
const MACOS_PRESET_NAME = 'macOS';

/** Minimal valid Godot 4.x export_presets.cfg for a runnable Windows Desktop build. */
function windowsExportPresetsCfg(): string {
  return `[preset.0]

name="${WINDOWS_PRESET_NAME}"
platform="Windows Desktop"
runnable=true
advanced_options=false
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path="build/windows/game.exe"
encryption_include_filters=""
encryption_exclude_filters=""
encrypt_pck=false
encrypt_directory=false
script_export_mode=2

[preset.0.options]

custom_template/debug=""
custom_template/release=""
debug/export_console_wrapper=1
binary_format/embed_pck=false
texture_format/bptc=true
texture_format/s3tc=true
texture_format/etc=false
texture_format/etc2=false
binary_format/architecture="x86_64"
codesign/enable=false
application/modify_resources=true
application/icon=""
application/console_wrapper_icon=""
application/icon_interpolation=4
application/file_version=""
application/product_version=""
application/company_name=""
application/product_name=""
application/file_description=""
application/copyright=""
application/trademarks=""
application/export_angle=0
ssh_remote_deploy/enabled=false
ssh_remote_deploy/host="user@host_ip"
ssh_remote_deploy/port="22"
ssh_remote_deploy/extra_args_ssh=""
ssh_remote_deploy/extra_args_scp=""
ssh_remote_deploy/run_script="Expects two arguments: HOST_PORT and REMOTE_DEBUG_PORT"
ssh_remote_deploy/cleanup_script="Expects two arguments: HOST_PORT and REMOTE_DEBUG_PORT"
`;
}

/** Writes export_presets.cfg into the project if one isn't already present (never overwrites). */
export function ensureWindowsExportPreset(projectPath: string): string {
  const cfgPath = join(projectPath, 'export_presets.cfg');
  if (!existsSync(cfgPath)) {
    writeFileSync(cfgPath, windowsExportPresetsCfg());
  } else {
    appendPresetWhenMissing(cfgPath, 'Windows Desktop', windowsExportPresetsCfg());
  }
  return cfgPath;
}

function appendPresetWhenMissing(cfgPath: string, platform: string, preset: string): void {
  const current = readFileSync(cfgPath, 'utf-8');
  if (new RegExp(`^platform="${platform.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"$`, 'm').test(current)) {
    return;
  }
  const indexes = [...current.matchAll(/^\[preset\.(\d+)\]$/gm)].map((match) => Number(match[1]));
  const nextIndex = indexes.length > 0 ? Math.max(...indexes) + 1 : 0;
  const indexedPreset = preset.replaceAll('[preset.0', `[preset.${nextIndex}`);
  writeFileSync(cfgPath, `${current.trimEnd()}\n\n${indexedPreset}`);
}

function macOSExportPresetsCfg(): string {
  return `[preset.0]

name="${MACOS_PRESET_NAME}"
platform="macOS"
runnable=true
advanced_options=false
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path="build/macos/game.zip"
encryption_include_filters=""
encryption_exclude_filters=""
encrypt_pck=false
encrypt_directory=false
script_export_mode=2

[preset.0.options]

binary_format/architecture="universal"
texture_format/etc2_astc=true
application/bundle_identifier="com.metroforge.generatedgame"
application/short_version="1.0"
application/version="1.0"
codesign/codesign=1
codesign/identity=""
codesign/certificate_file=""
codesign/certificate_password=""
notarization/notarization=0
notarization/apple_id_name=""
notarization/apple_id_password=""
notarization/api_uuid=""
notarization/api_key=""
notarization/api_key_id=""
export/distribution_type=1
`;
}

/** Writes an ad-hoc signed local macOS preset when none exists; user presets are never overwritten. */
export function ensureMacOSExportPreset(projectPath: string): string {
  const cfgPath = join(projectPath, 'export_presets.cfg');
  if (!existsSync(cfgPath)) {
    writeFileSync(cfgPath, macOSExportPresetsCfg());
  } else {
    appendPresetWhenMissing(cfgPath, 'macOS', macOSExportPresetsCfg());
  }
  return cfgPath;
}

export interface GodotExportOptions {
  projectPath: string;
  godotExecutable: string;
  outputExePath: string;
  /** 'release' (default) or 'debug' build. */
  mode?: 'release' | 'debug';
  presetName?: string;
  timeoutMs?: number;
}

export interface GodotExportResult {
  success: boolean;
  exitCode: number | null;
  outputExePath: string;
  outputExists: boolean;
  outputSizeBytes: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  presetsPath: string;
}

export interface GodotMacOSExportOptions {
  projectPath: string;
  godotExecutable: string;
  outputZipPath: string;
  mode?: 'release' | 'debug';
  presetName?: string;
  timeoutMs?: number;
}

/**
 * Invokes the real Godot CLI to produce a standalone Windows executable — not a source zip.
 * Requires the matching engine version's export templates to already be installed
 * (%APPDATA%/Godot/export_templates/<version>/ on Windows).
 */
export function exportGodotWindowsBinary(options: GodotExportOptions): GodotExportResult {
  const { projectPath, godotExecutable, outputExePath } = options;
  const mode = options.mode ?? 'release';
  const presetName = options.presetName ?? WINDOWS_PRESET_NAME;
  const presetsPath = ensureWindowsExportPreset(projectPath);
  mkdirSync(dirname(outputExePath), { recursive: true });

  const flag = mode === 'debug' ? '--export-debug' : '--export-release';
  const result = spawnSync(
    godotExecutable,
    ['--headless', '--path', projectPath, flag, presetName, outputExePath],
    {
      encoding: 'utf-8',
      timeout: options.timeoutMs ?? 180_000,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    },
  );

  const outputExists = existsSync(outputExePath);
  const outputSizeBytes = outputExists ? statSync(outputExePath).size : 0;

  return {
    success: result.status === 0 && outputExists && outputSizeBytes > 0,
    exitCode: result.status,
    outputExePath,
    outputExists,
    outputSizeBytes,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut: result.error?.message?.includes('ETIMEDOUT') === true || result.signal === 'SIGTERM',
    presetsPath,
  };
}

/** Produces an ad-hoc signed, local-development macOS app ZIP using matching Godot templates. */
export function exportGodotMacOSApp(options: GodotMacOSExportOptions): GodotExportResult {
  const mode = options.mode ?? 'release';
  const presetName = options.presetName ?? MACOS_PRESET_NAME;
  const presetsPath = ensureMacOSExportPreset(options.projectPath);
  mkdirSync(dirname(options.outputZipPath), { recursive: true });
  const flag = mode === 'debug' ? '--export-debug' : '--export-release';
  const result = spawnSync(
    options.godotExecutable,
    ['--headless', '--path', options.projectPath, flag, presetName, options.outputZipPath],
    {
      encoding: 'utf-8',
      timeout: options.timeoutMs ?? 300_000,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  const outputExists = existsSync(options.outputZipPath);
  const outputSizeBytes = outputExists ? statSync(options.outputZipPath).size : 0;
  return {
    success: result.status === 0 && outputExists && outputSizeBytes > 0,
    exitCode: result.status,
    outputExePath: options.outputZipPath,
    outputExists,
    outputSizeBytes,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut: result.error?.message?.includes('ETIMEDOUT') === true || result.signal === 'SIGTERM',
    presetsPath,
  };
}
