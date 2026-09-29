import type RAPIER from '@dimforge/rapier3d-simd-compat';
import { clamp, lerp } from '../core/math';
import { qFromEuler, qMul, qRot, qSlerp, qYaw } from '../core/qmath';
import { FxState } from './BodyRenderer';
import { BodyDef, P, PART_COUNT, PART_PARENT, PART_TO_TYPE, PT, partPivot } from './skeleton';
import type { ZombieType } from './types';

export type ZState = 'walk' | 'attack' | 'down' | 'getup' | 'stagger';

/** Spring indices for procedural hit reactions. */
export const enum S {
  HeadPitch = 0,
  HeadRoll = 1,
  HeadYaw = 2,
  TorsoPitch = 3,
  TorsoRoll = 4,
  TorsoYaw = 5,
  ArmL = 6,
  ArmR = 7,
  LegL = 8,
  LegR = 9,
  Pelvis = 10,
}
const SPRINGS = 11;

let nextId = 1;

export class Zombie {
  readonly id = nextId++;
  alive = true;
  hp: number;
  maxHp: number;
  /** Rolled extra toughness (needs more hits). */
  hardy = false;
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vz = 0;
  vy = 0;
  yaw = Math.PI;
  speed: number;
  scale: number;
  body: RAPIER.RigidBody | null = null;
  physOn = false;
  state: ZState = 'walk';
  stateT = 0;
  attackT = 0;
  attackCd = 0;
  attackTarget: any = null;
  attackHit = false;
  phase = Math.random() * Math.PI * 2;
  /** Distance moved this frame (for gait phase). */
  moved = 0;
  // style
  armPose = 0;
  hunch = 0.25;
  headTilt = 0;
  limp = 0;
  limpSide = 1;
  sway = 1;
  armSpread = 0.08;
  stride = 1;
  // physics-ish
  knockX = 0;
  knockZ = 0;
  slow = 1;
  slowT = 0;
  stuckT = 0;
  blockedBy: any = null;
  /** Bitmask of missing parts (1 << P.x). */
  missing = 0;
  legDamage = 0;
  armDamage = [0, 0];
  readonly fx: FxState = { blood: 0, flash: 0, burn: 0, eyes: 1, fire: 0 };
  burning = 0;
  burnDps = 0;
  burnSource = '';
  skin: number;
  groanT = 2 + Math.random() * 6;
  dripT = 0;
  // pose
  readonly partPos = new Float32Array(PART_COUNT * 3);
  readonly partQuat = new Float32Array(PART_COUNT * 4);
  readonly prevPos = new Float32Array(PART_COUNT * 3);
  readonly spr = new Float32Array(SPRINGS * 2);
  /** Per-part world scale (x,y,z) including type part scale. */
  readonly partScale = new Float32Array(PART_COUNT * 3);
  /** Ragdoll currently driving this (knocked down) zombie. */
  ragdoll: any = null;
  /** Getup blend source pose. */
  readonly fromPos = new Float32Array(PART_COUNT * 3);
  readonly fromQuat = new Float32Array(PART_COUNT * 4);
  getupDur = 1.1;
  trappedT = 0;
  trappedBy: any = null;
  lastHitBy = '';
  lastHitT = 0;
  spawnT = 0;
  /** Flags a zombie that walked over a mine etc (avoid retrigger). */
  lastTrap: any = null;
  gridNext = -1;
  /** Ragdoll created when this zombie died (for attached props like arrows). */
  deathRagdoll: any = null;
  index = -1;
  crawling = false;

