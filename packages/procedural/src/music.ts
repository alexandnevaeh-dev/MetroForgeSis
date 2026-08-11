/**
 * MIDI + Furnace/OpenMPT-friendly exports from tracker patterns.
 */
import type { AudioBible } from '@metroforge/schemas';
import { SeededRNG } from './rng.js';
import { StableAudioProvider } from './stable-audio.js';

const SAMPLE_RATE = 44100;

const SCALE_FREQ: Record<string, number[]> = {
  Am: [220, 246.94, 261.63, 293.66, 329.63, 349.23, 392, 440],
  Dm: [293.66, 329.63, 349.23, 392, 440, 466.16, 523.25, 587.33],
  Em: [329.63, 349.23, 392, 440, 493.88, 523.25, 587.33, 659.25],
  Cm: [261.63, 293.66, 311.13, 349.23, 392, 415.3, 466.16, 523.25],
  Fm: [174.61, 196, 207.65, 233.08, 261.63, 277.18, 311.13, 349.23],
};

/** Furnace/OpenMPT interchange — import into Furnace via JSON or OpenMPT via MIDI */
export interface FurnaceModule {
  format: 'metroforge-furnace';
  version: string;
  title: string;
  bpm: number;
  key: string;
  mood: string;
  rows: { tick: number; note: string; octave: number; volume: number; instrument: number }[];
  openmptHint: string;
}

export interface TrackerEvent {
  tick: number;
  note: number;
  duration: number;
  velocity: number;
}

export interface TrackerPattern {
  version: string;
  bpm: number;
  key: string;
  mood: string;
  events: TrackerEvent[];
}

export interface MusicGenerationResult {
  audio: Map<string, Buffer>;
  patterns: Map<string, TrackerPattern>;
  midi: Map<string, Buffer>;
  furnace: Map<string, FurnaceModule>;
}

function tempoToBpm(tempo: 'slow' | 'medium' | 'fast'): number {
  switch (tempo) {
    case 'slow':
      return 72;
    case 'fast':
      return 128;
    default:
      return 96;
  }
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteNameForScaleIndex(key: string, noteIdx: number): { name: string; octave: number; midi: number } {
  const rootMap: Record<string, number> = { Am: 9, Dm: 2, Em: 4, Cm: 0, Fm: 5 };
  const root = rootMap[key] ?? 9;
  const midi = 57 + root + noteIdx;
  const name = NOTE_NAMES[midi % 12]!;
  const octave = Math.floor(midi / 12) - 1;
  return { name, octave, midi };
}

export function exportFurnaceModule(pattern: TrackerPattern, title: string): FurnaceModule {
  return {
    format: 'metroforge-furnace',
    version: '0.1.0',
    title,
    bpm: pattern.bpm,
    key: pattern.key,
    mood: pattern.mood,
    rows: pattern.events.map((ev) => {
      const n = noteNameForScaleIndex(pattern.key, ev.note);
      return {
        tick: ev.tick,
        note: n.name,
        octave: n.octave,
        volume: ev.velocity,
        instrument: 0,
      };
    }),
    openmptHint: 'Import companion .mid into OpenMPT or recreate rows in Furnace',
  };
}

/** Standard MIDI File (SMF type 0) — OpenMPT compatible import */
export function exportPatternToMidi(pattern: TrackerPattern, trackName: string): Buffer {
  const ticksPerBeat = 480;
  const microPerQuarter = Math.floor(60_000_000 / pattern.bpm);

  const events: { tick: number; data: Buffer }[] = [];

  const trackNameEvent = encodeMeta(0x03, Buffer.from(trackName, 'ascii'));
  events.push({ tick: 0, data: trackNameEvent });
  events.push({ tick: 0, data: encodeVarLen(0x00) }); // tempo
  const tempoBytes = Buffer.alloc(3);
  tempoBytes.writeUIntBE(microPerQuarter, 0, 3);
  events.push({ tick: 0, data: Buffer.concat([Buffer.from([0xff, 0x51, 0x03]), tempoBytes]) });

  for (const ev of pattern.events) {
    const { midi } = noteNameForScaleIndex(pattern.key, ev.note);
    const startTick = ev.tick * (ticksPerBeat / 4);
    const endTick = startTick + ev.duration * (ticksPerBeat / 4);
    events.push({ tick: startTick, data: encodeNoteOn(0, midi, ev.velocity) });
    events.push({ tick: endTick, data: encodeNoteOff(0, midi) });
  }

  events.push({ tick: pattern.events.at(-1)?.tick ?? 64, data: Buffer.from([0xff, 0x2f, 0x00]) });
  events.sort((a, b) => a.tick - b.tick);

  let last = 0;
  const trackData: Buffer[] = [];
  for (const ev of events) {
    trackData.push(encodeVarLen(ev.tick - last));
    trackData.push(ev.data);
    last = ev.tick;
  }

  const trackChunk = Buffer.concat(trackData);
  const header = Buffer.alloc(14);
  header.write('MThd', 0);
  header.writeUInt32BE(6, 4);
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(1, 10);
  header.writeUInt16BE(ticksPerBeat, 12);

  const trackHeader = Buffer.alloc(8);
  trackHeader.write('MTrk', 0);
  trackHeader.writeUInt32BE(trackChunk.length, 4);

  return Buffer.concat([header, trackHeader, trackChunk]);
}

function encodeNoteOn(channel: number, note: number, velocity: number): Buffer {
  return Buffer.from([0x90 | channel, note & 0x7f, velocity & 0x7f]);
}

function encodeNoteOff(channel: number, note: number): Buffer {
  return Buffer.from([0x80 | channel, note & 0x7f, 0x40]);
}

function encodeMeta(type: number, data: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0xff, type, data.length]), data]);
}

