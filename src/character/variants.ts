import { CharacterLibrary, VariantOptions } from './library';
import { fitSpec, isRealModel, RealLook } from './realBody';
import { defaultOutfit, HAIR_COLORS, Outfit, SKIN_TONES } from './outfit';
import { BodySpec } from '../anim/skeleton';
import { RNG } from '../core/math';

export type Archetype = 'player' | 'brawler' | 'knife' | 'club' | 'sword' | 'agile' | 'bruiser' | 'defender' | 'elite' | 'butcher' | 'viper' | 'master' | 'warden' | 'subject';

const o = (over: Partial<Outfit>): Outfit => ({ ...defaultOutfit(), ...over });

/** A colour for a RealLook's tints: hex, and how much of it (0..1). */
const tint = (hex: string, a = 0.85): [number, number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
};

/**
 * A realistic avatar for a fighter (Microsoft Rocketbox, see realBody.ts): the archetype keeps its
 * height and bulk (they're the game's: reach, collision, weight), the skeleton's proportions come
 * from the avatar, and the look tints its clothes and skin. The procedural outfit stays the
 * fallback.
 */
type Real = { model: string; look?: RealLook };
const realSpec = (spec: Partial<BodySpec>, r?: Real) => (r && isRealModel(r.model) ? fitSpec(r.model, spec, r.look?.girth ?? 1) : spec);
const realOpts = (r?: Real, opts: VariantOptions = {}): VariantOptions => (r ? { ...opts, real: r.model, look: r.look } : opts);

