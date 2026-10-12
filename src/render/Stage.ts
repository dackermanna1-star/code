// Renderer, 4:3 game viewport, gameplay camera and frame loop.
//
// The original was a fixed 640x480 screen. We keep a fixed 4:3 frame
// (pillar/letter-boxed to the window) and a fixed near-orthographic camera so
// the composition matches the reference frames.
import * as THREE from 'three';
import { CAMERA_PITCH_DEG } from '../config/constants';

/** Layer enabled on meshes that should mirror in the ice (characters, corpses, effects). */
export const REFLECT_LAYER = 2;

/** Logical design size of the 4:3 frame (original resolution). */
export const DESIGN_W = 640;
export const DESIGN_H = 480;

/** Vertical field of view of the gameplay camera (degrees). */
export const CAMERA_FOV = 11;
/** Ground point under the centre of the frame. */
export const CAMERA_TARGET = new THREE.Vector3(0, 0, -7.4);
/** Distance from target, chosen so the visible width at the target is 40 m. */
export const CAMERA_DISTANCE = 20 / ((4 / 3) * Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180));

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

  constructor(host: HTMLElement) {
    this.view = document.createElement('div');
    this.view.id = 'game-view';
    host.appendChild(this.view);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'game-canvas';
    this.view.appendChild(this.canvas);

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, DESIGN_W / DESIGN_H, 20, 900);
    const pitch = (CAMERA_PITCH_DEG * Math.PI) / 180;
    this.camera.position.set(
      CAMERA_TARGET.x,
      CAMERA_TARGET.y + Math.sin(pitch) * CAMERA_DISTANCE,
      CAMERA_TARGET.z + Math.cos(pitch) * CAMERA_DISTANCE,
    );
    this.camera.lookAt(CAMERA_TARGET);
    this.camera.layers.enable(REFLECT_LAYER);
    this.camera.updateMatrixWorld();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    const k = Math.min(ww / DESIGN_W, wh / DESIGN_H);
    this.viewW = Math.floor(DESIGN_W * k);
    this.viewH = Math.floor(DESIGN_H * k);
    this.scale = this.viewW / DESIGN_W;
    Object.assign(this.view.style, {
      width: `${this.viewW}px`,
      height: `${this.viewH}px`,
      left: `${Math.floor((ww - this.viewW) / 2)}px`,
      top: `${Math.floor((wh - this.viewH) / 2)}px`,
    });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.viewW, this.viewH);
    this.view.style.setProperty('--k', String(this.scale));
    for (const h of this.resizeHooks) h(this.viewW, this.viewH);
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

  /** Project a world point to CSS px inside the game view. */
  project(p: THREE.Vector3, out = { x: 0, y: 0 }): { x: number; y: number } {
    const v = _v.copy(p).project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.viewW;
    out.y = (-v.y * 0.5 + 0.5) * this.viewH;
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
    if (this.renderFn) this.renderFn();
    else this.renderer.render(this.scene, this.camera);
    for (const f of this.postRender) f(dt, this.time);
  }

  /** Fast-forward `seconds` of game time without drawing (testing aid). */
  fastForward(seconds: number, step = 1 / 30): void {
    const n = Math.ceil(seconds / step);
    for (let i = 0; i < n; i++) this.frame(step, i % 10 === 9);
  }
}

const _v = new THREE.Vector3();
