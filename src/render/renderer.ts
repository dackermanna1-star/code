// Renderer: WebGL setup, physically based sky with sun/clouds, image based
// lighting from the sky, cascaded-feeling shadow that follows the camera
// focus, fog, and optional bloom post-processing.

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export interface TimeOfDay {
  name: string;
  /** sun elevation (deg) and azimuth (deg) */
  elevation: number;
  azimuth: number;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fog: number;
  exposure: number;
  turbidity: number;
  rayleigh: number;
  night?: boolean;
}

export const TIMES: TimeOfDay[] = [
  { name: 'Morning', elevation: 14, azimuth: 115, sunColor: 0xffe0bc, sunIntensity: 3.6, hemiSky: 0xbcd4ff, hemiGround: 0x5a5040, hemiIntensity: 0.18, fog: 0xc0cfdc, exposure: 0.85, turbidity: 4, rayleigh: 1.4 },
  { name: 'Noon', elevation: 58, azimuth: 160, sunColor: 0xfff6ea, sunIntensity: 4.2, hemiSky: 0xcfe2ff, hemiGround: 0x6b5d48, hemiIntensity: 0.2, fog: 0xbcccdd, exposure: 0.78, turbidity: 2.5, rayleigh: 1.0 },
  { name: 'Afternoon', elevation: 32, azimuth: 225, sunColor: 0xfff0d8, sunIntensity: 4.0, hemiSky: 0xc4d8ff, hemiGround: 0x655843, hemiIntensity: 0.2, fog: 0xc0cfdc, exposure: 0.8, turbidity: 3, rayleigh: 1.2 },
  { name: 'Sunset', elevation: 4, azimuth: 262, sunColor: 0xffa060, sunIntensity: 3.2, hemiSky: 0x8f9cc8, hemiGround: 0x4a3a30, hemiIntensity: 0.16, fog: 0xc89a7c, exposure: 1.0, turbidity: 6, rayleigh: 2.5 },
  { name: 'Night', elevation: -18, azimuth: 300, sunColor: 0x8899cc, sunIntensity: 0.25, hemiSky: 0x223355, hemiGround: 0x101015, hemiIntensity: 0.25, fog: 0x0b1018, exposure: 1.2, turbidity: 1, rayleigh: 0.3, night: true },
];

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sky: Sky;
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private skyScene = new THREE.Scene();
  private skyForEnv: Sky;
  composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  quality: Quality = 'high';
  envIntensity = 0.5;
  time: TimeOfDay = TIMES[2];
  readonly sunDir = new THREE.Vector3();
  private shadowFocus = new THREE.Vector3();
  private shadowExtent = 70;
  private width = 1;
  private height = 1;
  pixelRatio = 1;
  private moon: THREE.DirectionalLight;
  private stars: THREE.Points | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.8;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 3000);
    this.camera.position.set(6, 3, 8);

    // sky (scaled so its radiance matches the analytic lights)
    this.sky = Renderer.makeSky();
    this.sky.scale.setScalar(4000);
    this.sky.material.uniforms.cloudCoverage.value = 0.35;
    this.sky.material.uniforms.cloudDensity.value = 0.45;
    this.scene.add(this.sky);
    this.skyForEnv = Renderer.makeSky();
    this.skyForEnv.scale.setScalar(1000);
    this.skyScene.add(this.skyForEnv);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.moon = new THREE.DirectionalLight(0x6677aa, 0);
    this.scene.add(this.moon);

    this.hemi = new THREE.HemisphereLight(0xcfe2ff, 0x605040, 0.6);
    this.scene.add(this.hemi);

    this.scene.fog = new THREE.Fog(0xc4d4e4, 250, 1800);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.setQuality('high');
    this.setTime(this.time);
  }

  static skyIntensity = 0.11;

  private static makeSky(): Sky {
    const s = new Sky();
    const m = s.material as THREE.ShaderMaterial;
    m.uniforms.skyIntensity = { value: Renderer.skyIntensity };
    m.fragmentShader = m.fragmentShader
      .replace('uniform float time;', 'uniform float time;\nuniform float skyIntensity;')
      .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * skyIntensity, 1.0 );');
    return s;
  }

  setSkyIntensity(v: number): void {
    for (const s of [this.sky, this.skyForEnv]) (s.material as THREE.ShaderMaterial).uniforms.skyIntensity.value = v;
    this.updateEnvironment();
  }

  setQuality(q: Quality): void {
    this.quality = q;
    const r = this.renderer;
    const dpr = Math.min(window.devicePixelRatio || 1, q === 'ultra' ? 2 : q === 'high' ? 1.5 : q === 'medium' ? 1.25 : 1);
    this.pixelRatio = dpr;
    r.setPixelRatio(dpr);
    const size = q === 'ultra' ? 4096 : q === 'high' ? 2048 : q === 'medium' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    this.shadowExtent = q === 'low' ? 45 : q === 'medium' ? 60 : 75;
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    const cam = this.sun.shadow.camera;
    cam.left = -this.shadowExtent;
    cam.right = this.shadowExtent;
    cam.top = this.shadowExtent;
    cam.bottom = -this.shadowExtent;
    cam.near = 1;
    cam.far = 600;
    cam.updateProjectionMatrix();
    this.setupComposer();
    this.resize(this.width, this.height);
  }

  private setupComposer(): void {
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    if (this.quality === 'low') return;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.quality === 'medium' ? 2 : 4 });
    const c = new EffectComposer(this.renderer, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.28, 0.45, 1.6);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    if (this.quality === 'ultra') c.addPass(new SMAAPass());
    this.composer = c;
  }

  setTime(t: TimeOfDay): void {
    this.time = t;
    const phi = THREE.MathUtils.degToRad(90 - t.elevation);
    const theta = THREE.MathUtils.degToRad(t.azimuth);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    for (const s of [this.sky, this.skyForEnv]) {
      const u = s.material.uniforms;
      u.sunPosition.value.copy(this.sunDir);
      u.turbidity.value = t.turbidity;
      u.rayleigh.value = t.rayleigh;
      u.mieCoefficient.value = 0.005;
      u.mieDirectionalG.value = 0.8;
      u.showSunDisc.value = t.night || s === this.skyForEnv ? 0 : 1;
    }
    this.sun.color.setHex(t.sunColor);
    this.sun.intensity = t.night ? 0 : t.sunIntensity;
    this.moon.intensity = t.night ? 0.35 : 0;
    this.moon.position.set(-0.4, 0.8, 0.3).multiplyScalar(100);
    this.hemi.color.setHex(t.hemiSky);
    this.hemi.groundColor.setHex(t.hemiGround);
    this.hemi.intensity = t.hemiIntensity;
    (this.scene.fog as THREE.Fog).color.setHex(t.fog);
    this.renderer.toneMappingExposure = t.exposure;
    this.sky.visible = !t.night;
    if (t.night) {
      this.scene.background = new THREE.Color(0x05070c);
      this.ensureStars();
      this.stars!.visible = true;
    } else {
      this.scene.background = null;
      if (this.stars) this.stars.visible = false;
    }
    this.updateEnvironment();
  }

  private ensureStars(): void {
    if (this.stars) return;
    const n = 2500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random(), v = Math.random() * 0.9 + 0.1;
      const th = u * Math.PI * 2, ph = Math.acos(v);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * 2500;
      pos[i * 3 + 1] = Math.cos(ph) * 2500;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 2500;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false }));
    this.scene.add(this.stars);
  }

  private updateEnvironment(): void {
    this.envRT?.dispose();
    if (this.time.night) {
      const s = new THREE.Scene();
      s.background = new THREE.Color(0x0a0f1a);
      this.envRT = this.pmrem.fromScene(s, 0);
    } else {
      this.envRT = this.pmrem.fromScene(this.skyScene, 0, 0.1, 2000);
    }
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = this.time.night ? 0.3 : this.envIntensity;
  }

  resize(w: number, h: number): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(this.width, this.height);
    }
    if (this.bloom) this.bloom.resolution.set(this.width / 2, this.height / 2);
  }

  /** Keep the shadow frustum centered around the focus point. */
  setShadowFocus(p: THREE.Vector3): void {
    this.shadowFocus.copy(p);
    const d = this.sunDir.y > 0.05 ? this.sunDir : new THREE.Vector3(0.3, 0.8, 0.2).normalize();
    // snap to texel grid to avoid shimmering
    const texel = (this.shadowExtent * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(p.x / texel) * texel;
    const fz = Math.round(p.z / texel) * texel;
    this.sun.target.position.set(fx, p.y, fz);
    this.sun.position.set(fx + d.x * 250, p.y + d.y * 250, fz + d.z * 250);
    this.sun.target.updateMatrixWorld();
  }

  render(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
