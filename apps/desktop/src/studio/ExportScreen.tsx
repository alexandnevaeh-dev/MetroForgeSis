import { useEffect, useState } from 'react';
import { ScreenHeader } from './ScreenHeader';
import type { StudioProject } from './metroforge-api';

export function ExportScreen() {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [force, setForce] = useState(true);
  const [zip, setZip] = useState(true);
  const [commercialSafe, setCommercialSafe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.metroforge?.listProjects().then((list) => {
      setProjects(list);
      if (list.length > 0) setSelectedPath((p) => p || list[0]!.path);
    });
  }, []);

  const runExport = async () => {
    if (!selectedPath || !window.metroforge?.exportProject) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await window.metroforge.exportProject(selectedPath, { force, zip, commercialSafe });
    setBusy(false);
    if (!result.success) {
      setError(result.errors?.join('; ') ?? 'Export failed');
      return;
    }
    setMessage(result.archivePath ? `Exported to ${result.archivePath}` : 'Export completed');
  };

  return (
    <section>
      <ScreenHeader
        eyebrow="Ship"
        title="Export"
        description="Packages a generated Godot project using the existing exportProject contract. No simulated archives."
      />

      <div className="panel form-stack">
        <label>
          Project
          <select value={selectedPath} onChange={(e) => setSelectedPath(e.target.value)}>
            {projects.map((p) => (
              <option key={p.slug} value={p.path}>
                {p.title ?? p.slug}
              </option>
            ))}
          </select>
        </label>
        <label className="check-inline">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
          Force export even if QA is incomplete
        </label>
        <label className="check-inline">
          <input type="checkbox" checked={zip} onChange={(e) => setZip(e.target.checked)} />
          Create zip archive
        </label>
        <label className="check-inline">
          <input type="checkbox" checked={commercialSafe} onChange={(e) => setCommercialSafe(e.target.checked)} />
          Commercial-safe license filter
        </label>
        <div className="row">
          <button type="button" className="primary" disabled={!selectedPath || busy} onClick={runExport}>
            {busy ? 'Exporting…' : 'Export package'}
          </button>
          <button
            type="button"
            disabled={!selectedPath}
            onClick={() => selectedPath && window.metroforge?.revealProjectFolder?.(selectedPath)}
          >
            Reveal project folder
          </button>
        </div>
        {message && <p className="result success">{message}</p>}
        {error && <p className="result error">{error}</p>}
      </div>
    </section>
  );
}
