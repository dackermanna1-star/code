// Rigid body dynamics for voxel bodies: contact generation against the static voxel world and between
// bodies, sequential-impulse solver with friction, restitution, speculative contacts and warm starting,
// island-based sleeping, simple continuous collision for fast debris, and impact callbacks.

import { Body } from './body';
import { GridView, RawContacts, sphereVsGrid, sphereVsCache, buildCoarse, reduceContacts } from './collide';
import { World, VOXEL } from '../world/world';
import { PAL_FRICTION, PAL_RESTITUTION } from '../world/materials';
import { raycastWorld, RayHit } from './raycast';

export const SOLVER = { iterations: 10, warmHits: 0, warm: true, maxPerBucket: 4, warmFriction: true, warmScale: 0.85, baumgarte: 0.25 };
const BAUMGARTE = 0.25;
const SLOP = 0.004;
const MAX_CORRECTION = 1.6;
const SLEEP_LIN = 0.09;
const SLEEP_ANG = 0.14;
const SLEEP_TIME = 0.45;
const MAX_PER_BUCKET = 4;

export interface ImpactEvent {
  a: Body; b: Body | null;
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  /** approach speed (m/s, positive) */
  speed: number;
  /** effective mass at contact (kg) */
  meff: number;
  /** palette of the voxel hit on the other side */
  matB: number;
}

class ContactSet {
  n = 0; cap = 0;
  a = new Int32Array(0); b = new Int32Array(0);
  f = new Float64Array(0); // per contact 32 floats
  key = new Int32Array(0);
  matB = new Uint8Array(0);
  static readonly S = 32;
  constructor() { this.grow(1024); }
  grow(cap: number): void {
    const S = ContactSet.S;
    const a = new Int32Array(cap), b = new Int32Array(cap), f = new Float64Array(cap * S), key = new Int32Array(cap), m = new Uint8Array(cap);
    a.set(this.a); b.set(this.b); f.set(this.f); key.set(this.key); m.set(this.matB);
    this.a = a; this.b = b; this.f = f; this.key = key; this.matB = m; this.cap = cap;
  }
}
// float layout within a contact record
const PX = 0, PY = 1, PZ = 2, NX = 3, NY = 4, NZ = 5, RAX = 6, RAY = 7, RAZ = 8, RBX = 9, RBY = 10, RBZ = 11;
const T1X = 12, T1Y = 13, T1Z = 14, T2X = 15, T2Y = 16, T2Z = 17, MN = 18, MT1 = 19, MT2 = 20, BIAS = 21, LN = 22, LT1 = 23, LT2 = 24, MU = 25, VN0 = 26, DEPTH = 27;

export class Physics {
  readonly bodies: Body[] = [];
  gravity = -9.81;
  onImpact: ((e: ImpactEvent) => void) | null = null;
  /** called when a body falls out of the world */
  onRemove: ((b: Body) => void) | null = null;
  stats = { awake: 0, contacts: 0, pairs: 0, ms: 0 };

  private cs = new ContactSet();
  private raw = new RawContacts(512);
  private tmp = new RawContacts(128);
  private keep: number[] = [];
  private cache = new Uint8Array(64 * 1024);
  private coarse = new Uint8Array(4096);
  private view: GridView = { data: this.cache, sx: 0, sy: 0, sz: 0, ox: 0, oy: 0, oz: 0, outside: 0 };
  /** warm start cache: per body pair, contacts of the last step (local point in A, normal, impulses) */
  private prevPairs = new Map<number, number>(); // pairKey -> start index into prevData (records of 9)
  private prevCount = new Map<number, number>();
  private prevData = new Float64Array(0);
  private sortBuf: Body[] = [];
  private hit: RayHit = new RayHit();
  // solver body arrays
  private bv = new Float64Array(0);

  constructor(readonly world: World) {}

  add(b: Body): void {
    b.updateDerived();
    b.prevPos.copy(b.pos); b.prevRot.copy(b.rot);
    this.bodies.push(b);
  }

  remove(b: Body): void {
    const i = this.bodies.indexOf(b);
    if (i >= 0) { this.bodies[i] = this.bodies[this.bodies.length - 1]; this.bodies.pop(); }
    b.removed = true;
  }

