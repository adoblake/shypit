// Records actual browser interactions using intercepted SAMPLE auth/data responses.
// No real sign-in, dispatch, customer data or payments are used.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import {
  installAuthMock,
  passwordSignIn,
} from "../tests/fixtures/auth-mock.js";
import { initialShipments, loads } from "../tests/fixtures/demo-data.js";
const out = "docs/walkthrough";
await mkdir(out + "/raw", { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
  slowMo: 100,
});
const members = [
  {
    workspace_id: "22222222-2222-4222-8222-222222222222",
    role: "business",
    display_name: "Cedar Supply Co. · sample business",
  },
  {
    workspace_id: "33333333-3333-4333-8333-333333333333",
    role: "driver",
    display_name: "Open Road Logistics LLC · sample carrier",
  },
];
const sampleLoad = {
  ...loads[0],
  id: "LOAD-PREVIEW-1001",
  pickup: "2026-11-14",
  delivery: "2026-11-15",
  cargo:
    "8 pallets of office organizers · Cedar Supply Co. → Harbor Office Goods (B2B)",
};
const starting = {
  shipments: structuredClone(initialShipments),
  loads: [sampleLoad],
  jobs: [],
  packages: [],
};
let companyData = structuredClone(starting),
  driverData = structuredClone(starting);
