# Shypit accessibility review — 14 November 2026

Target: **WCAG 2.2 Level AA**, on desktop and mobile. This is an engineering review, not a declaration of full WCAG conformance.

## Scope and evidence

Fresh browser captures were taken before changes and again after fixes, from the current React application served locally. The app uses fictional business, carrier and owner accounts with intercepted API responses; no real password, banking data, invitation, shipment or permission was used. The screenshots show current application code, not a design mockup.

Chromium, 1440 × 1024 desktop and 390 × 844 phone. Additional regression checks exercise 320 CSS-pixel reflow and WCAG text-spacing overrides. A 320 CSS-pixel viewport exercises the reflow width used for a 1280-pixel desktop at 400% zoom; it is not a physical iPhone or native browser zoom test.

The initial 28 captures had **56 axe rule violations across 101 affected nodes** (instances across screens, not 101 unique defects). The same 28 states now have **zero automated violations** for WCAG A/AA through 2.2 and axe best-practice tags. Automated tools cover only part of accessibility. Full raw findings and manual-review flags: [before](before/results.json), [after](after/results.json).

## Flow walkthrough

“Clear” below means no axe violations in that captured state; the limitations below apply to every row.

| Step | Experience                            | Health after fixes        | Fresh screenshots                                                                              |
| ---- | ------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| 1    | Sign-in                               | Clear in automated checks | [Desktop](after/01-desktop-signin.png) · [Phone](after/15-mobile-signin.png)                   |
| 2    | Password setup                        | Clear in automated checks | [Desktop](after/02-desktop-account-setup.png) · [Phone](after/16-mobile-account-setup.png)     |
| 3    | Company shipments                     | Clear in automated checks | [Desktop](after/03-desktop-shipments.png) · [Phone](after/17-mobile-shipments.png)             |
| 4    | Shipment dialog                       | Clear in automated checks | [Desktop](after/04-desktop-shipment-dialog.png) · [Phone](after/18-mobile-shipment-dialog.png) |
| 5    | Load-board posting                    | Clear in automated checks | [Desktop](after/05-desktop-market-form.png) · [Phone](after/19-mobile-market-form.png)         |
| 6    | Package tracking                      | Clear in automated checks | [Desktop](after/06-desktop-tracking.png) · [Phone](after/20-mobile-tracking.png)               |
| 7    | Business billing and bank setup entry | Clear in automated checks | [Desktop](after/07-desktop-billing.png) · [Phone](after/21-mobile-billing.png)                 |
| 8    | Carrier member load board             | Clear in automated checks | [Desktop](after/08-desktop-carrier-board.png) · [Phone](after/22-mobile-carrier-board.png)     |
| 9    | Carrier practice loads                | Clear in automated checks | [Desktop](after/09-desktop-practice-loads.png) · [Phone](after/23-mobile-practice-loads.png)   |
| 10   | Carrier jobs                          | Clear in automated checks | [Desktop](after/10-desktop-jobs.png) · [Phone](after/24-mobile-jobs.png)                       |
| 11   | Carrier earnings and bank setup entry | Clear in automated checks | [Desktop](after/11-desktop-earnings.png) · [Phone](after/25-mobile-earnings.png)               |
| 12   | Admin overview                        | Clear in automated checks | [Desktop](after/12-desktop-admin-overview.png) · [Phone](after/26-mobile-admin-overview.png)   |
| 13   | Admin permissions                     | Clear in automated checks | [Desktop](after/13-desktop-admin-access.png) · [Phone](after/27-mobile-admin-access.png)       |
| 14   | Workflow video                        | Clear in automated checks | [Desktop](after/14-desktop-walkthrough.png) · [Phone](after/28-mobile-walkthrough.png)         |

## Findings and changes

