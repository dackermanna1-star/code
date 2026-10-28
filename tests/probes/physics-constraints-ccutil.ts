// FPS movement helper on top of PhysicsCharacterController (verified by physics-constraints-cc*.probe.ts).
import { PhysicsCharacterController, CharacterSupportedState, Vector3, type CharacterSurfaceInfo, type Scene, type PhysicsBody } from "@babylonjs/core";

export interface MoveInput {
  forward: number; // -1..1 (W/S)
  right: number; // -1..1 (D/A)
  yaw: number; // camera yaw (rad), 0 = looking +Z, +pi/2 = looking +X
  speed: number; // m/s
  jump: boolean; // edge-triggered
}

export class FpsMover {
  readonly cc: PhysicsCharacterController;
  readonly gravity = new Vector3(0, -9.81, 0);
  readonly up = new Vector3(0, 1, 0);
  jumpHeight = 1.0;
  airSpeedFactor = 0.3; // fraction of ground speed you can steer to while airborne
  /** Steps after a jump during which a SUPPORTED report is ignored (the stale manifold still sees the floor). */
  jumpGraceSteps = 6;
  private sinceJump = 1e9;
  /** True when the last step treated the character as standing on something. */
  grounded = false;
  support: CharacterSurfaceInfo = {
    isSurfaceDynamic: false, supportedState: CharacterSupportedState.UNSUPPORTED,
    averageSurfaceNormal: new Vector3(), averageSurfaceVelocity: new Vector3(), averageAngularSurfaceVelocity: new Vector3(),
  };
  private readonly down = new Vector3(0, -1, 0);
  private readonly fwd = new Vector3();
  private readonly rightV = new Vector3();
  private readonly desired = new Vector3();
  private readonly v = new Vector3();

  constructor(scene: Scene, feet: Vector3, height = 1.8, radius = 0.3) {
    this.cc = new PhysicsCharacterController(feet.add(new Vector3(0, height / 2, 0)), { capsuleHeight: height, capsuleRadius: radius }, scene);
    this.cc.acceleration = 0.35; // fraction of the velocity error removed per step (default 0.05 is floaty)
    this.cc.maxAcceleration = 40; // m/s^2 cap on velocity change (default 50)
  }

  /** One fixed step. Call once per physics step (before or after Havok's step — see notes). */
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
      // re-project onto the horizontal plane so slopes don't slow you down (Babylon playground pattern)
      this.v.subtractInPlace(s.averageSurfaceVelocity);
      if (this.v.dot(this.up) > 1e-3) {
        const len = this.v.length();
        this.v.normalizeFromLength(len);
        const horizLen = len / s.averageSurfaceNormal.dot(this.up);
        const c = s.averageSurfaceNormal.cross(this.v);
        c.cross(this.up).scaleToRef(horizLen, this.v);
      }
      this.v.addInPlace(s.averageSurfaceVelocity);
      if (inp.jump) {
        const u = Math.sqrt(2 * -this.gravity.y * this.jumpHeight);
        this.v.addInPlace(this.up.scale(u - this.v.dot(this.up)));
        this.sinceJump = 0;
      }
    } else {
      this.desired.scaleInPlace(inp.speed * this.airSpeedFactor);
      cc.calculateMovementToRef(dt, this.fwd, this.up, cur, Vector3.ZeroReadOnly, this.desired, this.up, this.v);
      // keep the current vertical velocity, then integrate gravity
      this.v.addInPlace(this.up.scale(cur.dot(this.up) - this.v.dot(this.up)));
      this.v.addInPlace(this.gravity.scale(dt));
    }
    cc.setVelocity(this.v);
    cc.integrate(dt, s, this.gravity);
  }

  get feetY(): number { return this.cc.getPosition().y - this.cc.footOffset; }
}

/** Contacts of the character with something below its centre (from the controller's private manifold). */
export function supportContacts(cc: PhysicsCharacterController, minNormalY = 0.5): { body: PhysicsBody; index: number; point: Vector3; normal: Vector3 }[] {
  const m = (cc as unknown as { _manifold: { position: Vector3; normal: Vector3; bodyB: { body: PhysicsBody; index: number } }[] })._manifold;
  return m.filter((c) => c.normal.y >= minNormalY && c.bodyB).map((c) => ({ body: c.bodyB.body, index: c.bodyB.index, point: c.position.clone(), normal: c.normal.clone() }));
}

/** The controller's internal ANIMATED capsule body (exclude it from your raycasts). */
export function characterBody(cc: PhysicsCharacterController): PhysicsBody {
  return (cc as unknown as { _body: PhysicsBody })._body;
}
