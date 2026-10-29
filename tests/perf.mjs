// Perf harness: boots the full furnished game in headless Chromium (SwiftShader WebGL2) and reports, at
// steady state, frame-cost proxies per scenario:
//   * draw calls / triangles / shader-program switches PER RENDER PASS: every RenderTargetTexture render
//     (sun + point shadow maps, reflection/env probe, depth / geometry buffers ...), the main pass split by
//     rendering group (prepass MRT noted), and every post-process (with its resolution);
//   * which meshes (by category) feed each pass, active meshes, materials / compiled effects, vertices;
//   * CPU ms per system (fixed step: input, player, destruction before/after, physics, vfx; frame: player,
//     audio, vfx, destruction, render, hud; scene.render split into active-mesh evaluation, render targets,
//     main pass and post-processing), physics / destruction / vfx stats, JS-heap growth per frame;
//   * optionally a CPU profile (top self-time functions; the build is unminified by default so names read).
//
// Scenarios (each: warm-up steps, warm frames, then --frames measured frames of exactly 1 fixed step +
// 1 frame update + 1 scene.render, i.e. what a 60 Hz frame costs; deterministic via ?hold=1 + __sim.step):
//   idle         player in the living room (spawn), looking across the room
//   hall         player in the foyer looking west down the hall/kitchen/living axis (deepest view)
//   destruction  sledge/axe hits on ~40 living/kitchen assemblies + thrown objects; measured "during"
//                (debris flying) and "after" (settled again)
//   whatif       (opt-in) idle view with every dynamic island forced asleep (simulates the pending sleep fix),
//                then also with the motors (ceiling fan) stopped: what still invalidates the shadow caches
//   realtime     (with --realtime-ms) the real render loop (accumulator, up to 4 steps/frame) for N ms:
//                Game.stats as the HUD reports it — reproduces the orchestrator's real-loop numbers
//
// GPU time is NOT measurable under SwiftShader (it rasterises on the CPU): use draw calls, render-target
// sizes, post-process count/resolution and CPU ms as proxies. The machine is shared: A/B in the same run.
//
// Usage:
//   node tests/perf.mjs [--quality high] [--scenarios idle,hall,destruction] [--frames 30] [--warm-steps 300]
//        [--warm-frames 12] [--realtime-ms 0] [--profile] [--alloc] [--no-build] [--dist dir] [--minify]
//        [--viewport 1280x720] [--out docs/perf/latest.json] [--timeout 300000] [--url-extra "&nofurniture=1"]
// --no-build serves dist/ (npm run build); otherwise the app is built (vite, no tsc) into a temp dir.
// Prints a summary table and writes the full JSON to --out (default docs/perf/latest.json).
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
const scenarios = arg("--scenarios", "idle,hall,destruction").split(",").map((s) => s.trim()).filter(Boolean);
const FRAMES = Math.max(5, Number(arg("--frames", 30)));
const WARM_STEPS = Math.max(0, Number(arg("--warm-steps", 300)));
const WARM_FRAMES = Math.max(0, Number(arg("--warm-frames", 12)));
const REALTIME_MS = Math.max(0, Number(arg("--realtime-ms", 0)));
const PROFILE = flag("--profile");
const ALLOC = flag("--alloc");
const [VW, VH] = arg("--viewport", "1280x720").split("x").map(Number);
const outFile = resolve(repo, arg("--out", "docs/perf/latest.json"));
const bootTimeout = Number(arg("--timeout", 300000));
const urlExtra = arg("--url-extra", "");
const t0 = Date.now();
const log = (...a) => console.log(`[perf ${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);

// ------------------------------------------------------------------ build (or reuse dist/)
let distDir = resolve(repo, arg("--dist", "dist"));
let tempDir = null;
if (!flag("--no-build") && !args.includes("--dist")) {
  const { build } = await import("vite");
  tempDir = mkdtempSync(join(tmpdir(), "perf-"));
  distDir = join(tempDir, "dist");
  log(`building into ${distDir} (minify ${flag("--minify")})`);
  await build({
    root: repo,
    configFile: join(repo, "vite.config.ts"),
    logLevel: "error",
    build: { outDir: distDir, emptyOutDir: true, minify: flag("--minify"), reportCompressedSize: false },
  });
}
if (!existsSync(join(distDir, "index.html"))) {
  console.error(`PERF: ${distDir}/index.html missing (run npm run build, or drop --no-build)`);
  process.exit(2);
}

// ------------------------------------------------------------------ static server
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

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--enable-precise-memory-info"],
});
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 500));
});
page.on("pageerror", (e) => consoleErrors.push(`[pageerror] ${e.message}`));

// ------------------------------------------------------------------ in-page instrumentation
/**
 * Installs window.__perf: wraps engine draw calls / effect binds, RenderTargetTexture.render,
 * PostProcess.apply, Mesh.render (category attribution), the Game loop phases and every system's
 * per-step / per-frame methods. Recording happens only between __perf.begin() and __perf.end().
 */
function installPerf() {
  const G = window.__game;
  if (!G || !G.ctx) throw new Error("window.__game missing (boot with ?test=1)");
  if (window.__perf) return { already: true };
  const { ctx, game } = G;
  const scene = ctx.scene;
  const engine = ctx.engine;
  const now = () => performance.now();
  const P = { rec: false, frames: [], frame: null, inFrame: false, rtt: new Map(), pp: new Map(), drawsAll: 0 };
  window.__perf = P;

  // ---- mesh categories: "kitchenCabinet#12/3/0" → "kitchenCabinet", "debris:3,1/0" → "debris", "city_block7" → "city_block"
  const catCache = new WeakMap();
  const catOf = (m) => {
    if (!m) return "(none)";
    let c = catCache.get(m);
    if (c !== undefined) return c;
    const n = String(m.name || "?");
    if (n.includes("#")) c = "isl:" + n.slice(0, n.indexOf("#"));
    else if (n.startsWith("debris:")) c = "debris-batch";
    else c = n.replace(/[_\-:. ]?\d.*$/, "").replace(/[_\-:.]+$/, "") || n;
    catCache.set(m, c);
    return c;
  };

  // ---- pass labels
  const stack = [];
  let phase = "outside";
  let curMesh = null;
  const label = () => (stack.length ? stack[stack.length - 1] : phase);
  const passOf = (f, l) => f.passes[l] || (f.passes[l] = { draws: 0, tris: 0, switches: 0, effects: new Set(), cats: {} });

  let lastEffect = null;
  const countDraw = (fillMode, count, instances) => {
    P.drawsAll++;
    const f = P.frame;
    if (!f) return;
    const p = passOf(f, label());
    p.draws++;
    const inst = instances > 1 ? instances : 1;
    // triangle fill modes (0 TriangleFill, 7 TriangleStrip ~ n-2, 8 TriangleFan) – others counted as 0 tris
    if (fillMode === 0) p.tris += (count / 3) * inst;
    else if (fillMode === 7 || fillMode === 8) p.tris += Math.max(0, count - 2) * inst;
    const c = curMesh ? catOf(curMesh) : "(no mesh)";
    p.cats[c] = (p.cats[c] || 0) + 1;
  };
  // (explicit parameters, no `arguments`: the wrappers must not allocate per draw)
  const de = engine.drawElementsType;
  engine.drawElementsType = function (fillMode, indexStart, indexCount, instancesCount) {
    countDraw(fillMode, indexCount, instancesCount);
    return de.call(this, fillMode, indexStart, indexCount, instancesCount);
  };
  const da = engine.drawArraysType;
  engine.drawArraysType = function (fillMode, verticesStart, verticesCount, instancesCount) {
    countDraw(fillMode, verticesCount, instancesCount);
    return da.call(this, fillMode, verticesStart, verticesCount, instancesCount);
  };
  const ee = engine.enableEffect;
  engine.enableEffect = function (eff) {
    const e = eff && eff.effect !== undefined ? eff.effect : eff;
    if (e && e !== lastEffect) {
      lastEffect = e;
      const f = P.frame;
      if (f) {
        const p = passOf(f, label());
        p.switches++;
        p.effects.add(e);
      }
    }
    return ee.call(this, eff);
  };

  // ---- prototypes reached through live instances (the bundle exposes no Babylon globals)
  const ownProto = (obj, method) => {
    let p = obj && Object.getPrototypeOf(obj);
    while (p && !Object.prototype.hasOwnProperty.call(p, method)) p = Object.getPrototypeOf(p);
    return p;
  };
  const anyMesh = scene.meshes.find((m) => m.getClassName && m.getClassName() === "Mesh");
  const meshProto = ownProto(anyMesh, "render");
  if (meshProto) {
    const mr = meshProto.render;
    meshProto.render = function (subMesh, enableAlphaMode, effectiveMeshReplacement) {
      const prev = curMesh;
      curMesh = this;
      try {
        return mr.call(this, subMesh, enableAlphaMode, effectiveMeshReplacement);
      } finally {
        curMesh = prev;
      }
    };
  }

  // shadow-map RTT → generator / light
  const shadowOwner = new WeakMap();
  const refreshShadowOwners = () => {
    for (const l of scene.lights) {
      const gens = l._shadowGenerators;
      const list = gens ? (gens.values ? [...gens.values()] : Object.values(gens)) : [l.getShadowGenerator && l.getShadowGenerator()].filter(Boolean);
      for (const g of list) {
        const sm = g && g.getShadowMap && g.getShadowMap();
        if (sm) shadowOwner.set(sm, { light: l.name, kind: l.getClassName(), gen: g });
      }
    }
  };
  const rttName = (t) => {
    const o = shadowOwner.get(t);
    if (o) return `shadow:${o.light}`;
    return `rtt:${t.name || t.constructor?.name || "?"}`;
  };
  const sunMap = ctx.render.lighting.sunShadows.getShadowMap();
  const rttProto = ownProto(sunMap, "render");
  if (rttProto) {
    const rr = rttProto.render;
    rttProto.render = function () {
      if (!P.rec) return rr.apply(this, arguments);
      if (P.frame && !P.frame.ownersRefreshed) {
        P.frame.ownersRefreshed = true;
        refreshShadowOwners();
      }
      const name = rttName(this);
      stack.push(name);
      const d0 = P.drawsAll;
      const t = now();
      try {
        return rr.apply(this, arguments);
      } finally {
        stack.pop();
        const ms = now() - t;
        const f = P.frame;
        if (f) {
          f.t.rttMs += ms;
          const r = f.rtts[name] || (f.rtts[name] = { renders: 0, draws: 0, ms: 0 });
          r.renders++;
          r.draws += P.drawsAll - d0;
          r.ms += ms;
        }
        if (!P.rtt.has(name)) {
          let size = null;
          try {
            size = this.getSize();
          } catch {}
          const o = shadowOwner.get(this);
          P.rtt.set(name, {
            name,
            size: size ? `${size.width}x${size.height}` : null,
            cube: !!this.isCube,
            layers: this.is2DArray ? this.getRenderLayers?.() : undefined,
            refreshRate: this.refreshRate,
            renderListLength: this.renderList ? this.renderList.length : null,
            textureType: this.textureType,
            light: o ? `${o.light} (${o.kind})` : undefined,
            filter: o ? { pcf: o.gen.usePercentageCloserFiltering, poisson: o.gen.usePoissonSampling, quality: o.gen.filteringQuality } : undefined,
          });
        } else {
          const i = P.rtt.get(name);
          i.renderListLength = this.renderList ? this.renderList.length : null;
        }
      }
    };
  }

  // ---- cached-RTT invalidations: who calls resetRefreshCounter() on which render target (call-site
  // signature = the first frames below the call), and which shadow casters' world matrices changed
  const resetProto = ownProto(sunMap, "resetRefreshCounter");
  const callerSig = () => {
    const st = String(new Error().stack || "").split("\n").slice(3, 6);
    return st.map((s) => s.trim().replace(/^at /, "").replace(/\(?https?:\/\/[^/]+\/(assets\/)?/, "").replace(/\)$/, "")).join(" < ");
  };
  if (resetProto) {
    const rr = resetProto.resetRefreshCounter;
    // every call is counted per target; the call site (a stack capture, slow) is sampled 1 in RESET_SAMPLE
    // calls and weighted back up
    const RESET_SAMPLE = 16;
    let resetCalls = 0;
    resetProto.resetRefreshCounter = function () {
      const f = P.frame;
      if (P.rec && f) {
        const name = rttName(this);
        f.resetsTotal[name] = (f.resetsTotal[name] || 0) + 1;
        if (resetCalls++ % RESET_SAMPLE === 0) {
          const k = `${name} ← ${callerSig()}`;
          f.resets[k] = (f.resets[k] || 0) + RESET_SAMPLE;
        }
      }
      return rr.call(this);
    };
  }
  const watched = new WeakSet();
  const watchCasters = () => {
    const casters = ctx.render.lighting.casters;
    if (!casters || typeof casters.keys !== "function") return;
    for (const m of casters.keys()) {
      if (watched.has(m) || m.isDisposed()) continue;
      watched.add(m);
      m.onAfterWorldMatrixUpdateObservable.add(() => {
        const f = P.frame;
        if (!P.rec || !f) return;
        const c = catOf(m);
        f.movedCasters[c] = (f.movedCasters[c] || 0) + 1;
      });
    }
  };
  watchCasters();
  P.watchCasters = watchCasters;

  // ---- post-processes
  const cam = ctx.render.camera;
  const anyPP = (cam._postProcesses || []).find(Boolean);
  const ppProto = ownProto(anyPP, "apply");
  if (ppProto) {
    const pa = ppProto.apply;
    ppProto.apply = function () {
      if (P.frame) {
        phase = `post:${this.name}`;
        const k = this.name;
        const r = P.frame.posts[k] || (P.frame.posts[k] = { applies: 0, w: 0, h: 0 });
        r.applies++;
        r.w = this.width;
        r.h = this.height;
      }
      return pa.apply(this, arguments);
    };
  }

  // ---- scene phase observers
  let tPhase = 0;
  scene.onBeforeCameraRenderObservable.add(() => {
    phase = "camera:eval";
    tPhase = now();
  });
  scene.onBeforeRenderTargetsRenderObservable.add(() => {
    if (P.frame && phase === "camera:eval") P.frame.t.evalMs += now() - tPhase;
    phase = "rtt-stage(unattributed)";
  });
  scene.onAfterRenderTargetsRenderObservable.add(() => {
    phase = "camera:prepare";
  });
  scene.onBeforeDrawPhaseObservable.add(() => {
    phase = "main";
    tPhase = now();
  });
  scene.onBeforeRenderingGroupObservable.add((info) => {
    if (!stack.length && phase.startsWith("main")) phase = `main:g${info.renderingGroupId}`;
  });
  scene.onAfterDrawPhaseObservable.add(() => {
    if (P.frame) P.frame.t.mainMs += now() - tPhase;
    phase = "post:(pre)";
    tPhase = now();
  });
  scene.onAfterCameraRenderObservable.add(() => {
    if (P.frame && phase.startsWith("post")) P.frame.t.postMs += now() - tPhase;
    phase = "after-camera";
  });
  // _evaluateActiveMeshes timing (more exact than the observer gap)
  if (typeof scene._evaluateActiveMeshes === "function") {
    const ev = scene._evaluateActiveMeshes;
    scene._evaluateActiveMeshes = function () {
      const t = now();
      try {
        return ev.apply(this, arguments);
      } finally {
        if (P.frame) P.frame.t.evalActiveMs += now() - t;
      }
    };
  }

  // ---- system timers (instance-level wrappers; the game looks methods up on the instances)
  const wrapT = (obj, method, key) => {
    if (!obj || typeof obj[method] !== "function") return;
    const orig = obj[method];
    obj[method] = function () {
      const t = now();
      try {
        return orig.apply(this, arguments);
      } finally {
        const f = P.frame;
        if (f) f.sys[key] = (f.sys[key] || 0) + (now() - t);
      }
    };
  };
  wrapT(ctx.input, "update", "input.update");
  wrapT(ctx.player, "fixedUpdate", "step.player");
  wrapT(ctx.destruction, "beforePhysics", "step.destruction.before");
  wrapT(ctx.physics, "step", "step.physics");
  wrapT(ctx.destruction, "afterPhysics", "step.destruction.after");
  wrapT(ctx.vfx, "fixedUpdate", "step.vfx");
  wrapT(ctx.player, "update", "frame.player");
  wrapT(ctx.audio, "update", "frame.audio");
  wrapT(ctx.vfx, "update", "frame.vfx");
  wrapT(ctx.destruction, "update", "frame.destruction");
  wrapT(ctx.render, "update", "frame.render.update");
  wrapT(ctx.hud, "update", "frame.hud");
  wrapT(game, "fixedStep", "loop.fixedSteps");
  // point-light shadow promotions/demotions (each promotion = new ShadowGenerator + cube RTT + full render,
  // and the light leaves the cluster: every lit material's light layout changes)
  const countCalls = (obj, method, key) => {
    if (!obj || typeof obj[method] !== "function") return;
    const orig = obj[method];
    obj[method] = function () {
      const f = P.frame;
      if (P.rec && f) f.counts[key] = (f.counts[key] || 0) + 1;
      return orig.apply(this, arguments);
    };
  };
  countCalls(ctx.render.lighting, "promote", "pointShadowPromotions");
  countCalls(ctx.render.lighting, "demote", "pointShadowDemotions");
  countCalls(ctx.render, "buildIsland", "islandMeshBuilds");
  countCalls(ctx.render.lighting, "setShadowCaster", "setShadowCaster");
  wrapT(game, "frameUpdate", "loop.frameUpdate");
  // scene.render: frame boundaries (one record per scene.render) + its total time
  const sr = scene.render;
  scene.render = function () {
    if (!P.rec) return sr.apply(this, arguments);
    const f = P.frame || newFrame();
    P.frame = f;
    const t = now();
    try {
      return sr.apply(this, arguments);
    } finally {
      f.t.renderMs = now() - t;
      phase = "outside";
      endFrame();
    }
  };

  function newFrame() {
    return { t: { renderMs: 0, evalMs: 0, evalActiveMs: 0, rttMs: 0, mainMs: 0, postMs: 0, startedAt: now() }, sys: {}, passes: {}, rtts: {}, posts: {}, resets: {}, resetsTotal: {}, movedCasters: {}, counts: {}, heap0: performance.memory ? performance.memory.usedJSHeapSize : 0 };
  }
  function endFrame() {
    const f = P.frame;
    P.frame = null;
    if (!f) return;
    f.t.frameMs = now() - f.t.startedAt;
    f.activeMeshes = scene.getActiveMeshes().length;
    f.heap1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    // compact passes (Sets → counts)
    for (const k in f.passes) {
      const p = f.passes[k];
      p.effects = p.effects.size;
    }
    try {
      const ps = ctx.physics.stats();
      const dbg = ctx.physics.debugStats ? ctx.physics.debugStats() : null;
      f.physics = { bodies: ps.bodies, awake: ps.awake, stepMsEma: ps.stepMs, moved: dbg?.movedLastStep, contactPairs: dbg?.contactPairs, events: dbg?.eventsLastStep, substeps: dbg?.substepsLast };
      const ds = ctx.destruction.stats();
      f.destruction = { msLastStep: ds.msLastStep, islands: ds.islands, dyn: ds.dynamicIslands, debris: ds.debrisIslands, consolidated: ds.consolidated, parts: ds.parts };
    } catch {}
    P.frames.push(f);
  }
  // a frame record opens before the fixed steps of a stepSync / loop frame (so system timers land in it)
  const openFrame = () => {
    if (P.rec && !P.frame) P.frame = newFrame();
  };
  const ss = game.stepSync;
  game.stepSync = function () {
    openFrame();
    return ss.apply(this, arguments);
  };
  const fr = game.frame;
  game.frame = function () {
    openFrame();
    return fr.apply(this, arguments);
  };
  // (the real loop's closure calls this.frame() at each tick, so it goes through the wrapper too)

  P.begin = () => {
    watchCasters();
    P.frames = [];
    P.rec = true;
    P.frame = null;
  };
  P.end = () => {
    P.rec = false;
    P.frame = null;
    const frames = P.frames;
    P.frames = [];
    return frames;
  };
  P.inventory = () => inventory();

  function inventory() {
    refreshShadowOwners();
    const lighting = ctx.render.lighting;
    const shadowGens = [];
    for (const l of scene.lights) {
      const gens = l._shadowGenerators;
      const list = gens ? (gens.values ? [...gens.values()] : Object.values(gens)) : [];
      for (const g of list) {
        const sm = g.getShadowMap();
        // what-if for cube maps: draws with per-face frustum culling (sphere vs the 6 axis pyramids),
        // and casters by room (a light cannot shadow through the walls of its room)
        let perFace = null;
        if (sm && sm.isCube && sm.renderList && l.getAbsolutePosition) {
          const lp = l.getAbsolutePosition();
          const S = Math.SQRT1_2;
          let faceDraws = 0;
          const faces = [0, 0, 0, 0, 0, 0];
          const byRoom = {};
          const lightRoom = ctx.world?.roomAt ? ctx.world.roomAt({ x: lp.x, y: lp.y, z: lp.z })?.id ?? null : null;
          for (const m of sm.renderList) {
            const bs = m.getBoundingInfo().boundingSphere;
            const dx = bs.centerWorld.x - lp.x, dy = bs.centerWorld.y - lp.y, dz = bs.centerWorld.z - lp.z;
            const r = bs.radiusWorld;
            const axes = [[dx, dy, dz], [-dx, dy, dz], [dy, dx, dz], [-dy, dx, dz], [dz, dx, dy], [-dz, dx, dy]];
            for (let fi = 0; fi < 6; fi++) {
              const [a, b, c] = axes[fi];
              if ((a - b) * S >= -r && (a + b) * S >= -r && (a - c) * S >= -r && (a + c) * S >= -r) {
                faces[fi]++;
                faceDraws++;
              }
            }
            const c = bs.centerWorld;
            const rm = ctx.world?.roomAt ? ctx.world.roomAt({ x: c.x, y: c.y, z: c.z })?.id ?? "(none)" : "?";
            byRoom[rm] = (byRoom[rm] || 0) + 1;
          }
          perFace = { lightRoom, drawsNow: sm.renderList.length * 6, drawsWithPerFaceCulling: faceDraws, castersPerFace: faces, castersByRoom: byRoom };
        }
        shadowGens.push({
          light: l.name,
          kind: l.getClassName(),
          enabled: l.isEnabled(),
          mapSize: sm ? sm.getSize().width : null,
          cube: sm ? !!sm.isCube : null,
          refreshRate: sm ? sm.refreshRate : null,
          casters: sm && sm.renderList ? sm.renderList.length : null,
          range: l.range,
          shadowMaxZ: l.shadowMaxZ,
          pcf: g.usePercentageCloserFiltering,
          poisson: g.usePoissonSampling,
          filteringQuality: g.filteringQuality,
          perFace,
        });
      }
    }
    const pps = (cam._postProcesses || []).filter(Boolean).map((pp) => ({ name: pp.name, enabled: pp.isEnabled ? pp.isEnabled() : true, w: pp.width, h: pp.height, ratio: pp._options ?? pp.options ?? null, textureType: pp._textureType }));
    const rtts = scene.textures.filter((t) => t.renderList !== undefined || t.isRenderTarget).map((t) => {
      let size = null;
      try {
        const s = t.getSize();
        size = `${s.width}x${s.height}`;
      } catch {}
      return { name: rttName(t), size, cube: !!t.isCube, refreshRate: t.refreshRate, renderList: t.renderList ? t.renderList.length : null, inCustomTargets: scene.customRenderTargets.includes(t) };
    });
    const byGroup = {};
    const byCat = {};
    const activeByCat = {};
    let thinInst = 0,
      instanced = 0,
      frozen = 0,
      alwaysActive = 0,
      transparent = 0;
    for (const m of scene.meshes) {
      byGroup[m.renderingGroupId] = (byGroup[m.renderingGroupId] || 0) + 1;
      const c = catOf(m);
      byCat[c] = (byCat[c] || 0) + 1;
      if (m.thinInstanceCount > 0) thinInst++;
      if (m.getClassName() === "InstancedMesh") instanced++;
      if (m.isWorldMatrixFrozen) frozen++;
      if (m.alwaysSelectAsActiveMesh) alwaysActive++;
    }
    const active = scene.getActiveMeshes();
    let activeVerts = 0;
    for (let i = 0; i < active.length; i++) {
      const m = active.data[i];
      const c = catOf(m);
      activeByCat[c] = (activeByCat[c] || 0) + 1;
      activeVerts += m.getTotalVertices();
      if (m.material && m.material.needAlphaBlendingForMesh && m.material.needAlphaBlendingForMesh(m)) transparent++;
    }
    const top = (o, n) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n));
    // active meshes by the room of their bounding-box centre (what room/portal culling could skip)
    const activeByRoom = {};
    const casterByRoom = {};
    const roomOf = (m) => {
      try {
        const c = m.getBoundingInfo().boundingBox.centerWorld;
        return (ctx.world && ctx.world.roomAt ? ctx.world.roomAt({ x: c.x, y: c.y, z: c.z })?.id : null) ?? "(outside/none)";
      } catch {
        return "(?)";
      }
    };
    for (let i = 0; i < active.length; i++) {
      const r = roomOf(active.data[i]);
      activeByRoom[r] = (activeByRoom[r] || 0) + 1;
    }
    if (lighting.casters) for (const m of lighting.casters.keys()) {
      const r = roomOf(m);
      casterByRoom[r] = (casterByRoom[r] || 0) + 1;
    }
    const camRoom = (() => {
      const p = cam.globalPosition;
      return ctx.world && ctx.world.roomAt ? ctx.world.roomAt({ x: p.x, y: p.y, z: p.z })?.id ?? null : null;
    })();
    // everything that is not a destruction island / debris batch (exterior, sky, viewmodel, vfx, decals ...)
    const other = {};
    const activeSet = new Set();
    for (let i = 0; i < active.length; i++) activeSet.add(active.data[i]);
    let islandMeshes = 0,
      islandVerts = 0;
    for (const m of scene.meshes) {
      const c = catOf(m);
      if (c.startsWith("isl:") || c === "debris-batch") {
        islandMeshes++;
        islandVerts += m.getTotalVertices();
        continue;
      }
      const o = other[c] || (other[c] = { meshes: 0, active: 0, vertices: 0, group: m.renderingGroupId, material: m.material ? m.material.name : null, castsSunShadow: false });
      o.meshes++;
      if (activeSet.has(m)) o.active++;
      o.vertices += m.getTotalVertices();
      if (lighting.casters && lighting.casters.has(m)) o.castsSunShadow = true;
    }
    const ssao = ctx.render.postfx.ssao;
    const ppl = ctx.render.postfx.pipeline;
    const pre = scene.prePassRenderer;
    const mats = scene.materials;
    let frozenMats = 0;
    for (const m of mats) if (m.isFrozen) frozenMats++;
    // destruction islands: static vs dynamic, awake, consolidated, render meshes per kind
    let islands = null;
    try {
      const w = ctx.destruction.world;
      const st = { islands: 0, static: 0, dynamic: 0, dynamicAwake: 0, consolidated: 0, chunked: 0, meshesStatic: 0, meshesDynamicAsleep: 0, meshesDynamicAwake: 0, glassMeshes: 0, activeStaticMeshes: 0, sunCastersStatic: 0, sunCastersDynamic: 0 };
      // what-if: static + asleep island meshes merged per world cell (opaque/glass separately)
      const cellKey = (m, size) => {
        const c = m.getBoundingInfo().boundingBox.centerWorld;
        return `${Math.floor(c.x / size)},${Math.floor(c.y / size)},${Math.floor(c.z / size)}`;
      };
      const merge = { activeIslandMeshes: 0, activeMergeable: 0, activeAwake: 0, cells2m: new Set(), cells4m: new Set(), roomCells: new Set(), allMergeable: 0, allCells2m: new Set() };
      for (const isl of w.islands) {
        st.islands++;
        if (isl.isStatic) st.static++;
        else st.dynamic++;
        if (!isl.isStatic && isl.awake) st.dynamicAwake++;
        if (isl.consolidated) st.consolidated++;
        if (isl.chunked) st.chunked++;
        for (const ch of isl.chunks.values()) {
          for (const m of [ch.meshes?.opaque, ch.meshes?.glass]) {
            if (!m) continue;
            if (m === ch.meshes.glass) st.glassMeshes++;
            if (isl.isStatic) st.meshesStatic++;
            else if (isl.awake) st.meshesDynamicAwake++;
            else st.meshesDynamicAsleep++;
            if (isl.isStatic && activeSet.has(m)) st.activeStaticMeshes++;
            const mergeable = isl.isStatic || !isl.awake;
            const kind = m === ch.meshes.glass ? "g" : "o";
            if (mergeable) {
              merge.allMergeable++;
              merge.allCells2m.add(kind + cellKey(m, 2));
            }
            if (activeSet.has(m)) {
              merge.activeIslandMeshes++;
              if (mergeable) {
                merge.activeMergeable++;
                merge.cells2m.add(kind + cellKey(m, 2));
                merge.cells4m.add(kind + cellKey(m, 4));
                const c = m.getBoundingInfo().boundingBox.centerWorld;
                merge.roomCells.add(kind + ((ctx.world?.roomAt ? ctx.world.roomAt({ x: c.x, y: c.y, z: c.z })?.id : null) ?? "none") + Math.floor(c.y / 3));
              } else merge.activeAwake++;
            }
            if (lighting.casters && lighting.casters.has(m)) {
              if (isl.isStatic) st.sunCastersStatic++;
              else st.sunCastersDynamic++;
            }
          }
        }
      }
      const nonIslandActive = active.length - merge.activeIslandMeshes;
      st.batchingWhatIf = {
        note: "static + asleep island meshes merged per world cell; awake islands keep their own meshes",
        activeIslandMeshes: merge.activeIslandMeshes,
        activeMergeable: merge.activeMergeable,
        activeAwake: merge.activeAwake,
        nonIslandActive,
        mainPassDrawsNowApprox: active.length,
        mainPassDraws_cells2m: nonIslandActive + merge.activeAwake + merge.cells2m.size,
        mainPassDraws_cells4m: nonIslandActive + merge.activeAwake + merge.cells4m.size,
        mainPassDraws_perRoomPerFloor: nonIslandActive + merge.activeAwake + merge.roomCells.size,
        allMergeableMeshes: merge.allMergeable,
        allCells2m: merge.allCells2m.size,
      };
      islands = st;
    } catch (e) {
      islands = { error: String(e) };
    }
    return {
      canvas: `${engine.getRenderWidth()}x${engine.getRenderHeight()}`,
      islands,
      cameraRoom: camRoom,
      activeMeshesByRoom: top(activeByRoom, 20),
      shadowCastersByRoom: top(casterByRoom, 20),
      hardwareScaling: engine.getHardwareScalingLevel(),
      meshes: scene.meshes.length,
      activeMeshes: active.length,
      activeVertices: activeVerts,
      totalVertices: scene.getTotalVertices(),
      transparentActive: transparent,
      meshesByRenderingGroup: byGroup,
      meshCategories: top(byCat, 25),
      islandMeshes,
      islandVertices: islandVerts,
      nonIslandMeshes: other,
      activeMeshCategories: top(activeByCat, 25),
      thinInstanceMeshes: thinInst,
      instancedMeshes: instanced,
      worldMatrixFrozen: frozen,
      alwaysSelectAsActive: alwaysActive,
      materials: mats.length,
      frozenMaterials: frozenMats,
      compiledEffects: engine._compiledEffects ? Object.keys(engine._compiledEffects).length : null,
      textures: scene.textures.length,
      lights: scene.lights.map((l) => `${l.name}:${l.getClassName()}`).slice(0, 40),
      lightCount: scene.lights.length,
      interiorLights: lighting.lightCount,
      clusteredLights: lighting.clusteredCount,
      shadowedPointLights: lighting.shadowedLights.map((l) => l.name),
      shadowCasters: lighting.casterCount,
      shadowReceivers: lighting.receiverCount,
      lightSlots: lighting.lightSlots,
      shadowGenerators: shadowGens,
      renderTargets: rtts,
      customRenderTargets: scene.customRenderTargets.map((t) => rttName(t)),
      environmentTexture: scene.environmentTexture ? `${scene.environmentTexture.name} (${scene.environmentTexture.isRenderTarget ? "RTT" : "static"}, refreshRate ${scene.environmentTexture.refreshRate ?? "-"})` : null,
      prePass: pre ? { enabled: pre.enabled, samples: pre.samples, attachments: pre.mrtCount ?? pre._mrtCount ?? null, renderTargets: pre.renderTargets ? pre.renderTargets.length : null } : null,
      geometryBuffer: scene.geometryBufferRenderer ? { enabled: scene.geometryBufferRenderer.enabled ?? true, ratio: scene.geometryBufferRenderer._ratioOrDimensions ?? scene.geometryBufferRenderer._ratio ?? null } : null,
      depthRenderers: scene._depthRenderer ? Object.keys(scene._depthRenderer).length : 0,
      ssao: ssao ? { ratio: ssao._ratio ?? null, samples: ssao.samples, expensiveBlur: ssao.expensiveBlur, bilateralSamples: ssao.bilateralSamples, textureType: ssao._textureType } : null,
      defaultPipeline: ppl ? { hdr: ppl._hdr, bloom: ppl.bloomEnabled, bloomScale: ppl.bloomScale, bloomKernel: ppl.bloomKernel, fxaa: ppl.fxaaEnabled, grain: ppl.grainEnabled, chromaticAberration: ppl.chromaticAberrationEnabled, imageProcessing: ppl.imageProcessingEnabled, samples: ppl.samples } : null,
      postProcesses: pps,
      sceneFlags: {
        autoClear: scene.autoClear,
        autoClearDepthAndStencil: scene.autoClearDepthAndStencil,
        skipPointerMovePicking: scene.skipPointerMovePicking,
        blockMaterialDirtyMechanism: scene.blockMaterialDirtyMechanism,
        skipFrustumClipping: scene.skipFrustumClipping,
        performancePriority: scene.performancePriority,
        particlesEnabled: scene.particlesEnabled,
        particleSystems: scene.particleSystems.length,
        spriteManagers: scene.spriteManagers ? scene.spriteManagers.length : 0,
      },
      quality: ctx.settings.data.quality,
    };
  }
  return { ok: true, meshProto: !!meshProto, rttProto: !!rttProto, ppProto: !!ppProto };
}

// ------------------------------------------------------------------ node-side aggregation
const r2 = (x) => Math.round(x * 100) / 100;
const r1 = (x) => Math.round(x * 10) / 10;
function stat(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
  return { mean: r2(mean), p50: r2(q(0.5)), p95: r2(q(0.95)), max: r2(s[s.length - 1]) };
}
/** Aggregate frame records of one measurement window. */
function aggregate(frames) {
  const n = frames.length;
  if (!n) return null;
  const passNames = new Set();
  const rttNames = new Set();
  const postNames = new Set();
  const sysKeys = new Set();
  for (const f of frames) {
    Object.keys(f.passes).forEach((k) => passNames.add(k));
    Object.keys(f.rtts).forEach((k) => rttNames.add(k));
    Object.keys(f.posts).forEach((k) => postNames.add(k));
    Object.keys(f.sys).forEach((k) => sysKeys.add(k));
  }
  const passes = {};
  for (const k of passNames) {
    const draws = frames.map((f) => f.passes[k]?.draws ?? 0);
    const present = frames.filter((f) => f.passes[k]).length;
    const cats = {};
    for (const f of frames) for (const [c, v] of Object.entries(f.passes[k]?.cats ?? {})) cats[c] = (cats[c] ?? 0) + v / n;
    passes[k] = {
      drawsPerFrame: r1(draws.reduce((a, b) => a + b, 0) / n),
      drawsWhenRendered: r1(draws.reduce((a, b) => a + b, 0) / Math.max(1, present)),
      renderedInFrames: `${present}/${n}`,
      trisPerFrame: Math.round(frames.reduce((a, f) => a + (f.passes[k]?.tris ?? 0), 0) / n),
      programSwitchesPerFrame: r1(frames.reduce((a, f) => a + (f.passes[k]?.switches ?? 0), 0) / n),
      uniqueEffects: Math.max(...frames.map((f) => f.passes[k]?.effects ?? 0)),
      topCategories: Object.fromEntries(Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c, v]) => [c, r1(v)])),
    };
  }
  const sortedPasses = Object.fromEntries(Object.entries(passes).sort((a, b) => b[1].drawsPerFrame - a[1].drawsPerFrame));
  const rtts = {};
  for (const k of rttNames) {
    const rs = frames.map((f) => f.rtts[k]).filter(Boolean);
    rtts[k] = { renderedInFrames: `${rs.length}/${n}`, rendersPerFrame: r2(rs.reduce((a, r) => a + r.renders, 0) / n), drawsPerRender: r1(rs.reduce((a, r) => a + r.draws, 0) / Math.max(1, rs.reduce((a, r) => a + r.renders, 0))), cpuMsPerFrame: r2(rs.reduce((a, r) => a + r.ms, 0) / n) };
  }
  const posts = {};
  for (const k of postNames) {
    const rs = frames.map((f) => f.posts[k]).filter(Boolean);
    const last = rs[rs.length - 1];
    posts[k] = { appliesPerFrame: r2(rs.reduce((a, r) => a + r.applies, 0) / n), size: last ? `${last.w}x${last.h}` : null };
  }
  const sys = {};
  for (const k of [...sysKeys].sort()) sys[k] = stat(frames.map((f) => f.sys[k] ?? 0));
  // cached render-target invalidations (per frame, by target ← call site) and moved shadow casters
  const resets = {};
  const moved = {};
  let framesWithMovedCasters = 0;
  const resetsTotal = {};
  for (const f of frames) {
    for (const [k, v] of Object.entries(f.resetsTotal ?? {})) resetsTotal[k] = (resetsTotal[k] ?? 0) + v / n;
    for (const [k, v] of Object.entries(f.resets ?? {})) resets[k] = (resets[k] ?? 0) + v / n;
    const mc = Object.entries(f.movedCasters ?? {});
    if (mc.length) framesWithMovedCasters++;
    for (const [k, v] of mc) moved[k] = (moved[k] ?? 0) + v / n;
  }
  const topR = (o, k) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k).map(([a, v]) => [a, r2(v)]));
  const totalDraws = frames.map((f) => Object.values(f.passes).reduce((a, p) => a + p.draws, 0));
  const totalTris = frames.map((f) => Object.values(f.passes).reduce((a, p) => a + p.tris, 0));
  const switches = frames.map((f) => Object.values(f.passes).reduce((a, p) => a + p.switches, 0));
  const heapDeltas = frames.map((f) => (f.heap1 && f.heap0 ? f.heap1 - f.heap0 : 0));
  const pos = heapDeltas.filter((d) => d > 0);
  const last = frames[n - 1];
  const frameMs = frames.map((f) => f.t.frameMs);
  // simulation hitches: the frames with the most CPU outside scene.render, with their system breakdown
  const simMs = (f) => (f.sys["loop.fixedSteps"] ?? 0) + (f.sys["loop.frameUpdate"] ?? 0);
  const worstSimFrames = [...frames]
    .sort((a, b) => simMs(b) - simMs(a))
    .slice(0, 3)
    .filter((f) => simMs(f) > 0)
    .map((f) => ({ simMs: r1(simMs(f)), sys: Object.fromEntries(Object.entries(f.sys).filter(([, v]) => v >= 0.5).map(([k, v]) => [k, r1(v)])), physics: f.physics, destruction: f.destruction }));
  return {
    frames: n,
    cpuFrameMs: stat(frameMs),
    fpsProxy: r1(1000 / Math.max(1e-3, stat(frameMs).mean)),
    breakdownMs: {
      fixedSteps: stat(frames.map((f) => f.sys["loop.fixedSteps"] ?? 0)),
      frameUpdate: stat(frames.map((f) => f.sys["loop.frameUpdate"] ?? 0)),
      sceneRender: stat(frames.map((f) => f.t.renderMs)),
      "render.evaluateActiveMeshes": stat(frames.map((f) => f.t.evalActiveMs)),
      "render.renderTargets": stat(frames.map((f) => f.t.rttMs)),
      "render.mainPass": stat(frames.map((f) => f.t.mainMs)),
      "render.post": stat(frames.map((f) => f.t.postMs)),
    },
    systemsMs: sys,
    drawCalls: stat(totalDraws),
    trianglesDrawn: stat(totalTris),
    programSwitches: stat(switches),
    activeMeshes: stat(frames.map((f) => f.activeMeshes)),
    passes: sortedPasses,
    renderTargets: rtts,
    postProcesses: posts,
    heap: { allocMBPerFrameApprox: r2(pos.reduce((a, b) => a + b, 0) / n / 1048576), gcDropsObserved: heapDeltas.filter((d) => d < -1048576).length, heapMB: last.heap1 ? r1(last.heap1 / 1048576) : null },
    worstSimFrames,
    countsPerFrame: (() => {
      const c = {};
      for (const f of frames) for (const [k, v] of Object.entries(f.counts ?? {})) c[k] = (c[k] ?? 0) + v / n;
      return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, r2(v)]));
    })(),
    rttInvalidationsPerFrame: topR(resetsTotal, 10),
    rttInvalidationCallSitesPerFrame: topR(resets, 25),
    movedShadowCastersPerFrame: { framesWithAny: `${framesWithMovedCasters}/${n}`, total: r1(Object.values(moved).reduce((a, b) => a + b, 0)), byCategory: topR(moved, 80) },
    physics: { ...last.physics, stepMsEmaMean: r2(frames.reduce((a, f) => a + (f.physics?.stepMsEma ?? 0), 0) / n), awakeMean: r1(frames.reduce((a, f) => a + (f.physics?.awake ?? 0), 0) / n) },
    destruction: { ...last.destruction, msLastStep: stat(frames.map((f) => f.destruction?.msLastStep ?? 0)) },
  };
}

// ------------------------------------------------------------------ CPU profile (optional)
let cdp = null;
async function profileStart() {
  if (!PROFILE) return;
  if (!cdp) {
    cdp = await page.context().newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 250 });
  }
  await cdp.send("Profiler.start");
}
async function profileStop(name) {
  if (!PROFILE || !cdp) return null;
  const { profile } = await cdp.send("Profiler.stop");
  const dir = join(repo, "test-results", "perf");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.cpuprofile`), JSON.stringify(profile));
  // self time per function (+ per source file)
  const dt = new Map();
  const { samples, timeDeltas, nodes } = profile;
  const byId = new Map(nodes.map((nd) => [nd.id, nd]));
  for (let i = 0; i < samples.length; i++) dt.set(samples[i], (dt.get(samples[i]) ?? 0) + (timeDeltas[i] ?? 0));
  const fn = new Map();
  const file = new Map();
  let total = 0;
  for (const [id, us] of dt) {
    const nd = byId.get(id);
    if (!nd) continue;
    total += us;
    const cf = nd.callFrame;
    const src = (cf.url || "").split("/").pop() || "(native)";
    const k = `${cf.functionName || "(anonymous)"} ${src}:${cf.lineNumber + 1}`;
    fn.set(k, (fn.get(k) ?? 0) + us);
    const fk = cf.functionName === "(idle)" || cf.functionName === "(program)" || cf.functionName === "(garbage collector)" ? cf.functionName : src;
    file.set(fk, (file.get(fk) ?? 0) + us);
  }
  const top = (m, k) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([name, us]) => ({ name, ms: r1(us / 1000), pct: r1((100 * us) / Math.max(1, total)) }));
  return { totalMs: r1(total / 1000), topSelf: top(fn, 40), byFile: top(file, 15), file: `test-results/perf/${name}.cpuprofile` };
}

