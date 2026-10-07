// Drawing the land. One flat 32x32 grid is drawn many times (instanced) as
// the tiles of a quadtree - small, detailed tiles near the camera, big coarse
// ones far away - and the vertex shader lifts each vertex to the height map
// (read from a float texture). The fragment shader blends the nine photo
// ground textures by the weight maps, with their normal maps, a second
// sample at another scale to hide the tiling, and slow large-scale variation.
import * as THREE from 'three';
import { N, CELL } from './terrain.js';
import { HALF } from './layout.js';
import { noiseTex } from '../textures.js';

const GRID = 32;
const SCALE = [13, 15, 17, 15, 30, 26, 16, 11, 19]; // studs per repeat, per ground texture
const ROUGH = [0.96, 0.95, 0.97, 0.93, 0.86, 0.9, 0.92, 0.9, 0.97];
// colour corrections per ground texture (the scans are a little grey for a summer's day)
const TINT = [[0.92, 1.12, 0.62], [1.0, 1.1, 0.72], [0.82, 0.78, 0.7], [0.95, 0.92, 0.86], [0.92, 0.92, 0.94], [0.95, 1.0, 0.92], [1.06, 1.04, 0.96], [0.95, 0.95, 0.95], [0.9, 0.84, 0.78]].map((c) => new THREE.Vector3(...c));

export function heightTexture(T) {
  if (T._htex) return T._htex;
  const t = new THREE.DataTexture(T.h, N, N, THREE.RedFormat, THREE.FloatType);
  t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.needsUpdate = true;
  T._htex = t;
  return t;
}

/** GLSL: manual bilinear height lookup (float textures aren't always filterable). */
export const HEIGHT_GLSL = `
uniform sampler2D hMap;
float hAt(vec2 xz) {
  vec2 f = (xz + ${HALF.toFixed(1)}) / ${CELL.toFixed(1)};
  vec2 i = floor(f);
  vec2 t = clamp(f - i, 0.0, 1.0);
  ivec2 c = ivec2(clamp(i, vec2(0.0), vec2(${(N - 2).toFixed(1)})));
  float a = texelFetch(hMap, c, 0).r, b = texelFetch(hMap, c + ivec2(1, 0), 0).r;
  float d = texelFetch(hMap, c + ivec2(0, 1), 0).r, e = texelFetch(hMap, c + ivec2(1, 1), 0).r;
  return mix(mix(a, b, t.x), mix(d, e, t.x), t.y);
}`;

function gridGeometry() {
  const V = GRID + 1;
  const pos = [], skirt = [], idx = [];
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) { pos.push(i / GRID, 0, j / GRID); skirt.push(0); }
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // skirts: each edge vertex again, pulled down in the shader, joined to the edge
  const edge = (list) => {
    const base = pos.length / 3;
    for (const k of list) { pos.push(pos[k * 3], 0, pos[k * 3 + 2]); skirt.push(1); }
    for (let q = 0; q < list.length - 1; q++) {
      const a = list[q], b = list[q + 1], a2 = base + q, b2 = base + q + 1;
      idx.push(a, b, a2, b, b2, a2);
    }
  };
  const top = [], bottom = [], left = [], right = [];
  for (let i = 0; i < V; i++) { top.push(i); bottom.push(GRID * V + (GRID - i)); left.push((GRID - i) * V); right.push(i * V + GRID); }
  edge(top); edge(right); edge(bottom); edge(left);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('skirt', new THREE.Float32BufferAttribute(skirt, 1));
  g.setIndex(idx);
  return g;
}

export class TerrainView {
  /** Cut holes in the land (T.holes with render: true). */
  setHoles(list) {
    const h = this.uniforms.holes.value, y = this.uniforms.holeYaw.value;
    let i = 0;
    for (const q of list) { if (!q.render || i >= 8) continue; h[i].set(q.x, q.z, q.hx, q.hz); y[i] = q.yaw; i++; }
    for (; i < 8; i++) h[i].set(0, 0, -1, -1);
  }

