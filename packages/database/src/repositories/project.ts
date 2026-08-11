import type { SqliteDatabase } from '../types.js';
import type { Project } from '@metroforge/schemas';
import { ProjectSchema } from '@metroforge/schemas';

export class ProjectRepository {
  constructor(private readonly db: SqliteDatabase) {}

  create(project: Project): Project {
    const parsed = ProjectSchema.parse(project);
    this.db
      .prepare(
        `INSERT INTO projects (id, slug, title, description, profile, mode, seed, output_path, status, created_at, updated_at)
         VALUES (@id, @slug, @title, @description, @profile, @mode, @seed, @outputPath, @status, @createdAt, @updatedAt)`,
      )
      .run({
        id: parsed.id,
        slug: parsed.slug,
        title: parsed.title,
        description: parsed.description,
        profile: parsed.profile,
        mode: parsed.mode,
        seed: parsed.seed,
        outputPath: parsed.outputPath,
        status: parsed.status,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
      });
    return parsed;
  }

  findBySlug(slug: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return this.rowToProject(row);
  }

  findById(id: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return this.rowToProject(row);
  }

  list(): Project[] {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Record<
      string,
      unknown
    >[];
    return rows.map((r) => this.rowToProject(r));
  }

  updateStatus(id: string, status: Project['status']): void {
    this.db
      .prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), id);
  }

  private rowToProject(row: Record<string, unknown>): Project {
    return ProjectSchema.parse({
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      profile: row.profile,
      mode: row.mode,
      seed: row.seed,
      outputPath: row.output_path,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
