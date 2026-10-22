
CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'pending',
  archived_at TEXT,
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

-- Added in migration 2026-10-22; ALTER sites archived_at on existing deployments
CREATE TABLE IF NOT EXISTS site_integrations (site_id INTEGER NOT NULL REFERENCES sites(id), kind TEXT NOT NULL, encrypted_credentials TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_attempt_at TEXT, last_success_at TEXT, last_status TEXT NOT NULL DEFAULT 'pending', last_error TEXT, PRIMARY KEY(site_id,kind));
CREATE INDEX IF NOT EXISTS idx_site_archived ON sites(archived_at);


-- Analytics 4 connections and tenant-isolated aggregate snapshots, added 2026-10-22
CREATE TABLE IF NOT EXISTS ga4_connections (
 site_id INTEGER NOT NULL PRIMARY KEY REFERENCES sites(id),
 property_id TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1,
 last_attempt_at TEXT,
 last_success_at TEXT,
 last_status TEXT NOT NULL DEFAULT 'pending',
 last_error TEXT
);
CREATE TABLE IF NOT EXISTS ga4_channel_snapshots (
 site_id INTEGER NOT NULL REFERENCES sites(id),
 period_start TEXT NOT NULL,
 period_end TEXT NOT NULL,
 channel_group TEXT NOT NULL,
 source_medium TEXT NOT NULL,
 sessions INTEGER NOT NULL DEFAULT 0,
 users INTEGER NOT NULL DEFAULT 0,
 engaged_sessions INTEGER NOT NULL DEFAULT 0,
 ga4_purchases INTEGER NOT NULL DEFAULT 0,
 purchase_revenue REAL NOT NULL DEFAULT 0,
 PRIMARY KEY(site_id,period_start,period_end,channel_group,source_medium)
);
CREATE INDEX IF NOT EXISTS idx_ga4_channels_period ON ga4_channel_snapshots(site_id,period_end);
CREATE TABLE IF NOT EXISTS ga4_landing_snapshots (
 site_id INTEGER NOT NULL REFERENCES sites(id),
 period_start TEXT NOT NULL,
 period_end TEXT NOT NULL,
 page_path TEXT NOT NULL,
 sessions INTEGER NOT NULL DEFAULT 0,
 users INTEGER NOT NULL DEFAULT 0,
 engaged_sessions INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(site_id,period_start,period_end,page_path)
);
CREATE TABLE IF NOT EXISTS ga4_daily_snapshots (
 site_id INTEGER NOT NULL REFERENCES sites(id),
 day TEXT NOT NULL,
 channel_group TEXT NOT NULL,
 sessions INTEGER NOT NULL DEFAULT 0,
 users INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(site_id,day,channel_group)
);

-- Manual paid-order-to-GA4 transaction audit snapshots; never store customer information.
CREATE TABLE IF NOT EXISTS ecommerce_tracking_audits (
  site_id INTEGER NOT NULL REFERENCES sites(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  woo_paid_orders INTEGER NOT NULL DEFAULT 0,
  ga4_transactions INTEGER NOT NULL DEFAULT 0,
  matched_orders INTEGER NOT NULL DEFAULT 0,
  unreported_order_ids TEXT NOT NULL DEFAULT '[]',
  ga4_unmatched_ids TEXT NOT NULL DEFAULT '[]',
  woo_marked_orders INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'read_only_reconciliation',
  PRIMARY KEY(site_id,period_start,period_end)
);
