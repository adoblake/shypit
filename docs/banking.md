# Banking setup: sandbox only

Business banking is under Billing; carrier/LLC payout onboarding is under Earnings. Shypit has no bank-number, routing-number, SSN, or tax-ID fields. Those values belong exclusively in Stripe's hosted Checkout / Connect forms. The server stores only provider customer/account and setup-session identifiers in a private schema; the frontend gets status or a short-lived hosted URL. No provider secret is bundled in the browser, workspace JSON, logs, or local storage.

This integration deliberately rejects live Stripe keys. It cannot charge, transfer, or pay out funds. A free Stripe test account is required to exercise the hosted forms; until its test key is connected, the UI reports that banking is not activated. Sandbox checks use fictional details only. Live bank collection and real transfers remain disabled. Standard processing and Connect services can have fees; review the current account's pricing and operational requirements before implementing live mode.

## Connect the free test environment

1. Create a Stripe account at https://dashboard.stripe.com/register and select its test environment. Enable/test ACH bank payments and Connect in that environment as required by Stripe.
2. Get the **test secret key** (`sk_test_…`) from the test API-keys page, https://dashboard.stripe.com/test/apikeys. Never paste it into chat or commit it.
3. At https://supabase.com/dashboard/project/mzztaucyapmwlnuiljsv/functions/secrets add an Edge Function secret named `STRIPE_TEST_SECRET_KEY` containing that test key. Do not use a live key or a publishable key.
4. The `banking-backend.yml` workflow deploys `shypit-banking`; the existing database activation workflow installs `banking.sql`. After adding the secret, refresh Banking status in Billing/Earnings. If the runtime has not picked up the secret, dispatch the banking backend workflow again.
5. Test both hosted journeys with Stripe's documented sandbox details, return to Shypit, sign in again, and refresh status. Provider API compatibility and end-to-end hosted verification still require testing against this account; current automated provider tests use an intercepted transport.

## Access and verification

A current Shypit session permit and an active membership in the exact workspace are required. Protected founders manage finances only for workspaces where they hold membership. Other members need an explicit workspace finance-manager grant. Owners can grant/remove it under Admin Login → People & permissions → Workspace access. A generic limited admin grant does not grant financial access. Changes are recorded in admin audit history. Gateway launch requests require a provider JWT issued within the previous five minutes. Expired/revoked permits and revoked finance grants are checked on every request.

Banking identifiers and launch audit records are private; authenticated clients cannot read or write them directly. The gateway derives the Stripe customer/account from server storage and never accepts a client-supplied provider ID, bank number, amount, or redirect URL. Launches are throttled per workspace and mode to one per minute. Provider account creation uses a workspace-bound idempotency key. Checkout links expire after 30 minutes; Connect links use Stripe's short-lived hosted URLs. Hosted forms can outlive the Shypit session until their own expiry.

A return URL is not proof of successful verification. Status is retrieved from Stripe using the stored setup-session/customer or connected account: the business SetupIntent must succeed, and the carrier account must report payouts enabled. Pending verification stays pending. Refresh is manual; there are no banking webhook handlers in this starting version. Existing business banking can be supplemented with another setup; method removal/default selection and live charging are not implemented. Carrier banking management uses Stripe's hosted Express dashboard when onboarding is complete.

Automated checks cover public-client denial, scoped finance grants, recent sign-in, revocation, private-storage denial, launch throttling, live-key refusal, strict request fields, hosted URL restrictions, and provider-confirmed status. Browser tests cover disabled/unavailable, restricted-member, sandbox, and pending states on mobile and desktop. These checks do not substitute for a production payment-provider review or prove real bank verification is activated.
