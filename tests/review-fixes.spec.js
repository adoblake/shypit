import { installAuthMock, signIn } from "./fixtures/auth-mock.js";
import { loads } from "./fixtures/demo-data.js";
import { test, expect } from "@playwright/test";
import { sampleDate } from "../src/nationwide.js";
import { estimateRoute } from "../src/pricing.js";

const draft = (overrides) => ({
  id: "SHP-TEST",
  from: "Hartford, CT",
  to: "Boston, MA",
  pickup: sampleDate(1),
  delivery: sampleDate(2),
  pallets: 4,
  weight: 3200,
  equipment: "Box truck",
  status: "Ready to book",
  service: "Standard",
  price: 965,
  ...overrides,
});

test("estimates depend on route distance and show matching transit times", () => {
  const short = estimateRoute({
    from: "Hartford, CT",
    to: "Boston, MA",
    pallets: 8,
  });
  const long = estimateRoute({
    from: "Seattle, WA",
    to: "Miami, FL",
    pallets: 8,
  });
  expect(long.standard).toBeGreaterThan(short.standard * 3);
  expect(long.priority).toBeGreaterThan(long.standard);
  expect(short.standardDays).toBe(1);
  expect(long.standardDays).toBeGreaterThan(4);
  expect(
    estimateRoute({ from: "Anchorage, AK", to: "Seattle, WA" }),
  ).toBeNull();
  expect(estimateRoute({ from: "Somewhere", to: "Seattle, WA" })).toBeNull();
});

test("long routes no longer show a flat price or 1–2 day transit", async ({
  page,
}) => {
  const long = draft({
    id: "SHP-LONG",
    from: "Seattle, WA",
    to: "Miami, FL",
    pallets: 8,
  });
  await installAuthMock(page, {
    data: { shipments: [long], loads, jobs: [] },
  });
  await page.goto("/");
  await signIn(page);
  const aside = page.locator("aside");
  const { standard, standardDays } = estimateRoute(long);
  await expect(aside).toContainText("$" + standard.toLocaleString("en-US"));
  await expect(aside).toContainText(
    `Typical ${standardDays}–${standardDays + 1} day transit`,
  );
  await expect(aside).not.toContainText("$965");
  await expect(aside).not.toContainText("1–2 day");
});

