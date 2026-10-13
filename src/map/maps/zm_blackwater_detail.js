// Blackwater Docks (zm_blackwater): the dressing - signs, frames and trims, cargo and cover on
// the quay, the ship's deck gear and her hold, the lighthouse's keeper room, office and market
// furniture, warehouse racking, the customs barriers, the gates, a straddle carrier, the
// perimeter sheds' pilasters and lit windows. Every surface a player can reach is 40 or under
// (the horde follows), 64 or over (out of reach), or on the nav graph; small things on tables
// are not solid.
import { lamp, barrel, container } from '../kit.js';
import {
  LAND, QY, ROAD, WATER_Z, BREAK_Z, DECK_Z, HOLD_Z, W1, W2, OFFICE, MARKET, CUSTOMS, CANOPY,
  TUNNEL, GATE, CRANE, SHIP, HOLD, PIER1, PIER2, HEAD, EAST_ARM, SOUTH_ARM, LIGHTHOUSE, clip,
} from './zm_blackwater_layout.js';
import { SODIUM, WARM, h01, cyl, frustum, rbox, bollard, pallet, strut, rg, paint, pbox, sign } from './zm_blackwater_parts.js';

const D = { detail: true };
const DN = { detail: true, castShadow: false };
const VIS = { contents: 0, detail: true, castShadow: false }; // seen, not solid (ropes, cables, small things)

/** A cable drum on its side along `axis`: a 36 (72 tall: out of reach) or a 20 (40: a hop) - a is its half height. */
function drum(m, x, y, z, axis, T, a = 32, w = 40) {
  // a hexagon with a flat top: its other faces are too steep to stand on
  const R = a / Math.cos(Math.PI / 6), pts = [];
  for (let i = 0; i < 6; i++) { const t = i * Math.PI / 3; pts.push([Math.cos(t) * R, z + a + Math.sin(t) * R]); }
  const P = axis === 'x' ? pts.map(([u, v]) => [y + u, v]) : pts.map(([u, v]) => [x + u, v]);
  m.prism(axis, P, (axis === 'x' ? x : y) - w / 2, (axis === 'x' ? x : y) + w / 2, { all: T.planks }, { surface: 'wood', name: 'drum', ...D });
}

/** A concrete jersey barrier (32: everyone hops it) along `axis`, len long. */
function jersey(m, x, y, z, axis, len, T) {
  const prof = [[-12, z], [12, z], [6, z + 10], [4, z + 32], [-4, z + 32], [-6, z + 10]];
  if (axis === 'x') m.prism('x', prof.map(([u, v]) => [y + u, v]), x - len / 2, x + len / 2, { all: T.concrete }, { name: 'barrier' });
  else m.prism('y', prof.map(([u, v]) => [x + u, v]), y - len / 2, y + len / 2, { all: T.concrete }, { name: 'barrier' });
}

/** A life ring on a short post at the water's edge, facing `face`. */
function lifeRing(m, x, y, face, T, z = 0) {
  m.box(x - 3, y - 3, z, x + 3, y + 3, z + 66, { all: T.steel }, { surface: 'metal', name: 'post', ...VIS }); // (thin: not solid, no perch)
  const d = { n: [0, 4], s: [0, -4], e: [4, 0], w: [-4, 0] }[face];
  sign(m, 'ring', x + d[0], y + d[1], z + 24, face, 24, 32, T);
}

/** The keyed face (n/s/e/w) a direction ang (degrees) points at. */
const faceOf = (ang) => { const a = ((ang % 360) + 360) % 360; return a < 45 || a >= 315 ? 'e' : a < 135 ? 'n' : a < 225 ? 'w' : 's'; };

/** A tractor unit facing ang degrees: chassis, the fifth-wheel deck (40: a hop), the cab (128). */
function tractor(m, x, y, ang, T, paintTex) {
  rbox(m, x, y, ang, -64, 64, -44, 44, 0, 24, { all: T.iron }, { surface: 'metal', name: 'truck' });
  rbox(m, x, y, ang, 4, 64, -46, 46, 24, 128, { all: paintTex, top: T.iron }, { surface: 'metal', name: 'truck' });
  paint(rbox(m, x, y, ang, 60, 66, -40, 40, 72, 116, { all: paintTex, [faceOf(ang)]: rg('window') }, { surface: 'glass', name: 'truck' }));
  rbox(m, x, y, ang, -64, 4, -40, 40, 24, 40, { all: T.iron }, { surface: 'metal', name: 'truck' });
  for (const u of [-40, 30]) for (const v of [-46, 42]) paint(rbox(m, x, y, ang, u - 16, u + 16, v, v + 4, 0, 32, { all: T.iron, [faceOf(ang + (v < 0 ? -90 : 90))]: rg('tyre') }, { name: 'wheel', ...DN }));
}

/** A container-sized box (not kit's 240 / 480 lengths): x0..x1, y0..y1 from z, 102 tall. */
function crateBox(m, x0, y0, x1, y1, z, tex) {
  m.box(x0, y0, z, x1, y1, z + 102, { all: tex }, { surface: 'metal', name: 'container' });
}

