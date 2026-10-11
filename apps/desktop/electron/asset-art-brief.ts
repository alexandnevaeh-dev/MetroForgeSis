/** Preserve authored prompts; expose a saved request brief only for its exact asset identity. */
export function assetArtBrief(artifact:Record<string,unknown>):string|undefined {
 if(typeof artifact.prompt==='string')return artifact.prompt;
 const metadata=artifact.executionMetadata;
 if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))return undefined;
 const identity=(metadata as Record<string,unknown>).enemyVisualIdentity;
 if(!identity||typeof identity!=='object'||Array.isArray(identity))return undefined;
 const plan=identity as Record<string,unknown>;
 return plan.id===artifact.id&&typeof plan.subject==='string'&&plan.subject.trim()&&plan.subject.length<=8000?plan.subject:undefined;
}
