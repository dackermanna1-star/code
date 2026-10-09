// The city plan, made from layout.js: the land and water masks, the road graph
// (nodes, edges with lanes, bridges and the elevated expressway) and the city
// blocks between the streets. Plain data and maths, no three.js, so it can be
// tested in Node.
//
//   const P = makePlan();
//   P.nodes[i] = { id, x, y, z, edges: [edge ids], light: bool }
//   P.edges[i] = { id, a, b, cls, name, line, R (ROAD class), pts: [{x, y, z, d}], len,
//                  lanes, width, bridge: bool, elevated: bool }
//   P.blocks[i] = { id, grid, x0, z0, x1, z1, district, edges: {n, s, e, w} }
//   P.landAt(x, z) -> land id | null      P.canalAt(x, z) -> canal | null
//   P.districtAt(x, z) -> district        P.coastDist(x, z) -> signed distance (inland +)
//
// y on edges is absolute (GROUND = street level).
import { LAND, CANALS, DISTRICTS, ROAD, GRIDS, CROSSINGS, EXTRA_ROADS, EXPRESSWAY, GROUND, HALF } from './layout.js';

// ---- geometry helpers --------------------------------------------------------
function ellipsePoly([cx, cz, rx, rz], n = 40) {
  const o = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; o.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]); }
  return o;
}
export function inPoly(pts, x, z) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
/** Distance from (x, z) to segment a-b, and the parameter along it. */
export function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + dx * t, pz = az + dz * t;
  return { d: Math.hypot(x - px, z - pz), t, px, pz };
}
function polyDist(pts, x, z, closed = true) {
  let best = Infinity, seg = -1;
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const r = segDist(x, z, a[0], a[1], b[0], b[1]);
    if (r.d < best) { best = r.d; seg = i; }
  }
  return { d: best, seg };
}

