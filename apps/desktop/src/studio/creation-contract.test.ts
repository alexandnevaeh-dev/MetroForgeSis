import { describe, expect, it } from 'vitest';
import { creationResultStatus, latestCreationPhases, parseCreationSeed } from './creation-contract.js';

it('replaces running progress with the final result while retaining stage order', () => {
  expect(latestCreationPhases([
    {phase:'assembly',status:'RUNNING'}, {phase:'assembly',status:'PASSED'},
    {phase:'qa',status:'RUNNING'}, {phase:'qa',status:'FAILED'},
  ])).toEqual([{phase:'assembly',status:'PASSED'}, {phase:'qa',status:'FAILED'}]);
});

describe('creation seed contract', () => {
  it.each([0,42,2147483647])('retains Quantum seed %s without fallback',seed=>{
    expect(parseCreationSeed(String(seed),true)).toBe(seed);
  });
  it.each(['',' ','1.5','-1','2147483648','Infinity','not a seed'])('rejects invalid Quantum seed %s',value=>{
    expect(parseCreationSeed(value,true)).toBeNull();
  });
  it('retains signed seeds for the existing two genres',()=>{
    expect(parseCreationSeed('-42',false)).toBe(-42);
    expect(parseCreationSeed('-2147483648',false)).toBe(-2147483648);
    expect(parseCreationSeed('-2147483649',false)).toBeNull();
  });
});

describe('created files and passing tests remain separate', () => {
  it('labels an untested scaffold as Created',()=>{
    expect(creationResultStatus({success:true})).toEqual({label:'Created',tone:'info'});
  });
  it('labels skipped runtime validation as Tests pending',()=>{
    expect(creationResultStatus({success:true,validationPassed:false,errors:[]})).toEqual({label:'Tests pending',tone:'warning'});
  });
  it('reports actual QA failure even when files were created',()=>{
    expect(creationResultStatus({success:true,validationPassed:false,errors:['Enemy blocked the exit']})).toEqual({label:'Tests failed',tone:'warning'});
  });
  it('shows passing tests only for a verified result',()=>{
    expect(creationResultStatus({success:true,validationPassed:true})).toEqual({label:'Tests passed',tone:'success'});
  });
  it('preserves failed and cancelled outcomes',()=>{
    expect(creationResultStatus({success:false})).toEqual({label:'Failed',tone:'danger'});
    expect(creationResultStatus({success:true,cancelled:true})).toEqual({label:'Cancelled',tone:'warning'});
  });
});
