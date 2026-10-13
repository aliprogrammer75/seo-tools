import type { AppEnv } from "../db/d1.ts";
import { ApiError } from "./api-error.ts";

export interface InternalIdentity { email: string }

interface AccessPayload { email?: unknown; aud?: unknown; iss?: unknown; exp?: unknown; nbf?: unknown }
interface AccessHeader { alg?: unknown; kid?: unknown }
interface JwkSet { keys?: JsonWebKey[] }
const cachedKeys = new Map<string, { keys: JsonWebKey[]; expires: number }>();

function rejectAccess(): never {
  throw new ApiError(401, "ACCESS_REQUIRED", "ورود معتبر از طریق Cloudflare Access الزامی است.");
}

function teamDomain(env: AppEnv): string {
  const domain = env.TEAM_DOMAIN;
  if (!domain || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain)) {
    throw new ApiError(503, "ACCESS_CONFIG", "پیکربندی دامنه Cloudflare Access معتبر نیست.");
  }
  return domain;
}

function decodeSegment<T>(value: string): T {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return JSON.parse(atob(padded)) as T;
}

function signatureBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function signingKeys(domain: string): Promise<JsonWebKey[]> {
  const cached = cachedKeys.get(domain);
  if (cached && cached.expires > Date.now()) return cached.keys;
  const response = await fetch(domain + "/cdn-cgi/access/certs", {
    signal: AbortSignal.timeout(5000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("Cloudflare key fetch failed");
  const jwks = (await response.json()) as JwkSet;
  if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) throw new Error("No signing keys available");
  const keys = jwks.keys.filter((key) => key.kty === "RSA" && key.n && key.e);
  if (!keys.length) throw new Error("No trusted RSA keys available");
  cachedKeys.set(domain, { keys, expires: Date.now() + 300_000 });
  return keys;
}

export async function requireInternalIdentity(request: Request, env: AppEnv): Promise<InternalIdentity> {
  const hostname = new URL(request.url).hostname;
  if (env.APP_ENV === "development" && (hostname === "localhost" || hostname === "127.0.0.1")) {
    return { email: "local-development" };
  }

  const assertion = request.headers.get("cf-access-jwt-assertion")?.trim();
  if (!assertion || !env.POLICY_AUD) return rejectAccess();
  const domain = teamDomain(env);
  const segments = assertion.split(".");
  if (segments.length !== 3 || segments.some((segment) => !segment)) return rejectAccess();

  try {
    const header = decodeSegment<AccessHeader>(segments[0]);
    const claims = decodeSegment<AccessPayload>(segments[1]);
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "RS256" || typeof header.kid !== "string" ||
      typeof claims.email !== "string" || !claims.email ||
      claims.iss !== domain ||
      !(Array.isArray(claims.aud) ? claims.aud.includes(env.POLICY_AUD) : claims.aud === env.POLICY_AUD) ||
      typeof claims.exp !== "number" || claims.exp <= now ||
      (typeof claims.nbf === "number" && claims.nbf > now)) return rejectAccess();

    const keys = await signingKeys(domain);
    const candidates = keys.filter((key) => key.kid === header.kid);
    if (!candidates.length) return rejectAccess();
    const payload = new TextEncoder().encode(segments[0] + "." + segments[1]);
    const signature = signatureBytes(segments[2]);
    for (const jwk of candidates) {
      const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
      if (await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, payload)) {
        const emailHeader = request.headers.get("cf-access-authenticated-user-email");
        if (emailHeader && emailHeader.trim().toLowerCase() !== claims.email.toLowerCase()) return rejectAccess();
        return { email: claims.email };
      }
    }
    return rejectAccess();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return rejectAccess();
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
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
