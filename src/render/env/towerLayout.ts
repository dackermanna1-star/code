// Our residential tower around the apartment (pure, no Babylon): the facade of every other
// storey (slab-edge bands, concrete spandrels, recessed glazing with reveals, balconies
// with glass railings), the neighbouring units on our storey, the roof and the corridor
// behind the front door. The apartment's own storey (y ∈ [−0.3, 2.7]) inside its facade
// extents is NOT generated — the destructible world structure owns it — except for the
// slab band of the storey above, which closes the facade above our walls.
//
// Coordinates: world metres; floor n has its finished floor at y = (n − FLOOR_LEVEL)·STOREY_H.

import { FLOOR_LEVEL, STOREY_H, BALCONY } from "../../world/plan.ts";
import { MeshBuffer, type RGBA, type Data4 } from "./meshBuffer.ts";
import { TOWER_FOOTPRINT } from "./cityLayout.ts";

export const TOWER_FLOORS = 40;
export const TOWER = { ...TOWER_FOOTPRINT, floors: TOWER_FLOORS } as const;

/** Apartment facade extents on the south (x) and east (z) faces. */
const OWN_SOUTH = { x0: -0.2, x1: 13.0 };
const OWN_EAST = { z0: -0.2, z1: 9.0 };
const SOUTH_Z = TOWER.z0; // −0.2
const EAST_X = TOWER.x1; // 13.0
const NORTH_Z = TOWER.z1;
const WEST_X = TOWER.x0;

interface Win {
  a: number; // along the facade (x for south/north, z for east/west)
  b: number;
  sill: number;
  head: number;
  slider?: boolean;
}

// Unit A (our layout) on the south facade, x from the plan windows.
const UNIT_A_SOUTH: Win[] = [
  { a: 1.0, b: 3.0, sill: 0.9, head: 2.2 },
  { a: 5.0, b: 7.4, sill: 0.0, head: 2.25, slider: true },
  { a: 7.8, b: 8.8, sill: 0.9, head: 2.2 },
  { a: 10.2, b: 11.8, sill: 0.9, head: 2.2 },
];

const mirrorX = (w: Win, axis: number): Win => ({ ...w, a: 2 * axis - w.b, b: 2 * axis - w.a });
const shiftX = (w: Win, dx: number): Win => ({ ...w, a: w.a + dx, b: w.b + dx });

/** South facade windows of the whole storey: unit A, its mirror (unit B) and unit C further west. */
export const SOUTH_WINDOWS: Win[] = [...UNIT_A_SOUTH, ...UNIT_A_SOUTH.map((w) => mirrorX(w, -0.2)), ...UNIT_A_SOUTH.map((w) => shiftX(w, -26.8))].sort((p, q) => p.a - q.a);

/** Balconies on the south facade (x ranges). */
export const SOUTH_BALCONIES: Array<{ x0: number; x1: number }> = [
  { x0: BALCONY.x0, x1: BALCONY.x1 },
  { x0: -0.4 - BALCONY.x1, x1: -0.4 - BALCONY.x0 },
  { x0: BALCONY.x0 - 26.8, x1: BALCONY.x1 - 26.8 },
];

/** East facade windows (z). */
export const EAST_WINDOWS: Win[] = [
  { a: 1.4, b: 3.0, sill: 0.9, head: 2.2 },
  { a: 9.4, b: 10.4, sill: 0.9, head: 2.2 },
  { a: 12.5, b: 14.5, sill: 0.9, head: 2.2 },
  { a: 16.4, b: 17.4, sill: 0.9, head: 2.2 },
  { a: 19.2, b: 20.9, sill: 0.9, head: 2.2 },
];

/** Generic window rhythm for the north and west faces. */
function rhythm(a0: number, a1: number, pitch: number, width: number): Win[] {
  const out: Win[] = [];
  const n = Math.floor((a1 - a0 - 1.2) / pitch);
  const start = a0 + (a1 - a0 - n * pitch) / 2 + (pitch - width) / 2;
  for (let i = 0; i < n; i++) out.push({ a: start + i * pitch, b: start + i * pitch + width, sill: 0.9, head: 2.2 });
  return out;
}
export const NORTH_WINDOWS = rhythm(WEST_X, EAST_X, 3.3, 1.6);
export const WEST_WINDOWS = rhythm(SOUTH_Z, NORTH_Z, 3.4, 1.6);

