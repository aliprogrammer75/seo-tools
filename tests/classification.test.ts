import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyBrandQuery,
  classifyContent,
  normalizeSearchText,
  type BrandTerm,
  type ContentRule,
} from "../lib/sites/classification.ts";

const brandTerms: BrandTerm[] = [
  { term: "دیجی خواب", brandType: "site" },
  { term: "digikhab", brandType: "site" },
  { term: "مبلیران", brandType: "product" },
  { term: "هوفر", brandType: "product" },
];

const rules: ContentRule[] = [
  { contentType: "product", matchType: "path_prefix", pattern: "/product/", priority: 10 },
  {
    contentType: "category",
    matchType: "path_prefix",
    pattern: "/product-category/",
    priority: 20,
  },
  { contentType: "brand", matchType: "path_prefix", pattern: "/برند/", priority: 30 },
  { contentType: "article", matchType: "sitemap_type", pattern: "post", priority: 40 },
  {
    contentType: "article_archive",
    matchType: "path_prefix",
    pattern: "/blogs/",
    priority: 50,
  },
];

test("normalizes Persian character variants and zero-width separators", () => {
  assert.equal(normalizeSearchText("  ديجی‌خواب  "), "دیجی خواب");
});

test("keeps site-brand and product-brand queries separate", () => {
  assert.equal(classifyBrandQuery("خرید از دیجی خواب", brandTerms), "site");
  assert.equal(classifyBrandQuery("قیمت تشک مبلیران", brandTerms), "product");
  assert.equal(classifyBrandQuery("بهترین تشک طبی", brandTerms), "non_brand");
});

test("classifies Digikhab products, categories and decoded brand paths", () => {
  assert.equal(classifyContent("https://digikhab.org/product/example/", rules), "product");
  assert.equal(
    classifyContent("https://digikhab.org/product-category/mattress/", rules),
    "category",
  );
  assert.equal(
    classifyContent("https://digikhab.org/%D8%A8%D8%B1%D9%86%D8%AF/example/", rules),
    "brand",
  );
});

test("uses sitemap type for root-level WordPress article URLs", () => {
  assert.equal(
    classifyContent("https://digikhab.org/heisenberg-tehran/", rules, "post"),
    "article",
  );
});
