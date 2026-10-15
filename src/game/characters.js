// Character definitions: the four (original) survivors, common infected variety,
// uncommon hazmat infected, and the special infected archetypes.
import { buildHumanoid, FACES } from './rig.js';
import { mulberry32 } from '../engine/textures.js';

// ---------------------------------------------------------------- survivors
export const SURVIVORS = [
  {
    id: 'gus', name: 'Gus', voice: 'm', pitch: 0.85, rate: 0.95, prefers: ['shotgun', 'rifle'],
    bio: 'Retired Army cook. Built like a refrigerator, calm under fire.',
    spec: { build: 'heavy', skin: 0x8a5a3c, hair: 0x2a2420, hairStyle: 'short', face: FACES.gus, shirt: 0x8a8a84, jacket: 0x5a5a32, pants: 0x8a7a58, shoes: 0x3a2a1a, sleeves: 'long' },
  },
  {
    id: 'maya', name: 'Maya', voice: 'f', pitch: 1.15, rate: 1.05, prefers: ['rifle', 'smg'],
    bio: 'Paramedic. Was on shift when the city fell. Hasn\'t stopped working since.',
    spec: {
      female: true, build: 'average', skin: 0xc8946c, hair: 0x1c1410, hairStyle: 'ponytail', face: FACES.maya, shirt: 0x22304e, pants: 0x1e2a44, shoes: 0x141414, sleeves: 'short',
      extra: ({ part }) => {
        // reflective stripes on sleeves and a radio on the chest
        part('upperArmL', [0, -0.1, 0], [0.125, 0.03, 0.125], 0xd8d040);
        part('upperArmR', [0, -0.1, 0], [0.125, 0.03, 0.125], 0xd8d040);
        part('chest', [0.09, 0.12, 0.115], [0.05, 0.08, 0.03], 0x202020);
      },
    },
  },
  {
    id: 'trey', name: 'Trey', voice: 'm', pitch: 1.1, rate: 1.12, prefers: ['sniper', 'rifle'],
    bio: 'Nineteen. Skates, games, talks too much. Surprisingly good shot.',
    spec: { build: 'thin', skin: 0xe0b090, hair: 0x6a4a2a, hairStyle: 'cap', capColor: 0x2a4a8a, capBack: true, face: FACES.trey, shirt: 0xa82020, jacket: 0xa82020, pants: 0x3a5a8a, shoes: 0xd8d8d0, sleeves: 'long',
      extra: ({ part }) => { part('chest', [0, 0.02, 0.115], [0.22, 0.08, 0.02], 0x8a1818); /* hoodie pocket */ part('neck', [0, 0.02, -0.08], [0.24, 0.1, 0.08], 0xa82020); /* hood down */ } },
  },
  {
    id: 'silas', name: 'Silas', voice: 'm', pitch: 0.95, rate: 0.9, prefers: ['rifle', 'shotgun'],
    bio: 'Long-haul trucker. Has seen a lot of road. Not much rattles him.',
    spec: { build: 'average', skin: 0xd8a888, hair: null, hairStyle: 'bald', face: FACES.silas, shirt: 0x8a3a2a, jacket: 0x5a3a22, pants: 0x2a2a34, shoes: 0x2a1a10, sleeves: 'long',
      extra: ({ part }) => { part('chest', [0, 0.12, 0.1], [0.14, 0.22, 0.03], 0x8a3a2a); } },
  },
];

export function buildSurvivorModel(def) { return buildHumanoid({ ...def.spec }); }

// ---------------------------------------------------------------- common infected
const SHIRTS = [0x8a8a84, 0x5a6a8a, 0x8a5a4a, 0x6a7a5a, 0xb8b0a0, 0x4a4a52, 0x8a7a5a, 0x7a3a3a, 0x3a5a6a, 0xa09070, 0x5a4a6a, 0xc8c0b0, 0x6a5040];
const PANTS = [0x3a4a6a, 0x2a2a2a, 0x5a4a3a, 0x6a6a5a, 0x4a3a2a, 0x2a3a4a, 0x7a6a50];
const SKINS = [0x9a8a78, 0xa89880, 0x7a6a58, 0x6a5040, 0xb8a890, 0x8a7a6a, 0x584030, 0xa09070];
const HAIRS = [0x2a2018, 0x4a3420, 0x7a6a50, 0x1a1a1a, 0x8a7a6a, 0x9a8a60];

