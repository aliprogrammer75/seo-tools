import assert from "node:assert/strict";
import test from "node:test";

import {
  createServiceAccountAssertion,
  GoogleAccessTokenProvider,
} from "../lib/google/service-account.ts";

function toPem(pkcs8: ArrayBuffer): string {
  const bytes = new Uint8Array(pkcs8);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary).match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----\n`;
}

function decodeJwtPart(part: string): Record<string, unknown> {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  return JSON.parse(atob(padded)) as Record<string, unknown>;
}

test("creates a correctly scoped RS256 service-account assertion", async () => {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const privateKey = toPem(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  const email = "seo-tools-reader@seo-tools-internal.iam.gserviceaccount.com";
  const assertion = await createServiceAccountAssertion(
    { clientEmail: email, privateKey },
    1_700_000_000,
  );
  const [encodedHeader, encodedClaims] = assertion.split(".");
  const header = decodeJwtPart(encodedHeader);
  const claims = decodeJwtPart(encodedClaims);

  assert.equal(header.alg, "RS256");
  assert.equal(claims.iss, email);
  assert.equal(claims.scope, "https://www.googleapis.com/auth/webmasters.readonly");
  assert.equal(claims.iat, 1_700_000_000);
  assert.equal(claims.exp, 1_700_003_600);
});

test("caches Google access tokens until shortly before expiry", async () => {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const privateKey = toPem(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  let requestCount = 0;
  const fetchMock: typeof fetch = async () => {
    requestCount += 1;
    return Response.json({
      access_token: `token-${requestCount}`,
      expires_in: 3_600,
      token_type: "Bearer",
    });
  };
  const provider = new GoogleAccessTokenProvider(
    {
      clientEmail: "seo-tools-reader@seo-tools-internal.iam.gserviceaccount.com",
      privateKey,
    },
    fetchMock,
    () => 1_700_000_000,
  );

  assert.equal(await provider.getAccessToken(), "token-1");
  assert.equal(await provider.getAccessToken(), "token-1");
  assert.equal(requestCount, 1);
});
