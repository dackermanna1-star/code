// Sector 9 (zm_sector9): dressing and light - what makes each part of the block-out a place.
// Region by region: the atrium and its tank, the security suite and the dock, the ramp and
// the yard, the west (elevator, lab row, labs, decon, pump room), containment, the lower labs,
// the east (server room, cafeteria, kitchen, freight tunnel, vent sump).
import { wall, glass, lamp, streetLight, container, fence, pillar } from '../kit.js';
import { T, L0, L1, L2, SURF, ROCK, HILL, wallAt } from './zm_sector9_layout.js';
import { doorLeaf, cart, openStairs, prop, rail, stairRail, doorFrame, sign, tube, redLamp, bulkhead, pipe, bench, rack, table, cases, drum, specimenTank, boxTruck, forklift, partition } from './zm_sector9_parts.js';

// sign atlas cells (src/assets/tex/sector9.js SIGNS)
const SG = { sector9: 0, containment: 1, decon: 2, server: 3, security: 4, cafe: 5, dock: 6, labA: 7, labB: 8, elevator: 9, lower: 10 };
const COOL = [0.84, 0.93, 1.0], WARM = [1.0, 0.86, 0.66], SODIUM = [1.0, 0.7, 0.4], GREEN = [0.35, 1.0, 0.6], BLUE = [0.6, 0.78, 1.0];

export function dress(m) {
  atrium(m);
  south(m);
  yard(m);
  west(m);
  containment(m);
  lowerLabs(m);
  east(m);
  extras(m);
}

// ------------------------------------------------------------------ the atrium
function atrium(m) {
  specimenTank(m, 0, 0, L0, 448);
  openStairs(m, 320, -160, 448, 224, L1, L2, 'n', 12);
  openStairs(m, -448, -224, -320, 160, L1, L2, 's', 12);
  // the pit edge: a hazard band and railings (gaps where the pit stairs come up)
  for (const [x0, y0, x1, y1] of [[-336, 320, 336, 336], [-336, -336, 336, -320], [-336, -320, -320, 320], [320, -320, 336, 320]]) prop(m, x0, y0, L1, x1, y1, L1 + 1, { all: T.haz }, { name: 'edge' });
  // (no rail over the pit stairs: you can step down onto them)
  rail(m, 64, 322, 320, 322, L1);
  rail(m, -320, -322, -64, -322, L1);
  rail(m, -322, -320, -322, -224, L1);
  rail(m, 322, 224, 322, 320, L1);
  // stair rails: the L1-L2 flights (both sides) and the pit flights' open sides
  stairRail(m, -322, 160, L1, -322, -224, L2);
  stairRail(m, -450, 160, L1, -450, -224, L2);
  stairRail(m, 322, -160, L1, 322, 224, L2);
  stairRail(m, 450, -160, L1, 450, 224, L2);
  stairRail(m, -320, 190, L1, 64, 190, L0);
  stairRail(m, 320, -190, L1, -64, -190, L0);
  // gallery railings (L2), the bridges and the ring round the tank
  rail(m, -544, 546, -64, 546, L2); rail(m, 64, 546, 544, 546, L2);
  rail(m, -544, -546, -64, -546, L2); rail(m, 64, -546, 544, -546, L2);
  rail(m, -546, -224, -546, 544, L2); rail(m, -546, -544, -546, -352, L2);
  rail(m, 546, -544, 546, 224, L2); rail(m, 546, 352, 546, 544, L2);
  for (const s of [-1, 1]) { rail(m, -66, s * 192, -66, s * 544, L2); rail(m, 66, s * 192, 66, s * 544, L2); }
  rail(m, -192, 194, -64, 194, L2); rail(m, 64, 194, 192, 194, L2);
  rail(m, -192, -194, -64, -194, L2); rail(m, 64, -194, 192, -194, L2);
  rail(m, -194, -192, -194, 192, L2); rail(m, 194, -192, 194, 192, L2);
  // the landings' open edges
  rail(m, 322, 224, 322, 352, L2); rail(m, 448, 226, 544, 226, L2); rail(m, 320, 350, 544, 350, L2);
  rail(m, -322, -352, -322, -224, L2); rail(m, -544, -226, -448, -226, L2); rail(m, -544, -350, -320, -350, L2);
  // gallery beams and columns (L1 cover under the gallery edge)
  for (const s of [-1, 1]) {
    prop(m, -640, s * 552 - 6, L2 - 32, 640, s * 552 + 6, L2 - 16, T.metal, { name: 'beam' });
    prop(m, s * 552 - 6, -544, L2 - 32, s * 552 + 6, 544, L2 - 16, T.metal, { name: 'beam' });
    for (const u of [-384, -128, 128, 384]) {
      if (!(s > 0 && u === 384)) pillar(m, u, s * 560, L1, L2 - 32, 24, T.metal);
      if (!(s > 0 && u === 384) && !(s < 0 && u === -384)) pillar(m, s * 560, u, L1, L2 - 32, 24, T.metal);
    }
  }
  // roof trusses, pilasters on the walls
  for (const y of [-384, -128, 128, 384]) prop(m, -640, y - 8, 416, 640, y + 8, 448, T.metal, { name: 'truss' });
  for (const u of [-256, 256]) {
    for (const s of [-1, 1]) {
      prop(m, u - 24, s * 640 - (s > 0 ? 16 : 0), L2, u + 24, s * 640 + (s < 0 ? 16 : 0), 448, T.conc, { name: 'pilaster' });
      prop(m, s * 640 - (s > 0 ? 16 : 0), u - 24, L2, s * 640 + (s < 0 ? 16 : 0), u + 24, 448, T.conc, { name: 'pilaster' });
    }
  }
  // signs: the facility name on the north wall over the gallery, containment over the north door
  sign(m, SG.sector9, 's', 640, -224, 224, 288, 344, { lit: true });
  sign(m, SG.containment, 's', 640, -96, 96, 136, 160);
  sign(m, SG.security, 'n', -640, -152, -72, L2 + 116, L2 + 136);
  // the pit's tunnel mouths: hazard frames
  doorFrame(m, 'y', -80, 80, -336, -320, L0, 160, { haz: true });
  doorFrame(m, 'y', -80, 80, 320, 336, L0, 160, { haz: true });
  // pit clutter: cases and drums by the walls
  cases(m, -250, -250, L0, [[0, 0, 40, 40], [44, 0, 40, 32], [0, 44, 32, 32]]);
  cases(m, 250, 250, L0, [[0, 0, 40, 40], [-44, 0, 32, 32]]);
  drum(m, 280, -80 - 30, L0); drum(m, 250, -130, L0, T.haz);
  pipe(m, 'y', -300, 300, -308, L0 + 150, 8); pipe(m, 'y', -300, 300, 308, L0 + 150, 8);
  // clutter on the ring: trolleys, cases under the galleries, a barricade at the cell block door
  cart(m, -470, 420, L1); cart(m, 470, -430, L1, 'y'); cart(m, 300, 596, L1);
  cases(m, -600, -280, L1, [[0, 0, 40, 40], [0, 44, 32, 32]]);
  cases(m, 600, 280, L1, [[0, 0, 40, 40], [0, -44, 40, 32]]);
  cases(m, 600, -150, L1, [[0, 0, 32, 32]]);
  prop(m, -232, 584, L1, -120, 608, L1 + 32, { all: T.conc }, { name: 'barrier' });
  prop(m, 120, 584, L1, 232, 608, L1 + 32, { all: T.conc }, { name: 'barrier' });
  for (const [x, y] of [[-620, -620], [620, -620], [-620, 620], [620, 620]]) { pipe(m, 'z', L1, 448, x, y, 10); pipe(m, 'z', L1, 448, x + (x < 0 ? 26 : -26), y, 6); }
  // light: high bays under the roof, tubes under the galleries, wall lamps on the galleries
  for (const [x, y] of [[-384, -384], [384, -384], [-384, 384], [384, 384], [0, -400], [0, 400], [-400, 0], [400, 0]]) lamp(m, x, y, 440, { size: [36, 36], depth: 6, color: COOL, intensity: 1.15, radius: 1000 });
  for (const s of [-1, 1]) for (const u of [-448, -192, 192, 448]) {
    tube(m, u, s * 596, L2 - 16, { radius: 300, intensity: 0.7 });
    tube(m, s * 596, u, L2 - 16, { along: 'y', radius: 300, intensity: 0.7 });
  }
  for (const [x, y, f] of [[-320, -330, 'n'], [320, 330, 's'], [-310, 330, 's'], [310, -330, 'n']]) redLamp(m, x, y, L0 + 120, f, { intensity: 0.7, radius: 300 });
}

