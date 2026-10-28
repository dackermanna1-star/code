// 2D constrained triangulation of a convex polygon whose boundary may carry collinear
// ("flat") points, plus optional interior points. Used by meshgen to tessellate faces so that
// adjacent faces share exactly the same boundary points (watertight). PURE.
//
// Algorithm: fan over the strictly convex corners (never degenerate) → insert flat boundary
// points by splitting the boundary edge they lie on → insert interior points (triangle or edge
// split, located by walking) → Lawson flips to the constrained Delaunay triangulation
// (boundary edges are never flipped, so the boundary stays exactly as given).
// Output triangles are CCW in the input 2D frame.

const NONE = -1;

export class ConvexTriangulator {
  private tv = new Int32Array(96); // 3 vertex ids per triangle
  private tn = new Int32Array(96); // 3 neighbours per triangle (edge k = v_k → v_k+1)
  private nt = 0;
  private bEdge = new Int32Array(32); // boundary vertex → triangle holding the boundary edge starting there
  private xs: Float64Array = new Float64Array(0);
  private ys: Float64Array = new Float64Array(0);
  private stack: number[] = [];
  private eps2 = 0; // orientation tolerance (length² units)
  private eps4 = 0; // in-circle tolerance (length⁴ units)
  private last = 0;

  /**
   * Triangulate. Points 0..nb-1 are the boundary in CCW order, nb..n-1 interior points.
   * Returns the number of triangles; read them with `tri(i)` / `indices()`.
   */
  run(xs: Float64Array, ys: Float64Array, nb: number, n: number, scale: number): number {
    this.xs = xs;
    this.ys = ys;
    this.nt = 0;
    const L = Math.max(scale, 1e-12);
    this.eps2 = 1e-12 * L * L;
    this.eps4 = 1e-10 * L * L * L * L;
    const maxT = 2 * n + 8;
    if (this.tv.length < 3 * maxT) {
      this.tv = new Int32Array(3 * maxT * 2);
      this.tn = new Int32Array(3 * maxT * 2);
    }
    if (this.bEdge.length < n) this.bEdge = new Int32Array(n * 2);
    // corners = strictly convex boundary points
    const corners: number[] = [];
    for (let k = 0; k < nb; k++) {
      const p = k === 0 ? nb - 1 : k - 1,
        q = k + 1 === nb ? 0 : k + 1;
      if (this.orient(p, k, q) > this.eps2) corners.push(k);
    }
    if (corners.length < 3) return 0;
    // fan from the first corner over the corner polygon
    const c0 = corners[0];
    const m = corners.length;
    for (let i = 1; i + 1 < m; i++) this.addTri(c0, corners[i], corners[i + 1]);
    // adjacency of the fan
    for (let t = 0; t < this.nt; t++) {
      this.tn[3 * t] = NONE; // (c0 → c_i): boundary only for the first triangle, fixed below
      this.tn[3 * t + 1] = NONE; // (c_i → c_i+1): boundary
      this.tn[3 * t + 2] = NONE; // (c_i+1 → c0): shared with the next triangle except the last
    }
    for (let t = 0; t + 1 < this.nt; t++) {
      this.tn[3 * t + 2] = t + 1;
      this.tn[3 * (t + 1)] = t;
    }
    for (let k = 0; k < n; k++) this.bEdge[k] = NONE;
    // boundary edges of the fan, keyed by start corner
    this.bEdge[c0] = 0;
    for (let t = 0; t < this.nt; t++) this.bEdge[corners[t + 1]] = t;
    this.bEdge[corners[m - 1]] = this.nt - 1;
    // insert flat boundary points edge by edge (walking CCW from each corner)
    for (let ci = 0; ci < m; ci++) {
      const a = corners[ci];
      const b = corners[(ci + 1) % m];
      let prev = a;
      for (let k = a + 1 === nb ? 0 : a + 1; k !== b; k = k + 1 === nb ? 0 : k + 1) {
        this.splitBoundary(prev, k);
        prev = k;
      }
    }
    this.legalizeAll();
    // interior points
    this.last = 0;
    for (let p = nb; p < n; p++) this.insertInterior(p);
    this.legalizeAll();
    return this.nt;
  }

