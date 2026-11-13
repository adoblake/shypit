import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const root = resolve("dist");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/shypit/")) {
    res.writeHead(404);
    return res.end("Not found");
  }
  const path = resolve(
    root,
    decodeURIComponent(url.pathname.slice("/shypit/".length)) || "index.html",
  );
  if (!path.startsWith(root + "/") && path !== root) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const body = await readFile(path);
    res.writeHead(200, {
      "Content-Type": mime[extname(path)] || "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try {
  browser = await chromium.launch(
    process.env.CI
      ? {}
      : { executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] },
  );
  for (const viewport of [
    { width: 1440, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400)
        errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/shypit/`);
    await page
      .getByRole("heading", { name: "Sign in to your workspace." })
      .waitFor({ timeout: 10000 });
    assert.equal(
      await page.getByRole("navigation").count(),
      0,
      "Logged-out visitors must not see workspace navigation",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "New shipment", exact: true })
        .count(),
      0,
      "No public shipment access",
    );
    const config = JSON.parse(await readFile("dist/auth-config.json", "utf8"));
    if (!config.url || !config.publicKey)
      await page.getByText("Sign-in is being set up.").waitFor();
    else
      await page
        .getByRole("button", { name: "Continue with Google" })
        .waitFor();
    assert.deepEqual(
      errors,
      [],
      "Production page must not have failed assets or runtime errors",
    );
    console.log(`Locked production /shypit/ smoke passed: ${viewport.width}px`);
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
