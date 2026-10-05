// Verlet-particle ragdolls. A humanoid rig is converted into 22 particles linked by distance
// constraints; the rig's meshes are re-parented and driven by frames computed from the particles.
// Limbs and heads are attached via breakable joints for stylized dismemberment.
import * as THREE from 'three';
import { TILE } from '../world/constants.js';

export const J = {
  pelvis: 0, chest: 1, neck: 2, headBase: 3, headTop: 4, headFront: 5,
  shoulderL: 6, armRootL: 7, elbowL: 8, handL: 9,
  shoulderR: 10, armRootR: 11, elbowR: 12, handR: 13,
  hipL: 14, legRootL: 15, kneeL: 16, footL: 17,
  hipR: 18, legRootR: 19, kneeR: 20, footR: 21,
};

const RADII = [0.16, 0.17, 0.1, 0.1, 0.11, 0.1, 0.09, 0.08, 0.07, 0.07, 0.09, 0.08, 0.07, 0.07, 0.1, 0.09, 0.08, 0.08, 0.1, 0.09, 0.08, 0.08];
// heavier trunk, lighter extremities: limbs follow the body instead of dragging it around
const INV_MASS = [0.35, 0.35, 0.6, 0.8, 0.8, 0.8, 0.6, 0.7, 0.9, 1.1, 0.6, 0.7, 0.9, 1.1, 0.5, 0.6, 0.8, 1, 0.5, 0.6, 0.8, 1];

// Constraint table: [a, b, lo, hi, joint]. lo/hi are multiples of the rest length (from the neutral pose);
// 1,1 is a rigid bone, lo..Infinity only pushes apart. A joint name marks links that break on dismemberment.
const R = (a, b, joint) => [a, b, 1, 1, joint];
const RANGE = (a, b, lo, hi, joint) => [a, b, lo, hi, joint];
const LINKS = [
  // upper trunk (chest, neck, shoulders) and lower trunk (pelvis, hips) are solid blocks
  R('chest', 'neck'), R('chest', 'shoulderL'), R('chest', 'shoulderR'), R('neck', 'shoulderL'), R('neck', 'shoulderR'), R('shoulderL', 'shoulderR'),
  R('pelvis', 'hipL'), R('pelvis', 'hipR'), R('hipL', 'hipR'),
  // spine: stiff, with a little bend and twist
  R('pelvis', 'chest'), R('hipL', 'chest'), R('hipR', 'chest'),
  RANGE('pelvis', 'neck', 0.97, 1.0), RANGE('shoulderL', 'hipL', 0.93, 1.03), RANGE('shoulderR', 'hipR', 0.93, 1.03),
  RANGE('shoulderL', 'hipR', 0.95, 1.04), RANGE('shoulderR', 'hipL', 0.95, 1.04),
  // skull is one rigid piece on a stiff neck that only nods and turns a little
  R('headBase', 'headTop'), R('headBase', 'headFront'), R('headTop', 'headFront'),
  R('neck', 'headBase', 'head'),
  RANGE('chest', 'headTop', 0.93, 1.02, 'head'), RANGE('shoulderL', 'headTop', 0.88, 1.08, 'head'), RANGE('shoulderR', 'headTop', 0.88, 1.08, 'head'),
  RANGE('chest', 'headFront', 0.9, 1.06, 'head'), RANGE('shoulderL', 'headFront', 0.86, 1.1, 'head'), RANGE('shoulderR', 'headFront', 0.86, 1.1, 'head'),
  // shoulder sockets pinned to the trunk
  RANGE('shoulderL', 'armRootL', 0, 3, 'armL'), R('chest', 'armRootL', 'armL'), R('neck', 'armRootL', 'armL'), R('shoulderR', 'armRootL', 'armL'),
  RANGE('shoulderR', 'armRootR', 0, 3, 'armR'), R('chest', 'armRootR', 'armR'), R('neck', 'armRootR', 'armR'), R('shoulderL', 'armRootR', 'armR'),
  // arm bones
  R('armRootL', 'elbowL'), R('elbowL', 'handL'), R('armRootR', 'elbowR'), R('elbowR', 'handR'),
  // hip sockets pinned to the pelvis
  RANGE('hipL', 'legRootL', 0, 3, 'legL'), R('pelvis', 'legRootL', 'legL'), R('hipR', 'legRootL', 'legL'), R('chest', 'legRootL', 'legL'),
  RANGE('hipR', 'legRootR', 0, 3, 'legR'), R('pelvis', 'legRootR', 'legR'), R('hipL', 'legRootR', 'legR'), R('chest', 'legRootR', 'legR'),
  // leg bones
  R('legRootL', 'kneeL'), R('kneeL', 'footL'), R('legRootR', 'kneeR'), R('kneeR', 'footR'),
  // keep limbs out of each other and out of the body
  RANGE('footL', 'footR', 0.5, Infinity), RANGE('kneeL', 'kneeR', 0.55, Infinity),
  RANGE('handL', 'chest', 0.45, Infinity), RANGE('handR', 'chest', 0.45, Infinity),
  RANGE('handL', 'pelvis', 0.35, Infinity), RANGE('handR', 'pelvis', 0.35, Infinity),
  RANGE('elbowL', 'chest', 0.6, Infinity), RANGE('elbowR', 'chest', 0.6, Infinity),
  RANGE('kneeL', 'chest', 0.55, Infinity), RANGE('kneeR', 'chest', 0.55, Infinity),
  RANGE('footL', 'pelvis', 0.45, Infinity), RANGE('footR', 'pelvis', 0.45, Infinity),
];

