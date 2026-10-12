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
// Side fields. Field k is a Dijkstra from the same survivors as the main one (Z.seedIds / seedD),
// over the same graph, but every node costs more to walk into:
//  - noise: x (1 .. 1 + NOISE_AMP), smooth over NOISE_CELL u (value noise seeded by the run, the
//    wave and k), so each side field prefers its own corridors, the same all wave long
//  - crowding: + CROWD_COST for each zombie heading through (the next ROUTE_HOPS nodes of every
//    other field's zombies down their own field, and the nodes next to them, at half weight)
// Each field is rebuilt every REBUILD s, one per tick and never on the main field's tick. Near
// the end (main path distance under NEAR_MAIN) a flanker follows the main field like everyone
// (a side field can be a second old); it goes back to its own field past NEAR_MAIN + 250.
//
// Surround. Every survivor has a ring of diff.ai.slots slots RING_R(slots) u out, fixed in angle;
// a slot behind a wall (no canWalk from him to it, checked every 0.5 s) is never given. A
// common within diff.ai.surround takes the free slot nearest its bearing and goes for it,
// around him (a waypoint at most SWING degrees on) when it is far round; within RING_R + 28 u
// it closes straight in. No slot free (more of them than slots): straight at him, the second
// rank. A slot not claimed for SLOT_HOLD s is free again (dead, recycled, retargeted).
const NOISE_CELL = 448, NOISE_AMP = 1.6, CROWD_COST = 70, CROWD_MAX = 6, ROUTE_HOPS = 28;
const REBUILD = [0.8, 1.2], STALE = 3, NEAR_MAIN = 450;
const SLOT_HOLD = 1, SLOT_CHECK = 0.5, SWING = 55 * Math.PI / 180;
const RING_R = (slots) => Math.max(52, 7 * slots);
const TAU = Math.PI * 2;