// ------------------------------------------------------------------ the security suite and the loading dock
function south(m) {
  openStairs(m, -688, -1408, -560, -1024, L1, L2, 'n', 12);
  openStairs(m, 96, -1408, 224, -1024, L1, L2, 'n', 12);
  // the suite (L2): glazed south wall, partitions, ceiling lights, consoles
  wall(m, 'x', -704, 256, -1040, -1024, L2 - 16, 352, { all: T.wall, s: T.conc, n: wallAt(L2) },
    [{ c: -624, w: 128, z0: L2, z1: L2 + 112 }, { c: 160, w: 128, z0: L2, z1: L2 + 112 }, { c: -464, w: 192, z0: L2, z1: L2 + 124 }, { c: -136, w: 320, z0: L2, z1: L2 + 124 }]);
  glass(m, -560, -1034, L2, -368, -1030, L2 + 124, T.glass);
  glass(m, -296, -1034, L2, 24, -1030, L2 + 124, T.glass);
  for (const [x0, x1] of [[-560, -368], [-296, 24]]) prop(m, x0, -1040, L2, x1, -1024, L2 + 4, T.metal, { name: 'sill' });
  wall(m, 'y', -1040, -672, 240, 256, L2 - 16, 352, { all: T.conc, w: wallAt(L2) });
  wall(m, 'y', -1024, -672, -352, -336, L2, 336, wallAt(L2), [{ c: -760, w: 64 }]);
  wall(m, 'y', -1024, -672, 64, 80, L2, 336, wallAt(L2), [{ c: -760, w: 64 }]);
  doorFrame(m, 'x', -688, -560, -1040, -1024, L2, 112, { haz: true });
  doorFrame(m, 'x', 96, 224, -1040, -1024, L2, 112, { haz: true });
  sign(m, SG.security, 's', -1040, -232, -40, L2 + 128, L2 + 152, { lit: true });
  glass(m, -320, -660, L2 + 40, -192, -652, L2 + 128, T.glass);
  glass(m, -32, -660, L2 + 40, 48, -652, L2 + 128, T.glass);
  // security: the console under the atrium windows (36), a bank of green monitors above it
  prop(m, -320, -704, L2, -176, -672, L2 + 36, { all: T.metal, top: T.metal }, { name: 'console' });
  prop(m, -48, -704, L2, 48, -672, L2 + 36, { all: T.metal, top: T.metal }, { name: 'console' });
  for (let x = -304; x < 40; x += 48) {
    if (x > -176 && x < -56) continue; // (the door)
    const scr = prop(m, x + 6, -684, L2 + 38, x + 30, -678, L2 + 56, { all: T.metal, s: { name: T.tank, fit: true } }, { name: 'monitor' });
    if (scr) { scr.fullbright = true; scr.castShadow = false; }
  }
  // a desk island and lockers
  prop(m, -224, -912, L2, -96, -864, L2 + 34, { all: T.wall, top: T.metal }, { name: 'desk' });
  prop(m, 0, -1016, L2, 56, -992, L2 + 80, T.metal, { name: 'locker' });
  // admin: desks and filing cabinets; records: shelving
  for (const [x, y] of [[-624, -880], [-464, -760], [-624, -760]]) prop(m, x - 40, y - 24, L2, x + 40, y + 24, L2 + 32, { all: T.wall, top: T.metal }, { name: 'desk' });
  prop(m, -696, -1016, L2, -664, -960, L2 + 76, T.metal, { name: 'cabinet' });
  prop(m, -440, -704, L2, -376, -680, L2 + 76, T.metal, { name: 'cabinet' });
  for (const y of [-952, -840]) prop(m, 160, y - 16, L2, 232, y + 16, L2 + 96, T.metal, { name: 'shelf' });
  cases(m, 200, -720, L2, [[0, 0, 32, 32]]);
  for (const x of [-560, -150, 160]) for (const y of [-940, -760]) tube(m, x, y, 336, { radius: 300, intensity: 0.75 });
  // the undercroft: columns under the suite's edge, lights under its floor
  for (const x of [-432, -176, 48]) pillar(m, x, -1056, L1, L2 - 16, 32, T.conc);
  for (const x of [-600, -300, 0, 200]) tube(m, x, -860, L2 - 16, { radius: 320, intensity: 0.7 });
  stairRail(m, -558, -1408, L1, -558, -1040, L2);
  stairRail(m, 94, -1408, L1, 94, -1040, L2);
  stairRail(m, 226, -1408, L1, 226, -1040, L2);
  // the dock floor: a loading platform (32) along the south wall, a box truck, a container, a forklift
  prop(m, -256, -1472, L1, 448, -1392, L1 + 32, { all: T.conc, top: T.cfloor, n: T.haz }, { name: 'platform', detail: false });
  boxTruck(m, -200, -1310, L1, 'w');
  container(m, 360, -980, L1, 'y', { tex: 'container_blue', len: 240 });
  m.clip(312, -1100, L1 + 102, 408, -860, 352); // (its roof is out of bounds)
  forklift(m, 300, -1200, L1, 'w');
  cases(m, -180, -1430, L1 + 32, [[0, 0, 40, 40], [44, 0, 40, 40], [22, 0, 32, 32, 40]]);
  cases(m, 300, -1420, L1 + 32, [[0, 0, 40, 40]]);
  cases(m, -560, -760, L1, [[0, 0, 40, 40], [0, 44, 40, 40], [44, 22, 32, 32]]);
  for (const [x, y] of [[-460, -1440], [-430, -1410], [420, -1300]]) drum(m, x, y, L1);
  // jersey barriers by the suite stairs (a checkpoint)
  prop(m, -520, -1160, L1, -400, -1136, L1 + 32, { all: T.conc, top: T.conc }, { name: 'barrier' });
  prop(m, -40, -1160, L1, 80, -1136, L1 + 32, { all: T.conc, top: T.conc }, { name: 'barrier' });
  // painted lanes
  for (const x of [-416, 256]) prop(m, x - 4, -1376, L1, x + 4, -1072, L1 + 1, T.haz, { name: 'lane' });
  // door frames: atrium doors, the pump passage, the freight bay, the staff passage
  doorFrame(m, 'x', -512, -384, -672, -640, L1, 128);
  doorFrame(m, 'x', 256, 384, -672, -640, L1, 128);
  doorFrame(m, 'y', -1024, -896, -720, -704, L1, 128);
  doorFrame(m, 'y', -1472, -1248, 448, 464, L1, 192, { haz: true, w: 10 });
  doorFrame(m, 'y', -784, -688, 448, 464, L1, 128);
  sign(m, SG.dock, 'w', 448, -1424, -1296, 200, 224, { lit: true });
  // light: high bays
  for (const x of [-480, -160, 160]) for (const y of [-1320, -1180]) lamp(m, x, y, 344, { size: [36, 36], depth: 6, color: [1, 0.92, 0.8], intensity: 0.8, radius: 700 });
  lamp(m, 340, -1250, 344, { size: [36, 36], depth: 6, color: [1, 0.92, 0.8], intensity: 0.8, radius: 700 });
  redLamp(m, 448, -1230, 160, 'w');
  redLamp(m, -704, -1500 + 30, 200, 'e', { intensity: 0.6 });
}

