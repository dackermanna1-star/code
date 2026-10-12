// Zombie survival readable specials and the combo director (Milestone 2.6, owner: specialsux).
// Telegraphs show as coloured arcs on a ring around the crosshair (a hunter winding up on your
// right, a smoker's tongue line; at most 3, merged by direction), specials get a faint rim
// glow (the boss setGlow / glowMap, pulsing on a telegraph) and aiming at one shows its name;
// a pinned ally gets a HELP marker, and freeing him a "SAVED Bravo". From diff.combo.from,
// planned pairs come from one front a few seconds apart (smoker + hunter, a boomer then a
// sprinter pack): Specials.pick turns a pick into the first of a pair and queues the second
// with g.zombies.director.queue(kind, { front, at }). Bots call specials out.
//
// Contract (m2-contracts):
//   g.zombies.specials.threats()   every special telegraphing or mid-trick right now, as reused
//                                  records { z, kind, phase: 'windup' | 'attack' | 'hold',
//                                  target (who it's after / holding), left (s until it lands;
//                                  0 once it has), pos ([x,y,z] its eyes) } - read them this
//                                  frame, don't keep them. specialsux may add fields.
//   g.zombies.specials.letGo(z)    a hunter / smoker lets go of whoever it holds (shove, saves)
// Events: 'save' { player, by, kind }, 'combo' { kinds, front } (runstats.js).
// Difficulty: g.zombies.diff.combo { from, chance, gap, arcs } (zdiff.js).
// Bearings: project like game.hudDamage does (yaw of the threat relative to the view).
//
// Scaffold (foundation): no-op; threats() and letGo() already work (specials.js).

export class ZThreats {
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

  /** Every tick (ZombieMode.tick). */
  tick(t) { void t; }

  /** HUD state (buildHudState, every frame): the arcs, HELP markers, the name under the crosshair. */
  hud(s) { void s; }

  /** Per frame (game.frame, zombie mode only): rim glow. */
  frame(dt) { void dt; }

  /** An unclaimed command (ZombieMode.command). True when it was ours. */
  command(p, cmd, args) { void p; void cmd; void args; return false; }
}
