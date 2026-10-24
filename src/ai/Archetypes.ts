import type { Style } from '../characters/Appearance';
import type { CharacterStats } from '../characters/Character';

export type ArchetypeId =
  | 'patron'
  | 'woman'
  | 'biker'
  | 'bouncer'
  | 'bartender'
  | 'cook'
  | 'waitress'
  | 'drunk'
  | 'nerd'
  | 'brawler'
  | 'punk'
  | 'cowboy'
  | 'musician'
  | 'boss';

export interface Personality {
  /** how readily they start/join fights */
  aggression: number;
  /** resistance to fleeing */
  bravery: number;
  /** blocking, dodging, combos, attack speed */
  skill: number;
  /** joins fights to help friends */
  loyalty: number;
  /** prefers grabbing weapons */
  greed: number;
  /** likes throwing things */
  throwy: number;
}

export interface Archetype {
  id: ArchetypeId;
  label: string;
  style: Style;
  stats: Partial<CharacterStats>;
  p: Personality;
  startWeapon?: { id: string; chance: number }[];
  /** activity preference weights */
  likes: Partial<Record<'sit' | 'bar' | 'stand' | 'dance' | 'pool' | 'darts' | 'arcade' | 'watch' | 'wander' | 'jukebox' | 'piss' | 'vip', number>>;
  drunk?: number;
  /** unarmed move weights */
  moves: Record<string, number>;
  barks: string[];
  boss?: boolean;
}

