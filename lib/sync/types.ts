import type {
  SearchAnalyticsRequest,
  SearchAnalyticsResponse,
} from "../search-console/pagination.ts";

export type SyncDimension =
  | "totals"
  | "query"
  | "page"
  | "device"
  | "query_device"
  | "query_page";
export type SyncStatus = "pending" | "running" | "completed" | "failed";
export type SyncRequestedBy = "cron" | "manual" | "backfill";

export interface SyncRun {
  id: string;
  siteId: number;
  date: string;
  searchType: string;
  status: SyncStatus;
}

export interface SyncStepState {
  dimension: SyncDimension;
  status: SyncStatus;
  nextStartRow: number;
  pageCount: number;
  rowCount: number;
}

export interface NormalizedMetricRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface BeginRunInput {
  siteId: number;
  date: string;
  searchType: string;
  requestedBy: SyncRequestedBy;
}

export interface SyncRepository {
  beginRun(input: BeginRunInput): Promise<SyncRun>;
  listSteps(runId: string): Promise<SyncStepState[]>;
  startStep(runId: string, dimension: SyncDimension): Promise<void>;
  resetStepData(runId: string, dimension: SyncDimension): Promise<void>;
  appendRows(input: {
    run: SyncRun;
    dimension: SyncDimension;
    rows: NormalizedMetricRow[];
  }): Promise<void>;
  updateStepProgress(input: {
    runId: string;
    dimension: SyncDimension;
    nextStartRow: number;
    pageCount: number;
    rowCount: number;
  }): Promise<void>;
  completeStep(input: {
    runId: string;
    dimension: SyncDimension;
    pageCount: number;
    rowCount: number;
  }): Promise<void>;
  failStepAndRun(input: {
    runId: string;
    dimension: SyncDimension;
    errorMessage: string;
  }): Promise<void>;
  completeRun(runId: string): Promise<boolean>;
}

export interface SearchConsoleReader {
  queryPage(request: SearchAnalyticsRequest): Promise<SearchAnalyticsResponse>;
}
