// Hollow Creek (zm_hollow_creek): the buildings and everything on the ground - the diner, the
// hardware store and its roof deck, the pharmacy, the gas station, the bank and post office,
// the town square (gazebo, war memorial), the police station, the church and its bell tower,
// the houses of Elm and Oak Lanes, the school front, the rail yard, the cemetery, the covered
// bridge, the highway, the trees, the street lights. placeAreas() adds the floors that belong
// to buildings (before the AreaMap generates); buildPlaces() adds the brushes and lights.
import { room, gableRoof, glass, lamp, navSeed } from '../kit.js';
import { CONTENTS_PLAYERCLIP } from '../../engine/collision.js';
import {
  sw, rg, strip, paint, pbox, pprism, rbox, obox, frustum, h01, pine, shadeTree, car, bus, boxcar, tanker,
  sodium, lantern, glowLamp, onWall, windowOn, doorOn, signOn, doorFrame, stripFence, bench, clipBox, CREEK, DECK_Z, EAST, CEM,
} from './zm_hollow_creek_parts.js';

/** Run fn and paint the atlas markers of every brush it added (kit helpers don't paint). */
function painted(m, fn) {
  const n = m.brushes.length;
  const r = fn();
  for (let i = n; i < m.brushes.length; i++) paint(m.brushes[i]);
  return r;
}

const WARM = [1.0, 0.78, 0.5], COOL = [0.82, 0.9, 1.0];

// ------------------------------------------------------------------ building footprints
// interiors (walkable rects) of the enterable buildings; outer walls are 16 thick outside them
export const DINER = { x0: -1040, y0: -528, x1: -720, y1: -240, z: 16, h: 112 };
export const PHARMACY = { x0: -176, y0: -528, x1: 112, y1: -240, z: 16, h: 112 };
export const KIOSK = { x0: 864, y0: -800, x1: 1072, y1: -640, z: 8, h: 112 };
export const POLICE = { x0: 560, y0: 272, x1: 880, y1: 656, z: 16, h: 128 };
export const NAVE = { x0: -192, y0: 1264, x1: 192, y1: 1504, z: 32, h: 192 };
export const TOWER = { x0: -64, y0: 1152, x1: 64, y1: 1248, z: 32, h: 160 };
export const HOUSE_ELM = { x0: -1040, y0: 1232, x1: -768, y1: 1440, z: 16, h: 112 };
export const HOUSE_OAK = { x0: -784, y0: -1600, x1: -528, y1: -1456, z: 16, h: 112 };
export const HARDWARE = { x0: -608, y0: -544, x1: -320, y1: -224, z: 160 };
// every doorway of the buildings you can enter: [building, wall ('n' 's' 'e' 'w'), centre along the wall]
// (the holdouts have two or three ways in; the test walks through each)
export const DOORS = [
  ['diner', 'n', -880], ['diner', 'w', -400], ['diner', 's', -784],
  ['pharmacy', 'n', -32], ['pharmacy', 's', 48],
  ['kiosk', 'n', 928], ['kiosk', 'e', -720],
  ['police', 'w', 464], ['police', 'e', 400], ['police', 'n', 784],
  ['tower', 's', 0], ['nave', 's', 0], ['nave', 'e', 1424], ['nave', 'n', -120],
  ['elm', 's', -904], ['elm', 'n', -840],
  ['oak', 'n', -656], ['oak', 'e', -1528],
];

export function placeAreas(m) {
  const R = (r, tex, o = {}) => m.A(o.name || 'floor', r.x0, r.y0, r.x1, r.y1, r.z, { tex, side: 'hc_stone', ...o });
  R(DINER, 'hc_checker');
  R(PHARMACY, 'hc_checker');
  R(KIOSK, 'sidewalk');
  R(POLICE, 'wood_dark');
  R(HOUSE_ELM, 'wood_dark');
  R(HOUSE_OAK, 'wood_dark');
  // the hardware store is a block of brick whose flat roof is a deck: two staircases up
  const H = HARDWARE;
  m.A('hardware_roof', H.x0, H.y0, H.x1, H.y1, H.z, { tex: 'concrete_paint', side: 'brick_red' });
  m.S('hardware_stairs_e', H.x1, -512, H.x1 + 64, -256, 8, H.z, 's', 9, { tex: 'wood_dark', stepTex: 'brick_red', side: 'brick_red' });
  m.A('hardware_landing_e', H.x1, -544, H.x1 + 64, -512, H.z, { tex: 'wood_dark', side: 'brick_red' });
  m.S('hardware_stairs_s', H.x0, -608, -384, H.y0, 8, H.z, 'e', 9, { tex: 'wood_dark', stepTex: 'brick_red', side: 'brick_red' });
  // pump islands and the gazebo / memorial platforms are steps up
  const oct = [];
  for (let k = 0; k < 8; k++) { const a = (k + 0.5) * Math.PI / 4, r = 112 / Math.cos(Math.PI / 8); oct.push([Math.cos(a) * r, 528 + Math.sin(a) * r]); }
  m.P('gazebo', oct, 32, { tex: 'wood_dark', side: 'hc_stone' });
  m.S('gazebo_steps', -48, 368, 48, 416, 8, 32, 'n', 2, { tex: 'wood_dark', stepTex: 'hc_stone' });
  m.S('gazebo_steps_n', -48, 640, 48, 688, 8, 32, 's', 2, { tex: 'wood_dark', stepTex: 'hc_stone' });
  m.A('memorial', -64, 240, 64, 304, 24, { tex: 'hc_stone', side: 'hc_stone' });
  // the church: steps down from the plinth at the side and back doors
  m.S('church_steps_e', 288, 1376, 336, 1472, 8, 32, 'w', 2, { tex: 'hc_stone', stepTex: 'hc_stone' });
  m.S('church_steps_w', -336, 1296, -288, 1392, 8, 32, 'e', 2, { tex: 'hc_stone', stepTex: 'hc_stone' });
  m.S('church_steps_n', -176, 1536, -64, 1584, 16, 32, 's', 2, { tex: 'hc_stone', stepTex: 'hc_stone' });
  // the rail yard's loading platform along the depot, a ramp at each end
  m.A('platform', 1216, 1696, 1728, 1792, 32, { tex: 'wood_dark', side: 'hc_stone' });
  m.R('platform_ramp_w', 1088, 1696, 1216, 1792, 0, 32, 'e', { tex: 'wood_dark', side: 'hc_stone' });
  m.R('platform_ramp_e', 1728, 1696, 1856, 1792, 0, 32, 'w', { tex: 'wood_dark', side: 'hc_stone' });
}

export function buildPlaces(m) {
  mainStreetSouth(m);
  gasStation(m);
  mainStreetNorth(m);
  square(m);
  police(m);
  church(m);
  houses(m);
  school(m);
  railYard(m);
  cemetery(m);
  creekAndBridge(m);
  highway(m);
  trees(m);
  streetLights(m);
  dressing(m);
  extras(m);
}

// ------------------------------------------------------------------ helpers

/** A flat-roofed shop front on a solid block's facade: windows, a door, a sign band, a cornice. */
function cornice(m, face, c, u0, u1, z, tex = sw('cream')) {
  onWall(m, face, c, u0 - 6, u1 + 6, z, z + 10, 0, 8, { all: tex }, { detail: true, name: 'trim' });
  onWall(m, face, c, u0 - 4, u1 + 4, z - 6, z, 0, 4, { all: tex }, { detail: true, name: 'trim' });
}

/** A band of trim along a facade (onWall), broken at door centres (gap: half its width). */
function band(m, face, c, u0, u1, z0, z1, d, tex, doors = [], gap = 36, opts = { name: 'trim' }) {
  let u = u0;
  for (const dc of doors.slice().sort((a, b) => a - b)) {
    if (dc - gap > u) onWall(m, face, c, u, dc - gap, z0, z1, 0, d, tex, { detail: true, ...opts });
    u = dc + gap;
  }
  if (u1 > u) onWall(m, face, c, u, u1, z0, z1, 0, d, tex, { detail: true, ...opts });
}

/** A pitched-roof clapboard house (solid unless `enter`), its porch on `face`. */
function house(m, x0, y0, x1, y1, z, face, o = {}) {
  const sid = o.siding || 'hc_white', h = o.h ?? 128, trim = sw('white');
  const along = face === 'n' || face === 's' ? 'x' : 'y';
  if (!o.enter) {
    pbox(m, x0, y0, z, x1, y1, z + h, { all: sid, top: 'roof_shingle' }, { name: 'house' });
  }
  if (!o.enter) pbox(m, x0 - 3, y0 - 3, z - 8, x1 + 3, y1 + 3, z + 14, { all: 'hc_stone' }, { name: 'foundation', detail: true });
  else {
    // round the outside only (the floor inside is the room's), broken at the doors
    const dr = o.doors || {};
    band(m, 'n', y1, x0 - 3, x1 + 3, z - 8, z + 6, 3, { all: 'hc_stone' }, dr.n, 40, { name: 'foundation' });
    band(m, 's', y0, x0 - 3, x1 + 3, z - 8, z + 6, 3, { all: 'hc_stone' }, dr.s, 40, { name: 'foundation' });
    band(m, 'e', x1, y0, y1, z - 8, z + 6, 3, { all: 'hc_stone' }, dr.e, 40, { name: 'foundation' });
    band(m, 'w', x0, y0, y1, z - 8, z + 6, 3, { all: 'hc_stone' }, dr.w, 40, { name: 'foundation' });
  }
  // corner boards and a frieze under the eaves
  for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) pbox(m, cx - 4, cy - 4, z + 14, cx + 4, cy + 4, z + h, { all: trim }, { detail: true, name: 'trim' });
  const rise = o.rise ?? 72;
  gableRoof(m, x0, y0, x1, y1, z + h, rise, along, 'roof_shingle', { gable: sid, eave: 16 });
  // the porch: a deck 16 up, posts, a shed roof, a low railing (24: the horde hops it too)
  const P = o.porch;
  if (P) {
    const [c0, c1, d] = P; // along the face from c0 to c1, d deep
    const fc = { n: y1, s: y0, e: x1, w: x0 }[face];
    const pz = o.enter ? 8 : 16; // (level with the floor inside when there's a door to it)
    onWall(m, face, fc, c0, c1, z, z + pz, 0, d, { all: 'wood_dark' }, { name: 'porch', surface: 'wood' });
    for (const u of [c0 + 4, c1 - 4]) onWall(m, face, fc, u - 4, u + 4, z + pz, z + 104, d - 8, d, { all: trim }, { name: 'post' });
    onWall(m, face, fc, c0 - 8, c1 + 8, z + 104, z + 112, 0, d + 8, { all: trim, top: 'roof_shingle' }, { name: 'porchroof' });
    const rail = { all: trim, sides: strip('baluster', 12) };
    onWall(m, face, fc, c0 + 8, (c0 + c1) / 2 - 36, z + pz, z + pz + 24, d - 4, d - 2, rail, { name: 'rail' });
    onWall(m, face, fc, (c0 + c1) / 2 + 36, c1 - 8, z + pz, z + pz + 24, d - 4, d - 2, rail, { name: 'rail' });
  }
  // windows and the door (o.door: u; o.wins: [[face, u, lit]])
  if (o.door != null && !o.enter) doorOn(m, face, { n: y1, s: y0, e: x1, w: x0 }[face], o.door, z + 16, 52, 96, rg('door'));
  for (const [f, u, lit] of o.wins || []) windowOn(m, f, { n: y1, s: y0, e: x1, w: x0 }[f], u, z + 44, 36, 52, { lit, spill: lit ? 0.4 : false });
  if (o.chimney) {
    const [cx, cy] = o.chimney;
    pbox(m, cx - 14, cy - 14, z + h - 8, cx + 14, cy + 14, z + h + rise + 40, { all: 'brick_red' }, { name: 'chimney' });
  }
}

