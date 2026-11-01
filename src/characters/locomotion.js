// Motion-captured locomotion (idle / walk / jog / run / sprint / backpedal / strafe), blended
// by speed and direction and expressed as IK targets so it fits any body proportions.
// Ported from the owner's "Last Stance" locomotion system. The clips are authored in a
// right-handed frame (+x = character's left); results are mirrored into Babylon's left-handed
// frame (+x = character's right) at the end.
import { MOCAP_CLIPS } from '../data/mocapLocomotion.js';
import { qMul, qAxisAngle, qNorm, qYPR, qSlerp } from '../core/quat.js';
import { clamp, clamp01, lerp, smoothstep } from '../core/mathutil.js';

const CLIP = Object.fromEntries(MOCAP_CLIPS.map((c) => [c.name, c]));
const FWD = ['walk', 'jog', 'run', 'sprint'].map((n) => CLIP[n]);
const VKEYS = ['aL', 'aR', 'kL', 'kR', 'wL', 'wR', 'eL', 'eR', 'dL', 'dR'];
const QKEYS = ['hq', 'sp', 'ch', 'nk', 'hd', 'fL', 'fR'];
const IDLE_HIP_Y = CLIP.idle.frames.reduce((s, f) => s + f.hp[1], 0) / CLIP.idle.frames.length;
const DEG = Math.PI / 180;

class Blend {
  constructor() { this.hp = [0, 0, 0]; this.v = {}; this.q = {}; for (const k of VKEYS) this.v[k] = [0, 0, 0]; for (const k of QKEYS) this.q[k] = [0, 0, 0, 0]; }
  reset() { this.w = 0; this.hp.fill(0); for (const k of VKEYS) this.v[k].fill(0); for (const k of QKEYS) this.q[k].fill(0); this.cL = 0; this.cR = 0; }
  add(clip, frameF, w) {
    if (w <= 1e-4) return;
    const n = clip.frames.length;
    const i0 = ((Math.floor(frameF) % n) + n) % n, i1 = (i0 + 1) % n, t = frameF - Math.floor(frameF);
    const A = clip.frames[i0], Bf = clip.frames[i1];
    const l = (a, b) => a + (b - a) * t;
    this.w += w;
    for (let k = 0; k < 3; k++) this.hp[k] += l(A.hp[k], Bf.hp[k]) * w;
    for (const key of VKEYS) { const a = A[key], b = Bf[key], o = this.v[key]; for (let k = 0; k < 3; k++) o[k] += l(a[k], b[k]) * w; }
    for (const key of QKEYS) {
      const a = A[key], b = Bf[key], o = this.q[key];
      let sgn = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
      const x = a[0] + (b[0] * sgn - a[0]) * t, y = a[1] + (b[1] * sgn - a[1]) * t, z = a[2] + (b[2] * sgn - a[2]) * t, ww = a[3] + (b[3] * sgn - a[3]) * t;
      sgn = o[0] * x + o[1] * y + o[2] * z + o[3] * ww < 0 ? -1 : 1;
      o[0] += x * w * sgn; o[1] += y * w * sgn; o[2] += z * w * sgn; o[3] += ww * w * sgn;
    }
    const c = t < 0.5 ? A.c : Bf.c;
    this.cL += (c & 1 ? 1 : 0) * w; this.cR += (c & 2 ? 1 : 0) * w;
  }
  finish() {
    const k = 1 / Math.max(1e-6, this.w);
    for (let i = 0; i < 3; i++) this.hp[i] *= k;
    for (const key of VKEYS) for (let i = 0; i < 3; i++) this.v[key][i] *= k;
    for (const key of QKEYS) { const q = this.q[key]; if (q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3] < 1e-12) q[3] = 1; qNorm(q); }
    this.cL *= k; this.cR *= k;
  }
}

const qSlerpInto = (q, target, t) => qSlerp(q, q, target, t);

/** Mirror a right-handed (+x left) quaternion into the left-handed (+x right) frame. */
const mq = (o, q) => { o[0] = q[0]; o[1] = -q[1]; o[2] = -q[2]; o[3] = q[3]; return o; };

