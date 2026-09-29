import * as THREE from 'three';
import { ARENA } from './config';
import { clamp, lerp, mulberry32, smoothstep } from '../core/math';

export interface AtmoPreset {
  name: string;
  label: string;
  sunElev: number;
  sunAzim: number;
  sunColor: number;
  sunIntensity: number;
  skyTop: number;
  skyHorizon: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fogColor: number;
  fogDensity: number;
  cloudColor: number;
  cloudShade: number;
  cloudCover: number;
  mountainNear: number;
  mountainFar: number;
  treeColor: number;
  grassTint: number;
  haze: number;
  exposure: number;
  saturation: number;
  contrast: number;
  tint: number;
  lift: number;
  stars: number;
  sunVisible: number;
  rain: number;
  storm: number;
}

const base: AtmoPreset = {
  name: 'day',
  label: 'Clear Day',
  sunElev: 50,
  sunAzim: 200,
  sunColor: 0xfff1dc,
  sunIntensity: 2.6,
  skyTop: 0x3f8fd0,
  skyHorizon: 0xbfe2ee,
  hemiSky: 0xbdd8ea,
  hemiGround: 0x6d6a3a,
  hemiIntensity: 1.25,
  fogColor: 0xb8d8e4,
  fogDensity: 0.0042,
  cloudColor: 0xffffff,
  cloudShade: 0xc9d6e2,
  cloudCover: 0.32,
  mountainNear: 0x4c7a3a,
  mountainFar: 0x6f94a0,
  treeColor: 0x2e5226,
  grassTint: 0xffffff,
  haze: 0.35,
  exposure: 1.0,
  saturation: 1.08,
  contrast: 1.04,
  tint: 0xffffff,
  lift: 0x000000,
  stars: 0,
  sunVisible: 1,
  rain: 0,
  storm: 0,
};

