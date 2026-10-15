/**
 * Server-only Cloudflare D1 REST client. All user values must be sent as params,
 * never interpolated into SQL.
 */
import 'server-only';

type Bind = string | number | null;
type D1Result<T> = { results?: T[]; success?: boolean; error?: string };
type D1Body<T> = { success?: boolean; errors?: Array<{ message?: string }>; result?: Array<D1Result<T>> };

export async function d1Query<T = Record<string, unknown>>(
  sql: string,
  params: Bind[] = [],
): Promise<T[]> {
  const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID, CLOUDFLARE_API_TOKEN } = process.env;
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_DATABASE_ID || !CLOUDFLARE_API_TOKEN) {
    throw new Error('Cloudflare D1 environment variables are not configured.');
  }
  const endpoint = 'https://api.cloudflare.com/client/v4/accounts/' +
    encodeURIComponent(CLOUDFLARE_ACCOUNT_ID) + '/d1/database/' +
    encodeURIComponent(CLOUDFLARE_DATABASE_ID) + '/query';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + CLOUDFLARE_API_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
    cache: 'no-store',
  });
  const body = (await response.json()) as D1Body<T>;
  if (!response.ok || !body.success || body.result?.[0]?.success === false) {
    throw new Error('D1 request failed: ' + (body.errors?.[0]?.message || response.status));
  }
  return body.result?.[0]?.results ?? [];
}
