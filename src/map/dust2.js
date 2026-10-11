// de_dust2 — layout measured from the map's navigation mesh and radar overview
// (GoldSrc/Source coordinates; T spawn south, CT spawn north, A east, B west).
//
// Floors are "areas"; the building mass around them is generated automatically
// (see areagen.js). Low walls, crates, doors, arches and ceilings are placed by hand.

import { AreaMap } from './areagen.js';
import { boxBrush, prismBrush } from './brush.js';
import { MASSING } from './dust2_massing.js';

const SAND = 'ground_sand';
const STONE = 'ground_stone';
const DIRT = 'ground_dirt';

export function buildDust2() {
  const m = new AreaMap([-2432, -1312, 2016, 3296]);
  m.setMassing(MASSING);

  // ------------------------------------------------------------------ T SPAWN
  // Main plaza at z 128; its south strip rises to 160 against the back wall,
  // which carries two sky-high towers. An arched gate wall (x -976..-896)
  // separates the plaza from the east part, whose road slopes down to top mid.
  m.A('t_plaza', -2240, -896, -976, -512, 128, { tex: SAND, wall: 190 });
  m.R('t_plaza_s', -2240, -1024, -976, -896, 128, 160, 's', { tex: SAND, wall: 190 });
  m.A('t_plaza_n', -1776, -512, -976, -270, 128, { tex: SAND, wall: 190 });
  m.P('t_plaza_nw', [[-1776, -270], [-1284, -270], [-1424, -140], [-1776, -140]], 128, { tex: SAND, wall: 190 });
  m.P('t_plaza_ne', [[-1290, -312], [-976, -512], [-976, -270], [-1290, -270]], [270, 0.08, 0.125], { tex: SAND, wall: 190 });
  m.solid(-1920, -1024, -1648, -992, { height: 512, tex: 'wall_stone', capTex: null, roof: 'wall_stone' });
  m.solid(-1424, -1024, -1136, -992, { height: 512, tex: 'wall_stone', capTex: null, roof: 'wall_stone' });
  // ramp down to outside tunnels between two low parapets
  m.R('t_ramp', -2048, -636, -1792, -124, 0, 128, 's', { tex: STONE, wall: 224 });
  m.zone(-2080, -640, -2048, -490, { height: 160, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });
  m.zone(-1792, -640, -1776, -140, { height: 160, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });
  m.zone(-1776, -140, -1424, -124, { height: 160, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });
  // gate wall with its arch
  m.zone(-976, -1024, -896, -640, { height: 352, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });
  m.opening(-976, -864, -896, -672, 128, 286, 352);
  // east part and the exit slope (0.25) down to z 0 at x 0
  m.A('t_east', -896, -896, -512, -640, 128, { tex: SAND, wall: 222 });
  m.R('t_east_s', -896, -1024, -512, -896, 128, 160, 's', { tex: SAND, wall: 190 });
  m.R('t_exit', -512, -896, 0, -640, 0, 128, 'w', { tex: STONE, wall: 222 });
  m.Q('t_exit_s', -512, -1024, 0, -896, [-224, -0.25, -0.25], { tex: STONE, wall: 190 });

  // ------------------------------------------------------- OUTSIDE LONG / TOP MID
  // A ring of road (0) around a central block: the T exit slope arrives at the
  // south; the west side is a roofed passage up to top mid; outside long opens
  // to the east toward the long doors.
  m.A('ol_s', 0, -892, 384, -608, 0, { tex: SAND, wall: 256 });
  m.A('topmid_s', -512, -608, 384, -508, 0, { tex: SAND, wall: 256 });
  m.A('topmid_sw', -512, -508, -384, -444, 0, { tex: SAND, wall: 256 });
  m.A('topmid_w', -512, -444, -384, 4, 0, { tex: STONE, wall: 288, ceil: 160, ceilTop: 288 });
  m.A('topmid_e', 152, -508, 384, -372, 0, { tex: SAND, wall: 256 });
  m.A('ol_main', 128, -372, 768, 248, 0, { tex: SAND, wall: 266 });
  m.A('ol_nook', 144, -204, 192, -44, 16, { tex: SAND, wall: 240, ceil: 120, ceilTop: 240 });
  m.A('ol_n', 128, 248, 400, 292, 0, { tex: SAND, wall: 256 });
  m.A('topmid_wn', -512, 4, -272, 292, 0, { tex: SAND, wall: 256 });
  m.A('topmid_nw', -576, 196, -512, 292, 0, { tex: SAND, wall: 256 });
  m.A('topmid_n', -576, 292, 400, 516, 0, { tex: SAND, wall: 256 });
  m.A('topmid_alcove', -768, 272, -576, 500, 0, { tex: SAND, wall: 288, ceil: 224, ceilTop: 300 });
  m.A('mid_w', -576, 516, -512, 580, 0, { tex: SAND, wall: 288 });
  // lintels at both ends of the roofed west passage
  m.add(boxBrush([-512, -444, 128], [-384, -412, 160], { all: 'wall_stone', bottom: 'wood_beam' }, { name: 'tmw_lintel' }));
  m.add(boxBrush([-512, -28, 128], [-384, 4, 160], { all: 'wall_stone', bottom: 'wood_beam' }, { name: 'tmw_lintel' }));

  // ------------------------------------------------------------------ MID
  // The mid lane slopes 1/4 down to -128, runs level through the double doors
  // to CT mid. The catwalk (z 0) runs alongside behind a 32-unit ledge and
  // widens at its north end; the short-A stairs climb from there to z 96.
  m.A('mid_top', -512, 516, -128, 768, 0, { tex: SAND, wall: 288 });
  m.R('mid', -520, 768, -264, 1288, -128, 0, 's', { tex: SAND, wall: 288 });
  m.A('mid_lower', -520, 1288, -264, 1596, -128, { tex: STONE, wall: 288 });
  m.A('mid_doors', -480, 1596, -276, 1676, -128, { tex: STONE, wall: 288 });
  m.A('ct_mid', -520, 1676, -264, 2048, -128, { tex: STONE, wall: 288 });
  m.P('ct_mid_corner', [[-616, 2048], [-520, 1952], [-520, 2048]], -128, { tex: STONE, wall: 288 });
  m.zone(-520, 1596, -264, 1676, { height: 288, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });
  m.A('catwalk', -248, 768, -136, 1402, 0, { tex: STONE, wall: 224 });
  m.A('cat_end', -248, 1402, 512, 1596, 0, { tex: STONE, wall: 224 });
  m.A('short_nook', 384, 1596, 512, 1800, 0, { tex: STONE, wall: 224 });
  m.S('short_stairs', 256, 1596, 384, 1800, 0, 96, 'n', 6, { tex: STONE, wall: 224 });
  // the ledge between the mid lane and the catwalk
  m.zone(-264, 768, -248, 1596, { height: 32, tex: 'wall_stone', capTex: 'trim_band', roof: STONE });

  // ------------------------------------------------------------------ CT SIDE
  // The road from the B doors to the CT hall: level 0 at the doors, a 1/3
  // slope down to -128 between x -1152 and -768, then level into the hall.
  // North of the road the sand rises 1/8 toward the rock cliff; its NW corner
  // climbs (crates + rock) to the ledge behind the B window.
  const ROCK = { tex: 'rock', capTex: null, roof: 'rock' };
  m.A('ctb_road_w', -1288, 2048, -1152, 2296, 0, { tex: STONE, wall: 256 });
  m.R('ctb_road_ramp', -1152, 2048, -768, 2296, -128, 0, 'w', { tex: STONE, wall: 256 });
  m.A('ct_road', -768, 2048, -256, 2296, -128, { tex: STONE, wall: 288 });
  m.Q('ctb_sand_w', -1288, 2296, -1152, 2512, [-287, 0, 0.125], { tex: SAND, wall: 256 });
  m.P('ctb_sand_m1', [[-1152, 2296], [-960, 2296], [-960, 2620], [-1152, 2580]], [-671, -1 / 3, 0.125], { tex: SAND, wall: 256 });
  m.P('ctb_sand_m2', [[-960, 2296], [-768, 2296], [-768, 2680], [-864, 2700], [-960, 2620]], [-671, -1 / 3, 0.125], { tex: SAND, wall: 256 });
  m.P('ct_sand_e1', [[-768, 2296], [-600, 2296], [-600, 2530], [-672, 2616], [-768, 2680]], [-415, 0, 0.125], { tex: SAND, wall: 320 });
  m.P('ct_sand_e2', [[-600, 2296], [-256, 2296], [-256, 2490], [-600, 2530]], [-415, 0, 0.125], { tex: SAND, wall: 320 });
  m.zone(-1300, 2560, -240, 2900, ROCK);
  // ledge behind the B window and the window itself (sill rises toward the north)
  m.A('ctb_step', -1280, 2576, -1192, 2648, 136, { tex: SAND, wall: 160 });
  m.Q('ctb_ledge', -1288, 2648, -1008, 2728, [-609.5, -0.0625, 0.25], { tex: SAND, wall: 160 });
  m.Q('b_window', -1352, 2632, -1288, 2720, [-618, 0, 0.29], { tex: STONE, wall: 0, ceil: 216, ceilTop: 256 });

  // The CT hall: a covered stretch of the road (ceiling at 64) under a tall
  // building and the short-A walkway. Its west face is one big arch.
  m.A('ct_hall', -256, 2048, 264, 2296, -128, { tex: STONE, wall: 512, ceil: 64, ceilTop: 384, ceilTex: 'wood_planks' });
  m.A('ct_hall_n', 64, 2296, 264, 2528, -128, { tex: SAND, wall: 512, ceil: 64, ceilTop: 384, ceilTex: 'wood_planks' });
  m.P('ct_hall_s', [[-256, 1984], [80, 1984], [16, 2048], [-256, 2048]], -128, { tex: STONE, wall: 512, ceil: 64, ceilTop: 384, ceilTex: 'wood_planks' });
  m.A('ct_hall_e', 264, 2048, 512, 2528, -128, { tex: STONE, wall: 224 });
  // east exit: low lintel under the walkway parapet, solid wall further north
  m.add(boxBrush([512, 2048, 34], [544, 2304, 128], { all: 'wall_stone', top: 'trim_band' }, { name: 'ct_hall_lintel' }));
  m.add(boxBrush([504, 2304, -128], [544, 2528, 128], { all: 'wall_stone', top: 'trim_band' }, { name: 'ct_hall_ewall' }));
  // upper storey of the facade overhangs the street by 32 units
  m.add(boxBrush([-288, 1904, 96], [-256, 2400, 216], { all: 'wall_stone', bottom: 'wall_stone', top: 'trim_band' }, { name: 'ct_overhang' }));

  // ------------------------------------------------------------------ A SITE
  m.A('short_a', 264, 1800, 512, 2048, 96, { tex: STONE, wall: 192 });
  m.A('short_bridge', 264, 2048, 512, 2528, 96, { tex: STONE, wall: 192, slab: true, slabDepth: 32, slabBottom: 'wood_planks', ignoreGround: false });
  // Under A: a 1/4 ramp from the CT hall exit up to the long corner level
  m.R('under_a', 512, 2056, 1024, 2400, -128, 0, 'e', { tex: STONE, wall: 266 });
  m.A('under_a2', 1024, 2056, 1268, 2304, 0, { tex: STONE, wall: 266 });

  // A platform (96) with parapets, a step (112) up to the upper part (128);
  // the A ramp climbs 1/4 from the long corner, with the east-edge slope strip.
  m.A('a_plat', 512, 2420, 1268, 2723, 96, { tex: SAND, wall: 192 });
  m.A('a_plat_w', 264, 2528, 512, 2723, 96, { tex: SAND, wall: 192 });
  m.A('a_plat_nw', 264, 2723, 507, 2763, 96, { tex: SAND, wall: 192 });
  m.A('a_plat_n', 773, 2723, 1032, 2763, 96, { tex: SAND, wall: 192 });
  m.A('a_plat_se', 1032, 2304, 1268, 2420, 96, { tex: SAND, wall: 192 });
  m.A('a_step', 1032, 2763, 1268, 2812, 112, { tex: STONE, wall: 176 });
  m.A('a_upper', 1032, 2812, 1556, 3090, 128, { tex: SAND, wall: 176 });
  m.Q('a_upper_e', 1556, 2812, 1600, 3090, [-389, 0.25, 0], { tex: SAND, wall: 176 });
  m.R('a_ramp', 1268, 2304, 1540, 2812, 0, 128, 'n', { tex: STONE, wall: 208 });
  m.Q('a_ramp_e', 1540, 2304, 1600, 2812, [-960, 0.25, 0.25], { tex: STONE, wall: 208 });
  // parapets (tops at 128)
  m.zone(507, 2400, 1032, 2420, { height: 128, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });
  m.zone(1032, 2288, 1268, 2304, { height: 128, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });
  m.add(boxBrush([1268, 2304, 0], [1280, 2763, 128], { all: 'wall_stone', top: 'trim_band' }, { name: 'a_parapet_e' }));

  // ------------------------------------------------------------------ LONG A
  // Long doors: a roofed corridor from outside long to the open area under
  // long A. Long A runs north with a 1/4 slope strip along its east edge that
  // widens into the long corner; stairs climb to the raised side platform.
  // The pit drops 3/8 to a covered pocket at -192.
  m.A('long_doors', 516, 244, 776, 800, 0, { tex: SAND, wall: 280, ceil: 192, ceilTop: 280 });
  m.A('long_x', 516, 800, 1538, 1220, 0, { tex: SAND, wall: 282 });
  m.A('long_s', 944, 192, 1236, 800, 0, { tex: SAND, wall: 282 });
  m.A('long_ledge', 888, 400, 944, 780, 32, { tex: SAND, wall: 250 });
  m.A('long_a', 1276, 1220, 1538, 2304, 0, { tex: SAND, wall: 282 });
  const LSLOPE = [-384.5, 0.25, 0];
  m.Q('long_slope_s', 1538, 770, 1600, 820, LSLOPE, { tex: SAND, wall: 240 });
  m.Q('long_slope', 1538, 980, 1600, 1830, LSLOPE, { tex: SAND, wall: 282 });
  m.Q('long_corner', 1538, 1904, 1792, 2304, LSLOPE, { tex: SAND, wall: 282 });
  m.Q('long_corner_s', 1538, 1830, 1600, 1904, LSLOPE, { tex: SAND, wall: 282 });
  m.S('side_stairs', 1504, 820, 1632, 980, 0, 64, 'e', 4, { tex: STONE, wall: 200 });
  m.A('side', 1616, 340, 1776, 1028, 64, { tex: SAND, wall: 192 });
  m.zone(1600, 340, 1616, 820, { height: 80, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });
  // the pit
  m.A('pit_rim', 1236, 312, 1290, 770, 32, { tex: SAND, wall: 250 });
  m.A('pit_top', 1236, 770, 1538, 800, 0, { tex: SAND, wall: 282 });
  m.Q('pit', 1290, 312, 1538, 770, [-288.5, 0, 0.375], { tex: DIRT, wall: 282 });
  m.Q('pit_e', 1538, 312, 1600, 770, [-673, 0.25, 0.375], { tex: DIRT, wall: 282 });
  m.R('pit_drop', 1296, 256, 1600, 312, -192, -171, 'n', { tex: DIRT, wall: 0, ceil: 0, ceilTop: 384 });
  m.A('pit_cave', 1296, 16, 1600, 256, -192, { tex: DIRT, wall: 192, ceil: 0, ceilTop: 384 });

  // ------------------------------------------------------------- OUTSIDE TUNNELS
  // Level yard (0) below the T ramp with a sloped bank in its SE corner; a
  // step (16) leads up to the strip (32) in front of the tunnel entrance.
  m.A('out_tun_w', -2036, -124, -1807, 500, 0, { tex: SAND, wall: 316 });
  m.P('out_tun_m', [[-1807, -124], [-1536, 66], [-1536, 500], [-1807, 500]], 0, { tex: SAND, wall: 316 });
  m.P('out_tun_bank', [[-1807, -124], [-1536, -124], [-1536, 66]], [203.76, 0.125, -0.178], { tex: SAND, wall: 256 });
  m.A('out_tun_e', -1536, 64, -1400, 500, 0, { tex: SAND, wall: 316 });
  m.A('ot_ledge_w', -2036, 500, -1776, 540, 32, { tex: STONE, wall: 312 });
  m.A('ot_step', -1776, 500, -1576, 540, 16, { tex: STONE, wall: 312 });
  m.A('ot_ledge_e', -1576, 500, -1400, 540, 32, { tex: STONE, wall: 312 });
  m.A('ot_up', -1936, 540, -1400, 700, 32, { tex: SAND, wall: 312 });

  // ------------------------------------------------------------- TUNNELS
  // Upper tunnels: floor 32, ceiling 192. Two flights (32 -> -48 -> -112) drop
  // into the lower tunnel (ceiling 32), which steps down into the mid lane.
  const TUN = { tex: DIRT, wall: 192, wallTex: 'wall_tunnel', ceilTex: 'wood_planks' };
  const UPC = { ...TUN, ceil: 192, ceilTop: 256 };
  m.A('tun_entry', -1736, 680, -1616, 1000, 32, UPC);
  m.A('upper_tun_s', -1776, 1000, -1256, 1140, 32, UPC);
  m.A('upper_tun', -2176, 1140, -1296, 1300, 32, UPC);
  m.A('upper_tun_nw', -2056, 1300, -1656, 1420, 32, UPC);
  m.A('b_tunnel', -2056, 1420, -1936, 1784, 32, UPC);
  m.A('tun_ledge', -1296, 1140, -1136, 1280, 48, UPC);
  m.S('tun_stairs1', -1256, 1030, -1096, 1140, -48, 32, 'w', 5, { ...UPC, tex: STONE });
  m.A('tun_landing', -1096, 1030, -1056, 1130, -48, { ...UPC, tex: STONE });
  m.S('tun_stairs2', -1136, 1130, -1056, 1250, -112, -64, 's', 3, { ...UPC, tex: STONE });
  m.A('lower_tun_s', -1136, 1250, -1040, 1283, -112, UPC);
  m.A('lower_tun', -1176, 1283, -536, 1530, -112, { ...TUN, ceil: 32, ceilTop: 128 });
  m.A('lower_tun_exit', -536, 1380, -520, 1460, -112, { ...TUN, ceil: -6, ceilTop: 128 });
  m.solid(-856, 1300, -808, 1370);
  // door frames (lintels at 148) at the tunnel entrance and the B end
  for (const y of [700, 940]) m.add(boxBrush([-1736, y, 148], [-1616, y + 40, 192], { all: 'wall_tunnel', bottom: 'wood_beam' }, { name: 'tun_frame' }));
  m.add(boxBrush([-2056, 1420, 148], [-1936, 1460, 192], { all: 'wall_tunnel', bottom: 'wood_beam' }, { name: 'tun_frame' }));

  // ------------------------------------------------------------------ B SITE
  // The site floor is level (0); a platform at 32 behind 64-high parapets runs
  // along the west side and into the back alcove. The B doors open east to the CT road; the upper
  // tunnel comes out at the SW corner and a narrow path leads south.
  m.A('b_main', -2112, 1900, -1360, 2420, 0, { tex: SAND, wall: 256 });
  m.A('b_main_s', -2112, 1800, -1480, 1900, 0, { tex: SAND, wall: 256 });
  m.P('b_main_sed', [[-1480, 1800], [-1360, 1900], [-1480, 1900]], 0, { tex: SAND, wall: 256 });
  m.A('b_south', -1716, 1560, -1596, 1800, 0, { tex: SAND, wall: 256 });
  m.P('b_south_ne', [[-1596, 1700], [-1500, 1800], [-1596, 1800]], 0, { tex: SAND, wall: 256 });
  m.P('b_ne', [[-1720, 2420], [-1360, 2420], [-1360, 2730], [-1504, 2880], [-1720, 2880]], 0, { tex: SAND, wall: 250 });
  m.A('b_plat', -2072, 2440, -1752, 2900, 32, { tex: SAND, wall: 224 });
  m.A('b_plat_n', -2100, 2900, -1890, 3120, 32, { tex: SAND, wall: 224 });
  m.S('b_plat_steps', -2016, 2392, -1896, 2440, 0, 32, 'n', 2, { tex: STONE, wall: 224 });
  m.zone(-2112, 2420, -2016, 2440, { height: 64, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });
  m.zone(-1896, 2420, -1720, 2440, { height: 64, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });
  m.zone(-1752, 2440, -1720, 2900, { height: 64, tex: 'wall_stone', capTex: 'trim_band', roof: 'wall_stone' });
  m.R('b_tunnel_mouth', -2036, 1784, -1916, 1840, 0, 32, 's', { tex: STONE, wall: 192, ceil: 192, ceilTop: 256 });
  // B doors: opening y 2096..2272 under a lintel at 156
  m.A('b_doors_gap', -1360, 2096, -1288, 2272, 0, { tex: STONE, wall: 256, ceil: 156, ceilTop: 256 });

  m.generate();
  m.decorateWindows(11);
  m.decorateBeams(112);
  addDetails(m);
  addEntities(m);
  return m;
}

