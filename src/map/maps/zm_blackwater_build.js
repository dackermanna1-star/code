// Blackwater Docks (zm_blackwater): the structures - the quay, the gantry crane, the freighter,
// the piers and the launch, the breakwater and the lighthouse, the harbour master's office,
// the fish market, the warehouses, the customs yard, the fuel depot, the container yard and
// the rail siding. Floors come from zm_blackwater_layout.js; props from zm_blackwater_parts.js.
import { room, wall, glass, lamp, barrel, container, gableRoof } from '../kit.js';
import { CONTENTS_PLAYERCLIP } from '../../engine/collision.js';
import {
  BOUNDS, LAND, QY, WATER_Z, BED_Z, BREAK_Z, DECK_Z, HOLD_Z, W1, W2, OFFICE, MARKET, CUSTOMS, CANOPY, TANKS, BUND, PUMPS,
  SIDING, RAIL_Y, TUNNEL, CRANE, SLIP, SHIP, HOLD, PIER1, PIER2, PIER_Y, HEAD, BRIDGE, EAST_ARM, SOUTH_ARM, LIGHTHOUSE, clip,
} from './zm_blackwater_layout.js';
import { SODIUM, COLD, WARM, h01, cyl, frustum, bollard, pile, railing, pallet, crateSteps, crateStepsAlong, yardLight, forklift, strut } from './zm_blackwater_parts.js';

const GANGWAYS = [-1360, -1000]; // the gangways' centre lines (x)
const DN = { detail: true, castShadow: false };

// ---------------------------------------------------------------- the water
export function water(m, T) {
  // the harbour's surface: a visual plane only (no collision; light passes), far beyond the
  // map so its edge is lost in the fog (the harbour itself finer: the piers' shadows on it)
  const far = 9000, [wx0, wy0, wx1] = BOUNDS;
  const sheet = (x0, y0, x1, y1, luxel) => {
    const b = m.box(x0, y0, WATER_Z - 4, x1, y1, WATER_Z, { all: null, top: T.water }, { contents: 0, castShadow: false, name: 'water' });
    if (b) b.luxel = luxel;
  };
  sheet(wx0, wy0, wx1, QY, 32);
  sheet(-far, -far, far, wy0, 128);
  sheet(-far, wy0, wx0, QY, 128);
  sheet(wx1, wy0, far, QY, 128);
  // the bed under the far water (nothing to see, but nothing open either)
  const bed = m.box(-far, -far, BED_Z - 32, far, QY, BED_Z - 16, { all: null, top: T.mud }, { name: 'bed' });
  bed.luxel = 128;
  // the map's edge out on the water: invisible walls (nobody swims off the map)
  const [bx0, by0, bx1] = BOUNDS;
  clip(m, bx0, by0, BED_Z, bx0 + 8, QY, 1600);
  clip(m, bx1 - 8, by0, BED_Z, bx1, QY, 1600);
  clip(m, bx0, by0, BED_Z, bx1, by0 + 8, 1600);
}

// ---------------------------------------------------------------- the quay
export function quay(m, T) {
  // the quay edge: a timber fender line and a concrete coping, bollards between
  m.box(LAND.x0, QY, -8, LAND.x1, QY + 24, 0, { all: T.seawall, top: T.concrete }, { name: 'coping' });
  for (let x = LAND.x0 + 160; x < LAND.x1 - 64; x += 320) {
    if (x > SLIP.x0 - 40 && x < SLIP.x1 + 40) continue;
    if ((x > PIER1.x0 - 40 && x < PIER1.x1 + 40) || (x > PIER2.x0 - 40 && x < PIER2.x1 + 40) || (x > EAST_ARM.x0 - 40 && x < EAST_ARM.x1 + 40)) continue;
    bollard(m, x, QY + 36, 0, T);
  }
  // fenders: timber rubbing strips hung down the quay wall (stop where the slipway cuts in)
  for (let x = LAND.x0 + 48; x < LAND.x1; x += 128) {
    if (x > SLIP.x0 - 24 && x < SLIP.x1 + 24) continue;
    m.box(x - 8, QY - 10, WATER_Z - 40, x + 8, QY, -10, { all: T.pile }, { surface: 'wood', name: 'fender', detail: true, castShadow: false });
  }
  // crane rails along the berth (flush steel strips)
  for (const y of [CRANE.y0 + 24, CRANE.y1 - 24]) m.box(LAND.x0, y - 4, 0, -640, y + 4, 2, { all: T.iron }, { surface: 'metal', name: 'rail', detail: true, castShadow: false });
}

// ---------------------------------------------------------------- the slipway
export function slipway(m, T) {
  // kerbs down both sides (low: you can still step off into the water)
  for (const x of [SLIP.x0, SLIP.x1 - 12]) m.prism('x', [[SLIP.y0, SLIP.z1 - 24], [QY, -16], [QY, 8], [SLIP.y0, SLIP.z1 + 8]], x, x + 12, { all: T.seawall }, { name: 'kerb' });
}

// ---------------------------------------------------------------- the gantry crane (the landmark)
export function crane(m, T) {
  const { x0, x1, y0, y1 } = CRANE, s = 24, top = 448, o = { surface: 'metal', name: 'crane' };
  const legs = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
  for (const [x, y] of legs) {
    m.box(x - 40, y - 28, 0, x + 40, y + 28, 30, { all: T.iron }, o); // the bogie on its rail
    m.box(x - s, y - s, 30, x + s, y + s, top, { all: T.crane }, o);
  }
  // portal beams: along the quay (x) on both rails, across it (y) at both ends
  for (const y of [y0, y1]) m.box(x0 - s, y - s, top, x1 + s, y + s, top + 48, { all: T.crane }, o);
  for (const x of [x0, x1]) m.box(x - s, y0 - s, top - 64, x + s, y1 + s, top + 48, { all: T.crane }, o);
  // diagonal sway braces (inside the y legs' plane)
  for (const x of [x0, x1]) {
    m.prism('x', [[y0 + s, 176], [y0 + s, 210], [y1 - s, top - 64], [y1 - s, top - 98]], x - 8, x + 8, { all: T.crane }, o);
  }
  // the machinery house on the portal, the A-frame above it, the boom out over the water
  const mx0 = x0 - 16, mx1 = x1 + 16;
  m.box(mx0, y1 - 192, top + 48, mx1, y1 + 32, top + 176, { all: T.cladding, top: T.roofDark, bottom: T.crane }, { name: 'crane' });
  const bz = 704, bz1 = bz + 56; // the boom's girder
  m.box(x0 + 64, -1520, bz, x1 - 64, 80, bz1, { all: T.crane }, o);
  m.box(x0 + 72, -1528, bz - 40, x1 - 72, -1480, bz, { all: T.crane }, o); // boom tip
  for (const x of [x0 + 8, x1 - 8]) {
    // A-frame legs from the portal up to the apex (prisms in the x = const plane)
    m.prism('x', [[y0 - s, top + 48], [y0 + s, top + 48], [-388, 1000], [-412, 1000]], x - 12, x + 12, { all: T.crane }, o);
    m.prism('x', [[y1 - s, top + 48], [y1 + s, top + 48], [-388, 1000], [-412, 1000]], x - 12, x + 12, { all: T.crane }, o);
  }
  m.box(x0 - 4, -424, 992, x1 + 4, -376, 1040, { all: T.crane }, o); // apex beam
  // forestays from the apex to the boom tip and back to the backreach
  for (const x of [x0 + 40, x1 - 40]) {
    strut(m, 'x', [-412, 1000], [-1500, bz1], 14, x - 6, x + 6, { all: T.iron }, o);
    strut(m, 'x', [-388, 1000], [60, bz1], 14, x - 6, x + 6, { all: T.iron }, o);
  }
  // the operator's cab under the boom, the trolley, the spreader hanging over the hatch
  m.box(-1352, -760, bz - 112, -1272, -660, bz - 4, { all: T.crane, s: T.glass, n: T.glass }, o);
  m.box(-1352, -1060, bz - 40, -1272, -980, bz, { all: T.iron }, o);
  for (const x of [-1330, -1294]) m.box(x - 2, -1022, 300, x + 2, -1018, bz - 40, { all: T.iron }, { ...o, detail: true, castShadow: false });
  m.box(-1408, -1040, 280, -1216, -1000, 300, { all: T.crane }, o);
  // lights under the boom and the portal
  for (const y of [-1180, -900, -620]) lamp(m, -1312, y, bz - 6, { size: [24, 24], color: SODIUM, intensity: 0.9, radius: 700 });
  lamp(m, (x0 + x1) / 2, (y0 + y1) / 2, top - 70, { size: [28, 20], color: SODIUM, intensity: 0.8, radius: 520 });
}

