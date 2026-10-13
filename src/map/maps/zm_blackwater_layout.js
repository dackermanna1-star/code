// Blackwater Docks (zm_blackwater): the plan - floors (AreaMap areas), the perimeter mass
// and the named rectangles every other part of the map builds against.
//
//   y  1536 ┌──────────── perimeter (dock sheds beyond) ─────── TRUCK GATE ───────────┐
//      1344 │  CONTAINER YARD (stacks, lanes, crate steps)        │ TRUCK GATE │ FUEL  │
//       928 │  LOADING ROAD + RAIL SIDING (rail tunnel at the west) │ CUSTOMS    │ DEPOT │
//       672 │ WEST │ WAREHOUSE ONE │ ROW │ WAREHOUSE TWO │ CUSTOMS YARD           │ tanks │
//        96 │ YARD │               │     │               │ (canopy, office)       │ pumps │
//      -128 │══════════════════ QUAY ROAD ══════════════════════════════════════════════│
//      -640 │ QUAY: crane over the freighter, slipway, HARBOUR MASTER, FISH MARKET, depot │
//           │~~~ FREIGHTER (deck 112, hold -64) ~~~~ PIER ONE ~ PIER TWO ~~~ breakwater ~~│
//     -1600 │~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ PIER HEAD ─┐ footbridge   east arm  │
//     -1984 │~~~~~~~~~~~~~~ LIGHTHOUSE ══════════ BREAKWATER (south arm) ══════════════╝  │
//        x -2112                    -512        256           1088    1600     2112
//
// Units: x east, y north, z up. The land is at z 0; the harbour's water surface at -88
// (a visual plane; falling in is a hazard: back on land), its bed at -448 - deeper than the
// nav graph's 260-unit drop, so the horde never paths into it.
import { CONTENTS_PLAYERCLIP } from '../../engine/collision.js';

export const BOUNDS = [-2560, -2304, 2304, 1600];
export const LAND = { x0: -2112, x1: 2112, y0: -640, y1: 1344 }; // the walkable land inside the perimeter
export const QY = -640; // the quay edge
export const ROAD = { y0: -128, y1: 96 };
export const WATER_Z = -88; // the water's surface
export const BED_Z = -448; // the harbour bed
export const BREAK_Z = 32; // the breakwater's walkway
export const DECK_Z = 112; // the freighter's main deck
export const HOLD_Z = -64; // the freighter's hold floor

// buildings (outer wall rects) and features
export const W1 = { x0: -1600, y0: 160, x1: -864, y1: 672 }; // Warehouse One
export const W2 = { x0: -480, y0: 160, x1: 256, y1: 672 }; // Warehouse Two
export const OFFICE = { x0: -128, y0: -544, x1: 256, y1: -256 }; // the harbour master's office
export const MARKET = { x0: 768, y0: -544, x1: 1536, y1: -192 }; // the fish market shed
export const CUSTOMS = { x0: 832, y0: 576, x1: 1216, y1: 864 }; // the customs office
export const CANOPY = { x0: 384, y0: 224, x1: 704, y1: 672 }; // the customs inspection canopy
export const DEPOT = { x0: 1600, y0: 96, x1: 2112, y1: 1344 }; // the fuel depot
export const TANKS = [[1936, 576, 144], [1936, 1008, 144]]; // fuel tanks: x, y, r
export const BUND = { x0: 1744, x1: 2112, y0: 400, y1: 1216, gate0: 760, gate1: 840 }; // the bund wall round them (a way in on the west)
export const PUMPS = { x0: 1696, y0: 160, x1: 2016, y1: 320 }; // the pump island
export const YARD = { x0: -2112, y0: 928, x1: 1088, y1: 1344 }; // the container yard
export const SIDING = { y0: 736, y1: 864, x1: 320 }; // the rail siding's bed (rails along y 800)
export const RAIL_Y = 800;
export const TUNNEL = { x0: -2560, x1: -2112, y0: 720, y1: 880, end: -2496 }; // the rail tunnel (rail gate)
export const GATE = { x0: 1216, x1: 1472, y0: 1344, y1: 1536 }; // the truck gate lane
export const CRANE = { x0: -1440, x1: -1184, y0: -592, y1: -208 }; // the gantry crane's legs
export const SLIP = { x0: -480, x1: -288, y0: -912, z1: -136 }; // the slipway (down into the water)
export const SHIP = { x0: -2048, x1: -640, y0: -1104, y1: -704 }; // the freighter's hull (bow tip at x1)
export const HOLD = { x0: -1760, x1: -960, y0: -1088, y1: -720 };
export const PIER1 = { x0: 512, x1: 704 }, PIER2 = { x0: 1152, x1: 1344 };
export const PIER_Y = -1472; // where the finger piers meet the pier head
export const HEAD = { x0: 512, x1: 1344, y0: -1600, y1: -1472 };
export const BRIDGE = { x0: 864, x1: 960, y0: -1792, y1: -1600 }; // the footbridge to the breakwater
export const EAST_ARM = { x0: 1792, x1: 1984, y0: -1792, y1: -640 };
export const SOUTH_ARM = { x0: 320, x1: 1984, y0: -1984, y1: -1792 };
export const LIGHTHOUSE = { x: 128, y: -1888, r: 224 }; // its platform (octagon)

