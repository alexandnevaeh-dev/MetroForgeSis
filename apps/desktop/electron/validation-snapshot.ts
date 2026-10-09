import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

export interface SavedValidationGate {
  id:string;gate:string;passed:boolean;message:string;timestamp:string;
  state?:'PASS'|'FAIL'|'SKIPPED'|'BLOCKED';details:Record<string,unknown>;
}

/** A complete project report supersedes the legacy runtime-only database view.
 * Invalidated/malformed reports never fall back to stale passing results. */
export function readValidationSnapshot(projectPath:string): SavedValidationGate[] | null {
  const file=join(projectPath,'validation_report.json');
  if(!existsSync(file))return null;
  try {
    const report=JSON.parse(readFileSync(file,'utf8')) as Record<string,unknown>;
    if(report.invalidationReason || report.invalidatedBy || !Array.isArray(report.results))return [];
    const timestamp=typeof report.timestamp==='string'?report.timestamp:'';
    const results:SavedValidationGate[]=[];
    for(const [index,item] of report.results.entries()) {
      if(!item||typeof item!=='object'||typeof item.gate!=='string'||typeof item.passed!=='boolean'||typeof item.message!=='string')return [];
      const state=['PASS','FAIL','SKIPPED','BLOCKED'].includes(item.state)?item.state:undefined;
      results.push({id:`report-${index}-${item.gate}`,gate:item.gate,passed:item.passed,message:item.message,timestamp,state,
        details:item.details&&typeof item.details==='object'&&!Array.isArray(item.details)?item.details:{}});
    }
    return results;
  } catch {return [];}
}
