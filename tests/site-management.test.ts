import test from "node:test";
import assert from "node:assert/strict";
import { parseSiteCreate, parseSiteUpdate, assertSameOrigin } from "../lib/sites/admin.ts";

const sample = {
  slug: "digikhab", name: "دیجی خواب", baseUrl: "https://digikhab.org/",
  propertyUrl: "https://digikhab.org/", siteBrandTerms: ["دیجی خواب", "digikhab"],
  productBrandTerms: ["هوفر"], sitemaps: ["https://digikhab.org/sitemap_index.xml"],
  contentRules: [{ type: "product", prefix: "/product/" }],
};

test("parses a valid HTTPS URL-prefix property and normalized brand terms", () => {
  const site = parseSiteCreate(sample);
  assert.equal(site.slug, "digikhab");
  assert.equal(site.baseUrl, "https://digikhab.org/");
  assert.equal(site.propertyUrl, "https://digikhab.org/");
  assert.deepEqual(site.contentRules, [{type:"product",prefix:"/product/",priority:10}]);
});

test("allows matching domain-scoped Search Console properties", () => {
  const data = parseSiteCreate({
    ...sample, baseUrl: "https://shop.example.com/", propertyUrl: "sc-domain:example.com",
    sitemaps: ["https://shop.example.com/sitemap_index.xml"],
  });
  assert.equal(data.propertyUrl, "sc-domain:example.com");
});

test("rejects mismatched domain, insecure URL, invalid slug and duplicates", () => {
  const values = [
    {...sample, propertyUrl:"https://elsewhere.com/"},
    {...sample, propertyUrl:"sc-domain:elsewhere.com"},
    {...sample, baseUrl:"http://digikhab.org/"},
    {...sample, baseUrl:"https://user:pass@digikhab.org/"},
    {...sample, slug:"../../admin"},
    {...sample, siteBrandTerms:["هوفر"]},
    {...sample, sitemaps:["http://digikhab.org/sitemap.xml"]},
    {...sample, contentRules:[{type:"product",prefix:"https://evil.example"}]},
  ];
  for (const value of values) assert.throws(()=>parseSiteCreate(value));
});

test("rejects editing immutable site URLs and invalid status", () => {
  assert.throws(()=>parseSiteUpdate({slug:"digikhab",baseUrl:"https://new.example.com/"},sample.baseUrl));
  assert.throws(()=>parseSiteUpdate({slug:"digikhab",status:"archived"},sample.baseUrl));
  assert.deepEqual(parseSiteUpdate({slug:"digikhab",status:"paused"},sample.baseUrl),{slug:"digikhab",status:"paused"});
});

test("rejects cross-origin administration writes", () => {
  assert.throws(()=>assertSameOrigin(new Request("https://seo.example.com/api/sites/manage",{
    method:"POST",headers:{origin:"https://attacker.example"}
  })));
  assert.doesNotThrow(()=>assertSameOrigin(new Request("https://seo.example.com/api/sites/manage",{
    method:"POST",headers:{origin:"https://seo.example.com","sec-fetch-site":"same-origin"}
  })));
});
