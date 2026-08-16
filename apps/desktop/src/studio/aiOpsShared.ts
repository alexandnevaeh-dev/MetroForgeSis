/** Shared AI-ops display helpers — map real backend strings; never invent routing decisions. */

export type HealthKind =
  | 'healthy'
  | 'degraded'
  | 'unavailable'
  | 'disabled'
  | 'unconfigured'
  | 'unknown'
  | 'checking';

export function normalizeHealth(raw: string | undefined | null): HealthKind {
  const s = String(raw ?? '').toLowerCase();
  if (!s) return 'unknown';
  if (s === 'healthy' || s === 'ok' || s === 'pass' || s === 'passed' || s === 'success') return 'healthy';
  if (s === 'degraded' || s === 'warn' || s === 'warning') return 'degraded';
  if (s === 'disabled') return 'disabled';
  if (s === 'unconfigured' || s === 'not_configured') return 'unconfigured';
  if (s === 'checking' || s === 'pending' || s === 'running') return 'checking';
  if (
    s === 'unavailable' ||
    s === 'offline' ||
    s === 'fail' ||
    s === 'failed' ||
    s === 'error' ||
    s === 'unhealthy'
  ) {
    return 'unavailable';
  }
  return 'unknown';
}

export function healthLabel(kind: HealthKind): string {
  switch (kind) {
    case 'healthy':
      return 'Healthy';
    case 'degraded':
      return 'Degraded';
    case 'unavailable':
      return 'Unavailable';
    case 'disabled':
      return 'Disabled';
    case 'unconfigured':
      return 'Unconfigured';
    case 'checking':
      return 'Checking';
    default:
      return 'Unknown';
  }
}

export function healthDotClass(kind: HealthKind): string {
  if (kind === 'healthy') return 'status-dot ok';
  if (kind === 'degraded' || kind === 'checking') return 'status-dot warn';
  if (kind === 'unavailable' || kind === 'disabled') return 'status-dot error';
  return 'status-dot';
}

/** UI tag codes mapped from backend rejection/reason text — display only. */
export type RejectionTagCode =
  | 'PROVIDER_OFFLINE'
  | 'PROVIDER_DISABLED'
  | 'KEY_MISSING'
  | 'HARDWARE_RAM'
  | 'HARDWARE_VRAM'
  | 'LICENSE_BLOCKED'
  | 'CAPABILITY_MISMATCH'
  | 'MODEL_UNAVAILABLE'
  | 'LOCALITY_POLICY'
  | 'MODE_POLICY'
  | 'OTHER';

export const REJECTION_TAG_LABELS: Record<RejectionTagCode, string> = {
  PROVIDER_OFFLINE: 'Provider offline',
  PROVIDER_DISABLED: 'Provider disabled',
  KEY_MISSING: 'Key missing',
  HARDWARE_RAM: 'RAM blocked',
  HARDWARE_VRAM: 'VRAM blocked',
  LICENSE_BLOCKED: 'License blocked',
  CAPABILITY_MISMATCH: 'Capability mismatch',
  MODEL_UNAVAILABLE: 'Model unavailable',
  LOCALITY_POLICY: 'Locality policy',
  MODE_POLICY: 'Mode policy',
  OTHER: 'Other',
};

export function mapRejectionReason(reason: string): RejectionTagCode {
  const r = reason.toLowerCase();
  if (/vram/i.test(r)) return 'HARDWARE_VRAM';
  if (/ram/i.test(r) && !/vram/i.test(r)) return 'HARDWARE_RAM';
  if (/not configured|key|api key|credential/i.test(r)) return 'KEY_MISSING';
  if (/disabled|not enabled/i.test(r)) return 'PROVIDER_DISABLED';
  if (/health|offline|unavailable|unreachable|not registered/i.test(r)) return 'PROVIDER_OFFLINE';
  if (/license/i.test(r)) return 'LICENSE_BLOCKED';
  if (/capability|not listed|modality/i.test(r)) return 'CAPABILITY_MISMATCH';
  if (/local only|not a local|locality|remote/i.test(r)) return 'LOCALITY_POLICY';
  if (/mode|free-tier|prefer/i.test(r)) return 'MODE_POLICY';
  if (/disabled|unavailable|excluded|not routable/i.test(r)) return 'MODEL_UNAVAILABLE';
  return 'OTHER';
}

export function uniqueRejectionTags(reasons: string[]): RejectionTagCode[] {
  const seen = new Set<RejectionTagCode>();
  const out: RejectionTagCode[] = [];
  for (const reason of reasons) {
    const tag = mapRejectionReason(reason);
    if (!seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

export function formatMbAsGb(mb: number | undefined | null): string {
  if (mb == null || Number.isNaN(mb)) return '—';
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

export type HardwareFitKind = 'Fits' | 'Low VRAM' | 'RAM blocked' | 'Cloud' | 'Unknown';

export function computeHardwareFit(
  model: {
    local?: boolean;
    minRamMb?: number;
    recommendedRamMb?: number;
    minVramMb?: number;
    recommendedVramMb?: number;
  },
  hardware: { totalRamMb?: number; vramMb?: number } | null,
): HardwareFitKind {
  if (!model.local) return 'Cloud';
  if (!hardware) return 'Unknown';
  const needRam = model.minRamMb ?? model.recommendedRamMb;
  if (needRam && hardware.totalRamMb != null && hardware.totalRamMb < needRam * 0.85) {
    return 'RAM blocked';
  }
  const needVram = model.minVramMb ?? model.recommendedVramMb;
  if (needVram && needVram > 0) {
    if (!hardware.vramMb || hardware.vramMb < needVram * 0.85) return 'Low VRAM';
  }
  return 'Fits';
}

/** Aggregate intentional zero-route blockers from real rejection rows. */
export function computeRouteBlockers(
  rejected: Array<{ reasons: string[] }>,
): Array<{ tag: RejectionTagCode; count: number; label: string }> {
  const counts = new Map<RejectionTagCode, number>();
  for (const entry of rejected) {
    const tags = uniqueRejectionTags(entry.reasons);
    const primary = tags[0] ?? 'OTHER';
    counts.set(primary, (counts.get(primary) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count, label: REJECTION_TAG_LABELS[tag] }))
    .sort((a, b) => b.count - a.count);
}

export function doctorCategory(name: string): string {
  const n = name.toLowerCase();
  if (/godot|python|git|ffmpeg|node|toolchain|cli|path/i.test(n)) return 'TOOLCHAIN';
  if (/ollama|nvidia|comfy|diffusers|provider|gemini|groq|openrouter|huggingface/i.test(n)) {
    return 'AI PROVIDERS';
  }
  if (/vision|critic|image/i.test(n)) return 'VISION';
  if (/disk|ram|vram|gpu|hardware/i.test(n)) return 'HARDWARE';
  return 'ENVIRONMENT';
}

/** Backend score factors already encoded in reason strings (e.g. "installed +50"). */
export function parseScoreFactorReasons(reasons: string[]): Array<{ label: string; detail: string }> {
  return reasons
    .filter((r) => /\+\d/.test(r) || /score|benchmark|installed|health|license|local|remote|vram|ram/i.test(r))
    .map((r) => {
      const plus = r.match(/^(.*?)\s*(\+\d+(?:\.\d+)?)\s*$/);
      if (plus) return { label: plus[1]!.trim() || r, detail: plus[2]! };
      return { label: r, detail: '' };
    });
}
