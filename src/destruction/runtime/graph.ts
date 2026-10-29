// Pure bookkeeping for the destruction runtime: union-find components over rigid bonds,
// island split planning, far-mass estimation for inertial bond loading and the joint-group
// constraint rules. No Babylon, no geometry calls — unit-tested with plain data
// (tests/unit/destruction-graph.test.ts).

import type { Vec3 } from "../../geom/vec.ts";

/** Disjoint-set forest with path halving + union by rank. Indices 0..n-1. */
export class UnionFind {
  private parent: Int32Array;
  private rank: Uint8Array;

  constructor(n: number) {
    this.parent = new Int32Array(n);
    this.rank = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.parent[i] = i;
  }

  find(x: number): number {
    const p = this.parent;
    while (p[x] !== x) {
      p[x] = p[p[x]];
      x = p[x];
    }
    return x;
  }

  /** Returns true if a and b were in different sets. */
  union(a: number, b: number): boolean {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return false;
    if (this.rank[ra] < this.rank[rb]) {
      const t = ra;
      ra = rb;
      rb = t;
    }
    this.parent[rb] = ra;
    if (this.rank[ra] === this.rank[rb]) this.rank[ra]++;
    return true;
  }
}

/** Minimal bond view for component analysis. `b` = -1 means the static world. */
export interface GraphBond {
  a: number;
  b: number;
  /** Rigid bonds (everything except hinge/slider/latch) glue parts into one island. */
  rigid: boolean;
  alive: boolean;
}

export interface SplitPlan {
  /** Component index per part. */
  comp: Int32Array;
  count: number;
  /** Total mass per component (kg). */
  mass: number[];
  /** Component contains a part with an intact rigid WORLD bond (=> static). */
  anchored: boolean[];
  /** Part indices per component (ascending). */
  members: number[][];
  /** Component that keeps the existing body: the heaviest (ties: anchored first, then lowest index). */
  keeper: number;
}

/**
 * Connected components of `n` parts over intact rigid bonds whose endpoints are both parts of
 * this set (indices in [0, n)); bonds to the world (b = -1) only mark anchoring. Bonds that
 * reference indices outside [0, n) (parts of other islands) are ignored.
 */
export function planSplit(n: number, masses: ArrayLike<number>, bonds: readonly GraphBond[]): SplitPlan {
  const uf = new UnionFind(n);
  for (let i = 0; i < bonds.length; i++) {
    const b = bonds[i];
    if (!b.alive || !b.rigid) continue;
    if (b.a < 0 || b.a >= n || b.b < 0 || b.b >= n) continue;
    uf.union(b.a, b.b);
  }
  const rootToComp = new Int32Array(n).fill(-1);
  const comp = new Int32Array(n);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const r = uf.find(i);
    if (rootToComp[r] < 0) rootToComp[r] = count++;
    comp[i] = rootToComp[r];
  }
  const mass = new Array<number>(count).fill(0);
  const anchored = new Array<boolean>(count).fill(false);
  const members: number[][] = [];
  for (let c = 0; c < count; c++) members.push([]);
  for (let i = 0; i < n; i++) {
    const m = masses[i];
    mass[comp[i]] += Number.isFinite(m) && m > 0 ? m : 0;
    members[comp[i]].push(i);
  }
  for (let i = 0; i < bonds.length; i++) {
    const b = bonds[i];
    if (!b.alive || !b.rigid || b.b !== -1) continue;
    if (b.a < 0 || b.a >= n) continue;
    anchored[comp[b.a]] = true;
  }
  let keeper = 0;
  for (let c = 1; c < count; c++) {
    const dm = mass[c] - mass[keeper];
    const eps = 1e-9 * Math.max(1, mass[keeper]);
    if (dm > eps || (Math.abs(dm) <= eps && anchored[c] && !anchored[keeper])) keeper = c;
  }
  return { comp, count, mass, anchored, members, keeper };
}

/**
 * With `scratch`, the result is `scratch.out` (first `bondCount` entries valid, no allocation);
 * otherwise a fresh array of exactly `bondCount` entries.
 *
 * Mass on the far side of every bond as seen from part `root` (the impacted part), used for
 * inertial bond loading E_b = J² m_far / (2 M²). Exact for trees (subtree masses of a BFS tree
 * rooted at `root`); for cycles the non-tree edge gets the smaller of its endpoints' subtree
 * masses (load shared around the loop). Bonds not connected to the root's component get the
 * mass of their own far endpoint's part; world bonds (b = -1) get the island mass (the bond
 * would have to stop everything). Only rigid live bonds are traversed; joint bonds get their
 * far endpoint's subtree like any other edge when both ends are parts of the set.
 */
