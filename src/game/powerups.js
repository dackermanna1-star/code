// Power-ups and timed buffs (Milestone 3.5, owner: drops). Rare power-ups drop from kills:
// Max Ammo, Insta-Kill for 15 s (not on bosses), Double Cash, Nuke (not on bosses), Fire Sale.
//
//  - BUFFS: timed modifiers, granted with g.zombies.perks.buff(p | 'squad', id, secs). Rows
//    have the PERKS row shape (perks.js: name, text, stats, icon...) and are registered as
//    rarity 'buff' (never drafted); secs defaults to diff.drops.powerupSecs. A buff with stats
//    feeds the modifier pipeline (zmods.js) while it lasts; one that needs logic (Insta-Kill)
//    has a zmods hook (mods.addHook('out', ...)) that checks perks.has(p, id) inside.
//  - POWERUPS: what a power-up pickup does (pickups.js kind 'powerup', d.id): { name (the
//    banner), say (the announcer), sub (the banner's second line, or (Z) => it), rgb, weight
//    (drop odds), from (first wave it drops in), wave (only mid-wave), sound (its stinger),
//    buff (a BUFFS id) and squad (on everyone), or apply(Z, p, d) for an instant one (Max
//    Ammo, Nuke) }.
//
// The hooks (Insta-Kill's damage, Fire Sale's prices) are only on while one of those runs
// (installHooks / removeHooks), so the pipeline stays idle (mods.live false) the rest of the
// time, and always in classic CS. Fire Sale also opens the whole shop mid-wave (zeconomy.js
// open: one line).
import { inSquad } from './runstats.js';
import { TEAM_CT } from './player.js';

export const BUFFS = {
  doublecash: { name: 'Double Cash', text: 'Everything the squad earns is doubled.', stats: { money: 1 } },
  instakill: { name: 'Insta-Kill', text: 'Every zombie dies in one hit (bosses take no extra).' },
  firesale: { name: 'Fire Sale', text: 'The whole shop is open, mid-wave too, at a knock-down price.' },
};

/** Max Ammo: every gun in the squad (primaries and pistols, launchers and fuel tanks) to full reserves. */
function maxAmmo(Z) {
  for (const q of Z.game.players) {
    if (!inSquad(q) || !q.alive) continue;
    for (const s of [1, 2]) { const w = q.weapons[s]; if (w && w.def.maxAmmo > 0) w.ammo = w.def.maxAmmo; }
  }
}

export const POWERUPS = {
  maxammo: { name: 'MAX AMMO', say: 'Max Ammo!', sub: 'Every gun in the squad: full reserves', rgb: [70, 160, 255], weight: 3, from: 1, sound: 'pu_maxammo', apply: (Z) => maxAmmo(Z) },
  instakill: { name: 'INSTA-KILL', say: 'Insta-Kill!', sub: 'One hit, one kill', rgb: [255, 45, 45], weight: 2, from: 3, sound: 'pu_instakill', buff: 'instakill', squad: true },
  doublecash: { name: 'DOUBLE CASH', say: 'Double Cash!', sub: 'Everything the squad earns, doubled', rgb: [70, 235, 90], weight: 2, from: 2, sound: 'pu_doublecash', buff: 'doublecash', squad: true },
  nuke: { name: 'NUKE', say: 'Kaboom!', sub: 'Every zombie on the map, gone', rgb: [255, 215, 40], weight: 1, from: 5, wave: true, sound: 'pu_nuke', apply: (Z, p, d) => Z.pickups.nuke(p, d.pos) },
  firesale: { name: 'FIRE SALE', say: 'Fire Sale!', sub: (Z) => `The whole shop is open, ${Math.round((1 - Z.diff.drops.fireSale) * 100)}% off`, rgb: [255, 120, 25], weight: 1.5, from: 4, wave: true, sound: 'pu_firesale', buff: 'firesale', squad: true, apply: (Z) => Z.pickups.fireSale() },
};
export const POWERUP_IDS = Object.keys(POWERUPS);

/** x an elite's damage under Insta-Kill (they're the wave's mini-bosses: hurt, not erased). */
const ELITE_K = 4;

/**
 * The conditional effects, on while a power-up that needs one runs (so the pipeline idles
 * again after: mods.live): Insta-Kill (an 'out' hook: anything short of a boss dies in one
 * hit; an elite takes ELITE_K x), Fire Sale (a 'price' hook: x diff.drops.fireSale). The
 * hooks check their buff themselves (perks.has), so one left on a moment longer is harmless.
 */
export function installHooks(Z) {
  if (Z.pickups.powerHooks) return;
  const perks = Z.perks;
  Z.pickups.powerHooks = [
    Z.mods.addHook('out', (a, v, dmg) => {
      if (v.isBoss || !perks.has(a, 'instakill')) return dmg;
      if (v.elite) return dmg * ELITE_K;
      return Math.max(dmg, (v.health + (v.armor || 0)) * 2 + 50); // (through any armour: zroster.js riot vests)
    }),
    Z.mods.addHook('price', (p, item, k) => (p.team === TEAM_CT && perks.has(p, 'firesale') ? k * Z.diff.drops.fireSale : k)),
  ];
}

/** Take the hooks off again (every power-up that needs them has run out, or a new run). */
export function removeHooks(Z) {
  const H = Z.pickups.powerHooks;
  if (!H) return;
  for (const off of H) off();
  Z.pickups.powerHooks = null;
}
