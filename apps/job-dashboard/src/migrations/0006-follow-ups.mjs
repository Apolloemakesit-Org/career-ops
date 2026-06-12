export async function up(pool) {
  if (pool.dialect === 'sqlite') {
    pool.exec(`
      CREATE TABLE IF NOT EXISTS follow_ups (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
        date TEXT NOT NULL DEFAULT (datetime('now')),
        channel TEXT NOT NULL DEFAULT '',
        contact TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS follow_ups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
        date TIMESTAMPTZ NOT NULL DEFAULT now(),
        channel TEXT NOT NULL DEFAULT '',
        contact TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }
}

export async function down(pool) {
  // ...
}
