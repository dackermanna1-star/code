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

import { Vector3, type AbstractMesh } from "@babylonjs/core";
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
  /**
   * Hold mode (`?hold=1`): the simulation stays frozen (time.scale = 0) outside the menus and only
   * advances through stepSync (`__sim.step`). A pause/resume through the HUD keeps it frozen.
   */
  hold?: boolean;
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
  /** Draw calls of the last scene.render() (all passes: shadows, probes, post). */
  drawCalls: number;
  errors: number;
}

/** stepSync runs the simulation-driven frame updates at least every this many fixed steps. */
const SYNC_UPDATE_STEPS = 15;
const FWD = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);
const now = (): number => performance.now();

export class Game {
  readonly ctx: GameContext;
  /** When set, the camera shows this pose instead of the player's view (screenshots). */
  cameraOverride: CameraOverride | null = null;
  readonly stats: LoopStats = { frames: 0, frameMs: 0, frameMsAvg: 0, stepsMs: 0, updateMs: 0, renderMs: 0, stepsLastFrame: 0, drawCalls: 0, errors: 0 };
  /** Called with every caught loop error (the first few are also logged). */
  onError: ((e: unknown) => void) | null = null;

  /** See GameOptions.hold; may be toggled at runtime (debug API). */
  hold: boolean;

  private running = false;
  private paused = false;
  private menuWasOpen = false;
  private readonly opts: Required<Omit<GameOptions, "hold">>;
  private readonly fwd = new Vector3();
  private readonly up = new Vector3();
  private readonly disposers: Array<() => void> = [];
  private lastErrorLog = 0;
  private readonly hiddenOverlay: AbstractMesh[] = [];

  constructor(ctx: GameContext, opts: GameOptions = {}) {
    this.ctx = ctx;
    this.opts = { pauseOnHidden: opts.pauseOnHidden ?? true, pausedVolume: opts.pausedVolume ?? 0.25 };
    this.hold = !!opts.hold;
    if (this.hold) ctx.time.scale = 0;
    // master volume changes made while paused (the pause menu's slider) must stay ducked. The HUD
    // applies the new value to the audio right after storing the setting, so re-apply afterwards.
    const offSettings = ctx.settings.onChange(() => queueMicrotask(() => this.applyMasterVolume()));
    this.disposers.push(offSettings);
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
      const dt = c.time.frameDt;
      this.frameUpdate(dt, c.time.scale > 0 ? dt : 0);
      tUpdate = now();
      this.renderScene();
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

  /** Largest step count stepSync accepts per call. */
  static readonly MAX_SYNC_STEPS = 100000;

  /** Normalise a requested step count: non-finite → 1, else floor, clamped to [0, MAX_SYNC_STEPS]. */
  static syncStepCount(n: unknown): number {
    const v = typeof n === "number" ? n : Number(n);
    if (!Number.isFinite(v)) return 1;
    return Math.max(0, Math.min(Game.MAX_SYNC_STEPS, Math.floor(v)));
  }

  /**
   * Advance `n` fixed steps synchronously (tests / debug), then run one frame update + render.
   * Ignores time.scale (works while paused / in hold mode). The simulation-driven frame updates
   * (destruction features: light flicker, leaks, sparks; VFX particles) advance by the simulated
   * time: every SYNC_UPDATE_STEPS steps in between, and the remainder in the final frame update.
   * Returns the number of steps actually simulated (see syncStepCount).
   */
  stepSync(n: number): number {
    const count = Game.syncStepCount(n);
    const c = this.ctx;
    try {
      let pending = 0;
      for (let i = 0; i < count; i++) {
        this.fixedStep();
        if (++pending === SYNC_UPDATE_STEPS && i < count - 1) {
          c.vfx.update(pending * FIXED_DT);
          c.destruction.update(pending * FIXED_DT);
          pending = 0;
        }
      }
      const dt = Math.min(0.25, Math.max(count, 1) * FIXED_DT);
      this.frameUpdate(dt, pending * FIXED_DT);
      this.renderScene();
      return count;
    } catch (e) {
      this.reportError(e);
      throw e;
    }
  }

  /** Render one frame without simulating (screenshots after a pose change). */
  renderOnce(): void {
    try {
      this.frameUpdate(0, 0);
      this.renderScene();
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

  /** scene.render() + draw-call count (engine._drawCalls is a running counter in Babylon 9). */
  private renderScene(): void {
    const pc = (this.ctx.engine as unknown as { _drawCalls?: { current: number } })._drawCalls;
    const before = pc ? pc.current : 0;
    this.ctx.scene.render();
    if (pc) {
      const d = pc.current - before;
      this.stats.drawCalls = d >= 0 ? d : pc.current;
    }
  }

  /**
   * Per-frame updates. dt = real frame seconds (camera, audio, render, HUD); simDt = simulated
   * seconds for the simulation-driven systems (VFX particles, destruction features) — 0 while
   * paused, the stepped time in stepSync.
   */
  private frameUpdate(dt: number, simDt: number): void {
    const c = this.ctx;
    c.player.update(dt);
    const cam = c.render.camera;
    const o = this.cameraOverride;
    if (o) {
      cam.position.set(o.pos.x, o.pos.y, o.pos.z);
      cam.rotation.set(o.pitch, o.yaw, 0);
    }
    this.hideOverlayGroup(!!o);
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

  /**
   * Free-camera poses show the world only: the first-person viewmodel (rendering group 1, placed
   * for the player's eye) is hidden through isVisible, which the viewmodel itself never touches.
   */
  private hideOverlayGroup(hide: boolean): void {
    if (hide) {
      for (const m of this.ctx.scene.meshes) {
        if (m.renderingGroupId === 1 && m.isVisible) {
          m.isVisible = false;
          this.hiddenOverlay.push(m);
        }
      }
    } else if (this.hiddenOverlay.length) {
      for (const m of this.hiddenOverlay) if (!m.isDisposed()) m.isVisible = true;
      this.hiddenOverlay.length = 0;
    }
  }

  /** Mirror the HUD's pause state onto audio and Babylon animations; keep hold mode frozen. */
  private syncPause(): void {
    const c = this.ctx;
    const menuOpen = c.hud.menuOpen;
    // the HUD restores time.scale ≥ 1 when its menu closes; hold mode stays frozen
    if (this.hold && !menuOpen && (this.menuWasOpen || c.time.scale !== 0)) c.time.scale = 0;
    this.menuWasOpen = menuOpen;
    const paused = c.time.scale === 0 && menuOpen;
    if (paused === this.paused) return;
    this.paused = paused;
    this.applyMasterVolume();
    c.scene.animationTimeScale = paused ? 0 : 1;
  }

  /** The settings' master volume, ducked while paused. The single place the loop sets it. */
  private applyMasterVolume(): void {
    const c = this.ctx;
    const v = c.settings.data.masterVolume;
    const master = typeof v === "number" && Number.isFinite(v) ? v : 0.8;
    c.audio.setMasterVolume(this.paused ? master * this.opts.pausedVolume : master);
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