async function setup(name, viewport, at) {
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir: out + "/raw", size: viewport },
  });
  const page = await context.newPage();
  if (at) await page.clock.install({ time: new Date(at) });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const label = document.createElement("div");
      label.textContent = "SCRIPTED PREVIEW · SAMPLE ACCOUNTS & DATA";
      Object.assign(label.style, {
        position: "fixed",
        left: "0",
        top: "0",
        right: "0",
        zIndex: "1000",
        background: "#101d32",
        color: "#b4e5dc",
        font: "11px Arial",
        padding: "7px 12px",
        textAlign: "center",
        pointerEvents: "none",
      });
      document.body.append(label);
      const caption = document.createElement("div");
      caption.id = "recording-caption";
      Object.assign(caption.style, {
        position: "fixed",
        left: "0",
        bottom: "0",
        right: "0",
        zIndex: "1000",
        background: "#101d32",
        color: "#fff",
        font: "15px Arial",
        padding: "16px",
        lineHeight: "1.5",
        textAlign: "center",
        pointerEvents: "none",
      });
      document.body.append(caption);
    });
  });
  const auth = await installAuthMock(page, {
    expiresAt: at
      ? Math.floor(new Date(at).getTime() / 1000) + 3600
      : undefined,
    emailOtpEnabled: false,
    googleEnabled: false,
    memberships: members,
    workspaceData: {
      [members[0].workspace_id]: companyData,
      [members[1].workspace_id]: driverData,
    },
  });
  await page.goto("http://127.0.0.1:4173");
  await page.evaluate(() => document.fonts.ready);
  return { context, page, auth, errors, name };
}
async function scene(page, text, ms = 1800) {
  await page.evaluate(
    (text) => (document.getElementById("recording-caption").textContent = text),
    text,
  );
  await page.waitForTimeout(ms);
}
async function finish(s) {
  expect(s.errors).toEqual([]);
  await s.page.close();
  await s.context.close();
  await s.page.video().saveAs(out + "/raw/" + s.name + ".webm");
  console.log("Recorded " + s.name);
}
try {
  const s = await setup("01-company", { width: 1280, height: 900 }),
    p = s.page;
  await scene(
    p,
    "1 · Cedar Supply Co. is a small business selling office organizers to another business.",
  );
  await passwordSignIn(
    p,
    "company.preview@example.test",
    "Sample-only-not-a-real-password!",
  );
  await expect(
    p.getByRole("heading", { name: "Choose your workspace." }),
  ).toBeVisible();
  await scene(
    p,
    "Private preview: approved accounts choose a company or carrier workspace.",
  );
  await p.getByRole("button", { name: /Company workspace/ }).click();
  await expect(p.getByRole("navigation")).toBeVisible();
  await scene(
    p,
    "Cedar Supply needs 8 pallets shipped from Phoenix to Harbor Office Goods in Los Angeles.",
  );
  await p.getByRole("button", { name: "New shipment", exact: true }).click();
  await p.getByLabel("Pickup location").fill("Phoenix, AZ");
  await p.getByLabel("Delivery location").fill("Los Angeles, CA");
  await p.getByLabel("Pickup date").fill("2026-11-14");
  await p.getByLabel("Delivery date").fill("2026-11-15");
  await scene(
    p,
    "The business specifies the route, dates, equipment, pallet count and weight.",
  );
  await p.getByRole("button", { name: "Create shipment draft" }).click();
  await expect(p.locator("aside")).toContainText("Phoenix");
  await p.locator("aside").scrollIntoViewIfNeeded();
  await scene(
    p,
    "Standard service: $965 illustrative total, including the service fee.",
  );
  await p.getByRole("button", { name: "Review & book" }).click();
  await scene(
    p,
    "The company reviews the route and transparent price before confirming.",
  );
  await p.getByRole("button", { name: "Confirm demo booking" }).click();
  await expect(p.getByText("Saved securely")).toBeVisible();
  await scene(
    p,
    "Shipment booked in the sample workspace. A carrier match is the next step.",
  );
  companyData = s.auth.workspaceData[members[0].workspace_id];
  await finish(s);
  const c = await setup("02-carrier-mobile", { width: 390, height: 844 }),
    m = c.page;
  await scene(
    m,
    "2 · The carrier is an independent operator with their own LLC.",
    2200,
  );
  await passwordSignIn(
    m,
    "carrier.preview@example.test",
    "Sample-only-not-a-real-password!",
  );
  await m.getByRole("button", { name: /Carrier \/ LLC workspace/ }).click();
  await expect(m.getByRole("navigation")).toBeVisible();
  await scene(
    m,
    "Open Road Logistics LLC finds the prepared sample load on mobile. Live dispatch is simulated.",
  );
  await m.getByLabel("Route or city").fill("Phoenix");
  await m.getByLabel("Equipment", { exact: true }).selectOption("Dry van");
  await m.locator(".load-row").first().click();
  await m.locator("aside").scrollIntoViewIfNeeded();
  await scene(
    m,
    "Before accepting: $920 payout, 18 miles to pickup and 373 loaded miles.",
  );
  await m.getByRole("button", { name: "Review load" }).click();
  await scene(
    m,
    "The LLC reviews the cargo, pickup window, route and sample payout.",
  );
  await m.getByRole("button", { name: "Accept demo load" }).click();
  await expect(m.locator(".job")).toBeVisible();
  await scene(m, "Accepted. The operator confirms pickup when safely parked.");
  await m.getByRole("button", { name: "Confirm pickup" }).click();
  await scene(
    m,
    "The goods are in transit. Delivery proof is required before completion.",
  );
  await m.locator("input[type=file]").setInputFiles({
    name: "Harbor-Office-Goods-delivery-proof.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(
      "%PDF-1.4\nSample proof filename only; no document upload.",
    ),
  });
  await m.getByRole("button", { name: "Confirm delivery" }).click();
  await expect(m.locator(".job")).toContainText("Delivered");
  await scene(
    m,
    "Delivery completed. The demo records a proof filename; secure file storage is not connected.",
  );
  await m.getByRole("button", { name: "Earnings", exact: true }).click();
  await expect(m.locator(".earnings-summary")).toContainText("$920");
  await scene(
    m,
    "The LLC sees $920 pending. This is an illustrative ledger, not an actual payment.",
    2600,
  );
  driverData = c.auth.workspaceData[members[1].workspace_id];
  await finish(c);
  // Simulated cross-company dispatch handoff for this scripted recording only.
  // The shipped app does not implement automatic cross-workspace dispatch synchronization.
  companyData.shipments[0].status = driverData.jobs[0].status;
  const f = await setup(
      "03-company-delivery",
      { width: 1280, height: 900 },
      "2026-11-15T18:00:00Z",
    ),
    q = f.page;
  await passwordSignIn(
    q,
    "company.preview@example.test",
    "Sample-only-not-a-real-password!",
  );
  await q.getByRole("button", { name: /Company workspace/ }).click();
  await expect(q.locator("aside")).toContainText("Delivered");
  await scene(
    q,
    "3 · Company delivery view: the successful handoff is simulated for this recording.",
  );
  await q
    .getByRole("button", { name: "Package tracking", exact: true })
    .click();
  await q.getByLabel("Package / barcode number").fill("CEDAR-PO-2048");
  await q
    .getByLabel("Company", { exact: true })
    .fill("Cedar Supply Co. → Harbor Office Goods");
  await q.getByLabel("Order / PO reference").fill("PO-2048");
  await q
    .getByLabel("Linked shipment")
    .selectOption(companyData.shipments[0].id);
  await q.getByLabel("Estimated delivery", { exact: true }).fill("2026-11-15");
  await q.getByLabel("Origin", { exact: true }).fill("Phoenix, AZ");
  await q.getByLabel("Destination", { exact: true }).fill("Los Angeles, CA");
  await q.getByRole("button", { name: "Add to queue", exact: true }).click();
  await q.getByLabel("New status").selectOption("Delivered");
  await q
    .getByLabel("Current location")
    .fill("Harbor Office Goods · Los Angeles, CA");
  await q
    .getByLabel("Update note")
    .fill(
      "8 pallets received by the business customer. Proof recorded by the LLC carrier.",
    );
  await q.getByRole("button", { name: "Save travel update" }).click();
  await q.getByRole("button", { name: "Preview company update" }).click();
  await scene(
    q,
    "The business can review a customer-facing delivery update and download the report.",
    3000,
  );
  await scene(
    q,
    "Good-case preview complete: B2B shipment → LLC carrier → delivery proof → customer update. Sample data only.",
    3000,
  );
  await finish(f);
  await writeFile(
    out + "/scenario.md",
    `# Good-case shipment walkthrough\n\nSilent, captioned browser recording. All companies, accounts, credentials, cargo and payouts are fictional sample data.\n\nCedar Supply Co. sells 8 pallets of office organizers to Harbor Office Goods. Open Road Logistics LLC accepts the Phoenix–Los Angeles shipment, confirms pickup, records a delivery-proof filename, and completes delivery. The company then reviews its delivery status and customer update.\n\nThe browser interactions use intercepted authentication/database responses. The cross-workspace dispatch handoff is simulated in the recording harness, not implemented as a live dispatch integration. No real account was used, freight moved, file uploaded, or money paid. Founder account activation is separate.\n\nRecordings: 01-company.webm, 02-carrier-mobile.webm, 03-company-delivery.webm.\n`,
  );
} finally {
  await browser.close();
}
