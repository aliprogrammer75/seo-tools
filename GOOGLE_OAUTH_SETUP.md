# Google OAuth mode (no Cloudflare Access subscription)

## Security design
- Google authorization-code flow uses PKCE, CSRF state verification and server-side code exchange.
- The configured `GOOGLE_OAUTH_REDIRECT_URI` must be an **exact** HTTPS origin and callback path.
- Google ID tokens are signature-validated (Google JWKS RS256), including issuer, audience, expiry and verified email.
- Only emails in `ADMIN_EMAILS` or invited by the admin can log in. Other users are denied.
- Login creates a 7-day opaque HttpOnly / Secure / SameSite=Lax cookie; only its SHA-256 hash is stored in D1.
- Google refresh tokens are encrypted at rest with AES-256-GCM using `TOKEN_ENCRYPTION_KEY`.
- API endpoints check the active session, **and** site-level membership for reads/imports. Site management is admin-only.
- Admin may grant 'viewer' access to a collaborator without sharing their Google Search Console account.
- Site GSC source can be assigned only after checking the user's *actual* GSC property permissions.
- A scheduled import uses the linked consenting user's Google refresh token, not the collaborator's.
- Browser requests never receive Google refresh tokens, OAuth client secret, or encryption key.

## Deployment sequence
1. Apply the new `0003_google_oauth.sql` migration to **staging only**.
2. Create a Google OAuth Web client and register **both** exact HTTPS redirect URIs:
   - `https://YOUR_HOST/api/auth/google/callback` (login)
   - `https://YOUR_HOST/api/google/callback` (Search Console connect)
   Set `GOOGLE_OAUTH_REDIRECT_URI` to the **first** URI.
3. Configure all variables from `.dev.vars.example` as **Cloudflare Worker secrets**.
4. If the Google OAuth consent screen is in Testing, add the desired tester Gmail accounts.
5. Verify Google Search Console API is enabled for the OAuth project's Google Cloud project.
6. Deploy to an HTTPS staging domain. Test signed-out access, signing in, callback cancellation, session expiry, and team/site isolation.
7. Sign in as an admin, connect Search Console, then assign a Google account to a site and run a one-day staging import.
8. Verify D1 sync counts/metrics against GSC before enabling cron.
9. Do not migrate the incompatible legacy production `seogets-db` without a separately verified data migration.

**Important:** Google may require OAuth app verification before broad public use.
Do not disclose OAuth client secret, encryption keys, or refresh tokens in repositories or messages.

## Account management
- Admin dashboard: `/team` (invite emails, grant/revoke viewer or manager access per site).
- Connect Google Search Console from `/sites` via **اتصال جیمیل به سرچ کنسول** and **انتخاب جیمیل متصل**.
- `/api/google/properties` lists sites accessible to the connected account; access cannot be granted by typing a site name.
- An invited viewer cannot import data or manage sites; a manager of a site can import that site, while only a global admin can configure projects and OAuth sources.
