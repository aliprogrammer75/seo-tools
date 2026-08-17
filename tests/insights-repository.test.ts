import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
} from "../lib/db/d1.ts";
import { InsightsRepository } from "../lib/insights/repository.ts";

class SqliteD1Statement implements D1PreparedStatement {
  private readonly database: DatabaseSync;
  private readonly sql: string;
  private readonly values: unknown[];

  constructor(
    database: DatabaseSync,
    sql: string,
    values: unknown[] = [],
  ) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values: unknown[]): D1PreparedStatement {
    return new SqliteD1Statement(this.database, this.sql, values);
  }

  async first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const statement = this.database.prepare(this.sql);
    const row = statement.get(...(this.values as SQLInputValue[])) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return (columnName ? row[columnName] : row) as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const statement = this.database.prepare(this.sql);
    return {
      success: true,
      results: statement.all(...(this.values as SQLInputValue[])) as T[],
    };
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    this.database.prepare(this.sql).run(...(this.values as SQLInputValue[]));
    return { success: true };
  }
}

class SqliteD1 implements D1Database {
  readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  prepare(query: string): D1PreparedStatement {
    return new SqliteD1Statement(this.database, query);
  }

  async batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    return Promise.all(statements.map((statement) => statement.run<T>()));
  }
}

function insertDailyRows(database: DatabaseSync, siteId: number): void {
  const dates = ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04"];
  for (const [index, date] of dates.entries()) {
    const runId = `run-${index + 1}`;
    database
      .prepare(
        `INSERT INTO sync_runs
           (id, site_id, data_date, search_type, status, requested_by)
         VALUES (?, ?, ?, 'web', 'completed', 'manual')`,
      )
      .run(runId, siteId, date);
    database
      .prepare(
        `INSERT INTO daily_site_totals
           (sync_run_id, site_id, date, search_type, clicks, impressions, ctr, position)
         VALUES (?, ?, ?, 'web', ?, ?, ?, ?)`,
      )
      .run(runId, siteId, date, 10 + index, 100 + index * 10, 0.1, 8 - index);
    database
      .prepare(
        `INSERT INTO daily_query_metrics
           (sync_run_id, site_id, date, search_type, query, clicks, impressions, ctr, position)
         VALUES (?, ?, ?, 'web', 'تشک طبی', ?, ?, ?, ?)`,
      )
      .run(runId, siteId, date, 5 + index, 50 + index * 10, 0.1, 10 - index);
    database
      .prepare(
        `INSERT INTO daily_page_metrics
           (sync_run_id, site_id, date, search_type, page, clicks, impressions, ctr, position)
         VALUES (?, ?, ?, 'web', 'https://digikhab.org/product/test/', ?, ?, ?, ?)`,
      )
      .run(runId, siteId, date, 5 + index, 50 + index * 10, 0.1, 10 - index);
    for (const [page, impressions] of [
      ["https://digikhab.org/product/test/", 35 + index],
      ["https://digikhab.org/test-guide/", 25 + index],
    ] as const) {
      database
        .prepare(
          `INSERT INTO daily_query_page_metrics
             (sync_run_id, site_id, date, search_type, query, page,
              clicks, impressions, ctr, position)
           VALUES (?, ?, ?, 'web', 'تشک طبی', ?, 2, ?, 0.05, ?)`,
        )
        .run(runId, siteId, date, page, impressions, page.includes("product") ? 8 : 9);
    }
  }
}

test("insights repository executes against the real SQLite schema", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec(
    readFileSync(new URL("../migrations/0001_multisite_foundation.sql", import.meta.url), "utf8"),
  );
  database.exec(readFileSync(new URL("../seeds/0001_digikhab.sql", import.meta.url), "utf8"));
  const site = database.prepare("SELECT id FROM sites WHERE slug = 'digikhab'").get() as {
    id: number;
  };
  insertDailyRows(database, site.id);
  database
    .prepare(
      `INSERT INTO sitemap_urls
         (site_id, url, inferred_content_type, first_seen_at, last_seen_at)
       VALUES (?, 'https://digikhab.org/product/test/', 'product', '2026-01-01', '2026-08-04')`,
    )
    .run(site.id);

  const repository = new InsightsRepository(new SqliteD1(database));
  const window = {
    siteId: site.id,
    searchType: "web",
    previousStart: "2026-08-01",
    previousEnd: "2026-08-02",
    currentStart: "2026-08-03",
    currentEnd: "2026-08-04",
  };

  assert.equal(await repository.latestCompletedDate(site.id, "web"), "2026-08-04");
  const queries = await repository.loadQueryMetrics(window);
  assert.equal(queries.length, 1);
  assert.equal(queries[0].current.clicks, 15);
  assert.equal(queries[0].bestPage, "https://digikhab.org/product/test/");

  const pages = await repository.loadPageMetrics(window);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].isInSitemap, true);
  assert.equal(pages[0].contentType, "product");

  const daily = await repository.loadDailyTotals(window);
  assert.equal(daily.length, 4);
  const cannibalization = await repository.loadCannibalizationRows(window);
  assert.equal(cannibalization.length, 0, "candidate is below the 200 impression threshold");
});
