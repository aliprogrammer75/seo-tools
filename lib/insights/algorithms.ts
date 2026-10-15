import {
  classifyBrandQuery,
  normalizeSearchText,
  type BrandTerm,
} from "../sites/classification.ts";
import {
  countDifferenceZScore,
  ctr,
  percentChange,
  twoProportionZScore,
} from "./metrics.ts";
import type {
  PageMetric,
  MonthlyPageMetric,
  PeriodMetric,
  QueryDeviceMetric,
  QueryMetric,
  QueryPageDailyMetric,
  SearchDevice,
  TopicClusterSeed,
} from "./types.ts";
import { DEFAULT_INSIGHT_SETTINGS } from "./settings.ts";

const CONFIDENCE_Z_95 = 1.96;

function isSiteBrand(query: string, terms: BrandTerm[]): boolean {
  return classifyBrandQuery(query, terms) === "site";
}

export interface ContentDecayInsight {
  page: string;
  currentClicks: number;
  previousClicks: number;
  lostClicks: number;
  decayPercent: number;
  zScore: number;
  cause: "ranking_loss" | "visibility_loss" | "snippet_ctr" | "mixed";
  comparison: "previous_period" | "year_over_year" | "peak";
  score: number;
}

export interface ContentDecayOptions {
  minimumPreviousClicks?: number;
  minimumLostClicks?: number;
  minimumDecayRatio?: number;
  minimumDataCoverage?: number;
  currentDataCoverage?: number;
  comparisonDataCoverage?: number;
  comparison?: ContentDecayInsight["comparison"];
}

export function findContentDecay(
  rows: PageMetric[],
  options: ContentDecayOptions = {},
): ContentDecayInsight[] {
  const minimumPreviousClicks =
    options.minimumPreviousClicks ?? DEFAULT_INSIGHT_SETTINGS.decayMinimumPreviousClicks;
  const minimumLostClicks =
    options.minimumLostClicks ?? DEFAULT_INSIGHT_SETTINGS.decayMinimumLostClicks;
  const minimumDecayRatio =
    options.minimumDecayRatio ?? DEFAULT_INSIGHT_SETTINGS.decayMinimumRatio;
  const minimumDataCoverage =
    options.minimumDataCoverage ?? DEFAULT_INSIGHT_SETTINGS.minimumDataCoverage;
  const currentDataCoverage = options.currentDataCoverage ?? 1;
  const comparisonDataCoverage = options.comparisonDataCoverage ?? 1;

  if (
    currentDataCoverage < minimumDataCoverage ||
    comparisonDataCoverage < minimumDataCoverage
  ) {
    return [];
  }

  return rows
    .map((row): ContentDecayInsight | null => {
      const change = percentChange(row.current.clicks, row.previous.clicks);
      const lostClicks = row.previous.clicks - row.current.clicks;
      const zScore = countDifferenceZScore(row.current.clicks, row.previous.clicks);
      if (
        row.previous.clicks < minimumPreviousClicks ||
        lostClicks < minimumLostClicks ||
        change === null ||
        change > -minimumDecayRatio ||
        zScore < CONFIDENCE_Z_95
      ) {
        return null;
      }

      const impressionChange = percentChange(
        row.current.impressions,
        row.previous.impressions,
      );
      const ctrChange = percentChange(ctr(row.current), ctr(row.previous));
      const positionLoss = row.current.position - row.previous.position;
      let cause: ContentDecayInsight["cause"] = "mixed";
      if (positionLoss >= 2) cause = "ranking_loss";
      else if (impressionChange !== null && impressionChange <= -0.2) {
        cause = "visibility_loss";
      } else if (ctrChange !== null && ctrChange <= -0.2 && positionLoss < 1) {
        cause = "snippet_ctr";
      }

      return {
        page: row.key,
        currentClicks: row.current.clicks,
        previousClicks: row.previous.clicks,
        lostClicks,
        decayPercent: change * 100,
        zScore,
        cause,
        comparison: options.comparison ?? "previous_period",
        score: lostClicks * Math.abs(change) * Math.min(zScore, 5),
      };
    })
    .filter((row): row is ContentDecayInsight => row !== null)
    .sort((a, b) => b.score - a.score);
}

