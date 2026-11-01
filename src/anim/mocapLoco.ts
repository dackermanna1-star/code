import * as THREE from 'three';
import data from './mocap/cmu.json';
import { B, SkeletonDef } from './skeleton';
import type { PoseParams } from './solver';
import type { LocoInput, Locomotion, StanceDef } from './locomotion';
import { clamp, clamp01, DEG, lerp, rotY, smoothstep, springDamper, wrapAngle } from '../core/math';

/**
 * Motion-captured locomotion for every fighter (the player and the enemies).
 *
 * The tracks (src/anim/mocap/cmu.json, built by tools/mocap/convert.py from the CMU Graphics Lab
 * Motion Capture Database) are retargeted, root-relative and normalised by leg / arm length: a
 * boxing-stance idle loop plus gait cycles (walk, jog, run, sprint, backward walk, side-step
 * shuffles), all starting at the left foot's touchdown, with seamless loops and one fighter's
 * posture. Each frame the driver
 *  - samples the tracks on splines and blends the idle with the cycles by speed and direction
 *    (cycles phase-locked to one clock; the direction weights glide, never swap),
 *  - warps cadence and stride so the clip speed matches the character's real speed,
 *  - turns the legs towards the travel direction when the facing lags behind it,
 *  - locks planted feet in world space (a foot left behind takes a step to catch up; a leg at full
 *    stretch lowers the hips a little, on a spring),
 *  - aims the knees over the toes, layers the guard, the block and the look-at on the upper body,
 * and hands the result to the IK solver as effector targets, so the motion fits this skeleton.
 */
type V3 = [number, number, number];
type Q4 = [number, number, number, number];
interface MFrame {
  hp: V3; hq: Q4; sp: Q4; ch: Q4; nk: Q4; hd: Q4;
  aL: V3; aR: V3; fL: Q4; fR: Q4; tL: number; tR: number; kL: V3; kR: V3;
  wL: V3; wR: V3; eL: V3; eR: V3; dL: V3; dR: V3; c: number;
}
type FootKey = 'aL' | 'aR' | 'kL' | 'kR';
interface MClip {
  name: string; kind: 'cycle' | 'loop'; dur: number; speed: number; dir: [number, number]; frames: MFrame[];
  /** Where each ankle / knee sits on average (x, z): stride warping scales the steps about it. */
  mean: Record<FootKey, [number, number]>;
}

const CLIPS = new Map<string, MClip>((data as unknown as { clips: MClip[] }).clips.map((c) => [c.name, c]));
const FEET: readonly FootKey[] = ['aL', 'aR', 'kL', 'kR'];
for (const c of CLIPS.values()) {
  const m = {} as MClip['mean'];
  for (const k of FEET) m[k] = [c.frames.reduce((a, f) => a + f[k][0], 0) / c.frames.length, c.frames.reduce((a, f) => a + f[k][2], 0) / c.frames.length];
  c.mean = m;
}
const clip = (n: string) => {
  const c = CLIPS.get(n);
  if (!c) throw new Error('mocap clip missing: ' + n);
  return c;
};

const VKEYS = ['aL', 'aR', 'kL', 'kR', 'wL', 'wR', 'eL', 'eR', 'dL', 'dR'] as const;
const QKEYS = ['hq', 'sp', 'ch', 'nk', 'hd', 'fL', 'fR'] as const;
const dot4 = (a: Q4, b: Q4) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

