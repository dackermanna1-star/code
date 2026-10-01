// Loose litter as rigid bodies. Drink cans, bottles and paper cups roll,
// tumble and bounce off the wet asphalt, the brickwork (voxel-exact, so door
// recesses, sills and the loading dock count) and the solid props; the
// walker's boots kick them; they settle and go to sleep. Bottles that hit hard
// enough break into pieces cut from their own voxels.
//
// Each body is a convex hull made of rings along its axis (cans, bottles,
// cups: rolls smoothly) or a box (crushed cans, flasks, shards). Contacts are
// resolved per body with sequential impulses (friction cone, restitution,
// rolling resistance); bodies take as many sub-steps as their speed needs.
import * as THREE from 'three';
import { PROPS } from '../props/catalog.js';
import { meshModel } from '../voxel/mesher.js';
import { VoxelGrid, VoxelModel } from '../voxel/VoxelGrid.js';
import { RNG } from '../core/rng.js';
import { CV } from './units.js';
import { inGround } from './groundData.js';

const G = 9.81;
const SLOP = 0.0012;
const ITER = 5;
const MAX_CLUSTERS = 24;
const GROUND = 0, WALL = 1, PROP = 2, FOOT = 3;

/** Material behaviour per litter kind. */
export const LITTER_KIND = {
  can: { e: 0.42, mu: 0.3, roll: 0.03, drag: 0.1, snd: 'canClank', rollSnd: 'canRoll', pick: true },
  bottle: { e: 0.26, mu: 0.28, roll: 0.045, drag: 0.03, snd: 'glassClink', rollSnd: 'bottleRoll', glass: true, pick: true },
  cup: { e: 0.16, mu: 0.5, roll: 0.13, drag: 0.9, snd: 'cupTap', wind: true, pick: true },
  shard: { e: 0.12, mu: 0.65, roll: 0.6, drag: 0.25, snd: 'shardTinkle' },
};

const CAN_SEEDS = [11, 23, 37, 41, 53];
const BOTTLE_MASS = [0.2, 0.45, 0.4, 0.15, 0.14, 0.32];

/** Generator recipe for a litter spot (name, catalog variant, spot index). */
function recipe(name, v, i) {
  if (name === 'can') {
    v %= 5;
    if (v <= 2) {
      const seed = CAN_SEEDS[i % CAN_SEEDS.length];
      return { key: `can|0|${seed}`, name, opts: { variant: 0 }, seed, round: true, mass: 0.015 };
    }
    const seed = v === 3 ? 61 + (i % 2) * 6 : 71;
    return { key: `can|${v}|${seed}`, name, opts: { variant: v }, seed, round: false, mass: 0.015 };
  }
  if (name === 'bottle') {
    v %= 6;
    const seed = 101 + v * 13 + (i % 2) * 7;
    return { key: `bottle|${v}|${seed}`, name, opts: { variant: v, standing: true }, seed, round: v !== 3, mass: BOTTLE_MASS[v] };
  }
  v %= 5;
  const seed = 201 + v * 11;
  return { key: `cup|${v}|${seed}`, name: 'cup', opts: { variant: v }, seed, round: v === 0 || v === 2 || v === 3, mass: v === 2 ? 0.02 : 0.012 };
}

// ───────────────────────── shapes ─────────────────────────

/** Area-weighted centroid of a triangle mesh (thin-walled objects: the mass is in the skin). */
function surfaceCentroid(geo) {
  const P = geo.attributes.position.array, I = geo.index.array;
  let A = 0, cx = 0, cy = 0, cz = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const ar = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    A += ar;
    cx += ar * (P[a] + P[b] + P[c]);
    cy += ar * (P[a + 1] + P[b + 1] + P[c + 1]);
    cz += ar * (P[a + 2] + P[b + 2] + P[c + 2]);
  }
  const k = A > 0 ? 1 / (3 * A) : 0;
  return new THREE.Vector3(cx * k, cy * k, cz * k);
}

/** Radius of the end slices along an axis (0 x, 1 y): how much the outline tapers. */
function taper(geo, axis) {
  const P = geo.attributes.position.array;
  const bb = geo.boundingBox;
  const lo = bb.min.getComponent(axis), hi = bb.max.getComponent(axis), L = hi - lo;
  const c = bb.getCenter(new THREE.Vector3());
  let r0 = 0, r1 = 0;
  for (let i = 0; i < P.length; i += 3) {
    const t = P[i + axis];
    const a = axis === 0 ? P[i + 1] - c.y : P[i] - c.x, b = P[i + 2] - c.z;
    const r = Math.hypot(a, b);
    if (t < lo + 0.15 * L) r0 = Math.max(r0, r);
    else if (t > hi - 0.15 * L) r1 = Math.max(r1, r);
  }
  return Math.abs(r1 - r0);
}

/**
 * Collision shape for a mesh. Round shapes get their lathe axis turned to +Y
 * and a ring profile; everything is recentred on its centre of mass.
 */
function makeShape(geo, o) {
  geo.computeBoundingBox();
  if (o.round) {
    const s = geo.boundingBox.getSize(new THREE.Vector3());
    let axis = 1;
    if (o.name === 'cup') axis = taper(geo, 0) > taper(geo, 1) ? 0 : 1;
    else if (Math.abs(s.y - s.z) < Math.abs(s.x - s.z) - 1e-4) axis = 0;
    if (axis === 0) geo.rotateZ(Math.PI / 2);
  }
  const com = surfaceCentroid(geo);
  geo.translate(-com.x, -com.y, -com.z);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const bb = geo.boundingBox;
  const P = geo.attributes.position.array;
  const shape = {
    name: o.name, kind: o.kind, geo, mass: o.mass, round: !!o.round, glass: o.glass ?? null,
    comMesh: com, model: o.model ?? null, seed: o.seed ?? 1, key: o.key ?? '',
    brad: geo.boundingSphere.radius + geo.boundingSphere.center.length(),
    rings: null, cx: 0, cz: 0, corners: null, samples: null,
    segA: new THREE.Vector3(), segB: new THREE.Vector3(), capR: 0,
    invI: [0, 0, 0], grip: { flip: false, gy: 0, r: 0.03 },
  };
  const m = o.mass;
  if (o.round) {
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    const ymin = bb.min.y, ymax = bb.max.y, L = ymax - ymin;
    const K = Math.max(2, Math.min(6, Math.round(L / 0.05) + 1));
    const step = L / (K - 1);
    const rings = [];
    for (let k = 0; k < K; k++) rings.push({ y: ymin + step * k, r: 0 });
    // radius of the outline at each ring: triangles spanning its height (greedy-meshed
    // walls are tall quads with no vertices part way up)
    const I = geo.index.array, tol = step * 0.25;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const y0 = Math.min(P[a + 1], P[b + 1], P[c + 1]), y1 = Math.max(P[a + 1], P[b + 1], P[c + 1]);
      const r = Math.max(Math.hypot(P[a] - cx, P[a + 2] - cz), Math.hypot(P[b] - cx, P[b + 2] - cz), Math.hypot(P[c] - cx, P[c + 2] - cz));
      for (let k = 0; k < K; k++) if (y0 <= rings[k].y + tol && y1 >= rings[k].y - tol && r > rings[k].r) rings[k].r = r;
    }
    for (let k = 0; k < K; k++) if (rings[k].r <= 0) rings[k].r = 0.5 * ((rings[k - 1]?.r ?? 0.02) + (rings[k + 1]?.r || rings[k - 1]?.r || 0.02));
    const rMax = Math.max(...rings.map((r) => r.r));
    shape.rings = rings;
    shape.cx = cx;
    shape.cz = cz;
    // wall/prop sample points: eight around each ring
    const S = [];
    for (const rg of rings)
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * Math.PI * 2;
        S.push(cx + Math.cos(a) * rg.r, rg.y, cz + Math.sin(a) * rg.r);
      }
    shape.samples = new Float32Array(S);
    const r0 = rings[0].r, r1 = rings[K - 1].r;
    shape.capR = rMax;
    shape.segA.set(cx, Math.min(ymin + r0 * 0.7, (ymin + ymax) / 2), cz);
    shape.segB.set(cx, Math.max(ymax - r1 * 0.7, (ymin + ymax) / 2), cz);
    shape.invI = [1 / (m * (0.3 * rMax * rMax + (L * L) / 12)), 1 / (0.6 * m * rMax * rMax), 1 / (m * (0.3 * rMax * rMax + (L * L) / 12))];
    // how it sits in a hand: bottles neck up (narrow end), cups mouth up (the wider half,
    // lid and straw included); bottles are held round the body, cups round the middle
    const half = (lo) => {
      const rs = rings.filter((rg) => (lo ? rg.y < (ymin + ymax) / 2 : rg.y >= (ymin + ymax) / 2)).map((rg) => rg.r);
      return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
    };
    const flip = o.name === 'cup' ? half(true) > half(false) * 1.03 : r1 > r0 * 1.05;
    let ya = Infinity, yb = -Infinity;
    for (const rg of rings) if (rg.r >= rMax * 0.9) { ya = Math.min(ya, rg.y); yb = Math.max(yb, rg.y); }
    const body = rings.filter((rg) => rg.y > ymin + L * 0.2 && rg.y < ymax - L * 0.2);
    const rBody = body.length ? Math.max(...body.map((rg) => rg.r)) : rMax;
    shape.grip = { flip, gy: o.name === 'cup' ? 0 : (ya + yb) / 2, r: o.name === 'cup' ? rBody : rMax, bottom: flip ? ymax : ymin };
  } else {
    const C = [];
    for (let i = 0; i < 8; i++) C.push(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
    shape.corners = new Float32Array(C);
    shape.samples = shape.corners;
    const s = bb.getSize(new THREE.Vector3());
    // capsule along the longest side
    const ax = s.x >= s.y && s.x >= s.z ? 0 : s.y >= s.z ? 1 : 2;
    const c = bb.getCenter(new THREE.Vector3());
    const half = s.getComponent(ax) / 2;
    // thin side: flat things only touch others when they really overlap
    const rr = Math.max(0.008, Math.min(...[s.x, s.y, s.z].filter((_, k) => k !== ax)) / 2);
    shape.capR = rr;
    shape.segA.copy(c).setComponent(ax, c.getComponent(ax) - Math.max(0, half - rr));
    shape.segB.copy(c).setComponent(ax, c.getComponent(ax) + Math.max(0, half - rr));
    const mi = (a, b) => 1 / Math.max(1e-9, (m * (a * a + b * b)) / 12);
    shape.invI = [mi(s.y, s.z), mi(s.x, s.z), mi(s.x, s.y)];
    shape.grip = { flip: false, gy: 0, r: Math.min(s.x, s.z) / 2, bottom: bb.min.y };
  }
  return shape;
}