// ---------------------------------------------------------------- the quay
export function quayDetail(m, T) {
  // life rings and deep-water signs along the edge
  for (const x of [-1904, -688, 368, 1600, 1952]) lifeRing(m, x, QY + 60, 's', T);
  for (const x of [-1040, 1040]) {
    m.box(x - 3, QY + 57, 0, x + 3, QY + 63, 72, { all: T.iron }, { surface: 'metal', name: 'post', ...VIS });
    sign(m, 'deep', x, QY + 56, 72, 's', 96, 12, T);
  }
  // steel ladders down the quay wall to the water (rungs only: out of anyone's reach)
  for (const x of [-560, 448, 1696]) {
    for (const s of [-14, 14]) m.box(x + s - 2, QY - 6, WATER_Z - 24, x + s + 2, QY - 2, -2, { all: T.iron }, DN);
    for (let z = WATER_Z - 16; z < -8; z += 14) m.box(x - 14, QY - 5, z, x + 14, QY - 3, z + 2, { all: T.iron }, DN);
  }
  // mooring lines from the quay bollards up to the ship's bulwark (seen, not solid)
  for (const bx of [-1856, -1536, -896]) strut(m, 'x', [QY + 36, 26], [SHIP.y1 - 4, DECK_Z + 34], 3, bx - 1.5, bx + 1.5, { all: T.iron }, VIS);
  // cargo on the quay: cable drums, timber, barriers, drums of oil, pallets
  drum(m, -620, -300, 0, 'y', T, 36); drum(m, -520, -300, 0, 'y', T, 20, 36);
  for (const [x, y, a] of [[-1960, -520, 0], [-1890, -500, 90], [-300, -560, 30], [700, -470, -15], [1610, -300, 0], [1590, -230, 50]]) pallet(m, x, y, 0, a, T, h01(x, y) > 0.5 ? 34 : 24);
  jersey(m, -152, -104, 0, 'x', 192, T);
  jersey(m, 296, -104, 0, 'x', 192, T);
  jersey(m, -1600, -160, 0, 'x', 160, T);
  jersey(m, 1300, -96, 0, 'x', 160, T);
  for (const [x, y] of [[1880, -520], [1906, -546], [1866, -560], [-1700, -250], [-1676, -276]]) barrel(m, x, y, 0, 14, 40, T.rust);
  for (let i = 0; i < 4; i++) m.box(-2096 + i * 22, -300, 0, -2078 + i * 22, -160, 40, { all: T.planks }, { surface: 'wood', name: 'timber' });
  // a tractor and its container trailer parked along the quay road
  tractor(m, -280, -24, 0, T, T.c1);
  container(m, -560, -24, 24, 'x', { len: 448, tex: T.c3 });
  m.box(-780, -66, 0, -340, 18, 24, { all: T.iron }, { surface: 'metal', name: 'trailer' });
  // the crane: warning stripes round its feet (paint only), leg ladders high up, its name
  for (const x of [CRANE.x0, CRANE.x1]) for (const y of [CRANE.y0, CRANE.y1]) {
    pbox(m, x - 25, y - 25, 30, x + 25, y + 25, 70, { all: rg('stripes'), top: null, bottom: null }, { name: 'stripes', ...VIS });
    m.box(x + 25, y - 10, 120, x + 29, y - 6, 440, { all: T.iron }, DN);
    m.box(x + 25, y + 6, 120, x + 29, y + 10, 440, { all: T.iron }, DN);
    for (let z = 130; z < 440; z += 16) m.box(x + 25, y - 6, z, x + 28, y + 6, z + 2, { all: T.iron }, DN);
  }
  sign(m, 'name', (CRANE.x0 + CRANE.x1) / 2, CRANE.y1 + 32, 540, 'n', 256, 32, T);
  sign(m, 'name', (CRANE.x0 + CRANE.x1) / 2, CRANE.y1 - 192, 540, 's', 256, 32, T);
  m.box(-1604, ROAD.y0 - 6, 0, -1596, ROAD.y0 + 2, 156, { all: T.iron }, { surface: 'metal', name: 'post' });
  sign(m, 'berth', -1600, ROAD.y0 - 6, 132, 's', 96, 24, T);
}

