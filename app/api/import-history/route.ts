import { NextResponse } from 'next/server';
import { importDate, dateIsReady } from '@/lib/gsc-import';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get('date');
  if (!dateIsReady(date)) return NextResponse.json({ success: false, error: 'Invalid date; GSC data must be at least 3 days old.' }, { status: 400 });
  try {
    return NextResponse.json(await importDate(date));
  } catch (error) {
    console.error('Import failed', error);
    return NextResponse.json({ success: false, error: 'Import failed. See server logs.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = await request.json();
    if (input?.isAutoSync !== true) return NextResponse.json({ success: false }, { status: 400 });
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - 3);
    return NextResponse.json(await importDate(date.toISOString().slice(0, 10)));
  } catch (error) {
    console.error('Scheduled import failed', error);
    return NextResponse.json({ success: false, error: 'Scheduled import failed' }, { status: 500 });
  }
}
