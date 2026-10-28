// AUTO-EXTRACTED verbatim from docs/api-notes/physics-constraints-character.md (do not edit by hand).

import { Vector3, Quaternion, TransformNode, PhysicsBody, PhysicsShapeSphere, PhysicsMotionType, Physics6DoFConstraint,
  PhysicsConstraintAxis, PhysicsConstraintMotorType, PhysicsCharacterController, CharacterSupportedState, PhysicsShapeCapsule, ProximityCastResult,
  type Scene, type HavokPlugin, type PhysicsConstraint, type CharacterSurfaceInfo } from "@babylonjs/core";
import type { HavokPhysicsWithBindings } from "@babylonjs/havok";


const LIN = [PhysicsConstraintAxis.LINEAR_X, PhysicsConstraintAxis.LINEAR_Y, PhysicsConstraintAxis.LINEAR_Z];
const ANG = [PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxis.ANGULAR_Y, PhysicsConstraintAxis.ANGULAR_Z];

export class GrabJoint {
  readonly anchor: PhysicsBody;                       // persistent, ANIMATED, collides with nothing
  joint: Physics6DoFConstraint | null = null;
  held: PhysicsBody | null = null;
  liftN = 450; pushN = 300; holdTorqueNm = 60;        // holdTorqueNm 0 => object hangs from the grab point
  private readonly scene: Scene; private readonly hk: HavokPhysicsWithBindings; private readonly dt: number;
  constructor(scene: Scene) {
    this.scene = scene;
    const plugin = scene.getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin;
    this.hk = plugin._hknp as HavokPhysicsWithBindings;
    this.dt = plugin.getTimeStep();
    const n = new TransformNode("grabAnchor", scene);
    n.position.set(0, -50, 0); n.rotationQuaternion = Quaternion.Identity(); n.computeWorldMatrix(true);
    this.anchor = new PhysicsBody(n, PhysicsMotionType.ANIMATED, false, scene);
    const s = new PhysicsShapeSphere(Vector3.Zero(), 0.01, scene);
    s.filterMembershipMask = 0; s.filterCollideMask = 0;
    this.anchor.shape = s;
  }
  /** Grab DYNAMIC `body` at world point `p`; `rot` = anchor rotation (camera yaw only, so the Y cap stays vertical). */
  grab(body: PhysicsBody, p: Vector3, rot: Quaternion): void {
    this.release();
    const n = body.transformNode, inv = Quaternion.Inverse(n.rotationQuaternion!);
    const pivotB = p.subtract(n.position).applyRotationQuaternion(inv);
    const ax = new Vector3(1, 0, 0).applyRotationQuaternion(rot).applyRotationQuaternion(inv);
    const ay = new Vector3(0, 1, 0).applyRotationQuaternion(rot).applyRotationQuaternion(inv);
    const an = this.anchor.transformNode;               // teleport the anchor onto the grab point (zero initial error)
    an.position.copyFrom(p); an.rotationQuaternion!.copyFrom(rot);
    this.hk.HP_Body_SetQTransform(this.anchor._pluginData.hpBodyId, [[p.x, p.y, p.z], [rot.x, rot.y, rot.z, rot.w]]);
    const c = new Physics6DoFConstraint({ pivotA: Vector3.Zero(), pivotB, axisA: new Vector3(1, 0, 0), perpAxisA: new Vector3(0, 1, 0),
      axisB: ax, perpAxisB: ay }, [], this.scene);
    this.anchor.addConstraint(body, c);                 // setters only after this
    const caps = [this.pushN, this.liftN, this.pushN];  // anchor-frame X, Y (up), Z
    LIN.forEach((a, i) => { c.setAxisMotorType(a, PhysicsConstraintMotorType.POSITION); c.setAxisMotorTarget(a, 0); c.setAxisMotorMaxForce(a, caps[i]); });
    if (this.holdTorqueNm > 0) for (const a of ANG) { c.setAxisMotorType(a, PhysicsConstraintMotorType.POSITION); c.setAxisMotorTarget(a, 0); c.setAxisMotorMaxForce(a, this.holdTorqueNm); }
    this.joint = c; this.held = body;
  }
  /** Every fixed step BEFORE the physics step: where the grab point should be (and the camera yaw). */
  update(target: Vector3, rot: Quaternion): void { this.anchor.setTargetTransform(target, rot); }
  /** R + mouse: rotate the held object relative to the anchor (radians). */
  setRotation(pitch: number, yaw: number): void {
    this.joint?.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, pitch);
    this.joint?.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_Y, yaw);
  }
  /** Force (N, world) the hand applied to the held body during the last step -> bond stress / destruction.pull(). */
  force(): Vector3 {
    const ids = (this.joint as unknown as { _pluginData?: [bigint][] } | null)?._pluginData;
    if (!ids || ids.length === 0) return Vector3.Zero();
    const l = this.hk.HP_Constraint_GetAppliedImpulses(ids[0])[1];
    return new Vector3(l[0], l[1], l[2]).scaleInPlace(1 / this.dt);
  }
  release(): void { this.joint?.dispose(); this.joint = null; this.held = null; }
}
// STATIC or world-anchored islands: no joint (it would apply 0 N). Pull force for destruction.pull():
//   d = target - grabPoint;  F = d.normalize() * Math.min(maxPullN, kPull * |d|)   (e.g. kPull 2000 N/m, maxPullN 450)


