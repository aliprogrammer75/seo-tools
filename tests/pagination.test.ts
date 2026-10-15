import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchAllSearchAnalyticsRows,
  type SearchAnalyticsRequest,
} from "../lib/search-console/pagination.ts";

test("fetches every Search Console page using startRow", async () => {
  const requests: SearchAnalyticsRequest[] = [];
  const firstPage = Array.from({ length: 3 }, (_, index) => ({
    keys: [`query-${index}`],
  }));

  const rows = await fetchAllSearchAnalyticsRows(
    async (request) => {
      requests.push(request);
      return request.startRow === 0
        ? { rows: firstPage }
        : { rows: [{ keys: ["last-query"] }] };
    },
    {
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      dimensions: ["query"],
      rowLimit: 3,
    },
  );

  assert.equal(rows.length, 4);
  assert.deepEqual(
    requests.map((request) => request.startRow),
    [0, 3],
  );
  assert.ok(requests.every((request) => request.dataState === "final"));
});

test("treats a missing rows field as the end of the result set", async () => {
  const rows = await fetchAllSearchAnalyticsRows(async () => ({}), {
    startDate: "2026-08-01",
    endDate: "2026-08-01",
  });

  assert.deepEqual(rows, []);
});

test("rejects row limits above the Search Console maximum", async () => {
  await assert.rejects(
    fetchAllSearchAnalyticsRows(async () => ({}), {
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      rowLimit: 25_001,
    }),
    RangeError,
  );
});
