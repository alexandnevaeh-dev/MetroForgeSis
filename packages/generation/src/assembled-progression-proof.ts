import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import type {WorldGraph,ProgressionGraph} from '@metroforge/schemas';
import {buildProgressionProof,movementStatsFromJson,validateMovementFeasibility} from '@metroforge/procedural';
import {exportedStairApproaches} from '@metroforge/godot';

/** Reconcile the provisional graph proof with emitted geometry. Godot geometry
 * is evidence only for Godot; other engines retain the abstract movement model. */
export function finalizeAssembledProgressionProof(options: {
  outputPath:string; targetEngine:string; worldGraph:WorldGraph;
  progressionGraph:ProgressionGraph; knownTokens:Iterable<string>;
}) {
  const {outputPath,targetEngine,worldGraph,progressionGraph,knownTokens}=options;
  const finalPath=join(outputPath,'progression_proof.json');
  const provisionalPath=join(outputPath,'progression_proof.provisional.json');
  if(!existsSync(provisionalPath))writeFileSync(provisionalPath,readFileSync(finalPath));
  const movement=targetEngine==='godot'
    ? validateMovementFeasibility(worldGraph,
      movementStatsFromJson(JSON.parse(readFileSync(join(outputPath,'data/player/movement.json'),'utf8'))),
      undefined,exportedStairApproaches(outputPath,worldGraph))
    : undefined;
  const proof=buildProgressionProof(worldGraph,progressionGraph,movement,knownTokens);
  writeFileSync(finalPath,JSON.stringify(proof,null,2));
  writeFileSync(join(outputPath,'progression_proof.assembly.json'),JSON.stringify({
    engine:targetEngine,passed:proof.passed,
    movementEvidence:movement??null,
    scope:targetEngine==='godot'?'Exported Godot collision and movement inputs; native traversal remains separate':'Abstract movement model; no native engine acceptance',
  },null,2));
  return proof;
}
