import { test, expect } from "@playwright/test";
import { installAuthMock, passwordSignIn } from "./fixtures/auth-mock.js";
test("password creation and reset request a secure email link without exposing account existence", async ({
  page,
}) => {
  await installAuthMock(page, { emailOtpEnabled: false, googleEnabled: false });
  await page.goto("/");
  await page
    .getByText("Password setup & account help", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create your password", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create your password." }),
  ).toBeVisible();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("invited@example.test");
  await page.getByRole("button", { name: "Send secure link" }).click();
  await expect(page.getByRole("status")).toContainText(
    "If this address has approved access",
  );
  await page.getByRole("button", { name: "Back to sign-in" }).click();
  await page
    .getByText("Password setup & account help", { exact: true })
    .click();
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(
    page.getByRole("heading", { name: "Reset your password." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Send secure link" }).click();
  await expect(page.getByRole("status")).toContainText("If this address");
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
test("verified recovery link accepts matching strong password, removes token from URL and never opens workspace", async ({
  page,
}) => {
  await installAuthMock(page);
  await page.goto("/?flow=setup&type=invite&token_hash=valid-once");
  await expect(
    page.getByRole("heading", { name: "Choose your password." }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/token_hash/);
  await page
    .getByLabel("Email address", { exact: true })
    .fill("invited@example.test");
  await page
    .getByLabel("New password", { exact: true })
    .fill("a-strong-new-password");
  await page.getByLabel("Confirm new password").fill("a-different-password");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("alert")).toContainText("both passwords match");
  await page.getByLabel("Confirm new password").fill("a-strong-new-password");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("status")).toContainText("Your password is set");
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "a-strong",
  );
  await page.getByRole("button", { name: "Back to sign-in" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
});
test("invalid recovery proof never opens private records", async ({ page }) => {
  await installAuthMock(page);
  await page.goto("/?flow=reset&type=recovery&token_hash=expired");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("invited@example.test");
  await page
    .getByLabel("New password", { exact: true })
    .fill("a-strong-new-password");
  await page.getByLabel("Confirm new password").fill("a-strong-new-password");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("alert")).toContainText("Unable to complete");
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
test("forgot-email requests private administrator review without disclosing saved emails", async ({
  page,
}) => {
  await installAuthMock(page, { emailOtpEnabled: false, googleEnabled: false });
  await page.goto("/");
  await page
    .getByText("Password setup & account help", { exact: true })
    .click();
  await page.getByRole("button", { name: "Forgot email?" }).click();
  await page.getByLabel("Full name").fill("Preview founder");
  await page.getByLabel("Business or LLC name").fill("Sample LLC");
  await page.getByLabel("Contact email").fill("alternate@example.test");
  await page.getByRole("button", { name: "Request account help" }).click();
  await expect(page.getByRole("status")).toContainText("administrator review");
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
test("10 failed sign-ins lock the process across page reloads", async ({
  page,
}) => {
  await installAuthMock(page, {
    badCode: true,
    emailOtpEnabled: false,
    googleEnabled: false,
  });
  await page.goto("/");
  for (let i = 0; i < 10; i++) {
    await passwordSignIn(page);
    await expect(page.getByRole("alert")).toBeVisible();
  }
  await expect(page.getByRole("alert")).toContainText("24 hours");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await passwordSignIn(page);
  await expect(page.getByRole("alert")).toContainText("24 hours");
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
test("recovery request limit disables sending after the server refuses the next request", async ({
  page,
}) => {
  await installAuthMock(page, { emailOtpEnabled: false, googleEnabled: false });
  await page.goto("/");
  await page
    .getByText("Password setup & account help", { exact: true })
    .click();
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("invited@example.test");
  for (let i = 0; i < 10; i++) {
    await page.getByRole("button", { name: "Send secure link" }).click();
    await expect(
      page.getByRole("button", { name: "Send secure link" }),
    ).toBeEnabled();
  }
  await page.getByRole("button", { name: "Send secure link" }).click();
  await expect(page.getByRole("alert")).toContainText("24 hours");
  await expect(
    page.getByRole("button", { name: "Send secure link" }),
  ).toBeDisabled();
});
test("missing backend disables sending, explains activation and allows a fresh connection check", async ({
  page,
}) => {
  const state = await installAuthMock(page, {
    serviceReady: false,
    emailOtpEnabled: false,
    googleEnabled: false,
  });
  let submissions = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/functions/v1/shypit-auth")) submissions++;
  });
  await page.goto("/");
  await expect(page.getByText("Account setup is not ready yet.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
  await page
    .getByText("Password setup & account help", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create your password", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Send secure link" }),
  ).toBeDisabled();
  expect(submissions).toBe(0);
  state.serviceReady = true;
  await page.getByRole("button", { name: "Check connection again" }).click();
  await expect(
    page.getByRole("button", { name: "Send secure link" }),
  ).toBeEnabled();
  await expect(page.getByText("Account setup is not ready yet.")).toHaveCount(
    0,
  );
});
test("a network failure is explained without claiming an email was sent", async ({
  page,
}) => {
  await installAuthMock(page, { emailOtpEnabled: false, googleEnabled: false });
  await page.route("https://auth.shypit.test/functions/v1/shypit-auth", (r) =>
    r.abort("failed"),
  );
  await page.goto("/");
  await page
    .getByText("Password setup & account help", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create your password", exact: true })
    .click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("invited@example.test");
  await page.getByRole("button", { name: "Send secure link" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Account services cannot be reached",
  );
  await expect(page.getByRole("alert")).not.toContainText("Failed to fetch");
  await expect(
    page.getByRole("status").filter({ hasText: "check its inbox" }),
  ).toHaveCount(0);
});
