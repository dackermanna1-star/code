import * as THREE from 'three';
import { B, SkeletonDef } from './skeleton';
import { makeParams, pivotOffset, PoseParams } from './solver';
import { angleDiff, clamp, clamp01, DEG, eulerDeg, lerp, lookTurn, rotY, smoothstep, wrapAngle } from '../core/math';
import type { MocapDriver } from './mocapLoco';

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
  /** 0..1 closing in to strike: the guard stays up even at a sprint. */
  charge?: number;
  /** 0..1 speaking (out of a fight: hands that talk), and how heated it is (0..1). */
  talk?: number;
  argue?: number;
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
  /** Progress 0..1 through the current stance (rhythmic gait). */
  stanceT: number;
  /** Current foot pitch (deg, + = heel up) and the pitch when the swing began. */
  pitch: number;
  fromPitch: number;
  /** Lift-off position in travel-aligned body axes (u forward, w lateral). */
  fromU: number;
  fromW: number;
  /** Travel axis frozen at lift-off (running swing frame). */
  axX: number;
  axZ: number;
  /** Toe-joint bend now and at lift-off. */
  toe: number;
  fromToe: number;
  /** The gait cycle has reached this foot's lift-off (waiting for the other foot to land). */
  liftDue: boolean;
  /** Run/walk mix of the current swing (eased, so a speed change mid-stride bends the path). */
  rk: number;
}

export interface StanceDef {
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
const _fwdTmp = new THREE.Vector3();
/** Yaw (about +Y) of a rotation. */
function eulerYaw(q: THREE.Quaternion) {
  _fwdTmp.set(0, 0, 1).applyQuaternion(q);
  return Math.atan2(_fwdTmp.x, _fwdTmp.z);
}

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
  /** Ground height provider (bodies on the floor). */
  ground: ((x: number, z: number) => number) | null = null;
  /** Motion-captured driver (player): replaces the procedural gait when set. */
  mocap: MocapDriver | null = null;
  private groundSm = 0;
  private rhythmic = false;
  private legYaw = 0;
  private idleShift = 0;
  private dropSm = 0;
  private latSm = 0;
  private backSm = 0;
  private runKSm = 0;
  private lookSm = 0;
  private _home0 = new THREE.Vector3();
  private _home1 = new THREE.Vector3();
  private _walkArm = new THREE.Vector3();
  private _runArm = new THREE.Vector3();
  private _armBase = new THREE.Vector3();
  private _pole = new THREE.Vector3();
  /** Gait events of the last update (debug / probe). */
  events: string[] = [];
  /** Gait timing of the last update (debug / probe). */
  gaitInfo = { cyc: 1, swingFrac: 0.4, runK: 0 };

  constructor() {
    const mk = (): FootState => ({ pos: new THREE.Vector3(), yaw: 0, swing: false, from: new THREE.Vector3(), fromYaw: 0, t: 0, dur: 0.2, lift: 0.08, plantedTime: 1, stanceT: 0.5, pitch: 0, fromPitch: 0, fromU: 0, fromW: 0, axX: 0, axZ: 1, toe: 0, fromToe: 0, liftDue: false, rk: 0 });
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
    this.mocap?.init(this, feet, yaws);
  }

  private stance(style: LocoStyle): StanceDef {
    return STANCES[style];
  }

  update(inp: LocoInput, def: SkeletonDef): PoseParams {
    const dt = Math.max(1e-4, inp.dt);
    this.time += dt;
    this.events.length = 0;
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
      this.events.push('style');
      this.styleBlend = { from: this.currentStance(), to: this.stance(inp.style), t: 0 };
      this.styleCur = inp.style;
    }
    const st = this.currentStance(dt);
    if (this.mocap) return this.mocap.update(this, inp, def, st, dt);
    const fightStyle = inp.style !== 'relaxed' && inp.style !== 'injured';

