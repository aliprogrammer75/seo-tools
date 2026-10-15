import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

function safeEquals(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Protect the dashboard and all JSON endpoints. No anonymous database reads
 * or imports. This is intentionally single-admin, not multi-tenant auth.
 */
export function proxy(request: NextRequest) {
  const username = process.env.DASHBOARD_USERNAME;
  const password = process.env.DASHBOARD_PASSWORD;
  if (!username || !password) {
    return new NextResponse('Configure DASHBOARD_USERNAME and DASHBOARD_PASSWORD.', { status: 503 });
  }

  const authorization = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  if (request.nextUrl.pathname === '/api/sync' && cronSecret &&
      safeEquals(authorization, 'Bearer ' + cronSecret)) {
    return NextResponse.next();
  }

  if (authorization.startsWith('Basic ')) {
    try {
      const credentials = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
      if (safeEquals(credentials, username + ':' + password)) {
        return NextResponse.next();
      }
    } catch {
      // Malformed Authorization header.
    }
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="SEO Tools", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
