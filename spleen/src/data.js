/* ==========================================================================
   SPLEEN: SEPSIS — data.js
   Content database: regions, strains, pathogens, bosses, mutations, perks.
   Behaviour code lives elsewhere; this file is numbers + words.
   ========================================================================== */
"use strict";

const GAME_TITLE = 'SPLEEN: SEPSIS';
const VERSION = '1.0.0';

/* --------------------------------------------------------------------------
   REGIONS — one floor each, in order. Palette values are hex strings.
   mechanic: region-wide twist (kept light & readable)
   -------------------------------------------------------------------------- */
const REGIONS = [
  {
    id: 'veins', name: 'THE VEINS', sub: 'The rot rides the blood', boss: 'colony', music: 'veins', bpm: 96,
    mechanic: 'current',
    pal: { clear: '#0b0204', floorA: '#3d0710', floorB: '#5c0f1a', vein: '#8a1a2a', speck: '#c23a44', wall: '#2a0509', wallTop: '#ff4d6a', hemi: '#ff9aa6', ground: '#2a0408', accent: '#ff5470', fog: '#12030a' },
    pool: [['coccus', 4], ['spirochete', 3], ['bacillus', 3], ['seeder', 2], ['staph', 2]],
  },
  {
    id: 'heart', name: 'THE HEART', sub: 'Every beat pushes the infection further', boss: 'endocardia', music: 'heart', bpm: 76,
    mechanic: 'beat',
    pal: { clear: '#0d0306', floorA: '#4a0d1c', floorB: '#6e1a2c', vein: '#a02a44', speck: '#e05a74', wall: '#33070f', wallTop: '#ff6b8f', hemi: '#ffb0c0', ground: '#30060e', accent: '#ff6b8f', fog: '#14040a' },
    pool: [['virion', 4], ['sickle', 3], ['lysogen', 2], ['coccus', 2], ['bacillus', 2], ['seeder', 2], ['staph', 1], ['spirochete', 2]],
  },
  {
    id: 'lungs', name: 'THE LUNGS', sub: 'Something blooms in every breath', boss: 'aspergill', music: 'lungs', bpm: 84,
    mechanic: 'breath',
    pal: { clear: '#05060d', floorA: '#2b2a45', floorB: '#3d3a5e', vein: '#6a5a96', speck: '#a59ad8', wall: '#17162a', wallTop: '#9ad8ff', hemi: '#c8d4ff', ground: '#151428', accent: '#9ad8ff', fog: '#090a14' },
    pool: [['moldpuff', 4], ['hypha', 3], ['waxback', 3], ['virion', 2], ['sickle', 2], ['bacillus', 2], ['spirochete', 2], ['seeder', 1]],
  },
  {
    id: 'gut', name: 'THE GUT', sub: 'Acid, bile, and things that burrow', boss: 'hunger', music: 'gut', bpm: 100,
    mechanic: 'acid',
    pal: { clear: '#070803', floorA: '#3a3712', floorB: '#4f4a17', vein: '#7a6d1e', speck: '#b5a836', wall: '#1f1c07', wallTop: '#d6ff5a', hemi: '#efffb0', ground: '#1c1a06', accent: '#d6ff5a', fog: '#0c0c04' },
    pool: [['amoeba', 3], ['fluke', 3], ['bilespitter', 3], ['wormling', 3], ['waxback', 2], ['moldpuff', 2], ['virion', 2], ['bacillus', 1]],
  },
  {
    id: 'cortex', name: 'THE CORTEX', sub: 'The infection has learned to think', boss: 'misfold', music: 'cortex', bpm: 120,
    mechanic: 'synapse',
    pal: { clear: '#03030c', floorA: '#16163a', floorB: '#1f2152', vein: '#3a48a8', speck: '#6f8cff', wall: '#0b0b22', wallTop: '#7cf7ff', hemi: '#a8b8ff', ground: '#0a0a20', accent: '#7cf7ff', fog: '#05051a' },
    pool: [['spark', 4], ['prion', 3], ['synapse', 2], ['plaque', 2], ['fluke', 2], ['amoeba', 2], ['waxback', 2], ['hypha', 2], ['sickle', 1]],
  },
  {
    id: 'wound', name: 'THE WOUND', sub: 'Where it all got in', boss: 'sepsis', music: 'wound', bpm: 90,
    mechanic: 'necrosis',
    pal: { clear: '#060402', floorA: '#2a1a0c', floorB: '#3a2410', vein: '#7a3a10', speck: '#ff8a2a', wall: '#140b04', wallTop: '#ff8a2a', hemi: '#ffc890', ground: '#140a04', accent: '#ff8a2a', fog: '#0a0602' },
    pool: [['rotcarrier', 4], ['turncoat', 3], ['prion', 2], ['spark', 2], ['plaque', 2], ['fluke', 2], ['amoeba', 2], ['hypha', 2], ['waxback', 2], ['virion', 2], ['bilespitter', 1]],
  },
];

