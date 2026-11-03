import * as THREE from 'three';
import { B, BONE_COUNT, SkeletonDef } from './skeleton';
import { Pose, PoseFK } from './pose';
import { PoseParams, solvePose, SolveState, twoBoneIK } from './solver';
import { Locomotion, LocoInput } from './locomotion';
import { AimProvider, Clip, ClipEvent, ClipPlayer } from './clip';
import { decaySpring, quatToScaledAxis, rotY, scaledAxisToQuat, clamp, smoothstep } from '../core/math';
import { CharacterModel } from '../character/library';

/** At most this many solves of a new source before a blend measures its offset (see settle). */
const SETTLE_SOLVES = 12;

export type AnimMode = 'loco' | 'clip' | 'external' | 'frozen';

/** A pose provider outside the clip/loco systems (ragdoll, corpse). */
export interface ExternalPose {
  /** Write joint-space pose relative to the given root. */
  /** The pose relative to the root (its height: `rootY`, the floor the body stood on). */
  writePose(def: SkeletonDef, rootX: number, rootZ: number, rootYaw: number, out: Pose, rootY?: number): void;
}

const SPRING_BONES = [B.hips, B.spine, B.chest, B.neck, B.head];
/** Bone -> its index in SPRING_BONES (-1: no spring). */
const SPRING_OF = new Array<number>(BONE_COUNT).fill(-1);
SPRING_BONES.forEach((b, i) => (SPRING_OF[b] = i));

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _q4 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _e = new THREE.Euler();
const _lk = { th: new THREE.Vector3(), tgt: new THREE.Vector3(), axis: new THREE.Vector3(), bend: new THREE.Vector3(), mid: new THREE.Vector3(), end: new THREE.Vector3(), b2: new THREE.Vector3(), d0: new THREE.Vector3(), d1: new THREE.Vector3(), q1: new THREE.Quaternion(), q2: new THREE.Quaternion(), qf: new THREE.Quaternion(), inv: new THREE.Quaternion() };

export interface PlayOptions {
  /** World origin of the clip space. Defaults to the character's root. */
  originX?: number;
  originZ?: number;
  originYaw?: number;
  halflife?: number;
  speed?: number;
  aim?: AimProvider | null;
  entryHalflife?: number;
  startTime?: number;
  /** Heights in the clip scaled by this (a climb authored for one ledge, fitted to another). */
  yScale?: number;
}

export class Animator {
  loco = new Locomotion();
  clip: ClipPlayer | null = null;
  external: ExternalPose | null = null;
  mode: AnimMode = 'loco';
  src = new Pose();
  out = new Pose();
  prev = new Pose();
  fk = new PoseFK();
  prevFk = new PoseFK();
  /** Root (world) used for the last update. */
  rootX = 0;
  rootZ = 0;
  rootYaw = 0;
  /** The floor the body stands on (the pose itself is computed with that floor at 0). */
  rootY = 0;
  events: ClipEvent[] = [];
  locoIn: LocoInput = {
    dt: 0, rootX: 0, rootZ: 0, rootYaw: 0, velX: 0, velZ: 0, style: 'fight', guard: 1, block: 0, look: 0, limp: 0, hunch: 0, breath: 0, holdSide: 0, brokenArm: 0, taunt: 0,
  };
  // inertialization
  private offR: THREE.Vector3[] = [];
  private offV: THREE.Vector3[] = [];
  private offH = new THREE.Vector3();
  private offHV = new THREE.Vector3();
  private inertia = false;
  private halflife = 0.08;
  private pending = false;
  private pendingHL = 0.08;
  /** Seconds since the last transition began (the leg lock eases its foot turn in over it). */
  private blendAge = 1;
  lastDt = 1 / 60;
  // secondary springs (scaled-axis in parent frame)
  private sx: THREE.Vector3[] = [];
  private sv: THREE.Vector3[] = [];
  springStiffness = 230;
  springDamping = 0.42;
  /** Extra per-bone local rotation overrides (e.g. broken limbs), applied post. */
  postRot: (THREE.Quaternion | null)[] = new Array(BONE_COUNT).fill(null);
  initialized = false;
  ground: ((x: number, z: number) => number) | null = null;
  private srcFk = new PoseFK();
  /** IK continuity memory (see SolveState). */
  solveState = new SolveState();
  private lockFk = new PoseFK();

