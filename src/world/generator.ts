// ProceduralGeneration: deterministic, chunk-local world generation.
// Every voxel is a pure function of (seed, x, y, z), so chunks can be generated in any order, in workers,
// regenerated after unloading, and reproduced from a seed for debugging.
import { CHUNK, CHUNK_VOL, SURFACE_Y, WORLD_X, WORLD_Y, WORLD_Z } from '../config';
import { Noise } from '../core/noise';
import { hash3, hash4, Rng } from '../core/rng';
import {
  BIOMES, BIOME_HEIGHT, BiomeDef, FLYING_ENEMIES, HM, HM_HEIGHT, LAYER_HEIGHT, NUM_LAYERS, hmBandY, layerTopY,
} from './biomes';
import { matId, AIR, BEDROCK, TEMPLEBRICK, DENSEROCK, LAMP, GRASS, ROCK, SOIL, WOOD, BRICK, STEEL, GLASS, CONCRETE, SNOW, ICE, VINE, FUNGUS, CRYSTAL, GOLDORE } from './materials';

export interface Spawn {
  kind: string;
  x: number;
  y: number;
  z: number;
  /** Deterministic per-spawn seed for the game to roll contents with. */
  seed: number;
  data?: Record<string, unknown>;
}

export interface ChunkGenResult {
  mat: Uint8Array;
  spawns: Spawn[];
}

interface Box {
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; // inclusive-exclusive
  mat: number;
  /** 'air' = only replace air; 'solid' = only replace solid; 'all' = always; 'carve' = set air */
  mode: 'air' | 'solid' | 'all';
}

interface Sphere {
  x: number; y: number; z: number; r: number; level: number; mat: number;
}

interface RegionFeatures {
  boxes: Box[];
  pools: Sphere[];
  spawns: Spawn[];
}

interface RoutePoint { x: number; y: number; z: number; r: number }
interface RouteSeg { a: RoutePoint; b: RoutePoint; minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }

const REGION = 32;
const G = 4; // coarse grid spacing

