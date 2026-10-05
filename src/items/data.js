// Item database: weapons (with movesets), armor, trinkets, affixes, uniques, relics, consumables,
// abilities and level-up boons.

export const RARITY = [
  { name: 'Common', color: '#c9c4bb', mult: 1.0, affixes: [0, 1] },
  { name: 'Uncommon', color: '#62d96b', mult: 1.12, affixes: [1, 1] },
  { name: 'Rare', color: '#4fa3ff', mult: 1.25, affixes: [2, 2] },
  { name: 'Epic', color: '#c06bff', mult: 1.4, affixes: [3, 3] },
  { name: 'Legendary', color: '#ffa53a', mult: 1.6, affixes: [2, 3] },
];

// Swing definition: arc angles in degrees within a plane rolled by `roll` (0 = horizontal,
// 90 = vertical/overhead). Positive angles are to the player's right.
// t: [windup, active, recover] seconds at speed 1.
const S = (from, to, roll, t, mult = 1, extra = {}) => ({ kind: 'slash', from, to, roll, t, mult, ...extra });
const T = (t, mult = 1, extra = {}) => ({ kind: 'thrust', t, mult, ...extra });

export const WEAPONS = {
  sword: {
    name: 'Sword', names: ['Sword', 'Blade', 'Longsword', 'Arming Sword'], dmg: 14, speed: 1.0, reach: 2.55, knock: 4.5, stagger: 20,
    crit: 0.06, stamina: 9, cleave: 2, model: 'sword', weight: 1,
    combo: [S(65, -70, 18, [0.11, 0.14, 0.2]), S(-65, 70, -14, [0.1, 0.14, 0.2]), S(55, -35, 84, [0.15, 0.16, 0.26], 1.35, { overhead: true })],
    heavy: S(60, -40, 80, [0.0, 0.17, 0.34], 2.4, { overhead: true }),
    desc: 'Balanced and reliable. Three-hit combo ending in an overhead chop.',
  },
  dagger: {
    name: 'Dagger', names: ['Dagger', 'Knife', 'Dirk', 'Stiletto'], dmg: 8, speed: 1.55, reach: 2.1, knock: 2.2, stagger: 9,
    crit: 0.16, critMult: 0.5, stamina: 5, cleave: 1, model: 'dagger', weight: 0.5, backstab: 2.0,
    combo: [T([0.06, 0.09, 0.13]), S(50, -50, 10, [0.07, 0.1, 0.14]), T([0.06, 0.09, 0.13], 1.15), S(-50, 55, -20, [0.07, 0.1, 0.16], 1.25)],
    heavy: T([0.0, 0.14, 0.3], 2.8, { lunge: 5 }),
    desc: 'Lightning fast with high critical chance. Strikes from behind deal double damage.',
  },
  axe: {
    name: 'Axe', names: ['Axe', 'Hatchet', 'Cleaver', 'Bearded Axe'], dmg: 20, speed: 0.82, reach: 2.45, knock: 5.5, stagger: 28,
    crit: 0.06, stamina: 12, cleave: 2, model: 'axe', weight: 1.5, bleed: 0.25, dismember: 1.5,
    combo: [S(70, -75, 28, [0.15, 0.15, 0.26]), S(55, -40, 88, [0.17, 0.16, 0.3], 1.3, { overhead: true })],
    heavy: S(80, -85, 5, [0.0, 0.2, 0.38], 2.5),
    desc: 'Heavy chops that cause bleeding and sever limbs with ease.',
  },
  mace: {
    name: 'Mace', names: ['Mace', 'Morning Star', 'Flanged Mace', 'Cudgel'], dmg: 17, speed: 0.8, reach: 2.35, knock: 9, stagger: 42,
    crit: 0.04, stamina: 12, cleave: 2, model: 'mace', weight: 1.6, crushing: 1.5,
    combo: [S(60, -70, 25, [0.15, 0.15, 0.26]), S(-60, 70, -20, [0.15, 0.15, 0.26]), S(55, -40, 88, [0.18, 0.17, 0.32], 1.4, { overhead: true })],
    heavy: S(62, -45, 88, [0.0, 0.2, 0.4], 2.6, { overhead: true, slam: 3 }),
    desc: 'Crushing blows that stagger and launch. Extra damage to skeletons and armor.',
  },
  spear: {
    name: 'Spear', names: ['Spear', 'Pike', 'Partisan', 'Glaive'], dmg: 13, speed: 1.05, reach: 3.5, knock: 5, stagger: 16,
    crit: 0.08, stamina: 9, cleave: 3, model: 'spear', weight: 1.2, pierce: true,
    combo: [T([0.09, 0.12, 0.18]), T([0.08, 0.12, 0.18], 1.1), S(55, -55, 8, [0.14, 0.16, 0.26], 1.2)],
    heavy: T([0.0, 0.18, 0.34], 2.5, { lunge: 7 }),
    desc: 'Long reach. Thrusts pierce through every enemy in a line.',
  },
  greatsword: {
    name: 'Greatsword', names: ['Greatsword', 'Zweihander', 'Claymore', 'Executioner'], dmg: 27, speed: 0.62, reach: 3.0, knock: 8, stagger: 38,
    crit: 0.05, stamina: 17, cleave: 6, model: 'greatsword', weight: 2.2,
    combo: [S(85, -90, 10, [0.2, 0.2, 0.34]), S(-85, 90, -10, [0.18, 0.2, 0.34]), S(60, -40, 85, [0.22, 0.2, 0.4], 1.45, { overhead: true })],
    heavy: S(100, -100, 4, [0.0, 0.26, 0.44], 2.3),
    desc: 'Enormous sweeping arcs that cleave through whole crowds.',
  },
  hammer: {
    name: 'Warhammer', names: ['Warhammer', 'Maul', 'Sledge', 'Great Maul'], dmg: 31, speed: 0.55, reach: 2.7, knock: 14, stagger: 65,
    crit: 0.03, stamina: 19, cleave: 3, model: 'hammer', weight: 2.6, crushing: 1.5,
    combo: [S(70, -75, 22, [0.22, 0.2, 0.36]), S(60, -45, 89, [0.26, 0.2, 0.42], 1.4, { overhead: true, slam: 2.5 })],
    heavy: S(65, -48, 89, [0.0, 0.24, 0.5], 2.4, { overhead: true, slam: 4.5 }),
    desc: 'Slow, devastating, and sends enemies flying. Overheads shake the ground.',
  },
};

