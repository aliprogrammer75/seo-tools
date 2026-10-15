export type BrandType = "site" | "product";

export interface BrandTerm {
  term: string;
  normalizedTerm?: string;
  brandType: BrandType;
}

export type ContentType =
  | "product"
  | "category"
  | "brand"
  | "article"
  | "article_archive"
  | "page"
  | "other";

export interface ContentRule {
  contentType: ContentType;
  matchType: "path_prefix" | "path_regex" | "sitemap_type";
  pattern: string;
  priority: number;
  isActive?: boolean;
}

const PERSIAN_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const SEPARATORS = /[\u200c\u200d\-_./\\]+/g;
const PUNCTUATION = /[^\p{L}\p{N}\s]+/gu;

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(PERSIAN_DIACRITICS, "")
    .replace(SEPARATORS, " ")
    .replace(PUNCTUATION, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fa");
}

function containsPhrase(query: string, phrase: string): boolean {
  return (` ${query} `).includes(` ${phrase} `);
}

export function classifyBrandQuery(
  query: string,
  terms: BrandTerm[],
): BrandType | "non_brand" {
  const normalizedQuery = normalizeSearchText(query);
  const matches = terms
    .map((item) => ({
      ...item,
      normalized: normalizeSearchText(item.normalizedTerm ?? item.term),
    }))
    .filter((item) => item.normalized && containsPhrase(normalizedQuery, item.normalized))
    .sort((a, b) => b.normalized.length - a.normalized.length);

  return matches[0]?.brandType ?? "non_brand";
}

function getDecodedPathname(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return "/";
  }
}

export function classifyContent(
  url: string,
  rules: ContentRule[],
  sitemapType?: string,
): ContentType {
  const pathname = getDecodedPathname(url);
  const activeRules = rules
    .filter((rule) => rule.isActive !== false)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of activeRules) {
    if (rule.matchType === "path_prefix" && pathname.startsWith(rule.pattern)) {
      return rule.contentType;
    }

    if (rule.matchType === "sitemap_type" && sitemapType === rule.pattern) {
      return rule.contentType;
    }

    if (rule.matchType === "path_regex") {
      try {
        if (new RegExp(rule.pattern, "u").test(pathname)) {
          return rule.contentType;
        }
      } catch {
        // Invalid configurable regexes are ignored instead of breaking imports.
      }
    }
  }

  return "other";
}
