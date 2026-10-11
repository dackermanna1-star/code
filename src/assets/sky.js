// de_dust2 "des" skybox, generated procedurally on the GPU.
//
// The original CS skyboxes were Terragen renders squeezed into 256 px faces: a faded
// blue sky with big soft cumulus, a ring of brown rocky desert mountains close to the
// horizon and hazy purple-grey ranges (some with snow) further out. We reproduce that by
// ray-marching a small heightfield world (units: km, GoldSrc axes, eye 0.1 km above a
// flat desert basin: near massifs 4-13 km out, snow-capped ranges beyond 15 km, height-
// dependent haze) under a cumulus layer, once, into a WebGLCubeRenderTarget.
// Cost: ~6 x 256^2 texels, 1-2 terrain rays each; a few tens of ms on a real GPU.
//
// Orientation: the shader works in GoldSrc space ([x east, y north, z up]); three.js
// space is (x, z, -y). The cube is rendered with a CubeCamera, so the result is a
// render-target cube texture that three.js samples correctly as scene.background
// (no mirrored seams).

import * as THREE from 'three';

const DEFAULT_SUN = [-0.45, 0.35, 0.82];

// Palette shared by the shader and skyColors() (gamma-space 0..1, as written to screen).
const ZENITH = [0.36, 0.52, 0.83];
const MIDSKY = [0.46, 0.62, 0.88];
const HORIZON = [0.75, 0.81, 0.89];
const HAZE_HIGH = [0.64, 0.64, 0.82]; // aerial perspective on distant peaks (lilac-blue)
const HAZE_LOW = [0.74, 0.66, 0.56]; // dusty tan haze hugging the desert floor

const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uSun;       // toward the sun, GoldSrc space
uniform vec2 uSeedT;     // terrain noise offset
uniform vec2 uSeedC;     // cloud noise offset
uniform float uPix;      // angular size of one texel (radians)

#define ZENITH ${v3(ZENITH)}
#define MIDSKY ${v3(MIDSKY)}
#define HORIZON ${v3(HORIZON)}
#define HAZE_HIGH ${v3(HAZE_HIGH)}
#define HAZE_LOW ${v3(HAZE_LOW)}

#define EYE_Z 0.10          // km above the basin floor
#define TERRAIN_TOP 10.5    // km, upper bound of the heightfield
#define T_MAX 70.0          // km
#define CLOUD_Z 5.5         // km above the eye
#define TERRAIN_MAX_DZ 0.62 // rays steeper than this never hit terrain (~38 deg)

const mat2 M2 = mat2(0.80, -0.60, 0.60, 0.80);

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// value noise in [0,1] with analytic derivatives (quintic)
vec3 noised(vec2 x) {
  vec2 i = floor(x);
  vec2 f = x - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y,
              du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
}

float noise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = x - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm4(vec2 p) {
  float a = 0.0, b = 0.5;
  for (int i = 0; i < 4; i++) { a += b * noise(p); b *= 0.5; p = M2 * p * 2.03; }
  return a / 0.9375;
}

// ---------------------------------------------------------------- terrain
float fbm3(vec2 p) {
  float a = 0.0, b = 0.5;
  for (int i = 0; i < 3; i++) { a += b * noise(p); b *= 0.5; p = M2 * p * 2.03; }
  return a / 0.875;
}

// Eroded fbm (derivative-damped) with ridged upper octaves whose weight grows with the
// height reached so far (hybrid multifractal): smooth lower flanks, jagged crests.
float rockDetail(vec2 p, int oct) {
  float a = 0.0, b = 0.5;
  vec2 d = vec2(0.0);
  for (int i = 0; i < 9; i++) {
    if (i >= oct) break;
    vec3 n = noised(p);
    float w = 1.0;
    if (i >= 1) {
      float r = 1.0 - abs(2.0 * n.x - 1.0);
      n.x = mix(n.x, r * r, 0.75);
      w = clamp(0.35 + 1.5 * a, 0.35, 1.6);
    }
    d += n.yz;
    a += b * w * n.x / (1.0 + (i < 3 ? 0.3 : 0.1) * dot(d, d));
    b *= 0.56;
    p = M2 * p * 2.0;
  }
  return a;
}

// Periodic azimuth noise in [0,1] (sampled on a circle so there is no seam).
float azNoise(vec2 dir, float freq, float off) {
  return noise(dir * freq + off) * 0.65 + noise(dir * freq * 2.1 + off + 17.0) * 0.35;
}