// ---------------------------------------------------------------------------
// Crates measured from the 1.6 map: [x, y, zBottom, sizeX, sizeY, height, yaw,
// texture, breakable target]. Stacks and rows of equal crates are split into
// separate boxes by placeCrate. Crates with a target are the military crates
// at the bomb sites that the C4 explosion destroys.
const CRATES = [
  [-1024, -544, 128, 128, 192, 128, 0, "crate", null],
  [384, -384, 24, 91, 91, 168, 45, "crate", null],
  [-1744, -304, 128, 64, 64, 64, 0, "crate_b", null],
  [-1712, -208, 128, 128, 128, 128, 0, "crate", null],
  [-480, -128, 0, 64, 128, 64, 0, "crate_b", null],
  [-480, -112, 64, 64, 64, 64, 0, "crate_b", null],
  [-1488, -32, 0, 96, 192, 96, 0, "crate", null],
  [1312, 64, -192, 64, 128, 64, 0, "crate_b", null],
  [1056, 160, 128, 192, 64, 64, 0, "crate_b", null],
  [-544, 160, 0, 64, 64, 128, 0, "crate_b", null],
  [1568, 176, -128, 64, 64, 64, 0, "crate_b", null],
  [1568, 192, -192, 64, 128, 64, 0, "crate_b", null],
  [1056, 224, 0, 192, 64, 128, 0, "crate", null],
  [-304, 288, 0, 64, 64, 64, 0, "crate_green", null],
  [1018, 314, 0, 96, 96, 96, 15, "crate", null],
  [1744, 368, 88, 96, 96, 168, 0, "crate", null],
  [-2000, 592, 32, 96, 96, 96, 0, "crate", null],
  [-544, 608, 0, 64, 64, 128, 0, "crate_green", null],
  [720, 640, 0, 96, 96, 96, 0, "crate", null],
  [1760, 992, 64, 64, 64, 64, 0, "crate_b", null],
  [832, 1152, 0, 128, 128, 128, 0, "crate", null],
  [928, 1184, 0, 64, 64, 64, 0, "crate_b", null],
  [-1248, 1248, 48, 64, 64, 64, 0, "crate_b", null],
  [-1312, 1248, 32, 64, 64, 64, 0, "crate_b", null],
  [-848, 1328, -112, 96, 96, 96, 0, "crate", null],
  [-2112, 1344, 32, 128, 128, 128, 0, "crate", null],
  [-304, 1424, -128, 96, 96, 96, 0, "crate", null],
  [464, 1456, 0, 96, 96, 96, 0, "crate", null],
  [-1152, 1504, -112, 128, 64, 64, 0, "crate_b", null],
  [32, 1568, 0, 64, 64, 128, 0, "crate_b", null],
  [-1600, 1704, 0, 57, 57, 128, 45, "crate_b", null],
  [-1824, 1824, 0, 64, 64, 128, 0, "crate_b", null],
  [1744, 1840, 40, 96, 96, 96, 0, "crate", null],
  [480, 2000, 96, 64, 64, 128, 0, "crate_b", null],
  [-112, 2016, -128, 64, 64, 128, 0, "crate_green", null],
  [-1176, 2072, 0, 48, 48, 48, 0, "crate_b", null],
  [-176, 2256, -128, 96, 96, 96, 0, "crate", null],
  [-192, 2272, -32, 64, 64, 64, 0, "crate_b", null],
  [32, 2304, -128, 91, 91, 96, 45, "crate", null],
  [592, 2352, -120, 96, 96, 96, 0, "crate", null],
  [688, 2352, -96, 96, 96, 96, 0, "crate", null],
  [1072, 2352, 96, 64, 64, 64, 0, "crate_green", "tgt_a"],
  [608, 2368, -24, 64, 64, 64, 0, "crate_b", null],
  [1072, 2368, 160, 64, 64, 64, 0, "crate_green", "tgt_a"],
  [-1808, 2384, 0, 96, 96, 96, 0, "crate", null],
  [1080, 2424, 96, 64, 64, 64, -14, "crate_green", "tgt_a"],
  [-864, 2464, -91, 64, 64, 59, 0, "crate_green", null],
  [-2080, 2480, 32, 64, 64, 64, 0, "crate_b", null],
  [-928, 2496, -64, 64, 64, 64, 0, "crate_green", null],
  [1232, 2512, 96, 64, 64, 64, 0, "crate_green", "tgt_a"],
  [-1232, 2528, 22, 96, 96, 90, 0, "crate", null],
  [-1160, 2528, 17, 48, 96, 47, 0, "crate_b", null],
  [-864, 2528, -83, 64, 64, 59, 0, "crate_green", null],
  [-1632, 2544, 0, 64, 64, 128, 0, "crate_green", "tgt_b"],
  [-1408, 2624, 0, 128, 64, 64, 0, "crate_green", "tgt_b"],
  [-1368, 2632, 64, 48, 48, 48, 0, "crate_b", "tgt_b"],
  [-1376, 2688, 0, 64, 64, 128, 0, "crate_green", "tgt_b"],
  [-1684, 2843, 0, 64, 64, 64, -30, "crate_green", "tgt_b"],
  [-2056, 2856, 80, 48, 48, 48, 0, "crate_b", null],
  [1064, 3033, 128, 64, 64, 64, -14, "crate_b", null],
  [-1752, 3040, 32, 16, 128, 128, 0, "crate", null],
  [-1936, 3088, 32, 96, 96, 96, 0, "crate", null],
  [-2080, 3136, 32, 64, 64, 128, 0, "crate_b", null],
  [-1936, 3152, 128, 96, 32, 32, 0, "crate", null],
  [-1976, 3160, 160, 48, 48, 48, 0, "crate_b", null],
  [-2000, 3200, 32, 32, 128, 128, 0, "crate", null],
  [-1952, 3208, 160, 128, 80, 64, 0, "crate_b", null],
  [-1952, 3216, 32, 128, 96, 128, 0, "crate", null],
  [-2064, 3216, 32, 96, 96, 96, 0, "crate", null],
  [-2080, 3232, 128, 64, 64, 64, 0, "crate_b", null],
];