/** A tall, narrow pine-dark hedge or bush (a low octagon). */
function bush(m, x, y, z, r = 28, h = 36) {
  frustum(m, x, y, z, z + h, r, r * 0.6, 6, { all: 'hc_leaves' }, { surface: 'dirt', name: 'bush', detail: true });
}

/** A dumpster (40 high: the horde hops onto it too). */
function dumpster(m, x, y, z, ang = 0, col = 'green') {
  rbox(m, x, y, z + 4, z + 40, 40, 24, ang, { all: sw(col), top: sw('black') }, { surface: 'metal', name: 'dumpster' });
}

/** A barrel-like trash can / drum (36 high). */
function drum(m, x, y, z, col = 'rust') {
  frustum(m, x, y, z, z + 36, 12, 12, 8, { all: sw(col) }, { surface: 'metal', name: 'drum' });
}

/** A utility pole with a cross arm (the alleys, the woods road) and an optional work light. */
function utilityPole(m, x, y, z, h = 288, o = {}) {
  pbox(m, x - 6, y - 6, z, x + 6, y + 6, z + h, { all: 'wood_dark' }, { surface: 'wood', name: 'pole' });
  const ax = o.axis === 'y';
  pbox(m, ax ? x - 4 : x - 56, ax ? y - 56 : y - 4, z + h - 36, ax ? x + 4 : x + 56, ax ? y + 56 : y + 4, z + h - 28, { all: 'wood_dark' }, { surface: 'wood', name: 'pole' });
  if (o.light) {
    const d = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[o.light];
    glowLamp(m, x + d[0] * 10, y + d[1] * 10, z + h - 64, o.light, 14, 10, 'sodium', o.color || [1.0, 0.7, 0.4], o.intensity ?? 0.7, o.radius ?? 420);
  }
}

// ------------------------------------------------------------------ Main Street, south side

function mainStreetSouth(m) {
  const front = -224; // the shops' front walls (south of the sidewalk at -208)
  // --- the diner: white clapboard with a red band, glass all along the front, three doors
  const D = DINER;
  painted(m, () => room(m, D.x0, D.y0, D.x1, D.y1, D.z, D.h, {
    wallOut: 'hc_white', wallIn: 'hc_white', ceil: 'concrete_paint', roof: 'concrete_paint',
    gaps: {
      n: [{ c: -880, w: 64 }, ...[-1000, -944, -816, -752].map((c) => ({ c, w: 52, z0: D.z + 30, z1: D.z + 88 }))],
      w: [{ c: -400, w: 64 }, { c: -300, w: 52, z0: D.z + 30, z1: D.z + 88 }],
      s: [{ c: -784, w: 64 }, { c: -960, w: 48, z0: D.z + 40, z1: D.z + 88 }],
      e: [-460, -320].map((c) => ({ c, w: 52, z0: D.z + 30, z1: D.z + 88 })),
    },
  }));
  for (const c of [-1000, -944, -816, -752]) glass(m, c - 26, D.y1 + 6, D.z + 30, c + 26, D.y1 + 10, D.z + 88);
  glass(m, D.x0 - 10, -326, D.z + 30, D.x0 - 6, -274, D.z + 88);
  glass(m, -984, D.y0 - 10, D.z + 40, -936, D.y0 - 6, D.z + 88);
  for (const c of [-460, -320]) glass(m, D.x1 + 6, c - 26, D.z + 30, D.x1 + 10, c + 26, D.z + 88);
  // the red band and a chrome rail around the outside, door trims
  // (the bands break at the doors)
  for (const [f, c, u0, u1, doors] of [['n', D.y1 + 16, D.x0 - 16, D.x1 + 16, [-880]], ['s', D.y0 - 16, D.x0 - 16, D.x1 + 16, [-784]], ['e', D.x1 + 16, D.y0 - 16, D.y1 + 16, []], ['w', D.x0 - 16, D.y0 - 16, D.y1 + 16, [-400]]]) {
    band(m, f, c, u0, u1, D.z + 6, D.z + 26, 2, { all: sw('barn') }, doors, 38);
    band(m, f, c, u0, u1, D.z + 96, D.z + 104, 3, { all: sw('chrome') }, doors, 38);
  }
  doorFrame(m, 'n', D.y1 + 16, -880, D.z, 64, 112, sw('chrome'));
  // inside: the counter and stools along the back, booths under the front windows, the pass-through
  pbox(m, -1008, -456, D.z, -800, -432, D.z + 36, { all: sw('barn'), top: sw('chrome') }, { name: 'counter' });
  for (let x = -992; x <= -808; x += 40) frustum(m, x, -412, D.z, D.z + 20, 7, 7, 6, { all: sw('chrome'), top: sw('barn') }, { name: 'stool', detail: true });
  pbox(m, -1040, -528, D.z, -840, -496, D.z + 40, { all: sw('chrome'), top: sw('white') }, { name: 'kitchen' });
  for (const x of [-1000, -944, -816, -752]) {
    pbox(m, x - 18, -296, D.z, x + 18, -272, D.z + 28, { all: sw('white'), top: sw('white') }, { name: 'table', detail: true });
    pbox(m, x - 24, -258, D.z, x + 24, -240, D.z + 16, { all: sw('barn') }, { name: 'booth', detail: true });
    pbox(m, x - 24, -246, D.z + 16, x + 24, -240, D.z + 40, { all: sw('barn') }, { name: 'booth', detail: true });
  }
  for (const [x, y] of [[-960, -330], [-800, -330], [-880, -470]]) lamp(m, x, y, D.z + D.h - 4, { size: [40, 16], color: WARM, intensity: 0.85, radius: 300 });
  // the neon sign on the roof (fullbright both ways), its red and cyan glow on the street
  const sz = D.z + D.h + 16;
  pbox(m, -984, D.y1 + 4, sz, -776, D.y1 + 12, sz + 56, { all: sw('black'), n: rg('diner'), s: rg('diner') }, { name: 'neon' }).fullbright = true;
  for (const x of [-960, -800]) pbox(m, x - 3, D.y1 + 2, sz, x + 3, D.y1 + 14, sz + 4, { all: sw('black') }, { name: 'neon', detail: true });
  m.light(-920, D.y1 + 60, sz + 20, [1.0, 0.3, 0.32], 0.75, 340);
  m.light(-840, D.y1 + 60, sz + 20, [0.35, 0.95, 1.0], 0.45, 260);
  // the generator behind the diner (an objective): a skid, the set, an exhaust, cables
  pbox(m, -1008, -704, 8, -880, -640, 14, { all: sw('black') }, { name: 'generator', surface: 'metal' });
  pbox(m, -1000, -698, 14, -888, -646, 50, { all: sw('yellow'), top: sw('black') }, { name: 'generator', surface: 'metal' });
  pbox(m, -900, -690, 50, -892, -682, 84, { all: sw('rust') }, { name: 'generator', detail: true });
  glowLamp(m, -944, D.y0 - 16, D.z + 92, 's', 16, 10, 'head', [1.0, 0.86, 0.66], 0.7, 360); // the back door light
  dumpster(m, -1104, -760, 8, 90);
  // --- the hardware store: brick, painted sign, two shop windows, roof deck with a parapet
  const H = HARDWARE;
  signOn(m, 'n', H.y1 + 0, H.x0 + 24, H.x1 - 24, 134, 178, 'hardware');
  for (const c of [-560, -368]) {
    const w = onWall(m, 'n', front, c - 44, c + 44, 30, 96, 0, 2, { all: strip('shopwin', 64) }, { detail: true, name: 'shopwin' });
    if (w) { w.fullbright = true; w.castShadow = false; }
    m.light(c, front + 30, 70, WARM, 0.45, 220);
  }
  doorOn(m, 'n', front, -464, 8, 56, 100, rg('shopdoor'), sw('green'));
  cornice(m, 'n', front, H.x0, H.x1, 184, sw('cream'));
  // the parapet round the deck (gaps where the stairs arrive), crates and a vent up there
  const pz = H.z, pt = { all: 'brick_red', top: 'hc_stone' };
  pbox(m, H.x0, H.y1 - 8, pz, H.x1, H.y1, pz + 32, pt, { name: 'parapet' });
  pbox(m, H.x0, H.y0, pz, H.x0 + 8, H.y1 - 8, pz + 32, pt, { name: 'parapet' });
  pbox(m, H.x1 - 8, H.y0 + 64, pz, H.x1, H.y1 - 8, pz + 32, pt, { name: 'parapet' });
  pbox(m, H.x0 + 8, H.y0, pz, -400, H.y0 + 8, pz + 32, pt, { name: 'parapet' });
  pbox(m, -564, -320, pz, -524, -280, pz + 32, { all: 'wood_dark' }, { name: 'crate', surface: 'wood' });
  pbox(m, -516, -312, pz, -484, -280, pz + 32, { all: 'wood_dark' }, { name: 'crate', surface: 'wood' });
  pbox(m, -440, -420, pz, -392, -372, pz + 64, { all: sw('chrome') }, { name: 'vent', surface: 'metal' });
  glowLamp(m, -460, H.y1 - 10, pz + 56, 's', 14, 10, 'sodium', [1.0, 0.72, 0.42], 0.0, 0);
  // --- the pharmacy: brick, white sign, lit windows, doors front and back
  const P = PHARMACY;
  painted(m, () => room(m, P.x0, P.y0, P.x1, P.y1, P.z, P.h, {
    wallOut: 'brick_red', wallIn: 'concrete_paint', ceil: 'concrete_paint', roof: 'concrete_paint',
    gaps: { n: [{ c: -32, w: 64 }, { c: -120, w: 72, z0: P.z + 28, z1: P.z + 92 }, { c: 64, w: 64, z0: P.z + 28, z1: P.z + 92 }], s: [{ c: 48, w: 64 }] },
  }));
  glass(m, -156, P.y1 + 6, P.z + 28, -84, P.y1 + 10, P.z + 92);
  glass(m, 32, P.y1 + 6, P.z + 28, 96, P.y1 + 10, P.z + 92);
  signOn(m, 'n', P.y1 + 16, P.x0 + 8, P.x1 - 8, P.z + P.h - 6, P.z + P.h + 34, 'pharmacy');
  cornice(m, 'n', P.y1 + 16, P.x0 - 16, P.x1 + 16, P.z + P.h + 40, sw('cream'));
  pbox(m, P.x0 - 16, P.y0 - 16, P.z + P.h + 16, P.x1 + 16, P.y1 + 16, P.z + P.h + 40, { all: 'brick_red', top: 'concrete_paint' }, { name: 'parapet' });
  doorFrame(m, 'n', P.y1 + 16, -32, P.z, 64, 112, sw('green'));
  // shelves and the counter inside
  for (const y of [-440, -368]) pbox(m, -144, y - 12, P.z, 0, y + 12, P.z + 64, { all: 'wood_dark', top: 'wood_dark' }, { name: 'shelf' });
  pbox(m, 40, -480, P.z, 112, -456, P.z + 36, { all: 'wood_dark', top: sw('white') }, { name: 'counter' });
  lamp(m, -64, -400, P.z + P.h - 4, { size: [48, 16], color: COOL, intensity: 0.8, radius: 320 });
  lamp(m, 48, -320, P.z + P.h - 4, { size: [32, 16], color: COOL, intensity: 0.7, radius: 260 });
  // the little lot east of the pharmacy, and the back yards
  car(m, 200, -300, 8, 90, 'maroon');
  car(m, 268, -320, 8, 96, 'blue');
  car(m, 224, -640, 8, 180, 'white', { pickup: true });
  stripFence(m, -704, -832, -704, -608, 8, 32, 'picket', 24, 3, 64);
  stripFence(m, 128, -832, 128, -560, 8, 32, 'picket', 24, 3, 64);
  dumpster(m, -260, -780, 8, 0, 'blue');
  drum(m, -120, -800, 8); drum(m, -92, -806, 8, 'green');
  for (const x of [-1000, -560, -40]) utilityPole(m, x, -846, 0, 288, { light: 'n', radius: 380, intensity: 0.6 });
  // the garage row's doors on the alley
  for (let x = -1088; x < 300; x += 176) doorOn(m, 'n', -960, x, 0, 96, 96, sw('cream'), sw('white'));
}

