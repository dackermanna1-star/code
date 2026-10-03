import * as THREE from 'three';
import type { CharModel } from './Model';
import type { BoneName } from './Rig';

const D = Math.PI / 180;

/** A pose: bone rotations in degrees (Euler XYZ, bind-relative) plus hip offset and hand shapes. */
export interface Pose {
  b: Partial<Record<BoneName, [number, number, number]>>;
  /** hips offset in metres (character space): crouch, lean */
  hip?: [number, number, number];
  hands?: [string, string];
  /**
   * Wrist targets in character space (+Z forward, +X left), solved after FK.
   * Lf/Lp (Rf/Rp): finger direction and palm normal for that hand.
   */
  ik?: { L?: V3; R?: V3; Lf?: V3; Lp?: V3; Rf?: V3; Rp?: V3 };
}
type V3 = [number, number, number];

export interface Key {
  t: number;
  p: Pose;
  /** easing into this key */
  e?: 'lin' | 'in' | 'out' | 'io' | 'back' | 'snap';
}

export interface Clip {
  name: string;
  keys: Key[];
  loop?: boolean;
  /** legs keep running under it */
  upper?: boolean;
  /** seconds to blend in / out */
  fadeIn?: number;
  fadeOut?: number;
  /** named moments (seconds) reported to the caller: 'hit', 'release', ... */
  events?: [number, string][];
}

const ease = (e: Key['e'], t: number) => {
  switch (e) {
    case 'in':
      return t * t * t;
    case 'out':
      return 1 - Math.pow(1 - t, 3);
    case 'io':
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'back': {
      const c = 1.9;
      return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
    }
    case 'snap':
      return 1 - Math.pow(1 - t, 6);
    default:
      return t;
  }
};

/** Swap sides: L↔R bones, negate Y/Z rotations and X offsets. */
export function mirror(p: Pose): Pose {
  const b: Pose['b'] = {};
  for (const [k, v] of Object.entries(p.b) as [BoneName, [number, number, number]][]) {
    const nk = (k.endsWith('L') ? k.slice(0, -1) + 'R' : k.endsWith('R') ? k.slice(0, -1) + 'L' : k) as BoneName;
    b[nk] = [v[0], -v[1], -v[2]];
  }
  const ik: Pose['ik'] = p.ik ? {} : undefined;
  const mx = (v: V3): V3 => [-v[0], v[1], v[2]];
  if (p.ik?.L) ik!.R = mx(p.ik.L);
  if (p.ik?.R) ik!.L = mx(p.ik.R);
  if (p.ik?.Lf) ik!.Rf = mx(p.ik.Lf);
  if (p.ik?.Lp) ik!.Rp = mx(p.ik.Lp);
  if (p.ik?.Rf) ik!.Lf = mx(p.ik.Rf);
  if (p.ik?.Rp) ik!.Lp = mx(p.ik.Rp);
  return { b, hip: p.hip ? [-p.hip[0], p.hip[1], p.hip[2]] : undefined, hands: p.hands ? [p.hands[1], p.hands[0]] : undefined, ik };
}

