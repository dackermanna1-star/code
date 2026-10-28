// CityLayout → merged low-poly geometry (pure, no Babylon).
//
// The `data` vertex attribute drives the city shader (see exterior shaders in sky.ts):
//   data.x = surface kind (CITY_KIND), data.y = per-object seed / intensity,
//   data.z / data.w = kind-specific parameters (facade style + lit fraction, road half width
//   + lanes, …). Colors are linear RGB.

import { MeshBuffer, type Data4, type RGBA } from "./meshBuffer.ts";
import { GROUND_Y, type Building, type CityLayout, type Rect, type RoadSegment } from "./cityLayout.ts";

export const CITY_KIND = {
  FACADE: 0,
  ROOF: 1,
  ROAD: 2,
  PAVING: 3,
  GRASS: 4,
  CAR: 5,
  EMISSIVE: 6,
  FOLIAGE: 7,
  METAL: 8,
  CAR_GLASS: 9,
  PARKING: 10,
  FAR_GROUND: 11,
  CROSSWALK: 12,
} as const;

const K = CITY_KIND;
const UP = { x: 0, y: 1, z: 0 };

export interface CityGeometry {
  buildings: MeshBuffer;
  ground: MeshBuffer;
  props: MeshBuffer;
}

function groundQuad(mb: MeshBuffer, r: Rect, y: number, color: RGBA, data: Data4, uv?: { u0: number; v0: number; u1: number; v1: number; alongX: boolean }): void {
  if (r.x1 - r.x0 <= 1e-4 || r.z1 - r.z0 <= 1e-4) return;
  if (uv && !uv.alongX) {
    // u runs along z, v along x: rotate the uv assignment around the perimeter.
    const i0 = mb.vertex({ x: r.x0, y, z: r.z0 }, UP, uv.u0, uv.v0, color, data);
    const i1 = mb.vertex({ x: r.x1, y, z: r.z0 }, UP, uv.u0, uv.v1, color, data);
    const i2 = mb.vertex({ x: r.x1, y, z: r.z1 }, UP, uv.u1, uv.v1, color, data);
    const i3 = mb.vertex({ x: r.x0, y, z: r.z1 }, UP, uv.u1, uv.v0, color, data);
    mb.tri(i0, i1, i2, UP);
    mb.tri(i0, i2, i3, UP);
    return;
  }
  const u0 = uv ? uv.u0 : r.x0;
  const v0 = uv ? uv.v0 : r.z0;
  const u1 = uv ? uv.u1 : r.x1;
  const v1 = uv ? uv.v1 : r.z1;
  mb.quad({ x: r.x0, y, z: r.z0 }, { x: r.x1, y, z: r.z0 }, { x: r.x1, y, z: r.z1 }, { x: r.x0, y, z: r.z1 }, UP, u0, v0, u1, v1, color, data);
}

const PAVING: RGBA = [0.34, 0.33, 0.31, 1];
const SIDEWALK: RGBA = [0.42, 0.41, 0.39, 1];
const ASPHALT: RGBA = [0.075, 0.075, 0.08, 1];
const GRASS: RGBA = [0.07, 0.13, 0.04, 1];
const PARKING: RGBA = [0.09, 0.09, 0.095, 1];