// ───────────────────────── bodies ─────────────────────────

class Body {
  constructor(shape) {
    this.shape = shape;
    this.k = shape.kind;
    this.p = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.w = new THREE.Vector3();
    this.R = new Float64Array(9);
    this.I = new Float64Array(9);
    this.awake = true;
    this.still = 0;
    this.pool = null;
    this.idx = -1;
    this.cluster = null;
    this.piece = -1;
    this.facs = [];
    this.boxes = [];
    this.lastSnd = -1;
    this.rollUntil = 0;
    this.grounded = false;
    this.imp = 0;
    this.impP = new THREE.Vector3();
    this.impN = new THREE.Vector3();
    this.impSoft = false;
    this.impKind = GROUND;
    this.kick = 0;
    this.breakV = 5.2 + Math.random() * 1.6;
    this.marked = false;
    this.age = 0;
  }

  /** World rotation (row-major) and world inverse inertia from the quaternion. */
  orient() {
    const { x, y, z, w } = this.q;
    const R = this.R;
    const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    R[0] = 1 - 2 * (yy + zz); R[1] = 2 * (xy - wz); R[2] = 2 * (xz + wy);
    R[3] = 2 * (xy + wz); R[4] = 1 - 2 * (xx + zz); R[5] = 2 * (yz - wx);
    R[6] = 2 * (xz - wy); R[7] = 2 * (yz + wx); R[8] = 1 - 2 * (xx + yy);
    const a = this.shape.invI, I = this.I;
    for (let r = 0; r < 3; r++)
      for (let c = r; c < 3; c++) {
        const v = R[r * 3] * a[0] * R[c * 3] + R[r * 3 + 1] * a[1] * R[c * 3 + 1] + R[r * 3 + 2] * a[2] * R[c * 3 + 2];
        I[r * 3 + c] = v;
        I[c * 3 + r] = v;
      }
  }

  wake() {
    this.awake = true;
    this.still = 0;
  }

  /** Apply an impulse (world) at lever arm r (world, from the centre of mass). */
  impulse(px, py, pz, rx, ry, rz) {
    const im = 1 / this.shape.mass, I = this.I;
    this.v.x += px * im;
    this.v.y += py * im;
    this.v.z += pz * im;
    const tx = ry * pz - rz * py, ty = rz * px - rx * pz, tz = rx * py - ry * px;
    this.w.x += I[0] * tx + I[1] * ty + I[2] * tz;
    this.w.y += I[3] * tx + I[4] * ty + I[5] * tz;
    this.w.z += I[6] * tx + I[7] * ty + I[8] * tz;
  }
}

/** One instanced mesh per litter shape. */
class Pool {
  constructor(shape, material, cap, scene) {
    this.shape = shape;
    this.bodies = [];
    this.mesh = new THREE.InstancedMesh(shape.geo, material, Math.max(1, cap));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.name = 'litter:' + shape.key;
    scene.add(this.mesh);
    this.dirty = false;
  }

  add(b, m) {
    if (this.bodies.length >= this.mesh.instanceMatrix.count) return false;
    b.pool = this;
    b.idx = this.bodies.length;
    this.bodies.push(b);
    this.mesh.count = this.bodies.length;
    this.write(b, m);
    return true;
  }

  remove(b) {
    const last = this.bodies.pop();
    if (last !== b) {
      this.bodies[b.idx] = last;
      last.idx = b.idx;
      this.mesh.setMatrixAt(last.idx, last._m);
    }
    this.mesh.count = this.bodies.length;
    b.pool = null;
    b.idx = -1;
    this.dirty = true;
  }

  write(b, m) {
    b._m = b._m ?? new THREE.Matrix4();
    b._m.compose(b.p, b.q, m);
    this.mesh.setMatrixAt(b.idx, b._m);
    this.dirty = true;
  }

  flush() {
    if (!this.dirty) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = false;
  }
}

