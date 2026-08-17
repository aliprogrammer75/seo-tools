import type { D1Database, D1Result } from "../db/d1.ts";
import type {
  PageMetric,
  MonthlyPageMetric,
  QueryDeviceMetric,
  QueryMetric,
  QueryPageDailyMetric,
  SearchDevice,
} from "./types.ts";
import { finiteMetric } from "./metrics.ts";

interface PeriodRow {
  key: string;
  current_clicks: number;
  current_impressions: number;
  current_position: number;
  previous_clicks: number;
  previous_impressions: number;
  previous_position: number;
  is_in_sitemap?: number | null;
  age_days?: number | null;
  content_type?: PageMetric["contentType"] | null;
}

interface QueryPageRow {
  date: string;
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number;
}

interface BestPageRow {
  query: string;
  page: string;
}

interface QueryDeviceRow extends PeriodRow {
  device: string;
}

interface MonthlyPageRow {
  page: string;
  month: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface DailyTotal {
  date: string;
  clicks: number;
  impressions: number;
  position: number;
}

function assertResult<T>(result: D1Result<T>, context: string): T[] {
  if (!result.success) throw new Error(result.error ?? `D1 failed while ${context}`);
  return result.results ?? [];
}

function mapPeriodRow(row: PeriodRow): QueryMetric {
  return {
    key: row.key,
    current: {
      clicks: finiteMetric(row.current_clicks),
      impressions: finiteMetric(row.current_impressions),
      position: finiteMetric(row.current_position),
    },
    previous: {
      clicks: finiteMetric(row.previous_clicks),
      impressions: finiteMetric(row.previous_impressions),
      position: finiteMetric(row.previous_position),
    },
  };
}

function normalizeDevice(value: string): SearchDevice {
  return value === "DESKTOP" || value === "MOBILE" || value === "TABLET"
    ? value
    : "UNKNOWN";
}

export class InsightsRepository {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async latestCompletedDate(siteId: number, searchType: string): Promise<string | null> {
    return this.db
      .prepare(
        `SELECT MAX(data_date) AS max_date
         FROM sync_runs
         WHERE site_id = ? AND search_type = ? AND status = 'completed'`,
      )
      .bind(siteId, searchType)
      .first<string>("max_date");
  }

  async completedDateCoverage(input: {
    siteId: number;
    searchType: string;
    startDate: string;
    endDate: string;
    expectedDays: number;
  }): Promise<number> {
    if (input.expectedDays <= 0) return 0;
    const count = await this.db
      .prepare(
        `SELECT COUNT(DISTINCT data_date) AS completed_days
         FROM sync_runs
         WHERE site_id = ? AND search_type = ? AND status = 'completed'
           AND data_date BETWEEN ? AND ?`,
      )
      .bind(input.siteId, input.searchType, input.startDate, input.endDate)
      .first<number>("completed_days");
    return Math.min(1, finiteMetric(count) / input.expectedDays);
  }

  async loadQueryMetrics(input: DateWindowInput): Promise<QueryMetric[]> {
    const result = await this.db
      .prepare(periodMetricSql("daily_query_metrics", "query"))
      .bind(...dateWindowBindings(input))
      .all<PeriodRow>();
    const rows = assertResult(result, "loading query metrics").map(mapPeriodRow);
    const bestPages = await this.loadBestPages(input);
    return rows.map((row) => ({ ...row, bestPage: bestPages.get(row.key) }));
  }

  async loadQueryDeviceMetrics(input: {
    siteId: number;
    searchType: string;
    startDate: string;
    endDate: string;
  }): Promise<QueryDeviceMetric[]> {
    const result = await this.db
      .prepare(
        `SELECT
           m.query AS key,
           m.device,
           SUM(m.clicks) AS current_clicks,
           SUM(m.impressions) AS current_impressions,
           COALESCE(SUM(m.position * m.impressions) / NULLIF(SUM(m.impressions), 0), 0)
             AS current_position,
           0 AS previous_clicks,
           0 AS previous_impressions,
           0 AS previous_position
         FROM daily_query_device_metrics m
         JOIN sync_runs r ON r.id = m.sync_run_id AND r.status = 'completed'
         JOIN sync_run_steps s
           ON s.run_id = m.sync_run_id
          AND s.dimension = 'query_device'
          AND s.status = 'completed'
         WHERE m.site_id = ? AND m.search_type = ? AND m.date BETWEEN ? AND ?
         GROUP BY m.query, m.device
         HAVING current_impressions > 0
         ORDER BY current_impressions DESC
         LIMIT 30000`,
      )
      .bind(input.siteId, input.searchType, input.startDate, input.endDate)
      .all<QueryDeviceRow>();
    return assertResult(result, "loading query/device metrics").map((row) => ({
      ...mapPeriodRow(row),
      device: normalizeDevice(row.device),
    }));
  }

