// Model-building kit shared by all procedural models.
//
// Models are assembled from primitives. Each primitive gets a flat vertex
// colour; all primitives that share a material class and a bone are merged into
// a single BufferGeometry, so a creature costs one draw call per (bone, class).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { REFLECT_LAYER } from '../Stage';

export type MatClass = 'fur' | 'skin' | 'cloth' | 'rubber' | 'metal' | 'darkmetal' | 'wood' | 'plastic' | 'eye' | 'shell' | 'ice';

const mk = (p: THREE.MeshStandardMaterialParameters) =>
  new THREE.MeshStandardMaterial({ vertexColors: true, ...p });

/** Shared materials (vertex coloured). Do not mutate per object. */
export const MATERIALS: Record<MatClass, THREE.MeshStandardMaterial> = {
  fur: mk({ roughness: 0.95, metalness: 0 }),
  skin: mk({ roughness: 0.55, metalness: 0 }),
  cloth: mk({ roughness: 0.9, metalness: 0 }),
  rubber: mk({ roughness: 0.6, metalness: 0 }),
  metal: mk({ roughness: 0.32, metalness: 0.9 }),
  darkmetal: mk({ roughness: 0.45, metalness: 0.75 }),
  wood: mk({ roughness: 0.6, metalness: 0 }),
  plastic: mk({ roughness: 0.5, metalness: 0.05 }),
  eye: mk({ roughness: 0.08, metalness: 0 }),
  shell: mk({ roughness: 0.7, metalness: 0 }),
  ice: mk({ roughness: 0.15, metalness: 0, flatShading: true }),
};

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

export function xfMatrix(x: Xf = {}): THREE.Matrix4 {
  _p.set(...(x.p ?? [0, 0, 0]));
  _q.setFromEuler(_e.set(...(x.r ?? [0, 0, 0])));
  const s = x.s ?? 1;
  if (typeof s === 'number') _s.set(s, s, s);
  else _s.set(...s);
  return _m.compose(_p, _q, _s);
}

/** Collects primitives for one bone, grouped by material class. */
export class PartBuilder {
  private items = new Map<MatClass, THREE.BufferGeometry[]>();

  /** Add a geometry (consumed) with a colour and transform. */
  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, mat: MatClass = 'fur', xf: Xf = {}): this {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.applyMatrix4(xfMatrix(xf));
    // Keep only the attributes every primitive has so merging always works.
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    const list = this.items.get(mat) ?? [];
    list.push(g);
    this.items.set(mat, list);
    return this;
  }

  /** Add a geometry whose colour varies per vertex via a function of position. */
  addShaded(
    geo: THREE.BufferGeometry,
    colorAt: (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color,
    mat: MatClass = 'fur',
    xf: Xf = {},
  ): this {
    this.add(geo, 0xffffff, mat, xf);
    const list = this.items.get(mat)!;
    const g = list[list.length - 1];
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const col = g.attributes.color;
    const p = new THREE.Vector3();
    const nn = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      nn.fromBufferAttribute(nor, i);
      const c = colorAt(p, nn);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    return this;
  }

  get empty(): boolean {
    return this.items.size === 0;
  }

  /** Build meshes (one per material class) and add them to `parent`. */
  buildInto(parent: THREE.Object3D, opts: { castShadow?: boolean; reflect?: boolean } = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, geos] of this.items) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, MATERIALS[mat]);
      mesh.castShadow = opts.castShadow ?? true;
      mesh.receiveShadow = false;
      if (opts.reflect ?? true) mesh.layers.enable(REFLECT_LAYER);
      mesh.userData.matClass = mat;
      parent.add(mesh);
      out.push(mesh);
      for (const g of geos) if (g !== merged) g.dispose();
    }
    this.items.clear();
    return out;
  }
}

// ---------------------------------------------------------------- primitives
export const sphere = (r = 1, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
/** Ellipsoid with radii rx, ry, rz. */
export const ellipsoid = (rx: number, ry: number, rz: number, w = 18, h = 14) => {
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  return g;
};
export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** Box with bevelled edges (RoundedBox-like, cheap). */
export const roundBox = (w: number, h: number, d: number, r = 0.02, seg = 2) => {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4);
  shape.moveTo(x + rr, y);
  shape.lineTo(x + w - rr, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + rr);
  shape.lineTo(x + w, y + h - rr);
  shape.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  shape.lineTo(x + rr, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - rr);
  shape.lineTo(x, y + rr);
  shape.quadraticCurveTo(x, y, x + rr, y);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-3, d - 2 * rr),
    bevelEnabled: true,
    bevelThickness: rr,
    bevelSize: rr * 0.6,
    bevelSegments: seg,
    curveSegments: seg,
  });
  g.translate(0, 0, -(d - 2 * rr) / 2);
  return g;
};
/** Cylinder along Y. */
export const cyl = (rTop: number, rBot: number, h: number, seg = 14, open = false) =>
  new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
/** Cylinder along X (handy for gun barrels, which point along -X). */
export const cylX = (r: number, len: number, seg = 14, rEnd?: number) => {
  const g = new THREE.CylinderGeometry(rEnd ?? r, r, len, seg);
  g.rotateZ(Math.PI / 2);
  return g;
};
/** Capsule along Y with total length `len` (including caps). */
export const capsule = (r: number, len: number, cap = 6, seg = 12) =>
  new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), cap, seg);
export const cone = (r: number, h: number, seg = 12) => new THREE.ConeGeometry(r, h, seg);
export const torus = (r: number, tube: number, rs = 8, ts = 16, arc = Math.PI * 2) =>
  new THREE.TorusGeometry(r, tube, rs, ts, arc);

/** Lathe a profile (array of [radius, y]) around Y. */
export const lathe = (profile: Array<[number, number]>, seg = 16) =>
  new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);

/** Extrude a 2D outline (in the XY plane) to depth d centred on z=0. */
export const extrude = (pts: Array<[number, number]>, d: number, bevel = 0.004) => {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, d - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
  });
  g.translate(0, 0, -(d - 2 * bevel) / 2);
  return g;
};

/** Deterministic hash noise for colour variation. */
export function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Lerp two colours by t, returned as a new Color. */
export function mix(a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t)));
}

/** Create a named bone (pivot) under a parent. */
export function bone(name: string, parent: THREE.Object3D | null, p: [number, number, number] = [0, 0, 0]): THREE.Object3D {
  const b = new THREE.Object3D();
  b.name = name;
  b.position.set(...p);
  if (parent) parent.add(b);
  return b;
}
