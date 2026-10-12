// Zombie survival wave director (Milestone 2.4): each wave opens one or two named fronts
// ("They're coming through B TUNNELS", a positional horde roar, an arrow at the screen edge),
// follows a trickle -> surge -> final push rhythm, and now and then has a type (MODS: Horde
// Rush, Specials Squad, Crawler Swarm, The Dead Rise, Iron Rain, Twin Elites) drawn from a deck
// that never repeats the last two and leaves every fifth wave to the boss. The radar turns
// ping-based: a zombie shows when seen, heard or within diff.director.pingRange (Casual keeps
// every blip; hardcore keeps its sweep, zfeedback.js).
//
// Contract (m2-contracts). ZombieMode asks the director, in this order:
//   plan(n, stats, boss)      startWave: the wave's stats after the boss halving; returns the
//                             stats to play (a copy with .mod set, counts adjusted). The 'wave'
//                             start event then carries stats.mod.
//   tick(t)                   every tick, before the spawn step (pacing phases, The Dead Rise)
//   maxAlive(S, t)            how many may be up right now (a surge: more; calm: none new)
//   next(t, left)             what comes next and from where: a reused order { kind (a special,
//                             or null), variant (COMMONS id or null: zroster.js picks), front
//                             (a front id or null: anywhere), elite (a Twin Elite) }; left =
//                             spawns left in the wave's count. Queued spawns come first once due.
//   interval(S, t)            seconds to the next spawn
// Others plug in:
//   queue(kind, { variant, front, at, elite })  a planned spawn (counted in the wave): combo
//                             pairs (specialsux), the Twin Elites. kind: a special, or null.
//   surge(src, o)             ask for a surge now (the screamer: src = the screamer zombie, o.by =
//                             'screamer'); true when one started
//   fronts() / front(id)      the map's fronts { id, name, via, zones, pos, mouth, nodes };
//                             candidates(id) the spawn nodes of a front (null: unknown, or fewer
//                             than MIN_FRONT nodes - spawn anywhere). ZombieMode.pickSpawn uses them.
//   elite(z, def)             Specials.spawn({ elite }): make a special one of the Twin Elites
// Events (runstats.js): 'front' { phase: 'open' | 'close', id, name, pos } and 'pace'
// { phase: 'trickle' | 'surge' | 'push' | 'calm', front, by }; the wave type rides on 'wave'.
// Difficulty: g.zombies.diff.director (zdiff.js DIRECTOR). Cheats (sv_cheats 1): zm_mod <id>
// (the next wave's type), zm_surge; zm_director prints the plan.
//
// Pacing on Normal stays fair: the trickle runs a little under the wave's maxAlive, a surge
// goes over it for a few seconds and is followed by a calm with nothing new coming in; the
// pressure lives in Hard / Nightmare's rows (bigger surges, shorter calms, a harder push).
import { zoneOf } from './bots.js';
import { MinHeap } from './nav.js';
import { MAX_ALIVE } from './zdiff.js';
import { COMMONS, COMMON_SKINS } from './zroster.js';
import { SPECIALS } from './specials.js';
import { TEAM_CT } from './player.js';
import { fontString } from '../ui/hud/font.js';

const rand = (a, b) => a + Math.random() * (b - a);
/** A front with fewer spawn nodes than this isn't used (spawn anywhere instead). */
export const MIN_FRONT = 10;
// a front's usable spawn nodes: this far (path, units) from the squad, and 700+ straight
const USE_NEAR = 700, USE_FAR = 3400, REACH_OK = 2600;
const SURGE_GAP = 12; // s between two surges at least (a screamer can't chain them)
const ROAR_MAX = 1400; // the roar plays toward the front, at most this far from you (audible)
const ARROW_TIME = 6, BANNER_TIME = 4.5, CALL_TIME = 4;
const TIP_COL = 0.32; // (x / screen width: the left column ztips' card sits in)
// the radar's pings: a zombie seen / heard stays on it this long; looked for every SEEK s
const PING_HOLD = 1.5, SEEK = 0.2, SEE_FAR = 2600, MATE_SEE = 1000, HEAR_GROWL = 1200, HEAR_RUN = 650;
const ARROW_RGB = [255, 110, 40], BANNER_RGB = [255, 96, 32], SUB_RGB = [235, 215, 180], TAG_RGB = [255, 150, 60], SURGE_RGB = [255, 60, 40];

/**
 * Where the horde comes from on de_dust2 (by the map's id), placed by hand from the bots'
 * callout zones (bots.js ZONES; a spawn node belongs to the first zone that holds it) and the
 * nav graph: zones (where its zombies come up), via (the callout's verb), mouth ([x, y]: where
 * the route breaks into the rest of the map - the roar and the arrow point there). A front only
 * opens when nobody in the squad stands in it (or by its mouth) and enough of its nodes are
 * 700-3400 u (path) from the squad: T SPAWN only once the squad has left CT spawn.
 * BSP maps have no table: their spawn nodes are clustered by path distance (cluster()).
 */
export const ZOMBIE_FRONTS = {
  de_dust2: [
    { id: 'tspawn', name: 'T SPAWN', via: 'from', zones: ['T Spawn'], mouth: [-700, -330] },
    { id: 'tunnels', name: 'B TUNNELS', via: 'through', zones: ['Outside Tunnels', 'Upper Tunnels', 'Lower Tunnels', 'B Tunnels'], mouth: [-1985, 1560] },
    { id: 'long', name: 'LONG A', via: 'down', zones: ['Outside Long', 'Long Doors', 'Pit', 'Long A'], mouth: [1480, 1900] },
    { id: 'mid', name: 'MID', via: 'through', zones: ['Top Mid', 'Mid'], mouth: [-440, 1500] },
    { id: 'bsite', name: 'B SITE', via: 'through', zones: ['B Site', 'B Doors', 'B Window'], mouth: [-1250, 2170] },
    { id: 'asite', name: 'A SITE', via: 'over', zones: ['A Site', 'A Ramp', 'A Short', 'Catwalk', 'Under A'], mouth: [900, 2500] },
    { id: 'ctspawn', name: 'CT SPAWN', via: 'through', zones: ['CT Spawn', 'CT Mid', 'CT B Road'], mouth: [-100, 2150] },
  ],
};

