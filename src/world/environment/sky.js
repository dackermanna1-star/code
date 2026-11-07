import * as THREE from 'three';
import { ATMOSPHERE_GLSL, ATM } from './atmosphere.js';

// =============================================================================
// Sky dome (in app.skyRoot, world-oriented, follows the camera) and the
// equirectangular sky capture used for the outside PMREM environment.
//
// Radiance = sky-view LUT (Rayleigh + Mie + ozone, multiple scattering)
//          + sun disc with limb darkening (transmittance-reddened, blooms)
//          + sharp forward-scattering aureole around the sun
//          + moon (phase-lit disc + halo), stars, faint Milky Way, airglow
//          + below the horizon: far ground radiance attenuated + in-scatter.
// =============================================================================

export const SKY_COMMON_GLSL = /* glsl */`
${ATMOSPHERE_GLSL}
uniform vec3 uAtmMoonDir;
uniform vec3 uAtmMoonIllum;      // moon illuminance at the top of the atmosphere (scene units, incl. phase)
uniform vec3 uAtmNightGlow;      // airglow / light-pollution floor radiance
uniform vec3 uGroundRadiance;    // far-ground radiance (sea level, before aerial perspective)

// Cheap analytic single-scattering sky lit by the moon (+ airglow floor).
// Added both to the dome and to the aerial perspective so they stay consistent.
vec3 atmNightSky(vec3 dir) {
  float mu = max(dir.y, -0.02) + 0.035;
  float m = min(1.0 / mu, 28.0);                                  // relative air mass
  float c = dot(dir, uAtmMoonDir);
  vec3 tauR = ATM_RAY * ATM_RAY_H * m;
  float tauM = ATM_MIE_EXT * ATM_MIE_H * m;
  vec3 tau = tauR + tauM;
  vec3 scat = (ATM_RAY * ATM_RAY_H * atmRayPhase(c) + ATM_MIE * ATM_MIE_H * atmMiePhase(c, ATM_MIE_G)) * m;
  float mm = min(1.0 / (max(uAtmMoonDir.y, -0.02) + 0.035), 28.0);
  vec3 Tm = exp(-(ATM_RAY * ATM_RAY_H + ATM_MIE_EXT * ATM_MIE_H) * mm) * smoothstep(-0.03, 0.02, uAtmMoonDir.y);
  vec3 moonSky = uAtmMoonIllum * Tm * scat * (1.0 - exp(-tau)) / max(tau, vec3(1e-4)) * 1.6;
  float hz = 1.0 - clamp(dir.y, 0.0, 1.0);
  return moonSky + uAtmNightGlow * (0.55 + 1.6 * hz * hz * hz);
}
`;

