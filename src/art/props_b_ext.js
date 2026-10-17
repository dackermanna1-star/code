// Props B — exterior (Kettle Run, a wet October night): car_wagon oak_dead oak_canopy sign_school
// sign_danger steam_vent flagpole fence lamp_post dumpster bush_dead.
// Everything is rain-slick: cold moonlight specular on top faces, beads on glass, dark wet bases.
// Placement: oak_canopy (5×4, over) goes at (x-2, y-3) for an oak_dead at (x, y) — the canopy
// carries the upper trunk and the fork so the two read as one tree.
import { K, PAL, mix, lt, dk, BRASS, CHROME, IRON, seedOf, Blob, SHADOW, SHADOW_SOFT } from './props_b_kit.js';

const WET = 'rgba(196,212,230,0.55)', WET2 = 'rgba(151,175,203,0.4)';
const BARK = { hi: mix(PAL.g4, PAL.tan, 0.25), lt: mix(PAL.g3, PAL.brown, 0.3), md: mix(PAL.g2, PAL.brown_d, 0.35), dk: mix(PAL.g1, PAL.brown_dd, 0.4), dd: PAL.night };
function shell(k, x, y) { k.P(x, y, PAL.amber); k.P(x, y + 1, PAL.amber_d); k.P(x + 1, y, PAL.amber_l); k.P(x - 1, y + 1, 'rgba(107,74,28,0.8)'); }

// ---------------------------------------------------------------------------- car_wagon (4×2)
function carWagon(o) {
  const lights = o.state === 'on';
  const k = new K(72, 48, -4, -14, seedOf('car', o.dir, o.state));
  const B = { hi: mix(PAL.moon_l, PAL.g6, 0.3), lt: mix(PAL.blue_l, PAL.g5, 0.45), md: mix(PAL.blue_l, PAL.g4, 0.5), dk: mix(PAL.blue_d, PAL.g3, 0.45), dd: mix(PAL.blue_dd, PAL.g1, 0.5) };
  const glassC = mix(PAL.blue_dd, PAL.navy_d, 0.5);
  // wet shadow/reflection pool under the car
  k.shadowE(31, 28, 32, 4, SHADOW);
  // ---- drawn nose-left; flipped for 'right'
  // lower body side
  k.R(1, 14, 62, 12, B.md); k.H(1, 14, 62, B.lt); k.H(1, 25, 62, B.dd);
  k.poly([[0, 16], [3, 13], [3, 25], [0, 24]], B.md); // rounded nose
  // fake wood panel along the doors with blond trim
  k.R(14, 17, 46, 6, PAL.wood); k.H(14, 17, 46, PAL.maple); k.H(14, 22, 46, PAL.maple);
  for (let x = 16; x < 60; x += 5) k.V(x + ((x * 7) % 3), 18, 4, PAL.wood_d);
  k.V(31, 15, 10, B.dd); k.V(46, 15, 10, B.dd); // door seams
  k.P(29, 16, CHROME.lt); k.P(44, 16, CHROME.lt); // handles
  // wheel arches + tires + hubcaps
  for (const wx of [13, 51]) {
    k.E(wx, 25, 7, 6, PAL.ink); k.R(wx - 7, 26, 15, 5, 'rgba(0,0,0,0)');
    k.E(wx, 26, 5, 4, PAL.g1); k.E(wx, 26, 3, 2, PAL.g4); k.P(wx - 1, 25, CHROME.hi); k.P(wx, 26, PAL.g2);
  }
  // hood (sloped aero nose) and windshield
  k.poly([[2, 13], [5, 9], [17, 7], [19, 14]], B.lt); k.L(5, 9, 17, 7, B.hi);
  k.poly([[17, 7], [22, 1], [24, 1], [21, 14], [19, 14]], glassC);
  // roof (seen from above), long wagon roofline with rack rails
  k.R(22, -1, 38, 7, B.lt); k.H(22, -1, 38, B.hi); k.H(23, 0, 36, B.md);
  k.H(25, 1, 33, CHROME.md); k.H(25, 4, 33, CHROME.md);
  // side glass: front door, rear door, cargo window; pillars
  k.R(21, 6, 41, 8, glassC);
  k.V(30, 6, 8, B.dk); k.V(45, 6, 8, B.dk); k.R(60, 5, 3, 9, B.dk);
  k.H(21, 6, 41, B.dk); k.H(21, 13, 41, B.md);
  // rain on the glass: streaks + beads, moon reflections
  for (const [x0, y0] of [[24, 7], [35, 7], [50, 8], [56, 7]]) { k.L(x0, y0, x0 + 2, y0 + 5, WET2); k.P(x0 + 3, y0 + 1, WET); }
  k.L(20, 3, 21, 1, PAL.moon_l);
  // tail lamp, liftgate edge
  k.R(61, 14, 2, 5, PAL.red_d); k.P(61, 14, PAL.red);
  k.V(63, 13, 12, B.dd);
  // headlights: flush aero lamps on the nose
  if (lights) {
    k.R(0, 15, 4, 3, PAL.white); k.P(0, 15, '#fffbe8'); k.H(0, 18, 4, PAL.yellow_l);
    k.DE(1, 16, 5, 4, 'rgba(255,246,220,0.35)', 1, 0.1);
    k.P(1, 20, PAL.orange_l); // parking lamp
  } else { k.R(0, 15, 4, 3, mix(PAL.g4, PAL.moon, 0.3)); k.P(0, 15, PAL.moon_l); k.P(1, 20, PAL.orange_d); }
  // wet top faces: specular streaks + beads on roof and hood
  for (let i = 0; i < 9; i++) { const x = 23 + i * 4; k.P(x, (i * 3) % 5, WET); }
  k.L(6, 10, 12, 9, WET); k.P(9, 11, WET2);
  k.D(1, 23, 62, 2, 'rgba(10,14,20,0.4)', 0.5); // road grime on the rocker panels
  if (o.dir === 'right') {
    const r = k.done(); const c = r.canvas; const f = document.createElement('canvas'); f.width = c.width; f.height = c.height;
    const x = f.getContext('2d'); x.imageSmoothingEnabled = false; x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(c, 0, 0);
    return { canvas: f, ox: 64 - (c.width + r.ox), oy: r.oy };
  }
  return k.done();
}