/** Weighted accumulation of frames (quaternions sign-aligned, normalised at the end). */
class Blend {
  w = 0;
  hp = new THREE.Vector3();
  q: Record<'hq' | 'sp' | 'ch' | 'nk' | 'hd' | 'fL' | 'fR', THREE.Quaternion> = {
    hq: new THREE.Quaternion(), sp: new THREE.Quaternion(), ch: new THREE.Quaternion(), nk: new THREE.Quaternion(), hd: new THREE.Quaternion(), fL: new THREE.Quaternion(), fR: new THREE.Quaternion(),
  };
  v: Record<'aL' | 'aR' | 'kL' | 'kR' | 'wL' | 'wR' | 'eL' | 'eR' | 'dL' | 'dR', THREE.Vector3> = {
    aL: new THREE.Vector3(), aR: new THREE.Vector3(), kL: new THREE.Vector3(), kR: new THREE.Vector3(), wL: new THREE.Vector3(), wR: new THREE.Vector3(), eL: new THREE.Vector3(), eR: new THREE.Vector3(), dL: new THREE.Vector3(), dR: new THREE.Vector3(),
  };
  m: Record<FootKey, THREE.Vector2> = { aL: new THREE.Vector2(), aR: new THREE.Vector2(), kL: new THREE.Vector2(), kR: new THREE.Vector2() };
  tL = 0;
  tR = 0;
  cL = 0;
  cR = 0;
  reset() {
    this.w = 0;
    this.hp.set(0, 0, 0);
    for (const k of FEET) this.m[k].set(0, 0);
    for (const k in this.q) this.q[k as keyof Blend['q']].set(0, 0, 0, 0);
    for (const k in this.v) this.v[k as keyof Blend['v']].set(0, 0, 0);
    this.tL = this.tR = this.cL = this.cR = 0;
  }
  /**
   * Add clip `c` at fractional frame `fi` (wrapping) with weight `w`. Samples are joined by
   * Catmull-Rom splines: straight lines between samples put a kink in every track at every
   * sample (the hips jolting at the clip's sample rate), a cubic is smooth through them.
   */
  add(c: MClip, fi: number, w: number) {
    if (w <= 1e-4) return;
    const n = c.frames.length;
    const fl = Math.floor(fi);
    const i1 = ((fl % n) + n) % n;
    const F = c.frames;
    const a = F[(i1 + n - 1) % n], b = F[i1], cc = F[(i1 + 1) % n], d = F[(i1 + 2) % n];
    const t = fi - fl, t2 = t * t, t3 = t2 * t;
    const k0 = 0.5 * (-t3 + 2 * t2 - t), k1 = 0.5 * (3 * t3 - 5 * t2 + 2), k2 = 0.5 * (-3 * t3 + 4 * t2 + t), k3 = 0.5 * (t3 - t2);
    const C = (x0: number, x1: number, x2: number, x3: number) => x0 * k0 + x1 * k1 + x2 * k2 + x3 * k3;
    this.w += w;
    for (const k of FEET) {
      this.m[k].x += c.mean[k][0] * w;
      this.m[k].y += c.mean[k][1] * w;
    }
    this.hp.x += C(a.hp[0], b.hp[0], cc.hp[0], d.hp[0]) * w;
    this.hp.y += C(a.hp[1], b.hp[1], cc.hp[1], d.hp[1]) * w;
    this.hp.z += C(a.hp[2], b.hp[2], cc.hp[2], d.hp[2]) * w;
    for (const k of VKEYS) {
      const v0 = a[k], v1 = b[k], v2 = cc[k], v3 = d[k], o = this.v[k];
      o.x += C(v0[0], v1[0], v2[0], v3[0]) * w;
      o.y += C(v0[1], v1[1], v2[1], v3[1]) * w;
      o.z += C(v0[2], v1[2], v2[2], v3[2]) * w;
    }
    for (const k of QKEYS) {
      const q1 = b[k], o = this.q[k];
      // neighbours into q1's hemisphere, spline per component (renormalised in finish())
      const q0 = a[k], q2 = cc[k], q3 = d[k];
      const s0 = dot4(q0, q1) < 0 ? -1 : 1, s2 = dot4(q2, q1) < 0 ? -1 : 1, s3 = dot4(q3, q1) < 0 ? -1 : 1;
      const x = C(q0[0] * s0, q1[0], q2[0] * s2, q3[0] * s3), y = C(q0[1] * s0, q1[1], q2[1] * s2, q3[1] * s3);
      const z = C(q0[2] * s0, q1[2], q2[2] * s2, q3[2] * s3), ww = C(q0[3] * s0, q1[3], q2[3] * s2, q3[3] * s3);
      // sign-align with the running sum
      const s = o.x * x + o.y * y + o.z * z + o.w * ww < 0 ? -w : w;
      o.x += x * s;
      o.y += y * s;
      o.z += z * s;
      o.w += ww * s;
    }
    this.tL += C(a.tL, b.tL, cc.tL, d.tL) * w;
    this.tR += C(a.tR, b.tR, cc.tR, d.tR) * w;
    const ca = t < 0.5 ? b.c : cc.c;
    this.cL += (ca & 1 ? 1 : 0) * w;
    this.cR += (ca & 2 ? 1 : 0) * w;
  }
  finish() {
    const iw = 1 / Math.max(1e-6, this.w);
    this.hp.multiplyScalar(iw);
    for (const k of FEET) this.m[k].multiplyScalar(iw);
    for (const k in this.v) this.v[k as keyof Blend['v']].multiplyScalar(iw);
    for (const k in this.q) {
      const q = this.q[k as keyof Blend['q']];
      if (q.lengthSq() < 1e-12) q.set(0, 0, 0, 1);
      q.normalize();
    }
    this.tL *= iw;
    this.tR *= iw;
    this.cL *= iw;
    this.cR *= iw;
  }
}

