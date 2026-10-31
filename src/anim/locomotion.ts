import * as THREE from 'three';
import { B, SkeletonDef } from './skeleton';
import { makeParams, PoseParams } from './solver';
import { angleDiff, clamp, clamp01, DEG, eulerDeg, lerp, rotY, smoothstep, wrapAngle } from '../core/math';

export type LocoStyle = 'fight' | 'brawl' | 'relaxed' | 'injured' | 'heavy' | 'weapon1h' | 'weapon2h' | 'agile' | 'master';

export interface LocoInput {
  dt: number;
  rootX: number;
  rootZ: number;
  rootYaw: number;
  velX: number;
  velZ: number;
  style: LocoStyle;
  guard: number; // 0..1
  block: number; // 0..1
  /** Look direction offset (rad) relative to root yaw for head/chest aiming. */
  look: number;
  limp: number; // 0..1 injured leg
  hunch: number; // 0..1
  breath: number; // breathing intensity
  holdSide: number; // -1 hold right side, 1 hold left side, 0 none (injured)
  brokenArm: number; // 0 none, 1 left, -1 right (limp arm)
  taunt: number; // 0..1 arms-wide taunt overlay
}

interface FootState {
  pos: THREE.Vector3; // world ground position of ankle (y = height above ground)
  yaw: number;
  swing: boolean;
  from: THREE.Vector3;
  fromYaw: number;
  t: number;
  dur: number;
  lift: number;
  plantedTime: number;
}

interface StanceDef {
  feet: [[number, number, number], [number, number, number]]; // x, z, yaw(deg)
  hipsY: number;
  hipsYaw: number;
  hipsPitch: number;
  spinePitch: number;
  chestYaw: number;
  headYaw: number;
  lh: [number, number, number]; // chest space
  rh: [number, number, number];
  lhRoll: number;
  rhRoll: number;
}

const STANCES: Record<LocoStyle, StanceDef> = {
  fight: { feet: [[0.1, 0.17, -4], [-0.13, -0.17, -38]], hipsY: -0.07, hipsYaw: -24, hipsPitch: 4, spinePitch: 7, chestYaw: 6, headYaw: 18, lh: [0.17, 0.17, 0.33], rh: [-0.03, 0.19, 0.25], lhRoll: 25, rhRoll: 15 },
  master: { feet: [[0.12, 0.2, -2], [-0.14, -0.2, -45]], hipsY: -0.1, hipsYaw: -30, hipsPitch: 3, spinePitch: 5, chestYaw: 8, headYaw: 22, lh: [0.2, 0.12, 0.38], rh: [-0.02, 0.1, 0.22], lhRoll: -20, rhRoll: 10 },
  brawl: { feet: [[0.14, 0.12, 0], [-0.15, -0.15, -28]], hipsY: -0.06, hipsYaw: -14, hipsPitch: 6, spinePitch: 12, chestYaw: 4, headYaw: 10, lh: [0.2, 0.12, 0.3], rh: [-0.12, 0.14, 0.26], lhRoll: 30, rhRoll: 25 },
  agile: { feet: [[0.13, 0.16, 0], [-0.13, -0.16, -30]], hipsY: -0.11, hipsYaw: -18, hipsPitch: 8, spinePitch: 12, chestYaw: 4, headYaw: 14, lh: [0.18, 0.12, 0.34], rh: [-0.06, 0.14, 0.28], lhRoll: 30, rhRoll: 20 },
  heavy: { feet: [[0.17, 0.1, 6], [-0.17, -0.12, -18]], hipsY: -0.05, hipsYaw: -8, hipsPitch: 8, spinePitch: 12, chestYaw: 2, headYaw: 6, lh: [0.24, 0.05, 0.3], rh: [-0.2, 0.06, 0.3], lhRoll: 40, rhRoll: 40 },
  relaxed: { feet: [[0.11, 0.02, 8], [-0.11, -0.02, -8]], hipsY: -0.015, hipsYaw: -4, hipsPitch: 0, spinePitch: 3, chestYaw: 2, headYaw: 2, lh: [0.27, -0.45, 0.02], rh: [-0.27, -0.45, 0.02], lhRoll: -10, rhRoll: -10 },
  injured: { feet: [[0.12, 0.08, 5], [-0.12, -0.1, -15]], hipsY: -0.06, hipsYaw: -10, hipsPitch: 10, spinePitch: 20, chestYaw: 2, headYaw: 6, lh: [0.16, 0.0, 0.25], rh: [-0.1, -0.05, 0.2], lhRoll: 20, rhRoll: 20 },
  weapon1h: { feet: [[0.11, 0.16, -2], [-0.13, -0.16, -35]], hipsY: -0.07, hipsYaw: -22, hipsPitch: 4, spinePitch: 8, chestYaw: 4, headYaw: 16, lh: [0.18, 0.12, 0.3], rh: [-0.16, 0.02, 0.3], lhRoll: 25, rhRoll: 0 },
  weapon2h: { feet: [[0.12, 0.15, 0], [-0.13, -0.15, -30]], hipsY: -0.07, hipsYaw: -18, hipsPitch: 5, spinePitch: 8, chestYaw: 4, headYaw: 14, lh: [-0.02, 0.0, 0.32], rh: [-0.1, -0.02, 0.28], lhRoll: 0, rhRoll: 0 },
};

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _hipQ = new THREE.Quaternion();
const _sQ = new THREE.Quaternion();
const _cQ = new THREE.Quaternion();
const _chestPos = new THREE.Vector3();