  constructor(world, T, photos) {
    this.world = world; this.T = T;
    const W = T.weights();
    const wt = W.map((data) => { const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat); t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; });
    this.weightTex = wt;
    this.hTex = heightTexture(T);
    const geo = gridGeometry();
    this.maxTiles = 320;
    this.tileAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.maxTiles * 3), 3);
    this.tileAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('tile', this.tileAttr);
    geo.instanceCount = 0;
    this.geo = geo;
    const uni = {
      hMap: { value: this.hTex }, wT0: { value: wt[0] }, wT1: { value: wt[1] }, wT2: { value: wt[2] },
      gCol: photos.groundCol, gNor: photos.groundNor, noiseT: { value: noiseTex() },
      uScale: { value: SCALE }, uRough: { value: ROUGH }, uTint: { value: TINT }, wet: { value: 0 },
      // places the land is cut away (bunker shafts): centre x, z, half sizes; turn
      holes: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -1, -1)) }, holeYaw: { value: new Array(8).fill(0) },
    };
    this.uniforms = uni;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec3 tile; attribute float skirt;
varying vec3 vW; varying vec3 vWN;
${HEIGHT_GLSL}`)
        .replace('#include <beginnormal_vertex>', `
vec2 wxz = tile.xy + position.xz * tile.z;
float e = ${CELL.toFixed(1)};
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
uniform sampler2D wT0, wT1, wT2, noiseT;
uniform float uScale[9], uRough[9], wet;
uniform vec3 uTint[9];
uniform vec4 holes[8]; uniform float holeYaw[8];
varying vec3 vW; varying vec3 vWN;
float gWeights[9];
vec3 gNormalT;
float gRough;
float lum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }`)
        .replace('#include <map_fragment>', `
