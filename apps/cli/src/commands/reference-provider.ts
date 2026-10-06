import { existsSync, mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import type { Command } from 'commander';
import { getPlatformInfo, getRepoRoot } from '@metroforge/shared';
import {
  foundryBootstrapFromEnv,
  registerFoundryImageProviders,
  ImageProviderRegistry,
  resolveImageProviderHealth,
  referenceStatusForRegistration,
  RunPodExecutionBackend,
  HuggingFaceSpaceExecutionBackend,
  LightningExecutionBackend,
  kaggleNotebookDoctor,
  colabNotebookDoctor,
  selectFreeExecutionRoute,
  sourceImageFromPath,
  validateTechnicalPng,
  decodePngRgba,
  encodePng,
  HF_QWEN_DETERMINISTIC_INFER,
  VLMCritic,
  HfTransportError,
  HfStageError,
} from '@metroforge/assets';
import type { FreeRoutableBackend } from '@metroforge/assets';

const CANONICAL_PLAYER_REFERENCE = {
  assetId: 'player',
  path: 'GeneratedGames/metroforge-smoke-metroidvania/assets/characters/player_production_reference.png',
  sha256: '1EF018239E5D1BD6F4A0DF35E5C803A6B1B8BC353590DA6ADAABA7B14CE00A2B',
};

const HF_QWEN_RUNNING_PROMPT =
  'Keep the exact same character identity, clothing, weapon, colors, body proportions, silhouette, and side-view art style. Change only the pose from standing to a dynamic running pose.';

function quantizeColor(r: number, g: number, b: number): number {
  return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
}

function foregroundStats(png: Buffer): { colors: Set<number>; bbox: { x0: number; y0: number; x1: number; y1: number; count: number }; width: number; height: number } {
  const { rgba, width, height } = decodePngRgba(png);
  const colors = new Set<number>();
  let x0 = width;
  let y0 = height;
  let x1 = 0;
  let y1 = 0;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3] ?? 255;
      const r = rgba[i]!;
      const g = rgba[i + 1]!;
      const b = rgba[i + 2]!;
      if (a <= 8) continue;
      if (r + g + b < 24 && a < 250) continue;
      colors.add(quantizeColor(r, g, b));
      count++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return { colors, bbox: { x0, y0, x1, y1, count }, width, height };
}

function jaccard(a: Set<number>, b: Set<number>): number {
  let inter = 0;
  for (const value of a) if (b.has(value)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function stitchSideBySide(left: Buffer, right: Buffer): Buffer {
  const a = decodePngRgba(left);
  const b = decodePngRgba(right);
  const height = Math.max(a.height, b.height);
  const width = a.width + b.width;
  const rgba = new Uint8Array(width * height * 4);
  const blit = (src: typeof a, ox: number) => {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const si = (y * src.width + x) * 4;
        const di = (y * width + ox + x) * 4;
        rgba[di] = src.rgba[si]!;
        rgba[di + 1] = src.rgba[si + 1]!;
        rgba[di + 2] = src.rgba[si + 2]!;
        rgba[di + 3] = src.rgba[si + 3] ?? 255;
      }
    }
  };
  blit(a, 0);
  blit(b, a.width);
  return encodePng(width, height, rgba);
}

function nearestNeighborScale(png: Buffer, targetW: number, targetH: number): Buffer {
  const src = decodePngRgba(png);
  const rgba = new Uint8Array(targetW * targetH * 4);
  for (let y = 0; y < targetH; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y / targetH) * src.height));
    for (let x = 0; x < targetW; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x / targetW) * src.width));
      const si = (sy * src.width + sx) * 4;
      const di = (y * targetW + x) * 4;
      rgba.set(src.rgba.subarray(si, si + 4), di);
    }
  }
  return encodePng(targetW, targetH, rgba);
}

function commandExists(command: string): boolean {
  try { execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [command], { encoding: 'utf8', windowsHide: true }); return true; } catch { return false; }
}

function pythonProbe(): Record<string, unknown> {
  try {
    const output = execFileSync(process.env.DIFFUSERS_PYTHON ?? 'python', ['-c', [
      'import importlib.util,json,sys',
      'r={"python":sys.version.split()[0]}',
      'r["packages"]={k:bool(importlib.util.find_spec(k)) for k in ["torch","diffusers","accelerate","transformers","safetensors","PIL","openvino"]}',
      'r["torch"]={}',
      'r["cuda_devices"]=[]',
      'r["openvino"]={"installed": bool(importlib.util.find_spec("openvino")), "devices": []}',
      'if r["packages"]["torch"]:',
      ' import torch; r["torch"]={"version":torch.__version__,"cuda_version":torch.version.cuda,"cuda_available":bool(torch.cuda.is_available()),"device_count":torch.cuda.device_count(),"mps_available":bool(hasattr(torch.backends,"mps") and torch.backends.mps.is_available())}',
      ' for i in range(torch.cuda.device_count()):',
      '  p=torch.cuda.get_device_properties(i); r["cuda_devices"].append({"index":i,"name":torch.cuda.get_device_name(i),"total_vram_bytes":p.total_memory,"compute_capability":f"{p.major}.{p.minor}","allocated_bytes":torch.cuda.memory_allocated(i),"reserved_bytes":torch.cuda.memory_reserved(i)})',
      ' if r["packages"]["openvino"]:',
      '  import openvino as ov; core = ov.Core(); r["openvino"]["devices"]=list(core.available_devices)',
      'print(json.dumps(r))',
    ].join('\n')], { encoding: 'utf8', windowsHide: true });
    return JSON.parse(output.trim()) as Record<string, unknown>;
  } catch (error) {
    return { python: 'MISSING', error: error instanceof Error ? error.message : String(error) };
  }
}

