import type { AssetRequest } from '@metroforge/schemas';
import { decodePngRgba } from '../png.js';
import { runDeterministicAssetChecks } from '../vlm-critic.js';
import { QARejectedError } from './errors.js';

export interface FoundryQAResult {
  passed: boolean;
  score: number;
  issues: string[];
}

export function runFoundryQA(png: Buffer, request: AssetRequest): FoundryQAResult {
  const issues: string[] = [];
  const expectedW = request.dimensions?.width;
  const expectedH = request.dimensions?.height;
  const basic = runDeterministicAssetChecks(png, expectedW, expectedH);
  issues.push(...basic.issues);

  try {
    const decoded = decodePngRgba(png);
    if (decoded.width * decoded.height === 0) issues.push('empty raster');
    const blank = isBlankOrFullyTransparent(decoded.rgba);
    if (blank) issues.push('blank asset (no visible pixels)');
    if (request.output.transparentBackground) {
      let hasAlpha = false;
      for (let i = 3; i < decoded.rgba.length; i += 4) {
        if (decoded.rgba[i]! < 250) {
          hasAlpha = true;
          break;
        }
      }
      if (!hasAlpha) issues.push('missing alpha where transparentBackground is required');
    }
    if (request.animation?.required && request.animation.framesPerState) {
      const frames = request.animation.framesPerState * (request.animation.states?.length ?? 1);
      if (decoded.width % frames !== 0 && decoded.height % frames !== 0) {
        issues.push(`spritesheet frame count mismatch vs ${frames} frames`);
      }
    }
    if (request.output.tileSize) {
      if (decoded.width % request.output.tileSize !== 0 || decoded.height % request.output.tileSize !== 0) {
        issues.push(
          `tile dimensions ${decoded.width}x${decoded.height} not divisible by ${request.output.tileSize}`,
        );
      }
    }
  } catch (err) {
    issues.push(err instanceof Error ? err.message : 'png decode failed');
  }

  const passed = issues.length === 0;
  return { passed, score: passed ? 1 : Math.max(0, 1 - issues.length * 0.15), issues };
}

export function assertQaPassed(result: FoundryQAResult): void {
  if (!result.passed) {
    throw new QARejectedError(result.issues.join('; '));
  }
}

function isBlankOrFullyTransparent(rgba: Uint8Array): boolean {
  let visible = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3]! > 8) {
      visible++;
      if (visible > 4) return false;
    }
  }
  return true;
}