/** Lattice value in [0, 1) for cell (ix, iy) under seed s. */
function lattice(ix, iy, s) {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (x) => x * x * (3 - 2 * x);
const wrap = (a) => ((a % TAU) + TAU + Math.PI) % TAU - Math.PI;

export class ZHorde {
  constructor(game) {
    this.game = game;
    this.subscribed = false;
    this.side = []; // side fields (Float32Array per nav node), side[k - 1] for z.field k
    this.mul = []; // their noise (x the cost of walking into a node)
    this.builtT = []; // when each was last built (-1: never this run)
    this.nextT = []; // when each is due
    this.noiseKey = []; // the wave its noise is for
    this.traffic = null; // crowding (zombies heading through a node), for the field being built
    this.rings = new Map(); // survivor -> his ring of slots
    this.N = 0;
    this.on = true; // off: the scaffold's horde (main field only, no slots), for A/B profiling and tests
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
    this.seed = (Math.random() * 4294967296) >>> 0; // (this run's noise)
    this.acc = Math.random(); // flank share carried between spawns (exactly diff.ai.flank of them)
    this.turn = 0; // the side field the next flanker gets
    this.mainT = -1;
    for (let k = 0; k < this.side.length; k++) { this.builtT[k] = -1; this.nextT[k] = 0; this.noiseKey[k] = -1; }
    this.rings.clear();
    // what the horde did this run (tests, zm_horde): flankers spawned, side fields built, slots
    // taken, ring approaches that fell back (no clear walk), stuck zombies sent back elsewhere
    this.counts = { flank: 0, commons: 0, builds: 0, slots: 0, fallback: 0, recycled: 0 };
  }

  /** The arrays for nav graph of N nodes (made once; again only on a new map). */
  ensure() {
    const N = this.game.nav?.nodes?.length || 0;
    if (N === this.N) return N;
    this.N = N;
    this.side = []; this.mul = []; this.builtT = []; this.nextT = []; this.noiseKey = [];
    for (let k = 0; k < 2; k++) {
      this.side.push(new Float32Array(N).fill(Infinity));
      this.mul.push(new Float32Array(N).fill(1));
      this.builtT.push(-1); this.nextT.push(0); this.noiseKey.push(-1);
    }
    this.traffic = new Float32Array(N);
    return N;
  }

  fields() { return Math.max(0, Math.min(2, this.Z.diff.ai.fields | 0)); }

  /** Every tick (ZombieMode.tick): build one due side field (never on the main field's tick). */
  tick(t) {
    const Z = this.Z;
    if (!this.on || !Z.enabled || Z.state === 'over' || Z.state === 'idle' || !Z.dist || !Z.seedN) return;
    const F = this.fields();
    if (!F || t - this.mainT < 0.1 || t - this.mainT > 0.38) return; // (between two main builds)
    if (!this.ensure()) return;
    for (let k = 0; k < F; k++) {
      if (t < this.nextT[k]) continue;
      // nobody on it: keep it cheap (built again when a flanker comes up)
      if (!this.anyOn(k + 1)) { this.nextT[k] = t + 0.4; continue; }
      this.build(k, t);
      this.nextT[k] = t + REBUILD[0] + Math.random() * (REBUILD[1] - REBUILD[0]);
      return; // (one a tick)
    }
  }

  /** The main field was just rebuilt (ZombieMode.buildFlow). */
  flow(t) { this.mainT = t; }

  anyOn(k) {
    for (const z of this.Z.pool) if (z.alive && z.field === k) return true;
    return false;
  }

  /** Field k's noise for this wave: smooth value noise, x 1 .. 1 + NOISE_AMP. */
  noise(k) {
    const Z = this.Z, key = Z.wave;
    if (this.noiseKey[k] === key) return this.mul[k];
    this.noiseKey[k] = key;
    const s = (this.seed ^ Math.imul(key + 1, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b)) | 0;
    const mul = this.mul[k], nodes = this.game.nav.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i], fx = n.x / NOISE_CELL, fy = n.y / NOISE_CELL;
      const ix = Math.floor(fx), iy = Math.floor(fy), u = smooth(fx - ix), v = smooth(fy - iy);
      const a = lattice(ix, iy, s), b = lattice(ix + 1, iy, s), c = lattice(ix, iy + 1, s), d = lattice(ix + 1, iy + 1, s);
      const val = (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
      mul[i] = 1 + NOISE_AMP * val * val; // (squared: mostly cheap, a few dear patches)
    }
    return mul;
  }

  /** Where the rest of the horde is heading (not on field k + 1): the next ROUTE_HOPS nodes down its own field. */
  crowd(k) {
    const Z = this.Z, tr = this.traffic;
    tr.fill(0);
    for (const z of Z.pool) {
      if (!z.alive || z.field === k + 1 || !z.node || z.isBoss) continue;
      const w = z.field ? 0.5 : 1, f = this.fieldOf(z);
      let n = z.node;
      for (let i = 0; i < ROUTE_HOPS && n; i++) {
        tr[n.id] += w;
        for (const e of n.edges) tr[e.to] += w * 0.5;
        const h = Z.nextHop(n, f);
        n = h && h.node;
      }
    }
    return tr;
  }

  /** Dijkstra for side field k (k = 0 .. fields - 1) from the main field's seeds. */
  build(k, t) {
    const Z = this.Z, dist = this.side[k], mul = this.noise(k), tr = this.crowd(k), rev = Z.rev, heap = Z.heap;
    dist.fill(Infinity);
    for (let i = 0; i < Z.seedN; i++) {
      const id = Z.seedIds[i], d0 = Z.seedD[i];
      if (d0 < dist[id]) { dist[id] = d0; heap.push(id, d0); }
    }
    while (heap.size) {
      const key = heap.ks[0], id = heap.pop();
      const d = dist[id];
      if (key > d + 0.01) continue; // (a stale entry; dist is float32, key a double)
      // walking into node id: its noise, and the crowd heading through it
      const m = mul[id], p = CROWD_COST * Math.min(CROWD_MAX, tr[id]);
      for (const r of rev[id]) {
        const nd = d + r.cost * m + p;
        if (nd < dist[r.from]) { dist[r.from] = nd; heap.push(r.from, nd); }
      }
    }
    this.builtT[k] = t;
    this.counts.builds++;
  }

  /** The field z walks down: its side field, or the main one (bosses, specials, close, not built). */
  field(z) {
    const Z = this.Z, k = z.field;
    if (!k || !this.on || z.isBoss || z.special || k > this.side.length) return Z.dist;
    const f = this.side[k - 1], n = z.node;
    if (!n || this.builtT[k - 1] < 0 || this.game.time - this.builtT[k - 1] > STALE || !(f[n.id] < Infinity)) return Z.dist;
    // the last stretch: the main field (fresh every 0.4 s), with a margin so it doesn't flip
    const dm = Z.dist[n.id];
    if (z.hordeNear ? dm < NEAR_MAIN + 250 : dm < NEAR_MAIN) { z.hordeNear = true; return Z.dist; }
    z.hordeNear = false;
    return f;
  }

  /** The field z walks down, without touching its state (crowd). */
  fieldOf(z) {
    const k = z.field;
    if (!k || k > this.side.length || this.builtT[k - 1] < 0 || z.hordeNear) return this.Z.dist;
    return this.side[k - 1];
  }

  /** A zombie just came up (ZombieMode.spawnZombie): a commons share flanks, for life. */
  spawned(z) {
    z.hordeNear = false; z.slotOf = null;
    if (!this.on || !z.variant || z.extra || z.isBoss) return;
    this.counts.commons++;
    const A = this.Z.diff.ai, F = this.fields();
    if (!F || !(A.flank > 0)) return;
    this.acc += A.flank;
    if (this.acc < 1) return;
    this.acc -= 1;
    z.field = 1 + (this.turn++ % F);
    this.counts.flank++;
    const k = z.field - 1;
    if (this.N && this.game.time - this.builtT[k] > STALE) this.nextT[k] = 0; // (stale: build it next)
  }

  // ---------------------------------------------------------------- surround
  /** Survivor p's ring: { ang0, owner[], ownerT[], ok[], okT, n }. */
  ring(p, tf, t, S, R) {
    let r = this.rings.get(p);
    if (!r) {
      r = { ang0: Math.random() * TAU, owner: [], ownerT: [], ok: [], okT: 0, n: 0, pt: [0, 0, 0] };
      this.rings.set(p, r);
    }
    if (r.n !== S) {
      r.n = S;
      for (let k = 0; k < S; k++) { r.owner[k] = null; r.ownerT[k] = 0; r.ok[k] = false; }
      r.okT = 0;
    }
    if (t >= r.okT) {
      // which slots he can be reached at (not inside a wall, not off a ledge)
      r.okT = t + SLOT_CHECK;
      const nav = this.game.nav, pt = r.pt;
      for (let k = 0; k < S; k++) {
        const a = r.ang0 + k * TAU / S;
        pt[0] = tf[0] + Math.cos(a) * R; pt[1] = tf[1] + Math.sin(a) * R; pt[2] = tf[2];
        r.ok[k] = nav.canWalk(tf, pt);
      }
    }
    return r;
  }

  /** Is slot k of ring r free for z? */
  free(r, k, z, p, t) {
    const o = r.owner[k];
    return !o || o === z || !o.alive || o.slotOf !== p || o.slot !== k || t - r.ownerT[k] > SLOT_HOLD;
  }

  release(z) {
    if (z.slot >= 0 && z.slotOf) {
      const r = this.rings.get(z.slotOf);
      if (r && r.owner[z.slot] === z) r.owner[z.slot] = null;
    }
    z.slot = -1; z.slotOf = null;
  }

  /** Close to its target: a ring slot to go for, or null (straight at tf). */
  approach(z, target, tf, feet, t) {
    const A = this.Z.diff.ai, S = Math.max(0, Math.min(16, A.slots | 0));
    if (!this.on || !z.variant || z.isBoss || !A.surround || S < 3) return null;
    const dx = feet[0] - tf[0], dy = feet[1] - tf[1], d = Math.hypot(dx, dy);
    if (d > A.surround) { if (z.slot >= 0) this.release(z); return null; }
    const R = RING_R(S), r = this.ring(target, tf, t, S, R);
    let k = z.slotOf === target && z.slot >= 0 && r.owner[z.slot] === z ? z.slot : -1;
    if (d < R + 28) { if (k >= 0) r.ownerT[k] = t; return null; } // there: straight in for the claw (its slot kept)
    const bearing = Math.atan2(dy, dx);
    if (k < 0) {
      if (z.slot >= 0) this.release(z);
      // the free slot nearest its bearing
      let bd = Infinity;
      for (let i = 0; i < S; i++) {
        if (!r.ok[i] || !this.free(r, i, z, target, t)) continue;
        const da = Math.abs(wrap(r.ang0 + i * TAU / S - bearing));
        if (da < bd) { bd = da; k = i; }
      }
      if (k < 0) return null; // the ring is full: the second rank
      r.owner[k] = z; z.slot = k; z.slotOf = target;
      this.counts.slots++;
    }
    r.ownerT[k] = t;
    // round to it: no more than SWING on from where it is, a little wider out
    const sa = r.ang0 + k * TAU / S, off = wrap(sa - bearing);
    const P = z.slotPt || (z.slotPt = [0, 0, 0]), nav = this.game.nav;
    if (Math.abs(off) > SWING) {
      const a = bearing + Math.sign(off) * SWING, rr = Math.max(R * 1.6, Math.min(d, 150));
      P[0] = tf[0] + Math.cos(a) * rr; P[1] = tf[1] + Math.sin(a) * rr; P[2] = tf[2];
      if (nav.canWalk(feet, P)) return P;
    }
    P[0] = tf[0] + Math.cos(sa) * R; P[1] = tf[1] + Math.sin(sa) * R; P[2] = tf[2];
    if (nav.canWalk(feet, P)) return P;
    this.counts.fallback++;
    return null; // (no clear walk to it: straight at him)
  }

  /** HUD state (buildHudState, every frame). */
  hud(s) { void s; }

  /** Per frame (game.frame, zombie mode only). */
  frame(dt) { void dt; }

  /** An unclaimed command (ZombieMode.command). True when it was ours: zm_horde prints what the horde AI is doing. */
  command(p, cmd, args) {
    void args;
    if (cmd !== 'zm_horde' || p !== this.game.local) return false;
    const Z = this.Z, c = this.counts, on = [0, 0, 0];
    let up = 0, slotted = 0, stuck = 0;
    for (const z of Z.pool) {
      if (!z.alive) continue;
      up++; on[Math.min(2, z.field | 0)]++;
      if (z.slot >= 0) slotted++;
      if (z.stuckSince) stuck++;
    }
    const A = Z.diff.ai;
    this.game.console?.menus?.print?.(`horde: ${up} up (fields ${on.join('/')}, ${slotted} in ring slots, ${stuck} stuck); run: ${c.flank}/${c.commons} flankers, ${c.builds} side builds, ${c.slots} slots, ${c.fallback} fallbacks, ${c.recycled} recycled; ai flank ${A.flank} fields ${A.fields} surround ${A.surround} slots ${A.slots}`);
    return true;
  }
}