function addRoad(mb: MeshBuffer, road: RoadSegment): void {
  const sw = road.sidewalk;
  const halfW = road.width / 2;
  const lanes = road.width >= 18 ? 3 : 2;
  if (road.axis === "x") {
    const zc = (road.z0 + road.z1) / 2;
    groundQuad(mb, { x0: road.x0, x1: road.x1, z0: road.z0, z1: road.z0 + sw }, GROUND_Y, SIDEWALK, [K.PAVING, 0, 0, 0]);
    groundQuad(mb, { x0: road.x0, x1: road.x1, z0: road.z1 - sw, z1: road.z1 }, GROUND_Y, SIDEWALK, [K.PAVING, 0, 0, 0]);
    groundQuad(mb, { x0: road.x0, x1: road.x1, z0: zc - halfW, z1: zc + halfW }, GROUND_Y, ASPHALT, [K.ROAD, 0, halfW, lanes], {
      u0: road.x0,
      u1: road.x1,
      v0: -halfW,
      v1: halfW,
      alongX: true,
    });
  } else {
    const xc = (road.x0 + road.x1) / 2;
    groundQuad(mb, { x0: road.x0, x1: road.x0 + sw, z0: road.z0, z1: road.z1 }, GROUND_Y, SIDEWALK, [K.PAVING, 0, 0, 0]);
    groundQuad(mb, { x0: road.x1 - sw, x1: road.x1, z0: road.z0, z1: road.z1 }, GROUND_Y, SIDEWALK, [K.PAVING, 0, 0, 0]);
    groundQuad(mb, { x0: xc - halfW, x1: xc + halfW, z0: road.z0, z1: road.z1 }, GROUND_Y, ASPHALT, [K.ROAD, 0, halfW, lanes], {
      u0: road.z0,
      u1: road.z1,
      v0: -halfW,
      v1: halfW,
      alongX: false,
    });
  }
}

function addIntersection(mb: MeshBuffer, r: Rect, sw: number): void {
  // 3×3 split: sidewalk corners, crosswalk edges, plain asphalt centre.
  const xs = [r.x0, r.x0 + sw, r.x1 - sw, r.x1];
  const zs = [r.z0, r.z0 + sw, r.z1 - sw, r.z1];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const cell = { x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[j + 1] };
      const corner = i !== 1 && j !== 1;
      const centre = i === 1 && j === 1;
      if (corner) groundQuad(mb, cell, GROUND_Y, SIDEWALK, [K.PAVING, 0, 0, 0]);
      else if (centre) groundQuad(mb, cell, GROUND_Y, ASPHALT, [K.ROAD, 0, 0, 0], { u0: 0, u1: 0, v0: 99, v1: 99, alongX: true });
      else {
        // Edge cell between the centre and a road segment: zebra bars parallel to the traffic,
        // repeated across the carriageway → v runs across the road.
        const acrossZ = i !== 1; // east/west edge cells sit on an E-W road
        groundQuad(mb, cell, GROUND_Y, ASPHALT, [K.CROSSWALK, 0, 0, 0], acrossZ ? { u0: cell.x0, u1: cell.x1, v0: cell.z0, v1: cell.z1, alongX: true } : { u0: cell.z0, u1: cell.z1, v0: cell.x0, v1: cell.x1, alongX: false });
      }
    }
  }
}

function addBuilding(mb: MeshBuffer, b: Building): void {
  const facade: Data4 = [K.FACADE, b.seed, b.style, b.lit];
  const col: RGBA = [b.color[0], b.color[1], b.color[2], 1];
  const roofCol: RGBA = [0.22, 0.215, 0.205, 1];
  let uOff = b.seed * 97; // decorrelate window columns between buildings
  for (const t of b.tiers) {
    const min = { x: t.rect.x0, y: t.y0, z: t.rect.z0 };
    const max = { x: t.rect.x1, y: t.y1, z: t.rect.z1 };
    mb.box(min, max, col, facade, { skip: ["top", "bottom"], vOffset: -GROUND_Y, uOffset: uOff });
    uOff += 2 * (max.x - min.x + max.z - min.z);
    mb.quad({ x: min.x, y: max.y, z: min.z }, { x: max.x, y: max.y, z: min.z }, { x: max.x, y: max.y, z: max.z }, { x: min.x, y: max.y, z: max.z }, UP, min.x, min.z, max.x, max.z, roofCol, [K.ROOF, b.seed, 0, 0]);
  }
  for (const e of b.extras) {
    const thin = e.rect.x1 - e.rect.x0 < 2;
    mb.box({ x: e.rect.x0, y: e.y0, z: e.rect.z0 }, { x: e.rect.x1, y: e.y1, z: e.rect.z1 }, thin ? [0.12, 0.12, 0.13, 1] : [0.3, 0.29, 0.27, 1], [thin ? K.METAL : K.ROOF, b.seed, 0, 0], { skip: ["bottom"] });
  }
}

