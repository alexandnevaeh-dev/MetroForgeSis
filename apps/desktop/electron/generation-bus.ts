import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GenerationEvent, GenerationEventCategory } from '@metroforge/generation';

const EVENTS_FILE = 'generation_events.jsonl';

export class GenerationEventStore {
  /** One job owns this buffer; never create a destination before atomic assembly. */
  createDeferredAppender(): (projectPath: string, event: GenerationEvent) => void {
    const pending = new Map<string, GenerationEvent[]>();
    return (projectPath, event) => {
      const events = [...(pending.get(projectPath) ?? []), event];
      if (!existsSync(projectPath)) {
        pending.set(projectPath, events);
        return;
      }
      for (const queued of events) this.append(projectPath, queued);
      pending.delete(projectPath);
    };
  }

  append(projectPath: string, event: GenerationEvent): void {
    const file = join(projectPath, EVENTS_FILE);
    appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf-8');
  }

  read(projectPath: string, limit = 500): GenerationEvent[] {
    const file = join(projectPath, EVENTS_FILE);
    if (!existsSync(file)) return [];
    const lines = readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map((line) => JSON.parse(line) as GenerationEvent);
  }

  filter(events: GenerationEvent[], category: GenerationEventCategory): GenerationEvent[] {
    if (category === 'ALL') return events;
    return events.filter((e) => e.category === category || e.type === 'GenerationFailed');
  }
}

export const generationEventStore = new GenerationEventStore();
