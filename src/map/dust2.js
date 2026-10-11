// de_dust2 — layout measured from the map's navigation mesh and radar overview
// (GoldSrc/Source coordinates; T spawn south, CT spawn north, A east, B west).
//
// Floors are "areas"; the building mass around them is generated automatically
// (see areagen.js). Low walls, crates, doors, arches and ceilings are placed by hand.

import { AreaMap } from './areagen.js';
import { boxBrush, prismBrush } from './brush.js';

const SAND = 'ground_sand';
const STONE = 'ground_stone';
const DIRT = 'ground_dirt';

export function buildDust2() {
  const m = new AreaMap([-2432, -1312, 2016, 3296]);

  // ------------------------------------------------------------------ T SPAWN
  m.A('t_spawn', -1784, -1064, -1000, -256, 128, { tex: SAND, wall: 192 });
  m.A('t_spawn_n', -1784, -256, -1248, -144, 128, { tex: SAND, wall: 192 });
  m.A('t_spawn_alcove', -1088, -408, -960, -160, 128, { tex: SAND, wall: 192 });
  m.A('t_spawn_w', -2224, -1040, -1808, -616, 128, { tex: SAND, wall: 208 });
  m.P('t_spawn_wcorner', [[-2224, -616], [-2080, -616], [-2080, -500], [-2108, -500]], 120, { tex: SAND, wall: 208 });
  m.R('t_ramp', -2080, -616, -1808, -124, 8, 128, 's', { tex: STONE, wall: 256 });
  m.A('t_spawn_e', -1000, -1040, -760, -608, 128, { tex: SAND, wall: 192 });
  m.R('t_spawn_e2', -760, -1040, -504, -608, 112, 128, 'w', { tex: SAND, wall: 192 });
  m.R('t_exit', -504, -1040, -40, -632, 0, 112, 'w', { tex: STONE, wall: 224 });
  m.R('t_exit_s', -328, -1184, -40, -1040, 0, 70, 'w', { tex: STONE, wall: 224 });
  // low walls around T spawn's raised edges
  m.zone(-1808, -616, -1784, -124, { height: 160, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });
  m.zone(-1784, -144, -1248, -124, { height: 160, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });
  m.zone(-1808, -632, -1784, -616, { height: 160, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });

  // ------------------------------------------------------- OUTSIDE LONG / TOP MID
  m.A('ol_plaza', -40, -1040, 448, -600, 0, { tex: SAND, wall: 224 });
  m.A('ol_pocket', -40, -1184, 168, -1040, 0, { tex: SAND, wall: 224 });
  m.A('topmid_s', -512, -600, 448, -440, 0, { tex: SAND, wall: 256 });
  m.A('ol_main', 112, -360, 752, 304, 0, { tex: SAND, wall: 240 });
  m.A('ol_main2', 112, -440, 448, -360, 0, { tex: SAND, wall: 240 });
  m.A('topmid_w', -512, -440, -384, 304, 0, { tex: SAND, wall: 256 });
  m.P('topmid_n', [[-712, 304], [448, 304], [448, 512], [-736, 512]], 0, { tex: SAND, wall: 256 });
  m.A('mid_w', -640, 512, -512, 768, 8, { tex: SAND, wall: 256 });

  // ------------------------------------------------------------------ MID
  m.A('mid_top', -512, 512, -136, 800, 0, { tex: SAND, wall: 288 });
  m.R('mid', -544, 800, -264, 1344, -124, 0, 's', { tex: SAND, wall: 288 });
  m.A('mid_lower', -512, 1344, -264, 1640, -128, { tex: SAND, wall: 288 });
  m.A('catwalk', -240, 800, -136, 1344, 0, { tex: STONE, wall: 224 });
  m.A('cat_end', -240, 1344, 264, 1600, 0, { tex: STONE, wall: 224 });
  m.A('short_base', 264, 1344, 504, 1648, 0, { tex: STONE, wall: 224 });
  m.A('short_nook', 384, 1648, 504, 1792, 0, { tex: STONE, wall: 224 });
  m.S('short_stairs', 264, 1648, 384, 1792, 0, 96, 'n', 6, { tex: STONE, wall: 224 });
  // catwalk ledge between mid and catwalk
  m.zone(-264, 800, -240, 1344, { height: 32, tex: 'wall_stone', capTex: 'trim_band', roof: STONE });
  m.zone(-264, 1344, -240, 1600, { height: 16, tex: 'wall_stone', capTex: null, roof: STONE });

  // mid doors and CT mid
  m.A('mid_doors', -512, 1640, -336, 1680, -128, { tex: SAND, wall: 256 });
  m.A('ct_mid', -592, 1680, -320, 2096, -124, { tex: SAND, wall: 256 });

  // ------------------------------------------------------------------ CT SPAWN
  m.A('ct_spawn', -576, 2096, 264, 2328, -128, { tex: SAND, wall: 288 });
  m.A('ct_spawn_ne', 0, 2328, 264, 2456, -128, { tex: SAND, wall: 288 });
  m.A('ct_spawn_n', 88, 2456, 264, 2560, -124, { tex: SAND, wall: 288 });
  m.R('ct_west', -1104, 2096, -576, 2584, -124, 0, 'w', { tex: SAND, wall: 256 });
  m.A('ct_nw', -576, 2328, -312, 2584, -120, { tex: SAND, wall: 256 });
  // passage under the short-A walkway
  m.A('ct_under', 264, 2064, 504, 2552, -124, { tex: SAND, wall: 220 });

  // ------------------------------------------------------------------ A SITE
  m.A('short_a', 264, 1792, 504, 2064, 96, { tex: STONE, wall: 192 });
  m.A('short_bridge', 264, 2064, 504, 2552, 96, { tex: STONE, wall: 192, slab: true, slabDepth: 24, ignoreGround: false });
  m.A('a_plat_w', 264, 2552, 504, 2792, 96, { tex: SAND, wall: 192 });
  m.A('a_plat', 504, 2440, 1264, 2792, 96, { tex: SAND, wall: 192 });
  m.R('under_a', 504, 2064, 1056, 2392, -124, 0, 'e', { tex: SAND, wall: 224 });
  m.A('under_a2', 1056, 2064, 1288, 2392, 0, { tex: SAND, wall: 224 });
  m.A('a_north', 1008, 2800, 1288, 3104, 128, { tex: SAND, wall: 192 });
  m.A('a_north2', 1288, 2840, 1600, 3104, 128, { tex: SAND, wall: 192 });
  m.R('a_ramp', 1288, 2296, 1616, 2840, 0, 120, 'n', { tex: STONE, wall: 208 });
  m.R('a_site_ramp', 1208, 2720, 1288, 2800, 96, 128, 'n', { tex: STONE, wall: 192 });
  // A site edge parapets
  m.zone(504, 2392, 1288, 2440, { height: 128, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });
  m.zone(1264, 2440, 1288, 2720, { height: 128, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });
  m.zone(1008, 2792, 1208, 2800, { height: 128, tex: 'wall_stone', capTex: null, roof: SAND });

  // ------------------------------------------------------------------ LONG A
  m.A('ol_doors1', 560, 304, 736, 336, 0, { tex: SAND, wall: 192 });
  m.A('long_doors', 512, 336, 752, 784, 0, { tex: SAND, wall: 192 });
  m.A('ol_doors2', 552, 784, 712, 840, 0, { tex: SAND, wall: 192 });
  m.A('long_s', 960, 200, 1216, 840, 0, { tex: SAND, wall: 224 });
  m.A('long_x', 504, 840, 1600, 1216, 0, { tex: SAND, wall: 224 });
  m.A('long_x2', 1600, 840, 1792, 1056, 0, { tex: SAND, wall: 224 });
  m.A('long_a', 1224, 1216, 1600, 1800, 0, { tex: SAND, wall: 224 });
  m.A('long_corner', 1224, 1800, 1792, 2296, 0, { tex: SAND, wall: 224 });
  m.R('pit', 1248, 352, 1552, 840, -184, 0, 'n', { tex: DIRT, wall: 0 });
  m.A('pit_floor', 1248, 184, 1552, 352, -184, { tex: DIRT, wall: 200 });
  m.A('side', 1584, 296, 1776, 712, 56, { tex: SAND, wall: 176 });
  m.S('side_stairs', 1584, 712, 1776, 840, 0, 56, 's', 4, { tex: STONE, wall: 176 });
  // pit rims
  m.zone(1216, 184, 1248, 760, { height: 32, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });
  m.zone(1552, 184, 1584, 760, { height: 80, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });

  // ------------------------------------------------------------- OUTSIDE TUNNELS
  m.P('out_tunnels', [[-2064, -124], [-1424, -124], [-1296, 48], [-1296, 200], [-1336, 512], [-2064, 512]], 0, { tex: SAND, wall: 224 });
  m.R('ot_step', -1832, 512, -1552, 544, 0, 32, 'n', { tex: STONE, wall: 224 });
  m.A('ot_up', -2064, 544, -1312, 640, 32, { tex: SAND, wall: 192 });
  m.A('ot_up2', -1936, 640, -1344, 712, 32, { tex: SAND, wall: 192 });
  m.zone(-2064, 512, -1832, 544, { height: 64, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });
  m.zone(-1552, 512, -1312, 544, { height: 64, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });

  // ------------------------------------------------------------- TUNNELS
  const TUN = { tex: DIRT, wall: 160, wallTex: 'wall_tunnel', ceilTex: 'wood_planks' };
  m.A('tun_entry', -1728, 712, -1608, 1008, 32, { ...TUN, ceil: 160 });
  m.A('upper_tun', -2192, 1008, -1272, 1336, 32, { ...TUN, ceil: 160 });
  m.A('upper_tun_nw', -2192, 1336, -1680, 1440, 32, { ...TUN, ceil: 160 });
  m.A('b_tunnel', -2048, 1440, -1920, 1776, 32, { ...TUN, ceil: 160 });
  m.R('b_tunnel_exit', -2048, 1776, -1920, 1832, 0, 32, 's', { ...TUN, tex: STONE, ceil: 160 });
  m.S('tun_stairs1', -1272, 1024, -1144, 1152, -24, 32, 'w', 6, { ...TUN, ceil: 160, tex: STONE });
  m.S('tun_stairs2', -1144, 1024, -1024, 1328, -112, -24, 's', 9, { ...TUN, ceil: 72, tex: STONE });
  m.A('lower_tun', -1200, 1328, -512, 1552, -116, { ...TUN, ceil: 16 });

  // ------------------------------------------------------------------ B SITE
  m.A('b_main', -2192, 1824, -1344, 2464, 0, { tex: SAND, wall: 224 });
  m.P('b_south', [[-1712, 1648], [-1600, 1648], [-1344, 1904], [-1712, 1904]], 0, { tex: SAND, wall: 224 });
  m.A('b_ne', -1408, 2464, -1344, 2592, 0, { tex: SAND, wall: 224 });
  m.P('b_site', [[-1712, 2464], [-1408, 2464], [-1408, 2800], [-1488, 2880], [-1712, 2880]], 0, { tex: SAND, wall: 224 });
  m.A('b_plat', -2128, 2480, -1744, 2904, 32, { tex: SAND, wall: 192 });
  m.A('b_plat2', -2128, 2904, -1888, 3152, 32, { tex: SAND, wall: 192 });
  m.S('b_plat_steps', -2000, 2448, -1848, 2480, 0, 32, 'n', 2, { tex: STONE, wall: 192 });
  m.zone(-1744, 2464, -1712, 2904, { height: 64, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });
  // B doors room, the slope to CT and the stairs up to the B window
  m.A('b_doors_gap', -1344, 2192, -1328, 2336, 0, { tex: SAND, wall: 224 });
  m.A('b_doors_room', -1328, 2096, -1104, 2368, 0, { tex: SAND, wall: 224 });
  m.R('b_doors_up', -1328, 2368, -1104, 2576, 8, 52, 'n', { tex: SAND, wall: 208 });
  m.R('b_win_stairs', -1232, 2576, -1104, 2704, 52, 88, 'n', { tex: STONE, wall: 176 });
  m.R('b_win_ramp', -1280, 2592, -1232, 2704, 88, 128, 'w', { tex: STONE, wall: 160 });
  m.A('b_window', -1400, 2592, -1280, 2704, 128, { tex: STONE, wall: 160 });

  m.generate();
  addDetails(m);
  addEntities(m);
  return m;
}

