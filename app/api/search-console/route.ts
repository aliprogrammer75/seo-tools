import { getSiteConfiguration } from "@/lib/db/sites.ts";
import { ApiError, errorResponse } from "@/lib/http/api-error.ts";
import { requireInternalIdentity } from "@/lib/http/auth.ts";
import {
  buildTopicClusters,
  findCannibalization,
  findContentDecay,
  findCtrOpportunities,
  findLowPerformancePages,
  findNewRankings,
  findPeakContentDecay,
  findStrikingDistance,
} from "@/lib/insights/algorithms.ts";
import { ctr, percentChange } from "@/lib/insights/metrics.ts";
import {
  InsightsRepository,
  type DailyTotal,
  type DateWindowInput,
} from "@/lib/insights/repository.ts";
import type { Metrics, PageMetric, QueryMetric } from "@/lib/insights/types.ts";
import { getAppEnv } from "@/lib/runtime/cloudflare.ts";
import {
  classifyBrandQuery,
  classifyContent,
  normalizeSearchText,
  type BrandTerm,
  type ContentRule,
  type ContentType,
} from "@/lib/sites/classification.ts";
import {
  endOfPreviousIsoMonth,
  isoDateRangeDays,
  shiftIsoDate,
  shiftIsoMonth,
  shiftIsoYear,
  startOfIsoMonth,
} from "@/lib/sync/date.ts";

export const dynamic = "force-dynamic";

function trend(current: number, previous: number): number | "∞" {
  const change = percentChange(current, previous);
  return change === null ? "∞" : change * 100;
}

function legacyRow(row: QueryMetric | PageMetric, text = row.key) {
  const currentCtr = ctr(row.current) * 100;
  const previousCtr = ctr(row.previous) * 100;
  return {
    text,
    p_clicks: row.previous.clicks,
    clicks: row.current.clicks,
    clicks_trend: trend(row.current.clicks, row.previous.clicks),
    impressions: row.current.impressions,
    imp_trend: trend(row.current.impressions, row.previous.impressions),
    ctr: currentCtr,
    ctr_trend: trend(currentCtr, previousCtr),
    position: row.current.position,
    pos_trend:
      row.previous.position === 0
        ? row.current.position > 0
          ? "∞"
          : 0
        : row.previous.position - row.current.position,
    trendUp: row.current.clicks > row.previous.clicks,
    click_diff: row.current.clicks - row.previous.clicks,
  };
}

function aggregateMetrics(rows: Array<QueryMetric | PageMetric>, period: "current" | "previous"): Metrics {
  const metrics = rows.map((row) => row[period]);
  const impressions = metrics.reduce((sum, row) => sum + row.impressions, 0);
  return {
    clicks: metrics.reduce((sum, row) => sum + row.clicks, 0),
    impressions,
    position:
      impressions > 0
        ? metrics.reduce((sum, row) => sum + row.position * row.impressions, 0) /
          impressions
        : 0,
  };
}

function rowFromGroup(
  name: string,
  rows: PageMetric[],
): ReturnType<typeof legacyRow> {
  return legacyRow(
    {
      key: name,
      current: aggregateMetrics(rows, "current"),
      previous: aggregateMetrics(rows, "previous"),
    },
    name,
  );
}

function buildChartData(daily: DailyTotal[], window: DateWindowInput, days: number) {
  const byDate = new Map(daily.map((row) => [row.date, row]));
  return Array.from({ length: days }, (_, index) => {
    const date = shiftIsoDate(window.currentStart, index);
    const previousDate = shiftIsoDate(window.previousStart, index);
    const current = byDate.get(date);
    const previous = byDate.get(previousDate);
    return {
      date,
      prevDate: previousDate,
      clicks: current?.clicks ?? null,
      p_clicks: previous?.clicks ?? null,
      impressions: current?.impressions ?? null,
      p_imp: previous?.impressions ?? null,
      ctr:
        current && current.impressions > 0
          ? (current.clicks / current.impressions) * 100
          : null,
      p_ctr:
        previous && previous.impressions > 0
          ? (previous.clicks / previous.impressions) * 100
          : null,
      position: current?.position ?? null,
      p_pos: previous?.position ?? null,
    };
  });
}