// ------------------------------------------------------------------ the gas station

function gasStation(m) {
  // the canopy on four columns, lit from beneath
  const cz = 144;
  for (const [x, y] of [[672, -528], [672, -336], [992, -528], [992, -336]]) pbox(m, x - 8, y - 8, 0, x + 8, y + 8, cz, { all: sw('white') }, { name: 'column' });
  pbox(m, 616, -576, cz, 1048, -288, cz + 20, { all: sw('white'), bottom: sw('cream') }, { name: 'canopy' });
  for (const [f, c, u0, u1] of [['n', -288, 616, 1048], ['s', -576, 616, 1048], ['e', 1048, -576, -288], ['w', 616, -576, -288]]) onWall(m, f, c, u0, u1, cz + 4, cz + 12, 0, 2, { all: sw('tail') }, { detail: true, name: 'stripe' });
  for (const [x, y] of [[720, -432], [944, -432], [832, -512], [832, -352]]) glowLamp(m, x, y, cz - 4, 'down', 48, 20, 'head', [0.86, 0.92, 1.0], 0.75, 360);
  // two pump islands (an 8-unit kerb) with two pumps each
  for (const x of [752, 912]) {
    pbox(m, x - 20, -496, 0, x + 20, -368, 8, { all: 'concrete_paint', top: sw('yellow') }, { name: 'island' });
    for (const y of [-464, -400]) {
      pbox(m, x - 12, y - 10, 8, x + 12, y + 10, 72, { all: sw('white'), e: sw('tail'), w: sw('tail') }, { name: 'pump', surface: 'metal' });
      pbox(m, x - 13, y - 8, 48, x + 13, y + 8, 64, { all: sw('black') }, { name: 'pump', detail: true });
    }
    pbox(m, x - 4, -380, 8, x + 4, -372, 44, { all: sw('rust') }, { name: 'bollard', detail: true });
  }
  // the kiosk shop: white block, a glazed front, doors north and east
  const K = KIOSK;
  painted(m, () => room(m, K.x0, K.y0, K.x1, K.y1, K.z, K.h, {
    wallOut: 'concrete_paint', wallIn: 'concrete_paint', ceil: 'concrete_paint', roof: 'concrete_paint',
    gaps: { n: [{ c: 928, w: 64 }, { c: 1016, w: 72, z0: K.z + 30, z1: K.z + 90 }], e: [{ c: -720, w: 64 }], w: [{ c: -720, w: 64, z0: K.z + 30, z1: K.z + 90 }] },
  }));
  glass(m, 980, K.y1 + 6, K.z + 30, 1052, K.y1 + 10, K.z + 90);
  glass(m, K.x0 - 10, -752, K.z + 30, K.x0 - 6, -688, K.z + 90);
  pbox(m, K.x0 - 16, K.y1 + 16, K.z + K.h - 4, K.x1 + 16, K.y1 + 24, K.z + K.h + 12, { all: sw('tail') }, { name: 'trim', detail: true });
  for (const y of [-776, -720]) pbox(m, 888, y - 10, K.z, 1000, y + 10, K.z + 56, { all: 'wood_dark' }, { name: 'shelf' });
  pbox(m, 1024, -672, K.z, 1072, -656, K.z + 36, { all: sw('white'), top: sw('black') }, { name: 'counter' });
  lamp(m, 968, -720, K.z + K.h - 4, { size: [48, 16], color: COOL, intensity: 0.8, radius: 300 });
  // the price sign on its pole by the street
  pbox(m, 552, -260, 0, 564, -248, 200, { all: sw('chrome') }, { name: 'pole', surface: 'metal' });
  const gs = pbox(m, 516, -262, 200, 600, -246, 262, { all: sw('white'), n: rg('gas'), s: rg('gas') }, { name: 'sign' });
  if (gs) gs.fullbright = true;
  // the truck lot: the tanker (the ride out), a semi trailer, a few wrecks
  tanker(m, 1420, -440, 0);
  car(m, 1250, -280, 0, 200, 'cream', { pickup: true });
  car(m, 1660, -300, 0, 100, 'black');
  for (const x of [1248, 1440, 1632]) doorOn(m, 'n', -576, x, 0, 112, 120, sw('navy'), sw('black'));
}

// ------------------------------------------------------------------ Main Street, north side

function mainStreetNorth(m) {
  // --- the bank: brick with a stone portico (four columns, a pediment), steps, the sign
  const bz = 8;
  pbox(m, -1120, 272, bz, -832, 576, bz + 232, { all: 'brick_red', top: 'concrete_paint' }, { name: 'bank' });
  pbox(m, -1128, 264, bz + 220, -824, 584, bz + 236, { all: sw('cream') }, { name: 'bank' });
  for (const x of [-1096, -1024, -928, -856]) {
    pbox(m, x - 10, 212, bz, x + 10, 232, bz + 176, { all: sw('cream') }, { name: 'column' });
    pbox(m, x - 13, 209, bz, x + 13, 235, bz + 10, { all: 'hc_stone' }, { name: 'column', detail: true });
  }
  pbox(m, -1120, 208, bz + 176, -832, 272, bz + 196, { all: sw('cream') }, { name: 'portico' });
  painted(m, () => m.prism('y', [[-1124, bz + 196], [-828, bz + 196], [-976, bz + 240]], 208, 272, { all: sw('cream') }, { name: 'pediment' }));
  signOn(m, 's', 208, -1024, -928, bz + 150, bz + 172, 'bank', { edge: sw('cream') });
  doorOn(m, 's', 272, -976, bz, 64, 112, rg('door'), sw('cream'));
  for (const x of [-1072, -880]) windowOn(m, 's', 272, x, bz + 40, 40, 72, { lit: false });
  for (const y of [352, 448, 528]) for (const z of [bz + 40, bz + 140]) windowOn(m, 'e', -832, y, z, 36, 64, { lit: z > 100 && y === 448 ? 'warm' : false });
  // --- the post office: lower, with a flag pole, a mail box
  pbox(m, -736, 256, bz, -480, 544, bz + 176, { all: 'brick_red', top: 'concrete_paint' }, { name: 'post' });
  cornice(m, 's', 256, -736, -480, bz + 168, sw('white'));
  signOn(m, 's', 256, -688, -528, bz + 120, bz + 152, 'post', { edge: sw('white') });
  doorOn(m, 's', 256, -608, bz, 60, 100, rg('shopdoor'), sw('white'));
  for (const x of [-688, -528]) windowOn(m, 's', 256, x, bz + 36, 44, 64, { lit: false });
  for (const y of [320, 432]) windowOn(m, 'e', -480, y, bz + 40, 40, 64, { lit: y === 432 ? 'warm' : false });
  for (const y of [320, 432]) windowOn(m, 'w', -736, y, bz + 40, 40, 64, { lit: false });
  pbox(m, -652, 222, bz, -628, 238, bz + 40, { all: sw('navy') }, { name: 'mailbox', surface: 'metal' });
  pbox(m, -450, 232, bz, -444, 238, bz + 360, { all: sw('chrome') }, { name: 'flagpole', surface: 'metal' });
  // the lot behind them (cars, a light)
  car(m, -1040, 680, 8, 0, 'green');
  car(m, -880, 690, 8, 180, 'maroon');
  car(m, -600, 680, 8, 0, 'cream');
  dumpster(m, -790, 620, 8, 0);
}

// ------------------------------------------------------------------ the town square

