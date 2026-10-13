// Fort Ember (zm_fort_ember): an abandoned adobe-and-stone frontier fort on a red mesa, at a
// blood-red sunset. An original design for zombie survival.
//
// Plan (GoldSrc units, x east, y north; the mesa top is z 0):
//   THE FORT (x -704..704, y -576..704): curtain walls with a wall walk at 176 all round,
//     crenellated outside; the Ember Tower (NW, top 320, the beacon) and the SE watchtower,
//     both reached from the wall walk by stairs on two sides; the gatehouse (S) over the main
//     gate, its winch room on the wall walk; a breach in the east wall bridged by planks; a
//     postern in the north wall. Inside: the courtyard with the well and the market stalls,
//     the commander's house (N, a helipad on its roof level with the wall walk), the barracks
//     (E, a flat roof off the wall walk), the storehouse (NW), the motor pool (SW) and the
//     ammo bunker dug into the rock under the west wall (a ramp down from the courtyard).
//   THE MESA: the gate plaza (S), the west apron, the north rim, the east strip.
//   BELOW (z -256 / -128): the plain and the airstrip with the crashed plane (S), the wadi (W),
//     the canyon and its cliff path (N), the ruined mud-brick village on a terrace (E, -128) and
//     the road down the mesa with the wrecked convoy (SE). The tunnels run from the bunker out
//     to two mouths in the west cliff above the wadi.
// Fronts: the horde climbs in from the wadi, the cliff path, the village, the road, the
// airstrip (up the goat track) and the tunnels.
import { AreaMap } from '../areagen.js';
import { spawnGrid, navSeed, zone, wall, lamp } from '../kit.js';
import { T, FIRE, LANTERN, battlement, parapet, batter, beam, doorFrame, shutteredWindow, doorLeaf, brazier, torch, lantern, prop, clipRoof, sandbags, rubble, mast, stall, truck, hull, shearedBox } from './zm_fort_ember_parts.js';
import { buildLand } from './zm_fort_ember_land.js';

const WALK = 176; // the wall walk
const TOP = 320; // the tower tops
const LOW = -256; // the plain, the wadi, the canyon
const VIL = -128; // the village terrace
const TUN = -160; // the bunker and the tunnels

export const MAP = {
  id: 'zm_fort_ember',
  title: 'Fort Ember',
  modes: ['zombies'],
  tagline: 'Hold the fort until the last light dies',
  blurb: 'An abandoned frontier fort on a red mesa at sundown. The dead climb from the wadi, the village, the road and the tunnels under the walls.',
  mood: ['sunset', 'desert', 'fort'],
  squad: { min: 1, best: 4, max: 11 },
  // a very low sun in the west-south-west (12 deg): long red shadows, a violet sky fill
  lighting: {
    sunDir: [-0.945, -0.253, 0.208],
    sunColor: [1.12, 0.56, 0.26],
    skyColor: [0.24, 0.17, 0.27],
    ambientMin: [0.055, 0.04, 0.05],
    bounce: 0.55,
    voidColor: [0.22, 0.13, 0.1],
    lmEncoding: 'sqrt',
  },
  sky: { preset: 'sunset' },
  fog: { color: [0.6, 0.36, 0.3], near: 1100, far: 5200 },
  grade: { saturate: 1.12, contrast: 1.05 },
  ambience: { loop: 'amb_fort_ember', volume: 0.4 },
  textures: 'fortember',
  zones: [
    // high places first (first match wins)
    zone('Ember Tower', 'embertower', -704, 160, -192, 704, 250, 900),
    zone('SE Tower', 'setower', 192, -576, 704, -64, 250, 900),
    zone('Gatehouse', 'gatehouse', -160, -640, 160, -384, 150, 600),
    zone('Helipad', 'helipad', -96, 288, 416, 592, 150, 600),
    zone('Barracks Roof', 'barracksroof', 288, -240, 576, 208, 120, 600),
    zone('Ramparts', 'ramparts', -736, -608, 736, 736, 140, 900),
    // under the fort
    zone('Bunker', 'bunker', -704, -96, -224, 160, -220, -8),
    zone('Tunnels', 'tunnels', -960, -352, -704, 352, -220, -24),
    zone('Cliff Ledge', 'ledge', -1088, -608, -960, 96, -250, -100),
    // inside
    zone('Commander\'s House', 'house', -80, 304, 400, 576, -20, 150),
    zone('Barracks', 'barracks', 368, -240, 576, 208, -20, 150),
    zone('Guard Room', 'guardroom', -704, 448, -448, 704, -20, 150),
    zone('SE Guard Room', 'seguardroom', 448, -576, 704, -320, -20, 150),
    zone('Storehouse', 'storehouse', -368, 208, -176, 432, -20, 150),
    zone('Motor Pool', 'motorpool', -576, -448, -192, -96, -20, 150),
    zone('The Breach', 'breach', 416, 208, 960, 576, -20, 150),
    zone('Main Gate', 'gate', -192, -640, 192, -288, -20, 150),
    zone('Postern', 'postern', -192, 560, -96, 720, -20, 150),
    zone('Courtyard', 'courtyard', -576, -448, 576, 576, -20, 150),
    // the mesa
    zone('Gate Plaza', 'plaza', -960, -960, 960, -576, -40, 200),
    zone('West Apron', 'apron', -960, -576, -704, 704, -40, 200),
    zone('North Rim', 'rim', -1088, 704, 960, 896, -40, 200),
    zone('East Strip', 'strip', 704, -576, 960, 704, -40, 200),
    // below
    zone('Cliff Path', 'cliffpath', -192, 896, 704, 1024, -300, 40),
    zone('The Canyon', 'canyon', -1408, 896, 1216, 1216, -300, 40),
    zone('The Wadi', 'wadi', -1408, -960, -960, 896, -300, 40),
    zone('Goat Track', 'goattrack', -1024, -1088, -384, -960, -300, 40),
    zone('Crash Site', 'crash', -1408, -1536, -1024, -1088, -300, 200),
    zone('The Road', 'road', 768, -1088, 1728, -832, -300, 40),
    zone('The Village', 'village', 960, -832, 1792, 1216, -300, 300),
    zone('Airstrip', 'airstrip', -1408, -1536, 768, -960, -300, 200),
  ],
  fronts: [
    { id: 'wadi', name: 'WADI', via: 'up the', zones: ['The Wadi'], mouth: [-1024, 768] },
    { id: 'cliff', name: 'CLIFF PATH', via: 'up the', zones: ['Cliff Path', 'The Canyon'], mouth: [-160, 960] },
    { id: 'village', name: 'VILLAGE', via: 'from the', zones: ['The Village'], mouth: [960, 128] },
    { id: 'road', name: 'ROAD', via: 'up the', zones: ['The Road'], mouth: [928, -896] },
    { id: 'airstrip', name: 'AIRSTRIP', via: 'across the', zones: ['Airstrip', 'Crash Site', 'Goat Track'], mouth: [-928, -1000] },
    { id: 'tunnels', name: 'TUNNELS', via: 'through the', zones: ['Tunnels', 'Cliff Ledge'], mouth: [-520, 32] },
  ],
  squadStart: { pos: [64, -176, 0], yaw: 90, radius: 200 },
  buyArea: { pos: [64, -176, 0], radius: 320 },
  extraction: [
    { id: 'airstrip', name: 'The Airstrip', pos: [-256, -1328, LOW], radius: 280 },
    { id: 'helipad', name: 'The Helipad', pos: [176, 448, WALK], radius: 200 },
  ],
  objectives: [
    { id: 'fuel_depot', name: 'Defend the fuel depot', kind: 'defend', pos: [-512, -384, 0], radius: 160 },
    { id: 'radio_mast', name: 'Hold the radio mast', kind: 'hold', pos: [640, 640, WALK], radius: 140 },
    { id: 'gate_winch', name: 'Crank the gate winch', kind: 'defend', pos: [0, -512, WALK], radius: 120 },
    { id: 'supply_plaza', name: 'Supply drop: the gate plaza', kind: 'supply', pos: [-480, -800, 0] },
    { id: 'ammo_run', name: 'Run the ammo to the helipad', kind: 'escort', pos: [-600, 32, TUN], to: [176, 448, WALK] },
  ],
  titleShots: [
    { eye: [-300, -1400, -150], look: [-700, -1010, -90] }, // the plain: up the goat track to the fort
    { eye: [1560, 260, -64], look: [1060, 120, -64] }, // the village, the fort against the sunset
    { eye: [300, -360, 90], look: [-350, 160, 0] }, // the courtyard and the Ember Tower
    { eye: [-1190, 780, -180], look: [-1190, -300, -256] }, // down the wadi
  ],
  thumbShot: { eye: [1560, 260, -64], look: [1060, 120, -40] },
  hazards: [],
};

