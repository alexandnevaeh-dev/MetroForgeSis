import type {TopDownOverworld,TopDownPropPlacement} from '@metroforge/procedural';
import {canopyEnvironment} from './topdown-canopy-environment.js';

/** Explicit woodland placement replaces legacy scatter only in composed canopy rooms. */
export function decorateCanopyWorld(world: TopDownOverworld): number {
  let count=0;
  for(const area of world.areas) {
    const plan=area.canopyComposition;
    if(!plan)continue;
    const landmarkArt=canopyEnvironment(plan.landmark);
    const width=area.widthTiles*area.tileSize,height=area.heightTiles*area.tileSize;
    const entries=[{id:`${area.id}_landmark`,kind:plan.landmark,solid:true,
      x:Math.min(width-landmarkArt.width/2,Math.max(landmarkArt.width/2,plan.layout.landmarkAt[0]*area.tileSize)),
      y:Math.min(height-area.tileSize,Math.max(landmarkArt.anchor[1]+4,plan.layout.landmarkAt[1]*area.tileSize))},
      ...plan.layout.scenery.map((entry,index)=>({...entry,id:`${area.id}_${entry.kind}_${index}`}))];
    const placements:TopDownPropPlacement[]=[];
    for(const entry of entries) {
      // Protect actor-sized passage/interact landing space, including the landmark footprint.
      if(area.pois.some(poi=>Math.hypot(poi.x-entry.x,poi.y-entry.y)<96))continue;
      const art=canopyEnvironment(entry.kind);
      const split=['root_arch','vine_gate','bridge'].includes(entry.kind);
      placements.push({id:entry.id,image:`res://assets/props/canopy/${entry.kind}.png`,x:entry.x,y:entry.y,
        layout:{version:1,sourceSize:[art.width,art.height],anchorPx:art.anchor,displayScale:1,occlusionFade:true,
          collisionRectsPx:!entry.solid?[]:split?[{x:-65,y:-12,width:26,height:12},{x:39,y:-12,width:26,height:12}]:[{x:-12,y:-12,width:24,height:14}]}});
    }
    area.propPlacements=placements;
    count+=placements.length;
  }
  return count;
}
