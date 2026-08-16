import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PiperTtsProvider, type SpeechGenerationProvider } from '@metroforge/ai';
import type { GenerationProfile } from '@metroforge/shared';
import type { GameContent } from '@metroforge/procedural';

export interface DialogueVoiceResult {
  voiceFiles: Map<string, Buffer>;
  synthesizedCount: number;
  warnings: string[];
}

export interface SynthesizeDialogueVoicesOptions {
  modelsDir?: string;
  /** Injectable for unit tests — bypasses Piper CLI discovery. */
  provider?: SpeechGenerationProvider;
}

const VOICE_LINE_CAP: Record<GenerationProfile, number> = {
  TINY_TEST: 4,
  VISUAL_VERTICAL_SLICE: 6,
  SMALL: 12,
  MEDIUM: 32,
  LARGE: 64,
  RELEASE_CANDIDATE: 24,
};

/** Locate a Piper ONNX model under models/speech/ or PIPER_MODEL_PATH. */
export function resolvePiperModelPath(modelsDir = join(process.cwd(), 'models')): string | null {
  const envPath = process.env.PIPER_MODEL_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  const direct = join(modelsDir, 'speech', 'piper-en', 'en_US-lessac-medium.onnx');
  if (existsSync(direct)) {
    return direct;
  }

  const speechDir = join(modelsDir, 'speech', 'piper-en');
  if (existsSync(speechDir)) {
    const onnx = readdirSync(speechDir).find((name) => name.endsWith('.onnx'));
    if (onnx) {
      return join(speechDir, onnx);
    }
  }

  return null;
}

export function voiceFileKey(dialogueId: string, lineIndex: number): string {
  return `voice_${dialogueId}_${lineIndex}`;
}

export function voiceResPath(dialogueId: string, lineIndex: number): string {
  return `res://audio/voice/${dialogueId}_${lineIndex}.wav`;
}

/**
 * Synthesizes dialogue voice WAVs when Piper is available. Mutates dialogue lines in-place
 * with voicePath; skipped silently when Piper/model is unavailable (procedural games still run).
 */
export async function synthesizeDialogueVoices(
  content: GameContent,
  profile: GenerationProfile,
  options: SynthesizeDialogueVoicesOptions = {},
): Promise<DialogueVoiceResult> {
  const warnings: string[] = [];
  const voiceFiles = new Map<string, Buffer>();
  const maxLines = VOICE_LINE_CAP[profile];

  let provider = options.provider;
  if (!provider) {
    const modelPath = resolvePiperModelPath(options.modelsDir);
    if (!modelPath) {
      return { voiceFiles, synthesizedCount: 0, warnings };
    }
    provider = new PiperTtsProvider({ modelPath });
    if (!(await provider.checkHealth())) {
      return { voiceFiles, synthesizedCount: 0, warnings };
    }
  }

  let synthesizedCount = 0;

  for (const dialogue of content.dialogues) {
    for (let lineIndex = 0; lineIndex < dialogue.lines.length; lineIndex++) {
      if (synthesizedCount >= maxLines) {
        return { voiceFiles, synthesizedCount, warnings };
      }

      const line = dialogue.lines[lineIndex]!;
      const text = line.text.trim();
      if (!text) {
        continue;
      }

      try {
        const response = await provider.synthesize({ text });
        const key = voiceFileKey(dialogue.id, lineIndex);
        voiceFiles.set(key, response.audio);
        line.voicePath = voiceResPath(dialogue.id, lineIndex);
        synthesizedCount++;
      } catch (err) {
        warnings.push(
          `Dialogue voice skipped (${dialogue.id}#${lineIndex}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  return { voiceFiles, synthesizedCount, warnings };
}
