import * as THREE from 'three';
import { U } from '../engine/uniforms.js';
import { HASH_GLSL } from '../shaders/common.js';
import { ATMOSPHERE_USE_GLSL, TRANSMITTANCE_LOOKUP_GLSL } from './atmosphere.js';

// Sky dome drawn as a full-screen triangle at the far plane after the opaque geometry,
// so only uncovered pixels pay for it. Radiance comes from the sky-view LUT; the sun,
// moon, stars, cirrus and storm dust are added analytically.

const VERT = /* glsl */ `
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
varying vec3 vDir;
void main() {
  vec4 v = uInvProj * vec4(position.xy, 1.0, 1.0);
  vDir = (uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const FRAG = /* glsl */ `
${HASH_GLSL}
${ATMOSPHERE_USE_GLSL}
${TRANSMITTANCE_LOOKUP_GLSL}
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uTime;
uniform float uCloud;
uniform float uDust;
#ifndef DECL_WIND_OFFSET
#define DECL_WIND_OFFSET
uniform vec2 uWindOffset;
#endif
uniform mat3 uStarRotation;
uniform float uStarIntensity;
varying vec3 vDir;

const float SUN_R = 0.00465;
const float MOON_R = 0.0045;

float hgPhase(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * ATM_PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}

// Angle between two unit vectors, precise for small angles.
float angleBetween(vec3 a, vec3 b) {
  return 2.0 * asin(clamp(0.5 * length(a - b), 0.0, 1.0));
}

float triNoise(vec3 c, float s) {
  return (vnoise(c.xy * s) + vnoise(c.yz * s + 3.7) + vnoise(c.zx * s - 5.1)) / 3.0;
}

vec3 starField(vec3 d, float px) {
  vec3 c = uStarRotation * d;
  vec3 a = abs(c);
  vec2 uv;
  float face;
  if (a.x >= a.y && a.x >= a.z) {
    uv = c.yz / a.x;
    face = c.x > 0.0 ? 0.0 : 1.0;
  } else if (a.y >= a.z) {
    uv = c.xz / a.y;
    face = c.y > 0.0 ? 2.0 : 3.0;
  } else {
    uv = c.xy / a.z;
    face = c.z > 0.0 ? 4.0 : 5.0;
  }
  const float G = 220.0;
  vec2 g = (uv * 0.5 + 0.5) * G;
  vec2 cell = floor(g);
  vec3 r = hash32(cell + face * 1013.0);
  // Steep magnitude distribution: a few bright stars, many faint ones.
  float bright = pow(r.z, 130.0) * 7.0;
  vec2 pos = cell + 0.2 + 0.6 * r.xy;
  float rad = max(px * G * 0.55, 0.035);
  float s = exp(-dot(g - pos, g - pos) / (rad * rad)) * bright / (rad * rad * 18.0 + 1.0);
  vec3 tint = mix(vec3(1.0, 0.8, 0.6), vec3(0.72, 0.84, 1.0), hash12(cell * 1.7 + face));
  float tw = 0.75 + 0.25 * sin(uTime * (2.0 + 6.0 * r.x) + r.y * 60.0);
  // Milky Way: a faint, mottled band along the galactic plane.
  vec3 gal = normalize(vec3(0.32, 0.5, -0.8));
  float b = dot(c, gal);
  float band = exp(-b * b / 0.022);
  float mott = triNoise(c, 9.0) * 0.6 + triNoise(c, 23.0) * 0.4;
  float lanes = smoothstep(0.25, 0.65, triNoise(c, 5.0));
  vec3 milky = vec3(0.75, 0.78, 0.9) * band * (0.25 + mott) * (0.4 + 0.6 * lanes) * 0.0035;
  return tint * s * tw + milky;
}