export function findPeakContentDecay(
  rows: MonthlyPageMetric[],
  latestMonth: string,
  options: Omit<ContentDecayOptions, "comparison"> = {},
): ContentDecayInsight[] {
  const byPage = new Map<string, MonthlyPageMetric[]>();
  for (const row of rows) {
    const list = byPage.get(row.page) ?? [];
    list.push(row);
    byPage.set(row.page, list);
  }

  const comparisons: PageMetric[] = [];
  for (const [page, months] of byPage) {
    const latest = months.find((row) => row.month === latestMonth) ?? {
      page,
      month: latestMonth,
      clicks: 0,
      impressions: 0,
      position: 0,
    };
    const peak = months
      .filter((row) => row.month < latestMonth)
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)[0];
    if (!peak) continue;
    comparisons.push({
      key: page,
      current: latest,
      previous: peak,
    });
  }

  return findContentDecay(comparisons, { ...options, comparison: "peak" });
}

export interface StrikingDistanceInsight {
  query: string;
  page?: string;
  clicks: number;
  impressions: number;
  position: number;
  opportunityScore: number;
}

export interface StrikingDistanceOptions {
  minimumPosition?: number;
  maximumPosition?: number;
  minimumImpressions?: number;
  targetPosition?: number;
}

export function findStrikingDistance(
  rows: QueryMetric[],
  brandTerms: BrandTerm[],
  options: StrikingDistanceOptions = {},
): StrikingDistanceInsight[] {
  const minimumPosition =
    options.minimumPosition ?? DEFAULT_INSIGHT_SETTINGS.strikingMinimumPosition;
  const maximumPosition =
    options.maximumPosition ?? DEFAULT_INSIGHT_SETTINGS.strikingMaximumPosition;
  const minimumImpressions =
    options.minimumImpressions ?? DEFAULT_INSIGHT_SETTINGS.strikingMinimumImpressions;
  const targetPosition = options.targetPosition ?? 3;

  if (minimumPosition < 1 || maximumPosition < minimumPosition) {
    throw new RangeError("Invalid striking-distance position window");
  }

  return rows
    .filter(
      (row) =>
        !isSiteBrand(row.key, brandTerms) &&
        row.current.impressions >= minimumImpressions &&
        row.current.position >= minimumPosition &&
        row.current.position <= maximumPosition,
    )
    .map((row) => ({
      query: row.key,
      page: row.bestPage,
      clicks: row.current.clicks,
      impressions: row.current.impressions,
      position: row.current.position,
      opportunityScore: row.current.impressions / Math.max(1, row.current.position - targetPosition),
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
}

type CtrBand = "1" | "2" | "3" | "4" | "5" | "6-7" | "8-10";

function ctrBand(position: number): CtrBand | null {
  if (position < 1 || position > 10) return null;
  if (position < 1.5) return "1";
  if (position < 2.5) return "2";
  if (position < 3.5) return "3";
  if (position < 4.5) return "4";
  if (position < 5.5) return "5";
  if (position < 7.5) return "6-7";
  return "8-10";
}

export interface CtrBenchmark {
  band: CtrBand;
  device: SearchDevice | "ALL";
  clicks: number;
  impressions: number;
  expectedCtr: number;
}

type CtrMetric = QueryMetric | QueryDeviceMetric;

function metricDevice(row: CtrMetric): SearchDevice | "ALL" {
  return "device" in row ? row.device : "ALL";
}

function benchmarkKey(device: SearchDevice | "ALL", band: CtrBand): string {
  return `${device}:${band}`;
}

export function buildSiteCtrBenchmarks(
  calibrationRows: CtrMetric[],
  brandTerms: BrandTerm[],
  minimumImpressions = DEFAULT_INSIGHT_SETTINGS.ctrMinimumBenchmarkImpressions,
): Map<string, CtrBenchmark> {
  const totals = new Map<
    string,
    { band: CtrBand; device: SearchDevice | "ALL"; clicks: number; impressions: number }
  >();

  for (const row of calibrationRows) {
    if (isSiteBrand(row.key, brandTerms)) continue;
    const band = ctrBand(row.current.position);
    if (!band) continue;
    const device = metricDevice(row);
    const devices: Array<SearchDevice | "ALL"> = device === "ALL" ? ["ALL"] : [device, "ALL"];
    for (const targetDevice of devices) {
      const key = benchmarkKey(targetDevice, band);
      const total = totals.get(key) ?? {
        band,
        device: targetDevice,
        clicks: 0,
        impressions: 0,
      };
      total.clicks += row.current.clicks;
      total.impressions += row.current.impressions;
      totals.set(key, total);
    }
  }

  const result = new Map<string, CtrBenchmark>();
  for (const [key, total] of totals) {
    if (total.impressions < minimumImpressions) continue;
    result.set(key, {
      ...total,
      expectedCtr: total.clicks / total.impressions,
    });
  }
  return result;
}

export interface CtrOpportunityInsight {
  query: string;
  page?: string;
  device: SearchDevice | "ALL";
  clicks: number;
  impressions: number;
  position: number;
  actualCtr: number;
  expectedCtr: number;
  missedClicks: number;
  zScore: number;
}

export interface CtrOpportunityOptions {
  minimumQueryImpressions?: number;
  minimumBenchmarkImpressions?: number;
  maximumExpectedRatio?: number;
  minimumMissedClicks?: number;
}

export function findCtrOpportunities(
  rows: CtrMetric[],
  calibrationRows: CtrMetric[],
  brandTerms: BrandTerm[],
  options: CtrOpportunityOptions = {},
): CtrOpportunityInsight[] {
  const minimumQueryImpressions =
    options.minimumQueryImpressions ?? DEFAULT_INSIGHT_SETTINGS.ctrMinimumQueryImpressions;
  const minimumBenchmarkImpressions =
    options.minimumBenchmarkImpressions ??
    DEFAULT_INSIGHT_SETTINGS.ctrMinimumBenchmarkImpressions;
  const maximumExpectedRatio =
    options.maximumExpectedRatio ?? DEFAULT_INSIGHT_SETTINGS.ctrMaximumExpectedRatio;
  const minimumMissedClicks =
    options.minimumMissedClicks ?? DEFAULT_INSIGHT_SETTINGS.ctrMinimumMissedClicks;
  const benchmarks = buildSiteCtrBenchmarks(
    calibrationRows,
    brandTerms,
    minimumBenchmarkImpressions,
  );

  return rows
    .map((row): CtrOpportunityInsight | null => {
      if (
        isSiteBrand(row.key, brandTerms) ||
        row.current.impressions < minimumQueryImpressions
      ) {
        return null;
      }
      const band = ctrBand(row.current.position);
      const device = metricDevice(row);
      const benchmark = band
        ? benchmarks.get(benchmarkKey(device, band)) ??
          benchmarks.get(benchmarkKey("ALL", band))
        : undefined;
      if (!benchmark) return null;
      const actualCtr = ctr(row.current);
      const missedClicks = Math.floor(
        row.current.impressions * benchmark.expectedCtr - row.current.clicks,
      );
      const zScore = twoProportionZScore({
        clicks: row.current.clicks,
        impressions: row.current.impressions,
        benchmarkClicks: benchmark.clicks,
        benchmarkImpressions: benchmark.impressions,
      });
      if (
        actualCtr >= benchmark.expectedCtr * maximumExpectedRatio ||
        missedClicks < minimumMissedClicks ||
        zScore < CONFIDENCE_Z_95
      ) {
        return null;
      }
      return {
        query: row.key,
        page: row.bestPage,
        device,
        clicks: row.current.clicks,
        impressions: row.current.impressions,
        position: row.current.position,
        actualCtr,
        expectedCtr: benchmark.expectedCtr,
        missedClicks,
        zScore,
      };
    })
    .filter((row): row is CtrOpportunityInsight => row !== null)
    .sort((a, b) => b.missedClicks - a.missedClicks);
}

export interface CannibalizationPage {
  page: string;
  clicks: number;
  impressions: number;
  position: number;
  impressionShare: number;
  isWinner: boolean;
}

export interface CannibalizationInsight {
  query: string;
  totalClicks: number;
  totalImpressions: number;
  winnerSwitches: number;
  winnerSwitchRate: number;
  isCritical: boolean;
  score: number;
  competingPages: CannibalizationPage[];
}

export interface CannibalizationOptions {
  minimumQueryImpressions?: number;
  minimumPageImpressions?: number;
  minimumPageShare?: number;
  minimumWinnerSwitchRate?: number;
}

export function findCannibalization(
  rows: QueryPageDailyMetric[],
  brandTerms: BrandTerm[],
  options: CannibalizationOptions = {},
): CannibalizationInsight[] {
  const minimumQueryImpressions =
    options.minimumQueryImpressions ??
    DEFAULT_INSIGHT_SETTINGS.cannibalizationMinimumQueryImpressions;
  const minimumPageImpressions =
    options.minimumPageImpressions ??
    DEFAULT_INSIGHT_SETTINGS.cannibalizationMinimumPageImpressions;
  const minimumPageShare =
    options.minimumPageShare ?? DEFAULT_INSIGHT_SETTINGS.cannibalizationMinimumPageShare;
  const minimumWinnerSwitchRate =
    options.minimumWinnerSwitchRate ??
    DEFAULT_INSIGHT_SETTINGS.cannibalizationMinimumSwitchRate;
  const byQuery = new Map<string, QueryPageDailyMetric[]>();
  for (const row of rows) {
    if (isSiteBrand(row.query, brandTerms)) continue;
    const list = byQuery.get(row.query) ?? [];
    list.push(row);
    byQuery.set(row.query, list);
  }

  const insights: CannibalizationInsight[] = [];
  for (const [query, queryRows] of byQuery) {
    const totalImpressions = queryRows.reduce((sum, row) => sum + row.impressions, 0);
    if (totalImpressions < minimumQueryImpressions) continue;
    const pages = new Map<string, MetricsAccumulator>();
    for (const row of queryRows) {
      const page = pages.get(row.page) ?? new MetricsAccumulator();
      page.add(row);
      pages.set(row.page, page);
    }
    const significant = [...pages.entries()]
      .map(([page, metrics]) => ({
        page,
        clicks: metrics.clicks,
        impressions: metrics.impressions,
        position: metrics.position(),
        impressionShare: metrics.impressions / totalImpressions,
      }))
      .filter(
        (page) =>
          page.impressions >= minimumPageImpressions &&
          page.impressionShare >= minimumPageShare,
      )
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
    if (significant.length < 2) continue;

    const significantPages = new Set(significant.map((page) => page.page));
    const dailyWinners = new Map<string, Map<string, number>>();
    for (const row of queryRows) {
      if (!significantPages.has(row.page)) continue;
      const day = dailyWinners.get(row.date) ?? new Map<string, number>();
      day.set(row.page, (day.get(row.page) ?? 0) + row.impressions);
      dailyWinners.set(row.date, day);
    }
    const winners = [...dailyWinners.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, day]) =>
        [...day.entries()].sort((a, b) => b[1] - a[1])[0]?.[0],
      )
      .filter((winner): winner is string => Boolean(winner));
    let winnerSwitches = 0;
    for (let index = 1; index < winners.length; index += 1) {
      if (winners[index] !== winners[index - 1]) winnerSwitches += 1;
    }
    const winnerSwitchRate = winners.length > 1 ? winnerSwitches / (winners.length - 1) : 0;
    const positionGap = Math.abs(significant[0].position - significant[1].position);
    const dominantShare = Math.max(...significant.map((page) => page.impressionShare));
    const isCritical =
      positionGap <= 3 &&
      winnerSwitchRate >= minimumWinnerSwitchRate &&
      dominantShare < 0.8;
    if (!isCritical && winnerSwitches === 0 && positionGap > 5) continue;

    insights.push({
      query,
      totalClicks: significant.reduce((sum, page) => sum + page.clicks, 0),
      totalImpressions,
      winnerSwitches,
      winnerSwitchRate,
      isCritical,
      score: totalImpressions * (1 - dominantShare) * (1 + winnerSwitchRate),
      competingPages: significant.map((page, index) => ({
        ...page,
        isWinner: index === 0,
      })),
    });
  }

  return insights.sort((a, b) => b.score - a.score);
}

class MetricsAccumulator {
  clicks = 0;
  impressions = 0;
  private weightedPosition = 0;

  add(row: { clicks: number; impressions: number; position: number }): void {
    this.clicks += row.clicks;
    this.impressions += row.impressions;
    this.weightedPosition += row.position * row.impressions;
  }

  position(): number {
    return this.impressions > 0 ? this.weightedPosition / this.impressions : 0;
  }
}

export interface LowPerformancePageInsight {
  page: string;
  category: "not_visible" | "shown_not_clicked" | "weak_visibility";
  impressions: number;
  position: number;
  confidence: "high" | "medium";
  action: "inspect_indexing" | "review_and_refresh" | "review_merge_or_noindex";
  reason: string;
}

export interface LowPerformanceOptions {
  minimumAgeDays?: number;
  minimumShownImpressions?: number;
  minimumWeakPosition?: number;
}

export function findLowPerformancePages(
  rows: PageMetric[],
  options: LowPerformanceOptions = {},
): LowPerformancePageInsight[] {
  const minimumAgeDays =
    options.minimumAgeDays ?? DEFAULT_INSIGHT_SETTINGS.lowPerformanceMinimumAgeDays;
  const minimumShownImpressions =
    options.minimumShownImpressions ??
    DEFAULT_INSIGHT_SETTINGS.lowPerformanceMinimumImpressions;
  const minimumWeakPosition =
    options.minimumWeakPosition ?? DEFAULT_INSIGHT_SETTINGS.lowPerformanceMinimumPosition;

  return rows
    .map((row): LowPerformancePageInsight | null => {
      if (row.current.clicks > 0 || (row.ageDays ?? minimumAgeDays) < minimumAgeDays) {
        return null;
      }
      const confidence =
        row.isInSitemap === true && (row.ageDays ?? minimumAgeDays) >= minimumAgeDays
          ? "high" as const
          : "medium" as const;
      if (row.isInSitemap === true && row.current.impressions === 0) {
        return {
          page: row.key,
          category: "not_visible",
          impressions: 0,
          position: 0,
          confidence,
          action: "inspect_indexing",
          reason:
            "این URL در سایت‌مپ است اما در بازه بررسی هیچ ایمپرشنی ندارد؛ ابتدا وضعیت ایندکس، canonical و کیفیت صفحه بررسی شود.",
        };
      }
      if (
        row.current.impressions >= minimumShownImpressions &&
        row.current.position >= minimumWeakPosition
      ) {
        return {
          page: row.key,
          category: "shown_not_clicked",
          impressions: row.current.impressions,
          position: row.current.position,
          confidence,
          action:
            row.isInSitemap === false ? "review_merge_or_noindex" : "review_and_refresh",
          reason:
            "این صفحه دیده شده اما کلیک نگرفته است؛ نیت جست‌وجو، محتوا و اسنیپت بررسی شود و حذف خودکار توصیه نمی‌شود.",
        };
      }
      if (
        row.current.impressions > 0 &&
        row.current.impressions < minimumShownImpressions &&
        row.current.position >= minimumWeakPosition &&
        row.previous.clicks === 0 &&
        row.previous.impressions <= minimumShownImpressions
      ) {
        return {
          page: row.key,
          category: "weak_visibility",
          impressions: row.current.impressions,
          position: row.current.position,
          confidence,
          action: "review_and_refresh",
          reason:
            "صفحه قدیمی است اما در دو دوره فقط دیده‌شدن ضعیفی داشته است؛ ارتباط موضوعی، لینک داخلی و ارزش محتوایی بررسی شود.",
        };
      }
      return null;
    })
    .filter((row): row is LowPerformancePageInsight => row !== null)
    .sort((a, b) => b.impressions - a.impressions);
}

export interface NewRankingInsight {
  query: string;
  kind: "new_visibility" | "new_traffic";
  clicks: number;
  impressions: number;
  position: number;
}

export function findNewRankings(
  rows: QueryMetric[],
  brandTerms: BrandTerm[],
): NewRankingInsight[] {
  return rows
    .filter((row) => !isSiteBrand(row.key, brandTerms))
    .map((row): NewRankingInsight | null => {
      if (row.previous.impressions === 0 && row.current.impressions >= 20) {
        return {
          query: row.key,
          kind: "new_visibility",
          clicks: row.current.clicks,
          impressions: row.current.impressions,
          position: row.current.position,
        };
      }
      if (
        row.previous.impressions > 0 &&
        row.previous.clicks === 0 &&
        row.current.clicks > 0
      ) {
        return {
          query: row.key,
          kind: "new_traffic",
          clicks: row.current.clicks,
          impressions: row.current.impressions,
          position: row.current.position,
        };
      }
      return null;
    })
    .filter((row): row is NewRankingInsight => row !== null)
    .sort((a, b) => b.impressions - a.impressions);
}

const TOPIC_STOP_WORDS = new Set([
  "از", "به", "با", "برای", "در", "و", "یا", "که", "این", "آن", "را", "های",
  "است", "چیست", "چگونه", "چطور", "بهترین", "جدید", "آنلاین", "خرید", "قیمت",
  "ارزان", "فروش", "فروشگاه", "the", "in", "on", "for", "and", "how", "to",
]);

function topicTokens(query: string): string[] {
  return normalizeSearchText(query)
    .split(" ")
    .filter((token) => token.length >= 2 && !TOPIC_STOP_WORDS.has(token) && !/^\d+$/.test(token));
}

export interface TopicCluster {
  label: string;
  queries: string[];
  clicks: number;
  impressions: number;
  source: "manual" | "suggested";
}

function buildSuggestedTopicClusters(rows: QueryMetric[]): TopicCluster[] {
  const candidates = rows
    .filter((row) => row.current.impressions > 0)
    .slice(0, 3_000)
    .map((row) => ({ row, tokens: [...new Set(topicTokens(row.key))] }))
    .filter((item) => item.tokens.length > 0);
  const parent = candidates.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  const tokenIndex = new Map<string, number[]>();
  candidates.forEach((candidate, index) => {
    for (const token of candidate.tokens) {
      const list = tokenIndex.get(token) ?? [];
      list.push(index);
      tokenIndex.set(token, list);
    }
  });
  const pairIntersections = new Map<string, number>();
  for (const indexes of tokenIndex.values()) {
    if (indexes.length > 250) continue;
    for (let left = 0; left < indexes.length; left += 1) {
      for (let right = left + 1; right < indexes.length; right += 1) {
        const key = `${indexes[left]}:${indexes[right]}`;
        pairIntersections.set(key, (pairIntersections.get(key) ?? 0) + 1);
      }
    }
  }
  for (const [pair, intersection] of pairIntersections) {
    const [left, right] = pair.split(":").map(Number);
    const smaller = Math.min(candidates[left].tokens.length, candidates[right].tokens.length);
    if (intersection >= 2 || intersection / smaller >= 0.75) union(left, right);
  }
  const groups = new Map<number, typeof candidates>();
  candidates.forEach((candidate, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(candidate);
    groups.set(root, group);
  });

  return [...groups.values()]
    .filter((group) => group.length >= 2)
    .map((group) => {
      const tokenFrequency = new Map<string, number>();
      for (const item of group) {
        for (const token of item.tokens) {
          tokenFrequency.set(token, (tokenFrequency.get(token) ?? 0) + 1);
        }
      }
      const label = [...tokenFrequency.entries()]
        .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
        .slice(0, 2)
        .map(([token]) => token)
        .join(" ");
      return {
        label,
        queries: group.map((item) => item.row.key),
        clicks: group.reduce((sum, item) => sum + item.row.current.clicks, 0),
        impressions: group.reduce((sum, item) => sum + item.row.current.impressions, 0),
        source: "suggested" as const,
      };
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

export function buildTopicClusters(
  rows: QueryMetric[],
  seeds: TopicClusterSeed[] = [],
): TopicCluster[] {
  const matchedQueries = new Set<string>();
  const manual = seeds
    .map((seed): TopicCluster | null => {
      const terms = seed.terms
        .map(normalizeSearchText)
        .filter((term) => term.length >= 2);
      if (terms.length === 0) return null;
      const matches = rows.filter((row) => {
        const query = normalizeSearchText(row.key);
        return row.current.impressions > 0 && terms.some((term) => query.includes(term));
      });
      if (matches.length === 0) return null;
      matches.forEach((row) => matchedQueries.add(row.key));
      return {
        label: seed.label,
        queries: matches.map((row) => row.key),
        clicks: matches.reduce((sum, row) => sum + row.current.clicks, 0),
        impressions: matches.reduce((sum, row) => sum + row.current.impressions, 0),
        source: "manual",
      };
    })
    .filter((cluster): cluster is TopicCluster => cluster !== null);

  const suggestions = buildSuggestedTopicClusters(
    rows.filter((row) => !matchedQueries.has(row.key)),
  );
  return [...manual, ...suggestions].sort(
    (a, b) =>
      Number(b.source === "manual") - Number(a.source === "manual") ||
      b.clicks - a.clicks ||
      b.impressions - a.impressions,
  );
}

export function toQueryMetric(row: PeriodMetric, bestPage?: string): QueryMetric {
  return { ...row, bestPage };
}