| Priority | Finding and user impact                                                                                                                                               | Change                                                                                                                                                                                                           | Relevant WCAG criteria                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| High     | Small labels, selected shipment metadata, footer copy, admin badges and video chapter controls had insufficient contrast. Low-vision users could miss important text. | Darker teal and muted text; stronger form-control boundaries; instant state colors avoid low-contrast transition frames.                                                                                         | 1.4.3, 1.4.11                                       |
| High     | The compact phone sign-in hid the only h1 with its marketing story. The member load board had no main landmark; session and pilot notices sat outside named regions.  | A visible page h1 for sign-in and recovery, a main landmark for each workspace view, named account/pilot regions, and keyboard-visible skip navigation.                                                          | 1.3.1, 2.4.1, 2.4.6                                 |
| High     | Shipment dialogs used an open attribute without native modal isolation. A focus trap alone did not isolate the background from assistive technology.                  | Native showModal, accessible dialog names, inert background, Escape handling, focus containment and restoration.                                                                                                 | 2.1.1, 2.1.2, 2.4.3, 4.1.2                          |
| High     | A short secure session could end while someone was completing a form.                                                                                                 | Two-minute warning, an explicit server-checked Keep working action, and in-place reauthentication that retains the open workflow in memory. The warning is also available inside shipment dialogs.               | 2.2.1; supports continuity described by 2.2.5 (AAA) |
| Medium   | Admin statistics and tabs could overflow with narrow screens and custom text spacing.                                                                                 | Wrapping navigation, flexible grid columns, and wrapping long content.                                                                                                                                           | 1.4.10, 1.4.12                                      |
| Medium   | Navigation and selected practice loads/shipments relied on visual styling. Focus visibility did not cover every control type.                                         | Current-page and pressed states; focus indicators cover textarea, summary and programmatic destinations; page transitions move focus into main content, and descriptive document titles follow the current view. | 1.3.1, 2.4.2, 2.4.3, 2.4.7, 4.1.2                   |
| Medium   | Password help and errors were not consistently associated with fields. Contact-field autofill could be improved.                                                      | Error/help descriptions linked to relevant controls, password mismatch state, and name/email/phone/organization autocomplete. Native labels and validation retained; paste/password managers remain available.   | 1.3.5, 3.3.1, 3.3.2, 3.3.8                          |
| Medium   | The silent workflow recording had only a brief summary; chapter links also failed contrast.                                                                           | Expanded text alternative covers the meaningful actions and outcomes for admin, business and carrier, with native playback controls and darker chapters.                                                         | 1.2.1, 2.1.1, 1.4.3                                 |

Representative comparisons: [sign-in before](before/15-mobile-signin.png) → [after](after/15-mobile-signin.png), [dialog before](before/04-desktop-shipment-dialog.png) → [after](after/04-desktop-shipment-dialog.png), [admin before](before/26-mobile-admin-overview.png) → [after](after/26-mobile-admin-overview.png).

Additional session evidence (all four axe scans clear): [desktop warning](after/desktop-session-warning.png), [desktop locked](after/desktop-session-locked.png), [phone warning](after/mobile-session-warning.png), [phone locked](after/mobile-session-locked.png), [raw session results](after/session-results.json). Chromium’s accessibility tree was also inspected to verify that the native shipment dialog excludes the background navigation and Sign out button.

## Security and session behavior

Private data still requires a gateway-issued database permit and an active membership or admin grant. The initial application permit remains 15 minutes. An explicit action during its final two minutes adds two minutes on the server, bounded by the verified provider token. The provider token is configured for one hour to permit at least ten extensions; it does not by itself authorize application data. Public clients cannot create permits or renew expired, foreign, revoked, or locked sessions. No refresh token is stored in the browser.

At expiry, the application removes its bearer token, revokes the old permit, hides the workspace and opens an isolated sign-in dialog. Credentials, identity and access are checked again before resuming the mounted workflow. Unsaved forms remain in this tab's memory, not local/session storage; refreshing, closing the tab or explicitly signing out clears them. The same ten-attempt/24-hour server lock applies to reauthentication. Banking may still require a recent password sign-in.

## Verification

The Playwright suite includes axe checks on sign-in/recovery, company/carrier/admin screens, the video transcript, and populated posting/quote/booking states. It also checks skip-link access, native modal isolation, keyboard containment and Escape, focus restoration, 320-pixel reflow, text-spacing overrides, timeout extension, expired-session locking, denied reauthentication and draft continuity. SQL security tests cover extension-window restrictions, ten repeat extensions, and denial for anonymous, foreign, expired, expiring-token and locked sessions.

Reproduce with:

```sh
npm ci
npm test
npm run test:policies
npm run test:auth-server
npm run build
npm run test:production
# With the dev server on port 4173:
A11Y_PHASE=latest node scripts/audit-accessibility.mjs
```

## Limits and remaining review

Before declaring WCAG conformance, run human assistive-technology checks on the actual site with VoiceOver/Safari on iPhone and macOS and NVDA/Firefox or Chrome on Windows. Include input errors, native date/select controls, modal reading order, warnings, bank-setup handoff and return, and the entire post → quote → confirm flow. Test actual browser zoom at 200% and 400%, text-only enlargement, forced colors, and reduced-motion preferences. The current automated/manual browser checks do not certify these combinations.

Axe still flags manual-review items involving contrast in complex content, links within text, and video captions. The walkthrough has no audio, so its alternative is a full text description of the silent video; audio captions are not applicable. Human review should still confirm the text captures the relevant visual information.

Stripe's hosted verification pages and Supabase/email-provider screens were not audited here. Their accessibility and end-to-end focus/return behavior need separate testing with sandbox accounts. No real identity, bank verification or payment was performed. Error, loading, stale-data and unusual content states beyond the tested fixtures can still reveal issues.
