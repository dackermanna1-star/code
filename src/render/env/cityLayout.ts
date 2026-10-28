// Procedural low-poly city around the tower (pure, deterministic, no Babylon).
//
// A Manhattan street grid aligned with the apartment axes, ~93 m below the apartment
// floor (31 storeys × 3 m). Blocks are split into lots carrying buildings whose heights
// follow a log-normal distribution boosted towards a downtown cluster placed in the sun's
// direction (so skyscraper silhouettes stand against the sunset). Nearby lots are kept low
// so the view from the 31st floor stays open. Everything is plain data; geometry is built
// by cityGeometry.ts.

import { Rng } from "../../core/rng.ts";
import { FLOOR_LEVEL, STOREY_H } from "../../world/plan.ts";
import { TO_SUN } from "./sunModel.ts";

/** Street level (world y) relative to the apartment floor at y = 0. */
export const GROUND_Y = -FLOOR_LEVEL * STOREY_H;

/** Apartment centre (XZ) — the ring distances are measured from here. */
export const CITY_CENTER = { x: 6.4, z: 4.4 } as const;

/** Footprint of our own tower (x/z), see towerLayout.ts. */
export const TOWER_FOOTPRINT = { x0: -27.0, x1: 13.0, z0: -0.2, z1: 22.0 } as const;

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export type FacadeStyle = 0 | 1 | 2 | 3; // 0 glass curtain wall, 1 punched concrete, 2 brick, 3 ribbon windows

export interface Tier {
  rect: Rect;
  y0: number;
  y1: number;
}

export interface Building {
  tiers: Tier[];
  /** Small rooftop boxes (mechanical rooms, water tanks), antenna masts. */
  extras: Array<{ rect: Rect; y0: number; y1: number }>;
  style: FacadeStyle;
  seed: number;
  /** Linear RGB facade base colour. */
  color: [number, number, number];
  /** Fraction of windows lit (0..1). */
  lit: number;
  /** Distance of the footprint centre from CITY_CENTER (m). */
  dist: number;
}

export type BlockKind = "lots" | "park" | "plaza" | "parking" | "tower";

export interface Block extends Rect {
  kind: BlockKind;
}

export interface RoadSegment extends Rect {
  /** Road axis: "x" = runs east-west (constant z), "z" = runs north-south. */
  axis: "x" | "z";
  /** Carriageway width (between curbs) and sidewalk width. */
  width: number;
  sidewalk: number;
}

export interface Car {
  x: number;
  z: number;
  /** Heading axis and sign (+1 east/north, −1 west/south). */
  axis: "x" | "z";
  sign: 1 | -1;
  length: number;
  width: number;
  height: number;
  color: [number, number, number];
}

export interface StreetLight {
  x: number;
  z: number;
  /** Unit XZ direction the arm points (towards the road centre). */
  ax: number;
  az: number;
}

export interface Tree {
  x: number;
  z: number;
  height: number;
  radius: number;
  tint: number;
}

export interface CityLayout {
  buildings: Building[];
  blocks: Block[];
  roads: RoadSegment[];
  intersections: Rect[];
  cars: Car[];
  lights: StreetLight[];
  trees: Tree[];
  /** Square extent of the generated grid (the far ground frame starts outside it). */
  extent: Rect;
}

export interface CityOptions {
  seed?: number;
  /** Building ring radii from CITY_CENTER (m). */
  innerRadius?: number;
  outerRadius?: number;
  /** Half size of the generated street grid (m). */
  halfExtent?: number;
  /** Detail radii (props beyond are skipped). */
  carRadius?: number;
  lightRadius?: number;
  treeRadius?: number;
}

// Street grid definition (street centre lines).
const X_ORIGIN = 30;
const BLOCK_X = 84;
const Z_ORIGIN = -16;
const BLOCK_Z = 76;

function streetWidthX(k: number): number {
  // N-S streets (constant x): every 3rd is a wide avenue.
  return ((k % 3) + 3) % 3 === 0 ? 26 : 18;
}

function streetWidthZ(k: number): number {
  // E-W streets (constant z): every 4th is a wide avenue; the one in front of the tower too.
  return ((k % 4) + 4) % 4 === 0 ? 26 : 18;
}

