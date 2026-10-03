import { useCallback, useEffect, useRef, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { useStudio } from './StudioContext.js';
import type { CredentialStatus } from './metroforge-api.js';
import { Badge, Button, Input, LoadingState } from './ui/index.js';

const PROVIDERS = [
  { id: 'nvidia', name: 'NVIDIA NIM', purpose: 'Text, image generation and visual review' },
  { id: 'gemini', name: 'Google Gemini', purpose: 'Game planning and text generation' },
  { id: 'groq', name: 'Groq', purpose: 'Fast text generation' },
  { id: 'openrouter', name: 'OpenRouter', purpose: 'Text models from multiple providers' },
  { id: 'huggingface', name: 'Hugging Face', purpose: 'Hosted text and image models' },
  { id: 'stability', name: 'Stability AI', purpose: 'Image generation · paid provider' },
  { id: 'deepai', name: 'DeepAI', purpose: 'Image generation · paid provider' },
  { id: 'replicate', name: 'Replicate', purpose: 'Hosted image generation · paid provider' },
] as const;

/** Kept mounted by the shell: unfinished keys survive navigation in memory only. */
export function ApiKeysScreen({ active }: { active: boolean }) {
  const { navigate } = useStudio();
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const lock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!window.metroforge?.getCredentialStatus) throw new Error('Bridge unavailable');
      setStatus(await window.metroforge.getCredentialStatus());
    } catch {
      setError('Could not load API key status. Restart MetroForge or retry.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (active) {
      void load();
      setRevealed({});
      setConfirmRemove(null);
    }
  }, [active, load]);
  const dirty = Object.values(drafts).some(Boolean);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty || lock.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  async function mutate(id: string, remove: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(id);
    setMessage('');
    setError('');
    try {
      const next = remove
        ? await window.metroforge!.removeCredential(id)
        : await window.metroforge!.saveCredential(id, drafts[id]);
      setStatus(next);
      setDrafts((previous) => ({ ...previous, [id]: '' }));
      setRevealed((previous) => ({ ...previous, [id]: false }));
      setConfirmRemove(null);
      const provider = PROVIDERS.find((provider) => provider.id === id)?.name;
      setMessage(
        remove
          ? `${provider} saved key removed. Environment keys are unchanged.`
          : `${provider} key saved securely. New generation jobs can use it now. Check provider health to verify access.`,
      );
    } catch {
      // Never render an IPC exception payload: provider libraries may include request details.
      setError(
        'The key was not saved or removed. Your input is still available. Check secure storage and retry.',
      );
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }

  const canSave = Boolean(status?.encryptionAvailable && !status.error);
  return (
    <section className="workspace-screen credentials-screen" hidden={!active}>
      <ScreenHeader
        eyebrow="Connections"
        title="API Keys"
        description="Connect your AI providers. Add or replace a key here without editing configuration files."
        actions={<Button onClick={() => navigate('Providers')}>Check provider health</Button>}
      />
      <div className="credentials-intro panel">
        <div>
          <span className="type-label">PRIVATE CONNECTIONS</span>
          <h3>Your keys, on this computer</h3>
          <p className="hint">
            Saved keys are encrypted for your Windows account in the application data folder.
            Existing environment keys continue to work. Saving a key does not enable a disabled
            provider or verify its quota.
          </p>
        </div>
        <Badge tone={canSave ? 'success' : 'warning'}>
          {loading
            ? 'Checking storage'
            : canSave
              ? 'Encrypted storage ready'
              : 'Storage unavailable'}
        </Badge>
      </div>
      {loading && <LoadingState title="Checking saved connections…" />}
      {error && (
        <div className="result error" role="alert">
          {error}{' '}
          <Button size="sm" disabled={!!busy} onClick={() => void load()}>
            Retry status
          </Button>
        </div>
      )}
      {status?.error && (
        <p className="result error" role="alert">
          {status.error} Existing keys are preserved.
        </p>
      )}
      {status && !status.encryptionAvailable && (
        <p className="result error" role="alert">
          Secure storage is unavailable. No keys will be saved as plain text.
        </p>
      )}
      <p className="credentials-feedback hint" role="status">
        {message ||
          (dirty
            ? 'Unsaved input stays here while you navigate. Save or discard it before closing MetroForge.'
            : 'Key presence does not guarantee a successful connection. Local generation can run without hosted API keys.')}
      </p>
      {status && (
        <div className="credentials-grid">
          {PROVIDERS.map((provider) => {
            const entry = status.entries.find((entry) => entry.id === provider.id);
            const value = drafts[provider.id] || '';
            const invalid =
              !!value &&
              (!value.trim() || /[\s\x00-\x1f\x7f]/.test(value.trim()) || value.length > 8192);
            const id = `key-${provider.id}`;
            return (
              <article className="panel credential-card" key={provider.id}>
                <header>
                  <h3>{provider.name}</h3>
                  <Badge tone={entry?.configured ? 'success' : 'muted'}>
                    {entry?.source === 'saved'
                      ? 'Saved key'
                      : entry?.source === 'environment'
                        ? 'From environment'
                        : 'Not configured'}
                  </Badge>
                </header>
                <p className="hint">{provider.purpose}</p>
                <form
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (value.trim() && !invalid && canSave) void mutate(provider.id, false);
                  }}
                >
                  <label htmlFor={id}>{entry?.configured ? 'Replace API key' : 'API key'}</label>
                  <div className="credential-input-row">
                    <Input
                      id={id}
                      name={id}
                      type={revealed[provider.id] ? 'text' : 'password'}
                      autoComplete="off"
                      spellCheck={false}
                      value={value}
                      disabled={!!busy || !canSave}
                      aria-invalid={invalid}
                      aria-describedby={invalid ? `${id}-error` : `${id}-help`}
                      placeholder={
                        entry?.configured
                          ? 'Enter a replacement key'
                          : 'Paste your provider API key'
                      }
                      onChange={(event) =>
                        setDrafts((previous) => ({
                          ...previous,
                          [provider.id]: event.target.value,
                        }))
                      }
                    />
                    <Button
                      disabled={!!busy || !canSave}
                      aria-label={`${revealed[provider.id] ? 'Hide' : 'Show'} ${provider.name} API key`}
                      aria-pressed={!!revealed[provider.id]}
                      onClick={() =>
                        setRevealed((previous) => ({
                          ...previous,
                          [provider.id]: !previous[provider.id],
                        }))
                      }
                    >
                      {revealed[provider.id] ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                  <p className="credential-help hint" id={invalid ? `${id}-error` : `${id}-help`}>
                    {invalid
                      ? 'Paste a single key without spaces or line breaks, up to 8192 characters.'
                      : 'Stored keys are never sent back to this form.'}
                  </p>
                  <div className="row credential-actions">
                    <Button
                      type="submit"
                      variant="primary"
                      className="credential-save"
                      disabled={!!busy || !canSave || !value.trim() || invalid}
                      aria-busy={busy === provider.id}
                    >
                      {busy === provider.id ? 'Working…' : 'Save key'}
                    </Button>
                    {value && (
                      <Button
                        disabled={!!busy}
                        onClick={() => {
                          setDrafts((previous) => ({ ...previous, [provider.id]: '' }));
                          setRevealed((previous) => ({ ...previous, [provider.id]: false }));
                        }}
                      >
                        Discard input
                      </Button>
                    )}
                    {entry?.source === 'saved' && (
                      <Button
                        variant="ghost"
                        disabled={!!busy || !canSave}
                        onClick={() => setConfirmRemove(provider.id)}
                      >
                        Remove saved key
                      </Button>
                    )}
                  </div>
                </form>
                {confirmRemove === provider.id && (
                  <div
                    className="credential-remove"
                    role="group"
                    aria-label={`Confirm removal of ${provider.name} saved key`}
                  >
                    <p>
                      Remove the saved {provider.name} key? An existing environment key will become
                      active again. Otherwise this provider will need a new key.
                    </p>
                    <Button disabled={!!busy} onClick={() => setConfirmRemove(null)}>
                      Keep key
                    </Button>{' '}
                    <Button
                      variant="danger"
                      disabled={!!busy}
                      onClick={() => void mutate(provider.id, true)}
                    >
                      Confirm removal
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
