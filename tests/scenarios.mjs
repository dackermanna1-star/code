// Scripted destruction scenarios against the full game (skeleton for the QA pass to extend).
//
// Usage: npm run build && node tests/scenarios.mjs [--only name[,name]] [--out dir] [--shots]
// Boots dist/ with ?test=1&hold=1 (deterministic seed, simulation frozen between __sim.step calls),
// runs each scenario in a FRESH page (no cross-talk), prints a table and writes scenarios.json.
// A scenario is { name, description, run(page, h) } returning { ok, details }; `h` has helpers
// (sim(fn, arg) = page.evaluate against window.__sim, shot(name) = canvas capture).
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
const outDir = resolve(arg("--out", join(repo, "test-results", "scenarios")));
const only = arg("--only", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const shots = args.includes("--shots");
mkdirSync(outDir, { recursive: true });

// ------------------------------------------------------------------ scenarios
/** Count events by type since index `from`. */
const countSince = (from) => {
  const c = {};
  for (const e of window.__sim.events(from)) c[e.type] = (c[e.type] ?? 0) + 1;
  return c;
};

export const SCENARIOS = [
  {
    name: "sledge-partition",
    description: "Five full sledgehammer blows on the living/master stud wall make a hole: bonds break, drywall fractures, debris islands appear.",
    async run(page, h) {
      const r = await h.sim(() => {
        const sim = window.__sim;
        const wall = sim.findAssemblies("Stud Wall (Living Room / Master Bedroom)")[0] ?? sim.findAssembly("partition");
        sim.teleport({ x: 4.9, y: 1.65, z: 2.2 }, -Math.PI / 2, 0);
        sim.step(5);
        const e0 = sim.eventCount();
        const before = sim.listAssemblies().find((a) => a.id === wall.id);
        const hits = [];
        for (let i = 0; i < 5; i++) {
          hits.push(sim.hit({ point: { x: 4.06, y: 1.3, z: 2.2 + i * 0.02 }, dir: { x: -1, y: 0, z: 0 }, tool: "sledgehammer", power: 1 }));
          sim.step(20);
        }
        const after = sim.listAssemblies().find((a) => a.id === wall.id);
        return { wall: wall.name, events: (window.__countSince ?? (() => ({})))(e0), hits: hits.map((x) => x.energy), islandsBefore: before.islands, islandsAfter: after.islands, damage: after.damage };
      });
      return { ok: r.islandsAfter > r.islandsBefore && (r.events.fracture ?? 0) > 0, details: r };
    },
  },
  {
    name: "throw-mug-at-tv",
    description: "A mug thrown at 14 m/s from across the room hits the 55\" TV: impact events, the mug breaks or the screen takes damage.",
    async run(page, h) {
      const r = await h.sim(() => {
        const sim = window.__sim;
        const tv = sim.findAssembly("tv55") ?? sim.findAssembly("tv");
        sim.teleport({ x: 6.6, y: 1.5, z: 2.4 }, -Math.PI / 2, 0);
        sim.step(5);
        const e0 = sim.eventCount();
        const t = sim.throwAt(tv.id, 14, "mug");
        sim.step(90);
        const tvAfter = sim.listAssemblies().find((a) => a.id === tv.id);
        const mug = sim.listAssemblies().find((a) => a.id === t.id);
        return { thrown: t, events: window.__countSince(e0), tvDamage: tvAfter.damage, mugDamage: mug?.damage ?? null, mugIslands: mug?.islands ?? null };
      });
      return { ok: (r.events.impact ?? 0) > 0 && (r.tvDamage > 0 || (r.mugDamage ?? 0) > 0), details: r };
    },
  },
  {
    name: "window-shatter",
    description: "Bat blows on the bedroom-2 south window: the annealed pane cracks then shatters into many glass islands.",
    async run(page, h) {
      const r = await h.sim(() => {
        const sim = window.__sim;
        const win = sim.findAssemblies("window").find((a) => /Bedroom 2/.test(a.name) && /South/.test(a.name)) ?? sim.findAssembly("window");
        sim.teleport({ x: 11.0, y: 1.65, z: 1.0 }, Math.PI, 0);
        sim.step(5);
        const e0 = sim.eventCount();
        const before = sim.listAssemblies().find((a) => a.id === win.id);
        for (let i = 0; i < 3; i++) {
          sim.hit({ point: { x: 10.8 + i * 0.25, y: 1.5, z: 0 }, dir: { x: 0, y: 0, z: -1 }, tool: "bat", power: 1 });
          sim.step(15);
        }
        const after = sim.listAssemblies().find((a) => a.id === win.id);
        const glass = sim.events(e0).filter((e) => e.type === "fracture" && (e.ev.mat === "glass" || e.ev.mat === "temperedGlass")).length;
        return { window: win.name, glassFractures: glass, islandsBefore: before.islands, islandsAfter: after.islands, events: window.__countSince(e0) };
      });
      return { ok: r.glassFractures > 0 && r.islandsAfter > r.islandsBefore, details: r };
    },
  },
];

// ------------------------------------------------------------------ runner
if (!existsSync(join(dist, "index.html"))) {
  console.error("scenarios: dist/index.html missing — run `npm run build` first");
  process.exit(2);
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".json": "application/json", ".svg": "image/svg+xml" };
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
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

const results = [];
for (const sc of SCENARIOS) {
  if (only.length && !only.includes(sc.name)) continue;
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
  const t0 = Date.now();
  let res;
  try {
    await page.goto(`http://127.0.0.1:${port}/?test=1&hold=1`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__sim?.ready || window.__sim?.error, null, { timeout: 240000, polling: 500 });
    const bootErr = await page.evaluate(() => window.__sim.error);
    if (bootErr) throw new Error("boot: " + bootErr);
    await page.evaluate(`window.__countSince = ${countSince.toString()}; window.__sim.loop(false);`);
    const h = {
      sim: (fn, a) => page.evaluate(fn, a),
      shot: async (name) => {
        const url = await page.evaluate(() => window.__sim.capture(2, "image/png"));
        if (typeof url === "string") writeFileSync(join(outDir, `${sc.name}-${name}.png`), Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
      },
    };
    res = await sc.run(page, h);
    if (shots) await h.shot("end");
    if (errors.length) res = { ok: false, details: { ...res.details, errors } };
  } catch (e) {
    res = { ok: false, details: { error: String(e?.stack ?? e), errors } };
  }
  res.ms = Date.now() - t0;
  results.push({ name: sc.name, ...res });
  console.log(`${res.ok ? "PASS" : "FAIL"}  ${sc.name.padEnd(20)} ${(res.ms / 1000).toFixed(0)} s  ${JSON.stringify(res.details).slice(0, 400)}`);
  await page.close();
}
await browser.close();
server.close();
writeFileSync(join(outDir, "scenarios.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} scenarios passed → ${outDir}`);
process.exit(failed ? 1 : 0);
