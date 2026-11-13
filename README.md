# Shypit

Responsive freight marketplace foundation for businesses and drivers. Built with React and Vite, following the selected navy/teal design with a shipment list and booking panel. Mobile has stacked workflows and touch-friendly controls; desktop keeps operational context beside the task.

## Preview the design

[Open the desktop and mobile screenshot gallery](docs/review/README.md). For an interactive review site, use the GitHub Pages workflow described below.

## Run locally

Node.js 24 and npm 11 are used in development.

```sh
npm ci
npm run dev -- --host 0.0.0.0
npm run build
```

## Browser checks

```sh
npx playwright install chromium
npm test
npm run build
npm run test:production
```

Local tests use `/usr/bin/chromium`. On a different machine, set `CI=1` to use Playwright's installed browser. Checks cover desktop (1440px) and mobile (390px), shipment validation/booking, persistent demo data, load search, job acceptance, pickup, delivery proof, earnings, navigation, and horizontal overflow.

## Included workflows

- **Business:** create shipment drafts; choose Standard/Priority; review transparent illustrative prices; confirm demo bookings; inspect shipment progress; repeat routes; browse sample carrier profiles; review billing activity.
- **Driver:** search loads by route/city and equipment; inspect payout, deadhead and loaded miles; accept demo jobs; confirm pickup; attach a proof filename; confirm delivery; view pending earnings; inspect document requirements.
- Local storage retains sample shipments and jobs on the same browser/device. Reset demo clears this app's data only.

## GitHub review

The `Build and browser checks` workflow builds and tests pushes, and uploads a `shypit-review` artifact containing the built site and desktop/mobile screenshots.

For a review website, enable **Settings → Pages → Source: GitHub Actions**, then run **Publish review site** on the branch containing this code. Pushes to `feat/shypit-foundation` also trigger this workflow. The workflow runs a production browser smoke test at `/shypit/` before publishing the demo, not a production transportation service. No live deployment is performed by local setup. Vite uses relative asset paths so builds work under `/shypit/` regardless of where they were built.

An empty repository may need its first pushed branch selected as the default branch in GitHub before manual workflows appear. The foundation branch can be reviewed directly without merging into a production branch.

## Explicit demo boundaries

There is no login, backend, cross-device sync, live carrier verification, live tracking, matching engine, payment processing, email, or freight dispatch. Sample dates are anchored to the design brief, not availability. Quotes are fixed sample prices, not route calculations. Driver payout estimates include empty miles but do not subtract costs. Document inputs save only the filename locally; nothing is uploaded. Do not enter personal, confidential, payment, or carrier credential data. Business and driver datasets demonstrate separate journeys and are not a shared dispatch backend.

## Next production steps

Add authenticated business/carrier accounts and server-side authorization; a database with audited shipment/job transitions and atomic load reservation; carrier authority/insurance verification; shipment eligibility and service terms; route/rate APIs; secure proof storage; billing/subscriptions and payout integrations; real tracking with consent; notifications; cancellation/dispute and waiting-time policies. Validate these with pilot businesses and carriers before real freight bookings.