// Hinges: [root, mid, end, kind, part]. Elbows fold forward, knees fold backward, neither hyperextends.
const HINGES = [
  ['armRootL', 'elbowL', 'handL', 'elbow', 'armL'], ['armRootR', 'elbowR', 'handR', 'elbow', 'armR'],
  ['legRootL', 'kneeL', 'footL', 'knee', 'legL'], ['legRootR', 'kneeR', 'footR', 'knee', 'legR'],
];
const HINGE_MAX = { elbow: -0.87, knee: -0.9 }; // cosine of the tightest fold (~150 / 155 degrees)

// Ball-joint swing limits in the trunk frame, as bounds on the limb direction's components:
// out = away from the body's midline, fwd = facing direction, up = along the spine.
const SWING = {
  shoulder: { out: [-0.45, 1], fwd: [-0.7, 1], up: [-1, 1] },
  hip: { out: [-0.3, 0.8], fwd: [-0.5, 1], up: [-1, 0.5] },
};
const CONES = [
  ['armRootL', 'elbowL', 'shoulder', 1, 'armL'], ['armRootR', 'elbowR', 'shoulder', -1, 'armR'],
  ['legRootL', 'kneeL', 'hip', 1, 'legL'], ['legRootR', 'kneeR', 'hip', -1, 'legR'],
];

// part frames: [name, origin joint, y-axis target joint, mode]
export const FRAMES = {
  pelvis: ['pelvis', 'chest', 'pelvis'],
  torso: ['pelvis', 'neck', 'torso'],
  head: ['headBase', 'headTop', 'head'],
  upperArmL: ['armRootL', 'elbowL', 'limb'],
  foreArmL: ['elbowL', 'handL', 'limb'],
  upperArmR: ['armRootR', 'elbowR', 'limb'],
  foreArmR: ['elbowR', 'handR', 'limb'],
  thighL: ['legRootL', 'kneeL', 'limb'],
  shinL: ['kneeL', 'footL', 'limb'],
  thighR: ['legRootR', 'kneeR', 'limb'],
  shinR: ['kneeR', 'footR', 'limb'],
};

