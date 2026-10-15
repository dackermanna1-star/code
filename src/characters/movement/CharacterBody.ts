// Physics body of a character: a parentless capsule collider moved by Rapier's KinematicCharacterController.
// The collider is re-shaped per stance (vertical capsule standing/crouching, horizontal capsule prone).
import * as THREE from 'three';
import { RAPIER, Layer, Mask, groups, type Physics } from '../../core/Physics';
import { CAPSULE_RADIUS, KCC, KNOCKED_HEIGHT, PRONE_LENGTH, PRONE_RADIUS, STANCE_HEIGHT } from '../constants';
import { DEG } from '../../core/math';

export type BodyShape = 'stand' | 'crouch' | 'prone' | 'knocked';

/** Groups used by character movement queries (world + other characters). */
export const CHAR_MOVE_GROUPS = groups(0xffff, Mask.CharacterMove | Layer.Character);
/** Groups for world-only probes (no characters). */
export const WORLD_MOVE_GROUPS = groups(0xffff, Mask.CharacterMove);

export interface ShapeDims {
  halfHeight: number;
  radius: number;
  /** Height of the capsule center above the feet. */
  centerY: number;
  horizontal: boolean;
}

export function shapeDims(shape: BodyShape): ShapeDims {
  switch (shape) {
    case 'stand':
      return { halfHeight: STANCE_HEIGHT.stand / 2 - CAPSULE_RADIUS, radius: CAPSULE_RADIUS, centerY: STANCE_HEIGHT.stand / 2, horizontal: false };
    case 'crouch':
      return { halfHeight: STANCE_HEIGHT.crouch / 2 - CAPSULE_RADIUS, radius: CAPSULE_RADIUS, centerY: STANCE_HEIGHT.crouch / 2, horizontal: false };
    case 'knocked':
      return { halfHeight: KNOCKED_HEIGHT / 2 - CAPSULE_RADIUS, radius: CAPSULE_RADIUS, centerY: KNOCKED_HEIGHT / 2, horizontal: false };
    case 'prone':
      // The KCC uses a ball at the body center; the full body length is enforced separately by
      // proneBodyFits() (a thinner capsule tilted to the ground slope), so prone works on hills.
      return { halfHeight: 0.01, radius: PRONE_RADIUS, centerY: STANCE_HEIGHT.prone / 2, horizontal: false };
  }
}

/** Prone body clearance capsule (thinner than the KCC ball so the ground itself is not an overlap). */
export const PRONE_BODY_RADIUS = 0.2;
export const PRONE_BODY_HALF = PRONE_LENGTH / 2 - PRONE_BODY_RADIUS - 0.05;

const _q = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);
const _yAxis = new THREE.Vector3(0, 1, 0);
const _qYaw = new THREE.Quaternion();
const _identity = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Rotation for a capsule: identity (vertical) or lying along the facing direction (yaw), tilted by
 * `pitch` (positive = head end up).
 */
export function shapeRotation(horizontal: boolean, yaw: number, pitch = 0): { x: number; y: number; z: number; w: number } {
  if (!horizontal) return _identity;
  // Capsule axis is +Y; rotate it to lie along -Z (forward at yaw 0) with pitch, then yaw about +Y.
  _q.setFromAxisAngle(_axisX, -Math.PI / 2 + pitch);
  _qYaw.setFromAxisAngle(_yAxis, yaw);
  _q.premultiply(_qYaw);
  return { x: _q.x, y: _q.y, z: _q.z, w: _q.w };
}

let sharedController: RAPIER.KinematicCharacterController | null = null;
let sharedControllerWorld: RAPIER.World | null = null;

/** One KCC is shared by all characters (it holds no per-character state between calls). */
export function getSharedController(physics: Physics): RAPIER.KinematicCharacterController {
  if (sharedController && sharedControllerWorld === physics.world) return sharedController;
  const c = physics.world.createCharacterController(KCC.offset);
  c.setUp({ x: 0, y: 1, z: 0 });
  c.setMaxSlopeClimbAngle(KCC.maxSlopeClimbDeg * DEG);
  c.setMinSlopeSlideAngle(KCC.minSlopeSlideDeg * DEG);
  c.enableAutostep(KCC.autostepHeight, KCC.autostepMinWidth, false);
  c.enableSnapToGround(KCC.snapToGround);
  c.setSlideEnabled(true);
  c.setApplyImpulsesToDynamicBodies(true);
  c.setCharacterMass(80);
  sharedController = c;
  sharedControllerWorld = physics.world;
  return c;
}

export interface MoveResult {
  grounded: boolean;
  /** Hit something above while moving up. */
  hitCeiling: boolean;
  /** Horizontal blocking normal (last wall contact) or null. */
  wallNormal: THREE.Vector3 | null;
}

const _desired = { x: 0, y: 0, z: 0 };
const _moved = { x: 0, y: 0, z: 0 };
const _wall = new THREE.Vector3();
const _coll = new RAPIER.CharacterCollision();

