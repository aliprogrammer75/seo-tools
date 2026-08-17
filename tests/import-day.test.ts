import assert from "node:assert/strict";
import test from "node:test";

import { importSearchConsoleDay } from "../lib/sync/import-day.ts";
import type { SiteRecord } from "../lib/db/sites.ts";
import type {
  BeginRunInput,
  NormalizedMetricRow,
  SyncDimension,
  SyncRepository,
  SyncRun,
  SyncStepState,
} from "../lib/sync/types.ts";
import type {
  SearchAnalyticsRequest,
  SearchAnalyticsResponse,
} from "../lib/search-console/pagination.ts";

const site: SiteRecord = {
  id: 1,
  slug: "digikhab",
  name: "دیجی خواب",
  base_url: "https://digikhab.org/",
  gsc_property_url: "https://digikhab.org/",
  timezone: "Asia/Tehran",
  default_search_type: "web",
  status: "active",
};

class MemoryRepository implements SyncRepository {
  run: SyncRun = {
    id: "run-1",
    siteId: 1,
    date: "2026-08-10",
    searchType: "web",
    status: "running",
  };
  steps = new Map<SyncDimension, SyncStepState>();
  rows = new Map<SyncDimension, NormalizedMetricRow[]>();
  resetCalls: SyncDimension[] = [];
  failed?: SyncDimension;

  constructor() {
    for (const dimension of ["totals", "query", "page", "device", "query_page"] as const) {
      this.steps.set(dimension, {
        dimension,
        status: "pending",
        nextStartRow: 0,
        pageCount: 0,
        rowCount: 0,
      });
    }
  }

  async beginRun(input: BeginRunInput): Promise<SyncRun> {
    this.run = { ...this.run, siteId: input.siteId, date: input.date };
    return this.run;
  }
  async listSteps(): Promise<SyncStepState[]> {
    return [...this.steps.values()];
  }
  async startStep(_runId: string, dimension: SyncDimension): Promise<void> {
    this.steps.get(dimension)!.status = "running";
  }
  async resetStepData(_runId: string, dimension: SyncDimension): Promise<void> {
    this.resetCalls.push(dimension);
    this.rows.set(dimension, []);
  }
  async appendRows(input: {
    run: SyncRun;
    dimension: SyncDimension;
    rows: NormalizedMetricRow[];
  }): Promise<void> {
    this.rows.get(input.dimension)!.push(...input.rows);
  }
  async updateStepProgress(input: {
    runId: string;
    dimension: SyncDimension;
    nextStartRow: number;
    pageCount: number;
    rowCount: number;
  }): Promise<void> {
    Object.assign(this.steps.get(input.dimension)!, input);
  }
  async completeStep(input: {
    runId: string;
    dimension: SyncDimension;
    pageCount: number;
    rowCount: number;
  }): Promise<void> {
    Object.assign(this.steps.get(input.dimension)!, input, { status: "completed" });
  }
  async failStepAndRun(input: {
    runId: string;
    dimension: SyncDimension;
    errorMessage: string;
  }): Promise<void> {
    this.failed = input.dimension;
    this.run.status = "failed";
    this.steps.get(input.dimension)!.status = "failed";
  }
  async completeRun(): Promise<boolean> {
    const completed = [...this.steps.values()].every((step) => step.status === "completed");
    if (completed) this.run.status = "completed";
    return completed;
  }
}

function row(keys: string[] = []): SearchAnalyticsResponse {
  return { rows: [{ keys, clicks: 2, impressions: 20, ctr: 0.1, position: 4 }] };
}

test("completes all five dimensions before completing the run", async () => {
  const repository = new MemoryRepository();
  const requests: SearchAnalyticsRequest[] = [];
  const searchConsole = {
    async queryPage(request: SearchAnalyticsRequest): Promise<SearchAnalyticsResponse> {
      requests.push(request);
      if (request.dimensions?.length === 0) return row();
      return row(request.dimensions?.map((dimension) => `${dimension}-value`) ?? []);
    },
  };

  const result = await importSearchConsoleDay({
    site,
    date: "2026-08-10",
    repository,
    searchConsole,
  });

  assert.equal(result.status, "completed");
  assert.equal(result.completedSteps.length, 5);
  assert.equal(repository.run.status, "completed");
  assert.deepEqual(repository.resetCalls, ["totals", "query", "page", "device", "query_page"]);
  assert.ok(requests.every((request) => request.dataState === "final"));
  assert.ok(requests.every((request) => request.type === "web"));
});

test("marks the current step and run failed without completing partial data", async () => {
  const repository = new MemoryRepository();
  const searchConsole = {
    async queryPage(request: SearchAnalyticsRequest): Promise<SearchAnalyticsResponse> {
      if (request.dimensions?.join(",") === "query,page") {
        throw new Error("temporary Google failure");
      }
      return row(request.dimensions?.map((dimension) => `${dimension}-value`) ?? []);
    },
  };

  await assert.rejects(
    importSearchConsoleDay({ site, date: "2026-08-10", repository, searchConsole }),
    /temporary Google failure/,
  );

  assert.equal(repository.failed, "query_page");
  assert.equal(repository.run.status, "failed");
  assert.equal(repository.steps.get("page")?.status, "completed");
  assert.equal(repository.steps.get("query_page")?.status, "failed");
});

test("resumes a failed run without re-downloading completed dimensions", async () => {
  const repository = new MemoryRepository();
  repository.steps.get("totals")!.status = "completed";
  repository.steps.get("query")!.status = "completed";
  const requestedDimensions: string[] = [];
  const searchConsole = {
    async queryPage(request: SearchAnalyticsRequest): Promise<SearchAnalyticsResponse> {
      requestedDimensions.push(request.dimensions?.join(",") ?? "");
      return row(request.dimensions?.map((dimension) => `${dimension}-value`) ?? []);
    },
  };

  await importSearchConsoleDay({ site, date: "2026-08-10", repository, searchConsole });

  assert.deepEqual(requestedDimensions, ["page", "device", "query,page"]);
  assert.deepEqual(repository.resetCalls, ["page", "device", "query_page"]);
});

test("rejects impossible calendar dates before creating a run", async () => {
  const repository = new MemoryRepository();
  await assert.rejects(
    importSearchConsoleDay({
      site,
      date: "2026-02-30",
      repository,
      searchConsole: { async queryPage() { return {}; } },
    }),
    /valid calendar date/,
  );
});
