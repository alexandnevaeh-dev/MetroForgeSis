export type AssetProductionGateView = {
  passed: boolean;
  allowPlaceholders: boolean;
  blockedAssets: Array<{ path: string; maturity: string; reason: string }>;
};

/** Lists AssetProductionGate blockers (path + maturity) and documents allowPlaceholders. */
export function AssetProductionGatePanel({
  gate,
  maxRows = 24,
}: {
  gate?: AssetProductionGateView | null;
  maxRows?: number;
}) {
  if (!gate) return null;

  if (gate.passed) {
    if (gate.allowPlaceholders) {
      return (
        <p className="hint">
          AssetProductionGate passed because this project has <code>allowPlaceholders: true</code> (Settings /
          Export toggle → <code>project.json</code>). Placeholders are permitted for prototyping — not a production
          art claim.
        </p>
      );
    }
    return null;
  }

  const rows = gate.blockedAssets.slice(0, maxRows);
  const remaining = gate.blockedAssets.length - rows.length;

  return (
    <div className="asset-gate-panel" style={{ marginTop: '0.65rem' }}>
      <h4>Asset production blockers</h4>
      <p className="hint">
        Visual assets below are PLACEHOLDER / BLOCKOUT / REJECTED — <code>productionReady</code> stays false
        until real image providers succeed or you explicitly allow placeholders.
      </p>
      {rows.length === 0 ? (
        <p className="result error">AssetProductionGate blocked (no asset detail available).</p>
      ) : (
        <ul className="check-list">
          {rows.map((asset) => (
            <li key={asset.path} className="check-warn">
              <code>{asset.path}</code> — {asset.maturity}
              {asset.reason ? ` · ${asset.reason}` : ''}
            </li>
          ))}
          {remaining > 0 && <li className="hint">…and {remaining} more</li>}
        </ul>
      )}
      {!gate.allowPlaceholders && (
        <p className="hint" style={{ marginTop: '0.5rem' }}>
          To prototype-export despite placeholders, enable <strong>Allow placeholders</strong> in Settings or Export
          (writes <code>allowPlaceholders: true</code> to this project&apos;s <code>project.json</code>). Prefer
          configuring ComfyUI / Diffusers / NVIDIA image providers so assets leave PLACEHOLDER maturity.
        </p>
      )}
    </div>
  );
}
