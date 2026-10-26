// Sky dome with day/night cycle, sun & moon, stars, drifting clouds, and the
// lighting that follows them (sun light, window fill lights, exposure).
import * as THREE from 'three';
import { G } from '../game.js';
import { cloudSprite } from '../core/textures.js';
import { clamp, lerp, smoothstep } from '../core/utils.js';

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // keep at far plane
}`;
const FRAG = /* glsl */`
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSunColor;
uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform float uStars; uniform float uTime; uniform float uFlash; uniform float uOvercast; uniform vec3 uGlow;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(smoothstep(0.0, 0.55, h), 0.8));
  col = mix(col, uBottom, smoothstep(0.0, -0.12, h));
  // warm city glow near the horizon at night
  col += uGlow * exp(-abs(h) * 14.0);
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(sd, 900.0) * 30.0 * (1.0 - uOvercast) + pow(sd, 12.0) * 0.35 + pow(sd, 3.0) * 0.12);
  // moon
  float md = max(dot(d, normalize(uMoonDir)), 0.0);
  col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9993, 0.9996, md) * 1.6 + pow(md, 60.0) * 0.08) * uStars;
  // stars
  if (uStars > 0.0 && h > 0.0) {
    vec3 p = floor(d * 380.0);
    float s = hash(p);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 50.0);
    col += vec3(step(0.9975, s) * tw * uStars * smoothstep(0.0, 0.25, h) * (1.0 - uOvercast));
  }
  col += vec3(0.75, 0.8, 1.0) * uFlash;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const C = (h) => new THREE.Color(h);