// ------------------------------------------------------------------ the ramp and the surface yard
function yard(m) {
  // the ramp: kerbs, tunnel lights, pipes
  for (const y of [-1472, -1264]) m.prism('y', [[-1728, SURF], [-704, L1], [-704, L1 + 8], [-1728, SURF + 8]], y, y + 16, { all: T.haz }, { detail: true, name: 'kerb' });
  for (let x = -1600; x <= -800; x += 256) {
    const zf = SURF * (x - -704) / (-1728 - -704);
    bulkhead(m, x, -1472, zf + 110, 'n', { color: SODIUM, intensity: 0.75, radius: 360 });
    bulkhead(m, x + 128, -1248, zf + 110 - 40, 's', { color: SODIUM, intensity: 0.75, radius: 360 });
  }
  m.prism('y', [[-1728, SURF + 160], [-704, L1 + 160], [-704, L1 + 168], [-1728, SURF + 168]], -1264, -1256, { all: T.metal }, { detail: true, name: 'pipe' });
  // the portal: frame and sign
  doorFrame(m, 'y', -1472, -1248, -1744, -1728, SURF, 176, { haz: true, w: 12 });
  sign(m, SG.sector9, 'w', -1744, -1440, -1280, SURF + 184, SURF + 216, { lit: true });
  // the guard post at the portal: a booth with two doors and windows
  const bx0 = -1920, by0 = -1600, bx1 = -1792, by1 = -1488, bz = SURF, bh = 112;
  wall(m, 'x', bx0, bx1, by0 - 8, by0, bz, bz + bh, { all: wallAt(SURF) }, [{ c: -1856, w: 64, z0: bz + 40, z1: bz + 96 }]);
  wall(m, 'x', bx0, bx1, by1, by1 + 8, bz, bz + bh, { all: wallAt(SURF) }, [{ c: -1872, w: 64 }]);
  wall(m, 'y', by0 - 8, by1 + 8, bx0 - 8, bx0, bz, bz + bh, { all: wallAt(SURF) }, [{ c: -1544, w: 64 }]);
  wall(m, 'y', by0 - 8, by1 + 8, bx1, bx1 + 8, bz, bz + bh, { all: wallAt(SURF) }, [{ c: -1544, w: 64, z0: bz + 40, z1: bz + 96 }]);
  glass(m, -1888, by0 - 6, bz + 40, -1824, by0 - 2, bz + 96, T.glass);
  glass(m, bx1 + 2, -1576, bz + 40, bx1 + 6, -1512, bz + 96, T.glass);
  prop(m, bx0 - 16, by0 - 24, bz + bh, bx1 + 16, by1 + 24, bz + bh + 8, { all: T.metal }, { name: 'booth_roof', detail: false });
  prop(m, bx0 + 8, by0 + 8, bz, bx0 + 72, by0 + 32, bz + 34, { all: T.wall, top: T.metal }, { name: 'desk' });
  lamp(m, -1856, -1544, bz + bh - 4, { size: [24, 12], color: WARM, intensity: 0.7, radius: 260 });
  // a boom barrier and jersey barriers
  prop(m, -1784, -1468, bz, -1772, -1456, bz + 40, T.metal, { name: 'boom' });
  prop(m, -1772, -1464, bz + 34, -1740, -1460, bz + 38, T.haz, { name: 'boom', contents: 0 });
  for (const [x, y, ax] of [[-2200, -1500, 'x'], [-2080, -1500, 'x'], [-2240, -1320, 'y']]) {
    if (ax === 'x') prop(m, x - 56, y - 12, bz, x + 56, y + 12, bz + 32, T.conc, { name: 'barrier' });
    else prop(m, x - 12, y - 56, bz, x + 12, y + 56, bz + 32, T.conc, { name: 'barrier' });
  }
  // the helipad (extraction): a raised pad with a hazard ring and an H, lit at the corners
  const hx = -2016, hy = -1776;
  prop(m, hx - 176, hy - 176, bz, hx + 176, hy + 176, bz + 4, { all: T.conc, top: T.cfloor }, { name: 'pad', detail: false });
  for (const [x0, y0, x1, y1] of [[-160, -160, 160, -144], [-160, 144, 160, 160], [-160, -144, -144, 144], [144, -144, 160, 144], [-72, -80, -48, 80], [48, -80, 72, 80], [-48, -12, 48, 12]]) prop(m, hx + x0, hy + y0, bz + 4, hx + x1, hy + y1, bz + 5, T.haz, { name: 'pad_mark' });
  for (const [dx, dy] of [[-168, -168], [168, -168], [-168, 168], [168, 168]]) {
    const b = prop(m, hx + dx - 5, hy + dy - 5, bz + 4, hx + dx + 5, hy + dy + 5, bz + 12, { all: T.red }, { name: 'padlight', castShadow: false });
    if (b) b.fullbright = true;
    m.light(hx + dx, hy + dy, bz + 26, [1, 0.25, 0.15], 0.5, 180);
  }
  // containers and supply cases against the walls, a fuel tank (drums)
  container(m, -2240, -1680, bz, 'y', { tex: 'container_blue', len: 240 });
  container(m, -1824, -1904, bz, 'x', { tex: 'container_blue', len: 240 });
  m.clip(-2288, -1800, bz + 102, -2192, -1560, 1600);
  m.clip(-1944, -1952, bz + 102, -1704, -1856, 1600);
  cases(m, -1980, -1260, bz, [[0, 0, 40, 40], [44, 0, 40, 32], [0, -44, 32, 32]]);
  for (const [x, y] of [[-1780, -1260], [-1760, -1290], [-1790, -1300]]) drum(m, x, y, bz, T.haz);
  // a chain-link fence on top of the retaining walls (out of reach: visual only)
  const fz = HILL, fh = 96;
  for (const [x0, y0, x1, y1] of [[-2304, -1984, -1728, -1984], [-2304, -1216, -2240, -1216], [-2112, -1216, -1728, -1216], [-2304, -1984, -2304, -1216], [-1728, -1984, -1728, -1472], [-1728, -1248, -1728, -1216]]) {
    const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
    const ox = dy ? (x0 < -2000 ? -24 : 24) : 0, oy = dx ? (y0 < -1600 ? -24 : 24) : 0;
    fence(m, x0 + ox, y0 + oy, x1 + ox, y1 + oy, fz, fh, T.fence, 2, { contents: 0, castShadow: false });
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 192));
    for (let k = 0; k <= n; k++) { const px = x0 + (x1 - x0) * k / n + ox, py = y0 + (y1 - y0) * k / n + oy; prop(m, px - 3, py - 3, fz, px + 3, py + 3, fz + fh + 8, T.metal, { contents: 0, name: 'post' }); }
  }
  // the main gate (closed for good) in the west wall: a chain-link gate panel and its frame
  fence(m, -2302, -1440, -2302, -1312, bz, 160, T.fence, 4, { contents: 0 });
  doorFrame(m, 'y', -1448, -1304, -2312, -2304, bz, 168, { haz: true, w: 8 });
  // the stairwell head: a frame and a red lamp
  doorFrame(m, 'x', -2240, -2112, -1232, -1216, bz, 176, { haz: true });
  redLamp(m, -2176, -1232, bz + 196, 's');
  sign(m, SG.elevator, 's', -1232, -2240, -2112, bz + 184, bz + 208);
  // floodlights (sodium) on poles round the yard, the moon does the rest
  streetLight(m, -2272, -1952, bz, 272, 'e', 40, { color: SODIUM, intensity: 1.0, radius: 760, pole: T.metal });
  streetLight(m, -1760, -1952, bz, 272, 'w', 40, { color: SODIUM, intensity: 1.0, radius: 760, pole: T.metal });
  streetLight(m, -2272, -1340, bz, 272, 'e', 40, { color: SODIUM, intensity: 1.0, radius: 720, pole: T.metal });
  streetLight(m, -1760, -1700, bz, 272, 'w', 40, { color: SODIUM, intensity: 0.95, radius: 700, pole: T.metal });
}