export function farMasses(n: number, masses: ArrayLike<number>, bonds: readonly GraphBond[], root: number, scratch?: FarMassScratch, bondCount = bonds.length): Float64Array {
  const nb = Math.min(bondCount, bonds.length);
  const S = scratch ?? new FarMassScratch();
  S.reserve(n, nb);
  const out = S.out;
  out.fill(0, 0, nb);
  if (n === 0) return scratch ? out : out.slice(0, nb);
  // adjacency (CSR) over live bonds with both endpoints in range
  const deg = S.deg;
  deg.fill(0, 0, n + 1);
  for (let i = 0; i < nb; i++) {
    const b = bonds[i];
    if (!b.alive || b.a < 0 || b.a >= n || b.b < 0 || b.b >= n || b.a === b.b) continue;
    deg[b.a + 1]++;
    deg[b.b + 1]++;
  }
  for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
  S.reserveAdj(deg[n]);
  const adjNode = S.adjNode;
  const adjBond = S.adjBond;
  const fill = S.fill;
  for (let i = 0; i < n; i++) fill[i] = deg[i];
  for (let i = 0; i < nb; i++) {
    const b = bonds[i];
    if (!b.alive || b.a < 0 || b.a >= n || b.b < 0 || b.b >= n || b.a === b.b) continue;
    adjNode[fill[b.a]] = b.b;
    adjBond[fill[b.a]++] = i;
    adjNode[fill[b.b]] = b.a;
    adjBond[fill[b.b]++] = i;
  }
  // BFS from root
  const order = S.order;
  const parentBond = S.parentBond;
  parentBond.fill(-1, 0, n);
  const visited = S.visited;
  visited.fill(0, 0, n);
  let head = 0;
  let tail = 0;
  const r = root >= 0 && root < n ? root : 0;
  order[tail++] = r;
  visited[r] = 1;
  while (head < tail) {
    const u = order[head++];
    for (let k = deg[u]; k < deg[u + 1]; k++) {
      const v = adjNode[k];
      if (visited[v]) continue;
      visited[v] = 1;
      parentBond[v] = adjBond[k];
      order[tail++] = v;
    }
  }
  // subtree masses in reverse BFS order
  const sub = S.sub;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const m = masses[i];
    sub[i] = Number.isFinite(m) && m > 0 ? m : 0;
    total += sub[i];
  }
  for (let i = tail - 1; i > 0; i--) {
    const v = order[i];
    const pb = bonds[parentBond[v]];
    const p = pb.a === v ? pb.b : pb.a;
    sub[p] += sub[v];
  }
  for (let i = 0; i < nb; i++) {
    const b = bonds[i];
    if (!b.alive) continue;
    if (b.b === -1) {
      out[i] = total;
      continue;
    }
    if (b.a < 0 || b.a >= n || b.b < 0 || b.b >= n) continue;
    if (!visited[b.a] || !visited[b.b]) {
      // disconnected from the impact: only its own far part moves with it
      out[i] = Math.min(sub[b.a], sub[b.b]);
      continue;
    }
    if (parentBond[b.b] === i) out[i] = sub[b.b];
    else if (parentBond[b.a] === i) out[i] = sub[b.a];
    else out[i] = Math.min(sub[b.a], sub[b.b]);
  }
  return scratch ? out : out.slice(0, nb);
}

/**
 * Reusable work arrays for farMasses (allocation-free inertial loading in the impact hot path).
 * Results live in `out` (valid until the next call; length may exceed the bond count).
 */
export class FarMassScratch {
  out = new Float64Array(16);
  deg = new Int32Array(17);
  fill = new Int32Array(16);
  order = new Int32Array(16);
  parentBond = new Int32Array(16);
  visited = new Uint8Array(16);
  sub = new Float64Array(16);
  adjNode = new Int32Array(32);
  adjBond = new Int32Array(32);

  reserve(n: number, nb: number): void {
    if (this.out.length < nb) this.out = new Float64Array(grow(this.out.length, nb));
    if (this.order.length < n) {
      const m = grow(this.order.length, n);
      this.deg = new Int32Array(m + 1);
      this.fill = new Int32Array(m);
      this.order = new Int32Array(m);
      this.parentBond = new Int32Array(m);
      this.visited = new Uint8Array(m);
      this.sub = new Float64Array(m);
    }
  }

  reserveAdj(k: number): void {
    if (this.adjNode.length < k) {
      const m = grow(this.adjNode.length, k);
      this.adjNode = new Int32Array(m);
      this.adjBond = new Int32Array(m);
    }
  }
}

function grow(cur: number, need: number): number {
  let m = Math.max(cur, 16);
  while (m < need) m *= 2;
  return m;
}

