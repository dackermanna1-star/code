// Idle / sleep probe: boots the full furnished apartment, lets it settle, then steps it with no
// input and reports whether it goes (and stays) to sleep — awake bodies over time, WHICH bodies
// stay awake and why (velocity, constraints / motors, kept awake, proximity group of the sleep
// assist), physics step time, idle impacts and drift. With --checks it also runs the
// "must not break" interaction checks (strike, support removal, doors, drawers, fan, player on
// the rug, kitchen bin).
//
// Usage: npm run build && node tests/idle.mjs [--dist dir] [--steps 600] [--checks] [--only a,b]
//          [--json out.json] [--strict]
// --dist  built game to serve (default dist/; build a private copy with
//         `npx vite build --outDir /tmp/x --emptyOutDir` when other agents share dist/)
// --strict exit code 1 when the idle goal is missed or a check fails.
// Goal (after settle): awake bodies ≤ IDLE_MAX_AWAKE within ~3 s and for the rest of the run,
// physics step ≤ IDLE_MAX_STEP_MS, no idle impacts, no drift.
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
const dist = resolve(arg("--dist", join(repo, "dist")));
const STEPS = Number(arg("--steps", 600));
const runChecks = args.includes("--checks");
const only = arg("--only", "").split(",").map((s) => s.trim()).filter(Boolean);
const jsonOut = arg("--json", null);
const strict = args.includes("--strict");
const evalFile = arg("--eval", null); // extra page code run after the idle phase: `(sim, H, g) => json`
const bootTimeout = Number(arg("--timeout", 240000));
const IDLE_MAX_AWAKE = 8;
const IDLE_MAX_STEP_MS = 3;
const ASLEEP_BY_STEP = 180; // ≈ 3 s

if (!existsSync(join(dist, "index.html"))) {
  console.error(`IDLE: ${dist}/index.html missing — build first`);
  process.exit(2);
}

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

