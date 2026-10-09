// Drawing the ground of Vice City (world/ground.js): one flat 32x32 grid drawn
// many times (instanced) as the tiles of a quadtree - small, detailed tiles
// near the camera, big coarse ones far away - lifted by the vertex shader to
// the height map (a float texture). The fragment shader blends the ground's
// nine layers (lawn, sand, wet sand, mud, gravel, dry lawn, seabed, rock,
// dirt) by its weight maps, using the shared photo texture array, each scan
// recoloured for Miami (lush lawns, pale sand), with normal maps, a second
// sample at another scale to hide the tiling and slow large-scale variation.
//
//   const tv = new TerrainView(world, ground);   tv.update(camera);   tv.setWet(0..1)
//   groundTexture(ground) -> DataTexture RG32F (r = height, g = signed coast distance, inland +), shared
//   groundGLSL(ground)    -> GLSL: uniform sampler2D hMap; float hAt(vec2 xz); float coastAt(vec2 xz);
import * as THREE from 'three';
import { V } from '../state.js';
import { viceTextures, TEX_LAYER, texAvg, noiseTex, cloudTex } from './textures.js';

const GRID = 32;
// the ground layers (ground.js LAYERS) -> photo scan, size of one repeat (studs), roughness,
// target colour (sRGB), how much of the scan's own colour to keep, contrast
const LAYER_DEF = [
  { tex: 'lawn', scale: 11, rough: 0.94, col: '#557f34', sat: 0.6, con: 1.0 },     // lawn: lush St. Augustine grass
  { tex: 'sand', scale: 9, rough: 0.96, col: '#e2d2b0', sat: 0.4, con: 0.65 },      // beach sand: pale
  { tex: 'wetSand', scale: 10, rough: 0.64, col: '#a89676', sat: 0.4, con: 0.7 },   // wet sand: darker, shiny
  { tex: 'wetSand', scale: 12, rough: 0.6, col: '#5c573f', sat: 0.3, con: 0.9 },    // mangrove mud
  { tex: 'gravel', scale: 14, rough: 0.9, col: '#a59a88', sat: 0.4, con: 0.9 },     // gravel
  { tex: 'lawn', scale: 13, rough: 0.95, col: '#8d955a', sat: 0.55, con: 1.0 },     // dry lawn
  { tex: 'sand', scale: 14, rough: 0.9, col: '#e4dfcc', sat: 0.25, con: 0.6 },      // seabed (seen through the water)
  { tex: 'concrete', scale: 9, rough: 0.85, col: '#a9a59b', sat: 0.2, con: 1.4 },   // riprap
  { tex: 'gravel', scale: 12, rough: 0.95, col: '#8c7658', sat: 0.5, con: 0.9 },    // dirt
];

const lumL = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

