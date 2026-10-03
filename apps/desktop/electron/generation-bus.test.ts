import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GenerationEvent } from '@metroforge/generation';
import { GenerationEventStore } from './generation-bus.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe('atomic project generation event persistence', () => {
  it('preserves early live events without occupying the assembler destination', () => {
    const base = process.env.TEMP || 'E:/MetroForgeData/Temp';
    mkdirSync(base, { recursive: true });
    const root = mkdtempSync(join(base, 'metroforge-event-test-')); roots.push(root);
    const project = join(root, 'fresh-project');
    const store = new GenerationEventStore();
    const append = store.createDeferredAppender();
    const started = { type: 'GenerationStarted', timestamp: '2026-10-02T00:00:00Z', projectPath: project } as GenerationEvent;
    append(project, started);
    expect(existsSync(project)).toBe(false);
    expect(store.read(project)).toEqual([]);
    mkdirSync(project); // Successful assembler commit.
    const assembled = { type: 'PhaseCompleted', phase: 'project_assembly', status: 'PASSED', timestamp: '2026-10-02T00:00:01Z', projectPath: project } as GenerationEvent;
    append(project, assembled);
    expect(store.read(project)).toEqual([started, assembled]);
    const completed = { type: 'GenerationCompleted', success: true, timestamp: '2026-10-02T00:00:02Z', projectPath: project } as GenerationEvent;
    append(project, completed);
    expect(store.read(project)).toEqual([started, assembled, completed]);
  });
});