export const PRESETS: Record<string, AtmoPreset> = {
  day: base,
  noon: { ...base, name: 'noon', label: 'High Noon', sunElev: 72, sunAzim: 160, sunIntensity: 2.9, skyTop: 0x2f82cf, skyHorizon: 0xb4dcf1, cloudCover: 0.22, exposure: 0.97 },
  morning: {
    ...base, name: 'morning', label: 'Morning', sunElev: 24, sunAzim: -120, sunColor: 0xffe2bd, sunIntensity: 2.3, skyTop: 0x4b8fcc, skyHorizon: 0xd8e6e4,
    fogColor: 0xd1dfdc, fogDensity: 0.006, cloudCover: 0.28, mountainFar: 0x8aa2ae, haze: 0.45,
  },
  afternoon: {
    ...base, name: 'afternoon', label: 'Afternoon', sunElev: 34, sunAzim: 130, sunColor: 0xffe8c8, sunIntensity: 2.5, skyHorizon: 0xcbe3e8, cloudCover: 0.36,
  },
  golden: {
    ...base, exposure: 1.18, name: 'golden', label: 'Golden Hour', sunElev: 12, sunAzim: 115, sunColor: 0xffb466, sunIntensity: 2.4, skyTop: 0x5a7fb0, skyHorizon: 0xf2c68a,
    hemiSky: 0xd8c0a0, hemiGround: 0x5a4a2a, hemiIntensity: 1.75, fogColor: 0xe6c294, fogDensity: 0.0055, cloudColor: 0xffd9a8, cloudShade: 0xc98e6a,
    cloudCover: 0.3, mountainNear: 0x5f6e38, mountainFar: 0xa08c7a, tint: 0xfff0dc, saturation: 1.12,
  },
  dusk: {
    ...base, name: 'dusk', label: 'Blood Dusk', sunElev: 4, sunAzim: 8, sunColor: 0xff8450, sunIntensity: 1.9, skyTop: 0x6a3036, skyHorizon: 0xd9744c,
    hemiSky: 0xc9a898, hemiGround: 0x4a3a30, hemiIntensity: 2.2, fogColor: 0xb8634a, fogDensity: 0.0058, cloudColor: 0xe88a60, cloudShade: 0x9a4a40,
    cloudCover: 0.28, mountainNear: 0x6a3e34, mountainFar: 0x9a5646, treeColor: 0x3a2a20, grassTint: 0xf0c8b0, haze: 0.5, exposure: 1.22, saturation: 1.0,
    tint: 0xfff0e8, lift: 0x080000,
  },
  dawn: {
    ...base, name: 'dawn', label: 'Dawn', sunElev: 5, sunAzim: -85, sunColor: 0xffb48a, sunIntensity: 2.0, skyTop: 0x35507e, skyHorizon: 0xf0b28c,
    hemiSky: 0x9aa4c4, hemiGround: 0x3c3a30, hemiIntensity: 2.0, fogColor: 0xd4a892, fogDensity: 0.0075, cloudColor: 0xf6b8a6, cloudShade: 0x8a7a9a,
    cloudCover: 0.35, mountainNear: 0x4a5a58, mountainFar: 0x8a88a8, treeColor: 0x243a30, grassTint: 0xe6e0e8, haze: 0.55, exposure: 1.25, tint: 0xfff0f0,
  },
  overcast: {
    ...base, name: 'overcast', label: 'Overcast', sunElev: 45, sunAzim: 160, sunColor: 0xe8e2d4, sunIntensity: 0.75, skyTop: 0x7e7a70, skyHorizon: 0xa7a193,
    hemiSky: 0xb6b0a0, hemiGround: 0x5e5a3e, hemiIntensity: 1.75, fogColor: 0xa29c8e, fogDensity: 0.0068, cloudColor: 0xcdc8bc, cloudShade: 0x8c887e,
    cloudCover: 0.9, mountainNear: 0x5c6c46, mountainFar: 0x8a8c80, treeColor: 0x34472a, haze: 0.5, saturation: 0.86, contrast: 1.0, sunVisible: 0,
  },
  fog: {
    ...base, name: 'fog', label: 'Dense Fog', sunElev: 40, sunAzim: 20, sunColor: 0xe0e4e0, sunIntensity: 0.55, skyTop: 0x9ba19d, skyHorizon: 0xafb4ae,
    hemiSky: 0xbfc4bd, hemiGround: 0x5a5c48, hemiIntensity: 1.7, fogColor: 0xa9aea8, fogDensity: 0.024, cloudColor: 0xc4c8c2, cloudShade: 0x9ca09a,
    cloudCover: 1.0, mountainNear: 0x98a09a, mountainFar: 0xa9aea8, treeColor: 0x6a7468, haze: 0.95, saturation: 0.72, contrast: 0.98, sunVisible: 0,
  },
  rain: {
    ...base, name: 'rain', label: 'Rain', sunElev: 40, sunAzim: 30, sunColor: 0xc8ccd4, sunIntensity: 0.5, skyTop: 0x5d6168, skyHorizon: 0x7f848a,
    hemiSky: 0x959ba4, hemiGround: 0x44463a, hemiIntensity: 2.4, fogColor: 0x7a8087, fogDensity: 0.011, cloudColor: 0x8a8f96, cloudShade: 0x55595f,
    cloudCover: 1.0, mountainNear: 0x4a5448, mountainFar: 0x6c7278, treeColor: 0x283426, grassTint: 0xd0d8d0, haze: 0.7, exposure: 1.12, saturation: 0.78,
    sunVisible: 0, rain: 1,
  },
  storm: {
    ...base, name: 'storm', label: 'Thunderstorm', sunElev: 40, sunAzim: 30, sunColor: 0xb0b8d0, sunIntensity: 0.65, skyTop: 0x3c4049, skyHorizon: 0x646a74,
    hemiSky: 0x7a8090, hemiGround: 0x34362c, hemiIntensity: 3.2, fogColor: 0x5a6068, fogDensity: 0.013, cloudColor: 0x5e636b, cloudShade: 0x30343a,
    cloudCover: 1.0, mountainNear: 0x363e36, mountainFar: 0x4c5159, treeColor: 0x1c241c, grassTint: 0xb8c4c0, haze: 0.75, exposure: 1.42, saturation: 0.76,
    contrast: 1.06, sunVisible: 0, rain: 1, storm: 1,
  },
  night: {
    ...base, name: 'night', label: 'Moonlit Night', sunElev: 38, sunAzim: -150, sunColor: 0x9db4ff, sunIntensity: 1.1, skyTop: 0x060a18, skyHorizon: 0x1b2440,
    hemiSky: 0x4a5e8a, hemiGround: 0x16160f, hemiIntensity: 2.3, fogColor: 0x151c30, fogDensity: 0.0105, cloudColor: 0x2a3350, cloudShade: 0x10141f,
    cloudCover: 0.3, mountainNear: 0x121a24, mountainFar: 0x1e2740, treeColor: 0x0a100e, grassTint: 0x9aa6c8, haze: 0.45, exposure: 1.6, saturation: 0.82,
    contrast: 1.05, tint: 0xdfe6ff, lift: 0x02040a, stars: 1, sunVisible: 0.7,
  },
};

