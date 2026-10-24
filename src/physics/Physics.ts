import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export { RAPIER };
export type RWorld = RAPIER.World;
export type RBody = RAPIER.RigidBody;
export type RCollider = RAPIER.Collider;

/** Collision group bits. */
export const CG = {
  STATIC: 1 << 0,
  PROP: 1 << 1,
  CHAR: 1 << 2,
  PLAYER: 1 << 3,
  RAGDOLL: 1 << 4,
  DEBRIS: 1 << 5,
  HELD: 1 << 6,
  TRIGGER: 1 << 7,
  PICKUP_RAY: 1 << 8,
} as const;

export function groups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

export const GROUPS = {
  STATIC: groups(CG.STATIC, 0xffff ^ CG.STATIC),
  PROP: groups(CG.PROP, CG.STATIC | CG.PROP | CG.CHAR | CG.PLAYER | CG.RAGDOLL | CG.DEBRIS | CG.PICKUP_RAY),
  CHAR: groups(CG.CHAR, CG.STATIC | CG.PROP | CG.CHAR | CG.PLAYER),
  PLAYER: groups(CG.PLAYER, CG.STATIC | CG.PROP | CG.CHAR),
  RAGDOLL: groups(CG.RAGDOLL, CG.STATIC | CG.PROP | CG.RAGDOLL | CG.PICKUP_RAY),
  DEBRIS: groups(CG.DEBRIS, CG.STATIC | CG.PROP),
  HELD: groups(CG.HELD, CG.STATIC),
  TRIGGER: groups(CG.TRIGGER, CG.PLAYER | CG.CHAR),
} as const;

/** Query filters (membership of the "query shape", what it tests against). */
export const QG = {
  WORLD: groups(0xffff, CG.STATIC),
  WORLD_PROPS: groups(0xffff, CG.STATIC | CG.PROP),
  SOLID_NO_CHARS: groups(0xffff, CG.STATIC | CG.PROP | CG.RAGDOLL),
  ALL: groups(0xffff, 0xffff),
  PICKUP: groups(0xffff, CG.STATIC | CG.PROP | CG.RAGDOLL),
  MOVE: groups(0xffff, CG.STATIC | CG.PROP),
  LOS: groups(0xffff, CG.STATIC),
} as const;

export type SurfaceMaterial = 'wood' | 'tile' | 'metal' | 'glass' | 'plaster' | 'fabric' | 'flesh' | 'concrete' | 'carpet' | 'ceramic' | 'rubber' | 'plastic' | 'paper';

export interface PhysOwner {
  kind: 'static' | 'prop' | 'character' | 'player' | 'ragdoll' | 'debris' | 'trigger';
  material: SurfaceMaterial;
  /** Arbitrary entity reference. */
  entity?: unknown;
  /** For ragdoll parts: part index. */
  part?: number;
  onContactForce?(ev: ContactImpact): void;
}

export interface ContactImpact {
  self: RCollider;
  other: RCollider;
  otherOwner: PhysOwner | undefined;
  /** Impulse magnitude in N*s for this step (approx). */
  impulse: number;
  /** Direction of max force (world). */
  dir: THREE.Vector3;
  /** World contact point (approximate). */
  point: THREE.Vector3;
}

export interface RayHit {
  collider: RCollider;
  owner: PhysOwner | undefined;
  toi: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

const tmpDir = new THREE.Vector3();
const tmpPoint = new THREE.Vector3();

export class Physics {
  world!: RAPIER.World;
  eventQueue!: RAPIER.EventQueue;
  readonly owners = new Map<number, PhysOwner>();
  readonly fixedDt = 1 / 60;
  private impactListeners: ((ev: ContactImpact, ownerA: PhysOwner | undefined) => void)[] = [];
  stepCount = 0;
  lastStepMs = 0;

