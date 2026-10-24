import * as THREE from 'three';
import { Pose, MASK, J } from './Pose';
import { ACTIONS, STANCES, FULLBODY, type ActionDef, type StanceName, type FullBodyName, type Ease } from './PoseLibrary';
import { PART_COUNT } from './Rig';
import { clamp, dampTo } from '../core/math';

const D2R = Math.PI / 180;
const _e = new THREE.Euler(0, 0, 0, 'XZY');
const _q = new THREE.Quaternion();

function ease(e: Ease | undefined, t: number): number {
  switch (e) {
    case 'in':
      return t * t;
    case 'out':
      return 1 - (1 - t) * (1 - t);
    case 'inout':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'snap': {
      // very fast out (punch impacts)
      const u = 1 - t;
      return 1 - u * u * u * u;
    }
    default:
      return t;
  }
}

class AngSpring {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  constructor(
    public k: number,
    public c: number,
    public limit: number,
  ) {}
  update(dt: number): void {
    const steps = dt > 1 / 90 ? 2 : 1;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.vx += (-this.k * this.x - this.c * this.vx) * h;
      this.vy += (-this.k * this.y - this.c * this.vy) * h;
      this.vz += (-this.k * this.z - this.c * this.vz) * h;
      this.x = clamp(this.x + this.vx * h, -this.limit, this.limit);
      this.y = clamp(this.y + this.vy * h, -this.limit, this.limit);
      this.z = clamp(this.z + this.vz * h, -this.limit, this.limit);
    }
  }
  get active(): boolean {
    return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z) + Math.abs(this.vx) + Math.abs(this.vy) + Math.abs(this.vz) > 1e-3;
  }
}

export interface ActionInstance {
  def: ActionDef;
  t: number;
  speed: number;
  fired: Set<string>;
  onEvent?: (name: string) => void;
  onEnd?: () => void;
  blendOutStarted: boolean;
  /** freeze at a time (e.g. holding a charge) */
  holdAt?: number;
}

export type DanceStyle = 0 | 1 | 2 | 3;

/**
 * Layered procedural animator for blocky characters.
 * locomotion -> stance (upper) -> full body override -> action -> additive springs/look.
 */
export class Animator {
  readonly pose = new Pose().identity();
  private loco = new Pose().identity();
  private stanceA = new Pose();
  private stanceB = new Pose();
  private tmp = new Pose();
  private snapshot = new Pose().identity();
  private snapshotWeight = 0;
  private snapshotFade = 0.2;

  // locomotion inputs
  localVel = new THREE.Vector3(); // x left(+), z forward(+)
  yawRate = 0;
  combat = false;
  crouch = 0;
  drunk = 0;
  limp = 0;
  phase = 0;
  private speedSmooth = 0;
  time = Math.random() * 100;
  onFootstep: ((foot: number, intensity: number) => void) | null = null;
  private lastFootSin = 0;

  // stance
  stance: StanceName = 'relaxed';
  private prevStance: StanceName = 'relaxed';
  private stanceBlend = 1;
  stanceSpeed = 8;

  // full body override
  fullBody: FullBodyName | 'dance' | null = null;
  fullWeight = 0;
  fullTarget = 0;
  danceStyle: DanceStyle = 0;
  danceTempo = 2; // beats per second
  danceOffset = Math.random() * 10;

  // action
  action: ActionInstance | null = null;
  private actionWeight = 0;

  // additive
  springs: AngSpring[] = [];
  lookYaw = 0;
  lookPitch = 0;
  lookWeight = 0;
  private lookYawS = 0;
  private lookPitchS = 0;
  breath = 1;
  /** random fidget offsets for idle variety */
  fidget = 0;
  /** procedural extra (e.g. wipe, arcade mashing) */
  extra: ((pose: Pose, t: number) => void) | null = null;

  constructor() {
    for (let i = 0; i < PART_COUNT; i++) {
      const isHead = i === J.head;
      const isTorso = i === J.torso || i === J.pelvis;
      this.springs.push(new AngSpring(isHead ? 140 : isTorso ? 110 : 90, isHead ? 11 : 10, isHead ? 1.2 : 0.9));
    }
  }

