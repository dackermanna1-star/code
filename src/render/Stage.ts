// Renderer, 4:3 game viewport, gameplay camera and frame loop.
//
// The original was a fixed 640x480 screen. We keep a fixed 4:3 frame
// (pillar/letter-boxed to the window) and a fixed near-orthographic camera so
// the composition matches the reference frames.
//
// First-person mode reuses the same camera object with first-person
// parameters (wide fov, near/far for eye level), fills the whole window, and
// is posed every frame by the game view (poseFirstPerson).
import * as THREE from 'three';
import { CAMERA_PITCH_DEG } from '../config/constants';
import { CAMERA_DISTANCE, CAMERA_FOV, CAMERA_TARGET as TARGET, DESIGN_H, DESIGN_W } from '../config/view';
import { FP, type ViewMode } from '../config/firstPerson';

export { CAMERA_DISTANCE, CAMERA_FOV, DESIGN_H, DESIGN_W };

/** Layer enabled on meshes that should mirror in the ice (characters, corpses, effects). */
export const REFLECT_LAYER = 2;

/** Result of Stage.project: CSS px in the view, plus where the point lies relative to the camera. */
export interface ProjectedPoint {
  x: number;
  y: number;
  /** True when the point is behind the camera (x/y are then meaningless; cull it). */
  behind?: boolean;
  /** Distance in front of the camera along its view axis, m. */
  depth?: number;
}

/** Ground point under the centre of the frame. */
export const CAMERA_TARGET = new THREE.Vector3(TARGET.x, TARGET.y, TARGET.z);

