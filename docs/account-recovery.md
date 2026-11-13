# Password setup, account recovery and 24-hour locks

The frontend now includes **Create your password**, **Forgot password?**, and **Forgot email?**. Real operation requires the database security migration, server function, and email delivery below. A public project key cannot install these or send administrative invitations on its own.

## What the processes do

- **Create your password:** enter an administrator-approved email. The server sends an invitation link through Supabase. Open the link, confirm the invited address, and enter a new password twice. New passwords must be 12–128 characters. Membership activates only after the identity provider validates email ownership. You do not have to invent a password in the dashboard first.
- **Forgot password:** enter the registered email and open the secure recovery link. The app never sets a password from an email address alone. Supabase validates the link before the server accepts the new password.
- **Forgot email:** enter your full name, organization and an alternate contact email. The server records a private administrator-review request. It does not expose an account directory, guess an email, or automatically disclose a registered address. An administrator must independently verify the person's identity and respond through an approved channel.
- Known and unknown emails receive the same setup/reset response. No one can use the form to discover who has an account.

## Exact attempt policy

- Sign-in: 10 consecutive failed credential/access attempts within 24 hours lock the Shypit sign-in process for 24 hours. A successful authorized sign-in before the threshold resets failures. A valid tenth attempt can succeed; a failed tenth attempt locks access.
- Password proof verification: 10 failed setup/reset completions lock that process for 24 hours. Expired, incorrect, replayed, or mismatched email proof counts as failure.
- Link requests: setup requests, password-reset requests, and email-help requests each have a maximum of 10 per normalized email per 24 hours. The tenth request may complete; subsequent requests are refused for 24 hours. This prevents a successful email request from resetting its own budget.
- Counters, reservations, and UTC lock deadlines live in a private database schema. Browser storage does not determine access. Locks do not extend indefinitely on every denied retry. Concurrent and abandoned requests cannot restore a used budget.
- The gateway issues a short-lived **application session permit** only after validated credentials and active membership. Database policies require that permit in addition to the provider JWT. Calling Supabase's native password endpoint directly cannot grant workspace access or bypass a Shypit lock. Existing permitted sessions also lose database access while their account's sign-in/password-completion process is locked.

This enforces Shypit application access. It does not claim to replace every Supabase identity endpoint's own controls. Supabase's native password-verification hook is a Teams/Enterprise feature; this implementation avoids that paid dependency. See the official [Auth hooks plan table](https://supabase.com/docs/guides/auth/auth-hooks).

## One-time activation

### 1. Install the database and approved email invitations

Use the newly generated **private founder SQL file** supplied in chat. It now includes the workspace schema, auth security tables/policies, and both approved founder email invitations. It no longer requires pre-created Auth users. Run it as project administrator in Supabase's SQL editor.

Regenerate if needed:

```sh
node scripts/provision-founders.mjs OWNER_EMAIL PARTNER_EMAIL --fresh > /tmp/shypit-founders.sql
```

If Shypit tables already exist, use `--existing` instead. Existing sample work, active memberships, and revocations are preserved. Do not post this generated file publicly; it contains approved emails. `supabase/auth-security.sql` can also be applied separately to an existing schema, followed by administrator-seeded invitations.

### 2. Deploy the server function

Option A, from GitHub:

1. Create a Supabase personal access token in your Supabase account settings.
2. Store it only in **GitHub → Settings → Secrets and variables → Actions → New repository secret**, named `SUPABASE_ACCESS_TOKEN`. Never put it in chat or a `VITE_` variable.
3. Run **Deploy authentication backend** from GitHub Actions. It deploys `supabase/functions/shypit-auth` to this project. This does not apply SQL or configure SMTP; those remain separate administrative settings.

Option B, with the Supabase CLI:

```sh
supabase login
supabase functions deploy shypit-auth --project-ref mzztaucyapmwlnuiljsv --no-verify-jwt --use-api
```

The Edge Function's service-role key is supplied automatically by Supabase to server code. It never enters the frontend, response payloads, or browser storage. `verify_jwt=false` is required because sign-in starts unauthenticated; the function performs identity checks, private rate-limit RPC calls and email-proof verification itself. Only the configured app origin is permitted through CORS. If developing locally, set `SHYPIT_SITE_URL` for that function to the matching local site; do not use a wildcard origin.

### 3. Configure email delivery and links

In Supabase Authentication settings, configure a working SMTP sender suitable for the pilot. The built-in sender is restricted and is not sufficient for arbitrary Gmail/Yahoo recipients. Use an existing sender with a free allowance if available; no paid plan is required by this code, but delivery cannot work without a usable sender. Never put SMTP credentials in this repository or chat. No real emails were sent during local tests.

Set the Site URL and exact allowed redirect to:

`https://adoblake.github.io/shypit/`

Use these links in the corresponding Supabase email templates:

Invitation template:

```html
<a
  href="https://adoblake.github.io/shypit/?flow=setup&type=invite&token_hash={{ .TokenHash }}"
  >Create your Shypit password</a
>
```

Password-recovery template:

```html
<a
  href="https://adoblake.github.io/shypit/?flow=reset&type=recovery&token_hash={{ .TokenHash }}"
  >Reset your Shypit password</a
>
```

The app also accepts the standard Supabase invitation/recovery callback fragment, clears it from the URL, and keeps it only in memory for the password form. The server verifies it before updating a password and prevents reusing that recovery credential. Refreshing an in-progress recovery page requires opening/requesting a fresh link.

Set JWT lifetime to 900 seconds. Keep public signup closed for this invite-only preview. The server's privileged invitation flow creates only explicitly approved accounts.

### 4. Verify the live project

Each founder selects **Create your password**, receives a link, creates their own password privately, and signs in. Check invalid/expired links, sign-out, multi-workspace access, and recovery delivery. Test the exact lockout on a dedicated non-production test account before inviting users; do not intentionally lock a founder account while reviewing the site.

Local tests use actual PostgreSQL policy/lock logic with PGlite and a mocked identity/mail service. They do not prove the function has been deployed or real email delivery is working.

## Administrator review and retention

Review forgot-email requests in Supabase SQL Editor as administrator:

```sql
select id, full_name, organization, contact_email, created_at
from shypit_private.access_help
order by created_at desc;
```

Never give public API clients access to this table or to invitation/counter/session tables. Apply an appropriate retention policy to resolved access-help requests, finished reservation rows, expired permits, and used recovery receipts. Keep recovery receipts at least as long as the provider token lifetime; deleting them too early would permit replay during a still-valid token's lifetime. Keep lock rows until after their 24-hour window.
