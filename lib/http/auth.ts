import type { AppEnv } from "../db/d1.ts";
import { ApiError } from "./api-error.ts";

export interface InternalIdentity {
  email: string;
}

interface AccessJwtClaims {
  email?: unknown;
  exp?: unknown;
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

  if (!email || !assertion || !hasValidAccessClaims(assertion, email)) {
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

function decodeAccessJwtClaims(assertion: string): AccessJwtClaims | null {
  const segments = assertion.split(".");
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
    return null;
  }

  try {
    const normalized = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as AccessJwtClaims;
  } catch {
    return null;
  }
}

function hasValidAccessClaims(assertion: string, email: string): boolean {
  const claims = decodeAccessJwtClaims(assertion);
  if (!claims || claims.email !== email) return false;

  if (claims.exp !== undefined) {
    const expiry = Number(claims.exp);
    if (!Number.isFinite(expiry) || expiry <= Math.floor(Date.now() / 1000)) {
      return false;
    }
  }

  return true;
}

export function requireCronAuthorization(request: Request, env: AppEnv): void {
  const authorization = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.CRON_SECRET}`;

  if (!constantTimeEqual(authorization, expected)) {
    throw new ApiError(401, "INVALID_CRON_SECRET", "دسترسی اجرای سینک معتبر نیست.");
  }
}
