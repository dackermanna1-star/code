// Grid pathfinding on the tile grid: A* (8-directional, no corner cutting) and BFS reachability.
// `passable(cx, cy)` decides walkability; the start cell is always treated as passable.

const SQRT2 = Math.SQRT2;
const NB8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQRT2], [-1, 1, SQRT2], [1, -1, SQRT2], [-1, -1, SQRT2]];

/** Binary min-heap of node indices keyed by a parallel priority array. */
class MinHeap {
  constructor() {
    this.items = [];
    this.prio = [];
  }
  get size() { return this.items.length; }
  push(item, p) {
    const it = this.items;
    const pr = this.prio;
    let i = it.length;
    it.push(item);
    pr.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pr[parent] <= p) break;
      it[i] = it[parent];
      pr[i] = pr[parent];
      i = parent;
    }
    it[i] = item;
    pr[i] = p;
  }
  pop() {
    const it = this.items;
    const pr = this.prio;
    const top = it[0];
    const lastItem = it.pop();
    const lastP = pr.pop();
    const n = it.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && pr[r] < pr[l] ? r : l;
        if (pr[c] >= lastP) break;
        it[i] = it[c];
        pr[i] = pr[c];
        i = c;
      }
      it[i] = lastItem;
      pr[i] = lastP;
    }
    return top;
  }
}

/**
 * A* from (sx,sy) to (gx,gy). Returns the cells after the start up to and including the goal as
 * [[cx, cy], ...] (empty array when start === goal), or null when unreachable.
 */
export function astar(w, h, passable, sx, sy, gx, gy, { diagonal = true, maxIter = 60000 } = {}) {
  if (sx === gx && sy === gy) return [];
  if (gx < 0 || gy < 0 || gx >= w || gy >= h || !passable(gx, gy)) return null;
  const n = w * h;
  const g = new Float32Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open = new MinHeap();
  const start = sy * w + sx;
  const goal = gy * w + gx;
  const heur = (x, y) => {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return diagonal ? Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy) : dx + dy;
  };
  const ok = (x, y) => x >= 0 && y >= 0 && x < w && y < h && (passable(x, y) || (x === sx && y === sy));
  g[start] = 0;
  open.push(start, heur(sx, sy));
  const nbCount = diagonal ? 8 : 4;
  let iter = 0;
  while (open.size && iter++ < maxIter) {
    const cur = open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (let k = 0; k < nbCount; k++) {
      const [dx, dy, cost] = NB8[k];
      const nx = cx + dx;
      const ny = cy + dy;
      if (!ok(nx, ny)) continue;
      // No corner cutting: a diagonal step needs both orthogonal neighbours free.
      if (dx && dy && (!ok(cx + dx, cy) || !ok(cx, cy + dy))) continue;
      const ni = ny * w + nx;
      if (closed[ni]) continue;
      const ng = g[cur] + cost;
      if (ng < g[ni]) {
        g[ni] = ng;
        parent[ni] = cur;
        open.push(ni, ng + heur(nx, ny) * 1.0001);
      }
    }
  }
  if (parent[goal] === -1) return null;
  const out = [];
  for (let c = goal; c !== start; c = parent[c]) {
    const x = c % w;
    out.push([x, (c - x) / w]);
  }
  return out.reverse();
}

/** 4-directional flood fill: is (gx,gy) reachable from (sx,sy)? */
export function reachable(w, h, passable, sx, sy, gx, gy) {
  if (sx === gx && sy === gy) return true;
  if (gx < 0 || gy < 0 || gx >= w || gy >= h || !passable(gx, gy)) return false;
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  queue[tail++] = sy * w + sx;
  seen[sy * w + sx] = 1;
  const goal = gy * w + gx;
  while (head < tail) {
    const c = queue[head++];
    if (c === goal) return true;
    const x = c % w;
    const y = (c - x) / w;
    if (x > 0) visit(c - 1, x - 1, y);
    if (x < w - 1) visit(c + 1, x + 1, y);
    if (y > 0) visit(c - w, x, y - 1);
    if (y < h - 1) visit(c + w, x, y + 1);
  }
  return false;
  function visit(i, x, y) {
    if (seen[i] || !passable(x, y)) return;
    seen[i] = 1;
    queue[tail++] = i;
  }
}