/** The pieces of one broken bottle, skinned on the CPU into a single mesh. */
class ShardCluster {
  constructor(pieces, material, scene) {
    let nv = 0, ni = 0;
    for (const pc of pieces) {
      nv += pc.shape.geo.attributes.position.count;
      ni += pc.shape.geo.index.count;
    }
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3);
    const col = new Uint8Array(nv * 4), mat = new Uint8Array(nv * 4), vox = new Float32Array(nv * 3);
    const idx = new Uint32Array(ni);
    this.restP = new Float32Array(nv * 3);
    this.restN = new Float32Array(nv * 3);
    this.ranges = [];
    let ov = 0, oi = 0;
    for (const pc of pieces) {
      const g = pc.shape.geo, A = g.attributes, n = A.position.count;
      this.restP.set(A.position.array, ov * 3);
      for (let i = 0; i < n * 3; i++) this.restN[ov * 3 + i] = A.normal.array[i] / 127;
      col.set(A.vcol.array, ov * 4);
      mat.set(A.vmat.array, ov * 4);
      vox.set(A.vox.array, ov * 3);
      const I = g.index.array;
      for (let i = 0; i < I.length; i++) idx[oi + i] = I[i] + ov;
      this.ranges.push([ov, n]);
      ov += n;
      oi += I.length;
    }
    this.pos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.nrm = new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('normal', this.nrm);
    geo.setAttribute('vcol', new THREE.BufferAttribute(col, 4, true));
    geo.setAttribute('vmat', new THREE.BufferAttribute(mat, 4, true));
    geo.setAttribute('vox', new THREE.BufferAttribute(vox, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'shards';
    scene.add(this.mesh);
    this.bodies = [];
    this.dirty = false;
  }

  write(i, b) {
    const [o, n] = this.ranges[i];
    const R = b.R, p = b.p, P = this.pos.array, N = this.nrm.array, rp = this.restP, rn = this.restN;
    for (let k = o * 3, e = (o + n) * 3; k < e; k += 3) {
      const x = rp[k], y = rp[k + 1], z = rp[k + 2];
      P[k] = p.x + R[0] * x + R[1] * y + R[2] * z;
      P[k + 1] = p.y + R[3] * x + R[4] * y + R[5] * z;
      P[k + 2] = p.z + R[6] * x + R[7] * y + R[8] * z;
      const a = rn[k], c = rn[k + 1], d = rn[k + 2];
      N[k] = R[0] * a + R[1] * c + R[2] * d;
      N[k + 1] = R[3] * a + R[4] * c + R[5] * d;
      N[k + 2] = R[6] * a + R[7] * c + R[8] * d;
    }
    this.dirty = true;
  }

  flush() {
    if (!this.dirty) return;
    this.pos.needsUpdate = true;
    this.nrm.needsUpdate = true;
    this.dirty = false;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
  }
}

// ───────────────────────── the simulation ─────────────────────────

export class Litter {
  constructor(engine) {
    this.engine = engine;
    this.world = engine.world;
    this.props = engine.world.props;
    this.gs = engine.world.ground?.sample ?? null;
    this.material = this.props.material;
    this.shapes = new Map();
    this.pools = new Map();
    this.bodies = [];
    this.clusters = [];
    this.pendingBreak = [];
    this.t = 0;
    this.sndBudget = 8;
    this.rng = new RNG(4242);
    this.C = Array.from({ length: 64 }, () => ({
      px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, nx: 0, ny: 0, nz: 0, d: 0, mu: 0, e: 0,
      sx: 0, sy: 0, sz: 0, kind: 0, soft: false, t1x: 0, t1y: 0, t1z: 0, t2x: 0, t2y: 0, t2z: 0,
      kn: 0, kt1: 0, kt2: 0, bias: 0, Pn: 0, P1: 0, P2: 0,
    }));
    this.hit = { d: 0, nx: 0, ny: 0, nz: 0, soft: false };
    this.one = new THREE.Vector3(1, 1, 1);
    this.feet = [];
    this.lights = engine.world.lamps.filter((l) => l.light.castShadow);
    this.lightDirty = new Map();
    this.buildColliders();
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
  }

  // ───────────── static colliders ─────────────

  buildColliders() {
    const AX = { '+x': [0, 1, 2, -1], '-x': [0, -1, 2, 1], '+z': [2, 1, 0, 1], '-z': [2, -1, 0, -1] };
    this.facs = [];
    for (const r of this.world.facadeData?.results ?? []) {
      const f = r.facade, g = r.grid;
      const [ax, sn, bx, su] = AX[f.face];
      this.facs.push({
        f, g, ax, sn, bx, su, plane: f.plane, start: f.start, kFront: r.kFront, base: r.base,
        zMin: -r.kFront * CV, zMax: (g.nz - r.kFront) * CV, uMax: g.nx * CV, yMin: r.base, yMax: r.base + g.ny * CV,
      });
    }
    this.boxes = (this.props.physTargets ?? this.props.sprayTargets ?? []).map((T) => {
      const c = T.box.getCenter(new THREE.Vector3()).applyMatrix4(T.m);
      return { ...T, c, r: T.box.getSize(new THREE.Vector3()).length() / 2, inv: T.inv.elements, me: T.m.elements };
    });
  }

  /** Extra solid box (sleepers, etc.). soft: absorbs impacts instead of breaking glass. */
  addBox(box, matrix, soft = true) {
    const inv = matrix.clone().invert();
    const c = box.getCenter(new THREE.Vector3()).applyMatrix4(matrix);
    this.boxes.push({ name: 'extra', box, m: matrix, inv: inv.elements, me: matrix.elements, c, r: box.getSize(new THREE.Vector3()).length() / 2, soft });
  }

  gather(b, reach) {
    b.facs.length = 0;
    b.boxes.length = 0;
    const p = b.p;
    for (const F of this.facs) {
      const zo = F.sn * ((F.ax === 0 ? p.x : p.z) - F.plane);
      if (zo > F.zMax + reach || zo < F.zMin - reach) continue;
      const u = F.su * ((F.bx === 0 ? p.x : p.z) - F.start);
      if (u < -reach || u > F.uMax + reach || p.y < F.yMin - reach || p.y > F.yMax + reach) continue;
      b.facs.push(F);
    }
    for (const T of this.boxes) {
      const rr = T.r + reach;
      if (T.c.distanceToSquared(p) < rr * rr) b.boxes.push(T);
    }
  }

  /** Point vs facade voxels. Sets this.hit (depth, exit normal). */
  facadeHit(F, x, y, z) {
    const zo = F.sn * ((F.ax === 0 ? x : z) - F.plane);
    if (zo >= F.zMax) return false;
    const u = F.su * ((F.bx === 0 ? x : z) - F.start);
    if (u < 0 || u >= F.uMax || y >= F.yMax || y < F.yMin) return false;
    const H = this.hit;
    const k = Math.floor(zo / CV + F.kFront);
    if (k < 0) {
      if (inGround(x, z)) return false;
      H.d = Math.min(0.05, -zo);
      this.facN(F, 2, 1);
      return true;
    }
    const g = F.g, nx = g.nx, ny = g.ny, nz = g.nz, D = g.data;
    const i = Math.floor(u / CV), j = Math.floor((y - F.base) / CV);
    const solid = (a, b, c) => a >= 0 && a < nx && b >= 0 && b < ny && c >= 0 && c < nz && D[a + nx * (b + ny * c)] !== 0;
    if (!solid(i, j, k)) return false;
    let best = Infinity, ax = 2, sg = 1;
    let d;
    if (!solid(i, j, k + 1)) {
      d = (k + 1 - F.kFront) * CV - zo;
      if (d < best) { best = d; ax = 2; sg = 1; }
    }
    if (i + 1 < nx && !solid(i + 1, j, k)) {
      d = (i + 1) * CV - u;
      if (d < best) { best = d; ax = 0; sg = 1; }
    }
    if (i > 0 && !solid(i - 1, j, k)) {
      d = u - i * CV;
      if (d < best) { best = d; ax = 0; sg = -1; }
    }
    if (!solid(i, j + 1, k)) {
      d = F.base + (j + 1) * CV - y;
      if (d < best) { best = d; ax = 1; sg = 1; }
    }
    if (j > 0 && !solid(i, j - 1, k)) {
      d = y - F.base - j * CV;
      if (d < best) { best = d; ax = 1; sg = -1; }
    }
    if (best === Infinity) {
      let kk = k + 1;
      while (kk < nz && solid(i, j, kk)) kk++;
      best = (kk - F.kFront) * CV - zo;
      ax = 2;
      sg = 1;
    }
    H.d = best;
    this.facN(F, ax, sg);
    return true;
  }

  /** World normal of a facade-local axis (0 along the wall, 1 up, 2 out of the wall). */
  facN(F, ax, sg) {
    const H = this.hit;
    H.nx = H.ny = H.nz = 0;
    H.soft = false;
    if (ax === 1) H.ny = sg;
    else if (ax === 2) {
      if (F.ax === 0) H.nx = sg * F.sn;
      else H.nz = sg * F.sn;
    } else if (F.bx === 0) H.nx = sg * F.su;
    else H.nz = sg * F.su;
  }

  /** Point vs an oriented prop box. */
  boxHit(T, x, y, z) {
    const e = T.inv;
    const lx = e[0] * x + e[4] * y + e[8] * z + e[12];
    const ly = e[1] * x + e[5] * y + e[9] * z + e[13];
    const lz = e[2] * x + e[6] * y + e[10] * z + e[14];
    const b = T.box;
    if (lx <= b.min.x || lx >= b.max.x || ly <= b.min.y || ly >= b.max.y || lz <= b.min.z || lz >= b.max.z) return false;
    let best = b.max.y - ly, ax = 1, sg = 1;
    let d = lx - b.min.x;
    if (d < best) { best = d; ax = 0; sg = -1; }
    d = b.max.x - lx;
    if (d < best) { best = d; ax = 0; sg = 1; }
    d = lz - b.min.z;
    if (d < best) { best = d; ax = 2; sg = -1; }
    d = b.max.z - lz;
    if (d < best) { best = d; ax = 2; sg = 1; }
    // never push out through the bottom of a box standing on the ground
    if (b.min.y > 0.05) {
      d = ly - b.min.y;
      if (d < best) { best = d; ax = 1; sg = -1; }
    }
    const m = T.me, o = ax * 4;
    const H = this.hit;
    H.nx = m[o] * sg;
    H.ny = m[o + 1] * sg;
    H.nz = m[o + 2] * sg;
    const l = Math.hypot(H.nx, H.ny, H.nz) || 1;
    H.nx /= l;
    H.ny /= l;
    H.nz /= l;
    H.d = best;
    H.soft = !!T.soft;
    return true;
  }

