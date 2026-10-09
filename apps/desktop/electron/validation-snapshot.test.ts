import {describe,it,expect} from 'vitest';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {readValidationSnapshot} from './validation-snapshot.js';
const root='E:/MetroForgeData/Development/qa-snapshot-20261009/report-tests';
mkdirSync(root,{recursive:true});
function fixture(report?:unknown) {
  const path=mkdtempSync(root+'/case-');
  if(report!==undefined)writeFileSync(path+'/validation_report.json',JSON.stringify(report));
  return path;
}
describe('saved QA snapshots',()=>{
  it('reads static/runtime/modern failures and skipped states without promoting them',()=>{
    const results=[{gate:'movement',passed:true,message:'stairs',details:{flights:3}},
      {gate:'runtime',passed:false,message:'256/428',state:'FAIL'},
      {gate:'playtest',passed:true,message:'not run',state:'SKIPPED'},
      {gate:'modern',passed:false,message:'art incomplete',state:'FAIL'}];
    const read=readValidationSnapshot(fixture({timestamp:'original-time',results}))!;
    expect(read.map(r=>[r.gate,r.passed,r.state])).toEqual(results.map(r=>[r.gate,r.passed,r.state]));
    expect(read[0]!.details).toEqual({flights:3});expect(read.every(r=>r.timestamp==='original-time')).toBe(true);
  });
  it('uses the database fallback only when no report exists',()=>{
    expect(readValidationSnapshot(fixture())).toBeNull();
    expect(readValidationSnapshot(fixture({passed:false,invalidationReason:'Artwork changed',results:[]}))).toEqual([]);
    expect(readValidationSnapshot(fixture({passed:false,invalidatedBy:'template_refresh',results:[{gate:'runtime',passed:true,message:'older pass'}]}))).toEqual([]);
    const bad=fixture();writeFileSync(bad+'/validation_report.json','broken');expect(readValidationSnapshot(bad)).toEqual([]);
  });
  it('rejects malformed gates as a complete snapshot instead of keeping partial passes',()=>{
    expect(readValidationSnapshot(fixture({results:[{gate:'old',passed:true,message:'pass'},{gate:'bad',passed:'yes',message:'bad'}]}))).toEqual([]);
  });
});
