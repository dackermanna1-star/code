// Ragdolls (The Outbreak's 10-point Verlet body, adapted): when someone is
// killed, hit by a car, blown up, punched hard or thrown off a bike, their
// body stops being animated and starts being simulated. Ten points - two
// hips, two shoulders, the front of the chest, the head, both hands and both
// feet - held together by 37 constraints (a rigid torso and head, limbs of
// fixed length, joint limits). They fall with the world's gravity, bump into
// the ground, road decks, kerbs, walls and props (phys boxes), float in the
// sea, and ride on, slide over and roll off moving vehicles (each car is two
// boxes: the body and the cabin, so people go over the bonnet). Fixed 1/100 s
// substeps make pushes and launches the same at any frame rate. Bodies sleep
// when they stop moving (costing nothing) and can stand up again (getUp).
//
// A body is anything with six part matrices in the crowd's convention
// (crowd.js: head, torso, armR, armL, legR, legL; box centres, facing +Z):
// crowd figures directly, or the player's CharacterModel through rigModel().
//
//   const rags = new Ragdolls()            rags.update(dt)   (stepped by peds.lateUpdate)
//   rags.start(body, {vel, push: {dir, speed, part}, scale, onSleep, carHit: veh}) -> Ragdoll
//   rag.push(dir, speed, part)  rag.center  rag.asleep  rag.stop()  rag.heading()  rag.faceUp()
//   rigModel(model) -> body adapter for an engine CharacterModel (read() / write())
import * as THREE from 'three';
import { V, K } from '../state.js';

// points (side -1 = the figure's right, at x = -1.5)
const PR = 0, PL = 1, SR = 2, SL = 3, HD = 4, HR = 5, HL = 6, FR = 7, FL = 8, CF = 9;
const N = 10;
const RAD = [0.45, 0.45, 0.5, 0.5, 0.62, 0.3, 0.3, 0.32, 0.32, 0.35];
const PART_POINTS = { head: [HD], torso: [PL, PR, SL, SR, CF], armR: [HR, SR], armL: [HL, SL], legR: [FR, PR], legL: [FL, PL] };
const H = 1 / 100, ITER = 6, MAX_SUB = 5;
const SLEEP_V = 1.2;          // studs/s: slower than this for a while -> asleep

const _v = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _tx = new THREE.Vector3(), _ty = new THREE.Vector3(), _tz = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _center = new THREE.Vector3(), _n3 = new THREE.Vector3();

