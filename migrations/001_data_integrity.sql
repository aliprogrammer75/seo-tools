-- Safe, additive migration for existing D1 databases.
-- Apply BEFORE deploying the new handlers:
-- npx wrangler d1 execute seogets-db --remote --file=./migrations/001_data_integrity.sql
CREATE TABLE IF NOT EXISTS search_query_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  query TEXT NOT NULL,
  page TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  UNIQUE(date, query, page)
);
CREATE TABLE IF NOT EXISTS import_status (
  date TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running', 'complete')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_queries_date ON search_queries(date);
CREATE INDEX IF NOT EXISTS idx_pages_date ON search_pages(date);
CREATE INDEX IF NOT EXISTS idx_query_pages_date ON search_query_pages(date);
