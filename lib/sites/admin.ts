import { ApiError } from "../http/api-error.ts";
import { normalizeSearchText, type ContentType } from "./classification.ts";

export type SiteStatus = "active" | "paused";
export interface BrandEntry { term: string; normalized: string; type: "site" | "product" }
export interface ContentRuleEntry { type: ContentType; prefix: string; priority: number }
export interface SiteFields {
  name: string;
  slug: string;
  baseUrl: string;
  propertyUrl: string;
  siteBrandTerms: string[];
  productBrandTerms: string[];
  sitemaps: string[];
  contentRules: ContentRuleEntry[];
}
export interface UpdateFields {
  slug: string;
  name?: string;
  status?: SiteStatus;
  siteBrandTerms?: string[];
  productBrandTerms?: string[];
  sitemaps?: string[];
  contentRules?: ContentRuleEntry[];
}

function invalid(message: string): never {
  throw new ApiError(400, "INVALID_SITE", message);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("اطلاعات سایت باید یک شیء معتبر باشد.");
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    return invalid(`مقدار «${label}» نامعتبر است.`);
  }
  return value.trim();
}
function siteBaseUrl(value: unknown): string {
  const raw = string(value, "آدرس سایت", 300);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password ||
      url.search || url.hash || (url.port && url.port !== "443") || url.pathname !== "/") {
      return invalid("آدرس سایت باید HTTPS و بدون مسیر اضافه، پورت یا پارامتر باشد.");
    }
    return url.origin + "/";
  } catch {
    return invalid("آدرس سایت معتبر نیست.");
  }
}
function propertyUrl(value: unknown, baseUrl: string): string {
  const raw = string(value, "پراپرتی سرچ کنسول", 350);
  const host = new URL(baseUrl).hostname.toLowerCase();
  if (raw.startsWith("sc-domain:")) {
    const domain = raw.slice(10).toLowerCase();
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) ||
      (host !== domain && !host.endsWith("." + domain))) {
      return invalid("دامنه پراپرتی با آدرس سایت تطابق ندارد.");
    }
    return "sc-domain:" + domain;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.hostname !== host ||
      parsed.username || parsed.password || parsed.search || parsed.hash ||
      (parsed.port && parsed.port !== "443")) {
      return invalid("پراپرتی URL-prefix باید HTTPS و متعلق به همین سایت باشد.");
    }
    if (!baseUrl.startsWith(parsed.origin + parsed.pathname)) {
      return invalid("پراپرتی URL-prefix مسیر اصلی سایت را پوشش نمی‌دهد.");
    }
    return parsed.toString();
  } catch {
    return invalid("آدرس پراپرتی سرچ کنسول معتبر نیست.");
  }
}
function stringList(value: unknown, label: string, limit = 40): string[] {
  if (!Array.isArray(value) || value.length > limit) return invalid(`فهرست «${label}» نامعتبر است.`);
  const values: string[] = [];
  const unique = new Set<string>();
  for (const entry of value) {
    const term = string(entry, label, 120);
    const normalized = normalizeSearchText(term);
    if (!normalized) return invalid(`مقدار «${label}» خالی است.`);
    if (!unique.has(normalized)) { unique.add(normalized); values.push(term); }
  }
  return values;
}
function sitemapList(value: unknown, baseUrl?: string): string[] {
  if (!Array.isArray(value) || value.length > 12) return invalid("فهرست سایت‌مپ‌ها نامعتبر است.");
  const urls = new Set<string>();
  for (const input of value) {
    const raw = string(input, "سایت‌مپ", 500);
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" || url.username || url.password || url.hash ||
        url.search || (baseUrl && url.hostname !== new URL(baseUrl).hostname)) {
        return invalid("سایت‌مپ باید HTTPS و متعلق به دامنه سایت باشد.");
      }
      urls.add(url.toString());
    } catch {
      return invalid("آدرس سایت‌مپ معتبر نیست.");
    }
  }
  return [...urls];
}
const contentTypes: ContentType[] = ["product", "category", "brand", "article", "article_archive", "page", "other"];
export function parseRules(value: unknown): ContentRuleEntry[] {
  if (!Array.isArray(value) || value.length > 20) return invalid("فهرست قوانین دسته‌بندی معتبر نیست.");
  return value.map((item, i) => {
    const obj = object(item);
    if (!contentTypes.includes(obj.type as ContentType)) return invalid("نوع محتوای انتخاب‌شده نامعتبر است.");
    const prefix = string(obj.prefix, "پیشوند مسیر", 120);
    if (!prefix.startsWith("/") || prefix.includes("?") || prefix.includes("#") || prefix.includes("://")) {
      return invalid("پیشوند مسیر باید با / شروع شود.");
    }
    return { type: obj.type as ContentType, prefix, priority: i + 10 };
  });
}
export function parseSiteCreate(value: unknown): SiteFields {
  const body = object(value);
  const slug = string(body.slug, "شناسه سایت", 48).toLowerCase();
  if (!/^[a-z][a-z0-9-]{2,47}$/.test(slug)) return invalid("شناسه سایت باید حروف انگلیسی کوچک، عدد یا خط تیره باشد.");
  const baseUrl = siteBaseUrl(body.baseUrl);
  const siteBrandTerms = stringList(body.siteBrandTerms ?? [], "برند سایت");
  const productBrandTerms = stringList(body.productBrandTerms ?? [], "برند محصول");
  if (siteBrandTerms.some((x) => productBrandTerms.some((y) => normalizeSearchText(x) === normalizeSearchText(y)))) {
    return invalid("یک عبارت نباید هم‌زمان برند سایت و محصول باشد.");
  }
  return {
    slug,
    name: string(body.name, "نام سایت", 120),
    baseUrl,
    propertyUrl: propertyUrl(body.propertyUrl, baseUrl),
    siteBrandTerms, productBrandTerms,
    sitemaps: sitemapList(body.sitemaps ?? [], baseUrl),
    contentRules: parseRules(body.contentRules ?? []),
  };
}
export function parseSiteUpdate(value: unknown, baseUrl: string): UpdateFields {
  const body = object(value);
  const slug = string(body.slug, "شناسه سایت", 48).toLowerCase();
  if (!/^[a-z][a-z0-9-]{2,47}$/.test(slug)) return invalid("شناسه سایت نامعتبر است.");
  if (body.baseUrl !== undefined || body.propertyUrl !== undefined) {
    return invalid("تغییر دامنه یا شناسه پراپرتی پس از ورود داده‌ها مجاز نیست.");
  }
  const result: UpdateFields = { slug };
  if (body.name !== undefined) result.name = string(body.name, "نام سایت", 120);
  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "paused") return invalid("وضعیت سایت نامعتبر است.");
    result.status = body.status;
  }
  if (body.siteBrandTerms !== undefined) result.siteBrandTerms = stringList(body.siteBrandTerms, "برند سایت");
  if (body.productBrandTerms !== undefined) result.productBrandTerms = stringList(body.productBrandTerms, "برند محصول");
  if (result.siteBrandTerms?.some((x) => result.productBrandTerms?.some((y) => normalizeSearchText(x) === normalizeSearchText(y)))) {
    return invalid("عبارت مشترک در برند سایت و محصول یافت شد.");
  }
  if (body.sitemaps !== undefined) result.sitemaps = sitemapList(body.sitemaps, baseUrl);
  if (body.contentRules !== undefined) result.contentRules = parseRules(body.contentRules);
  return result;
}
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const target = new URL(request.url);
  if (origin && origin !== target.origin) {
    throw new ApiError(403, "BAD_ORIGIN", "درخواست از مبدأ دیگری ارسال شده است.");
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new ApiError(403, "BAD_ORIGIN", "درخواست بین‌سایتی مجاز نیست.");
  }
}
