import * as THREE from 'three';
import { BoneName, Rig } from './Rig';

export type Weights = [BoneName, number][];
export type WeightFn = (p: THREE.Vector3) => Weights;

export interface Ring {
  /** height of the cross-section (bind space) */
  y: number;
  rx: number;
  /** front (+Z) and back (-Z) radii */
  rzF: number;
  rzB: number;
  cx?: number;
  cz?: number;
  /** superellipse exponent: 2 = ellipse, higher = boxier */
  pw?: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Builds one skinned geometry out of swept tubes and rigid pieces: vertex
 * colours for cloth/skin regions, up to four bone influences per vertex.
 */
export class SkinBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private si: number[] = [];
  private sw: number[] = [];
  private idx: number[] = [];

  constructor(readonly rig: Rig) {}

  private vertex(p: THREE.Vector3, c: THREE.Color, w: Weights) {
    this.pos.push(p.x, p.y, p.z);
    this.col.push(c.r, c.g, c.b);
    const merged = new Map<BoneName, number>();
    for (const [b, v] of w) if (v > 1e-4) merged.set(b, (merged.get(b) ?? 0) + v);
    const top = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((a, e) => a + e[1], 0) || 1;
    for (let i = 0; i < 4; i++) {
      const e = top[i];
      this.si.push(e ? Math.max(0, this.rig.index(e[0])) : 0);
      this.sw.push(e ? e[1] / sum : 0);
    }
    return this.pos.length / 3 - 1;
  }

  /**
   * Vertical tube through cross-sections (rings ordered along the sweep).
   * color(p, angle) paints regions; caps close the ends.
   */
  tube(rings: Ring[], weight: WeightFn, color: (p: THREE.Vector3, a: number) => THREE.ColorRepresentation, o: { seg?: number; capStart?: boolean; capEnd?: boolean; mirrorX?: boolean } = {}) {
    const seg = o.seg ?? 14;
    const base = this.pos.length / 3;
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    for (const r of rings) {
      const pw = r.pw ?? 2;
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const ex = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / pw);
        const ez = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / pw);
        const rz = sa >= 0 ? r.rzF : r.rzB;
        p.set((r.cx ?? 0) + ex * r.rx, r.y, (r.cz ?? 0) + ez * rz);
        if (o.mirrorX) p.x = -p.x;
        c.set(color(p, a));
        this.vertex(p, c, weight(p));
      }
    }
    const flip = !!o.mirrorX;
    // descending sweeps (limbs) wind the other way
    const down = rings.length > 1 && rings[1].y < rings[0].y;
    for (let k = 0; k < rings.length - 1; k++) {
      for (let i = 0; i < seg; i++) {
        const j = (i + 1) % seg;
        const a = base + k * seg + i;
        const b = base + k * seg + j;
        const cc = base + (k + 1) * seg + i;
        const d = base + (k + 1) * seg + j;
        if (down !== flip) this.idx.push(a, b, cc, b, d, cc);
        else this.idx.push(a, cc, b, b, cc, d);
      }
    }
    const cap = (k: number, end: boolean) => {
      const r = rings[k];
      p.set(r.cx ?? 0, r.y, r.cz ?? 0);
      if (o.mirrorX) p.x = -p.x;
      c.set(color(p, 0));
      const ci = this.vertex(p, c, weight(p));
      for (let i = 0; i < seg; i++) {
        const j = (i + 1) % seg;
        const a = base + k * seg + i;
        const b = base + k * seg + j;
        const outward = end !== down;
        if (outward !== flip) this.idx.push(ci, b, a);
        else this.idx.push(ci, a, b);
      }
    };
    if (o.capStart) cap(0, false);
    if (o.capEnd) cap(rings.length - 1, true);
  }

  /** Adds an arbitrary geometry (already in bind space via matrix). */
  geo(g: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.ColorRepresentation | ((p: THREE.Vector3) => THREE.ColorRepresentation), weight: WeightFn) {
    const src = g.index ? g : g;
    const pa = src.getAttribute('position') as THREE.BufferAttribute;
    const base = this.pos.length / 3;
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < pa.count; i++) {
      p.fromBufferAttribute(pa, i).applyMatrix4(m);
      c.set(typeof color === 'function' ? color(p) : color);
      this.vertex(p, c, weight(p));
    }
    if (src.index) for (let i = 0; i < src.index.count; i++) this.idx.push(base + src.index.getX(i));
    else for (let i = 0; i < pa.count; i++) this.idx.push(base + i);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ weight functions
