// Shared helpers for the procedural creature models: lofted bodies, rig
// assembly, colour shading functions, pose reset/blending and small maths.
import * as THREE from 'three';
import { GunBuilder, MATERIALS, PartBuilder, hash3, type MatClass, type Xf } from './kit';
import { REFLECT_LAYER } from '../Stage';
import type { AnimInput, BoneSpec, CreatureRig } from './types';

// ---------------------------------------------------------------- maths
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const easeOut = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
export const easeIn = (t: number) => clamp(t, 0, 1) ** 2;
export const TAU = Math.PI * 2;
/** Smooth periodic noise in [-1, 1] (sum of sines), cheap and deterministic. */
export const wobble = (t: number, seed = 0) =>
  (Math.sin(t * 1.13 + seed) * 0.5 + Math.sin(t * 2.31 + seed * 2.7) * 0.3 + Math.sin(t * 4.07 + seed * 5.1) * 0.2);
/** Smooth 3D noise in roughly [-1, 1]. */
export const snoise = (x: number, y: number, z: number) =>
  (Math.sin(x * 1.7 + Math.sin(z * 2.3)) * Math.sin(y * 2.1 + Math.sin(x * 1.3)) +
    Math.sin(z * 1.9 + Math.sin(y * 1.5)) * 0.6) / 1.6;

// ---------------------------------------------------------------- loft
/**
 * One cross-section of a lofted body. The spine runs through (x, y, z) in the
 * XY plane. `w` is the half-width across the body (along Z for a spine in the
 * XY plane); `h` is the half-height towards the left normal of the spine
 * (up for a spine running +X, backwards (-X) for a spine running +Y,
 * forwards (+X) for a spine running -Y); `hb` is the half-height on the other
 * side (defaults to `h`). `dy` shifts the section along the left normal.
 */
export interface Sec {
  x: number;
  y: number;
  z?: number;
  w: number;
  h: number;
  hb?: number;
}

export interface LoftOpts {
  radial?: number;
  /** Catmull-Rom subdivisions per input segment. */
  sub?: number;
  /** Rounded cap length at the first / last section (0 = flat cap). */
  cap0?: number;
  cap1?: number;
  /** Radial noise amplitude (fraction of radius) for fur / wrinkles. */
  bump?: number;
  bumpFreq?: number;
  /** Only emit the part between these input-section indices (for splitting one body across bones). */
  from?: number;
  to?: number;
  /** Extra subdivided rings emitted beyond `from` / `to` (overlap into the neighbour part). */
  overlap?: number;
}

type FullSec = { x: number; y: number; z: number; w: number; h: number; hb: number };

const crs = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

