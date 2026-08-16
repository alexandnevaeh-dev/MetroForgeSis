import type { ImageProviderHealthStatus } from '../types/image-gen.js';

export interface CircuitState {
  status: ImageProviderHealthStatus;
  failures: number;
  openedAt?: number;
  cooldownMs: number;
}

const DEFAULT_COOLDOWN_MS = 60_000;
const OPEN_AFTER = 3;

export class ProviderHealthGate {
  private circuits = new Map<string, CircuitState>();

  recordSuccess(id: string): void {
    this.circuits.set(id, { status: 'HEALTHY', failures: 0, cooldownMs: DEFAULT_COOLDOWN_MS });
  }

  recordFailure(id: string, status: ImageProviderHealthStatus = 'UNAVAILABLE'): void {
    const prev = this.circuits.get(id);
    const failures = (prev?.failures ?? 0) + 1;
    const opened = failures >= OPEN_AFTER;
    this.circuits.set(id, {
      status,
      failures,
      openedAt: opened ? Date.now() : prev?.openedAt,
      cooldownMs: DEFAULT_COOLDOWN_MS,
    });
  }

  isOpen(id: string, now = Date.now()): boolean {
    const state = this.circuits.get(id);
    if (!state?.openedAt) return false;
    if (now - state.openedAt >= state.cooldownMs) {
      this.circuits.set(id, { ...state, openedAt: undefined, failures: 0, status: 'DEGRADED' });
      return false;
    }
    return true;
  }
}
