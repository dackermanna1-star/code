// Shared GLSL snippets and shared uniform objects for all world materials.
import * as THREE from 'three';

// Uniforms shared by reference across every world material, so a single
// update per frame reaches all of them.
export const shared = {
  uTime: { value: 0 },
  uIrrA: { value: null }, // rgb: baked bounce irradiance, a: sky visibility (up)
  uIrrB: { value: null }, // sky visibility for +X, -X, +Z, -Z facing normals
  uIrrMin: { value: new THREE.Vector3(-24, -1, -84) },
  uIrrInvSize: { value: new THREE.Vector3(1 / 48, 1 / 26, 1 / 116) },
  uSkyIrr: { value: new THREE.Color(0.2, 0.25, 0.35) }, // irradiance from an open sky on an up-facing surface
  uSkyIrrSide: { value: new THREE.Color(0.12, 0.14, 0.2) },
  uGroundIrr: { value: new THREE.Color(0.02, 0.02, 0.025) },
  uCanyonFill: { value: new THREE.Color(0.042, 0.038, 0.04) }, // light bounced between the alley walls
  uNoise3: { value: null }, // tiling 3D value noise (R8)
  uNoise2: { value: null }, // tiling 2D noise RGBA (independent channels)
  uWetness: { value: 1.0 },
  uCapsule: { value: [new THREE.Vector4(0, -100, 0, 0.0), new THREE.Vector4(0, -100, 0, 0.0)] }, // player capsule a/b (xyz, radius)
  uCapsuleLights: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, // nearby lights for capsule shadows (xyz, strength)
  uWind: { value: 0 },
  uExposure: { value: 1 },
  uFrame: { value: 0 }, // frame counter (stochastic alpha decorrelation under TAA)
};

export const GLSL_COMMON = /* glsl */ `
uniform float uTime;
uniform highp sampler3D uIrrA;
uniform highp sampler3D uIrrB;
uniform vec3 uIrrMin;
uniform vec3 uIrrInvSize;
uniform vec3 uSkyIrr;
uniform vec3 uSkyIrrSide;
uniform vec3 uGroundIrr;
uniform vec3 uCanyonFill;
uniform highp sampler3D uNoise3;
uniform sampler2D uNoise2;
uniform float uWetness;
uniform vec4 uCapsule[2];
uniform vec4 uCapsuleLights[3];
uniform float uWind;

uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
float h13(ivec3 p) { return float(pcg3d(uvec3(p)).x) * (1.0 / 4294967296.0); }
vec3 h33(ivec3 p) { return vec3(pcg3d(uvec3(p))) * (1.0 / 4294967296.0); }
float h12(ivec2 p) { return float(pcg3d(uvec3(p, 7919)).x) * (1.0 / 4294967296.0); }
vec2 h22(ivec2 p) { uvec3 r = pcg3d(uvec3(p, 104729)); return vec2(r.xy) * (1.0 / 4294967296.0); }
vec3 h32(ivec2 p) { return vec3(pcg3d(uvec3(p, 3571))) * (1.0 / 4294967296.0); }

int fdiv(int a, int b) { return a >= 0 ? a / b : -((-a + b - 1) / b); }
int fmodi(int a, int b) { return a - b * fdiv(a, b); }

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

float noise3(vec3 p) { return texture(uNoise3, p * (1.0 / 64.0)).r; }
float fbm3(vec3 p) {
  float s = 0.5 * noise3(p);
  s += 0.25 * noise3(p * 2.03 + 17.1);
  s += 0.125 * noise3(p * 4.11 + 31.7);
  return s / 0.875;
}
vec4 noise2(vec2 p) { return texture(uNoise2, p * (1.0 / 256.0)); }
vec4 noise2L(vec2 p) { return textureLod(uNoise2, p * (1.0 / 256.0), 0.0); }
float noise3L(vec3 p) { return textureLod(uNoise3, p * (1.0 / 64.0), 0.0).r; }

// Baked irradiance volume: sky visibility per facing direction + warm bounce.
vec3 sampleIrradiance(vec3 wp, vec3 n) {
  vec3 uvw = (wp + n * 0.22 - uIrrMin) * uIrrInvSize;
  vec4 A = texture(uIrrA, uvw);
  vec4 B = texture(uIrrB, uvw);
  vec3 nn = n * n;
  float sx = n.x >= 0.0 ? B.r : B.g;
  float sz = n.z >= 0.0 ? B.b : B.a;
  float skyUp = A.a;
  vec3 E = vec3(0.0);
  E += uSkyIrr * skyUp * (n.y > 0.0 ? nn.y : 0.0);
  E += uSkyIrrSide * (sx * nn.x + sz * nn.z);
  E += uGroundIrr * (0.35 + 0.65 * skyUp) * (n.y < 0.0 ? nn.y : 0.0);
  E += uGroundIrr * 0.5 * (nn.x + nn.z) * (0.5 + 0.5 * skyUp);
  // inter-reflection between the facing walls: where the sky is hidden you see a sky-lit wall
  float sideVis = sx * nn.x + sz * nn.z + skyUp * max(n.y, 0.0) * nn.y;
  E += uCanyonFill * (1.0 - clamp(sideVis, 0.0, 1.0)) * (0.35 + 0.65 * skyUp) * 1.5;
  E += A.rgb;
  return E;
}

float skyVisibility(vec3 wp, vec3 n) {
  vec3 uvw = (wp + n * 0.22 - uIrrMin) * uIrrInvSize;
  vec4 A = texture(uIrrA, uvw);
  vec4 B = texture(uIrrB, uvw);
  vec3 nn = n * n;
  float sx = n.x >= 0.0 ? B.r : B.g;
  float sz = n.z >= 0.0 ? B.b : B.a;
  return A.a * max(n.y, 0.0) + sx * nn.x + sz * nn.z + 0.15 * A.a;
}

// Soft occlusion of a light by the player's body (two capsules), so she casts
// a believable soft shadow from nearby lamps without dynamic shadow maps.
float capsuleOcclusion(vec3 p, vec3 lightPos, vec4 ca, vec4 cb) {
  vec3 L = lightPos - p;
  float dist = length(L);
  vec3 ld = L / dist;
  float occ = 0.0;
  for (int k = 0; k < 2; k++) {
    vec4 c = k == 0 ? ca : cb;
    // closest approach between segment p..light and the capsule center point c.xyz
    vec3 pc = c.xyz - p;
    float t = clamp(dot(pc, ld), 0.0, dist);
    float d = length(pc - ld * t);
    float r = c.w;
    float cone = r + t * 0.12; // penumbra grows with distance from the receiver
    occ = max(occ, (1.0 - smoothstep(r * 0.35, cone, d)) * smoothstep(0.0, 0.25, t));
  }
  return occ;
}

float playerShadow(vec3 p) {
  float s = 1.0;
  for (int i = 0; i < 3; i++) {
    vec4 L = uCapsuleLights[i];
    if (L.w <= 0.0) continue;
    s *= 1.0 - L.w * capsuleOcclusion(p, L.xyz, uCapsule[0], uCapsule[1]);
  }
  return s;
}
`;