function square(m) {
  const z = 8;
  // lawns either side of the path (slightly raised beds: the same height, just grass)
  for (const [x0, y0, x1, y1] of [[-416, 320, -144, 736], [144, 320, 416, 736]]) {
    pbox(m, x0, y0, z - 2, x1, y1, z + 1, { all: 'grass', sides: 'hc_stone' }, { name: 'lawn' });
    for (const [a, b, c, d] of [[x0, y0, x1, y0 + 6], [x0, y1 - 6, x1, y1], [x0, y0, x0 + 6, y1], [x1 - 6, y0, x1, y1]]) pbox(m, a, b, z, c, d, z + 6, { all: 'hc_stone' }, { name: 'kerb', detail: true });
  }
  // the gazebo: an octagonal deck with a railing, eight posts, a pyramid roof and a lantern
  const gz = 32;
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) * Math.PI / 4, x = Math.cos(a) * 100, y = 528 + Math.sin(a) * 100;
    pbox(m, x - 5, y - 5, gz, x + 5, y + 5, gz + 112, { all: sw('white') }, { name: 'post' });
  }
  frustum(m, 0, 528, gz + 112, gz + 124, 124, 122, 8, { all: sw('white'), top: 'roof_shingle' }, { name: 'gazebo' }, Math.PI / 8);
  frustum(m, 0, 528, gz + 124, gz + 196, 122, 6, 8, { all: 'roof_shingle' }, { name: 'gazebo' }, Math.PI / 8);
  frustum(m, 0, 528, gz + 196, gz + 220, 6, 2, 8, { all: sw('white') }, { name: 'gazebo', detail: true }, Math.PI / 8);
  // railing between the posts, open at the north and south steps (24 high)
  for (let k = 0; k < 8; k++) {
    if (k === 1 || k === 5) continue;
    const a0 = (k + 0.5) * Math.PI / 4, a1 = (k + 1.5) * Math.PI / 4;
    const p0 = [Math.cos(a0) * 100, 528 + Math.sin(a0) * 100], p1 = [Math.cos(a1) * 100, 528 + Math.sin(a1) * 100];
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy), nx = -dy / l * 1.5, ny = dx / l * 1.5;
    painted(m, () => m.prism('z', [[p0[0] - nx, p0[1] - ny], [p1[0] - nx, p1[1] - ny], [p1[0] + nx, p1[1] + ny], [p0[0] + nx, p0[1] + ny]], gz, gz + 24, { all: sw('white'), sides: strip('baluster', 12) }, { name: 'rail' }));
  }
  glowLamp(m, 0, 528, gz + 104, 'down', 12, 12, 'sodium', [1.0, 0.76, 0.46], 0.7, 320);
  // the war memorial: an obelisk on a stepped stone base, a bronze plaque, a wreath of light
  pbox(m, -40, 248, 24, 40, 296, 40, { all: 'hc_stone' }, { name: 'memorial' });
  pbox(m, -24, 256, 40, 24, 288, 112, { all: 'hc_stone' }, { name: 'memorial' });
  pbox(m, -16, 252, 56, 16, 256, 96, { all: sw('bronze') }, { name: 'plaque', detail: true });
  frustum(m, 0, 272, 112, 312, 14, 8, 4, { all: 'hc_stone' }, { name: 'obelisk' }, Math.PI / 4);
  frustum(m, 0, 272, 312, 328, 8, 1, 4, { all: 'hc_stone' }, { name: 'obelisk' }, Math.PI / 4);
  // benches, lantern posts, shade trees, planters
  for (const [x, y, a] of [[-120, 352, 90], [120, 352, 90], [-120, 704, 270], [120, 704, 270], [-176, 528, 0], [176, 528, 180]]) bench(m, x, y, z, a);
  for (const [x, y] of [[-176, 288], [176, 288], [-176, 752], [176, 752], [-432, 528], [432, 528]]) lantern(m, x, y, z);
  for (const [x, y, h] of [[-320, 400, 320], [320, 640, 300], [-300, 660, 280], [300, 400, 330]]) shadeTree(m, x, y, z, h, 110, h01(x, y) * 3);
}

// ------------------------------------------------------------------ the police station

function police(m) {
  const P = POLICE;
  painted(m, () => room(m, P.x0, P.y0, P.x1, P.y1, P.z, P.h, {
    wallOut: 'brick_red', wallIn: 'concrete_paint', ceil: 'concrete_paint', roof: 'concrete_paint',
    gaps: {
      w: [{ c: 464, w: 80 }, { c: 336, w: 48, z0: P.z + 36, z1: P.z + 96 }, { c: 592, w: 48, z0: P.z + 36, z1: P.z + 96 }],
      e: [{ c: 400, w: 64 }],
      n: [{ c: 784, w: 64 }],
      s: [{ c: 640, w: 48, z0: P.z + 36, z1: P.z + 96 }, { c: 800, w: 48, z0: P.z + 36, z1: P.z + 96 }],
    },
  }));
  for (const c of [336, 592]) glass(m, P.x0 - 10, c - 24, P.z + 36, P.x0 - 6, c + 24, P.z + 96);
  for (const c of [640, 800]) glass(m, c - 24, P.y0 - 10, P.z + 36, c + 24, P.y0 - 6, P.z + 96);
  // the parapet, a stone base band, the sign over the front door, its lamps
  pbox(m, P.x0 - 16, P.y0 - 16, P.z + P.h + 16, P.x1 + 16, P.y1 + 16, P.z + P.h + 40, { all: 'brick_red', top: 'concrete_paint' }, { name: 'parapet' });
  for (const [f, c, u0, u1, doors] of [['w', P.x0 - 16, P.y0 - 16, P.y1 + 16, [464]], ['s', P.y0 - 16, P.x0 - 16, P.x1 + 16, []], ['e', P.x1 + 16, P.y0 - 16, P.y1 + 16, [400]], ['n', P.y1 + 16, P.x0 - 16, P.x1 + 16, [784]]]) {
    band(m, f, c, u0, u1, P.z - 8, P.z + 16, 3, { all: 'hc_stone' }, doors, 46, { name: 'base' });
    onWall(m, f, c, u0, u1, P.z + P.h + 28, P.z + P.h + 40, 0, 6, { all: sw('cream') }, { detail: true, name: 'cornice' });
  }
  signOn(m, 'w', P.x0 - 16, 400, 528, P.z + 116, P.z + 148, 'police', { edge: sw('cream') });
  doorFrame(m, 'w', P.x0 - 16, 464, P.z, 80, 112, sw('cream'));
  for (const y of [420, 508]) glowLamp(m, P.x0 - 16, y, P.z + 100, 'w', 12, 16, 'head', [0.85, 0.9, 1.0], 0.55, 300);
  // inside: the front counter, a partition with a door, the radio desk, a holding cell
  pbox(m, 640, 400, P.z, 664, 560, P.z + 40, { all: 'wood_dark', top: sw('black') }, { name: 'counter' });
  painted(m, () => {
    m.box(712, P.y0, P.z, 728, 432, P.z + P.h, { all: 'concrete_paint' }, { name: 'partition' });
    m.box(712, 496, P.z, 728, P.y1, P.z + P.h, { all: 'concrete_paint' }, { name: 'partition' });
    m.box(712, 432, P.z + 112, 728, 496, P.z + P.h, { all: 'concrete_paint' }, { name: 'partition' });
  });
  pbox(m, 800, 600, P.z, 872, 648, P.z + 32, { all: 'wood_dark' }, { name: 'desk' });
  pbox(m, 816, 616, P.z + 32, 856, 640, P.z + 52, { all: sw('black') }, { name: 'radio', surface: 'metal', detail: true });
  glowLamp(m, 836, 615, P.z + 46, 's', 10, 4, 'tail', [1, 0.3, 0.2], 0.0, 0, 1);
  stripFence(m, 760, 280, 760, 384, P.z, P.h, 'iron', 10, 3, 0);
  stripFence(m, 760, 384, 880, 384, P.z, P.h, 'iron', 10, 3, 0, [[800, 840]]);
  for (const [x, y] of [[640, 336], [640, 592], [800, 336], [800, 528]]) lamp(m, x, y, P.z + P.h - 4, { size: [40, 16], color: COOL, intensity: 0.75, radius: 300 });
  // two cruisers out back, lights on
  car(m, 600, 724, 8, 0, 'black', { police: true, lights: true });
  car(m, 900, 730, 8, 180, 'black', { police: true });
}

// ------------------------------------------------------------------ the church

function church(m) {
  const N = NAVE, T = TOWER, z = N.z;
  painted(m, () => room(m, N.x0, N.y0, N.x1, N.y1, z, N.h, {
    wallOut: 'hc_white', wallIn: 'hc_white', ceil: 'wood_dark', roof: 'roof_shingle',
    gaps: {
      s: [{ c: 0, w: 96, z1: z + 128 }],
      e: [{ c: 1424, w: 64 }, { c: 1320, w: 36, z0: z + 56, z1: z + 168 }],
      w: [1320, 1424].map((c) => ({ c, w: 36, z0: z + 56, z1: z + 168 })),
      n: [{ c: -120, w: 64 }],
    },
  }));
  for (const c of [1320]) glass(m, N.x1 + 6, c - 18, z + 56, N.x1 + 10, c + 18, z + 168);
  for (const c of [1320, 1424]) glass(m, N.x0 - 10, c - 18, z + 56, N.x0 - 6, c + 18, z + 168);
  gableRoof(m, N.x0 - 16, N.y0 - 16, N.x1 + 16, N.y1 + 16, z + N.h + 16, 150, 'y', 'roof_shingle', { gable: 'hc_white', eave: 18 });
  // the tower: the narthex at its foot, the shaft, an open belfry with the bell, the spire
  painted(m, () => room(m, T.x0, T.y0, T.x1, T.y1, z, T.h, {
    wallOut: 'hc_white', wallIn: 'hc_white', ceil: 'wood_dark', roof: 'hc_white',
    gaps: { s: [{ c: 0, w: 80, z1: z + 128 }], n: [{ c: 0, w: 96, z1: z + 128 }] },
  }));
  const X0 = T.x0 - 16, X1 = T.x1 + 16, Y0 = T.y0 - 16, Y1 = T.y1 + 16;
  const tz = z + T.h + 16, bz = 460;
  pbox(m, X0, Y0, tz, X1, Y1, bz, { all: 'hc_white' }, { name: 'tower' });
  for (const [cx, cy] of [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1]]) pbox(m, cx - 6, cy - 6, z, cx + 6, cy + 6, bz, { all: sw('white') }, { name: 'trim', detail: true });
  pbox(m, X0 - 8, Y0 - 8, bz, X1 + 8, Y1 + 8, bz + 12, { all: sw('white') }, { name: 'cornice' });
  for (const [cx, cy] of [[X0 + 12, Y0 + 12], [X1 - 12, Y0 + 12], [X0 + 12, Y1 - 12], [X1 - 12, Y1 - 12]]) pbox(m, cx - 12, cy - 12, bz + 12, cx + 12, cy + 12, bz + 112, { all: sw('white') }, { name: 'belfry' });
  pbox(m, X0 - 8, Y0 - 8, bz + 112, X1 + 8, Y1 + 8, bz + 126, { all: sw('white') }, { name: 'cornice' });
  frustum(m, 0, (Y0 + Y1) / 2, bz + 126, bz + 400, (X1 - X0) / 2 + 2, 3, 4, { all: 'roof_shingle' }, { name: 'spire' }, Math.PI / 4);
  // the bell (bronze) under a yoke, lit warm so the belfry glows over the town
  pbox(m, -40, (Y0 + Y1) / 2 - 4, bz + 92, 40, (Y0 + Y1) / 2 + 4, bz + 100, { all: 'wood_dark' }, { name: 'yoke', detail: true });
  frustum(m, 0, (Y0 + Y1) / 2, bz + 40, bz + 92, 30, 16, 8, { all: sw('bronze') }, { name: 'bell', detail: true });
  m.light(0, (Y0 + Y1) / 2, bz + 30, [1.0, 0.8, 0.55], 0.9, 260);
  // floodlights on the plinth wash the tower front and the steeple
  for (const x of [-150, 150]) {
    pbox(m, x - 10, 1124, z, x + 10, 1140, z + 14, { all: sw('black') }, { name: 'flood', surface: 'metal', detail: true });
    m.light(x * 0.5, 1060, 330, [0.9, 0.92, 1.0], 0.55, 380);
  }
  m.light(0, 1080, 560, [0.8, 0.85, 1.0], 0.45, 340);
  // inside: pews either side of the aisle, the altar step, candles of light
  for (let y = 1296; y <= 1408; y += 48) for (const [x0, x1] of [[-176, -40], [40, 176]]) {
    pbox(m, x0, y, z, x1, y + 12, z + 16, { all: 'wood_dark' }, { name: 'pew', detail: true });
    pbox(m, x0, y + 12, z, x1, y + 16, z + 34, { all: 'wood_dark' }, { name: 'pew', detail: true });
  }
  pbox(m, -112, 1456, z, 112, 1504, z + 12, { all: 'wood_dark' }, { name: 'altar' });
  pbox(m, -32, 1480, z + 12, 32, 1496, z + 40, { all: sw('white') }, { name: 'altar', detail: true });
  for (const [x, y] of [[0, 1320], [0, 1440]]) lamp(m, x, y, z + N.h - 4, { size: [24, 24], color: [1.0, 0.74, 0.46], intensity: 0.8, radius: 300 });
  lamp(m, 0, 1200, z + T.h - 4, { size: [24, 24], color: [1.0, 0.74, 0.46], intensity: 0.7, radius: 240 });
  doorFrame(m, 's', T.y0 - 16, 0, z, 80, 128, sw('white'));
  glowLamp(m, N.x1 + 16, 1424, z + 120, 'e', 12, 16, 'sodium', [1.0, 0.76, 0.48], 0.55, 320); // the side door
  glowLamp(m, -120, N.y1 + 16, z + 120, 'n', 12, 16, 'sodium', [1.0, 0.76, 0.48], 0.55, 320); // the back door
}