  /** Copy triangles (CCW) as index triples, offset by `base`, into `out`. */
  emit(out: number[], map?: ArrayLike<number>): void {
    for (let t = 0; t < this.nt; t++) {
      const a = this.tv[3 * t],
        b = this.tv[3 * t + 1],
        c = this.tv[3 * t + 2];
      if (map) out.push(map[a], map[b], map[c]);
      else out.push(a, b, c);
    }
  }

  get count(): number {
    return this.nt;
  }

  triVerts(t: number): [number, number, number] {
    return [this.tv[3 * t], this.tv[3 * t + 1], this.tv[3 * t + 2]];
  }

  // ------------------------------------------------------------------ primitives
  private orient(a: number, b: number, c: number): number {
    const xs = this.xs,
      ys = this.ys;
    return (xs[b] - xs[a]) * (ys[c] - ys[a]) - (ys[b] - ys[a]) * (xs[c] - xs[a]);
  }

  private inCircle(a: number, b: number, c: number, d: number): number {
    const xs = this.xs,
      ys = this.ys;
    const adx = xs[a] - xs[d],
      ady = ys[a] - ys[d];
    const bdx = xs[b] - xs[d],
      bdy = ys[b] - ys[d];
    const cdx = xs[c] - xs[d],
      cdy = ys[c] - ys[d];
    return (
      (adx * adx + ady * ady) * (bdx * cdy - bdy * cdx) +
      (bdx * bdx + bdy * bdy) * (cdx * ady - cdy * adx) +
      (cdx * cdx + cdy * cdy) * (adx * bdy - ady * bdx)
    );
  }

  private addTri(a: number, b: number, c: number): number {
    const t = this.nt++;
    this.tv[3 * t] = a;
    this.tv[3 * t + 1] = b;
    this.tv[3 * t + 2] = c;
    this.tn[3 * t] = this.tn[3 * t + 1] = this.tn[3 * t + 2] = NONE;
    return t;
  }

  /** Index (0..2) of the edge of t that starts at vertex a. */
  private edgeFrom(t: number, a: number): number {
    if (this.tv[3 * t] === a) return 0;
    if (this.tv[3 * t + 1] === a) return 1;
    return 2;
  }

  /** In neighbour u, replace the back-pointer to `oldT` by `newT`. */
  private relink(u: number, oldT: number, newT: number): void {
    if (u === NONE) return;
    for (let k = 0; k < 3; k++) if (this.tn[3 * u + k] === oldT) this.tn[3 * u + k] = newT;
  }

  /** Split boundary edge (a → next) at flat point f lying on it. */
  private splitBoundary(a: number, f: number): void {
    const t = this.bEdge[a];
    if (t === NONE) return;
    const k = this.edgeFrom(t, a);
    const b = this.tv[3 * t + ((k + 1) % 3)];
    const c = this.tv[3 * t + ((k + 2) % 3)];
    const nBC = this.tn[3 * t + ((k + 1) % 3)];
    const nCA = this.tn[3 * t + ((k + 2) % 3)];
    // t becomes (a, f, c); new u = (f, b, c)
    this.tv[3 * t] = a;
    this.tv[3 * t + 1] = f;
    this.tv[3 * t + 2] = c;
    const u = this.addTri(f, b, c);
    this.tn[3 * t] = NONE;
    this.tn[3 * t + 1] = u;
    this.tn[3 * t + 2] = nCA;
    this.tn[3 * u] = NONE;
    this.tn[3 * u + 1] = nBC;
    this.tn[3 * u + 2] = t;
    this.relink(nBC, t, u);
    this.bEdge[a] = t;
    this.bEdge[f] = u;
    if (nBC === NONE) this.bEdge[b] = u;
  }

  /** Locate the triangle containing p (walk from the last triangle, brute force fallback). */
  private locate(p: number): number {
    let t = this.last < this.nt ? this.last : 0;
    for (let steps = 0; steps < 4 * this.nt + 16; steps++) {
      let moved = false;
      for (let k = 0; k < 3; k++) {
        const a = this.tv[3 * t + k],
          b = this.tv[3 * t + ((k + 1) % 3)];
        if (this.orient(a, b, p) < -this.eps2) {
          const u = this.tn[3 * t + k];
          if (u === NONE) return t; // outside (numerically): clamp to this boundary triangle
          t = u;
          moved = true;
          break;
        }
      }
      if (!moved) return t;
    }
    for (let u = 0; u < this.nt; u++) {
      const a = this.tv[3 * u],
        b = this.tv[3 * u + 1],
        c = this.tv[3 * u + 2];
      if (this.orient(a, b, p) >= -this.eps2 && this.orient(b, c, p) >= -this.eps2 && this.orient(c, a, p) >= -this.eps2) return u;
    }
    return t;
  }