// ------------------------------------------------------------------ west: elevator, lab row, labs, decon, pump room
function west(m) {
  // the cargo elevator: a hazard portal over the shaft, a waist barrier, the stuck car above
  prop(m, -2320, -192, L0, -2304, -136, 256, T.conc, { detail: false, name: 'jamb' });
  prop(m, -2320, 136, L0, -2304, 192, 256, T.conc, { detail: false, name: 'jamb' });
  prop(m, -2320, -136, 184, -2304, 136, 256, T.conc, { detail: false, name: 'lintel' });
  doorFrame(m, 'y', -136, 136, -2324, -2300, L1, 184, { haz: true, w: 10 });
  prop(m, -2300, -136, L1 + 34, -2296, -40, L1 + 40, T.haz, { name: 'barrier' });
  prop(m, -2300, 40, L1 + 34, -2296, 136, L1 + 40, T.haz, { name: 'barrier' });
  for (const y of [-136, -40, 40, 136]) prop(m, -2300, y - 2, L1, -2296, y + 2, L1 + 34, T.metal, { name: 'barrier' });
  sign(m, SG.elevator, 'e', -2300, -64, 64, 196, 220, { lit: true });
  // the shaft: guide rails, the car stuck high up, buffers at the bottom
  for (const y of [-188, 188]) prop(m, -2420, y - 4, L0, -2380, y + 4, 480, T.metal, { name: 'guide' });
  prop(m, -2488, -184, 352, -2328, 184, 368, { all: T.metal, bottom: T.haz, top: T.grate }, { name: 'car', detail: false });
  for (const [x, y] of [[-2488, -184], [-2336, -184], [-2488, 176], [-2336, 176]]) prop(m, x, y, 368, x + 8, y + 8, 472, T.metal, { name: 'car' });
  prop(m, -2488, -184, 464, -2328, 184, 472, T.metal, { name: 'car' });
  pipe(m, 'z', 472, 480, -2408, -40, 4); pipe(m, 'z', 472, 480, -2408, 40, 4);
  for (const y of [-96, 96]) prop(m, -2440, y - 16, L0, -2408, y + 16, L0 + 32, T.haz, { name: 'buffer' });
  redLamp(m, -2496, 0, L0 + 140, 'e', { intensity: 0.8, radius: 420 });
  lamp(m, -2408, 0, 348, { size: [40, 24], color: [1, 0.3, 0.2], intensity: 0.7, radius: 420 }); // the car's underside glows red
  // the lobby: staging crates, a forklift, lights
  cases(m, -2200, 240, L1, [[0, 0, 40, 40], [44, 0, 40, 40], [0, 44, 40, 32], [22, 22, 32, 32, 40]]);
  cases(m, -1900, -260, L1, [[0, 0, 40, 40], [-44, 0, 32, 32]]);
  forklift(m, -2120, -220, L1, 'w');
  for (const [x, y] of [[-1880, 200], [-1940, 250]]) prop(m, x - 26, y - 26, L1, x + 26, y + 26, L1 + 8, T.metal, { name: 'pallet' });
  cases(m, -1880, 200, L1 + 8, [[0, 0, 32, 32]]);
  for (const [y0, y1] of [[-200, -192], [192, 200]]) prop(m, -2304, y0, L1, -2200, y1, L1 + 1, T.haz, { name: 'line' });
  prop(m, -2208, -200, L1, -2200, 200, L1 + 1, T.haz, { name: 'line' });
  for (const x of [-2176, -1920]) for (const y of [-200, 200]) tube(m, x, y, 256, { radius: 380, intensity: 0.8 });
  tube(m, -2144, -480, 160, { along: 'y', radius: 320, intensity: 0.7 });
  doorFrame(m, 'x', -2240, -2048, -336, -320, L1, 160);
  // the stairwell: wall lamps down its length
  for (let y = -1100; y <= -700; y += 200) bulkhead(m, -2240, y, (SURF * (y - -576) / (-1216 - -576)) + 110, 'e', { color: WARM, intensity: 0.75, radius: 320 });
  // lab row: tubes, pipes, frames, glass, signs
  for (let x = -1700; x <= -760; x += 188) tube(m, x, 0, 160, { radius: 320, intensity: 0.75 });
  pipe(m, 'x', -1792, -672, 64, 146, 5); pipe(m, 'x', -1792, -672, -64, 146, 5);
  for (const [x0, x1] of [[-1376, -1280], [-1024, -928]]) { doorFrame(m, 'x', x0, x1, 80, 112, L1, 112); doorFrame(m, 'x', x0, x1, -112, -80, L1, 112); }
  glass(m, -1248, 94, L1 + 40, -1056, 98, L1 + 136, T.glass);
  glass(m, -1248, -98, L1 + 40, -1056, -94, L1 + 136, T.glass);
  sign(m, SG.labA, 's', 80, -1232, -1072, L1 + 140, L1 + 156);
  sign(m, SG.labB, 'n', -80, -1232, -1072, L1 + 140, L1 + 156);
  doorFrame(m, 'y', -80, 80, -672, -640, L1, 144, { haz: true });
  // door leaves swung open into the labs, trolleys
  for (const x of [-1376, -1024]) { doorLeaf(m, 'x', x, 112, 1, L1, -1); doorLeaf(m, 'x', x, -112, -1, L1, -1); }
  cart(m, -1160, 330, L1, 'y'); cart(m, -860, -380, L1);
  // lab A (biology): benches with instruments, fume hoods on the north wall, a glass partition
  partition(m, 'y', 112, 560, -1152, L1, 112, [{ c: 200, w: 96 }, { c: 456, w: 96 }]);
  for (const [x, y] of [[-1336, 240], [-1336, 432], [-976, 240], [-976, 432]]) bench(m, x, y, L1, 'x', 208, { kit: [[-60, 20, 32], [50, 16, 30]] });
  for (const x of [-1424, -1280, -1040, -896]) {
    prop(m, x - 56, 512, L1, x + 56, 560, L1 + 36, { all: T.wall, top: T.metal }, { name: 'hood' });
    prop(m, x - 56, 536, L1 + 36, x + 56, 560, L1 + 112, T.metal, { name: 'hood' });
    glass(m, x - 52, 530, L1 + 40, x + 52, 534, L1 + 100, T.glass);
  }
  for (const [x, y] of [[-1300, 330], [-1000, 330]]) tube(m, x, y, 176, { radius: 340, intensity: 0.85 });
  for (const [x, y] of [[-1400, 180], [-900, 180], [-1400, 500], [-900, 500]]) tube(m, x, y, 176, { radius: 300, intensity: 0.7 });
  // lab B (chemistry): a glass partition across, benches, chemical shelves and drums
  partition(m, 'x', -1472, -832, -336, L1, 112, [{ c: -1376, w: 96 }, { c: -928, w: 96 }]);
  for (const [x, y] of [[-1320, -224], [-984, -224]]) bench(m, x, y, L1, 'x', 224, { kit: [[0, 18, 32]] });
  for (const [x, y] of [[-1320, -460], [-984, -460]]) bench(m, x, y, L1, 'x', 192, { kit: [[-40, 16, 30]] });
  for (const x of [-1440, -1312, -1184]) prop(m, x - 56, -560, L1, x + 56, -532, L1 + 112, T.metal, { name: 'shelf' });
  for (const [x, y] of [[-880, -520], [-860, -490], [-890, -480]]) drum(m, x, y, L1, T.haz);
  for (const [x, y] of [[-1300, -224], [-1000, -224], [-1300, -460], [-1000, -460]]) tube(m, x, y, 176, { radius: 320, intensity: 0.8 });
  doorFrame(m, 'y', -448, -352, -832, -640, L1, 112);
  doorFrame(m, 'y', 352, 448, -832, -640, L1, 112);
  doorFrame(m, 'y', 400, 496, -1600, -1472, L1, 112, { haz: true });
  // decon: airlock frames, shower heads, the sign, cool lights; red lamps at the locks
  for (const y of [180, 640, 1120, 1600]) {
    prop(m, -1760, y - 12, L1, -1740, y + 12, L1 + 160, T.haz, { name: 'airlock' });
    prop(m, -1620, y - 12, L1, -1600, y + 12, L1 + 160, T.haz, { name: 'airlock' });
    prop(m, -1760, y - 12, L1 + 136, -1600, y + 12, L1 + 160, T.haz, { name: 'airlock' });
    redLamp(m, -1680, y - 12, L1 + 124, 's', { intensity: 0.55, radius: 240 });
  }
  for (let y = 300; y < 1900; y += 160) for (const x of [-1720, -1640]) prop(m, x - 3, y - 3, L1 + 150, x + 3, y + 3, L1 + 160, T.metal, { name: 'nozzle' });
  for (let y = 400; y < 1900; y += 240) tube(m, -1680, y, 160, { along: 'y', color: [0.75, 0.9, 1.0], radius: 320, intensity: 0.8 });
  for (let x = -1500; x < -700; x += 240) tube(m, x, 1904, 160, { color: [0.75, 0.9, 1.0], radius: 320, intensity: 0.8 });
  sign(m, SG.decon, 'w', -1600, 200, 440, L1 + 112, L1 + 136, { lit: true });
  // the pump branch and the pump room: pipes, pumps, the breaker panel
  for (let y = -820; y < -100; y += 240) bulkhead(m, -1728, y, L0 + 110, 'e', { intensity: 0.7, radius: 300 });
  pipe(m, 'y', -896, -80, -1612, L0 + 140, 8);
  for (const [x, y] of [[-1640, -1090], [-1490, -1112], [-1340, -1112]]) {
    m.prism('z', [[x - 40, y - 16], [x - 16, y - 40], [x + 16, y - 40], [x + 40, y - 16], [x + 40, y + 16], [x + 16, y + 40], [x - 16, y + 40], [x - 40, y + 16]], L0, L0 + 320, { all: T.metal, top: T.metal }, { name: 'pump', surface: 'metal' });
  }
  pipe(m, 'x', -1728, -1088, -1160, L0 + 260, 14);
  prop(m, -1200, -1184, L0 + 40, -1120, -1176, L0 + 136, { all: T.metal, n: T.haz }, { name: 'breaker' });
  redLamp(m, -1160, -1176, L0 + 150, 'n');
  for (const [x, y] of [[-1640, -960], [-1300, -960], [-1560, -1160], [-1220, -1040]]) lamp(m, x, y, L0 + 316, { size: [28, 28], color: WARM, intensity: 0.95, radius: 520 });
  // valves and gauges on the pump risers
  for (const [x, y] of [[-1640, -1090], [-1490, -1112], [-1340, -1112]]) { prop(m, x - 6, y + 40, L0 + 40, x + 6, y + 52, L0 + 52, T.haz, { name: 'valve', contents: 0 }); prop(m, x - 44, y - 44, L0 + 96, x + 44, y + 44, L0 + 104, T.haz, { name: 'band', contents: 0 }); }
  stairRail(m, -1344, -1026, L0 + 64, -1088, -1026, L1);
  for (const x of [-960, -780]) bulkhead(m, x, -1024, L1 + 90, 'n', { radius: 260 });
}