/**
 * Wave types: banner label and sub-line, pick weight in the deck, from (first wave on Normal;
 * + diff.director.modsFrom - 3), needs (a COMMONS variant the roster must have built: weight
 * > 0, else the type stays out of the deck). What each does: MOD_PLAN below.
 */
export const MODS = {
  rush: { label: 'HORDE RUSH', sub: 'More of them, faster - but they go down easier', weight: 3, from: 3 },
  specials: { label: 'SPECIALS SQUAD', sub: 'Fewer of them. Much nastier.', weight: 2, from: 4 },
  crawlers: { label: 'CRAWLER SWARM', sub: 'Watch your feet', weight: 2, from: 4, needs: 'crawler' },
  risen: { label: 'THE DEAD RISE', sub: 'Every body you dropped can get back up', weight: 2, from: 4 },
  iron: { label: 'IRON RAIN', sub: 'Riot gear - go for the head, hit them from the side', weight: 2, from: 7, needs: 'riot' },
  elites: { label: 'TWIN ELITES', sub: 'Two of their best are hunting you', weight: 1, from: 6 },
};

/** What a wave type does to the wave's stats S (a copy) at power k; returns the director's extras. */
const MOD_PLAN = {
  rush: (S, k, X) => { S.count = Math.round(S.count * (1 + 0.15 * k)); S.health = Math.round(S.health * 0.85); S.runners = Math.min(0.45, S.runners + 0.1 * k); X.interval = 1 - 0.2 * k; X.surge = 1 + 0.6 * k; },
  specials: (S, k) => { S.count = Math.max(4, Math.round(S.count * 0.85)); S.special = Math.min(0.4, S.special * 2 + 0.08 * k); S.perKind += 1; },
  crawlers: (S, k, X) => { S.count = Math.round(S.count * 1.2); X.variant = 'crawler'; X.share = Math.min(0.8, 0.55 * k); },
  risen: (S, k, X) => { X.rise = Math.min(0.6, 0.4 * k); },
  iron: (S, k, X) => { S.count = Math.max(4, Math.round(S.count * 0.85)); X.variant = 'riot'; X.share = Math.min(0.5, 0.25 * k); },
  elites: (S, k, X) => { S.count = Math.max(4, Math.round(S.count * 0.85)); X.elites = 2; X.eliteHp = 1.6 + 0.4 * k; },
};
const ELITE_KINDS = ['hunter', 'charger', 'smoker', 'boomer'];
const COMPASS = ['EAST', 'NORTH-EAST', 'NORTH', 'NORTH-WEST', 'WEST', 'SOUTH-WEST', 'SOUTH', 'SOUTH-EAST'];

const _eye = [0, 0, 0], _mate = [0, 0, 0], _head = [0, 0, 0], _roar = [0, 0, 0];

export class WaveDirector {
  constructor(game) {
    this.game = game;
    this.subscribed = false;
    this.order = { kind: null, variant: null, front: null, elite: 0 };
    this.pending = []; // queued spawns { kind, variant, front, at, elite }, soonest first
    this.frontsBy = null; this.frontsFor = null; // the map's fronts (built on first use)
    this.history = []; // the last wave types drawn (the deck never repeats the last two)
    this.force = undefined; // zm_mod: the next wave's type
    this.open = []; // this wave's fronts (front objects)
    this.lastOpen = [];
    this.arrows = [{ f: null, t0: -99 }, { f: null, t0: -99 }, { f: null, t0: -99 }];
    this.pings = []; // the radar's zombie blips (reused)
    this.raised = new WeakSet(); // gore records already risen (a body gets up once)
    this.F = { px: 0, big: '', mid: '', small: '' };
    this.reset();
    Promise.resolve().then(() => this.subscribe()); // (built before game.zombies is set)
    game.hud?.addLayer?.((hud, s) => this.draw(hud, s), 2);
  }

