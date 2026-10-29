// Boot: engine + scene, the GameContext (systems in dependency order), the apartment build behind
// the loading overlay, then the game loop. URL parameters:
//   ?test=1            deterministic seed, preserveDrawingBuffer, no click-to-play / pointer lock
//   ?quality=low|medium|high|ultra   ?ps2=1   ?seed=N   ?nofurniture=1 (structure only)
// A boot failure shows an overlay (message + stack) and sets window.__simError / __sim.error.

import { Engine, Scene, Vector3, Color4 } from "@babylonjs/core";
import { Layer, type GameContext } from "./core/context.ts";
import { EventBus, type GameEvents } from "./core/events.ts";
import { Rng } from "./core/rng.ts";
import { Settings, QUALITY, type QualityLevel } from "./core/settings.ts";
import { Time } from "./core/time.ts";
import { Game } from "./core/game.ts";
import { createPhysics } from "./physics/physics.ts";
import { createRender } from "./render/renderSystem.ts";
import { roomMaskForBox } from "./render/env/roomGraph.ts";
import { createAudio } from "./audio/audio.ts";
import { createVfx } from "./vfx/vfx.ts";
import { Destruction } from "./destruction/destructionSystem.ts";
import { Input } from "./player/input.ts";
import { Player } from "./player/player.ts";
import { Hud } from "./ui/hud.ts";
import { GameWorld } from "./world/world.ts";
import { DebugApi } from "./debug/api.ts";
import { warmupGeometry } from "./geom/warmup.ts";
import type { Vec3 } from "./geom/vec.ts";

interface BootOptions {
  test: boolean;
  seed: number;
  quality: QualityLevel | null;
  ps2: boolean | null;
  furniture: boolean;
}

const TEST_SEED = 0x5eed1234;

function parseOptions(): BootOptions {
  const q = new URLSearchParams(location.search);
  const flag = (k: string): boolean | null => (q.has(k) ? !["0", "false", "no", "off"].includes((q.get(k) ?? "").toLowerCase()) : null);
  const test = flag("test") === true;
  const seedRaw = Number(q.get("seed"));
  const seed = q.has("seed") && Number.isFinite(seedRaw) ? seedRaw >>> 0 : test ? TEST_SEED : (Math.random() * 0x100000000) >>> 0;
  const ql = (q.get("quality") ?? "").toLowerCase();
  return {
    test,
    seed,
    quality: ql in QUALITY ? (ql as QualityLevel) : null,
    ps2: flag("ps2"),
    furniture: flag("nofurniture") !== true,
  };
}

/** Full-screen boot error overlay (message + stack). */
function showError(e: unknown, stage: string): string {
  const err = e as Error;
  const text = `${stage}: ${String(err?.message ?? e)}\n\n${String(err?.stack ?? "")}`;
  (window as unknown as { __simError?: string }).__simError = text;
  const sim = (window as unknown as { __sim?: { error?: unknown } }).__sim;
  if (!sim || typeof sim !== "object") (window as unknown as { __sim: unknown }).__sim = { ready: false, error: text };
  try {
    const box = document.createElement("div");
    box.id = "boot-error";
    box.style.cssText =
      "position:fixed;inset:0;z-index:100000;background:rgba(12,8,8,.94);color:#f3d9d4;font:13px/1.45 ui-monospace,Menlo,Consolas,monospace;padding:28px 34px;overflow:auto;white-space:pre-wrap";
    const h = document.createElement("div");
    h.style.cssText = "font:600 20px system-ui,sans-serif;color:#ff8a76;margin-bottom:14px";
    h.textContent = "The apartment failed to load";
    const pre = document.createElement("div");
    pre.textContent = text;
    box.append(h, pre);
    document.body.appendChild(box);
  } catch {
    /* no DOM */
  }
  console.error(`boot failed (${stage})`, e);
  return text;
}

