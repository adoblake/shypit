# Shypit design QA

final result: passed

## Scope and evidence

Selected target: the approved combined mockup (option 2 layout with option 1 navy, warm white, and teal colors). Compared the selected source image against the running business workspace at 1440 × 1024. Also inspected driver and business captures at 390 × 844. Current screenshots are committed under `docs/review/`.

## Verified

- Navy horizontal navigation, teal active indicators and actions, warm neutral base, pale teal selected rows and service options.
- Desktop shipment list on the left and booking detail/service rail on the right; recent routes below the list; clear primary booking action.
- Mobile uses touch-friendly stacked rows and form fields without horizontal overflow. Selecting a shipment or load scrolls to its details.
- Driver view adapts the shared visual system with clear payout, route, equipment, pickup window, and empty/loaded mileage.
- Status names pair icons with text. Inputs have labels, visible focus styles, and dialog keyboard dismissal/focus containment.
- Fonts are bundled locally so reference-site or font-provider access is not required.
- Six Playwright journey checks passed: three workflows at both desktop and mobile sizes. These include form errors, quote review, booking persistence, search/filter empty states, accepting a job, pickup, required delivery-proof filename, delivery, earnings, navigation, no horizontal overflow, and no uncaught JavaScript errors in the navigation test.
- Production build passed.

## Intentional product additions

The working app adds a New shipment action, record IDs, explicit demo notice, and a timeless workspace subtitle in place of the mockup's static date. Demo notices identify disconnected live services. These keep the approved visual hierarchy while making review interactions clear.

## Follow-up polish (P3)

The mockup's typography and table labels are larger than the working dense desktop list. Further typography tuning can follow real shipment content and pilot feedback. Mobile details currently appear in the document flow with selection scrolling; a dedicated detail screen/back action could be preferable as the job lifecycle grows.

## Limits

This is a browser-verified frontend foundation, not a live logistics service. No production backend, account authorization, verification, payments, GPS tracking, or actual dispatch has been validated. GitHub-hosted workflow execution and Pages deployment were not verified because GitHub API access is blocked in this environment.

## Deployment follow-up

Reproduced failure serving a non-Actions build at `/shypit/` with root-absolute asset paths. Changed Vite to relative asset paths. The production smoke test now verifies rendered business booking and driver acceptance at 1440px and 390px, with no failed HTTP assets or uncaught runtime errors. Both passed locally. This confirms the reproduced asset-path case is fixed; the live Pages cause remains unconfirmed while network access is blocked. The Pages workflow now also runs on foundation-branch pushes and gates deployment on the production smoke test.
