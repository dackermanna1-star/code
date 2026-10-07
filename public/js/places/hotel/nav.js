// The Night Manager's way round the hotel: a graph of points in the
// corridors and rooms. Points that can see each other (with room for his
// shoulders) are joined automatically; doorways are joined by hand, with
// the door he has to open on the way. A* finds his route.
import * as THREE from 'three';
import { GROUP } from '../../engine/Part.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _s = new THREE.Vector3();

export class Nav {
  constructor(world) {
    this.world = world;
    this.nodes = [];
    this.byId = new Map();
  }
  /** A point (feet height). o: {floor, room, tag, poi (a place he likes to look round)} */
  node(id, x, y, z, o = {}) {
    if (this.byId.has(id)) throw new Error('nav: duplicate ' + id);
    const n = { id, p: new THREE.Vector3(x, y, z), links: [], floor: o.floor, room: o.room || null, poi: !!o.poi, tag: o.tag, i: this.nodes.length };
    this.nodes.push(n); this.byId.set(id, n);
    return n;
  }
  get(id) { const n = typeof id === 'string' ? this.byId.get(id) : id; if (!n) throw new Error('nav: no node ' + id); return n; }
  /** Join two points (both ways). o: {door, stairs, elevator, cost} */
  link(a, b, o = {}) {
    a = this.get(a); b = this.get(b);
    if (a.links.some((l) => l.to === b)) return;
    const c = o.cost ?? a.p.distanceTo(b.p);
    a.links.push({ to: b, cost: c, door: o.door, stairs: !!o.stairs, elevator: o.elevator });
    b.links.push({ to: a, cost: c, door: o.door, stairs: !!o.stairs, elevator: o.elevator });
  }
  /** A line of points from one to the next (no gap longer than step). Returns them. */
  chain(prefix, pts, o = {}) {
    const out = [];
    pts.forEach(([x, y, z], i) => {
      const n = this.node(`${prefix}${i}`, x, y, z, o);
      if (out.length) this.link(out[out.length - 1], n);
      out.push(n);
    });
    return out;
  }
  /** Can he walk straight from a to b? (rays at knee and chest height, his width either side) */
  clear(a, b, width = 1.1) {
    _a.copy(a); _b.copy(b);
    const side = _s.set(-(b.z - a.z), 0, b.x - a.x);
    if (side.lengthSq() < 1e-6) return true;
    side.normalize().multiplyScalar(width);
    for (const h of [1.6, 5]) for (const k of [-1, 0, 1]) {
      const f = new THREE.Vector3(a.x + side.x * k, a.y + h, a.z + side.z * k), t = new THREE.Vector3(b.x + side.x * k, b.y + h, b.z + side.z * k);
      const hit = this.world.raycast(f, t, { mask: GROUP.WORLD });
      if (hit) return false;
    }
    return true;
  }
  /** Join every pair on the same floor that can see each other (up to maxD apart). */
  autoLink(maxD = 16, filter = null) {
    const N = this.nodes;
    for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
      const a = N[i], b = N[j];
      if (a.floor !== b.floor || a.noAuto || b.noAuto) continue;
      if (a.links.some((l) => l.to === b)) continue;
      if (Math.abs(a.p.y - b.p.y) > 0.6) continue;
      const d = a.p.distanceTo(b.p);
      if (d > maxD || d < 0.5) continue;
      if (filter && !filter(a, b)) continue;
      if (this.clear(a.p, b.p)) this.link(a, b);
    }
  }
  nearest(pos, o = {}) {
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      if (o.floor && n.floor !== o.floor) continue;
      if (o.filter && !o.filter(n)) continue;
      const dy = Math.abs(n.p.y - pos.y);
      if (dy > (o.maxDy ?? 6)) continue;
      const d = n.p.distanceToSquared(pos) + dy * dy * 4;
      if (d < bd && (!o.visible || this.clear(n.p, pos, 0.2))) { bd = d; best = n; }
    }
    return best;
  }
  /** A* from a to b. o.stairs: allowed to use the stairs; o.avoid(node): extra cost. Returns [nodes] or null. */
  path(a, b, o = {}) {
    a = this.get(a); b = this.get(b);
    if (a === b) return [a];
    const open = new Map([[a, 0]]), g = new Map([[a, 0]]), from = new Map();
    const h = (n) => n.p.distanceTo(b.p);
    const f = new Map([[a, h(a)]]);
    let guard = 0;
    while (open.size && guard++ < 5000) {
      let cur = null, cf = Infinity;
      for (const n of open.keys()) { const v = f.get(n); if (v < cf) { cf = v; cur = n; } }
      if (cur === b) {
        const out = [cur];
        while (from.has(out[0])) out.unshift(from.get(out[0]));
        return out;
      }
      open.delete(cur);
      for (const l of cur.links) {
        if (l.stairs && !o.stairs) continue;
        if (l.elevator && !o.elevator) continue;
        if (l.door?.sealed) continue;
        const ng = g.get(cur) + l.cost + (o.avoid ? o.avoid(l.to) : 0);
        if (ng < (g.get(l.to) ?? Infinity)) {
          from.set(l.to, cur); g.set(l.to, ng); f.set(l.to, ng + h(l.to)); open.set(l.to, true);
        }
      }
    }
    return null;
  }
  /** The link from a to b (for its door). */
  edge(a, b) { return a.links.find((l) => l.to === b); }
  pois(floor) { return this.nodes.filter((n) => n.poi && (!floor || n.floor === floor)); }
}
