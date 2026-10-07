// Finding the way through buildings. Every building recorded its rooms and
// the doorways and stairs between them (and out to the street) as it was
// built. To get to someone indoors: the nearest way in, then room to room
// by the doorways and stairs, then across the room to them. Outdoors you
// just head straight there and slide round what's in the way.
import { O } from '../state.js';

export class Nav {
  constructor(buildings) {
    this.rooms = [];
    this.grid = new Map();
    for (const B of buildings) for (const R of B.rooms) {
      R.B = B;
      const c = Math.cos(R.yaw), s = Math.sin(R.yaw);
      R.c = c; R.s = s;
      this.rooms.push(R);
      const r = Math.hypot(R.hx, R.hz);
      for (let i = Math.floor((R.x - r) / 48); i <= Math.floor((R.x + r) / 48); i++) for (let j = Math.floor((R.z - r) / 48); j <= Math.floor((R.z + r) / 48); j++) {
        const k = i * 100003 + j; let l = this.grid.get(k); if (!l) this.grid.set(k, (l = [])); l.push(R);
      }
    }
  }
  /** The room a point is in (or null): within its rectangle and between its floor and ceiling. */
  roomAt(x, y, z) {
    const l = this.grid.get(Math.floor(x / 48) * 100003 + Math.floor(z / 48));
    if (!l) return null;
    let best = null;
    for (const R of l) {
      if (y < R.y - 1.5 || y > R.y + R.h + 0.5) continue;
      const dx = x - R.x, dz = z - R.z, lx = dx * R.c - dz * R.s, lz = dx * R.s + dz * R.c;
      if (Math.abs(lx) <= R.hx + 0.3 && Math.abs(lz) <= R.hz + 0.3) { if (!best || Math.abs(y - R.y) < Math.abs(y - best.y)) best = R; }
    }
    return best;
  }
  /**
   * A route from a point to a target point: a list of waypoints { x, y, z, door?, link? }.
   * Indoors (either end) goes by the doorways; outdoors to outdoors is a straight line (empty list).
   */
  route(fx, fy, fz, tx, ty, tz) {
    const A = this.roomAt(fx, fy, fz), Bt = this.roomAt(tx, ty, tz);
    if (A === Bt) return [];
    const OUT = 'out';
    const start = A || OUT, goal = Bt || OUT;
    const blds = [A?.B, Bt?.B].filter(Boolean);
    const other = (L, n) => {
      const bld = L.ownerB;
      const ia = L.a, ib = L.b;
      const ra = ia >= 0 ? bld.rooms[ia] : OUT, rb = ib >= 0 ? bld.rooms[ib] : OUT;
      return ra === n ? rb : rb === n ? ra : null;
    };
    const links = (n) => (n === OUT ? blds.flatMap((b) => b.links.filter((L) => L.outside || L.a < 0 || L.b < 0)) : n.links);
    const prev = new Map([[start, null]]);
    const q = [start];
    while (q.length) {
      const n = q.shift();
      if (n === goal) break;
      for (const L of links(n)) {
        const o = other(L, n);
        if (!o || prev.has(o)) continue;
        prev.set(o, { from: n, L });
        q.push(o);
      }
    }
    if (!prev.has(goal)) return [];
    const way = [];
    for (let n = goal; prev.get(n); n = prev.get(n).from) {
      const { L, from } = prev.get(n);
      if (L.stairs) {
        // walk the stairs the right way: from the room we came from
        const fromIsA = (L.a >= 0 ? L.ownerB.rooms[L.a] : OUT) === from;
        let pts = L.path || [L.from, L.to];
        if (!fromIsA) pts = pts.slice().reverse();
        for (let i = pts.length - 1; i >= 0; i--) way.unshift({ x: pts[i][0], y: pts[i][1], z: pts[i][2], stairs: true });
      } else way.unshift({ x: L.x, y: L.y, z: L.z, door: L.door, link: L });
    }
    return way;
  }
}

/** Tell each building's links which building they belong to (once). */
export function tagLinks(buildings) {
  for (const B of buildings) for (const L of B.links) L.ownerB = B;
  for (const B of buildings) for (const R of B.rooms) R.B = B;
}

export { O };
