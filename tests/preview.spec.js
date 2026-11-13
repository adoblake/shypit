import { test, expect } from "@playwright/test";
import { installAuthMock, passwordSignIn } from "./fixtures/auth-mock.js";
const members = [
  {
    workspace_id: "22222222-2222-4222-8222-222222222222",
    role: "business",
    display_name: "Cedar Supply Co. preview",
  },
  {
    workspace_id: "33333333-3333-4333-8333-333333333333",
    role: "driver",
    display_name: "Open Road Logistics LLC preview",
  },
];
test("email/password authenticates with provider; invalid password stays locked", async ({
  page,
}) => {
  const state = await installAuthMock(page, {
    emailOtpEnabled: false,
    googleEnabled: false,
    badCode: true,
  });
  let body;
  page.on("request", (r) => {
    if (r.url().includes("grant_type=password")) body = r.postDataJSON();
  });
  await page.goto("/");
  await passwordSignIn(page);
  await expect(page.getByRole("alert")).toContainText("Unable to sign in");
  expect(body.email).toBe("preview@example.test");
  expect(body.password).toBe("Example-only-preview-password!");
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  state.badCode = false;
  await passwordSignIn(page);
  await expect(page.getByRole("navigation")).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "Example-only",
  );
});
test("approved founders can choose and switch only assigned workspaces", async ({
  page,
}) => {
  const state = await installAuthMock(page, {
    memberships: members,
    emailOtpEnabled: false,
    googleEnabled: false,
  });
  await page.goto("/");
  await passwordSignIn(page);
  await expect(
    page.getByRole("heading", { name: "Choose your workspace." }),
  ).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.getByRole("button", { name: /Company workspace/ }).click();
  await expect(
    page.getByRole("button", { name: "New shipment", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch workspace" }).click();
  await page.getByRole("button", { name: /Carrier \/ LLC workspace/ }).click();
  await expect(
    page.getByRole("button", { name: "Find loads", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Billing", exact: true }),
  ).toHaveCount(0);
  state.memberships = [members[0]];
  await page.getByRole("button", { name: "Switch workspace" }).click();
  await expect(
    page.getByRole("button", { name: "New shipment", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Switch workspace" }),
  ).toHaveCount(0);
});
test("password visibility is user controlled and sign-in has no public signup", async ({
  page,
}) => {
  await installAuthMock(page, { emailOtpEnabled: false, googleEnabled: false });
  await page.goto("/");
  await page.getByLabel("Password", { exact: true }).fill("private");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await expect(
    page.getByRole("button", { name: /sign up|create account/i }),
  ).toHaveCount(0);
});
