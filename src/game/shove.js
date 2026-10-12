// Zombie survival melee shove (Milestone 2.2, owner: shove). Any weapon bashes: zombies in a
// short cone in front (60 degrees, 70 u: the pool, specials and the boss) are pushed back and
// staggered (g.zombies.stagger(z, amount, dir, 'shove', p)), lose their swing, and a teammate
// held by a hunter or a smoker is pulled free (g.zombies.specials.letGo(special)). Spamming it
// tires you (pips near the crosshair, L4D style). Bots shove too (bots.js combat, zombie branch).
//
// Contract (m2-contracts):
//   shove.command(p, 'shove')       the key bind / console command (mouse4 or a bound key; F
//                                   stays the flashlight). True when taken.
//   shove.tryShove(p)               do it for p (you or a bot); returns the zombies hit, or -1
//                                   when it can't (tired, down, dead, mid-reload is up to you)
//   shove.pips(p)                   fatigue pips left (for the HUD and the bots)
// Per player: p.shove = { pips, regenAt, until (the bash animation), tiredUntil } (this module's).
// Difficulty: g.zombies.diff.shove { pips, regen, tired } (zdiff.js). Event: 'shove' (runstats.js).
//
// Scaffold (foundation): no-op. Nothing is bound and command() takes nothing yet.

export class Shove {
  constructor(game) {
    this.game = game;
    this.subscribed = false;
    this.reset();
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

  /** Every tick (ZombieMode.tick): fatigue comes back. */
  tick(t) { void t; }

  /** Shove for p now. Returns how many zombies it hit, -1 when it can't. */
  tryShove(p) { void p; return -1; }

  /** Fatigue pips p has left. */
  pips(p) { void p; return this.Z.diff.shove.pips; }

  /** A bot in a fight with zombie e at distance d (bots.js): true when it shoved instead. */
  bot(bot, e, d) { void bot; void e; void d; return false; }

  /** HUD state (buildHudState, every frame): the fatigue pips. */
  hud(s) { void s; }

  /** Per frame (game.frame, zombie mode only). */
  frame(dt) { void dt; }

  /** An unclaimed command (ZombieMode.command): 'shove'. True when it was ours. */
  command(p, cmd, args) { void p; void cmd; void args; return false; }
}
