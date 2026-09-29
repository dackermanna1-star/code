import RAPIER from '@dimforge/rapier3d-simd-compat';

export { RAPIER };

/** Collision membership bits. */
export const CG = {
  WORLD: 1 << 0,
  STRUCT: 1 << 1,
  ZOMBIE: 1 << 2,
  RAGDOLL: 1 << 3,
  CORPSE: 1 << 4,
  PLAYER: 1 << 5,
  DEBRIS: 1 << 6,
  PROJ: 1 << 7,
  BOUNDS: 1 << 8,
} as const;

export const groups = (member: number, filter: number) => ((member & 0xffff) << 16) | (filter & 0xffff);

/** Canonical interaction groups for each kind of collider. */
export const GROUPS = {
  world: groups(CG.WORLD, 0xffff),
  bounds: groups(CG.BOUNDS, CG.ZOMBIE | CG.PLAYER | CG.RAGDOLL | CG.DEBRIS | CG.PROJ),
  struct: groups(CG.STRUCT, CG.ZOMBIE | CG.PLAYER | CG.RAGDOLL | CG.DEBRIS | CG.PROJ | CG.CORPSE),
  // zombies and the player walk through bodies (ragdolls knock zombies via ZombieManager.ragdollCollisions)
  zombie: groups(CG.ZOMBIE, CG.WORLD | CG.BOUNDS | CG.STRUCT | CG.ZOMBIE | CG.PLAYER | CG.PROJ),
  ragdoll: groups(CG.RAGDOLL, CG.WORLD | CG.BOUNDS | CG.STRUCT | CG.RAGDOLL | CG.DEBRIS | CG.PROJ),
  corpse: groups(CG.CORPSE, CG.WORLD | CG.STRUCT | CG.ZOMBIE | CG.RAGDOLL | CG.DEBRIS | CG.PLAYER | CG.PROJ),
  player: groups(CG.PLAYER, CG.WORLD | CG.BOUNDS | CG.STRUCT | CG.ZOMBIE),
  debris: groups(CG.DEBRIS, CG.WORLD | CG.BOUNDS | CG.STRUCT | CG.RAGDOLL | CG.CORPSE | CG.DEBRIS),
  proj: groups(CG.PROJ, CG.WORLD | CG.BOUNDS | CG.STRUCT | CG.ZOMBIE | CG.RAGDOLL | CG.CORPSE),
  /** Filter for ray queries hitting only static world + structures. */
  rayWorld: groups(0xffff, CG.WORLD | CG.STRUCT),
  rayWorldOnly: groups(0xffff, CG.WORLD),
  rayGround: groups(0xffff, CG.WORLD | CG.STRUCT | CG.CORPSE),
};

export class Physics {
  world!: RAPIER.World;
  readonly fixedDt = 1 / 60;
  private acc = 0;
  alpha = 0;
  steps = 0;
  stepMs = 0;

  async init() {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = this.fixedDt;
    this.world.integrationParameters.numSolverIterations = 4;
  }

  reset() {
    this.world.free();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = this.fixedDt;
    this.world.integrationParameters.numSolverIterations = 4;
  }

  /** Advances the simulation with a fixed step. Returns number of steps taken. */
  step(dt: number, beforeStep?: (h: number) => void) {
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    const t0 = performance.now();
    while (this.acc >= this.fixedDt && n < 3) {
      beforeStep?.(this.fixedDt);
      this.world.step();
      this.acc -= this.fixedDt;
      n++;
    }
    if (n === 3) this.acc = 0;
    this.alpha = this.acc / this.fixedDt;
    this.steps = n;
    this.stepMs = performance.now() - t0;
    return n;
  }

  private ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

  /** Cast a ray; returns hit distance/normal/collider or null. */
  castRay(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    maxDist: number,
    filterGroups: number,
    excludeCollider?: RAPIER.Collider,
  ) {
    const ray = this.ray;
    ray.origin.x = ox; ray.origin.y = oy; ray.origin.z = oz;
    ray.dir.x = dx; ray.dir.y = dy; ray.dir.z = dz;
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, filterGroups, excludeCollider);
    if (!hit) return null;
    return { t: hit.timeOfImpact, nx: hit.normal.x, ny: hit.normal.y, nz: hit.normal.z, collider: hit.collider };
  }
}
