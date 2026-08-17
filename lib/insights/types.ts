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