const CONCRETE: RGBA = [0.5, 0.48, 0.45, 1];
const BAND: RGBA = [0.6, 0.58, 0.54, 1];
const REVEAL: RGBA = [0.42, 0.4, 0.38, 1];
const FRAME: RGBA = [0.05, 0.05, 0.055, 1];
const RAIL: RGBA = [0.55, 0.56, 0.58, 1];
const BAL_SLAB: RGBA = [0.47, 0.45, 0.42, 1];

const NONE: Data4 = [0, 0, 0, 0];

export interface TowerGeometry {
  /** Concrete & metal facade elements of the storeys right above/below ours (shadow casters). */
  near: MeshBuffer;
  /** Remaining facade, roof, base. */
  far: MeshBuffer;
  /** Window glass (data.x = 1) and railing glass (data.x = 2); data.y = per-window seed, data.z = floor index. */
  glass: MeshBuffer;
  /** Corridor behind the front door (baked lighting in vertex colours). */
  corridor: MeshBuffer;
}

type Face = "s" | "e" | "n" | "w";

/** Facade frame: maps (along, y, out) → world point; `out` is the outward normal offset. */
function facadePoint(face: Face, along: number, y: number, out: number): { x: number; y: number; z: number } {
  switch (face) {
    case "s":
      return { x: along, y, z: SOUTH_Z - out };
    case "n":
      return { x: along, y, z: NORTH_Z + out };
    case "e":
      return { x: EAST_X + out, y, z: along };
    case "w":
      return { x: WEST_X - out, y, z: along };
  }
}

function facadeNormal(face: Face): { x: number; y: number; z: number } {
  return face === "s" ? { x: 0, y: 0, z: -1 } : face === "n" ? { x: 0, y: 0, z: 1 } : face === "e" ? { x: 1, y: 0, z: 0 } : { x: -1, y: 0, z: 0 };
}

/** Wall rectangle on a facade plane (offset `out` from the facade line). */
function wallRect(mb: MeshBuffer, face: Face, a0: number, a1: number, y0: number, y1: number, out: number, color: RGBA, data: Data4 = NONE): void {
  if (a1 - a0 < 1e-4 || y1 - y0 < 1e-4) return;
  const n = facadeNormal(face);
  mb.quad(facadePoint(face, a0, y0, out), facadePoint(face, a1, y0, out), facadePoint(face, a1, y1, out), facadePoint(face, a0, y1, out), n, a0, y0, a1, y1, color, data);
}