export class Locomotion {
  feet: [FootState, FootState];
  phase = 0;
  gaitBlend = 0; // 0 = shuffle/idle stepping, 1 = rhythmic gait
  params: PoseParams = makeParams();
  time = Math.random() * 10;
  speedSm = 0;
  accelX = 0;
  accelZ = 0;
  prevVX = 0;
  prevVZ = 0;
  turnRate = 0;
  prevYaw = 0;
  stanceBlend = 0; // 0 = stance offsets, 1 = narrow running offsets
  guardSm = 1;
  blockSm = 0;
  styleCur: LocoStyle = 'fight';
  styleBlend: { from: StanceDef; to: StanceDef; t: number } | null = null;
  hunchSm = 0;
  limpSm = 0;
  holdSm = 0;
  tauntSm = 0;
  bob = 0;

  constructor() {
    const mk = (): FootState => ({ pos: new THREE.Vector3(), yaw: 0, swing: false, from: new THREE.Vector3(), fromYaw: 0, t: 0, dur: 0.2, lift: 0.08, plantedTime: 1 });
    this.feet = [mk(), mk()];
  }

  /** Initialize feet from world positions (e.g. after a clip). */
  init(feet: [THREE.Vector3, THREE.Vector3], yaws: [number, number], rootYaw: number) {
    for (let i = 0; i < 2; i++) {
      this.feet[i].pos.set(feet[i].x, 0, feet[i].z);
      this.feet[i].yaw = yaws[i];
      this.feet[i].swing = false;
      this.feet[i].plantedTime = 0.1;
    }
    this.prevYaw = rootYaw;
  }

  private stance(style: LocoStyle): StanceDef {
    return STANCES[style];
  }

  update(inp: LocoInput, def: SkeletonDef): PoseParams {
    const dt = Math.max(1e-4, inp.dt);
    this.time += dt;
    const S = def.scale;
    const speed = Math.hypot(inp.velX, inp.velZ);
    this.speedSm = lerp(this.speedSm, speed, 1 - Math.exp(-10 * dt));
    // acceleration (world)
    const ax = (inp.velX - this.prevVX) / dt, az = (inp.velZ - this.prevVZ) / dt;
    this.accelX = lerp(this.accelX, ax, 1 - Math.exp(-8 * dt));
    this.accelZ = lerp(this.accelZ, az, 1 - Math.exp(-8 * dt));
    this.prevVX = inp.velX;
    this.prevVZ = inp.velZ;
    const yawRate = wrapAngle(inp.rootYaw - this.prevYaw) / dt;
    this.prevYaw = inp.rootYaw;
    this.turnRate = lerp(this.turnRate, yawRate, 1 - Math.exp(-6 * dt));
    this.guardSm = lerp(this.guardSm, inp.guard, 1 - Math.exp(-10 * dt));
    this.blockSm = lerp(this.blockSm, inp.block, 1 - Math.exp(-18 * dt));
    this.hunchSm = lerp(this.hunchSm, inp.hunch, 1 - Math.exp(-3 * dt));
    this.limpSm = lerp(this.limpSm, inp.limp, 1 - Math.exp(-3 * dt));
    this.holdSm = lerp(this.holdSm, Math.abs(inp.holdSide), 1 - Math.exp(-4 * dt));
    this.tauntSm = lerp(this.tauntSm, inp.taunt, 1 - Math.exp(-5 * dt));

    // style change blending
    if (inp.style !== this.styleCur) {
      this.styleBlend = { from: this.currentStance(), to: this.stance(inp.style), t: 0 };
      this.styleCur = inp.style;
    }
    const st = this.currentStance(dt);

    // run blend: narrow feet & rhythmic gait when moving fast
    const runK = smoothstep(1.4 * S, 3.0 * S, this.speedSm);
    this.stanceBlend = runK;
    const moveK = smoothstep(0.15, 0.6, this.speedSm);

    // ------------------------------------------------------------- feet
    const cyc = lerp(1.0, 0.62, smoothstep(1.5, 6, speed / S));
    const swingFrac = lerp(0.42, 0.68, smoothstep(2, 5, speed / S));
    const stanceDur = (1 - swingFrac) * cyc;
    const swingDur = swingFrac * cyc;
    const rhythmic = speed > 1.25 * S;
    const homes: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()];
    const homeYaw: number[] = [0, 0];
    for (let i = 0; i < 2; i++) {
      const f = st.feet[i];
      // running: feet under hips, toes along velocity
      const rx = lerp(f[0], i === 0 ? 0.1 : -0.1, runK) * S;
      const rz = lerp(f[1], 0, runK) * S;
      const [wx, wz] = rotY(rx, rz, inp.rootYaw);
      homes[i].set(inp.rootX + wx, 0, inp.rootZ + wz);
      const velYaw = speed > 0.5 ? Math.atan2(inp.velX, inp.velZ) : inp.rootYaw;
      const yawStance = inp.rootYaw + f[2] * DEG;
      // when running sideways relative to facing, feet follow velocity more
      homeYaw[i] = runK > 0 ? lerpAngle(yawStance, velYaw + (i === 0 ? 0.08 : -0.08), runK) : yawStance;
    }