export class Locomotion {
  constructor(seed = 0) {
    this.blend = new Blend();
    this.phase = (seed % 97) / 97;
    this.idleT = (seed % 31) / 15;
    this.lvx = 0; this.lvz = 0; this.moveSm = 0; this.legYaw = 0; this.lookSm = 0; this.runK = 0;
    this.out = {
      hipsPos: [0, 0, 0], hipsRot: [0, 0, 0, 1], spine: [0, 0, 0, 1], chest: [0, 0, 0, 1], neck: [0, 0, 0, 1], head: [0, 0, 0, 1],
      feet: [{ pos: [0, 0, 0], rot: [0, 0, 0, 1], pole: [0, 0, 1] }, { pos: [0, 0, 0], rot: [0, 0, 0, 1], pole: [0, 0, 1] }],
      hands: [{ pos: [0, 0, 0], pole: [0, -1, 0] }, { pos: [0, 0, 0], pole: [0, -1, 0] }],
      moveW: 0, runK: 0, contact: [1, 1],
    };
    this._q = [0, 0, 0, 1]; this._q2 = [0, 0, 0, 1];
  }

  /**
   * dt; s = { vx, vz } local velocity (left-handed: +x right, +z forward, m/s),
   * look: head yaw offset (rad, + = right), guard/block/stance weights (0..1), dims (rigDims).
   */
  update(dt, s, d) {
    const L = d.legLen, armLen = d.armLen, scale = d.H;
    // Work in the clip's right-handed frame: +x = left.
    const vx = -(s.vx || 0), vz = s.vz || 0;
    const k12 = 1 - Math.exp(-12 * dt);
    this.lvx += (vx - this.lvx) * k12; this.lvz += (vz - this.lvz) * k12;
    const f = Math.hypot(this.lvx, this.lvz), p = f / L;
    this.moveSm += (smoothstep(0.12 * scale, 0.5 * scale, f) - this.moveSm) * (1 - Math.exp(-9 * dt));
    const m = this.moveSm;
    const h = f > 0.05 ? Math.atan2(this.lvx, this.lvz) : 0;
    const g = 1 - smoothstep(2, 3, p), ah = Math.abs(h);
    let vF = 1, vS = 0, vB = 0;
    if (g > 0) {
      const e = 104 * DEG, t = 173 * DEG;
      if (ah <= e) { vS = ah / e; vF = 1 - vS; } else { vB = clamp01((ah - e) / (t - e)); vS = 1 - vB; vF = 0; }
      vF = lerp(1, vF, g); vS *= g; vB *= g;
    }
    const side = h >= 0 ? CLIP.sideL : CLIP.sideR;
    const C = [0, 0, 0, 0];
    if (p <= FWD[0].speed) C[0] = 1;
    else if (p >= FWD[2].speed) C[2] = 1; // run is the fastest forward clip by speed
    else for (let e = 0; e < 2; e++) if (p >= FWD[e].speed && p <= FWD[e + 1].speed) { const t = (p - FWD[e].speed) / (FWD[e + 1].speed - FWD[e].speed); C[e] = 1 - t; C[e + 1] = t; }
    if (s.sprint && p > FWD[1].speed) { const k = clamp01((p - FWD[1].speed) / 1.2) * 0.6; C[3] = k * (C[2] + C[1]); C[2] *= 1 - k; C[1] *= 1 - k; }
    let dur = 0, spd = 0;
    for (let e = 0; e < 4; e++) { dur += C[e] * vF * FWD[e].dur; spd += C[e] * vF * FWD[e].speed; }
    dur += vS * side.dur + vB * CLIP.back.dur; spd += vS * side.speed + vB * CLIP.back.speed;
    const E = p > 0.001 && spd > 0.001 ? p / spd : 1;
    const rate = clamp(Math.sqrt(E), 0.72, 1.3), stride = clamp(E / rate, 0.3, 1.35);
    if (m > 0.01) this.phase = (this.phase + (dt / Math.max(0.2, dur)) * rate) % 1;
    this.idleT += dt;
    const A = this.blend; A.reset();
    const idleW = 1 - m;
    A.add(CLIP.idle, (this.idleT / CLIP.idle.dur) * CLIP.idle.frames.length, idleW);
    if (m > 0) {
      for (let e = 0; e < 4; e++) A.add(FWD[e], this.phase * FWD[e].frames.length, m * vF * C[e]);
      A.add(side, this.phase * side.frames.length, m * vS);
      A.add(CLIP.back, this.phase * CLIP.back.frames.length, m * vB);
    }
    A.finish();
    // The captured idle is a fighter's ready stance (hands up, crouched, bladed). Inmates at
    // rest should stand relaxed, so blend the idle toward a natural standing pose unless the
    // character is actually squaring up for a fight.
    const relax = idleW * (1 - (s.stance || 0));
    if (relax > 0.001) {
      const breathe = Math.sin(this.idleT * 1.6) * 0.004, sway = Math.sin(this.idleT * 0.45);
      A.hp[0] = lerp(A.hp[0], 0.012 * sway, relax * 0.8); A.hp[1] = lerp(A.hp[1], -0.018 + breathe, relax * 0.85); A.hp[2] = lerp(A.hp[2], 0.004, relax * 0.85);
      for (const [k, sg] of [['L', 1], ['R', -1]]) {
        const a = A.v['a' + k], kn = A.v['k' + k], w = A.v['w' + k], e = A.v['e' + k];
        const stanceW = 0.12 + (k === 'L' ? 0.012 : 0) * sway;
        a[0] = lerp(a[0], sg * stanceW, relax); a[1] = lerp(a[1], 0, relax); a[2] = lerp(a[2], k === 'L' ? 0.025 : -0.01, relax);
        kn[0] = lerp(kn[0], sg * 0.125, relax); kn[1] = lerp(kn[1], 0.585, relax); kn[2] = lerp(kn[2], 0.07, relax);
        w[0] = lerp(w[0], sg * 0.075, relax); w[1] = lerp(w[1], -0.955 + breathe, relax); w[2] = lerp(w[2], 0.07 + sway * 0.01, relax);
        e[0] = lerp(e[0], sg * 0.05, relax); e[1] = lerp(e[1], -0.52, relax); e[2] = lerp(e[2], -0.07, relax);
      }
      const ident = [0, 0, 0, 1];
      for (const key of ['hq', 'sp', 'ch', 'nk', 'hd', 'fL', 'fR']) qSlerpInto(A.q[key], ident, relax * (key === 'nk' || key === 'hd' ? 0.6 : 0.85));
    }
    const M = f > 0.001 ? this.lvx / f : 0, N = f > 0.001 ? this.lvz / f : 1;
    const te = lerp(1, stride, m);
    const legYawT = f > 0.3 * scale && ah < 75 * DEG ? clamp(h, -1.05, 1.05) * (1 - g * 0.85) : 0;
    this.legYaw += (legYawT - this.legYaw) * (1 - Math.exp(-8 * dt));
    const ry = this.legYaw, cy = Math.cos(ry), sy = Math.sin(ry);
    const oe = A.hp[0] * L, se = A.hp[2] * L;
    // Target positions relative to the hips, stretched along travel and rotated by legYaw.
    const ce = (v, y, out) => {
      let r = v[0] * L - oe, i = v[2] * L - se;
      const a = r * M + i * N;
      r += M * a * (te - 1); i += N * a * (te - 1);
      const o = r * cy + i * sy, c = -r * sy + i * cy;
      out[0] = oe + o; out[1] = y; out[2] = se + c;
      return out;
    };
    this.runK = smoothstep(2.4, 3.4, p) * m;
    const O = this.out, q = this._q, q2 = this._q2;
    // Hips (right-handed working values, mirrored when written out)
    const hipsPos = [oe, d.hipH + A.hp[1] * L - (s.crouch || 0) * 0.06 * scale, se];
    const hipsRot = qMul([0, 0, 0, 1], qAxisAngle(q, 0, 1, 0, ry), A.q.hq);
    const spine = qMul([0, 0, 0, 1], qAxisAngle(q, 0, 1, 0, -ry * 0.55), A.q.sp);
    const chest = qMul([0, 0, 0, 1], qAxisAngle(q, 0, 1, 0, -ry * 0.45), A.q.ch);
    const neck = [...A.q.nk], head = [...A.q.hd];
    // Look: distribute yaw across the spine (input is +right in left-handed terms -> negate).
    let lookT = -(s.look || 0);
    this.lookSm += (lookT - this.lookSm) * (1 - Math.exp(-14 * dt));
    const lk = this.lookSm, hunch = (s.hunch || 0) * 14 * DEG;
    qMul(spine, spine, qYPR(q2, lk * 0.15, hunch * 0.5, 0));
    qMul(chest, chest, qYPR(q2, lk * 0.2, hunch * 0.5, 0));
    qMul(neck, neck, qYPR(q2, lk * 0.25, -hunch * 0.3, 0));
    qMul(head, head, qYPR(q2, lk * 0.4, -hunch * 0.4, 0));
    // Fight stance: bladed hips, staggered feet (blended in while standing still).
    const stanceW = (s.stance || 0) * (1 - m);
    if (stanceW > 0.001) {
      hipsPos[1] -= 0.06 * scale * stanceW;
      qMul(hipsRot, qAxisAngle(q, 0, 1, 0, -24 * DEG * stanceW), hipsRot);
      qMul(chest, qAxisAngle(q, 0, 1, 0, 14 * DEG * stanceW), chest);
    }
    // Feet
    const tmp = [0, 0, 0];
    for (let r = 0; r < 2; r++) {
      const side2 = r === 0 ? 'L' : 'R';
      const foot = O.feet[r];
      const av = A.v['a' + side2];
      ce(av, d.footH + av[1] * L, tmp);
      if (stanceW > 0.001) {
        const st = r === 0 ? [0.1, 0.17, -4] : [-0.13, -0.17, -38];
        tmp[0] = lerp(tmp[0], hipsPos[0] + st[0] * scale, stanceW); tmp[2] = lerp(tmp[2], st[1] * scale, stanceW); tmp[1] = lerp(tmp[1], d.footH, stanceW);
      }
      const frot = qMul([0, 0, 0, 1], qAxisAngle(q, 0, 1, 0, ry + (stanceW > 0.001 ? (r === 0 ? -4 : -38) * DEG * stanceW : 0)), r === 0 ? A.q.fL : A.q.fR);
      const kv = A.v['k' + side2];
      const knee = ce(kv, kv[1] * L, [0, 0, 0]);
      let px = knee[0] - (hipsPos[0] + tmp[0]) * 0.5, pz = knee[2] - (hipsPos[2] + tmp[2]) * 0.5;
      if (px * px + pz * pz < 1e-6) { px = 0; pz = 1; }
      // Mirror into left-handed output (L/R names are preserved: left stays left).
      foot.pos[0] = -tmp[0]; foot.pos[1] = tmp[1]; foot.pos[2] = tmp[2];
      mq(foot.rot, frot);
      foot.pole[0] = -px; foot.pole[1] = 0.15; foot.pole[2] = pz;
      O.contact[r] = r === 0 ? A.cL : A.cR;
    }
    // Hands: wrist targets in chest space (relative to the chest bone origin).
    const guard = (s.guard || 0) * (1 - this.runK * 0.9), block = s.block || 0, hold = s.hold || 0;
    for (let i = 0; i < 2; i++) {
      const sgn = i === 0 ? 1 : -1; // +1 = left in the right-handed frame
      const sideK = i === 0 ? 'L' : 'R';
      const hand = O.hands[i];
      // Shoulder position in chest space (right-handed): mirror my rig's left/right offsets.
      const sh = d.rest[i === 0 ? 5 : 8];
      const p0 = [-sh[0], sh[1], sh[2]];
      const w = A.v['w' + sideK], e = A.v['e' + sideK];
      let wx = p0[0] + w[0] * armLen, wy = p0[1] + w[1] * armLen, wz = p0[2] + w[2] * armLen;
      const sway = Math.sin(this.idleT * 2.3 + i * 1.7) * 0.006 * scale;
      const gT = s.guardTargets ? s.guardTargets[i] : [sgn * 0.12, 0.31 + (i === 0 ? 0.02 : 0), 0.21];
      const gx = gT[0] * scale, gy = (gT[1] + sway / scale) * scale, gz = gT[2] * scale;
      let bx = gx, by = gy, bz = gz;
      if (block > 0.01) { bx = lerp(gx, sgn * 0.075 * scale, block); by = lerp(gy, 0.39 * scale, block); bz = lerp(gz, 0.2 * scale, block); }
      const E2 = Math.max(guard, block);
      wx = lerp(wx, bx, E2); wy = lerp(wy, by, E2); wz = lerp(wz, bz, E2);
      if (hold > 0.01 && s.holdTargets) { const ht = s.holdTargets[i]; if (ht) { wx = lerp(wx, ht[0] * scale, hold); wy = lerp(wy, ht[1] * scale, hold); wz = lerp(wz, ht[2] * scale, hold); } }
      // Elbow pole from the mocap elbow, blended to "elbows down and out" in guard.
      let px = p0[0] + e[0] * armLen - (p0[0] + wx) * 0.5, py = p0[1] + e[1] * armLen - (p0[1] + wy) * 0.5, pz = p0[2] + e[2] * armLen - (p0[2] + wz) * 0.5;
      const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
      const gp = [sgn * 0.35, -1, -0.2]; const gl = Math.hypot(...gp);
      px = lerp(px, gp[0] / gl, E2); py = lerp(py, gp[1] / gl, E2); pz = lerp(pz, gp[2] / gl, E2);
      hand.pos[0] = -wx; hand.pos[1] = wy; hand.pos[2] = wz;
      hand.pole[0] = -px; hand.pole[1] = py; hand.pole[2] = pz;
    }
    // Write mirrored body transforms.
    O.hipsPos[0] = -hipsPos[0]; O.hipsPos[1] = hipsPos[1]; O.hipsPos[2] = hipsPos[2];
    mq(O.hipsRot, hipsRot); mq(O.spine, spine); mq(O.chest, chest); mq(O.neck, neck); mq(O.head, head);
    O.moveW = m; O.runK = this.runK;
    return O;
  }
}
