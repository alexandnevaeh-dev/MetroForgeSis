import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assetFile} from './asset-files.js';
import {readArchiveFurnishings} from './archive-furnishing-authoring.js';

export type ArchiveFurnishingReviewRow={id:string;status:'placed'|'omitted';reason:string;requestedHeight:number;actualHeight:number;visualApproved:false};
export type ArchiveFurnishingReview={roomId:string;revision:string;rows:ArchiveFurnishingReviewRow[];visualApproved:false};
const scripts={kitScript:'scripts/world/StormglassRoomKit.gd',decorScript:'scripts/world/StormglassDecor.gd',bridgeScript:'scripts/core/StudioRuntimeBridge.gd'};
/** Accept only complete native observations from the currently authored sources. */
export function readArchiveFurnishingReview(project:string,roomId:string,reply:unknown):ArchiveFurnishingReview {
 const state=readArchiveFurnishings(project,roomId);
 if(!reply||typeof reply!=='object'||Array.isArray(reply))throw Error('Native furnishing review unavailable. Start Play Preview and enter this room.');
 const value=reply as Record<string,unknown>,rooms=value.archiveFurnishings;
 if(value.ok!==true||!Array.isArray(rooms)||rooms.length>16)throw Error('Native furnishing review unavailable. Restart Play Preview.');
 const matches=rooms.filter(r=>r&&typeof r==='object'&&!Array.isArray(r)&&r.roomId===roomId);
 if(matches.length!==1)throw Error('Enter this room in Play Preview before reading its furnishing review.');
 const record=matches[0],expected:Record<string,string>={...state.sourceHashes};
 for(const [key,path] of Object.entries(scripts)){
  const bytes=readFileSync(assetFile(project,path));if(bytes.length>2*1024*1024)throw Error('Native review source exceeds its size limit');
  expected[key]=createHash('sha256').update(bytes).digest('hex');
 }
 if(!record.sourceHashes||typeof record.sourceHashes!=='object'||Object.entries(expected).some(([key,hash])=>record.sourceHashes[key]!==hash))throw Error('Native furnishing review is stale. Reload furnishings, restart Play Preview and enter this room.');
 if(!Array.isArray(record.reviews)||record.reviews.length!==state.bays.length)throw Error('Incomplete native furnishing review. Restart Play Preview.');
 const ids=new Set<string>(),rows:ArchiveFurnishingReviewRow[]=[];
 const reasons=new Set(['invalid-floor-anchor','invalid-request','invalid-dimensions','doorway-reservation','overhead-clearance','unsupported-footprint']);
 for(const row of record.reviews){
  const bay=state.bays.find(b=>b.id===row?.id);
  if(!row||typeof row!=='object'||Array.isArray(row)||!bay||ids.has(row.id)||row.visualApproved!==false||row.requestedHeight!==bay.height||!Number.isFinite(row.actualHeight)||row.actualHeight<0||row.actualHeight>bay.height||!['placed','omitted'].includes(row.status)||typeof row.reason!=='string'||(row.status==='placed'?(row.reason!==''||row.actualHeight<=0||(bay.preserveSize===true&&row.actualHeight!==bay.height)):(row.actualHeight!==0||!reasons.has(row.reason))))throw Error('Invalid native furnishing review. Restart Play Preview.');
  ids.add(row.id);rows.push({id:row.id,status:row.status,reason:row.reason,requestedHeight:row.requestedHeight,actualHeight:row.actualHeight,visualApproved:false});
 }
 return {roomId,revision:state.revision,rows,visualApproved:false};
}