interface FootLock {
  /** Locked world position (xz) and world yaw correction while planted. */
  x: number;
  z: number;
  yawW: number;
  /** 0..1 lock weight (eases in at touchdown, out at lift-off). */
  w: number;
  on: boolean;
  /** Re-step in progress: from the old lock to the free target. */
  step: number;
  sx: number;
  sz: number;
  /** The twist the lock held at lift-off / a re-step's start, eased out from there. */
  dyaw: number;
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);
const _hipQ = new THREE.Quaternion();
const _sQ = new THREE.Quaternion();
const _cQ = new THREE.Quaternion();
const _chest = new THREE.Vector3();
const _fwd = new THREE.Vector3();

const FWD_CHAIN = ['walk', 'jog', 'run', 'sprint'];
const IDLE_HIP_MEAN = (() => {
  const f = clip('idle').frames;
  return f.reduce((a, x) => a + x.hp[1], 0) / f.length;
})();

export class MocapDriver {
  private idle = clip('idle');
  private cyc = { walk: clip('walk'), jog: clip('jog'), run: clip('run'), sprint: clip('sprint'), back: clip('back'), sideL: clip('sideL'), sideR: clip('sideR') };
  private blend = new Blend();
  /** Shared gait phase (0..1, 0 = left touchdown) and the idle loop clock. */
  phase = 0;
  private idleT = Math.random() * 2;
  /** Per-character variety: idle tempo and how much of the boxer's bounce shows. */
  idleRate = 1;
  bounce = 1;
  private lvx = 0;
  private lvz = 0;
  private moveSm = 0;
  private legYaw = 0;
  private lookSm = { x: 0, v: 0 };
  private runK = 0;
  private drop = { x: 0, v: 0 };
  private theta = 0;
  private dirW = [1, 0, 0, 0];
  private locks: [FootLock, FootLock] = [mkLock(), mkLock()];
  private prevC = [1, 1];
  private freeYaw = [0, 0];
  private poleYaw = [0, 0];
  private snapPole = true;
  private limpC = 0;
  private initDone = false;

  /** Feet start locked where the previous animation left them (after a clip). */
  init(L: Locomotion, feet: [THREE.Vector3, THREE.Vector3], yaws: [number, number]) {
    for (let i = 0; i < 2; i++) {
      const k = this.locks[i];
      k.x = feet[i].x;
      k.z = feet[i].z;
      k.yawW = yaws[i];
      k.w = 1;
      k.on = true;
      k.step = 1;
      L.feet[i].pos.set(feet[i].x, 0, feet[i].z);
      L.feet[i].yaw = yaws[i];
    }
    this.prevC = [1, 1];
    this.initDone = true;
    // (knees aim afresh; the hips start undipped - the animator blends from the clip's pose)
    this.snapPole = true;
    this.drop.x = this.drop.v = 0;
  }

