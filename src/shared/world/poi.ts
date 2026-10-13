import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT } from '../constants';
import { hash4, mulberry32, smoothstep } from '../math';
import { B } from './blocks';
import { Biome } from './biomes';
import { cidx } from './chunk';
import type { WorldGenerator } from './worldgen';

/**
 * Points of interest ("monuments"): original procedurally-built locations
 * that concentrate loot and risk. One POI at most per REGION x REGION area,
 * placed on flattened land. Every chunk can independently re-stamp the parts
 * of a POI it overlaps, so generation stays a pure function of the seed.
 */

export const POI_REGION = 384;
const SKIRT = 14;
const MARGIN = 40;

export type PoiKind = 'container_yard' | 'globe_tank' | 'radio_outpost' | 'bunker';

export interface PoiDef {
  kind: PoiKind;
  name: string;
  w: number;
  d: number;
  /** Peak radiation level at the centre (0 = none). */
  radiation: number;
  radRadius: number;
  /** Relative spawn weight. */
  weight: number;
  tier: 'low' | 'mid' | 'high';
}

export const POI_DEFS: Record<PoiKind, PoiDef> = {
  radio_outpost: { kind: 'radio_outpost', name: 'Radio Outpost', w: 22, d: 22, radiation: 0, radRadius: 0, weight: 4, tier: 'low' },
  container_yard: { kind: 'container_yard', name: 'Container Yard', w: 44, d: 34, radiation: 4, radRadius: 26, weight: 3, tier: 'mid' },
  globe_tank: { kind: 'globe_tank', name: 'Globe Tank', w: 30, d: 30, radiation: 10, radRadius: 20, weight: 2, tier: 'high' },
  bunker: { kind: 'bunker', name: 'Sealed Bunker', w: 24, d: 20, radiation: 18, radRadius: 16, weight: 2, tier: 'high' },
};

export interface PoiInstance {
  def: PoiDef;
  x0: number;
  z0: number;
  /** Floor level (y of the ground layer). */
  y: number;
  seed: number;
  cx: number;
  cz: number;
}

type Setter = (x: number, y: number, z: number, id: number) => void;

export class PoiIndex {
  private cache = new Map<number, PoiInstance | null>();

  constructor(private gen: WorldGenerator) {}

  regionPoi(rx: number, rz: number): PoiInstance | null {
    const key = (rx + 32768) * 65536 + (rz + 32768);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const poi = this.computeRegion(rx, rz);
    this.cache.set(key, poi);
    return poi;
  }

  private computeRegion(rx: number, rz: number): PoiInstance | null {
    const h = hash4(rx, rz, this.gen.seed, 0x9013);
    const rnd = mulberry32(h);
    if (rnd() > 0.75) return null;
    const defs = Object.values(POI_DEFS);
    const total = defs.reduce((a, d) => a + d.weight, 0);
    let pick = rnd() * total;
    let def = defs[0];
    for (const d of defs) {
      pick -= d.weight;
      if (pick <= 0) { def = d; break; }
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      const span = POI_REGION - 2 * MARGIN - Math.max(def.w, def.d);
      const x0 = rx * POI_REGION + MARGIN + Math.floor(rnd() * span);
      const z0 = rz * POI_REGION + MARGIN + Math.floor(rnd() * span);
      const pts = [[0, 0], [def.w, 0], [0, def.d], [def.w, def.d], [def.w >> 1, def.d >> 1]];
      let min = Infinity, max = -Infinity, sum = 0, ok = true;
      for (const [ox, oz] of pts) {
        const c = this.gen.rawColumn(x0 + ox, z0 + oz);
        if (c.height < SEA_LEVEL + 1 || c.biome === Biome.Mountains || c.biome === Biome.River || c.river > 0.1) { ok = false; break; }
        min = Math.min(min, c.height);
        max = Math.max(max, c.height);
        sum += c.height;
      }
      if (!ok || max - min > 12) continue;
      const y = Math.max(SEA_LEVEL + 2, Math.round(sum / pts.length));
      return { def, x0, z0, y, seed: h, cx: x0 + (def.w >> 1), cz: z0 + (def.d >> 1) };
    }
    return null;
  }

  private poiAt(x: number, z: number): PoiInstance | null {
    return this.regionPoi(Math.floor(x / POI_REGION), Math.floor(z / POI_REGION));
  }