// ------------------------------------------------------------------ allocation sampling (optional)
let hcdp = null;
async function allocStart() {
  if (!ALLOC) return;
  if (!hcdp) {
    hcdp = await page.context().newCDPSession(page);
    await hcdp.send("HeapProfiler.enable");
  }
  // includeObjectsCollectedBy*GC: count short-lived garbage too (what drives GC frequency)
  await hcdp.send("HeapProfiler.startSampling", { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
}
async function allocStop(frames) {
  if (!ALLOC || !hcdp) return null;
  const { profile } = await hcdp.send("HeapProfiler.stopSampling");
  const self = new Map();
  let total = 0;
  const walk = (nd) => {
    const cf = nd.callFrame;
    const src = (cf.url || "").split("/").pop() || "(native)";
    const k = `${cf.functionName || "(anonymous)"} ${src}:${cf.lineNumber + 1}`;
    if (nd.selfSize) {
      self.set(k, (self.get(k) ?? 0) + nd.selfSize);
      total += nd.selfSize;
    }
    for (const c of nd.children || []) walk(c);
  };
  walk(profile.head);
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, b]) => ({ name, kbPerFrame: r1(b / 1024 / frames), pct: r1((100 * b) / Math.max(1, total)) }));
  return { sampledMBPerFrame: r2(total / 1048576 / frames), top };
}

