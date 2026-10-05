// Renderer, post-processing chain, light pooling and the first-person viewmodel overlay.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 0.9 },
    damage: { value: 0 },
    lowHealth: { value: 0 },
    aberration: { value: 0 },
    flash: { value: 0 },
    flashColor: { value: new THREE.Color(1, 1, 1) },
    saturation: { value: 1.08 },
    tint: { value: new THREE.Color(1, 1, 1) },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, vignette, damage, lowHealth, aberration, flash, saturation;
    uniform vec3 flashColor, tint;
    uniform vec2 resolution;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      float ab = aberration * 0.012 + lowHealth * 0.002;
      vec3 col;
      if (ab > 0.0001) {
        vec2 off = c * ab * (0.5 + r2 * 4.0);
        col.r = texture2D(tDiffuse, uv + off).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - off).b;
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }
      // grade
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float sat = saturation * (1.0 - lowHealth * 0.55);
      col = mix(vec3(l), col, sat);
      col *= tint;
      // split-tone: cool shadows, warm highlights
      col = mix(col * vec3(0.92, 0.96, 1.1), col * vec3(1.06, 1.0, 0.92), smoothstep(0.0, 0.6, l));
      // vignette
      float v = smoothstep(0.85, 0.2, r2 * vignette * 2.2);
      col *= mix(0.35, 1.0, v);
      // damage / low health red edges
      float pulse = 0.65 + 0.35 * sin(time * 5.0);
      float edge = smoothstep(0.08, 0.5, r2);
      col = mix(col, vec3(0.45, 0.0, 0.0), edge * clamp(damage * 0.9 + lowHealth * 0.45 * pulse, 0.0, 0.85));
      // flash
      col += flashColor * flash;
      // grain
      col += (hash(uv * resolution + fract(time * 7.13)) - 0.5) * 0.012;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export class Renderer {
  constructor(container) {
    this.container = container;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false }));
    r.setClearColor(0x000000, 1);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    r.domElement.id = 'game-canvas';

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.04, 90);
    this.scene.add(this.camera);

    // Viewmodel overlay: same camera transform, separate scene, depth cleared before drawing.
    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
    this.viewScene.add(this.viewCamera);
    this.viewRoot = new THREE.Group();
    this.viewCamera.add(this.viewRoot);
    this.viewHemi = new THREE.HemisphereLight(0x8899bb, 0x221a14, 0.6);
    this.viewScene.add(this.viewHemi);
    this.viewLights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 14, 1.6);
      this.viewScene.add(l);
      this.viewLights.push(l);
    }

    this.hemi = new THREE.HemisphereLight(0x5d6b8a, 0x2a1e18, 0.5);
    this.scene.add(this.hemi);

    // Player lantern: soft warm fill so the area around the player always reads.
    this.lantern = new THREE.PointLight(0xffe2c4, 12, 16, 1.5);
    this.lantern.position.set(0.25, 0.1, 0.2);
    this.camera.add(this.lantern);
    this.viewLantern = new THREE.PointLight(0xffc890, 3, 6, 1.5);
    this.viewLantern.position.set(0.3, 0.4, 0.4);
    this.viewCamera.add(this.viewLantern);

    this.quality = 'high';
    this.poolSize = 12;
    this.pool = [];
    for (let i = 0; i < this.poolSize; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 12, 1.5);
      l.userData.src = null;
      this.scene.add(l);
      this.pool.push(l);
    }
    this.lightSources = []; // static (torches etc.)
    this.dynamicSources = new Set(); // moving / temporary
    this.flashes = [];

    this.time = 0;
    this.envMap = this._makeEnv();
    this._setupComposer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  _setupComposer() {
    const r = this.renderer;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.worldPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.worldPass);
    this.viewPass = new RenderPass(this.viewScene, this.viewCamera);
    this.viewPass.clear = false;
    this.viewPass.clearDepth = true;
    this.composer.addPass(this.viewPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.finalPass = new ShaderPass(FinalShader);
    this.composer.addPass(this.finalPass);
    this.composer.addPass(new OutputPass());
    this.post = this.finalPass.uniforms;
  }

  // Small procedural environment for metal reflections: dark vault with warm torch glints.
  _makeEnv() {
    const env = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16);
    const cols = [];
    const pos = geo.attributes.position;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 10;
      if (y > 0.2) c.setRGB(0.05, 0.06, 0.09);
      else if (y > -0.15) c.setRGB(0.55, 0.38, 0.22).lerp(new THREE.Color(0.08, 0.07, 0.08), Math.abs(y) * 3);
      else c.setRGB(0.12, 0.09, 0.07);
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.6, 1.6) });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), lamp);
      const a = (i / 6) * Math.PI * 2;
      m.position.set(Math.cos(a) * 8, 1.5 + (i % 2), Math.sin(a) * 8);
      env.add(m);
    }
    const cool = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.8, 1.6) }));
    cool.position.set(0, 9, 0);
    env.add(cool);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const rt = pmrem.fromScene(env, 0.02);
    pmrem.dispose();
    return rt.texture;
  }

  setQuality(q) {
    this.quality = q;
    this.resize();
    this.bloom.enabled = q !== 'low';
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const maxDpr = this.quality === 'low' ? 0.75 : this.quality === 'medium' ? 1 : 1.5;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set((w * dpr) / 2, (h * dpr) / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = w / h;
    this.viewCamera.updateProjectionMatrix();
    this.post.resolution.value.set(w, h);
  }

  setTheme(theme) {
    this.scene.fog = new THREE.FogExp2(new THREE.Color(theme.fog), theme.fogDensity);
    this.scene.background = new THREE.Color(theme.fog);
    this.hemi.color.set(theme.hemiSky);
    this.hemi.groundColor.set(theme.hemiGround);
    this.hemi.intensity = theme.hemiIntensity * 3.6;
    this.viewHemi.color.set(theme.hemiSky);
    this.viewHemi.groundColor.set(theme.hemiGround);
    this.viewHemi.intensity = theme.hemiIntensity * 3.0;
  }

  clearLights() {
    this.lightSources.length = 0;
    this.dynamicSources.clear();
    this.flashes.length = 0;
    for (const l of this.pool) {
      l.intensity = 0;
      l.userData.src = null;
    }
  }

  // Static light (torch, brazier, crystal...). flicker: 0..1
  addLightSource(pos, color, intensity, range = 12, flicker = 0.6) {
    const s = { pos: pos.clone(), color: new THREE.Color(color), intensity, range, flicker, seed: Math.random() * 100, on: true };
    this.lightSources.push(s);
    return s;
  }

  // Dynamic light source; caller mutates .pos and removes it when done.
  addDynamic(pos, color, intensity, range = 8, flicker = 0) {
    const s = { pos, color: new THREE.Color(color), intensity, range, flicker, seed: Math.random() * 100, on: true, dynamic: true };
    this.dynamicSources.add(s);
    return s;
  }

  removeDynamic(s) {
    this.dynamicSources.delete(s);
  }

  flash(pos, color, intensity = 20, range = 10, duration = 0.25) {
    const s = { pos: pos.clone(), color: new THREE.Color(color), intensity, base: intensity, range, flicker: 0, life: duration, max: duration, on: true, dynamic: true, seed: 0 };
    this.flashes.push(s);
    return s;
  }

  _updateLights(dt, camPos, camDir) {
    this.time += dt;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      f.intensity = f.base * Math.max(0, f.life / f.max) ** 1.5;
      if (f.life <= 0) this.flashes.splice(i, 1);
    }
    const cands = [];
    const score = (s) => {
      if (!s.on) return -1;
      const dx = s.pos.x - camPos.x, dy = s.pos.y - camPos.y, dz = s.pos.z - camPos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 34 * 34) return -1;
      const d = Math.sqrt(d2) + 0.001;
      // prefer lights in front of the camera
      const facing = (dx * camDir.x + dy * camDir.y + dz * camDir.z) / d;
      return (s.intensity * (s.dynamic ? 1.5 : 1)) / (1 + d2 * 0.05) * (facing > -0.3 ? 1 : 0.45);
    };
    for (const s of this.lightSources) { const sc = score(s); if (sc > 0) cands.push([sc, s]); }
    for (const s of this.dynamicSources) { const sc = score(s); if (sc > 0) cands.push([sc, s]); }
    for (const s of this.flashes) { const sc = score(s); if (sc > 0) cands.push([sc * 3, s]); }
    cands.sort((a, b) => b[0] - a[0]);
    const chosen = new Set();
    const n = Math.min(this.pool.length, cands.length);
    for (let i = 0; i < n; i++) chosen.add(cands[i][1]);
    // keep stable assignments
    const free = [];
    for (const l of this.pool) {
      if (l.userData.src && chosen.has(l.userData.src)) chosen.delete(l.userData.src);
      else { l.userData.src = null; free.push(l); }
    }
    for (const s of chosen) {
      const l = free.pop();
      if (!l) break;
      l.userData.src = s;
    }
    const t = this.time;
    for (const l of this.pool) {
      const s = l.userData.src;
      if (!s) { l.intensity = 0; continue; }
      let k = 1;
      if (s.flicker > 0) {
        const fl = Math.sin(t * 9.1 + s.seed) * 0.5 + Math.sin(t * 23.7 + s.seed * 2) * 0.3 + Math.sin(t * 3.3 + s.seed) * 0.2;
        k = 1 + fl * 0.16 * s.flicker;
      }
      l.position.copy(s.pos);
      if (s.flicker > 0) {
        l.position.x += Math.sin(t * 7 + s.seed) * 0.03 * s.flicker;
        l.position.y += Math.sin(t * 11 + s.seed) * 0.03 * s.flicker;
      }
      l.color.copy(s.color);
      l.intensity = s.intensity * k;
      l.distance = s.range;
    }
    // viewmodel lights: copy the strongest pool lights near the camera
    const near = this.pool
      .filter((l) => l.intensity > 0)
      .map((l) => [l.intensity / (1 + l.position.distanceToSquared(camPos) * 0.08), l])
      .sort((a, b) => b[0] - a[0]);
    for (let i = 0; i < this.viewLights.length; i++) {
      const vl = this.viewLights[i];
      const src = near[i] && near[i][1];
      if (!src) { vl.intensity = 0; continue; }
      vl.position.copy(src.position);
      vl.color.copy(src.color);
      vl.intensity = src.intensity;
      vl.distance = src.distance;
    }
  }

  render(dt) {
    const camPos = this.camera.getWorldPosition(_v1);
    const camDir = this.camera.getWorldDirection(_v2);
    this._updateLights(dt, camPos, camDir);
    // viewmodel camera mirrors main camera
    this.camera.updateMatrixWorld();
    this.viewCamera.position.copy(camPos);
    this.viewCamera.quaternion.copy(this.camera.getWorldQuaternion(_q1));
    this.viewCamera.updateMatrixWorld();
    this.post.time.value = this.time;
    this.composer.render(dt);
  }
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

// Adds a fresnel rim light + optional hit flash to a standard material. Strong silhouettes in the dark.
export function addRim(material, color = 0x8899ff, strength = 0.6, power = 2.5) {
  material.userData.rim = { value: new THREE.Color(color).multiplyScalar(strength) };
  material.userData.flash = { value: 0 };
  material.userData.rimPower = { value: power };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = material.userData.rim;
    shader.uniforms.hitFlash = material.userData.flash;
    shader.uniforms.rimPower = material.userData.rimPower;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float hitFlash;\nuniform float rimPower;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 vd = normalize(vViewPosition);
          float fres = pow(1.0 - clamp(abs(dot(normal, vd)), 0.0, 1.0), rimPower);
          totalEmissiveRadiance += rimColor * fres + vec3(1.0, 0.92, 0.85) * hitFlash * (0.55 + fres * 1.2);
        }`
      );
  };
  material.customProgramCacheKey = () => 'rim';
  return material;
}
