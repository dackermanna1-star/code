// Zombie survival horde AI (Milestone 2.3, owner: hordeai): flank fields, surround slots and a
// bigger crowd. About diff.ai.flank of the commons follow a side flow field for life (built
// besides the main one, ZombieMode.buildFlow, with a crowding penalty and per-wave noise) so
// they come by other routes; within diff.ai.surround of their target they take a ring slot
// around it instead of queueing (falling back to straight at him when nav.canWalk fails).
//
// Contract (m2-contracts). zombies.js calls, every one cheap and allocation-free:
//   horde.flow(t)                       right after the main field is rebuilt (every 0.4 s):
//                                       rebuild a side field now and then
//   horde.field(z)                      the distance field z follows (Float32Array per nav
//                                       node; ZombieMode.flowGoal / nextHop walk it downhill).
//                                       Must return Z.dist for bosses, specials, and whenever
//                                       a side field isn't built yet.
//   horde.approach(z, target, tf, feet, t)  close to its target with a clear walk: the point
//                                       to go for (a ring slot), or null for tf itself
//   horde.spawned(z)                    a zombie just came up (pick its field: z.field)
// Per zombie (reset in spawnZombie): z.field (0 = the main field, k = side field k), z.slot
// (-1 = none). hordeai owns zombies.js buildFlow / nextHop / flowGoal / chase / separate.
// Difficulty: g.zombies.diff.ai { flank, fields, surround, slots } (zdiff.js); the crowd size
// (horde.maxAlive*, MAX_ALIVE) stays in HORDE: Normal stays fair, more on Hard / Nightmare.
//
// Scaffold (foundation): no-op, every zombie on the main field, no slots.

export class ZHorde {
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

  /** The main field was just rebuilt (ZombieMode.buildFlow). */
  flow(t) { void t; }

  /** The field zombie z walks down. */
  field(z) { void z; return this.Z.dist; }

  /** Close to its target: a ring slot to go for, or null (straight at tf). */
  approach(z, target, tf, feet, t) { void z; void target; void tf; void feet; void t; return null; }

  /** A zombie just came up (ZombieMode.spawnZombie). */
  spawned(z) { void z; }

  /** HUD state (buildHudState, every frame). */
  hud(s) { void s; }

  /** Per frame (game.frame, zombie mode only). */
  frame(dt) { void dt; }

  /** An unclaimed command (ZombieMode.command). True when it was ours. */
  command(p, cmd, args) { void p; void cmd; void args; return false; }
}
