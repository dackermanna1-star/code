// Fort Ember (zm_fort_ember): everything outside the walls - the gate plaza, the apron, the
// rims, the tunnel mouths, the wadi, the canyon and its cliff path, the plain with the airstrip
// and the crashed supply plane, the road and the wrecked convoy, the ruined village. The floors
// come from the areas in zm_fort_ember.js; this adds rock, buildings, wrecks, props and lights.
//
// Fairness: every roof here is clipped or reached by stairs; ruined walls are either low (32:
// hop them) or tall (96+: nobody gets up there); boulders are low, or tall with a hull top.
import { wall } from '../kit.js';
import {
  T, FIRE, prop, beam, brazier, torch, lantern, sandbags, rubble, deadTree, clipRoof,
  truck, jeep, hull, boulder, shearedBox, doorFrame, parapet, flame, paint, sign, cellSpec, signpost,
} from './zm_fort_ember_parts.js';

const LOW = -256, VIL = -128, TUN = -160;

export function buildLand(m) {
  cliffs(m);
  mesaProps(m);
  tunnelMouths(m);
  wadi(m);
  canyon(m);
  plain(m);
  road(m);
  village(m);
}

/** A seeded random stream. */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ------------------------------------------------------------------ cliffs
/**
 * Irregular rock facets along a straight cliff face so it doesn't read as a box: convex chunks
 * sticking out 8..56 from the face, their tops flush with the floor above (topTex) or, for the
 * outer walls nobody stands on, at varied heights. axis: the face's direction; face: its
 * coordinate; out: +1 / -1 toward the low side; a0..a1: the run; zTop / zBot.
 */
function facets(m, axis, a0, a1, face, out, zTop, zBot, seed, o = {}) {
  const r = rng(seed);
  let u = a0;
  while (u < a1 - 16) {
    const u1 = Math.min(a1, u + 56 + r() * 88);
    const d0 = 6 + r() * 26, d1 = 6 + r() * 26, um = u + (u1 - u) * (0.3 + r() * 0.4);
    const dm = Math.max(d0, d1) + 8 + r() * 30;
    const P = (uu, d) => (axis === 'x' ? [uu, face + out * d] : [face + out * d, uu]);
    const pts = [P(u, 0), P(u1, 0), P(u1, d1), P(um, dm), P(u, d0)];
    if (out * (axis === 'x' ? -1 : 1) < 0) pts.reverse();
    const top = o.vary ? zTop - r() * o.vary : zTop;
    m.prism('z', pts, zBot, top, { all: T.rock, top: o.topTex || T.sand }, { name: 'facet' });
    if (o.vary) { // (a ledge on an outer wall: clipped, nobody jumps across onto it)
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      clipRoof(m, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), top);
    }
    u = u1;
  }
}

/**
 * Tall crags on an unreachable rim (outer walls) that break the skyline: weathered pinnacles -
 * a wide jagged foot, a waist and a broken, leaning top (one convex hull each) - with a smaller
 * one beside most of them, on the side away from the play space.
 */
function crags(m, list) {
  const B = [-1792, -1792, 2048, 1472];
  const pinnacle = (x, y, z, r, h, rr) => {
    const pts = [], lx = (rr() - 0.5) * r * 0.5, ly = (rr() - 0.5) * r * 0.5;
    for (const [f, k, n] of [[0, 1, 7], [0.4, 0.78, 6], [0.8, 0.46, 5]]) {
      const a0 = rr() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * Math.PI * 2 + rr() * 0.5, d = r * k * (0.75 + rr() * 0.4);
        pts.push([x + lx * f + Math.cos(a) * d, y + ly * f + Math.sin(a) * d, z - 32 + (h + 32) * f + (f ? rr() * 24 : 0)]);
      }
    }
    pts.push([x + lx + (rr() - 0.5) * r * 0.3, y + ly + (rr() - 0.5) * r * 0.3, z + h + 16 + rr() * 40]);
    hull(m, pts, T.rock, { name: 'rock' });
  };
  for (const [x, y, z, r, h, seed] of list) {
    const rr = rng(seed);
    pinnacle(x, y, z, r, h, rr);
    if (rr() < 0.25) continue;
    // a smaller one outboard (away from the map's middle, kept in bounds)
    const a = Math.atan2(y - 0, x - 0) + (rr() - 0.5) * 1.2, d = r * (1.1 + rr() * 0.3);
    const sx = Math.min(B[2] - r, Math.max(B[0] + r, x + Math.cos(a) * d)), sy = Math.min(B[3] - r, Math.max(B[1] + r, y + Math.sin(a) * d));
    pinnacle(sx, sy, z, r * 0.6, h * (0.4 + rr() * 0.25), rr);
  }
}

