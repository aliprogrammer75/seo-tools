import type { D1Database } from "./d1.ts";
import type { SearchAnalyticsType } from "../search-console/pagination.ts";
import {
  DEFAULT_INSIGHT_SETTINGS,
  type SiteInsightSettings,
} from "../insights/settings.ts";
import type { TopicClusterSeed } from "../insights/types.ts";

export interface SiteRecord {
  id: number;
  slug: string;
  name: string;
  base_url: string;
  gsc_property_url: string;
  timezone: string;
  default_search_type: SearchAnalyticsType;
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
  insightSettings: SiteInsightSettings;
  topicClusters: TopicClusterSeed[];
}

interface TopicClusterRow {
  id: number;
  label: string;
  term: string;
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

function numericSetting(
  row: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseInsightSettings(value: unknown): SiteInsightSettings {
  if (!value) return { ...DEFAULT_INSIGHT_SETTINGS };
  const row = asRecord(value, "site insight settings");
  return {
    minimumDataCoverage: numericSetting(
      row,
      "minimum_data_coverage",
      DEFAULT_INSIGHT_SETTINGS.minimumDataCoverage,
    ),
    decayMinimumPreviousClicks: numericSetting(
      row,
      "decay_minimum_previous_clicks",
      DEFAULT_INSIGHT_SETTINGS.decayMinimumPreviousClicks,
    ),
    decayMinimumLostClicks: numericSetting(
      row,
      "decay_minimum_lost_clicks",
      DEFAULT_INSIGHT_SETTINGS.decayMinimumLostClicks,
    ),
    decayMinimumRatio: numericSetting(
      row,
      "decay_minimum_ratio",
      DEFAULT_INSIGHT_SETTINGS.decayMinimumRatio,
    ),
    strikingMinimumPosition: numericSetting(
      row,
      "striking_minimum_position",
      DEFAULT_INSIGHT_SETTINGS.strikingMinimumPosition,
    ),
    strikingMaximumPosition: numericSetting(
      row,
      "striking_maximum_position",
      DEFAULT_INSIGHT_SETTINGS.strikingMaximumPosition,
    ),
    strikingMinimumImpressions: numericSetting(
      row,
      "striking_minimum_impressions",
      DEFAULT_INSIGHT_SETTINGS.strikingMinimumImpressions,
    ),
    ctrMinimumQueryImpressions: numericSetting(
      row,
      "ctr_minimum_query_impressions",
      DEFAULT_INSIGHT_SETTINGS.ctrMinimumQueryImpressions,
    ),
    ctrMinimumBenchmarkImpressions: numericSetting(
      row,
      "ctr_minimum_benchmark_impressions",
      DEFAULT_INSIGHT_SETTINGS.ctrMinimumBenchmarkImpressions,
    ),
    ctrMaximumExpectedRatio: numericSetting(
      row,
      "ctr_maximum_expected_ratio",
      DEFAULT_INSIGHT_SETTINGS.ctrMaximumExpectedRatio,
    ),
    ctrMinimumMissedClicks: numericSetting(
      row,
      "ctr_minimum_missed_clicks",
      DEFAULT_INSIGHT_SETTINGS.ctrMinimumMissedClicks,
    ),
    cannibalizationMinimumQueryImpressions: numericSetting(
      row,
      "cannibalization_minimum_query_impressions",
      DEFAULT_INSIGHT_SETTINGS.cannibalizationMinimumQueryImpressions,
    ),
    cannibalizationMinimumPageImpressions: numericSetting(
      row,
      "cannibalization_minimum_page_impressions",
      DEFAULT_INSIGHT_SETTINGS.cannibalizationMinimumPageImpressions,
    ),
    cannibalizationMinimumPageShare: numericSetting(
      row,
      "cannibalization_minimum_page_share",
      DEFAULT_INSIGHT_SETTINGS.cannibalizationMinimumPageShare,
    ),
    cannibalizationMinimumSwitchRate: numericSetting(
      row,
      "cannibalization_minimum_switch_rate",
      DEFAULT_INSIGHT_SETTINGS.cannibalizationMinimumSwitchRate,
    ),
    lowPerformanceMinimumAgeDays: numericSetting(
      row,
      "low_performance_minimum_age_days",
      DEFAULT_INSIGHT_SETTINGS.lowPerformanceMinimumAgeDays,
    ),
    lowPerformanceMinimumImpressions: numericSetting(
      row,
      "low_performance_minimum_impressions",
      DEFAULT_INSIGHT_SETTINGS.lowPerformanceMinimumImpressions,
    ),
    lowPerformanceMinimumPosition: numericSetting(
      row,
      "low_performance_minimum_position",
      DEFAULT_INSIGHT_SETTINGS.lowPerformanceMinimumPosition,
    ),
  };
}

function parseTopicClusters(values: unknown[]): TopicClusterSeed[] {
  const clusters = new Map<number, TopicClusterSeed>();
  for (const value of values) {
    const row = asRecord(value, "site topic cluster");
    const id = requiredNumber(row, "id", "site topic cluster");
    const cluster = clusters.get(id) ?? {
      id,
      label: requiredString(row, "label", "site topic cluster"),
      terms: [],
    };
    cluster.terms.push(requiredString(row, "term", "site topic cluster"));
    clusters.set(id, cluster);
  }
  return [...clusters.values()];
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

function parseSite(value: unknown): SiteRecord {
  const row = asRecord(value, "site");
  const searchType = requiredString(row, "default_search_type", "site");
  const status = requiredString(row, "status", "site");
  const allowedSearchTypes: SearchAnalyticsType[] = [
    "web",
    "image",
    "video",
    "news",
    "discover",
    "googleNews",
  ];

  if (!allowedSearchTypes.includes(searchType as SearchAnalyticsType)) {
    throw new Error("Invalid default_search_type returned for site");
  }
  if (status !== "active" && status !== "paused" && status !== "archived") {
    throw new Error("Invalid status returned for site");
  }

  return {
    id: requiredNumber(row, "id", "site"),
    slug: requiredString(row, "slug", "site"),
    name: requiredString(row, "name", "site"),
    base_url: requiredString(row, "base_url", "site"),
    gsc_property_url: requiredString(row, "gsc_property_url", "site"),
    timezone: requiredString(row, "timezone", "site"),
    default_search_type: searchType as SearchAnalyticsType,
    status,
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
  return (result.results ?? []).map(parseSite);
}

export async function getSiteConfiguration(
  db: D1Database,
  slug: string,
): Promise<SiteConfiguration | null> {
  const siteRow = await db
    .prepare(
      `SELECT id, slug, name, base_url, gsc_property_url, timezone,
              default_search_type, status
       FROM sites
       WHERE slug = ?
       LIMIT 1`,
    )
    .bind(slug)
    .first<SiteRecord>();

  if (!siteRow) return null;
  const site = parseSite(siteRow);

  const [brandTerms, contentRules, sitemaps, insightSettings, topicClusters] =
    await db.batch([
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
    db
      .prepare(
        `SELECT *
         FROM site_insight_settings
         WHERE site_id = ?
         LIMIT 1`,
      )
      .bind(site.id),
    db
      .prepare(
        `SELECT c.id, c.label, t.term
         FROM site_topic_clusters c
         JOIN site_topic_cluster_terms t ON t.cluster_id = c.id
         WHERE c.site_id = ? AND c.is_active = 1
         ORDER BY c.id ASC, t.normalized_term ASC`,
      )
      .bind(site.id),
  ]);

  if (
    !brandTerms.success ||
    !contentRules.success ||
    !sitemaps.success ||
    !insightSettings.success ||
    !topicClusters.success
  ) {
    throw new Error("Could not load complete site configuration");
  }

  return {
    site,
    brandTerms: (brandTerms.results ?? []).map(parseBrandTerm),
    contentRules: (contentRules.results ?? []).map(parseContentRule),
    sitemaps: (sitemaps.results ?? []).map(parseSitemap),
    insightSettings: parseInsightSettings(insightSettings.results?.[0]),
    topicClusters: parseTopicClusters(topicClusters.results ?? []),
  };
}