// ---------------------------------------------------------------- the freighter's gear
export function shipDetail(m, T) {
  const { x0, x1, y0, y1 } = SHIP, yc = (y0 + y1) / 2, xb = x1 - 128;
  // the boot-top (a black band at the waterline) and her name on the bow and stern
  m.box(x0 - 2, y0 - 2, WATER_Z - 20, xb, y0, WATER_Z + 28, { all: T.iron }, DN);
  m.box(x0 - 2, y1, WATER_Z - 20, xb, y1 + 2, WATER_Z + 28, { all: T.iron }, DN);
  m.box(x0 - 2, y0, WATER_Z - 20, x0, y1, WATER_Z + 28, { all: T.iron }, DN);
  sign(m, 'name', xb - 140, y1, 60, 'n', 192, 24, T, T.hull);
  sign(m, 'name', xb - 140, y0, 60, 's', 192, 24, T, T.hull);
  sign(m, 'name', x0, yc, 180, 'w', 160, 20, T, T.hull);
  // tyre fenders hung down her quay side
  for (let x = x0 + 160; x < xb; x += 224) {
    m.prism('y', [[x - 14, WATER_Z + 10], [x + 14, WATER_Z + 10], [x + 20, WATER_Z + 30], [x + 14, WATER_Z + 50], [x - 14, WATER_Z + 50], [x - 20, WATER_Z + 30]], y1 + 2, y1 + 18, { all: T.iron }, { name: 'fender', ...DN });
    m.box(x - 1, y1 + 8, WATER_Z + 50, x + 1, y1 + 10, DECK_Z + 36, { all: T.iron }, VIS);
  }
  // the anchors in their hawses
  for (const y of [y0 + 70, y1 - 70]) m.prism('x', [[y - 18, 40], [y + 18, 40], [y + 10, 70], [y - 10, 70]], x1 - 116, x1 - 60, { all: T.iron }, DN);
  // bitts (twin posts, 30: a hop) and winches (36) clear of the gangways and stairwells
  for (const [x, y] of [[-1640, y0 + 40], [-1300, y0 + 40], [-880, y0 + 40], [-1500, y1 - 40], [-1180, y1 - 40], [-880, y1 - 40]]) {
    cyl(m, x - 14, y, DECK_Z, DECK_Z + 30, 8, 8, { all: T.iron }, { surface: 'metal', name: 'bitt' });
    cyl(m, x + 14, y, DECK_Z, DECK_Z + 30, 8, 8, { all: T.iron }, { surface: 'metal', name: 'bitt' });
  }
  for (const y of [yc - 80, yc + 80]) m.box(-884, y - 20, DECK_Z, -836, y + 20, DECK_Z + 36, { all: T.steel, top: T.iron }, { surface: 'metal', name: 'winch' });
  // ventilators against her sides (cowls on pipes: out of reach)
  for (const [x, y] of [[-1440, y0 + 32], [-1440, y1 - 32], [-900, y0 + 32]]) {
    cyl(m, x, y, DECK_Z, DECK_Z + 96, 10, 8, { all: T.paintWhite }, { name: 'vent' });
    m.box(x - 16, y - 16, DECK_Z + 96, x + 16, y + 16, DECK_Z + 128, { all: T.paintWhite, [y < yc ? 'n' : 's']: T.iron }, { name: 'vent' });
  }
  // the derrick mast between the hatches, its boom high over the open hatch
  const mx = -1472;
  m.box(mx - 14, yc - 14, DECK_Z, mx + 14, yc + 14, DECK_Z + 384, { all: T.steel }, { surface: 'metal', name: 'mast' });
  m.box(mx - 40, yc - 40, DECK_Z + 360, mx + 40, yc + 40, DECK_Z + 368, { all: T.steel }, { name: 'mast' });
  strut(m, 'y', [mx, DECK_Z + 150], [-1240, DECK_Z + 250], 10, yc - 5, yc + 5, { all: T.steel }, { name: 'derrick' });
  strut(m, 'y', [mx, DECK_Z + 380], [-1240, DECK_Z + 250], 2, yc - 1, yc + 1, { all: T.iron }, VIS);
  m.box(-1361, yc - 1, DECK_Z - 40, -1359, yc + 1, DECK_Z + 250, { all: T.iron }, VIS);
  lamp(m, mx + 18, yc, DECK_Z + 340, { face: 'e', size: [16, 12], color: WARM, intensity: 0.8, radius: 520 });
  // two containers lashed on the forward hatch cover (out of reach: 102 over it)
  crateBox(m, -1224, -1000, -1016, -904, DECK_Z + 36, T.c4);
  crateBox(m, -1224, -900, -1016, -808, DECK_Z + 36, T.c2);
  clip(m, -1232, -1008, DECK_Z + 138, -1008, -800, DECK_Z + 600);
  // the superstructure: portholes and lit windows, bridge wings, a lifeboat on its davits
  const sx1 = HOLD.x0 - 64;
  for (let y = y0 + 64; y < y1 - 40; y += 72) {
    const b = sign(m, 'window', sx1, y, DECK_Z + 140, 'e', 40, 24, T, T.paintWhite);
    if (h01(y, 9) > 0.45) b.fullbright = true;
  }
  for (const [y, f] of [[y0 + 24, 's'], [y1 - 24, 'n']]) for (let x = x0 + 48; x < sx1 - 40; x += 72) {
    const b = sign(m, 'window', x, y, DECK_Z + 140, f, 36, 24, T, T.paintWhite);
    if (h01(x, y) > 0.6) b.fullbright = true;
  }
  m.box(sx1 - 96, y0 - 40, DECK_Z + 300, sx1 - 32, y0 + 8, DECK_Z + 312, { all: T.paintWhite }, { name: 'wing' });
  m.box(sx1 - 96, y1 - 8, DECK_Z + 300, sx1 - 32, y1 + 40, DECK_Z + 312, { all: T.paintWhite }, { name: 'wing' });
  const lb = { x0: x0 + 40, x1: x0 + 200, y: y1 + 28 };
  for (const x of [lb.x0 + 16, lb.x1 - 16]) m.box(x - 4, y1 - 24, DECK_Z + 224, x + 4, lb.y + 4, DECK_Z + 292, { all: T.iron }, { name: 'davit' });
  m.prism('x', [[lb.y - 24, DECK_Z + 236], [lb.y + 24, DECK_Z + 236], [lb.y + 30, DECK_Z + 268], [lb.y - 30, DECK_Z + 268]], lb.x0, lb.x1, { all: T.c4 }, { name: 'lifeboat' });
  lamp(m, x0 + 96, yc, DECK_Z + 470, { size: [10, 10], color: [1, 0.85, 0.6], intensity: 0.5, radius: 300 });
  // the hold: frames down her sides, a stringer, cargo left aboard
  for (let x = HOLD.x0 + 48; x < HOLD.x1 - 16; x += 96) {
    m.box(x - 4, HOLD.y0, HOLD_Z, x + 4, HOLD.y0 + 10, DECK_Z - 16, { all: T.hull }, { name: 'frame', ...D });
    m.box(x - 4, HOLD.y1 - 10, HOLD_Z, x + 4, HOLD.y1, DECK_Z - 16, { all: T.hull }, { name: 'frame', ...D });
  }
  m.box(HOLD.x0, HOLD.y0, DECK_Z - 40, HOLD.x1, HOLD.y0 + 12, DECK_Z - 28, { all: T.hull }, { name: 'stringer', ...D });
  m.box(HOLD.x0, HOLD.y1 - 12, DECK_Z - 40, HOLD.x1, HOLD.y1, DECK_Z - 28, { all: T.hull }, { name: 'stringer', ...D });
  for (const [x, y, a, h] of [[-1640, -980, 0, 34], [-1590, -950, 20, 24], [-1180, -820, -10, 34], [-1120, -900, 45, 24], [-1420, -1040, 0, 34]]) pallet(m, x, y, HOLD_Z, a, T, h);
  crateBox(m, -1700, -900, -1460, -808, HOLD_Z, T.c1);
  pbox(m, -1300, -1040, HOLD_Z, -1236, -976, HOLD_Z + 34, { all: rg('crate') }, { surface: 'wood', name: 'crate' });
}

