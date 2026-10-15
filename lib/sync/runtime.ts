import type { AppEnv } from "../db/d1.ts";
import { D1SyncRepository } from "../db/sync-repository.ts";
import type { SiteRecord } from "../db/sites.ts";
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
  const tokens = new GoogleAccessTokenProvider({
    clientEmail: input.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: input.env.GOOGLE_PRIVATE_KEY,
  });
  const searchConsole = new SearchConsoleClient({
    propertyUrl: input.site.gsc_property_url,
    getAccessToken: () => tokens.getAccessToken(),
  });

  return importSearchConsoleDay({
    site: input.site,
    date: input.date,
    requestedBy: input.requestedBy,
    repository: new D1SyncRepository(input.env.DB),
    searchConsole,
  });
}
