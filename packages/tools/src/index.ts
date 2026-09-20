export { ToolRegistry, detectGodot, detectOllama, detectGeneric, detectUnity, detectUnreal } from './registry.js';
export type { ToolInfo, ToolStatus } from './registry.js';
export {
  resolveUnityEditor,
  resolveUnrealEditor,
  unityVersionSupported,
  unrealVersionSupported,
  missingEditorError,
} from './engine-resolver.js';
export type { UnityResolveResult, UnrealResolveResult } from './engine-resolver.js';
export {
  launchGodotEditor,
  launchGodotGame,
  resolveGodotExecutable,
  resolveGodotForProject,
  resolveGodotExecutableCanonical,
  readProjectGodotOverride,
} from './godot-launcher.js';
export type { LaunchGodotResult, GodotResolveResult, GodotResolveSource, ResolveGodotOptions } from './godot-launcher.js';
export { startPlaytest, stopPlaytest, getPlaytestSession, sendPlaytestCommand } from './playtest-session.js';
export type { PlaytestSession } from './playtest-session.js';
export { exportProject } from './project-export.js';
export type { ExportManifest, ExportProjectOptions, ExportProjectResult } from './project-export.js';
export {
  exportGodotMacOSApp,
  exportGodotWindowsBinary,
  ensureMacOSExportPreset,
  ensureWindowsExportPreset,
} from './godot-export.js';
export type {
  GodotExportOptions,
  GodotExportResult,
  GodotMacOSExportOptions,
} from './godot-export.js';
export {
  deleteProject,
  duplicateProject,
  renameProject,
  resolveProjectBySlug,
  projectSlugFromPath,
  refreshProjectTemplate,
  refreshAllProjectTemplates,
  listGeneratedProjects,
  ORPHANED_TEMPLATE_FILES,
} from './project-lifecycle.js';
export type {
  ProjectLifecycleResult,
  TemplateRefreshResult,
  TemplateRefreshOptions,
} from './project-lifecycle.js';
export {
  canonicalizePath,
  classifyRuntimePlatform,
  getPlatformInfo,
  getTempDirectory,
  isolatedUserDataEnvironment,
  probeWorkspaceWritable,
  terminateProcessTree,
  userHomeDirectory,
} from '@metroforge/shared';
export type {
  PlatformCapabilities,
  PlatformInfo,
  RuntimePlatformId,
  WorkspaceWriteProbe,
} from '@metroforge/shared';