  /** Wake bodies whose AABB intersects a world-space box (meters). */
  wakeBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    for (const b of this.bodies) {
      if (!b.sleeping) continue;
      const a = b.aabb;
      if (a[0] > x1 || a[3] < x0 || a[1] > y1 || a[4] < y0 || a[2] > z1 || a[5] < z0) continue;
      b.wake();
    }
  }

  step(dt: number): void {
    const t0 = performance.now();
    const bodies = this.bodies;
    const nb = bodies.length;
    // ---- integrate forces, store previous transforms
    let awake = 0;
    for (let i = 0; i < nb; i++) {
      const b = bodies[i];
      b.prevPos.copy(b.pos); b.prevRot.copy(b.rot);
      b.contacts = 0;
      b.age++;
      if (b.damageCooldown > 0) b.damageCooldown -= dt;
      if (b.sleeping || b.kinematic) continue;
      awake++;
      b.vel.y += this.gravity * dt;
      const ld = 1 / (1 + dt * 0.04), ad = 1 / (1 + dt * 0.12);
      b.vel.scale(ld); b.ang.scale(ad);
      b.updateDerived();
    }
    this.stats.awake = awake;
    // ---- solver body state arrays: v(3) w(3) invMass invI(9) static-flag
    if (this.bv.length < nb * 16) this.bv = new Float64Array(nb * 32);
    const bv = this.bv;
    for (let i = 0; i < nb; i++) {
      const b = bodies[i], o = i * 16;
      bv[o] = b.vel.x; bv[o + 1] = b.vel.y; bv[o + 2] = b.vel.z;
      bv[o + 3] = b.ang.x; bv[o + 4] = b.ang.y; bv[o + 5] = b.ang.z;
      const dyn = !b.sleeping && !b.kinematic;
      bv[o + 6] = dyn ? b.invMass : 0;
      for (let k = 0; k < 9; k++) bv[o + 7 + k] = dyn ? b.invIW[k] : 0;
      (b as any)._idx = i;
    }
    // ---- contacts
    const cs = this.cs;
    cs.n = 0;
    for (let i = 0; i < nb; i++) {
      const b = bodies[i];
      if (b.sleeping || b.kinematic) continue;
      this.collideWorld(b, i, dt);
    }
    this.collideBodies(dt);
    this.stats.contacts = cs.n;
    // ---- prepare
    this.prepare(dt);
    // ---- iterate
    for (let it = 0; it < SOLVER.iterations; it++) this.solveIteration();
    // ---- write back velocities, impacts, warm start cache
    for (let i = 0; i < nb; i++) {
      const b = bodies[i];
      if (b.sleeping || b.kinematic) continue;
      const o = i * 16;
      b.vel.set(bv[o], bv[o + 1], bv[o + 2]);
      b.ang.set(bv[o + 3], bv[o + 4], bv[o + 5]);
    }
    this.storeWarmStart();
    this.emitImpacts();
    // ---- integrate positions
    for (let i = 0; i < nb; i++) {
      const b = bodies[i];
      if (b.sleeping || b.kinematic) continue;
      // clamp velocities
      const sp = b.vel.len();
      if (sp > 70) b.vel.scale(70 / sp);
      const av = b.ang.len();
      if (av > 40) b.ang.scale(40 / av);
      // crude CCD for small fast bodies
      const travel = sp * dt;
      if (travel > 0.12 && b.radius < 1.5) {
        const dx = b.vel.x / sp, dy = b.vel.y / sp, dz = b.vel.z / sp;
        if (raycastWorld(this.world, b.pos.x, b.pos.y, b.pos.z, dx, dy, dz, travel + b.radius * 0.3, this.hit)) {
          const allowed = Math.max(0, this.hit.dist - b.radius * 0.3);
          if (allowed < travel) {
            b.pos.addScaled(b.vel, allowed / sp);
            // remove velocity into the surface, keep tangential
            const vn = b.vel.x * this.hit.nx + b.vel.y * this.hit.ny + b.vel.z * this.hit.nz;
            if (vn < 0) { b.vel.x -= vn * this.hit.nx * 1.2; b.vel.y -= vn * this.hit.ny * 1.2; b.vel.z -= vn * this.hit.nz * 1.2; }
            b.rot.integrate(b.ang.x, b.ang.y, b.ang.z, dt);
            b.updateDerived();
            continue;
          }
        }
      }
      b.pos.addScaled(b.vel, dt);
      b.rot.integrate(b.ang.x, b.ang.y, b.ang.z, dt);
      b.updateDerived();
      if (b.pos.y < -30) { this.onRemove?.(b); }
    }
    this.updateSleep(dt);
    this.stats.ms = performance.now() - t0;
  }

  // ------------------------------------------------------------------ narrow phase: world
  private collideWorld(b: Body, bi: number, dt: number): void {
    const a = b.aabb;
    const speed = b.vel.len() + b.ang.len() * b.radius;
    const margin = Math.min(2.5, Math.max(0.15, speed * dt * 10 * 1.2)); // voxel units
    const pad = Math.ceil(b.sampleR + margin) + 2;
    const x0 = Math.floor(a[0] * 10) - pad, y0 = Math.floor(a[1] * 10) - pad, z0 = Math.floor(a[2] * 10) - pad;
    const x1 = Math.ceil(a[3] * 10) + pad, y1 = Math.ceil(a[4] * 10) + pad, z1 = Math.ceil(a[5] * 10) + pad;
    const w = this.world;
    // quick reject: any potentially solid chunk in the box?
    let any = false;
    for (let cy = y0 >> 4; cy <= y1 >> 4 && !any; cy++) for (let cz = z0 >> 4; cz <= z1 >> 4 && !any; cz++) for (let cx = x0 >> 4; cx <= x1 >> 4; cx++) {
      if (w.chunkMayBeSolid(cx << 4, cy << 4, cz << 4)) { any = true; break; }
    }
    if (!any) return;
    const nx = x1 - x0 + 1, ny = y1 - y0 + 1, nz = z1 - z0 + 1;
    const vol = nx * ny * nz;
    if (vol > 4_000_000) return; // absurdly large body; skip world contacts (should not happen)
    if (this.cache.length < vol) this.cache = new Uint8Array(Math.max(vol, this.cache.length * 2));
    w.copyBox(x0, y0, z0, nx, ny, nz, this.cache);
    const v = this.view;
    v.data = this.cache; v.sx = nx; v.sy = ny; v.sz = nz; v.ox = x0; v.oy = y0; v.oz = z0; v.outside = 0;
    const cn = ((nx + 3) >> 2) * ((ny + 3) >> 2) * ((nz + 3) >> 2);
    if (this.coarse.length < cn) this.coarse = new Uint8Array(cn * 2);
    const [ccx, ccy, ccz] = buildCoarse(this.cache, nx, ny, nz, this.coarse);
    const raw = this.raw;
    raw.reset();
    const R = b.R, s = b.samples, cx = b.com.x, cy = b.com.y, cz = b.com.z;
    const px = b.pos.x * 10, py = b.pos.y * 10, pz = b.pos.z * 10;
    for (let i = 0; i < b.nSamples; i++) {
      const lx = s[i * 4] - cx, ly = s[i * 4 + 1] - cy, lz = s[i * 4 + 2] - cz;
      const wx = px + R[0] * lx + R[1] * ly + R[2] * lz;
      const wy = py + R[3] * lx + R[4] * ly + R[5] * lz;
      const wz = pz + R[6] * lx + R[7] * ly + R[8] * lz;
      sphereVsCache(v, this.coarse, ccx, ccy, ccz, wx, wy, wz, s[i * 4 + 3], margin, i, raw);
    }
    if (raw.n === 0) return;
    reduceContacts(raw, 0, raw.n, SOLVER.maxPerBucket, this.keep, 10);
    for (const k of this.keep) {
      this.addContact(bi, -1, raw.p[k * 3] * VOXEL, raw.p[k * 3 + 1] * VOXEL, raw.p[k * 3 + 2] * VOXEL,
        raw.nrm[k * 3], raw.nrm[k * 3 + 1], raw.nrm[k * 3 + 2], raw.depth[k] * VOXEL,
        mixKey(b.id, 0, raw.sample[k], raw.feat[k]), raw.mat[k], b.friction, b.restitution);
    }
  }

  // ------------------------------------------------------------------ narrow phase: bodies
  private collideBodies(dt: number): void {
    const bodies = this.bodies;
    const list = this.sortBuf;
    list.length = 0;
    for (const b of bodies) if (!b.kinematic || b.held) list.push(b);
    list.sort((p, q) => p.aabb[0] - q.aabb[0]);
    let pairs = 0;
    for (let i = 0; i < list.length; i++) {
      const A = list[i];
      const ax1 = A.aabb[3];
      for (let j = i + 1; j < list.length; j++) {
        const B = list[j];
        if (B.aabb[0] > ax1 + 0.05) break;
        if ((A.sleeping || A.kinematic) && (B.sleeping || B.kinematic)) continue;
        const a = A.aabb, c = B.aabb;
        if (a[1] > c[4] + 0.05 || c[1] > a[4] + 0.05 || a[2] > c[5] + 0.05 || c[2] > a[5] + 0.05) continue;
        pairs++;
        // canonical order keeps contact keys (warm starting) stable between steps
        if (A.id < B.id) this.collidePair(A, B, dt); else this.collidePair(B, A, dt);
      }
    }
    this.stats.pairs = pairs;
  }

  private collidePair(A: Body, B: Body, dt: number): void {
    // wake sleeping partner if hit with some energy
    const rel = Math.abs(A.vel.x - B.vel.x) + Math.abs(A.vel.y - B.vel.y) + Math.abs(A.vel.z - B.vel.z);
    if (A.sleeping && rel > 0.35) this.wakeIsland(A);
    if (B.sleeping && rel > 0.35) this.wakeIsland(B);
    const speed = rel + A.ang.len() * A.radius + B.ang.len() * B.radius;
    const margin = Math.min(2.5, Math.max(0.15, speed * dt * 10 * 1.2));
    const raw = this.raw;
    raw.reset();
    // A samples vs B grid (normal from B to A), then B samples vs A grid (negate)
    this.samplesVsBody(A, B, margin, raw, 1);
    this.samplesVsBody(B, A, margin, raw, -1);
    if (raw.n === 0) return;
    reduceContacts(raw, 0, raw.n, SOLVER.maxPerBucket, this.keep, 1);
    const ai = (A as any)._idx as number, bi = (B as any)._idx as number;
    const fr = Math.sqrt(A.friction * B.friction), re = Math.max(A.restitution, B.restitution);
    for (const k of this.keep) {
      this.addContact(ai, bi, raw.p[k * 3], raw.p[k * 3 + 1], raw.p[k * 3 + 2], raw.nrm[k * 3], raw.nrm[k * 3 + 1], raw.nrm[k * 3 + 2], raw.depth[k],
        mixKey(A.id, B.id, raw.sample[k], raw.feat[k]), raw.mat[k], fr, re);
    }
  }

  /** Samples of S against grid of G; pushes world-space contacts into out (normal sign: +1 from G to S). */
  private samplesVsBody(S: Body, G: Body, margin: number, out: RawContacts, sign: number): void {
    const tmp = this.tmp;
    tmp.reset();
    const gv: GridView = { data: G.vox, sx: G.sx, sy: G.sy, sz: G.sz, ox: 0, oy: 0, oz: 0, outside: 0 };
    const RS = S.R, RG = G.R;
    const s = S.samples;
    const scx = S.com.x, scy = S.com.y, scz = S.com.z;
    // quick bounding check per sample using G's bounding sphere and AABB overlap region
    const gr = G.radius * 10 + 2;
    const pad = (margin + 1) * VOXEL;
    const ga = G.aabb;
    const ox0 = ga[0] - pad, oy0 = ga[1] - pad, oz0 = ga[2] - pad, ox1 = ga[3] + pad, oy1 = ga[4] + pad, oz1 = ga[5] + pad;
    for (let i = 0; i < S.nSamples; i++) {
      const lx = (s[i * 4] - scx) * VOXEL, ly = (s[i * 4 + 1] - scy) * VOXEL, lz = (s[i * 4 + 2] - scz) * VOXEL;
      const wx = S.pos.x + RS[0] * lx + RS[1] * ly + RS[2] * lz;
      if (wx < ox0 || wx > ox1) continue;
      const wy = S.pos.y + RS[3] * lx + RS[4] * ly + RS[5] * lz;
      if (wy < oy0 || wy > oy1) continue;
      const wz = S.pos.z + RS[6] * lx + RS[7] * ly + RS[8] * lz;
      if (wz < oz0 || wz > oz1) continue;
      const dx = wx - G.pos.x, dy = wy - G.pos.y, dz = wz - G.pos.z;
      // into G grid coords
      const gx = (RG[0] * dx + RG[3] * dy + RG[6] * dz) * 10 + G.com.x;
      const gy = (RG[1] * dx + RG[4] * dy + RG[7] * dz) * 10 + G.com.y;
      const gz = (RG[2] * dx + RG[5] * dy + RG[8] * dz) * 10 + G.com.z;
      const ex = gx - G.com.x, ey = gy - G.com.y, ez = gz - G.com.z;
      if (ex * ex + ey * ey + ez * ez > gr * gr) continue;
      if (gx < -2 || gy < -2 || gz < -2 || gx > G.sx + 2 || gy > G.sy + 2 || gz > G.sz + 2) continue;
      sphereVsGrid(gv, gx, gy, gz, s[i * 4 + 3], margin, i, tmp);
    }
    for (let k = 0; k < tmp.n; k++) {
      // point and normal back to world
      const qx = (tmp.p[k * 3] - G.com.x) * VOXEL, qy = (tmp.p[k * 3 + 1] - G.com.y) * VOXEL, qz = (tmp.p[k * 3 + 2] - G.com.z) * VOXEL;
      const px = G.pos.x + RG[0] * qx + RG[1] * qy + RG[2] * qz;
      const py = G.pos.y + RG[3] * qx + RG[4] * qy + RG[5] * qz;
      const pz = G.pos.z + RG[6] * qx + RG[7] * qy + RG[8] * qz;
      const nx = tmp.nrm[k * 3], ny = tmp.nrm[k * 3 + 1], nz = tmp.nrm[k * 3 + 2];
      const wnx = (RG[0] * nx + RG[1] * ny + RG[2] * nz) * sign;
      const wny = (RG[3] * nx + RG[4] * ny + RG[5] * nz) * sign;
      const wnz = (RG[6] * nx + RG[7] * ny + RG[8] * nz) * sign;
      out.push(px, py, pz, wnx, wny, wnz, tmp.depth[k] * VOXEL, tmp.sample[k] + (sign < 0 ? 100000 : 0), tmp.feat[k], tmp.mat[k]);
    }
  }

  private addContact(ai: number, bi: number, px: number, py: number, pz: number, nx: number, ny: number, nz: number, depth: number,
    key: number, matB: number, friction: number, restitution: number): void {
    const cs = this.cs;
    if (cs.n >= cs.cap) cs.grow(cs.cap * 2);
    const i = cs.n++;
    cs.a[i] = ai; cs.b[i] = bi; cs.key[i] = key; cs.matB[i] = matB;
    const f = cs.f, o = i * ContactSet.S;
    f[o + PX] = px; f[o + PY] = py; f[o + PZ] = pz;
    f[o + NX] = nx; f[o + NY] = ny; f[o + NZ] = nz;
    f[o + DEPTH] = depth;
    const mu = bi < 0 ? Math.sqrt(friction * PAL_FRICTION[matB]) : friction;
    f[o + MU] = mu;
    f[o + LN] = 0; f[o + LT1] = 0; f[o + LT2] = 0;
    f[o + 28] = bi < 0 ? Math.max(restitution, PAL_RESTITUTION[matB]) * 0.8 : restitution;
  }

  // ------------------------------------------------------------------ solver
  private prepare(dt: number): void {
    const cs = this.cs, f = cs.f, bv = this.bv, bodies = this.bodies;
    for (let i = 0; i < cs.n; i++) {
      const o = i * ContactSet.S;
      const A = bodies[cs.a[i]], ai = cs.a[i] * 16, bi = cs.b[i];
      const nx = f[o + NX], ny = f[o + NY], nz = f[o + NZ];
      const rax = f[o + PX] - A.pos.x, ray = f[o + PY] - A.pos.y, raz = f[o + PZ] - A.pos.z;
      f[o + RAX] = rax; f[o + RAY] = ray; f[o + RAZ] = raz;
      let rbx = 0, rby = 0, rbz = 0, bo = -1;
      if (bi >= 0) {
        const B = bodies[bi];
        rbx = f[o + PX] - B.pos.x; rby = f[o + PY] - B.pos.y; rbz = f[o + PZ] - B.pos.z;
        bo = bi * 16;
      }
      f[o + RBX] = rbx; f[o + RBY] = rby; f[o + RBZ] = rbz;
      // tangent basis
      let t1x: number, t1y: number, t1z: number;
      if (Math.abs(nx) > 0.57) { t1x = ny; t1y = -nx; t1z = 0; } else { t1x = 0; t1y = nz; t1z = -ny; }
      const tl = 1 / Math.hypot(t1x, t1y, t1z);
      t1x *= tl; t1y *= tl; t1z *= tl;
      const t2x = ny * t1z - nz * t1y, t2y = nz * t1x - nx * t1z, t2z = nx * t1y - ny * t1x;
      f[o + T1X] = t1x; f[o + T1Y] = t1y; f[o + T1Z] = t1z;
      f[o + T2X] = t2x; f[o + T2Y] = t2y; f[o + T2Z] = t2z;
      f[o + MN] = invK(bv, ai, bo, rax, ray, raz, rbx, rby, rbz, nx, ny, nz);
      f[o + MT1] = invK(bv, ai, bo, rax, ray, raz, rbx, rby, rbz, t1x, t1y, t1z);
      f[o + MT2] = invK(bv, ai, bo, rax, ray, raz, rbx, rby, rbz, t2x, t2y, t2z);
      // relative normal velocity
      const vn = relVel(bv, ai, bo, rax, ray, raz, rbx, rby, rbz, nx, ny, nz);
      f[o + VN0] = vn;
      const depth = f[o + DEPTH];
      let bias: number;
      if (depth > 0) bias = Math.min(SOLVER.baumgarte * Math.max(depth - SLOP, 0) / dt, MAX_CORRECTION);
      else bias = depth / dt;
      const e = f[o + 28];
      if (vn < -1.2 && e > 0) bias = Math.max(bias, -e * vn);
      f[o + BIAS] = bias;
      A.contacts++;
      if (bi >= 0) bodies[bi].contacts++;
    }
    // second pass: warm start (after all relative velocities / restitution targets were measured)
    if (!SOLVER.warm) return;
    const pd = this.prevData;
    for (let i = 0; i < cs.n; i++) {
      const o = i * ContactSet.S;
      const A = bodies[cs.a[i]], ai = cs.a[i] * 16, bi = cs.b[i];
      const bo = bi >= 0 ? bi * 16 : -1;
      const pk = pairKey(A.id, bi >= 0 ? bodies[bi].id : 0);
      const ps = this.prevPairs.get(pk);
      if (ps === undefined) continue;
      const pc = this.prevCount.get(pk)!;
      const nx = f[o + NX], ny = f[o + NY], nz = f[o + NZ];
      const rax = f[o + RAX], ray = f[o + RAY], raz = f[o + RAZ], rbx = f[o + RBX], rby = f[o + RBY], rbz = f[o + RBZ];
      const R = A.R;
      const lx = R[0] * rax + R[3] * ray + R[6] * raz, ly = R[1] * rax + R[4] * ray + R[7] * raz, lz = R[2] * rax + R[5] * ray + R[8] * raz;
      let best = -1, bd = 0.02 * 0.02;
      for (let k = 0; k < pc; k++) {
        const q = (ps + k) * 9;
        if (pd[q + 3] * nx + pd[q + 4] * ny + pd[q + 5] * nz < 0.9) continue;
        const d = (pd[q] - lx) ** 2 + (pd[q + 1] - ly) ** 2 + (pd[q + 2] - lz) ** 2;
        if (d < bd) { bd = d; best = q; }
      }
      if (best < 0) continue;
      SOLVER.warmHits++;
      const sc = SOLVER.warmScale;
      f[o + LN] = pd[best + 6] * sc;
      if (SOLVER.warmFriction) { f[o + LT1] = pd[best + 7] * sc; f[o + LT2] = pd[best + 8] * sc; }
      const t1x = f[o + T1X], t1y = f[o + T1Y], t1z = f[o + T1Z], t2x = f[o + T2X], t2y = f[o + T2Y], t2z = f[o + T2Z];
      const Px = nx * f[o + LN] + t1x * f[o + LT1] + t2x * f[o + LT2];
      const Py = ny * f[o + LN] + t1y * f[o + LT1] + t2y * f[o + LT2];
      const Pz = nz * f[o + LN] + t1z * f[o + LT1] + t2z * f[o + LT2];
      applyImp(bv, ai, bo, rax, ray, raz, rbx, rby, rbz, Px, Py, Pz);
    }
  }

  private solveIteration(): void {
    const cs = this.cs, f = cs.f, bv = this.bv;
    for (let i = 0; i < cs.n; i++) {
      const o = i * ContactSet.S;
      const ai = cs.a[i] * 16, bo = cs.b[i] >= 0 ? cs.b[i] * 16 : -1;
      const rax = f[o + RAX], ray = f[o + RAY], raz = f[o + RAZ], rbx = f[o + RBX], rby = f[o + RBY], rbz = f[o + RBZ];
      // friction
      const maxF = f[o + MU] * f[o + LN];
      {
        const tx = f[o + T1X], ty = f[o + T1Y], tz = f[o + T1Z];
        const vt = relVel(bv, ai, bo, rax, ray, raz, rbx, rby, rbz, tx, ty, tz);
        let lam = -vt * f[o + MT1];
        const old = f[o + LT1];
        let nl = old + lam; if (nl > maxF) nl = maxF; else if (nl < -maxF) nl = -maxF;
        lam = nl - old; f[o + LT1] = nl;
        if (lam !== 0) applyImp(bv, ai, bo, rax, ray, raz, rbx, rby, rbz, tx * lam, ty * lam, tz * lam);
      }
      {
        const tx = f[o + T2X], ty = f[o + T2Y], tz = f[o + T2Z];
        const vt = relVel(bv, ai, bo, rax, ray, raz, rbx, rby, rbz, tx, ty, tz);
        let lam = -vt * f[o + MT2];
        const old = f[o + LT2];
        let nl = old + lam; if (nl > maxF) nl = maxF; else if (nl < -maxF) nl = -maxF;
        lam = nl - old; f[o + LT2] = nl;
        if (lam !== 0) applyImp(bv, ai, bo, rax, ray, raz, rbx, rby, rbz, tx * lam, ty * lam, tz * lam);
      }
      // normal
      const nx = f[o + NX], ny = f[o + NY], nz = f[o + NZ];
      const vn = relVel(bv, ai, bo, rax, ray, raz, rbx, rby, rbz, nx, ny, nz);
      let lam = (f[o + BIAS] - vn) * f[o + MN];
      const old = f[o + LN];
      let nl = old + lam; if (nl < 0) nl = 0;
      lam = nl - old; f[o + LN] = nl;
      if (lam !== 0) applyImp(bv, ai, bo, rax, ray, raz, rbx, rby, rbz, nx * lam, ny * lam, nz * lam);
    }
  }

  private storeWarmStart(): void {
    const cs = this.cs, f = cs.f, bodies = this.bodies;
    this.prevPairs.clear();
    this.prevCount.clear();
    if (this.prevData.length < cs.n * 9) this.prevData = new Float64Array(cs.n * 18);
    const pd = this.prevData;
    for (let i = 0; i < cs.n; i++) {
      const o = i * ContactSet.S;
      const A = bodies[cs.a[i]], bi = cs.b[i];
      const pk = pairKey(A.id, bi >= 0 ? bodies[bi].id : 0);
      if (!this.prevPairs.has(pk)) { this.prevPairs.set(pk, i); this.prevCount.set(pk, 0); }
      // contacts of a pair are contiguous in the contact set
      this.prevCount.set(pk, this.prevCount.get(pk)! + 1);
      const R = A.R, rax = f[o + RAX], ray = f[o + RAY], raz = f[o + RAZ];
      const q = i * 9;
      pd[q] = R[0] * rax + R[3] * ray + R[6] * raz;
      pd[q + 1] = R[1] * rax + R[4] * ray + R[7] * raz;
      pd[q + 2] = R[2] * rax + R[5] * ray + R[8] * raz;
      pd[q + 3] = f[o + NX]; pd[q + 4] = f[o + NY]; pd[q + 5] = f[o + NZ];
      pd[q + 6] = f[o + LN]; pd[q + 7] = f[o + LT1]; pd[q + 8] = f[o + LT2];
    }
  }

  private emitImpacts(): void {
    if (!this.onImpact) return;
    const cs = this.cs, f = cs.f, bodies = this.bodies;
    // strongest impact per body per step
    const best = new Map<number, number>();
    for (let i = 0; i < cs.n; i++) {
      const o = i * ContactSet.S;
      const vn0 = f[o + VN0];
      if (vn0 > -2.0 || f[o + LN] <= 0) continue;
      const k = cs.a[i];
      const cur = best.get(k);
      if (cur === undefined || f[cur * ContactSet.S + VN0] > vn0) best.set(k, i);
    }
    for (const [, i] of best) {
      const o = i * ContactSet.S;
      const A = bodies[cs.a[i]];
      const B = cs.b[i] >= 0 ? bodies[cs.b[i]] : null;
      this.onImpact({
        a: A, b: B, x: f[o + PX], y: f[o + PY], z: f[o + PZ], nx: f[o + NX], ny: f[o + NY], nz: f[o + NZ],
        speed: -f[o + VN0], meff: f[o + MN], matB: cs.matB[i],
      });
    }
  }

  // ------------------------------------------------------------------ sleeping
  private parent: Int32Array = new Int32Array(0);
  private find(i: number): number { const p = this.parent; while (p[i] !== i) { p[i] = p[p[i]]; i = p[i]; } return i; }

  private updateSleep(dt: number): void {
    const bodies = this.bodies, n = bodies.length;
    if (this.parent.length < n) this.parent = new Int32Array(n * 2);
    const p = this.parent;
    for (let i = 0; i < n; i++) p[i] = i;
    const cs = this.cs;
    for (let i = 0; i < cs.n; i++) {
      const b = cs.b[i];
      if (b < 0) continue;
      const A = bodies[cs.a[i]], B = bodies[b];
      if (A.sleeping || B.sleeping || A.kinematic || B.kinematic) continue;
      const ra = this.find(cs.a[i]), rb = this.find(b);
      if (ra !== rb) p[ra] = rb;
    }
    // per island: min sleep time
    const minT = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      if (b.sleeping || b.kinematic) continue;
      const slow = b.vel.lenSq() < SLEEP_LIN * SLEEP_LIN && b.ang.lenSq() < SLEEP_ANG * SLEEP_ANG;
      if (slow) b.sleepTime += dt; else b.sleepTime = 0;
      const r = this.find(i);
      const t = minT.get(r);
      minT.set(r, t === undefined ? b.sleepTime : Math.min(t, b.sleepTime));
    }
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      if (b.sleeping || b.kinematic) continue;
      const t = minT.get(this.find(i))!;
      if (t > SLEEP_TIME) {
        b.sleeping = true;
        b.vel.set(0, 0, 0); b.ang.set(0, 0, 0);
      }
    }
  }

  private wakeIsland(b: Body): void {
    b.wake();
    // wake bodies touching it (their AABBs overlap)
    const a = b.aabb;
    for (const o of this.bodies) {
      if (!o.sleeping) continue;
      const c = o.aabb;
      if (a[0] > c[3] + 0.05 || c[0] > a[3] + 0.05 || a[1] > c[4] + 0.05 || c[1] > a[4] + 0.05 || a[2] > c[5] + 0.05 || c[2] > a[5] + 0.05) continue;
      o.wake();
    }
  }
}