// ---------------------------------------------------------------- the freighter
export function freighter(m, T) {
  const { x0, x1, y0, y1 } = SHIP, yc = (y0 + y1) / 2, bw = 152; // bulwark top
  const hullT = { all: T.hull, top: T.deck }, o = { surface: 'metal', name: 'ship' };
  const xb = x1 - 128; // where the bow starts
  // the lower hull (solid below the hold floor), the sides, the bow
  m.box(x0, y0, BED_Z + 64, xb, y1, HOLD_Z, hullT, o);
  m.box(x0, y0, HOLD_Z, xb, y0 + 16, bw, hullT, o);
  // the quay side: up to the deck, then the bulwark with gaps where the gangways come aboard
  m.box(x0, y1 - 16, HOLD_Z, xb, y1, DECK_Z, hullT, o);
  let gx = x0;
  for (const g of GANGWAYS) {
    m.box(gx, y1 - 16, DECK_Z, g - 48, y1, bw, hullT, o);
    clip(m, gx, y1 - 16, bw, g - 48, y1, DECK_Z + 160);
    gx = g + 48;
  }
  m.box(gx, y1 - 16, DECK_Z, xb, y1, bw, hullT, o);
  clip(m, gx, y1 - 16, bw, xb, y1, DECK_Z + 160);
  // the bow: a raked stem in four bands, each reaching further forward and flaring wider than
  // the one below it (from the forefoot under the water up to the forecastle)
  const bands = [[BED_Z + 64, WATER_Z - 20, 96, 40], [WATER_Z - 20, -24, 64, 24], [-24, 48, 32, 10], [48, DECK_Z, 0, 0]];
  for (const [za, zb, back, pinch] of bands) {
    const tip = x1 - back, sx = xb + (tip - xb) * 0.7, sy = (yc - y0 - pinch) * 0.4;
    m.prism('z', [[xb, y0 + pinch], [sx, y0 + pinch + sy], [tip, yc], [sx, y1 - pinch - sy], [xb, y1 - pinch]], za, zb, { all: T.hull, top: T.deck }, o);
  }
  m.box(x1 - 60, yc - 4, DECK_Z, x1 - 8, yc + 4, DECK_Z + 40, { all: T.hull }, { ...o, detail: true }); // (the stem's top)
  // the stern: a transom block under the superstructure
  m.box(x0, y0 + 16, HOLD_Z, HOLD.x0 - 16, y1 - 16, DECK_Z, hullT, o);
  // forward of the hold: a fill up to the deck (the forepeak)
  m.box(HOLD.x1 + 16, y0 + 16, HOLD_Z, xb, y1 - 16, DECK_Z, hullT, o);
  // bulkheads at the ends of the hold
  m.box(HOLD.x0 - 16, y0 + 16, HOLD_Z, HOLD.x0, y1 - 16, DECK_Z - 16, { all: T.hull }, o);
  m.box(HOLD.x1, y0 + 16, HOLD_Z, HOLD.x1 + 16, y1 - 16, DECK_Z - 16, { all: T.hull }, o);
  // the main deck over the hold, with the open hatch and two stairwells cut out
  const hatch = { x0: -1440, x1: -1280, y0: -992, y1: -816 };
  const fwd = { x0: -1216, x1: HOLD.x1, y0: HOLD.y0, y1: HOLD.y0 + 64 }; // forward stair (south side, rising east)
  const aft = { x0: HOLD.x0, x1: HOLD.x0 + 224, y0: HOLD.y1 - 64, y1: HOLD.y1 }; // aft stair (north side, rising west)
  const holes = [hatch, fwd, aft];
  deckWithHoles(m, HOLD.x0 - 16, HOLD.y0, HOLD.x1 + 16, HOLD.y1, DECK_Z - 16, DECK_Z, holes, { all: T.hull, top: T.deck, bottom: T.hull }, o);
  // hatch coamings (32: anyone climbs them) and the two closed hatch covers (36)
  coaming(m, hatch, T);
  for (const hx of [[-1720, -1496], [-1232, -1008]]) {
    m.box(hx[0], -1008, DECK_Z, hx[1], -800, DECK_Z + 36, { all: T.hull, top: T.hatch }, o);
  }
  // the stairs: hold floor (-64) to the deck (112), 11 steps
  solidStairs(m, -1232, fwd.y0, fwd.x1, fwd.y1, HOLD_Z, DECK_Z, 'e', 11, { top: T.deck, all: T.iron }, { surface: 'metal', name: 'stairs' });
  solidStairs(m, aft.x0, aft.y0, aft.x0 + 240, aft.y1, HOLD_Z, DECK_Z, 'w', 11, { top: T.deck, all: T.iron }, { surface: 'metal', name: 'stairs' });
  // railings round the stairwells on deck (the open side is where the stair comes up)
  railing(m, fwd.x0, fwd.y1, fwd.x1, fwd.y1, DECK_Z, T);
  railing(m, fwd.x0, fwd.y0 + 16, fwd.x0, fwd.y1, DECK_Z, T);
  railing(m, aft.x1, aft.y0, aft.x1, aft.y1 - 16, DECK_Z, T);
  railing(m, aft.x0 + 16, aft.y0, aft.x1, aft.y0, DECK_Z, T);
  // bulwark clips (nobody walks the ship's rail; nobody falls off it)
  clip(m, x0, y0, bw, xb, y0 + 16, DECK_Z + 160);
  // the gangways from the quay: solid ramps over the quay, then a plank over the gap
  for (const g of GANGWAYS) gangway(m, g, T);
  // the superstructure (aft): accommodation block, bridge, funnel - all out of reach
  const sx0 = x0, sx1 = HOLD.x0 - 64;
  m.box(sx0, y0 + 24, DECK_Z, sx1, y1 - 24, DECK_Z + 224, { all: T.paintWhite, top: T.deck }, o);
  m.box(sx0 + 16, y0 + 8, DECK_Z + 224, sx1 - 32, y1 - 8, DECK_Z + 320, { all: T.paintWhite, top: T.deck, e: T.paintWhite }, o);
  glass(m, sx1 - 34, y0 + 40, DECK_Z + 250, sx1 - 30, y1 - 40, DECK_Z + 298, T.glass);
  frustum(m, sx0 + 96, yc, DECK_Z + 320, DECK_Z + 448, 64, 52, 8, { all: T.hull, top: T.iron }, o);
  clip(m, sx0, y0, DECK_Z + 224, sx1, y1, DECK_Z + 600);
  // the deck in front of the superstructure is open: hold and deck lamps
  lamp(m, sx1 + 4, yc, DECK_Z + 200, { face: 'e', size: [28, 16], color: WARM, intensity: 0.8, radius: 520 });
  // work lamps down both sides of the hold (dim, warm: a dark place, but you see them coming)
  for (const x of [-1680, -1480, -1240, -1040]) for (const y of [HOLD.y0 + 80, HOLD.y1 - 80]) lamp(m, x, y, DECK_Z - 16, { size: [24, 16], color: [0.95, 0.8, 0.6], intensity: 0.7, radius: 420 });
}