export function build() {
  const m = new AreaMap([-1792, -1792, 2048, 1472]);
  m.style = { ...m.style, ground: T.sand, side: T.rock, step: T.stone, wall: T.rock, cap: null, roof: T.rock, ceil: T.timber, slabBottom: T.timber };
  layout(m);
  m.generate();
  // auto-generated wall brushes far from the play space: coarse luxels (they are seen from afar)
  for (const b of m.brushes) if (b.name === 'wall' || b.name === 'clip') b.luxel = 32;
  fort(m);
  buildLand(m);
  entities(m);
  return m;
}

// ------------------------------------------------------------------ floors
function layout(m) {
  const rock = { side: T.rock };
  const walk = { tex: T.flag, side: T.adobe, wallTex: T.adobe, wall: 64 };
  const stair = { tex: T.flag, stepTex: T.stone, side: T.adobe, wall: 64 };
  const yard = { tex: T.sand, side: T.adobe, wall: 64 };

  // ---- the courtyard (0); the bunker ramp cuts a trench into it (x -480..-224, y -96..64)
  m.A('cy_s', -576, -448, 576, -96, 0, yard);
  m.A('cy_m', -224, -96, 576, 64, 0, yard);
  m.A('cy_n', -480, 64, 576, 576, 0, yard);
  m.A('cy_wn', -576, 160, -480, 576, 0, yard);
  // the bunker under the west wall (TUN): its roof is the courtyard / the wall walk
  m.A('hall_m', -704, -96, -576, 160, TUN, { tex: T.planks, side: T.rock, ceil: -16, ceilTop: WALK, ceilTex: T.timber, wallTex: T.adobe, wall: 64 });
  m.A('hall_e', -576, -96, -480, 160, TUN, { tex: T.planks, side: T.rock, ceil: -16, ceilTop: 0, ceilTex: T.timber, wallTex: T.adobe, wall: 64 });
  m.R('bunker_ramp', -480, -96, -224, 64, TUN, 0, 'e', { tex: T.planks, side: T.stone, wall: 64 });
  // ---- the wall walk (176) and its stairs; the towers' rooms (0)
  m.A('sw_bastion', -704, -576, -576, -448, WALK, walk);
  m.A('w_walk', -704, -448, -576, -96, WALK, walk);
  m.S('w_stair', -704, 160, -576, 448, WALK, TOP, 'n', 9, stair);
  m.A('ember_room', -704, 448, -448, 704, 0, { tex: T.flag, side: T.stone, wall: 64 });
  m.S('n_stair', -448, 576, -192, 704, WALK, TOP, 'w', 9, stair);
  m.A('postern', -192, 576, -96, 704, 0, { tex: T.sand, side: T.adobe, ceil: 112, ceilTop: WALK, ceilTex: T.timber, wallTex: T.adobe, wall: 64 });
  m.A('n_walk', -96, 576, 576, 704, WALK, walk);
  m.A('ne_bastion', 576, 576, 704, 704, WALK, walk);
  m.A('e_walk_n', 576, 464, 704, 576, WALK, walk);
  m.A('breach', 576, 272, 704, 464, 0, { tex: T.sand, side: T.adobe, wall: 64 });
  m.A('e_walk', 576, -64, 704, 272, WALK, walk);
  m.S('e_stair', 576, -320, 704, -64, WALK, TOP, 's', 9, stair);
  m.A('se_room', 448, -576, 704, -320, 0, { tex: T.flag, side: T.stone, wall: 64 });
  m.S('se_stair', 192, -576, 448, -448, WALK, TOP, 'e', 9, stair);
  m.A('s_walk_e', 160, -576, 192, -448, WALK, walk);
  m.A('gh_e', 96, -640, 160, -384, WALK, walk);
  m.A('gate', -96, -640, 96, -384, 0, { tex: T.flag, side: T.stone, ceil: 144, ceilTop: WALK, ceilTex: T.timber, wallTex: T.stone, wall: 64 });
  m.A('gh_w', -160, -640, -96, -384, WALK, walk);
  m.A('s_walk_w', -576, -576, -160, -448, WALK, walk);
  // stairs up from the courtyard: south-west (to the south walk), the barracks' outer stair
  m.S('sw_stair', -480, -448, -192, -352, 0, WALK, 'w', 11, stair);
  m.S('bk_stair', 288, -32, 368, 192, 0, 160, 'n', 10, stair);
  // the commander's house: its inner stair up to the roof (the helipad) and the wall walk
  m.S('house_stair', -64, 320, 32, 576, 0, WALK, 'n', 11, { ...stair, tex: T.planks, stepTex: T.timber });

  // ---- the mesa (0): cliffs (fe_rock) wherever it drops away
  const mesa = { tex: T.sand, ...rock, wall: 64 };
  m.A('plaza', -960, -960, 960, -640, 0, mesa);
  m.A('plaza_nw', -960, -640, -160, -576, 0, mesa);
  m.A('plaza_ne', 160, -640, 960, -576, 0, mesa);
  m.A('apron_s', -960, -576, -704, -352, 0, mesa);
  m.A('apron_s2', -768, -352, -704, -32, 0, mesa);
  m.A('apron_s3', -960, -224, -896, -32, 0, mesa);
  m.A('apron_m1', -960, 96, -896, 352, 0, mesa);
  m.A('apron_m2', -768, 96, -704, 352, 0, mesa);
  m.A('apron_n', -960, 352, -704, 704, 0, mesa);
  m.A('rim_n', -960, 704, 960, 896, 0, mesa);
  m.A('strip_e', 704, -576, 960, 704, 0, mesa);
  // the tunnels under the apron (TUN; their roofs are the apron) and the ramp down to them
  const tun = { tex: T.sand, side: T.rock, ceil: -16, ceilTop: 0, ceilTex: T.timber, wallTex: T.rock, wall: 64 };
  m.A('tunnel', -960, -32, -704, 96, TUN, tun);
  m.A('gallery', -896, -352, -768, -32, TUN, tun);
  m.A('adit', -960, -352, -896, -224, TUN, tun);
  m.R('apron_ramp', -896, 96, -768, 352, TUN, 0, 'n', { tex: T.sand, side: T.rock, wall: 64 });
  // the cliff ledge outside the tunnel mouths, and its ramp down into the wadi
  m.A('ledge', -1088, -352, -960, 96, TUN, { tex: T.sand, ...rock, wall: 64 });
  m.R('ledge_ramp', -1088, -608, -960, -352, LOW, TUN, 'n', { tex: T.sand, ...rock, wall: 64 });
  // the wadi path up to the apron's north end
  m.R('wadi_path', -1088, 256, -960, 704, LOW, 0, 'n', { tex: T.sand, ...rock, wall: 64 });
  m.A('wadi_top', -1088, 704, -960, 832, 0, { tex: T.sand, ...rock, wall: 64 });
  // the goat track up the south cliff from the plain to the plaza
  m.R('goat', -896, -1088, -384, -960, LOW, 0, 'w', { tex: T.sand, ...rock, wall: 64 });
  m.A('goat_top', -1024, -1088, -896, -960, 0, { tex: T.sand, ...rock, wall: 64 });

  // ---- below: the wadi, the canyon, the cliff path, the plain (-256); the village (-128)
  const low = { tex: T.sand, ...rock, wall: 64 };
  m.A('wadi', -1408, -960, -960, 896, LOW, low);
  m.A('canyon_w', -1408, 896, -192, 1216, LOW, low);
  m.A('canyon_m', -192, 1024, 704, 1216, LOW, low);
  m.A('canyon_e', 704, 896, 1216, 1216, LOW, low);
  m.R('cliff_path', -192, 896, 704, 1024, LOW, 0, 'w', low);
  m.A('plain', -1408, -1536, 768, -960, LOW, low);
  m.R('road2', 768, -1088, 1472, -960, LOW, VIL, 'e', { tex: T.hardpan, ...rock, wall: 64 });
  m.R('road1', 960, -960, 1472, -832, VIL, 0, 'w', { tex: T.hardpan, ...rock, wall: 64 });
  m.A('hairpin', 1472, -1088, 1728, -832, VIL, { tex: T.hardpan, ...rock, wall: 64 });
  const vil = { tex: T.sand, ...rock, wall: 64 };
  m.A('vil_s', 960, -832, 1792, 64, VIL, vil);
  m.A('vil_m', 1152, 64, 1792, 192, VIL, vil);
  m.A('vil_n', 960, 192, 1792, 896, VIL, vil);
  m.S('vil_steps', 960, 64, 1152, 192, VIL, 0, 'w', 8, { tex: T.stone, stepTex: T.stone, ...rock, wall: 64 });
  m.R('vil_ramp', 1216, 896, 1472, 1216, LOW, VIL, 'e', low);
  m.A('vil_ne', 1472, 896, 1792, 1216, VIL, vil);

  // ---- the rock all round (auto mass): heights and textures
  const R = (h) => ({ height: h, tex: T.rock, roof: T.rock, capTex: null });
  m.zone(-1792, -960, -1408, 1472, R(96)); // west of the wadi
  m.zone(-1792, -1792, -1408, -960, R(-144)); // west of the plain (low: the sun gets in)
  m.zone(-1792, -1792, 2048, -1536, R(-144)); // south of the plain
  m.zone(-1792, 1216, 2048, 1472, R(192)); // north of the canyon
  m.zone(1792, -1792, 2048, 1472, R(96)); // east of the village
  m.zone(768, -1792, 1792, -1088, R(64)); // below the road
  m.zone(1728, -1088, 1792, -832, R(64)); // the hairpin's outer bank
}

