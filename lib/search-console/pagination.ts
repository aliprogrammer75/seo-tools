export const GSC_MAX_ROW_LIMIT = 25_000;

export type SearchAnalyticsDimension =
  | "query"
  | "page"
  | "country"
  | "device"
  | "date"
  | "hour"
  | "searchAppearance";

export type SearchAnalyticsType =
  | "web"
  | "image"
  | "video"
  | "news"
  | "discover"
  | "googleNews";

export interface SearchAnalyticsRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

export interface SearchAnalyticsRequest {
  startDate: string;
  endDate: string;
  dimensions?: SearchAnalyticsDimension[];
  type?: SearchAnalyticsType;
  dataState?: "final" | "all";
  aggregationType?: "auto" | "byPage" | "byProperty";
  rowLimit: number;
  startRow: number;
}

export interface SearchAnalyticsResponse {
  rows?: SearchAnalyticsRow[];
}

export type SearchAnalyticsPageFetcher = (
  request: SearchAnalyticsRequest,
) => Promise<SearchAnalyticsResponse>;

export interface FetchAllRowsOptions
  extends Omit<SearchAnalyticsRequest, "rowLimit" | "startRow"> {
  rowLimit?: number;
  maxPages?: number;
}

export async function fetchAllSearchAnalyticsRows(
  fetchPage: SearchAnalyticsPageFetcher,
  options: FetchAllRowsOptions,
): Promise<SearchAnalyticsRow[]> {
  const rowLimit = options.rowLimit ?? GSC_MAX_ROW_LIMIT;
  const maxPages = options.maxPages ?? 1_000;
  const { rowLimit: _rowLimit, maxPages: _maxPages, ...requestOptions } = options;

  if (!Number.isInteger(rowLimit) || rowLimit < 1 || rowLimit > GSC_MAX_ROW_LIMIT) {
    throw new RangeError(`rowLimit must be between 1 and ${GSC_MAX_ROW_LIMIT}`);
  }

  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new RangeError("maxPages must be a positive integer");
  }

  const rows: SearchAnalyticsRow[] = [];
  let startRow = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await fetchPage({
      ...requestOptions,
      dataState: options.dataState ?? "final",
      rowLimit,
      startRow,
    });
    const pageRows = response.rows ?? [];

    rows.push(...pageRows);

    if (pageRows.length < rowLimit) {
      return rows;
    }

    startRow += pageRows.length;
  }

  throw new Error(
    `Search Console pagination exceeded ${maxPages} pages; import stopped safely`,
  );
}