const SKY_FRAG = /* glsl */`
${SKY_COMMON_GLSL}
uniform float uSunDisc;          // sun disc radiance scale
uniform float uStars;            // star visibility 0..1
uniform mat3 uStarRot;           // sidereal rotation (world -> celestial)
uniform float uMoonDisc;         // moon disc radiance scale
uniform float uTime;
uniform float uCaptureMode;      // 1 = env capture: no disc, no stars
varying vec3 vDir;
#ifdef SKY_DOME
varying vec3 vNightSky;
#endif

float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

vec3 starField(vec3 d, float pix) {
  vec3 a = abs(d);
  vec2 uv; float face;
  if (a.x >= a.y && a.x >= a.z) { uv = d.zy / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y >= a.z) { uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
  else { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }
  const float CELLS = 180.0;
  vec2 g = (uv * 0.5 + 0.5) * CELLS;
  vec2 cell = floor(g), fr = g - cell;
  vec3 h = hash33(vec3(cell, face * 17.0 + 3.0));
  float cellAng = 1.5708 / CELLS;                    // ~ angular size of a cell
  // magnitude distribution: many faint, few bright
  if (h.z > 0.075) return vec3(0.0);
  float bright = pow(h.x, 11.0);
  vec2 pos = 0.15 + 0.7 * hash33(vec3(cell + 7.7, face)).xy;
  float dist = length(fr - pos) * cellAng / max(pix * 0.6, 1e-5);
  float spot = exp(-dist * dist * 2.8);
  // colour temperature (subtle: the eye sees little colour in faint stars)
  float t = hash13(vec3(cell * 1.7, face + 9.0));
  vec3 col = mix(vec3(0.86, 0.92, 1.12), vec3(1.12, 0.98, 0.84), t * t);
  return col * spot * (0.00035 + bright * 0.9);
}

void main() {
  vec3 dir = normalize(vDir);
  bool ground;
  vec3 L = atmSkyView(dir, ground);
  float r = uAtmCamR, h = uAtmCamH, mu = dir.y;
#ifdef SKY_DOME
  L += vNightSky;
#else
  L += atmNightSky(dir);
#endif
  if (ground) {
    float D = atmRayEnd(r, h, mu, true);
    vec3 T = exp(-atmPathOD(r, h, mu, D));
    L += T * uGroundRadiance;
  } else if (uCaptureMode < 0.5) {
    vec3 T = atmTransmittance(r, mu);
    float pix = length(fwidth(dir));
    // --- sun disc with limb darkening
    float c = dot(dir, uAtmSunDir);
    float ang = acos(clamp(c, -1.0, 1.0));
    float x = ang / ${ATM.sunAngularRadius.toFixed(6)};
    if (x < 1.25) {
      float edge = clamp((1.0 - x) * ${(ATM.sunAngularRadius).toFixed(6)} / max(pix, 1e-6) + 0.5, 0.0, 1.0);
      float m = sqrt(max(0.0, 1.0 - min(x * x, 1.0)));
      vec3 limb = pow(vec3(m), vec3(0.42, 0.52, 0.66));
      L += T * uAtmSunIllum * uSunDisc * limb * edge;
    }
    // --- sharp aureole (forward scattering by large aerosols / ice), visible in hazy air
    float mieOD = ATM_MIE_EXT * ATM_MIE_H * exp(-h / ATM_MIE_H) / (max(mu, 0.0) + 0.04);
    float aure = (atmMiePhase(c, 0.96) * 0.06 + atmMiePhase(c, 0.995) * 0.004) * (1.0 - exp(-mieOD));
    L += T * uAtmSunIllum * aure * smoothstep(-0.03, 0.01, uAtmSunDir.y);
    // --- moon
    float cm = dot(dir, uAtmMoonDir);
    float angM = acos(clamp(cm, -1.0, 1.0));
    float xm = angM / 0.00452;
    if (xm < 1.3 && uAtmMoonDir.y > -0.05) {
      vec3 up = abs(uAtmMoonDir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
      vec3 tx = normalize(cross(up, uAtmMoonDir)), ty = cross(uAtmMoonDir, tx);
      vec2 q = vec2(dot(dir, tx), dot(dir, ty)) / 0.00452;
      float q2 = dot(q, q);
      float edge = clamp((1.0 - sqrt(q2)) * 0.00452 / max(pix, 1e-6) + 0.5, 0.0, 1.0);
      vec3 n = normalize(tx * q.x + ty * q.y - uAtmMoonDir * sqrt(max(0.0, 1.0 - min(q2, 1.0))));
      float lit = max(0.0, dot(n, uAtmSunDir));
      // maria (darker basalt plains) from low-frequency noise on the disc
      float mar = hash13(floor(vec3(q * 3.0, 1.0))) * 0.25 + hash13(floor(vec3(q * 7.0, 2.0))) * 0.15;
      float albedo = 0.16 - mar * 0.18 * smoothstep(0.2, 0.9, 1.0 - q2) + 0.05;
      vec3 Tm = atmTransmittance(r, mu);
      L += Tm * (vec3(lit * albedo) * uMoonDisc + vec3(0.0006, 0.0008, 0.0011) * uMoonDisc * 0.02) * edge;
    }
    // --- stars + Milky Way
    if (uStars > 0.001) {
      vec3 cd = uStarRot * dir;
      vec3 st = starField(cd, pix);
      // Milky Way: faint band around a great circle, mottled
      float band = exp(-pow(dot(cd, normalize(vec3(0.25, 0.45, 0.86))) / 0.17, 2.0));
      float mott = 0.55 + 0.45 * hash13(floor(cd * 60.0)) * hash13(floor(cd * 23.0) + 4.0);
      vec3 mw = vec3(0.9, 0.92, 1.0) * band * mott * 0.0018;
      // atmospheric extinction + scintillation near the ground
      float tw = 1.0 + 0.35 * sin(uTime * 13.0 + hash13(cd * 97.0) * 40.0) * smoothstep(0.4, 0.0, h);
      L += T * (st * tw + mw) * uStars * smoothstep(-0.02, 0.06, mu);
    }
  }
  gl_FragColor = vec4(L, 1.0);
}`;