    // ------------------------------------------------------------- gait model
    // Speeds are normalised by body scale. Cadence (steps/s) and duty factor (stance share of
    // the cycle) follow human walking/running data: walking 1.6-2.2 steps/s with ~60% stance,
    // running 2.6-3.2 steps/s with a short stance and a flight phase.
    const v = this.speedSm / S;
    const [lvx, lvz] = rotY(inp.velX, inp.velZ, -inp.rootYaw);
    // direction factors are eased: a fighter snapping round to a new target must not flip the gait
    const dirK = 1 - Math.exp(-7 * dt);
    this.latSm = lerp(this.latSm, speed > 0.05 ? Math.abs(lvx) / speed : 0, dirK);
    this.backSm = lerp(this.backSm, speed > 0.05 ? smoothstep(0.2, 0.7, -lvz / speed) : 0, dirK);
    const lat = this.latSm; // 1 = moving sideways
    const backK = this.backSm; // moving backwards
    this.runKSm = lerp(this.runKSm, smoothstep(1.9, 2.6, v) * (1 - 0.6 * backK), 1 - Math.exp(-6 * dt));
    const runK = this.runKSm;
    this.stanceBlend = runK;
    this.lookSm += wrapAngle(inp.look - this.lookSm) * (1 - Math.exp(-14 * dt));
    const look = lookTurn(this.lookSm, 100 * DEG);
    const moveK = smoothstep(0.15, 0.6, this.speedSm);
    const walkT = clamp01((v - 0.5) / 1.5);
    const runT = clamp01((v - 2.2) / 3.8);
    // backing off in a fighting stance: short, quick steps
    const shuffleK = fightStyle ? backK * (1 - runK) : 0;
    // circling / moving diagonally: the hips and legs turn towards the travel direction and walk
    // (the chest counter-twists to stay on the opponent) instead of side-stepping with crossed legs
    {
      let want = 0;
      if (speed > 0.3 * S) {
        const travel = Math.atan2(lvx, lvz); // 0 = forwards, +pi/2 = to the left
        const legDir = Math.abs(travel) <= 1.75 ? travel : travel - Math.PI * Math.sign(travel);
        want = clamp(legDir, -0.95, 0.95) * smoothstep(0.25, 0.7, Math.abs(lvx) / speed) * (1 - runK * 0.7);
      }
      this.legYaw = lerp(this.legYaw, want, 1 - Math.exp(-6 * dt));
    }
    const legYaw = this.legYaw;
    let cadence = lerp(lerp(1.6, 2.35, walkT), lerp(2.55, 3.15, runT), runK);
    cadence = lerp(cadence, lerp(2.3, 2.9, walkT), shuffleK);
    cadence *= lerp(1, 0.86, this.limpSm);
    const cyc = 2 / cadence;
    const duty = lerp(lerp(0.63, 0.58, walkT), lerp(0.34, 0.24, runT), runK);
    const swingFrac = 1 - duty;
    const stanceDur = duty * cyc;
    const swingDur = swingFrac * cyc;
    this.gaitInfo.cyc = cyc;
    this.gaitInfo.swingFrac = swingFrac;
    this.gaitInfo.runK = runK;
    // hysteresis between rhythmic gait and error-driven stepping
    const wasRhythmic = this.rhythmic;
    if (speed > 1.25 * S) this.rhythmic = true;
    else if (speed < 1.0 * S) this.rhythmic = false;
    if (wasRhythmic !== this.rhythmic) this.events.push(this.rhythmic ? 'gait+' : 'gait-');
    const rhythmic = this.rhythmic;

    const homes: THREE.Vector3[] = [this._home0, this._home1];
    const homeYaw: number[] = [0, 0];
    const velYaw = speed > 0.5 ? Math.atan2(inp.velX, inp.velZ) : inp.rootYaw;
    for (let i = 0; i < 2; i++) {
      const f = st.feet[i];
      // moving: feet come in under the hips (narrower track), stance offsets fade
      const narrow = Math.max(runK, moveK * 0.55 * (1 - shuffleK));
      const rx = lerp(f[0], i === 0 ? 0.095 : -0.095, narrow) * S;
      const rz = lerp(f[1], 0, Math.max(runK, moveK * 0.6 * (1 - shuffleK))) * S;
      const [wx, wz] = rotY(rx, rz, inp.rootYaw + legYaw);
      homes[i].set(inp.rootX + wx, 0, inp.rootZ + wz);
      const yawStance = inp.rootYaw + legYaw + f[2] * DEG;
      // toes turn towards the direction of travel when running forwards
      const fwdK = runK * (1 - lat) * (1 - backK);
      homeYaw[i] = lerpAngle(yawStance, velYaw + (i === 0 ? 0.08 : -0.08), fwdK);
    }
    // left axis of the legs for the no-crossing rule (only while travelling, so feet that got
    // crossed during a turn on the spot can still untangle)
    const lax = Math.cos(inp.rootYaw + legYaw), laz = -Math.sin(inp.rootYaw + legYaw);
    const minGap = lerp(0.12, 0.08, runK) * S;
    const noCross = speed > 0.35 * S;

