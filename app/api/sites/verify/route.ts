import { getAppEnv } from "@/lib/runtime/cloudflare.ts";
import { requireInternalIdentity } from "@/lib/http/auth.ts";
import { errorResponse, ApiError } from "@/lib/http/api-error.ts";
import { assertSameOrigin } from "@/lib/sites/admin.ts";
import { getSiteConfiguration } from "@/lib/db/sites.ts";
import { GoogleAccessTokenProvider } from "@/lib/google/service-account.ts";
import { SearchConsoleClient, SearchConsoleApiError } from "@/lib/search-console/client.ts";
import { latestFinalSearchConsoleDate } from "@/lib/sync/date.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const env = await getAppEnv();
    await requireInternalIdentity(request, env);
    assertSameOrigin(request);
    const body = await request.json().catch(() => null) as {slug?: unknown; activate?: unknown} | null;
    if (!body || typeof body.slug !== "string" || !/^[a-z][a-z0-9-]{2,47}$/.test(body.slug) ||
      (body.activate !== undefined && typeof body.activate !== "boolean")) {
      throw new ApiError(400, "INVALID_VERIFY", "شناسه سایت یا گزینه فعال‌سازی نامعتبر است.");
    }
    const configuration = await getSiteConfiguration(env.DB, body.slug);
    if (!configuration || configuration.site.status === "archived") throw new ApiError(404, "SITE_NOT_FOUND", "سایت پیدا نشد.");
    const tokens = new GoogleAccessTokenProvider({
      clientEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      privateKey: env.GOOGLE_PRIVATE_KEY,
    });
    const client = new SearchConsoleClient({
      propertyUrl: configuration.site.gsc_property_url,
      getAccessToken: () => tokens.getAccessToken(),
    });
    const date = latestFinalSearchConsoleDate();
    try {
      await client.queryPage({ startDate: date, endDate: date, dimensions: ["date"], rowLimit: 1, startRow: 0, type: configuration.site.default_search_type, dataState: "final" });
    } catch (error) {
      if (error instanceof SearchConsoleApiError && (error.status === 403 || error.status === 404)) {
        throw new ApiError(403, "GSC_ACCESS_DENIED", "سرویس‌اکانت به پراپرتی سرچ کنسول دسترسی ندارد یا پراپرتی ثبت نشده است.");
      }
      throw error;
    }
    if (body.activate === true) {
      const updated = await env.DB.prepare(
        "UPDATE sites SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('paused', 'active')"
      ).bind(configuration.site.id).run();
      if (!updated.success) throw new Error(updated.error ?? "Site activation failed");
    }
    return Response.json({
      success: true, verified: true, activated: body.activate === true,
      site: configuration.site.slug, propertyUrl: configuration.site.gsc_property_url,
      date, message: "دسترسی به سرچ کنسول با موفقیت بررسی شد.",
    });
  } catch(error) { return errorResponse(error); }
}