export class CharacterBody {
  readonly collider: RAPIER.Collider;
  shape: BodyShape = 'stand';
  /** Yaw of the body (for horizontal prone capsule orientation). */
  bodyYaw = 0;
  private dims: ShapeDims = shapeDims('stand');
  private enabled = true;
  private readonly physics: Physics;

  constructor(physics: Physics, owner: unknown, feet: THREE.Vector3) {
    this.physics = physics;
    const d = this.dims;
    const desc = RAPIER.ColliderDesc.capsule(d.halfHeight, d.radius)
      .setTranslation(feet.x, feet.y + d.centerY, feet.z)
      .setCollisionGroups(groups(Layer.Character, Mask.All))
      .setSolverGroups(groups(Layer.Character, Layer.Dynamic))
      .setFriction(0.2);
    this.collider = physics.world.createCollider(desc);
    physics.tag(this.collider, { kind: 'character', surface: 'flesh', owner });
  }

  get centerY(): number {
    return this.dims.centerY;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.collider.setEnabled(on);
  }

  /** Change the collider shape (caller must have checked clearance when growing). */
  setShape(shape: BodyShape, feet: THREE.Vector3, yaw = this.bodyYaw): void {
    this.shape = shape;
    this.bodyYaw = yaw;
    this.dims = shapeDims(shape);
    this.collider.setHalfHeight(this.dims.halfHeight);
    this.collider.setRadius(this.dims.radius);
    this.syncTo(feet);
  }

  setBodyYaw(yaw: number): void {
    this.bodyYaw = yaw;
  }

  syncTo(feet: THREE.Vector3): void {
    this.collider.setTranslation({ x: feet.x, y: feet.y + this.dims.centerY, z: feet.z });
  }

  /**
   * Move with collision. `delta` is the desired translation this tick; `feet` is updated in place.
   * Returns ground/ceiling/wall info.
   */
  move(feet: THREE.Vector3, delta: THREE.Vector3, opts: { autostep: boolean; snap: boolean; withCharacters: boolean }): MoveResult {
    const kcc = getSharedController(this.physics);
    if (opts.autostep) kcc.enableAutostep(KCC.autostepHeight, KCC.autostepMinWidth, false);
    else kcc.disableAutostep();
    if (opts.snap) kcc.enableSnapToGround(KCC.snapToGround);
    else kcc.disableSnapToGround();
    this.syncTo(feet);
    _desired.x = delta.x;
    _desired.y = delta.y;
    _desired.z = delta.z;
    kcc.computeColliderMovement(
      this.collider,
      _desired,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      opts.withCharacters ? CHAR_MOVE_GROUPS : WORLD_MOVE_GROUPS,
    );
    kcc.computedMovement(_moved);
    feet.x += _moved.x;
    feet.y += _moved.y;
    feet.z += _moved.z;
    this.syncTo(feet);
    const grounded = kcc.computedGrounded();
    let hitCeiling = false;
    let wall: THREE.Vector3 | null = null;
    const n = kcc.numComputedCollisions();
    for (let i = 0; i < n; i++) {
      const c = kcc.computedCollision(i, _coll);
      if (!c) continue;
      const ny = c.normal1.y;
      if (ny < -0.5 && delta.y > 0) hitCeiling = true;
      else if (Math.abs(ny) < 0.6) wall = _wall.set(c.normal1.x, c.normal1.y, c.normal1.z);
    }
    return { grounded, hitCeiling, wallNormal: wall };
  }

  /** True if the given (vertical) shape placed at `feet` does not overlap the world/other characters. */
  fits(shape: BodyShape, feet: THREE.Vector3, withCharacters = true, lift = 0.06): boolean {
    const d = shapeDims(shape);
    // Slightly shrunk and lifted so resting on the ground is not an overlap.
    const shrink = 0.03;
    const s = new RAPIER.Capsule(Math.max(0.01, d.halfHeight), d.radius - shrink);
    const hit = this.physics.world.intersectionWithShape(
      { x: feet.x, y: feet.y + d.centerY + lift, z: feet.z },
      _identity,
      s,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      withCharacters ? CHAR_MOVE_GROUPS : WORLD_MOVE_GROUPS,
      this.collider,
    );
    return hit === null;
  }

  /**
   * Prone body clearance: a capsule lying along `yaw`, tilted by the ground `pitch`, centered over the feet
   * point. Checks walls/obstacles/other characters, not the ground the body lies on.
   */
  proneBodyFits(feet: THREE.Vector3, yaw: number, pitch: number, withCharacters = true): boolean {
    const s = new RAPIER.Capsule(PRONE_BODY_HALF, PRONE_BODY_RADIUS);
    const hit = this.physics.world.intersectionWithShape(
      { x: feet.x, y: feet.y + PRONE_RADIUS + 0.08, z: feet.z },
      shapeRotation(true, yaw, pitch),
      s,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      withCharacters ? CHAR_MOVE_GROUPS : WORLD_MOVE_GROUPS,
      this.collider,
    );
    return hit === null;
  }

  dispose(): void {
    this.physics.removeCollider(this.collider);
  }
}
