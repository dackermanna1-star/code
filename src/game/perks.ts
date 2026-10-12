// Perk definitions (Holy Mountain altar rewards). Effects are applied by Progression/Run.
export interface PerkDef {
  id: string;
  name: string;
  description: string;
  stackable: boolean;
  weight: number;
}

export const PERKS: PerkDef[] = [
  { id: 'CRITICAL_HIT', name: 'Critical Hit +', description: '+10% critical hit chance for all spells.', stackable: true, weight: 1 },
  { id: 'EXTRA_HP', name: 'Extra Health', description: 'Max HP +50%, current HP rises with it.', stackable: true, weight: 1.2 },
  { id: 'EXTRA_LIFE', name: 'Extra Life', description: 'When you die, you return with 100 HP once.', stackable: true, weight: 0.4 },
  { id: 'SAVING_GRACE', name: 'Saving Grace', description: 'A lethal hit leaves you at 1 HP if you had more.', stackable: false, weight: 0.8 },
  { id: 'STAINLESS_ARMOUR', name: 'Stainless Armour', description: '50% less damage taken while you have no stains.', stackable: false, weight: 0.8 },
  { id: 'PROTECTION_FIRE', name: 'Fire Immunity', description: 'You are immune to fire damage.', stackable: false, weight: 0.8 },
  { id: 'PROTECTION_EXPLOSION', name: 'Explosion Immunity', description: 'You are immune to explosions.', stackable: false, weight: 0.6 },
  { id: 'PROTECTION_RADIOACTIVITY', name: 'Toxic Immunity', description: 'Toxic sludge and toxic gas cannot hurt you.', stackable: false, weight: 0.8 },
  { id: 'PROTECTION_ELECTRICITY', name: 'Electricity Immunity', description: 'You are immune to electricity.', stackable: false, weight: 0.7 },
  { id: 'PROTECTION_MELEE', name: 'Melee Immunity', description: 'Melee attacks cannot harm you.', stackable: false, weight: 0.6 },
  { id: 'FASTER_LEVITATION', name: 'Faster Levitation', description: 'Levitate 75% faster.', stackable: true, weight: 1 },
  { id: 'STRONG_LEVITATION', name: 'Strong Levitation', description: 'Double levitation time, slower refill.', stackable: false, weight: 1 },
  { id: 'MOVEMENT_FASTER', name: 'Faster Movement', description: 'Move about 40% faster.', stackable: true, weight: 1 },
  { id: 'BREATH_UNDERWATER', name: 'Breathless', description: 'You no longer need to breathe.', stackable: false, weight: 0.8 },
  { id: 'REPELLING_CAPE', name: 'Repelling Cape', description: 'Stains drop off quickly.', stackable: false, weight: 0.7 },
  { id: 'GOLD_IS_FOREVER', name: 'Gold is Forever', description: 'Gold nuggets never disappear.', stackable: false, weight: 0.9 },
  { id: 'ATTRACT_GOLD', name: 'Attract Gold', description: 'Gold nuggets fly to you.', stackable: false, weight: 0.9 },
  { id: 'VAMPIRISM', name: 'Vampirism', description: 'Max HP -25%, but drinking blood heals you.', stackable: false, weight: 0.5 },
  { id: 'GLASS_CANNON', name: 'Glass Cannon', description: 'Your spells deal 5x damage; max HP capped at 50.', stackable: false, weight: 0.4 },
  { id: 'HOMING_SHOT', name: 'Homing Shots', description: 'All your projectiles home in weakly.', stackable: false, weight: 0.6 },
  { id: 'UNLIMITED_SPELLS', name: 'Unlimited Spells', description: 'Limited-use spells become unlimited.', stackable: false, weight: 0.5 },
  { id: 'NO_MORE_SHUFFLE', name: 'No More Shuffle', description: 'Your wands no longer shuffle.', stackable: false, weight: 0.6 },
  { id: 'EDIT_WANDS_EVERYWHERE', name: 'Tinker with Wands Everywhere', description: 'Edit wands anywhere.', stackable: false, weight: 0.8 },
  { id: 'EXTRA_PERK', name: 'Extra Perk', description: 'One more perk at every Holy Mountain.', stackable: true, weight: 0.5 },
  { id: 'EXTRA_SHOP_ITEM', name: 'Extra Item in Holy Mountain', description: 'One more shop item at every Holy Mountain.', stackable: true, weight: 0.5 },
  { id: 'PEACE_WITH_GODS', name: 'Peace with the Gods', description: 'The gods forgive your sins.', stackable: false, weight: 0.4 },
  { id: 'EXPLODING_CORPSES', name: 'Exploding Corpses', description: 'Enemies explode on death. You become immune to explosions.', stackable: false, weight: 0.5 },
  { id: 'FREEZE_FIELD', name: 'Freeze Field', description: 'Liquids near you freeze. Fire immunity.', stackable: false, weight: 0.5 },
  { id: 'OIL_BLOOD', name: 'Oil Blood', description: 'You bleed oil. Fire immunity.', stackable: false, weight: 0.5 },
  { id: 'LEGGY_FEET', name: 'Never Skip Leg Day', description: 'Your kicks deal +60 damage.', stackable: false, weight: 0.6 },
];

export const PERK_BY_ID: Record<string, PerkDef> = Object.fromEntries(PERKS.map((p) => [p.id, p]));
