import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GenerationEvent, GenerationEventCategory } from '@metroforge/generation';

const EVENTS_FILE = 'generation_events.jsonl';

export class GenerationEventStore {
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
