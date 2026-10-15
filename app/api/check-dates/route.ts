import { NextResponse } from 'next/server';
import { d1Query } from '@/lib/d1';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const entries = await d1Query<{ date: string }>(
      "SELECT date FROM import_status WHERE status = 'complete' ORDER BY date DESC"
    );
    const dates = new Set(entries.map(r => r.date));
    const missingDates: string[] = [];
    for (let i = 3; i <= 120; i++) {
      const date = new Date();
      date.setUTCHours(12, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - i);
      const key = date.toISOString().slice(0, 10);
      if (!dates.has(key)) missingDates.push(key);
    }
    return NextResponse.json({ success: true, missingDates, existingCount: dates.size });
  } catch (error) {
    console.error('check-dates error', error);
    return NextResponse.json({ success: false, error: 'Unable to check imports' }, { status: 500 });
  }
}
