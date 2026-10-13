// Hazard volumes from the map's metadata (src/map/maps/*: MAP.hazards): water, pits, fire.
// There is no swimming: a player whose feet enter a volume is dealt with at once.
//   { id, kind, mins: [x, y, z], maxs: [x, y, z], damage = 0, to = [x, y, z] | null, zombies }
//   kind 'teleport' - back on land: `to` (a floor point), else the nearest safe nav spot,
//                     with `damage` (fall in the harbour: back on the quay, a little hurt)
//   kind 'hurt'     - `damage` per second while inside (fire, acid, electrified water)
//   kind 'kill'     - dies (a bottomless drop)
//   zombies: 'recycle' (default for teleport / kill: it comes back at a fresh spawn spot,
//            so the volume is never a free kill), 'kill', 'ignore'
// Nav nodes inside a teleport / kill volume are cut out of the graph (no spawns there, no
// routes through it, bots and the flow field go around).
import { TEAM_CT } from './player.js';

const FEET = 36; // hull centre to feet, standing

export class Hazards {
  constructor(game) {
    this.game = game;
    this.list = (game.W?.mapDef?.hazards || []).map((h) => ({ kind: 'teleport', damage: 0, zombies: h.kind === 'hurt' ? 'ignore' : 'recycle', ...h }));
    this.cut = 0;
    if (this.list.length && game.nav) this.prune(game.nav);
  }

  inside(h, x, y, z) {
    return x >= h.mins[0] && x <= h.maxs[0] && y >= h.mins[1] && y <= h.maxs[1] && z >= h.mins[2] && z <= h.maxs[2];
  }

  /** The hazard holding a feet position, or null. */
  at(x, y, z) {
    for (const h of this.list) if (this.inside(h, x, y, z)) return h;
    return null;
  }

  /** Cut teleport / kill volumes out of the nav graph. */
  prune(nav) {
    const bad = new Uint8Array(nav.nodes.length);
    for (const n of nav.nodes) {
      const h = this.at(n.x, n.y, n.z);
      if (h && h.kind !== 'hurt') bad[n.id] = 1;
    }
    for (const n of nav.nodes) {
      if (bad[n.id]) { this.cut++; n.edges = []; n.hazard = true; continue; }
      if (n.edges.some((e) => bad[e.to])) n.edges = n.edges.filter((e) => !bad[e.to]);
    }
  }

  /** Where a player who fell into h comes back: its `to`, else the nearest safe nav spot. */
  landing(h, o) {
    if (h.to) return h.to;
    let best = null, bd = Infinity;
    for (const n of this.game.nav.nodes) {
      if (n.hazard || n.edges.length < 4) continue;
      const d = (n.x - o[0]) ** 2 + (n.y - o[1]) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best ? [best.x, best.y, best.z] : null;
  }

  update(dt) {
    if (!this.list.length) return;
    const g = this.game;
    for (const p of g.players) {
      if (!p.alive) continue;
      const o = p.pm.origin;
      const h = this.at(o[0], o[1], o[2] - FEET);
      if (!h) continue;
      if (p.isZombie) { this.zombie(p, h, dt); continue; }
      if (h.kind === 'hurt') { if (h.damage > 0) g.damagePlayer(p, null, h.damage * dt, 0, 'world', null, null); continue; }
      if (h.kind === 'kill') { g.damagePlayer(p, null, 1000, 0, 'world', null, null); continue; }
      const to = this.landing(h, o);
      if (to) this.place(p, to);
      if (h.damage > 0) g.damagePlayer(p, null, h.damage, 0, 'world', null, null);
      if (p.team === TEAM_CT || p.isLocal) g.sound?.play?.('land', { pos: p.isLocal ? null : to });
    }
  }

  zombie(z, h, dt) {
    const g = this.game, how = h.zombies;
    if (how === 'ignore') { if (h.kind === 'hurt' && h.damage > 0) g.damagePlayer(z, null, h.damage * dt, 0, 'world', null, null); return; }
    if (how === 'kill' || !g.zombies?.recycle) { g.damagePlayer(z, null, 100000, 0, 'world', null, null); return; }
    g.zombies.recycle(z);
    if (this.at(z.pm.origin[0], z.pm.origin[1], z.pm.origin[2] - FEET)) g.damagePlayer(z, null, 100000, 0, 'world', null, null); // (no spot found)
  }

  place(p, to) {
    p.pm.origin = [to[0], to[1], to[2] + FEET + 1];
    p.prevOrigin = p.pm.origin.slice();
    p.pm.velocity = [0, 0, 0];
    if (p.isLocal) this.game.oldz = p.pm.origin[2];
  }
}
