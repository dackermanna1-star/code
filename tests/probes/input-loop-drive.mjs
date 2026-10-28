// COPY of tests/probe.mjs with one addition: --driver <file.mjs> (default export async (page) => {}) runs
// Playwright input (trusted clicks/keys) against the page while the probe waits. Used by input-loop-* probes.
// Runtime API probe harness.
// Usage: node tests/probes/input-loop-drive.mjs <path/to/probe.ts> [--driver d.mjs] [--screenshot out.png] [--timeout 60000] [--keep]
// The probe module must `export async function probe(): Promise<any>`; it runs inside a page with a
// full-window <canvas id="renderCanvas">. Its resolved value is printed as JSON. Console errors,
// warnings and page errors are printed too. Exit code 0 when the probe resolved without throwing.
// Each run builds into its own temp dir and serves on a random free port, so parallel runs are safe.
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, extname, relative } from "node:path";
import http from "node:http";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { build } = await import("vite");

const args = process.argv.slice(2);
if (!args[0]) {
  console.error("usage: node tests/probe.mjs <probe.ts> [--screenshot out.png] [--timeout ms] [--keep]");
  process.exit(2);
}
const probePath = resolve(args[0]);
const shotIdx = args.indexOf("--screenshot");
const screenshot = shotIdx >= 0 ? resolve(args[shotIdx + 1]) : null;
const toIdx = args.indexOf("--timeout");
const timeout = toIdx >= 0 ? Number(args[toIdx + 1]) : 90000;
const keep = args.includes("--keep");

const repoRoot = resolve(new URL("../..", import.meta.url).pathname);
const work = mkdtempSync(join(tmpdir(), "probe-"));
const rel = relative(work, probePath).split("\\").join("/");
writeFileSync(
  join(work, "index.html"),
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden;background:#000}#renderCanvas{width:100%;height:100%;display:block}</style></head>
<body><canvas id="renderCanvas"></canvas><script type="module">
import { probe } from "${rel.startsWith(".") ? rel : "./" + rel}";
probe().then((r) => { window.__probeResult = { ok: true, value: r }; })
  .catch((e) => { window.__probeResult = { ok: false, error: String(e && e.stack ? e.stack : e) }; });
</script></body></html>`
);

await build({
  root: work,
  base: "./",
  logLevel: "error",
  configFile: false,
  optimizeDeps: { exclude: ["@babylonjs/havok"] },
  resolve: { alias: { "@src": join(repoRoot, "src") } },
  server: { fs: { allow: [repoRoot, work] } },
  build: { outDir: join(work, "dist"), emptyOutDir: true, target: "es2022", assetsInlineLimit: 0, chunkSizeWarningLimit: 100000 },
});

const MIME = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".json": "application/json" };
const distRoot = join(work, "dist");
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  let p = join(distRoot, url === "/" ? "index.html" : url);
  if (!p.startsWith(distRoot) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); else if (m.type() === "log" && process.env.PROBE_LOGS) logs.push(`[log] ${m.text()}`); });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
let result;
try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  const drvIdx = args.indexOf("--driver");
  if (drvIdx >= 0) {
    const drv = (await import(resolve(args[drvIdx + 1]))).default;
    try { await drv(page); } catch (e) { logs.push("[driver] " + String(e && e.stack ? e.stack : e)); }
  }
  await page.waitForFunction(() => window.__probeResult, null, { timeout });
  result = await page.evaluate(() => window.__probeResult);
  if (screenshot) await page.screenshot({ path: screenshot });
} catch (e) {
  result = { ok: false, error: "harness: " + String(e) };
  if (screenshot) { try { await page.screenshot({ path: screenshot }); } catch {} }
}
await browser.close();
server.close();
if (!keep) rmSync(work, { recursive: true, force: true });
console.log(JSON.stringify(result, null, 2));
if (logs.length) console.log("--- console ---\n" + logs.join("\n"));
process.exit(result && result.ok ? 0 : 1);