/** Pose B layered over pose A (B's bones win; IK targets only carry over when B sets none). */
export function over(a: Pose, b: Pose): Pose {
  return { b: { ...a.b, ...b.b }, hip: b.hip ?? a.hip, hands: b.hands ?? a.hands, ik: b.ik ?? a.ik };
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

type QMap = Map<BoneName, THREE.Quaternion>;

function toQ(p: Pose, out: QMap, names: BoneName[]) {
  for (const n of names) {
    const v = p.b[n];
    let q = out.get(n);
    if (!q) out.set(n, (q = new THREE.Quaternion()));
    if (v) q.setFromEuler(_e.set(v[0] * D, v[1] * D, v[2] * D, 'XYZ'));
    else q.identity();
  }
}

const UPPER: BoneName[] = ['spine', 'chest', 'neck', 'head', 'clavL', 'uArmL', 'fArmL', 'handL', 'clavR', 'uArmR', 'fArmR', 'handR'];

/** An IK goal and how strongly it applies. */
class Goal {
  pos = new THREE.Vector3();
  w = 0;
  /** finger direction / palm normal, and how much of the weight carries a hand orientation */
  f = new THREE.Vector3(0, 0, 1);
  p = new THREE.Vector3(0, -1, 0);
  rw = 0;
  set(p: V3 | undefined, k: number, f?: V3, pn?: V3) {
    if (!p || k <= 0) return;
    const share = k / Math.max(1e-4, this.w + k);
    if (this.w <= 0) this.pos.set(p[0], p[1], p[2]);
    else this.pos.lerp(_v.set(p[0], p[1], p[2]), share);
    if (f && pn) {
      const rs = k / Math.max(1e-4, this.rw + k);
      if (this.rw <= 0) {
        this.f.set(f[0], f[1], f[2]).normalize();
        this.p.set(pn[0], pn[1], pn[2]).normalize();
      } else {
        this.f.lerp(_v.set(f[0], f[1], f[2]).normalize(), rs).normalize();
        this.p.lerp(_v.set(pn[0], pn[1], pn[2]).normalize(), rs).normalize();
      }
      this.rw = Math.min(1, this.rw + k);
    }
    this.w = Math.min(1, this.w + k);
  }
  blend(o: Goal, w: number) {
    if (o.w > 0) {
      if (this.w <= 0) this.pos.copy(o.pos);
      else this.pos.lerp(o.pos, w);
    }
    if (o.rw > 0) {
      if (this.rw <= 0) {
        this.f.copy(o.f);
        this.p.copy(o.p);
      } else {
        this.f.lerp(o.f, w).normalize();
        this.p.lerp(o.p, w).normalize();
      }
    }
    this.w = this.w * (1 - w) + o.w * w;
    this.rw = this.rw * (1 - w) + o.rw * w;
  }
}
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _q3 = new THREE.Quaternion();
const _q4 = new THREE.Quaternion();

interface Running {
  clip: Clip;
  t: number;
  w: number;
  speed: number;
  done: boolean;
  onEvent?: (name: string) => void;
}

/** Spring-driven extra rotation on a bone (hit reactions, recoil). */
class BoneKick {
  ang = new THREE.Vector3();
  vel = new THREE.Vector3();
  update(dt: number, k = 160, c = 15) {
    const a = this.ang;
    const v = this.vel;
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      v.x += (-k * a.x - c * v.x) * h;
      v.y += (-k * a.y - c * v.y) * h;
      v.z += (-k * a.z - c * v.z) * h;
      a.addScaledVector(v, h);
    }
  }
}

/**
 * Layered animator: procedural locomotion, one action clip at a time
 * (optionally upper-body only), look-at, breathing and spring kicks.
 */
export class Animator {
  readonly names: BoneName[];
  private base: QMap = new Map();
  private act: QMap = new Map();
  private tmpA: QMap = new Map();
  private tmpB: QMap = new Map();
  private run: Running | null = null;
  private fading: Running | null = null;
  private hipBase = new THREE.Vector3();
  private hipAct = new THREE.Vector3();
  private kicks = new Map<BoneName, BoneKick>();
  private goals = { L: new Goal(), R: new Goal() };
  private actGoals = { L: new Goal(), R: new Goal() };
  /** locomotion inputs */
  speed = 0;
  /** movement direction relative to facing (radians, 0 = forward) */
  moveDir = 0;
  grounded = true;
  vy = 0;
  phase = 0;
  /** base stance when standing still */
  stance: Pose;
  /** walk instead of run below this speed */
  walkSpeed = 3.2;
  /** look-at target in world space (null = none) */
  look: THREE.Vector3 | null = null;
  lookWeight = 1;
  private lookYaw = 0;
  private lookPitch = 0;
  breath = 1;
  private time = 0;
  /** current hand shapes */
  hands: [string, string] = ['relax', 'relax'];
  /** whole-body lean from acceleration (radians) */
  lean = new THREE.Vector2();
  run_: ((p: number, k: number) => Pose) | null = null;

  constructor(
    readonly model: CharModel,
    stance: Pose,
    readonly cycles: { walk: (phase: number) => Pose; run: (phase: number) => Pose; air: (vy: number) => Pose },
  ) {
    this.names = model.rig.names.filter((n) => n !== 'root' && n !== 'wheel');
    this.stance = stance;
  }

  get action() {
    return this.run?.clip.name ?? null;
  }
  get actionT() {
    return this.run?.t ?? 0;
  }
  /** 0..1 progress of the running clip */
  get actionK() {
    if (!this.run) return 1;
    const len = this.run.clip.keys[this.run.clip.keys.length - 1].t;
    return Math.min(1, this.run.t / Math.max(1e-4, len));
  }

  play(clip: Clip, speed = 1, onEvent?: (name: string) => void) {
    if (this.run) {
      this.fading = this.run;
      this.fading.done = true;
    }
    this.run = { clip, t: 0, w: clip.fadeIn === 0 ? 1 : 0, speed, done: false, onEvent };
  }

  stop(fade = true) {
    if (!this.run) return;
    if (fade) {
      this.fading = this.run;
      this.fading.done = true;
    }
    this.run = null;
  }

