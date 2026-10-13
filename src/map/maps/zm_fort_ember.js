// Fort Ember (zm_fort_ember) - owned by its map builder.
// FRAMEWORK PLACEHOLDER: a walled timber yard at sunset (a raised fire-step with stairs, a hut
// with a door and a window, torches, crates) so the map loads, bakes and plays before the real
// design lands. Replace build() and the metadata with the real map; keep the exports.
import { AreaMap } from '../areagen.js';
import { room, barrel, pillar, spawnGrid, navSeed, zone } from '../kit.js';

export const MAP = {
  id: 'zm_fort_ember',
  title: 'Fort Ember',
  modes: ['zombies'],
  tagline: 'Hold the burning fort till dark',
  blurb: 'A frontier stockade at sundown. Embers drift over the palisade as the dead come up the hill.',
  mood: ['sunset', 'fire', 'open'],
  squad: { min: 1, best: 4, max: 11 },
  // a low sun in the west-south-west: long warm shadows, violet sky fill
  lighting: {
    sunDir: [-0.945, -0.253, 0.208],
    sunColor: [1.05, 0.62, 0.32],
    skyColor: [0.2, 0.17, 0.24],
    ambientMin: [0.05, 0.04, 0.045],
    bounce: 0.5,
    voidColor: [0.2, 0.15, 0.12],
    lmEncoding: 'sqrt',
  },
  sky: { preset: 'sunset' },
  fog: { color: [0.55, 0.36, 0.3], near: 900, far: 4200 },
  grade: { saturate: 1.1, contrast: 1.04 },
  ambience: { loop: 'amb_fort_ember', volume: 0.4 },
  textures: 'fortember',
  zones: [
    zone('The Fire-Step', 'deck', 384, 256, 1024, 1024, 40, 400),
    zone('The Hut', 'hut', -776, 344, -424, 696, -50, 200),
    zone('North Yard', 'north', -1024, 200, 1024, 1024, -50, 200),
    zone('South Yard', 'south', -1024, -1024, 1024, 200, -50, 200),
  ],
  fronts: [
    { id: 'north', name: 'NORTH YARD', via: 'from the', zones: ['North Yard'], mouth: [0, 300] },
    { id: 'deck', name: 'FIRE-STEP', via: 'over the', zones: ['The Fire-Step'], mouth: [640, 300] },
  ],
  squadStart: { pos: [0, -800, 0], yaw: 90, radius: 200 },
  buyArea: { pos: [0, -800, 0], radius: 300 },
  extraction: [{ id: 'gate', name: 'The Gate', pos: [0, 900, 0], radius: 220 }],
  objectives: [
    { id: 'hold_hut', name: 'Hold the hut', kind: 'hold', pos: [-600, 520, 0], radius: 180 },
    { id: 'supply_deck', name: 'Supply drop: the fire-step', kind: 'supply', pos: [700, 700, 96] },
    { id: 'signal', name: 'Defend the signal fire', kind: 'defend', pos: [0, 0, 0], radius: 160 },
  ],
  titleShots: [
    { eye: [-900, -900, 80], look: [300, 600, 40] },
    { eye: [900, -900, 80], look: [-400, 300, 40] },
  ],
  hazards: [],
};

export function build() {
  const m = new AreaMap([-1280, -1280, 1280, 1280]);
  m.style = { ...m.style, ground: 'dirt_dark', side: 'fe_palisade', step: 'wood_dark', wall: 'fe_palisade', cap: null, roof: 'fe_palisade', ceil: 'wood_dark' };
  m.A('yard', -1024, -1024, 1024, 1024, 0, { wall: 224 });
  m.A('deck', 384, 384, 1024, 1024, 96, { tex: 'wood_dark', wall: 128 });
  m.S('deck_steps', 512, 256, 768, 384, 0, 96, 'n', 6, { tex: 'wood_dark' });
  m.generate();

  room(m, -760, 360, -440, 680, 0, 128, {
    wall: 'fe_palisade', ceil: 'wood_dark', roof: 'wood_dark',
    gaps: { s: [{ c: -600, w: 64 }], e: [{ c: 520, w: 48, z0: 48, z1: 96 }] },
  });
  for (const [x, y, s] of [[-300, -200, 64], [-236, -200, 64], [300, 120, 64], [-860, -500, 64], [860, -300, 32]]) m.crate(x, y, 0, s);
  barrel(m, 200, -420, 0);
  barrel(m, 228, -450, 0);
  // torches: poles with a warm point light at the top
  for (const [x, y] of [[-500, -500], [500, -500], [-500, 200], [200, 200], [0, 900]]) {
    pillar(m, x, y, 0, 96, 8, 'wood_dark');
    m.light(x, y, 112, [1.0, 0.55, 0.22], 0.9, 420);
  }
  m.light(-600, 520, 112, [1.0, 0.7, 0.4], 0.7, 300); // the hut's lantern

  spawnGrid(m, 'info_player_start', 0, -800, 0, 90, 4, 2);
  spawnGrid(m, 'info_player_deathmatch', 0, 760, 0, 270, 2, 1);
  navSeed(m, 700, 700, 96);
  navSeed(m, -600, 520, 0);
  return m;
}
