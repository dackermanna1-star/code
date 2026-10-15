// Rapier physics wrapper: world, collision groups, collider metadata, convenience queries.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { SurfaceType } from './types';

export { RAPIER };

/** Collision membership bits (16-bit). */
export const Layer = {
  Terrain: 1 << 0,
  Static: 1 << 1, // buildings, rocks, trees, props
  Character: 1 << 2,
  Vehicle: 1 << 3,
  Dynamic: 1 << 4, // grenades, debris, ragdolls
  Door: 1 << 5,
  Glass: 1 << 6, // breakable windows (bullets pass & break)
  Water: 1 << 7, // water volumes (sensor)
  Foliage: 1 << 8, // soft colliders that block nothing but sight hints (usually sensors)
  Trigger: 1 << 9,
} as const;

export const Mask = {
  All: 0xffff,
  /** What blocks bullets/sight. */
  World: Layer.Terrain | Layer.Static | Layer.Vehicle | Layer.Door | Layer.Glass,
  /** What blocks character movement. */
  CharacterMove: Layer.Terrain | Layer.Static | Layer.Vehicle | Layer.Door | Layer.Glass,
  /** Line of sight: everything opaque (not glass). */
  Sight: Layer.Terrain | Layer.Static | Layer.Vehicle | Layer.Door,
} as const;

/** Pack Rapier interaction groups: membership in high 16 bits, filter in low 16 bits. */
export function groups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

export type ColliderKind =
  | 'terrain'
  | 'building'
  | 'door'
  | 'glass'
  | 'tree'
  | 'rock'
  | 'prop'
  | 'vehicle'
  | 'character'
  | 'water'
  | 'dynamic';

export interface ColliderInfo {
  kind: ColliderKind;
  surface: SurfaceType;
  /** Owning object (e.g. IVehicle, IDoor, building id). */
  owner?: unknown;
  /** Bullets can penetrate if thinner than this many cm-equivalents of material (0 = no). */
  penetration?: number;
}

export interface RayHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  collider: RAPIER.Collider;
  info: ColliderInfo | undefined;
}

export interface RayOptions {
  /** Membership mask of colliders to hit (default Mask.World). */
  mask?: number;
  excludeCollider?: RAPIER.Collider;
  excludeRigidBody?: RAPIER.RigidBody;
  predicate?: (c: RAPIER.Collider) => boolean;
  /** Treat starting inside a shape as a hit at distance 0 (default false). */
  solid?: boolean;
}

export class Physics {
  world!: RAPIER.World;
  readonly info = new Map<number, ColliderInfo>();
  private ray!: RAPIER.Ray;
  private _initialized = false;
  /** Fixed-timestep step count. */
  steps = 0;

  async init(): Promise<void> {
    if (this._initialized) return;
    // rapier3d-compat embeds its wasm; init() may log a deprecation about params — harmless.
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this._initialized = true;
  }

  get ready(): boolean {
    return this._initialized;
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
    this.steps++;
  }

  /** Register metadata for a collider (kind, surface, owner). */
  tag(collider: RAPIER.Collider, info: ColliderInfo): RAPIER.Collider {
    this.info.set(collider.handle, info);
    return collider;
  }

  getInfo(collider: RAPIER.Collider | null | undefined): ColliderInfo | undefined {
    return collider ? this.info.get(collider.handle) : undefined;
  }

  /** Create a static collider (fixed body shared). */
  addStatic(desc: RAPIER.ColliderDesc, info: ColliderInfo, membership: number = Layer.Static): RAPIER.Collider {
    desc.setCollisionGroups(groups(membership, Mask.All));
    desc.setSolverGroups(groups(membership, Mask.All));
    const c = this.world.createCollider(desc);
    return this.tag(c, info);
  }

  /** Box helper: center, half extents, rotation about Y (radians) or full quaternion. */
  addStaticBox(
    center: THREE.Vector3,
    half: THREE.Vector3,
    rot: number | THREE.Quaternion,
    info: ColliderInfo,
    membership: number = Layer.Static,
  ): RAPIER.Collider {
    const q = typeof rot === 'number' ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot) : rot;
    const desc = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setTranslation(center.x, center.y, center.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    return this.addStatic(desc, info, membership);
  }

  removeCollider(c: RAPIER.Collider): void {
    this.info.delete(c.handle);
    this.world.removeCollider(c, true);
  }

  /** Closest hit along a ray. `dir` must be normalized. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, opts: RayOptions = {}): RayHit | null {
    this.ray.origin = { x: origin.x, y: origin.y, z: origin.z };
    this.ray.dir = { x: dir.x, y: dir.y, z: dir.z };
    const mask = opts.mask ?? Mask.World;
    const hit = this.world.castRayAndGetNormal(
      this.ray,
      maxDist,
      opts.solid ?? false,
      undefined,
      groups(0xffff, mask),
      opts.excludeCollider,
      opts.excludeRigidBody,
      opts.predicate,
    );
    if (!hit) return null;
    const d = hit.timeOfImpact;
    return {
      point: new THREE.Vector3(origin.x + dir.x * d, origin.y + dir.y * d, origin.z + dir.z * d),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance: d,
      collider: hit.collider,
      info: this.info.get(hit.collider.handle),
    };
  }

  /** All hits along a ray sorted by distance (for penetration). */
  raycastAll(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, opts: RayOptions = {}): RayHit[] {
    this.ray.origin = { x: origin.x, y: origin.y, z: origin.z };
    this.ray.dir = { x: dir.x, y: dir.y, z: dir.z };
    const out: RayHit[] = [];
    this.world.intersectionsWithRay(
      this.ray,
      maxDist,
      opts.solid ?? false,
      (hit) => {
        const d = hit.timeOfImpact;
        out.push({
          point: new THREE.Vector3(origin.x + dir.x * d, origin.y + dir.y * d, origin.z + dir.z * d),
          normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
          distance: d,
          collider: hit.collider,
          info: this.info.get(hit.collider.handle),
        });
        return true;
      },
      undefined,
      groups(0xffff, opts.mask ?? Mask.World),
      opts.excludeCollider,
      opts.excludeRigidBody,
      opts.predicate,
    );
    out.sort((a, b) => a.distance - b.distance);
    return out;
  }

  /** True if nothing opaque blocks the segment a→b. */
  lineOfSight(a: THREE.Vector3, b: THREE.Vector3, mask: number = Mask.Sight): boolean {
    const dir = _v.copy(b).sub(a);
    const len = dir.length();
    if (len < 1e-4) return true;
    dir.divideScalar(len);
    return this.raycast(a, dir, len - 0.05, { mask }) === null;
  }

  /** Ground height below a point using physics (includes buildings/props). */
  groundBelow(pos: THREE.Vector3, maxDrop = 200, mask: number = Mask.CharacterMove): RayHit | null {
    return this.raycast(_o.set(pos.x, pos.y + 0.5, pos.z), _down, maxDrop + 0.5, { mask });
  }
}

const _v = new THREE.Vector3();
const _o = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
