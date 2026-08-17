const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

function retryAfterMilliseconds(response: Response, now = Date.now()): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
  options: RetryOptions = {},
): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 8_000;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer");
  }

  let lastNetworkError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(input, init);
      const shouldRetry = RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxAttempts;

      if (!shouldRetry) return response;

      const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delay = retryAfterMilliseconds(response) ?? exponentialDelay;
      await sleep(Math.min(delay, maxDelayMs));
    } catch (error) {
      lastNetworkError = error;
      if (attempt === maxAttempts) throw error;

      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      await sleep(delay);
    }
  }

  throw lastNetworkError ?? new Error("Request failed after all retry attempts");
}