/** Tube with elliptical, varying cross-sections along a smooth planar spine. */
export function loft(input: Sec[], o: LoftOpts = {}): THREE.BufferGeometry {
  const radial = o.radial ?? 16;
  const sub = o.sub ?? 3;
  const full: FullSec[] = input.map((s) => ({ x: s.x, y: s.y, z: s.z ?? 0, w: s.w, h: s.h, hb: s.hb ?? s.h }));
  const n = full.length;
  const get = (i: number) => full[clamp(i, 0, n - 1)];
  const secs: FullSec[] = [];
  const keys: Array<keyof FullSec> = ['x', 'y', 'z', 'w', 'h', 'hb'];
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < sub; s++) {
      const t = s / sub;
      const a = get(i - 1);
      const b = get(i);
      const c = get(i + 1);
      const d = get(i + 2);
      const r = {} as FullSec;
      for (const k of keys) r[k] = crs(a[k], b[k], c[k], d[k], t);
      r.w = Math.max(0.002, r.w);
      r.h = Math.max(0.002, r.h);
      r.hb = Math.max(0.002, r.hb);
      secs.push(r);
    }
  }
  secs.push({ ...full[n - 1] });

  const m = secs.length;
  const P = secs.map((s) => new THREE.Vector3(s.x, s.y, s.z));
  const T = secs.map((_, i) => {
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(m - 1, i + 1)];
    return b.clone().sub(a).normalize();
  });
  const Z = new THREE.Vector3(0, 0, 1);
  const frame = (i: number) => {
    const t = T[i];
    const u = new THREE.Vector3().crossVectors(Z, t);
    if (u.lengthSq() < 1e-6) u.set(0, 1, 0);
    u.normalize();
    const s = new THREE.Vector3().crossVectors(t, u).normalize();
    return { u, s };
  };

  const pos: number[] = [];
  const idx: number[] = [];
  const bump = o.bump ?? 0;
  const bf = o.bumpFreq ?? 9;
  const ring = (c: THREE.Vector3, i: number, sec: FullSec, scale: number) => {
    const { u, s } = frame(i);
    const base = pos.length / 3;
    for (let j = 0; j < radial; j++) {
      const th = (j / radial) * TAU;
      const cs = Math.cos(th);
      const sn = Math.sin(th);
      const hh = sn >= 0 ? sec.h : sec.hb;
      let k = scale;
      if (bump > 0) {
        const q = c.clone().addScaledVector(s, cs * sec.w).addScaledVector(u, sn * hh);
        k *= 1 + bump * snoise(q.x * bf, q.y * bf, q.z * bf);
      }
      pos.push(
        c.x + (s.x * cs * sec.w + u.x * sn * hh) * k,
        c.y + (s.y * cs * sec.w + u.y * sn * hh) * k,
        c.z + (s.z * cs * sec.w + u.z * sn * hh) * k,
      );
    }
    return base;
  };

  // Rounded caps: extra rings shrinking along a quarter ellipse.
  const capRings = (end: 0 | 1, len: number) => {
    const out: Array<{ c: THREE.Vector3; scale: number; i: number }> = [];
    if (len <= 0) return out;
    const i = end === 0 ? 0 : m - 1;
    const dir = T[i].clone().multiplyScalar(end === 0 ? -1 : 1);
    const steps = [0.38, 0.68, 0.88];
    for (const st of steps) {
      const phi = (st * Math.PI) / 2;
      out.push({ c: P[i].clone().addScaledVector(dir, Math.sin(phi) * len), scale: Math.cos(phi), i });
    }
    return out;
  };

  const rings: number[] = [];
  const startCaps = capRings(0, o.cap0 ?? 0).reverse();
  for (const r of startCaps) rings.push(ring(r.c, r.i, secs[r.i], r.scale));
  const firstMain = rings.length;
  for (let i = 0; i < m; i++) rings.push(ring(P[i], i, secs[i], 1));
  for (const r of capRings(1, o.cap1 ?? 0)) rings.push(ring(r.c, r.i, secs[r.i], r.scale));

  for (let r = 0; r < rings.length - 1; r++) {
    const a0 = rings[r];
    const b0 = rings[r + 1];
    for (let j = 0; j < radial; j++) {
      const j1 = (j + 1) % radial;
      idx.push(a0 + j, b0 + j, b0 + j1, a0 + j, b0 + j1, a0 + j1);
    }
  }
  // Poles.
  const pole0 = pos.length / 3;
  {
    const p = P[0].clone().addScaledVector(T[0], -(o.cap0 ?? 0));
    pos.push(p.x, p.y, p.z);
  }
  const pole1 = pos.length / 3;
  {
    const p = P[m - 1].clone().addScaledVector(T[m - 1], o.cap1 ?? 0);
    pos.push(p.x, p.y, p.z);
  }
  const first = rings[0];
  const last = rings[rings.length - 1];
  for (let j = 0; j < radial; j++) {
    const j1 = (j + 1) % radial;
    idx.push(pole0, first + j, first + j1);
    idx.push(pole1, last + j1, last + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (o.from === undefined && o.to === undefined) return g;

  // ---- sub-range: copy rings (with the full body's normals) and close the
  // cut ends with separate flat caps.
  const ov = o.overlap ?? 1;
  const r0 = o.from !== undefined && o.from > 0 ? firstMain + clamp(Math.round(o.from * sub) - ov, 0, m - 1) : 0;
  const r1 = o.to !== undefined && o.to < n - 1 ? firstMain + clamp(Math.round(o.to * sub) + ov, 0, m - 1) : rings.length - 1;
  const cutStart = r0 > 0;
  const cutEnd = r1 < rings.length - 1;
  const nrm = g.attributes.normal;
  const sp: number[] = [];
  const sn: number[] = [];
  const si: number[] = [];
  const pushV = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    sp.push(x, y, z);
    sn.push(nx, ny, nz);
    return sp.length / 3 - 1;
  };
  const ringStart: number[] = [];
  for (let r = r0; r <= r1; r++) {
    ringStart.push(sp.length / 3);
    for (let j = 0; j < radial; j++) {
      const v = rings[r] + j;
      pushV(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], nrm.getX(v), nrm.getY(v), nrm.getZ(v));
    }
  }
  for (let r = 0; r < ringStart.length - 1; r++) {
    const a0 = ringStart[r];
    const b0 = ringStart[r + 1];
    for (let j = 0; j < radial; j++) {
      const j1 = (j + 1) % radial;
      si.push(a0 + j, b0 + j, b0 + j1, a0 + j, b0 + j1, a0 + j1);
    }
  }
  const capAt = (rIdx: number, sRing: number, end: 0 | 1) => {
    const mi = clamp(rIdx - firstMain, 0, m - 1);
    const t = T[mi].clone().multiplyScalar(end === 0 ? -1 : 1);
    const c = P[mi];
    const base = sp.length / 3;
    // Rim keeps the side normals so the cut is invisible where pieces meet.
    for (let j = 0; j < radial; j++) {
      const v = sRing + j;
      pushV(sp[v * 3], sp[v * 3 + 1], sp[v * 3 + 2], sn[v * 3], sn[v * 3 + 1], sn[v * 3 + 2]);
    }
    const ctr = pushV(c.x, c.y, c.z, t.x, t.y, t.z);
    for (let j = 0; j < radial; j++) {
      const j1 = (j + 1) % radial;
      if (end === 0) si.push(ctr, base + j, base + j1);
      else si.push(ctr, base + j1, base + j);
    }
  };
  if (cutStart) capAt(r0, ringStart[0], 0);
  else {
    // keep the original start pole
    const ctr = pushV(pos[pole0 * 3], pos[pole0 * 3 + 1], pos[pole0 * 3 + 2], nrm.getX(pole0), nrm.getY(pole0), nrm.getZ(pole0));
    for (let j = 0; j < radial; j++) si.push(ctr, ringStart[0] + j, ringStart[0] + ((j + 1) % radial));
  }
  if (cutEnd) capAt(r1, ringStart[ringStart.length - 1], 1);
  else {
    const ctr = pushV(pos[pole1 * 3], pos[pole1 * 3 + 1], pos[pole1 * 3 + 2], nrm.getX(pole1), nrm.getY(pole1), nrm.getZ(pole1));
    const lr = ringStart[ringStart.length - 1];
    for (let j = 0; j < radial; j++) si.push(ctr, lr + ((j + 1) % radial), lr + j);
  }
  g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(sn, 3));
  out.setIndex(si);
  return out;
}

