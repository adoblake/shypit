# Design review

Captured from the running app in Chromium. Business and carrier navigation now comes from administrator-assigned membership; there is no public role selector. Rates, dates, carrier profiles, bookings, and payouts are illustrative.

## Desktop sign-in

![Desktop sign-in](desktop-login.png)

## Mobile sign-in

![Mobile sign-in](mobile-login.png)

These show the email/password preview entrance and the chooser for explicitly approved company and carrier memberships. Real login remains blocked until the two Auth accounts and database memberships are provisioned. Workspace screenshots below use intercepted test responses and sample data; they are not proof of a connected live account.

## Approved workspace chooser

![Desktop workspace chooser](desktop-workspace-choice.png)

![Mobile workspace chooser](mobile-workspace-choice.png)

## Desktop business workspace

![Desktop business workspace](desktop-business.png)

## Desktop driver workspace

![Desktop driver workspace](desktop-driver.png)

## Mobile business workspace

![Mobile business workspace](mobile-business.png)

## Mobile driver workspace

![Mobile driver workspace](mobile-driver.png)

For an interactive preview, follow the GitHub Pages instructions in the root README. Screenshots are review assets, not a live deployment.