  static async create(): Promise<Physics> {
    await RAPIER.init();
    const p = new Physics();
    p.world = new RAPIER.World({ x: 0, y: -15, z: 0 });
    p.world.timestep = p.fixedDt;
    p.world.numSolverIterations = 6;
    p.eventQueue = new RAPIER.EventQueue(true);
    return p;
  }

  register(collider: RCollider, owner: PhysOwner): void {
    this.owners.set(collider.handle, owner);
  }

  unregister(collider: RCollider): void {
    this.owners.delete(collider.handle);
  }

  ownerOf(collider: RCollider | null | undefined): PhysOwner | undefined {
    if (!collider) return undefined;
    return this.owners.get(collider.handle);
  }

  onImpact(fn: (ev: ContactImpact, ownerA: PhysOwner | undefined) => void): void {
    this.impactListeners.push(fn);
  }

  removeBody(body: RBody): void {
    const n = body.numColliders();
    for (let i = 0; i < n; i++) this.owners.delete(body.collider(i).handle);
    this.world.removeRigidBody(body);
  }

  removeCollider(c: RCollider): void {
    this.owners.delete(c.handle);
    this.world.removeCollider(c, true);
  }

  step(): void {
    const t0 = performance.now();
    this.world.step(this.eventQueue);
    this.stepCount++;
    this.eventQueue.drainContactForceEvents((ev) => {
      const c1 = this.world.getCollider(ev.collider1());
      const c2 = this.world.getCollider(ev.collider2());
      if (!c1 || !c2) return;
      const o1 = this.owners.get(c1.handle);
      const o2 = this.owners.get(c2.handle);
      const mag = ev.totalForceMagnitude() * this.fixedDt;
      const d = ev.maxForceDirection();
      tmpDir.set(d.x, d.y, d.z);
      // contact point
      let found = false;
      this.world.contactPair(c1, c2, (manifold) => {
        if (found) return;
        if (manifold.numSolverContacts() > 0) {
          const p = manifold.solverContactPoint(0);
          if (p) {
            tmpPoint.set(p.x, p.y, p.z);
            found = true;
          }
        }
      });
      if (!found) {
        const t = c1.translation();
        tmpPoint.set(t.x, t.y, t.z);
      }
      if (o1?.onContactForce) {
        o1.onContactForce({ self: c1, other: c2, otherOwner: o2, impulse: mag, dir: tmpDir, point: tmpPoint });
      }
      if (o2?.onContactForce) {
        tmpDir.negate();
        o2.onContactForce({ self: c2, other: c1, otherOwner: o1, impulse: mag, dir: tmpDir, point: tmpPoint });
        tmpDir.negate();
      }
      for (const l of this.impactListeners) l({ self: c1, other: c2, otherOwner: o2, impulse: mag, dir: tmpDir, point: tmpPoint }, o1);
    });
    this.eventQueue.drainCollisionEvents(() => {});
    this.lastStepMs = performance.now() - t0;
  }

  // ---------------- queries ----------------
  private ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  raycast(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
    filterGroups: number = QG.WORLD_PROPS,
    excludeBody?: RBody,
    predicate?: (c: RCollider) => boolean,
    out?: RayHit,
  ): RayHit | null {
    this.ray.origin.x = origin.x;
    this.ray.origin.y = origin.y;
    this.ray.origin.z = origin.z;
    this.ray.dir.x = dir.x;
    this.ray.dir.y = dir.y;
    this.ray.dir.z = dir.z;
    const hit = this.world.castRayAndGetNormal(
      this.ray,
      maxDist,
      true,
      undefined,
      filterGroups,
      undefined,
      excludeBody,
      predicate,
    );
    if (!hit) return null;
    const res: RayHit = out ?? {
      collider: hit.collider,
      owner: undefined,
      toi: 0,
      point: new THREE.Vector3(),
      normal: new THREE.Vector3(),
    };
    res.collider = hit.collider;
    res.owner = this.owners.get(hit.collider.handle);
    res.toi = hit.timeOfImpact;
    res.point.copy(origin).addScaledVector(dir, hit.timeOfImpact);
    res.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
    return res;
  }