  update(L: Locomotion, inp: LocoInput, def: SkeletonDef, st: StanceDef, dt: number): PoseParams {
    const prm = L.params;
    const S = def.scale;
    const legLen = def.lenThigh + def.lenShin;
    const armLen = def.lenUpperArm + def.lenForeArm;
    // ------------------------------------------------------------- what to play
    const [lx, lz] = rotY(inp.velX, inp.velZ, -inp.rootYaw);
    const kv = 1 - Math.exp(-12 * dt);
    this.lvx += (lx - this.lvx) * kv;
    this.lvz += (lz - this.lvz) * kv;
    const sp = Math.hypot(this.lvx, this.lvz);
    const vn = sp / legLen; // legs per second
    // quick to get going, slower to settle back into the stance (a fighter edging about at a
    // crawl doesn't flicker between the two)
    const mv = smoothstep(0.12 * S, 0.5 * S, sp);
    this.moveSm += (mv - this.moveSm) * (1 - Math.exp(-(mv > this.moveSm ? 8 : 3.5) * dt));
    const move = this.moveSm;
    // travel direction relative to the facing (0 forward, +pi/2 to the left); a crawl's velocity
    // points anywhere, so the direction only updates while really moving
    if (sp > 0.08 * S) this.theta = Math.atan2(this.lvx, this.lvz);
    const theta = this.theta;
    // directional clips only at walking pace; at speed the legs run forwards and turn instead
    const dirK = 1 - smoothstep(2.0, 3.0, vn);
    const at = Math.abs(theta);
    let tF = 1, tS = 0, tB = 0;
    if (dirK > 0) {
      const SIDE = 104 * DEG, BACK = 173 * DEG;
      if (at <= SIDE) {
        tS = at / SIDE;
        tF = 1 - tS;
      } else {
        tB = clamp01((at - SIDE) / (BACK - SIDE));
        tS = 1 - tB;
        tF = 0;
      }
      tF = lerp(1, tF, dirK);
      tS *= dirK;
      tB *= dirK;
    }
    // the weights (forward, side-step left, side-step right, backwards) follow smoothly: turning
    // from a left to a right side-step, or forwards to backwards, blends the clips rather than
    // swapping one for the other between two frames (the hips jumped)
    const dw = this.dirW, kd = 1 - Math.exp(-10 * dt);
    dw[0] += (tF - dw[0]) * kd;
    dw[1] += ((theta >= 0 ? tS : 0) - dw[1]) * kd;
    dw[2] += ((theta >= 0 ? 0 : tS) - dw[2]) * kd;
    dw[3] += (tB - dw[3]) * kd;
    const [wF, wSL, wSR, wB] = dw;
    const { sideL, sideR, back } = this.cyc;
    // forward chain by speed
    const chain = FWD_CHAIN.map((n) => this.cyc[n as keyof MocapDriver['cyc']]);
    const fw = [0, 0, 0, 0];
    if (vn <= chain[0].speed) fw[0] = 1;
    else if (vn >= chain[3].speed) fw[3] = 1;
    else
      for (let i = 0; i < 3; i++) {
        if (vn >= chain[i].speed && vn <= chain[i + 1].speed) {
          const t = (vn - chain[i].speed) / (chain[i + 1].speed - chain[i].speed);
          fw[i] = 1 - t;
          fw[i + 1] = t;
        }
      }
    // natural cycle duration and speed of the blend
    let dur = 0, nat = 0;
    for (let i = 0; i < 4; i++) {
      dur += fw[i] * wF * chain[i].dur;
      nat += fw[i] * wF * chain[i].speed;
    }
    dur += wSL * sideL.dur + wSR * sideR.dur + wB * back.dur;
    nat += wSL * sideL.speed + wSR * sideR.speed + wB * back.speed;
    // match the real speed: half by cadence, half by stride length
    const r = vn > 1e-3 && nat > 1e-3 ? vn / nat : 1;
    const cad = clamp(Math.sqrt(r), 0.72, 1.3);
    const stride = clamp(r / cad, 0.3, 1.35);
    const limpCad = lerp(1, 0.86, L.limpSm);
    if (move > 0.01) this.phase = (this.phase + (dt / Math.max(0.2, dur)) * cad * limpCad) % 1;
    this.idleT += dt * this.idleRate;

    // ------------------------------------------------------------- sample + blend
    const bl = this.blend;
    bl.reset();
    const idleW = 1 - move;
    bl.add(this.idle, (this.idleT / this.idle.dur) * this.idle.frames.length, idleW);
    if (move > 0) {
      for (let i = 0; i < 4; i++) bl.add(chain[i], this.phase * chain[i].frames.length, move * wF * fw[i]);
      bl.add(sideL, this.phase * sideL.frames.length, move * wSL);
      bl.add(sideR, this.phase * sideR.frames.length, move * wSR);
      bl.add(back, this.phase * back.frames.length, move * wB);
    }
    bl.finish();
    if (this.bounce !== 1 && idleW > 0) bl.hp.y = lerp(bl.hp.y, IDLE_HIP_MEAN + (bl.hp.y - IDLE_HIP_MEAN) * this.bounce, idleW);

    // ------------------------------------------------------------- body
    // stride warp along the travel direction, legs turned towards it when the facing lags
    const tdx = sp > 1e-3 ? this.lvx / sp : 0, tdz = sp > 1e-3 ? this.lvz / sp : 1;
    const warp = lerp(1, stride, move);
    const wantLeg = sp > 0.3 * S && at < 75 * DEG ? clamp(theta, -1.05, 1.05) * (1 - dirK * 0.85) : 0;
    this.legYaw += (wantLeg - this.legYaw) * (1 - Math.exp(-8 * dt));
    const ly = this.legYaw;
    const cy = Math.cos(ly), sy = Math.sin(ly);
    const hx = bl.hp.x * legLen, hz = bl.hp.z * legLen;
    const legXZ = (k: FootKey, out: THREE.Vector3, y: number) => {
      const v = bl.v[k], m = bl.m[k];
      let x = v.x * legLen - hx, z = v.z * legLen - hz;
      // longer / shorter steps: scale the foot's travel about its average place (not about the
      // hips, which would also squeeze or spread the stance of a side-step)
      const along = (v.x - m.x) * legLen * tdx + (v.z - m.y) * legLen * tdz;
      x += tdx * along * (warp - 1);
      z += tdz * along * (warp - 1);
      // rotate about the hips by the leg yaw
      const rx = x * cy + z * sy, rz = -x * sy + z * cy;
      return out.set(hx + rx, y, hz + rz);
    };
    this.runK = smoothstep(2.4, 3.4, vn) * move;
    const runK = this.runK;
    // a limp: the hips dip over the injured (left) leg while it carries the weight
    this.limpC += (clamp01(bl.cL) - this.limpC) * (1 - Math.exp(-12 * dt));
    const limpDip = L.limpSm * 0.035 * S * this.limpC * move;
    prm.hipsPos.set(hx, def.offsets[B.hips].y + bl.hp.y * legLen - L.hunchSm * 0.04 * S - limpDip, hz);
    _q.setFromAxisAngle(_Y, ly);
    prm.hipsRot.copy(_q).multiply(bl.q.hq);
    // the trunk keeps facing where the character faces: counter-turn the spine
    _q2.setFromAxisAngle(_Y, -ly * 0.55);
    prm.spine.copy(bl.q.sp).premultiply(_q2);
    _q2.setFromAxisAngle(_Y, -ly * 0.45);
    prm.chest.copy(bl.q.ch).premultiply(_q2);
    prm.neck.copy(bl.q.nk);
    prm.head.copy(bl.q.hd);
    // look towards the threat: spread over spine, chest and head
    // (a spring: a new target starts the head turning smoothly instead of at full speed)
    springDamper(this.lookSm, this.lookSm.x + wrapAngle(inp.look - this.lookSm.x), 0.07, dt);
    const look = this.lookSm.x;
    const hunch = L.hunchSm * 14 * DEG;
    prm.spine.multiply(_q.setFromEuler(_e.set(hunch * 0.5, look * 0.15, 0)));
    prm.chest.multiply(_q.setFromEuler(_e.set(hunch * 0.5, look * 0.2, 0)));
    prm.neck.multiply(_q.setFromEuler(_e.set(-hunch * 0.3, look * 0.25, 0)));
    prm.head.multiply(_q.setFromEuler(_e.set(-hunch * 0.4, look * 0.4, 0)));

    // ------------------------------------------------------------- feet (+ world locks)
    for (let i = 0; i < 2; i++) {
      const side_ = i === 0 ? 'L' : 'R';
      const fp = prm.feet[i];
      const av = bl.v[('a' + side_) as 'aL'];
      legXZ(('a' + side_) as FootKey, fp.pos, def.ankleHeight + av.y * legLen);
      fp.rot.copy(i === 0 ? bl.q.fL : bl.q.fR).premultiply(_q.setFromAxisAngle(_Y, ly));
      fp.toe = clamp(i === 0 ? bl.tL : bl.tR, -10, 60);
      const kv3 = bl.v[('k' + side_) as 'kL'];
      legXZ(('k' + side_) as FootKey, _v, kv3.y * legLen);
      // knee direction: the mocap knee, pulled towards the toes - a bent knee falling inwards
      // (the step-together side-step, the stance) reads as knock-kneed
      // (the mocap knee counts as much as it is clearly bent: on a straight leg its direction
      // is noise; the toes always give a steady one)
      let px = _v.x - (hx + fp.pos.x) * 0.5, pz = _v.z - (hz + fp.pos.z) * 0.5;
      const pl = Math.hypot(px, pz);
      const kw = 0.45 * smoothstep(0.02 * legLen, 0.08 * legLen, pl) / Math.max(pl, 1e-6);
      const toe = footHeading(fp.rot), tw = 0.55 * footFlat(fp.rot);
      px = px * kw + Math.sin(toe) * tw + sy * 0.08;
      pz = pz * kw + Math.cos(toe) * tw + cy * 0.08;
      // (followed, not jumped to: the knee never swings round in a frame)
      const pa = Math.atan2(px, pz);
      this.poleYaw[i] = this.snapPole ? pa : this.poleYaw[i] + wrapAngle(pa - this.poleYaw[i]) * (1 - Math.exp(-18 * dt));
      fp.pole.set(Math.sin(this.poleYaw[i]), 0.02, Math.cos(this.poleYaw[i]));
      fp.swing = false;
      this.lockFoot(L, i, fp, inp, i === 0 ? bl.cL : bl.cR, legLen, dt);
    }

    this.snapPole = false;

    // ------------------------------------------------------------- hip drop
    // lower the hips a little when a leg can't reach its target (a locked foot left behind, a
    // longer stride) - before the arms are placed, so the hands ride down with the shoulders.
    // The dip eases in and out on a critically damped spring: chasing the target exponentially
    // (fast down, slow up) kinked the hips' motion every time a foot locked or let go - a pop
    // each step. What a small dip can't cover, the foot makes up with a step.
    {
      let want = 0;
      const reach = legLen * 0.985;
      for (let i = 0; i < 2; i++) {
        const fp = prm.feet[i];
        const hj = _v.copy(def.offsets[i === 0 ? B.thighL : B.thighR]).applyQuaternion(prm.hipsRot).add(prm.hipsPos);
        const dx = fp.pos.x - hj.x, dz = fp.pos.z - hj.z, dy = fp.pos.y - hj.y;
        const h2 = reach * reach - dx * dx - dz * dz;
        const need = h2 > 0 ? dy + Math.sqrt(h2) : -0.3 * S;
        if (need < want) want = need;
      }
      springDamper(this.drop, Math.max(want, -0.05 * S), 0.07, dt);
      prm.hipsPos.y += Math.min(0, this.drop.x);
      // (the dip aims for a knee that's not quite straight; the leg only fails at full stretch)
      const full = legLen * 0.999;
      for (let i = 0; i < 2; i++) {
        const fp = prm.feet[i];
        const hj = _v.copy(def.offsets[i === 0 ? B.thighL : B.thighR]).applyQuaternion(prm.hipsRot).add(prm.hipsPos);
        const dy = fp.pos.y - hj.y;
        const r2 = full * full - dy * dy;
        const dx = fp.pos.x - hj.x, dz = fp.pos.z - hj.z, d2 = dx * dx + dz * dz;
        if (r2 > 0 && d2 > r2) {
          // as far as the leg goes (the IK would stop there anyway); a foot clearly left behind
          // steps to catch up - one foot at a time, from where it visibly is
          const k = Math.sqrt(r2 / d2);
          const excess = Math.sqrt(d2) * (1 - k);
          fp.pos.x = hj.x + dx * k;
          fp.pos.z = hj.z + dz * k;
          const lk = this.locks[i];
          if (lk.on && lk.step >= 1) {
            lk.dyaw = wrapAngle(lk.yawW - this.freeYaw[i]);
            L.feet[i].swing = true;
            if (excess > 0.025 * S && this.locks[1 - i].step >= 1) {
              const [wx, wz] = rotY(fp.pos.x, fp.pos.z, inp.rootYaw);
              lk.step = 0;
              lk.sx = inp.rootX + wx;
              lk.sz = inp.rootZ + wz;
            } else {
              // only just out of reach: this is the push-off - the heel was coming up anyway,
              // the foot lets go of the floor a moment early
              lk.on = false;
            }
          }
        }
      }
    }

    // ------------------------------------------------------------- arms
    _hipQ.copy(prm.hipsRot);
    _sQ.copy(_hipQ).multiply(prm.spine);
    _cQ.copy(_sQ).multiply(prm.chest);
    _chest.copy(def.offsets[B.spine]).applyQuaternion(_hipQ).add(prm.hipsPos);
    _chest.add(_v.copy(def.offsets[B.chest]).applyQuaternion(_sQ));
    // the boxing idle brings its own guard; walking clips swing the arms, so a guard is laid over
    // them in a fight (loosening when running); a block or a weapon always wins
    const fightGuard = L.guardSm * (1 - runK * 0.9);
    const guardOver = fightGuard * move;
    const t = L.time;
    for (let s = 0; s < 2; s++) {
      const sg = s === 0 ? 1 : -1;
      const hp = prm.hands[s];
      const side_ = s === 0 ? 'L' : 'R';
      const cl = s === 0 ? B.clavL : B.clavR, ua = s === 0 ? B.uarmL : B.uarmR;
      const shoulder = _v2.copy(def.offsets[cl]).add(def.offsets[ua]);
      // mocap hand (chest space, relative to the shoulder)
      const w = bl.v[('w' + side_) as 'wL'], e = bl.v[('e' + side_) as 'eL'], d = bl.v[('d' + side_) as 'dL'];
      const mx = shoulder.x + w.x * armLen, my = shoulder.y + w.y * armLen, mz = shoulder.z + w.z * armLen;
      // guard (stance, chest space)
      const g = s === 0 ? st.lh : st.rh;
      const bob = Math.sin(t * 2.3 + s * 1.7) * 0.006;
      let gx = g[0] * S, gy = (g[1] + bob) * S, gz = g[2] * S;
      if (L.blockSm > 0.01) {
        gx = lerp(gx, sg * 0.07 * S, L.blockSm);
        gy = lerp(gy, 0.31 * S, L.blockSm);
        gz = lerp(gz, 0.24 * S, L.blockSm);
      }
      const weaponHand = (inp.style === 'weapon1h' && s === 1) || inp.style === 'weapon2h';
      // (the boxer's own guard drops to his chest now and then: a third of the stance's guard
      // keeps a fighter's hands up even standing)
      const gw = Math.max(guardOver + fightGuard * 0.3 * (1 - move), L.blockSm, weaponHand ? 1 : 0);
      hp.pos.set(lerp(mx, gx, gw), lerp(my, gy, gw), lerp(mz, gz, gw)).applyQuaternion(_cQ).add(_chest);
      // hurt: a hand pressed to the injured side; a broken arm hangs; a taunt spreads the arms
      if (L.holdSm > 0.01 && Math.sign(inp.holdSide) === sg) hp.pos.lerp(_fwd.set(-sg * 0.02 * S, 1.05 * S, 0.12 * S), L.holdSm * 0.85);
      if (inp.brokenArm === sg) hp.pos.set(sg * 0.24 * S, 0.82 * S, 0.06 * S + w.z * 0.05 * S);
      if (L.tauntSm > 0.01) hp.pos.lerp(_fwd.set(sg * 0.5 * S, 1.35 * S, 0.25 * S), L.tauntSm);
      // elbow pole from the mocap elbow, towards the guard pole as the guard takes over
      const ex = shoulder.x + e.x * armLen - (shoulder.x + mx) * 0.5, ey = shoulder.y + e.y * armLen - (shoulder.y + my) * 0.5, ez = shoulder.z + e.z * armLen - (shoulder.z + mz) * 0.5;
      _v.set(ex, ey, ez).normalize().lerp(_fwd.set(sg * 0.35, -1, -0.2).normalize(), gw).applyQuaternion(_cQ);
      hp.pole.copy(_v);
      hp.roll = lerp(-6, s === 0 ? st.lhRoll : st.rhRoll, gw);
      hp.dir = hp.dir ?? new THREE.Vector3();
      hp.dir.set(d.x, d.y, d.z).applyQuaternion(_cQ);
      hp.dirW = 0.55 * (1 - gw);
    }
    prm.shrug[0] = prm.shrug[1] = L.blockSm * 6 + L.hunchSm * 4;
    prm.autoHipDrop = false;
    L.bob = 0;
    return prm;
  }

