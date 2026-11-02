import * as THREE from 'three';
import { clamp01 } from '../core/math';

/** Atlas regions (u0, v0, w, h) in [0,1] texture space (v up). */
export const REGION = {
  torso: [0.0, 0.5, 0.5, 0.5],
  arm: [0.5, 0.5, 0.25, 0.5],
  leg: [0.75, 0.5, 0.25, 0.5],
  head: [0.0, 0.0, 0.5, 0.5],
  hand: [0.5, 0.25, 0.125, 0.25],
  foot: [0.625, 0.25, 0.125, 0.25],
  neck: [0.75, 0.375, 0.25, 0.125],
  acc: [0.75, 0.25, 0.25, 0.125],
  hair: [0.5, 0.0, 0.25, 0.25],
  gear: [0.75, 0.0, 0.25, 0.25],
} as const;
export type RegionName = keyof typeof REGION;

export type W = [number, number][]; // [bone, weight]

export class MeshAccum {
  pos: number[] = [];
  uv: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  skin: number[] = [];
  /** Secondary motion: x = sway (hair: 0 at the root .. 1 at the tips), y = flare (a skirt's hem). */
  sway: number[] = [];
  idx: number[] = [];
  /** Sway written with each new vertex (set around a part's construction). */
  curSway = 0;
  curFlare = 0;
  get count() {
    return this.pos.length / 3;
  }
  vert(p: THREE.Vector3, u: number, v: number, w: W, skin: number) {
    this.pos.push(p.x, p.y, p.z);
    this.uv.push(u, v);
    const ws = [...w].filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let tot = 0;
    for (const x of ws) tot += x[1];
    for (let i = 0; i < 4; i++) {
      if (i < ws.length) {
        this.si.push(ws[i][0]);
        this.sw.push(ws[i][1] / (tot || 1));
      } else {
        this.si.push(0);
        this.sw.push(i === 0 ? 1 : 0);
      }
    }
    this.skin.push(skin);
    this.sway.push(this.curSway, this.curFlare);
    return this.count - 1;
  }
  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }
}

const _ta = new THREE.Vector3(), _tb = new THREE.Vector3(), _tc = new THREE.Vector3(), _tn = new THREE.Vector3();
export function vpos(m: MeshAccum, i: number, out: THREE.Vector3) {
  return out.set(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]);
}
/**
 * Emit quads of a vertex grid with outward-facing winding (decided against an interior point
 * for the middle quad). `invert` faces them the other way (a lining seen from inside).
 */
export function emitQuads(m: MeshAccum, grid: number[][], inside: (row: number) => THREE.Vector3, invert = false) {
  if (grid.length < 2) return;
  const j = Math.floor((grid.length - 1) / 2);
  const i = Math.floor((grid[j].length - 1) / 2);
  vpos(m, grid[j][i], _ta);
  vpos(m, grid[j][i + 1], _tb);
  vpos(m, grid[j + 1][i], _tc);
  _tn.crossVectors(_tb.sub(_ta), _tc.sub(_ta));
  const out = vpos(m, grid[j][i], new THREE.Vector3()).sub(inside(j));
  const flip = (_tn.dot(out) < 0) !== invert;
  for (let r = 0; r < grid.length - 1; r++) {
    for (let c = 0; c < grid[r].length - 1; c++) {
      const a = grid[r][c], b = grid[r][c + 1], cc = grid[r + 1][c], d = grid[r + 1][c + 1];
      if (!flip) {
        m.tri(a, b, cc);
        m.tri(b, d, cc);
      } else {
        m.tri(a, cc, b);
        m.tri(b, cc, d);
      }
    }
  }
}
/** Triangle fan cap with normal facing `outDir`. */
export function emitCap(m: MeshAccum, center: number, ring: number[], outDir: THREE.Vector3) {
  vpos(m, center, _ta);
  vpos(m, ring[0], _tb);
  vpos(m, ring[1], _tc);
  _tn.crossVectors(_tb.sub(_ta), _tc.sub(_ta));
  const flip = _tn.dot(outDir) < 0;
  for (let i = 0; i < ring.length - 1; i++) {
    if (!flip) m.tri(center, ring[i], ring[i + 1]);
    else m.tri(center, ring[i + 1], ring[i]);
  }
}