/** A slab (z0..z1) over x0..x1, y0..y1 with rectangular holes (convex pieces). */
function deckWithHoles(m, x0, y0, x1, y1, z0, z1, holes, tex, o) {
  // split along x at every hole edge, then along y within each strip
  const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h.x0, h.x1])])].filter((x) => x >= x0 && x <= x1).sort((a, b) => a - b);
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i], b = xs[i + 1], mid = (a + b) / 2;
    const cut = holes.filter((h) => mid > h.x0 && mid < h.x1).sort((p, q) => p.y0 - q.y0);
    let y = y0;
    for (const h of cut) { if (h.y0 > y) m.box(a, y, z0, b, h.y0, z1, tex, o); y = Math.max(y, h.y1); }
    if (y < y1) m.box(a, y, z0, b, y1, z1, tex, o);
  }
}

function coaming(m, h, T) {
  const t = 8, z = DECK_Z, z1 = DECK_Z + 32, tex = { all: T.hull, top: T.iron }, o = { surface: 'metal', name: 'coaming' };
  m.box(h.x0 - t, h.y0 - t, z, h.x1 + t, h.y0, z1, tex, o);
  m.box(h.x0 - t, h.y1, z, h.x1 + t, h.y1 + t, z1, tex, o);
  m.box(h.x0 - t, h.y0, z, h.x0, h.y1, z1, tex, o);
  m.box(h.x1, h.y0, z, h.x1 + t, h.y1, z1, tex, o);
}

/** A gangway centred on x: up from the quay at y -432 (z 0) to the deck edge (z 112). */
function gangway(m, x, T) {
  const w = 40, ya = -432, yb = SHIP.y1 - 24, run = ya - yb, o = { surface: 'metal', name: 'gangway' };
  const zAt = (y) => (ya - y) / run * DECK_Z;
  // over the quay: a solid ramp to the ground; over the water: a 12-thick deck
  m.prism('x', [[ya, 0], [QY, 0], [QY, zAt(QY)]], x - w, x + w, { all: T.steel, top: T.grate }, o);
  m.prism('x', [[QY, zAt(QY) - 12], [yb, DECK_Z - 12], [yb, DECK_Z], [QY, zAt(QY)]], x - w, x + w, { all: T.steel, top: T.grate }, o);
  for (const s of [-1, 1]) {
    const xr = x + s * (w + 2);
    // hand rails along both sides, with clips (no walking the rail)
    m.prism('x', [[ya, 40], [yb, DECK_Z + 40], [yb, DECK_Z + 44], [ya, 44]], xr - 2, xr + 2, { all: T.steel }, { ...o, detail: true, castShadow: false });
    for (let i = 0; i <= 4; i++) { const y = ya + (yb - ya) * i / 4; m.box(xr - 2, y - 2, zAt(y), xr + 2, y + 2, zAt(y) + 42, { all: T.steel }, { ...o, detail: true, castShadow: false }); }
    m.prism('x', [[ya, 0], [yb, DECK_Z], [yb, DECK_Z + 160], [ya, 160]], xr - 4, xr + 4, { all: null }, { contents: CONTENTS_PLAYERCLIP, visible: false, castShadow: false, name: 'clip' });
  }
}

// ---------------------------------------------------------------- the piers, the launch
export function piers(m, T) {
  const top = -12;
  // piles under every deck edge, 160 apart; cross beams under the planks
  for (const P of [PIER1, PIER2]) {
    for (let y = QY - 96; y > PIER_Y; y -= 160) {
      pile(m, P.x0 + 12, y, BED_Z, top, T); pile(m, P.x1 - 12, y, BED_Z, top, T);
      m.box(P.x0, y - 8, top - 16, P.x1, y + 8, top, { all: T.pile }, { surface: 'wood', name: 'beam', detail: true });
    }
    // edge stringers (8: a kerb), open to the water between the bollards
    for (const x of [P.x0, P.x1 - 8]) m.box(x, PIER_Y, 0, x + 8, QY, 8, { all: T.pile }, { surface: 'wood', name: 'stringer', detail: true });
    for (let y = QY - 160; y > PIER_Y + 40; y -= 256) { bollard(m, P.x0 + 24, y, 0, T); bollard(m, P.x1 - 24, y, 0, T); }
  }
  for (let x = HEAD.x0 + 12; x <= HEAD.x1; x += 160) {
    pile(m, Math.min(x, HEAD.x1 - 12), HEAD.y0 + 12, BED_Z, top, T);
    if (x > PIER1.x1 && x < PIER2.x0) pile(m, x, HEAD.y1 - 12, BED_Z, top, T);
  }
  m.box(HEAD.x0, HEAD.y0, 0, HEAD.x1, HEAD.y0 + 8, 8, { all: T.pile }, { surface: 'wood', name: 'stringer', detail: true });
  // the footbridge to the breakwater: a steel span with railings
  for (const x of [BRIDGE.x0, BRIDGE.x1]) railing(m, x, BRIDGE.y0, x, BRIDGE.y1, 0, T);
  pile(m, BRIDGE.x0 + 8, BRIDGE.y0 + 64, BED_Z, -12, T); pile(m, BRIDGE.x1 - 8, BRIDGE.y0 + 64, BED_Z, -12, T);
  // the launch: a small work boat moored along pier two's east side (the extraction ride)
  launch(m, PIER2.x1 + 96, -1180, T);
}