  constructor(public def: SkeletonDef, public model: CharacterModel) {
    for (let i = 0; i < BONE_COUNT; i++) {
      this.offR.push(new THREE.Vector3());
      this.offV.push(new THREE.Vector3());
    }
    for (let i = 0; i < SPRING_BONES.length; i++) {
      this.sx.push(new THREE.Vector3());
      this.sv.push(new THREE.Vector3());
      this.springQ.push(new THREE.Quaternion());
      this.springQPrev.push(new THREE.Quaternion());
    }
    this.out.setRest(def);
    this.prev.setRest(def);
  }

  /** Place feet at the default stance around a root (call when spawning). */
  initAt(x: number, z: number, yaw: number) {
    const f0 = new THREE.Vector3(), f1 = new THREE.Vector3();
    const [ax, az] = rotY(0.1 * this.def.scale, 0.15 * this.def.scale, yaw);
    const [bx, bz] = rotY(-0.13 * this.def.scale, -0.15 * this.def.scale, yaw);
    f0.set(x + ax, 0, z + az);
    f1.set(x + bx, 0, z + bz);
    this.loco.init([f0, f1], [yaw, yaw - 0.6], yaw);
    this.rootX = x;
    this.rootZ = z;
    this.rootYaw = yaw;
    this.mode = 'loco';
    this.initialized = false;
    this.solveState.reset();
  }

  /** Current world-space ankle ground positions and yaws from the last output. */
  feetWorld(out: [THREE.Vector3, THREE.Vector3], yaws: [number, number]) {
    for (let i = 0; i < 2; i++) {
      const bi = i === 0 ? B.footL : B.footR;
      const p = this.fk.pos[bi];
      const [x, z] = rotY(p.x, p.z, this.rootYaw);
      out[i].set(this.rootX + x, 0, this.rootZ + z);
      _e.setFromQuaternion(this.fk.rot[bi], 'YXZ');
      yaws[i] = this.rootYaw + _e.y;
    }
  }

  /** World position of a bone from the last FK. */
  boneWorld(bone: number, out: THREE.Vector3) {
    const p = this.fk.pos[bone];
    const [x, z] = rotY(p.x, p.z, this.rootYaw);
    return out.set(this.rootX + x, p.y + this.rootY, this.rootZ + z);
  }
  /** World position of a point offset in a bone's local frame. */
  boneLocalToWorld(bone: number, local: THREE.Vector3, out: THREE.Vector3) {
    out.copy(local).applyQuaternion(this.fk.rot[bone]).add(this.fk.pos[bone]);
    const [x, z] = rotY(out.x, out.z, this.rootYaw);
    return out.set(this.rootX + x, out.y + this.rootY, this.rootZ + z);
  }
  /**
   * The floor under the body moved by `dy` in one go (she's stepped up onto a ledge she climbed;
   * a body got up on a different floor): the pose held in the blend moves the other way, so the
   * body itself stays exactly where it is.
   */
  rebase(dy: number) {
    if (!dy) return;
    this.rootY += dy;
    this.out.hips.y -= dy;
    this.prev.hips.y -= dy;
    this.fk.pos.forEach((p) => (p.y -= dy));
    this.prevFk.pos.forEach((p) => (p.y -= dy));
  }
  /** World rotation of a bone. */
  boneWorldRot(bone: number, out: THREE.Quaternion) {
    _q.setFromAxisAngle(_v.set(0, 1, 0), this.rootYaw);
    return out.copy(_q).multiply(this.fk.rot[bone]);
  }