export class Ragdoll {
  /** body: {mats: [6 Matrix4]} posed where the person is now. */
  constructor(body, o = {}) {
    this.body = body;
    const s = this.s = o.scale || body.scale || 1;
    this.pos = new Float32Array(N * 3); this.prev = new Float32Array(N * 3);
    const M = body.mats;
    const set = (i, k, x, y, z) => { _v.set(x, y, z).applyMatrix4(M[k]); this.pos[i * 3] = _v.x; this.pos[i * 3 + 1] = _v.y; this.pos[i * 3 + 2] = _v.z; };
    set(PR, 1, -0.5, -1, 0); set(PL, 1, 0.5, -1, 0); set(SR, 1, -1.5, 0.8, 0); set(SL, 1, 1.5, 0.8, 0);
    set(HD, 0, 0, 0, 0); set(HR, 2, 0, -1, 0); set(HL, 3, 0, -1, 0); set(FR, 4, 0, -1, 0); set(FL, 5, 0, -1, 0); set(CF, 1, 0, 0.2, 0.6);
    this.prev.set(this.pos);
    const C = this.cons = [];
    const rest = (a, b, len) => C.push(a, b, len * s, 0);
    const apart = (a, b, r) => C.push(a, b, r * s, 1);
    // the torso and head: rigid
    rest(PL, PR, 1); rest(SL, SR, 3); rest(PL, SL, Math.hypot(1, 1.8)); rest(PR, SR, Math.hypot(1, 1.8)); rest(PL, SR, Math.hypot(2, 1.8)); rest(PR, SL, Math.hypot(2, 1.8));
    rest(HD, SL, Math.hypot(1.5, 0.82)); rest(HD, SR, Math.hypot(1.5, 0.82)); rest(HD, PL, Math.hypot(0.5, 2.62)); rest(HD, PR, Math.hypot(0.5, 2.62));
    // the chest's depth (the head can't flop through it)
    rest(CF, PL, Math.hypot(0.5, 1.2, 0.6)); rest(CF, PR, Math.hypot(0.5, 1.2, 0.6)); rest(CF, SL, Math.hypot(1.5, 0.6, 0.6)); rest(CF, SR, Math.hypot(1.5, 0.6, 0.6)); rest(CF, HD, Math.hypot(1.42, 0.6));
    // limbs
    rest(SL, HL, 1.8); rest(SR, HR, 1.8); rest(PL, FL, 2); rest(PR, FR, 2);
    // joint limits
    apart(FL, SL, 2.75); apart(FR, SR, 2.75); apart(FL, SR, 3.1); apart(FR, SL, 3.1);
    apart(FL, FR, 0.75); apart(FL, PR, 1.0); apart(FR, PL, 1.0);
    apart(HL, SR, 2.2); apart(HR, SL, 2.2); apart(HL, PR, 1.3); apart(HR, PL, 1.3); apart(HL, HD, 1.1); apart(HR, HD, 1.1);
    apart(HL, HR, 0.6); apart(HL, CF, 0.9); apart(HR, CF, 0.9); apart(FL, CF, 2.0); apart(FR, CF, 2.0);
    this.cons = new Float32Array(C);
    this.boxes = []; this.gx = 1e9; this.gz = 1e9; this.gatherT = 0;
    this.act = []; this.gnd = new Float32Array(N); this.touch = new Float32Array(N);
    this.vehs = [];
    this.t = 0; this.still = 0; this.acc = 0;
    this.asleep = false; this.stopped = false;
    this.onSleep = o.onSleep || null;
    this.maxT = o.maxT || 12;
    if (o.vel) this.setVel(o.vel, o.carHit);
    if (o.push) this.push(o.push.dir, o.push.speed, o.push.part);
  }

