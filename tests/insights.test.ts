import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSiteCtrBenchmarks,
  buildTopicClusters,
  findCannibalization,
  findContentDecay,
  findCtrOpportunities,
  findLowPerformancePages,
  findNewRankings,
  findStrikingDistance,
} from "../lib/insights/algorithms.ts";
import type {
  PageMetric,
  QueryMetric,
  QueryPageDailyMetric,
} from "../lib/insights/types.ts";
import type { BrandTerm } from "../lib/sites/classification.ts";

const brandTerms: BrandTerm[] = [
  { term: "دیجی خواب", brandType: "site" },
  { term: "هوفر", brandType: "product" },
];

function queryMetric(input: Partial<QueryMetric> & Pick<QueryMetric, "key">): QueryMetric {
  return {
    key: input.key,
    current: input.current ?? { clicks: 0, impressions: 0, position: 0 },
    previous: input.previous ?? { clicks: 0, impressions: 0, position: 0 },
    bestPage: input.bestPage,
  };
}

test("content decay requires material, percentage and statistical loss", () => {
  const rows: PageMetric[] = [
    {
      key: "https://digikhab.org/strong-decay/",
      current: { clicks: 50, impressions: 800, position: 9 },
      previous: { clicks: 100, impressions: 1_200, position: 5 },
    },
    {
      key: "https://digikhab.org/noisy-small-change/",
      current: { clicks: 8, impressions: 100, position: 8 },
      previous: { clicks: 12, impressions: 120, position: 8 },
    },
  ];

  const result = findContentDecay(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].cause, "ranking_loss");
  assert.equal(result[0].lostClicks, 50);
});

test("striking distance uses a practical position window and excludes site brand", () => {
  const result = findStrikingDistance(
    [
      queryMetric({
        key: "خرید تشک طبی",
        current: { clicks: 3, impressions: 500, position: 11 },
        bestPage: "https://digikhab.org/product-category/mattress/",
      }),
      queryMetric({
        key: "دیجی خواب تشک",
        current: { clicks: 2, impressions: 600, position: 10 },
      }),
      queryMetric({
        key: "تشک کم جستجو",
        current: { clicks: 0, impressions: 20, position: 12 },
      }),
    ],
    brandTerms,
  );

  assert.deepEqual(result.map((row) => row.query), ["خرید تشک طبی"]);
});

test("CTR opportunities use the site's own non-brand benchmark and significance", () => {
  const calibration = [
    queryMetric({
      key: "تشک طبی قدیمی",
      current: { clicks: 200, impressions: 2_000, position: 3.1 },
    }),
    queryMetric({
      key: "دیجی خواب",
      current: { clicks: 900, impressions: 1_000, position: 3.1 },
    }),
  ];
  const benchmarks = buildSiteCtrBenchmarks(calibration, brandTerms);
  assert.equal(benchmarks.get("3")?.expectedCtr, 0.1);

  const result = findCtrOpportunities(
    [
      queryMetric({
        key: "تشک طبی جدید",
        current: { clicks: 20, impressions: 1_000, position: 3.2 },
        bestPage: "https://digikhab.org/mattress/",
      }),
    ],
    calibration,
    brandTerms,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].expectedCtr, 0.1);
  assert.equal(result[0].missedClicks, 80);
});

test("cannibalization requires meaningful share and unstable daily winners", () => {
  const rows: QueryPageDailyMetric[] = [];
  for (let day = 1; day <= 6; day += 1) {
    const firstWins = day % 2 === 1;
    rows.push(
      {
        date: `2026-08-0${day}`,
        query: "تشک طبی",
        page: "/page-a/",
        clicks: 3,
        impressions: firstWins ? 60 : 40,
        position: 6,
      },
      {
        date: `2026-08-0${day}`,
        query: "تشک طبی",
        page: "/page-b/",
        clicks: 2,
        impressions: firstWins ? 40 : 60,
        position: 7,
      },
      {
        date: `2026-08-0${day}`,
        query: "تشک طبی",
        page: "/tiny/",
        clicks: 0,
        impressions: 2,
        position: 40,
      },
    );
  }

  const result = findCannibalization(rows, brandTerms);
  assert.equal(result.length, 1);
  assert.equal(result[0].isCritical, true);
  assert.equal(result[0].winnerSwitches, 5);
  assert.equal(result[0].competingPages.length, 2);
});

test("low-performance pages are review candidates, not automatic delete decisions", () => {
  const rows: PageMetric[] = [
    {
      key: "/old-product/",
      current: { clicks: 0, impressions: 500, position: 22 },
      previous: { clicks: 0, impressions: 0, position: 0 },
      isInSitemap: true,
      ageDays: 180,
      contentType: "product",
    },
    {
      key: "/new-product/",
      current: { clicks: 0, impressions: 900, position: 30 },
      previous: { clicks: 0, impressions: 0, position: 0 },
      isInSitemap: true,
      ageDays: 20,
      contentType: "product",
    },
  ];

  const result = findLowPerformancePages(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].action, "review_and_refresh");
  assert.match(result[0].reason, /حذف خودکار توصیه نمی‌شود/);
});

test("new visibility and new traffic are reported as different events", () => {
  const result = findNewRankings(
    [
      queryMetric({
        key: "تشک جدید",
        current: { clicks: 0, impressions: 50, position: 18 },
      }),
      queryMetric({
        key: "تشک قدیمی",
        current: { clicks: 3, impressions: 80, position: 9 },
        previous: { clicks: 0, impressions: 60, position: 12 },
      }),
    ],
    brandTerms,
  );
  assert.deepEqual(result.map((row) => row.kind).sort(), ["new_traffic", "new_visibility"]);
});

test("topic clustering groups Persian queries by shared meaningful tokens", () => {
  const clusters = buildTopicClusters([
    queryMetric({
      key: "خرید تشک رویال 160",
      current: { clicks: 5, impressions: 100, position: 8 },
    }),
    queryMetric({
      key: "قیمت تشک رویال",
      current: { clicks: 4, impressions: 90, position: 7 },
    }),
    queryMetric({
      key: "بالش طبی",
      current: { clicks: 2, impressions: 60, position: 10 },
    }),
  ]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].queries.length, 2);
  assert.match(clusters[0].label, /تشک|رویال/);
});
