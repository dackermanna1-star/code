// Node-beam soft body. Nodes are point masses; beams are damped springs with
// plastic yield (permanent deformation) and breaking. Collision triangles
// span outer nodes so other bodies' nodes can collide with this one.
//
// Everything lives in structure-of-arrays typed arrays so the 2 kHz inner
// loops stay allocation free.

import { extractRotation, mat3FromQuat, symEigen3 } from './math.ts';

export const BEAM_BROKEN = 1;
/** Pushes only (resists compression), no tension. */
export const BEAM_SUPPORT = 2;
/** Elastic only, never yields. */
export const BEAM_NODEFORM = 4;
/** Fully crushed: yield disabled in compression. */
export const BEAM_CRUSHED = 8;
/** Attachment beam: when broken it may detach a part. */
export const BEAM_ATTACH = 16;
/** Pulls only (rope/tether), no compression. */
export const BEAM_ROPE = 32;

/** Speed (m/s) a beam's stored energy may give its lighter node at most; see bCrushCap. */
const MAX_RELEASE_SPEED = 12;

export const NODE_COLLIDE = 1;
/** Node participates in node-vs-triangle collisions with other bodies. */
export const NODE_SOFTCOLLIDE = 2;

export const Mat = {
  METAL: 0,
  PLASTIC: 1,
  RUBBER: 2,
  GLASS: 3,
  WOOD: 4,
  CONCRETE: 5,
} as const;

export interface NodeOptions {
  mass: number;
  friction?: number;
  material?: number;
  part?: number;
  collide?: boolean;
  softCollide?: boolean;
  fixed?: boolean;
}

export interface BeamOptions {
  /** Spring constant N/m. */
  k: number;
  /** Damping N/(m/s). */
  c: number;
  /** Compression yield force (N). Infinity = never yields. */
  yieldC?: number;
  /** Tension yield force (N). */
  yieldT?: number;
  /** Break force (N). */
  strength?: number;
  /** Break when rest length exceeds this ratio of original. */
  maxStretch?: number;
  /** Stop yielding in compression at this ratio of original length. */
  minRatio?: number;
  flags?: number;
  part?: number;
  /** Damage zone id for mechanical damage accounting. */
  zone?: number;
}

export interface PartInfo {
  name: string;
  /** Nodes belonging to this part. */
  nodes: number[];
  /** Beams that connect it to its parent. */
  attachBeams: number[];
  /** Fraction of attach beams that must break to consider the part detached. */
  detachRatio: number;
  detached: boolean;
  /** Visual/material role (hood, door, bumper...) */
  role: string;
}

interface BuildNode {
  x: number;
  y: number;
  z: number;
  o: NodeOptions;
}

interface BuildBeam {
  a: number;
  b: number;
  o: BeamOptions;
}

export class SoftBodyBuilder {
  nodes: BuildNode[] = [];
  beams: BuildBeam[] = [];
  tris: number[][] = [];
  triParts: number[] = [];
  parts: PartInfo[] = [];
  private beamSet = new Set<string>();

  addPart(name: string, role = name, detachRatio = 0.6): number {
    this.parts.push({ name, nodes: [], attachBeams: [], detachRatio, detached: false, role });
    return this.parts.length - 1;
  }

  addNode(x: number, y: number, z: number, o: NodeOptions): number {
    this.nodes.push({ x, y, z, o: { ...o } });
    const id = this.nodes.length - 1;
    if (o.part !== undefined && this.parts[o.part]) this.parts[o.part].nodes.push(id);
    return id;
  }

  hasBeam(a: number, b: number): boolean {
    return this.beamSet.has(a < b ? a + ',' + b : b + ',' + a);
  }

  addBeam(a: number, b: number, o: BeamOptions): number {
    if (a === b) return -1;
    const key = a < b ? a + ',' + b : b + ',' + a;
    if (this.beamSet.has(key)) return -1;
    this.beamSet.add(key);
    this.beams.push({ a, b, o: { ...o } });
    const id = this.beams.length - 1;
    if (o.flags !== undefined && o.flags & BEAM_ATTACH && o.part !== undefined && this.parts[o.part]) {
      this.parts[o.part].attachBeams.push(id);
    }
    return id;
  }

