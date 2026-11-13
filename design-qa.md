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

## Invite-only access update

UI result: passed. Desktop (1440 × 1024) and mobile (390 × 844) sign-in screens were captured and inspected, along with authenticated sample business/carrier screens. Navy/teal branding, touch-friendly controls, readable errors, and the approved workspace structure remain intact. Google is the default sign-in; email verification is optional. The header displays assigned identity and sign-out instead of an unrestricted role selector. Review captures are committed under docs/review and use test-intercepted identity responses, not a live provider.

Validation: 28 browser checks passed at desktop/mobile sizes, including fail-closed missing configuration, bad codes, nonmembers, PKCE callbacks/verifiers, sign-out, session expiration, revocation checks, and authorized workflow persistence. Eight PostgreSQL policy scenarios passed through PGlite: anonymous reads, cross-workspace reads, mixed-role tenancy, self-invitation/role escalation, role-scoped writes, nonmembers, and revoked membership. Production /shypit/ checks pass at both viewports with no public workspace access.

Activation result: blocked on external setup. No actual Supabase project, Google OAuth client, or approved live memberships are configured. Local browser tests mock the identity service; policy tests use PostgreSQL with a minimal auth.uid stand-in. Real Google authentication and deployed Supabase policies still require activation and verification using supabase/SETUP.md. Do not describe the live service as fully secured/activated based only on frontend tests.

## Supplied project configuration

The user-provided project URL and public publishable key are now in config/public-auth.json, with environment-variable overrides retained. Production build and logged-out /shypit/ checks passed at desktop/mobile sizes with these settings. The provider API could not be reached because the running environment denies its hostname; a domain addition has been saved to the environment draft. Key validity, Google provider status, applied schema, and real membership access remain unverified. Public configuration alone does not activate authentication or grant workspace access.

## Email/password founder preview and walkthrough

UI result: passed. The preview entrance now uses labeled email/password inputs, a show/hide password control, generic sign-in errors, and no public signup. Google is hidden by the supplied public config. Supabase's real settings endpoint confirms email auth enabled and Google disabled; its membership endpoint reports the table is not installed. Real preview accounts therefore remain an external activation requirement.

Assigned multi-workspace access is explicit, not an unrestricted role switch. The membership primary key now allows an approved user to belong to both company and carrier workspaces. Row policies still scope all reads/writes to active memberships and workspace kind. The chooser shows only server-returned memberships; switching refetches and verifies them. Passwords are sent only to the configured identity provider, cleared from input state after authentication/failure/sign-out, and never persisted in browser storage.

Validation: 40 browser checks passed on desktop/mobile, including three new password/preview journeys at both sizes. Database policy checks passed, including generated founder provisioning, role-scoped updates, and preserving data/revocations when setup repeats. The production entrypoint remains locked without an authorized session.

Video: actual browser interactions recorded with sample accounts and intercepted data responses; company booking on desktop, LLC carrier operations on mobile, company delivery update on desktop. The recording is marked SCRIPTED PREVIEW / SAMPLE ACCOUNTS & DATA throughout. The cross-company handoff is simulated only in the recording harness. No real authentication, shipment, proof upload, or payment is claimed. Final encoding is H.264 MP4, 1280×900 with aspect-preserving mobile pillarboxing. Representative frames from all three chapters were inspected.

Walkthrough playback additionally verified in Chromium against the built `/shypit/walkthrough/` player at desktop and mobile widths: media metadata loaded, duration matched the 55-second scenario, and playback advanced. The video uses fictional data and includes no founder emails/passwords. A private founder setup SQL file was generated outside the checkout after the user supplied both approved emails; it has not been applied to the live project.
