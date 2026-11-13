import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const root = resolve("dist");
const mime = {
  ".html": "text/html",
  ".mp4": "video/mp4",
  ".json": "application/json",
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
    (decodeURIComponent(url.pathname.slice("/shypit/".length)) || "") +
      (url.pathname.endsWith("/") ? "index.html" : ""),
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
        .getByRole("button", { name: "Sign in", exact: true })
        .waitFor();
    assert.deepEqual(
      errors,
      [],
      "Production page must not have failed assets or runtime errors",
    );
    console.log(`Locked production /shypit/ smoke passed: ${viewport.width}px`);
    await page.goto(
      `http://127.0.0.1:${server.address().port}/shypit/walkthrough/`,
    );
    const media = page.locator("video");
    await media.evaluate(
      (video) =>
        new Promise((resolve, reject) => {
          if (video.readyState >= 1) return resolve();
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(Error("Walkthrough media failed"));
        }),
    );
    assert.ok(
      await media.evaluate(
        (video) => video.duration > 45 && video.duration < 90,
      ),
      "Walkthrough duration must match the recorded scenario",
    );
    await media.evaluate(async (video) => {
      video.muted = true;
      await video.play();
    });
    await page.waitForTimeout(400);
    assert.ok(
      await media.evaluate((video) => video.currentTime > 0),
      "Walkthrough must play",
    );
    console.log(`Walkthrough playback passed: ${viewport.width}px`);
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
