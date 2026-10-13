import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import type { AppEnv } from "../lib/db/d1.ts";
import { requireCronAuthorization, requireInternalIdentity } from "../lib/http/auth.ts";

const domain = "https://seo-tool-tests.cloudflareaccess.com";
const aud = "testing-application-audience";
const env = {
  APP_ENV: "production",
  CRON_SECRET: "a-long-random-secret",
  TEAM_DOMAIN: domain,
  POLICY_AUD: aud,
} as AppEnv;

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: "jwk" }), kid: "key-for-tests", alg: "RS256", use: "sig" };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  if (String(input) === domain + "/cdn-cgi/access/certs") {
    return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 });
  }
  throw new Error("Unexpected fetch in authentication tests");
}) as typeof fetch;

function accessAssertion(email: string, overrides: Record<string, unknown> = {}, signatureValid = true): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", kid: "key-for-tests", typ: "JWT" });
  const claims = encode({
    email,
    iss: domain,
    aud: [aud],
    exp: Math.floor(Date.now() / 1000) + 300,
    nbf: Math.floor(Date.now() / 1000) - 10,
    ...overrides,
  });
  const body = header + "." + claims;
  const signature = sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url");
  return body + "." + (signatureValid ? signature : "forgedsignature");
}
function request(token?: string, email?: string): Request {
  const headers: Record<string, string> = {};
  if (token) headers["cf-access-jwt-assertion"] = token;
  if (email) headers["cf-access-authenticated-user-email"] = email;
  return new Request("https://seo.example.com/api/sites", { headers });
}

test("accepts only a cryptographically valid Cloudflare Access identity", async () => {
  const identity = await requireInternalIdentity(request(accessAssertion("owner@example.com"), "owner@example.com"), env);
  assert.deepEqual(identity, { email: "owner@example.com" });
  await assert.rejects(requireInternalIdentity(request(), env), /Cloudflare Access/);
});

test("rejects forged, mismatched, expired, wrong audience and issuer assertions", async () => {
  const attempts = [
    request(accessAssertion("owner@example.com", {}, false)),
    request(accessAssertion("owner@example.com"), "other@example.com"),
    request(accessAssertion("owner@example.com", { exp: Math.floor(Date.now() / 1000) - 1 })),
    request(accessAssertion("owner@example.com", { aud: ["another-app"] })),
    request(accessAssertion("owner@example.com", { iss: "https://evil.example.com" })),
    request("not-a-jwt"),
  ];
  for (const candidate of attempts) {
    await assert.rejects(requireInternalIdentity(candidate, env), /Cloudflare Access/);
  }
});

test("allows development bypass only on localhost", async () => {
  const local = { ...env, APP_ENV: "development" } as AppEnv;
  assert.equal((await requireInternalIdentity(new Request("http://localhost:3000/api/sites"), local)).email, "local-development");
  await assert.rejects(requireInternalIdentity(request(), local), /Cloudflare Access/);
});

test("rejects missing Cloudflare configuration", async () => {
  await assert.rejects(requireInternalIdentity(request(accessAssertion("owner@example.com")), { ...env, POLICY_AUD: "" }), /Cloudflare Access/);
});

test("validates the cron bearer secret without partial matches", () => {
  assert.doesNotThrow(() => requireCronAuthorization(new Request("https://seo.example.com/api/sync", {
    headers: { authorization: "Bearer a-long-random-secret" },
  }), env));
  assert.throws(() => requireCronAuthorization(new Request("https://seo.example.com/api/sync", {
    headers: { authorization: "Bearer a-long-random" },
  }), env), /سینک/);
});
process.on("exit", () => { globalThis.fetch = realFetch; });