  /** Where the feet stand now (world ankle ground points and yaws), whatever is animating. */
  currentFeet(feet: [THREE.Vector3, THREE.Vector3], yaws: [number, number]) {
    if (this.mode === 'loco') {
      this.loco.footWorld(0, feet[0]);
      this.loco.footWorld(1, feet[1]);
      yaws[0] = this.loco.feet[0].yaw;
      yaws[1] = this.loco.feet[1].yaw;
    } else this.feetWorld(feet, yaws);
  }

  playClip(clip: Clip, opt: PlayOptions = {}): ClipPlayer {
    const p = new ClipPlayer(clip);
    p.ground = this.ground;
    p.speed = opt.speed ?? 1;
    p.aim = opt.aim ?? null;
    p.yScale = opt.yScale ?? 1;
    if (opt.entryHalflife !== undefined) p.entryHalflife = opt.entryHalflife;
    const feet: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
    const yaws: [number, number] = [0, 0];
    this.currentFeet(feet, yaws);
    p.start(
      opt.originX ?? this.rootX,
      opt.originZ ?? this.rootZ,
      opt.originYaw ?? this.rootYaw,
      this.rootX,
      this.rootZ,
      this.rootYaw,
      feet,
      yaws,
      this.def,
    );
    if (opt.startTime) {
      p.advance(opt.startTime);
      p.computeRoot();
    }
    if (this.mode === 'external' || this.mode === 'frozen') this.solveState.reset();
    this.clip = p;
    this.mode = 'clip';
    this.external = null;
    this.beginTransition(opt.halflife ?? 0.08);
    return p;
  }

  toLoco(halflife = 0.1) {
    if (this.mode === 'loco') return;
    const feet: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
    const yaws: [number, number] = [0, 0];
    this.feetWorld(feet, yaws);
    this.loco.init(feet, yaws, this.rootYaw);
    if (this.mode === 'external' || this.mode === 'frozen') this.solveState.reset();
    this.mode = 'loco';
    this.clip = null;
    this.external = null;
    this.beginTransition(halflife);
  }

  toExternal(src: ExternalPose, halflife = 0.06) {
    this.external = src;
    this.mode = 'external';
    this.clip = null;
    this.beginTransition(halflife);
  }

  freeze() {
    this.mode = 'frozen';
    this.clip = null;
    this.external = null;
    this.inertia = false;
  }

  /**
   * Solve the source pose. The solver keeps limbs continuous by letting a bone's roll and bend
   * plane turn only so far per solve; on a new source (a strike handing back to the walk) that
   * catch-up would run on for frames after the blend has measured its offset - an arm rolling a
   * third of a turn at the limit's speed. So a new source is solved until it settles, and the blend
   * absorbs the whole difference.
   */
  private settle(def: SkeletonDef, prm: PoseParams) {
    solvePose(def, prm, this.src, null, this.solveState);
    if (!this.pending) return;
    for (let it = 1; it < SETTLE_SOLVES; it++) {
      this.settleTmp.copy(this.src);
      solvePose(def, prm, this.src, null, this.solveState);
      let moved = 0;
      for (let i = 0; i < BONE_COUNT; i++) moved = Math.max(moved, 1 - Math.abs(this.settleTmp.q[i].dot(this.src.q[i])));
      if (moved < 1e-6) break;
    }
  }
  private settleTmp = new Pose();

  beginTransition(halflife: number) {
    this.pending = true;
    this.pendingHL = halflife;
  }

