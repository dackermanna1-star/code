// Articulated ragdolls built from a rig's BoneSpec table.
//
// Every bone listed in `rig.spec` becomes a rigid body whose frame equals the
// bone's world frame (the bone origin is the joint pivot). Joints connect each
// body to its nearest ancestor body: cone-twist with limits, or hinges.
// After the bodies settle the ragdoll is frozen: bodies are removed from the
// simulation and the meshes stay where they lie, like the original's corpses.
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import type { BoneSpec, CreatureRig } from './models/types';
import { GROUP_DEBRIS, GROUP_GROUND, Physics } from './Physics';

export interface RagdollOptions {
  /** Initial linear velocity for all bodies (creature momentum). */
  velocity?: THREE.Vector3;
  /** Impulse applied at a world point (bullet / kick). */
  impulse?: { point: THREE.Vector3; dir: THREE.Vector3; speed: number; bone?: string };
  /** Bones to tear off (gib/head-off): their joint to the parent is not created. */
  detach?: Set<string>;
  /** Extra random spin/velocity for detached parts. */
  detachSpeed?: number;
  /** Explosion origin, pushes everything away and up. */
  blast?: { point: THREE.Vector3; speed: number };
  /** Collide with the ice only (e.g. a cub dropped from its carrier's arms). */
  groundOnly?: boolean;
}

interface Part {
  name: string;
  bone: THREE.Object3D;
  body: CANNON.Body;
  spec: BoneSpec;
  /** Long axis in body space (twist around it is invisible), or null. */
  axis: CANNON.Vec3 | null;
}

function longAxis(spec: BoneSpec): CANNON.Vec3 | null {
  if (spec.shape === 'capsule') {
    const a = spec.axis ?? 'y';
    return new CANNON.Vec3(a === 'x' ? 1 : 0, a === 'y' ? 1 : 0, a === 'z' ? 1 : 0);
  }
  if (spec.shape === 'box') {
    const [x, y, z] = spec.size;
    const m = Math.max(x, y, z);
    if (m < 1.6 * Math.min(x, y, z)) return null;
    return new CANNON.Vec3(m === x ? 1 : 0, m === y && m !== x ? 1 : 0, m === z && m !== x && m !== y ? 1 : 0);
  }
  return null;
}
const _w = new CANNON.Vec3();
const _a = new CANNON.Vec3();

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _pm = new THREE.Matrix4();

export class Ragdoll {
  readonly parts: Part[] = [];
  private constraints: CANNON.Constraint[] = [];
  private order: Part[] = [];
  frozen = false;
  age = 0;
  private stillTime = 0;
  private calmed = false;
  private sampleT = 0;
  private samples: CANNON.Vec3[] = [];
  private calmSamples = 0;
  /** Called once when the ragdoll settles. */
  onFrozen: ((r: Ragdoll) => void) | null = null;
  /** Called when a body falls into the sea. */
  onSink: ((p: Part) => void) | null = null;
  readonly sunk = new Set<string>();

