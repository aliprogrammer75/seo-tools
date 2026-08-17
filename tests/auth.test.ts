import test from "node:test";
import assert from "node:assert/strict";

import type { AppEnv } from "../lib/db/d1.ts";
import { requireCronAuthorization, requireInternalIdentity } from "../lib/http/auth.ts";

const env = {
  APP_ENV: "production",
  CRON_SECRET: "a-long-random-secret",
} as AppEnv;

test("requires both Cloudflare Access identity headers in production", () => {
  const request = new Request("https://seo.example.com/api/sites", {
    headers: {
      "cf-access-authenticated-user-email": "owner@example.com",
      "cf-access-jwt-assertion": "signed-access-token",
    },
  });

  assert.deepEqual(requireInternalIdentity(request, env), { email: "owner@example.com" });
  assert.throws(
    () => requireInternalIdentity(new Request("https://seo.example.com/api/sites"), env),
    /Cloudflare Access/,
  );
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
