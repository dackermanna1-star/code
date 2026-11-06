// Professions (chosen at new game) and skills.

export const SKILLS = {
  aiming: { name: 'Aiming', desc: 'Firearm accuracy, recoil control and reload speed.' },
  melee: { name: 'Melee', desc: 'Damage, swing speed and crit chance with melee weapons.' },
  strength: { name: 'Strength', desc: 'Carry weight, knockback and shove power.' },
  fitness: { name: 'Fitness', desc: 'Maximum stamina and stamina regeneration.' },
  sneaking: { name: 'Sneaking', desc: 'How much noise you make and how easily zombies spot you.' },
  firstAid: { name: 'First Aid', desc: 'Treatment speed and how fast wounds heal.' },
  maintenance: { name: 'Maintenance', desc: 'Weapon durability loss and repair efficiency.' },
  scavenging: { name: 'Scavenging', desc: 'Chance of finding extra and rarer loot. Foraging yields.' },
};
export const SKILL_IDS = Object.keys(SKILLS);
export const MAX_SKILL = 10;
/** XP required to go from `level` to `level + 1` */
export const xpForLevel = (level) => Math.round(60 * Math.pow(1.55, level));

export const PROFESSIONS = [
  {
    id: 'unemployed', name: 'Unemployed', desc: 'No special training, but you learn fast when your life depends on it.',
    perks: ['+25% XP gain for all skills'], skills: {}, xpMult: 1.25,
    startItems: [],
  },
  {
    id: 'police', name: 'Police Officer', desc: 'Millbrook PD. You know your way around a firearm.',
    perks: ['Aiming +3', 'Starts with a police baton', 'Knows the police station layout'],
    skills: { aiming: 3, strength: 1 }, startItems: [['police_baton', 1]],
  },
  {
    id: 'firefighter', name: 'Firefighter', desc: 'Strong, fit and used to chaos.',
    perks: ['Fitness +2', 'Strength +2', 'Axe damage +20%'],
    skills: { fitness: 2, strength: 2 }, startItems: [], bonus: { axeDamage: 1.2 },
  },
  {
    id: 'nurse', name: 'Nurse', desc: 'County General ER. Wounds heal faster in your hands.',
    perks: ['First Aid +4', 'Starts with bandages and painkillers', 'Wounds heal 30% faster'],
    skills: { firstAid: 4 }, startItems: [['bandage', 3], ['painkillers', 1]], bonus: { healRate: 1.3 },
  },
  {
    id: 'veteran', name: 'Veteran', desc: 'Two tours overseas. Nothing scares you anymore.',
    perks: ['Aiming +2', 'Melee +1', 'Immune to panic'],
    skills: { aiming: 2, melee: 1 }, startItems: [], bonus: { noPanic: true },
  },
  {
    id: 'carpenter', name: 'Carpenter', desc: 'You build things. You can also fix them.',
    perks: ['Maintenance +3', 'Starts with a hammer and nails', 'Barricades are 50% stronger'],
    skills: { maintenance: 3, strength: 1 }, startItems: [['hammer', 1], ['nails', 12]], bonus: { barricade: 1.5 },
  },
  {
    id: 'burglar', name: 'Burglar', desc: 'Quiet hands, quick feet. Locks are a suggestion.',
    perks: ['Sneaking +3', 'Scavenging +2', 'Picks locks without tools'],
    skills: { sneaking: 3, scavenging: 2 }, startItems: [['lockpick', 2]], bonus: { lockpick: true },
  },
  {
    id: 'ranger', name: 'Park Ranger', desc: 'You know these woods. Cold and hunger bother you less.',
    perks: ['Scavenging +2', 'Fitness +1', '-30% hunger and cold'],
    skills: { scavenging: 2, fitness: 1 }, startItems: [['hunting_knife', 1]], bonus: { hunger: 0.7, cold: 0.7 },
  },
];

export function getProfession(id) {
  return PROFESSIONS.find((p) => p.id === id) || PROFESSIONS[0];
}