// ------------------------------------------------------------------ scenario helpers
async function sim(fn, arg) {
  const r = await page.evaluate(fn, arg);
  if (r && typeof r === "object" && r.error) throw new Error(String(r.error));
  return r;
}
async function warm() {
  for (let left = WARM_STEPS; left > 0; left -= 60) await sim((k) => window.__sim.step(k), Math.min(60, left));
  if (WARM_FRAMES) await sim((k) => { for (let i = 0; i < k; i++) window.__sim.step(1); return { ok: true }; }, WARM_FRAMES);
}
/**
 * Measure `frames` frames. Default: each frame = __sim.step(1) (1 fixed step + frame update + render).
 * renderOnly: frames = __sim.render(1) (no simulation: nothing moves, cached shadow maps stay cached).
 */
async function measure(name, frames = FRAMES, renderOnly = false) {
  await profileStart();
  await allocStart();
  await page.evaluate(() => window.__perf.begin());
  // in chunks: a single evaluate of hundreds of SwiftShader frames can hit protocol timeouts
  for (let left = frames; left > 0; left -= 10) {
    await sim(({ k, ro }) => { for (let i = 0; i < k; i++) ro ? window.__sim.render(1) : window.__sim.step(1); return { ok: true }; }, { k: Math.min(10, left), ro: renderOnly });
  }
  const recs = await page.evaluate(() => window.__perf.end());
  const prof = await profileStop(name);
  const alloc = await allocStop(frames);
  const agg = aggregate(recs);
  const inv = await page.evaluate(() => window.__perf.inventory());
  const extra = await page.evaluate(() => {
    const s = window.__sim.stats();
    return { simStats: { drawCallsGameStats: s.drawCalls, loop: s.loop, physics: s.physics, destruction: s.destruction, vfx: s.vfx, render: s.render, particles: s.particles, micro: s.micro, voices: s.voices, player: s.player } };
  });
  return { name, mode: renderOnly ? "render-only (no simulation)" : "step(1) per frame", ...agg, inventory: inv, ...extra, profile: prof, allocations: alloc };
}
async function teleport(pos, target) {
  const yaw = Math.atan2(target.x - pos.x, target.z - pos.z);
  const pitch = Math.atan2(-(target.y - pos.y), Math.hypot(target.x - pos.x, target.z - pos.z));
  return sim(({ pos, yaw, pitch }) => window.__sim.teleport(pos, yaw, pitch), { pos, yaw, pitch });
}
function summarize(r) {
  if (!r || !r.passes) return;
  const lines = [];
  lines.push(`== ${r.name}: cpu frame ${r.cpuFrameMs.mean} ms (p95 ${r.cpuFrameMs.p95}) → fps proxy ${r.fpsProxy}; draws ${r.drawCalls.mean} (p95 ${r.drawCalls.p95}); tris ${Math.round(r.trianglesDrawn.mean / 1000)}k; program switches ${r.programSwitches.mean}; active ${r.activeMeshes.mean}`);
  const b = r.breakdownMs;
  lines.push(`   steps ${b.fixedSteps.mean} | update ${b.frameUpdate.mean} | render ${b.sceneRender.mean} (eval ${b["render.evaluateActiveMeshes"].mean}, rtt ${b["render.renderTargets"].mean}, main ${b["render.mainPass"].mean}, post ${b["render.post"].mean}) ms`);
  for (const [k, p] of Object.entries(r.passes).slice(0, 14)) lines.push(`   ${k.padEnd(34)} ${String(p.drawsPerFrame).padStart(7)} draws/frame  (${p.renderedInFrames} frames, ${p.drawsWhenRendered} when rendered, ${Math.round(p.trisPerFrame / 1000)}k tris)`);
  const s = r.systemsMs;
  lines.push(`   systems: ` + Object.entries(s).filter(([k]) => !k.startsWith("loop.")).map(([k, v]) => `${k} ${v.mean}`).join(", "));
  const inv = Object.entries(r.rttInvalidationCallSitesPerFrame ?? {}).slice(0, 6);
  if (inv.length) lines.push(`   RTT invalidations/frame: ` + inv.map(([k, v]) => `${v}× ${k.slice(0, 140)}`).join("\n                            "));
  if (r.countsPerFrame && Object.keys(r.countsPerFrame).length) lines.push(`   counts/frame: ${JSON.stringify(r.countsPerFrame)}`);
  const mc = r.movedShadowCastersPerFrame;
  if (mc) lines.push(`   moved shadow casters/frame: ${mc.total} (${mc.framesWithAny} frames) ` + JSON.stringify(Object.fromEntries(Object.entries(mc.byCategory).slice(0, 8))));
  lines.push(`   physics awake ${r.physics.awake}/${r.physics.bodies} stepEma ${r.physics.stepMsEmaMean} ms; destruction ${JSON.stringify(r.destruction.msLastStep)}; heap +${r.heap.allocMBPerFrameApprox} MB/frame`);
  console.log(lines.join("\n"));
}