// ------------------------------------------------------------------ the fort
function fort(m) {
  // ---- battlements on the outer edge of the wall walk (west, north, east, south)
  battlement(m, 'y', -576, -96, -704, -688, WALK, -1); // (the west walk; over the bunker too)
  battlement(m, 'y', -96, 160, -704, -688, WALK, -1, { skip: [[0, 160]] }); // (no merlon where the stair's parapet climbs past)
  battlement(m, 'x', -96, 576, 688, 704, WALK, 1);
  battlement(m, 'x', -192, -96, 688, 704, WALK, 1, { merlons: false });
  battlement(m, 'y', 464, 704, 688, 704, WALK, 1);
  battlement(m, 'y', -64, 272, 688, 704, WALK, 1, { skip: [[-64, 64]] });
  battlement(m, 'x', -704, -160, -576, -560, WALK, -1);
  battlement(m, 'x', 576, 704, 688, 704, WALK, 1, { merlons: true }); // NE bastion north edge
  // the stairs up to the towers: a low parapet on their outer edge (they climb above the walk)
  stairParapet(m, 'y', 160, 448, -704, -688, WALK, TOP, 'n');
  stairParapet(m, 'x', -448, -192, 688, 704, WALK, TOP, 'w');
  stairParapet(m, 'y', -320, -64, 688, 704, WALK, TOP, 's');
  stairParapet(m, 'x', 192, 448, -576, -560, WALK, TOP, 'e');
  // battered stone foot of the curtain walls, outside
  batter(m, 'y', -576, 704, -704, -1, 0, 80, 22);
  batter(m, 'x', -704, 704, 704, 1, 0, 80, 22);
  batter(m, 'y', -576, 272, 704, 1, 0, 80, 22);
  batter(m, 'y', 464, 704, 704, 1, 0, 80, 22);
  batter(m, 'x', -704, -160, -576, -1, 0, 80, 22);
  batter(m, 'x', 160, 704, -576, -1, 0, 80, 22);

  tower(m, -704, 448, -448, 704, { // the Ember Tower: the beacon
    doors: { s: [{ c: -512, w: 80 }], e: [{ c: 512, w: 96 }] },
    battle: { w: true, n: true }, open: { s: [-704, -576], e: [576, 704] }, beacon: true,
  });
  tower(m, 448, -576, 704, -320, { // the SE watchtower
    doors: { w: [{ c: -384, w: 96 }], n: [{ c: 512, w: 96 }] },
    battle: { e: true, s: true }, open: { w: [-576, -448], n: [576, 704] },
  });
  gatehouse(m);
  breach(m);
  house(m);
  barracks(m);
  storehouse(m);
  bunker(m);
  courtyard(m);
  wallDetail(m);
}

