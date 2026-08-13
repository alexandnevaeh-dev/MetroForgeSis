import { useRef, useState } from 'react';
import { blobToWavBase64, startSpeechRecording } from './speech-capture.js';

interface CommandBarProps {
  projectPath: string;
  selectedRoomId?: string;
  placeholder?: string;
  onSuccess?: (summary: string) => void;
}

export function CommandBar({
  projectPath,
  selectedRoomId,
  placeholder = 'Try: connect room_a to room_b, add treasure room, make this room harder…',
  onSuccess,
}: CommandBarProps) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRecordingRef = useRef<(() => void) | null>(null);

  const run = async () => {
    if (!input.trim() || !window.metroforge?.executeAiCommand) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await window.metroforge.executeAiCommand(projectPath, input.trim(), selectedRoomId);
    setBusy(false);
    if (result.success) {
      setMessage(result.summary ?? 'Command applied');
      onSuccess?.(result.summary ?? 'Command applied');
      setInput('');
    } else {
      setError(result.error ?? 'Command failed');
    }
  };

  const toggleVoice = async () => {
    if (listening) {
      stopRecordingRef.current?.();
      return;
    }
    if (!window.metroforge?.transcribeSpeech) {
      setError('Speech recognition is unavailable in this build');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone access is not supported here');
      return;
    }

    setError(null);
    setMessage(null);
    setListening(true);

    try {
      const recording = startSpeechRecording();
      stopRecordingRef.current = recording.stop;

      const blob = await recording.done;
      setListening(false);
      stopRecordingRef.current = null;
      setBusy(true);

      const wavBase64 = await blobToWavBase64(blob);
      const transcript = await window.metroforge.transcribeSpeech(wavBase64);
      setBusy(false);

      if (!transcript.success || !transcript.text?.trim()) {
        setError(transcript.error ?? 'No speech detected');
        return;
      }

      setInput(transcript.text.trim());
      setMessage('Voice captured — review and press Run');
    } catch (err) {
      setListening(false);
      setBusy(false);
      stopRecordingRef.current = null;
      setError(err instanceof Error ? err.message : 'Voice capture failed');
    }
  };

  return (
    <div className="command-bar panel">
      <label>
        AI Command
        <div className="row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            disabled={busy || listening}
            onKeyDown={(e) => e.key === 'Enter' && run()}
          />
          <button
            type="button"
            onClick={toggleVoice}
            disabled={busy}
            title={listening ? 'Stop recording' : 'Dictate command'}
          >
            {listening ? 'Stop' : 'Mic'}
          </button>
          <button type="button" className="primary" onClick={run} disabled={busy || listening || !input.trim()}>
            {busy ? 'Running…' : 'Run'}
          </button>
        </div>
      </label>
      {listening && <p className="hint">Listening… click Stop when finished.</p>}
      {message && <p className="hint">{message}</p>}
      {error && <p className="result error">{error}</p>}
    </div>
  );
}