function launch(m, x, y, T) {
  const z = -16, o = { surface: 'metal', name: 'launch' }; // deck: a step down from the pier
  const L = 200, B = 72;
  m.prism('z', [[x - B, y - L], [x + B, y - L], [x + B, y + L - 80], [x, y + L], [x - B, y + L - 80]], WATER_Z - 40, z, { all: T.hullBoat, top: T.planks }, o);
  // gunwale (bulwark) round the deck except the pier side, and its clip
  m.box(x + B - 8, y - L, z, x + B, y + L - 80, z + 32, { all: T.hullBoat }, o);
  m.box(x - B, y - L, z, x + B, y - L + 8, z + 32, { all: T.hullBoat }, o);
  clip(m, x + B - 8, y - L, z + 32, x + B, y + L - 80, z + 160);
  clip(m, x - B, y - L, z + 32, x + B, y - L + 8, z + 160);
  m.prism('z', [[x - B, y + L - 80], [x + B, y + L - 80], [x, y + L]], z, z + 160, { all: null }, { contents: CONTENTS_PLAYERCLIP, visible: false, castShadow: false, name: 'clip' });
  // the wheelhouse (solid, windows dark) and a mast with a lamp
  m.box(x - 44, y + 20, z, x + 44, y + 120, z + 104, { all: T.paintWhite, n: T.glass, top: T.roofDark }, o);
  m.box(x - 50, y + 14, z + 104, x + 50, y + 126, z + 112, { all: T.paintWhite }, o);
  m.box(x - 3, y + 60, z + 112, x + 3, y + 66, z + 240, { all: T.iron }, { ...o, detail: true });
  lamp(m, x, y + 63, z + 226, { size: [10, 10], color: WARM, intensity: 0.7, radius: 360 });
  // the pier side: a gap in the stringer for stepping aboard (the pier's east edge)
}

// ---------------------------------------------------------------- the breakwater, the lighthouse
export function breakwater(m, T) {
  // the seaward parapet (96 over the walkway: out of reach), with its coping
  const pz = BREAK_Z + 96;
  m.box(EAST_ARM.x1, EAST_ARM.y0 - 192, BED_Z, EAST_ARM.x1 + 32, QY - 64, pz, { all: T.seawall, top: T.concrete }, { name: 'parapet' });
  m.box(SOUTH_ARM.x0 + 64, SOUTH_ARM.y0 - 32, BED_Z, EAST_ARM.x1 + 32, SOUTH_ARM.y0, pz, { all: T.seawall, top: T.concrete }, { name: 'parapet' });
  // the harbour side: a steep revetment of blocks down into the water (too steep to stand on)
  const rv = (pts, lo, hi, axis) => m.prism(axis, pts, lo, hi, { all: T.seawall }, { name: 'revetment' });
  rv([[EAST_ARM.x0 - 72, WATER_Z - 60], [EAST_ARM.x0, WATER_Z - 60], [EAST_ARM.x0, BREAK_Z - 4]], SOUTH_ARM.y1, QY - 128, 'y');
  rv([[SOUTH_ARM.y1, WATER_Z - 60], [SOUTH_ARM.y1 + 72, WATER_Z - 60], [SOUTH_ARM.y1, BREAK_Z - 4]], SOUTH_ARM.x0 + 160, BRIDGE.x0 - 8, 'x');
  rv([[SOUTH_ARM.y1, WATER_Z - 60], [SOUTH_ARM.y1 + 72, WATER_Z - 60], [SOUTH_ARM.y1, BREAK_Z - 4]], BRIDGE.x1 + 8, EAST_ARM.x0, 'x');
  // the lighthouse
  lighthouse(m, T);
}

function lighthouse(m, T) {
  const { x, y } = LIGHTHOUSE, z = BREAK_Z;
  // the keeper's watch room at its foot (the radio): two doors, east and north
  const r0 = { x0: x - 80, y0: y - 80, x1: x + 80, y1: y + 80 };
  room(m, r0.x0, r0.y0, r0.x1, r0.y1, z, 128, {
    wallOut: T.paintWhite, wallIn: T.paintWhite, ceil: T.planks, roof: T.concrete,
    gaps: { e: [{ c: y, w: 72 }], n: [{ c: x, w: 72 }], s: [{ c: x, w: 64, z0: z + 56, z1: z + 104 }], w: [{ c: y, w: 64, z0: z + 56, z1: z + 104 }] },
  });
  glass(m, x - 32, r0.y0 - 10, z + 56, x + 32, r0.y0 - 6, z + 104, T.glass);
  glass(m, r0.x0 - 10, y - 32, z + 56, r0.x0 - 6, y + 32, z + 104, T.glass);
  lamp(m, x, y, z + 124, { size: [24, 16], color: WARM, intensity: 0.75, radius: 300 });
  // the tower: white, tapering, on the room's roof; gallery, lantern, cap
  const t0 = z + 144, t1 = z + 720;
  frustum(m, x, y, t0, t1, 92, 64, 16, { all: T.paintWhite, top: T.iron }, { name: 'tower' });
  cyl(m, x, y, t1, t1 + 10, 100, 16, { all: T.iron }, { name: 'gallery' });
  for (let i = 0; i < 16; i++) { const a = (i + 0.5) * Math.PI / 8; m.box(x + Math.cos(a) * 96 - 2, y + Math.sin(a) * 96 - 2, t1 + 10, x + Math.cos(a) * 96 + 2, y + Math.sin(a) * 96 + 2, t1 + 46, { all: T.iron }, { detail: true, castShadow: false }); }
  cyl(m, x, y, t1 + 42, t1 + 46, 100, 16, { all: T.iron }, { detail: true, castShadow: false, name: 'gallery' });
  cyl(m, x, y, t1 + 10, t1 + 22, 50, 8, { all: T.iron }, { name: 'lantern' });
  const lan = cyl(m, x, y, t1 + 22, t1 + 96, 30, 8, { all: T.lightPanel }, { name: 'lantern' });
  lan.fullbright = true; lan.castShadow = false;
  m.prism('z', [[x - 52, y - 52], [x + 52, y - 52], [x + 52, y + 52], [x - 52, y + 52]], t1 + 22, t1 + 96, { all: T.glass }, { contents: 0, detail: true, castShadow: false, name: 'lantern glass' });
  frustum(m, x, y, t1 + 96, t1 + 140, 56, 12, 8, { all: T.iron }, { name: 'cap' });
  m.light(x + 70, y, t1 + 60, [1.0, 0.92, 0.7], 1.4, 900);
  m.light(x - 70, y, t1 + 60, [1.0, 0.92, 0.7], 1.0, 700);
  // a lamp on the platform by the doors
  lamp(m, r0.x1 + 18, y + 56, z + 112, { face: 'e', size: [12, 12], color: WARM, intensity: 0.7, radius: 360, depth: 6 });
}

