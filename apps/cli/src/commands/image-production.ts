import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Command } from 'commander';
import {
  foundryBootstrapFromEnv,
  registerFoundryImageProviders,
  ImageProviderRegistry,
  createAssetFoundry,
  resolveImageProviderHealth,
  writeCharacterIdentityPack,
  NvidiaImageProvider,
  NvidiaCapabilityAdapter,
  validateTechnicalPng,
  referenceStatusForRegistration,
  resolveNvidiaConfig,
  toNvidiaPersistedAssetRecord,
  decodePngRgba,
  registerInitialAssetVersion,
  createEditAssetVersion,
  getAssetHistory,
  preserveSourceAsset,
  NvidiaStructuredError,
} from '@metroforge/assets';
import { generateManualAsset } from '@metroforge/generation';
import type { VisualDNA } from '@metroforge/schemas';
import { getRepoRoot } from '@metroforge/shared';
interface PlayerProductionReport {
  generatedAt: string;
  projectPath: string;
  seed: number;
  providerAudit: Array<Record<string, unknown>>;
  selectedProvider: string | null;
  canonicalPlayerReference: string | null;
  members: Array<Record<string, unknown>>;
  identityQa: string;
  nativeScaleQa: string;
  familyCertification: string;
  errors: string[];
  warnings: string[];
}

export function classifyProviderResult(input: {
  health: string;
  commercial: string;
  generation: 'not-run' | 'failed' | 'success';
}): 'SELECTED' | 'ELIGIBLE_NOT_SELECTED' | 'GENERATION_FAILED' | 'INELIGIBLE_LICENSE' | 'INELIGIBLE_HEALTH' {
  if (input.health !== 'HEALTHY' && input.health !== 'DEGRADED') return 'INELIGIBLE_HEALTH';
  if (input.commercial !== 'allowed') return 'INELIGIBLE_LICENSE';
  if (input.generation === 'failed') return 'GENERATION_FAILED';
  if (input.generation === 'success') return 'SELECTED';
  return 'ELIGIBLE_NOT_SELECTED';
}

function providerOptions() {
  return foundryBootstrapFromEnv({
    commercialUseRequired: true,
    includeRetrieval: false,
  });
}

async function imageProviderRows(): Promise<Array<Record<string, unknown>>> {
  const registry = new ImageProviderRegistry();
  const options = providerOptions();
  const skipped = registerFoundryImageProviders(registry, options);
  const rows: Array<Record<string, unknown>> = skipped.map((provider) => ({
    provider: provider.id,
    configured: false,
    enabled: provider.userEnabled,
    reachable: false,
    capabilities: [],
    referenceConditioning: 'NO',
    imageEditing: 'NO',
    commercialEligibility: 'UNKNOWN',
    result: 'NOT_CONFIGURED',
    reason: provider.reason,
  }));
  for (const registration of registry.getCandidates({ mode: 'BALANCED', hardwareProfile: 'LOW_RESOURCE' })) {
    const health = await resolveImageProviderHealth(registration.provider);
    const reference = registration.supportsReferenceImages === true;
    const eligible = health.status === 'HEALTHY' || health.status === 'DEGRADED';
    rows.push({
      provider: registration.provider.id,
      configured: true,
      enabled: true,
      reachable: eligible,
      health: health.status,
      reason: health.reason,
      capabilities: registration.capabilities ?? [],
      referenceConditioning: reference ? 'YES' : 'NO',
      imageEditing: (registration.capabilities ?? []).includes('image-editing') ? 'YES' : 'NO',
      commercialEligibility: registration.commercialUse ?? 'UNKNOWN',
      model: process.env.NVIDIA_IMAGE_MODEL ?? process.env.HF_IMAGE_MODEL ?? process.env.DIFFUSERS_MODEL_ID ?? null,
      result: eligible && registration.commercialUse === 'allowed' ? 'ELIGIBLE' : 'INELIGIBLE',
    });
  }
  return rows;
}

