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
}

interface Part {
  name: string;
  bone: THREE.Object3D;
  body: CANNON.Body;
  spec: BoneSpec;
}

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
        allowSleep: true,
        sleepSpeedLimit: 0.12,
        sleepTimeLimit: 0.6,
      });
      addShape(body, spec, _s.x);
      body.collisionFilterGroup = bit;
      body.collisionFilterMask = GROUP_GROUND | (0x1fe & ~bit) | GROUP_DEBRIS;
      physics.world.addBody(body);
      const part = { name, bone, body, spec };
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
      const axisB = new CANNON.Vec3(...j.axis);
      axisB.normalize();
      const axisWorld = part.body.quaternion.vmult(axisB);
      const axisA = parent.body.quaternion.inverse().vmult(axisWorld);
      let c: CANNON.Constraint;
      if (j.kind === 'hinge') {
        c = new CANNON.HingeConstraint(parent.body, part.body, {
          pivotA,
          pivotB: new CANNON.Vec3(0, 0, 0),
          axisA,
          axisB,
          collideConnected: false,
          maxForce: 1e6,
        });
      } else {
        c = new CANNON.ConeTwistConstraint(parent.body, part.body, {
          pivotA,
          pivotB: new CANNON.Vec3(0, 0, 0),
          axisA,
          axisB,
          angle: j.cone ?? 0.6,
          twistAngle: j.twist ?? 0.4,
          collideConnected: false,
          maxForce: 1e6,
        });
      }
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
      const im = opts.impulse;
      const target = (im.bone && this.parts.find((p) => p.name === im.bone)) || this.closestPart(im.point);
      if (target) {
        const total = this.parts.reduce((a, p) => a + p.body.mass, 0);
        // Share the momentum: the hit part gets most of it, the body follows through joints.
        const J = im.speed * Math.min(total, target.body.mass * 3);
        target.body.applyImpulse(
          new CANNON.Vec3(im.dir.x * J, im.dir.y * J, im.dir.z * J),
          new CANNON.Vec3(im.point.x, im.point.y, im.point.z),
        );
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
    let moving = false;
    for (const p of this.order) {
      const b = p.body;
      // Clamp runaway spin / speed (joint explosions).
      const av = b.angularVelocity;
      const al = av.length();
      if (al > 30) av.scale(30 / al, av);
      const lv = b.velocity;
      const ll = lv.length();
      if (ll > 40) lv.scale(40 / ll, lv);
      if (b.sleepState !== CANNON.Body.SLEEPING && (ll > 0.25 || al > 0.6)) moving = true;

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
    if ((this.stillTime > 0.5 && this.age > 1.0) || this.age > 9) this.freeze();
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
    // Capsule = cylinder + two spheres along the axis.
    const r = Math.max(0.02, sz[0]);
    const hl = Math.max(0.01, sz[1]);
    const axis = spec.axis ?? 'y';
    const q = new CANNON.Quaternion();
    if (axis === 'x') q.setFromEuler(0, 0, Math.PI / 2);
    else if (axis === 'z') q.setFromEuler(Math.PI / 2, 0, 0);
    body.addShape(new CANNON.Cylinder(r, r, hl * 2, 8), off, q);
    const d = axis === 'x' ? new CANNON.Vec3(hl, 0, 0) : axis === 'z' ? new CANNON.Vec3(0, 0, hl) : new CANNON.Vec3(0, hl, 0);
    body.addShape(new CANNON.Sphere(r), off.vadd(d));
    body.addShape(new CANNON.Sphere(r), off.vsub(d));
  }
}
