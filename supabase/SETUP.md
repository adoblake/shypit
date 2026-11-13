# Activate invite-only Shypit access

The supplied public project settings are connected in code. Until provider/database activation, no private workspace can open; the sign-in screen may appear but successful live access is not yet verified. There is no demo password, local-storage authentication flag, or publicly accessible workspace dataset in the built site.

## Free-plan choice

Use a Supabase **Free** project and Google OAuth with basic identity scopes. This avoids SMS, paid SSO, and an SMTP dependency. No subscription or payment integration is installed by this app. Review current terms and limits at https://supabase.com/pricing and the Google OAuth console before enabling services; free projects have quotas and may pause when inactive. Do not upgrade or enable paid services for this pilot.

Email-code login is optional and off by default. Supabase's built-in sender is restricted and is not a general production email service. Only enable email codes after configuring a suitable SMTP sender and checking its free-plan limits. Do not assume arbitrary invited addresses can receive email through Supabase's default sender.

## 1. Create the identity and data service

1. Create a free Supabase project that you control.
2. Run `supabase/schema.sql` in its SQL editor. It creates workspace and membership tables, row-level access policies, and role-restricted updates. Apply once to a new project; this is an initial schema, not a rerunnable migration.
3. Configure Auth's JWT expiry to **900 seconds**. Shypit does not retain refresh tokens or automatically extend sessions. Session memory is cleared on refresh, sign-out, expiry, or inactivity. A provider JWT can remain valid until its server-configured expiry; the frontend's inactivity timer is not a server revocation mechanism.
4. In Auth URL configuration, set Site URL and the exact redirect allowlist entry to `https://adoblake.github.io/shypit/`. Add `http://localhost:5173/` only if you need local development. Avoid wildcard redirect entries.

## 2. Enable Google sign-in

1. Create a Google Cloud OAuth client for a web application. Configure its consent screen using only basic email/profile identity scopes. Start with your own accounts as test users; check Google's publishing requirements before inviting wider users.
2. Use the callback URL shown in Supabase's Google provider settings (normally `https://PROJECT_REF.supabase.co/auth/v1/callback`) as Google's authorized redirect URI.
3. Enter the Google client ID and client secret **only in Supabase's Google provider settings**. Never put the client secret in the repository, frontend variables, or chat.
4. Enable the Google provider. A Google identity alone must never grant a workspace membership. Shypit checks the active membership and database policies after every successful identity verification.

For onboarding without an email sender, allow the intended person to attempt Google sign-in once so Supabase records their Auth user; they will be denied workspace access. Confirm the invitation independently, then assign membership as below. You can instead pre-create the confirmed Auth identity administratively. An unapproved person may have an Auth identity but cannot read or create workspace records. There is no automatic workspace-signup trigger.

## 3. Provision approved pilot users

Only the project administrator can create or change membership records. Keep business and carrier workspaces separate: a workspace has a fixed `kind`, and membership roles must match that kind.

For a first sample workspace, run locally:

```sh
node scripts/provision-pilot.mjs business approved-business@example.com
# or:
node scripts/provision-pilot.mjs driver approved-driver@example.com
```

The command prints SQL containing **sample freight records only**. Review it and run it in Supabase's SQL editor as administrator. It requires an existing Auth user with that email and creates a private workspace and active membership in one transaction. It will fail rather than silently replacing existing membership.

To add another teammate to the same organization, insert a membership with their Auth user ID, that organization's existing workspace ID, and the matching role. Confirm the identity and organization before assigning it. Only intended members of a workspace may read its entire pilot dataset.

To revoke access, set their `memberships.active` to `false`. Database policies immediately deny subsequent reads/writes. The open app also checks membership every minute and when it becomes visible, but previously viewed information cannot be recalled from a user's memory or screenshots.

## 4. Connect GitHub Pages

The supplied project URL and public publishable key are now recorded in `config/public-auth.json`. The default Pages build uses those public settings. The provider, schema, and memberships still require activation and live verification. These public identifiers grant no privileged database access; row-level policies remain the security boundary.

To override the checked-in public settings for another project:

In GitHub repository **Settings → Secrets and variables → Actions → Variables**, add:

- `VITE_SUPABASE_URL`: the project's HTTPS URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: its **publishable** key (or legacy `anon` key).

These are public identifiers, not privileged secrets. The build rejects service-role/secret keys. Do not put a service-role key or Google client secret into any `VITE_` setting.

Run **Publish review site** on `feat/shypit-foundation`. The build writes a public `auth-config.json` using those settings. Missing configuration locks the site; it does not enable demo access.

For local development, copy `.env.example` to ignored `.env.local`, enter the two public project settings, then restart `npm run dev`. Add the local callback URL to Supabase if testing Google locally.

Optional email codes require `VITE_ENABLE_EMAIL_OTP=true`, a working SMTP service, and a Supabase email template containing `{{ .Token }}`. Pass that variable to the Pages build if enabling it. The app requests `create_user: false` and never self-provisions membership.

## 5. Validate the real project before using real information

- Approved business user can sign in, create a sample shipment, and reload/re-authenticate to see the saved record.
- Approved carrier user can sign in and save a sample job; there is no business/driver role selector.
- An authenticated person without active membership is denied; another organization's workspace cannot be fetched using their bearer token.
- Revoked members are denied subsequent reads/writes. Membership and role cannot be changed through the public key/user API.
- Sign-out removes the workspace. Refresh requires sign-in again. A copied session token expires within the configured server JWT lifetime.

Local tests verify browser behavior against an intercepted identity API and run the SQL policies in PostgreSQL via PGlite. They do **not** establish real Google consent, Supabase configuration, email delivery, or deployed project readiness. Those require this actual-project check.

This remains a pilot data model: workspace JSON supports the existing demo journeys and optimistic revision checks, not an atomic cross-company freight marketplace, live reservations, payments, or dispatch. Move those operations to audited server transactions before real bookings.

## Enable package tracking on an existing project

If the original schema is already installed, run `supabase/packages-migration.sql` as the administrator before publishing the tracking module. Fresh projects use the updated `schema.sql` instead. The migration permits business members to update packages within their own workspace, validates the packages array, and keeps carrier members limited to job updates. It does not grant access to any new members. National sample loads are included when provisioning a new sample carrier workspace.