  constructor(private physics: Physics, readonly rig: CreatureRig, opts: RagdollOptions = {}) {
    const root = rig.root;
    root.updateMatrixWorld(true);
    const bit = physics.takeBit();
    const names = Object.keys(rig.spec);
    const byBone = new Map<THREE.Object3D, Part>();

    for (const name of names) {
      const bone = rig.bones.get(name);
      if (!bone) continue;
      const spec = rig.spec[name];
      bone.matrixWorld.decompose(_v, _q, _s);
      const body = new CANNON.Body({
        mass: spec.mass,
        material: physics.fleshMat,
        position: new CANNON.Vec3(_v.x, _v.y, _v.z),
        quaternion: new CANNON.Quaternion(_q.x, _q.y, _q.z, _q.w),
        linearDamping: 0.08,
        angularDamping: 0.45,
        // cannon-es does not wake bodies through constraints, so jointed parts
        // must never sleep individually (they would hang in mid-air). The
        // ragdoll freezes as a whole in sync() instead.
        allowSleep: false,
      });
      addShape(body, spec, _s.x);
      body.collisionFilterGroup = bit;
      body.collisionFilterMask = opts.groundOnly ? GROUP_GROUND : GROUP_GROUND | (0x1fe & ~bit) | GROUP_DEBRIS;
      physics.world.addBody(body);
      const part = { name, bone, body, spec, axis: longAxis(spec) };
      this.parts.push(part);
      byBone.set(bone, part);
    }

    // Joints to the nearest ancestor body.
    for (const part of this.parts) {
      const j = part.spec.joint;
      if (!j) continue;
      if (opts.detach?.has(part.name)) continue;
      let anc = part.bone.parent;
      let parent: Part | undefined;
      while (anc && !(parent = byBone.get(anc))) anc = anc.parent;
      if (!parent) continue;
      const pivotWorld = new CANNON.Vec3(part.body.position.x, part.body.position.y, part.body.position.z);
      const pivotA = parent.body.pointToLocalFrame(pivotWorld);
      // cannon-es hinges have no limits and fight neighbouring cone joints
      // (legs end up jittering forever), so knees/elbows become tight
      // cone-twist joints around the limb direction instead.
      const hinge = j.kind === 'hinge';
      const axisB = hinge ? new CANNON.Vec3(...part.spec.offset) : new CANNON.Vec3(...j.axis);
      if (axisB.lengthSquared() < 1e-8) axisB.set(0, -1, 0);
      axisB.normalize();
      const axisWorld = part.body.quaternion.vmult(axisB);
      const axisA = parent.body.quaternion.inverse().vmult(axisWorld);
      const c = new CANNON.ConeTwistConstraint(parent.body, part.body, {
        pivotA,
        pivotB: new CANNON.Vec3(0, 0, 0),
        axisA,
        axisB,
        angle: hinge ? 0.75 : (j.cone ?? 0.6),
        // cannon-es measures twist from tangents derived independently for each
        // body, so the rest pose can start "over" the limit and the solver then
        // fights it forever. Leave twist free; damping keeps it calm.
        twistAngle: Math.PI,
        collideConnected: false,
        maxForce: 1e6,
      });
      physics.world.addConstraint(c);
      this.constraints.push(c);
    }

    // Order parts parent-first so local transforms can be rebuilt top-down.
    const depth = (o: THREE.Object3D) => {
      let d = 0;
      for (let p = o.parent; p; p = p.parent) d++;
      return d;
    };
    this.order = [...this.parts].sort((a, b) => depth(a.bone) - depth(b.bone));

    // Initial velocities.
    const v = opts.velocity;
    for (const p of this.parts) {
      if (v) p.body.velocity.set(v.x, v.y, v.z);
      if (opts.detach?.has(p.name)) {
        const s = opts.detachSpeed ?? 4;
        p.body.velocity.x += (Math.random() - 0.7) * s;
        p.body.velocity.y += 2 + Math.random() * s;
        p.body.velocity.z += (Math.random() - 0.5) * s;
        p.body.angularVelocity.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
      }
    }
    if (opts.impulse) {
      // The hit part takes the full velocity change, the rest of the body
      // follows with part of it — a believable knock-back without
      // overloading the joints.
      const im = opts.impulse;
      const target = (im.bone && this.parts.find((p) => p.name === im.bone)) || this.closestPart(im.point);
      for (const p of this.parts) {
        const k = p === target ? 1 : opts.detach?.has(p.name) ? 0.8 : 0.5;
        p.body.velocity.x += im.dir.x * im.speed * k;
        p.body.velocity.y += im.dir.y * im.speed * k;
        p.body.velocity.z += im.dir.z * im.speed * k;
      }
      if (target) {
        // A little spin from an off-centre hit.
        const r = new CANNON.Vec3(im.point.x - target.body.position.x, im.point.y - target.body.position.y, im.point.z - target.body.position.z);
        const w = r.cross(new CANNON.Vec3(im.dir.x, im.dir.y, im.dir.z));
        target.body.angularVelocity.vadd(w.scale(im.speed * 2, w), target.body.angularVelocity);
      }
    }
    if (opts.blast) {
      const b = opts.blast;
      for (const p of this.parts) {
        const dx = p.body.position.x - b.point.x;
        const dz = p.body.position.z - b.point.z;
        const l = Math.hypot(dx, dz) || 1;
        p.body.velocity.x += (dx / l) * b.speed * (0.7 + Math.random() * 0.6);
        p.body.velocity.z += (dz / l) * b.speed * (0.7 + Math.random() * 0.6);
        p.body.velocity.y += b.speed * (0.6 + Math.random() * 0.6);
        p.body.angularVelocity.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
      }
    }
  }

