import { listActiveSites } from "@/lib/db/sites.ts";
import { errorResponse } from "@/lib/http/api-error.ts";
import { requireCronAuthorization } from "@/lib/http/auth.ts";
import { getAppEnv } from "@/lib/runtime/cloudflare.ts";
import { latestFinalSearchConsoleDate } from "@/lib/sync/date.ts";
import { importSiteDay } from "@/lib/sync/runtime.ts";

export const dynamic = "force-dynamic";

interface SiteSyncResult {
  siteSlug: string;
  success: boolean;
  status?: "completed" | "skipped";
  importedRows?: number;
  error?: string;
}

function publicErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown sync error").slice(0, 500);
}

async function handleSync(request: Request): Promise<Response> {
  try {
    const env = await getAppEnv();
    requireCronAuthorization(request, env);
    const date = latestFinalSearchConsoleDate();
    const sites = await listActiveSites(env.DB);
    const results: SiteSyncResult[] = [];

    for (const site of sites) {
      try {
        const result = await importSiteDay({ env, site, date, requestedBy: "cron" });
        results.push({
          siteSlug: site.slug,
          success: true,
          status: result.status,
          importedRows: result.importedRows,
        });
      } catch (error) {
        console.error("Scheduled Search Console sync failed", { site: site.slug, date, error });
        results.push({ siteSlug: site.slug, success: false, error: publicErrorMessage(error) });
      }
    }

    const failed = results.filter((result) => !result.success).length;
    return Response.json(
      {
        success: failed === 0,
        date,
        siteCount: sites.length,
        failed,
        results,
      },
      { status: failed === 0 ? 200 : 207 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = handleSync;
export const POST = handleSync;