  /** Spring impulse on a bone (degrees per second). */
  kick(bone: BoneName, x: number, y: number, z: number) {
    let k = this.kicks.get(bone);
    if (!k) this.kicks.set(bone, (k = new BoneKick()));
    k.vel.x += x * D;
    k.vel.y += y * D;
    k.vel.z += z * D;
  }

  private sample(clip: Clip, t: number, out: QMap, hip: THREE.Vector3) {
    const keys = clip.keys;
    const len = keys[keys.length - 1].t;
    if (clip.loop && len > 0) t = t % len;
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
    const a = keys[i];
    const b = keys[Math.min(keys.length - 1, i + 1)];
    const span = b.t - a.t;
    const k = span > 1e-5 ? ease(b.e, Math.min(1, Math.max(0, (t - a.t) / span))) : 1;
    toQ(a.p, this.tmpA, this.names);
    toQ(b.p, this.tmpB, this.names);
    for (const n of this.names) {
      let q = out.get(n);
      if (!q) out.set(n, (q = new THREE.Quaternion()));
      q.copy(this.tmpA.get(n)!).slerp(this.tmpB.get(n)!, k);
    }
    const ha = a.p.hip ?? [0, 0, 0];
    const hb = b.p.hip ?? [0, 0, 0];
    hip.set(ha[0] + (hb[0] - ha[0]) * k, ha[1] + (hb[1] - ha[1]) * k, ha[2] + (hb[2] - ha[2]) * k);
    for (const side of ['L', 'R'] as const) {
      const g = this.actGoals[side];
      g.w = 0;
      g.rw = 0;
      g.set(a.p.ik?.[side], 1 - k, a.p.ik?.[`${side}f`], a.p.ik?.[`${side}p`]);
      g.set(b.p.ik?.[side], k, b.p.ik?.[`${side}f`], b.p.ik?.[`${side}p`]);
      // targets ride along with the pose's crouch / lunge
      g.pos.add(hip);
    }
    // hands switch at the midpoint
    return (k < 0.5 ? a.p.hands : b.p.hands) ?? a.p.hands ?? b.p.hands;
  }

  private locomotion(dt: number) {
    const sp = this.speed;
    this.goals.L.w = this.goals.L.rw = 0;
    this.goals.R.w = this.goals.R.rw = 0;
    let pose: Pose;
    if (!this.grounded) pose = this.cycles.air(this.vy);
    else if (sp < 0.25) pose = this.stance;
    else {
      const walk = sp < this.walkSpeed;
      const stride = walk ? 1.35 : 2.4;
      this.phase += (sp / stride) * dt * Math.PI * 2 * 0.5;
      pose = walk ? this.cycles.walk(this.phase) : this.cycles.run(this.phase);
      // blend into the stance at low speed
      if (sp < 1.2) {
        toQ(this.stance, this.tmpA, this.names);
        toQ(pose, this.base, this.names);
        const w = sp / 1.2;
        for (const n of this.names) this.base.get(n)!.slerp(this.tmpA.get(n)!, 1 - w);
        const h = pose.hip ?? [0, 0, 0];
        const hs = this.stance.hip ?? [0, 0, 0];
        this.hipBase.set(hs[0] + (h[0] - hs[0]) * w, hs[1] + (h[1] - hs[1]) * w, hs[2] + (h[2] - hs[2]) * w);
        this.goals.L.set(this.stance.ik?.L, 1 - w, this.stance.ik?.Lf, this.stance.ik?.Lp);
        this.goals.R.set(this.stance.ik?.R, 1 - w, this.stance.ik?.Rf, this.stance.ik?.Rp);
        this.goals.L.pos.add(this.hipBase);
        this.goals.R.pos.add(this.hipBase);
        return pose.hands ?? this.stance.hands;
      }
    }
    toQ(pose, this.base, this.names);
    const h = pose.hip ?? [0, 0, 0];
    this.hipBase.set(h[0], h[1], h[2]);
    this.goals.L.set(pose.ik?.L, 1, pose.ik?.Lf, pose.ik?.Lp);
    this.goals.R.set(pose.ik?.R, 1, pose.ik?.Rf, pose.ik?.Rp);
    this.goals.L.pos.add(this.hipBase);
    this.goals.R.pos.add(this.hipBase);
    return pose.hands;
  }

