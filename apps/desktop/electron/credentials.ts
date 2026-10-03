import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const CREDENTIAL_KEYS = {
  nvidia: 'NVIDIA_API_KEY',
  gemini: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  huggingface: 'HUGGINGFACE_API_KEY',
  stability: 'STABILITY_API_KEY',
  deepai: 'DEEPAI_API_KEY',
  replicate: 'REPLICATE_API_TOKEN',
} as const;
export type CredentialId = keyof typeof CREDENTIAL_KEYS;
type Cipher = {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
};

/** Main-process only. The renderer receives presence and source, never stored values. */
export class CredentialStore {
  private values: Partial<Record<CredentialId, string>> = {};
  private readonly inherited: Partial<Record<CredentialId, string>> = {};
  private loadError: string | null = null;

  constructor(
    private file: string,
    private cipher: Cipher,
    private env: NodeJS.ProcessEnv,
  ) {
    for (const [id, key] of Object.entries(CREDENTIAL_KEYS)) {
      this.inherited[id as CredentialId] =
        env[key] || (id === 'huggingface' ? env.HF_TOKEN : undefined);
    }
    if (existsSync(file)) {
      try {
        if (!cipher.isEncryptionAvailable()) throw new Error('Encryption unavailable');
        const raw = JSON.parse(cipher.decryptString(readFileSync(file)));
        if (raw.version !== 1 || !raw.values || typeof raw.values !== 'object')
          throw new Error('Invalid store');
        for (const [id, value] of Object.entries(raw.values)) {
          this.validate(id, value);
        }
        this.values = raw.values;
      } catch {
        // Preserve the original encrypted file; never overwrite an unreadable vault.
        this.loadError =
          'Saved keys could not be unlocked. Use the Windows account that saved them.';
      }
    }
    // Normalize inherited aliases even before a vault exists, so provider bootstrap
    // receives the same credential whose presence the UI reports.
    this.apply();
  }

  status() {
    return {
      encryptionAvailable: this.cipher.isEncryptionAvailable(),
      error: this.loadError,
      entries: Object.keys(CREDENTIAL_KEYS).map((id) => {
        const key = id as CredentialId;
        return {
          id: key,
          configured: Boolean(
            this.env[CREDENTIAL_KEYS[key]] || (key === 'huggingface' && this.env.HF_TOKEN),
          ),
          source: this.values[key]
            ? ('saved' as const)
            : this.inherited[key]
              ? ('environment' as const)
              : ('none' as const),
        };
      }),
    };
  }

  save(id: unknown, value: unknown) {
    this.validate(id, value);
    return this.commit({ ...this.values, [id as CredentialId]: (value as string).trim() });
  }

  remove(id: unknown) {
    if (typeof id !== 'string' || !Object.hasOwn(CREDENTIAL_KEYS, id))
      throw new Error('Unknown provider');
    const next = { ...this.values };
    delete next[id as CredentialId];
    return this.commit(next);
  }

  private validate(id: unknown, value: unknown): void {
    if (typeof id !== 'string' || !Object.hasOwn(CREDENTIAL_KEYS, id))
      throw new Error('Unknown provider');
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.length > 8192 ||
      /[\s\x00-\x1f\x7f]/.test(value.trim())
    ) {
      throw new Error(
        'Enter a nonempty API key without spaces or line breaks (maximum 8192 characters).',
      );
    }
  }

  private commit(next: Partial<Record<CredentialId, string>>) {
    if (this.loadError) throw new Error(this.loadError);
    if (!this.cipher.isEncryptionAvailable())
      throw new Error('Secure storage is unavailable. No key was saved.');
    try {
      const encrypted = this.cipher.encryptString(JSON.stringify({ version: 1, values: next }));
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(`${this.file}.pending`, encrypted, { mode: 0o600 });
      renameSync(`${this.file}.pending`, this.file);
    } catch {
      throw new Error(
        'Could not save encrypted keys. Check that the application data folder is writable.',
      );
    }
    this.values = next;
    this.apply();
    return this.status();
  }

  private apply() {
    for (const [id, key] of Object.entries(CREDENTIAL_KEYS)) {
      const value = this.values[id as CredentialId] || this.inherited[id as CredentialId];
      if (value) this.env[key] = value;
      else delete this.env[key];
    }
  }
}