/* --------------------------------------------------------------------------
   STRAINS — playable immune cells
   dmg is per-projectile. fireRate shots/sec. range in tiles. speed tiles/sec.
   -------------------------------------------------------------------------- */
const STRAINS = {
  neutrophil: {
    id: 'neutrophil', name: 'NEUTROPHIL', title: 'The First Responder',
    desc: 'Fast, reliable, expendable. Fires a steady stream of enzyme granules.',
    hp: 6, speed: 5.0, dmg: 3.0, fireRate: 3.6, shotSpeed: 12, range: 7.0, shotSize: 1, hitR: 0.30, crit: 0,
    weapon: 'granule', ability: 'net', abilityCd: 11,
    abilityName: 'NET', abilityDesc: 'Hurl a sticky Extracellular Trap. Pathogens caught inside are slowed and dissolved.',
    color: '#7ff3ff', nucleus: '#b86bff', unlock: null,
    statLine: { HP: 3, DMG: 3, SPEED: 3, RANGE: 3 },
  },
  macrophage: {
    id: 'macrophage', name: 'MACROPHAGE', title: 'The Big Eater',
    desc: 'Slow and enormous. Sprays lysosome acid at close range and swallows pathogens whole.',
    hp: 9, speed: 4.3, dmg: 1.6, fireRate: 1.55, shotSpeed: 10.5, range: 4.4, shotSize: 0.9, hitR: 0.36, crit: 0,
    pellets: 5, cone: 0.55,
    weapon: 'spray', ability: 'engulf', abilityCd: 9,
    abilityName: 'ENGULF', abilityDesc: 'Lunge forward, swallowing every pathogen in your path. Digesting 3+ at once restores 1 HP.',
    color: '#ffc27a', nucleus: '#ff6b5a', unlock: 'macrophage',
    statLine: { HP: 5, DMG: 4, SPEED: 1, RANGE: 1 },
  },
  tcell: {
    id: 'tcell', name: 'KILLER T', title: 'The Assassin',
    desc: 'Fragile and precise. Hold fire to charge piercing perforin lances. Lethal criticals.',
    hp: 4, speed: 5.6, dmg: 8.5, fireRate: 1.6 /* = 1 / charge time */, shotSpeed: 19, range: 11, shotSize: 1, hitR: 0.27, crit: 0.12,
    weapon: 'lance', ability: 'mark', abilityCd: 13,
    abilityName: 'KILL ORDER', abilityDesc: 'Mark every visible pathogen. Marked targets take +50% damage and burst when they die.',
    color: '#9dff7a', nucleus: '#2f9a5a', unlock: 'tcell',
    statLine: { HP: 1, DMG: 5, SPEED: 4, RANGE: 5 },
  },
  bcell: {
    id: 'bcell', name: 'PLASMA B', title: 'The Factory',
    desc: 'Pumps out homing antibodies that latch onto pathogens and keep hurting them.',
    hp: 5, speed: 5.0, dmg: 1.2, fireRate: 4.6, shotSpeed: 9, range: 7.5, shotSize: 1, hitR: 0.30, crit: 0,
    weapon: 'antibody', ability: 'swarm', abilityCd: 12,
    abilityName: 'MEMORY SWARM', abilityDesc: 'Release a cloud of 14 antibodies that hunt pathogens on their own.',
    color: '#a99cff', nucleus: '#5a3cff', unlock: 'bcell',
    statLine: { HP: 2, DMG: 2, SPEED: 3, RANGE: 3 },
  },
};
const STRAIN_ORDER = ['neutrophil', 'macrophage', 'tcell', 'bcell'];

/* --------------------------------------------------------------------------
   PATHOGENS — hp is floor-1 baseline (scaled per floor), speed tiles/s,
   cost = encounter budget points. ai key maps to enemies.js behaviour.
   -------------------------------------------------------------------------- */