  private insertInterior(p: number): void {
    const t = this.locate(p);
    const a = this.tv[3 * t],
      b = this.tv[3 * t + 1],
      c = this.tv[3 * t + 2];
    const o = [this.orient(a, b, p), this.orient(b, c, p), this.orient(c, a, p)];
    if (o[0] < -this.eps2 || o[1] < -this.eps2 || o[2] < -this.eps2) return; // numerically outside: skip
    // on an edge?
    let onEdge = -1;
    for (let k = 0; k < 3; k++) if (Math.abs(o[k]) <= this.eps2) onEdge = k;
    if (onEdge >= 0) {
      const u = this.tn[3 * t + onEdge];
      if (u === NONE) return; // on the boundary: never insert there (keeps the boundary exact)
      this.splitEdge(t, onEdge, p);
    } else {
      this.splitTri(t, p);
    }
  }

  /** Split triangle t = (a,b,c) by interior point p into (a,b,p), (b,c,p), (c,a,p). */
  private splitTri(t: number, p: number): void {
    const a = this.tv[3 * t],
      b = this.tv[3 * t + 1],
      c = this.tv[3 * t + 2];
    const nAB = this.tn[3 * t],
      nBC = this.tn[3 * t + 1],
      nCA = this.tn[3 * t + 2];
    this.tv[3 * t + 2] = p; // t = (a, b, p)
    const t1 = this.addTri(b, c, p);
    const t2 = this.addTri(c, a, p);
    this.tn[3 * t] = nAB;
    this.tn[3 * t + 1] = t1;
    this.tn[3 * t + 2] = t2;
    this.tn[3 * t1] = nBC;
    this.tn[3 * t1 + 1] = t2;
    this.tn[3 * t1 + 2] = t;
    this.tn[3 * t2] = nCA;
    this.tn[3 * t2 + 1] = t;
    this.tn[3 * t2 + 2] = t1;
    this.relink(nBC, t, t1);
    this.relink(nCA, t, t2);
    if (nBC === NONE) this.bEdge[b] = t1;
    if (nCA === NONE) this.bEdge[c] = t2;
    if (nAB === NONE) this.bEdge[a] = t;
    this.last = t;
    this.stack.push(t, 0, t1, 0, t2, 0);
    this.legalize();
  }

  /** Split the interior edge k of t (shared with u) at point p: 2 triangles → 4. */
  private splitEdge(t: number, k: number, p: number): void {
    const a = this.tv[3 * t + k],
      b = this.tv[3 * t + ((k + 1) % 3)],
      c = this.tv[3 * t + ((k + 2) % 3)];
    const u = this.tn[3 * t + k];
    const j = this.edgeFrom(u, b); // u = (b, a, d)
    const d = this.tv[3 * u + ((j + 2) % 3)];
    const nBC = this.tn[3 * t + ((k + 1) % 3)],
      nCA = this.tn[3 * t + ((k + 2) % 3)];
    const nAD = this.tn[3 * u + ((j + 1) % 3)],
      nDB = this.tn[3 * u + ((j + 2) % 3)];
    // t = (a, p, c), t1 = (p, b, c), u = (b, p, d), u1 = (p, a, d)
    this.tv[3 * t] = a;
    this.tv[3 * t + 1] = p;
    this.tv[3 * t + 2] = c;
    this.tv[3 * u] = b;
    this.tv[3 * u + 1] = p;
    this.tv[3 * u + 2] = d;
    const t1 = this.addTri(p, b, c);
    const u1 = this.addTri(p, a, d);
    this.tn[3 * t] = u1;
    this.tn[3 * t + 1] = t1;
    this.tn[3 * t + 2] = nCA;
    this.tn[3 * t1] = u;
    this.tn[3 * t1 + 1] = nBC;
    this.tn[3 * t1 + 2] = t;
    this.tn[3 * u] = t1;
    this.tn[3 * u + 1] = u1;
    this.tn[3 * u + 2] = nDB;
    this.tn[3 * u1] = t;
    this.tn[3 * u1 + 1] = nAD;
    this.tn[3 * u1 + 2] = u;
    this.relink(nBC, t, t1);
    this.relink(nAD, u, u1);
    if (nBC === NONE) this.bEdge[b] = t1;
    if (nCA === NONE) this.bEdge[c] = t;
    if (nAD === NONE) this.bEdge[a] = u1;
    if (nDB === NONE) this.bEdge[d] = u;
    this.last = t;
    // edges opposite p: (c→a) in t is edge 2; (b→c) in t1 is edge 1; (d→b) in u is edge 2; (a→d) in u1 is edge 1
    this.stack.push(t, 2, t1, 1, u, 2, u1, 1);
    this.legalize();
  }