  // ───────────── building ─────────────

  shape(rec) {
    let s = this.shapes.get(rec.key);
    if (s) return s;
    const gen = PROPS[rec.name];
    if (!gen) return null;
    let res;
    try {
      res = gen(new RNG(rec.seed), rec.opts);
    } catch (e) {
      console.warn('litter prop failed', rec.key, e);
      return null;
    }
    const geo = meshModel(res.model);
    s = makeShape(geo, { round: rec.round, mass: rec.mass, kind: LITTER_KIND[rec.name], name: rec.name, model: res.model, glass: res.meta?.glass, seed: rec.seed, key: rec.key });
    s.rec = rec;
    this.shapes.set(rec.key, s);
    return s;
  }

  build() {
    const spots = this.props.litterSpots ?? [];
    const plan = [];
    spots.forEach((sp, i) => {
      const rec = recipe(sp.name, sp.variant, i);
      const s = this.shape(rec);
      if (s) plan.push({ sp, s });
    });
    // one instanced mesh per shape, sized for everything of that shape
    const counts = new Map();
    for (const { s } of plan) counts.set(s, (counts.get(s) ?? 0) + 1);
    for (const [s, n] of counts) this.pools.set(s, new Pool(s, this.material, n, this.engine.scene));
    const r = this.rng;
    for (const { sp, s } of plan) {
      const b = new Body(s);
      this.restPose(b, sp, r);
      this.addBody(b);
    }
    // let everything settle into the ground, against walls and each other
    for (let i = 0; i < 24; i++) this.update(1 / 60, 0, true);
    for (const b of this.bodies) {
      b.awake = false;
      b.v.set(0, 0, 0);
      b.w.set(0, 0, 0);
    }
    this.flush();
    return this;
  }

