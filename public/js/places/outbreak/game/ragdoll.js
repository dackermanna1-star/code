// Ragdolls: when someone dies, their body stops being animated and starts
// being simulated. Each body is ten points - two hips, two shoulders, the
// front of the chest, the head, both hands and both feet - moved by gravity and held together by
// constraints: the torso and head rigid, arms and legs fixed in length and
// swinging at the shoulder and hip, with limits so a leg can't fold up
// through the chest or a hand pass through the body. The points bump into the
// ground and everything solid (walls, floors, stairs, cars, tree trunks), so
// a body shot on the stairs slides down them and one killed at a window
// slumps over the sill. The push of the bullet or blow goes into the part
// that was hit; corpses can be shot or struck again for a while. When a body
// has stopped moving it goes to sleep (and costs nothing), leaving a pool of
// blood growing under it. The six limbs drawn by the crowd are placed from
// the points every frame.
import * as THREE from 'three';
import { O } from '../state.js';

const PL = 0, PR = 1, SL = 2, SR = 3, HD = 4, HL = 5, HR = 6, FL = 7, FR = 8, CF = 9;
const N = 10;
const RAD = [0.45, 0.45, 0.5, 0.5, 0.62, 0.3, 0.3, 0.32, 0.32, 0.35];
const PART_POINTS = { head: [HD], torso: [PL, PR, SL, SR, CF], armL: [HL, SL], armR: [HR, SR], legL: [FL, PL], legR: [FR, PR] };
const GRAV = 80, ITER = 7, SLEEP_V = 0.012; // (heavier than the world's gravity: bodies drop, they don't float)
const _v = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _c = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class Ragdoll {
  /** person: a figure of the crowd, whose limb matrices (mats) are where the body is now. */
  constructor(person, o = {}) {
    this.p = person;
    const s = person.scale || 1;
    this.s = s;
    this.pos = new Float32Array(N * 3); this.prev = new Float32Array(N * 3);
    if (o.points && o.points.length === N * 3) this.pos.set(o.points);
    else {
      const M = o.mats || person.mats;
      const set = (i, k, x, y, z) => { _v.set(x, y, z).applyMatrix4(M[k]); this.pos[i * 3] = _v.x; this.pos[i * 3 + 1] = _v.y; this.pos[i * 3 + 2] = _v.z; };
      set(PL, 1, -0.5, -1, 0); set(PR, 1, 0.5, -1, 0); set(SL, 1, -1.5, 0.8, 0); set(SR, 1, 1.5, 0.8, 0);
      set(HD, 0, 0, 0, 0); set(HL, 2, 0, -1, 0); set(HR, 3, 0, -1, 0); set(FL, 4, 0, -1, 0); set(FR, 5, 0, -1, 0); set(CF, 1, 0, 0.2, 0.6);
    }
    this.prev.set(this.pos);
    // the constraints: [a, b, rest, kind] - 0 fixed length, 1 at least this far apart
    const C = this.cons = [];
    const d = (a, b) => Math.hypot(this.pos[a * 3] - this.pos[b * 3], this.pos[a * 3 + 1] - this.pos[b * 3 + 1], this.pos[a * 3 + 2] - this.pos[b * 3 + 2]);
    const fix = (a, b) => C.push([a, b, d(a, b), 0]);
    const apart = (a, b, r) => C.push([a, b, r * s, 1]);
    // the torso and head: rigid (from the body's natural proportions, not the pose it died in)
    const rest = (a, b, len) => C.push([a, b, len * s, 0]);
    rest(PL, PR, 1); rest(SL, SR, 3); rest(PL, SL, Math.hypot(1, 1.8)); rest(PR, SR, Math.hypot(1, 1.8)); rest(PL, SR, Math.hypot(2, 1.8)); rest(PR, SL, Math.hypot(2, 1.8));
    rest(HD, SL, Math.hypot(1.5, 0.8)); rest(HD, SR, Math.hypot(1.5, 0.8)); rest(HD, PL, Math.hypot(0.5, 2.6)); rest(HD, PR, Math.hypot(0.5, 2.6));
    // the front of the chest gives the body its depth (so the head can't flop through it)
    rest(CF, PL, Math.hypot(0.5, 1.2, 0.6)); rest(CF, PR, Math.hypot(0.5, 1.2, 0.6)); rest(CF, SL, Math.hypot(1.5, 0.6, 0.6)); rest(CF, SR, Math.hypot(1.5, 0.6, 0.6)); rest(CF, HD, Math.hypot(1.4, 0.6));
    // arms and legs: their length
    rest(SL, HL, 1.8); rest(SR, HR, 1.8); rest(PL, FL, 2); rest(PR, FR, 2);
    // and how far they can swing: legs no further up than level with the hips, hands not through the body, limbs not through each other
    apart(FL, SL, 2.75); apart(FR, SR, 2.75); apart(FL, SR, 3.1); apart(FR, SL, 3.1);
    apart(FL, FR, 0.75); apart(FL, PR, 1.0); apart(FR, PL, 1.0);
    apart(HL, SR, 2.2); apart(HR, SL, 2.2); apart(HL, PR, 1.3); apart(HR, PL, 1.3); apart(HL, HD, 1.1); apart(HR, HD, 1.1);
    apart(HL, HR, 0.6); apart(HL, CF, 0.9); apart(HR, CF, 0.9); apart(FL, CF, 2.0); apart(FR, CF, 2.0);
    void fix;
    // moving as they were when they died
    if (o.vel) for (let i = 0; i < N; i++) { this.prev[i * 3] -= o.vel.x * 0.5 / 60; this.prev[i * 3 + 2] -= o.vel.z * 0.5 / 60; }
    this.boxes = []; this.bx = 1e9; this.bz = 1e9;
    this.t = 0; this.still = 0; this.asleep = !!o.asleep;
    this.onSleep = o.onSleep || null;
  }

  /** A push (studs/s) along dir, mostly into the part that was hit. */
  push(dir, speed, part = 'torso') {
    const main = PART_POINTS[part] || PART_POINTS.torso;
    for (let i = 0; i < N; i++) {
      const k = main.includes(i) ? 1 : part === 'torso' ? 0.55 : 0.25;
      const dt = 1 / 60;
      this.prev[i * 3] -= dir.x * speed * k * dt; this.prev[i * 3 + 1] -= (dir.y || 0) * speed * k * dt; this.prev[i * 3 + 2] -= dir.z * speed * k * dt;
    }
    this.asleep = false; this.still = 0; this.t = Math.min(this.t, 4);
  }
  /** Sink into the ground (bodies that have been lying a long time go). */
  sink(dy) { for (let i = 0; i < N; i++) { this.pos[i * 3 + 1] -= dy; this.prev[i * 3 + 1] -= dy; } }
  get center() { const P = this.pos; return _c.set((P[0] + P[3] + P[6] + P[9]) / 4, (P[1] + P[4] + P[7] + P[10]) / 4, (P[2] + P[5] + P[8] + P[11]) / 4); }

  _gather() {
    const c = this.center;
    this.bx = c.x; this.bz = c.z; this.boxes.length = 0;
    O.phys.query(c.x - 9, c.z - 9, c.x + 9, c.z + 9, (b) => { if (b.solid !== false && !(b.glass && b.brokenGlass) && b.hy < 60) this.boxes.push(b); });
  }

  step(dt) {
    if (this.asleep) return;
    this.t += dt;
    const c = this.center;
    if (Math.abs(c.x - this.bx) > 4 || Math.abs(c.z - this.bz) > 4) this._gather();
    const sub = 2, h = Math.min(dt, 1 / 30) / sub;
    const P = this.pos, Q = this.prev, T = O.terrain;
    let moved = 0;
    for (let k = 0; k < sub; k++) {
      // move: what it was doing, plus gravity (and a lot of drag in water)
      for (let i = 0; i < N; i++) {
        const o = i * 3;
        const wl = T.waterAt(P[o], P[o + 2]);
        const wet = wl > P[o + 1];
        const damp = wet ? 0.9 : 0.985;
        const vx = (P[o] - Q[o]) * damp, vy = (P[o + 1] - Q[o + 1]) * damp, vz = (P[o + 2] - Q[o + 2]) * damp;
        Q[o] = P[o]; Q[o + 1] = P[o + 1]; Q[o + 2] = P[o + 2];
        P[o] += vx; P[o + 1] += vy + (wet ? 4 : -GRAV) * h * h; P[o + 2] += vz;
      }
      // hold together, and stay out of things
      for (let it = 0; it < ITER; it++) {
        for (const [a, b, rest, kind] of this.cons) {
          const ao = a * 3, bo = b * 3;
          const dx = P[bo] - P[ao], dy = P[bo + 1] - P[ao + 1], dz = P[bo + 2] - P[ao + 2];
          const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          if (kind === 1 && L >= rest) continue;
          const f = (L - rest) / L * 0.5;
          P[ao] += dx * f; P[ao + 1] += dy * f; P[ao + 2] += dz * f;
          P[bo] -= dx * f; P[bo + 1] -= dy * f; P[bo + 2] -= dz * f;
        }
        if (it % 2 === 0 || it === ITER - 1) this._collide();
      }
    }
    for (let i = 0; i < N * 3; i++) moved = Math.max(moved, Math.abs(P[i] - Q[i]));
    // gone still: sleep
    this.still = moved < SLEEP_V ? this.still + dt : 0;
    if (this.still > 0.6 || this.t > 9) { this.asleep = true; this.onSleep?.(this); this.onSleep = null; }
  }

  _collide() {
    const P = this.pos, Q = this.prev, T = O.terrain;
    for (let i = 0; i < N; i++) {
      const o = i * 3, r = RAD[i] * this.s;
      let hit = false;
      // the land (unless there's a hole in it here: bunkers)
      const g = T.heightAt(P[o], P[o + 2]);
      if (P[o + 1] < g + r && !(O.phys.holeAt?.(P[o], P[o + 2], P[o + 1], g))) { P[o + 1] = g + r; hit = true; }
      // boxes: pushed out the shortest way
      for (const b of this.boxes) {
        const dx = P[o] - b.x, dz = P[o + 2] - b.z;
        const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c, ly = P[o + 1] - b.y;
        const ex = b.hx + r - Math.abs(lx); if (ex <= 0) continue;
        const ey = b.hy + r - Math.abs(ly); if (ey <= 0) continue;
        const ez = b.hz + r - Math.abs(lz); if (ez <= 0) continue;
        if (ey <= ex && ey <= ez) P[o + 1] += ly >= 0 ? ey : -ey;
        else if (ex <= ez) { const k = lx >= 0 ? ex : -ex; P[o] += k * b.c; P[o + 2] -= k * b.s; }
        else { const k = lz >= 0 ? ez : -ez; P[o] += k * b.s; P[o + 2] += k * b.c; }
        hit = true;
      }
      // friction: touching something takes most of the sliding out
      if (hit) { Q[o] += (P[o] - Q[o]) * 0.6; Q[o + 2] += (P[o + 2] - Q[o + 2]) * 0.6; Q[o + 1] += (P[o + 1] - Q[o + 1]) * 0.5; }
    }
  }

  /** Place the six limbs (and their inverses, for bullets) from the points; keep the person where the body is. */
  write() {
    const p = this.p, P = this.pos, s = this.s;
    const pt = (i, out) => out.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    const a = pt(PL, new THREE.Vector3()), b = pt(PR, new THREE.Vector3()), sl = pt(SL, new THREE.Vector3()), sr = pt(SR, new THREE.Vector3());
    const pm = a.clone().add(b).multiplyScalar(0.5), sm = sl.clone().add(sr).multiplyScalar(0.5);
    // the torso: up from the hips to the shoulders, across from left to right
    _y.subVectors(sm, pm).normalize();
    _x.subVectors(sr, sl).add(_v.subVectors(b, a)).normalize();
    _x.addScaledVector(_y, -_x.dot(_y)).normalize();
    _z.crossVectors(_x, _y);
    const tx = _x.clone(), ty = _y.clone(), tz = _z.clone();
    const put = (k, center, x, y, z) => {
      _m.makeBasis(_v.copy(x).multiplyScalar(s), y.clone().multiplyScalar(s), z.clone().multiplyScalar(s)).setPosition(center);
      p.mats[k].copy(_m); p.inv[k].copy(_m).invert();
    };
    put(1, pm.clone().lerp(sm, 1 / 1.8), tx, ty, tz);
    // the head on its neck
    const hd = pt(HD, new THREE.Vector3());
    const hy = hd.clone().sub(sm).normalize();
    const hx = tx.clone().addScaledVector(hy, -tx.dot(hy)).normalize();
    put(0, hd, hx, hy, new THREE.Vector3().crossVectors(hx, hy));
    // arms and legs: from the joint to the hand or foot
    const limb = (k, j, e, toCenter) => {
      const J = pt(j, new THREE.Vector3()), E = pt(e, new THREE.Vector3());
      const y = J.clone().sub(E).normalize();
      let x = tx.clone().addScaledVector(y, -tx.dot(y));
      if (x.lengthSq() < 1e-4) x = tz.clone().addScaledVector(y, -tz.dot(y));
      x.normalize();
      put(k, J.clone().addScaledVector(y, -toCenter * s), x, y, new THREE.Vector3().crossVectors(x, y));
    };
    limb(2, SL, HL, 0.8); limb(3, SR, HR, 0.8); limb(4, PL, FL, 1); limb(5, PR, FR, 1);
    p.handR = null;
    p.x = pm.x; p.y = Math.min(pm.y, sm.y) - 0.6 * s; p.z = pm.z;
    if (p.body) { p.body.x = pm.x; p.body.y = p.y; p.body.z = pm.z; }
  }
  /** The points, for saving a body that should lie where it fell. */
  save() { return Array.from(this.pos, (v) => +v.toFixed(2)); }
}

