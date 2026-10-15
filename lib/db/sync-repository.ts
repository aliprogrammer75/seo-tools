import type { D1Database, D1PreparedStatement, D1Result } from "./d1.ts";
import type {
  BeginRunInput,
  NormalizedMetricRow,
  SyncDimension,
  SyncRepository,
  SyncRun,
  SyncStepState,
} from "../sync/types.ts";

interface RunRow {
  id: string;
  site_id: number;
  data_date: string;
  search_type: string;
  status: SyncRun["status"];
}

interface StepRow {
  dimension: SyncDimension;
  status: SyncStepState["status"];
  next_start_row: number;
  page_count: number;
  row_count: number;
}

const DIMENSIONS: SyncDimension[] = [
  "totals",
  "query",
  "page",
  "device",
  "query_device",
  "query_page",
];
const MAX_BATCH_STATEMENTS = 100;

function metricTable(dimension: SyncDimension): string {
  const tables: Record<SyncDimension, string> = {
    totals: "daily_site_totals",
    query: "daily_query_metrics",
    page: "daily_page_metrics",
    device: "daily_device_metrics",
    query_device: "daily_query_device_metrics",
    query_page: "daily_query_page_metrics",
  };
  return tables[dimension];
}

function assertResult(result: D1Result<unknown>, context: string): void {
  if (!result.success) throw new Error(result.error ?? `D1 failed while ${context}`);
}

function metricStatement(
  db: D1Database,
  run: SyncRun,
  dimension: SyncDimension,
  row: NormalizedMetricRow,
): D1PreparedStatement {
  const common = [
    run.id,
    run.siteId,
    run.date,
    run.searchType,
  ];
  const metrics = [row.clicks, row.impressions, row.ctr, row.position];

  if (dimension === "totals") {
    return db
      .prepare(
        `INSERT INTO daily_site_totals
           (sync_run_id, site_id, date, search_type, clicks, impressions, ctr, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(sync_run_id) DO UPDATE SET
           clicks = excluded.clicks,
           impressions = excluded.impressions,
           ctr = excluded.ctr,
           position = excluded.position,
           imported_at = CURRENT_TIMESTAMP`,
      )
      .bind(...common, ...metrics);
  }

  if (dimension === "query") {
    return db
      .prepare(
        `INSERT INTO daily_query_metrics
           (sync_run_id, site_id, date, search_type, query, clicks, impressions, ctr, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(sync_run_id, query) DO UPDATE SET
           clicks = excluded.clicks,
           impressions = excluded.impressions,
           ctr = excluded.ctr,
           position = excluded.position,
           imported_at = CURRENT_TIMESTAMP`,
      )
      .bind(...common, row.keys[0], ...metrics);
  }

  if (dimension === "page") {
    return db
      .prepare(
        `INSERT INTO daily_page_metrics
           (sync_run_id, site_id, date, search_type, page, clicks, impressions, ctr, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(sync_run_id, page) DO UPDATE SET
           clicks = excluded.clicks,
           impressions = excluded.impressions,
           ctr = excluded.ctr,
           position = excluded.position,
           imported_at = CURRENT_TIMESTAMP`,
      )
      .bind(...common, row.keys[0], ...metrics);
  }

  if (dimension === "device") {
    return db
      .prepare(
        `INSERT INTO daily_device_metrics
           (sync_run_id, site_id, date, search_type, device, clicks, impressions, ctr, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(sync_run_id, device) DO UPDATE SET
           clicks = excluded.clicks,
           impressions = excluded.impressions,
           ctr = excluded.ctr,
           position = excluded.position,
           imported_at = CURRENT_TIMESTAMP`,
      )
      .bind(...common, row.keys[0], ...metrics);
  }

  if (dimension === "query_device") {
    return db
      .prepare(
        `INSERT INTO daily_query_device_metrics
           (sync_run_id, site_id, date, search_type, query, device,
            clicks, impressions, ctr, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(sync_run_id, query, device) DO UPDATE SET
           clicks = excluded.clicks,
           impressions = excluded.impressions,
           ctr = excluded.ctr,
           position = excluded.position,
           imported_at = CURRENT_TIMESTAMP`,
      )
      .bind(...common, row.keys[0], row.keys[1], ...metrics);
  }

  return db
    .prepare(
      `INSERT INTO daily_query_page_metrics
         (sync_run_id, site_id, date, search_type, query, page,
          clicks, impressions, ctr, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(sync_run_id, query, page) DO UPDATE SET
         clicks = excluded.clicks,
         impressions = excluded.impressions,
         ctr = excluded.ctr,
         position = excluded.position,
         imported_at = CURRENT_TIMESTAMP`,
    )
    .bind(...common, row.keys[0], row.keys[1], ...metrics);
}

