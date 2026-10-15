// IWorld implementation: authored layout + generated terrain data + fast spatial queries.
import type * as THREE from 'three';
import type { IWorld, MapLocation } from '../core/contracts';
import type { SurfaceType } from '../core/types';
import type { WorldLayout } from './layout/types';
import { CELL, CLS, CLS_CELL, M, N, SURFACE_NAMES, Surf, WORLD_SIZE, type TerrainResult } from './terrain/TerrainData';
import { heightAt, normalAt, triangleNormalAt } from './terrain/sample';
import { pondReach } from './layout/pondShape';
import { RoadQuery, type RoadHit } from './roads/RoadQuery';

const _hit: RoadHit = { edge: 0, kind: 'asphalt', roadId: 0 };
/** Splat layer (0 grass, 1 dry grass, 2 forest floor, 3 dirt, 4 mud, 5 rock, 6 sand, 7 gravel, 8 field) → surface. */
const SPLAT_SURFACE: SurfaceType[] = ['grass', 'grass', 'dirt', 'dirt', 'mud', 'rock', 'sand', 'gravel', 'dirt'];

export class World implements IWorld {
  readonly size = WORLD_SIZE;
  readonly seaLevel = 0;
  readonly locations: readonly MapLocation[];
  readonly lots;
  readonly props;
  readonly roads;
  readonly vehicleSpawns;
  /** Optional wave displacement provided by the water system (meters, added to the still water level). */
  waveHeight: ((x: number, z: number) => number) | null = null;
  /** Lazily completed map canvas (see map/MapImage.ts). */
  mapCanvas: HTMLCanvasElement | null = null;
  private readonly h: Float32Array;
  /** Exact road-edge queries (surface next to roads). */
  readonly roadQuery: RoadQuery;

  constructor(
    readonly layout: WorldLayout,
    readonly terrain: TerrainResult,
  ) {
    this.locations = layout.locations;
    this.lots = layout.lots;
    this.props = layout.props;
    this.roads = layout.roads;
    this.vehicleSpawns = layout.vehicleSpawns;
    this.h = terrain.heights;
    this.roadQuery = new RoadQuery(layout.roadDefs);
  }

  /** Raw height grid (N x N, row-major, CELL spacing). */
  get heights(): Float32Array {
    return this.h;
  }

  getHeight(x: number, z: number): number {
    return heightAt(this.h, N, CELL, x, z);
  }

  getNormal(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    normalAt(this.h, N, CELL, x, z, out);
    return out;
  }

  /** Geometric normal of the collider triangle under the point (exact physics normal). */
  getTriangleNormal(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    triangleNormalAt(this.h, N, CELL, x, z, out);
    return out;
  }

  /** Pond containing the point (with its water level), or -1. */
  private pondAt(x: number, z: number): number {
    const ponds = this.layout.ponds;
    for (let i = 0; i < ponds.length; i++) {
      const p = ponds[i];
      const dx = x - p.x, dz = z - p.z, r = pondReach(p);
      if (dx * dx + dz * dz < r * r) return i;
    }
    return -1;
  }

  /** Still-water level at the point (sea level or pond level), ignoring whether the ground is above it. */
  waterLevelAt(x: number, z: number): number {
    const pi = this.pondAt(x, z);
    return pi >= 0 ? this.terrain.pondLevel[pi] : this.seaLevel;
  }

  getWaterHeight(x: number, z: number): number | null {
    const ground = this.getHeight(x, z);
    const pi = this.pondAt(x, z);
    if (pi >= 0) {
      const level = this.terrain.pondLevel[pi];
      return ground < level ? level : null;
    }
    if (x < 0 || z < 0 || x > this.size || z > this.size) return this.seaLevel + (this.waveHeight?.(x, z) ?? 0);
    if (ground >= this.seaLevel) return null;
    return this.seaLevel + (this.waveHeight?.(x, z) ?? 0);
  }

  isLand(x: number, z: number): boolean {
    if (x < 0 || z < 0 || x > this.size || z > this.size) return false;
    return this.getWaterHeight(x, z) === null;
  }