  /** Give the whole body a velocity (studs/s). A car hit (car: the vehicle) sweeps the legs forward and up while the
   *  upper body lags behind, so the body wraps onto the bonnet and, faster, rides up the windscreen and over the roof. */
  setVel(vel, car = null) {
    const P = this.pos, Q = this.prev;
    const cv = car?.vel;
    const sp = cv ? Math.hypot(cv.x, cv.z) : 0;
    // (a blast or a blow pushes the top of the body more than the feet: people tip over and tumble, not fly like planks)
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < N; i++) { const y = P[i * 3 + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const span = Math.max(0.5, y1 - y0);
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      const tip = cv ? 1 : 0.7 + 0.6 * (P[o + 1] - y0) / span;
      let vx = vel.x * tip, vy = vel.y, vz = vel.z * tip;
      if (cv && sp > 16) {
        // [share of the car's speed, upward kick per unit speed] by point: feet, hips, hands, chest, head
        const k = i === FR || i === FL ? 0.85 : i === PR || i === PL ? 0.6 : i === HR || i === HL ? 0.45 : i === HD ? 0.25 : 0.35;
        const up = i === FR || i === FL ? 0.32 : i === PR || i === PL ? 0.22 : i === HR || i === HL ? 0.14 : i === HD ? 0.08 : 0.12;
        const lx = (vel.x - cv.x * 1.05) * 0.6, lz = (vel.z - cv.z * 1.05) * 0.6;   // (the sideways shove off the corner)
        vx = cv.x * k + lx; vz = cv.z * k + lz; vy = Math.max(0, cv.y) + Math.min(46, sp * up) + 2;
      } else if (cv) { vx *= 0.8; vz *= 0.8; vy = Math.min(vy, 6); }
      Q[o] = P[o] - vx * H; Q[o + 1] = P[o + 1] - vy * H; Q[o + 2] = P[o + 2] - vz * H;
    }
    this.wake();
  }
  /** A push (studs/s) along dir, mostly into the part that was hit. */
  push(dir, speed, part = 'torso') {
    const main = PART_POINTS[part] || PART_POINTS.torso;
    for (let i = 0; i < N; i++) {
      const k = main.includes(i) ? 1 : part === 'torso' ? 0.55 : 0.25;
      this.prev[i * 3] -= dir.x * speed * k * H; this.prev[i * 3 + 1] -= (dir.y || 0) * speed * k * H; this.prev[i * 3 + 2] -= dir.z * speed * k * H;
    }
    this.wake();
  }
  wake() { this.asleep = false; this.still = 0; this.t = Math.min(this.t, this.maxT - 4); }
  stop() { this.stopped = true; this.asleep = true; }
  /** Sink into the ground (bodies being cleared away). */
  sink(dy) { for (let i = 0; i < N; i++) { this.pos[i * 3 + 1] -= dy; this.prev[i * 3 + 1] -= dy; } }
  /** The middle of the body (a shared vector). */
  get center() { const P = this.pos; return _center.set((P[0] + P[3] + P[6] + P[9]) / 4, (P[1] + P[4] + P[7] + P[10]) / 4, (P[2] + P[5] + P[8] + P[11]) / 4); }
  /** Lying face up? (the chest point above the torso's middle) */
  faceUp() { const P = this.pos; const my = (P[1] + P[4] + P[7] + P[10]) / 4; return P[CF * 3 + 1] > my; }
  /** Which way the body lies: the heading from the hips to the head. */
  heading() { const P = this.pos; const hx = (P[0] + P[3]) / 2, hz = (P[2] + P[5]) / 2; return Math.atan2(P[HD * 3] - hx, P[HD * 3 + 2] - hz); }
  /** Point i of the body (for effects). */
  point(i, out) { return out.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]); }

  _gather() {
    const c = this.center;
    this.gx = c.x; this.gz = c.z; this.boxes.length = 0;
    V.phys?.query(c.x - 10, c.z - 10, c.x + 10, c.z + 10, (b) => { if (b.solid !== false && !b.vehicle && !(b.glass && b.brokenGlass) && !b.hidden && !b.knocked) this.boxes.push(b); });
  }
  /** Friction for the points that touched the world this substep: the sliding speed drops by mu * g * h (to a stop below that). */
  _friction() {
    const P = this.pos, Q = this.prev, T = this.touch;
    for (let i = 0; i < N; i++) {
      if (!T[i]) continue;
      const o = i * 3, drop = 0.7 * K.G * H * H * T[i];
      const vx = P[o] - Q[o], vz = P[o + 2] - Q[o + 2], t = Math.hypot(vx, vz);
      const k = t > drop ? (t - drop) / t : 0;
      Q[o] = P[o] - vx * k; Q[o + 2] = P[o + 2] - vz * k;
      T[i] = 0;
    }
  }
  /** Boxes overlapping the body (from the gathered ones) and the ground height under each point, once a substep. */
  _active() {
    const P = this.pos, act = this.act, gnd = this.gnd, ground = V.ground, phys = V.phys;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < N; i++) {
      const o = i * 3, x = P[o], y = P[o + 1], z = P[o + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
      let g = ground ? ground.heightAt(x, z) : 0;
      if (phys?.deckAt) { const d = phys.deckAt(x, z, y + 1.5); if (d > g) g = d; }
      gnd[i] = g;
    }
    act.length = 0;
    const m = 1.5;
    for (const b of this.boxes) {
      const br = Math.abs(b.hx * b.c) + Math.abs(b.hz * b.s), bz = Math.abs(b.hx * b.s) + Math.abs(b.hz * b.c); // (its world AABB half sizes)
      if (b.x + br < x0 - m || b.x - br > x1 + m || b.z + bz < z0 - m || b.z - bz > z1 + m || b.y + b.hy < y0 - m || b.y - b.hy > y1 + m) continue;
      act.push(b);
    }
  }
  _gatherVehicles() {
    this.vehs.length = 0;
    const c = this.center;
    const list = V.vehicles?.near?.(c.x, c.z, 30);
    if (list) for (const v of list) {
      if (v.removed || !v.def) continue;
      // close enough to touch within this frame?
      const reach = (v.def.radius || Math.max(v.size?.l || 12, v.size?.w || 6) * 0.6) + 4 + Math.hypot(v.vel.x, v.vel.z) * 0.05;
      if (Math.hypot(v.pos.x - c.x, v.pos.z - c.z) < reach) this.vehs.push(v);
    }
  }

  step(dt) {
    if (this.asleep) return;
    this.t += dt;
    const c = this.center;
    if (Math.abs(c.x - this.gx) > 4 || Math.abs(c.z - this.gz) > 4) this._gather();
    this._gatherVehicles();
    this.acc = Math.min(this.acc + dt, H * MAX_SUB);
    const P = this.pos, Q = this.prev, G = K.G;
    let moved = 0;
    while (this.acc >= H) {
      this.acc -= H;
      // integrate (water: drag and buoyancy)
      for (let i = 0; i < N; i++) {
        const o = i * 3;
        const wet = P[o + 1] < 0.2 && V.ground?.waterAt?.(P[o], P[o + 2]) === 0;
        const damp = wet ? 0.95 : 0.9995;
        const vx = (P[o] - Q[o]) * damp, vy = (P[o + 1] - Q[o + 1]) * damp, vz = (P[o + 2] - Q[o + 2]) * damp;
        Q[o] = P[o]; Q[o + 1] = P[o + 1]; Q[o + 2] = P[o + 2];
        P[o] += vx; P[o + 1] += vy + (wet ? (i === HD || i === CF ? 30 : 6) : -G) * H * H; P[o + 2] += vz;
      }
      // what's near enough to touch this substep: boxes overlapping the body's bounds, the ground under each point
      this._active();
      // constraints and collisions
      const C = this.cons;
      for (let it = 0; it < ITER; it++) {
        for (let j = 0; j < C.length; j += 4) {
          const ao = C[j] * 3, bo = C[j + 1] * 3, rest = C[j + 2];
          const dx = P[bo] - P[ao], dy = P[bo + 1] - P[ao + 1], dz = P[bo + 2] - P[ao + 2];
          const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          if (C[j + 3] === 1 && L >= rest) continue;
          const f = (L - rest) / L * 0.5;
          P[ao] += dx * f; P[ao + 1] += dy * f; P[ao + 2] += dz * f;
          P[bo] -= dx * f; P[bo + 1] -= dy * f; P[bo + 2] -= dz * f;
        }
        if (it % 2 === 1 || it === ITER - 1) this._collide(it === ITER - 1);
      }
      this._friction();
      for (let i = 0; i < N * 3; i++) { const d = Math.abs(P[i] - Q[i]); if (d > moved) moved = d; }
    }
    // gone still: sleep (not while a car is moving under the body)
    let carNear = false;
    for (const v of this.vehs) if (v.vel && v.vel.lengthSq() > 4) carNear = true;
    this.still = moved < SLEEP_V * H && !carNear ? this.still + dt : 0;
    if (this.still > 0.5 || this.t > this.maxT) { this.asleep = true; const f = this.onSleep; this.onSleep = null; f?.(this); }
  }

  /** Points against the ground, decks, boxes and vehicles. Contacts are inelastic (a push-out is not a launch);
   *  friction (Coulomb: it takes off a little speed each substep, so bodies slide and tumble) on the last pass. */
  _collide(last) {
    const P = this.pos, Q = this.prev, gnd = this.gnd, act = this.act;
    for (let i = 0; i < N; i++) {
      const o = i * 3, r = RAD[i] * this.s;
      let nx = 0, ny = 0, nz = 0, hit = false;
      // the land and road decks
      const g = gnd[i];
      if (P[o + 1] < g + r) { P[o + 1] = g + r; ny += 1; hit = true; }
      // boxes: pushed out the shortest way
      for (let bi = 0; bi < act.length; bi++) {
        const b = act[bi];
        const dx = P[o] - b.x, dz = P[o + 2] - b.z;
        const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c, ly = P[o + 1] - b.y;
        const ex = b.hx + r - Math.abs(lx); if (ex <= 0) continue;
        const ey = b.hy + r - Math.abs(ly); if (ey <= 0) continue;
        const ez = b.hz + r - Math.abs(lz); if (ez <= 0) continue;
        if (ey <= ex && ey <= ez) { const k = ly >= 0 ? 1 : -1; P[o + 1] += k * ey; ny += k; }
        else if (ex <= ez) { const k = lx >= 0 ? 1 : -1; P[o] += k * ex * b.c; P[o + 2] -= k * ex * b.s; nx += k * b.c; nz -= k * b.s; }
        else { const k = lz >= 0 ? 1 : -1; P[o] += k * ez * b.s; P[o + 2] += k * ez * b.c; nx += k * b.s; nz += k * b.c; }
        hit = true;
      }
      if (hit) {
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        // no bounce: the velocity into (or pushed out of) the surface goes
        let vx = P[o] - Q[o], vy = P[o + 1] - Q[o + 1], vz = P[o + 2] - Q[o + 2];
        const vn = vx * nx + vy * ny + vz * nz;
        vx -= nx * vn; vy -= ny * vn; vz -= nz * vn;
        Q[o] = P[o] - vx; Q[o + 1] = P[o + 1] - vy; Q[o + 2] = P[o + 2] - vz;
        this.touch[i] = ny > 0.5 ? 1 : 0.6;               // (friction at the end of the substep)
      } else if (P[o + 1] < g + r + 0.06) this.touch[i] = Math.max(this.touch[i], 1);
      // vehicles: the body box and (cars) the cabin, in the vehicle's own frame (they tilt and roll)
      for (let vi = 0; vi < this.vehs.length; vi++) this._vehicle(this.vehs[vi], o, r, last);
    }
  }

  _vehicle(v, o, r, last) {
    const P = this.pos, Q = this.prev, d = v.def, hull = d.hull;
    if (!hull) return;
    const dx0 = P[o] - v.pos.x, dy0 = P[o + 1] - v.pos.y, dz0 = P[o + 2] - v.pos.z;
    const rad = Math.max(d.size.l, d.size.w) * 0.6 + r + 2;
    if (dx0 * dx0 + dz0 * dz0 > rad * rad || dy0 < -2 || dy0 > d.size.h + 3) return;
    // into the vehicle's frame (it may be tilted or rolling)
    _qi.copy(v.quat).invert();
    _a.set(dx0, dy0, dz0).applyQuaternion(_qi);
    const pf = carProfile(v);
    let pushed = false;
    _n3.set(0, 0, 0);
    // two prisms in side view (z, y): the lower body (sloped nose, bonnet, boot) and (cars) the cabin
    // (windscreen, roof, rear window), each with its half width; pushed out the shortest way, never down
    for (let pi = 0; pi < pf.prisms.length; pi++) {
      const pr = pf.prisms[pi];
      const lx = _a.x - pf.xc, ex = pr.hw + r - Math.abs(lx);
      if (ex <= 0) continue;
      let best = ex, bi = -1, inside = true;
      for (let i = 0; i < pr.planes.length; i++) {
        const pl = pr.planes[i];                       // [nz, ny, offset]: inside when nz*z + ny*y < offset
        const pen = pl[2] + r - (pl[0] * _a.z + pl[1] * _a.y);
        if (pen <= 0) { inside = false; break; }
        if (pen < best && pl[1] > -0.5) { best = pen; bi = i; }
      }
      if (!inside) continue;
      if (bi < 0) { const k = lx >= 0 ? 1 : -1; _a.x += k * ex; _n3.x += k; }
      else { const pl = pr.planes[bi]; _a.z += pl[0] * best; _a.y += pl[1] * best; _n3.z += pl[0]; _n3.y += pl[1]; }
      pushed = true;
    }
    if (!pushed) return;
    _a.applyQuaternion(v.quat);
    P[o] = v.pos.x + _a.x; P[o + 1] = v.pos.y + _a.y; P[o + 2] = v.pos.z + _a.z;
    // an inelastic contact with a moving surface: leave it no faster than the surface moves (the push-out
    // isn't a launch), and slide along it with some friction (people are carried, and roll off)
    _n3.normalize().applyQuaternion(v.quat);
    const ux = v.vel.x * H, uy = v.vel.y * H, uz = v.vel.z * H;
    let rx = P[o] - Q[o] - ux, ry = P[o + 1] - Q[o + 1] - uy, rz = P[o + 2] - Q[o + 2] - uz;
    const rn = rx * _n3.x + ry * _n3.y + rz * _n3.z;
    rx -= _n3.x * rn; ry -= _n3.y * rn; rz -= _n3.z * rn;          // (no bounce, no launch)
    // sliding over the paintwork: a little friction (once a substep), so people roll over the bonnet and roof
    let kf = 1;
    { const t = Math.hypot(rx, ry, rz), drop = 0.35 * K.G * H * H / 3; kf = t > drop ? (t - drop) / t : 0; }
    void last;
    Q[o] = P[o] - (ux + rx * kf); Q[o + 1] = P[o + 1] - (uy + ry * kf); Q[o + 2] = P[o + 2] - (uz + rz * kf);
  }

  /** Place the six parts (crowd convention) from the points into mats. */
  writeMats(mats) {
    const P = this.pos, s = this.s;
    const pt = (i, out) => out.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    const pr = pt(PR, _a), pl = pt(PL, _b), sr = pt(SR, _c), sl = pt(SL, _d);
    const pm = _e.addVectors(pr, pl).multiplyScalar(0.5);
    const smx = (sr.x + sl.x) / 2, smy = (sr.y + sl.y) / 2, smz = (sr.z + sl.z) / 2;
    // torso: up from the hips to the shoulders, across from the right (-x) to the left (+x)
    _ty.set(smx - pm.x, smy - pm.y, smz - pm.z).normalize();
    _tx.subVectors(sl, sr).add(_v.subVectors(pl, pr)).normalize();
    _tx.addScaledVector(_ty, -_tx.dot(_ty)).normalize();
    _tz.crossVectors(_tx, _ty);
    // torso centre: 1/1.8 of the way from the hips to the shoulders
    _v.set(pm.x + (smx - pm.x) / 1.8, pm.y + (smy - pm.y) / 1.8, pm.z + (smz - pm.z) / 1.8);
    put(mats[1], _v, _tx, _ty, _tz, s);
    // head on its neck
    pt(HD, _v);
    _y.set(_v.x - smx, _v.y - smy, _v.z - smz).normalize();
    _x.copy(_tx).addScaledVector(_y, -_tx.dot(_y)).normalize();
    _z.crossVectors(_x, _y);
    put(mats[0], _v, _x, _y, _z, s);
    // limbs: from the joint to the hand or foot
    limb(mats[2], P, SR, HR, 0.8, s); limb(mats[3], P, SL, HL, 0.8, s);
    limb(mats[4], P, PR, FR, 1, s); limb(mats[5], P, PL, FL, 1, s);
  }
}

