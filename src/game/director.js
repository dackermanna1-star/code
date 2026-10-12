// Zombie survival wave director (Milestone 2.4, owner: director): each wave opens one or two
// named fronts ("They're coming through B TUNNELS", a positional horde roar, an arrow at the
// screen edge), follows a trickle -> surge -> final push rhythm, and now and then has a type
// (MODS: Horde Rush, Specials Squad, Crawler Swarm, The Dead Rise, Iron Rain, Twin Elites)
// from a deck that never repeats the last two and leaves every fifth wave to the boss. The
// radar turns ping-based (seen, heard or within diff.director.pingRange; Casual keeps blips).
//
// Contract (m2-contracts). ZombieMode asks the director, in this order:
//   plan(n, stats, boss)      startWave: the wave's stats after the boss halving; returns the
//                             stats to play (a copy with .mod set, counts adjusted...). The
//                             'wave' start event then carries stats.mod.
//   tick(t)                   every tick, before the spawn step (pacing phases, fronts)
//   maxAlive(S, t)            how many may be up right now (a surge: more; calm: fewer)
//   next(t, left)             what comes next and from where: a reused order { kind (a special,
//                             or null), variant (COMMONS id or null: zroster.js picks), front
//                             (ZOMBIE_FRONTS id or null: anywhere) }; left = spawns left in the
//                             wave's count. Queued spawns (queue()) come first once due.
//   interval(S, t)            seconds to the next spawn
// Others plug in:
//   queue(kind, { variant, front, at })   a planned spawn (counted in the wave): specialsux's
//                             combo pairs (the second of a pair from the same front, a few s
//                             later), surges. kind: a special, or null for a common.
//   surge(src, o)             ask for a surge now (the screamer: src = the screamer zombie, o.by =
//                             'screamer'); true when one started
//   fronts() / front(id)      the map's fronts { id, name, zones, pos, nodes }; candidates(id)
//                             the spawn nodes of a front (null: unknown, or fewer than MIN_FRONT
//                             nodes - spawn anywhere). ZombieMode.pickSpawn(front) uses them.
// Events (runstats.js): 'front' { phase: 'open' | 'close', id, name, pos } and 'pace'
// { phase: 'trickle' | 'surge' | 'push' | 'calm', front, by }; the wave type rides on 'wave'.
// The Dead Rise: gore.records (baked bodies) + BossDirector.standBeside + spawnZombie({ at, risen }).
// Difficulty: g.zombies.diff.director { fronts, modsFrom, modChance, surge, surgeAlive, calm,
// radar, pingRange } (zdiff.js).
//
// Scaffold (foundation): today's spawning exactly - no type, no fronts, a special by
// Specials.pick, the wave's interval x 0.6-1.4; the queue works; full radar.
import { zoneOf } from './bots.js';

const rand = (a, b) => a + Math.random() * (b - a);
/** A front with fewer spawn nodes than this isn't used (spawn anywhere instead). */
export const MIN_FRONT = 10;

/**
 * Where the horde comes from, per map (by the map's id): fronts made of the bots' callout
 * zones (bots.js ZONES; a spawn node belongs to the first zone that holds it). BSP maps have
 * none: the director builder clusters their spawn nodes by path distance.
 */
export const ZOMBIE_FRONTS = {
  de_dust2: [
    { id: 'tspawn', name: 'T SPAWN', zones: ['T Spawn'] },
    { id: 'tunnels', name: 'B TUNNELS', zones: ['Outside Tunnels', 'Upper Tunnels', 'Lower Tunnels', 'B Tunnels'] },
    { id: 'long', name: 'LONG A', zones: ['Outside Long', 'Long Doors', 'Pit', 'Long A'] },
    { id: 'mid', name: 'MID', zones: ['Top Mid', 'Mid'] },
    { id: 'bsite', name: 'B SITE', zones: ['B Site', 'B Doors', 'B Window'] },
    { id: 'asite', name: 'A SITE', zones: ['A Site', 'A Ramp', 'A Short', 'Catwalk', 'Under A'] },
    { id: 'ctspawn', name: 'CT SPAWN', zones: ['CT Spawn', 'CT Mid', 'CT B Road'] },
  ],
};

/**
 * Wave types: banner label, pick weight in the deck (0 = off until built), needs (a COMMONS
 * variant that must exist first). What each does is the director's (and roster's) to build.
 */
