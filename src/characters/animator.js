// Animator (engine-free). Base layer: motion-captured locomotion solved with IK onto the
// character's own proportions (walk/jog/run/sprint/strafe/backpedal, guard/block hand targets).
// On top: keyframed FK layers (carry pose -> postures such as sitting/lying -> action clips
// such as strikes), blended per bone with quaternions, then additive reactions and smoothing.
import { newPose, P, CLIPS, sampleClip, ROOT, B, UPPER_BONES, POSE_LEN } from './poses.js';
import { Locomotion } from './locomotion.js';
import { assemblePose } from './ik.js';
import { qYPR, qSlerp, qMul, qAxisAngle } from '../core/quat.js';
import { clamp, smoothstep, damp } from '../core/mathutil.js';

const NB = 17;
const UPPER = new Set(UPPER_BONES);
const CARRY = {
  oneHand: { bones: [B.armR, B.foreR, B.handR], set: (p) => { P.arm(p, 'R', 0.3, 0.12, 0.05); P.fore(p, 'R', 0.75); P.hand(p, 'R', 0.1, 0, 0); } },
  twoHand: { bones: [B.armL, B.foreL, B.handL, B.armR, B.foreR, B.handR], set: (p) => { P.arm(p, 'R', 0.75, 0.1, 0.35); P.fore(p, 'R', 1.15); P.arm(p, 'L', 0.75, 0.1, 0.35); P.fore(p, 'L', 1.15); } },
  long: { bones: [B.armR, B.foreR, B.handR], set: (p) => { P.arm(p, 'R', 0.4, 0.15, 0.1); P.fore(p, 'R', 1.0); P.hand(p, 'R', 0.2, 0, 0); } },
  heavy: { bones: [B.armR, B.foreR, B.handR], set: (p) => { P.arm(p, 'R', 0.05, 0.18, 0); P.fore(p, 'R', 0.15); } },
  ball: { bones: [B.armL, B.foreL, B.handL, B.armR, B.foreR, B.handR], set: (p) => { P.arm(p, 'R', 0.6, 0.15, 0.25); P.fore(p, 'R', 1.4); P.arm(p, 'L', 0.6, 0.15, 0.25); P.fore(p, 'L', 1.4); } },
};

export class Animator {
  constructor(dims, seed = 0) {
    this.d = dims;
    this.loco = new Locomotion(seed);
    this.base = new Float32Array(NB * 4); this.baseHips = new Float32Array(3);
    this.q = new Float32Array(NB * 4); this.hips = new Float32Array(3);
    for (let i = 0; i < NB; i++) this.q[i * 4 + 3] = 1;
    this.fk = newPose(); this.layer = newPose();
    this.fkW = new Float32Array(NB); this.rootW = 0;
    this.t = seed * 0.37;
    this.combatW = 0; this.blockW = 0; this.carryW = 0; this.carry = null;
    this.posture = null; this.postureW = 0; this.postureT = 0; this.postureSpeed = 1; this.prevPosture = null;
    this.action = null;
    this.flinch = { v: 0, x: 0, dx: 0 };
    this.lean = 0;
    this.events = [];
    this.first = true;
    this._q = [0, 0, 0, 1]; this._q2 = [0, 0, 0, 1]; this._q3 = [0, 0, 0, 1];
    this.cache = null;
    this.moveW = 0;
  }

  play(name, dur, opts = {}) {
    const clip = CLIPS[name];
    if (!clip) { console.warn('missing clip', name); return null; }
    const prevW = this.action ? this.action.weight : 0;
    this.action = {
      clip, name, dur: dur || clip.dur, t: 0, weight: prevW, loop: opts.loop ?? clip.loop,
      blendIn: opts.blendIn ?? Math.min(0.1, (dur || clip.dur) * 0.22), blendOut: opts.blendOut ?? Math.min(0.15, (dur || clip.dur) * 0.3),
      full: opts.full ?? clip.full, fired: new Set(), stopping: false, hold: !!opts.hold, mirror: !!opts.mirror,
    };
    return this.action;
  }
  stop(fade = 0.12) { if (this.action) { this.action.stopping = true; this.action.blendOut = fade; } }
  isPlaying(name) { return !!(this.action && !this.action.stopping && (!name || this.action.name === name)); }
  setPosture(name, speed = 1) {
    if (name === this.posture) return;
    this.prevPosture = this.posture; this.posture = name; this.postureSpeed = speed;
    if (name) this.postureT = 0;
  }
  hitReact(dirX, dirZ, strength = 1) { this.flinch.v += 9 * strength; this.flinch.dx = dirX; }