const ENEMIES = {
  coccus: { name: 'COCCUS', hp: 9, speed: 2.1, r: 0.38, cost: 1, ai: 'chase', color: '#b9f04a', core: '#4a7a10',
    lore: 'A round bacterium with one idea: get closer.' },
  spirochete: { name: 'SPIROCHETE', hp: 6, speed: 3.3, r: 0.30, cost: 1, ai: 'wiggle', color: '#ffd84a', core: '#8a6a00',
    lore: 'Corkscrews through tissue. Fragile, fast, and erratic.' },
  bacillus: { name: 'BACILLUS', hp: 15, speed: 1.4, r: 0.42, cost: 2, ai: 'charger', color: '#7affc8', core: '#107a5a',
    lore: 'Rod-shaped. Lines up, shudders, then rams. Watch the shudder.' },
  seeder: { name: 'SEEDER', hp: 16, speed: 0.55, r: 0.45, cost: 2, ai: 'turret', color: '#ff9a4a', core: '#8a3a00',
    lore: 'A spore pod that spits toxin at anything warm.' },
  staph: { name: 'STAPH CLUSTER', hp: 22, speed: 1.25, r: 0.62, cost: 3, ai: 'cluster', color: '#e8f04a', core: '#7a7a10',
    lore: 'Grape-bunch colony. Break it and it scatters into cocci.' },
  virion: { name: 'VIRION', hp: 14, speed: 1.6, r: 0.40, cost: 2, ai: 'virion', fly: true, color: '#ff5ad1', core: '#7a106a',
    lore: 'A spiked capsule of stolen code. Fires on the beat.' },
  sickle: { name: 'SICKLED CELL', hp: 12, speed: 4.2, r: 0.42, cost: 2, ai: 'bouncer', color: '#ff6a5a', core: '#7a1a10',
    lore: 'A red cell bent out of shape. Ricochets until something breaks.' },
  lysogen: { name: 'LYSOGEN', hp: 26, speed: 0, r: 0.55, cost: 3, ai: 'spawner', color: '#c87aff', core: '#4a107a',
    lore: 'An infected host, quietly printing copies of the virus.' },
  replicant: { name: 'REPLICANT', hp: 4, speed: 2.6, r: 0.26, cost: 0, ai: 'chase', color: '#e0a0ff', core: '#5a1a8a', noCodex: false,
    lore: 'Freshly printed. Not very well made.' },
  moldpuff: { name: 'MOLD PUFF', hp: 18, speed: 0.9, r: 0.48, cost: 2, ai: 'puffer', fly: true, color: '#b0ffd8', core: '#2a8a5a',
    lore: 'Drifting fungal sac. Bursts into choking spore clouds.' },
  hypha: { name: 'HYPHA', hp: 24, speed: 0, r: 0.45, cost: 3, ai: 'rooter', color: '#d8c8ff', core: '#6a4aaa',
    lore: 'A rooted fungal thread. Sends spikes through the tissue toward you.' },
  waxback: { name: 'WAXBACK', hp: 34, speed: 1.15, r: 0.55, cost: 3, ai: 'shielded', color: '#e8e0b0', core: '#7a6a30',
    lore: 'Mycobacterium in a waxy coat. Its front is armored. Flank it.' },
  amoeba: { name: 'AMOEBA', hp: 30, speed: 1.1, r: 0.70, cost: 3, ai: 'splitter', color: '#9aff6a', core: '#2a7a10',
    lore: 'Divide and conquer, literally. Splits twice before it dies.' },
  fluke: { name: 'FLUKE', hp: 20, speed: 1.0, r: 0.42, cost: 3, ai: 'burrower', color: '#ffb87a', core: '#8a4a1a',
    lore: 'A parasitic worm that swims beneath the tissue and erupts.' },
  bilespitter: { name: 'BILE SPITTER', hp: 20, speed: 1.0, r: 0.45, cost: 2, ai: 'lobber', color: '#e0ff3a', core: '#6a7a00',
    lore: 'Lobs globs of acid that eat the floor for a while.' },
  wormling: { name: 'WORMLING', hp: 16, speed: 2.9, r: 0.34, cost: 2, ai: 'worm', color: '#ffd0a0', core: '#8a5a2a',
    lore: 'A young tapeworm. Hungry. Fast.' },
  spark: { name: 'SPARK', hp: 12, speed: 0, r: 0.32, cost: 2, ai: 'dasher', fly: true, color: '#fff27a', core: '#aa8a00',
    lore: 'A stray neural impulse. Flickers, aims, and zaps across the room.' },
  prion: { name: 'PRION', hp: 22, speed: 0, r: 0.42, cost: 3, ai: 'blinker', fly: true, color: '#7cf7ff', core: '#106a8a',
    lore: 'A misfolded protein. Blinks through space and folds others like it.' },
  synapse: { name: 'SYNAPSE NODE', hp: 18, speed: 0.5, r: 0.40, cost: 2, ai: 'synapse', fly: true, color: '#9ab8ff', core: '#2a3a9a',
    lore: 'Always found in pairs. Never stand between them.' },
  plaque: { name: 'PLAQUE', hp: 40, speed: 0.85, r: 0.62, cost: 4, ai: 'mortar', color: '#d0b0ff', core: '#5a3a8a',
    lore: 'Amyloid build-up. Slow, heavy, and it throws things that burst.' },
  rotcarrier: { name: 'ROT CARRIER', hp: 26, speed: 1.6, r: 0.50, cost: 3, ai: 'bloater', color: '#a8ff5a', core: '#4a3a10',
    lore: 'Bloated with necrotic fluid. Do not be nearby when it pops.' },
  turncoat: { name: 'TURNCOAT', hp: 30, speed: 2.4, r: 0.44, cost: 3, ai: 'turncoat', color: '#ff7ad8', core: '#5a1a4a',
    lore: 'A white cell the rot got to first. It still remembers how to fight.' },
};