export type FrameHook = (dt: number, time: number) => void;

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** Element sized to the 4:3 frame; canvas and overlays live inside. */
  readonly view: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  /** Current frame size in CSS pixels. */
  viewW = DESIGN_W;
  viewH = DESIGN_H;
  /** CSS px per design px. */
  scale = 1;
  pixelRatio = 1;
  private preRender: FrameHook[] = [];
  private postRender: FrameHook[] = [];
  private update: FrameHook[] = [];
  private resizeHooks: Array<(w: number, h: number) => void> = [];
  private last = 0;
  private time = 0;
  private running = false;
  /** Optional custom render function (post-processing). */
  renderFn: (() => void) | null = null;
  /** Upper bound on device pixel ratio (quality setting). */
  maxPixelRatio = 2;
  /** 'third' = the classic fixed 4:3 camera; 'first' = first-person (fills the window). */
  viewMode: ViewMode = 'third';
  private viewModeHooks: Array<(mode: ViewMode) => void> = [];
  private mainHooksBefore: FrameHook[] = [];
  private mainHooksAfter: FrameHook[] = [];

  constructor(host: HTMLElement) {
    this.view = document.createElement('div');
    this.view.id = 'game-view';
    host.appendChild(this.view);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'game-canvas';
    this.view.appendChild(this.canvas);

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, DESIGN_W / DESIGN_H, 20, 900);
    this.setupClassicCamera();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** The fixed 32-degree gameplay camera of the classic view. */
  private setupClassicCamera(): void {
    const cam = this.camera;
    cam.fov = CAMERA_FOV;
    cam.near = 20;
    cam.far = 900;
    cam.aspect = DESIGN_W / DESIGN_H;
    cam.up.set(0, 1, 0);
    const pitch = (CAMERA_PITCH_DEG * Math.PI) / 180;
    cam.position.set(
      CAMERA_TARGET.x,
      CAMERA_TARGET.y + Math.sin(pitch) * CAMERA_DISTANCE,
      CAMERA_TARGET.z + Math.cos(pitch) * CAMERA_DISTANCE,
    );
    cam.rotation.order = 'XYZ';
    cam.lookAt(CAMERA_TARGET);
    cam.layers.set(0);
    cam.layers.enable(REFLECT_LAYER);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** First-person lens; the pose comes from poseFirstPerson() every frame. */
  private setupFirstPersonCamera(): void {
    const cam = this.camera;
    cam.fov = FP.fovDeg;
    cam.near = FP.near;
    cam.far = FP.far;
    cam.aspect = this.viewW / Math.max(1, this.viewH);
    cam.rotation.order = 'YXZ';
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  resize(): void {
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    const k = Math.min(ww / DESIGN_W, wh / DESIGN_H);
    if (this.viewMode === 'first') {
      // First person fills the window; UI scale stays the 4:3 fit.
      this.viewW = Math.max(1, ww);
      this.viewH = Math.max(1, wh);
      this.scale = k;
      Object.assign(this.view.style, { width: `${this.viewW}px`, height: `${this.viewH}px`, left: '0px', top: '0px' });
    } else {
      this.viewW = Math.floor(DESIGN_W * k);
      this.viewH = Math.floor(DESIGN_H * k);
      this.scale = this.viewW / DESIGN_W;
      Object.assign(this.view.style, {
        width: `${this.viewW}px`,
        height: `${this.viewH}px`,
        left: `${Math.floor((ww - this.viewW) / 2)}px`,
        top: `${Math.floor((wh - this.viewH) / 2)}px`,
      });
    }
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.viewW, this.viewH);
    if (this.viewMode === 'first') {
      this.camera.aspect = this.viewW / this.viewH;
      this.camera.updateProjectionMatrix();
    }
    this.view.style.setProperty('--k', String(this.scale));
    this.view.style.setProperty('--vw', `${this.viewW}px`);
    this.view.style.setProperty('--vh', `${this.viewH}px`);
    this.view.dataset.view = this.viewMode;
    for (const h of this.resizeHooks) h(this.viewW, this.viewH);
  }

  /** Switch camera mode. Listeners (environment, game view) are notified. */
  setViewMode(mode: ViewMode): void {
    if (mode === this.viewMode) return;
    this.viewMode = mode;
    if (mode === 'first') this.setupFirstPersonCamera();
    else this.setupClassicCamera();
    this.resize();
    for (const h of this.viewModeHooks) h(mode);
  }

  /**
   * Pose the first-person camera: eye position (world), yaw/pitch in the
   * config/firstPerson.ts convention, optional roll (rad, + = clockwise on screen).
   * Ignored in the classic view.
   */
  poseFirstPerson(x: number, y: number, z: number, yaw: number, pitch: number, roll = 0): void {
    if (this.viewMode !== 'first') return;
    const cam = this.camera;
    cam.position.set(x, y, z);
    // three.js cameras look down -Z; yaw 0 must look down -X: rotate by yaw + 90 deg.
    cam.rotation.set(pitch, yaw + Math.PI / 2, -roll, 'YXZ');
    cam.updateMatrixWorld();
  }

  /** Called whenever the view mode changes (not called for the initial 'third'). */
  onViewMode(fn: (mode: ViewMode) => void): void {
    this.viewModeHooks.push(fn);
  }

  onResize(fn: (w: number, h: number) => void): void {
    this.resizeHooks.push(fn);
    fn(this.viewW, this.viewH);
  }

  /** Called every frame before rendering (game update). */
  onUpdate(fn: FrameHook): void {
    this.update.push(fn);
  }
  /** Called right before the main render (offscreen passes: reflections, backdrop). */
  onPreRender(fn: FrameHook): void {
    this.preRender.push(fn);
  }
  onPostRender(fn: FrameHook): void {
    this.postRender.push(fn);
  }
  /** Called after every onPreRender pass, immediately before the main scene render. */
  onBeforeMainRender(fn: FrameHook): void {
    this.mainHooksBefore.push(fn);
  }
  /** Called immediately after the main scene render (overlay passes such as the first-person viewmodel). */
  onAfterMainRender(fn: FrameHook): void {
    this.mainHooksAfter.push(fn);
  }

  /**
   * Project a world point to CSS px inside the game view. `out.behind` is set
   * when the point lies behind the camera (first person) and `out.depth` to
   * its distance along the view axis.
   */
  project<T extends ProjectedPoint>(p: THREE.Vector3, out: T = { x: 0, y: 0 } as T): T {
    const cam = this.camera;
    const depth = -_v.copy(p).applyMatrix4(cam.matrixWorldInverse).z;
    const v = _v.copy(p).project(cam);
    out.x = (v.x * 0.5 + 0.5) * this.viewW;
    out.y = (-v.y * 0.5 + 0.5) * this.viewH;
    out.behind = depth <= cam.near * 0.5;
    out.depth = depth;
    return out;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
  }

  /** Advance one frame (also used by tests to step deterministically). */
  frame(dt: number, render = true): void {
    this.time += dt;
    for (const f of this.update) f(dt, this.time);
    if (!render) return;
    for (const f of this.preRender) f(dt, this.time);
    for (const f of this.mainHooksBefore) f(dt, this.time);
    if (this.renderFn) this.renderFn();
    else this.renderer.render(this.scene, this.camera);
    for (const f of this.mainHooksAfter) f(dt, this.time);
    for (const f of this.postRender) f(dt, this.time);
  }

  /** Fast-forward `seconds` of game time without drawing (testing aid). */
  fastForward(seconds: number, step = 1 / 30): void {
    const n = Math.ceil(seconds / step);
    for (let i = 0; i < n; i++) this.frame(step, i % 10 === 9);
  }
}

const _v = new THREE.Vector3();
