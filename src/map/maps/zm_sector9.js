// Sector 9 (zm_sector9): an underground research facility where it started. An original design
// for zombie survival: the surface yard (a fenced compound under an overcast night) and the
// vehicle ramp down into the loading dock; the security suite over the dock looking into the
// atrium - two storeys round the containment pit and its glowing specimen tank (the landmark,
// seen down every axis), galleries and bridges; the labs, the decontamination corridor and the
// cargo elevator to the west; the containment wing to the north; the server room, cafeteria
// and freight tunnel to the east; service tunnels, the pump room and the lower labs below.
// Layout: zm_sector9_layout.js (block-out), zm_sector9_dress.js (dressing and light),
// zm_sector9_parts.js (props). Textures: src/assets/tex/sector9.js. Ambience: snd/amb_sector9.js.
import { AreaMap } from '../areagen.js';
import { spawnGrid, navSeed, zone } from '../kit.js';
import { layout, T, L0, L1, SURF } from './zm_sector9_layout.js';
import { dress } from './zm_sector9_dress.js';

const Z0 = [-260, -60], Z1 = [-60, 150], Z2 = [150, 300], ANY = [-260, 700];

export const MAP = {
  id: 'zm_sector9',
  title: 'Sector 9',
  modes: ['zombies'],
  tagline: 'Containment has failed',
  blurb: 'A sealed research level under the hill. The specimen tank still glows in the atrium; the red lights are on in the cell block, and something is coming up from below.',
  mood: ['underground', 'lab', 'claustrophobic'],
  squad: { min: 1, best: 4, max: 8 },
  // no daylight underground: fluorescent tubes, red emergency lamps and the tank's green glow do
  // the work (point lights by the hundred); a faint moon and sky fill only reach the surface yard
  lighting: {
    sunDir: [-0.42, 0.38, 0.82],
    sunColor: [0.07, 0.08, 0.11],
    skyColor: [0.06, 0.066, 0.085],
    ambientMin: [0.036, 0.038, 0.044],
    bounce: 0.6,
    voidColor: [0, 0, 0],
    lmEncoding: 'sqrt',
  },
  // the yard's sky: an overcast night (heavy cloud, a few stars, a treeline on the hill)
  sky: { preset: 'night', stars: 0.15, clouds: { cover: 0.8, opacity: 0.85, scale: 1, height: 5, layers: 2 }, ridge: { kind: 'trees', height: 0.05, rough: 1 } },
  fog: { color: [0.02, 0.024, 0.03], near: 800, far: 3400 },
  grade: { contrast: 1.06, saturate: 0.92 },
  ambience: { loop: 'amb_sector9', volume: 0.42 },
  textures: 'sector9',
  // callouts: high and small boxes first (first match wins)
  zones: [
    zone('Tank Ring', 'tank', -200, -200, 200, 200, ...Z2),
    zone('Catwalks', 'catwalk', -640, -640, 640, 640, ...Z2),
    zone('Security', 'security', -704, -1040, 256, -672, ...Z2),
    zone('The Pit', 'pit', -336, -336, 336, 336, ...Z0),
    zone('Atrium', 'atrium', -672, -672, 672, 672, ...Z1),
    zone('Elevator Shaft', 'shaft', -2496, -192, -2304, 192, -260, 600),
    zone('West Tunnel', 'wtunnel', -2304, -80, -320, 80, ...Z0),
    zone('East Tunnel', 'etunnel', 320, -80, 1472, 80, ...Z0),
    zone('Vent Sump', 'sump', 1472, -224, 1728, 224, ...Z0),
    zone('Pump Tunnel', 'branch', -1728, -896, -1600, -80, ...Z0),
    zone('Pump Room', 'pump', -1728, -1184, -704, -896, ...ANY),
    zone('Lower Labs', 'lower', -1600, 832, -608, 1696, ...ANY),
    zone('Loading Dock', 'dock', -704, -1472, 448, -672, ...ANY),
    zone('Freight Tunnel', 'freight', 448, -1472, 1536, -1248, ...ANY),
    zone('Kitchen', 'kitchen', 1240, -1248, 1408, -144, ...ANY),
    zone('Cafeteria', 'cafe', 448, -800, 1240, -144, ...ANY),
    zone('East Hall', 'ecorr', 672, -144, 1472, 144, ...ANY),
    zone('Server Room', 'server', 608, 144, 1408, 800, ...ANY),
    zone('Vehicle Ramp', 'ramp', -1744, -1472, -704, -1248, ...ANY),
    zone('Surface Yard', 'yard', -2304, -1984, -1728, -1216, 200, 700),
    zone('Stairwell', 'stairs', -2240, -1216, -2048, -320, ...ANY),
    zone('Cargo Elevator', 'elevator', -2304, -320, -1792, 320, ...ANY),
    zone('Lab Row', 'labrow', -1792, -80, -672, 80, ...ANY),
    zone('Lab A', 'laba', -1472, 80, -640, 560, ...ANY),
    zone('Lab B', 'labb', -1472, -560, -640, -80, ...ANY),
    zone('Decon', 'decon', -1760, 80, -1472, 1984, ...ANY),
    zone('Decon', 'decon', -1600, 1792, -640, 1984, ...ANY),
    zone('West Passage', 'wpass', -608, 672, -480, 1856, ...ANY),
    zone('East Passage', 'epass', 480, 672, 768, 1856, ...ANY),
    zone('Cell Block', 'cells', -480, 672, 480, 1856, ...ANY),
    zone('Specimen Vault', 'vault', -640, 1856, 640, 2176, ...ANY),
  ],
  // where the horde comes from: the edges of the level, each with its mouth into the play space
  fronts: [
    { id: 'containment', name: 'CONTAINMENT', via: 'out of', zones: ['Specimen Vault', 'Cell Block'], mouth: [0, 700] },
    { id: 'lowerlabs', name: 'LOWER LABS', via: 'up from the', zones: ['Lower Labs'], mouth: [-608, 1600] },
    { id: 'tunnels', name: 'MAINTENANCE TUNNELS', via: 'through the', zones: ['Pump Room', 'Pump Tunnel', 'West Tunnel', 'Elevator Shaft'], mouth: [-340, 0] },
    { id: 'ramp', name: 'SURFACE RAMP', via: 'down the', zones: ['Surface Yard', 'Vehicle Ramp', 'Stairwell'], mouth: [-704, -1360] },
    { id: 'freight', name: 'FREIGHT TUNNEL', via: 'from the', zones: ['Freight Tunnel'], mouth: [448, -1360] },
    { id: 'vents', name: 'VENTS', via: 'out of the', zones: ['Vent Sump', 'East Tunnel'], mouth: [340, 0] },
  ],
  squadStart: { pos: [0, -576, L1], yaw: 90, radius: 200 },
  buyArea: { pos: [0, -576, L1], radius: 300 },
  extraction: [
    { id: 'helipad', name: 'Helipad', pos: [-2016, -1776, SURF + 4], radius: 240 },
    { id: 'elevator', name: 'Cargo Elevator', pos: [-2048, 0, L1], radius: 220 },
  ],
  objectives: [
    { id: 'power', name: 'Restore power at the breaker panel', kind: 'hold', pos: [-1160, -1100, L0], radius: 180 },
    { id: 'upload', name: 'Upload the research data', kind: 'defend', pos: [860, 640, L1], radius: 200 },
    { id: 'lockdown', name: 'Throw the containment lockdown', kind: 'hold', pos: [0, 2000, L1], radius: 220 },
    { id: 'supply_dock', name: 'Supply drop: the loading dock', kind: 'supply', pos: [-200, -1180, L1] },
    { id: 'escort_core', name: 'Get the data core to the elevator', kind: 'escort', pos: [860, 640, L1], to: [-2048, 0, L1] },
  ],
  titleShots: [
    { eye: [-560, 560, 260], look: [-200, 200, 192] },
    { eye: [0, 1800, 64], look: [0, 760, 40] },
    { eye: [300, -1420, 120], look: [-200, -800, 150] },
    { eye: [-1760, -1830, 450], look: [-2150, -1600, 324] },
  ],
  thumbShot: { eye: [-560, 560, 260], look: [0, 0, 80] },
  hazards: [],
};

export function build() {
  const m = new AreaMap([-2560, -2560, 2560, 2560]);
  m.style = { ...m.style, ground: T.floor, side: T.conc, step: T.metal, wall: T.conc, cap: null, roof: null, ceil: T.ceil, slabBottom: T.conc };
  layout(m);
  dress(m);
  // the squad starts in the atrium under the south gallery, the security suite right above
  spawnGrid(m, 'info_player_start', 0, -576, L1, 90, 4, 2, 64);
  // nav seeds in each wing (the flood fill reaches them all from the squad anyway)
  spawnGrid(m, 'info_player_deathmatch', -2080, -1900, SURF + 4, 0, 2, 1, 64);
  spawnGrid(m, 'info_player_deathmatch', 0, 2040, L1, 270, 2, 1, 64);
  navSeed(m, -1180, 1050, L0);
  navSeed(m, 1600, 0, L0);
  navSeed(m, -1600, -1000, L0);
  return m;
}