// ---------------------------------------------------------------- the harbour master's office
export function office(m, T) {
  const { x0, y0, x1, y1 } = OFFICE, t = 16, zU = 160, H1 = 144, H2 = 128, top = zU + H2;
  const ix0 = x0 + t, iy0 = y0 + t, ix1 = x1 - t, iy1 = y1 - t;
  // openings: [wall, centre, width, sill, head] - glass fills every window exactly
  const win = (face, c, w, z0, z1) => ({ face, c, w, z0, z1 });
  const ground = [win('n', 64, 72), win('n', 192, 64, 48, 112), win('n', -48, 64, 48, 112), win('s', 176, 64, 40, 112), win('w', -360, 64), win('e', -500, 56)];
  const upper = [win('n', 0, 96, zU + 36, zU + 100), win('n', 160, 96, zU + 36, zU + 100), win('s', -16, 128, zU + 32, zU + 104), win('s', 160, 96, zU + 32, zU + 104),
    win('w', -400, 96, zU + 36, zU + 100), win('e', -496, 64, zU), win('e', -340, 96, zU + 36, zU + 100)];
  const walls = (list, za, zb) => {
    const g = (f) => list.filter((o) => o.face === f).map((o) => ({ c: o.c, w: o.w, z0: o.z0 ?? za, z1: o.z1 }));
    wall(m, 'x', x0, x1, iy1, y1, za, zb, { all: T.brick, s: T.plaster }, g('n'));
    wall(m, 'x', x0, x1, y0, iy0, za, zb, { all: T.brick, n: T.plaster }, g('s'));
    wall(m, 'y', iy0, iy1, x0, ix0, za, zb, { all: T.brick, e: T.plaster }, g('w'));
    wall(m, 'y', iy0, iy1, ix1, x1, za, zb, { all: T.brick, w: T.plaster }, g('e'));
    for (const o of list) {
      if (o.z0 == null || o.z0 === za) continue; // a door
      const a = o.c - o.w / 2, b = o.c + o.w / 2;
      if (o.face === 'n') glass(m, a, iy1 + 6, o.z0, b, iy1 + 10, o.z1, T.glass);
      if (o.face === 's') glass(m, a, y0 + 6, o.z0, b, y0 + 10, o.z1, T.glass);
      if (o.face === 'w') glass(m, x0 + 6, a, o.z0, x0 + 10, b, o.z1, T.glass);
      if (o.face === 'e') glass(m, ix1 + 6, a, o.z0, ix1 + 10, b, o.z1, T.glass);
    }
  };
  walls(ground, 0, zU);
  walls(upper, zU, top);
  // the interior stair along the south wall, rising east
  const st = { x0: -96, x1: 104, y0: iy0, y1: iy0 + 64 };
  solidStairs(m, st.x0, st.y0, st.x1, st.y1, 0, zU, 'e', 10, { top: T.planks, all: T.plaster }, { surface: 'wood', name: 'stairs' });
  // (the well is open over the whole flight: climbers - and the horde's jumps - clear the slab)
  deckWithHoles(m, ix0, iy0, ix1, iy1, H1, zU, [{ x0: ix0, x1: st.x1, y0: st.y0, y1: st.y1 }], { all: T.plaster, top: T.planks, bottom: T.plaster }, { name: 'office floor' });
  railing(m, ix0, st.y1, st.x1 - 8, st.y1, zU, T, { tex: T.iron });
  // roof (flat, a parapet; out of reach) and the lights inside
  m.box(x0 - 8, y0 - 8, top, x1 + 8, y1 + 8, top + 16, { all: T.concrete, bottom: T.plaster, top: T.roofDark }, { name: 'office roof' });
  for (const [a, b] of [[y0 - 8, y0 + 8], [y1 - 8, y1 + 8]]) m.box(x0 - 8, a, top + 16, x1 + 8, b, top + 40, { all: T.concrete }, { name: 'parapet' });
  clip(m, x0 - 8, y0 - 8, top + 16, x1 + 8, y1 + 8, top + 400);
  lamp(m, 96, -400, H1 - 4, { size: [40, 12], color: COLD, intensity: 0.7, radius: 360 });
  lamp(m, 176, -320, H1 - 4, { size: [40, 12], color: COLD, intensity: 0.55, radius: 300 });
  lamp(m, 64, -400, top - 4, { size: [40, 12], color: COLD, intensity: 0.7, radius: 380 });
  // the exterior stair up the east side (solid), to a landing at the upper door
  const ex0 = x1, ex1 = x1 + 64;
  solidStairs(m, ex0, -472, ex1, -208, 0, zU, 's', 10, { top: T.grate, all: T.iron }, { surface: 'metal', name: 'stairs' });
  m.box(ex0, y0 - 8, zU - 12, ex1, -472, zU, { all: T.iron, top: T.grate }, { surface: 'metal', name: 'landing' });
  for (const y of [y0 - 4, -476]) m.box(ex1 - 8, y - 4, 0, ex1, y + 4, zU - 12, { all: T.iron }, { surface: 'metal', name: 'post' });
  railing(m, ex1, y0 - 8, ex1, -208, zU, T, { clip: false });
  clip(m, ex1, y0 - 8, 0, ex1 + 6, -208, zU + 144);
  clip(m, ex0, y0 - 14, zU, ex1 + 6, y0 - 8, zU + 144);
}

/** Solid steps (a staircase block: nothing to crawl under), rising toward dir. */
function solidStairs(m, x0, y0, x1, y1, zLow, zHigh, dir, steps, tex, o) {
  for (let i = 0; i < steps; i++) {
    const z = zLow + (zHigh - zLow) * (i + 1) / steps, f0 = i / steps, f1 = (i + 1) / steps;
    let a = [x0, y0, x1, y1];
    if (dir === 'n') a = [x0, y0 + (y1 - y0) * f0, x1, y0 + (y1 - y0) * f1];
    if (dir === 's') a = [x0, y1 - (y1 - y0) * f1, x1, y1 - (y1 - y0) * f0];
    if (dir === 'e') a = [x0 + (x1 - x0) * f0, y0, x0 + (x1 - x0) * f1, y1];
    if (dir === 'w') a = [x1 - (x1 - x0) * f1, y0, x1 - (x1 - x0) * f0, y1];
    m.box(a[0], a[1], zLow, a[2], a[3], z, tex, o);
  }
}