  /** Blend one FK layer (Euler pose `src`, channels from `bones`) into the FK accumulator. */
  _layer(src, bones, w, root) {
    if (w <= 0.0005) return;
    for (const b of bones) {
      const o = b * 3;
      if (this.fkW[b] <= 0) { this.fk[o] = src[o]; this.fk[o + 1] = src[o + 1]; this.fk[o + 2] = src[o + 2]; this.fkW[b] = w; }
      else {
        this.fk[o] += (src[o] - this.fk[o]) * w; this.fk[o + 1] += (src[o + 1] - this.fk[o + 1]) * w; this.fk[o + 2] += (src[o + 2] - this.fk[o + 2]) * w;
        this.fkW[b] += (1 - this.fkW[b]) * w;
      }
    }
    if (root) {
      if (this.rootW <= 0) { for (let i = 0; i < 5; i++) this.fk[ROOT + i] = src[ROOT + i]; this.rootW = w; }
      else { for (let i = 0; i < 5; i++) this.fk[ROOT + i] += (src[ROOT + i] - this.fk[ROOT + i]) * w; this.rootW += (1 - this.rootW) * w; }
    }
  }

  /**
   * s: { speed, vf, vs, turnRate, accel, combat, block, carry, lookYaw, sprint, exhausted, stance }
   */
  update(dt, s) {
    this.t += dt;
    this.events.length = 0;
    // ---------------- base: mocap locomotion + IK ----------------
    this.combatW = damp(this.combatW, s.combat ? 1 : 0, 9, dt);
    this.blockW = damp(this.blockW, s.block ? 1 : 0, 22, dt);
    const lo = this.loco.update(dt, {
      vx: s.vs || 0, vz: s.vf ?? s.speed ?? 0, look: s.lookYaw || 0, sprint: s.sprint,
      guard: this.combatW, block: this.blockW, stance: this.combatW * (s.stance === false ? 0 : 1),
      hunch: s.exhausted ? 1 : 0,
    }, this.d);
    this.moveW = lo.moveW;
    this.cache = assemblePose(lo, this.d, this.base, this.baseHips, this.cache);
    // ---------------- FK layers ----------------
    this.fkW.fill(0); this.rootW = 0;
    const L = this.layer;
    // Carry
    if (s.carry !== this.carry && this.carryW < 0.05) this.carry = s.carry;
    this.carryW = damp(this.carryW, s.carry && s.carry === this.carry ? 1 : 0, 12, dt);
    if (this.carry && CARRY[this.carry] && this.carryW > 0.01) {
      L.fill(0); CARRY[this.carry].set(L);
      const w = this.carryW * (1 - this.combatW * (this.carry === 'oneHand' || this.carry === 'long' ? 0.8 : 0.35));
      this._layer(L, CARRY[this.carry].bones, w, false);
    }
    // Posture (sit / lie / KO / workouts)
    this.postureW = damp(this.postureW, this.posture ? 1 : 0, this.posture ? 10 : 7, dt);
    const pname = this.posture || this.prevPosture;
    if (pname && this.postureW > 0.003) {
      const clip = CLIPS[pname];
      const prevT = this.postureT;
      this.postureT += (dt / clip.dur) * this.postureSpeed;
      const evT = clip.events.rep;
      if (evT != null && Math.floor(prevT - evT) !== Math.floor(this.postureT - evT)) this.events.push('rep');
      L.fill(0); sampleClip(clip, this.postureT, L, L);
      this._layer(L, clipBones(clip), this.postureW, clip.mask.some((c) => c >= ROOT));
      if (!this.posture && this.postureW < 0.01) this.prevPosture = null;
    }
    // Action clip
    const a = this.action;
    if (a) {
      const prevT = a.t;
      a.t += dt / a.dur;
      for (const [ev, et] of Object.entries(a.clip.events)) {
        if (!a.fired.has(ev) && prevT <= et && a.t > et) { a.fired.add(ev); this.events.push(ev); }
      }
      if (a.loop && a.t >= 1) { a.t -= 1; a.fired.clear(); }
      let target = 1;
      if (!a.loop && !a.hold) { const remain = (1 - a.t) * a.dur; if (remain < a.blendOut) target = Math.max(0, remain / a.blendOut); }
      if (a.stopping) target = 0;
      const rate = target > a.weight ? 1 / Math.max(0.03, a.blendIn) : 1 / Math.max(0.03, a.blendOut);
      a.weight = target > a.weight ? Math.min(target, a.weight + rate * dt) : Math.max(target, a.weight - rate * dt);
      L.fill(0); sampleClip(a.clip, a.hold ? Math.min(a.t, 1) : a.t, L, L);
      if (a.mirror) mirrorPose(L);
      let bones = clipBones(a.clip);
      if (!a.full) bones = bones.filter((b) => UPPER.has(b));
      this._layer(L, bones, a.weight, a.full && a.clip.mask.some((c) => c >= ROOT));
      if ((a.stopping && a.weight <= 0.001) || (!a.loop && !a.hold && a.t >= 1)) this.action = null;
    }
    // ---------------- compose ----------------
    const out = this._compose || (this._compose = new Float32Array(NB * 4));
    const fq = this._q, bq = this._q2;
    for (let b = 0; b < NB; b++) {
      const o = b * 4;
      bq[0] = this.base[o]; bq[1] = this.base[o + 1]; bq[2] = this.base[o + 2]; bq[3] = this.base[o + 3];
      const w = this.fkW[b];
      if (w > 0.0005) {
        let px = this.fk[b * 3], py = this.fk[b * 3 + 1], pz = this.fk[b * 3 + 2];
        if (b === B.hips) { px += this.fk[ROOT + 3] * (this.rootW > 0 ? 1 : 0); pz += this.fk[ROOT + 4] * (this.rootW > 0 ? 1 : 0); }
        qYPR(fq, py, px, pz);
        qSlerp(bq, bq, fq, w);
      }
      out[o] = bq[0]; out[o + 1] = bq[1]; out[o + 2] = bq[2]; out[o + 3] = bq[3];
    }
    const hips = this._hips || (this._hips = new Float32Array(3));
    hips[0] = this.baseHips[0]; hips[1] = this.baseHips[1]; hips[2] = this.baseHips[2];
    if (this.rootW > 0.0005) {
      const rw = this.rootW;
      hips[0] += (this.fk[ROOT + 2] - hips[0]) * rw; hips[1] += (this.fk[ROOT] - hips[1]) * rw; hips[2] += (this.fk[ROOT + 1] - hips[2]) * rw;
    }
    // ---------------- additive layers ----------------
    const f = this.flinch;
    f.v += (-f.x * 160 - f.v * 18) * dt; f.x += f.v * dt;
    if (Math.abs(f.x) > 1e-4) {
      this._mulLocal(out, B.chest, qYPR(this._q3, f.x * 0.15 * f.dx, -f.x * 0.25, 0));
      this._mulLocal(out, B.head, qYPR(this._q3, 0, -f.x * 0.35, 0));
    }
    const turn = clamp((s.turnRate || 0) * (s.speed || 0) * 0.025, -0.2, 0.2) * (1 - this.postureW);
    this.lean = damp(this.lean, turn, 6, dt);
    if (Math.abs(this.lean) > 1e-4) this._mulLocal(out, B.hips, qAxisAngle(this._q3, 0, 0, 1, -this.lean));
    // ---------------- smoothing ----------------
    if (this.first) { this.q.set(out); this.hips.set(hips); this.first = false; }
    else {
      const k = 1 - Math.exp(-30 * dt);
      for (let b = 0; b < NB; b++) {
        const o = b * 4;
        fq[0] = this.q[o]; fq[1] = this.q[o + 1]; fq[2] = this.q[o + 2]; fq[3] = this.q[o + 3];
        bq[0] = out[o]; bq[1] = out[o + 1]; bq[2] = out[o + 2]; bq[3] = out[o + 3];
        qSlerp(fq, fq, bq, k);
        this.q[o] = fq[0]; this.q[o + 1] = fq[1]; this.q[o + 2] = fq[2]; this.q[o + 3] = fq[3];
      }
      for (let i = 0; i < 3; i++) this.hips[i] += (hips[i] - this.hips[i]) * k;
    }
    return this.events;
  }
  _mulLocal(arr, b, q) {
    const o = b * 4, cur = [arr[o], arr[o + 1], arr[o + 2], arr[o + 3]];
    qMul(cur, cur, q);
    arr[o] = cur[0]; arr[o + 1] = cur[1]; arr[o + 2] = cur[2]; arr[o + 3] = cur[3];
  }
}

const boneCache = new Map();
function clipBones(clip) {
  if (boneCache.has(clip)) return boneCache.get(clip);
  const set = new Set();
  for (const c of clip.mask) if (c < ROOT) set.add(Math.floor(c / 3));
  const arr = [...set];
  boneCache.set(clip, arr);
  return arr;
}
const MIRROR_PAIRS = [[B.armL, B.armR], [B.foreL, B.foreR], [B.handL, B.handR], [B.thighL, B.thighR], [B.shinL, B.shinR], [B.footL, B.footR]];
function mirrorPose(p) {
  for (const [l, r] of MIRROR_PAIRS) for (let k = 0; k < 3; k++) { const a = p[l * 3 + k]; p[l * 3 + k] = p[r * 3 + k]; p[r * 3 + k] = a; }
  for (let b = 0; b < NB; b++) { p[b * 3 + 1] = -p[b * 3 + 1]; p[b * 3 + 2] = -p[b * 3 + 2]; }
  p[ROOT + 2] = -p[ROOT + 2]; p[ROOT + 4] = -p[ROOT + 4];
}
void POSE_LEN; void smoothstep;
