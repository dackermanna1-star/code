import * as THREE from 'three';
import { B, SkeletonDef } from './skeleton';
import { makeParams, pivotOffset, PoseParams } from './solver';
import { catmull, clamp01, DEG, ease, EaseName, eulerDeg, lerp, rotY, smoothstep, wrapAngle } from '../core/math';

export type V3 = [number, number, number];
export type AimPoint =
  | 'head' | 'jaw' | 'chest' | 'gut' | 'hips' | 'legs' | 'knee' | 'neck' | 'back'
  | 'p.head' | 'p.neck' | 'p.chest' | 'p.hips' | 'p.handL' | 'p.handR' | 'p.farmL' | 'p.farmR' | 'p.footL' | 'p.footR' | 'p.shinL' | 'p.shinR' | 'p.uarmL' | 'p.uarmR'
  // a two-handed pistol grip, arm's length towards the target (Scarlet's special)
  | 'gun.R' | 'gun.L';

export interface KeyHand {
  p?: V3;
  /** 'shoulder': p is the wrist relative to the shoulder, in chest space, in arm lengths (motion capture). */
  sp?: 'root' | 'chest' | 'shoulder';
  aim?: AimPoint | null;
  aimW?: number;
  aimOff?: V3; // offset added to aim point (root space)
  pole?: V3; // root space (or chest space if sp=chest)
  roll?: number;
  dir?: V3 | null; // finger direction (root space)
  dirW?: number;
}
export interface KeyFoot {
  p?: V3; // clip space ankle pos; y measured above planted height
  yaw?: number; // deg, relative to clip frame
  pitch?: number;
  roll?: number;
  toe?: number;
  pole?: V3; // root space knee hint
  lift?: number; // swing arc height into this key
  aim?: AimPoint | null; // for kicks: blend to target point
  aimW?: number;
  aimOff?: V3; // root-space offset added to the aim point
  /** captured clips: how far the foot turns about its contact point (1 on the floor, 0 in the air) */
  piv?: number;
  /**
   * Hand-made clips: this key doesn't plant the foot - a step on the floor goes through it from the
   * key before to the key after in one move (a step can span the body's wind-up keys).
   */
  via?: boolean;
}
export interface Key {
  t: number;
  e?: EaseName;
  root?: [number, number, number]; // x, z, yawDeg in clip space
  hips?: V3; // root-space offset; y is delta from rest hip height
  hipsR?: V3;
  spine?: V3;
  chest?: V3;
  neck?: V3;
  head?: V3;
  torso?: V3; // distributed spine/chest
  lh?: KeyHand;
  rh?: KeyHand;
  lf?: KeyFoot;
  rf?: KeyFoot;
  shrug?: [number, number];
}
export interface ClipEvent {
  t: number;
  type: string;
  [k: string]: unknown;
}
export interface ClipSpec {
  dur?: number; // defaults to last key time
  keys: Key[];
  events?: ClipEvent[];
  loop?: boolean;
  mirror?: boolean;
  /** Time window [a,b] during which root warp is applied (towards the target). */
  warp?: [number, number];
  /** Time at which the strike makes contact. */
  hitT?: number;
  /** Clip may be cancelled into a follow-up after this time. */
  comboT?: number;
  /** Clip ends (becomes interruptible/idle) at this time; remainder is recovery that can blend out. */
  recoverT?: number;
  /**
   * Feet that leave the floor start their first swing from where the fighter really stands and
   * ease onto the authored path by the time they plant again (dense motion-capture keys).
   */
  footFromStart?: boolean;
  /**
   * Captured clips that start on the floor: the feet ease from where they lie onto the capture's
   * places over this long (s) - lying legs carry no weight, so they need no steps.
   */
  settleFeet?: number;
}

/** Fully resolved key (all values present). */
interface RKey {
  t: number;
  e: EaseName | undefined;
  root: [number, number, number];
  hips: V3;
  hipsR: V3;
  spine: V3;
  chest: V3;
  neck: V3;
  head: V3;
  lh: Required<Omit<KeyHand, 'aim' | 'dir' | 'aimOff'>> & { aim: AimPoint | null; dir: V3 | null; aimOff: V3 };
  rh: Required<Omit<KeyHand, 'aim' | 'dir' | 'aimOff'>> & { aim: AimPoint | null; dir: V3 | null; aimOff: V3 };
  lf: Required<Omit<KeyFoot, 'aim' | 'pole' | 'aimOff' | 'piv'>> & { aim: AimPoint | null; pole: V3 | null; explicit: boolean; aimOff: V3 };
  rf: Required<Omit<KeyFoot, 'aim' | 'pole' | 'aimOff' | 'piv'>> & { aim: AimPoint | null; pole: V3 | null; explicit: boolean; aimOff: V3 };
  shrug: [number, number];
}

export interface Clip {
  name: string;
  dur: number;
  keys: RKey[];
  events: ClipEvent[];
  loop: boolean;
  warp: [number, number] | null;
  hitT: number;
  comboT: number;
  recoverT: number;
  footFromStart: boolean;
  /**
   * Captured clips: how far the root may be warped before contact with the feet still stepping
   * believably (both feet on the floor through the wind-up can step in; a kick's standing foot
   * cannot, so its body only leans over it).
   */
  lunge: number;
  /** Captured clips: +1 when the left foot leads at the start, -1 when the right does. */
  stance: number;
  /**
   * Captured clips: each key's foot orientations in clip space, interpolated as rotations (a foot
   * turned over in a kick's chamber points its toes at the floor, where turn and roll are the same
   * axis and their angles swing wildly from key to key while the foot itself barely moves).
   */
  footQ: [THREE.Quaternion[], THREE.Quaternion[]] | null;
  /** Captured clips: per key, how far each foot turns about its contact point (see KeyFoot.piv). */
  footPiv: [number[], number[]] | null;
  /** See ClipSpec.settleFeet. */
  settleFeet: number;
  /**
   * Captured clips that lie on the floor (get-ups): the trunk's rotations per key, interpolated as
   * rotations - a pelvis flat on its back is pitched a quarter turn, where turn and roll angles
   * are the same axis and swing wildly from key to key.
   */
  torsoQ: THREE.Quaternion[][] | null;
}