function cliffs(m) {
  // the mesa (0) above the plain, the wadi, the canyon (-256) and the village (-128)
  facets(m, 'x', -384, 768, -960, -1, 0, LOW, 11); // south face over the plain
  facets(m, 'y', -960, -608, -960, -1, 0, LOW, 12); // west face over the wadi
  facets(m, 'y', 96, 256, -960, -1, 0, LOW, 13);
  facets(m, 'x', -960, -192, 896, 1, 0, LOW, 14); // north face over the canyon
  facets(m, 'x', 704, 960, 896, 1, 0, LOW, 15);
  facets(m, 'y', -832, 64, 960, 1, 0, VIL, 16); // east face over the village
  facets(m, 'y', 192, 896, 960, 1, 0, VIL, 17);
  facets(m, 'y', -352, 96, -1088, -1, TUN, LOW, 18); // the cliff ledge's face
  // the outer walls of the low ground (auto mass, clipped above): ragged faces, varied tops
  facets(m, 'y', -960, 896, -1408, 1, 96, LOW, 21, { vary: 160, topTex: T.rock }); // wadi, west
  facets(m, 'x', -1408, 1472, 1216, -1, 192, LOW, 22, { vary: 220, topTex: T.rock }); // canyon, north
  facets(m, 'x', -1408, 768, -1536, 1, -144, LOW, 23, { topTex: T.rock }); // plain, south and west
  facets(m, 'y', -1536, -960, -1408, 1, -144, LOW, 26, { topTex: T.rock });
  facets(m, 'y', -832, 1216, 1792, -1, 96, VIL, 24, { vary: 120, topTex: T.rock }); // village, east
  facets(m, 'x', 1472, 1792, 1216, -1, 192, VIL, 25, { vary: 200, topTex: T.rock });
  crags(m, [
    [-1520, -700, 96, 70, 220, 31], [-1480, 120, 96, 60, 300, 32], [-1560, 640, 96, 90, 260, 33],
    [-900, 1330, 192, 80, 260, 34], [-200, 1300, 192, 70, 200, 35], [520, 1340, 192, 90, 320, 36], [1240, 1300, 192, 60, 240, 37],
    [1880, -500, 96, 70, 240, 38], [1900, 400, 96, 80, 300, 39], [1700, 1360, 192, 70, 200, 40],
    [-1100, -1640, -144, 70, 200, 41], [-300, -1660, -144, 80, 260, 42], [500, -1640, -144, 60, 180, 43], [-1560, -1300, -144, 70, 220, 44],
    [-700, -1690, -144, 60, 170, 45], [120, -1700, -144, 70, 230, 46], [-1620, -1080, -144, 60, 190, 47], [960, -1420, 64, 70, 200, 48],
  ]);
}

// ------------------------------------------------------------------ the mesa top
function mesaProps(m) {
  // ---- the gate plaza: a checkpoint at the head of the road, a flagpole, a trough, wrecks
  sandbags(m, 760, -800, 784, -704, 0);
  sandbags(m, 760, -704, 880, -680, 0);
  sandbags(m, 856, -800, 880, -704, 0);
  prop(m, 700, -952, 0, 712, -940, 36, T.timber, { surface: 'wood' }); // the barrier: post, pole
  prop(m, 712, -950, 30, 940, -942, 36, { all: paint('yellow'), s: cellSpec('hazard', 's', 712, 940, 30, 36), n: cellSpec('hazard', 'n', 712, 940, 30, 36) }, { surface: 'wood', contents: 0 });
  prop(m, 930, -952, 0, 942, -940, 32, T.timber, { surface: 'wood' });
  brazier(m, 690, -880, 0, { radius: 360 });
  brazier(m, -280, -700, 0, { radius: 380 });
  brazier(m, 280, -700, 0, { radius: 380 });
  // the last barricade outside the gate: sandbag walls either side of the approach (36: hop
  // them), a spiked timber cheval on the outside, a painted warning; the name over the arch
  sandbags(m, -236, -708, -136, -684, 0);
  sandbags(m, 136, -708, 236, -684, 0);
  sign(m, 'keepout', 's', -708, -230, -142, 7, 29);
  for (const cx of [-186, 186]) {
    prop(m, cx - 56, -736, 0, cx + 56, -726, 10, T.timber, { surface: 'wood', name: 'cheval' });
    for (let k = -2; k <= 2; k++) {
      const x = cx + k * 24, s = k & 1 ? 1 : -1;
      shearedBox(m, x, -731 - s * 30, 2, x, -731 + s * 34, 52, 2.5, T.timber, { detail: true, contents: 0, surface: 'wood', name: 'stake' });
    }
  }
  sign(m, 'fort', 's', -640, -110, 110, 180, 214, { depth: 3 });
  // survivors' paint on the south wall, for anyone flying over the plain
  sign(m, 'help', 's', -576, -560, -300, 88, 153, { decal: true });
  // the way out: a signpost by the gate
  signpost(m, ['airstrip', 'village'], -200, -744, 0, 'n');
  // the flag: a tall pole and a torn red flag (no collision up there)
  prop(m, -404, -684, 0, -396, -676, 420, T.iron, { surface: 'metal' });
  prop(m, -396, -681, 330, -300, -679, 400, T.canvas, { contents: 0 });
  // a stone water trough (32) and a burnt-out jeep, a broken cart, crates
  m.box(-640, -820, 0, -512, -780, 32, { all: T.stone, top: T.stone }, { name: 'trough' });
  jeep(m, 360, -820, 0, 'x', 1);
  cart(m, -820, -880, 0);
  m.crate(-200, -880, 0, 40, 40, 40);
  m.crate(-160, -884, 0, 32);
  m.crate(-196, -880, 40, 32, 32, 28);
  m.crate(560, -700, 0, 32);
  for (const [x, y] of [[-560, -900], [-532, -910], [600, -900]]) barrelAt(m, x, y, 0);
  // ---- the west apron: the bunker's outer ramp (sandbagged), crates, a lookout post
  sandbags(m, -920, 352, -896, 400, 0);
  sandbags(m, -768, 352, -744, 400, 0);
  for (const x of [-904, -772]) prop(m, x, 120, TUN, x + 12, 132, -8, T.timber, { surface: 'wood' });
  beam(m, -904, 118, -20, -760, 134, -8);
  m.crate(-740, -480, 0, 40);
  m.crate(-740, -440, 0, 32);
  cart(m, -880, 560, 0, 'y');
  torch(m, -720, -200, 120, 'w');
  torch(m, -720, 400, 120, 'w');
  // ---- the north rim: the postern's door, a cairn, posts and a rope along the cliff path's head
  doorFrame(m, 'x', -144, 96, 690, 708, 0, 112);
  torch(m, -210, 720, 100, 'n');
  for (const [x, y] of [[-420, 820], [600, 800]]) rubble(m, x, y, 0, 40, x * 7 + y);
  m.prism('z', octo(300, 840, 20), 0, 28, { all: T.stone }, { name: 'cairn' });
  for (let x = -176; x <= 640; x += 96) prop(m, x, 900, -60 - (x + 192) / 896 * 196, x + 8, 908, -24 - (x + 192) / 896 * 196, T.timber, { surface: 'wood' });
  // ---- the east strip: a dead tree, crates by the breach, posts at the village steps' head
  deadTree(m, 860, 560, 0, 180, 51);
  deadTree(m, 820, -420, 0, 150, 52);
  m.crate(780, 240, 0, 40);
  m.crate(780, 500, 0, 32);
  for (const y of [56, 200]) prop(m, 952, y - 4, 0, 960, y + 4, 96, T.timber, { surface: 'wood' });
  torch(m, 720, 120, 120, 'e');
  torch(m, 720, -320, 120, 'e');
}