async function boot(): Promise<void> {
  const tBoot = performance.now();
  const opts = parseOptions();
  let stage = "engine";
  let debug: DebugApi | null = null;
  try {
    const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement | null;
    if (!canvas) throw new Error("#renderCanvas missing");

    // ---- engine + scene (docs/api-notes/input-loop-camera.md §8, rendering-materials-geometry.md)
    const engine = new Engine(canvas, false, {
      stencil: true,
      antialias: false, // FXAA runs in the post pipeline
      powerPreference: "high-performance",
      audioEngine: false, // we own the Web Audio graph
      preserveDrawingBuffer: opts.test, // canvas.toDataURL() in tests
      doNotHandleContextLost: false,
    });
    if (!engine.webGLVersion || engine.webGLVersion < 2) throw new Error("WebGL2 is required");
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0, 0, 0, 1);
    // gameplay picking uses Havok raycasts; input comes from DOM events
    scene.skipPointerMovePicking = true;
    scene.skipPointerDownPicking = true;
    scene.skipPointerUpPicking = true;
    window.addEventListener("resize", () => engine.resize());

    // ---- core services
    stage = "core";
    const settings = new Settings();
    if (opts.quality) settings.data.quality = opts.quality; // URL overrides are not persisted
    if (opts.ps2 !== null) settings.data.ps2Mode = opts.ps2;
    const time = new Time();
    const rng = new Rng(opts.seed);
    const events = new EventBus<GameEvents>();
    // the context is filled system by system; every system reads only what exists before it
    const ctx = { engine, scene, canvas, time, settings, rng, events } as unknown as GameContext;

    debug = new DebugApi(ctx);
    ctx.debug = debug;
    debug.boot = { seed: opts.seed, test: opts.test, quality: settings.data.quality, ps2: settings.data.ps2Mode, furniture: opts.furniture, timings: {} };
    debug.install();
    const timings = debug.boot.timings as Record<string, number>;
    const mark = (k: string, t0: number) => (timings[k] = Math.round(performance.now() - t0));

    // input + HUD first: the HUD owns the loading bar
    stage = "input/hud";
    const input = new Input(canvas, settings);
    ctx.input = input;
    const hud = new Hud(ctx);
    ctx.hud = hud;
    const loading = (p: number, label: string) => hud.setLoading(p, label);
    loading(0.01, "Starting physics");

    // ---- physics
    stage = "physics";
    let t0 = performance.now();
    const physics = await createPhysics(scene);
    ctx.physics = physics;
    mark("physics", t0);

    // ---- render + audio bank (in parallel: textures download while the bank synthesises)
    stage = "render/audio";
    t0 = performance.now();
    let pRender = 0,
      pAudio = 0,
      lRender = "Renderer";
    const combined = () => loading(0.02 + 0.3 * (0.75 * pRender + 0.25 * pAudio), lRender);
    const [render, audio] = await Promise.all([
      createRender({
        engine,
        scene,
        settings,
        onProgress: (p, label) => {
          pRender = p;
          lRender = label;
          combined();
        },
      }),
      createAudio({
        events,
        settings,
        seed: opts.seed,
        onProgress: (p) => {
          pAudio = p;
          combined();
        },
      }),
    ]);
    ctx.render = render;
    ctx.audio = audio;
    mark("renderAudio", t0);

    // ---- world object (rooms, roomAt, spawn) — built later, but systems below read it
    const world = new GameWorld(ctx, { furniture: opts.furniture, onProgress: (p, label) => loading(0.36 + 0.6 * p, label) });
    ctx.world = world;

    // audio propagation hooks: room acoustics + occlusion through static structure
    audio.setRoomResolver((p) => world.roomAt(p)?.acoustics ?? null);
    audio.setOcclusion(makeOcclusion(ctx));

    // ---- vfx
    stage = "vfx";
    const gpFrom = new Vector3(),
      gpTo = new Vector3();
    const groundMask = Layer.STATIC | Layer.DYNAMIC;
    ctx.vfx = createVfx({
      scene,
      events,
      settings,
      worldMaterial: render.worldMaterial,
      registerMesh: (m) => render.lighting.registerReceiver(m),
      unregisterMesh: (m) => render.lighting.unregisterReceiver(m),
      roomMaskAt: (x, z) => roomMaskForBox(x, x, z, z),
      groundProbe: (x, y, z) => {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
        gpFrom.set(x, y + 0.02, z);
        gpTo.set(x, y - 40, z);
        const h = physics.raycast(gpFrom, gpTo, groundMask);
        return h ? h.point.y : null;
      },
    });

    // ---- destruction, player
    stage = "destruction";
    ctx.destruction = new Destruction(ctx);
    stage = "player";
    ctx.player = new Player(ctx);

    // ---- JIT warm-up of the fracture/meshing hot paths (first hit otherwise hitches 40–350 ms)
    stage = "warmup";
    loading(0.34, "Warming up fracture code");
    await new Promise((r) => setTimeout(r, 0));
    t0 = performance.now();
    warmupGeometry(opts.test ? 250 : 500);
    mark("warmup", t0);

    // ---- the apartment
    stage = "world";
    t0 = performance.now();
    await world.build();
    mark("world", t0);
    const rep = world.report;
    if (rep) {
      console.log(
        `[world] ${rep.assemblies} assemblies, ${rep.parts} parts, ${rep.bodies} bodies, ${Math.round(rep.triangles / 1000)}k triangles, ` +
          `${rep.meshes} meshes in ${(rep.totalMs / 1000).toFixed(1)} s (${rep.phases.map((p) => `${p.id} ${p.assemblies}: ${Math.round(p.buildMs + p.spawnMs)} ms`).join(", ")}); ` +
          `settle ${rep.settleSteps} steps ${Math.round(rep.settleMs)} ms, awake ${rep.awakeAfterSettle}` +
          (rep.failures.length ? `; ${rep.failures.length} FAILED` : ""),
      );
    }

    // ---- loop
    stage = "loop";
    const game = new Game(ctx, { pauseOnHidden: !opts.test });
    debug.attach(game, world);
    (window as unknown as { __game?: unknown }).__game = opts.test ? { ctx, game, world } : undefined;
    game.start();
    hud.hideLoading();
    // the reflection capture renders during the first frames; don't report ready before it lands
    await Promise.race([world.envReady, new Promise((r) => setTimeout(r, 20000))]);
    if (opts.test) {
      input.setFallback(true); // no pointer lock in automation
      hud.forcePlay();
    }
    timings.total = Math.round(performance.now() - tBoot);
    debug.ready = true;
  } catch (e) {
    const text = showError(e, stage);
    if (debug) debug.error = text;
  }
}