// ---------------------------------------------------------------- piers, breakwater, lighthouse
export function waterfrontDetail(m, T) {
  for (const [x, y, f] of [[PIER1.x0 + 12, -880, 'w'], [PIER2.x1 - 12, -760, 'e'], [HEAD.x0 + 200, HEAD.y0 + 12, 's'], [HEAD.x1 - 200, HEAD.y0 + 12, 's']]) lifeRing(m, x, y, f, T);
  // a gateway over each pier's root, with its name
  for (const [P, key] of [[PIER1, 'pier1'], [PIER2, 'pier2']]) {
    const cx = (P.x0 + P.x1) / 2;
    m.box(cx - 74, QY - 14, 0, cx - 66, QY - 6, 152, { all: T.iron }, { surface: 'metal', name: 'post' });
    m.box(cx + 66, QY - 14, 0, cx + 74, QY - 6, 152, { all: T.iron }, { surface: 'metal', name: 'post' });
    m.box(cx - 74, QY - 14, 152, cx + 74, QY - 6, 160, { all: T.iron }, { surface: 'metal', name: 'post' });
    sign(m, key, cx, QY - 6, 128, 'n', 64, 16, T);
    sign(m, key, cx, QY - 14, 128, 's', 64, 16, T);
  }
  skiff(m, 780, -1300, 0, T);
  skiff(m, 1060, -1100, 180, T);
  skiff(m, -200, -1240, 75, T);
  skiff(m, 1650, -1500, 100, T);
  // breakwater bollards and the navigation light at its elbow
  for (let y = QY - 320; y > EAST_ARM.y0 + 64; y -= 384) bollard(m, EAST_ARM.x0 + 28, y, BREAK_Z, T);
  for (let x = SOUTH_ARM.x0 + 400; x < SOUTH_ARM.x1 - 200; x += 384) bollard(m, x, SOUTH_ARM.y1 - 28, BREAK_Z, T);
  const nx = EAST_ARM.x1 - 40, ny = SOUTH_ARM.y0 + 40;
  cyl(m, nx, ny, BREAK_Z, BREAK_Z + 160, 12, 8, { all: T.c1 }, { name: 'beacon' });
  const bl = cyl(m, nx, ny, BREAK_Z + 160, BREAK_Z + 176, 10, 8, { all: T.lightPanel }, { name: 'beacon' });
  bl.fullbright = true; bl.castShadow = false;
  m.light(nx - 24, ny + 24, BREAK_Z + 168, [1.0, 0.35, 0.25], 0.6, 360);
  // a tool shed on the south arm (solid: cover on the long walk)
  m.box(1440, SOUTH_ARM.y0 + 8, BREAK_Z, 1584, SOUTH_ARM.y0 + 80, BREAK_Z + 112, { all: T.cladding, top: T.roofDark }, { name: 'shed' });
  pbox(m, 1488, SOUTH_ARM.y0 + 80, BREAK_Z, 1536, SOUTH_ARM.y0 + 82, BREAK_Z + 96, { all: T.iron, n: rg('door') }, { name: 'door', ...DN });
  clip(m, 1440, SOUTH_ARM.y0 + 8, BREAK_Z + 112, 1584, SOUTH_ARM.y0 + 80, BREAK_Z + 600);
  // the lighthouse: red bands on the tower, its windows, the radio desk in the keeper's room
  const { x, y } = LIGHTHOUSE, z = BREAK_Z, t0 = z + 144, t1 = z + 720;
  const rT = (zz) => 92 - 28 * (zz - t0) / (t1 - t0); // the tower's apothem at height zz
  for (const [a, b] of [[z + 400, z + 470], [z + 560, z + 630]]) frustum(m, x, y, a, b, rT(a) + 1.5, rT(b) + 1.5, 16, { all: T.hull, top: null, bottom: null }, { name: 'band', ...VIS });
  for (const zz of [z + 240, z + 520]) sign(m, 'window', x + rT(zz + 13) - 2, y, zz, 'e', 18, 26, T, T.paintWhite);
  m.box(x - 70, y + 30, z, x - 30, y + 70, z + 36, { all: T.planks, top: T.iron }, { surface: 'wood', name: 'desk' });
  pbox(m, x - 66, y + 40, z + 36, x - 40, y + 66, z + 52, { all: T.iron, e: rg('vent') }, { surface: 'metal', name: 'radio', ...VIS });
  m.box(x - 52, y + 56, z + 52, x - 50, y + 58, z + 100, { all: T.iron }, VIS);
  m.box(x + 40, y - 70, z, x + 70, y - 40, z + 20, { all: T.planks }, { surface: 'wood', name: 'chair' });
  sign(m, 'noentry', x + 96, y - 52, z + 60, 'e', 32, 8, T);
}