// ------------------------------------------------------------------ houses

function houses(m) {
  // Elm Lane, north of Church Street (fronts face south)
  const E = HOUSE_ELM;
  painted(m, () => room(m, E.x0, E.y0, E.x1, E.y1, E.z, E.h, {
    wallOut: 'hc_siding', wallIn: 'hc_white', ceil: 'concrete_paint', roof: 'roof_shingle',
    gaps: { s: [{ c: -904, w: 64 }, { c: -1000, w: 40, z0: E.z + 36, z1: E.z + 88 }], n: [{ c: -840, w: 64 }], e: [{ c: 1336, w: 40, z0: E.z + 36, z1: E.z + 88 }] },
  }));
  glass(m, -1020, E.y0 - 10, E.z + 36, -980, E.y0 - 6, E.z + 88);
  glass(m, E.x1 + 6, 1316, E.z + 36, E.x1 + 10, 1356, E.z + 88);
  house(m, E.x0 - 16, E.y0 - 16, E.x1 + 16, E.y1 + 16, 8, 's', { enter: true, doors: { s: [-904], n: [-840] }, siding: 'hc_siding', h: E.h + 24, porch: [-1000, -808, 72], wins: [['w', 1300, 'warm'], ['w', 1380, false]], chimney: [-1000, 1400] });
  pbox(m, -1000, 1288, E.z, -940, 1328, E.z + 30, { all: 'wood_dark' }, { name: 'table', detail: true });
  pbox(m, -820, 1380, E.z, -784, 1432, E.z + 24, { all: sw('maroon') }, { name: 'couch', detail: true });
  lamp(m, -904, 1336, E.z + E.h - 4, { size: [24, 24], color: WARM, intensity: 0.75, radius: 280 });
  house(m, -640, 1216, -384, 1440, 8, 's', { siding: 'hc_white', porch: [-600, -424, 64], door: -512, wins: [['s', -584, 'warm'], ['s', -440, false], ['e', 1290, false], ['e', 1380, 'cool'], ['w', 1336, false]], chimney: [-420, 1400] });
  car(m, -700, 1140, 8, 90, 'blue');
  stripFence(m, -1152, 1100, -1072, 1100, 8, 32, 'picket', 24, 3, 40);
  stripFence(m, -720, 1100, -672, 1100, 8, 32, 'picket', 24, 3, 40);
  stripFence(m, -352, 1100, -296, 1100, 8, 32, 'picket', 24, 3, 40);
  // Oak Lane, south side (fronts face north)
  const O = HOUSE_OAK;
  painted(m, () => room(m, O.x0, O.y0, O.x1, O.y1, O.z, O.h, {
    wallOut: 'hc_white', wallIn: 'hc_siding', ceil: 'concrete_paint', roof: 'roof_shingle',
    gaps: { n: [{ c: -656, w: 64 }, { c: -748, w: 40, z0: O.z + 36, z1: O.z + 88 }], e: [{ c: -1528, w: 64 }], w: [{ c: -1528, w: 40, z0: O.z + 36, z1: O.z + 88 }] },
  }));
  glass(m, -768, O.y1 + 6, O.z + 36, -728, O.y1 + 10, O.z + 88);
  glass(m, O.x0 - 10, -1548, O.z + 36, O.x0 - 6, -1508, O.z + 88);
  house(m, O.x0 - 16, O.y0 - 16, O.x1 + 16, O.y1 + 16, 8, 'n', { enter: true, doors: { n: [-656], e: [-1528] }, siding: 'hc_white', h: O.h + 24, porch: [-760, -560, 48], wins: [], chimney: [-540, -1480] });
  pbox(m, -700, -1560, O.z, -640, -1520, O.z + 30, { all: 'wood_dark' }, { name: 'table', detail: true });
  lamp(m, -656, -1528, O.z + O.h - 4, { size: [24, 24], color: WARM, intensity: 0.75, radius: 280 });
  house(m, -1184, -1616, -928, -1440, 8, 'n', { siding: 'hc_siding', porch: [-1144, -968, 32], door: -1056, wins: [['n', -1136, 'warm'], ['n', -976, false], ['w', -1528, false], ['e', -1528, 'cool']], chimney: [-1150, -1580] });
  house(m, -384, -1616, -128, -1440, 8, 'n', { siding: 'hc_white', porch: [-344, -168, 32], door: -256, wins: [['n', -336, false], ['n', -176, 'warm'], ['w', -1528, 'warm'], ['e', -1528, false]], chimney: [-160, -1580] });
  house(m, 32, -1616, 288, -1440, 8, 'n', { siding: 'hc_siding', porch: [72, 248, 32], door: 160, wins: [['n', 80, false], ['n', 240, false], ['w', -1528, 'warm']], chimney: [64, -1480] });
  car(m, -860, -1240, 0, 0, 'maroon');
  car(m, 160, -1300, 0, 180, 'green', { pickup: true });
  for (const x of [-880, -480, -64]) stripFence(m, x - 40, -1412, x + 40, -1412, 8, 32, 'picket', 24, 3, 40);
  // Oak Lane's north side: the garage row's doors
  for (let x = -1072; x < 300; x += 192) doorOn(m, 's', -1088, x, 8, 88, 92, sw('white'), sw('white'));
}

// ------------------------------------------------------------------ the school

function school(m) {
  // the schoolyard fence (chain-link: you see and shoot through it), two gates and the bus's breach
  const CL = { contents: CONTENTS_PLAYERCLIP, surface: 'metal', name: 'chainlink', detail: true };
  const cl = (x0, y0, x1, y1) => m.box(x0, y0, 0, x1, y1, 104, { all: 'chainlink' }, CL);
  cl(1216, 208, 1220, 448); cl(1216, 544, 1220, 832); cl(1216, 896, 1220, 960);
  cl(1220, 204, 1344, 208); cl(1536, 204, 1728, 208);
  for (const [x, y] of [[1218, 208], [1218, 448], [1218, 544], [1218, 832], [1218, 896], [1218, 958], [1344, 206], [1536, 206], [1726, 206]]) pbox(m, x - 3, y - 3, 0, x + 3, y + 3, 108, { all: sw('chrome') }, { name: 'post', surface: 'metal', detail: true });
  // the crashed bus, nose through the fence by the Main Street gate
  bus(m, 1440, 300, 0, 200);
  // the school's front: the yard faces (west face of the east wing at x 1728, south face of the north wing at y 960)
  for (let y = 300; y <= 880; y += 96) for (const z of [40, 136]) if (Math.abs(y - 640) > 60) windowOn(m, 'w', 1728, y, z, 40, 60, { lit: false, frame: sw('cream') });
  for (let x = 1296; x <= 1648; x += 88) for (const z of [40, 136]) windowOn(m, 's', 960, x, z, 40, 60, { lit: x === 1472 && z > 100 ? 'cool' : false, frame: sw('cream') });
  doorOn(m, 'w', 1728, 640, 0, 72, 104, rg('shopdoor'), sw('cream'));
  pbox(m, 1696, 584, 0, 1728, 696, 8, { all: 'hc_stone' }, { name: 'step' });
  signOn(m, 'w', 1728, 560, 720, 120, 152, 'school', { edge: sw('cream') });
  glowLamp(m, 1728, 640, 112, 'w', 14, 10, 'sodium', [1.0, 0.72, 0.42], 0.55, 340);
  for (const [f, c, u0, u1] of [['w', 1728, 208, 960], ['s', 960, 1216, 1728]]) {
    onWall(m, f, c, u0, u1, 212, 224, 0, 6, { all: sw('cream') }, { detail: true, name: 'cornice' });
    onWall(m, f, c, u0, u1, 0, 16, 0, 3, { all: 'hc_stone' }, { detail: true, name: 'base' });
  }
  // a basketball hoop and a bench in the yard
  pbox(m, 1690, 820, 0, 1698, 828, 150, { all: sw('chrome') }, { name: 'hoop', surface: 'metal', detail: true });
  pbox(m, 1660, 808, 130, 1690, 840, 160, { all: sw('white') }, { name: 'hoop', detail: true });
  bench(m, 1500, 920, 0, 270);
  // the Main Street frontage of the east wing
  for (let x = 1792; x <= 1984; x += 96) windowOn(m, 's', 208, x, 48, 40, 60, { lit: false, frame: sw('cream') });
}