/** Blend down a vertical chain of bones by height. */
export function chainWeights(chain: [BoneName, number][], blend: number): WeightFn {
  // chain sorted by joint height descending or ascending; each bone owns the span above its joint
  const sorted = [...chain].sort((a, b) => a[1] - b[1]);
  return (p) => {
    const y = p.y;
    let w: Weights = [[sorted[0][0], 1]];
    for (let i = 1; i < sorted.length; i++) {
      const [b, jy] = sorted[i];
      const t = smooth(jy - blend, jy + blend, y);
      if (t <= 0) break;
      const prev = w.map(([bb, v]) => [bb, v * (1 - t)] as [BoneName, number]);
      w = [...prev, [b, t]];
    }
    return w;
  };
}

/** Limb hanging down: upper bone above the joint, lower below. */
export function limbWeights(parent: BoneName, upper: BoneName, lower: BoneName, end: BoneName | null, topY: number, jointY: number, endY: number, blend = 0.045): WeightFn {
  return (p) => {
    const y = p.y;
    const toLower = smooth(jointY + blend, jointY - blend, y);
    const toParent = smooth(topY - 0.07, topY + 0.03, y) * 0.45;
    const toEnd = end ? smooth(endY + 0.03, endY - 0.04, y) * 0.6 : 0;
    const w: Weights = [
      [upper, (1 - toLower) * (1 - toParent)],
      [parent, (1 - toLower) * toParent],
      [lower, toLower * (1 - toEnd)],
    ];
    if (end) w.push([end, toLower * toEnd]);
    return w;
  };
}

export function rigid(b: BoneName): WeightFn {
  return () => [[b, 1]];
}

/**
 * Torso: hips → spine → chest → neck by height, with the shoulder flanks
 * following the upper arms and the pelvis flanks following the thighs.
 */
export function torsoWeights(rig: Rig): WeightFn {
  const J = rig.joints;
  const chain = chainWeights(
    [
      ['hips', J.hips.y - 0.2],
      ['spine', J.spine.y + 0.02],
      ['chest', J.chest.y + 0.06],
      ['neck', J.neck.y + 0.015],
    ],
    0.05,
  );
  const sx = J.uArmL.x;
  return (p) => {
    let w = chain(p);
    // shoulders roll with the arms
    const side = p.x >= 0 ? 'L' : 'R';
    const ax = Math.abs(p.x);
    const sh = smooth(sx * 0.45, sx * 0.95, ax) * smooth(J.uArmL.y - 0.16, J.uArmL.y - 0.02, p.y) * 0.65;
    if (sh > 0) w = [...w.map(([b, v]) => [b, v * (1 - sh)] as [BoneName, number]), [('uArm' + side) as BoneName, sh * 0.75], [('clav' + side) as BoneName, sh * 0.25]];
    // seat and hip flanks go with the thighs
    const hip = smooth(J.thighL.y + 0.05, J.thighL.y - 0.08, p.y) * smooth(0.0, J.thighL.x * 1.1, ax + 0.02);
    if (hip > 0) w = [...w.map(([b, v]) => [b, v * (1 - hip * 0.6)] as [BoneName, number]), [('thigh' + side) as BoneName, hip * 0.6]];
    return w;
  };
}

