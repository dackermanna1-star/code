// Where people walk: a graph made from the roads' sidewalk centre lines
// (roads.walkways), the crosswalks (roads.crossings) and the short links
// round each street corner. People follow it: along the sidewalk, round the
// corner, across at the crosswalk when the lights let them.
//
//   const nav = new Walkways(roads)
//   nav.nodes: Float32Array [x, y, z] per node      nav.links[node] -> [edge ids]
//   nav.edges[i] = {a, b, kind: 'walk' | 'cross' | 'corner', w, len, ux, uz, cross (crossing), node (junction id)}
//   nav.other(edge, node) -> the far node      nav.point(edge, fromNode, s, off, out) -> {x, y, z} on the edge
//   nav.nearest(x, z, maxR) -> {edge, s (from a), d} | null
//   nav.pick(x, z, rMin, rMax, rand, test) -> {edge, s} | null   (a random sidewalk spot in a ring)
export class Walkways {
  constructor(roads) {
    const W = roads?.walkways || [], C = roads?.crossings || [];
    const pts = [], links = [], edges = [];
    const grid = new Map(), GC = 4;
    const key = (x, z) => Math.floor(x / GC) * 100003 + Math.floor(z / GC);
    const node = (x, y, z) => {
      // merge points closer than 1 stud
      const i0 = Math.floor(x / GC), j0 = Math.floor(z / GC);
      for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) {
        const c = grid.get(i * 100003 + j);
        if (c) for (const n of c) if (Math.abs(pts[n * 3] - x) < 1 && Math.abs(pts[n * 3 + 2] - z) < 1) return n;
      }
      const n = pts.length / 3;
      pts.push(x, y, z); links.push([]);
      const k = key(x, z);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(n);
      return n;
    };
    const link = (a, b, kind, w, extra) => {
      if (a === b) return -1;
      for (const id of links[a]) { const e = edges[id]; if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return id; }
      const dx = pts[b * 3] - pts[a * 3], dz = pts[b * 3 + 2] - pts[a * 3 + 2], len = Math.hypot(dx, dz);
      if (len < 0.2) return -1;
      const e = { id: edges.length, a, b, kind, w, len, ux: dx / len, uz: dz / len, ...extra };
      edges.push(e); links[a].push(e.id); links[b].push(e.id);
      return e.id;
    };
    for (const w of W) link(node(w.ax, w.y, w.az), node(w.bx, w.y, w.bz), 'walk', w.w, { road: w.edge });
    for (const c of C) link(node(c.ax, c.y, c.az), node(c.bx, c.y, c.bz), 'cross', 6, { cross: c, node: c.node, road: c.edge });
    // corners: join ends that are close (round the corner, onto the crosswalk)
    const n0 = pts.length / 3;
    for (let a = 0; a < n0; a++) {
      if (links[a].length >= 4) continue;
      const x = pts[a * 3], z = pts[a * 3 + 2];
      const i0 = Math.floor(x / GC), j0 = Math.floor(z / GC), R = 22, rc = Math.ceil(R / GC);
      for (let i = i0 - rc; i <= i0 + rc; i++) for (let j = j0 - rc; j <= j0 + rc; j++) {
        const c = grid.get(i * 100003 + j);
        if (!c) continue;
        for (const b of c) {
          if (b <= a) continue;
          const d = Math.hypot(pts[b * 3] - x, pts[b * 3 + 2] - z);
          if (d > R || Math.abs(pts[b * 3 + 1] - pts[a * 3 + 1]) > 3) continue;
          // not along a sidewalk we already have, and not doubling a crosswalk
          if (links[a].some((id) => edges[id].a === b || edges[id].b === b)) continue;
          if (links[a].some((id) => edges[id].kind === 'cross') && links[b].some((id) => edges[id].kind === 'cross') && d > 12) continue;
          link(a, b, 'corner', 6);
        }
      }
    }
    this.nodes = new Float32Array(pts);
    this.links = links;
    this.edges = edges;
    // edges filed by 64-stud cell (for spawning and finding the nearest)
    this.cells = new Map(); this.CELL = 64;
    for (const e of edges) {
      const ax = pts[e.a * 3], az = pts[e.a * 3 + 2], n = Math.max(1, Math.ceil(e.len / 32));
      const seen = new Set();
      for (let k = 0; k <= n; k++) {
        const x = ax + e.ux * e.len * (k / n), z = az + e.uz * e.len * (k / n);
        const ck = Math.floor(x / 64) * 100003 + Math.floor(z / 64);
        if (seen.has(ck)) continue; seen.add(ck);
        if (!this.cells.has(ck)) this.cells.set(ck, []);
        this.cells.get(ck).push(e.id);
      }
    }
  }

  other(e, n) { return e.a === n ? e.b : e.a; }
  nx(n) { return this.nodes[n * 3]; } ny(n) { return this.nodes[n * 3 + 1]; } nz(n) { return this.nodes[n * 3 + 2]; }

  /** The point s along edge e walking away from node `from`, `off` to the walker's right. */
  point(e, from, s, off, out) {
    const fwd = e.a === from ? 1 : -1;
    const ux = e.ux * fwd, uz = e.uz * fwd;
    const N = this.nodes, o = from * 3;
    out.x = N[o] + ux * s - uz * off; out.z = N[o + 2] + uz * s + ux * off;
    const t = Math.min(1, Math.max(0, s / e.len));
    const o2 = this.other(e, from) * 3;
    out.y = N[o + 1] + (N[o2 + 1] - N[o + 1]) * t;
    return out;
  }

  /** The nearest edge to (x, z) within maxR: {edge, s (from a), d}. */
  nearest(x, z, maxR = 64) {
    let best = null, bd = maxR;
    const N = this.nodes, r = Math.ceil(maxR / 64);
    const ci = Math.floor(x / 64), cj = Math.floor(z / 64);
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      const c = this.cells.get(i * 100003 + j);
      if (!c) continue;
      for (const id of c) {
        const e = this.edges[id];
        const ax = N[e.a * 3], az = N[e.a * 3 + 2];
        const s = Math.max(0, Math.min(e.len, (x - ax) * e.ux + (z - az) * e.uz));
        const d = Math.hypot(ax + e.ux * s - x, az + e.uz * s - z);
        if (d < bd) { bd = d; best = { edge: e, s, d }; }
      }
    }
    return best;
  }

  /** A random sidewalk spot between rMin and rMax from (x, z). test(px, pz) -> false to reject. */
  pick(x, z, rMin, rMax, rand, test) {
    const N = this.nodes;
    for (let tries = 0; tries < 10; tries++) {
      const a = rand() * Math.PI * 2, r = rMin + rand() * (rMax - rMin);
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const c = this.cells.get(Math.floor(px / 64) * 100003 + Math.floor(pz / 64));
      if (!c || !c.length) continue;
      const e = this.edges[c[Math.floor(rand() * c.length)]];
      if (e.kind !== 'walk') continue;
      const s = rand() * e.len;
      const qx = N[e.a * 3] + e.ux * s, qz = N[e.a * 3 + 2] + e.uz * s;
      const d = Math.hypot(qx - x, qz - z);
      if (d < rMin || d > rMax) continue;
      if (test && !test(qx, qz)) continue;
      return { edge: e, s, x: qx, z: qz, y: N[e.a * 3 + 1] };
    }
    return null;
  }
}