vec3 moonDisc(vec3 dir, float px, vec3 tview) {
  float th = angleBetween(dir, uMoonDir);
  if (th > MOON_R + 2.0 * px) return vec3(0.0);
  vec3 m = uMoonDir;
  vec3 t = normalize(cross(m, abs(m.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
  vec3 b = cross(t, m);
  vec2 q = vec2(dot(dir - m, t), dot(dir - m, b)) / MOON_R;
  float z = sqrt(max(0.0, 1.0 - dot(q, q)));
  vec3 n = normalize(q.x * t + q.y * b - z * m);
  float lit = smoothstep(-0.05, 0.12, dot(n, uSunDir));
  float maria = 0.62 + 0.38 * smoothstep(0.3, 0.7, fbm3(q * 1.6 + 4.0));
  float edge = 1.0 - smoothstep(MOON_R - px, MOON_R + px, th);
  return uMoonIllum * tview * (lit * maria * edge * 1.6 / (ATM_PI * MOON_R * MOON_R));
}

// Cirrus at ~8.5 km: broad, brushed bands with a fibrous texture across them, drifting
// with the upper winds.
vec4 cirrus(vec3 dir) {
  if (dir.y < 0.012 || uCloud < 0.01) return vec4(0.0);
  float t = 8.5 / dir.y;
  vec2 pos = dir.xz * t + uWindOffset * 0.004 + vec2(uTime * 0.006, 0.0);
  vec2 sd = vec2(0.86, 0.51);
  vec2 q = vec2(dot(pos, sd), dot(pos, vec2(-sd.y, sd.x)));
  vec2 w = vec2(fbm3(q * 0.16 + 3.1), fbm3(q * 0.16 - 7.7)) - 0.5;
  vec2 qw = q + w * 7.0;
  float base = fbm3(qw * vec2(0.13, 0.34) + 11.0);
  float fib = fbm3(qw * vec2(0.45, 4.2) + base * 2.5);
  float cov = uCloud;
  float shape = smoothstep(0.66 - 0.36 * cov, 0.95 - 0.28 * cov, base);
  float dens = shape * (0.3 + 0.95 * fib * fib);
  dens *= smoothstep(0.012, 0.1, dir.y);
  dens = clamp(dens, 0.0, 1.0);
  if (dens <= 0.002) return vec4(0.0);
  vec3 cloudPos = vec3(0.0, ATM_RG + uCameraAltitude + 8.5, 0.0);
  vec3 sunT = atmLightTransmittance(cloudPos, uSunDir);
  vec3 moonT = atmLightTransmittance(cloudPos, uMoonDir);
  float cs = dot(dir, uSunDir);
  float cm = dot(dir, uMoonDir);
  vec3 light = uSunIllum * sunT * (0.06 + hgPhase(cs, 0.55) * 0.9 + hgPhase(cs, -0.2) * 0.25)
             + uMoonIllum * moonT * (0.06 + hgPhase(cm, 0.55) * 0.9);
  vec3 amb = skyIrradiance(vec3(0.0, -1.0, 0.0)) * 0.12 + skyIrradiance(vec3(0.0, 1.0, 0.0)) * 0.05;
  vec3 c = (light + amb) * 0.85;
  return vec4(c, dens * 0.8);
}

void main() {
  vec3 dir = normalize(vDir);
  float px = length(fwidth(dir));
  float camR = ATM_RG + max(uCameraAltitude, 0.002);
  vec3 camPos = vec3(0.0, camR, 0.0);
  vec3 col = skyRadiance(dir);
  vec3 tview = atmLightTransmittance(camPos, dir);

  // Night sky: stars, the Milky Way and faint airglow, extinguished near the horizon.
  vec3 night = starField(dir, px) * uStarIntensity + vec3(0.12, 0.16, 0.3) * 3.0e-6;
  col += night * tview * (1.0 - uStorm);

  col += moonDisc(dir, px, tview) * (1.0 - 0.9 * uStorm);

  // Sun disc with limb darkening, plus a tight aureole from forward-scattering dust.
  float cs = dot(dir, uSunDir);
  float th = angleBetween(dir, uSunDir);
  float disc = 1.0 - smoothstep(SUN_R - px, SUN_R + px, th);
  if (disc > 0.0) {
    float mu = sqrt(max(0.0, 1.0 - (th * th) / (SUN_R * SUN_R)));
    vec3 limb = vec3(1.0) - vec3(0.4, 0.5, 0.62) * (1.0 - mu);
    col += uSunIllum * tview * limb * (disc / (ATM_PI * SUN_R * SUN_R)) * mix(1.0, 0.04, uStorm);
  }
  col += uSunIllum * tview * hgPhase(cs, 0.94) * (0.0025 + 0.01 * uDust) * (1.0 - uStorm);

  vec4 cl = cirrus(dir);
  col = mix(col, cl.rgb, cl.a * (1.0 - uStorm));

  // Sandstorm: suspended dust hides the sky, thinner toward the zenith.
  float swirl = 0.5 * stormNoise(dir.xz / max(dir.y + 0.35, 0.2) * 3.0 - uWindOffset * 0.004) + 0.5 * stormNoise(dir.xz * 9.0 + vec2(uTime * 0.05, 0.0));
  col = mix(col, probe(6) * (0.85 + 0.3 * swirl), uStorm * mix(1.0, 0.75 + 0.2 * swirl, max(dir.y, 0.0)));

  gl_FragColor = vec4(min(col * exposure(), vec3(60000.0)), 1.0);
}
`;

export class Sky {
  constructor(atmosphere) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        ...atmosphere.materialUniforms(),
        tTransmittance: U.tTransmittance,
        uSunDir: U.uSunDir,
        uMoonDir: U.uMoonDir,
        uTime: U.uTime,
        uCloud: U.uCloud,
        uDust: U.uDust,
        uWindOffset: U.uWindOffset,
        uStarRotation: U.uStarRotation,
        uStarIntensity: { value: 1.2e-3 },
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
      },
      depthWrite: false,
      depthTest: true,
      depthFunc: THREE.LessEqualDepth,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 50;
  }

  update(camera) {
    this.material.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    this.material.uniforms.uCamWorld.value.copy(camera.matrixWorld);
  }
}