// ------------------------------------------------------------------ containment
function containment(m) {
  // the cell block: red emergency lamps, a few tubes still working, cell fronts
  for (let y = 760; y < 1840; y += 216) {
    redLamp(m, -128, y, 128, 'e', { intensity: 1.0, radius: 400 });
    redLamp(m, 128, y + 108, 128, 'w', { intensity: 1.0, radius: 400 });
  }
  for (const y of [760, 1500, 1780]) tube(m, 0, y, 176, { along: 'y', radius: 300, intensity: 0.6 });
  tube(m, 0, 1184, 160, { radius: 300, intensity: 0.6 });
  for (const [k, x0, x1, fx] of [['w', -448, -160, -160], ['e', 160, 448, 128]]) {
    for (const [r, y0, yd, yw, yb] of [[1, 736, 1000, 768, 800], [2, 1312, 1368, 1456, 1568]]) {
      doorFrame(m, 'y', yd - 48, yd + 48, fx, fx + 32, L1, 112, { haz: true });
      glass(m, fx + 14, yw, L1 + 40, fx + 18, yw + 160, L1 + 136, T.glass);
      // the cell: a bed slab, a restraint chair, a lamp; rubble by the breach
      const cx = (x0 + x1) / 2, back = k === 'w' ? x0 : x1;
      prop(m, back - (k === 'w' ? 0 : 64), y0 + (r === 1 ? 200 : 16), L1, back + (k === 'w' ? 64 : 0), y0 + (r === 1 ? 300 : 116), L1 + 20, { all: T.metal, top: T.wall }, { name: 'bed' });
      prop(m, cx - 16, y0 + 140, L1, cx + 16, y0 + 172, L1 + 36, T.metal, { name: 'chair' });
      lamp(m, cx, y0 + 160, 156, { size: [24, 24], color: [0.9, 0.95, 1.0], intensity: 0.55, radius: 260 });
      const bx = k === 'w' ? x0 + 24 : x1 - 24;
      for (const [dx, dy, s, h] of [[0, -60, 28, 16], [10, 64, 22, 12], [-6, 30, 16, 24]]) prop(m, bx + dx * (k === 'w' ? 1 : -1) - s / 2, yb + dy - s / 2, L1, bx + dx * (k === 'w' ? 1 : -1) + s / 2, yb + dy + s / 2, L1 + h, T.conc, { name: 'rubble' });
    }
  }
  // passages: pipes and lamps
  for (const x of [-544, 544]) {
    pipe(m, 'y', 672, 1856, x + (x < 0 ? -50 : 50), 144, 6);
    for (let y = 780; y < 1856; y += 300) bulkhead(m, x + (x < 0 ? -64 : 64), y, 110, x < 0 ? 'e' : 'w', { color: [1, 0.3, 0.2], intensity: 0.7, radius: 340 });
  }
  for (const x of [-360, 360]) tube(m, x, 1184, 160, { radius: 280, intensity: 0.6 });
  doorFrame(m, 'x', -96, 96, 640, 672, L1, 128, { haz: true });
  doorFrame(m, 'x', -608, -480, 640, 672, L1, 128);
  doorFrame(m, 'x', 480, 608, 640, 672, L1, 128);
  // the vault: specimen pods (some broken), green glow, the breach in the north wall
  const pods = [[-448, 1980, 1], [-224, 1980, 0], [224, 1980, 1], [448, 1980, 1], [-448, 2080, 0], [448, 2080, 1], [-224, 2100, 1], [224, 2100, 0]];
  for (const [x, y, ok] of pods) {
    const oct = (r) => { const p = []; for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; p.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } return p; };
    m.prism('z', oct(36), L1, L1 + 24, { all: T.metal, top: T.metal }, { name: 'pod', surface: 'metal' });
    if (ok) {
      const c = m.prism('z', oct(24), L1 + 24, L1 + 160, { all: { name: T.tank, fit: true } }, { name: 'pod_core', detail: true });
      c.fullbright = true; c.castShadow = false;
      m.prism('z', oct(30), L1 + 24, L1 + 160, { all: T.glass }, { contents: 2, detail: true, surface: 'glass', name: 'pod_glass', castShadow: false });
      m.prism('z', oct(34), L1 + 160, L1 + 184, { all: T.metal }, { name: 'pod_cap', surface: 'metal' });
      m.light(x, y - 50, L1 + 100, GREEN, 0.55, 300);
    } else {
      m.prism('z', oct(34), L1 + 24, L1 + 36, { all: T.metal }, { name: 'pod_broken', detail: true });
      m.prism('z', oct(34), L1 + 200, L1 + 224, { all: T.metal }, { name: 'pod_cap', surface: 'metal' });
    }
    pipe(m, 'z', L1 + 184, 288, x, y, 6);
  }
  // the breach: rubble heaped against a torn-open stretch of the north wall
  for (const [x0, x1, h] of [[-160, -80, 24], [-80, 64, 36], [64, 160, 20]]) prop(m, x0, 2144, L1, x1, 2176, L1 + h, T.conc, { name: 'rubble' });
  m.prism('x', [[2120, L1], [2176, L1], [2176, L1 + 30]], -64, 48, { all: T.conc }, { detail: true, name: 'rubble' });
  sign(m, SG.containment, 's', 2176, -128, 128, 220, 252, { lit: true });
  for (const x of [-416, 0, 416]) for (const y of [1916, 2100]) lamp(m, x, y, 284, { size: [40, 20], color: COOL, intensity: 0.75, radius: 420 });
  for (const x of [-620, 620]) redLamp(m, x, 2016, 160, x < 0 ? 'e' : 'w', { intensity: 0.8, radius: 420 });
  redLamp(m, 0, 2176, 200, 's', { intensity: 0.8, radius: 420 });
}