/** A small open boat on the water (seen, not solid: fall on it and you're in the water). */
function skiff(m, x, y, ang, T) {
  const z = WATER_Z - 6, a = ang * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  rbox(m, x, y, ang, -60, 60, -24, 24, z, z + 14, { all: T.c2, top: T.planks }, { name: 'skiff', ...VIS });
  m.prism('z', [[60, -24], [96, 0], [60, 24]].map(([u, v]) => [x + u * c - v * s, y + u * s + v * c]), z, z + 14, { all: T.c2 }, { name: 'skiff', ...VIS });
}

// ---------------------------------------------------------------- the buildings' dressing
export function buildingDetail(m, T) {
  // the harbour master's office: signs, the door frame, a flag, the radio mast, furniture
  sign(m, 'harbour', 64, OFFICE.y1, 124, 'n', 192, 24, T);
  sign(m, 'harbour', 64, OFFICE.y0 - 8, 302, 's', 192, 22, T);
  m.box(24, OFFICE.y1, 0, 28, OFFICE.y1 + 4, 116, { all: T.iron }, DN);
  m.box(100, OFFICE.y1, 0, 104, OFFICE.y1 + 4, 116, { all: T.iron }, DN);
  m.box(24, OFFICE.y1, 112, 104, OFFICE.y1 + 4, 120, { all: T.iron }, DN);
  m.box(OFFICE.x0 - 12, OFFICE.y1 - 32, 0, OFFICE.x0 - 4, OFFICE.y1 - 24, 420, { all: T.iron }, { surface: 'metal', name: 'flagpole' });
  m.prism('y', [[OFFICE.x0 - 12, 400], [OFFICE.x0 - 100, 392], [OFFICE.x0 - 98, 360], [OFFICE.x0 - 12, 368]], OFFICE.y1 - 29, OFFICE.y1 - 27, { all: T.c1 }, { name: 'flag', ...VIS });
  m.box(180, -440, 304, 188, -432, 520, { all: T.iron }, { name: 'mast' });
  for (const zz of [400, 470]) m.box(150, -440, zz, 218, -432, zz + 4, { all: T.iron }, DN);
  m.box(-60, -320, 304, 20, -280, 344, { all: T.cladding }, { name: 'ac' });
  m.box(0, -394, 0, 152, -370, 40, { all: T.planks, top: T.iron }, { surface: 'wood', name: 'counter' });
  m.box(-112, -320, 0, -88, -272, 72, { all: T.iron }, { surface: 'metal', name: 'cabinet' });
  m.box(16, -360, 160, 112, -300, 196, { all: T.planks }, { surface: 'wood', name: 'chart table' });
  pbox(m, 160, -296, 160, 224, -280, 196, { all: T.iron, s: rg('vent') }, { surface: 'metal', name: 'radio' });
  // the fish market: signs on both faces, trays of fish on the counters, scales
  sign(m, 'market', 1040, MARKET.y1 + 32, 200, 'n', 256, 24, T);
  sign(m, 'market', 1040, MARKET.y0 - 32, 200, 's', 256, 24, T);
  for (let x = MARKET.x0 + 96; x < 1300; x += 176) for (const y of [-448, -288]) {
    pbox(m, x + 8, y - 16, 44, x + 40, y + 16, 54, { all: rg('crateB') }, { surface: 'wood', name: 'fish', ...VIS });
    pbox(m, x + 48, y - 16, 44, x + 80, y + 16, 54, { all: rg('crate') }, { surface: 'wood', name: 'fish', ...VIS });
    m.box(x + 96, y - 2, 44, x + 100, y + 2, 92, { all: T.iron }, VIS);
  }
  // a refrigerated box truck backed up to the market
  tractor(m, 1700, -240, 90, T, T.paintWhite);
  m.box(1660, -500, 24, 1740, -308, 140, { all: T.paintWhite, top: T.iron }, { surface: 'metal', name: 'reefer' });
  m.box(1664, -500, 0, 1736, -308, 24, { all: T.iron }, { surface: 'metal', name: 'reefer' });
  clip(m, 1660, -500, 140, 1740, -176, 600);
  // the warehouses: signs over the big doors, half-raised shutters, door frames, facade lamps
  for (const [W, key] of [[W1, 'wh1'], [W2, 'wh2']]) {
    const cx = (W.x0 + W.x1) / 2;
    sign(m, key, cx - 128, W.y0, 216, 's', 192, 24, T);
    sign(m, key, W.x0 + 192, W.y1, 200, 'n', 160, 20, T);
    pbox(m, cx - 224, W.y0 - 2, 160, cx - 32, W.y0 + 16, 192, { all: T.iron, s: rg('shutter'), n: rg('shutter') }, { name: 'shutter', ...DN });
    for (const xc of [W.x0 + 192, W.x1 - 192]) pbox(m, xc - 80, W.y1 - 16, 144, xc + 80, W.y1 + 2, 176, { all: T.iron, s: rg('shutter'), n: rg('shutter') }, { name: 'shutter', ...DN });
    for (const xs of [cx - 232, cx - 32]) m.box(xs, W.y0 - 4, 0, xs + 8, W.y0, 200, { all: T.iron }, DN);
    lamp(m, cx - 128, W.y0 - 4, 244, { face: 's', size: [24, 12], color: SODIUM, intensity: 0.7, radius: 400 });
    lamp(m, W.x0 + 192, W.y1 + 4, 228, { face: 'n', size: [24, 12], color: SODIUM, intensity: 0.7, radius: 400 });
  }
  // Warehouse One's racking: uprights, beams, loads on three levels (the lowest 72: out of reach)
  for (let i = 0; i < 3; i++) {
    const y = W1.y0 + 128 + i * 128, xa = W1.x0 + 224, xb = W1.x0 + 512;
    for (let x = xa; x <= xb; x += 96) m.box(x - 3, y - 26, 0, x + 3, y + 26, 232, { all: T.c2 }, { surface: 'metal', name: 'rack' });
    for (const zz of [80, 156, 228]) m.box(xa, y - 26, zz - 6, xb, y + 26, zz, { all: T.c1 }, { surface: 'metal', name: 'rack' });
    for (let x = xa + 8; x < xb - 40; x += 96) {
      for (const [z0, z1] of [[0, 72], [80, 140], [156, 210]]) {
        if (z0 && h01(x + i * 7, z0) < 0.25) continue;
        pbox(m, x + 4, y - 22, z0, x + 84, y + 22, z1, { all: rg(h01(x, z0 + i) > 0.5 ? 'crate' : 'crateB') }, { surface: 'wood', name: 'load', ...D });
      }
    }
  }
  // W1: the foreman's booth (solid, windows), stacked tyres; W2: cable drums and pallets
  m.box(W1.x1 - 176, W1.y1 - 160, 0, W1.x1 - 48, W1.y1 - 48, 112, { all: T.paintWhite, top: T.iron }, { name: 'booth' });
  sign(m, 'window', W1.x1 - 112, W1.y1 - 160, 50, 's', 96, 40, T, T.paintWhite).fullbright = true;
  clip(m, W1.x1 - 176, W1.y1 - 160, 112, W1.x1 - 48, W1.y1 - 48, 400);
  for (const [x, y] of [[W1.x0 + 80, W1.y1 - 80], [W1.x0 + 130, W1.y1 - 70]]) cyl(m, x, y, 0, 36, 22, 8, { all: T.tyre }, { surface: 'metal', name: 'tyres' });
  drum(m, W2.x0 + 120, W2.y0 + 120, 0, 'x', T, 36);
  drum(m, W2.x0 + 120, W2.y0 + 240, 0, 'x', T, 20, 36);
  for (let i = 0; i < 4; i++) pallet(m, W2.x0 + 300 + (i % 2) * 70, W2.y0 + 110 + (i >> 1) * 70, 0, 5 * i, T, 24);
  // customs: the sign, the booth by the lanes, a barrier on the east lane, a truck in the west one
  sign(m, 'customs', (CUSTOMS.x0 + CUSTOMS.x1) / 2, CUSTOMS.y0, 120, 's', 160, 20, T);
  for (const y of [CANOPY.y0 + 40, CANOPY.y1 - 40]) {
    m.box(CANOPY.x1 - 24, y - 8, 0, CANOPY.x1 - 8, y + 8, 40, { all: T.steel }, { surface: 'metal', name: 'barrier' });
    pbox(m, 560, y - 3, 34, CANOPY.x1 - 24, y + 3, 40, { all: rg('stripes') }, { name: 'boom', ...DN });
  }
  m.box(288, 400, 0, 360, 480, 104, { all: T.paintWhite, top: T.iron }, { name: 'booth' });
  sign(m, 'window', 360, 440, 48, 'e', 56, 32, T, T.paintWhite).fullbright = true;
  clip(m, 288, 400, 104, 360, 480, 500);
  tractor(m, 472, 600, -90, T, T.c2);
  m.box(432, 200, 0, 512, 520, 24, { all: T.iron }, { surface: 'metal', name: 'trailer' });
  container(m, 472, 340, 24, 'y', { len: 288, tex: T.c4 });
}

