import { describe, it, expect } from 'vitest';
import { ProviderHealthMonitor } from './provider-health-monitor.js';
import type { AIProvider } from './types.js';

describe('ProviderHealthMonitor', () => {
  it('maps image provider probe results', () => {
    const monitor = new ProviderHealthMonitor();
    const snapshots = monitor.snapshotImageProviders([
      { id: 'comfyui', local: true, healthy: true },
      { id: 'nvidia-image', local: false, healthy: false },
    ]);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]?.health).toBe('healthy');
    expect(snapshots[1]?.health).toBe('unavailable');
  });

  it('includes extra snapshots such as vision probes', async () => {
    const monitor = new ProviderHealthMonitor();
    const registry = {
      listEnabled: () =>
        [{ id: 'ollama', health: 'healthy' as const, local: true }] as AIProvider[],
    };
    const all = await monitor.snapshotAll({
      textRegistry: registry as never,
      extra: [{ id: 'nvidia-vision', category: 'vision', health: 'unavailable', local: false }],
    });
    expect(all.some((s) => s.category === 'llm')).toBe(true);
    expect(all.some((s) => s.category === 'vision')).toBe(true);
  });
});
