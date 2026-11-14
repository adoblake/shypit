import { installAuthMock, signIn } from "./fixtures/auth-mock.js";
import { test, expect } from "@playwright/test";
test("business creates a shipment, books and retains it", async ({ page }) => {
  const auth = await installAuthMock(page);
  await page.goto("/");
  await signIn(page);
  await page.getByRole("button", { name: "New shipment", exact: true }).click();
  await page.getByLabel("Pickup location").fill("Tempe, AZ");
  await page.getByLabel("Delivery location").fill("San Diego, CA");
  await page.getByLabel("Pickup date").fill("2026-11-16");
  await page.getByLabel("Delivery date").fill("2026-11-15");
  await page.getByRole("button", { name: "Create shipment draft" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Delivery must be on or after pickup",
  );
  await page.getByLabel("Delivery date").fill("2026-11-17");
  await page.getByRole("button", { name: "Create shipment draft" }).click();
  await expect(page.locator("aside")).toContainText("Tempe");
  await page.getByRole("radio", { name: /Priority/ }).check();
  await page.getByRole("button", { name: "Review & book" }).click();
  await expect(page.getByRole("dialog")).toContainText("$1,140");
  await page.getByRole("button", { name: "Confirm demo booking" }).click();
  await expect(page.locator("aside")).toContainText("Awaiting carrier");
  await expect(page.getByText("Saved securely")).toBeVisible();
  await page.reload();
  await signIn(page);
  await expect(
    page.getByRole("button").filter({ hasText: "Tempe" }),
  ).toContainText("Awaiting carrier");
});
test("driver filters, accepts and completes delivery with proof", async ({
  page,
}) => {
  await installAuthMock(page, { role: "driver" });
  await page.goto("/");
  await signIn(page);
  await page
    .getByRole("button", { name: "Practice with sample loads" })
    .click();
  await page.getByLabel("Route or city").fill("nowhere");
  await expect(page.getByText("No matching loads")).toBeVisible();
  await page.getByLabel("Route or city").fill("");
  await page.getByLabel("Equipment", { exact: true }).selectOption("Dry van");
  await expect(
    page.getByRole("heading", { name: "2 available loads" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review load" }).click();
  await page.getByRole("button", { name: "Accept demo load" }).click();
  await expect(page.locator(".job")).toHaveCount(1);
  await page.getByRole("button", { name: "Confirm pickup" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm delivery" }),
  ).toBeDisabled();
  await page.locator("input[type=file]").setInputFiles({
    name: "delivery-proof.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("demo proof"),
  });
  await page.getByRole("button", { name: "Confirm delivery" }).click();
  await expect(page.locator(".job")).toContainText("Delivered");
  await page.getByRole("button", { name: "Earnings", exact: true }).click();
  await expect(page.locator(".earnings-summary")).toContainText("$920");
  await expect(page.getByText("Saved securely")).toBeVisible();
  await page.reload();
  await signIn(page);
  await page.getByRole("button", { name: "My jobs", exact: true }).click();
  await expect(page.locator(".job")).toContainText("delivery-proof.txt");
});
test("navigation and responsive layout have no overflow or runtime errors", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const auth = await installAuthMock(page);
  await page.goto("/");
  await signIn(page);
  for (const name of ["Network", "Billing", "Shipments"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator("h1")).toBeVisible();
  }
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.evaluate(() => window.innerWidth),
  );
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-business.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  auth.role = "driver";
  await signIn(page);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-driver.png`,
    fullPage: true,
  });
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.evaluate(() => window.innerWidth),
  );
  for (const name of ["My jobs", "Earnings", "Documents", "Find loads"])
    await page.getByRole("button", { name, exact: true }).click();
  expect(errors).toEqual([]);
});