// ---- beyond the map: the Everglades -----------------------------------------------------------------------------------
// An integer value noise that GLSL and JS compute alike (so the tree islands placed from JS stay
// out of the water the shader carves). Sloughs run north-south, as the real ones do.
const GLADE_GLSL = `
float vcHash(vec2 c) {
  uvec2 q = uvec2(c + 8192.0);
  uint h = q.x * 374761393u + q.y * 668265263u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h ^= h >> 16u;
  return float(h & 65535u) / 65535.0;
}
float vcNoise(vec2 x) {
  vec2 i = floor(x), f = x - i; f = f * f * (3.0 - 2.0 * f);
  return mix(mix(vcHash(i), vcHash(i + vec2(1.0, 0.0)), f.x), mix(vcHash(i + vec2(0.0, 1.0)), vcHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// 0: sawgrass .. 1: open water
float vcSlough(vec2 xz) {
  float n = vcNoise(xz * vec2(1.0 / 700.0, 1.0 / 2300.0)) * 0.62 + vcNoise(xz / 260.0 + 31.0) * 0.38;
  return smoothstep(0.5, 0.58, n);
}
// tree islands (hardwood hammocks) on the dry ground between the sloughs
float vcHammock(vec2 xz) { return smoothstep(0.6, 0.7, vcNoise(xz / 330.0 + 57.0) * 0.75 + vcNoise(xz / 90.0 + 5.0) * 0.25); }`;
const _hash = (cx, cz) => {
  const qx = (cx + 8192) >>> 0, qz = (cz + 8192) >>> 0;
  let h = (Math.imul(qx, 374761393) + Math.imul(qz, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h & 65535) / 65535;
};
const _sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function gNoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z); let u = x - i, v = z - j; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  const a = _hash(i, j), b = _hash(i + 1, j), c = _hash(i, j + 1), d = _hash(i + 1, j + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
/** JS twins of the shader's vcSlough / vcHammock (0..1). */
export const glade = {
  slough: (x, z) => _sm(0.5, 0.58, gNoise(x / 700, z / 2300) * 0.62 + gNoise(x / 260 + 31, z / 260 + 31) * 0.38),
  hammock: (x, z) => _sm(0.6, 0.7, gNoise(x / 330 + 57, z / 330 + 57) * 0.75 + gNoise(x / 90 + 5, z / 90 + 5) * 0.25),
};

/** The ground as a float texture: r = height, g = coast distance. Shared per ground. */
export function groundTexture(G) {
  if (G._vcTex) return G._vcTex;
  const N = G.N, d = new Float32Array(N * N * 2);
  for (let k = 0; k < N * N; k++) { d[k * 2] = G.h[k]; d[k * 2 + 1] = G.coastD ? G.coastD[k] : 0; }
  const t = new THREE.DataTexture(d, N, N, THREE.RGFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.needsUpdate = true;
  G._vcTex = t;
  return t;
}

/** GLSL for the ground texture: manual bilinear lookups (float textures aren't always filterable). */
export function groundGLSL(G) {
  const f = (v) => v.toFixed(1);
  return `
uniform sampler2D hMap;
${GLADE_GLSL}
float vcOut(vec2 xz) { return max(max(-${f(G.HALF)} - xz.x, xz.x - ${f(G.HALF)}), max(-${f(G.HALF)} - xz.y, xz.y - ${f(G.HALF)})); }
vec2 groundAt(vec2 xz) {
  vec2 f = (xz + ${f(G.HALF)}) / ${f(G.CELL)};
  vec2 i = floor(f);
  vec2 t = clamp(f - i, 0.0, 1.0);
  ivec2 c = ivec2(clamp(i, vec2(0.0), vec2(${f(G.N - 2)})));
  vec2 a = texelFetch(hMap, c, 0).rg, b = texelFetch(hMap, c + ivec2(1, 0), 0).rg;
  vec2 d = texelFetch(hMap, c + ivec2(0, 1), 0).rg, e = texelFetch(hMap, c + ivec2(1, 1), 0).rg;
  vec2 r = mix(mix(a, b, t.x), mix(d, e, t.x), t.y);
  // past the edge of the map the heights repeat the edge, but the sea gets deep - and the
  // mainland turns into the Everglades: sawgrass prairie cut by sloughs of open water
  float o = vcOut(xz);
  if (o > 0.0) {
    if (r.x < 0.0) r.x = mix(r.x, -40.0, smoothstep(0.0, 1600.0, o));
    else if (r.x > 1.0) r.x = mix(r.x, -1.6, vcSlough(xz) * smoothstep(60.0, 420.0, o));
  }
  return r;
}
float hAt(vec2 xz) { return groundAt(xz).r; }
float coastAt(vec2 xz) { return groundAt(xz).g; }`;
}

function gridGeometry() {
  const V1 = GRID + 1;
  const pos = [], skirt = [], idx = [];
  for (let j = 0; j < V1; j++) for (let i = 0; i < V1; i++) { pos.push(i / GRID, 0, j / GRID); skirt.push(0); }
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const a = j * V1 + i, b = a + 1, c = a + V1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // skirts: each edge vertex again, pulled down in the shader, joined to the edge
  const edge = (list) => {
    const base = pos.length / 3;
    for (const k of list) { pos.push(pos[k * 3], 0, pos[k * 3 + 2]); skirt.push(1); }
    for (let q = 0; q < list.length - 1; q++) { const a = list[q], b = list[q + 1], a2 = base + q, b2 = base + q + 1; idx.push(a, b, a2, b, b2, a2); }
  };
  const top = [], bottom = [], left = [], right = [];
  for (let i = 0; i < V1; i++) { top.push(i); bottom.push(GRID * V1 + (GRID - i)); left.push((GRID - i) * V1); right.push(i * V1 + GRID); }
  edge(top); edge(right); edge(bottom); edge(left);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('skirt', new THREE.Float32BufferAttribute(skirt, 1));
  g.setIndex(idx);
  return g;
}

export class TerrainView {
  constructor(world, ground) {
    this.world = world; this.G = ground;
    const G = ground, N = G.N;
    const W = G.weights();
    this.weightTex = W.map((data) => { const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat); t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; });
    this.hTex = groundTexture(G);
    const tex = viceTextures(world.renderer);
    const geo = gridGeometry();
    this.maxTiles = 720;
    this.tileAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.maxTiles * 3), 3);
    this.tileAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('tile', this.tileAttr);
    geo.instanceCount = 0;
    this.geo = geo;
    // per-layer constants
    const lay = [], scale = [], rough = [], target = [], avgL = [], sat = [], con = [];
    for (const d of LAYER_DEF) {
      lay.push(TEX_LAYER[d.tex] ?? 0); scale.push(d.scale); rough.push(d.rough); sat.push(d.sat); con.push(d.con);
      target.push(new THREE.Vector3().setFromColor(new THREE.Color(d.col)));
      avgL.push(Math.max(0.02, lumL(texAvg(d.tex))));
    }
    const uni = {
      hMap: { value: this.hTex }, wT0: { value: this.weightTex[0] }, wT1: { value: this.weightTex[1] }, wT2: { value: this.weightTex[2] },
      gCol: tex.col, gNor: tex.nor, noiseT: { value: noiseTex() },
      uLay: { value: lay }, uScale: { value: scale }, uRough: { value: rough }, uTarget: { value: target }, uAvgL: { value: avgL }, uSat: { value: sat }, uCon: { value: con },
      wet: { value: 0 }, cauT: { value: cloudTex() }, time: { value: 0 }, causI: { value: 1 },
    };
    this.uniforms = uni;
    const HG = groundGLSL(G), f = (v) => v.toFixed(1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec3 tile; attribute float skirt;
varying vec3 vW; varying vec3 vWN;
${HG}`)
        .replace('#include <beginnormal_vertex>', `
vec2 wxz = tile.xy + position.xz * tile.z;
float e = ${f(G.CELL)};
float hL = hAt(wxz - vec2(e, 0.0)), hR = hAt(wxz + vec2(e, 0.0)), hD = hAt(wxz - vec2(0.0, e)), hU = hAt(wxz + vec2(0.0, e));
vec3 objectNormal = normalize(vec3(hL - hR, 2.0 * e, hD - hU));
vWN = objectNormal;`)
        .replace('#include <begin_vertex>', `
vec3 transformed = vec3(wxz.x, hAt(wxz) - skirt * (2.0 + tile.z * 0.03), wxz.y);
vW = transformed;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray gCol, gNor;
uniform sampler2D wT0, wT1, wT2, noiseT, cauT;
uniform float uLay[9], uScale[9], uRough[9], uAvgL[9], uSat[9], uCon[9], wet, time, causI;
uniform vec3 uTarget[9];
varying vec3 vW; varying vec3 vWN;
${GLADE_GLSL}
float gWeights[9];
vec3 gNormalT;
float gRough;
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 recolor(vec3 s, int q) {
  vec3 n = s / uAvgL[q];
  n = mix(vec3(lum(n)), n, uSat[q]);
  n = max(1.0 + (n - 1.0) * uCon[q], 0.0);
  return n * uTarget[q];
}`)
        .replace('#include <map_fragment>', `
{
  vec2 wuv = ((vW.xz + ${f(G.HALF)}) / ${f(G.CELL)} + 0.5) / ${f(G.N)};
  vec4 a = texture(wT0, wuv), b = texture(wT1, wuv); float c = texture(wT2, wuv).r;
  gWeights[0] = a.r; gWeights[1] = a.g; gWeights[2] = a.b; gWeights[3] = a.a;
  gWeights[4] = b.r; gWeights[5] = b.g; gWeights[6] = b.b; gWeights[7] = b.a; gWeights[8] = c;
  float dist = length(vW - cameraPosition);
  bool near = dist < 520.0;
  vec3 mac = texture(noiseT, vW.xz / 1100.0).rgb;
  float macro2 = texture(noiseT, vW.xz / 173.0 + 0.37).g;
  vec3 col = vec3(0.0); vec3 nrm = vec3(0.0); float rough = 0.0; float wsum = 0.0;
  vec3 Ngw = normalize(vWN);
  for (int q = 0; q < 9; q++) {
    float w = gWeights[q];
    if (w < 0.004) continue;
    float L = uLay[q];
    vec2 uv = vW.xz / uScale[q];
    vec4 s;
    if (q == 7 && Ngw.y < 0.85) {
      // steep rock: project the texture from three sides so the bank isn't smeared
      vec3 bw = pow(abs(Ngw), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
      s = texture(gCol, vec3(vW.zy / uScale[q], L)) * bw.x + texture(gCol, vec3(uv, L)) * bw.y + texture(gCol, vec3(vW.xy / uScale[q], L)) * bw.z;
    } else s = texture(gCol, vec3(uv, L));
    if (near && q != 7) {
      // a second look at another scale and angle hides the repeats
      vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * uv * 0.37 + 0.21;
      s = mix(s, texture(gCol, vec3(uv2, L)), smoothstep(0.3, 0.7, macro2) * 0.8);
    }
    vec3 rc = recolor(s.rgb, q);
    float ht = lum(rc);
    float w2 = w * (0.3 + ht);
    w2 *= w2;
    col += rc * w2;
    rough += uRough[q] * w2;
    if (near) nrm += (texture(gNor, vec3(uv, L)).xyz * 2.0 - 1.0) * w2;
    wsum += w2;
  }
  col /= max(wsum, 1e-4); rough /= max(wsum, 1e-4);
  gNormalT = near ? normalize(nrm / max(wsum, 1e-4) + vec3(0.0, 0.0, 0.001)) : vec3(0.0, 0.0, 1.0);
  gNormalT = normalize(mix(vec3(0.0, 0.0, 1.0), gNormalT, (1.0 - smoothstep(300.0, 520.0, dist))));
  // big slow patches: lighter and darker, greener and drier
  float grass = gWeights[0] + gWeights[5];
  col *= 0.86 + 0.28 * mac.r;
  col = mix(col, col * vec3(1.08, 1.02, 0.78), smoothstep(0.55, 0.8, mac.g) * 0.6 * grass);
  col = mix(col, col * vec3(0.86, 1.06, 0.9), smoothstep(0.5, 0.75, mac.b) * 0.5 * grass);
  // under the sea: wet, a little darker, and the sunlight dancing on the bed (caustics)
  if (vW.y < 0.15) {
    float dw = 0.15 - vW.y;
    col *= 1.0 - smoothstep(0.0, 0.5, dw) * 0.18;
    rough = mix(rough, 0.5, smoothstep(0.0, 0.3, dw));
    vec2 cu = vW.xz / 34.0;
    float c1 = texture(cauT, cu + vec2(time * 0.021, time * 0.013)).g;
    float c2 = texture(cauT, cu * 1.37 + vec2(-time * 0.016, time * 0.019) + 0.4).g;
    float ca = pow(clamp(1.35 - c1 - c2 * 0.55, 0.0, 1.0), 2.2) * 2.2;
    ca *= smoothstep(0.05, 0.8, dw) * (1.0 - smoothstep(2.5, 10.0, dw)) * (1.0 - smoothstep(150.0, 450.0, dist));
    col *= 1.0 + ca * causI;
  }
  // beyond the map: the Everglades (the weights there just repeat the map's edge, in streaks)
  float gOut = max(max(-${f(G.HALF)} - vW.x, vW.x - ${f(G.HALF)}), max(-${f(G.HALF)} - vW.z, vW.z - ${f(G.HALF)}));
  if (gOut > -140.0 && vW.y > -3.0) {
    // (it starts a little inside the map, on the grass only, so there's no seam at the edge)
    float k = smoothstep(-140.0, 160.0, gOut) * (gOut < 0.0 ? gWeights[0] + gWeights[5] : 1.0);
    float out1 = smoothstep(0.0, 80.0, gOut);
    float sl = vcSlough(vW.xz) * out1, hm = vcHammock(vW.xz) * (1.0 - sl) * out1;
    float n1 = vcNoise(vW.xz / 140.0 + 3.0), n2 = texture(noiseT, vW.xz / 600.0).r;
    // sawgrass: tawny to green, in slow drifts, with darker clumps
    vec3 gc = mix(vec3(0.24, 0.23, 0.085), vec3(0.1, 0.16, 0.045), smoothstep(0.25, 0.75, n1 * 0.6 + n2 * 0.4));
    gc *= 0.82 + 0.3 * vcNoise(vW.xz / 23.0);
    gc = mix(gc, vec3(0.03, 0.055, 0.02), hm);                                // tree islands
    gc = mix(gc, vec3(0.09, 0.08, 0.045), smoothstep(0.35, 0.8, sl));         // wet mud round the water
    col = mix(col, gc, k);
    rough = mix(rough, mix(0.95, 0.55, smoothstep(0.4, 0.9, sl)), k);
    gNormalT = normalize(mix(gNormalT, vec3(0.0, 0.0, 1.0), k));
  }
  // rain darkens and wets the ground
  col *= 1.0 - wet * 0.3;
  gRough = mix(rough, 0.3, wet * 0.7);
  diffuseColor.rgb *= col;
}`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 Ng = normalize(vWN);
  vec3 Tg = normalize(vec3(1.0, 0.0, 0.0) - Ng * Ng.x);
  vec3 Bg = normalize(cross(Tg, Ng));
  vec3 nW = normalize(Tg * gNormalT.x - Bg * gNormalT.y + Ng * max(gNormalT.z, 0.2));
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
}`);
    };
    mat.customProgramCacheKey = () => 'vc-terrain';
    this.mat = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.renderOrder = -2;
    this.mesh.name = 'terrain';
    world.scene.add(this.mesh);
    this._glades();
    this._minmax();
    this._ring();
    this._frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._box = new THREE.Box3();
    this.tiles = 0;
  }

  setWet(v) { this.uniforms.wet.value = v; }

  /**
   * The Everglades past the edge of the map get their tree islands: clumps of low, dark
   * canopy on the hammocks (vcHammock) and a few lone trees in the sawgrass - one instanced
   * mesh, so the mainland doesn't end in a flat green plane.
   */
  _glades() {
    const G = this.G, H = G.HALF, list = [];
    let seed = 1;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    const S = 44, R = 3400, MAX = 7000;
    for (let z = -H - R; z <= H + R; z += S) for (let x = -H - R; x <= H + R; x += S) {
      const px = x + (rnd() - 0.5) * S * 0.9, pz = z + (rnd() - 0.5) * S * 0.9;
      const o = Math.max(-H - px, px - H, -H - pz, pz - H);
      if (o < 70) continue;
      const ex = Math.max(-H, Math.min(H, px)), ez = Math.max(-H, Math.min(H, pz));
      if (G.heightAt(ex, ez) < 1) continue;                     // the sea carries on there
      if (glade.slough(px, pz) > 0.15) continue;
      const hm = glade.hammock(px, pz), lone = rnd() < 0.035;
      if (rnd() > hm * 0.9 && !lone) continue;
      const r = lone ? 5 + rnd() * 5 : 9 + rnd() * 14 * (0.5 + hm * 0.5);
      list.push(px, G.heightAt(ex, ez) + r * 0.35, pz, r, rnd());
    }
    const all = list.length / 5, n = Math.min(all, MAX);
    if (!n) return;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, flatShading: true });
    const m = new THREE.InstancedMesh(geo, mat, n), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const k = Math.floor((i * all) / n) * 5;   // (an even pick if there are too many)
      const x = list[k], y = list[k + 1], z = list[k + 2], r = list[k + 3], h = list[k + 4];
      e.set(0, h * 6.28, 0); q.setFromEuler(e);
      M.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(r * (0.9 + h * 0.3), r * (0.55 + h * 0.25), r * (1.2 - h * 0.3)));
      m.setMatrixAt(i, M);
      m.setColorAt(i, c.setRGB(0.05 + h * 0.03, 0.09 + h * 0.04, 0.035));
    }
    m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    m.name = 'glades'; m.castShadow = false; m.receiveShadow = false;
    m.matrixAutoUpdate = false;
    this.world.scene.add(m);
    this.glades = m;
  }


  /** min/max height of every 128-stud tile (and of the bigger ones), for culling. */
  _minmax() {
    const G = this.G, N = G.N, levels = {};
    for (let size = 128; size <= 1024; size *= 2) {
      const n = G.SIZE / size;
      levels[size] = { n, mn: new Float32Array(n * n).fill(1e9), mx: new Float32Array(n * n).fill(-1e9) };
    }
    const L = levels[128], step = 128 / G.CELL;
    for (let tj = 0; tj < L.n; tj++) for (let ti = 0; ti < L.n; ti++) {
      let lo = 1e9, hi = -1e9;
      for (let j = tj * step; j <= (tj + 1) * step; j++) for (let i = ti * step; i <= (ti + 1) * step; i++) { const v = G.h[Math.min(N - 1, j) * N + Math.min(N - 1, i)]; if (v < lo) lo = v; if (v > hi) hi = v; }
      L.mn[tj * L.n + ti] = lo; L.mx[tj * L.n + ti] = hi;
    }
    for (let size = 256; size <= 1024; size *= 2) {
      const P = levels[size], C = levels[size / 2];
      for (let tj = 0; tj < P.n; tj++) for (let ti = 0; ti < P.n; ti++) {
        let lo = 1e9, hi = -1e9;
        for (let q = 0; q < 4; q++) { const k = (tj * 2 + (q >> 1)) * C.n + ti * 2 + (q & 1); lo = Math.min(lo, C.mn[k]); hi = Math.max(hi, C.mx[k]); }
        P.mn[tj * P.n + ti] = lo; P.mx[tj * P.n + ti] = hi;
      }
    }
    this.levels = levels;
  }

  /**
   * Tiles beyond the edge of the map (the heights there repeat the edge, so the
   * mainland runs on to the horizon): 2048-stud tiles out to 2 tiles, then 8192-stud
   * ones out past any far plane. Tiles that would be deep under the sea are left out.
   */
  _ring() {
    const G = this.G, H = G.HALF, N = G.N, out = [];
    const range = (x0, z0, size) => {
      // the clamped rectangle is a strip (or corner) of the map's edge
      const i0 = Math.max(0, Math.min(N - 1, Math.floor((x0 + H) / G.CELL))), i1 = Math.max(0, Math.min(N - 1, Math.ceil((x0 + size + H) / G.CELL)));
      const j0 = Math.max(0, Math.min(N - 1, Math.floor((z0 + H) / G.CELL))), j1 = Math.max(0, Math.min(N - 1, Math.ceil((z0 + size + H) / G.CELL)));
      let mn = 1e9, mx = -1e9;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const v = G.h[j * N + i]; if (v < mn) mn = v; if (v > mx) mx = v; }
      return [mn, mx];
    };
    // (sea edges get deep within 1600 studs of the map: past the first ring the water is opaque)
    const add = (x0, z0, size) => { const [mn, mx] = range(x0, z0, size); if (mx > 0 || size === 2048) out.push({ x0, z0, size, mn: Math.min(mn, -40), mx }); };
    for (let tj = -2; tj < 6; tj++) for (let ti = -2; ti < 6; ti++) {
      if (ti >= 0 && tj >= 0 && ti < 4 && tj < 4) continue;
      add(-H + ti * 2048, -H + tj * 2048, 2048);
    }
    const o = -H - 4096; // the 2048 ring spans -H-4096 .. H+4096 = 3 x 8192 - ... use 8192 tiles round it
    for (let tj = -2; tj < 4; tj++) for (let ti = -2; ti < 4; ti++) {
      if (ti >= 0 && tj >= 0 && ti < 2 && tj < 2) continue;
      add(o + ti * 8192, o + tj * 8192, 8192);
    }
    this.ring = out;
  }

  _visit(ti, tj, size) {
    const L = this.levels[size], k = tj * L.n + ti, box = this._box, HALF = this.G.HALF;
    const x0 = ti * size - HALF, z0 = tj * size - HALF;
    box.min.set(x0, L.mn[k] - 4 - size * 0.03, z0); box.max.set(x0 + size, L.mx[k] + 1, z0 + size);
    if (!this._frustum.intersectsBox(box)) return;
    if (size > 128 && box.distanceToPoint(this._cam) < size * 1.3) {
      for (let q = 0; q < 4; q++) this._visit(ti * 2 + (q & 1), tj * 2 + (q >> 1), size / 2);
      return;
    }
    if (this._count >= this.maxTiles) return;
    const a = this.tileAttr.array, c = this._count++;
    a[c * 3] = x0; a[c * 3 + 1] = z0; a[c * 3 + 2] = size;
  }

  update(camera) {
    // the debug stand-in ground isn't needed once this draws
    if (!this._hid && V.debug?.children?.[0]) { V.debug.children[0].visible = false; this._hid = true; }
    this.uniforms.time.value = V.water?.t ?? performance.now() / 1000;
    this.uniforms.causI.value = Math.min(1.2, (V.sky?.state?.sunI ?? 3) / 3);
    // the ground gets wet in the rain and dries slowly after
    const rain = V.sky?.state?.rain || 0, w = this.uniforms.wet;
    w.value += (rain - w.value) * (rain > w.value ? 0.02 : 0.002);
    camera.updateMatrixWorld();
    this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._m);
    const arr = this.tileAttr.array, HALF = this.G.HALF, box = this._box, fr = this._frustum, max = this.maxTiles;
    this._cam = camera.position; this._count = 0;
    const R = this.levels[1024];
    for (let tj = 0; tj < R.n; tj++) for (let ti = 0; ti < R.n; ti++) this._visit(ti, tj, 1024);
    let count = this._count;
    // beyond the map: the land (or seabed) carries on, in big tiles (see _ring)
    for (const t of this.ring) {
      box.min.set(t.x0, t.mn - 4, t.z0); box.max.set(t.x0 + t.size, t.mx + 1, t.z0 + t.size);
      if (count >= max || !fr.intersectsBox(box)) continue;
      arr[count * 3] = t.x0; arr[count * 3 + 1] = t.z0; arr[count * 3 + 2] = t.size; count++;
    }
    this.geo.instanceCount = count;
    this.tileAttr.needsUpdate = true;
    this.tiles = count;
  }
}