// ------------------------------------------------------------------ the rail yard

export const TRACKS = [1296, 1440, 1584];

function railYard(m) {
  // three tracks east-west: ballast with ties (an atlas strip), two rails each, a buffer stop
  for (const y of TRACKS) {
    pbox(m, 1000, y - 52, 0, 1856, y + 52, 3, { all: 'dirt_dark', top: strip('track', 40) }, { name: 'track' });
    for (const v of [-30, 26]) pbox(m, 1000, y + v, 3, 1856, y + v + 4, 9, { all: 'metal_rust' }, { name: 'rail', surface: 'metal', detail: true });
    pbox(m, 976, y - 40, 0, 1000, y + 40, 40, { all: sw('barn') }, { name: 'buffer' });
  }
  boxcar(m, 1400, TRACKS[1], 3);
  boxcar(m, 1680, TRACKS[0], 3, 400);
  boxcar(m, 1640, TRACKS[2], 3, 400);
  // the depot's face (the auto mass behind the platform): doors, lamps, crates on the platform
  for (const x of [1344, 1536]) {
    doorOn(m, 's', 1792, x, 32, 96, 120, sw('barn'), sw('black'));
    glowLamp(m, x + 80, 1792, 168, 's', 14, 10, 'sodium', [1.0, 0.7, 0.4], 0.75, 440);
  }
  onWall(m, 's', 1792, 1088, 1856, 186, 200, 0, 10, { all: sw('rust') }, { detail: true, name: 'trim' });
  for (const x of [1296, 1664]) pbox(m, x - 20, 1716, 32, x + 20, 1756, 72, { all: 'wood_dark' }, { name: 'crate', surface: 'wood' });
  // the iron fence along the church field (a gap at its middle)
  stripFence(m, 960, 1232, 960, 1536, 8, 96, 'iron', 16, 3, 64, [[1344, 1440]]);
  // floodlight masts
  for (const [x, y] of [[1184, 1368], [1600, 1368], [1800, 1512]]) {
    pbox(m, x - 6, y - 6, 0, x + 6, y + 6, 320, { all: sw('chrome') }, { name: 'mast', surface: 'metal', detail: true });
    pbox(m, x - 24, y - 6, 312, x + 24, y + 6, 320, { all: sw('chrome') }, { name: 'mast', surface: 'metal', detail: true });
    glowLamp(m, x + 18, y, 306, 'down', 24, 12, 'head', [0.8, 0.88, 1.0], 1.2, 760);
  }
  for (const [x, y] of [[1100, 1250], [1060, 1660]]) drum(m, x, y, 0);
  // lamps on the school's back wall over the first track
  for (const x of [1280, 1520]) glowLamp(m, x, 1216, 176, 'n', 16, 10, 'sodium', [1.0, 0.7, 0.42], 0.85, 520);
}

// ------------------------------------------------------------------ the cemetery

const CEM_Z = (y) => 8 + (y - CEM.y0) / 6;

function cemetery(m) {
  // headstones in rows on the hill (sunk into the slope)
  for (let row = 0; row < 3; row++) {
    const y = 1616 + row * 56;
    for (let k = 0; k < 15; k++) {
      const x = -1120 + k * 144 + (row & 1) * 56;
      if (x > -360 && x < 120 && y < 1680) continue; // the church's back path
      if (x > 440 && x < 720 && y > 1640) continue; // the mausoleum
      const hh = 26 + Math.floor(h01(k, row) * 12), w = 22 + Math.floor(h01(row, k) * 10);
      const z0 = CEM_Z(y) - 6;
      if (h01(k * 7, row) < 0.12) frustum(m, x, y, z0, z0 + 96, 10, 6, 4, { all: 'hc_stone' }, { name: 'monument', detail: true }, Math.PI / 4);
      else pbox(m, x - w / 2, y - 4, z0, x + w / 2, y + 4, z0 + hh, { all: 'hc_stone' }, { name: 'headstone', detail: true });
    }
  }
  // the mausoleum: stone, a pediment, an iron door (solid)
  const mz = CEM_Z(1680) - 8;
  pbox(m, 480, 1680, mz, 672, 1800, mz + 144, { all: 'hc_stone' }, { name: 'mausoleum' });
  painted(m, () => m.prism('y', [[472, mz + 144], [680, mz + 144], [576, mz + 184]], 1672, 1808, { all: 'hc_stone' }, { name: 'mausoleum' }));
  doorOn(m, 's', 1680, 576, mz + 8, 56, 96, strip('iron', 10), sw('black'));
  // the iron fence along the cemetery's foot (gates behind the church, from Mill Road and the lanes, from the field)
  // (96 tall: nobody climbs it from the plinth or the slope)
  stripFence(m, -1248, CEM.y0, -288, CEM.y0, 8, 96, 'iron', 16, 3, 64, [[-1216, -1120], [-736, -640]]);
  stripFence(m, 288, CEM.y0, 960, CEM.y0, 8, 96, 'iron', 16, 3, 64, [[512, 608]]);
  stripFence(m, 960, CEM.y0, 960, CEM.y1, 8, 120, 'iron', 16, 3, 64);
  for (const [x, y] of [[-688, 1576], [560, 1576], [-1168, 1576]]) lantern(m, x, y, CEM_Z(y), 120, { intensity: 0.75, radius: 380 });
  lantern(m, -120, 1610, CEM_Z(1610), 120, { intensity: 0.7, radius: 360 });
  for (const [x, y] of [[-944, 1700], [-336, 1700], [256, 1700], [800, 1700], [-640, 1760], [0, 1760]]) lantern(m, x, y, CEM_Z(y), 120, { intensity: 0.85, radius: 560 });
}

// ------------------------------------------------------------------ the creek and the covered bridge

function creekAndBridge(m) {
  const C = CREEK;
  // a thin trickle of water down the middle of the bed (a visual only), rocks, a fallen log
  m.box(C.bed0 + 48, C.y0, C.z, C.bed1 - 48, C.y1, C.z + 2, { all: null, top: 'water_murky' }, { contents: 0, castShadow: false, name: 'water' });
  const nearRamp = (y) => [...C.rampsE, ...C.rampsW].some(([r0, r1]) => y > r0 - 120 && y < r1 + 120);
  for (let y = C.y0 + 160; y < C.y1 - 100; y += 256) {
    if (Math.abs(y) < 200 || nearRamp(y)) continue; // (clear of the bridge and the ramps' feet)
    const x = (h01(y, 3) < 0.5 ? C.bed0 + 28 : C.bed1 - 28);
    frustum(m, x, y, C.z, C.z + 20 + h01(y, 5) * 16, 22, 12, 6, { all: 'hc_stone' }, { name: 'rock' }, h01(y, 9) * 2);
  }
  rbox(m, C.bed0 + 40, 780, C.z, C.z + 18, 56, 9, 28, { all: 'wood_dark' }, { name: 'log', surface: 'wood' });
  // the covered bridge: barn-red board walls on the deck with open windows (36 up: anyone can climb
  // through and drop to the creek), a pitched roof
  const x0 = C.x0, x1 = C.x1, bz = 0;
  for (const s of [-1, 1]) {
    const y0 = s < 0 ? -128 : 112, y1 = s < 0 ? -112 : 128;
    painted(m, () => {
      const gaps = [-1664, -1504].map((c) => ({ c, w: 56, z0: bz + 36, z1: bz + 84 }));
      let u = x0;
      for (const g of gaps) {
        m.box(u, y0, bz, g.c - g.w / 2, y1, bz + 144, { all: sw('barn') }, { name: 'bridge', surface: 'wood' });
        m.box(g.c - g.w / 2, y0, bz, g.c + g.w / 2, y1, g.z0, { all: sw('barn') }, { name: 'bridge', surface: 'wood' });
        m.box(g.c - g.w / 2, y0, g.z1, g.c + g.w / 2, y1, bz + 144, { all: sw('barn') }, { name: 'bridge', surface: 'wood' });
        u = g.c + g.w / 2;
      }
      m.box(u, y0, bz, x1, y1, bz + 144, { all: sw('barn') }, { name: 'bridge', surface: 'wood' });
    });
  }
  pbox(m, x0 - 8, -136, bz + 144, x1 + 8, 136, bz + 152, { all: sw('white'), bottom: 'wood_dark' }, { name: 'bridge' });
  gableRoof(m, x0 - 8, -136, x1 + 8, 136, bz + 152, 64, 'x', 'roof_shingle', { gable: 'wood_dark', eave: 12 });
  // portal boards over each end, beams under the deck, abutments
  for (const x of [x0, x1]) {
    pbox(m, x - 4, -128, bz + 112, x + 4, 128, bz + 152, { all: sw('barn') }, { name: 'portal' });
    pbox(m, x - 24, -152, -16, x + 24, -128, bz + 8, { all: 'hc_stone' }, { name: 'abutment' });
    pbox(m, x - 24, 128, -16, x + 24, 152, bz + 8, { all: 'hc_stone' }, { name: 'abutment' });
  }
  for (let x = x0 + 64; x < x1; x += 64) pbox(m, x - 6, -128, -32, x + 6, 128, -16, { all: 'wood_dark' }, { name: 'beam', surface: 'wood', detail: true });
  for (const x of [x0 + 96, x1 - 96]) lamp(m, x, 0, bz + 140, { size: [16, 16], color: [1.0, 0.74, 0.44], intensity: 0.65, radius: 280 });
  lamp(m, (x0 + x1) / 2, 0, -36, { size: [16, 16], color: [1.0, 0.74, 0.44], intensity: 0.6, radius: 320 }); // under the deck
  // work lights on the creek's east wall, down in the bed (the horde comes up it)
  for (const y of [-1180, -760, -360, 360, 820, 1200]) glowLamp(m, C.bed1, y, -24, 'w', 14, 10, 'sodium', [1.0, 0.7, 0.42], 0.85, 440);
  // timber guard rails along the east creek wall by Mill Road (low: 32, gaps at the ramps)
  for (const [y0, y1] of [[-1344, -1280], [-1088, -640], [-448, -152], [152, 448], [640, 1088], [1280, 1472]]) pbox(m, C.bed1 + 2, y0, 8, C.bed1 + 8, y1, 40, { all: 'wood_dark' }, { name: 'guardrail', surface: 'wood', detail: true });
  // the woods road: an old pole line with work lights, the town sign by the bridge
  for (const y of [420, 1060]) utilityPole(m, -1840, y, 0, 300, { axis: 'y', light: 'e', radius: 480, intensity: 0.7 });
  utilityPole(m, -1600, 1616, 0, 300, { light: 's', radius: 480, intensity: 0.7 });
  utilityPole(m, -1840, 30, 0, 300, { axis: 'y', light: 'e', radius: 420, intensity: 0.6 });
  pbox(m, -1840, 160, 0, -1832, 168, 100, { all: 'wood_dark' }, { name: 'signpost', detail: true });
  pbox(m, -1840, 280, 0, -1832, 288, 100, { all: 'wood_dark' }, { name: 'signpost', detail: true });
  pbox(m, -1844, 152, 56, -1828, 296, 92, { all: 'wood_dark', e: rg('welcome'), w: rg('welcome') }, { name: 'sign', detail: true });
}