/** Helper: inject custom code into a three.js built-in shader. */
export function patch(src, anchor, code, mode = 'replace') {
  if (!src.includes(anchor)) throw new Error(`shader anchor not found: ${anchor}`);
  if (mode === 'before') return src.replace(anchor, `${code}\n${anchor}`);
  if (mode === 'after') return src.replace(anchor, `${anchor}\n${code}`);
  return src.replace(anchor, code);
}

/** Creates tiling noise textures used by all shaders. */
export function createNoiseTextures(rngSeed = 7) {
  // 3D value noise, tiling, 64^3, smooth (trilinear sampled lattice of random values,
  // pre-blurred so a single tap behaves like smooth noise)
  const N = 64;
  const raw = new Float32Array(N * N * N);
  let s = rngSeed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < raw.length; i++) raw[i] = rnd();
  // separable box blur (radius 1) with wrap to make it smooth
  const blur = (src, axis) => {
    const dst = new Float32Array(src.length);
    for (let z = 0; z < N; z++)
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          let acc = 0;
          for (let o = -1; o <= 1; o++) {
            const xx = axis === 0 ? (x + o + N) % N : x;
            const yy = axis === 1 ? (y + o + N) % N : y;
            const zz = axis === 2 ? (z + o + N) % N : z;
            acc += src[xx + N * (yy + N * zz)] * (o === 0 ? 0.5 : 0.25);
          }
          dst[x + N * (y + N * z)] = acc;
        }
    return dst;
  };
  let b = blur(raw, 0);
  b = blur(b, 1);
  b = blur(b, 2);
  // normalize contrast
  let mn = 1, mx = 0;
  for (const v of b) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const d3 = new Uint8Array(N * N * N);
  for (let i = 0; i < b.length; i++) d3[i] = Math.round(((b[i] - mn) / (mx - mn)) * 255);
  const tex3 = new THREE.Data3DTexture(d3, N, N, N);
  tex3.format = THREE.RedFormat;
  tex3.type = THREE.UnsignedByteType;
  tex3.wrapS = tex3.wrapT = tex3.wrapR = THREE.RepeatWrapping;
  tex3.minFilter = tex3.magFilter = THREE.LinearFilter;
  tex3.unpackAlignment = 1;
  tex3.needsUpdate = true;

  // 2D noise: 256x256 RGBA, each channel a different smooth tiling noise
  const M = 256;
  const d2 = new Uint8Array(M * M * 4);
  const lattice = (period, ch) => {
    const L = new Float32Array(period * period);
    for (let i = 0; i < L.length; i++) L[i] = rnd();
    return (x, y) => {
      const fx = (x / M) * period, fy = (y / M) * period;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const g = (a, c) => L[((a % period) + period) % period + period * (((c % period) + period) % period)];
      const a = g(x0, y0), bb = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
      return a + (bb - a) * sx + (c - a) * sy + (a - bb - c + d) * sx * sy;
    };
  };
  const chans = [0, 1, 2, 3].map((c) => [lattice(8, c), lattice(16, c), lattice(32, c), lattice(64, c)]);
  for (let y = 0; y < M; y++)
    for (let x = 0; x < M; x++)
      for (let c = 0; c < 4; c++) {
        const [l1, l2, l3, l4] = chans[c];
        const v = (l1(x, y) * 0.5 + l2(x, y) * 0.25 + l3(x, y) * 0.15 + l4(x, y) * 0.1);
        d2[(x + y * M) * 4 + c] = Math.round(Math.min(1, Math.max(0, (v - 0.15) / 0.7)) * 255);
      }
  const tex2 = new THREE.DataTexture(d2, M, M, THREE.RGBAFormat);
  tex2.wrapS = tex2.wrapT = THREE.RepeatWrapping;
  tex2.minFilter = THREE.LinearMipmapLinearFilter;
  tex2.magFilter = THREE.LinearFilter;
  tex2.generateMipmaps = true;
  tex2.needsUpdate = true;

  shared.uNoise3.value = tex3;
  shared.uNoise2.value = tex2;
  return { tex3, tex2 };
}
