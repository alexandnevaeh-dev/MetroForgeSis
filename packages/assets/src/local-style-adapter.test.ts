import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { validateLocalStyleAdapter, localStyleAdapterMatches } from './local-style-adapter.js';
import { DiffusersProvider } from './providers/diffusers.js';
import { LegacyAssetGenerationGateway } from './gateway/legacy-gateway.js';
import { FoundryAssetGenerationGateway } from './gateway/foundry-gateway.js';
import type { AssetGenerationRequest } from './gateway/types.js';
import type { ImageGenerator } from './types/image-gen.js';
import { buildGenerationSpecification, generationRequestHash, LocalImageExecutionBackend, RemoteWorkerExecutionBackend, routeProductionInference } from './pipeline-v2/production-capacity.js';

const style = { path: resolve('E:/adapter.safetensors'), sha256: 'a'.repeat(64), scale: 1 };
const imageRequest = { profile: 'ENEMY' as const, prompt: 'folio caster', width: 64, height: 64, seed: 12 };
const gatewayRequest: AssetGenerationRequest = { id:'caster',assetType:'enemy',path:'caster.png',prompt:'folio caster',width:64,height:64,seed:12,visualStyle:'pixel',pixelArt:true,transparentBackground:true,commercialUseRequired:true,freeOnly:true,localOnly:true,localStyleAdapter:style };
const result = { image:Buffer.from('fixture'),provider:'fixture',modelId:'fixture',seed:12,fallbackGenerated:false,executionMetadata:{localStyleAdapter:style} };
const spec = buildGenerationSpecification({id:'caster',category:'enemy',runtimeUse:'enemy',artDirection:'pixel',seed:12,dimensions:{width:64,height:64}}, {model:'fixture',prompt:'folio caster',width:64,height:64});
const capacity = {totalSystemRamMb:32000,availableSystemRamMb:24000,devices:['GPU'],backend:'fixture'};
function provider(echo: unknown = style, supported = true) {
  return {id:'fixture',checkHealth:vi.fn(async()=>true),supportsLocalStyleAdapters:supported,generateImage:vi.fn(async()=>({...result,executionMetadata:{localStyleAdapter:echo}}))} as ImageGenerator & {generateImage:ReturnType<typeof vi.fn>};
}

describe('local adapter contract', () => {
  it('normalizes absolute paths and accepts exact hash/scale', () => {
    expect(validateLocalStyleAdapter(style)).toEqual(style);
    expect(localStyleAdapterMatches(style,{...style,path:style.path.replaceAll('\\','/')})).toBe(true);
    expect(localStyleAdapterMatches(undefined,null)).toBe(true);
  });
  it.each([null,{}, {...style,path:'relative.safetensors'}, {...style,path:resolve('E:/adapter.bin')}, {...style,sha256:'A'.repeat(64)}, {...style,scale:0}, {...style,scale:2.01}, {...style,scale:NaN}, {...style,extra:true}])('rejects malformed descriptors %#', bad => {
    expect(()=>validateLocalStyleAdapter(bad)).toThrow();
  });
  it.each([undefined,{...style,sha256:'b'.repeat(64)},{...style,scale:.5},{...style,path:resolve('E:/other.safetensors')}])('rejects missing or different echoes %#', echo => {
    expect(localStyleAdapterMatches(style,echo)).toBe(false);
  });
});

