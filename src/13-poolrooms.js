// Level 37, the Poolrooms: warm-white tile on every surface, shallow turquoise pools set into the
// floor, rounded arches and tiled pillars, soft daylight from square skylights. The layout is a
// maze of arched galleries opening into halls that hold a pool, an arcade of pillars or a flooded
// floor (BackroomsLevel methods, added below). The dressing (PoolDressing) builds every tiled
// surface itself from boxes, rounded prisms and arch panels, coloured per vertex and merged by
// material into one mesh per 4 x 4-cell chunk, like the warehouse.
// Water never changes the walkable floor: its surface lies a few centimetres above the floor at
// y = 0, held in by low tiled kerbs that are one easy step for the player and under the height
// the navigation counts as an obstacle, so everybody wades through it.

const POOL = {
  water: 0.1,    // water surface (wading depth over the floor)
  kerb: 0.17,    // coping round the pools and thresholds of flooded rooms
  kerbW: 0.34,
  spring: 2.5,   // spring line of every arch
  res: 0.125,    // water mask resolution (m)
  sky: 0.75,     // half size of a skylight opening
  well: 0.8,     // depth of a skylight well
};

// tiled furniture is tile over block (stops rounds like the walls); loungers are plastic
Object.assign(PROP_DEFS, {
  tbench: { w: 1.8, d: 0.5, h: 0.46, material: 'tile', wall: true },
  halfwall: { w: 2.4, d: 0.32, h: 1.18, material: 'tile', wall: false },
  // a free-standing tiled shower wall, shower heads on both faces
  showers: { w: 2.2, d: 0.26, h: 1.95, material: 'tile', wall: false },
  // a pair of chrome grab rails arching over the coping (local +z into the pool): the feet of
  // each rail and its top; between them the rails are open
  ladder: { w: 0.6, d: 0.8, h: 1.08, material: 'metal', wall: false,
    boxes: [[0.05, 0.05, 0.85, -0.27, -0.36, 0], [0.05, 0.05, 0.85, -0.27, 0.36, 0], [0.05, 0.05, 0.85, 0.27, -0.36, 0], [0.05, 0.05, 0.85, 0.27, 0.36, 0],
      [0.05, 0.77, 0.23, -0.27, 0, 0.85], [0.05, 0.77, 0.23, 0.27, 0, 0.85]] },
  // stepped seating against a wall, highest at the back (local -z)
  tiers: { w: 2.8, d: 1.2, h: 1.05, material: 'tile', wall: true,
    boxes: [[2.8, 1.2, 0.35, 0, 0, 0], [2.8, 0.8, 0.35, 0, -0.2, 0.35], [2.8, 0.4, 0.35, 0, -0.4, 0.7]] },
  // pool lounger: the bed, and the raised backrest at the head end (local -z)
  lounger: { w: 0.7, d: 1.95, h: 0.8, material: 'plastic', wall: false,
    boxes: [[0.7, 1.95, 0.38, 0, 0, 0], [0.66, 0.5, 0.42, 0, -0.7, 0.38]] },
  // lifeguard chair: four legs, the seat and its back (the frame between them is open)
  lifeguard: { w: 0.9, d: 0.9, h: 2.05, material: 'metal', wall: false,
    boxes: [[0.07, 0.07, 1.45, -0.4, -0.4, 0], [0.07, 0.07, 1.45, 0.4, -0.4, 0], [0.07, 0.07, 1.45, -0.4, 0.4, 0], [0.07, 0.07, 1.45, 0.4, 0.4, 0],
      [0.86, 0.66, 0.1, 0, 0.02, 1.45, 'plastic'], [0.86, 0.08, 0.5, 0, -0.38, 1.55, 'plastic']] },
});
THEME_PROPS.poolrooms = ['tbench', 'halfwall', 'showers', 'tiers', 'lounger', 'lifeguard', 'ladder']; // placed by placePoolProps

// ---- layout --------------------------------------------------------------------------------------
// A perfect maze keeps every cell connected; rectangular halls are cleared out of it (the first
// one round the arrival cell), maze passages often become arched doorways, and a few extra arches
// braid the galleries into loops. Grid corners with no wall get a tiled pillar (always inside
// arcade halls), so most openings have something for an arch to spring from.
BackroomsLevel.prototype.generatePoolrooms = function () {
  const n = this.n, R = this.rng, th = this.theme, mid = (n / 2) | 0;
  const V = (this.v = new Uint8Array((n + 1) * n).fill(1));
  const Hz = (this.h = new Uint8Array(n * (n + 1)).fill(1));
  const seen = new Uint8Array(n * n), stack = [mid * n + mid];
  seen[stack[0]] = 1;
  while (stack.length) {
    const c = stack[stack.length - 1], i = c % n, j = (c / n) | 0;
    const opts = [];
    if (i > 0 && !seen[c - 1]) opts.push([c - 1, V, this.vIdx(i, j)]);
    if (i < n - 1 && !seen[c + 1]) opts.push([c + 1, V, this.vIdx(i + 1, j)]);
    if (j > 0 && !seen[c - n]) opts.push([c - n, Hz, this.hIdx(i, j)]);
    if (j < n - 1 && !seen[c + n]) opts.push([c + n, Hz, this.hIdx(i, j + 1)]);
    if (!opts.length) { stack.pop(); continue; }
    const [nc, arr, k] = opts[Math.floor(R() * opts.length)];
    arr[k] = 0;
    seen[nc] = 1;
    stack.push(nc);
  }
  // halls
  const hallOf = (this.hallOf = new Int16Array(n * n).fill(-1));
  const halls = (this.halls = []);
  const fits = (i0, j0, w, d) => {
    if (i0 < 0 || j0 < 0 || i0 + w > n || j0 + d > n) return false;
    for (let j = j0; j < j0 + d; j++) for (let i = i0; i < i0 + w; i++) if (hallOf[j * n + i] >= 0) return false;
    return true;
  };
  const addHall = (i0, j0, w, d, type) => {
    const k = halls.length;
    halls.push({ i0, j0, w, d, type, k });
    for (let j = j0; j < j0 + d; j++)
      for (let i = i0; i < i0 + w; i++) {
        hallOf[j * n + i] = k;
        if (i > i0) V[this.vIdx(i, j)] = 0;
        if (j > j0) Hz[this.hIdx(i, j)] = 0;
      }
  };
  addHall(mid - 1, mid - 1, 3, 3, R() < 0.7 ? 'pool' : 'flooded');
  for (let tries = 0, k = 0; k < th.rooms + this.loop && tries < 400; tries++) {
    const w = th.roomMin + Math.floor(R() * (th.roomMax - th.roomMin + 1));
    const d = th.roomMin + Math.floor(R() * (th.roomMax - th.roomMin + 1));
    const i0 = Math.floor(R() * (n - w + 1)), j0 = Math.floor(R() * (n - d + 1));
    if (!fits(i0, j0, w, d)) continue;
    const r = R(), big = w * d >= 9;
    addHall(i0, j0, w, d, r < (big ? 0.55 : 0.42) ? 'pool' : r < 0.8 ? 'arcade' : 'flooded');
    k++;
  }
  // galleries: maze passages often pass under an arch; extra arches braid loops for flanking
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++)
      for (const d of [0, 2]) {
        const ni = i + (d === 0 ? 1 : 0), nj = j + (d === 2 ? 1 : 0);
        if (ni >= n || nj >= n) continue;
        const a = j * n + i, b = nj * n + ni;
        if (hallOf[a] >= 0 && hallOf[a] === hallOf[b]) continue; // inside a hall: open floor
        const arr = d === 0 ? V : Hz, k = d === 0 ? this.vIdx(i + 1, j) : this.hIdx(i, j + 1);
        const r = R();
        if (arr[k] === 0) { if (r < 0.5) arr[k] = 2; }
        else if (r < th.braid) arr[k] = r < th.braid * 0.2 ? 0 : 2;
      }
  // flooded floors: every cell of a flooded hall, and a few short runs of gallery
  const F = (this.flooded = new Uint8Array(n * n));
  for (const hl of halls) if (hl.type === 'flooded') for (let j = hl.j0; j < hl.j0 + hl.d; j++) for (let i = hl.i0; i < hl.i0 + hl.w; i++) F[j * n + i] = 1;
  for (let k = 0; k < 2 + this.loop; k++) {
    let s = -1;
    for (let tr = 0; tr < 40 && s < 0; tr++) { const c = Math.floor(R() * n * n); if (hallOf[c] < 0 && !F[c]) s = c; }
    if (s < 0) break;
    const want = 2 + Math.floor(R() * 4), q = [s];
    F[s] = 1;
    for (let hh = 0; hh < q.length && q.length < want; hh++) {
      const c = q[hh], i = c % n, j = (c / n) | 0;
      for (let d = 0; d < 4 && q.length < want; d++) {
        if (!this.wallOpen(i, j, d)) continue;
        const nc = d === 0 ? c + 1 : d === 1 ? c - 1 : d === 2 ? c + n : c - n;
        if (hallOf[nc] >= 0 || F[nc]) continue;
        F[nc] = 1;
        q.push(nc);
      }
    }
  }
  // pillars on wall-less grid corners
  this.rooms = halls;
  this.pillarSpots = [];
  for (let j = 1; j < n; j++)
    for (let i = 1; i < n; i++) {
      if (V[this.vIdx(i, j - 1)] || V[this.vIdx(i, j)] || Hz[this.hIdx(i - 1, j)] || Hz[this.hIdx(i, j)]) continue;
      const hk = hallOf[(j - 1) * n + i - 1];
      const same = hk >= 0 && hallOf[(j - 1) * n + i] === hk && hallOf[j * n + i - 1] === hk && hallOf[j * n + i] === hk;
      const p = same ? { pool: 0.8, arcade: 1, flooded: 0.6 }[halls[hk].type] : 0.85;
      if (R() < p) this.pillarSpots.push([i, j]);
    }
  this.arches = [];
};

// colliders for an arch over an opening from u0 to u1 along a grid line (at x = c when the
// opening runs along z): a semicircle springing at POOL.spring, stepped in three bands, and the
// wall above its crown up to the ceiling. The dressing draws the curve from this.arches.
BackroomsLevel.prototype.archBoxes = function (alongX, c, u0, u1, depth, door) {
  const H = this.ceiling, a = (u1 - u0) / 2, m = (u0 + u1) / 2, y0 = POOL.spring, crown = y0 + a;
  this.arches.push({ alongX, c, u0, u1, depth, door });
  const box = (ua, ub, ya, yb) => {
    if (ub - ua < 0.04 || yb - ya < 0.01) return;
    const b = alongX ? Lab.boxDef((ua + ub) / 2, (ya + yb) / 2, c, ub - ua, yb - ya, depth, 'lintel', 'tile') : Lab.boxDef(c, (ya + yb) / 2, (ua + ub) / 2, depth, yb - ya, ub - ua, 'lintel', 'tile');
    this.boxes.push(b);
    this.wallBoxes.push(b);
  };
  for (let k = 0; k < 3; k++) {
    const ya = y0 + (a * k) / 3, yb = y0 + (a * (k + 1)) / 3, ym = (ya + yb) / 2;
    const hw = Math.sqrt(Math.max(0, a * a - (ym - y0) * (ym - y0)));
    box(u0, m - hw, ya, yb);
    box(m + hw, u1, ya, yb);
  }
  box(u0, u1, crown, H);
};

