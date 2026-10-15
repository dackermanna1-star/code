// Authored natural features: ridges, hills, quarry, river, ponds, forests, fields, flat areas, ground patches.
import type { FieldDef, FlatAreaDef, ForestDef, GroundPatchDef, HillDef, PondDef, QuarryDef, RidgeDef, RiverDef } from './types';
import { xz } from './geometry';

export const RIDGES: RidgeDef[] = [
  // North-west highlands between the port and Lipovo.
  { points: [xz(560, 300), xz(760, 330), xz(960, 375), xz(1090, 430)], heights: [28, 52, 46, 20], width: 190 },
  // Eastern ridge with the radio tower summit (Vysota).
  {
    points: [xz(1870, 840), xz(1975, 1000), xz(2050, 1150), xz(2140, 1320), xz(2230, 1490)],
    heights: [36, 70, 92, 66, 34],
    width: 270,
  },
  // Low ridge along the military island spine.
  { points: [xz(1050, 2760), xz(1250, 2820), xz(1420, 2850)], heights: [10, 18, 10], width: 120 },
];

export const HILLS: HillDef[] = [
  { x: 720, z: 1150, radius: 230, height: 34, plateau: 0.55 }, // Staroye ruins hill
  { x: 2520, z: 690, radius: 300, height: 22, plateau: 0.4 }, // Kamenka prison plateau
  { x: 980, z: 1960, radius: 260, height: 28 },
  { x: 2620, z: 1760, radius: 230, height: 22 },
  { x: 1560, z: 460, radius: 190, height: 16 },
  { x: 440, z: 1430, radius: 300, height: 36, plateau: 0.25 }, // quarry hill
  { x: 2350, z: 380, radius: 200, height: 18 },
  { x: 1820, z: 1640, radius: 210, height: 18 },
  { x: 560, z: 2230, radius: 160, height: 12 },
  { x: 2250, z: 2780, radius: 150, height: 12 },
];

export const QUARRY: QuarryDef = { x: 420, z: 1500, rx: 105, rz: 72, rotation: 0.35, depth: 22, terraces: 3 };

export const RIVER: RiverDef = {
  points: [
    xz(330, 755), xz(470, 790), xz(600, 852), xz(740, 935), xz(870, 1040), xz(975, 1180), xz(1045, 1330),
    xz(1080, 1480), xz(1118, 1640), xz(1190, 1800), xz(1280, 1950), xz(1345, 2100), xz(1395, 2240), xz(1425, 2400),
  ],
  widths: [80, 66, 56, 50, 46, 44, 44, 44, 46, 48, 50, 52, 58, 70],
  depth: 5,
};

/** Pond water levels are resolved during terrain generation (NaN = take the base terrain at the center - 1.2 m). */
export const PONDS: PondDef[] = [
  { x: 1840, z: 640, radius: 42, level: NaN },
  { x: 1960, z: 1960, radius: 34, level: NaN },
  { x: 520, z: 1040, radius: 30, level: NaN },
];

export const FORESTS: ForestDef[] = [
  { x: 2000, z: 380, radius: 290, density: 0.85, stretch: 1.6, rotation: 0.15 },
  { x: 2260, z: 1010, radius: 230, density: 0.82 },
  { x: 1830, z: 1200, radius: 190, density: 0.7 },
  { x: 860, z: 1320, radius: 220, density: 0.75 },
  { x: 520, z: 1050, radius: 240, density: 0.88, stretch: 1.3, rotation: 0.6 },
  { x: 880, z: 330, radius: 250, density: 0.9, stretch: 1.5, rotation: -0.4 },
  { x: 1150, z: 760, radius: 200, density: 0.7 },
  { x: 1000, z: 1780, radius: 270, density: 0.85, stretch: 1.4, rotation: 0.9 },
  { x: 1560, z: 1730, radius: 170, density: 0.6 },
  { x: 370, z: 1820, radius: 200, density: 0.78 },
  { x: 2610, z: 2090, radius: 200, density: 0.72 },
  { x: 2140, z: 1760, radius: 170, density: 0.62 },
  { x: 1140, z: 2780, radius: 170, density: 0.7 },
  { x: 2760, z: 1110, radius: 210, density: 0.7, stretch: 1.6, rotation: 1.4 },
  { x: 2180, z: 2830, radius: 150, density: 0.6 },
  { x: 1300, z: 1080, radius: 150, density: 0.55 },
  { x: 2700, z: 600, radius: 140, density: 0.6 },
];

