import * as THREE from 'three';
import { B, BONE_COUNT, SkeletonDef } from './skeleton';
import { Pose, PoseFK } from './pose';
import { solvePose } from './solver';
import { Locomotion, LocoInput } from './locomotion';
import { AimProvider, Clip, ClipEvent, ClipPlayer } from './clip';
import { decaySpring, quatToScaledAxis, rotY, scaledAxisToQuat, clamp } from '../core/math';
import { CharacterModel } from '../character/library';

export type AnimMode = 'loco' | 'clip' | 'external' | 'frozen';

/** A pose provider outside the clip/loco systems (ragdoll, corpse). */
export interface ExternalPose {
  /** Write joint-space pose relative to the given root. */
  writePose(def: SkeletonDef, rootX: number, rootZ: number, rootYaw: number, out: Pose): void;
}

const SPRING_BONES = [B.hips, B.spine, B.chest, B.neck, B.head];

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _e = new THREE.Euler();

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
  private lastDt = 1 / 60;
  // secondary springs (scaled-axis in parent frame)
  private sx: THREE.Vector3[] = [];
  private sv: THREE.Vector3[] = [];
  springStiffness = 230;
  springDamping = 0.42;
  /** Extra per-bone local rotation overrides (e.g. broken limbs), applied post. */
  postRot: (THREE.Quaternion | null)[] = new Array(BONE_COUNT).fill(null);
  initialized = false;

  constructor(public def: SkeletonDef, public model: CharacterModel) {
    for (let i = 0; i < BONE_COUNT; i++) {
      this.offR.push(new THREE.Vector3());
      this.offV.push(new THREE.Vector3());
    }
    for (let i = 0; i < SPRING_BONES.length; i++) {
      this.sx.push(new THREE.Vector3());
      this.sv.push(new THREE.Vector3());
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
    return out.set(this.rootX + x, p.y, this.rootZ + z);
  }
  /** World position of a point offset in a bone's local frame. */
  boneLocalToWorld(bone: number, local: THREE.Vector3, out: THREE.Vector3) {
    out.copy(local).applyQuaternion(this.fk.rot[bone]).add(this.fk.pos[bone]);
    const [x, z] = rotY(out.x, out.z, this.rootYaw);
    return out.set(this.rootX + x, out.y, this.rootZ + z);
  }
  /** World rotation of a bone. */
  boneWorldRot(bone: number, out: THREE.Quaternion) {
    _q.setFromAxisAngle(_v.set(0, 1, 0), this.rootYaw);
    return out.copy(_q).multiply(this.fk.rot[bone]);
  }

  playClip(clip: Clip, opt: PlayOptions = {}): ClipPlayer {
    const p = new ClipPlayer(clip);
    p.speed = opt.speed ?? 1;
    p.aim = opt.aim ?? null;
    if (opt.entryHalflife !== undefined) p.entryHalflife = opt.entryHalflife;
    const feet: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
    const yaws: [number, number] = [0, 0];
    if (this.mode === 'loco') {
      this.loco.footWorld(0, feet[0]);
      this.loco.footWorld(1, feet[1]);
      yaws[0] = this.loco.feet[0].yaw;
      yaws[1] = this.loco.feet[1].yaw;
    } else this.feetWorld(feet, yaws);
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

  beginTransition(halflife: number) {
    this.pending = true;
    this.pendingHL = halflife;
  }

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

  update(dt: number, rootX: number, rootZ: number, rootYaw: number) {
    this.rootX = rootX;
    this.rootZ = rootZ;
    this.rootYaw = rootYaw;
    const def = this.def;
    // ---- evaluate source
    switch (this.mode) {
      case 'loco': {
        const li = this.locoIn;
        li.dt = dt;
        li.rootX = rootX;
        li.rootZ = rootZ;
        li.rootYaw = rootYaw;
        const prm = this.loco.update(li, def);
        solvePose(def, prm, this.src);
        break;
      }
      case 'clip': {
        if (this.clip) {
          const prm = this.clip.evaluate(def);
          solvePose(def, prm, this.src);
        }
        break;
      }
      case 'external':
        this.external?.writePose(def, rootX, rootZ, rootYaw, this.src);
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
        _q.copy(this.src.q[i]).invert();
        _q2.copy(this.out.q[i]).multiply(_q);
        quatToScaledAxis(_q2, this.offR[i]);
        // output angular velocity
        _q.copy(this.prev.q[i]).invert();
        _q2.copy(this.out.q[i]).multiply(_q);
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
    }
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
      if (x.lengthSq() < 1e-10) continue;
      scaledAxisToQuat(x, _q);
      this.out.q[b].premultiply(_q);
    }
    for (let i = 0; i < BONE_COUNT; i++) {
      const pr = this.postRot[i];
      if (pr) this.out.q[i].multiply(pr);
    }
    this.lastDt = dt;
    const tmp = this.prevFk;
    this.prevFk = this.fk;
    this.fk = tmp;
    this.fk.compute(this.out, def);
    this.model.applyPose(this.out);
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
