/**
 * Physics ragdoll built from a ZombieBody's current animated pose.
 *  - one Havok body per part (capsules for limbs, boxes for torso/pelvis)
 *  - 6DoF joints with anatomical angular limits (one-way knees/elbows)
 *  - joints can be broken to sever limbs
 * Taking the exact current pose means there is no visible "snap" when a
 * walking zombie turns into a ragdoll.
 */
import {
  Matrix,
  Physics6DoFConstraint,
  PhysicsBody,
  PhysicsConstraintAxis,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeCapsule,
  Quaternion,
  TransformNode,
  Vector3,
  type Physics6DoFLimit,
  type Scene,
} from "@babylonjs/core";
import { CollideWith, Layer } from "../physics/Layers";
import { PARTS, PART_INDEX, type PartId, type ZombieBody } from "./ZombieModel";

type Limits = [number, number, number, number, number, number]; // xMin,xMax,yMin,yMax,zMin,zMax

const JOINT_LIMITS: Partial<Record<PartId, Limits>> = {
  chest: [-0.5, 0.6, -0.4, 0.4, -0.3, 0.3],
  head: [-0.7, 0.6, -0.9, 0.9, -0.4, 0.4],
  upperArmL: [-2.2, 1.2, -0.9, 0.9, -1.6, 0.4],
  upperArmR: [-2.2, 1.2, -0.9, 0.9, -0.4, 1.6],
  foreArmL: [-2.4, 0, 0, 0, 0, 0],
  foreArmR: [-2.4, 0, 0, 0, 0, 0],
  thighL: [-1.7, 0.6, -0.4, 0.4, -0.7, 0.25],
  thighR: [-1.7, 0.6, -0.4, 0.4, -0.25, 0.7],
  shinL: [0, 2.4, 0, 0, 0, 0],
  shinR: [0, 2.4, 0, 0, 0, 0],
};

/** Joints that can be torn off (the child part flies free). */
export const SEVERABLE: PartId[] = ["head", "upperArmL", "upperArmR", "thighL", "thighR", "foreArmL", "foreArmR"];

export class Ragdoll {
  readonly nodes: TransformNode[] = [];
  readonly bodies: PhysicsBody[] = [];
  private constraints: (Physics6DoFConstraint | null)[] = [];
  private shapes: (PhysicsShapeCapsule | PhysicsShapeBox)[] = [];
  age = 0;
  frozen = false;
  sinking = 0;
  severed = new Set<PartId>();