export class D1SyncRepository implements SyncRepository {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async beginRun(input: BeginRunInput): Promise<SyncRun> {
    const proposedId = crypto.randomUUID();
    const row = await this.db
      .prepare(
        `INSERT INTO sync_runs
           (id, site_id, data_date, search_type, status, requested_by,
            attempt_count, started_at, updated_at)
         VALUES (?, ?, ?, ?, 'running', ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(site_id, data_date, search_type) DO UPDATE SET
           status = CASE
             WHEN sync_runs.status = 'completed' THEN 'completed'
             ELSE 'running'
           END,
           requested_by = excluded.requested_by,
           attempt_count = CASE
             WHEN sync_runs.status = 'completed' THEN sync_runs.attempt_count
             ELSE sync_runs.attempt_count + 1
           END,
           started_at = CASE
             WHEN sync_runs.status = 'completed' THEN sync_runs.started_at
             ELSE CURRENT_TIMESTAMP
           END,
           error_message = CASE
             WHEN sync_runs.status = 'completed' THEN sync_runs.error_message
             ELSE NULL
           END,
           updated_at = CURRENT_TIMESTAMP
         RETURNING id, site_id, data_date, search_type, status`,
      )
      .bind(
        proposedId,
        input.siteId,
        input.date,
        input.searchType,
        input.requestedBy,
      )
      .first<RunRow>();

    if (!row) throw new Error("D1 did not return the created sync run");

    const results = await this.db.batch(
      DIMENSIONS.map((dimension) =>
        this.db
          .prepare(
            `INSERT OR IGNORE INTO sync_run_steps (run_id, dimension)
             VALUES (?, ?)`,
          )
          .bind(row.id, dimension),
      ),
    );
    results.forEach((result) => assertResult(result, "initializing sync steps"));

    return {
      id: row.id,
      siteId: row.site_id,
      date: row.data_date,
      searchType: row.search_type,
      status: row.status,
    };
  }

  async listSteps(runId: string): Promise<SyncStepState[]> {
    const result = await this.db
      .prepare(
        `SELECT dimension, status, next_start_row, page_count, row_count
         FROM sync_run_steps
         WHERE run_id = ?`,
      )
      .bind(runId)
      .all<StepRow>();
    assertResult(result, "listing sync steps");

    return (result.results ?? []).map((row) => ({
      dimension: row.dimension,
      status: row.status,
      nextStartRow: row.next_start_row,
      pageCount: row.page_count,
      rowCount: row.row_count,
    }));
  }

  async startStep(runId: string, dimension: SyncDimension): Promise<void> {
    const result = await this.db
      .prepare(
        `UPDATE sync_run_steps
         SET status = 'running', next_start_row = 0, page_count = 0,
             row_count = 0, attempt_count = attempt_count + 1,
             started_at = CURRENT_TIMESTAMP, completed_at = NULL,
             error_message = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE run_id = ? AND dimension = ?`,
      )
      .bind(runId, dimension)
      .run();
    assertResult(result, `starting ${dimension} sync step`);
  }

  async resetStepData(runId: string, dimension: SyncDimension): Promise<void> {
    const result = await this.db
      .prepare(`DELETE FROM ${metricTable(dimension)} WHERE sync_run_id = ?`)
      .bind(runId)
      .run();
    assertResult(result, `resetting ${dimension} sync rows`);
  }

  async appendRows(input: {
    run: SyncRun;
    dimension: SyncDimension;
    rows: NormalizedMetricRow[];
  }): Promise<void> {
    for (let index = 0; index < input.rows.length; index += MAX_BATCH_STATEMENTS) {
      const chunk = input.rows.slice(index, index + MAX_BATCH_STATEMENTS);
      const results = await this.db.batch(
        chunk.map((row) => metricStatement(this.db, input.run, input.dimension, row)),
      );
      results.forEach((result) => assertResult(result, `writing ${input.dimension} rows`));
    }
  }

  async updateStepProgress(input: {
    runId: string;
    dimension: SyncDimension;
    nextStartRow: number;
    pageCount: number;
    rowCount: number;
  }): Promise<void> {
    const result = await this.db
      .prepare(
        `UPDATE sync_run_steps
         SET next_start_row = ?, page_count = ?, row_count = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE run_id = ? AND dimension = ?`,
      )
      .bind(
        input.nextStartRow,
        input.pageCount,
        input.rowCount,
        input.runId,
        input.dimension,
      )
      .run();
    assertResult(result, `updating ${input.dimension} progress`);
  }

  async completeStep(input: {
    runId: string;
    dimension: SyncDimension;
    pageCount: number;
    rowCount: number;
  }): Promise<void> {
    const result = await this.db
      .prepare(
        `UPDATE sync_run_steps
         SET status = 'completed', page_count = ?, row_count = ?,
             completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE run_id = ? AND dimension = ?`,
      )
      .bind(input.pageCount, input.rowCount, input.runId, input.dimension)
      .run();
    assertResult(result, `completing ${input.dimension} sync step`);
  }

  async failStepAndRun(input: {
    runId: string;
    dimension: SyncDimension;
    errorMessage: string;
  }): Promise<void> {
    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE sync_run_steps
           SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
           WHERE run_id = ? AND dimension = ?`,
        )
        .bind(input.errorMessage, input.runId, input.dimension),
      this.db
        .prepare(
          `UPDATE sync_runs
           SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(input.errorMessage, input.runId),
    ]);
    results.forEach((result) => assertResult(result, "marking sync failure"));
  }

  async completeRun(runId: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE sync_runs
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
             error_message = NULL,
             total_rows = (
               SELECT COALESCE(SUM(row_count), 0)
               FROM sync_run_steps
               WHERE run_id = ?
             ),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND NOT EXISTS (
             SELECT 1 FROM sync_run_steps
             WHERE run_id = ? AND status <> 'completed'
           )
         RETURNING id`,
      )
      .bind(runId, runId, runId)
      .first<{ id: string }>();

    return Boolean(result?.id);
  }
}