  addTri(a: number, b: number, c: number, part = 0): void {
    if (a === b || b === c || a === c) return;
    this.tris.push([a, b, c]);
    this.triParts.push(part);
  }

  addQuad(a: number, b: number, c: number, d: number, part = 0): void {
    this.addTri(a, b, c, part);
    this.addTri(a, c, d, part);
  }

  build(autoOrient = true): SoftBody {
    const n = this.nodes.length, m = this.beams.length, t = this.tris.length;
    const sb = new SoftBody(n, m, t);
    let cx = 0, cy = 0, cz = 0, mt = 0;
    for (let i = 0; i < n; i++) {
      const nd = this.nodes[i];
      sb.rest[i * 3] = nd.x;
      sb.rest[i * 3 + 1] = nd.y;
      sb.rest[i * 3 + 2] = nd.z;
      const fixed = !!nd.o.fixed;
      sb.mass[i] = nd.o.mass;
      sb.invMass[i] = fixed ? 0 : 1 / nd.o.mass;
      sb.friction[i] = nd.o.friction ?? 0.5;
      sb.material[i] = nd.o.material ?? Mat.METAL;
      sb.nodePart[i] = nd.o.part ?? 0;
      let f = 0;
      if (nd.o.collide !== false) f |= NODE_COLLIDE;
      if (nd.o.softCollide !== false) f |= NODE_SOFTCOLLIDE;
      sb.nodeFlags[i] = f;
      cx += nd.x * nd.o.mass;
      cy += nd.y * nd.o.mass;
      cz += nd.z * nd.o.mass;
      mt += nd.o.mass;
    }
    sb.totalMass = mt;
    sb.restCom[0] = cx / mt;
    sb.restCom[1] = cy / mt;
    sb.restCom[2] = cz / mt;
    for (let b = 0; b < m; b++) {
      const bm = this.beams[b];
      const o = bm.o;
      sb.bA[b] = bm.a;
      sb.bB[b] = bm.b;
      const ax = this.nodes[bm.a], bx = this.nodes[bm.b];
      const L = Math.hypot(bx.x - ax.x, bx.y - ax.y, bx.z - ax.z);
      sb.bL0[b] = L;
      sb.bK[b] = o.k;
      sb.bC[b] = o.c;
      sb.bYC0[b] = o.yieldC ?? Infinity;
      sb.bYT0[b] = o.yieldT ?? Infinity;
      sb.bStr[b] = o.strength ?? Infinity;
      sb.bMaxStretch[b] = o.maxStretch ?? 1.6;
      sb.bMinRatio[b] = o.minRatio ?? 0.25;
      sb.bFlags0[b] = o.flags ?? 0;
      sb.bPart[b] = o.part ?? 0;
      sb.bZone[b] = o.zone ?? 0;
      // energy at the cap, F^2 / 2k, could give the lighter node at most ~12 m/s
      const mMin = Math.min(ax.o.mass, bx.o.mass);
      let cap = MAX_RELEASE_SPEED * Math.sqrt(o.k * mMin);
      if (Number.isFinite(sb.bYC0[b])) cap = Math.max(cap, 2 * sb.bYC0[b]);
      sb.bCrushCap[b] = cap;
    }
    // collision triangles, oriented away from the rest centroid
    let gx = 0, gy = 0, gz = 0;
    for (let i = 0; i < n; i++) {
      gx += sb.rest[i * 3];
      gy += sb.rest[i * 3 + 1];
      gz += sb.rest[i * 3 + 2];
    }
    gx /= n; gy /= n; gz /= n;
    for (let k = 0; k < t; k++) {
      let [a, b, c] = this.tris[k];
      if (autoOrient) {
        const r = sb.rest;
        const ux = r[b * 3] - r[a * 3], uy = r[b * 3 + 1] - r[a * 3 + 1], uz = r[b * 3 + 2] - r[a * 3 + 2];
        const vx = r[c * 3] - r[a * 3], vy = r[c * 3 + 1] - r[a * 3 + 1], vz = r[c * 3 + 2] - r[a * 3 + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const mx = (r[a * 3] + r[b * 3] + r[c * 3]) / 3 - gx;
        const my = (r[a * 3 + 1] + r[b * 3 + 1] + r[c * 3 + 1]) / 3 - gy;
        const mz = (r[a * 3 + 2] + r[b * 3 + 2] + r[c * 3 + 2]) / 3 - gz;
        if (nx * mx + ny * my + nz * mz < 0) {
          const tmp = b;
          b = c;
          c = tmp;
        }
      }
      sb.tA[k] = a;
      sb.tB[k] = b;
      sb.tC[k] = c;
      sb.tPart[k] = this.triParts[k];
    }
    sb.parts = this.parts.map((p) => ({ ...p, nodes: [...p.nodes], attachBeams: [...p.attachBeams] }));
    sb.buildAdjacency();
    sb.buildPlateDampers();
    sb.resetStructure();
    // initial placement at rest
    sb.pos.set(sb.rest);
    sb.computeBounds();
    return sb;
  }
}

let nextBodyId = 1;

export class SoftBody {
  readonly id = nextBodyId++;
  readonly n: number;
  readonly m: number;
  readonly t: number;

