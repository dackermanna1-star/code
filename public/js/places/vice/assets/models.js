// The packed models (assets/modeldata.js, made by tools/pack-vice-models.py):
// CC0 kits by Kenney - cars, boats, ships, containers, palms and crash debris.
//
//   await loadModels()            -> resolves once the blob is inflated (call once at build time)
//   modelParts(name)              -> [{ name, pivot: Vector3, geometry }] (body first, then wheels)
//   modelGeometry(name)           -> one BufferGeometry with every part merged (for static props)
//   modelSize(name)               -> { min: Vector3, max: Vector3 } in model units
//
// Geometry: position, normal and color (linear) attributes, indexed. Model
// space is +Y up with the front towards +Z, in Kenney units (a sedan is
// 1.5 wide, 1.15 high and 2.55 long); scale it to studs where it is used.
// Wheels are separate parts whose vertices are relative to their pivot.
import * as THREE from 'three';
import { MODELS, BLOB } from './modeldata.js';

let bytes = null;
const cache = new Map();
const _c = new THREE.Color();

/** Inflate the model blob (zlib) - once. */
export async function loadModels() {
  if (bytes) return;
  const bin = Uint8Array.from(atob(BLOB), (c) => c.charCodeAt(0));
  const ds = new DecompressionStream('deflate');
  const buf = await new Response(new Blob([bin]).stream().pipeThrough(ds)).arrayBuffer();
  bytes = buf;
}

export const MODEL_NAMES = Object.keys(MODELS);

export function hasModel(name) { return !!MODELS[name]; }

function partGeometry(m, p) {
  const n = p.n, o = p.off;
  const qp = new Int16Array(bytes, o, n * 3);
  const qn = new Int8Array(bytes, o + n * 6, n * 3);
  const qc = new Uint8Array(bytes, o + n * 9, n * 3);
  let io = o + n * 12; io += (4 - (io % 4)) % 4;
  const idx = p.i32 ? new Uint32Array(bytes, io, p.m) : new Uint16Array(bytes, io, p.m);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const s = m.scale;
  for (let i = 0; i < n * 3; i++) { pos[i] = qp[i] * s; nor[i] = qn[i] / 127; }
  for (let i = 0; i < n; i++) {
    _c.setRGB(qc[i * 3] / 255, qc[i * 3 + 1] / 255, qc[i * 3 + 2] / 255, THREE.SRGBColorSpace);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(p.i32 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/** The model's parts: the body first, then the wheels (each with its pivot). Shared - don't dispose. */
export function modelParts(name) {
  if (!bytes) throw new Error('loadModels() first');
  const key = 'p:' + name;
  if (cache.has(key)) return cache.get(key);
  const m = MODELS[name];
  if (!m) throw new Error('no model ' + name);
  const parts = m.parts.map((p) => ({ name: p.name, pivot: new THREE.Vector3(...p.pivot), geometry: partGeometry(m, p) }));
  parts.sort((a, b) => (a.name === 'body' ? -1 : b.name === 'body' ? 1 : 0));
  cache.set(key, parts);
  return parts;
}

/** Every part merged into one geometry, wheels put back at their pivots. Shared - don't dispose. */
export function modelGeometry(name) {
  const key = 'g:' + name;
  if (cache.has(key)) return cache.get(key);
  const parts = modelParts(name);
  let n = 0, m = 0;
  for (const p of parts) { n += p.geometry.attributes.position.count; m += p.geometry.index.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const idx = n > 65535 ? new Uint32Array(m) : new Uint16Array(m);
  let vo = 0, io = 0;
  for (const p of parts) {
    const g = p.geometry, c = g.attributes.position.count;
    const P = g.attributes.position.array;
    for (let i = 0; i < c; i++) { pos[(vo + i) * 3] = P[i * 3] + p.pivot.x; pos[(vo + i) * 3 + 1] = P[i * 3 + 1] + p.pivot.y; pos[(vo + i) * 3 + 2] = P[i * 3 + 2] + p.pivot.z; }
    nor.set(g.attributes.normal.array, vo * 3); col.set(g.attributes.color.array, vo * 3);
    const I = g.index.array;
    for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo;
    vo += c; io += I.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  cache.set(key, g);
  return g;
}

export function modelSize(name) {
  const b = modelGeometry(name).boundingBox;
  return { min: b.min.clone(), max: b.max.clone() };
}