  /** Terrain flattening target for a column, or null. weight=1 inside the footprint. */
  flatten(x: number, z: number): { y: number; weight: number } | null {
    const p = this.poiAt(x, z);
    if (!p) return null;
    const dx = Math.max(p.x0 - x, 0, x - (p.x0 + p.def.w - 1));
    const dz = Math.max(p.z0 - z, 0, z - (p.z0 + p.def.d - 1));
    const d = Math.max(dx, dz);
    if (d > SKIRT) return null;
    return { y: p.y, weight: d === 0 ? 1 : 1 - smoothstep(0, SKIRT, d) };
  }

  /** Radiation level (0..) at a world position from nearby POIs. */
  radiationAt(x: number, y: number, z: number): number {
    const p = this.poiAt(Math.floor(x), Math.floor(z));
    if (!p || p.def.radiation <= 0) return 0;
    const d = Math.hypot(x - p.cx, z - p.cz, (y - p.y) * 0.5);
    if (d > p.def.radRadius) return 0;
    return p.def.radiation * (1 - smoothstep(p.def.radRadius * 0.5, p.def.radRadius, d));
  }

  /** All POIs whose region intersects the square around (x,z). */
  poisNear(x: number, z: number, radius: number): PoiInstance[] {
    const out: PoiInstance[] = [];
    const r0x = Math.floor((x - radius) / POI_REGION), r1x = Math.floor((x + radius) / POI_REGION);
    const r0z = Math.floor((z - radius) / POI_REGION), r1z = Math.floor((z + radius) / POI_REGION);
    for (let rz = r0z; rz <= r1z; rz++) for (let rx = r0x; rx <= r1x; rx++) {
      const p = this.regionPoi(rx, rz);
      if (p) out.push(p);
    }
    return out;
  }

  stampChunk(data: Uint8Array, cx: number, cz: number) {
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
    const p = this.poiAt(x0, z0);
    if (!p) return;
    if (x0 + CHUNK_SIZE <= p.x0 - 2 || x0 > p.x0 + p.def.w + 2 || z0 + CHUNK_SIZE <= p.z0 - 2 || z0 > p.z0 + p.def.d + 2) return;
    const set: Setter = (x, y, z, id) => {
      const lx = x - x0, lz = z - z0;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 1 || y >= WORLD_HEIGHT) return;
      data[cidx(lx, y, lz)] = id;
    };
    // Clear the air above the pad (removes trees from neighbouring cells, keeps things tidy).
    for (let z = Math.max(z0, p.z0); z < Math.min(z0 + CHUNK_SIZE, p.z0 + p.def.d); z++) {
      for (let x = Math.max(x0, p.x0); x < Math.min(x0 + CHUNK_SIZE, p.x0 + p.def.w); x++) {
        for (let y = p.y + 1; y < Math.min(WORLD_HEIGHT, p.y + 40); y++) set(x, y, z, B.air);
      }
    }
    BUILDERS[p.def.kind](set, p, mulberry32(p.seed));
  }
}

// --- Builders -----------------------------------------------------------------

function box(set: Setter, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number) {
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, y, z, id);
}

function hollowBox(set: Setter, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number) {
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const edge = x === x0 || x === x1 || y === y0 || y === y1 || z === z0 || z === z1;
    set(x, y, z, edge ? id : B.air);
  }
}

function pad(set: Setter, p: PoiInstance, id: number) {
  box(set, p.x0, p.y - 2, p.z0, p.x0 + p.def.w - 1, p.y, p.z0 + p.def.d - 1, id);
}

/** A shipping container lying along x, open at its +x end (interior 5x1x2). */
function container(set: Setter, x: number, y: number, z: number, color: number, rnd: () => number) {
  const L = 7, W = 3, H = 4;
  const x1 = x + L - 1, z1 = z + W - 1;
  hollowBox(set, x, y, z, x1, y + H - 1, z1, color);
  box(set, x1, y + 1, z + 1, x1, y + 2, z + 1, B.air);
  if (rnd() < 0.7) set(x + 1, y + 1, z + 1, rnd() < 0.15 ? B.military_crate : B.loot_crate);
}

