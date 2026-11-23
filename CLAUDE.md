# Shypit

Freight and shipping pilot: businesses post loads and book quotes, carriers and drivers accept and deliver, admins
manage members and finance. Vite + React + Supabase (RLS, edge functions `shypit-auth` and `shypit-banking`).
Private pilot.

## Run
- Node 24 / npm 11. `npm ci`, `cp .env.example .env.local` (public settings only), then `npm run dev -- --host 0.0.0.0`

## Verify (same as CI)
- `npm run test:policies` · `npm run test:auth-server` · `npm run build` · `npm test` (Playwright) · `npm run test:production`
- UI changes: run `verify-ui` at desktop and mobile.

## Ship
- `checks.yml` runs on every push. The review site publishes to GitHub Pages from `feat/shypit-foundation`.
- Database and edge-function changes go through their workflows (`auth-database`, `auth-backend`, `banking-backend`).
  Apply the database change **before** merging code that depends on it, and say so at the top of the PR.

## Gotchas
- Never add a sign-in bypass to shipped code. Tests intercept the identity API in the test runner instead.
- Privileged keys never go in the frontend or `.env.local`.
- Banking is sandbox/test-mode only. Rates are illustrative. Keep that labeled in the UI.