/**
 * A captured foot is on the floor. (Its key holds the foot as if flat - the runtime turns it about
 * the ball or the heel by its pitch - so the height is that of the contact point itself.)
 */
export const CONTACT_Y = 0.03;
export function footDown(f: { p: V3; pitch: number }) {
  return f.p[1] < CONTACT_Y;
}
/** Root travel of a lunge: two quick steps at most, at a pace a fighter can step. */
export const LUNGE_MAX = 0.6;
const LUNGE_SPEED = 1.8;
/** The most speed a planned step adds to a capture's own foot motion (m/s, over the step). */
const MAX_ADDED_STEP_SPEED = 2.5;
/** How far a body can lean over a standing foot it cannot lift. */
const LEAN_MAX = 0.2;
function capturedLunge(keys: RKey[], warp: [number, number] | null) {
  if (!warp) return 0;
  const w1 = warp[1];
  const standing = [0, 1].map((side) => keys.every((k) => k.t > w1 || footDown(side === 0 ? k.lf : k.rf)));
  if (standing[0] && standing[1]) return Math.min(LUNGE_MAX, LUNGE_SPEED * Math.max(0.12, w1));
  return LEAN_MAX;
}

const DEFAULT_HAND_L: KeyHand = { p: [0.1, 0.18, 0.28], sp: 'chest', pole: [0.4, -1, -0.2], roll: 10, aimW: 0, dirW: 0 };
const DEFAULT_HAND_R: KeyHand = { p: [-0.08, 0.14, 0.24], sp: 'chest', pole: [-0.4, -1, -0.2], roll: 10, aimW: 0, dirW: 0 };

function mirrorV(v: V3 | undefined): V3 | undefined {
  return v ? [-v[0], v[1], v[2]] : undefined;
}
function mirrorRot(v: V3 | undefined): V3 | undefined {
  // (pitch, yaw, roll) -> (pitch, -yaw, -roll)
  return v ? [v[0], -v[1], -v[2]] : undefined;
}
const MIRROR_AIM: Record<string, AimPoint> = {
  'p.handL': 'p.handR', 'p.handR': 'p.handL', 'p.farmL': 'p.farmR', 'p.farmR': 'p.farmL',
  'p.footL': 'p.footR', 'p.footR': 'p.footL', 'p.shinL': 'p.shinR', 'p.shinR': 'p.shinL', 'p.uarmL': 'p.uarmR', 'p.uarmR': 'p.uarmL',
};
function mirrorHand(h: KeyHand | undefined): KeyHand | undefined {
  if (!h) return h;
  return {
    ...h,
    p: mirrorV(h.p),
    pole: mirrorV(h.pole),
    dir: h.dir ? mirrorV(h.dir) : h.dir,
    aimOff: mirrorV(h.aimOff),
    aim: h.aim ? MIRROR_AIM[h.aim] ?? h.aim : h.aim,
  };
}
function mirrorFoot(f: KeyFoot | undefined): KeyFoot | undefined {
  if (!f) return f;
  return { ...f, p: mirrorV(f.p), pole: mirrorV(f.pole), aimOff: mirrorV(f.aimOff), yaw: f.yaw !== undefined ? -f.yaw : undefined, roll: f.roll !== undefined ? -f.roll : undefined, aim: f.aim ? MIRROR_AIM[f.aim] ?? f.aim : f.aim };
}
export function mirrorKey(k: Key): Key {
  return {
    ...k,
    root: k.root ? [-k.root[0], k.root[1], -k.root[2]] : undefined,
    hips: mirrorV(k.hips),
    hipsR: mirrorRot(k.hipsR),
    spine: mirrorRot(k.spine),
    chest: mirrorRot(k.chest),
    neck: mirrorRot(k.neck),
    head: mirrorRot(k.head),
    torso: mirrorRot(k.torso),
    lh: mirrorHand(k.rh),
    rh: mirrorHand(k.lh),
    lf: mirrorFoot(k.rf),
    rf: mirrorFoot(k.lf),
    shrug: k.shrug ? [k.shrug[1], k.shrug[0]] : undefined,
  };
}

function resolve(spec: ClipSpec): RKey[] {
  const out: RKey[] = [];
  let prev: RKey | null = null;
  for (const kIn of spec.keys) {
    const k = kIn;
    const base: RKey =
      prev ??
      ({
        t: 0,
        e: undefined,
        root: [0, 0, 0],
        hips: [0, 0, 0],
        hipsR: [0, 0, 0],
        spine: [0, 0, 0],
        chest: [0, 0, 0],
        neck: [0, 0, 0],
        head: [0, 0, 0],
        lh: { p: DEFAULT_HAND_L.p!, sp: 'chest', aim: null, aimW: 0, aimOff: [0, 0, 0], pole: DEFAULT_HAND_L.pole!, roll: 10, dir: null, dirW: 0 },
        rh: { p: DEFAULT_HAND_R.p!, sp: 'chest', aim: null, aimW: 0, aimOff: [0, 0, 0], pole: DEFAULT_HAND_R.pole!, roll: 10, dir: null, dirW: 0 },
        lf: { p: [0.11, 0, 0.12], yaw: 8, pitch: 0, roll: 0, toe: 0, lift: 0.08, aim: null, aimW: 0, pole: null, explicit: true, aimOff: [0, 0, 0], via: false },
        rf: { p: [-0.11, 0, -0.12], yaw: -8, pitch: 0, roll: 0, toe: 0, lift: 0.08, aim: null, aimW: 0, pole: null, explicit: true, aimOff: [0, 0, 0], via: false },
        shrug: [0, 0],
      } as RKey);
    const torso = k.torso;
    const r: RKey = {
      t: k.t,
      e: k.e,
      root: k.root ?? base.root,
      hips: k.hips ?? base.hips,
      hipsR: k.hipsR ?? base.hipsR,
      spine: k.spine ?? (torso ? [torso[0] * 0.45, torso[1] * 0.45, torso[2] * 0.45] : base.spine),
      chest: k.chest ?? (torso ? [torso[0] * 0.55, torso[1] * 0.55, torso[2] * 0.55] : base.chest),
      neck: k.neck ?? base.neck,
      head: k.head ?? base.head,
      lh: mergeHand(base.lh, k.lh),
      rh: mergeHand(base.rh, k.rh),
      lf: mergeFoot(base.lf, k.lf, prev === null),
      rf: mergeFoot(base.rf, k.rf, prev === null),
      shrug: k.shrug ?? base.shrug,
    };
    out.push(r);
    prev = r;
  }
  return out;
}