  setStance(s: StanceName, speed = 8): void {
    if (s === this.stance) return;
    this.prevStance = this.stance;
    this.stance = s;
    this.stanceBlend = 0;
    this.stanceSpeed = speed;
  }

  setFullBody(fb: FullBodyName | 'dance' | null): void {
    if (fb) {
      if (this.fullBody !== fb && this.fullWeight > 0.05) {
        this.captureSnapshot(0.3);
        this.fullWeight = 1;
      }
      this.fullBody = fb;
      this.fullTarget = 1;
    } else {
      this.fullTarget = 0;
    }
  }

  play(id: string, opts: { speed?: number; onEvent?: (n: string) => void; onEnd?: () => void } = {}): ActionInstance | null {
    const def = ACTIONS[id];
    if (!def) {
      console.warn('missing action', id);
      return null;
    }
    if (this.action) {
      // interrupt: crossfade from the current final pose
      this.captureSnapshot(def.blendIn);
    }
    this.action = {
      def,
      t: 0,
      speed: opts.speed ?? 1,
      fired: new Set(),
      onEvent: opts.onEvent,
      onEnd: opts.onEnd,
      blendOutStarted: false,
    };
    if (this.actionWeight <= 0.01 || this.snapshotWeight > 0) this.actionWeight = this.snapshotWeight > 0 ? 1 : 0;
    return this.action;
  }

  stopAction(fade = true): void {
    if (!this.action) return;
    if (fade) {
      this.captureSnapshot(this.action.def.blendOut);
    }
    this.action = null;
    this.actionWeight = 0;
  }

  captureSnapshot(fade: number): void {
    this.snapshot.copy(this.pose);
    for (let i = 0; i < PART_COUNT; i++) this.snapshot.has[i] = true;
    this.snapshot.hasRoot = true;
    this.snapshotWeight = 1;
    this.snapshotFade = Math.max(0.01, fade);
  }

  /** Start blending from an externally supplied pose (ragdoll -> get-up). */
  startFromPose(p: Pose, fade: number): void {
    this.snapshot.copy(p);
    for (let i = 0; i < PART_COUNT; i++) this.snapshot.has[i] = true;
    this.snapshot.hasRoot = true;
    this.snapshotWeight = 1;
    this.snapshotFade = fade;
  }

  get actionId(): string | null {
    return this.action ? this.action.def.id : null;
  }

  /** Apply a rotational impulse (radians/sec) to a joint spring, in joint-local XYZ. */
  impulse(joint: number, x: number, y: number, z: number): void {
    const s = this.springs[joint];
    s.vx += x;
    s.vy += y;
    s.vz += z;
  }

