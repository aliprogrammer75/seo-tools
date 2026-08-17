import { listActiveSites } from "@/lib/db/sites.ts";
import { errorResponse } from "@/lib/http/api-error.ts";
import { requireInternalIdentity } from "@/lib/http/auth.ts";
import { getAppEnv } from "@/lib/runtime/cloudflare.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const env = await getAppEnv();
    requireInternalIdentity(request, env);
    const sites = await listActiveSites(env.DB);

    return Response.json({
      success: true,
      sites: sites.map((site) => ({
        slug: site.slug,
        name: site.name,
        propertyUrl: site.gsc_property_url,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