for (int i = 0; i < 8; i++) {
  vec4 h = holes[i];
  if (h.z < 0.0) continue;
  vec2 d = vW.xz - h.xy; float c = cos(holeYaw[i]), s = sin(holeYaw[i]);
  vec2 l = vec2(d.x * c - d.y * s, d.x * s + d.y * c);
  if (abs(l.x) < h.z && abs(l.y) < h.w) discard;
}
{
  vec2 wuv = ((vW.xz + ${HALF.toFixed(1)}) / ${CELL.toFixed(1)} + 0.5) / ${N.toFixed(1)};
  vec4 a = texture(wT0, wuv), b = texture(wT1, wuv); float c = texture(wT2, wuv).r;
  gWeights[0] = a.r; gWeights[1] = a.g; gWeights[2] = a.b; gWeights[3] = a.a;
  gWeights[4] = b.r; gWeights[5] = b.g; gWeights[6] = b.b; gWeights[7] = b.a; gWeights[8] = c;
  float dist = length(vW - cameraPosition);
  bool near = dist < 420.0;
  float macro = texture(noiseT, vW.xz / 900.0).r, macro2 = texture(noiseT, vW.xz / 157.0 + 0.37).r;
  vec3 col = vec3(0.0); vec3 nrm = vec3(0.0); float rough = 0.0; float wsum = 0.0;
  for (int q = 0; q < 9; q++) {
    float w = gWeights[q];
    if (w < 0.004) continue;
    vec2 uv = vW.xz / uScale[q];
    vec4 s;
    vec3 Ngw = normalize(vWN);
    if ((q == 4 || q == 5) && Ngw.y < 0.8) {
      // steep rock: project the texture from three sides so cliffs aren't smeared
      vec3 bw = pow(abs(Ngw), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
      s = texture(gCol, vec3(vW.zy / uScale[q], float(q))) * bw.x + texture(gCol, vec3(uv, float(q))) * bw.y + texture(gCol, vec3(vW.xy / uScale[q], float(q))) * bw.z;
    } else s = texture(gCol, vec3(uv, float(q)));
    s.rgb *= uTint[q];
    if (q < 4 && near) {
      // a second look at another scale and angle hides the repeats
      vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * uv * 0.37 + 0.21;
      vec4 s2 = texture(gCol, vec3(uv2, float(q))); s2.rgb *= uTint[q];
      s = mix(s, s2, smoothstep(0.3, 0.7, macro2));
    }
    float ht = lum(s.rgb);
    float w2 = w * (0.25 + ht);
    w2 *= w2;
    col += s.rgb * w2;
    rough += uRough[q] * w2;
    if (near) nrm += (texture(gNor, vec3(uv, float(q))).xyz * 2.0 - 1.0) * w2;
    wsum += w2;
  }
  col /= max(wsum, 1e-4); rough /= max(wsum, 1e-4);
  gNormalT = near ? normalize(nrm / max(wsum, 1e-4) + vec3(0.0, 0.0, 0.001)) : vec3(0.0, 0.0, 1.0);
  // big slow patches of lighter and darker ground
  col *= 0.82 + 0.36 * macro;
  col = mix(col, col * vec3(1.05, 1.0, 0.86), smoothstep(0.55, 0.8, macro2) * 0.5);
  // rain darkens and wets the ground
  col *= 1.0 - wet * 0.35;
  gRough = mix(rough, 0.35, wet * 0.7);
  diffuseColor.rgb *= col;
}`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 Ng = normalize(vWN);
  vec3 Tg = normalize(vec3(1.0, 0.0, 0.0) - Ng * Ng.x);
  vec3 Bg = normalize(cross(Tg, Ng));
  vec3 nW = normalize(Tg * gNormalT.x + Bg * gNormalT.y + Ng * max(gNormalT.z, 0.2));
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
}`);
    };
    mat.customProgramCacheKey = () => 'ob-terrain';
    this.mat = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.renderOrder = -2;
    world.scene.add(this.mesh);
    this._minmax();
    this._frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._box = new THREE.Box3();
    this._last = null;
  }

  /** min/max height of every 128-stud tile (and of the bigger ones), for culling. */
  _minmax() {
    const T = this.T, levels = {};
    for (let size = 128; size <= 1024; size *= 2) {
      const n = T.size / size, mn = new Float32Array(n * n).fill(1e9), mx = new Float32Array(n * n).fill(-1e9);
      levels[size] = { n, mn, mx };
    }
    const L = levels[128], step = 128 / CELL;
    for (let tj = 0; tj < L.n; tj++) for (let ti = 0; ti < L.n; ti++) {
      let lo = 1e9, hi = -1e9;
      for (let j = tj * step; j <= (tj + 1) * step; j++) for (let i = ti * step; i <= (ti + 1) * step; i++) { const v = T.h[Math.min(N - 1, j) * N + Math.min(N - 1, i)]; if (v < lo) lo = v; if (v > hi) hi = v; }
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

  update(camera) {
    camera.updateMatrixWorld();
    this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._m);
    const arr = this.tileAttr.array, cam = camera.position;
    let count = 0;
    const visit = (ti, tj, size) => {
      const L = this.levels[size], k = tj * L.n + ti;
      const x0 = ti * size - HALF, z0 = tj * size - HALF;
      this._box.min.set(x0, L.mn[k] - 4 - size * 0.03, z0); this._box.max.set(x0 + size, L.mx[k] + 1, z0 + size);
      if (!this._frustum.intersectsBox(this._box)) return;
      const d = this._box.distanceToPoint(cam);
      if (size > 128 && d < size * 1.3) {
        for (let q = 0; q < 4; q++) visit(ti * 2 + (q & 1), tj * 2 + (q >> 1), size / 2);
        return;
      }
      if (count >= this.maxTiles) return;
      arr[count * 3] = x0; arr[count * 3 + 1] = z0; arr[count * 3 + 2] = size;
      count++;
    };
    const R = this.levels[1024];
    for (let tj = 0; tj < R.n; tj++) for (let ti = 0; ti < R.n; ti++) visit(ti, tj, 1024);
    // a ring of big tiles beyond the edges (the heights there repeat the edge)
    for (let tj = -2; tj < R.n + 2; tj++) for (let ti = -2; ti < R.n + 2; ti++) {
      if (ti >= 0 && tj >= 0 && ti < R.n && tj < R.n) continue;
      const x0 = ti * 1024 - HALF, z0 = tj * 1024 - HALF;
      this._box.min.set(x0, -80, z0); this._box.max.set(x0 + 1024, 600, z0 + 1024);
      if (!this._frustum.intersectsBox(this._box) || count >= this.maxTiles) continue;
      arr[count * 3] = x0; arr[count * 3 + 1] = z0; arr[count * 3 + 2] = 1024; count++;
    }
    this.geo.instanceCount = count;
    this.tileAttr.needsUpdate = true;
    this.tiles = count;
  }
}
