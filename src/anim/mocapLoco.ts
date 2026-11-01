import * as THREE from 'three';
import data from './mocap/cmu.json';
import { B, SkeletonDef } from './skeleton';
import type { PoseParams } from './solver';
import type { LocoInput, Locomotion, StanceDef } from './locomotion';
import { clamp, clamp01, DEG, lerp, rotY, smoothstep, wrapAngle } from '../core/math';

/**
 * Motion-captured locomotion for the player character.
 *
 * The tracks (src/anim/mocap/cmu.json, built by tools/mocap/convert.py from the CMU Graphics Lab
 * Motion Capture Database) are retargeted, root-relative and normalised by leg / arm length: a
 * boxing-stance idle loop plus gait cycles (walk, jog, run, sprint, backward walk, side-steps),
 * all starting at the left foot's touchdown. Each frame the driver
 *  - blends the idle with the cycles by speed and direction, cycles phase-locked to one clock,
 *  - warps cadence and stride so the clip speed matches the character's real speed,
 *  - turns the legs towards the travel direction when the facing lags behind it,
 *  - locks planted feet in world space (re-stepping when a locked foot is left too far behind),
 *  - layers the guard, the block and the look-at on the upper body,
 * and hands the result to the IK solver as effector targets, so the motion fits this skeleton.
 */
type V3 = [number, number, number];
type Q4 = [number, number, number, number];
interface MFrame {
  hp: V3; hq: Q4; sp: Q4; ch: Q4; nk: Q4; hd: Q4;
  aL: V3; aR: V3; fL: Q4; fR: Q4; tL: number; tR: number; kL: V3; kR: V3;
  wL: V3; wR: V3; eL: V3; eR: V3; dL: V3; dR: V3; c: number;
}
interface MClip { name: string; kind: 'cycle' | 'loop'; dur: number; speed: number; dir: [number, number]; frames: MFrame[] }

