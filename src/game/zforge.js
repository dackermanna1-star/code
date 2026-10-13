// Zombie survival weapon forge (Milestone 3.2, owner: forge). Forge any gun up through Tiers
// I-V at the break for damage, magazine size and reload speed, with a tier paint; from Tier
// III (diff.forge.roundFrom) it takes one round type: Incendiary, Shock, Cryo, Explosive
// (small blasts that never gib a corpse) or Vampiric. A Tier V Deagle stays viable at wave 25.
//
// Contract (m3-contracts section 5):
//  - the weapon carries it: w.tier (0-5) and w.round (a ROUNDS id or null), folded by
//    attachments.js refresh() into the weapon layer w.mods: m.damage, m.clip and m.reload
//    (a time multiplier; weaponsys reads it next to its holder's ctx.zk). The player layer
//    (perks: zmods.js) multiplies with it.
//  - buy items 'tier_<n>' / 'round_<id>' (buydata.js: a Forge subpage of Upgrades): rounds.buyItem
//    routes /^(att|skin|tier|round)_/ to attachments.buyUpgrade, which hands tier / round here
//    (buy); the economy asks price / menuState for the menu (zeconomy.js base / owned).
//  - the tesla, chainsaw, flamethrower and projectiles read w.mods.damage too (bullets already
//    do: weaponsys shoot); add it where they compute damage (game.js sawFrom / zapFrom, fire.js
//    stream, projectiles.js) - one factor each.
//  - procs fire on the bus 'hit' (squad attacker, the weapon in hand has w.round), with a
//    per-victim cooldown and a per-weapon proc rate (the minigun's and the AA-12's pellets low);
//    a proc that deals damage passes opts so it can't proc again (and never explode: true on a
//    corpse). damageKind (zmods.js) says what a hit was.
// Events: 'forge' { player, weapon (id), kind: 'tier' | 'round', tier, round, cost }, 'proc'
// { attacker, victim, round, weapon } (hot: obj / emit behind has()).
// Difficulty: g.zombies.diff.forge { priceK, tiers, roundFrom, procK } (zdiff.js).
//
// Scaffold (foundation): nothing for sale yet (the tier_ / round_ routes say so).
export const ROUNDS = {
  incendiary: { name: 'Incendiary Rounds' },
  shock: { name: 'Shock Rounds' },
  cryo: { name: 'Cryo Rounds' },
  explosive: { name: 'Explosive Rounds' },
  vampiric: { name: 'Vampiric Rounds' },
};

export class ZForge {
  constructor(game) {
    this.game = game;
    this.subscribed = false;
    Promise.resolve().then(() => this.subscribe()); // (built before game.zombies is set)
  }

  get Z() { return this.game.zombies; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') this.reset(); });
  }

  reset() {}

  /** attachments.buyUpgrade for 'tier_<n>' / 'round_<id>': pay(cost) -> bool, say(text). True if bought. */
  buy(p, item, pay, say) { void p; void item; void pay; say('The forge is not open yet.'); return false; }

  /** zeconomy.base: the list price of a forge item for p (the gun it goes on), or null. */
  price(p, item) { void p; void item; return null; }

  /** zeconomy.owned: { off, note } for the buy menu. */
  menuState(p, item) { void p; void item; return { off: true, note: 'soon' }; }

  /** Every tick (ZombieMode.tick). */
  tick(t) { void t; }

  /** HUD state (buildHudState, every frame). */
  hud(s) { void s; }

  /** Per frame (game.frame, zombie mode only). */
  frame(dt) { void dt; }

  /** An unclaimed command (ZombieMode.command). True when it was ours. */
  command(p, cmd, args) { void p; void cmd; void args; return false; }
}