  // nodes
  pos: Float64Array;
  vel: Float64Array;
  frc: Float64Array;
  rest: Float64Array;
  mass: Float64Array;
  invMass: Float64Array;
  friction: Float32Array;
  material: Uint8Array;
  nodePart: Uint16Array;
  nodeFlags: Uint8Array;
  /** Frame-accumulated contact intensity per node (for wear/scratches). */
  nodeScrape: Float32Array;

  // beams
  bA: Int32Array;
  bB: Int32Array;
  bL: Float64Array; // current (plastic) rest length
  bL0: Float64Array; // original length
  bK: Float64Array;
  bC: Float64Array;
  bYC: Float64Array;
  bYT: Float64Array;
  bYC0: Float64Array;
  bYT0: Float64Array;
  bStr: Float64Array;
  bMaxStretch: Float32Array;
  bMinRatio: Float32Array;
  /**
   * Largest force (N) a beam may carry in extreme compression (crushed solid,
   * or an elastic beam squeezed by a machine that cannot be stopped). Past it
   * the beam gives way, so it never stores enough energy to fling a node.
   */
  bCrushCap: Float32Array;
  bFlags: Uint8Array;
  bFlags0: Uint8Array;
  bPart: Uint16Array;
  bZone: Uint8Array;
  /** Last computed axial force (N), + = tension. */
  bForce: Float32Array;

  // collision triangles
  tA: Int32Array;
  tB: Int32Array;
  tC: Int32Array;
  tPart: Uint16Array;
  /** Triangle disabled when any of its edges' part detached... kept simple: per-tri enable. */
  tEnabled: Uint8Array;

  parts: PartInfo[] = [];
  /** Adjacency (CSR) of beams per node for deformation-gradient skinning. */
  adjStart: Int32Array = new Int32Array(0);
  adjBeam: Int32Array = new Int32Array(0);

  // Plate dampers. Beams only damp along their own axis, so a node in the
  // middle of a flat sheet of beams (hood, roof, floor pan) can flap out of
  // plane almost undamped. Each damper resists the node's out-of-plane
  // velocity relative to two pairs of neighbours straddling it.
  pdNode: Int32Array = new Int32Array(0);
  /** Four neighbours per damper: pair (a, b) and pair (c, d). */
  pdNbr: Int32Array = new Int32Array(0);
  /** The beams from the node to its four neighbours; a broken one disables the damper. */
  pdBeam: Int32Array = new Int32Array(0);
  pdC: Float64Array = new Float64Array(0);

  totalMass = 0;
  restCom = new Float64Array(3);

  min = new Float64Array(3);
  max = new Float64Array(3);
  /** Max node speed seen in last bounds update. */
  maxSpeed = 0;

  gravityScale = 1;
  /** Uniform linear drag coefficient applied to all nodes (1/s). */
  linearDrag = 0;
  sleeping = false;
  sleepTimer = 0;
  canSleep = false;
  /** Sideways contact impulse received while asleep during the current substep. */
  pushImpulse = 0;
  /** Disable all simulation (e.g. hidden/despawned). */
  active = true;
  /** If false, nodes don't collide with other soft bodies. */
  softCollisions = true;
  /** Collision skin for triangles of this body (m). */
  skin = 0.035;