// ---------------------------------------------------------------- the fish market
export function market(m, T) {
  const { x0, y0, x1, y1 } = MARKET, zr = 224;
  m.box(x0, y0, -8, x1, y1, 8, { all: T.concrete, top: T.tile }, { name: 'market floor' });
  // steel columns on a 192 grid round the edge, the roof slab, a shallow gable over it
  for (let x = x0; x <= x1; x += 192) for (const y of [y0, y1]) m.box(x - 8 + (x === x1 ? -8 : x === x0 ? 8 : 0), y - 8 + (y === y1 ? -8 : 8), 8, x + 8 + (x === x1 ? -8 : x === x0 ? 8 : 0), y + 8 + (y === y1 ? -8 : 8), zr, { all: T.iron }, { surface: 'metal', name: 'column' });
  m.box(x0 - 32, y0 - 32, zr, x1 + 32, y1 + 32, zr + 16, { all: T.cladding, bottom: T.cladding, top: T.roofDark }, { name: 'market roof' });
  gableRoof(m, x0 - 32, y0 - 32, x1 + 32, y1 + 32, zr + 16, 64, 'x', T.roofDark, { gable: T.cladding });
  clip(m, x0 - 32, y0 - 32, zr, x1 + 32, y1 + 32, zr + 600);
  // the cold store at the east end: a room with two doors (west, north)
  const cs = { x0: 1344, y0: y0 + 16, x1: x1 - 16, y1: y1 - 16 };
  room(m, cs.x0, cs.y0, cs.x1, cs.y1, 8, 136, { wallOut: T.paintWhite, wallIn: T.tile, ceil: T.paintWhite, roof: T.paintWhite, gaps: { w: [{ c: -368, w: 80 }], n: [{ c: 1440, w: 80 }] } });
  lamp(m, (cs.x0 + cs.x1) / 2, (cs.y0 + cs.y1) / 2, 140, { size: [32, 12], color: COLD, intensity: 0.6, radius: 300 });
  // stalls: counters (36 tall) in two rows, fish boxes, ice bins
  for (let x = x0 + 96; x < cs.x0 - 120; x += 176) {
    for (const y of [-448, -288]) {
      m.box(x, y - 24, 8, x + 112, y + 24, 44, { all: T.paintWhite, top: T.concrete }, { surface: 'metal', name: 'counter' });
    }
    if (h01(x, 3) > 0.4) pallet(m, x + 60, -368, 8, 10, T, 26);
  }
  for (let x = x0 + 64; x < cs.x0; x += 288) lamp(m, x + 96, -368, zr - 4, { size: [32, 12], color: WARM, intensity: 0.75, radius: 380 });
}

// ---------------------------------------------------------------- the warehouses
export function warehouses(m, T) {
  for (const [W, k] of [[W1, 1], [W2, 2]]) {
    const { x0, y0, x1, y1 } = W, H = 288, t = 16, cx = (x0 + x1) / 2;
    room(m, x0 + t, y0 + t, x1 - t, y1 - t, 0, H, {
      wallOut: T.cladding, wallIn: T.cladding, ceil: T.cladding, roof: T.roofDark,
      gaps: {
        s: [{ c: cx - 128, w: 192, z1: 192 }, { c: x1 - 96, w: 72 }],
        n: [{ c: x0 + 192, w: 160, z1: 176 }, { c: x1 - 192, w: 160, z1: 176 }],
        w: [{ c: (y0 + y1) / 2, w: 96 }],
        e: [{ c: (y0 + y1) / 2 - 64, w: 96 }],
      },
    });
    gableRoof(m, x0 - 16, y0 - 16, x1 + 16, y1 + 16, H + 16, 72, 'x', T.roofDark, { gable: T.cladding });
    clip(m, x0 - 16, y0 - 16, H, x1 + 16, y1 + 16, H + 600);
    // high bay lamps
    for (let x = x0 + 128; x < x1 - 64; x += 240) for (const y of [y0 + 128, (y0 + y1) / 2, y1 - 128]) lamp(m, x, y, H - 4, { size: [32, 16], color: k === 1 ? COLD : WARM, intensity: 0.8, radius: 500 });
  }
  // Warehouse One: racking aisles (solid, tall), pallets, the forklift
  for (let i = 0; i < 3; i++) {
    const y = W1.y0 + 128 + i * 128;
    m.box(W1.x0 + 224, y - 24, 0, W1.x0 + 512, y + 24, 192, { all: T.rack, top: T.steel }, { surface: 'metal', name: 'rack' });
  }
  forklift(m, W1.x1 - 200, W1.y0 + 200, 0, 200, T);
  for (let i = 0; i < 5; i++) pallet(m, W1.x0 + 600 + (i % 2) * 64, W1.y0 + 96 + i * 72, 0, 0, T, i % 3 === 1 ? 34 : 24);
  // Warehouse Two: the mezzanine office (north-east corner) with two stairs
  mezzanine(m, T);
}

function mezzanine(m, T) {
  const z = 128, { x1, y1 } = W2;
  const mz = { x0: x1 - 16 - 320, x1: x1 - 16, y0: y1 - 16 - 224, y1: y1 - 16 }; // the deck
  const off = { x0: mz.x0 + 96, x1: mz.x1, y0: mz.y0 + 64, y1: mz.y1 }; // the office on it
  m.box(mz.x0, mz.y0, z - 16, mz.x1, mz.y1, z, { all: T.iron, top: T.grate, bottom: T.iron }, { surface: 'metal', name: 'mezzanine' });
  for (const x of [mz.x0 + 80, mz.x1 - 80]) lamp(m, x, (mz.y0 + mz.y1) / 2, z - 20, { size: [24, 12], color: WARM, intensity: 0.6, radius: 300 }); // (under the deck)
  for (const [px, py] of [[mz.x0 + 8, mz.y0 + 8], [mz.x0 + 160, mz.y0 + 8], [mz.x1 - 24, mz.y0 + 8]]) m.box(px, py, 0, px + 16, py + 16, z - 16, { all: T.iron }, { surface: 'metal', name: 'column' });
  // the office walls with a door (south) and windows over the floor
  room(m, off.x0 + 8, off.y0 + 8, off.x1, off.y1, z, 112, {
    t: 8, wallOut: T.plaster, wallIn: T.plaster, ceil: T.plaster, roof: T.steel,
    gaps: { s: [{ c: off.x0 + 64, w: 64 }, { c: off.x0 + 168, w: 96, z0: z + 40, z1: z + 96 }], w: [{ c: off.y0 + 96, w: 72 }] },
  });
  glass(m, off.x0 + 120, off.y0 - 2, z + 40, off.x0 + 216, off.y0 + 2, z + 96, T.glass);
  lamp(m, (off.x0 + off.x1) / 2, (off.y0 + off.y1) / 2, z + 108, { size: [32, 12], color: COLD, intensity: 0.6, radius: 260 });
  // stairs: one down the west end (rising north), one along the south edge (rising east)
  m.stairs(mz.x0 - 64, mz.y1 - 192 - 64, mz.x0, mz.y1, 0, z, 'n', 8, { top: T.grate, all: T.iron }, { surface: 'metal' });
  m.stairs(mz.x1 - 192 - 96, mz.y0 - 64, mz.x1 - 96, mz.y0, 0, z, 'e', 8, { top: T.grate, all: T.iron }, { surface: 'metal' });
  railing(m, mz.x0, mz.y0, mz.x1 - 96 - 192, mz.y0, z, T);
  railing(m, mz.x0, mz.y0, mz.x0, mz.y1 - 256, z, T);
}