/** One storey band of a facade between y0..y1 with window openings (recessed glass). */
function facadeStorey(mb: MeshBuffer, glass: MeshBuffer, face: Face, a0: number, a1: number, yFloor: number, wins: Win[], floor: number, seedBase: number): void {
  const yb = yFloor + 0.05; // above the slab band
  const yt = yFloor + 2.7; // below the next band
  const inside = wins.filter((w) => w.b > a0 + 1e-6 && w.a < a1 - 1e-6).sort((p, q) => p.a - q.a);
  let s = a0;
  const n = facadeNormal(face);
  const recess = 0.12;
  for (const w of inside) {
    const wa = Math.max(w.a, a0);
    const wb = Math.min(w.b, a1);
    const sill = Math.max(yb, yFloor + w.sill);
    const head = Math.min(yt, yFloor + w.head);
    wallRect(mb, face, s, wa, yb, yt, 0, CONCRETE); // pier before the opening
    wallRect(mb, face, wa, wb, yb, sill, 0, CONCRETE); // below sill
    wallRect(mb, face, wa, wb, head, yt, 0, CONCRETE); // above head
    // Reveals (returns into the recess), facing into the opening.
    const P = (al: number, y: number, o: number) => facadePoint(face, al, y, o);
    const t = face === "s" || face === "n" ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
    const tn = { x: -t.x, y: 0, z: -t.z };
    mb.quad(P(wa, sill, 0), P(wa, sill, -recess), P(wa, head, -recess), P(wa, head, 0), t, 0, sill, recess, head, REVEAL); // left jamb faces +along
    mb.quad(P(wb, sill, 0), P(wb, sill, -recess), P(wb, head, -recess), P(wb, head, 0), tn, 0, sill, recess, head, REVEAL);
    mb.quad(P(wa, head, 0), P(wb, head, 0), P(wb, head, -recess), P(wa, head, -recess), { x: 0, y: -1, z: 0 }, wa, 0, wb, recess, REVEAL);
    mb.quad(P(wa, sill, 0), P(wb, sill, 0), P(wb, sill, -recess), P(wa, sill, -recess), { x: 0, y: 1, z: 0 }, wa, 0, wb, recess, REVEAL);
    // Frame + mullions (thin dark slabs just proud of the glass).
    const fo = -recess + 0.03;
    const fw = 0.05;
    wallRect(mb, face, wa, wb, head - fw, head, fo, FRAME);
    wallRect(mb, face, wa, wb, sill, sill + fw, fo, FRAME);
    wallRect(mb, face, wa, wa + fw, sill, head, fo, FRAME);
    wallRect(mb, face, wb - fw, wb, sill, head, fo, FRAME);
    const width = wb - wa;
    const panes = w.slider ? 2 : width > 1.5 ? 2 : 1;
    for (let p = 1; p < panes; p++) {
      const m = wa + (width * p) / panes;
      wallRect(mb, face, m - fw / 2, m + fw / 2, sill, head, fo, FRAME);
    }
    // Glass pane.
    const seed = fract(Math.sin((seedBase + wa * 12.9898 + floor * 78.233) * 43758.5453));
    glass.quad(P(wa, sill, -recess + 0.01), P(wb, sill, -recess + 0.01), P(wb, head, -recess + 0.01), P(wa, head, -recess + 0.01), n, 0, 0, width, head - sill, [1, 1, 1, 1], [1, seed, floor, w.slider ? 1 : 0]);
    s = wb;
  }
  wallRect(mb, face, s, a1, yb, yt, 0, CONCRETE);
}

function fract(x: number): number {
  return x - Math.floor(x);
}

/** Slab-edge band protruding 5 cm from the facade. */
function band(mb: MeshBuffer, face: Face, a0: number, a1: number, yFloor: number): void {
  const y0 = yFloor - 0.3;
  const y1 = yFloor + 0.05;
  const o = 0.05;
  wallRect(mb, face, a0, a1, y0, y1, o, BAND);
  // top and bottom lips
  const P = (al: number, y: number, oo: number) => facadePoint(face, al, y, oo);
  mb.quad(P(a0, y1, 0), P(a1, y1, 0), P(a1, y1, o), P(a0, y1, o), { x: 0, y: 1, z: 0 }, a0, 0, a1, o, BAND);
  mb.quad(P(a0, y0, 0), P(a1, y0, 0), P(a1, y0, o), P(a0, y0, o), { x: 0, y: -1, z: 0 }, a0, 0, a1, o, BAND);
}