// ------------------------------------------------------------------ page-side helpers
/** Installed once per page: instrumentation + diagnosis helpers on window.__idle. */
function installHelpers() {
  const g = window.__game;
  const ctx = g.ctx;
  const ph = ctx.physics;
  const dw = ctx.destruction.world;
  const sim = window.__sim;
  const H = (window.__idle = {});
  // physics step timing (sum + count since the last read)
  let acc = 0,
    cnt = 0,
    worst = 0;
  const orig = ph.step.bind(ph);
  ph.step = (dt) => {
    const t = performance.now();
    orig(dt);
    const d = performance.now() - t;
    acc += d;
    cnt++;
    if (d > worst) worst = d;
  };
  // whole fixed step (input, player, destruction, physics, vfx) without the render stepSync does once per call
  let sacc = 0,
    scnt = 0;
  const origFixed = g.game.fixedStep.bind(g.game);
  g.game.fixedStep = () => {
    const t = performance.now();
    origFixed();
    sacc += performance.now() - t;
    scnt++;
  };
  H.takeTiming = () => {
    const r = { ms: cnt ? acc / cnt : 0, worst, n: cnt, simMs: scnt ? sacc / scnt : 0 };
    acc = cnt = worst = 0;
    sacc = scnt = 0;
    return r;
  };
  const DYN = 2; // PhysicsMotionType.DYNAMIC
  H.islandName = (id) => {
    for (const a of dw.assemblies.values()) for (const isl of a.islands) if (isl.id === id) return a.name;
    return id < 0 ? "world" : `#${id}`;
  };
  H.dynIslands = () => {
    const out = [];
    for (const a of dw.assemblies.values()) for (const isl of a.islands) if (isl.alive && !isl.isStatic && isl.body) out.push({ a, isl });
    return out;
  };
  H.snapshot = () => {
    const m = new Map();
    for (const { isl } of H.dynIslands()) {
      const p = isl.node.position,
        q = isl.node.rotationQuaternion;
      m.set(isl.id, [p.x, p.y, p.z, q ? q.x : 0, q ? q.y : 0, q ? q.z : 0, q ? q.w : 1]);
    }
    return m;
  };
  H.drift = (snap, minMm = 2) => {
    const out = [];
    for (const { a, isl } of H.dynIslands()) {
      const s = snap.get(isl.id);
      if (!s) continue;
      const p = isl.node.position,
        q = isl.node.rotationQuaternion;
      const d = Math.hypot(p.x - s[0], p.y - s[1], p.z - s[2]);
      const dot = q ? Math.min(1, Math.abs(q.x * s[3] + q.y * s[4] + q.z * s[5] + q.w * s[6])) : 1;
      const ang = 2 * Math.acos(dot);
      const corner = d + ang * Math.max(0.05, isl.extent / 2);
      if (corner * 1000 >= minMm) out.push({ name: a.name, island: isl.id, mm: Math.round(d * 10000) / 10, deg: Math.round((ang * 1800) / Math.PI) / 10 });
    }
    out.sort((x, y) => y.mm + y.deg - (x.mm + x.deg));
    return out;
  };
  H.countAwake = () => {
    let n = 0;
    for (const { isl } of H.dynIslands()) if (ph.isAwake(isl.body)) n++;
    return n;
  };
  // ---- helpers for the interaction checks (tests/idle-checks.mjs)
  H.ctx = ctx;
  H.ph = ph;
  H.dw = dw;
  /** Assemblies whose name matches (exact first, then substring), optionally filtered by room. */
  H.asms = (name, room) => {
    const all = [...dw.assemblies.values()].filter((a) => a.alive && (!room || a.room === room));
    const ex = all.filter((a) => a.name === name);
    return ex.length ? ex : all.filter((a) => a.name.toLowerCase().includes(String(name).toLowerCase()));
  };
  H.asm = (name, room) => H.asms(name, room)[0] ?? null;
  H.dyn = (asm) => [...asm.islands].filter((i) => i.alive && !i.isStatic && i.body);
  H.pos = (isl) => ({ x: isl.node.position.x, y: isl.node.position.y, z: isl.node.position.z });
  H.dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  H.awake = (isl) => !!isl.body && ph.isAwake(isl.body);
  /** World centre of an island's mass (COM). */
  H.com = (isl) => dw.toWorldVec(isl, isl.com);
  /** Events since index e0 that involve one of the island ids (impacts) — count and max energy. */
  H.impactsOn = (e0, ids) => {
    const set = new Set(ids);
    let n = 0,
      maxJ = 0;
    for (const e of sim.events(e0)) if (e.type === "impact" && (set.has(e.ev.idA) || set.has(e.ev.idB))) {
      n++;
      maxJ = Math.max(maxJ, e.ev.energy);
    }
    return { n, maxJ: Math.round(maxJ * 1000) / 1000 };
  };
  H.evCount = (e0) => {
    const c = {};
    for (const e of sim.events(e0)) c[e.type] = (c[e.type] ?? 0) + 1;
    return c;
  };
  /** World AABB of an island (from its island-frame bounds). */
  H.wbox = (isl) => {
    const b = isl.bounds;
    const lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      const w = dw.toWorldVec(isl, { x, y, z });
      for (const k of ["x", "y", "z"]) {
        lo[k] = Math.min(lo[k], w[k]);
        hi[k] = Math.max(hi[k], w[k]);
      }
    }
    return { lo, hi };
  };
  /**
   * Islands resting in mid-air: asleep (an awake body is simulated — falling, or held by contacts) with no surface
   * other than themselves within 5 cm below their world AABB's bottom at 9 sample points, and — to rule out bodies
   * wedged sideways (between a wall and an appliance) — that actually drop once woken (5 steps).
   */
  H.floating = (isls) => {
    const V = ph.tv0.constructor;
    const mask = 1 | 2 | 4;
    const cand = [];
    for (const i of isls) {
      if (!i.alive || !i.body || i.isStatic || ph.isAwake(i.body)) continue;
      const { lo, hi } = H.wbox(i);
      let supported = false;
      for (const fx of [0.15, 0.5, 0.85]) {
        for (const fz of [0.15, 0.5, 0.85]) {
          const x = lo.x + (hi.x - lo.x) * fx, z = lo.z + (hi.z - lo.z) * fz;
          // from just above the bottom (thin items: not from inside what lies on them) to 5 cm below it
          const hits = ph.raycastAll(new V(x, lo.y + 0.002, z), new V(x, lo.y - 0.05, z), mask);
          if (hits.some((h) => h.body !== i.body && h.point.y <= lo.y + 0.0015)) {
            supported = true;
            break;
          }
        }
        if (supported) break;
      }
      if (!supported) cand.push({ i, y: H.com(i).y });
    }
    if (!cand.length) return [];
    for (const c of cand) ph.wake(c.i.body);
    H.fixed(5);
    return cand.filter((c) => c.i.alive && c.y - H.com(c.i).y > 0.001).map((c) => `${c.i.asm.name}#${c.i.id} y${Math.round(c.y * 1000)}mm`);
  };
  /** n fixed steps without the render __sim.step does after every call (per-step loops in checks). */
  H.fixed = (n = 1) => {
    for (let i = 0; i < n; i++) g.game.fixedStep();
    ctx.destruction.update(n / 60);
  };
  /** Walk input: hold movement keys (KeyW/KeyA/KeyS/KeyD) through the input system's held set. */
  H.keys = (codes) => {
    const inp = ctx.input;
    inp.held.clear();
    for (const c of codes) inp.held.add(c);
  };
  /** Awake bodies with the reason they are awake (the sleep assist's view replicated). */
  H.diagnose = (limit = 40) => {
    const recs = ph.fast.filter((r) => r.motion === DYN && !r.disposed && ph.isAwake(r.body));
    const items = recs.map((r) => {
      const isl = dw.islandOf(r.body);
      const lv = ph.hk.HP_Body_GetLinearVelocity(r.hpId)[1];
      const av = ph.hk.HP_Body_GetAngularVelocity(r.hpId)[1];
      const node = r.body.transformNode;
      const q = node.rotationQuaternion;
      // COM world position
      const c = { x: r.comX, y: r.comY, z: r.comZ };
      const ix = q.w * c.x + q.y * c.z - q.z * c.y, iy = q.w * c.y + q.z * c.x - q.x * c.z, iz = q.w * c.z + q.x * c.y - q.y * c.x, iw = -q.x * c.x - q.y * c.y - q.z * c.z;
      const cx = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y + node.position.x;
      const cy = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z + node.position.y;
      const cz = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x + node.position.z;
      const joints = r.joints ? [...r.joints].map((j) => {
        const other = j.a === r ? j.b : j.a;
        const otherIsl = dw.islandOf(other.body);
        return `${j.kind}->${otherIsl ? (otherIsl.isStatic ? "static" : "dyn") : other.motion === DYN ? "dyn" : "world"}`;
      }) : [];
      return {
        rec: r,
        name: isl ? isl.asm.name : "?",
        island: isl ? isl.id : -1,
        mass: Math.round(r.mass * 100) / 100,
        lin: Math.hypot(lv[0], lv[1], lv[2]),
        ang: Math.hypot(av[0], av[1], av[2]),
        joints,
        keepAwake: r.keepAwake,
        slow: r.slow,
        boundR: Math.round(Math.max(r.boundR, r.radius, 0.02) * 1000) / 1000,
        pos: [cx, cy, cz],
      };
    });
    // components as the sleep pass builds them: world AABBs within 3 cm (body-frame AABB rotated), joined through
    // constraints between awake dynamic bodies (falls back to COM spheres for builds without AABBs)
    const n = items.length;
    const parent = items.map((_, i) => i);
    const find = (i) => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]];
      return i;
    };
    const boxes = items.map((it) => {
      const r = it.rec;
      if (r.bbMaxX === undefined) return null;
      const node = r.body.transformNode, q = node.rotationQuaternion, p = node.position;
      const x = q.x, y = q.y, z = q.z, w = q.w;
      const R = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
      const c = [(r.bbMinX + r.bbMaxX) / 2, (r.bbMinY + r.bbMaxY) / 2, (r.bbMinZ + r.bbMaxZ) / 2];
      const h = [Math.max(0.01, (r.bbMaxX - r.bbMinX) / 2), Math.max(0.01, (r.bbMaxY - r.bbMinY) / 2), Math.max(0.01, (r.bbMaxZ - r.bbMinZ) / 2)];
      const pp = [p.x, p.y, p.z];
      const lo = [], hi = [];
      for (let k = 0; k < 3; k++) {
        const wc = R[k][0] * c[0] + R[k][1] * c[1] + R[k][2] * c[2] + pp[k];
        const e = Math.abs(R[k][0]) * h[0] + Math.abs(R[k][1]) * h[1] + Math.abs(R[k][2]) * h[2] + 0.015;
        lo.push(wc - e);
        hi.push(wc + e);
      }
      return { lo, hi };
    });
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const a = items[i],
          b = items[j];
        let touch;
        if (boxes[i] && boxes[j]) touch = [0, 1, 2].every((k) => boxes[i].lo[k] <= boxes[j].hi[k] && boxes[j].lo[k] <= boxes[i].hi[k]);
        else {
          const rr = a.boundR + b.boundR + 0.06;
          const dx = a.pos[0] - b.pos[0], dy = a.pos[1] - b.pos[1], dz = a.pos[2] - b.pos[2];
          touch = dx * dx + dy * dy + dz * dz <= rr * rr;
        }
        const jointed = a.rec.joints && [...a.rec.joints].some((jr) => jr.a === b.rec || jr.b === b.rec);
        if (touch || jointed) parent[find(i)] = find(j);
      }
    const comps = new Map();
    items.forEach((it, i) => {
      const k = find(i);
      let c = comps.get(k);
      if (!c) comps.set(k, (c = { size: 0, jointed: 0, keepAwake: 0, maxLin: 0, maxAng: 0, names: new Map(), biggestR: 0, biggestName: "" }));
      c.size++;
      if (it.joints.length) c.jointed++;
      if (it.keepAwake) c.keepAwake++;
      c.maxLin = Math.max(c.maxLin, it.lin);
      c.maxAng = Math.max(c.maxAng, it.ang);
      c.names.set(it.name, (c.names.get(it.name) ?? 0) + 1);
      if (it.boundR > c.biggestR) {
        c.biggestR = it.boundR;
        c.biggestName = it.name;
      }
      it.comp = k;
    });
    const compList = [...comps.values()]
      .sort((a, b) => b.size - a.size)
      .map((c) => ({
        size: c.size,
        jointed: c.jointed,
        keepAwake: c.keepAwake,
        maxLin: Math.round(c.maxLin * 1000) / 1000,
        maxAng: Math.round(c.maxAng * 1000) / 1000,
        biggest: `${c.biggestName} r${c.biggestR}`,
        members: [...c.names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => (v > 1 ? `${k}×${v}` : k)).join(", "),
      }));
    const byAsm = new Map();
    for (const it of items) {
      let e = byAsm.get(it.name);
      if (!e) byAsm.set(it.name, (e = { name: it.name, awake: 0, jointed: 0, maxLin: 0, maxAng: 0, joints: new Set() }));
      e.awake++;
      if (it.joints.length) e.jointed++;
      for (const j of it.joints) e.joints.add(j);
      e.maxLin = Math.max(e.maxLin, it.lin);
      e.maxAng = Math.max(e.maxAng, it.ang);
    }
    const asmList = [...byAsm.values()]
      .sort((a, b) => b.maxLin - a.maxLin || b.awake - a.awake)
      .slice(0, limit)
      .map((e) => ({ name: e.name, awake: e.awake, jointed: e.jointed, joints: [...e.joints].join(" "), maxLin: Math.round(e.maxLin * 1000) / 1000, maxAng: Math.round(e.maxAng * 1000) / 1000 }));
    const fastest = items
      .sort((a, b) => b.lin + b.ang * 0.1 - (a.lin + a.ang * 0.1))
      .slice(0, 12)
      .map((it) => ({ name: it.name, island: it.island, mass: it.mass, lin: Math.round(it.lin * 1000) / 1000, ang: Math.round(it.ang * 1000) / 1000, joints: it.joints.join(" "), slow: it.slow, r: it.boundR }));
    return { awake: n, jointedAwake: items.filter((i) => i.joints.length).length, components: compList.slice(0, 10), assemblies: asmList, fastest };
  };
  /** Idle run: n steps in batches; awake count, timing, impacts per batch. */
  H.idle = (n, batch = 30, lateFrom = 180) => {
    H.takeTiming();
    const snap = H.snapshot();
    let lateSnap = null;
    const e0 = sim.eventCount();
    const batches = [];
    let firstQuiet = -1;
    for (let done = 0; done < n; ) {
      const k = Math.min(batch, n - done);
      const eb = sim.eventCount();
      const r = sim.step(k);
      done += k;
      const t = H.takeTiming();
      const evs = sim.events(eb);
      const imp = evs.filter((e) => e.type === "impact");
      const awake = H.countAwake();
      if (!lateSnap && done >= lateFrom) lateSnap = H.snapshot();
      if (firstQuiet < 0 && awake <= 8) firstQuiet = done;
      else if (awake > 8) firstQuiet = -1;
      batches.push({ step: done, awake, physMs: Math.round(t.ms * 100) / 100, physWorst: Math.round(t.worst * 10) / 10, simMs: Math.round(t.simMs * 100) / 100, stepMs: Math.round((r.ms / Math.max(1, r.steps)) * 100) / 100, impacts: imp.length, maxJ: Math.round(Math.max(0, ...imp.map((e) => e.ev.energy)) * 1000) / 1000 });
    }
    const evs = sim.events(e0);
    const impacts = new Map();
    for (const e of evs) {
      if (e.type !== "impact") continue;
      const key = [H.islandName(e.ev.idA), H.islandName(e.ev.idB)].sort().join(" <-> ");
      const c = impacts.get(key) ?? { n: 0, maxJ: 0, maxV: 0 };
      c.n++;
      c.maxJ = Math.max(c.maxJ, e.ev.energy);
      c.maxV = Math.max(c.maxV, e.ev.speed);
      impacts.set(key, c);
    }
    const evCount = {};
    for (const e of evs) evCount[e.type] = (evCount[e.type] ?? 0) + 1;
    const tail = batches.slice(Math.floor(batches.length / 2));
    return {
      batches,
      quietFrom: firstQuiet,
      tailPhysMs: Math.round((tail.reduce((s, b) => s + b.physMs, 0) / Math.max(1, tail.length)) * 100) / 100,
      events: evCount,
      impacts: [...impacts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 15).map(([k, v]) => ({ pair: k, n: v.n, maxJ: Math.round(v.maxJ * 1000) / 1000, maxV: Math.round(v.maxV * 1000) / 1000 })),
      drift: H.drift(snap).slice(0, 20),
      lateDrift: lateSnap ? H.drift(lateSnap, 1).slice(0, 20) : [],
      tailSimMs: Math.round((tail.reduce((s, b) => s + b.simMs, 0) / Math.max(1, tail.length)) * 100) / 100,
    };
  };
  return { ok: true, bodies: ph.stats().bodies, dynIslands: H.dynIslands().length };
}