function mergeHand(base: RKey['lh'], k: KeyHand | undefined): RKey['lh'] {
  if (!k) return { ...base };
  const r = { ...base };
  // Positions given without an explicit space are root space; guard-like poses use sp:'chest'.
  if (k.p) {
    r.p = k.p;
    r.sp = k.sp ?? 'root';
  } else if (k.sp) r.sp = k.sp;
  if (k.aim !== undefined) r.aim = k.aim;
  if (k.aimW !== undefined) r.aimW = k.aimW;
  else if (k.aim) r.aimW = 1;
  else if (k.aim === null) r.aimW = 0;
  if (k.aimOff) r.aimOff = k.aimOff;
  if (k.pole) r.pole = k.pole;
  if (k.roll !== undefined) r.roll = k.roll;
  if (k.dir !== undefined) r.dir = k.dir;
  if (k.dirW !== undefined) r.dirW = k.dirW;
  else if (k.dir) r.dirW = 1;
  else if (k.dir === null) r.dirW = 0;
  return r;
}
function mergeFoot(base: RKey['lf'], k: KeyFoot | undefined, first: boolean): RKey['lf'] {
  if (!k) return { ...base, explicit: first ? base.explicit : false, aimW: base.aimW, via: false };
  return {
    via: !!k.via,
    p: k.p ?? base.p,
    yaw: k.yaw ?? base.yaw,
    pitch: k.pitch ?? 0,
    roll: k.roll ?? 0,
    toe: k.toe ?? 0,
    lift: k.lift ?? 0.08,
    aim: k.aim !== undefined ? k.aim : base.aim,
    aimW: k.aimW ?? (k.aim ? 1 : k.aim === null ? 0 : base.aimW),
    pole: k.pole ?? base.pole,
    explicit: !!k.p,
    aimOff: k.aimOff ?? (k.aim === null ? [0, 0, 0] : base.aimOff),
  };
}

export const CLIPS = new Map<string, Clip>();

/**
 * Phrase strike timing: the wind-up before a strike settles (ends at rest instead of at full speed,
 * so the release is not a one-frame reversal), and the retraction after it starts from rest.
 */
function phraseStrikes(keys: RKey[]) {
  const strike = (e: EaseName | undefined) => e === 'snap' || e === 'expoIn';
  for (let i = 1; i < keys.length; i++) {
    if (!strike(keys[i].e)) continue;
    // a spin carries straight through the wind-up key: keep its momentum (no settle)
    if (i >= 2) {
      const dPrev = keys[i - 1].root[2] - keys[i - 2].root[2], dCur = keys[i].root[2] - keys[i - 1].root[2];
      if (Math.abs(dPrev) > 40 && Math.abs(dCur) > 40 && Math.sign(dPrev) === Math.sign(dCur)) {
        keys[i].e = 'out3';
        continue;
      }
    }
    const pe = keys[i - 1].e;
    if (i - 1 > 0 && (pe === 'in' || pe === 'in3' || pe === 'linear')) keys[i - 1].e = 'smooth';
    if (i + 1 < keys.length && keys[i + 1].e === 'out') keys[i + 1].e = 'recoil';
  }
}

export function defineClip(name: string, spec: ClipSpec): Clip {
  const keys = resolve(spec);
  phraseStrikes(keys);
  const dur = spec.dur ?? keys[keys.length - 1].t;
  const clip: Clip = {
    name,
    dur,
    keys,
    events: (spec.events ?? []).slice().sort((a, b) => a.t - b.t),
    loop: !!spec.loop,
    warp: spec.warp ?? null,
    hitT: spec.hitT ?? -1,
    comboT: spec.comboT ?? dur,
    recoverT: spec.recoverT ?? dur,
    footFromStart: !!spec.footFromStart,
    footQ: spec.footFromStart
      ? [keys.map((k) => eulerDeg(k.lf.pitch, k.lf.yaw, k.lf.roll, new THREE.Quaternion())), keys.map((k) => eulerDeg(k.rf.pitch, k.rf.yaw, k.rf.roll, new THREE.Quaternion()))]
      : null,
    footPiv: spec.footFromStart ? [spec.keys.map((k) => k.lf?.piv ?? 1), spec.keys.map((k) => k.rf?.piv ?? 1)] : null,
    settleFeet: spec.settleFeet ?? 0,
    torsoQ:
      spec.footFromStart && keys.some((k) => Math.abs(k.hipsR[0]) > 50)
        ? (['hipsR', 'spine', 'chest', 'neck', 'head'] as const).map((f) => keys.map((k) => eulerDeg(k[f][0], k[f][1], k[f][2], new THREE.Quaternion())))
        : null,
    lunge: spec.footFromStart ? capturedLunge(keys, spec.warp ?? null) : Infinity,
    stance: keys[0].lf.p[2] >= keys[0].rf.p[2] ? 1 : -1,
  };
  CLIPS.set(name, clip);
  return clip;
}
/** Define a clip and its mirror (suffix _m). */
export function defineClipPair(name: string, spec: ClipSpec, mirrorName?: string) {
  const a = defineClip(name, spec);
  const ms: ClipSpec = { ...spec, keys: spec.keys.map(mirrorKey), events: (spec.events ?? []).map((e) => mirrorEvent(e)) };
  const b = defineClip(mirrorName ?? name + '_m', ms);
  return [a, b];
}
const MIRROR_LIMB: Record<string, string> = { rh: 'lh', lh: 'rh', rf: 'lf', lf: 'rf', re: 'le', le: 're', rk: 'lk', lk: 'rk' };
function mirrorEvent(e: ClipEvent): ClipEvent {
  const o: ClipEvent = { ...e };
  if (typeof o.limb === 'string') o.limb = MIRROR_LIMB[o.limb as string] ?? o.limb;
  if (typeof o.dir === 'string') o.dir = o.dir === 'left' ? 'right' : o.dir === 'right' ? 'left' : o.dir;
  if (typeof o.side === 'number') o.side = -(o.side as number);
  return o;
}
export function getClip(name: string): Clip {
  const c = CLIPS.get(name);
  if (!c) throw new Error('Unknown clip ' + name);
  return c;
}