export interface MoveInput { forward: number; right: number; yaw: number /* 0 = +Z, pi/2 = +X */; speed: number; jump: boolean }

export class FpsMover {
  readonly cc: PhysicsCharacterController;
  readonly gravity = new Vector3(0, -9.81, 0);
  readonly up = new Vector3(0, 1, 0);
  jumpHeight = 1.0;
  airSpeedFactor = 0.3;
  jumpGraceSteps = 6;          // ignore SUPPORTED right after a jump (stale manifold still sees the floor)
  grounded = false;
  landingSpeed = 0;            // m/s on the landing step (stomps), else 0
  support: CharacterSurfaceInfo = { isSurfaceDynamic: false, supportedState: CharacterSupportedState.UNSUPPORTED,
    averageSurfaceNormal: new Vector3(), averageSurfaceVelocity: new Vector3(), averageAngularSurfaceVelocity: new Vector3() };
  private sinceJump = 1e9;
  private readonly down = new Vector3(0, -1, 0); private readonly fwd = new Vector3(); private readonly rightV = new Vector3();
  private readonly desired = new Vector3(); private readonly v = new Vector3();

  constructor(scene: Scene, feet: Vector3, height = 1.8, radius = 0.3) {
    this.cc = new PhysicsCharacterController(feet.add(new Vector3(0, height / 2, 0)), { capsuleHeight: height, capsuleRadius: radius }, scene);
    this.cc.acceleration = 0.35;      // default 0.05 is floaty
    this.cc.maxAcceleration = 40;
    this.cc.keepDistance = 0.02;      // hover 2–5 cm instead of 5–15 cm
    this.cc.keepContactTolerance = 0.03;
    this.cc.characterStrength = 600;  // N: pushes light things, blocked by heavy ones
    this.cc.characterMass = 80;       // kg pressing on dynamic supports
    // optional (verified with keepDistance 0.02): this.cc.maxStepHeight = 0.35 -> also climbs 20 cm steps (not 35 cm)
  }