// ------------------------------------------------------------------ the lower labs (L0)
function lowerLabs(m) {
  // (the low end stays open: the only way on from the hall)
  stairRail(m, -1406, 1184, L0 + 56, -1406, 1504, L1);
  stairRail(m, -962, 1184, L0 + 56, -962, 1504, L1);
  // autopsy tables, the cold-storage wall, specimen jars on a bench, a glass booth
  for (const [x, y] of [[-1260, 960], [-1100, 960], [-1260, 1180], [-1100, 1180]]) {
    prop(m, x - 6, y - 6, L0, x + 6, y + 6, L0 + 30, T.metal, { name: 'table' });
    prop(m, x - 40, y - 18, L0 + 30, x + 40, y + 18, L0 + 34, T.metal, { name: 'table' });
  }
  prop(m, -1408, 1300, L0, -1376, 1504, L0 + 96, { all: T.metal, e: { name: T.server, fit: true } }, { name: 'drawers' });
  bench(m, -1040, 1400, L0, 'y', 160, { kit: [[-40, 14, 30], [20, 14, 30]] });
  partition(m, 'x', -1408, -1200, 1300, L0, 112, [{ c: -1260, w: 72 }]);
  for (const [x, y] of [[-1280, 900], [-1080, 900], [-1300, 1150], [-1060, 1150], [-1180, 1400]]) tube(m, x, y, -4, { radius: 320, intensity: 0.85 });
  m.light(-1040, 1400, L0 + 90, GREEN, 0.4, 260);
  redLamp(m, -1408, 900, L0 + 120, 'e', { intensity: 0.6 });
  sign(m, SG.lower, 'e', -1600, 1520, 1680, L1 + 112, L1 + 132);
  sign(m, SG.lower, 'w', -608, 1520, 1680, L1 + 112, L1 + 132);
  tube(m, -1504, 1600, 160, { radius: 300, intensity: 0.7 });
  tube(m, -784, 1600, 160, { radius: 300, intensity: 0.7 });
  for (const y of [1180, 1400]) { bulkhead(m, -1536, y, (y - 1056) / 448 * 192 + L0 + 110, 'e', { intensity: 0.6, radius: 280 }); bulkhead(m, -832, y, (y - 1056) / 448 * 192 + L0 + 110, 'w', { intensity: 0.6, radius: 280 }); }
}

