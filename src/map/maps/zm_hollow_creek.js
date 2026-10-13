// Hollow Creek (zm_hollow_creek) - owned by its map builder.
// FRAMEWORK PLACEHOLDER: a night-time block in a small town (a road with lane markings and
// kerbs, a clapboard house with a pitched roof, a porch and glass windows, street lights)
// so the map loads, bakes and plays before the real design lands. Replace build() and the
// metadata with the real map; keep the exports.
import { AreaMap } from '../areagen.js';
import { room, gableRoof, glass, lamp, streetLight, fence, spawnGrid, navSeed, zone } from '../kit.js';

export const MAP = {
  id: 'zm_hollow_creek',
  title: 'Hollow Creek',
  modes: ['zombies'],
  tagline: 'Small town. Long night.',
  blurb: 'Main street after curfew: porch lights, sodium lamps and a lot of dark between them.',
  mood: ['night', 'town', 'tense'],
  squad: { min: 1, best: 4, max: 11 },
  // moonlight from the north-west, a dark blue sky, warm street lights doing the real work
  lighting: {
    sunDir: [-0.383, 0.663, 0.643],
    sunColor: [0.12, 0.15, 0.24],
    skyColor: [0.035, 0.045, 0.075],
    ambientMin: [0.018, 0.02, 0.03],
    bounce: 0.45,
    voidColor: [0.02, 0.025, 0.02],
    lmEncoding: 'sqrt',
  },
  sky: { preset: 'night' },
  fog: { color: [0.05, 0.06, 0.09], near: 300, far: 2600 },
  grade: { saturate: 0.85, contrast: 1.08 },
  ambience: { loop: 'amb_hollow_creek', volume: 0.45 },
  textures: 'hollowcreek',
  zones: [
    zone('The House', 'house', -760, 328, -264, 760, -50, 300),
    zone('Main Street', 'street', -1024, -40, 1024, 300, -50, 200),
    zone('North Lots', 'north', -1024, 300, 1024, 1024, -50, 200),
    zone('South Lots', 'south', -1024, -1024, 1024, -40, -50, 200),
  ],
  fronts: [
    { id: 'north', name: 'NORTH LOTS', via: 'from the', zones: ['North Lots'], mouth: [0, 360] },
    { id: 'street', name: 'MAIN STREET', via: 'down', zones: ['Main Street'], mouth: [600, 128] },
  ],
  squadStart: { pos: [0, -760, 0], yaw: 90, radius: 200 },
  buyArea: { pos: [0, -760, 0], radius: 300 },
  extraction: [{ id: 'crossroads', name: 'The Crossroads', pos: [800, 128, 0], radius: 240 }],
  objectives: [
    { id: 'hold_house', name: 'Hold the house', kind: 'hold', pos: [-512, 544, 0], radius: 200 },
    { id: 'supply_street', name: 'Supply drop: Main Street', kind: 'supply', pos: [-300, 128, 0] },
  ],
  titleShots: [
    { eye: [-900, 40, 90], look: [700, 200, 40] },
    { eye: [700, -800, 90], look: [-200, 500, 40] },
  ],
  hazards: [],
};

export function build() {
  const m = new AreaMap([-1280, -1280, 1280, 1280]);
  m.style = { ...m.style, ground: 'grass', side: 'sidewalk', step: 'sidewalk', wall: 'brick_red', cap: null, roof: 'roof_shingle', ceil: 'ceiling_tile' };
  m.A('lots', -1024, -1024, 1024, 1024, 0, { wall: 256 });
  // Main Street runs east-west (lane marking rotated to follow it), kerbs 8 up either side
  m.A('road', -1024, 0, 1024, 256, 0, { tex: { name: 'asphalt_lane', rot: 90 } });
  m.A('walk_s', -1024, -64, 1024, 0, 8, { tex: 'sidewalk' });
  m.A('walk_n', -1024, 256, 1024, 320, 8, { tex: 'sidewalk' });
  m.A('house_floor', -744, 344, -280, 744, 8, { tex: 'wood_dark' }); // one step up from the lot
  m.generate();

  // the house: clapboard walls, a door and two glazed windows on the street side, a pitched roof
  room(m, -744, 344, -280, 744, 0, 136, {
    wallOut: 'hc_siding_blue', wallIn: 'siding_paint', ceil: 'ceiling_tile', roof: 'roof_shingle',
    gaps: { s: [{ c: -512, w: 64 }, { c: -640, w: 64, z0: 48, z1: 104 }, { c: -384, w: 64, z0: 48, z1: 104 }] },
  });
  glass(m, -672, 334, 48, -608, 338, 104);
  glass(m, -416, 334, 48, -352, 338, 104);
  gableRoof(m, -760, 328, -264, 760, 152, 96, 'x', 'roof_shingle', { gable: 'hc_siding_blue', eave: 16 });
  lamp(m, -512, 328, 120, { face: 's', size: [16, 16], color: [1, 0.8, 0.5], intensity: 0.8, radius: 320 }); // porch light
  lamp(m, -512, 544, 132, { size: [32, 16], radius: 360 }); // inside, under the ceiling at 136
  // a picket line along the north lots and a few street lights on both kerbs
  fence(m, 0, 560, 900, 560, 0, 40, 'siding_paint', 4);
  for (let x = -896; x <= 896; x += 384) {
    streetLight(m, x, -40, 8, 224, 'n', 40, { color: [1.0, 0.7, 0.38] });
    streetLight(m, x + 192, 296, 8, 224, 's', 40, { color: [1.0, 0.7, 0.38] });
  }
  for (const [x, y, s] of [[300, -600, 64], [364, -600, 32], [700, 700, 64], [-200, 800, 32]]) m.crate(x, y, 0, s);

  spawnGrid(m, 'info_player_start', 0, -760, 0, 90, 4, 2);
  spawnGrid(m, 'info_player_deathmatch', 400, 800, 0, 270, 2, 1);
  navSeed(m, -512, 544, 8);
  return m;
}
