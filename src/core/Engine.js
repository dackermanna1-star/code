// Engine: renderer, scene, camera, frame loop and the render pipeline.
import * as THREE from 'three';
import { createNoiseTextures, shared } from '../render/shaderlib.js';
import { World } from '../world/World.js';
import { Post } from '../render/Post.js';
import { Player } from '../player/Player.js';
import { Body } from '../player/Body.js';
import { captureEnvironment, applyEnvironment } from '../render/envCapture.js';
import { Ambient } from '../world/ambient.js';
import { Debris } from '../world/debris.js';
import { Passerby } from '../world/passerby.js';
import { SprayTool } from '../spray/SprayTool.js';
import { Viewmodel } from '../spray/Viewmodel.js';
import { Soundscape } from './soundscape.js';
import { paintFacades } from '../textures/paintFacades.js';
import PaintWorker from '../textures/paintWorker.js?worker&inline';
import { LAYER_REFLECT } from '../world/units.js';

export class Engine {
  constructor(canvas, params) {
    this.canvas = canvas;
    this.params = params;
    this.timer = new THREE.Timer();
    this.time = params.t ?? 0;
    this.frameHooks = [];
    this.renderScale = 1;
    this.perf = { acc: 0, n: 0, since: 0, lastAdjust: 0 };
    this.paintFacades = params.nopaint ? null : (atlas, facades, fixtures) => paintFacades(atlas, facades, fixtures, { workerFactory: params.noworkers ? null : () => new PaintWorker() });
  }