/** variant: 'civilian' | 'hotel' | 'hazmat' | 'worker' | 'mall' */
export function commonSpec(seed, variant = 'civilian') {
  const r = mulberry32(seed);
  const pick = (a) => a[(r() * a.length) | 0];
  const female = r() < 0.4;
  const spec = {
    female, build: r() < 0.15 ? 'heavy' : r() < 0.3 ? 'thin' : 'average',
    skin: pick(SKINS), hair: r() < 0.75 ? pick(HAIRS) : null, hairStyle: female ? (r() < 0.6 ? 'long' : 'short') : (r() < 0.7 ? 'short' : 'bald'),
    face: FACES.zombieStart + ((r() * FACES.zombieCount) | 0), shirt: pick(SHIRTS), pants: pick(PANTS), shoes: 0x2a2018,
    sleeves: r() < 0.5 ? 'short' : 'long', blood: true, rot: r() < 0.5, scale: 0.94 + r() * 0.12,
  };
  if (female && r() < 0.35) { spec.skirt = pick(PANTS); spec.bareLegs = true; }
  if (variant === 'hotel' && r() < 0.35) { spec.shirt = 0xd8d4c8; spec.jacket = r() < 0.5 ? 0x1a1a1a : 0x6a1a1a; spec.pants = 0x1a1a1a; spec.sleeves = 'long'; }
  if (variant === 'worker' && r() < 0.4) { spec.shirt = 0xd87020; spec.pants = 0x3a4a6a; spec.hairStyle = 'cap'; spec.capColor = 0xd8c020; }
  if (variant === 'mall' && r() < 0.3) { spec.shirt = 0x2a5a8a; spec.pants = 0x2a2a2a; }
  if (variant === 'hazmat') {
    Object.assign(spec, { female: false, skin: 0xc8c040, shirt: 0xc8c040, pants: 0xc8c040, shoes: 0x2a2a2a, gloves: 0x2a2a2a, hair: null, hairStyle: 'hood', hoodColor: 0xc8c040, face: FACES.hazmat, sleeves: 'long', skirt: undefined, bareLegs: false, build: 'heavy' });
  }
  return spec;
}
export function buildCommonModel(seed, variant) { return buildHumanoid(commonSpec(seed, variant)); }