/* Elite modifiers (rolled on floor 2+) */
const ELITES = {
  swollen: { name: 'SWOLLEN', color: '#ff9a3a', desc: 'bigger, tougher' },
  frenzied: { name: 'FRENZIED', color: '#ff3a5a', desc: 'faster, attacks more' },
  encapsulated: { name: 'ENCAPSULATED', color: '#9ad8ff', desc: 'shielded capsule' },
  volatile: { name: 'VOLATILE', color: '#d6ff3a', desc: 'bursts on death' },
};

/* --------------------------------------------------------------------------
   BOSSES
   -------------------------------------------------------------------------- */
const BOSSES = {
  colony: { name: 'THE COLONY', title: 'A city of bacteria with one mind', hp: 430, r: 1.55, color: '#d8f04a', core: '#6a7a10' },
  endocardia: { name: 'ENDOCARDIA', title: 'It nests in the valve and keeps time', hp: 640, r: 1.6, color: '#ff4a8a', core: '#6a0a2a' },
  aspergill: { name: 'ASPERGILL', title: 'The bloom that breathes for you', hp: 800, r: 1.5, color: '#b8ffe0', core: '#2a6a5a' },
  hunger: { name: 'THE LONG HUNGER', title: 'Forty feet of appetite', hp: 1000, r: 0.85, color: '#ffd8a8', core: '#8a5a2a' },
  misfold: { name: 'MISFOLD', title: 'The thought that should not be', hp: 1150, r: 1.3, color: '#7cf7ff', core: '#1a3a9a' },
  sepsis: { name: 'SEPSIS', title: 'Patient Zero', hp: 3800, r: 2.1, color: '#ff8a2a', core: '#3a0a02' },
};

/* --------------------------------------------------------------------------
   MUTATIONS
   rarity: common | uncommon | rare | malignant
   apply(st, P): mutate the freshly rebuilt stat block.
   stack: how many copies may be owned (default 1)
   cost (malignant only): max HP paid on acquisition
   icon: Material Symbols name
   -------------------------------------------------------------------------- */
const RARITY = {
  common: { name: 'COMMON', color: '#9fe8c8', weight: [60, 52, 46, 40, 36, 32] },
  uncommon: { name: 'UNCOMMON', color: '#6fc3ff', weight: [32, 36, 38, 40, 41, 42] },
  rare: { name: 'RARE', color: '#ffd36b', weight: [8, 12, 16, 20, 23, 26] },
  malignant: { name: 'MALIGNANT', color: '#c06bff', weight: [0, 0, 0, 0, 0, 0] },
};

