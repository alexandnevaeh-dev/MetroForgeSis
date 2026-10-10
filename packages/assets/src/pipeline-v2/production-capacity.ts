import { createHash } from 'node:crypto';
import { freemem, totalmem } from 'node:os';
import type { AssetCategoryV2, AssetRequestV2 } from './types.js';
import type { ImageGenerator, LocalStyleAdapter } from '../types/image-gen.js';
import { validateLocalStyleAdapter, localStyleAdapterMatches } from '../local-style-adapter.js';
import type { ImageGenerationProfile } from '../types/vision.js';
import type { RemoteVisualWorkerClient } from '../execution/remote-worker.js';
import { sha256Bytes } from '../execution/remote-worker.js';
import { HttpRemoteVisualWorkerClient } from '../execution/http-worker-client.js';

export type CapacityStatus = 'SUPPORTED' | 'SUPPORTED_WITH_WARNING' | 'UNSUPPORTED_LOCAL_CAPACITY' | 'UNKNOWN_CAPACITY';
export type CapacityFailureCode = 'LOCAL_INSUFFICIENT_MEMORY'|'LOCAL_UNSUPPORTED_DEVICE'|'REMOTE_UNAVAILABLE'|'REMOTE_CAPACITY_INSUFFICIENT'|'REQUEST_HASH_MISMATCH'|'BACKEND_MODEL_MISMATCH'|'GENERATION_TIMEOUT'|'BACKEND_PROTOCOL_ERROR'|'RETURNED_ARTIFACT_CORRUPTION'|'VALIDATION_FAILURE';

export interface ImmutableGenerationSpecification {
  version: 'asset_generation_spec_v1'; model: string; prompt: string; negativePrompt?: string; seed: number;
  width: number; height: number; steps: number; scheduler: string; guidance: number; category: AssetCategoryV2;
  animation?: AssetRequestV2['animation']; visualBibleVersion?: string; visualBibleHash?: string; outputRole: string;
  localStyleAdapter?: LocalStyleAdapter;
}
export interface CapacityProfile {
  totalSystemRamMb: number; availableSystemRamMb: number; graphicsMemoryMb?: number; devices: string[];
  backend: string; compiledCacheAvailable?: boolean;
  measurements?: Array<{ width: number; height: number; precision: string; device: string; peakWorkingSetMb?: number; totalMs?: number; success: boolean }>;
}
export interface CapacityAssessment { status: CapacityStatus; reasons: Array<{ code: CapacityFailureCode|string; message: string; observed?: number|string; required?: number|string }>; workload: Pick<ImmutableGenerationSpecification,'width'|'height'|'steps'|'model'> & { precision: string; expectedDevice: string }; profile: CapacityProfile }
export interface ProductionExecutionResult { requestHash: string; image: Buffer; sourceHash: string; backendType: 'local'|'remote'; backendId: string; model: string; device?: string; durationMs: number; effectiveParameters: Record<string,unknown>; executionMetadata?: Record<string,unknown> }
export interface ProductionExecutionBackend { id: string; type: 'local'|'remote'; probe(spec: ImmutableGenerationSpecification): Promise<{ reachable: boolean; supportedModels?: string[]; device?: string; capacity?: CapacityAssessment; metadata?: Record<string,unknown> }>; generate(spec: ImmutableGenerationSpecification, requestHash: string): Promise<ProductionExecutionResult> }

function profileForCategory(category: AssetCategoryV2): ImageGenerationProfile {
  if (category === 'player') return 'CHARACTER';
  if (category === 'enemy') return 'ENEMY';
  if (category === 'boss') return 'BOSS';
  if (category === 'npc') return 'NPC';
  if (category === 'environment') return 'TILE_SOURCE';
  if (category === 'background') return 'BACKGROUND';
  if (category === 'pickup' || category === 'prop' || category === 'animated_environment') return 'ITEM';
  return 'ICON';
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string,unknown>).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function generationRequestHash(spec: ImmutableGenerationSpecification): string { return createHash('sha256').update(canonical(spec)).digest('hex'); }

export function buildGenerationSpecification(request: AssetRequestV2, input: { model: string; prompt: string; negativePrompt?: string; width: number; height: number; localStyleAdapter?: LocalStyleAdapter }): ImmutableGenerationSpecification {
  return { version:'asset_generation_spec_v1', model:input.model, prompt:input.prompt, negativePrompt:input.negativePrompt, seed:request.seed, width:input.width, height:input.height, steps:request.inferenceSteps??6, scheduler:request.scheduler??'PNDM', guidance:request.guidance??7.5, category:request.category, animation:request.animation, visualBibleVersion:request.visualBibleVersion, visualBibleHash:request.visualBibleHash, outputRole:request.runtimeUse, ...(input.localStyleAdapter === undefined ? {} : {localStyleAdapter:validateLocalStyleAdapter(input.localStyleAdapter)}) };
}

