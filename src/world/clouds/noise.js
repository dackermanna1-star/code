import * as THREE from 'three';

// =============================================================================
// Cloud noise textures, generated at startup.
//
//  * tBase   (3D, 128³ / 64³ at low, RGBA8, mipmapped, tiles every BASE_TILE m)
//      R = Perlin-Worley, G/B/A = Worley fBm at 4 / 8 / 16 cells per tile
//  * tDetail (3D, 32³, RGBA8, tiles every DETAIL_TILE m)
//      R/G/B = Worley fBm at 2 / 4 / 8 cells per tile (erosion detail)
//  * tCirrus (2D, 512², RGBA8, tiles every CIRRUS_TILE m): streaky ice clouds
//      (GPU, all three via full-screen passes into render targets)
//  * weather (2D, 256², RGBA, CPU so densityAt() matches the shader exactly)
//      R = cumulus cell field   (tile WEATHER_TILE)
//      G = stratocumulus field  (tile WEATHER_TILE)
//      B = cumulus height / type (tile WEATHER_TILE)
//      A = macro field (sampled at WEATHER_TILE * MACRO_SCALE: deck breaks, regional variation)
//
// Every tile size divides NOISE_PERIOD, so shaders can sample at
// (camera-relative position + camera position mod NOISE_PERIOD) without any
// precision loss over a 600 km route.
// =============================================================================

export const NOISE_PERIOD = 163840;
export const BASE_TILE = 4096;
export const DETAIL_TILE = 512;
export const WEATHER_TILE = 40960;
export const MACRO_SCALE = 4;            // macro channel tile = 163840 m
export const CIRRUS_TILE = 40960;
export const WEATHER_SIZE = 256;

const FS_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const NOISE_GLSL = /* glsl */`
vec3 nHash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
// tileable inverted Worley F1 (1 at feature points), p in cells, period in cells
float worley(vec3 p, float period) {
  vec3 id = floor(p), f = p - id;
  float d = 1e9;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 c = mod(id + o, period);
    vec3 r = o + nHash33(c + 0.37) - f;
    d = min(d, dot(r, r));
  }
  return 1.0 - clamp(sqrt(d), 0.0, 1.0);
}
float worleyFbm(vec3 u, float freq) {
  return worley(u * freq, freq) * 0.625 + worley(u * freq * 2.0, freq * 2.0) * 0.25 + worley(u * freq * 4.0, freq * 4.0) * 0.125;
}
// tileable gradient noise
float gnoise(vec3 p, float period) {
  vec3 i = floor(p), f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n[8];
  for (int k = 0; k < 8; k++) {
    vec3 o = vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    vec3 g = nHash33(mod(i + o, period) + 11.7) * 2.0 - 1.0;
    n[k] = dot(normalize(g + 1e-4), f - o);
  }
  return mix(mix(mix(n[0], n[1], u.x), mix(n[2], n[3], u.x), u.y), mix(mix(n[4], n[5], u.x), mix(n[6], n[7], u.x), u.y), u.z);
}
float perlinFbm(vec3 u, float freq, int oct) {
  float s = 0.0, a = 0.5, w = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * gnoise(u * freq, freq); w += a;
    freq *= 2.0; a *= 0.5;
  }
  return s / w;
}
float nRemap(float x, float a, float b, float c, float d) { return c + (x - a) / (b - a) * (d - c); }
`;

const BASE_FRAG = /* glsl */`
${NOISE_GLSL}
uniform float uZ;
varying vec2 vUv;
void main() {
  vec3 u = vec3(vUv, uZ);
  float pf = clamp(perlinFbm(u, 4.0, 5) * 0.75 + 0.5, 0.0, 1.0);
  float w1 = worleyFbm(u, 4.0);
  float pw = clamp(nRemap(pf, w1 - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0);
  gl_FragColor = vec4(pw, w1, worleyFbm(u, 8.0), worleyFbm(u, 16.0));
}`;

const DETAIL_FRAG = /* glsl */`
${NOISE_GLSL}
uniform float uZ;
varying vec2 vUv;
void main() {
  vec3 u = vec3(vUv, uZ);
  gl_FragColor = vec4(worleyFbm(u, 2.0), worleyFbm(u, 4.0), worleyFbm(u, 8.0), 1.0);
}`;