  update(dt: number): void {
    this.time += dt;
    this.computeLocomotion(dt);
    const out = this.pose;
    out.copy(this.loco);

    // ---- stance (upper body)
    this.stanceBlend = Math.min(1, this.stanceBlend + dt * this.stanceSpeed);
    const sb = this.stanceBlend;
    const cur = STANCES[this.stance];
    const relaxedArmsSwing = this.stance === 'relaxed';
    if (sb < 1) {
      this.stanceA.copy(this.loco);
      if (this.prevStance !== 'relaxed') this.stanceA.blend(STANCES[this.prevStance], 1, MASK.upper);
      else this.stanceA.blend(STANCES.relaxed, 0.4, MASK.upper);
      this.stanceB.copy(this.loco);
      if (!relaxedArmsSwing) this.stanceB.blend(cur, 1, MASK.upper);
      else this.stanceB.blend(STANCES.relaxed, 0.4, MASK.upper);
      // blend A->B
      out.copy(this.stanceA).blend(this.stanceB, smooth(sb), MASK.upper);
    } else if (!relaxedArmsSwing) {
      out.blend(cur, 1, MASK.upper);
      // let the torso lean from locomotion persist a bit
      if (this.stance === 'flee') {
        // arms flailing
        const t = this.time * 9;
        this.addEuler(out, J.uarmL, Math.sin(t) * 20, 0, Math.cos(t * 0.7) * 15);
        this.addEuler(out, J.uarmR, Math.cos(t) * 20, 0, Math.sin(t * 0.8) * 15);
      }
    } else {
      out.blend(STANCES.relaxed, 0.4, MASK.upper);
    }
    if (this.stance === 'guard' || this.stance === 'carry1h' || this.stance === 'carry2h') {
      // guard bob
      const b = Math.sin(this.time * 6.5) * 2.5;
      this.addEuler(out, J.uarmL, b, 0, 0);
      this.addEuler(out, J.uarmR, -b, 0, 0);
    }

    // ---- full body override
    if (this.fullTarget > this.fullWeight) this.fullWeight = Math.min(this.fullTarget, this.fullWeight + dt * 4);
    else this.fullWeight = Math.max(this.fullTarget, this.fullWeight - dt * 4);
    if (this.fullWeight > 0 && this.fullBody) {
      if (this.fullBody === 'dance') this.computeDance(this.tmp);
      else this.tmp.copy(FULLBODY[this.fullBody]);
      out.blend(this.tmp, smooth(this.fullWeight), MASK.full);
      if (this.fullWeight <= 0 && this.fullTarget <= 0) this.fullBody = null;
    }

    // ---- action
    const a = this.action;
    if (a) {
      const d = a.def;
      if (a.holdAt === undefined || a.t < a.holdAt) a.t += dt * a.speed;
      if (a.holdAt !== undefined && a.t > a.holdAt) a.t = a.holdAt;
      // events
      if (d.events && a.onEvent) {
        for (const name in d.events) {
          if (!a.fired.has(name) && a.t >= d.events[name]) {
            a.fired.add(name);
            a.onEvent(name);
          }
        }
      }
      const dur = d.duration!;
      // weight
      if (d.loop) {
        if (a.t >= dur) a.t %= dur;
        this.actionWeight = Math.min(1, this.actionWeight + dt / Math.max(d.blendIn, 0.01));
      } else {
        const remaining = dur - a.t;
        if (remaining < d.blendOut) this.actionWeight = Math.max(0, remaining / Math.max(d.blendOut, 0.01));
        else this.actionWeight = Math.min(1, this.actionWeight + dt / Math.max(d.blendIn, 0.01));
      }
      this.sampleAction(d, a.t, this.tmp);
      out.blend(this.tmp, smooth(this.actionWeight), MASK[d.mask]);
      if (!d.loop && a.t >= dur) {
        this.action = null;
        this.actionWeight = 0;
        a.onEnd?.();
      }
    }

    // ---- snapshot crossfade (interrupted actions, get-up from ragdoll)
    if (this.snapshotWeight > 0) {
      this.snapshotWeight = Math.max(0, this.snapshotWeight - dt / this.snapshotFade);
      if (this.snapshotWeight > 0) {
        this.tmp.copy(out);
        out.copy(this.snapshot).blend(this.tmp, 1 - smooth(this.snapshotWeight));
      }
    }

    if (this.extra) this.extra(out, this.time);

    // ---- additive: breathing, look, springs
    const br = Math.sin(this.time * 1.7) * 1.2 * this.breath;
    this.addEuler(out, J.torso, br, 0, 0);
    this.addEuler(out, J.head, -br * 0.6, 0, 0);
    if (this.drunk > 0) {
      const t = this.time;
      this.addEuler(out, J.torso, Math.sin(t * 1.3) * 6 * this.drunk, 0, Math.sin(t * 0.9) * 8 * this.drunk);
      this.addEuler(out, J.head, Math.sin(t * 1.7) * 8 * this.drunk, 0, Math.cos(t * 1.1) * 10 * this.drunk);
    }

    this.lookYawS = dampTo(this.lookYawS, this.lookYaw * this.lookWeight, 8, dt);
    this.lookPitchS = dampTo(this.lookPitchS, this.lookPitch * this.lookWeight, 8, dt);
    if (Math.abs(this.lookYawS) + Math.abs(this.lookPitchS) > 0.001) {
      const yaw = clamp(this.lookYawS, -1.3, 1.3);
      const pitch = clamp(this.lookPitchS, -0.7, 0.6);
      const tw = 0.35 * (1 - this.fullWeight);
      this.addRad(out, J.torso, -pitch * tw * 0.5, yaw * tw, 0);
      this.addRad(out, J.head, -pitch * (1 - tw * 0.5), yaw * (1 - tw), 0);
    }

    for (let i = 0; i < PART_COUNT; i++) {
      const s = this.springs[i];
      if (!s.active) continue;
      s.update(dt);
      this.addRad(out, i, s.x, s.y, s.z);
    }
  }

