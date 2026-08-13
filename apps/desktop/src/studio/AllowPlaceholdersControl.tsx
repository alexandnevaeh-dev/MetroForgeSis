import { useEffect, useState } from 'react';
import { useStudio } from './StudioContext.js';

/** Project-scoped allowPlaceholders toggle (writes project.json). */
export function AllowPlaceholdersControl({
  onChanged,
}: {
  onChanged?: (allowPlaceholders: boolean) => void;
}) {
  const { selectedPath, hasActiveProject } = useStudio();
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPath || !window.metroforge?.getProjectAllowPlaceholders) {
      setAllowed(false);
      setMessage(null);
      return;
    }
    window.metroforge
      .getProjectAllowPlaceholders(selectedPath)
      .then((r) => {
        setAllowed(r.allowPlaceholders === true);
        if (!r.success && r.errors?.length) setMessage(r.errors.join('; '));
        else setMessage(null);
      })
      .catch((err) => setMessage(String(err)));
  }, [selectedPath]);

  if (!hasActiveProject || !selectedPath) {
    return <p className="hint">Select an active project to edit allowPlaceholders.</p>;
  }

  const toggle = async (next: boolean) => {
    if (!window.metroforge?.setProjectAllowPlaceholders) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.metroforge.setProjectAllowPlaceholders(selectedPath, next);
      if (!result.success) {
        setMessage(result.errors?.join('; ') ?? 'Failed to update project.json');
        return;
      }
      setAllowed(result.allowPlaceholders);
      setMessage(
        result.allowPlaceholders
          ? 'Saved allowPlaceholders: true — AssetProductionGate will pass for prototyping.'
          : 'Saved allowPlaceholders: false — placeholders block productionReady.',
      );
      onChanged?.(result.allowPlaceholders);
    } catch (err) {
      setMessage(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form-stack" style={{ gap: '0.35rem' }}>
      <label className="check-inline">
        <input
          type="checkbox"
          checked={allowed}
          disabled={busy}
          onChange={(e) => void toggle(e.target.checked)}
        />
        Allow placeholders for this project (<code>project.json</code> → <code>allowPlaceholders</code>)
      </label>
      <p className="hint">
        Prototype opt-out only — does not claim production art. Prefer healthy ComfyUI / Diffusers / NVIDIA image
        providers so assets leave PLACEHOLDER maturity.
      </p>
      {message && <p className="hint">{message}</p>}
    </div>
  );
}