// Affixes apply to weapons (w), armor (a), trinkets (t). v: [min, max] rolled value.
export const AFFIXES = {
  sharp: { name: 'Sharp', slots: 'w', v: [0.1, 0.25], stat: 'damage', fmt: (v) => `+${pct(v)} damage` },
  swift: { name: 'Swift', slots: 'wt', v: [0.08, 0.18], stat: 'attackSpeed', fmt: (v) => `+${pct(v)} attack speed` },
  keen: { name: 'Keen', slots: 'wt', v: [0.05, 0.12], stat: 'crit', fmt: (v) => `+${pct(v)} critical chance` },
  brutal: { name: 'Brutal', slots: 'wt', v: [0.3, 0.6], stat: 'critDamage', fmt: (v) => `+${pct(v)} critical damage` },
  heavy: { name: 'Crushing', slots: 'w', v: [0.35, 0.7], stat: 'knockback', fmt: (v) => `+${pct(v)} knockback & stagger` },
  vampiric: { name: 'Vampiric', slots: 'wt', v: [0.03, 0.06], stat: 'lifesteal', fmt: (v) => `${pct(v)} life steal` },
  flaming: { name: 'Flaming', slots: 'w', v: [0.2, 0.35], stat: 'burn', elem: 'fire', fmt: (v) => `${pct(v)} chance to ignite` },
  frost: { name: 'Frostbitten', slots: 'w', v: [0.25, 0.4], stat: 'chill', elem: 'frost', fmt: (v) => `${pct(v)} chance to chill` },
  shocking: { name: 'Thundering', slots: 'w', v: [0.12, 0.22], stat: 'shock', elem: 'shock', fmt: (v) => `${pct(v)} chance to chain lightning` },
  venomous: { name: 'Venomous', slots: 'w', v: [0.3, 0.5], stat: 'poison', elem: 'poison', fmt: (v) => `${pct(v)} chance to poison` },
  serrated: { name: 'Serrated', slots: 'w', v: [0.25, 0.4], stat: 'bleed', fmt: (v) => `${pct(v)} chance to bleed` },
  executioner: { name: "Executioner's", slots: 'w', v: [0.4, 0.7], stat: 'execute', fmt: (v) => `+${pct(v)} damage to wounded foes` },
  reaping: { name: 'Reaping', slots: 'wt', v: [2, 4], stat: 'healOnKill', int: true, fmt: (v) => `Heal ${v} on kill` },
  echo: { name: 'Echoing', slots: 'w', v: [1, 1], stat: 'echoWave', fmt: () => 'Heavy attacks release a slashing wave' },
  giant: { name: 'Giant', slots: 'w', v: [0.4, 0.6], stat: 'reach', fmt: (v) => `+${v.toFixed(1)}m reach` },
  vigor: { name: 'Vigorous', slots: 'at', v: [12, 25], stat: 'maxHp', int: true, fmt: (v) => `+${v} max health` },
  thorns: { name: 'Thorned', slots: 'a', v: [0.2, 0.45], stat: 'thorns', fmt: (v) => `Reflect ${pct(v)} melee damage` },
  enduring: { name: 'Enduring', slots: 'at', v: [0.2, 0.4], stat: 'staminaRegen', fmt: (v) => `+${pct(v)} stamina regen` },
  fleet: { name: 'Fleet', slots: 'at', v: [0.06, 0.12], stat: 'moveSpeed', fmt: (v) => `+${pct(v)} move speed` },
  stalwart: { name: 'Stalwart', slots: 'a', v: [0.15, 0.3], stat: 'blockEff', fmt: (v) => `Blocking costs ${pct(v)} less stamina` },
  warded: { name: 'Warded', slots: 'at', v: [0.04, 0.08], stat: 'armor', fmt: (v) => `+${pct(v)} damage reduction` },
  regen: { name: 'Regenerating', slots: 'at', v: [0.6, 1.2], stat: 'regen', fmt: (v) => `Regenerate ${v.toFixed(1)} HP/s` },
  lucky: { name: 'Lucky', slots: 't', v: [0.15, 0.3], stat: 'luck', fmt: (v) => `+${pct(v)} luck` },
  greedy: { name: 'Gilded', slots: 't', v: [0.2, 0.4], stat: 'goldFind', fmt: (v) => `+${pct(v)} gold found` },
  parrying: { name: "Duelist's", slots: 'wt', v: [0.3, 0.6], stat: 'parryWindow', fmt: (v) => `+${pct(v)} parry window` },
  kicking: { name: 'Bruiser', slots: 'at', v: [0.5, 1.0], stat: 'kickPower', fmt: (v) => `+${pct(v)} kick power` },
};