  async loadMonthlyPageMetrics(input: {
    siteId: number;
    searchType: string;
    startDate: string;
    endDate: string;
  }): Promise<MonthlyPageMetric[]> {
    const result = await this.db
      .prepare(
        `WITH top_pages AS (
           SELECT m.page
           FROM daily_page_metrics m
           JOIN sync_runs r ON r.id = m.sync_run_id AND r.status = 'completed'
           WHERE m.site_id = ? AND m.search_type = ? AND m.date BETWEEN ? AND ?
           GROUP BY m.page
           HAVING SUM(m.clicks) >= 20
           ORDER BY SUM(m.clicks) DESC
           LIMIT 5000
         )
         SELECT
           m.page,
           SUBSTR(m.date, 1, 7) AS month,
           SUM(m.clicks) AS clicks,
           SUM(m.impressions) AS impressions,
           COALESCE(SUM(m.position * m.impressions) / NULLIF(SUM(m.impressions), 0), 0)
             AS position
         FROM daily_page_metrics m
         JOIN sync_runs r ON r.id = m.sync_run_id AND r.status = 'completed'
         JOIN top_pages p ON p.page = m.page
         WHERE m.site_id = ? AND m.search_type = ? AND m.date BETWEEN ? AND ?
         GROUP BY m.page, SUBSTR(m.date, 1, 7)
         ORDER BY m.page, month`,
      )
      .bind(
        input.siteId,
        input.searchType,
        input.startDate,
        input.endDate,
        input.siteId,
        input.searchType,
        input.startDate,
        input.endDate,
      )
      .all<MonthlyPageRow>();
    return assertResult(result, "loading monthly page metrics").map((row) => ({
      page: row.page,
      month: row.month,
      clicks: finiteMetric(row.clicks),
      impressions: finiteMetric(row.impressions),
      position: finiteMetric(row.position),
    }));
  }

  async loadPageMetrics(input: DateWindowInput): Promise<PageMetric[]> {
    const result = await this.db
      .prepare(
        `WITH candidate_pages AS (
           SELECT DISTINCT m.page
           FROM daily_page_metrics m
           JOIN sync_runs r ON r.id = m.sync_run_id AND r.status = 'completed'
           WHERE m.site_id = ? AND m.search_type = ? AND m.date BETWEEN ? AND ?
           UNION
           SELECT su.url
           FROM sitemap_urls su
           WHERE su.site_id = ? AND su.is_present = 1
         )
         SELECT
           p.page AS key,
           SUM(CASE WHEN m.date BETWEEN ? AND ? THEN m.clicks ELSE 0 END) AS current_clicks,
           SUM(CASE WHEN m.date BETWEEN ? AND ? THEN m.impressions ELSE 0 END) AS current_impressions,
           COALESCE(
             SUM(CASE WHEN m.date BETWEEN ? AND ? THEN m.position * m.impressions ELSE 0 END) /
             NULLIF(SUM(CASE WHEN m.date BETWEEN ? AND ? THEN m.impressions ELSE 0 END), 0), 0
           ) AS current_position,
           SUM(CASE WHEN m.date BETWEEN ? AND ? THEN m.clicks ELSE 0 END) AS previous_clicks,
           SUM(CASE WHEN m.date BETWEEN ? AND ? THEN m.impressions ELSE 0 END) AS previous_impressions,
           COALESCE(
             SUM(CASE WHEN m.date BETWEEN ? AND ? THEN m.position * m.impressions ELSE 0 END) /
             NULLIF(SUM(CASE WHEN m.date BETWEEN ? AND ? THEN m.impressions ELSE 0 END), 0), 0
           ) AS previous_position,
           MAX(CASE WHEN su.is_present = 1 THEN 1 ELSE 0 END) AS is_in_sitemap,
           CAST(julianday(?) - julianday(MIN(su.first_seen_at)) AS INTEGER) AS age_days,
           MAX(su.inferred_content_type) AS content_type
         FROM candidate_pages p
         LEFT JOIN daily_page_metrics m
           ON m.site_id = ? AND m.search_type = ? AND m.page = p.page
          AND m.date BETWEEN ? AND ?
         LEFT JOIN sync_runs r ON r.id = m.sync_run_id AND r.status = 'completed'
         LEFT JOIN sitemap_urls su ON su.site_id = ? AND su.url = p.page
         WHERE m.id IS NULL OR r.id IS NOT NULL
         GROUP BY p.page
         HAVING current_impressions > 0 OR previous_impressions > 0 OR is_in_sitemap = 1
         ORDER BY current_clicks + previous_clicks DESC
         LIMIT 10000`,
      )
      .bind(
        input.siteId,
        input.searchType,
        input.previousStart,
        input.currentEnd,
        input.siteId,
        input.currentStart,
        input.currentEnd,
        input.currentStart,
        input.currentEnd,
        input.currentStart,
        input.currentEnd,
        input.currentStart,
        input.currentEnd,
        input.previousStart,
        input.previousEnd,
        input.previousStart,
        input.previousEnd,
        input.previousStart,
        input.previousEnd,
        input.previousStart,
        input.previousEnd,
        input.currentEnd,
        input.siteId,
        input.searchType,
        input.previousStart,
        input.currentEnd,
        input.siteId,
      )
      .all<PeriodRow>();

    return assertResult(result, "loading page metrics").map((row) => ({
      ...mapPeriodRow(row),
      isInSitemap: row.is_in_sitemap === null ? undefined : row.is_in_sitemap === 1,
      ageDays: row.age_days === null ? undefined : finiteMetric(row.age_days),
      contentType: row.content_type ?? undefined,
    }));
  }

