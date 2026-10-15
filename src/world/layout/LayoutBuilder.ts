// Incremental layout builder: roads, lots (with overlap/road/water rejection), props, vehicle spawns.
// Everything is deterministic for a given seed.
import type { BuildingLot, BuildingType, PropPlacement, VehicleSpawn } from '../../core/contracts';
import { BUILDING_FOOTPRINTS } from '../../core/contracts';
import { Rng } from '../../core/rng';
import type { OBB } from './geometry';
import {
  bounds,
  dist,
  distToPolyline,
  obbOverlap,
  obbSignedDistance,
  pointAtLength,
  pointInPolygon,
  polylineLength,
  resamplePolyline,
  rotYFacing,
  smoothPolyline,
} from './geometry';
import type { Polygon, RiverDef, RoadDef, XZ } from './types';
import { interpolateAlong } from './geometry';
import { PROP_FOOTPRINTS } from './propFootprints';

export interface LotOptions {
  /** Extra clearance to other lots (m). */
  margin?: number;
  /** Clearance from road edges (m). */
  roadMargin?: number;
  /** Ignore road clearance for these road ids (e.g. a driveway). */
  ignoreRoads?: number[];
  location?: string;
}

export interface StreetLotOptions {
  location: string;
  /** +1 = left side of travel, -1 = right side, 0 = both. */
  side: 1 | -1 | 0;
  /** Arc-length range along the street. */
  from?: number;
  to?: number;
  /** Gap between neighbouring lots (min,max). */
  gap: [number, number];
  /** Distance from road edge to the lot front. */
  setback: [number, number];
  types: [BuildingType, number][];
  /** Probability to skip a slot (empty plot). */
  skip?: number;
  /** Max lots to place. */
  max?: number;
}

interface RoadSample {
  x: number;
  z: number;
  hw: number;
  road: number;
}

const CELL = 64;

export class LayoutBuilder {
  readonly rng: Rng;
  readonly lots: BuildingLot[] = [];
  readonly lotObbs: OBB[] = [];
  readonly roads: RoadDef[] = [];
  readonly props: PropPlacement[] = [];
  readonly spawns: VehicleSpawn[] = [];
  private roadGrid = new Map<number, RoadSample[]>();
  private lotGrid = new Map<number, number[]>();
  private nextRoadId = 1;

  constructor(
    seed: number,
    readonly islands: Polygon[],
    readonly river: RiverDef,
    private readonly riverPts: XZ[],
    private readonly riverWidths: number[],
  ) {
    this.rng = new Rng(seed);
  }

  private key(cx: number, cz: number): number {
    return cx * 4096 + cz;
  }

  // ── roads ────────────────────────────────────────────────────────────────

  addRoad(points: XZ[], width: number, kind: 'asphalt' | 'dirt', name?: string, smooth = true): RoadDef {
    const pts = smooth && points.length >= 3 ? smoothPolyline(points, 6) : resamplePolyline(points, 6);
    const road: RoadDef = { id: this.nextRoadId++, points: pts, width, kind, name };
    this.roads.push(road);
    const dense = resamplePolyline(pts, 3);
    for (const p of dense) {
      const k = this.key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
      let list = this.roadGrid.get(k);
      if (!list) this.roadGrid.set(k, (list = []));
      list.push({ x: p.x, z: p.z, hw: width / 2, road: road.id });
    }
    return road;
  }