async function boot(page) {
  await page.goto(`http://127.0.0.1:${port}/?test=1&hold=1`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__sim?.ready || window.__sim?.error || window.__simError, null, { timeout: bootTimeout, polling: 500 });
  const err = await page.evaluate(() => window.__sim?.error ?? window.__simError ?? null);
  if (err) throw new Error("boot error: " + err);
  await page.evaluate(() => window.__sim.loop(false));
  return page.evaluate(installHelpers);
}

const logs = [];
function attachLogs(page) {
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error" || t === "warning") logs.push(`[${t}] ${m.text()}`);
  });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
}

const failures = [];
const result = { dist, steps: STEPS, idle: null, diagnosis: null, checks: {} };
const t0 = Date.now();
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  attachLogs(page);
  const info = await boot(page);
  const w = await page.evaluate(() => window.__sim.world());
  console.log(`booted in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${w.assemblies} assemblies, ${w.bodies} bodies, ${info.dynIslands} dynamic islands; awake after settle ${w.awakeAfterSettle}`);

  // ---- idle
  result.idle = await page.evaluate(([n, late]) => window.__idle.idle(n, 30, late), [STEPS, ASLEEP_BY_STEP]);
  result.diagnosis = await page.evaluate(() => window.__idle.diagnose(30));
  const I = result.idle;
  console.log(`\nIDLE ${STEPS} steps (awake | physics ms avg/worst | whole fixed step ms (no render) | impacts):`);
  for (const b of I.batches) console.log(`  step ${String(b.step).padStart(4)}  awake ${String(b.awake).padStart(4)}  phys ${b.physMs.toFixed(2).padStart(6)} / ${String(b.physWorst).padStart(5)}  sim ${b.simMs.toFixed(2).padStart(6)}  impacts ${b.impacts}${b.impacts ? ` (max ${b.maxJ} J)` : ""}`);
  console.log(`  quiet (≤ ${IDLE_MAX_AWAKE} awake) from step ${I.quietFrom}; second half: physics ${I.tailPhysMs} ms, whole step ${I.tailSimMs} ms; events ${JSON.stringify(I.events)}`);
  if (I.impacts.length) console.log("  idle impacts:\n" + I.impacts.map((x) => `    ${x.n}× ${x.pair} (max ${x.maxJ} J, ${x.maxV} m/s)`).join("\n"));
  if (I.drift.length) console.log("  drift ≥ 2 mm over the whole run:\n" + I.drift.map((d) => `    ${d.name} #${d.island}: ${d.mm} mm ${d.deg}°`).join("\n"));
  if (I.lateDrift.length) console.log(`  creep ≥ 1 mm after step ${ASLEEP_BY_STEP}:\n` + I.lateDrift.map((d) => `    ${d.name} #${d.island}: ${d.mm} mm ${d.deg}°`).join("\n"));
  const D = result.diagnosis;
  console.log(`\nAWAKE at the end: ${D.awake} (${D.jointedAwake} jointed)`);
  if (D.components.length) console.log("  proximity components:\n" + D.components.map((c) => `    size ${c.size} jointed ${c.jointed} keepAwake ${c.keepAwake} maxLin ${c.maxLin} maxAng ${c.maxAng} biggest ${c.biggest}: ${c.members}`).join("\n"));
  if (D.assemblies.length) console.log("  assemblies:\n" + D.assemblies.map((a) => `    ${a.name}: ${a.awake} awake (${a.jointed} jointed ${a.joints}) maxLin ${a.maxLin} maxAng ${a.maxAng}`).join("\n"));
  if (D.fastest.length) console.log("  fastest bodies:\n" + D.fastest.map((f) => `    ${f.name} #${f.island} ${f.mass} kg lin ${f.lin} ang ${f.ang} slow ${f.slow} r ${f.r} ${f.joints}`).join("\n"));

  if (evalFile) {
    const src = readFileSync(resolve(evalFile), "utf8");
    const out = await page.evaluate((code) => {
      const fn = (0, eval)(code);
      return fn(window.__sim, window.__idle, window.__game);
    }, src);
    console.log(`\nEVAL ${evalFile}:\n` + JSON.stringify(out, null, 1));
    result.eval = out;
  }

  const last = I.batches.at(-1);
  const tailAwake = Math.max(...I.batches.filter((b) => b.step >= ASLEEP_BY_STEP).map((b) => b.awake));
  if (tailAwake > IDLE_MAX_AWAKE) failures.push(`idle: up to ${tailAwake} bodies awake after step ${ASLEEP_BY_STEP} (max ${IDLE_MAX_AWAKE})`);
  if (I.tailPhysMs > IDLE_MAX_STEP_MS) failures.push(`idle: physics ${I.tailPhysMs} ms/step in the second half (budget ${IDLE_MAX_STEP_MS} ms)`);
  const tailImpacts = I.batches.filter((b) => b.step >= ASLEEP_BY_STEP).reduce((s, b) => s + b.impacts, 0);
  if (tailImpacts > 0) failures.push(`idle: ${tailImpacts} impacts after step ${ASLEEP_BY_STEP}`);
  const creep = I.lateDrift.filter((d) => !/ceiling fan|range hood|extractor|condenser/i.test(d.name));
  if (creep.length) failures.push(`idle: ${creep.length} bodies creep after step ${ASLEEP_BY_STEP} (${creep[0].name} ${creep[0].mm} mm ${creep[0].deg}°)`);
  void last;

  if (runChecks) {
    const { CHECKS } = await import("./idle-checks.mjs");
    // checks of one group share a page (in order); each further group gets a freshly booted, settled page
    let group = CHECKS[0]?.group ?? "idle";
    let cur = page;
    for (const c of CHECKS) {
      if (only.length && !only.includes(c.name)) continue;
      if ((c.group ?? "idle") !== group) {
        group = c.group ?? "idle";
        if (cur !== page) await cur.close();
        cur = await browser.newPage({ viewport: { width: 640, height: 360 } });
        attachLogs(cur);
        await boot(cur);
        await cur.evaluate(() => window.__sim.step(300));
        console.log(`\n(fresh page for check group '${group}')`);
      }
      let r;
      const tc = Date.now();
      try {
        r = await c.run(cur);
      } catch (e) {
        r = { ok: false, error: String(e?.stack ?? e) };
      }
      result.checks[c.name] = r;
      console.log(`\nCHECK ${c.name}: ${r.ok ? "PASS" : "FAIL"} (${((Date.now() - tc) / 1000).toFixed(1)} s) ${JSON.stringify(r.details ?? r.error ?? {})}`);
      if (!r.ok) failures.push(`check ${c.name}: ${r.why ?? r.error ?? "failed"}`);
    }
    if (cur !== page) await cur.close();
  }
  await page.close();
} catch (e) {
  failures.push(String(e?.stack ?? e));
}
await browser.close();
server.close();
result.failures = failures;
result.logs = logs.slice(0, 50);
if (jsonOut) writeFileSync(resolve(jsonOut), JSON.stringify(result, null, 1));
if (logs.length) console.log(`\nconsole (${logs.length}):\n  ` + logs.slice(0, 15).join("\n  "));
console.log(failures.length ? `\nIDLE: ${failures.length} issue(s):\n  ${failures.join("\n  ")}` : "\nIDLE: PASS");
process.exit(strict && failures.length ? 1 : 0);
