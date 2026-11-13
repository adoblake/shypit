import { test, expect } from "@playwright/test";
import { installAuthMock, passwordSignIn } from "./fixtures/auth-mock";
test("business banking fails closed without provider and never asks for bank numbers", async ({
  page,
}) => {
  await installAuthMock(page, { emailOtpEnabled: false });
  await page.goto("/");
  await passwordSignIn(page);
  await page.getByRole("button", { name: "Billing", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Business payment account" }),
  ).toBeVisible();
  await expect(
    page.getByText("Banking setup is not activated yet"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add payment account" }),
  ).toHaveCount(0);
  await expect(page.getByLabel(/routing|account number/i)).toHaveCount(0);
});
test("finance manager sees sandbox setup and redirect is restricted to provider", async ({
  page,
}) => {
  const state = await installAuthMock(page, {
    emailOtpEnabled: false,
    banking: {
      configured: true,
      canManage: true,
      mode: "test",
      state: "not_connected",
    },
    bankingUrl: "https://attacker.example.test",
  });
  await page.goto("/");
  await passwordSignIn(page);
  await page.getByRole("button", { name: "Billing", exact: true }).click();
  await expect(page.getByText("Test mode:", { exact: false })).toBeVisible();
  await page
    .getByRole("button", { name: "Add payment account", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Unable to open");
  expect(state.bankingCalls[1].action).toBe("start");
  await expect(page).toHaveURL(/127.0.0.1/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("carrier payout status uses server readiness and restricted members cannot connect", async ({
  page,
}) => {
  const state = await installAuthMock(page, {
    role: "driver",
    emailOtpEnabled: false,
    banking: {
      configured: true,
      canManage: false,
      mode: "test",
      state: "restricted",
    },
  });
  await page.goto("/");
  await passwordSignIn(page);
  await page.getByRole("button", { name: "Earnings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Provider payout account" }),
  ).toBeVisible();
  await expect(page.getByText("Finance manager access required")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect payout account" }),
  ).toHaveCount(0);
  state.banking = {
    configured: true,
    canManage: true,
    mode: "test",
    state: "verification_pending",
  };
  await page.getByRole("button", { name: "Refresh banking status" }).click();
  await expect(
    page.getByRole("button", { name: "Continue verification" }),
  ).toBeVisible();
});
test("hosted banking keeps Shypit open and checks status when the secure tab closes", async ({
  page,
  context,
}) => {
  const state = await installAuthMock(page, {
    emailOtpEnabled: false,
    banking: {
      configured: true,
      canManage: true,
      mode: "test",
      state: "not_connected",
    },
  });
  await context.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Sample hosted verification</h1>",
    }),
  );
  await page.goto("/");
  await passwordSignIn(page);
  await page.getByRole("button", { name: "Billing", exact: true }).click();
  const opened = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Add payment account", exact: true })
    .click();
  const popup = await opened;
  await popup.waitForURL("https://checkout.stripe.com/**");
  expect(await popup.evaluate(() => window.opener === null)).toBeTruthy();
  await expect(
    page.getByRole("heading", { name: "Business payment account" }),
  ).toBeVisible();
  state.banking = {
    configured: true,
    canManage: true,
    mode: "test",
    state: "connected",
  };
  await popup.close();
  await expect(
    page.getByText("Verified with the banking provider"),
  ).toBeVisible();
});
test("fresh sign-in returns directly to the authorized banking section", async ({
  page,
}) => {
  const state = await installAuthMock(page, {
    emailOtpEnabled: false,
    bankingRequireSignIn: true,
    banking: {
      configured: true,
      canManage: true,
      mode: "test",
      state: "not_connected",
    },
  });
  await page.goto("/");
  await passwordSignIn(page);
  await page.getByRole("button", { name: "Billing", exact: true }).click();
  await page
    .getByRole("button", { name: "Add payment account", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sign in again to continue banking" })
    .click();
  state.bankingRequireSignIn = false;
  await passwordSignIn(page);
  await expect(
    page.getByRole("heading", { name: "Business payment account" }),
  ).toBeVisible();
});
test("provider return does not claim verification and unassigned resume cannot grant access", async ({
  page,
}) => {
  await installAuthMock(page, { emailOtpEnabled: false });
  await page.goto(
    "/?banking=return&workspaceId=99999999-9999-4999-8999-999999999999",
  );
  await expect(
    page.getByText("Returning here does not confirm bank verification.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign in here instead" }).click();
  await passwordSignIn(page);
  await expect(
    page.getByRole("button", { name: "Shipments", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Business payment account" }),
  ).toHaveCount(0);
});
test("blocked banking popup leaves a secure continuation link inside the workspace", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await installAuthMock(page, {
    emailOtpEnabled: false,
    banking: {
      configured: true,
      canManage: true,
      mode: "test",
      state: "not_connected",
    },
  });
  await page.goto("/");
  await passwordSignIn(page);
  await page.getByRole("button", { name: "Billing", exact: true }).click();
  await page
    .getByRole("button", { name: "Add payment account", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Continue securely on Stripe" }),
  ).toHaveAttribute("href", "https://checkout.stripe.com/c/pay/test_preview");
  await expect(
    page.getByRole("heading", { name: "Business payment account" }),
  ).toBeVisible();
});
