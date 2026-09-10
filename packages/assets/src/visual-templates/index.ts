export {
  REFERENCE_LIBRARY_DIR,
  VisualReferenceLibraryError,
  loadVisualReferenceLibrary,
  resolveVisualReferenceTemplate,
  templatesForRole,
} from './library.js';
export type { TemplateSelector } from './library.js';
export { resolveSubjectTemplate, buildTemplatePrompt, checkTemplateTokenBudget } from './prompt.js';
export type { TokenBudgetResult, PromptBudgetChecker } from './prompt.js';
export { resolveConditioning } from './conditioning.js';
export type { ConditioningCapableRegistration, ConditioningResolution } from './conditioning.js';
export {
  hexToRgb,
  archetypeForTemplate,
  roleForArchetype,
  templateFillAccent,
  templateTilesetStyle,
  templateBackgroundPalette,
  templatePropFillAccent,
} from './palette.js';
