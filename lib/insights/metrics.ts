import type { Metrics } from "./types.ts";

export function ctr(metrics: Pick<Metrics, "clicks" | "impressions">): number {
  return metrics.impressions > 0 ? metrics.clicks / metrics.impressions : 0;
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

export function countDifferenceZScore(current: number, previous: number): number {
  const variance = current + previous;
  return variance > 0 ? (previous - current) / Math.sqrt(variance) : 0;
}

export function twoProportionZScore(input: {
  clicks: number;
  impressions: number;
  benchmarkClicks: number;
  benchmarkImpressions: number;
}): number {
  if (input.impressions <= 0 || input.benchmarkImpressions <= 0) return 0;
  const actual = input.clicks / input.impressions;
  const benchmark = input.benchmarkClicks / input.benchmarkImpressions;
  const pooled =
    (input.clicks + input.benchmarkClicks) /
    (input.impressions + input.benchmarkImpressions);
  const standardError = Math.sqrt(
    pooled *
      (1 - pooled) *
      (1 / input.impressions + 1 / input.benchmarkImpressions),
  );
  return standardError > 0 ? (benchmark - actual) / standardError : 0;
}

export function finiteMetric(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}
