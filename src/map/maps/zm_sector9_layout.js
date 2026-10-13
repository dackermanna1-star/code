// Sector 9 (zm_sector9): the block-out - every floor as an AreaMap area, the levels stacked
// where a corridor runs over a service tunnel, the ceilings, doors and the big structure
// (atrium galleries, bridges, stairs, the security suite). Detail lives in zm_sector9_parts.js
// and zm_sector9_dress.js.
//
// Levels: L0 -192 (the pit, service tunnels, lower labs, pump room, vent sump), L1 0 (the main
// floor), L2 192 (atrium galleries, the security suite), SURF 320 (the yard, under the sky).
// Everything underground is capped at ROCK: auto mass and ceiling slabs top out there and one
// cap brush hides their tops (m.style.roof = null: mass tops are nodraw).
//
// Stacking: AreaMap floors are solid from the bottom of the world, so a floor over another is
// a `slab` area, and the area under it has no ceiling of its own (the slab is its roof). An
// L0 room under plain rock just takes `ceil` up to ROCK, which carves it out of the mass.
// Wall textures come from zones: skin() paints the 16 units of mass around a room.

export const L0 = -192, L1 = 0, L2 = 192, SURF = 320, ROCK = 512, HILL = 512;

export const T = {
  floor: 's9_floor', cfloor: 's9_floorc', wall: 's9_wall', conc: 's9_concrete', ceil: 'ceiling_tile', metal: 's9_metal',
  grate: 'metal_diamond', tile: 'tile_white', haz: 's9_hazard', glass: 's9_glass', asphalt: 'asphalt',
  lamp: 'light_panel', red: 's9_lamp_red', tank: 's9_tank', server: 's9_server', sign: 's9_sign', crate: 's9_crate', fence: 'chainlink',
};

/** The lab wall with its dado on the floor at z (a 256-tall texture: v offset = the floor). */
export const wallAt = (z) => ({ name: T.wall, offset: [0, z] });

/** Room rects by name (for zones, dressing and tests): [x0, y0, x1, y1, z]. Filled by layout(). */
export const R = {};

function area(m, name, x0, y0, x1, y1, z, o = {}) {
  R[name] = [x0, y0, x1, y1, z];
  return m.A(name, x0, y0, x1, y1, z, { wall: ROCK - z, ...o });
}
/** A roofed room: floor at z, clear height h, ceiling slab up to ROCK. */
function room(m, name, x0, y0, x1, y1, z, h, o = {}) {
  return area(m, name, x0, y0, x1, y1, z, { ceil: z + h, ceilTop: ROCK, ...o });
}
/** A doorway area through a wall: floor at z, lintel from z + h up. */
function door(m, name, x0, y0, x1, y1, z, h = 112, o = {}) {
  return area(m, name, x0, y0, x1, y1, z, { ceil: z + h, ceilTop: ROCK, wallTex: wallAt(z), ...o });
}
/** A stair area (solid underneath) rising toward dir, with a flat ceiling at z1 + h. */
function stair(m, name, x0, y0, x1, y1, z0, z1, dir, steps, h, o = {}) {
  R[name] = [x0, y0, x1, y1, z0];
  return m.S(name, x0, y0, x1, y1, z0, z1, dir, steps, { tex: T.grate, stepTex: T.metal, side: T.conc, wall: ROCK - z0, ceil: z1 + h, ceilTop: ROCK, ceilTex: T.conc, wallTex: T.conc, surface: 'metal', ...o });
}
/** Paint the mass around a room (t units deep) with tex (zones listed later win). */
function skin(m, x0, y0, x1, y1, tex, t = 16) {
  m.zone(x0 - t, y1, x1 + t, y1 + t, { tex });
  m.zone(x0 - t, y0 - t, x1 + t, y0, { tex });
  m.zone(x1, y0, x1 + t, y1, { tex });
  m.zone(x0 - t, y0, x0, y1, { tex });
}

