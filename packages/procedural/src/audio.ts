/**
 * Procedural WAV synthesis for reliable SFX fallback.
 * Generates mono 16-bit PCM WAV files without external dependencies.
 */

export interface SfxSpec {
  id: string;
  frequency: number;
  duration: number;
  type: 'sine' | 'square' | 'noise' | 'sweep';
  volume?: number;
  sweepTo?: number;
}

export const DEFAULT_SFX: SfxSpec[] = [
  { id: 'jump', frequency: 440, duration: 0.12, type: 'sweep', sweepTo: 880, volume: 0.3 },
  { id: 'dash', frequency: 220, duration: 0.08, type: 'square', volume: 0.25 },
  { id: 'hit', frequency: 150, duration: 0.1, type: 'noise', volume: 0.4 },
  { id: 'pickup', frequency: 660, duration: 0.15, type: 'sine', volume: 0.3 },
  { id: 'ui_click', frequency: 800, duration: 0.05, type: 'square', volume: 0.2 },
  { id: 'death', frequency: 200, duration: 0.4, type: 'sweep', sweepTo: 60, volume: 0.35 },
  { id: 'ability', frequency: 523, duration: 0.2, type: 'sine', volume: 0.35 },
  { id: 'boss_hit', frequency: 100, duration: 0.15, type: 'noise', volume: 0.5 },
  { id: 'player_attack', frequency: 310, duration: 0.09, type: 'square', volume: 0.32 },
  { id: 'player_hurt', frequency: 180, duration: 0.14, type: 'noise', volume: 0.42 },
  { id: 'enemy_attack', frequency: 120, duration: 0.12, type: 'square', volume: 0.28 },
  { id: 'door', frequency: 90, duration: 0.22, type: 'sweep', sweepTo: 40, volume: 0.3 },
  { id: 'checkpoint', frequency: 523, duration: 0.28, type: 'sine', volume: 0.28 },
  { id: 'boss_attack', frequency: 70, duration: 0.2, type: 'noise', volume: 0.55 },
];

const SAMPLE_RATE = 44100;

function oscSample(type: SfxSpec['type'], phase: number): number {
  switch (type) {
    case 'sine':
      return Math.sin(2 * Math.PI * phase);
    case 'square':
      return Math.sin(2 * Math.PI * phase) >= 0 ? 1 : -1;
    case 'noise':
      return Math.random() * 2 - 1;
    default:
      return Math.sin(2 * Math.PI * phase);
  }
}

export function synthesizeSfx(spec: SfxSpec): Buffer {
  const sampleCount = Math.floor(spec.duration * SAMPLE_RATE);
  const volume = spec.volume ?? 0.3;
  const samples = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const t = i / SAMPLE_RATE;
    const progress = i / sampleCount;
    const envelope = Math.min(1, (1 - progress) * 4) * Math.min(1, progress * 40);

    let freq = spec.frequency;
    if (spec.type === 'sweep' && spec.sweepTo) {
      freq = spec.frequency + (spec.sweepTo - spec.frequency) * progress;
    }

    const phase = (freq * t) % 1;
    samples[i] = oscSample(spec.type, phase) * envelope * volume;
  }

  return encodeWav(samples);
}

function encodeWav(samples: Float32Array): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (SAMPLE_RATE * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    buffer.writeInt16LE(Math.floor(s * 32767), 44 + i * 2);
  }

  return buffer;
}

export function synthesizeAllSfx(specs: SfxSpec[] = DEFAULT_SFX): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  for (const spec of specs) {
    result.set(spec.id, synthesizeSfx(spec));
  }
  return result;
}
