import type { AppEnv } from "../db/d1.ts";
import { D1SyncRepository } from "../db/sync-repository.ts";
import type { SiteRecord } from "../db/sites.ts";
import { googleAccessToken } from "../auth/oauth.ts";
import { GoogleAccessTokenProvider } from "../google/service-account.ts";
import { SearchConsoleClient } from "../search-console/client.ts";
import { importSearchConsoleDay, type ImportDayResult } from "./import-day.ts";
import type { SyncRequestedBy } from "./types.ts";

export async function importSiteDay(input: {
  env: AppEnv;
  site: SiteRecord;
  date: string;
  requestedBy: SyncRequestedBy;
}): Promise<ImportDayResult> {
  const linked=await input.env.DB.prepare("SELECT user_id FROM site_gsc_sources WHERE site_id=?").bind(input.site.id).first<{user_id:string}>();
  if (!linked) throw new Error("Assign a connected Google account to this site first");
  const getAccessToken=()=>googleAccessToken(input.env,linked.user_id);
  const searchConsole = new SearchConsoleClient({
    propertyUrl: input.site.gsc_property_url,
    getAccessToken,
  });

  return importSearchConsoleDay({
    site: input.site,
    date: input.date,
    requestedBy: input.requestedBy,
    repository: new D1SyncRepository(input.env.DB),
    searchConsole,
  });
}