  constructor(
    scene: Scene,
    readonly body: ZombieBody,
    totalMass: number,
    baseVelocity: Vector3,
    spin: Vector3,
  ) {
    const H = body.scale;
    const g = body.def.girth;
    const scl = new Vector3();
    const rot = new Quaternion();
    const pos = new Vector3();
    body.root.computeWorldMatrix(true);
    for (const j of body.joints) j.computeWorldMatrix(true);

    PARTS.forEach((p, i) => {
      const joint = body.joints[i];
      joint.getWorldMatrix().decompose(scl, rot, pos);
      const half = (p.length / 2) * p.dir * H;
      // Body node sits at the part's center with the joint's orientation.
      const node = new TransformNode(`rd_${p.id}`, scene);
      node.rotationQuaternion = rot.clone();
      Vector3.TransformCoordinatesFromFloatsToRef(0, half, 0, joint.getWorldMatrix(), node.position);
      const mesh = body.meshes[i];
      mesh.parent = node;
      mesh.position.set(0, -half, 0);
      this.nodes.push(node);

      const r = p.radius * H * (p.id === "chest" || p.id === "pelvis" ? Math.min(g, 1.6) : Math.min(g, 1.3));
      const L = p.length * H;
      let shape: PhysicsShapeCapsule | PhysicsShapeBox;
      if (p.id === "chest" || p.id === "pelvis") {
        shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(r * 2.2, L, r * 1.4), scene);
      } else if (p.id === "head") {
        shape = new PhysicsShapeCapsule(new Vector3(0, -L * 0.15, 0), new Vector3(0, L * 0.15, 0), r * 1.1, scene);
      } else {
        const a = Math.max(0.01, L / 2 - r);
        shape = new PhysicsShapeCapsule(new Vector3(0, -a, 0), new Vector3(0, a, 0), r, scene);
      }
      shape.filterMembershipMask = Layer.RAGDOLL;
      shape.filterCollideMask = CollideWith.RAGDOLL;
      shape.material = { friction: 0.8, restitution: 0.15 };
      const b = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, scene);
      b.shape = shape;
      b.setMassProperties({ mass: Math.max(1, totalMass * p.mass) });
      b.setLinearDamping(0.05);
      b.setAngularDamping(0.3);
      this.shapes.push(shape);
      this.bodies.push(b);
    });

    // Joints: constraint frame = child's local axes at the joint.
    const invA = new Matrix();
    const axX = new Vector3();
    const axY = new Vector3();
    const jointW = new Vector3();
    PARTS.forEach((p, i) => {
      if (!p.parent) {
        this.constraints.push(null);
        return;
      }
      const pi = PART_INDEX[p.parent];
      const parentNode = this.nodes[pi];
      const childNode = this.nodes[i];
      parentNode.computeWorldMatrix(true);
      childNode.computeWorldMatrix(true);
      jointW.copyFrom(body.joints[i].getAbsolutePosition());
      parentNode.getWorldMatrix().invertToRef(invA);
      const pivotA = Vector3.TransformCoordinates(jointW, invA);
      const pivotB = new Vector3(0, (-p.length / 2) * p.dir * H, 0);
      // Child X/Y axes expressed in the parent's local frame.
      const cw = childNode.getWorldMatrix();
      Vector3.TransformNormalFromFloatsToRef(1, 0, 0, cw, axX);
      Vector3.TransformNormalFromFloatsToRef(0, 1, 0, cw, axY);
      const axisA = Vector3.TransformNormal(axX, invA).normalize();
      const perpA = Vector3.TransformNormal(axY, invA).normalize();
      const lim = JOINT_LIMITS[p.id]!;
      const limits: Physics6DoFLimit[] = [
        { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
        { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: 0, maxLimit: 0 },
        { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
        { axis: PhysicsConstraintAxis.ANGULAR_X, minLimit: lim[0], maxLimit: lim[1] },
        { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: lim[2], maxLimit: lim[3] },
        { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: lim[4], maxLimit: lim[5] },
      ];
      const c = new Physics6DoFConstraint(
        { pivotA, pivotB, axisA, axisB: new Vector3(1, 0, 0), perpAxisA: perpA, perpAxisB: new Vector3(0, 1, 0), collision: false },
        limits,
        scene,
      );
      this.bodies[pi].addConstraint(this.bodies[i], c);
      this.constraints.push(c);
    });

    // Launch: every part inherits the base velocity plus spin around the pelvis.
    const center = this.nodes[0].position;
    const tmp = new Vector3();
    this.bodies.forEach((b, i) => {
      const r = this.nodes[i].position.subtract(center);
      Vector3.CrossToRef(spin, r, tmp);
      b.setLinearVelocity(baseVelocity.add(tmp));
      b.setAngularVelocity(spin);
    });
  }

  /** Tear off the part `id` (and everything below it). Returns joint world position. */
  sever(id: PartId): Vector3 | null {
    const i = PART_INDEX[id];
    const c = this.constraints[i];
    if (!c || this.severed.has(id)) return null;
    this.severed.add(id);
    c.dispose();
    this.constraints[i] = null;
    return this.nodes[i].position.clone();
  }

  /** Impulse on every part (explosions). */
  push(impulse: Vector3, pos: Vector3): void {
    for (const b of this.bodies) b.applyImpulse(impulse.scale(1 / this.bodies.length), pos);
  }

  get pelvis(): Vector3 {
    return this.nodes[0].position;
  }

  /** Stop simulating: dispose bodies but keep the meshes in their final pose. */
  freeze(): void {
    if (this.frozen) return;
    this.frozen = true;
    for (const c of this.constraints) c?.dispose();
    for (const b of this.bodies) b.dispose();
    for (const s of this.shapes) s.dispose();
    this.constraints = [];
    this.bodies.length = 0;
    this.shapes = [];
  }

  dispose(): void {
    this.freeze();
    for (const m of this.body.meshes) m.dispose();
    for (const n of this.nodes) n.dispose();
    this.body.root.dispose();
  }
}
