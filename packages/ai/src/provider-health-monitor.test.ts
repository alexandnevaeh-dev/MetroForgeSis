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

  it('carries a granular status through instead of collapsing to healthy/unavailable', () => {
    const monitor = new ProviderHealthMonitor();
    const snapshots = monitor.snapshotImageProviders([
      { id: 'nvidia-image', local: false, healthy: false, status: 'RATE_LIMITED', reason: 'HTTP 429' },
      { id: 'nvidia-image-2', local: false, healthy: false, status: 'AUTH_FAILED', reason: 'bad key' },
      { id: 'comfyui', local: true, healthy: true, status: 'HEALTHY', reason: 'reachable' },
    ]);
    expect(snapshots[0]?.status).toBe('RATE_LIMITED');
    expect(snapshots[0]?.message).toBe('HTTP 429');
    expect(snapshots[1]?.status).toBe('AUTH_FAILED');
    expect(snapshots[2]?.status).toBe('HEALTHY');
  });

  it('normalizes unrecognized or missing status strings to UNKNOWN', () => {
    const monitor = new ProviderHealthMonitor();
    const snapshots = monitor.snapshotImageProviders([
      { id: 'mystery', local: true, healthy: false, status: 'SOMETHING_NEW' },
    ]);
    expect(snapshots[0]?.status).toBe('UNKNOWN');
  });

  it('includes extra snapshots such as vision probes', async () => {
    const monitor = new ProviderHealthMonitor();
    const registry = {
      listEnabled: () =>
        [{ id: 'ollama', health: 'healthy' as const, local: true }] as AIProvider[],
    };
    const all = await monitor.snapshotAll({
      textRegistry: registry as never,
      extra: [
        {
          id: 'nvidia-vision',
          category: 'vision',
          health: 'unavailable',
          status: 'OFFLINE',
          local: false,
        },
      ],
    });
    expect(all.some((s) => s.category === 'llm')).toBe(true);
    expect(all.some((s) => s.category === 'vision')).toBe(true);
  });
});