/**
 * Audio occlusion: rays listener → source against the STATIC layer. Hits closer than 0.3 m to each
 * other belong to the same wall (drywall + studs + drywall, a slab); each wall crossed attenuates,
 * three or more block almost everything. Hits within 2 cm of the source (the surface it sits on)
 * are ignored. 1 = clear line … 0 = blocked.
 */
function makeOcclusion(ctx: GameContext): (from: Vec3, to: Vec3) => number {
  const a = new Vector3(),
    b = new Vector3();
  const LEVELS = [1, 0.42, 0.16, 0.05];
  return (from, to) => {
    const len = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    if (!(len > 0.05) || !Number.isFinite(len)) return 1;
    a.set(from.x, from.y, from.z);
    b.set(to.x, to.y, to.z);
    const ph = ctx.physics;
    let walls = 0;
    if (ph.raycastAll) {
      const hits = ph.raycastAll(a, b, Layer.STATIC);
      if (hits.length > 1) hits.sort((p, q) => p.distance - q.distance);
      let last = -1;
      for (const h of hits) {
        if (h.distance > len - 0.02) continue;
        if (last >= 0 && h.distance - last < 0.3) {
          last = h.distance;
          continue;
        }
        last = h.distance;
        if (++walls >= 3) break;
      }
    } else {
      const h = ph.raycast(a, b, Layer.STATIC);
      if (h && h.distance < len - 0.02) walls = 1;
    }
    return LEVELS[walls];
  };
}

void boot();