function placeCrate(m, [x, y, z, sx, sy, sz, yaw, tex, target]) {
  const unit = Math.min(sx, sy);
  const split = (v) => { const r = v / unit; return Math.abs(r - Math.round(r)) < 0.15 && Math.round(r) >= 1 ? Math.round(r) : 1; };
  const nx = split(sx), ny = split(sy), nz = split(sz);
  const px = sx / nx, py = sy / ny, pz = sz / nz;
  const c = Math.cos(yaw * Math.PI / 180), s = Math.sin(yaw * Math.PI / 180);
  const opts = { name: target ? 'crate_' + target : 'crate', surface: tex === 'crate_green' ? 'metal' : 'wood' };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const lx = -sx / 2 + px * (i + 0.5), ly = -sy / 2 + py * (j + 0.5);
    const cx = x + lx * c - ly * s, cy = y + lx * s + ly * c;
    const z0 = z + pz * k, z1 = z0 + pz;
    const corners = [[-px / 2, -py / 2], [px / 2, -py / 2], [px / 2, py / 2], [-px / 2, py / 2]].map(([u, v]) => [cx + u * c - v * s, cy + u * s + v * c]);
    const b = prismBrush('z', corners, z0, z1, { all: { name: tex, fit: true } }, opts);
    if (target) b.target = target;
    m.add(b);
  }
}