// ---- water, kerbs, open arches and furniture (after the walls' colliders exist) -----------------
BackroomsLevel.prototype.placePoolProps = function () {
  const n = this.n, C = this.cell, t = this.wallT, half = this.half, R = this.rng, mid = (n / 2) | 0;
  const K = POOL.kerb, KW = POOL.kerbW, Q = Math.PI / 2;
  this.props = [];
  this.water = []; // [x0, z0, x1, z1, isPool]
  this.kerbs = []; // [x0, z0, x1, z1, kind]
  const keep = (this.keep = []);
  const kerb = (x0, z0, x1, z1, kind) => {
    this.boxes.push(Lab.boxDef((x0 + x1) / 2, K / 2, (z0 + z1) / 2, x1 - x0, K, z1 - z0, 'prop', 'tile'));
    this.kerbs.push([x0, z0, x1, z1, kind]);
  };
  // pools: a walkway round the hall (wider on some sides, for loungers), then the coping
  for (const hl of this.halls) {
    if (hl.type !== 'pool') continue;
    const x0 = -half + hl.i0 * C + t / 2, x1 = -half + (hl.i0 + hl.w) * C - t / 2;
    const z0 = -half + hl.j0 * C + t / 2, z1 = -half + (hl.j0 + hl.d) * C - t / 2;
    const m = [0, 1, 2, 3].map(() => (R() < 0.4 ? 2.3 : 1.45));
    const px0 = x0 + m[0], px1 = x1 - m[1], pz0 = z0 + m[2], pz1 = z1 - m[3];
    if (px1 - px0 < 2.6 || pz1 - pz0 < 2.6) { hl.type = 'arcade'; continue; }
    hl.pool = [px0, pz0, px1, pz1];
    hl.inner = [x0, z0, x1, z1];
    hl.walk = m;
    kerb(px0, pz0, px1, pz0 + KW, 'pool');
    kerb(px0, pz1 - KW, px1, pz1, 'pool');
    kerb(px0, pz0 + KW, px0 + KW, pz1 - KW, 'pool');
    kerb(px1 - KW, pz0 + KW, px1, pz1 - KW, 'pool');
    this.water.push([px0 + KW, pz0 + KW, px1 - KW, pz1 - KW, 1]);
    // low tiled walls rising out of the bigger pools (cover among the pillars)
    const wx0 = px0 + KW + 1.0, wx1 = px1 - KW - 1.0, wz0 = pz0 + KW + 1.0, wz1 = pz1 - KW - 1.0;
    for (let k = 0; k < (hl.w * hl.d) / 4 && hl.k > 0 && wx1 - wx0 > 2.6 && wz1 - wz0 > 2.6; k++)
      for (let tr = 0; tr < 4; tr++) {
        if (this.addProp('halfwall', wx0 + 1.2 + R() * (wx1 - wx0 - 2.4), wz0 + 1.2 + R() * (wz1 - wz0 - 2.4), wx1 - wx0 > wz1 - wz0 ? 0 : Q, null, 0.7)) break;
      }
    // chrome grab rails over the coping, never in front of a doorway
    for (let k = 0, tr = 0; k < (R() < 0.5 ? 1 : 2) && tr < 8; tr++) {
      const s = Math.floor(R() * 4), alongX = s >= 2;
      const u = alongX ? px0 + 1.0 + R() * (px1 - px0 - 2.0) : pz0 + 1.0 + R() * (pz1 - pz0 - 2.0);
      const at = s === 0 ? px0 + KW / 2 : s === 1 ? px1 - KW / 2 : s === 2 ? pz0 + KW / 2 : pz1 - KW / 2;
      const x = alongX ? u : at, z = alongX ? at : u;
      if (this.doorways.some((d) => Math.hypot(d.x - x, d.z - z) < 2.7)) continue;
      if (this.addProp('ladder', x, z, s === 0 ? Q : s === 1 ? -Q : s === 2 ? 0 : Math.PI, null, 0.02)) k++;
    }
    keep.push([px0 - 0.15, pz0 - 0.15, px1 + 0.15, pz1 + 0.15]);
  }
  // flooded floors: water wall to wall, a threshold across every opening to dry floor
  const F = this.flooded;
  for (let c = 0; c < n * n; c++) {
    if (!F[c]) continue;
    const i = c % n, j = (c / n) | 0, cx = this.cx(i), cz = this.cx(j);
    this.water.push([cx - C / 2, cz - C / 2, cx + C / 2, cz + C / 2, 0]);
    for (let d = 0; d < 4; d++) {
      const val = this.edgeVal(i, j, d);
      if (val === 1 || val === 3) continue;
      const nc = d === 0 ? c + 1 : d === 1 ? c - 1 : d === 2 ? c + n : c - n;
      if (F[nc]) continue;
      const L = val === 2 ? this.doorWidth() : C + t, Wd = val === 2 ? t : KW;
      const ex = cx + (d === 0 ? C / 2 : d === 1 ? -C / 2 : 0), ez = cz + (d === 2 ? C / 2 : d === 3 ? -C / 2 : 0);
      if (d < 2) kerb(ex - Wd / 2, cz - L / 2, ex + Wd / 2, cz + L / 2, 'lip');
      else kerb(cx - L / 2, ez - Wd / 2, cx + L / 2, ez + Wd / 2, 'lip');
      keep.push(d < 2 ? [ex - 0.8, cz - L / 2, ex + 0.8, cz + L / 2] : [cx - L / 2, ez - 0.8, cx + L / 2, ez + 0.8]);
    }
  }
  this.buildWaterMask();
  // water inlets low in the walls of flooded rooms (the dressing pours water from them): the
  // tiled lip the water runs over is solid, and the floor in front of one is kept clear
  this.inlets = [];
  const spots = [];
  for (let c = 0; c < n * n; c++) if (F[c]) for (let d = 0; d < 4; d++) if (this.edgeVal(c % n, (c / n) | 0, d) === 1) spots.push([c, d]);
  for (let k = 0; k < 4 + this.loop && spots.length; k++) {
    const [c, d] = spots.splice(Math.floor(R() * spots.length), 1)[0], i = c % n, j = (c / n) | 0;
    if (this.inlets.some((q) => q.c === c)) continue;
    const nx = d === 0 ? -1 : d === 1 ? 1 : 0, nz = d === 2 ? -1 : d === 3 ? 1 : 0, along = (R() - 0.5) * 1.6;
    const x = d < 2 ? this.cx(i) - nx * (C / 2 - t / 2) : this.cx(i) + along, z = d >= 2 ? this.cx(j) - nz * (C / 2 - t / 2) : this.cx(j) + along;
    this.boxes.push(Lab.boxDef(x + nx * 0.06, 0.595, z + nz * 0.06, nx ? 0.12 : 0.46, 0.05, nz ? 0.12 : 0.46, 'prop', 'tile'));
    keep.push([Math.min(x, x + nx * 1.2) - (nx ? 0 : 0.7), Math.min(z, z + nz * 1.2) - (nz ? 0 : 0.7), Math.max(x, x + nx * 1.2) + (nx ? 0 : 0.7), Math.max(z, z + nz * 1.2) + (nz ? 0 : 0.7)]);
    this.inlets.push({ x, z, nx, nz, c, d });
  }
  // arches over the open edges that have something to spring from at both ends
  const pil = new Set(this.pillarSpots.map(([i, j]) => j * (n + 1) + i));
  const support = (i, j, skipV, skipK) => {
    if (pil.has(j * (n + 1) + i)) return this.theme.pillarR;
    const e = [];
    if (j >= 1) e.push([true, this.vIdx(i, j - 1)]);
    if (j <= n - 1) e.push([true, this.vIdx(i, j)]);
    if (i >= 1) e.push([false, this.hIdx(i - 1, j)]);
    if (i <= n - 1) e.push([false, this.hIdx(i, j)]);
    for (const [isV, k] of e) if (!(isV === skipV && k === skipK) && (isV ? this.v : this.h)[k] !== 0) return t / 2;
    return -1;
  };
  for (let i = 1; i < n; i++)
    for (let j = 0; j < n; j++) {
      const k = this.vIdx(i, j);
      if (this.v[k] !== 0) continue;
      const sA = support(i, j, true, k), sB = support(i, j + 1, true, k);
      if (sA < 0 || sB < 0) continue;
      this.archBoxes(false, -half + i * C, -half + j * C + sA, -half + (j + 1) * C - sB, sA === t / 2 && sB === t / 2 ? t : 0.4, false);
    }
  for (let j = 1; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = this.hIdx(i, j);
      if (this.h[k] !== 0) continue;
      const sA = support(i, j, false, k), sB = support(i + 1, j, false, k);
      if (sA < 0 || sB < 0) continue;
      this.archBoxes(true, -half + j * C, -half + i * C + sA, -half + (i + 1) * C - sB, sA === t / 2 && sB === t / 2 ? t : 0.4, false);
    }
  // floor kept clear of furniture: doorway approaches, open edges between rooms, the arrival hall
  const a = this.doorWidth() / 2 + 0.35, b = 1.7;
  for (const d of this.doorways) keep.push(d.axis === 'x' ? [d.x - b, d.z - a, d.x + b, d.z + a] : [d.x - a, d.z - b, d.x + a, d.z + b]);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++)
      for (const d of [0, 2]) {
        const c = j * n + i, nc = d === 0 ? c + 1 : c + n;
        if ((d === 0 && i === n - 1) || (d === 2 && j === n - 1)) continue;
        if (this.edgeVal(i, j, d) !== 0 || (this.hallOf[c] >= 0 && this.hallOf[c] === this.hallOf[nc])) continue;
        const ex = this.cx(i) + (d === 0 ? C / 2 : 0), ez = this.cx(j) + (d === 2 ? C / 2 : 0);
        keep.push(d === 0 ? [ex - 1.4, ez - C / 2 + 0.3, ex + 1.4, ez + C / 2 - 0.3] : [ex - C / 2 + 0.3, ez - 1.4, ex + C / 2 - 0.3, ez + 1.4]);
      }
  keep.push([this.cx(mid - 1) - C / 2, this.cx(mid - 1) - C / 2, this.cx(mid + 1) + C / 2, this.cx(mid + 1) + C / 2]);
  // furniture per hall type, sparse in the galleries
  const wallSpot = (i, j, d, kind, along) => {
    // a point against the wall on side d of cell (i, j), facing into the cell
    const off = C / 2 - t / 2 - PROP_DEFS[kind].d / 2 - 0.06;
    const cx = this.cx(i), cz = this.cx(j);
    const yaw = d === 0 ? -Q : d === 1 ? Q : d === 2 ? Math.PI : 0;
    const x = d === 0 ? cx + off : d === 1 ? cx - off : cx + along, z = d === 2 ? cz + off : d === 3 ? cz - off : cz + along;
    return [x, z, yaw];
  };
  const againstWall = (i, j, kind) => {
    const walls = [0, 1, 2, 3].filter((d) => this.edgeVal(i, j, d) === 1);
    if (!walls.length) return null;
    const d = walls[Math.floor(R() * walls.length)];
    const [x, z, yaw] = wallSpot(i, j, d, kind, (R() - 0.5) * (C - PROP_DEFS[kind].w - 0.8));
    return this.addProp(kind, x, z, yaw);
  };
  // free-standing cover somewhere in a cell: a few tries at different spots and headings, kept
  // a body's width (0.65 m) from everything else so no slit too narrow to pass is left
  const cover = (kind, cx, cz, spread) => {
    for (let k = 0; k < 5; k++) {
      const p = this.addProp(kind, cx + (R() - 0.5) * spread, cz + (R() - 0.5) * spread, R() < 0.5 ? 0 : Q, null, 0.65);
      if (p) return p;
    }
    return null;
  };
  for (const hl of this.halls) {
    if (hl.type === 'pool') this.poolDeck(hl);
    for (let j = hl.j0; j < hl.j0 + hl.d; j++)
      for (let i = hl.i0; i < hl.i0 + hl.w; i++) {
        const cx = this.cx(i), cz = this.cx(j), r = R();
        if (hl.type === 'arcade') {
          // low tiled walls and shower walls between the pillars (cover), seating on the walls
          if (r < 0.4) cover('halfwall', cx, cz, 1.6);
          else if (r < 0.62) cover('showers', cx, cz, 1.4);
          else if (r < 0.78) againstWall(i, j, 'tiers');
          else if (r < 0.86) againstWall(i, j, 'tbench');
          else if (r < 0.92) {
            for (let m = -1; m <= 1; m += 2) this.addProp('lounger', cx + m * 0.55, cz + (R() - 0.5) * 0.4, (R() < 0.5 ? 0 : Math.PI) + (R() - 0.5) * 0.12);
          }
        } else if (hl.type === 'flooded') {
          if (r < 0.3) cover('halfwall', cx, cz, 1.6);
          else if (r < 0.42) cover('showers', cx, cz, 1.4);
          else if (r < 0.5) againstWall(i, j, 'tbench');
        }
      }
  }
  for (let c = 0; c < n * n; c++) {
    if (this.hallOf[c] >= 0) continue;
    const r = R();
    if (r < 0.1) againstWall(c % n, (c / n) | 0, 'tbench');
    else if (r < 0.2) cover(R() < 0.6 ? 'halfwall' : 'showers', this.cx(c % n), this.cx((c / n) | 0), 1.0);
  }
};

