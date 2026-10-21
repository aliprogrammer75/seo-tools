
CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS app_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  site_id INTEGER NOT NULL REFERENCES sites(id),
  role TEXT NOT NULL DEFAULT 'viewer',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS login_limits (
  identifier TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  reset_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS channel_snapshots (
  site_id INTEGER NOT NULL REFERENCES sites(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  channel TEXT NOT NULL,
  orders INTEGER NOT NULL DEFAULT 0,
  revenue_toman INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER,
  source TEXT NOT NULL DEFAULT 'woocommerce',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(site_id,period_start,period_end,channel,source)
);
CREATE TABLE IF NOT EXISTS landing_snapshots (
  site_id INTEGER NOT NULL REFERENCES sites(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  page_path TEXT NOT NULL,
  page_type TEXT NOT NULL DEFAULT 'سایر',
  orders INTEGER NOT NULL DEFAULT 0,
  revenue_toman INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'woocommerce',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(site_id,period_start,period_end,page_path,source)
);
CREATE INDEX IF NOT EXISTS idx_ch_period ON channel_snapshots(site_id,period_end);
CREATE INDEX IF NOT EXISTS idx_land_period ON landing_snapshots(site_id,period_end);