function printRows(rows: Array<Record<string, unknown>>): void {
  console.log('IMAGE PROVIDERS\n');
  for (const row of rows) {
    console.log(String(row.provider).toUpperCase());
    console.log(`  configured: ${row.configured ? 'YES' : 'NO'}`);
    console.log(`  enabled: ${row.enabled ? 'YES' : 'NO'}`);
    console.log(`  reachable: ${row.reachable ? 'YES' : 'NO'}`);
    console.log(`  health: ${row.health ?? 'NOT_CHECKED'}`);
    console.log(`  image generation: ${(row.capabilities as string[] | undefined)?.includes('image-generation') ? 'YES' : 'UNKNOWN'}`);
    console.log(`  reference conditioning: ${row.referenceConditioning}`);
    console.log(`  image editing: ${row.imageEditing}`);
    console.log(`  commercial status: ${row.commercialEligibility}`);
    console.log(`  result: ${row.result}`);
    console.log(`  reason: ${row.reason ?? '—'}\n`);
  }
}

export function registerImageDoctorCommand(program: Command): void {
  program.command('providers:image:doctor')
    .description('Audit configured image providers without exposing secrets')
    .action(async () => {
      const rows = await imageProviderRows();
      printRows(rows);
      if (!rows.some((row) => row.result === 'ELIGIBLE')) process.exitCode = 1;
    });

  program.command('providers:foundry:probe')
    .description(
      'Send one real, bounded AssetRequest through AssetFoundry using every currently registered ' +
        'provider — proves capability routing, cross-provider fallback, quality-gated acceptance, ' +
        'license classification, and provenance recording all work end-to-end, not just that a ' +
        'provider individually responds.',
    )
    .option('--asset-type <type>', 'FoundryAssetType to request', 'prop')
    .option('--prompt <text>', 'Prompt for the probe asset', 'a small weathered wooden crate, pixel art, game prop, transparent background')
    .option('--free-only', 'Constrain routing to free/local providers only')
    .option('--commercial-safe', 'Require commercial-use-safe provenance')
    .option('--enable-pollinations', 'Register the free Pollinations provider for this probe')
    .option('--report <path>', 'Write the full JSON report to this path in addition to stdout')
    .action(async (opts: {
      assetType: string;
      prompt: string;
      freeOnly?: boolean;
      commercialSafe?: boolean;
      enablePollinations?: boolean;
      report?: string;
    }) => {
      const registry = new ImageProviderRegistry();
      const bootstrap = foundryBootstrapFromEnv({ enablePollinations: opts.enablePollinations });
      const skipped = registerFoundryImageProviders(registry, bootstrap);
      const registered = registry.list().map((r) => ({
        id: r.provider.id,
        local: r.local,
        costClass: r.costClass,
        capabilities: r.capabilities,
        commercialUse: r.commercialUse,
      }));

      if (registered.length === 0) {
        console.log(JSON.stringify({
          success: false,
          reason: 'No image providers are registered — set at least one provider credential/URL, or pass --enable-pollinations',
          registeredProviders: [],
          skippedProviders: skipped.map((s) => s.id),
        }, null, 2));
        process.exitCode = 2;
        return;
      }

      const foundry = createAssetFoundry({ registry });
      const started = Date.now();
      try {
        const result = await foundry.fulfill({
          id: `probe_${opts.assetType}_${Date.now()}`,
          assetType: opts.assetType as never,
          prompt: opts.prompt,
          style: { visualStyle: 'pixel art', pixelArt: true },
          output: { engine: 'godot', transparentBackground: true },
          constraints: {
            commercialUseRequired: Boolean(opts.commercialSafe),
            freeOnly: Boolean(opts.freeOnly),
          },
          consistency: {},
          maxRetries: 1,
        });
        const report = {
          success: true,
          durationMs: Date.now() - started,
          registeredProviders: registered,
          skippedProviders: skipped.map((s) => s.id),
          selectedProvider: result.provider,
          selectedModel: result.modelId,
          sourceType: result.sourceType,
          fallbackDepth: result.fallbackDepth,
          fallbackReason: result.fallbackReason,
          qaScore: result.qaScore,
          placeholder: result.placeholder,
          cacheHit: result.cacheHit,
          godotPath: result.godotPath,
          provenance: result.provenance,
          imageBytes: result.buffer.length,
        };
        console.log(JSON.stringify(report, null, 2));
        if (opts.report) {
          const { writeFileSync: wf, mkdirSync: mk } = await import('node:fs');
          const { dirname: dn } = await import('node:path');
          mk(dn(opts.report), { recursive: true });
          wf(opts.report, JSON.stringify(report, null, 2));
        }
        if (result.placeholder) process.exitCode = 1;
      } catch (err) {
        console.log(JSON.stringify({
          success: false,
          durationMs: Date.now() - started,
          registeredProviders: registered,
          skippedProviders: skipped.map((s) => s.id),
          error: err instanceof Error ? err.message : String(err),
        }, null, 2));
        process.exitCode = 2;
      }
    });

  program.command('providers:nvidia:doctor')
    .description('Inspect NVIDIA hosted + NIM config/health without exposing secrets or running inference')
    .action(async () => {
      // Ensure repo-root .env is loaded (shared config side effect).
      void getRepoRoot();
      const adapter = new NvidiaCapabilityAdapter({
        apiKey: process.env.NVIDIA_API_KEY,
        baseUrl: process.env.NVIDIA_API_BASE_URL,
        imageApiBaseUrl: process.env.NVIDIA_IMAGE_API_BASE_URL,
        modelId: process.env.NVIDIA_IMAGE_MODEL,
        nimBaseUrl: process.env.NVIDIA_NIM_BASE_URL,
      });
      const report = await adapter.doctorCombined();
      console.log(JSON.stringify({
        ...report,
        capabilityRouting: {
          IMAGE_GENERATION: adapter.capabilityDeployment('IMAGE_GENERATION'),
          IMAGE_EDIT: adapter.capabilityDeployment('IMAGE_EDIT'),
        },
        remoteNimRequirements: report.nim.configured ? undefined : adapter.remoteNimRequirements(),
      }, null, 2));
      console.error(
        [
          'NVIDIA HOSTED',
          `  configured: ${report.hosted.configured}`,
          `  authenticated: ${report.hosted.authenticated}`,
          `  reachable: ${report.hosted.reachable}`,
          `  imageGeneration: ${report.hosted.imageGeneration}`,
          `  readiness: ${report.hosted.readiness}`,
          'NVIDIA NIM',
          `  configured: ${report.nim.configured}`,
          `  reachable: ${report.nim.reachable}`,
          `  live: ${report.nim.live}`,
          `  ready: ${report.nim.ready}`,
          `  modelAvailable: ${report.nim.selectedModelAvailable ?? false}`,
          `  imageEdit: ${report.nim.imageEdit}`,
          `  readiness: ${report.nim.readiness}`,
          `  lifecycle: ${report.nim.lifecycle}`,
          `  reason: ${report.nim.reason}`,
          `secretRedaction: ${report.secretRedaction}`,
        ].join('\n'),
      );
      if (!report.nim.configured) {
        console.error(
          [
            'N2.2 BLOCKED — REMOTE NIM ENDPOINT REQUIRED',
            'Required:',
            '  NVIDIA_NIM_BASE_URL=<https://your-nim-host or https://your-nim-host/v1>',
            '  NVIDIA_IMAGE_EDIT_MODEL=qwen/qwen-image-edit-2511  (or verified remote model id)',
            '  NVIDIA_NIM_API_KEY=<optional; falls back to NVIDIA_API_KEY>',
          ].join('\n'),
        );
      }
      if (!report.hosted.imageGeneration && !report.nim.imageEdit) {
        process.exitCode = 2;
      }
    });

  const N1_LIVE_PROMPT =
    'A full-body original dark-fantasy Metroidvania heroine, readable silhouette, practical layered explorer armor, teal arcane energy accents, neutral standing pose, isolated subject, clean background, polished modern 2D game concept art, no text, no logo';

  program.command('providers:nvidia:image:probe')
    .description('Send one minimal NVIDIA hosted image request, validate bytes, and persist asset + provenance')
    .option('--persist', 'Write PNG + provenance JSON under GeneratedGames/_nvidia_n1', true)
    .option('--no-persist', 'Skip disk persistence')
    .option('--prompt <text>', 'Generation prompt', N1_LIVE_PROMPT)
    .option('--seed <n>', 'Fixed seed when supported', '424242')
    .action(async (options: { persist?: boolean; prompt: string; seed: string }) => {
      void getRepoRoot();
      const config = resolveNvidiaConfig();
      if (!config.configured) {
        console.log(JSON.stringify({
          success: false,
          code: 'NVIDIA_NOT_CONFIGURED',
          message: 'NVIDIA_API_KEY is not configured; stopping before any live request.',
          configured: false,
          secretRedaction: 'SAFE',
        }, null, 2));
        process.exitCode = 2;
        return;
      }

      const provider = new NvidiaImageProvider({
        apiKey: process.env.NVIDIA_API_KEY,
        baseUrl: process.env.NVIDIA_API_BASE_URL,
        imageApiBaseUrl: process.env.NVIDIA_IMAGE_API_BASE_URL,
        modelId: process.env.NVIDIA_IMAGE_MODEL,
        maxRetries: 0,
      });
      const seed = Number.parseInt(options.seed, 10);
      const request = {
        profile: 'CHARACTER' as const,
        prompt: options.prompt,
        width: 64,
        height: 64,
        seed: Number.isFinite(seed) ? seed : 424242,
      };
      const started = Date.now();
      try {
        const result = await provider.generateImage(request);
        const validation = validateTechnicalPng(result.image, { requireAlpha: false });
        let nativeWidth = 0;
        let nativeHeight = 0;
        try {
          const decoded = decodePngRgba(result.image);
          nativeWidth = decoded.width;
          nativeHeight = decoded.height;
        } catch {
          /* non-PNG still counted via validation */
        }

        let assetId: string | undefined;
        let outputPath: string | undefined;
        let provenancePath: string | undefined;
        let previewable = false;
        let provenanceRecorded = false;

        if (options.persist !== false) {
          const outDir = join(getRepoRoot(), 'GeneratedGames', '_nvidia_n1');
          mkdirSync(outDir, { recursive: true });
          assetId = `nvidia-n1-${Date.now()}`;
          outputPath = join(outDir, `${assetId}.png`);
          provenancePath = join(outDir, `${assetId}.provenance.json`);
          writeFileSync(outputPath, result.image);
          const record = toNvidiaPersistedAssetRecord({
            assetId,
            request,
            result,
            outputPath,
            config,
            nativeWidth: nativeWidth || 1024,
            nativeHeight: nativeHeight || 1024,
            mimeType: 'image/png',
            requestId: result.requestId ?? provider.getLastRequestId(),
          });
          writeFileSync(provenancePath, JSON.stringify(record, null, 2));
          previewable = existsSync(outputPath);
          provenanceRecorded = existsSync(provenancePath);
        }

        const visibleRatio =
          nativeWidth > 0 && nativeHeight > 0
            ? validation.visiblePixels / (nativeWidth * nativeHeight)
            : 0;
        const visualQA =
          validation.valid && nativeWidth >= 512 && nativeHeight >= 512 && visibleRatio > 0.02
            ? 'PASS_CONCEPT_QUALITY_CANDIDATE'
            : validation.valid
              ? 'PASS_TECHNICAL_ONLY'
              : 'FAIL';

        console.log(JSON.stringify({
          endpointFamily: provider.endpointFamily,
          provider: result.provider,
          model: result.modelId,
          capability: 'IMAGE_GENERATION',
          success: validation.valid,
          imageBytes: result.image.length,
          durationMs: Date.now() - started,
          seed: result.seed,
          requestId: result.requestId ?? provider.getLastRequestId() ?? null,
          nativeWidth,
          nativeHeight,
          assetId,
          outputPath,
          provenancePath,
          previewable,
          provenanceRecorded,
          transportQA: 'PASS',
          technicalQA: validation.valid ? 'PASS' : 'FAIL',
          visualQA,
          vlmQA: 'SKIPPED_N1',
          validation,
        }, null, 2));
        if (!validation.valid) process.exitCode = 1;
      } catch (error) {
        console.error(JSON.stringify({
          endpointFamily: provider.endpointFamily,
          success: false,
          durationMs: Date.now() - started,
          error: error instanceof Error ? error.message : String(error),
          diagnostic: provider.getLastDiagnostic(),
        }, null, 2));
        process.exitCode = 1;
      }
    });

  const N2_EDIT_INSTRUCTION =
    'Preserve the same character identity, face, proportions, silhouette, armor structure, pose, composition, camera framing, and overall dark-fantasy Metroidvania art direction. Change only the teal arcane energy accents to luminous violet and add a subtle violet magical glow around the gauntlets. Do not change the character\'s identity, clothing design, body shape, background composition, or art style. No text, no logo.';

  program.command('providers:nvidia:image:edit:probe')
    .description('Run one controlled NVIDIA IMAGE_EDIT with reference conditioning and non-destructive versioning')
    .option('--source <path>', 'Source asset PNG path')
    .option('--source-id <id>', 'Source asset id for provenance/versioning')
    .option('--model <id>', 'Override edit model', 'black-forest-labs/flux.1-kontext-dev')
    .option('--seed <n>', 'Fixed seed when supported', '424242')
    .option('--instruction <text>', 'Edit instruction', N2_EDIT_INSTRUCTION)
    .action(async (options: { source?: string; sourceId?: string; model: string; seed: string; instruction: string }) => {
      void getRepoRoot();
      const config = resolveNvidiaConfig();
      if (!config.configured) {
        console.log(JSON.stringify({
          success: false,
          code: 'NVIDIA_NOT_CONFIGURED',
          message: 'NVIDIA_API_KEY is not configured; stopping before any live edit.',
          secretRedaction: 'SAFE',
        }, null, 2));
        process.exitCode = 2;
        return;
      }

      const storageRoot = join(getRepoRoot(), 'GeneratedGames', '_nvidia_n1');
      const defaultSource = join(storageRoot, 'nvidia-n1-1787211957980.png');
      const sourcePath = options.source ?? defaultSource;
      const sourceAssetId = options.sourceId ?? 'nvidia-n1-1787211957980';

      if (!existsSync(sourcePath)) {
        console.log(JSON.stringify({
          success: false,
          code: 'NVIDIA_INVALID_SOURCE_ASSET',
          message: `Source asset not found: ${sourcePath}`,
        }, null, 2));
        process.exitCode = 2;
        return;
      }

      preserveSourceAsset(storageRoot, sourceAssetId, sourcePath);
      registerInitialAssetVersion({
        storageRoot,
        assetId: sourceAssetId,
        path: sourcePath.startsWith(storageRoot)
          ? sourcePath.slice(storageRoot.length + 1).replace(/\\/g, '/')
          : sourcePath,
        provider: 'nvidia-image',
        model: 'black-forest-labs/flux.1-dev',
        operationType: 'IMAGE_GENERATION',
        status: 'ACTIVE',
      });

      const adapter = new NvidiaCapabilityAdapter({
        apiKey: process.env.NVIDIA_API_KEY,
        baseUrl: process.env.NVIDIA_API_BASE_URL,
        imageApiBaseUrl: process.env.NVIDIA_IMAGE_API_BASE_URL,
        maxRetries: 0,
      });

      const seed = Number.parseInt(options.seed, 10);
      const started = Date.now();
      try {
        const result = await adapter.imageEdit({
          sourceAssets: [{ assetId: sourceAssetId, path: sourcePath }],
          instruction: options.instruction,
          seed: Number.isFinite(seed) ? seed : 424242,
          modelOverride: options.model,
          purpose: 'IDENTITY_PRESERVING_EDIT',
          metadata: { requestedChangeScope: 'LOCAL_COLOR_AND_GLOW' },
        });

        const image = result.images[0]?.buffer;
        if (!image) throw new Error('Edit returned no image buffer');

        const validation = validateTechnicalPng(image, { requireAlpha: false });
        const nativeWidth = result.images[0]?.width ?? 0;
        const nativeHeight = result.images[0]?.height ?? 0;

        const { version, operation, outputPath } = createEditAssetVersion({
          storageRoot,
          sourceAssetId,
          sourcePath,
          outputBuffer: image,
          provider: result.provider,
          model: result.model,
          instruction: options.instruction,
          seed: result.seed,
          durationMs: result.durationMs,
          mimeType: 'image/png',
          nativeWidth,
          nativeHeight,
          provenance: result.provenance as unknown as Record<string, unknown>,
          requestedChangeScope: 'LOCAL_COLOR_AND_GLOW',
        });

        const history = getAssetHistory(storageRoot, version.assetId);
        const sourceStillExists = existsSync(sourcePath);

        console.log(JSON.stringify({
          capability: 'IMAGE_EDIT',
          success: validation.valid,
          provider: result.provider,
          model: result.model,
          instruction: options.instruction,
          seed: result.seed,
          durationMs: Date.now() - started,
          requestId: result.requestId ?? null,
          source: {
            id: sourceAssetId,
            path: sourcePath,
            preserved: sourceStillExists,
            version: 1,
          },
          edit: {
            operationId: operation.editOperationId,
            provider: operation.provider,
            model: operation.model,
          },
          result: {
            id: version.assetId,
            version: version.versionNumber,
            parent: version.parentAssetId,
            root: version.rootAssetId,
            path: outputPath,
            status: version.status,
          },
          history: history.map((h: { assetId: string; versionNumber: number; operationType: string }) => ({
            id: h.assetId,
            version: h.versionNumber,
            operation: h.operationType,
          })),
          technicalQA: validation.valid ? 'PASS' : 'FAIL',
          vlmQA: 'NOT_AVAILABLE',
          identityQA: 'NOT_AVAILABLE',
          validation,
        }, null, 2));

        if (!validation.valid) process.exitCode = 1;
      } catch (error) {
        const structured =
          error instanceof NvidiaStructuredError
            ? error.toJSON()
            : { message: error instanceof Error ? error.message : String(error) };
        console.error(JSON.stringify({
          capability: 'IMAGE_EDIT',
          success: false,
          durationMs: Date.now() - started,
          error: structured,
          diagnostic: adapter.imageEditProvider.getLastDiagnostic(),
        }, null, 2));
        process.exitCode = 1;
      }
    });

  program.command('providers:reference:doctor')
    .description('Audit arbitrary-reference image editing readiness without exposing secrets')
    .action(async () => {
      const registry = new ImageProviderRegistry();
      const options = providerOptions();
      registerFoundryImageProviders(registry, options);
      const rows = [];
      for (const registration of registry.list()) {
        const health = await resolveImageProviderHealth(registration.provider);
        rows.push(referenceStatusForRegistration(registration, {
          configured: true,
          reachable: health.status === 'HEALTHY' || health.status === 'DEGRADED',
          model: process.env.NVIDIA_IMAGE_MODEL ?? process.env.DIFFUSERS_MODEL_ID,
          endpoint: registration.family === 'nvidia' ? 'NVIDIA_HOSTED_BUILD_API' : registration.family,
          reason: health.reason,
        }));
      }
      console.log(JSON.stringify(rows, null, 2));
      if (!rows.some((row) => row.readiness === 'PRODUCTION_ELIGIBLE' || row.readiness === 'REFERENCE_INVOCATION_VALIDATED')) process.exitCode = 2;
    });

  program.command('providers:reference:probe')
    .description('Probe the approved player reference against a reference-capable provider')
    .option('--project <path>', 'Generated project path', 'GeneratedGames/metroforge-smoke-metroidvania')
    .action(async (options: { project: string }) => {
      const projectPath = join(process.cwd(), options.project);
      const referencePath = join(projectPath, 'assets', 'characters', 'player_production_reference.png');
      const integrityPath = join(projectPath, 'assets', 'characters', 'player_production_reference', 'identity', 'reference-integrity.json');
      const identityPath = join(projectPath, 'assets', 'characters', 'player_production_reference', 'identity', 'identity.json');
      const reportPath = join(projectPath, 'player-reference-probe.json');
      const registry = new ImageProviderRegistry();
      registerFoundryImageProviders(registry, providerOptions());
      const statuses: Array<ReturnType<typeof referenceStatusForRegistration>> = [];
      for (const registration of registry.list()) {
        const health = await resolveImageProviderHealth(registration.provider);
        const status = referenceStatusForRegistration(registration, { configured: true, reachable: health.status === 'HEALTHY' || health.status === 'DEGRADED', reason: health.reason });
        statuses.push(status);
      }
      const sourceExists = existsSync(referencePath);
      const identityPackAvailable = existsSync(identityPath);
      let identityPack: Record<string, unknown> = {};
      if (identityPackAvailable) {
        try { identityPack = JSON.parse(readFileSync(identityPath, 'utf8')) as Record<string, unknown>; } catch { identityPack = {}; }
      }
      const sourceHash = sourceExists ? createHash('sha256').update(readFileSync(referencePath)).digest('hex').toUpperCase() : null;
      let approvedHash: string | null = null;
      if (existsSync(integrityPath)) {
        try { approvedHash = String((JSON.parse(readFileSync(integrityPath, 'utf8')) as { sha256?: string }).sha256 ?? '').toUpperCase() || null; } catch { approvedHash = null; }
      }
      const referenceMismatch = !sourceExists || !approvedHash || sourceHash !== approvedHash;
      const report: Record<string, unknown> = {
        generatedAt: new Date().toISOString(),
        sourceAssetId: 'player_production_reference',
        sourcePath: referencePath,
        sourceExists,
        sourceHash,
        approvedHash,
        referenceMismatch,
        identityPackAvailable,
        referenceMechanism: 'IP_ADAPTER',
        statuses,
        result: referenceMismatch ? 'CANONICAL_REFERENCE_MISMATCH' : !identityPackAvailable ? 'IDENTITY_PACK_MISSING' : 'REFERENCE_CAPABILITY_UNAVAILABLE',
      };
      if (!referenceMismatch && identityPackAvailable) {
        const eligible = registry.list().find((registration) => {
          const status = statuses.find((row) => row.provider === registration.provider.id);
          return status?.readiness === 'REFERENCE_INVOCATION_VALIDATED' || status?.readiness === 'PRODUCTION_ELIGIBLE';
        });
        if (eligible) {
          const output = await eligible.provider.generateImage({
            profile: 'CHARACTER',
            prompt: `same exact approved player character; outfit: ${String(identityPack.clothing ?? 'same outfit')}; weapon: ${String(identityPack.weapon ?? 'same weapon')}; palette: ${String(identityPack.primaryColors ?? 'same palette')}; silhouette: ${String(identityPack.silhouette ?? 'same silhouette')}; proportions: ${String(identityPack.bodyProportions ?? 'same proportions')}; side-view perspective; running pose`,
            negativePrompt: 'different character, different outfit, extra weapon, front view, cropped feet, text, watermark',
            width: 1024,
            height: 1024,
            seed: 424242,
            conditioning: {
              mode: 'ip_adapter',
              image: readFileSync(referencePath),
              strength: 0.55,
              sourceAssetId: 'player_production_reference',
              sourceHash: sourceHash ?? undefined,
              referenceMechanism: 'IP_ADAPTER',
            },
          });
          const evidenceDir = join(projectPath, 'qa', 'reference-provider');
          mkdirSync(evidenceDir, { recursive: true });
          const outputPath = join(evidenceDir, 'probe-medium.png');
          writeFileSync(outputPath, output.image);
          const validation = validateTechnicalPng(output.image, { requireAlpha: false });
          report.provider = output.provider;
          report.model = output.modelId;
          report.seed = output.seed;
          report.referenceInputUsed = true;
          report.outputPath = outputPath;
          report.outputHash = createHash('sha256').update(output.image).digest('hex').toUpperCase();
          report.technicalQa = validation;
          report.result = validation.valid && report.outputHash !== sourceHash ? 'REFERENCE_INVOCATION_VALIDATED' : 'REFERENCE_OUTPUT_INVALID';
        }
      }
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      if (report.result !== 'REFERENCE_INVOCATION_VALIDATED') process.exitCode = 2;
    });
}

