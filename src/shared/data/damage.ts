/** Damage types. Structures, armor and creatures resist each differently. */
export type DamageType =
  | 'melee' | 'bullet' | 'arrow' | 'explosive' | 'fall' | 'hunger' | 'thirst'
  | 'cold' | 'heat' | 'bleed' | 'radiation' | 'decay' | 'animal' | 'drown' | 'suicide';

export const DAMAGE_TYPES: DamageType[] = [
  'melee', 'bullet', 'arrow', 'explosive', 'fall', 'hunger', 'thirst', 'cold', 'heat',
  'bleed', 'radiation', 'decay', 'animal', 'drown', 'suicide',
];

/** Hit zones for player/creature hitboxes. */
export type HitZone = 'head' | 'body' | 'legs';
export const ZONE_MULT: Record<HitZone, number> = { head: 1.8, body: 1.0, legs: 0.75 };
