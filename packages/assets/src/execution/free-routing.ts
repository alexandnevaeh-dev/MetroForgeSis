import type { CostTier, ExecutionTarget } from './remote-worker.js';

export interface FreeRoutableBackend {
  id: string;
  target: ExecutionTarget;
  costTier: CostTier;
  readiness: string;
}

export interface FreeRoutingDecision {
  selected?: FreeRoutableBackend;
  rejectedPaid: FreeRoutableBackend[];
  rejectedNotReady: FreeRoutableBackend[];
  reason: string;
}

const READY_STATES = new Set(['REFERENCE_CAPABLE', 'REFERENCE_INVOCATION_VALIDATED', 'GPU_READY']);

/** FREE_ONLY execution-target routing order (never silently selects paid RunPod/Vast/Modal):
 *  validated Hugging Face ZeroGPU -> validated Lightning free-credit worker -> validated local
 *  provider -> Kaggle/manual batch -> REFERENCE_GENERATION_UNAVAILABLE. */
export function selectFreeExecutionRoute(backends: FreeRoutableBackend[], options: { allowPaid?: boolean } = {}): FreeRoutingDecision {
  const priority: Record<string, number> = {
    'huggingface-zerogpu': 0,
    'lightning-ai': 1,
    local: 2,
    'kaggle-notebook': 3,
  };
  const rejectedPaid = options.allowPaid ? [] : backends.filter((b) => b.costTier === 'PAID');
  const eligible = options.allowPaid ? backends : backends.filter((b) => b.costTier !== 'PAID');
  const ready = eligible.filter((b) => READY_STATES.has(b.readiness)).sort((a, b) => (priority[a.target.provider] ?? 99) - (priority[b.target.provider] ?? 99));
  const rejectedNotReady = eligible.filter((b) => !READY_STATES.has(b.readiness));

  if (ready.length > 0) {
    const [selected, ...rest] = ready;
    return { selected, rejectedPaid, rejectedNotReady: [...rejectedNotReady, ...rest], reason: `Selected ${selected.id} (${selected.costTier})` };
  }
  return { selected: undefined, rejectedPaid, rejectedNotReady, reason: 'REFERENCE_GENERATION_UNAVAILABLE: no free execution backend is currently ready' };
}