// Per-ray azimuth masks. Every primary ray starts above the origin, so its azimuth (and these
// masks) are constant along it: computed once per ray in render() instead of per march step.
// x: inner radius of the near ring, y: near massif presence, z: far range height factor.
vec3 gAz;
void setAzimuth(vec2 dirXY) {
  vec2 dir = normalize(dirXY + vec2(1e-6, 0.0));
  gAz = vec3(3.6 + 2.2 * azNoise(dir, 1.3, uSeedT.y * 0.11 + 5.0),
             azNoise(dir, 1.9, uSeedT.x * 0.13),
             0.45 + 0.55 * smoothstep(0.35, 0.75, azNoise(dir, 2.3, 31.0 + uSeedT.y * 0.07)));
}

float terrainH(vec2 q, int oct) {
  float r = length(q);
  if (r < 3.0) return 0.0;
  vec2 p = q + uSeedT;
  if (r < 14.0) {
    // near massifs: a broken ring 4-11 km out whose inner edge wanders with azimuth
    float det = rockDetail(p * 0.34, oct);
    float nearRing = smoothstep(gAz.x - 0.4, gAz.x + 1.8, r) * (1.0 - smoothstep(9.0, 13.0, r));
    float mN = smoothstep(0.25, 0.55, 0.8 * gAz.y + 0.2 * noise(p * 0.13));
    float hills = 0.35 * smoothstep(3.0, 6.0, r) * (1.0 - smoothstep(11.0, 13.5, r));
    return nearRing * 3.6 * mN * (0.40 + 0.95 * det) + hills * det * det;
  }
  // far ranges 15 km+: broader, taller, snow-capped; seen through the gaps
  float det = rockDetail(p * 0.17 + 50.0, oct - 1);
  float farRing = smoothstep(14.5, 19.0, r);
  return farRing * 9.5 * gAz.z * (0.30 + 0.95 * det);
}

float terrainMarch(vec3 ro, vec3 rd, float tEnd) {
  // nothing stands within 3 km of the eye
  float t = 3.0 / max(length(rd.xy), 1e-3);
  if (t > tEnd) return -1.0;
  float tPrev = t;
  for (int i = 0; i < 200; i++) {
    vec3 p = ro + rd * t;
    if (t > tEnd) return -1.0;
    if (p.z > TERRAIN_TOP && rd.z >= 0.0) return -1.0;
    int oct = t < 8.0 ? 6 : 5;
    float h = p.z - terrainH(p.xy, oct);
    if (h < 0.0006 * t) {
      // refine between the last two samples
      float t0 = tPrev, t1 = t;
      for (int j = 0; j < 4; j++) {
        float tm = 0.5 * (t0 + t1);
        vec3 pm = ro + rd * tm;
        if (pm.z - terrainH(pm.xy, oct) < 0.0) t1 = tm; else t0 = tm;
      }
      return 0.5 * (t0 + t1);
    }
    tPrev = t;
    t += max(0.35 * h, 0.005 * t);
  }
  // out of steps: grazing rays skimming the basin floor fall back to the ground plane
  return (rd.z < 0.2 && rd.z > 0.0) ? t : -1.0;
}

vec3 terrainNormal(vec2 q, float eps, int oct) {
  float hx = terrainH(q + vec2(eps, 0.0), oct) - terrainH(q - vec2(eps, 0.0), oct);
  float hy = terrainH(q + vec2(0.0, eps), oct) - terrainH(q - vec2(0.0, eps), oct);
  return normalize(vec3(-hx, -hy, 2.0 * eps));
}

float terrainShadow(vec3 p, vec3 l) {
  float res = 1.0;
  float t = 0.02;
  for (int i = 0; i < 18; i++) {
    vec3 s = p + l * t;
    if (s.z > TERRAIN_TOP) break;
    float h = s.z - terrainH(s.xy, 4);
    res = min(res, 10.0 * h / t);
    if (res < 0.0) break;
    t += clamp(h, 0.03, 0.6);
  }
  return clamp(res, 0.0, 1.0);
}

// Optical depth of an exponential height-fog layer along a ray (k = 1 / scale height).
float fogDepth(float z0, float dz, float t, float k) {
  float e0 = exp(-k * z0);
  if (abs(dz) < 1e-4) return e0 * t;
  return e0 * (1.0 - exp(-k * dz * t)) / (k * dz);
}

