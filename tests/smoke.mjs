// Smoke test: the full game boots in headless Chromium (SwiftShader WebGL2), builds the whole
// furnished apartment, runs, takes hits and renders every room without page / console errors.
//
// Usage: npm run build && node tests/smoke.mjs [--out dir] [--timeout ms] [--url-extra "&quality=low"]
// Screenshots + stats.json land in --out (default test-results/smoke). Exit code 0 = pass.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import http from "node:http";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const repo = resolve(new URL("..", import.meta.url).pathname);
const dist = join(repo, "dist");
const outDir = resolve(arg("--out", process.env.SMOKE_OUT ?? join(repo, "test-results", "smoke")));
const bootTimeout = Number(arg("--timeout", 180000));
const urlExtra = arg("--url-extra", "");
mkdirSync(outDir, { recursive: true });

if (!existsSync(join(dist, "index.html"))) {
  console.error("SMOKE: dist/index.html missing — run `npm run build` first");
  process.exit(2);
}

/**
 * Console messages that are known and harmless. Everything else of type error fails the test;
 * unknown warnings are listed (not fatal).
 */
const BENIGN = [
  /GPU stall due to ReadPixels/i,
  /WebGL: INVALID_ENUM: getParameter/i, // SwiftShader probing extension enums
  /Automatic fallback to software WebGL has been deprecated/i,
  /The AudioContext was not allowed to start/i, // no user gesture in automation
  /\[\.WebGL-[0-9a-fx]+\]GL Driver Message/i, // SwiftShader driver chatter
  /Failed to load resource: the server responded with a status of 404 \(Not Found\)/i, // optional CC0 samples / photos
];