describe('Diffusers style bridge (stubbed transport, no GPU claim)', () => {
  it('forwards only an explicit selection and records the validated worker echo', async () => {
    const p=new DiffusersProvider({device:'cuda'});
    const run=vi.spyOn(p as any,'runWorker').mockResolvedValue({ok:true,image_base64:'Zml4dHVyZQ==',localStyleAdapter:style});
    const output=await p.generateImage({...imageRequest,localStyleAdapter:style});
    expect((run.mock.calls[0][0] as Record<string,unknown>).local_style_adapter).toEqual(style);
    expect(output.executionMetadata?.localStyleAdapter).toEqual(style);
  });
  it('keeps an ordinary request free of adapter fields', async () => {
    const p=new DiffusersProvider({device:'cuda'});
    const run=vi.spyOn(p as any,'runWorker').mockResolvedValue({ok:true,image_base64:'Zml4dHVyZQ=='});
    const output=await p.generateImage(imageRequest);
    expect(run.mock.calls[0][0]).not.toHaveProperty('local_style_adapter');
    expect(output.executionMetadata).not.toHaveProperty('localStyleAdapter');
  });
  it.each([undefined,{...style,scale:.5}])('refuses an unverified worker echo %#', async echo => {
    const p=new DiffusersProvider({device:'cuda'});
    vi.spyOn(p as any,'runWorker').mockResolvedValue({ok:true,image_base64:'Zml4dHVyZQ==',localStyleAdapter:echo});
    await expect(p.generateImage({...imageRequest,localStyleAdapter:style})).rejects.toThrow('provenance');
  });
  it.each(['ip_adapter','controlnet_canny'] as const)('rejects unsupported conditioning %s before worker execution', async mode => {
    const p=new DiffusersProvider({device:'cuda'});const run=vi.spyOn(p as any,'runWorker');
    await expect(p.generateImage({...imageRequest,localStyleAdapter:style,conditioning:{mode,image:Buffer.from('fixture')}})).rejects.toThrow('conditioning');
    expect(run).not.toHaveBeenCalled();
  });
  it('rejects OpenVINO before dispatch', async () => {
    const p=new DiffusersProvider({device:'openvino_gpu'});const run=vi.spyOn(p as any,'runOpenVinoServer');
    await expect(p.generateImage({...imageRequest,localStyleAdapter:style})).rejects.toThrow('OpenVINO');expect(run).not.toHaveBeenCalled();
  });
});

describe('gateway and immutable execution boundaries', () => {
  it('rejects an unsupported provider before generation', async () => {
    const p=provider(style,false);expect(await new LegacyAssetGenerationGateway(p).generate(gatewayRequest)).toMatchObject({ok:false,fallbackEligible:false,failureClass:'unsupported-capability'});expect(p.generateImage).not.toHaveBeenCalled();
  });
  it('forwards style and refuses missing provenance', async () => {
    const p=provider();expect(await new LegacyAssetGenerationGateway(p).generate(gatewayRequest)).toMatchObject({ok:true});expect(p.generateImage.mock.calls[0][0].localStyleAdapter).toEqual(style);
    expect(await new LegacyAssetGenerationGateway(provider(null)).generate(gatewayRequest)).toMatchObject({ok:false,fallbackEligible:false});
  });
  it('refuses Foundry style requests before fulfillment', async () => {
    const fulfill=vi.fn();expect(await new FoundryAssetGenerationGateway({fulfill} as any).generate(gatewayRequest)).toMatchObject({ok:false,failureClass:'unsupported-capability'});expect(fulfill).not.toHaveBeenCalled();
  });
  it('hashes path, hash and scale while retaining the ordinary hash', () => {
    expect(generationRequestHash({...spec,localStyleAdapter:undefined})).toBe(generationRequestHash(spec));
    const styled={...spec,localStyleAdapter:style};const hash=generationRequestHash(styled);
    expect(hash).not.toBe(generationRequestHash(spec));
    for(const change of [{sha256:'b'.repeat(64)},{scale:.5},{path:resolve('E:/other.safetensors')}])expect(generationRequestHash({...styled,localStyleAdapter:{...style,...change}})).not.toBe(hash);
  });
  it('forwards style through local immutable execution and verifies its echo', async () => {
    const p=provider();const backend=new LocalImageExecutionBackend('fixture',p,capacity);const styled={...spec,localStyleAdapter:style};
    expect((await backend.generate(styled,generationRequestHash(styled))).effectiveParameters.localStyleAdapter).toEqual(style);
    expect(p.generateImage.mock.calls[0][0].localStyleAdapter).toEqual(style);
    await expect(new LocalImageExecutionBackend('bad',provider(null),capacity).generate(styled,'hash')).rejects.toThrow('provenance');
  });
  it('refuses remote use of a local file before any transmission', async () => {
    const generate=vi.fn();const remote=new RemoteWorkerExecutionBackend('remote',{generate} as any);
    await expect(remote.generate({...spec,localStyleAdapter:style},'hash')).rejects.toThrow('local style adapter file');expect(generate).not.toHaveBeenCalled();
  });
  it('rejects a backend result that omits the immutable requested style', async () => {
    const backend=new LocalImageExecutionBackend('fixture',provider(),capacity);const styled={...spec,localStyleAdapter:style};const generate=backend.generate.bind(backend);
    vi.spyOn(backend,'generate').mockImplementation(async(s,h)=>{const r=await generate(s,h);delete r.effectiveParameters.localStyleAdapter;return r;});
    await expect(routeProductionInference(styled,[backend])).rejects.toThrow('provenance');
  });
});