// ---------------------------------------------------------------------------
function addDetails(m) {
  const g = (x, y) => m.groundAt(x, y);
  const crate = (x, y, s, tex = 'crate', z = null) => m.crate(x, y, z ?? g(x, y), s, s, s, tex);

  // retaining wall between the T exit slope and top mid (sloped top)
  m.add(prismBrush('y', [[-504, -640], [-40, -640], [-40, 32], [-504, 144]], -632, -600, { all: 'wall_stone', top: 'trim_band' }, { name: 'tmid_retain' }));

  // --- T spawn props
  crate(-2024, -892, 72);
  crate(-1952, -892, 72, 'crate_b');
  crate(-1988, -892, 56, 'crate', 128 + 72);
  m.crate(-1736, -224, 128, 80, 80, 36, 'crate');
  m.crate(-1656, -232, 128, 72, 64, 36, 'crate_b');
  crate(-1060, -360, 64);
  crate(-1440, -1020, 64);

  // --- outside long: dumpster-like big crate pile
  crate(660, -40, 80);
  crate(660, 40, 64, 'crate_b');
  crate(220, -300, 48);

  // --- long doors (double wooden doors, half open)
  door(m, 'x', 560, 640, 312, 0, 168, 'open_l');
  door(m, 'x', 656, 736, 312, 0, 168, 'open_r');
  door(m, 'x', 552, 616, 808, 0, 168, 'open_l');
  door(m, 'x', 648, 712, 808, 0, 168, 'open_r');
  // lintels above the long doors
  m.add(boxBrush([560, 304, 176], [736, 336, 256], { all: 'wall_stone', bottom: 'wood_beam' }));
  m.add(boxBrush([552, 784, 176], [712, 840, 256], { all: 'wall_stone', bottom: 'wood_beam' }));
  crate(700, 680, 64);
  crate(700, 680, 48, 'crate_b', 64);
  crate(712, 616, 56);

  // --- long A crates
  m.crate(800, 1152, 0, 192, 112, 96, 'crate');
  m.crate(936, 1176, 0, 64, 64, 48, 'crate_b');
  // the car at the long corner -> crates stack instead (1.6 style)
  crate(1700, 2000, 80);
  crate(1700, 2080, 64, 'crate_b');

  // --- A site crates
  crate(1052, 2504, 64);
  crate(1036, 2412 + 40, 48, 'crate_b');
  crate(1212, 2512, 56);
  crate(1212, 2512, 40, 'crate_b', 96 + 56);
  crate(700, 2760, 48);
  crate(560, 2504, 56, 'crate_green');
  crate(616, 2504, 48, 'crate_green');

  // --- mid
  m.crate(-312, 1452, -128, 96, 104, 104, 'crate'); // xbox
  crate(-600, 720, 80);
  crate(-680, 360, 40, 'crate_b');

  // --- CT
  m.add(prismBrush('z', [[50, 2280], [110, 2340], [50, 2400], [-10, 2340]], -128, -128 + 72, { all: { name: 'crate', fit: true } }, { surface: 'wood' }));
  crate(150, 2380, 64, 'crate_b');
  crate(-450, 2520, 80, 'crate');
  crate(-370, 2520, 64, 'crate_b');
  // crates inside the arched passage under the short-A bridge
  crate(400, 2240, 72);
  crate(400, 2240, 56, 'crate_b', -124 + 72);
  crate(456, 2300, 56);

  // --- B site
  crate(-1600, 2560, 72);
  crate(-1520, 2760, 64, 'crate_b');
  crate(-1520, 2760, 48, 'crate', 64);
  crate(-1880, 2368, 80);
  crate(-1640, 1880, 64, 'crate_b');
  crate(-2040, 2928, 64);

  // --- mid doors (double doors, half open) with an arch above
  door(m, 'x', -512, -440, 1660, -128, 112, 'open_l');
  door(m, 'x', -408, -336, 1660, -128, 112, 'open_r');
  archLintel(m, 'x', -512, -336, 1640, 1680, -128 + 104, 160);

  // --- B doors
  door(m, 'y', 2192, 2256, -1336, 0, 120, 'open_l');
  door(m, 'y', 2272, 2336, -1336, 0, 120, 'open_r');
  archLintel(m, 'y', 2192, 2336, -1344, -1328, 112, 224);

  // --- B window opening (wall between B site and the window platform)
  m.add(boxBrush([-1408, 2592, 128], [-1400, 2704, 136], { all: 'wall_stone' }));

  // --- tunnel entrance arch from outside tunnels
  archLintel(m, 'x', -1728, -1608, 712, 744, 32 + 80, 160);

  // --- arched facade of the short-A bridge (seen from CT spawn)
  bridgeFacade(m, 264, 280);
  bridgeFacade(m, 488, 504);
  // bridge railings
  m.add(boxBrush([264, 2064, 96], [280, 2440, 128], { all: 'wall_stone', top: 'trim_band' }));
  m.add(boxBrush([488, 2064, 96], [504, 2440, 128], { all: 'wall_stone', top: 'trim_band' }));
}

