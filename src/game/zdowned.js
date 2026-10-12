// Zombie survival downed / revive (Milestone 1.3): at 0 HP you go down instead of dying,
// a teammate (or bot) holds use to pick you up, you bleed out if nobody does, and the run
// ends only when the whole squad is down or dead. Bleed-out and revive times come from the
// difficulty (g.zombies.diff.squad).
// Scaffold: ZombieMode builds it and calls tick(t) first thing every tick; buildHudState
// calls hud(s) every frame. Run resets: listen for the 'run' event.
export class ZDowned {
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
