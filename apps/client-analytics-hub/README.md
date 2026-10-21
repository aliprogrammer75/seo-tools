# Client Analytics Hub (Cloudflare Workers + D1)

پلتفرم داشبورد چندسایتی فارسی/راست‌چین برای مدیریت گزارش‌های SEO و فروش.

## وضعیت ۲۱ اکتبر ۲۰۲۶

- Worker: `client-analytics-hub` / deployed
- D1: `client-analytics-hub`
- Worker URL: https://client-analytics-hub.ashurgeshti75.workers.dev
- Admin UI: `/admin`
- Tenant-specific UI: `/s/<site-slug>`
- MCP JSON-RPC over HTTP: `POST /mcp` (Bearer)
- Source code: `worker.js`; database schema: `schema.sql`.
- Site data is **not** public. All JSON report endpoints require an authenticated session scoped to one tenant or admin.
- Secrets `ADMIN_PASSWORD_SHA256`, `SESSION_KEY`, `MCP_ADMIN_TOKEN` are stored as Cloudflare Worker secrets, not committed here.

## تفکیک سایت و مجوزها

تمام گزارش‌ها با شناسه داخلی `site_id` ذخیره شده و در API فقط پس از احراز هویت فیلتر می‌شوند. مدیر مرکزی می‌تواند همه سایت‌ها را ببیند؛ کاربران `viewer` فقط سایت مربوط به خود را می‌بینند. هر سایت مسیر جداگانه، کاربر اختصاصی و داده‌های مستقل دارد. حساب مشتری از دکمه «دسترسی کارفرما» ساخته می‌شود. پسورد قوی تنها یک بار نمایش داده می‌شود. **تا قبل از ایجاد کاربر مشتری، مشتریان هیچ دسترسی ندارند.**

## داده‌های فعلی

- `moorashin`: snapshot واقعی سفارش‌های پرداخت‌شده WooCommerce، ۲۰۲۶-۰۹-۲۱ تا ۲۰۲۶-۱۰-۲۰.
- `exir`: snapshot واقعی سفارش‌های تکمیل‌شده و دارای پرداخت WooCommerce، همان بازه.
- `apadanasivand`: snapshot واقعی سفارش‌های تکمیل‌شده و دارای پرداخت WooCommerce، همان بازه.
- بقیه سایت‌ها: صفحه و ساختار ایجاد شده، داده هنوز وارد نشده است.
- داده‌های snapshot شامل سفارش، مبلغ کل سفارش به تومان، منبع منتسب به سفارش، نوع صفحه ورود و تعدادی از صفحات ورودی‌اند.
- اطلاعات هویتی مشتری، شماره تماس، آدرس سفارش، IP و کلیدهای فروشگاه به D1 منتقل نشده‌اند.
- داده‌ها **خودکار تازه نمی‌شوند**؛ اتصال امن تکرارشونده به WooCommerce، GA4، GSC و BigQuery مرحله بعدی است.

## راه‌اندازی توسعه

با Node.js و Wrangler:

```bash
npm install -g wrangler
wrangler d1 execute client-analytics-hub --remote --file=./schema.sql
```

برای deploy باید `worker.js` را با یک فایل Wrangler شامل binding `DB` به D1 متصل کرد. هر سه secret باید از طریق `wrangler secret put` ست شوند؛ محتوای آن‌ها به repo اضافه نشود. می‌توان برنامه را به جای Build جدید، به‌صورت ES module Worker منتشر کرد. فایل `worker.js` CSS و JS کلاینت را در همان Worker نگه می‌دارد و به CDN خارجی نیاز ندارد.

## فرمت ورود داده تجمعی (MCP)

نمونه پارامتر ابزار `import_snapshot`:

```json
{
  "site_slug": "moorashin",
  "period_start": "2026-09-21",
  "period_end": "2026-10-20",
  "source": "woocommerce",
  "channels": [
    {"channel": "گوگل", "orders": 72, "revenue_toman": 402835884, "sessions": null}
  ]
}
```

سایر آرایه‌ها: `types` با `page_type` و `landings` با `page_path`, `page_type`. پاسخ MCP ابزارهای مدیریتی `list_sites`، `get_site_dashboard`، `create_site`، `create_viewer` و `import_snapshot` را پشتیبانی می‌کند.

## محدودیت‌ها و معیارهای صحت

1. Snapshot دوره‌ای جایگزین GA4 Event Tracking نیست.
2. درآمد نمایش‌داده‌شده **کل مبلغ سفارش** شامل اقلام و هزینه‌های مرتبط است، نه لزوماً درآمد خالص بدون ارسال و مالیات.
3. صفحه ورودی ذخیره‌شده توسط ووکامرس لزوماً صفحه تأثیرگذار بر تصمیم خرید نیست.
4. هر سایت به API و credentials مخصوص خود نیاز دارد؛ کلیدهای MCP فقط مدیریت داشبوردند.
5. برای تحلیل مسیر کامل خرید، رویدادهای `view_item`, `add_to_cart`, `begin_checkout`, `purchase` باید در GA4 درست ثبت و سپس در BigQuery با شناسه سفارش تحلیل شوند.
6. امکان Health check از API عمومی در محیط ابزار فعلی تأیید نشد؛ Deployment در Cloudflare ۱۰۰٪ است و بررسی دستی مرورگر توصیه می‌شود.
7. برای استفاده عمومی یا چندکارفرمایی گسترده، احراز هویت باید با Cloudflare Access/OIDC، audit log، پشتیبان D1 و نظارت خطا تقویت شود.

## امنیت

ورود admin با رمز تصادفی بلند و هش SHA-256 محرمانه؛ حساب‌های viewer با گذرواژه تصادفی و نمک هش می‌شوند، کوکی احراز هویت `HttpOnly; Secure; SameSite=Strict` و امضای HMAC و عمر ۱۲ ساعت دارد. محدودیت تلاش ناموفق در D1 نگه‌داری می‌شود. همه کوئری‌های گزارش به site_id محدودند. برای استقرار گسترده، KDF قوی‌تر (Argon2id یا PBKDF2)، Cloudflare Access و آزمون نفوذ پیشنهاد می‌شود.