/** The curtain walls' trimmings: drain spouts outside, viga ends inside, the mast, the sentry box, banners. */
function wallDetail(m) {
  const nc = { contents: 0 };
  // canales: timber drain spouts poking out of the outer faces just above the wall walk
  for (let y = -480; y < 640; y += 192) {
    if (y > -320 && y < 0) continue;
    prop(m, -724, y - 5, WALK + 2, -704, y + 5, WALK + 10, T.timber, nc);
    prop(m, 704, y - 5, WALK + 2, 724, y + 5, WALK + 10, T.timber, nc);
  }
  for (let x = -544; x < 640; x += 192) {
    if (x > -200 && x < 200) continue;
    prop(m, x - 5, -596, WALK + 2, x + 5, -576, WALK + 10, T.timber, nc);
    prop(m, x - 5, 704, WALK + 2, x + 5, 724, WALK + 10, T.timber, nc);
  }
  // viga ends along the inner faces under the wall walk (see-through to the hull: decoration only)
  const viga = (x0, y0, x1, y1) => prop(m, x0, y0, WALK - 30, x1, y1, WALK - 20, T.timber, nc);
  for (let x = -544; x < -480; x += 56) viga(x, -448, x + 10, -432);
  for (let y = -416; y < -96; y += 56) viga(-576, y, -560, y + 10);
  for (let y = 176; y < 448; y += 56) viga(-576 + 0, y, -560, y + 10);
  for (let y = 224; y < 272; y += 56) viga(560, y, 576, y + 10);
  for (let x = 400; x < 576; x += 56) viga(x, 560, x + 10, 576);
  // the radio mast on the north-east bastion (the landmark you see from the plain), guy lines
  mast(m, 640, 640, WALK, 560, 32);
  for (const [gx, gy] of [[584, 584], [696, 584], [584, 696], [696, 696]]) {
    shearedBox(m, gx, gy, WALK, 640 + (gx - 640) * 0.1, 640 + (gy - 640) * 0.1, WALK + 420, 0.75, T.iron, { contents: 0, detail: true, name: 'guy' });
  }
  m.light(640, 640, WALK + 580, [1, 0.25, 0.15], 0.5, 240);
  // a sentry box on the south-west bastion: four posts, a plank roof (112 over the walk: no perch)
  for (const [x, y] of [[-692, -564], [-604, -564], [-692, -476], [-604, -476]]) prop(m, x - 5, y - 5, WALK, x + 5, y + 5, WALK + 112, T.timber, { surface: 'wood' });
  m.prism('y', [[-708, WALK + 112], [-588, WALK + 112], [-588, WALK + 120], [-708, WALK + 140]], -580, -460, { all: T.planks, bottom: T.timber }, { name: 'sentry' });
  clipRoof(m, -708, -580, -588, -460, WALK + 112);
  lantern(m, -648, -520, WALK + 110, { radius: 300 });
  sandbags(m, -700, -540, -676, -480, WALK);
  // banners hanging from the gatehouse over the inner gate (canvas, see-through to the hull)
  for (const x of [-140, 108]) prop(m, x, -384, WALK + 24, x + 32, -382, WALK + 120, T.canvas, nc);
  // the barracks roof: two sandbag nests and ammo boxes (all hop-able)
  sandbags(m, 384, -176, 408, -96, 160);
  sandbags(m, 384, 64, 408, 144, 160);
  m.crate(440, -20, 160, 32, 32, 32, 'crate_green');
  // the helipad: a windsock on the roof's corner (solid only near its foot)
  prop(m, 372, 552, WALK, 380, 560, WALK + 80, T.iron, { surface: 'metal' });
  prop(m, 372, 552, WALK + 80, 380, 560, WALK + 200, T.iron, nc);
  hull(m, [[380, 556, WALK + 196], [380, 548, WALK + 188], [380, 564, WALK + 188], [380, 556, WALK + 180], [440, 556, WALK + 186]], T.canvas, { contents: 0, name: 'windsock' });
  // the courtyard: a trough by the well, a hitching rail, sacks at the storehouse, a handcart
  m.box(-16, -48, 0, 112, -16, 28, { all: T.stone, top: T.timber }, { name: 'trough' });
  prop(m, 96, -280, 0, 104, -272, 36, T.timber, { surface: 'wood' });
  prop(m, 224, -280, 0, 232, -272, 36, T.timber, { surface: 'wood' });
  prop(m, 96, -280, 30, 232, -272, 36, T.timber, { surface: 'wood' });
  for (const [x, y] of [[-200, 180], [-176, 196], [-196, 202]]) m.box(x - 14, y - 12, 0, x + 14, y + 12, 22, { all: T.bags }, { detail: true, surface: 'dirt', name: 'sack' });
  m.crate(300, -40, 0, 40);
  m.crate(330, -10, 0, 32);
  // washing lines between the barracks and the stalls (rope and cloth, no collision)
  prop(m, 300, 220, 120, 368, 222, 122, T.timber, nc);
  for (const [x, w] of [[312, 18], [336, 22]]) prop(m, x, 220, 84, x + w, 222, 120, T.canvas, nc);
}

