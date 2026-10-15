PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    gsc_property_url TEXT NOT NULL UNIQUE,
    timezone TEXT NOT NULL DEFAULT 'Asia/Tehran',
    default_search_type TEXT NOT NULL DEFAULT 'web'
        CHECK (default_search_type IN (
            'web', 'image', 'video', 'news', 'discover', 'googleNews'
        )),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'archived')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_sitemaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    sitemap_type TEXT NOT NULL DEFAULT 'index'
        CHECK (sitemap_type IN ('index', 'urlset')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    last_fetched_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (site_id, url)
);

CREATE TABLE IF NOT EXISTS site_brand_terms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    term TEXT NOT NULL,
    normalized_term TEXT NOT NULL,
    brand_type TEXT NOT NULL
        CHECK (brand_type IN ('site', 'product')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (site_id, normalized_term, brand_type)
);

CREATE TABLE IF NOT EXISTS site_content_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL
        CHECK (content_type IN (
            'product', 'category', 'brand', 'article',
            'article_archive', 'page', 'other'
        )),
    match_type TEXT NOT NULL
        CHECK (match_type IN ('path_prefix', 'path_regex', 'sitemap_type')),
    pattern TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 100,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (site_id, content_type, match_type, pattern)
);

CREATE TABLE IF NOT EXISTS sync_runs (
    id TEXT PRIMARY KEY,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    data_date TEXT NOT NULL,
    search_type TEXT NOT NULL DEFAULT 'web',
    data_state TEXT NOT NULL DEFAULT 'final'
        CHECK (data_state IN ('final', 'all')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    requested_by TEXT NOT NULL DEFAULT 'cron'
        CHECK (requested_by IN ('cron', 'manual', 'backfill')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    total_rows INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (site_id, data_date, search_type)
);

CREATE TABLE IF NOT EXISTS sync_run_steps (
    run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
    dimension TEXT NOT NULL
        CHECK (dimension IN ('totals', 'query', 'page', 'query_page', 'device')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    next_start_row INTEGER NOT NULL DEFAULT 0,
    page_count INTEGER NOT NULL DEFAULT 0,
    row_count INTEGER NOT NULL DEFAULT 0,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (run_id, dimension)
);

CREATE TABLE IF NOT EXISTS daily_site_totals (
    sync_run_id TEXT PRIMARY KEY REFERENCES sync_runs(id) ON DELETE CASCADE,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    search_type TEXT NOT NULL DEFAULT 'web',
    clicks INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    ctr REAL NOT NULL DEFAULT 0,
    position REAL NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_query_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    search_type TEXT NOT NULL DEFAULT 'web',
    query TEXT NOT NULL,
    clicks INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    ctr REAL NOT NULL DEFAULT 0,
    position REAL NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (sync_run_id, query)
);

CREATE TABLE IF NOT EXISTS daily_page_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    search_type TEXT NOT NULL DEFAULT 'web',
    page TEXT NOT NULL,
    clicks INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    ctr REAL NOT NULL DEFAULT 0,
    position REAL NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (sync_run_id, page)
);

CREATE TABLE IF NOT EXISTS daily_query_page_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    search_type TEXT NOT NULL DEFAULT 'web',
    query TEXT NOT NULL,
    page TEXT NOT NULL,
    clicks INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    ctr REAL NOT NULL DEFAULT 0,
    position REAL NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (sync_run_id, query, page)
);

CREATE TABLE IF NOT EXISTS daily_device_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    search_type TEXT NOT NULL DEFAULT 'web',
    device TEXT NOT NULL,
    clicks INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    ctr REAL NOT NULL DEFAULT 0,
    position REAL NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (sync_run_id, device)
);

CREATE TABLE IF NOT EXISTS sitemap_urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    source_sitemap_id INTEGER REFERENCES site_sitemaps(id) ON DELETE SET NULL,
    url TEXT NOT NULL,
    sitemap_entry_type TEXT,
    inferred_content_type TEXT,
    last_modified TEXT,
    first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_present INTEGER NOT NULL DEFAULT 1 CHECK (is_present IN (0, 1)),
    UNIQUE (site_id, url)
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_site_date
    ON sync_runs(site_id, data_date DESC, status);
CREATE INDEX IF NOT EXISTS idx_sync_runs_completed
    ON sync_runs(site_id, status, data_date DESC);
CREATE INDEX IF NOT EXISTS idx_query_metrics_site_date
    ON daily_query_metrics(site_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_query_metrics_site_query_date
    ON daily_query_metrics(site_id, query, date DESC);
CREATE INDEX IF NOT EXISTS idx_page_metrics_site_date
    ON daily_page_metrics(site_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_page_metrics_site_page_date
    ON daily_page_metrics(site_id, page, date DESC);
CREATE INDEX IF NOT EXISTS idx_query_page_site_query_date
    ON daily_query_page_metrics(site_id, query, date DESC);
CREATE INDEX IF NOT EXISTS idx_query_page_site_page_date
    ON daily_query_page_metrics(site_id, page, date DESC);
CREATE INDEX IF NOT EXISTS idx_sitemap_urls_site_type
    ON sitemap_urls(site_id, inferred_content_type, is_present);
