// Geometry kit for the environment: primitives with flat / shaded vertex
// colours merged into one BufferGeometry per material (one draw call per
// material class), plus the shared environment materials.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Xf {
  p?: [number, number, number];
  /** Euler rotation in radians (XYZ). */
  r?: [number, number, number];
  s?: [number, number, number] | number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export function xfMatrix(x: Xf | THREE.Matrix4 = {}): THREE.Matrix4 {
  if (x instanceof THREE.Matrix4) return _m.copy(x);
  const xf = x as Xf;
  _p.set(...(xf.p ?? [0, 0, 0]));
  _q.setFromEuler(_e.set(...(xf.r ?? [0, 0, 0])));
  const s = xf.s ?? 1;
  if (typeof s === 'number') _s.set(s, s, s);
  else _s.set(...s);
  return _m.compose(_p, _q, _s);
}

export type ColorFn = (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void;

/** Collects primitives (position, normal, colour[, extra attrs]) and merges them. */
export class GeoBuilder {
  private parts: THREE.BufferGeometry[] = [];
  /** Extra per-vertex float attributes (same item size for every part). */
  constructor(private extra: Record<string, number> = {}) {}

  get count(): number {
    return this.parts.length;
  }

  /**
   * Add a geometry (consumed) with a colour (or per-vertex colour function,
   * evaluated in world/builder space) and a transform. `attrs` sets constant
   * values for the extra attributes.
   */
  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation | ColorFn, xf: Xf | THREE.Matrix4 = {}, attrs: Record<string, number[]> = {}): this {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.applyMatrix4(xfMatrix(xf));
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    if (typeof color === 'function') {
      const pos = g.attributes.position;
      const nor = g.attributes.normal;
      const p = new THREE.Vector3();
      const nn = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        p.fromBufferAttribute(pos, i);
        nn.fromBufferAttribute(nor, i);
        color(p, nn, _c.setRGB(1, 1, 1));
        col[i * 3] = _c.r;
        col[i * 3 + 1] = _c.g;
        col[i * 3 + 2] = _c.b;
      }
    } else {
      _c.set(color);
      for (let i = 0; i < n; i++) {
        col[i * 3] = _c.r;
        col[i * 3 + 1] = _c.g;
        col[i * 3 + 2] = _c.b;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const [name, size] of Object.entries(this.extra)) {
      const v = attrs[name] ?? new Array(size).fill(0);
      const arr = new Float32Array(n * size);
      for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) arr[i * size + k] = v[k] ?? 0;
      g.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    this.parts.push(g);
    return this;
  }

  /** Merge everything added so far (null when empty). */
  build(): THREE.BufferGeometry | null {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  mesh(material: THREE.Material, name = ''): THREE.Mesh {
    const g = this.build() ?? new THREE.BufferGeometry();
    const m = new THREE.Mesh(g, material);
    m.name = name;
    return m;
  }
}

// ---------------------------------------------------------------- primitives

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt: number, rb: number, h: number, seg = 8, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const sphere = (r: number, ws = 8, hs = 6) => new THREE.SphereGeometry(r, ws, hs);
export const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg);
export const torus = (r: number, tube: number, rs = 6, ts = 16, arc = Math.PI * 2) => new THREE.TorusGeometry(r, tube, rs, ts, arc);

/** A box from point a to point b (a beam / strut of a square section). */
export function beam(a: THREE.Vector3Like, b: THREE.Vector3Like, w: number, h = w): { geo: THREE.BufferGeometry; m: THREE.Matrix4 } {
  const A = new THREE.Vector3(a.x, a.y, a.z);
  const B = new THREE.Vector3(b.x, b.y, b.z);
  const len = A.distanceTo(B);
  const geo = new THREE.BoxGeometry(w, len, h);
  const dir = B.clone().sub(A).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  return { geo, m };
}

/** A round rod / rope from a to b. */
export function rod(a: THREE.Vector3Like, b: THREE.Vector3Like, r: number, seg = 6): { geo: THREE.BufferGeometry; m: THREE.Matrix4 } {
  const A = new THREE.Vector3(a.x, a.y, a.z);
  const B = new THREE.Vector3(b.x, b.y, b.z);
  const len = A.distanceTo(B);
  const geo = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  const dir = B.clone().sub(A).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  return { geo, m };
}

/** Scale a colour's brightness by k (returns a new Color). */
export function shade(c: THREE.ColorRepresentation, k: number): THREE.Color {
  return new THREE.Color(c).multiplyScalar(k);
}

// ---------------------------------------------------------------- materials

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, ...p });

/** Shared environment materials (vertex coloured). */
export function createEnvMaterials() {
  return {
    wood: std({ roughness: 0.82, metalness: 0 }),
    wetWood: std({ roughness: 0.42, metalness: 0 }),
    paint: std({ roughness: 0.6, metalness: 0 }),
    metal: std({ roughness: 0.45, metalness: 0.75 }),
    rust: std({ roughness: 0.8, metalness: 0.3 }),
    stone: std({ roughness: 0.9, metalness: 0 }),
    rubber: std({ roughness: 0.7, metalness: 0 }),
    cloth: std({ roughness: 0.95, metalness: 0 }),
    plastic: std({ roughness: 0.45, metalness: 0 }),
    /** Unlit, HDR vertex colours × material colour (lit windows, lamp glass, signs). */
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
}
export type EnvMaterials = ReturnType<typeof createEnvMaterials>;