function put(m, c, x, y, z, s) {
  const e = m.elements;
  e[0] = x.x * s; e[1] = x.y * s; e[2] = x.z * s; e[3] = 0;
  e[4] = y.x * s; e[5] = y.y * s; e[6] = y.z * s; e[7] = 0;
  e[8] = z.x * s; e[9] = z.y * s; e[10] = z.z * s; e[11] = 0;
  e[12] = c.x; e[13] = c.y; e[14] = c.z; e[15] = 1;
}
const _lj = new THREE.Vector3(), _le = new THREE.Vector3(), _lx = new THREE.Vector3(), _ly = new THREE.Vector3(), _lz = new THREE.Vector3(), _lc = new THREE.Vector3();
function limb(m, P, j, e, toCenter, s) {
  _lj.set(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]); _le.set(P[e * 3], P[e * 3 + 1], P[e * 3 + 2]);
  _ly.subVectors(_lj, _le).normalize();
  _lx.copy(_tx).addScaledVector(_ly, -_tx.dot(_ly));
  if (_lx.lengthSq() < 1e-4) _lx.copy(_tz).addScaledVector(_ly, -_tz.dot(_ly));
  _lx.normalize();
  _lz.crossVectors(_lx, _ly);
  _lc.copy(_lj).addScaledVector(_ly, -toCenter * s);
  put(m, _lc, _lx, _ly, _lz, s);
}

