# SEO Tools Internal

داشبورد داخلی و چندسایتی برای تبدیل داده‌های Google Search Console به بینش‌های عملیاتی سئو.

## وضعیت فونداسیون

- Next.js App Router
- Cloudflare Workers و D1
- یک Service Account مشترک برای چند Property سرچ کنسول
- دریافت داده نهایی با صفحه‌بندی ۲۵٬۰۰۰ ردیفی
- تفکیک برند سایت از برند محصول
- طبقه‌بندی قابل تنظیم محصولات، دسته‌ها، برندها و مقالات

## تنظیمات محرمانه

فایل `.dev.vars.example` را برای توسعه محلی به `.dev.vars` کپی کنید و مقدار واقعی Secretها را فقط در فایل محلی قرار دهید. فایل JSON سرویس‌اکانت، Private Key و `.dev.vars` نباید وارد Git شوند.

در Cloudflare نیز این مقادیر باید به‌عنوان Secret تنظیم شوند:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `CRON_SECRET`

## دیتابیس محلی

```bash
npx wrangler d1 migrations apply seo-tools-staging --local
npx wrangler d1 execute seo-tools-staging --local --file seeds/0001_digikhab.sql
```

## دیتابیس آزمایشی Cloudflare

پس از ورود امن به Wrangler:

```bash
npx wrangler d1 migrations apply seo-tools-staging --remote
npx wrangler d1 execute seo-tools-staging --remote --file seeds/0001_digikhab.sql
```

## آزمون‌ها

آزمون‌ها با Node.js 24 اجرا می‌شوند:

```bash
npm test
```

این مرحله هنوز APIهای قدیمی Import و Dashboard را جایگزین نکرده است؛ مهاجرت آن‌ها در مرحله بعد انجام می‌شود.