  /** Once per fixed step, e.g. in player.fixedUpdate() before the Havok step (after it works too). */
  step(dt: number, inp: MoveInput): void {
    const cc = this.cc;
    cc.checkSupportToRef(dt, this.down, this.support);
    const s = this.support;
    this.fwd.set(Math.sin(inp.yaw), 0, Math.cos(inp.yaw));
    this.rightV.set(Math.cos(inp.yaw), 0, -Math.sin(inp.yaw));
    this.desired.copyFrom(this.fwd).scaleInPlace(inp.forward).addInPlace(this.rightV.scale(inp.right));
    const l = this.desired.length();
    if (l > 1) this.desired.scaleInPlace(1 / l);
    const cur = cc.getVelocity();
    this.sinceJump++;
    this.grounded = s.supportedState === CharacterSupportedState.SUPPORTED && (this.sinceJump > this.jumpGraceSteps || cur.y <= 0);
    if (this.grounded) {
      this.desired.scaleInPlace(inp.speed);
      cc.calculateMovementToRef(dt, this.fwd, s.averageSurfaceNormal, cur, s.averageSurfaceVelocity, this.desired, this.up, this.v);
      this.v.subtractInPlace(s.averageSurfaceVelocity);               // keep horizontal speed on slopes (Babylon PG pattern)
      if (this.v.dot(this.up) > 1e-3) {
        const len = this.v.length();
        this.v.normalizeFromLength(len);
        const horizLen = len / s.averageSurfaceNormal.dot(this.up);
        s.averageSurfaceNormal.cross(this.v).cross(this.up).scaleToRef(horizLen, this.v);
      }
      this.v.addInPlace(s.averageSurfaceVelocity);
      if (inp.jump) {
        this.v.addInPlace(this.up.scale(Math.sqrt(2 * -this.gravity.y * this.jumpHeight) - this.v.dot(this.up)));
        this.sinceJump = 0;
      }
    } else {
      this.desired.scaleInPlace(inp.speed * this.airSpeedFactor);
      cc.calculateMovementToRef(dt, this.fwd, this.up, cur, Vector3.ZeroReadOnly, this.desired, this.up, this.v);
      this.v.addInPlace(this.up.scale(cur.dot(this.up) - this.v.dot(this.up)));   // keep vertical velocity
      this.v.addInPlace(this.gravity.scale(dt));
    }
    const vyRequested = this.v.y;
    cc.setVelocity(this.v);
    cc.integrate(dt, s, this.gravity);
    this.landingSpeed = vyRequested < -1 && cc.getVelocity().y > vyRequested * 0.5 ? -vyRequested : 0;
  }
  get feetY(): number { return this.cc.getPosition().y - this.cc.footOffset; }
}

/** What the character stands on (footstep material, stomp target): contacts from the private manifold. */
export function supportContacts(cc: PhysicsCharacterController, minNormalY = 0.5) {
  const m = (cc as unknown as { _manifold: { position: Vector3; normal: Vector3; bodyB: { body: PhysicsBody; index: number } }[] })._manifold;
  return m.filter((c) => c.normal.y >= minNormalY && c.bodyB)
    .map((c) => ({ body: c.bodyB.body, index: c.bodyB.index, point: c.position.clone(), normal: c.normal.clone() }));
}
/** The controller's own ANIMATED capsule body (ignore it in raycasts/sweeps/proximity queries). */
export function characterBody(cc: PhysicsCharacterController): PhysicsBody { return (cc as unknown as { _body: PhysicsBody })._body; }

export function makeJointLoad(scene: Scene) {
const hk = (scene.getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin)._hknp as HavokPhysicsWithBindings;
return function jointLoad(c: PhysicsConstraint, dt: number): { lin: Vector3; ang: Vector3 } | null {  // N, N*m on the child
  const ids = (c as unknown as { _pluginData: [bigint][] })._pluginData;
  if (!ids || ids.length === 0) return null;                       // not added yet / disposed
  const [, l, a] = hk.HP_Constraint_GetAppliedImpulses(ids[0]);
  return { lin: new Vector3(l[0], l[1], l[2]).scaleInPlace(1 / dt), ang: new Vector3(a[0], a[1], a[2]).scaleInPlace(1 / dt) };
}

}

// headroom check before standing up (verified): capsule of standing size, 1 cm above the feet
export function makeCrouch(scene: Scene, plugin: HavokPlugin, mover: FpsMover, Layer: { PLAYER: number; STATIC: number; DYNAMIC: number }) {
const standProbe = new PhysicsShapeCapsule(new Vector3(0, 0.6, 0), new Vector3(0, -0.6, 0), 0.3, scene); // 1.8 m tall, r 0.3
standProbe.filterMembershipMask = Layer.PLAYER; standProbe.filterCollideMask = Layer.STATIC | Layer.DYNAMIC;
function canStand(): boolean {
  const pos = mover.cc.getPosition(), feet = pos.y - mover.cc.footOffset;
  const a = new ProximityCastResult(), b = new ProximityCastResult();
  plugin.shapeProximity({ shape: standProbe, position: new Vector3(pos.x, feet + 0.9 + 0.01, pos.z), rotation: Quaternion.Identity(),
    maxDistance: 0, shouldHitTriggers: false, ignoreBody: characterBody(mover.cc) }, a, b);
  return !b.hasHit;
}
return { canStand, crouch: () => mover.cc.setShapeOptions({ capsuleHeight: 1.1, capsuleRadius: 0.3 }), stand: () => { if (canStand()) { mover.cc.setShapeOptions({ capsuleHeight: 1.8, capsuleRadius: 0.3 }); return true; } return false; } };
}