// Wooden door leaf. axis 'x': door plane along x at y=c; 'y': along y at x=c.
function door(m, axis, a0, a1, c, z0, h, mode) {
  const t = 6;
  const tex = { all: { name: 'door', fit: true } };
  if (mode === 'open_l' || mode === 'open_r') {
    // swing ~60° open around the outer hinge
    const len = a1 - a0;
    const hinge = mode === 'open_l' ? a0 : a1;
    const sgn = mode === 'open_l' ? 1 : -1;
    const ang = 60 * Math.PI / 180;
    const ex = hinge + sgn * Math.cos(ang) * len;
    const ey = c + Math.sin(ang) * len;
    const nx = -Math.sin(ang) * t / 2, ny = Math.cos(ang) * t / 2;
    const pts = [[hinge - sgn * nx, c - ny], [ex - sgn * nx, ey - ny], [ex + sgn * nx, ey + ny], [hinge + sgn * nx, c + ny]];
    const pts2 = axis === 'x' ? pts : pts.map(([a, b]) => [b, a]);
    m.add(prismBrush('z', convexHull(pts2), z0, z0 + h, tex, { surface: 'wood' }));
  } else {
    if (axis === 'x') m.add(boxBrush([a0, c - t / 2, z0], [a1, c + t / 2, z0 + h], tex, { surface: 'wood' }));
    else m.add(boxBrush([c - t / 2, a0, z0], [c + t / 2, a1, z0 + h], tex, { surface: 'wood' }));
  }
}