const MUTATIONS = [
  /* ---------------- COMMON ---------------- */
  { id: 'mitochondria', name: 'MITOCHONDRIA', rarity: 'common', icon: 'bolt', stack: 5,
    desc: '+22% fire rate.', apply: (s) => { s.fireMult *= 1.22; } },
  { id: 'enzyme', name: 'ENZYME CONCENTRATE', rarity: 'common', icon: 'science', stack: 5,
    desc: '+20% damage.', apply: (s) => { s.dmgMult *= 1.20; } },
  { id: 'flagellum', name: 'FLAGELLUM', rarity: 'common', icon: 'gesture', stack: 3,
    desc: '+14% move speed. Dash recharges 15% faster.', apply: (s) => { s.speedMult *= 1.14; s.dashCdMult *= 0.85; } },
  { id: 'cilia', name: 'CILIA', rarity: 'common', icon: 'air', stack: 3,
    desc: '+30% shot speed, +20% range.', apply: (s) => { s.shotSpeedMult *= 1.3; s.rangeMult *= 1.2; } },
  { id: 'membrane', name: 'THICK MEMBRANE', rarity: 'common', icon: 'favorite', stack: 4,
    desc: '+1 max HP and heal 1.', onGain: (P) => { P.heal(1); }, apply: (s) => { s.maxHp += 1; } },
  { id: 'glycogen', name: 'GLYCOGEN RESERVE', rarity: 'common', icon: 'shield', stack: 4,
    desc: 'Gain 2 Mucus. Mucus absorbs a hit before your HP does.', onGain: (P) => { P.addShield(2); }, apply: () => { } },
  { id: 'pseudopod', name: 'PSEUDOPOD', rarity: 'common', icon: 'back_hand', stack: 3,
    desc: '+40% range, +8% damage.', apply: (s) => { s.rangeMult *= 1.4; s.dmgMult *= 1.08; } },
  { id: 'ribosome', name: 'RIBOSOME SURPLUS', rarity: 'common', icon: 'autorenew', stack: 3,
    desc: 'Your ability recharges 25% faster.', apply: (s) => { s.abilityCdMult *= 0.75; } },
  { id: 'siderophore', name: 'SIDEROPHORE', rarity: 'common', icon: 'diamond', stack: 2,
    desc: 'Gain 15 iron. +60% iron from every source.', onGain: (P) => { P.addIron(15, true); }, apply: (s) => { s.ironMult *= 1.6; } },
  { id: 'mucus', name: 'MUCUS LINING', rarity: 'common', icon: 'water_drop', stack: 3,
    desc: 'Start every new region with +1 Mucus. Gain 1 now.', onGain: (P) => { P.addShield(1); }, apply: (s) => { s.shieldPerFloor += 1; } },
  { id: 'capsule', name: 'CAPSULE', rarity: 'common', icon: 'radio_button_checked', stack: 3,
    desc: 'Shots are 35% larger and deal 12% more damage.', apply: (s) => { s.sizeMult *= 1.35; s.dmgMult *= 1.12; } },
  { id: 'interferon', name: 'INTERFERON', rarity: 'common', icon: 'healing', stack: 3,
    desc: '18% chance to heal 1 HP whenever you clear a room.', apply: (s) => { s.healOnClear += 0.18; } },
  { id: 'growthfactor', name: 'GROWTH FACTOR', rarity: 'common', icon: 'trending_up', stack: 3,
    desc: '+8% damage, +8% fire rate, +5% move speed.', apply: (s) => { s.dmgMult *= 1.08; s.fireMult *= 1.08; s.speedMult *= 1.05; } },

  /* ---------------- UNCOMMON ---------------- */
  { id: 'mitosis', name: 'MITOSIS', rarity: 'uncommon', icon: 'control_point_duplicate', stack: 3,
    desc: 'Fire +1 parallel shot. (Each shot deals a little less.)', apply: (s) => { s.parallel += 1; } },
  { id: 'chemotaxis', name: 'CHEMOTAXIS', rarity: 'uncommon', icon: 'my_location',
    desc: 'Your shots follow the chemical trail to the nearest pathogen.', apply: (s) => { s.homing = Math.max(s.homing, 0.55) + 0.15; } },
  { id: 'lysozyme', name: 'LYSOZYME', rarity: 'uncommon', icon: 'east', stack: 3,
    desc: 'Shots pierce +1 pathogen.', apply: (s) => { s.pierce += 1; } },
  { id: 'elastin', name: 'ELASTIN', rarity: 'uncommon', icon: 'sync_alt', stack: 3,
    desc: 'Shots bounce off walls +1 time and gain +15% range.', apply: (s) => { s.bounce += 1; s.rangeMult *= 1.15; } },
  { id: 'fever', name: 'FEVER', rarity: 'uncommon', icon: 'local_fire_department', stack: 3,
    desc: '25% chance to ignite: burning pathogens take 40% of the hit per second for 3s.', apply: (s) => { s.burn += 0.25; } },
  { id: 'necrotoxin', name: 'NECROTOXIN', rarity: 'uncommon', icon: 'skull', stack: 3,
    desc: '30% chance to poison. Poison stacks up to 5 times.', apply: (s) => { s.poison += 0.30; } },
  { id: 'histamine', name: 'HISTAMINE', rarity: 'uncommon', icon: 'flare', stack: 2,
    desc: '+70% knockback. 12% chance to stun for 0.6s.', apply: (s) => { s.knock *= 1.7; s.stun += 0.12; } },
  { id: 'complement', name: 'COMPLEMENT CASCADE', rarity: 'uncommon', icon: 'stars',
    desc: 'Every 5th shot is a massive piercing shot dealing triple damage.', apply: (s) => { s.complement = 5; } },
  { id: 'opsonin', name: 'OPSONIN', rarity: 'uncommon', icon: 'sell',
    desc: 'Pathogens you hit take +20% damage from everything for 3s.', apply: (s) => { s.opsonin = true; } },
  { id: 'satellite', name: 'SATELLITE CELL', rarity: 'uncommon', icon: 'trip_origin', stack: 3,
    desc: 'A small cell orbits you, blocking enemy shots and biting pathogens.', apply: (s) => { s.satellites += 1; } },
  { id: 'helpert', name: 'HELPER T', rarity: 'uncommon', icon: 'support', stack: 2,
    desc: 'A helper cell follows you and shoots the nearest pathogen.', apply: (s) => { s.helpers += 1; } },
  { id: 'platelet', name: 'PLATELET PLUG', rarity: 'uncommon', icon: 'emergency',
    desc: 'When you are hit, release a shockwave that damages and repels pathogens. +0.5s invulnerability.', apply: (s) => { s.plateletPlug = true; } },
  { id: 'apoptosis', name: 'APOPTOSIS SIGNAL', rarity: 'uncommon', icon: 'content_cut',
    desc: 'Hitting a pathogen below 15% HP makes it self-destruct. (Bosses: +15% damage below 15%.)', apply: (s) => { s.execute = 0.15; } },
  { id: 'phage', name: 'PHAGE PAYLOAD', rarity: 'uncommon', icon: 'coronavirus', stack: 2,
    desc: 'Kills release 2 phages that seek out other pathogens.', apply: (s) => { s.phage += 2; } },
  { id: 'agglutinin', name: 'AGGLUTININ', rarity: 'uncommon', icon: 'ac_unit', stack: 2,
    desc: '30% chance to clump pathogens, slowing them by 40% for 2s.', apply: (s) => { s.slow += 0.30; } },
  { id: 'spindle', name: 'SPINDLE FIBERS', rarity: 'uncommon', icon: 'call_split',
    desc: 'Shots split into two smaller shots when they hit a wall.', apply: (s) => { s.splitWall = true; } },
  { id: 'adrenal', name: 'ADRENAL SURGE', rarity: 'uncommon', icon: 'flash_on',
    desc: 'After you dash, your next 3 shots deal +70% damage.', apply: (s) => { s.adrenal = true; } },
  { id: 'pump', name: 'MEMBRANE PUMP', rarity: 'uncommon', icon: 'auto_fix_high',
    desc: 'Dashing through enemy shots destroys them.', apply: (s) => { s.dashClears = true; } },
  { id: 'biofilm', name: 'BIOFILM', rarity: 'uncommon', icon: 'waves',
    desc: 'Dashing leaves a toxic trail that dissolves pathogens.', apply: (s) => { s.biofilm = true; } },
  { id: 'cytokine', name: 'CYTOKINE', rarity: 'uncommon', icon: 'campaign',
    desc: 'Each kill grants +4% damage until you leave the room (max +40%).', apply: (s) => { s.cytokine = true; } },

  /* ---------------- RARE ---------------- */
  { id: 'storm', name: 'CYTOKINE STORM', rarity: 'rare', icon: 'blur_on',
    desc: 'Pathogens explode when they die, damaging everything nearby. Chain reactions welcome.', apply: (s) => { s.deathBlast = true; } },
  { id: 'overdrive', name: 'METABOLIC OVERDRIVE', rarity: 'rare', icon: 'rocket_launch', stack: 2,
    desc: '+35% damage, +25% fire rate.', apply: (s) => { s.dmgMult *= 1.35; s.fireMult *= 1.25; } },
  { id: 'triploid', name: 'TRIPLOID', rarity: 'rare', icon: 'change_history',
    desc: 'Fire 3 shots in a fan. (Each shot deals a little less.)', apply: (s) => { s.spread += 2; } },
  { id: 'memory', name: 'IMMUNOLOGICAL MEMORY', rarity: 'rare', icon: 'psychology',
    desc: '+4% damage for every different pathogen species you have killed this run (max +40%).', apply: (s) => { s.speciesBonus = true; } },
  { id: 'telomere', name: 'TELOMERE CAP', rarity: 'rare', icon: 'all_inclusive',
    desc: 'The first time you would die, revive with 3 HP instead.', onGain: (P) => { P.revives += 1; P.reviveHp.push(3); }, apply: () => { } },
  { id: 'mastcell', name: 'MAST CELL', rarity: 'rare', icon: 'sensors',
    desc: 'A companion that releases a histamine shockwave every 3s, damaging and repelling nearby pathogens.', apply: (s) => { s.mastcells += 1; } },
  { id: 'giant', name: 'GIANT GRANULE', rarity: 'rare', icon: 'lens',
    desc: 'Shots become huge, slow and pierce everything: x2.3 damage, -40% fire rate.', apply: (s) => { s.dmgMult *= 2.3; s.fireMult *= 0.6; s.sizeMult *= 1.9; s.shotSpeedMult *= 0.75; s.pierce += 99; } },
  { id: 'neural', name: 'NEURAL LINK', rarity: 'rare', icon: 'account_tree', stack: 2,
    desc: '25% chance for hits to arc to 2 nearby pathogens for 50% damage.', apply: (s) => { s.chain += 0.25; } },
  { id: 'homeostasis', name: 'HOMEOSTASIS', rarity: 'rare', icon: 'balance',
    desc: '+1 max HP, full heal, and +10% damage, fire rate and speed.', onGain: (P) => { P.heal(99); }, apply: (s) => { s.maxHp += 1; s.dmgMult *= 1.1; s.fireMult *= 1.1; s.speedMult *= 1.1; } },
  { id: 'ros', name: 'OXIDATIVE BURST', rarity: 'rare', icon: 'brightness_5',
    desc: 'Shots explode on impact, dealing 60% damage to everything around.', apply: (s) => { s.shotBlast = Math.max(s.shotBlast, 1.1); } },

  /* ---------------- MALIGNANT (Tumor rooms; cost = max HP) ---------------- */
  { id: 'growth', name: 'UNCONTROLLED GROWTH', rarity: 'malignant', icon: 'zoom_out_map', cost: 1,
    desc: '+65% damage. Your cell swells 25% larger (bigger hitbox).', apply: (s) => { s.dmgMult *= 1.65; s.hitboxMult *= 1.25; } },
  { id: 'metastasis', name: 'METASTASIS', rarity: 'malignant', icon: 'scatter_plot', cost: 1,
    desc: 'Shots burst into 3 seeking fragments when they hit a pathogen.', apply: (s) => { s.splitHit = 3; } },
  { id: 'warburg', name: 'WARBURG EFFECT', rarity: 'malignant', icon: 'whatshot', cost: 1,
    desc: '+55% fire rate. Lose 1 HP whenever you enter a new region (cannot kill you).', apply: (s) => { s.fireMult *= 1.55; s.warburg = true; } },
  { id: 'immortal', name: 'IMMORTAL LINE', rarity: 'malignant', icon: 'restart_alt', cost: 2,
    desc: 'The first time you would die, revive at full HP.', onGain: (P) => { P.revives += 1; P.reviveHp.push(99); }, apply: () => { } },
  { id: 'angiogenesis', name: 'ANGIOGENESIS', rarity: 'malignant', icon: 'bloodtype', cost: 1,
    desc: 'Kills have a 6% chance to drop a platelet (heal). Pathogens move 15% faster.', apply: (s) => { s.plateletDrop += 0.06; s.enemySpeedMult *= 1.15; } },
  { id: 'oncogene', name: 'ONCOGENE', rarity: 'malignant', icon: 'stacked_line_chart', cost: 1,
    desc: 'Permanently gain +4% damage for every room you clear. Pathogens have +12% HP.', apply: (s) => { s.oncogene = true; s.enemyHpMult *= 1.12; } },
  { id: 'necrosis', name: 'NECROSIS', rarity: 'malignant', icon: 'dangerous', cost: 1,
    desc: 'Pathogens touching you take 600% of your damage per second. Platelets no longer heal you.', apply: (s) => { s.contactAura = 6; s.noHeal = true; } },
];
const MUT = {}; for (const m of MUTATIONS) MUT[m.id] = m;