/** Squashed octahedron tree crown (flat shaded) on a trunk. */
function addTree(mb: MeshBuffer, x: number, z: number, h: number, r: number, tint: number): void {
  const trunkH = h * 0.38;
  const tw = 0.22;
  mb.box({ x: x - tw, y: GROUND_Y, z: z - tw }, { x: x + tw, y: GROUND_Y + trunkH, z: z + tw }, [0.09, 0.06, 0.04, 1], [K.METAL, 0, 0, 0], { skip: ["bottom", "top"] });
  const cy = GROUND_Y + trunkH + (h - trunkH) * 0.45;
  const ry = (h - trunkH) * 0.55;
  const g = 0.75 + tint * 0.5;
  const col: RGBA = [0.05 * g, 0.11 * g, 0.03 * g, 1];
  const top = { x, y: cy + ry, z };
  const bot = { x, y: cy - ry * 0.8, z };
  const ring = [
    { x: x + r, y: cy, z },
    { x, y: cy, z: z + r },
    { x: x - r, y: cy, z },
    { x, y: cy, z: z - r },
  ];
  for (let i = 0; i < 4; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % 4];
    for (const apex of [top, bot]) {
      // flat normal of triangle (apex, a, b), oriented away from the crown centre
      const e1 = { x: a.x - apex.x, y: a.y - apex.y, z: a.z - apex.z };
      const e2 = { x: b.x - apex.x, y: b.y - apex.y, z: b.z - apex.z };
      let n = { x: e1.y * e2.z - e1.z * e2.y, y: e1.z * e2.x - e1.x * e2.z, z: e1.x * e2.y - e1.y * e2.x };
      const mx = (apex.x + a.x + b.x) / 3 - x;
      const my = (apex.y + a.y + b.y) / 3 - cy;
      const mz = (apex.z + a.z + b.z) / 3 - z;
      if (n.x * mx + n.y * my + n.z * mz < 0) n = { x: -n.x, y: -n.y, z: -n.z };
      const l = Math.hypot(n.x, n.y, n.z) || 1;
      n = { x: n.x / l, y: n.y / l, z: n.z / l };
      const i0 = mb.vertex(apex, n, 0, 0, col, [K.FOLIAGE, tint, 0, 0]);
      const i1 = mb.vertex(a, n, 1, 0, col, [K.FOLIAGE, tint, 0, 0]);
      const i2 = mb.vertex(b, n, 0, 1, col, [K.FOLIAGE, tint, 0, 0]);
      mb.tri(i0, i1, i2, n);
    }
  }
}

