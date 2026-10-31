import { CharacterLibrary } from './library';
import { defaultOutfit, HAIR_COLORS, Outfit, SKIN_TONES } from './outfit';
import { BodySpec } from '../anim/skeleton';
import { RNG } from '../core/math';

export type Archetype = 'player' | 'brawler' | 'knife' | 'club' | 'sword' | 'agile' | 'bruiser' | 'defender' | 'elite' | 'butcher' | 'viper' | 'master';

const o = (over: Partial<Outfit>): Outfit => ({ ...defaultOutfit(), ...over });

/** Register all character variants. Returns map archetype -> variant names. */
export function registerVariants(lib: CharacterLibrary): Record<Archetype, string[]> {
  const out = {} as Record<Archetype, string[]>;
  const add = (arch: Archetype, name: string, spec: Partial<BodySpec>, outfit: Outfit) => {
    lib.add(name, spec, outfit);
    (out[arch] ??= []).push(name);
  };
  const rng = new RNG(4242);

  // ---------------- player: lean martial artist
  add('player', 'player', { height: 1.0, bulk: 1.02, shoulders: 1.04, arms: 1.0 },
    o({ skin: '#c99272', hair: '#121010', hairStyle: 'topknot', facial: 'stubble', top: 'tank', topColor: '#1b1b1f', topColor2: '#7a1515',
      bottom: 'gi', bottomColor: '#1c1c22', shoes: 'wraps', hands: 'wraps', head: 'headband', headColor: '#8a1414', extras: ['sash'], extraColor: '#8a1414', scar: true, brow: 0.8, seed: 7 }));

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
        headColor: rng.pick(['#202020', '#6a1a1a', '#1a3a6a', '#4a4a4a']), tattoo: rng.chance(0.4), brow: rng.range(0.4, 1), seed: 100 + i }));
  }
  // ---------------- knife: red bandanas, lean
  for (let i = 0; i < 3; i++)
    add('knife', 'knife' + i, { height: rng.range(0.95, 1.02), bulk: 0.95 },
      o({ skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), hairStyle: rng.pick(['short', 'slick', 'ponytail'] as const), facial: rng.pick(['stubble', 'goatee', 'none'] as const),
        top: rng.pick(['vest', 'tank', 'tshirt'] as const), topColor: rng.pick(['#3a1a1a', '#202020', '#4a2a2a']), topColor2: '#a02020', bottom: 'jeans', bottomColor: '#202530',
        shoes: 'boots', shoeColor: '#2a2018', head: 'bandana', headColor: '#a01818', tattoo: true, brow: 0.9, seed: 200 + i }));
  // ---------------- club: workers
  for (let i = 0; i < 3; i++)
    add('club', 'club' + i, { height: rng.range(0.98, 1.05), bulk: 1.08, gut: 0.5 },
      o({ skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), hairStyle: rng.pick(['buzz', 'bald', 'short'] as const), facial: rng.pick(['beard', 'stubble'] as const),
        top: rng.pick(['longsleeve', 'tshirt', 'jacket'] as const), topColor: rng.pick(['#5a4a2a', '#6a5a3a', '#3a4a5a']), topColor2: '#c09030', topPattern: rng.pick(['flannel', 'plain'] as const),
        bottom: 'cargo', bottomColor: '#3a3a30', shoes: 'boots', shoeColor: '#3a2a1a', head: rng.pick(['cap', 'beanie', 'none'] as const), headColor: '#c08020', brow: 0.7, seed: 300 + i }));
  // ---------------- sword: masked gang enforcers
  for (let i = 0; i < 2; i++)
    add('sword', 'sword' + i, { height: 1.01, bulk: 1.0 },
      o({ skin: rng.pick(SKIN_TONES), hair: '#101010', hairStyle: 'slick', top: 'jacket', topColor: '#141418', topColor2: '#6a1010', bottom: 'jeans', bottomColor: '#141418',
        shoes: 'boots', shoeColor: '#101010', head: 'mask', headColor: '#e0e0d8', extras: ['belt'], brow: 1, seed: 400 + i }));
  // ---------------- agile: track suits, slim
  for (let i = 0; i < 3; i++)
    add('agile', 'agile' + i, { height: rng.range(0.94, 1.0), bulk: 0.9, legs: 1.03 },
      o({ skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), hairStyle: rng.pick(['mohawk', 'short', 'buzz'] as const), top: 'tracktop', topColor: rng.pick(['#1a3a8a', '#1a6a3a', '#5a1a6a']),
        topColor2: '#e0e0e0', bottom: 'track', bottomColor: rng.pick(['#1a2a5a', '#103a20', '#3a1040']), shoes: 'sneakers', shoeColor: '#f0f0f0', brow: 0.7, seed: 500 + i }));
  // ---------------- bruiser: big shirtless / vests
  for (let i = 0; i < 3; i++)
    add('bruiser', 'bruiser' + i, { height: rng.range(1.12, 1.18), bulk: 1.38, shoulders: 1.25, gut: rng.range(0.4, 1.0), headSize: 1.04, chestDepth: 1.15, hipsW: 1.15 },
      o({ skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), hairStyle: rng.pick(['bald', 'buzz', 'mohawk'] as const), facial: rng.pick(['beard', 'goatee', 'stubble'] as const),
        top: rng.pick(['bare', 'vest', 'tank'] as const), topColor: '#2a2a2a', bottom: rng.pick(['cargo', 'jeans'] as const), bottomColor: rng.pick(['#3a3a2a', '#2a2a3a']),
        shoes: 'boots', shoeColor: '#1a1a1a', hands: 'fingerless', handColor: '#202020', tattoo: true, extras: ['chain'], extraColor: '#c0c0c0', brow: 1, seed: 600 + i }));
  // ---------------- defenders: padded, arm guards
  for (let i = 0; i < 3; i++)
    add('defender', 'defender' + i, { height: rng.range(1.0, 1.05), bulk: 1.12, shoulders: 1.1 },
      o({ skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), hairStyle: 'buzz', top: 'longsleeve', topColor: rng.pick(['#30343a', '#2a3020']), topColor2: '#505050',
        bottom: 'cargo', bottomColor: '#25282c', shoes: 'boots', shoeColor: '#111111', head: rng.pick(['helmet', 'balaclava'] as const), headColor: '#1a1c1e', hands: 'gloves', handColor: '#151515',
        extras: ['kneepads', 'shoulderpads', 'bracers', 'chestarmor'], extraColor: '#3a3e44', brow: 0.6, seed: 700 + i }));
  // ---------------- elite martial artists: dark gi
  for (let i = 0; i < 3; i++)
    add('elite', 'elite' + i, { height: rng.range(0.98, 1.03), bulk: 1.02 },
      o({ skin: rng.pick(SKIN_TONES), hair: '#101010', hairStyle: rng.pick(['topknot', 'ponytail', 'buzz'] as const), facial: rng.pick(['none', 'goatee', 'mustache'] as const),
        top: 'gi', topColor: rng.pick(['#20202a', '#2a1414', '#14202a']), topColor2: '#101010', bottom: 'gi', bottomColor: '#18181e', shoes: 'slippers', shoeColor: '#101010',
        hands: 'wraps', head: rng.pick(['headband', 'none'] as const), headColor: '#d0d0d0', extras: ['bracers'], extraColor: '#30202a', brow: 0.9, seed: 800 + i }));
  // ---------------- bosses
  add('butcher', 'butcher', { height: 1.2, bulk: 1.45, shoulders: 1.3, gut: 1.2, headSize: 1.06, chestDepth: 1.2, hipsW: 1.2 },
    o({ skin: '#d9a07a', hair: '#3a2a1e', hairStyle: 'bald', facial: 'beard', top: 'tank', topColor: '#d8d0c0', bottom: 'cargo', bottomColor: '#3a3428',
      shoes: 'boots', shoeColor: '#1a1410', hands: 'gloves', handColor: '#3a2a20', head: 'none', extras: ['belt', 'chain'], extraColor: '#5a4a3a', scar: true, tattoo: true, brow: 1, seed: 900 }));
  add('viper', 'viper', { height: 0.98, bulk: 0.92, legs: 1.04 },
    o({ skin: '#e0ac85', hair: '#0e0e0e', hairStyle: 'ponytail', top: 'longsleeve', topColor: '#0e1a12', topColor2: '#2a8a3a', topPattern: 'panel', bottom: 'track', bottomColor: '#0e1a12',
      shoes: 'slippers', shoeColor: '#0a0a0a', hands: 'gloves', handColor: '#0a0a0a', head: 'mask', headColor: '#1a4a2a', extras: ['bracers', 'belt'], extraColor: '#2a6a3a', brow: 1, seed: 901 }));
  add('master', 'master', { height: 1.03, bulk: 1.1, shoulders: 1.08 },
    o({ skin: '#a8714d', hair: '#d8d8d8', hairStyle: 'topknot', facial: 'beard', top: 'gi', topColor: '#5a0e0e', topColor2: '#d0b060', bottom: 'gi', bottomColor: '#140a0a',
      shoes: 'slippers', shoeColor: '#0a0a0a', hands: 'wraps', head: 'none', extras: ['bracers', 'shoulderpads'], extraColor: '#d0b060', scar: true, brow: 1, seed: 902 }));
  return out;
}