// ------------------------------------------------------------------ run
const report = { date: new Date().toISOString(), args, viewport: `${VW}x${VH}`, frames: FRAMES, warmSteps: WARM_STEPS, notes: [], boot: null, scenarios: {} };
let exitCode = 0;
try {
  const url = `http://127.0.0.1:${port}/?test=1&hold=1${quality ? `&quality=${quality}` : ""}${urlExtra}`;
  report.url = url.replace(/^http:\/\/127\.0\.0\.1:\d+/, "");
  log("booting", report.url);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__sim?.ready || window.__sim?.error || window.__simError, null, { timeout: bootTimeout, polling: 500 });
  const boot = await page.evaluate(() => ({ error: window.__sim?.error ?? window.__simError ?? null, boot: window.__sim?.boot ?? null, world: window.__sim?.world?.() ?? null }));
  if (boot.error) throw new Error("boot error: " + boot.error);
  report.boot = { ms: Date.now() - t0, timings: boot.boot?.timings, quality: boot.boot?.quality, world: boot.world ? { assemblies: boot.world.assemblies, parts: boot.world.parts, bodies: boot.world.bodies, triangles: boot.world.triangles, meshes: boot.world.meshes, awakeAfterSettle: boot.world.awakeAfterSettle } : null };
  log("booted", JSON.stringify(report.boot.world));
  // the real-time loop runs in hold mode (renders, no simulation); stop it: frames are driven by __sim.step
  await sim(() => window.__sim.loop(false));
  const inst = await page.evaluate(installPerf);
  log("instrumented", JSON.stringify(inst));

  // ---- boot-phase draw calls: what the first frames after boot cost (env capture / shader compile)
  {
    await page.evaluate(() => window.__perf.begin());
    await sim(() => { for (let i = 0; i < 3; i++) window.__sim.render(1); return { ok: true }; });
    const recs = await page.evaluate(() => window.__perf.end());
    report.bootFrames = recs.map((f) => ({ draws: Object.values(f.passes).reduce((a, p) => a + p.draws, 0), passes: Object.fromEntries(Object.entries(f.passes).map(([k, p]) => [k, p.draws])), rtts: f.rtts }));
  }

  for (const sc of scenarios) {
    try {
      if (sc === "idle") {
        await teleport({ x: 6.9, y: 1.65, z: 0.95 }, { x: 4.3, y: 1.2, z: 2.4 }); // spawn, looking at the TV wall / hall opening
        await warm();
        const r = await measure("idle");
        report.scenarios.idle = r;
        summarize(r);
        // same view, rendering only (nothing moves): the cached shadow maps stay cached
        const ro = await measure("idle-render-only", Math.min(FRAMES, 15), true);
        report.scenarios.idleRenderOnly = ro;
        summarize(ro);
      } else if (sc === "hall") {
        await teleport({ x: 11.6, y: 1.65, z: 5.2 }, { x: 0.6, y: 1.2, z: 5.0 }); // foyer → west: cased opening, kitchen/living, west hall
        await warm();
        const r = await measure("hall");
        report.scenarios.hall = r;
        summarize(r);
      } else if (sc === "destruction") {
        await teleport({ x: 6.6, y: 1.65, z: 2.2 }, { x: 6.6, y: 1.0, z: 6.5 }); // living room, facing the kitchen
        await warm();
        const seq = await sim(() => {
          const s = window.__sim;
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
            s.step(2);
          }
          let thrown = 0;
          for (const a of furn.slice(0, 12)) {
            const r = s.throwAt(a.id, 14, thrown % 2 ? "plate" : "mug");
            if (!(r && r.error)) thrown++;
            s.step(1);
          }
          const ev = {};
          for (const e of s.events(e0)) ev[e.type] = (ev[e.type] ?? 0) + 1;
          return { targets: targets.length, hits, errors, thrown, ms: Math.round(performance.now() - t), events: ev, stats: s.stats().destruction };
        });
        log("destruction sequence", JSON.stringify(seq));
        const during = await measure("destruction-during");
        during.sequence = seq;
        report.scenarios.destructionDuring = during;
        summarize(during);
        await warm();
        await sim((k) => window.__sim.step(k), 60); // extra settling
        const after = await measure("destruction-after");
        report.scenarios.destructionAfter = after;
        summarize(after);
      } else if (sc === "whatif") {
        // A/B in one session, simulating the pending sleep fix: every dynamic island forced asleep, then
        // (b) also the mains-powered motors (ceiling fan) stopped. Shows what still invalidates the shadow caches.
        await teleport({ x: 6.9, y: 1.65, z: 0.95 }, { x: 4.3, y: 1.2, z: 2.4 });
        await warm();
        const sleepAll = () =>
          sim(() => {
            const c = window.__game.ctx;
            let n = 0;
            for (const isl of c.destruction.world.islands) {
              if (!isl.isStatic && isl.body && isl.alive) {
                c.physics.sleep(isl.body);
                n++;
              }
            }
            return { slept: n };
          });
        log("whatif sleepAll", JSON.stringify(await sleepAll()));
        await sim(() => window.__sim.step(1));
        const a = await measure("whatif-allAsleep-fanOn", Math.min(FRAMES, 12));
        report.scenarios.whatifAllAsleepFanOn = a;
        summarize(a);
        const fan = await sim(() => {
          const c = window.__game.ctx;
          const j = c.destruction.joints;
          let n = 0;
          const moving = new Set();
          for (const g of [...j.motors]) {
            g.motorOn = false;
            g.motorSpeed = 0;
            n++;
            for (const b of g.bonds ?? []) for (const isl of [b.a?.island, b.b?.island]) if (isl && !isl.isStatic && isl.body) moving.add(isl);
          }
          // stop only the motor-driven islands dead (a 52" fan takes many seconds to spin down by friction);
          // touching every body would wake the whole apartment
          for (const isl of moving) {
            try {
              const v = isl.node.position.constructor;
              isl.body.setLinearVelocity(new v(0, 0, 0));
              isl.body.setAngularVelocity(new v(0, 0, 0));
              c.physics.sleep(isl.body);
            } catch {}
          }
          return { motorsStopped: n, motorIslandsStopped: moving.size };
        });
        log("whatif motors", JSON.stringify(fan));
        await sim(() => window.__sim.step(2));
        log("whatif sleepAll", JSON.stringify(await sleepAll()));
        await sim(() => window.__sim.step(1));
        const b = await measure("whatif-allAsleep-fanOff", Math.min(FRAMES, 12));
        report.scenarios.whatifAllAsleepFanOff = b;
        summarize(b);
      } else {
        report.notes.push(`unknown scenario ${sc}`);
      }
    } catch (e) {
      report.scenarios[sc] = { error: String(e?.stack ?? e) };
      console.error(`scenario ${sc} failed:`, e);
      exitCode = 1;
    }
  }

  // ---- real loop (accumulator, up to 4 steps per frame): Game.stats as the HUD / __sim.stats report them
  if (REALTIME_MS > 0) {
    await sim(() => window.__sim.hold(false));
    await page.evaluate(() => window.__perf.begin());
    await sim(() => window.__sim.loop(true));
    await page.waitForTimeout(REALTIME_MS);
    await sim(() => window.__sim.loop(false));
    const recs = await page.evaluate(() => window.__perf.end());
    const st = await page.evaluate(() => window.__sim.stats());
    await sim(() => window.__sim.hold(true));
    const agg = aggregate(recs);
    report.scenarios.realtime = { name: "realtime", ...agg, gameStats: st.loop, engineFps: st.fps, gameStatsDrawCalls: st.drawCalls, physics: st.physics };
    summarize(report.scenarios.realtime);
    console.log(`   realtime Game.stats: ${JSON.stringify(st.loop)} engine fps ${st.fps}`);
  }
} catch (e) {
  console.error("PERF FAILED:", e);
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