export const SEVER = {
  head: { joint: 'head', stumpA: 'neck', stumpB: 'headBase' },
  armL: { joint: 'armL', stumpA: 'shoulderL', stumpB: 'armRootL' },
  armR: { joint: 'armR', stumpA: 'shoulderR', stumpB: 'armRootR' },
  legL: { joint: 'legL', stumpA: 'hipL', stumpB: 'legRootL' },
  legR: { joint: 'legR', stumpA: 'hipR', stumpB: 'legRootR' },
};

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _l = new THREE.Vector3();
const _u = new THREE.Vector3();
const _f = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Ragdoll {
  // joints: array of 22 Vector3 world positions; parts: [{mesh, frame}]
  constructor(scene, joints, parts, vel, opts = {}) {
    this.scene = scene;
    const n = joints.length;
    this.n = n;
    this.pos = joints.map((p) => p.clone());
    this.prev = joints.map((p) => p.clone().addScaledVector(vel, -1 / 60));
    this.radius = RADII.map((r) => r * (opts.scale || 1));
    this.inv = Float32Array.from(INV_MASS);
    this.contact = new Uint8Array(n); // resting on the floor during the last collision pass
    // rest lengths come from the neutral pose so the body keeps its proportions whatever pose it died in
    const rest = opts.rest || joints;
    this.constraints = [];
    for (const [a, b, lo, hi, joint] of LINKS) {
      const ia = J[a], ib = J[b];
      const len = rest[ia].distanceTo(rest[ib]);
      this.constraints.push({ a: ia, b: ib, lo: len * lo, hi: len * hi, joint: joint || null, broken: false });
    }
    this.hinges = HINGES.map(([r, m, e, kind, part]) => ({ r: J[r], m: J[m], e: J[e], cos: HINGE_MAX[kind], knee: kind === 'knee', part, f: new THREE.Vector3(0, 0, 1) }));
    this.cones = CONES.map(([r, e, kind, side, part]) => ({ r: J[r], e: J[e], lim: SWING[kind], side, part, trunk: kind === 'shoulder' }));
    this.severed = new Set();
    this.sleeping = false;
    this.still = 0;
    this.lastMove = 1;
    this.checkT = 0;
    this.settled = 0;
    this.checkPos = joints.map((p) => p.clone());
    this.age = 0;
    this.owner = opts.owner || null;
    this.groundFriction = opts.friction ?? 0.72;

    // frames & parts
    this.frameState = {};
    for (const key of Object.keys(FRAMES)) this.frameState[key] = { x: new THREE.Vector3(1, 0, 0), m: new THREE.Matrix4() };
    // initialise twist references from the torso orientation
    this._torsoBasis();
    for (const key of Object.keys(FRAMES)) this.frameState[key].x.copy(this._tx);
    this.parts = [];
    for (const { mesh, frame } of parts) {
      const fm = this._frame(frame);
      mesh.updateWorldMatrix(true, false);
      const offset = new THREE.Matrix4().copy(fm).invert().multiply(mesh.matrixWorld);
      const saved = { parent: mesh.parent, position: mesh.position.clone(), quaternion: mesh.quaternion.clone(), scale: mesh.scale.clone() };
      scene.add(mesh);
      mesh.matrixAutoUpdate = false;
      this.parts.push({ mesh, frame, offset, saved });
    }
    this.sync();
  }

  _torsoBasis() {
    const P = this.pos;
    this._ty = this._ty || new THREE.Vector3();
    this._tx = this._tx || new THREE.Vector3();
    this._tz = this._tz || new THREE.Vector3();
    this._ty.subVectors(P[J.neck], P[J.pelvis]).normalize();
    this._tx.subVectors(P[J.shoulderR], P[J.shoulderL]);
    this._tx.addScaledVector(this._ty, -this._tx.dot(this._ty)).normalize();
    this._tz.crossVectors(this._tx, this._ty);
  }

  _frame(name) {
    const [oa, ob, mode] = FRAMES[name];
    const P = this.pos;
    const st = this.frameState[name];
    const o = P[J[oa]];
    _y.subVectors(P[J[ob]], o);
    if (_y.lengthSq() < 1e-8) _y.set(0, 1, 0);
    _y.normalize();
    if (mode === 'torso' || mode === 'pelvis') {
      if (mode === 'torso') _x.subVectors(P[J.shoulderR], P[J.shoulderL]);
      else _x.subVectors(P[J.hipR], P[J.hipL]);
    } else if (mode === 'head') {
      _z.subVectors(P[J.headFront], P[J.headBase]);
      _x.crossVectors(_y, _z);
    } else {
      _x.copy(st.x);
    }
    _x.addScaledVector(_y, -_x.dot(_y));
    if (_x.lengthSq() < 1e-6) _x.copy(st.x).addScaledVector(_y, -st.x.dot(_y));
    if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0).addScaledVector(_y, -_y.x);
    _x.normalize();
    st.x.copy(_x);
    _z.crossVectors(_x, _y);
    st.m.makeBasis(_x, _y, _z).setPosition(o);
    return st.m;
  }

  sever(part) {
    const s = SEVER[part];
    if (!s || this.severed.has(part)) return null;
    this.severed.add(part);
    for (const c of this.constraints) if (c.joint === s.joint) c.broken = true;
    // non-structural spacing links that cross the cut
    const side = part.endsWith('L') ? 'L' : part.endsWith('R') ? 'R' : '';
    const names = Object.keys(J);
    for (const c of this.constraints) {
      if (c.hi !== Infinity) continue;
      const an = names[c.a], bn = names[c.b];
      const touches = (pre) => (an.startsWith(pre) && an.endsWith(side)) || (bn.startsWith(pre) && bn.endsWith(side));
      if (part.startsWith('arm') && (touches('hand') || touches('elbow'))) c.broken = true;
      if (part.startsWith('leg') && (touches('foot') || touches('knee'))) c.broken = true;
    }
    this.wake();
    return { a: J[s.stumpA], b: J[s.stumpB] };
  }

  wake() {
    this.sleeping = false;
    this.still = 0;
    this.lastMove = 1;
    this.settled = 0;
  }

  // Add velocity to particles near a world point.
  impulse(point, vel, radius = 0.6, falloff = true) {
    this.wake();
    for (let i = 0; i < this.n; i++) {
      const d = this.pos[i].distanceTo(point);
      if (d > radius) continue;
      const k = falloff ? 1 - d / radius : 1;
      this.prev[i].addScaledVector(vel, (-k * this.inv[i]) / 60);
    }
  }

  impulseAll(vel) {
    this.wake();
    for (let i = 0; i < this.n; i++) this.prev[i].addScaledVector(vel, -1 / 60);
  }

  nearest(point) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.n; i++) {
      const d = this.pos[i].distanceToSquared(point);
      if (d < bd) { bd = d; best = i; }
    }
    return [best, Math.sqrt(bd)];
  }

  center(out = new THREE.Vector3()) {
    return out.copy(this.pos[J.chest]);
  }

  step(dt, world, obstacles) {
    if (this.sleeping) return;
    this.age += dt;
    const P = this.pos, Q = this.prev;
    const g = -20 * dt * dt;
    // once the body has mostly come to rest, bleed off the last creeping and twitching quickly
    const damp = this.lastMove < 0.012 && this.touching ? 0.85 : 0.99;
    let maxMove = 0;
    for (let i = 0; i < this.n; i++) {
      const p = P[i], q = Q[i];
      const vx = (p.x - q.x) * damp, vy = (p.y - q.y) * damp, vz = (p.z - q.z) * damp;
      q.copy(p);
      p.x += vx;
      p.y += vy + g;
      p.z += vz;
      maxMove = Math.max(maxMove, Math.abs(vx) + Math.abs(vy) + Math.abs(vz));
    }
    this.touching = false;
    for (let it = 0; it < 12; it++) {
      this._solveLinks();
      this._solveCones();
      this._solveHinges();
      this._solveLinks();
      this._collide(world, obstacles);
    }
    this.lastMove = maxMove;
    if (maxMove < 0.003) {
      this.still += dt;
      if (this.still > 0.7) this.sleeping = true;
    } else this.still = 0;
    // slower test: a body that is only twitching in place (joint limits arguing with the floor) also settles
    this.checkT += dt;
    if (this.checkT >= 0.25) {
      this.checkT = 0;
      let moved = 0;
      for (let i = 0; i < this.n; i++) { moved = Math.max(moved, P[i].distanceToSquared(this.checkPos[i])); this.checkPos[i].copy(P[i]); }
      this.settled = this.touching && moved < 0.012 * 0.012 ? this.settled + 1 : 0;
      if (this.settled >= 3) this.sleeping = true;
    }
  }

  _solveLinks() {
    const P = this.pos, inv = this.inv, con = this.contact;
    for (const c of this.constraints) {
      if (c.broken) continue;
      const a = P[c.a], b = P[c.b];
      _v.subVectors(b, a);
      const d = _v.length();
      if (d < 1e-6) continue;
      let target;
      if (d < c.lo) target = c.lo;
      else if (d > c.hi) target = c.hi;
      else continue;
      const wa = inv[c.a] * (con[c.a] ? 0.3 : 1), wb = inv[c.b] * (con[c.b] ? 0.3 : 1);
      const diff = (d - target) / (d * (wa + wb));
      a.addScaledVector(_v, diff * wa);
      b.addScaledVector(_v, -diff * wb);
    }
  }

  // trunk frame: left (toward the body's left), up (along the spine), fwd (facing)
  _trunk(upper) {
    const P = this.pos;
    if (upper) { _l.subVectors(P[J.shoulderL], P[J.shoulderR]); _u.subVectors(P[J.neck], P[J.pelvis]); }
    else { _l.subVectors(P[J.hipL], P[J.hipR]); _u.subVectors(P[J.chest], P[J.pelvis]); }
    _u.normalize();
    _l.addScaledVector(_u, -_l.dot(_u)).normalize();
    _f.crossVectors(_l, _u);
  }

  _solveCones() {
    const P = this.pos;
    let frame = 0;
    for (const c of this.cones) {
      if (this.severed.has(c.part) || (this.contact[c.e] && this.contact[c.r])) continue;
      const want = c.trunk ? 1 : 2;
      if (frame !== want) { this._trunk(c.trunk); frame = want; }
      const r = P[c.r], e = P[c.e];
      _d.subVectors(e, r);
      const len = _d.length();
      if (len < 1e-6) continue;
      _d.divideScalar(len);
      let out = _d.dot(_l) * c.side, up = _d.dot(_u), fwd = _d.dot(_f);
      const L = c.lim;
      const o2 = Math.min(L.out[1], Math.max(L.out[0], out)), u2 = Math.min(L.up[1], Math.max(L.up[0], up)), f2 = Math.min(L.fwd[1], Math.max(L.fwd[0], fwd));
      if (o2 === out && u2 === up && f2 === fwd) continue;
      out = o2; up = u2; fwd = f2;
      _d.set(0, 0, 0).addScaledVector(_l, out * c.side).addScaledVector(_u, up).addScaledVector(_f, fwd);
      if (_d.lengthSq() < 1e-8) continue;
      _d.normalize();
      const k = this.contact[c.e] ? 0.1 : 0.5;
      e.x += (r.x + _d.x * len - e.x) * k;
      e.y += (r.y + _d.y * len - e.y) * k;
      e.z += (r.z + _d.z * len - e.z) * k;
    }
  }

  _solveHinges() {
    const P = this.pos;
    let frame = 0;
    for (const h of this.hinges) {
      const free = this.severed.has(h.part);
      const want = h.knee ? 2 : 1;
      if (!free && frame !== want) { this._trunk(!h.knee); frame = want; }
      // a limb lying on the floor is shaped by the floor
      if (this.contact[h.m] && this.contact[h.e]) continue;
      const r = P[h.r], m = P[h.m], e = P[h.e];
      _d.subVectors(m, r);
      const ul = _d.length();
      if (ul < 1e-6) continue;
      _d.divideScalar(ul); // upper segment direction
      // preferred fold direction, perpendicular to the upper segment
      if (free) _x.copy(h.f);
      else if (h.knee) _x.crossVectors(_l, _d);
      else {
        _x.crossVectors(_d, _l);
        // arm raised out sideways: fold toward the front instead
        const w = Math.max(0, 1 - _x.length() * 2);
        if (w > 0) _x.addScaledVector(_f, w);
      }
      _x.addScaledVector(_d, -_x.dot(_d));
      if (_x.lengthSq() < 1e-8) continue;
      _x.normalize();
      h.f.copy(_x);
      _z.crossVectors(_d, _x); // hinge axis
      _y.subVectors(e, m);
      const sl = _y.length();
      if (sl < 1e-6) continue;
      // stay near the hinge plane (a little give stands in for hip/shoulder roll)
      const sk = _y.dot(_z), slack = sl * 0.22;
      if (sk > slack) _y.addScaledVector(_z, slack - sk);
      else if (sk < -slack) _y.addScaledVector(_z, -slack - sk);
      // never bend backward past straight
      const sf = _y.dot(_x) + sl * 0.03;
      if (sf < 0) _y.addScaledVector(_x, -sf);
      // limit the tightest fold
      _y.normalize();
      const cu = _y.dot(_d);
      if (cu < h.cos) {
        const sn = Math.sqrt(1 - h.cos * h.cos);
        _y.copy(_d).multiplyScalar(h.cos).addScaledVector(_x, sn);
      }
      const tx = m.x + _y.x * sl - e.x, ty = m.y + _y.y * sl - e.y, tz = m.z + _y.z * sl - e.z;
      // a hand or foot planted on the floor holds still and the joint above gives way instead
      const we = this.contact[h.e] ? 0.1 : 0.75, wm = this.contact[h.m] ? 0 : 0.25;
      e.x += tx * we; e.y += ty * we; e.z += tz * we;
      m.x -= tx * wm; m.y -= ty * wm; m.z -= tz * wm;
    }
  }

  _collide(world, obstacles) {
    const P = this.pos, Q = this.prev;
    for (let i = 0; i < this.n; i++) {
      const p = P[i];
      const r = this.radius[i];
      const fy = world.floorAt(p.x, p.z);
      this.contact[i] = p.y < fy + r + 0.01 ? 1 : 0;
      if (p.y < fy + r) {
        p.y = fy + r;
        this.touching = true;
        // ground friction
        const q = Q[i];
        q.x = p.x - (p.x - q.x) * this.groundFriction;
        q.z = p.z - (p.z - q.z) * this.groundFriction;
        // bones thud, they don't bounce
        if (q.y > p.y) q.y = p.y;
      }
      const cy = world.ceilAt(p.x, p.z);
      if (p.y > cy - r) {
        // drifting sideways under a lower ceiling (a corridor lintel) is a wall, not a ceiling
        if (Q[i].y > cy - r) { p.x = Q[i].x; p.z = Q[i].z; } else p.y = cy - r;
      }
      world.collideCircle(p, r);
      if (obstacles) obstacles(p, r, Q[i]);
      // keep things out of the walls even in sub-tile glitches (fall back to where it just was)
      const cx = Math.floor(p.x / TILE), cz = Math.floor(p.z / TILE);
      if (world.solidCell(cx, cz) && !world.solidAt(Q[i].x, Q[i].z)) p.copy(Q[i]);
    }
  }

  sync() {
    if (this.sleeping && this._synced) return;
    this._synced = this.sleeping;
    const cache = {};
    for (const part of this.parts) {
      const fm = cache[part.frame] || (cache[part.frame] = this._frame(part.frame).clone());
      part.mesh.matrix.multiplyMatrices(fm, part.offset);
      part.mesh.matrixWorldNeedsUpdate = true;
    }
  }

  // Give meshes back to their rig (used when a knocked-down enemy stands up).
  restore() {
    for (const part of this.parts) {
      const { mesh, saved } = part;
      saved.parent.add(mesh);
      mesh.position.copy(saved.position);
      mesh.quaternion.copy(saved.quaternion);
      mesh.scale.copy(saved.scale);
      mesh.matrixAutoUpdate = true;
    }
    this.parts.length = 0;
  }

  dispose() {
    for (const part of this.parts) part.mesh.removeFromParent();
    this.parts.length = 0;
  }

  // torso facing yaw (for getting up)
  yaw() {
    this._torsoBasis();
    // when lying on the back, the chest normal points up; use torso up-vector projected to ground
    return Math.atan2(this._ty.x, this._ty.z);
  }

  faceUp() {
    this._torsoBasis();
    return this._tz.y > 0;
  }
}

// Shared helper for the sever-able part lookup by frame
export function partOfFrame(frame) {
  if (frame === 'head') return 'head';
  if (frame === 'upperArmL' || frame === 'foreArmL') return 'armL';
  if (frame === 'upperArmR' || frame === 'foreArmR') return 'armR';
  if (frame === 'thighL' || frame === 'shinL') return 'legL';
  if (frame === 'thighR' || frame === 'shinR') return 'legR';
  return null;
}
