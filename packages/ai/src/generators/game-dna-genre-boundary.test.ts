import {describe,it,expect,vi} from 'vitest';
import {createDeterministicGameDNA,generateGameDNA} from './game-dna.js';
const base={profile:'TINY_TEST' as const,seed:42};

describe('AI game DNA respects caller genre intent',()=>{
 it('keeps an inferred top-down request when the provider returns side-view DNA',async()=>{
   const wrong=createDeterministicGameDNA({...base,prompt:'castle metroidvania',archetype:'SIDE_VIEW_METROIDVANIA'});
   const generateText=vi.fn(async()=>({text:JSON.stringify(wrong)}));
   const result=await generateGameDNA({...base,prompt:'a stylized top-down forest adventure'},{health:'healthy',generateText});
   expect(result.source).toBe('ai');expect(result.dna.archetype).toBe('TOP_DOWN_ACTION_ADVENTURE');
   expect(result.dna.identity.genre).toBe('Action-Adventure');
   expect(generateText.mock.calls[0]).toBeDefined();
   const request=(generateText.mock.calls[0] as unknown as [{systemPrompt:string}])[0];
   expect(request.systemPrompt).toContain('"archetype": "TOP_DOWN_ACTION_ADVENTURE"');
   expect(request.systemPrompt).toContain('"genre": "Action-Adventure"');
 });
 it('keeps explicit side-view and platformer intent instead of a provider top-down answer',async()=>{
   const wrong=createDeterministicGameDNA({...base,prompt:'forest',archetype:'TOP_DOWN_ACTION_ADVENTURE'});
   for(const archetype of ['SIDE_VIEW_METROIDVANIA','SIDE_VIEW_PLATFORMER'] as const){
     const result=await generateGameDNA({...base,prompt:'forest adventure',archetype},{health:'healthy',generateText:async()=>({text:JSON.stringify(wrong)})});
     expect(result.dna.archetype).toBe(archetype);
     expect(result.dna.identity.genre).toBe(archetype==='SIDE_VIEW_PLATFORMER'?'Platformer':'Metroidvania');
     if(archetype==='SIDE_VIEW_PLATFORMER')expect(result.dna.abilities).toEqual([]);
   }
 });
 it('never routes Quantum through the generic AI room contract',async()=>{
   const generateText=vi.fn();
   await expect(generateGameDNA({...base,prompt:'Quantum',archetype:'QUANTUM_SIMULATION_ROGUELITE'},{health:'healthy',generateText})).rejects.toThrow('dedicated generation contract');
   expect(generateText).not.toHaveBeenCalled();
 });
});