function addDetails(m) {
  const g = (x, y) => m.groundAt(x, y);

  // retaining wall between the T exit slope and top mid (sloped top)
  m.add(prismBrush('y', [[-512, -640], [0, -640], [0, 32], [-512, 160]], -640, -608, { all: 'wall_stone', top: 'trim_band' }, { name: 'tmid_retain' }));

  // --- crates, as placed in the 1.6 map
  for (const c of CRATES) placeCrate(m, c);

  // --- T spawn gate arch (opening y -864..-672, apex 286)
  archLintel(m, 'y', -864, -672, -976, -896, 190, 352);

  // --- long doors (double wooden doors, half open)
  door(m, 'x', 524, 640, 292, 0, 138, 'open_l');
  door(m, 'x', 652, 768, 292, 0, 138, 'open_r');
  door(m, 'x', 524, 640, 752, 0, 138, 'open_l');
  door(m, 'x', 652, 768, 752, 0, 138, 'open_r');
  // door frames: the corridor ceiling drops to 138 at both ends
  m.add(boxBrush([516, 244, 138], [776, 340, 192], { all: 'wall_stone', bottom: 'wood_beam' }, { name: 'longdoor_frame' }));
  m.add(boxBrush([516, 700, 138], [776, 800, 192], { all: 'wall_stone', bottom: 'wood_beam' }, { name: 'longdoor_frame' }));

  // --- mid doors: arched opening (x -480..-276, apex 28) with both leaves
  // swung slightly in opposite directions, leaving a diagonal gap
  doorLeaf(m, [-480, 1632], [-400, 1596], -128, 24);
  doorLeaf(m, [-276, 1640], [-376, 1676], -128, 24);
  archLintel(m, 'x', -480, -276, 1596, 1676, -74, 288);

  // --- B doors
  doorLeaf(m, [-1350, 2188], [-1314, 2268], 0, 150);
  doorLeaf(m, [-1302, 2100], [-1270, 2166], 0, 150);


  // --- the CT hall's west arch (y 1976..2296), with jambs to the north
  archLintelX(m, -256, -224, 1976, 2296, -120, 64);
  m.add(boxBrush([-256, 2296, -128], [-224, 2400, 64], { all: 'wall_stone' }, { name: 'ct_jamb' }));
}