export function currentCapacityProfile(input: Partial<CapacityProfile> = {}): CapacityProfile { return { totalSystemRamMb:Math.round(totalmem()/1048576),availableSystemRamMb:Math.round(freemem()/1048576),devices:[],backend:'local-openvino',...input }; }

export function assessProductionCapacity(spec: ImmutableGenerationSpecification, profile: CapacityProfile, input: { precision?: string; expectedDevice?: string } = {}): CapacityAssessment {
  const precision=input.precision??'fp32'; const expectedDevice=input.expectedDevice??'GPU'; const reasons: CapacityAssessment['reasons']=[];
  const pixels=spec.width*spec.height; const scale=pixels/(128*128); const measured=profile.measurements?.filter((m)=>m.precision===precision&&m.device===expectedDevice);
  const failedAtOrBelow=measured?.find((m)=>!m.success&&m.width*m.height<=pixels);
  if(!profile.devices.includes(expectedDevice)&&expectedDevice!=='AUTO') reasons.push({code:'LOCAL_UNSUPPORTED_DEVICE',message:`Requested ${expectedDevice} is unavailable`,observed:profile.devices.join(','),required:expectedDevice});
  if(failedAtOrBelow) reasons.push({code:'LOCAL_MEASURED_FAILURE',message:'A measured equal-or-smaller workload failed on this device',observed:`${failedAtOrBelow.width}x${failedAtOrBelow.height}`});
  const estimatedPeak=Math.ceil(1800+Math.max(0,scale-1)*450); const safeAvailable=Math.max(profile.availableSystemRamMb,profile.totalSystemRamMb*.25);
  if(profile.totalSystemRamMb<12288&&pixels>=384*384) reasons.push({code:'LOCAL_INSUFFICIENT_MEMORY',message:'Locked 384px FP32 production workload requires at least the configured 12 GB host safety floor',observed:profile.totalSystemRamMb,required:12288});
  if(precision==='fp32'&&profile.graphicsMemoryMb!==undefined&&expectedDevice==='GPU'&&profile.graphicsMemoryMb<4096) reasons.push({code:'LOCAL_INSUFFICIENT_GRAPHICS_MEMORY',message:'FP32 diffusion workload exceeds configured GPU safety floor',observed:profile.graphicsMemoryMb,required:4096});
  if(estimatedPeak>safeAvailable&&!profile.compiledCacheAvailable) reasons.push({code:'LOCAL_INSUFFICIENT_MEMORY',message:'Estimated uncached working set exceeds safe currently available memory',observed:safeAvailable,required:estimatedPeak});
  const unsupported=reasons.some((r)=>String(r.code).startsWith('LOCAL_'));
  const lacksCapacityFacts = profile.totalSystemRamMb <= 0 || profile.availableSystemRamMb < 0 || profile.devices.length === 0;
  return { status:unsupported?'UNSUPPORTED_LOCAL_CAPACITY':lacksCapacityFacts?'UNKNOWN_CAPACITY':reasons.length?'SUPPORTED_WITH_WARNING':'SUPPORTED',reasons,workload:{width:spec.width,height:spec.height,steps:spec.steps,model:spec.model,precision,expectedDevice},profile };
}

export class ProductionCapacityError extends Error { constructor(public readonly code: CapacityFailureCode, message: string, public readonly assessment?: CapacityAssessment){super(`${code}: ${message}`);this.name='ProductionCapacityError';} }

