// Blackwater Docks (zm_blackwater) - owned by its map builder.
// FRAMEWORK PLACEHOLDER: an overcast quay (concrete apron, a corrugated shed with doors,
// shipping containers, a timber pier) beside a harbour basin whose water is a hazard volume
// (fall in: back on the quay, a little hurt; zombies come back elsewhere), so the map loads,
// bakes and plays before the real design lands. Replace build() and the metadata with the
// real map; keep the exports.
import { AreaMap } from '../areagen.js';
import { room, container, lamp, barrel, fence, spawnGrid, navSeed, zone } from '../kit.js';

const WATER_Z = -40; // the water's surface (a visual brush); the basin floor is at -160

export const MAP = {
  id: 'zm_blackwater',
  title: 'Blackwater Docks',
  modes: ['zombies'],
  tagline: 'Nowhere left to run but the water',
  blurb: 'A container terminal under a low grey sky. Fog rolls off the harbour and the cranes stand silent.',
  mood: ['overcast', 'fog', 'industrial'],
  squad: { min: 1, best: 4, max: 11 },
  // flat, soft light: a weak diffuse sun under heavy cloud, a strong grey sky fill
  lighting: {
    sunDir: [0.321, 0.557, 0.766],
    sunColor: [0.3, 0.31, 0.33],
    skyColor: [0.42, 0.44, 0.48],
    ambientMin: [0.06, 0.065, 0.07],
    bounce: 0.5,
    voidColor: [0.12, 0.13, 0.13],
    lmEncoding: 'sqrt',
  },
  sky: { preset: 'overcast' },
  fog: { color: [0.42, 0.45, 0.48], near: 200, far: 2200 },
  grade: { saturate: 0.8 },
  ambience: { loop: 'amb_blackwater', volume: 0.45 },
  textures: 'blackwater',
  zones: [
    zone('The Pier', 'pier', 512, -256, 1024, 256, -50, 200),
    zone('The Shed', 'shed', -916, 284, -384, 916, -50, 300),
    zone('North Quay', 'north', -1024, 0, 512, 1024, -50, 200),
    zone('South Quay', 'south', -1024, -1024, 512, 0, -50, 200),
  ],
  fronts: [
    { id: 'north', name: 'NORTH QUAY', via: 'along the', zones: ['North Quay', 'The Shed'], mouth: [0, 200] },
    { id: 'pier', name: 'PIER', via: 'off the', zones: ['The Pier'], mouth: [520, 0] },
  ],
  squadStart: { pos: [-300, -800, 0], yaw: 90, radius: 200 },
  buyArea: { pos: [-300, -800, 0], radius: 300 },
  extraction: [{ id: 'boat', name: 'The Boat', pos: [960, 0, 0], radius: 200 }],
  objectives: [
    { id: 'hold_shed', name: 'Hold the shed', kind: 'hold', pos: [-650, 600, 0], radius: 220 },
    { id: 'supply_pier', name: 'Supply drop: the pier', kind: 'supply', pos: [800, 0, 0] },
  ],
  titleShots: [
    { eye: [-900, -400, 90], look: [400, 300, 40] },
    { eye: [300, -900, 80], look: [-250, 700, 40] },
  ],
  // the harbour basin: fall in and you're back on the quay (zombies: back at a spawn spot)
  hazards: [
    { id: 'harbour', kind: 'teleport', mins: [512, -1024, -400], maxs: [1024, 1024, WATER_Z + 8], damage: 10, to: [440, -400, 0], zombies: 'recycle' },
  ],
};

export function build() {
  const m = new AreaMap([-1280, -1280, 1280, 1280]);
  m.style = { ...m.style, ground: 'sidewalk', side: 'concrete_paint', step: 'concrete_paint', wall: 'brick_red', cap: null, roof: 'metal_rust', ceil: 'metal_corrugated' };
  m.A('quay', -1024, -1024, 512, 1024, 0, { wall: 288 });
  m.A('basin', 512, -1024, 1024, 1024, -160, { tex: 'dirt_dark', side: 'concrete_paint', wall: 448 });
  m.A('pier', 512, -256, 1024, 256, 0, { tex: 'wood_dark', side: 'wood_dark', wall: 288 });
  m.generate();
  // the water: a visual surface only (no collision; light passes) - the hazard does the rest
  m.box(512, -1024, WATER_Z - 4, 1024, 1024, WATER_Z, { all: null, top: 'water_murky' }, { contents: 0, castShadow: false, name: 'water' });
  // a low kerb along the quay edge (bollards in the real thing)
  fence(m, 508, -1024, 508, -256, 0, 12, 'metal_rust', 8);
  fence(m, 508, 256, 508, 1024, 0, 12, 'metal_rust', 8);

  room(m, -900, 300, -400, 900, 0, 192, {
    wallOut: 'metal_corrugated', wallIn: 'metal_corrugated', ceil: 'metal_corrugated', roof: 'metal_rust',
    gaps: { e: [{ c: 600, w: 128, z1: 144 }], s: [{ c: -650, w: 96 }] },
  });
  lamp(m, -650, 600, 188, { size: [48, 16], radius: 420 });
  lamp(m, -384, 600, 160, { face: 'e', size: [20, 12], color: [1.0, 0.85, 0.6], radius: 380 }); // over the big door
  container(m, -100, -300, 0, 'x', { tex: 'container_red' });
  container(m, -100, -200, 0, 'x', { tex: 'container_blue' });
  container(m, -100, -250, 102, 'x', { tex: 'bw_container_teal' });
  container(m, 200, 500, 0, 'y', { tex: 'container_green', open: 'end' });
  barrel(m, 300, -700, 0);
  barrel(m, 330, -730, 0);
  barrel(m, 296, -742, 0);

  spawnGrid(m, 'info_player_start', -300, -800, 0, 90, 4, 2);
  spawnGrid(m, 'info_player_deathmatch', -200, 800, 0, 270, 2, 1);
  navSeed(m, 800, 0, 0);
  navSeed(m, -650, 600, 0);
  return m;
}