/** Balcony with slab, glass railing panels, posts and handrail (south facade). */
function balcony(mb: MeshBuffer, glass: MeshBuffer, x0: number, x1: number, yFloor: number, floor: number): void {
  const zf = BALCONY.z0; // −1.6 front edge
  const zb = SOUTH_Z; // −0.2 facade
  const top = yFloor - 0.02;
  mb.box({ x: x0, y: yFloor - 0.27, z: zf }, { x: x1, y: top, z: zb - 0.001 }, BAL_SLAB, NONE, { skip: ["pz"] });
  const railH = BALCONY.railH;
  const inset = 0.05;
  const gx0 = x0 + inset;
  const gx1 = x1 - inset;
  const gz = zf + inset;
  const gy0 = top + 0.06;
  const gy1 = top + railH - 0.06;
  // Glass panels (front + two sides), rendered double-sided by the glass material.
  glass.quad({ x: gx0, y: gy0, z: gz }, { x: gx1, y: gy0, z: gz }, { x: gx1, y: gy1, z: gz }, { x: gx0, y: gy1, z: gz }, { x: 0, y: 0, z: -1 }, 0, 0, gx1 - gx0, gy1 - gy0, [1, 1, 1, 1], [2, 0, floor, 0]);
  glass.quad({ x: gx0, y: gy0, z: gz }, { x: gx0, y: gy0, z: zb }, { x: gx0, y: gy1, z: zb }, { x: gx0, y: gy1, z: gz }, { x: -1, y: 0, z: 0 }, 0, 0, zb - gz, gy1 - gy0, [1, 1, 1, 1], [2, 0, floor, 0]);
  glass.quad({ x: gx1, y: gy0, z: gz }, { x: gx1, y: gy0, z: zb }, { x: gx1, y: gy1, z: zb }, { x: gx1, y: gy1, z: gz }, { x: 1, y: 0, z: 0 }, 0, 0, zb - gz, gy1 - gy0, [1, 1, 1, 1], [2, 0, floor, 0]);
  // Handrail (front + sides) and posts.
  const hr = 0.025;
  mb.box({ x: gx0 - hr, y: top + railH - 0.05, z: gz - hr }, { x: gx1 + hr, y: top + railH, z: gz + hr }, RAIL);
  mb.box({ x: gx0 - hr, y: top + railH - 0.05, z: gz }, { x: gx0 + hr, y: top + railH, z: zb - 0.001 }, RAIL, NONE, { skip: ["pz"] });
  mb.box({ x: gx1 - hr, y: top + railH - 0.05, z: gz }, { x: gx1 + hr, y: top + railH, z: zb - 0.001 }, RAIL, NONE, { skip: ["pz"] });
  const posts = Math.max(2, Math.round((gx1 - gx0) / 1.2) + 1);
  for (let i = 0; i < posts; i++) {
    const px = gx0 + ((gx1 - gx0) * i) / (posts - 1);
    mb.box({ x: px - 0.02, y: top, z: gz - 0.02 }, { x: px + 0.02, y: top + railH - 0.05, z: gz + 0.02 }, RAIL, NONE, { skip: ["bottom", "top"] });
  }
}

/** Build the whole tower. */
export function buildTowerGeometry(): TowerGeometry {
  const near = new MeshBuffer();
  const far = new MeshBuffer();
  const glass = new MeshBuffer();
  const corridor = new MeshBuffer();

  for (let floor = 0; floor < TOWER_FLOORS; floor++) {
    const yF = (floor - FLOOR_LEVEL) * STOREY_H;
    const own = floor === FLOOR_LEVEL;
    const mb = Math.abs(floor - FLOOR_LEVEL) <= 1 ? near : far;
    // --- slab bands (the band of our own storey is skipped inside our extents)
    if (own) {
      band(mb, "s", WEST_X - 0.05, OWN_SOUTH.x0, yF);
      band(mb, "e", OWN_EAST.z1, NORTH_Z + 0.05, yF);
    } else {
      band(mb, "s", WEST_X - 0.05, EAST_X + 0.05, yF);
      band(mb, "e", SOUTH_Z - 0.05, NORTH_Z + 0.05, yF);
    }
    band(mb, "n", WEST_X - 0.05, EAST_X + 0.05, yF);
    band(mb, "w", SOUTH_Z - 0.05, NORTH_Z + 0.05, yF);
    // --- facades
    if (own) {
      facadeStorey(mb, glass, "s", WEST_X, OWN_SOUTH.x0, yF, SOUTH_WINDOWS, floor, 1);
      facadeStorey(mb, glass, "e", OWN_EAST.z1, NORTH_Z, yF, EAST_WINDOWS, floor, 2);
    } else {
      facadeStorey(mb, glass, "s", WEST_X, EAST_X, yF, SOUTH_WINDOWS, floor, 1);
      facadeStorey(mb, glass, "e", SOUTH_Z, NORTH_Z, yF, EAST_WINDOWS, floor, 2);
    }
    facadeStorey(mb, glass, "n", WEST_X, EAST_X, yF, NORTH_WINDOWS, floor, 3);
    facadeStorey(mb, glass, "w", SOUTH_Z, NORTH_Z, yF, WEST_WINDOWS, floor, 4);
    // --- balconies (not the street-level storey; not our own balcony)
    if (floor >= 2) {
      for (const b of SOUTH_BALCONIES) {
        if (own && b.x0 === BALCONY.x0) continue;
        balcony(mb, glass, b.x0, b.x1, yF, floor);
      }
    }
  }
  // --- roof: slab top, parapet, mechanical penthouse
  const yRoof = (TOWER_FLOORS - FLOOR_LEVEL) * STOREY_H;
  far.box({ x: WEST_X - 0.05, y: yRoof - 0.3, z: SOUTH_Z - 0.05 }, { x: EAST_X + 0.05, y: yRoof + 0.05, z: NORTH_Z + 0.05 }, BAND, NONE, { skip: ["bottom"] });
  const pt = 0.25;
  const ph = 1.1;
  const parapetCol: RGBA = [0.55, 0.53, 0.5, 1];
  far.box({ x: WEST_X - 0.05, y: yRoof + 0.05, z: SOUTH_Z - 0.05 }, { x: EAST_X + 0.05, y: yRoof + ph, z: SOUTH_Z - 0.05 + pt }, parapetCol, NONE, { skip: ["bottom"] });
  far.box({ x: WEST_X - 0.05, y: yRoof + 0.05, z: NORTH_Z + 0.05 - pt }, { x: EAST_X + 0.05, y: yRoof + ph, z: NORTH_Z + 0.05 }, parapetCol, NONE, { skip: ["bottom"] });
  far.box({ x: WEST_X - 0.05, y: yRoof + 0.05, z: SOUTH_Z - 0.05 + pt }, { x: WEST_X - 0.05 + pt, y: yRoof + ph, z: NORTH_Z + 0.05 - pt }, parapetCol, NONE, { skip: ["bottom"] });
  far.box({ x: EAST_X + 0.05 - pt, y: yRoof + 0.05, z: SOUTH_Z - 0.05 + pt }, { x: EAST_X + 0.05, y: yRoof + ph, z: NORTH_Z + 0.05 - pt }, parapetCol, NONE, { skip: ["bottom"] });
  far.box({ x: -14, y: yRoof + 0.05, z: 7 }, { x: -2, y: yRoof + 4.2, z: 17 }, [0.46, 0.44, 0.41, 1], NONE, { skip: ["bottom"] });
  far.box({ x: -9, y: yRoof + 4.2, z: 9 }, { x: -5, y: yRoof + 7.5, z: 13 }, [0.2, 0.2, 0.21, 1], NONE, { skip: ["bottom"] });

  buildCorridor(corridor);
  return { near, far, glass, corridor };
}