  async loadCalibrationQueries(input: {
    siteId: number;
    searchType: string;
    startDate: string;
    endDate: string;
  }): Promise<QueryMetric[]> {
    const result = await this.db
      .prepare(
        `SELECT
           m.query AS key,
           SUM(m.clicks) AS current_clicks,
           SUM(m.impressions) AS current_impressions,
           COALESCE(SUM(m.position * m.impressions) / NULLIF(SUM(m.impressions), 0), 0)
             AS current_position,
           0 AS previous_clicks, 0 AS previous_impressions, 0 AS previous_position
         FROM daily_query_metrics m
         JOIN sync_runs r ON r.id = m.sync_run_id AND r.status = 'completed'
         WHERE m.site_id = ? AND m.search_type = ? AND m.date BETWEEN ? AND ?
         GROUP BY m.query
         HAVING current_impressions > 0
         ORDER BY current_impressions DESC
         LIMIT 10000`,
      )
      .bind(input.siteId, input.searchType, input.startDate, input.endDate)
      .all<PeriodRow>();
    return assertResult(result, "loading CTR calibration queries").map(mapPeriodRow);
  }

  async loadCannibalizationRows(input: DateWindowInput): Promise<QueryPageDailyMetric[]> {
    const result = await this.db
      .prepare(
        `WITH candidate_queries AS (
           SELECT m.query
           FROM daily_query_page_metrics m
           JOIN sync_runs r ON r.id = m.sync_run_id AND r.status = 'completed'
           WHERE m.site_id = ? AND m.search_type = ? AND m.date BETWEEN ? AND ?
           GROUP BY m.query
           HAVING SUM(m.impressions) >= 200 AND COUNT(DISTINCT m.page) >= 2
           ORDER BY SUM(m.impressions) DESC
           LIMIT 500
         )
         SELECT m.date, m.query, m.page, m.clicks, m.impressions, m.position
         FROM daily_query_page_metrics m
         JOIN sync_runs r ON r.id = m.sync_run_id AND r.status = 'completed'
         JOIN candidate_queries c ON c.query = m.query
         WHERE m.site_id = ? AND m.search_type = ? AND m.date BETWEEN ? AND ?
         ORDER BY m.query, m.date, m.impressions DESC`,
      )
      .bind(
        input.siteId,
        input.searchType,
        input.currentStart,
        input.currentEnd,
        input.siteId,
        input.searchType,
        input.currentStart,
        input.currentEnd,
      )
      .all<QueryPageRow>();
    return assertResult(result, "loading cannibalization candidates").map((row) => ({
      date: row.date,
      query: row.query,
      page: row.page,
      clicks: finiteMetric(row.clicks),
      impressions: finiteMetric(row.impressions),
      position: finiteMetric(row.position),
    }));
  }