  private sampleAction(d: ActionDef, t: number, out: Pose): void {
    const keys = d.keys;
    const poses = d.poses!;
    if (t <= 0) {
      out.copy(poses[0]);
      return;
    }
    let k = 0;
    while (k < keys.length - 1 && keys[k + 1].t <= t) k++;
    if (k >= keys.length - 1) {
      out.copy(poses[keys.length - 1]);
      return;
    }
    const k0 = keys[k];
    const k1 = keys[k + 1];
    const u = ease(k1.ease, clamp((t - k0.t) / Math.max(1e-4, k1.t - k0.t), 0, 1));
    out.copy(poses[k]);
    const p1 = poses[k + 1];
    for (let i = 0; i < PART_COUNT; i++) {
      if (p1.has[i]) {
        if (!out.has[i]) {
          out.q[i].copy(p1.q[i]);
          out.has[i] = true;
        } else out.q[i].slerp(p1.q[i], u);
      }
    }
    if (p1.hasRoot) {
      if (!out.hasRoot) {
        out.root.copy(p1.root);
        out.hasRoot = true;
      } else out.root.lerp(p1.root, u);
    }
  }

  private addEuler(p: Pose, j: number, xd: number, yd: number, zd: number): void {
    this.addRad(p, j, xd * D2R, yd * D2R, zd * D2R);
  }

  private addRad(p: Pose, j: number, x: number, y: number, z: number): void {
    _e.set(x, y, z, 'XZY');
    _q.setFromEuler(_e);
    p.q[j].multiply(_q);
  }