  constructor(readonly type: ZombieType, hpScale: number) {
    // ~35% are hardy: a single M686 headshot (10 dmg) no longer drops them
    this.hardy = Math.random() < 0.35;
    this.maxHp = type.hp * hpScale * (this.hardy ? lerp(1.12, 1.6, Math.random()) : lerp(0.85, 1.0, Math.random()));
    this.hp = this.maxHp;
    this.speed = lerp(type.speed[0], type.speed[1], Math.random());
    this.scale = lerp(type.scale[0], type.scale[1], Math.random());
    this.skin = type.skins[0] + Math.floor(Math.random() * (type.skins[1] - type.skins[0]));
    const r = Math.random();
    this.armPose = r < 0.45 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3;
    this.hunch = 0.1 + Math.random() * 0.3;
    this.headTilt = (Math.random() - 0.5) * 0.7;
    if (Math.random() < 0.3) {
      this.limp = 0.3 + Math.random() * 0.4;
      this.limpSide = Math.random() < 0.5 ? -1 : 1;
    }
    this.sway = 0.5 + Math.random();
    this.armSpread = Math.random() * 0.25;
    this.stride = 0.85 + Math.random() * 0.3;
    if (type.gait === 'crawl') {
      this.crawling = true;
      this.missing |= (1 << P.LLegL) | (1 << P.LLegR);
      if (Math.random() < 0.5) this.missing |= (1 << P.ULegL) | (1 << P.ULegR);
    }
    const b = type.body;
    for (let i = 0; i < PART_COUNT; i++) {
      const pt = PART_TO_TYPE[i];
      const ps = type.partScale?.[pt] ?? [1, 1, 1];
      this.partScale[i * 3] = ps[0] * this.scale;
      this.partScale[i * 3 + 1] = ps[1] * this.scale;
      this.partScale[i * 3 + 2] = ps[2] * this.scale;
    }
    void b;
  }

  has(part: number) {
    return (this.missing & (1 << part)) === 0;
  }

  kickSpring(i: number, v: number) {
    this.spr[i * 2 + 1] += v;
  }

