// Routes on the road graph: the GPS, the police and anyone else who needs
// to get from A to B by road. A* over plan nodes, preferring the big roads.
//
//   route(plan, fromX, fromZ, toX, toZ, o?) -> { pts: [{x, y, z}], edges: [edge ids], nodes: [node ids], len } | null
//     o: { dirX, dirZ, uturn } - a vehicle facing (dirX, dirZ) pays `uturn` extra to start off backwards
//   nearestNode(plan, x, z) -> node
import { segDist } from '../world/plan.js';

const PREFER = { hwy: 0.7, blvd: 0.85, ave: 0.92, street: 1, drive: 1.05 };
let grid = null, gridPlan = null;
const GC = 256;

function buildGrid(plan) {
  grid = new Map(); gridPlan = plan;
  for (const e of plan.edges) {
    const seen = new Set();
    for (const p of e.pts) {
      const k = Math.floor(p.x / GC) * 4096 + Math.floor(p.z / GC);
      if (seen.has(k)) continue; seen.add(k);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(e);
    }
    // long straight edges: file the cells in between too
    const a = e.pts[0], b = e.pts[e.pts.length - 1], n = Math.ceil(e.len / GC);
    for (let i = 1; i < n; i++) {
      const x = a.x + ((b.x - a.x) * i) / n, z = a.z + ((b.z - a.z) * i) / n, k = Math.floor(x / GC) * 4096 + Math.floor(z / GC);
      if (seen.has(k)) continue; seen.add(k);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(e);
    }
  }
}

/** The road edge nearest to (x, z) and the point on it. */
export function nearestEdge(plan, x, z, maxR = 1200) {
  if (gridPlan !== plan) buildGrid(plan);
  let best = null, bd = Infinity;
  for (let r = 0; r <= maxR / GC && !best; r++) {
    const ci = Math.floor(x / GC), cj = Math.floor(z / GC);
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
      const c = grid.get(i * 4096 + j);
      if (!c) continue;
      for (const e of c) {
        for (let k = 0; k < e.pts.length - 1; k++) {
          const p = e.pts[k], q = e.pts[k + 1];
          const s = segDist(x, z, p.x, p.z, q.x, q.z);
          if (s.d < bd) { bd = s.d; best = { edge: e, x: s.px, z: s.pz, y: p.y + (q.y - p.y) * s.t, d: s.d, seg: k, t: s.t, along: p.d + (q.d - p.d) * s.t }; }
        }
      }
    }
  }
  return best;
}

export function nearestNode(plan, x, z) {
  const ne = nearestEdge(plan, x, z);
  if (!ne) return null;
  const a = plan.nodes[ne.edge.a], b = plan.nodes[ne.edge.b];
  return Math.hypot(a.x - x, a.z - z) < Math.hypot(b.x - x, b.z - z) ? a : b;
}

/** A* from the road nearest (fromX, fromZ) to the road nearest (toX, toZ). */
export function route(plan, fromX, fromZ, toX, toZ, o = null) {
  const s = nearestEdge(plan, fromX, fromZ), t = nearestEdge(plan, toX, toZ);
  if (!s || !t) return null;
  const N = plan.nodes, E = plan.edges;
  // start from both ends of the start edge; finish at either end of the target edge
  const g = new Map(), from = new Map(), open = [];
  const h = (n) => Math.hypot(N[n].x - t.x, N[n].z - t.z) * 0.7;
  const push = (n, cost, prev, via) => {
    if (g.has(n) && g.get(n) <= cost) return;
    g.set(n, cost); from.set(n, { prev, via });
    open.push({ n, f: cost + h(n) });
  };
  const back = (n) => (o && (N[n].x - s.x) * o.dirX + (N[n].z - s.z) * o.dirZ < 0 ? o.uturn || 150 : 0);
  push(s.edge.a, s.along * PREFER[s.edge.cls] + back(s.edge.a), -1, s.edge.id);
  push(s.edge.b, (s.edge.len - s.along) * PREFER[s.edge.cls] + back(s.edge.b), -1, s.edge.id);
  const goal = new Set([t.edge.a, t.edge.b]);
  let end = -1, iter = 0;
  while (open.length && iter++ < 20000) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const { n } = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (goal.has(n)) { end = n; break; }
    const gn = g.get(n);
    for (const id of N[n].edges) {
      const e = E[id], m = e.a === n ? e.b : e.a;
      push(m, gn + e.len * (PREFER[e.cls] || 1), n, id);
    }
  }
  if (end < 0) return null;
  // walk back
  const nodes = [], edges = [];
  for (let n = end; n >= 0;) { nodes.unshift(n); const f = from.get(n); if (!f) break; edges.unshift(f.via); n = f.prev; }
  const pts = [{ x: s.x, y: s.y, z: s.z }];
  // the first edge's points from the start towards the first node
  const addEdge = (e, fromNode) => {
    const P = e.a === fromNode ? e.pts : [...e.pts].reverse();
    for (const p of P) pts.push({ x: p.x, y: p.y, z: p.z });
  };
  for (let i = 0; i < nodes.length; i++) {
    const n = N[nodes[i]];
    if (i > 0) addEdge(E[edges[i]], nodes[i - 1]);
    else pts.push({ x: n.x, y: n.y, z: n.z });
  }
  pts.push({ x: t.x, y: t.y, z: t.z });
  let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return { pts, edges, nodes, len, start: s, end: t };
}