/** A broken hand cart: a bed 32 high on one wheel, the shafts on the ground. */
function cart(m, x, y, z, axis = 'x') {
  const A = (u0, v0, u1, v1, z0, z1, tex) => (axis === 'x' ? prop(m, x + u0, y + v0, z + z0, x + u1, y + v1, z + z1, tex, { surface: 'wood' }) : prop(m, x + v0, y + u0, z + z0, x + v1, y + u1, z + z1, tex, { surface: 'wood' }));
  A(-48, -32, 48, 32, 16, 30, T.planks);
  A(-48, -32, 48, -28, 30, 44, T.timber);
  A(-48, 28, 48, 32, 30, 44, T.timber);
  A(-12, 32, 12, 38, 0, 32, T.timber);
  A(48, -24, 120, -18, 0, 8, T.timber);
  A(48, 18, 120, 24, 0, 8, T.timber);
}

function barrelAt(m, x, y, z, tex = T.iron) {
  return m.prism('z', octo(x, y, 13), z, z + 40, { all: tex }, { surface: 'metal', name: 'barrel' });
}

/** A burning oil drum (40: hop it): a fire somebody kept going down here, glowing coals and flames. */
export function fireBarrel(m, x, y, z, o = {}) {
  m.prism('z', octo(x, y, 14), z, z + 40, { all: T.iron, top: paint('soot') }, { surface: 'metal', name: 'barrel' });
  const b = m.prism('z', octo(x, y, 11), z + 40, z + 42, { all: T.glow }, { detail: true, contents: 0, name: 'coals' });
  b.fullbright = true; b.castShadow = false;
  flame(m, x, y, z + 42, o.flame ?? 30, 9);
  m.light(x, y, z + 92, FIRE, o.intensity ?? 0.95, o.radius ?? 400);
}

function octo(x, y, r) {
  const pts = [];
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  return pts;
}

// ------------------------------------------------------------------ the tunnel mouths
function tunnelMouths(m) {
  // timber portals in the cliff face (the openings are TUN..-16)
  for (const [y0, y1] of [[-32, 96], [-352, -224]]) {
    prop(m, -976, y0, TUN, -960, y0 + 12, -16, T.timber, { surface: 'wood' });
    prop(m, -976, y1 - 12, TUN, -960, y1, -16, T.timber, { surface: 'wood' });
    prop(m, -980, y0 - 8, -30, -956, y1 + 8, -14, T.timber, { surface: 'wood' });
  }
  // the mines were boarded up once: the boards over the portals are torn down to the top one
  sign(m, 'sealed', 'w', -980, -6, 70, -62, -36, { depth: 3 });
  sign(m, 'keepout', 'w', -980, -334, -242, -60, -38, { depth: 3 });
  for (const [y0, y1, z0, z1] of [[-24, 40, -70, -100], [-300, -250, -66, -112]]) shearedBox(m, -986, y0, z0, -986, y1, z1, 3, T.planks, { detail: true, contents: 0, surface: 'wood', name: 'board' });
  rubble(m, -1040, -120, TUN, 40, 61, T.rock, 14);
  m.crate(-1060, 40, TUN, 32);
  lantern(m, -1000, 32, -30, { radius: 300 });
  lantern(m, -1000, -288, -30, { radius: 280 });
  // rope rail posts along the ledge's lip (thin: walk between them)
  for (let y = -320; y <= 64; y += 96) prop(m, -1084, y, TUN, -1078, y + 6, TUN + 40, T.timber, { surface: 'wood' });
}