/** A low parapet along the outer edge of a stair climbing from z0 to z1 toward dir. */
function stairParapet(m, axis, a0, a1, t0, t1, z0, z1, dir) {
  const n = 9, len = (a1 - a0) / n;
  for (let i = 0; i < n; i++) {
    const z = z0 + (z1 - z0) * (dir === 'n' || dir === 'e' ? i + 1 : n - i) / n;
    const u0 = a0 + i * len, u1 = u0 + len;
    const [x0, y0, x1, y1] = axis === 'x' ? [u0, t0, u1, t1] : [t0, u0, t1, u1];
    m.box(x0, y0, z - 16, x1, y1, z + 30, { all: T.adobe }, { name: 'parapet' });
  }
}

/**
 * A stone tower on the wall's corner, x0..x1 / y0..y1, a guard room (0..160) with doors, solid
 * above it up to the top platform (TOP); battlements on its outer sides, a low parapet on the
 * inner ones except where the stairs arrive (o.open: { side: [u0, u1] }).
 */
function tower(m, x0, y0, x1, y1, o) {
  const S = T.stone, t = 32, H = 160;
  const ix0 = x0 + t, iy0 = y0 + t, ix1 = x1 - t, iy1 = y1 - t;
  const k = (side) => ({ all: S, top: T.flag, [side]: T.adobe });
  wall(m, 'x', x0, x1, y0, iy0, 0, TOP, k('n'), o.doors.s || []);
  wall(m, 'x', x0, x1, iy1, y1, 0, TOP, k('s'), o.doors.n || []);
  wall(m, 'y', iy0, iy1, x0, ix0, 0, TOP, k('e'), o.doors.w || []);
  wall(m, 'y', iy0, iy1, ix1, x1, 0, TOP, k('w'), o.doors.e || []);
  // the guard room's ceiling and the masonry above it
  m.box(ix0, iy0, H, ix1, iy1, TOP, { all: S, bottom: T.timber, top: T.flag }, { name: 'tower' });
  for (let x = ix0 + 24; x < ix1 - 8; x += 48) beam(m, x, iy0, H - 10, x + 12, iy1, H);
  for (const [side, d] of Object.entries(o.doors)) for (const g of d) {
    if (side === 's') doorFrame(m, 'x', g.c, g.w, y0, iy0, 0, 112, T.timber);
    if (side === 'n') doorFrame(m, 'x', g.c, g.w, iy1, y1, 0, 112, T.timber);
    if (side === 'w') doorFrame(m, 'y', g.c, g.w, x0, ix0, 0, 112, T.timber);
    if (side === 'e') doorFrame(m, 'y', g.c, g.w, ix1, x1, 0, 112, T.timber);
  }
  lantern(m, (ix0 + ix1) / 2, (iy0 + iy1) / 2, H - 10, { radius: 300 });
  // the top: battlements outside, parapet inside, gaps where the stairs come up
  const sides = {
    s: ['x', x0, x1, y0, y0 + 16, -1], n: ['x', x0, x1, y1 - 16, y1, 1],
    w: ['y', y0, y1, x0, x0 + 16, -1], e: ['y', y0, y1, x1 - 16, x1, 1],
  };
  for (const [side, [ax, a0, a1, t0, t1, out]] of Object.entries(sides)) {
    const gap = o.open[side];
    const runs = gap ? [[a0, gap[0]], [gap[1], a1]] : [[a0, a1]];
    for (const [r0, r1] of runs) {
      if (r1 - r0 < 8) continue;
      if (o.battle[side]) battlement(m, ax, r0, r1, t0, t1, TOP, out, { tex: S });
      else parapet(m, ax, r0, r1, t0, t1, TOP, -out, S);
    }
  }
  // a timber canopy on four posts over the top (the beacon's shelter / the lookout's roof)
  const cz = TOP + 160, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = (x1 - x0) / 2 - 40;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) beam(m, cx + sx * r - 8, cy + sy * r - 8, TOP, cx + sx * r + 8, cy + sy * r + 8, cz);
  beam(m, cx - r - 16, cy - r - 8, cz, cx + r + 16, cy - r + 8, cz + 12);
  beam(m, cx - r - 16, cy + r - 8, cz, cx + r + 16, cy + r + 8, cz + 12);
  m.prism('x', [[cy - r - 28, cz + 12], [cy + r + 28, cz + 12], [cy, cz + 72]], cx - r - 28, cx + r + 28, { all: T.planks, bottom: T.timber }, { name: 'canopy' });
  if (o.beacon) {
    // the ember: a great brazier (40 high: hop up to it) and its fire
    brazier(m, cx, cy, TOP, { r: 30, flame: 44, intensity: 1.6, radius: 760 });
    m.light(cx, cy, TOP + 130, FIRE, 0.7, 520);
  } else {
    torch(m, cx - r - 6, cy, TOP + 70, 'e', { radius: 280 });
  }
}