const PALETTE = {
  night: { top: C('#03050d'), horizon: C('#14182b'), sun: C('#000000'), glow: C('#3a2a2c') },
  dawn: { top: C('#2c3b6b'), horizon: C('#ff9762'), sun: C('#ffb16b'), glow: C('#3a2420') },
  day: { top: C('#2f6fcf'), horizon: C('#b8d6ef'), sun: C('#fff3d6'), glow: C('#000000') },
  overcast: { top: C('#6f7a86'), horizon: C('#a9b0b6'), sun: C('#d9d9d9'), glow: C('#000000') },
};

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color('#1a1d22') },
      uSunColor: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uStars: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uOvercast: { value: 0 }, uGlow: { value: new THREE.Color() },
    };
    const dome = new THREE.Mesh(new THREE.SphereGeometry(700, 48, 24), new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false }));
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    scene.add(dome);
    this.dome = dome;
    this.fog = new THREE.FogExp2('#b8d6ef', 0.0022);
    scene.fog = this.fog;
    this.horizon = new THREE.Color();
    // clouds
    this.clouds = [];
    const cg = new THREE.Group();
    for (let i = 0; i < 34; i++) {
      const m = new THREE.SpriteMaterial({ map: cloudSprite(i % 6 + 1), color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false, fog: false });
      const s = new THREE.Sprite(m);
      const a = Math.random() * Math.PI * 2, r = 180 + Math.random() * 350;
      s.position.set(Math.cos(a) * r, 60 + Math.random() * 120, Math.sin(a) * r);
      const sc = 90 + Math.random() * 160;
      s.scale.set(sc, sc * 0.45, 1);
      s.userData = { speed: 1 + Math.random() * 2, base: Math.random() };
      cg.add(s);
      this.clouds.push(s);
    }
    scene.add(cg);
    this.cloudGroup = cg;
    this.flash = 0;
    this.sunDir = new THREE.Vector3();
    this.info = null;
  }

  update(dt, t) {
    const sun = G.clock.sun();
    this.info = sun;
    const w = G.weather;
    const overcast = w ? w.overcast : 0;
    // sun direction: azimuth sweeps from east (+x) over north (-z) to west
    const el = sun.elevation;
    const az = sun.azimuth;
    this.sunDir.set(Math.cos(az), Math.sin(el) * 1.0 + 0.02, -Math.sin(az) * 1.0).normalize();
    const moon = new THREE.Vector3(-Math.cos(az) * 0.8, Math.max(0.25, -Math.sin(el) * 0.8 + 0.3), -0.6).normalize();
    // palette blend
    const day = sun.daylight, golden = sun.golden;
    const pal = (k) => {
      const c = PALETTE.night[k].clone().lerp(PALETTE.day[k], day);
      c.lerp(PALETTE.dawn[k], golden * 0.85);
      if (k !== 'glow') c.lerp(PALETTE.overcast[k].clone().multiplyScalar(0.25 + day * 0.75), overcast * 0.85);
      return c;
    };
    const u = this.uniforms;
    u.uTop.value.copy(pal('top'));
    u.uHorizon.value.copy(pal('horizon'));
    u.uSunColor.value.copy(pal('sun'));
    u.uGlow.value.copy(PALETTE.night.glow).multiplyScalar((1 - day) * (1 - overcast * 0.3));
    u.uSunDir.value.copy(this.sunDir);
    u.uMoonDir.value.copy(moon);
    u.uStars.value = sun.night;
    u.uTime.value = t;
    u.uOvercast.value = overcast;
    this.flash = Math.max(0, this.flash - dt * 4);
    u.uFlash.value = this.flash;
    u.uBottom.value.copy(u.uHorizon.value).multiplyScalar(0.35);
    // fog matches horizon
    this.horizon.copy(u.uHorizon.value);
    this.fog.color.copy(this.horizon).lerp(new THREE.Color('#202430'), (1 - day) * 0.3);
    this.fog.density = 0.0016 + overcast * 0.0035 + (w?.fog || 0) * 0.008;
    // clouds
    const cloudCol = new THREE.Color('#ffffff').lerp(new THREE.Color('#ffc9a0'), golden * 0.8).multiplyScalar(0.2 + day * 0.85).lerp(new THREE.Color('#8c939b').multiplyScalar(0.3 + day * 0.6), overcast * 0.7);
    const visible = 0.25 + overcast * 0.75;
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt * (1 + (w?.wind || 0) * 3);
      if (c.position.x > 600) c.position.x = -600;
      c.material.color.copy(cloudCol);
      c.material.opacity = clamp((c.userData.base < visible ? 0.75 : 0) * (0.5 + overcast * 0.5), 0, 0.9);
    }
    this.updateLighting(sun, overcast);
  }

  updateLighting(sun, overcast) {
    const apt = G.apartment;
    const day = sun.daylight;
    const lightningBoost = this.flash;
    // sun light
    const s = apt.sun;
    s.position.copy(this.sunDir).multiplyScalar(40);
    const sunCol = new THREE.Color('#fff1dc').lerp(new THREE.Color('#ffae6b'), sun.golden);
    if (day < 0.05) { // moonlight
      s.position.set(-20, 30, -25);
      s.color.set('#9fb4ff');
      s.intensity = 0.12 * (1 - overcast) + lightningBoost * 2;
    } else {
      s.color.copy(sunCol);
      s.intensity = (0.4 + day * 3.2) * (1 - overcast * 0.85) + lightningBoost * 2;
    }
    // window fill lights from sky
    const blinds = G.state.home.blinds;
    const skyCol = this.uniforms.uHorizon.value.clone().lerp(this.uniforms.uTop.value, 0.4);
    for (const wl of apt.windowLights) {
      const b = blinds[wl.room] || 0;
      wl.light.color.copy(skyCol).lerp(new THREE.Color('#ffffff'), 0.3);
      const nightGlow = 0.35; // city light spill at night
      wl.light.intensity = (day * 5.5 * (1 - overcast * 0.45) + (1 - day) * nightGlow + lightningBoost * 4) * (1 - b * 0.85);
    }
    // blinds glow when backlit
    for (const bl of apt.blinds) bl.fabMat.emissiveIntensity = day * 0.35 * (1 - overcast * 0.5);
    G.scene.environmentIntensity = 0.12 + day * 0.33;
    apt.ambient.intensity = 0.08 + day * 0.25;
    apt.ambient.color.copy(skyCol);
    // exposure: slight auto-exposure feeling
    const anyLights = Object.values(G.state.home.lights).some(Boolean);
    const target = lerp(anyLights ? 1.05 : 1.35, 0.95, day);
    G.engine.renderer.toneMappingExposure = lerp(G.engine.renderer.toneMappingExposure, target, 0.02);
    void smoothstep;
  }

  lightning() {
    this.flash = 1.4;
    setTimeout(() => (this.flash = 0.8), 120);
  }
}