function windowsGpuProbe(): unknown {
  if (process.platform !== 'win32') return null;
  try {
    const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion,PNPDeviceID | ConvertTo-Json -Compress'], { encoding: 'utf8', windowsHide: true });
    return JSON.parse(output.trim() || '[]');
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function cudaVerdict(python: Record<string, unknown>): string {
  const torch = python.torch as Record<string, unknown> | undefined;
  if (!torch || typeof torch.cuda_available !== 'boolean') return 'CUDA_DEVICE_UNKNOWN';
  if (torch.cuda_available === true && Number(torch.device_count ?? 0) > 0) return 'CUDA_DEVICE_VALIDATED';
  return 'CUDA_RUNTIME_PRESENT_NO_USABLE_DEVICE';
}

function diskReport(): Record<string, unknown> {
  const modelDirectory = process.env.METROFORGE_MODELS_DIR ?? join(process.cwd(), 'models');
  try {
    const stats = statfsSync(modelDirectory);
    return { modelDirectory, drive: parse(modelDirectory).root || null, availableBytes: stats.bavail * stats.bsize, blockSize: stats.bsize, note: 'No download performed.' };
  } catch {
    return { modelDirectory, drive: parse(modelDirectory).root || null, availableBytes: null, note: 'Directory is not created yet; installer must validate its parent before download.' };
  }
}

function modelFilesPresent(model: Record<string, unknown>, root: string): boolean {
  const installPath = join(root, String(model.localPath ?? 'models'));
  if (!existsSync(installPath)) return false;
  const id = String(model.id);
  if (id === 'sdxl-base-1.0') return existsSync(join(installPath, 'model_index.json')) && existsSync(join(installPath, 'unet')) && existsSync(join(installPath, 'vae'));
  if (id === 'ip-adapter-sdxl') return existsSync(join(installPath, 'ip-adapter_sdxl.bin')) || existsSync(join(installPath, 'ip_adapter.bin'));
  return existsSync(join(installPath, 'model_index.json')) || existsSync(join(installPath, 'config.json'));
}

export function registerReferenceProviderCommands(program: Command): void {
  program.command('providers:hardware:doctor')
    .description('Inspect local hardware and reference-provider prerequisites without downloading models')
    .action(() => {
      const python = pythonProbe();
      const torch = (python.torch as Record<string, unknown> | undefined) ?? {};
      const openvino = (python.openvino as Record<string, unknown> | undefined) ?? {};
      const platformInfo = getPlatformInfo();
      const computeBackends = {
        cuda: { available: Boolean(torch.cuda_available && Number(torch.device_count ?? 0) > 0), device: (torch.cuda_available && Number(torch.device_count ?? 0) > 0) ? 'cuda' : null },
        openvino_gpu: { available: Boolean(openvino.installed && Array.isArray(openvino.devices) && (openvino.devices as unknown[]).some((device) => String(device).toUpperCase().startsWith('GPU'))), device: Array.isArray(openvino.devices) ? String((openvino.devices as unknown[]).find((device) => String(device).toUpperCase().startsWith('GPU')) ?? '') || null : null },
        mps: { available: torch.mps_available === true, device: torch.mps_available === true ? 'mps' : null },
        cpu: { available: true, device: 'cpu' },
      };
      const diffusersModelId = process.env.DIFFUSERS_MODEL_ID ?? 'stabilityai/sdxl-turbo';
      const openvinoModelPrepared = existsSync(join(getRepoRoot(), 'models', 'openvino', '3bc9c7f7b000b0ba', 'model_index.json'));
      const openvinoModelCompatible = diffusersModelId === 'sd-1.5' || diffusersModelId === 'runwayml/stable-diffusion-v1-5';
      const recommended = computeBackends.cuda.available ? 'cuda' : computeBackends.openvino_gpu.available && openvinoModelPrepared && openvinoModelCompatible ? 'openvino_gpu' : 'cpu';
      const report = {
        os: process.platform,
        architecture: process.arch,
        runtime: platformInfo.runtime,
        cpu: cpus()[0]?.model || process.env.PROCESSOR_IDENTIFIER || 'unknown',
        nvidiaSmi: commandExists('nvidia-smi'),
        python,
        windowsGpu: windowsGpuProbe(),
        comfyCli: commandExists('comfy'),
        cudaVerdict: cudaVerdict(python),
        intelGpuDetected: Boolean(openvino.installed || /intel/i.test(String(process.env.PROCESSOR_IDENTIFIER ?? ''))),
        openvino: openvino,
        openvinoModelPrepared,
        platformCapabilities: platformInfo.capabilities,
        availableComputeBackends: computeBackends,
        recommendedDiffusionBackend: recommended,
        diffusersModelId,
        modelStorage: diskReport(),
        recommendation: recommended === 'cpu' && process.platform === 'darwin'
          ? 'Recommended: CPU or a configured remote provider. Metal hardware is present, but local MPS inference is unavailable until a real PyTorch/MPS provider runtime is installed and validated.'
          : recommended === 'cpu'
          ? 'Recommended: cpu. Optional acceleration: install/configure OpenVINO where supported.'
          : `Recommended: ${recommended}. Fallback: ${recommended === 'cuda' ? 'cpu' : 'cpu'}`,
      };
      console.log(JSON.stringify(report, null, 2));
    });

  program.command('providers:diffusers:doctor')
    .description('Inspect the isolated Diffusers runtime and IP-Adapter model readiness without loading or downloading weights')
    .action(async () => {
      const provider = new (await import('@metroforge/assets')).DiffusersProvider({
        pythonPath: process.env.DIFFUSERS_PYTHON,
        modelId: process.env.DIFFUSERS_SDXL_BASE_MODEL_ID ?? process.env.DIFFUSERS_MODEL_ID,
        baseModelPath: process.env.DIFFUSERS_BASE_MODEL_PATH,
        ipAdapterRepo: process.env.DIFFUSERS_IP_ADAPTER_REPO,
        ipAdapterWeight: process.env.DIFFUSERS_IP_ADAPTER_WEIGHT,
      });
      console.log(JSON.stringify(await provider.getHealthReport?.(), null, 2));
    });

  program.command('providers:runpod:doctor')
    .description('Inspect the configured RunPod remote visual worker without exposing credentials')
    .action(async () => {
      const report = await new RunPodExecutionBackend({
        apiKey: process.env.RUNPOD_API_KEY,
        endpointId: process.env.RUNPOD_ENDPOINT_ID,
        endpointUrl: process.env.RUNPOD_ENDPOINT_URL,
        gpuProfile: process.env.RUNPOD_GPU_PROFILE,
        workerImage: process.env.RUNPOD_WORKER_IMAGE,
        networkVolumeId: process.env.RUNPOD_NETWORK_VOLUME_ID,
        modelProfile: process.env.RUNPOD_MODEL_PROFILE,
        deploymentMode: process.env.RUNPOD_DEPLOYMENT_MODE as 'RUNPOD_POD' | 'RUNPOD_SERVERLESS' | undefined,
      }).doctor();
      console.log(JSON.stringify(report, null, 2));
      if (report.setupInstructions?.length) console.error(report.setupInstructions.join('\n'));
      if (report.readiness === 'NOT_CONFIGURED' || report.readiness === 'AUTH_REQUIRED' || report.readiness === 'ENDPOINT_MISSING') process.exitCode = 2;
    });

  program.command('providers:remote:doctor')
    .description('Inspect configured remote MetroForge visual worker targets')
    .action(async () => {
      const workers = [];
      const runpod = await new RunPodExecutionBackend({
        apiKey: process.env.RUNPOD_API_KEY,
        endpointId: process.env.RUNPOD_ENDPOINT_ID,
        endpointUrl: process.env.RUNPOD_ENDPOINT_URL,
        gpuProfile: process.env.RUNPOD_GPU_PROFILE,
        workerImage: process.env.RUNPOD_WORKER_IMAGE,
        networkVolumeId: process.env.RUNPOD_NETWORK_VOLUME_ID,
        modelProfile: process.env.RUNPOD_MODEL_PROFILE,
        deploymentMode: process.env.RUNPOD_DEPLOYMENT_MODE as 'RUNPOD_POD' | 'RUNPOD_SERVERLESS' | undefined,
      }).doctor();
      workers.push(runpod);
      if (process.env.METROFORGE_REMOTE_WORKER_URL) workers.push({ id: 'custom-remote-worker', endpoint: process.env.METROFORGE_REMOTE_WORKER_URL, readiness: 'CONFIGURED', authentication: process.env.METROFORGE_REMOTE_WORKER_TOKEN ? 'bearer-configured' : 'AUTH_REQUIRED' });
      console.log(JSON.stringify({ generatedAt: new Date().toISOString(), workers }, null, 2));
    });

  program.command('providers:huggingface:doctor')
    .description('Discover a Hugging Face ZeroGPU Space API without exposing tokens or making a live generation call')
    .action(async () => {
      const report = await new HuggingFaceSpaceExecutionBackend({
        token: process.env.HF_TOKEN,
        spaceId: process.env.HF_SPACE_ID,
        apiName: process.env.HF_SPACE_API_NAME,
      }).doctor();
      console.log(JSON.stringify(report, null, 2));
      console.error(
        [
          `Space: ${report.spaceId ?? 'NOT_CONFIGURED'}`,
          `HF token: ${report.hfTokenConfigured ? 'CONFIGURED' : 'MISSING'}`,
          `API discovery: ${report.apiDiscovery}`,
          `Space reachable: ${report.spaceReachable ? 'YES' : 'NO'}`,
          `Authentication attached: ${report.authenticationAttached ? 'YES' : 'NO'}`,
          `ZeroGPU: ${report.zeroGpuDetected}`,
          `Reference capability: ${report.referenceCapability ? 'YES' : 'NO'}`,
          `Last quota state: ${report.lastQuotaState}`,
        ].join('\n'),
      );
      if (report.setupInstructions?.length) console.error(report.setupInstructions.join('\n'));
      if (report.readiness !== 'REFERENCE_CAPABLE' && report.readiness !== 'REFERENCE_INVOCATION_VALIDATED') process.exitCode = 2;
    });

  program.command('providers:lightning:doctor')
    .description('Inspect a Lightning AI Studio remote worker without exposing credentials')
    .action(async () => {
      const report = await new LightningExecutionBackend({
        apiKey: process.env.LIGHTNING_API_KEY,
        studioUrl: process.env.LIGHTNING_STUDIO_URL,
        gpuType: process.env.LIGHTNING_GPU_TYPE,
      }).doctor();
      console.log(JSON.stringify(report, null, 2));
      if (report.setupInstructions?.length) console.error(report.setupInstructions.join('\n'));
      if (report.readiness === 'NOT_CONFIGURED' || report.readiness === 'AUTH_REQUIRED' || report.readiness === 'UNREACHABLE') process.exitCode = 2;
    });

  program.command('providers:kaggle:doctor')
    .description('Report the Kaggle development/benchmarking profile state (manual export/import contract, never a live API)')
    .action(() => {
      const report = kaggleNotebookDoctor({ username: process.env.KAGGLE_USERNAME, key: process.env.KAGGLE_KEY, notebookSlug: process.env.KAGGLE_NOTEBOOK_SLUG });
      console.log(JSON.stringify(report, null, 2));
      if (report.setupInstructions?.length) console.error(report.setupInstructions.join('\n'));
    });

  program.command('providers:colab:doctor')
    .description('Report the Colab experimental/manual profile state (interactive-only, never a persistent worker)')
    .action(() => {
      const report = colabNotebookDoctor({ notebookUrl: process.env.COLAB_NOTEBOOK_URL });
      console.log(JSON.stringify(report, null, 2));
      console.error(report.setupInstructions.join('\n'));
    });

  program.command('providers:free:route')
    .description('Show the FREE_ONLY execution-target routing decision across HF ZeroGPU, Lightning, and local — never silently selects paid RunPod')
    .option('--allow-paid', 'Permit paid backends (e.g. RunPod) to be considered')
    .action(async (options: { allowPaid?: boolean }) => {
      const hf = await new HuggingFaceSpaceExecutionBackend({ token: process.env.HF_TOKEN, spaceId: process.env.HF_SPACE_ID, apiName: process.env.HF_SPACE_API_NAME }).doctor();
      const lightning = await new LightningExecutionBackend({ apiKey: process.env.LIGHTNING_API_KEY, studioUrl: process.env.LIGHTNING_STUDIO_URL, gpuType: process.env.LIGHTNING_GPU_TYPE }).doctor();
      const runpod = await new RunPodExecutionBackend({ apiKey: process.env.RUNPOD_API_KEY, endpointId: process.env.RUNPOD_ENDPOINT_ID, endpointUrl: process.env.RUNPOD_ENDPOINT_URL }).doctor();
      const backends: FreeRoutableBackend[] = [
        { id: 'huggingface-zerogpu', target: hf.spaceId ? { id: `hf-space:${hf.spaceId}`, type: 'HF_ZEROGPU_SPACE', location: 'remote', provider: 'huggingface-zerogpu', capabilities: [], health: 'UNKNOWN' } : { id: 'hf-space:unconfigured', type: 'HF_ZEROGPU_SPACE', location: 'remote', provider: 'huggingface-zerogpu', capabilities: [], health: 'UNKNOWN' }, costTier: 'FREE_QUOTA', readiness: hf.readiness },
        { id: 'lightning-ai', target: { id: 'lightning', type: 'LIGHTNING_STUDIO', location: 'remote', provider: 'lightning-ai', capabilities: [], health: 'UNKNOWN' }, costTier: 'FREE_CREDIT', readiness: lightning.readiness },
        { id: 'runpod', target: { id: 'runpod', type: 'RUNPOD_POD', location: 'remote', provider: 'runpod', capabilities: [], health: 'UNKNOWN' }, costTier: 'PAID', readiness: runpod.readiness },
      ];
      const decision = selectFreeExecutionRoute(backends, { allowPaid: Boolean(options.allowPaid) });
      console.log(JSON.stringify({ generatedAt: new Date().toISOString(), allowPaid: Boolean(options.allowPaid), decision }, null, 2));
      if (!decision.selected) process.exitCode = 2;
    });

  program.command('providers:reference:probe:free')
    .alias('providers:huggingface:reference:probe')
    .description('Attempt exactly one live standing-to-running reference invocation against the configured free provider (HF ZeroGPU by default)')
    .option('--target <target>', 'Free execution target: huggingface | lightning', 'huggingface')
    .action(async (options: { target: string }) => {
      const repoRoot = getRepoRoot();
      if (options.target === 'huggingface' && !process.env.HF_TOKEN) {
        console.log(JSON.stringify({ success: false, target: options.target, hfTokenConfigured: false, error: { code: 'HF_AUTH_REQUIRED', message: 'HF_TOKEN is not configured; stopping before making any live authenticated request. Set HF_TOKEN in the repo .env (never commit it) or export it in the shell, then re-run pnpm providers:huggingface:doctor.' } }, null, 2));
        console.error('HF_AUTH_REQUIRED');
        process.exitCode = 2;
        return;
      }
      const canonicalPath = join(repoRoot, CANONICAL_PLAYER_REFERENCE.path);
      const source = sourceImageFromPath(CANONICAL_PLAYER_REFERENCE.assetId, canonicalPath, CANONICAL_PLAYER_REFERENCE.sha256);
      const backend =
        options.target === 'lightning'
          ? new LightningExecutionBackend({ apiKey: process.env.LIGHTNING_API_KEY, studioUrl: process.env.LIGHTNING_STUDIO_URL, gpuType: process.env.LIGHTNING_GPU_TYPE })
          : new HuggingFaceSpaceExecutionBackend({ token: process.env.HF_TOKEN, spaceId: process.env.HF_SPACE_ID, apiName: process.env.HF_SPACE_API_NAME });
      try {
        const result = await backend.generate({
          requestId: `free-probe-${Date.now()}`,
          assetId: source.assetId,
          capability: 'REFERENCE_IMAGE',
          providerModel: process.env.HF_SPACE_ID ?? 'unknown',
          prompt: HF_QWEN_RUNNING_PROMPT,
          seed: HF_QWEN_DETERMINISTIC_INFER.seed,
          width: HF_QWEN_DETERMINISTIC_INFER.width,
          height: HF_QWEN_DETERMINISTIC_INFER.height,
          sourceImages: [source],
          conditioning: {
            rewritePrompt: HF_QWEN_DETERMINISTIC_INFER.rewritePrompt,
            randomizeSeed: HF_QWEN_DETERMINISTIC_INFER.randomizeSeed,
            trueGuidanceScale: HF_QWEN_DETERMINISTIC_INFER.trueGuidanceScale,
            numInferenceSteps: HF_QWEN_DETERMINISTIC_INFER.numInferenceSteps,
          },
        });
        const output = result.image;
        if (!output) throw new Error('Provider reported success without an image buffer');
        const technical = validateTechnicalPng(output);
        const mimeOk = output[0] === 137 && output.toString('ascii', 1, 4) === 'PNG';
        const outputHash = result.outputSha256 ?? createHash('sha256').update(output).digest('hex').toUpperCase();
        const differsFromInput = outputHash !== source.sha256;
        const technicalPass = technical.valid && mimeOk && differsFromInput;
        const srcStats = foregroundStats(source.bytes);
        const outStats = foregroundStats(output);
        const paletteOverlap = jaccard(srcStats.colors, outStats.colors);
        const srcAspect = (srcStats.bbox.x1 - srcStats.bbox.x0 + 1) / Math.max(1, srcStats.bbox.y1 - srcStats.bbox.y0 + 1);
        const outAspect = (outStats.bbox.x1 - outStats.bbox.x0 + 1) / Math.max(1, outStats.bbox.y1 - outStats.bbox.y0 + 1);
        const identityPass = technicalPass && paletteOverlap >= 0.28;
        const posePass = technicalPass && Math.abs(outAspect - srcAspect) >= 0.08;
        let vlmQa: Record<string, unknown> = { status: 'NOT_RUN' };
        const critic = new VLMCritic({ ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434' });
        if (await critic.isAvailable()) {
          const critique = await critic.critique({ image: output, assetType: 'character', artDirection: 'same character identity, standing to running pose' });
          vlmQa = { status: 'RUN', passed: critique.passed, score: critique.score, issues: critique.issues, description: critique.description };
        }
        const evidenceDir = join(repoRoot, 'GeneratedGames', 'metroforge-smoke-metroidvania', 'qa', 'hf-qwen-invocation');
        mkdirSync(evidenceDir, { recursive: true });
        writeFileSync(join(evidenceDir, 'canonical.png'), source.bytes);
        writeFileSync(join(evidenceDir, 'generated_running.png'), output);
        writeFileSync(join(evidenceDir, 'side_by_side.png'), stitchSideBySide(source.bytes, output));
        writeFileSync(join(evidenceDir, 'native_scale.png'), stitchSideBySide(nearestNeighborScale(source.bytes, 64, 64), nearestNeighborScale(output, 64, 64)));
        const validated = technicalPass && identityPass && posePass && Boolean(result.provenance.referenceInputUsed);
        const report = {
          success: result.success,
          referenceInvocationValidated: validated,
          requestId: result.requestId,
          provider: result.provider,
          model: result.model,
          durationMs: result.durationMs,
          outputSha256: outputHash,
          provenance: result.provenance,
          technicalQa: { passed: technicalPass, mimeOk, decode: technical, differsFromInput, issues: technical.issues },
          identityQa: { passed: identityPass, paletteOverlap, method: 'deterministic-palette-jaccard', note: 'Does not claim same-character success merely because a reference image was supplied.' },
          poseQa: { passed: posePass, sourceAspect: srcAspect, outputAspect: outAspect, method: 'foreground-bbox-aspect-shift' },
          vlmQa,
          nativeScale: { written: true, directory: evidenceDir },
        };
        console.log(JSON.stringify(report, null, 2));
        if (validated) console.error('REFERENCE_INVOCATION_VALIDATED');
        else process.exitCode = 2;
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? (error as { code?: string }).code : undefined;
        const transport = error instanceof HfTransportError ? error.toDiagnostic() : undefined;
        const stage = error instanceof HfStageError ? error.stage : undefined;
        const httpStatus = error instanceof HfStageError ? error.httpStatus : undefined;
        const httpStatusText = error instanceof HfStageError ? error.httpStatusText : undefined;
        console.log(JSON.stringify({
          success: false,
          target: options.target,
          error: error instanceof Error
            ? {
                code,
                message: error.message,
                classification: code === 'HF_ZERO_GPU_QUOTA_EXHAUSTED' || code === 'HF_ZERO_GPU_QUEUE_BUSY' || code === 'HF_ZERO_GPU_RATE_LIMITED' ? 'EXECUTION_CAPACITY_FAILURE' : 'NOT_A_CAPACITY_FAILURE',
                ...(transport ? { stage: transport.stage, causeCode: transport.causeCode, causeName: transport.causeName, causeMessage: transport.causeMessage, causeErrno: transport.causeErrno, causeSyscall: transport.causeSyscall } : {}),
                ...(stage ? { stage } : {}),
                ...(typeof httpStatus === 'number' ? { httpStatus } : {}),
                ...(httpStatusText ? { httpStatusText } : {}),
              }
            : String(error),
        }, null, 2));
        process.exitCode = 2;
      }
    });


  program.command('remote:worker:build')
    .description('Report the buildable remote worker image context without pushing anywhere')
    .action(() => {
      const root = process.cwd();
      const workerDir = join(root, 'workers', 'remote-visual');
      const dockerfile = join(workerDir, 'Dockerfile');
      const requirements = join(workerDir, 'requirements.txt');
      const server = join(workerDir, 'server.py');
      const report = {
        generatedAt: new Date().toISOString(),
        workerDir,
        dockerfilePresent: existsSync(dockerfile),
        requirementsPresent: existsSync(requirements),
        serverPresent: existsSync(server),
        buildCommand: `docker build -t <registry>/metroforge-remote-visual:<tag> ${workerDir}`,
        note: 'Build/push is not executed automatically; run the printed docker command from an environment with Docker and registry credentials.',
      };
      console.log(JSON.stringify(report, null, 2));
      if (!report.dockerfilePresent || !report.requirementsPresent || !report.serverPresent) process.exitCode = 2;
    });

  program.command('remote:worker:deploy')
    .description('Report the deployment plan/state for a remote worker target (does not call any live API without credentials)')
    .option('--target <target>', 'Execution target (currently only "runpod" is supported)', 'runpod')
    .action(async (options: { target: string }) => {
      if (options.target !== 'runpod') { console.error(`UNSUPPORTED_TARGET: ${options.target}`); process.exitCode = 2; return; }
      const report = await new RunPodExecutionBackend({
        apiKey: process.env.RUNPOD_API_KEY,
        endpointId: process.env.RUNPOD_ENDPOINT_ID,
        endpointUrl: process.env.RUNPOD_ENDPOINT_URL,
        gpuProfile: process.env.RUNPOD_GPU_PROFILE,
        workerImage: process.env.RUNPOD_WORKER_IMAGE,
        networkVolumeId: process.env.RUNPOD_NETWORK_VOLUME_ID,
        modelProfile: process.env.RUNPOD_MODEL_PROFILE,
        deploymentMode: process.env.RUNPOD_DEPLOYMENT_MODE as 'RUNPOD_POD' | 'RUNPOD_SERVERLESS' | undefined,
      }).doctor();
      console.log(JSON.stringify({ generatedAt: new Date().toISOString(), target: options.target, deploymentMode: report.deploymentMode, readiness: report.readiness, setupInstructions: report.setupInstructions ?? [] }, null, 2));
      if (report.readiness === 'NOT_CONFIGURED' || report.readiness === 'AUTH_REQUIRED' || report.readiness === 'ENDPOINT_MISSING') { console.error('RUNPOD_CONFIGURATION_REQUIRED: deployment cannot proceed without RunPod credentials and endpoint configuration.'); process.exitCode = 2; }
    });

  program.command('remote:model:install')
    .description('Report the reference-model installation plan for a remote worker target/profile (no live download without credentials)')
    .option('--target <target>', 'Execution target (currently only "runpod" is supported)', 'runpod')
    .option('--profile <name>', 'Model profile', 'qwen-image-edit')
    .action(async (options: { target: string; profile: string }) => {
      if (options.target !== 'runpod') { console.error(`UNSUPPORTED_TARGET: ${options.target}`); process.exitCode = 2; return; }
      const report = await new RunPodExecutionBackend({
        apiKey: process.env.RUNPOD_API_KEY,
        endpointId: process.env.RUNPOD_ENDPOINT_ID,
        endpointUrl: process.env.RUNPOD_ENDPOINT_URL,
        networkVolumeId: process.env.RUNPOD_NETWORK_VOLUME_ID,
        modelProfile: options.profile,
        deploymentMode: process.env.RUNPOD_DEPLOYMENT_MODE as 'RUNPOD_POD' | 'RUNPOD_SERVERLESS' | undefined,
      }).doctor();
      const plan = {
        generatedAt: new Date().toISOString(),
        target: options.target,
        profile: options.profile,
        modelId: 'Qwen/Qwen-Image-Edit-2509',
        revision: 'main',
        readiness: report.readiness,
        approvalRequired: true,
        note: 'Model install happens inside the deployed RunPod worker container (huggingface_hub download at first load). This command only reports whether the target is reachable/authorized to receive that deployment.',
      };
      console.log(JSON.stringify(plan, null, 2));
      if (report.readiness === 'NOT_CONFIGURED' || report.readiness === 'AUTH_REQUIRED' || report.readiness === 'ENDPOINT_MISSING') { console.error('RUNPOD_CONFIGURATION_REQUIRED: model install cannot proceed without RunPod credentials and endpoint configuration.'); process.exitCode = 2; }
    });

  program.command('remote:model:doctor')
    .description('Inspect model readiness state reported by a deployed remote worker target')
    .option('--target <target>', 'Execution target (currently only "runpod" is supported)', 'runpod')
    .action(async (options: { target: string }) => {
      if (options.target !== 'runpod') { console.error(`UNSUPPORTED_TARGET: ${options.target}`); process.exitCode = 2; return; }
      const report = await new RunPodExecutionBackend({
        apiKey: process.env.RUNPOD_API_KEY,
        endpointId: process.env.RUNPOD_ENDPOINT_ID,
        endpointUrl: process.env.RUNPOD_ENDPOINT_URL,
        modelProfile: process.env.RUNPOD_MODEL_PROFILE,
        deploymentMode: process.env.RUNPOD_DEPLOYMENT_MODE as 'RUNPOD_POD' | 'RUNPOD_SERVERLESS' | undefined,
      }).doctor();
      console.log(JSON.stringify({ generatedAt: new Date().toISOString(), target: options.target, readiness: report.readiness, health: report.health ?? null, setupInstructions: report.setupInstructions ?? [] }, null, 2));
      if (report.readiness !== 'REFERENCE_CAPABLE' && report.readiness !== 'REFERENCE_INVOCATION_VALIDATED') process.exitCode = 2;
    });

  program.command('models:install-reference')
    .description('Plan or explicitly approve installation of the catalog-selected Diffusers IP-Adapter stack')
    .option('--profile <name>', 'Reference profile', 'player-ip-adapter')
    .option('--approve-downloads', 'Authorize package/model downloads')
    .action((options: { profile: string; approveDownloads?: boolean }) => {
      const root = process.cwd();
      const profiles = JSON.parse(readFileSync(join(root, 'config', 'reference-profiles.json'), 'utf8')) as Record<string, Record<string, unknown>>;
      const profile = profiles[options.profile];
      if (!profile) throw new Error(`Unknown reference profile: ${options.profile}`);
      const catalog = JSON.parse(readFileSync(join(root, 'config', 'models.catalog.json'), 'utf8')) as { models: Array<Record<string, unknown>> };
      const ids = [profile.baseModel, profile.adapter, profile.imageEncoder].map(String);
      const models = ids.map((id) => catalog.models.find((model) => model.id === id)).filter(Boolean) as Array<Record<string, unknown>>;
      const expectedSizeMb = models.reduce((sum, model) => sum + Number(model.downloadSizeMb ?? 0), 0);
      const plan = {
        profile: options.profile,
        runtime: profile.runtime,
        models: models.map((model) => ({ id: model.id, repository: model.repository, localPath: model.localPath, downloadSizeMb: model.downloadSizeMb, license: model.license, commercialUse: model.commercialUse })),
        expectedInstallSizeMb: expectedSizeMb,
        temporaryDownloadOverheadMb: Math.ceil(expectedSizeMb * 0.2),
        modelDirectory: process.env.METROFORGE_MODELS_DIR ?? join(root, 'models'),
        pythonEnvironment: process.env.DIFFUSERS_PYTHON ?? join(root, '.metroforge', 'python', 'Scripts', 'python.exe'),
        requirements: join(root, 'workers', 'requirements-diffusers.txt'),
        automaticDownload: false,
      };
      console.log(JSON.stringify(plan, null, 2));
      if (!options.approveDownloads) {
        console.error('REFERENCE_MODEL_DOWNLOAD_APPROVAL_REQUIRED');
        process.exitCode = 2;
        return;
      }
      console.error('REFERENCE_MODEL_DOWNLOAD_APPROVAL_REQUIRED: package/model installer execution is intentionally not started until the approved environment and licenses are confirmed.');
      process.exitCode = 2;
    });

  program.command('models:doctor')
    .description('Report fleet model installation, hardware practicality, execution targets, and license state')
    .action(() => {
      const root = process.cwd();
      const catalog = JSON.parse(readFileSync(join(root, 'config', 'models.catalog.json'), 'utf8')) as { models: Array<Record<string, unknown>> };
      const hardware = pythonProbe();
      const torch = (hardware.torch ?? {}) as Record<string, unknown>;
      const cuda = torch.cuda_available === true && Number(torch.device_count ?? 0) > 0;
      const visualIds = new Set(['qwen-image-edit-2509', 'dreamo-v1.1', 'sdxl-base-1.0', 'ip-adapter-sdxl', 'controlnet-openpose-sdxl', 'pulid-optional']);
      const models = catalog.models.filter((model) => visualIds.has(String(model.id))).map((model) => {
        const installPath = join(root, String(model.localPath ?? 'models'));
        const installed = modelFilesPresent(model, root);
        const requiresCuda = (model.executionTargets as string[] | undefined)?.includes('LOCAL_CUDA') && !(model.executionTargets as string[] | undefined)?.includes('LOCAL_CPU');
        return {
          id: model.id,
          provider: model.provider,
          installed,
          installationPath: installPath,
          hardwareSupported: cuda || !requiresCuda,
          locallyPractical: cuda && !model.remoteOnlyRecommended,
          remoteOnlyRecommended: Boolean(model.remoteOnlyRecommended),
          executionTargets: model.executionTargets ?? [],
          license: model.license,
          commercialEligibility: model.commercialUse,
          readiness: installed ? (cuda || !requiresCuda ? 'INSTALLED' : 'HARDWARE_INSUFFICIENT') : 'INSTALLABLE',
        };
      });
      console.log(JSON.stringify({ generatedAt: new Date().toISOString(), hardware, executionClass: cuda ? 'LOCAL_CUDA' : 'CPU_ONLY', models }, null, 2));
    });

  program.command('benchmark:reference-providers')
    .description('Compare eligible reference providers using the canonical player request without animation-family production')
    .option('--project <path>', 'Generated project path', 'GeneratedGames/metroforge-smoke-metroidvania')
    .action(async (options: { project: string }) => {
      const root = process.cwd();
      const projectPath = join(root, options.project);
      const referencePath = join(projectPath, 'assets', 'characters', 'player_production_reference.png');
      const registry = new ImageProviderRegistry();
      registerFoundryImageProviders(registry, foundryBootstrapFromEnv({ commercialUseRequired: true }));
      const providers = [];
      for (const registration of registry.list()) {
        const health = await resolveImageProviderHealth(registration.provider);
        providers.push({
          provider: registration.provider.id,
          model: registration.provider.id === 'diffusers' ? 'sdxl-base-1.0 + ip-adapter-sdxl' : registration.provider.id === 'qwen-image-edit' ? 'qwen-image-edit-2509' : registration.provider.id === 'dreamo' ? 'dreamo-v1.1' : registration.provider.id === 'comfyui' ? 'configured workflow model' : 'pulid-optional',
          executionTargets: registration.executionTargets ?? [],
          endpoint: registration.endpoint,
          health: health.status,
          reason: health.reason,
          referenceInput: existsSync(referencePath),
          licenseEligibility: registration.commercialUse ?? 'unknown',
          benchmark: health.status === 'HEALTHY' || health.status === 'DEGRADED' ? 'NOT_RUN_UNTIL_EXPLICIT_PROBE' : 'NOT_ELIGIBLE',
        });
      }
      const report = { generatedAt: new Date().toISOString(), projectPath, sourceAssetId: 'player_production_reference', sourcePath: referencePath, request: { pose: 'running', seed: 424242, width: 1024, height: 1024 }, scoring: { identity: 'mandatory-high', pose: 'mandatory-high', technical: 'mandatory', nativeScale: 'high', style: 'high', latency: 'medium', vram: 'medium', license: 'mandatory' }, providers };
      const reportPath = join(projectPath, 'benchmark-reference-providers.json');
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      if (!providers.some((provider) => provider.benchmark === 'NOT_RUN_UNTIL_EXPLICIT_PROBE')) process.exitCode = 2;
    });

  program.command('reference:setup:plan')
    .description('Write a human and machine-readable reference provider setup plan')
    .option('--project <path>', 'Generated project path', 'GeneratedGames/metroforge-smoke-metroidvania')
    .action(async (options: { project: string }) => {
      const root = process.cwd();
      const projectPath = join(root, options.project);
      const registry = new ImageProviderRegistry();
      registerFoundryImageProviders(registry, foundryBootstrapFromEnv({ commercialUseRequired: true }));
      const providers = [];
      for (const registration of registry.list()) {
        const health = await resolveImageProviderHealth(registration.provider);
        providers.push(referenceStatusForRegistration(registration, { configured: true, reachable: health.status === 'HEALTHY' || health.status === 'DEGRADED', reason: health.reason }));
      }
      const setup = {
        generatedAt: new Date().toISOString(),
        projectPath,
        selectedRoute: 'LOCAL_REFERENCE_WORKFLOW_REQUIRED',
        recommendation: 'Configure ComfyUI img2img/IP-Adapter or install a licensed Diffusers reference adapter/model after explicit approval.',
        providers,
        model: {
          id: 'reference-adapter-for-approved-player',
          state: 'REFERENCE_MODEL_NOT_INSTALLED',
          expectedDirectory: process.env.METROFORGE_MODELS_DIR ?? 'models',
          downloadApprovalRequired: true,
          automaticDownload: false,
        },
        hardware: pythonProbe(),
        license: 'UNKNOWN — verify model and adapter terms before production use',
        commands: ['Install Python dependencies in the approved environment', 'Install a licensed reference adapter/model', 'Run pnpm providers:reference:doctor', 'Run pnpm providers:reference:probe --project ' + options.project],
      };
      writeFileSync(join(projectPath, 'reference-provider-setup.json'), JSON.stringify(setup, null, 2));
      writeFileSync(join(projectPath, 'REFERENCE_PROVIDER_SETUP.md'), `# Reference Provider Setup\n\nStatus: REFERENCE_MODEL_NOT_INSTALLED\n\n${setup.recommendation}\n\nAutomatic model download was not performed. Verify licenses and approve installation before adding weights.\n`);
      console.log(JSON.stringify(setup, null, 2));
    });
}
