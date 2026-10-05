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

// [a, b, stiffness, kind]  kind: 'rigid' | 'min' (only pushes apart) | joint name for breakable
const LINKS = [
  ['pelvis', 'chest', 1], ['chest', 'neck', 1], ['pelvis', 'neck', 1],
  ['neck', 'shoulderL', 1], ['neck', 'shoulderR', 1], ['shoulderL', 'shoulderR', 1],
  ['chest', 'shoulderL', 1], ['chest', 'shoulderR', 1],
  ['pelvis', 'hipL', 1], ['pelvis', 'hipR', 1], ['hipL', 'hipR', 1],
  ['chest', 'hipL', 1], ['chest', 'hipR', 1], ['shoulderL', 'hipL', 0.6], ['shoulderR', 'hipR', 0.6],
  ['shoulderL', 'hipR', 0.4], ['shoulderR', 'hipL', 0.4],
  // head (rigid triangle) + neck joint
  ['headBase', 'headTop', 1], ['headBase', 'headFront', 1], ['headTop', 'headFront', 1],
  ['neck', 'headBase', 1, 'head'], ['chest', 'headBase', 0.5, 'head'], ['shoulderL', 'headTop', 0.25, 'head'], ['shoulderR', 'headTop', 0.25, 'head'],
  // arms
  ['shoulderL', 'armRootL', 1, 'armL'], ['armRootL', 'elbowL', 1], ['elbowL', 'handL', 1], ['chest', 'armRootL', 0.6, 'armL'],
  ['shoulderR', 'armRootR', 1, 'armR'], ['armRootR', 'elbowR', 1], ['elbowR', 'handR', 1], ['chest', 'armRootR', 0.6, 'armR'],
  // legs
  ['hipL', 'legRootL', 1, 'legL'], ['legRootL', 'kneeL', 1], ['kneeL', 'footL', 1], ['pelvis', 'legRootL', 0.6, 'legL'],
  ['hipR', 'legRootR', 1, 'legR'], ['legRootR', 'kneeR', 1], ['kneeR', 'footR', 1], ['pelvis', 'legRootR', 0.6, 'legR'],
];
// prevent limbs folding completely
const MIN_LINKS = [
  ['armRootL', 'handL', 0.55], ['armRootR', 'handR', 0.55], ['legRootL', 'footL', 0.6], ['legRootR', 'footR', 0.6],
  ['headTop', 'chest', 0.9], ['footL', 'footR', 0.25], ['kneeL', 'kneeR', 0.4], ['handL', 'chest', 0.4], ['handR', 'chest', 0.4],
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

export class Ragdoll {
  // joints: array of 22 Vector3 world positions; parts: [{mesh, frame}]
  constructor(scene, joints, parts, vel, opts = {}) {
    this.scene = scene;
    const n = joints.length;
    this.n = n;
    this.pos = joints.map((p) => p.clone());
    this.prev = joints.map((p) => p.clone().addScaledVector(vel, -1 / 60));
    this.radius = RADII.map((r) => r * (opts.scale || 1));
    this.inv = new Float32Array(n).fill(1);
    this.inv[J.pelvis] = 0.6;
    this.inv[J.chest] = 0.6;
    this.constraints = [];
    for (const [a, b, k, joint] of LINKS) {
      const ia = J[a], ib = J[b];
      this.constraints.push({ a: ia, b: ib, len: this.pos[ia].distanceTo(this.pos[ib]), k, joint: joint || null, broken: false, min: false });
    }
    for (const [a, b, f] of MIN_LINKS) {
      const ia = J[a], ib = J[b];
      this.constraints.push({ a: ia, b: ib, len: this.pos[ia].distanceTo(this.pos[ib]) * f, k: 0.5, joint: null, broken: false, min: true });
    }
    this.severed = new Set();
    this.sleeping = false;
    this.still = 0;
    this.age = 0;
    this.owner = opts.owner || null;
    this.groundFriction = opts.friction ?? 0.82;

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
    // remove min-links that cross the cut
    for (const c of this.constraints) {
      if (!c.min) continue;
      const names = Object.keys(J);
      const an = names[c.a], bn = names[c.b];
      const side = part.endsWith('L') ? 'L' : part.endsWith('R') ? 'R' : '';
      if (part === 'head' && (an.startsWith('head') || bn.startsWith('head'))) c.broken = true;
      if (part.startsWith('arm') && ((an.startsWith('hand') && an.endsWith(side)) || (bn.startsWith('hand') && bn.endsWith(side)))) c.broken = true;
      if (part.startsWith('leg') && (an.startsWith('foot') || bn.startsWith('foot') || an.startsWith('knee') || bn.startsWith('knee'))) c.broken = true;
    }
    this.wake();
    return { a: J[s.stumpA], b: J[s.stumpB] };
  }

  wake() {
    this.sleeping = false;
    this.still = 0;
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
    let maxMove = 0;
    for (let i = 0; i < this.n; i++) {
      const p = P[i], q = Q[i];
      const vx = (p.x - q.x) * 0.995, vy = (p.y - q.y) * 0.995, vz = (p.z - q.z) * 0.995;
      q.copy(p);
      p.x += vx;
      p.y += vy + g;
      p.z += vz;
      maxMove = Math.max(maxMove, Math.abs(vx) + Math.abs(vy) + Math.abs(vz));
    }
    for (let it = 0; it < 8; it++) {
      for (const c of this.constraints) {
        if (c.broken) continue;
        const a = P[c.a], b = P[c.b];
        _v.subVectors(b, a);
        const d = _v.length();
        if (d < 1e-6) continue;
        if (c.min && d >= c.len) continue;
        const wa = this.inv[c.a], wb = this.inv[c.b];
        const diff = ((d - c.len) / (d * (wa + wb))) * c.k;
        a.addScaledVector(_v, diff * wa);
        b.addScaledVector(_v, -diff * wb);
      }
      this._collide(world, obstacles);
    }
    if (maxMove < 0.0025) {
      this.still += dt;
      if (this.still > 0.9) this.sleeping = true;
    } else this.still = 0;
  }

  _collide(world, obstacles) {
    const P = this.pos, Q = this.prev;
    for (let i = 0; i < this.n; i++) {
      const p = P[i];
      const r = this.radius[i];
      const fy = world.floorAt(p.x, p.z);
      if (p.y < fy + r) {
        p.y = fy + r;
        // ground friction
        const q = Q[i];
        q.x = p.x - (p.x - q.x) * this.groundFriction;
        q.z = p.z - (p.z - q.z) * this.groundFriction;
        if (q.y > p.y) q.y = p.y - (q.y - p.y) * 0.15;
      }
      const cy = world.ceilAt(p.x, p.z);
      if (p.y > cy - r) p.y = cy - r;
      world.collideCircle(p, r);
      if (obstacles) obstacles(p, r);
      // keep things out of the walls even in sub-tile glitches
      const cx = Math.floor(p.x / TILE), cz = Math.floor(p.z / TILE);
      if (world.solidCell(cx, cz)) { p.copy(Q[i]); }
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