/** The gatehouse over the main gate: the winch room on the wall walk, the gate below. */
function gatehouse(m) {
  const S = T.stone, A = T.adobe;
  const x0 = -160, x1 = 160, y0 = -640, y1 = -384, z = WALK, h = 128;
  const k = (side) => ({ all: S, [side]: A });
  wall(m, 'x', x0, x1, y0, y0 + 16, z, z + h, k('n'), [{ c: -64, w: 40, z0: z + 44, z1: z + 92 }, { c: 64, w: 40, z0: z + 44, z1: z + 92 }]);
  wall(m, 'x', x0, x1, y1 - 16, y1, z, z + h, k('s'), [{ c: 0, w: 64, z0: z + 44, z1: z + 100 }]);
  wall(m, 'y', y0 + 16, y1 - 16, x0, x0 + 16, z, z + h, k('e'), [{ c: -512, w: 96 }]);
  wall(m, 'y', y0 + 16, y1 - 16, x1 - 16, x1, z, z + h, k('w'), [{ c: -512, w: 96 }]);
  m.box(x0, y0, z + h, x1, y1, z + h + 16, { all: S, bottom: T.planks, top: S }, { name: 'gh_roof' });
  battlement(m, 'x', x0, x1, y0, y0 + 16, z + h + 16, -1, { tex: S });
  clipRoof(m, x0, y0, x1, y1, z + h + 16);
  for (let x = x0 + 40; x < x1 - 20; x += 64) beam(m, x, y0 + 16, z + h - 12, x + 12, y1 - 16, z + h);
  doorFrame(m, 'y', -512, 96, x0, x0 + 16, z, 112);
  doorFrame(m, 'y', -512, 96, x1 - 16, x1, z, 112);
  // the winch: a drum on two trestles (40 high), its chains down through the floor
  prop(m, -72, -540, z, -60, -484, z + 40, T.timber, { surface: 'wood' });
  prop(m, 60, -540, z, 72, -484, z + 40, T.timber, { surface: 'wood' });
  m.prism('x', [[-528, z + 16], [-496, z + 16], [-484, z + 28], [-496, z + 40], [-528, z + 40], [-540, z + 28]], -60, 60, { all: T.timber }, { detail: true, surface: 'wood', name: 'winch' });
  prop(m, -100, -516, z + 26, -60, -508, z + 30, T.iron, { surface: 'metal' });
  for (const x of [-30, 30]) prop(m, x - 2, -514, z + 20, x + 2, -510, z + 40, T.iron, { contents: 0 });
  lantern(m, 0, -440, z + h, { radius: 300 });
  lantern(m, 0, -600, z + h, { radius: 260 });
  // the gate passage (0..144): stone arch faces and the gate
  for (const y of [-640, -400]) {
    prop(m, -112, y, 0, -96, y + 16, 144, S);
    prop(m, 96, y, 0, 112, y + 16, 144, S);
    prop(m, -112, y, 128, 112, y + 16, 152, S);
  }
  for (let y = -620; y < -400; y += 56) beam(m, -96, y, 132, 96, y + 12, 144);
  // the heavy timber gate: the west leaf swung in against the passage wall, the east one fallen flat
  prop(m, -96, -620, 0, -84, -524, 136, { all: T.timber, e: { name: T.door, fit: true }, w: { name: T.door, fit: true } }, { surface: 'wood', name: 'gate' });
  for (const z of [24, 112]) prop(m, -84, -620, z, -82, -524, z + 6, T.iron, { surface: 'metal' });
  m.prism('x', [[-612, 0], [-470, 0], [-470, 10], [-612, 14]], 4, 92, { all: T.timber }, { detail: true, surface: 'wood', name: 'gate' });
  for (const x of [20, 76]) prop(m, x, -606, 10, x + 6, -476, 15, T.iron, { surface: 'metal' });
  torch(m, -128, -656, 112, 's');
  torch(m, 128, -656, 112, 's');
  torch(m, -128, -368, 112, 'n', { radius: 300 });
  torch(m, 128, -368, 112, 'n', { radius: 300 });
}

/** The breach in the east wall: rubble and a plank bridge carrying the wall walk over the gap. */
function breach(m) {
  const y0 = 272, y1 = 464;
  // the broken wall ends: tumbled steps of adobe (steep tops), rubble in the gap
  for (const [y, s] of [[y0, 1], [y1, -1]]) {
    m.prism('y', [[576, WALK], [704, WALK], [704, 40], [576, 120]].map(([x, z]) => [x, z]), Math.min(y, y + s * 28), Math.max(y, y + s * 28), { all: T.adobe }, { name: 'breach' });
  }
  rubble(m, 640, 368, 0, 70, 11);
  rubble(m, 560, 330, 0, 50, 12);
  rubble(m, 740, 400, 0, 60, 13);
  rubble(m, 820, 330, 0, 40, 14);
  // the plank bridge (16 thick, 160 clear underneath) and its stringers
  m.box(584, y0 + 28, WALK - 12, 696, y1 - 28, WALK, { all: T.planks, bottom: T.timber }, { surface: 'wood', name: 'bridge' });
  for (const x of [588, 680]) beam(m, x, y0 + 20, WALK - 26, x + 12, y1 - 20, WALK - 12);
  // rope rails (thin, no collision)
  for (const x of [584, 694]) {
    prop(m, x, y0 + 28, WALK + 30, x + 2, y1 - 28, WALK + 32, T.timber, { contents: 0 });
    for (const y of [y0 + 30, (y0 + y1) / 2, y1 - 34]) prop(m, x - 1, y, WALK, x + 3, y + 4, WALK + 34, T.timber, { contents: 0 });
  }
  // sandbag barricade the defenders threw up inside, half torn down
  m.box(440, 300, 0, 464, 400, 36, { all: T.bags }, { surface: 'dirt', detail: true, name: 'sandbags' });
}

/** The commander's house (N): two doors on the yard, one each side, the stair up to the helipad roof. */
function house(m) {
  const A = T.adobe, x0 = -64, x1 = 384, y0 = 320, y1 = 576, h = 160;
  const k = (side) => ({ all: A, [side]: T.adobe });
  wall(m, 'x', x0 - 16, x1 + 16, y0 - 16, y0, 0, h, k('n'), [
    { c: 112, w: 96 }, { c: 304, w: 80 },
    { c: 192, w: 64, z0: 36, z1: 116 },
  ]);
  wall(m, 'y', y0, y1, x0 - 16, x0, 0, h, k('e'), [{ c: 400, w: 80 }]);
  wall(m, 'y', y0, y1, x1, x1 + 16, 0, h, k('w'), [{ c: 448, w: 80 }]);
  // the roof (160..176) with the stairwell over the stair's top (x -64..32, y 432..576)
  m.box(x0 - 16, y0 - 16, h, x1 + 16, 432, WALK, { all: A, bottom: T.timber, top: T.flag }, { name: 'roof' });
  m.box(32, 432, h, x1 + 16, y1, WALK, { all: A, bottom: T.timber, top: T.flag }, { name: 'roof' });
  for (let x = x0 + 40; x < x1 - 8; x += 56) beam(m, x, y0, h - 10, x + 12, y1, h);
  // the helipad: a painted pad on the roof (a 2-unit step) and its corner lamps
  m.box(80, 336, WALK, 368, 560, WALK + 2, { all: T.flag, top: { name: T.pad, fit: true, rot: 90 } }, { name: 'helipad', detail: true });
  parapet(m, 'x', x0 - 16, x1 + 16, y0 - 16, y0, WALK, -1);
  parapet(m, 'y', y0, y1, x0 - 16, x0, WALK, -1);
  parapet(m, 'y', y0, y1, x1, x1 + 16, WALK, 1);
  // a rail round the stairwell (36: hop it), and posts
  prop(m, 32, 432, WALK, 40, 576, WALK + 36, T.timber, { surface: 'wood' });
  prop(m, -64, 424, WALK, 40, 432, WALK + 36, T.timber, { surface: 'wood' });
  for (const [x, y] of [[88, 344], [360, 344], [88, 552], [360, 552]]) {
    const b = prop(m, x - 4, y - 4, WALK + 2, x + 4, y + 4, WALK + 8, T.glow, { contents: 0 });
    b.fullbright = true; b.castShadow = false;
  }
  m.light(224, 448, WALK + 90, LANTERN, 0.45, 360);
  doorFrame(m, 'x', 112, 96, y0 - 16, y0, 0, 112);
  doorFrame(m, 'x', 304, 80, y0 - 16, y0, 0, 112);
  doorFrame(m, 'y', 400, 80, x0 - 16, x0, 0, 112);
  doorFrame(m, 'y', 448, 80, x1, x1 + 16, 0, 112);
  shutteredWindow(m, 'x', 192, 64, y0 - 16, -1, 36, 116);
  doorLeaf(m, 64, 320, 0, 44, 110, 250);
  // inside: the commander's office - desk, map table, radio set, cabinets (all low or tall)
  prop(m, 160, 520, 0, 256, 560, 30, T.planks, { surface: 'wood' }); // desk
  prop(m, 200, 380, 0, 296, 440, 32, T.planks, { surface: 'wood' }); // map table
  prop(m, 352, 340, 0, 384, 420, 96, T.timber, { surface: 'wood' }); // cabinet (96: no perch)
  prop(m, 352, 470, 0, 384, 520, 96, T.timber, { surface: 'wood' });
  prop(m, 300, 528, 0, 344, 576, 32, T.iron, { surface: 'metal' }); // radio set
  prop(m, 306, 540, 32, 338, 572, 52, T.iron, { surface: 'metal', contents: 0 });
  lantern(m, 120, 448, h - 10, { radius: 330 });
  lantern(m, 280, 448, h - 10, { radius: 330 });
  torch(m, 210, 302, 112, 's', { radius: 300 });
}

