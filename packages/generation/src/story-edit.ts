import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DialogueSchema,
  QuestSchema,
  type Dialogue,
  type Quest,
} from '@metroforge/schemas';
import { loadProjectContext } from './project-loader.js';

export type StoryContent = {
  narrative: {
    premise: string;
    protagonist: string;
    antagonist?: string;
    centralConflict: string;
  };
  quests: Quest[];
  dialogues: Dialogue[];
  npcs: Array<{ id: string; name?: string; dialogueId?: string; roomId?: string }>;
  rooms: Array<{ id: string; npcs?: string[] }>;
};

function readNamedArray<T>(projectPath: string, relativePath: string, key: string): T[] {
  const full = join(projectPath, relativePath);
  if (!existsSync(full)) return [];
  try {
    const data = JSON.parse(readFileSync(full, 'utf-8')) as Record<string, T[]>;
    return Array.isArray(data[key]) ? data[key] : [];
  } catch {
    return [];
  }
}

function writeNamedArray(projectPath: string, relativeDir: string, file: string, key: string, value: unknown): void {
  const dir = join(projectPath, relativeDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), JSON.stringify({ [key]: value }, null, 2));
}

export function getStoryContent(projectPath: string): StoryContent {
  const project = loadProjectContext(projectPath);
  return {
    narrative: project.gameDna.narrative,
    quests: project.gameContent.quests,
    dialogues: project.gameContent.dialogues,
    npcs: project.gameContent.npcs.map((npc) => ({
      id: npc.id,
      name: npc.name,
      dialogueId: npc.dialogueIds[0],
      roomId: npc.roomId,
    })),
    rooms: project.roomIds.map((id) => ({
      id,
      npcs: Array.isArray(project.roomsData[id]?.npcs)
        ? (project.roomsData[id]?.npcs as string[])
        : undefined,
    })),
  };
}

export function updateQuest(
  projectPath: string,
  quest: Quest,
): { success: boolean; quests: Quest[]; errors: string[] } {
  const errors: string[] = [];
  let parsed: Quest;
  try {
    parsed = QuestSchema.parse(quest);
  } catch (err) {
    return { success: false, quests: [], errors: [err instanceof Error ? err.message : String(err)] };
  }
  const quests = readNamedArray<Quest>(projectPath, 'data/quests/quests.json', 'quests');
  const index = quests.findIndex((item) => item.id === parsed.id);
  if (index >= 0) quests[index] = parsed;
  else quests.push(parsed);
  writeNamedArray(projectPath, 'data/quests', 'quests.json', 'quests', quests);
  return { success: errors.length === 0, quests, errors };
}

export function updateDialogue(
  projectPath: string,
  dialogue: Dialogue,
): { success: boolean; dialogues: Dialogue[]; errors: string[] } {
  const errors: string[] = [];
  let parsed: Dialogue;
  try {
    parsed = DialogueSchema.parse(dialogue);
  } catch (err) {
    return { success: false, dialogues: [], errors: [err instanceof Error ? err.message : String(err)] };
  }
  const dialogues = readNamedArray<Dialogue>(projectPath, 'data/dialogues/dialogues.json', 'dialogues');
  const index = dialogues.findIndex((item) => item.id === parsed.id);
  if (index >= 0) dialogues[index] = parsed;
  else dialogues.push(parsed);
  writeNamedArray(projectPath, 'data/dialogues', 'dialogues.json', 'dialogues', dialogues);
  return { success: errors.length === 0, dialogues, errors };
}

export function updateNarrative(
  projectPath: string,
  patch: Partial<StoryContent['narrative']>,
): { success: boolean; narrative: StoryContent['narrative']; errors: string[] } {
  const dnaPath = join(projectPath, 'game_dna.json');
  if (!existsSync(dnaPath)) {
    return {
      success: false,
      narrative: { premise: '', protagonist: '', centralConflict: '' },
      errors: ['game_dna.json is missing'],
    };
  }
  const dna = JSON.parse(readFileSync(dnaPath, 'utf-8')) as {
    narrative?: StoryContent['narrative'];
  };
  const narrative = {
    premise: patch.premise ?? dna.narrative?.premise ?? '',
    protagonist: patch.protagonist ?? dna.narrative?.protagonist ?? '',
    antagonist: patch.antagonist ?? dna.narrative?.antagonist,
    centralConflict: patch.centralConflict ?? dna.narrative?.centralConflict ?? '',
  };
  dna.narrative = narrative;
  writeFileSync(dnaPath, JSON.stringify(dna, null, 2));
  return { success: true, narrative, errors: [] };
}

export type StoryProposeKind = 'narrative' | 'quest' | 'dialogue';

export type StoryProposeRequest = {
  kind: StoryProposeKind;
  id?: string;
  draft: string;
  ragContext?: string;
};

export type StoryProposeResult = {
  success: boolean;
  proposal?: string;
  scope: { kind: StoryProposeKind; id?: string };
  errors: string[];
};

/**
 * Build a scoped rewrite prompt. Does not write disk — apply uses existing update* helpers.
 */
export function buildStoryRewritePrompt(
  story: StoryContent,
  request: StoryProposeRequest,
): { systemPrompt: string; prompt: string; scope: StoryProposeResult['scope'] } {
  const scope = { kind: request.kind, id: request.id };
  const contextBits = [
    `Premise: ${story.narrative.premise}`,
    `Protagonist: ${story.narrative.protagonist}`,
    story.narrative.antagonist ? `Antagonist: ${story.narrative.antagonist}` : '',
    `Conflict: ${story.narrative.centralConflict}`,
    `Quests: ${story.quests.map((q) => `${q.id}:${q.name}`).join(', ') || 'none'}`,
    `Dialogues: ${story.dialogues.map((d) => d.id).join(', ') || 'none'}`,
    request.ragContext ? `Memory:\n${request.ragContext}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const targetLabel =
    request.kind === 'narrative'
      ? 'narrative premise'
      : request.kind === 'quest'
        ? `quest ${request.id ?? ''} description`
        : `dialogue ${request.id ?? ''} lines (one line per row)`;

  return {
    scope,
    systemPrompt:
      'You are MetroForge Chronicle. Rewrite ONLY the requested story element. ' +
      'Keep tone consistent with the premise. Return plain text only — no markdown fences, no commentary.',
    prompt:
      `${contextBits}\n\nRewrite this ${targetLabel}. Stay scoped; do not invent unrelated quests or dialogues.\n\n` +
      `CURRENT:\n${request.draft}\n\nREWRITE:`,
  };
}

/** Deterministic offline fallback when no LLM is available (still not the old suffix stub). */
export function fallbackStoryProposal(request: StoryProposeRequest): string {
  const trimmed = request.draft.trim();
  if (request.kind === 'narrative') {
    return trimmed
      ? `${trimmed} The forge remembers every debt unpaid.`
      : 'A courier carries heat through locked vaults beneath the foundry.';
  }
  if (request.kind === 'quest') {
    return trimmed
      ? `${trimmed} Return with proof before the core cools.`
      : 'Reach the sealed chamber and report what still burns.';
  }
  return trimmed
    ? trimmed
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => (line.endsWith('.') ? line : `${line}.`))
        .join('\n')
    : 'The vents whisper. Stay low.';
}
