// Renderer, cameras, post-processing and the main loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { setMaxAnisotropy } from './textures.js';
import { updateTweens, tweensActive } from './tween.js';
import { LightPool } from './lightpool.js';

export const LAYER_WORLD = 0;
export const LAYER_VIEWMODEL = 1;
export const LAYER_AVATAR = 2;

export const QUALITY = {
  low: { pixelRatio: 0.85, samples: 0, bloom: false, ao: false, shadowSize: 1024, outline: true, softShadows: false, itemLights: 4 },
  medium: { pixelRatio: 1.25, samples: 4, bloom: true, ao: false, shadowSize: 2048, outline: true, softShadows: true, itemLights: 6 },
  high: { pixelRatio: 2, samples: 4, bloom: true, ao: true, shadowSize: 2048, outline: true, softShadows: true, itemLights: 8 },
};

export class Engine {
  constructor(container) {
    this.container = container;
    this.updaters = [];
    this.time = 0;
    this.frame = 0;
    this.fps = 60;
    this.qualityName = 'medium';

    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Shadows are refreshed a few times per second (or every frame while things move)
    renderer.shadowMap.autoUpdate = false;
    this.shadowT = 0;
    this.shadowBusy = () => false;
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);
    renderer.domElement.id = 'game-canvas';
    setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

    this.scene = new THREE.Scene();
    this.scene.background = null;

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.03, 900);
    this.camera.layers.set(LAYER_WORLD);
    this.scene.add(this.camera);

    // The view-model camera renders held items on top of everything else so
    // they never clip into walls.
    this.vmCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 10);
    this.vmCamera.layers.set(LAYER_VIEWMODEL);
    this.camera.add(this.vmCamera);

    this.setQuality(this.qualityName);
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(name) {
    this.qualityName = name;
    const q = (this.quality = QUALITY[name] || QUALITY.medium);
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    r.shadowMap.type = q.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    r.shadowMap.needsUpdate = true;
    this.scene.traverse((o) => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); } });
    LightPool.init(this.scene, q.itemLights);
    this._buildComposer();
    this.onQualityChange?.(q);
  }

  _buildComposer() {
    const r = this.renderer;
    const w = window.innerWidth, h = window.innerHeight;
    const q = this.quality;
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); }
    const pr = r.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: q.samples });
    const composer = (this.composer = new EffectComposer(r, rt));
    composer.setPixelRatio(pr);
    composer.setSize(w, h);

    this.renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(this.renderPass);

    if (q.ao) {
      this.aoPass = new GTAOPass(this.scene, this.camera, w, h);
      this.aoPass.output = GTAOPass.OUTPUT.Default;
      this.aoPass.blendIntensity = 0.75;
      this.aoPass.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1 });
      composer.addPass(this.aoPass);
    } else this.aoPass = null;

    const vm = new RenderPass(this.scene, this.vmCamera);
    vm.clear = false; vm.clearDepth = true;
    composer.addPass(vm);

    this.outlinePass = new OutlinePass(new THREE.Vector2(w, h), this.scene, this.camera);
    Object.assign(this.outlinePass, { edgeStrength: 2.2, edgeGlow: 0.0, edgeThickness: 1.0, pulsePeriod: 0 });
    this.outlinePass.visibleEdgeColor.set('#ffffff');
    this.outlinePass.hiddenEdgeColor.set('#000000');
    this.outlinePass.enabled = q.outline;
    composer.addPass(this.outlinePass);

    if (q.bloom) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.55, 0.92);
      composer.addPass(this.bloomPass);
    } else this.bloomPass = null;

    composer.addPass(new OutputPass());
    // cheap anti-aliasing when MSAA is off
    if (!q.samples) {
      this.fxaa = new ShaderPass(FXAAShader);
      this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
      composer.addPass(this.fxaa);
    } else this.fxaa = null;
  }

  setOutline(objects) {
    if (!this.outlinePass) return;
    this.outlinePass.selectedObjects = objects || [];
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h; this.vmCamera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.aoPass?.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.fxaa?.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
  }

  onUpdate(fn, order = 0) {
    this.updaters.push({ fn, order });
    this.updaters.sort((a, b) => a.order - b.order);
    return () => { this.updaters = this.updaters.filter((u) => u.fn !== fn); };
  }

  start() {
    let last = performance.now();
    let acc = 0, frames = 0;
    const loop = (now) => {
      requestAnimationFrame(loop);
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.1) dt = 0.1;
      this.time += dt; this.frame++;
      acc += dt; frames++;
      if (acc > 0.5) { this.fps = frames / acc; acc = 0; frames = 0; }
      updateTweens(dt);
      for (const u of this.updaters) {
        try { u.fn(dt, this.time); } catch (e) { console.error(e); }
      }
      LightPool.update(this.camera);
      this.shadowT += dt;
      if (this.shadowT > 0.2 || tweensActive() || this.shadowBusy()) { this.shadowT = 0; this.renderer.shadowMap.needsUpdate = true; }
      this.composer.render(dt);
    };
    requestAnimationFrame(loop);
  }
}

// Lights must be visible to every layer so held items and the mirror avatar are lit.
export function allLayers(obj) { obj.layers.enableAll(); return obj; }