export function pct(v) {
  return `${Math.round(v * 100)}%`;
}

export const UNIQUES = {
  emberbrand: { base: 'sword', name: 'Emberbrand', affixes: ['flaming', 'sharp'], fx: 'fire', special: 'Every hit ignites. Heavy attacks erupt in a cone of flame.', on: { burnAlways: true, heavyFlame: true } },
  widowmaker: { base: 'dagger', name: 'Widowmaker', affixes: ['keen', 'brutal'], fx: 'shadow', special: 'Always crits staggered or burning enemies. Kills grant 2s of haste.', on: { critVulnerable: true, killHaste: true } },
  skullsplitter: { base: 'axe', name: 'Skullsplitter', affixes: ['serrated', 'reaping'], fx: 'blood', special: 'Killing blows always decapitate and restore 5 health.', on: { decap: true, killHeal: 5 } },
  thunderfall: { base: 'hammer', name: 'Thunderfall', affixes: ['shocking', 'heavy'], fx: 'shock', special: 'Heavy slams call lightning down on every nearby enemy.', on: { slamLightning: true } },
  frostfang: { base: 'spear', name: 'Frostfang', affixes: ['frost', 'swift'], fx: 'frost', special: 'Frozen enemies shatter on death, spraying ice shards.', on: { shatter: true, chillAlways: true } },
  bloodreaver: { base: 'greatsword', name: 'Bloodreaver', affixes: ['vampiric', 'brutal'], fx: 'blood', special: 'Deals up to +60% damage as your health drops.', on: { lowHpDamage: 0.6 } },
  gravecaller: { base: 'mace', name: 'Gravecaller', affixes: ['heavy', 'venomous'], fx: 'poison', special: 'Slain enemies burst in a cloud of bone shrapnel.', on: { corpseBurst: 1 } },
};