  /** Flip-test the edge k of t; push follow-up edges. Uses this.stack as (t, k) pairs. */
  private legalize(): void {
    let guard = 0;
    const limit = 64 * this.nt + 256;
    while (this.stack.length && guard++ < limit) {
      const k = this.stack.pop()!;
      const t = this.stack.pop()!;
      this.tryFlip(t, k, true);
    }
    this.stack.length = 0;
  }

  private legalizeAll(): void {
    for (let t = 0; t < this.nt; t++) for (let k = 0; k < 3; k++) if (this.tn[3 * t + k] !== NONE) this.stack.push(t, k);
    let guard = 0;
    const limit = 64 * this.nt + 256;
    while (this.stack.length && guard++ < limit) {
      const k = this.stack.pop()!;
      const t = this.stack.pop()!;
      this.tryFlip(t, k, false);
    }
    this.stack.length = 0;
  }

  /**
   * Edge k of t = (a → b), opposite vertex c; neighbour u = (b, a, d). Flip to (c, a, d) +
   * (c, d, b) when d is strictly inside the circumcircle of (a, b, c) and the quad is convex.
   */
  private tryFlip(t: number, k: number, fromInsert: boolean): void {
    const u = this.tn[3 * t + k];
    if (u === NONE) return;
    const a = this.tv[3 * t + k],
      b = this.tv[3 * t + ((k + 1) % 3)],
      c = this.tv[3 * t + ((k + 2) % 3)];
    const j = this.edgeFrom(u, b);
    if (this.tv[3 * u + j] !== b || this.tv[3 * u + ((j + 1) % 3)] !== a) return; // stale stack entry
    const d = this.tv[3 * u + ((j + 2) % 3)];
    if (this.inCircle(a, b, c, d) <= this.eps4) return;
    if (this.orient(c, a, d) <= this.eps2 || this.orient(c, d, b) <= this.eps2) return;
    const nBC = this.tn[3 * t + ((k + 1) % 3)],
      nCA = this.tn[3 * t + ((k + 2) % 3)];
    const nAD = this.tn[3 * u + ((j + 1) % 3)],
      nDB = this.tn[3 * u + ((j + 2) % 3)];
    // t = (c, a, d), u = (c, d, b)
    this.tv[3 * t] = c;
    this.tv[3 * t + 1] = a;
    this.tv[3 * t + 2] = d;
    this.tv[3 * u] = c;
    this.tv[3 * u + 1] = d;
    this.tv[3 * u + 2] = b;
    this.tn[3 * t] = nCA;
    this.tn[3 * t + 1] = nAD;
    this.tn[3 * t + 2] = u;
    this.tn[3 * u] = t;
    this.tn[3 * u + 1] = nDB;
    this.tn[3 * u + 2] = nBC;
    this.relink(nAD, u, t);
    this.relink(nBC, t, u);
    if (nAD === NONE) this.bEdge[a] = t;
    if (nBC === NONE) this.bEdge[b] = u;
    if (nCA === NONE) this.bEdge[c] = t;
    if (nDB === NONE) this.bEdge[d] = u;
    if (fromInsert) {
      // c is the inserted point: new edges opposite c are (a→d) in t and (d→b) in u
      this.stack.push(t, 1, u, 1);
    } else {
      this.stack.push(t, 0, t, 1, u, 1, u, 2);
    }
  }
}