// ---------------------------------------------------------------- the customs yard
export function customs(m, T) {
  const { x0, y0, x1, y1 } = CUSTOMS;
  room(m, x0 + 16, y0 + 16, x1 - 16, y1 - 16, 0, 144, {
    wallOut: T.brick, wallIn: T.plaster, ceil: T.plaster, roof: T.roofDark,
    gaps: { s: [{ c: x0 + 96, w: 72 }, { c: x0 + 256, w: 128, z0: 40, z1: 104 }], w: [{ c: y0 + 192, w: 72 }], e: [{ c: y0 + 96, w: 72 }], n: [{ c: x0 + 192, w: 128, z0: 40, z1: 104 }] },
  });
  glass(m, x0 + 192, y0 + 6, 40, x0 + 320, y0 + 10, 104, T.glass);
  glass(m, x0 + 128, y1 - 10, 40, x0 + 256, y1 - 6, 104, T.glass);
  m.box(x0 + 16, y1 - 16, 160, x1 - 16, y1 + 8, 184, { all: T.brick }, { name: 'parapet' });
  clip(m, x0, y0, 160, x1, y1, 600);
  m.box(x0 + 160, y0 + 96, 0, x0 + 320, y0 + 128, 40, { all: T.planks, top: T.steel }, { surface: 'wood', name: 'counter' });
  lamp(m, x0 + 128, y0 + 144, 140, { size: [40, 12], color: COLD, intensity: 0.7, radius: 340 });
  lamp(m, x1 - 112, y1 - 112, 140, { size: [40, 12], color: COLD, intensity: 0.6, radius: 300 });
  // the inspection canopy: a roof on six columns over the truck lane
  const C = CANOPY, zc = 256;
  for (const x of [C.x0 + 16, C.x1 - 16]) for (const y of [C.y0 + 16, (C.y0 + C.y1) / 2, C.y1 - 16]) m.box(x - 12, y - 12, 0, x + 12, y + 12, zc, { all: T.iron }, { surface: 'metal', name: 'column' });
  m.box(C.x0 - 32, C.y0 - 32, zc, C.x1 + 32, C.y1 + 32, zc + 24, { all: T.iron, bottom: T.cladding, top: T.roofDark }, { name: 'canopy' });
  clip(m, C.x0 - 32, C.y0 - 32, zc, C.x1 + 32, C.y1 + 32, zc + 600);
  for (const y of [C.y0 + 112, C.y1 - 112]) lamp(m, (C.x0 + C.x1) / 2, y, zc - 4, { size: [48, 16], color: COLD, intensity: 0.85, radius: 460 });
}

// ---------------------------------------------------------------- the fuel depot
export function depot(m, T) {
  for (const [x, y, r] of TANKS) {
    cyl(m, x, y, 0, 320, r, 16, { all: T.tank, top: T.roofDark }, { surface: 'metal', name: 'tank' });
    frustum(m, x, y, 320, 352, r, r * 0.6, 16, { all: T.roofDark }, { name: 'tank' });
    clip(m, x - r - 8, y - r - 8, 320, x + r + 8, y + r + 8, 900);
    // a ring stiffener, the ladder up the side (high up: out of reach), the valve manifold
    frustum(m, x, y, 150, 158, r + 3, r + 3, 16, { all: T.iron }, { name: 'tank', ...DN });
    m.box(x - r - 6, y - 6, 120, x - r + 2, y + 6, 330, { all: T.iron }, DN);
    m.box(x - r - 40, y - 30, 0, x - r - 8, y + 30, 36, { all: T.steel, top: T.iron }, { surface: 'metal', name: 'valves' });
  }
  // the bund wall round the tanks (32: a hop), its way in on the west side
  const b = BUND;
  m.box(b.x0, b.y0, 0, b.x1, b.y0 + 16, 32, { all: T.concrete }, { name: 'bund' });
  m.box(b.x0, b.y1 - 16, 0, b.x1, b.y1, 32, { all: T.concrete }, { name: 'bund' });
  m.box(b.x0, b.y0 + 16, 0, b.x0 + 16, b.gate0, 32, { all: T.concrete }, { name: 'bund' });
  m.box(b.x0, b.gate1, 0, b.x0 + 16, b.y1 - 16, 32, { all: T.concrete }, { name: 'bund' });
  // the pipe rack from the tanks down to the pumps (posts, a deck of pipes at 128: walk under it)
  const px = b.x0 - 48;
  for (let y = 352; y <= 1120; y += 256) {
    m.box(px - 40, y - 6, 0, px - 28, y + 6, 136, { all: T.iron }, { surface: 'metal', name: 'pipe rack' });
    m.box(px + 28, y - 6, 0, px + 40, y + 6, 136, { all: T.iron }, { surface: 'metal', name: 'pipe rack' });
    m.box(px - 40, y - 6, 128, px + 40, y + 6, 136, { all: T.iron }, DN);
  }
  for (const [dx, tex] of [[-24, T.iron], [-6, T.c1], [12, T.iron], [28, T.steel]]) m.box(px + dx - 6, 352, 136, px + dx + 6, 1120, 148, { all: tex }, { surface: 'metal', name: 'pipe', ...DN });
  for (const [, y] of TANKS) m.box(px + 28, y - 6, 136, b.x0 + 64, y + 6, 148, { all: T.iron }, { surface: 'metal', name: 'pipe', ...DN });
  clip(m, px - 40, 340, 136, px + 40, 1132, 600);
  // the pump island under its canopy
  const P = PUMPS;
  m.box(P.x0, P.y0, 0, P.x1, P.y1, 8, { all: T.concrete }, { name: 'island' });
  for (let x = P.x0 + 64; x < P.x1 - 32; x += 96) m.box(x - 14, (P.y0 + P.y1) / 2 - 18, 8, x + 14, (P.y0 + P.y1) / 2 + 18, 72, { all: T.pump }, { surface: 'metal', name: 'pump' });
  for (const x of [P.x0 + 16, P.x1 - 16]) m.box(x - 8, (P.y0 + P.y1) / 2 - 8, 8, x + 8, (P.y0 + P.y1) / 2 + 8, 192, { all: T.iron }, { surface: 'metal', name: 'column' });
  m.box(P.x0 - 48, P.y0 - 48, 192, P.x1 + 48, P.y1 + 48, 208, { all: T.iron, bottom: T.cladding, top: T.roofDark }, { name: 'canopy' });
  clip(m, P.x0 - 48, P.y0 - 48, 192, P.x1 + 48, P.y1 + 48, 800);
  lamp(m, (P.x0 + P.x1) / 2, (P.y0 + P.y1) / 2, 188, { size: [64, 16], color: COLD, intensity: 0.85, radius: 420 });
}