const BUILDERS: Record<PoiKind, (set: Setter, p: PoiInstance, rnd: () => number) => void> = {
  radio_outpost(set, p, rnd) {
    pad(set, p, B.gravel);
    const y = p.y;
    // concrete hut 9x9x5 with a doorway
    const hx = p.x0 + 2, hz = p.z0 + 2;
    hollowBox(set, hx, y, hz, hx + 8, y + 5, hz + 8, B.concrete);
    box(set, hx + 4, y + 1, hz + 8, hx + 4, y + 2, hz + 8, B.air);
    box(set, hx + 1, y + 3, hz, hx + 2, y + 3, hz, B.glass);
    box(set, hx + 6, y + 3, hz, hx + 7, y + 3, hz, B.glass);
    set(hx + 1, y + 1, hz + 1, B.loot_crate);
    set(hx + 7, y + 1, hz + 1, B.loot_crate);
    set(hx + 7, y + 1, hz + 6, B.barrel);
    set(hx + 4, y + 4, hz + 4, B.lamp);
    // lattice radio tower
    const tx = p.x0 + 15, tz = p.z0 + 14;
    const H = 30 + Math.floor(rnd() * 8);
    for (let k = 1; k <= H; k++) {
      for (const [ox, oz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) set(tx + ox, y + k, tz + oz, B.steel_beam);
      if (k % 5 === 0) {
        box(set, tx, y + k, tz, tx + 3, y + k, tz, B.steel_beam);
        box(set, tx, y + k, tz + 3, tx + 3, y + k, tz + 3, B.steel_beam);
        box(set, tx, y + k, tz, tx, y + k, tz + 3, B.steel_beam);
        box(set, tx + 3, y + k, tz, tx + 3, y + k, tz + 3, B.steel_beam);
      }
    }
    set(tx + 1, y + H + 1, tz + 1, B.lamp);
    for (let i = 0; i < 3; i++) set(p.x0 + 3 + Math.floor(rnd() * 16), y + 1, p.z0 + 13 + Math.floor(rnd() * 7), B.barrel);
  },

  container_yard(set, p, rnd) {
    pad(set, p, B.asphalt);
    const y = p.y;
    const colors = [B.container_red, B.container_blue, B.container_teal];
    // hazard border + fence
    for (let x = p.x0; x < p.x0 + p.def.w; x++) {
      for (const z of [p.z0, p.z0 + p.def.d - 1]) {
        set(x, y, z, B.hazard_stripes);
        if ((x - p.x0) % 12 > 2) set(x, y + 1, z, B.chain_fence), set(x, y + 2, z, B.chain_fence);
      }
    }
    for (let z = p.z0; z < p.z0 + p.def.d; z++) {
      for (const x of [p.x0, p.x0 + p.def.w - 1]) {
        set(x, y, z, B.hazard_stripes);
        if ((z - p.z0) % 12 > 2) set(x, y + 1, z, B.chain_fence), set(x, y + 2, z, B.chain_fence);
      }
    }
    // container stacks in rows
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const cx = p.x0 + 4 + col * 10;
        const cz = p.z0 + 4 + row * 9;
        const stack = 1 + Math.floor(rnd() * 3);
        for (let s = 0; s < stack; s++) {
          container(set, cx, y + 1 + s * 4, cz, colors[Math.floor(rnd() * colors.length)], rnd);
        }
      }
    }
    // gantry crane
    const gx = p.x0 + p.def.w - 7;
    const H = 18;
    for (let k = 1; k <= H; k++) {
      set(gx, y + k, p.z0 + 3, B.steel_beam);
      set(gx, y + k, p.z0 + p.def.d - 4, B.steel_beam);
      set(gx + 2, y + k, p.z0 + 3, B.steel_beam);
      set(gx + 2, y + k, p.z0 + p.def.d - 4, B.steel_beam);
    }
    box(set, gx, y + H + 1, p.z0 + 3, gx + 2, y + H + 2, p.z0 + p.def.d - 4, B.hazard_stripes);
    box(set, gx + 1, y + H, p.z0 + 10, gx + 1, y + H, p.z0 + 10, B.steel_beam);
    set(gx + 1, y + H - 1, p.z0 + 10, B.lamp);
    for (let i = 0; i < 8; i++) set(p.x0 + 2 + Math.floor(rnd() * (p.def.w - 4)), y + 1, p.z0 + 2 + Math.floor(rnd() * (p.def.d - 4)), B.barrel);
    set(p.x0 + 2, y + 6, p.z0 + 2, B.lamp);
  },

  globe_tank(set, p, rnd) {
    pad(set, p, B.concrete);
    const y = p.y;
    const cx = p.x0 + 15, cz = p.z0 + 15;
    const R = 9;
    const cy = y + 8 + R;
    // legs
    for (const [ox, oz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
      for (let k = 1; k <= cy - y; k++) set(cx + ox, y + k, cz + oz, B.rusted_metal);
    }
    // sphere shell, hollow
    for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d <= R + 0.5) set(cx + dx, cy + dy, cz + dz, d >= R - 0.5 ? (dy === 0 || dy === 4 ? B.hazard_stripes : B.rusted_metal) : B.air);
    }
    // interior floor + loot
    box(set, cx - 5, cy - 3, cz - 5, cx + 5, cy - 3, cz + 5, B.steel_beam);
    set(cx, cy - 2, cz, B.military_crate);
    set(cx + 3, cy - 2, cz - 2, B.loot_crate);
    set(cx - 2, cy - 2, cz + 3, B.loot_crate);
    set(cx, cy + R - 2, cz, B.lamp);
    // spiral stair around a leg, entrance hole into the sphere
    let sx = cx - 9, sz = cz + 9;
    for (let k = 1; k <= cy - 3 - y; k++) {
      set(sx, y + k, sz, B.steel_beam);
      if (k % 4 === 0) set(sx, y + k + 1, sz, B.air);
      const step = Math.floor((k - 1) / 6) % 4;
      if (step === 0) sx = Math.min(sx + 1, cx + 9);
      else if (step === 1) sz = Math.max(sz - 1, cz - 9);
      else if (step === 2) sx = Math.max(sx - 1, cx - 9);
      else sz = Math.min(sz + 1, cz + 9);
    }
    // Walkway from the stair top into the side of the sphere.
    const wy = cy - 3;
    box(set, Math.min(sx, cx), wy, sz, Math.max(sx, cx), wy, sz, B.steel_beam);
    for (let x = Math.min(sx, cx); x <= Math.max(sx, cx); x++) {
      set(x, wy + 1, sz, B.air);
      set(x, wy + 2, sz, B.air);
    }
    for (let i = 0; i < 5; i++) set(p.x0 + 2 + Math.floor(rnd() * 26), y + 1, p.z0 + 2 + Math.floor(rnd() * 26), B.barrel);
  },

  bunker(set, p, rnd) {
    pad(set, p, B.gravel);
    const y = p.y;
    const bx = p.x0 + 4, bz = p.z0 + 11;
    // Underground hall: floor block at y-9, ceiling at y-3.
    hollowBox(set, bx, y - 9, bz, bx + 15, y - 3, bz + 8, B.concrete);
    for (let i = 0; i < 4; i++) set(bx + 2 + i * 4, y - 4, bz + 4, B.lamp);
    set(bx + 2, y - 8, bz + 2, B.military_crate);
    set(bx + 13, y - 8, bz + 6, B.military_crate);
    set(bx + 7, y - 8, bz + 7, B.loot_crate);
    set(bx + 13, y - 8, bz + 2, B.loot_crate);
    // Straight staircase descending along +z into the hall.
    for (let k = 0; k <= 9; k++) {
      const z = bz - 10 + k;
      const fy = y - k;
      box(set, bx + 6, fy, z, bx + 10, fy, z, B.concrete);
      box(set, bx + 7, fy + 1, z, bx + 9, Math.max(fy + 3, y + 3), z, B.air);
      box(set, bx + 6, fy + 1, z, bx + 6, Math.min(fy + 4, y), z, B.concrete);
      box(set, bx + 10, fy + 1, z, bx + 10, Math.min(fy + 4, y), z, B.concrete);
      if (fy + 4 <= y) box(set, bx + 7, fy + 4, z, bx + 9, fy + 4, z, B.concrete);
    }
    box(set, bx + 7, y - 8, bz, bx + 9, y - 6, bz, B.air);
    // Hazard rim around the entrance.
    for (let x = bx + 5; x <= bx + 11; x++) set(x, y, bz - 11, B.hazard_stripes);
    for (let i = 0; i < 3; i++) set(p.x0 + 2 + Math.floor(rnd() * 20), y + 1, p.z0 + 2 + Math.floor(rnd() * 3), B.barrel);
  },
};