// ------------------------------------------------------------------ the wadi
function wadi(m) {
  // the dry riverbed: a meandering band of gravel down the middle (coplanar overlay)
  let prev = null;
  for (let y = -960; y <= 896; y += 64) {
    const cx = -1184 + Math.sin((y + 960) / 280) * 90, w = 56 + Math.sin(y / 170) * 16;
    if (prev) m.prism('z', [[prev[0] - prev[1], y - 64], [prev[0] + prev[1], y - 64], [cx + w, y], [cx - w, y]], LOW - 8, LOW, { all: null, top: T.hardpan }, { name: 'riverbed' });
    prev = [cx, w];
  }
  // boulders (low: hop them; or big: 80+, no perch) and dead trees
  for (const [x, y, rx, ry, rz, s] of [
    [-1330, -820, 70, 50, 120, 71], [-1060, -620, 40, 34, 30, 72], [-1340, -300, 60, 80, 140, 73], [-1230, -120, 36, 30, 28, 74],
    [-1050, 320, 50, 40, 120, 75], [-1350, 420, 80, 60, 160, 76], [-1190, 560, 30, 30, 26, 77], [-1300, 820, 60, 50, 120, 78],
  ]) boulder(m, x, y, LOW, rx, ry, rz, s);
  deadTree(m, -1120, -420, LOW, 170, 81);
  deadTree(m, -1290, 140, LOW, 200, 82);
  deadTree(m, -1100, 720, LOW, 150, 83);
  // a bleached cart wreck and bones of a camp: a ring of stones, a dead fire
  cart(m, -1240, -560, LOW, 'y');
  m.prism('z', octo(-1180, 280, 28), LOW, LOW + 8, { all: T.stone }, { name: 'firepit' });
  brazier(m, -1260, -40, LOW, { radius: 420, intensity: 0.9 }); // a scavengers' fire
  fireBarrel(m, -1110, -800, LOW);
  fireBarrel(m, -1290, 620, LOW);
}

// ------------------------------------------------------------------ the canyon and the cliff path
function canyon(m) {
  for (const [x, y, rx, ry, rz, s] of [
    [-1300, 1100, 70, 60, 130, 91], [-940, 1150, 40, 36, 32, 92], [-600, 1080, 80, 60, 150, 93], [-380, 1160, 36, 30, 28, 94],
    [260, 1170, 60, 40, 120, 95], [820, 1120, 40, 40, 30, 96], [1060, 1150, 70, 60, 140, 97],
  ]) boulder(m, x, y, LOW, rx, ry, rz, s);
  deadTree(m, -880, 960, LOW, 180, 101);
  deadTree(m, 960, 1000, LOW, 160, 102);
  // old mine rails along the canyon floor and a tipped ore cart (40: hop it)
  for (const y of [1040, 1072]) prop(m, -1100, y, LOW, -300, y + 4, LOW + 4, T.iron, { surface: 'metal' });
  for (let x = -1090; x < -300; x += 48) prop(m, x, 1030, LOW, x + 12, 1086, LOW + 2, T.timber);
  prop(m, -1020, 1032, LOW, -956, 1080, LOW + 40, { all: T.iron, top: T.wreck }, { surface: 'metal', name: 'orecart' });
  // the cliff path's lip: low timber posts and a rope (no collision)
  for (let x = -128; x <= 640; x += 128) {
    const z = (-192 - x) / 896 * 256; // the ramp's height there (0 at x -192, -256 at x 704)
    prop(m, x, 1016, z, x + 8, 1024, z + 44, T.timber, { surface: 'wood' });
  }
  torch(m, 300, 900, -40, 'n', { radius: 300 });
  brazier(m, 640, 1140, LOW, { radius: 420, intensity: 0.9 });
  fireBarrel(m, -820, 1120, LOW);
  fireBarrel(m, 60, 1150, LOW);
}

// ------------------------------------------------------------------ the plain, the airstrip, the crash
function plain(m) {
  // the airstrip: hardpan overlay with a dashed centre line and threshold bars (coplanar)
  m.box(-1280, -1440, LOW - 8, 512, -1216, LOW, { all: null, top: T.hardpan }, { name: 'airstrip' });
  for (let x = -1120; x < 400; x += 192) m.box(x, -1332, LOW - 8, x + 96, -1324, LOW, { all: null, top: paint('white') }, { name: 'marking' });
  for (const x0 of [-1264, 432]) for (let y = -1424; y < -1232; y += 32) m.box(x0, y, LOW - 8, x0 + 64, y + 14, LOW, { all: null, top: paint('white') }, { name: 'marking' });
  // fires along the strip: the last crew's burning drums (light down in the mesa's shadow)
  fireBarrel(m, -560, -1170, LOW);
  fireBarrel(m, 330, -1040, LOW);
  fireBarrel(m, -380, -1480, LOW, { radius: 360 });
  // the control hut against the cliff (two doors, a window; its roof clipped)
  hut(m);
  // a windsock on a pole
  prop(m, 196, -1112, LOW, 204, -1104, LOW + 120, T.iron, { surface: 'metal' });
  prop(m, 196, -1112, LOW + 120, 204, -1104, LOW + 224, T.iron, { contents: 0 });
  hull(m, [[204, -1108, LOW + 220], [204, -1120, LOW + 208], [204, -1096, LOW + 208], [204, -1108, LOW + 196], [290, -1108, LOW + 200]], T.canvas, { contents: 0, name: 'windsock' });
  // a burnt fuel bowser and drums by the strip
  truck(m, 120, -1180, LOW, 'x', 1, { tarp: false, len: 200 });
  for (const [x, y] of [[-20, -1060], [8, -1070], [-8, -1040], [300, -1010]]) barrelAt(m, x, y, LOW);
  // the crashed supply plane at the strip's west end
  plane(m);
  for (const [x, y, rx, ry, rz, s] of [[-700, -1500, 60, 40, 120, 111], [-200, -1490, 36, 30, 30, 112], [400, -1500, 70, 50, 130, 113], [640, -1180, 40, 36, 32, 114]]) boulder(m, x, y, LOW, rx, ry, rz, s);
  deadTree(m, 40, -1480, LOW, 140, 115);
}