// ---------------------------------------------------------------- the container yard
// stacks: [x0 (west edge), column count, tiers per column (string), colour keys, tunnel column]
export function containerYard(m, T) {
  const y0 = 976, yl = 240; // the stacks' south face, 20 ft containers along y
  // each block: a run of tier-1 columns (one top, reached two ways) and a tier-2 column to one side
  const blocks = [
    { x0: -2096, tiers: '2111', tunnel: -1, side: 'e' },
    { x0: -1568, tiers: '1112', tunnel: 0, side: 'w' },
    { x0: -1040, tiers: '2111', tunnel: 3, side: 'e' },
    { x0: -512, tiers: '1112', tunnel: 0, side: 'w' },
    { x0: 16, tiers: '2111', tunnel: 3, side: 'e' },
    { x0: 544, tiers: '1112', tunnel: -1, side: 'w' },
  ];
  const cols = [T.c1, T.c2, T.c3, T.c4];
  blocks.forEach((B, bi) => {
    for (let c = 0; c < 4; c++) {
      const x = B.x0 + c * 96 + 48, n = +B.tiers[c];
      for (let k = 0; k < n; k++) {
        const tex = cols[Math.floor(h01(bi * 7 + c, k) * 4)];
        if (c === B.tunnel && k === 0) tunnelContainer(m, x, y0 + yl / 2, 0, tex, T);
        else container(m, x, y0 + yl / 2, k * 102, 'y', { len: 240, tex });
      }
    }
    // two ways up onto the block's tier-1 top: crate steps on its south face (never in front of
    // the walk-through) and crates along its open side
    let cs = -1; // (the tier-1 column farthest from the walk-through: its roof lip trips climbers)
    for (let c = 0; c < 4; c++) if (B.tiers[c] === '1' && c !== B.tunnel && (cs < 0 || (B.tunnel >= 0 && Math.abs(c - B.tunnel) > Math.abs(cs - B.tunnel)))) cs = c;
    crateSteps(m, B.x0 + cs * 96 + 48, y0, 0, 'n', T);
    crateStepsAlong(m, B.side === 'e' ? B.x0 + 384 : B.x0, y0 + 96, 0, B.side, 'n');
  });
}

/** A container open at both ends (walk-through), along y. */
function tunnelContainer(m, x, y, z, tex, T) {
  const hx = 48, hy = 120, h = 102, t = 4, o = { surface: 'metal', name: 'container' };
  m.box(x - hx, y - hy, z, x + hx, y + hy, z + 4, { all: tex, top: T.grate }, o);
  m.box(x - hx, y - hy, z + h - t, x + hx, y + hy, z + h, { all: tex }, o);
  m.box(x - hx, y - hy, z + 4, x - hx + t, y + hy, z + h - t, { all: tex }, o);
  lamp(m, x, y, z + h - t - 4, { size: [16, 12], color: [0.95, 0.8, 0.6], intensity: 0.55, radius: 220 }); // (a work lamp: you can see through it)
  m.box(x + hx - t, y - hy, z + 4, x + hx, y + hy, z + h - t, { all: tex }, o);
}

// ---------------------------------------------------------------- the west yard, the rail siding
export function westYard(m, T) {
  // parked trailers (solid to the ground: skirts) and a tractor unit
  for (let i = 0; i < 3; i++) {
    const x = -2016 + i * 144;
    m.box(x - 48, 256, 0, x + 48, 704, 24, { all: T.tyre }, { surface: 'metal', name: 'trailer' });
    container(m, x, 480, 24, 'y', { len: 448, tex: [T.c1, T.c3, T.c2][i] });
  }
  // the rails: two steel strips on sleepers along the siding, out of the tunnel to a buffer stop
  for (const y of [RAIL_Y - 28, RAIL_Y + 24]) m.box(TUNNEL.end, y, 0, SIDING.x1, y + 4, 6, { all: T.iron }, { surface: 'metal', name: 'rail', detail: true, castShadow: false });
  m.box(SIDING.x1, RAIL_Y - 48, 0, SIDING.x1 + 32, RAIL_Y + 48, 40, { all: T.crane }, { surface: 'metal', name: 'buffer' });
  // a boxcar on the siding behind Warehouse Two
  m.box(-300, RAIL_Y - 52, 0, 140, RAIL_Y + 52, 30, { all: T.tyre }, { surface: 'metal', name: 'boxcar' });
  m.box(-312, RAIL_Y - 60, 30, 152, RAIL_Y + 60, 176, { all: T.rust, top: T.roofDark }, { surface: 'metal', name: 'boxcar' });
  clip(m, -312, RAIL_Y - 60, 176, 152, RAIL_Y + 60, 600);
}

// ---------------------------------------------------------------- lights round the yards
export function yardLights(m, T) {
  const poles = [
    [-1904, -224, ['s']], [-1072, -224, ['s']], [-560, -224, ['s']], [480, -224, ['s']], [1664, -224, ['s']],
    [-1856, 160, ['e']], [-736, 160, ['e', 'w']], [320, 160, ['e']], [1504, 160, ['w']],
    [-1856, 896, ['e']], [-1168, 896, ['n', 's']], [-288, 896, ['n']], [560, 896, ['n', 's']], [1344, 896, ['n']],
    [2080, 792, ['w']], [1600, 1280, ['s']],
  ];
  for (const [x, y, d] of poles) yardLight(m, x, y, 0, 352, d, T);
  // breakwater and pier lamps (lower posts)
  for (const y of [-900, -1300, -1700]) yardLight(m, EAST_ARM.x1 - 24, y, BREAK_Z, 224, ['w'], T, { arm: 40, radius: 480, intensity: 0.8 });
  for (const x of [640, 1280, 1700]) yardLight(m, x, SOUTH_ARM.y0 + 24, BREAK_Z, 224, ['n'], T, { arm: 40, radius: 480, intensity: 0.8 });
  for (const [x, y] of [[PIER1.x0 + 16, -1000], [PIER2.x1 - 16, -900], [HEAD.x0 + 16, HEAD.y0 + 32], [HEAD.x1 - 16, HEAD.y0 + 32]]) yardLight(m, x, y, 0, 192, [x < 900 ? 'e' : 'w'], T, { arm: 36, radius: 420, intensity: 0.75 });
}

// ---------------------------------------------------------------- misc cover on the quay and the road
export function quayProps(m, T) {
  // the crane control cabin (objective: the crane controls) - two doors
  const cc = { x0: -1104, y0: -400, x1: -944, y1: -272 };
  room(m, cc.x0 + 8, cc.y0 + 8, cc.x1 - 8, cc.y1 - 8, 0, 120, { t: 8, wallOut: T.crane, wallIn: T.plaster, ceil: T.plaster, roof: T.roofDark, gaps: { e: [{ c: -336, w: 64 }], w: [{ c: -336, w: 64 }], s: [{ c: -1024, w: 96, z0: 48, z1: 100 }] } });
  glass(m, -1072, cc.y0 + 2, 48, -976, cc.y0 + 6, 100, T.glass);
  m.box(-1056, cc.y0 + 8, 0, -992, cc.y0 + 40, 40, { all: T.steel }, { surface: 'metal', name: 'console' });
  lamp(m, -1024, -336, 124, { size: [24, 12], color: COLD, intensity: 0.6, radius: 260 });
  clip(m, cc.x0, cc.y0, 128, cc.x1, cc.y1, 600);
  // waiting containers on the quay (single, a cover line) and barrels
  container(m, -688, -400, 0, 'x', { len: 240, tex: T.c2 });
  container(m, 560, -280, 0, 'x', { len: 240, tex: T.c4 });
  container(m, -1856, -360, 0, 'y', { len: 240, tex: T.c3 });
  for (const [x, y] of [[-470, -540], [-444, -566], [-492, -578], [1640, -400], [1664, -428]]) barrel(m, x, y, 0, 14, 40, T.rust);
  // net piles / crates by the market
  for (const [x, y, a] of [[720, -560, 10], [1560, -580, -20], [1700, -560, 35]]) pallet(m, x, y, 0, a, T, 24);
}
