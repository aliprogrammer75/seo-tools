import { getCloudflareContext } from "@opennextjs/cloudflare";

import type { AppEnv } from "../db/d1.ts";

function requireString(env: Record<string, unknown>, name: keyof AppEnv): string {
  const value = env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing Cloudflare binding: ${String(name)}`);
  }
  return value;
}

export async function getAppEnv(): Promise<AppEnv> {
  const { env } = await getCloudflareContext({ async: true });
  const values = env as unknown as Record<string, unknown>;

  if (!values.DB || typeof values.DB !== "object") {
    throw new Error("Missing Cloudflare D1 binding: DB");
  }

  return {
    DB: values.DB as AppEnv["DB"],
    GOOGLE_SERVICE_ACCOUNT_EMAIL: requireString(values, "GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    GOOGLE_PRIVATE_KEY: requireString(values, "GOOGLE_PRIVATE_KEY"),
    CRON_SECRET: requireString(values, "CRON_SECRET"),
    APP_ENV: values.APP_ENV === "development" ? "development" : "production",
  };
}