// ------------------------------------------------------------------ the highway and the off-ramp

function highway(m) {
  const z = DECK_Z;
  // jersey barriers along the deck's edges (gaps at the off-ramp and the trail)
  const jersey = (x0, y0, x1, y1) => pbox(m, x0, y0, z, x1, y1, z + 32, { all: 'concrete_paint' }, { name: 'barrier' });
  jersey(672, -1680, 1728, -1664);
  jersey(480, -1856, EAST, -1840);
  // keep everyone on the deck, the ramp and the trail (the embankment beside them is lower)
  clipBox(m, 672, -1680, z, 1728, -1664, 1600);
  clipBox(m, 1712, -1664, 0, 1728, -576, 1600);
  clipBox(m, 672, -1664, 0, 688, -1344, 1600);
  // the exit sign on a gantry over the deck's east end
  for (const y of [-1850, -1670]) pbox(m, 1700, y - 4, z, 1708, y + 4, z + 220, { all: sw('chrome') }, { name: 'gantry', surface: 'metal', detail: true });
  pbox(m, 1698, -1856, z + 212, 1710, -1664, z + 222, { all: sw('chrome') }, { name: 'gantry', surface: 'metal', detail: true });
  pbox(m, 1690, -1820, z + 160, 1698, -1700, z + 210, { all: sw('green'), w: rg('exit') }, { name: 'sign', detail: true });
  // the pile-up at both ends (the road is closed), a few abandoned cars on the deck
  car(m, 560, -1790, z, 80, 'blue'); car(m, 660, -1740, z, 140, 'cream');
  obox(m, 1930, -1780, 100, -180, 180, -50, 50, z + 40, z + 168, { all: sw('white'), top: sw('chrome') }, { surface: 'metal', name: 'trailer', detail: true });
  car(m, 1820, -1810, z, 20, 'maroon');
  car(m, 1180, -1770, z, 175, 'green');
  car(m, 1420, -1730, z, 190, 'black');
  // tall highway lights
  for (const x of [880, 1440]) {
    pbox(m, x - 5, -1840, z, x + 5, -1830, z + 300, { all: sw('chrome') }, { name: 'pole', surface: 'metal', detail: true });
    pbox(m, x - 3, -1836, z + 294, x + 3, -1780, z + 300, { all: sw('chrome') }, { name: 'pole', surface: 'metal', detail: true });
    glowLamp(m, x, -1780, z + 292, 'down', 24, 14, 'sodium', [1.0, 0.66, 0.34], 0.9, 600);
  }
  // the off-ramp's lights and the barricade across Main Street's east end
  for (const y of [-1300, -800]) sodium(m, EAST - 16, y, Math.round(z * (y + 416) / (-1664 + 416)), 'w', 232, 72);
  for (const y of [-80, 0, 80]) pbox(m, EAST - 24, y - 30, 0, EAST - 8, y + 30, 36, { all: sw('white'), e: strip('picket', 16), w: strip('picket', 16) }, { name: 'barricade', detail: true });
}

// ------------------------------------------------------------------ trees

/** The auto mass's top at (x, y) (null: open floor). */
function massTop(m, x, y) {
  const G = m._grid, [bx0, by0] = m.bounds;
  const i = Math.floor((x - bx0) / 8), j = Math.floor((y - by0) / 8);
  if (i < 0 || j < 0 || i >= G.nx || j >= G.ny) return null;
  const k = j * G.nx + i;
  return G.covered[k] ? null : G.height[k];
}

function trees(m) {
  // the woods along the road west of the creek, and over the north road
  for (let y = -60; y < 1440; y += 170) {
    const t = massTop(m, -1924, y);
    pine(m, -1924 + (h01(y, 1) * 24 | 0), y, t ?? 0, 380 + h01(y, 2) * 120, 84, 3, h01(y, 3) * 3);
  }
  // the hills round the town: pines on the mass, silhouettes against the sky
  const [bx0, by0, bx1, by1] = m.bounds;
  const ring = [];
  for (let x = bx0 + 60; x < bx1; x += 190) ring.push([x + (h01(x, 1) * 50 | 0), by1 - 70], [x + (h01(x, 2) * 50 | 0), by0 + 70]);
  for (let y = by0 + 200; y < by1; y += 210) ring.push([bx0 + 70, y + (h01(y, 3) * 50 | 0)]);
  for (let y = 1300; y < by1; y += 260) ring.push([bx1 - 70, y]);
  for (const [x, y] of ring) {
    const t = massTop(m, x, y);
    if (t == null) continue;
    const north = y > by1 - 200;
    pine(m, x, y, t, (north ? 300 : 380) + h01(x, y) * (north ? 100 : 180), north ? 84 : 100, 2, h01(y, x) * 3, 5);
  }
  // the creek's east bank (Mill Road's verge) and the cemetery
  for (const y of [-900, -300, 300, 800, 1380]) pine(m, -1488, y, 8, 300 + h01(y, 11) * 80, 46, 3, h01(y, 12) * 3);
  // yards and the field
  for (const [x, y] of [[-1020, -1540], [-260, -1540], [400, -1540], [-1180, 1490], [-500, 1490], [-760, 1500]]) shadeTree(m, x, y, 8, 300 + h01(x, y) * 60, 100, h01(y, x) * 3);
  for (const [x, y] of [[360, 1200], [880, 1180], [440, 1480], [900, 1480]]) pine(m, x, y, 8, 340 + h01(x, y) * 60, 70, 3, h01(x, y) * 3);
  for (const [x, y] of [[-1100, 1140], [-420, 1130]]) bush(m, x, y, 8);
}

// ------------------------------------------------------------------ street lights

function streetLights(m) {
  // Main Street: both sidewalks, staggered (the square has its lanterns)
  for (const x of [-1184, -800, -200, 576, 960, 1344, 1700]) sodium(m, x, -168, 8, 'n', 232, 56);
  for (const x of [-992, -608, 704, 1248, 1600]) sodium(m, x, 168, 8, 's', 232, 56);
  // Mill Road (both sides), Church Street, School Street, Pine Street, Oak Lane, the truck stop
  for (const y of [-1056, -560, 400, 1240]) sodium(m, -1200, y, 8, 'w', 232, 56);
  for (const y of [-260, 760, 1400]) sodium(m, -1488, y, 8, 'e', 232, 56);
  for (const y of [-1000, -780]) sodium(m, -1488, y, 8, 'e', 232, 56);
  for (const x of [-960, -544, 400, 800]) sodium(m, x, 1056, 8, 's', 232, 56);
  sodium(m, -400, 800, 8, 'n', 232, 56);
  for (const y of [416, 864]) sodium(m, 1184, y, 8, 'w', 232, 56);
  sodium(m, 920, 512, 8, 'e', 232, 56);
  sodium(m, 496, -720, 0, 'w', 232, 56);
  for (const x of [-1040, -560, 0]) sodium(m, x, -1376, 8, 'n', 232, 56);
  sodium(m, 576, -1200, 0, 'w', 232, 56);
  sodium(m, 1600, -560, 0, 'n', 232, 56);
  // a nav seed on the hardware deck (also reached by the stairs) keeps the graph whole
  navSeed(m, -464, -384, HARDWARE.z);
}

// ------------------------------------------------------------------ street dressing

/** A fire hydrant (red, 24 high). */
function hydrant(m, x, y, z) {
  frustum(m, x, y, z, z + 20, 6, 5, 6, { all: sw('tail'), top: sw('tail') }, { name: 'hydrant', surface: 'metal', detail: true });
  frustum(m, x, y, z + 20, z + 26, 5, 2, 6, { all: sw('tail') }, { name: 'hydrant', surface: 'metal', detail: true });
}

/** A sandbag wall along x or y (40 high: anyone hops it), three courses. */
function sandbags(m, x0, y0, x1, y1, z) {
  const ax = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  for (let k = 0; k < 3; k++) {
    const i = k === 1 ? 4 : 0, zz = z + k * 13;
    if (ax) pbox(m, Math.min(x0, x1) + i, y0 - 12 + k * 2, zz, Math.max(x0, x1) - i, y0 + 12 - k * 2, zz + (k === 2 ? 14 : 13), { all: sw('cream'), top: sw('cream') }, { name: 'sandbag', surface: 'dirt', detail: true });
    else pbox(m, x0 - 12 + k * 2, Math.min(y0, y1) + i, zz, x0 + 12 - k * 2, Math.max(y0, y1) - i, zz + (k === 2 ? 14 : 13), { all: sw('cream'), top: sw('cream') }, { name: 'sandbag', surface: 'dirt', detail: true });
  }
}

/** A police sawhorse barricade (a striped board on two legs, 36 high) turned ang degrees. */
function sawhorse(m, x, y, z, ang) {
  obox(m, x, y, ang, -40, 40, -2, 2, z + 26, z + 36, { all: sw('white'), long: rg('hazard') }, { name: 'barricade', detail: true });
  for (const u of [-34, 34]) obox(m, x, y, ang, u - 2, u + 2, -10, 10, z, z + 26, { all: sw('white') }, { name: 'barricade', detail: true });
}

/** An awning over a shop front: a sloped canvas from the wall out over the sidewalk. */
function awning(m, face, c, u0, u1, zTop, depth, col) {
  const d = { n: 1, s: -1, e: 1, w: -1 }[face], zl = zTop - 22;
  const pts = [[c, zTop], [c, zTop - 4], [c + d * depth, zl - 4], [c + d * depth, zl]].map(([a, b]) => [a, b]);
  if (d < 0) pts.reverse();
  const axis = face === 'n' || face === 's' ? 'x' : 'y';
  pprism(m, axis, pts, u0, u1, { all: sw(col) }, { name: 'awning', detail: true });
  // a valance strip along the front edge
  onWall(m, face, c, u0, u1, zl - 12, zl, depth - 2, depth, { all: sw(col) }, { name: 'awning', detail: true });
}

/** Planks nailed over a window opening on a facade (boarded up). */
function boards(m, face, c, u, z, w = 44, h = 60) {
  for (const dz of [h * 0.17, h * 0.47, h * 0.77]) onWall(m, face, c, u - w / 2 - 4, u + w / 2 + 4, z + dz, z + dz + 10, 3, 5, { all: 'wood_dark' }, { name: 'boards', surface: 'wood', detail: true });
}

