import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID, CLOUDFLARE_API_TOKEN } = process.env;
    const d1Url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${CLOUDFLARE_DATABASE_ID}/query`;

    // گرفتن لیست تمام تاریخ‌هایی که تا الان در دیتابیس ذخیره شده‌اند
    const res = await fetch(d1Url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: "SELECT DISTINCT date FROM site_totals ORDER BY date DESC" })
    });

    if (!res.ok) throw new Error("خطا در ارتباط با کلادفلر");

    const data = await res.json();
    const existingDates = data.result?.[0]?.results?.map((r: any) => r.date) || [];

    // بررسی ۱۲۰ روز گذشته و پیدا کردن تاریخ‌هایی که در دیتابیس نیستند
    const missingDates = [];
    for (let i = 1; i <= 120; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      // اگر تاریخِ امروز منهای i در دیتابیس نبود، بفرستش تو لیست گمشده‌ها
      if (!existingDates.includes(dateStr)) {
        missingDates.push(dateStr);
      }
    }

    return NextResponse.json({ 
      success: true, 
      missingDates, 
      existingCount: existingDates.length 
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}