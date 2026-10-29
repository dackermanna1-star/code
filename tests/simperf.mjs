// Simulation perf harness: boots the full furnished game in headless Chromium (?test=1&hold=1), wrecks the
// living room / kitchen (the same sequence as tests/perf.mjs "destruction": sledgehammer + axe on the ~40 nearest
// furniture assemblies and 4 partitions/windows, then 12 thrown mugs/plates) and measures the SIMULATION per fixed
// step while the debris flies and settles — without rendering (SwiftShader shadow re-renders would dominate wall
// time and add nothing to the simulation numbers). Each measured frame = 1 fixed step + the per-frame updates
// (player, audio, vfx, destruction, render.update, hud), i.e. a 60 Hz frame minus scene.render().
//
// Reports per window (idle before, 0–1 s, 1–3 s, 3–6 s, 6–12 s after the sequence): fixed-step ms (mean, p95,
// max) split into physics (Havok / events / sync+sleep / impacts), destruction.afterPhysics, vfx, player; awake
// bodies, contact pairs, raw events and impacts per step, substeps, debris counts; plus the real-loop frame time
// the accumulator would produce (steps per frame from the measured costs, see accumulatorModel). Optional:
// allocation sampling (--alloc), CPU profile (--profile), screenshots of fixed poses at the end (--shots dir).
//
// Usage:
//   node tests/simperf.mjs [--quality high] [--seconds 12] [--out test-results/perf/sim.json] [--alloc] [--profile]
//        [--shots dir] [--dist dir | --keep-dist dir] [--seed N] [--timeout 300000] [--url-extra "&x=1"] [--pre f.js] [--diag f.js]
// --dist serves an existing build; --keep-dist builds into that directory and keeps it (reuse with --dist).
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import http from "node:http";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : d;
};
const flag = (k) => args.includes(k);
const repo = resolve(new URL("..", import.meta.url).pathname);
const quality = arg("--quality", "");
const SECONDS = Math.max(2, Number(arg("--seconds", 12)));
const outFile = resolve(repo, arg("--out", "test-results/perf/sim.json"));
const shotsDir = arg("--shots", "") ? resolve(arg("--shots", "")) : null;
const ALLOC = flag("--alloc");
const PROFILE = flag("--profile");
const bootTimeout = Number(arg("--timeout", 300000));
const urlExtra = arg("--url-extra", "");
const seed = arg("--seed", "");
/** --diag file: a JS function body evaluated in the page after the measurement (its return value is printed). */
const diagFile = arg("--diag", "");
/** --pre file: a JS function body evaluated in the page right before the destruction sequence (A/B experiments). */
const preFile = arg("--pre", "");
const t0 = Date.now();
const log = (...a) => console.log(`[simperf ${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);

// ------------------------------------------------------------------ build (or reuse)
let distDir = arg("--dist", "") ? resolve(arg("--dist", "")) : "";
let tempDir = null;
if (!distDir) {
  const { build } = await import("vite");
  const keep = arg("--keep-dist", "");
  if (keep) distDir = resolve(keep);
  else {
    tempDir = mkdtempSync(join(tmpdir(), "simperf-"));
    distDir = join(tempDir, "dist");
  }
  log(`building into ${distDir}`);
  await build({ root: repo, configFile: join(repo, "vite.config.ts"), logLevel: "error", build: { outDir: distDir, emptyOutDir: true, minify: false, reportCompressedSize: false } });
}
if (!existsSync(join(distDir, "index.html"))) {
  console.error(`SIMPERF: ${distDir}/index.html missing`);
  process.exit(2);
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  const p = join(distDir, url === "/" ? "index.html" : url);
  if (!p.startsWith(distDir) || !existsSync(p) || statSync(p).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[extname(p).toLowerCase()] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--enable-precise-memory-info"] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 400));
});
page.on("pageerror", (e) => consoleErrors.push(`[pageerror] ${e.message}`));

// ------------------------------------------------------------------ in-page instrumentation
function install() {
  const G = window.__game;
  if (!G) throw new Error("window.__game missing (boot with ?test=1)");
  const { ctx, game } = G;
  const now = () => performance.now();
  const S = { rec: null };
  window.__simperf = S;
  const wrap = (obj, name, key) => {
    const orig = obj[name];
    if (typeof orig !== "function") return;
    obj[name] = function (...a) {
      const t = now();
      try {
        return orig.apply(this, a);
      } finally {
        if (S.rec) S.rec[key] = (S.rec[key] ?? 0) + (now() - t);
      }
    };
  };
  wrap(ctx.player, "fixedUpdate", "player");
  wrap(ctx.destruction, "beforePhysics", "dBefore");
  wrap(ctx.physics, "step", "physics");
  wrap(ctx.destruction, "afterPhysics", "dAfter");
  wrap(ctx.vfx, "fixedUpdate", "vfx");
  const ph = ctx.physics;
  const dest = ctx.destruction;
  const FIXED = 1 / 60;
  /** n frames of 1 fixed step + the frame updates (no scene.render). Returns per-step records. */
  S.frames = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      S.rec = {};
      const t = now();
      game.fixedStep();
      const t1 = now();
      game.frameUpdate(FIXED, FIXED);
      const t2 = now();
      const d = ph.debugStats ? ph.debugStats() : ph.stats();
      const ds = dest.stats();
      const r = S.rec;
      S.rec = null;
      out.push({
        step: t1 - t,
        update: t2 - t1,
        physics: r.physics ?? 0,
        havok: d.havokMs ?? 0,
        events: d.eventsMs ?? 0,
        sync: d.syncMs ?? 0,
        impactsMs: d.impactsMs ?? 0,
        dAfter: r.dAfter ?? 0,
        dBefore: r.dBefore ?? 0,
        vfx: r.vfx ?? 0,
        player: r.player ?? 0,
        awake: d.awake,
        bodies: d.bodies,
        pairs: d.contactPairs ?? 0,
        ev: d.eventsLastStep ?? 0,
        imp: d.impactsLastStep ?? 0,
        hot: d.hotBodies ?? 0,
        subs: d.substepsLast ?? 1,
        dyn: ds.dynamicIslands,
        debris: ds.debrisIslands,
        consolidated: ds.consolidated,
        islands: ds.islands,
        parts: ds.parts,
        micro: ctx.vfx.microCount ?? 0,
      });
    }
    return out;
  };
  return { ok: true };
}

/** The destruction sequence of tests/perf.mjs, stepping without rendering. */
function wreck() {
  const s = window.__sim;
  const { game } = window.__game;
  const steps = (k) => {
    for (let i = 0; i < k; i++) {
      game.fixedStep();
      game.frameUpdate(1 / 60, 1 / 60);
    }
  };
  const me = s.player().pos;
  const all = s.listAssemblies();
  const isStructure = (a) => /wall|partition|slab|floor|ceiling|concrete|stud|joist|baseboard|trim|frame|door|window/i.test(`${a.type} ${a.name}`);
  const furn = all.filter((a) => ["living", "kitchen"].includes(a.room) && a.parts >= 2 && !isStructure(a));
  furn.sort((a, b) => Math.hypot(a.pos.x - me.x, a.pos.z - me.z) - Math.hypot(b.pos.x - me.x, b.pos.z - me.z));
  const structure = all.filter((a) => ["living", "kitchen", null].includes(a.room) && /partition|window/i.test(`${a.type} ${a.name}`)).slice(0, 4);
  const targets = [...furn.slice(0, 40), ...structure];
  const e0 = s.eventCount();
  let hits = 0,
    errors = 0;
  const t = performance.now();
  for (const a of targets) {
    for (const tool of ["sledgehammer", "axe"]) {
      const r = s.hit({ id: a.id, tool, power: 1 });
      if (r && r.error) errors++;
      else hits++;
    }
    steps(2);
  }
  let thrown = 0;
  for (const a of furn.slice(0, 12)) {
    const r = s.throwAt(a.id, 14, thrown % 2 ? "plate" : "mug");
    if (!(r && r.error)) thrown++;
    steps(1);
  }
  const ev = {};
  for (const e of s.events(e0)) ev[e.type] = (ev[e.type] ?? 0) + 1;
  return { targets: targets.length, hits, errors, thrown, ms: Math.round(performance.now() - t), events: ev, stats: s.stats().destruction };
}

// ------------------------------------------------------------------ helpers
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
function stat(xs) {
  if (!xs.length) return { mean: 0, p50: 0, p95: 0, max: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const q = (f) => s[Math.min(s.length - 1, Math.floor(f * s.length))];
  return { mean: r2(xs.reduce((a, b) => a + b, 0) / xs.length), p50: r2(q(0.5)), p95: r2(q(0.95)), max: r2(s[s.length - 1]) };
}
/**
 * What the real loop would do with these step costs: Time.beginFrame runs floor(acc / dt) steps per frame (capped),
 * a frame costs Σ steps + `renderMs`. Returns mean frame ms, mean steps per frame and the simulated / real time ratio.
 */
function accumulatorModel(stepMs, renderMs, maxSteps) {
  let acc = 0,
    i = 0,
    frames = 0,
    real = 0,
    sim = 0,
    steps = 0,
    last = 16.7;
  const DT = 1000 / 60;
  while (i < stepMs.length && frames < 100000) {
    acc += Math.min(Math.max(last, 0), 250);
    let n = Math.floor(acc / DT);
    if (n > maxSteps) {
      n = maxSteps;
      acc = 0;
    } else acc -= n * DT;
    let ms = renderMs;
    for (let k = 0; k < n && i < stepMs.length; k++) ms += stepMs[i++];
    ms = Math.max(ms, DT); // vsync
    real += ms;
    sim += n * DT;
    steps += n;
    frames++;
    last = ms;
  }
  return { frameMs: r1(real / Math.max(frames, 1)), stepsPerFrame: r2(steps / Math.max(frames, 1)), simSpeed: r2(sim / Math.max(real, 1)) };
}
function window_(name, recs) {
  const pick = (k) => recs.map((r) => r[k]);
  const last = recs[recs.length - 1] ?? {};
  const physOther = recs.map((r) => Math.max(0, r.physics - r.havok - r.events - r.sync - r.impactsMs));
  return {
    name,
    steps: recs.length,
    stepMs: stat(pick("step")),
    physicsMs: stat(pick("physics")),
    havokMs: stat(pick("havok")),
    eventsMs: stat(pick("events")),
    syncSleepMs: stat(pick("sync")),
    impactsMs: stat(pick("impactsMs")),
    physicsOtherMs: stat(physOther),
    destructionMs: stat(pick("dAfter")),
    vfxMs: stat(pick("vfx")),
    playerMs: stat(pick("player")),
    frameUpdateMs: stat(pick("update")),
    awake: stat(pick("awake")),
    contactPairs: stat(pick("pairs")),
    eventsPerStep: stat(pick("ev")),
    impactsPerStep: stat(pick("imp")),
    hotBodies: stat(pick("hot")),
    substeps: stat(pick("subs")),
    end: { awake: last.awake, bodies: last.bodies, dynamic: last.dyn, debris: last.debris, consolidated: last.consolidated, islands: last.islands, parts: last.parts, micro: last.micro },
  };
}
function line(w) {
  return `${w.name.padEnd(12)} step ${String(w.stepMs.mean).padStart(7)} (p95 ${String(w.stepMs.p95).padStart(7)}, max ${String(w.stepMs.max).padStart(7)}) | phys ${String(w.physicsMs.mean).padStart(6)} (havok ${w.havokMs.mean}, ev ${w.eventsMs.mean}, sync ${w.syncSleepMs.mean}, imp ${w.impactsMs.mean}) | destr ${String(w.destructionMs.mean).padStart(6)} (max ${w.destructionMs.max}) | vfx ${w.vfxMs.mean} | awake ${w.awake.mean} | pairs ${w.contactPairs.mean} | ev ${w.eventsPerStep.mean} | subs ${w.substeps.mean} | end ${JSON.stringify(w.end)}`;
}

let cdp = null;
async function session() {
  if (!cdp) cdp = await page.context().newCDPSession(page);
  return cdp;
}
async function allocStart() {
  if (!ALLOC) return;
  const c = await session();
  await c.send("HeapProfiler.enable");
  await c.send("HeapProfiler.startSampling", { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
}
async function allocStop(frames) {
  if (!ALLOC) return null;
  const { profile } = await cdp.send("HeapProfiler.stopSampling");
  const self = new Map();
  let total = 0;
  const walk = (nd) => {
    const cf = nd.callFrame;
    const k = `${cf.functionName || "(anonymous)"} ${(cf.url || "").split("/").pop() || "(native)"}:${cf.lineNumber + 1}`;
    if (nd.selfSize) {
      self.set(k, (self.get(k) ?? 0) + nd.selfSize);
      total += nd.selfSize;
    }
    for (const ch of nd.children || []) walk(ch);
  };
  walk(profile.head);
  return { sampledMBPerFrame: r2(total / 1048576 / frames), top: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([name, b]) => ({ name, kbPerFrame: r1(b / 1024 / frames) })) };
}
async function profileStart() {
  if (!PROFILE) return;
  const c = await session();
  await c.send("Profiler.enable");
  await c.send("Profiler.setSamplingInterval", { interval: 250 });
  await c.send("Profiler.start");
}
async function profileStop(name) {
  if (!PROFILE) return null;
  const { profile } = await cdp.send("Profiler.stop");
  const dir = join(repo, "test-results", "perf");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `sim-${name}.cpuprofile`), JSON.stringify(profile));
  const dt = new Map();
  const byId = new Map(profile.nodes.map((nd) => [nd.id, nd]));
  for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0));
  const fn = new Map();
  let total = 0;
  for (const [id, us] of dt) {
    const nd = byId.get(id);
    if (!nd) continue;
    total += us;
    const cf = nd.callFrame;
    const k = `${cf.functionName || "(anonymous)"} ${(cf.url || "").split("/").pop() || "(native)"}:${cf.lineNumber + 1}`;
    fn.set(k, (fn.get(k) ?? 0) + us);
  }
  return { totalMs: r1(total / 1000), top: [...fn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, us]) => ({ name, ms: r1(us / 1000), pct: r1((100 * us) / Math.max(1, total)) })) };
}
async function frames(n) {
  const out = [];
  for (let left = n; left > 0; left -= 30) out.push(...(await page.evaluate((k) => window.__simperf.frames(k), Math.min(30, left))));
  return out;
}
async function shot(name, pos, target) {
  if (!shotsDir) return;
  mkdirSync(shotsDir, { recursive: true });
  const yaw = Math.atan2(target.x - pos.x, target.z - pos.z);
  const pitch = Math.atan2(-(target.y - pos.y), Math.hypot(target.x - pos.x, target.z - pos.z));
  await page.evaluate(({ pos, yaw, pitch }) => window.__sim.setPose({ pos, yaw, pitch }), { pos, yaw, pitch });
  const url = await page.evaluate(() => window.__sim.capture(3));
  writeFileSync(join(shotsDir, `${name}.png`), Buffer.from(String(url).split(",")[1], "base64"));
  await page.evaluate(() => window.__sim.setPose(null));
}

// ------------------------------------------------------------------ run
const report = { date: new Date().toISOString(), args, windows: {}, notes: [] };
let exitCode = 0;
try {
  const url = `http://127.0.0.1:${port}/?test=1&hold=1${quality ? `&quality=${quality}` : ""}${seed ? `&seed=${seed}` : ""}${urlExtra}`;
  log("booting", url.replace(/^http:\/\/[^/]+/, ""));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__sim?.ready || window.__sim?.error || window.__simError, null, { timeout: bootTimeout, polling: 500 });
  const boot = await page.evaluate(() => ({ error: window.__sim?.error ?? window.__simError ?? null, world: window.__sim?.world?.() ?? null, quality: window.__sim?.boot?.quality }));
  if (boot.error) throw new Error("boot error: " + boot.error);
  report.boot = { quality: boot.quality, bodies: boot.world?.bodies, parts: boot.world?.parts, awakeAfterSettle: boot.world?.awakeAfterSettle };
  log("booted", JSON.stringify(report.boot));
  await page.evaluate(() => window.__sim.loop(false));
  await page.evaluate(install);
  await page.evaluate(({ pos, yaw, pitch }) => window.__sim.teleport(pos, yaw, pitch), { pos: { x: 6.6, y: 1.65, z: 2.2 }, yaw: 0, pitch: 0.35 });
  await frames(240); // settle after the teleport
  const idle = await frames(120);
  report.windows.idle = window_("idle", idle);
  console.log(line(report.windows.idle));
  if (shotsDir) await shot("before-kitchen", { x: 6.6, y: 1.65, z: 2.2 }, { x: 6.6, y: 0.9, z: 6.5 });

  if (preFile) report.pre = await page.evaluate((b) => new Function(b)(), readFileSync(resolve(preFile), "utf8"));
  await allocStart();
  await profileStart();
  const seq = await page.evaluate(wreck);
  report.sequence = seq;
  log("sequence", JSON.stringify(seq));
  const total = Math.round(SECONDS * 60);
  const recs = await frames(total);
  const prof = await profileStop("destruction");
  const alloc = await allocStop(total + 100);
  report.profile = prof;
  report.allocations = alloc;
  const cuts = [
    ["0-1s", 0, 60],
    ["1-3s", 60, 180],
    ["3-6s", 180, 360],
    [`6-${SECONDS}s`, 360, total],
  ];
  for (const [name, a, b] of cuts) {
    if (a >= recs.length) continue;
    const w = window_(name, recs.slice(a, b));
    report.windows[name] = w;
    console.log(line(w));
  }
  const stepMs = recs.map((r) => r.step);
  report.accumulator = {
    note: "real loop model: measured step costs + renderMs per frame, Time.beginFrame accumulator (vsync 16.7 ms)",
    render8ms_cap4: accumulatorModel(stepMs, 8, 4),
    render8ms_cap2: accumulatorModel(stepMs, 8, 2),
    render8ms_cap1: accumulatorModel(stepMs, 8, 1),
  };
  console.log("accumulator model (first", SECONDS, "s after the sequence):", JSON.stringify(report.accumulator));
  report.perStep = recs.map((r) => ({ s: r1(r.step), p: r1(r.physics), d: r1(r.dAfter), a: r.awake, e: r.ev }));
  if (alloc) console.log("allocations:", JSON.stringify(alloc.top.slice(0, 12)));
  if (prof) console.log("profile top:", JSON.stringify(prof.top.slice(0, 15)));
  if (diagFile) {
    const body = readFileSync(resolve(diagFile), "utf8");
    report.diag = await page.evaluate((b) => new Function(b)(), body);
    console.log("diag:", JSON.stringify(report.diag, null, 1).slice(0, 20000));
  }
  if (shotsDir) {
    await shot("after-kitchen", { x: 6.6, y: 1.65, z: 2.2 }, { x: 6.6, y: 0.9, z: 6.5 });
    await shot("after-floor", { x: 6.0, y: 1.4, z: 2.6 }, { x: 6.4, y: 0.0, z: 4.6 });
    await shot("after-living", { x: 8.6, y: 1.65, z: 4.4 }, { x: 4.6, y: 0.6, z: 1.6 });
  }
} catch (e) {
  console.error("SIMPERF FAILED:", e);
  report.error = String(e?.stack ?? e);
  exitCode = 1;
}
report.consoleErrors = [...new Set(consoleErrors)].slice(0, 30);
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(report, null, 1));
log(`wrote ${outFile}`);
await browser.close();
server.close();
if (tempDir) rmSync(tempDir, { recursive: true, force: true });
process.exit(exitCode);