export class LocalImageExecutionBackend implements ProductionExecutionBackend {
  readonly type='local' as const;
  constructor(public readonly id:string,private readonly provider:ImageGenerator,private readonly profile:CapacityProfile,private readonly device='GPU'){}
  async probe(spec:ImmutableGenerationSpecification){const capacity=assessProductionCapacity(spec,this.profile,{expectedDevice:this.device});return {reachable:true,supportedModels:[spec.model],device:this.device,capacity};}
  async generate(spec:ImmutableGenerationSpecification,requestHash:string):Promise<ProductionExecutionResult>{
    const style=spec.localStyleAdapter===undefined?undefined:validateLocalStyleAdapter(spec.localStyleAdapter);
    if(style&&!this.provider.supportsLocalStyleAdapters)throw new ProductionCapacityError('BACKEND_PROTOCOL_ERROR','Selected provider does not support local style adapters');
    const started=Date.now();const result=await this.provider.generateImage({profile:profileForCategory(spec.category),prompt:spec.prompt,negativePrompt:spec.negativePrompt,width:spec.width,height:spec.height,seed:spec.seed,inferenceSteps:spec.steps,...(style?{localStyleAdapter:style}:{})});
    if(!localStyleAdapterMatches(style,result.executionMetadata?.localStyleAdapter))throw new ProductionCapacityError('BACKEND_PROTOCOL_ERROR','Local style adapter provenance does not match the request');
    const image=result.image;return {requestHash,image,sourceHash:sha256Bytes(image).toLowerCase(),backendType:'local',backendId:this.id,model:result.modelId,device:String(result.executionMetadata?.actualDevice??this.device),durationMs:Date.now()-started,effectiveParameters:{width:spec.width,height:spec.height,steps:spec.steps,scheduler:spec.scheduler,guidance:spec.guidance,seed:spec.seed,...(style?{localStyleAdapter:style}:{})},executionMetadata:result.executionMetadata};
  }
}

export class RemoteWorkerExecutionBackend implements ProductionExecutionBackend {
  readonly type='remote' as const; constructor(public readonly id:string,private readonly client:RemoteVisualWorkerClient){}
  async probe(_spec:ImmutableGenerationSpecification){try{const [health,caps]=await Promise.all([this.client.health(),this.client.capabilities()]);const models=(caps.models as string[]|undefined)??this.client.target.installedModels;return {reachable:true,supportedModels:models,device:String(caps.device??this.client.target.gpuType??'remote'),metadata:{health,capabilities:caps}};}catch(error){return {reachable:false,metadata:{error:error instanceof Error?error.message:String(error)}};}}
  async generate(spec:ImmutableGenerationSpecification,requestHash:string):Promise<ProductionExecutionResult>{if(spec.localStyleAdapter!==undefined)throw new ProductionCapacityError('BACKEND_PROTOCOL_ERROR','Remote workers cannot consume a local style adapter file');const result=await this.client.generate({requestId:requestHash,assetId:spec.outputRole,capability:'IMAGE_GENERATION',providerModel:spec.model,prompt:spec.prompt,negativePrompt:spec.negativePrompt,seed:spec.seed,width:spec.width,height:spec.height,conditioning:{steps:spec.steps,scheduler:spec.scheduler,guidance:spec.guidance,category:spec.category,animation:spec.animation,visualBibleVersion:spec.visualBibleVersion,visualBibleHash:spec.visualBibleHash,requestHash}});if(result.requestId!==requestHash)throw new ProductionCapacityError('REQUEST_HASH_MISMATCH','Remote response does not match immutable request');if(result.model!==spec.model)throw new ProductionCapacityError('BACKEND_MODEL_MISMATCH',`Expected ${spec.model}, received ${result.model}`);if(result.seed!==spec.seed)throw new ProductionCapacityError('BACKEND_PROTOCOL_ERROR','Remote response changed the immutable seed');if(!result.image)throw new ProductionCapacityError('BACKEND_PROTOCOL_ERROR','Remote response contained no image');const sourceHash=sha256Bytes(result.image).toLowerCase();if(result.outputSha256&&result.outputSha256.toLowerCase()!==sourceHash)throw new ProductionCapacityError('RETURNED_ARTIFACT_CORRUPTION','Remote source hash mismatch');const effective=result.provenance.effectiveParameters;if(!effective||typeof effective!=='object')throw new ProductionCapacityError('BACKEND_PROTOCOL_ERROR','Remote response omitted effective generation parameters');return {requestHash,image:result.image,sourceHash,backendType:'remote',backendId:this.id,model:result.model,device:result.executionTarget.gpuType,durationMs:result.durationMs,effectiveParameters:effective as Record<string,unknown>,executionMetadata:{target:result.executionTarget,provenance:result.provenance}};}
}

/** Opt-in configuration only. No endpoint or credential is embedded and no public provider is
 * selected implicitly. */
