# SEO Tools — deployment and data-integrity checklist

## Current scope
This is **one Google Search Console property per deployment and D1 database**.
Do not use one D1 database for multiple sites. Multi-tenant site selection requires a
schema migration to add a site identifier to every table and permission checks.

## Before deploying
1. Back up the Cloudflare D1 database.
2. Apply `migrations/001_data_integrity.sql` to the same D1 database as configured.
3. Configure environment variables from `.env.example` in your private hosting environment.
4. Store the Google service account JSON in a private environment variable (never Git).
5. Grant the service-account email permission to read the exact `GSC_SITE_URL` property.
6. Require strong `DASHBOARD_PASSWORD` and `CRON_SECRET`. All page and API requests use HTTP Basic auth, except `/api/sync` which accepts a bearer cron secret.
7. Ensure **HTTPS only**; Basic auth must never be transmitted over HTTP.
8. Build and test using `npm ci && npm run build`.

## Migration
Run once before deployment, after taking a D1 backup:

```bash
npx wrangler d1 execute seogets-db --remote --file=./migrations/001_data_integrity.sql
```

The migration is additive. Historical data remain in legacy tables, but are not
trusted as *complete* because earlier imports could finish partially or cap pages
and queries. Re-import the required finalized dates via `/import` to populate
`import_status`. Dates less than 3 days old are intentionally excluded.

## Operations
- `GET /api/check-dates` reports missing *completed* finalized dates.
- `GET /api/import-history?date=YYYY-MM-DD` imports a selected finalized day.
- `GET /api/sync` with `Authorization: Bearer <CRON_SECRET>` imports the
  finalized date 3 days before UTC today. Schedule with an external cron.
- `GET /api/search-console?days=28` reads the latest completed day.
- Cloudflare D1 and Search Console have quotas. Large historical backfills may
  need timeouts, rate-limiting, retries, or a background queue.

## Known gaps
- The dashboard's current filtering still builds SQL condition fragments,
  with quotes escaped and wildcard characters stripped. Convert it to
  positional parameter bindings before exposing to untrusted accounts.
- Cannibalization rows are **candidates for manual intent review**, not
  automatically confirmed harmful overlap.
- For a multi-client service, implement real accounts, a site membership ACL,
  tenant-aware schema, and OAuth for connecting properties.
- Automated integration tests against staging Google/D1 credentials remain
  necessary before production rollout.
