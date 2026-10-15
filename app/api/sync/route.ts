import { NextResponse } from 'next/server';
import { importDate } from '@/lib/gsc-import';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const token = process.env.CRON_SECRET;
  if (!token || request.headers.get('authorization') !== 'Bearer ' + token) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 3);
  try {
    return NextResponse.json(await importDate(date.toISOString().slice(0, 10)));
  } catch (error) {
    console.error('Sync failed', error);
    return NextResponse.json({ success: false, error: 'Sync failed' }, { status: 500 });
  }
}