  update(dt: number) {
    this.time += dt;
    let hands = this.locomotion(dt);
    // action clip over it
    const step = (r: Running | null) => {
      if (!r) return;
      const len = r.clip.keys[r.clip.keys.length - 1].t;
      const prevT = r.t;
      r.t += dt * r.speed;
      const fi = r.clip.fadeIn ?? 0.08;
      const fo = r.clip.fadeOut ?? 0.15;
      if (r.done) r.w = Math.max(0, r.w - dt / Math.max(0.01, fo));
      else {
        r.w = fi <= 0 ? 1 : Math.min(1, r.w + dt / fi);
        if (!r.clip.loop && r.t >= len) {
          r.done = true;
          if (r === this.run) {
            this.fading = r;
            this.run = null;
          }
        }
      }
      const ev = r.clip.events;
      if (ev && r.onEvent) for (const [t, name] of ev) if (prevT < t && r.t >= t) r.onEvent(name);
    };
    step(this.run);
    step(this.fading);
    if (this.fading && this.fading.w <= 0) this.fading = null;
    const apply = (r: Running | null) => {
      if (!r || r.w <= 0) return;
      const h = this.sample(r.clip, Math.min(r.t, r.clip.loop ? r.t : r.clip.keys[r.clip.keys.length - 1].t), this.act, this.hipAct);
      const w = r.w;
      const mask = r.clip.upper && this.speed > 0.25 ? UPPER : this.names;
      for (const n of mask) this.base.get(n)!.slerp(this.act.get(n)!, w);
      if (!r.clip.upper || this.speed <= 0.25) this.hipBase.lerp(this.hipAct, w);
      if (h && w > 0.5) hands = h as [string, string];
      // the action's goals (or their absence) take over in proportion to the action's weight
      if (!r.clip.upper || true) for (const side of ['L', 'R'] as const) this.goals[side].blend(this.actGoals[side], w);
    };
    apply(this.fading);
    apply(this.run);
    // write bones
    const rig = this.model.rig;
    for (const n of this.names) rig.bones[n].quaternion.copy(this.base.get(n)!);
    // breathing
    const br = Math.sin(this.time * 2.1) * this.breath;
    rig.bones.chest.quaternion.multiply(_q.setFromEuler(_e.set(-br * 0.8 * D, 0, 0)));
    rig.bones.clavL.quaternion.multiply(_q.setFromEuler(_e.set(0, 0, br * 0.6 * D)));
    rig.bones.clavR.quaternion.multiply(_q.setFromEuler(_e.set(0, 0, -br * 0.6 * D)));
    // lean
    if (this.lean.lengthSq() > 1e-6) rig.bones.hips.quaternion.premultiply(_q.setFromEuler(_e.set(this.lean.x, 0, this.lean.y)));
    // spring kicks
    for (const [n, k] of this.kicks) {
      k.update(dt);
      if (Math.abs(k.ang.x) + Math.abs(k.ang.y) + Math.abs(k.ang.z) < 1e-5) continue;
      rig.bones[n].quaternion.multiply(_q.setFromEuler(_e.set(k.ang.x, k.ang.y, k.ang.z)));
    }
    // hips offset
    rig.bones.hips.position.copy(rig.rest.hips).add(this.hipBase);
    // look-at: yaw/pitch shared down the spine
    this.applyLook(dt);
    if (this.goals.L.w > 0.001 || this.goals.R.w > 0.001) {
      this.model.group.updateMatrixWorld(true);
      if (this.goals.L.w > 0.001) this.solveArm('L', this.goals.L);
      if (this.goals.R.w > 0.001) this.solveArm('R', this.goals.R);
    }
    if (hands) {
      this.hands = hands;
      this.model.hands?.L.setPose(hands[0]);
      this.model.hands?.R.setPose(hands[1]);
    }
    this.model.update(dt);
  }