const CLIPS = new Map<string, MClip>((data as unknown as { clips: MClip[] }).clips.map((c) => [c.name, c]));
const clip = (n: string) => {
  const c = CLIPS.get(n);
  if (!c) throw new Error('mocap clip missing: ' + n);
  return c;
};

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
  tL = 0;
  tR = 0;
  cL = 0;
  cR = 0;
  reset() {
    this.w = 0;
    this.hp.set(0, 0, 0);
    for (const k in this.q) this.q[k as keyof Blend['q']].set(0, 0, 0, 0);
    for (const k in this.v) this.v[k as keyof Blend['v']].set(0, 0, 0);
    this.tL = this.tR = this.cL = this.cR = 0;
  }
  /** Add clip `c` at fractional frame `fi` (wrapping) with weight `w`. */
  add(c: MClip, fi: number, w: number) {
    if (w <= 1e-4) return;
    const n = c.frames.length;
    const i0 = ((Math.floor(fi) % n) + n) % n;
    const i1 = (i0 + 1) % n;
    const t = fi - Math.floor(fi);
    const a = c.frames[i0], b = c.frames[i1];
    const L = (x: number, y: number) => x + (y - x) * t;
    this.w += w;
    this.hp.x += L(a.hp[0], b.hp[0]) * w;
    this.hp.y += L(a.hp[1], b.hp[1]) * w;
    this.hp.z += L(a.hp[2], b.hp[2]) * w;
    for (const k of ['aL', 'aR', 'kL', 'kR', 'wL', 'wR', 'eL', 'eR', 'dL', 'dR'] as const) {
      const va = a[k], vb = b[k], o = this.v[k];
      o.x += L(va[0], vb[0]) * w;
      o.y += L(va[1], vb[1]) * w;
      o.z += L(va[2], vb[2]) * w;
    }
    for (const k of ['hq', 'sp', 'ch', 'nk', 'hd', 'fL', 'fR'] as const) {
      const qa = a[k], qb = b[k], o = this.q[k];
      // nlerp neighbours, then sign-align with the running sum
      let s = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3] < 0 ? -1 : 1;
      const x = qa[0] + (qb[0] * s - qa[0]) * t, y = qa[1] + (qb[1] * s - qa[1]) * t, z = qa[2] + (qb[2] * s - qa[2]) * t, ww = qa[3] + (qb[3] * s - qa[3]) * t;
      s = o.x * x + o.y * y + o.z * z + o.w * ww < 0 ? -1 : 1;
      o.x += x * w * s;
      o.y += y * w * s;
      o.z += z * w * s;
      o.w += ww * w * s;
    }
    this.tL += L(a.tL, b.tL) * w;
    this.tR += L(a.tR, b.tR) * w;
    const ca = t < 0.5 ? a.c : b.c;
    this.cL += (ca & 1 ? 1 : 0) * w;
    this.cR += (ca & 2 ? 1 : 0) * w;
  }
  finish() {
    const iw = 1 / Math.max(1e-6, this.w);
    this.hp.multiplyScalar(iw);
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

export class MocapDriver {
  private idle = clip('idle');
  private cyc = { walk: clip('walk'), jog: clip('jog'), run: clip('run'), sprint: clip('sprint'), back: clip('back'), sideL: clip('sideL'), sideR: clip('sideR') };
  private blend = new Blend();
  /** Shared gait phase (0..1, 0 = left touchdown) and the idle loop clock. */
  phase = 0;
  private idleT = Math.random() * 2;
  private lvx = 0;
  private lvz = 0;
  private moveSm = 0;
  private legYaw = 0;
  private lookSm = 0;
  private runK = 0;
  private dropSm = 0;
  private locks: [FootLock, FootLock] = [mkLock(), mkLock()];
  private prevC = [1, 1];
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
    this.moveSm += (smoothstep(0.12 * S, 0.5 * S, sp) - this.moveSm) * (1 - Math.exp(-9 * dt));
    const move = this.moveSm;
    const theta = sp > 0.05 ? Math.atan2(this.lvx, this.lvz) : 0; // 0 forward, +pi/2 to the left
    // directional clips only at walking pace; at speed the legs run forwards and turn instead
    const dirK = 1 - smoothstep(2.0, 3.0, vn);
    const at = Math.abs(theta);
    let wF = 1, wS = 0, wB = 0;
    if (dirK > 0) {
      const SIDE = 104 * DEG, BACK = 173 * DEG;
      if (at <= SIDE) {
        wS = at / SIDE;
        wF = 1 - wS;
      } else {
        wB = clamp01((at - SIDE) / (BACK - SIDE));
        wS = 1 - wB;
        wF = 0;
      }
      wF = lerp(1, wF, dirK);
      wS *= dirK;
      wB *= dirK;
    }
    const side = theta >= 0 ? this.cyc.sideL : this.cyc.sideR;
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
    dur += wS * side.dur + wB * this.cyc.back.dur;
    nat += wS * side.speed + wB * this.cyc.back.speed;
    // match the real speed: half by cadence, half by stride length
    const r = vn > 1e-3 && nat > 1e-3 ? vn / nat : 1;
    const cad = clamp(Math.sqrt(r), 0.72, 1.3);
    const stride = clamp(r / cad, 0.3, 1.35);
    if (move > 0.01) this.phase = (this.phase + (dt / Math.max(0.2, dur)) * cad) % 1;
    this.idleT += dt;

    // ------------------------------------------------------------- sample + blend
    const bl = this.blend;
    bl.reset();
    const idleW = 1 - move;
    bl.add(this.idle, (this.idleT / this.idle.dur) * this.idle.frames.length, idleW);
    if (move > 0) {
      for (let i = 0; i < 4; i++) bl.add(chain[i], this.phase * chain[i].frames.length, move * wF * fw[i]);
      bl.add(side, this.phase * side.frames.length, move * wS);
      bl.add(this.cyc.back, this.phase * this.cyc.back.frames.length, move * wB);
    }
    bl.finish();

    // ------------------------------------------------------------- body
    // stride warp along the travel direction, legs turned towards it when the facing lags
    const tdx = sp > 1e-3 ? this.lvx / sp : 0, tdz = sp > 1e-3 ? this.lvz / sp : 1;
    const warp = lerp(1, stride, move);
    const wantLeg = sp > 0.3 * S && at < 75 * DEG ? clamp(theta, -1.05, 1.05) * (1 - dirK * 0.85) : 0;
    this.legYaw += (wantLeg - this.legYaw) * (1 - Math.exp(-8 * dt));
    const ly = this.legYaw;
    const cy = Math.cos(ly), sy = Math.sin(ly);
    const hx = bl.hp.x * legLen, hz = bl.hp.z * legLen;
    const legXZ = (v: THREE.Vector3, out: THREE.Vector3, y: number) => {
      let x = v.x * legLen - hx, z = v.z * legLen - hz;
      const along = x * tdx + z * tdz;
      x += tdx * along * (warp - 1);
      z += tdz * along * (warp - 1);
      // rotate about the hips by the leg yaw
      const rx = x * cy + z * sy, rz = -x * sy + z * cy;
      return out.set(hx + rx, y, hz + rz);
    };
    this.runK = smoothstep(2.4, 3.4, vn) * move;
    const runK = this.runK;
    prm.hipsPos.set(hx, def.offsets[B.hips].y + bl.hp.y * legLen - L.hunchSm * 0.04 * S, hz);
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
    this.lookSm += wrapAngle(inp.look - this.lookSm) * (1 - Math.exp(-14 * dt));
    const look = this.lookSm;
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
      legXZ(av, fp.pos, def.ankleHeight + av.y * legLen);
      fp.rot.copy(i === 0 ? bl.q.fL : bl.q.fR).premultiply(_q.setFromAxisAngle(_Y, ly));
      fp.toe = clamp(i === 0 ? bl.tL : bl.tR, -10, 60);
      const kv3 = bl.v[('k' + side_) as 'kL'];
      legXZ(kv3, _v, kv3.y * legLen);
      fp.pole.set(_v.x - (hx + fp.pos.x) * 0.5, 0.15, _v.z - (hz + fp.pos.z) * 0.5);
      if (fp.pole.lengthSq() < 1e-6) fp.pole.set(0, 0, 1);
      fp.swing = false;
      this.lockFoot(L, i, fp, inp, i === 0 ? bl.cL : bl.cR, legLen, dt);
    }

    // ------------------------------------------------------------- hip drop
    // lower the hips (smoothly) when a leg can't reach its target - a locked foot left behind, a
    // longer stride - before the arms are placed, so the hands ride down with the shoulders
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
      want = Math.max(want, -0.2 * S);
      this.dropSm += (want - this.dropSm) * (1 - Math.exp(-(want < this.dropSm ? 30 : 9) * dt));
      prm.hipsPos.y += this.dropSm;
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
      const gw = Math.max(guardOver, L.blockSm, weaponHand ? 1 : 0);
      hp.pos.set(lerp(mx, gx, gw), lerp(my, gy, gw), lerp(mz, gz, gw)).applyQuaternion(_cQ).add(_chest);
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
    const c = contact > 0.5 ? 1 : 0;
    // free target in world
    const [wx, wz] = rotY(fp.pos.x, fp.pos.z, inp.rootYaw);
    const tx = inp.rootX + wx, tz = inp.rootZ + wz;
    const freeYawW = inp.rootYaw + footHeading(fp.rot);
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
      k.on = false;
      f.swing = true;
    }
    this.prevC[i] = c;
    // left behind (sharp turn, a change of clip): step over to the free target
    if (k.on && k.step >= 1 && Math.hypot(k.x - tx, k.z - tz) > 0.3 * legLen) {
      k.step = 0;
      k.sx = k.x;
      k.sz = k.z;
      f.swing = true;
    }
    let x = tx, z = tz, lift = 0;
    if (k.step < 1) {
      k.step = Math.min(1, k.step + dt / 0.2);
      const s = smoothstep(0, 1, k.step);
      x = lerp(k.sx, tx, s);
      z = lerp(k.sz, tz, s);
      lift = Math.sin(Math.PI * k.step) * 0.07 * legLen;
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
    if (k.w > 0.01) {
      // planted feet don't spin on the floor
      const dyaw = wrapAngle(k.yawW - freeYawW) * k.w;
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
const _hu = new THREE.Vector3();
/**
 * Heading of a foot on the floor. The toe direction alone is useless when the foot points down
 * (toe-off); the foot's up axis tilts the same way as it pitches, so their ground projections
 * summed give a heading defined at any pitch.
 */
function footHeading(q: THREE.Quaternion) {
  _hf.set(0, 0, 1).applyQuaternion(q);
  _hu.set(0, 1, 0).applyQuaternion(q);
  // toes down: the up axis leans forward; toes up: it leans back
  const k = _hf.y < 0 ? 1 : -1;
  return Math.atan2(_hf.x + _hu.x * k, _hf.z + _hu.z * k);
}

function mkLock(): FootLock {
  return { x: 0, z: 0, yawW: 0, w: 0, on: false, step: 1, sx: 0, sz: 0 };
}