// ---------------------------------------------------------------------------- oak_dead (trunk)
function oakDead(o) {
  const k = new K(30, 40, -7, -22, seedOf('oak', o.variant));
  k.shadowE(8, 14, 10, 3, SHADOW);
  // root flare into the lawn, trunk rising into the canopy
  k.poly([[-5, 14], [0, 8], [2, -20], [13, -20], [15, 8], [21, 14], [14, 12], [8, 14], [2, 12]], BARK.md);
  k.poly([[1, -20], [4, -20], [3, 8], [-2, 13]], BARK.lt);
  k.poly([[11, -20], [14, -20], [16, 9], [12, 11]], BARK.dk);
  // fissured bark: vertical dark seams, a lit ridge or two
  for (const x of [5, 8, 10]) for (let y = -20; y < 12; y++) if (((y * 7 + x * 3) % 9) < 6) k.P(x + ((y >> 3) & 1), y, BARK.dk);
  k.V(3, -18, 24, BARK.hi);
  // a hollow knot
  k.E(9, -6, 1, 2, PAL.ink); k.P(8, -8, BARK.lt);
  // cicada shells clinging to the bark (Brood II, May '96)
  for (const [x, y] of [[4, -14], [11, -9], [6, 2], [12, 4], [3, -4], [9, -17]]) shell(k, x, y);
  // wet: moon sheen down the left side
  for (let y = -18; y < 8; y += 3) k.P(2, y, WET2);
  return k.done();
}

