import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { CredentialStore } from './credentials.js';

// Unit cipher tests persistence/error behavior. Actual Windows safeStorage is tested in Electron.
const key = randomBytes(32);
const cipher = {
  isEncryptionAvailable: () => true,
  encryptString(value: string) {
    const iv = randomBytes(12),
      c = createCipheriv('aes-256-gcm', key, iv);
    return Buffer.concat([iv, c.update(value), c.final(), c.getAuthTag()]);
  },
  decryptString(value: Buffer) {
    const d = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
    d.setAuthTag(value.subarray(-16));
    return Buffer.concat([d.update(value.subarray(12, -16)), d.final()]).toString();
  },
};
function setup(env: NodeJS.ProcessEnv = {}) {
  const file = join(mkdtempSync(join(tmpdir(), 'metroforge-keys-')), 'credentials.enc');
  return { file, env, store: new CredentialStore(file, cipher, env) };
}
describe('encrypted credentials', () => {
  it.each([['together', 'TOGETHER_API_KEY'], ['cerebras', 'CEREBRAS_API_KEY'], ['mistral', 'MISTRAL_API_KEY'], ['lmstudio', 'LMSTUDIO_API_KEY']])('restores and removes the %s credential independently', (id, variable) => {
    const { store, file } = setup();
    store.save(id, 'fixture-token-123');
    const env: NodeJS.ProcessEnv = {};
    const restarted = new CredentialStore(file, cipher, env);
    expect(env[variable]).toBe('fixture-token-123');
    expect(readFileSync(file).includes(Buffer.from('fixture-token-123'))).toBe(false);
    restarted.remove(id);
    expect(env[variable]).toBeUndefined();
  });
  it('persists ciphertext, returns presence only, and restores keys after restart', () => {
    const { store, file, env } = setup();
    const status = store.save('nvidia', 'test-secret-123');
    expect(env.NVIDIA_API_KEY).toBe('test-secret-123');
    expect(JSON.stringify(status)).not.toContain('test-secret-123');
    expect(readFileSync(file).includes(Buffer.from('test-secret-123'))).toBe(false);
    const restarted: NodeJS.ProcessEnv = {};
    new CredentialStore(file, cipher, restarted);
    expect(restarted.NVIDIA_API_KEY).toBe('test-secret-123');
  });
  it('removes only the saved override and restores inherited environment credentials', () => {
    const { store, env } = setup({ NVIDIA_API_KEY: 'inherited' });
    store.save('nvidia', 'override');
    store.remove('nvidia');
    expect(env.NVIDIA_API_KEY).toBe('inherited');
    expect(store.status().entries[0].source).toBe('environment');
  });
  it('removes a saved-only key and preserves other providers', () => {
    const { store, env } = setup();
    store.save('nvidia', 'one');
    store.save('groq', 'two');
    store.remove('nvidia');
    expect(env.NVIDIA_API_KEY).toBeUndefined();
    expect(env.GROQ_API_KEY).toBe('two');
  });
  it('rejects arbitrary environment mutation and malformed values without echoing secrets', () => {
    const { store } = setup();
    for (const value of ['', 'abc\nsecret', 'abc secret', 'x'.repeat(8193), null]) {
      expect(() => store.save('nvidia', value)).toThrow('Enter a nonempty API key');
    }
    for (const id of ['PATH', '__proto__', 'constructor', null]) {
      expect(() => store.save(id, 'secret')).toThrow('Unknown provider');
      expect(() => store.remove(id)).toThrow('Unknown provider');
    }
  });
  it('never falls back to plaintext when encryption is unavailable', () => {
    const { file, env } = setup();
    const store = new CredentialStore(file, { ...cipher, isEncryptionAvailable: () => false }, env);
    expect(() => store.save('nvidia', 'secret')).toThrow('No key was saved');
    expect(env.NVIDIA_API_KEY).toBeUndefined();
  });
  it('preserves an unreadable vault and inherited credentials', () => {
    const { file } = setup();
    writeFileSync(file, 'corrupt');
    const env = { NVIDIA_API_KEY: 'inherited' };
    const store = new CredentialStore(file, cipher, env);
    expect(store.status().error).toBeTruthy();
    expect(() => store.save('nvidia', 'replacement')).toThrow('could not be unlocked');
    expect(readFileSync(file, 'utf8')).toBe('corrupt');
    expect(env.NVIDIA_API_KEY).toBe('inherited');
  });
  it('retains Hugging Face alias fallback', () => {
    const { store, env } = setup({ HF_TOKEN: 'alias' });
    expect(env.HUGGINGFACE_API_KEY).toBe('alias');
    store.save('huggingface', 'override');
    store.remove('huggingface');
    expect(env.HUGGINGFACE_API_KEY).toBe('alias');
  });
});
