const TARGET_SAMPLE_RATE = 16_000;

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, (sampleRate * numChannels * bitsPerSample) / 8, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function resampleMono(input: AudioBuffer, targetRate: number): Float32Array {
  const channel = input.numberOfChannels > 1 ? mixToMono(input) : input.getChannelData(0);
  if (input.sampleRate === targetRate) {
    return channel.slice();
  }

  const ratio = input.sampleRate / targetRate;
  const outputLength = Math.max(1, Math.round(channel.length / ratio));
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const sourceIndex = i * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(channel.length - 1, left + 1);
    const frac = sourceIndex - left;
    output[i] = channel[left]! * (1 - frac) + channel[right]! * frac;
  }
  return output;
}

function mixToMono(input: AudioBuffer): Float32Array {
  const length = input.length;
  const mixed = new Float32Array(length);
  for (let channel = 0; channel < input.numberOfChannels; channel++) {
    const data = input.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      mixed[i] = (mixed[i] ?? 0) + data[i]! / input.numberOfChannels;
    }
  }
  return mixed;
}

/** Converts a browser-recorded audio blob to 16 kHz mono WAV base64 for Whisper. */
export async function blobToWavBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext();
  try {
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const mono = resampleMono(decoded, TARGET_SAMPLE_RATE);
    const wavBlob = encodeWav(mono, TARGET_SAMPLE_RATE);
    const wavBuffer = await wavBlob.arrayBuffer();
    const bytes = new Uint8Array(wavBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  } finally {
    await audioContext.close();
  }
}

export function startSpeechRecording(maxMs = 8000): { stop: () => void; done: Promise<Blob> } {
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let timeout = 0;

  const done = (async () => {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    recorder = rec;
    const chunks: BlobPart[] = [];

    return new Promise<Blob>((resolve, reject) => {
      timeout = window.setTimeout(() => {
        if (rec.state !== 'inactive') {
          rec.stop();
        }
      }, maxMs);

      rec.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      rec.onerror = () => {
        window.clearTimeout(timeout);
        stream?.getTracks().forEach((track) => track.stop());
        reject(new Error('Microphone recording failed'));
      };
      rec.onstop = () => {
        window.clearTimeout(timeout);
        stream?.getTracks().forEach((track) => track.stop());
        resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      };

      rec.start();
    });
  })();

  return {
    stop: () => {
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
    },
    done,
  };
}
