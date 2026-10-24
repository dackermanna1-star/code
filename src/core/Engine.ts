import * as THREE from 'three';

export interface QualitySettings {
  name: 'low' | 'medium' | 'high';
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  msaa: number;
  bloom: boolean;
  maxParticles: number;
  maxDecals: number;
  lightBudget: number;
  volumetrics: boolean;
}

export const QUALITY_PRESETS: Record<QualitySettings['name'], QualitySettings> = {
  low: {
    name: 'low',
    pixelRatio: 0.75,
    shadows: false,
    shadowMapSize: 1024,
    msaa: 0,
    bloom: false,
    maxParticles: 900,
    maxDecals: 2500,
    lightBudget: 6,
    volumetrics: false,
  },
  medium: {
    name: 'medium',
    pixelRatio: 1,
    shadows: true,
    shadowMapSize: 2048,
    msaa: 0,
    bloom: true,
    maxParticles: 1800,
    maxDecals: 5000,
    lightBudget: 10,
    volumetrics: true,
  },
  high: {
    name: 'high',
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    shadows: true,
    shadowMapSize: 4096,
    msaa: 4,
    bloom: true,
    maxParticles: 3000,
    maxDecals: 8000,
    lightBudget: 14,
    volumetrics: true,
  },
};

/** Owns the renderer, the main scene and the camera. */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  quality: QualitySettings;
  width = 1;
  height = 1;
  private resizeListeners: ((w: number, h: number) => void)[] = [];

  constructor(container: HTMLElement, quality: QualitySettings) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(quality.pixelRatio);
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'game-canvas';
    this.canvas.tabIndex = 0;
    container.appendChild(this.canvas);

    this.camera = new THREE.PerspectiveCamera(80, 1, 0.04, 220);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  onResize(fn: (w: number, h: number) => void): void {
    this.resizeListeners.push(fn);
  }

  setQuality(q: QualitySettings): void {
    this.quality = q;
    this.renderer.setPixelRatio(q.pixelRatio);
    this.renderer.shadowMap.enabled = q.shadows;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      if (Array.isArray(m)) m.forEach((mm) => (mm.needsUpdate = true));
      else m.needsUpdate = true;
    });
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const l of this.resizeListeners) l(w, h);
  }
}
