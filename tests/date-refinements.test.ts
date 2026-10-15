import assert from "node:assert/strict";
import test from "node:test";

import {
  endOfPreviousIsoMonth,
  isoDateRangeDays,
  shiftIsoMonth,
  shiftIsoYear,
  startOfIsoMonth,
} from "../lib/sync/date.ts";

test("calendar comparison helpers preserve valid month and year boundaries", () => {
  assert.equal(shiftIsoYear("2024-02-29", -1), "2023-02-28");
  assert.equal(shiftIsoMonth("2026-03-31", -1), "2026-02-28");
  assert.equal(startOfIsoMonth("2026-08-17"), "2026-08-01");
  assert.equal(endOfPreviousIsoMonth("2026-08-17"), "2026-07-31");
  assert.equal(isoDateRangeDays("2026-07-01", "2026-07-31"), 31);
});
