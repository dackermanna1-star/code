// Hollow Creek (zm_hollow_creek): a small mountain town at night. An original layout:
// Main Street runs east-west through the middle (the diner, the hardware store, the pharmacy
// and the gas station on its south side; the bank, the post office, the town square and the
// police station on its north side); a creek in a stone-walled bed cuts down the west side
// under a covered bridge; the white church and its bell tower (the landmark) stand north of
// the square with the church field beside it and the cemetery on the hill behind; the school
// and its yard sit east of School Street with the rail yard beyond; Oak Lane's houses lie
// south behind the shops' alley; the highway runs along the south-east on its embankment and
// comes down the off-ramp onto Main Street. The squad starts in the town square; the horde
// comes down the woods road, up the creek bed, out of the cemetery, across the rail yard and
// down the off-ramp.
//
// Units: x east, y north, z up; streets at z 0, sidewalks and lawns 8. Everything is built from
// AreaMap areas (floors, auto mass at the edges) plus hand-placed brushes
// (zm_hollow_creek_parts.js); deterministic.
import { AreaMap } from '../areagen.js';
import { spawnGrid, zone } from '../kit.js';
import { buildTown } from './zm_hollow_creek_town.js';

export const MAP = {
  id: 'zm_hollow_creek',
  title: 'Hollow Creek',
  modes: ['zombies'],
  tagline: 'Small town. Long night.',
  blurb: 'A mountain town after curfew: sodium lamps on Main Street, a neon diner sign, the church bell tower over the square - and the dark coming down from the woods, the creek, the graves and the rails.',
  mood: ['night', 'town', 'tense'],
  squad: { min: 1, best: 4, max: 11 },
  // moonlight from the north-west, a dark blue sky, warm sodium street lights doing the work
  lighting: {
    sunDir: [-0.318, 0.424, 0.848],
    sunColor: [0.16, 0.2, 0.32],
    skyColor: [0.07, 0.085, 0.135],
    ambientMin: [0.032, 0.036, 0.052],
    bounce: 0.5,
    voidColor: [0.02, 0.025, 0.03],
    lmEncoding: 'sqrt',
  },
  sky: { preset: 'night' },
  fog: { color: [0.045, 0.055, 0.085], near: 500, far: 3600 },
  grade: { saturate: 0.9, contrast: 1.06 },
  ambience: { loop: 'amb_hollow_creek', volume: 0.42 },
  textures: 'hollowcreek',
  // callouts (first match wins: interiors and high places first)
  zones: [
    zone('Diner', 'diner', -1056, -544, -704, -224, 0, 220),
    zone('Hardware Roof', 'roof', -624, -608, -256, -224, 96, 400),
    zone('Pharmacy', 'pharmacy', -192, -544, 128, -224, 0, 220),
    zone('Bell Tower', 'tower', -96, 1136, 96, 1264, 20, 900),
    zone('Church', 'church', -336, 1088, 336, 1584, 0, 900),
    zone('Covered Bridge', 'bridge', -1696, -136, -1440, 136, -12, 300),
    zone('Creek Bed', 'creek', -1696, -1344, -1440, 1472, -200, -12),
    zone('Woods Road', 'woods', -1984, -200, -1632, 1700, -12, 400),
    zone('Woods Road', 'woods', -1696, 1472, -1440, 1700, -50, 400),
    zone('Highway', 'highway', 480, -1900, 1984, -1664, 64, 600),
    zone('Highway', 'highway', 480, -1664, 672, -1344, -50, 600),
    zone('Off-Ramp', 'ramp', 1728, -1664, 1984, -112, -50, 600),
    zone('Truck Stop', 'truckstop', 1152, -704, 1728, -208, -50, 400),
    zone('Gas Station', 'gas', 480, -960, 1152, -208, -50, 400),
    zone('Back Alley', 'alley', -1248, -960, 480, -832, -50, 400),
    zone('Back Alley', 'alley', -1152, -832, 320, -544, -50, 400),
    zone('Oak Lane', 'oak', -1248, -1700, 672, -1088, -50, 400),
    zone('Main Street', 'main', -1440, -224, 1984, 208, -50, 400),
    zone('Main Street', 'main', -1152, -544, 320, -224, -50, 400),
    zone('Mill Road', 'mill', -1552, -1344, -1152, 1700, -50, 400),
    zone('Pine Street', 'pine', 320, -1344, 480, -224, -50, 400),
    zone('Police Station', 'police', 448, 208, 960, 832, -50, 400),
    zone('Town Square', 'square', -448, 208, 448, 768, -50, 400),
    zone('Post Office', 'post', -1152, 208, -448, 768, -50, 400),
    zone('School Yard', 'school', 1152, 208, 1728, 1216, -50, 400),
    zone('School Street', 'schoolst', 960, -112, 1152, 1216, -50, 400),
    zone('Church Street', 'churchst', -1248, 768, 960, 1088, -50, 400),
    zone('Elm Lane', 'elm', -1152, 1088, -288, 1536, -50, 400),
    zone('Church Field', 'field', 288, 1088, 960, 1536, -50, 400),
    zone('Cemetery', 'cemetery', -1248, 1536, 960, 1800, -50, 400),
    zone('Rail Yard', 'rail', 960, 1216, 1856, 1800, -50, 400),
  ],
  // the horde's five ways in, each with the mouth where it breaks into the town
  fronts: [
    { id: 'woods', name: 'WOODS ROAD', via: 'down the', zones: ['Woods Road'], mouth: [-1440, 0] },
    { id: 'creek', name: 'CREEK BED', via: 'up the', zones: ['Creek Bed'], mouth: [-1488, -544] },
    { id: 'cemetery', name: 'CEMETERY', via: 'out of the', zones: ['Cemetery'], mouth: [-688, 1536] },
    { id: 'rail', name: 'RAIL YARD', via: 'across the', zones: ['Rail Yard'], mouth: [1056, 1216] },
    { id: 'ramp', name: 'OFF-RAMP', via: 'down the', zones: ['Off-Ramp', 'Highway'], mouth: [1856, -200] },
  ],
  squadStart: { pos: [280, 520, 8], yaw: 225, radius: 200 },
  buyArea: { pos: [280, 520, 8], radius: 320 },
  // the wave-20 ride out: the fuel tanker at the truck stop, or a helicopter on the church field
  extraction: [
    { id: 'tanker', name: 'The Tanker', pos: [1300, -330, 0], radius: 240 },
    { id: 'field', name: 'Church Field', pos: [640, 1300, 8], radius: 260 },
  ],
  objectives: [
    { id: 'radio', name: 'Hold the police radio', kind: 'hold', pos: [780, 560, 16], radius: 160 },
    { id: 'generator', name: 'Defend the diner generator', kind: 'defend', pos: [-944, -760, 8], radius: 200 },
    { id: 'bell', name: 'Ring the church bell', kind: 'hold', pos: [0, 1200, 32], radius: 120 },
    { id: 'supply_square', name: 'Supply drop: the town square', kind: 'supply', pos: [0, 720, 8] },
    { id: 'fuel', name: 'Fuel run: the pumps to the tanker', kind: 'escort', pos: [832, -432, 0], to: [1300, -330, 0] },
  ],
  titleShots: [
    { eye: [-1300, -40, 100], look: [300, 0, 40] },
    { eye: [-250, 150, 110], look: [-250, 1050, 50] },
    { eye: [1250, -230, 100], look: [880, -560, 30] },
    { eye: [-1616, -640, -30], look: [-1616, -150, -80] },
  ],
  thumbShot: { eye: [-220, -110, 100], look: [-40, 1180, 480] },
  hazards: [],
};

export function build() {
  const m = new AreaMap([-1984, -1984, 2112, 1920]);
  buildTown(m);
  spawnGrid(m, 'info_player_start', 280, 520, 8, 225, 4, 2, 56); // the squad: on the square's east lawn
  return m;
}