/** Register all character variants. Returns map archetype -> variant names. */
export function registerVariants(lib: CharacterLibrary): Record<Archetype, string[]> {
  const out = {} as Record<Archetype, string[]>;
  const add = (arch: Archetype, name: string, spec: Partial<BodySpec>, outfit: Outfit, opts?: VariantOptions, real?: Real) => {
    lib.add(name, realSpec(spec, real), outfit, realOpts(real, opts));
    (out[arch] ??= []).push(name);
  };
  const rng = new RNG(4242);
  // the street: men in their own clothes, worn their own way
  const BRAWLERS: Real[] = [
    { model: 'adult04' },
    { model: 'adult09', look: { top: tint('#5a2420', 0.55) } },
    { model: 'adult12' },
    { model: 'adult18', look: { top: tint('#3a4230', 0.7) } },
    { model: 'adult16', look: { top: tint('#4a1c26', 0.8) } },
  ];
  const KNIVES: Real[] = [{ model: 'adult07' }, { model: 'adult10' }, { model: 'adult09', look: { top: tint('#6a1010', 0.85), bottom: tint('#1a1c22', 0.6) } }];
  const CLUBS: Real[] = [{ model: 'gardener01' }, { model: 'delivery01' }, { model: 'delivery01', look: { top: tint('#22324a', 0.8) } }];
  const SWORDS: Real[] = [{ model: 'business01' }, { model: 'business05' }];
  const AGILE: Real[] = [{ model: 'adult17' }, { model: 'adult10', look: { top: tint('#1e5a2a', 0.85) } }, { model: 'adult18', look: { top: tint('#3e2a5a', 0.8), bottom: tint('#16161c', 0.6) } }];
  const BRUISERS: Real[] = [{ model: 'adult05', look: { girth: 1.22 } }, { model: 'adult20', look: { girth: 1.25 } }, { model: 'sports01', look: { girth: 1.25, bottom: tint('#1a1a1a', 0.7) } }];
  const DEFENDERS: Real[] = [{ model: 'police02' }, { model: 'security01', look: { girth: 1.06 } }, { model: 'police02', look: { top: tint('#2c3424', 0.6), bottom: tint('#2c3424', 0.6) } }];
  const ELITES: Real[] = [{ model: 'business05', look: { top: tint('#121216', 0.6) } }, { model: 'business01', look: { top: tint('#141a26', 0.7) } }, { model: 'adult07', look: { top: tint('#0e0e10', 0.8), bottom: tint('#0e0e10', 0.7) } }];

  // ---------------- player: lean martial artist
  add('player', 'player', { height: 1.0, bulk: 1.02, shoulders: 1.04, arms: 1.0 },
    o({ skin: '#c99272', hair: '#121010', hairStyle: 'topknot', facial: 'stubble', top: 'tank', topColor: '#1b1b1f', topColor2: '#7a1515',
      bottom: 'gi', bottomColor: '#1c1c22', shoes: 'wraps', hands: 'wraps', head: 'headband', headColor: '#8a1414', extras: ['sash'], extraColor: '#8a1414', scar: true, brow: 0.8, seed: 7 }),
    { hiFace: true });
  // ---------------- player two: Scarlet, a redheaded kickboxer in a leather jacket, mini skirt and knee boots
  // (a realistic model - realBody.ts; her skeleton is fitted to its proportions. The procedural body
  // below stands in if its textures fail to load.)
  add('player', 'scarlet', { height: 0.94, fem: 1, heel: 0.035, bulk: 0.9, shoulders: 1.03, hipsW: 1.04, arms: 0.97, legs: 1.055, neckLen: 0.87, headSize: 1.05, chestDepth: 1.0,
    torso: 0.922, neckBack: 0.059, shoulderBack: 0.048 },
    o({ skin: '#e2ae8f', hair: '#9a3216', hairStyle: 'longwave', facial: 'none', top: 'leather', topColor: '#141215', topColor2: '#5e1020',
      bottom: 'skirt', bottomColor: '#0c0b0d', legwear: '#0c0a0c', shoes: 'kneeboots', shoeColor: '#0d0c0e', hands: 'fingerless', handColor: '#121113',
      head: 'none', extras: ['earrings'], extraColor: '#caa45a', eyes: '#3d8a4a', brow: 0.3, seed: 8,
      makeup: { lips: '#c41e30', liner: 1, blush: 0.4, freckles: 0.7, shadow: '#5e3c44' } }),
    { hiFace: true, real: 'scarlet' });

  // ---------------- brawlers: street thugs
  const thugTops: Outfit['top'][] = ['tshirt', 'hoodie', 'tank', 'jacket', 'longsleeve'];
  const thugCols = ['#5a5f66', '#7a2e22', '#2f4a3a', '#3b3550', '#6b5a3a', '#40444a', '#7f6f5f'];
  for (let i = 0; i < 5; i++) {
    const top = thugTops[i];
    add('brawler', 'brawler' + i, { height: rng.range(0.96, 1.04), bulk: rng.range(1.0, 1.1), gut: rng.range(0, 0.6) },
      o({ skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), hairStyle: rng.pick(['buzz', 'short', 'bald', 'slick', 'mohawk'] as const),
        facial: rng.pick(['none', 'stubble', 'beard', 'goatee', 'mustache'] as const), top, topColor: thugCols[i], topColor2: rng.pick(['#d0c060', '#c0c0c0', '#202020', '#a03030']),
        topPattern: rng.pick(['plain', 'logo', 'stripes', 'flannel', 'number'] as const), bottom: rng.pick(['jeans', 'cargo', 'track'] as const),
        bottomColor: rng.pick(['#2b3a55', '#3a3a3a', '#4a4232', '#24304a', '#5a5040']), shoes: rng.pick(['sneakers', 'boots'] as const),
        shoeColor: rng.pick(['#dddddd', '#3a2a1a', '#222222', '#8a2020']), head: rng.pick(['none', 'cap', 'beanie', 'none', 'bandana'] as const),
        headColor: rng.pick(['#202020', '#6a1a1a', '#1a3a6a', '#4a4a4a']), tattoo: rng.chance(0.4), brow: rng.range(0.4, 1), seed: 100 + i }), undefined, BRAWLERS[i]);
  }
  // ---------------- knife: red bandanas, lean
  for (let i = 0; i < 3; i++)
    add('knife', 'knife' + i, { height: rng.range(0.95, 1.02), bulk: 0.95 },
      o({ skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), hairStyle: rng.pick(['short', 'slick', 'ponytail'] as const), facial: rng.pick(['stubble', 'goatee', 'none'] as const),
        top: rng.pick(['vest', 'tank', 'tshirt'] as const), topColor: rng.pick(['#3a1a1a', '#202020', '#4a2a2a']), topColor2: '#a02020', bottom: 'jeans', bottomColor: '#202530',
        shoes: 'boots', shoeColor: '#2a2018', head: 'bandana', headColor: '#a01818', tattoo: true, brow: 0.9, seed: 200 + i }), undefined, KNIVES[i]);
  // ---------------- club: workers
  for (let i = 0; i < 3; i++)
    add('club', 'club' + i, { height: rng.range(0.98, 1.05), bulk: 1.08, gut: 0.5 },
      o({ skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), hairStyle: rng.pick(['buzz', 'bald', 'short'] as const), facial: rng.pick(['beard', 'stubble'] as const),
        top: rng.pick(['longsleeve', 'tshirt', 'jacket'] as const), topColor: rng.pick(['#5a4a2a', '#6a5a3a', '#3a4a5a']), topColor2: '#c09030', topPattern: rng.pick(['flannel', 'plain'] as const),
        bottom: 'cargo', bottomColor: '#3a3a30', shoes: 'boots', shoeColor: '#3a2a1a', head: rng.pick(['cap', 'beanie', 'none'] as const), headColor: '#c08020', brow: 0.7, seed: 300 + i }), undefined, CLUBS[i]);
  // ---------------- sword: masked gang enforcers
  for (let i = 0; i < 2; i++)
    add('sword', 'sword' + i, { height: 1.01, bulk: 1.0 },
      o({ skin: rng.pick(SKIN_TONES), hair: '#101010', hairStyle: 'slick', top: 'jacket', topColor: '#141418', topColor2: '#6a1010', bottom: 'jeans', bottomColor: '#141418',
        shoes: 'boots', shoeColor: '#101010', head: 'mask', headColor: '#e0e0d8', extras: ['belt'], brow: 1, seed: 400 + i }), undefined, SWORDS[i]);
  // ---------------- agile: track suits, slim
  for (let i = 0; i < 3; i++)
    add('agile', 'agile' + i, { height: rng.range(0.94, 1.0), bulk: 0.9, legs: 1.03 },
      o({ skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), hairStyle: rng.pick(['mohawk', 'short', 'buzz'] as const), top: 'tracktop', topColor: rng.pick(['#1a3a8a', '#1a6a3a', '#5a1a6a']),
        topColor2: '#e0e0e0', bottom: 'track', bottomColor: rng.pick(['#1a2a5a', '#103a20', '#3a1040']), shoes: 'sneakers', shoeColor: '#f0f0f0', brow: 0.7, seed: 500 + i }), undefined, AGILE[i]);
  // ---------------- bruiser: big shirtless / vests
  for (let i = 0; i < 3; i++)
    add('bruiser', 'bruiser' + i, { height: rng.range(1.12, 1.18), bulk: 1.38, shoulders: 1.25, gut: rng.range(0.4, 1.0), headSize: 1.04, chestDepth: 1.15, hipsW: 1.15 },
      o({ skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), hairStyle: rng.pick(['bald', 'buzz', 'mohawk'] as const), facial: rng.pick(['beard', 'goatee', 'stubble'] as const),
        top: rng.pick(['bare', 'vest', 'tank'] as const), topColor: '#2a2a2a', bottom: rng.pick(['cargo', 'jeans'] as const), bottomColor: rng.pick(['#3a3a2a', '#2a2a3a']),
        shoes: 'boots', shoeColor: '#1a1a1a', hands: 'fingerless', handColor: '#202020', tattoo: true, extras: ['chain'], extraColor: '#c0c0c0', brow: 1, seed: 600 + i }), undefined, BRUISERS[i]);
  // ---------------- defenders: padded, arm guards
  for (let i = 0; i < 3; i++)
    add('defender', 'defender' + i, { height: rng.range(1.0, 1.05), bulk: 1.12, shoulders: 1.1 },
      o({ skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), hairStyle: 'buzz', top: 'longsleeve', topColor: rng.pick(['#30343a', '#2a3020']), topColor2: '#505050',
        bottom: 'cargo', bottomColor: '#25282c', shoes: 'boots', shoeColor: '#111111', head: rng.pick(['helmet', 'balaclava'] as const), headColor: '#1a1c1e', hands: 'gloves', handColor: '#151515',
        extras: ['kneepads', 'shoulderpads', 'bracers', 'chestarmor'], extraColor: '#3a3e44', brow: 0.6, seed: 700 + i }), undefined, DEFENDERS[i]);
  // ---------------- elite martial artists: dark gi
  for (let i = 0; i < 3; i++)
    add('elite', 'elite' + i, { height: rng.range(0.98, 1.03), bulk: 1.02 },
      o({ skin: rng.pick(SKIN_TONES), hair: '#101010', hairStyle: rng.pick(['topknot', 'ponytail', 'buzz'] as const), facial: rng.pick(['none', 'goatee', 'mustache'] as const),
        top: 'gi', topColor: rng.pick(['#20202a', '#2a1414', '#14202a']), topColor2: '#101010', bottom: 'gi', bottomColor: '#18181e', shoes: 'slippers', shoeColor: '#101010',
        hands: 'wraps', head: rng.pick(['headband', 'none'] as const), headColor: '#d0d0d0', extras: ['bracers'], extraColor: '#30202a', brow: 0.9, seed: 800 + i }), undefined, ELITES[i]);
  // ---------------- bosses
  add('butcher', 'butcher', { height: 1.2, bulk: 1.45, shoulders: 1.3, gut: 1.2, headSize: 1.06, chestDepth: 1.2, hipsW: 1.2 },
    o({ skin: '#d9a07a', hair: '#3a2a1e', hairStyle: 'bald', facial: 'beard', top: 'tank', topColor: '#d8d0c0', bottom: 'cargo', bottomColor: '#3a3428',
      shoes: 'boots', shoeColor: '#1a1410', hands: 'gloves', handColor: '#3a2a20', head: 'none', extras: ['belt', 'chain'], extraColor: '#5a4a3a', scar: true, tattoo: true, brow: 1, seed: 900 }),
    undefined, { model: 'butcher', look: { girth: 1.3 } });
  add('viper', 'viper', { height: 0.98, bulk: 0.92, legs: 1.04 },
    o({ skin: '#e0ac85', hair: '#0e0e0e', hairStyle: 'ponytail', top: 'longsleeve', topColor: '#0e1a12', topColor2: '#2a8a3a', topPattern: 'panel', bottom: 'track', bottomColor: '#0e1a12',
      shoes: 'slippers', shoeColor: '#0a0a0a', hands: 'gloves', handColor: '#0a0a0a', head: 'mask', headColor: '#1a4a2a', extras: ['bracers', 'belt'], extraColor: '#2a6a3a', brow: 1, seed: 901 }),
    undefined, { model: 'adult10', look: { top: tint('#0f3a1c', 0.9), bottom: tint('#0e1a12', 0.7) } });
  add('master', 'master', { height: 1.03, bulk: 1.1, shoulders: 1.08 },
    o({ skin: '#a8714d', hair: '#d8d8d8', hairStyle: 'topknot', facial: 'beard', top: 'gi', topColor: '#5a0e0e', topColor2: '#d0b060', bottom: 'gi', bottomColor: '#140a0a',
      shoes: 'slippers', shoeColor: '#0a0a0a', hands: 'wraps', head: 'none', extras: ['bracers', 'shoulderpads'], extraColor: '#d0b060', scar: true, brow: 1, seed: 902 }),
    undefined, { model: 'business04', look: { girth: 1.08 } });
  return out;
}

