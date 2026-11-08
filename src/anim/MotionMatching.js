import * as THREE from 'three';
import { clamp, damp, wrapAngle, smoothstep } from './math.js';

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

/**
 * Motion matching over retargeted motion-capture walks.
 *
 * A spring-damper "simulation" character follows the player's input; its
 * predicted trajectory (positions and facing 1/3, 2/3 and 1 s ahead) plus the
 * current pose's foot and hip motion form a query.  Every ~0.1 s the database
 * frame with the most similar features is found and cross-faded in.  The
 * character's root is moved by the mocap root motion (lightly corrected
 * towards the simulation), so speed, cadence and turning come from the real
 * performance.
 */
export class MotionMatching {
  constructor(db) {
    this.db = db;
    this.active = false;
    this.weight = 0;              // blend weight against the procedural (standing) pose
    this.targetWeight = 0;
    this.streams = [];            // { t, w, target }
    this.root = new THREE.Vector3();
    this.heading = 0;
    this.sim = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, angVel: 0, av: { v: 0 } };
    this.searchTimer = 0;
    this.rate = 1;
    this.stopRequested = false;
    this.releasing = false;
    this.query = new Float32Array(db.D);
    this.raw = new Float32Array(db.D);
    // feature weights: trajectory position, facing, left foot pos/vel, right foot pos/vel, hip velocity
    this.weights = new Float32Array(db.D);
    const w = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.4, 1.4, 1.4, 1.4, 1.4, 1.4, 0.75, 0.75, 0.75, 0.55, 0.55, 0.55, 0.75, 0.75, 0.75, 0.55, 0.55, 0.55, 0.9, 0.9, 0.9];
    this.weights.set(w);
    this.Q = db.bones.map(() => new THREE.Quaternion());
    this.P = new THREE.Vector3();
    this._q = db.bones.map(() => new THREE.Quaternion());
    this._p = new THREE.Vector3();
    this.contact = { l: 0, r: 0 };
    this.speedNow = 0;
    this.lastSwitch = 0;
    this.time = 0;
  }

  // ------------------------------------------------------------ controller
  _desired(input) {
    const has = input.dir.lengthSq() > 1e-6 && input.speed > 0.05;
    const v = has ? input.dir.clone().multiplyScalar(input.speed) : new THREE.Vector3();
    const yaw = has ? Math.atan2(input.dir.x, input.dir.z) : this.sim.yaw;
    return { v, yaw, has };
  }

  _stepSim(s, des, dt) {
    // velocity: critically damped approach; facing: rate-limited spring
    const k = 1 - Math.exp(-dt / 0.28);
    s.vel.lerp(des.v, k);
    const err = wrapAngle(des.yaw - s.yaw);
    const wantAv = clamp(err * 4.0, -3.2, 3.2);
    s.angVel += (wantAv - s.angVel) * (1 - Math.exp(-dt / 0.12));
    s.yaw = wrapAngle(s.yaw + s.angVel * dt);
    s.pos.addScaledVector(s.vel, dt);
  }

  /** Future (root-relative) trajectory of the simulation for the query. */
  _trajectory(des) {
    const s = { pos: this.sim.pos.clone(), vel: this.sim.vel.clone(), yaw: this.sim.yaw, angVel: this.sim.angVel };
    const out = [];
    const marks = this.db.info.futureFrames;
    const dt = 1 / this.db.fps;
    let f = 0;
    for (const m of marks) {
      while (f < m) { this._stepSim(s, des, dt); f++; }
      out.push({ pos: s.pos.clone(), yaw: s.yaw });
    }
    return out;
  }

  // ------------------------------------------------------------ lifecycle
  /** Begin walking from a standing pose at pos/heading. */
  start(pos, heading, input, idleFeet) {
    this.active = true;
    this.releasing = false;
    this.stopRequested = false;
    this.root.copy(pos);
    this.heading = heading;
    this.sim.pos.copy(pos);
    this.sim.vel.set(0, 0, 0);
    this.sim.yaw = heading;
    this.sim.angVel = 0;
    this.streams = [];
    this.targetWeight = 1;
    const des = this._desired(input);
    // seed with a moving desire so the search finds an early-stride frame
    const r = this._search(des, idleFeet);
    this.streams.push({ t: r.frame, w: 1, target: 1 });
    this.searchTimer = 0.15;
    this.lastSwitch = this.time;
  }

  stop() { this.active = false; this.targetWeight = 0; this.streams = []; this.weight = 0; }

  _currentFrame() {
    let best = null;
    for (const s of this.streams) if (!best || s.w > best.w) best = s;
    return best;
  }

  _search(des, idleFeet) {
    const db = this.db;
    const traj = this._trajectory(des);
    const raw = this.raw;
    const c = Math.cos(-this.heading), sn = Math.sin(-this.heading);
    let k = 0;
    for (const p of traj) {
      const dx = p.pos.x - this.root.x, dz = p.pos.z - this.root.z;
      raw[k++] = dx * c + dz * sn;          // rotate into root frame (yaw -heading)
      raw[k++] = -dx * sn + dz * c;
    }
    for (const p of traj) {
      const a = wrapAngle(p.yaw - this.heading);
      raw[k++] = Math.sin(a); raw[k++] = Math.cos(a);
    }
    const cur = this._currentFrame();
    if (cur) {
      // pose part of the feature vector from the frame currently playing
      const tmp = new Float32Array(db.D);
      db.rawFeature(Math.round(cur.t), tmp);
      for (let i = 12; i < db.D; i++) raw[i] = tmp[i];
    } else if (idleFeet) {
      // standing: feet planted, nothing moving
      raw.set(idleFeet.l, 12); raw.fill(0, 15, 18);
      raw.set(idleFeet.r, 18); raw.fill(0, 21, 27);
    }
    db.normalise(raw, this.query);
    const curT = cur ? cur.t : -1;
    const curStart = cur ? db.takeStart[Math.round(cur.t)] : -1;
    return db.search(this.query, this.weights, (i) => cur && db.takeStart[i] === curStart && Math.abs(i - curT) < 12);
  }

  _currentCost() {
    const cur = this._currentFrame();
    if (!cur) return Infinity;
    const db = this.db, D = db.D, F = db.features, o = Math.round(cur.t) * D;
    let c = 0;
    for (let k = 0; k < D; k++) { const d = F[o + k] - this.query[k]; c += d * d * this.weights[k]; }
    return c;
  }

  // ------------------------------------------------------------ per frame
  update(dt, input) {
    const db = this.db;
    this.time += dt;
    const des = this._desired(input);
    if (!des.has) { if (!this.stopRequested) this.stopTime = this.time; this.stopRequested = true; }
    else if (!this.releasing) this.stopRequested = false;
    this._stepSim(this.sim, this.stopRequested ? { v: new THREE.Vector3(), yaw: this.sim.yaw } : des, dt);

    // blend weight against the standing pose
    this.weight += (this.targetWeight - this.weight) * (1 - Math.exp(-dt / (this.targetWeight > this.weight ? 0.16 : 0.26)));
    if (!this.active) return;

    // --- search
    this.searchTimer -= dt;
    if (!this.releasing && this.searchTimer <= 0) {
      this.searchTimer = 0.1;
      const r = this._search(des);
      const curCost = this._currentCost();
      const cur = this._currentFrame();
      const nearEnd = cur && db.takeEnd[Math.round(cur.t)] - cur.t < 12;
      if (r.frame >= 0 && (r.cost < curCost * 0.85 || nearEnd) && this.time - this.lastSwitch > 0.18) {
        for (const s of this.streams) s.target = 0;
        this.streams.push({ t: r.frame, w: 0, target: 1 });
        this.lastSwitch = this.time;
      }
    }

    // --- playback rate: gently match the clip's speed to the desired speed
    const curS = this._currentFrame();
    const v = db.velocity(curS.t, new THREE.Vector3());
    const clipSpeed = Math.max(0.3, Math.hypot(v.x, v.z));
    const want = this.stopRequested ? clipSpeed * 0.8 : Math.max(des.v.length(), 0.6);
    this.rate += (clamp(want / clipSpeed, 0.82, 1.22) - this.rate) * (1 - Math.exp(-dt / 0.4));

    // --- advance streams & weights
    const adv = dt * db.fps * this.rate;
    let wsum = 0;
    for (const s of this.streams) {
      s.t = Math.min(s.t + adv, db.takeEnd[Math.round(s.t)] - 0.001);
      s.w += (s.target - s.w) * (1 - Math.exp(-dt / 0.09));
      wsum += s.w;
    }
    this.streams = this.streams.filter((s) => s.w > 0.01 || s.target > 0);
    wsum = this.streams.reduce((a, s) => a + s.w, 0) || 1;

    // --- blended pose, root motion, contacts
    const vel = new THREE.Vector3();
    let ang = 0;
    this.contact.l = 0; this.contact.r = 0;
    let first = true;
    let acc = 0;
    for (const s of this.streams) {
      const w = s.w / wsum;
      const f = Math.round(s.t);
      db.sample(s.t, f, this._q, this._p);
      if (first) {
        for (let b = 0; b < this.Q.length; b++) this.Q[b].copy(this._q[b]);
        this.P.copy(this._p);
        first = false; acc = w;
      } else {
        acc += w;
        const a = w / acc;
        for (let b = 0; b < this.Q.length; b++) this.Q[b].slerp(this._q[b], a);
        this.P.lerp(this._p, a);
      }
      vel.x += db.vel[f * 3] * w; vel.z += db.vel[f * 3 + 2] * w;
      ang += db.angvel[f] * w;
      this.contact.l += db.contacts[f * 2] * w;
      this.contact.r += db.contacts[f * 2 + 1] * w;
    }
    vel.multiplyScalar(this.rate);
    ang *= this.rate;

    if (!this.releasing) {
      // root motion in world space + correction towards the simulation
      const c = Math.cos(this.heading), sn = Math.sin(this.heading);
      this.root.x += (vel.x * c + vel.z * sn) * dt;
      this.root.z += (-vel.x * sn + vel.z * c) * dt;
      this.heading = wrapAngle(this.heading + ang * dt);
      const err = new THREE.Vector3().subVectors(this.sim.pos, this.root);
      err.y = 0;
      if (err.length() > 0.35) err.setLength(0.35);
      this.root.addScaledVector(err, 1 - Math.exp(-dt / 0.45));
      this.heading = wrapAngle(this.heading + wrapAngle(this.sim.yaw - this.heading) * (1 - Math.exp(-dt / 0.35)));
      // keep the simulation from running away from the character
      const back = new THREE.Vector3().subVectors(this.root, this.sim.pos); back.y = 0;
      if (back.length() > 0.5) this.sim.pos.addScaledVector(back, 1 - 0.5 / back.length());
    }
    this.speedNow = Math.hypot(vel.x, vel.z);
  }

  /**
   * While a stop is requested, find a moment to hand over to the standing
   * pose: one foot firmly planted and the other swinging past it.
   */
  stopOpportunity() {
    if (!this.stopRequested || this.releasing) return null;
    // carry the momentum for about one more step before settling
    if (this.time - this.stopTime < 0.32) return null;
    const cl = this.contact.l, cr = this.contact.r;
    if (cl > 0.9 && cr < 0.1) return { stance: 'l' };
    if (cr > 0.9 && cl < 0.1) return { stance: 'r' };
    return null;
  }

  release() {
    this.releasing = true;
    this.targetWeight = 0;
  }
}

void UP; void TAU; void damp; void smoothstep;