  // per-frame accumulators (reset by consumer)
  deformEnergy = 0;
  brokenBeams: number[] = [];
  impactSpeed = 0;
  impactX = 0;
  impactY = 0;
  impactZ = 0;
  impactMaterial = 0;
  scrapeSpeed = 0;
  scrapeX = 0;
  scrapeY = 0;
  scrapeZ = 0;
  scrapeNx = 0;
  scrapeNy = 1;
  scrapeNz = 0;
  scrapeCount = 0;
  scrapeSparks = 0;
  /** Exploded / NaN guard tripped. */
  unstable = false;
  /** Incremented whenever beams break (topology changed). */
  structVersion = 0;

  /** Owner object (Vehicle, Prop) */
  owner: unknown = null;
  /** Skip collisions with this body until `ignoreUntil` (world time). */
  ignoreBody: SoftBody | null = null;
  ignoreUntil = 0;
  kind: 'vehicle' | 'prop' | 'debris' = 'prop';

  /** Candidate colliders (refreshed periodically by the world). */
  candidates: unknown[] = [];

  /** Rotation tracking for rigid fits. */
  fitQuat = new Float64Array([0, 0, 0, 1]);

  constructor(n: number, m: number, t: number) {
    this.n = n;
    this.m = m;
    this.t = t;
    this.pos = new Float64Array(n * 3);
    this.vel = new Float64Array(n * 3);
    this.frc = new Float64Array(n * 3);
    this.rest = new Float64Array(n * 3);
    this.mass = new Float64Array(n);
    this.invMass = new Float64Array(n);
    this.friction = new Float32Array(n);
    this.material = new Uint8Array(n);
    this.nodePart = new Uint16Array(n);
    this.nodeFlags = new Uint8Array(n);
    this.nodeScrape = new Float32Array(n);
    this.bA = new Int32Array(m);
    this.bB = new Int32Array(m);
    this.bL = new Float64Array(m);
    this.bL0 = new Float64Array(m);
    this.bK = new Float64Array(m);
    this.bC = new Float64Array(m);
    this.bYC = new Float64Array(m);
    this.bYT = new Float64Array(m);
    this.bYC0 = new Float64Array(m);
    this.bYT0 = new Float64Array(m);
    this.bStr = new Float64Array(m);
    this.bMaxStretch = new Float32Array(m);
    this.bMinRatio = new Float32Array(m);
    this.bCrushCap = new Float32Array(m);
    this.bFlags = new Uint8Array(m);
    this.bFlags0 = new Uint8Array(m);
    this.bPart = new Uint16Array(m);
    this.bZone = new Uint8Array(m);
    this.bForce = new Float32Array(m);
    this.tA = new Int32Array(t);
    this.tB = new Int32Array(t);
    this.tC = new Int32Array(t);
    this.tPart = new Uint16Array(t);
    this.tEnabled = new Uint8Array(t).fill(1);
  }

  buildAdjacency(): void {
    const count = new Int32Array(this.n + 1);
    for (let b = 0; b < this.m; b++) {
      count[this.bA[b] + 1]++;
      count[this.bB[b] + 1]++;
    }
    for (let i = 0; i < this.n; i++) count[i + 1] += count[i];
    const start = count.slice();
    const fill = count.slice();
    const adj = new Int32Array(this.m * 2);
    for (let b = 0; b < this.m; b++) {
      adj[fill[this.bA[b]]++] = b;
      adj[fill[this.bB[b]]++] = b;
    }
    this.adjStart = start;
    this.adjBeam = adj;
  }

