import * as THREE from 'three';
import { PostFX } from './postfx.js';

// Owns the WebGL renderer, the HDR scene target and post-processing. The scene is
// rendered at renderScale x the canvas resolution (dynamic resolution) and upscaled by
// the composite pass.
export class Pipeline {
  constructor(canvas, { preserveDrawingBuffer = false } = {}) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer,
    });
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 1);
    this.renderer = renderer;
    this.post = new PostFX(renderer);
    this.sceneRT = null;
    this.config = { renderScale: 1, maxPixelRatio: 1.5, msaa: 0, fxaa: true, bloomLevels: 6 };
    this.size = { outW: 0, outH: 0, sceneW: 0, sceneH: 0 };
    this.maxSamples = renderer.capabilities.maxSamples || 0;
  }

  configure(cfg) {
    Object.assign(this.config, cfg);
    this.resize(true);
  }

  setRenderScale(scale) {
    const s = Math.min(1, Math.max(0.35, scale));
    if (Math.abs(s - this.config.renderScale) < 0.02) return;
    this.config.renderScale = s;
    this.resize(true);
  }

  resize(force = false) {
    const c = this.config;
    const dpr = Math.min(window.devicePixelRatio || 1, c.maxPixelRatio);
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const outW = Math.max(1, Math.round(w * dpr));
    const outH = Math.max(1, Math.round(h * dpr));
    const sceneW = Math.max(1, Math.round(outW * c.renderScale));
    const sceneH = Math.max(1, Math.round(outH * c.renderScale));
    const s = this.size;
    if (!force && s.outW === outW && s.outH === outH && s.sceneW === sceneW && s.sceneH === sceneH) return false;
    Object.assign(s, { outW, outH, sceneW, sceneH, cssW: w, cssH: h });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    if (this.sceneRT) this.sceneRT.dispose();
    const samples = Math.min(c.msaa, this.maxSamples);
    const depthTexture = new THREE.DepthTexture(sceneW, sceneH);
    depthTexture.type = THREE.UnsignedIntType;
    this.sceneRT = new THREE.WebGLRenderTarget(sceneW, sceneH, {
      type: THREE.HalfFloatType,
      samples,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.sceneRT.texture.colorSpace = THREE.NoColorSpace;
    this.post.setSize(sceneW, sceneH, outW, outH, { fxaa: c.fxaa && samples === 0, bloomLevels: c.bloomLevels });
    return true;
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.clear(true, true, false);
    r.render(scene, camera);
    this.post.render(this.sceneRT, camera);
  }
}