function hut(m) {
  const x0 = -224, x1 = -32, y0 = -1112, y1 = -976, z = LOW, h = 128;
  wall(m, 'x', x0 - 16, x1 + 16, y0 - 16, y0, z, z + h, { all: T.iron, n: T.planks }, [{ c: -128, w: 64, z0: z + 36, z1: z + 112 }]);
  wall(m, 'x', x0 - 16, x1 + 16, y1, y1 + 16, z, z + h, { all: T.iron, s: T.planks }, []);
  wall(m, 'y', y0, y1, x0 - 16, x0, z, z + h, { all: T.iron, e: T.planks }, [{ c: -1040, w: 80 }]);
  wall(m, 'y', y0, y1, x1, x1 + 16, z, z + h, { all: T.iron, w: T.planks }, [{ c: -1040, w: 80 }]);
  m.prism('x', [[y0 - 32, z + h], [y1 + 16, z + h], [y1 + 16, z + h + 24], [y0 - 32, z + h + 8]], x0 - 28, x1 + 28, { all: T.iron, bottom: T.planks }, { name: 'roof' });
  clipRoof(m, x0 - 28, y0 - 32, x1 + 28, y1 + 16, z + h);
  doorFrame(m, 'y', -1040, 80, x0 - 16, x0, z, 112);
  doorFrame(m, 'y', -1040, 80, x1, x1 + 16, z, 112);
  prop(m, x0 + 8, y1 - 40, z, x0 + 104, y1, z + 30, T.planks, { surface: 'wood' }); // radio desk
  prop(m, x0 + 24, y1 - 32, z + 30, x0 + 64, y1 - 8, z + 50, T.iron, { surface: 'metal', contents: 0 });
  prop(m, x1 - 40, y0, z, x1, y0 + 72, z + 20, { all: T.timber, top: T.canvas }, { surface: 'wood' }); // cot
  lantern(m, -128, -1044, z + h - 4, { radius: 280 });
  // the aerial (thin, no collision above the roof)
  prop(m, -60, -990, z + h + 16, -56, -986, z + h + 180, T.iron, { contents: 0 });
}

/** The crashed supply plane: fuselage broken in three, a wing torn off, the tail up, cargo spilled. */
function plane(m) {
  const z = LOW;
  const hex = (x, y, zc, r) => {
    const pts = [];
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; pts.push([x, y + Math.cos(a) * r, zc + Math.sin(a) * r]); }
    return pts;
  };
  // the centre section (hexagon: flat top 104 up, steep upper sides - no perch)
  m.prism('x', hex(0, -1300, z + 50, 60).map(([, yy, zz]) => [yy, zz]), -1290, -1150, { all: T.wreck }, { surface: 'metal', name: 'fuselage' });
  // the nose: torn off, lying askew in front, crumpled and half buried in the sand
  hull(m, [...hex(-1300, -1330, z + 2, 38), ...hex(-1400, -1360, z - 6, 24)], T.wreck, { surface: 'metal', name: 'nose' }); // (crumpled, half buried: 40 at most)
  // the tail section, tilted up, and its fin
  hull(m, [...hex(-1140, -1296, z + 52, 56), ...hex(-1010, -1286, z + 96, 24)], T.wreck, { surface: 'metal', name: 'tail' });
  hull(m, [[-1060, -1290, z + 110], [-1060, -1282, z + 110], [-1000, -1290, z + 112], [-1000, -1282, z + 112], [-990, -1290, z + 200], [-990, -1282, z + 200], [-1030, -1290, z + 196], [-1030, -1282, z + 196]], T.wreck, { surface: 'metal', name: 'fin' });
  prop(m, -1050, -1360, z + 100, -1000, -1220, z + 106, T.wreck, { surface: 'metal' }); // tailplane
  // the south wing, still attached: a 10-thick slab 26..36 up (hop on; the hull's top is 64+ over it)
  hull(m, [[-1250, -1350, z + 26], [-1180, -1350, z + 26], [-1250, -1350, z + 36], [-1180, -1350, z + 36], [-1236, -1470, z + 22], [-1200, -1470, z + 22], [-1236, -1470, z + 30], [-1200, -1470, z + 30]], T.wreck, { surface: 'metal', name: 'wing' });
  m.prism('x', octo(0, 0, 16).map(([a, b]) => [-1420 + a, z + 16 + b]), -1250, -1180, { all: T.wreck }, { surface: 'metal', name: 'engine' });
  // a bent propeller on it
  for (const [dy, dz] of [[0, 34], [30, -16], [-30, -16]]) shearedBox(m, -1256, -1420, z + 16, -1256 + 4, -1420 + dy, z + 16 + dz + 24, 3, T.iron, { detail: true, contents: 0, name: 'prop' });
  // the north wing, torn off and lying on its engine: a ramp of wreckage up to 38 (walk it)
  hull(m, [[-1180, -1210, z], [-1100, -1210, z], [-1180, -1210, z + 8], [-1100, -1210, z + 8], [-1240, -980, z + 30], [-1170, -980, z + 30], [-1240, -980, z + 38], [-1170, -980, z + 38]], T.wreck, { surface: 'metal', name: 'wing' });
  m.prism('y', octo(0, 0, 18).map(([a, b]) => [-1200 + a, z + 18 + b]), -1060, -990, { all: T.wreck }, { surface: 'metal', name: 'engine' });
  // spilled cargo: crates (32/40) and a sack pile
  for (const [x, y, s] of [[-960, -1180, 40], [-916, -1150, 32], [-880, -1210, 32], [-1000, -1140, 40], [-850, -1150, 32]]) m.crate(x, y, z, s, s, s, s === 40 ? 'crate_green' : 'crate');
  for (const [x, y] of [[-940, -1100], [-918, -1080], [-948, -1076]]) m.box(x - 14, y - 12, z, x + 14, y + 12, z + 22, { all: T.bags }, { detail: true, surface: 'dirt', name: 'sack' });
  rubble(m, -1340, -1220, z, 60, 121, T.wreck);
  rubble(m, -1100, -1420, z, 50, 122, T.wreck);
  // still smouldering inside
  flame(m, -1220, -1300, z + 8, 28, 12);
  m.light(-1220, -1250, z + 40, FIRE, 1.0, 420);
}