// ------------------------------------------------------------------ corridor

/** Interior corridor on our storey behind the north wall (front door at x 10.4–11.4). */
export const CORRIDOR = { x0: WEST_X + 0.2, x1: EAST_X - 0.2, z0: 9.0, z1: 10.8, h: 2.6 } as const;

const CORRIDOR_LIGHTS = [-22, -14, -6, 2, 10];

/** Baked light at a point: warm pools under the ceiling panels + a dim base. */
function corridorLight(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
  let l = 0.1;
  for (const lx of CORRIDOR_LIGHTS) {
    const dx = x - lx;
    const dy = y - CORRIDOR.h;
    const dz = z - (CORRIDOR.z0 + CORRIDOR.z1) / 2;
    const d2 = dx * dx + dy * dy + dz * dz;
    const d = Math.sqrt(d2) || 1;
    const ndl = Math.max(0, -(nx * dx + ny * dy + nz * dz) / d);
    l += (1.6 * ndl) / (1 + d2);
  }
  return l;
}

function corridorSurface(mb: MeshBuffer, a0: number, a1: number, b0: number, b1: number, kind: "floor" | "ceiling" | "wallN" | "wallS", base: readonly [number, number, number]): void {
  // Tessellated along x (0.5 m cells) so the baked light pools read.
  const step = 0.5;
  const nx0 = Math.ceil((a1 - a0) / step);
  for (let i = 0; i < nx0; i++) {
    const x0 = a0 + ((a1 - a0) * i) / nx0;
    const x1 = a0 + ((a1 - a0) * (i + 1)) / nx0;
    let p0, p1, p2, p3, n;
    if (kind === "floor") {
      n = { x: 0, y: 1, z: 0 };
      p0 = { x: x0, y: 0, z: b0 };
      p1 = { x: x1, y: 0, z: b0 };
      p2 = { x: x1, y: 0, z: b1 };
      p3 = { x: x0, y: 0, z: b1 };
    } else if (kind === "ceiling") {
      n = { x: 0, y: -1, z: 0 };
      p0 = { x: x0, y: CORRIDOR.h, z: b0 };
      p1 = { x: x1, y: CORRIDOR.h, z: b0 };
      p2 = { x: x1, y: CORRIDOR.h, z: b1 };
      p3 = { x: x0, y: CORRIDOR.h, z: b1 };
    } else {
      const z = kind === "wallN" ? CORRIDOR.z1 : CORRIDOR.z0;
      n = { x: 0, y: 0, z: kind === "wallN" ? -1 : 1 };
      p0 = { x: x0, y: b0, z };
      p1 = { x: x1, y: b0, z };
      p2 = { x: x1, y: b1, z };
      p3 = { x: x0, y: b1, z };
    }
    const pts = [p0, p1, p2, p3];
    const idx = pts.map((p) => {
      const l = corridorLight(p.x, p.y, p.z, n.x, n.y, n.z);
      return mb.vertex(p, n, p.x, p.y + p.z, [base[0] * l, base[1] * l, base[2] * l, 1], NONE);
    });
    mb.tri(idx[0], idx[1], idx[2], n);
    mb.tri(idx[0], idx[2], idx[3], n);
  }
}