// ---------------------------------------------------------------- yards, gates, perimeter
export function yardDetail(m, T) {
  // the rail tunnel's portal (the rail gate), a signal post, the gate's leaves swung open
  const tz = 176;
  m.box(LAND.x0 - 8, TUNNEL.y0 - 48, 0, LAND.x0 + 16, TUNNEL.y0, tz + 64, { all: T.concrete }, { name: 'portal' });
  m.box(LAND.x0 - 8, TUNNEL.y1, 0, LAND.x0 + 16, TUNNEL.y1 + 48, tz + 64, { all: T.concrete }, { name: 'portal' });
  m.box(LAND.x0 - 8, TUNNEL.y0, tz, LAND.x0 + 16, TUNNEL.y1, tz + 64, { all: T.concrete }, { name: 'portal' });
  sign(m, 'noentry', LAND.x0 + 16, (TUNNEL.y0 + TUNNEL.y1) / 2, tz + 24, 'e', 96, 24, T);
  m.box(LAND.x0 + 64, TUNNEL.y1 + 24, 0, LAND.x0 + 72, TUNNEL.y1 + 32, 200, { all: T.iron }, { name: 'signal' });
  const sl = m.box(LAND.x0 + 72, TUNNEL.y1 + 18, 168, LAND.x0 + 80, TUNNEL.y1 + 38, 188, { all: T.lightPanel }, { name: 'signal', ...DN });
  sl.fullbright = true;
  m.light(LAND.x0 + 96, TUNNEL.y1 + 28, 178, [1, 0.25, 0.2], 0.7, 300);
  lamp(m, TUNNEL.end + 96, (TUNNEL.y0 + TUNNEL.y1) / 2, tz - 4, { size: [24, 12], color: SODIUM, intensity: 0.5, radius: 260 });
  lamp(m, LAND.x0 - 64, (TUNNEL.y0 + TUNNEL.y1) / 2, tz - 4, { size: [24, 12], color: SODIUM, intensity: 0.6, radius: 340 });
  for (const [ya, yb] of [[TUNNEL.y0 - 176, TUNNEL.y0 - 48], [TUNNEL.y1 + 48, TUNNEL.y1 + 160]]) {
    pbox(m, LAND.x0 + 18, ya, 0, LAND.x0 + 24, yb, 128, { all: T.iron, e: rg('stripes'), w: rg('stripes') }, { name: 'gate', ...DN });
  }
  // the truck gate: a gatehouse, the frame and its sign, a barrier
  m.box(GATE.x0 - 136, LAND.y1 - 120, 0, GATE.x0 - 24, LAND.y1 - 8, 112, { all: T.paintWhite, top: T.iron }, { name: 'gatehouse' });
  sign(m, 'window', GATE.x0 - 24, LAND.y1 - 64, 48, 'e', 72, 32, T, T.paintWhite).fullbright = true;
  clip(m, GATE.x0 - 136, LAND.y1 - 120, 112, GATE.x0 - 24, LAND.y1 - 8, 600);
  m.box(GATE.x0 - 8, LAND.y1 - 8, 0, GATE.x0, LAND.y1, 256, { all: T.iron }, D);
  m.box(GATE.x1, LAND.y1 - 8, 0, GATE.x1 + 8, LAND.y1, 256, { all: T.iron }, D);
  m.box(GATE.x0 - 8, LAND.y1 - 8, 256, GATE.x1 + 8, LAND.y1, 280, { all: T.iron }, D);
  sign(m, 'gate', (GATE.x0 + GATE.x1) / 2, LAND.y1 - 8, 228, 's', 192, 24, T);
  m.box(GATE.x0 + 8, LAND.y1 + 24, 0, GATE.x0 + 24, LAND.y1 + 40, 40, { all: T.steel }, { name: 'barrier' });
  pbox(m, GATE.x0 + 24, LAND.y1 + 29, 34, GATE.x1 - 40, LAND.y1 + 35, 40, { all: rg('stripes') }, { name: 'boom', ...DN });
  lamp(m, GATE.x0 - 80, LAND.y1 - 124, 96, { face: 's', size: [16, 12], color: WARM, intensity: 0.6, radius: 300 });
  // the truck yard and the customs yard: boxes waiting for the trucks (single: out of reach), the
  // weighbridge
  container(m, 1144, 1112, 0, 'y', { len: 240, tex: T.c2 });
  container(m, 1544, 1112, 0, 'y', { len: 240, tex: T.c1 });
  container(m, 1344, 1010, 0, 'x', { len: 240, tex: T.c3 });
  container(m, 1420, 520, 0, 'y', { len: 480, tex: T.c4 });
  container(m, 1324, 640, 0, 'y', { len: 240, tex: T.c2 });
  container(m, 1324, 400, 0, 'y', { len: 240, tex: T.c1 });
  m.box(744, 180, 0, 1000, 436, 8, { all: T.iron, top: T.grate }, { surface: 'metal', name: 'weighbridge' });
  pbox(m, 1000, 300, 0, 1004, 320, 112, { all: T.iron, e: rg('stripes') }, { name: 'post', ...DN });
  // a straddle carrier over the loading road: four legs and a portal, a container slung in it
  const sc = { x0: -736, x1: -576, y0: 688, y1: 912 }, h = 320;
  for (const x of [sc.x0, sc.x1 - 20]) for (const y of [sc.y0, sc.y1 - 20]) m.box(x, y, 0, x + 20, y + 20, h, { all: T.steel }, { surface: 'metal', name: 'carrier' });
  for (const x of [sc.x0, sc.x1 - 20]) {
    m.box(x - 4, sc.y0 - 8, 0, x + 24, sc.y1 + 8, 24, { all: T.iron }, { surface: 'metal', name: 'carrier' });
    m.box(x, sc.y0, h - 40, x + 20, sc.y1, h, { all: T.steel }, { surface: 'metal', name: 'carrier' });
  }
  m.box(sc.x0, sc.y0 + 60, h, sc.x1, sc.y1 - 60, h + 48, { all: T.steel, s: T.glass }, { surface: 'metal', name: 'carrier' });
  crateBox(m, sc.x0 + 26, sc.y0 + 30, sc.x1 - 26, sc.y1 - 30, 150, T.c3);
  for (const x of [sc.x0 + 40, sc.x1 - 40]) m.box(x - 1, 799, 252, x + 1, 801, h - 40, { all: T.iron }, VIS);
}

