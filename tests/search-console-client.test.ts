import assert from "node:assert/strict";
import test from "node:test";

import { SearchConsoleClient } from "../lib/search-console/client.ts";

test("uses the exact URL-prefix property and current type field", async () => {
  let requestUrl = "";
  let requestBody: Record<string, unknown> = {};
  const fetchMock: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ rows: [] });
  };
  const client = new SearchConsoleClient({
    propertyUrl: "https://digikhab.org/",
    getAccessToken: async () => "test-token",
    fetchImpl: fetchMock,
  });

  await client.queryAll({
    startDate: "2026-08-01",
    endDate: "2026-08-01",
    dimensions: ["query"],
    type: "web",
  });

  assert.ok(requestUrl.includes("https%3A%2F%2Fdigikhab.org%2F"));
  assert.equal(requestBody.type, "web");
  assert.equal(requestBody.dataState, "final");
  assert.equal(requestBody.rowLimit, 25_000);
  assert.equal(requestBody.startRow, 0);
  assert.equal("maxPages" in requestBody, false);
  assert.equal("searchType" in requestBody, false);
});

test("retries throttled Search Console requests", async () => {
  let requestCount = 0;
  const fetchMock: typeof fetch = async () => {
    requestCount += 1;
    return requestCount === 1
      ? new Response("throttled", { status: 429 })
      : Response.json({ rows: [] });
  };
  const client = new SearchConsoleClient({
    propertyUrl: "https://digikhab.org/",
    getAccessToken: async () => "test-token",
    fetchImpl: fetchMock,
    retry: { baseDelayMs: 0, sleep: async () => undefined },
  });

  await client.queryAll({ startDate: "2026-08-01", endDate: "2026-08-01" });
  assert.equal(requestCount, 2);
});
