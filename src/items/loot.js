// Loot generation: rarity rolls, item instances, naming, descriptions and drop tables.
import { WEAPONS, AFFIXES, UNIQUES, ARMORS, TRINKETS, RELICS, RARITY, ABILITIES, pct } from './data.js';

let uidCounter = 1;

export function rollRarity(rng, floor, luck = 0, minTier = 0) {
  // weights shift toward rarer tiers with depth and luck
  const f = floor - 1;
  const w = [
    Math.max(8, 56 - f * 7 - luck * 30),
    28 + f * 1.5,
    11 + f * 2.8 + luck * 12,
    3 + f * 1.6 + luck * 7,
    0.9 + f * 0.7 + luck * 3,
  ];
  for (let i = 0; i < minTier; i++) w[i] = 0;
  const tiers = [0, 1, 2, 3, 4];
  return rng.weighted(tiers, (t) => w[t]);
}

function rollAffix(rng, id, rarity) {
  const a = AFFIXES[id];
  const q = 0.4 + rng.next() * 0.6 + rarity * 0.08;
  let v = a.v[0] + (a.v[1] - a.v[0]) * Math.min(1, q);
  if (a.int) v = Math.round(v);
  return { id, v };
}

function pickAffixes(rng, slot, count, exclude = []) {
  const pool = Object.keys(AFFIXES).filter((k) => AFFIXES[k].slots.includes(slot) && !exclude.includes(k));
  rng.shuffle(pool);
  // at most one elemental per item
  const out = [];
  let elem = false;
  for (const k of pool) {
    if (out.length >= count) break;
    if (AFFIXES[k].elem) { if (elem) continue; elem = true; }
    out.push(k);
  }
  return out;
}

export function makeWeapon(rng, base, rarity, floor, uniqueId = null) {
  const W = WEAPONS[base];
  const R = RARITY[rarity];
  const item = {
    uid: uidCounter++, kind: 'weapon', base, rarity, level: floor,
    dmg: Math.round(W.dmg * (1 + 0.14 * (floor - 1)) * R.mult * (0.95 + rng.next() * 0.1)),
    affixes: [], upgrades: 0,
  };
  if (uniqueId) {
    const U = UNIQUES[uniqueId];
    item.unique = uniqueId;
    item.rarity = 4;
    item.name = U.name;
    item.dmg = Math.round(W.dmg * (1 + 0.14 * (floor - 1)) * RARITY[4].mult);
    item.affixes = U.affixes.map((id) => rollAffix(rng, id, 4));
    item.fx = U.fx;
    return item;
  }
  const [lo, hi] = R.affixes;
  const n = rng.int(lo, hi);
  item.affixes = pickAffixes(rng, 'w', n).map((id) => rollAffix(rng, id, rarity));
  const elem = item.affixes.find((a) => AFFIXES[a.id].elem);
  if (elem) item.fx = AFFIXES[elem.id].elem;
  item.name = nameFor(rng, W.names, item.affixes);
  return item;
}

function nameFor(rng, names, affixes) {
  const base = rng.pick(names);
  if (!affixes.length) return base;
  const first = AFFIXES[affixes[0].id].name;
  if (affixes.length >= 3) {
    const suffixes = ['of Ruin', 'of the Deep', 'of Slaughter', 'of Embers', 'of the Ancients', 'of Dread', 'of the Tyrant', 'of Woe'];
    return `${first} ${base} ${rng.pick(suffixes)}`;
  }
  return `${first} ${base}`;
}

export function makeArmor(rng, base, rarity, floor) {
  const A = ARMORS[base];
  const item = { uid: uidCounter++, kind: 'armor', base, rarity, level: floor, armor: A.armor + rarity * 0.015 + (floor - 1) * 0.008, affixes: [] };
  const [lo, hi] = RARITY[rarity].affixes;
  item.affixes = pickAffixes(rng, 'a', rng.int(lo, hi)).map((id) => rollAffix(rng, id, rarity));
  item.name = item.affixes.length ? `${AFFIXES[item.affixes[0].id].name} ${A.name}` : A.name;
  return item;
}

export function makeTrinket(rng, rarity, floor) {
  const base = rng.pick(Object.keys(TRINKETS));
  const item = { uid: uidCounter++, kind: 'trinket', base, rarity, level: floor, affixes: [] };
  const n = Math.max(1, RARITY[rarity].affixes[1]);
  item.affixes = pickAffixes(rng, 't', n).map((id) => rollAffix(rng, id, rarity));
  const gems = ['Bone', 'Iron', 'Silver', 'Jade', 'Ruby', 'Onyx', 'Amber', 'Opal'];
  item.name = `${rng.pick(gems)} ${TRINKETS[base].name} of ${AFFIXES[item.affixes[0].id].name.replace(/'s$/, '')}`;
  return item;
}