// the deck round a pool: a lifeguard chair at the coping of a wide walkway, loungers end to end
// along the wall side of the wide walkways (sides: 0 -x, 1 +x, 2 -z, 3 +z)
BackroomsLevel.prototype.poolDeck = function (hl) {
  const R = this.rng, [px0, pz0, px1, pz1] = hl.pool, [x0, z0, x1, z1] = hl.inner, m = hl.walk, Q = Math.PI / 2;
  const sides = [0, 1, 2, 3].filter((s) => m[s] > 2);
  if (sides.length && R() < 0.65) {
    const s = sides[Math.floor(R() * sides.length)], alongX = s >= 2;
    const u = R() < 0.5 ? (alongX ? px0 : pz0) + 1.3 : (alongX ? px1 : pz1) - 1.3;
    const at = s === 0 ? px0 - 0.6 : s === 1 ? px1 + 0.6 : s === 2 ? pz0 - 0.6 : pz1 + 0.6;
    const yaw = s === 0 ? Q : s === 1 ? -Q : s === 2 ? 0 : Math.PI; // facing the water
    if (this.addProp('lifeguard', alongX ? u : at, alongX ? at : u, yaw, null, 0.02))
      this.keep.push(alongX ? [u - 1.4, at - 1.2, u + 1.4, at + 1.2] : [at - 1.2, u - 1.4, at + 1.2, u + 1.4]);
  }
  for (const s of sides) {
    if (R() < 0.25) continue;
    const alongX = s >= 2, a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1;
    const at = s === 0 ? x0 + 0.45 : s === 1 ? x1 - 0.45 : s === 2 ? z0 + 0.45 : z1 - 0.45;
    for (let u = a0 + 1.6; u < a1 - 1.6; u += 2.15) {
      if (R() < 0.3) continue;
      const yaw = (alongX ? Q : 0) + (R() < 0.5 ? Math.PI : 0) + (R() - 0.5) * 0.06;
      this.addProp('lounger', alongX ? u : at, alongX ? at : u, yaw, null, 0.05);
    }
  }
};

// water mask over the whole floor: r = water, g = pool bottom (aqua tiles), b = distance into a
// pool from its edge, a = closeness to water from the dry side (splashed floor). The level reads
// it for wading, the dressing's shaders sample it for caustics, tint and reflected light.
BackroomsLevel.prototype.buildWaterMask = function () {
  const res = POOL.res, N = Math.ceil(this.size / res), half = this.half;
  const m = new Uint8Array(N * N * 4), pool = new Float32Array(N * N).fill(0), dry = new Float32Array(N * N).fill(1e9);
  const into = new Float32Array(N * N).fill(0);
  for (const [x0, z0, x1, z1, isPool] of this.water) {
    const i0 = Math.max(0, Math.ceil((x0 + half) / res - 0.5)), i1 = Math.min(N - 1, Math.floor((x1 + half) / res - 0.5));
    const j0 = Math.max(0, Math.ceil((z0 + half) / res - 0.5)), j1 = Math.min(N - 1, Math.floor((z1 + half) / res - 0.5));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = j * N + i;
        m[k * 4] = 255;
        if (isPool) { m[k * 4 + 1] = 255; pool[k] = 1; }
        dry[k] = 0;
      }
  }
  // two-pass chamfer distances: into each pool from its edge, out from the water onto dry floor
  for (let k = 0; k < N * N; k++) into[k] = pool[k] ? 1e9 : 0;
  const pass = (d) => {
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        if (i > 0) d[k] = Math.min(d[k], d[k - 1] + 1);
        if (j > 0) d[k] = Math.min(d[k], d[k - N] + 1);
        if (i > 0 && j > 0) d[k] = Math.min(d[k], d[k - N - 1] + 1.414);
        if (i < N - 1 && j > 0) d[k] = Math.min(d[k], d[k - N + 1] + 1.414);
      }
    for (let j = N - 1; j >= 0; j--)
      for (let i = N - 1; i >= 0; i--) {
        const k = j * N + i;
        if (i < N - 1) d[k] = Math.min(d[k], d[k + 1] + 1);
        if (j < N - 1) d[k] = Math.min(d[k], d[k + N] + 1);
        if (i < N - 1 && j < N - 1) d[k] = Math.min(d[k], d[k + N + 1] + 1.414);
        if (i > 0 && j < N - 1) d[k] = Math.min(d[k], d[k + N - 1] + 1.414);
      }
  };
  pass(into);
  pass(dry);
  for (let k = 0; k < N * N; k++) {
    m[k * 4 + 2] = pool[k] ? Math.min(255, Math.round((into[k] * res) * 255)) : 0;
    m[k * 4 + 3] = m[k * 4] ? 0 : Math.max(0, Math.round(255 * (1 - (dry[k] * res) / 1.0)));
  }
  this.waterMask = { N, res, data: m };
};

// standing in water? (wading slows the player; splashes instead of dust)
BackroomsLevel.prototype.wetAt = function (x, z) {
  const W = this.waterMask;
  if (!W) return false;
  const i = Math.floor((x + this.half) / W.res), j = Math.floor((z + this.half) / W.res);
  return i >= 0 && j >= 0 && i < W.N && j < W.N && W.data[(j * W.N + i) * 4] > 127;
};

// ---- dressing ------------------------------------------------------------------------------------
const PRC = {
  white: 0xf5ecdc, cream: 0xeadfc8, aqua: 0x9fd9d3, teal: 0x2c8d93, deep: 0x1f6f78,
  chrome: 0xc4c9c8, plastic: 0xf3f0e8, paint: 0xebe7de, dark: 0x263234, buoy: 0xd8401f,
};
// the aTile attribute: tile pattern variant (integer part) + tile size in metres (fraction).
// 1 walls (room bands), 2 plain tiles, 3 ceiling tiles; 0 a plain glazed surface
const PRT = { wall: 1.15, tile: 2.15, small: 2.1, ceil: 3.3, none: 0 };

