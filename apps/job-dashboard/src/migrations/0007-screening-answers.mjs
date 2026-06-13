export async function up(pool) {
  if (pool.dialect === 'sqlite') {
    pool.exec(`
      CREATE TABLE IF NOT EXISTS screening_answers (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
        question TEXT NOT NULL DEFAULT '',
        answer TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        source TEXT NOT NULL DEFAULT 'panel',
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS screening_answers_job_position_idx
        ON screening_answers (job_id, position);
    `);
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS screening_answers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
        question TEXT NOT NULL DEFAULT '',
        answer TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        source TEXT NOT NULL DEFAULT 'panel',
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS screening_answers_job_position_idx
        ON screening_answers (job_id, position);
    `);
  }
}

export async function down(pool) {
  if (pool.dialect === 'sqlite') {
    pool.exec('DROP TABLE IF EXISTS screening_answers;');
  } else {
    await pool.query('DROP TABLE IF EXISTS screening_answers;');
  }
}