/** Per-day start/end presets. The sky transitions across the day's waves. */
const EARLY_DAYS: [string, string][] = [
  ['day', 'afternoon'],
  ['overcast', 'overcast'],
  ['golden', 'dusk'],
  ['dawn', 'morning'],
  ['afternoon', 'golden'],
  ['rain', 'storm'],
  ['dusk', 'night'],
  ['fog', 'fog'],
  ['noon', 'afternoon'],
  ['golden', 'night'],
];
const POOL: [string, string][] = [
  ['day', 'afternoon'], ['morning', 'noon'], ['afternoon', 'golden'], ['golden', 'dusk'], ['dusk', 'night'], ['dawn', 'morning'],
  ['overcast', 'rain'], ['rain', 'storm'], ['fog', 'overcast'], ['night', 'night'], ['storm', 'night'], ['overcast', 'overcast'], ['noon', 'golden'],
];

export function dayPresets(day: number): [AtmoPreset, AtmoPreset] {
  let pair: [string, string];
  if (day <= EARLY_DAYS.length) pair = EARLY_DAYS[day - 1];
  else {
    const r = mulberry32(day * 7919 + 13)();
    pair = POOL[Math.floor(r * POOL.length)];
  }
  return [PRESETS[pair[0]], PRESETS[pair[1]]];
}

const cA = new THREE.Color();
const cB = new THREE.Color();
function lerpHex(a: number, b: number, t: number, out: THREE.Color) {
  cA.setHex(a);
  cB.setHex(b);
  return out.copy(cA).lerp(cB, t);
}

/** Blended runtime atmosphere values (THREE colors in linear space). */
export class AtmoState {
  sunDir = new THREE.Vector3(0, 1, 0);
  sunColor = new THREE.Color();
  sunIntensity = 1;
  skyTop = new THREE.Color();
  skyHorizon = new THREE.Color();
  hemiSky = new THREE.Color();
  hemiGround = new THREE.Color();
  hemiIntensity = 1;
  fogColor = new THREE.Color();
  fogDensity = 0.005;
  cloudColor = new THREE.Color();
  cloudShade = new THREE.Color();
  cloudCover = 0.3;
  mountainNear = new THREE.Color();
  mountainFar = new THREE.Color();
  treeColor = new THREE.Color();
  grassTint = new THREE.Color();
  haze = 0.4;
  exposure = 1;
  saturation = 1;
  contrast = 1;
  tint = new THREE.Color();
  lift = new THREE.Color();
  stars = 0;
  sunVisible = 1;
  rain = 0;
  storm = 0;
  label = '';

