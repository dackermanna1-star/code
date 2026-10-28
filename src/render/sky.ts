// Golden-hour sky: gradient dome (deep blue zenith → peach/orange horizon, brighter around
// the sun) with the sun disc + Mie glow aligned with the sun light, and a few soft cloud
// billboards lit from the sunset side. The shared GLSL (`SKY_GLSL`) also drives the
// atmospheric haze of the city and the reflections of the facade glass so everything
// fades into the same horizon colour.

import { Mesh, MeshBuilder, ShaderMaterial, Vector3, VertexData, type Scene } from "@babylonjs/core";
import { MeshBuffer } from "./env/meshBuffer.ts";
import { TO_SUN } from "./env/sunModel.ts";
import { Rng } from "../core/rng.ts";

export interface SkyParams {
  zenith: [number, number, number];
  horizonSun: [number, number, number];
  horizonAway: [number, number, number];
  groundHaze: [number, number, number];
  /** HDR radiance of the sun disc (the Mie glow scales with it). */
  sunDisc: [number, number, number];
  /** Angular radius of the drawn disc (radians; the real sun is ≈ 0.0047). */
  discRadius: number;
  brightness: number;
  cloudLit: [number, number, number];
  cloudShade: [number, number, number];
}

export const DEFAULT_SKY: SkyParams = {
  zenith: [0.065, 0.14, 0.34],
  horizonSun: [1.45, 0.74, 0.34],
  horizonAway: [0.46, 0.44, 0.52],
  groundHaze: [0.4, 0.34, 0.31],
  sunDisc: [42, 27, 13],
  discRadius: 0.0105,
  brightness: 1.0,
  cloudLit: [1.25, 0.66, 0.42],
  cloudShade: [0.3, 0.26, 0.34],
};

/** Uniform names declared by SKY_GLSL (append to a ShaderMaterial's uniform list). */
export const SKY_UNIFORMS = ["uSunDir", "uSunDisc", "uZenith", "uHorizonSun", "uHorizonAway", "uGroundHaze", "uSkyBright"];

/** Shared sky radiance / haze functions (linear HDR). */
export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunDisc;
uniform vec3 uZenith;
uniform vec3 uHorizonSun;
uniform vec3 uHorizonAway;
uniform vec3 uGroundHaze;
uniform float uSkyBright;

vec3 skyRadiance(vec3 d) {
  float y = d.y;
  float h = max(y, 0.0);
  vec2 dh = d.xz;
  float lh = length(dh);
  dh = lh > 1e-4 ? dh / lh : vec2(1.0, 0.0);
  vec2 sh = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  float az = 0.5 + 0.5 * dot(dh, sh);
  float cs = dot(d, uSunDir);
  vec3 horizon = mix(uHorizonAway, uHorizonSun, az * az * az);
  float t = 1.0 - exp(-h * 3.0);
  vec3 col = mix(horizon, uZenith, t);
  col += uHorizonSun * 0.45 * exp(-h * 18.0) * pow(az, 5.0);
  const float g = 0.8;
  float mie = (1.0 - g * g) / pow(max(1.0 + g * g - 2.0 * g * cs, 1e-4), 1.5);
  col += uSunDisc * (0.00045 * mie) * (0.55 + 0.45 * exp(-h * 3.0));
  if (y < 0.0) col = mix(col, uGroundHaze, 1.0 - exp(y * 30.0));
  return col * uSkyBright;
}

vec3 hazeColor(vec3 d) {
  vec3 dd = normalize(vec3(d.x, max(d.y, 0.0) * 0.35 + 0.015, d.z));
  return skyRadiance(dd) * 0.85;
}
`;

/** Hash / value noise helpers shared by the exterior shaders. */
export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm4(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return s / 0.9375;
}
`;

/** Push the sky parameters into a material that includes SKY_GLSL. */
export function bindSky(mat: ShaderMaterial, p: SkyParams, toSun: Vector3): void {
  mat.setVector3("uSunDir", toSun);
  mat.setVector3("uSunDisc", new Vector3(...p.sunDisc));
  mat.setVector3("uZenith", new Vector3(...p.zenith));
  mat.setVector3("uHorizonSun", new Vector3(...p.horizonSun));
  mat.setVector3("uHorizonAway", new Vector3(...p.horizonAway));
  mat.setVector3("uGroundHaze", new Vector3(...p.groundHaze));
  mat.setFloat("uSkyBright", p.brightness);
}

