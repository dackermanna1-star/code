import * as THREE from 'three';
import { PostFX, PostSettings } from '../render/PostFX';
import { Tweens } from './Tween';

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityPreset extends PostSettings {
  level: QualityLevel;
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  softShadows: boolean;
  particles: number; // multiplier
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  low: {
    level: 'low', pixelRatio: 0.8, shadows: true, shadowMapSize: 1024, softShadows: false,
    ao: false, aoHalfRes: true, bloom: true, smaa: false, heatHaze: false, dof: false, particles: 0.5,
  },
  medium: {
    level: 'medium', pixelRatio: 1, shadows: true, shadowMapSize: 2048, softShadows: true,
    ao: 'Performance', aoHalfRes: true, bloom: true, smaa: true, heatHaze: true, dof: false, particles: 0.8,
  },
  high: {
    level: 'high', pixelRatio: 1.5, shadows: true, shadowMapSize: 2048, softShadows: true,
    ao: 'Medium', aoHalfRes: true, bloom: true, smaa: true, heatHaze: true, dof: true, particles: 1,
  },
  ultra: {
    level: 'ultra', pixelRatio: 2, shadows: true, shadowMapSize: 4096, softShadows: true,
    ao: 'High', aoHalfRes: false, bloom: true, smaa: true, heatHaze: true, dof: true, particles: 1.2,
  },
};

type Updater = (dt: number, time: number) => void;

/**
 * Owns the renderer, scene, main camera, post-processing chain and the
 * main loop. Game systems register update callbacks with a priority.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly post: PostFX;
  readonly tweens = new Tweens();
  /** UI tweens keep running while the game is paused. */
  readonly uiTweens = new Tweens();
  quality: QualityPreset;
  time = 0;
  timeScale = 1;
  paused = false;
  width = 1;
  height = 1;
  fps = 60;
  private updaters: { fn: Updater; prio: number; always: boolean }[] = [];
  private last = 0;
  private frameTimes: number[] = [];
  private dynamicScale = 1;
  autoQuality = true;
  /** When set, every frame advances by this many seconds (deterministic tests). */
  fixedStep: number | null = null;
  private lowFpsTime = 0;
  private highFpsTime = 0;

  constructor(readonly canvas: HTMLCanvasElement, level: QualityLevel) {
    this.quality = { ...QUALITY[level] };
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping; // handled by post
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x16110e, 1);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 250);
    this.scene.add(this.camera);

    this.post = new PostFX(this.renderer, this.scene, this.camera, this.quality);
    this.applyQuality(level);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  applyQuality(level: QualityLevel): void {
    this.quality = { ...QUALITY[level] };
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.needsUpdate = true;
    this.post.apply(this.quality);
    this.dynamicScale = 1;
    this.resize();
    // Shadow map size is applied by the lighting system (listens on quality).
    this.onQualityChange?.(this.quality);
  }

  onQualityChange?: (q: QualityPreset) => void;

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    const pr = Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio) * this.dynamicScale;
    this.renderer.setPixelRatio(Math.max(0.5, pr));
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.post.setSize(w, h);
    void buf;
  }

  /** Register a per-frame callback. Lower priority runs first. `always` runs even while paused. */
  onUpdate(fn: Updater, prio = 0, always = false): () => void {
    const entry = { fn, prio, always };
    this.updaters.push(entry);
    this.updaters.sort((a, b) => a.prio - b.prio);
    return () => {
      const i = this.updaters.indexOf(entry);
      if (i >= 0) this.updaters.splice(i, 1);
    };
  }

  start(): void {
    this.last = performance.now();
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  private frame(now: number): void {
    const rawDt = this.fixedStep ?? Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.trackPerformance(rawDt);
    const dt = this.paused ? 0 : rawDt * this.timeScale;
    this.time += dt;
    this.uiTweens.update(rawDt);
    if (!this.paused) this.tweens.update(dt);
    for (const u of this.updaters) {
      if (this.paused && !u.always) continue;
      u.fn(u.always ? rawDt : dt, this.time);
    }
    this.post.render(rawDt);
  }

  private trackPerformance(dt: number): void {
    if (dt <= 0) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.fps = 1 / avg;
    if (!this.autoQuality || document.hidden) return;
    // Dynamic resolution: trade pixels for frame rate, smoothly.
    if (avg > 1 / 45) {
      this.lowFpsTime += dt;
      this.highFpsTime = 0;
      if (this.lowFpsTime > 1.5 && this.dynamicScale > 0.6) {
        this.dynamicScale = Math.max(0.6, this.dynamicScale - 0.1);
        this.lowFpsTime = 0;
        this.resize();
      }
    } else if (avg < 1 / 58) {
      this.highFpsTime += dt;
      this.lowFpsTime = 0;
      if (this.highFpsTime > 4 && this.dynamicScale < 1) {
        this.dynamicScale = Math.min(1, this.dynamicScale + 0.1);
        this.highFpsTime = 0;
        this.resize();
      }
    } else {
      this.lowFpsTime = 0;
      this.highFpsTime = 0;
    }
  }
}