// ------------------------------------------------------------------ east
function east(m) {
  // the east corridor and its tunnel underneath
  for (let x = 760; x <= 1420; x += 165) tube(m, x, 0, 160, { radius: 320, intensity: 0.75 });
  pipe(m, 'x', 672, 1472, 62, 146, 5);
  doorFrame(m, 'y', -80, 80, 640, 672, L1, 144, { haz: true });
  for (let x = 420; x < 1472; x += 260) bulkhead(m, x, -80, L0 + 110, 'n', { intensity: 0.7, radius: 320 });
  for (let x = -2200; x < -400; x += 260) bulkhead(m, x, 80, L0 + 110, 's', { intensity: 0.7, radius: 320 });
  pipe(m, 'x', 320, 1472, -64, L0 + 140, 8); pipe(m, 'x', -2304, -320, 64, L0 + 140, 8);
  // the server room: rack rows (hot / cold aisles), cooling units, the upload terminal
  for (const [y, f] of [[272, 's'], [432, 'n'], [592, 's']]) {
    for (let x = 864; x <= 1312; x += 48) { if (x > 1040 && x < 1136) continue; rack(m, x, y, L1, f); }
    prop(m, 840, y - 8, 150, 1336, y + 8, 154, T.metal, { name: 'tray' });
  }
  for (const y of [240, 520]) prop(m, 1344, y, L1, 1408, y + 128, L1 + 96, { all: T.metal, w: T.haz }, { name: 'crac' });
  prop(m, 820, 740, L1, 900, 780, L1 + 36, { all: T.metal }, { name: 'terminal' });
  const scr = prop(m, 830, 772, L1 + 36, 890, 778, L1 + 72, { all: T.metal, s: { name: T.tank, fit: true } }, { name: 'monitor' });
  if (scr) { scr.fullbright = true; scr.castShadow = false; }
  for (const x of [880, 1088, 1296]) for (const y of [352, 512, 704]) tube(m, x, y, 192, { color: BLUE, radius: 320, intensity: 0.8 });
  for (const [x0, x1] of [[896, 1024], [1216, 1344]]) { doorFrame(m, 'x', x0, x1, 80, 144, L1, 112); doorFrame(m, 'x', x0, x1, -144, -80, L1, 112); }
  doorFrame(m, 'y', 640, 736, 608, 768, L1, 112);
  sign(m, SG.server, 's', 80, 1040, 1200, L1 + 120, L1 + 140, { lit: true });
  sign(m, SG.cafe, 'n', -80, 1060, 1180, L1 + 120, L1 + 140, { lit: true });
  for (const x of [896, 1216]) { doorLeaf(m, 'x', x, 144, 1, L1, -1); doorLeaf(m, 'x', x, -144, -1, L1, -1); }
  // the end of the east hall: an air-handling grille and its lamp
  prop(m, 1464, -64, L1 + 16, 1472, 64, L1 + 136, T.metal, { name: 'grille' });
  for (let z = L1 + 24; z < L1 + 132; z += 12) prop(m, 1458, -60, z, 1464, 60, z + 4, T.metal, { name: 'louvre' });
  redLamp(m, 1472, 0, L1 + 148, 'w', { intensity: 0.6, radius: 260 });
  // the cafeteria: tables, the serving counter and the kitchen behind it, vending machines
  for (const x of [880, 1060]) for (const y of [-260, -440, -620]) table(m, x, y, L1, 'x', 112);
  prop(m, 1216, -720, L1, 1240, -256, L1 + 40, { all: T.wall, top: T.metal }, { name: 'counter' });
  prop(m, 1212, -720, L1 + 40, 1244, -256, L1 + 42, T.metal, { name: 'counter' });
  for (const y of [-680, -560]) prop(m, 1340, y, L1, 1408, y + 96, L1 + 36, { all: T.metal, top: T.metal }, { name: 'range' });
  prop(m, 1344, -360, L1, 1408, -232, L1 + 112, T.metal, { name: 'fridge' });
  for (const y of [-720, -600]) prop(m, 768, y, L1, 800, y + 64, L1 + 96, { all: T.metal, e: { name: T.server, fit: true } }, { name: 'vending' });
  for (const x of [880, 1080]) for (const y of [-300, -600]) tube(m, x, y, 192, { color: WARM, radius: 360, intensity: 0.85 });
  for (const y of [-680, -480, -280]) tube(m, 1320, y, 192, { along: 'y', color: WARM, radius: 300, intensity: 0.75 });
  doorFrame(m, 'x', 1280, 1408, -800, -784, L1, 128);
  doorFrame(m, 'y', -784, -688, 752, 768, L1, 128);
  // kitchen service corridor: shelves
  for (const y of [-1180, -1000]) prop(m, 1376, y, L1, 1408, y + 96, L1 + 96, T.metal, { name: 'shelf' });
  tube(m, 1344, -1050, 144, { along: 'y', radius: 300, intensity: 0.7 });
  // the freight tunnel: rails, a cart with cases, the cave-in at the end
  for (const y of [-1400, -1320]) prop(m, 448, y - 2, L1, 1536, y + 2, L1 + 2, T.metal, { name: 'rail_track' });
  prop(m, 900, -1400, L1 + 6, 1060, -1320, L1 + 24, T.metal, { name: 'cart' });
  cases(m, 940, -1360, L1 + 24, [[0, 0, 40, 40], [44, 0, 40, 32]]);
  for (const [x0, x1, h] of [[1440, 1536, 192], [1400, 1440, 112], [1360, 1400, 72], [1320, 1360, 32]]) prop(m, x0, -1472, L1, x1, -1248, L1 + h, T.conc, { name: 'collapse', detail: false });
  for (const [x, y, s, h] of [[1280, -1440, 36, 24], [1270, -1300, 30, 18], [1240, -1380, 24, 30]]) prop(m, x - s / 2, y - s / 2, L1, x + s / 2, y + s / 2, L1 + h, T.conc, { name: 'rubble' });
  for (let x = 600; x < 1400; x += 256) bulkhead(m, x, -1472, L1 + 120, 'n', { color: WARM, intensity: 0.75, radius: 360 });
  redLamp(m, 1352, -1360, L1 + 100, 'w', { intensity: 0.9 });
  // the vent sump: duct mouths, a fan housing, pipes
  for (const y of [-160, 160]) {
    prop(m, 1712, y - 56, L0 + 16, 1728, y + 56, L0 + 128, T.metal, { name: 'duct' });
    for (let z = L0 + 24; z < L0 + 124; z += 12) prop(m, 1704, y - 52, z, 1712, y + 52, z + 4, T.metal, { name: 'louvre' });
  }
  pipe(m, 'y', -224, 224, 1500, L0 + 180, 10);
  redLamp(m, 1600, -224, L0 + 150, 'n', { intensity: 0.8 });
  bulkhead(m, 1600, 224, L0 + 150, 's', { color: BLUE, intensity: 0.7, radius: 340 });
}



