import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { d1Query } from '@/lib/d1';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Row = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
type Dimension = { table: string; columns: string[]; dims: string[]; limit: number };
const dimensions: Dimension[] = [
  { table: 'search_queries', columns: ['keyword'], dims: ['query'], limit: 25000 },
  { table: 'search_pages', columns: ['url'], dims: ['page'], limit: 25000 },
  { table: 'search_devices', columns: ['device'], dims: ['device'], limit: 100 },
  { table: 'search_query_pages', columns: ['query', 'page'], dims: ['query', 'page'], limit: 25000 },
];

function dateIsReady(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  const latest = new Date(); latest.setUTCDate(latest.getUTCDate() - 3);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value &&
    date.getTime() <= latest.getTime() && date.getTime() >= Date.UTC(2020, 0, 1);
}

async function importDate(targetDate: string) {
  const siteUrl = process.env.GSC_SITE_URL;
  if (!siteUrl) throw new Error('GSC_SITE_URL is not configured');
  const existing = await d1Query<{ status: string }>('SELECT status FROM import_status WHERE date = ?', [targetDate]);
  if (existing[0]?.status === 'complete') {
    return { success: true, skipped: true, message: 'Already imported: ' + targetDate };
  }

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '');
  } catch {
    throw new Error('Invalid or missing GOOGLE_SERVICE_ACCOUNT_JSON');
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
  const gsc = google.searchconsole({ version: 'v1', auth });
  // Do not mark as complete until EVERY write succeeds.
  await d1Query(
    "INSERT INTO import_status(date, status, updated_at) VALUES (?, 'running', CURRENT_TIMESTAMP) " +
    "ON CONFLICT(date) DO UPDATE SET status='running', updated_at=CURRENT_TIMESTAMP",
    [targetDate],
  );
  const fetchRows = async (dims: string[], rowLimit: number): Promise<Row[]> => {
    const rows: Row[] = [];
    for (let startRow = 0; startRow < 100000; startRow += rowLimit) {
      const result = await gsc.searchanalytics.query({
        siteUrl,
        requestBody: { startDate: targetDate, endDate: targetDate, dimensions: dims, rowLimit, startRow, dataState: 'final' },
      });
      const batch = (result.data.rows || []) as Row[];
      rows.push(...batch);
      if (batch.length < rowLimit) return rows;
    }
    // Never silently truncate and present data as complete.
    throw new Error('GSC pagination safety limit exceeded for ' + dims.join(','));
  };

  // Fetch all dimensions first, so failures cannot leave fresh partial daily totals.
  const [totals, ...groups] = await Promise.all([
    fetchRows([], 1),
    ...dimensions.map(d => fetchRows(d.dims, d.limit)),
  ]);
  for (const dim of dimensions) {
    await d1Query('DELETE FROM ' + dim.table + ' WHERE date = ?', [targetDate]);
  }
  for (let i = 0; i < dimensions.length; i++) {
    const dim = dimensions[i];
    const rows = groups[i];
    const cols = ['date', ...dim.columns, 'clicks', 'impressions', 'ctr', 'position'];
    // Low parameter count keeps a batch within SQLite binding constraints.
    const batchSize = 50;
    for (let start = 0; start < rows.length; start += batchSize) {
      const batch = rows.slice(start, start + batchSize);
      const sql = 'INSERT OR REPLACE INTO ' + dim.table + ' (' + cols.join(', ') + ') VALUES ' +
        batch.map(() => '(' + cols.map(() => '?').join(',') + ')').join(',');
      const bindings: (string | number)[] = [];
      for (const r of batch) bindings.push(targetDate, ...dim.columns.map((_, index) => r.keys?.[index] || ''),
        r.clicks || 0, r.impressions || 0, r.ctr || 0, r.position || 0);
      await d1Query(sql, bindings);
    }
  }
  const total = totals[0] || {};
  await d1Query(
    'INSERT OR REPLACE INTO site_totals(date,clicks,impressions,ctr,position) VALUES (?,?,?,?,?)',
    [targetDate, total.clicks || 0, total.impressions || 0, total.ctr || 0, total.position || 0],
  );
  await d1Query("UPDATE import_status SET status='complete', updated_at=CURRENT_TIMESTAMP WHERE date=?", [targetDate]);
  return { success: true, message: 'Imported ' + targetDate, rows: groups.map(g => g.length) };
}

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