const SIDEWALK = 3.5;

const PALETTES: Record<FacadeStyle, Array<[number, number, number]>> = {
  // linear RGB
  0: [
    [0.16, 0.22, 0.27],
    [0.12, 0.19, 0.22],
    [0.2, 0.24, 0.26],
    [0.1, 0.14, 0.2],
    [0.18, 0.2, 0.17],
  ],
  1: [
    [0.42, 0.4, 0.36],
    [0.5, 0.47, 0.42],
    [0.36, 0.36, 0.35],
    [0.55, 0.52, 0.46],
    [0.45, 0.41, 0.35],
  ],
  2: [
    [0.3, 0.13, 0.08],
    [0.36, 0.17, 0.1],
    [0.26, 0.15, 0.11],
    [0.4, 0.24, 0.15],
  ],
  3: [
    [0.6, 0.6, 0.58],
    [0.52, 0.53, 0.55],
    [0.64, 0.6, 0.53],
    [0.47, 0.5, 0.5],
  ],
};

const CAR_COLORS: Array<[number, number, number]> = [
  [0.75, 0.75, 0.74],
  [0.5, 0.52, 0.55],
  [0.02, 0.02, 0.025],
  [0.45, 0.03, 0.03],
  [0.04, 0.09, 0.3],
  [0.7, 0.45, 0.02],
  [0.85, 0.85, 0.82],
  [0.12, 0.13, 0.14],
  [0.08, 0.2, 0.1],
];

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function distToRect(px: number, pz: number, r: Rect): number {
  const dx = px < r.x0 ? r.x0 - px : px > r.x1 ? px - r.x1 : 0;
  const dz = pz < r.z0 ? r.z0 - pz : pz > r.z1 ? pz - r.z1 : 0;
  return Math.hypot(dx, dz);
}

function shrink(r: Rect, d: number): Rect {
  return { x0: r.x0 + d, x1: r.x1 - d, z0: r.z0 + d, z1: r.z1 - d };
}

/** Recursively split a block into lots. */
function splitLots(r: Rect, rng: Rng, out: Rect[], depth = 0): void {
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const big = Math.max(w, d);
  if (depth >= 3 || big < 34 || (depth >= 1 && rng.chance(0.25 + depth * 0.15))) {
    out.push(r);
    return;
  }
  const f = rng.range(0.38, 0.62);
  if (w >= d) {
    const xm = r.x0 + w * f;
    splitLots({ ...r, x1: xm }, rng, out, depth + 1);
    splitLots({ ...r, x0: xm }, rng, out, depth + 1);
  } else {
    const zm = r.z0 + d * f;
    splitLots({ ...r, z1: zm }, rng, out, depth + 1);
    splitLots({ ...r, z0: zm }, rng, out, depth + 1);
  }
}