export function makePlan() {
  const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
  const P = { nodes: [], edges: [], blocks: [], lands: [], canals: CANALS, districts: DISTRICTS };

  // ---- land and water ----
  for (const L of LAND) {
    const pts = L.ellipse ? ellipsePoly(L.ellipse) : L.pts;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    P.lands.push({ ...L, pts, box: [x0, z0, x1, z1], beachSet: new Set(L.beaches || []), mangroveSet: new Set(L.mangroves || []) });
  }
  P.landAt = (x, z) => {
    for (const L of P.lands) if (x >= L.box[0] && x <= L.box[2] && z >= L.box[1] && z <= L.box[3] && inPoly(L.pts, x, z)) return L.id;
    return null;
  };
  P.landById = Object.fromEntries(P.lands.map((L) => [L.id, L]));
  P.canalAt = (x, z, pad = 0) => {
    for (const c of CANALS) {
      const r = polyDist(c.pts, x, z, false);
      if (r.d < c.w / 2 + pad) return c;
    }
    return null;
  };
  /** Dry land at street level (not sea, not canal). */
  P.isLand = (x, z, pad = 0) => !!P.landAt(x, z) && !P.canalAt(x, z, pad);
  /** Signed distance to the nearest coast (inland +), the land and the shore kind there. */
  P.coast = (x, z) => {
    let best = { d: Infinity, land: null, kind: 'wall' };
    for (const L of P.lands) {
      // cheap reject
      if (x < L.box[0] - 600 || x > L.box[2] + 600 || z < L.box[1] - 600 || z > L.box[3] + 600) continue;
      const r = polyDist(L.pts, x, z);
      if (r.d < Math.abs(best.d)) {
        const inside = inPoly(L.pts, x, z);
        best = { d: inside ? r.d : -r.d, land: L.id, kind: L.beachSet.has(r.seg) ? 'beach' : L.mangroveSet.has(r.seg) ? 'mangrove' : L.shore };
      }
    }
    return best;
  };
  P.districtAt = (x, z) => {
    for (const D of DISTRICTS) { const r = D.rect; if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return D; }
    return DISTRICTS[DISTRICTS.length - 1];
  };

  // ---- road lines ----
  // every road starts as a polyline {cls, name, pts: [[x, z, yOffset]]}
  const lines = [];
  const lineVal = (v) => (Array.isArray(v) ? { v: v[0], cls: v[1] || 'street', name: v[2] || '', ext: v[3] || null } : { v, cls: 'street', name: '', ext: null });
  const cleared = (x, z) => EXPRESSWAY.clear.some(([cx, z0, z1]) => Math.abs(x - cx) < 2 && z > z0 + 1 && z < z1 - 1);
  for (const G of GRIDS) {
    const land = P.landById[G.land];
    const okAt = (x, z) => x >= G.rect[0] && x <= G.rect[2] && z >= G.rect[1] && z <= G.rect[3]
      && inPoly(land.pts, x, z) && !G.skip.some((r) => x > r[0] && x < r[2] && z > r[1] && z < r[3]);
    const along = (fixed, isX, ext, info) => {
      // walk the line in 8-stud steps and keep the runs where it is on this grid's land
      const lo = isX ? G.rect[1] : G.rect[0], hi = isX ? G.rect[3] : G.rect[2];
      let run = null;
      const flush = () => { if (run && run[1] - run[0] >= 40) lines.push({ cls: info.cls, name: info.name, grid: G.id, axis: isX ? 'x' : 'z', at: fixed, pts: isX ? [[fixed, run[0], 0], [fixed, run[1], 0]] : [[run[0], fixed, 0], [run[1], fixed, 0]] }); run = null; };
      for (let s = lo; s <= hi; s += 8) {
        const x = isX ? fixed : s, z = isX ? s : fixed;
        const ok = okAt(x, z) && (!ext || (s >= ext[0] && s <= ext[1])) && !(isX && cleared(x, z));
        if (ok) { if (!run) run = [s, s]; else run[1] = s; } else flush();
      }
      flush();
    };
    G.lineX = G.xs.map(lineVal); G.lineZ = G.zs.map(lineVal);
    for (const L of G.lineX) along(L.v, true, L.ext, L);
    for (const L of G.lineZ) along(L.v, false, L.ext, L);
  }
  // a street around each park/landmark cut out of a grid (so the grid's streets end in T junctions)
  for (const G of GRIDS) {
    const land = P.landById[G.land];
    for (const r of G.skip) {
      if (r[2] - r[0] > 1200 || r[3] - r[1] > 1200) continue; // the airport has its own perimeter road
      const sides = [[[r[0], r[1]], [r[2], r[1]]], [[r[2], r[1]], [r[2], r[3]]], [[r[2], r[3]], [r[0], r[3]]], [[r[0], r[3]], [r[0], r[1]]]];
      for (const [a, b] of sides) {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 8);
        let run = null;
        const flush = () => { if (run && run[1] - run[0] >= 5) { const p0 = run[0] / n, p1 = run[1] / n; lines.push({ cls: 'street', name: '', ring: true, pts: [[a[0] + (b[0] - a[0]) * p0, a[1] + (b[1] - a[1]) * p0, 0], [a[0] + (b[0] - a[0]) * p1, a[1] + (b[1] - a[1]) * p1, 0]] }); } run = null; };
        for (let k = 0; k <= n; k++) {
          const x = a[0] + ((b[0] - a[0]) * k) / n, z = a[1] + ((b[1] - a[1]) * k) / n;
          if (inPoly(land.pts, x, z) && !P.canalAt(x, z)) { if (!run) run = [k, k]; else run[1] = k; } else flush();
        }
        flush();
      }
    }
  }
  // snap grid line ends to the nearest crossing line of the same grid (so streets meet, not stop short)
  for (const ln of lines) {
    if (!ln.grid) continue;
    const G = GRIDS.find((g) => g.id === ln.grid);
    const cross = (ln.axis === 'x' ? G.lineZ : G.lineX).map((l) => l.v);
    for (const end of [0, 1]) {
      const p = ln.pts[end], s = ln.axis === 'x' ? p[1] : p[0];
      let best = null;
      for (const c of cross) if (Math.abs(c - s) < 30 && (!best || Math.abs(c - s) < Math.abs(best - s))) best = c;
      if (best != null) { if (ln.axis === 'x') p[1] = best; else p[0] = best; }
    }
  }
  for (const C of CROSSINGS) lines.push({ cls: C.cls, name: C.name, crossing: C, pts: C.pts.map(([x, z]) => [x, z, 0]) });
  for (const R of EXTRA_ROADS) lines.push({ cls: R.cls, name: R.name, pts: R.pts.map(([x, z]) => [x, z, 0]) });
  for (const E of EXPRESSWAY.lines) lines.push({ cls: EXPRESSWAY.cls, name: E.name, expressway: true, pts: E.pts.map((p) => [...p]) });

  // ---- the graph: nodes at ends and crossings (same level only), split lines into edges ----
  const nodes = P.nodes;
  const nodeAt = (x, z, y) => {
    for (const n of nodes) if (Math.abs(n.x - x) < 6 && Math.abs(n.z - z) < 6 && Math.abs(n.yo - y) < 2) return n;
    const n = { id: nodes.length, x, z, yo: y, y: GROUND + y, edges: [] };
    nodes.push(n);
    return n;
  };
  // the cut points along each line: {seg, t, node}
  for (const ln of lines) ln.cuts = [];
  const addCut = (ln, seg, t, node) => { if (!ln.cuts.some((c) => c.node === node)) ln.cuts.push({ seg, t, node }); };
  for (const ln of lines) { const n = ln.pts.length; addCut(ln, 0, 0, nodeAt(ln.pts[0][0], ln.pts[0][1], ln.pts[0][2])); addCut(ln, n - 2, 1, nodeAt(ln.pts[n - 1][0], ln.pts[n - 1][1], ln.pts[n - 1][2])); }
  // intermediate polyline points of expressway lines at full height can be shared (the T junction)
  for (const ln of lines) if (ln.expressway) for (let i = 1; i < ln.pts.length - 1; i++) {
    const p = ln.pts[i];
    const shared = lines.some((o) => o !== ln && o.expressway && o.pts.some((q) => Math.abs(q[0] - p[0]) < 6 && Math.abs(q[1] - p[1]) < 6 && Math.abs(q[2] - p[2]) < 2));
    if (shared) addCut(ln, i, 0, nodeAt(p[0], p[1], p[2]));
  }
  const segs = [];
  for (const ln of lines) for (let i = 0; i < ln.pts.length - 1; i++) segs.push({ ln, i, a: ln.pts[i], b: ln.pts[i + 1] });
  const level = (s, t) => s.a[2] + (s.b[2] - s.a[2]) * t;
  for (let i = 0; i < segs.length; i++) {
    const A = segs[i];
    for (let j = i + 1; j < segs.length; j++) {
      const B = segs[j];
      if (A.ln === B.ln) continue;
      // bounding boxes
      if (Math.max(A.a[0], A.b[0]) < Math.min(B.a[0], B.b[0]) - 8 || Math.max(B.a[0], B.b[0]) < Math.min(A.a[0], A.b[0]) - 8) continue;
      if (Math.max(A.a[1], A.b[1]) < Math.min(B.a[1], B.b[1]) - 8 || Math.max(B.a[1], B.b[1]) < Math.min(A.a[1], A.b[1]) - 8) continue;
      const r = A.b[0] - A.a[0], s = A.b[1] - A.a[1], u = B.b[0] - B.a[0], v = B.b[1] - B.a[1];
      const den = r * v - s * u;
      let ta, tb;
      if (Math.abs(den) > 1e-9) {
        ta = ((B.a[0] - A.a[0]) * v - (B.a[1] - A.a[1]) * u) / den;
        tb = ((B.a[0] - A.a[0]) * s - (B.a[1] - A.a[1]) * r) / den;
      } else continue;
      const LA = Math.hypot(r, s), LB = Math.hypot(u, v);
      const ea = 10 / LA, eb = 10 / LB;
      if (ta < -ea || ta > 1 + ea || tb < -eb || tb > 1 + eb) continue;
      ta = Math.min(1, Math.max(0, ta)); tb = Math.min(1, Math.max(0, tb));
      const ya = level(A, ta), yb = level(B, tb);
      if (Math.abs(ya - yb) > 2) continue; // one passes over the other
      const x = A.a[0] + r * ta, z = A.a[1] + s * ta;
      const n = nodeAt(x, z, ya);
      addCut(A.ln, A.i, ta, n); addCut(B.ln, B.i, tb, n);
    }
  }
  // edges between consecutive cuts along each line
  const edges = P.edges;
  for (const ln of lines) {
    ln.cuts.sort((p, q) => p.seg - q.seg || p.t - q.t);
    for (let k = 0; k < ln.cuts.length - 1; k++) {
      const c0 = ln.cuts[k], c1 = ln.cuts[k + 1];
      if (c0.node === c1.node) continue;
      const pts = [[c0.node.x, c0.node.z, c0.node.yo]];
      for (let i = c0.seg + 1; i <= c1.seg; i++) if (!(i === c1.seg && c1.t === 0)) pts.push(ln.pts[i]);
      pts.push([c1.node.x, c1.node.z, c1.node.yo]);
      // drop duplicate points
      const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.5);
      if (clean.length < 2) continue;
      const R = ROAD[ln.cls];
      const e = {
        id: edges.length, a: c0.node.id, b: c1.node.id, cls: ln.cls, name: ln.name, R,
        lanes: R.lanes, width: R.lanes * 2 * R.lane + R.median, walk: R.walk,
        elevated: !!ln.expressway, crossing: ln.crossing || null, raw: clean,
      };
      edges.push(e);
      c0.node.edges.push(e.id); c1.node.edges.push(e.id);
    }
  }

  // ---- heights along edges: decks over water ----
  for (const e of edges) {
    const raw = e.raw;
    // resample to points every 16 studs (straight ground roads keep just their ends)
    const pts = [];
    let total = 0;
    for (let i = 0; i < raw.length - 1; i++) total += Math.hypot(raw[i + 1][0] - raw[i][0], raw[i + 1][1] - raw[i][1]);
    e.len = total;
    const overWater = (x, z) => !P.landAt(x, z) || !!P.canalAt(x, z, 2);
    let wet = false;
    const step = 16, N = Math.max(1, Math.ceil(total / step));
    const at = (d) => {
      let acc = 0;
      for (let i = 0; i < raw.length - 1; i++) {
        const L = Math.hypot(raw[i + 1][0] - raw[i][0], raw[i + 1][1] - raw[i][1]);
        if (acc + L >= d - 1e-6 || i === raw.length - 2) {
          const t = L > 0 ? Math.min(1, Math.max(0, (d - acc) / L)) : 0;
          return [raw[i][0] + (raw[i + 1][0] - raw[i][0]) * t, raw[i][1] + (raw[i + 1][1] - raw[i][1]) * t, raw[i][2] + (raw[i + 1][2] - raw[i][2]) * t];
        }
        acc += L;
      }
      return raw[raw.length - 1];
    };
    for (let k = 0; k <= N; k++) {
      const d = (k / N) * total, p = at(d);
      const w = overWater(p[0], p[1]);
      if (w) wet = true;
      pts.push({ x: p[0], z: p[1], yo: p[2], d, wet: w });
    }
    // a deck over open water: rise from each shore at most 9% up to `deck`
    if (wet && e.crossing) {
      const deck = e.crossing.deck;
      // distance to the nearest dry point along the edge
      const dry = pts.map((p) => !p.wet);
      for (const p of pts) {
        if (!p.wet) continue;
        let near = Infinity;
        for (let k = 0; k < pts.length; k++) if (dry[k]) near = Math.min(near, Math.abs(pts[k].d - p.d));
        if (near === Infinity) near = Math.min(p.d, total - p.d);
        p.yo = Math.max(p.yo, Math.min(deck, near * 0.09));
      }
    }
    e.bridge = wet;
    e.pts = pts.map((p) => ({ x: p.x, z: p.z, y: GROUND + p.yo, d: p.d, wet: p.wet }));
    // straight, flat, dry roads keep only their ends
    if (!wet && !e.elevated && raw.length === 2 && e.pts.every((p) => Math.abs(p.y - GROUND) < 0.01)) e.pts = [e.pts[0], e.pts[e.pts.length - 1]];
    delete e.raw;
  }
  for (const n of nodes) {
    n.light = n.edges.length >= 3 && n.yo === 0 && n.edges.some((id) => ['blvd', 'ave'].includes(edges[id].cls));
    delete n.yo;
  }

  // ---- blocks: the cells between consecutive grid lines ----
  for (const G of GRIDS) {
    const land = P.landById[G.land];
    const xs = G.lineX.map((l) => l.v).sort((a, b) => a - b), zs = G.lineZ.map((l) => l.v).sort((a, b) => a - b);
    const halfW = (L) => { const R = ROAD[L.cls]; return (R.lanes * 2 * R.lane + R.median) / 2 + R.walk; };
    const lineX = Object.fromEntries(G.lineX.map((l) => [l.v, l])), lineZ = Object.fromEntries(G.lineZ.map((l) => [l.v, l]));
    // pad the outermost cells by one spacing so the coast gets blocks too
    const ex = [xs[0] - 260, ...xs, xs[xs.length - 1] + 260], ez = [zs[0] - 240, ...zs, zs[zs.length - 1] + 240];
    for (let i = 0; i < ex.length - 1; i++) for (let j = 0; j < ez.length - 1; j++) {
      const lx0 = lineX[ex[i]], lx1 = lineX[ex[i + 1]], lz0 = lineZ[ez[j]], lz1 = lineZ[ez[j + 1]];
      const x0 = ex[i] + (lx0 ? halfW(lx0) : 0), x1 = ex[i + 1] - (lx1 ? halfW(lx1) : 0);
      const z0 = ez[j] + (lz0 ? halfW(lz0) : 0), z1 = ez[j + 1] - (lz1 ? halfW(lz1) : 0);
      if (x1 - x0 < 30 || z1 - z0 < 30) continue;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (G.skip.some((r) => cx > r[0] && cx < r[2] && cz > r[1] && cz < r[3])) continue;
      // keep the block if a good part of it is on dry land
      let dryN = 0, n = 0;
      for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) { n++; const x = x0 + ((x1 - x0) * a) / 4, z = z0 + ((z1 - z0) * b) / 4; if (inPoly(land.pts, x, z) && !P.canalAt(x, z, 4)) dryN++; }
      if (dryN < n * 0.3) continue;
      const D = P.districtAt(cx, cz);
      P.blocks.push({ id: P.blocks.length, grid: G.id, x0, z0, x1, z1, district: D.id, dry: dryN / n, edge: { w: !!lx0, e: !!lx1, n: !!lz0, s: !!lz1 } });
    }
  }
  P.ms = Math.round((typeof performance !== 'undefined' ? performance : Date).now() - t0);
  return P;
}

/** Point and tangent at distance d along an edge's polyline. */
export function edgePoint(e, d, out = {}) {
  const pts = e.pts;
  if (d <= 0) { out.x = pts[0].x; out.y = pts[0].y; out.z = pts[0].z; } else {
    let i = 1;
    while (i < pts.length - 1 && pts[i].d < d) i++;
    const a = pts[i - 1], b = pts[i], L = b.d - a.d || 1, t = Math.min(1, Math.max(0, (d - a.d) / L));
    out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t;
    out.dx = (b.x - a.x) / L; out.dz = (b.z - a.z) / L; out.dy = (b.y - a.y) / L;
    return out;
  }
  const b = pts[1], L = b.d || 1;
  out.dx = (b.x - pts[0].x) / L; out.dz = (b.z - pts[0].z) / L; out.dy = (b.y - pts[0].y) / L;
  return out;
}

export { HALF };