// ------------------------------------------------------------------ second pass: fittings that make it read as built
function extras(m) {
  const NC = { contents: 0 };
  // atrium: electrical cabinets and conduit under the galleries, vent grilles high on the walls
  for (const [x, y, f] of [[-300, 624, 's'], [300, 624, 's'], [-624, 260, 'e'], [624, -260, 'w'], [-200, -624, 'n']]) {
    const [hx, hy] = f === 'n' || f === 's' ? [40, 12] : [12, 40];
    const cx = f === 'e' ? x + 4 : f === 'w' ? x - 4 : x, cy = f === 'n' ? y + 4 : f === 's' ? y - 4 : y;
    prop(m, cx - hx, cy - hy, L1, cx + hx, cy + hy, L1 + 96, { all: T.metal, [f]: { name: T.server, fit: true } }, { name: 'cabinet' });
    if (f === 'n' || f === 's') pipe(m, 'z', L1 + 96, L2 - 32, x - 20, cy, 4); else pipe(m, 'z', L1 + 96, L2 - 32, cx, y - 20, 4);
  }
  for (const u of [-448, 0, 448]) {
    for (let z = 300; z < 380; z += 10) {
      prop(m, u - 64, 632, z, u + 64, 640, z + 4, T.metal, { name: 'louvre', ...NC });
      prop(m, u - 64, -640, z, u + 64, -632, z + 4, T.metal, { name: 'louvre', ...NC });
    }
  }
  // cable trays along the main corridors
  prop(m, -1792, 40, 140, -672, 56, 143, T.metal, { name: 'tray', ...NC });
  prop(m, 672, -56, 140, 1472, -40, 143, T.metal, { name: 'tray', ...NC });
  prop(m, 40, 672, 156, 56, 1856, 159, T.metal, { name: 'tray', ...NC });
  // the tunnels: pipe racks on both walls
  for (const [x0, x1] of [[-2304, -320], [320, 1472]]) {
    pipe(m, 'x', x0, x1, -70, L0 + 110, 5); pipe(m, 'x', x0, x1, 70, L0 + 120, 6);
    for (let x = x0 + 64; x < x1; x += 256) { prop(m, x, -80, L0 + 100, x + 4, -60, L0 + 104, T.metal, { name: 'bracket', ...NC }); prop(m, x, 60, L0 + 110, x + 4, 80, L0 + 114, T.metal, { name: 'bracket', ...NC }); }
  }
  // the dock: pallet stacks, a parts cage (chain-link), more light in the north-east corner
  for (const [x, y] of [[-620, -1180], [-620, -1240]]) { prop(m, x - 30, y - 26, L1, x + 30, y + 26, L1 + 8, T.metal, { name: 'pallet' }); cases(m, x, y, L1 + 8, [[0, 0, 32, 32]]); }
  for (const [x0, y0, x1, y1] of [[320, -1220, 440, -1220], [320, -1220, 320, -1140]]) prop(m, Math.min(x0, x1) - 1, Math.min(y0, y1) - 1, L1, Math.max(x0, x1) + 1, Math.max(y0, y1) + 1, L1 + 112, T.fence, { name: 'cage', ...NC });
  lamp(m, 360, -760, 344, { size: [36, 36], depth: 6, color: [1, 0.92, 0.8], intensity: 0.75, radius: 560 });
  // the cell block: a guard desk at the crossing
  prop(m, 160, 1160, L1, 224, 1210, L1 + 36, { all: T.wall, top: T.metal }, { name: 'desk' });
  const scr = prop(m, 170, 1200, L1 + 36, 214, 1206, L1 + 62, { all: T.metal, s: { name: T.tank, fit: true } }, { name: 'monitor' });
  if (scr) { scr.fullbright = true; scr.castShadow = false; }
  // the vault: a control desk facing the pods, an overhead pipe manifold
  prop(m, -96, 1880, L1, 96, 1912, L1 + 36, { all: T.metal, top: T.metal }, { name: 'console' });
  for (const x of [-60, 0, 60]) { const b = prop(m, x - 20, 1904, L1 + 36, x + 20, 1910, L1 + 62, { all: T.metal, n: { name: T.tank, fit: true } }, { name: 'monitor' }); if (b) { b.fullbright = true; b.castShadow = false; } }
  pipe(m, 'x', -640, 640, 2040, 260, 10);
  pipe(m, 'x', -640, 640, 2150, 250, 7);
  // the yard: a sandbag line by the portal, a parked utility van
  prop(m, -1890, -1420, SURF, -1810, -1396, SURF + 32, { all: T.crate }, { name: 'sandbags' });
  prop(m, -2200, -1440, SURF + 20, -2040, -1360, SURF + 116, { all: T.wall, top: T.metal, w: T.glass }, { name: 'van', detail: false });
  m.clip(-2190, -1430, SURF, -2050, -1370, SURF + 20);
  for (const [x, y] of [[-2170, -1446], [-2070, -1446], [-2170, -1354], [-2070, -1354]]) prop(m, x - 14, y - 4, SURF, x + 14, y + 4, SURF + 26, T.metal, { name: 'wheel', ...NC });
  // the server room: cable ladders over the rack rows
  for (const x of [880, 1296]) prop(m, x - 8, 200, 168, x + 8, 760, 171, T.metal, { name: 'tray', ...NC });
  // labs: wall cabinets (high: out of reach) and an eyewash station
  for (const x of [-1440, -1300, -1000, -860]) prop(m, x - 40, 128, L1 + 80, x + 40, 148, L1 + 130, { all: T.metal, n: T.wall }, { name: 'wallcab', ...NC });
  prop(m, -840, -136, L1 + 20, -820, -118, L1 + 64, T.haz, { name: 'eyewash', ...NC });
}

export { ROCK, SURF, wallAt };
