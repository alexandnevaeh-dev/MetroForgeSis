import type { ExecutionTarget, ExecutionTargetType, RemoteVisualRequest, RemoteVisualResult, RemoteVisualWorkerClient } from './remote-worker.js';
import { HttpRemoteVisualWorkerClient } from './http-worker-client.js';
import { RemoteWorkerError } from './remote-worker.js';

export type LightningReadiness =
  | 'NOT_CONFIGURED'
  | 'AUTH_REQUIRED'
  | 'ENDPOINT_MISSING'
  | 'UNREACHABLE'
  | 'WORKER_UNHEALTHY'
  | 'GPU_READY'
  | 'REFERENCE_CAPABLE'
  | 'REFERENCE_INVOCATION_VALIDATED';

export interface LightningConfig {
  apiKey?: string;
  studioUrl?: string;
  gpuType?: string;
  fetchImpl?: typeof fetch;
}

export interface LightningDoctorReport {
  configured: boolean;
  authenticated: boolean;
  endpointConfigured: boolean;
  reachable: boolean;
  workerHealthy: boolean;
  readiness: LightningReadiness;
  target: ExecutionTarget;
  gpuType?: string;
  health?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  reason?: string;
  setupInstructions?: string[];
}

const NON_SECRET_SETUP_INSTRUCTIONS = [
  'Deploy workers/remote-visual/ (unmodified) into a Lightning AI GPU Studio.',
  'Expose the worker HTTP port via the Lightning Studio app/port mechanism and set LIGHTNING_STUDIO_URL to that URL.',
  'Optionally set LIGHTNING_API_KEY if the exposed Studio endpoint requires bearer authentication.',
  'Optionally set LIGHTNING_GPU_TYPE to record the selected GPU class — prefer a high-memory GPU only for the brief Qwen probe, then stop the Studio.',
  'Lightning free monthly credits are FREE_CREDIT, not permanently free unlimited compute — avoid leaving GPU Studios running unnecessarily.',
];

/** Generic remote-worker profile for a Lightning AI GPU Studio — reuses the same
 *  workers/remote-visual/ HTTP protocol and RemoteVisualWorkerClient contract as RunPod,
 *  so AssetPipeline never couples directly to Lightning. */
export class LightningExecutionBackend implements RemoteVisualWorkerClient {
  readonly target: ExecutionTarget;
  private readonly client: HttpRemoteVisualWorkerClient | null;

  constructor(private readonly config: LightningConfig = {}) {
    const type: ExecutionTargetType = 'LIGHTNING_STUDIO';
    this.target = {
      id: config.studioUrl ? `lightning:${config.studioUrl}` : 'lightning:unconfigured',
      type,
      location: 'remote',
      provider: 'lightning-ai',
      endpoint: config.studioUrl,
      hardwareProfile: config.gpuType,
      capabilities: [],
      health: 'UNKNOWN',
      authenticationType: config.apiKey ? 'bearer' : 'none',
      availability: config.studioUrl ? 'configured' : 'unconfigured',
      costMetadata: { costClass: 'free-credit', costTier: 'FREE_CREDIT', billingProvider: 'lightning-ai', gpuClass: config.gpuType },
    };
    this.client = config.studioUrl ? new HttpRemoteVisualWorkerClient(this.target, config.apiKey, config.fetchImpl) : null;
  }

  async health(signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (!this.client) throw new RemoteWorkerError('LIGHTNING_ENDPOINT_MISSING', 'LIGHTNING_STUDIO_URL is not configured');
    return this.client.health(signal);
  }

  async capabilities(signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (!this.client) throw new RemoteWorkerError('LIGHTNING_ENDPOINT_MISSING', 'LIGHTNING_STUDIO_URL is not configured');
    return this.client.capabilities(signal);
  }

  async generate(request: RemoteVisualRequest, signal?: AbortSignal): Promise<RemoteVisualResult> {
    if (!this.client) throw new RemoteWorkerError('LIGHTNING_ENDPOINT_MISSING', 'LIGHTNING_STUDIO_URL is not configured');
    return this.client.generate(request, signal);
  }

  async doctor(signal?: AbortSignal): Promise<LightningDoctorReport> {
    const configured = Boolean(this.config.apiKey || this.config.studioUrl);
    const authenticated = Boolean(this.config.apiKey);
    const endpointConfigured = Boolean(this.target.endpoint);
    const base = {
      configured,
      authenticated,
      endpointConfigured,
      reachable: false,
      workerHealthy: false,
      readiness: 'NOT_CONFIGURED' as LightningReadiness,
      target: this.target,
      gpuType: this.config.gpuType,
    };
    if (!endpointConfigured) return { ...base, reason: 'LIGHTNING_CONFIGURATION_REQUIRED: LIGHTNING_STUDIO_URL is not configured', setupInstructions: NON_SECRET_SETUP_INSTRUCTIONS };
    try {
      const health = await this.health(signal);
      const capabilities = await this.capabilities(signal);
      const capsList = (capabilities as { capabilities?: unknown }).capabilities;
      const reference = Array.isArray(capsList) && capsList.includes('REFERENCE_IMAGE');
      return {
        ...base,
        reachable: true,
        workerHealthy: health.status === 'healthy' || health.status === 'ready',
        readiness: reference ? 'REFERENCE_CAPABLE' : 'GPU_READY',
        health,
        capabilities,
        reason: reference ? 'Lightning Studio worker advertises reference capability' : 'Lightning Studio worker is reachable but does not advertise reference capability',
      };
    } catch (error) {
      return { ...base, readiness: 'UNREACHABLE', reason: error instanceof Error ? error.message : String(error), setupInstructions: NON_SECRET_SETUP_INSTRUCTIONS };
    }
  }
}