// ------------------------------------------------------------------ the road and the convoy
function road(m) {
  // a kerb along the upper road's outer edge (16: a step) and white-tipped posts
  m.prism('y', [[960, 16], [1472, -112], [1472, -128 - 16], [960, -16]], -960, -944, { all: T.stone }, { name: 'kerb' });
  for (let x = 992; x < 1472; x += 128) {
    const z = -(x - 960) / 512 * 128;
    prop(m, x, -958, z, x + 8, -950, z + 44, T.timber, { surface: 'wood' });
  }
  // the wrecked convoy: a truck slewed across the hairpin, a jeep, one burnt out at the foot
  truck(m, 1600, -952, VIL, 'y', 1);
  jeep(m, 1560, -792, VIL, 'x', -1); // (pulled up by the house: clear of the truck and the bend)
  truck(m, 660, -1040, LOW, 'x', -1, { tarp: false });
  for (const [x, y] of [[1520, -1060], [1700, -940], [1690, -910]]) barrelAt(m, x, y, VIL);
  m.crate(1530, -930, VIL, 40);
  m.crate(1500, -900, VIL, 32);
  rubble(m, 740, -980, LOW, 50, 131, T.wreck);
  brazier(m, 1700, -1060, VIL, { radius: 400 });
  torch(m, 1488, -840, -28, 'e', { radius: 280 });
}

// ------------------------------------------------------------------ the village
/** An intact mud-brick house: plastered inside, doors and climbable windows, vigas, a clipped roof. */
function mudHouse(m, x0, y0, x1, y1, z, h, o) {
  const k = (side) => ({ all: T.mud, [side]: T.adobe });
  const g = o.gaps || {};
  wall(m, 'x', x0 - 16, x1 + 16, y1, y1 + 16, z, z + h, k('s'), g.n || []);
  wall(m, 'x', x0 - 16, x1 + 16, y0 - 16, y0, z, z + h, k('n'), g.s || []);
  wall(m, 'y', y0, y1, x1, x1 + 16, z, z + h, k('w'), g.e || []);
  wall(m, 'y', y0, y1, x0 - 16, x0, z, z + h, k('e'), g.w || []);
  m.box(x0 - 16, y0 - 16, z + h, x1 + 16, y1 + 16, z + h + 16, { all: T.mud, bottom: T.timber, top: T.mud }, { name: 'roof' });
  if (o.terrace) {
    // a roof terrace: a parapet round it (gaps at the stair) - the stair is the way up
    for (const [ax, a0, a1, t0, t1, out, gap] of [
      ['x', x0 - 16, x1 + 16, y0 - 16, y0, -1, o.terrace.s], ['x', x0 - 16, x1 + 16, y1, y1 + 16, 1, o.terrace.n],
      ['y', y0, y1, x0 - 16, x0, -1, o.terrace.w], ['y', y0, y1, x1, x1 + 16, 1, o.terrace.e],
    ]) {
      const runs = gap ? [[a0, gap[0]], [gap[1], a1]] : [[a0, a1]];
      for (const [r0, r1] of runs) if (r1 - r0 > 8) parapet(m, ax, r0, r1, t0, t1, z + h + 16, out, T.mud);
    }
  } else clipRoof(m, x0 - 16, y0 - 16, x1 + 16, y1 + 16, z + h + 16);
  // vigas: roof beam ends poking out of the long walls just under the roof
  const long = x1 - x0 >= y1 - y0, no = o.noVigas || [];
  for (let u = (long ? x0 : y0) + 24; u < (long ? x1 : y1) - 8; u += 48) {
    if (long) {
      if (!no.includes('s')) beam(m, u, y0 - 36, z + h - 14, u + 10, y0 - 16, z + h - 4);
      if (!no.includes('n')) beam(m, u, y1 + 16, z + h - 14, u + 10, y1 + 36, z + h - 4);
    } else {
      if (!no.includes('w')) beam(m, x0 - 36, u, z + h - 14, x0 - 16, u + 10, z + h - 4);
      if (!no.includes('e')) beam(m, x1 + 16, u, z + h - 14, x1 + 36, u + 10, z + h - 4);
    }
  }
  for (let u = (long ? x0 : y0) + 24; u < (long ? x1 : y1) - 8; u += 48) {
    if (long) beam(m, u, y0, z + h - 10, u + 10, y1, z + h);
    else beam(m, x0, u, z + h - 10, x1, u + 10, z + h);
  }
  for (const [side, list] of Object.entries(g)) for (const gp of list) {
    const tall = !gp.z0;
    const zz = gp.z0 ?? z, hh = (gp.z1 ?? z + 112) - zz;
    if (side === 'n') doorFrame(m, 'x', gp.c, gp.w, y1, y1 + 16, zz, hh, T.timber, 3, tall ? 8 : 6);
    if (side === 's') doorFrame(m, 'x', gp.c, gp.w, y0 - 16, y0, zz, hh, T.timber, 3, tall ? 8 : 6);
    if (side === 'e') doorFrame(m, 'y', gp.c, gp.w, x1, x1 + 16, zz, hh, T.timber, 3, tall ? 8 : 6);
    if (side === 'w') doorFrame(m, 'y', gp.c, gp.w, x0 - 16, x0, zz, hh, T.timber, 3, tall ? 8 : 6);
  }
  lantern(m, (x0 + x1) / 2, (y0 + y1) / 2, z + h - 10, { radius: 300, intensity: 0.8 });
}