export function makeRelic(rng, minRarity = 0, owned = []) {
  const ids = Object.keys(RELICS).filter((k) => RELICS[k].rarity >= minRarity);
  // owned non-stacking relics are less likely to repeat
  const id = rng.weighted(ids, (k) => {
    const r = RELICS[k];
    const base = [6, 4, 2.2, 1][r.rarity] || 1;
    return owned.includes(k) ? base * 0.35 : base;
  });
  const r = RELICS[id];
  return { uid: uidCounter++, kind: 'relic', id, name: r.name, rarity: Math.min(4, r.rarity + 1), cursed: !!r.cursed };
}

export function makeAbility(rng, exclude = null) {
  const ids = Object.keys(ABILITIES).filter((k) => k !== exclude);
  const id = rng.pick(ids);
  return { uid: uidCounter++, kind: 'ability', id, name: `Tome: ${ABILITIES[id].name}`, rarity: 2 };
}

export function makeConsumable(id, count = 1) {
  return { uid: uidCounter++, kind: 'consumable', id, count, rarity: 0 };
}

// Random gear piece.
export function rollGear(rng, floor, luck = 0, minTier = 0, kindWeights = null) {
  const rarity = rollRarity(rng, floor, luck, minTier);
  const kinds = kindWeights || { weapon: 5, armor: 2, trinket: 2 };
  const kind = rng.weighted(Object.keys(kinds), (k) => kinds[k]);
  if (kind === 'weapon') {
    if (rarity === 4 && rng.chance(0.55)) {
      const u = rng.pick(Object.keys(UNIQUES));
      return makeWeapon(rng, UNIQUES[u].base, 4, floor, u);
    }
    const bases = Object.keys(WEAPONS);
    return makeWeapon(rng, rng.pick(bases), rarity, floor);
  }
  if (kind === 'armor') {
    const bases = Object.keys(ARMORS).filter((b) => b !== 'rags' && ARMORS[b].tier <= 1 + Math.floor(floor / 2));
    return makeArmor(rng, rng.pick(bases), rarity, floor);
  }
  return makeTrinket(rng, rarity, floor);
}

// ---------- descriptions ----------

export function itemColor(item) {
  return RARITY[Math.min(4, item.rarity)].color;
}

export function describe(item) {
  const lines = [];
  if (item.kind === 'weapon') {
    const W = WEAPONS[item.base];
    lines.push({ t: `${W.name}${item.upgrades ? ` +${item.upgrades}` : ''}`, c: 'type' });
    lines.push({ t: `${item.dmg} damage · ${speedWord(W.speed)} · ${W.reach.toFixed(1)}m reach`, c: 'main' });
    for (const a of item.affixes) lines.push({ t: AFFIXES[a.id].fmt(a.v), c: 'affix' });
    if (item.unique) lines.push({ t: UNIQUES[item.unique].special, c: 'unique' });
    lines.push({ t: W.desc, c: 'flavor' });
  } else if (item.kind === 'armor') {
    const A = ARMORS[item.base];
    lines.push({ t: 'Body Armor', c: 'type' });
    lines.push({ t: `${pct(item.armor)} damage reduction`, c: 'main' });
    if (A.speed) lines.push({ t: `${A.speed > 0 ? '+' : ''}${pct(A.speed)} movement speed`, c: A.speed > 0 ? 'affix' : 'neg' });
    if (A.cooldown) lines.push({ t: `-${pct(A.cooldown)} ability cooldown`, c: 'affix' });
    for (const a of item.affixes) lines.push({ t: AFFIXES[a.id].fmt(a.v), c: 'affix' });
  } else if (item.kind === 'trinket') {
    lines.push({ t: TRINKETS[item.base].name, c: 'type' });
    for (const a of item.affixes) lines.push({ t: AFFIXES[a.id].fmt(a.v), c: 'affix' });
  } else if (item.kind === 'relic') {
    const R = RELICS[item.id];
    lines.push({ t: R.cursed ? 'Cursed Relic' : 'Relic', c: R.cursed ? 'neg' : 'type' });
    lines.push({ t: R.desc, c: 'affix' });
  } else if (item.kind === 'ability') {
    const A = ABILITIES[item.id];
    lines.push({ t: `Ability · ${A.cd}s cooldown · [R]`, c: 'type' });
    lines.push({ t: A.desc, c: 'affix' });
  }
  return lines;
}

function speedWord(s) {
  if (s >= 1.4) return 'very fast';
  if (s >= 1.0) return 'fast';
  if (s >= 0.78) return 'medium';
  if (s >= 0.6) return 'slow';
  return 'very slow';
}

export function itemValue(item) {
  const base = { weapon: 40, armor: 35, trinket: 45, relic: 70, ability: 80 }[item.kind] || 20;
  return Math.round(base * (1 + item.rarity * 0.8) * (1 + (item.level || 1) * 0.15));
}
