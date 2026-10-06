type Fetch = typeof globalThis.fetch;
const NVIDIA_HOSTS = new Set(['ai.api.nvidia.com', 'integrate.api.nvidia.com']);

/** Use the desktop's system-aware network stack only for official NVIDIA APIs. */
export function createNvidiaDesktopFetch(desktopFetch: Fetch, nodeFetch: Fetch): Fetch {
  return async (input, init) => {
    const request = typeof input === 'object' && 'url' in input ? input : undefined;
    const url = new URL(request ? request.url : String(input));
    // Electron ignores Fetch integrity; retain Node's verification for those requests.
    const integrity = init?.integrity ?? request?.integrity;
    if (url.protocol === 'https:' && NVIDIA_HOSTS.has(url.hostname) && !integrity) {
      return desktopFetch(input instanceof URL ? input.href : input, init);
    }
    return nodeFetch(input, init);
  };
}
