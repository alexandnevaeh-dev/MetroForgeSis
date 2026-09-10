import type { ExecutionTarget, ExecutionTargetType, RemoteVisualRequest, RemoteVisualResult, RemoteVisualWorkerClient } from './remote-worker.js';
import { HttpRemoteVisualWorkerClient } from './http-worker-client.js';
import { RemoteWorkerError } from './remote-worker.js';

export type RunPodReadiness = 'NOT_CONFIGURED' | 'AUTH_REQUIRED' | 'ENDPOINT_MISSING' | 'UNREACHABLE' | 'WORKER_UNHEALTHY' | 'GPU_READY' | 'REFERENCE_CAPABLE' | 'REFERENCE_INVOCATION_VALIDATED';

export type RunPodDeploymentMode = 'RUNPOD_POD' | 'RUNPOD_SERVERLESS';

export interface RunPodConfig {
  apiKey?: string;
  endpointId?: string;
  endpointUrl?: string;
  gpuProfile?: string;
  workerImage?: string;
  networkVolumeId?: string;
  modelProfile?: string;
  deploymentMode?: RunPodDeploymentMode;
  fetchImpl?: typeof fetch;
}

export interface RunPodDoctorReport {
  configured: boolean;
  authenticated: boolean;
  endpointConfigured: boolean;
  reachable: boolean;
  workerHealthy: boolean;
  readiness: RunPodReadiness;
  target: ExecutionTarget;
  deploymentMode: RunPodDeploymentMode;
  workerImage?: string;
  networkVolumeId?: string;
  modelProfile?: string;
  health?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  reason?: string;
  setupInstructions?: string[];
}

const NON_SECRET_SETUP_INSTRUCTIONS = [
  'Set RUNPOD_API_KEY (RunPod account API key — never commit it).',
  'Set RUNPOD_ENDPOINT_ID (or RUNPOD_ENDPOINT_URL to target a specific deployed endpoint).',
  'Optionally set RUNPOD_GPU_PROFILE to record the selected GPU class.',
  'Optionally set RUNPOD_WORKER_IMAGE to record the deployed container image/tag.',
  'Optionally set RUNPOD_NETWORK_VOLUME_ID to use persistent model storage.',
  'Optionally set RUNPOD_MODEL_PROFILE to select the installed reference model profile.',
  'Optionally set RUNPOD_DEPLOYMENT_MODE=RUNPOD_POD or RUNPOD_SERVERLESS.',
];

export class RunPodExecutionBackend implements RemoteVisualWorkerClient {
  readonly target: ExecutionTarget;
  readonly deploymentMode: RunPodDeploymentMode;
  private readonly client: HttpRemoteVisualWorkerClient | null;

  constructor(private readonly config: RunPodConfig = {}) {
    this.deploymentMode = config.deploymentMode ?? 'RUNPOD_POD';
    const endpoint = config.endpointUrl ?? (config.endpointId ? `https://api.runpod.ai/v2/${config.endpointId}` : undefined);
    const type: ExecutionTargetType = this.deploymentMode === 'RUNPOD_POD' ? 'RUNPOD_POD' : 'RUNPOD_SERVERLESS';
    this.target = {
      id: config.endpointId ? `runpod:${config.endpointId}` : 'runpod:unconfigured',
      type,
      location: 'remote',
      provider: 'runpod',
      endpoint,
      hardwareProfile: config.gpuProfile,
      capabilities: [],
      health: 'UNKNOWN',
      authenticationType: 'bearer',
      availability: endpoint ? 'configured' : 'unconfigured',
      costMetadata: { billingProvider: 'runpod', costClass: 'paid', costTier: 'PAID', gpuClass: config.gpuProfile },
    };
    this.client = endpoint ? new HttpRemoteVisualWorkerClient(this.target, config.apiKey, config.fetchImpl) : null;
  }

  async health(signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (!this.client) throw new RemoteWorkerError('RUNPOD_ENDPOINT_MISSING', 'RUNPOD_ENDPOINT_ID or endpoint URL is not configured');
    return this.client.health(signal);
  }

  async capabilities(signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (!this.client) throw new RemoteWorkerError('RUNPOD_ENDPOINT_MISSING', 'RUNPOD_ENDPOINT_ID or endpoint URL is not configured');
    return this.client.capabilities(signal);
  }

  async generate(request: RemoteVisualRequest, signal?: AbortSignal): Promise<RemoteVisualResult> {
    if (!this.client) throw new RemoteWorkerError('RUNPOD_ENDPOINT_MISSING', 'RUNPOD_ENDPOINT_ID or endpoint URL is not configured');
    return this.client.generate(request, signal);
  }

  async doctor(signal?: AbortSignal): Promise<RunPodDoctorReport> {
    const configured = Boolean(this.config.apiKey || this.config.endpointId || this.config.endpointUrl);
    const authenticated = Boolean(this.config.apiKey);
    const endpointConfigured = Boolean(this.target.endpoint);
    const base = {
      configured,
      authenticated,
      endpointConfigured,
      reachable: false,
      workerHealthy: false,
      readiness: 'NOT_CONFIGURED' as RunPodReadiness,
      target: this.target,
      deploymentMode: this.deploymentMode,
      workerImage: this.config.workerImage,
      networkVolumeId: this.config.networkVolumeId,
      modelProfile: this.config.modelProfile,
    };
    if (!configured) return { ...base, reason: 'RUNPOD_CONFIGURATION_REQUIRED: RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID are not configured', setupInstructions: NON_SECRET_SETUP_INSTRUCTIONS };
    if (!authenticated) return { ...base, readiness: 'AUTH_REQUIRED', reason: 'RUNPOD_AUTH_REQUIRED: RUNPOD_API_KEY is not configured', setupInstructions: NON_SECRET_SETUP_INSTRUCTIONS };
    if (!endpointConfigured) return { ...base, readiness: 'ENDPOINT_MISSING', reason: 'RUNPOD_ENDPOINT_ID or RUNPOD_ENDPOINT_URL is not configured', setupInstructions: NON_SECRET_SETUP_INSTRUCTIONS };
    try {
      const health = await this.health(signal);
      const capabilities = await this.capabilities(signal);
      const reference = Array.isArray(capabilities.capabilities) && capabilities.capabilities.includes('REFERENCE_IMAGE');
      return { ...base, reachable: true, workerHealthy: health.status === 'healthy' || health.status === 'ready', readiness: reference ? 'REFERENCE_CAPABLE' : 'GPU_READY', health, capabilities, reason: reference ? 'Remote worker advertises reference capability' : 'Remote worker is reachable but does not advertise reference capability' };
    } catch (error) {
      return { ...base, readiness: 'UNREACHABLE', reason: error instanceof Error ? error.message : String(error) };
    }
  }
}
