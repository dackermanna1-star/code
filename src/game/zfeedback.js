// Zombie survival hit confirmation and combat readability (Milestone 1.5): hit markers and
// hit sounds (from the 'hit' / 'kill' events), a quieter kill feed with streaks, queued
// centre messages, a smooth decaying camera shake, short hit-stops on big moments, a low-HP
// vignette and heartbeat.
// Scaffold: ZombieMode builds it and calls tick(t) first thing every tick; buildHudState
// calls hud(s) every frame. Run resets: listen for the 'run' event. Drawing: register a
// layer with game.hud.addLayer.
export class ZFeedback {
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
