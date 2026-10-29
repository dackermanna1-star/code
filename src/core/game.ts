// The game loop (docs/ARCHITECTURE.md §3). One `runRenderLoop` callback does everything in an
// explicit order; Babylon never advances physics by itself (createPhysics sets
// scene.physicsEnabled = false, we call physics.step(FIXED_DT) — see docs/api-notes/input-loop-camera.md).
//
// Per render frame:
//   n = time.beginFrame(dt)                          (accumulator, ≤ 4 steps, time.scale / hit-stop)
//   n × fixed step:  input latch → player.fixedUpdate → destruction.beforePhysics → physics.step
//                    → destruction.afterPhysics → vfx.fixedUpdate → time.tick
//   player.update → audio listener + audio.update → vfx.update → destruction.update →
//   render.update → hud.update → debug.update → scene.render()
//
// Pause: the HUD's menus set time.scale = 0 (0 fixed steps per frame, the scene keeps rendering);
// the loop ducks the audio and freezes Babylon animatables while paused, and opens the pause menu
// when the tab is hidden. A camera override (debug screenshot poses) replaces the player camera.

import { Vector3 } from "@babylonjs/core";
import type { GameContext } from "./context.ts";
import { FIXED_DT } from "./time.ts";
import type { Vec3 } from "../geom/vec.ts";

export interface CameraOverride {
  pos: Vec3;
  yaw: number;
  pitch: number;
}

export interface GameOptions {
  /** Open the pause menu when the tab becomes hidden. Default true. */
  pauseOnHidden?: boolean;
  /** Master-volume factor while paused (0..1). Default 0.25. */
  pausedVolume?: number;
}

export interface LoopStats {
  frames: number;
  /** CPU time of the last loop body (ms) and its exponential average. */
  frameMs: number;
  frameMsAvg: number;
  /** Per-phase averages (ms): fixed steps (all of a frame), per-frame updates, scene.render(). */
  stepsMs: number;
  updateMs: number;
  renderMs: number;
  stepsLastFrame: number;
  errors: number;
}

const FWD = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);
const now = (): number => performance.now();

export class Game {
  readonly ctx: GameContext;
  /** When set, the camera shows this pose instead of the player's view (screenshots). */
  cameraOverride: CameraOverride | null = null;
  readonly stats: LoopStats = { frames: 0, frameMs: 0, frameMsAvg: 0, stepsMs: 0, updateMs: 0, renderMs: 0, stepsLastFrame: 0, errors: 0 };
  /** Called with every caught loop error (the first few are also logged). */
  onError: ((e: unknown) => void) | null = null;

  private running = false;
  private paused = false;
  private readonly opts: Required<GameOptions>;
  private readonly fwd = new Vector3();
  private readonly up = new Vector3();
  private readonly disposers: Array<() => void> = [];
  private lastErrorLog = 0;