function pairKey(a: number, b: number): number { return a * 4194304 + b; }

function mixKey(a: number, b: number, s: number, f: number): number {
  let h = Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 0x51ed27, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35) ^ Math.imul(s + 1, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 13), 0x165667b1) ^ f;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return h ^ (h >>> 13);
}

// ---------------------------------------------------------------------------- solver helpers
function invK(bv: Float64Array, ao: number, bo: number, rax: number, ray: number, raz: number, rbx: number, rby: number, rbz: number, nx: number, ny: number, nz: number): number {
  // k = mA + mB + n . ((IA (ra x n)) x ra) + n . ((IB (rb x n)) x rb)
  let k = bv[ao + 6];
  let cx = ray * nz - raz * ny, cy = raz * nx - rax * nz, cz = rax * ny - ray * nx;
  let ix = bv[ao + 7] * cx + bv[ao + 8] * cy + bv[ao + 9] * cz;
  let iy = bv[ao + 10] * cx + bv[ao + 11] * cy + bv[ao + 12] * cz;
  let iz = bv[ao + 13] * cx + bv[ao + 14] * cy + bv[ao + 15] * cz;
  k += cx * ix + cy * iy + cz * iz;
  if (bo >= 0) {
    k += bv[bo + 6];
    cx = rby * nz - rbz * ny; cy = rbz * nx - rbx * nz; cz = rbx * ny - rby * nx;
    ix = bv[bo + 7] * cx + bv[bo + 8] * cy + bv[bo + 9] * cz;
    iy = bv[bo + 10] * cx + bv[bo + 11] * cy + bv[bo + 12] * cz;
    iz = bv[bo + 13] * cx + bv[bo + 14] * cy + bv[bo + 15] * cz;
    k += cx * ix + cy * iy + cz * iz;
  }
  return k > 1e-12 ? 1 / k : 0;
}