// Aerial perspective: thin lilac-blue haze everywhere + a dusty tan layer hugging the floor.
vec3 applyHaze(vec3 col, vec3 ro, vec3 rd, float t) {
  float D = fogDepth(ro.z, rd.z, t, 0.30);
  float high = 0.024 * D * (1.0 + D / 7.0);  // clear up close, thick on the far ranges
  float dust = 0.07 * fogDepth(ro.z, rd.z, t, 4.0);
  float o = high + dust;
  float sunAmt = max(dot(normalize(rd.xy + 1e-5), normalize(uSun.xy + 1e-5)), 0.0);
  vec3 hz = mix(HAZE_HIGH, HAZE_LOW, dust / max(o, 1e-5)) * (0.97 + 0.08 * sunAmt);
  return mix(col, hz, 1.0 - exp(-o));
}

vec3 shadeTerrain(vec3 ro, vec3 rd, float t) {
  vec3 p = ro + rd * t;
  float eps = max(0.8 * t * uPix, 0.004);
  vec3 n = terrainNormal(p.xy, eps, t < 4.5 ? 8 : (t < 10.0 ? 7 : 6));
  float hLow = terrainH(p.xy, 3);

  // albedo: grey-brown rock with tan outcrops, olive scrub low down, dark crevice speckle
  vec2 tp = p.xy + uSeedT;
  float v1 = fbm4(tp * 1.3 + 3.0);
  float v3 = fbm4(tp * 0.6 + 7.0);
  vec3 rock = mix(vec3(0.36, 0.32, 0.27), vec3(0.57, 0.50, 0.36), smoothstep(0.32, 0.68, v1));
  rock = mix(rock, vec3(0.40, 0.39, 0.37), smoothstep(0.45, 0.72, v3) * 0.7);
  float olive = smoothstep(0.75, 0.92, n.z) * (1.0 - smoothstep(0.4, 1.2, p.z)) * smoothstep(0.4, 0.6, fbm4(tp * 2.2 + 9.0));
  rock = mix(rock, vec3(0.47, 0.44, 0.30), olive * 0.8);
  float sp = noise(tp * 13.0) * 0.55 + noise(tp * 29.0) * 0.45;
  rock *= 0.72 + 0.50 * sp;
  float bl = fbm4(tp * 7.0 + 21.0);
  rock *= 1.0 - 0.42 * smoothstep(0.50, 0.70, bl) * (1.0 - 0.4 * n.z);
  vec3 sand = vec3(0.56, 0.50, 0.40);
  float flatness = smoothstep(0.80, 0.96, n.z);
  vec3 alb = mix(rock, sand, flatness * 0.6);
  // snow on the distant high ranges: caps on the crests, streaks down the gullies
  float far = smoothstep(12.0, 16.0, length(p.xy));
  float snowLine = 3.3 + 0.6 * fbm4(tp * 0.5) - 0.5 * smoothstep(0.55, 0.8, fbm4(vec2(tp.x, tp.y) * 4.0 + 3.0));
  float snow = smoothstep(snowLine, snowLine + 0.2, p.z) * smoothstep(0.25, 0.6, n.z) * far;
  alb = mix(alb, vec3(0.93, 0.93, 0.97), snow);

  float dif = max(dot(n, uSun), 0.0);
  float sh = (dif > 0.0) ? terrainShadow(p + n * 0.01, uSun) : 0.0;
  // crevices: surface below its own low-frequency shape gets darker
  float crev = clamp(0.65 + (p.z - hLow) * 1.8, 0.3, 1.05);
  float occ = crev * (0.6 + 0.4 * n.z);

  vec3 sunCol = vec3(0.80, 0.75, 0.67);
  vec3 skyCol = vec3(0.78, 0.77, 0.90);
  vec3 bounce = vec3(0.22, 0.17, 0.13);
  vec3 lit = sunCol * dif * sh * mix(0.75, 1.0, crev) + skyCol * occ + bounce * occ * clamp(0.6 - 0.5 * n.z, 0.0, 1.0);
  vec3 col = alb * lit;

  return applyHaze(col, ro, rd, t);
}

vec3 shadeGround(vec3 ro, vec3 rd, float t) {
  vec3 p = ro + rd * t;
  float v = fbm4(p.xy * 0.8);
  vec3 alb = mix(vec3(0.66, 0.54, 0.40), vec3(0.74, 0.62, 0.46), v);
  vec3 col = alb * (vec3(1.10, 1.04, 0.95) * max(uSun.z, 0.0) + vec3(0.30, 0.30, 0.36));
  return applyHaze(col, ro, rd, t);
}