export function remoteWorkerBackendFromEnvironment(env: NodeJS.ProcessEnv = process.env): RemoteWorkerExecutionBackend | undefined {
  const endpoint = env.METROFORGE_PRODUCTION_REMOTE_URL;
  if (!endpoint) return undefined;
  const id = env.METROFORGE_PRODUCTION_REMOTE_ID ?? 'configured-production-worker';
  const model = env.METROFORGE_PRODUCTION_REMOTE_MODEL ?? 'sd-1.5';
  const client = new HttpRemoteVisualWorkerClient({
    id, type: 'REMOTE_METROFORGE_WORKER', location: 'remote', provider: 'metroforge-worker',
    endpoint, gpuType: env.METROFORGE_PRODUCTION_REMOTE_DEVICE, installedModels: [model],
    capabilities: ['IMAGE_GENERATION'], health: 'configured', authenticationType: env.METROFORGE_PRODUCTION_REMOTE_TOKEN ? 'bearer' : 'none',
  }, env.METROFORGE_PRODUCTION_REMOTE_TOKEN);
  return new RemoteWorkerExecutionBackend(id, client);
}

export async function routeProductionInference(spec:ImmutableGenerationSpecification,backends:ProductionExecutionBackend[]):Promise<{selectedBackend?:string;localAssessment?:CapacityAssessment;result?:ProductionExecutionResult;failures:Array<{backend:string;code:string;message:string}>}>{const hash=generationRequestHash(spec);const failures:Array<{backend:string;code:string;message:string}>=[];let localAssessment:CapacityAssessment|undefined;for(const backend of backends){let probe;try{probe=await backend.probe(spec);}catch(error){failures.push({backend:backend.id,code:backend.type==='remote'?'REMOTE_UNAVAILABLE':'BACKEND_PROTOCOL_ERROR',message:error instanceof Error?error.message:String(error)});continue;}if(backend.type==='local'&&probe.capacity){localAssessment=probe.capacity;if(probe.capacity.status==='UNSUPPORTED_LOCAL_CAPACITY'||probe.capacity.status==='UNKNOWN_CAPACITY'){const code=probe.capacity.reasons.some((r)=>r.code==='LOCAL_UNSUPPORTED_DEVICE')?'LOCAL_UNSUPPORTED_DEVICE':'LOCAL_INSUFFICIENT_MEMORY';failures.push({backend:backend.id,code,message:probe.capacity.reasons.map((r)=>r.message).join('; ')||'Local capacity is unknown'});continue;}}if(!probe.reachable){failures.push({backend:backend.id,code:backend.type==='remote'?'REMOTE_UNAVAILABLE':'BACKEND_PROTOCOL_ERROR',message:'Backend probe failed'});continue;}if(probe.capacity?.status==='UNSUPPORTED_LOCAL_CAPACITY'){failures.push({backend:backend.id,code:'REMOTE_CAPACITY_INSUFFICIENT',message:probe.capacity.reasons.map((r)=>r.message).join('; ')});continue;}if(probe.supportedModels?.length&&!probe.supportedModels.includes(spec.model)){failures.push({backend:backend.id,code:'BACKEND_MODEL_MISMATCH',message:`${spec.model} unsupported`});continue;}try{const result=await backend.generate(spec,hash);if(!localStyleAdapterMatches(spec.localStyleAdapter,result.effectiveParameters.localStyleAdapter))throw new ProductionCapacityError('BACKEND_PROTOCOL_ERROR','Backend local style adapter provenance does not match the immutable request');if(result.requestHash!==hash)throw new ProductionCapacityError('REQUEST_HASH_MISMATCH','Backend returned a different request hash');if(result.model!==spec.model)throw new ProductionCapacityError('BACKEND_MODEL_MISMATCH',`Expected ${spec.model}, received ${result.model}`);if(result.sourceHash.toLowerCase()!==sha256Bytes(result.image).toLowerCase())throw new ProductionCapacityError('RETURNED_ARTIFACT_CORRUPTION','Backend source hash does not match returned bytes');for(const [key,value] of Object.entries({width:spec.width,height:spec.height,steps:spec.steps,scheduler:spec.scheduler,guidance:spec.guidance,seed:spec.seed})){if(result.effectiveParameters[key]!==undefined&&result.effectiveParameters[key]!==value)throw new ProductionCapacityError('BACKEND_PROTOCOL_ERROR',`Backend changed immutable parameter ${key}`);}return {selectedBackend:backend.id,localAssessment,result,failures};}catch(error){if(error instanceof ProductionCapacityError)throw error;const message=error instanceof Error?error.message:String(error);const code:CapacityFailureCode=/timeout/i.test(message)?'GENERATION_TIMEOUT':'BACKEND_PROTOCOL_ERROR';failures.push({backend:backend.id,code,message});}}return {localAssessment,failures};}
