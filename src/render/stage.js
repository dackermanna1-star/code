// Renderer, lighting, environment and post-processing.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { getTexture } from './textures.js';

const HORIZON = new THREE.Color(0xb4bcc4);
const ZENITH = new THREE.Color(0x6f869f);

/** Blends each frame with the previous one — a cheap, subtle motion blur. */
class MotionBlurPass extends Pass {
  constructor() {
    super();
    this.amount = 0.3;
    this.history = null;
    this.scratch = null;
    this.first = true;
    this.blend = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: { tNew: { value: null }, tOld: { value: null }, amount: { value: 0.3 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader:
          'uniform sampler2D tNew; uniform sampler2D tOld; uniform float amount; varying vec2 vUv;' +
          'void main(){ vec4 a = texture2D(tNew, vUv); vec4 b = texture2D(tOld, vUv); gl_FragColor = mix(a, b, amount); }',
        depthTest: false,
        depthWrite: false,
      })
    );
    this.copy = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: { tMap: { value: null } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform sampler2D tMap; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tMap, vUv); }',
        depthTest: false,
        depthWrite: false,
      })
    );
  }

  setSize(w, h) {
    const opts = { type: THREE.HalfFloatType, depthBuffer: false };
    if (this.history) { this.history.dispose(); this.scratch.dispose(); }
    this.history = new THREE.WebGLRenderTarget(w, h, opts);
    this.scratch = new THREE.WebGLRenderTarget(w, h, opts);
    this.first = true;
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.blend.material.uniforms;
    u.tNew.value = readBuffer.texture;
    u.tOld.value = this.first ? readBuffer.texture : this.history.texture;
    u.amount.value = this.first ? 0 : this.amount;
    this.first = false;
    renderer.setRenderTarget(this.scratch);
    this.blend.render(renderer);
    const t = this.history;
    this.history = this.scratch;
    this.scratch = t;
    this.copy.material.uniforms.tMap.value = this.history.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copy.render(renderer);
  }
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer = renderer;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    this.scene = scene;
    scene.fog = new THREE.Fog(HORIZON, 45, 260);

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.5;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 900);
    this.camera.position.set(7, 4, 9);

    // --- sky dome ----------------------------------------------------------
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { horizon: { value: HORIZON }, zenith: { value: ZENITH } },
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform vec3 horizon; uniform vec3 zenith; varying vec3 vDir;' +
          'void main(){ float h = clamp(vDir.y, 0.0, 1.0); float k = pow(h, 0.55); gl_FragColor = vec4(mix(horizon, zenith, k), 1.0); }',
      })
    );
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    scene.add(sky);
    this.sky = sky;

    // --- floor -------------------------------------------------------------
    const floorTex = getTexture('floor');
    const floorBump = getTexture('floor_bump');
    const rep = 400;
    const mat = new THREE.MeshStandardMaterial({ color: 0xa9adb1, map: floorTex.clone(), bumpMap: floorBump.clone(), bumpScale: 0.25, roughness: 0.7, metalness: 0.0, envMapIntensity: 0.5 });
    for (const t of [mat.map, mat.bumpMap]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep, rep);
      t.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
      t.needsUpdate = true;
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(rep * 2, rep * 2), mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.matrixAutoUpdate = false;
    floor.updateMatrix();
    scene.add(floor);
    this.floor = floor;

    // --- lights ------------------------------------------------------------
    const hemi = new THREE.HemisphereLight(0xdfe9f7, 0x7f7a70, 0.42);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0da, 3.1);
    this.sunDir = new THREE.Vector3(-0.5, 1.0, 0.42).normalize();
    sun.castShadow = true;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.025;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 140;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
    const fill = new THREE.DirectionalLight(0xcfdcff, 0.35);
    fill.position.set(6, 5, -8);
    scene.add(fill);

    // pooled flash light for sparks / explosions
    this.flash = new THREE.PointLight(0xffb060, 0, 30, 1.8);
    scene.add(this.flash);
    this.flashT = 0;

    // --- post-processing ---------------------------------------------------
    this.settings = { shadows: 'high', bloom: true, motionBlur: true, motionBlurAmount: 0.3, renderScale: 1 };
    this.buildComposer();
    this.setShadowQuality('high');
    this.resize();
  }

  buildComposer() {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.2, 0.55, 0.98);
    this.blurPass = new MotionBlurPass();
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.blurPass);
    this.composer.addPass(this.outputPass);
  }

  setShadowQuality(q) {
    this.settings.shadows = q;
    const sun = this.sun;
    const size = q === 'off' ? 0 : q === 'low' ? 1024 : q === 'medium' ? 2048 : 4096;
    sun.castShadow = size > 0;
    if (size > 0 && sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    this.shadowExtent = q === 'low' ? 14 : 18;
    const c = sun.shadow.camera;
    c.left = -this.shadowExtent; c.right = this.shadowExtent; c.top = this.shadowExtent; c.bottom = -this.shadowExtent;
    c.updateProjectionMatrix();
    this.renderer.shadowMap.needsUpdate = true;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 2) * this.settings.renderScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
    this.viewHeight = h * pr;
  }

  /** Brief light flash (sparks, explosions). */
  flashAt(pos, color, intensity, duration = 0.18) {
    if (intensity < this.flash.intensity * 0.8 && this.flashT > 0) return;
    this.flash.position.copy(pos);
    this.flash.position.y += 0.2;
    this.flash.color.set(color);
    this.flash.intensity = intensity;
    this.flashI = intensity;
    this.flashT = duration;
    this.flashD = duration;
  }

  /** Keep the shadow frustum centred on what the camera is looking at. */
  updateShadow(focus) {
    const sun = this.sun;
    const ext = this.shadowExtent;
    const texel = (ext * 2) / sun.shadow.mapSize.x;
    // snap to texel grid in light space to avoid shimmering
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    sun.target.position.set(fx, 0, fz);
    sun.position.set(fx, 0, fz).addScaledVector(this.sunDir, 60);
    sun.target.updateMatrixWorld();
  }

  render(dt) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / this.flashD);
      this.flash.intensity = this.flashI * k * k;
    } else this.flash.intensity = 0;
    this.sky.position.copy(this.camera.position);
    const s = this.settings;
    this.bloomPass.enabled = s.bloom;
    this.blurPass.enabled = s.motionBlur;
    // frame-rate independent blur strength
    this.blurPass.amount = Math.min(0.6, s.motionBlurAmount * Math.min(1.6, (1 / 60) / Math.max(dt, 1e-3)));
    this.composer.render(dt);
  }

  /** Render an object to a small image (prop thumbnails). Returns a data URL. */
  thumbnail(object, w = 192, h = 144) {
    const r = this.renderer;
    const scene = new THREE.Scene();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.9;
    scene.background = new THREE.Color(0xd9dde1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 0.9));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
    key.position.set(-3, 5, 4);
    scene.add(key);
    scene.add(object);
    const box = new THREE.Box3().setFromObject(object);
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(28, w / h, 0.05, 100);
    const rad = Math.max(sz.y, Math.hypot(sz.x, sz.z) * 0.85, 0.2) * 0.62;
    const dist = rad / Math.tan((14 * Math.PI) / 180) + Math.hypot(sz.x, sz.z) * 0.3;
    cam.position.set(c.x + dist * 0.55, c.y + dist * 0.32, c.z + dist * 0.78);
    cam.lookAt(c);
    const prevSize = r.getSize(new THREE.Vector2()), prevPR = r.getPixelRatio();
    const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    r.setPixelRatio(1);
    r.setSize(w * 2, h * 2, false);
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 0);
    r.shadowMap.enabled = false;
    r.render(scene, cam);
    let url = '';
    try {
      const c2 = document.createElement('canvas');
      c2.width = w * 2; c2.height = h * 2;
      c2.getContext('2d').drawImage(r.domElement, 0, 0);
      url = c2.toDataURL('image/png');
    } catch (e) { /* ignore */ }
    r.shadowMap.enabled = true;
    r.setClearColor(prevClear, prevAlpha);
    r.setPixelRatio(prevPR);
    r.setSize(prevSize.x, prevSize.y, false);
    scene.remove(object);
    return url;
  }
}