export const MODS = {
  rush: { label: 'HORDE RUSH', weight: 0 },
  specials: { label: 'SPECIALS SQUAD', weight: 0 },
  crawlers: { label: 'CRAWLER SWARM', weight: 0, needs: 'crawler' },
  risen: { label: 'THE DEAD RISE', weight: 0 },
  iron: { label: 'IRON RAIN', weight: 0, needs: 'riot' },
  elites: { label: 'TWIN ELITES', weight: 0 },
};

export class WaveDirector {
  constructor(game) {
    this.game = game;
    this.subscribed = false;
    this.order = { kind: null, variant: null, front: null };
    this.pending = []; // queued spawns { kind, variant, front, at }, soonest first
    this.frontsBy = null; this.frontsFor = null; // the map's fronts (built on first use)
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

  reset() {
    this.pending.length = 0;
    this.phase = 'trickle'; // trickle | surge | push | calm
    this.mod = null; // this wave's type (MODS id)
    this.open = []; // this wave's fronts (ids)
  }

  /** startWave: the stats to play wave n with (see the header). */
  plan(n, stats, boss) {
    void n; void boss;
    this.pending.length = 0; // (last wave's plans are void)
    this.phase = 'trickle';
    this.mod = stats.mod ?? null;
    this.open.length = 0;
    return stats;
  }

  /** Every tick, before the spawn step (ZombieMode.tick). */
  tick(t) { void t; }

  /** How many may be up at once right now. */
  maxAlive(S, t) { void t; return S.maxAlive; }

  /** Seconds to the next spawn. */
  interval(S, t) { void t; return S.interval * rand(0.6, 1.4); }

  /** What comes next and from where (a reused order: read it now). */
  next(t, left) {
    void left;
    const o = this.order, q = this.pending[0];
    if (q && t >= q.at) {
      this.pending.shift();
      o.kind = q.kind; o.variant = q.variant; o.front = q.front;
      return o;
    }
    o.kind = this.Z.specials.pick(this.Z.wave);
    o.variant = null; o.front = null;
    return o;
  }

  /** A planned spawn, counted in the wave (combo pairs, surges). */
  queue(kind, o = {}) {
    const e = { kind: kind || null, variant: o.variant || null, front: o.front || null, at: o.at ?? this.game.time };
    let i = this.pending.length;
    while (i > 0 && this.pending[i - 1].at > e.at) i--;
    this.pending.splice(i, 0, e);
    return true;
  }

  /** Ask for a surge now (a screamer: src = it, o.by = 'screamer'). True when one started. */
  surge(src, o) { void src; void o; return false; }

  // ---------------------------------------------------------------- fronts
  /** The map's fronts: { id, name, zones, pos (the middle of its spawn nodes), nodes }. */
  fronts() {
    const cands = this.Z.spawnCandidates();
    if (this.frontsFor === cands) return this.frontsList;
    this.frontsFor = cands;
    this.frontsBy = new Map();
    this.frontsList = [];
    const g = this.game, defs = ZOMBIE_FRONTS[g.W?.mapDef?.id || g.map?.name] || [];
    for (const d of defs) {
      const zones = new Set(d.zones), nodes = [];
      let x = 0, y = 0, z = 0;
      for (const n of cands) {
        const zn = zoneOf([n.x, n.y, n.z]);
        if (!zn || !zones.has(zn[0])) continue;
        nodes.push(n); x += n.x; y += n.y; z += n.z;
      }
      const k = nodes.length || 1;
      const f = { id: d.id, name: d.name, zones: d.zones, pos: [x / k, y / k, z / k], nodes };
      this.frontsBy.set(d.id, f);
      this.frontsList.push(f);
    }
    return this.frontsList;
  }

  front(id) { this.fronts(); return this.frontsBy.get(id) || null; }

  /** A front's spawn nodes, or null (unknown, or too few: spawn anywhere). */
  candidates(id) {
    const f = id ? this.front(id) : null;
    return f && f.nodes.length >= MIN_FRONT ? f.nodes : null;
  }

  /** HUD state (buildHudState, every frame; after economy / downed / feedback): the radar policy, the front arrows. */
  hud(s) { void s; }

  /** Per frame (game.frame, zombie mode only). */
  frame(dt) { void dt; }

  /** An unclaimed command (ZombieMode.command). True when it was ours. */
  command(p, cmd, args) { void p; void cmd; void args; return false; }
}
