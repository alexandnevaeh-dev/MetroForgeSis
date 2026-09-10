import type { CircuitBreakerConfig, CircuitState } from './types.js';
import { DEFAULT_CIRCUIT_BREAKER_CONFIG } from './types.js';

interface ProviderCircuit {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt?: number;
}

/**
 * Per-run, in-memory circuit breaker keyed by providerId. Scoped to one generation job (one
 * VisualProviderRegistry instance) — not persisted across CLI invocations, since "do not
 * repeatedly send every asset to a provider already proven unhealthy during the same generation
 * job" is the requirement, not cross-run learning (that's the separate, not-yet-built
 * performance-tracking memory in §34 of the task).
 */
export class VisualProviderCircuitBreaker {
  private readonly circuits = new Map<string, ProviderCircuit>();
  private readonly config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG) {
    this.config = config;
  }

  private get(providerId: string): ProviderCircuit {
    let circuit = this.circuits.get(providerId);
    if (!circuit) {
      circuit = { state: 'CLOSED', consecutiveFailures: 0 };
      this.circuits.set(providerId, circuit);
    }
    return circuit;
  }

  /** True when this provider may currently be attempted (CLOSED, or OPEN long enough to probe). */
  isAvailable(providerId: string): boolean {
    const circuit = this.get(providerId);
    if (circuit.state === 'CLOSED') return true;
    if (circuit.state === 'HALF_OPEN') return true;
    // OPEN: allow exactly one half-open probe once resetAfterMs has elapsed.
    if (circuit.openedAt !== undefined && Date.now() - circuit.openedAt >= this.config.resetAfterMs) {
      circuit.state = 'HALF_OPEN';
      return true;
    }
    return false;
  }

  recordSuccess(providerId: string): void {
    this.circuits.set(providerId, { state: 'CLOSED', consecutiveFailures: 0 });
  }

  recordFailure(providerId: string): void {
    const circuit = this.get(providerId);
    circuit.consecutiveFailures += 1;
    if (circuit.state === 'HALF_OPEN') {
      // The probe failed — stay open, reset the clock.
      circuit.state = 'OPEN';
      circuit.openedAt = Date.now();
      return;
    }
    if (circuit.consecutiveFailures >= this.config.failureThreshold) {
      circuit.state = 'OPEN';
      circuit.openedAt = Date.now();
    }
  }

  state(providerId: string): CircuitState {
    return this.get(providerId).state;
  }
}
