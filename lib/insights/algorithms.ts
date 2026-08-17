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
  PeriodMetric,
  QueryMetric,
  QueryPageDailyMetric,
} from "./types.ts";

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
  score: number;
}

export function findContentDecay(
  rows: PageMetric[],
  options: { minimumPreviousClicks?: number; minimumLostClicks?: number } = {},
): ContentDecayInsight[] {
  const minimumPreviousClicks = options.minimumPreviousClicks ?? 20;
  const minimumLostClicks = options.minimumLostClicks ?? 10;

  return rows
    .map((row): ContentDecayInsight | null => {
      const change = percentChange(row.current.clicks, row.previous.clicks);
      const lostClicks = row.previous.clicks - row.current.clicks;
      const zScore = countDifferenceZScore(row.current.clicks, row.previous.clicks);
      if (
        row.previous.clicks < minimumPreviousClicks ||
        lostClicks < minimumLostClicks ||
        change === null ||
        change > -0.2 ||
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
        score: lostClicks * Math.abs(change) * Math.min(zScore, 5),
      };
    })
    .filter((row): row is ContentDecayInsight => row !== null)
    .sort((a, b) => b.score - a.score);
}

export interface StrikingDistanceInsight {
  query: string;
  page?: string;
  clicks: number;
  impressions: number;
  position: number;
  opportunityScore: number;
}

export function findStrikingDistance(
  rows: QueryMetric[],
  brandTerms: BrandTerm[],
): StrikingDistanceInsight[] {
  return rows
    .filter(
      (row) =>
        !isSiteBrand(row.key, brandTerms) &&
        row.current.impressions >= 50 &&
        row.current.position >= 8 &&
        row.current.position <= 20,
    )
    .map((row) => ({
      query: row.key,
      page: row.bestPage,
      clicks: row.current.clicks,
      impressions: row.current.impressions,
      position: row.current.position,
      opportunityScore:
        row.current.impressions * ((21 - row.current.position) / 13),
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

interface CtrBenchmark {
  band: CtrBand;
  clicks: number;
  impressions: number;
  expectedCtr: number;
}

export function buildSiteCtrBenchmarks(
  calibrationRows: QueryMetric[],
  brandTerms: BrandTerm[],
  minimumImpressions = 1_000,
): Map<CtrBand, CtrBenchmark> {
  const totals = new Map<CtrBand, { clicks: number; impressions: number }>();

  for (const row of calibrationRows) {
    if (isSiteBrand(row.key, brandTerms)) continue;
    const band = ctrBand(row.current.position);
    if (!band) continue;
    const total = totals.get(band) ?? { clicks: 0, impressions: 0 };
    total.clicks += row.current.clicks;
    total.impressions += row.current.impressions;
    totals.set(band, total);
  }

  const result = new Map<CtrBand, CtrBenchmark>();
  for (const [band, total] of totals) {
    if (total.impressions < minimumImpressions) continue;
    result.set(band, {
      band,
      ...total,
      expectedCtr: total.clicks / total.impressions,
    });
  }
  return result;
}

export interface CtrOpportunityInsight {
  query: string;
  page?: string;
  clicks: number;
  impressions: number;
  position: number;
  actualCtr: number;
  expectedCtr: number;
  missedClicks: number;
  zScore: number;
}

export function findCtrOpportunities(
  rows: QueryMetric[],
  calibrationRows: QueryMetric[],
  brandTerms: BrandTerm[],
): CtrOpportunityInsight[] {
  const benchmarks = buildSiteCtrBenchmarks(calibrationRows, brandTerms);

  return rows
    .map((row): CtrOpportunityInsight | null => {
      if (isSiteBrand(row.key, brandTerms) || row.current.impressions < 100) return null;
      const band = ctrBand(row.current.position);
      const benchmark = band ? benchmarks.get(band) : undefined;
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
        actualCtr >= benchmark.expectedCtr * 0.6 ||
        missedClicks < 5 ||
        zScore < CONFIDENCE_Z_95
      ) {
        return null;
      }
      return {
        query: row.key,
        page: row.bestPage,
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

export function findCannibalization(
  rows: QueryPageDailyMetric[],
  brandTerms: BrandTerm[],
): CannibalizationInsight[] {
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
    if (totalImpressions < 200) continue;
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
      .filter((page) => page.impressions >= 30 && page.impressionShare >= 0.15)
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
    const isCritical = positionGap <= 3 && winnerSwitchRate >= 0.2 && dominantShare < 0.8;
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
  impressions: number;
  position: number;
  confidence: "high" | "medium";
  action: "review_and_refresh" | "review_merge_or_noindex";
  reason: string;
}

export function findLowPerformancePages(rows: PageMetric[]): LowPerformancePageInsight[] {
  return rows
    .filter(
      (row) =>
        row.current.clicks === 0 &&
        row.current.impressions >= 200 &&
        row.current.position >= 15 &&
        (row.ageDays === undefined || row.ageDays >= 90),
    )
    .map((row) => ({
      page: row.key,
      impressions: row.current.impressions,
      position: row.current.position,
      confidence: row.isInSitemap === true && (row.ageDays ?? 90) >= 90 ? "high" as const : "medium" as const,
      action:
        row.isInSitemap === false
          ? "review_merge_or_noindex" as const
          : "review_and_refresh" as const,
      reason:
        "این صفحه در بازه بلندمدت دیده شده اما کلیک نگرفته است؛ حذف خودکار توصیه نمی‌شود.",
    }))
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
}

export function buildTopicClusters(rows: QueryMetric[]): TopicCluster[] {
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
      };
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

export function toQueryMetric(row: PeriodMetric, bestPage?: string): QueryMetric {
  return { ...row, bestPage };
}