/** Build merged meshes for the whole layout plus the far ground frame out to `farHalf`. */
export function buildCityGeometry(layout: CityLayout, farHalf = 2600): CityGeometry {
  const buildings = new MeshBuffer();
  const ground = new MeshBuffer();
  const props = new MeshBuffer();

  for (const b of layout.buildings) addBuilding(buildings, b);

  for (const blk of layout.blocks) {
    if (blk.kind === "park") groundQuad(ground, blk, GROUND_Y, GRASS, [K.GRASS, 0, 0, 0]);
    else if (blk.kind === "parking") groundQuad(ground, blk, GROUND_Y, PARKING, [K.PARKING, 0, 0, 0]);
    else groundQuad(ground, blk, GROUND_Y, PAVING, [K.PAVING, 1, 0, 0]);
  }
  for (const r of layout.roads) addRoad(ground, r);
  for (const r of layout.intersections) addIntersection(ground, r, Math.min(3.5, (r.x1 - r.x0) / 3, (r.z1 - r.z0) / 3));

  // Far ground frame around the grid (no overlap with the city tiles).
  const e = layout.extent;
  const fg: RGBA = [0.2, 0.19, 0.17, 1];
  const fd: Data4 = [K.FAR_GROUND, 0, 0, 0];
  groundQuad(ground, { x0: -farHalf, x1: farHalf, z0: -farHalf, z1: e.z0 }, GROUND_Y, fg, fd);
  groundQuad(ground, { x0: -farHalf, x1: farHalf, z0: e.z1, z1: farHalf }, GROUND_Y, fg, fd);
  groundQuad(ground, { x0: -farHalf, x1: e.x0, z0: e.z0, z1: e.z1 }, GROUND_Y, fg, fd);
  groundQuad(ground, { x0: e.x1, x1: farHalf, z0: e.z0, z1: e.z1 }, GROUND_Y, fg, fd);

  // Cars: body + glasshouse.
  for (const c of layout.cars) {
    const alongX = c.axis === "x";
    const hl = c.length / 2;
    const hw = c.width / 2;
    const y0 = GROUND_Y + 0.28;
    const bodyH = c.height * 0.5;
    const ex = alongX ? hl : hw;
    const ez = alongX ? hw : hl;
    props.box({ x: c.x - ex, y: y0, z: c.z - ez }, { x: c.x + ex, y: y0 + bodyH, z: c.z + ez }, [c.color[0], c.color[1], c.color[2], 1], [K.CAR, 0, 0, 0], { skip: ["bottom"] });
    // Cabin sits slightly behind centre.
    const cl = hl * 0.55;
    const cw = hw * 0.86;
    const off = -c.sign * hl * 0.12;
    const ccx = alongX ? c.x + off : c.x;
    const ccz = alongX ? c.z : c.z + off;
    const cex = alongX ? cl : cw;
    const cez = alongX ? cw : cl;
    props.box({ x: ccx - cex, y: y0 + bodyH, z: ccz - cez }, { x: ccx + cex, y: GROUND_Y + 0.28 + c.height, z: ccz + cez }, [0.03, 0.035, 0.04, 1], [K.CAR_GLASS, 0, 0, 0], { skip: ["bottom"] });
    // Wheels as dark slabs under the body edges.
    props.box({ x: c.x - ex * 0.92, y: GROUND_Y, z: c.z - ez * 0.92 }, { x: c.x + ex * 0.92, y: y0, z: c.z + ez * 0.92 }, [0.015, 0.015, 0.015, 1], [K.METAL, 0, 0, 0], { skip: ["bottom", "top"] });
  }

  // Streetlights: pole, arm, emissive lamp head (just switched on at dusk).
  for (const l of layout.lights) {
    const ph = 8.5;
    const pr = 0.09;
    props.box({ x: l.x - pr, y: GROUND_Y, z: l.z - pr }, { x: l.x + pr, y: GROUND_Y + ph, z: l.z + pr }, [0.05, 0.05, 0.055, 1], [K.METAL, 0, 0, 0], { skip: ["bottom"] });
    const armL = 1.9;
    const ax = l.x + l.ax * armL;
    const az = l.z + l.az * armL;
    props.box({ x: Math.min(l.x, ax) - 0.06, y: GROUND_Y + ph - 0.14, z: Math.min(l.z, az) - 0.06 }, { x: Math.max(l.x, ax) + 0.06, y: GROUND_Y + ph, z: Math.max(l.z, az) + 0.06 }, [0.05, 0.05, 0.055, 1], [K.METAL, 0, 0, 0]);
    const hx = l.ax !== 0 ? 0.36 : 0.18;
    const hz = l.az !== 0 ? 0.36 : 0.18;
    props.box({ x: ax - hx, y: GROUND_Y + ph - 0.26, z: az - hz }, { x: ax + hx, y: GROUND_Y + ph - 0.12, z: az + hz }, [1.0, 0.62, 0.3, 1], [K.EMISSIVE, 3.2, 0, 0]);
  }

  for (const t of layout.trees) addTree(props, t.x, t.z, t.height, t.radius, t.tint);

  return { buildings, ground, props };
}
