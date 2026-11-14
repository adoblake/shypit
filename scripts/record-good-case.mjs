// Actual UI recording with fictional accounts and intercepted auth/database/provider status.
// No live sign-in, external bank verification, freight dispatch or payment occurs.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import {
  installAuthMock,
  passwordSignIn,
} from "../tests/fixtures/auth-mock.js";
import { installMarketMock } from "../tests/fixtures/market-mock.js";
const out = "docs/walkthrough",
  store = [];
await mkdir(out + "/raw", { recursive: true });
const business = "a1111111-1111-4111-8111-111111111111",
  driver = "b2222222-2222-4222-8222-222222222222";
const owner = "11111111-1111-4111-8111-111111111111",
  shipper = "22222222-2222-4222-8222-222222222222",
  operator = "33333333-3333-4333-8333-333333333333";
const password = "Sample-only-not-a-real-password!";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
  slowMo: 90,
});
async function setup(name, role, mobile = false, admin = false) {
  const viewport = mobile
    ? { width: 390, height: 844 }
    : { width: 1280, height: 900 };
  const context = await browser.newContext({
      viewport,
      timezoneId: "America/Phoenix",
      recordVideo: { dir: out + "/raw", size: viewport },
    }),
    page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      document.body.style.paddingTop = "28px";
      for (const [id, position, text] of [
        ["recording-label", "top", "SCRIPTED DEMO · FICTIONAL ACCOUNTS & DATA"],
        ["recording-caption", "bottom", ""],
      ]) {
        const div = document.createElement("div");
        div.id = id;
        div.textContent = text;
        Object.assign(div.style, {
          position: "fixed",
          [position]: "0",
          left: "0",
          right: "0",
          zIndex: "9999",
          background: "#101d32",
          color: id === "recording-label" ? "#b4e5dc" : "white",
          font: `${id === "recording-label" ? "10" : "15"}px "DM Sans", sans-serif`,
          padding: id === "recording-label" ? "7px 10px" : "15px 18px",
          lineHeight: "1.5",
          textAlign: "center",
          pointerEvents: "none",
        });
        document.body.append(div);
      }
    });
  });
  const workspace = role === "business" ? business : driver;
  const auth = await installAuthMock(page, {
    role,
    userId: admin ? owner : role === "business" ? shipper : operator,
    userEmail: admin
      ? "owner.demo@example.test"
      : role === "business"
        ? "shipper.demo@example.test"
        : "carrier.demo@example.test",
    emailOtpEnabled: false,
    googleEnabled: false,
    memberships: [
      {
        workspace_id: workspace,
        role,
        display_name:
          role === "business" ? "Cedar Supply Co." : "Open Road Logistics LLC",
      },
    ],
    banking: {
      configured: true,
      canManage: true,
      mode: "test",
      state: "not_connected",
    },
    ...(admin
      ? {
          adminProfile: {
            owner: true,
            capabilities: ["stats", "operations", "access", "audit", "testing"],
          },
          adminData: {
            stats: {
              workspaces: 2,
              active_memberships: 4,
              shipments: 3,
              jobs: 0,
              packages: 0,
            },
            access: {
              users: [
                {
                  id: owner,
                  email: "owner.demo@example.test",
                  owner: true,
                  active: true,
                  capabilities: [],
                },
                {
                  id: shipper,
                  email: "shipper.demo@example.test",
                  owner: false,
                  active: false,
                  capabilities: [],
                },
              ],
              memberships: [
                {
                  user_id: shipper,
                  workspace_id: business,
                  role: "business",
                  display_name: "Cedar Supply Co.",
                  active: true,
                  finance_manager: false,
                },
              ],
            },
            operations: [],
            audit: [],
            testing: {},
          },
        }
      : {}),
  });
  await installMarketMock(page, store, workspace, role);
  await page.goto("http://127.0.0.1:4173");
  await page.evaluate(() => document.fonts.ready);
  return { name, page, context, auth, errors };
}
async function scene(page, text, min = 2200) {
  await page.evaluate((text) => {
    document.getElementById("recording-caption").textContent = text;
  }, text);
  await page.waitForTimeout(
    Math.max(min, text.trim().split(/\s+/).length * 270),
  );
}
async function finish(s) {
  expect(s.errors).toEqual([]);
  await s.page.close();
  await s.context.close();
  await s.page.video().saveAs(out + "/raw/" + s.name + ".webm");
  console.log("Recorded " + s.name);
}
async function login(s, admin = false) {
  if (admin) {
    await s.page
      .getByRole("button", { name: "Admin Login", exact: true })
      .click();
    await s.page
      .getByLabel("Email address", { exact: true })
      .fill("owner.demo@example.test");
    await s.page.getByLabel("Password", { exact: true }).fill(password);
    await s.page.getByRole("button", { name: "Sign in as admin" }).click();
  } else await passwordSignIn(s.page, s.auth.userEmail, password);
}
try {
  // 1. Owner: real public admin entry, scoped permissions, and finance access.
  const a = await setup("00-admin", "business", false, true),
    p = a.page;
  await scene(
    p,
    "1 · Admin: an approved owner starts with Admin Login beneath the sign-in button.",
  );
  await login(a, true);
  await expect(
    p.getByRole("heading", { name: "Keep good work moving." }),
  ).toBeVisible();
  await scene(
    p,
    "The owner sees pilot statistics. These sample record counts are not revenue or verified deliveries.",
  );
  await p
    .getByRole("button", { name: "People & permissions", exact: true })
    .click();
  await p.getByLabel("Admin access enabled").check();
  await p.getByLabel("Overview", { exact: true }).check();
  await scene(
    p,
    "Assign only the access a teammate needs. This shipper receives Overview-only admin access.",
  );
  await p.getByRole("button", { name: "Review admin changes" }).click();
  await scene(
    p,
    "Review permissions before confirming. Founder accounts remain protected.",
    2400,
  );
  await p.getByRole("button", { name: "Confirm admin changes" }).click();
  await expect(p.getByText("Limited admin", { exact: true })).toBeVisible();
  await p
    .getByRole("button", { name: "Grant finance access" })
    .scrollIntoViewIfNeeded();
  await scene(
    p,
    "Finance access is separate: an owner assigns it for the specific company workspace.",
  );
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "Grant finance access" }).click();
  await expect(
    p.getByRole("button", { name: "Remove finance access" }),
  ).toBeVisible();
  await p.getByRole("button", { name: "Audit history", exact: true }).click();
  await scene(p, "Both access changes are recorded in the audit history.");
  await finish(a);
  if (process.env.SHYPIT_RECORD_ONLY !== "admin") {
    // 2. Small B2B business posts a real UI listing to the shared sample store.
    const c = await setup("01-company", "business"),
      q = c.page;
    await scene(
      q,
      "2 · Business: Cedar Supply Co. needs eight pallets of office supplies delivered to Harbor Office Goods.",
    );
    await login(c);
    await q.getByRole("button", { name: "Load board", exact: true }).click();
    await q
      .getByRole("button", { name: "Post a shipment", exact: true })
      .click();
    const pickup = new Date(Date.now() + 3 * 86400000)
        .toISOString()
        .slice(0, 10),
      delivery = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
    for (const [label, value] of [
      ["Business name", "Cedar Supply Co."],
      ["Pickup city and state", "Phoenix, AZ"],
      ["Delivery city and state", "Los Angeles, CA"],
      ["Pickup date", pickup],
      ["Delivery date", delivery],
      ["Pallets", "8"],
      ["Weight (lb)", "6400"],
    ])
      await q.getByLabel(label, { exact: true }).fill(value);
    await q
      .getByRole("combobox", { name: "Cargo category", exact: true })
      .selectOption("Office supplies");
    await q
      .getByLabel("Business name", { exact: true })
      .scrollIntoViewIfNeeded();
    await scene(
      q,
      "Members see the business, city-to-city route, dates, equipment and cargo. The business requests private quotes.",
    );
    for (const [label, value] of [
      [
        "Pickup street address",
        "Cedar Supply Co. · 123 Sample Dock, Phoenix, AZ",
      ],
      [
        "Delivery street address",
        "Harbor Office Goods · 456 Sample Receiving, Los Angeles, CA",
      ],
      ["Shipping contact name", "Sample Shipping Team"],
      ["Shipping contact email", "shipping.demo@example.test"],
      ["Shipping contact phone", "555-010-1000"],
    ])
      await q.getByLabel(label, { exact: true }).fill(value);
    await scene(
      q,
      "Exact addresses and contact details stay private until a carrier booking is confirmed.",
    );
    await q
      .getByRole("button", { name: "Review listing", exact: true })
      .click();
    await scene(
      q,
      "The business reviews the post before publishing it to approved carrier members.",
    );
    await q
      .getByRole("button", { name: "Publish to member load board" })
      .click();
    await expect(
      q.getByText("Shipment posted to approved carrier members."),
    ).toBeVisible();
    expect(store).toHaveLength(1);
    await scene(
      q,
      "The shared post is saved. Carrier members can now find it; no dispatch or charge has been triggered.",
    );
    await finish(c);
    // 3. Carrier finds the post, submits a private reviewed quote on mobile.
    const r = await setup("02-carrier-mobile", "driver", true),
      m = r.page;
    await scene(
      m,
      "3 · Carrier: the compact mobile sign-in gets the independent LLC operator straight to work.",
    );
    await login(r);
    await m.getByLabel("Search member loads").fill("Phoenix");
    await m
      .getByRole("combobox", { name: "Load equipment", exact: true })
      .selectOption("Dry van");
    await scene(
      m,
      "Open Road Logistics LLC searches member-posted work by route and equipment.",
    );
    await m.locator(".market-listing").click();
    await expect(
      m.getByText("Pickup: Cedar Supply Co.", { exact: false }),
    ).toHaveCount(0);
    await scene(
      m,
      "The carrier reviews the freight. Dock addresses and shipper contacts are still hidden.",
    );
    await m
      .getByRole("button", { name: "Submit a quote", exact: true })
      .click();
    for (const [label, value] of [
      ["Carrier / LLC name", "Open Road Logistics LLC"],
      ["Your quote (USD)", "920"],
      ["Carrier contact name", "Sample LLC Operator"],
      ["Carrier contact email", "operator.demo@example.test"],
      ["Carrier contact phone", "555-010-2000"],
    ])
      await m.getByLabel(label, { exact: true }).fill(value);
    await m
      .getByRole("button", { name: "Review request", exact: true })
      .click();
    await scene(
      m,
      "Review the $920 quote. It is private to the business; contact details are shared only after confirmation.",
    );
    await m.getByRole("button", { name: "Send request to business" }).click();
    await expect(
      m.getByText("Request sent to the business.", { exact: false }),
    ).toBeVisible();
    await scene(
      m,
      "My requests shows the pending offer. Sending a quote does not reserve the load or schedule a payout.",
    );
    await finish(r);
    // 4. Business chooses a carrier and sees the selected contact after confirmation.
    const b = await setup("03-company-confirm", "business"),
      s = b.page;
    await login(b);
    await s.getByRole("button", { name: "Load board", exact: true }).click();
    await s.locator(".market-listing").click();
    await expect(
      s.getByText("operator.demo@example.test", { exact: false }),
    ).toHaveCount(0);
    await scene(
      s,
      "4 · Business: review the private $920 quote. Carrier credentials and shipment terms need separate confirmation.",
    );
    s.once("dialog", (d) => d.accept());
    await s.getByRole("button", { name: "Confirm carrier booking" }).click();
    await expect(
      s.getByText("Carrier confirmed.", { exact: false }),
    ).toBeVisible();
    expect(store[0].state).toBe("booked");
    await scene(
      s,
      "The business confirms one carrier. Addresses and contacts are released to the confirmed parties.",
    );
    await s.getByRole("button", { name: "Billing", exact: true }).click();
    await s
      .getByRole("heading", { name: "Business payment account" })
      .scrollIntoViewIfNeeded();
    await s
      .getByRole("button", { name: "Add payment account", exact: true })
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
    await scene(
      s,
      "Finance-authorized business staff start bank setup in Billing. Stripe handles verification in a secure separate tab.",
    );
    await scene(
      s,
      "This is test mode. No real banking verification, shipment charge or subscription is completed in this recording.",
    );
    await finish(b);
    // 5. Confirmed shared job and secure payout entry point, shown in portrait.
    const f = await setup("04-carrier-job-banking", "driver", true),
      t = f.page;
    await login(f);
    await t.getByRole("button", { name: "My jobs", exact: true }).click();
    await expect(
      t.getByRole("heading", { name: "Booked through the load board" }),
    ).toBeVisible();
    await scene(
      t,
      "5 · Carrier: after business confirmation, the shared booking appears in My jobs.",
    );
    await t.locator(".market-listing").click();
    await expect(
      t.getByText("Pickup: Cedar Supply Co.", { exact: false }),
    ).toBeVisible();
    await t
      .getByRole("heading", { name: "Private booking details", exact: true })
      .scrollIntoViewIfNeeded();
    await scene(
      t,
      "The selected carrier can now see the pickup, delivery and shipping contact details.",
    );
    await t.getByRole("button", { name: "Earnings", exact: true }).click();
    await t
      .getByRole("heading", { name: "Provider payout account" })
      .scrollIntoViewIfNeeded();
    await scene(
      t,
      "Payout setup starts inside Earnings. Bank numbers are entered on Stripe’s hosted page, never stored by Shypit.",
    );
    await t
      .getByRole("button", { name: "Connect payout account", exact: true })
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
    await scene(
      t,
      "The secure Stripe tab keeps Shypit open. Returning checks status; an expired session can resume banking after sign-in.",
    );
    await scene(
      t,
      "Pilot walkthrough complete: post → private quote → confirmation → shared job. Live dispatch, delivery tracking and payments remain separate.",
    );
    await finish(f);
    await writeFile(
      out + "/scenario.md",
      `# All sides: admin, shipper and carrier\n\nSilent, captioned browser recording with fictional accounts and intercepted API responses. No real identity, bank account, shipment, verification or payment is used.\n\n1. An owner enters the public Admin Login, reviews sample pilot counts, assigns Overview-only admin access and separate workspace finance access, and reviews audit history.\n2. Cedar Supply Co. posts eight pallets of office supplies from Phoenix to Harbor Office Goods in Los Angeles, requesting private quotes. Street addresses and contacts are withheld from the member listing.\n3. Open Road Logistics LLC signs in on mobile, searches route/equipment, reviews the listing and submits a private $920 quote.\n4. The business confirms that carrier. The shared booking and conditional contact visibility use the same recorded sample store across account views. The finance-authorized shipper reviews Billing's test-mode bank setup.\n5. The carrier sees the confirmed job and released booking details in My jobs, then reviews test-mode payout setup in Earnings.\n\nThis recording demonstrates current application screens and booking flows. The backend's access, transaction and privacy rules are separately tested against PostgreSQL. Provider-hosted bank verification is not filmed or completed, and no successful delivery, GPS integration, settlement, or live dispatch is implied. The practice-load simulation is excluded from this workflow.\n\nRegenerate with a running Vite app on 127.0.0.1:4173, a Playwright-compatible recording FFmpeg binary, npm run record:walkthrough and npm run encode:walkthrough. Captions are held for at least 270 ms per word. SHYPIT_RECORD_ONLY=admin refreshes the admin clip only.\n`,
    );
  }
} finally {
  await browser.close();
}