function encodeVarLen(value: number): Buffer {
  const bytes: number[] = [];
  bytes.push(value & 0x7f);
  let v = value >> 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return Buffer.from(bytes);
}

export function generateTrackerPattern(
  theme: AudioBible['biomeThemes'][number],
  seed: number,
): TrackerPattern {
  const rng = new SeededRNG(seed);
  const bpm = tempoToBpm(theme.tempo);
  const events: TrackerEvent[] = [];

  for (let tick = 0; tick < 64; tick += 4) {
    events.push({
      tick,
      note: rng.int(0, 7),
      duration: 4,
      velocity: rng.int(60, 100),
    });
  }

  return { version: '0.1.0', bpm, key: theme.key, mood: theme.mood, events };
}

export function synthesizeBiomeLoop(
  theme: AudioBible['biomeThemes'][number],
  seed: number,
  durationSec = 8,
): Buffer {
  const rng = new SeededRNG(seed);
  const scale = SCALE_FREQ[theme.key] ?? SCALE_FREQ.Am!;
  const bpm = tempoToBpm(theme.tempo);
  const beatSec = 60 / bpm;
  const sampleCount = Math.floor(durationSec * SAMPLE_RATE);
  const samples = new Float32Array(sampleCount);

  let tick = 0;
  while (tick < sampleCount) {
    const beatIndex = Math.floor(tick / SAMPLE_RATE / beatSec);
    const noteIdx = (beatIndex + rng.int(0, 2)) % scale.length;
    const freq = scale[noteIdx]! * (beatIndex % 8 === 0 ? 0.5 : 1);
    const noteLen = Math.min(Math.floor(beatSec * SAMPLE_RATE * 0.85), sampleCount - tick);

    for (let i = 0; i < noteLen; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.min(1, (1 - i / noteLen) * 2) * Math.min(1, i / (SAMPLE_RATE * 0.02));
      const wave =
        Math.sin(2 * Math.PI * freq * t) * 0.6 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.2;
      const idx = tick + i;
      if (idx < sampleCount) samples[idx]! += wave * env * 0.12;
    }

    tick += Math.floor(beatSec * SAMPLE_RATE);
  }

  return encodeWav(samples);
}

function encodeWav(samples: Float32Array): Buffer {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    buffer.writeInt16LE(Math.floor(s * 32767), 44 + i * 2);
  }
  return buffer;
}

export function generateMusicFromAudioBible(
  audioBible: AudioBible,
  seed: number,
): MusicGenerationResult {
  const audio = new Map<string, Buffer>();
  const patterns = new Map<string, TrackerPattern>();
  const midi = new Map<string, Buffer>();
  const furnace = new Map<string, FurnaceModule>();

  for (let i = 0; i < audioBible.biomeThemes.length; i++) {
    const theme = audioBible.biomeThemes[i]!;
    const pattern = generateTrackerPattern(theme, seed + i * 50);
    patterns.set(theme.biomeId, pattern);
    audio.set(`music_${theme.biomeId}`, synthesizeBiomeLoop(theme, seed + i * 100));
    midi.set(theme.biomeId, exportPatternToMidi(pattern, `${theme.biomeId}_${theme.mood}`));
    furnace.set(theme.biomeId, exportFurnaceModule(pattern, `${theme.biomeId}_${theme.mood}`));
  }

  const titleTheme = audioBible.biomeThemes[0] ?? {
    biomeId: 'title',
    mood: 'calm',
    tempo: 'slow' as const,
    key: 'Am',
  };
  audio.set('music_title', synthesizeBiomeLoop(titleTheme, seed + 999, 12));

  return { audio, patterns, midi, furnace };
}

export async function enhanceMusicWithStableAudio(
  result: MusicGenerationResult,
  audioBible: AudioBible,
  seed: number,
): Promise<string[]> {
  const warnings: string[] = [];
  const provider = new StableAudioProvider();
  if (!(await provider.checkHealth())) return warnings;

  const theme = audioBible.biomeThemes[0];
  if (!theme) return warnings;

  try {
    const generated = await provider.generate({
      prompt: `${audioBible.musicStyle}, ${theme.mood}, metroidvania biome ${theme.biomeId}`,
      seed,
      duration: 8,
    });
    result.audio.set(`music_${theme.biomeId}`, generated.buffer);
  } catch (err) {
    warnings.push(
      `Stable Audio failed — using procedural loop: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return warnings;
}