export const ARMORS = {
  rags: { name: 'Tattered Rags', armor: 0.0, speed: 0.04, regen: 0, tier: 0 },
  leather: { name: 'Leather Jerkin', armor: 0.08, speed: 0, tier: 0 },
  studded: { name: 'Studded Leather', armor: 0.12, speed: 0, tier: 1 },
  chain: { name: 'Chainmail', armor: 0.17, speed: -0.03, tier: 1 },
  scale: { name: 'Scale Hauberk', armor: 0.21, speed: -0.05, tier: 2 },
  plate: { name: 'Plate Armor', armor: 0.27, speed: -0.08, staminaRegen: -0.1, tier: 2 },
  robe: { name: 'Mystic Robe', armor: 0.05, speed: 0.03, cooldown: 0.2, tier: 1 },
};

export const TRINKETS = {
  ring: { name: 'Ring' },
  amulet: { name: 'Amulet' },
  charm: { name: 'Charm' },
};

// Relics: passive, stacking run-long items. Effects are read by the stat system & combat hooks.
export const RELICS = {
  whetstone: { name: 'Whetstone', icon: '◆', rarity: 0, desc: '+12% damage', stats: { damage: 0.12 } },
  featherboots: { name: 'Feathered Boots', icon: '≫', rarity: 0, desc: '+12% movement speed', stats: { moveSpeed: 0.12 } },
  giantsbelt: { name: "Giant's Belt", icon: '♥', rarity: 0, desc: '+30 max health', stats: { maxHp: 30 } },
  toughskin: { name: 'Toughened Hide', icon: '⛨', rarity: 0, desc: '+6% damage reduction', stats: { armor: 0.06 } },
  secondwind: { name: 'Second Wind', icon: '≈', rarity: 0, desc: '+40% stamina regeneration', stats: { staminaRegen: 0.4 } },
  magnet: { name: 'Lodestone', icon: '⊕', rarity: 0, desc: 'Double pickup radius, +15% gold', stats: { magnet: 1, goldFind: 0.15 } },
  leech: { name: 'Leech Jar', icon: '⚗', rarity: 0, desc: 'Potions heal 50% more', stats: { potionPower: 0.5 } },
  bombbag: { name: 'Bomb Satchel', icon: '●', rarity: 0, desc: '+3 bombs. Clearing a room grants a bomb.', stats: { bombRegen: 1 }, onPickup: (p) => p.addBombs(3) },
  hourglass: { name: 'Cracked Hourglass', icon: '⧗', rarity: 1, desc: 'Parry window +60%, parries slow time longer', stats: { parryWindow: 0.6, parrySlow: 1 } },
  vampfang: { name: 'Vampire Fang', icon: '✜', rarity: 1, desc: '3% life steal', stats: { lifesteal: 0.03 } },
  emberheart: { name: 'Ember Heart', icon: '✹', rarity: 1, desc: '15% chance to ignite on hit', stats: { burn: 0.15 } },
  frostsigil: { name: 'Frost Sigil', icon: '❄', rarity: 1, desc: '20% chance to chill on hit', stats: { chill: 0.2 } },
  venomgland: { name: 'Venom Gland', icon: '☣', rarity: 1, desc: '25% chance to poison on hit', stats: { poison: 0.25 } },
  thornmail: { name: 'Thorned Pauldron', icon: '✶', rarity: 1, desc: 'Reflect 35% of melee damage taken', stats: { thorns: 0.35 } },
  glassshard: { name: 'Glass Shard', icon: '◇', rarity: 1, desc: '+40% critical damage', stats: { critDamage: 0.4 } },
  luckycoin: { name: 'Lucky Coin', icon: '¤', rarity: 1, desc: '+25% luck: better loot', stats: { luck: 0.25 } },
  ironboot: { name: 'Iron Boot', icon: '▼', rarity: 1, desc: 'Kicks deal 3x damage and slam enemies into walls', stats: { kickPower: 2, wallSlam: 1 } },
  bloodpact: { name: 'Blood Pact', icon: '♰', rarity: 1, desc: 'Heal 3 health on every kill', stats: { healOnKill: 3 } },
  adrenaline: { name: 'Adrenal Gland', icon: '↯', rarity: 1, desc: 'Dodging costs 40% less stamina', stats: { dodgeCost: -0.4 } },
  overcharge: { name: 'Tempest Gauntlet', icon: '⚒', rarity: 1, desc: 'Heavy attacks charge 50% faster', stats: { chargeSpeed: 0.5 } },
  staticcharm: { name: 'Static Charm', icon: 'ϟ', rarity: 2, desc: 'Critical hits chain lightning', stats: { critShock: 1 } },
  berserk: { name: "Berserker's Brand", icon: '☗', rarity: 2, desc: 'Up to +50% damage as health drops', stats: { lowHpDamage: 0.5 } },
  battlehymn: { name: 'War Drum', icon: '♫', rarity: 2, desc: 'Kills grant +6% attack speed for 6s (stacks 5x)', stats: { killFrenzy: 1 } },
  execution: { name: "Executioner's Mark", icon: '☠', rarity: 2, desc: 'Hitting enemies below 15% health kills them instantly', stats: { executeThreshold: 0.15 } },
  spikedguard: { name: 'Spiked Guard', icon: '✺', rarity: 2, desc: 'Parries release a damaging shockwave', stats: { parryNova: 1 } },
  corpsebloom: { name: 'Corpse Bloom', icon: '❀', rarity: 2, desc: 'Slain enemies have a 25% chance to explode', stats: { corpseBurst: 0.25 } },
  shadowcloak: { name: 'Shadow Cloak', icon: '☾', rarity: 2, desc: 'Your first attack after a dodge always crits', stats: { dodgeCrit: 1 } },
  orbitblade: { name: 'Orbiting Blade', icon: '✧', rarity: 2, desc: 'A spectral blade circles you, slicing enemies (stacks)', stats: { orbitBlades: 1 } },
  soullantern: { name: 'Soul Lantern', icon: '☀', rarity: 1, desc: 'Reveals secret walls and the map layout', stats: { revealSecrets: 1 } },
  mirrorward: { name: 'Mirror Ward', icon: '◎', rarity: 2, desc: 'Blocking a projectile reflects it', stats: { reflect: 1 } },
  spectral: { name: 'Spectral Echo', icon: '❖', rarity: 3, desc: '20% chance for attacks to strike twice', stats: { echoHit: 0.2 } },
  phoenix: { name: 'Phoenix Feather', icon: '♨', rarity: 3, desc: 'Revive once with 50% health', stats: { revive: 1 } },
  glasscannon: { name: 'Glass Cannon', icon: '⚠', rarity: 2, cursed: true, desc: '+60% damage, but -35% max health', stats: { damage: 0.6, maxHpMult: -0.35 } },
  greed: { name: 'Sigil of Greed', icon: '$', rarity: 1, cursed: true, desc: '+60% gold, but take 15% more damage', stats: { goldFind: 0.6, damageTaken: 0.15 } },
  knives: { name: 'Fan of Knives', icon: '⟁', rarity: 2, desc: 'Every 4th attack hurls three knives', stats: { knifeFan: 1 } },
  momentum: { name: 'Momentum Sigil', icon: '➤', rarity: 1, desc: 'Deal up to +30% damage while moving fast', stats: { momentum: 0.3 } },
  wrath: { name: 'Wrathful Idol', icon: '♆', rarity: 2, desc: 'Killing an elite grants 10s of rage', stats: { eliteRage: 1 } },
};

