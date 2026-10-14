// de_dust2 as a built-in map module. The geometry is src/map/dust2.js (unchanged: its
// lightmap hash 61e36e23 must stay), its callouts and bot routes live in bots.js (ZONES,
// MAPDATA) and its horde fronts in director.js (ZOMBIE_FRONTS). The rest is data for the
// zombie survival features to come (extraction finale, objective waves).
import { buildDust2 } from '../dust2.js';
import { DUST2_LIGHTING } from '../lighting.js';

export const MAP = {
  id: 'de_dust2',
  title: 'de_dust2',
  mode: 'bomb',
  modes: ['classic', 'zombies'],
  bots: 'mapdata', // hand-made bot knowledge (bots.js MAPDATA); every other map derives its own
  tagline: 'The classic, overrun',
  blurb: 'Sun-baked courtyards, tunnels and long sightlines. Hold the CT ramp while the dead pour in from both sites.',
  mood: ['desert', 'day', 'open'],
  squad: { min: 1, best: 4, max: 11 },
  lighting: DUST2_LIGHTING, // (exactly this object: it is part of the lightmap hash)
  sky: { preset: 'dust' },
  fog: null,
  grade: null,
  ambience: { loop: 'ambience_wind', volume: 0.35 },
  textures: 'dust',
  zones: null, // bots.js ZONES
  fronts: null, // director.js ZOMBIE_FRONTS.de_dust2
  squadStart: { pos: [256, 2290, -128], yaw: 180, radius: 320 },
  buyArea: { pos: [256, 2290, -128], radius: 400 },
  extraction: [
    { id: 'a_site', name: 'A Site', pos: [1150, 2560, 96], radius: 260 },
    { id: 't_spawn', name: 'T Spawn', pos: [-1500, -720, 128], radius: 320 },
    { id: 'b_site', name: 'B Site', pos: [-1550, 2650, 0], radius: 280 },
  ],
  objectives: [
    { id: 'hold_b', name: 'Hold B Site', kind: 'hold', pos: [-1550, 2650, 0], radius: 300 },
    { id: 'hold_a', name: 'Hold A Site', kind: 'hold', pos: [1150, 2560, 96], radius: 300 },
    { id: 'supply_mid', name: 'Supply drop: Mid', kind: 'supply', pos: [-390, 1450, -128] },
    { id: 'supply_long', name: 'Supply drop: Long A', kind: 'supply', pos: [1400, 1600, 0] },
    { id: 'gen_ct', name: 'Generator at CT Spawn', kind: 'defend', pos: [-120, 2240, -128], radius: 200 },
    { id: 'escort_tun', name: 'Escort through the tunnels', kind: 'escort', pos: [-1700, 300, 0], to: [-1985, 2400, 0] },
  ],
  titleShots: [], // none: titlescene.js picks shots from the nav graph
  thumbShot: { eye: [-430, 380, 70], look: [-390, 1500, -60] }, // (tools/thumb.mjs: down mid toward the doors)
  hazards: [],
};

export function build() {
  return buildDust2();
}
