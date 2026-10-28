// Smoke test: builds must already exist in dist/. Serves dist via vite preview, loads the page
// in headless Chromium, waits for window.__sim.ready, reports console errors and saves a screenshot.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const PORT = 4173;
const outDir = process.env.SMOKE_OUT ?? "test-results";
mkdirSync(outDir, { recursive: true });

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "pipe" });
await new Promise((resolve) => setTimeout(resolve, 2500));

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") errors.push(`[${msg.type()}] ${msg.text()}`);
});
page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
let ok = false;
try {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__sim?.ready || window.__simError, null, { timeout: 60000 });
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => ({
    err: window.__simError ?? null,
    impacts: window.__sim?.impacts?.(),
    fps: window.__sim?.fps?.(),
    meshes: window.__sim?.meshes?.(),
  }));
  console.log(JSON.stringify(info));
  await page.screenshot({ path: `${outDir}/smoke.png` });
  ok = !info.err;
} catch (e) {
  console.error("SMOKE FAILED", e);
}
console.log(errors.join("\n"));
await browser.close();
server.kill();
process.exit(ok ? 0 : 1);