export interface RingSpec {
  c: THREE.Vector3; // center
  ax: THREE.Vector3; // local x axis (unit)
  az: THREE.Vector3; // local z axis (unit) (front)
  rx: number;
  rzF: number;
  rzB: number;
  pw?: number; // superellipse exponent
  zOff?: number;
  /** Skin weights, or per vertex from its offsets (m) along ax and az. */
  w: W | ((x: number, z: number) => W);
  v: number; // texture v within region [0,1]
  skin?: number | ((theta: number) => number);
  bulgeF?: number; // extra front bulge (gut)
  /** Extra offset along az for a vertex at lateral offset x (m); cz = -1 back .. 1 front. */
  dz?: (x: number, cz: number) => number;
  /** Radial scale by theta (pleats, clumps of hair). */
  rad?: (theta: number) => number;
  /** Offset along the ring's normal (c's tube direction) by theta (ragged hems, hair tips). */
  dy?: (theta: number) => number;
  /** Tube direction for dy (default +Y). */
  ay?: THREE.Vector3;
  /** Theta range [from, to] (0 = back centre, PI = front); default the whole ring. */
  arc?: [number, number];
}

const _up = new THREE.Vector3(0, 1, 0);
/** A point on a ring at angle th (0 = back centre, PI = front centre; +x first). */
export function ringPos(r: RingSpec, th: number, out: THREE.Vector3) {
  const sx = -Math.sin(th);
  const cz = -Math.cos(th);
  const pw = r.pw ?? 2;
  const ex = Math.sign(sx) * Math.pow(Math.abs(sx), 2 / pw);
  const ez = Math.sign(cz) * Math.pow(Math.abs(cz), 2 / pw);
  const rz = cz > 0 ? r.rzF : r.rzB;
  const rs = r.rad ? r.rad(th) : 1;
  const xx = ex * r.rx * rs;
  let zz = ez * rz * rs + (r.zOff ?? 0);
  if (r.bulgeF && cz > 0) zz += r.bulgeF * Math.pow(cz, 3) * (1 - Math.abs(sx) * 0.5);
  if (r.dz) zz += r.dz(xx, cz);
  out.copy(r.c).addScaledVector(r.ax, xx).addScaledVector(r.az, zz);
  if (r.dy) out.addScaledVector(r.ay ?? _up, r.dy(th));
  return { x: xx, z: zz };
}

const TAU = Math.PI * 2;
const _rp = new THREE.Vector3();
/** One ring's row of vertices. */
export function ringRow(m: MeshAccum, r: RingSpec, seg: number, region: RegionName, uOf?: (th: number) => number) {
  const [u0, v0, uw, vh] = REGION[region];
  const row: number[] = [];
  const a0 = r.arc ? r.arc[0] : 0, a1 = r.arc ? r.arc[1] : TAU;
  for (let i = 0; i <= seg; i++) {
    const th = a0 + (a1 - a0) * (i / seg);
    const o = ringPos(r, th, _rp);
    const skin = typeof r.skin === 'function' ? r.skin(th) : r.skin ?? 0;
    const w = typeof r.w === 'function' ? r.w(o.x, o.z) : r.w;
    const uu = uOf ? uOf(th) : r.arc ? clamp01(th / TAU) : i / seg;
    row.push(m.vert(_rp, u0 + uw * uu, v0 + vh * r.v, w, skin));
  }
  return row;
}

/** Loft a tube through rings. Returns vertex index grid. */
export function loft(
  m: MeshAccum, rings: RingSpec[], seg: number, region: RegionName, capStart: boolean, capEnd: boolean,
  opts: { inward?: boolean; uOf?: (th: number) => number; perRow?: (j: number) => void } = {},
) {
  const [u0, v0, uw, vh] = REGION[region];
  const grid: number[][] = [];
  rings.forEach((r, j) => {
    opts.perRow?.(j);
    grid.push(ringRow(m, r, seg, region, opts.uOf));
  });
  emitQuads(m, grid, (j) => rings[j].c.clone().addScaledVector(rings[j].az, rings[j].zOff ?? 0), opts.inward);
  const cap = (ri: number, outDir: THREE.Vector3) => {
    const r = rings[ri];
    const w = typeof r.w === 'function' ? r.w(0, 0) : r.w;
    const c = m.vert(r.c.clone().addScaledVector(r.az, r.zOff ?? 0), u0 + uw * 0.5, v0 + vh * r.v, w, typeof r.skin === 'number' ? r.skin : 0);
    emitCap(m, c, grid[ri], outDir);
  };
  const tubeDir = rings[rings.length - 1].c.clone().sub(rings[0].c).normalize();
  if (capStart) cap(0, tubeDir.clone().negate());
  if (capEnd) cap(rings.length - 1, tubeDir);
  return grid;
}

/**
 * A strip of quads joining two rows of existing vertices (an edge's thickness, a hem), facing
 * away from `inside`.
 */
export function bridge(m: MeshAccum, a: number[], b: number[], inside: THREE.Vector3, invert = false) {
  emitQuads(m, [a, b], () => inside, invert);
}

export function boneW(a: number, b: number, t: number): W {
  t = clamp01(t);
  return [[a, 1 - t], [b, t]];
}

