import { MoveDef, PLAYER_STRIKES } from './moves';

export type FighterId = 'jin' | 'scarlet';

/** A playable fighter: who they are, how they fight, how they sound. */
export interface FighterStyle {
  id: FighterId;
  name: string;
  /** One line under the name in the fighter select. */
  tag: string;
  /** A few words on what makes them different. */
  blurb: string;
  /** Character library variant. */
  variant: string;
  strikes: MoveDef[];
  /** Mid-range moves still thrown when the target is in close. */
  closeAlso: string[];
  finishers: string[];
  runSpeed: number;
  /** Multiplier on strike clip speed. */
  strikeSpeed: number;
  /** How often a strike gets a shout. */
  shout: number;
  voice: { attack: string; pain: string; death: string };
}

/**
 * Scarlet's kickboxing: fast hands that set up kicks - a backfist and a palm heel instead of
 * hooks and elbows, a snapping lead-leg kick, an axe kick, a spinning hook kick, a flying side
 * kick to close the distance. Her punches are lighter than Jin's; her kicks hit harder and reach.
 */
export const SCARLET_STRIKES: MoveDef[] = [
  { name: 'jab', clip: 'jab', kind: 'punch', region: 'head', reach: 0.92, damage: 7, strength: 0.32, bleed: 0.2, range: 'mid', weight: 0.8 },
  { name: 'backfist', clip: 's_backfist', kind: 'punch', region: 'head', reach: 0.95, damage: 8, strength: 0.4, bleed: 0.25, range: 'mid', weight: 1.1 },
  { name: 'cross', clip: 'cross', kind: 'punch', region: 'head', reach: 0.95, damage: 10, strength: 0.5, bleed: 0.3, range: 'mid', weight: 0.7 },
  { name: 'palm', clip: 's_palm', kind: 'palm', region: 'head', reach: 0.68, damage: 12, strength: 0.7, bleed: 0.45, range: 'close', weight: 1.0 },
  { name: 'knee', clip: 'knee', kind: 'knee', region: 'gut', reach: 0.5, damage: 14, strength: 0.8, bleed: 0.1, range: 'close', weight: 0.6, minCombo: 2 },
  { name: 'snapkick', clip: 's_snapkick', kind: 'kick', region: 'gut', reach: 1.05, damage: 12, strength: 0.75, bleed: 0.05, range: 'mid', weight: 1.4 },
  { name: 'roundhouse', clip: 'roundhouse', kind: 'kick', region: 'head', reach: 1.0, damage: 19, strength: 1.0, bleed: 0.6, range: 'mid', weight: 1.0, minCombo: 1 },
  { name: 'sidekick', clip: 'sidekick', kind: 'kick', region: 'chest', reach: 1.12, damage: 17, strength: 1.1, bleed: 0.1, range: 'mid', weight: 0.8, minCombo: 1, launch: 2.5 },
  { name: 'axekick', clip: 's_axekick', kind: 'kick', region: 'head', reach: 0.95, damage: 21, strength: 1.2, bleed: 0.7, range: 'mid', weight: 0.75, minCombo: 3 },
  { name: 'spinhook', clip: 's_spinhook', kind: 'kick', region: 'head', reach: 1.05, damage: 23, strength: 1.3, bleed: 0.7, range: 'mid', weight: 0.6, minCombo: 4, launch: 2.5 },
  { name: 'flykick', clip: 's_flykick', kind: 'kick', region: 'chest', reach: 1.1, damage: 18, strength: 1.2, bleed: 0.1, range: 'far', weight: 1, launch: 3.5 },
  { name: 'backkick', clip: 'backkick', kind: 'kick', region: 'gut', reach: 1.0, damage: 15, strength: 1.0, bleed: 0.05, range: 'back', weight: 1, launch: 2 },
];

export const STYLES: Record<FighterId, FighterStyle> = {
  jin: {
    id: 'jin',
    name: 'JIN',
    tag: 'MUAY THAI',
    blurb: 'Elbows, knees, heavy hands',
    variant: 'player',
    strikes: PLAYER_STRIKES,
    closeAlso: ['hook', 'cross'],
    finishers: ['fin_roundhouse', 'fin_armknee', 'fin_palm', 'fin_sweep', 'fin_flyknee'],
    runSpeed: 5.6,
    strikeSpeed: 1,
    shout: 0.25,
    voice: { attack: 'grunt_attack', pain: 'grunt_pain', death: 'death' },
  },
  scarlet: {
    id: 'scarlet',
    name: 'SCARLET',
    tag: 'KICKBOXING',
    blurb: 'Speed, reach, spinning kicks',
    variant: 'scarlet',
    strikes: SCARLET_STRIKES,
    closeAlso: ['backfist', 'cross', 'snapkick'],
    finishers: ['fin_axe', 'fin_heelspin', 'fin_roundhouse', 'fin_sweep', 'fin_flyknee'],
    runSpeed: 5.9,
    strikeSpeed: 1.08,
    shout: 0.3,
    voice: { attack: 'f_attack', pain: 'f_pain', death: 'f_death' },
  },
};

export const isFighterId = (s: string | null | undefined): s is FighterId => s === 'jin' || s === 'scarlet';
