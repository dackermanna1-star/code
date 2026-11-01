// Appearance generation (pure data). Every character is generated from a seed so saves only
// need to store the seed + overrides.
import { RNG } from '../core/random.js';

export const SKIN_TONES = ['#f1d2b6', '#e6b793', '#d6a07a', '#c48a62', '#a8704c', '#8b5a3c', '#6c442d', '#523322'];
export const HAIR_COLORS = ['#1b1917', '#2e221a', '#4a3121', '#6d4b2e', '#93703f', '#cfa95e', '#a5452c', '#8b8a86', '#d9d5cc'];
export const EYE_COLORS = ['#3b2516', '#22160e', '#3f6e9a', '#4f7a4a', '#6f747a'];
export const HAIR_STYLES = ['bald', 'buzz', 'short', 'slick', 'curly', 'afro', 'mohawk', 'spiky', 'ponytail', 'long', 'bun', 'bob'];
export const FACIAL = ['none', 'stubble', 'mustache', 'goatee', 'beard', 'chops'];
export const BUILDS = {
  slim: { girth: 0.88, muscle: 0.1, belly: 0, height: 1.0 },
  average: { girth: 1.0, muscle: 0.3, belly: 0.1, height: 1.0 },
  athletic: { girth: 1.04, muscle: 0.75, belly: 0, height: 1.02 },
  stocky: { girth: 1.16, muscle: 0.55, belly: 0.35, height: 0.95 },
  heavy: { girth: 1.28, muscle: 0.3, belly: 0.9, height: 0.99 },
  giant: { girth: 1.22, muscle: 0.9, belly: 0.25, height: 1.1 },
};
export const OUTFITS = {
  inmateA: { shirt: '#3f7c76', pants: '#356a65', label: 'Block A teal' },
  inmateB: { shirt: '#b38c30', pants: '#9c7a2a', label: 'Block B mustard' },
  solitary: { shirt: '#e4e1d6', pants: '#d6d3c8', label: 'Solitary whites' },
  guard: { shirt: '#2e3644', pants: '#1c2028', label: 'Officer' },
  warden: { shirt: '#5b3f2a', pants: '#4a3322', label: 'Warden' },
  nurse: { shirt: '#8577b8', pants: '#7466a8', label: 'Medical' },
};
export const CREW_COLORS = { suds: '#e9eef2', kings: '#c23b2b', pit: '#3f8a3a', player: '#e0a43a' };

export function randomAppearance(seed, opts = {}) {
  const r = new RNG(seed);
  const female = opts.female ?? r.chance(opts.femaleChance ?? 0.3);
  const buildName = opts.build || r.weighted(Object.keys(BUILDS), (b) => ({ slim: 2, average: 4, athletic: 2.5, stocky: 2, heavy: 1.5, giant: female ? 0.2 : 0.7 }[b]));
  const build = { ...BUILDS[buildName] };
  build.height *= r.range(0.95, 1.05) * (female ? 0.95 : 1);
  build.girth *= r.range(0.96, 1.04) * (female ? 0.93 : 1);
  const age = opts.age || r.weighted(['young', 'mid', 'old'], (a) => ({ young: 3, mid: 4, old: 1.4 }[a]));
  let hairColor = r.pick(HAIR_COLORS.slice(0, 7));
  if (age === 'old') hairColor = r.pick(HAIR_COLORS.slice(7));
  const hairStyle = opts.hair || (female
    ? r.weighted(HAIR_STYLES, (h) => ({ long: 3, ponytail: 3, bun: 2, bob: 3, short: 1.5, curly: 2, afro: 1.2, buzz: 0.6, slick: 0.6 }[h] || 0.05))
    : r.weighted(HAIR_STYLES, (h) => ({ bald: age === 'old' ? 3 : 1.5, buzz: 3, short: 3, slick: 1.5, curly: 1.5, afro: 1, mohawk: 0.5, spiky: 1, ponytail: 0.5, long: 0.5, bun: 0.2, bob: 0.1 }[h])));
  const facial = female ? 'none' : (opts.facial || r.weighted(FACIAL, (f) => ({ none: 3, stubble: 3, mustache: 1.2, goatee: 1.3, beard: 1.4, chops: 0.5 }[f])));
  const outfitKey = opts.outfit || 'inmateA';
  const outfit = OUTFITS[outfitKey];
  return {
    seed, female, age, buildName, build,
    headScale: r.range(0.95, 1.07) * (buildName === 'giant' ? 1.03 : 1),
    skin: opts.skin || r.pick(SKIN_TONES),
    eyes: r.pick(EYE_COLORS),
    brow: r.range(0.6, 1.4),
    hair: { style: hairStyle, color: hairColor },
    facial, facialColor: hairColor,
    outfitKey, shirt: opts.shirt || outfit.shirt, pants: opts.pants || outfit.pants,
    shoes: opts.shoes || r.pick(['#e8e6e0', '#2a2a2a', '#3d3128', '#d9d4c4']),
    sleeves: opts.sleeves || (outfitKey.startsWith('inmate') ? r.weighted(['short', 'long', 'tank'], (s) => ({ short: 5, long: 2, tank: 2 }[s])) : outfitKey === 'nurse' ? 'short' : 'long'),
    undershirt: '#efeee8',
    glasses: opts.glasses ?? r.chance(age === 'old' ? 0.35 : 0.08),
    cap: outfitKey === 'guard',
    bandana: opts.bandana || null,
    scar: r.chance(0.18), tattoo: r.chance(0.3), freckles: r.chance(0.12),
    idNumber: opts.idNumber || `${outfitKey === 'inmateB' ? 'B' : 'A'}-${String(r.int(1000, 9999))}`,
    mouthWidth: r.range(0.85, 1.2), eyeSize: r.range(0.9, 1.15), noseSize: r.range(0.85, 1.25), earSize: r.range(0.85, 1.2),
  };
}