  get Z() { return this.game.zombies; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => {
      if (e.phase === 'start') { this.reset(); this.history.length = 0; this.lastOpen.length = 0; this.raised = new WeakSet(); }
      else this.closeFronts();
    });
    ev.on('wave', (e) => { if (e.phase === 'start') this.announce(); else this.closeFronts(); });
  }

  reset() {
    this.pending.length = 0;
    this.phase = 'calm'; // trickle | surge | push | calm
    this.mod = null; // this wave's type (MODS id)
    this.boss = false;
    this.closeFronts();
    this.surgeAt = []; this.surgeSize = 0; this.surgeLeft = 0; this.surgeFront = null; this.surgeBy = 'director'; this.lastSurge = -99;
    this.calmUntil = 0; this.pushAt = 0; this.pushed = false;
    this.X = { interval: 1, surge: 1, variant: null, share: 0, rise: 0, elites: 0, eliteHp: 1 };
    this.riseLeft = 0; this.riseNext = 0; this.risenCalled = false;
    this.bannerT = -99; this.leftArrowT = -99;
    for (const a of this.arrows) { a.f = null; a.t0 = -99; }
  }

  // ---------------------------------------------------------------- the wave's plan
  /** startWave: the stats to play wave n with (see the header). */
  plan(n, stats, boss) {
    const g = this.game, Z = this.Z, D = Z.diff.director, k = D.power ?? 1, t = g.time;
    this.reset();
    this.boss = !!boss;
    const S = { ...stats };
    // the wave's type: the deck (or zm_mod); never on a boss wave
    let mod = null;
    if (!boss) {
      if (this.force !== undefined) { mod = this.force; this.force = undefined; }
      else if (n >= D.modsFrom && Math.random() < D.modChance) mod = this.deal(n);
    }
    if (mod) { this.history.push(mod); if (this.history.length > 2) this.history.shift(); }
    this.mod = S.mod = mod;
    const X = this.X;
    if (mod) MOD_PLAN[mod](S, k, X);
    // pacing: surges at points through the wave (none on a boss wave: the boss is the surge), then a final push
    const share = Math.min(0.6, D.surge * X.surge), nSurge = boss ? 0 : S.count >= 40 ? 3 : S.count >= 24 ? 2 : S.count >= 10 ? 1 : 0;
    this.surgeSize = nSurge ? Math.max(3, Math.round(S.count * share / nSurge)) : 0;
    const at = [[], [0.45], [0.3, 0.6], [0.25, 0.45, 0.65]][nSurge];
    this.surgeAt = at.map((f) => Math.floor(S.count * f));
    this.pushAt = !boss && S.count >= 12 ? Math.ceil(S.count * (1 - D.pushAt)) : 0;
    this.setPhase('trickle');
    // where from
    this.openFronts(n);
    // the type's extras
    if (X.rise) {
      this.riseLeft = Math.round(S.count * X.rise);
      this.riseNext = t + rand(3, 5);
    }
    if (X.elites) {
      const kinds = ELITE_KINDS.filter((q) => SPECIALS[q] && n >= SPECIALS[q].from);
      for (let i = 0; i < X.elites && kinds.length; i++) {
        const q = kinds.splice(Math.floor(Math.random() * kinds.length), 1)[0];
        const f = this.open.length ? this.open[i % this.open.length].id : null;
        this.queue(q, { front: f, at: t + 7 + i * rand(5, 8), elite: X.eliteHp });
      }
      if (this.pending.length > S.count) S.count = this.pending.length;
    }
    return S;
  }

  /** The deck: a weighted draw among the types that may come in wave n, never one of the last two. */
  deal(n) {
    let sum = 0;
    for (const id in MODS) if (this.allowed(id, n)) sum += MODS[id].weight;
    if (sum <= 0) return null;
    let r = Math.random() * sum;
    for (const id in MODS) {
      if (!this.allowed(id, n)) continue;
      r -= MODS[id].weight;
      if (r <= 0) return id;
    }
    return null;
  }

  /** May wave type id come in wave n (the deck's rule, and is it built / possible right now)? */
  allowed(id, n) {
    const M = MODS[id], D = this.Z.diff.director;
    if (!M || !(M.weight > 0) || this.history.includes(id)) return false;
    if (n < Math.max(D.modsFrom, M.from + D.modsFrom - 3)) return false;
    return this.available(id);
  }

  /** Is wave type id playable now: its variant built (zroster.js COMMONS weight > 0), bodies to raise... */
  available(id) {
    const M = MODS[id];
    if (!M) return false;
    if (M.needs && !(COMMONS[M.needs]?.weight > 0)) return false;
    if (id === 'risen') return this.riseCandidates(this.Z.humans()) >= 8; // (rise()'s own window: bodies 500-2400 u from the squad)
    return true;
  }

  // ---------------------------------------------------------------- fronts
  /** The map's fronts: { id, name, via, zones, pos (the middle of its spawn nodes), mouth, nodes }. */
  fronts() {
    const cands = this.Z.spawnCandidates();
    if (this.frontsFor === cands) return this.frontsList;
    this.frontsFor = cands;
    this.frontsBy = new Map();
    this.frontsList = [];
    const g = this.game, defs = ZOMBIE_FRONTS[g.W?.mapDef?.id || g.map?.name];
    if (!defs) { this.cluster(cands); return this.frontsList; }
    for (const d of defs) {
      const zones = new Set(d.zones), nodes = [];
      let x = 0, y = 0, z = 0;
      for (const n of cands) {
        const zn = zoneOf([n.x, n.y, n.z]);
        if (!zn || !zones.has(zn[0])) continue;
        nodes.push(n); x += n.x; y += n.y; z += n.z;
      }
      const k = nodes.length || 1, pos = [x / k, y / k, z / k];
      const m = d.mouth && g.nav?.nearestXY([d.mouth[0], d.mouth[1], pos[2]], 300, 400);
      this.add({ id: d.id, name: d.name, via: d.via || 'through', zones: d.zones, pos, mouth: m ? [m.x, m.y, m.z + 36] : null, nodes });
    }
    return this.frontsList;
  }

  add(f) { this.frontsBy.set(f.id, f); this.frontsList.push(f); }

  /**
   * A BSP map: its spawn nodes clustered by path distance into 3-6 fronts (farthest-point
   * seeds over the nav graph, every node to its nearest seed), named by compass bearing from
   * the middle of the map ("from the NORTH-EAST"). A cluster under MIN_FRONT nodes stays
   * listed, but candidates() gives null for it (spawn anywhere).
   */
  cluster(cands) {
    const nodes = this.game.nav?.nodes || [], N = nodes.length;
    if (cands.length < 2 * MIN_FRONT || !N) return;
    const dist = new Float32Array(N).fill(Infinity), lab = new Int16Array(N).fill(-1);
    const heap = new MinHeap();
    const grow = (seed, l) => {
      dist[seed.id] = 0; lab[seed.id] = l; heap.push(seed.id, 0);
      while (heap.size) {
        const id = heap.pop(), d = dist[id];
        for (const e of nodes[id].edges) {
          const nd = d + e.cost;
          if (nd < dist[e.to]) { dist[e.to] = nd; lab[e.to] = l; heap.push(e.to, nd); }
        }
      }
    };
    let cx = 0, cy = 0;
    for (const n of cands) { cx += n.x; cy += n.y; }
    cx /= cands.length; cy /= cands.length;
    // the first seed: the spawn node farthest from the middle; then each the farthest (by path) from all before
    let seed = cands[0], far = -1;
    for (const n of cands) { const d = Math.hypot(n.x - cx, n.y - cy); if (d > far) { far = d; seed = n; } }
    const want = Math.max(3, Math.min(6, Math.round(cands.length / 150)));
    const seeds = [];
    while (seeds.length < want && seed) {
      grow(seed, seeds.length);
      seeds.push(seed);
      seed = null; far = 0;
      for (const n of cands) if (dist[n.id] < Infinity && dist[n.id] > far) { far = dist[n.id]; seed = n; }
      if (far < 600) break; // (a small map: the rest is close to a seed already)
    }
    const groups = seeds.map(() => []);
    for (const n of cands) if (lab[n.id] >= 0 && dist[n.id] < Infinity) groups[lab[n.id]].push(n);
    const made = [];
    groups.forEach((nodes, i) => {
      if (!nodes.length) return;
      let x = 0, y = 0, z = 0;
      for (const n of nodes) { x += n.x; y += n.y; z += n.z; }
      const k = nodes.length, pos = [x / k, y / k, z / k];
      const s = ((Math.round(Math.atan2(pos[1] - cy, pos[0] - cx) / (Math.PI / 4)) % 8) + 8) % 8;
      made.push({ id: `c${i}`, name: COMPASS[s], via: 'from the', zones: [], pos, mouth: null, nodes });
    });
    // two the same way: one above the other is UPPER / LOWER, else numbered
    for (const f of made) {
      const same = made.filter((q) => q.name === f.name);
      if (same.length < 2) continue;
      same.sort((a, b) => a.pos[2] - b.pos[2]);
      const tall = same[same.length - 1].pos[2] - same[0].pos[2] > 96;
      same.forEach((q, j) => { q.name = tall && same.length === 2 ? `${j ? 'UPPER' : 'LOWER'} ${q.name}` : j ? `${q.name} ${j + 1}` : q.name; });
    }
    for (const f of made) this.add(f);
  }

  front(id) { this.fronts(); return this.frontsBy.get(id) || null; }

  /** A front's spawn nodes, or null (unknown, or too few: spawn anywhere). */
  candidates(id) {
    const f = id ? this.front(id) : null;
    return f && f.nodes.length >= MIN_FRONT ? f.nodes : null;
  }

  /**
   * How many of front f's nodes zombies can come up at right now (USE_NEAR-USE_FAR u by path
   * from the squad, 700+ u straight from everyone), and their median path distance (f.reach).
   * Sets f.exit: the usable node closest (by path) to the squad - where they break out.
   */
  /** Is somebody in the squad in front f's own corner (in its zones; a cluster: by its nodes, or at its mouth)? */
  squadIn(f, humans) {
    for (const h of humans) {
      const o = h.pm.origin;
      if (f.zones.length) { const zn = zoneOf(o); if (zn && f.zones.includes(zn[0])) return true; }
      else for (const q of f.nodes) if ((o[0] - q.x) ** 2 + (o[1] - q.y) ** 2 < 300 * 300 && Math.abs(o[2] - q.z) < 120) return true;
      if (f.mouth && (o[0] - f.mouth[0]) ** 2 + (o[1] - f.mouth[1]) ** 2 < USE_NEAR * USE_NEAR) return true;
    }
    return false;
  }

  usable(f, humans) {
    const dist = this.Z.dist;
    let n = 0, best = Infinity, exit = null;
    const ds = this._ds || (this._ds = []);
    ds.length = 0;
    for (const q of f.nodes) {
      const d = dist ? dist[q.id] : 1500;
      if (!(d >= USE_NEAR && d <= USE_FAR)) continue;
      let ok = true;
      for (const h of humans) { const o = h.pm.origin; if ((o[0] - q.x) ** 2 + (o[1] - q.y) ** 2 < USE_NEAR * USE_NEAR) { ok = false; break; } }
      if (!ok) continue;
      n++; ds.push(d);
      if (d < best) { best = d; exit = q; }
    }
    ds.sort((a, b) => a - b);
    f.reach = ds.length ? ds[ds.length >> 1] : Infinity;
    f.exit = f.mouth || (exit ? [exit.x, exit.y, exit.z + 36] : f.pos);
    return n;
  }

  /** This wave's fronts: diff.director.fronts [min, max] of them, the squad's surroundings permitting. */
  openFronts(n) {
    const D = this.Z.diff.director, humans = this.Z.humans();
    const want = n <= 2 ? 1 : D.fronts[0] + Math.floor(Math.random() * (D.fronts[1] - D.fronts[0] + 1));
    const pool = [];
    for (const f of this.fronts()) {
      if (f.nodes.length < MIN_FRONT || this.squadIn(f, humans)) continue;
      const u = this.usable(f, humans);
      if (u < MIN_FRONT) continue;
      f.w = Math.sqrt(u) * (f.reach <= REACH_OK ? 1 : 0.35) * (this.lastOpen.includes(f) ? 0.35 : 1);
      pool.push(f);
    }
    while (this.open.length < want && pool.length) {
      let r = Math.random() * pool.reduce((a, f) => a + f.w, 0), i = 0;
      for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r <= 0) break; }
      this.open.push(pool.splice(i, 1)[0]);
    }
    for (const f of this.open) this.emitFront('open', f);
  }

  /** A front that isn't open yet opens now (a surge with nowhere usable to come from). */
  openOne() {
    const humans = this.Z.humans();
    let best = null, bw = 0;
    for (const f of this.fronts()) {
      if (this.open.includes(f) || f.nodes.length < MIN_FRONT || this.squadIn(f, humans)) continue;
      const u = this.usable(f, humans), w = u >= MIN_FRONT ? Math.sqrt(u) * (f.reach <= REACH_OK ? 1 : 0.35) * rand(0.6, 1.4) : 0;
      if (w > bw) { bw = w; best = f; }
    }
    if (!best) return null;
    this.open.push(best);
    this.emitFront('open', best);
    return best;
  }

  closeFronts() {
    if (!this.open?.length) return;
    // (the next wave's openFronts weighs these down: never the same fronts twice running)
    this.lastOpen.length = 0;
    for (const f of this.open) { this.emitFront('close', f); this.lastOpen.push(f); }
    this.open.length = 0;
  }

  emitFront(phase, f) {
    const ev = this.Z?.events;
    if (ev) ev.mode('front', { phase, id: f.id, name: f.name, pos: (f.exit || f.pos).slice() });
  }

  /** "They're coming through B TUNNELS and down LONG A" */
  callout(list) {
    if (!list.length) return 'They\'re coming from everywhere';
    return 'They\'re coming ' + list.map((f, i) => (i && list[i - 1].via === f.via ? f.name : `${f.via} ${f.name}`)).join(' and ');
  }

  // ---------------------------------------------------------------- announcements
  /** The 'wave' start event (after the stock "WAVE n"): banner, callout, roar, arrows. */
  announce() {
    const g = this.game, t = g.time;
    if (this.mod) this.bannerT = t;
    this.say(this.callout(this.open));
    for (const f of this.open) { this.roar(f); this.arrow(f, t); }
  }

  /** A centre callout (the alert channel) and the line under the wave info. */
  say(text) { this.game.hud?.centerPrint?.(text, CALL_TIME, 'alert'); }

  /** The horde roar, toward front f (no farther than ROAR_MAX from you, so it carries). */
  roar(f, volume = 0.9) {
    const g = this.game, me = g.local, L = g.camPos || (me ? me.eyePos(_eye) : null), p = f.exit || f.pos;
    if (!g.sound || !p) return;
    if (L) {
      const dx = p[0] - L[0], dy = p[1] - L[1], dz = p[2] - L[2], d = Math.hypot(dx, dy, dz) || 1, s = Math.min(1, ROAR_MAX / d);
      _roar[0] = L[0] + dx * s; _roar[1] = L[1] + dy * s; _roar[2] = L[2] + dz * s;
    } else { _roar[0] = p[0]; _roar[1] = p[1]; _roar[2] = p[2]; }
    g.sound.play('horde_roar', { pos: _roar, volume });
  }

  arrow(f, t) {
    let a = this.arrows.find((q) => q.f === f);
    if (!a) a = this.arrows.reduce((o, q) => (q.t0 < o.t0 ? q : o));
    a.f = f; a.t0 = t;
  }

  // ---------------------------------------------------------------- pacing
  setPhase(phase, front = null, by = 'director') {
    if (this.phase === phase) return;
    this.phase = phase;
    this.Z.events?.mode('pace', { phase, front: front ? front.id : null, by });
  }

  /** Every tick, before the spawn step (ZombieMode.tick). */
  tick(t) {
    if (!this.subscribed) this.subscribe();
    const Z = this.Z;
    if (Z.state !== 'wave') return;
    const S = Z.stats, sp = Z.spawned;
    if (this.phase === 'trickle') {
      if (this.surgeAt.length && sp >= this.surgeAt[0]) { this.surgeAt.shift(); this.startSurge(null, 'director', t); }
      else if (this.pushAt && !this.pushed && sp >= this.pushAt) this.startPush(t);
    } else if (this.phase === 'surge') {
      if (this.surgeLeft <= 0 || sp >= S.count) { this.calmUntil = t + Z.diff.director.calm; this.setPhase('calm', this.surgeFront, this.surgeBy); }
    } else if (this.phase === 'calm') {
      if (t >= this.calmUntil) this.setPhase(this.pushed ? 'push' : 'trickle');
    }
    if (this.riseLeft > 0 && t >= this.riseNext) this.rise(t);
  }

  /** A surge: surgeSize zombies in quick succession, from one front, a little over maxAlive. */
  startSurge(front, by, t, size = this.surgeSize) {
    const Z = this.Z, left = Z.stats.count - Z.spawned - this.riseLeft - this.pending.length;
    if (left < 2 || size < 2) return false;
    const humans = Z.humans();
    let f = front;
    if (!f) {
      // one of the open fronts they can still come up at (or a new one)
      const ok = this.open.filter((q) => this.usable(q, humans) >= MIN_FRONT);
      f = ok.length ? ok[Math.floor(Math.random() * ok.length)] : this.openOne();
    }
    this.surgeFront = f; this.surgeBy = by;
    this.surgeLeft = Math.min(size, left);
    this.lastSurge = t;
    this.setPhase('surge', f, by);
    const where = f ? `${f.via} ${f.name}` : 'from everywhere';
    this.say(by === 'screamer' ? `A screamer is calling them - they're coming ${where}!` : `Here they come - ${where}!`);
    if (f) { this.roar(f, 1); this.arrow(f, t); }
    return true;
  }

  /** The final push: the last of the wave from every open front, a little over maxAlive. */
  startPush(t) {
    this.pushed = true;
    this.setPhase('push');
    this.say('FINAL PUSH - hold on!');
    for (const f of this.open) { this.roar(f, 0.8); this.arrow(f, t); }
  }

  /** Ask for a surge now (a screamer: src = it, o.by = 'screamer'). True when one started. */
  surge(src, o = {}) {
    const Z = this.Z, t = this.game.time;
    if (!Z.enabled || Z.state !== 'wave' || this.boss || this.phase === 'surge' || t - this.lastSurge < SURGE_GAP) return false; // (none on a boss wave: plan)
    // from the open front nearest the screamer (they answer its call)
    let f = null;
    if (src?.pm && this.open.length) {
      let bd = Infinity;
      for (const q of this.open) { const p = q.exit || q.pos, d = Math.hypot(p[0] - src.pm.origin[0], p[1] - src.pm.origin[1]); if (d < bd) { bd = d; f = q; } }
    }
    const size = Math.max(3, Math.round(this.surgeSize || Z.stats.count * Z.diff.director.surge * 0.5));
    return this.startSurge(f, o.by || 'director', t, size);
  }

  /** How many may be up at once right now. */
  maxAlive(S, t) {
    const D = this.Z.diff.director, due = this.pending.length > 0 && this.pending[0].at <= t; // (a planned spawn comes when it's due)
    // (the last of the wave's count is kept for planned spawns not due yet and for the bodies still to get up)
    if (!due && (this.riseLeft > 0 || this.pending.length) && this.Z.spawned >= S.count - this.riseLeft - this.pending.length) return 0;
    switch (this.phase) {
      case 'surge': return Math.min(MAX_ALIVE, Math.max(S.maxAlive + 1, Math.round(S.maxAlive * D.surgeAlive)));
      case 'push': return Math.min(MAX_ALIVE, Math.round(S.maxAlive * D.push));
      case 'calm': if (!due) return 0; // (breathing room: nothing new until it's over)
      // falls through
      default: return this.boss ? S.maxAlive : Math.max(2, Math.round(S.maxAlive * D.trickle)); // (a boss wave has no surges to pay for)
    }
  }

  /** Seconds to the next spawn. */
  interval(S, t) {
    void t;
    const k = this.X.interval;
    switch (this.phase) {
      case 'surge': return rand(0.22, 0.4);
      case 'push': return S.interval * rand(0.6, 1.4) * 0.8 * k;
      default: return S.interval * rand(0.6, 1.4) * k;
    }
  }

  /** What comes next and from where (a reused order: read it now). */
  next(t, left) {
    void left;
    const o = this.order, q = this.pending[0];
    if (q && t >= q.at) {
      this.pending.shift();
      o.kind = q.kind; o.variant = q.variant; o.front = q.front; o.elite = q.elite;
      return o;
    }
    o.kind = this.Z.specials.pick(this.Z.wave);
    o.elite = 0;
    o.variant = !o.kind && this.X.share > 0 && Math.random() < this.X.share ? this.X.variant : null;
    let f = null;
    if (this.phase === 'surge') { f = this.surgeFront; this.surgeLeft--; }
    else if (this.open.length && Math.random() >= this.Z.diff.director.spread) f = this.open[Math.floor(Math.random() * this.open.length)]; // (some from anywhere)
    o.front = f ? f.id : null;
    return o;
  }

  /** A planned spawn, counted in the wave (combo pairs, the Twin Elites). */
  queue(kind, o = {}) {
    const e = { kind: kind || null, variant: o.variant || null, front: o.front || null, at: o.at ?? this.game.time, elite: o.elite || 0 };
    let i = this.pending.length;
    while (i > 0 && this.pending[i - 1].at > e.at) i--;
    this.pending.splice(i, 0, e);
    return true;
  }

  /** Specials.spawn({ elite }): one of the Twin Elites - k x the health, harder-hitting, bigger. Returns true. */
  elite(z, def, k) {
    if (!(typeof k === 'number' && k > 1)) k = 2;
    z.health = z.maxHealth = Math.round(z.maxHealth * k);
    z.zDamage = Math.round(z.zDamage * 1.2);
    z.zSpeed *= 1.06;
    z.name = `Elite ${def.name}`;
    z.model.object3D.scale.multiplyScalar(1.12);
    return true;
  }

  // ---------------------------------------------------------------- The Dead Rise
  /** Bodies that may get up: commons' baked corpses not risen yet (with humans: 500-2400 u from the squad). Counts them. */
  riseCandidates(humans, out = null) {
    const recs = this.game.gore?.records;
    if (!recs) return 0;
    const skins = COMMON_SKINS; // (every common look: zroster.js)
    let n = 0;
    for (const r of recs) {
      if (!skins.has(r.skin) || this.raised.has(r)) continue;
      if (humans) {
        let dmin = Infinity;
        for (const h of humans) { const o = h.pm.origin; dmin = Math.min(dmin, Math.hypot(o[0] - r.center[0], o[1] - r.center[1])); }
        if (dmin < 500 || dmin > 2400) continue;
      }
      n++;
      if (out) out.push(r);
    }
    return n;
  }

  /** A few bodies climb back up (counted in the wave). With none left to raise, the seam spawns the rest. */
  rise(t) {
    const g = this.game, Z = this.Z, S = Z.stats;
    this.riseNext = t + rand(3.5, 6);
    let alive = 0;
    for (const z of Z.pool) if (z.alive) alive++;
    if (alive >= S.maxAlive + 1 || this.phase === 'calm') return;
    const list = this._recs || (this._recs = []);
    list.length = 0;
    this.riseCandidates(Z.humans(), list);
    if (!list.length) { this.riseLeft = 0; return; }
    let n = Math.min(this.riseLeft, S.count - Z.spawned, Math.round(rand(2, 3.6)), S.maxAlive + 1 - alive);
    while (n > 0 && list.length) {
      const r = list.splice(Math.floor(Math.random() * list.length), 1)[0];
      this.raised.add(r);
      const at = g.bosses?.standBeside(r.center);
      if (!at || !Z.spawnZombie({ at, risen: true, extra: false })) continue;
      Z.spawned++; this.riseLeft--; n--;
      if (!this.risenCalled) { this.risenCalled = true; this.say('The dead are getting back up!'); g.sound?.play('abom_raise', { pos: at, volume: 0.7 }); }
    }
  }

  // ---------------------------------------------------------------- radar and HUD
  /**
   * HUD state (buildHudState, last of the features): the radar policy. 'pings' (Normal and
   * up): a zombie is a blip only while seen (by you or a teammate close to it), heard (a growl
   * within HEAR_GROWL, a runner's feet within HEAR_RUN) or within pingRange, and PING_HOLD s
   * after. Casual ('full') shows them all; hardcore keeps its sweep (zfeedback.js).
   */
  hud(s) {
    if (!this.subscribed) this.subscribe();
    const Z = this.Z, D = Z.diff.director, R = s.radar;
    if (!R || Z.hardcore || D.radar === 'full') return;
    const bl = R.blips;
    let n = 0;
    for (let i = 0; i < bl.length; i++) if (bl[i].kind !== 'enemy') bl[n++] = bl[i];
    bl.length = n;
    const g = this.game, t = g.time, me = g.local, pos = R.pos, r2 = D.pingRange * D.pingRange;
    const eye = me?.alive ? me.eyePos(_eye) : null, yaw = (R.yaw || 0) * Math.PI / 180, cy = Math.cos(yaw), sy = Math.sin(yaw);
    let k = 0;
    for (const z of Z.pool) {
      if (!z.alive) { z.radarT = -99; continue; }
      const o = z.pm.origin, dx = o[0] - pos[0], dy = o[1] - pos[1], dz = o[2] - pos[2];
      const d2 = dx * dx + dy * dy;
      if (d2 + dz * dz * 0.25 < r2) z.radarT = t;
      else {
        // heard: a growl went out (zombies.js growl sets z.growlT), a runner's feet close by
        if (z.growlT > t - 0.1 && z.growlT !== z.radarGrowl && d2 < HEAR_GROWL * HEAR_GROWL) { z.radarGrowl = z.growlT; z.radarT = t; }
        else if (d2 < HEAR_RUN * HEAR_RUN && z.zSpeed > 245 && Math.hypot(z.pm.velocity[0], z.pm.velocity[1]) > 200) z.radarT = t;
        else if (t >= (z.radarNext || 0)) {
          z.radarNext = t + SEEK * rand(0.8, 1.2);
          if (this.seen(z, eye, dx, dy, d2, cy, sy)) z.radarT = t;
        }
      }
      if (t - (z.radarT ?? -99) > PING_HOLD) continue;
      const b = this.pings[k] || (this.pings[k] = { x: 0, y: 0, z: 0, kind: 'enemy', alive: true });
      k++;
      b.x = o[0]; b.y = o[1]; b.z = o[2];
      bl.push(b);
    }
  }

  /** Can you (in front of you, nothing in between) or a teammate near it (nothing in between) see zombie z? */
  seen(z, eye, dx, dy, d2, cy, sy) {
    const g = this.game, o = z.pm.origin;
    _head[0] = o[0]; _head[1] = o[1]; _head[2] = o[2] + 20;
    if (eye && d2 < SEE_FAR * SEE_FAR && (dx * cy + dy * sy) > 0.6 * Math.sqrt(d2) && g.visible(eye, _head)) return true;
    for (const p of g.players) {
      if (p === g.local || !p.alive || p.team !== TEAM_CT || p.isZombie || p.downed) continue;
      const q = p.pm.origin;
      if ((q[0] - o[0]) ** 2 + (q[1] - o[1]) ** 2 > MATE_SEE * MATE_SEE) continue;
      if (g.visible(p.eyePos(_mate), _head)) return true; // (not _eye: that's hud()'s eye, for the zombies after this one)
    }
    return false;
  }

  /** Was a front's arrow drawn in the tip card's column just now (ztips.js hides its card meanwhile)? */
  arrowLeft() { const d = this.game.time - this.leftArrowT; return d >= 0 && d < 0.2; }

  /** Is the wave type's banner up right now (ztips.js keeps its tip card off it)? */
  bannerOn() { const bt = this.game.time - this.bannerT; return !!this.mod && this.Z.state === 'wave' && bt >= 0 && bt < BANNER_TIME; }

  /** HUD layer: the wave type's banner, the arrows toward the fronts, the type / pace tag under the wave info. */
  draw(hud, s) {
    const Z = this.Z, zi = s.zombie;
    if (!zi || !Z?.enabled) return;
    const g = this.game, t = g.time, k = hud.k, vw = hud.vw, vh = hud.vh, F = this.F;
    if (F.px !== hud.fontPx) { F.px = hud.fontPx; F.big = fontString(Math.round(hud.fontPx * 2.4), true); F.mid = fontString(Math.round(hud.fontPx * 1.05), true); F.small = fontString(Math.round(hud.fontPx * 0.95), true); }
    const M = this.mod ? MODS[this.mod] : null;
    if (zi.state !== 'wave') return;
    // the banner: the wave type, big, under the wave info for a few seconds
    const bt = t - this.bannerT;
    if (M && bt >= 0 && bt < BANNER_TIME) {
      const a = Math.min(1, bt / 0.25, (BANNER_TIME - bt) / 0.6);
      const y = Math.round(vh * 0.19), bh = Math.round(hud.fontPx * 4.2), G = hud.gTop;
      G.globalAlpha = a * 0.55;
      G.fillStyle = '#000';
      G.fillRect(0, y - Math.round(bh * 0.18), vw, bh);
      G.globalAlpha = 1;
      const rise = Math.max(0, 1 - bt / 0.3);
      hud.text(M.label, vw / 2, y - rise * 8 * k, BANNER_RGB, { align: 'center', alpha: a, font: F.big });
      hud.text(M.sub, vw / 2, y + Math.round(hud.fontPx * 2.7), SUB_RGB, { align: 'center', alpha: a * 0.95, font: F.mid });
    }
    // the tag: under "Zombies left" (hud.drawZombie's layout; not while a boss bar sits there)
    if (!zi.boss && s.alive) {
      const top = 6 * k, px = Math.round(hud.fontPx * 1.7), y = top + Math.round(px * 1.2) + hud.lineH + Math.round(2 * k);
      const pace = this.phase === 'surge' ? 'SURGE' : this.phase === 'push' ? 'FINAL PUSH' : '';
      const label = (M ? M.label : '') + (M && pace ? '  -  ' : '') + pace;
      if (label) hud.text(label, vw / 2, y, pace ? SURGE_RGB : TAG_RGB, { align: 'center', alpha: pace && (t * 3 % 1) < 0.25 ? 0.6 : 1, font: F.small });
    }
    // the arrows at the screen edge, toward the fronts just announced
    const me = g.local;
    if (!s.alive || !me) return;
    const yaw = me.pm.angles[1], o = me.pm.origin;
    // (the edges: under the banner at the top - clear of its band while it's up - and above the
    // health / money / ammo numbers at the bottom)
    // On the left the bottom stops over the chat lines (hud.drawChat paints after this layer); the
    // tip card (ztips.js) steps aside while an arrow sits in its column (leftArrowT).
    const cx = vw / 2, cyy = vh / 2, rx = cx - 22 * k, rBot = vh - cyy - 96 * k;
    const rBotL = Math.min(rBot, (hud.chatTop ? hud.chatTop() : vh) - 20 * k - cyy);
    let rTop = cyy - Math.round(vh * 0.3);
    if (M && t - this.bannerT < BANNER_TIME) rTop = Math.min(rTop, cyy - Math.round(vh * 0.19) - Math.round(hud.fontPx * 3.6) - 14 * k);
    for (const A of this.arrows) {
      const at = t - A.t0;
      if (!A.f || at < 0 || at > ARROW_TIME || !this.open.includes(A.f)) continue;
      const p = A.f.exit || A.f.pos;
      const rel = (Math.atan2(p[1] - o[1], p[0] - o[0]) * 180 / Math.PI - yaw) * Math.PI / 180;
      const ux = -Math.sin(rel), uy = -Math.cos(rel); // (screen: x right, y down; rel > 0 is to your left)
      const rb = rBot + (rBotL - rBot) * Math.min(1, Math.max(0, (-ux - 0.2) / 0.3)); // (eased in toward the left: no jump turning past 180)
      const sc = Math.min(Math.abs(ux) > 1e-3 ? rx / Math.abs(ux) : 1e9, uy < 0 ? rTop / -uy : uy > 1e-3 ? rb / uy : 1e9);
      const x = cx + ux * sc, y = cyy + uy * sc;
      if (x < vw * TIP_COL) this.leftArrowT = t;
      const a = Math.min(1, at / 0.2, (ARROW_TIME - at) / 0.8) * (0.7 + 0.3 * Math.sin(at * 9));
      this.drawArrow(hud, x, y, ux, uy, 13 * k, a);
      // the front's name beside it, toward the middle of the screen (beside it at the top and bottom)
      const side = Math.abs(ux) * sc >= rx - 1, la = Math.min(1, a + 0.2);
      if (side) hud.text(A.f.name, x - Math.sign(ux) * 20 * k, y - hud.fontPx / 2, ARROW_RGB, { align: ux > 0 ? 'right' : 'left', alpha: la, font: F.small });
      else hud.text(A.f.name, x + 18 * k, y - hud.fontPx / 2, ARROW_RGB, { align: 'left', alpha: la, font: F.small });
    }
  }

  drawArrow(hud, x, y, ux, uy, size, alpha) {
    const G = hud.gTop, px = -uy, py = ux;
    G.globalAlpha = alpha;
    G.beginPath();
    G.moveTo(x + ux * size, y + uy * size);
    G.lineTo(x - ux * size * 0.6 + px * size * 0.8, y - uy * size * 0.6 + py * size * 0.8);
    G.lineTo(x - ux * size * 0.25, y - uy * size * 0.25);
    G.lineTo(x - ux * size * 0.6 - px * size * 0.8, y - uy * size * 0.6 - py * size * 0.8);
    G.closePath();
    G.fillStyle = 'rgba(0,0,0,0.6)';
    G.lineWidth = Math.max(2, size * 0.25);
    G.strokeStyle = 'rgba(0,0,0,0.75)';
    G.stroke();
    G.fillStyle = `rgb(${ARROW_RGB[0]},${ARROW_RGB[1]},${ARROW_RGB[2]})`;
    G.fill();
    G.globalAlpha = 1;
  }

  /** Per frame (game.frame, zombie mode only). */
  frame(dt) { void dt; }

  // ---------------------------------------------------------------- console
  /** zm_director (the plan), and with sv_cheats 1: zm_mod <id | none> (the next wave's type), zm_surge. True when it was ours. */
  command(p, cmd, args = []) {
    void p;
    const g = this.game, Z = this.Z, out = (s) => g.console?.print?.(s);
    if (cmd === 'zm_director') {
      const S = Z.stats;
      out(`wave ${Z.wave} ${this.mod ? MODS[this.mod].label : 'no type'} | ${this.phase} | fronts: ${this.open.map((f) => f.name).join(', ') || 'anywhere'} | surges left ${this.surgeAt.length}${this.pushAt ? `, push at ${this.pushAt}` : ''} | ${Z.spawned}/${S.count} spawned | deck history ${this.history.join(', ') || '-'}`);
      return true;
    }
    if (cmd !== 'zm_mod' && cmd !== 'zm_surge') return false;
    if (!g.console?.cheats) { out(`${cmd} needs sv_cheats 1`); return true; }
    if (cmd === 'zm_surge') {
      Z.taint();
      out(this.surge(null, { by: 'director' }) ? 'surge!' : 'zm_surge: not now (no wave, one is on, or too few left)');
      return true;
    }
    const id = String(args[0] || '').toLowerCase();
    if (id !== 'none' && !MODS[id]) { out(`usage: zm_mod <${Object.keys(MODS).join('|')}|none> (the next wave's type)`); return true; }
    Z.taint();
    this.force = id === 'none' ? null : id;
    out(id === 'none' ? 'next wave: no type' : `next wave: ${MODS[id].label}${this.available(id) ? '' : ' (its variant is not built yet: they come as walkers)'}`);
    return true;
  }
}
