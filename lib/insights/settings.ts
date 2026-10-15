export interface SiteInsightSettings {
  minimumDataCoverage: number;
  decayMinimumPreviousClicks: number;
  decayMinimumLostClicks: number;
  decayMinimumRatio: number;
  strikingMinimumPosition: number;
  strikingMaximumPosition: number;
  strikingMinimumImpressions: number;
  ctrMinimumQueryImpressions: number;
  ctrMinimumBenchmarkImpressions: number;
  ctrMaximumExpectedRatio: number;
  ctrMinimumMissedClicks: number;
  cannibalizationMinimumQueryImpressions: number;
  cannibalizationMinimumPageImpressions: number;
  cannibalizationMinimumPageShare: number;
  cannibalizationMinimumSwitchRate: number;
  lowPerformanceMinimumAgeDays: number;
  lowPerformanceMinimumImpressions: number;
  lowPerformanceMinimumPosition: number;
}

export const DEFAULT_INSIGHT_SETTINGS: SiteInsightSettings = {
  minimumDataCoverage: 0.9,
  decayMinimumPreviousClicks: 50,
  decayMinimumLostClicks: 10,
  decayMinimumRatio: 0.2,
  strikingMinimumPosition: 5,
  strikingMaximumPosition: 20,
  strikingMinimumImpressions: 50,
  ctrMinimumQueryImpressions: 100,
  ctrMinimumBenchmarkImpressions: 1_000,
  ctrMaximumExpectedRatio: 0.6,
  ctrMinimumMissedClicks: 5,
  cannibalizationMinimumQueryImpressions: 200,
  cannibalizationMinimumPageImpressions: 30,
  cannibalizationMinimumPageShare: 0.15,
  cannibalizationMinimumSwitchRate: 0.2,
  lowPerformanceMinimumAgeDays: 90,
  lowPerformanceMinimumImpressions: 200,
  lowPerformanceMinimumPosition: 15,
};

export function clampRatio(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}
