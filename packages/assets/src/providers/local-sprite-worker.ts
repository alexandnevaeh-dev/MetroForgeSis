import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getResourceRoot, resolvePythonExecutable } from '@metroforge/shared';

/**
 * Node <-> Python subprocess bridge for workers/local_sprite_worker.py — a free, fully local,
 * zero-network, zero-payment procedural sprite generator, following the exact same request/
 * response subprocess protocol packages/assets/src/providers/diffusers.ts already uses against
 * workers/diffusers_image_worker.py (one JSON object on stdin, one JSON object on stdout,
 * diagnostics/tracebacks on stderr only). Built as the "useful procedural generation path" this
 * repo's asset-engine research pass called for after directly verifying (not assuming) that
 * every one of the four externally-suggested candidates fails the free/local/no-payment
 * requirement for actual image generation — see docs/asset-pipeline/LOCAL_SPRITE_WORKER.md for
 * the exact, sourced findings per candidate.
 *
 * Deliberately its own small interface, not a forced fit into ImageGenerator
 * (packages/assets/src/types/image-gen.ts) — that interface models "one prompt in, one image
 * out"; this worker's real contract (capability discovery, a structured multi-frame sheet result,
 * explicit no-network/no-payment flags) doesn't match it and forcing it would have hidden real
 * capabilities behind an interface that has no field for them.
 */

export interface LocalAssetEngineCapabilities {
  ok: boolean;
  provider: string;
  modelId: string;
  version: string;
  kinds: string[];
  maxWidth: number;
  maxHeight: number;
  maxFrameCount: number;
  requiresNetwork: boolean;
  requiresPayment: boolean;
  requiresGpu: boolean;
  license: string;
  dependenciesOk: boolean;
  dependencyError: string | null;
  error?: string;
}

export interface LocalCharacterSheetRequest {
  action?: 'generate';
  kind: 'character_sheet';
  width: number;
  height: number;
  frameCount: number;
  seed: number;
  fill: [number, number, number];
  accent: [number, number, number];
}

export interface LocalAssetEngineError {
  code: string;
  message: string;
}

export interface LocalCharacterSheetResult {
  ok: boolean;
  provider: string;
  modelId?: string;
  seed?: number;
  imageBase64?: string;
  width?: number;
  height?: number;
  frameWidth?: number;
  frameHeight?: number;
  frameCount?: number;
  frameRects?: Array<{ x: number; y: number; width: number; height: number }>;
  license?: string;
  requiresNetwork?: boolean;
  requiresPayment?: boolean;
  error?: LocalAssetEngineError;
  /** Set locally (not by the worker) when the subprocess itself failed to run at all — a
   *  distinct failure class from a structured {ok:false, error} the worker deliberately returned. */
  subprocessFailure?: { reason: 'SPAWN_ERROR' | 'TIMEOUT' | 'CANCELLED' | 'NONZERO_EXIT' | 'BAD_JSON'; detail: string; exitCode?: number | null };
}

export interface LocalSpriteWorkerConfig {
  pythonPath?: string;
  workerPath?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class LocalSpriteWorkerProvider {
  readonly id = 'local-procedural-sprite-worker';
  private readonly pythonPath: string;
  private readonly workerPath: string;
  private readonly timeoutMs: number;

  constructor(config: LocalSpriteWorkerConfig = {}) {
    this.pythonPath = resolvePythonExecutable(config.pythonPath);
    this.workerPath = config.workerPath ?? join(getResourceRoot(), 'workers', 'local_sprite_worker.py');
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Real, cheap health/capability probe — no model load, no network, completes in well under a
   *  second. Reports dependenciesOk:false (with the real ImportError text) rather than throwing
   *  when Pillow genuinely isn't importable, matching this repo's "actionable dependency errors"
   *  convention elsewhere (e.g. DiffusersProvider's own health reporting). */
  async getCapabilities(signal?: AbortSignal): Promise<LocalAssetEngineCapabilities> {
    const result = await this.runWorker({ action: 'capabilities' }, signal);
    if (result.subprocessFailure) {
      return {
        ok: false,
        provider: this.id,
        modelId: '',
        version: '',
        kinds: [],
        maxWidth: 0,
        maxHeight: 0,
        maxFrameCount: 0,
        requiresNetwork: false,
        requiresPayment: false,
        requiresGpu: false,
        license: '',
        dependenciesOk: false,
        dependencyError: null,
        error: `${result.subprocessFailure.reason}: ${result.subprocessFailure.detail}`,
      };
    }
    return result as unknown as LocalAssetEngineCapabilities;
  }

  /** Generates one real character sprite sheet. No network call, no paid API, no model weights —
   *  the worker's own capabilities response declares requiresNetwork:false/requiresPayment:false
   *  and this method never contacts anything beyond the local subprocess. */
  async generate(request: LocalCharacterSheetRequest, signal?: AbortSignal): Promise<LocalCharacterSheetResult> {
    return this.runWorker({ ...request, action: 'generate' }, signal);
  }

  private async runWorker(payload: Record<string, unknown>, signal?: AbortSignal): Promise<LocalCharacterSheetResult> {
    if (!existsSync(this.workerPath)) {
      return {
        ok: false,
        provider: this.id,
        subprocessFailure: { reason: 'SPAWN_ERROR', detail: `worker script not found: ${this.workerPath}` },
      };
    }
    if (signal?.aborted) {
      return { ok: false, provider: this.id, subprocessFailure: { reason: 'CANCELLED', detail: 'aborted before start' } };
    }

    return new Promise<LocalCharacterSheetResult>((resolve) => {
      // Argument array only — no shell string interpolation anywhere in this call.
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(this.pythonPath, [this.workerPath], {
          cwd: dirname(this.workerPath),
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error) {
        resolve({ ok: false, provider: this.id, subprocessFailure: { reason: 'SPAWN_ERROR', detail: error instanceof Error ? error.message : String(error) } });
        return;
      }

      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (result: LocalCharacterSheetResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (onAbort) signal?.removeEventListener('abort', onAbort);
        resolve(result);
      };

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish({ ok: false, provider: this.id, subprocessFailure: { reason: 'TIMEOUT', detail: `exceeded ${this.timeoutMs}ms`, exitCode: null } });
      }, this.timeoutMs);

      let onAbort: (() => void) | undefined;
      if (signal) {
        onAbort = () => {
          child.kill('SIGTERM');
          finish({ ok: false, provider: this.id, subprocessFailure: { reason: 'CANCELLED', detail: 'aborted by caller' } });
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }

      child.on('error', (err) => {
        finish({ ok: false, provider: this.id, subprocessFailure: { reason: 'SPAWN_ERROR', detail: err.message } });
      });

      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });

      child.on('close', (exitCode) => {
        if (settled) return;
        if (exitCode !== 0) {
          finish({ ok: false, provider: this.id, subprocessFailure: { reason: 'NONZERO_EXIT', detail: stderr.trim() || `exit code ${exitCode}`, exitCode } });
          return;
        }
        try {
          const parsed = JSON.parse(stdout) as LocalCharacterSheetResult;
          finish(parsed);
        } catch (err) {
          finish({ ok: false, provider: this.id, subprocessFailure: { reason: 'BAD_JSON', detail: `${(err as Error).message} :: stdout=${stdout.slice(0, 200)}` } });
        }
      });

      child.stdin.on('error', (error) => {
        child.kill('SIGTERM');
        finish({ ok: false, provider: this.id, subprocessFailure: { reason: 'SPAWN_ERROR', detail: error.message } });
      });
      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    });
  }
}
