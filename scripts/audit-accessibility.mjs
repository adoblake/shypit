// Captures the current UI with fictional accounts; no real credentials or banking data.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import {
  installAuthMock,
  passwordSignIn,
} from "../tests/fixtures/auth-mock.js";
const phase = process.env.A11Y_PHASE || "latest",
  dir = `docs/accessibility/${phase}`;
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const reports = [];
async function newPage(options) {
  return (await browser.newContext(options)).newPage();
}
let step = 0;
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  const path = `${dir}/${String(++step).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  const result = await new AxeBuilder({ page })
    .withTags([
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
      "wcag22aa",
      "best-practice",
    ])
    .analyze();
  const entry = {
    step,
    name,
    screenshot: path,
    violations: result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.help,
      tags: v.tags,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        html: n.html,
        summary: n.failureSummary,
      })),
    })),
    incomplete: result.incomplete.map((v) => ({
      id: v.id,
      nodes: v.nodes.length,
    })),
  };
  reports.push(entry);
  await writeFile(
    `${dir}/results.json`,
    JSON.stringify(reports, null, 2) + "\n",
  );
  console.log(
    name,
    JSON.stringify(
      entry.violations.map((v) => ({ id: v.id, nodes: v.nodes.length })),
    ),
  );
}
for (const [device, width, height] of [
  ["desktop", 1440, 1024],
  ["mobile", 390, 844],
]) {
  const page = await newPage({ viewport: { width, height } });
  await installAuthMock(page, { emailOtpEnabled: false, googleEnabled: false });
  await page.goto("http://127.0.0.1:4173");
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  await capture(page, device + "-signin");
  await page
    .getByRole("button", { name: "Create your password", exact: true })
    .click();
  await capture(page, device + "-account-setup");
  await page.getByRole("button", { name: "Back to sign-in" }).click();
  await passwordSignIn(page);
  await page.getByRole("button", { name: "Shipments", exact: true }).waitFor();
  await capture(page, device + "-shipments");
  await page.getByRole("button", { name: "New shipment", exact: true }).click();
  await capture(page, device + "-shipment-dialog");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Load board", exact: true }).click();
  await page
    .getByRole("button", { name: "Post a shipment", exact: true })
    .click();
  await capture(page, device + "-market-form");
  await page
    .getByRole("button", { name: "Package tracking", exact: true })
    .click();
  await capture(page, device + "-tracking");
  await page.getByRole("button", { name: "Billing", exact: true }).click();
  await capture(page, device + "-billing");
  await page.close();
  const carrier = await newPage({ viewport: { width, height } });
  await installAuthMock(carrier, {
    role: "driver",
    emailOtpEnabled: false,
    googleEnabled: false,
  });
  await carrier.goto("http://127.0.0.1:4173");
  await passwordSignIn(carrier);
  await carrier
    .getByRole("button", { name: "Practice with sample loads" })
    .waitFor();
  await capture(carrier, device + "-carrier-board");
  await carrier
    .getByRole("button", { name: "Practice with sample loads" })
    .click();
  await capture(carrier, device + "-practice-loads");
  await carrier.getByRole("button", { name: "My jobs", exact: true }).click();
  await capture(carrier, device + "-jobs");
  await carrier.getByRole("button", { name: "Earnings", exact: true }).click();
  await capture(carrier, device + "-earnings");
  await carrier.close();
  const admin = await newPage({ viewport: { width, height } });
  await installAuthMock(admin, {
    emailOtpEnabled: false,
    googleEnabled: false,
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
            id: "sample-owner",
            email: "owner@example.test",
            owner: true,
            active: true,
            capabilities: [],
          },
          {
            id: "sample-member",
            email: "member@example.test",
            owner: false,
            active: false,
            capabilities: [],
          },
        ],
        memberships: [],
      },
      audit: [],
      operations: [],
      testing: {},
    },
  });
  await admin.goto("http://127.0.0.1:4173");
  await admin.getByRole("button", { name: "Admin Login", exact: true }).click();
  await admin
    .getByLabel("Email address", { exact: true })
    .fill("owner@example.test");
  await admin
    .getByLabel("Password", { exact: true })
    .fill("Example-only-password!");
  await admin.getByRole("button", { name: "Sign in as admin" }).click();
  await admin
    .getByRole("heading", { name: "Keep good work moving." })
    .waitFor();
  await capture(admin, device + "-admin-overview");
  await admin
    .getByRole("button", { name: "People & permissions", exact: true })
    .click();
  await admin.getByText("owner@example.test", { exact: true }).waitFor();
  await capture(admin, device + "-admin-access");
  await admin.close();
  const video = await newPage({ viewport: { width, height } });
  await video.goto("http://127.0.0.1:4173/walkthrough/index.html");
  await video.getByRole("button", { name: /Carrier on mobile/ }).waitFor();
  await capture(video, device + "-walkthrough");
  await video.close();
}
await writeFile(`${dir}/results.json`, JSON.stringify(reports, null, 2) + "\n");
await browser.close();