// shared by the tile and floor materials: noise, the water mask, caustics and glazed tiles
const POOL_GLSL = /* glsl */ `
uniform sampler2D uWater;   // water mask (see buildWaterMask)
uniform vec4 uWaterR;       // -half, 1 / size, water surface y, time
uniform float uDay;         // daylight level (blackouts)
uniform vec3 uAqua;
uniform vec3 uTeal;
float prH(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float prN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(prH(i), prH(i + vec2(1, 0)), f.x), mix(prH(i + vec2(0, 1)), prH(i + vec2(1, 1)), f.x), f.y); }
float prF(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * prN(p); p = p * 2.07 + 5.3; a *= 0.5; } return s; }
vec4 prWater(vec2 xz) { return texture2D(uWater, (xz - uWaterR.x) * uWaterR.y); }
// light focused by a rippling surface: a bright web where drifting cells meet (the edge distance
// of two layers of moving Worley noise), ~0.3 m across; it settles to its mean where it would shimmer
float prCell(vec2 p, float t) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 h = vec2(prH(i + g), prH(i + g + 19.19));
      float d = length(g + 0.5 + 0.38 * sin(t + 6.2831 * h) - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
  return d2 - d1;
}
float prCaustic(vec2 p, float t) {
  vec2 q = p * 3.2;
  float c = 1.15 * exp(-prCell(q, t * 1.6) * 8.0) + 0.65 * exp(-prCell(q * 1.37 + 3.1, t * 2.1 + 1.7) * 8.0);
  vec2 fw = fwidth(q);
  return mix(c, 0.36, smoothstep(0.3, 0.9, max(fw.x, fw.y)));
}
vec2 prTileN = vec2(0.0); // tilt of the tile under this fragment, in the face's plane
float prRough = 0.25;
float prGlow = 0.0;       // light thrown back off the water
// glazed square tiles of size s on face coordinates f (metres): uneven, a few cracked or missing
vec3 prTiles(vec2 f, float s, vec3 base, vec3 grout) {
  vec2 q = f / s, id = floor(q), g = fract(q) - 0.5, ag = abs(g);
  vec2 fw = fwidth(q);
  float w = max(fw.x, fw.y), far = smoothstep(0.12, 0.4, w);
  float h = prH(id + 0.5), h2 = prH(id + 7.31), h3 = prH(id + 3.17);
  float gw = 0.035, e = max(ag.x, ag.y);
  float gr = smoothstep(0.5 - gw - w * 0.75, 0.5 - gw + w * 0.75, e);
  vec3 col = base * (0.955 + 0.075 * h) * (1.0 + vec3(0.012, 0.0, -0.025) * (h2 - 0.5) * 2.0);
  float rough = 0.12 + 0.12 * h3;
  vec2 tilt = (vec2(h2, h3) - 0.5) * 0.045;
  if (h > 0.9972) {
    // a missing tile: the grey bed of adhesive, combed, in shadow under the rim
    col = vec3(0.72, 0.69, 0.62) * (0.8 + 0.3 * prN(f * 70.0)) * (0.9 + 0.1 * step(0.5, fract(dot(g, vec2(0.7, 0.7)) * 9.0)));
    col *= 0.8 + 0.2 * smoothstep(0.5 - gw, 0.36, e);
    rough = 0.95; tilt = vec2(0.0); gr *= 0.25;
  } else if (h > 0.988) {
    // a hairline crack across the glaze
    vec2 dir = normalize(vec2(h2 - 0.5, h3 - 0.5) + 0.001), o = (vec2(h3, h2) - 0.5) * 0.4;
    float d = abs(dot(g - o, vec2(-dir.y, dir.x)) + (prN(g * 7.0 + id) - 0.5) * 0.08);
    col *= 1.0 - 0.6 * smoothstep(0.015 + w * 0.5, 0.0, d) * (1.0 - far);
  }
  // the glaze rolls off towards the joints
  tilt += sign(g) * smoothstep(0.38, 0.5 - gw, ag) * 0.2;
  vec3 nearC = mix(col, grout, gr);
  vec3 farC = mix(base * 0.985, grout, gw * 2.4);
  prRough = mix(mix(rough, 0.8, gr), 0.28, far);
  prTileN = tilt * (1.0 - far) * (1.0 - gr);
  return mix(nearC, farC, far);
}
`;

const POOL_NORMAL_GLSL = /* glsl */ `
{
  vec3 Nw = normalize(vLatN);
  vec3 Ut = abs(Nw.y) > 0.5 ? vec3(1.0, 0.0, 0.0) : abs(Nw.x) > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 Vt = abs(Nw.y) > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  normal = normalize(normal + (viewMatrix * vec4(Ut * prTileN.x + Vt * prTileN.y, 0.0)).xyz);
}`;

// geometry helpers (indexed, like three's own, so everything merges)
function prGeo(pos, nrm, idx) {
  const g = new T3.BufferGeometry();
  g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T3.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}
// a rounded-square prism (bullnose corners) from y0 to y1, optionally capped
function prPrism(w, d, r, y0, y1, seg = 3, caps = false) {
  const pts = [], pos = [], nrm = [], idx = [];
  const ax = w / 2 - r, az = d / 2 - r;
  for (const [cx, cz, q] of [[ax, az, 0], [-ax, az, 1], [-ax, -az, 2], [ax, -az, 3]])
    for (let k = 0; k <= seg; k++) { const a = ((q + k / seg) * Math.PI) / 2; pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a), Math.cos(a), Math.sin(a)]); }
  for (const [x, z, nx, nz] of pts) { pos.push(x, y0, z, x, y1, z); nrm.push(nx, 0, nz, nx, 0, nz); }
  const N = pts.length;
  for (let k = 0; k < N; k++) { const a = k * 2, b = ((k + 1) % N) * 2; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  if (caps) {
    for (const [y, s] of [[y1, 1], [y0, -1]]) {
      const c = pos.length / 3;
      pos.push(0, y, 0); nrm.push(0, s, 0);
      for (const [x, z] of pts) { pos.push(x, y, z); nrm.push(0, s, 0); }
      for (let k = 0; k < N; k++) { const a = c + 1 + k, b = c + 1 + ((k + 1) % N); if (s > 0) idx.push(c, b, a); else idx.push(c, a, b); }
    }
  }
  return prGeo(pos, nrm, idx);
}
// the masonry over a semicircular opening of half-span a springing at y0, up to `top`, `depth`
// thick; local u along the span, w across it
function prArch(a, y0, top, depth, seg) {
  const pos = [], nrm = [], idx = [];
  for (const s of [-1, 1]) {
    const b = pos.length / 3;
    for (let k = 0; k <= seg; k++) {
      const t = Math.PI * (1 - k / seg), u = a * Math.cos(t), y = y0 + a * Math.sin(t);
      pos.push(u, y, (s * depth) / 2, u, top, (s * depth) / 2);
      nrm.push(0, 0, s, 0, 0, s);
    }
    for (let k = 0; k < seg; k++) { const p = b + k * 2; if (s > 0) idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); else idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
  }
  const b = pos.length / 3;
  for (let k = 0; k <= seg; k++) {
    const t = Math.PI * (1 - k / seg), cu = Math.cos(t), sy = Math.sin(t), u = a * cu, y = y0 + a * sy;
    pos.push(u, y, -depth / 2, u, y, depth / 2);
    nrm.push(-cu, -sy, 0, -cu, -sy, 0);
  }
  for (let k = 0; k < seg; k++) { const p = b + k * 2; idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
  return prGeo(pos, nrm, idx);
}
// a round tube from a to b ([x, y, z])
function prTube(a, b, r, seg = 8) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  WH_Q.setFromUnitVectors(WH_UP, WH_V1.set(dx / len, dy / len, dz / len));
  return new T3.CylinderGeometry(r, r, len, seg, 1, true).applyMatrix4(WH_M.compose(new T3.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), WH_Q, WH_ONE));
}
// a flat arch-topped pane facing +z: a rectangle from y0 to the spring ys, a semicircle above
function prPane(hw, y0, ys, seg = 12) {
  const pos = [], nrm = [], idx = [];
  const v = (x, y) => { pos.push(x, y, 0); nrm.push(0, 0, 1); return pos.length / 3 - 1; };
  const a = v(-hw, y0), b = v(hw, y0), c = v(hw, ys), d = v(-hw, ys);
  idx.push(a, b, c, a, c, d);
  const ctr = v(0, ys);
  let prev = v(hw, ys);
  for (let k = 1; k <= seg; k++) { const t = (k / seg) * Math.PI, p = v(hw * Math.cos(t), ys + hw * Math.sin(t)); idx.push(ctr, prev, p); prev = p; }
  return prGeo(pos, nrm, idx);
}