export function registerProductionPlayerCommand(program: Command): void {
  program.command('production:player')
    .description('Generate and validate a provider-backed player family for a fixture')
    .option('--project <path>', 'Generated project path', 'GeneratedGames/metroforge-smoke-metroidvania')
    .option('--seed <number>', 'Deterministic seed', '424242')
    .option('--stage <stage>', 'Production stage: reference or animations', 'reference')
    .action(async (options: { project: string; seed: string; stage: string }) => {
      const projectPath = join(process.cwd(), options.project);
      const reportPath = join(projectPath, 'player-family-production-report.json');
      const seed = Number.parseInt(options.seed, 10);
      const rows = await imageProviderRows();
      if (options.stage === 'animations') {
        const referenceCapable = rows.some((row) => row.reachable && row.referenceConditioning === 'YES' && row.imageEditing === 'YES' && row.result === 'ELIGIBLE');
        const report = {
          generatedAt: new Date().toISOString(),
          projectPath,
          stage: 'animations',
          sourceAssetId: 'player_production_reference',
          sourceExists: existsSync(join(projectPath, 'assets', 'characters', 'player_production_reference.png')),
          providerAudit: rows,
          animationMembers: [],
          familyCertification: 'FAMILY_REVIEW_REQUIRED',
          result: referenceCapable ? 'NOT_IMPLEMENTED' : 'REFERENCE_CAPABILITY_UNAVAILABLE',
        };
        writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.error(referenceCapable ? 'Reference-capable animation stage is not yet implemented' : 'No eligible reference-capable provider is available; refusing procedural animation fallback');
        process.exitCode = 2;
        return;
      }
      const eligible = rows.filter((row) => row.result === 'ELIGIBLE');
      const report: PlayerProductionReport = {
        generatedAt: new Date().toISOString(),
        projectPath,
        seed,
        providerAudit: rows,
        selectedProvider: null,
        canonicalPlayerReference: null,
        members: [],
        identityQa: 'NOT_RUN',
        nativeScaleQa: 'NOT_RUN',
        familyCertification: 'FAMILY_REVIEW_REQUIRED',
        errors: [],
        warnings: [],
      };
      if (!existsSync(join(projectPath, 'game_dna.json'))) {
        report.errors = ['fixture game_dna.json not found; run pnpm smoke:generate first'];
        mkdirSync(projectPath, { recursive: true });
        writeFileSync(reportPath, JSON.stringify(report, null, 2));
        process.exitCode = 1;
        return;
      }
      if (eligible.length === 0) {
        report.errors = ['No configured, reachable, commercially eligible image provider is available for player production'];
        report.warnings = rows.map((row) => `${row.provider}: ${row.reason ?? row.result}`);
        writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.error(`Player production blocked: ${report.errors[0]}`);
        process.exitCode = 2;
        return;
      }

      const candidates = [];
      const candidateLabels = ['A', 'B', 'C'];
      for (let index = 0; index < candidateLabels.length; index++) {
        const label = candidateLabels[index]!;
        const assetId = `player_reference_candidate_${label.toLowerCase()}`;
        const result = await generateManualAsset({
          projectPath,
          description: `Canonical side-view Metroidvania player hero candidate ${label} matching the project Visual Constitution; readable silhouette, stable proportions, weapon continuity, transparent sprite, production game scale.`,
          assetType: 'player_sprite',
          assetId,
          seed: seed + index,
          generationMode: 'HYBRID_FREE',
          commercialSafe: true,
          hardwareProfile: 'LOW_RESOURCE',
        });
        const asset = result.asset;
        const fullPath = asset?.path ? join(projectPath, asset.path) : null;
        const bytes = fullPath && existsSync(fullPath) ? readFileSync(fullPath) : null;
        const technical = bytes ? validateTechnicalPng(bytes, { requireAlpha: false }) : { valid: false, issues: ['missing candidate bytes'] };
        candidates.push({
          label,
          id: assetId,
          success: result.success && !asset?.fallbackGenerated && technical.valid,
          path: asset?.path ?? null,
          sourcePath: asset?.sourcePath ?? null,
          provider: asset?.provider ?? null,
          model: asset?.modelId ?? null,
          seed: seed + index,
          maturity: asset?.maturity ?? null,
          fallback: asset?.fallbackGenerated ?? true,
          critiquePassed: asset?.critiquePassed ?? false,
          critiqueScore: asset?.critiqueScore ?? 0,
          technical,
          artifactHash: bytes ? createHash('sha256').update(bytes).digest('hex') : null,
          errors: result.errors,
          warnings: result.warnings,
        });
        report.warnings.push(...result.warnings);
      }
      report.members = candidates;
      report.errors = [];
      report.warnings.push(...candidates.flatMap((candidate) => candidate.errors.map((error) => `candidate ${candidate.label}: ${error}`)));
      const selected = candidates
        .filter((candidate) => candidate.success && !candidate.fallback)
        .sort((a, b) => (b.critiqueScore - a.critiqueScore) || (a.label.localeCompare(b.label)))[0];
      if (selected) {
        report.selectedProvider = selected.provider;
        const selectedPath = join(projectPath, selected.path!);
        const canonicalPath = join(projectPath, 'assets', 'characters', 'player_production_reference.png');
        mkdirSync(join(projectPath, 'assets', 'characters'), { recursive: true });
        copyFileSync(selectedPath, canonicalPath);
        report.canonicalPlayerReference = 'assets/characters/player_production_reference.png';
        const visualDnaPath = join(projectPath, 'visual_dna.json');
        if (existsSync(visualDnaPath)) {
          const visualDna = JSON.parse(readFileSync(visualDnaPath, 'utf8')) as VisualDNA;
          const identityPack = writeCharacterIdentityPack({
            outputDir: projectPath,
            characterId: 'player_production_reference',
            role: 'player',
            source: readFileSync(canonicalPath),
            visualDNA: visualDna,
            animationTier: 'AI_KEYFRAME_ASSISTED',
          });
          report.warnings.push(`Canonical candidate ${selected.label} approved; identity pack written at ${identityPack.sourcePath}.`);
        }
        report.familyCertification = 'PLAYER_REFERENCE_APPROVED';
      } else {
        report.errors.push('No candidate passed non-fallback technical and visual QA');
      }
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
      if (!selected) process.exitCode = 1;
    });
}