// ---------------------------------------------------------------- special infected (original designs)
export const SPECIAL_SPECS = {
  boomer: {
    build: 'heavy', skin: 0x9aa070, face: FACES.boomer, shirt: 0x8a8a6a, pants: 0x4a4a3a, sleeves: 'none', hair: null, hairStyle: 'bald', bareLegs: false, rot: true, scale: 1.02,
    extra: ({ kit, part }) => {
      // swollen gut and pustules
      part('spine', [0, 0.02, 0.12], [0.5, 0.42, 0.42], 0xa0a470, { taper: [0.85, 0.8], taperBottom: [0.9, 0.85] });
      part('chest', [0, 0.06, 0.06], [0.52, 0.3, 0.34], 0x98a06a, { taper: [0.8, 0.8] });
      part('spine', [0.2, 0.1, 0.24], [0.08, 0.08, 0.06], 0xc8b060);
      part('chest', [-0.18, 0.1, 0.18], [0.07, 0.07, 0.06], 0xc8b060);
      part('spine', [-0.1, -0.06, 0.32], [0.09, 0.09, 0.05], 0xb8a050);
    },
  },
  hunter: {
    build: 'thin', skin: 0x8a7a6a, face: FACES.hunter, shirt: 0x2e3a2a, jacket: 0x2e3a2a, pants: 0x2a2a2e, shoes: 0x1a1a1a, sleeves: 'long', hair: null, hairStyle: 'hood', hoodColor: 0x2a3426, blood: true,
    extra: ({ part }) => { part('handL', [0, -0.1, 0.02], [0.08, 0.06, 0.07], 0x6a5a4a); part('handR', [0, -0.1, 0.02], [0.08, 0.06, 0.07], 0x6a5a4a); },
  },
  smoker: {
    build: 'thin', scale: 1.12, skin: 0x8a7a80, face: FACES.smoker, shirt: 0x5a4a3a, jacket: 0x4a3a2e, pants: 0x3a3a3a, sleeves: 'long', hair: 0x3a3a3a, hairStyle: 'short', rot: true, armLen: 1.12,
    extra: ({ part }) => {
      // fungal growths
      part('neck', [0.05, 0.05, 0.02], [0.14, 0.12, 0.13], 0x7a3a4a);
      part('head', [0.09, 0.1, 0.02], [0.08, 0.14, 0.14], 0x8a4a5a);
      part('chest', [0.16, 0.18, 0.02], [0.14, 0.1, 0.16], 0x7a3a4a);
      part('upperArmL', [0.02, -0.06, 0], [0.13, 0.12, 0.13], 0x6a3040);
    },
  },
  charger: {
    // hunched brute with bony shoulder plates and oversized fists
    build: 'muscle', skin: 0x8a7060, face: FACES.charger, shirt: 0x3a5a7a, pants: 0x3a5a7a, shoes: 0x2a2018, sleeves: 'none', hair: null, hairStyle: 'bald', rot: true, scale: 1.05,
    rel: { upperArmR: [-0.27, 0.15, 0], upperArmL: [0.27, 0.15, 0] },
    extra: ({ part }) => {
      for (const sd of ['L', 'R']) {
        const x = sd === 'L' ? 1 : -1;
        part('upperArm' + sd, [0, -0.14, 0], [0.18, 0.32, 0.18], 0x8a7060);
        part('forearm' + sd, [0, -0.15, 0.01], [0.17, 0.32, 0.17], 0x8a7060, { taperBottom: [1.15, 1.15] });
        part('hand' + sd, [0, -0.11, 0.02], [0.17, 0.15, 0.16], 0x7a6050);
        part('chest', [0.17 * x, 0.25, 0], [0.2, 0.08, 0.26], 0xc8b8a0); // bone plate
      }
      part('chest', [0, 0.2, -0.1], [0.36, 0.16, 0.12], 0xc8b8a0); // dorsal ridge
      part('head', [0, 0.25, 0.0], [0.18, 0.05, 0.2], 0xc8b8a0);
      part('spine', [0, 0.1, 0.02], [0.36, 0.22, 0.26], 0x3a5a7a);
    },
  },
  jockey: {
    build: 'thin', scale: 0.72, skin: 0xa08a70, face: FACES.jockey, shirt: 0x6a2a3a, pants: 0x6a2a3a, sleeves: 'short', hair: null, hairStyle: 'bald', armLen: 1.25, legLen: 0.9, rot: true,
    extra: ({ part }) => { part('head', [0, 0.12, 0.02], [0.22, 0.24, 0.24], 0xa08a70, { skip: { front: true } }); },
  },
  spitter: {
    // gaunt figure carrying glowing acid sacs on its back and a distended jaw
    female: true, build: 'thin', scale: 1.06, skin: 0x8a9a70, face: FACES.spitter, shirt: 0x5a5a52, pants: 0x5a5a52, skirt: 0x4a4a42, bareLegs: true, sleeves: 'none', hair: 0x3a3a2a, hairStyle: 'short', rot: true,
    extra: ({ part }) => {
      part('chest', [0.07, 0.12, -0.15], [0.14, 0.16, 0.12], 0x70e040);
      part('chest', [-0.08, 0.06, -0.14], [0.12, 0.14, 0.1], 0x60d038);
      part('spine', [0, 0.1, -0.13], [0.12, 0.12, 0.08], 0x58c030);
      part('head', [0, -0.02, 0.1], [0.12, 0.08, 0.05], 0x60ff40); // glowing jaw
    },
  },
  tank: {
    build: 'muscle', scale: 1.15, skin: 0x8a8070, face: FACES.tank, shirt: 0x8a8070, pants: 0x4a4a52, shoes: 0x3a3028, sleeves: 'none', hair: null, hairStyle: 'bald', armLen: 1.25, legLen: 0.85,
    rel: { upperArmL: [0.42, 0.2, 0], upperArmR: [-0.42, 0.2, 0], neck: [0, 0.2, 0.08] },
    extra: ({ part }) => {
      part('chest', [0, 0.12, 0], [0.86, 0.46, 0.48], 0x8a8070, { taper: [1.1, 0.95], taperBottom: [0.7, 0.85] });
      part('spine', [0, 0.06, 0.04], [0.6, 0.3, 0.4], 0x8a8070);
      for (const s of ['L', 'R']) {
        part('upperArm' + s, [0, -0.15, 0], [0.32, 0.4, 0.32], 0x8a8070, { taper: [1.15, 1.15] });
        part('forearm' + s, [0, -0.16, 0.02], [0.3, 0.4, 0.3], 0x8a8070, { taperBottom: [1.2, 1.2] });
        part('hand' + s, [0, -0.14, 0.02], [0.24, 0.2, 0.22], 0x7a7060);
      }
      part('head', [0, 0.08, 0.04], [0.16, 0.16, 0.16], 0x8a8070);
    },
  },
  witch: {
    female: true, build: 'thin', scale: 1.0, skin: 0xd8d0c8, face: FACES.witch, shirt: 0xc8c0b0, pants: 0xc8c0b0, skirt: 0xb8b0a0, bareLegs: true, sleeves: 'none', hair: 0xe8e8e0, hairStyle: 'long', armLen: 1.15,
    extra: ({ part }) => {
      for (const s of ['L', 'R']) part('hand' + s, [0, -0.13, 0.02], [0.08, 0.2, 0.05], 0xd8d0c8, { taperBottom: [0.5, 0.5] }); // long claws
      part('head', [0, 0.02, -0.1], [0.24, 0.42, 0.08], 0xe8e8e0); // very long hair
    },
  },
};

export function buildSpecialModel(type) { return buildHumanoid({ ...SPECIAL_SPECS[type] }); }