/** Overhead wires between consecutive points ([x, y, z]...), two strands. */
function wires(m, pts) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    for (const o of [-40, 40]) {
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
      const nx = -dy / l * o, ny = dx / l * o;
      painted(m, () => m.prism('z', [[a[0] + nx - dy / l, a[1] + ny + dx / l], [b[0] + nx - dy / l, b[1] + ny + dx / l], [b[0] + nx + dy / l, b[1] + ny - dx / l], [a[0] + nx + dy / l, a[1] + ny - dx / l]], a[2] - 1, a[2] + 1, { all: sw('black') }, { name: 'wire', detail: true }));
    }
  }
}

function dressing(m) {
  // --- Main Street: awnings, hydrants, a bus shelter by the square, a phone booth, newspaper boxes
  awning(m, 'n', -224, -600, -328, 126, 52, 'green');
  for (const [u0, u1] of [[-164, -76], [24, 104]]) awning(m, 'n', -224, u0, u1, 120, 40, 'barn');
  for (const [x, y] of [[-1200, -136], [-300, 140], [540, -140], [1180, 140], [-1180, 760], [930, 1060], [-560, -1376]]) hydrant(m, x, y, 8);
  // the bus shelter on the square's Main Street side
  glass(m, 300, 196, 8, 420, 200, 104);
  for (const x of [300, 416]) pbox(m, x, 136, 8, x + 4, 200, 108, { all: sw('chrome') }, { name: 'shelter', detail: true });
  pbox(m, 292, 128, 108, 428, 206, 114, { all: sw('chrome'), top: sw('black') }, { name: 'shelter', detail: true });
  pbox(m, 312, 176, 8, 404, 194, 24, { all: 'wood_dark' }, { name: 'shelter', detail: true });
  glowLamp(m, 360, 166, 106, 'down', 32, 8, 'head', [0.85, 0.9, 1.0], 0.45, 220);
  // a phone booth at the gas station's corner, newspaper boxes outside the diner and the post office
  glass(m, 488, -250, 0, 520, -218, 96);
  pbox(m, 486, -252, 96, 522, -216, 104, { all: sw('chrome') }, { name: 'booth', detail: true });
  glowLamp(m, 504, -234, 94, 'down', 16, 16, 'head', [0.85, 0.9, 1.0], 0.4, 160);
  for (const [x, y, c] of [[-700, -196, 'navy'], [-670, -196, 'tail'], [-560, 222, 'yellow']]) pbox(m, x - 9, y - 7, 8, x + 9, y + 7, 40, { all: sw(c), top: sw('black') }, { name: 'newsbox', surface: 'metal', detail: true });
  // trash cans along the sidewalks
  for (const [x, y] of [[-1100, 190], [-440, -190], [180, 190], [640, -190], [1400, 190], [-420, 760]]) drum(m, x, y, 8, 'green');
  // --- the last stand at the police station: sandbags round the front door, sawhorses on the street
  sandbags(m, 470, 400, 470, 440, 8);
  sandbags(m, 470, 488, 470, 528, 8);
  sandbags(m, 500, 380, 540, 380, 8);
  sandbags(m, 500, 548, 540, 548, 8);
  for (const [x, y, a] of [[1000, -60, 90], [1100, 40, 90], [-1360, 60, 90], [-1320, -40, 70], [140, 980, 0], [700, 920, 10]]) sawhorse(m, x, y, 0, a);
  // abandoned cars in the streets (one with its lights on), a crashed pickup at the corner of Mill Road
  car(m, 140, 40, 0, 172, 'blue');
  car(m, -540, -40, 0, 8, 'maroon', { lights: true });
  car(m, 1300, -60, 0, 195, 'white');
  car(m, -1340, 420, 0, 96, 'green', { pickup: true });
  car(m, -1350, -760, 0, 260, 'cream');
  car(m, 240, 936, 0, 176, 'black');
  car(m, 1050, 640, 0, 92, 'maroon');
  car(m, -1320, 1180, 0, 274, 'blue', { pickup: true });
  car(m, -300, -1250, 0, 4, 'cream');
  car(m, 1000, -890, 0, 4, 'white');
  // boarded-up windows on a few facades
  boards(m, 'e', -832, 352, 48, 36, 64);
  boards(m, 's', 960, 1384, 40, 40, 60);
  boards(m, 's', 960, 1560, 136, 40, 60);
  // overhead wires along the alley and the woods road
  wires(m, [[-1000, -846, 258], [-560, -846, 258], [-40, -846, 258]]);
  wires(m, [[-1840, 30, 268], [-1840, 420, 268], [-1840, 1060, 268]]);
  // the town sign by the bridge (replacing nothing: the woods side), the highway's exit gantry sign
  // (see creekAndBridge / highway)
}

// ------------------------------------------------------------------ finishing touches

function extras(m) {
  // the church: a cross on the spire, a lit rose window over the door, lamps by the front steps,
  // windows either side of the tower on the nave's front
  const T = TOWER, cy = (T.y0 - 16 + T.y1 + 16) / 2, top = 460 + 126 + 400;
  pbox(m, -3, cy - 3, top - 4, 3, cy + 3, top + 44, { all: sw('white') }, { name: 'cross', detail: true });
  pbox(m, -3, cy - 16, top + 22, 3, cy + 16, top + 28, { all: sw('white') }, { name: 'cross', detail: true });
  windowOn(m, 's', T.y0 - 16, 0, 260, 44, 64, { lit: 'warm', spill: false });
  for (const x of [-136, 136]) windowOn(m, 's', NAVE.y0 - 16, x, NAVE.z + 60, 36, 96, { lit: false });
  for (const x of [-84, 84]) glowLamp(m, x, T.y0 - 16, 140, 's', 12, 16, 'sodium', [1.0, 0.76, 0.48], 0.6, 340);
  // the church field: the helicopter landing zone (an H in stones, two floodlight poles)
  for (const [x0, y0, x1, y1] of [[600, 1240, 616, 1360], [664, 1240, 680, 1360], [616, 1292, 664, 1308]]) pbox(m, x0, y0, 6, x1, y1, 10, { all: sw('white') }, { name: 'lz', detail: true });
  for (const [x, y] of [[420, 1180], [880, 1440]]) {
    pbox(m, x - 5, y - 5, 8, x + 5, y + 5, 280, { all: sw('chrome') }, { name: 'mast', surface: 'metal', detail: true });
    pbox(m, x - 24, y - 5, 272, x + 24, y + 5, 280, { all: sw('chrome') }, { name: 'mast', surface: 'metal', detail: true });
    glowLamp(m, x + 18, y, 266, 'down', 24, 12, 'head', [0.85, 0.9, 1.0], 0.95, 600);
  }
  // Elm Lane's back yards and the cemetery gate: porch lights at the back doors
  glowLamp(m, -840, HOUSE_ELM.y1 + 16, HOUSE_ELM.z + 100, 'n', 12, 14, 'sodium', [1.0, 0.76, 0.48], 0.6, 360);
  glowLamp(m, -512, 1440, 108, 'n', 12, 14, 'sodium', [1.0, 0.76, 0.48], 0.6, 360);
  glowLamp(m, 576, 1680, 120, 's', 12, 14, 'sodium', [1.0, 0.76, 0.48], 0.55, 320); // over the mausoleum door
  // house dressing: mailboxes on posts by the walks, path slabs to the porches
  for (const [x, y] of [[-940, 1100], [-560, 1100], [-1100, -1400], [-680, -1400], [-300, -1400], [120, -1400]]) {
    pbox(m, x - 2, y - 2, 8, x + 2, y + 2, 28, { all: 'wood_dark' }, { name: 'mailbox', detail: true });
    pbox(m, x - 6, y - 9, 28, x + 6, y + 9, 40, { all: sw('black') }, { name: 'mailbox', surface: 'metal', detail: true });
  }
  for (const [x, y0, y1] of [[-904, 1088, 1128], [-512, 1088, 1152]]) pbox(m, x - 20, y0, 7, x + 20, y1, 9, { all: 'sidewalk' }, { name: 'path', detail: true });
  boards(m, 'w', -384, 1300, 52, 36, 52);
  boards(m, 'e', 288, -1528, 52, 36, 52);
  // the rail yard: a signal on a mast with a red lamp at the throat, a crossing gate by School Street
  pbox(m, 1104, 1210, 0, 1112, 1218, 180, { all: sw('black') }, { name: 'signal', surface: 'metal', detail: true });
  pbox(m, 1096, 1218, 150, 1120, 1226, 186, { all: sw('black') }, { name: 'signal', detail: true });
  glowLamp(m, 1108, 1226, 174, 'n', 8, 8, 'tail', [1.0, 0.2, 0.15], 0.5, 220);
  obox(m, 1000, 1200, 0, 0, 150, -3, 3, 30, 36, { all: rg('hazard') }, { name: 'gate', detail: true });
  pbox(m, 990, 1192, 0, 1000, 1208, 40, { all: sw('white') }, { name: 'gate', detail: true });
  // pines on the highway embankment and the bank behind the truck stop
  for (const [x, y] of [[760, -1440], [980, -1280], [1220, -1500], [1460, -1300], [1640, -1460], [900, -1080], [1300, -1100]]) {
    const t = massTop(m, x, y);
    if (t != null) pine(m, x, y, t, 300 + h01(x, y) * 140, 80, 3, h01(y, x) * 3);
  }
  // dark corners: the rail yard's west end, the bank alley, the bridge's west portal, the shops'
  // back yards, the side yards on Oak and Elm Lanes
  sodium(m, 1040, 1660, 0, 'e', 232, 56);
  glowLamp(m, -832, 400, 120, 'e', 12, 14, 'sodium', [1.0, 0.76, 0.48], 0.6, 360);
  glowLamp(m, CREEK.x0, 160, 120, 'w', 12, 14, 'sodium', [1.0, 0.72, 0.42], 0.7, 420);
  glowLamp(m, 48, -560, 112, 's', 12, 14, 'head', [0.9, 0.92, 1.0], 0.6, 360);
  utilityPole(m, -200, -700, 8, 260, { light: 'w', radius: 420, intensity: 0.6 });
  for (const [x, f] of [[-928, 'e'], [32, 'w'], [-384, 'w']]) glowLamp(m, x, -1540, 108, f, 12, 14, 'sodium', [1.0, 0.76, 0.48], 0.55, 340);
  glowLamp(m, -640, 1380, 108, 'w', 12, 14, 'sodium', [1.0, 0.76, 0.48], 0.55, 340);
  // the square: two more lanterns under the trees on the west lawn
  for (const [x, y] of [[-300, 520], [330, 700]]) lantern(m, x, y, 8, 104, { intensity: 0.6, radius: 300 });
}
