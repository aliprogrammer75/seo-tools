const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SEARCH_CONSOLE_READONLY_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly";

export interface ServiceAccountCredentials {
  clientEmail: string;
  privateKey: string;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeJson(value: unknown): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function privateKeyToPkcs8(privateKey: string): ArrayBuffer {
  const normalized = privateKey.replace(/\\n/g, "\n").trim();
  const base64 = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");

  if (!base64) {
    throw new Error("Google service-account private key is empty or invalid");
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

export async function createServiceAccountAssertion(
  credentials: ServiceAccountCredentials,
  issuedAtSeconds = Math.floor(Date.now() / 1_000),
): Promise<string> {
  if (!credentials.clientEmail.endsWith(".iam.gserviceaccount.com")) {
    throw new Error("Invalid Google service-account email");
  }

  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const claims = encodeJson({
    iss: credentials.clientEmail,
    scope: SEARCH_CONSOLE_READONLY_SCOPE,
    aud: GOOGLE_TOKEN_ENDPOINT,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + 3_600,
  });
  const unsignedToken = `${header}.${claims}`;
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyToPkcs8(credentials.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
  );

  return `${unsignedToken}.${toBase64Url(new Uint8Array(signature))}`;
}

export class GoogleAccessTokenProvider {
  private cachedToken?: CachedToken;
  private readonly credentials: ServiceAccountCredentials;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(
    credentials: ServiceAccountCredentials,
    fetchImpl: typeof fetch = fetch,
    now: () => number = () => Math.floor(Date.now() / 1_000),
  ) {
    this.credentials = credentials;
    this.fetchImpl = fetchImpl;
    this.now = now;
  }

  async getAccessToken(): Promise<string> {
    const now = this.now();

    if (this.cachedToken && this.cachedToken.expiresAt - 60 > now) {
      return this.cachedToken.value;
    }

    const assertion = await createServiceAccountAssertion(this.credentials, now);
    const response = await this.fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 1_000);
      throw new Error(`Google token request failed (${response.status}): ${body}`);
    }

    const token = (await response.json()) as GoogleTokenResponse;

    if (!token.access_token || !Number.isFinite(token.expires_in)) {
      throw new Error("Google token response is missing access_token or expires_in");
    }

    this.cachedToken = {
      value: token.access_token,
      expiresAt: now + token.expires_in,
    };

    return token.access_token;
  }
}