export class WorldGenerator {
  readonly seed: number;
  private nCave: Noise;
  private nTunA: Noise;
  private nTunB: Noise;
  private nMat: Noise;
  private nMat2: Noise;
  private nSurf: Noise;
  private coarseCache = new Map<number, number>();
  private regionCache = new Map<number, RegionFeatures>();
  readonly routeSegs: RouteSeg[] = [];
  readonly routePoints: RoutePoint[][] = [];

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.nCave = new Noise(seed ^ 0x1a2b3c);
    this.nTunA = new Noise(seed ^ 0x55aa11);
    this.nTunB = new Noise(seed ^ 0x77ee22);
    this.nMat = new Noise(seed ^ 0x13579b);
    this.nMat2 = new Noise(seed ^ 0x2468ac);
    this.nSurf = new Noise(seed ^ 0x0badf0);
    this.buildRoutes();
  }

  // ------------------------------------------------------------------ surface
  surfaceHeight(x: number, z: number): number {
    const base = SURFACE_Y + 12 + 5 * this.nSurf.fbm2(x / 45, z / 45, 3);
    const dm = Math.hypot(x - 128, (z - 168) * 0.9);
    const mountain = 95 * smooth(1 - dm / 95) + 10 * this.nSurf.noise2(x / 18, z / 18) * smooth(1 - dm / 95);
    const dEdge = Math.min(x, z, WORLD_X - 1 - x, WORLD_Z - 1 - z);
    const edge = 70 * smooth((34 - dEdge) / 34);
    return Math.floor(base + mountain + edge);
  }

  spawnPoint(): { x: number; y: number; z: number } {
    const x = 128,
      z = 44;
    return { x: x + 0.5, y: this.surfaceHeight(x, z) + 0.02, z: z + 0.5 };
  }

  // ------------------------------------------------------------------ guaranteed descent route
  private buildRoutes(): void {
    for (let i = 0; i < NUM_LAYERS; i++) {
      const rng = new Rng(hash3(this.seed, i, 0x7011));
      const top = layerTopY(i);
      const bottom = hmBandY(i).top;
      const ctrl: { x: number; y: number; z: number }[] = [];
      if (i === 0) {
        ctrl.push({ x: 128, y: SURFACE_Y + 26, z: 84 });
        ctrl.push({ x: 128, y: SURFACE_Y + 14, z: 100 });
        ctrl.push({ x: 128, y: SURFACE_Y + 2, z: 120 });
        ctrl.push({ x: 132, y: SURFACE_Y - 18, z: 134 });
      } else {
        ctrl.push({ x: HM.exitX, y: top + 6, z: HM.exitZ });
        ctrl.push({ x: HM.exitX, y: top - 10, z: HM.exitZ });
      }
      const k = 4;
      for (let j = 1; j <= k; j++) {
        const y = top - 20 - (j / (k + 1)) * (BIOME_HEIGHT - 40);
        ctrl.push({ x: rng.range(52, 204), y, z: rng.range(52, 204) });
      }
      ctrl.push({ x: HM.cx, y: bottom + 14, z: HM.cz });
      ctrl.push({ x: HM.cx, y: bottom - 2, z: HM.cz });
      // Catmull-Rom sample
      const pts: RoutePoint[] = [];
      for (let s = 0; s < ctrl.length - 1; s++) {
        const p0 = ctrl[Math.max(0, s - 1)],
          p1 = ctrl[s],
          p2 = ctrl[s + 1],
          p3 = ctrl[Math.min(ctrl.length - 1, s + 2)];
        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
        const n = Math.max(2, Math.ceil(len / 5));
        for (let t = 0; t < n; t++) {
          const u = t / n;
          const x = cr(p0.x, p1.x, p2.x, p3.x, u);
          const y = cr(p0.y, p1.y, p2.y, p3.y, u);
          const z = cr(p0.z, p1.z, p2.z, p3.z, u);
          const r = 7.2 + 2.2 * this.nTunA.noise3(x / 23, y / 23, z / 23);
          pts.push({ x, y, z, r });
        }
      }
      const last = ctrl[ctrl.length - 1];
      pts.push({ x: last.x, y: last.y, z: last.z, r: 7 });
      this.routePoints.push(pts);
      for (let s = 0; s < pts.length - 1; s++) {
        const a = pts[s],
          b = pts[s + 1];
        const pad = Math.max(a.r, b.r) + 1;
        this.routeSegs.push({
          a, b,
          minX: Math.min(a.x, b.x) - pad, minY: Math.min(a.y, b.y) - pad, minZ: Math.min(a.z, b.z) - pad,
          maxX: Math.max(a.x, b.x) + pad, maxY: Math.max(a.y, b.y) + pad, maxZ: Math.max(a.z, b.z) + pad,
        });
      }
    }
  }

  private routeSegsFor(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): RouteSeg[] {
    const out: RouteSeg[] = [];
    for (const s of this.routeSegs) {
      if (s.maxX < x0 || s.minX > x1 || s.maxY < y0 || s.minY > y1 || s.maxZ < z0 || s.minZ > z1) continue;
      out.push(s);
    }
    return out;
  }

  /** Positive inside the route tunnel. */
  private routeOpen(segs: RouteSeg[], x: number, y: number, z: number): number {
    let best = -1;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const ax = s.a.x, ay = s.a.y, az = s.a.z;
      const bx = s.b.x - ax, by = s.b.y - ay, bz = s.b.z - az;
      const px = x - ax, py = y - ay, pz = z - az;
      const bb = bx * bx + by * by + bz * bz;
      let t = bb > 0 ? (px * bx + py * by + pz * bz) / bb : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = px - bx * t, dy = (py - by * t) * 1.15, dz = pz - bz * t;
      const r = s.a.r + (s.b.r - s.a.r) * t;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const o = (r - d) / r;
      if (o > best) best = o;
    }
    return best;
  }

  // ------------------------------------------------------------------ cave density
  /** Coarse openness sample at grid coordinates (world = 4*g). Positive = open. Pure + memoised. */
  private coarse(gx: number, gy: number, gz: number): number {
    const key = (gy * 80 + gz) * 80 + gx; // gx,gz < 65, gy < 513
    const c = this.coarseCache.get(key);
    if (c !== undefined) return c;
    if (this.coarseCache.size > 400000) this.coarseCache.clear();
    const v = this.computeCoarse(gx * G, gy * G, gz * G);
    this.coarseCache.set(key, v);
    return v;
  }

  private computeCoarse(x: number, y: number, z: number): number {
    const d = SURFACE_Y - y;
    if (d < 0) return -1; // above mines top: surface handled by heightmap
    const layer = Math.floor(d / LAYER_HEIGHT);
    if (layer >= NUM_LAYERS) return -1;
    const ld = d - layer * LAYER_HEIGHT;
    if (ld >= BIOME_HEIGHT) return -1; // holy mountain band: solid (temple carved separately)
    const b = BIOMES[layer];
    const s = b.cheeseScale;
    const ch = this.nCave.fbm3(x / s, (y * b.flatten) / s, z / s, 3);
    let open = (ch - b.cheese) * 2.2;
    const ta = this.nTunA.noise3(x / 52, y / 34, z / 52);
    const tb = this.nTunB.noise3(x / 52, y / 34, z / 52);
    const tun = (b.tunnelWidth - Math.sqrt(ta * ta + tb * tb)) * 4.5;
    if (tun > open) open = tun;
    // close caves towards band edges and world walls
    const fadeTop = ld < 14 ? (14 - ld) / 14 : 0;
    const fadeBot = BIOME_HEIGHT - ld < 14 ? (14 - (BIOME_HEIGHT - ld)) / 14 : 0;
    open -= Math.max(fadeTop, fadeBot) * 0.9;
    const dEdge = Math.min(x, z, WORLD_X - 1 - x, WORLD_Z - 1 - z);
    if (dEdge < 22) open -= ((22 - dEdge) / 22) * 0.9;
    return open;
  }

  private jitter(x: number, y: number, z: number): number {
    return ((hash4(x, y, z, this.seed) & 1023) / 1023 - 0.5) * 0.09;
  }

  /** Openness at a voxel ignoring structures (used for spawn/feature placement). */
  opennessAt(x: number, y: number, z: number): number {
    if (x < 0 || z < 0 || x >= WORLD_X || z >= WORLD_Z || y < 0 || y >= WORLD_Y) return -1;
    if (x < 2 || z < 2 || x >= WORLD_X - 2 || z >= WORLD_Z - 2 || y < 2) return -1;
    let open: number;
    if (y >= SURFACE_Y) {
      open = y >= this.surfaceHeight(x, z) ? 1 : -1;
    } else {
      const gx = x >> 2, gy = y >> 2, gz = z >> 2;
      const fx = (x & 3) / 4, fy = (y & 3) / 4, fz = (z & 3) / 4;
      open = tri(
        this.coarse(gx, gy, gz), this.coarse(gx + 1, gy, gz), this.coarse(gx, gy + 1, gz), this.coarse(gx + 1, gy + 1, gz),
        this.coarse(gx, gy, gz + 1), this.coarse(gx + 1, gy, gz + 1), this.coarse(gx, gy + 1, gz + 1), this.coarse(gx + 1, gy + 1, gz + 1),
        fx, fy, fz,
      ) + this.jitter(x, y, z);
    }
    const segs = this.routeSegsFor(x, y, z, x, y, z);
    if (segs.length) {
      const r = this.routeOpen(segs, x, y, z);
      if (r > open) open = r;
    }
    const t = this.templeOverride(x, y, z);
    if (t >= 0) return t === AIR ? 1 : -1;
    return open;
  }

  isOpen(x: number, y: number, z: number): boolean {
    return this.opennessAt(x, y, z) > 0;
  }

  // ------------------------------------------------------------------ holy mountain temples
  /** Returns forced material for temple geometry, or -1 when not part of a temple. */
  templeOverride(x: number, y: number, z: number): number {
    const d = SURFACE_Y - y;
    if (d < 0) return -1;
    const layer = Math.floor(d / LAYER_HEIGHT);
    if (layer >= NUM_LAYERS) return -1;
    const ld = d - layer * LAYER_HEIGHT;
    if (ld < BIOME_HEIGHT) return -1;
    const band = hmBandY(layer);
    const final = layer === NUM_LAYERS - 1;
    const floor = band.bottom + (final ? 10 : HM.floorOffset);
    const roomH = final ? 40 : HM.roomHeight;
    const rx0 = final ? 80 : HM.roomX0, rx1 = final ? 176 : HM.roomX1;
    const rz0 = final ? 80 : HM.roomZ0, rz1 = final ? 176 : HM.roomZ1;
    const w = HM.wall;
    const inX = x >= rx0 && x < rx1, inZ = z >= rz0 && z < rz1;
    const inY = y >= floor && y < floor + roomH;
    // entrance shaft from band top down to room ceiling
    const ds = Math.hypot(x + 0.5 - HM.cx, z + 0.5 - HM.cz);
    if (y >= floor + roomH && y < band.top) {
      if (ds < HM.shaftRadius) return AIR;
      if (ds < HM.shaftRadius + 2) return TEMPLEBRICK;
    }
    if (!final) {
      // exit shaft from room floor down to band bottom
      const de = Math.hypot(x + 0.5 - HM.exitX, z + 0.5 - HM.exitZ);
      if (y < floor && y >= band.bottom) {
        if (de < 4.5) return AIR;
        if (de < 6.5) return TEMPLEBRICK;
      }
    }
    if (inX && inZ && inY) {
      // interior details
      if (!final) {
        // shop pedestals along the -z wall
        const relY = y - floor;
        for (let i = 0; i < 5; i++) {
          const px = HM.roomX0 + 8 + i * 7;
          if (x >= px - 1 && x <= px + 1 && z >= HM.roomZ0 + 4 && z <= HM.roomZ0 + 6 && relY < 2) return TEMPLEBRICK;
        }
        // perk altar on the +z side
        if (x >= HM.cx - 9 && x <= HM.cx + 9 && z >= HM.roomZ1 - 7 && z <= HM.roomZ1 - 4 && relY < 1) return TEMPLEBRICK;
        // lamps in the corners of the ceiling
        if (relY === roomH - 1 && ((x - rx0) % 12 === 5) && (z === rz0 || z === rz1 - 1)) return LAMP;
      } else {
        const relY = y - floor;
        if (Math.hypot(x + 0.5 - 128, z + 0.5 - 128) < 6 && relY < 3) return matId('goldore');
        if (relY === roomH - 1 && (x - rx0) % 16 === 8 && (z - rz0) % 16 === 8) return LAMP;
      }
      return AIR;
    }
    if (x >= rx0 - w && x < rx1 + w && z >= rz0 - w && z < rz1 + w && y >= floor - w && y < floor + roomH + w) {
      if (!final) {
        // lamp sconces in walls
        const relY = y - floor;
        if (relY === 6 && (x === rx0 - 1 || x === rx1) && (z - rz0) % 10 === 5) return LAMP;
      }
      return TEMPLEBRICK;
    }
    return DENSEROCK;
  }

  // ------------------------------------------------------------------ region features (structures, pools, spawns)
  private region(rx: number, ry: number, rz: number): RegionFeatures {
    const key = (ry * 16 + rz) * 16 + rx;
    const c = this.regionCache.get(key);
    if (c) return c;
    if (this.regionCache.size > 4000) this.regionCache.clear();
    const f = this.computeRegion(rx, ry, rz);
    this.regionCache.set(key, f);
    return f;
  }

  private computeRegion(rx: number, ry: number, rz: number): RegionFeatures {
    const out: RegionFeatures = { boxes: [], pools: [], spawns: [] };
    const x0 = rx * REGION, y0 = ry * REGION, z0 = rz * REGION;
    const rng = new Rng(hash4(this.seed, rx, ry, rz));
    const midY = y0 + REGION / 2;
    const d = SURFACE_Y - midY;
    if (d < 0) {
      this.surfaceFeatures(rx, ry, rz, rng, out);
      return out;
    }
    const layer = Math.floor(d / LAYER_HEIGHT);
    if (layer >= NUM_LAYERS) return out;
    const ld = d - layer * LAYER_HEIGHT;
    if (ld >= BIOME_HEIGHT) {
      this.templeSpawns(layer, x0, y0, z0, out);
      return out;
    }
    const b = BIOMES[layer];
    const depthFactor = layer + ld / BIOME_HEIGHT; // 0..NUM_LAYERS

    // liquid pools
    if (rng.chance(b.poolChance)) {
      const px = x0 + rng.int(4, REGION - 4), py = y0 + rng.int(4, REGION - 4), pz = z0 + rng.int(4, REGION - 4);
      if (this.isOpen(px, py, pz)) {
        const fy = this.floorBelow(px, py, pz, 24);
        if (fy !== null) {
          const name = rng.weighted(b.pools, (p) => p[1])[0];
          const r = rng.range(6, 12);
          out.pools.push({ x: px, y: fy + 1, z: pz, r, level: fy + rng.int(2, 5), mat: matId(name) });
        }
      }
    }
    // gas pockets
    if (b.gasPockets && rng.chance(0.18)) {
      const px = x0 + rng.int(4, REGION - 4), py = y0 + rng.int(4, REGION - 4), pz = z0 + rng.int(4, REGION - 4);
      if (this.isOpen(px, py, pz)) {
        const name = rng.weighted(b.gasPockets, (p) => p[1])[0];
        out.pools.push({ x: px, y: py, z: pz, r: rng.range(5, 9), level: py + 99, mat: matId(name) });
      }
    }
    // structures
    this.structureFeatures(b, rng, x0, y0, z0, out);

    // enemies
    const attempts = Math.round(b.enemyDensity * 1.1 + rng.next() * 0.8);
    for (let a = 0; a < attempts; a++) {
      const px = x0 + rng.int(2, REGION - 3), py = y0 + rng.int(2, REGION - 3), pz = z0 + rng.int(2, REGION - 3);
      const type = rng.weighted(b.enemies, (e) => e[1])[0];
      const flying = type === 'bat' || type === 'firebug' || type === 'jetpack' || type === 'ukko';
      if (!this.isOpen(px, py, pz)) continue;
      if (flying) {
        if (this.isOpen(px, py + 3, pz)) out.spawns.push({ kind: 'enemy', x: px + 0.5, y: py, z: pz + 0.5, seed: rng.nextU32(), data: { type, depth: depthFactor } });
        continue;
      }
      const fy = this.floorBelow(px, py, pz, 20);
      if (fy === null) continue;
      if (!this.isOpen(px, fy + 5, pz) || !this.isOpen(px, fy + 8, pz)) continue;
      out.spawns.push({ kind: 'enemy', x: px + 0.5, y: fy + 1.01, z: pz + 0.5, seed: rng.nextU32(), data: { type, depth: depthFactor } });
    }
    // loot lying around
    const lootRolls: [string, number][] = [['wand', 0.1], ['spell', 0.22], ['potion', 0.16], ['gold', 0.18], ['chest', 0.035], ['barrel', 0.18], ['heart', 0.02]];
    for (const [kind, p] of lootRolls) {
      if (!rng.chance(p)) continue;
      const px = x0 + rng.int(2, REGION - 3), py = y0 + rng.int(2, REGION - 3), pz = z0 + rng.int(2, REGION - 3);
      if (!this.isOpen(px, py, pz)) continue;
      const fy = this.floorBelow(px, py, pz, 24);
      if (fy === null || !this.isOpen(px, fy + 3, pz)) continue;
      out.spawns.push({ kind, x: px + 0.5, y: fy + 1.01, z: pz + 0.5, seed: rng.nextU32(), data: { tier: b.lootTier, depth: depthFactor, biome: b.id } });
    }
    return out;
  }

  private surfaceFeatures(rx: number, ry: number, rz: number, rng: Rng, out: RegionFeatures): void {
    // Start area dressing: moss covered stone pillar with the controls carving, a great stone head statue.
    const x0 = rx * REGION, y0 = ry * REGION, z0 = rz * REGION;
    if (rx === 3 && rz === 1) {
      const h = this.surfaceHeight(112, 56);
      if (h >= y0 - 40 && h < y0 + REGION) {
        out.boxes.push({ x0: 108, y0: h - 2, z0: 54, x1: 115, y1: h + 22, z1: 60, mat: ROCK, mode: 'all' });
        out.boxes.push({ x0: 108, y0: h + 22, z0: 54, x1: 115, y1: h + 23, z1: 60, mat: GRASS, mode: 'all' });
        out.spawns.push({ kind: 'tutorial', x: 111.5, y: h + 10, z: 53.6, seed: 1 });
      }
    }
    if (rx === 4 && rz === 2) {
      // giant head statue at (146, h, 74)
      const cx = 146, cz = 76;
      const h = this.surfaceHeight(cx, cz);
      if (h >= y0 - 40 && h < y0 + REGION) {
        out.boxes.push({ x0: cx - 8, y0: h - 3, z0: cz - 6, x1: cx + 8, y1: h + 20, z1: cz + 6, mat: ROCK, mode: 'all' });
        out.boxes.push({ x0: cx - 6, y0: h + 20, z0: cz - 5, x1: cx + 6, y1: h + 24, z1: cz + 5, mat: ROCK, mode: 'all' });
        // eyes & mouth (recessed)
        out.boxes.push({ x0: cx - 5, y0: h + 13, z0: cz - 7, x1: cx - 2, y1: h + 15, z1: cz - 5, mat: AIR, mode: 'all' });
        out.boxes.push({ x0: cx + 2, y0: h + 13, z0: cz - 7, x1: cx + 5, y1: h + 15, z1: cz - 5, mat: AIR, mode: 'all' });
        out.boxes.push({ x0: cx - 3, y0: h + 5, z0: cz - 7, x1: cx + 3, y1: h + 7, z1: cz - 5, mat: AIR, mode: 'all' });
        out.boxes.push({ x0: cx - 8, y0: h + 23, z0: cz - 6, x1: cx + 8, y1: h + 24, z1: cz + 6, mat: GRASS, mode: 'air' });
      }
    }
    if (rx === 4 && rz === 1 && ry === Math.floor((this.surfaceHeight(128, 44) + 1) / REGION)) {
      out.spawns.push({ kind: 'start', x: 128.5, y: this.surfaceHeight(128, 44) + 0.02, z: 44.5, seed: rng.nextU32() });
    }
    // a few trees (dead pines) on the slopes
    for (let i = 0; i < 2; i++) {
      const tx = x0 + rng.int(3, REGION - 4), tz = z0 + rng.int(3, REGION - 4);
      const h = this.surfaceHeight(tx, tz);
      if (h < y0 || h >= y0 + REGION) continue;
      if (Math.hypot(tx - 128, tz - 90) < 22 || Math.hypot(tx - 128, tz - 44) < 18) continue;
      const th = rng.int(10, 20);
      out.boxes.push({ x0: tx, y0: h, z0: tz, x1: tx + 2, y1: h + th, z1: tz + 2, mat: WOOD, mode: 'air' });
      for (let k = 0; k < 3; k++) {
        const w = 5 - k;
        out.boxes.push({ x0: tx - w + 1, y0: h + th - 6 + k * 3, z0: tz - w + 1, x1: tx + w + 1, y1: h + th - 4 + k * 3, z1: tz + w + 1, mat: GRASS, mode: 'air' });
      }
    }
  }

  private templeSpawns(layer: number, x0: number, y0: number, z0: number, out: RegionFeatures): void {
    const band = hmBandY(layer);
    const final = layer === NUM_LAYERS - 1;
    const floor = band.bottom + (final ? 10 : HM.floorOffset);
    const inRegion = (x: number, y: number, z: number) => x >= x0 && x < x0 + REGION && y >= y0 && y < y0 + REGION && z >= z0 && z < z0 + REGION;
    const add = (kind: string, x: number, y: number, z: number, idx: number) => {
      if (inRegion(Math.floor(x), Math.floor(y), Math.floor(z)))
        out.spawns.push({ kind, x, y, z, seed: hash4(this.seed, layer, idx, 0x4d4d), data: { layer, index: idx } });
    };
    if (final) {
      add('sampo', 128.5, floor + 3.2, 128.5, 0);
      return;
    }
    for (let i = 0; i < 5; i++) add('hm_shop', HM.roomX0 + 8 + i * 7 + 0.5, floor + 2.05, HM.roomZ0 + 5.5, i);
    for (let i = 0; i < 3; i++) add('hm_perk', HM.cx - 6 + i * 6 + 0.5, floor + 2.2, HM.roomZ1 - 5.5, 10 + i);
    add('hm_refresher', HM.roomX0 + 4.5, floor + 0.05, HM.cz + 6.5, 20);
    add('hm_heart', HM.cx + 0.5, floor + 1.5, HM.cz + 0.5, 21);
    add('hm_sign', HM.exitX + 0.5, floor + 6, HM.exitZ + 0.5, 22);
    add('hm_trigger', HM.cx + 0.5, floor + 1, HM.cz + 0.5, 23);
  }

  private structureFeatures(b: BiomeDef, rng: Rng, x0: number, y0: number, z0: number, out: RegionFeatures): void {
    const tries = 3;
    for (let t = 0; t < tries; t++) {
      const px = x0 + rng.int(3, REGION - 4), py = y0 + rng.int(3, REGION - 4), pz = z0 + rng.int(3, REGION - 4);
      if (!this.isOpen(px, py, pz)) continue;
      const fy = this.floorBelow(px, py, pz, 30);
      const cy = this.ceilingAbove(px, py, pz, 30);
      const roll = rng.next();
      switch (b.structure) {
        case 'mines':
        case 'coalpits': {
          if (roll < 0.4 && fy !== null && py - fy >= 7) {
            // plank platform with support beams
            const sx = rng.int(7, 15), sz = rng.int(4, 9), th = 2;
            out.boxes.push({ x0: px - (sx >> 1), y0: py, z0: pz - (sz >> 1), x1: px + (sx >> 1), y1: py + th, z1: pz + (sz >> 1), mat: WOOD, mode: 'air' });
            for (const [bx, bz] of [[px - (sx >> 1), pz - (sz >> 1)], [px + (sx >> 1) - 2, pz + (sz >> 1) - 2]]) {
              out.boxes.push({ x0: bx, y0: fy - 1, z0: bz, x1: bx + 2, y1: py, z1: bz + 2, mat: WOOD, mode: 'air' });
            }
            if (rng.chance(0.5)) out.boxes.push({ x0: px, y0: py + th, z0: pz, x1: px + 2, y1: py + th + 2, z1: pz + 1, mat: LAMP, mode: 'air' });
          } else if (roll < 0.75 && fy !== null && cy !== null && cy - fy < 26 && cy - fy > 9) {
            // mine shaft support frame: two posts and a beam
            const axis = rng.chance(0.5);
            const w = rng.int(5, 8);
            const ax = axis ? w : 0, az = axis ? 0 : w;
            out.boxes.push({ x0: px - ax, y0: fy, z0: pz - az, x1: px - ax + 2, y1: cy + 1, z1: pz - az + 2, mat: WOOD, mode: 'air' });
            out.boxes.push({ x0: px + ax, y0: fy, z0: pz + az, x1: px + ax + 2, y1: cy + 1, z1: pz + az + 2, mat: WOOD, mode: 'air' });
            out.boxes.push({ x0: px - ax, y0: cy - 2, z0: pz - az, x1: px + ax + 2, y1: cy, z1: pz + az + 2, mat: WOOD, mode: 'air' });
            if (rng.chance(0.4)) out.boxes.push({ x0: px, y0: cy - 4, z0: pz, x1: px + 2, y1: cy - 2, z1: pz + 2, mat: LAMP, mode: 'air' });
          } else if (roll < 0.88 && fy !== null) {
            // brick ruin wall
            const len = rng.int(8, 16), h = rng.int(5, 12);
            const axis = rng.chance(0.5);
            out.boxes.push({
              x0: px, y0: fy - 1, z0: pz, x1: px + (axis ? len : 3), y1: fy + h, z1: pz + (axis ? 3 : len), mat: BRICK, mode: 'air',
            });
          } else if (fy !== null && b.structure === 'coalpits') {
            out.boxes.push({ x0: px - 2, y0: fy, z0: pz - 2, x1: px + 2, y1: fy + 3, z1: pz + 2, mat: matId('coal'), mode: 'air' });
          }
          break;
        }
        case 'snow': {
          if (roll < 0.35 && cy !== null) {
            // icicles / ice pillars
            const len = rng.int(4, Math.max(5, Math.min(18, cy - py)));
            out.boxes.push({ x0: px, y0: cy - len, z0: pz, x1: px + 2, y1: cy + 1, z1: pz + 2, mat: ICE, mode: 'air' });
          } else if (roll < 0.6 && fy !== null && py - fy > 8) {
            const sx = rng.int(8, 14), sz = rng.int(5, 8);
            out.boxes.push({ x0: px - (sx >> 1), y0: py, z0: pz - (sz >> 1), x1: px + (sx >> 1), y1: py + 2, z1: pz + (sz >> 1), mat: WOOD, mode: 'air' });
            out.boxes.push({ x0: px - (sx >> 1), y0: py + 2, z0: pz - (sz >> 1), x1: px + (sx >> 1), y1: py + 3, z1: pz + (sz >> 1), mat: SNOW, mode: 'air' });
          } else if (roll < 0.75 && fy !== null) {
            out.boxes.push({ x0: px - 3, y0: fy, z0: pz - 3, x1: px + 3, y1: fy + rng.int(3, 7), z1: pz + 3, mat: ICE, mode: 'air' });
          }
          break;
        }
        case 'hiisi': {
          if (roll < 0.45 && fy !== null && py - fy > 6) {
            // steel catwalk
            const sx = rng.int(10, 20), sz = rng.int(4, 6);
            const ax = rng.chance(0.5);
            const lx = ax ? sx : sz, lz = ax ? sz : sx;
            out.boxes.push({ x0: px - (lx >> 1), y0: py, z0: pz - (lz >> 1), x1: px + (lx >> 1), y1: py + 1, z1: pz + (lz >> 1), mat: STEEL, mode: 'air' });
            out.boxes.push({ x0: px, y0: fy, z0: pz, x1: px + 1, y1: py, z1: pz + 1, mat: STEEL, mode: 'air' });
          } else if (roll < 0.75 && fy !== null) {
            // concrete bunker room shell
            const sx = rng.int(10, 16), sz = rng.int(10, 16), h = rng.int(9, 12);
            const bx = px - (sx >> 1), bz = pz - (sz >> 1);
            out.boxes.push({ x0: bx, y0: fy, z0: bz, x1: bx + sx, y1: fy + 1, z1: bz + sz, mat: CONCRETE, mode: 'all' });
            out.boxes.push({ x0: bx, y0: fy + h, z0: bz, x1: bx + sx, y1: fy + h + 1, z1: bz + sz, mat: CONCRETE, mode: 'all' });
            out.boxes.push({ x0: bx, y0: fy, z0: bz, x1: bx + 1, y1: fy + h, z1: bz + sz, mat: CONCRETE, mode: 'all' });
            out.boxes.push({ x0: bx + sx - 1, y0: fy, z0: bz, x1: bx + sx, y1: fy + h, z1: bz + sz, mat: CONCRETE, mode: 'all' });
            // interior air + door
            out.boxes.push({ x0: bx + 1, y0: fy + 1, z0: bz, x1: bx + sx - 1, y1: fy + h, z1: bz + sz, mat: AIR, mode: 'all' });
            out.boxes.push({ x0: bx + 1, y0: fy + h - 1, z0: bz + (sz >> 1), x1: bx + 3, y1: fy + h, z1: bz + (sz >> 1) + 1, mat: LAMP, mode: 'all' });
          } else if (cy !== null) {
            out.boxes.push({ x0: px, y0: cy - 2, z0: pz, x1: px + 2, y1: cy, z1: pz + 2, mat: LAMP, mode: 'air' });
          }
          break;
        }
        case 'jungle': {
          if (roll < 0.4 && cy !== null) {
            // hanging vines
            for (let v = 0; v < 6; v++) {
              const vx = px + rng.int(-6, 6), vz = pz + rng.int(-6, 6);
              const vc = this.ceilingAbove(vx, py, vz, 30);
              if (vc === null) continue;
              out.boxes.push({ x0: vx, y0: vc - rng.int(4, 14), z0: vz, x1: vx + 1, y1: vc + 1, z1: vz + 1, mat: VINE, mode: 'air' });
            }
          } else if (roll < 0.7 && fy !== null) {
            // giant mushroom
            const h = rng.int(6, 14);
            out.boxes.push({ x0: px, y0: fy, z0: pz, x1: px + 2, y1: fy + h, z1: pz + 2, mat: matId('root'), mode: 'air' });
            const r = rng.int(3, 6);
            out.boxes.push({ x0: px - r, y0: fy + h, z0: pz - r, x1: px + r + 2, y1: fy + h + 2, z1: pz + r + 2, mat: FUNGUS, mode: 'air' });
          }
          break;
        }
        case 'vault': {
          if (roll < 0.5) {
            // glass pipe filled with liquid
            const len = rng.int(10, 24), axis = rng.int(0, 2);
            const liquid = matId(rng.pick(['toxic', 'acid', 'water', 'oil']));
            const ex = axis === 0 ? len : 3, ey = axis === 1 ? len : 3, ez = axis === 2 ? len : 3;
            out.boxes.push({ x0: px, y0: py, z0: pz, x1: px + ex, y1: py + ey, z1: pz + ez, mat: GLASS, mode: 'air' });
            out.boxes.push({
              x0: px + (axis === 0 ? 1 : 1), y0: py + 1, z0: pz + 1,
              x1: px + ex - 1, y1: py + ey - 1, z1: pz + ez - 1, mat: liquid, mode: 'all',
            });
          } else if (roll < 0.8 && fy !== null) {
            const sx = rng.int(6, 14);
            out.boxes.push({ x0: px, y0: fy, z0: pz, x1: px + sx, y1: fy + rng.int(4, 10), z1: pz + 2, mat: STEEL, mode: 'air' });
          } else if (cy !== null) {
            out.boxes.push({ x0: px, y0: cy - 1, z0: pz, x1: px + 2, y1: cy, z1: pz + 2, mat: LAMP, mode: 'air' });
          }
          break;
        }
        default:
          break;
      }
    }
    void CRYSTAL; void GOLDORE;
  }

  floorBelow(x: number, y: number, z: number, maxDist: number): number | null {
    for (let i = 1; i <= maxDist; i++) if (!this.isOpen(x, y - i, z)) return y - i;
    return null;
  }

  ceilingAbove(x: number, y: number, z: number, maxDist: number): number | null {
    for (let i = 1; i <= maxDist; i++) if (!this.isOpen(x, y + i, z)) return y + i;
    return null;
  }

  // ------------------------------------------------------------------ chunk generation
  generateChunk(cx: number, cy: number, cz: number): ChunkGenResult {
    const mat = new Uint8Array(CHUNK_VOL);
    const spawns: Spawn[] = [];
    const ox = cx * CHUNK, oy = cy * CHUNK, oz = cz * CHUNK;

    // openness for 16 x 17 x 16 (extra top layer for surface cover decisions) and one below
    const W = CHUNK, H = CHUNK + 2;
    const open = new Float32Array(W * H * W); // y index offset by +1 (yy = ly + 1)
    const segs = this.routeSegsFor(ox - 1, oy - 2, oz - 1, ox + CHUNK + 1, oy + CHUNK + 2, oz + CHUNK + 1);

    // coarse samples covering [oy-4, oy+20]
    const gx0 = ox >> 2, gy0 = (oy >> 2) - 1, gz0 = oz >> 2;
    const GN = 6, GY = 8;
    const grid = new Float32Array(GN * GY * GN);
    const needCoarse = oy - 4 < SURFACE_Y;
    if (needCoarse) {
      for (let gy = 0; gy < GY; gy++)
        for (let gz = 0; gz < GN; gz++)
          for (let gx = 0; gx < GN; gx++) grid[(gy * GN + gz) * GN + gx] = this.coarse(gx0 + gx, gy0 + gy, gz0 + gz);
    }
    const heights = new Int32Array(W * W);
    const needSurface = oy + CHUNK + 2 >= SURFACE_Y;
    if (needSurface) for (let lz = 0; lz < W; lz++) for (let lx = 0; lx < W; lx++) heights[lz * W + lx] = this.surfaceHeight(ox + lx, oz + lz);

    for (let yy = 0; yy < H; yy++) {
      const y = oy + yy - 1;
      for (let lz = 0; lz < W; lz++) {
        const z = oz + lz;
        for (let lx = 0; lx < W; lx++) {
          const x = ox + lx;
          let o: number;
          if (x < 2 || z < 2 || x >= WORLD_X - 2 || z >= WORLD_Z - 2 || y < 2 || y >= WORLD_Y - 1) o = -1;
          else if (y >= SURFACE_Y) o = y >= heights[lz * W + lx] ? 1 : -1;
          else {
            const ly4 = y - (gy0 << 2);
            const gx = lx >> 2, gy = ly4 >> 2, gz = lz >> 2;
            const fx = (lx & 3) / 4, fy = (ly4 & 3) / 4, fz = (lz & 3) / 4;
            const i000 = (gy * GN + gz) * GN + gx;
            o = tri(
              grid[i000], grid[i000 + 1], grid[i000 + GN * GN], grid[i000 + GN * GN + 1],
              grid[i000 + GN], grid[i000 + GN + 1], grid[i000 + GN * GN + GN], grid[i000 + GN * GN + GN + 1],
              fx, fy, fz,
            ) + this.jitter(x, y, z);
          }
          if (segs.length && o < 1) {
            const r = this.routeOpen(segs, x, y, z);
            if (r > o) o = r;
          }
          open[(yy * W + lz) * W + lx] = o;
        }
      }
    }

    // temple override & material assignment
    for (let ly = 0; ly < CHUNK; ly++) {
      const y = oy + ly;
      const d = SURFACE_Y - y;
      const layer = d < 0 ? -1 : Math.floor(d / LAYER_HEIGHT);
      const biome = layer >= 0 && layer < NUM_LAYERS ? BIOMES[layer] : BIOMES[0];
      const inBand = layer >= 0 && layer < NUM_LAYERS && d - layer * LAYER_HEIGHT >= BIOME_HEIGHT;
      for (let lz = 0; lz < CHUNK; lz++) {
        const z = oz + lz;
        for (let lx = 0; lx < CHUNK; lx++) {
          const x = ox + lx;
          const i = (ly << 8) | (lz << 4) | lx;
          if (x < 2 || z < 2 || x >= WORLD_X - 2 || z >= WORLD_Z - 2 || y < 2) {
            mat[i] = BEDROCK;
            continue;
          }
          if (inBand) {
            const t = this.templeOverride(x, y, z);
            mat[i] = t >= 0 ? t : DENSEROCK;
            continue;
          }
          const o = open[((ly + 1) * W + lz) * W + lx];
          if (o > 0) {
            mat[i] = AIR;
            continue;
          }
          const above = open[((ly + 2) * W + lz) * W + lx] > 0;
          const below = open[(ly * W + lz) * W + lx] > 0;
          mat[i] = layer < 0 ? this.surfaceMaterial(x, y, z, above, heights[lz * W + lx]) : this.biomeMaterial(biome, x, y, z, above, below, o);
        }
      }
    }

    // region features
    const rx0 = Math.max(0, Math.floor((ox - REGION) / REGION)), rx1 = Math.floor((ox + CHUNK + REGION) / REGION);
    const ry0 = Math.max(0, Math.floor((oy - REGION) / REGION)), ry1 = Math.floor((oy + CHUNK + REGION) / REGION);
    const rz0 = Math.max(0, Math.floor((oz - REGION) / REGION)), rz1 = Math.floor((oz + CHUNK + REGION) / REGION);
    for (let ry = ry0; ry <= ry1; ry++)
      for (let rz = rz0; rz <= Math.min(rz1, 7); rz++)
        for (let rx = rx0; rx <= Math.min(rx1, 7); rx++) {
          if (ry * REGION >= WORLD_Y) continue;
          const f = this.region(rx, ry, rz);
          for (const p of f.pools) this.stampPool(mat, ox, oy, oz, p);
          for (const bx of f.boxes) this.stampBox(mat, ox, oy, oz, bx);
          for (const s of f.spawns) {
            if (s.x >= ox && s.x < ox + CHUNK && s.y >= oy && s.y < oy + CHUNK && s.z >= oz && s.z < oz + CHUNK) spawns.push(s);
          }
        }
    return { mat, spawns };
  }

  private surfaceMaterial(x: number, y: number, z: number, airAbove: boolean, h: number): number {
    if (airAbove || y === h - 1) return GRASS;
    const n = this.nMat.noise3(x / 14, y / 10, z / 14);
    if (n > 0.45) return ROCK;
    if (h - y > 30 && n < -0.5) return DENSEROCK;
    return SOIL;
  }

  private biomeMaterial(b: BiomeDef, x: number, y: number, z: number, airAbove: boolean, airBelow: boolean, o: number): number {
    const h = hash4(x, y, z, this.seed ^ 0x5151);
    if (airAbove && b.cover && (h & 1023) / 1023 < b.coverChance!) return matId(b.cover);
    if (airAbove && b.powderFloor && ((h >>> 10) & 1023) / 1023 < b.powderChance!) return matId(b.powderFloor);
    if (airBelow && b.ceilingCover && ((h >>> 20) & 1023) / 1023 < b.ceilingChance!) return matId(b.ceilingCover);
    const n = this.nMat.noise3(x / 16, (y * 1.3) / 16, z / 16);
    if (n > b.lumpThreshold) return matId(b.lump);
    const deep = o < -0.75;
    if (deep && this.nMat2.noise3(x / 30, y / 30, z / 30) > 0.45) return matId(b.dense);
    if (b.vein) {
      const v = this.nMat2.noise3(x / 9, y / 7, z / 9);
      if (v > b.veinThreshold!) return matId(b.vein);
    }
    return matId(b.base);
  }

  private stampPool(mat: Uint8Array, ox: number, oy: number, oz: number, p: Sphere): void {
    const r = p.r;
    const x0 = Math.max(ox, Math.floor(p.x - r)), x1 = Math.min(ox + CHUNK - 1, Math.ceil(p.x + r));
    const y0 = Math.max(oy, Math.floor(p.y - r)), y1 = Math.min(oy + CHUNK - 1, Math.min(Math.ceil(p.y + r), p.level));
    const z0 = Math.max(oz, Math.floor(p.z - r)), z1 = Math.min(oz + CHUNK - 1, Math.ceil(p.z + r));
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const dx = x - p.x, dy = (y - p.y) * 1.4, dz = z - p.z;
          if (dx * dx + dy * dy + dz * dz > r * r) continue;
          const i = ((y - oy) << 8) | ((z - oz) << 4) | (x - ox);
          if (mat[i] === AIR) mat[i] = p.mat;
        }
  }

  private stampBox(mat: Uint8Array, ox: number, oy: number, oz: number, b: Box): void {
    const x0 = Math.max(ox, b.x0), x1 = Math.min(ox + CHUNK, b.x1);
    const y0 = Math.max(oy, b.y0), y1 = Math.min(oy + CHUNK, b.y1);
    const z0 = Math.max(oz, b.z0), z1 = Math.min(oz + CHUNK, b.z1);
    if (x0 >= x1 || y0 >= y1 || z0 >= z1) return;
    for (let y = y0; y < y1; y++)
      for (let z = z0; z < z1; z++)
        for (let x = x0; x < x1; x++) {
          if (x < 2 || z < 2 || x >= WORLD_X - 2 || z >= WORLD_Z - 2) continue;
          const i = ((y - oy) << 8) | ((z - oz) << 4) | (x - ox);
          const cur = mat[i];
          if (cur === BEDROCK || cur === TEMPLEBRICK) continue;
          if (b.mode === 'air' && cur !== AIR) continue;
          if (b.mode === 'solid' && cur === AIR) continue;
          mat[i] = b.mat;
        }
  }
}

function smooth(t: number): number {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

function cr(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function tri(
  c000: number, c100: number, c010: number, c110: number,
  c001: number, c101: number, c011: number, c111: number,
  fx: number, fy: number, fz: number,
): number {
  const x00 = c000 + (c100 - c000) * fx;
  const x10 = c010 + (c110 - c010) * fx;
  const x01 = c001 + (c101 - c001) * fx;
  const x11 = c011 + (c111 - c011) * fx;
  const y0 = x00 + (x10 - x00) * fy;
  const y1 = x01 + (x11 - x01) * fy;
  return y0 + (y1 - y0) * fz;
}

export const _internal = { tri, HM_HEIGHT };