  async loadDailyTotals(input: DateWindowInput): Promise<DailyTotal[]> {
    const result = await this.db
      .prepare(
        `SELECT m.date, SUM(m.clicks) AS clicks, SUM(m.impressions) AS impressions,
                COALESCE(SUM(m.position * m.impressions) / NULLIF(SUM(m.impressions), 0), 0)
                  AS position
         FROM daily_site_totals m
         JOIN sync_runs r ON r.id = m.sync_run_id AND r.status = 'completed'
         WHERE m.site_id = ? AND m.search_type = ? AND m.date BETWEEN ? AND ?
         GROUP BY m.date
         ORDER BY m.date ASC`,
      )
      .bind(input.siteId, input.searchType, input.previousStart, input.currentEnd)
      .all<DailyTotal>();
    return assertResult(result, "loading daily totals").map((row) => ({
      date: row.date,
      clicks: finiteMetric(row.clicks),
      impressions: finiteMetric(row.impressions),
      position: finiteMetric(row.position),
    }));
  }

  private async loadBestPages(input: DateWindowInput): Promise<Map<string, string>> {
    const result = await this.db
      .prepare(
        `WITH ranked AS (
           SELECT m.query, m.page, SUM(m.impressions) AS impressions,
                  ROW_NUMBER() OVER (
                    PARTITION BY m.query
                    ORDER BY SUM(m.impressions) DESC, SUM(m.clicks) DESC, m.page ASC
                  ) AS row_number
           FROM daily_query_page_metrics m
           JOIN sync_runs r ON r.id = m.sync_run_id AND r.status = 'completed'
           WHERE m.site_id = ? AND m.search_type = ? AND m.date BETWEEN ? AND ?
           GROUP BY m.query, m.page
         )
         SELECT query, page FROM ranked WHERE row_number = 1`,
      )
      .bind(input.siteId, input.searchType, input.currentStart, input.currentEnd)
      .all<BestPageRow>();
    return new Map(
      assertResult(result, "mapping queries to best pages").map((row) => [row.query, row.page]),
    );
  }
}

export interface DateWindowInput {
  siteId: number;
  searchType: string;
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
}

function dateWindowBindings(input: DateWindowInput): unknown[] {
  return [
    input.currentStart,
    input.currentEnd,
    input.currentStart,
    input.currentEnd,
    input.currentStart,
    input.currentEnd,
    input.currentStart,
    input.currentEnd,
    input.previousStart,
    input.previousEnd,
    input.previousStart,
    input.previousEnd,
    input.previousStart,
    input.previousEnd,
    input.previousStart,
    input.previousEnd,
    input.siteId,
    input.searchType,
    input.previousStart,
    input.currentEnd,
  ];
}

function periodMetricSql(table: string, key: string): string {
  return `SELECT
     m.${key} AS key,
     SUM(CASE WHEN m.date BETWEEN ? AND ? THEN m.clicks ELSE 0 END) AS current_clicks,
     SUM(CASE WHEN m.date BETWEEN ? AND ? THEN m.impressions ELSE 0 END) AS current_impressions,
     COALESCE(
       SUM(CASE WHEN m.date BETWEEN ? AND ? THEN m.position * m.impressions ELSE 0 END) /
       NULLIF(SUM(CASE WHEN m.date BETWEEN ? AND ? THEN m.impressions ELSE 0 END), 0), 0
     ) AS current_position,
     SUM(CASE WHEN m.date BETWEEN ? AND ? THEN m.clicks ELSE 0 END) AS previous_clicks,
     SUM(CASE WHEN m.date BETWEEN ? AND ? THEN m.impressions ELSE 0 END) AS previous_impressions,
     COALESCE(
       SUM(CASE WHEN m.date BETWEEN ? AND ? THEN m.position * m.impressions ELSE 0 END) /
       NULLIF(SUM(CASE WHEN m.date BETWEEN ? AND ? THEN m.impressions ELSE 0 END), 0), 0
     ) AS previous_position
   FROM ${table} m
   JOIN sync_runs r ON r.id = m.sync_run_id AND r.status = 'completed'
   WHERE m.site_id = ? AND m.search_type = ? AND m.date BETWEEN ? AND ?
   GROUP BY m.${key}
   HAVING current_impressions > 0 OR previous_impressions > 0
   ORDER BY current_clicks + previous_clicks DESC
   LIMIT 10000`;
}