const BASE_MOVES = { jabL: 3, crossR: 3, hookR: 2, hookL: 1.5, uppercutR: 1, haymaker: 0.8, kick: 0.8, shove: 0.6 };

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  patron: {
    id: 'patron',
    label: 'Patron',
    style: 'patron',
    stats: { maxHealth: 90, poise: 260, speed: 5.0, attackSpeed: 0.95, damageMul: 0.9 },
    p: { aggression: 0.4, bravery: 0.5, skill: 0.3, loyalty: 0.6, greed: 0.5, throwy: 0.4 },
    likes: { sit: 3, bar: 2, stand: 2, dance: 1.5, pool: 1, darts: 1, arcade: 0.8, watch: 1, wander: 0.5, jukebox: 0.3, piss: 0.4 },
    moves: BASE_MOVES,
    barks: ['HEY!', 'What the hell?!', 'You want some?!', 'Come on then!', 'Watch it, pal!'],
  },
  woman: {
    id: 'woman',
    label: 'Patron',
    style: 'woman',
    stats: { maxHealth: 80, poise: 220, speed: 5.2, attackSpeed: 1.05, damageMul: 0.8 },
    p: { aggression: 0.35, bravery: 0.45, skill: 0.4, loyalty: 0.7, greed: 0.6, throwy: 0.6 },
    likes: { sit: 3, bar: 2, stand: 2, dance: 3, pool: 0.5, darts: 0.8, watch: 1, jukebox: 0.6, piss: 0.3 },
    moves: { ...BASE_MOVES, kick: 1.5, haymaker: 0.3 },
    barks: ['Back off!', 'Creep!', 'Get him!', 'Ugh!'],
  },
  drunk: {
    id: 'drunk',
    label: 'Drunk',
    style: 'drunk',
    stats: { maxHealth: 110, poise: 190, speed: 3.8, walkSpeed: 1.0, attackSpeed: 0.8, damageMul: 1.0 },
    p: { aggression: 0.75, bravery: 0.95, skill: 0.08, loyalty: 0.3, greed: 0.8, throwy: 0.9 },
    likes: { bar: 4, sit: 2, dance: 1, stand: 1, wander: 1.5, piss: 1.5 },
    drunk: 0.8,
    moves: { ...BASE_MOVES, haymaker: 2.2, jabL: 1 },
    barks: ['*hic*', 'You lookin\' at me?!', 'I\'ll take ya all on!', 'Shhhut up!'],
  },
  nerd: {
    id: 'nerd',
    label: 'Accountant',
    style: 'nerd',
    stats: { maxHealth: 70, poise: 180, speed: 5.4, attackSpeed: 0.9, damageMul: 0.6 },
    p: { aggression: 0.08, bravery: 0.12, skill: 0.1, loyalty: 0.2, greed: 0.3, throwy: 0.5 },
    likes: { sit: 3, arcade: 3, stand: 1, darts: 1, watch: 1 },
    moves: { ...BASE_MOVES, shove: 2, haymaker: 0.2, kick: 0.2 },
    barks: ['Please, no!', 'I have a family!', 'Help!', 'Not the glasses!'],
  },
  biker: {
    id: 'biker',
    label: 'Biker',
    style: 'biker',
    stats: { maxHealth: 150, poise: 380, speed: 5.3, attackSpeed: 1.0, damageMul: 1.15 },
    p: { aggression: 0.85, bravery: 0.85, skill: 0.5, loyalty: 0.95, greed: 0.7, throwy: 0.5 },
    startWeapon: [
      { id: 'knife', chance: 0.12 },
      { id: 'chain', chance: 0.12 },
      { id: 'tire_iron', chance: 0.08 },
      { id: 'wrench', chance: 0.06 },
    ],
    likes: { bar: 3, pool: 3, sit: 2, darts: 1.5, stand: 2, watch: 1, piss: 0.5 },
    moves: { ...BASE_MOVES, haymaker: 1.4, kick: 1.2 },
    barks: ['You\'re dead!', 'Nobody touches my bike!', 'Get him, boys!', 'Big mistake!', 'I\'ll rip your head off!'],
  },
  brawler: {
    id: 'brawler',
    label: 'Brawler',
    style: 'brawler',
    stats: { maxHealth: 160, poise: 430, speed: 5.6, attackSpeed: 1.2, damageMul: 1.2 },
    p: { aggression: 0.9, bravery: 0.95, skill: 0.85, loyalty: 0.6, greed: 0.2, throwy: 0.2 },
    likes: { bar: 2, stand: 2, pool: 1.5, darts: 1, watch: 1.5 },
    moves: { jabL: 4, crossR: 3.5, hookR: 2.5, hookL: 2.5, uppercutR: 1.5, haymaker: 0.5, kick: 0.5, shove: 0.2 },
    barks: ['Put \'em up!', 'Let\'s dance!', 'That all you got?', 'Come here!'],
  },
  bouncer: {
    id: 'bouncer',
    label: 'Bouncer',
    style: 'bouncer',
    stats: { maxHealth: 260, poise: 720, speed: 4.9, attackSpeed: 0.85, damageMul: 1.55, armor: 0.12, mass: 120 },
    p: { aggression: 0.9, bravery: 1.0, skill: 0.6, loyalty: 1.0, greed: 0.1, throwy: 0.1 },
    likes: {},
    moves: { jabL: 1.5, crossR: 2.5, hookR: 2, uppercutR: 1.5, haymaker: 2, kick: 1.5, shove: 1.5 },
    barks: ['You\'re outta here!', 'Wrong bar, pal.', 'Time to go!', 'You\'re done!'],
  },
  bartender: {
    id: 'bartender',
    label: 'Bartender',
    style: 'bartender',
    stats: { maxHealth: 120, poise: 320, speed: 5.0, attackSpeed: 1.0, damageMul: 1.0 },
    p: { aggression: 0.6, bravery: 0.75, skill: 0.5, loyalty: 0.8, greed: 1.0, throwy: 0.9 },
    likes: {},
    moves: BASE_MOVES,
    barks: ['Not in my bar!', 'You\'re paying for that!', 'Somebody call the cops!', 'Out!'],
  },
  cook: {
    id: 'cook',
    label: 'Cook',
    style: 'cook',
    stats: { maxHealth: 130, poise: 340, speed: 4.6, attackSpeed: 0.95, damageMul: 1.1 },
    p: { aggression: 0.7, bravery: 0.8, skill: 0.4, loyalty: 0.5, greed: 1.0, throwy: 0.6 },
    startWeapon: [
      { id: 'cleaver', chance: 0.45 },
      { id: 'knife', chance: 0.35 },
    ],
    likes: {},
    moves: BASE_MOVES,
    barks: ['Get outta my kitchen!', 'I\'ll chop you up!', 'Fresh meat!'],
  },
  waitress: {
    id: 'waitress',
    label: 'Waitress',
    style: 'waitress',
    stats: { maxHealth: 90, poise: 230, speed: 5.4, attackSpeed: 1.05, damageMul: 0.85 },
    p: { aggression: 0.4, bravery: 0.4, skill: 0.4, loyalty: 0.6, greed: 0.8, throwy: 0.9 },
    likes: { stand: 2, bar: 2 },
    moves: { ...BASE_MOVES, kick: 1.4 },
    barks: ['Hey! Hands off!', 'Jerk!', 'I don\'t get paid enough for this!'],
  },
  punk: {
    id: 'punk',
    label: 'Punk',
    style: 'punk',
    stats: { maxHealth: 110, poise: 280, speed: 5.8, attackSpeed: 1.1, damageMul: 1.0 },
    p: { aggression: 0.9, bravery: 0.7, skill: 0.45, loyalty: 0.5, greed: 0.8, throwy: 0.8 },
    startWeapon: [{ id: 'chain', chance: 0.15 }],
    likes: { dance: 3, stand: 2, bar: 1.5, arcade: 1, watch: 1 },
    moves: { ...BASE_MOVES, kick: 1.8, shove: 1.2 },
    barks: ['Mosh pit!', 'Anarchy!', 'Smash it!', 'Woooo!'],
  },
  cowboy: {
    id: 'cowboy',
    label: 'Cowboy',
    style: 'cowboy',
    stats: { maxHealth: 130, poise: 340, speed: 5.0, attackSpeed: 1.0, damageMul: 1.05 },
    p: { aggression: 0.6, bravery: 0.75, skill: 0.55, loyalty: 0.7, greed: 0.5, throwy: 0.6 },
    likes: { bar: 3, sit: 2, pool: 2, darts: 2, stand: 1 },
    moves: { ...BASE_MOVES, haymaker: 1.4 },
    barks: ['Yeehaw!', 'Draw, partner!', 'This town ain\'t big enough!', 'Varmint!'],
  },
  musician: {
    id: 'musician',
    label: 'Musician',
    style: 'punk',
    stats: { maxHealth: 110, poise: 280, speed: 5.0, attackSpeed: 1.0, damageMul: 0.95 },
    p: { aggression: 0.55, bravery: 0.6, skill: 0.35, loyalty: 0.9, greed: 0.9, throwy: 0.5 },
    likes: {},
    moves: BASE_MOVES,
    barks: ['Hey, we\'re playing here!', 'Rock and roll!', 'That\'s my guitar!'],
  },
  boss: {
    id: 'boss',
    label: 'Big Earl',
    style: 'boss',
    stats: { maxHealth: 750, poise: 1500, speed: 4.6, attackSpeed: 0.9, damageMul: 2.0, armor: 0.25, mass: 160 },
    p: { aggression: 1, bravery: 1, skill: 0.7, loyalty: 1, greed: 1, throwy: 0.3 },
    likes: { vip: 1 },
    moves: { crossR: 2, hookR: 2, haymaker: 2.5, kick: 2, shove: 1.5, uppercutR: 1.5 },
    barks: ['WHO DARES?!', 'This is MY bar!', 'I\'m gonna enjoy this.', 'Come to papa!'],
    boss: true,
  },
};

/** Mix of regular patrons for the bar crowd. */
export const CROWD_MIX: [ArchetypeId, number][] = [
  ['patron', 6],
  ['woman', 3],
  ['biker', 4],
  ['drunk', 1.5],
  ['nerd', 1],
  ['brawler', 1.2],
  ['punk', 1.5],
  ['cowboy', 1.5],
];
