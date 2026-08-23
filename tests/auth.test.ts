import test from "node:test";
import assert from "node:assert/strict";

import type { AppEnv } from "../lib/db/d1.ts";
import { requireCronAuthorization, requireInternalIdentity } from "../lib/http/auth.ts";

const env = {
  APP_ENV: "production",
  CRON_SECRET: "a-long-random-secret",
} as AppEnv;

function accessAssertion(email: string, exp = Math.floor(Date.now() / 1000) + 300): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ email, exp })}.signature`;
}

test("requires both Cloudflare Access identity headers in production", () => {
  const request = new Request("https://seo.example.com/api/sites", {
    headers: {
      "cf-access-authenticated-user-email": "owner@example.com",
      "cf-access-jwt-assertion": accessAssertion("owner@example.com"),
    },
  });

  assert.deepEqual(requireInternalIdentity(request, env), { email: "owner@example.com" });
  assert.throws(
    () => requireInternalIdentity(new Request("https://seo.example.com/api/sites"), env),
    /Cloudflare Access/,
  );
});

test("rejects malformed, mismatched, and expired Access assertions", () => {
  const base = "https://seo.example.com/api/sites";
  const cases = [
    "not-a-jwt",
    accessAssertion("other@example.com"),
    accessAssertion("owner@example.com", Math.floor(Date.now() / 1000) - 1),
  ];

  for (const assertion of cases) {
    assert.throws(
      () =>
        requireInternalIdentity(
          new Request(base, {
            headers: {
              "cf-access-authenticated-user-email": "owner@example.com",
              "cf-access-jwt-assertion": assertion,
            },
          }),
          env,
        ),
      /Cloudflare Access/,
    );
  }
});

test("allows the explicit local-development bypass only on localhost", () => {
  const localEnv = { ...env, APP_ENV: "development" } as AppEnv;
  assert.equal(
    requireInternalIdentity(new Request("http://localhost:3000/api/sites"), localEnv).email,
    "local-development",
  );
  assert.throws(
    () => requireInternalIdentity(new Request("https://seo.example.com/api/sites"), localEnv),
    /Cloudflare Access/,
  );
});

test("validates the cron bearer secret without partial matches", () => {
  assert.doesNotThrow(() =>
    requireCronAuthorization(
      new Request("https://seo.example.com/api/sync", {
        headers: { authorization: "Bearer a-long-random-secret" },
      }),
      env,
    ),
  );
  assert.throws(
    () =>
      requireCronAuthorization(
        new Request("https://seo.example.com/api/sync", {
          headers: { authorization: "Bearer a-long-random" },
        }),
        env,
      ),
    /سینک/,
  );
});
