// Engine: renderer, scene, camera, frame loop and the render pipeline.
import * as THREE from 'three';
import { createNoiseTextures, shared } from '../render/shaderlib.js';
import { World } from '../world/World.js';
import { Post } from '../render/Post.js';
import { Player } from '../player/Player.js';
import { Body } from '../player/Body.js';
import { captureEnvironment, applyEnvironment } from '../render/envCapture.js';
import { LAYER_REFLECT } from '../world/units.js';

export class Engine {
  constructor(canvas, params) {
    this.canvas = canvas;
    this.params = params;
    this.timer = new THREE.Timer();
    this.time = params.t ?? 0;
    this.frameHooks = [];
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
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.params.dpr ?? 1.5);
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
    this.world = new World(this);
    await this.world.build(progress);

    this.player = new Player(this);
    this.body = new Body(this);

    // static shadows + one-time environment capture for image-based specular
    renderer.shadowMap.needsUpdate = true;
    this.body.group.visible = false;
    this.envMap = captureEnvironment(renderer, this.scene);
    this.body.group.visible = true;
    applyEnvironment(this.scene, this.envMap, 1.0);
    this.post = new Post(this, { quality: this.params.quality, exposure: this.params.exposure });
    this.post.init(this.world.lamps);
    this.post.preHooks.push((r, s, c) => this.world.ground.reflection.render(r, s, c));

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.post) this.post.setSize(w, h, this.pixelRatio);
    this.world?.ground?.reflection.setSize(w * this.pixelRatio, h * this.pixelRatio);
  }

  /** Renders static shadow maps once (the world never moves). */
  bakeShadows() {
    this.renderer.shadowMap.needsUpdate = true;
  }

  start() {
    const loop = (ts) => {
      this.raf = requestAnimationFrame(loop);
      this.timer.update(ts);
      const dt = Math.min(0.05, this.timer.getDelta());
      this.step(dt);
    };
    requestAnimationFrame(loop);
  }

  step(dt) {
    this.time += dt;
    shared.uTime.value = this.time;
    if (!this.params.shot || this.params.walk) {
      this.player.update(dt);
      this.body.update(dt, this.player);
      this.updateCapsuleLights();
    }
    for (const h of this.frameHooks) h(dt, this.time);
    this.world.update(dt, this.time);
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
      if (!c || c.e < 0.15) {
        arr[i].set(0, 0, 0, 0);
        continue;
      }
      arr[i].set(c.L.position.x, c.L.position.y, c.L.position.z, Math.min(0.75, c.e * 0.35));
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