  /** A bone's output rotation without the layers laid on after the blend (spring, fixed turn). */
  private unlayer(q: THREE.Quaternion, bone: number, springs: THREE.Quaternion[], out: THREE.Quaternion) {
    out.copy(q);
    const pr = this.postRot[bone];
    if (pr) out.multiply(_q2.copy(pr).invert());
    const si = SPRING_OF[bone];
    if (si >= 0) out.premultiply(_q2.copy(springs[si]).invert());
    return out;
  }
  /** The spring turns laid on this frame and the last (so a blend can take them back off). */
  private springQ: THREE.Quaternion[] = [];
  private springQPrev: THREE.Quaternion[] = [];

  /** Inject a hit reaction: force direction in world space, strength ~0..1+, region of impact. */
  hitImpulse(forceWorld: THREE.Vector3, strength: number, region: 'head' | 'chest' | 'gut' | 'legs' | 'back') {
    // world -> root space
    const [fx, fz] = rotY(forceWorld.x, forceWorld.z, -this.rootYaw);
    const f = _v.set(fx, forceWorld.y, fz).normalize();
    // rotation axis: tilt top of bone towards force
    const axis = _v2.set(0, 1, 0).cross(f);
    const w = strength * 9;
    const add = (idx: number, k: number, pitchFlip = false) => {
      const a = axis.clone().multiplyScalar(w * k);
      if (pitchFlip) a.x = Math.abs(a.x) * 1.4 + 0.5 * w * k; // fold forward
      this.sv[idx].add(a);
    };
    switch (region) {
      case 'head':
        add(4, 1.0);
        add(3, 0.6);
        add(2, 0.35);
        add(1, 0.15);
        break;
      case 'chest':
        add(2, 0.7);
        add(1, 0.5);
        add(4, 0.5);
        add(0, 0.2);
        break;
      case 'gut':
        add(1, 0.8, true);
        add(2, 0.5, true);
        add(4, 0.4, true);
        add(0, 0.25);
        break;
      case 'back':
        add(1, 0.7);
        add(2, 0.6);
        add(4, 0.6);
        break;
      case 'legs':
        add(0, 0.6);
        add(1, 0.4);
        add(4, 0.3);
        break;
    }
  }

  /** Lean the body by an acceleration-like push (root-space). */
  nudge(pitch: number, roll: number, yaw = 0) {
    for (let i = 1; i < 4; i++) this.sv[i].add(_v.set(pitch, yaw, roll));
  }