    // the no-crossing correction fades in with speed instead of switching on
    const crossK = smoothstep(0.25, 0.45, speed / S);
    const liftH = lerp(lerp(0.075, 0.1, walkT), lerp(0.24, 0.42, runT), runK) * lerp(1, 0.6, shuffleK) * S;

    if (rhythmic) {
      if (!wasRhythmic) {
        // entering the gait from the stepping mode: a step in progress carries on as the first
        // stride (re-based where the foot is now); otherwise the foot furthest behind leads
        const sw = this.feet[0].swing ? this.feet[0] : this.feet[1].swing ? this.feet[1] : null;
        if (sw) {
          this.phase = sw === this.feet[0] ? 0 : 0.5;
          this.beginSwing(sw, inp, speed, liftH * 0.7, runK);
          this.events.push('carry');
        } else {
          const e0 = this.footError(0, homes[0], inp.velX, inp.velZ, swingDur);
          const e1 = this.footError(1, homes[1], inp.velX, inp.velZ, swingDur);
          this.phase = e0 >= e1 ? 0.0 : 0.5;
        }
        for (const f of this.feet) f.liftDue = false;
      }
      this.gaitBlend = Math.min(1, this.gaitBlend + dt * 6);
      // a planted foot that the body has left far behind (accelerating away, a sharp change of
      // direction, legs re-orienting) steps as soon as the other foot can take the weight: the
      // cycle re-centres on it
      {
        let worst = -1, worstD = Math.max(0.5 * S, speed * stanceDur * 0.75);
        for (let i = 0; i < 2; i++) {
          const f = this.feet[i], o = this.feet[1 - i];
          if (f.swing || f.plantedTime < 0.1) continue;
          if (o.swing && o.t < 0.75 && runK < 0.35) continue;
          const d = Math.hypot(f.pos.x - homes[i].x, f.pos.z - homes[i].z);
          if (d > worstD) {
            worstD = d;
            worst = i;
          }
        }
        if (worst >= 0) {
          this.phase = worst === 0 ? 0.999 : 0.499;
          this.feet[worst].liftDue = true;
          this.events.push('rephase' + worst);
        }
      }
      const prevPhase = this.phase;
      this.phase = (this.phase + dt / cyc) % 1;
      for (let i = 0; i < 2; i++) {
        const start = i === 0 ? 0 : 0.5;
        const local = (((this.phase - start) % 1) + 1) % 1;
        const prevLocal = (((prevPhase - start) % 1) + 1) % 1;
        const f = this.feet[i];
        const o = this.feet[1 - i];
        // Lift-off happens only when the cycle reaches this foot (or early in its swing window).
        // A change of cadence or duty factor moves the swing/stance boundary, but it can never
        // throw a planted foot into the middle of a swing, or cut a swing short in mid-air:
        // each swing runs on its own clock once it has started.
        if (!f.swing) {
          if (prevLocal > local + 0.5 || (local < swingFrac * 0.3 && f.plantedTime > 0.12)) f.liftDue = true;
          // walking keeps one foot on the ground: wait for the other foot to come down
          if (f.liftDue && (!o.swing || runK > 0.35 || o.t > 0.8)) {
            f.liftDue = false;
            this.beginSwing(f, inp, speed, liftH, runK);
            this.events.push('lift' + i);
          }
        }
        if (f.swing) {
          f.t = Math.min(1, f.t + dt / swingDur);
          f.rk = lerp(f.rk, runK, 1 - Math.exp(-3 * dt));
          const rk = f.rk;
          const s = f.t;
          const remain = (1 - s) * swingDur;
          // land a little less than half the contact distance ahead (heel strike ~0.35 m in
          // front of the hips when walking); the trailing half is covered by the heel rising
          const ahead = stanceDur * lerp(0.37, 0.42, rk);
          _v.copy(homes[i]);
          _v.x += inp.velX * (remain + ahead);
          _v.z += inp.velZ * (remain + ahead);
          // never cross the planted foot: keep at least minGap along the legs' left axis
          const sideSign = i === 0 ? 1 : -1;
          const sep = ((_v.x - o.pos.x) * lax + (_v.z - o.pos.z) * laz) * sideSign;
          if (noCross && sep < minGap) {
            _v.x += lax * sideSign * (minGap - sep) * crossK;
            _v.z += laz * sideSign * (minGap - sep) * crossK;
          }
          // walking: the foot glides from lift-off to landing (world space)
          const ps = smoothstep(0, 1, s);
          const wx = lerp(f.from.x, _v.x, ps), wz = lerp(f.from.z, _v.z, ps);
          const g1 = this.ground ? this.ground(wx, wz) : 0;
          const base = lerp(f.from.y, g1, ps);
          const arc = Math.sin(Math.PI * Math.pow(s, 0.8)) * (f.lift + Math.abs(g1 - f.from.y) * 0.6) * (1 - this.limpSm * (i === 0 ? 0.6 : 0));
          if (rk > 0.001 && speed > 0.1) {
            // running: a body-frame loop - the heel rises behind the hips, the knee drives
            // through, then the foot reaches down to land (cubic Bezier in travel-aligned axes)
            const dX = f.axX, dZ = f.axZ;
            const rootNowX = inp.rootX, rootNowZ = inp.rootZ;
            const u0 = f.fromU, w0 = f.fromW;
            const landX = _v.x - (rootNowX + inp.velX * remain), landZ = _v.z - (rootNowZ + inp.velZ * remain);
            const u1 = landX * dX + landZ * dZ, w1 = -landX * dZ + landZ * dX;
            const H = f.lift;
            const c1u = u0 - 0.04 * S, c1h = H * 1.25;
            const c2u = u1 + 0.12 * S, c2h = H * 0.7;
            const a = 1 - s;
            const bu = a * a * a * u0 + 3 * a * a * s * c1u + 3 * a * s * s * c2u + s * s * s * u1;
            const bh = 3 * a * a * s * c1h + 3 * a * s * s * c2h;
            const bw = lerp(w0, w1, smoothstep(0, 1, s));
            const rx = rootNowX + dX * bu - dZ * bw, rz = rootNowZ + dZ * bu + dX * bw;
            f.pos.x = lerp(wx, rx, rk);
            f.pos.z = lerp(wz, rz, rk);
            f.pos.y = base + lerp(arc, bh, rk);
          } else {
            f.pos.x = wx;
            f.pos.z = wz;
            f.pos.y = base + arc;
          }
          f.yaw = lerpAngle(f.fromYaw, homeYaw[i], smoothstep(0, 0.8, s));
          f.stanceT = 0;
          if (s >= 1) {
            this.events.push('land' + i);
            f.swing = false;
            f.pos.y = g1;
            f.plantedTime = 0;
          }
        } else {
          f.plantedTime += dt;
          f.stanceT = clamp01(f.plantedTime / Math.max(0.08, stanceDur));
        }
      }
    } else {
      this.gaitBlend = Math.max(0, this.gaitBlend - dt * 6);
      if (wasRhythmic) {
        // leaving the gait mid-stride: the airborne foot comes down from where it is now
        for (const f of this.feet) {
          f.liftDue = false;
          if (!f.swing) continue;
          f.dur = clamp((1 - f.t) * swingDur, 0.1, 0.24);
          f.from.copy(f.pos);
          f.fromYaw = f.yaw;
          f.fromPitch = f.pitch;
          f.fromToe = f.toe;
          f.t = 0;
          f.lift = 0.02 * S;
        }
      }
      // finish swings in progress
      for (let i = 0; i < 2; i++) {
        const f = this.feet[i];
        const o = this.feet[1 - i];
        if (f.swing) {
          f.t += dt / f.dur;
          const tgt = _w.copy(homes[i]);
          tgt.x += inp.velX * 0.25;
          tgt.z += inp.velZ * 0.25;
          const sideSign = i === 0 ? 1 : -1;
          const sep = ((tgt.x - o.pos.x) * lax + (tgt.z - o.pos.z) * laz) * sideSign;
          if (noCross && sep < minGap) {
            tgt.x += lax * sideSign * (minGap - sep) * crossK;
            tgt.z += laz * sideSign * (minGap - sep) * crossK;
          }
          const s = clamp01(f.t);
          const ss = smoothstep(0, 1, s);
          f.pos.x = lerp(f.from.x, tgt.x, ss);
          f.pos.z = lerp(f.from.z, tgt.z, ss);
          const g1 = this.ground ? this.ground(f.pos.x, f.pos.z) : 0;
          f.pos.y = lerp(f.from.y, g1, ss) + Math.sin(Math.PI * Math.pow(s, 0.85)) * (f.lift + Math.abs(g1 - f.from.y) * 0.6);
          f.yaw = lerpAngle(f.fromYaw, homeYaw[i], ss);
          if (s >= 1) {
            this.events.push('sland' + i);
            f.swing = false;
            f.pos.y = g1;
            f.plantedTime = 0;
          }
        } else f.plantedTime += dt;
        f.stanceT = 0.5;
      }
      // trigger error-based steps (the foot that needs it most; never both at once)
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
          // in a guard shuffle the lead foot (towards the motion) steps first
          const lead = speed > 0.3 ? ((inp.velX * lax + inp.velZ * laz) * (i === 0 ? 1 : -1) > 0 ? 1.25 : 1) : 1;
          const score = (err / thr + yawErr / (40 * DEG)) * lead;
          if (score > 1 && score > bestErr) {
            bestErr = score;
            best = i;
          }
        }
        if (best >= 0) {
          this.events.push('step' + best);
          const f = this.feet[best];
          f.swing = true;
          f.from.copy(f.pos);
          f.fromYaw = f.yaw;
          f.fromPitch = f.pitch;
          f.fromToe = f.toe;
          f.t = 0;
          const dist = Math.hypot(f.pos.x - homes[best].x, f.pos.z - homes[best].z);
          f.dur = clamp(0.14 + dist * 0.25, 0.14, 0.27);
          f.lift = clamp(0.035 + dist * 0.22, 0.035, 0.09) * S;
        }
      }
    }

    // ------------------------------------------------------------- body
    const prm = this.params;
    const t = this.time;
    const gk = this.gaitBlend * moveK;
    const breathe = Math.sin(t * (1.6 + inp.breath * 2.2)) * (0.5 + inp.breath);
    const [lax2, laz2] = rotY(this.accelX, this.accelZ, -inp.rootYaw);
    // feet in root space (drive pelvis rotation, sway and the counter-swing of the arms)
    const fz: number[] = [0, 0];
    const fx: number[] = [0, 0];
    for (let i = 0; i < 2; i++) {
      const [x, z] = rotY(this.feet[i].pos.x - inp.rootX, this.feet[i].pos.z - inp.rootZ, -inp.rootYaw);
      fx[i] = x;
      fz[i] = z;
    }
    // stride signal along the direction of travel: >0 = left foot ahead of the right
    const tdx = speed > 0.05 ? lvx / speed : 0, tdz = speed > 0.05 ? lvz / speed : 1;
    const strideLR = ((fx[0] - fx[1]) * tdx + (fz[0] - fz[1]) * tdz) / S;
    const strideFwd = (fz[0] - fz[1]) / S; // in facing space (arms swing fore/aft of the chest)
    // hips height: stance crouch; walking vaults over the stance leg (autoHipDrop does the dip),
    // running compresses at mid-stance and floats during flight
    const crouch = lerp(st.hipsY, lerp(-0.012, -0.03, runK), Math.max(runK, moveK * 0.7)) - this.hunchSm * 0.05;
    let compress = 0;
    for (const f of this.feet) if (!f.swing && rhythmic) compress = Math.max(compress, Math.sin(Math.PI * clamp01(f.stanceT)));
    const runBob = (0.03 - compress * 0.07) * runK * gk;
    const walkBob = (compress * 0.012 - 0.004) * (1 - runK) * gk;
    const idleBob = breathe * 0.006 * (1 - gk);
    let stepBob = 0;
    for (const f of this.feet) if (f.swing && !rhythmic) stepBob += Math.sin(Math.PI * clamp01(f.t)) * 0.012;
    const limpDip = this.limpSm * (this.feet[0].swing ? 0 : 0.035) * (rhythmic ? 1 : 0.4);
    // weight shifts over the planted foot (walking), little when running
    let swayX = 0;
    if (rhythmic) {
      for (let i = 0; i < 2; i++) if (!this.feet[i].swing) swayX += fx[i] * 0.16 * Math.sin(Math.PI * clamp01(this.feet[i].stanceT));
      swayX *= (1 - runK * 0.7) * gk;
    }
    const leanFwd = clamp(lvz * 3.0 + laz2 * 0.9, -14, 30) * (0.35 + 0.65 * runK) + this.hunchSm * 20;
    const leanSide = clamp(-lvx * 1.2 - lax2 * 0.6 + this.turnRate * this.speedSm * -1.8, -18, 18);
    const fc = _v.set(0, 0, 0);
    for (const f of this.feet) fc.add(f.pos);
    fc.multiplyScalar(0.5);
    const [fcx, fcz] = rotY(fc.x - inp.rootX, fc.z - inp.rootZ, -inp.rootYaw);
    const hipOverFeet = 0.55 * (1 - Math.max(runK, gk * 0.8));
    const planted = this.feet.filter((f) => !f.swing);
    const gLow = this.ground && planted.length ? Math.min(0.4, ...planted.map((f) => f.pos.y)) : 0;
    this.groundSm = lerp(this.groundSm, Math.max(0, gLow), 1 - Math.exp(-8 * dt));
    // idle life: a slow weight shift between the feet, and a light bounce on the balls of the
    // feet for the nimble styles (each fighter has its own phase via this.time's random start)
    const idleK = (1 - gk) * (1 - this.blockSm) * (1 - this.hunchSm * 0.6);
    const nimble = inp.style === 'agile' || inp.style === 'master' || inp.style === 'fight';
    const heavyStyle = inp.style === 'heavy' || inp.style === 'brawl';
    const shift = Math.sin(t * (heavyStyle ? 0.55 : 0.8)) * (heavyStyle ? 0.03 : 0.022) * idleK * (fightStyle ? 1 : 0.5);
    const bounce = nimble ? (Math.abs(Math.sin(t * 2.7)) - 0.6) * 0.012 * idleK : 0;
    prm.hipsPos.set(
      lerp(0, fcx, hipOverFeet) + swayX + shift * S,
      def.offsets[B.hips].y + (crouch + runBob + walkBob + idleBob - stepBob - limpDip + bounce) * S + this.groundSm * 0.85,
      lerp(0, fcz, hipOverFeet * 0.6) + clamp(lvz * 0.015, -0.04, 0.07) * S,
    );
    this.idleShift = shift;
    // pelvis turns with the legs (the hip of the forward leg leads), lists towards the swing leg
    const pelvisTwist = clamp(-strideLR * lerp(9, 12, runK), -12, 12) * gk * (1 - shuffleK * 0.8);
    let list = 0;
    if (rhythmic) for (let i = 0; i < 2; i++) if (this.feet[i].swing) list += (i === 0 ? 1 : -1) * Math.sin(Math.PI * this.feet[i].t) * lerp(4, 2, runK);
    const pelvisYaw = lerp(st.hipsYaw, 0, Math.max(runK, gk * 0.6 * (1 - shuffleK))) + pelvisTwist + (legYaw / DEG) * 0.65;
    const pelvisPitch = st.hipsPitch + leanFwd * 0.25;
    eulerDeg(pelvisPitch, pelvisYaw, -leanSide * 0.3 + list * gk - this.idleShift * 140, prm.hipsRot);
    // ------------------------------------------------------------- feet out
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const fp = prm.feet[i];
      const x = fx[i], z = fz[i];
      const yawLocal = wrapAngle(f.yaw - inp.rootYaw);
      // foot pitch (+ = heel up / toes down). Continuous through the whole cycle so nothing pops.
      let pitch = 0;
      let toe = 0;
      // how much the foot pivots on its contact point (ball when the heel is up, heel when the
      // toes are up) rather than on the ankle
      let pivotW = 1;
      const sp = speed || 1;
      const dirX = lvx / sp, dirZ = lvz / sp;
      const fwdGait = gk * (1 - backK);
      if (f.swing) {
        const s = clamp01(f.t);
        // leaving the ground from toe-off, toes up mid-swing, heel-first landing when walking
        const land = lerp(-14, -4, runK) * fwdGait;
        const mid = lerp(-10, 18, runK) * fwdGait; // running swing keeps the toes pointed
        const a = lerp(f.fromPitch, mid, smoothstep(0, 0.45, s));
        pitch = lerp(a, land, smoothstep(0.55, 1, s));
        toe = f.fromToe * (1 - smoothstep(0, 0.3, s));
        // the toes peel off the floor at the start of the swing, the heel reaches for it at the end
        pivotW = s < 0.5 ? 1 - smoothstep(0, 0.4, s) : smoothstep(0.6, 1, s);
      } else {
        let want = 0;
        if (gk > 0.01) {
          const behind = -((x - prm.hipsPos.x) * dirX + (z - prm.hipsPos.z) * dirZ);
          // heel strike -> foot flat over the first part of the stance (walking)
          const strike = rhythmic ? (1 - smoothstep(0, 0.16, f.stanceT)) * lerp(-14, -4, runK) * fwdGait : 0;
          // heel rises as the foot trails the hips: rolls over the ball of the foot (toe-off)
          const lift = clamp((behind - lerp(0.04, 0.0, runK) * S) / (lerp(0.42, 0.4, runK) * S), 0, 1) * fwdGait;
          want = strike + Math.pow(lift, 1.3) * lerp(58, 62, runK);
        }
        // a planted foot eases between pitches (gait mode switches must not snap the heel down)
        pitch = lerp(f.pitch, want, 1 - Math.exp(-28 * dt));
        // toes stay flat on the floor while the heel is up
        toe = Math.max(0, pitch) * 0.92;
      }
      f.pitch = pitch;
      f.toe = toe;
      // rotate about the contact point: keeps the ball of the foot planted through toe-off
      const [pdy, pdf] = pivotOffset(def, pitch);
      const fwx = Math.sin(yawLocal), fwz = Math.cos(yawLocal);
      fp.pos.set(x + fwx * pdf * pivotW, f.pos.y + def.ankleHeight + pdy * pivotW, z + fwz * pdf * pivotW);
      fp.swing = f.swing && rhythmic;
      eulerDeg(pitch, yawLocal / DEG, 0, fp.rot);
      fp.toe = toe;
      fp.pole.set(Math.sin(yawLocal) + (i === 0 ? 0.22 : -0.22), 0.1, Math.cos(yawLocal));
    }
    // ------------------------------------------------------------- hip drop
    // Lower the hips so the legs reach their targets. A swinging foot only counts as it lifts off
    // and as it comes down (so touchdown does not yank the hips), and the drop is smoothed; the
    // torso and arms are placed after this, so the guard hands ride down with the shoulders.
    {
      let want = 0;
      const L = (def.lenThigh + def.lenShin) * 0.985;
      for (let i = 0; i < 2; i++) {
        const f = this.feet[i];
        const fp = prm.feet[i];
        let w = 1;
        if (f.swing) {
          const s2 = clamp01(f.t);
          w = Math.max(1 - smoothstep(0, 0.3, s2), smoothstep(0.62, 1, s2));
        }
        const th = i === 0 ? B.thighL : B.thighR;
        const hj = _w.copy(def.offsets[th]).applyQuaternion(prm.hipsRot).add(prm.hipsPos);
        const dx = fp.pos.x - hj.x, dz = fp.pos.z - hj.z, dy = fp.pos.y - hj.y;
        const h2 = L * L - dx * dx - dz * dz;
        const need = h2 > 0 ? dy + Math.sqrt(h2) : -0.35 * S;
        if (need < 0) want = Math.min(want, need * w);
      }
      want = Math.max(want, -0.2 * S);
      const rate = want < this.dropSm ? 30 : 9;
      this.dropSm += (want - this.dropSm) * (1 - Math.exp(-rate * dt));
      prm.hipsPos.y += this.dropSm;
    }
    const chestYawStance = lerp(st.chestYaw, 0, Math.max(runK, gk * 0.6 * (1 - shuffleK)));
    // shoulders counter-rotate against the pelvis so the chest stays square to the travel
    const counter = -pelvisTwist * lerp(1.15, 1.35, runK) - (legYaw / DEG) * 0.6;
    const spinePitch = lerp(st.spinePitch, lerp(3, 7, runK), Math.max(runK, gk * 0.5)) + leanFwd * 0.45 + breathe * 0.8;
    eulerDeg(spinePitch * 0.5, chestYawStance * 0.5 + counter * 0.5 + look * 0.15 / DEG, leanSide * 0.35 - list * 0.4 * gk + this.idleShift * 90, prm.spine);
    eulerDeg(spinePitch * 0.5 - breathe * 1.0, chestYawStance * 0.5 + counter * 0.5 + look * 0.2 / DEG, leanSide * 0.35 - list * 0.3 * gk, prm.chest);
    // head stays level and on target
    const totalYaw = pelvisYaw + chestYawStance + counter + look * 0.35 / DEG;
    const headYaw = clamp(-totalYaw + look / DEG + lerp(st.headYaw, 0, Math.max(runK, gk)) * 0, -70, 70);
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
    // relaxed walkers let their arms hang and swing; fighters keep a guard that loosens when running
    const guard = this.guardSm * (1 - runK * 0.85) * (fightStyle ? 1 : inp.style === 'injured' ? 0.35 : 0);
    // arms counter-swing the legs: the left arm comes forward as the left leg goes back
    const swingAmt = clamp(strideFwd / lerp(0.9, 1.6, runK), -1, 1) * gk;
    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? 1 : -1;
      const hp = prm.hands[side];
      const swing = -swingAmt * sg; // +1 = this arm forward
      // guard pose (chest space)
      const g = side === 0 ? st.lh : st.rh;
      const guardBob = Math.sin(t * 2.3 + side * 1.7) * 0.008 + breathe * 0.004 + stepBob * 0.5;
      const gp = _w.set(g[0], g[1] + guardBob + Math.abs(swing) * 0.012 * gk, g[2] + swing * 0.035).multiplyScalar(S);
      if (this.blockSm > 0.01) {
        const bp = _v.set(sg * 0.07, 0.31, 0.24).multiplyScalar(S);
        gp.lerp(bp, this.blockSm);
      }
      gp.applyQuaternion(_cQ).add(_chestPos);
      // natural walking swing: hanging arm pendulum, elbow bends more on the forward swing
      const fwd = Math.max(0, swing), back = Math.max(0, -swing);
      const cy = _chestPos.y;
      const walkArm = this._walkArm.set(
        sg * (0.205 - fwd * 0.035) * S,
        cy + (-0.42 + fwd * 0.07 + back * 0.02) * S,
        (0.0 + swing * lerp(0.17, 0.22, walkT)) * S,
      );
      // running: elbows ~90 degrees, hands pump from hip to chest height
      const runArm = this._runArm.set(
        sg * (0.19 - fwd * 0.06) * S,
        cy + (-0.27 + fwd * lerp(0.13, 0.2, runT) - back * 0.02) * S,
        (0.05 + swing * lerp(0.19, 0.26, runT)) * S,
      );
      // walking arm positions follow the chest (root-space offsets rotate with the torso)
      const base = this._armBase.copy(walkArm).lerp(runArm, runK);
      {
        // hanging / pumping arms turn with the chest (yaw only)
        const [bx, bz] = rotY(base.x, base.z, eulerYaw(_cQ));
        base.x = bx;
        base.z = bz;
      }
      hp.pos.copy(base).lerp(gp, guard);
      if (this.holdSm > 0.01 && Math.sign(inp.holdSide) === sg) {
        const hold = _v.set(-sg * 0.02, 1.05, 0.12).multiplyScalar(S);
        hp.pos.lerp(hold, this.holdSm * 0.85);
      }
      if (inp.brokenArm === sg) {
        hp.pos.set(sg * 0.24 * S, 0.82 * S, 0.06 * S + swing * 0.05);
      }
      if (this.tauntSm > 0.01) {
        const tp = _v.set(sg * 0.5, 1.35, 0.25).multiplyScalar(S);
        hp.pos.lerp(tp, this.tauntSm);
      }
      const guardPole = _v.set(sg * 0.35, -1, -0.2).applyQuaternion(_cQ);
      const walkPole = this._pole.set(sg * 0.35, -0.6, -1);
      hp.pole.copy(walkPole).lerp(guardPole, guard);
      hp.roll = lerp(lerp(-12, 8, runK), side === 0 ? st.lhRoll : st.rhRoll, guard);
      hp.dir = null;
      hp.dirW = 0;
      if (this.blockSm > 0.5) hp.roll = lerp(hp.roll, -10, this.blockSm);
    }
    prm.shrug[0] = prm.shrug[1] = this.blockSm * 6 + this.hunchSm * 4;

    // the drop is handled (smoothed, capped) above; a leg that still cannot reach just straightens
    prm.autoHipDrop = false;
    this.bob = runBob + walkBob;
    return prm;
  }

  /** Start a gait swing from where the foot is now (on the ground, or already airborne). */
  private beginSwing(f: FootState, inp: LocoInput, speed: number, lift: number, runK: number) {
    f.swing = true;
    f.t = 0;
    f.from.copy(f.pos);
    f.fromYaw = f.yaw;
    f.fromPitch = f.pitch;
    f.fromToe = f.toe;
    f.rk = runK;
    f.lift = lift;
    // the running swing curve lives in axes frozen at lift-off, so a change of direction
    // mid-stride bends the landing target instead of spinning the airborne foot
    const sp0 = Math.max(speed, 1e-3);
    const dX = speed > 1e-3 ? inp.velX / sp0 : Math.sin(inp.rootYaw);
    const dZ = speed > 1e-3 ? inp.velZ / sp0 : Math.cos(inp.rootYaw);
    f.axX = dX;
    f.axZ = dZ;
    const rx = f.pos.x - inp.rootX, rz = f.pos.z - inp.rootZ;
    f.fromU = rx * dX + rz * dZ;
    f.fromW = -rx * dZ + rz * dX;
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