function relVel(bv: Float64Array, ao: number, bo: number, rax: number, ray: number, raz: number, rbx: number, rby: number, rbz: number, nx: number, ny: number, nz: number): number {
  let vx = bv[ao] + bv[ao + 4] * raz - bv[ao + 5] * ray;
  let vy = bv[ao + 1] + bv[ao + 5] * rax - bv[ao + 3] * raz;
  let vz = bv[ao + 2] + bv[ao + 3] * ray - bv[ao + 4] * rax;
  if (bo >= 0) {
    vx -= bv[bo] + bv[bo + 4] * rbz - bv[bo + 5] * rby;
    vy -= bv[bo + 1] + bv[bo + 5] * rbx - bv[bo + 3] * rbz;
    vz -= bv[bo + 2] + bv[bo + 3] * rby - bv[bo + 4] * rbx;
  }
  return vx * nx + vy * ny + vz * nz;
}

function applyImp(bv: Float64Array, ao: number, bo: number, rax: number, ray: number, raz: number, rbx: number, rby: number, rbz: number, px: number, py: number, pz: number): void {
  const ma = bv[ao + 6];
  if (ma > 0) {
    bv[ao] += px * ma; bv[ao + 1] += py * ma; bv[ao + 2] += pz * ma;
    const tx = ray * pz - raz * py, ty = raz * px - rax * pz, tz = rax * py - ray * px;
    bv[ao + 3] += bv[ao + 7] * tx + bv[ao + 8] * ty + bv[ao + 9] * tz;
    bv[ao + 4] += bv[ao + 10] * tx + bv[ao + 11] * ty + bv[ao + 12] * tz;
    bv[ao + 5] += bv[ao + 13] * tx + bv[ao + 14] * ty + bv[ao + 15] * tz;
  }
  if (bo >= 0) {
    const mb = bv[bo + 6];
    if (mb > 0) {
      bv[bo] -= px * mb; bv[bo + 1] -= py * mb; bv[bo + 2] -= pz * mb;
      const tx = rby * pz - rbz * py, ty = rbz * px - rbx * pz, tz = rbx * py - rby * px;
      bv[bo + 3] -= bv[bo + 7] * tx + bv[bo + 8] * ty + bv[bo + 9] * tz;
      bv[bo + 4] -= bv[bo + 10] * tx + bv[bo + 11] * ty + bv[bo + 12] * tz;
      bv[bo + 5] -= bv[bo + 13] * tx + bv[bo + 14] * ty + bv[bo + 15] * tz;
    }
  }
}
