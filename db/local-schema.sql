-- Local Cloudflare development only. Production uses the immutable Drizzle migrations.
-- CREATE IF NOT EXISTS preserves existing imagery, results and sessions.
CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, type TEXT NOT NULL,
  title TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analyses_owner_created ON analyses(owner, created_at);
CREATE TABLE IF NOT EXISTS personal_records (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL,
  payload TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_personal_owner_kind_created ON personal_records(owner, kind, created_at);
CREATE TABLE IF NOT EXISTS personal_limits (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
