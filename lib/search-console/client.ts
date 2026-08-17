import {
  fetchAllSearchAnalyticsRows,
  type FetchAllRowsOptions,
  type SearchAnalyticsRequest,
  type SearchAnalyticsResponse,
  type SearchAnalyticsRow,
} from "./pagination.ts";
import { fetchWithRetry, type RetryOptions } from "./retry.ts";

export class SearchConsoleApiError extends Error {
  readonly status: number;
  readonly responseBody: string;

  constructor(
    status: number,
    responseBody: string,
  ) {
    super(`Search Console API request failed with status ${status}`);
    this.name = "SearchConsoleApiError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

export interface SearchConsoleClientOptions {
  propertyUrl: string;
  getAccessToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
  retry?: RetryOptions;
}

export class SearchConsoleClient {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly options: SearchConsoleClientOptions;

  constructor(options: SearchConsoleClientOptions) {
    this.options = options;
    this.endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
      options.propertyUrl,
    )}/searchAnalytics/query`;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async queryAll(options: FetchAllRowsOptions): Promise<SearchAnalyticsRow[]> {
    return fetchAllSearchAnalyticsRows(
      (request) => this.queryPage(request),
      options,
    );
  }

  async queryPage(request: SearchAnalyticsRequest): Promise<SearchAnalyticsResponse> {
    const accessToken = await this.options.getAccessToken();
    const response = await fetchWithRetry(
      this.endpoint,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
      },
      this.fetchImpl,
      this.options.retry,
    );

    if (!response.ok) {
      const responseBody = (await response.text()).slice(0, 2_000);
      throw new SearchConsoleApiError(response.status, responseBody);
    }

    return (await response.json()) as SearchAnalyticsResponse;
  }
}
