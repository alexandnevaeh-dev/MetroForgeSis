/** Resolve looping preview phase from elapsed time, preserving authored slow clips. */
export function previewFrameAtTime(startFrame: number, elapsedMs: number, frameCount: number, authoredFps?: number, loop = true): number {
  if (!Number.isSafeInteger(frameCount) || frameCount < 1) return 0;
  const fps = Number.isFinite(authoredFps) && authoredFps! > 0 ? authoredFps! : 8;
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const advances = Math.floor((elapsed / 1000) * fps);
  const initial = Number.isFinite(startFrame) ? ((Math.trunc(startFrame) % frameCount) + frameCount) % frameCount : 0;
  if (!loop) return Math.min(frameCount - 1, initial + advances);
  if (!Number.isFinite(advances)) return initial;
  return (initial + advances % frameCount) % frameCount;
}