// Cirrus: wind-sheared streaks (fibrous) with domain warping; R = fibrous cirrus, G = smooth veil (cirrostratus)
const CIRRUS_FRAG = /* glsl */`
${NOISE_GLSL}
varying vec2 vUv;
void main() {
  vec3 u = vec3(vUv, 0.0);
  // domain warp (large scale) so the streaks bend
  vec2 wp = vec2(gnoise(vec3(vUv * 3.0, 0.3), 3.0), gnoise(vec3(vUv * 3.0, 4.1), 3.0));
  vec2 q = vUv + wp * 0.06;
  // anisotropic: features stretched along x (the wind)
  float streak = 0.0, a = 0.5, f = 4.0;
  for (int i = 0; i < 5; i++) {
    float n = gnoise(vec3(q.x * f, q.y * f * 6.0, 1.7 + float(i)), f);
    streak += a * (1.0 - abs(n * 2.0));
    a *= 0.5; f *= 2.0;
  }
  float patches = perlinFbm(vec3(vUv, 0.5), 3.0, 4) * 0.5 + 0.5;
  float fib = clamp((streak - 0.55) * 2.2, 0.0, 1.0) * smoothstep(0.35, 0.7, patches);
  float veil = smoothstep(0.3, 0.8, perlinFbm(vec3(vUv * vec2(1.0, 2.0), 2.5), 2.0, 5) * 0.5 + 0.5);
  gl_FragColor = vec4(fib, veil, patches, 1.0);
}`;

function fsMaterial(fragmentShader, uniforms = {}) {
  return new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });
}

/** Generate the full mip chain of a render-target texture once (three only does it after each render). */
function buildMips(r, tex) {
  const gl = r.getContext();
  const p = r.properties.get(tex);
  if (!p || !p.__webglTexture) return;
  const target = tex.isData3DTexture ? gl.TEXTURE_3D : gl.TEXTURE_2D;
  r.state.bindTexture(target, p.__webglTexture);
  gl.generateMipmap(target);
  r.state.unbindTexture();
}

/** Generate the 3D noise textures on the GPU. */
export function createNoiseTextures(app) {
  const t0 = performance.now();
  const low = (app.quality?.detail ?? 1) === 0;
  const baseSize = low ? 64 : 128;
  const r = app.renderer;
  const fs = app.pipeline;
  // pipeline.fullscreen() calls setRenderTarget(target) which would reset the layer; draw directly instead
  const draw = (mat, rt, layer) => {
    fs._fsMesh.material = mat;
    r.setRenderTarget(rt, layer);
    r.render(fs._fsScene, fs._fsCam);
  };
  const gen = (size, frag) => {
    const rt = new THREE.WebGL3DRenderTarget(size, size, size, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false });
    const tex = rt.texture;
    tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = false;
    const mat = fsMaterial(frag, { uZ: { value: 0 } });
    for (let z = 0; z < size; z++) {
      mat.uniforms.uZ.value = (z + 0.5) / size;
      draw(mat, rt, z);
    }
    mat.dispose();
    buildMips(r, tex);
    return rt;
  };
  const prev = r.getRenderTarget();
  const base = gen(baseSize, BASE_FRAG);
  const detail = gen(32, DETAIL_FRAG);
  // cirrus (2D)
  const crt = new THREE.WebGLRenderTarget(512, 512, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  crt.texture.colorSpace = THREE.NoColorSpace;
  const cmat = fsMaterial(CIRRUS_FRAG);
  crt.texture.generateMipmaps = false;
  draw(cmat, crt, 0);
  buildMips(r, crt.texture);
  cmat.dispose();
  r.setRenderTarget(prev);
  const ms = performance.now() - t0;
  return { base, detail, cirrus: crt, baseSize, ms };
}

