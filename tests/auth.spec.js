import { test, expect } from "@playwright/test";
import { installAuthMock, signIn } from "./fixtures/auth-mock.js";
test("unconfigured app stays locked, ignores browser auth flags and removes old storage", async ({
  page,
}) => {
  await page.route("**/auth-config.json", (route) =>
    route.fulfill({ json: { url: "", publicKey: "" } }),
  );
  await page.addInitScript(() => {
    localStorage.setItem("shypit.authenticated", "true");
    localStorage.setItem("shypit.shipments.v1", "[]");
  });
  await page.goto("/");
  await expect(page.getByText("Sign-in is being set up.")).toBeVisible();
  await expect(page.getByRole("button", { name: "New shipment" })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(() => localStorage.getItem("shypit.shipments.v1")),
  ).toBeNull();
});
test("verification is invite-only and invalid codes do not expose workspaces", async ({
  page,
}) => {
  await installAuthMock(page, { badCode: true });
  let otp;
  let workspaceRequests = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/otp")) otp = r.postDataJSON();
    if (r.url().includes("/workspaces")) workspaceRequests++;
  });
  await page.goto("/");
  await signIn(page);
  await expect(page.getByRole("alert")).toContainText("Unable to sign in");
  expect(otp.create_user).toBe(false);
  expect(workspaceRequests).toBe(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
test("valid identity without active membership cannot open workspace", async ({
  page,
}) => {
  await installAuthMock(page, { member: false });
  let reads = 0;
  page.on("request", (r) => {
    if (r.url().includes("/workspaces")) reads++;
  });
  await page.goto("/");
  await signIn(page);
  await expect(page.getByRole("alert")).toContainText("Unable to sign in");
  expect(reads).toBe(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
test("server role determines navigation; signout and reload remove access and tokens", async ({
  page,
}) => {
  await installAuthMock(page, { role: "driver" });
  await page.goto("/");
  await signIn(page);
  await expect(
    page.getByRole("button", { name: "Find loads", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Account view" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Billing", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.values(localStorage).join(" ").includes("test-valid-access"),
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Work email")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await signIn(page);
  await page.reload();
  await expect(page.getByLabel("Work email")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
test("failed authorized save removes stale workspace", async ({ page }) => {
  await installAuthMock(page, { failSave: true });
  await page.goto("/");
  await signIn(page);
  await page.getByRole("button", { name: "Review & book" }).click();
  await page.getByRole("button", { name: "Confirm demo booking" }).click();
  await expect(
    page.getByText("Your changes could not be saved.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
test("inactive session locks automatically", async ({ page }) => {
  await page.clock.install();
  await installAuthMock(page);
  await page.goto("/");
  await signIn(page);
  await expect(page.getByRole("navigation")).toBeVisible();
  await page.clock.fastForward(16 * 60 * 1000);
  await expect(
    page.getByRole("heading", { name: "Sign in to resume your work." }),
  ).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
test("sign-in fits viewport without horizontal scroll", async ({
  page,
}, info) => {
  await installAuthMock(page);
  await page.goto("/");
  await expect(page.getByLabel("Work email")).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.evaluate(() => innerWidth),
  );
  await page.screenshot({
    path: `test-results/${info.project.name}-login.png`,
    fullPage: true,
  });
});
test("Google PKCE callback requires verifier, removes callback code and checks membership", async ({
  page,
}) => {
  await installAuthMock(page, { role: "business" });
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "shypit.pkce",
      JSON.stringify({ verifier: "a".repeat(43), created: Date.now() }),
    ),
  );
  await page.goto("/?code=one-time-auth-code");
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page).not.toHaveURL(/code=/);
  expect(
    await page.evaluate(() => sessionStorage.getItem("shypit.pkce")),
  ).toBeNull();
});
test("Google callback without browser verifier fails closed", async ({
  page,
}) => {
  await installAuthMock(page);
  await page.goto("/?code=untrusted-code");
  await expect(page.getByRole("alert")).toContainText("Sign-in expired");
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
test("Google authorization uses random PKCE challenge", async ({ page }) => {
  await installAuthMock(page);
  await page.route("https://auth.shypit.test/auth/v1/authorize?**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<p>Identity provider test page</p>",
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.waitForURL("https://auth.shypit.test/auth/v1/authorize?**");
  const u = new URL(page.url());
  expect(u.searchParams.get("code_challenge_method")).toBe("s256");
  expect(u.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(u.searchParams.get("provider")).toBe("google");
  expect(u.searchParams.get("redirect_to")).toBe("http://127.0.0.1:4173/");
});
test("revoked membership clears an open workspace on the next check", async ({
  page,
}) => {
  await page.clock.install();
  const state = await installAuthMock(page);
  await page.goto("/");
  await signIn(page);
  await expect(page.getByRole("navigation")).toBeVisible();
  state.member = false;
  await page.clock.fastForward(61000);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(
    page.getByText("Your workspace access changed.", { exact: false }),
  ).toBeVisible();
});