// ---------------------------------------------------------------- sky + clouds
vec3 skyGradient(vec3 rd) {
  float e = max(rd.z, 0.0);
  vec3 c = mix(HORIZON, MIDSKY, smoothstep(0.0, 0.35, e));
  c = mix(c, ZENITH, smoothstep(0.3, 1.0, e));
  float sd = max(dot(rd, uSun), 0.0);
  c += vec3(0.16, 0.13, 0.09) * pow(sd, 6.0) + vec3(0.05, 0.05, 0.04) * sd;
  return c;
}

// raw cloud density (~0..1); coverage threshold applied by the caller
float cloudRaw(vec2 p) {
  vec2 q = p * 0.15 + uSeedC;
  vec2 w = vec2(fbm3(q * 0.35 + 5.2), fbm3(q * 0.35 + 1.3)) - 0.5;
  q += 0.7 * w;
  float n = fbm4(q * 0.6);
  // billowy detail: puffy, cauliflower edges
  float bil = 0.0, b = 0.5;
  vec2 pq = q * 2.6;
  for (int i = 0; i < 3; i++) { bil += b * abs(2.0 * noise(pq) - 1.0); b *= 0.5; pq = M2 * pq * 2.1; }
  return 0.5 + (n - 0.5) * 2.3 + (0.42 - bil) * 0.35;
}

#define CLOUD_COVER 0.42

vec4 clouds(vec3 rd) {
  if (rd.z <= 0.005) return vec4(0.0);
  float t = CLOUD_Z / rd.z;
  vec2 p = rd.xy * t;
  float n0 = cloudRaw(p);
  float a = smoothstep(CLOUD_COVER, CLOUD_COVER + 0.26, n0);
  if (a <= 0.0) return vec4(0.0);
  // light: brighter where the cloud thins toward the sun, greyer in thick bodies
  vec2 sxy = uSun.xy / max(length(uSun.xy), 1e-3) * (0.4 + 0.9 * length(uSun.xy));
  float n1 = cloudRaw(p + sxy * 1.0);
  float thick = clamp((n0 - CLOUD_COVER) * 2.2, 0.0, 1.0);
  float lit = clamp(0.78 + (n0 - n1) * 3.2 - 0.60 * thick, 0.0, 1.0);
  vec3 shadow = vec3(0.56, 0.60, 0.75);
  vec3 bright = vec3(0.96, 0.97, 0.98);
  vec3 col = mix(shadow, bright, smoothstep(0.0, 1.0, lit));
  // silver lining toward the sun
  float fw = pow(max(dot(rd, uSun), 0.0), 4.0);
  col += vec3(0.18, 0.17, 0.14) * fw * (1.0 - thick);
  // fade into the horizon haze with distance
  col = mix(HORIZON * 1.03, col, exp(-t * 0.012));
  a *= smoothstep(0.01, 0.09, rd.z);
  return vec4(col, a);
}

vec3 skyColor(vec3 rd) {
  vec4 cl = clouds(rd);
  return mix(skyGradient(rd), cl.rgb, cl.a);
}