  /**
   * Planted feet stay put in the world: lock at touchdown, ease out at lift-off. A locked foot the
   * body has turned or moved too far away from takes a quick step to where the clip wants it.
   */
  private lockFoot(L: Locomotion, i: number, fp: PoseParams['feet'][number], inp: LocoInput, contact: number, legLen: number, dt: number) {
    const k = this.locks[i];
    const f = L.feet[i];
    // (hysteresis: a blend of clips can hover around half contact)
    const c = this.prevC[i] ? (contact > 0.35 ? 1 : 0) : contact > 0.65 ? 1 : 0;
    // free target in world
    const [wx, wz] = rotY(fp.pos.x, fp.pos.z, inp.rootYaw);
    const tx = inp.rootX + wx, tz = inp.rootZ + wz;
    const freeYawW = inp.rootYaw + footHeading(fp.rot);
    this.freeYaw[i] = freeYawW;
    if (c && !this.prevC[i] && k.step >= 1) {
      // touchdown: plant right here (the lock starts where the foot is, so it can engage at once)
      k.on = true;
      k.x = tx;
      k.z = tz;
      k.yawW = freeYawW;
      k.w = 1;
      f.plantedTime = 0;
      f.swing = false;
    } else if (!c && this.prevC[i]) {
      // lift-off: the twist the lock held is let go of as it was (the free foot's heading isn't
      // worth following once it pitches up into the swing)
      k.on = false;
      k.dyaw = wrapAngle(k.yawW - freeYawW);
      f.swing = true;
    }
    this.prevC[i] = c;
    // left behind (sharp turn, a change of clip): step over to the free target
    if (k.on && k.step >= 1 && (Math.hypot(k.x - tx, k.z - tz) > 0.3 * legLen || Math.abs(wrapAngle(k.yawW - freeYawW)) > 0.6)) {
      k.step = 0;
      k.sx = k.x;
      k.sz = k.z;
      k.dyaw = wrapAngle(k.yawW - freeYawW);
      f.swing = true;
    }
    let x = tx, z = tz, lift = 0, turn = k.w;
    if (k.step < 1) {
      k.step = Math.min(1, k.step + dt / 0.2);
      const s = smoothstep(0, 1, k.step);
      x = lerp(k.sx, tx, s);
      z = lerp(k.sz, tz, s);
      lift = Math.sin(Math.PI * k.step) * 0.07 * legLen;
      // the foot turns to its new heading during the step (not at the start of it)
      turn = 1 - s;
      if (k.step >= 1) {
        k.x = tx;
        k.z = tz;
        k.yawW = freeYawW;
        k.on = c === 1;
        k.w = k.on ? 1 : 0;
        f.swing = !k.on;
        f.plantedTime = 0;
      } else k.w = 0;
    } else {
      if (!k.on) k.w += (0 - k.w) * (1 - Math.exp(-14 * dt));
      x = lerp(tx, k.x, k.w);
      z = lerp(tz, k.z, k.w);
    }
    // back to root space
    const [rx, rz] = rotY(x - inp.rootX, z - inp.rootZ, -inp.rootYaw);
    fp.pos.x = rx;
    fp.pos.z = rz;
    fp.pos.y += lift;
    if (k.step >= 1) turn = k.w;
    if (turn > 0.01) {
      // planted feet don't spin on the floor
      const dyaw = (k.on && k.step >= 1 ? wrapAngle(k.yawW - freeYawW) : k.dyaw) * turn;
      fp.rot.premultiply(_q2.setFromAxisAngle(_Y, dyaw));
    }
    f.pos.set(x, 0, z);
    f.yaw = inp.rootYaw + footHeading(fp.rot);
    if (!f.swing) f.plantedTime += dt;
    f.t = 0;
    if (!this.initDone) this.initDone = true;
  }
}

const _e = new THREE.Euler();
const _hf = new THREE.Vector3();
/**
 * Heading of a foot (the toe direction on the ground). Only meaningful while the foot is not
 * pitched up or down steeply - planted, or weighted by footFlat() - which is all it's used for.
 * (A formula switching to the up axis by the sign of the pitch made a rolled foot's heading jump
 * by twice its roll whenever it passed through flat.)
 */
function footHeading(q: THREE.Quaternion) {
  _hf.set(0, 0, 1).applyQuaternion(q);
  return Math.atan2(_hf.x, _hf.z);
}
/** 1 for a foot near flat, falling to 0 as it pitches towards vertical. */
function footFlat(q: THREE.Quaternion) {
  _hf.set(0, 0, 1).applyQuaternion(q);
  return smoothstep(0.5, 0.85, Math.hypot(_hf.x, _hf.z));
}

function mkLock(): FootLock {
  return { x: 0, z: 0, yawW: 0, w: 0, on: false, step: 1, sx: 0, sz: 0, dyaw: 0 };
}