  getSurface(x: number, z: number): SurfaceType {
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return 'water';
    const ri = (z / CELL) | 0, ci = (x / CELL) | 0;
    const mask = this.terrain.roadMask[Math.min(M - 1, ri) * M + Math.min(M - 1, ci)];
    if (mask === 3) return 'asphalt'; // bridge deck (also reported for the ground right under a deck)
    // exact road edge distance (the 2 m mask is too coarse next to the road)
    const road = this.roadQuery.nearest(x, z, _hit);
    if (road) {
      if (road.edge < 0) return road.kind;
      if (road.kind === 'asphalt' && road.edge < 1.4) return 'gravel'; // compacted shoulder (as rendered)
    }
    const cell = Math.min(CLS - 1, (z / CLS_CELL) | 0) * CLS + Math.min(CLS - 1, (x / CLS_CELL) | 0);
    const s = this.terrain.surface[cell];
    if (s === Surf.Water || this.getWaterHeight(x, z) !== null) return 'water';
    // 4 m class cells touching a road are classed as road; off the exact road use the dominant ground layer
    if (s === Surf.Asphalt) return SPLAT_SURFACE[this.dominantLayer(cell)];
    return SURFACE_NAMES[s] as SurfaceType;
  }

  /** Dominant terrain splat layer (0 grass .. 8 field) of a 4 m class cell. */
  private dominantLayer(cell: number): number {
    const a = this.terrain.splatA, b = this.terrain.splatB, o = cell * 4;
    let best = 0, bw = 255 - (a[o] + a[o + 1] + a[o + 2] + a[o + 3] + b[o] + b[o + 1] + b[o + 2] + b[o + 3]);
    for (let k = 0; k < 8; k++) {
      const w = k < 4 ? a[o + k] : b[o + k - 4];
      if (w > bw) {
        bw = w;
        best = k + 1;
      }
    }
    return best;
  }

  /** Raw surface class id (Surf) at the point (4 m resolution). */
  surfaceClass(x: number, z: number): number {
    const i = Math.min(CLS - 1, Math.max(0, (x / CLS_CELL) | 0)), j = Math.min(CLS - 1, Math.max(0, (z / CLS_CELL) | 0));
    return this.terrain.surface[j * CLS + i];
  }

  private sampleCls(grid: Uint8Array, x: number, z: number): number {
    const gx = Math.min(CLS - 1.001, Math.max(0, x / CLS_CELL - 0.5));
    const gz = Math.min(CLS - 1.001, Math.max(0, z / CLS_CELL - 0.5));
    const i = gx | 0, j = gz | 0, tx = gx - i, tz = gz - j;
    const o = j * CLS + i;
    return ((grid[o] * (1 - tx) + grid[o + 1] * tx) * (1 - tz) + (grid[o + CLS] * (1 - tx) + grid[o + CLS + 1] * tx) * tz) / 255;
  }

  getGroundCover(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return 0;
    return this.sampleCls(this.terrain.cover, x, z);
  }

  getTreeDensity(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return 0;
    if (this.isReserved(x, z, 2)) return 0;
    return this.sampleCls(this.terrain.tree, x, z);
  }

  /** Distance (m) to the nearest reserved feature (road, lot, bridge, prop); capped at 25.5 m. */
  reservedDistance(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return 0;
    return this.terrain.reserved[Math.min(M - 1, (z / CELL) | 0) * M + Math.min(M - 1, (x / CELL) | 0)] / 10;
  }

  isReserved(x: number, z: number, margin = 0): boolean {
    const d = this.reservedDistance(x, z);
    // the distance field saturates at 25.5 m: a saturated cell is farther than that, never "reserved"
    // (previously any margin >= 25.5 m reported the whole map as reserved)
    if (d >= 25.5 && x >= 0 && z >= 0 && x < this.size && z < this.size) return false;
    return d <= margin;
  }

  nearestLocation(x: number, z: number): MapLocation | null {
    let best: MapLocation | null = null, bd = Infinity;
    for (const l of this.locations) {
      const d = (l.x - x) * (l.x - x) + (l.z - z) * (l.z - z);
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    return best;
  }

  getMapImage(): HTMLCanvasElement | null {
    return this.mapCanvas;
  }
}