  async init(progress = () => {}) {
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: !!this.params.shot,
    });
    this.renderer = renderer;
    // quality: explicit ?q=, otherwise guess from the GPU and device class
    if (!this.params.quality || this.params.quality === 'auto') {
      let q = 'high';
      try {
        const gl = renderer.getContext();
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        const name = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
        if (/Intel(?!.*Arc)|UHD|Iris|Mali|Adreno|PowerVR|Apple GPU|SwiftShader|llvmpipe/i.test(name)) q = 'medium';
        this.gpuName = name;
      } catch {
        /* ignore */
      }
      const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (matchMedia?.('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820);
      if (mobile) q = 'low';
      this.params.quality = q;
    }
    const dprCap = { high: 1.5, medium: 1.0, low: 0.85 }[this.params.quality] ?? 1.25;
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, this.params.dpr ?? dprCap);
    this.pixelRatio = this.basePixelRatio;
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.04, 700);
    this.camera.position.set(0, 1.62, 0);
    this.camera.layers.enable(LAYER_REFLECT);
    this.scene.add(this.camera);

    createNoiseTextures();
    this.sound = new Soundscape(this);
    this.world = new World(this);
    await this.world.build(progress);

    this.player = new Player(this);
    this.body = new Body(this);

    // static shadows + one-time environment capture for image-based specular
    this.bakeShadows();
    this.body.group.visible = false;
    this.envMap = captureEnvironment(renderer, this.scene);
    this.body.group.visible = true;
    applyEnvironment(this.scene, this.envMap, 1.0);
    progress(0.85);
    this.post = new Post(this, { quality: this.params.quality, exposure: this.params.exposure });
    this.post.init([...this.world.lamps, ...(this.world.extraFogLights ?? [])]);
    this.post.preHooks.push((r, s, c) => {
      // reflections are blurred: skip the facade relief ray-march in that pass
      const relief = this.world.facadeMaterial.userData.uniforms.uReliefOn;
      const prev = relief.value;
      relief.value = 0;
      this.world.ground.reflection.render(r, s, c);
      relief.value = prev;
    });
    this.ambient = new Ambient(this).build();
    this.debris = new Debris(this, this.world.props.material).build();
    this.passerby = new Passerby(this).build();
    this.spray = await new SprayTool(this).init();
    try {
      this.spray.attachViewmodel(new Viewmodel(this));
    } catch (e) {
      console.warn('viewmodel failed', e);
    }
    this.onStart = () => this.sound.start();
    this.onPause = () => this.sound.setPaused(true);
    this.onResume = () => this.sound.setPaused(false);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    if (this.params.quality === 'low') this.world.facadeMaterial.userData.uniforms.uReliefOn.value = 0;
    progress(1);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.pixelRatio = this.basePixelRatio * this.renderScale;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.post) this.post.setSize(w, h, this.pixelRatio);
    this.world?.ground?.reflection.setSize(w * this.pixelRatio, h * this.pixelRatio);
  }

  /**
   * Renders every shadow map once (the world never moves). Lights then only
   * re-render on request (refreshShadow), e.g. while someone walks through one.
   */
  bakeShadows() {
    this.scene.traverse((o) => {
      if (!o.isLight || !o.shadow) return;
      o.shadow.autoUpdate = false;
      o.shadow.needsUpdate = true;
    });
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Re-render one light's shadow map on the next frame. */
  refreshShadow(light) {
    light.shadow.needsUpdate = true;
    this.renderer.shadowMap.needsUpdate = true;
  }

  start() {
    const loop = (ts) => {
      this.raf = requestAnimationFrame(loop);
      this.timer.update(ts);
      const raw = this.timer.getDelta();
      this.adaptResolution(raw);
      const dt = Math.min(0.05, raw);
      this.step(dt);
    };
    requestAnimationFrame(loop);
  }

  /** Dynamic resolution: keep frame time near the target by scaling the render resolution. */
  adaptResolution(frameTime) {
    if (this.params.fixedRes || !this.post) return;
    const p = this.perf;
    if (frameTime <= 0 || frameTime > 0.25) return; // ignore stalls (tab switches, shader compiles)
    p.acc += frameTime;
    p.n++;
    p.since += frameTime;
    if (p.since < 1.25) return;
    const avg = p.acc / p.n;
    p.acc = p.n = p.since = 0;
    const now = this.time;
    let next = this.renderScale;
    if (avg > 1 / 48 && this.renderScale > 0.5) next = Math.max(0.5, this.renderScale - (avg > 1 / 30 ? 0.15 : 0.08));
    else if (avg < 1 / 72 && this.renderScale < 1 && now - p.lastAdjust > 4) next = Math.min(1, this.renderScale + 0.05);
    if (next !== this.renderScale) {
      this.renderScale = next;
      p.lastAdjust = now;
      this.resize();
    }
  }

  step(dt) {
    this.frames = (this.frames ?? 0) + 1;
    this.time += dt;
    shared.uTime.value = this.time;
    shared.uFrame.value = (shared.uFrame.value + 1) % 65536;
    if (!this.params.shot || this.params.walk) {
      this.player.update(dt);
      this.body.update(dt, this.player);
      this.updateCapsuleLights();
    }
    this.spray?.update(dt);
    for (const h of this.frameHooks) h(dt, this.time);
    this.world.update(dt, this.time);
    this.ambient?.update(dt, this.time);
    this.debris?.update(dt, this.time);
    this.passerby?.update(dt, this.time);
    this.sound?.update(dt, this.time);
    this.render(dt);
  }

  /** Pick the lamps that most strongly light the player for her soft capsule shadow. */
  updateCapsuleLights() {
    const p = this.player.pos;
    const cands = [];
    for (const l of this.world.lamps) {
      const L = l.light;
      const d2 = L.position.distanceToSquared(p) + 0.5;
      const e = (L.intensity / d2) * (L.distance ? Math.max(0, 1 - Math.sqrt(d2) / L.distance) : 1);
      cands.push({ L, e });
    }
    cands.sort((a, b) => b.e - a.e);
    const arr = shared.uCapsuleLights.value;
    for (let i = 0; i < 3; i++) {
      const c = cands[i];
      if (!c || c.e < 0.012) {
        arr[i].set(0, 0, 0, 0);
        continue;
      }
      arr[i].set(c.L.position.x, c.L.position.y, c.L.position.z, Math.min(0.75, c.e * 4.0));
    }
  }

  render(dt) {
    if (this.post) this.post.render(this.scene, this.camera, dt, this.time);
    else {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = this.params.exposure ?? 2.5;
      this.renderer.render(this.scene, this.camera);
    }
  }
}
