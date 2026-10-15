import * as THREE from 'three';

/**
 * A game system. Hooks are called in ascending `priority` order.
 *  - fixedUpdate(dt): deterministic simulation at a fixed 60 Hz (physics, gameplay, AI).
 *  - update(dt, alpha): once per rendered frame, before rendering (visual interpolation, animation, camera).
 *    alpha in [0,1) is the interpolation factor between the previous and current fixed tick.
 *  - lateUpdate(dt): after update, before render (UI, audio listener).
 */
export interface System {
  name: string;
  priority?: number;
  fixedUpdate?(dt: number): void;
  update?(dt: number, alpha: number): void;
  lateUpdate?(dt: number): void;
}

/** Suggested priorities (lower runs first). */
export const Priority = {
  Input: 0,
  Match: 5,
  AI: 10,
  Player: 15,
  Characters: 20,
  Vehicles: 25,
  Combat: 30,
  Physics: 40,
  PostPhysics: 45,
  Zone: 50,
  World: 60,
  Animation: 70,
  Camera: 80,
  FX: 85,
  Audio: 90,
  UI: 100,
} as const;

export type RenderFn = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, dt: number) => void;

export interface FrameStats {
  fps: number;
  frameMs: number;
  simMs: number;
  renderMs: number;
  drawCalls: number;
  triangles: number;
  ticks: number;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  readonly fixedDt = 1 / 60;
  /** Simulation time (seconds, advanced by fixed ticks, respects pause/timeScale). */
  simTime = 0;
  /** Real time since start (seconds). */
  realTime = 0;
  frame = 0;
  tick = 0;
  timeScale = 1;
  paused = false;
  renderScale = 1;
  readonly stats: FrameStats = { fps: 0, frameMs: 0, simMs: 0, renderMs: 0, drawCalls: 0, triangles: 0, ticks: 0 };

  private systems: System[] = [];
  private accumulator = 0;
  private lastTime = -1;
  private running = false;
  private renderFn: RenderFn;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private beforeTickHooks: (() => void)[] = [];
  private resizeHooks: ((w: number, h: number) => void)[] = [];
  /** Optional frame limiter (0 = unlimited / vsync). */
  maxFps = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // AA handled in post (SMAA) — also faster.
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      logarithmicDepthBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;
    this.camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.05, 4000);
    this.scene.add(this.camera);
    this.renderFn = (r, s, c) => r.render(s, c);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  addSystem(sys: System): void {
    this.systems.push(sys);
    this.systems.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
  }

  removeSystem(sys: System): void {
    this.systems = this.systems.filter((s) => s !== sys);
  }

  getSystem<T extends System>(name: string): T | undefined {
    return this.systems.find((s) => s.name === name) as T | undefined;
  }

  /** Replace the render function (post-processing pipeline installs itself here). */
  setRenderFn(fn: RenderFn): void {
    this.renderFn = fn;
  }

  /** Called before every fixed tick (input latching). */
  onBeforeTick(fn: () => void): void {
    this.beforeTickHooks.push(fn);
  }

  onResize(fn: (w: number, h: number) => void): void {
    this.resizeHooks.push(fn);
  }

  setRenderScale(s: number): void {
    this.renderScale = s;
    this.resize();
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.renderScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    for (const fn of this.resizeHooks) fn(w, h);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = -1;
    const loop = (t: number) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      this.frameStep(t / 1000);
    };
    requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
  }

  /** Advance one rendered frame. Exposed for automated tests (manual stepping). */
  frameStep(now: number): void {
    if (this.lastTime < 0) this.lastTime = now;
    let dt = now - this.lastTime;
    if (this.maxFps > 0 && dt < 1 / this.maxFps - 0.001) return;
    this.lastTime = now;
    dt = Math.min(dt, 0.1); // avoid spiral of death after tab switch
    this.realTime += dt;
    this.frame++;

    const t0 = performance.now();
    let ticks = 0;
    if (!this.paused) {
      this.accumulator += dt * this.timeScale;
      const maxTicks = 6;
      while (this.accumulator >= this.fixedDt && ticks < maxTicks) {
        for (const h of this.beforeTickHooks) h();
        for (const s of this.systems) s.fixedUpdate?.(this.fixedDt);
        this.accumulator -= this.fixedDt;
        this.simTime += this.fixedDt;
        this.tick++;
        ticks++;
      }
      if (ticks === maxTicks) this.accumulator = 0;
    }
    const alpha = this.paused ? 1 : this.accumulator / this.fixedDt;
    const vdt = this.paused ? 0 : dt * this.timeScale;
    for (const s of this.systems) s.update?.(vdt, alpha);
    for (const s of this.systems) s.lateUpdate?.(vdt);
    const t1 = performance.now();

    this.renderer.info.reset();
    this.renderFn(this.renderer, this.scene, this.camera, dt);
    const t2 = performance.now();

    this.stats.simMs = t1 - t0;
    this.stats.renderMs = t2 - t1;
    this.stats.frameMs = dt * 1000;
    this.stats.ticks = ticks;
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.stats.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
  }
}
