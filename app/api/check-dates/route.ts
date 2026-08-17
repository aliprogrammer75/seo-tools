import { getSiteConfiguration } from "@/lib/db/sites.ts";
import { ApiError, errorResponse } from "@/lib/http/api-error.ts";
import { requireInternalIdentity } from "@/lib/http/auth.ts";
import { getAppEnv } from "@/lib/runtime/cloudflare.ts";
import { expectedDateRange, latestFinalSearchConsoleDate } from "@/lib/sync/date.ts";

export const dynamic = "force-dynamic";

interface CompletedDateRow {
  data_date: string;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const env = await getAppEnv();
    requireInternalIdentity(request, env);
    const url = new URL(request.url);
    const siteSlug = url.searchParams.get("site")?.trim();
    const days = Number(url.searchParams.get("days") ?? "120");

    if (!siteSlug) {
      throw new ApiError(400, "SITE_REQUIRED", "انتخاب سایت الزامی است.");
    }
    if (!Number.isInteger(days) || days < 1 || days > 489) {
      throw new ApiError(400, "INVALID_RANGE", "بازه باید بین ۱ تا ۴۸۹ روز باشد.");
    }

    const configuration = await getSiteConfiguration(env.DB, siteSlug);
    if (!configuration || configuration.site.status !== "active") {
      throw new ApiError(404, "SITE_NOT_FOUND", "سایت فعال موردنظر پیدا نشد.");
    }

    const endDate = latestFinalSearchConsoleDate();
    const expectedDates = expectedDateRange(endDate, days);
    const startDate = expectedDates[0];
    const result = await env.DB
      .prepare(
        `SELECT data_date
         FROM sync_runs
         WHERE site_id = ? AND search_type = ? AND status = 'completed'
           AND data_date BETWEEN ? AND ?
         ORDER BY data_date ASC`,
      )
      .bind(
        configuration.site.id,
        configuration.site.default_search_type,
        startDate,
        endDate,
      )
      .all<CompletedDateRow>();

    if (!result.success) throw new Error(result.error ?? "Could not scan completed dates");
    const existingDates = new Set((result.results ?? []).map((row) => row.data_date));
    const missingDates = expectedDates.filter((date) => !existingDates.has(date));

    return Response.json({
      success: true,
      site: { slug: configuration.site.slug, name: configuration.site.name },
      range: { startDate, endDate, days },
      missingDates,
      existingCount: expectedDates.length - missingDates.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
