// Navigation graph over walkable surfaces. Nodes are horizontal surfaces and
// staircases; links are stairs, drops, jumps and drop-throughs. All-pairs
// costs are precomputed (Floyd–Warshall) so per-fighter queries are cheap.

import { clamp } from '../core/math.js';

const WALKABLE = new Set(['ground', 'floor', 'roof', 'catwalk', 'scaffold', 'skylight']);
const BLOCKERS = new Set(['wall', 'bounds', 'ceiling']);

export class Nav {
  constructor(level) {
    this.L = level;
    this.surfaces = [];
    this.links = [];
    this.out = [];
    this.dist = [];
    this.main = 0;
  }

  surfaceAt(x, y, tol = 3) {
    let best = null;
    for (const s of this.surfaces) {
      if (s.type === 'stairs') continue;
      if (Math.abs(s.y - y) > tol) continue;
      if (x < s.x0 - 3 || x > s.x1 + 3) continue;
      best = s;
      break;
    }
    return best;
  }

  // Surface for a fighter standing on `solid` at x.
  surfaceOf(solid, x) {
    if (!solid) return null;
    if (solid.step) return this.surfaces[solid.surface] || null;
    return this.surfaceAt(clamp(x, solid.x, solid.x + solid.w), solid.y);
  }

  addLink(l) {
    l.id = this.links.length;
    this.links.push(l);
    this.out[l.from].push(l);
    return l;
  }

  nextLink(from, to, x) {
    if (from === to || from < 0 || to < 0) return null;
    let best = null;
    let bc = Infinity;
    const row = this.out[from];
    for (let i = 0; i < row.length; i++) {
      const l = row[i];
      const rest = l.to === to ? 0 : this.dist[l.to][to];
      if (rest === Infinity) continue;
      const lx = l.xa !== undefined ? clamp(x, l.xa, l.xb) : l.x;
      const c = Math.abs(x - lx) / 260 + l.cost + rest;
      if (c < bc) {
        bc = c;
        best = l;
      }
    }
    return best;
  }

  reachable(from, to) {
    if (from === to) return true;
    if (from < 0 || to < 0) return false;
    return this.dist[from][to] < Infinity;
  }
}

function blockingSolid(L, x, y) {
  const list = L.queryRect(x - 1, y - 1, x + 1, y + 1, []);
  for (const s of list) {
    if (s.oneWay || s.broken) continue;
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s;
  }
  return null;
}

