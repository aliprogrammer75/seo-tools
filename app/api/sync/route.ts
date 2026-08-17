import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // 🛡️ بخش امنیتی: فقط رباتی که رمز عبور دارد می‌تواند این API را اجرا کند
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'شما اجازه اجرای این دستور را ندارید!' }, { status: 401 });
    }

    // 🌐 آدرس بک‌اند فعلی شما برای اجرای عملیات Import
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://exir.vip/';
    
    // در اینجا ما به صورت خودکار به فایل import-history دستور می‌دهیم که دیتای روز جدید را بگیرد
    const syncResponse = await fetch(`${baseUrl}/api/import-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAutoSync: true }) 
    });

    if (!syncResponse.ok) {
      throw new Error('خطا در ارتباط با موتور ایمپورت سرچ کنسول');
    }

    const result = await syncResponse.json();

    return NextResponse.json({ 
      success: true, 
      message: 'سینک خودکار با موفقیت انجام شد 🚀', 
      details: result 
    });

  } catch (error: any) {
    console.error('Auto Sync Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}