/** A vehicle's shape for bodies: the lower box and (cars) the cabin trapezoid, in its own frame. Cached on the type. */
function carProfile(v) {
  const d = v.def;
  if (d._rp) return d._rp;
  const h = d.hull, L = h.z1 - h.z0, H = h.y1 - h.y0;
  const car = v.kind === 'car' && d.size.h < 9 && d.size.l < 34;
  const yb = car ? h.y0 + H * 0.48 : h.y1;                 // the belt line (bonnet height)
  const y0 = h.y0 * 0.6;
  /** The line through (z1, y1) and (z2, y2) as a plane [nz, ny, offset], its normal turned to point (sz, sy)-wards. */
  const plane = (z1, y1, z2, y2, sz, sy) => {
    let nz = y1 - y2, ny = z2 - z1; const l = Math.hypot(nz, ny) || 1; nz /= l; ny /= l;
    if (nz * sz + ny * sy < 0) { nz = -nz; ny = -ny; }
    return [nz, ny, nz * z1 + ny * y1];
  };
  const pf = { xc: (h.x0 + h.x1) / 2, prisms: [] };
  const hw = (h.x1 - h.x0) / 2;
  // the lower body: the nose slopes back from the bumper to the bonnet's leading edge (it lifts people as it goes under them)
  const nose = car ? Math.min(2.2, L * 0.13) : 0.4;
  pf.prisms.push({ hw, planes: [
    [0, 1, yb],                                        // the bonnet and boot lid
    [0, -1, -y0],                                      // the underside (never pushed down through it)
    plane(h.z1, y0 + 0.3, h.z1 - nose, yb, 1, 0.3),    // the nose
    plane(h.z0, y0 + 0.3, h.z0 + nose * 0.5, yb, -1, 0.3), // the tail
  ] });
  if (car) {
    const zb = h.z0 + L * 0.08, zr = h.z0 + L * 0.26, zf = h.z0 + L * 0.47, zw = h.z0 + L * 0.77, yr = h.y1;
    pf.prisms.push({ hw: hw * 0.86, planes: [
      [0, 1, yr],                                      // the roof
      [0, -1, -(yb - 0.2)],                            // the cabin floor (meets the lower body)
      plane(zf, yr, zw, yb, 1, 0.5),                   // the windscreen
      plane(zr, yr, zb, yb, -1, 0.5),                  // the rear window
    ] });
  }
  d._rp = pf;
  return pf;
}