// ---------------------------------------------------------------------------- oak_canopy (5×4, over)
function oakCanopy(o) {
  const k = new K(96, 72, -8, -6, seedOf('canopy', o.variant));
  const r = k.r;
  // branch tree: recursive limbs from the fork above the trunk (local 40, 34)
  const segs = [];
  const grow = (x, y, ang, len, w, depth) => {
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    segs.push([x, y, x2, y2, w]);
    if (depth <= 0 || len < 3) return;
    const n = depth > 2 ? 2 : (r() < 0.6 ? 2 : 1);
    for (let i = 0; i < n; i++) {
      const spread = (i === 0 ? -1 : 1) * (0.35 + r() * 0.45);
      grow(x2, y2, ang + spread + (r() - 0.5) * 0.3, len * (0.62 + r() * 0.18), Math.max(1, w - 1), depth - 1);
    }
  };
  // upper trunk from the trunk prop's top (local 40, 32) to the fork
  segs.push([40, 33, 40, 24, 5]);
  grow(40, 24, -Math.PI / 2 - 0.65, 16, 4, 5);
  grow(40, 24, -Math.PI / 2 + 0.55, 17, 4, 5);
  grow(40, 26, -Math.PI / 2 - 1.35, 15, 3, 4);  // low limb reaching left
  grow(40, 27, -Math.PI / 2 + 1.3, 14, 3, 4);   // and right
  grow(40, 23, -Math.PI / 2 + 0.05, 13, 3, 4);
  for (const [x0, y0, x1, y1, w] of segs) {
    k.LT(x0, y0, x1, y1, w, w > 2 ? BARK.md : BARK.dk);
    if (w > 1) k.L(x0 - (w >> 1), y0, x1 - (w >> 1), y1, BARK.lt);
  }
  // twig ends (fine, slightly transparent so the canopy stays readable over characters)
  for (const [, , x1, y1, w] of segs) if (w === 1) { k.P(x1 + (r() < 0.5 ? -1 : 1), y1 - 1, 'rgba(56,57,70,0.7)'); }
  // moon sheen along the upper sides of the big limbs
  for (const [x0, y0, x1, y1, w] of segs) if (w >= 3) k.L(x0 - 1, y0 - 1, (x0 + x1) / 2 - 1, (y0 + y1) / 2 - 1, WET2);
  // cicada shells on the limbs, a few dead leaves holding on
  let n = 0;
  for (const [x0, y0, x1, y1, w] of segs) {
    if (w < 2 || n > 10) continue;
    if (r() < 0.55) { const t = r(); shell(k, Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t) - 1); n++; }
  }
  for (let i = 0; i < 7; i++) { const s = segs[Math.floor(r() * segs.length)]; k.P(Math.round(s[2]), Math.round(s[3]) + 1, r() < 0.5 ? PAL.brown : PAL.rust); }
  return k.done({ outline: false });
}

// ---------------------------------------------------------------------------- sign_school (4×1)
function signSchool(o) {
  const k = new K(68, 52, -2, -38, seedOf('ssign', o.clean));
  k.shadow(0, 12, 64, 4, SHADOW);
  const brick = o.clean ? PAL.brick : mix(PAL.brick, PAL.g2, 0.25), brickL = o.clean ? PAL.brick_l : mix(PAL.brick_l, PAL.g3, 0.3), mort = PAL.mortar;
  const bricks = (x, y, w, h) => {
    k.R(x, y, w, h, brick);
    for (let j = 0; j < h; j += 3) { k.H(x, y + j, w, mort); for (let i = ((j / 3) % 2 ? 2 : 5); i < w; i += 6) k.V(x + i, y + j + 1, 2, mort); }
    k.H(x, y, w, brickL); k.V(x, y, h, brickL);
  };
  // base + two piers with limestone caps
  bricks(0, 6, 64, 8); bricks(0, -33, 6, 39); bricks(58, -33, 6, 39);
  for (const x of [-1, 57]) { k.R(x, -35, 8, 3, PAL.g5); k.H(x, -35, 8, PAL.g6); k.H(x, -33, 8, PAL.g3); }
  k.R(-1, 5, 66, 2, PAL.g5); k.H(-1, 5, 66, PAL.g6);
  // the letter board
  const board = o.clean ? PAL.white : mix(PAL.paper, PAL.g4, 0.4);
  k.R(6, -32, 52, 37, board); k.frame(6, -32, 52, 37, PAL.g3);
  for (let i = 0; i < 5; i++) k.H(7, -24 + i * 7, 50, mix(board, PAL.g3, 0.35)); // letter tracks
  const lines = o.clean
    ? ['HALLOWELL', 'CONS. SCHOOL', 'FOUNDERS DAY', 'OCT 19', 'GO COLLIERS']
    : ['HALLOWE L', 'CONS LIDATED', 'SCH OL', 'HOME OF THE', 'COL IERS'];
  lines.forEach((t, i) => { const w = t.length * 4 - 1; k.text(32 - (w >> 1), -30 + i * 7, t, i === 0 ? PAL.ink : PAL.g1); });
  if (!o.clean) {
    // weather streaks, a fallen letter in the leaves, moss on the base
    k.DV(7, -31, 50, 35, 'rgba(60,50,30,0.3)', 0.0, 0.35);
    k.R(20, 10, 3, 5, PAL.g1); k.P(21, 12, board);
    k.S(0, 6, 64, 8, 'rgba(67,94,73,0.6)', 0.06);
    for (let x = 8; x < 56; x += 7) k.P(x, -31, WET);
  }
  return k.done();
}

