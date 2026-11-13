import { installAuthMock, signIn } from "../tests/fixtures/auth-mock.js";
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir("docs/review", { recursive: true });
const browser = await chromium.launch(
  process.env.CI
    ? {}
    : { executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] },
);
for (const [name, width, height] of [
  ["desktop", 1440, 1024],
  ["mobile", 390, 844],
]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const auth = await installAuthMock(page, { emailOtpEnabled: false });
  await page.goto("http://127.0.0.1:4173");
  await page.screenshot({ path: `docs/review/${name}-login.png` });
  auth.emailOtpEnabled = true;
  await page.reload();
  await signIn(page);
  await page.getByRole("navigation").waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `docs/review/${name}-business.png` });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  auth.role = "driver";
  await signIn(page);
  await page.getByRole("navigation").waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `docs/review/${name}-driver.png` });
  await page.close();
}
await browser.close();