  /** Lying (or standing) pose on the ground at a spot. */
  restPose(b, sp, r) {
    const s = b.shape;
    const gy = this.world.groundHeight(sp.x, sp.z);
    const yaw = r.range(0, Math.PI * 2);
    if (s.round) {
      const rMax = s.capR;
      if (sp.lying) {
        // axis horizontal, turned about itself so labels face anywhere
        this._q.setFromEuler(new THREE.Euler(0, r.range(0, Math.PI * 2), Math.PI / 2, 'ZYX'));
        b.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(this._q);
        b.p.set(sp.x, gy + rMax + 0.002, sp.z);
      } else {
        // standing on its base (bottles neck up, cups mouth up)
        const flip = s.grip.flip;
        b.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        if (flip) b.q.multiply(this._q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
        b.p.set(sp.x, gy - (flip ? -s.geo.boundingBox.max.y : s.geo.boundingBox.min.y) + 0.002, sp.z);
      }
    } else {
      // flattest side down
      const sz = s.geo.boundingBox.getSize(new THREE.Vector3());
      b.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      let lift = -s.geo.boundingBox.min.y;
      if (sz.x < sz.y && sz.x <= sz.z) {
        b.q.multiply(this._q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
        lift = -s.geo.boundingBox.min.x;
      } else if (sz.z < sz.y && sz.z < sz.x) {
        b.q.multiply(this._q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
        lift = s.geo.boundingBox.max.z;
      }
      b.p.set(sp.x, gy + lift + 0.002, sp.z);
    }
  }

  addBody(b, pool = this.pools.get(b.shape)) {
    b.orient();
    if (pool && !pool.add(b, this.one)) return false;
    this.bodies.push(b);
    return true;
  }

  removeBody(b) {
    const i = this.bodies.indexOf(b);
    if (i >= 0) {
      this.bodies[i] = this.bodies[this.bodies.length - 1];
      this.bodies.pop();
    }
    b.pool?.remove(b);
  }

  // ───────────── hands: picking up, throwing ─────────────

  /** The pickable item nearest the view ray (within reach), or null. */
  pickTarget(origin, dir, maxDist = 2.4, playerPos = null) {
    let best = null, bestS = Infinity;
    for (const b of this.bodies) {
      if (!b.k.pick || b.cluster) continue;
      const dx = b.p.x - origin.x, dy = b.p.y - origin.y, dz = b.p.z - origin.z;
      const t = dx * dir.x + dy * dir.y + dz * dir.z;
      if (t < 0.15 || t > maxDist) continue;
      if (playerPos && Math.hypot(b.p.x - playerPos.x, b.p.z - playerPos.z) > 1.35) continue;
      const px = dx - dir.x * t, py = dy - dir.y * t, pz = dz - dir.z * t;
      const off = Math.sqrt(px * px + py * py + pz * pz);
      const tol = b.shape.brad + 0.12 + 0.1 * t;
      if (off > tol) continue;
      const score = off / tol + t * 0.15;
      if (score < bestS) {
        bestS = score;
        best = b;
      }
    }
    return best;
  }

  /** Take a body out of the world (into a hand). */
  take(b) {
    this.removeBody(b);
    b.awake = false;
    this.markShadows(b.p, true);
    return b;
  }

  /** Put a held body back into the world with a pose and velocities. */
  release(b, pos, quat, vel, angVel) {
    b.p.copy(pos);
    b.q.copy(quat).normalize();
    b.v.copy(vel);
    b.w.copy(angVel);
    b.wake();
    b.age = 0;
    this.addBody(b);
  }

  // ───────────── breaking glass ─────────────

  /** Pieces for a bottle shape: its voxels split into a base, a neck and curved wall shards. */
  piecesFor(s) {
    if (s.pieces) return s.pieces;
    const model = s.model;
    if (!model) return (s.pieces = []);
    const g = model.grid, nx = g.nx, ny = g.ny, nz = g.nz, D = g.data;
    const vox = [];
    let mx = 0, mz = 0;
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const v = D[x + nx * (y + ny * z)];
          if (!v) continue;
          vox.push(x, y, z, v);
          mx += x + 0.5;
          mz += z + 0.5;
        }
    const N = vox.length / 4;
    if (!N) return (s.pieces = []);
    mx /= N;
    mz /= N;
    const layerR = new Float32Array(ny);
    let yTop = 0;
    for (let i = 0; i < vox.length; i += 4) {
      const r = Math.hypot(vox[i] + 0.5 - mx, vox[i + 2] + 0.5 - mz);
      if (r > layerR[vox[i + 1]]) layerR[vox[i + 1]] = r;
      yTop = Math.max(yTop, vox[i + 1]);
    }
    const rMax = Math.max(...layerR);
    let neckY = yTop + 1;
    while (neckY - 1 > 2 && layerR[neckY - 1] > 0 && layerR[neckY - 1] <= 0.62 * rMax) neckY--;
    const hasNeck = yTop - neckY + 1 >= 3;
    const r = new RNG(s.seed * 7 + 3);
    const nBody = N * 0.8;
    const K = Math.max(9, Math.min(20, Math.round(nBody / 11)));
    const seeds = [];
    const y0 = 2, y1 = hasNeck ? neckY : yTop + 1;
    for (let k = 0; k < K; k++) seeds.push([r.range(0, Math.PI * 2), r.range(y0, y1)]);
    const splitNeck = hasNeck && r.chance(0.35) ? neckY + r.int(1, Math.max(1, yTop - neckY - 1)) : Infinity;
    const label = new Int16Array(N);
    const hash = (x, y, z) => {
      let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    for (let n = 0; n < N; n++) {
      const x = vox[n * 4], y = vox[n * 4 + 1], z = vox[n * 4 + 2];
      if (y <= 1 || (y === 2 && hash(x, y, z) < 0.3)) label[n] = 0;
      else if (hasNeck && y >= neckY) label[n] = y >= splitNeck ? 2 : 1;
      else {
        const a = Math.atan2(z + 0.5 - mz, x + 0.5 - mx);
        let bi = 0, bd = Infinity;
        for (let k = 0; k < K; k++) {
          let da = Math.abs(a - seeds[k][0]);
          if (da > Math.PI) da = Math.PI * 2 - da;
          const dd = (da * rMax) ** 2 + ((y - seeds[k][1]) * 0.8) ** 2 + hash(x, y, z + k) * 2.2;
          if (dd < bd) {
            bd = dd;
            bi = k;
          }
        }
        label[n] = 3 + bi;
      }
    }
    const pieces = [];
    const vs = model.voxelSize, org = model.origin;
    for (let id = 0; id < 3 + K; id++) {
      let n = 0;
      for (let i = 0; i < N; i++) if (label[i] === id) n++;
      if (n < 2) continue;
      const pg = new VoxelGrid(nx, ny, nz);
      for (let i = 0; i < N; i++) {
        if (label[i] !== id) continue;
        const x = vox[i * 4], y = vox[i * 4 + 1], z = vox[i * 4 + 2];
        pg.data[x + nx * (y + ny * z)] = vox[i * 4 + 3];
      }
      const geo = meshModel(new VoxelModel(pg, model.palette, vs, org));
      const shp = makeShape(geo, { round: false, mass: (s.mass * n) / N, kind: LITTER_KIND.shard, name: 'shard', seed: s.seed + id });
      // makeShape recentred on the surface centroid; offset of that centre in the bottle's frame
      const off = shp.comMesh.clone().sub(s.comMesh);
      pieces.push({ shape: shp, off, n, big: id < 3 });
    }
    s.pieces = pieces;
    return pieces;
  }

  /** Break a bottle: pieces fly off the impact, glass dust glints, the smash rings out. */
  shatter(b, point, normal, speed) {
    const s = b.shape;
    const pieces = this.piecesFor(s);
    if (!pieces.length) return;
    this.removeBody(b);
    this.markShadows(b.p, true);
    const cluster = new ShardCluster(pieces, this.material, this.engine.scene);
    this.clusters.push(cluster);
    if (this.clusters.length > MAX_CLUSTERS) this.retireCluster(this.clusters[0]);
    const r = this.rng;
    const n = normal;
    const vn = b.v.dot(n);
    const vt = this._v.copy(b.v).addScaledVector(n, -vn);
    const R = b.R;
    pieces.forEach((pc, i) => {
      const body = new Body(pc.shape);
      body.cluster = cluster;
      body.piece = i;
      const o = pc.off;
      body.p.set(
        b.p.x + R[0] * o.x + R[1] * o.y + R[2] * o.z,
        b.p.y + R[3] * o.x + R[4] * o.y + R[5] * o.z,
        b.p.z + R[6] * o.x + R[7] * o.y + R[8] * o.z,
      );
      body.q.copy(b.q);
      // outward from the bottle's axis, back off the surface, along it with what is left of the throw
      const ox = R[0] * o.x + R[2] * o.z, oy = R[3] * o.x + R[5] * o.z, oz = R[6] * o.x + R[8] * o.z;
      const ol = Math.hypot(ox, oy, oz) || 1;
      // most of it drops at the foot of what it hit; a few bits skitter further
      const far = r.chance(0.2) ? 2 : 1;
      const out = (pc.big ? 0.5 : 1.0) * r.range(0.3, 1.3) * far;
      const back = Math.abs(vn) * r.range(0.03, 0.13) * far + r.range(0.1, 0.45);
      const spray = Math.min(2, speed * 0.14) * far;
      body.v.copy(vt).multiplyScalar(r.range(0.15, 0.45));
      body.v.x += (ox / ol) * out + n.x * back + r.range(-spray, spray);
      body.v.y += (oy / ol) * out + n.y * back + r.range(0.2, 1.4);
      body.v.z += (oz / ol) * out + n.z * back + r.range(-spray, spray);
      body.w.set(r.range(-30, 30), r.range(-30, 30), r.range(-30, 30)).multiplyScalar(pc.big ? 0.4 : 1);
      body.breakV = Infinity;
      body.lastSnd = this.t;
      body.orient();
      cluster.bodies.push(body);
      cluster.write(i, body);
      this.bodies.push(body);
    });
    cluster.flush();
    // glass dust glinting in the lamplight
    const mist = this.engine.spray?.mist;
    if (mist) {
      const tint = s.glass === 'green' ? [0.35, 0.75, 0.4] : s.glass === 'clear' ? [0.85, 0.9, 0.88] : [0.85, 0.52, 0.22];
      const v = this._v;
      for (let i = 0; i < 46; i++) {
        v.set(r.range(-1, 1), r.range(-0.3, 1), r.range(-1, 1)).normalize().multiplyScalar(r.range(0.6, 3.2));
        v.addScaledVector(n, r.range(0.3, 1.6));
        mist.emit(point, v, r.range(0.15, 0.55), tint, 2, 0.0016, 0.0011, 3.5, r.range(0.5, 1));
      }
      for (let i = 0; i < 5; i++) {
        v.set(r.range(-0.3, 0.3), r.range(0, 0.25), r.range(-0.3, 0.3)).addScaledVector(n, 0.25);
        mist.emit(point, v, r.range(0.5, 1.1), [0.5, 0.5, 0.52], 1, 0.03, 0.12, 2.5, 0.05);
      }
    }
    this.sound('glassBreak', point, Math.min(1.3, 0.55 + speed / 14), true);
    this.splash(point, Math.min(1, speed / 8));
  }

  retireCluster(c) {
    for (const b of c.bodies) {
      const i = this.bodies.indexOf(b);
      if (i >= 0) {
        this.bodies[i] = this.bodies[this.bodies.length - 1];
        this.bodies.pop();
      }
    }
    c.dispose(this.engine.scene);
    this.clusters.splice(this.clusters.indexOf(c), 1);
  }

  // ───────────── sound ─────────────

  sound(type, p, strength, force = false, extra = null) {
    if (!force) {
      if (this.sndBudget < 1) return;
      this.sndBudget -= 1;
    }
    this.engine.audio?.oneShot?.(type, { position: { x: p.x, y: p.y, z: p.z }, strength, ...(extra ?? {}) });
  }

  splash(p, k) {
    const w = this.gs ? this.gs.water(p.x, p.z) : 0;
    if (w < 0.002 || p.y > this.world.groundHeight(p.x, p.z) + 0.08) return;
    this.world.ground?.addRipple?.(p.x, p.z, 0.4 + 0.8 * k);
    this.sound('splash', p, 0.3 + 0.7 * k);
  }

  // ───────────── the feet ─────────────

  updateFeet(dt) {
    const body = this.engine.body;
    const F = this.feet;
    if (!body?.legs) {
      F.length = 0;
      return;
    }
    // ankle-local spheres: ball of the foot, toe, heel
    const LOC = [[0, -0.075, -0.115, 0.045], [0, -0.09, -0.175, 0.03], [0, -0.07, 0.02, 0.04]];
    let i = 0;
    for (const side of ['L', 'R']) {
      const ankle = body.legs[side]?.ankle;
      if (!ankle) continue;
      for (const [x, y, z, r] of LOC) {
        let f = F[i];
        if (!f) f = F[i] = { p: new THREE.Vector3(), prev: new THREE.Vector3(), v: new THREE.Vector3(), r, ok: false };
        f.prev.copy(f.p);
        f.p.set(x, y, z).applyMatrix4(ankle.matrixWorld);
        f.r = r;
        if (f.ok && dt > 0) {
          f.v.subVectors(f.p, f.prev).divideScalar(dt);
          if (f.v.lengthSq() > 100) {
            f.v.set(0, 0, 0);
            f.prev.copy(f.p);
          }
        } else {
          f.prev.copy(f.p);
          f.v.set(0, 0, 0);
        }
        f.ok = true;
        i++;
      }
    }
    F.length = i;
  }

  // ───────────── per frame ─────────────

  update(dt, t, settle = false) {
    if (!(dt > 0)) return;
    this.t = t;
    this.sndBudget = Math.min(8, this.sndBudget + dt * 14);
    if (!settle) {
      this.updateFeet(dt);
      this.wind(dt, t);
    }
    const p = this.engine.params ?? {};
    const feet = settle || (p.shot && !p.walk) ? [] : this.feet;
    // wake whatever the boots come near
    for (const b of this.bodies) {
      b.nearFoot = false;
      for (const f of feet) {
        const rr = b.shape.brad + f.r + 0.03;
        if (b.p.distanceToSquared(f.p) < rr * rr || b.p.distanceToSquared(f.prev) < rr * rr) {
          b.nearFoot = true;
          if (!b.awake && f.v.lengthSq() > 0.01) b.wake();
        }
      }
    }
    this.pairs(dt, settle);
    for (const b of this.bodies) {
      if (!b.awake) continue;
      b.imp = 0;
      b.kick = 0;
      const vmax = b.v.length() + b.w.length() * b.shape.brad;
      const n = Math.max(2, Math.min(30, Math.ceil((vmax * dt) / 0.01)));
      const h = dt / n;
      this.gather(b, b.shape.brad + vmax * dt + 0.05);
      for (let s = 0; s < n; s++) this.step(b, h, settle ? null : feet, (s + 1) / n);
      b.age += dt;
      if (settle) continue;
      this.events(b, dt);
      // rest
      if (b.grounded && b.v.lengthSq() < 0.0025 && b.w.lengthSq() < 0.25) {
        b.still += dt;
        if (b.still > 0.35) {
          b.awake = false;
          b.v.set(0, 0, 0);
          b.w.set(0, 0, 0);
          if (b.cluster && !b.marked) {
            b.marked = true;
            this.props.markSurface?.(b.p.x, b.p.z, 0.06, 'glass');
          }
          this.markShadows(b.p, true);
        }
      } else b.still = 0;
      // lost below the world: put it back on the ground
      const gy = this.world.groundHeight(b.p.x, b.p.z);
      if (b.p.y < gy - 0.4 || !isFinite(b.p.y)) {
        b.p.y = gy + b.shape.brad;
        if (!isFinite(b.p.x + b.p.z)) b.p.set(0, gy + 0.2, 0);
        b.v.set(0, 0, 0);
        b.w.set(0, 0, 0);
      }
    }
    for (const it of this.pendingBreak) if (it.b.pool) this.shatter(it.b, it.p, it.n, it.v);
    this.pendingBreak.length = 0;
    if (!settle) this.flush();
  }

  /** Write moved bodies into their meshes. */
  flush() {
    for (const b of this.bodies) {
      if (!b.awake && b.drawn) continue;
      b.drawn = true;
      b.orient();
      if (b.pool) b.pool.write(b, this.one);
      else if (b.cluster) b.cluster.write(b.piece, b);
      if (b.pool && b.awake) this.markShadows(b.p, false);
    }
    for (const p of this.pools.values()) p.flush();
    for (const c of this.clusters) c.flush();
    // shadow maps of lamps whose light the moving litter is in (throttled)
    for (const [l, st] of this.lightDirty) {
      st.n++;
      if (st.final || st.n >= 3) {
        this.engine.refreshShadow?.(l.light);
        this.lightDirty.delete(l);
      }
    }
  }

  markShadows(p, final) {
    for (const l of this.lights) {
      const d = l.light.distance || 20;
      if (l.light.position.distanceToSquared(p) > d * d) continue;
      const st = this.lightDirty.get(l);
      if (st) st.final = st.final || final;
      else this.lightDirty.set(l, { n: 0, final });
    }
  }

  /** Gusts nudge the paper cups along the alley. */
  wind(dt, t) {
    const w = this.world.windAt ? this.world.windAt(t) : 0.3;
    const gust = Math.max(0, w - 0.5);
    if (gust <= 0) return;
    const dx = 0.18 * Math.sin(t * 0.05), dz = -1;
    for (const b of this.bodies) {
      if (!b.k.wind) continue;
      if (!b.awake) {
        if (Math.random() < dt * gust * 0.4) b.wake();
        else continue;
      }
      const f = gust * 0.03 * dt * (0.6 + 0.8 * Math.sin(t * 3.1 + b.p.x * 7));
      b.v.x += (dx * f) / b.shape.mass;
      b.v.z += (dz * f) / b.shape.mass;
    }
  }

  /** Bodies against each other (capsules), once per frame. */
  pairs(dt, settle) {
    const B = this.bodies;
    const pa = this._pa ?? (this._pa = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    for (let i = 0; i < B.length; i++) {
      const a = B[i];
      if (!a.awake || a.cluster) continue;
      for (let j = 0; j < B.length; j++) {
        const b = B[j];
        if (b === a || b.cluster || (b.awake && j < i)) continue;
        const rr = a.shape.brad + b.shape.brad;
        if (a.p.distanceToSquared(b.p) > rr * rr) continue;
        a.orient();
        b.orient();
        const A0 = this.seg(a, a.shape.segA, pa[0]), A1 = this.seg(a, a.shape.segB, pa[1]);
        const B0 = this.seg(b, b.shape.segA, pa[2]), B1 = this.seg(b, b.shape.segB, pa[3]);
        const [s, u] = segSeg(A0, A1, B0, B1);
        const qx = A0.x + (A1.x - A0.x) * s, qy = A0.y + (A1.y - A0.y) * s, qz = A0.z + (A1.z - A0.z) * s;
        const wx = B0.x + (B1.x - B0.x) * u, wy = B0.y + (B1.y - B0.y) * u, wz = B0.z + (B1.z - B0.z) * u;
        let nx = wx - qx, ny = wy - qy, nz = wz - qz;
        const d = Math.hypot(nx, ny, nz);
        const pen = a.shape.capR + b.shape.capR - d;
        if (pen <= 0) continue;
        if (d > 1e-6) {
          nx /= d;
          ny /= d;
          nz /= d;
        } else {
          nx = 1;
          ny = 0;
          nz = 0;
        }
        // contact point between the surfaces
        const cx = qx + nx * (a.shape.capR - pen / 2), cy = qy + ny * (a.shape.capR - pen / 2), cz = qz + nz * (a.shape.capR - pen / 2);
        const ima = 1 / a.shape.mass, imb = 1 / b.shape.mass;
        const ra = [cx - a.p.x, cy - a.p.y, cz - a.p.z], rb = [cx - b.p.x, cy - b.p.y, cz - b.p.z];
        const va = pointVel(a, ra), vb = pointVel(b, rb);
        const vn = (vb[0] - va[0]) * nx + (vb[1] - va[1]) * ny + (vb[2] - va[2]) * nz;
        // push apart
        const corr = Math.min(pen, 0.02) / (ima + imb);
        a.p.x -= nx * corr * ima;
        a.p.y -= ny * corr * ima;
        a.p.z -= nz * corr * ima;
        b.p.x += nx * corr * imb;
        b.p.y += ny * corr * imb;
        b.p.z += nz * corr * imb;
        if (vn < 0) {
          const ka = angTerm(a, ra, nx, ny, nz), kb = angTerm(b, rb, nx, ny, nz);
          const J = (-(1 + 0.3) * vn) / (ima + imb + ka + kb);
          a.impulse(-nx * J, -ny * J, -nz * J, ra[0], ra[1], ra[2]);
          b.impulse(nx * J, ny * J, nz * J, rb[0], rb[1], rb[2]);
          b.wake();
          const sp = -vn;
          if (!settle && sp > 0.5) {
            if (a.k.glass && b.k.glass && sp > Math.min(a.breakV, b.breakV)) {
              const p = new THREE.Vector3(cx, cy, cz), n = new THREE.Vector3(nx, ny, nz);
              this.pendingBreak.push({ b: sp > a.breakV ? a : b, p, n, v: sp });
            } else if (this.t - a.lastSnd > 0.06) {
              a.lastSnd = this.t;
              this.sound(a.k.snd, { x: cx, y: cy, z: cz }, Math.min(1.2, sp / 3));
            }
          }
        }
      }
    }
  }

  seg(b, local, out) {
    const R = b.R;
    return out.set(
      b.p.x + R[0] * local.x + R[1] * local.y + R[2] * local.z,
      b.p.y + R[3] * local.x + R[4] * local.y + R[5] * local.z,
      b.p.z + R[6] * local.x + R[7] * local.y + R[8] * local.z,
    );
  }

  // ───────────── one sub-step of one body ─────────────

  step(b, h, feet, frac) {
    const k = b.k;
    b.v.y -= G * h;
    const dr = Math.exp(-k.drag * h);
    b.v.multiplyScalar(dr);
    b.w.multiplyScalar(Math.exp(-0.05 * h));
    b.orient();
    const n = this.contacts(b, feet, frac);
    b.grounded = false;
    if (n) this.solve(b, n, h);
    // integrate
    b.p.addScaledVector(b.v, h);
    const q = b.q, w = b.w;
    const hx = 0.5 * h * w.x, hy = 0.5 * h * w.y, hz = 0.5 * h * w.z;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    q.set(qx + hx * qw + hy * qz - hz * qy, qy + hy * qw + hz * qx - hx * qz, qz + hz * qw + hx * qy - hy * qx, qw - hx * qx - hy * qy - hz * qz).normalize();
  }

  add(b, i, x, y, z, nx, ny, nz, d, kind, soft = false, sx = 0, sy = 0, sz = 0) {
    if (i >= this.C.length) return i;
    const c = this.C[i];
    c.px = x;
    c.py = y;
    c.pz = z;
    c.rx = x - b.p.x;
    c.ry = y - b.p.y;
    c.rz = z - b.p.z;
    c.nx = nx;
    c.ny = ny;
    c.nz = nz;
    c.d = d;
    c.kind = kind;
    c.soft = soft;
    c.sx = sx;
    c.sy = sy;
    c.sz = sz;
    c.mu = kind === FOOT ? 0.45 : soft ? 0.8 : b.k.mu;
    c.e = kind === FOOT ? 0.35 : soft ? 0.05 : b.k.e;
    return i + 1;
  }

  ground(b, i, x, y, z, gnx, gny, gnz) {
    const gh = this.gs ? this.gs.smoothHeight(x, z) : 0;
    const d = (gh - y) * gny;
    if (d <= 0) return i;
    return this.add(b, i, x, y, z, gnx, gny, gnz, d, GROUND);
  }

  contacts(b, feet, frac) {
    const s = b.shape, R = b.R, p = b.p;
    let n = 0;
    // ground plane under the body
    let gnx = 0, gny = 1, gnz = 0;
    if (this.gs) {
      const e = 0.05;
      const h0 = this.gs.smoothHeight(p.x, p.z);
      const gx = (this.gs.smoothHeight(p.x + e, p.z) - h0) / e, gz = (this.gs.smoothHeight(p.x, p.z + e) - h0) / e;
      const l = Math.hypot(gx, 1, gz);
      gnx = -gx / l;
      gny = 1 / l;
      gnz = -gz / l;
    }
    if (s.round) {
      const ax = R[1], ay = R[4], az = R[7];
      let dn = gnx * ax + gny * ay + gnz * az;
      let dx = gnx - dn * ax, dy = gny - dn * ay, dz = gnz - dn * az;
      let dl = Math.hypot(dx, dy, dz);
      if (dl < 1e-6) {
        dx = R[0];
        dy = R[3];
        dz = R[6];
      } else {
        dx /= dl;
        dy /= dl;
        dz /= dl;
      }
      const wx = ay * dz - az * dy, wy = az * dx - ax * dz, wz = ax * dy - ay * dx;
      for (const rg of s.rings) {
        const cx = p.x + R[0] * s.cx + R[1] * rg.y + R[2] * s.cz;
        const cy = p.y + R[3] * s.cx + R[4] * rg.y + R[5] * s.cz;
        const cz = p.z + R[6] * s.cx + R[7] * rg.y + R[8] * s.cz;
        const r = rg.r;
        // the rim point deepest along the ground normal: rolls smoothly, no polygon bumps
        n = this.ground(b, n, cx - r * dx, cy - r * dy, cz - r * dz, gnx, gny, gnz);
        if (dl < 0.5) {
          // nearly flat on an end: three more rim points so it stands
          n = this.ground(b, n, cx + r * dx, cy + r * dy, cz + r * dz, gnx, gny, gnz);
          n = this.ground(b, n, cx + r * wx, cy + r * wy, cz + r * wz, gnx, gny, gnz);
          n = this.ground(b, n, cx - r * wx, cy - r * wy, cz - r * wz, gnx, gny, gnz);
        }
      }
    } else {
      const C = s.corners;
      for (let i = 0; i < 24; i += 3) {
        const x = C[i], y = C[i + 1], z = C[i + 2];
        n = this.ground(b, n, p.x + R[0] * x + R[1] * y + R[2] * z, p.y + R[3] * x + R[4] * y + R[5] * z, p.z + R[6] * x + R[7] * y + R[8] * z, gnx, gny, gnz);
      }
    }
    // walls and props
    if (b.facs.length || b.boxes.length) {
      const S = s.samples, H = this.hit;
      for (let i = 0; i < S.length; i += 3) {
        const x = S[i], y = S[i + 1], z = S[i + 2];
        const wx = p.x + R[0] * x + R[1] * y + R[2] * z, wy = p.y + R[3] * x + R[4] * y + R[5] * z, wz = p.z + R[6] * x + R[7] * y + R[8] * z;
        for (const F of b.facs) if (this.facadeHit(F, wx, wy, wz)) n = this.add(b, n, wx, wy, wz, H.nx, H.ny, H.nz, H.d, WALL);
        for (const T of b.boxes) if (this.boxHit(T, wx, wy, wz)) n = this.add(b, n, wx, wy, wz, H.nx, H.ny, H.nz, H.d, PROP, H.soft);
      }
    }
    // boots: moving spheres against the body's capsule
    if (feet && b.nearFoot) {
      const pa = this._fa ?? (this._fa = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
      const A = this.seg(b, s.segA, pa[0]), Bp = this.seg(b, s.segB, pa[1]);
      const S = pa[2];
      for (const f of feet) {
        S.lerpVectors(f.prev, f.p, frac);
        const ex = Bp.x - A.x, ey = Bp.y - A.y, ez = Bp.z - A.z;
        const ll = ex * ex + ey * ey + ez * ez;
        let t = ll > 1e-9 ? ((S.x - A.x) * ex + (S.y - A.y) * ey + (S.z - A.z) * ez) / ll : 0;
        t = Math.max(0, Math.min(1, t));
        const qx = A.x + ex * t, qy = A.y + ey * t, qz = A.z + ez * t;
        let nx = qx - S.x, ny = qy - S.y, nz = qz - S.z;
        const d = Math.hypot(nx, ny, nz);
        const pen = s.capR + f.r - d;
        if (pen <= 0 || d < 1e-6) continue;
        nx /= d;
        ny /= d;
        nz /= d;
        // a boot comes down on things and slides them along the ground, it does not lift them
        if (ny < 0) {
          ny *= 0.2;
          const l = Math.hypot(nx, ny, nz);
          nx /= l;
          ny /= l;
          nz /= l;
        }
        n = this.add(b, n, qx - nx * s.capR, qy - ny * s.capR, qz - nz * s.capR, nx, ny, nz, Math.min(pen, 0.03), FOOT, false, f.v.x, f.v.y, f.v.z);
      }
    }
    return n;
  }

  solve(b, n, h) {
    const im = 1 / b.shape.mass, I = b.I, v = b.v, w = b.w;
    const C = this.C;
    let gN = 0, gx = 0, gy = 0, gz = 0;
    for (let i = 0; i < n; i++) {
      const c = C[i];
      const { rx, ry, rz, nx, ny, nz } = c;
      c.kn = 1 / (im + angK(I, rx, ry, rz, nx, ny, nz));
      // tangent basis
      let t1x, t1y, t1z;
      if (Math.abs(nx) < 0.9) {
        t1x = 0;
        t1y = nz;
        t1z = -ny;
      } else {
        t1x = -nz;
        t1y = 0;
        t1z = nx;
      }
      const tl = Math.hypot(t1x, t1y, t1z);
      t1x /= tl;
      t1y /= tl;
      t1z /= tl;
      c.t1x = t1x;
      c.t1y = t1y;
      c.t1z = t1z;
      c.t2x = ny * t1z - nz * t1y;
      c.t2y = nz * t1x - nx * t1z;
      c.t2z = nx * t1y - ny * t1x;
      c.kt1 = 1 / (im + angK(I, rx, ry, rz, c.t1x, c.t1y, c.t1z));
      c.kt2 = 1 / (im + angK(I, rx, ry, rz, c.t2x, c.t2y, c.t2z));
      const rvx = v.x + w.y * rz - w.z * ry - c.sx, rvy = v.y + w.z * rx - w.x * rz - c.sy, rvz = v.z + w.x * ry - w.y * rx - c.sz;
      const vn = rvx * nx + rvy * ny + rvz * nz;
      c.bias = vn < -0.45 ? -c.e * vn : 0;
      const pen = c.d - SLOP;
      if (pen > 0) c.bias = Math.max(c.bias, Math.min(0.6, (0.25 * pen) / h));
      c.Pn = c.P1 = c.P2 = 0;
      // the hardest approach this frame: sounds, breakage
      if (c.kind === FOOT) b.kick = Math.max(b.kick, -vn);
      else if (-vn > b.imp) {
        b.imp = -vn;
        b.impP.set(c.px, c.py, c.pz);
        b.impN.set(nx, ny, nz);
        b.impSoft = c.soft;
        b.impKind = c.kind;
      }
      if (c.kind === GROUND) {
        gN++;
        gx += nx;
        gy += ny;
        gz += nz;
      }
    }
    for (let it = 0; it < ITER; it++)
      for (let i = 0; i < n; i++) {
        const c = C[i];
        const { rx, ry, rz, nx, ny, nz } = c;
        let rvx = v.x + w.y * rz - w.z * ry - c.sx, rvy = v.y + w.z * rx - w.x * rz - c.sy, rvz = v.z + w.x * ry - w.y * rx - c.sz;
        const vn = rvx * nx + rvy * ny + rvz * nz;
        let dP = (c.bias - vn) * c.kn;
        const P0 = c.Pn;
        c.Pn = Math.max(0, P0 + dP);
        dP = c.Pn - P0;
        if (dP !== 0) b.impulse(nx * dP, ny * dP, nz * dP, rx, ry, rz);
        // Coulomb friction (circular cone)
        rvx = v.x + w.y * rz - w.z * ry - c.sx;
        rvy = v.y + w.z * rx - w.x * rz - c.sy;
        rvz = v.z + w.x * ry - w.y * rx - c.sz;
        const v1 = rvx * c.t1x + rvy * c.t1y + rvz * c.t1z, v2 = rvx * c.t2x + rvy * c.t2y + rvz * c.t2z;
        let n1 = c.P1 - v1 * c.kt1, n2 = c.P2 - v2 * c.kt2;
        const lim = c.mu * c.Pn, l = Math.hypot(n1, n2);
        if (l > lim) {
          n1 *= lim / l;
          n2 *= lim / l;
        }
        const d1 = n1 - c.P1, d2 = n2 - c.P2;
        c.P1 = n1;
        c.P2 = n2;
        if (d1 !== 0 || d2 !== 0) b.impulse(c.t1x * d1 + c.t2x * d2, c.t1y * d1 + c.t2y * d2, c.t1z * d1 + c.t2z * d2, rx, ry, rz);
      }
    if (gN) {
      b.grounded = true;
      const l = Math.hypot(gx, gy, gz) || 1;
      gx /= l;
      gy /= l;
      gz /= l;
      // rolling resistance: a constant drag on the rolling motion, both linear and angular
      const vn = v.x * gx + v.y * gy + v.z * gz;
      const tx = v.x - gx * vn, ty = v.y - gy * vn, tz = v.z - gz * vn;
      const sp = Math.hypot(tx, ty, tz);
      const dv = b.k.roll * G * h;
      const f = sp > dv ? (sp - dv) / sp : 0;
      v.x -= tx * (1 - f);
      v.y -= ty * (1 - f);
      v.z -= tz * (1 - f);
      const wn = w.x * gx + w.y * gy + w.z * gz;
      // spin about the contact normal dies quickly (scrubbing contact patch)
      const fs = Math.exp(-5 * h);
      w.x = (w.x - gx * wn) * f + gx * wn * fs;
      w.y = (w.y - gy * wn) * f + gy * wn * fs;
      w.z = (w.z - gz * wn) * f + gz * wn * fs;
    }
  }

  /** Sounds and breakage for what happened to a body this frame. */
  events(b, dt) {
    const t = this.t;
    if (b.kick > 0.35 && t - b.lastSnd > 0.08) {
      b.lastSnd = t;
      this.sound(b.k.snd, b.p, Math.min(1.2, 0.25 + b.kick / 3), false, { kick: true });
    }
    if (b.imp > 0.3) {
      if (b.k.glass && !b.impSoft && b.imp > b.breakV && b.pool) {
        this.pendingBreak.push({ b, p: b.impP.clone(), n: b.impN.clone(), v: b.imp });
        return;
      }
      if (t - b.lastSnd > 0.05) {
        b.lastSnd = t;
        const st = Math.min(1.2, b.imp / (b.cluster ? 2.5 : 3.5));
        if (b.impSoft) this.sound('cupTap', b.impP, st * 0.6);
        else this.sound(b.k.snd, b.impP, st);
        if (b.impKind === GROUND && b.imp > 0.8) this.splash(b.impP, Math.min(1, b.imp / 5));
      }
    }
    // rolling along the ground
    const rs = b.k.rollSnd;
    if (rs && b.grounded && t > b.rollUntil) {
      const sp = Math.hypot(b.v.x, b.v.z);
      if (sp > 0.3 && b.w.length() * b.shape.capR > sp * 0.6) {
        const dur = Math.min(4, sp / (b.k.roll * G));
        b.rollUntil = t + dur * 0.9;
        this.sound(rs, b.p, Math.min(1, sp / 2.5), false, { duration: dur, gain: Math.min(1, 0.35 + sp / 3) });
      }
    }
  }
}

// ───────────────────────── helpers ─────────────────────────

/** n·(I (r×n)) × r  =  (r×n)·I(r×n) for a symmetric world inverse inertia I. */
function angK(I, rx, ry, rz, nx, ny, nz) {
  const ax = ry * nz - rz * ny, ay = rz * nx - rx * nz, az = rx * ny - ry * nx;
  const bx = I[0] * ax + I[1] * ay + I[2] * az, by = I[3] * ax + I[4] * ay + I[5] * az, bz = I[6] * ax + I[7] * ay + I[8] * az;
  return ax * bx + ay * by + az * bz;
}

function angTerm(b, r, nx, ny, nz) {
  return angK(b.I, r[0], r[1], r[2], nx, ny, nz);
}

function pointVel(b, r) {
  const v = b.v, w = b.w;
  return [v.x + w.y * r[2] - w.z * r[1], v.y + w.z * r[0] - w.x * r[2], v.z + w.x * r[1] - w.y * r[0]];
}

/** Closest points between segments P0P1 and Q0Q1: returns [s, t] parameters. */
function segSeg(P0, P1, Q0, Q1) {
  const ux = P1.x - P0.x, uy = P1.y - P0.y, uz = P1.z - P0.z;
  const vx = Q1.x - Q0.x, vy = Q1.y - Q0.y, vz = Q1.z - Q0.z;
  const wx = P0.x - Q0.x, wy = P0.y - Q0.y, wz = P0.z - Q0.z;
  const a = ux * ux + uy * uy + uz * uz, b = ux * vx + uy * vy + uz * vz, c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz, e = vx * wx + vy * wy + vz * wz;
  const D = a * c - b * b;
  let s, t;
  if (a < 1e-9 && c < 1e-9) return [0, 0];
  if (a < 1e-9) return [0, Math.max(0, Math.min(1, e / c))];
  if (c < 1e-9) return [Math.max(0, Math.min(1, -d / a)), 0];
  s = D > 1e-9 ? Math.max(0, Math.min(1, (b * e - c * d) / D)) : 0;
  t = (b * s + e) / c;
  if (t < 0) {
    t = 0;
    s = Math.max(0, Math.min(1, -d / a));
  } else if (t > 1) {
    t = 1;
    s = Math.max(0, Math.min(1, (b - d) / a));
  }
  return [s, t];
}