// ---------------------------------------------------------------------------------- joints

/** One hinge/slider bond of a joint group, reduced to the islands it connects. */
export interface JointBondView {
  alive: boolean;
  /** Key of the island holding the moving part (bond.a). */
  moving: number;
  /** Key of the island holding the fixed part, or -1 for the world anchor. */
  fixed: number;
  /** Bond anchor (hinge pin / runner) in the shared assembly frame. */
  anchor: Vec3;
}

export interface JointConstraintPlan {
  moving: number;
  fixed: number;
  kind: "hinge" | "ball" | "slider";
  /** Constraint pivot in the assembly frame. */
  pivot: Vec3;
  /** Indices (into the input array) of the bonds forming this constraint. */
  bonds: number[];
}

/**
 * Joint-group rules (docs/ARCHITECTURE.md §4.4): bonds of one group between the same two
 * islands form one constraint. Hinges: ≥ 2 intact → hinge along the axis through the pivots
 * (pivot = mean of the anchors); 1 intact → ball-and-socket at that hinge (the door hangs and
 * sags); 0 → free. Sliders: ≥ 1 intact runner → slider. Bonds whose two sides ended up in the
 * same island need no constraint. Output order is deterministic (first-bond order).
 */
export function planJointConstraints(kind: "hinge" | "slider", bonds: readonly JointBondView[]): JointConstraintPlan[] {
  const pairs: Array<{ moving: number; fixed: number; idx: number[] }> = [];
  for (let i = 0; i < bonds.length; i++) {
    const b = bonds[i];
    if (!b.alive || b.moving === b.fixed) continue;
    let pr = pairs.find((p) => p.moving === b.moving && p.fixed === b.fixed);
    if (!pr) {
      pr = { moving: b.moving, fixed: b.fixed, idx: [] };
      pairs.push(pr);
    }
    pr.idx.push(i);
  }
  const out: JointConstraintPlan[] = [];
  for (const pr of pairs) {
    const n = pr.idx.length;
    let x = 0,
      y = 0,
      z = 0;
    for (const i of pr.idx) {
      x += bonds[i].anchor.x;
      y += bonds[i].anchor.y;
      z += bonds[i].anchor.z;
    }
    const pivot = { x: x / n, y: y / n, z: z / n };
    if (kind === "slider") out.push({ moving: pr.moving, fixed: pr.fixed, kind: "slider", pivot, bonds: pr.idx });
    else if (n >= 2) out.push({ moving: pr.moving, fixed: pr.fixed, kind: "hinge", pivot, bonds: pr.idx });
    else {
      const a = bonds[pr.idx[0]].anchor;
      out.push({ moving: pr.moving, fixed: pr.fixed, kind: "ball", pivot: { x: a.x, y: a.y, z: a.z }, bonds: pr.idx });
    }
  }
  return out;
}

// --------------------------------------------------------------------- fracture bond transfer

export interface TransferCell {
  role: "remain" | "loose" | "micro";
  centroid: Vec3;
}

/**
 * Resolve where each bond of a fractured part goes. `transfer` comes from the fracture plan
 * (bond id → cell index or -1). Bonds missing from the plan go to the nearest non-micro cell
 * to their anchor (remain cells preferred) — defensive, the damage model normally lists them
 * all. A transfer to a micro cell (or an invalid index) breaks the bond.
 * Returns the cell index per input bond (-1 = broken).
 */
export function resolveBondTransfers(
  bonds: ReadonlyArray<{ id: number; anchor: Vec3 }>,
  transfer: ReadonlyArray<{ bondId: number; cell: number }>,
  cells: readonly TransferCell[],
): number[] {
  const map = new Map<number, number>();
  for (const t of transfer) map.set(t.bondId, t.cell);
  const out: number[] = [];
  for (const b of bonds) {
    let c = map.has(b.id) ? map.get(b.id)! : nearestCell(b.anchor, cells);
    if (c < 0 || c >= cells.length || cells[c].role === "micro") c = -1;
    out.push(c);
  }
  return out;
}

function nearestCell(p: Vec3, cells: readonly TransferCell[]): number {
  let best = -1;
  let bestD = Infinity;
  let bestRemain = false;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.role === "micro") continue;
    const dx = c.centroid.x - p.x,
      dy = c.centroid.y - p.y,
      dz = c.centroid.z - p.z;
    const d = dx * dx + dy * dy + dz * dz;
    const remain = c.role === "remain";
    if ((remain && !bestRemain) || (remain === bestRemain && d < bestD)) {
      best = i;
      bestD = d;
      bestRemain = remain;
    }
  }
  return best;
}
