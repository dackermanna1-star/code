// Sector 9 (zm_sector9) - owned by its map builder.
// FRAMEWORK PLACEHOLDER: an underground lab hall (no sun, no sky: lit only by its ceiling
// panels), with partition walls and doorways, pillars and a raised control room up a ramp,
// so the map loads, bakes and plays before the real design lands. Replace build() and the
// metadata with the real map; keep the exports.
import { AreaMap } from '../areagen.js';
import { wall, lamp, pillar, glass, spawnGrid, navSeed, zone } from '../kit.js';

export const MAP = {
  id: 'zm_sector9',
  title: 'Sector 9',
  modes: ['zombies'],
  tagline: 'Containment has failed',
  blurb: 'A sealed research level under the hill. Flickering panels, long corridors, nowhere to see the sky.',
  mood: ['underground', 'lab', 'claustrophobic'],
  squad: { min: 1, best: 3, max: 8 },
  // no sun and no sky light: the ceiling panels and the bounce do everything
  lighting: {
    sunDir: [0.3, 0.2, 0.93], // (not baked: only steers the models' shading)
    sunColor: [0, 0, 0],
    skyColor: [0, 0, 0],
    ambientMin: [0.03, 0.032, 0.036],
    bounce: 0.6,
    voidColor: [0, 0, 0],
    lmEncoding: 'sqrt',
  },
  sky: { preset: 'none', color: [0.02, 0.022, 0.026] },
  fog: { color: [0.02, 0.022, 0.026], near: 700, far: 3200 },
  grade: null,
  ambience: { loop: 'amb_sector9', volume: 0.45 },
  textures: 'sector9',
  zones: [
    zone('Control Room', 'control', 384, 384, 1024, 1024, 40, 400),
    zone('West Labs', 'west', -1024, -1024, -320, 1024, -50, 200),
    zone('Main Hall', 'hall', -320, -1024, 1024, 1024, -50, 200),
  ],
  fronts: [
    { id: 'labs', name: 'WEST LABS', via: 'from the', zones: ['West Labs'], mouth: [-320, 0] },
    { id: 'control', name: 'CONTROL ROOM', via: 'down from the', zones: ['Control Room'], mouth: [640, 300] },
  ],
  squadStart: { pos: [400, -800, 0], yaw: 90, radius: 200 },
  buyArea: { pos: [400, -800, 0], radius: 300 },
  extraction: [{ id: 'lift', name: 'Freight Lift', pos: [-800, 800, 0], radius: 200 }],
  objectives: [
    { id: 'reactor', name: 'Defend the generator', kind: 'defend', pos: [300, 100, 0], radius: 180 },
    { id: 'hold_control', name: 'Hold the control room', kind: 'hold', pos: [700, 700, 64], radius: 220 },
  ],
  titleShots: [
    { eye: [800, -900, 80], look: [700, 300, 40] },
    { eye: [-900, -900, 70], look: [-700, -200, 40] },
  ],
  hazards: [],
};

export function build() {
  const m = new AreaMap([-1280, -1280, 1280, 1280]);
  m.style = { ...m.style, ground: 'tile_white', side: 'concrete_paint', step: 'metal_diamond', wall: 'lab_panel', cap: null, roof: 'concrete_paint', ceil: 'ceiling_tile' };
  const CEIL = { ceil: 192, ceilTop: 224, wall: 224 };
  m.A('hall', -1024, -1024, 1024, 1024, 0, { ...CEIL });
  m.A('control', 384, 384, 1024, 1024, 64, { tex: 'metal_diamond', ...CEIL });
  m.R('control_ramp', 512, 128, 768, 384, 0, 64, 'n', { tex: 'metal_diamond', ...CEIL });
  m.generate();

  // the west labs: a partition wall with two doorways and a glazed observation window
  wall(m, 'y', -1024, 1024, -336, -320, 0, 192, { all: 's9_panel_dark' }, [{ c: -600, w: 96 }, { c: 500, w: 96 }, { c: 0, w: 192, z0: 56, z1: 136 }]);
  glass(m, -332, -96, 56, -324, 96, 136);
  wall(m, 'x', -1024, -336, -16, 0, 0, 192, { all: 's9_panel_dark' }, [{ c: -680, w: 96 }]);
  for (const [x, y] of [[0, -512], [0, 512], [512, -512], [-640, -560]]) pillar(m, x, y, 0, 192, 48, 'concrete_paint');
  // ceiling panels every 384 units (a cool white), dimmer in the labs
  for (let x = -832; x <= 832; x += 384) for (let y = -832; y <= 832; y += 384) {
    lamp(m, x, y, 188, { size: [48, 24], color: x < -320 ? [0.7, 0.85, 1.0] : [0.92, 0.97, 1.0], intensity: x < -320 ? 0.6 : 0.85, radius: 420 });
  }
  for (const [x, y, s] of [[200, -300, 64], [-700, 300, 64], [700, -200, 64]]) m.crate(x, y, 0, s, s, s, 'crate_green');

  spawnGrid(m, 'info_player_start', 400, -800, 0, 90, 4, 2);
  spawnGrid(m, 'info_player_deathmatch', -700, 700, 0, 0, 2, 1);
  navSeed(m, 700, 700, 64);
  return m;
}
