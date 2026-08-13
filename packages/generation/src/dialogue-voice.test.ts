import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SpeechGenerationProvider } from '@metroforge/ai';
import { generateGameContent } from '@metroforge/procedural';
import {
  resolvePiperModelPath,
  synthesizeDialogueVoices,
  voiceFileKey,
  voiceResPath,
} from './dialogue-voice.js';

describe('dialogue voice synthesis', () => {
  it('resolvePiperModelPath finds onnx under models/speech/piper-en', () => {
    const dir = mkdtempSync(join(tmpdir(), 'metroforge-piper-model-'));
    const modelDir = join(dir, 'speech', 'piper-en');
    mkdirSync(modelDir, { recursive: true });
    writeFileSync(join(modelDir, 'en_US-lessac-medium.onnx'), 'fake');

    expect(resolvePiperModelPath(dir)).toBe(join(modelDir, 'en_US-lessac-medium.onnx'));
    rmSync(dir, { recursive: true, force: true });
  });

  it('synthesizes capped dialogue lines and sets voicePath on content', async () => {
    const content = generateGameContent(
      {
        version: '0.1.0',
        archetype: 'SIDE_VIEW_METROIDVANIA',
        profile: 'TINY_TEST',
        seed: 7,
        identity: {
          title: 'Voice Test',
          genre: 'Metroidvania',
          tone: 'dark',
          visualStyle: 'pixel',
        },
        technical: {
          resolution: { width: 1280, height: 720 },
          tileSize: 16,
          targetPlaytimeHours: 1,
          difficulty: 'normal',
        },
        combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
        movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
        abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
        world: { biomeCount: 1, roomCount: 3 },
        narrative: {
          premise: 'Test',
          protagonist: 'Hero',
          centralConflict: 'Conflict',
        },
      },
      'TINY_TEST',
      7,
      'room_002',
      ['room_000', 'room_001', 'room_002'],
    );

    const mockProvider: SpeechGenerationProvider = {
      id: 'mock-tts',
      checkHealth: async () => true,
      synthesize: async ({ text }) => ({
        audio: Buffer.from(`wav:${text}`),
        modelId: 'mock',
        provider: 'mock-tts',
        format: 'wav',
      }),
    };

    const result = await synthesizeDialogueVoices(content, 'TINY_TEST', {
      provider: mockProvider,
    });

    expect(result.synthesizedCount).toBe(4);
    expect(result.voiceFiles.size).toBe(4);

    const firstDialogue = content.dialogues[0]!;
    expect(firstDialogue.lines[0]?.voicePath).toBe(voiceResPath(firstDialogue.id, 0));
    expect(result.voiceFiles.get(voiceFileKey(firstDialogue.id, 0))?.toString()).toContain('wav:');
  });

  it('returns empty when no provider is available', async () => {
    const content = generateGameContent(
      {
        version: '0.1.0',
        archetype: 'SIDE_VIEW_METROIDVANIA',
        profile: 'TINY_TEST',
        seed: 1,
        identity: {
          title: 'Voice Test',
          genre: 'Metroidvania',
          tone: 'dark',
          visualStyle: 'pixel',
        },
        technical: {
          resolution: { width: 1280, height: 720 },
          tileSize: 16,
          targetPlaytimeHours: 1,
          difficulty: 'normal',
        },
        combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
        movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
        abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
        world: { biomeCount: 1, roomCount: 3 },
        narrative: {
          premise: 'Test',
          protagonist: 'Hero',
          centralConflict: 'Conflict',
        },
      },
      'TINY_TEST',
      1,
      'room_002',
      ['room_000', 'room_001', 'room_002'],
    );

    const result = await synthesizeDialogueVoices(content, 'TINY_TEST', {
      modelsDir: join(tmpdir(), 'missing-models-dir'),
    });

    expect(result.synthesizedCount).toBe(0);
    expect(result.voiceFiles.size).toBe(0);
  });
});