  /** Find nodes whose rest beam stiffness is nearly planar and give them plate dampers. */
  buildPlateDampers(): void {
    const r = this.rest;
    const T = new Float64Array(9), vals = new Float64Array(3), vecs = new Float64Array(9);
    const nodes: number[] = [], nbrs: number[] = [], beams: number[] = [], cs: number[] = [];
    for (let i = 0; i < this.n; i++) {
      if (this.invMass[i] === 0) continue;
      T.fill(0);
      const list: { j: number; b: number; dx: number; dy: number; dz: number }[] = [];
      for (let e = this.adjStart[i]; e < this.adjStart[i + 1]; e++) {
        const b = this.adjBeam[e];
        if (this.bFlags0[b] & (BEAM_SUPPORT | BEAM_ROPE)) continue;
        const j = this.bA[b] === i ? this.bB[b] : this.bA[b];
        const dx = r[j * 3] - r[i * 3], dy = r[j * 3 + 1] - r[i * 3 + 1], dz = r[j * 3 + 2] - r[i * 3 + 2];
        const d = Math.hypot(dx, dy, dz);
        if (d < 1e-6) continue;
        const nx = dx / d, ny = dy / d, nz = dz / d, k = this.bK[b];
        T[0] += k * nx * nx; T[1] += k * nx * ny; T[2] += k * nx * nz;
        T[4] += k * ny * ny; T[5] += k * ny * nz; T[8] += k * nz * nz;
        list.push({ j, b, dx: nx, dy: ny, dz: nz });
      }
      if (list.length < 4) continue;
      T[3] = T[1]; T[6] = T[2]; T[7] = T[5];
      symEigen3(T, vals, vecs);
      // plate-like: one weak direction, two strong ones
      if (!(vals[0] < 0.08 * vals[2] && vals[1] > 0.15 * vals[2])) continue;
      const ex = vecs[0], ey = vecs[3], ez = vecs[6];
      // in-plane unit directions to each neighbour
      const dir = list.map((q) => {
        const dn = q.dx * ex + q.dy * ey + q.dz * ez;
        let px = q.dx - dn * ex, py = q.dy - dn * ey, pz = q.dz - dn * ez;
        const l = Math.hypot(px, py, pz) || 1;
        px /= l; py /= l; pz /= l;
        return [px, py, pz];
      });
      const dotp = (u: number, w: number) => dir[u][0] * dir[w][0] + dir[u][1] * dir[w][1] + dir[u][2] * dir[w][2];
      // first pair: the two most opposite neighbours
      let a = -1, b = -1, best = -0.6;
      for (let u = 0; u < list.length; u++) for (let w = u + 1; w < list.length; w++) {
        const c = dotp(u, w);
        if (c < best) { best = c; a = u; b = w; }
      }
      if (a < 0) continue;
      // second pair: opposite each other and as perpendicular as possible to the first
      const ax = dir[b][0] - dir[a][0], ay = dir[b][1] - dir[a][1], az = dir[b][2] - dir[a][2];
      const al = Math.hypot(ax, ay, az) || 1;
      let c2 = -1, d2 = -1, bestScore = 0.6;
      for (let u = 0; u < list.length; u++) for (let w = u + 1; w < list.length; w++) {
        if (u === a || u === b || w === a || w === b) continue;
        if (dotp(u, w) > -0.6) continue;
        const qx = dir[w][0] - dir[u][0], qy = dir[w][1] - dir[u][1], qz = dir[w][2] - dir[u][2];
        const ql = Math.hypot(qx, qy, qz) || 1;
        const cx = (ay * qz - az * qy) / (al * ql), cy = (az * qx - ax * qz) / (al * ql), cz = (ax * qy - ay * qx) / (al * ql);
        const score = Math.hypot(cx, cy, cz);
        if (score > bestScore) { bestScore = score; c2 = u; d2 = w; }
      }
      if (c2 < 0) continue;
      nodes.push(i);
      nbrs.push(list[a].j, list[b].j, list[c2].j, list[d2].j);
      beams.push(list[a].b, list[b].b, list[c2].b, list[d2].b);
      // about 60% of critical damping for a 15 Hz panel mode
      cs.push(2 * 0.6 * this.mass[i] * (2 * Math.PI * 15));
    }
    this.pdNode = Int32Array.from(nodes);
    this.pdNbr = Int32Array.from(nbrs);
    this.pdBeam = Int32Array.from(beams);
    this.pdC = Float64Array.from(cs);
  }