/* Named synergies: flavour + a small real bonus */
const SYNERGIES = [
  { id: 'seeker', name: 'SEEKING LANCE', req: ['chemotaxis', 'lysozyme'], desc: 'Homing piercers. +10% damage.', apply: (s) => { s.dmgMult *= 1.10; } },
  { id: 'chainrx', name: 'CHAIN REACTION', req: ['storm', 'ros'], desc: 'Explosions grow 30% larger.', apply: (s) => { s.blastRadiusMult *= 1.3; } },
  { id: 'feverdream', name: 'FEVER DREAM', req: ['fever', 'necrotoxin'], desc: 'Burn and poison deal +30% damage.', apply: (s) => { s.dotMult *= 1.3; } },
  { id: 'pinball', name: 'PINBALL', req: ['elastin', 'chemotaxis'], desc: 'Bounced shots re-acquire targets and gain +20% damage per bounce.', apply: (s) => { s.bounceDmg = 0.2; } },
  { id: 'hive', name: 'THE HIVE', req: ['helpert', 'satellite'], desc: 'Companions deal +40% damage.', apply: (s) => { s.companionMult *= 1.4; } },
  { id: 'livingstorm', name: 'LIVING STORM', req: ['neural', 'storm'], desc: 'Death explosions always arc lightning.', apply: (s) => { s.blastChain = true; } },
  { id: 'apex', name: 'APEX PREDATOR', req: ['growth', 'overdrive'], desc: 'Unstoppable. +15% move speed.', apply: (s) => { s.speedMult *= 1.15; } },
];

