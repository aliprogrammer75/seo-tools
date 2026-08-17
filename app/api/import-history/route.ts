import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetDate = searchParams.get('date');

    if (!targetDate) throw new Error("تاریخ مشخص نشده است.");

    const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID, CLOUDFLARE_API_TOKEN } = process.env;
    const d1Url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${CLOUDFLARE_DATABASE_ID}/query`;

    // 🚀 بررسی موجود بودن تاریخ (برای پرش سریع)
    const checkRes = await fetch(d1Url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: `SELECT 1 FROM site_totals WHERE date = '${targetDate}' LIMIT 1` })
    });
    
    if (!checkRes.ok) throw new Error(`ارتباط با کلادفلر قطع شد (کد ${checkRes.status}).`);
    
    const checkData = await checkRes.json();
    if (checkData.result?.[0]?.results?.length > 0) {
      return NextResponse.json({ success: true, message: `⏭️ پرش: دیتای ${targetDate} از قبل موجود بود.` });
    }

    // =========================================================
    // استخراج دیتای کامل و سنگین از گوگل (۱۰۰۰ تایی)
    // =========================================================
    const auth = new google.auth.GoogleAuth({
      keyFile: path.join(process.cwd(), 'google-credentials.json'),
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });
    const searchconsole = google.searchconsole({ version: 'v1', auth });
    const siteUrl = 'https://exir.vip/';

    let totalsRes, queriesRes, pagesRes, devicesRes, cannibalizationRes;

    try {
      [totalsRes, queriesRes, pagesRes, devicesRes, cannibalizationRes] = await Promise.all([
        searchconsole.searchanalytics.query({ siteUrl, requestBody: { startDate: targetDate, endDate: targetDate, dimensions: [] } }),
        searchconsole.searchanalytics.query({ siteUrl, requestBody: { startDate: targetDate, endDate: targetDate, dimensions: ['query'], rowLimit: 1000 } }),
        searchconsole.searchanalytics.query({ siteUrl, requestBody: { startDate: targetDate, endDate: targetDate, dimensions: ['page'], rowLimit: 1000 } }),
        searchconsole.searchanalytics.query({ siteUrl, requestBody: { startDate: targetDate, endDate: targetDate, dimensions: ['device'], rowLimit: 10 } }),
        searchconsole.searchanalytics.query({ siteUrl, requestBody: { startDate: targetDate, endDate: targetDate, dimensions: ['query', 'page'], rowLimit: 500 } })
      ]);
    } catch (gscErr: any) {
       throw new Error(`خطای سرچ کنسول گوگل: ${gscErr.message}`);
    }

    const sqlStatements: any[] = [];

    // 🛡️ تابع جادویی برای ساختن یک دستور SQL با ۱۰۰ مقدار زنجیره‌ای (حل ارور کلادفلر)
    const addBatches = (tableName: string, columns: string, rows: any[], rowMapper: (row: any) => string) => {
      const CHUNK_SIZE = 100; // تزریق ۱۰۰ ردیف دیتا با یک درخواست تکی!
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const values = chunk.map(rowMapper).join(', ');
        sqlStatements.push({ sql: `INSERT OR REPLACE INTO ${tableName} (${columns}) VALUES ${values};` });
      }
    };

    // ۱. آمار کل
    if (totalsRes?.data?.rows && totalsRes.data.rows.length > 0) {
      const t = totalsRes.data.rows[0];
      sqlStatements.push({ sql: `INSERT OR REPLACE INTO site_totals (date, clicks, impressions, ctr, position) VALUES ('${targetDate}', ${t.clicks || 0}, ${t.impressions || 0}, ${t.ctr || 0}, ${t.position || 0});` });
    }

    // ۲. کلمات کلیدی
    if (queriesRes?.data?.rows) {
      addBatches('search_queries', 'date, keyword, clicks, impressions, ctr, position', queriesRes.data.rows, (row) => {
        const query = (row.keys?.[0] || '').replace(/'/g, "''");
        return `('${targetDate}', '${query}', ${row.clicks || 0}, ${row.impressions || 0}, ${row.ctr || 0}, ${row.position || 0})`;
      });
    }

    // ۳. صفحات
    if (pagesRes?.data?.rows) {
      addBatches('search_pages', 'date, url, clicks, impressions, ctr, position', pagesRes.data.rows, (row) => {
        const page = (row.keys?.[0] || '').replace(/'/g, "''").replace('https://exir.vip', '');
        return `('${targetDate}', '${page}', ${row.clicks || 0}, ${row.impressions || 0}, ${row.ctr || 0}, ${row.position || 0})`;
      });
    }

    // ۴. دستگاه‌ها
    if (devicesRes?.data?.rows) {
      addBatches('search_devices', 'date, device, clicks, impressions, ctr, position', devicesRes.data.rows, (row) => {
        const device = (row.keys?.[0] || '').replace(/'/g, "''");
        return `('${targetDate}', '${device}', ${row.clicks || 0}, ${row.impressions || 0}, ${row.ctr || 0}, ${row.position || 0})`;
      });
    }

    // ۵. صفحات درگیر (Cannibalization)
    if (cannibalizationRes?.data?.rows) {
      addBatches('search_query_pages', 'date, query, page, clicks, impressions, ctr, position', cannibalizationRes.data.rows, (row) => {
        const query = (row.keys?.[0] || '').replace(/'/g, "''");
        const page = (row.keys?.[1] || '').replace(/'/g, "''").replace('https://exir.vip', '');
        return `('${targetDate}', '${query}', '${page}', ${row.clicks || 0}, ${row.impressions || 0}, ${row.ctr || 0}, ${row.position || 0})`;
      });
    }

    // جلوگیری از کرش در روزهای تعطیل و بدون دیتای سایت
    if (sqlStatements.length === 0) {
       return NextResponse.json({ success: true, message: `⚠️ در تاریخ ${targetDate} سایت شما دیتایی در سرچ کنسول نداشته است.` });
    }

    // =========================================================
    // ارسال به دیتابیس (بدون آرایه، کاملاً استانداردِ آبجکتی)
    // =========================================================
    for (const stmt of sqlStatements) {
      const d1Response = await fetch(d1Url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(stmt) // 👈 اینجاست که ارور حل شد (یک آبجکت تکی می‌فرستیم)
      });

      if (!d1Response.ok) {
         const errorText = await d1Response.text();
         throw new Error(`ارور سرور کلادفلر (کد ${d1Response.status}): ${errorText}`);
      }

      const d1Result = await d1Response.json();
      if (!d1Result.success) {
         throw new Error(`خطای دیتابیس: ${JSON.stringify(d1Result.errors)}`);
      }
    }

    return NextResponse.json({ success: true, message: `📥 دیتای عمیق ${targetDate} با موفقیت ذخیره شد.` });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}