  private computeLocomotion(dt: number): void {
    const p = this.loco;
    p.identity();
    const vx = this.localVel.x;
    const vz = this.localVel.z;
    let speed = Math.sqrt(vx * vx + vz * vz);
    const turnStep = Math.min(Math.abs(this.yawRate) * 0.35, 1.2);
    const effSpeed = Math.max(speed, turnStep);
    this.speedSmooth = dampTo(this.speedSmooth, effSpeed, 10, dt);
    const s = this.speedSmooth;
    const run = clamp((s - 3) / 3, 0, 1);
    // cycle frequency
    const stride = 1.1 + run * 0.8;
    this.phase += dt * (s / stride) * Math.PI;
    const ph = this.phase;
    const sinP = Math.sin(ph);
    const cosP = Math.cos(ph);
    const moveW = clamp(s / 1.2, 0, 1);
    const fwd = speed > 0.05 ? vz / speed : 1;
    const lat = speed > 0.05 ? vx / speed : 0;
    const dirSign = fwd < -0.3 ? -1 : 1;
    const legAmp = (24 + run * 26) * moveW;
    const kneeAmp = (34 + run * 46) * moveW;
    const fwdAbs = Math.max(Math.abs(fwd), 0.3);

    // footsteps (zero crossings)
    if (moveW > 0.3 && this.onFootstep) {
      if ((sinP >= 0) !== (this.lastFootSin >= 0)) this.onFootstep(sinP >= 0 ? 0 : 1, clamp(s / 6, 0.2, 1));
    }
    this.lastFootSin = sinP;

    const limpL = this.limp;
    // legs
    const tL = -sinP * legAmp * fwdAbs * dirSign;
    const tR = sinP * legAmp * fwdAbs * dirSign;
    const kL = Math.max(0, cosP * dirSign) * kneeAmp + 6 * moveW;
    const kR = Math.max(0, -cosP * dirSign) * kneeAmp + 6 * moveW;
    p.setJoint(J.thighL, tL * (1 - limpL * 0.6), 0, lat * sinP * 18 * moveW + 2);
    p.setJoint(J.shinL, kL * (1 - limpL * 0.7), 0, 0);
    p.setJoint(J.thighR, tR, 0, -lat * sinP * 18 * moveW - 2);
    p.setJoint(J.shinR, kR, 0, 0);
    // arms counter swing
    const armAmp = (16 + run * 34) * moveW;
    p.setJoint(J.uarmL, sinP * armAmp * dirSign, 0, 6 + run * 6);
    p.setJoint(J.larmL, -(12 + run * 50) * moveW - 10, 0, 0);
    p.setJoint(J.uarmR, -sinP * armAmp * dirSign, 0, -6 - run * 6);
    p.setJoint(J.larmR, -(12 + run * 50) * moveW - 10, 0, 0);
    // torso & pelvis
    p.setJoint(J.pelvis, 0, -sinP * 5 * moveW, 0);
    p.setJoint(J.torso, (3 + run * 12) * moveW * Math.max(fwd, 0) + 2, sinP * (5 + run * 6) * moveW, 0);
    p.setJoint(J.head, -run * 8 * moveW, -sinP * 3 * moveW, 0);
    const bob = Math.abs(Math.sin(ph)) * (0.025 + run * 0.045) * moveW;
    p.root.set(0, -bob - (0.01 + run * 0.03) * moveW, 0);

    // idle / combat stance legs
    const idleW = 1 - moveW;
    if (idleW > 0) {
      const t = this.time;
      if (this.combat) {
        const bounce = Math.sin(t * 6.5) * 0.012;
        this.tmp.identity();
        this.tmp.setJoint(J.thighL, -16, 0, 4);
        this.tmp.setJoint(J.shinL, 18, 0, 0);
        this.tmp.setJoint(J.thighR, 10, 0, -6);
        this.tmp.setJoint(J.shinR, 20, 0, 0);
        this.tmp.setJoint(J.pelvis, 0, -10, 0);
        this.tmp.setJoint(J.torso, 4, 10, 0);
        this.tmp.root.set(0, -0.055 + bounce, 0);
        for (const j of [J.thighL, J.shinL, J.thighR, J.shinR, J.pelvis, J.torso]) p.q[j].slerp(this.tmp.q[j], idleW);
        p.root.lerp(this.tmp.root, idleW);
      } else {
        // weight shift
        const shift = Math.sin(t * 0.37 + this.fidget) * 2.5;
        this.tmp.identity();
        this.tmp.setJoint(J.pelvis, 0, 0, shift);
        this.tmp.setJoint(J.thighL, 0, 0, -shift + 2);
        this.tmp.setJoint(J.thighR, -2, 0, -shift - 2);
        this.tmp.setJoint(J.shinR, 4, 0, 0);
        this.tmp.setJoint(J.torso, 2, 0, -shift * 0.6);
        for (const j of [J.thighL, J.thighR, J.shinR, J.pelvis, J.torso]) p.q[j].slerp(this.tmp.q[j], idleW);
      }
    }
    if (this.crouch > 0) {
      const c = this.crouch;
      this.tmp.identity();
      this.tmp.setJoint(J.thighL, -70, 0, 6);
      this.tmp.setJoint(J.shinL, 110, 0, 0);
      this.tmp.setJoint(J.thighR, -60, 0, -6);
      this.tmp.setJoint(J.shinR, 100, 0, 0);
      this.tmp.setJoint(J.torso, 30, 0, 0);
      for (const j of [J.thighL, J.shinL, J.thighR, J.shinR, J.torso]) p.q[j].slerp(this.tmp.q[j], c);
      p.root.y = p.root.y * (1 - c) + -0.38 * c;
    }
  }