// ---- the player's body: an engine CharacterModel (root at the torso centre, facing -Z) -------------------------------
// The crowd convention faces +Z, so a part's crowd matrix = the model part's world matrix x R(PI about Y);
// the crowd's right arm (x = -1.5) is the model's rightShoulder (x = +1.5 before the turn).
const FLIP = new THREE.Matrix4().makeRotationY(Math.PI);
const _w = new THREE.Matrix4(), _w2 = new THREE.Matrix4(), _pos = new THREE.Vector3(), _sc = new THREE.Vector3();
export function rigModel(model) {
  const mats = [0, 1, 2, 3, 4, 5].map(() => new THREE.Matrix4());
  const rig = {
    model, mats, scale: 1,
    /** The model's current pose into mats. */
    read() {
      model.root.updateMatrixWorld(true);
      // head centre: the head mesh; torso: the root; limbs: the meshes (their centres)
      mats[0].multiplyMatrices(model.head.matrixWorld, FLIP);
      mats[1].multiplyMatrices(model.root.matrixWorld, FLIP);
      mats[2].multiplyMatrices(model.rightArm.matrixWorld, FLIP); mats[3].multiplyMatrices(model.leftArm.matrixWorld, FLIP);
      mats[4].multiplyMatrices(model.rightLeg.matrixWorld, FLIP); mats[5].multiplyMatrices(model.leftLeg.matrixWorld, FLIP);
      // the arm mesh centre is 0.5 below the shoulder pivot (the crowd's is 0.8): close enough
      return rig;
    },
    /** mats (crowd convention) into the model: root from the torso, pivots turned to point the limbs. */
    write() {
      const root = model.root;
      _w.multiplyMatrices(mats[1], FLIP);
      _w.decompose(root.position, root.quaternion, _sc);
      root.updateMatrix();
      _qi.copy(root.quaternion).invert();
      const setLocal = (obj, m) => {
        // the local rotation of a child of the root: inverse(root rotation) * part rotation
        _w2.multiplyMatrices(m, FLIP);
        _w2.decompose(_pos, _q, _sc);
        obj.quaternion.copy(_qi).multiply(_q);
      };
      setLocal(model.neck, mats[0]);
      setLocal(model.rightShoulder, mats[2]); setLocal(model.leftShoulder, mats[3]);
      setLocal(model.rightHip, mats[4]); setLocal(model.leftHip, mats[5]);
      root.updateMatrixWorld(true);
    },
    /** Back to the model's own animation (clears what write() did to the pivots). */
    reset() {
      for (const o of [model.neck, model.rightShoulder, model.leftShoulder, model.rightHip, model.leftHip]) o.rotation.set(0, 0, 0);
    },
  };
  return rig;
}

// ---- all the bodies being simulated -----------------------------------------------------------------------------------
export class Ragdolls {
  constructor() { this.list = []; this.maxAwake = 18; }
  start(body, o = {}) {
    const r = new Ragdoll(body, o);
    r._gather();
    this.list.push(r);
    return r;
  }
  remove(r) { const i = this.list.indexOf(r); if (i >= 0) this.list.splice(i, 1); }
  /** Step the awake ones near the camera (too many awake: the oldest go to sleep where they are). */
  update(dt) {
    if (dt <= 0) return;
    const cam = V.world?.camera?.position;
    let awake = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i];
      if (r.stopped) { this.list.splice(i, 1); continue; }
      if (r.asleep) continue;
      if (++awake > this.maxAwake) { r.asleep = true; const f = r.onSleep; r.onSleep = null; f?.(r); continue; }
      if (cam) { const c = r.center; if (Math.abs(c.x - cam.x) + Math.abs(c.z - cam.z) > 900) continue; }
      r.step(dt);
    }
  }
  get awake() { let n = 0; for (const r of this.list) if (!r.asleep) n++; return n; }
}