  /** True if the segment a->b is unobstructed by the given groups. */
  lineOfSight(a: THREE.Vector3, b: THREE.Vector3, filterGroups: number = QG.LOS): boolean {
    tmpDir.subVectors(b, a);
    const len = tmpDir.length();
    if (len < 1e-4) return true;
    tmpDir.multiplyScalar(1 / len);
    this.ray.origin.x = a.x;
    this.ray.origin.y = a.y;
    this.ray.origin.z = a.z;
    this.ray.dir.x = tmpDir.x;
    this.ray.dir.y = tmpDir.y;
    this.ray.dir.z = tmpDir.z;
    const hit = this.world.castRay(this.ray, len, true, undefined, filterGroups);
    return !hit;
  }

  private ballShapes = new Map<number, RAPIER.Ball>();
  ball(radius: number): RAPIER.Ball {
    const key = Math.round(radius * 1000);
    let s = this.ballShapes.get(key);
    if (!s) {
      s = new RAPIER.Ball(radius);
      this.ballShapes.set(key, s);
    }
    return s;
  }

  /** Sphere sweep. Returns hit or null. */
  sphereCast(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    radius: number,
    maxDist: number,
    filterGroups: number,
    excludeBody?: RBody,
    predicate?: (c: RCollider) => boolean,
  ): { collider: RCollider; toi: number; normal: THREE.Vector3; point: THREE.Vector3 } | null {
    const hit = this.world.castShape(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: dir.x, y: dir.y, z: dir.z },
      this.ball(radius),
      0,
      maxDist,
      true,
      undefined,
      filterGroups,
      undefined,
      excludeBody,
      predicate,
    );
    if (!hit) return null;
    return {
      collider: hit.collider,
      toi: hit.time_of_impact,
      normal: new THREE.Vector3(hit.normal2.x, hit.normal2.y, hit.normal2.z),
      point: new THREE.Vector3(hit.witness2.x, hit.witness2.y, hit.witness2.z),
    };
  }

  overlapSphere(center: THREE.Vector3, radius: number, filterGroups: number, cb: (c: RCollider) => boolean): void {
    this.world.intersectionsWithShape(
      { x: center.x, y: center.y, z: center.z },
      { x: 0, y: 0, z: 0, w: 1 },
      this.ball(radius),
      cb,
      undefined,
      filterGroups,
    );
  }

  // --------------- static helpers ---------------
  addStaticBox(
    center: THREE.Vector3 | { x: number; y: number; z: number },
    half: { x: number; y: number; z: number },
    material: SurfaceMaterial = 'wood',
    rotation?: THREE.Quaternion,
    owner?: PhysOwner,
  ): RCollider {
    const desc = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setTranslation(center.x, center.y, center.z)
      .setCollisionGroups(GROUPS.STATIC)
      .setFriction(0.8);
    if (rotation) desc.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
    const c = this.world.createCollider(desc);
    this.register(c, owner ?? { kind: 'static', material });
    return c;
  }
}

/** Keeps a THREE object in sync with a rigid body, with render interpolation. */
export class BodySync {
  prevPos = new THREE.Vector3();
  currPos = new THREE.Vector3();
  prevRot = new THREE.Quaternion();
  currRot = new THREE.Quaternion();
  constructor(
    public body: RBody,
    public object: THREE.Object3D,
  ) {
    this.snap();
  }
  snap(): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.currPos.set(t.x, t.y, t.z);
    this.currRot.set(r.x, r.y, r.z, r.w);
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
  }
  /** call after each physics step */
  capture(): void {
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
    const t = this.body.translation();
    const r = this.body.rotation();
    this.currPos.set(t.x, t.y, t.z);
    this.currRot.set(r.x, r.y, r.z, r.w);
  }
  apply(alpha: number): void {
    this.object.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.object.quaternion.slerpQuaternions(this.prevRot, this.currRot, alpha);
  }
}
