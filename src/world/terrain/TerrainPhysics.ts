// Rapier colliders for the terrain: one heightfield (exactly the rendered surface) + invisible map-edge walls.
import type { Physics } from '../../core/Physics';
import { Layer, RAPIER } from '../../core/Physics';
import type { World } from '../World';
import { M, N, WORLD_SIZE } from './TerrainData';
import { toRapierHeights } from './sample';

export function createTerrainColliders(physics: Physics, world: World): RAPIER.Collider {
  const heights = toRapierHeights(world.heights, N);
  const desc = RAPIER.ColliderDesc.heightfield(M, M, heights, { x: WORLD_SIZE, y: 1, z: WORLD_SIZE }, RAPIER.HeightFieldFlags.FIX_INTERNAL_EDGES)
    .setTranslation(WORLD_SIZE / 2, 0, WORLD_SIZE / 2)
    .setFriction(0.9);
  // Surface varies per point: ColliderInfo.surface is the dominant default; consumers should call
  // ctx.world.getSurface(hit.point.x, hit.point.z) for terrain hits (kind === 'terrain').
  const collider = physics.addStatic(desc, { kind: 'terrain', surface: 'grass', owner: world }, Layer.Terrain);
  // Map boundary walls (keep boats/vehicles/characters inside the 3 km square).
  const H = 600, T = 5;
  const half = WORLD_SIZE / 2;
  for (const [x, z, hx, hz] of [
    [half, -T, half + T, T],
    [half, WORLD_SIZE + T, half + T, T],
    [-T, half, T, half + T],
    [WORLD_SIZE + T, half, T, half + T],
  ]) {
    physics.addStatic(RAPIER.ColliderDesc.cuboid(hx, H, hz).setTranslation(x, H - 60, z), { kind: 'terrain', surface: 'rock' }, Layer.Terrain);
  }
  return collider;
}
