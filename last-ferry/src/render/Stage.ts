// Renderer, the fixed 16:9 game frame (letterboxed to the window), the
// gameplay camera and the frame loop.
import * as THREE from 'three';
import { CAMERA_FOV, CAMERA_PITCH_DEG, CAMERA_POS, CAMERA_TARGET, DESIGN_H, DESIGN_W } from '../config/view';

export { DESIGN_H, DESIGN_W };

/** Layer enabled on meshes that should mirror in wet planks / water (characters, corpses, effects). */
export const REFLECT_LAYER = 2;

export type FrameHook = (dt: number, time: number) => void;

export interface ProjectedPoint {
  x: number;
  y: number;
  /** True when the point is behind the camera. */
  behind?: boolean;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** Element sized to the 16:9 frame; canvas and UI layers live inside. */
  readonly view: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  /** Current frame size in CSS px. */
  viewW = DESIGN_W;
  viewH = DESIGN_H;
  /** CSS px per design px. */
  scale = 1;
  pixelRatio = 1;
  maxPixelRatio = 2;
  /** Camera offset for screen shake / punches (world units, applied every frame). */
  readonly shakeOffset = new THREE.Vector3();
  /** Optional custom render (post-processing). */
  renderFn: (() => void) | null = null;
  private preRender: FrameHook[] = [];
  private postRender: FrameHook[] = [];
  private update: FrameHook[] = [];
  private resizeHooks: Array<(w: number, h: number) => void> = [];
  private last = 0;
  private time = 0;
  private running = false;
  private readonly basePos = new THREE.Vector3(CAMERA_POS.x, CAMERA_POS.y, CAMERA_POS.z);

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

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, DESIGN_W / DESIGN_H, 5, 3000);
    this.camera.position.copy(this.basePos);
    this.camera.lookAt(CAMERA_TARGET.x, CAMERA_TARGET.y, CAMERA_TARGET.z);
    this.camera.layers.enable(REFLECT_LAYER);
    this.camera.updateMatrixWorld();
    void CAMERA_PITCH_DEG;

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
      position: 'absolute',
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
  onUpdate(fn: FrameHook): void {
    this.update.push(fn);
  }
  onPreRender(fn: FrameHook): void {
    this.preRender.push(fn);
  }
  onPostRender(fn: FrameHook): void {
    this.postRender.push(fn);
  }

  /** Project a world point to CSS px inside the game view. */
  project<T extends ProjectedPoint>(p: THREE.Vector3, out?: T): T {
    const o = (out ?? { x: 0, y: 0 }) as T;
    const v = _v.copy(p).project(this.camera);
    o.x = (v.x * 0.5 + 0.5) * this.viewW;
    o.y = (-v.y * 0.5 + 0.5) * this.viewH;
    o.behind = v.z > 1;
    return o;
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

  /** Advance one frame (tests step this deterministically). */
  frame(dt: number, render = true): void {
    this.time += dt;
    for (const f of this.update) f(dt, this.time);
    if (!render) return;
    this.camera.position.copy(this.basePos).add(this.shakeOffset);
    this.camera.updateMatrixWorld();
    for (const f of this.preRender) f(dt, this.time);
    if (this.renderFn) this.renderFn();
    else this.renderer.render(this.scene, this.camera);
    for (const f of this.postRender) f(dt, this.time);
  }

  /** Advance `seconds` without drawing (tests). */
  fastForward(seconds: number, step = 1 / 30): void {
    const n = Math.ceil(seconds / step);
    for (let i = 0; i < n; i++) this.frame(step, i % 10 === 9);
  }
}

const _v = new THREE.Vector3();