// =====================================================================================
// Clip player
// =====================================================================================

export interface AimProvider {
  /** World position of an aim point, or false if unavailable. */
  aimPoint(p: AimPoint, out: THREE.Vector3): boolean;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _chestPos = new THREE.Vector3();
const _chestRot = new THREE.Quaternion();
const _spineRot = new THREE.Quaternion();
const _tmp = new THREE.Vector3();
const _hipQ = new THREE.Quaternion();
const _sQ = new THREE.Quaternion();
const _cQ = new THREE.Quaternion();
const AIM_FWD = new THREE.Vector3();
const _Yax = new THREE.Vector3(0, 1, 0);

export class ClipPlayer {
  clip: Clip;
  time = 0;
  speed = 1;
  /** World transform of clip space origin. */
  originX = 0;
  originZ = 0;
  originYaw = 0;
  /** Root warp offset (world) applied over clip.warp window. */
  warpX = 0;
  warpZ = 0;
  warpYaw = 0;
  /** Start offsets that decay (smooth entry). */
  entryX = 0;
  entryZ = 0;
  entryYaw = 0;
  entryHalflife = 0.07;
  aim: AimProvider | null = null;
  /** Character scale applied to all clip-space distances. */
  scale = 1;
  /** Ground height provider (bodies on the floor) for planted feet. */
  ground: ((x: number, z: number) => number) | null = null;
  /** Initial foot world positions (clip start), to keep continuity. */
  footStart: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  footStartYaw: [number, number] = [0, 0];
  private footWorld: { x: number; y: number; z: number; yaw: number }[][] = [];
  private evIndex = 0;
  finished = false;
  params: PoseParams = makeParams();
  rootX = 0;
  rootZ = 0;
  rootYaw = 0;

  constructor(clip: Clip) {
    this.clip = clip;
  }

  /**
   * Begin playing. `curX/curZ/curYaw` is the character's current root; origin defines clip space.
   * Feet: current world ankle positions + yaws.
   */
  start(
    originX: number,
    originZ: number,
    originYaw: number,
    curX: number,
    curZ: number,
    curYaw: number,
    feet: [THREE.Vector3, THREE.Vector3],
    feetYaw: [number, number],
    def: SkeletonDef,
  ) {
    this.originX = originX;
    this.originZ = originZ;
    this.originYaw = originYaw;
    this.time = 0;
    this.evIndex = 0;
    this.finished = false;
    this.warpX = this.warpZ = this.warpYaw = 0;
    // where does the clip root start in world?
    this.scale = def.scale;
    const k0 = this.clip.keys[0];
    const [wx, wz] = this.clipToWorldXZ(k0.root[0], k0.root[1]);
    this.entryX = curX - wx;
    this.entryZ = curZ - wz;
    this.entryYaw = wrapAngle(curYaw - (originYaw + k0.root[2] * DEG));
    this.footStart[0].copy(feet[0]);
    this.footStart[1].copy(feet[1]);
    this.footStartYaw[0] = feetYaw[0];
    this.footStartYaw[1] = feetYaw[1];
    this.buildFootWorld(def);
    this.computeRoot();
  }

  clipToWorldXZ(x: number, z: number): [number, number] {
    const [rx, rz] = rotY(x * this.scale, z * this.scale, this.originYaw);
    return [this.originX + rx, this.originZ + rz];
  }

  warpWeight(t: number) {
    const w = this.clip.warp;
    if (!w) return 0;
    return smoothstep(w[0], w[1], t);
  }

  /** Precompute world-space foot plants for each key (with warp at key time; recomputed when warp changes). */
  buildFootWorld(def: SkeletonDef) {
    const keys = this.clip.keys;
    this.footWorld = [[], []];
    if (this.clip.footFromStart) {
      this.planCapturedFeet();
      return;
    }
    for (let side = 0; side < 2; side++) {
      let usingStart = true;
      const first = side === 0 ? keys[0].lf : keys[0].rf;
      for (let i = 0; i < keys.length; i++) {
        const f = side === 0 ? keys[i].lf : keys[i].rf;
        const samePlace = Math.abs(f.p[0] - first.p[0]) < 1e-4 && Math.abs(f.p[2] - first.p[2]) < 1e-4 && f.p[1] < 1e-4;
        if (usingStart && (i === 0 || samePlace)) {
          const st = this.footStart[side];
          this.footWorld[side].push({ x: st.x, y: this.ground ? this.ground(st.x, st.z) : 0, z: st.z, yaw: this.footStartYaw[side] });
          continue;
        }
        usingStart = false;
        const w = this.warpWeight(keys[i].t);
        const [x, z] = this.clipToWorldXZ(f.p[0], f.p[2]);
        const fx = x + this.warpX * w, fz = z + this.warpZ * w;
        this.footWorld[side].push({
          x: fx,
          z: fz,
          y: f.p[1] * this.scale + (f.p[1] < 0.02 && this.ground ? this.ground(fx, fz) : 0),
          yaw: this.originYaw + f.yaw * DEG + this.warpYaw * w,
        });
      }
    }
    void def;
  }

