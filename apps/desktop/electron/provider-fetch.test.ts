import { describe, expect, it, vi } from 'vitest';
import { createNvidiaDesktopFetch } from './provider-fetch.js';
describe('desktop NVIDIA transport', () => {
  it('forwards the original method, headers, body and cancellation', async () => {
    const desktop = vi.fn().mockResolvedValue(new Response('ok'));
    const node = vi.fn(); const fetch = createNvidiaDesktopFetch(desktop, node);
    const init = { method: 'POST', headers: { Authorization: 'Bearer test-only' }, body: '{}', signal: new AbortController().signal };
    await fetch(new URL('https://ai.api.nvidia.com/v1/genai/example'), init);
    expect(desktop).toHaveBeenCalledWith('https://ai.api.nvidia.com/v1/genai/example', init);
    expect(node).not.toHaveBeenCalled();
  });
  it('preserves other hosts, schemes and integrity verification', async () => {
    const desktop = vi.fn(); const node = vi.fn().mockResolvedValue(new Response());
    const fetch = createNvidiaDesktopFetch(desktop, node);
    await fetch('https://ai.api.nvidia.com.example.org/test');
    await fetch('http://ai.api.nvidia.com/test');
    await fetch('data:text/plain,hello');
    await fetch(new Request('https://integrate.api.nvidia.com/v1/models', { integrity: 'sha256-test' }));
    expect(node).toHaveBeenCalledTimes(4); expect(desktop).not.toHaveBeenCalled();
  });
  it('does not silently retry a failed provider request on another transport', async () => {
    const error = new Error('network failed');
    const desktop = vi.fn().mockRejectedValue(error); const node = vi.fn();
    await expect(createNvidiaDesktopFetch(desktop, node)('https://integrate.api.nvidia.com/v1/models')).rejects.toBe(error);
    expect(node).not.toHaveBeenCalled();
  });
});