// ---------------------------------------------------------------------------- sign_danger
function signDanger(o) {
  const k = new K(30, 40, -7, -26, seedOf('danger', o.variant));
  k.shadowE(8, 14, 9, 2, SHADOW_SOFT);
  for (const x of [1, 13]) { k.R(x, -10, 2, 24, IRON.lt); k.V(x, -10, 24, IRON.hi); }
  const y0 = -24, w = 28, x0 = -6;
  const yel = mix(PAL.yellow, PAL.cream, 0.15);
  k.R(x0, y0, w, 15, yel); k.frame(x0, y0, w, 15, PAL.ink);
  k.R(x0 + 1, y0 + 1, w - 2, 7, PAL.ink); k.text(x0 + 3, y0 + 2, 'DANGER', yel);
  // UNDERGROUND MINE FIRE — small print as lines
  for (let j = 0; j < 3; j++) { for (let i = 0; i < w - 4; i++) if (((i * 5 + j * 3) % 7) < 5) k.P(x0 + 2 + i, y0 + 9 + j * 2, PAL.g1); }
  // weather: rust bleeding from the bolts, two shotgun-pellet dents, wet sheen
  k.P(x0 + 2, y0 + 2, IRON.lt); k.P(x0 + w - 3, y0 + 2, IRON.lt);
  k.drip(x0 + 2, y0 + 3, 6); k.drip(x0 + w - 3, y0 + 3, 9);
  for (const [x, y] of [[x0 + 17, y0 + 10], [x0 + 20, y0 + 12], [x0 + 9, y0 + 11]]) { k.P(x, y, PAL.g2); k.P(x + 1, y, mix(yel, PAL.white, 0.4)); }
  k.L(x0 + 1, y0 + 14, x0 + 6, y0 + 9, WET2);
  return k.done();
}

// ---------------------------------------------------------------------------- steam_vent (decal)
function steamVent(o) {
  const k = new K(16, 16, 0, 0, seedOf('vent', o.variant));
  // damp halo where steam condenses, sulfur crust, the crack with a warm throat
  k.DE(8, 8, 7, 5, 'rgba(8,10,14,0.45)', 0.9, 0.2);
  const pts = [[1, 9], [4, 7], [6, 9], [9, 6], [11, 8], [14, 6]];
  if (o.variant % 2) pts.reverse().forEach((p) => { p[1] = 15 - p[1]; });
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    k.L(ax, ay, bx, by, PAL.ink); k.L(ax, ay + 1, bx, by + 1, PAL.ink);
    k.L(ax, ay - 1, bx, by - 1, 'rgba(201,170,71,0.45)'); // crust on the lip
  }
  k.P(6, 9, PAL.fire_d); k.P(9, 7, PAL.fire_dd); k.P(10, 7, PAL.fire_d);
  for (const [x, y] of [[3, 6], [12, 9], [7, 11], [5, 5]]) k.P(x, y, 'rgba(230,209,136,0.55)');
  return k.done({ outline: false });
}

// ---------------------------------------------------------------------------- flagpole
function flagpole(o) {
  const k = new K(16, 96, 0, -82, seedOf('flag', o.variant));
  k.shadowE(8, 13, 6, 2, SHADOW_SOFT);
  k.R(3, 8, 10, 6, PAL.g4); k.H(3, 8, 10, PAL.g5); k.H(3, 13, 10, PAL.g2); // concrete base
  k.R(7, -76, 2, 85, PAL.g5); k.V(7, -76, 85, PAL.g6); k.V(8, -76, 85, PAL.g3);
  k.E(8, -78, 2, 2, BRASS.md); k.P(7, -79, BRASS.hi); // finial
  // halyard: the rope slapping the pole, cleat near the bottom, the clip swinging
  for (let y = -74; y < 2; y++) k.P(10 + (Math.sin(y * 0.09) > 0.6 ? 1 : 0), y, mix(PAL.g5, PAL.paper_d, 0.4));
  k.R(9, 2, 3, 1, PAL.g3); k.P(11, -30, CHROME.hi); k.P(11, -29, CHROME.md);
  for (let y = -70; y < 0; y += 9) k.P(7, y, WET);
  return k.done();
}

