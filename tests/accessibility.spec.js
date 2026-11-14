import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installAuthMock, passwordSignIn } from "./fixtures/auth-mock.js";
test.setTimeout(60000);
const tags = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];
async function accessible(page, info, name) {
  await page.evaluate(() => document.fonts.ready);
  const result = await new AxeBuilder({ page }).withTags(tags).analyze();
  if (result.violations.length)
    await info.attach(name, {
      body: JSON.stringify(result.violations, null, 2),
      contentType: "application/json",
    });
  expect(result.violations, name).toEqual([]);
}
async function login(page, options = {}) {
  const state = await installAuthMock(page, {
    emailOtpEnabled: false,
    googleEnabled: false,
    ...options,
  });
  await page.goto("/");
  await passwordSignIn(page);
  return state;
}
async function reflow(page) {
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "320 CSS pixel reflow",
  ).toBe(true);
  const spacing = await page.addStyleTag({
    content:
      "* {line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important} p {margin-bottom:2em!important}",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "user text spacing does not cause page overflow",
  ).toBe(true);
  await spacing.evaluate((e) => e.remove());
}
test("sign-in and recovery have accessible names, headings, skip navigation, and no axe violations", async ({
  page,
}, info) => {
  await installAuthMock(page, { emailOtpEnabled: false, googleEnabled: false });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await accessible(page, info, "sign-in");
  await reflow(page);
  for (const action of [
    "Forgot email?",
    "Create your password",
    "Forgot password?",
  ]) {
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(page.locator("h1")).toBeFocused();
    await accessible(page, info, action);
    await page.getByRole("button", { name: "Back to sign-in" }).click();
  }
  await page.getByRole("button", { name: "Admin Login", exact: true }).click();
  await accessible(page, info, "admin sign-in");
});
test("company navigation and shipment dialog support keyboard and screen-reader isolation", async ({
  page,
}, info) => {
  await login(page);
  const trigger = page.getByRole("button", {
    name: "New shipment",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((e) => e.matches(":modal"))).toBe(true);
  await accessible(page, info, "new shipment modal");
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        Boolean(document.activeElement.closest("dialog")),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  for (const name of [
    "Shipments",
    "Load board",
    "Package tracking",
    "Network",
    "Billing",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveTitle(`${name} | Shypit`);
    await accessible(page, info, name);
    if (name === "Load board") {
      await page
        .getByRole("button", { name: "Post a shipment", exact: true })
        .click();
      await accessible(page, info, "load board post form");
    }
    await reflow(page);
  }
});
test("carrier load board, jobs, earnings and document views pass accessibility checks", async ({
  page,
}, info) => {
  await login(page, {
    role: "driver",
    banking: {
      configured: true,
      canManage: true,
      mode: "test",
      state: "not_connected",
    },
  });
  await accessible(page, info, "member loads");
  await page
    .getByRole("button", { name: "Practice with sample loads" })
    .click();
  await accessible(page, info, "practice loads");
  await reflow(page);
  for (const name of ["My jobs", "Earnings", "Documents"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await accessible(page, info, name);
    await reflow(page);
  }
});
test("admin access controls and audit views pass accessibility and reflow checks", async ({
  page,
}, info) => {
  await installAuthMock(page, {
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
  await page.goto("/");
  await page.getByRole("button", { name: "Admin Login", exact: true }).click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("owner@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Example-only-password!");
  await page.getByRole("button", { name: "Sign in as admin" }).click();
  await expect(
    page.getByRole("heading", { name: "Keep good work moving." }),
  ).toBeVisible();
  for (const name of [
    "Overview",
    "People & permissions",
    "Audit history",
    "Operations",
    "Build & test",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByText("Loading secure admin data…")).toHaveCount(0);
    await accessible(page, info, name);
    await reflow(page);
  }
});
test("silent walkthrough has a full text alternative and keyboard video controls", async ({
  page,
}, info) => {
  await page.goto("/walkthrough/index.html");
  await expect(
    page.getByRole("button", { name: /Carrier on mobile/ }),
  ).toBeVisible();
  await page
    .getByText("Read the full text alternative", { exact: false })
    .click();
  await expect(page.getByText(/request is marked pending/)).toBeVisible();
  expect(await page.locator("video").evaluate((e) => e.controls)).toBe(true);
  await accessible(page, info, "walkthrough transcript");
  await reflow(page);
});
test("session warning and reauthentication preserve a draft and keep the workspace locked on expiry", async ({
  page,
}, info) => {
  await page.clock.install();
  const state = await login(page);
  await page.getByRole("button", { name: "Load board", exact: true }).click();
  await page
    .getByRole("button", { name: "Post a shipment", exact: true })
    .click();
  await page
    .getByLabel("Business name", { exact: true })
    .fill("Unsaved company draft");
  await page.clock.fastForward(13 * 60 * 1000 + 1000);
  await expect(
    page.getByRole("button", { name: "Keep working" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep working" }).click();
  await expect(
    page.getByText("Session extended by two minutes.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Business name", { exact: true })).toHaveValue(
    "Unsaved company draft",
  );
  await page.clock.fastForward(2 * 60 * 1000 + 1000);
  await page
    .getByRole("button", { name: "Sign in again", exact: true })
    .click();
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await accessible(page, info, "session renewal");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Example-only-password!");
  await page.getByRole("button", { name: "Sign in & resume" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Business name", { exact: true })).toHaveValue(
    "Unsaved company draft",
  );
  await page.clock.fastForward(16 * 60 * 1000);
  await expect(
    page.getByRole("heading", { name: "Sign in to resume your work." }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByLabel("Password", { exact: true })
    .fill("Example-only-password!");
  await page.getByRole("button", { name: "Sign in & resume" }).click();
  await expect(page.getByLabel("Business name", { exact: true })).toHaveValue(
    "Unsaved company draft",
  );
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  state.badCode = true;
  await page.clock.fastForward(16 * 60 * 1000);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in & resume" }).click();
  await expect(page.getByRole("alert")).toContainText("Unable to renew");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Sign out & return to sign-in" })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});

test("shipment modal exposes the timeout warning and resumes its draft after a locked session", async ({
  page,
}, info) => {
  await page.clock.install();
  const state = await login(page);
  await page.getByRole("button", { name: "New shipment", exact: true }).click();
  await page
    .getByLabel("Pickup location", { exact: true })
    .fill("Draft pickup");
  await page.clock.fastForward(13 * 60 * 1000 + 1000);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Keep working", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "New shipment" })
    .getByRole("button", { name: "Keep working", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "New shipment" })
      .getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await page.clock.fastForward(5 * 60 * 1000);
  await expect(
    page.getByRole("heading", { name: "Sign in to resume your work." }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Pickup location", { exact: true }),
  ).not.toBeVisible();
  await accessible(page, info, "expired session gate");
  state.userId = "22222222-2222-4222-8222-222222222222";
  await page
    .getByLabel("Password", { exact: true })
    .fill("Example-only-password!");
  await page.getByRole("button", { name: "Sign in & resume" }).click();
  await expect(page.getByRole("alert")).toContainText("Unable to renew");
  await expect(
    page.getByLabel("Pickup location", { exact: true }),
  ).not.toBeVisible();
  state.userId = "11111111-1111-4111-8111-111111111111";
  await page
    .getByLabel("Password", { exact: true })
    .fill("Example-only-password!");
  await page.getByRole("button", { name: "Sign in & resume" }).click();
  await expect(page.getByLabel("Pickup location", { exact: true })).toHaveValue(
    "Draft pickup",
  );
  await expect(
    page.getByRole("dialog", { name: "New shipment" }),
  ).toBeVisible();
});