    if (rhythmic) {
      if (this.gaitBlend < 0.5) {
        // entering gait: choose phase so the foot furthest from its predicted home swings first
        const e0 = this.footError(0, homes[0], inp.velX, inp.velZ, swingDur);
        const e1 = this.footError(1, homes[1], inp.velX, inp.velZ, swingDur);
        this.phase = e0 >= e1 ? 0.0 : 0.5;
        for (const f of this.feet) if (f.swing) f.swing = false;
      }
      this.gaitBlend = Math.min(1, this.gaitBlend + dt * 6);
      const prevPhase = this.phase;
      this.phase = (this.phase + dt / cyc) % 1;
      for (let i = 0; i < 2; i++) {
        const start = i === 0 ? 0 : 0.5;
        const local = (((this.phase - start) % 1) + 1) % 1;
        const prevLocal = (((prevPhase - start) % 1) + 1) % 1;
        const f = this.feet[i];
        if (local < swingFrac) {
          if (!f.swing || prevLocal > local) {
            f.swing = true;
            f.from.copy(f.pos);
            f.fromYaw = f.yaw;
            f.lift = lerp(0.07, 0.16, runK) * S;
          }
          const s = local / swingFrac;
          // continuously re-target to predicted landing
          const remain = (1 - s) * swingDur;
          _v.copy(homes[i]);
          // land slightly ahead of the hips (not half a stance ahead) - more natural running
          const ahead = Math.min(stanceDur * 0.5 * speed, lerp(0.3, 0.34, runK) * S) / Math.max(speed, 1e-3);
          _v.x += inp.velX * (remain + ahead);
          _v.z += inp.velZ * (remain + ahead);
          const ss = smoothstep(0, 1, s);
          f.pos.x = lerp(f.from.x, _v.x, ss);
          f.pos.z = lerp(f.from.z, _v.z, ss);
          f.pos.y = Math.sin(Math.PI * s) * f.lift * (1 - this.limpSm * (i === 0 ? 0.6 : 0));
          f.yaw = lerpAngle(f.fromYaw, homeYaw[i], ss);
          f.t = s;
        } else {
          if (f.swing) {
            f.swing = false;
            f.pos.y = 0;
            f.plantedTime = 0;
          }
          f.plantedTime += dt;
        }
      }
    } else {
      this.gaitBlend = Math.max(0, this.gaitBlend - dt * 6);
      // finish swings in progress
      for (let i = 0; i < 2; i++) {
        const f = this.feet[i];
        if (f.swing) {
          f.t += dt / f.dur;
          const tgt = _w.copy(homes[i]);
          tgt.x += inp.velX * 0.25;
          tgt.z += inp.velZ * 0.25;
          const s = clamp01(f.t);
          const ss = smoothstep(0, 1, s);
          f.pos.x = lerp(f.from.x, tgt.x, ss);
          f.pos.z = lerp(f.from.z, tgt.z, ss);
          f.pos.y = Math.sin(Math.PI * s) * f.lift;
          f.yaw = lerpAngle(f.fromYaw, homeYaw[i], ss);
          if (s >= 1) {
            f.swing = false;
            f.pos.y = 0;
            f.plantedTime = 0;
          }
        } else f.plantedTime += dt;
      }
      // trigger error-based steps
      const anySwing = this.feet[0].swing || this.feet[1].swing;
      if (!anySwing) {
        let best = -1;
        let bestErr = 0;
        for (let i = 0; i < 2; i++) {
          const f = this.feet[i];
          if (f.plantedTime < 0.06) continue;
          const pred = _v.copy(homes[i]);
          pred.x += inp.velX * 0.3;
          pred.z += inp.velZ * 0.3;
          const err = Math.hypot(f.pos.x - pred.x, f.pos.z - pred.z);
          const yawErr = Math.abs(angleDiff(f.yaw, homeYaw[i]));
          const thr = (speed > 0.3 ? 0.07 : 0.14) * S;
          const score = err / thr + yawErr / (40 * DEG);
          if (score > 1 && score > bestErr) {
            bestErr = score;
            best = i;
          }
        }
        if (best >= 0) {
          const f = this.feet[best];
          f.swing = true;
          f.from.copy(f.pos);
          f.fromYaw = f.yaw;
          f.t = 0;
          const dist = Math.hypot(f.pos.x - homes[best].x, f.pos.z - homes[best].z);
          f.dur = clamp(0.15 + dist * 0.25, 0.15, 0.28);
          f.lift = clamp(0.03 + dist * 0.25, 0.03, 0.09) * S;
        }
      }
    }