// Door leaf from hinge point a to free end b (x,y), 8 thick, z0..z1.
function doorLeaf(m, a, b, z0, z1) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
  const nx = -dy / l * 4, ny = dx / l * 4;
  const pts = [[a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]];
  m.add(prismBrush('z', convexHull(pts), z0, z1, { all: { name: 'door', fit: true } }, { surface: 'wood', name: 'door' }));
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
  // Spawn points as placed in the 1.6 map (GoldSrc: info_player_deathmatch = T,
  // info_player_start = CT); origins are hull centres.
  const tSpawns = [
    [-832, -704, 176, 159], [-832, -800, 176, 10], [-832, -896, 192, 159], [-736, -896, 192, 170], [-736, -800, 176, 356],
    [-736, -704, 176, 0], [-640, -896, 192, 43], [-640, -800, 176, 22], [-640, -704, 176, 170], [-544, -896, 192, 43],
    [-544, -800, 176, 165], [-544, -704, 176, 43], [-448, -896, 176, 43], [-448, -800, 160, 43], [-448, -704, 160, 43],
    [-928, -720, 176, 140], [-928, -816, 176, 140],
  ];
  for (const [x, y, z, a] of tSpawns) m.entity('info_player_deathmatch', { origin: [x, y, z], angle: a });
  const ctSpawns = [
    [448, 2464, -88, 255], [352, 2464, -88, 255], [256, 2464, -88, 255], [448, 2112, -88, 72], [160, 2464, -88, 255],
    [352, 2112, -88, 72], [256, 2112, -88, 72], [160, 2112, -88, 105], [64, 2112, -88, 105], [-96, 2240, -88, 305],
    [448, 2240, -88, 41], [352, 2240, -88, 333], [256, 2240, -88, 178], [160, 2240, -88, 186], [544, 2240, -64, 200],
    [544, 2128, -64, 200], [160, 2368, -88, 255], [256, 2368, -88, 255], [352, 2368, -88, 255], [448, 2368, -88, 255],
  ];
  for (const [x, y, z, a] of ctSpawns) m.entity('info_player_start', { origin: [x, y, z], angle: a });
  m.entity('func_bomb_target', { name: 'A', target: 'tgt_a', mins: [1024, 2304, 96], maxs: [1280, 2624, 192] });
  m.entity('func_bomb_target', { name: 'B', target: 'tgt_b', mins: [-1728, 2496, 0], maxs: [-1344, 2880, 96] });
  m.entity('func_buyzone', { team: 'T', mins: [-1088, -960, 0], maxs: [-384, -576, 288] });
  m.entity('func_buyzone', { team: 'CT', mins: [-192, 1984, -128], maxs: [592, 2560, -32] });

  // Light sources inside the tunnels (GoldSrc maps lit tunnels with light entities)
  for (const [x, y, z] of [[-1668, 860, 140], [-1900, 1170, 140], [-1500, 1170, 140], [-1984, 1600, 140], [-1100, 1440, -10], [-800, 1440, -10], [-1100, 1180, 60]]) {
    m.light(x, y, z, [1.0, 0.85, 0.62], 0.55, 420);
  }
}
