# Shypit

Responsive private freight workspace for businesses and carriers. React + Vite; the approved navy/teal design with desktop shipment/detail panels and mobile task flows.

## Access and setup

**The checked-in public Supabase settings target Shypit’s private pilot. Fresh projects require backend deployment, schema activation, and approved memberships.** There are no shared demo credentials or frontend-only access switches. Email/password is the private-preview entrance. Setup/reset links require email verification; forgotten email addresses require private administrator review. Google and email-code adapters remain disabled pending integration with the same gateway. A verified identity must also have an active administrator-assigned membership before workspace data is loaded.

[Activate the free-plan auth integration](supabase/SETUP.md). Password access requires the authentication gateway, database schema, and approved memberships. Google OAuth remains optional and disabled. Public GitHub repository variables can override the checked-in project settings. Privileged secrets stay out of the frontend.

## Founder preview

[Set up private access for you and Ronald](docs/preview-access.md). Both founders can be explicitly assigned company and LLC-carrier workspaces; the app lists only server-approved memberships. Passwords are created privately in Shypit after verifying a secure email link. [Activate password setup, recovery and server lockouts](docs/account-recovery.md).

[Watch the admin and team workflow walkthrough](https://adoblake.github.io/shypit/walkthrough/). The 103-second silent, captioned recording includes admin permissions, company booking, mobile LLC-carrier work, and delivery review, with chapter navigation and a portrait carrier clip. It uses fictional accounts and freight; dispatch handoff and payouts are simulated.

## Member load board

Businesses use **Load board** to post freight or prepare a post from an existing shipment. Carriers use **Find loads** to search shared member listings and submit private quotes or fixed-rate requests. A business confirms one carrier; the booking appears in **My jobs**, with exact addresses and contacts released only to the confirmed parties. Posting, requests, booking and cancellation are persisted across workspaces. **Practice with sample loads** retains the earlier simulated journey separately.

[Marketplace setup and security](docs/marketplace.md). New listings are not seeded in production. Real dispatch, shared delivery progression, verification of carrier authority, and payments remain separate work. The existing walkthrough is a scripted preview rather than a recording of this new marketplace.

## Run

Node 24 and npm 11:

```sh
npm ci
cp .env.example .env.local
# Configure public project settings in .env.local; never put privileged keys here.
npm run dev -- --host 0.0.0.0
npm run build
```

Without settings, the app deliberately shows the locked setup screen. Normal sign-in keeps tokens in memory, requires re-authentication after refresh, and expires after 15 minutes. Configure the provider's JWT lifetime accordingly as documented in the setup guide.

## Verification

```sh
npx playwright install chromium
npm test
npm run test:policies
npm run test:auth-server
npm run build
npm run test:production
```

Local tests use `/usr/bin/chromium`; `CI=1` uses Playwright's installed browser. Desktop and mobile browser tests intercept the identity API in the test runner—there is no test sign-in bypass in shipped code. Policy tests run real PostgreSQL RLS and trigger logic via PGlite with a minimal `auth.uid()` stand-in. Real-provider activation still requires the checks in the setup guide.

## Included workflows

- **Business:** create shipment drafts, review illustrative service prices, book sample shipments, inspect status, repeat routes, view sample carrier profiles and billing activity.
- **Carrier:** search sample loads by route/equipment, inspect payout and mileage, accept a sample job, confirm pickup, record proof filename, complete delivery, view pending sample earnings.
- Assigned roles replace the public role switch. Data loads from the authorized Supabase workspace; no freight dataset or bearer token is stored in local storage. Legacy demo storage is removed on startup.
- Workspace saves use revision checks; failed or conflicting saves lock the app and require reloading through sign-in.

## GitHub review

Pushes to `feat/shypit-foundation` run **Publish review site**, which builds and checks the locked production entrypoint at `/shypit/` before deployment. Pages must use **GitHub Actions** as its source. Missing auth settings result in a locked site, not an accessible demo.

[Review screenshots](docs/review/README.md). Existing workspace screenshots are sample views; live access now requires assigned membership. For Google-only sign-in no email sending is required. Nothing in this repository buys a subscription or activates paid billing.

## Pilot limitations

No real freight dispatch, location tracking, carrier authority verification, billing, or payouts are connected. Prices and dates are illustrative. Proof input saves only a filename to the private workspace; files are not uploaded. Businesses and carrier workspaces are isolated pilot journeys, not a shared dispatch backend. The JSON workspace model needs normalization and audited transactional server operations before real bookings. Do not treat frontend role visibility as an authorization boundary: database policies enforce access.

## Nationwide package tracking and partner review

Business navigation includes **Package tracking** for number/scanner/bulk intake, shipment linkage, travel history, exceptions and downloadable company reports. Package records save to the authenticated business workspace; live carrier synchronization and email/SMS are not connected. Apply the updated schema so business members can save packages.

The partner link is https://adoblake.github.io/shypit/?view=tracking and requires configured sign-in plus approved business membership. Location suggestions cover all 50 states, DC and territories. **Open Connecticut test package** and **Explore Connecticut freight** add missing sample records without overwriting existing work. Nationwide route entry does not verify carrier coverage; rates remain illustrative. See [partner testing](docs/partner-test.md) and [TMS integration](docs/tms.md).
