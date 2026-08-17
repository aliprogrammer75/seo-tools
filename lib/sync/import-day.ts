import { GSC_MAX_ROW_LIMIT, type SearchAnalyticsDimension } from "../search-console/pagination.ts";
import type { SiteRecord } from "../db/sites.ts";
import type {
  NormalizedMetricRow,
  SearchConsoleReader,
  SyncDimension,
  SyncRepository,
  SyncRequestedBy,
} from "./types.ts";

interface StepDefinition {
  dimension: SyncDimension;
  gscDimensions: SearchAnalyticsDimension[];
  rowLimit: number;
}

const STEPS: StepDefinition[] = [
  { dimension: "totals", gscDimensions: [], rowLimit: 1 },
  { dimension: "query", gscDimensions: ["query"], rowLimit: GSC_MAX_ROW_LIMIT },
  { dimension: "page", gscDimensions: ["page"], rowLimit: GSC_MAX_ROW_LIMIT },
  { dimension: "device", gscDimensions: ["device"], rowLimit: GSC_MAX_ROW_LIMIT },
  {
    dimension: "query_device",
    gscDimensions: ["query", "device"],
    rowLimit: GSC_MAX_ROW_LIMIT,
  },
  {
    dimension: "query_page",
    gscDimensions: ["query", "page"],
    rowLimit: GSC_MAX_ROW_LIMIT,
  },
];

export interface ImportDayInput {
  site: SiteRecord;
  date: string;
  repository: SyncRepository;
  searchConsole: SearchConsoleReader;
  requestedBy?: SyncRequestedBy;
}

export interface ImportDayResult {
  runId: string;
  status: "completed" | "skipped";
  importedRows: number;
  completedSteps: SyncDimension[];
}

export function assertIsoDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Date must use YYYY-MM-DD format");
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Date is not a valid calendar date");
  }
}

function finiteMetric(value: number | undefined, field: string): number {
  if (value === undefined) return 0;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Search Console returned an invalid ${field}`);
  }
  return value;
}

function normalizeRows(
  dimension: SyncDimension,
  rows: Awaited<ReturnType<SearchConsoleReader["queryPage"]>>["rows"] = [],
): NormalizedMetricRow[] {
  const requiredKeys =
    dimension === "totals"
      ? 0
      : dimension === "query_page" || dimension === "query_device"
        ? 2
        : 1;

  return (rows ?? []).map((row) => {
    const keys = row.keys ?? [];
    if (keys.length < requiredKeys || keys.some((key) => typeof key !== "string")) {
      throw new Error(`Search Console returned invalid keys for ${dimension}`);
    }

    return {
      keys: keys.slice(0, requiredKeys),
      clicks: finiteMetric(row.clicks, "clicks"),
      impressions: finiteMetric(row.impressions, "impressions"),
      ctr: finiteMetric(row.ctr, "ctr"),
      position: finiteMetric(row.position, "position"),
    };
  });
}

function safeErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown sync failure").slice(0, 2_000);
}

export async function importSearchConsoleDay(input: ImportDayInput): Promise<ImportDayResult> {
  assertIsoDate(input.date);

  const run = await input.repository.beginRun({
    siteId: input.site.id,
    date: input.date,
    searchType: input.site.default_search_type,
    requestedBy: input.requestedBy ?? "manual",
  });

  const existingSteps = new Map(
    (await input.repository.listSteps(run.id)).map((step) => [step.dimension, step]),
  );
  if (
    run.status === "completed" &&
    STEPS.every((step) => existingSteps.get(step.dimension)?.status === "completed")
  ) {
    return { runId: run.id, status: "skipped", importedRows: 0, completedSteps: [] };
  }
  const completedSteps: SyncDimension[] = [];
  let importedRows = 0;

  for (const step of STEPS) {
    if (existingSteps.get(step.dimension)?.status === "completed") {
      completedSteps.push(step.dimension);
      continue;
    }

    await input.repository.startStep(run.id, step.dimension);
    await input.repository.resetStepData(run.id, step.dimension);
    let startRow = 0;
    let pageCount = 0;
    let rowCount = 0;

    try {
      while (true) {
        const response = await input.searchConsole.queryPage({
          startDate: input.date,
          endDate: input.date,
          dimensions: step.gscDimensions,
          type: input.site.default_search_type,
          dataState: "final",
          aggregationType: "auto",
          rowLimit: step.rowLimit,
          startRow,
        });
        const rows = normalizeRows(step.dimension, response.rows);

        await input.repository.appendRows({ run, dimension: step.dimension, rows });
        pageCount += 1;
        rowCount += rows.length;
        startRow += rows.length;
        await input.repository.updateStepProgress({
          runId: run.id,
          dimension: step.dimension,
          nextStartRow: startRow,
          pageCount,
          rowCount,
        });

        if (step.dimension === "totals" || rows.length < step.rowLimit) break;
      }

      await input.repository.completeStep({
        runId: run.id,
        dimension: step.dimension,
        pageCount,
        rowCount,
      });
      importedRows += rowCount;
      completedSteps.push(step.dimension);
    } catch (error) {
      await input.repository.failStepAndRun({
        runId: run.id,
        dimension: step.dimension,
        errorMessage: safeErrorMessage(error),
      });
      throw error;
    }
  }

  const completed = await input.repository.completeRun(run.id);
  if (!completed) {
    throw new Error("Sync run could not be completed because one or more steps are incomplete");
  }

  return { runId: run.id, status: "completed", importedRows, completedSteps };
}