// ---- static server for dist/ on a free port (parallel runs are safe)
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".json": "application/json", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  const p = join(dist, url === "/" ? "index.html" : url);
  if (!p.startsWith(dist) || !existsSync(p) || statSync(p).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[extname(p).toLowerCase()] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const warnings = [];
const logs = [];
page.on("console", (m) => {
  const t = m.type();
  const text = m.text();
  if (BENIGN.some((re) => re.test(text))) return;
  if (t === "error") errors.push(text);
  else if (t === "warning") warnings.push(text);
  else if (t === "log") logs.push(text);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}\n${e.stack ?? ""}`));

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error("SMOKE FAIL:", msg);
};
const t0 = Date.now();
const result = { url: null, bootMs: null, world: null, hits: [], stats: null, screenshots: [] };

try {
  const url = `http://127.0.0.1:${port}/?test=1${urlExtra}`;
  result.url = url;
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__sim?.ready || window.__sim?.error || window.__simError, null, { timeout: bootTimeout, polling: 500 });
  result.bootMs = Date.now() - t0;
  const boot = await page.evaluate(() => ({ error: window.__sim?.error ?? window.__simError ?? null, boot: window.__sim?.boot ?? null, world: window.__sim?.world?.() ?? null }));
  if (boot.error) throw new Error("boot error: " + boot.error);
  result.world = boot.world;
  result.boot = boot.boot;
  console.log(`booted in ${(result.bootMs / 1000).toFixed(1)} s`, JSON.stringify(boot.boot?.timings ?? {}));
  const w = boot.world;
  console.log(`world: ${w.assemblies} assemblies, ${w.parts} parts, ${w.bodies} bodies, ${w.triangles} tris, settle events ${JSON.stringify(w.settleEvents)}`);
  for (const ph of w.phases) console.log(`  ${ph.id.padEnd(10)} ${String(ph.assemblies).padStart(4)} asm ${String(ph.parts).padStart(5)} parts  build ${ph.buildMs} ms  spawn ${ph.spawnMs} ms`);
  if (w.failures.length) fail(`world spawn failures: ${JSON.stringify(w.failures)}`);
  for (const k of ["structure", "fixtures", "kitchen", "living", "bedrooms", "utility"]) {
    const ph = w.phases.find((p) => p.id === k);
    if (!ph || ph.assemblies === 0) fail(`world phase '${k}' spawned nothing`);
  }

  // ---- run in real time for a few seconds (the render loop + fixed steps)
  const simBefore = await page.evaluate(() => window.__sim.stats().time.simTime);
  await page.waitForTimeout(3000);
  const simAfter = await page.evaluate(() => window.__sim.stats().time.simTime);
  console.log(`real-time run: ${(simAfter - simBefore).toFixed(2)} s simulated in 3 s`);
  if (!(simAfter > simBefore)) fail("simulation did not advance in the real-time loop");
  const stepRes = await page.evaluate(() => window.__sim.step(30));
  if (stepRes?.error) fail("step(30) failed: " + stepRes.error);

  // ---- hits: a dish, a drywall partition, a window pane (as the player would swing at them)
  const targets = [
    { q: "plate", tool: "hammer", power: 1 },
    { q: "mug", tool: "bat", power: 1 },
    { q: "partition", tool: "sledgehammer", power: 1 },
    { q: "window", tool: "bat", power: 1 },
  ];
  for (const t of targets) {
    const r = await page.evaluate(({ q, tool, power }) => {
      const sim = window.__sim;
      const a = sim.findAssembly(q);
      if (!a || a.error) return { q, missing: true };
      sim.teleport({ x: a.pos.x + 0.9, y: 1.65, z: a.pos.z + 0.4 }, 0, 0); // eye near the target
      const e0 = sim.eventCount();
      const res = sim.hit({ id: a.id, tool, power });
      sim.step(45);
      const evs = sim.events(e0).map((e) => e.type);
      const count = {};
      for (const k of evs) count[k] = (count[k] ?? 0) + 1;
      const after = sim.listAssemblies().find((x) => x.id === a.id);
      return { q, id: a.id, type: a.type, res, events: count, damage: after?.damage ?? null, islands: after?.islands ?? null };
    }, t);
    result.hits.push(r);
    console.log("hit", JSON.stringify(r));
    if (r.missing) fail(`no assembly matching '${t.q}'`);
    else if (r.res?.error) fail(`hit '${t.q}' threw: ${r.res.error}`);
    else if (!(r.res?.energy > 0)) fail(`hit '${t.q}' delivered no energy`);
  }

  // ---- screenshots from the room poses
  const poses = ["living", "kitchen", "bathroom", "bedroom2", "master", "foyer", "balconyView"];
  for (const name of poses) {
    const r = await page.evaluate((n) => window.__sim.setPose(n), name);
    if (r?.error) {
      fail(`setPose(${name}): ${r.error}`);
      continue;
    }
    await page.waitForTimeout(700); // a few real frames (shadows/env settle, TAA-free)
    const file = join(outDir, `smoke-${name}.png`);
    await page.screenshot({ path: file });
    result.screenshots.push(file);
  }
  await page.evaluate(() => window.__sim.setPose(null));

  // ---- stats
  result.stats = await page.evaluate(() => window.__sim.stats());
  const s = result.stats;
  console.log(
    `stats: fps ${s.fps}, frame ${s.frameMs} ms, draws ${s.drawCalls}, active meshes ${s.activeMeshes}/${s.meshes}, ` +
      `bodies ${s.physics.bodies} (awake ${s.physics.awake}), islands ${s.destruction.islands}, fractures ${s.destruction.fractures}, ` +
      `voices ${s.voices}, particles ${s.particles}, micro ${s.micro}, loop errors ${s.loop?.errors}`,
  );
  if (s.loop?.errors) fail(`${s.loop.errors} game loop errors`);
} catch (e) {
  fail(String(e?.stack ?? e));
  try {
    await page.screenshot({ path: join(outDir, "smoke-failure.png") });
  } catch {
    /* ignore */
  }
}

for (const e of errors) fail(`console error: ${e.slice(0, 2000)}`);
writeFileSync(join(outDir, "smoke.json"), JSON.stringify({ ...result, errors, warnings, logs, failures }, null, 2));
if (warnings.length) console.log(`--- ${warnings.length} console warnings ---\n` + [...new Set(warnings)].slice(0, 40).join("\n"));
await browser.close();
server.close();
console.log(failures.length ? `SMOKE FAILED (${failures.length})` : `SMOKE PASSED in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${outDir}`);
process.exit(failures.length ? 1 : 0);