/**
 * Split one lofted body into per-bone pieces. `cuts` are input-section
 * indices; piece k spans cuts[k-1]..cuts[k] (with the ends at 0 and n-1).
 */
export function loftSplit(input: Sec[], cuts: number[], o: LoftOpts = {}): THREE.BufferGeometry[] {
  const b = [0, ...cuts, input.length - 1];
  const out: THREE.BufferGeometry[] = [];
  for (let k = 0; k < b.length - 1; k++) out.push(loft(input, { ...o, from: b[k], to: b[k + 1] }));
  return out;
}

/** Point on the (subdivided) spine of a section list at input index `i` (integer). */
export function secAt(input: Sec[], i: number): [number, number, number] {
  const s = input[clamp(Math.round(i), 0, input.length - 1)];
  return [s.x, s.y, s.z ?? 0];
}

/** Transform a geometry authored in root space into a bone's local space (rest pose). */
export function toLocal(geo: THREE.BufferGeometry, bone: THREE.Object3D): THREE.BufferGeometry {
  let r: THREE.Object3D = bone;
  while (r.parent) r = r.parent;
  r.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(r.matrixWorld).invert().multiply(bone.matrixWorld).invert();
  geo.applyMatrix4(inv);
  return geo;
}

/** World (root-space) position of a bone in its rest pose. */
export function restPos(bone: THREE.Object3D): THREE.Vector3 {
  let r: THREE.Object3D = bone;
  while (r.parent) r = r.parent;
  r.updateMatrixWorld(true);
  const v = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
  return v.applyMatrix4(new THREE.Matrix4().copy(r.matrixWorld).invert());
}