  /**
   * Two-bone IK toward a wrist goal (character space). Corrections are minimal
   * rotations on top of the FK pose, so authored twist survives, and the hand
   * keeps its FK orientation in the world.
   */
  private solveArm(side: 'L' | 'R', g: Goal) {
    const goal = g.pos;
    const w = g.w;
    const rig = this.model.rig;
    const up = rig.bones[('uArm' + side) as BoneName];
    const fa = rig.bones[('fArm' + side) as BoneName];
    const hand = rig.bones[('hand' + side) as BoneName];
    const handWQ = hand.getWorldQuaternion(_q3);
    const S = up.getWorldPosition(_v);
    const T = _v2.copy(goal).applyMatrix4(rig.bones.root.matrixWorld);
    const a = rig.rest[('fArm' + side) as BoneName].length();
    const b = rig.rest[('hand' + side) as BoneName].length();
    // elbow hint: out to the side, down and back, in the character's frame
    const gq = this.model.group.getWorldQuaternion(_q4);
    const pole = _v3.set(side === 'L' ? 0.75 : -0.75, -0.45, -0.5).applyQuaternion(gq).normalize();
    // elbow position
    const d = _v4.subVectors(T, S);
    let len = d.length();
    const maxL = a + b - 1e-3;
    if (len > maxL) {
      d.multiplyScalar(maxL / len);
      len = maxL;
    }
    len = Math.max(len, Math.abs(a - b) + 1e-3);
    const dir = d.normalize();
    const cosA = THREE.MathUtils.clamp((a * a + len * len - b * b) / (2 * a * len), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const perp = pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = new THREE.Vector3().copy(S).addScaledVector(dir, cosA * a).addScaledVector(perp, sinA * a);
    const Tc = new THREE.Vector3().copy(S).addScaledVector(dir, len);
    // upper arm: rotate its current direction onto the elbow
    const curE = fa.getWorldPosition(new THREE.Vector3());
    this.aimBone(up, S, curE, E, w);
    up.updateMatrixWorld(true);
    // forearm onto the wrist goal
    const E2 = fa.getWorldPosition(new THREE.Vector3());
    const curW = hand.getWorldPosition(new THREE.Vector3());
    this.aimBone(fa, E2, curW, Tc, w);
    fa.updateMatrixWorld(true);
    // hand keeps its FK world orientation, or turns to the authored finger/palm directions
    if (g.rw > 0.001) {
      const f = g.f.clone().applyQuaternion(gq);
      const pn = g.p.clone();
      pn.addScaledVector(g.f, -pn.dot(g.f)).normalize().applyQuaternion(gq);
      // bind hand: fingers -Y, palm normal -X (left) / +X (right)
      const xAxis = side === 'L' ? pn.clone().negate() : pn.clone();
      const yAxis = f.clone().negate();
      const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
      const want = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
      handWQ.slerp(want, g.rw);
    }
    const faQ = fa.getWorldQuaternion(new THREE.Quaternion());
    const target = faQ.invert().multiply(handWQ);
    hand.quaternion.slerp(target, w);
    hand.updateMatrixWorld(true);
  }

  /** Rotates a bone (in world space, minimal arc) so that `from` swings to `to` around `pivot`. */
  private aimBone(bone: THREE.Bone, pivot: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3, w: number) {
    const a = from.clone().sub(pivot).normalize();
    const b = to.clone().sub(pivot).normalize();
    if (a.lengthSq() < 1e-8 || b.lengthSq() < 1e-8) return;
    const corr = new THREE.Quaternion().setFromUnitVectors(a, b);
    const wq = bone.getWorldQuaternion(new THREE.Quaternion());
    const newW = corr.multiply(wq);
    const pq = bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
    const local = pq.multiply(newW);
    bone.quaternion.slerp(local, w);
  }

  private applyLook(dt: number) {
    const rig = this.model.rig;
    let yaw = 0;
    let pitch = 0;
    if (this.look && this.lookWeight > 0) {
      this.model.group.updateMatrixWorld();
      const hips = rig.bones.hips;
      const head = rig.bones.head.getWorldPosition(new THREE.Vector3());
      const d = this.look.clone().sub(head);
      // into the character's facing frame (root yaw only)
      const inv = this.model.group.getWorldQuaternion(_q2).invert();
      d.applyQuaternion(inv);
      yaw = Math.atan2(d.x, d.z);
      pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z));
      yaw = THREE.MathUtils.clamp(yaw, -1.3, 1.3) * this.lookWeight;
      pitch = THREE.MathUtils.clamp(pitch, -0.9, 0.9) * this.lookWeight;
      void hips;
    }
    const k = 1 - Math.exp(-dt * 10);
    this.lookYaw += (yaw - this.lookYaw) * k;
    this.lookPitch += (pitch - this.lookPitch) * k;
    if (Math.abs(this.lookYaw) + Math.abs(this.lookPitch) < 1e-4) return;
    const share: [BoneName, number, number][] = [
      ['spine', 0.15, 0.1],
      ['chest', 0.25, 0.2],
      ['neck', 0.25, 0.3],
      ['head', 0.35, 0.4],
    ];
    for (const [n, ky, kp] of share) {
      // rotate about the world-up / character-right axes expressed in bone space: bones are near-identity so local axes work
      rig.bones[n].quaternion.premultiply(_q.setFromEuler(_e.set(this.lookPitch * kp, this.lookYaw * ky, 0, 'YXZ')));
    }
  }
}

// ------------------------------------------------------------------ authoring helpers
export const P = (b: Pose['b'], hip?: [number, number, number], hands?: [string, string]): Pose => ({ b, hip, hands });
