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
    brandTerms: (brandTerms.results ?? []) as SiteBrandTermRecord[],
    contentRules: (contentRules.results ?? []) as SiteContentRuleRecord[],
    sitemaps: (sitemaps.results ?? []) as SiteSitemapRecord[],
  };
}