class PoolDressing {
  constructor(view) {
    this.view = view;
    const L = (this.level = view.level);
    this.rng = Lab.rng(((L.seed * 2654435761) ^ 0x9001) >>> 0);
    this.bins = new Map();
    this.colors = new Map();
    this.chunk = L.cell * 4;
    this.nChunk = Math.ceil(L.size / this.chunk);
    this.textures = [];
    this.time = 0;
    this.makeMaterials();
    this.replaceShell();
    this.buildPillars();
    this.buildArches();
    this.buildKerbs();
    this.buildCeiling();
    this.buildProps();
    this.buildWindows();
    this.buildInlets();
    this.buildDeck();
    this.flush();
    this.buildWater();
    this.buildSkylights();
    this.buildSigns();
  }

  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }

  // ---- materials ---------------------------------------------------------------------------------
  makeMaterials() {
    const v = this.view, L = this.level, th = L.theme, sh = v.shared, W = L.waterMask;
    const data = new Uint8Array(W.data);
    const tex = new T3.DataTexture(data, W.N, W.N, T3.RGBAFormat, T3.UnsignedByteType);
    tex.minFilter = tex.magFilter = T3.LinearFilter;
    tex.needsUpdate = true;
    this.textures.push(tex);
    this.u = {
      uWater: { value: tex },
      uWaterR: { value: new T3.Vector4(-L.half, 1 / (W.N * W.res), POOL.water, 0) },
      uDay: { value: 1 },
      uAqua: { value: new T3.Color(...th.wallAlt) },
      uTeal: { value: new T3.Color(...th.trim) },
    };
    const tiled = (key, o, extra) => {
      const m = new T3.MeshStandardMaterial({ color: 0xffffff, ...o });
      m.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + POOL_NORMAL_GLSL); };
      return patchLattice(m, sh, { key: 'pr-' + key, ...extra, uniforms: { ...this.u, ...(extra.uniforms || {}) }, fragmentHead: POOL_GLSL + (extra.fragmentHead || '') });
    };
    const tileColor = /* glsl */ `{
      vec3 P = vLatP; vec3 N = normalize(vLatN);
      float variant = floor(vTile + 0.001), ts = vTile - variant;
      vec2 f = abs(N.y) > 0.5 ? P.xz : abs(N.x) > 0.5 ? vec2(P.z, P.y) : vec2(P.x, P.y);
      vec3 base = diffuseColor.rgb;
      if (variant > 0.5 && variant < 1.5 && abs(N.y) < 0.5) {
        // a room's walls may carry a teal pinstripe at shoulder height, or an aqua skirting
        vec3 Q = P + N * 0.2;
        float ch = prH(floor((Q.xz - uGrid.x) / uGrid.y) + 0.37);
        float row = floor(P.y / ts + 0.001);
        if (ch < 0.45 && abs(row - 8.0) < 0.5) base = uTeal * 1.1;
        else if (ch > 0.62 && row < 1.5) base = uAqua;
        else if (ch > 0.88 && row < 4.5 && mod(floor(f.x / ts) + row, 2.0) > 0.5) base = mix(base, uAqua, 0.7);
      }
      vec3 grout = base * vec3(0.8, 0.78, 0.72);
      vec3 col = base;
      if (ts > 0.01) col = prTiles(f, ts, base, grout);
      else { prRough = 0.3; prTileN = vec2(0.0); }
      // water: under the surface the tile is tinted and dappled with caustics; above it, light
      // thrown back off the water plays over walls and ceilings
      float wy = uWaterR.z;
      if (N.y < -0.5) {
        float w = prWater(P.xz).r;
        if (w > 0.01) prGlow += w * prCaustic(P.xz * 0.5 + 7.0, uWaterR.w * 0.35) * 0.1 * smoothstep(3.0, 4.0, P.y);
      } else if (N.y < 0.5) {
        float w = prWater(P.xz + N.xz * 0.3).r;
        if (w > 0.01) {
          vec2 g = vec2(abs(N.x) > 0.5 ? P.z : P.x, P.y * 1.7);
          if (P.y < wy) { col *= mix(vec3(1.0), vec3(0.7, 0.93, 0.92), w); col *= mix(1.0, 0.75 + 0.55 * prCaustic(g, uWaterR.w * 0.5), w); }
          else prGlow += w * prCaustic(g * 0.6 + 3.0, uWaterR.w * 0.4) * 0.1 * exp(-(P.y - wy) * 1.1);
          col *= 1.0 - w * 0.14 * smoothstep(0.025, 0.0, abs(P.y - wy - 0.012));
        }
      }
      // light bounced up off the pale floor and the water keeps ceilings and soffits from greying
      prGlow += max(-N.y, 0.0) * 0.13 * dot(col, vec3(0.33));
      diffuseColor.rgb = col;
    }`;
    const tileExtra = {
      vertexHead: 'attribute float aTile; varying float vTile;',
      vertexBody: 'vTile = aTile;',
      fragmentHead: 'varying float vTile;',
      color: tileColor,
      roughness: 'roughnessFactor = prRough;',
      emissive: 'totalEmissiveRadiance += uLightCol * prGlow * uDay;',
    };
    const tile = tiled('tile', { vertexColors: true, roughness: 0.25 }, tileExtra);
    const plain = (key, o) => patchLattice(new T3.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, ...o }), sh, { key: 'pr-' + key });
    this.mats = {
      tile, ceil: tile,
      plastic: plain('plastic', { roughness: 0.42 }),
      chrome: plain('chrome', { roughness: 0.22, metalness: 0.75 }),
      paint: plain('paint', { roughness: 0.55 }),
      // frosted daylight in the arched windows: unlit, a little over white so it blooms
      glow: new T3.MeshBasicMaterial({ vertexColors: true, color: new T3.Color(2.1, 2.08, 2.0) }),
    };
    this.cast = { tile: true, ceil: false, plastic: true, chrome: true, paint: true, glow: false };
    this.floorMat = this.makeFloor();
  }

  // the floor: larger tiles on the deck, aqua tiles with a teal border in the pools, caustics
  // under the water, splashes round it, and the level's floor decals (blood, scorches)
  makeFloor() {
    const v = this.view, th = this.level.theme, dec = v.decals;
    const m = new T3.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    m.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + POOL_NORMAL_GLSL); };
    return patchLattice(m, v.shared, {
      key: 'pr-floor',
      uniforms: { ...this.u, uFloorCol: { value: new T3.Color(...th.carpet) }, uDecals: { value: dec.target.texture }, uRect: { value: dec.rectUniform } },
      fragmentHead: POOL_GLSL + `
        uniform vec3 uFloorCol; uniform sampler2D uDecals; uniform vec4 uRect;
        vec4 decalAt(vec2 xz) { vec2 uv = (xz - uRect.xy) / (2.0 * uRect.zw) + 0.5;
          if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0); return texture2D(uDecals, uv); }`,
      color: /* glsl */ `{
        vec2 xz = vLatP.xz;
        vec4 wm = prWater(xz);
        float wet = wm.r, pool = smoothstep(0.3, 0.7, wm.g);
        vec3 base = mix(uFloorCol, uAqua * 1.04, pool);
        base = mix(base, uTeal * 1.2, pool * (1.0 - smoothstep(0.29, 0.31, wm.b)));
        float ts = pool > 0.5 ? 0.15 : 0.2;
        vec3 col = prTiles(xz, ts, base, base * mix(vec3(0.8, 0.77, 0.7), vec3(0.85), pool));
        // splashed, damp tile on the dry floor round the water
        float sp = smoothstep(0.5, 0.75, prF(xz * 2.3) * 0.8 + wm.a * 0.55) * (1.0 - wet);
        col *= 1.0 - 0.08 * sp;
        prRough = mix(prRough, 0.04, sp);
        if (wet > 0.01) {
          col *= mix(vec3(1.0), mix(vec3(0.76, 0.95, 0.94), vec3(0.6, 0.9, 0.88), pool), wet);
          col *= mix(1.0, 0.8 + 0.5 * prCaustic(xz, uWaterR.w * 0.5), wet);
          prRough = mix(prRough, 0.4, wet);
        }
        // faint warm wear patches, never grey
        col *= mix(vec3(1.0), vec3(1.02, 0.985, 0.93), smoothstep(0.45, 0.8, prF(xz * 0.13 + 3.0)));
        vec4 dec = decalAt(xz);
        col = mix(col, vec3(0.12, 0.12, 0.11), clamp(dec.g, 0.0, 1.0) * 0.8);
        float bt = dec.r;
        vec3 bcol = mix(vec3(0.2, 0.011, 0.009), vec3(0.045, 0.0025, 0.002), smoothstep(0.15, 0.6, bt));
        col = mix(col, bcol, smoothstep(0.03, 0.12, bt));
        prRough = mix(prRough, 0.12, smoothstep(0.15, 0.45, bt));
        col *= edgeAO(vLatP, 0.45);
        diffuseColor.rgb = col;
      }`,
      roughness: 'roughnessFactor = prRough;',
    });
  }

  // the level view's walls, floor and ceiling make way for tiled ones
  replaceShell() {
    const v = this.view, L = this.level;
    v.scene.remove(v.walls);
    v.walls.geometry.dispose();
    v.walls.material.dispose();
    v.scene.remove(v.ceiling);
    v.ceiling.geometry.dispose();
    v.ceiling.material.dispose();
    v.floor.material.dispose();
    v.floor.material = this.floorMat;
    for (const b of L.boxes) {
      if (b.kind !== 'wall') continue;
      const g = whBox(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, (b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
      this.add('tile', g, PRC.white, PRT.wall);
    }
  }

  // ---- geometry bins -------------------------------------------------------------------------------
  rgb(hex) {
    let c = this.colors.get(hex);
    if (!c) { const k = new T3.Color(hex); c = [k.r, k.g, k.b]; this.colors.set(hex, c); }
    return c;
  }

  add(key, geo, hex = 0xffffff, tile = PRT.none) {
    const n = geo.attributes.position.count, [r, g, b] = this.rgb(hex), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; }
    geo.setAttribute('color', new T3.BufferAttribute(col, 3));
    if (this.mats[key] === this.mats.tile) geo.setAttribute('aTile', new T3.BufferAttribute(new Float32Array(n).fill(tile), 1));
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    if (geo.attributes.uv1) geo.deleteAttribute('uv1');
    const p = geo.attributes.position.array, L = this.level;
    const mx = (p[0] + p[p.length - 3]) / 2, mz = (p[2] + p[p.length - 1]) / 2;
    const ci = clamp(Math.floor((mx + L.half) / this.chunk), 0, this.nChunk - 1), cj = clamp(Math.floor((mz + L.half) / this.chunk), 0, this.nChunk - 1);
    const k = key + ':' + (cj * this.nChunk + ci);
    if (!this.bins.has(k)) this.bins.set(k, []);
    this.bins.get(k).push(geo);
  }

  flush() {
    for (const [k, list] of this.bins) {
      const key = k.split(':')[0];
      const geo = ThreeUtils.mergeGeometries(list);
      for (const g of list) g.dispose();
      geo.computeBoundingSphere();
      const mesh = new T3.Mesh(geo, this.mats[key]);
      mesh.castShadow = !!this.cast[key];
      mesh.receiveShadow = true;
      this.view.scene.add(mesh);
    }
    this.bins.clear();
  }

  placer(x0, z0, yaw) {
    const m = new T3.Matrix4().makeRotationY(yaw).setPosition(x0, 0, z0);
    return (key, geo, hex, tile) => this.add(key, geo.applyMatrix4(m), hex, tile);
  }

  // ---- structure -----------------------------------------------------------------------------------
  // tiled pillars: an aqua foot, a moulded capital at the spring of the arches
  buildPillars() {
    const L = this.level, H = L.ceiling, w = L.theme.pillarR * 2, y = POOL.spring;
    for (const p of L.pillars) {
      const P = (g, hex, t) => this.add('tile', g.translate(p.x, 0, p.z), hex, t);
      P(prPrism(w, w, 0.05, 0, 0.3), PRC.aqua, PRT.tile);
      P(prPrism(w, w, 0.05, 0.3, y - 0.08), PRC.white, PRT.tile);
      P(prPrism(w + 0.06, w + 0.06, 0.07, y - 0.08, y + 0.06, 3, true), PRC.cream, PRT.none);
      P(prPrism(w, w, 0.05, y + 0.06, H), PRC.white, PRT.tile);
    }
  }

  buildArches() {
    const L = this.level, H = L.ceiling;
    for (const a of L.arches) {
      const half = (a.u1 - a.u0) / 2, m = (a.u0 + a.u1) / 2;
      const g = prArch(half, POOL.spring, H, a.depth, a.door ? 14 : 20);
      if (!a.alongX) g.rotateY(Math.PI / 2);
      g.translate(a.alongX ? m : a.c, 0, a.alongX ? a.c : m);
      this.add('tile', g, PRC.white, PRT.tile);
      // a cream moulding along the soffit's edges reads the curve from afar
    }
  }

  // pool coping and the thresholds of flooded rooms: tiled kerbs with an aqua cap
  buildKerbs() {
    const K = POOL.kerb;
    for (const [x0, z0, x1, z1] of this.level.kerbs) {
      const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      this.add('tile', whBox(w, K - 0.04, d, cx, (K - 0.04) / 2, cz), PRC.white, PRT.small);
      this.add('tile', whBox(w + 0.012, 0.04, d + 0.012, cx, K - 0.02, cz), PRC.aqua, PRT.tile);
    }
  }

  // tiled ceiling with a square skylight well in every cell whose light is on
  buildCeiling() {
    const L = this.level, H = L.ceiling, C = L.cell, s = POOL.sky, D = POOL.well;
    const quad = (x0, z0, x1, z1) => this.add('ceil', new T3.PlaneGeometry(x1 - x0, z1 - z0).rotateX(Math.PI / 2).translate((x0 + x1) / 2, H, (z0 + z1) / 2), PRC.white, PRT.ceil);
    this.skylights = [];
    L.fixtures.forEach((f, k) => {
      const x0 = f.x - C / 2, x1 = f.x + C / 2, z0 = f.z - C / 2, z1 = f.z + C / 2;
      if (f.state === 'dead') { quad(x0, z0, x1, z1); return; }
      quad(x0, z0, x1, f.z - s);
      quad(x0, f.z + s, x1, z1);
      quad(x0, f.z - s, f.x - s, f.z + s);
      quad(f.x + s, f.z - s, x1, f.z + s);
      // the well's four walls, facing in
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const g = new T3.PlaneGeometry(2 * s, D).rotateY(Math.atan2(nx, nz)).translate(f.x - nx * s, H + D / 2, f.z - nz * s);
        this.add('ceil', g, PRC.white, PRT.tile);
      }
      this.skylights.push({ x: f.x, z: f.z, k });
    });
  }

  // ---- furniture -----------------------------------------------------------------------------------
  buildProps() {
    for (const p of this.level.props) {
      const put = this.placer(p.x, p.z, p.yaw);
      const B = (key, hex, du, dy, dv, u, y, v, t = PRT.none) => put(key, whBox(du, dy, dv, u, y, v), hex, t);
      const { w, d, h } = p.def;
      switch (p.kind) {
        case 'tbench':
          B('tile', PRC.white, w - 0.1, h - 0.06, d - 0.1, 0, (h - 0.06) / 2, 0, PRT.small);
          B('tile', PRC.aqua, w, 0.06, d, 0, h - 0.03, 0, PRT.tile);
          break;
        case 'halfwall':
          B('tile', PRC.white, w, h - 0.06, d, 0, (h - 0.06) / 2, 0, PRT.small);
          B('tile', PRC.aqua, w + 0.03, 0.06, d + 0.03, 0, h - 0.03, 0, PRT.tile);
          B('tile', PRC.teal, w + 0.002, 0.15, d + 0.002, 0, 0.075, 0, PRT.tile);
          break;
        case 'showers':
          B('tile', PRC.white, w, h - 0.05, d, 0, (h - 0.05) / 2, 0, PRT.small);
          B('tile', PRC.aqua, w + 0.03, 0.05, d + 0.03, 0, h - 0.025, 0, PRT.tile);
          B('tile', PRC.teal, w + 0.002, 0.15, d + 0.002, 0, 0.075, 0, PRT.tile);
          for (const sz of [-1, 1])
            for (const u of [-0.55, 0.55]) {
              const z = sz * (d / 2 + 0.03);
              put('chrome', whCyl(0.016, 0.016, 0.95, 8, u, 1.52, z), PRC.chrome);
              put('chrome', whCyl(0.014, 0.014, 0.2, 8, 0, 0, 0).rotateX(Math.PI / 2).translate(u, 2.0, z + sz * 0.1), PRC.chrome);
              put('chrome', whCyl(0.065, 0.035, 0.04, 12, u, 1.98, z + sz * 0.2), PRC.chrome);
              put('chrome', whCyl(0.035, 0.035, 0.03, 10, 0, 0, 0).rotateX(Math.PI / 2).translate(u, 1.15, z + sz * 0.01), PRC.chrome);
              B('chrome', PRC.dark, 0.16, 0.006, 0.16, u, 0.003, z + sz * 0.35);
            }
          break;
        case 'tiers':
          for (let k = 0; k < 3; k++) {
            const dd = 1.2 - k * 0.4, oz = -k * 0.2;
            B('tile', PRC.white, w, 0.35, dd, 0, k * 0.35 + 0.175, oz, PRT.small);
            B('tile', PRC.teal, w + 0.004, 0.045, 0.045, 0, k * 0.35 + 0.33, oz + dd / 2 - 0.02, PRT.none);
          }
          break;
        case 'lounger': this.lounger(put, B); break;
        case 'ladder':
          // each rail rises from the deck, arches over the coping and comes down in the water
          for (const sx of [-0.27, 0.27]) {
            const pts = [[sx, 0, -0.36], [sx, 0.7, -0.36]];
            for (let k = 1; k <= 8; k++) { const a = Math.PI * (1 - k / 8); pts.push([sx, 0.7 + 0.36 * Math.sin(a), 0.36 * Math.cos(a)]); }
            pts.push([sx, 0, 0.36]);
            for (let k = 0; k < pts.length - 1; k++) put('chrome', prTube(pts[k], pts[k + 1], 0.022), PRC.chrome);
            for (const z of [-0.36, 0.36]) put('chrome', whCyl(0.045, 0.045, 0.012, 12, sx, z > 0 ? 0.006 : 0.006, z), PRC.chrome);
          }
          break;
        case 'lifeguard': this.lifeguard(put, B); break;
      }
    }
  }

  // a white plastic pool lounger, head (raised backrest) towards local -z
  lounger(put, B) {
    B('plastic', 0xcfc9bc, 0.66, 0.05, 1.3, 0, 0.36, 0.3);
    for (let k = 0; k < 9; k++) B('plastic', PRC.plastic, 0.6, 0.012, 0.09, 0, 0.392, -0.25 + k * 0.135);
    for (const s of [-1, 1]) {
      B('plastic', 0xd9d4c8, 0.04, 0.08, 1.9, s * 0.32, 0.33, 0);
      for (const z of [-0.85, 0.85]) B('plastic', 0xd9d4c8, 0.05, 0.31, 0.06, s * 0.3, 0.155, z);
    }
    // the backrest, raised about 50 degrees
    const g = whBox(0.64, 0.05, 0.62, 0, 0, 0.31).rotateX(-0.85).translate(0, 0.38, -0.65);
    put('plastic', g, PRC.plastic);
    put('chrome', whCyl(0.045, 0.045, 0.04, 10, 0, 0, 0).rotateZ(Math.PI / 2).translate(0.3, 0.05, 0.85), PRC.dark);
    put('chrome', whCyl(0.045, 0.045, 0.04, 10, 0, 0, 0).rotateZ(Math.PI / 2).translate(-0.3, 0.05, 0.85), PRC.dark);
  }

  // a lifeguard chair facing the water (local +z): legs, footrest, rungs, seat, a buoy on the side
  lifeguard(put, B) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put('paint', whCyl(0.032, 0.032, 1.45, 10, sx * 0.4, 0.725, sz * 0.4), PRC.paint);
    for (const y of [0.45, 0.95]) for (const sx of [-1, 1]) put('paint', whCyl(0.022, 0.022, 0.8, 8, 0, 0, 0).rotateX(Math.PI / 2).translate(sx * 0.4, y, 0), PRC.paint);
    for (const y of [0.35, 0.7, 1.05]) B('paint', PRC.paint, 0.8, 0.04, 0.09, 0, y, 0.42);
    B('plastic', PRC.teal, 0.86, 0.08, 0.66, 0, 1.49, 0.02);
    B('plastic', PRC.teal, 0.86, 0.5, 0.06, 0, 1.8, -0.38);
    for (const sx of [-1, 1]) put('paint', whCyl(0.022, 0.022, 0.5, 8, sx * 0.43, 1.78, -0.36), PRC.paint);
    put('plastic', new T3.TorusGeometry(0.26, 0.055, 8, 18).rotateY(Math.PI / 2).translate(0.47, 1.0, 0), PRC.buoy);
  }

  // arched windows of frosted glass on the outer walls: daylight beyond, never a way out
  buildWindows() {
    const L = this.level, n = L.n, half = L.half, t = L.wallT, R = this.rng;
    this.used = new Set();
    const inlet = new Set(L.inlets.map((q) => `${q.c}:${q.nx},${q.nz}`));
    for (let k = 0; k < n; k++)
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (R() > 0.4) continue;
        const along = L.cx(k);
        const x = nx ? -nx * (half - t / 2) : along, z = nz ? -nz * (half - t / 2) : along;
        // keep clear of anything standing against the wall there
        const px = x + nx * 0.35, pz = z + nz * 0.35;
        if (L.boxesNear(px, pz, 0.7).some((b) => b.kind === 'prop' && b.max.y > 0.5)) continue;
        if (inlet.has(`${L.cellOf(px, pz)}:${nx},${nz}`)) continue;
        this.used.add(`${L.cellOf(px, pz)}:${nx},${nz}`);
        const put = this.placer(x + nx * 0.004, z + nz * 0.004, Math.atan2(nx, nz));
        const hw = 0.62, y0 = 1.15, ys = 2.3;
        put('glow', prPane(hw, y0, ys, 14), 0xfff8ec);
        // white frame, a mullion and a transom, a tiled sill
        put('paint', whBox(0.05, ys - y0 + hw, 0.03, 0, (y0 + ys + hw) / 2, 0.015), PRC.paint);
        put('paint', whBox(2 * hw, 0.04, 0.03, 0, ys, 0.015), PRC.paint);
        for (const s of [-1, 1]) put('paint', whBox(0.06, ys - y0, 0.04, s * (hw + 0.02), (y0 + ys) / 2, 0.02), PRC.paint);
        put('paint', prArch(hw + 0.05, ys, ys + hw + 0.05, 0.04, 14).translate(0, 0, 0.02), PRC.paint);
        put('tile', whBox(2 * hw + 0.16, 0.05, 0.05, 0, y0 - 0.025, 0.025), PRC.aqua, PRT.none);
      }
  }

  // water inlets in the flooded rooms: a dark arched mouth low in the wall, a tiled lip, and a
  // thin sheet of water pouring from it into the flood with a ring of foam where it lands
  buildInlets() {
    const L = this.level, wy = POOL.water;
    const y0 = 0.62, ys = 0.8, hw = 0.17, out = 0.12;
    const sheets = [], foams = [];
    for (const { x, z, nx, nz, c } of L.inlets) {
      this.used.add(`${c}:${nx},${nz}`);
      const yaw = Math.atan2(nx, nz), put = this.placer(x, z, yaw);
      put('tile', prPane(hw + 0.09, y0 - 0.06, ys, 12).translate(0, 0, 0.003), PRC.aqua, PRT.none);
      put('paint', prPane(hw, y0, ys, 12).translate(0, 0, 0.006), PRC.dark);
      put('tile', whBox(2 * hw + 0.12, 0.05, out, 0, y0 - 0.025, out / 2), PRC.aqua, PRT.none);
      // the falling sheet: a short parabola from the lip to the surface, in local space
      const pos = [], uv = [], idx = [], N = 8;
      for (let k = 0; k <= N; k++) {
        const s = k / N, fall = y0 - wy, zz = out + 0.02 + 0.22 * Math.sqrt(s), yy = y0 - fall * s;
        for (const e of [-1, 1]) { pos.push(e * (hw - 0.03) * (1 + 0.25 * s), yy, zz); uv.push((e + 1) / 2, s); }
        if (k < N) { const b = k * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      const g = new T3.BufferGeometry();
      g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new T3.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      sheets.push(g.applyMatrix4(new T3.Matrix4().makeRotationY(yaw).setPosition(x, 0, z)));
      const f = new T3.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2).translate(0, wy + 0.004, out + 0.26).applyMatrix4(new T3.Matrix4().makeRotationY(yaw).setPosition(x, 0, z));
      foams.push(f);
    }
    if (!sheets.length) return;
    const time = (this.flowTime = { value: 0 });
    const NOISE = 'float h1(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }\n' +
      'float n1(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }\n';
    const vs = 'varying vec2 vUv; varying float vD; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }';
    const fogU = this.fogU || (this.fogU = { uFogD: { value: L.theme.fogDensity }, uFogCol: { value: new T3.Color(...L.theme.fog) } });
    const sheet = new T3.ShaderMaterial({
      uniforms: { uTime: time, ...fogU },
      vertexShader: vs,
      fragmentShader: NOISE + /* glsl */ `
        uniform float uTime; uniform float uFogD; uniform vec3 uFogCol; varying vec2 vUv; varying float vD;
        void main() {
          float streak = n1(vec2(vUv.x * 14.0, vUv.y * 4.0 - uTime * 5.0)) * 0.6 + n1(vec2(vUv.x * 30.0, vUv.y * 9.0 - uTime * 8.0)) * 0.4;
          float edge = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
          float a = (0.25 + 0.55 * smoothstep(0.35, 0.8, streak)) * edge * (1.0 - 0.4 * vUv.y);
          vec3 c = mix(vec3(0.75, 0.93, 0.92), vec3(1.25), streak);
          gl_FragColor = vec4(mix(uFogCol, c, exp(-uFogD * uFogD * vD * vD)), a);
        }`,
      transparent: true, depthWrite: false, side: T3.DoubleSide,
    });
    const foam = new T3.ShaderMaterial({
      uniforms: { uTime: time, ...fogU },
      vertexShader: vs,
      fragmentShader: NOISE + /* glsl */ `
        uniform float uTime; uniform float uFogD; uniform vec3 uFogCol; varying vec2 vUv; varying float vD;
        void main() {
          vec2 p = vUv - 0.5; float r = length(p) * 2.0;
          float churn = n1(p * 9.0 + vec2(uTime * 1.3, -uTime * 0.9)) * n1(p * 17.0 - uTime * 2.1);
          float ring = smoothstep(1.0, 0.25, r) * (0.4 + 0.6 * sin(r * 22.0 - uTime * 7.0) * 0.5 + 0.3);
          float a = clamp(ring * (0.25 + churn * 1.2), 0.0, 0.85) * smoothstep(1.0, 0.6, r);
          gl_FragColor = vec4(mix(uFogCol, vec3(1.1), exp(-uFogD * uFogD * vD * vD)), a);
        }`,
      transparent: true, depthWrite: false,
    });
    const sm = new T3.Mesh(ThreeUtils.mergeGeometries(sheets), sheet);
    const fm = new T3.Mesh(ThreeUtils.mergeGeometries(foams), foam);
    sheets.forEach((g) => g.dispose());
    foams.forEach((g) => g.dispose());
    sm.renderOrder = 3;
    fm.renderOrder = 3;
    this.view.scene.add(sm, fm);
  }

  // drains on the decks
  buildDeck() {
    const L = this.level, R = this.rng;
    for (const hl of L.halls) {
      if (!hl.pool) continue;
      const [px0, pz0, px1, pz1] = hl.pool;
      for (let k = 0; k < 3; k++) {
        const s = Math.floor(R() * 4), u = R();
        const x = s < 2 ? (s ? px1 + 0.45 : px0 - 0.45) : px0 + 0.6 + u * (px1 - px0 - 1.2);
        const z = s >= 2 ? (s === 3 ? pz1 + 0.45 : pz0 - 0.45) : pz0 + 0.6 + u * (pz1 - pz0 - 1.2);
        if (!L.free(x, z, 0.3)) continue;
        this.add('chrome', whBox(0.24, 0.006, 0.24, x, 0.003, z), PRC.chrome);
        for (let m = -2; m <= 2; m++) this.add('chrome', whBox(0.012, 0.007, 0.2, x + m * 0.04, 0.004, z), PRC.dark);
      }
    }
  }

  // ---- water ---------------------------------------------------------------------------------------
  buildWater() {
    const v = this.view, L = this.level, th = L.theme, y = POOL.water;
    const geos = L.water.map(([x0, z0, x1, z1]) => new T3.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2));
    if (!geos.length) return;
    for (const g of geos) g.deleteAttribute('uv');
    const geo = ThreeUtils.mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    const lc = new T3.Color(...th.lightCol);
    this.ripples = Array.from({ length: 8 }, () => new T3.Vector4());
    this.waterMat = new T3.ShaderMaterial({
      uniforms: {
        uFix: v.shared.uFix, uGrid: v.shared.uGrid, uTime: { value: 0 }, uDay: this.u.uDay,
        uFogCol: { value: new T3.Color(...th.fog) }, uFogD: { value: th.fogDensity },
        uSky: { value: lc.clone().multiplyScalar(1.7) }, uCeil: { value: new T3.Color(...th.ceilingCol).multiplyScalar(0.8) },
        uTint: { value: new T3.Color(0.42, 0.78, 0.76) }, uRip: { value: this.ripples },
      },
      vertexShader: /* glsl */ `
        varying vec3 vP;
        void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uFix; uniform vec4 uGrid; uniform float uTime; uniform float uDay;
        uniform vec3 uFogCol; uniform float uFogD; uniform vec3 uSky; uniform vec3 uCeil; uniform vec3 uTint;
        uniform vec4 uRip[8];
        varying vec3 vP;
        void main() {
          vec3 d3 = cameraPosition - vP;
          float dist = length(d3);
          vec3 V = d3 / dist;
          vec2 p = vP.xz, g = vec2(0.0);
          float t = uTime;
          // slow swells and a finer chop, as slopes (the derivative of each wave)
          g += vec2(0.8, 0.6) * 0.018 * cos(dot(p, vec2(0.8, 0.6)) * 1.1 + t * 0.7);
          g += vec2(-0.5, 0.86) * 0.015 * cos(dot(p, vec2(-0.5, 0.86)) * 1.7 + t * 0.9);
          g += vec2(0.96, -0.28) * 0.012 * cos(dot(p, vec2(0.96, -0.28)) * 3.1 + t * 1.3);
          g += vec2(-0.2, -0.98) * 0.01 * cos(dot(p, vec2(-0.2, -0.98)) * 5.3 + t * 1.9);
          g += vec2(0.6, 0.8) * 0.008 * cos(dot(p, vec2(0.6, 0.8)) * 9.7 - t * 2.6);
          g += vec2(-0.9, 0.44) * 0.007 * cos(dot(p, vec2(-0.9, 0.44)) * 13.1 + t * 3.1);
          g += vec2(0.3, -0.95) * 0.005 * cos(dot(p, vec2(0.3, -0.95)) * 23.0 + t * 4.3);
          g += vec2(0.99, 0.1) * 0.004 * cos(dot(p, vec2(0.99, 0.1)) * 31.0 - t * 5.1);
          // rings round people wading
          for (int k = 0; k < 8; k++) {
            vec4 r = uRip[k];
            if (r.w <= 0.0) continue;
            vec2 dd = p - r.xy;
            float L = length(dd) + 1e-4;
            g += dd / L * sin(L * 20.0 - t * 6.5 + r.z) * 0.08 * r.w * exp(-L * 1.6) * smoothstep(0.12, 0.35, L);
          }
          g /= 1.0 + dist * 0.08;
          vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
          float cosV = max(dot(N, V), 0.0);
          float fres = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
          // the ceiling seen in the water: tiles lit from below, the skylights bright
          vec3 R = reflect(-V, N);
          float tc = (uGrid.w - vP.y) / max(R.y, 0.04);
          vec2 hit = vP.xz + R.xz * tc;
          vec3 refl = uCeil;
          ivec2 c = ivec2(floor((hit - uGrid.x) / uGrid.y));
          if (c.x >= 0 && c.y >= 0 && c.x < int(uGrid.z) && c.y < int(uGrid.z)) {
            float lvl = texelFetch(uFix, c, 0).r;
            vec2 loc = hit - (uGrid.x + (vec2(c) + 0.5) * uGrid.y);
            float sq = max(abs(loc.x), abs(loc.y));
            refl = mix(refl, uSky, smoothstep(0.78, 0.58, sq) * lvl);
            refl *= mix(0.55, 1.0, lvl);
          }
          refl = mix(uFogCol, refl, exp(-uFogD * uFogD * tc * tc * 0.6));
          refl *= uDay * 0.9 + 0.1;
          vec3 col = refl * fres;
          float a = clamp(fres + 0.04, 0.0, 1.0);
          float fog = exp(-uFogD * uFogD * dist * dist);
          col = mix(uFogCol * a, col, fog);
          gl_FragColor = vec4(col / max(a, 1e-3), a);
        }`,
      transparent: true, depthWrite: false,
    });
    const mesh = new T3.Mesh(geo, this.waterMat);
    mesh.renderOrder = 2;
    v.scene.add(mesh);
    this.water = mesh;
  }

  // ---- skylights: the glowing panes at the top of the wells, and soft shafts of light below -----
  buildSkylights() {
    const v = this.view, L = this.level, th = L.theme, H = L.ceiling, s = POOL.sky, D = POOL.well, sh = v.shared;
    if (!this.skylights.length) return;
    const lc = new T3.Color(...th.lightCol);
    const panes = [], shafts = [];
    for (const sk of this.skylights) {
      const g = new T3.PlaneGeometry(2 * s, 2 * s).rotateX(Math.PI / 2).translate(sk.x, H + D, sk.z);
      g.setAttribute('aFix', new T3.BufferAttribute(new Float32Array(4).fill(sk.k), 1));
      g.setAttribute('aLoc', new T3.BufferAttribute(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 2));
      g.deleteAttribute('uv');
      panes.push(g);
      // a soft, tapering column of haze from the opening to the floor
      const sg = whCyl(s * 1.05, s * 1.9, H - 0.05, 16, sk.x, (H - 0.05) / 2 + 0.05, sk.z, true);
      const pp = sg.attributes.position, aT = new Float32Array(pp.count);
      for (let i = 0; i < pp.count; i++) aT[i] = 1 - (pp.getY(i) - 0.05) / (H - 0.05);
      sg.setAttribute('aT', new T3.BufferAttribute(aT, 1));
      sg.setAttribute('aFix', new T3.BufferAttribute(new Float32Array(pp.count).fill(sk.k), 1));
      sg.deleteAttribute('uv');
      shafts.push(sg);
    }
    const fogU = this.fogU || (this.fogU = { uFogD: { value: th.fogDensity }, uFogCol: { value: new T3.Color(...th.fog) } });
    this.paneMat = new T3.ShaderMaterial({
      uniforms: { uFix: sh.uFix, uGrid: sh.uGrid, uSky: { value: lc.clone().multiplyScalar(3.4) }, ...fogU },
      vertexShader: /* glsl */ `
        attribute float aFix; attribute vec2 aLoc; uniform sampler2D uFix; uniform vec4 uGrid;
        varying float vL; varying vec2 vLoc; varying float vD;
        void main() {
          int nn = int(uGrid.z); int k = int(aFix + 0.5);
          vL = texelFetch(uFix, ivec2(k % nn, k / nn), 0).r;
          vLoc = aLoc;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vD = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSky; uniform vec3 uFogCol; uniform float uFogD;
        varying float vL; varying vec2 vLoc; varying float vD;
        void main() {
          vec3 c = uSky * (1.0 - 0.22 * dot(vLoc, vLoc));
          vec2 g = abs(fract(vLoc * 1.5 + 0.5) - 0.5);
          float bar = smoothstep(0.45, 0.47, max(g.x, g.y));
          c = mix(c, uSky * 0.18, bar) * vL;
          gl_FragColor = vec4(mix(uFogCol, c, exp(-uFogD * uFogD * vD * vD)), 1.0);
        }`,
    });
    const pm = new T3.Mesh(ThreeUtils.mergeGeometries(panes), this.paneMat);
    panes.forEach((g) => g.dispose());
    this.shaftMat = new T3.ShaderMaterial({
      uniforms: { uFix: sh.uFix, uGrid: sh.uGrid, uCol: { value: lc.clone().multiplyScalar(0.07) }, ...fogU },
      vertexShader: /* glsl */ `
        attribute float aT; attribute float aFix; uniform sampler2D uFix; uniform vec4 uGrid; uniform float uFogD;
        varying float vA; varying vec3 vN; varying vec3 vP; varying float vT;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vT = aT;
          int nn = int(uGrid.z); int k = int(aFix + 0.5);
          vec4 mv = viewMatrix * wp;
          float dist = -mv.z;
          vA = texelFetch(uFix, ivec2(k % nn, k / nn), 0).r * smoothstep(0.5, 4.0, dist) * exp(-uFogD * uFogD * dist * dist);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol; varying float vA; varying vec3 vN; varying vec3 vP; varying float vT;
        void main() {
          vec3 V = normalize(cameraPosition - vP);
          float thick = pow(abs(dot(normalize(vN), V)), 1.4);
          float a = thick * (1.0 - vT) * smoothstep(0.0, 0.08, vT) * vA;
          gl_FragColor = vec4(uCol * a, 1.0);
        }`,
      blending: T3.AdditiveBlending, transparent: true, depthWrite: false, side: T3.DoubleSide,
    });
    const smesh = new T3.Mesh(ThreeUtils.mergeGeometries(shafts), this.shaftMat);
    shafts.forEach((g) => g.dispose());
    smesh.renderOrder = 5;
    v.scene.add(pm, smesh);
  }

  // ---- signs ---------------------------------------------------------------------------------------
  // one canvas atlas: ceramic plaques on the walls, depth and no-diving marks on the pool decks
  buildSigns() {
    const L = this.level, R = this.rng, n = L.n, signs = [];
    const plaques = ['NO DIVING', 'NO RUNNING', 'SHALLOW WATER', 'POOL CLOSED', 'NO LIFEGUARD ON DUTY', 'SWIM AT YOUR OWN RISK', 'PLEASE SHOWER BEFORE ENTERING', 'KEEP TO THE TILES', 'DO NOT DRINK THE WATER', 'STAY IN SIGHT OF OTHERS'];
    let placed = 0;
    for (let tries = 0; tries < 200 && placed < 9 + L.loop; tries++) {
      const c = Math.floor(R() * n * n), i = c % n, j = (c / n) | 0, d = Math.floor(R() * 4);
      if (L.edgeVal(i, j, d) !== 1) continue;
      const nx = d === 0 ? -1 : d === 1 ? 1 : 0, nz = d === 2 ? -1 : d === 3 ? 1 : 0;
      const key = `${c}:${nx},${nz}`;
      if (this.used.has(key)) continue;
      const x = d < 2 ? L.cx(i) - nx * (L.cell / 2 - L.wallT / 2 - 0.006) : L.cx(i) + (R() - 0.5) * 1.2;
      const z = d >= 2 ? L.cx(j) - nz * (L.cell / 2 - L.wallT / 2 - 0.006) : L.cx(j) + (R() - 0.5) * 1.2;
      if (L.boxesNear(x + nx * 0.4, z + nz * 0.4, 0.5).some((b) => b.kind === 'prop' && b.max.y > 1.2)) continue;
      this.used.add(key);
      const text = plaques[(placed + Math.floor(R() * 3)) % plaques.length];
      signs.push({ text, style: 'plaque', pos: [x, 1.72, z], nx, nz, w: 0.84, h: 0.42 });
      placed++;
    }
    // deck marks beside the coping
    for (const hl of L.halls) {
      if (!hl.pool) continue;
      const [px0, pz0, px1, pz1] = hl.pool, mx = (px0 + px1) / 2, mz = (pz0 + pz1) / 2;
      const marks = [[mx, pz0 - 0.32, 0, -1], [mx, pz1 + 0.32, 0, 1], [px0 - 0.32, mz, -1, 0], [px1 + 0.32, mz, 1, 0]];
      marks.forEach(([x, z, nx, nz], k) => {
        if (!L.free(x, z, 0.25)) return;
        signs.push({ text: k % 2 ? 'NO DIVING' : '0.1 m', style: 'deck', pos: [x, 0.004, z], nx, nz, w: 0.72, h: 0.3, flat: true });
      });
    }
    if (!signs.length) return;
    const tw = 256, tht = 128, cols = 4, rows = Math.ceil(signs.length / cols);
    const cv = document.createElement('canvas');
    cv.width = tw * cols;
    cv.height = tht * rows;
    const g = cv.getContext('2d');
    signs.forEach((s, k) => {
      const x0 = (k % cols) * tw, y0 = ((k / cols) | 0) * tht;
      g.save();
      g.translate(x0, y0);
      if (s.style === 'plaque') {
        g.fillStyle = '#f2ede2'; g.fillRect(2, 2, tw - 4, tht - 4);
        g.strokeStyle = '#2c8d93'; g.lineWidth = 7; g.strokeRect(10, 10, tw - 20, tht - 20);
        g.fillStyle = '#1f5f66';
      } else g.fillStyle = 'rgba(28, 92, 100, 0.92)';
      const words = s.text.split(' '), lines = [];
      let cur = '';
      for (const w of words) { if ((cur + ' ' + w).trim().length > 13 && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
      lines.push(cur);
      const fs = s.style === 'deck' ? 64 : lines.length > 2 ? 30 : lines.length > 1 ? 36 : 40;
      g.font = `700 ${fs}px "Helvetica Neue", Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      lines.forEach((ln, m) => g.fillText(ln, tw / 2, tht / 2 + (m - (lines.length - 1) / 2) * fs * 1.08, tw - 34));
      if (s.style === 'deck') {
        // worn paint
        g.globalCompositeOperation = 'destination-out';
        for (let m = 0; m < 50; m++) { g.globalAlpha = 0.25 + Math.random() * 0.6; g.fillRect(Math.random() * tw, Math.random() * tht, 2 + Math.random() * 6, 2 + Math.random() * 4); }
      }
      g.restore();
    });
    const tex = new T3.CanvasTexture(cv);
    tex.colorSpace = T3.SRGBColorSpace;
    tex.anisotropy = 4;
    this.textures.push(tex);
    const mat = patchLattice(new T3.MeshStandardMaterial({ map: tex, roughness: 0.35, alphaTest: 0.5 }), this.view.shared, { key: 'pr-sign' });
    const geos = signs.map((s, k) => {
      const geo = new T3.PlaneGeometry(s.w, s.h);
      const uv = geo.attributes.uv, c = k % cols, r = (k / cols) | 0;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (c + uv.getX(i)) / cols, 1 - (r + 1 - uv.getY(i)) / rows);
      // a deck mark lies flat, its text read from the deck side (facing away from the water)
      if (s.flat) geo.rotateX(-Math.PI / 2).rotateY(Math.atan2(-s.nx, -s.nz) + Math.PI);
      else geo.rotateY(Math.atan2(s.nx, s.nz));
      return geo.translate(...s.pos);
    });
    const mesh = new T3.Mesh(ThreeUtils.mergeGeometries(geos), mat);
    geos.forEach((g2) => g2.dispose());
    mesh.receiveShadow = true;
    this.view.scene.add(mesh);
  }

  // ---- per frame -----------------------------------------------------------------------------------
  update(dt, cam) {
    const v = this.view, fog = v.scene.fog;
    this.time += dt;
    this.u.uWaterR.value.w = this.time;
    this.u.uDay.value = v.blackout ? 0 : v.dim ?? 1;
    const fd = fog ? fog.density : 0;
    if (this.fogU) this.fogU.uFogD.value = fd;
    if (this.flowTime) this.flowTime.value = this.time;
    if (this.waterMat) {
      const u = this.waterMat.uniforms;
      u.uTime.value = this.time;
      u.uFogD.value = fd;
      // ripples round whoever wades: the camera's owner first, then the nearest people in water
      const L = this.level, rp = this.ripples;
      let k = 0;
      const sb = v.sb;
      const P = sb && sb.player;
      if (P && L.wetAt(P.pos.x, P.pos.z)) {
        const sp = Math.min(1, Math.hypot(P.vel.x, P.vel.z) / 3);
        rp[k++].set(P.pos.x, P.pos.z, 0, 0.25 + sp);
      }
      if (sb) for (const t of sb.people) {
        if (k >= rp.length) break;
        const pe = t.rd.pelvis.pos;
        if (Math.abs(pe.x - cam.position.x) > 20 || Math.abs(pe.z - cam.position.z) > 20 || !L.wetAt(pe.x, pe.z)) continue;
        rp[k++].set(pe.x, pe.z, k * 1.7, 0.8);
      }
      for (; k < rp.length; k++) rp[k].w = 0;
    }
  }

  dispose() { for (const t of this.textures) t.dispose(); }
}