/**
 * A roofless ruin: walls broken into segments either low (16..32: hop them) or tall (96..176:
 * nobody gets up), door gaps, rubble and a fallen beam inside. gaps: { n, s, e, w: [c, ...] } (96 wide).
 */
function ruin(m, x0, y0, x1, y1, z, seed, gaps = {}, tall = []) {
  const r = rng(seed);
  const side = (axis, a0, a1, t0, t1, list, allTall) => {
    let u = a0;
    while (u < a1 - 1) {
      let u1 = Math.min(a1, u + 40 + Math.floor(r() * 4) * 16);
      const g = list?.find((c) => c - 48 < u1 && c + 48 > u);
      if (g != null && u < g - 48) u1 = g - 48;
      if (g != null && u >= g - 48) { u = Math.min(a1, g + 48); continue; } // the door gap
      const low = !allTall && r() < 0.28;
      const hh = low ? 16 + Math.floor(r() * 2) * 16 : 96 + Math.floor(r() * 4) * 32;
      if (axis === 'x') m.box(u, t0, z, u1, t1, z + hh, { all: T.mud, [t0 < y0 + 1 ? 'n' : 's']: T.adobe }, { name: 'ruin' });
      else m.box(t0, u, z, t1, u1, z + hh, { all: T.mud, [t0 < x0 + 1 ? 'e' : 'w']: T.adobe }, { name: 'ruin' });
      // (a tall stretch: clipped on top, so nobody jumps down onto it from a roof)
      if (!low) { if (axis === 'x') clipRoof(m, u, t0, u1, t1, z + hh); else clipRoof(m, t0, u, t1, u1, z + hh); }
      u = u1;
    }
  };
  side('x', x0 - 16, x1 + 16, y0 - 16, y0, gaps.s);
  side('x', x0 - 16, x1 + 16, y1, y1 + 16, gaps.n, tall.includes('n'));
  side('y', y0, y1, x0 - 16, x0, gaps.w);
  side('y', y0, y1, x1, x1 + 16, gaps.e);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  rubble(m, cx + (r() - 0.5) * (x1 - x0) * 0.4, cy + (r() - 0.5) * (y1 - y0) * 0.4, z, 50, seed + 1, T.mud);
  // a fallen roof beam: one end on the floor, the other propped on the rubble (top 30)
  shearedBox(m, x0 + 40, cy - 20, z, x1 - 60, cy + 30, z + 22, 6, T.timber, { surface: 'wood', name: 'beam' });
}