export const CONSUMABLES = {
  potion: { name: 'Health Potion', desc: 'Restores 45% of max health', color: 0xff3344 },
  bomb: { name: 'Bomb', desc: 'Throw with G. Big boom.', color: 0x333333 },
  elixirRage: { name: 'Elixir of Rage', desc: '+40% damage and attack speed for 20s', color: 0xff5522, buff: 'rage', dur: 20 },
  elixirIron: { name: 'Ironskin Draught', desc: '+40% damage reduction for 20s', color: 0x99aabb, buff: 'iron', dur: 20 },
  elixirSwift: { name: 'Quicksilver', desc: '+35% speed and infinite stamina for 15s', color: 0xccddff, buff: 'swift', dur: 15 },
};

// Active abilities (R). cd in seconds.
export const ABILITIES = {
  whirlwind: { name: 'Whirlwind', icon: '✺', cd: 9, desc: 'Spin with your weapon, striking everything around you twice.' },
  firebolt: { name: 'Firebolt', icon: '✹', cd: 4, desc: 'Hurl an exploding bolt of fire.' },
  groundslam: { name: 'Ground Slam', icon: '▼', cd: 10, desc: 'Leap and slam the ground, launching nearby enemies.' },
  frostnova: { name: 'Frost Nova', icon: '❄', cd: 12, desc: 'Freeze all nearby enemies solid.' },
  chainlightning: { name: 'Chain Lightning', icon: 'ϟ', cd: 7, desc: 'Lightning that leaps between up to 6 enemies.' },
  blink: { name: 'Shadow Step', icon: '☾', cd: 6, desc: 'Teleport forward through enemies, slashing them.' },
};

