import { listActiveSites } from "@/lib/db/sites.ts";
import { errorResponse } from "@/lib/http/api-error.ts";
import { requireInternalIdentity } from "@/lib/http/auth.ts";
import { session } from "@/lib/auth/session.ts";
import { getAppEnv } from "@/lib/runtime/cloudflare.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const env = await getAppEnv();
    const identity = await session(request, env);
    const sites = await listActiveSites(env.DB);
    const visible = identity.isAdmin ? null : await env.DB.prepare(
      "SELECT site_id FROM site_memberships WHERE user_id = ?"
    ).bind(identity.id).all<{site_id:number}>();
    const ids = new Set(identity.isAdmin ? sites.map(s=>s.id) : (visible?.results||[]).map(r=>r.site_id));

    return Response.json({
      success: true,
      sites: sites.filter(site=>ids.has(site.id)).map((site) => ({
        slug: site.slug,
        name: site.name,
        baseUrl: site.base_url,
        propertyUrl: site.gsc_property_url,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
