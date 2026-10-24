// Procedural car body generator. Lofts the parametric body shape into a
// smooth shell, splits it into panels (doors, hood, trunk, bumpers), glass,
// lights and trim, adds interior, underbody, engine bay and details, and
// skins every vertex to the physics nodes of the panel it belongs to.

import * as THREE from 'three';
import type { VehicleDef } from '../sim/vehicle/defs.ts';
import type { VehicleStructure } from '../sim/vehicle/structure.ts';
import { BodyShape } from '../sim/vehicle/shape.ts';

export type MatKey =
  | 'paint'
  | 'trim'
  | 'chrome'
  | 'glass'
  | 'light'
  | 'grille'
  | 'plate'
  | 'interior'
  | 'under'
  | 'engine'
  | 'rubber';

export interface GeoGroup {
  key: string;
  mat: MatKey;
  pos: number[];
  nrm: number[];
  uv: number[];
  part: number[];
}

export interface CarGeometry {
  groups: Map<string, GeoGroup>;
}

type P3 = [number, number, number];

class Acc {
  groups = new Map<string, GeoGroup>();
  get(key: string, mat: MatKey): GeoGroup {
    let g = this.groups.get(key);
    if (!g) {
      g = { key, mat, pos: [], nrm: [], uv: [], part: [] };
      this.groups.set(key, g);
    }
    return g;
  }
  vert(g: GeoGroup, p: P3, n: P3, uv: [number, number], part: number): void {
    g.pos.push(p[0], p[1], p[2]);
    g.nrm.push(n[0], n[1], n[2]);
    g.uv.push(uv[0], uv[1]);
    g.part.push(part);
  }
  tri(g: GeoGroup, a: P3, b: P3, c: P3, na: P3, nb: P3, nc: P3, ua: [number, number], ub: [number, number], uc: [number, number], part: number): void {
    this.vert(g, a, na, ua, part);
    this.vert(g, b, nb, ub, part);
    this.vert(g, c, nc, uc, part);
  }
  /** Flat-shaded triangle with auto normal. */
  ftri(g: GeoGroup, a: P3, b: P3, c: P3, part: number, uv: [number, number] = [0, 0]): void {
    const n = faceNormal(a, b, c);
    this.tri(g, a, b, c, n, n, n, uv, uv, uv, part);
  }
  /** Add an arbitrary three.js geometry transformed by matrix. */
  addGeometry(g: GeoGroup, geo: THREE.BufferGeometry, m: THREE.Matrix4, part: number): void {
    const ng = geo.index ? geo.toNonIndexed() : geo;
    ng.applyMatrix4(m);
    if (!ng.getAttribute('normal')) ng.computeVertexNormals();
    const p = ng.getAttribute('position'), n = ng.getAttribute('normal'), u = ng.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      g.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      g.nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      g.uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
      g.part.push(part);
    }
    if (ng !== geo) ng.dispose();
  }
}

