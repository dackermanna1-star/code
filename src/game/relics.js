// Boss relics and the trophy (Milestone 3.4, owner: bosses). A boss kill no longer heals the
// squad to full (bosses.js reward): it gives diff.boss.heal HP (and diff.boss.armor armour)
// and a trophy pops out of the body - a gold idol under a beam of the boss's colour. Whoever
// grabs it (you: bots leave it to you) picks 1 of diff.boss.relics relics, rare perks only
// trophies give: the boss's own signature relic (BOSS_RELIC) and the rest rolled
// (perks.roll(n, { rarity: 'relic' }), perks.offer(p, ids, { source: 'trophy' })). No
// friendly-thrall relic (deferred: it inverts "zombies are always hostile").
//
// RELICS rows have the PERKS row shape (perks.js: name, text, tags, stats, max, icon...) and
// are registered as rarity 'relic'. Their stats feed the modifier pipeline (zmods.js) on their
// own. TROPHY is the trophy's pickup kind (pickups.js registers it; its model, 'bosstrophy',
// is src/assets/trophy.js, registered into pickups MODELS by bosses.js).

export const RELICS = {
  // ---- the bosses' own (one of a trophy's choices is the signature relic of the boss it came from)
  cleaver: { name: "Butcher's Cleaver", text: 'Melee hits deal double damage, bosses take 15% more from you, claws hurt 15% less.', tags: ['melee', 'body'], stats: { meleeDamage: 1, bossDamage: 0.15, takenClaw: -0.15 } },
  acidgland: { name: 'Acid Gland', text: 'Acid hurts 60% less and fire 30% less. +15 max health.', tags: ['body'], stats: { takenAcid: -0.6, takenFire: -0.3, maxHealth: 15 } },
  veil: { name: "Banshee's Veil", text: 'Move 10% faster, draw 30% faster and reload 15% faster.', tags: ['guns'], stats: { speed: 0.1, handling: 0.3, reload: 0.15 } },
  infernocore: { name: 'Inferno Core', text: 'Fire deals 50% more and explosives 25% more; fire hurts you half as much.', tags: ['fire', 'blast'], stats: { fireDamage: 0.5, blastDamage: 0.25, takenFire: -0.5 } },
  plating: { name: 'Abomination Plating', text: '15% less damage, 35% less from blasts, +25 max health - and 5% slower.', tags: ['body'], stats: { taken: -0.15, takenBlast: -0.35, maxHealth: 25, speed: -0.05 } },
  // ---- the rest (rolled)
  ironheart: { name: 'Iron Heart', text: '+40 max health and 10% less damage taken.', tags: ['body'], stats: { maxHealth: 40, taken: -0.1 } },
  hunterseye: { name: "Hunter's Eye", text: 'Headshots deal 40% more damage, and specials take 20% more.', tags: ['aim'], stats: { headDamage: 0.4, specialDamage: 0.2 } },
  crown: { name: 'Bloodied Crown', text: 'Bosses take 30% more damage from you, specials and elites 15% more.', tags: ['aim'], stats: { bossDamage: 0.3, specialDamage: 0.15 } },
  seal: { name: "Quartermaster's Seal", text: 'Magazines hold 30% more; reload 20% faster.', tags: ['guns'], stats: { clip: 0.3, reload: 0.2 } },
  coin: { name: "Gravedigger's Coin", text: 'Earn 25% more money; the shop costs 10% less.', tags: ['money'], stats: { money: 0.25, price: -0.1 } },
  adrenal: { name: 'Adrenal Gland', text: 'Fire 15% faster and move 5% faster.', tags: ['guns'], stats: { fireRate: 0.15, speed: 0.05 } },
};

/** Each boss's signature relic (bosses.js BOSSES ids): always one of its trophy's choices. */
export const BOSS_RELIC = { butcher: 'cleaver', spitter: 'acidgland', banshee: 'veil', inferno: 'infernocore', abomination: 'plating' };

/**
 * A trophy's choices for p: the boss's signature relic (unless p holds it at its max), the
 * rest rolled among the relics p can still take. n: how many (diff.boss.relics).
 */
export function relicChoices(Z, p, bossId, n) {
  const sig = BOSS_RELIC[bossId];
  const first = sig && (p?.perks?.get(sig)?.n || 0) < 1 ? [sig] : [];
  return first.concat(Z.perks.roll(Math.max(0, n - first.length), { rarity: 'relic', p, exclude: first }));
}

/**
 * The trophy's pickup kind (pickups.js PICKUP_KINDS shape). d.data: { boss (its name), bossId,
 * rgb, choices (relic ids; else relicChoices when it's taken) }. Yours to take (bots leave it),
 * walking over it; it never fades.
 */
export const TROPHY = {
  label: 'Trophy', rgb: [255, 190, 60], reach: 44, life: 0, who: 'human', model: 'bosstrophy', spin: 1.2, bob: 3,
  take(Z, p, d) {
    const ids = d.data?.choices?.length ? d.data.choices : relicChoices(Z, p, d.data?.bossId, Z.diff.boss.relics);
    if (!ids.length) return false;
    Z.perks.offer(p, ids, { source: 'trophy', title: d.data?.boss ? `${d.data.boss}'S TROPHY` : 'BOSS TROPHY' });
    if (p.isLocal) Z.game.sound?.play('trophy_take', { volume: 0.9, attenuation: 'none' });
    Z.events.mode('trophy', { phase: 'take', player: p, boss: d.data?.boss || null });
    return true;
  },
};
