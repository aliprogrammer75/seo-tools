import test from "node:test";
import assert from "node:assert/strict";

import {
  dateInTimeZone,
  expectedDateRange,
  latestFinalSearchConsoleDate,
  shiftIsoDate,
} from "../lib/sync/date.ts";

test("uses Pacific calendar date before applying the Search Console final-data delay", () => {
  const now = new Date("2026-08-17T01:00:00.000Z");
  assert.equal(dateInTimeZone(now, "America/Los_Angeles"), "2026-08-16");
  assert.equal(latestFinalSearchConsoleDate(now), "2026-08-13");
});

test("shifts ISO dates safely across month and leap-year boundaries", () => {
  assert.equal(shiftIsoDate("2024-03-01", -1), "2024-02-29");
  assert.equal(shiftIsoDate("2026-12-31", 1), "2027-01-01");
});

test("returns an ascending inclusive expected date range", () => {
  assert.deepEqual(expectedDateRange("2026-08-13", 3), [
    "2026-08-11",
    "2026-08-12",
    "2026-08-13",
  ]);
});
