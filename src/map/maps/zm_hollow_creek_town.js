// Hollow Creek (zm_hollow_creek): the ground plan - streets, sidewalks, lots, the creek, the
// church plinth, the cemetery hill, the rail yard, the highway - as AreaMap areas, then the
// auto mass (the wooded hills around the town, the school's wings, the garage rows).
// Buildings and detail: zm_hollow_creek_build.js.
import { placeAreas, buildPlaces } from './zm_hollow_creek_build.js';
import { lane, CREEK, DECK_Z, EAST, CEM } from './zm_hollow_creek_parts.js';

export function buildTown(m) {
  m.style = { ...m.style, ground: 'grass', side: 'concrete_paint', step: 'concrete_paint', wall: 'hc_stone', cap: null, roof: 'grass', ceil: 'concrete_paint', slabBottom: 'wood_dark' };
  const W = 'sidewalk', G = 'grass', D = 'dirt_dark', C = CREEK, E = EAST;
  const kerb = { tex: W, side: 'concrete_paint' };

  // ------------------------------------------------------------ streets (z 0)
  m.A('main', C.x1, -112, E, 112, 0, { tex: lane('x', 0) });
  m.A('mill', -1440, -1344, -1248, 1632, 0, { tex: lane('y', -1344) });
  m.A('church_st', -1248, 832, 960, 1024, 0, { tex: lane('x', 928) });
  m.A('school_st', 960, -112, 1152, 1216, 0, { tex: lane('y', 1056) });
  m.A('pine_st', 320, -1344, 480, -112, 0, { tex: lane('y', 400) });
  m.A('alley', -1248, -960, 1152, -832, 0, { tex: lane('x', -640) });
  m.A('oak', -1248, -1344, 320, -1152, 0, { tex: lane('x', -1248) });
  m.A('trail_foot', 320, -1344, 672, -1152, 0, { tex: D });

  // ------------------------------------------------------------ sidewalks (z 8)
  m.A('main_n_w', -1248, 112, 960, 208, 8, kerb);
  m.A('main_n_e', 1152, 112, 1728, 208, 8, kerb);
  m.A('main_s_w', -1248, -208, 320, -112, 8, kerb);
  m.A('main_s_e', 480, -208, 1728, -112, 8, kerb);
  m.A('mill_e_1', -1248, -832, -1152, -208, 8, kerb);
  m.A('mill_e_2', -1248, 208, -1152, 832, 8, kerb);
  m.A('mill_e_3', -1248, 1024, -1152, 1536, 8, kerb);
  m.A('mill_e_0', -1248, -1152, -1152, -960, 8, kerb);
  m.A('church_st_s', -1152, 768, 960, 832, 8, kerb);
  m.A('church_st_n', -1152, 1024, 960, 1088, 8, kerb);
  m.A('school_st_e', 1152, 208, 1216, 1216, 8, kerb);
  m.A('oak_s', -1248, -1408, 320, -1344, 8, kerb);
  m.A('oak_n', -1248, -1152, 320, -1088, 8, kerb);
  m.A('oak_s_end', 320, -1408, 480, -1344, 8, kerb);

  // ------------------------------------------------------------ blocks
  // south of Main: the diner / hardware / pharmacy block and its back yards (paved)
  m.A('block_s1', -1152, -832, 320, -208, 8, { tex: W });
  // the gas station forecourt (concrete, at street level) and the truck stop by the off-ramp
  m.A('gas', 480, -832, 1152, -208, 0, { tex: W });
  m.A('truck_lot', 1152, -576, 1728, -208, 0, { tex: W });
  // north of Main: the bank / post office block, the square, the police block
  m.A('block_n1', -1152, 208, -448, 768, 8, { tex: W });
  m.A('square', -448, 208, 448, 768, 8, { tex: W });
  m.A('block_police', 448, 208, 960, 768, 8, { tex: W });
  // the schoolyard (asphalt play area) inside its fence
  m.A('schoolyard', 1216, 208, 1728, 960, 0, { tex: lane('x', 1600) });
  // Oak Lane's front gardens (the houses stand at their backs)
  m.A('oak_lots', -1248, -1632, 480, -1408, 8, { tex: G });
  // Elm Lane: two houses on Church Street's north side
  m.A('elm_lots', -1152, 1088, -288, 1536, 8, { tex: G });
  // the church on its plinth, the front steps, the field beside it
  m.S('church_steps', -128, 1088, 128, 1120, 8, 32, 'n', 2, { tex: 'hc_stone', stepTex: 'hc_stone' });
  m.A('church_plinth', -288, 1120, 288, 1536, 32, { tex: 'hc_stone', side: 'hc_stone' });
  m.A('church_lawn_w', -288, 1088, -128, 1120, 8, { tex: G });
  m.A('church_lawn_e', 128, 1088, 288, 1120, 8, { tex: G });
  m.A('field', 288, 1088, 960, 1536, 8, { tex: G });
  // the cemetery: a hill rising north from 8 to about 51
  m.Q('cemetery', -1248, CEM.y0, 960, CEM.y1, [8 - CEM.y0 / 6, 0, 1 / 6], { tex: G, side: 'hc_stone' });
  // the rail yard, its loading platform before the depot (auto mass behind)
  m.A('rail_yard', 960, 1216, 1856, 1792, 0, { tex: D });

  // ------------------------------------------------------------ the west: creek, bridge, woods road
  m.A('creek_bed', C.bed0, C.y0, C.bed1, C.y1, C.z, { tex: D, side: 'hc_stone' });
  m.A('creek_under', C.x0, -128, C.x1, 128, C.z, { tex: D, side: 'hc_stone' }); // under the bridge
  // the covered bridge's deck: a floating slab carrying Main Street over the bed
  m.A('bridge', C.x0, -128, C.x1, 128, 0, { tex: 'wood_dark', slab: true, slabDepth: 16, side: 'wood_dark' });
  // bank strips with ramps down to the bed (east bank: z 8, Mill Road's verge; west: z 0)
  const bank = (side, x0, x1, z, ya, yb, list) => {
    let y = ya;
    for (const [r0, r1, dir] of list.filter((r) => r[0] >= ya && r[1] <= yb).sort((p, q) => p[0] - q[0])) {
      if (r0 > y) m.A(`bank_${side}`, x0, y, x1, r0, z, { tex: G, side: 'hc_stone' });
      m.R(`ramp_${side}`, x0, r0, x1, r1, C.z, z, dir, { tex: D, side: 'hc_stone' }); // dir: the end that rises
      y = r1;
    }
    if (yb > y) m.A(`bank_${side}`, x0, y, x1, yb, z, { tex: G, side: 'hc_stone' });
  };
  bank('e', C.bed1, C.x1, 8, C.y0, -128, C.rampsE);
  bank('e', C.bed1, C.x1, 8, 128, C.y1, C.rampsE);
  for (const [r0, r1, dir] of C.rampsW) m.R('ramp_w', C.bed0, r0, C.bed0 + 64, r1, C.z, 0, dir, { tex: D, side: 'hc_stone' });
  // west of the creek: the woods road north to the old north road over the culvert
  m.A('woods_road', -1856, -128, C.x0, 1472, 0, { tex: D, side: 'hc_stone' });
  m.A('north_road', -1856, 1472, -1248, 1632, 0, { tex: D, side: 'hc_stone' });

  // ------------------------------------------------------------ the south-east: off-ramp, highway, embankment trail
  m.A('ramp_foot', 1728, -416, E, -112, 0, { tex: lane('y', 1856) });
  m.R('offramp', 1728, -1664, E, -416, 0, DECK_Z, 's', { tex: lane('y', 1856), side: 'concrete_paint' });
  m.A('highway', 480, -1856, E, -1664, DECK_Z, { tex: lane('x', -1760), side: 'concrete_paint' });
  m.R('trail', 480, -1664, 672, -1344, 0, DECK_Z, 's', { tex: D, side: 'hc_stone' });

  // the hills round the town: low rock and earth banks under the trees (144 over the floor beside
  // them: out of reach, clipped, and low enough that the pines on top stand against the sky)
  m.zone(-2400, -2200, 2400, 2200, { tex: 'hc_stone', capTex: null, roof: 'grass', extra: -80 });
  // (zone extras add up: the woods' banks end up 112 over the road)
  m.zone(-2400, -200, C.x0 - 160, 2200, { tex: 'dirt_dark', capTex: null, roof: 'grass', extra: -32 });
  m.zone(-1856, C.y1 + 160, -1440, 2200, { tex: 'dirt_dark', capTex: null, roof: 'grass', extra: -32 });
  // the school's two brick wings (east of the yard; between it and the rails)
  m.zone(1728, 112, 2400, 1216, { tex: 'brick_red', capTex: null, roof: 'concrete_paint' });
  m.zone(1216, 960, 1728, 1216, { tex: 'brick_red', capTex: null, roof: 'concrete_paint' });
  // the garage row between the alley and Oak Lane, the warehouse behind the truck stop, the depot
  m.zone(-1152, -1088, 320, -960, { height: 136, tex: 'wood_dark', capTex: null, roof: 'roof_shingle' });
  m.zone(1152, -960, 1728, -576, { height: 208, tex: 'brick_red', capTex: null, roof: 'concrete_paint' });
  m.zone(1088, 1792, 1856, 2100, { height: 200, tex: 'wood_dark', capTex: null, roof: 'roof_shingle' });
  // the highway's embankment: a low wall south of the deck, a lower bank north of it (grassed:
  // the view from the deck runs out over the town)
  m.zone(480, -2100, 2200, -1856, { height: DECK_Z + 64, tex: 'concrete_paint', capTex: null, roof: 'grass' });
  m.zone(672, -1664, 1728, -960, { height: 168, tex: 'hc_stone', capTex: null, roof: 'grass' });
  placeAreas(m);
  m.generate();
  buildPlaces(m);
}
