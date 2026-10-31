import * as THREE from 'three';
import { B, SkeletonDef } from './skeleton';
import { makeParams, PoseParams } from './solver';
import { catmull, clamp01, DEG, ease, EaseName, eulerDeg, lerp, rotY, smoothstep, wrapAngle } from '../core/math';

export type V3 = [number, number, number];
export type AimPoint =
  | 'head' | 'jaw' | 'chest' | 'gut' | 'hips' | 'legs' | 'knee' | 'neck' | 'back'
  | 'p.head' | 'p.neck' | 'p.chest' | 'p.hips' | 'p.handL' | 'p.handR' | 'p.farmL' | 'p.farmR' | 'p.footL' | 'p.footR' | 'p.shinL' | 'p.shinR' | 'p.uarmL' | 'p.uarmR';

export interface KeyHand {
  p?: V3;
  sp?: 'root' | 'chest';
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
  lf: Required<Omit<KeyFoot, 'aim' | 'pole' | 'aimOff'>> & { aim: AimPoint | null; pole: V3 | null; explicit: boolean; aimOff: V3 };
  rf: Required<Omit<KeyFoot, 'aim' | 'pole' | 'aimOff'>> & { aim: AimPoint | null; pole: V3 | null; explicit: boolean; aimOff: V3 };
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
        lf: { p: [0.11, 0, 0.12], yaw: 8, pitch: 0, roll: 0, toe: 0, lift: 0.08, aim: null, aimW: 0, pole: null, explicit: true, aimOff: [0, 0, 0] },
        rf: { p: [-0.11, 0, -0.12], yaw: -8, pitch: 0, roll: 0, toe: 0, lift: 0.08, aim: null, aimW: 0, pole: null, explicit: true, aimOff: [0, 0, 0] },
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
  if (!k) return { ...base, explicit: first ? base.explicit : false, aimW: base.aimW };
  return {
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

export function defineClip(name: string, spec: ClipSpec): Clip {
  const keys = resolve(spec);
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
const MIRROR_LIMB: Record<string, string> = { rh: 'lh', lh: 'rh', rf: 'lf', lf: 'rf' };
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
    for (let side = 0; side < 2; side++) {
      let usingStart = true;
      const first = side === 0 ? keys[0].lf : keys[0].rf;
      for (let i = 0; i < keys.length; i++) {
        const f = side === 0 ? keys[i].lf : keys[i].rf;
        const samePlace = Math.abs(f.p[0] - first.p[0]) < 1e-4 && Math.abs(f.p[2] - first.p[2]) < 1e-4 && f.p[1] < 1e-4;
        if (usingStart && (i === 0 || samePlace)) {
          const st = this.footStart[side];
          this.footWorld[side].push({ x: st.x, y: 0, z: st.z, yaw: this.footStartYaw[side] });
          continue;
        }
        usingStart = false;
        const w = this.warpWeight(keys[i].t);
        const [x, z] = this.clipToWorldXZ(f.p[0], f.p[2]);
        this.footWorld[side].push({
          x: x + this.warpX * w,
          z: z + this.warpZ * w,
          y: f.p[1] * this.scale,
          yaw: this.originYaw + f.yaw * DEG + this.warpYaw * w,
        });
      }
    }
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
        if (h.sp === 'chest') {
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
    for (let side = 0; side < 2; side++) {
      const fw = this.footWorld[side];
      const fk = (k: RKey) => (side === 0 ? k.lf : k.rf);
      const a = fw[i1], b = fw[i2];
      const f1 = fk(k1), f2 = fk(k2);
      let x: number, y: number, z: number;
      const moved = Math.abs(a.x - b.x) + Math.abs(a.z - b.z) > 1e-4 || Math.abs(a.y - b.y) > 1e-4;
      const grounded = a.y < 0.02 && b.y < 0.02;
      if (!moved) {
        x = a.x;
        y = a.y;
        z = a.z;
      } else if (grounded) {
        const ss = smoothstep(0, 1, s);
        x = lerp(a.x, b.x, ss);
        z = lerp(a.z, b.z, ss);
        const dist = Math.hypot(b.x - a.x, b.z - a.z);
        y = Math.sin(Math.PI * s) * Math.min(f2.lift, 0.03 + dist * 0.35);
      } else {
        const p0 = fw[i0], p3 = fw[i3];
        x = cr(p0.x, a.x, b.x, p3.x);
        y = Math.max(0, cr(p0.y, a.y, b.y, p3.y));
        z = cr(p0.z, a.z, b.z, p3.z);
      }
      const yaw = lerpAngleRad(a.yaw, b.yaw, smoothstep(0, 1, s)) + rootInvYaw;
      const pitch = lerp(f1.pitch, f2.pitch, s);
      // heel lift: when a grounded foot pitches toes-down, the ankle rotates up about the ball of the foot
      let heelY = 0, heelBack = 0;
      if (pitch > 0 && y < 0.05) {
        const L = def.footLen * 0.85;
        heelY = Math.sin(pitch * DEG) * L;
        heelBack = (1 - Math.cos(pitch * DEG)) * L;
      }
      const wyaw = yaw - rootInvYaw;
      _v.set(x - Math.sin(wyaw) * heelBack, y + def.ankleHeight + heelY, z - Math.cos(wyaw) * heelBack);
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
      const roll = lerp(f1.roll, f2.roll, s);
      eulerDeg(pitch, yaw / DEG, roll, fp.rot);
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