  /** Smallest distance from the point to a road edge (negative = on the road). */
  roadClearance(x: number, z: number, ignore?: number[]): number {
    let best = Infinity;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const list = this.roadGrid.get(this.key(cx + i, cz + j));
        if (!list) continue;
        for (const s of list) {
          if (ignore && ignore.includes(s.road)) continue;
          const d = Math.hypot(s.x - x, s.z - z) - s.hw;
          if (d < best) best = d;
        }
      }
    return best;
  }

  /** Clearance of an OBB from all roads (approximate: tests road samples against the box SDF). */
  obbRoadClearance(o: OBB, ignore?: number[]): number {
    let best = Infinity;
    const r = Math.hypot(o.hw, o.hd) + 20;
    const cx0 = Math.floor((o.x - r) / CELL), cx1 = Math.floor((o.x + r) / CELL);
    const cz0 = Math.floor((o.z - r) / CELL), cz1 = Math.floor((o.z + r) / CELL);
    for (let cx = cx0; cx <= cx1; cx++)
      for (let cz = cz0; cz <= cz1; cz++) {
        const list = this.roadGrid.get(this.key(cx, cz));
        if (!list) continue;
        for (const s of list) {
          if (ignore && ignore.includes(s.road)) continue;
          const d = obbSignedDistance(o, s.x, s.z) - s.hw;
          if (d < best) best = d;
        }
      }
    return best;
  }

  // ── water / land ─────────────────────────────────────────────────────────

  isOnIsland(x: number, z: number): boolean {
    const p = { x, z };
    for (const poly of this.islands) if (pointInPolygon(p, poly)) return true;
    return false;
  }

  /** Distance to the nearest coastline (positive inland, negative at sea). */
  coastDistance(x: number, z: number): number {
    const p = { x, z };
    let best = Infinity;
    for (const poly of this.islands) {
      const closed = [...poly, poly[0]];
      const h = distToPolyline(p, closed);
      if (h.d < best) best = h.d;
    }
    return this.isOnIsland(x, z) ? best : -best;
  }

  /** Distance to the river bank (negative = in the river). */
  riverClearance(x: number, z: number): number {
    const h = distToPolyline({ x, z }, this.riverPts);
    const w = this.riverWidths[Math.min(this.riverWidths.length - 1, h.i)] ?? 50;
    return h.d - w / 2;
  }

  // ── lots ─────────────────────────────────────────────────────────────────

  lotObb(type: BuildingType, x: number, z: number, rot: number): OBB {
    const f = BUILDING_FOOTPRINTS[type];
    return { x, z, hw: f.w / 2, hd: f.d / 2, rot };
  }

  canPlace(o: OBB, opts: LotOptions = {}): boolean {
    const margin = opts.margin ?? 3;
    const roadMargin = opts.roadMargin ?? 2.5;
    const corners = [
      [o.x, o.z],
      [o.x + o.hw, o.z],
      [o.x - o.hw, o.z],
      [o.x, o.z + o.hd],
      [o.x, o.z - o.hd],
    ];
    for (const [x, z] of corners) {
      if (this.coastDistance(x, z) < 26) return false;
      if (this.riverClearance(x, z) < 18) return false;
    }
    if (this.obbRoadClearance(o, opts.ignoreRoads) < roadMargin) return false;
    return !this.overlapsLots(o, margin);
  }

  /** True if the OBB (grown by margin) overlaps any placed lot. */
  overlapsLots(o: OBB, margin = 0): boolean {
    const r = Math.hypot(o.hw, o.hd) + margin + 40;
    const cx0 = Math.floor((o.x - r) / CELL), cx1 = Math.floor((o.x + r) / CELL);
    const cz0 = Math.floor((o.z - r) / CELL), cz1 = Math.floor((o.z + r) / CELL);
    for (let cx = cx0; cx <= cx1; cx++)
      for (let cz = cz0; cz <= cz1; cz++) {
        const list = this.lotGrid.get(this.key(cx, cz));
        if (!list) continue;
        for (const i of list) if (obbOverlap(o, this.lotObbs[i], margin)) return true;
      }
    return false;
  }

  /** Place a lot if it fits; returns the lot or null. */
  tryLot(type: BuildingType, x: number, z: number, rot: number, opts: LotOptions = {}): BuildingLot | null {
    const o = this.lotObb(type, x, z, rot);
    if (!this.canPlace(o, opts)) return null;
    return this.forceLot(type, x, z, rot, opts.location);
  }

  /** Place a lot without checks (authored landmarks). */
  forceLot(type: BuildingType, x: number, z: number, rot: number, location?: string): BuildingLot {
    const o = this.lotObb(type, x, z, rot);
    const lot: BuildingLot = {
      id: this.lots.length,
      type,
      x,
      z,
      rotationY: rot,
      seed: Math.floor(this.rng.next() * 0x7fffffff),
      groundY: 0,
      location,
    };
    const idx = this.lots.length;
    this.lots.push(lot);
    this.lotObbs.push(o);
    const r = Math.hypot(o.hw, o.hd);
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++)
      for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
        const k = this.key(cx, cz);
        let list = this.lotGrid.get(k);
        if (!list) this.lotGrid.set(k, (list = []));
        list.push(idx);
      }
    return lot;
  }

  /** Place a lot facing a world point (front door toward it). */
  tryLotFacing(type: BuildingType, x: number, z: number, tx: number, tz: number, opts: LotOptions = {}): BuildingLot | null {
    return this.tryLot(type, x, z, rotYFacing(tx - x, tz - z), opts);
  }

  /** Fill lots along a street polyline, fronts facing the street. */
  lotsAlong(street: RoadDef | XZ[], o: StreetLotOptions, hw = 3.25): BuildingLot[] {
    const pts = Array.isArray(street) ? street : street.points;
    const halfW = Array.isArray(street) ? hw : street.width / 2;
    const L = polylineLength(pts);
    const out: BuildingLot[] = [];
    const sides: (1 | -1)[] = o.side === 0 ? [1, -1] : [o.side];
    let placed = 0;
    for (const side of sides) {
      if (o.max && placed >= o.max) break;
      let s = (o.from ?? 0) + this.rng.range(2, 10);
      const end = Math.min(L, o.to ?? L);
      while (s < end) {
        const type = this.rng.weighted(o.types);
        const f = BUILDING_FOOTPRINTS[type];
        const half = f.w / 2;
        const p = pointAtLength(pts, s + half);
        if (s + f.w > end) break;
        if (o.skip && this.rng.chance(o.skip)) {
          s += f.w + this.rng.range(o.gap[0], o.gap[1]);
          continue;
        }
        // normal pointing away from the street on this side
        const nx = -p.tz * side, nz = p.tx * side;
        const setback = halfW + this.rng.range(o.setback[0], o.setback[1]);
        const cx = p.x + nx * (setback + f.d / 2);
        const cz = p.z + nz * (setback + f.d / 2);
        const rot = rotYFacing(-nx, -nz);
        const lot = this.tryLot(type, cx, cz, rot, { location: o.location });
        if (lot) {
          out.push(lot);
          placed++;
          if (o.max && placed >= o.max) break;
          s += f.w + this.rng.range(o.gap[0], o.gap[1]);
        } else {
          s += 4;
        }
      }
    }
    return out;
  }

  /** Scatter lots inside a circle (fallback filler for villages), facing the nearest road. */
  scatterLots(cx: number, cz: number, radius: number, count: number, types: [BuildingType, number][], location: string, tries = 200): BuildingLot[] {
    const out: BuildingLot[] = [];
    for (let t = 0; t < tries && out.length < count; t++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = radius * Math.sqrt(this.rng.next());
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const type = this.rng.weighted(types);
      const rot = this.rng.range(-Math.PI, Math.PI);
      const lot = this.tryLot(type, x, z, rot, { location, margin: 6 });
      if (lot) out.push(lot);
    }
    return out;
  }

  // ── props & spawns ───────────────────────────────────────────────────────

  prop(kind: string, x: number, z: number, rotationY: number, extra: { length?: number; scale?: number; y?: number } = {}): PropPlacement {
    const p: PropPlacement = { kind, x, y: extra.y ?? 0, z, rotationY };
    if (extra.length !== undefined) p.length = extra.length;
    if (extra.scale !== undefined) p.scale = extra.scale;
    this.props.push(p);
    return p;
  }

  /**
   * Linear prop (fence/wall) from a to b. Origin at the segment center, local X along the segment.
   * The line is split wherever it would cross a road (gap = road edge + `roadGap` m on both sides) or the river,
   * so fences/walls never block a drivable road or stand in water. Pieces shorter than 1.5 m are dropped.
   */
  linearProp(kind: string, a: XZ, b: XZ, roadGap = 1.5): PropPlacement[] {
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 0.01) return [];
    const n = Math.max(1, Math.ceil(L / 0.5));
    const at = (t: number): XZ => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    const out: PropPlacement[] = [];
    let start = -1;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const p = at(t);
      const blocked = this.roadClearance(p.x, p.z) < roadGap || this.riverClearance(p.x, p.z) < 1;
      if (!blocked && start < 0) start = t;
      if (start >= 0 && (blocked || k === n)) {
        const end = blocked ? (k - 1) / n : t;
        if ((end - start) * L >= 1.5) out.push(this.straightProp(kind, at(start), at(end)));
        start = -1;
      }
    }
    return out;
  }

  /** One straight linear prop piece (no road/water checks). */
  private straightProp(kind: string, a: XZ, b: XZ): PropPlacement {
    const dx = b.x - a.x, dz = b.z - a.z;
    // local +X must point along (dx, dz): rotation.y = atan2(-dz, dx)
    return this.prop(kind, (a.x + b.x) / 2, (a.z + b.z) / 2, Math.atan2(-dz, dx), { length: Math.hypot(dx, dz) });
  }

  /** True if a circle of radius r at (x, z) overlaps the nominal footprint of any placed prop. */
  overlapsProps(x: number, z: number, r: number): boolean {
    for (const p of this.props) {
      const f = PROP_FOOTPRINTS[p.kind];
      if (!f) continue;
      const hx = f.linear ? (p.length ?? 0) / 2 : f.hx;
      if (Math.abs(p.x - x) > hx + f.hz + r + 1 || Math.abs(p.z - z) > hx + f.hz + r + 1) continue;
      const c = Math.cos(p.rotationY), s = Math.sin(p.rotationY);
      const dx = x - p.x, dz = z - p.z;
      // world → prop local (inverse of the Y rotation)
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const ex = Math.max(0, Math.abs(lx) - hx), ez = Math.max(0, Math.abs(lz) - f.hz);
      if (ex * ex + ez * ez < r * r) return true;
    }
    return false;
  }

  /** True if a free-standing prop of radius r fits at (x, z): on land, off roads, clear of the river, lots and props. */
  spotClear(x: number, z: number, r: number, roadGap = 2): boolean {
    if (this.roadClearance(x, z) < r + roadGap) return false;
    if (this.riverClearance(x, z) < r + 4 || this.coastDistance(x, z) < r + 8) return false;
    if (this.overlapsLots({ x, z, hw: r, hd: r, rot: 0 }, 1)) return false;
    return !this.overlapsProps(x, z, r + 0.5);
  }

  /** Fence/wall around an OBB with a gate gap on the +Z (front) side. */
  fenceAround(o: OBB, kind: string, gate = 5): void {
    const c = [
      { lx: -o.hw, lz: -o.hd },
      { lx: o.hw, lz: -o.hd },
      { lx: o.hw, lz: o.hd },
      { lx: -o.hw, lz: o.hd },
    ];
    const w = (lx: number, lz: number) => {
      const cs = Math.cos(o.rot), sn = Math.sin(o.rot);
      return { x: o.x + lx * cs + lz * sn, z: o.z - lx * sn + lz * cs };
    };
    this.linearProp(kind, w(c[0].lx, c[0].lz), w(c[1].lx, c[1].lz));
    this.linearProp(kind, w(c[1].lx, c[1].lz), w(c[2].lx, c[2].lz));
    this.linearProp(kind, w(c[3].lx, c[3].lz), w(c[0].lx, c[0].lz));
    // front side with a gate gap in the middle
    const g = Math.min(gate, o.hw);
    this.linearProp(kind, w(o.hw, o.hd), w(g / 2, o.hd));
    this.linearProp(kind, w(-g / 2, o.hd), w(-o.hw, o.hd));
  }

  vehicle(x: number, z: number, rotationY: number, kind: 'land' | 'water', prefer?: string[]): VehicleSpawn {
    const v: VehicleSpawn = { x, y: 0, z, rotationY, kind };
    if (prefer) v.prefer = prefer;
    this.spawns.push(v);
    return v;
  }

  /** Arc-length sample on a road. */
  at(road: RoadDef, s: number): { x: number; z: number; tx: number; tz: number } {
    return pointAtLength(road.points, s);
  }

  length(road: RoadDef): number {
    return polylineLength(road.points);
  }
}

export { bounds, dist, interpolateAlong };