function faceNormal(a: P3, b: P3, c: P3): P3 {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Sample a Catmull-Rom chain through pts with given subdivisions per span. */
function sampleChain(pts: [number, number][], subdiv: number[], startPh: [number, number], endPh: [number, number]): [number, number][] {
  const ext = [startPh, ...pts, endPh];
  const out: [number, number][] = [];
  for (let s = 0; s < pts.length - 1; s++) {
    const a = ext[s], b = ext[s + 1], c = ext[s + 2], d = ext[s + 3];
    const n = subdiv[s];
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([catmull(a[0], b[0], c[0], d[0], t), catmull(a[1], b[1], c[1], d[1], t)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Row layout of the lower and upper patches
const NA = 4, NB = 4, NC = 2; // lower: sill->widest->below shoulder->shoulder
const ND = 6, NE = 7; // upper: shoulder->roof edge->center
const LOWER_ROWS = NA + NB + NC + 1;
const CAP_BULGE_F = 0.025;
const CAP_BULGE_R = 0.02;
/** Forward bulge of an end cap at lateral offset x for a face of half width hw. */
function capBulge(x: number, hw: number, bulge: number): number {
  const t = Math.min(1, Math.abs(x) / Math.max(hw, 0.1));
  return bulge * (1 - t * t) * Math.min(1, (hw + 0.2) / 0.6);
}
const UPPER_ROWS = ND + NE + 1;

export interface CarMeshInfo {
  shape: BodyShape;
  /** z positions of the body columns */
  zs: number[];
}

/** Build all visual geometry for a vehicle in its rest frame. */
export function buildCarGeometry(def: VehicleDef, st: VehicleStructure): CarGeometry {
  const shape = st.shape;
  const P = def.shape;
  const acc = new Acc();
  const pid = st.partIds;
  const zF = shape.zFront, zR = shape.zRear;
  const GAP = 0.005;

  // ------------------------------------------------------------- columns
  const keyZ: number[] = [zF, zR];
  const addK = (...zs: number[]) => keyZ.push(...zs);
  for (const [df, dr] of P.doors) addK(df, df - GAP, dr, dr + GAP, df - 0.06, dr + 0.06);
  const zHoodRear = P.zWindshieldBase + 0.04;
  const zHoodFront = zF - 0.05;
  const hasTrunk = pid.trunk >= 0;
  const zTrunkFront = P.zRearWindowBase - 0.04;
  const zTrunkRear = zR + 0.05;
  addK(zHoodRear, zHoodRear + GAP, zHoodFront, zHoodFront - GAP);
  if (hasTrunk) addK(zTrunkFront, zTrunkFront - GAP, zTrunkRear, zTrunkRear + GAP);
  addK(P.zWindshieldBase, P.zRoofFront, P.zRoofRear, P.zRearWindowBase);
  addK(zF - P.bumperLen, zF - P.bumperLen - GAP, zR + P.bumperLen, zR + P.bumperLen + GAP);
  for (const za of [P.zFrontAxle, P.zRearAxle]) {
    for (let k = -8; k <= 8; k++) addK(za + (k / 8) * P.archRadius);
  }
  if (P.zCabRear !== undefined) addK(P.zCabRear, P.zCabRear - 0.02, P.zCabRear - 0.1);
  for (let z = zR; z <= zF; z += 0.06) addK(z);
  keyZ.sort((a, b) => a - b);
  const zs: number[] = [];
  for (const z of keyZ) {
    if (z < zR - 1e-6 || z > zF + 1e-6) continue;
    if (zs.length && z - zs[zs.length - 1] < 0.0025) continue;
    zs.push(z);
  }
  const NZ = zs.length;

  // ------------------------------------------------------------- grid
  const sec = shape.newSection();
  const lower: [number, number][][] = [];
  const upper: [number, number][][] = [];
  const bedY = P.bedFloorY ?? 0.9;
  for (let i = 0; i < NZ; i++) {
    const z = zs[i];
    shape.section(z, sec);
    const K: [number, number][] = [];
    for (let k = 0; k < 6; k++) K.push([sec.x[k], sec.y[k]]);
    const lo = sampleChain(
      [K[0], K[1], K[2], K[3]],
      [NA, NB, NC],
      [K[0][0] - (K[1][0] - K[0][0]), K[0][1] - (K[1][1] - K[0][1])],
      [K[3][0] + (K[3][0] - K[2][0]), K[3][1] + (K[3][1] - K[2][1])],
    );
    let up: [number, number][];
    if (shape.inBed(z)) {
      // open bed: rail top -> inner wall -> floor center
      const x3 = K[3][0], y3 = K[3][1];
      const xi = x3 - 0.075;
      const pts: [number, number][] = [];
      for (let k = 0; k <= ND; k++) pts.push([x3 + (xi - x3) * (k / ND), y3 + 0.004 * Math.sin((k / ND) * Math.PI)]);
      const wallH = y3 - bedY;
      for (let k = 1; k <= NE; k++) {
        const t = k / NE;
        if (t <= 0.55) pts.push([xi, y3 - wallH * (t / 0.55)]);
        else pts.push([xi * (1 - (t - 0.55) / 0.45), bedY]);
      }
      up = pts;
    } else {
      up = sampleChain(
        [K[3], K[4], K[5]],
        [ND, NE],
        [K[3][0] - (K[4][0] - K[3][0]), K[3][1] - (K[4][1] - K[3][1])],
        [-K[4][0], K[4][1]],
      );
    }
    lower.push(lo);
    upper.push(up);
  }

  // smooth normals per patch on the left half
  const normalsOf = (grid: [number, number][][], rows: number, flipCheck: (i: number, j: number) => number): P3[][] => {
    const out: P3[][] = [];
    for (let i = 0; i < NZ; i++) {
      const col: P3[] = [];
      for (let j = 0; j < rows; j++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(NZ - 1, i + 1);
        const j0 = Math.max(0, j - 1), j1 = Math.min(rows - 1, j + 1);
        const tu: P3 = [grid[i1][j][0] - grid[i0][j][0], grid[i1][j][1] - grid[i0][j][1], zs[i1] - zs[i0]];
        const tv: P3 = [grid[i][j1][0] - grid[i][j0][0], grid[i][j1][1] - grid[i][j0][1], 0];
        // n = tv x tu
        let nx = tv[1] * tu[2] - tv[2] * tu[1];
        let ny = tv[2] * tu[0] - tv[0] * tu[2];
        let nz = tv[0] * tu[1] - tv[1] * tu[0];
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        const s = flipCheck(i, j);
        if (nx * s < 0 && Math.abs(nx) > 0.05) {
          nx = -nx; ny = -ny; nz = -nz;
        }
        col.push([nx, ny, nz]);
      }
      out.push(col);
    }
    return out;
  };
  const lowN = normalsOf(lower, LOWER_ROWS, () => 1);
  const upN = normalsOf(upper, UPPER_ROWS, () => 1);
  // ensure upper normals point up/out (for the bed they may point inward, which is correct)
  for (let i = 0; i < NZ; i++) {
    for (let j = 0; j < UPPER_ROWS; j++) {
      const n = upN[i][j];
      if (!shape.inBed(zs[i]) && n[1] < -0.2) {
        n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2];
      }
    }
  }

  // ------------------------------------------------------------- part logic
  const doorOf = (z: number): number => {
    for (let d = 0; d < P.doors.length; d++) {
      const [df, dr] = P.doors[d];
      if (z < df - GAP && z > dr + GAP) return d;
    }
    return -1;
  };
  const inGapZ = (z: number): boolean => {
    for (const [df, dr] of P.doors) {
      if ((z > df - GAP && z < df) || (z > dr && z < dr + GAP)) return true;
    }
    return false;
  };
  const doorPart = (d: number, side: number) => pid[`door${d === 0 ? 'F' : 'R'}${side > 0 ? 'L' : 'R'}`];
  const bumperPaint = P.style === 'pickup' || P.style === 'van' ? 'trim' : 'paint';

  interface CellSpec {
    key: string;
    mat: MatKey;
    part: number;
  }
  const BODY: CellSpec = { key: 'paint', mat: 'paint', part: pid.body };
  const lowerCell = (zc: number, j: number, side: number): CellSpec | null => {
    const spanA = j < NA, spanAB = j < NA + NB;
    if (zc > zF - P.bumperLen && spanAB) {
      if (zc < zF - P.bumperLen + GAP) return null;
      return { key: bumperPaint, mat: bumperPaint as MatKey, part: pid.bumperF };
    }
    if (zc < zR + P.bumperLen && spanAB) {
      if (zc > zR + P.bumperLen - GAP) return null;
      return { key: bumperPaint, mat: bumperPaint as MatKey, part: pid.bumperR };
    }
    if (inGapZ(zc) && j >= 1) return null;
    const d = doorOf(zc);
    if (d >= 0 && j >= 1) {
      // keep wheel arch cutouts out of rear doors
      if (shape.archY(zc) > -Infinity && j < 2) return BODY;
      return { key: 'paint', mat: 'paint', part: doorPart(d, side) };
    }
    void spanA;
    return BODY;
  };

  const windowIndex = (name: string) => st.windows.findIndex((w) => w.name === name);
  const upperCell = (zc: number, j: number, side: number): CellSpec | null => {
    const spanD = j < ND;
    const g = shape.greenhouse(zc);
    if (shape.inBed(zc)) return BODY;
    if (zc > zHoodRear && zc < zHoodFront) {
      if (zc < zHoodRear + GAP || zc > zHoodFront - GAP) return null;
      return { key: 'paint', mat: 'paint', part: pid.hood };
    }
    if (hasTrunk && zc < zTrunkFront && zc > zTrunkRear) {
      if (zc > zTrunkFront - GAP || zc < zTrunkRear + GAP) return null;
      return { key: 'paint', mat: 'paint', part: pid.trunk };
    }
    const inWindshield = zc < P.zWindshieldBase && zc > P.zRoofFront;
    const inRear = zc > P.zRearWindowBase && zc < P.zRoofRear;
    if (!spanD) {
      if (inWindshield) {
        const wi = windowIndex('windshield');
        return { key: `glass:${wi}`, mat: 'glass', part: pid.body };
      }
      if (inRear && windowIndex('rear') >= 0) {
        return { key: `glass:${windowIndex('rear')}`, mat: 'glass', part: pid.body };
      }
      return BODY;
    }
    // span D: side greenhouse
    if (g < 0.02) return BODY;
    if (j === 0) return { key: 'trim', mat: 'trim', part: doorOf(zc) >= 0 ? doorPart(doorOf(zc), side) : pid.body };
    if (j === ND - 1) return BODY; // roof rail / A-pillar strip
    const d = doorOf(zc);
    if (d >= 0) {
      const [df, dr] = P.doors[d];
      const pillarF = d === 0 ? 0.02 : 0.05;
      const pillarR = 0.05;
      if (zc > df - pillarF || zc < dr + pillarR) return { key: 'trim', mat: 'trim', part: doorPart(d, side) };
      const wi = windowIndex(`side${d === 0 ? 'F' : 'R'}${side > 0 ? 'L' : 'R'}`);
      return { key: `glass:${wi}`, mat: 'glass', part: doorPart(d, side) };
    }
    // quarter glass for long cabins (vans, SUVs) else painted pillar
    if ((P.style === 'suv' || P.style === 'van' || P.style === 'hatch') && zc < P.zRoofRear + 0.6 && zc > P.zRoofRear - 0.3 && g > 0.9 && zc < P.doors[P.doors.length - 1][1] - 0.1) {
      return { key: 'glass:q', mat: 'glass', part: pid.body };
    }
    if (P.style === 'van' && g > 0.9) return { key: 'trim', mat: 'trim', part: pid.body };
    return BODY;
  };

  // ------------------------------------------------------------- emit shell
  const Lx = P.length, Wx = P.width;
  const emitPatch = (grid: [number, number][][], norms: P3[][], rows: number, cellFn: (zc: number, j: number, side: number) => CellSpec | null, upperPatch: boolean) => {
    for (const side of [1, -1]) {
      for (let i = 0; i < NZ - 1; i++) {
        const zc = (zs[i] + zs[i + 1]) / 2;
        for (let j = 0; j < rows - 1; j++) {
          const spec = cellFn(zc, j, side);
          if (!spec) continue;
          const g = acc.get(spec.key, spec.mat);
          const v = (ii: number, jj: number): P3 => [grid[ii][jj][0] * side, grid[ii][jj][1], zs[ii]];
          const nn = (ii: number, jj: number): P3 => {
            const n = norms[ii][jj];
            return [n[0] * side, n[1], n[2]];
          };
          const uvf = (ii: number, jj: number): [number, number] => [(zs[ii] - zR) / Lx, (grid[ii][jj][0] * side) / Wx + 0.5 + (upperPatch ? 0 : 0)];
          let a: [number, number] = [i, j], b: [number, number] = [i + 1, j], c: [number, number] = [i + 1, j + 1], d: [number, number] = [i, j + 1];
          // winding: for left side the outward normal is +x; flip on the right
          const pa = v(...a), pb = v(...b), pc = v(...c), pd = v(...d);
          const flip = side < 0;
          const tri = (x: [number, number], y: [number, number], z: [number, number]) => {
            if (!flip) acc.tri(g, v(...x), v(...y), v(...z), nn(...x), nn(...y), nn(...z), uvf(...x), uvf(...y), uvf(...z), spec.part);
            else acc.tri(g, v(...x), v(...z), v(...y), nn(...x), nn(...z), nn(...y), uvf(...x), uvf(...z), uvf(...y), spec.part);
          };
          // orientation check against normal
          const fn = faceNormal(pa, pb, pc);
          const nref = nn(...a);
          const dotv = fn[0] * nref[0] + fn[1] * nref[1] + fn[2] * nref[2];
          if ((dotv < 0) !== flip) {
            const t = b;
            b = d;
            d = t;
          }
          tri(a, b, c);
          tri(a, c, d);
          void pd;
        }
      }
    }
  };
  emitPatch(lower, lowN, LOWER_ROWS, lowerCell, false);
  emitPatch(upper, upN, UPPER_ROWS, upperCell, true);

  // ------------------------------------------------------------- end caps
  const capRows = (i: number, includeUpper: boolean): [number, number][] => {
    const r: [number, number][] = [...lower[i]];
    if (includeUpper) for (let j = 1; j < UPPER_ROWS; j++) r.push(upper[i][j]);
    return r;
  };
  const buildCap = (front: boolean) => {
    const i = front ? NZ - 1 : 0;
    const z = zs[i];
    const bed = shape.inBed(z);
    const rows = capRows(i, !bed);
    const dir = front ? 1 : -1;
    const nseg = 10;
    const bulge = front ? CAP_BULGE_F : CAP_BULGE_R;
    const bumperTop = front ? P.bumperTopFront : P.bumperTopRear;
    for (let j = 0; j < rows.length - 1; j++) {
      const r0 = rows[j], r1 = rows[j + 1];
      if (r1[1] < r0[1] - 1e-4) continue; // non-monotonic
      const ymid = (r0[1] + r1[1]) / 2;
      const isBumper = ymid < bumperTop && j < NA + NB;
      const spec: CellSpec = isBumper
        ? { key: bumperPaint, mat: bumperPaint as MatKey, part: front ? pid.bumperF : pid.bumperR }
        : BODY;
      const g = acc.get(spec.key, spec.mat);
      for (let k = 0; k < nseg; k++) {
        const t0 = -1 + (2 * k) / nseg, t1 = -1 + (2 * (k + 1)) / nseg;
        const pt = (r: [number, number], t: number): P3 => {
          const x = r[0] * t;
          const zz = z + dir * capBulge(x, r[0], bulge);
          return [x, r[1], zz];
        };
        const a = pt(r0, t0), b = pt(r0, t1), c = pt(r1, t1), d = pt(r1, t0);
        const n: P3 = [0, 0, dir];
        const uv = (p: P3): [number, number] => [p[0] / Wx + 0.5, p[1]];
        const nA: P3 = [n[0] + t0 * 0.15 * dir * 0, n[1], n[2]];
        if (front) {
          acc.tri(g, a, b, c, nA, n, n, uv(a), uv(b), uv(c), spec.part);
          acc.tri(g, a, c, d, nA, n, n, uv(a), uv(c), uv(d), spec.part);
        } else {
          acc.tri(g, a, c, b, nA, n, n, uv(a), uv(c), uv(b), spec.part);
          acc.tri(g, a, d, c, nA, n, n, uv(a), uv(d), uv(c), spec.part);
        }
      }
    }
    return { rows, z };
  };
  const capF = buildCap(true);
  const capR = buildCap(false);

  // ------------------------------------------------------------- front details
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3(1, 1, 1);
  const place = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    q.setFromEuler(new THREE.Euler(rx, ry, rz));
    sc.set(sx, sy, sz);
    return m4.clone().compose(new THREE.Vector3(x, y, z), q, sc);
  };
  const rowAtY = (rows: [number, number][], y: number) => {
    // half width of the cap at height y
    let best = 0;
    for (let j = 0; j < rows.length - 1; j++) {
      const a = rows[j], b = rows[j + 1];
      if ((a[1] - y) * (b[1] - y) <= 0 && Math.abs(b[1] - a[1]) > 1e-6) {
        const t = (y - a[1]) / (b[1] - a[1]);
        best = Math.max(best, a[0] + (b[0] - a[0]) * t);
      }
    }
    return best;
  };
  {
    const zBase = capF.z;
    const zOn = (x0: number, x1: number, hw: number) => zBase + Math.max(capBulge(x0, hw, CAP_BULGE_F), capBulge(x1, hw, CAP_BULGE_F)) + 0.006;
    const yTop = P.bumperTopFront;
    const sh = shape.shoulderY(zF);
    const hlH = Math.max(0.08, Math.min(0.16, (sh - yTop) * 0.75));
    const hlY = yTop + (sh - yTop) * 0.45;
    const hwAt = rowAtY(capF.rows, hlY);
    const hlW = Math.min(0.34, hwAt * 0.42);
    const headIdx = (s: number) => st.lights.findIndex((l) => l.kind === 'head' && l.side === s);
    for (const s of [1, -1]) {
      const cx = s * (hwAt - hlW / 2 - 0.035);
      const z = zOn(cx - hlW / 2, cx + hlW / 2, hwAt);
      const shapeL = roundedRect(hlW, hlH, Math.min(hlH * 0.45, 0.05));
      const geo = new THREE.ShapeGeometry(shapeL, 6);
      acc.addGeometry(acc.get(`light:${headIdx(s)}`, 'light'), geo, place(cx, hlY, z + 0.004), pid.body);
      // dark bezel behind
      const bez = new THREE.ShapeGeometry(roundedRect(hlW + 0.025, hlH + 0.025, Math.min(hlH * 0.5, 0.06)), 6);
      acc.addGeometry(acc.get('trim', 'trim'), bez, place(cx, hlY, z), pid.body);
      geo.dispose();
      bez.dispose();
    }
    // grille between headlights
    const gW = Math.max(0.25, (hwAt - hlW - 0.08) * 2 * 0.92);
    const gH = Math.min(0.22, (sh - yTop) * 0.8);
    const gY = yTop + (sh - yTop) * 0.42;
    const zG = zOn(0, 0, hwAt);
    const grille = new THREE.ShapeGeometry(roundedRect(gW, gH, 0.03), 4);
    acc.addGeometry(acc.get('grille', 'grille'), grille, place(0, gY, zG + 0.004), pid.body);
    const surround = new THREE.ShapeGeometry(roundedRect(gW + 0.03, gH + 0.03, 0.04), 4);
    acc.addGeometry(acc.get('chrome', 'chrome'), surround, place(0, gY, zG), pid.body);
    // lower intake in bumper
    const bBot = shape.sillY(zF);
    const iW = Math.min(1.0, rowAtY(capF.rows, bBot + 0.08) * 1.3);
    const hwLow = rowAtY(capF.rows, bBot + 0.08);
    const intake = new THREE.ShapeGeometry(roundedRect(iW, 0.09, 0.03), 4);
    acc.addGeometry(acc.get('grille', 'grille'), intake, place(0, bBot + 0.075, zOn(-iW / 2, iW / 2, hwLow)), pid.bumperF);
    // license plate
    const plate = new THREE.PlaneGeometry(0.52, 0.12);
    const hwPl = rowAtY(capF.rows, (bBot + yTop) / 2 + 0.03);
    acc.addGeometry(acc.get('plate', 'plate'), plate, place(0, (bBot + yTop) / 2 + 0.03, zOn(0, 0, hwPl) + 0.002), pid.bumperF);
    // fog lights
    for (const s of [1, -1]) {
      const fx = s * hwLow * 0.72;
      const fog = new THREE.CircleGeometry(0.038, 14);
      acc.addGeometry(acc.get('chrome', 'chrome'), fog, place(fx, bBot + 0.1, zOn(fx, fx, hwLow) + 0.002), pid.bumperF);
      fog.dispose();
    }
    grille.dispose();
    surround.dispose();
    intake.dispose();
    plate.dispose();
  }
  // ------------------------------------------------------------- rear details
  {
    const zBaseR = capR.z;
    const zOnR = (x0: number, x1: number, hw: number) => zBaseR - Math.max(capBulge(x0, hw, CAP_BULGE_R), capBulge(x1, hw, CAP_BULGE_R)) - 0.006;
    const yTop = P.bumperTopRear;
    const sh = shape.shoulderY(zR);
    const tlH = Math.max(0.08, Math.min(0.17, (sh - yTop) * 0.7));
    const tlY = yTop + (sh - yTop) * 0.5;
    const hwAt = rowAtY(capR.rows, tlY);
    const tlW = Math.min(0.42, hwAt * 0.5);
    const tailIdx = (s: number) => st.lights.findIndex((l) => l.kind === 'tail' && l.side === s);
    for (const s of [1, -1]) {
      const cx = s * (hwAt - tlW / 2 - 0.03);
      const geo = new THREE.ShapeGeometry(roundedRect(tlW, tlH, 0.025), 4);
      acc.addGeometry(acc.get(`light:${tailIdx(s)}`, 'light'), geo, place(cx, tlY, zOnR(cx - tlW / 2, cx + tlW / 2, hwAt), 0, Math.PI), pid.body);
      geo.dispose();
    }
    const bBot = shape.sillY(zR);
    const z = zOnR(0, 0, hwAt);
    const plate = new THREE.PlaneGeometry(0.52, 0.12);
    acc.addGeometry(acc.get('plate', 'plate'), plate, place(0, tlY - 0.02, z - 0.002, 0, Math.PI), pid.body);
    plate.dispose();
    // exhaust tips
    const n = def.features.exhaustCount ?? 1;
    const tipXs = n === 1 ? [-0.45] : n === 2 ? [-0.5, 0.5] : n === 4 ? [-0.62, -0.48, 0.48, 0.62] : [-0.45];
    for (const tx of tipXs) {
      const tip = new THREE.CylinderGeometry(0.042, 0.042, 0.14, 14, 1, true);
      acc.addGeometry(acc.get('chrome', 'chrome'), tip, place(tx * (P.width / 1.9), bBot - 0.02, zR + 0.03, Math.PI / 2), pid.bumperR);
      const inner = new THREE.CircleGeometry(0.038, 12);
      acc.addGeometry(acc.get('under', 'under'), inner, place(tx * (P.width / 1.9), bBot - 0.02, zR - 0.035, 0, Math.PI), pid.bumperR);
      tip.dispose();
      inner.dispose();
    }
    // rear bumper diffuser strip
    const dif = new THREE.ShapeGeometry(roundedRect(rowAtY(capR.rows, bBot + 0.05) * 1.6, 0.06, 0.02), 2);
    acc.addGeometry(acc.get('trim', 'trim'), dif, place(0, bBot + 0.05, z - 0.003, 0, Math.PI), pid.bumperR);
    dif.dispose();
  }

  // ------------------------------------------------------------- mirrors & handles
  {
    const d0 = P.doors[0];
    const zm = d0[0] - 0.12;
    shape.section(zm, sec);
    const sh = sec.y[3];
    const xw = sec.x[3];
    for (const s of [1, -1]) {
      const part = doorPart(0, s);
      const housing = new THREE.SphereGeometry(1, 12, 8);
      acc.addGeometry(acc.get('paint', 'paint'), housing, place(s * (xw + 0.09), sh + 0.07, zm, 0, 0, 0, 0.085, 0.06, 0.11), part);
      const arm = new THREE.BoxGeometry(0.1, 0.03, 0.05);
      acc.addGeometry(acc.get('trim', 'trim'), arm, place(s * (xw + 0.03), sh + 0.04, zm + 0.02), part);
      const glassM = new THREE.CircleGeometry(1, 12);
      acc.addGeometry(acc.get('chrome', 'chrome'), glassM, place(s * (xw + 0.09), sh + 0.07, zm - 0.105, 0, Math.PI, 0, 0.07, 0.048, 1), part);
      housing.dispose();
      arm.dispose();
      glassM.dispose();
    }
    P.doors.forEach(([df, dr], di) => {
      const zh = dr + 0.16 + (df - dr) * 0.05;
      shape.section(zh, sec);
      const y = sec.y[3] - 0.08;
      // lateral position on the surface at height y
      const xs = sec.x[2] + 0.004;
      for (const s of [1, -1]) {
        const handle = new THREE.BoxGeometry(0.018, 0.03, 0.13);
        acc.addGeometry(acc.get('chrome', 'chrome'), handle, place(s * xs, y, zh), doorPart(di, s));
        handle.dispose();
      }
    });
  }

  // ------------------------------------------------------------- wheel well liners
  for (const za of [P.zFrontAxle, P.zRearAxle]) {
    for (const s of [1, -1]) {
      const r = P.archRadius - 0.012;
      const xOuter = s * (shape.halfWidth(za) - 0.03);
      const xInner = s * (P.track / 2 - P.wheelWidth / 2 - 0.08);
      const cy = P.wheelY + 0.025;
      const g = acc.get('under', 'under');
      const segs = 14;
      for (let k = 0; k < segs; k++) {
        const a0 = Math.PI * (-0.05 + (1.1 * k) / segs), a1 = Math.PI * (-0.05 + (1.1 * (k + 1)) / segs);
        const p = (x: number, a: number): P3 => [x, cy + Math.sin(a) * r, za + Math.cos(a) * r];
        const n0: P3 = [0, -Math.sin(a0), -Math.cos(a0)], n1: P3 = [0, -Math.sin(a1), -Math.cos(a1)];
        const A = p(xOuter, a0), B = p(xInner, a0), C = p(xInner, a1), D = p(xOuter, a1);
        const uv: [number, number] = [0, 0];
        if (s > 0) {
          acc.tri(g, A, B, C, n0, n0, n1, uv, uv, uv, pid.body);
          acc.tri(g, A, C, D, n0, n1, n1, uv, uv, uv, pid.body);
        } else {
          acc.tri(g, A, C, B, n0, n1, n0, uv, uv, uv, pid.body);
          acc.tri(g, A, D, C, n0, n1, n1, uv, uv, uv, pid.body);
        }
      }
      // inner wall
      const wall = new THREE.CircleGeometry(r, 16, 0, Math.PI);
      acc.addGeometry(g, wall, place(xInner, cy, za, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI / 2 * 0), pid.body);
      wall.dispose();
    }
  }

  // ------------------------------------------------------------- underbody
  {
    const g = acc.get('under', 'under');
    const nZ = 24;
    for (let k = 0; k < nZ; k++) {
      const z0 = zR + 0.12 + ((zF - zR - 0.24) * k) / nZ, z1 = zR + 0.12 + ((zF - zR - 0.24) * (k + 1)) / nZ;
      const y0 = shape.sillY(z0) + 0.02, y1 = shape.sillY(z1) + 0.02;
      const w0 = shape.halfWidth(z0) - 0.06, w1 = shape.halfWidth(z1) - 0.06;
      const A: P3 = [w0, y0, z0], B: P3 = [-w0, y0, z0], C: P3 = [-w1, y1, z1], D: P3 = [w1, y1, z1];
      const n: P3 = [0, -1, 0];
      const uv: [number, number] = [0, 0];
      acc.tri(g, A, C, B, n, n, n, uv, uv, uv, pid.body);
      acc.tri(g, A, D, C, n, n, n, uv, uv, uv, pid.body);
    }
    // exhaust pipe
    const pipe = new THREE.CylinderGeometry(0.03, 0.03, (zF - zR) * 0.75, 8, 1, true);
    acc.addGeometry(g, pipe, place(-0.25, shape.sillY(0) + 0.0, (zF + zR) / 2 - 0.3, Math.PI / 2), pid.body);
    const muffler = new THREE.BoxGeometry(0.4, 0.14, 0.45);
    acc.addGeometry(g, muffler, place(-0.25, shape.sillY(zR + 0.6) + 0.04, zR + 0.6), pid.body);
    const tank = new THREE.BoxGeometry(0.9, 0.18, 0.5);
    acc.addGeometry(g, tank, place(0, shape.sillY(P.zRearAxle + 0.6) + 0.08, P.zRearAxle + 0.55), pid.body);
    pipe.dispose();
    muffler.dispose();
    tank.dispose();
  }

  // ------------------------------------------------------------- interior
  buildInterior(acc, def, shape, pid.body);

  // ------------------------------------------------------------- engine bay
  {
    const g = acc.get('engine', 'engine');
    const za = P.zFrontAxle + 0.05;
    const floorY = shape.sillY(P.zFrontAxle) + 0.07;
    const topY = Math.min(shape.shoulderY(P.zFrontAxle) - 0.08, floorY + 0.55);
    const h = topY - floorY;
    const block = new THREE.BoxGeometry(0.52, h * 0.7, 0.6);
    acc.addGeometry(g, block, place(0, floorY + h * 0.35, za), pid.engine);
    const head = new THREE.BoxGeometry(0.6, h * 0.25, 0.62);
    acc.addGeometry(g, head, place(0, floorY + h * 0.82, za), pid.engine);
    const cover = new THREE.BoxGeometry(0.42, 0.05, 0.5);
    acc.addGeometry(acc.get('trim', 'trim'), cover, place(0, topY - 0.01, za), pid.engine);
    const intake = new THREE.CylinderGeometry(0.07, 0.07, 0.45, 10);
    acc.addGeometry(g, intake, place(0.2, floorY + h * 0.75, za + 0.15, 0, 0, Math.PI / 2), pid.engine);
    block.dispose();
    head.dispose();
    cover.dispose();
    intake.dispose();
    // radiator in front of engine
    const rz = zF - P.bumperLen - 0.05;
    const rad = new THREE.BoxGeometry(Math.min(1.1, shape.halfWidth(rz) * 1.4), 0.4, 0.06);
    acc.addGeometry(acc.get('grille', 'grille'), rad, place(0, shape.sillY(rz) + 0.32, rz), pid.body);
    rad.dispose();
  }

  // ------------------------------------------------------------- style extras
  if (def.features.spoiler && hasTrunk) {
    const zs0 = zR + 0.16;
    const y = shape.topY(zs0) + 0.03;
    const w = shape.halfWidth(zs0) * 1.7;
    const wing = new THREE.BoxGeometry(w, 0.025, 0.22);
    acc.addGeometry(acc.get('paint', 'paint'), wing, place(0, y + 0.13, zs0, -0.08), pid.trunk);
    for (const s of [1, -1]) {
      const post = new THREE.BoxGeometry(0.03, 0.13, 0.08);
      acc.addGeometry(acc.get('trim', 'trim'), post, place(s * w * 0.35, y + 0.065, zs0), pid.trunk);
      post.dispose();
    }
    wing.dispose();
  }
  if (def.features.hoodScoop) {
    const zc = (P.zFrontAxle + P.zWindshieldBase) / 2 + 0.1;
    const y = shape.topY(zc);
    const scoop = new THREE.BoxGeometry(0.5, 0.09, 0.7);
    acc.addGeometry(acc.get('paint', 'paint'), scoop, place(0, y + 0.035, zc, 0.06), pid.hood);
    const mouth = new THREE.PlaneGeometry(0.42, 0.06);
    acc.addGeometry(acc.get('grille', 'grille'), mouth, place(0, y + 0.045, zc + 0.355), pid.hood);
    scoop.dispose();
    mouth.dispose();
  }
  if (def.features.roofRack) {
    for (const s of [1, -1]) {
      const zc = (P.zRoofFront + P.zRoofRear) / 2;
      const len = (P.zRoofFront - P.zRoofRear) * 0.85;
      shape.section(zc, sec);
      const rail = new THREE.BoxGeometry(0.04, 0.05, len);
      acc.addGeometry(acc.get('trim', 'trim'), rail, place(s * sec.x[4] * 0.92, sec.y[4] + 0.05, zc), pid.body);
      rail.dispose();
    }
  }

  return { groups: acc.groups };
}

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function buildInterior(acc: Acc, def: VehicleDef, shape: BodyShape, bodyPart: number): void {
  const P = def.shape;
  const g = acc.get('interior', 'interior');
  const m4 = new THREE.Matrix4();
  const place = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
    return m4.clone().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
  };
  const zDash = P.zWindshieldBase - 0.12;
  const zCabRear = P.style === 'pickup' && P.zCabRear !== undefined ? P.zCabRear : Math.max(P.zRearAxle + P.archRadius, P.zRearWindowBase + 0.2);
  const floorY = shape.sillY(0) + 0.06;
  const belt = shape.shoulderY(0);
  // carpet
  const carpet = new THREE.BoxGeometry(shape.halfWidth(0) * 1.8, 0.03, Math.max(0.5, zDash - zCabRear));
  acc.addGeometry(g, carpet, place(0, floorY, (zDash + zCabRear) / 2), bodyPart);
  // dashboard
  const dashW = shape.halfWidth(zDash) * 1.82;
  const dash = new THREE.BoxGeometry(dashW, 0.18, 0.42);
  acc.addGeometry(g, dash, place(0, belt - 0.13, zDash - 0.04, -0.15), bodyPart);
  // steering wheel (left side = +x)
  const swX = 0.37 * (P.width / 1.83);
  const swZ = zDash - 0.36;
  const sw = new THREE.TorusGeometry(0.18, 0.018, 8, 24);
  acc.addGeometry(g, sw, place(swX, belt + 0.06, swZ, -0.35), bodyPart);
  const col = new THREE.CylinderGeometry(0.025, 0.03, 0.4, 8);
  acc.addGeometry(g, col, place(swX, belt, swZ + 0.17, Math.PI / 2 - 0.35), bodyPart);
  const hub = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12);
  acc.addGeometry(g, hub, place(swX, belt + 0.06, swZ, Math.PI / 2 - 0.35), bodyPart);
  // seats
  const seatRows: number[] = [swZ - 0.42];
  if (P.doors.length > 1 || P.style === 'van' || P.style === 'suv') seatRows.push(swZ - 1.25);
  seatRows.forEach((zs, row) => {
    if (zs < zCabRear + 0.25) return;
    const xs = row === 0 ? [swX, -swX] : [0.38, 0, -0.38];
    for (const x of xs) {
      const w = row === 0 ? 0.48 : 0.42;
      const cush = new THREE.BoxGeometry(w, 0.13, 0.5);
      acc.addGeometry(g, cush, place(x, floorY + 0.25, zs), bodyPart);
      const back = new THREE.BoxGeometry(w, 0.62, 0.12);
      acc.addGeometry(g, back, place(x, floorY + 0.58, zs - 0.27, -0.2), bodyPart);
      const head = new THREE.BoxGeometry(w * 0.55, 0.16, 0.09);
      acc.addGeometry(g, head, place(x, floorY + 0.98, zs - 0.35, -0.2), bodyPart);
      cush.dispose();
      back.dispose();
      head.dispose();
    }
  });
  // center console
  const cons = new THREE.BoxGeometry(0.2, 0.22, 0.75);
  acc.addGeometry(g, cons, place(0, floorY + 0.12, swZ - 0.25), bodyPart);
  carpet.dispose();
  dash.dispose();
  sw.dispose();
  col.dispose();
  hub.dispose();
  cons.dispose();
}

// ---------------------------------------------------------------------------
// Skinning: bind vertices to the nearest nodes of their physics part.

export interface SkinData {
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
}

export function computeSkin(group: GeoGroup, st: VehicleStructure): SkinData {
  const body = st.body;
  const rest = body.rest;
  const n = group.pos.length / 3;
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const partNodes = new Map<number, Int32Array>();
  const nodesOf = (part: number): Int32Array => {
    let arr = partNodes.get(part);
    if (!arr) {
      const p = body.parts[part];
      arr = Int32Array.from(p && p.nodes.length ? p.nodes : body.parts[0].nodes);
      partNodes.set(part, arr);
    }
    return arr;
  };
  const bestD = new Float64Array(5);
  const bestI = new Int32Array(5);
  for (let v = 0; v < n; v++) {
    const x = group.pos[v * 3], y = group.pos[v * 3 + 1], z = group.pos[v * 3 + 2];
    const nodes = nodesOf(group.part[v]);
    bestD.fill(Infinity);
    bestI.fill(-1);
    for (let k = 0; k < nodes.length; k++) {
      const id = nodes[k];
      const dx = rest[id * 3] - x, dy = rest[id * 3 + 1] - y, dz = rest[id * 3 + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD[4]) {
        let p = 4;
        while (p > 0 && bestD[p - 1] > d) {
          bestD[p] = bestD[p - 1];
          bestI[p] = bestI[p - 1];
          p--;
        }
        bestD[p] = d;
        bestI[p] = id;
      }
    }
    // weights: inverse distance with the 5th neighbour as cutoff (continuous)
    const d5 = Math.sqrt(bestD[4]);
    let sum = 0;
    const w = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      if (bestI[k] < 0) continue;
      const d = Math.sqrt(bestD[k]) + 0.02;
      const wk = isFinite(d5) ? Math.max(0, 1 / d - 1 / (d5 + 0.02)) : 1 / d;
      w[k] = wk;
      sum += wk;
    }
    if (sum <= 1e-9) {
      w[0] = 1;
      sum = 1;
    }
    for (let k = 0; k < 4; k++) {
      skinIndex[v * 4 + k] = bestI[k] >= 0 ? bestI[k] : bestI[0];
      skinWeight[v * 4 + k] = w[k] / sum;
    }
  }
  return { skinIndex, skinWeight };
}