  /**
   * Feet of a captured clip. Each foot keeps the capture's own footwork, relative to where it
   * really stands, and nothing moves a foot that is on the floor. The root's warp, and the
   * difference between the fighter's stance and the capture's, reach a foot only while it is in
   * the air: in its own swings, or in steps added where the body travels further than a planted
   * leg can follow (the foot ahead along the travel first, the other after it, never both in the
   * air at once) or where the fighter stands too differently from the capture.
   */
  private planCapturedFeet() {
    const keys = this.clip.keys;
    const n = keys.length;
    const S = this.scale;
    const W = Math.hypot(this.warpX, this.warpZ);
    const w1 = this.clip.warp ? this.clip.warp[1] : 0;
    const ux = W > 1e-6 ? this.warpX / W : 0, uz = W > 1e-6 ? this.warpZ / W : 0;
    const foot = (side: number, i: number) => (side === 0 ? keys[i].lf : keys[i].rf);
    const down = [0, 1].map((side) => keys.map((_, i) => footDown(foot(side, i))));
    // where the fighter stands against where the capture starts (a foot the capture has in the
    // air at the start rises from the floor the fighter stands on)
    const off = [0, 1].map((side) => {
      const f0 = foot(side, 0);
      const [ax, az] = this.clipToWorldXZ(f0.p[0], f0.p[2]);
      const st = this.footStart[side];
      return { x: st.x - ax, z: st.z - az, y: -f0.p[1] * S, yaw: wrapAngle(this.footStartYaw[side] - (this.originYaw + f0.yaw * DEG)) };
    });
    // the capture's own swings: from the last key down to the first key down again
    // (ext: a capture's step kept up longer than the capture had it)
    type Step = { a: number; b: number; added: boolean; ext?: boolean };
    const steps: Step[][] = [[], []];
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < n; ) {
        if (down[side][i]) {
          i++;
          continue;
        }
        let j = i;
        while (j < n && !down[side][j]) j++;
        steps[side].push({ a: Math.max(0, i - 1), b: Math.min(n - 1, j), added: false });
        i = j;
      }
    }
    const keyAt = (t: number) => {
      let i = 0;
      while (i < n - 1 && keys[i + 1].t <= t) i++;
      return i;
    };
    const standsOver = (side: number, a: number, b: number) => {
      for (let i = a; i <= b; i++) if (!down[side][i]) return false;
      return true;
    };
    const firstSwing = (side: number) => (steps[side].length ? keys[steps[side][0].a].t : Infinity);
    const along = (side: number) => this.footStart[side].x * ux + this.footStart[side].z * uz;
    const offLen = (side: number) => Math.hypot(off[side].x, off[side].z);
    const lead = W > 1e-6 ? (along(0) >= along(1) ? 0 : 1) : offLen(0) >= offLen(1) ? 0 : 1;
    let prevAdded: Step | null = null;
    const settle = this.clip.settleFeet;
    for (const side of settle > 0 ? [] : [lead, 1 - lead]) {
      const first = side === lead;
      const needWarp = W > 0.1 * S && firstSwing(side) > w1 * 0.8;
      const needStance = (offLen(side) > 0.08 * S || Math.abs(off[side].yaw) > 0.5) && firstSwing(side) > 0.35;
      if (!needWarp && !needStance) continue;
      const span = needWarp ? Math.max(w1, 0.2) : 0.36;
      let ta = first ? 0 : span * 0.5;
      let tb = first ? span * 0.6 : span + 0.12;
      // one foot at a time, and a step takes the time a quick step takes
      if (prevAdded) ta = Math.max(ta, keys[prevAdded.b].t - 0.02);
      tb = Math.max(tb, ta + 0.17);
      const a = keyAt(ta);
      const b = Math.min(n - 1, Math.max(a + 3, keyAt(tb) + 1));
      // only from a stance: this foot down throughout, and the other one down to stand on
      if (b <= a || !standsOver(side, a, b) || !standsOver(1 - side, a, b)) continue;
      const st: Step = { a, b, added: true };
      steps[side].push(st);
      steps[side].sort((p, q) => p.a - q.a);
      prevAdded = st;
    }
    // per key: the share of the warp the foot has taken (g), and of the stance difference it has
    // shed (r) - both change only in the air
    for (let side = 0; side < 2; side++) {
      const ss = steps[side];
      const out = this.footWorld[side];
      const o = off[side];
      let g = 0, r = 0, si = 0;
      // what each step carries: the warp up to the next lift, and what is left of the difference
      const land = ss.map((_, k) => this.warpWeight(k + 1 < ss.length ? keys[ss[k + 1].a].t : this.clip.dur));
      // ...and a capture's own step is as quick as it is: a jab's half-step of 60 ms asked to
      // carry the foot across from the other stance too shot it 70 cm in three frames. A step
      // that has more to carry than its time allows stays up longer instead - a bigger step
      // takes longer - landing once there's been time for it (but before the other foot lifts).
      {
        const oLen = Math.hypot(o.x, o.z);
        const other = steps[1 - side];
        let gp = 0, first = true;
        for (let k = 0; k < ss.length; k++) {
          const st = ss[k];
          const carry = W * Math.abs(land[k] - gp) + (first ? oLen : 0);
          gp = land[k];
          first = false;
          if (st.added) continue;
          const need = carry / (MAX_ADDED_STEP_SPEED * S);
          if (keys[st.b].t - keys[st.a].t >= need) continue;
          // (no later than this foot's own next lift, nor the other foot's)
          let limit = k + 1 < ss.length ? ss[k + 1].a : n - 1;
          for (const os of other) if (os.a > st.a && os.a < limit) limit = os.a;
          let b = st.b;
          while (b < limit && keys[b].t - keys[st.a].t < need) b++;
          if (b > st.b) {
            st.b = b;
            st.ext = true;
          }
        }
      }
      for (let i = 0; i < n; i++) {
        const f = foot(side, i);
        let gi = g, ri = r, ry = r, lift = 0;
        while (si < ss.length && i >= ss[si].b) {
          g = land[si];
          r = 1;
          gi = g;
          ri = ry = r;
          si++;
        }
        if (si < ss.length && i > ss[si].a && i < ss[si].b) {
          const st = ss[si];
          const ta = keys[st.a].t, tb = keys[st.b].t;
          const v = clamp01((keys[i].t - ta) / Math.max(1e-4, tb - ta));
          const gl = land[si];
          // up first, across in the middle, down before it stops
          const u = st.added ? smoothstep(0.15, 0.85, v) : smoothstep(0.08, 0.92, v);
          gi = lerp(g, gl, u);
          ri = lerp(r, 1, u);
          ry = lerp(r, 1, smoothstep(0, 0.4, v));
          // a step lifts the foot as high as the ground it covers asks (a capture's low shuffle
          // made to cover more is raised to it): never a glide
          const dx = this.warpX * (gl - g) - o.x * (1 - r), dz = this.warpZ * (gl - g) - o.z * (1 - r);
          const want = Math.min(0.12 * S, 0.035 * S + Math.hypot(dx, dz) * 0.2);
          let own = 0;
          if (!st.added) for (let q = st.a; q <= st.b; q++) own = Math.max(own, foot(side, q).p[1] * S);
          // (a raised cosine: off the floor and back onto it without a jolt in the shin; a step
          // kept up past the capture's landing stays off the floor till its own)
          const up = st.ext ? Math.max(want - own, 0.04 * S) : want - own;
          if (up > 0.01 * S) lift = (0.5 - 0.5 * Math.cos(2 * Math.PI * v)) * up;
        }
        if (settle > 0) {
          const rs = smoothstep(0, settle, keys[i].t);
          ri = Math.max(ri, rs);
          ry = Math.max(ry, rs);
        }
        const [bx, bz] = this.clipToWorldXZ(f.p[0], f.p[2]);
        const x = bx + this.warpX * gi + o.x * (1 - ri);
        const z = bz + this.warpZ * gi + o.z * (1 - ri);
        out.push({
          x,
          z,
          y: Math.max(0, f.p[1] * S + o.y * (1 - ry)) + lift + (f.p[1] < 0.02 && this.ground ? this.ground(x, z) : 0),
          yaw: this.originYaw + f.yaw * DEG + this.warpYaw * gi + o.yaw * (1 - ri),
        });
      }
    }
  }

  /** (debug) the planned world feet, per key */
  plannedFeet(side: number) {
    return this.footWorld[side];
  }

  setWarp(dx: number, dz: number, dyaw: number, def: SkeletonDef) {
    this.warpX = dx;
    this.warpZ = dz;
    this.warpYaw = dyaw;
    this.buildFootWorld(def);
  }

  /** Root position in world at clip time t (without entry offsets). */
  rootAt(t: number, out: { x: number; z: number; yaw: number }) {
    const keys = this.clip.keys;
    const [i, s] = this.segment(t);
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[Math.min(keys.length - 1, i + 1)], k3 = keys[Math.min(keys.length - 1, i + 2)];
    const x = catmull(k0.root[0], k1.root[0], k2.root[0], k3.root[0], s);
    const z = catmull(k0.root[1], k1.root[1], k2.root[1], k3.root[1], s);
    const yaw = catmull(k0.root[2], k1.root[2], k2.root[2], k3.root[2], s) * DEG;
    const [wx, wz] = this.clipToWorldXZ(x, z);
    const w = this.warpWeight(t);
    out.x = wx + this.warpX * w;
    out.z = wz + this.warpZ * w;
    out.yaw = this.originYaw + yaw + this.warpYaw * w;
    return out;
  }

  /** Returns [index of segment start key, eased s]. */
  segment(t: number): [number, number] {
    const keys = this.clip.keys;
    if (t <= keys[0].t) return [0, 0];
    for (let i = 0; i < keys.length - 1; i++) {
      if (t < keys[i + 1].t) {
        const s = (t - keys[i].t) / Math.max(1e-6, keys[i + 1].t - keys[i].t);
        return [i, ease(keys[i + 1].e, s)];
      }
    }
    return [Math.max(0, keys.length - 2), 1];
  }

  /** Advance time and collect events crossed. */
  advance(dt: number, events?: ClipEvent[]) {
    const prev = this.time;
    this.time += dt * this.speed;
    if (this.clip.loop && this.time >= this.clip.dur) {
      this.time %= this.clip.dur;
      this.evIndex = 0;
    }
    if (events) {
      const evs = this.clip.events;
      while (this.evIndex < evs.length && evs[this.evIndex].t <= this.time) {
        if (evs[this.evIndex].t >= prev - 1e-6 || prev === 0) events.push(evs[this.evIndex]);
        this.evIndex++;
      }
    }
    if (!this.clip.loop && this.time >= this.clip.dur) {
      this.time = this.clip.dur;
      this.finished = true;
    }
    // decay entry offsets
    const k = Math.exp((-0.69314718 * dt) / this.entryHalflife);
    this.entryX *= k;
    this.entryZ *= k;
    this.entryYaw *= k;
  }

  /**
   * Evaluate at current time. Produces root transform (world) and PoseParams (root space).
   */
  /** Persistent root correction (e.g. collision push-back). */
  blockX = 0;
  blockZ = 0;

  /** Compute the root transform for the current time (world). */
  computeRoot() {
    const r = this.rootAt(this.time, _rootTmp);
    this.rootX = r.x + this.entryX + this.blockX;
    this.rootZ = r.z + this.entryZ + this.blockZ;
    this.rootYaw = r.yaw + this.entryYaw;
  }

  evaluate(def: SkeletonDef) {
    const keys = this.clip.keys;
    const t = this.time;
    const [i, s] = this.segment(t);
    const n = keys.length;
    const i0 = Math.max(0, i - 1), i1 = i, i2 = Math.min(n - 1, i + 1), i3 = Math.min(n - 1, i + 2);
    const k0 = keys[i0], k1 = keys[i1], k2 = keys[i2], k3 = keys[i3];
    const cr = (a: number, b: number, c: number, d: number) => catmull(a, b, c, d, s);
    const cr3 = (a: V3, b: V3, c: V3, d: V3, out: V3) => {
      out[0] = cr(a[0], b[0], c[0], d[0]);
      out[1] = cr(a[1], b[1], c[1], d[1]);
      out[2] = cr(a[2], b[2], c[2], d[2]);
      return out;
    };
    const prm = this.params;
    const tmp: V3 = [0, 0, 0];
    // ---- hips/spine
    const S = this.scale;
    cr3(k0.hips, k1.hips, k2.hips, k3.hips, tmp);
    prm.hipsPos.set(tmp[0] * S, def.offsets[B.hips].y + tmp[1] * S, tmp[2] * S);
    const tq = this.clip.torsoQ;
    if (tq) {
      prm.hipsRot.copy(tq[0][i1]).slerp(tq[0][i2], s);
      prm.spine.copy(tq[1][i1]).slerp(tq[1][i2], s);
      prm.chest.copy(tq[2][i1]).slerp(tq[2][i2], s);
      prm.neck.copy(tq[3][i1]).slerp(tq[3][i2], s);
      prm.head.copy(tq[4][i1]).slerp(tq[4][i2], s);
    } else {
      cr3(k0.hipsR, k1.hipsR, k2.hipsR, k3.hipsR, tmp);
      eulerDeg(tmp[0], tmp[1], tmp[2], prm.hipsRot);
      cr3(k0.spine, k1.spine, k2.spine, k3.spine, tmp);
      eulerDeg(tmp[0], tmp[1], tmp[2], prm.spine);
      cr3(k0.chest, k1.chest, k2.chest, k3.chest, tmp);
      eulerDeg(tmp[0], tmp[1], tmp[2], prm.chest);
      cr3(k0.neck, k1.neck, k2.neck, k3.neck, tmp);
      eulerDeg(tmp[0], tmp[1], tmp[2], prm.neck);
      cr3(k0.head, k1.head, k2.head, k3.head, tmp);
      eulerDeg(tmp[0], tmp[1], tmp[2], prm.head);
    }
    prm.shrug[0] = cr(k0.shrug[0], k1.shrug[0], k2.shrug[0], k3.shrug[0]);
    prm.shrug[1] = cr(k0.shrug[1], k1.shrug[1], k2.shrug[1], k3.shrug[1]);
    // chest transform in root space (for chest-space hands)
    _hipQ.copy(prm.hipsRot);
    _sQ.copy(_hipQ).multiply(prm.spine);
    _cQ.copy(_sQ).multiply(prm.chest);
    _chestPos.copy(def.offsets[B.spine]).applyQuaternion(_hipQ).add(prm.hipsPos);
    _tmp.copy(def.offsets[B.chest]).applyQuaternion(_sQ);
    _chestPos.add(_tmp);
    _chestRot.copy(_cQ);
    _spineRot.copy(_sQ);

    // ---- hands
    const rootInvYaw = -this.rootYaw;
    for (let side = 0; side < 2; side++) {
      const hk = (k: RKey) => (side === 0 ? k.lh : k.rh);
      const pts: THREE.Vector3[] = [_hp[0], _hp[1], _hp[2], _hp[3]];
      const poles: THREE.Vector3[] = [_hpole[0], _hpole[1], _hpole[2], _hpole[3]];
      const ks = [k0, k1, k2, k3];
      for (let j = 0; j < 4; j++) {
        const h = hk(ks[j]);
        const p = pts[j].set(h.p[0] * S, h.p[1] * S, h.p[2] * S);
        const pl = poles[j].set(h.pole[0], h.pole[1], h.pole[2]);
        if (h.sp === 'shoulder') {
          // the wrist from the shoulder in arm lengths (any build reaches the way the capture did)
          const cl = side === 0 ? B.clavL : B.clavR, ua = side === 0 ? B.uarmL : B.uarmR;
          const arm = def.lenUpperArm + def.lenForeArm;
          const oc = def.offsets[cl], ou = def.offsets[ua];
          p.set(oc.x + ou.x + h.p[0] * arm, oc.y + ou.y + h.p[1] * arm, oc.z + ou.z + h.p[2] * arm);
          p.applyQuaternion(_chestRot).add(_chestPos);
          pl.applyQuaternion(_chestRot);
        } else if (h.sp === 'chest') {
          p.applyQuaternion(_chestRot).add(_chestPos);
          pl.applyQuaternion(_chestRot);
        }
        if (h.aim && h.aimW > 0 && this.aim && this.aim.aimPoint(h.aim, _w)) {
          // world -> root space
          this.worldToRoot(_w, _v);
          _v.x += h.aimOff[0] * S;
          _v.y += h.aimOff[1] * S;
          _v.z += h.aimOff[2] * S;
          p.lerp(_v, h.aimW);
        }
      }
      const hp = prm.hands[side];
      hp.pos.set(cr(pts[0].x, pts[1].x, pts[2].x, pts[3].x), cr(pts[0].y, pts[1].y, pts[2].y, pts[3].y), cr(pts[0].z, pts[1].z, pts[2].z, pts[3].z));
      hp.pole.set(lerp(poles[1].x, poles[2].x, s), lerp(poles[1].y, poles[2].y, s), lerp(poles[1].z, poles[2].z, s));
      const h1 = hk(k1), h2 = hk(k2);
      hp.roll = lerp(h1.roll, h2.roll, s);
      if (h1.dir || h2.dir) {
        hp.dir = hp.dir ?? new THREE.Vector3();
        const d1 = h1.dir ?? h2.dir!, d2 = h2.dir ?? h1.dir!;
        hp.dir.set(lerp(d1[0], d2[0], s), lerp(d1[1], d2[1], s), lerp(d1[2], d2[2], s));
        hp.dirW = lerp(h1.dir ? h1.dirW : 0, h2.dir ? h2.dirW : 0, s);
      } else {
        hp.dir = null;
        hp.dirW = 0;
      }
    }

    // ---- feet
    const sk = s;
    for (let side = 0; side < 2; side++) {
      const fw = this.footWorld[side];
      const fk = (k: RKey) => (side === 0 ? k.lf : k.rf);
      // (a step through 'via' keys runs from the planted key before them to the one after)
      let j1 = i1, j2 = i2;
      while (j1 > 0 && fk(keys[j1]).via) j1--;
      while (j2 < n - 1 && fk(keys[j2]).via) j2++;
      const viaSpan = j1 !== i1 || j2 !== i2;
      const s = viaSpan ? clamp01((t - keys[j1].t) / Math.max(1e-4, keys[j2].t - keys[j1].t)) : sk;
      const a = fw[j1], b = fw[j2];
      const f1 = fk(keys[j1]), f2 = fk(keys[j2]);
      let x: number, y: number, z: number;
      const moved = Math.abs(a.x - b.x) + Math.abs(a.z - b.z) > 1e-4 || Math.abs(a.y - b.y) > 1e-4;
      const grounded = !this.clip.footFromStart && a.y < 0.35 && b.y < 0.35 && Math.abs(a.y - b.y) < 0.3 && (j1 === j2 || (f1.p[1] < 0.02 && f2.p[1] < 0.02));
      if (!moved) {
        x = a.x;
        y = a.y;
        z = a.z;
      } else if (grounded) {
        const ss = smoothstep(0, 1, s);
        const dist = Math.hypot(b.x - a.x, b.z - a.z);
        // a long move of a planted foot (a dodge, a lunge, a warp) is a step: off the floor before
        // it travels, down again before it stops, and higher the further it goes - not a glide
        const big = smoothstep(0.25, 0.8, dist);
        const sh = lerp(ss, smoothstep(0.14, 0.9, s), big);
        x = lerp(a.x, b.x, sh);
        z = lerp(a.z, b.z, sh);
        const lift = Math.max(Math.min(f2.lift, 0.03 + dist * 0.35), big * Math.min(0.15, dist * 0.11));
        // (lifted on a raised cosine: a step leaves and lands with no vertical speed - a sine arc
        // started each step with a jolt through the shin)
        y = a.y + (b.y - a.y) * ss + (0.5 - 0.5 * Math.cos(2 * Math.PI * s)) * lift * 1.15;
      } else {
        const p0 = fw[i0], p1 = fw[i1], p2 = fw[i2], p3 = fw[i3];
        x = cr(p0.x, p1.x, p2.x, p3.x);
        y = Math.max(0, cr(p0.y, p1.y, p2.y, p3.y));
        z = cr(p0.z, p1.z, p2.z, p3.z);
      }
      const yaw =
        (this.clip.footFromStart
          ? a.yaw + cr(wrapAngle(fw[i0].yaw - a.yaw), 0, wrapAngle(b.yaw - a.yaw), wrapAngle(b.yaw - a.yaw) + wrapAngle(fw[i3].yaw - b.yaw))
          : lerpAngleRad(a.yaw, b.yaw, smoothstep(0, 1, s))) + rootInvYaw;
      const pitch = lerp(f1.pitch, f2.pitch, s);
      // a grounded foot pivots on its contact point: about the ball of the foot when the heel is up,
      // about the heel when the toes are up (fades out as the foot leaves the floor)
      let pivY = 0, pivF = 0;
      // (a captured foot says how much: only while its contact point is near the floor - in the
      // air, a pitched foot's heading can swing near the vertical and must not swing the ankle)
      const fpv = this.clip.footPiv;
      if (y < 0.36 || fpv) {
        const k = fpv ? lerp(fpv[side][i1], fpv[side][i2], s) : 1 - smoothstep(0.16, 0.36, y);
        const pv = pivotOffset(def, pitch);
        pivY = pv[0] * k;
        pivF = pv[1] * k;
      }
      const wyaw = yaw - rootInvYaw;
      _v.set(x + Math.sin(wyaw) * pivF, y + def.ankleHeight + pivY, z + Math.cos(wyaw) * pivF);
      // aim (kicks)
      const aimW = lerp(f1.aimW, f2.aimW, s);
      const aimP = f2.aim ?? f1.aim;
      if (aimP && aimW > 0 && this.aim && this.aim.aimPoint(aimP, _w)) {
        const off = f2.aim ? f2.aimOff : f1.aimOff;
        // offset is root-space: rotate into world
        const [ox, oz] = rotY(off[0] * S, off[2] * S, this.rootYaw);
        _w.x += ox;
        _w.y += off[1] * S;
        _w.z += oz;
        _v.lerp(_w, aimW);
      }
      const fp = prm.feet[side];
      this.worldToRoot(_v, fp.pos);
      const fq = this.clip.footQ;
      if (fq) {
        // the plan's heading for the foot (start offsets, warp) on top of the capture's own turn
        const h1 = a.yaw - f1.yaw * DEG, h2 = b.yaw - f2.yaw * DEG;
        _q.copy(fq[side][i1]).slerp(fq[side][i2], s);
        fp.rot.setFromAxisAngle(_Yax, h1 + wrapAngle(h2 - h1) * s + rootInvYaw).multiply(_q);
      } else {
        const roll = lerp(f1.roll, f2.roll, s);
        eulerDeg(pitch, yaw / DEG, roll, fp.rot);
      }
      fp.toe = lerp(f1.toe, f2.toe, s);
      const pole = f2.pole ?? f1.pole;
      if (pole) fp.pole.set(pole[0], pole[1], pole[2]);
      else {
        // knee follows foot direction, slightly outward
        fp.pole.set(Math.sin(yaw) + (side === 0 ? 0.25 : -0.25), 0.1, Math.cos(yaw));
      }
    }
    prm.autoHipDrop = true;
    return prm;
  }

  worldToRoot(w: THREE.Vector3, out: THREE.Vector3) {
    const dx = w.x - this.rootX, dz = w.z - this.rootZ;
    const [x, z] = rotY(dx, dz, -this.rootYaw);
    return out.set(x, w.y, z);
  }

  get done() {
    return this.finished;
  }
}

const _rootTmp = { x: 0, z: 0, yaw: 0 };
const _hp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _hpole = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const lerpAngleRad = (a: number, b: number, t: number) => a + wrapAngle(b - a) * t;
export const _unused = { clamp01, _q, _q2, AIM_FWD, _spineRot };