/** A regular n-gon (apothem r) about x, y as [[x, y], ...], counter-clockwise; rot radians. */
export function ngon(x, y, r, n = 8, rot = 0) {
  const R = r / Math.cos(Math.PI / n), pts = [];
  for (let i = 0; i < n; i++) { const a = rot + (i + 0.5) * 2 * Math.PI / n; pts.push([x + Math.cos(a) * R, y + Math.sin(a) * R]); }
  return pts;
}

/** The floors: every walkable surface of the map's ground plan, and the perimeter. */
export function layout(m, T) {
  m.style = { ...m.style, ground: T.concrete, side: T.seawall, step: T.concrete, wall: T.perimeter, cap: null, roof: T.roofDark, ceil: T.cladding, slabBottom: T.planks };
  const L = LAND;
  // ---- the quay and the road
  m.A('quay', L.x0, QY, L.x1, ROAD.y0, 0, { tex: T.concrete, wall: 192 });
  m.A('road', L.x0, ROAD.y0, L.x1, ROAD.y1, 0, { tex: { name: T.road, rot: 90 }, wall: 288 });
  // ---- the north side: yards between the buildings (the buildings stand on these floors)
  m.A('westyard', L.x0, ROAD.y1, W1.x0, YARD.y0, 0, { tex: T.concrete, wall: 288 });
  m.A('w1', W1.x0, ROAD.y1, W1.x1, SIDING.y0, 0, { tex: T.concrete, wall: 288 });
  m.A('row', W1.x1, ROAD.y1, W2.x0, SIDING.y0, 0, { tex: T.concrete, wall: 288 });
  m.A('w2', W2.x0, ROAD.y1, W2.x1, SIDING.y0, 0, { tex: T.concrete, wall: 288 });
  m.A('customs', W2.x1, ROAD.y1, DEPOT.x0, YARD.y0, 0, { tex: T.concrete, wall: 288 });
  m.A('siding', W1.x0, SIDING.y0, W2.x1, SIDING.y1, 0, { tex: T.gravel, wall: 288 });
  m.A('loading', W1.x0, SIDING.y1, W2.x1, YARD.y0, 0, { tex: T.concrete, wall: 288 });
  m.A('yard', YARD.x0, YARD.y0, YARD.x1, YARD.y1, 0, { tex: T.concrete, wall: 320 });
  m.A('truckyard', YARD.x1, YARD.y0, DEPOT.x0, L.y1, 0, { tex: T.concrete, wall: 320 });
  m.A('depot', DEPOT.x0, ROAD.y1, DEPOT.x1, DEPOT.y1, 0, { tex: T.concrete, wall: 256 });
  // the rail tunnel out of the west wall (the rail gate) and the truck gate lane out of the north wall
  m.A('tunnel', TUNNEL.end, TUNNEL.y0, L.x0, TUNNEL.y1, 0, { tex: T.gravel, wall: 256, ceil: 176, ceilTop: 320, ceilTex: T.seawall, wallTex: T.seawall });
  m.A('gate', GATE.x0, L.y1, GATE.x1, GATE.y1 - 64, 0, { tex: { name: T.road, rot: 0 }, wall: 320 });
  // ---- the harbour: its bed (the water surface is a visual plane), the slipway, the breakwater
  m.A('basin', BOUNDS[0], BOUNDS[1], BOUNDS[2], QY, BED_Z, { tex: T.mud, side: T.seawall, wall: 0 });
  m.R('slipway', SLIP.x0, SLIP.y0, SLIP.x1, QY, SLIP.z1, 0, 'n', { tex: T.seawall, side: T.seawall, wall: 0 });
  m.R('arm_root', EAST_ARM.x0, QY - 128, EAST_ARM.x1, QY, BREAK_Z, 0, 'n', { tex: T.concrete, side: T.seawall, wall: 0 });
  m.A('east_arm', EAST_ARM.x0, EAST_ARM.y0, EAST_ARM.x1, QY - 128, BREAK_Z, { tex: T.concrete, side: T.seawall, wall: 0 });
  m.A('south_arm', SOUTH_ARM.x0, SOUTH_ARM.y0, SOUTH_ARM.x1, SOUTH_ARM.y1, BREAK_Z, { tex: T.concrete, side: T.seawall, wall: 0 });
  m.P('lighthouse', ngon(LIGHTHOUSE.x, LIGHTHOUSE.y, LIGHTHOUSE.r, 8, 0), BREAK_Z, { tex: T.concrete, side: T.seawall, wall: 0 });
  // the piers: plank decks on piles (slabs; the piles are props)
  const pier = { tex: T.planks, side: T.planks, slab: true, slabDepth: 12, wall: 0 };
  m.A('pier1', PIER1.x0, PIER_Y, PIER1.x1, QY, 0, pier);
  m.A('pier2', PIER2.x0, PIER_Y, PIER2.x1, QY, 0, pier);
  m.A('head', HEAD.x0, HEAD.y0, HEAD.x1, HEAD.y1, 0, pier);
  m.A('bridge', BRIDGE.x0, BRIDGE.y0, BRIDGE.x1, BRIDGE.y1, 0, { ...pier, noWalls: true });
  // ---- the perimeter: old dock sheds and walls beyond the fences
  m.zone(BOUNDS[0], QY, L.x0, BOUNDS[3], { height: 352, tex: T.perimeter, roof: T.roofDark });
  m.zone(L.x1, QY, BOUNDS[2], BOUNDS[3], { height: 320, tex: T.perimeter, roof: T.roofDark });
  m.zone(BOUNDS[0], L.y1, BOUNDS[2], BOUNDS[3], { height: 416, tex: T.cladding, roof: T.roofDark });
  m.zone(BOUNDS[0], QY, L.x0, ROAD.y0, { height: 224, tex: T.brick, roof: T.roofDark }); // the quay-end store (west)
  m.zone(L.x1, QY, BOUNDS[2], ROAD.y0, { height: 208, tex: T.brick, roof: T.roofDark }); // the quay-end store (east)
  m.generate();
}

/** An invisible wall: keeps players and the horde off something (a railing's top, a roof). */
export function clip(m, x0, y0, z0, x1, y1, z1) {
  return m.box(x0, y0, z0, x1, y1, z1, { all: null }, { contents: CONTENTS_PLAYERCLIP, visible: false, castShadow: false, name: 'clip' });
}
