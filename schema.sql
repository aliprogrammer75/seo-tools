-- Single configured GSC property per database. Keep full page URLs.
CREATE TABLE IF NOT EXISTS site_totals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS search_queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  keyword TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  UNIQUE(date, keyword)
);
CREATE TABLE IF NOT EXISTS search_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  url TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  UNIQUE(date, url)
);
CREATE TABLE IF NOT EXISTS search_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  device TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  UNIQUE(date, device)
);
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
-- Complete only after all five GSC dimensions have been written successfully.
CREATE TABLE IF NOT EXISTS import_status (
  date TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running', 'complete')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_queries_date ON search_queries(date);
CREATE INDEX IF NOT EXISTS idx_pages_date ON search_pages(date);
CREATE INDEX IF NOT EXISTS idx_query_pages_date ON search_query_pages(date);
