// Zombie survival economy (Milestone 1.2): money that matters and a real break phase.
// Start money and kill pay from the difficulty (g.zombies.diff.econ), buying gated by the
// phase (guns and upgrades in the break, ammo / medkits / armour mid-wave at a premium),
// ready-up to cut the break short, bots buying on a budget.
// Scaffold: ZombieMode builds it and calls tick(t) first thing every tick (before a break
// ends); buildHudState calls hud(s) every frame. Run resets: listen for the 'run' event.
export class ZEconomy {
  constructor(game) {
    this.game = game;
  }

  /** Every tick while the mode runs (ZombieMode.tick, before the break / wave logic). */
  tick() {}

  /** HUD state (buildHudState, zombie survival only): add this feature's fields to s. */
  hud() {}

  /** A key / console command nothing else took (ZombieMode.command): true if it was yours. */
  command() { return false; }
}
