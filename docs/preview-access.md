# Private founder preview

The entrance is **email + password**, handled by Supabase Auth. Google is hidden for this preview. There is no shared password or public signup. After verification, approved founders can choose **Company workspace** or **Carrier / LLC workspace**, and switch between their assigned workspaces. The chooser never grants additional roles or memberships.

## Current activation status

A read-only check of the supplied Supabase project found email authentication enabled, Google disabled, and no `public.memberships` table in the API schema cache. This means real founder login is not ready until administrator setup is completed. The public publishable key cannot create Auth accounts or install database tables, and must not be replaced with a privileged secret in the frontend.

## Set up the two accounts

1. In [Supabase Authentication → Users](https://supabase.com/dashboard/project/mzztaucyapmwlnuiljsv/auth/users), use the administrator **Create user** flow for each approved email. Each person should enter their chosen password privately in the secure provider UI. Confirm each account only after verifying the person's identity/email. Do not post passwords in chat or commit them. If you cannot arrange private provider entry, use an administrator-provisioned account and a secure, out-of-band password handoff; do not use a shared preview credential.
2. Keep email authentication enabled. No public signup UI is provided by Shypit. Disable new public signups in Supabase for this manually provisioned preview. Email/password login does not need Google or an SMTP sender for existing confirmed accounts. Password recovery by email still requires a suitable sender; administrators can manage resets until that is connected.
3. Configure the Supabase JWT lifetime to 900 seconds. The app keeps tokens in memory and signs out after inactivity, refresh, or expiry. Database membership policies enforce actual access.
4. Generate the account setup SQL privately, after choosing the two emails:

```sh
node scripts/provision-founders.mjs YOUR_EMAIL RONALDS_EMAIL --fresh > /tmp/shypit-founders.sql
```

`--fresh` is for the current project with no Shypit tables. It includes the initial schema and creates two sample workspaces plus both founders' approved memberships in one transaction. Both Auth users must exist and be confirmed, or the transaction rolls back.

For an existing project where the schema was already installed, use `--existing`; it upgrades the old membership key if necessary and preserves existing preview records. Do not run `--fresh` over an installed schema.

5. Review the generated SQL and paste it into the [Supabase SQL Editor](https://supabase.com/dashboard/project/mzztaucyapmwlnuiljsv/sql/new). This is an administrator action; never attempt it with the public key. Generated SQL includes your emails and should stay out of the public repository.
6. Open the deployed Shypit site and sign in using your own account. Choose the company or carrier workspace. Ronald should sign in separately with his own account. The two founders share the approved sample workspaces, while the roles retain separate write permissions.

## What to test together

- Company: create a shipment, choose service, review cost, book, and inspect package tracking.
- LLC carrier: filter loads, review mileage/payout, accept a job, confirm pickup, record a proof filename, confirm delivery, and inspect pending earnings.
- Sign out and verify that navigation and private records disappear. A refresh requires sign-in again.
- Remove an approved membership and check that its workspace is no longer available.

These are isolated pilot journeys. Real carrier matching, cross-company dispatch synchronization, secure proof-file storage, and payments are not connected. The video labels the successful cross-company handoff as simulated.