    // ------------------------------------------------------------- body
    const prm = this.params;
    const t = this.time;
    // gait phase signals
    const ph = this.phase * Math.PI * 2;
    const gk = this.gaitBlend * moveK;
    const breathe = Math.sin(t * (1.6 + inp.breath * 2.2)) * (0.5 + inp.breath);
    // hips height: stance crouch, running bob (low at foot contact), idle bob
    const crouch = lerp(st.hipsY, -0.045, runK) - this.hunchSm * 0.05;
    const runBob = -Math.abs(Math.cos(ph)) * lerp(0.025, 0.055, runK) * gk + 0.02 * gk;
    const idleBob = breathe * 0.006 * (1 - gk);
    // weight transfer from steps in shuffle mode
    let stepBob = 0;
    for (const f of this.feet) if (f.swing && !rhythmic) stepBob += Math.sin(Math.PI * clamp01(f.t)) * 0.015;
    const limpDip = this.limpSm * (this.feet[0].swing ? 0 : 0.035) * (rhythmic ? 1 : 0.4);
    const sway = Math.sin(ph) * 0.03 * gk * (1 - runK * 0.5);
    // root-space velocity
    const [lvx, lvz] = rotY(inp.velX, inp.velZ, -inp.rootYaw);
    const [lax, laz] = rotY(this.accelX, this.accelZ, -inp.rootYaw);
    const leanFwd = clamp(lvz * 3.0 + laz * 0.9, -14, 30) * (0.4 + 0.6 * runK) + this.hunchSm * 20;
    const leanSide = clamp(-lvx * 1.2 - lax * 0.6 + this.turnRate * this.speedSm * -1.8, -18, 18);
    // feet center for hip placement
    const fc = _v.set(0, 0, 0);
    for (const f of this.feet) fc.add(f.pos);
    fc.multiplyScalar(0.5);
    const [fcx, fcz] = rotY(fc.x - inp.rootX, fc.z - inp.rootZ, -inp.rootYaw);
    const hipOverFeet = 0.55 * (1 - runK);
    prm.hipsPos.set(
      lerp(0, fcx, hipOverFeet) + sway * S,
      def.offsets[B.hips].y + (crouch + runBob + idleBob - stepBob - limpDip) * S,
      lerp(0, fcz, hipOverFeet * 0.6) + clamp(lvz * 0.02, -0.04, 0.08) * S,
    );
    const pelvisYaw = lerp(st.hipsYaw, 0, runK) + Math.sin(ph) * 9 * gk;
    const pelvisPitch = st.hipsPitch + leanFwd * 0.25;
    eulerDeg(pelvisPitch, pelvisYaw, -leanSide * 0.3 + sway * 80, prm.hipsRot);
    const chestYawStance = lerp(st.chestYaw, 0, runK);
    const counter = -Math.sin(ph) * 14 * gk;
    const spinePitch = lerp(st.spinePitch, 6, runK) + leanFwd * 0.45 + breathe * 0.8;
    eulerDeg(spinePitch * 0.5, chestYawStance * 0.5 + counter * 0.5 + inp.look * 0.15 / DEG, leanSide * 0.35, prm.spine);
    eulerDeg(spinePitch * 0.5 - breathe * 1.0, chestYawStance * 0.5 + counter * 0.5 + inp.look * 0.2 / DEG, leanSide * 0.35, prm.chest);
    // head stabilizes towards facing / look direction
    const totalYaw = pelvisYaw + chestYawStance + inp.look * 0.35 / DEG;
    const headYaw = clamp(-totalYaw + inp.look / DEG, -70, 70);
    const headPitch = -(spinePitch + pelvisPitch) * 0.6 + this.hunchSm * 10 - 2;
    eulerDeg(headPitch * 0.4, headYaw * 0.4, -leanSide * 0.25, prm.neck);
    eulerDeg(headPitch * 0.6, headYaw * 0.6, -leanSide * 0.25, prm.head);