// ------------------------------------------------------------------ rigid parts
/** Deformed sphere with an anime jaw; UVs project the face from the front. */
export function headGeometry(o: { r: number; h: number; d: number; chin: number; jaw: number; flat?: number }) {
  const g = new THREE.SphereGeometry(1, 40, 30);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let x = v.x * o.r;
    let y = v.y * o.h;
    let z = v.z * o.d;
    // lower face narrows into a pointed chin; cheeks soften the transition
    if (v.y < 0.1) {
      const t = smooth(0.1, -1, v.y);
      const front = smooth(-0.6, 0.7, v.z);
      x *= 1 - t * (o.jaw * (0.55 + 0.45 * front));
      y -= t * t * o.chin * (0.4 + 0.6 * front);
      z *= 1 - t * 0.28 * (1 - front);
      z += t * front * 0.008;
    }
    // flatter face plane, rounder skull behind
    if (v.z > 0.2) z -= (v.z - 0.2) * (o.flat ?? 0.12) * o.d;
    if (v.y > 0.3) y += (v.y - 0.3) * 0.08 * o.h;
    p.setXYZ(i, x, y, z);
    // planar UVs: the face texture covers x ∈ [-r, r], y ∈ [-h-chin, h]
    uv.setXY(i, 0.5 + x / (2.2 * o.r), (y + o.h + o.chin) / (2 * o.h + o.chin + 0.02));
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Spiky anime hair: cones rooted on an ellipsoidal cap, each pointing along
 * the cap normal bent toward a flow direction.
 */
export interface SpikeSpec {
  /** ellipsoid radii and centre of the cap */
  rx: number;
  ry: number;
  rz: number;
  cy: number;
  cz: number;
  count: number;
  len: [number, number];
  width: [number, number];
  /** where roots may sit: returns false for skipped directions (the face) */
  allow: (n: THREE.Vector3) => boolean;
  /** direction a spike at cap normal n should point */
  flow: (n: THREE.Vector3, r: () => number) => THREE.Vector3;
  seed: number;
}

export function spikeHair(s: SpikeSpec) {
  let seed = s.seed;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const parts: THREE.BufferGeometry[] = [];
  // cap
  const cap = new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.62);
  cap.scale(s.rx, s.ry, s.rz);
  cap.rotateX(-0.42);
  cap.translate(0, s.cy, s.cz);
  parts.push(cap.toNonIndexed());
  const n = new THREE.Vector3();
  let made = 0;
  for (let tries = 0; made < s.count && tries < s.count * 40; tries++) {
    // uniform direction on the upper sphere
    const u = r() * 2 - 1;
    const th = r() * Math.PI * 2;
    const k = Math.sqrt(1 - u * u);
    n.set(k * Math.cos(th), u, k * Math.sin(th));
    if (!s.allow(n)) continue;
    const root = new THREE.Vector3(n.x * s.rx * 0.92, s.cy + n.y * s.ry * 0.92, s.cz + n.z * s.rz * 0.92);
    const dir = s.flow(n.clone(), r).normalize();
    const len = s.len[0] + r() * (s.len[1] - s.len[0]);
    const w = s.width[0] + r() * (s.width[1] - s.width[0]);
    const cone = new THREE.ConeGeometry(w, len, 5, 1, false);
    cone.translate(0, len / 2, 0);
    // flatten spikes into blades for an inked look
    cone.scale(1, 1, 0.55);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const twist = new THREE.Quaternion().setFromAxisAngle(dir, r() * Math.PI);
    cone.applyQuaternion(q.premultiply(twist));
    cone.translate(root.x, root.y, root.z);
    parts.push(cone.toNonIndexed());
    made++;
  }
  // merge
  let total = 0;
  for (const g of parts) total += (g.getAttribute('position') as THREE.BufferAttribute).count;
  const pos = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    const a = g.getAttribute('position') as THREE.BufferAttribute;
    pos.set(a.array as Float32Array, o);
    o += a.count * 3;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}