function buildCorridor(mb: MeshBuffer): void {
  const C = CORRIDOR;
  corridorSurface(mb, C.x0, C.x1, C.z0, C.z1, "floor", [0.32, 0.24, 0.2]); // carpet
  corridorSurface(mb, C.x0, C.x1, C.z0, C.z1, "ceiling", [0.75, 0.74, 0.7]);
  corridorSurface(mb, C.x0, C.x1, 0, C.h, "wallN", [0.62, 0.58, 0.5]);
  // South wall only west of our apartment (our north wall is world structure).
  corridorSurface(mb, C.x0, -0.2, 0, C.h, "wallS", [0.62, 0.58, 0.5]);
  // End walls.
  const endCol = (x: number, nx: number) => {
    const n = { x: nx, y: 0, z: 0 };
    const l = corridorLight(x, 1.3, (C.z0 + C.z1) / 2, nx, 0, 0);
    const c: RGBA = [0.62 * l, 0.58 * l, 0.5 * l, 1];
    mb.quad({ x, y: 0, z: C.z0 }, { x, y: 0, z: C.z1 }, { x, y: C.h, z: C.z1 }, { x, y: C.h, z: C.z0 }, n, C.z0, 0, C.z1, C.h, c, NONE);
  };
  endCol(C.x0, 1);
  endCol(C.x1, -1);
  // Emissive ceiling panels (slightly below the ceiling) and unit doors on the north wall.
  for (const lx of CORRIDOR_LIGHTS) {
    const n = { x: 0, y: -1, z: 0 };
    const y = C.h - 0.01;
    mb.quad({ x: lx - 0.3, y, z: 9.6 }, { x: lx + 0.3, y, z: 9.6 }, { x: lx + 0.3, y, z: 10.2 }, { x: lx - 0.3, y, z: 10.2 }, n, 0, 0, 1, 1, [3.0, 2.7, 2.2, 1], NONE);
  }
  for (const dx of [-21, -9, 3, 9.5]) {
    const n = { x: 0, y: 0, z: -1 };
    const z = C.z1 - 0.01;
    const l = corridorLight(dx + 0.5, 1.0, z, 0, 0, -1);
    mb.quad({ x: dx, y: 0, z }, { x: dx + 1.0, y: 0, z }, { x: dx + 1.0, y: 2.1, z }, { x: dx, y: 2.1, z }, n, 0, 0, 1, 2.1, [0.28 * l, 0.17 * l, 0.1 * l, 1], NONE);
  }
  // Neighbour's front door on the south wall.
  {
    const n = { x: 0, y: 0, z: 1 };
    const z = C.z0 + 0.01;
    const l = corridorLight(-3.5, 1.0, z, 0, 0, 1);
    mb.quad({ x: -4.0, y: 0, z }, { x: -3.0, y: 0, z }, { x: -3.0, y: 2.1, z }, { x: -4.0, y: 2.1, z }, n, 0, 0, 1, 2.1, [0.28 * l, 0.17 * l, 0.1 * l, 1], NONE);
  }
}