/* --------------------------------------------------------------------------
   META: perks bought with Memory in THE SPLEEN, and unlock milestones
   -------------------------------------------------------------------------- */
const PERKS = [
  { id: 'hp', name: 'REINFORCED MEMBRANE', icon: 'favorite', desc: '+1 max HP for every strain.', cost: [60, 150] },
  { id: 'iron', name: 'IRON RESERVES', icon: 'diamond', desc: 'Start every run with +10 iron.', cost: [30, 60, 100] },
  { id: 'ability', name: 'RAPID RESPONSE', icon: 'autorenew', desc: 'Abilities recharge 8% faster.', cost: [50, 110] },
  { id: 'primed', name: 'PRIMED', icon: 'science', desc: 'Begin each run with a random common mutation.', cost: [90] },
  { id: 'reroll', name: 'SECOND OPINION', icon: 'casino', desc: 'One free reroll on every mutation choice.', cost: [80] },
  { id: 'platelet', name: 'PLATELET BANK', icon: 'healing', desc: 'Heal 1 HP whenever you enter a new region.', cost: [70] },
  { id: 'library', name: 'ANTIGEN LIBRARY', icon: 'menu_book', desc: 'Mutation choices offer 4 options instead of 3.', cost: [170] },
  { id: 'memtcell', name: 'MEMORY T CELLS', icon: 'psychology', desc: 'Doubles your Immune Memory bonus (up to +20% vs known pathogens).', cost: [120] },
];