/** All the bodies being simulated. */
export class Ragdolls {
  constructor() { this.list = []; this.max = 40; }
  /** Let a person fall: from their limbs as they stand now (or saved points). */
  start(person, o = {}) {
    if (person.rag) { if (o.dir) person.rag.push(o.dir, o.force || 8, o.part); return person.rag; }
    if (!person.mats && !o.points) return null;
    // (posed now, from where they are: someone killed far away or the moment they appeared hasn't been drawn yet)
    if (!o.points && !o.mats) O.crowd?._pose(person);
    const r = new Ragdoll(person, o);
    person.rag = r;
    r._gather();
    if (o.dir) r.push(o.dir, o.force || 8, o.part);
    this.list.push(r);
    // too many: the oldest sleeping ones stop being simulated (they keep their last shape)
    if (this.list.length > this.max) { const i = this.list.findIndex((q) => q.asleep); this.list.splice(i >= 0 ? i : 0, 1); }
    return r;
  }
  remove(person) { if (!person?.rag) return; const i = this.list.indexOf(person.rag); if (i >= 0) this.list.splice(i, 1); }
  update(dt) {
    const cam = O.world.camera.position;
    for (const r of this.list) {
      if (r.asleep) continue;
      // far away and out of sight: wait until you're near
      if (Math.abs(r.p.x - cam.x) + Math.abs(r.p.z - cam.z) > 700) continue;
      r.step(dt);
    }
  }
}
