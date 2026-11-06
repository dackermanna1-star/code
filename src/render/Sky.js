// Sky dome (gradient, square sun & moon, stars, blocky clouds) + time-of-day lighting parameters.
import * as THREE from 'three';
import { globalUniforms } from './materials.js';
import { clamp, lerp, smoothstep } from '../core/rng.js';

const SKY_VERT = /* glsl */ `
out vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const SKY_FRAG = /* glsl */ `
precision highp float;
in vec3 vDir;
out vec4 fragColor;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform float uStars;
uniform float uCloudCover;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uTime;
uniform vec3 uCamPos;
uniform float uLightning;
uniform float uSunVis;
uniform float uMoonVis;
uniform float uMoonPhase;
uniform vec3 uFogColor;
uniform float uFogAmount;
uniform float uUnderwater;
uniform vec3 uWaterFog;
uniform float uSkyFog;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// square disc test like Minecraft's sun/moon
float squareDisc(vec3 d, vec3 c, float size, out vec2 uv) {
  vec3 up = abs(c.y) > 0.99 ? vec3(1, 0, 0) : vec3(0, 1, 0);
  vec3 r = normalize(cross(up, c));
  vec3 u = cross(c, r);
  float t = dot(d, c);
  if (t <= 0.0) { uv = vec2(9.0); return 0.0; }
  vec2 p = vec2(dot(d, r), dot(d, u)) / t;
  uv = p / size;
  return step(abs(uv.x), 1.0) * step(abs(uv.y), 1.0);
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
  col = mix(col, uHorizon * 0.55, clamp(-h * 3.0, 0.0, 1.0)); // below horizon
  // sun glow
  float sd = max(dot(d, uSunDir), 0.0);
  col += uGlow * pow(sd, 6.0) * 0.6 * uSunVis;
  col += uGlow * pow(sd, 60.0) * 0.8 * uSunVis;
  // stars
  if (uStars > 0.01 && h > 0.0) {
    vec3 sp = d * 180.0;
    vec3 cell = floor(sp);
    float s = hash3(cell);
    if (s > 0.9975) {
      vec3 f = fract(sp) - 0.5;
      float tw = 0.6 + 0.4 * sin(uTime * (2.0 + s * 9.0) + s * 100.0);
      col += vec3(0.9, 0.92, 1.0) * step(length(f), 0.28) * uStars * tw * smoothstep(0.0, 0.25, h);
    }
  }
  // sun & moon (square)
  vec2 suv;
  float sun = squareDisc(d, uSunDir, 0.055, suv);
  col = mix(col, vec3(1.0, 0.95, 0.75) * 3.0, sun * uSunVis);
  vec2 muv;
  float moon = squareDisc(d, uMoonDir, 0.04, muv);
  if (moon > 0.0) {
    vec2 pix = floor((muv * 0.5 + 0.5) * 8.0);
    float crater = step(0.7, hash(pix));
    float lit = step(uMoonPhase * 2.0 - 1.0, muv.x * 0.5 + 0.5) ;
    vec3 mc = mix(vec3(0.75, 0.78, 0.85), vec3(0.55, 0.58, 0.66), crater) * mix(0.15, 1.0, lit);
    col = mix(col, mc * 1.4, moon * uMoonVis);
  }
  // blocky clouds on a plane at y = 150
  if (h > 0.01 && uCloudCover > 0.01) {
    float t = (150.0 - uCamPos.y) / h;
    vec2 p = uCamPos.xz + d.xz * t;
    p += vec2(uTime * 1.2, uTime * 0.35);
    vec2 cell = floor(p / 12.0);
    float n = vnoise(cell * 0.18) * 0.65 + vnoise(cell * 0.53) * 0.35;
    float thr = 1.0 - uCloudCover;
    float c = step(thr, n);
    // edges of the cloud cells slightly darker (fake thickness)
    vec2 f = fract(p / 12.0);
    float edge = 1.0 - smoothstep(0.0, 0.12, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    float dens = clamp((n - thr) * 4.0, 0.0, 1.0);
    vec3 cc = mix(uCloudLit, uCloudShade, clamp(dens * 0.8 + edge * 0.15, 0.0, 1.0));
    float fade = smoothstep(0.01, 0.15, h) * (1.0 - smoothstep(1500.0, 4500.0, t));
    col = mix(col, cc, c * fade * mix(0.85, 1.0, uCloudCover));
  }
  col += vec3(0.7, 0.75, 0.9) * uLightning * 0.5;
  // fog / haze toward the horizon (matches world fog)
  float haze = (1.0 - smoothstep(0.0, 0.35, h)) * uFogAmount;
  col = mix(col, uFogColor, clamp(haze, 0.0, 1.0));
  // thick fog / heavy rain hide the whole sky, not just the horizon
  col = mix(col, uFogColor, uSkyFog * (0.75 + 0.25 * (1.0 - clamp(h, 0.0, 1.0))));
  if (uUnderwater > 0.5) col = uWaterFog * (1.0 + 0.6 * clamp(h, 0.0, 1.0));
  fragColor = vec4(col, 1.0);
}
`;

const C = (r, g, b) => new THREE.Color(r, g, b);
// Key colours over the day. sunHeight from -1 (midnight) to 1 (noon)
const PALETTE = {
  dayTop: C(0.18, 0.36, 0.72), dayHorizon: C(0.62, 0.72, 0.84),
  duskTop: C(0.12, 0.15, 0.34), duskHorizon: C(0.95, 0.5, 0.28),
  // moonlit night (scaled down by moon phase / clouds); still a touch lighter than the ground so roofs,
  // trees and zombies read as silhouettes
  nightTop: C(0.012, 0.018, 0.042), nightHorizon: C(0.035, 0.046, 0.075),
  overcastTop: C(0.36, 0.39, 0.43), overcastHorizon: C(0.5, 0.52, 0.55),
};
// Sun path: October in Kentucky – sunrise ~05:45, sunset ~19:15 (the game's "night" starts ~19:55, so the
// light fades through a proper twilight instead of going black at 18:30).
export const SUNRISE = 5.75, SUNSET = 19.25;
export function sunAngle(hour) {
  const h = ((hour % 24) + 24) % 24;
  const dayLen = SUNSET - SUNRISE;
  if (h >= SUNRISE && h <= SUNSET) return Math.PI * ((h - SUNRISE) / dayLen);
  const t = (((h - SUNSET) % 24) + 24) % 24 / (24 - dayLen);
  return Math.PI * (1 + t);
}
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color(), _c4 = new THREE.Color();

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uStars: { value: 0 },
      uCloudCover: { value: 0.3 },
      uCloudLit: { value: new THREE.Color(1, 1, 1) },
      uCloudShade: { value: new THREE.Color(0.8, 0.8, 0.85) },
      uTime: globalUniforms.uTime,
      uCamPos: globalUniforms.uCamPos,
      uLightning: globalUniforms.uLightning,
      uSunVis: { value: 1 },
      uMoonVis: { value: 0 },
      uMoonPhase: { value: 0.5 },
      uFogColor: globalUniforms.uFogColor,
      uFogAmount: { value: 0.5 },
      uUnderwater: globalUniforms.uUnderwater,
      uWaterFog: globalUniforms.uWaterFog,
      uSkyFog: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: this.uniforms,
      depthWrite: false,
      depthTest: true,
      side: THREE.BackSide,
    });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
    scene.add(this.mesh);
    this.state = { sunHeight: 0, dayFactor: 1, brightness: 1 };
  }

  /**
   * hour: 0..24, w: weather params {cloud, overcast, fog, rain}, day: day number (moon phase)
   */
  update(hour, w, day = 1, viewDist = 128) {
    const U = this.uniforms, G = globalUniforms;
    const a = sunAngle(hour);
    const sun = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.32).normalize();
    const moon = sun.clone().negate();
    U.uSunDir.value.copy(sun);
    U.uMoonDir.value.copy(moon);
    const sh = sun.y;
    // day01 includes civil twilight: the sky keeps a deep blue glow for ~45 game minutes after sunset
    const day01 = smoothstep(-0.3, 0.2, sh);
    const dusk = clamp(1 - Math.abs(sh + 0.04) * 3.0, 0, 1) * smoothstep(-0.3, -0.04, sh);
    const oc = clamp(w.overcast, 0, 1);
    const night = 1 - day01;
    // continuous moon phase: 0 new .. 0.5 full; the first night (day 1 -> 2) is a full moon
    const dayF = day + ((hour % 24) + 24) % 24 / 24;
    const moonPhase = (((dayF + 2) % 8) + 8) % 8 / 8;
    const full = 1 - Math.abs(moonPhase - 0.5) * 2; // 1 full, 0 new
    const moonUp = smoothstep(-0.05, 0.25, moon.y);
    const moonLight = (0.3 + 0.7 * full) * (0.45 + 0.55 * moonUp);
    const moonSky = moonLight * (1 - oc * 0.6);

    // sky gradient
    const top = _c1.copy(PALETTE.nightTop).multiplyScalar(0.45 + 0.75 * moonSky).lerp(PALETTE.dayTop, day01);
    const hor = _c2.copy(PALETTE.nightHorizon).multiplyScalar(0.45 + 0.75 * moonSky).lerp(PALETTE.dayHorizon, day01);
    top.lerp(PALETTE.duskTop, dusk * 0.6);
    hor.lerp(PALETTE.duskHorizon, dusk * 0.75 * (1 - oc * 0.7));
    const ocTop = _c3.copy(PALETTE.overcastTop).multiplyScalar(0.06 + 0.94 * day01);
    const ocHor = _c4.copy(PALETTE.overcastHorizon).multiplyScalar(0.06 + 0.94 * day01);
    const rainDark = 1 - 0.38 * clamp(w.rain, 0, 1);
    top.lerp(ocTop.multiplyScalar(rainDark), oc * 0.9);
    hor.lerp(ocHor.multiplyScalar(rainDark), oc * 0.9);
    U.uTop.value.copy(top);
    U.uHorizon.value.copy(hor);
    U.uGlow.value.setRGB(1.0, 0.6 + 0.3 * day01, 0.35 + 0.4 * day01).multiplyScalar((1 - oc * 0.85) * (0.3 + dusk));
    U.uStars.value = night * (1 - oc) * (0.9 - 0.4 * full * moonUp);
    U.uCloudCover.value = clamp(w.cloud, 0, 1);
    const cl = 0.05 + 0.95 * day01 + 0.06 * moonSky * night;
    U.uCloudLit.value.setRGB(1.0, 0.97 - dusk * 0.25, 0.94 - dusk * 0.4).multiplyScalar(cl * (1 - oc * 0.45));
    U.uCloudShade.value.setRGB(0.72, 0.74, 0.8).multiplyScalar(cl * (1 - oc * 0.55));
    U.uSunVis.value = (1 - oc * 0.97) * smoothstep(-0.1, 0.02, sh);
    U.uMoonVis.value = (1 - oc * 0.95) * smoothstep(-0.1, 0.05, moon.y);
    U.uMoonPhase.value = moonPhase;

    // lighting
    if (sh > -0.04) {
      G.uSunDir.value.copy(sun);
      const warm = smoothstep(0.0, 0.45, sh);
      const sc = _c3.setRGB(1.0, 0.5, 0.26).lerp(_c4.setRGB(1.0, 0.93, 0.82), warm);
      G.uSunColor.value.copy(sc).multiplyScalar(1.3 * smoothstep(-0.04, 0.16, sh) * (1 - oc * 0.8));
    } else {
      G.uSunDir.value.copy(moon);
      G.uSunColor.value.setRGB(0.34, 0.41, 0.6).multiplyScalar(0.34 * moonLight * (1 - oc * 0.85) * smoothstep(-0.04, 0.2, moon.y));
    }
    // sky fill: bluish on clear days, grey and relatively stronger under cloud (flat overcast light)
    const ambDay = _c1.setRGB(0.58, 0.64, 0.78).lerp(_c2.setRGB(0.66, 0.67, 0.7), oc);
    const ambNight = _c2.setRGB(0.05, 0.064, 0.105).multiplyScalar(0.45 + 0.9 * moonLight * (1 - oc * 0.6));
    const amb = ambNight.lerp(ambDay, day01);
    amb.lerp(_c3.setRGB(0.75, 0.45, 0.35).multiplyScalar(0.55), dusk * 0.3);
    G.uAmbientColor.value.copy(amb);
    G.uMinLight.value = 0.012 + 0.035 * day01;
    G.uNight.value = night;

    // fog: edge fog reaches ~92% at the render distance on a clear day; night, rain and fog pull it in
    const fogCol = _c4.copy(U.uHorizon.value).lerp(U.uTop.value, 0.15);
    G.uFogColor.value.copy(fogCol);
    const clearD = 1.25 / Math.max(48, viewDist);
    const baseFog = clearD * lerp(1.6, 1.0, day01);
    G.uFogDensity.value = baseFog * (1 + oc * 0.15) * (1 + w.rain * 0.45) * (1 + w.fog * 2.0);
    // aerial-perspective haze (mid range): subtle when clear, thick in fog
    G.uHaze.value = 0.0016 + oc * 0.003 + w.rain * 0.007 + w.fog * 0.042;
    G.uHazeMax.value = clamp(0.55 + w.fog * 0.45 + w.rain * 0.2, 0, 1);
    U.uFogAmount.value = clamp(0.2 + oc * 0.45 + w.fog * 0.8 + w.rain * 0.3, 0, 1);
    U.uSkyFog.value = clamp(w.fog * 0.85 + w.rain * 0.25, 0, 0.95);

    this.state.sunHeight = sh;
    this.state.dayFactor = day01;
    this.state.brightness = Math.max(day01 * (1 - oc * 0.5), 0.1 * moonLight * night * (1 - oc));
    this.state.moonLight = moonLight * night;
  }
}
