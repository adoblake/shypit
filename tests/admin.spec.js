import { test, expect } from "@playwright/test";
import { installAuthMock, passwordSignIn } from "./fixtures/auth-mock";
const capabilities = ["stats", "operations", "access", "audit", "testing"];
test("owner can review pilot and confirm scoped admin changes", async ({
  page,
}, testInfo) => {
  const state = await installAuthMock(page, {
    emailOtpEnabled: false,
    adminProfile: { owner: true, capabilities },
    adminData: {
      stats: {
        workspaces: 2,
        active_memberships: 4,
        shipments: 6,
        jobs: 0,
        packages: 0,
      },
      operations: [],
      access: {
        users: [
          {
            id: "owner",
            email: "owner@example.test",
            owner: true,
            active: true,
            capabilities: [],
          },
          {
            id: "delegate",
            email: "delegate@example.test",
            owner: false,
            active: false,
            capabilities: [],
          },
        ],
        memberships: [],
      },
      audit: [],
      testing: {},
    },
  });
  await page.goto("/");
  await passwordSignIn(page);
  await page.getByRole("button", { name: "Admin workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Keep good work moving." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh data" }),
  ).toBeEnabled();
  await page.screenshot({
    path: `docs/review/admin-overview-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Operations", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Workspace review" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Audit history", exact: true })
    .click();
  await expect(page.getByText("No admin access changes yet.")).toBeVisible();
  await page.getByRole("button", { name: "People & permissions" }).click();
  await page.getByLabel("Admin access enabled").check();
  await page.getByLabel("Overview", { exact: true }).check();
  await page.getByRole("button", { name: "Review admin changes" }).click();
  expect(state.adminChanges).toBeUndefined();
  await page.getByRole("button", { name: "Confirm admin changes" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Access updated" }),
  ).toBeVisible();
  expect(state.adminChanges[0].p_options).toEqual({
    active: true,
    capabilities: ["stats"],
  });
  await page.getByRole("button", { name: "Build & test" }).click();
  await expect(
    page.getByRole("link", { name: "Build & deployment checks" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("limited admin sees only granted sections and loses access when revoked", async ({
  page,
}) => {
  const state = await installAuthMock(page, {
    emailOtpEnabled: false,
    adminProfile: { owner: false, capabilities: ["stats"] },
    adminData: { stats: { workspaces: 2 } },
  });
  await page.goto("/");
  await passwordSignIn(page);
  await page.getByRole("button", { name: "Admin workspace" }).click();
  await expect(
    page.getByRole("button", { name: "People & permissions" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Refresh data" }),
  ).toBeEnabled();
  await expect(page.getByText("Workspaces", { exact: true })).toBeVisible();
  state.revokeAdminOnRead = true;
  await page.getByRole("button", { name: "Refresh data" }).click();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
});