// ---------------------------------------------------------------------------- fence
function fence(o) {
  const k = new K(18, 34, -1, -18, seedOf('fence', o.state, o.variant));
  const post = (x) => { k.R(x, -16, 2, 30, PAL.g4); k.V(x, -16, 30, PAL.g5); k.P(x, -17, PAL.g5); k.P(x + 1, -17, PAL.g3); };
  const mesh = 'rgba(156,152,151,0.55)', meshD = 'rgba(82,82,94,0.55)';
  if (o.state === 'post') { post(7); k.shadowE(8, 14, 3, 1, SHADOW_SOFT); return k.done(); }
  if (o.state === 'v') {
    // running north–south: the mesh seen nearly edge-on
    for (let y = -18; y < 14; y++) { k.P(7 + ((y >> 1) & 1), y, mesh); k.P(8 - ((y >> 1) & 1), y, meshD); }
    k.V(7, -18, 32, 'rgba(196,189,176,0.35)');
    post(7);
    return k.done({ outline: false });
  }
  // running east–west: diamond chain-link between posts, top rail, sagging and rusted
  const sag = o.variant % 3 === 1;
  for (let y = -14; y < 13; y++) for (let x = 0; x < 16; x++) {
    const yy = y - (sag ? Math.round(Math.sin((x / 16) * Math.PI) * 2) : 0);
    if (yy < -14) continue;
    if (((x + y) & 3) === 0 || ((x - y) & 3) === 0) k.P(x, y, ((x * 7 + y) % 11) === 0 ? 'rgba(135,70,40,0.7)' : mesh);
  }
  if (o.variant % 3 === 2) for (let y = 4; y < 12; y++) for (let x = 6; x < 12; x++) if ((x - 9) ** 2 / 9 + (y - 8) ** 2 / 16 < 1) k.clear(x, y); // a hole cut through
  k.R(0, -15, 16, 2, PAL.g4); k.H(0, -15, 16, PAL.g5);
  post(0);
  for (let x = 2; x < 16; x += 5) k.P(x, -14, WET);
  return k.done({ outline: false });
}

// ---------------------------------------------------------------------------- lamp_post
function lampPost(o) {
  const lit = o.state === 'flicker';
  const k = new K(30, 92, -7, -78, seedOf('lamp', o.state));
  k.shadowE(8, 13, 5, 2, SHADOW_SOFT);
  k.R(4, 8, 8, 6, PAL.g4); k.H(4, 8, 8, PAL.g5); k.H(4, 13, 8, PAL.g2); // footing
  k.R(7, -66, 3, 75, PAL.g3); k.V(7, -66, 75, PAL.g4); k.V(9, -66, 75, PAL.g2);
  k.R(6, 2, 5, 7, PAL.g3); k.H(6, 2, 5, PAL.g4); // base collar
  // davit arm curving out to a cobra-head luminaire
  k.L(8, -66, 9, -70, PAL.g3); k.L(9, -70, 14, -73, PAL.g3); k.L(14, -73, 18, -73, PAL.g3);
  k.poly([[14, -76], [22, -75], [23, -72], [15, -71]], PAL.g4); k.H(15, -76, 7, PAL.g5);
  if (lit) { k.R(15, -71, 7, 2, PAL.yellow_l); k.H(16, -70, 5, PAL.white); k.DE(18, -69, 6, 4, 'rgba(255,207,138,0.35)', 1, 0.1); }
  else { k.R(15, -71, 7, 2, mix(PAL.g2, PAL.moon, 0.2)); k.P(16, -71, PAL.moon); }
  k.rust(7, -40, 3, 45, 4);
  for (let y = -60; y < 0; y += 11) k.P(7, y, WET);
  return k.done();
}

