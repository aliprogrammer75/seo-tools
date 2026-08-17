import { getSiteConfiguration } from "@/lib/db/sites.ts";
import { ApiError, errorResponse } from "@/lib/http/api-error.ts";
import { requireInternalIdentity } from "@/lib/http/auth.ts";
import { getAppEnv } from "@/lib/runtime/cloudflare.ts";
import { assertIsoDate } from "@/lib/sync/import-day.ts";
import { importSiteDay } from "@/lib/sync/runtime.ts";

export const dynamic = "force-dynamic";

interface ImportRequestBody {
  siteSlug?: unknown;
  date?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const env = await getAppEnv();
    const identity = requireInternalIdentity(request, env);
    const body = (await request.json().catch(() => null)) as ImportRequestBody | null;

    if (!body || typeof body.siteSlug !== "string" || typeof body.date !== "string") {
      throw new ApiError(
        400,
        "INVALID_IMPORT_REQUEST",
        "نام سایت و تاریخ با فرمت YYYY-MM-DD الزامی است.",
      );
    }

    assertIsoDate(body.date);
    const configuration = await getSiteConfiguration(env.DB, body.siteSlug);

    if (!configuration || configuration.site.status !== "active") {
      throw new ApiError(404, "SITE_NOT_FOUND", "سایت فعال موردنظر پیدا نشد.");
    }

    console.info("Manual Search Console import requested", {
      site: configuration.site.slug,
      date: body.date,
      actor: identity.email,
    });

    const result = await importSiteDay({
      env,
      site: configuration.site,
      date: body.date,
      requestedBy: "manual",
    });

    return Response.json({
      success: true,
      message:
        result.status === "skipped"
          ? `دادهٔ ${body.date} قبلاً کامل ذخیره شده بود.`
          : `دادهٔ ${body.date} با ${result.importedRows.toLocaleString("fa-IR")} ردیف ذخیره شد.`,
      result,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Date ")) {
      return errorResponse(
        new ApiError(400, "INVALID_DATE", "تاریخ باید معتبر و با فرمت YYYY-MM-DD باشد."),
      );
    }
    return errorResponse(error);
  }
}