  private computeDance(out: Pose): void {
    out.identity();
    const t = (this.time + this.danceOffset) * this.danceTempo * Math.PI;
    const b = Math.sin(t);
    const b2 = Math.sin(t * 0.5);
    switch (this.danceStyle) {
      case 0: {
        // bounce + fist pump
        const pump = Math.max(0, b);
        out.setJoint(J.thighL, -10 - pump * 10, 0, 4);
        out.setJoint(J.shinL, 14 + pump * 18, 0, 0);
        out.setJoint(J.thighR, -10 - pump * 10, 0, -4);
        out.setJoint(J.shinR, 14 + pump * 18, 0, 0);
        out.setJoint(J.torso, 6 + pump * 6, b2 * 12, 0);
        out.setJoint(J.head, -b * 10, -b2 * 8, 0);
        const up = b2 > 0;
        out.setJoint(J.uarmR, up ? -150 - pump * 20 : -40, 0, -20);
        out.setJoint(J.larmR, up ? -30 : -100, 0, 0);
        out.setJoint(J.uarmL, !up ? -150 - pump * 20 : -40, 0, 20);
        out.setJoint(J.larmL, !up ? -30 : -100, 0, 0);
        out.root.set(0, -0.06 - pump * 0.05, 0);
        break;
      }
      case 1: {
        // the twist
        out.setJoint(J.pelvis, 0, b * 25, 0);
        out.setJoint(J.torso, 4, -b * 35, 0);
        out.setJoint(J.head, 0, b * 10, 0);
        out.setJoint(J.thighL, -24, 0, 6);
        out.setJoint(J.shinL, 34, 0, 0);
        out.setJoint(J.thighR, -24, 0, -6);
        out.setJoint(J.shinR, 34, 0, 0);
        out.setJoint(J.uarmL, -30, 0, 50 + b * 10);
        out.setJoint(J.larmL, -90, 0, 0);
        out.setJoint(J.uarmR, -30, 0, -50 + b * 10);
        out.setJoint(J.larmR, -90, 0, 0);
        out.root.set(0, -0.12 + Math.abs(b) * 0.03, 0);
        break;
      }
      case 2: {
        // disco point
        const up = b > 0;
        out.setJoint(J.torso, 0, up ? -15 : 15, up ? -8 : 6);
        out.setJoint(J.head, up ? -15 : 10, up ? 15 : -10, 0);
        out.setJoint(J.uarmR, up ? -160 : -40, 0, up ? -30 : 40);
        out.setJoint(J.larmR, up ? -5 : -10, 0, 0);
        out.setJoint(J.uarmL, -20, 0, 30);
        out.setJoint(J.larmL, -100, 0, 0);
        out.setJoint(J.pelvis, 0, 0, up ? 6 : -6);
        out.setJoint(J.thighL, -6, 0, up ? 2 : 10);
        out.setJoint(J.thighR, 4, 0, up ? -10 : -2);
        out.setJoint(J.shinR, 8, 0, 0);
        out.root.set(0, -0.02, 0);
        break;
      }
      default: {
        // sway with hands up
        out.setJoint(J.pelvis, 0, 0, b * 8);
        out.setJoint(J.torso, -4, 0, -b * 10);
        out.setJoint(J.head, -6, 0, b * 6);
        out.setJoint(J.uarmL, -165, 0, 20 + b * 8);
        out.setJoint(J.larmL, -20, 0, 0);
        out.setJoint(J.uarmR, -165, 0, -20 + b * 8);
        out.setJoint(J.larmR, -20, 0, 0);
        out.setJoint(J.thighL, -4, 0, -b * 6 + 3);
        out.setJoint(J.thighR, -4, 0, -b * 6 - 3);
        out.setJoint(J.shinL, 8 + Math.max(0, -b) * 10, 0, 0);
        out.setJoint(J.shinR, 8 + Math.max(0, b) * 10, 0, 0);
        out.root.set(b * 0.02, -0.03, 0);
      }
    }
  }
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