  private plateDamping(): void {
    const pos = this.pos, vel = this.vel, frc = this.frc, F = this.bFlags;
    const NB = this.pdNbr, BM = this.pdBeam;
    for (let k = 0; k < this.pdNode.length; k++) {
      const k4 = k * 4;
      if ((F[BM[k4]] | F[BM[k4 + 1]] | F[BM[k4 + 2]] | F[BM[k4 + 3]]) & BEAM_BROKEN) continue;
      const i3 = this.pdNode[k] * 3, a3 = NB[k4] * 3, b3 = NB[k4 + 1] * 3, c3 = NB[k4 + 2] * 3, d3 = NB[k4 + 3] * 3;
      const ux = pos[b3] - pos[a3], uy = pos[b3 + 1] - pos[a3 + 1], uz = pos[b3 + 2] - pos[a3 + 2];
      const wx = pos[d3] - pos[c3], wy = pos[d3 + 1] - pos[c3 + 1], wz = pos[d3 + 2] - pos[c3 + 2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (nl < 1e-8) continue;
      nx /= nl; ny /= nl; nz /= nl;
      const rvx = vel[i3] - 0.25 * (vel[a3] + vel[b3] + vel[c3] + vel[d3]);
      const rvy = vel[i3 + 1] - 0.25 * (vel[a3 + 1] + vel[b3 + 1] + vel[c3 + 1] + vel[d3 + 1]);
      const rvz = vel[i3 + 2] - 0.25 * (vel[a3 + 2] + vel[b3 + 2] + vel[c3 + 2] + vel[d3 + 2]);
      const f = -this.pdC[k] * (rvx * nx + rvy * ny + rvz * nz);
      const fx = f * nx, fy = f * ny, fz = f * nz;
      frc[i3] += fx; frc[i3 + 1] += fy; frc[i3 + 2] += fz;
      const qx = -0.25 * fx, qy = -0.25 * fy, qz = -0.25 * fz;
      frc[a3] += qx; frc[a3 + 1] += qy; frc[a3 + 2] += qz;
      frc[b3] += qx; frc[b3 + 1] += qy; frc[b3 + 2] += qz;
      frc[c3] += qx; frc[c3 + 1] += qy; frc[c3 + 2] += qz;
      frc[d3] += qx; frc[d3 + 1] += qy; frc[d3 + 2] += qz;
    }
  }

  /** Restore every beam to its pristine state. */
  resetStructure(): void {
    this.bL.set(this.bL0);
    this.bYC.set(this.bYC0);
    this.bYT.set(this.bYT0);
    this.bFlags.set(this.bFlags0);
    this.bForce.fill(0);
    this.tEnabled.fill(1);
    for (const p of this.parts) p.detached = false;
    this.nodeScrape.fill(0);
    this.unstable = false;
    this.structVersion++;
  }

  /**
   * Place the body: world = R * rest + t. Velocities set to (vx, vy, vz).
   * Does not reset deformation.
   */
  place(R: ArrayLike<number>, tx: number, ty: number, tz: number, vx = 0, vy = 0, vz = 0): void {
    const p = this.pos, r = this.rest, v = this.vel;
    for (let i = 0; i < this.n; i++) {
      const x = r[i * 3], y = r[i * 3 + 1], z = r[i * 3 + 2];
      p[i * 3] = R[0] * x + R[1] * y + R[2] * z + tx;
      p[i * 3 + 1] = R[3] * x + R[4] * y + R[5] * z + ty;
      p[i * 3 + 2] = R[6] * x + R[7] * y + R[8] * z + tz;
      v[i * 3] = vx;
      v[i * 3 + 1] = vy;
      v[i * 3 + 2] = vz;
    }
    this.frc.fill(0);
    this.sleeping = false;
    this.sleepTimer = 0;
    this.computeBounds();
  }

  computeBounds(): void {
    const p = this.pos, v = this.vel;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    let vmax = 0;
    for (let i = 0; i < this.n; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
      const s = v[i * 3] * v[i * 3] + v[i * 3 + 1] * v[i * 3 + 1] + v[i * 3 + 2] * v[i * 3 + 2];
      if (s > vmax) vmax = s;
    }
    this.min[0] = x0;
    this.min[1] = y0;
    this.min[2] = z0;
    this.max[0] = x1;
    this.max[1] = y1;
    this.max[2] = z1;
    this.maxSpeed = Math.sqrt(vmax);
  }

  /** Mass-weighted center of the given nodes (or all). */
  centerOfMass(out: Float64Array | number[], nodes?: ArrayLike<number>): void {
    const p = this.pos, ms = this.mass;
    let x = 0, y = 0, z = 0, mt = 0;
    const count = nodes ? nodes.length : this.n;
    for (let k = 0; k < count; k++) {
      const i = nodes ? nodes[k] : k;
      const mm = ms[i];
      x += p[i * 3] * mm;
      y += p[i * 3 + 1] * mm;
      z += p[i * 3 + 2] * mm;
      mt += mm;
    }
    out[0] = x / mt;
    out[1] = y / mt;
    out[2] = z / mt;
  }

  /** Mass-weighted average velocity. */
  averageVelocity(out: Float64Array | number[], nodes?: ArrayLike<number>): void {
    const v = this.vel, ms = this.mass;
    let x = 0, y = 0, z = 0, mt = 0;
    const count = nodes ? nodes.length : this.n;
    for (let k = 0; k < count; k++) {
      const i = nodes ? nodes[k] : k;
      const mm = ms[i];
      x += v[i * 3] * mm;
      y += v[i * 3 + 1] * mm;
      z += v[i * 3 + 2] * mm;
      mt += mm;
    }
    out[0] = x / mt;
    out[1] = y / mt;
    out[2] = z / mt;
  }

  /**
   * Best-fit rigid transform of a node subset relative to rest pose.
   * Writes rotation R (row-major) and translation C such that world ≈ R * rest + C.
   */
  fitRigid(nodes: ArrayLike<number>, R: Float64Array, C: Float64Array, q: Float64Array = this.fitQuat): void {
    const p = this.pos, r = this.rest, ms = this.mass;
    let cx = 0, cy = 0, cz = 0, rx = 0, ry = 0, rz = 0, mt = 0;
    for (let k = 0; k < nodes.length; k++) {
      const i = nodes[k];
      const m = ms[i];
      cx += p[i * 3] * m;
      cy += p[i * 3 + 1] * m;
      cz += p[i * 3 + 2] * m;
      rx += r[i * 3] * m;
      ry += r[i * 3 + 1] * m;
      rz += r[i * 3 + 2] * m;
      mt += m;
    }
    cx /= mt; cy /= mt; cz /= mt;
    rx /= mt; ry /= mt; rz /= mt;
    // A = sum m * (p - c)(r - rc)^T
    const A = _A;
    A.fill(0);
    for (let k = 0; k < nodes.length; k++) {
      const i = nodes[k];
      const m = ms[i];
      const px = p[i * 3] - cx, py = p[i * 3 + 1] - cy, pz = p[i * 3 + 2] - cz;
      const qx = r[i * 3] - rx, qy = r[i * 3 + 1] - ry, qz = r[i * 3 + 2] - rz;
      A[0] += m * px * qx; A[1] += m * px * qy; A[2] += m * px * qz;
      A[3] += m * py * qx; A[4] += m * py * qy; A[5] += m * py * qz;
      A[6] += m * pz * qx; A[7] += m * pz * qy; A[8] += m * pz * qz;
    }
    extractRotation(A, q, 8);
    mat3FromQuat(q, R);
    // translation: world = R*(rest) + T  => T = c - R*rc
    C[0] = cx - (R[0] * rx + R[1] * ry + R[2] * rz);
    C[1] = cy - (R[3] * rx + R[4] * ry + R[5] * rz);
    C[2] = cz - (R[6] * rx + R[7] * ry + R[8] * rz);
  }

  /** Accumulate beam forces into frc. Returns nothing; updates deformation. */
  beamForces(): void {
    const pos = this.pos, vel = this.vel, frc = this.frc;
    const A = this.bA, B = this.bB, L = this.bL, L0 = this.bL0, K = this.bK, C = this.bC;
    const YC = this.bYC, YT = this.bYT, S = this.bStr, F = this.bFlags, MS = this.bMaxStretch, MR = this.bMinRatio, CC = this.bCrushCap;
    const BF = this.bForce;
    let energy = 0;
    const m = this.m;
    for (let b = 0; b < m; b++) {
      const fl = F[b];
      if (fl & BEAM_BROKEN) continue;
      const i3 = A[b] * 3, j3 = B[b] * 3;
      const dx = pos[j3] - pos[i3], dy = pos[j3 + 1] - pos[i3 + 1], dz = pos[j3 + 2] - pos[i3 + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 1e-14) continue;
      const d = Math.sqrt(d2);
      const inv = 1 / d;
      const nx = dx * inv, ny = dy * inv, nz = dz * inv;
      let rest = L[b];
      const k = K[b];
      let fs = k * (d - rest);
      if (fl & (BEAM_SUPPORT | BEAM_ROPE)) {
        if (fl & BEAM_SUPPORT && fs > 0) {
          BF[b] = 0;
          continue;
        }
        if (fl & BEAM_ROPE && fs < 0) {
          BF[b] = 0;
          continue;
        }
      }
      let damp = C[b];
      if (!(fl & BEAM_NODEFORM)) {
        if (fs > YT[b]) {
          const nr = d - YT[b] / k;
          energy += YT[b] * (nr - rest);
          rest = nr;
          L[b] = nr;
          fs = YT[b];
          damp *= 0.15;
          if (nr > L0[b] * MS[b]) {
            F[b] = fl | BEAM_BROKEN;
            BF[b] = 0;
            this.brokenBeams.push(b);
            this.structVersion++;
            continue;
          }
        } else if (fs < -YC[b] && !(fl & BEAM_CRUSHED)) {
          let nr = d + YC[b] / k;
          const lim = L0[b] * MR[b];
          if (nr < lim) {
            nr = lim;
            F[b] = fl | BEAM_CRUSHED;
          }
          energy += YC[b] * (rest - nr);
          rest = nr;
          L[b] = nr;
          fs = k * (d - rest);
          damp *= 0.15;
          // hardening: crushed material gets progressively stiffer to yield further
          YC[b] *= 1.0005;
        }
      }
      if (fs < -CC[b]) {
        // extreme compression gives way instead of storing unbounded energy
        const nr = d + CC[b] / k;
        if (nr < L0[b] * 0.04) {
          F[b] = fl | BEAM_BROKEN;
          BF[b] = 0;
          this.brokenBeams.push(b);
          this.structVersion++;
          continue;
        }
        energy += CC[b] * (rest - nr);
        rest = nr;
        L[b] = nr;
        fs = -CC[b];
        damp *= 0.15;
      } else if (fs > CC[b] && fl & BEAM_NODEFORM) {
        // elastic-only beams can't yield in tension, so they snap
        F[b] = fl | BEAM_BROKEN;
        BF[b] = 0;
        this.brokenBeams.push(b);
        this.structVersion++;
        continue;
      }
      if (fs > S[b] || -fs > S[b]) {
        F[b] = fl | BEAM_BROKEN;
        BF[b] = 0;
        this.brokenBeams.push(b);
        this.structVersion++;
        continue;
      }
      const rv = (vel[j3] - vel[i3]) * nx + (vel[j3 + 1] - vel[i3 + 1]) * ny + (vel[j3 + 2] - vel[i3 + 2]) * nz;
      const f = fs + damp * rv;
      BF[b] = fs;
      const fx = f * nx, fy = f * ny, fz = f * nz;
      frc[i3] += fx;
      frc[i3 + 1] += fy;
      frc[i3 + 2] += fz;
      frc[j3] -= fx;
      frc[j3 + 1] -= fy;
      frc[j3 + 2] -= fz;
    }
    this.deformEnergy += energy;
    if (this.pdNode.length) this.plateDamping();
  }

  breakBeam(b: number): void {
    if (this.bFlags[b] & BEAM_BROKEN) return;
    this.bFlags[b] |= BEAM_BROKEN;
    this.brokenBeams.push(b);
    this.structVersion++;
  }

  /** Apply a force at a node. */
  addForce(i: number, fx: number, fy: number, fz: number): void {
    const f = this.frc;
    f[i * 3] += fx;
    f[i * 3 + 1] += fy;
    f[i * 3 + 2] += fz;
  }

  /** Plastic strain magnitude of a beam (|L - L0| / L0). */
  beamStrain(b: number): number {
    return Math.abs(this.bL[b] - this.bL0[b]) / this.bL0[b];
  }

  isBroken(b: number): boolean {
    return (this.bFlags[b] & BEAM_BROKEN) !== 0;
  }

  /** Total kinetic energy (J). */
  kineticEnergy(): number {
    const v = this.vel, ms = this.mass;
    let e = 0;
    for (let i = 0; i < this.n; i++) {
      e += 0.5 * ms[i] * (v[i * 3] * v[i * 3] + v[i * 3 + 1] * v[i * 3 + 1] + v[i * 3 + 2] * v[i * 3 + 2]);
    }
    return e;
  }

  wake(): void {
    this.sleeping = false;
    this.sleepTimer = 0;
  }
}

const _A = new Float64Array(9);