const UNLOCKS = {
  macrophage: { name: 'MACROPHAGE', how: 'Defeat THE COLONY in the Veins.' },
  tcell: { name: 'KILLER T', how: 'Defeat ENDOCARDIA in the Heart.' },
  bcell: { name: 'PLASMA B', how: 'Reach THE GUT.' },
  fever: { name: 'FEVER MODE', how: 'Contain the Sepsis (win a run).' },
};

/* Fever (difficulty) levels, unlocked one at a time by winning */
const FEVER = [
  { lvl: 0, name: 'NORMAL', desc: 'The intended experience.' },
  { lvl: 1, name: 'FEVER I', desc: 'Pathogens have +20% HP.' },
  { lvl: 2, name: 'FEVER II', desc: '+ Enemy shots are 12% faster.' },
  { lvl: 3, name: 'FEVER III', desc: '+ Elite pathogens appear twice as often.' },
  { lvl: 4, name: 'FEVER IV', desc: '+ Start with 1 less max HP.' },
  { lvl: 5, name: 'FEVER V', desc: '+ Bosses have +25% HP and attack faster.' },
];

/* Tutorial hint strings painted on the first room floor */
const TUTORIAL = {
  kbm: ['WASD  MOVE', 'MOUSE  AIM  ·  HOLD LMB  FIRE', 'SPACE / RMB  DASH', 'Q  ABILITY   ·   E  INTERACT'],
  pad: ['L-STICK  MOVE', 'R-STICK  AIM & FIRE  ·  RT  FIRE', 'A / LB  DASH', 'RB / X  ABILITY   ·   Y  INTERACT'],
  touch: ['LEFT THUMB  MOVE', 'RIGHT THUMB  AIM & FIRE', 'TAP  DASH  BUTTON', 'TAP  ABILITY  BUTTON'],
};
