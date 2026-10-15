import type { D1Database, D1PreparedStatement } from "./d1.ts";
import { ApiError } from "../http/api-error.ts";
import { normalizeSearchText } from "../sites/classification.ts";
import type { SiteFields, UpdateFields } from "../sites/admin.ts";
import { getSiteConfiguration, type SiteConfiguration } from "./sites.ts";

type SiteRow = { id: number; slug: string; name: string; base_url: string; gsc_property_url: string; status: string };

export async function listManagedSites(db: D1Database): Promise<SiteRow[]> {
  const result = await db.prepare(
    "SELECT id, slug, name, base_url, gsc_property_url, status FROM sites WHERE status != 'archived' ORDER BY name"
  ).all<SiteRow>();
  if (!result.success) throw new Error(result.error ?? "Could not read sites");
  return result.results ?? [];
}

function relatedWrites(db: D1Database, id: number, data: {
  siteBrandTerms?: string[]; productBrandTerms?: string[]; sitemaps?: string[];
  contentRules?: SiteFields["contentRules"];
}): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  if (data.siteBrandTerms !== undefined || data.productBrandTerms !== undefined) {
    // Replacing both classes together avoids stale duplicates between classes.
    if (!data.siteBrandTerms || !data.productBrandTerms) {
      throw new ApiError(400, "BRANDS_REQUIRED", "هر دو فهرست برند برای ویرایش الزامی هستند.");
    }
    statements.push(db.prepare("DELETE FROM site_brand_terms WHERE site_id = ?").bind(id));
    for (const [terms, type] of [[data.siteBrandTerms, "site"], [data.productBrandTerms, "product"]] as const) {
      for (const term of terms) {
        statements.push(db.prepare(
          "INSERT INTO site_brand_terms (site_id, term, normalized_term, brand_type) VALUES (?, ?, ?, ?)"
        ).bind(id, term, normalizeSearchText(term), type));
      }
    }
  }
  if (data.sitemaps !== undefined) {
    // Keep known inventory and fetched data; disable missing sitemap entries.
    statements.push(db.prepare("UPDATE site_sitemaps SET is_active = 0 WHERE site_id = ?").bind(id));
    for (const url of data.sitemaps) {
      statements.push(db.prepare(
        "INSERT INTO site_sitemaps (site_id, url, sitemap_type, is_active) VALUES (?, ?, 'index', 1) " +
        "ON CONFLICT(site_id, url) DO UPDATE SET is_active = 1"
      ).bind(id, url));
    }
  }
  if (data.contentRules !== undefined) {
    statements.push(db.prepare("DELETE FROM site_content_rules WHERE site_id = ?").bind(id));
    for (const rule of data.contentRules) {
      statements.push(db.prepare(
        "INSERT INTO site_content_rules (site_id, content_type, match_type, pattern, priority) " +
        "VALUES (?, ?, 'path_prefix', ?, ?)"
      ).bind(id, rule.type, rule.prefix, rule.priority));
    }
  }
  return statements;
}

async function runAtomic(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  if (!statements.length) return;
  const results = await db.batch(statements);
  if (results.some((result) => !result.success)) throw new Error("Cloudflare D1 transaction failed");
}

export async function createManagedSite(db: D1Database, data: SiteFields): Promise<SiteConfiguration> {
  let id: number;
  try {
    const inserted = await db.prepare(
      "INSERT INTO sites (slug, name, base_url, gsc_property_url, status) " +
      "VALUES (?, ?, ?, ?, 'paused') RETURNING id"
    ).bind(data.slug, data.name, data.baseUrl, data.propertyUrl).first<{ id: number }>();
    if (!inserted?.id) throw new Error("Could not create site");
    id = inserted.id;
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint/i.test(error.message)) {
      throw new ApiError(409, "SITE_EXISTS", "این شناسه یا پراپرتی قبلاً ثبت شده است.");
    }
    throw error;
  }
  // A newly created site is paused until Search Console permissions are tested.
  const statements = [
    db.prepare("INSERT OR IGNORE INTO site_insight_settings (site_id) VALUES (?)").bind(id),
    ...relatedWrites(db, id, data),
  ];
  try {
    await runAtomic(db, statements);
  } catch (error) {
    // Remove a partial new site, including its children, if setup fails.
    await db.prepare("DELETE FROM sites WHERE id = ? AND status = 'paused'").bind(id).run();
    throw error;
  }
  const site = await getSiteConfiguration(db, data.slug);
  if (!site) throw new Error("Created site not found");
  return site;
}

export async function updateManagedSite(db: D1Database, data: UpdateFields): Promise<SiteConfiguration> {
  const existing = await getSiteConfiguration(db, data.slug);
  if (!existing || existing.site.status === "archived") {
    throw new ApiError(404, "SITE_NOT_FOUND", "سایت پیدا نشد.");
  }
  const id = existing.site.id;
  const statements = [
    db.prepare("UPDATE sites SET name = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(data.name ?? existing.site.name, data.status ?? existing.site.status, id),
    ...relatedWrites(db, id, data),
  ];
  await runAtomic(db, statements);
  const site = await getSiteConfiguration(db, data.slug);
  if (!site) throw new Error("Updated site not found");
  return site;
}
