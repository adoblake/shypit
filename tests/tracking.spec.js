import { test, expect } from "@playwright/test";
test("package intake, duplicates, travel history, company export and persistence", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Package tracking", exact: true })
    .click();
  await page.getByLabel("Package / barcode number").fill("test-123");
  await page.getByLabel("Origin", { exact: true }).fill("Phoenix, AZ");
  await page.getByLabel("Destination", { exact: true }).fill("Los Angeles, CA");
  await page.getByRole("button", { name: "Add to queue", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "1 package(s) added." }),
  ).toBeVisible();
  await page.getByLabel("Package / barcode number").fill("test-123");
  await page.getByRole("button", { name: "Add to queue", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "already exists" }),
  ).toBeVisible();
  await page.getByLabel("New status").selectOption("Exception");
  await page.getByLabel("Current location").fill("Blythe, CA");
  await page
    .getByLabel("Update note")
    .fill("Weather delay. Awaiting revised departure.");
  await page.getByRole("button", { name: "Save travel update" }).click();
  await expect(page.getByText("Exception · Blythe, CA")).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Package tracking", exact: true })
    .click();
  await expect(
    page.getByText("Weather delay. Awaiting revised departure."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview company update" }).click();
  await expect(
    page.getByRole("button", { name: "Save travel update" }),
  ).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download company update" }).click();
  expect((await download).suggestedFilename()).toBe(
    "shypit-package-update.txt",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("bulk intake accepts valid rows and reports duplicate and invalid rows", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Package tracking", exact: true })
    .click();
  await page.getByLabel("Intake method").selectOption("Bulk import");
  await page
    .getByLabel("Paste tab-separated rows")
    .fill(
      "BULK-1\tUPS\tDemo Company\tPhoenix\tTucson\nBULK-1\tUPS\tDemo Company\tPhoenix\tTucson\nBROKEN",
    );
  await page.getByRole("button", { name: "Add to queue", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "1 package(s) added." }),
  ).toContainText("already exists");
  await expect(
    page.getByRole("status").filter({ hasText: "1 package(s) added." }),
  ).toContainText("required");
  await page.getByLabel("Search packages").fill("Demo Company");
  await expect(page.locator(".tms-package")).toHaveCount(1);
  await page.getByLabel("Filter status").selectOption("Delivered");
  await expect(page.getByText("No packages match this view.")).toBeVisible();
});
