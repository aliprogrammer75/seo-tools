import type { AppEnv } from "../db/d1.ts";
import { ApiError } from "./api-error.ts";

export interface InternalIdentity {
  email: string;
}

function isLocalDevelopment(request: Request, env: AppEnv): boolean {
  const hostname = new URL(request.url).hostname;
  return (
    env.APP_ENV === "development" &&
    (hostname === "localhost" || hostname === "127.0.0.1")
  );
}

export function requireInternalIdentity(
  request: Request,
  env: AppEnv,
): InternalIdentity {
  if (isLocalDevelopment(request, env)) return { email: "local-development" };

  const email = request.headers.get("cf-access-authenticated-user-email")?.trim();
  const assertion = request.headers.get("cf-access-jwt-assertion")?.trim();

  if (!email || !assertion) {
    throw new ApiError(
      401,
      "ACCESS_REQUIRED",
      "ورود از طریق Cloudflare Access الزامی است.",
    );
  }

  return { email };
}

function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return difference === 0;
}

export function requireCronAuthorization(request: Request, env: AppEnv): void {
  const authorization = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.CRON_SECRET}`;

  if (!constantTimeEqual(authorization, expected)) {
    throw new ApiError(401, "INVALID_CRON_SECRET", "دسترسی اجرای سینک معتبر نیست.");
  }
}
