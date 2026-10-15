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
- `TEAM_DOMAIN` (آدرس کامل دامنه تیم Cloudflare Access)
- `POLICY_AUD` (شناسه Audience اپلیکیشن Cloudflare Access)

**امنیت:** APIها توکن Access را با کلید عمومی امضاکننده، دامنه صادرکننده، Audience و تاریخ اعتبار تأیید می‌کنند. محافظت دامنه Worker با Cloudflare Access نیز باید در پنل فعال باشد.

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

## وضعیت توسعه

- API انتخاب سایت و نمایش آدرس اصلی هر سایت در داشبورد تکمیل شد.
- خطاهای بارگذاری داده‌ها در داشبورد به کاربر نمایش داده می‌شوند.
- انتخاب سایت اکنون از فهرست ثبت‌شده در پایگاه داده است.
- قبل از استقرار، Secretهای Access، D1 migration، دسترسی service account به GSC و دامنه Workers باید تأیید شوند.
- تغییرات این شاخه هنوز به main ادغام نشده‌اند.

## مدیریت سایت‌ها
- در آدرس `/sites` می‌توانید سایت را با نام، شناسه، URL اصلی و Property دقیق سرچ کنسول ثبت کنید.
- قالب Property: `https://example.com/` برای URL-prefix یا `sc-domain:example.com` برای Domain Property.
- سایت ابتدا با وضعیت `paused` ایجاد می‌شود و هنوز در همگام‌سازی روزانه شرکت ندارد.
- سرویس‌اکانت مشترک باید در **Google Search Console → Settings → Users and permissions** به همان Property دسترسی دست‌کم Restricted داشته باشد.
- روی «تست دسترسی GSC» کلیک کنید؛ تنها در صورت موفقیت درخواست واقعی به API گوگل، «تأیید و فعال‌سازی» سایت را فعال می‌کند.
- پس از فعال‌سازی به `/import` بروید؛ تاریخ‌های ناقص را ببینید و تاریخچه را وارد کنید. برای داده‌های وسیع واردسازی ممکن است طولانی باشد و لازم است محدودیت اجرای Worker سنجیده شود.
- واردکردن URL، اسکیما و سایت‌مپ به معنی خزیدن و وارد کردن خودکار sitemap نیست. ثبت URL نقشه سایت آماده است اما سرویس خزنده سایت‌مپ هنوز پیاده‌سازی نشده است.

## چک‌لیست استقرار staging (بدون افشای اسرار)
۱. Cloudflare D1 با نام `seo-tools-staging` و شناسه‌ای که در `wrangler.toml` تعریف شده در اکانت درست موجود باشد؛ هیچ دیتابیسی را در محیط اصلی جایگزین نکنید.
۲. پس از گرفتن نسخه پشتیبان از دیتابیس هدف:
```bash
npx wrangler d1 migrations apply seo-tools-staging --remote
npx wrangler d1 execute seo-tools-staging --remote --file seeds/0001_digikhab.sql
```
۳. در GitHub Environment با نام `staging` مقادیر محرمانه `CLOUDFLARE_API_TOKEN`، `GOOGLE_SERVICE_ACCOUNT_EMAIL`، `GOOGLE_PRIVATE_KEY`، `CRON_SECRET`، `TEAM_DOMAIN` و `POLICY_AUD` ثبت شوند. هرگز مقدار واقعی را در issue، commit یا چت قرار ندهید.
۴. اپلیکیشن Cloudflare Access را برای کل دامنه Worker و همه routeها تنظیم کنید و دسترسی را به کاربران مجاز محدود کنید. ادعای محافظت فقط با چک کردن توکن در backend کافی نیست.
۵. تنها پس از تأیید migration، مجوزها و اتصال پراپرتی‌ها workflow دستی `Deploy staging` را اجرا کنید. این workflow خودکار اجرا نمی‌شود.
۶. `/sites`، تست واقعی GSC، `/import`، `/site`، تاریخ‌های ناقص، جداسازی داده دو سایت و گزارش‌های Cannibalization/CTR/Decay را آزمایش کنید.
۷. قابلیت اجرای روزانه نیازمند زمان‌بند خارجی یا Cloudflare Cron Trigger متصل به endpoint `/api/sync` با توکن Bearer معتبر است؛ فقط وجود endpoint زمان‌بندی ایجاد نمی‌کند.

**مرز فعلی:** مخزن کد را برای staging آماده می‌کند؛ اتصال واقعی، تنظیم secretها و اجرای migration/استقرار باید در Cloudflare متعلق به شما انجام و با داده واقعی تأیید شود. تا تأیید این موارد پروژه production-ready نیست.