// ---------------------------------------------------------------------------- dumpster (2×1)
function dumpster(o) {
  const k = new K(36, 32, -2, -16, seedOf('dump', o.variant));
  const G = { hi: mix(PAL.green_l, PAL.g4, 0.4), lt: mix(PAL.green, PAL.g3, 0.4), md: mix(PAL.green_d, PAL.g2, 0.35), dk: PAL.green_dd, dd: PAL.night };
  k.shadow(0, 12, 32, 4, SHADOW);
  // body: slanted front, ribs, fork pockets
  k.poly([[1, -6], [31, -6], [30, 12], [2, 12]], G.md);
  k.H(1, -6, 31, G.lt);
  for (const x of [8, 16, 24]) { k.V(x, -5, 17, G.dk); k.V(x + 1, -5, 17, G.lt); }
  k.R(0, 0, 32, 3, G.dk); k.H(0, 0, 32, G.lt); // fork pocket rail
  for (const x of [3, 27]) { k.R(x, 12, 2, 2, PAL.g1); }
  // lids: one shut (black plastic, beaded), one propped up
  k.R(1, -9, 15, 4, PAL.g1); k.H(1, -9, 15, PAL.g3);
  k.poly([[16, -9], [31, -9], [30, -14], [17, -14]], PAL.g1); k.H(17, -14, 13, PAL.g3);
  k.R(16, -8, 15, 2, PAL.ink); // the dark inside under the raised lid
  k.P(20, -7, PAL.paper_d); k.P(25, -8, PAL.g4); // trash
  k.rust(1, -6, 31, 18, 9); k.drip(5, 2, 8); k.drip(22, 3, 7);
  k.text(5, 4, '', PAL.ink);
  for (let x = 3; x < 16; x += 4) k.P(x, -9, WET);
  return k.done();
}

// ---------------------------------------------------------------------------- bush_dead
function bushDead(o) {
  const k = new K(24, 26, -4, -10, seedOf('bush', o.variant));
  k.shadowE(8, 13, 9, 2, SHADOW_SOFT);
  const b = new Blob(k.w, k.h, k.ox, k.oy);
  b.E(8, 6, 9, 6, 0, 1); b.E(4, 3, 5, 4, 0, 2); b.E(12, 2, 5, 4, 0, 3);
  const ramp = [PAL.night, mix(PAL.g1, PAL.brown_dd, 0.5), mix(PAL.g2, PAL.brown_d, 0.5), mix(PAL.g3, PAL.brown, 0.4), mix(PAL.g4, PAL.tan, 0.3)];
  b.render(k, [ramp], { reach: 4, edge: 0.4, rim: 0.5 });
  // twigs breaking the silhouette, a few curled leaves still on
  const r = k.r;
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI * (0.05 + r() * 0.9), x0 = 8 + Math.round(Math.cos(a) * 5), y0 = 5 + Math.round(Math.sin(a) * 3);
    const len = 3 + r() * 4;
    k.L(x0, y0, Math.round(x0 + Math.cos(a) * len), Math.round(y0 + Math.sin(a) * len), r() < 0.5 ? ramp[3] : ramp[2]);
  }
  for (let i = 0; i < 6; i++) k.P(1 + Math.floor(r() * 15), -1 + Math.floor(r() * 10), r() < 0.5 ? PAL.rust : PAL.brown);
  for (let i = 0; i < 4; i++) k.P(3 + i * 4, -2 + (i % 2), WET2);
  return k.done();
}

export const EXTERIOR = {
  car_wagon: { build: carWagon, facing: ['left', 'right', 'down'], defaultDir: 'left', noClean: true, showFacing: ['left', 'right'] },
  oak_dead: { build: oakDead, noClean: true },
  oak_canopy: { build: oakCanopy, noClean: true },
  sign_school: { build: signSchool },
  sign_danger: { build: signDanger, noClean: true },
  steam_vent: { build: steamVent, variants: 2, noClean: true, showVariants: [0, 1] },
  flagpole: { build: flagpole, noClean: true },
  fence: { build: fence, variants: 3, noClean: true, showVariants: [0, 1, 2] },
  lamp_post: { build: lampPost, noClean: true },
  dumpster: { build: dumpster, noClean: true },
  bush_dead: { build: bushDead, variants: 3, noClean: true },
};