function village(m) {
  const z = VIL;
  ruin(m, 1088, -720, 1328, -512, z, 141, { n: [1200], e: [-608] });
  mudHouse(m, 1456, -736, 1680, -544, z, 136, { gaps: { n: [{ c: 1568, w: 80 }, { c: 1640, w: 56, z0: z + 36, z1: z + 112 }], w: [{ c: -640, w: 80 }] } });
  // the tall house with a roof terrace and an outside stair up the east wall
  mudHouse(m, 1216, -400, 1424, -192, z, 144, { gaps: { s: [{ c: 1320, w: 80 }], w: [{ c: -296, w: 80 }], e: [{ c: -296, w: 56, z0: z + 36, z1: z + 112 }] }, terrace: { n: [1344, 1440] }, noVigas: ['n'] });
  m.stairs(1200, -176, 1424, -96, z, z + 160, 'e', 10, { top: T.stone, all: T.mud });
  sandbags(m, 1256, -360, 1336, -336, z + 160);
  ruin(m, 1616, -352, 1760, -96, z, 142, { w: [-224], n: [1688] });
  // the square: a dry cistern, a dead palm, market litter
  m.prism('z', octo(1408, 256, 64), z, z + 32, { all: T.stone, top: T.stone }, { name: 'cistern' });
  m.prism('z', octo(1408, 256, 14), z + 32, z + 56, { all: T.stone }, { name: 'spout' });
  palm(m, 1300, 380, z, 161);
  palm(m, 1540, 120, z, 162);
  palm(m, 1240, -140, z, 163);
  for (const [x, y, s] of [[1500, 380, 32], [1530, 400, 32], [1260, 120, 40]]) m.crate(x, y, z, s);
  mudHouse(m, 1024, 272, 1184, 480, z, 128, { gaps: { e: [{ c: 376, w: 80 }], s: [{ c: 1104, w: 80 }], n: [{ c: 1104, w: 56, z0: z + 36, z1: z + 112 }] } });
  ruin(m, 1600, 352, 1760, 640, z, 143, { w: [496], s: [1680] });
  // the caravanserai: a big walled yard in ruins, an arcade of pillars along its north side
  ruin(m, 1120, 656, 1440, 880, z, 144, { s: [1200, 1360], e: [760] }, ['n']); // (its north wall stands over the canyon ramp: all tall)
  for (let x = 1160; x < 1420; x += 80) prop(m, x, 820, z, x + 16, 836, z + 120, T.mud, { name: 'pillar' });
  beam(m, 1150, 818, z + 120, 1430, 838, z + 132);
  // the water tower: four legs, braces, a tank on top (nothing to climb)
  waterTower(m, 1660, 980, z);
  // fires and lanterns: the village lies in the mesa's shadow at sundown
  brazier(m, 1350, -60, z, { radius: 420 });
  brazier(m, 1200, 180, z, { radius: 420 });
  brazier(m, 1500, 560, z, { radius: 420 });
  brazier(m, 1300, -620, z, { radius: 380 });
  brazier(m, 1540, 1110, z, { radius: 400 });
  torch(m, 1456, -480, z + 110, 'w');
  for (const [x, y] of [[1460, -60], [1480, -40], [1100, 560], [1700, 760]]) barrelAt(m, x, y, z);
  deadTree(m, 1700, 900, z, 160, 171);
  for (const [x, y, rx, ry, rz, s] of [[1720, 1150, 60, 50, 120, 172], [1520, 1180, 36, 30, 28, 173]]) boulder(m, x, y, z, rx, ry, rz, s);
  // the steps down from the mesa: a stone arch over the top step
  prop(m, 960, 48, 0, 976, 64, 128, T.stone);
  prop(m, 960, 192, 0, 976, 208, 128, T.stone);
  prop(m, 956, 48, 128, 980, 208, 144, T.stone);
}

/** A dead date palm: a leaning trunk, a crown of drooping fronds (no collision up there). */
function palm(m, x, y, z, seed) {
  const r = rng(seed);
  const tx = x + (r() - 0.5) * 60, ty = y + (r() - 0.5) * 60, h = 200 + r() * 60, f = 120 / h;
  shearedBox(m, x, y, z, x + (tx - x) * f, y + (ty - y) * f, z + 120, 8, T.timber, { surface: 'wood', name: 'palm' });
  shearedBox(m, x + (tx - x) * f, y + (ty - y) * f, z + 120, tx, ty, z + h, 6, T.timber, { detail: true, contents: 0, surface: 'wood', name: 'palm' });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.5, l = 44 + r() * 26, sa = Math.cos(a + Math.PI / 2) * 5, sb = Math.sin(a + Math.PI / 2) * 5;
    const mx = tx + Math.cos(a) * l, my = ty + Math.sin(a) * l, mz = z + h + 6 - r() * 10;
    const ex = tx + Math.cos(a) * l * 1.7, ey = ty + Math.sin(a) * l * 1.7, ez = mz - 50 - r() * 40;
    hull(m, [[tx - sa, ty - sb, z + h], [tx + sa, ty + sb, z + h], [mx - sa, my - sb, mz], [mx + sa, my + sb, mz], [tx, ty, z + h + 2]], T.timber, { detail: true, contents: 0, name: 'frond' });
    hull(m, [[mx - sa, my - sb, mz], [mx + sa, my + sb, mz], [ex, ey, ez], [mx, my, mz + 2]], T.timber, { detail: true, contents: 0, name: 'frond' });
  }
}

function waterTower(m, x, y, z) {
  const s = 48, top = z + 224;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) prop(m, x + dx * s - 6, y + dy * s - 6, z, x + dx * s + 6, y + dy * s + 6, top, T.timber, { surface: 'wood' });
  for (const zz of [z + 80, z + 160]) {
    beam(m, x - s, y - s - 3, zz, x + s, y - s + 3, zz + 8);
    beam(m, x - s, y + s - 3, zz, x + s, y + s + 3, zz + 8);
    beam(m, x - s - 3, y - s, zz, x - s + 3, y + s, zz + 8);
    beam(m, x + s - 3, y - s, zz, x + s + 3, y + s, zz + 8);
  }
  m.box(x - s - 8, y - s - 8, top, x + s + 8, y + s + 8, top + 8, { all: T.planks }, { name: 'tower_deck' });
  m.prism('z', octo(x, y, 52), top + 8, top + 120, { all: T.timber, top: T.iron }, { name: 'tank' });
  clipRoof(m, x - s - 8, y - s - 8, x + s + 8, y + s + 8, top);
}