export const FIELDS: FieldDef[] = [
  // Lipovo
  { x: 1070, z: 410, w: 160, d: 120, rotation: 0.1, crop: 'wheat' },
  { x: 1440, z: 420, w: 150, d: 110, rotation: -0.12, crop: 'plowed' },
  { x: 1180, z: 610, w: 150, d: 95, rotation: 0.05, crop: 'green' },
  // Berezovka
  { x: 1540, z: 2250, w: 180, d: 110, rotation: 0.2, crop: 'wheat' },
  { x: 1880, z: 2235, w: 160, d: 100, rotation: 0.15, crop: 'plowed' },
  { x: 1760, z: 2010, w: 140, d: 90, rotation: -0.1, crop: 'green' },
  // Malinovka
  { x: 720, z: 1940, w: 160, d: 110, rotation: 0.4, crop: 'wheat' },
  { x: 400, z: 1985, w: 120, d: 95, rotation: 0.3, crop: 'plowed' },
  // South-east farms
  { x: 2400, z: 1850, w: 180, d: 120, rotation: 0.25, crop: 'wheat' },
  { x: 2230, z: 2060, w: 150, d: 100, rotation: 0.3, crop: 'green' },
  { x: 2520, z: 1960, w: 120, d: 140, rotation: 0.2, crop: 'plowed' },
  // North-centre farms near the pond
  { x: 1990, z: 600, w: 170, d: 110, rotation: 0.15, crop: 'plowed' },
  { x: 1700, z: 660, w: 130, d: 100, rotation: -0.05, crop: 'wheat' },
  // Between Volodino and the school
  { x: 1660, z: 1110, w: 150, d: 95, rotation: -0.3, crop: 'wheat' },
  // West farm
  { x: 650, z: 1700, w: 140, d: 90, rotation: 0.5, crop: 'green' },
  // Near the power plant
  { x: 2440, z: 1300, w: 140, d: 100, rotation: -0.2, crop: 'wheat' },
];

export const FLAT_AREAS: FlatAreaDef[] = [
  { x: 1380, z: 1400, radius: 260, strength: 0.88 }, // Volodino
  { x: 1560, z: 880, radius: 200, strength: 0.85 }, // Ryabinovka school
  { x: 470, z: 560, radius: 280, strength: 0.85 }, // Zalivsk
  { x: 320, z: 640, radius: 120, strength: 1, height: 3.2 }, // port quay
  { x: 1650, z: 2710, radius: 330, strength: 0.95 }, // military base
  { x: 2620, z: 1450, radius: 240, strength: 0.92 }, // power plant
  { x: 2520, z: 690, radius: 150, strength: 0.9 }, // prison
  { x: 1250, z: 330, radius: 160, strength: 0.7 }, // Lipovo
  { x: 560, z: 2040, radius: 160, strength: 0.7 }, // Malinovka
  { x: 1700, z: 2140, radius: 160, strength: 0.7 }, // Berezovka
  { x: 720, z: 1150, radius: 110, strength: 0.6 }, // ruins plateau
];

export const GROUND_PATCHES: GroundPatchDef[] = [
  // Military: central parade ground + hangar aprons
  { x: 1650, z: 2700, w: 150, d: 90, rotation: 0, surface: 'concrete' },
  { x: 1830, z: 2780, w: 110, d: 100, rotation: 0, surface: 'gravel' },
  { x: 1470, z: 2780, w: 120, d: 90, rotation: 0, surface: 'gravel' },
  // Port container yard + quay
  { x: 320, z: 615, w: 190, d: 70, rotation: -0.32, surface: 'concrete' },
  { x: 470, z: 610, w: 120, d: 60, rotation: -0.32, surface: 'gravel' },
  // Power plant yard
  { x: 2640, z: 1450, w: 220, d: 170, rotation: 0.1, surface: 'concrete' },
  // Quarry floor
  { x: 420, z: 1500, w: 190, d: 125, rotation: 0.35, surface: 'gravel' },
  // Prison yard
  { x: 2520, z: 690, w: 120, d: 110, rotation: 0.05, surface: 'dirt' },
  // School yard
  { x: 1560, z: 925, w: 70, d: 40, rotation: 0, surface: 'concrete' },
  // Volodino square
  { x: 1380, z: 1400, w: 46, d: 46, rotation: 0, surface: 'concrete' },
];