// ----------------------------------------------------------------------------- CPU weather map
function hash3(ix, iy, s) {
  let h = (Math.imul(ix | 0, 0x8da6b343) ^ Math.imul(iy | 0, 0xd8163841) ^ Math.imul(s | 0, 0xcb1ab31f)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
const mod = (a, n) => ((a % n) + n) % n;
/** tileable value-gradient noise in [-1, 1] (period in cells) */
function gnoise2(x, y, period, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const g = (cx, cy, ox, oy) => {
    const a = hash3(mod(cx, period), mod(cy, period), seed) * Math.PI * 2;
    return Math.cos(a) * (fx - ox) + Math.sin(a) * (fy - oy);
  };
  const n00 = g(ix, iy, 0, 0), n10 = g(ix + 1, iy, 1, 0), n01 = g(ix, iy + 1, 0, 1), n11 = g(ix + 1, iy + 1, 1, 1);
  const a = n00 + (n10 - n00) * ux, b = n01 + (n11 - n01) * ux;
  return (a + (b - a) * uy) * 1.41;
}
function fbm2(u, v, freq, oct, seed, gain = 0.5) {
  let s = 0, a = 0.5, w = 0;
  for (let i = 0; i < oct; i++) { s += a * gnoise2(u * freq, v * freq, freq, seed + i * 7); w += a; freq *= 2; a *= gain; }
  return s / w;
}
/** tileable inverted Worley F1 */
function worley2(u, v, freq, seed) {
  const x = u * freq, y = v * freq, ix = Math.floor(x), iy = Math.floor(y);
  let d = 1e9;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = mod(ix + ox, freq), cy = mod(iy + oy, freq);
    const px = ix + ox + hash3(cx, cy, seed) - x, py = iy + oy + hash3(cx, cy, seed + 1) - y;
    d = Math.min(d, px * px + py * py);
  }
  return 1 - Math.min(1, Math.sqrt(d));
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Weather map (RGBA float 0..1). Returns { data: Uint8Array, float: Float32Array, size, texture }. */
export function createWeatherMap(size = WEATHER_SIZE) {
  const t0 = performance.now();
  const n = size * size;
  const f = new Float32Array(n * 4);
  for (let j = 0; j < size; j++) {
    const v = (j + 0.5) / size;
    for (let i = 0; i < size; i++) {
      const u = (i + 0.5) / size;
      // R: cumulus cells (~2-3 km), clustered by a lower-frequency field
      const cells = worley2(u, v, 16, 3) * 0.7 + worley2(u, v, 32, 9) * 0.3;
      const cluster = fbm2(u, v, 4, 3, 21) * 0.5 + 0.5;
      const pn = fbm2(u, v, 16, 3, 41) * 0.5 + 0.5;
      const cu = clamp01(cells * 0.75 + pn * 0.35 + (cluster - 0.5) * 0.55 - 0.08);
      // G: stratocumulus deck: rolls / cells with holes
      const sc = clamp01(fbm2(u, v, 6, 5, 77) * 0.55 + 0.5 + (worley2(u, v, 24, 13) - 0.5) * 0.35);
      // B: cumulus height / type
      const ht = clamp01(fbm2(u, v, 12, 3, 101) * 0.6 + 0.5 + (worley2(u, v, 16, 3) - 0.5) * 0.4);
      // A: macro (deck breaks, regional variation), used at 4x the tile size
      const mac = clamp01(fbm2(u, v, 4, 4, 131) * 0.65 + 0.5);
      const k = (j * size + i) * 4;
      f[k] = cu; f[k + 1] = sc; f[k + 2] = ht; f[k + 3] = mac;
    }
  }
  const data = new Uint8Array(n * 4);
  for (let k = 0; k < n * 4; k++) data[k] = Math.round(f[k] * 255);
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  // CPU copy uses the quantised values so it matches the GPU
  for (let k = 0; k < n * 4; k++) f[k] = data[k] / 255;
  return { data, float: f, size, texture: tex, ms: performance.now() - t0 };
}

/** Bilinear, wrapped sample of the weather map. u, v in tile units. out = [r, g, b, a]. */
export function sampleWeather(wm, u, v, out) {
  const s = wm.size, f = wm.float;
  const x = u * s - 0.5, y = v * s - 0.5;
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const x0 = mod(ix, s), x1 = mod(ix + 1, s), y0 = mod(iy, s), y1 = mod(iy + 1, s);
  const a = (y0 * s + x0) * 4, b = (y0 * s + x1) * 4, c = (y1 * s + x0) * 4, d = (y1 * s + x1) * 4;
  for (let k = 0; k < 4; k++) {
    const t = f[a + k] + (f[b + k] - f[a + k]) * fx;
    const w = f[c + k] + (f[d + k] - f[c + k]) * fx;
    out[k] = t + (w - t) * fy;
  }
  return out;
}