  constructor(ctx: GameContext, opts: GameOptions = {}) {
    this.ctx = ctx;
    this.opts = { pauseOnHidden: opts.pauseOnHidden ?? true, pausedVolume: opts.pausedVolume ?? 0.25 };
    const onVis = () => {
      if (document.hidden && this.opts.pauseOnHidden) {
        // the HUD's pause() also releases the pointer lock and disables input
        (this.ctx.hud as unknown as { pause?: () => void }).pause?.();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    this.disposers.push(() => document.removeEventListener("visibilitychange", onVis));
  }

  /** Start the render loop. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.ctx.engine.runRenderLoop(() => this.frame());
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.ctx.engine.stopRenderLoop();
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** One render frame (the runRenderLoop body). */
  frame(): void {
    const t0 = now();
    const c = this.ctx;
    let tSteps = t0;
    let tUpdate = t0;
    try {
      this.syncPause();
      const n = c.time.beginFrame(c.engine.getDeltaTime() / 1000);
      if (n === 0) c.input.update(); // virtual holds / stale edges still advance with 0 steps
      for (let i = 0; i < n; i++) this.fixedStep();
      this.stats.stepsLastFrame = n;
      tSteps = now();
      this.frameUpdate(c.time.frameDt);
      tUpdate = now();
      c.scene.render();
    } catch (e) {
      this.reportError(e);
    }
    const t1 = now();
    const s = this.stats;
    s.frames++;
    s.frameMs = t1 - t0;
    const k = s.frames < 10 ? 0.5 : 0.05;
    s.frameMsAvg += (s.frameMs - s.frameMsAvg) * k;
    s.stepsMs += (tSteps - t0 - s.stepsMs) * k;
    s.updateMs += (Math.max(0, tUpdate - tSteps) - s.updateMs) * k;
    s.renderMs += (Math.max(0, t1 - tUpdate) - s.renderMs) * k;
  }

  /** One fixed simulation step (FIXED_DT), in the architecture's order. */
  fixedStep(): void {
    const c = this.ctx;
    c.input.update();
    c.player.fixedUpdate(FIXED_DT);
    c.destruction.beforePhysics(FIXED_DT);
    c.physics.step(FIXED_DT);
    c.destruction.afterPhysics(FIXED_DT);
    c.vfx.fixedUpdate(FIXED_DT);
    c.time.tick();
  }

  /**
   * Advance `n` fixed steps synchronously (tests / debug), then run one frame update + render
   * with a frame delta covering the steps. Ignores time.scale (works while paused).
   */
  stepSync(n: number): void {
    const count = Math.max(0, Math.min(100000, Math.floor(n)));
    const c = this.ctx;
    try {
      for (let i = 0; i < count; i++) this.fixedStep();
      const dt = Math.min(0.25, Math.max(count, 1) * FIXED_DT);
      this.frameUpdate(dt);
      c.scene.render();
    } catch (e) {
      this.reportError(e);
      throw e;
    }
  }

  /** Render one frame without simulating (screenshots after a pose change). */
  renderOnce(): void {
    try {
      this.frameUpdate(0);
      this.ctx.scene.render();
    } catch (e) {
      this.reportError(e);
    }
  }

  dispose(): void {
    this.stop();
    for (const d of this.disposers) d();
    this.disposers.length = 0;
  }

  // ------------------------------------------------------------------ internals

  /** Per-frame updates (dt = real frame seconds; simulation-driven systems get 0 while paused). */
  private frameUpdate(dt: number): void {
    const c = this.ctx;
    const simDt = c.time.scale > 0 ? dt : 0;
    c.player.update(dt);
    const cam = c.render.camera;
    const o = this.cameraOverride;
    if (o) {
      cam.position.set(o.pos.x, o.pos.y, o.pos.z);
      cam.rotation.set(o.pitch, o.yaw, 0);
    }
    // listener = the rendered camera (shake included: what you see is what you hear)
    cam.getDirectionToRef(FWD, this.fwd);
    cam.getDirectionToRef(UP, this.up);
    c.audio.setListener(cam.position, this.fwd, this.up);
    c.audio.update(dt);
    c.vfx.update(simDt);
    c.destruction.update(simDt);
    c.render.update(dt);
    c.hud.update(dt);
    c.debug.update(dt);
  }

  /** Mirror the HUD's pause state onto audio and Babylon animations. */
  private syncPause(): void {
    const c = this.ctx;
    const paused = c.time.scale === 0 && c.hud.menuOpen;
    if (paused === this.paused) return;
    this.paused = paused;
    const master = Number.isFinite(c.settings.data.masterVolume) ? c.settings.data.masterVolume : 0.8;
    c.audio.setMasterVolume(paused ? master * this.opts.pausedVolume : master);
    c.scene.animationTimeScale = paused ? 0 : 1;
  }

  private reportError(e: unknown): void {
    this.stats.errors++;
    const t = now();
    // log the first errors with their stack, then at most one per 5 s (no console flood at 60 fps)
    if (this.stats.errors <= 5 || t - this.lastErrorLog > 5000) {
      this.lastErrorLog = t;
      console.error(`game loop error #${this.stats.errors}`, e);
    }
    try {
      this.onError?.(e);
    } catch {
      /* ignore */
    }
  }
}