  update(dt: number, rootX: number, rootZ: number, rootYaw: number, rootY = this.rootY) {
    this.rootX = rootX;
    this.rootZ = rootZ;
    this.rootYaw = rootYaw;
    this.rootY = rootY;
    const def = this.def;
    // ---- evaluate source
    switch (this.mode) {
      case 'loco': {
        const li = this.locoIn;
        li.dt = dt;
        li.rootX = rootX;
        li.rootZ = rootZ;
        li.rootYaw = rootYaw;
        this.settle(def, this.loco.update(li, def));
        break;
      }
      case 'clip': {
        if (this.clip) {
          this.clip.rootY = rootY;
          this.settle(def, this.clip.evaluate(def));
        }
        break;
      }
      case 'external':
        this.external?.writePose(def, rootX, rootZ, rootYaw, this.src, this.rootY);
        break;
      case 'frozen':
        return;
    }
    if (!this.initialized) {
      this.out.copy(this.src);
      this.prev.copy(this.src);
      this.initialized = true;
      this.pending = false;
    }
    // ---- inertialization
    if (this.pending) {
      const idt = 1 / Math.max(1e-3, this.lastDt);
      for (let i = 0; i < BONE_COUNT; i++) {
        // measured from what the blend itself put out: the hit springs and fixed turns laid on top
        // go on again every frame, and left in they'd be applied twice from the switch on (a
        // broken forearm jumped its whole 50 degrees at every change of move)
        this.unlayer(this.out.q[i], i, this.springQ, _q3);
        this.unlayer(this.prev.q[i], i, this.springQPrev, _q4);
        _q.copy(this.src.q[i]).invert();
        _q2.copy(_q3).multiply(_q);
        quatToScaledAxis(_q2, this.offR[i]);
        // output angular velocity
        _q.copy(_q4).invert();
        _q2.copy(_q3).multiply(_q);
        quatToScaledAxis(_q2, this.offV[i]).multiplyScalar(idt);
        // clamp crazy velocities
        if (this.offV[i].lengthSq() > 400) this.offV[i].setLength(20);
      }
      this.offH.subVectors(this.out.hips, this.src.hips);
      this.offHV.subVectors(this.out.hips, this.prev.hips).multiplyScalar(idt);
      if (this.offHV.lengthSq() > 25) this.offHV.setLength(5);
      this.halflife = this.pendingHL;
      this.inertia = true;
      this.pending = false;
      this.blendAge = 0;
    }
    this.blendAge += dt;
    this.prev.copy(this.out);
    if (this.inertia) {
      let maxOff = 0;
      const hl = this.halflife;
      for (let i = 0; i < BONE_COUNT; i++) {
        const o = this.offR[i], v = this.offV[i];
        [o.x, v.x] = decaySpring(o.x, v.x, hl, dt);
        [o.y, v.y] = decaySpring(o.y, v.y, hl, dt);
        [o.z, v.z] = decaySpring(o.z, v.z, hl, dt);
        maxOff = Math.max(maxOff, Math.abs(o.x) + Math.abs(o.y) + Math.abs(o.z));
        scaledAxisToQuat(o, _q);
        this.out.q[i].copy(_q).multiply(this.src.q[i]);
      }
      const o = this.offH, v = this.offHV;
      [o.x, v.x] = decaySpring(o.x, v.x, hl, dt);
      [o.y, v.y] = decaySpring(o.y, v.y, hl, dt);
      [o.z, v.z] = decaySpring(o.z, v.z, hl, dt);
      this.out.hips.copy(this.src.hips).add(o);
      if (maxOff < 1e-4 && o.lengthSq() < 1e-8) this.inertia = false;
    } else {
      this.out.copy(this.src);
    }
    // ---- secondary springs
    const k = this.springStiffness;
    const c = 2 * this.springDamping * Math.sqrt(k);
    const steps = dt > 1 / 90 ? 2 : 1;
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < SPRING_BONES.length; i++) {
        const x = this.sx[i], v = this.sv[i];
        v.x += (-k * x.x - c * v.x) * h;
        v.y += (-k * x.y - c * v.y) * h;
        v.z += (-k * x.z - c * v.z) * h;
        x.addScaledVector(v, h);
        const len = x.length();
        if (len > 0.7) x.multiplyScalar(0.7 / len);
      }
    }
    for (let i = 0; i < SPRING_BONES.length; i++) {
      const b = SPRING_BONES[i];
      const x = this.sx[i];
      this.springQPrev[i].copy(this.springQ[i]);
      if (x.lengthSq() < 1e-10) {
        this.springQ[i].identity();
        continue;
      }
      scaledAxisToQuat(x, this.springQ[i]);
      this.out.q[b].premultiply(this.springQ[i]);
    }
    for (let i = 0; i < BONE_COUNT; i++) {
      const pr = this.postRot[i];
      if (pr) this.out.q[i].multiply(pr);
    }
    // ---- leg lock: while the body blends between poses (or sways on its hip spring), the feet
    // the source pose has on the floor stay exactly where it plants them - no skating
    if ((this.mode === 'loco' || this.mode === 'clip') && (this.inertia || this.sx[0].lengthSq() > 1e-6)) this.lockLegs(def);
    // (a zero-time update - a hit-stop frame, a body re-rooted as a ragdoll hands back to a clip -
    // moves nothing: it mustn't shrink the frame time the next blend measures velocity over, which
    // turned a re-rooted pose into a 20 rad/s spin and hips sliding off at 5 m/s, nor count as motion)
    if (dt > 0) this.lastDt = dt;
    else this.prev.copy(this.out);
    const tmp = this.prevFk;
    this.prevFk = this.fk;
    this.fk = tmp;
    this.fk.compute(this.out, def);
    this.model.applyPose(this.out);
  }

  private lockLegs(def: SkeletonDef) {
    const sfk = this.srcFk.compute(this.src, def);
    // (a scratch FK: this.fk still holds last frame's result, which becomes prevFk)
    const ofk = this.lockFk.compute(this.out, def);
    const S = def.scale;
    const L = _lk;
    for (let side = 0; side < 2; side++) {
      const th = side === 0 ? B.thighL : B.thighR;
      const sh = side === 0 ? B.shinL : B.shinR;
      const ft = side === 0 ? B.footL : B.footR;
      const sA = sfk.pos[ft], oA = ofk.pos[ft];
      // floor height under the source foot (bodies on the ground)
      let gy = 0;
      if (this.ground) {
        const [wx, wz] = rotY(sA.x, sA.z, this.rootYaw);
        gy = this.ground(this.rootX + wx, this.rootZ + wz);
      }
      const hs = sA.y - gy - def.ankleHeight, ho = oA.y - gy - def.ankleHeight;
      // only feet the source has on (or just above) the floor, and only once the blended foot is
      // close to it too (a kick blending out comes down first, then locks)
      const w = (1 - smoothstep(0.03 * S, 0.1 * S, hs)) * (1 - smoothstep(0.05 * S, 0.16 * S, ho));
      if (w < 1e-3) continue;
      const P = L.th.copy(ofk.pos[th]);
      const K = ofk.pos[sh];
      L.tgt.copy(oA).lerp(sA, w);
      // keep the blended knee's bend plane
      L.axis.subVectors(oA, P).normalize();
      L.bend.subVectors(K, P);
      L.bend.addScaledVector(L.axis, -L.bend.dot(L.axis));
      if (L.bend.lengthSq() < 1e-10) L.bend.set(0, 0, 1);
      twoBoneIK(P, L.tgt, L.bend, def.lenThigh, def.lenShin, L.mid, L.end, L.b2);
      // minimal rotations from the blended leg onto the re-solved one (identity when nothing moves)
      L.d0.subVectors(K, P).normalize();
      L.d1.subVectors(L.mid, P).normalize();
      L.q1.setFromUnitVectors(L.d0, L.d1);
      const Wth = L.qf.copy(L.q1).multiply(ofk.rot[th]);
      L.inv.copy(ofk.rot[B.hips]).invert();
      this.out.q[th].copy(L.inv).multiply(Wth);
      // shin: follow the thigh, then turn onto the new shin direction
      L.d0.subVectors(oA, K).normalize().applyQuaternion(L.q1);
      L.d1.subVectors(L.end, L.mid).normalize();
      L.q2.setFromUnitVectors(L.d0, L.d1).multiply(L.q1);
      const Wsh = L.q2.multiply(ofk.rot[sh]);
      L.inv.copy(Wth).invert();
      this.out.q[sh].copy(L.inv).multiply(Wsh);
      // foot orientation towards the source's planted foot (eased in as a blend starts: the new
      // source's foot can sit at another angle, and snapping to it turned the foot in one frame)
      const Wft = L.q1.copy(ofk.rot[ft]).slerp(sfk.rot[ft], w * smoothstep(0, 0.12, this.blendAge));
      L.inv.copy(Wsh).invert();
      this.out.q[ft].copy(L.inv).multiply(Wft);
    }
  }

  /** Advance clip time & collect events (call before computing root). */
  advanceClip(dt: number) {
    if (this.mode === 'clip' && this.clip) {
      this.events.length = 0;
      this.clip.advance(dt, this.events);
      this.clip.computeRoot();
    }
  }

  get springEnergy() {
    let e = 0;
    for (const x of this.sx) e += x.length();
    return clamp(e, 0, 10);
  }
}
