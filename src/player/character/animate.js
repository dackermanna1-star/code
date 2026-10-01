// Procedural animation for the walker. Feet are planted on the step planner's
// footholds (no sliding) and roll heel-to-toe; the pelvis keeps within reach of
// both feet, sways over the stance foot, drops and twists with each stride;
// the spine counter-rotates and breathes; arms swing; the head stabilizes and
// looks where you look; the ponytail is a verlet chain that swings and lands
// on her back. Idle, she shifts her weight, glances around, now and then
// tucks her hair behind her ear, and blinks. Actions (spraying, picking up,
// throwing) blend in over the top.
import * as THREE from 'three';
import { J, PONY } from './rig.js';
import { HAND_CAN } from './Character.js';

// Carry timeline (s), matching Carry.js
const GRAB_AT = 0.3, RISE_AT = 0.36, PICK_END = 0.72, RELEASE_K = 0.07 / 0.42;

const { abs, min, max, sin, cos, sqrt, exp, PI, atan2, hypot } = Math;
const clamp = (x, a, b) => min(b, max(a, x));
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - exp(-lambda * dt));
const wrapPi = (a) => atan2(sin(a), cos(a));
const _Y = new THREE.Vector3(0, 1, 0);

/** Critically damped scalar spring. */
class Spring {
  constructor(x = 0, w = 10) {
    this.x = x;
    this.v = 0;
    this.w = w;
  }
  step(target, dt, w = this.w) {
    const n = Math.max(1, Math.ceil(dt * w * 0.6));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += ((target - this.x) * w * w - 2 * w * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

export class Animator {
  constructor(ch) {
    this.ch = ch;
    this.B = ch.bones;
    this.parent = new Map();
    this.off = new Map();
    this.wq = new Map();
    this.wp = new Map();
    this.order = [];
    const visit = (b) => {
      this.order.push(b.name);
      for (const c of b.children) if (c.isBone) visit(c);
    };
    visit(ch.root);
    for (const [name, b] of this.B) {
      this.parent.set(name, b.parent && b.parent.isBone ? b.parent.name : null);
      this.off.set(name, b.position.clone());
      this.wq.set(name, new THREE.Quaternion());
      this.wp.set(name, new THREE.Vector3());
    }
    // bind directions (character frame) of the limb segments
    const dir = (a, b) => ch.bind.get(b).clone().sub(ch.bind.get(a)).normalize();
    this.bindDir = {};
    for (const S of ['L', 'R']) {
      this.bindDir['thigh' + S] = dir('thigh' + S, 'shin' + S);
      this.bindDir['shin' + S] = dir('shin' + S, 'foot' + S);
      this.bindDir['arm' + S] = dir('arm' + S, 'fore' + S);
      this.bindDir['fore' + S] = dir('fore' + S, 'hand' + S);
      this.bindDir['hand' + S] = dir('hand' + S, 'm0' + S);
    }
    this.ponyDir = [];
    for (let i = 0; i < PONY.length - 1; i++) {
      const a = new THREE.Vector3(...PONY[i]), b = new THREE.Vector3(...PONY[i + 1]);
      this.ponyDir.push(b.clone().sub(a));
    }
    // state
    this.t = 0;
    this.yaw = 0;
    this.yawRate = 0;
    this.lean = new Spring(0, 6);
    this.bank = new Spring(0, 5);
    this.weight = new Spring(0, 2.2);
    this.weightSide = 1;
    this.nextShift = 4;
    this.idleT = 0;
    this.lookYaw = new Spring(0, 7);
    this.lookPitch = new Spring(0, 7);
    this.glance = 0;
    this.glanceT = 6;
    this.blinkT = 2.5;
    this.blink = 0;
    this.tuck = -1;
    this.nextTuck = 14;
    this.hipOnHand = new Spring(0, 4);
    this.eyeYaw = 0;
    this.eyePitch = 0;
    this.saccadeT = 1;
    this.sacc = [0, 0];
    this.aimW = new Spring(0, 9);
    this.carryW = new Spring(0, 8);
    // actions (third person): spray can up, spraying, litter in hand; torso twist and bend
    this.sprayW = new Spring(0, 9);
    this.fireW = new Spring(0, 13);
    this.twistS = new Spring(0, 15);
    this.chestS = new Spring(0, 12);
    this.reachS = new Spring(0, 9);
    // the pelvis drop that keeps both feet in reach, smoothed so it never snaps
    this.dropS = new Spring(0, 15);
    this.windup = 0;
    this.act = { spray: 0, fire: 0, carry: 0, twist: 0, chest: 0, reach: 0 };
    this.pony = null;
    this.ponyPrevHead = null;
    // scratch
    this.v = Array.from({ length: 12 }, () => new THREE.Vector3());
    this.bv = Array.from({ length: 8 }, () => new THREE.Vector3());
    this.lv = Array.from({ length: 10 }, () => new THREE.Vector3());
    this.lq = [new THREE.Quaternion(), new THREE.Quaternion()];
    this.q = Array.from({ length: 8 }, () => new THREE.Quaternion());
    this.m = [new THREE.Matrix4(), new THREE.Matrix4()];
    this.e = new THREE.Euler();
    this.prevPos = null;
    this.prevVel = new THREE.Vector3();
    this.accel = new THREE.Vector3();
  }

  // ───────────────────────── FK helpers ─────────────────────────

  /** World pose of a bone from its parent's (cached) pose and its local rotation. */
  fk(name) {
    const p = this.parent.get(name);
    const b = this.B.get(name);
    const wq = this.wq.get(name), wp = this.wp.get(name);
    if (!p) {
      wq.copy(b.quaternion);
      wp.copy(b.position);
      return;
    }
    const pq = this.wq.get(p);
    wq.copy(pq).multiply(b.quaternion);
    wp.copy(b.position).applyQuaternion(pq).add(this.wp.get(p));
  }
  setLocal(name, q) {
    this.B.get(name).quaternion.copy(q);
    this.fk(name);
  }
  setWorld(name, q) {
    const p = this.parent.get(name);
    const b = this.B.get(name);
    b.quaternion.copy(this.q[7].copy(this.wq.get(p)).invert().multiply(q));
    this.fk(name);
  }
  /** Rotation taking the bind frame (dirB, sideB) to the world frame (dir, side). */
  basis(out, dirB, sideB, dir, side) {
    const [a, b, c, d, e, f, sb, sd] = this.bv;
    sb.copy(sideB);
    sd.copy(side);
    const x1 = a.copy(dirB).normalize(), y1 = b.copy(sb).addScaledVector(x1, -sb.dot(x1)).normalize(), z1 = c.crossVectors(x1, y1);
    const x2 = d.copy(dir).normalize(), y2 = e.copy(sd).addScaledVector(x2, -sd.dot(x2)).normalize(), z2 = f.crossVectors(x2, y2);
    const M1 = this.m[0].makeBasis(x1, y1, z1), M2 = this.m[1].makeBasis(x2, y2, z2);
    return out.setFromRotationMatrix(M2.multiply(M1.transpose()));
  }
  /** Character-frame vector to world (root rotation applied). */
  toWorldDir(out, x, y, z) {
    return out.set(x, y, z).applyQuaternion(this.wq.get('root'));
  }

  /**
   * Two-bone IK: place the end joint of upper->lower->end at target, bending toward pole
   * (world). bindPole: the character-frame axis the joint bends toward in the bind pose.
   */
  limb(upper, lower, end, target, pole, bindPole) {
    const A = this.lv[9].copy(this.wp.get(upper));
    const L1 = this.off.get(lower).length(), L2 = this.off.get(end).length();
    const [toT, bend, K, dU, dL, bp, T, pl] = this.lv;
    bp.copy(bindPole);
    pl.copy(pole);
    toT.subVectors(target, A);
    let d = toT.length();
    const maxD = (L1 + L2) * 0.9995, minD = abs(L1 - L2) + 0.01;
    if (d > maxD) toT.multiplyScalar(maxD / d), (d = maxD);
    if (d < minD) toT.multiplyScalar(minD / max(d, 1e-5)), (d = minD);
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = sqrt(max(0, L1 * L1 - a * a));
    toT.divideScalar(d);
    bend.copy(pl).addScaledVector(toT, -pl.dot(toT));
    if (bend.lengthSq() < 1e-8) bend.set(0, 0, -1).applyQuaternion(this.wq.get('root'));
    bend.normalize();
    K.copy(A).addScaledVector(toT, a).addScaledVector(bend, h);
    const qu = this.basis(this.lq[0], this.bindDir[upper], bp, dU.subVectors(K, A), bend);
    this.setWorld(upper, qu);
    T.copy(A).addScaledVector(toT, d);
    const ql = this.basis(this.lq[1], this.bindDir[lower], bp, dL.subVectors(T, K), bend);
    this.setWorld(lower, ql);
    return T;
  }

  // ───────────────────────── per frame ─────────────────────────

  update(dt, pl, ctx) {
    dt = clamp(dt || 0, 0, 0.05);
    this.t += dt;
    const t = this.t;
    const g = pl.gait;
    const R = this.B.get('root');
    const third = ctx.view === 'third';

    // ── root: where she stands and which way she faces ──
    const yaw = ctx.bodyYaw ?? g.bodyYaw ?? pl.yaw;
    if (this.prevYaw === undefined) this.prevYaw = yaw;
    const dy = wrapPi(yaw - this.prevYaw);
    this.prevYaw = yaw;
    this.yawRate = damp(this.yawRate, dt > 0 ? dy / dt : 0, 8, dt);
    // acceleration (lean forward when setting off, back when stopping)
    if (!this.prevPos) this.prevPos = pl.vel.clone();
    if (dt > 0) this.accel.subVectors(pl.vel, this.prevPos).divideScalar(dt);
    this.prevPos.copy(pl.vel);
    const speed = pl.speed;
    const fwdX = -sin(yaw), fwdZ = -cos(yaw), rgtX = cos(yaw), rgtZ = -sin(yaw);
    const accF = this.accel.x * fwdX + this.accel.z * fwdZ;
    const lean = this.lean.step(clamp(accF * 0.035, -0.08, 0.1) + 0.035 * sstep(0.3, 1.6, speed), dt);
    const bank = this.bank.step(clamp(-this.yawRate * speed * 0.05, -0.12, 0.12), dt);
    R.position.set(pl.pos.x, pl.groundY, pl.pos.z);
    R.quaternion.setFromEuler(this.e.set(0, yaw, 0, 'YXZ'));
    this.fk('root');
    const rootQ = this.wq.get('root');
    const W = (x, y, z, out = new THREE.Vector3()) => out.set(x, y, z).applyQuaternion(rootQ);

    this.actionState(dt, ctx);
    const act = this.act;

    // ── feet: planted on footholds, swinging between them ──
    const crouch = clamp(pl.crouch ?? 0, -0.05, 1.05);
    const moving = g.active ?? (speed > 0.07 ? 1 : 0);
    const idle = 1 - sstep(0.02, 0.25, speed + (moving > 0.3 ? 0.3 : 0));
    this.idleT = idle > 0.9 ? this.idleT + dt : 0;
    // weight shifts while standing (contrapposto)
    if (this.idleT > this.nextShift) {
      this.weightSide = -this.weightSide;
      this.nextShift = this.idleT + 6 + Math.random() * 5;
    }
    const wsh = this.weight.step(this.idleT > 1.2 && crouch < 0.1 ? this.weightSide : 0, dt);
    const feet = {};
    for (const S of ['L', 'R']) {
      const side = S === 'L' ? -1 : 1;
      const F = g[S];
      const p = new THREE.Vector3();
      let lift = 0, pitch = 0, yawF = yaw;
      if (F) {
        if (F.swing > 0) {
          const s = F.swing;
          const e = s * s * s * (s * (s * 6 - 15) + 10);
          p.lerpVectors(F.from, F.pos, e);
          const stride = hypot(F.pos.x - F.from.x, F.pos.z - F.from.z);
          lift = (0.055 + 0.03 * sstep(0.2, 0.6, stride)) * sin(PI * s) ** 1.1 * sstep(0.02, 0.15, stride + 0.05);
          // toe pointed after push-off, coming up to meet the ground
          pitch = -0.55 * (1 - sstep(0.0, 0.55, s)) + 0.12 * sstep(0.6, 1.0, s);
          yawF = F.yaw + wrapPi(yaw - F.yaw) * 0;
        } else {
          p.copy(F.pos);
          // heel lifts as the body passes ahead of the planted foot; toe a little up just after landing
          const behind = -((p.x - pl.pos.x) * fwdX + (p.z - pl.pos.z) * fwdZ);
          pitch = -0.75 * sstep(0.08, 0.38, behind) * moving + 0.1 * sstep(0.05, 0.3, -behind) * moving;
          yawF = F.yaw;
        }
      } else {
        p.set(pl.pos.x + rgtX * side * 0.085, pl.groundY, pl.pos.z + rgtZ * side * 0.085);
      }
      // idle: the free leg relaxes, knee forward and heel up a touch
      const free = sstep(0.2, 1, wsh * side) * idle;
      pitch -= 0.3 * free;
      // crouching: up on the balls of the feet, knees together
      pitch -= 0.55 * sstep(0.3, 0.9, crouch);
      feet[S] = { ground: p, lift, pitch, yaw: yawF + side * 0.06, free };
    }

    // ── pelvis ──
    const s01 = g.phase - Math.floor(g.phase);
    const strideP = ((Math.floor(g.phase) % 2) + s01) / 2; // 0 left heel strike
    const amp = sstep(0.03, 1.1, speed) * moving;
    // forward offsets of the feet relative to the hips (for the twist and arm swing)
    const fo = (S) => (feet[S].ground.x - pl.pos.x) * fwdX + (feet[S].ground.z - pl.pos.z) * fwdZ;
    const fL = fo('L'), fR = fo('R');
    const swingL = g.L?.swing > 0 ? sin(PI * g.L.swing) : 0, swingR = g.R?.swing > 0 ? sin(PI * g.R.swing) : 0;
    const hipYaw = clamp(-(fL - fR) * 0.2, -0.14, 0.14) * amp;
    const hipRoll = (0.075 * swingL - 0.075 * swingR) * amp + 0.065 * wsh * idle;
    const sway = (0.022 * (swingR - swingL)) * amp * 0 + 0.03 * cos(2 * PI * strideP) * amp;
    // a gentle rise over each stance, knees a touch soft the whole time
    const bob = -0.0065 * cos(4 * PI * strideP) * amp - 0.03 * amp;
    const hipX = sway + 0.034 * wsh * idle;
    const hips = this.B.get('hips');
    const hipPos = new THREE.Vector3(hipX, J.hips[1] - 0.012 + bob - 0.43 * crouch, 0.1 * crouch + 0.01 * lean);
    // keep within reach of both feet (no hyperextension)
    let drop = 0;
    for (const S of ['L', 'R']) {
      const side = S === 'L' ? -1 : 1;
      const hj = W(hipPos.x + side * J.hip[0], hipPos.y + J.hip[1] - J.hips[1], hipPos.z).add(R.position);
      const f = feet[S];
      // a lifted heel (pivoting on the ball) raises the ankle and lends the leg reach
      const ay = f.ground.y + (f.pitch < 0 ? 0.118 * cos(f.pitch) + 0.095 * sin(-f.pitch) : 0.118) + f.lift;
      const hz = hypot(hj.x - f.ground.x, hj.z - f.ground.z);
      const reach = 0.786 * 0.985;
      const maxY = ay + sqrt(max(0, reach * reach - hz * hz));
      if (f.lift < 0.02) drop = max(drop, hj.y - maxY);
    }
    hipPos.y -= this.dropS.step(min(drop, 0.1), dt) * 0.85;
    hips.position.copy(hipPos);
    this.e.set(-(lean * 0.6 + 0.04 * amp) - 0.32 * crouch - 0.38 * act.reach, hipYaw + act.twist * 0.3, hipRoll + bank * 0.5, 'YXZ');
    hips.quaternion.setFromEuler(this.e);
    this.fk('hips');

    // ── legs (two-bone IK to the ankle, then the foot) ──
    for (const S of ['L', 'R']) {
      const side = S === 'L' ? -1 : 1;
      const f = feet[S];
      const qy = this.q[2].setFromAxisAngle(_Y, f.yaw);
      // the foot pivots on the ball when the heel lifts, on the heel tip when the toe lifts
      const piv = f.pitch < 0 ? -0.095 : 0.05;
      const ank = this.v[0].set(0, 0.118, -piv).applyAxisAngle(this.v[1].set(1, 0, 0), f.pitch).add(this.v[2].set(0, 0, piv));
      ank.applyQuaternion(qy);
      const target = this.v[3].copy(f.ground).add(ank);
      target.y += f.lift;
      // knees forward, a little in when crouching (knees together), out when the leg is free
      const pole = W(side * (0.08 * f.free - 0.12 * sstep(0.2, 0.8, crouch)), 0, -1, this.v[4]);
      this.limb('thigh' + S, 'shin' + S, 'foot' + S, target, pole, this.v[5].set(0, 0, -1));
      const qf = this.q[3].copy(qy).multiply(this.q[4].setFromAxisAngle(this.v[1].set(1, 0, 0), f.pitch));
      this.setWorld('foot' + S, qf);
    }

    // ── spine: counter-rotation, lateral balance, breathing ──
    const breath = sin(t * (idle > 0.5 ? 1.55 : 2.4)) * (0.012 + 0.006 * idle);
    const sp1 = this.q[2].setFromEuler(this.e.set(0.02 * amp + lean * 0.3 - 0.08 * crouch - 0.22 * act.reach + act.chest * 0.4, -hipYaw * 0.55 + act.twist * 0.3, -hipRoll * 0.55, 'YXZ'));
    this.setLocal('spine1', sp1);
    const sp2 = this.q[2].setFromEuler(this.e.set(breath * 0.5 - 0.05 * crouch + (ctx.chestPitch ?? 0) + act.chest * 0.6, -hipYaw * 0.75 + (ctx.twist ?? 0) + act.twist * 0.4, -hipRoll * 0.35 - 0.02 * wsh * idle, 'YXZ'));
    this.setLocal('spine2', sp2);

    // ── head and neck: look where the camera looks, keep the head level ──
    this.look(dt, pl, ctx, idle);

    // ── arms ──
    this.arms(dt, pl, ctx, { fL, fR, amp, idle, crouch, breath, wsh });

    // ── face: blinks, eyes ──
    this.face(dt, ctx);

    // ── ponytail ──
    this.ponytail(dt);
  }

  look(dt, pl, ctx, idle) {
    const sp2 = this.wq.get('spine2');
    // where to look: the camera's direction, or an action target
    const lookDir = this.v[0];
    if (ctx.lookAt) lookDir.subVectors(ctx.lookAt, this.wp.get('head'));
    else if (ctx.lookDir) lookDir.copy(ctx.lookDir);
    else lookDir.set(-sin(pl.yaw), 0, -cos(pl.yaw));
    // relative to the chest
    const inv = this.q[2].copy(sp2).invert();
    const rel = this.v[1].copy(lookDir).applyQuaternion(inv).normalize();
    let ry = atan2(-rel.x, -rel.z), rp = Math.asin(clamp(rel.y, -1, 1));
    // something behind her: face front rather than wrench the neck round
    if (abs(ry) > 2.0) (ry = 0), (rp *= 0.3);
    // idle glances
    if (idle > 0.9) {
      this.glanceT -= dt;
      if (this.glanceT < 0) {
        this.glance = this.glance ? 0 : (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.5);
        this.glanceT = this.glance ? 1.2 + Math.random() * 1.5 : 4 + Math.random() * 6;
      }
    } else this.glance = 0;
    ry = clamp(ry + this.glance, -1.15, 1.15);
    rp = clamp(rp, -0.7, 0.5);
    const yy = this.lookYaw.step(ry, dt), pp = this.lookPitch.step(rp + 0.03, dt);
    // neck takes a third, the head the rest; a slight attractive tilt
    const qn = this.q[3].setFromEuler(this.e.set(pp * 0.3 - 0.1, yy * 0.35, 0, 'YXZ'));
    this.setLocal('neck', qn);
    // head: level in the world apart from the look and a soft tilt
    const sq = this.q[4].copy(sp2).multiply(this.q[5].setFromEuler(this.e.set(pp, yy, 0.045, 'YXZ')));
    // remove the chest's roll so the head stays level
    const up = this.v[2].set(0, 1, 0).applyQuaternion(sq);
    const fwd = this.v[3].set(0, 0, -1).applyQuaternion(sq);
    fwd.y = clamp(fwd.y, -0.8, 0.6);
    const lvl = this.basis(this.q[6], this.v[4].set(0, 0, -1), this.v[5].set(0, 1, 0), fwd, up.lerp(_Y, 0.75));
    this.setWorld('head', lvl);
    this.lookYawNow = yy;
    this.lookPitchNow = pp;
  }

  arms(dt, pl, ctx, o) {
    const { fL, fR, amp, idle, crouch, breath } = o;
    const rootQ = this.wq.get('root');
    const W = (x, y, z, out) => out.set(x, y, z).applyQuaternion(rootQ);
    const sw = clamp((fR - fL) * 0.75, -0.42, 0.42) * amp;
    // hair tuck (left hand) and a hand on the hip (right) while idle
    if (idle > 0.9 && crouch < 0.05 && !ctx.aim && !ctx.holding) {
      if (this.tuck < 0 && this.idleT > this.nextTuck) {
        this.tuck = 0;
        this.nextTuck = this.idleT + 16 + Math.random() * 14;
      }
    }
    if (this.tuck >= 0) {
      this.tuck += dt;
      if (this.tuck > 2.1) this.tuck = -1;
    }
    const hip = this.hipOnHand.step(idle > 0.9 && this.idleT > 3 && this.weightSide > 0 && !ctx.aim && !ctx.holding && crouch < 0.05 ? 1 : 0, dt);

    for (const S of ['L', 'R']) {
      const side = S === 'L' ? -1 : 1;
      // clavicle: a slight shrug with the breath, forward when reaching
      const reach = S === 'R' ? (ctx.aimW ?? 0) : 0;
      this.setLocal('clav' + S, this.q[0].setFromEuler(this.e.set(0, side * (-0.05 * reach), side * (-0.03 - breath * 0.4 - 0.06 * reach), 'YXZ')));
      // default: swing, relaxed elbow, palm to the thigh
      const phi = S === 'L' ? sw : -sw;
      const abd = 0.1 + 0.05 * crouch;
      const upper = W(side * Math.sin(abd), -Math.cos(abd), 0, this.v[0]).applyAxisAngle(this.v[1].set(1, 0, 0).applyQuaternion(rootQ), phi + 0.06 + 0.5 * crouch);
      // relaxed elbows: a little more bend as the arm swings forward
      const bendA = 0.16 + 0.24 * max(0, phi) + 0.03 * amp + 0.6 * crouch;
      let target = null;
      const shoulder = this.wp.get('arm' + S);
      // reconstruct a hand target from the swing pose (so actions can blend with IK)
      const elbow = this.v[2].copy(shoulder).addScaledVector(upper, 0.28);
      const fore = this.v[3].copy(upper).applyAxisAngle(this.v[1].set(1, 0, 0).applyQuaternion(rootQ), bendA);
      const handP = this.v[4].copy(elbow).addScaledVector(fore, 0.245);
      target = handP;
      let pole = W(side * 0.35, -0.2, 1, this.v[5]);
      let wristFlex = 0.12, palm = 0;
      // left hand: tuck the hair behind the ear
      if (S === 'L' && this.tuck >= 0) {
        const k = sstep(0, 0.55, this.tuck) * (1 - sstep(1.35, 2.05, this.tuck));
        const slide = sstep(0.6, 1.2, this.tuck);
        const ear = this.v[6].set(-0.066, 0.075 - 0.02 * slide, -0.035 + 0.05 * slide).applyQuaternion(this.wq.get('head')).add(this.wp.get('head'));
        target.lerp(ear, k);
        pole.lerp(W(-1, -0.4, 0.3, this.v[7]), k);
        palm = k;
      }
      // right hand on the hip
      if (S === 'R' && hip > 0.01 && !ctx.aimW) {
        const hp = this.v[6].set(0.155, -0.02, -0.01).applyQuaternion(this.wq.get('spine1')).add(this.wp.get('spine1'));
        target.lerp(hp, hip);
        pole.lerp(W(1, 0.2, 0.6, this.v[7]), hip);
        wristFlex = 0.12 + 0.5 * hip;
      }
      // actions (right hand): spray, carry, throw, reach for something on the ground
      let actQ = null, actW = 0, actGrip = 0;
      if (S === 'R') {
        const r = this.rightHandAction(dt, ctx, pl, shoulder, target, pole);
        actQ = r.q;
        actW = r.qw;
        actGrip = r.grip;
      }
      if (S === 'R' && ctx.handTarget) {
        const w = ctx.handW ?? 1;
        target.lerp(ctx.handTarget, w);
        if (ctx.handPole) pole.lerp(ctx.handPole, w);
      }
      if (S === 'L') {
        // the free hand reaches out ahead for balance through a throw
        const k = this.offHand;
        if (k > 0.01) {
          target.lerp(this.v[6].set(-0.06, 0.02, -0.46).applyQuaternion(rootQ).add(shoulder), k);
          pole.lerp(W(-1, -0.3, 0.2, this.v[7]), k);
        }
        if (ctx.offHandTarget) target.lerp(ctx.offHandTarget, ctx.offHandW ?? 1);
      }
      this.limb('arm' + S, 'fore' + S, 'hand' + S, target, pole, this.v[8].set(0, 0, 1));
      // hand: along the forearm, flexed a little; palm toward the body (or as the action says)
      const fq = this.wq.get('fore' + S);
      let hq;
      if (S === 'R' && ctx.handQuat && (ctx.handW ?? 0) > 0.01) {
        hq = this.q[1].copy(fq).multiply(this.q[2].setFromEuler(this.e.set(0, 0, -wristFlex * side, 'YXZ')));
        hq.slerp(ctx.handQuat, ctx.handW ?? 1);
      } else hq = this.q[1].copy(fq).multiply(this.q[2].setFromEuler(this.e.set(0, palm * side * 0.6, -wristFlex * side, 'YXZ')));
      if (actQ && actW > 0.001) hq.slerp(actQ, actW);
      this.setWorld('hand' + S, hq);
      // fingers: relaxed curl, or a grip
      const grip = S === 'R' ? max(ctx.grip ?? 0, actGrip) : 0;
      const curl0 = 0.18 + 0.95 * grip, curl1 = 0.25 + 1.0 * grip;
      for (const f of ['i', 'm', 'r', 'p']) {
        const extra = f === 'p' ? 0.12 : f === 'r' ? 0.08 : 0;
        this.setLocal(f + '0' + S, this.q[3].setFromAxisAngle(this.v[9].set(0, 0, 1), -side * (curl0 + extra)));
        this.setLocal(f + '1' + S, this.q[3].setFromAxisAngle(this.v[9].set(0, 0, 1), -side * (curl1 + extra)));
      }
      this.setLocal('t0' + S, this.q[3].setFromAxisAngle(this.v[9].set(0, 1, 0), side * 0.25 * grip));
      this.setLocal('t1' + S, this.q[3].setFromAxisAngle(this.v[9].set(0, 0, 1), -side * (0.2 + 0.5 * grip)));
    }
  }

  /** Springs and torso motion for the actions (third person), ahead of the pose. */
  actionState(dt, ctx) {
    const a = this.act;
    const S = ctx.spray ?? {}, C = ctx.carry ?? {};
    a.spray = this.sprayW.step(S.equipped && S.raised ? 1 : 0, dt);
    a.fire = this.fireW.step(S.spraying ? 1 : 0, dt);
    const st = C.state ?? 'idle';
    a.carry = this.carryW.step(st !== 'idle' || C.hasItem ? 1 : 0, dt);
    let twist = 0, chest = 0, reach = 0, off = 0;
    if (st === 'charge') {
      this.windup = max(this.windup, C.charge);
      const c = sstep(0, 1, C.charge);
      twist = -0.5 * c;
      chest = 0.05 * c;
      off = 0.8 * c;
    } else if (st === 'throw') {
      const k = C.throwK, w = 0.45 + 0.55 * this.windup;
      // the chest whips round to the left and folds forward over the release
      twist = (-0.5 * w + (0.42 + 0.5 * w) * sstep(0, 0.32, k)) * (1 - sstep(0.55, 1, k));
      chest = -0.16 * sstep(0.05, 0.3, k) * (1 - sstep(0.6, 1, k));
      off = 0.8 * w * (1 - sstep(0.1, 0.5, k));
    } else {
      this.windup = 0;
      if (st === 'pick') reach = sstep(0.0, 0.2, C.t) * (1 - sstep(RISE_AT - 0.04, PICK_END - 0.1, C.t));
      else if (st === 'place') reach = sstep(0.0, 0.2, C.t) * (1 - sstep(0.32, 0.6, C.t));
    }
    a.twist = this.twistS.step(twist, dt, st === 'throw' ? 26 : 15);
    a.chest = this.chestS.step(chest, dt);
    a.reach = this.reachS.step(reach, dt);
    this.offHand = this.offW ? this.offW.step(off, dt) : ((this.offW = new Spring(0, 12)), 0);
  }

  /**
   * Right-hand actions on top of the walking pose (third person): the spray can
   * held up ready and pointed at the wall while spraying (shaken on demand), or
   * litter picked off the ground, carried, wound up and thrown, or set down.
   * Moves target/pole in place; returns the hand rotation to blend toward and the grip.
   */
  rightHandAction(dt, ctx, pl, sh, target, pole) {
    const a = this.act;
    const rootQ = this.wq.get('root');
    const W = (x, y, z, out) => out.set(x, y, z).applyQuaternion(rootQ);
    const res = this._act ?? (this._act = { q: new THREE.Quaternion(), qw: 0, grip: 0 });
    res.qw = 0;
    res.grip = 0;
    const S = ctx.spray ?? {}, C = ctx.carry ?? {};
    const tmp = this.v[10], tmp2 = this.v[11];
    // ── the spray can ──
    if (a.spray > 0.001) {
      // ready: up in front of the chest, nozzle ahead
      const tg = tmp.set(0.0, -0.21, -0.3).applyQuaternion(rootQ).add(sh);
      const nd = W(0, -0.15, -1, tmp2).normalize();
      if (S.aimPoint && a.fire > 0.001) {
        // spraying: the arm points the can at the spot (bent when the wall is close)
        const d = this.v[9].subVectors(S.aimPoint, sh);
        const dist = d.length();
        d.divideScalar(max(dist, 1e-4));
        const reach = clamp(dist - 0.32, 0.18, 0.5);
        const fire = this.lv[8].copy(sh).addScaledVector(d, reach);
        fire.y -= 0.05;
        tg.lerp(fire, a.fire);
        const aim = this.lv[7].subVectors(S.aimPoint, fire).normalize();
        nd.lerp(aim, a.fire).normalize();
      }
      if (S.shaking) tg.y += 0.045 * sin(this.t * PI * 2 * 5.2);
      const up = this.v[9].set(0, 1, 0).addScaledVector(nd, -0.25);
      this.basis(res.q, HAND_CAN.nozzle, HAND_CAN.axis, nd, up);
      target.lerp(tg, a.spray);
      pole.lerp(W(0.75, -0.55, 0.25, tmp2), a.spray);
      res.qw = a.spray;
      res.grip = a.spray;
    }
    // ── litter: pick up, carry, wind up, throw, set down ──
    if (a.carry > 0.001) {
      const st = C.state ?? 'idle', t = C.t ?? 0;
      const hold = tmp.set(0.05, -0.43, -0.1).applyQuaternion(rootQ).add(sh);
      let tg = hold, grip = C.hasItem ? 1 : 0;
      const P = this.lv[8];
      if (st === 'pick' && C.target) {
        const item = P.copy(C.target);
        item.y += 0.035;
        if (t < GRAB_AT) tg = hold.lerp(item, sstep(0.0, GRAB_AT - 0.04, t));
        else tg = item.lerp(hold, sstep(RISE_AT - 0.06, PICK_END, t));
        grip = sstep(GRAB_AT - 0.08, GRAB_AT, t);
      } else if (st === 'charge') {
        const wind = P.set(0.1, 0.2, 0.17).applyQuaternion(rootQ).add(sh);
        tg = hold.lerp(wind, sstep(0, 0.75, C.charge));
        pole.lerp(W(1, -0.15, 0.6, tmp2), sstep(0, 0.5, C.charge));
        grip = 1;
      } else if (st === 'throw') {
        const k = C.throwK ?? 0, w = this.windup;
        const wind = P.set(0.1, 0.2, 0.17).applyQuaternion(rootQ).add(sh);
        const start = hold.lerp(wind, sstep(0, 0.75, w));
        const rel = this.lv[7].set(0.03, 0.08, -0.46).applyQuaternion(rootQ).add(sh);
        const follow = tmp2.set(-0.24, -0.36, -0.3).applyQuaternion(rootQ).add(sh);
        if (k < RELEASE_K) tg = start.lerp(rel, sstep(0, 1, k / RELEASE_K));
        else tg = rel.lerp(follow, sstep(0, 1, (k - RELEASE_K) / (1 - RELEASE_K)));
        pole.lerp(W(1, 0.3, 0.2, this.v[9]), 1 - sstep(0.4, 1, k));
        grip = 1 - sstep(RELEASE_K, RELEASE_K + 0.12, k);
      } else if (st === 'place') {
        const f = P.set(0.06, 0, -0.34).applyQuaternion(rootQ);
        const ground = f.set(pl.pos.x + f.x, pl.groundY + 0.07, pl.pos.z + f.z);
        tg = hold.lerp(ground, sstep(0.0, 0.26, t) * (1 - sstep(0.36, 0.66, t)));
        grip = 1 - sstep(0.27, 0.33, t);
      }
      target.lerp(tg, a.carry);
      res.grip = max(res.grip, grip * a.carry);
    }
    return res;
  }

  face(dt, ctx) {
    // blinks: every few seconds, sometimes a double
    this.blinkT -= dt;
    if (this.blinkT < 0) {
      this.blink = 0.001;
      this.blinkT = Math.random() < 0.15 ? 0.32 : 2 + Math.random() * 4.5;
    }
    let b = 0;
    if (this.blink > 0) {
      this.blink += dt;
      const u = this.blink / 0.17;
      b = u < 0.4 ? sstep(0, 0.4, u) : 1 - sstep(0.4, 1, u);
      if (u >= 1) this.blink = 0;
    }
    // eyes lead the head toward the look direction, with small saccades
    this.saccadeT -= dt;
    if (this.saccadeT < 0) {
      this.sacc = [(Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.06];
      this.saccadeT = 0.6 + Math.random() * 1.8;
    }
    const ey = clamp((this.lookYawTarget ?? 0) * 0 + this.sacc[0], -0.35, 0.35), ep = clamp(this.sacc[1], -0.25, 0.25);
    this.eyeYaw = damp(this.eyeYaw, ey, 25, dt);
    this.eyePitch = damp(this.eyePitch, ep, 25, dt);
    for (const S of ['L', 'R']) {
      this.setLocal('eye' + S, this.q[0].setFromEuler(this.e.set(this.eyePitch, this.eyeYaw, 0, 'YXZ')));
      // the upper lid follows the gaze a little and closes on a blink
      this.setLocal('lid' + S, this.q[1].setFromAxisAngle(this.v[0].set(1, 0, 0), this.eyePitch * 0.5 - 0.95 * b - (ctx.squint ?? 0) * 0.2));
    }
  }

  /** Verlet chain from the hair tie down her back, colliding with head, neck and shoulders. */
  ponytail(dt) {
    const hq = this.wq.get('head'), hp = this.wp.get('head');
    const n = PONY.length;
    const local = (i) => this.v[0].set(PONY[i][0] - J.head[0], PONY[i][1] - J.head[1], PONY[i][2] - J.head[2]).applyQuaternion(hq).add(hp);
    if (!this.pony) {
      this.pony = [];
      for (let i = 0; i < n; i++) {
        const p = local(i).clone();
        this.pony.push({ p, o: p.clone() });
      }
      this.ponyLen = [];
      for (let i = 0; i < n - 1; i++) this.ponyLen.push(this.ponyDir[i].length());
    }
    const P = this.pony;
    const h = clamp(dt, 0, 1 / 30);
    // anchor at the tie
    P[0].o.copy(P[0].p);
    P[0].p.copy(local(0));
    if (h > 0) {
      // the rest shape it springs back toward (hanging down the back in the head's frame)
      for (let i = 1; i < n; i++) {
        const q = P[i];
        const vx = (q.p.x - q.o.x) * 0.965, vy = (q.p.y - q.o.y) * 0.965, vz = (q.p.z - q.o.z) * 0.965;
        q.o.copy(q.p);
        const rest = local(i);
        const k = 0.012 + 0.02 / i;
        q.p.x += vx + (rest.x - q.p.x) * k;
        q.p.y += vy - 9.8 * h * h * 0.9 + (rest.y - q.p.y) * k;
        q.p.z += vz + (rest.z - q.p.z) * k;
      }
    }
    // colliders: skull, neck, upper back and shoulders
    const head = this.v[1].set(0, 0.09, 0.012).applyQuaternion(hq).add(hp);
    const neckA = this.wp.get('neck'), back = this.v[2].set(0, 0.11, 0.05).applyQuaternion(this.wq.get('spine2')).add(this.wp.get('spine2'));
    const backLow = this.v[3].set(0, -0.06, 0.06).applyQuaternion(this.wq.get('spine2')).add(this.wp.get('spine2'));
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < n - 1; i++) {
        const a = P[i].p, b = P[i + 1].p;
        const d = this.v[4].subVectors(b, a);
        const l = d.length() || 1e-6;
        const corr = (l - this.ponyLen[i]) / l;
        if (i === 0) b.addScaledVector(d, -corr);
        else {
          a.addScaledVector(d, corr * 0.5);
          b.addScaledVector(d, -corr * 0.5);
        }
      }
      for (let i = 1; i < n; i++) {
        const p = P[i].p;
        this.pushOut(p, head, 0.106);
        this.pushCapsule(p, neckA, head, 0.065);
        this.pushCapsule(p, back, backLow, 0.125);
      }
    }
    // orient the bones along the chain
    for (let i = 0; i < n - 1; i++) {
      const name = 'pony' + i;
      const rigid = this.v[5].copy(this.ponyDir[i]).applyQuaternion(hq).normalize();
      const actual = this.v[6].subVectors(P[i + 1].p, P[i].p).normalize();
      const qa = this.q[0].setFromUnitVectors(rigid, actual).multiply(hq);
      this.setWorld(name, qa);
    }
  }
  pushOut(p, c, r) {
    const d = this.v[7].subVectors(p, c);
    const l = d.length();
    if (l < r && l > 1e-6) p.addScaledVector(d, (r - l) / l);
  }
  pushCapsule(p, a, b, r) {
    const ab = this.v[8].subVectors(b, a);
    const t = clamp(this.v[9].subVectors(p, a).dot(ab) / max(1e-9, ab.lengthSq()), 0, 1);
    const c = this.v[10].copy(a).addScaledVector(ab, t);
    this.pushOut(p, c, r);
  }
}