test("a draft whose pickup date passed must be rescheduled before booking", async ({
  page,
}) => {
  const auth = await installAuthMock(page, {
    data: {
      shipments: [draft({ pickup: sampleDate(-2), delivery: sampleDate(-1) })],
      loads,
      jobs: [],
    },
  });
  await page.goto("/");
  await signIn(page);
  await expect(page.getByRole("button", { name: /Hartford/ })).toContainText(
    "Pickup date passed",
  );
  await expect(page.getByRole("button", { name: "Review & book" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Choose new dates" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Pickup date")).toHaveAttribute(
    "min",
    sampleDate(0),
  );
  await dialog.getByLabel("Pickup date").fill(sampleDate(3));
  await dialog.getByLabel("Delivery date").fill(sampleDate(4));
  await dialog.getByRole("button", { name: "Update dates" }).click();
  await expect(
    page.getByRole("button", { name: "Review & book" }),
  ).toBeVisible();
  await expect(page.getByText("Saved securely")).toBeVisible();
  expect(auth.data.shipments).toHaveLength(1);
  expect(auth.data.shipments[0]).toMatchObject({
    id: "SHP-TEST",
    pickup: sampleDate(3),
  });
});

test("an empty business workspace opens and can create its first shipment", async ({
  page,
}) => {
  const auth = await installAuthMock(page, {
    data: { shipments: [], loads: [], jobs: [] },
  });
  await page.goto("/");
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "No shipments yet" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Repeat a recent route" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "New shipment", exact: true })
    .first()
    .click();
  await page.getByLabel("Pickup location").fill("Chicago, IL");
  await page.getByLabel("Delivery location").fill("Dallas, TX");
  await page.getByLabel("Pickup date").fill(sampleDate(1));
  await page.getByLabel("Delivery date").fill(sampleDate(3));
  await page.getByRole("button", { name: "Create shipment draft" }).click();
  await expect(page.locator("aside")).toContainText("Chicago");
  await expect(page.getByText("Saved securely")).toBeVisible();
  expect(auth.data.shipments).toHaveLength(1);
  expect(auth.data.shipments[0].id).toMatch(/^SHP-[0-9A-F]{8}$/);
});

test("an empty carrier workspace opens practice loads without crashing", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await installAuthMock(page, {
    role: "driver",
    data: { shipments: [], loads: [], jobs: [] },
  });
  await page.goto("/");
  await signIn(page);
  await page
    .getByRole("button", { name: "Practice with sample loads" })
    .click();
  await expect(
    page.getByRole("heading", { name: "No practice loads" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("a teammate's save is merged instead of signing the user out", async ({
  page,
}) => {
  const auth = await installAuthMock(page);
  await page.goto("/");
  await signIn(page);
  await expect(page.locator("aside")).toContainText("SHP-1042");
  // Another member of the workspace saves while this page is open.
  auth.data = {
    ...auth.data,
    shipments: [draft({ id: "SHP-TEAMMATE" }), ...auth.data.shipments],
  };
  auth.revision++;
  await page.getByRole("button", { name: "Review & book" }).click();
  await page.getByRole("button", { name: "Confirm demo booking" }).click();
  await expect(page.getByText("Saved securely")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /SHP-TEAMMATE/ }),
  ).toBeVisible();
  const ids = auth.data.shipments.map((s) => s.id);
  expect(ids).toContain("SHP-TEAMMATE");
  expect(auth.data.shipments.find((s) => s.id === "SHP-1042").status).toBe(
    "Awaiting carrier",
  );
});

test("rapid consecutive changes are all saved", async ({ page }) => {
  const auth = await installAuthMock(page, {
    data: { shipments: [], loads, jobs: [] },
  });
  await page.goto("/");
  await signIn(page);
  for (const [from, to] of [
    ["Chicago, IL", "Dallas, TX"],
    ["Denver, CO", "Omaha, NE"],
  ]) {
    await page
      .getByRole("button", { name: "New shipment", exact: true })
      .first()
      .click();
    await page.getByLabel("Pickup location").fill(from);
    await page.getByLabel("Delivery location").fill(to);
    await page.getByLabel("Pickup date").fill(sampleDate(1));
    await page.getByLabel("Delivery date").fill(sampleDate(3));
    await page.getByRole("button", { name: "Create shipment draft" }).click();
  }
  await expect(page.getByText("Saved securely")).toBeVisible();
  await expect.poll(() => auth.data.shipments.length).toBe(2);
});

test("recent routes come from the workspace's booked shipments", async ({
  page,
}) => {
  await installAuthMock(page, {
    data: {
      shipments: [
        draft({
          id: "SHP-A",
          from: "Chicago, IL",
          to: "Dallas, TX",
          status: "Delivered",
        }),
        draft({ id: "SHP-B" }),
      ],
      loads,
      jobs: [],
    },
  });
  await page.goto("/");
  await signIn(page);
  const recent = page.locator(".recent");
  await expect(recent).toContainText("Chicago → Dallas");
  await expect(recent).not.toContainText("Hartford");
  await expect(recent).not.toContainText("Phoenix");
});

test("mobile navigation stays on one row", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAuthMock(page);
  await page.goto("/");
  await signIn(page);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("button")).toHaveCount(5);
  const tops = await nav
    .getByRole("button")
    .evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().top)),
    );
  expect(new Set(tops).size).toBe(1);
  await expect(
    page.getByRole("button", { name: "Package tracking", exact: true }),
  ).toBeVisible();
});