export function buildNav(L) {
  const nav = new Nav(L);

  // 1. Merge walkable tops into horizontal intervals.
  const walk = L.solids.filter((s) => !s.broken && !s.step && WALKABLE.has(s.kind));
  walk.sort((a, b) => a.y - b.y || a.x - b.x);
  const intervals = [];
  for (const s of walk) {
    const last = intervals[intervals.length - 1];
    if (last && Math.abs(last.y - s.y) < 1 && s.x <= last.x1 + 2) {
      last.x1 = Math.max(last.x1, s.x + s.w);
      last.oneWay = last.oneWay && s.oneWay;
    } else {
      intervals.push({ x0: s.x, x1: s.x + s.w, y: s.y, oneWay: s.oneWay, kind: s.kind });
    }
  }

  // 2. Split by full-height walls standing on them.
  const pieces = [];
  for (const iv of intervals) {
    const blockers = L.solids.filter(
      (s) =>
        !s.broken &&
        !s.oneWay &&
        BLOCKERS.has(s.kind) &&
        s.x < iv.x1 &&
        s.x + s.w > iv.x0 &&
        s.y <= iv.y - 100 &&
        s.y + s.h >= iv.y - 4,
    );
    blockers.sort((a, b) => a.x - b.x);
    let cur = iv.x0;
    for (const bl of blockers) {
      if (bl.x > cur + 30) pieces.push({ ...iv, x0: cur, x1: bl.x });
      cur = Math.max(cur, bl.x + bl.w);
    }
    if (iv.x1 > cur + 30) pieces.push({ ...iv, x0: cur, x1: iv.x1 });
  }
  for (const p of pieces) {
    nav.surfaces.push({ id: nav.surfaces.length, type: p.oneWay ? 'platform' : 'floor', x0: p.x0, x1: p.x1, y: p.y, oneWay: p.oneWay, kind: p.kind });
  }

  // 3. Staircases.
  for (const st of L.stairs) {
    const S = {
      id: nav.surfaces.length,
      type: 'stairs',
      x0: st.x0,
      x1: st.x1,
      y: st.yTop,
      yBottom: st.yBottom,
      yTop: st.yTop,
      xBottom: st.xBottom,
      xTop: st.xTop,
      dir: st.dir,
      stairs: st.id,
    };
    nav.surfaces.push(S);
    st.surface = S.id;
    for (const step of st.steps) step.surface = S.id;
  }
  nav.out = nav.surfaces.map(() => []);

  for (const st of L.stairs) {
    const S = nav.surfaces[st.surface];
    const lower = nav.surfaceAt(st.xBottom - st.dir * 8, st.yBottom);
    const upper = nav.surfaceAt(st.xTop + st.dir * 8, st.yTop);
    const len = Math.abs(st.xTop - st.xBottom);
    if (lower) {
      nav.addLink({ from: lower.id, to: S.id, type: 'stairsEnter', x: st.xBottom - st.dir * 6, x2: st.xBottom + st.dir * 14, cost: 0.6 });
      nav.addLink({ from: S.id, to: lower.id, type: 'stairsExit', x: st.xBottom + st.dir * 10, x2: st.xBottom - st.dir * 20, cost: 0.3 + len / 600 });
      nav.addLink({ from: S.id, to: lower.id, type: 'dropThrough', xa: st.x0 + 10, xb: st.x1 - 10, cost: 1.2 });
    }
    if (upper) {
      nav.addLink({ from: S.id, to: upper.id, type: 'stairsExit', x: st.xTop - st.dir * 4, x2: st.xTop + st.dir * 22, cost: 0.4 + len / 400 });
      nav.addLink({ from: upper.id, to: S.id, type: 'stairsEnter', x: st.xTop + st.dir * 4, x2: st.xTop - st.dir * 24, cost: 0.5 });
    }
  }

  // 4. Edge links: drops off ends and jumps across gaps.
  const flat = nav.surfaces.filter((s) => s.type !== 'stairs');
  for (const S of flat) {
    for (const dir of [-1, 1]) {
      const end = dir < 0 ? S.x0 : S.x1;
      const blk = blockingSolid(L, end + dir * 6, S.y - 12);
      let vault = false;
      if (blk) {
        if (blk.kind === 'railing') vault = true;
        else if (blk.kind !== 'obstacle' && blk.y < S.y - 108) continue; // unclimbable wall
      }
      const probe = end + dir * 18;
      if (!blk || vault) {
        const g = L.groundUnder(probe - 3, probe + 3, S.y + 4, 900, true);
        if (g) {
          const T = nav.surfaceOf(g, probe);
          const h = g.y - S.y;
          if (T && T.id !== S.id && h > 8) {
            nav.addLink({ from: S.id, to: T.id, type: 'drop', x: end - dir * 4, x2: probe, dir, h, vault, cost: 1 + h / 260 + (h > 420 ? 10 : 0) + (vault ? 0.8 : 0) });
          }
        }
      }
      if (vault) continue;
      for (const T of flat) {
        if (T === S) continue;
        const near = dir > 0 ? T.x0 : T.x1;
        const gap = (near - end) * dir;
        const dy = T.y - S.y;
        if (gap < -4 || gap > 235) continue;
        if (dy < -108 || dy > 300) continue;
        if (gap < 30 && dy > 10) continue;
        if (L.raycast(end - dir * 4, S.y - 96, near + dir * 12, T.y - 96)) continue;
        nav.addLink({ from: S.id, to: T.id, type: 'jump', x: end - dir * 8, x2: near + dir * 24, dir, gap, dy, cost: 1.8 + gap / 150 + Math.max(0, -dy) / 90 });
      }
    }
    // drop through one-way platforms
    if (S.oneWay) {
      const mid = (S.x0 + S.x1) / 2;
      const g = L.groundUnder(mid - 2, mid + 2, S.y + 16, 900, true);
      if (g) {
        const T = nav.surfaceOf(g, mid);
        if (T && T.id !== S.id) nav.addLink({ from: S.id, to: T.id, type: 'dropThrough', xa: S.x0 + 20, xb: S.x1 - 20, cost: 1 + (g.y - S.y) / 260 });
      }
    }
  }

  // 5. All-pairs shortest costs.
  const N = nav.surfaces.length;
  const D = [];
  for (let i = 0; i < N; i++) {
    D.push(new Array(N).fill(Infinity));
    D[i][i] = 0;
  }
  for (const l of nav.links) {
    const T = nav.surfaces[l.to];
    const w = l.cost + (T.x1 - T.x0) / 900;
    if (w < D[l.from][l.to]) D[l.from][l.to] = w;
  }
  for (let k = 0; k < N; k++) {
    const Dk = D[k];
    for (let i = 0; i < N; i++) {
      const Di = D[i];
      const dik = Di[k];
      if (dik === Infinity) continue;
      for (let j = 0; j < N; j++) {
        const v = dik + Dk[j];
        if (v < Di[j]) Di[j] = v;
      }
    }
  }
  nav.dist = D;

  // 6. The main surface is the widest floor everything should connect to.
  let main = 0;
  let mw = -1;
  for (const s of flat) {
    if (s.x1 - s.x0 > mw && !s.oneWay) {
      mw = s.x1 - s.x0;
      main = s.id;
    }
  }
  nav.main = main;
  for (const s of nav.surfaces) {
    s.isolated = !(D[main][s.id] < Infinity && D[s.id][main] < Infinity);
  }
  L.nav = nav;
  L.surfaces = nav.surfaces;
  L.links = nav.links;
  return nav;
}
