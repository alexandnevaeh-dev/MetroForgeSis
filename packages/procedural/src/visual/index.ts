export { VISUAL_STYLE_TEMPLATES, resolveVisualStyleTemplate, styleCueText } from './style-registry.js';
export type { VisualStyleTemplate } from './style-registry.js';
export { computeStyleFingerprint, fingerprintFromVisualDNA, hashVisualFragment } from './fingerprint.js';
export { generateVisualDNA } from './dna.js';
export { generateBiomeVisualDNA, generateAllBiomeVisualDNA } from './biome-dna.js';
export { compileVisualPrompt, VISUAL_PROMPT_COMPILER_VERSION } from './prompt-compiler.js';
export type { CompileVisualPromptInput } from './prompt-compiler.js';
export { generateEnvironmentKit, environmentKitScaleFor } from './environment-kit.js';
export { biomeKitFromEnvironment } from './biome-kit.js';
export type { BiomeKit, BiomeKitSurfaceSet } from './biome-kit.js';
export { generateRoomStorytelling } from './storytelling.js';
export { buildDeterministicBiomeLightingProfile, lightingDirectiveForRoom } from './lighting.js';
export type { BiomeLightingProfile, RoomLightingDirective } from './lighting.js';

export { animationPoseGuidance } from './animation-direction.js';