// Level-up boons: choose 1 of 3.
export const BOONS = [
  { id: 'dmg', name: 'Might', desc: '+12% damage', stats: { damage: 0.12 }, w: 3 },
  { id: 'aspd', name: 'Ferocity', desc: '+10% attack speed', stats: { attackSpeed: 0.1 }, w: 3 },
  { id: 'hp', name: 'Fortitude', desc: '+20 max health and heal fully', stats: { maxHp: 20 }, heal: 1, w: 3 },
  { id: 'crit', name: 'Precision', desc: '+7% critical chance', stats: { crit: 0.07 }, w: 3 },
  { id: 'critd', name: 'Cruelty', desc: '+35% critical damage', stats: { critDamage: 0.35 }, w: 2 },
  { id: 'speed', name: 'Swiftness', desc: '+10% movement speed', stats: { moveSpeed: 0.1 }, w: 2 },
  { id: 'stam', name: 'Endurance', desc: '+25 max stamina, +20% regen', stats: { maxStamina: 25, staminaRegen: 0.2 }, w: 2 },
  { id: 'steal', name: 'Bloodthirst', desc: '+3% life steal', stats: { lifesteal: 0.03 }, w: 2 },
  { id: 'fire', name: 'Kindling', desc: '+15% chance to ignite', stats: { burn: 0.15 }, w: 1.5 },
  { id: 'frost', name: 'Rime', desc: '+18% chance to chill', stats: { chill: 0.18 }, w: 1.5 },
  { id: 'shock', name: 'Stormcall', desc: '+10% chance to chain lightning', stats: { shock: 0.1 }, w: 1.5 },
  { id: 'kick', name: 'Bruiser', desc: '+75% kick power', stats: { kickPower: 0.75 }, w: 1.5 },
  { id: 'armor', name: 'Thick Skin', desc: '+6% damage reduction', stats: { armor: 0.06 }, w: 2 },
  { id: 'parry', name: 'Riposte', desc: 'Parry window +40%, ripostes deal +50%', stats: { parryWindow: 0.4, riposte: 0.5 }, w: 1.5 },
  { id: 'potion', name: 'Alchemist', desc: '+1 potion capacity and a free potion', stats: { potionCap: 1 }, potion: 1, w: 1.5 },
  { id: 'relic', name: 'Treasure Sense', desc: 'Gain a random relic', relic: true, w: 1.2 },
  { id: 'heavy', name: 'Overpower', desc: 'Heavy attacks deal +30% damage', stats: { heavyDamage: 0.3 }, w: 2 },
  { id: 'regen', name: 'Troll Blood', desc: 'Regenerate 0.8 health per second', stats: { regen: 0.8 }, w: 1.5 },
];

export const CLASSES = {
  wanderer: { name: 'Wanderer', desc: 'A balanced start: sword, leather, potions and a bomb.', weapon: 'sword', armor: 'leather', potions: 2, bombs: 1, unlock: null },
  cutthroat: { name: 'Cutthroat', desc: 'Dagger and the Shadow Cloak relic. Fragile, deadly.', weapon: 'dagger', armor: 'rags', potions: 2, bombs: 2, relics: ['shadowcloak'], hpMod: -15, unlock: { text: 'Reach depth 2', check: (m) => m.bestFloor >= 2 } },
  brute: { name: 'Brute', desc: 'Warhammer and chainmail. Slow, unstoppable.', weapon: 'hammer', armor: 'chain', potions: 2, bombs: 0, hpMod: 25, unlock: { text: 'Slay 150 enemies (total)', check: (m) => m.totalKills >= 150 } },
  pyromancer: { name: 'Pyromancer', desc: 'Emberbrand sword and the Firebolt ability.', weapon: 'sword', unique: 'emberbrand', armor: 'robe', potions: 1, bombs: 1, ability: 'firebolt', unlock: { text: 'Defeat a floor guardian', check: (m) => m.bossKills >= 1 } },
  penitent: { name: 'Penitent', desc: 'Starts with Glass Cannon, Blood Pact and a spear.', weapon: 'spear', armor: 'rags', potions: 1, bombs: 1, relics: ['glasscannon', 'bloodpact'], unlock: { text: 'Find 3 secret rooms (total)', check: (m) => m.secrets >= 3 } },
};