/** The perimeter sheds: pilasters, lit windows and shutters on the faces round the docks. */
export function perimeterDetail(m, T) {
  const faces = [
    // [axis, fixed coord, from, to, facing, wall height]
    ['y', LAND.x0, ROAD.y0 + 64, TUNNEL.y0 - 240, 'e', 352],
    ['y', LAND.x0, TUNNEL.y1 + 176, YARD_N - 64, 'e', 352],
    ['x', YARD_N, LAND.x0 + 64, GATE.x0 - 160, 's', 416],
    ['x', YARD_N, GATE.x1 + 64, LAND.x1 - 64, 's', 416],
    ['y', LAND.x1, ROAD.y0 + 64, 380, 'w', 320],
    ['y', LAND.x1, 1232, YARD_N - 64, 'w', 320],
  ];
  let k = 0;
  for (const [axis, c, a0, a1, face, h] of faces) {
    const out = { e: 1, w: -1, n: 1, s: -1 }[face];
    for (let u = a0; u < a1; u += 256, k++) {
      // a pilaster every 256 (16 proud)
      if (axis === 'y') m.box(Math.min(c, c + out * 16), u - 16, 0, Math.max(c, c + out * 16), u + 16, h, { all: T.concrete }, { name: 'pilaster' });
      else m.box(u - 16, Math.min(c, c + out * 16), 0, u + 16, Math.max(c, c + out * 16), h, { all: T.concrete }, { name: 'pilaster' });
      // between pilasters: a window high up (some lit), now and then a shutter at ground level
      const mid = u + 128;
      if (mid > a1 - 48) continue;
      if (h01(k, 3) > 0.62) sign(m, 'shutter', axis === 'y' ? c : mid, axis === 'y' ? mid : c, 0, face, 128, 144, T);
      const b = sign(m, 'window', axis === 'y' ? c : mid, axis === 'y' ? mid : c, h - 120, face, 72, 36, T);
      if (h01(k, 5) > 0.55) b.fullbright = true;
    }
  }
}
const YARD_N = LAND.y1;
