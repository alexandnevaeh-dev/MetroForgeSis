import type { SqliteDatabase } from '../types.js';

export interface AppSettingRecord {
  key: string;
  value: string;
}

/** Known desktop preference keys persisted in the settings table. */
export const APP_SETTING_KEYS = {
  defaultProfile: 'app.defaultProfile',
  defaultMode: 'app.defaultMode',
  godotExecutable: 'app.godotExecutable',
  concurrencyImage: 'app.concurrency.image',
  concurrencyLlm: 'app.concurrency.llm',
  concurrencyAudio: 'app.concurrency.audio',
  concurrencyCpu: 'app.concurrency.cpu',
  /** NVIDIA NIM image model id; overrides NVIDIA_IMAGE_MODEL when set. */
  nvidiaImageModel: 'app.nvidia.imageModel',
} as const;

export class SettingsRepository {
  constructor(private readonly db: SqliteDatabase) {}

  get(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string): AppSettingRecord {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
    return { key, value };
  }

  setMany(entries: Record<string, string>): AppSettingRecord[] {
    const out: AppSettingRecord[] = [];
    for (const [key, value] of Object.entries(entries)) {
      out.push(this.set(key, value));
    }
    return out;
  }

  list(prefix?: string): AppSettingRecord[] {
    const rows = prefix
      ? (this.db
          .prepare('SELECT key, value FROM settings WHERE key LIKE ? ORDER BY key')
          .all(`${prefix}%`) as Record<string, unknown>[])
      : (this.db.prepare('SELECT key, value FROM settings ORDER BY key').all() as Record<string, unknown>[]);
    return rows.map((row) => ({
      key: row.key as string,
      value: row.value as string,
    }));
  }

  delete(key: string): boolean {
    const result = this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
    return result.changes > 0;
  }
}
