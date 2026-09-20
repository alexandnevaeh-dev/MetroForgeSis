import type { AssetQualityProfile } from '@metroforge/schemas';
import type { GenerationMode } from '@metroforge/shared';
import { resolveAssetQualityProfile } from './quality-profiles.js';

export const VRAM_SAFETY_MARGIN = 0.15;
export const VRAM_WORKFLOW_OVERHEAD_MB = 512;
/** Matches `@metroforge/ai` DEFAULT_LOW_VRAM_BUDGET_MB — kept local so assets does not import ai. */
export const IMAGE_LOW_VRAM_BUDGET_MB = 8192;

/** Conservative default for a memory-efficient local diffusion workflow (quantized / schnell-class). */
export const LOCAL_GPU_IMAGE_ESTIMATED_VRAM_MB = 6144;
/** Qwen-Image-Edit-class local editors typically need more than an 8 GB card can hold. */
export const LOCAL_IMAGE_EDIT_ESTIMATED_VRAM_MB = 16384;

export interface ImageHardwareSnapshot {
  profile?: string;
  ramMb?: number;
  vramMb?: number;
  freeVramMb?: number;
}

export interface VramRoutingContext {
  mode?: GenerationMode;
  hardware?: ImageHardwareSnapshot;
  qualityProfile?: AssetQualityProfile;
  maxVramMb?: number;
}

export interface VramFitResult {
  ok: boolean;
  reason?: string;
  requiredMb?: number;
  usableMb?: number;
}

export function usableVramMb(hardware?: ImageHardwareSnapshot): number | undefined {
  if (!hardware?.vramMb || hardware.vramMb <= 0) return undefined;
  const totalUsable = Math.floor(hardware.vramMb * (1 - VRAM_SAFETY_MARGIN));
  if (hardware.freeVramMb != null && Number.isFinite(hardware.freeVramMb)) {
    return Math.max(0, Math.min(totalUsable, hardware.freeVramMb - VRAM_WORKFLOW_OVERHEAD_MB));
  }
  return totalUsable;
}

export function effectiveVramBudgetMb(context: VramRoutingContext): number | undefined {
  const usable = usableVramMb(context.hardware);
  if (usable == null) return context.maxVramMb;
  const spec = resolveAssetQualityProfile(context.qualityProfile, context.mode);
  let budget = Math.floor(usable * spec.vramBudgetFactor);
  const modeCap = context.mode === 'LOW_VRAM' ? IMAGE_LOW_VRAM_BUDGET_MB : undefined;
  const cap = context.maxVramMb ?? modeCap;
  if (cap != null) budget = Math.min(budget, cap);
  if (context.hardware?.vramMb) budget = Math.min(budget, context.hardware.vramMb);
  return Math.max(0, budget);
}

export function evaluateVramFit(
  registration: {
    local: boolean;
    estimatedVramMb?: number;
    supportsCpuOffload?: boolean;
  },
  context: VramRoutingContext,
): VramFitResult {
  if (!registration.local) return { ok: true };
  const required = registration.estimatedVramMb ?? 0;
  if (required <= 0) return { ok: true };

  const total = context.hardware?.vramMb;
  if (total == null) return { ok: true, requiredMb: required };

  if (required > total) {
    return {
      ok: false,
      requiredMb: required,
      usableMb: total,
      reason: `workflow footprint ${required} MiB exceeds total VRAM ${total} MiB`,
    };
  }

  const budget = effectiveVramBudgetMb(context);
  if (budget != null && required > budget && !registration.supportsCpuOffload) {
    return {
      ok: false,
      requiredMb: required,
      usableMb: budget,
      reason: `need ${required} MiB, usable VRAM budget ${budget} MiB`,
    };
  }

  return { ok: true, requiredMb: required, usableMb: budget ?? total };
}