  blend(a: AtmoPreset, b: AtmoPreset, t: number) {
    t = clamp(t, 0, 1);
    const elev = THREE.MathUtils.degToRad(lerp(a.sunElev, b.sunElev, t));
    const azim = THREE.MathUtils.degToRad(lerp(a.sunAzim, b.sunAzim, t));
    // azimuth 0 = straight down the road (+Z), positive toward +X
    this.sunDir.set(Math.sin(azim) * Math.cos(elev), Math.sin(elev), Math.cos(azim) * Math.cos(elev)).normalize();
    lerpHex(a.sunColor, b.sunColor, t, this.sunColor);
    this.sunIntensity = lerp(a.sunIntensity, b.sunIntensity, t);
    lerpHex(a.skyTop, b.skyTop, t, this.skyTop);
    lerpHex(a.skyHorizon, b.skyHorizon, t, this.skyHorizon);
    lerpHex(a.hemiSky, b.hemiSky, t, this.hemiSky);
    lerpHex(a.hemiGround, b.hemiGround, t, this.hemiGround);
    this.hemiIntensity = lerp(a.hemiIntensity, b.hemiIntensity, t);
    lerpHex(a.fogColor, b.fogColor, t, this.fogColor);
    this.fogDensity = lerp(a.fogDensity, b.fogDensity, t);
    lerpHex(a.cloudColor, b.cloudColor, t, this.cloudColor);
    lerpHex(a.cloudShade, b.cloudShade, t, this.cloudShade);
    this.cloudCover = lerp(a.cloudCover, b.cloudCover, t);
    lerpHex(a.mountainNear, b.mountainNear, t, this.mountainNear);
    lerpHex(a.mountainFar, b.mountainFar, t, this.mountainFar);
    lerpHex(a.treeColor, b.treeColor, t, this.treeColor);
    lerpHex(a.grassTint, b.grassTint, t, this.grassTint);
    this.haze = lerp(a.haze, b.haze, t);
    this.exposure = lerp(a.exposure, b.exposure, t);
    this.saturation = lerp(a.saturation, b.saturation, t);
    this.contrast = lerp(a.contrast, b.contrast, t);
    lerpHex(a.tint, b.tint, t, this.tint);
    lerpHex(a.lift, b.lift, t, this.lift);
    this.stars = lerp(a.stars, b.stars, t);
    this.sunVisible = lerp(a.sunVisible, b.sunVisible, t);
    this.rain = lerp(a.rain, b.rain, t);
    this.storm = lerp(a.storm, b.storm, t);
    this.label = t < 0.5 ? a.label : b.label;
  }
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 skyTop; uniform vec3 skyHorizon; uniform vec3 fogColor;
uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunVisible;
uniform vec3 cloudColor; uniform vec3 cloudShade; uniform float cloudCover;
uniform float time; uniform float stars; uniform float flash;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){ float s=0.0; float a=0.5; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float e = d.y;
  float h = clamp(e, 0.0, 1.0);
  vec3 col = mix(skyHorizon, skyTop, pow(h, 0.55));
  // horizon haze band blends into fog color
  col = mix(col, fogColor, smoothstep(0.18, 0.0, e) * 0.85);
  if (e < 0.0) col = mix(fogColor, fogColor * 0.9, clamp(-e * 4.0, 0.0, 1.0));
  // sun
  float sd = dot(d, normalize(sunDir));
  float disc = smoothstep(0.9993, 0.9996, sd);
  float glow = pow(max(sd, 0.0), 12.0) * 0.35 + pow(max(sd, 0.0), 300.0) * 0.8;
  col += sunColor * (disc * 6.0 + glow) * sunVisible;
  // stars
  if (stars > 0.01 && e > 0.02) {
    vec2 sp = floor(d.xz / (e + 0.4) * 180.0);
    float s = hash(sp);
    float tw = 0.6 + 0.4 * sin(time * 3.0 + s * 50.0);
    col += vec3(0.9, 0.95, 1.0) * step(0.9975, s) * stars * tw * smoothstep(0.02, 0.2, e);
  }
  // clouds (pixel-chunky)
  if (e > 0.005) {
    vec2 uv = d.xz / (e + 0.06) * 1.6 + vec2(time * 0.006, time * 0.002);
    uv = floor(uv * 48.0) / 48.0;
    float n = fbm(uv * 1.2);
    float cov = mix(0.72, 0.22, cloudCover);
    float c = smoothstep(cov, cov + 0.12, n);
    float n2 = fbm(uv * 1.2 + normalize(sunDir.xz + 0.001) * 0.06);
    float shade = clamp((n - n2) * 6.0 + 0.55, 0.0, 1.0);
    vec3 cc = mix(cloudShade, cloudColor, shade);
    float fade = smoothstep(0.005, 0.12, e);
    col = mix(col, cc, c * fade * 0.95);
  }
  col += vec3(0.8, 0.85, 1.0) * flash;
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * Owns the sky dome, sun + ambient lights and fog, blending between the day's
 * presets as the waves progress. Also drives rain and lightning.
 */
export class Atmosphere {
  readonly state = new AtmoState();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  /** Linear fog wall: the road fades out before the zombie spawn band (mountains keep their own haze). */
  readonly fog: THREE.Fog;
  readonly sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private a: AtmoPreset = PRESETS.day;
  private b: AtmoPreset = PRESETS.day;
  private t = 0;
  private tTarget = 0;
  private lightningTimer = 4;
  lightning = 0;
  private lightningSeq: number[] = [];
  onThunder: ((delay: number, strength: number) => void) | null = null;
  shadowSize = 48;
  private rain: THREE.Mesh;
  private rainMat: THREE.ShaderMaterial;
  time = 0;

  constructor(private scene: THREE.Scene) {
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    const sc = this.sun.shadow.camera;
    sc.near = 1;
    sc.far = 400;
    this.setShadowSize(this.shadowSize);
    this.sun.layers.enableAll();
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444422, 1);
    this.hemi.layers.enableAll();
    scene.add(this.hemi);

    this.fog = new THREE.Fog(0xaaaaaa, ARENA.fogFar * 0.35, ARENA.fogFar);
    scene.fog = this.fog;

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        skyTop: { value: new THREE.Color() },
        skyHorizon: { value: new THREE.Color() },
        fogColor: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3() },
        sunColor: { value: new THREE.Color() },
        sunVisible: { value: 1 },
        cloudColor: { value: new THREE.Color() },
        cloudShade: { value: new THREE.Color() },
        cloudCover: { value: 0.3 },
        time: { value: 0 },
        stars: { value: 0 },
        flash: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    scene.add(this.sky);

    // Rain: GPU-wrapped streaks around the camera
    const count = 5000;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = Math.random();
      seeds[i * 4 + 1] = Math.random();
      seeds[i * 4 + 2] = Math.random();
      seeds[i * 4 + 3] = Math.random();
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = count;
    this.rainMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec4 aSeed; uniform float time; uniform vec3 camPos; uniform float amount; varying float vA;
        void main(){
          vec3 box = vec3(36.0, 18.0, 36.0);
          vec3 p = vec3(aSeed.x, aSeed.y, aSeed.z) * box;
          p.y -= time * (16.0 + aSeed.w * 6.0);
          p.x += time * 1.2;
          vec3 rel = mod(p - camPos + box * 0.5, box) - box * 0.5;
          vec3 wp = camPos + rel;
          float len = 0.35 + aSeed.w * 0.2;
          vec3 up = normalize(vec3(0.06, 1.0, 0.0));
          vec3 toCam = normalize(cameraPosition - wp);
          vec3 side = normalize(cross(up, toCam)) * 0.006;
          vec3 pos = wp + side * position.x * 2.0 + up * position.y * len;
          vA = step(aSeed.w, amount) * (1.0 - smoothstep(10.0, 18.0, length(rel)));
          gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; uniform vec3 color;
        void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(color, 0.16 * vA); }`,
      uniforms: { time: { value: 0 }, camPos: { value: new THREE.Vector3() }, amount: { value: 0 }, color: { value: new THREE.Color(0.75, 0.8, 0.9) } },
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.rain = new THREE.Mesh(geo, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
  }

  setShadowSize(size: number) {
    this.shadowSize = size;
    const sc = this.sun.shadow.camera;
    sc.left = -size;
    sc.right = size;
    sc.top = size;
    sc.bottom = -size;
    sc.updateProjectionMatrix();
  }

  setDay(day: number) {
    const [a, b] = dayPresets(day);
    this.a = a;
    this.b = b;
    this.t = 0;
    this.tTarget = 0;
    this.lightningTimer = 3 + Math.random() * 6;
  }

  setPresets(a: AtmoPreset, b: AtmoPreset, t = 0) {
    this.a = a;
    this.b = b;
    this.t = t;
    this.tTarget = t;
  }

  /** Progress (0..1) of the day, drives sky transition smoothly. */
  setProgress(t: number, instant = false) {
    this.tTarget = clamp(t, 0, 1);
    if (instant) this.t = this.tTarget;
  }

  update(dt: number, focus: THREE.Vector3, forward: THREE.Vector3, camPos: THREE.Vector3) {
    this.time += dt;
    this.t += (this.tTarget - this.t) * Math.min(1, dt * 0.25);
    const s = this.state;
    s.blend(this.a, this.b, this.t);

    // lightning
    if (s.storm > 0.5) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 5 + Math.random() * 11;
        const strength = 0.6 + Math.random() * 0.8;
        const t0 = this.time;
        this.lightningSeq = [t0, t0 + 0.08, t0 + 0.2 + Math.random() * 0.15];
        this.onThunder?.(0.4 + Math.random() * 2.2, strength);
      }
    }
    let l = 0;
    for (const lt of this.lightningSeq) {
      const age = this.time - lt;
      if (age >= 0 && age < 0.25) l = Math.max(l, Math.exp(-age * 18));
    }
    this.lightning = l;

    this.sun.color.copy(s.sunColor);
    this.sun.intensity = s.sunIntensity;
    this.hemi.color.copy(s.hemiSky);
    this.hemi.groundColor.copy(s.hemiGround);
    this.hemi.intensity = s.hemiIntensity + l * 3.0;
    this.fog.color.copy(s.fogColor);
    // thicker weather pulls the wall in; clear days see out to ARENA.fogFar
    const far = clamp(ARENA.fogFar - (s.fogDensity - 0.0042) * 1500, 24, ARENA.fogFar);
    this.fog.far = far;
    this.fog.near = far * 0.34;

    // Shadow frustum follows the player, biased ahead; snapped to texels to avoid shimmer
    const center = new THREE.Vector3(focus.x + forward.x * (this.shadowSize * 0.55), 0, focus.z + forward.z * (this.shadowSize * 0.55));
    const texel = (this.shadowSize * 2) / this.sun.shadow.mapSize.x;
    center.x = Math.round(center.x / texel) * texel;
    center.z = Math.round(center.z / texel) * texel;
    this.sun.target.position.copy(center);
    this.sun.position.copy(center).addScaledVector(s.sunDir, 150);
    this.sun.target.updateMatrixWorld();

    const u = this.skyMat.uniforms;
    (u.skyTop.value as THREE.Color).copy(s.skyTop);
    (u.skyHorizon.value as THREE.Color).copy(s.skyHorizon);
    (u.fogColor.value as THREE.Color).copy(s.fogColor);
    (u.sunDir.value as THREE.Vector3).copy(s.sunDir);
    (u.sunColor.value as THREE.Color).copy(s.sunColor);
    u.sunVisible.value = s.sunVisible;
    (u.cloudColor.value as THREE.Color).copy(s.cloudColor);
    (u.cloudShade.value as THREE.Color).copy(s.cloudShade);
    u.cloudCover.value = s.cloudCover;
    u.time.value = this.time;
    u.stars.value = s.stars;
    u.flash.value = l * 0.9;
    this.sky.position.copy(camPos);

    const ru = this.rainMat.uniforms;
    ru.time.value = this.time;
    (ru.camPos.value as THREE.Vector3).copy(camPos);
    ru.amount.value = s.rain;
    this.rain.visible = s.rain > 0.02;
    (ru.color.value as THREE.Color).copy(s.hemiSky).multiplyScalar(0.9).addScalar(0.1 + l);
  }
}

export const smooth01 = (t: number) => smoothstep(0, 1, t);