// Arch-shaped lintel spanning an opening a0..a1 (across), t0..t1 (wall depth).
function archLintel(m, axis, a0, a1, t0, t1, zSpring, zTop) {
  const c = (a0 + a1) / 2, r = (a1 - a0) / 2;
  const segs = 8;
  const apex = zSpring + r;
  const top = Math.max(zTop, apex + 8);
  for (let i = 0; i < segs; i++) {
    const th0 = Math.PI * i / segs, th1 = Math.PI * (i + 1) / segs;
    const pa = [c - Math.cos(th0) * r, zSpring + Math.sin(th0) * r];
    const pb = [c - Math.cos(th1) * r, zSpring + Math.sin(th1) * r];
    const pts = [pa, pb, [pb[0], top], [pa[0], top]];
    const ax = axis === 'x' ? 'y' : 'x';
    m.add(prismBrush(ax, pts, t0, t1, { all: 'wall_stone' }, { name: 'arch' }));
  }
}

// West/east face of the building under the short-A walkway: two big arches.
function bridgeFacade(m, x0, x1) {
  const z0 = -124, zTop = 72;
  // pillars
  m.add(boxBrush([x0, 2064, z0], [x1, 2096, zTop], { all: 'wall_stone' }));
  m.add(boxBrush([x0, 2288, z0], [x1, 2336, zTop], { all: 'wall_stone' }));
  m.add(boxBrush([x0, 2520, z0], [x1, 2552, zTop], { all: 'wall_stone' }));
  archLintelX(m, x0, x1, 2096, 2288, -40, zTop);
  archLintelX(m, x0, x1, 2336, 2520, -40, zTop);
}