/**
 * Ellipsoid filling the joint at spine section `i` (root space), shaped like
 * that cross-section (dorsal/ventral radii), slightly inside the surface.
 */
export function jointFiller(spine: Sec[], i: number, k = 0.96, w = 12, h = 9): THREE.BufferGeometry {
  const s = spine[i];
  const a = spine[Math.max(0, i - 1)];
  const b = spine[Math.min(spine.length - 1, i + 1)];
  const t = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
  const u = new THREE.Vector2(-t.y, t.x);
  const hb = s.hb ?? s.h;
  const r = ((s.h + hb) / 2) * k;
  const g = blob(r, r, s.w * k, w, h);
  g.rotateZ(Math.atan2(t.y, t.x));
  g.translate(s.x + (u.x * (s.h - hb)) / 2, s.y + (u.y * (s.h - hb)) / 2, s.z ?? 0);
  return g;
}

/** Ellipsoid with smooth normals and optional bump noise. */
export function blob(rx: number, ry: number, rz: number, w = 18, h = 12, bump = 0, bf = 9): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  if (bump > 0) {
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const k = 1 + bump * snoise(v.x * bf, v.y * bf, v.z * bf);
      p.setXYZ(i, v.x * k, v.y * k, v.z * k);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** A tapered horn / tusk / claw: a curved cone from base (radius r0) to tip. */
export function horn(len: number, r0: number, bend: number, seg = 6, radial = 8): THREE.BufferGeometry {
  // Spine along -Y bending towards +X by `bend` (m at the tip).
  const secs: Sec[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const r = Math.max(0.004, r0 * (1 - t * 0.92));
    secs.push({ x: bend * t * t, y: -len * t, w: r, h: r });
  }
  return loft(secs, { radial, sub: 1, cap0: r0 * 0.4, cap1: r0 * 0.15 });
}

// ---------------------------------------------------------------- colour
export type ColorFn = (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color;
const _ca = new THREE.Color();

/** Two-tone shading: `top` on upward-facing surfaces, `under` below; plus speckle. */
export function shade(
  top: THREE.ColorRepresentation,
  under: THREE.ColorRepresentation,
  o: {
    bias?: number;
    sharp?: number;
    noise?: number;
    freq?: number;
    mid?: THREE.ColorRepresentation;
    fn?: (p: THREE.Vector3, n: THREE.Vector3) => number;
  } = {},
): ColorFn {
  const a = new THREE.Color(top);
  const b = new THREE.Color(under);
  const mid = o.mid !== undefined ? new THREE.Color(o.mid) : null;
  const sharp = o.sharp ?? 1.6;
  const bias = o.bias ?? 0;
  const noise = o.noise ?? 0.06;
  const nf = o.freq ?? 9;
  return (p, n) => {
    const raw = o.fn ? o.fn(p, n) : -n.y;
    const t = smooth((raw + bias) * sharp * 0.5 + 0.5);
    let c: THREE.Color;
    if (mid) {
      c = t < 0.5 ? a.clone().lerp(mid, t * 2) : mid.clone().lerp(b, (t - 0.5) * 2);
    } else c = a.clone().lerp(b, t);
    const k = 1 + snoise(p.x * nf, p.y * nf, p.z * nf) * noise;
    return c.multiplyScalar(k);
  };
}

/** Flat colour with speckle. */
export function speckle(col: THREE.ColorRepresentation, noise = 0.08, freq = 14): ColorFn {
  const a = new THREE.Color(col);
  return (p) => {
    const k = 1 + snoise(p.x * freq, p.y * freq, p.z * freq) * noise;
    return _ca.copy(a).multiplyScalar(k).clone();
  };
}

/** Per-vertex random speckle (gives a grainy / scaly look on dense meshes). */
export function grain(col: THREE.ColorRepresentation, noise = 0.1): ColorFn {
  const a = new THREE.Color(col);
  return (p) => {
    const k = 1 + (hash3(p.x * 41.3, p.y * 37.1, p.z * 29.7) - 0.5) * noise;
    return _ca.copy(a).multiplyScalar(k).clone();
  };
}

/** Eyeball (glossy) with a white glint towards +X+Y+Z. */
export function eye(
  pb: PartBuilder,
  p: [number, number, number],
  r: number,
  color: THREE.ColorRepresentation = 0x0a0806,
  glint = true,
  iris?: THREE.ColorRepresentation,
): void {
  pb.add(new THREE.SphereGeometry(r, 10, 7), color, 'eye', { p });
  if (iris !== undefined) {
    // coloured iris disc slightly outward (towards ±z side of p)
    const sz = Math.sign(p[2]) || 1;
    pb.add(new THREE.SphereGeometry(r * 0.62, 8, 6), iris, 'eye', { p: [p[0] + r * 0.25, p[1], p[2] + sz * r * 0.5] });
    pb.add(new THREE.SphereGeometry(r * 0.32, 6, 4), 0x050505, 'eye', { p: [p[0] + r * 0.4, p[1], p[2] + sz * r * 0.72] });
  }
  if (glint) {
    const sz = Math.sign(p[2]) || 1;
    pb.add(new THREE.SphereGeometry(r * 0.26, 5, 4), 0xffffff, 'eye', {
      p: [p[0] + r * 0.45, p[1] + r * 0.45, p[2] + sz * r * 0.62],
    });
  }
}

// ---------------------------------------------------------------- rig builder
type PartRecord = Array<{ geo: THREE.BufferGeometry; mat: MatClass }>;
/**
 * Built geometry per rig name, in part() order. The first rig of a kind
 * generates its geometry; later rigs of the same kind share it (bones, specs
 * and animation state are per instance). Shared geometry must not be mutated.
 */
const GEO_CACHE = new Map<string, PartRecord[]>();

export class RigBuilder {
  readonly root = new THREE.Group();
  readonly bones = new Map<string, THREE.Object3D>();
  readonly spec: Record<string, BoneSpec> = {};
  private readonly cached: PartRecord[] | null;
  private readonly record: PartRecord[] = [];
  private partIdx = 0;

  /** `name` doubles as the geometry cache key: use a distinct name per geometry variant. */
  constructor(private readonly name: string) {
    this.root.name = name;
    this.cached = GEO_CACHE.get(name) ?? null;
  }

  bone(name: string, parent: THREE.Object3D | string | null, p: [number, number, number] = [0, 0, 0]): THREE.Object3D {
    const par = parent === null ? this.root : typeof parent === 'string' ? this.get(parent) : parent;
    const b = new THREE.Object3D();
    b.name = name;
    b.position.set(...p);
    par.add(b);
    this.bones.set(name, b);
    return b;
  }

  get(name: string): THREE.Object3D {
    const b = this.bones.get(name);
    if (!b) throw new Error(`no bone ${name}`);
    return b;
  }

  /** Build geometry for a bone (or reuse this rig kind's cached geometry). */
  part(b: THREE.Object3D | string, build: (pb: PartBuilder) => void): void {
    const target = typeof b === 'string' ? this.get(b) : b;
    if (this.cached) {
      const rec = this.cached[this.partIdx++];
      for (const { geo, mat } of rec) {
        const mesh = new THREE.Mesh(geo, MATERIALS[mat]);
        mesh.castShadow = mat !== 'glass' && mat !== 'glow';
        mesh.receiveShadow = false;
        mesh.layers.enable(REFLECT_LAYER);
        mesh.userData.matClass = mat;
        target.add(mesh);
      }
      return;
    }
    // 'metal' parts get baked steel shading (readable without an environment map)
    const pb = new GunBuilder();
    build(pb);
    const meshes = pb.buildInto(target);
    this.record.push(meshes.map((m) => ({ geo: m.geometry, mat: m.userData.matClass as MatClass })));
  }

  finish(head: string, animate: (a: AnimInput) => void, extra: Partial<CreatureRig> = {}): CreatureRig {
    if (!this.cached) GEO_CACHE.set(this.name, this.record);
    return { root: this.root, bones: this.bones, spec: this.spec, head, animate, ...extra };
  }
}

/**
 * Add geometry authored in root space (rest pose) to a bone's PartBuilder:
 * transforms it into bone space and evaluates the colour function in root
 * space so shading/noise stays continuous across bone boundaries.
 */
export function addRoot(pb: PartBuilder, bone: THREE.Object3D, geo: THREE.BufferGeometry, fn: ColorFn, mat: MatClass = 'fur'): void {
  const off = restPos(bone);
  toLocal(geo, bone);
  const q = new THREE.Vector3();
  pb.addShaded(geo, (p, n) => fn(q.copy(p).add(off), n), mat);
}

/** Shortcut for adding a geometry with a shading function. */
export function addS(pb: PartBuilder, geo: THREE.BufferGeometry, fn: ColorFn, mat: MatClass = 'fur', xf: Xf = {}): void {
  pb.addShaded(geo, fn, mat, xf);
}

// ---------------------------------------------------------------- animation
/**
 * Wraps a pose function: every frame all bones are reset to their rest pose,
 * the pose function applies the state's pose on top, and for a short time
 * after a state change the result is blended from the last displayed pose so
 * transitions do not pop.
 */
export function animator(
  bones: Map<string, THREE.Object3D>,
  pose: (a: AnimInput) => void,
  blendDur = 0.22,
): (a: AnimInput) => void {
  const list = [...bones.values()];
  const rest = list.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
  const snapP = list.map(() => new THREE.Vector3());
  const snapQ = list.map(() => new THREE.Quaternion());
  const snapS = list.map(() => new THREE.Vector3(1, 1, 1));
  const tq = new THREE.Quaternion();
  let state = '';
  let bt = 1e9;
  let dur = blendDur;
  return (a: AnimInput) => {
    if (a.state !== state) {
      if (state !== '') {
        for (let i = 0; i < list.length; i++) {
          snapP[i].copy(list[i].position);
          snapQ[i].copy(list[i].quaternion);
          snapS[i].copy(list[i].scale);
        }
        bt = 0;
        dur = typeof a.params.blend === 'number' ? (a.params.blend as number) : blendDur;
      }
      state = a.state;
    }
    for (let i = 0; i < list.length; i++) {
      list[i].position.copy(rest[i].p);
      list[i].quaternion.copy(rest[i].q);
      list[i].scale.copy(rest[i].s);
    }
    pose(a);
    if (bt < dur) {
      const k = smooth(bt / dur);
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        b.position.lerpVectors(snapP[i], b.position, k);
        tq.copy(b.quaternion);
        b.quaternion.slerpQuaternions(snapQ[i], tq, k);
        b.scale.lerpVectors(snapS[i], b.scale, k);
      }
      bt += Math.max(0, a.dt);
    }
  };
}

/**
 * Two-bone planar IK for a limb hanging along -Y at rest (rotation about Z).
 * Returns [upper, lower] rotation.z so the end of the lower bone reaches
 * (tx, ty) relative to the upper pivot. `bend` = -1 bends the joint forward
 * (human knee / quadruped hind stifle), +1 bends it backward (elbow of a
 * quadruped foreleg as seen from the side).
 */
export function ik2(l1: number, l2: number, tx: number, ty: number, bend: 1 | -1): [number, number] {
  const d = clamp(Math.hypot(tx, ty), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const phi = Math.atan2(tx, -ty);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const k = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
  if (bend < 0) return [phi + a, -(Math.PI - k)];
  return [phi - a, Math.PI - k];
}

/**
 * Foot trajectory for a gait. `p` in [0,1) is the leg's cycle phase; the
 * first `duty` of the cycle is stance (foot planted, moving back relative to
 * the hip by `stride`), the rest is swing. Returns [dx, lift].
 */
export function footPath(p: number, duty: number, stride: number, lift: number): [number, number] {
  const q = ((p % 1) + 1) % 1;
  if (q < duty) {
    const t = q / duty;
    return [stride * (0.5 - t), 0];
  }
  const t = (q - duty) / (1 - duty);
  const e = 0.5 - 0.5 * Math.cos(Math.PI * t);
  return [stride * (-0.5 + e), lift * Math.sin(Math.PI * t)];
}

/** Per-rig blink controller: returns eye openness (0 closed .. 1 open). */
export function blinker(seed = Math.random() * 100): (time: number) => number {
  return (time: number) => {
    const period = 3.1 + (seed % 1.7);
    const ph = (time + seed) % period;
    if (ph < 0.14) return Math.abs(ph / 0.07 - 1);
    return 1;
  };
}

/** Exponential smoothing helper bound to a closure value. */
export function damp(cur: number, target: number, rate: number, dt: number): number {
  return cur + (target - cur) * (1 - Math.exp(-rate * Math.max(0, dt)));
}

export type { AnimInput, BoneSpec, CreatureRig };
