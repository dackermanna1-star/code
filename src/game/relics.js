// Boss relics and the trophy (Milestone 3.4, owner: bosses). A boss kill no longer heals the
// squad to full (bosses.js reward): it gives diff.boss.heal HP and drops a trophy where it fell;
// whoever takes the trophy picks 1 of diff.boss.relics relics - rare perks only trophies give
// (perks.roll(n, { rarity: 'relic' }), perks.offer(p, ids, { source: 'trophy' })). No
// friendly-thrall relic (deferred: it inverts "zombies are always hostile").
//
// RELICS rows have the PERKS row shape (perks.js: name, text, tags, stats, max, icon...) and
// are registered as rarity 'relic'. TROPHY is the trophy's pickup kind (pickups.js registers it).
//
// Scaffold (foundation): two relics to code against, and a working trophy pickup (nothing
// drops one yet: reward() still heals the squad to full, as before).

export const RELICS = {
  ironheart: { name: 'Iron Heart', text: '+40 max health and 10% less damage taken.', tags: ['body'], stats: { maxHealth: 40, taken: -0.1 } },
  hunterseye: { name: "Hunter's Eye", text: 'Headshots deal 40% more damage, and specials take 20% more.', tags: ['aim'], stats: { headDamage: 0.4, specialDamage: 0.2 } },
};

/**
 * The trophy's pickup kind (pickups.js PICKUP_KINDS shape). d.data.choices: the relic ids it
 * offers (else rolled when it's taken). Taken by walking over it; it never fades.
 */
export const TROPHY = {
  label: 'Trophy', rgb: [255, 190, 60], reach: 40, life: 0, who: 'squad', model: 'trophy', spin: 1.2, bob: 3,
  take(Z, p, d) {
    const ids = d.data?.choices?.length ? d.data.choices : Z.perks.roll(Z.diff.boss.relics, { rarity: 'relic', p });
    if (!ids.length) return false;
    Z.perks.offer(p, ids, { source: 'trophy', title: `TROPHY${d.data?.boss ? `: ${d.data.boss}` : ''}` });
    return true;
  },
};