const skyVert = (reversed) => /* glsl */`
${SKY_COMMON_GLSL}
varying vec3 vDir;
varying vec3 vNightSky;
void main() {
  vDir = position;
  vNightSky = atmNightSky(normalize(position));      // smooth: per vertex
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // pin to the far plane: the dome is drawn after opaque geometry and only fills uncovered pixels
  gl_Position.z = ${reversed ? '0.0' : 'gl_Position.w'};
}`;

const EQUI_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const EQUI_FRAG = SKY_FRAG
  .replace('varying vec3 vDir;', 'varying vec2 vUv;')
  .replace('vec3 dir = normalize(vDir);', `
  float phi = (vUv.x - 0.5) * 2.0 * 3.14159265359;
  float th = (vUv.y - 0.5) * 3.14159265359;
  // three.js equirect convention: u = atan(dir.z, dir.x) / 2pi + 0.5, v = asin(dir.y) / pi + 0.5
  vec3 dir = vec3(cos(th) * cos(phi), sin(th), cos(th) * sin(phi));`);

export function createSkyUniforms(atmUniforms) {
  return {
    ...atmUniforms,
    uAtmMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uAtmMoonIllum: { value: new THREE.Vector3() },
    uAtmNightGlow: { value: new THREE.Vector3(0.00022, 0.00032, 0.00055) },
    uGroundRadiance: { value: new THREE.Vector3(0.1, 0.1, 0.08) },
    uSunDisc: { value: 1 },
    uStars: { value: 0 },
    uStarRot: { value: new THREE.Matrix3() },
    uMoonDisc: { value: 0 },
    uTime: { value: 0 },
    uCaptureMode: { value: 0 },
  };
}

/**
 * The visible sky dome. Drawn after the opaque geometry (renderOrder) at the far
 * plane with depth test, so only pixels not covered by terrain / objects are shaded.
 */
export function createSkyDome(uniforms, reversedDepth) {
  const geo = new THREE.SphereGeometry(1000, 48, 32);
  const mat = new THREE.ShaderMaterial({
    name: 'env.sky', vertexShader: skyVert(reversedDepth), fragmentShader: SKY_FRAG, uniforms, defines: { SKY_DOME: 1 },
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'env.skyDome';
  mesh.frustumCulled = false;
  mesh.renderOrder = 100000;
  mesh.raycast = () => {};
  return mesh;
}

/** Equirectangular capture of the sky (+ simple ground) for the PMREM. */
export class SkyCapture {
  constructor(app, uniforms, width = 512) {
    this.app = app;
    this.rt = new THREE.WebGLRenderTarget(width, width / 2, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, generateMipmaps: false,
    });
    this.rt.texture.mapping = THREE.EquirectangularReflectionMapping;
    this.rt.texture.name = 'env.skyCapture';
    this.uniforms = { ...uniforms, uCaptureMode: { value: 1 } };
    this.material = new THREE.ShaderMaterial({
      name: 'env.skyCapture', vertexShader: EQUI_VERT, fragmentShader: EQUI_FRAG, uniforms: this.uniforms,
      depthTest: false, depthWrite: false,
    });
  }
  render() {
    const r = this.app.renderer;
    const prev = r.getRenderTarget();
    this.app.pipeline.fullscreen(this.material, this.rt);
    r.setRenderTarget(prev);
    return this.rt.texture;
  }
  dispose() { this.rt.dispose(); this.material.dispose(); }
}
