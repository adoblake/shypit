# Private founder preview

The entrance is **email + password**, handled by Supabase Auth. Google is hidden for this preview. There is no shared password or public signup. After verification, approved founders can choose **Company workspace** or **Carrier / LLC workspace**, and switch between their assigned workspaces. The chooser never grants additional roles or memberships.

## Current activation status

A read-only check of the supplied Supabase project found email authentication enabled, Google disabled, and no `public.memberships` table in the API schema cache. This means real founder login is not ready until administrator setup is completed. The public publishable key cannot create Auth accounts or install database tables, and must not be replaced with a privileged secret in the frontend.

## Activate self-service password setup

Use [the account-recovery activation guide](account-recovery.md). The updated private setup SQL now allowlists both founder emails without requiring pre-created Auth users. Deploy the authentication gateway and configure a working email sender. Then each founder clicks **Create your password**, verifies their email link, and privately chooses their password in Shypit. Forgotten passwords use the same proof-of-email requirement; forgotten account emails go to administrator review.

All 10-attempt / 24-hour limits are server-enforced. Public signups and local-storage authentication flags do not grant preview access. Existing workspaces remain private until the security migration, backend, and memberships are active.

## What to test together

- Company: create a shipment, choose service, review cost, book, and inspect package tracking.
- LLC carrier: filter loads, review mileage/payout, accept a job, confirm pickup, record a proof filename, confirm delivery, and inspect pending earnings.
- Sign out and verify that navigation and private records disappear. A refresh requires sign-in again.
- Remove an approved membership and check that its workspace is no longer available.

These are isolated pilot journeys. Real carrier matching, cross-company dispatch synchronization, secure proof-file storage, and payments are not connected. The video labels the successful cross-company handoff as simulated.
