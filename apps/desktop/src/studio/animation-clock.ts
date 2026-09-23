/** Resolve looping preview phase from elapsed time, preserving authored slow clips. */
export function previewFrameAtTime(startFrame: number, elapsedMs: number, frameCount: number, authoredFps?: number): number {
  if (!Number.isSafeInteger(frameCount) || frameCount < 1) return 0;
  const fps = Number.isFinite(authoredFps) && authoredFps! > 0 ? authoredFps! : 8;
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const advances = Math.floor((elapsed / 1000) * fps);
  if (!Number.isFinite(advances)) return startFrame % frameCount;
  return ((startFrame + advances % frameCount) % frameCount + frameCount) % frameCount;
}
