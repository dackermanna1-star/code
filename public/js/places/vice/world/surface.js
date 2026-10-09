// Shared helpers for the static city geometry: a growable vertex buffer
// (Geo) filed by material and 512-stud chunk (Chunks), and the "surface"
// material - photo texture array layers, tinted per vertex, with normal maps,
// a bit of grime, and an emissive term for things that glow at night.
//
//   const C = new Chunks();
//   const g = C.get('surf', x, z);                  // the buffer for that material near (x, z)
//   g.quad(a, b, c, d, {lay, tint, uv: 'xz'|'xy'|..., scale, glow})  // a..d: [x, y, z], counter-clockwise from the front
//   g.box(cx, cy, cz, hx, hy, hz, heading, {lay, tint, top, sides, bottom, scale})
//   C.meshes(materials) -> [Mesh]                   // one mesh per (material, chunk)
//
// Vertex attributes: position, normal, uv (texture coords in repeats),
// lay (x: layer index, y: roughness 0..1, z: glow 0..1, w: unused),
// tint (rgb), and info (free vec4 for special shaders such as the asphalt).
import * as THREE from 'three';

export const CHUNK = 512;

export class Geo {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.lay = []; this.tint = []; this.info = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  vert(x, y, z, nx, ny, nz, u, v, L, rough, glow, r, g, b, info) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v);
    this.lay.push(L, rough, glow, 0); this.tint.push(r, g, b);
    if (info) this.info.push(info[0], info[1], info[2], info[3]); else this.info.push(0, 0, 0, 0);
    return this.pos.length / 3 - 1;
  }
  /** A quad a-b-c-d (counter-clockwise seen from the front). o.uv: how to map the texture. */
  quad(a, b, c, d, o = {}) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (o.normal) [nx, ny, nz] = o.normal;
    const s = 1 / (o.scale || 16);
    const t = o.tint || [1, 1, 1], L = o.lay ?? 0, R = o.rough ?? 0.85, G = o.glow || 0;
    const base = this.count;
    const pts = [a, b, c, d];
    for (let i = 0; i < 4; i++) {
      const p = pts[i];
      let u, v;
      if (o.uvs) { u = o.uvs[i][0]; v = o.uvs[i][1]; } else if (Math.abs(ny) > 0.7) { u = p[0] * s; v = p[2] * s; } else if (Math.abs(nx) > Math.abs(nz)) { u = p[2] * s; v = p[1] * s; } else { u = p[0] * s; v = p[1] * s; }
      this.vert(p[0], p[1], p[2], nx, ny, nz, u, v, L, R, G, t[0], t[1], t[2], o.info ? o.info[i] : null);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** A polygon fan (convex, counter-clockwise seen from above), flat-ish. */
  fan(pts, o = {}) {
    if (pts.length < 3) return;
    const s = 1 / (o.scale || 16), t = o.tint || [1, 1, 1], L = o.lay ?? 0, R = o.rough ?? 0.85, G = o.glow || 0;
    const base = this.count;
    for (const p of pts) this.vert(p[0], p[1], p[2], 0, 1, 0, p[0] * s, p[2] * s, L, R, G, t[0], t[1], t[2], o.info || null);
    for (let i = 1; i < pts.length - 1; i++) this.idx.push(base, base + i + 1, base + i);
  }
  /** A box centred at (cx, cy, cz) with half sizes, turned by heading about +y. */
  box(cx, cy, cz, hx, hy, hz, heading = 0, o = {}) {
    const c = Math.cos(heading), s = Math.sin(heading);
    const P = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const v = [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), P(-hx, hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(-hx, hy, hz)];
    const so = { ...o, tint: o.sideTint || o.tint, lay: o.sideLay ?? o.lay };
    if (o.top !== false) this.quad(v[7], v[6], v[5], v[4], { ...o, tint: o.topTint || o.tint, lay: o.topLay ?? o.lay });
    if (o.bottom) this.quad(v[0], v[1], v[2], v[3], o);
    if (o.sides !== false) {
      this.quad(v[3], v[2], v[6], v[7], so); // +z
      this.quad(v[1], v[0], v[4], v[5], so); // -z
      this.quad(v[2], v[1], v[5], v[6], so); // +x
      this.quad(v[0], v[3], v[7], v[4], so); // -x
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('lay', new THREE.Float32BufferAttribute(this.lay, 4));
    g.setAttribute('tint', new THREE.Float32BufferAttribute(this.tint, 3));
    g.setAttribute('info', new THREE.Float32BufferAttribute(this.info, 4));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/** Geo buffers filed by material key and chunk. */
export class Chunks {
  constructor(size = CHUNK) { this.size = size; this.map = new Map(); }
  get(mat, x, z) {
    const i = Math.floor(x / this.size), j = Math.floor(z / this.size), k = `${mat}|${i}|${j}`;
    let g = this.map.get(k);
    if (!g) { g = new Geo(); g.mat = mat; this.map.set(k, g); }
    return g;
  }
  /** materials: {key: Material}; o: {shadow: Set of keys that cast shadows} */
  meshes(materials, o = {}) {
    const out = [];
    for (const g of this.map.values()) {
      if (!g.count) continue;
      const m = new THREE.Mesh(g.geometry(), materials[g.mat]);
      m.receiveShadow = true;
      m.castShadow = !!o.shadow?.has(g.mat);
      m.matrixAutoUpdate = false; m.updateMatrix();
      if (o.order?.[g.mat]) m.renderOrder = o.order[g.mat];
      m.userData.mat = g.mat;
      for (const a of Object.values(m.geometry.attributes)) a.onUpload(freeArray);
      m.geometry.index.onUpload(freeArray);
      out.push(m);
    }
    return out;
  }
}
function freeArray() { this.array = null; }

/** Screen-space tangent frame (no tangent attribute needed). */
export const TBN_GLSL = `
mat3 vcTBN(vec3 N, vec3 p, vec2 uv) {
  vec3 dp1 = dFdx(p), dp2 = dFdy(p); vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N), dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x, B = dp2perp * duv1.y + dp1perp * duv2.y;
  float im = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  return mat3(T * im, B * im, N);
}`;

/**
 * The surface material: texture array layer per vertex (lay.x), tint, roughness (lay.y),
 * normal map, grime, and glow (lay.z) scaled by the uniform `glow` (night).
 * tex: {col: {value: DataArrayTexture}, nor: {value}} (world/textures.js).
 */
export function surfaceMaterial(tex, o = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, ...(o.params || {}) });
  const uni = { tCol: tex.col, tNor: tex.nor, glow: o.glowUniform || { value: 0 }, wet: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 lay; attribute vec3 tint; attribute vec4 info;\nvarying vec4 vLay; varying vec3 vTint; varying vec2 vSuv; varying vec3 vWp; varying vec4 vInfo;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vLay = lay; vTint = tint; vSuv = uv; vInfo = info;
vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray tCol, tNor; uniform float glow, wet;
varying vec4 vLay; varying vec3 vTint; varying vec2 vSuv; varying vec3 vWp; varying vec4 vInfo;
vec3 sNrm;
${TBN_GLSL}
${o.fragHead || ''}`)
      .replace('#include <map_fragment>', `{
  float L = floor(vLay.x + 0.5);
  vec3 col = texture(tCol, vec3(vSuv, L)).rgb * vTint;
  sNrm = texture(tNor, vec3(vSuv, L)).xyz * 2.0 - 1.0;
  ${o.fragMap || ''}
  diffuseColor.rgb *= col;
}`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = vLay.y; ${o.fragRough || ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ mat3 tbn = vcTBN(normal, -vViewPosition, vSuv); normal = normalize(tbn * vec3(sNrm.xy * ${o.bump ?? '0.7'}, sNrm.z)); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vLay.z * glow * 3.0; ${o.fragEmit || ''}`);
  };
  mat.customProgramCacheKey = () => 'vc-surf' + (o.key || '');
  mat.userData.uni = uni;
  return mat;
}
