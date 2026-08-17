PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO sites (
    slug,
    name,
    base_url,
    gsc_property_url,
    timezone,
    default_search_type
) VALUES (
    'digikhab',
    'دیجی خواب',
    'https://digikhab.org/',
    'https://digikhab.org/',
    'Asia/Tehran',
    'web'
);

INSERT OR IGNORE INTO site_sitemaps (site_id, url, sitemap_type)
SELECT id, 'https://digikhab.org/sitemap_index.xml', 'index'
FROM sites
WHERE slug = 'digikhab';

INSERT OR IGNORE INTO site_brand_terms (site_id, term, normalized_term, brand_type)
SELECT id, 'دیجی خواب', 'دیجی خواب', 'site' FROM sites WHERE slug = 'digikhab';
INSERT OR IGNORE INTO site_brand_terms (site_id, term, normalized_term, brand_type)
SELECT id, 'دیجی‌خواب', 'دیجی خواب', 'site' FROM sites WHERE slug = 'digikhab';
INSERT OR IGNORE INTO site_brand_terms (site_id, term, normalized_term, brand_type)
SELECT id, 'digikhab', 'digikhab', 'site' FROM sites WHERE slug = 'digikhab';
INSERT OR IGNORE INTO site_brand_terms (site_id, term, normalized_term, brand_type)
SELECT id, 'digi khab', 'digi khab', 'site' FROM sites WHERE slug = 'digikhab';
INSERT OR IGNORE INTO site_brand_terms (site_id, term, normalized_term, brand_type)
SELECT id, 'digikhab.org', 'digikhab.org', 'site' FROM sites WHERE slug = 'digikhab';
INSERT OR IGNORE INTO site_brand_terms (site_id, term, normalized_term, brand_type)
SELECT id, 'مبلیران', 'مبلیران', 'product' FROM sites WHERE slug = 'digikhab';
INSERT OR IGNORE INTO site_brand_terms (site_id, term, normalized_term, brand_type)
SELECT id, 'هوفر', 'هوفر', 'product' FROM sites WHERE slug = 'digikhab';

INSERT OR IGNORE INTO site_content_rules (
    site_id, content_type, match_type, pattern, priority
)
SELECT id, 'product', 'path_prefix', '/product/', 10
FROM sites WHERE slug = 'digikhab';

INSERT OR IGNORE INTO site_content_rules (
    site_id, content_type, match_type, pattern, priority
)
SELECT id, 'category', 'path_prefix', '/product-category/', 20
FROM sites WHERE slug = 'digikhab';

INSERT OR IGNORE INTO site_content_rules (
    site_id, content_type, match_type, pattern, priority
)
SELECT id, 'brand', 'path_prefix', '/برند/', 30
FROM sites WHERE slug = 'digikhab';

INSERT OR IGNORE INTO site_content_rules (
    site_id, content_type, match_type, pattern, priority
)
SELECT id, 'article', 'sitemap_type', 'post', 40
FROM sites WHERE slug = 'digikhab';

INSERT OR IGNORE INTO site_content_rules (
    site_id, content_type, match_type, pattern, priority
)
SELECT id, 'article_archive', 'path_prefix', '/blogs/', 50
FROM sites WHERE slug = 'digikhab';
