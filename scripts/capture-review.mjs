import {
  installAuthMock,
  passwordSignIn,
} from "../tests/fixtures/auth-mock.js";
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir("docs/review", { recursive: true });
const browser = await chromium.launch(
  process.env.CI
    ? {}
    : { executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] },
);
const memberships = [
  {
    workspace_id: "22222222-2222-4222-8222-222222222222",
    role: "business",
    display_name: "Company preview",
  },
  {
    workspace_id: "33333333-3333-4333-8333-333333333333",
    role: "driver",
    display_name: "LLC carrier preview",
  },
];
for (const [name, width, height] of [
  ["desktop", 1440, 1024],
  ["mobile", 390, 844],
]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await installAuthMock(page, {
    emailOtpEnabled: false,
    googleEnabled: false,
    memberships,
  });
  await page.goto("http://127.0.0.1:4173");
  await page.getByLabel("Email address", { exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `docs/review/${name}-login.png` });
  await passwordSignIn(page);
  await page.getByRole("heading", { name: "Choose your workspace." }).waitFor();
  await page.screenshot({ path: `docs/review/${name}-workspace-choice.png` });
  await page.getByRole("button", { name: /Company workspace/ }).click();
  await page.getByRole("navigation").waitFor();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `docs/review/${name}-business.png` });
  await page.getByRole("button", { name: "Switch workspace" }).click();
  await page.getByRole("button", { name: /Carrier \/ LLC workspace/ }).click();
  await page.getByRole("navigation").waitFor();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `docs/review/${name}-driver.png` });
  await page.close();
}
await browser.close();
