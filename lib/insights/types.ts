import type { ContentType } from "../sites/classification.ts";

export interface Metrics {
  clicks: number;
  impressions: number;
  position: number;
}

export interface PeriodMetric {
  key: string;
  current: Metrics;
  previous: Metrics;
}

export interface QueryPageDailyMetric extends Metrics {
  date: string;
  query: string;
  page: string;
}

export interface SitemapPageSignal {
  isInSitemap?: boolean;
  ageDays?: number;
  contentType?: ContentType;
}

export interface PageMetric extends PeriodMetric, SitemapPageSignal {}

export interface QueryMetric extends PeriodMetric {
  bestPage?: string;
}

export type SearchDevice = "DESKTOP" | "MOBILE" | "TABLET" | "UNKNOWN";

export interface QueryDeviceMetric extends QueryMetric {
  device: SearchDevice;
}

export interface TopicClusterSeed {
  id?: number;
  label: string;
  terms: string[];
}

export interface MonthlyPageMetric extends Metrics {
  page: string;
  month: string;
}