/**
 * The lab's people, standing in for the street's: uniformed security (fists and batons), techs in
 * white coats with scalpels, black-ops in balaclavas, riot guards, escaped test subjects, the
 * things the lab grew - and its two bosses, the Warden and Subject Zero.
 */
export function registerLabVariants(lib: CharacterLibrary): Partial<Record<Archetype, string[]>> {
  const out: Partial<Record<Archetype, string[]>> = {};
  const add = (arch: Archetype, name: string, spec: Partial<BodySpec>, outfit: Outfit, real?: Real) => {
    lib.add(name, realSpec(spec, real), outfit, realOpts(real));
    (out[arch] ??= []).push(name);
  };
  const rng = new RNG(7171);
  // the lab's: security in its uniforms, techs in white coats, black-ops in tactical black, its
  // escaped subjects pale and shaved, what it grew grey and huge
  const navyT = ['#1a2438', '#1e2840', '#232a3a', '#1a2030', '#24304a'];
  const pale = tint('#e2d6d2', 0.55), grey = tint('#9aa890', 0.75);
  const navy = ['#1a2438', '#1e2840', '#232a3a', '#1a2030', '#24304a'];
  // ---------------- security guards (fists)
  for (let i = 0; i < 5; i++)
    add('brawler', 'labguard' + i, { height: rng.range(0.97, 1.05), bulk: rng.range(1.0, 1.12), gut: rng.range(0, 0.7) },
      o({ skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), hairStyle: rng.pick(['buzz', 'short', 'bald', 'slick'] as const), facial: rng.pick(['none', 'stubble', 'mustache', 'goatee'] as const),
        top: i % 2 ? 'longsleeve' : 'tshirt', topColor: navy[i], topColor2: '#c8a040', topPattern: 'uniform', bottom: 'cargo', bottomColor: '#14161c', shoes: 'boots', shoeColor: '#0e0e10',
        head: i < 3 ? 'cap' : 'none', headColor: '#141a2a', extras: ['belt'], brow: rng.range(0.4, 0.9), seed: 1100 + i }),
      { model: 'security01', look: i ? { top: tint(navyT[i], 0.55) } : {} });
  // ---------------- lab techs with scalpels
  for (let i = 0; i < 3; i++)
    add('knife', 'labtech' + i, { height: rng.range(0.95, 1.02), bulk: rng.range(0.9, 1.0) },
      o({ skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), hairStyle: rng.pick(['short', 'slick', 'ponytail', 'bald'] as const), facial: rng.pick(['none', 'stubble', 'beard'] as const),
        top: 'coat', topColor: '#e8ecee', topColor2: rng.pick(['#9ab8d8', '#d8d8d0', '#c8a8a8']), bottom: 'cargo', bottomColor: '#4a4e56', shoes: 'sneakers', shoeColor: '#e0e0e0',
        hands: 'gloves', handColor: '#6aa8e8', head: 'none', brow: 0.95, seed: 1200 + i }),
      { model: 'medical01', look: i === 1 ? { bottom: tint('#3a4a5a', 0.6) } : {} });
  // ---------------- baton guards
  for (let i = 0; i < 3; i++)
    add('club', 'labbaton' + i, { height: rng.range(1.0, 1.06), bulk: 1.1, gut: 0.4 },
      o({ skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), hairStyle: rng.pick(['buzz', 'bald'] as const), facial: rng.pick(['stubble', 'mustache'] as const),
        top: 'longsleeve', topColor: '#141c2c', topColor2: '#c8a040', topPattern: 'uniform', bottom: 'cargo', bottomColor: '#101216', shoes: 'boots', shoeColor: '#0a0a0c',
        head: 'cap', headColor: '#0e1420', hands: 'gloves', handColor: '#111111', extras: ['belt', 'chestarmor'], extraColor: '#1a1e24', brow: 0.8, seed: 1300 + i }),
      { model: 'security01', look: { top: tint('#121a2a', 0.7), girth: 1.08 } });
  // ---------------- black-ops with machetes
  for (let i = 0; i < 2; i++)
    add('sword', 'labops' + i, { height: 1.02, bulk: 1.04 },
      o({ skin: rng.pick(SKIN_TONES), hair: '#101010', hairStyle: 'buzz', top: 'jacket', topColor: '#121416', topColor2: '#1a1c1e', bottom: 'cargo', bottomColor: '#121416',
        shoes: 'boots', shoeColor: '#0a0a0a', head: 'balaclava', headColor: '#0e0e10', hands: 'gloves', handColor: '#0a0a0a', extras: ['chestarmor', 'kneepads', 'belt'], extraColor: '#22262a', brow: 1, seed: 1400 + i }),
      { model: 'police02' });
  // ---------------- escaped test subjects: pale, shaved, barefoot, numbered
  for (let i = 0; i < 3; i++)
    add('agile', 'labsubject' + i, { height: rng.range(0.94, 1.0), bulk: 0.88, legs: 1.03 },
      o({ skin: rng.pick(['#e8dcd4', '#d8ccc4', '#c8bcb4']), hair: '#2a2420', hairStyle: 'bald', top: 'bare', topColor: '#cccccc', bottom: 'shorts', bottomColor: '#c8ccd0',
        shoes: 'barefoot', shoeColor: '#cccccc', head: 'none', tattoo: true, scar: rng.chance(0.6), brow: 1, eyes: '#5a6a3a', seed: 1500 + i }),
      { model: 'sports01', look: { skin: pale, bottom: tint('#c8ccd0', 0.8) } });
  // ---------------- what the lab grew
  for (let i = 0; i < 3; i++)
    add('bruiser', 'labmutant' + i, { height: rng.range(1.14, 1.2), bulk: 1.42, shoulders: 1.3, gut: rng.range(0.2, 0.6), headSize: 1.0, chestDepth: 1.18, hipsW: 1.12 },
      o({ skin: rng.pick(['#9aa890', '#8a9a8a', '#a8a0a8']), hair: '#1a1a1a', hairStyle: 'bald', top: 'bare', topColor: '#2a2a2a', bottom: 'shorts', bottomColor: '#8a8e94',
        shoes: 'barefoot', shoeColor: '#2a2a2a', hands: 'bare', tattoo: true, scar: true, extras: ['chain', 'bracers'], extraColor: '#6a6e74', brow: 1, eyes: '#8a2a1a', seed: 1600 + i }),
      { model: 'sports01', look: { skin: grey, bottom: tint('#8a8e94', 0.8), girth: 1.3 } });
  // ---------------- riot guards
  for (let i = 0; i < 3; i++)
    add('defender', 'labriot' + i, { height: rng.range(1.0, 1.05), bulk: 1.14, shoulders: 1.1 },
      o({ skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), hairStyle: 'buzz', top: 'longsleeve', topColor: '#1a2234', topColor2: '#c8a040', topPattern: 'uniform', bottom: 'cargo', bottomColor: '#14161c',
        shoes: 'boots', shoeColor: '#0a0a0c', head: 'helmet', headColor: '#141a26', hands: 'gloves', handColor: '#111111', extras: ['kneepads', 'shoulderpads', 'bracers', 'chestarmor'], extraColor: '#232a36', brow: 0.6, seed: 1700 + i }),
      { model: 'police02', look: { top: tint('#1a2234', 0.65), bottom: tint('#14161c', 0.5), girth: 1.06 } });
  // ---------------- black-ops fighters
  for (let i = 0; i < 3; i++)
    add('elite', 'labelite' + i, { height: rng.range(0.99, 1.04), bulk: 1.02 },
      o({ skin: rng.pick(SKIN_TONES), hair: '#101010', hairStyle: 'buzz', top: 'jacket', topColor: rng.pick(['#1a1e1a', '#14161a', '#1e1a14']), topColor2: '#2a2e2a', bottom: 'cargo', bottomColor: '#14161a',
        shoes: 'boots', shoeColor: '#0a0a0a', head: 'balaclava', headColor: '#121214', hands: 'gloves', handColor: '#0a0a0a', extras: ['bracers', 'belt'], extraColor: '#22262a', brow: 1, seed: 1800 + i }),
      { model: 'police02', look: { top: tint('#101012', 0.7) } });
  // ---------------- bosses
  add('warden', 'warden', { height: 1.12, bulk: 1.3, shoulders: 1.22, gut: 0.6, headSize: 1.03, chestDepth: 1.12, hipsW: 1.1 },
    o({ skin: '#c98e66', hair: '#6e6e6e', hairStyle: 'buzz', facial: 'mustache', top: 'longsleeve', topColor: '#141c30', topColor2: '#d8b040', topPattern: 'uniform', bottom: 'cargo', bottomColor: '#0e1018',
      shoes: 'boots', shoeColor: '#050505', hands: 'gloves', handColor: '#0a0a0a', head: 'cap', headColor: '#0a1020', extras: ['belt', 'chestarmor', 'shoulderpads'], extraColor: '#1a2030', scar: true, brow: 1, seed: 1900 }),
    { model: 'security01', look: { girth: 1.24, top: tint('#141c30', 0.5) } });
  add('subject', 'subject', { height: 1.3, bulk: 1.55, shoulders: 1.38, gut: 0.2, headSize: 0.96, chestDepth: 1.25, hipsW: 1.18, arms: 1.06 },
    o({ skin: '#b8c0c4', hair: '#101010', hairStyle: 'bald', top: 'bare', topColor: '#2a2a2a', bottom: 'shorts', bottomColor: '#7a8088', shoes: 'barefoot', shoeColor: '#2a2a2a',
      tattoo: true, scar: true, extras: ['chain', 'bracers'], extraColor: '#5a5e64', brow: 1, eyes: '#c8e830', seed: 1901 }),
    { model: 'sports01', look: { skin: tint('#b8c4c8', 0.7), bottom: tint('#7a8088', 0.8), girth: 1.4 } });
  return out;
}

