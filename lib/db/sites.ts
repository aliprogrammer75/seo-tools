import type { D1Database } from "./d1.ts";

export interface SiteRecord {
  id: number;
  slug: string;
  name: string;
  base_url: string;
  gsc_property_url: string;
  timezone: string;
  default_search_type: string;
  status: "active" | "paused" | "archived";
}

export interface SiteBrandTermRecord {
  term: string;
  normalized_term: string;
  brand_type: "site" | "product";
}

export interface SiteContentRuleRecord {
  content_type: string;
  match_type: "path_prefix" | "path_regex" | "sitemap_type";
  pattern: string;
  priority: number;
}

export interface SiteSitemapRecord {
  id: number;
  url: string;
  sitemap_type: "index" | "urlset";
}

export interface SiteConfiguration {
  site: SiteRecord;
  brandTerms: SiteBrandTermRecord[];
  contentRules: SiteContentRuleRecord[];
  sitemaps: SiteSitemapRecord[];
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid D1 row returned for ${context}`);
  }

  return value as Record<string, unknown>;
}

function requiredString(
  row: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Invalid ${key} returned for ${context}`);
  }
  return value;
}

function requiredNumber(
  row: Record<string, unknown>,
  key: string,
  context: string,
): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${key} returned for ${context}`);
  }
  return value;
}

function parseBrandTerm(value: unknown): SiteBrandTermRecord {
  const row = asRecord(value, "site brand term");
  const brandType = requiredString(row, "brand_type", "site brand term");

  if (brandType !== "site" && brandType !== "product") {
    throw new Error("Invalid brand_type returned for site brand term");
  }

  return {
    term: requiredString(row, "term", "site brand term"),
    normalized_term: requiredString(row, "normalized_term", "site brand term"),
    brand_type: brandType,
  };
}

function parseContentRule(value: unknown): SiteContentRuleRecord {
  const row = asRecord(value, "site content rule");
  const matchType = requiredString(row, "match_type", "site content rule");

  if (
    matchType !== "path_prefix" &&
    matchType !== "path_regex" &&
    matchType !== "sitemap_type"
  ) {
    throw new Error("Invalid match_type returned for site content rule");
  }

  return {
    content_type: requiredString(row, "content_type", "site content rule"),
    match_type: matchType,
    pattern: requiredString(row, "pattern", "site content rule"),
    priority: requiredNumber(row, "priority", "site content rule"),
  };
}

function parseSitemap(value: unknown): SiteSitemapRecord {
  const row = asRecord(value, "site sitemap");
  const sitemapType = requiredString(row, "sitemap_type", "site sitemap");

  if (sitemapType !== "index" && sitemapType !== "urlset") {
    throw new Error("Invalid sitemap_type returned for site sitemap");
  }

  return {
    id: requiredNumber(row, "id", "site sitemap"),
    url: requiredString(row, "url", "site sitemap"),
    sitemap_type: sitemapType,
  };
}

export async function listActiveSites(db: D1Database): Promise<SiteRecord[]> {
  const result = await db
    .prepare(
      `SELECT id, slug, name, base_url, gsc_property_url, timezone,
              default_search_type, status
       FROM sites
       WHERE status = ?
       ORDER BY name ASC`,
    )
    .bind("active")
    .all<SiteRecord>();

  if (!result.success) throw new Error(result.error ?? "Could not list active sites");
  return result.results ?? [];
}

export async function getSiteConfiguration(
  db: D1Database,
  slug: string,
): Promise<SiteConfiguration | null> {
  const site = await db
    .prepare(
      `SELECT id, slug, name, base_url, gsc_property_url, timezone,
              default_search_type, status
       FROM sites
       WHERE slug = ?
       LIMIT 1`,
    )
    .bind(slug)
    .first<SiteRecord>();

  if (!site) return null;

  const [brandTerms, contentRules, sitemaps] = await db.batch([
    db
      .prepare(
        `SELECT term, normalized_term, brand_type
         FROM site_brand_terms
         WHERE site_id = ? AND is_active = 1
         ORDER BY brand_type, normalized_term`,
      )
      .bind(site.id),
    db
      .prepare(
        `SELECT content_type, match_type, pattern, priority
         FROM site_content_rules
         WHERE site_id = ? AND is_active = 1
         ORDER BY priority ASC`,
      )
      .bind(site.id),
    db
      .prepare(
        `SELECT id, url, sitemap_type
         FROM site_sitemaps
         WHERE site_id = ? AND is_active = 1
         ORDER BY id ASC`,
      )
      .bind(site.id),
  ]);

  if (!brandTerms.success || !contentRules.success || !sitemaps.success) {
    throw new Error("Could not load complete site configuration");
  }

  return {
    site,
    brandTerms: (brandTerms.results ?? []).map(parseBrandTerm),
    contentRules: (contentRules.results ?? []).map(parseContentRule),
    sitemaps: (sitemaps.results ?? []).map(parseSitemap),
  };
}