/** Generate the city layout. Deterministic for a given seed/options. */
export function generateCity(opts: CityOptions = {}): CityLayout {
  const rng = new Rng(opts.seed ?? 0x5eed1e55);
  const inner = opts.innerRadius ?? 60;
  const outer = opts.outerRadius ?? 900;
  const half = opts.halfExtent ?? 1000;
  const carR = opts.carRadius ?? 300;
  const lightR = opts.lightRadius ?? 340;
  const treeR = opts.treeRadius ?? 300;
  const cx = CITY_CENTER.x;
  const cz = CITY_CENTER.z;
  // Downtown cluster ~600 m out, 25° to the south of the sun's azimuth: the sun sets just
  // beside the skyline instead of behind it.
  const downAz = Math.atan2(TO_SUN.x, TO_SUN.z) + (25 * Math.PI) / 180;
  const down = { x: cx + Math.sin(downAz) * 600, z: cz + Math.cos(downAz) * 600 };
  const sunAz = Math.atan2(TO_SUN.x, TO_SUN.z);
  const sunEl = Math.asin(Math.max(-1, Math.min(1, TO_SUN.y)));
  /** Highest roof (world y above street) that keeps the sun disc unobstructed from the apartment. */
  const sunCap = (bx: number, bz: number, halfSize: number): number => {
    const dx = bx - cx;
    const dz = bz - cz;
    const dist = Math.hypot(dx, dz);
    if (dist < 1) return Infinity;
    let dAz = Math.atan2(dx, dz) - sunAz;
    dAz = Math.atan2(Math.sin(dAz), Math.cos(dAz));
    const halfAng = Math.atan2(halfSize, dist) + (2.5 * Math.PI) / 180;
    if (Math.abs(dAz) > halfAng) return Infinity;
    // Keep the roofline ≥ 2° below the sun centre (disc radius ≈ 0.6°).
    return -GROUND_Y + dist * Math.tan(sunEl - (2 * Math.PI) / 180);
  };

  const kx0 = Math.floor((cx - half - X_ORIGIN) / BLOCK_X) - 1;
  const kx1 = Math.ceil((cx + half - X_ORIGIN) / BLOCK_X) + 1;
  const kz0 = Math.floor((cz - half - Z_ORIGIN) / BLOCK_Z) - 1;
  const kz1 = Math.ceil((cz + half - Z_ORIGIN) / BLOCK_Z) + 1;
  const xs: number[] = [];
  const zs: number[] = [];
  for (let k = kx0; k <= kx1; k++) xs.push(X_ORIGIN + k * BLOCK_X);
  for (let k = kz0; k <= kz1; k++) zs.push(Z_ORIGIN + k * BLOCK_Z);
  const wX = (i: number) => streetWidthX(kx0 + i);
  const wZ = (j: number) => streetWidthZ(kz0 + j);

  // Outer bounds of the tiles (boundary intersections/roads extend half a street beyond
  // the outermost centre lines); the far ground frame starts exactly here.
  const extent: Rect = {
    x0: xs[0] - wX(0) / 2,
    x1: xs[xs.length - 1] + wX(xs.length - 1) / 2,
    z0: zs[0] - wZ(0) / 2,
    z1: zs[zs.length - 1] + wZ(zs.length - 1) / 2,
  };
  const layout: CityLayout = { buildings: [], blocks: [], roads: [], intersections: [], cars: [], lights: [], trees: [], extent };

  // ---- intersections, road segments, blocks (an exact tiling of the extent, no overlaps)
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < zs.length; j++) {
      const hx = wX(i) / 2;
      const hz = wZ(j) / 2;
      layout.intersections.push({ x0: xs[i] - hx, x1: xs[i] + hx, z0: zs[j] - hz, z1: zs[j] + hz });
      // E-W segment east of this intersection
      if (i + 1 < xs.length) {
        layout.roads.push({ x0: xs[i] + hx, x1: xs[i + 1] - wX(i + 1) / 2, z0: zs[j] - hz, z1: zs[j] + hz, axis: "x", width: wZ(j) - 2 * SIDEWALK, sidewalk: SIDEWALK });
      }
      // N-S segment north of this intersection
      if (j + 1 < zs.length) {
        layout.roads.push({ x0: xs[i] - hx, x1: xs[i] + hx, z0: zs[j] + hz, z1: zs[j + 1] - wZ(j + 1) / 2, axis: "z", width: wX(i) - 2 * SIDEWALK, sidewalk: SIDEWALK });
      }
      if (i + 1 < xs.length && j + 1 < zs.length) {
        const blk: Rect = { x0: xs[i] + hx, x1: xs[i + 1] - wX(i + 1) / 2, z0: zs[j] + hz, z1: zs[j + 1] - wZ(j + 1) / 2 };
        const bcx = (blk.x0 + blk.x1) / 2;
        const bcz = (blk.z0 + blk.z1) / 2;
        const hasTower = !(blk.x1 < TOWER_FOOTPRINT.x0 || blk.x0 > TOWER_FOOTPRINT.x1 || blk.z1 < TOWER_FOOTPRINT.z0 || blk.z0 > TOWER_FOOTPRINT.z1);
        const dBlock = Math.hypot(bcx - cx, bcz - cz);
        let kind: BlockKind = "lots";
        if (hasTower) kind = "tower";
        else {
          const r = rng.next();
          if (r < 0.07) kind = "park";
          else if (r < 0.1) kind = "plaza";
          else if (r < 0.14 && dBlock < 700) kind = "parking";
        }
        layout.blocks.push({ ...blk, kind });
      }
    }
  }

  // ---- buildings
  for (const blk of layout.blocks) {
    if (blk.kind !== "lots") continue;
    const lots: Rect[] = [];
    splitLots(blk, rng, lots);
    for (const lot of lots) {
      const lcx = (lot.x0 + lot.x1) / 2;
      const lcz = (lot.z0 + lot.z1) / 2;
      const dist = Math.hypot(lcx - cx, lcz - cz);
      const near = distToRect(cx, cz, lot);
      if (near < inner || dist > outer) continue;
      if (rng.chance(0.06)) continue; // empty lot
      const setback = rng.range(1.0, 4.5);
      const fp = shrink(lot, setback);
      const fw = fp.x1 - fp.x0;
      const fd = fp.z1 - fp.z0;
      if (fw < 8 || fd < 8) continue;
      // Height: log-normal, boosted downtown, capped near the tower so views stay open.
      const dDown = Math.hypot(lcx - down.x, lcz - down.z);
      const boost = 1 + 5.2 * Math.exp(-((dDown / 330) ** 2));
      let h = 26 * Math.exp(rng.gauss() * 0.55) * boost;
      if (near < 160) h = Math.min(h, 40 + (near - inner) * 0.35);
      const cap = sunCap(lcx, lcz, Math.hypot(fw, fd) / 2);
      const inSunLine = Number.isFinite(cap);
      if (inSunLine) h = Math.min(h, cap);
      h = clamp(h, 9, 330);
      const tall = h > 110;
      const style: FacadeStyle = tall ? (rng.chance(0.75) ? 0 : 3) : h > 45 ? (rng.pick([0, 1, 3, 1] as const) as FacadeStyle) : (rng.pick([1, 2, 2, 3, 1] as const) as FacadeStyle);
      const pal = PALETTES[style];
      const base = pal[rng.int(0, pal.length - 1)];
      const jitter = rng.range(0.85, 1.12);
      const color: [number, number, number] = [base[0] * jitter, base[1] * jitter, base[2] * jitter];
      const tiers: Tier[] = [];
      const y0 = GROUND_Y;
      // Footprint aspect sanity: very long slabs get split into two tiers side by side? keep simple.
      if (h > 42 && rng.chance(0.65)) {
        const f1 = rng.range(0.55, 0.8);
        const ins1 = Math.min(fw, fd) * rng.range(0.1, 0.22);
        tiers.push({ rect: fp, y0, y1: y0 + h * f1 });
        const r2 = shrink(fp, ins1);
        if (h > 120 && rng.chance(0.7)) {
          const f2 = rng.range(0.82, 0.92);
          tiers.push({ rect: r2, y0: y0 + h * f1, y1: y0 + h * f2 });
          tiers.push({ rect: shrink(r2, Math.min(r2.x1 - r2.x0, r2.z1 - r2.z0) * rng.range(0.12, 0.25)), y0: y0 + h * f2, y1: y0 + h });
        } else {
          tiers.push({ rect: r2, y0: y0 + h * f1, y1: y0 + h });
        }
      } else {
        tiers.push({ rect: fp, y0, y1: y0 + h });
      }
      const top = tiers[tiers.length - 1];
      const extras: Building["extras"] = [];
      if (dist < 520) {
        const n = rng.int(0, 3);
        const tr = top.rect;
        const tw = tr.x1 - tr.x0;
        const td = tr.z1 - tr.z0;
        for (let e = 0; e < n; e++) {
          const ew = Math.min(tw * 0.4, rng.range(2.5, 7));
          const ed = Math.min(td * 0.4, rng.range(2.5, 7));
          const ex = tr.x0 + rng.range(0.1, 0.9) * (tw - ew);
          const ez = tr.z0 + rng.range(0.1, 0.9) * (td - ed);
          extras.push({ rect: { x0: ex, x1: ex + ew, z0: ez, z1: ez + ed }, y0: top.y1, y1: top.y1 + rng.range(1.8, 4.2) });
        }
      }
      if (h > 140 && !inSunLine && rng.chance(0.5)) {
        const mx = (top.rect.x0 + top.rect.x1) / 2;
        const mz = (top.rect.z0 + top.rect.z1) / 2;
        const r = 0.6;
        extras.push({ rect: { x0: mx - r, x1: mx + r, z0: mz - r, z1: mz + r }, y0: top.y1, y1: top.y1 + rng.range(12, 35) });
      }
      layout.buildings.push({ tiers, extras, style, seed: rng.next(), color, lit: clamp(rng.range(0.05, 0.32) * (style === 0 ? 1.2 : 1), 0, 0.5), dist });
    }
  }

  // ---- cars (in lanes; denser on avenues), streetlights, street trees
  for (const road of layout.roads) {
    const rcx = (road.x0 + road.x1) / 2;
    const rcz = (road.z0 + road.z1) / 2;
    const d = distToRect(cx, cz, road);
    const along = road.axis === "x" ? road.x1 - road.x0 : road.z1 - road.z0;
    const centre = road.axis === "x" ? rcz : rcx;
    const start = road.axis === "x" ? road.x0 : road.z0;
    if (d < carR) {
      const lanesPerDir = road.width >= 18 ? 3 : 2;
      const laneW = road.width / (2 * lanesPerDir);
      for (let side = -1; side <= 1; side += 2) {
        for (let lane = 0; lane < lanesPerDir; lane++) {
          const off = side * (laneW * (lane + 0.5));
          // Right-hand traffic: +side lanes drive towards +axis.
          const sign: 1 | -1 = side > 0 ? 1 : -1;
          let s = rng.range(2, 9);
          const kerbLane = lane === lanesPerDir - 1;
          const density = kerbLane ? 0.45 : 0.22; // parked cars along the kerb
          while (s < along - 6) {
            const length = rng.range(4.0, 5.1);
            if (rng.chance(density)) {
              const pos = start + s + length / 2;
              layout.cars.push({
                x: road.axis === "x" ? pos : centre + off,
                z: road.axis === "x" ? centre + off : pos,
                axis: road.axis,
                sign,
                length,
                width: rng.range(1.7, 1.95),
                height: rng.range(1.35, 1.65),
                color: CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)],
              });
              s += length + rng.range(1.0, 3.0);
            } else {
              s += rng.range(6, 22);
            }
          }
        }
      }
    }
    if (d < lightR) {
      // Streetlights on both sidewalks, staggered, ~28 m apart.
      const edge = road.width / 2 + 0.6;
      for (let side = -1; side <= 1; side += 2) {
        for (let s = 6 + (side > 0 ? 14 : 0); s < along - 4; s += 28) {
          const pos = start + s;
          const lx = road.axis === "x" ? pos : centre + side * edge;
          const lz = road.axis === "x" ? centre + side * edge : pos;
          layout.lights.push({ x: lx, z: lz, ax: road.axis === "x" ? 0 : -side, az: road.axis === "x" ? -side : 0 });
        }
      }
    }
    if (d < treeR && rng.chance(0.5)) {
      const edge = road.width / 2 + SIDEWALK * 0.62;
      for (let side = -1; side <= 1; side += 2) {
        for (let s = 9; s < along - 5; s += rng.range(10, 16)) {
          const pos = start + s;
          layout.trees.push({
            x: road.axis === "x" ? pos : centre + side * edge,
            z: road.axis === "x" ? centre + side * edge : pos,
            height: rng.range(6, 11),
            radius: rng.range(2.0, 3.4),
            tint: rng.next(),
          });
        }
      }
    }
  }
  for (const blk of layout.blocks) {
    if (blk.kind !== "park") continue;
    if (distToRect(cx, cz, blk) > treeR * 1.5) continue;
    const area = (blk.x1 - blk.x0) * (blk.z1 - blk.z0);
    const n = Math.min(60, Math.floor(area / 110));
    for (let t = 0; t < n; t++) {
      layout.trees.push({
        x: rng.range(blk.x0 + 3, blk.x1 - 3),
        z: rng.range(blk.z0 + 3, blk.z1 - 3),
        height: rng.range(7, 14),
        radius: rng.range(2.5, 4.5),
        tint: rng.next(),
      });
    }
  }
  return layout;
}
