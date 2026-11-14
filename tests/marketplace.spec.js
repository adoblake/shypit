import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { installAuthMock, passwordSignIn } from "./fixtures/auth-mock";
import { installMarketMock } from "./fixtures/market-mock";
async function accessible(page) {
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
  expect(result.violations).toEqual([]);
}
const business = "a1111111-1111-4111-8111-111111111111",
  driver = "b2222222-2222-4222-8222-222222222222";
async function setup(page, store, id, role) {
  await installAuthMock(page, {
    emailOtpEnabled: false,
    googleEnabled: false,
    role,
    memberships: [
      {
        workspace_id: id,
        role,
        display_name:
          role === "business" ? "Sample Supply Co." : "Sample Carrier LLC",
      },
    ],
  });
  await installMarketMock(page, store, id, role);
  await page.goto("/");
  await passwordSignIn(page);
}
async function draft(page, { fixed = false } = {}) {
  await page
    .getByRole("button", { name: "Post a shipment", exact: true })
    .click();
  const pickup = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    delivery = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  for (const [label, value] of [
    ["Business name", "Sample Supply Co."],
    ["Pickup city and state", "Phoenix, AZ"],
    ["Delivery city and state", "Los Angeles, CA"],
    ["Pickup date", pickup],
    ["Delivery date", delivery],
    ["Pickup street address", "123 Private Dock"],
    ["Delivery street address", "456 Private Receiving"],
    ["Shipping contact name", "Sample Shipper"],
    ["Shipping contact email", "shipper-private@example.test"],
    ["Shipping contact phone", "555-010-1000"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  if (fixed) {
    await page
      .getByRole("combobox", { name: "Pricing", exact: true })
      .selectOption("fixed");
    await page.getByLabel("Offered rate (USD)", { exact: true }).fill("965");
  }
  await page
    .getByRole("button", { name: "Review listing", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review before posting" }),
  ).toBeVisible();
}
test("business and carrier share post, private quote, confirmed booking and cancellation", async ({
  page,
  context,
}, info) => {
  const store = [];
  await setup(page, store, business, "business");
  await page.getByRole("button", { name: "Load board", exact: true }).click();
  test.setTimeout(60000);
  await draft(page);
  await accessible(page);
  expect(store.length).toBe(0);
  await page
    .getByRole("button", { name: "Publish to member load board" })
    .click();
  await expect(
    page.getByText("Shipment posted to approved carrier members."),
  ).toBeVisible();
  expect(store).toHaveLength(1);
  const carrier = await context.newPage();
  await setup(carrier, store, driver, "driver");
  await expect(
    carrier.getByRole("heading", { name: "Find your next load." }),
  ).toBeVisible();
  await carrier.locator(".market-listing").click();
  await expect(carrier.getByText("Pickup: 123 Private Dock")).toHaveCount(0);
  await carrier
    .getByRole("button", { name: "Submit a quote", exact: true })
    .click();
  for (const [label, value] of [
    ["Carrier / LLC name", "Sample Carrier LLC"],
    ["Your quote (USD)", "920"],
    ["Carrier contact name", "Sample Operator"],
    ["Carrier contact email", "carrier-private@example.test"],
    ["Carrier contact phone", "555-010-2000"],
  ])
    await carrier.getByLabel(label, { exact: true }).fill(value);
  await accessible(carrier);
  await carrier
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  await accessible(carrier);
  expect(store[0].offers).toHaveLength(0);
  await carrier
    .getByRole("button", { name: "Send request to business" })
    .click();
  await expect(
    carrier.getByText("Request sent to the business.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh board", exact: true })
    .click();
  await expect(page.getByText("Sample Carrier LLC · $920.00")).toBeVisible();
  await expect(
    page.getByText("carrier-private@example.test", { exact: false }),
  ).toHaveCount(0);
  await accessible(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Confirm carrier booking" }).click();
  await expect(
    page.getByText("Carrier confirmed.", { exact: false }),
  ).toBeVisible();
  await carrier
    .getByRole("button", { name: "Refresh board", exact: true })
    .click();
  await expect(carrier.getByText("Pickup: 123 Private Dock")).toBeVisible();
  await accessible(carrier);
  await carrier.screenshot({
    path: `docs/review/market-booking-${info.project.name}.png`,
    fullPage: true,
  });
  await carrier.getByRole("button", { name: "My jobs", exact: true }).click();
  await expect(
    carrier.getByRole("heading", { name: "Booked through the load board" }),
  ).toBeVisible();
  await expect(carrier.locator(".market-listing")).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Cancel booking", exact: true })
    .click();
  await carrier
    .getByRole("button", { name: "Refresh board", exact: true })
    .click();
  await carrier.locator(".market-listing").click();
  await expect(carrier.getByText("Pickup: 123 Private Dock")).toHaveCount(0);
  await expect(carrier.locator(".market-state")).toContainText("cancelled");
  await carrier.close();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("fixed rate review, member search and practice board stay distinct", async ({
  page,
}) => {
  const store = [];
  await setup(page, store, business, "business");
  await page.getByRole("button", { name: "Load board", exact: true }).click();
  await draft(page, { fixed: true });
  await expect(page.getByText("$965.00", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Publish to member load board" })
    .click();
  await expect(
    page.getByText("Shipment posted to approved carrier members."),
  ).toBeVisible();
  expect(store[0].rate_cents).toBe(96500);
  await page.getByLabel("Search member loads").fill("Nowhere");
  await expect(page.locator(".market-listing")).toHaveCount(0);
  await page.getByLabel("Search member loads").fill("Phoenix");
  await expect(page.locator(".market-listing")).toHaveCount(1);
});
test("an existing shipment prepares a listing without publishing private sample data", async ({
  page,
}) => {
  const store = [];
  await setup(page, store, business, "business");
  await page
    .getByRole("button", { name: "Post this shipment to load board" })
    .click();
  await expect(
    page.getByLabel("Pickup city and state", { exact: true }),
  ).toHaveValue("Phoenix, AZ");
  await expect(
    page.getByLabel("Delivery city and state", { exact: true }),
  ).toHaveValue("Los Angeles, CA");
  await expect(
    page.getByLabel("Pickup street address", { exact: true }),
  ).toBeEmpty();
  await expect(
    page.getByRole("button", { name: "Publish to member load board" }),
  ).toHaveCount(0);
  expect(store).toHaveLength(0);
});