// Terrain / desert floor for one ray; 'sky' is used when the ray escapes.
vec3 render(vec3 rd, vec3 sky) {
  vec3 ro = vec3(0.0, 0.0, EYE_Z);
  setAzimuth(rd.xy);
  float tGround = rd.z < 0.0 ? EYE_Z / -rd.z : 1e9;
  float t = rd.z < TERRAIN_MAX_DZ ? terrainMarch(ro, rd, min(tGround, T_MAX)) : -1.0;
  if (t > 0.0) return shadeTerrain(ro, rd, t);
  if (rd.z < 0.0) return shadeGround(ro, rd, tGround);
  return sky;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 g = vec3(d.x, -d.z, d.y);  // three -> GoldSrc
  vec3 gx = dFdx(g), gy = dFdy(g);
  vec3 sky = g.z > -0.02 ? skyColor(g) : vec3(0.0);
  vec3 col;
  // rotated-grid supersampling of the terrain (Terragen renders were anti-aliased);
  // the sky/cloud part is smooth and evaluated once per texel
#if SAMPLES >= 4
  col  = render(normalize(g + gx * 0.125 + gy * 0.375), sky);
  col += render(normalize(g - gx * 0.375 + gy * 0.125), sky);
  col += render(normalize(g + gx * 0.375 - gy * 0.125), sky);
  col += render(normalize(g - gx * 0.125 - gy * 0.375), sky);
  col *= 0.25;
#elif SAMPLES >= 2
  col  = render(normalize(g + gx * 0.25 + gy * 0.25), sky);
  col += render(normalize(g - gx * 0.25 - gy * 0.25), sky);
  col *= 0.5;
#else
  col = render(g, sky);
#endif
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
// SwiftShader / llvmpipe: keep generation cheap (1 ray per texel instead of 2).
function isSoftwareGL(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    return /swiftshader|llvmpipe|software|softpipe/i.test(name);
  } catch (e) {
    return false;
  }
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Render the dust2 skybox into a cube render target (deterministic for a given seed).
 * @param {THREE.WebGLRenderer} renderer
 * @param {object} [opts]
 * @param {number[]} [opts.sunDir] normalized direction TOWARD the sun, GoldSrc space
 *   [x east, y north, z up]; lights the mountains, the clouds and the sky glow.
 * @param {number} [opts.faceSize=256] texels per cube face (GoldSrc skies were 256).
 * @param {number} [opts.seed=1337] terrain/cloud layout seed.
 * @param {number|'auto'} [opts.samples='auto'] terrain rays per texel (1, 2 or 4);
 *   'auto' = 2 on GPUs, 1 on software GL (SwiftShader/llvmpipe).
 * @returns {THREE.CubeTexture} render-target cube texture for a Y-up three.js scene where
 *   GoldSrc (x, y, z) = three (x, z, -y); assign to scene.background.
 *   texture.userData.dispose() frees the underlying render target.
 */
export function createSky(renderer, { sunDir = DEFAULT_SUN, faceSize = 256, seed = 1337, samples = 'auto' } = {}) {
  const t0 = performance.now();
  if (samples === 'auto') samples = isSoftwareGL(renderer) ? 1 : 2;
  const sun = new THREE.Vector3(...sunDir).normalize();
  const rand = mulberry32(seed);
  const seedT = new THREE.Vector2(rand() * 200 - 100, rand() * 200 - 100);
  const seedC = new THREE.Vector2(rand() * 200 - 100, rand() * 200 - 100);

  const rt = new THREE.WebGLCubeRenderTarget(faceSize, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  rt.texture.name = 'sky_des';

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: { SAMPLES: samples >= 4 ? 4 : samples >= 2 ? 2 : 1 },
    uniforms: {
      uSun: { value: sun },
      uSeedT: { value: seedT },
      uSeedC: { value: seedC },
      uPix: { value: Math.PI / 2 / faceSize },
    },
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });
  const geo = new THREE.BoxGeometry(2, 2, 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const cam = new THREE.CubeCamera(0.1, 10, rt);
  scene.add(cam);

  const prevAutoClear = renderer.autoClear;
  const prevToneMapping = renderer.toneMapping;
  renderer.autoClear = true;
  renderer.toneMapping = THREE.NoToneMapping;
  cam.update(renderer, scene);
  renderer.autoClear = prevAutoClear;
  renderer.toneMapping = prevToneMapping;

  geo.dispose();
  mat.dispose();

  const tex = rt.texture;
  tex.userData.dispose = () => rt.dispose();
  tex.userData.renderTarget = rt;
  tex.userData.genMs = performance.now() - t0; // CPU-side submit time (GPU may still be busy)
  return tex;
}

/**
 * Average colours of the default sky (0..1, gamma space as displayed), measured from the
 * generated cube (tools/preview/sky.html?stats=1):
 *  zenith  - mean above 60 deg elevation (blue sky + clouds)
 *  horizon - mean of the 0..4 deg band (mountain feet in dusty haze): fog / clear colour
 *  ambient - cosine-weighted mean of the upper hemisphere: sky light for the lightmap baker
 *  haze    - clear-sky colour right at the horizon (what the far ranges fade into)
 *  ground  - mean below -5 deg (dusty tan fill under the horizon)
 */
export function skyColors() {
  return {
    zenith: [0.67, 0.75, 0.9],
    horizon: [0.51, 0.46, 0.44],
    ambient: [0.62, 0.69, 0.84],
    haze: HORIZON.slice(),
    ground: [0.81, 0.64, 0.47],
  };
}
