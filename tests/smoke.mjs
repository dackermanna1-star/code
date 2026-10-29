// Smoke test: the full game boots in headless Chromium (SwiftShader WebGL2), builds the whole
// furnished apartment, runs, takes hits and renders every room without page / console errors.
//
// Usage: npm run build && node tests/smoke.mjs [--out dir] [--timeout ms] [--url-extra "&quality=low"] [--strict-idle]
// --strict-idle makes the idle-performance check (bodies come to rest, physics step within budget)
// fatal; by default it is reported as IDLE WARN (known open issue: jointed groups never sleep).
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
const strictIdle = args.includes("--strict-idle");
/** Idle check: after IDLE_STEPS fixed steps without input, at most this many bodies awake / this physics step time. */
const IDLE_STEPS = 300;
const IDLE_MAX_AWAKE = 60;
const IDLE_MAX_STEP_MS = 5; // ARCHITECTURE §11 physics budget (CPU timing; SwiftShader-independent)
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
];
/**
 * The console's "Failed to load resource … 404" line carries no URL, so 404s are judged from the
 * network responses instead: only these optional assets may be missing (the game falls back to
 * synthesized sounds / procedural textures); any other 404 (texture, chunk, wasm …) fails.
 */
const OPTIONAL_404 = [
  /\/assets\/sounds?\//i, // optional CC0 samples (audio/samples.ts falls back to synthesis)
  /\/assets\/textures\/.*\.(jpe?g|png|webp)$/i, // optional photo textures (procedural fallback)
  /\/assets\/photos?\//i, // optional printed photos (posters, frames)
  /\/favicon\.ico$/i,
];
const RE_404 = /Failed to load resource: the server responded with a status of 404 \(Not Found\)/i;

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
const missing = [];
const optionalMissing = [];
page.on("response", (r) => {
  if (r.status() !== 404) return;
  const path = new URL(r.url()).pathname;
  if (OPTIONAL_404.some((re) => re.test(path))) optionalMissing.push(path);
  else missing.push(path);
});
page.on("console", (m) => {
  const t = m.type();
  const text = m.text();
  if (BENIGN.some((re) => re.test(text)) || RE_404.test(text)) return; // 404s: judged by URL above
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
const result = { url: null, bootMs: null, world: null, idle: null, hits: [], stats: null, screenshots: [] };

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
  // the rest is driven by hand: deterministic, and screenshots never wait on a slow SwiftShader frame
  await page.evaluate(() => window.__sim.loop(false));
  const stepRes = await page.evaluate(() => window.__sim.step(30));
  if (stepRes?.error) fail("step(30) failed: " + stepRes.error);

  // ---- idle: with no input everything should come to rest and the physics step fit its budget
  result.idle = await page.evaluate((n) => {
    const sim = window.__sim;
    const e0 = sim.eventCount();
    const batches = [];
    for (let done = 0; done < n; done += 60) {
      const r = sim.step(Math.min(60, n - done));
      const st = sim.stats();
      batches.push({ steps: r.steps, ms: r.ms, awake: st.physics.awake, stepMs: Math.round(st.physics.stepMs * 100) / 100 });
    }
    const ev = {};
    for (const e of sim.events(e0)) ev[e.type] = (ev[e.type] ?? 0) + 1;
    return { batches, events: ev, awake: sim.awake(8) };
  }, IDLE_STEPS);
  {
    const last = result.idle.batches.at(-1);
    console.log(`idle ${IDLE_STEPS} steps: ${result.idle.batches.map((b) => `awake ${b.awake} step ${b.stepMs} ms`).join(" → ")}; events ${JSON.stringify(result.idle.events)}`);
    console.log(`  still awake: ${result.idle.awake.map((a) => `${a.name} (${a.room ?? "-"}) ${a.awake}/${a.islands} v${a.maxSpeed}`).join(", ")}`);
    const idleIssues = [];
    if (last.awake > IDLE_MAX_AWAKE) idleIssues.push(`${last.awake} bodies still awake after ${IDLE_STEPS} idle steps (max ${IDLE_MAX_AWAKE})`);
    if (last.stepMs > IDLE_MAX_STEP_MS) idleIssues.push(`idle physics step ${last.stepMs} ms (budget ${IDLE_MAX_STEP_MS} ms)`);
    if ((result.idle.events.damage ?? 0) > 0 || (result.idle.events.bondBreak ?? 0) > 0) idleIssues.push(`damage while idle: ${JSON.stringify(result.idle.events)}`);
    result.idle.issues = idleIssues;
    for (const m of idleIssues) {
      if (strictIdle) fail(m);
      else console.warn("IDLE WARN:", m);
    }
  }

  // ---- hits: a dish, a drywall partition, a window pane (as the player would swing at them).
  // `mustBreak`: brittle targets must fracture / lose bonds, not just absorb energy.
  const targets = [
    { q: "plate", tool: "hammer", power: 1, mustBreak: true },
    { q: "mug", tool: "bat", power: 1, mustBreak: true },
    { q: "partition", tool: "sledgehammer", power: 1, mustBreak: false },
    { q: "window", tool: "bat", power: 1, mustBreak: true },
  ];
  for (const t of targets) {
    const r = await page.evaluate(({ q, tool, power }) => {
      const sim = window.__sim;
      const a = sim.findAssembly(q);
      if (!a || a.error) return { q, missing: true };
      // stand ~0.9 m from the target, in its room, with the capsule clear of any furniture (a
      // capsule dropped into a body wrecks it and corrupts the test): try a ring of spots
      const room = sim.roomAt(a.pos);
      let spot = null;
      for (const r of [0.9, 1.3, 0.6]) {
        for (let k = 0; k < 12 && !spot; k++) {
          const ang = (k / 12) * Math.PI * 2;
          const p = { x: a.pos.x + Math.sin(ang) * r, y: 1.65, z: a.pos.z + Math.cos(ang) * r };
          if (room && sim.roomAt(p) !== room) continue;
          const tp = sim.teleport(p, Math.atan2(a.pos.x - p.x, a.pos.z - p.z), 0.3, { strict: true });
          if (tp.ok) spot = p;
        }
        if (spot) break;
      }
      if (!spot) return { q, id: a.id, noSpot: true };
      sim.step(2);
      const e0 = sim.eventCount();
      const res = sim.hit({ id: a.id, tool, power });
      sim.step(45);
      const evs = sim.events(e0).map((e) => e.type);
      const count = {};
      for (const k of evs) count[k] = (count[k] ?? 0) + 1;
      const after = sim.listAssemblies().find((x) => x.id === a.id);
      return { q, id: a.id, type: a.type, spot, res, events: count, damage: after?.damage ?? null, islands: after?.islands ?? null };
    }, t);
    result.hits.push(r);
    console.log("hit", JSON.stringify(r));
    if (r.missing) fail(`no assembly matching '${t.q}'`);
    else if (r.res?.error) fail(`hit '${t.q}' threw: ${r.res.error}`);
    else if (r.noSpot) fail(`no clear spot to stand near '${t.q}'`);
    else if (!(r.res?.energy > 0)) fail(`hit '${t.q}' delivered no energy`);
    else if (t.mustBreak && !r.res.broke && !(r.events.fracture > 0) && !(r.events.bondBreak > 0)) fail(`hit '${t.q}' broke nothing: ${JSON.stringify(r.events)}`);
  }

  // ---- screenshots from the room poses (canvas captures: the 3D view without the HUD)
  const poses = ["living", "kitchen", "bathroom", "bedroom2", "master", "foyer", "balconyView"];
  for (const name of poses) {
    const r = await page.evaluate((n) => window.__sim.setPose(n), name);
    if (r?.error) {
      fail(`setPose(${name}): ${r.error}`);
      continue;
    }
    const url = await page.evaluate(() => window.__sim.capture(3, "image/png"));
    if (typeof url !== "string" || !url.startsWith("data:image/png;base64,")) {
      fail(`capture(${name}) failed: ${JSON.stringify(url).slice(0, 300)}`);
      continue;
    }
    const file = join(outDir, `smoke-${name}.png`);
    writeFileSync(file, Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
    result.screenshots.push(file);
  }
  // one full-page shot of the player view with the HUD (non-fatal: headless compositing can be slow)
  await page.evaluate(() => {
    window.__sim.setPose(null);
    window.__sim.render(2);
  });
  try {
    await page.screenshot({ path: join(outDir, "smoke-hud.png"), timeout: 60000 });
    result.screenshots.push(join(outDir, "smoke-hud.png"));
  } catch (e) {
    console.log("HUD page screenshot skipped:", String(e).split("\n")[0]);
  }

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
for (const m of [...new Set(missing)]) fail(`missing resource (404): ${m}`);
if (optionalMissing.length) console.log(`optional assets missing (fallbacks used): ${[...new Set(optionalMissing)].length}`);
writeFileSync(join(outDir, "smoke.json"), JSON.stringify({ ...result, errors, warnings, logs, missing, optionalMissing, failures }, null, 2));
if (warnings.length) console.log(`--- ${warnings.length} console warnings ---\n` + [...new Set(warnings)].slice(0, 40).join("\n"));
await browser.close();
server.close();
console.log(failures.length ? `SMOKE FAILED (${failures.length})` : `SMOKE PASSED in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${outDir}`);
process.exit(failures.length ? 1 : 0);
