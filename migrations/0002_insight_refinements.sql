PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS site_insight_settings (
    site_id INTEGER PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
    minimum_data_coverage REAL NOT NULL DEFAULT 0.90 CHECK (minimum_data_coverage BETWEEN 0 AND 1),
    decay_minimum_previous_clicks INTEGER NOT NULL DEFAULT 50,
    decay_minimum_lost_clicks INTEGER NOT NULL DEFAULT 10,
    decay_minimum_ratio REAL NOT NULL DEFAULT 0.20 CHECK (decay_minimum_ratio BETWEEN 0 AND 1),
    striking_minimum_position REAL NOT NULL DEFAULT 5,
    striking_maximum_position REAL NOT NULL DEFAULT 20,
    striking_minimum_impressions INTEGER NOT NULL DEFAULT 50,
    ctr_minimum_query_impressions INTEGER NOT NULL DEFAULT 100,
    ctr_minimum_benchmark_impressions INTEGER NOT NULL DEFAULT 1000,
    ctr_maximum_expected_ratio REAL NOT NULL DEFAULT 0.60 CHECK (ctr_maximum_expected_ratio BETWEEN 0 AND 1),
    ctr_minimum_missed_clicks INTEGER NOT NULL DEFAULT 5,
    cannibalization_minimum_query_impressions INTEGER NOT NULL DEFAULT 200,
    cannibalization_minimum_page_impressions INTEGER NOT NULL DEFAULT 30,
    cannibalization_minimum_page_share REAL NOT NULL DEFAULT 0.15 CHECK (cannibalization_minimum_page_share BETWEEN 0 AND 1),
    cannibalization_minimum_switch_rate REAL NOT NULL DEFAULT 0.20 CHECK (cannibalization_minimum_switch_rate BETWEEN 0 AND 1),
    low_performance_minimum_age_days INTEGER NOT NULL DEFAULT 90,
    low_performance_minimum_impressions INTEGER NOT NULL DEFAULT 200,
    low_performance_minimum_position REAL NOT NULL DEFAULT 15,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO site_insight_settings (site_id)
SELECT id FROM sites;

CREATE TRIGGER IF NOT EXISTS trg_sites_default_insight_settings
AFTER INSERT ON sites
BEGIN
    INSERT OR IGNORE INTO site_insight_settings (site_id) VALUES (NEW.id);
END;

CREATE TABLE IF NOT EXISTS site_topic_clusters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (site_id, label)
);

CREATE TABLE IF NOT EXISTS site_topic_cluster_terms (
    cluster_id INTEGER NOT NULL REFERENCES site_topic_clusters(id) ON DELETE CASCADE,
    term TEXT NOT NULL,
    normalized_term TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (cluster_id, normalized_term)
);

CREATE TABLE IF NOT EXISTS daily_query_device_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    search_type TEXT NOT NULL DEFAULT 'web',
    query TEXT NOT NULL,
    device TEXT NOT NULL CHECK (device IN ('DESKTOP', 'MOBILE', 'TABLET')),
    clicks INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    ctr REAL NOT NULL DEFAULT 0,
    position REAL NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (sync_run_id, query, device)
);

CREATE INDEX IF NOT EXISTS idx_query_device_site_date
    ON daily_query_device_metrics(site_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_query_device_site_query_date
    ON daily_query_device_metrics(site_id, query, device, date DESC);

CREATE TABLE sync_run_steps_v2 (
    run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
    dimension TEXT NOT NULL
        CHECK (dimension IN (
            'totals', 'query', 'page', 'query_page', 'device', 'query_device'
        )),
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

INSERT INTO sync_run_steps_v2 (
    run_id, dimension, status, next_start_row, page_count, row_count,
    attempt_count, started_at, completed_at, error_message, updated_at
)
SELECT
    run_id, dimension, status, next_start_row, page_count, row_count,
    attempt_count, started_at, completed_at, error_message, updated_at
FROM sync_run_steps;

INSERT OR IGNORE INTO sync_run_steps_v2 (run_id, dimension, status)
SELECT id, 'query_device', 'pending' FROM sync_runs;

DROP TABLE sync_run_steps;
ALTER TABLE sync_run_steps_v2 RENAME TO sync_run_steps;
