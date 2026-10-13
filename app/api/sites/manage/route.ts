import { getAppEnv } from "@/lib/runtime/cloudflare.ts";
import { requireInternalIdentity } from "@/lib/http/auth.ts";
import { errorResponse } from "@/lib/http/api-error.ts";
import { assertSameOrigin, parseSiteCreate, parseSiteUpdate } from "@/lib/sites/admin.ts";
import { createManagedSite, listManagedSites, updateManagedSite } from "@/lib/db/site-management.ts";
import { getSiteConfiguration } from "@/lib/db/sites.ts";
import { ApiError } from "@/lib/http/api-error.ts";

export const dynamic = "force-dynamic";

async function authorized(request: Request) {
  const env = await getAppEnv();
  await requireInternalIdentity(request, env);
  return env;
}
export async function GET(request: Request) {
  try {
    const env = await authorized(request);
    const sites = await listManagedSites(env.DB);
    return Response.json({ success: true, sites });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const env = await authorized(request);
    assertSameOrigin(request);
    const body = await request.json().catch(() => null);
    const input = parseSiteCreate(body);
    const site = await createManagedSite(env.DB, input);
    return Response.json({ success: true, site: site.site, message: "سایت در وضعیت توقف ثبت شد. ابتدا دسترسی سرچ کنسول را بررسی کنید." }, {status: 201});
  } catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request) {
  try {
    const env = await authorized(request);
    assertSameOrigin(request);
    const body = await request.json().catch(() => null);
    const slug = body && typeof body === "object" && !Array.isArray(body) && typeof body.slug === "string" ? body.slug : "";
    const existing = await getSiteConfiguration(env.DB, slug);
    if (!existing) throw new ApiError(404, "SITE_NOT_FOUND", "سایت وجود ندارد.");
    const input = parseSiteUpdate(body, existing.site.base_url);
    if (input.status === "active") {
      throw new ApiError(409, "VERIFY_REQUIRED", "فعال‌سازی باید پس از تأیید دسترسی Google Search Console انجام شود.");
    }
    const site = await updateManagedSite(env.DB, input);
    return Response.json({ success: true, site: site.site });
  } catch (error) { return errorResponse(error); }
}