function archLintelX(m, x0, x1, a0, a1, zSpring, zTop) {
  // arch across y (a0..a1), wall depth along x
  const c = (a0 + a1) / 2, r = (a1 - a0) / 2;
  const segs = 10;
  for (let i = 0; i < segs; i++) {
    const th0 = Math.PI * i / segs, th1 = Math.PI * (i + 1) / segs;
    const pa = [c - Math.cos(th0) * r, zSpring + Math.sin(th0) * r];
    const pb = [c - Math.cos(th1) * r, zSpring + Math.sin(th1) * r];
    const top = zTop;
    if (Math.min(pa[1], pb[1]) >= top) continue;
    const pts = [pa, pb, [pb[0], top], [pa[0], top]];
    m.add(prismBrush('x', pts, x0, x1, { all: 'wall_stone' }, { name: 'arch' }));
  }
}

function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

// ---------------------------------------------------------------------------
function addEntities(m) {
  // Spawn points (GoldSrc: info_player_deathmatch = T, info_player_start = CT)
  const tSpawns = [
    [-1344, -1008], [-1280, -1008], [-1216, -1008], [-1152, -1008], [-1088, -1008],
    [-1344, -944], [-1280, -944], [-1216, -944], [-1152, -944], [-1088, -944],
    [-1312, -880], [-1248, -880], [-1184, -880], [-1120, -880], [-1056, -880],
  ];
  for (const [x, y] of tSpawns) m.entity('info_player_deathmatch', { origin: [x, y, 128 + 37], angle: 90 });
  const ctSpawns = [
    [96, 2400], [160, 2400], [224, 2400], [96, 2336], [160, 2336], [224, 2336],
    [96, 2272], [160, 2272], [224, 2272], [96, 2208], [160, 2208], [224, 2208],
    [96, 2144], [160, 2144], [224, 2144],
  ];
  for (const [x, y] of ctSpawns) m.entity('info_player_start', { origin: [x, y, -128 + 37], angle: 270 });
  m.entity('func_bomb_target', { name: 'A', mins: [960, 2392, 96], maxs: [1264, 2792, 256] });
  m.entity('func_bomb_target', { name: 'B', mins: [-1712, 2464, 0], maxs: [-1408, 2880, 160] });
  m.entity('func_buyzone', { team: 'T', mins: [-2224, -1184, 0], maxs: [-40, -120, 400] });
  m.entity('func_buyzone', { team: 'CT', mins: [-600, 2050, -200], maxs: [520, 2600, 200] });

  // Light sources inside the tunnels (GoldSrc maps lit tunnels with light entities)
  for (const [x, y, z] of [[-1668, 860, 140], [-1900, 1170, 140], [-1500, 1170, 140], [-1984, 1600, 140], [-1100, 1440, -10], [-800, 1440, -10], [-1100, 1180, 60]]) {
    m.light(x, y, z, [1.0, 0.85, 0.62], 0.55, 420);
  }
}
