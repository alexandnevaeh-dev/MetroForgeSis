import { useEffect, useRef, useState } from 'react';
import type { BiomeBackgroundSnapshot } from '@metroforge/generation';
import { Button, ButtonStrip, Input, InspectorSection, Select } from './ui/index.js';

export function BiomeBackgroundEditor({ projectPath, biomeId }: { projectPath: string; biomeId: string }) {
  const [state, setState] = useState<BiomeBackgroundSnapshot | null>(null);
  const [assetId, setAssetId] = useState('');
  const [opacity, setOpacity] = useState('0.85');
  const [anchorY, setAnchorY] = useState('1');
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false), locked = useRef(false), sequence = useRef(0);
  const adopt = (next: BiomeBackgroundSnapshot) => {
    setState(next); setAssetId(next.settings?.assetId ?? '');
    setOpacity(String(next.settings?.opacity ?? 0.85)); setAnchorY(String(next.settings?.anchorY ?? 1));
  };
  const reload = async () => {
    if (locked.current || !window.metroforge?.readBiomeBackground) return;
    locked.current = true; setBusy(true); setError(''); setMessage('');
    const ticket = ++sequence.current;
    try { const next = await window.metroforge.readBiomeBackground(projectPath, biomeId); if (mounted.current && ticket === sequence.current) adopt(next); }
    catch (e) { if (mounted.current && ticket === sequence.current) setError(String(e)); }
    finally { if (mounted.current && ticket === sequence.current) { locked.current = false; setBusy(false); } }
  };
  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; locked.current = false; sequence.current++; }; }, [projectPath, biomeId]);
  useEffect(() => {
    let current = true; setImage('');
    const path = state?.options.find(option => option.id === assetId)?.path;
    if (path && window.metroforge) void window.metroforge.getAssetPreview(projectPath, path).then(result => { if (current) setImage(result.dataUrl ?? ''); }).catch(() => { if (current) setMessage('Background preview unavailable. Reload to retry.'); });
    return () => { current = false; };
  }, [projectPath, assetId, state?.revision]);
  const dirty = !!state && (assetId !== (state.settings?.assetId ?? '') || (assetId !== '' && (Number(opacity) !== state.settings?.opacity || Number(anchorY) !== state.settings?.anchorY)));
  const valid = Number.isFinite(Number(opacity)) && Number(opacity) >= 0.1 && Number(opacity) <= 1;
  const mutate = async (undo: boolean) => {
    if (locked.current || !state || !window.metroforge) return;
    locked.current = true; setBusy(true); setError(''); setMessage('');
    const ticket = ++sequence.current;
    try {
      const next = undo ? await window.metroforge.undoBiomeBackground(projectPath, biomeId, state.revision)
        : await window.metroforge.saveBiomeBackground(projectPath, biomeId, { assetId: assetId || null, opacity: Number(opacity), anchorY: Number(anchorY) }, state.revision);
      if (mounted.current && ticket === sequence.current) { adopt(next); setMessage(`${undo ? 'Previous background restored' : 'Background applied'} across ${next.roomCount} castle rooms. Restart the game preview.`); }
    } catch (e) { if (mounted.current && ticket === sequence.current) setError(String(e)); }
    finally { if (mounted.current && ticket === sequence.current) { locked.current = false; setBusy(false); } }
  };
  if (!window.metroforge?.readBiomeBackground || (state && !state.supported)) return null;
  return <InspectorSection title="Castle biome background">
    <div role="region" aria-label="Castle biome background" aria-busy={busy}>
      {state && <>
        <p className="hint">One interior across all {state.roomCount} rooms in {biomeId}.</p>
        <label>Background<Select aria-label="Castle background" value={assetId} disabled={busy} onChange={e => { setAssetId(e.target.value); setMessage(''); }}><option value="">Original castle interior</option>{state.options.map(option => <option key={option.id} value={option.id}>{option.id} · {option.width}×{option.height}</option>)}</Select></label>
        {image && <img className="detail-preview" src={image} alt="Castle background preview" />}
        <label>Opacity<Input aria-label="Background opacity" type="number" min="0.1" max="1" step="0.05" value={opacity} disabled={busy || !assetId} onChange={e => setOpacity(e.target.value)} /></label>
        <label>Vertical framing<Select aria-label="Background vertical framing" value={anchorY} disabled={busy || !assetId} onChange={e => setAnchorY(e.target.value)}><option value="1">Align to floor</option><option value="0.5">Center</option><option value="0">Align to ceiling</option></Select></label>
        <ButtonStrip><Button variant="primary" disabled={busy || !dirty || !valid || !state.roomCount} onClick={() => void mutate(false)}>Apply background</Button><Button disabled={busy || !state.canUndo || dirty} onClick={() => void mutate(true)}>Undo background</Button></ButtonStrip>
      </>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status" className="hint">{message}</p>}
      <Button size="sm" disabled={busy} onClick={() => void reload()}>Reload background settings</Button>
    </div>
  </InspectorSection>;
}