    // chest transform (root space) for chest-space hands
    _hipQ.copy(prm.hipsRot);
    _sQ.copy(_hipQ).multiply(prm.spine);
    _cQ.copy(_sQ).multiply(prm.chest);
    _chestPos.copy(def.offsets[B.spine]).applyQuaternion(_hipQ).add(prm.hipsPos);
    _chestPos.add(_w.copy(def.offsets[B.chest]).applyQuaternion(_sQ));

    // ------------------------------------------------------------- arms
    const guard = this.guardSm * (1 - runK * 0.85);
    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? 1 : -1;
      const hp = prm.hands[side];
      // guard pose (chest space)
      const g = side === 0 ? st.lh : st.rh;
      const guardBob = Math.sin(t * 2.3 + side * 1.7) * 0.008 + breathe * 0.004 + stepBob * 0.5;
      const gp = _w.set(g[0], g[1] + guardBob, g[2]).multiplyScalar(S);
      // block: forearms up in front of face
      if (this.blockSm > 0.01) {
        const bp = _v.set(sg * 0.07, 0.31, 0.24).multiplyScalar(S);
        gp.lerp(bp, this.blockSm);
      }
      gp.applyQuaternion(_cQ).add(_chestPos);
      // running/walking arm swing (root space)
      const swing = Math.sin(ph + (side === 0 ? Math.PI : 0)) * gk;
      const runArm = new THREE.Vector3(
        sg * lerp(0.24, 0.2, runK) * S,
        lerp(0.98, 1.08, runK) * S + Math.max(0, swing) * 0.08 * runK * S,
        (lerp(0.03, 0.12, runK) + swing * lerp(0.16, 0.24, runK)) * S,
      );
      // relaxed hang
      const relaxed = side === 0 ? STANCES.relaxed.lh : STANCES.relaxed.rh;
      const rel = new THREE.Vector3(relaxed[0], relaxed[1], relaxed[2] + swing * 0.12).multiplyScalar(S).applyQuaternion(_cQ).add(_chestPos);
      const armMove = lerp(rel.length() > 0 ? 0 : 0, 1, runK);
      const base = new THREE.Vector3().copy(rel).lerp(runArm, armMove);
      hp.pos.copy(base).lerp(gp, guard);
      // injured: hold the side
      if (this.holdSm > 0.01 && Math.sign(inp.holdSide) === sg) {
        const hold = new THREE.Vector3(-sg * 0.02, 1.05, 0.12).multiplyScalar(S);
        hp.pos.lerp(hold, this.holdSm * 0.85);
      }
      // broken arm hangs limp
      if (inp.brokenArm === sg) {
        const limp = new THREE.Vector3(sg * 0.24 * S, 0.82 * S, 0.06 * S + swing * 0.05);
        hp.pos.copy(limp);
      }
      // taunt: arms out
      if (this.tauntSm > 0.01) {
        const tp = new THREE.Vector3(sg * 0.5, 1.35, 0.25).multiplyScalar(S);
        hp.pos.lerp(tp, this.tauntSm);
      }
      const guardPole = new THREE.Vector3(sg * 0.35, -1, -0.2).applyQuaternion(_cQ);
      const runPole = new THREE.Vector3(sg * 0.25, -0.2, -1);
      hp.pole.copy(runPole).lerp(guardPole, guard);
      hp.roll = lerp(lerp(-5, 10, runK), side === 0 ? st.lhRoll : st.rhRoll, guard);
      hp.dir = null;
      hp.dirW = 0;
      if (this.blockSm > 0.5) {
        hp.roll = lerp(hp.roll, -10, this.blockSm);
      }
    }
    prm.shrug[0] = prm.shrug[1] = (this.blockSm * 6 + this.hunchSm * 4) ;

    // ------------------------------------------------------------- feet out
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const fp = prm.feet[i];
      const [x, z] = rotY(f.pos.x - inp.rootX, f.pos.z - inp.rootZ, -inp.rootYaw);
      fp.pos.set(x, f.pos.y + def.ankleHeight, z);
      const yawLocal = wrapAngle(f.yaw - inp.rootYaw);
      // toe-off / heel strike pitch during swings
      let pitch = 0;
      let toe = 0;
      if (f.swing) {
        const s = rhythmic ? f.t : clamp01(f.t);
        pitch = Math.sin(s * Math.PI) * -12 + (s < 0.3 ? (0.3 - s) * 60 : 0) * runK;
        toe = s < 0.25 ? (0.25 - s) * 80 * gk : 0;
      } else if (gk > 0.01) {
        // toe-off: heel rises when the planted foot trails behind the hips
        const [lvx2, lvz2] = rotY(inp.velX, inp.velZ, -inp.rootYaw);
        const sp = Math.hypot(lvx2, lvz2) || 1;
        const behind = -((x - prm.hipsPos.x) * lvx2 + (z - prm.hipsPos.z) * lvz2) / sp;
        const lift = clamp((behind - 0.12 * S) / (0.35 * S), 0, 1) * gk;
        pitch = lift * 48;
        toe = lift * 40;
        // rotate ankle about the ball of the foot
        const L = def.footLen;
        fp.pos.y = def.ankleHeight + Math.sin(pitch * DEG) * L * 0.85;
        const back = (1 - Math.cos(pitch * DEG)) * L * 0.85;
        fp.pos.x -= (lvx2 / sp) * back;
        fp.pos.z -= (lvz2 / sp) * back;
      }
      eulerDeg(pitch, yawLocal / DEG, 0, fp.rot);
      fp.toe = toe;
      fp.pole.set(Math.sin(yawLocal) + (i === 0 ? 0.25 : -0.25), 0.1, Math.cos(yawLocal));
    }
    prm.autoHipDrop = true;
    this.bob = runBob;
    void _q;
    return prm;
  }

  private footError(i: number, home: THREE.Vector3, vx: number, vz: number, lead: number) {
    const f = this.feet[i];
    return Math.hypot(f.pos.x - (home.x + vx * lead), f.pos.z - (home.z + vz * lead));
  }

  private currentStance(dt = 0): StanceDef {
    const target = STANCES[this.styleCur];
    if (!this.styleBlend) return target;
    this.styleBlend.t = Math.min(1, this.styleBlend.t + dt * 4);
    const a = this.styleBlend.from, b = this.styleBlend.to, t = smoothstep(0, 1, this.styleBlend.t);
    if (this.styleBlend.t >= 1) this.styleBlend = null;
    const L = (x: number, y: number) => lerp(x, y, t);
    const L3 = (x: [number, number, number], y: [number, number, number]): [number, number, number] => [L(x[0], y[0]), L(x[1], y[1]), L(x[2], y[2])];
    return {
      feet: [L3(a.feet[0], b.feet[0]), L3(a.feet[1], b.feet[1])],
      hipsY: L(a.hipsY, b.hipsY), hipsYaw: L(a.hipsYaw, b.hipsYaw), hipsPitch: L(a.hipsPitch, b.hipsPitch), spinePitch: L(a.spinePitch, b.spinePitch),
      chestYaw: L(a.chestYaw, b.chestYaw), headYaw: L(a.headYaw, b.headYaw), lh: L3(a.lh, b.lh), rh: L3(a.rh, b.rh), lhRoll: L(a.lhRoll, b.lhRoll), rhRoll: L(a.rhRoll, b.rhRoll),
    };
  }

  /** World positions of feet (for handing to clips). */
  footWorld(i: number, out: THREE.Vector3) {
    return out.copy(this.feet[i].pos).setY(0);
  }
}

const lerpAngle = (a: number, b: number, t: number) => a + wrapAngle(b - a) * t;
