// Power-ups and timed buffs (Milestone 3.5, owner: drops). Rare power-ups drop from kills:
// Max Ammo, Insta-Kill for 15 s (not on bosses), Double Cash, Nuke (not on bosses), Fire Sale.
//
//  - BUFFS: timed modifiers, granted with g.zombies.perks.buff(p | 'squad', id, secs). Rows
//    have the PERKS row shape (perks.js: name, text, stats, icon...) and are registered as
//    rarity 'buff' (never drafted); secs defaults to diff.drops.powerupSecs. A buff with stats
//    feeds the modifier pipeline (zmods.js) while it lasts; one that needs logic (Insta-Kill)
//    adds a zmods hook once (mods.addHook('out', ...)) and checks perks.has(p, id) inside.
//  - POWERUPS: what a power-up pickup does (pickups.js kind 'powerup', d.id): { name, rgb,
//    weight (drop odds), buff (a BUFFS id) and squad (on everyone), or apply(Z, p, d) for
//    an instant one (Max Ammo, Nuke) }.
//
// Scaffold (foundation): Double Cash, to code against. Nothing drops it yet.

export const BUFFS = {
  doublecash: { name: 'Double Cash', text: 'Everything the squad earns is doubled.', stats: { money: 1 } },
};

export const POWERUPS = {
  doublecash: { name: 'DOUBLE CASH', rgb: [90, 230, 90], weight: 1, buff: 'doublecash', squad: true },
};
