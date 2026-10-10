import {describe,it,expect,vi} from 'vitest';
import type {ImageGenRequest} from './types/image-gen.js';
import {DiffusersProvider} from './providers/diffusers.js';
import {LocalImageExecutionBackend,generationRequestHash,buildGenerationSpecification} from './pipeline-v2/production-capacity.js';
const spec={version:'asset_generation_spec_v1' as const,model:'fixture',prompt:'fixture',seed:42,width:64,height:64,steps:6,scheduler:'PNDM',guidance:7.5,category:'enemy' as const,outputRole:'diagnostic'};
const echo={effectiveWidth:64,effectiveHeight:64,effectiveSteps:6,effectiveScheduler:'PNDM',effectiveGuidance:7.5};
const capacity={totalSystemRamMb:32000,availableSystemRamMb:24000,devices:['GPU'],backend:'fixture'};
function local(overrides={}){const generateImage=vi.fn(async(_request:ImageGenRequest)=>({image:Buffer.from('fixture'),provider:'fixture',modelId:'fixture',seed:42,fallbackGenerated:false,executionMetadata:{...echo,...overrides}}));return {generateImage,backend:new LocalImageExecutionBackend('fixture',{id:'fixture',checkHealth:async()=>true,generateImage},capacity)};}
describe('immutable local sampling provenance',()=>{
  it('does not invent an execution device when a provider omits it',async()=>{
    expect((await local().backend.generate(spec,generationRequestHash(spec))).device).toBeUndefined();
    expect((await local({actualDevice:'cpu'}).backend.generate(spec,generationRequestHash(spec))).device).toBe('cpu');
  });
  it('uses validated SDXL defaults only for omitted values and preserves explicit requests',()=>{
    const request={id:'caster',category:'enemy' as const,runtimeUse:'candidate',artDirection:'pixel',seed:42,dimensions:{width:1024,height:1024}};
    const input={model:'stabilityai/stable-diffusion-xl-base-1.0',prompt:'fixture',width:1024,height:1024};
    expect(buildGenerationSpecification(request,input)).toMatchObject({steps:20,scheduler:'Euler',guidance:5});
    expect(buildGenerationSpecification({...request,inferenceSteps:6,scheduler:'PNDM',guidance:0},input)).toMatchObject({steps:6,scheduler:'PNDM',guidance:0});
    expect(buildGenerationSpecification(request,{...input,model:'sd-1.5'})).toMatchObject({steps:6,scheduler:'PNDM',guidance:7.5});
  });
  it('forwards guidance/scheduler and records actual metadata rather than inventing it',async()=>{
    const {backend,generateImage}=local();const result=await backend.generate(spec,generationRequestHash(spec));
    expect(generateImage.mock.calls[0][0]).toMatchObject({guidance:7.5,scheduler:'PNDM',inferenceSteps:6});
    expect(result.effectiveParameters).toMatchObject({guidance:7.5,scheduler:'PNDM',steps:6});
  });
  it.each(['effectiveWidth','effectiveHeight','effectiveSteps','effectiveScheduler','effectiveGuidance'])('rejects missing or different %s',async key=>{
    await expect(local({[key]:undefined}).backend.generate(spec,'hash')).rejects.toThrow('immutable parameter');
    await expect(local({[key]:key==='effectiveScheduler'?'Euler':5}).backend.generate(spec,'hash')).rejects.toThrow('immutable parameter');
  });
});
describe('Diffusers explicit sampling transport (stubbed, no GPU claim)',()=>{
  const request={profile:'ENEMY' as const,prompt:'fixture',width:64,height:64,seed:42};
  it('sends zero guidance and requested scheduler; verifies their worker echo',async()=>{
    const provider=new DiffusersProvider({device:'cuda'});const run=vi.spyOn(provider as any,'runWorker').mockResolvedValue({ok:true,image_base64:'Zml4dHVyZQ==',effectiveGuidance:0,effectiveScheduler:'PNDM'});
    const result=await provider.generateImage({...request,guidance:0,scheduler:'PNDM'});
    expect(run.mock.calls[0][0]).toMatchObject({guidance:0,scheduler:'PNDM'});expect(result.executionMetadata?.effectiveScheduler).toBe('PNDM');
  });
  it('keeps default requests free of sampling overrides',async()=>{
    const provider=new DiffusersProvider({device:'cuda'});const run=vi.spyOn(provider as any,'runWorker').mockResolvedValue({ok:true,image_base64:'Zml4dHVyZQ=='});
    await provider.generateImage(request);expect(run.mock.calls[0][0]).not.toHaveProperty('guidance');expect(run.mock.calls[0][0]).not.toHaveProperty('scheduler');
  });
  it.each([{effectiveGuidance:5,effectiveScheduler:'PNDM'},{effectiveGuidance:7.5,effectiveScheduler:'Euler'},{}])('refuses changed or missing worker parameters %#',async fields=>{
    const provider=new DiffusersProvider({device:'cuda'});vi.spyOn(provider as any,'runWorker').mockResolvedValue({ok:true,image_base64:'Zml4dHVyZQ==',...fields});
    await expect(provider.generateImage({...request,guidance:7.5,scheduler:'PNDM'})).rejects.toThrow('provenance');
  });
});