function filterQueries(rows: QueryMetric[], url: URL, brandTerms: BrandTerm[]): QueryMetric[] {
  const excludeBrand = url.searchParams.get("excludeBrand") !== "false";
  const preset = url.searchParams.get("qPreset") || "All";
  const search = normalizeSearchText(url.searchParams.get("qSearch") ?? "");
  const questionWords = ["چگونه", "چطور", "چرا", "چیست", "آیا", "کجا", "کدام", "چه"];
  const purchaseWords = ["خرید", "قیمت", "هزینه", "ارزان", "تخفیف", "فروش", "سفارش"];

  return rows.filter((row) => {
    const normalized = normalizeSearchText(row.key);
    if (excludeBrand && classifyBrandQuery(row.key, brandTerms) === "site") return false;
    if (search && !normalized.includes(search)) return false;
    if (preset === "Questions" && !questionWords.some((word) => normalized.includes(word))) {
      return false;
    }
    if (preset === "Buy" && !purchaseWords.some((word) => normalized.includes(word))) {
      return false;
    }
    if (preset === "LongTail" && normalized.split(" ").length < 4) return false;
    return true;
  });
}

function filterPages(
  rows: PageMetric[],
  url: URL,
  contentType: (row: PageMetric) => ContentType,
): PageMetric[] {
  const preset = url.searchParams.get("pPreset") || "All";
  const search = url.searchParams.get("pSearch")?.trim().toLowerCase() ?? "";
  return rows.filter((row) => {
    if (search && !row.key.toLowerCase().includes(search)) return false;
    const type = contentType(row);
    if (preset === "Blog" && type !== "article" && type !== "article_archive") return false;
    if (preset === "Product" && type !== "product") return false;
    if (preset === "Deep") {
      try {
        if (new URL(row.key).pathname.split("/").filter(Boolean).length < 4) return false;
      } catch {
        return false;
      }
    }
    return true;
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const env = await getAppEnv();
    requireInternalIdentity(request, env);
    const url = new URL(request.url);
    const siteSlug = url.searchParams.get("site")?.trim() || "digikhab";
    const days = Number(url.searchParams.get("days") ?? "14");
    if (!Number.isInteger(days) || days < 7 || days > 489) {
      throw new ApiError(400, "INVALID_RANGE", "بازه باید بین ۷ تا ۴۸۹ روز باشد.");
    }

    const configuration = await getSiteConfiguration(env.DB, siteSlug);
    if (!configuration || configuration.site.status !== "active") {
      throw new ApiError(404, "SITE_NOT_FOUND", "سایت فعال موردنظر پیدا نشد.");
    }

    const repository = new InsightsRepository(env.DB);
    const currentEnd = await repository.latestCompletedDate(
      configuration.site.id,
      configuration.site.default_search_type,
    );
    if (!currentEnd) {
      throw new ApiError(409, "NO_DATA", "هنوز هیچ روز کاملی برای این سایت وارد نشده است.");
    }
    const currentStart = shiftIsoDate(currentEnd, -(days - 1));
    const previousEnd = shiftIsoDate(currentStart, -1);
    const previousStart = shiftIsoDate(previousEnd, -(days - 1));
    const window: DateWindowInput = {
      siteId: configuration.site.id,
      searchType: configuration.site.default_search_type,
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
    };
    const yearOverYearWindow: DateWindowInput = {
      siteId: configuration.site.id,
      searchType: configuration.site.default_search_type,
      currentStart,
      currentEnd,
      previousStart: shiftIsoYear(currentStart, -1),
      previousEnd: shiftIsoYear(currentEnd, -1),
    };
    const calibrationEnd = previousEnd;
    const calibrationStart = shiftIsoDate(calibrationEnd, -89);
    const peakEnd = endOfPreviousIsoMonth(currentEnd);
    const peakStart = startOfIsoMonth(shiftIsoMonth(peakEnd, -12));
    const peakExpectedDays = isoDateRangeDays(peakStart, peakEnd);

    const [
      allQueries,
      allPages,
      calibrationQueries,
      currentQueryDevices,
      calibrationQueryDevices,
      yearOverYearPages,
      monthlyPages,
      cannibalizationRows,
      dailyTotals,
      currentCoverage,
      previousCoverage,
      yearOverYearCoverage,
      peakCoverage,
    ] = await Promise.all([
        repository.loadQueryMetrics(window),
        repository.loadPageMetrics(window),
        repository.loadCalibrationQueries({
          siteId: configuration.site.id,
          searchType: configuration.site.default_search_type,
          startDate: calibrationStart,
          endDate: calibrationEnd,
        }),
        repository.loadQueryDeviceMetrics({
          siteId: configuration.site.id,
          searchType: configuration.site.default_search_type,
          startDate: currentStart,
          endDate: currentEnd,
        }),
        repository.loadQueryDeviceMetrics({
          siteId: configuration.site.id,
          searchType: configuration.site.default_search_type,
          startDate: calibrationStart,
          endDate: calibrationEnd,
        }),
        repository.loadPageMetrics(yearOverYearWindow),
        repository.loadMonthlyPageMetrics({
          siteId: configuration.site.id,
          searchType: configuration.site.default_search_type,
          startDate: peakStart,
          endDate: peakEnd,
        }),
        repository.loadCannibalizationRows(window),
        repository.loadDailyTotals(window),
        repository.completedDateCoverage({
          siteId: configuration.site.id,
          searchType: configuration.site.default_search_type,
          startDate: currentStart,
          endDate: currentEnd,
          expectedDays: days,
        }),
        repository.completedDateCoverage({
          siteId: configuration.site.id,
          searchType: configuration.site.default_search_type,
          startDate: previousStart,
          endDate: previousEnd,
          expectedDays: days,
        }),
        repository.completedDateCoverage({
          siteId: configuration.site.id,
          searchType: configuration.site.default_search_type,
          startDate: yearOverYearWindow.previousStart,
          endDate: yearOverYearWindow.previousEnd,
          expectedDays: days,
        }),
        repository.completedDateCoverage({
          siteId: configuration.site.id,
          searchType: configuration.site.default_search_type,
          startDate: peakStart,
          endDate: peakEnd,
          expectedDays: peakExpectedDays,
        }),
      ]);

    const brandTerms: BrandTerm[] = configuration.brandTerms.map((term) => ({
      term: term.term,
      normalizedTerm: term.normalized_term,
      brandType: term.brand_type,
    }));
    const contentRules: ContentRule[] = configuration.contentRules.map((rule) => ({
      contentType: rule.content_type as ContentType,
      matchType: rule.match_type,
      pattern: rule.pattern,
      priority: rule.priority,
    }));
    const contentType = (row: PageMetric): ContentType =>
      row.contentType ?? classifyContent(row.key, contentRules);
    const queries = filterQueries(allQueries, url, brandTerms);
    const pages = filterPages(allPages, url, contentType);

    const contentGroupsMap = new Map<ContentType, PageMetric[]>();
    for (const page of pages) {
      const type = contentType(page);
      const group = contentGroupsMap.get(type) ?? [];
      group.push(page);
      contentGroupsMap.set(type, group);
    }
    const contentLabels: Record<ContentType, string> = {
      product: "محصولات",
      category: "دسته‌بندی‌ها",
      brand: "برندها",
      article: "مقالات",
      article_archive: "آرشیو مقالات",
      page: "برگه‌ها",
      other: "سایر",
    };
    const contentGroups = [...contentGroupsMap.entries()].map(([type, rows]) =>
      rowFromGroup(contentLabels[type], rows),
    );

    const topicClusters = buildTopicClusters(queries, configuration.topicClusters)
      .slice(0, 20)
      .map((cluster) => ({
      text: cluster.label,
      clicks: cluster.clicks,
      p_clicks: 0,
      impressions: cluster.impressions,
      ctr: cluster.impressions > 0 ? (cluster.clicks / cluster.impressions) * 100 : 0,
      position: 0,
      clicks_trend: 0,
      imp_trend: 0,
      ctr_trend: 0,
      pos_trend: 0,
      click_diff: 0,
      queries: cluster.queries,
      source: cluster.source,
    }));
    const newRankings = findNewRankings(queries, brandTerms).slice(0, 50).map((row) => ({
      text: row.query,
      clicks: row.clicks,
      p_clicks: 0,
      impressions: row.impressions,
      position: row.position,
      ctr: row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0,
      clicks_trend: "∞" as const,
      imp_trend: "∞" as const,
      ctr_trend: row.clicks > 0 ? "∞" as const : 0,
      pos_trend: "∞" as const,
      click_diff: row.clicks,
      kind: row.kind,
    }));
    const settings = configuration.insightSettings;
    const strikingDistance = findStrikingDistance(allQueries, brandTerms, {
      minimumPosition: settings.strikingMinimumPosition,
      maximumPosition: settings.strikingMaximumPosition,
      minimumImpressions: settings.strikingMinimumImpressions,
    })
      .slice(0, 150)
      .map((row) => ({
        text: row.query,
        url: row.page ?? null,
        clicks: row.clicks,
        impressions: row.impressions,
        position: row.position,
        ctr: row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0,
        opportunityScore: row.opportunityScore,
      }));
    const bestPages = new Map(allQueries.map((row) => [row.key, row.bestPage]));
    const currentCtrRows =
      currentQueryDevices.length > 0
        ? currentQueryDevices.map((row) => ({ ...row, bestPage: bestPages.get(row.key) }))
        : allQueries;
    const calibrationCtrRows =
      calibrationQueryDevices.length > 0 ? calibrationQueryDevices : calibrationQueries;
    const ctrBenchmark = findCtrOpportunities(
      currentCtrRows,
      calibrationCtrRows,
      brandTerms,
      {
        minimumQueryImpressions: settings.ctrMinimumQueryImpressions,
        minimumBenchmarkImpressions: settings.ctrMinimumBenchmarkImpressions,
        maximumExpectedRatio: settings.ctrMaximumExpectedRatio,
        minimumMissedClicks: settings.ctrMinimumMissedClicks,
      },
    )
      .slice(0, 150)
      .map((row) => ({
        text: row.query,
        url: row.page ?? null,
        clicks: row.clicks,
        impressions: row.impressions,
        position: row.position,
        ctr: row.actualCtr * 100,
        expectedCtr: row.expectedCtr * 100,
        missedClicks: row.missedClicks,
        zScore: row.zScore,
        device: row.device,
      }));
    const decayOptions = {
      minimumPreviousClicks: settings.decayMinimumPreviousClicks,
      minimumLostClicks: settings.decayMinimumLostClicks,
      minimumDecayRatio: settings.decayMinimumRatio,
      minimumDataCoverage: settings.minimumDataCoverage,
      currentDataCoverage: currentCoverage,
    };
    const contentDecay = findContentDecay(allPages, {
      ...decayOptions,
      comparisonDataCoverage: previousCoverage,
      comparison: "previous_period",
    }).slice(0, 150).map((row) => ({
      text: row.page,
      clicks: row.currentClicks,
      p_clicks: row.previousClicks,
      click_diff: -row.lostClicks,
      decayPercent: row.decayPercent,
      decayScore: row.score,
      cause: row.cause,
      zScore: row.zScore,
      comparison: row.comparison,
    }));
    const contentDecaySeasonal = findContentDecay(yearOverYearPages, {
      ...decayOptions,
      comparisonDataCoverage: yearOverYearCoverage,
      comparison: "year_over_year",
    }).slice(0, 150).map((row) => ({
      text: row.page,
      clicks: row.currentClicks,
      p_clicks: row.previousClicks,
      click_diff: -row.lostClicks,
      decayPercent: row.decayPercent,
      decayScore: row.score,
      cause: row.cause,
      zScore: row.zScore,
      comparison: row.comparison,
    }));
    const contentDecayPeak = findPeakContentDecay(monthlyPages, peakEnd.slice(0, 7), {
      minimumPreviousClicks: settings.decayMinimumPreviousClicks,
      minimumLostClicks: settings.decayMinimumLostClicks,
      minimumDecayRatio: settings.decayMinimumRatio,
      minimumDataCoverage: settings.minimumDataCoverage,
      currentDataCoverage: peakCoverage,
      comparisonDataCoverage: peakCoverage,
    }).slice(0, 150).map((row) => ({
      text: row.page,
      clicks: row.currentClicks,
      p_clicks: row.previousClicks,
      click_diff: -row.lostClicks,
      decayPercent: row.decayPercent,
      decayScore: row.score,
      cause: row.cause,
      zScore: row.zScore,
      comparison: row.comparison,
    }));
    const zombies = findLowPerformancePages(allPages, {
      minimumAgeDays: settings.lowPerformanceMinimumAgeDays,
      minimumShownImpressions: settings.lowPerformanceMinimumImpressions,
      minimumWeakPosition: settings.lowPerformanceMinimumPosition,
    }).slice(0, 500).map((row) => ({
      text: row.page,
      clicks: 0,
      impressions: row.impressions,
      position: row.position,
      confidence: row.confidence,
      action: row.action,
      reason: row.reason,
      category: row.category,
    }));
    const cannibalizationData = findCannibalization(cannibalizationRows, brandTerms, {
      minimumQueryImpressions: settings.cannibalizationMinimumQueryImpressions,
      minimumPageImpressions: settings.cannibalizationMinimumPageImpressions,
      minimumPageShare: settings.cannibalizationMinimumPageShare,
      minimumWinnerSwitchRate: settings.cannibalizationMinimumSwitchRate,
    })
      .slice(0, 100)
      .map((row, index) => ({ id: index + 1, ...row }));

    const currentTotals = aggregateMetrics(
      dailyTotals
        .filter((row) => row.date >= currentStart && row.date <= currentEnd)
        .map((row) => ({ key: row.date, current: row, previous: row })),
      "current",
    );
    const previousTotals = aggregateMetrics(
      dailyTotals
        .filter((row) => row.date >= previousStart && row.date <= previousEnd)
        .map((row) => ({ key: row.date, current: row, previous: row })),
      "previous",
    );

    return Response.json({
      success: true,
      site: {
        slug: configuration.site.slug,
        name: configuration.site.name,
        baseUrl: configuration.site.base_url,
      },
      meta: {
        currentStart,
        currentEnd,
        previousStart,
        previousEnd,
        calibrationStart,
        calibrationEnd,
        coverage: {
          current: currentCoverage,
          previous: previousCoverage,
          yearOverYear: yearOverYearCoverage,
          minimumRequired: settings.minimumDataCoverage,
        },
        ctrSegmentedByDevice: currentQueryDevices.length > 0,
        yearOverYear: {
          start: yearOverYearWindow.previousStart,
          end: yearOverYearWindow.previousEnd,
          available: yearOverYearCoverage >= settings.minimumDataCoverage,
        },
        peakComparison: {
          start: peakStart,
          end: peakEnd,
          latestMonth: peakEnd.slice(0, 7),
          coverage: peakCoverage,
          available: peakCoverage >= settings.minimumDataCoverage,
        },
        queryDetailMayBeIncomplete: true,
        warning:
          "Google ممکن است هنگام گروه‌بندی بر اساس query/page بخشی از ردیف‌های کم‌حجم را حذف کند؛ آمار کل از جدول totals محاسبه شده است.",
      },
      data: {
        chartData: buildChartData(dailyTotals, window, days),
        totals: legacyRow({ key: "totals", current: currentTotals, previous: previousTotals }),
        queries: queries.slice(0, 5_000).map((row) => legacyRow(row)),
        pages: pages.slice(0, 5_000).map((row) => legacyRow(row)),
        newRankings,
        contentGroups,
        topicClusters,
        cannibalizationData,
        strikingDistance,
        ctrBenchmark,
        contentDecay,
        contentDecaySeasonal,
        contentDecayPeak,
        zombies,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