const DOME_VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
varying vec3 vDir;
void main(void) {
  vDir = position;
  vec4 p = viewProjection * world * vec4(position, 1.0);
  // Pin to the far plane: the dome never clips against camera.maxZ.
  gl_Position = vec4(p.xy, p.w * 0.999995, p.w);
}
`;

const DOME_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uDiscCos;
${SKY_GLSL}
void main(void) {
  vec3 d = normalize(vDir);
  vec3 col = skyRadiance(d);
  float cs = dot(d, uSunDir);
  float edge = (1.0 - uDiscCos) * 0.12;
  float disc = smoothstep(uDiscCos - edge, uDiscCos + edge, cs);
  if (disc > 0.0) {
    float r = clamp((1.0 - cs) / max(1.0 - uDiscCos, 1e-6), 0.0, 1.0);
    col += uSunDisc * disc * (1.0 - 0.5 * r * r);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const CLOUD_VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 data;
uniform mat4 world;
uniform mat4 viewProjection;
varying vec2 vUV;
varying vec3 vWorld;
varying vec4 vData;
void main(void) {
  vec4 w = world * vec4(position, 1.0);
  vWorld = w.xyz;
  vUV = uv;
  vData = data;
  gl_Position = viewProjection * w;
}
`;

const CLOUD_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUV;
varying vec3 vWorld;
varying vec4 vData;
uniform vec3 cameraPosition;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uTime;
${SKY_GLSL}
${NOISE_GLSL}
void main(void) {
  vec2 q = vUV * 2.0 - 1.0;
  // Elliptic envelope, flatter at the bottom (stratocumulus bases).
  float env = 1.0 - smoothstep(0.25, 1.0, length(vec2(q.x, q.y * (q.y < 0.0 ? 2.2 : 1.35))));
  vec2 p = vUV * vec2(vData.z, 2.5) + vec2(vData.x * 31.7 + uTime * 0.004, vData.x * 13.1);
  float n = fbm4(p);
  float dens = smoothstep(0.5, 0.82, n * 0.75 + env * 0.55) * env * vData.y;
  if (dens < 0.004) discard;
  vec3 d = normalize(vWorld - cameraPosition);
  float cs = dot(d, uSunDir);
  // Thin edges near the sun light up (forward scattering), the rest is lit from below by
  // the low sun: warm undersides, cooler tops.
  float lower = smoothstep(0.6, -0.4, q.y);
  vec3 col = mix(uCloudShade, uCloudLit, clamp(0.35 + 0.5 * lower + 0.35 * cs, 0.0, 1.0));
  float halo = pow(max(cs, 0.0), 24.0);
  col += uSunDisc * 0.006 * halo * (1.0 - dens);
  float hz = clamp(d.y * 9.0, 0.0, 1.0);
  col = mix(hazeColor(d), col, 0.25 + 0.75 * hz);
  gl_FragColor = vec4(col * uSkyBright, dens * 0.92);
}
`;

export class Sky {
  readonly params: SkyParams;
  dome: Mesh | null = null;
  clouds: Mesh | null = null;
  domeMaterial: ShaderMaterial | null = null;
  cloudMaterial: ShaderMaterial | null = null;
  private readonly scene: Scene;
  private readonly toSun: Vector3;
  private time = 0;

  constructor(scene: Scene, params: Partial<SkyParams> = {}, toSun?: Vector3) {
    this.scene = scene;
    this.params = { ...DEFAULT_SKY, ...params };
    this.toSun = toSun ? toSun.clone().normalize() : new Vector3(TO_SUN.x, TO_SUN.y, TO_SUN.z);
  }

  build(): void {
    if (this.dome) return;
    const scene = this.scene;
    // ---- dome
    const dome = MeshBuilder.CreateSphere("skyDome", { diameter: 100, segments: 24 }, scene);
    dome.infiniteDistance = true;
    dome.isPickable = false;
    dome.alwaysSelectAsActiveMesh = true;
    dome.applyFog = false;
    dome.doNotSyncBoundingInfo = true;
    const dm = new ShaderMaterial(
      "skyDomeMat",
      scene,
      { vertexSource: DOME_VERTEX, fragmentSource: DOME_FRAGMENT },
      { attributes: ["position"], uniforms: ["world", "viewProjection", "uDiscCos", ...SKY_UNIFORMS] },
    );
    dm.backFaceCulling = false;
    dm.disableDepthWrite = true;
    bindSky(dm, this.params, this.toSun);
    dm.setFloat("uDiscCos", Math.cos(this.params.discRadius));
    dome.material = dm;
    this.dome = dome;
    this.domeMaterial = dm;

    // ---- clouds: a band of soft billboards, a few right beside the sun
    const mb = new MeshBuffer();
    const rng = new Rng(0xc10d5);
    const sunAz = Math.atan2(this.toSun.x, this.toSun.z);
    const specs: Array<{ az: number; el: number; w: number; h: number; dens: number; stretch: number }> = [];
    const nearSun = [
      { daz: -0.2, el: 0.075, w: 620, h: 95, dens: 0.75, stretch: 7 },
      { daz: 0.16, el: 0.13, w: 520, h: 120, dens: 0.6, stretch: 6 },
      { daz: 0.36, el: 0.05, w: 780, h: 80, dens: 0.8, stretch: 9 },
      { daz: -0.45, el: 0.17, w: 600, h: 150, dens: 0.55, stretch: 5 },
    ];
    for (const c of nearSun) specs.push({ az: sunAz + c.daz, el: c.el, w: c.w, h: c.h, dens: c.dens, stretch: c.stretch });
    for (let i = 0; i < 9; i++) {
      specs.push({
        az: sunAz + Math.PI * 0.35 + rng.range(0, Math.PI * 1.3),
        el: rng.range(0.04, 0.32),
        w: rng.range(380, 900),
        h: rng.range(70, 210),
        dens: rng.range(0.45, 0.85),
        stretch: rng.range(4, 8),
      });
    }
    for (const s of specs) {
      const dist = 1900 + rng.range(-250, 250);
      const dir = new Vector3(Math.sin(s.az) * Math.cos(s.el), Math.sin(s.el), Math.cos(s.az) * Math.cos(s.el));
      const c = dir.scale(dist);
      const right = new Vector3(dir.z, 0, -dir.x).normalize();
      const up = Vector3.Cross(dir, right).normalize().scale(-1);
      if (up.y < 0) up.scaleInPlace(-1);
      const hw = s.w / 2;
      const hh = s.h / 2;
      const p0 = c.subtract(right.scale(hw)).subtract(up.scale(hh));
      const p1 = c.add(right.scale(hw)).subtract(up.scale(hh));
      const p2 = c.add(right.scale(hw)).add(up.scale(hh));
      const p3 = c.subtract(right.scale(hw)).add(up.scale(hh));
      const n = dir.scale(-1);
      mb.quad(p0, p1, p2, p3, n, 0, 0, 1, 1, [1, 1, 1, 1], [rng.next(), s.dens, s.stretch, 0]);
    }
    const g = mb.build();
    const clouds = new Mesh("skyClouds", scene);
    const vd = new VertexData();
    vd.positions = g.positions;
    vd.indices = g.indices;
    vd.normals = g.normals;
    vd.uvs = g.uvs;
    vd.applyToMesh(clouds, false);
    clouds.setVerticesData("data", g.data, false, 4);
    clouds.isPickable = false;
    clouds.alwaysSelectAsActiveMesh = true;
    const cm = new ShaderMaterial(
      "skyCloudMat",
      scene,
      { vertexSource: CLOUD_VERTEX, fragmentSource: CLOUD_FRAGMENT },
      { attributes: ["position", "uv", "data"], uniforms: ["world", "viewProjection", "cameraPosition", "uCloudLit", "uCloudShade", "uTime", ...SKY_UNIFORMS], needAlphaBlending: true },
    );
    cm.backFaceCulling = false;
    cm.disableDepthWrite = true;
    bindSky(cm, this.params, this.toSun);
    cm.setVector3("uCloudLit", new Vector3(...this.params.cloudLit));
    cm.setVector3("uCloudShade", new Vector3(...this.params.cloudShade));
    cm.setFloat("uTime", 0);
    clouds.material = cm;
    this.clouds = clouds;
    this.cloudMaterial = cm;
  }

  update(dt: number): void {
    if (!this.cloudMaterial || !(dt > 0)) return;
    this.time = (this.time + Math.min(dt, 0.25)) % 100000;
    this.cloudMaterial.setFloat("uTime", this.time);
  }

  dispose(): void {
    this.dome?.dispose(false, true);
    this.clouds?.dispose(false, true);
    this.dome = this.clouds = null;
  }
}