export function layout(m) {
  const F = { tex: T.floor, ceilTex: T.ceil, side: T.conc };
  const C = { tex: T.cfloor, ceilTex: T.conc, side: T.conc };
  const S = { slab: true, slabDepth: 32 };

  // ------------------------------------------------------------------ the atrium (landmark)
  // a 1280 hall, two storeys and a roof; the containment pit in the middle (L0) with the
  // specimen tank; the L1 ring round the pit, L2 galleries on the walls and bridges to the tank
  room(m, 'pit', -320, -320, 320, 320, L0, 640, { ...C });
  room(m, 'ring_n', -640, 320, 640, 640, L1, 448, { ...C });
  room(m, 'ring_s', -640, -640, 640, -320, L1, 448, { ...C });
  room(m, 'ring_ws', -640, -320, -320, -80, L1, 448, { ...C });
  room(m, 'ring_wn', -640, 80, -320, 320, L1, 448, { ...C });
  room(m, 'ring_wm', -640, -80, -320, 80, L1, 448, { ...C, ...S });
  room(m, 'ring_es', 320, -320, 640, -80, L1, 448, { ...C });
  room(m, 'ring_en', 320, 80, 640, 320, L1, 448, { ...C });
  room(m, 'ring_em', 320, -80, 640, 80, L1, 448, { ...C, ...S });
  // doors out of the atrium (its wall is 32 thick: 640..672)
  door(m, 'atr_n', -96, 640, 96, 672, L1, 128, { tex: T.cfloor, wallTex: T.conc });
  door(m, 'atr_nw', -608, 640, -480, 672, L1, 128, { tex: T.cfloor, wallTex: T.conc });
  door(m, 'atr_ne', 480, 640, 608, 672, L1, 128, { tex: T.cfloor, wallTex: T.conc });
  door(m, 'atr_sw', -512, -672, -384, -640, L1, 128, { tex: T.cfloor, wallTex: T.conc });
  door(m, 'atr_se', 256, -672, 384, -640, L1, 128, { tex: T.cfloor, wallTex: T.conc });
  room(m, 'atr_w', -672, -80, -640, 80, L1, 144, { ...C, ...S });
  room(m, 'atr_e', 640, -80, 672, 80, L1, 144, { ...C, ...S });
  door(m, 'atr_suite', -160, -672, -64, -640, L2, 112, { tex: T.floor });
  // the suite's windows over the atrium (sill 40 above L2)
  m.opening(-320, -672, -192, -640, L2 + 40, L2 + 128, ROCK, T.conc);
  m.opening(-32, -672, 48, -640, L2 + 40, L2 + 128, ROCK, T.conc);

  // ------------------------------------------------------------------ south: loading dock, security suite, ramp, yard
  room(m, 'dock', -704, -1472, 448, -672, L1, 352, { ...C });
  // the vehicle ramp up to the yard (west), its tunnel roof sloping with it
  m.R('ramp', -1728, -1472, -704, -1248, L1, SURF, 'w', { tex: T.asphalt, side: T.conc, wall: HILL - SURF });
  R.ramp = [-1728, -1472, -704, -1248, L1];
  // the surface yard (open sky) and the emergency stairwell down to the elevator lobby
  area(m, 'yard', -2304, -1984, -1728, -1216, SURF, { tex: T.asphalt, side: T.conc, wall: HILL - SURF });
  stair(m, 'estair', -2240, -1216, -2112, -576, L1, SURF, 's', 20, 176, { tex: T.cfloor, stepTex: T.haz, ceilTop: HILL, wall: HILL - L1, surface: null });
  room(m, 'stairhall', -2240, -576, -2048, -320, L1, 160, { ...F });
  // the yard's retaining walls: mass up to HILL with a visible top
  m.zone(-2560, -2560, -1664, -1152, { height: HILL, tex: T.conc, roof: T.conc });

  // ------------------------------------------------------------------ west: elevator, lab row, labs, pump room, decon
  room(m, 'lobby_s', -2304, -320, -1792, -80, L1, 256, { ...F });
  room(m, 'lobby_n', -2304, 80, -1792, 320, L1, 256, { ...F });
  room(m, 'lobby_m', -2304, -80, -1792, 80, L1, 256, { ...F, ...S });
  room(m, 'shaft', -2496, -192, -2304, 192, L0, 672, { ...C });
  room(m, 'labrow', -1792, -80, -672, 80, L1, 160, { ...F, ...S });
  area(m, 'wtunnel', -2304, -80, -320, 80, L0, { tex: T.cfloor, side: T.conc });
  room(m, 'wbranch', -1728, -896, -1600, -80, L0, 160, { ...C });
  room(m, 'pump', -1728, -1184, -1088, -896, L0, 320, { ...C });
  room(m, 'pump_top', -1088, -1024, -704, -896, L1, 128, { ...C });
  room(m, 'labb', -1472, -560, -832, -112, L1, 176, { ...F });
  room(m, 'laba', -1472, 112, -832, 560, L1, 176, { ...F });
  door(m, 'labb_d1', -1376, -112, -1280, -80, L1, 112, { tex: T.floor });
  door(m, 'labb_d2', -1024, -112, -928, -80, L1, 112, { tex: T.floor });
  door(m, 'laba_d1', -1376, 80, -1280, 112, L1, 112, { tex: T.floor });
  door(m, 'laba_d2', -1024, 80, -928, 112, L1, 112, { tex: T.floor });
  door(m, 'labb_atr', -832, -448, -640, -352, L1, 112, { tex: T.floor });
  door(m, 'laba_atr', -832, 352, -640, 448, L1, 112, { tex: T.floor });
  door(m, 'laba_decon', -1600, 400, -1472, 496, L1, 112, { tex: T.tile, wallTex: T.tile });
  // glass partitions from the lab row into the labs
  m.opening(-1248, 80, -1056, 112, L1 + 40, L1 + 136, ROCK, T.conc);
  m.opening(-1248, -112, -1056, -80, L1 + 40, L1 + 136, ROCK, T.conc);
  room(m, 'decon', -1760, 80, -1600, 1984, L1, 160, { ...F, tex: T.tile });
  room(m, 'decon_n', -1600, 1824, -640, 1984, L1, 160, { ...F, tex: T.tile });

  // ------------------------------------------------------------------ north: containment
  room(m, 'vault', -640, 1856, 640, 2176, L1, 288, { ...C });
  room(m, 'cellblock', -128, 672, 128, 1856, L1, 176, { ...C });
  room(m, 'wpass', -608, 672, -480, 1856, L1, 160, { ...C });
  room(m, 'epass', 480, 672, 608, 1856, L1, 160, { ...C });
  room(m, 'cross', -480, 1120, 480, 1248, L1, 160, { ...C });
  for (const [k, x0, x1, fx, back] of [['w', -448, -160, -160, -480], ['e', 160, 448, 128, 448]]) {
    for (const [r, y0, y1, yd, yw, yb] of [[1, 736, 1056, 1000, 768, 800], [2, 1312, 1632, 1368, 1456, 1568]]) {
      room(m, `cell_${k}${r}`, x0, y0, x1, y1, L1, 160, { ...F, tex: T.tile });
      door(m, `cell_${k}${r}_f`, fx, yd - 48, fx + 32, yd + 48, L1, 112, { tex: T.tile, wallTex: T.conc }); // the cell door
      m.opening(fx, yw, fx + 32, yw + 160, L1 + 40, L1 + 136, ROCK, T.conc); // its observation window
      door(m, `cell_${k}${r}_b`, back, yb - 48, back + 32, yb + 48, L1, 112, { tex: T.tile, wallTex: T.conc }); // the breach out the back
    }
  }

  // ------------------------------------------------------------------ the lower labs (L0, north-west)
  room(m, 'll_hall', -1408, 832, -960, 1504, L0, 192, { ...F });
  stair(m, 'll_stair_w', -1536, 1056, -1408, 1504, L0, L1, 'n', 12, 160);
  stair(m, 'll_stair_e', -960, 1056, -832, 1504, L0, L1, 'n', 12, 160);
  // the stairs' feet (a landing in front of each, so you walk onto the first step)
  room(m, 'll_foot_w', -1536, 960, -1408, 1056, L0, 192, { ...F });
  room(m, 'll_foot_e', -960, 960, -832, 1056, L0, 192, { ...F });
  room(m, 'll_land_w', -1600, 1504, -1408, 1696, L1, 160, { ...F, tex: T.tile });
  room(m, 'll_land_e', -960, 1504, -608, 1696, L1, 160, { ...C });

  // ------------------------------------------------------------------ east: corridor, server room, cafeteria, freight, vent sump
  room(m, 'ecorr', 672, -80, 1472, 80, L1, 160, { ...F, ...S });
  area(m, 'etunnel', 320, -80, 1472, 80, L0, { tex: T.cfloor, side: T.conc });
  room(m, 'sump', 1472, -224, 1728, 224, L0, 224, { ...C });
  room(m, 'server', 768, 144, 1408, 784, L1, 192, { ...F, ceilTex: T.metal });
  door(m, 'srv_s1', 896, 80, 1024, 144, L1, 112, { tex: T.floor });
  door(m, 'srv_s2', 1216, 80, 1344, 144, L1, 112, { tex: T.floor });
  door(m, 'srv_w', 608, 640, 768, 736, L1, 112, { tex: T.floor });
  room(m, 'cafe', 768, -784, 1408, -144, L1, 192, { ...F });
  door(m, 'cafe_n1', 896, -144, 1024, -80, L1, 112, { tex: T.floor });
  door(m, 'cafe_n2', 1216, -144, 1344, -80, L1, 112, { tex: T.floor });
  room(m, 'staff', 448, -784, 768, -688, L1, 128, { ...F });
  room(m, 'ksvc', 1280, -1248, 1408, -784, L1, 144, { ...F, tex: T.tile });
  room(m, 'freight', 448, -1472, 1536, -1248, L1, 192, { ...C });

  // ------------------------------------------------------------------ wall skins (lab panels in the fitted-out rooms)
  for (const k of ['labb', 'laba', 'server', 'cafe', 'staff', 'stairhall', 'lobby_s', 'lobby_n']) { const r = R[k]; skin(m, r[0], r[1], r[2], r[3], wallAt(r[4])); }
  skin(m, -1792, -80, -672, 80, wallAt(L1)); // lab row
  skin(m, 672, -80, 1472, 80, wallAt(L1)); // east corridor
  for (const k of ['decon', 'decon_n', 'll_land_w', 'ksvc', 'cell_w1', 'cell_w2', 'cell_e1', 'cell_e2']) { const r = R[k]; skin(m, r[0], r[1], r[2], r[3], T.tile); }
  skin(m, -1408, 832, -960, 1504, wallAt(L0)); // lower labs

  m.generate();

  // ------------------------------------------------------------------ structure on top of the floors
  // the cap over everything underground (hides the tops of the mass and the ceiling slabs)
  const cap = (x0, y0, x1, y1) => m.box(x0, y0, ROCK, x1, y1, ROCK + 16, { all: null }, { name: 'cap' });
  cap(-2560, -1152, 2560, 2560);
  cap(-1664, -2560, 2560, -1152);
  // the ramp tunnel's roof, sloping down with the ramp
  m.prism('y', [[-1728, SURF + 176], [-704, L1 + 176], [-704, HILL], [-1728, HILL]], -1472, -1248, { all: T.conc }, { name: 'ramp_roof' });

  // atrium galleries (L2, 96 wide), bridges to the tank ring, stair landings
  const deck = (x0, y0, x1, y1, z = L2) => m.box(x0, y0, z - 16, x1, y1, z, { all: T.metal, top: T.grate }, { name: 'deck', surface: 'metal' });
  deck(-640, 544, 640, 640);
  deck(-640, -640, 640, -544);
  deck(-640, -544, -544, 544);
  deck(544, -544, 640, 544);
  deck(-64, 192, 64, 544);
  deck(-64, -544, 64, -192);
  deck(-192, -192, 192, 192);
  deck(320, 224, 544, 352);
  deck(-544, -352, -320, -224);
  // into the pit
  m.stairs(-320, 192, 64, 320, L0, L1, 'w', 12, { top: T.grate, all: T.metal }, { surface: 'metal' });
  m.stairs(-64, -320, 320, -192, L0, L1, 'e', 12, { top: T.grate, all: T.metal }, { surface: 'metal' });

  // the security suite: a mezzanine over the north end of the dock (L2), glazed both ways
  m.box(-704, -1024, L2 - 16, 240, -672, L2, { all: T.wall, top: T.floor, bottom: T.ceil }, { name: 'suite_floor' });
  m.box(-704, -1024, 336, 240, -672, 352, { all: T.wall, bottom: T.ceil }, { name: 'suite_ceil' });
  // the pump room stair (L0 up to the passage into the dock)
  m.stairs(-1472, -1024, -1088, -896, L0, L1, 'e', 12, { top: T.grate, all: T.metal }, { surface: 'metal' });
  return m;
}