/** The barracks (E): three doors, cots and lockers, its flat roof one step below the wall walk. */
function barracks(m) {
  const A = T.adobe, x0 = 384, x1 = 560, y0 = -224, y1 = 192, h = 144;
  const k = (side) => ({ all: A, [side]: A });
  wall(m, 'y', y0, y1, x0 - 16, x0, 0, h, k('e'), [{ c: -176, w: 80 }, { c: -80, w: 64, z0: 36, z1: 116 }]);
  wall(m, 'x', x0 - 16, x1 + 16, y1, y1 + 16, 0, h, k('s'), [{ c: 448, w: 96 }]);
  wall(m, 'x', x0 - 16, x1 + 16, y0 - 16, y0, 0, h, k('n'), [{ c: 480, w: 96 }]);
  m.box(x0 - 16, y0 - 16, h, x1 + 16, y1 + 16, 160, { all: A, bottom: T.timber, top: T.planks }, { name: 'roof' });
  for (let y = y0 + 32; y < y1 - 8; y += 56) beam(m, x0, y, h - 10, x1, y + 12, h);
  parapet(m, 'x', x0 - 16, x1 + 16, y0 - 16, y0, 160, -1);
  doorFrame(m, 'y', -176, 80, x0 - 16, x0, 0, 112);
  doorFrame(m, 'x', 448, 96, y1, y1 + 16, 0, 112);
  doorFrame(m, 'x', 480, 96, y0 - 16, y0, 0, 112);
  shutteredWindow(m, 'y', -80, 64, x0 - 16, -1, 36, 116);
  // cots along the east wall (20 high), lockers on the west (96)
  for (let y = y0 + 24; y < y1 - 60; y += 72) {
    prop(m, x1 - 80, y, 0, x1 - 8, y + 36, 20, { all: T.timber, top: T.canvas }, { surface: 'wood' });
  }
  for (let y = -40; y < 160; y += 40) prop(m, x0, y, 0, x0 + 28, y + 36, 96, T.iron, { surface: 'metal' });
  prop(m, 448, -150, 0, 496, -70, 30, T.planks, { surface: 'wood' }); // table
  lantern(m, 472, -120, h - 10);
  lantern(m, 472, 80, h - 10);
}

/** The storehouse (NW yard): doors on the yard and toward the postern; a clipped flat roof. */
function storehouse(m) {
  const A = T.adobe, x0 = -352, x1 = -192, y0 = 224, y1 = 416, h = 136;
  const k = (side) => ({ all: A, [side]: A });
  wall(m, 'x', x0 - 16, x1 + 16, y0 - 16, y0, 0, h, k('n'), [{ c: -272, w: 96 }]);
  wall(m, 'x', x0 - 16, x1 + 16, y1, y1 + 16, 0, h, k('s'), [{ c: -240, w: 80 }]);
  wall(m, 'y', y0, y1, x0 - 16, x0, 0, h, k('e'), []);
  wall(m, 'y', y0, y1, x1, x1 + 16, 0, h, k('w'), [{ c: 320, w: 80 }]);
  m.box(x0 - 16, y0 - 16, h, x1 + 16, y1 + 16, h + 16, { all: A, bottom: T.timber, top: T.planks }, { name: 'roof' });
  clipRoof(m, x0 - 16, y0 - 16, x1 + 16, y1 + 16, h + 16);
  doorFrame(m, 'x', -272, 96, y0 - 16, y0, 0, 112);
  doorFrame(m, 'x', -240, 80, y1, y1 + 16, 0, 112);
  doorFrame(m, 'y', 320, 80, x1, x1 + 16, 0, 112);
  // sacks and crates
  m.crate(-320, 380, 0, 40, 40, 40);
  m.crate(-320, 380, 40, 32, 32, 30, 'crate');
  m.crate(-230, 250, 0, 32);
  for (const [x, y] of [[-336, 260], [-336, 300], [-300, 256]]) m.box(x - 14, y - 12, 0, x + 14, y + 12, 22, { all: T.bags }, { detail: true, surface: 'dirt', name: 'sack' });
  lantern(m, -272, 320, h - 4, { radius: 280 });
}