  closestPart(pt: THREE.Vector3): Part | undefined {
    let best: Part | undefined;
    let bd = Infinity;
    for (const p of this.parts) {
      const d = _v.set(p.body.position.x, p.body.position.y, p.body.position.z).distanceToSquared(pt);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** Copy body transforms to bones. */
  sync(dt: number): void {
    if (this.frozen) return;
    this.age += dt;
    // Calm joint jitter once the body has had time to land.
    if (this.age > 1.6 && !this.calmed) {
      this.calmed = true;
      for (const p of this.parts) {
        p.body.linearDamping = 0.35;
        p.body.angularDamping = 0.85;
      }
    }
    let moving = false;
    for (const p of this.order) {
      const b = p.body;
      // Clamp runaway spin / speed (joint explosions).
      const av = b.angularVelocity;
      const al = av.length();
      if (al > 25) av.scale(25 / al, av);
      const lv = b.velocity;
      const ll = lv.length();
      if (ll > 18) lv.scale(18 / ll, lv);
      // Spin around a limb's own long axis is invisible; damp it and ignore it.
      let visibleSpin = al;
      if (p.axis) {
        b.quaternion.vmult(p.axis, _a);
        const along = av.dot(_a);
        if (this.calmed) av.vsub(_a.scale(along * 0.3, _w), av);
        visibleSpin = Math.sqrt(Math.max(0, al * al - along * along));
      }
      if (ll > 0.3 || visibleSpin > 1.0) moving = true;

      if (b.position.y < -2.5 && !this.sunk.has(p.name)) {
        this.sunk.add(p.name);
        this.onSink?.(p);
      }

      _m.compose(
        _v.set(b.position.x, b.position.y, b.position.z),
        _q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w),
        p.bone.getWorldScale(_s),
      );
      const parent = p.bone.parent;
      if (parent) {
        parent.updateWorldMatrix(true, false);
        _pm.copy(parent.matrixWorld).invert();
        _m.premultiply(_pm);
      }
      _m.decompose(p.bone.position, p.bone.quaternion, p.bone.scale);
      p.bone.updateMatrixWorld(true);
    }
    this.stillTime = moving ? 0 : this.stillTime + dt;
    // Positional settle test (robust against joint twitching in place):
    // every 0.25 s compare collider centres with the previous sample.
    this.sampleT += dt;
    if (this.sampleT >= 0.25) {
      this.sampleT = 0;
      let maxMove = 0;
      for (let i = 0; i < this.parts.length; i++) {
        const b = this.parts[i].body;
        const o = this.parts[i].spec.offset;
        const c = b.pointToWorldFrame(new CANNON.Vec3(o[0], o[1], o[2]));
        const prev = this.samples[i];
        if (prev) maxMove = Math.max(maxMove, prev.distanceTo(c));
        this.samples[i] = c;
      }
      this.calmSamples = this.age > 0.8 && maxMove < 0.035 ? this.calmSamples + 1 : 0;
    }
    if ((this.stillTime > 0.5 && this.age > 1.0) || this.calmSamples >= 2 || this.age > 8) this.freeze();
  }

  /** Remove from the simulation; meshes stay put. */
  freeze(): void {
    if (this.frozen) return;
    this.frozen = true;
    for (const c of this.constraints) this.physics.world.removeConstraint(c);
    for (const p of this.parts) this.physics.world.removeBody(p.body);
    this.constraints.length = 0;
    this.onFrozen?.(this);
  }

  /** Lowest body (for blood pools). */
  centre(out = new THREE.Vector3()): THREE.Vector3 {
    out.set(0, 0, 0);
    let m = 0;
    for (const p of this.parts) {
      out.x += p.body.position.x * p.body.mass;
      out.y += p.body.position.y * p.body.mass;
      out.z += p.body.position.z * p.body.mass;
      m += p.body.mass;
    }
    return out.multiplyScalar(1 / Math.max(1e-6, m));
  }

  get speed(): number {
    let s = 0;
    for (const p of this.parts) s = Math.max(s, p.body.velocity.length());
    return s;
  }

  dispose(): void {
    this.freeze();
  }
}

function addShape(body: CANNON.Body, spec: BoneSpec, scale: number): void {
  const off = new CANNON.Vec3(spec.offset[0] * scale, spec.offset[1] * scale, spec.offset[2] * scale);
  const sz = spec.size.map((v) => v * scale);
  if (spec.shape === 'sphere') {
    body.addShape(new CANNON.Sphere(Math.max(0.02, sz[0])), off);
  } else if (spec.shape === 'box') {
    body.addShape(new CANNON.Box(new CANNON.Vec3(Math.max(0.02, sz[0]), Math.max(0.02, sz[1]), Math.max(0.02, sz[2]))), off);
  } else {
    // Capsule = a chain of overlapping spheres along the axis. Sphere-box
    // contacts are far more stable in cannon-es than cylinder (convex) ones,
    // which made thin limbs twitch on the ice forever.
    const r = Math.max(0.02, sz[0]);
    const hl = Math.max(0.01, sz[1]);
    const axis = spec.axis ?? 'y';
    const d = axis === 'x' ? new CANNON.Vec3(1, 0, 0) : axis === 'z' ? new CANNON.Vec3(0, 0, 1) : new CANNON.Vec3(0, 1, 0);
    const n = Math.max(2, Math.ceil((2 * hl) / r)) + 1;
    for (let i = 0; i < n; i++) {
      const t = -hl + (2 * hl * i) / (n - 1);
      body.addShape(new CANNON.Sphere(r), off.vadd(d.scale(t)));
    }
  }
}