  updateSprings(dt: number) {
    const k = 130;
    const d = 11;
    const steps = dt > 0.02 ? 2 : 1;
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < SPRINGS; i++) {
        const x = this.spr[i * 2];
        const v = this.spr[i * 2 + 1];
        const nv = v + (-k * x - d * v) * h;
        this.spr[i * 2 + 1] = nv;
        this.spr[i * 2] = clamp(x + nv * h, -1.6, 1.6);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Procedural animation

const LOC = new Float32Array(PART_COUNT * 3); // local euler per part
const QL = new Float32Array(4);
const ROOTQ = new Float32Array(4);
const TMP = new Float32Array(3);

const ease = (t: number) => t * t * (3 - 2 * t);

function setL(i: number, x: number, y: number, z: number) {
  LOC[i * 3] = x;
  LOC[i * 3 + 1] = y;
  LOC[i * 3 + 2] = z;
}
function addL(i: number, x: number, y: number, z: number) {
  LOC[i * 3] += x;
  LOC[i * 3 + 1] += y;
  LOC[i * 3 + 2] += z;
}

/**
 * Computes the zombie's part world transforms from its gait/state. Writes
 * z.partPos / z.partQuat.
 */
export function animateZombie(z: Zombie, dt: number, time: number) {
  const t = z.type;
  const gait = z.crawling ? 'crawl' : t.gait;
  const sp = Math.hypot(z.vx, z.vz);
  // advance gait phase by distance
  const strideLen = (gait === 'run' ? 2.3 : gait === 'dog' ? 1.7 : gait === 'brute' ? 1.5 : gait === 'crawl' ? 0.8 : 0.95) * z.scale * z.stride;
  const moveAmt = clamp(sp / Math.max(0.3, z.speed), 0, 1.3);
  z.phase += (z.moved / strideLen) * Math.PI * 2 + (sp < 0.05 ? dt * 0.8 : 0);
  const ph = z.phase;
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  LOC.fill(0);
  let bob = 0;
  let pelvisSide = 0;
  let pelvisDrop = 0;

  if (gait === 'dog') {
    const A = 0.75 * moveAmt + 0.05;
    // trot/gallop: diagonal pairs
    setL(P.Pelvis, Math.sin(ph * 2) * 0.05 * moveAmt, 0, 0);
    setL(P.Torso, -Math.sin(ph * 2 + 0.6) * 0.08 * moveAmt, Math.sin(ph) * 0.05, 0);
    setL(P.Head, 0.15 + Math.sin(ph * 2 + 1.2) * 0.1 * moveAmt, Math.sin(time * 1.3 + z.id) * 0.2, 0);
    setL(P.UArmL, s * A, 0, 0);
    setL(P.LArmL, Math.max(0, -c) * 0.9 * moveAmt, 0, 0);
    setL(P.UArmR, -s * A, 0, 0);
    setL(P.LArmR, Math.max(0, c) * 0.9 * moveAmt, 0, 0);
    setL(P.ULegL, -s * A, 0, 0);
    setL(P.LLegL, -Math.max(0, c) * 0.8 * moveAmt, 0, 0);
    setL(P.ULegR, s * A, 0, 0);
    setL(P.LLegR, -Math.max(0, -c) * 0.8 * moveAmt, 0, 0);
    bob = Math.abs(Math.sin(ph)) * 0.05 * moveAmt;
  } else if (gait === 'crawl') {
    // body flat, dragging itself with the arms
    pelvisDrop = 0.93 - 0.2;
    setL(P.Pelvis, 1.45, 0, Math.sin(ph) * 0.1);
    setL(P.Torso, 0.08 + Math.sin(ph) * 0.05, Math.sin(ph) * 0.15, 0);
    setL(P.Head, -1.1 + Math.sin(ph * 2) * 0.1, 0, z.headTilt * 0.5);
    setL(P.UArmL, -2.6 + s * 0.6, 0, 0.25);
    setL(P.LArmL, -0.4 - Math.max(0, -s) * 0.9, 0, 0);
    setL(P.UArmR, -2.6 - s * 0.6, 0, -0.25);
    setL(P.LArmR, -0.4 - Math.max(0, s) * 0.9, 0, 0);
    setL(P.ULegL, 0.2 + s * 0.1, 0, 0.1);
    setL(P.LLegL, 0.3, 0, 0);
    setL(P.ULegR, 0.2 - s * 0.1, 0, -0.1);
    setL(P.LLegR, 0.3, 0, 0);
  } else {
    let A: number, K: number, hunch: number;
    if (gait === 'run') {
      A = 0.95;
      K = 1.7;
      hunch = 0.45;
    } else if (gait === 'brute') {
      A = 0.38;
      K = 0.7;
      hunch = 0.38;
    } else if (gait === 'bloat') {
      A = 0.3;
      K = 0.5;
      hunch = 0.05;
    } else {
      A = 0.36;
      K = 0.75;
      hunch = z.hunch;
    }
    A *= moveAmt;
    K *= moveAmt;
    const limpL = z.limpSide > 0 ? z.limp : 0;
    const limpR = z.limpSide < 0 ? z.limp : 0;
    // legs
    setL(P.ULegL, -s * A * (1 - limpL * 0.5), 0, 0.02);
    setL(P.LLegL, Math.max(0, c) * K * (1 - limpL * 0.6) + 0.06, 0, 0);
    setL(P.ULegR, s * A * (1 - limpR * 0.5), 0, -0.02);
    setL(P.LLegR, Math.max(0, -c) * K * (1 - limpR * 0.6) + 0.06, 0, 0);
    bob = Math.cos(ph * 2) * (gait === 'run' ? 0.05 : gait === 'brute' ? 0.05 : 0.025) * moveAmt;
    bob -= (limpL * Math.max(0, -s) + limpR * Math.max(0, s)) * 0.06 * moveAmt;
    pelvisSide = Math.sin(ph) * 0.03 * z.sway * moveAmt;
    setL(P.Pelvis, 0, s * 0.12 * moveAmt, c * 0.05 * z.sway * moveAmt + (limpL - limpR) * s * 0.1);
    setL(P.Torso, hunch + Math.sin(ph * 2) * 0.03, -s * 0.13 * moveAmt, -c * 0.05 * z.sway * moveAmt);
    setL(P.Head, -hunch * 0.55 + Math.sin(ph * 2 + 0.5) * 0.04, Math.sin(time * 0.7 + z.id) * 0.15, z.headTilt + s * 0.05);
    // arms
    if (gait === 'run') {
      setL(P.UArmL, s * 1.1 - 0.35, 0, 0.15);
      setL(P.LArmL, -1.2 - Math.max(0, s) * 0.4, 0, 0);
      setL(P.UArmR, -s * 1.1 - 0.35, 0, -0.15);
      setL(P.LArmR, -1.2 - Math.max(0, -s) * 0.4, 0, 0);
    } else if (gait === 'brute') {
      setL(P.UArmL, s * 0.55 - 0.15, 0, 0.3);
      setL(P.LArmL, -0.5 - Math.max(0, s) * 0.3, 0, 0);
      setL(P.UArmR, -s * 0.55 - 0.15, 0, -0.3);
      setL(P.LArmR, -0.5 - Math.max(0, -s) * 0.3, 0, 0);
    } else if (gait === 'bloat') {
      setL(P.UArmL, -0.4 + s * 0.2, 0, 0.55);
      setL(P.LArmL, -0.6, 0, 0);
      setL(P.UArmR, -0.4 - s * 0.2, 0, -0.55);
      setL(P.LArmR, -0.6, 0, 0);
    } else {
      const reachL = z.armPose === 0 || z.armPose === 1;
      const reachR = z.armPose === 0;
      const w1 = Math.sin(ph * 0.5 + 0.3) * 0.1;
      const w2 = Math.sin(ph * 0.5 + 1.9) * 0.1;
      if (z.armPose === 3) {
        setL(P.UArmL, -1.9 + Math.sin(time * 5 + z.id) * 0.4, 0, 0.4);
        setL(P.LArmL, -0.9 + Math.sin(time * 6 + z.id) * 0.4, 0, 0);
        setL(P.UArmR, -1.9 + Math.sin(time * 5.3 + z.id + 1) * 0.4, 0, -0.4);
        setL(P.LArmR, -0.9 + Math.sin(time * 6.4 + z.id) * 0.4, 0, 0);
      } else {
        if (reachL) setL(P.UArmL, -1.45 + w1 - hunch * 0.6, 0.05, z.armSpread);
        else setL(P.UArmL, s * 0.35 * moveAmt + 0.05, 0, 0.1);
        setL(P.LArmL, reachL ? -0.2 + w2 : -0.35, 0, 0);
        if (reachR) setL(P.UArmR, -1.45 + w2 - hunch * 0.6, -0.05, -z.armSpread);
        else setL(P.UArmR, -s * 0.35 * moveAmt + 0.05, 0, -0.1);
        setL(P.LArmR, reachR ? -0.2 + w1 : -0.35, 0, 0);
      }
    }
  }

  // ---- state overlays
  if (z.state === 'attack') {
    const at = z.attackT / (t.attackTime * 0.85);
    const wind = ease(clamp(at / 0.4, 0, 1));
    const strike = ease(clamp((at - 0.4) / 0.18, 0, 1));
    const rec = ease(clamp((at - 0.6) / 0.4, 0, 1));
    const w = wind * (1 - rec);
    if (gait === 'dog') {
      addL(P.Torso, -0.3 * wind + 0.5 * strike * (1 - rec), 0, 0);
      addL(P.Head, 0.5 * strike * (1 - rec) - 0.3 * wind * (1 - strike), 0, 0);
      addL(P.UArmL, -0.8 * w, 0, 0);
      addL(P.UArmR, -0.8 * w, 0, 0);
      bob += 0.12 * strike * (1 - rec);
    } else if (gait === 'crawl') {
      addL(P.UArmL, -0.5 * w, 0, 0);
      addL(P.Head, 0.6 * strike * (1 - rec), 0, 0);
    } else if (gait === 'brute') {
      // overhead double-fist slam
      LOC[P.UArmL * 3] = lerp(LOC[P.UArmL * 3], -2.9 + 2.0 * strike, w);
      LOC[P.UArmR * 3] = lerp(LOC[P.UArmR * 3], -2.9 + 2.0 * strike, w);
      LOC[P.LArmL * 3] = lerp(LOC[P.LArmL * 3], -0.4, w);
      LOC[P.LArmR * 3] = lerp(LOC[P.LArmR * 3], -0.4, w);
      addL(P.Torso, (-0.25 * wind + 0.8 * strike) * (1 - rec), 0, 0);
      addL(P.Head, 0.2 * strike * (1 - rec), 0, 0);
      bob -= 0.1 * strike * (1 - rec);
    } else {
      // claw swipe + lunge bite
      const alt = z.id % 2 === 0;
      LOC[P.UArmL * 3] = lerp(LOC[P.UArmL * 3], -2.3 + 1.3 * strike, w);
      LOC[P.UArmR * 3] = lerp(LOC[P.UArmR * 3], alt ? -1.6 + 0.9 * strike : -2.3 + 1.3 * strike, w);
      LOC[P.LArmL * 3] = lerp(LOC[P.LArmL * 3], -0.9 + 0.6 * strike, w);
      LOC[P.LArmR * 3] = lerp(LOC[P.LArmR * 3], -0.9 + 0.6 * strike, w);
      addL(P.Torso, (-0.15 * wind + 0.55 * strike) * (1 - rec), 0.15 * (alt ? 1 : -1) * strike * (1 - rec), 0);
      addL(P.Head, (0.35 * strike - 0.2 * wind) * (1 - rec), 0, 0);
    }
  }

  // ---- hit reaction springs
  const sp2 = z.spr;
  addL(P.Head, sp2[S.HeadPitch * 2], sp2[S.HeadYaw * 2], sp2[S.HeadRoll * 2]);
  addL(P.Torso, sp2[S.TorsoPitch * 2], sp2[S.TorsoYaw * 2], sp2[S.TorsoRoll * 2]);
  addL(P.UArmL, sp2[S.ArmL * 2], 0, 0);
  addL(P.UArmR, sp2[S.ArmR * 2], 0, 0);
  addL(P.ULegL, sp2[S.LegL * 2], 0, 0);
  addL(P.ULegR, sp2[S.LegR * 2], 0, 0);
  addL(P.Pelvis, sp2[S.Pelvis * 2], 0, 0);
  if (Math.abs(sp2[S.LegL * 2]) + Math.abs(sp2[S.LegR * 2]) > 0.01) {
    addL(P.LLegL, Math.abs(sp2[S.LegL * 2]) * 0.8, 0, 0);
    addL(P.LLegR, Math.abs(sp2[S.LegR * 2]) * 0.8, 0, 0);
    bob -= (Math.abs(sp2[S.LegL * 2]) + Math.abs(sp2[S.LegR * 2])) * 0.08;
  }

  composePose(z, bob, pelvisSide, pelvisDrop);

  // get-up blend from ragdoll pose
  if (z.state === 'getup') {
    const k = ease(clamp(1 - z.stateT / z.getupDur, 0, 1));
    const w = 1 - k; // weight of the stored (ragdoll) pose
    if (w > 0.001) {
      for (let i = 0; i < PART_COUNT; i++) {
        z.partPos[i * 3] = lerp(z.partPos[i * 3], z.fromPos[i * 3], w);
        z.partPos[i * 3 + 1] = lerp(z.partPos[i * 3 + 1], z.fromPos[i * 3 + 1], w);
        z.partPos[i * 3 + 2] = lerp(z.partPos[i * 3 + 2], z.fromPos[i * 3 + 2], w);
        qSlerp(z.partQuat, i * 4, z.partQuat, i * 4, z.fromQuat, i * 4, w);
      }
    }
  }
}

/** Composes the part hierarchy from LOC eulers into world transforms. */
function composePose(z: Zombie, bob: number, side: number, drop: number) {
  const body: BodyDef = z.type.body;
  const S0 = z.scale;
  qYaw(ROOTQ, 0, z.yaw);
  const torsoW = z.type.partScale?.[PT.Torso]?.[0] ?? 1;
  const pelvisW = z.type.partScale?.[PT.Pelvis]?.[0] ?? 1;
  for (let i = 0; i < PART_COUNT; i++) {
    qFromEuler(QL, 0, LOC[i * 3], LOC[i * 3 + 1], LOC[i * 3 + 2]);
    const pv = partPivot(body, i);
    let px = pv[0] * S0;
    let py = pv[1] * S0;
    let pz = pv[2] * S0;
    const parent = PART_PARENT[i];
    if (parent < 0) {
      py += bob * S0 - drop * S0;
      px += side * S0;
      qRot(TMP, 0, ROOTQ, 0, px, py, pz);
      z.partPos[0] = z.x + TMP[0];
      z.partPos[1] = z.y + TMP[1];
      z.partPos[2] = z.z + TMP[2];
      qMul(z.partQuat, 0, ROOTQ, 0, QL, 0);
    } else {
      if (i === P.UArmL || i === P.UArmR) px *= torsoW;
      else if (i === P.ULegL || i === P.ULegR) px *= pelvisW;
      qRot(TMP, 0, z.partQuat, parent * 4, px, py, pz);
      z.partPos[i * 3] = z.partPos[parent * 3] + TMP[0];
      z.partPos[i * 3 + 1] = z.partPos[parent * 3 + 1] + TMP[1];
      z.partPos[i * 3 + 2] = z.partPos[parent * 3 + 2] + TMP[2];
      qMul(z.partQuat, i * 4, z.partQuat, parent * 4, QL, 0);
    }
  }
}