/** The ammo bunker under the west wall: timber props, ammo crates, work lamps. */
function bunker(m) {
  // timber frames across the hall and the tunnels (posts against the walls, a beam overhead)
  const frame = (x, y0, y1) => {
    prop(m, x, y0, TUN, x + 12, y0 + 12, -16, T.timber, { surface: 'wood' });
    prop(m, x, y1 - 12, TUN, x + 12, y1, -16, T.timber, { surface: 'wood' });
    beam(m, x, y0, -30, x + 12, y1, -16);
  };
  for (const x of [-690, -600, -520]) frame(x, -96, 160);
  for (const x of [-940, -860, -780]) frame(x, -32, 96);
  for (const y of [-330, -250, -170, -90]) { prop(m, -896, y, TUN, -884, y + 12, -16, T.timber); prop(m, -780, y, TUN, -768, y + 12, -16, T.timber); beam(m, -896, y, -30, -768, y + 12, -16); }
  // ammo crates (32/40: hop on) and a stack against the wall (72: from the 32 crate it's 40)
  m.crate(-660, 120, TUN, 40, 40, 40, 'crate_green');
  m.crate(-620, 128, TUN, 32, 32, 32, 'crate_green');
  m.crate(-660, 120, TUN + 40, 32, 32, 32, 'crate_green');
  m.crate(-540, -70, TUN, 40, 40, 32, 'crate');
  m.crate(-660, -60, TUN, 32);
  for (const [x, y] of [[-600, 140], [-570, 144]]) prop(m, x - 10, y - 10, TUN, x + 10, y + 10, TUN + 36, T.iron, { surface: 'metal' });
  // work lamps on the walls
  lamp(m, -640, 158, -60, { face: 's', tex: T.glow, size: [14, 10], color: [1, 0.8, 0.5], intensity: 0.85, radius: 380 });
  lamp(m, -540, -94, -60, { face: 'n', tex: T.glow, size: [14, 10], color: [1, 0.8, 0.5], intensity: 0.8, radius: 380 });
  lamp(m, -832, 94, -60, { face: 's', tex: T.glow, size: [14, 10], color: [1, 0.8, 0.5], intensity: 0.75, radius: 360 });
  lamp(m, -894, -200, -60, { face: 'e', tex: T.glow, size: [14, 10], color: [1, 0.8, 0.5], intensity: 0.75, radius: 360 });
  // sandbags round the ramp's top edge (36: hop them)
  sandbags(m, -480, 64, -300, 88, 0);
  sandbags(m, -480, -120, -320, -96, 0);
  torch(m, -230, 70, 100, 'n');
}

/** The courtyard: the well, the market stalls, the motor pool, crates and lights. */
function courtyard(m) {
  // central paving (flagstones over the earth: later brushes win the coplanar top)
  m.box(-224, -320, -8, 352, 288, 0, { all: null, top: T.flag }, { name: 'paving' });
  m.box(-96, -448, -8, 96, -320, 0, { all: null, top: T.flag }, { name: 'paving' });
  // the well: a stone ring (32: hop on) with a plank lid, a timber frame and a little roof
  const wx = 64, wy = 32;
  const ring = [];
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; ring.push([wx + Math.cos(a) * 44, wy + Math.sin(a) * 44]); }
  m.prism('z', ring, 0, 32, { all: T.stone, top: T.planks }, { name: 'well' });
  for (const s of [-1, 1]) prop(m, wx + s * 52 - 6, wy - 6, 0, wx + s * 52 + 6, wy + 6, 168, T.timber, { surface: 'wood' });
  beam(m, wx - 60, wy - 4, 160, wx + 60, wy + 4, 168);
  m.prism('x', [[wy - 60, 168], [wy + 60, 168], [wy, 204]], wx - 72, wx + 72, { all: T.planks, bottom: T.timber }, { name: 'well_roof', contents: 0 });
  prop(m, wx - 3, wy - 3, 100, wx + 3, wy + 3, 160, T.iron, { contents: 0 });
  prop(m, wx - 8, wy - 8, 96, wx + 8, wy + 8, 110, T.timber, { contents: 0 });
  // market stalls around the square
  stall(m, -160, 128, -64, 192, 0, 's');
  stall(m, 176, 160, 272, 224, 0, 's', { canvas: T.canvas });
  stall(m, -176, -224, -96, -128, 0, 'e');
  stall(m, 224, -240, 304, -144, 0, 'w');
  m.crate(-120, 210, 0, 32);
  m.crate(220, 240, 0, 32);
  for (const [x, y] of [[-200, -150], [-196, -186]]) prop(m, x - 12, y - 12, 0, x + 12, y + 12, 28, T.timber, { surface: 'wood' });
  // braziers lighting the square, torches on the walls
  brazier(m, -64, -64, 0);
  brazier(m, 224, 40, 0);
  brazier(m, 0, -320, 0, { radius: 380 });
  torch(m, -560, 300, 120, 'e');
  torch(m, -560, -300, 120, 'e');
  torch(m, 560, 340, 120, 'w');
  torch(m, -300, 560, 120, 's');
  torch(m, 400, 560, 120, 's', { radius: 280 });
  // the motor pool: two burnt trucks, the fenced fuel depot, oil drums
  motorPool(m);
}

function motorPool(m) {
  truck(m, -400, -240, 0, 'x', 1);
  truck(m, -312, -390, 0, 'x', -1, { tarp: false });
  // the fuel depot: a tank on cradles (its top 96: no perch), drums, a chain-link fence
  m.prism('x', [[-424, 24], [-392, 8], [-344, 8], [-312, 24], [-312, 72], [-344, 96], [-392, 96], [-424, 72]].map(([y, z]) => [y, z]), -576, -448, { all: T.iron }, { surface: 'metal', name: 'tank' });
  for (const x of [-560, -464]) prop(m, x, -420, 0, x + 12, -316, 16, T.timber, { surface: 'wood' });
  for (const [x, y] of [[-520, -290], [-492, -296], [-506, -268], [-470, -276]]) m.prism('z', octo(x, y, 13), 0, 40, { all: T.iron }, { surface: 'metal', name: 'barrel' });
  // tools bench along the south wall's stair? keep the path clear: crates by the trucks
  m.crate(-248, -200, 0, 32);
  m.crate(-216, -204, 0, 32);
}

function octo(x, y, r) {
  const pts = [];
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  return pts;
}

// ------------------------------------------------------------------ spawns and nav seeds
function entities(m) {
  spawnGrid(m, 'info_player_start', 64, -176, 0, 90, 4, 2, 64);
  spawnGrid(m, 'info_player_start', 64, -304, 0, 90, 4, 1, 64);
  // nav seeds: one per region (the flood fill reaches them all, these just make sure)
  navSeed(m, -600, -1300, LOW); // the plain
  navSeed(m, -1184, 0, LOW); // the wadi
  navSeed(m, 200, 1120, LOW); // the canyon
  navSeed(m, 1400, 0, VIL); // the village
}