/** Build a perpendicular frame for a tube direction. */
export function frameFor(dir: THREE.Vector3, frontHint: THREE.Vector3) {
  const d = dir.clone().normalize();
  const az = frontHint.clone().addScaledVector(d, -frontHint.dot(d)).normalize();
  const ax = new THREE.Vector3().crossVectors(d, az).normalize();
  return { d, ax, az };
}

export const clampSym = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);

/** Ellipsoid blob. */
export function blob(m: MeshAccum, c: THREE.Vector3, r: THREE.Vector3, region: RegionName, w: W, skin: number, lat = 6, lon = 8) {
  const [u0, v0, uw, vh] = REGION[region];
  const g: number[][] = [];
  for (let j = 0; j <= lat; j++) {
    const phi = (j / lat) * Math.PI;
    const row: number[] = [];
    for (let i = 0; i <= lon; i++) {
      const th = (i / lon) * Math.PI * 2;
      const p = new THREE.Vector3(c.x + Math.sin(phi) * Math.cos(th) * r.x, c.y - Math.cos(phi) * r.y, c.z + Math.sin(phi) * Math.sin(th) * r.z);
      row.push(m.vert(p, u0 + uw * (i / lon), v0 + vh * (j / lat), w, skin));
    }
    g.push(row);
  }
  emitQuads(m, g, () => c);
}

/** Thin box (e.g. cap brim) pitched by `pitch` radians around X. */
export function flatBox(m: MeshAccum, c: THREE.Vector3, half: THREE.Vector3, pitch: number, region: RegionName, w: W) {
  const [u0, v0, uw, vh] = REGION[region];
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
  const corners: number[] = [];
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Vector3(i & 1 ? half.x : -half.x, i & 2 ? half.y : -half.y, i & 4 ? half.z : -half.z).applyQuaternion(q).add(c);
    corners.push(m.vert(p, u0 + uw * (i & 1 ? 0.9 : 0.1), v0 + vh * (i & 4 ? 0.9 : 0.1), w, 0));
  }
  const f = (a: number, b: number, cc: number, d: number) => {
    vpos(m, corners[a], _ta);
    vpos(m, corners[b], _tb);
    vpos(m, corners[cc], _tc);
    const fc = _ta.clone().add(_tc).multiplyScalar(0.5).sub(c);
    _tn.crossVectors(_tb.clone().sub(_ta), _tc.clone().sub(_ta));
    if (_tn.dot(fc) >= 0) {
      m.tri(corners[a], corners[b], corners[cc]);
      m.tri(corners[a], corners[cc], corners[d]);
    } else {
      m.tri(corners[a], corners[cc], corners[b]);
      m.tri(corners[a], corners[d], corners[cc]);
    }
  };
  f(0, 1, 3, 2); f(4, 6, 7, 5); f(0, 4, 5, 1); f(2, 3, 7, 6); f(0, 2, 6, 4); f(1, 5, 7, 3);
}

/** Catmull-Rom through rows [x, ...values] sorted by x; clamps outside the range. */
export function interpRows(rows: number[][], x: number): number[] {
  const n = rows.length;
  if (x <= rows[0][0]) return rows[0].slice(1);
  if (x >= rows[n - 1][0]) return rows[n - 1].slice(1);
  let i = 0;
  while (i < n - 2 && rows[i + 1][0] < x) i++;
  const p0 = rows[Math.max(0, i - 1)], p1 = rows[i], p2 = rows[i + 1], p3 = rows[Math.min(n - 1, i + 2)];
  const t = (x - p1[0]) / (p2[0] - p1[0]);
  const out: number[] = [];
  for (let k = 1; k < p1.length; k++) {
    const a = p0[k], b = p1[k], c = p2[k], d = p3[k];
    out.push(0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t));
  }
  return out;
}

/** Piecewise-linear blend of bone weights keyed by x. */
export function interpW(keys: [number, W][], x: number): W {
  if (x <= keys[0][0]) return keys[0][1];
  const n = keys.length;
  if (x >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && keys[i + 1][0] < x) i++;
  const t = (x - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
  const acc = new Map<number, number>();
  for (const [b, w] of keys[i][1]) acc.set(b, (acc.get(b) ?? 0) + w * (1 - t));
  for (const [b, w] of keys[i + 1][1]) acc.set(b, (acc.get(b) ?? 0) + w * t);
  return [...acc.entries()];
}

/** Scale and sum weight sets: [[W, factor], ...]. */
export function mixW(parts: [W, number][]): W {
  const acc = new Map<number, number>();
  for (const [w, f] of parts) {
    if (f <= 0) continue;
    for (const [b, x] of w) acc.set(b, (acc.get(b) ?? 0) + x * f);
  }
  return [...acc.entries()];
}
