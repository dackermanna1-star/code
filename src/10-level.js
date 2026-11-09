// Procedural Backrooms levels: a braided maze of rooms on a square cell grid, with doorways,
// pillars, cover props and ceiling light fixtures. The level owns everything spatial the game
// asks about: physics colliders, navigation, line of sight, cover and spawn points.

const LEVEL_THEMES = [
  {
    id: 'lobby', code: 'LEVEL 0', title: 'THE LOBBY',
    blurb: 'Mono-yellow wallpaper. Moist carpet. The hum of fluorescent lights at maximum buzz.',
    cell: 3.2, cells: 20, ceiling: 2.75, wallT: 0.16,
    braid: 0.52, doorways: 0.5, rooms: 8, roomMin: 2, roomMax: 5, pillars: 0.4, props: 0.18,
    outage: 0.05, flicker: 0.07, darkZones: 1,
    wall: [0.78, 0.69, 0.38], wallAlt: [0.70, 0.60, 0.30], carpet: [0.52, 0.44, 0.27], ceilingCol: [0.80, 0.77, 0.62],
    lightCol: [1.0, 0.95, 0.80], lightPow: 1.0, ambient: 0.32, fog: [0.42, 0.37, 0.20], fogDensity: 0.05,
    trim: [0.42, 0.35, 0.22], style: 0,
  },
  {
    id: 'habitable', code: 'LEVEL 1', title: 'HABITABLE ZONE',
    blurb: 'Concrete and rebar, puddles and crates. Somebody has been living here. Several somebodies.',
    cell: 4.0, cells: 16, ceiling: 3.5, wallT: 0.24,
    braid: 0.7, doorways: 0.35, rooms: 7, roomMin: 2, roomMax: 5, pillars: 0.75, props: 0.32,
    outage: 0.12, flicker: 0.12, darkZones: 2,
    wall: [0.46, 0.46, 0.44], wallAlt: [0.38, 0.38, 0.37], carpet: [0.30, 0.30, 0.29], ceilingCol: [0.34, 0.34, 0.33],
    lightCol: [0.92, 0.95, 1.0], lightPow: 0.9, ambient: 0.22, fog: [0.16, 0.17, 0.18], fogDensity: 0.055,
    trim: [0.25, 0.25, 0.25], style: 1,
  },
  {
    id: 'pipes', code: 'LEVEL 2', title: 'PIPE DREAMS',
    blurb: 'Narrow maintenance tunnels. Hot pipes, cold dark. The lights here gave up long ago.',
    cell: 2.8, cells: 22, ceiling: 2.55, wallT: 0.2,
    braid: 0.36, doorways: 0.3, rooms: 4, roomMin: 2, roomMax: 3, pillars: 0.2, props: 0.22,
    outage: 0.3, flicker: 0.2, darkZones: 3,
    wall: [0.33, 0.30, 0.27], wallAlt: [0.27, 0.24, 0.21], carpet: [0.20, 0.19, 0.18], ceilingCol: [0.18, 0.17, 0.16],
    lightCol: [1.0, 0.62, 0.40], lightPow: 0.8, ambient: 0.12, fog: [0.07, 0.05, 0.04], fogDensity: 0.07,
    trim: [0.18, 0.16, 0.14], style: 2,
  },
  {
    id: 'office', code: 'LEVEL 4', title: 'ABANDONED OFFICE',
    blurb: 'Cubicles to the horizon. The coffee is still warm. Nobody has worked here in decades.',
    cell: 3.6, cells: 18, ceiling: 2.85, wallT: 0.14,
    braid: 0.66, doorways: 0.55, rooms: 9, roomMin: 2, roomMax: 5, pillars: 0.3, props: 0.42,
    outage: 0.14, flicker: 0.1, darkZones: 2,
    wall: [0.62, 0.62, 0.58], wallAlt: [0.55, 0.56, 0.52], carpet: [0.27, 0.30, 0.34], ceilingCol: [0.78, 0.78, 0.74],
    lightCol: [0.95, 1.0, 0.96], lightPow: 0.95, ambient: 0.26, fog: [0.22, 0.24, 0.24], fogDensity: 0.05,
    trim: [0.30, 0.30, 0.30], style: 3,
  },
];

// prop catalogue: footprint (w, d), height, collider material, penetration-friendly or not
const PROP_DEFS = {
  cabinet: { w: 0.48, d: 0.62, h: 1.32, material: 'metal', wall: true },
  shelf: { w: 1.2, d: 0.42, h: 1.9, material: 'metal', wall: true },
  desk: { w: 1.5, d: 0.72, h: 0.76, material: 'wood', wall: false },
  crate: { w: 0.9, d: 0.9, h: 0.9, material: 'wood', wall: false },
  boxes: { w: 0.7, d: 0.6, h: 1.05, material: 'cardboard', wall: true },
  partition: { w: 1.8, d: 0.08, h: 1.25, material: 'cardboard', wall: false },
  barrel: { w: 0.6, d: 0.6, h: 0.9, material: 'metal', wall: false },
  vending: { w: 0.9, d: 0.8, h: 1.85, material: 'metal', wall: true },
  sofa: { w: 1.8, d: 0.85, h: 0.8, material: 'cardboard', wall: true },
};
const THEME_PROPS = {
  lobby: ['cabinet', 'boxes', 'desk', 'sofa', 'partition', 'vending', 'crate'],
  habitable: ['crate', 'barrel', 'boxes', 'shelf', 'crate', 'barrel'],
  pipes: ['barrel', 'shelf', 'crate', 'boxes', 'cabinet'],
  office: ['desk', 'partition', 'cabinet', 'desk', 'partition', 'boxes', 'shelf'],
};

class BackroomsLevel {
  constructor(depth = 1, seed = (Math.random() * 1e9) | 0) {
    this.depth = depth;
    this.theme = LEVEL_THEMES[(depth - 1) % LEVEL_THEMES.length];
    this.loop = Math.floor((depth - 1) / LEVEL_THEMES.length); // deeper loops: darker, larger
    this.seed = seed;
    this.rng = Lab.rng(seed);
    const th = this.theme;
    this.cell = th.cell;
    this.n = th.cells + Math.min(4, this.loop * 2);
    this.size = this.n * this.cell;
    this.half = this.size / 2;
    this.ceiling = th.ceiling;
    this.wallT = th.wallT;
    this.generate();
  }

  // ---- grid helpers ----------------------------------------------------------------------
  cx(i) { return -this.half + (i + 0.5) * this.cell; }
  cellOf(x, z) {
    const i = Math.floor((x + this.half) / this.cell), j = Math.floor((z + this.half) / this.cell);
    return i < 0 || j < 0 || i >= this.n || j >= this.n ? -1 : j * this.n + i;
  }
  cellCenter(c, out = new I()) { return out.set(this.cx(c % this.n), 0, this.cx((c / this.n) | 0)); }
  // wall between (i,j) and (i+1,j): v[i+1][j]; between (i,j) and (i,j+1): h[i][j+1]
  vIdx(i, j) { return i * this.n + j; }      // i in 0..n, j in 0..n-1
  hIdx(i, j) { return i * (this.n + 1) + j; } // i in 0..n-1, j in 0..n

  generate() {
    const n = this.n, R = this.rng, th = this.theme;
    // 1 = wall, 2 = wall with doorway, 0 = open
    this.v = new Uint8Array((n + 1) * n).fill(1);
    this.h = new Uint8Array(n * (n + 1)).fill(1);
    // perfect maze (iterative DFS) guarantees connectivity
    const seen = new Uint8Array(n * n), stack = [((n / 2) | 0) * n + ((n / 2) | 0)];
    seen[stack[0]] = 1;
    while (stack.length) {
      const c = stack[stack.length - 1], i = c % n, j = (c / n) | 0;
      const opts = [];
      if (i > 0 && !seen[c - 1]) opts.push([c - 1, () => (this.v[this.vIdx(i, j)] = 0)]);
      if (i < n - 1 && !seen[c + 1]) opts.push([c + 1, () => (this.v[this.vIdx(i + 1, j)] = 0)]);
      if (j > 0 && !seen[c - n]) opts.push([c - n, () => (this.h[this.hIdx(i, j)] = 0)]);
      if (j < n - 1 && !seen[c + n]) opts.push([c + n, () => (this.h[this.hIdx(i, j + 1)] = 0)]);
      if (!opts.length) { stack.pop(); continue; }
      const [nc, carve] = opts[Math.floor(R() * opts.length)];
      carve();
      seen[nc] = 1;
      stack.push(nc);
    }
    // braid: knock out or punch doorways through the remaining interior walls (loops for flanking)
    const interior = (arr, isV) => {
      for (let a = 0; a < arr.length; a++) {
        const i = isV ? Math.floor(a / n) : Math.floor(a / (n + 1)), j = isV ? a % n : a % (n + 1);
        const boundary = isV ? i === 0 || i === n : j === 0 || j === n;
        if (boundary || arr[a] !== 1) continue;
        const r = R();
        if (r < th.braid * 0.55) arr[a] = 0;
        else if (r < th.braid) arr[a] = 2;
      }
    };
    interior(this.v, true);
    interior(this.h, false);
    // open-plan rooms: clear the walls inside random rectangles
    this.rooms = [];
    this.pillarSpots = [];
    for (let k = 0; k < th.rooms + this.loop; k++) {
      const w = th.roomMin + Math.floor(R() * (th.roomMax - th.roomMin + 1));
      const d = th.roomMin + Math.floor(R() * (th.roomMax - th.roomMin + 1));
      const i0 = 1 + Math.floor(R() * (n - w - 1)), j0 = 1 + Math.floor(R() * (n - d - 1));
      this.rooms.push({ i0, j0, w, d });
      for (let i = i0; i < i0 + w; i++)
        for (let j = j0; j < j0 + d; j++) {
          if (i > i0) this.v[this.vIdx(i, j)] = 0;
          if (j > j0) this.h[this.hIdx(i, j)] = 0;
        }
      for (let i = i0 + 1; i < i0 + w; i++)
        for (let j = j0 + 1; j < j0 + d; j++) if (R() < th.pillars) this.pillarSpots.push([i, j]);
    }
    // the centre cell is the arrival point: keep it open
    const mid = (n / 2) | 0;
    this.v[this.vIdx(mid, mid)] = this.v[this.vIdx(mid + 1, mid)] = 0;
    this.h[this.hIdx(mid, mid)] = this.h[this.hIdx(mid, mid + 1)] = 0;

    this.buildBoxes();
    this.placeProps();
    this.placeFixtures();
    this.buildSpatial();
  }

  // ---- colliders -------------------------------------------------------------------------
  buildBoxes() {
    const n = this.n, C = this.cell, H = this.ceiling, t = this.wallT, half = this.half;
    const boxes = (this.boxes = []);
    this.wallBoxes = [];
    this.doorways = [];
    const door = Math.min(1.25, C * 0.42), lintel = Math.min(2.15, H - 0.35);
    const wall = (x0, z0, x1, z1, kind = 'wall', y0 = 0, y1 = H, material = 'drywall') => {
      const b = Lab.boxDef((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), kind, material);
      boxes.push(b);
      if (kind === 'wall' || kind === 'lintel') this.wallBoxes.push(b);
      return b;
    };
    // vertical walls (constant x), merging consecutive full segments
    for (let i = 0; i <= n; i++) {
      const x = -half + i * C;
      const boundary = i === 0 || i === n;
      let run = -1;
      for (let j = 0; j <= n; j++) {
        const val = j < n ? this.v[this.vIdx(i, j)] : 0;
        if (val === 1 && run < 0) run = j;
        if ((val !== 1 || j === n) && run >= 0) {
          wall(x - t / 2, -half + run * C - t / 2, x + t / 2, -half + j * C + t / 2, 'wall', 0, H, boundary ? 'concrete' : 'drywall');
          run = -1;
        }
        if (val === 2) {
          const z0 = -half + j * C, z1 = z0 + C, zc = (z0 + z1) / 2;
          wall(x - t / 2, z0 - t / 2, x + t / 2, zc - door / 2);
          wall(x - t / 2, zc + door / 2, x + t / 2, z1 + t / 2);
          wall(x - t / 2, zc - door / 2, x + t / 2, zc + door / 2, 'lintel', lintel, H);
          this.doorways.push({ x, z: zc, axis: 'x' });
        }
      }
    }
    for (let j = 0; j <= n; j++) {
      const z = -half + j * C;
      const boundary = j === 0 || j === n;
      let run = -1;
      for (let i = 0; i <= n; i++) {
        const val = i < n ? this.h[this.hIdx(i, j)] : 0;
        if (val === 1 && run < 0) run = i;
        if ((val !== 1 || i === n) && run >= 0) {
          wall(-half + run * C - t / 2, z - t / 2, -half + i * C + t / 2, z + t / 2, 'wall', 0, H, boundary ? 'concrete' : 'drywall');
          run = -1;
        }
        if (val === 2) {
          const x0 = -half + i * C, x1 = x0 + C, xc = (x0 + x1) / 2;
          wall(x0 - t / 2, z - t / 2, xc - door / 2, z + t / 2);
          wall(xc + door / 2, z - t / 2, x1 + t / 2, z + t / 2);
          wall(xc - door / 2, z - t / 2, xc + door / 2, z + t / 2, 'lintel', lintel, H);
          this.doorways.push({ x: xc, z, axis: 'z' });
        }
      }
    }
    this.pillars = [];
    const p = 0.24;
    for (const [i, j] of this.pillarSpots) {
      const x = -half + i * C, z = -half + j * C;
      this.pillars.push({ x, z });
      boxes.push(Lab.boxDef(x, H / 2, z, p * 2, H, p * 2, 'pillar', 'concrete'));
    }
    // ceiling slab (grenades bounce off it, bullets puff on it)
    boxes.push(Lab.boxDef(0, H + 0.15, 0, this.size + 1, 0.3, this.size + 1, 'ceiling', 'ceiling'));
  }

  wallOpen(i, j, dir) {
    // is the edge of cell (i,j) in direction dir (0:+x 1:-x 2:+z 3:-z) passable?
    const val = dir === 0 ? this.v[this.vIdx(i + 1, j)] : dir === 1 ? this.v[this.vIdx(i, j)] : dir === 2 ? this.h[this.hIdx(i, j + 1)] : this.h[this.hIdx(i, j)];
    return val !== 1;
  }

  // ---- props (cover) ---------------------------------------------------------------------
  placeProps() {
    const R = this.rng, th = this.theme, n = this.n, C = this.cell, t = this.wallT;
    const kinds = THEME_PROPS[th.id];
    this.props = [];
    const mid = (n / 2) | 0;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        if (Math.abs(i - mid) <= 1 && Math.abs(j - mid) <= 1) continue;
        if (R() > th.props) continue;
        const kind = kinds[Math.floor(R() * kinds.length)];
        const def = PROP_DEFS[kind];
        const cx = this.cx(i), cz = this.cx(j);
        // against a wall if the def wants one and there is one, else free-standing near the centre
        const walls = [0, 1, 2, 3].filter((d) => !this.wallOpen(i, j, d));
        let x = cx, z = cz, yaw = R() * TAU;
        if (def.wall && walls.length) {
          const d = walls[Math.floor(R() * walls.length)];
          const off = C / 2 - t / 2 - def.d / 2 - 0.02;
          const slide = (R() - 0.5) * (C - def.w - 0.6);
          if (d === 0) { x = cx + off; z = cz + slide; yaw = -Math.PI / 2; }
          else if (d === 1) { x = cx - off; z = cz + slide; yaw = Math.PI / 2; }
          else if (d === 2) { z = cz + off; x = cx + slide; yaw = Math.PI; }
          else { z = cz - off; x = cx + slide; yaw = 0; }
        } else {
          x = cx + (R() - 0.5) * C * 0.35;
          z = cz + (R() - 0.5) * C * 0.35;
          yaw = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2) + (R() - 0.5) * 0.3;
        }
        // axis-aligned collider of the rotated footprint
        const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
        const ex = def.w * c + def.d * s, ez = def.w * s + def.d * c;
        const box = Lab.boxDef(x, def.h / 2, z, ex, def.h, ez, 'prop', def.material);
        this.props.push({ kind, x, z, yaw, def, box });
        this.boxes.push(box);
      }
  }

  // ---- lights ----------------------------------------------------------------------------
  placeFixtures() {
    const R = this.rng, th = this.theme, n = this.n;
    const dark = [];
    for (let k = 0; k < th.darkZones + this.loop; k++) {
      dark.push({ i: Math.floor(R() * n), j: Math.floor(R() * n), r: 1.5 + R() * 2.5 });
    }
    const mid = (n / 2) | 0;
    this.fixtures = [];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        let state = 'on';
        const r = R();
        const deep = Math.min(0.35, this.loop * 0.08);
        if (r < th.outage + deep) state = 'dead';
        else if (r < th.outage + deep + th.flicker) state = 'flicker';
        for (const d of dark) if (Math.hypot(i - d.i, j - d.j) < d.r) state = R() < 0.15 ? 'flicker' : 'dead';
        if (Math.abs(i - mid) <= 1 && Math.abs(j - mid) <= 1) state = 'on';
        this.fixtures.push({ i, j, x: this.cx(i), z: this.cx(j), state, phase: R() * 100, level: state === 'dead' ? 0 : 1 });
      }
  }

  // ---- spatial queries -------------------------------------------------------------------
  buildSpatial() {
    // bucket blocking boxes into the cell grid so ray/clearance tests only see nearby boxes
    const n = this.n;
    this.buckets = Array.from({ length: n * n }, () => []);
    this.blockers = this.boxes.filter((b) => b.kind !== 'ceiling');
    for (const b of this.blockers) {
      const i0 = Math.max(0, Math.floor((b.min.x + this.half) / this.cell)), i1 = Math.min(n - 1, Math.floor((b.max.x + this.half) / this.cell));
      const j0 = Math.max(0, Math.floor((b.min.z + this.half) / this.cell)), j1 = Math.min(n - 1, Math.floor((b.max.z + this.half) / this.cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.buckets[j * n + i].push(b);
    }
    this._stamp = 0;
    for (const b of this.blockers) b._stamp = 0;
  }

  // boxes overlapping the rectangle (for the player controller and nearby work)
  boxesNear(x, z, r, out = []) {
    out.length = 0;
    const n = this.n, st = ++this._stamp;
    const i0 = Math.max(0, Math.floor((x - r + this.half) / this.cell)), i1 = Math.min(n - 1, Math.floor((x + r + this.half) / this.cell));
    const j0 = Math.max(0, Math.floor((z - r + this.half) / this.cell)), j1 = Math.min(n - 1, Math.floor((z + r + this.half) / this.cell));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++)
        for (const b of this.buckets[j * n + i]) {
          if (b._stamp === st) continue;
          b._stamp = st;
          if (b.max.x < x - r || b.min.x > x + r || b.max.z < z - r || b.min.z > z + r) continue;
          out.push(b);
        }
    return out;
  }

  // does the segment (x0,z0)->(x1,z1) at height y clear every box by `pad` metres?
  segmentClear(x0, z0, x1, z1, y = 1.2, pad = 0, minHeight = 0) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    const st = ++this._stamp, n = this.n;
    for (let s = 0; s <= steps; s++) {
      const px = x0 + (dx * s) / steps, pz = z0 + (dz * s) / steps;
      const ci = Math.floor((px + this.half) / this.cell), cj = Math.floor((pz + this.half) / this.cell);
      for (let jj = cj - 1; jj <= cj + 1; jj++)
        for (let ii = ci - 1; ii <= ci + 1; ii++) {
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          for (const b of this.buckets[jj * n + ii]) {
            if (b._stamp === st) continue;
            b._stamp = st;
            // only boxes that reach into the vertical band [minHeight, y] block the segment
            if (b.max.y < minHeight || b.min.y > y) continue;
            if (segAabb2(x0, z0, x1, z1, b.min.x - pad, b.min.z - pad, b.max.x + pad, b.max.z + pad)) return false;
          }
        }
    }
    return true;
  }

  // eye-to-eye visibility (3D: a low prop does not block a view over it)
  visible(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    if (len < 0.01) return true;
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    const st = ++this._stamp, n = this.n;
    for (let s = 0; s <= steps; s++) {
      const px = a.x + (dx * s) / steps, pz = a.z + (dz * s) / steps;
      const ci = Math.floor((px + this.half) / this.cell), cj = Math.floor((pz + this.half) / this.cell);
      for (let jj = cj - 1; jj <= cj + 1; jj++)
        for (let ii = ci - 1; ii <= ci + 1; ii++) {
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          for (const box of this.buckets[jj * n + ii]) {
            if (box._stamp === st) continue;
            box._stamp = st;
            if (segAabb3(a, b, box.min, box.max)) return false;
          }
        }
    }
    return true;
  }

  inside(x, z, margin = 0.3) {
    return Math.abs(x) < this.half - margin && Math.abs(z) < this.half - margin;
  }

  // is a disc of radius r at (x,z) free of colliders?
  free(x, z, r = 0.32) {
    if (!this.inside(x, z, r + this.wallT)) return false;
    for (const b of this.boxesNear(x, z, r + 0.05)) {
      if (b.max.y < 0.2 || b.min.y > 1.9) continue; // skirting-level clutter, lintels overhead
      const qx = clamp(x, b.min.x, b.max.x), qz = clamp(z, b.min.z, b.max.z);
      if (Math.hypot(x - qx, z - qz) < r) return false;
    }
    return true;
  }

  // ---- navigation: A* on cells, then string-pulled against the real colliders ------------
  findPath(from, to, radius = 0.32) {
    const n = this.n;
    const s = this.cellOf(from.x, from.z), g = this.cellOf(to.x, to.z);
    if (s < 0 || g < 0) return null;
    if (s === g) return [new I(to.x, 0, to.z)];
    const open = new CellHeap(), cost = new Float32Array(n * n).fill(Infinity), prev = new Int32Array(n * n).fill(-1);
    cost[s] = 0;
    open.push(s, 0);
    const gi = g % n, gj = (g / n) | 0;
    while (open.size) {
      const c = open.pop();
      if (c === g) break;
      const i = c % n, j = (c / n) | 0;
      for (let d = 0; d < 4; d++) {
        if (!this.wallOpen(i, j, d)) continue;
        const nc = d === 0 ? c + 1 : d === 1 ? c - 1 : d === 2 ? c + n : c - n;
        const doorCost = (d < 2 ? this.v[this.vIdx(d === 0 ? i + 1 : i, j)] : this.h[this.hIdx(i, d === 2 ? j + 1 : j)]) === 2 ? 0.4 : 0;
        const crowd = this.crowd ? this.crowd[nc] * 0.8 : 0;
        const nCost = cost[c] + 1 + doorCost + crowd;
        if (nCost < cost[nc]) {
          cost[nc] = nCost;
          prev[nc] = c;
          const ni = nc % n, nj = (nc / n) | 0;
          open.push(nc, nCost + Math.abs(ni - gi) + Math.abs(nj - gj));
        }
      }
    }
    if (prev[g] < 0) return null;
    // walk back: waypoints at the middle of every crossed edge
    const cells = [];
    for (let c = g; c !== s; c = prev[c]) cells.push(c);
    cells.push(s);
    cells.reverse();
    const pts = [new I(from.x, 0, from.z)];
    for (let k = 1; k < cells.length; k++) pts.push(this.crossing(cells[k - 1], cells[k], radius, pts[pts.length - 1]));
    pts.push(new I(to.x, 0, to.z));
    // string pulling: skip waypoints while the straight line keeps clear of walls and props;
    // where even the next leg is blocked (a prop in the way), go round it
    const clear = (a, b) => this.segmentClear(a.x, a.z, b.x, b.z, 1.0, radius, 0.25);
    const out = [];
    let k = 0;
    while (k < pts.length - 1) {
      let far = -1;
      for (let m = pts.length - 1; m > k; m--) if (clear(pts[k], pts[m])) { far = m; break; }
      if (far < 0) {
        far = k + 1;
        out.push(...this.detour(pts[k], pts[far], radius));
      }
      out.push(pts[far]);
      k = far;
    }
    return out;
  }

  // where to cross the shared edge of neighbouring cells a and b: the free point on the opening
  // nearest its middle that `prev` can reach in a straight line
  crossing(a, b, r, prev) {
    const n = this.n, ai = a % n, aj = (a / n) | 0, bi = b % n, bj = (b / n) | 0;
    const mx = (this.cx(ai) + this.cx(bi)) / 2, mz = (this.cx(aj) + this.cx(bj)) / 2;
    const alongX = ai === bi; // cells stacked in z: the shared edge runs along x
    const val = alongX ? this.h[this.hIdx(ai, Math.max(aj, bj))] : this.v[this.vIdx(Math.max(ai, bi), aj)];
    const open = (val === 2 ? Math.min(1.25, this.cell * 0.42) / 2 : this.cell / 2 - 0.3) - r - 0.05;
    let first = null;
    for (const f of [0, 0.45, -0.45, 0.9, -0.9]) {
      const o = f * Math.max(0, open);
      const x = mx + (alongX ? o : 0), z = mz + (alongX ? 0 : o);
      if (!this.free(x, z, r)) continue;
      if (!first) first = new I(x, 0, z);
      if (this.segmentClear(prev.x, prev.z, x, z, 1.0, r, 0.25)) return new I(x, 0, z);
    }
    return first || new I(mx, 0, mz);
  }

  // intermediate points for stepping round props between a and b (both in or on one cell):
  // one pivot that sees both ends if there is one, else a fine-grid search across the cell
  detour(a, b, r) {
    const c = this.cellOf((a.x + b.x) / 2, (a.z + b.z) / 2);
    if (c < 0) return [];
    const cx = this.cx(c % this.n), cz = this.cx((c / this.n) | 0), e = this.cell / 2 - this.wallT - r - 0.08;
    const clear = (p, q, pad = r) => this.segmentClear(p.x, p.z, q.x, q.z, 1.0, pad, 0.25);
    let best = null, bestL = Infinity;
    for (const [fx, fz] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1], [0.5, 0.5], [0.5, -0.5], [-0.5, 0.5], [-0.5, -0.5]]) {
      const p = new I(cx + fx * e, 0, cz + fz * e);
      const L = Math.hypot(p.x - a.x, p.z - a.z) + Math.hypot(b.x - p.x, b.z - p.z);
      if (L >= bestL || !this.free(p.x, p.z, r)) continue;
      if (!clear(a, p) || !clear(p, b)) continue;
      best = p; bestL = L;
    }
    if (best) return [best];
    // breadth-first search on a 0.2 m grid over the cell, then pull the string tight
    const h = 0.2, half = this.cell / 2 + 0.2, N = Math.ceil((2 * half) / h) + 1, x0 = cx - half, z0 = cz - half;
    const rr = r * 0.9;
    const at = (i, j) => new I(x0 + i * h, 0, z0 + j * h);
    const snap = (p) => [clamp(Math.round((p.x - x0) / h), 0, N - 1), clamp(Math.round((p.z - z0) / h), 0, N - 1)];
    const ok = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) ok[j * N + i] = this.free(x0 + i * h, z0 + j * h, rr) ? 1 : 0;
    const [si, sj] = snap(a), [gi, gj] = snap(b), s = sj * N + si, g = gj * N + gi;
    ok[s] = ok[g] = 1;
    const prev = new Int32Array(N * N).fill(-1);
    prev[s] = s;
    const queue = [s];
    for (let q = 0; q < queue.length && prev[g] < 0; q++) {
      const cur = queue[q], i = cur % N, j = (cur / N) | 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ni = i + di, nj = j + dj;
          if ((!di && !dj) || ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
          const nc = nj * N + ni;
          if (!ok[nc] || prev[nc] >= 0 || (di && dj && (!ok[j * N + ni] || !ok[nj * N + i]))) continue;
          prev[nc] = cur;
          queue.push(nc);
        }
    }
    if (prev[g] < 0) return [];
    const cells = [];
    for (let k = g; k !== s; k = prev[k]) cells.push(k);
    cells.reverse();
    const grid = cells.map((k) => at(k % N, (k / N) | 0));
    grid[grid.length - 1] = b;
    const out = [];
    let from = a, k = 0;
    while (k < grid.length - 1) {
      let far = k;
      for (let m = grid.length - 1; m > k; m--) if (clear(from, grid[m], rr)) { far = m; break; }
      if (far === grid.length - 1) break;
      out.push(grid[far]);
      from = grid[far];
      k = far + 1;
    }
    return out;
  }

  pathLength(from, to) {
    const p = this.findPath(from, to);
    if (!p) return Infinity;
    let L = 0, px = from.x, pz = from.z;
    for (const q of p) { L += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; }
    return L;
  }

  // breadth-first cell distances from a point (spawn selection, threat maps)
  cellDistances(x, z) {
    const n = this.n, d = new Int16Array(n * n).fill(-1), s = this.cellOf(x, z);
    if (s < 0) return d;
    const q = [s];
    d[s] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], i = c % n, j = (c / n) | 0;
      for (let k = 0; k < 4; k++) {
        if (!this.wallOpen(i, j, k)) continue;
        const nc = k === 0 ? c + 1 : k === 1 ? c - 1 : k === 2 ? c + n : c - n;
        if (d[nc] < 0) { d[nc] = d[c] + 1; q.push(nc); }
      }
    }
    return d;
  }

  // a random free point inside a cell
  pointInCell(c, r = 0.35, tries = 12) {
    const x0 = this.cx(c % this.n), z0 = this.cx((c / this.n) | 0);
    for (let k = 0; k < tries; k++) {
      const x = x0 + (this.rng() - 0.5) * (this.cell - 1.0) * (k === 0 ? 0 : 1);
      const z = z0 + (this.rng() - 0.5) * (this.cell - 1.0) * (k === 0 ? 0 : 1);
      if (this.free(x, z, r)) return new I(x, 0, z);
    }
    return null;
  }

  // cover spots near walls/pillars/props around a point, blocked from `threat` but able to peek
  coverSpots(near, threatEye, opts = {}) {
    const { radius = 9, minDist = 4, maxDist = 24, count = 6 } = opts;
    const out = [];
    const tries = 40;
    for (let k = 0; k < tries && out.length < count; k++) {
      const a = this.rng() * TAU, r = 1 + this.rng() * radius;
      const x = near.x + Math.cos(a) * r, z = near.z + Math.sin(a) * r;
      if (!this.free(x, z, 0.38)) continue;
      // must hug something solid within 0.8 m
      const hug = this.boxesNear(x, z, 0.8).some((b) => b.max.y > 0.7 && b.kind !== 'ceiling');
      if (!hug) continue;
      const dT = Math.hypot(x - threatEye.x, z - threatEye.z);
      if (dT < minDist || dT > maxDist) continue;
      const stand = { x, y: 1.45, z };
      if (this.visible(stand, threatEye)) continue; // exposed
      // peek: a short side step that sees the threat
      let peek = null;
      for (const s of [-0.8, 0.8, -1.3, 1.3]) {
        const tx = threatEye.x - x, tz = threatEye.z - z, tl = Math.hypot(tx, tz) || 1;
        const px = x + (-tz / tl) * s, pz = z + (tx / tl) * s;
        if (this.free(px, pz, 0.32) && this.visible({ x: px, y: 1.45, z: pz }, threatEye)) { peek = new I(px, 0, pz); break; }
      }
      // crouched cover (low prop): standing sees, crouching does not
      out.push({ pos: new I(x, 0, z), peek, dist: dT });
    }
    return out;
  }
}

// segment vs axis-aligned rectangle (2D, slab test)
function segAabb2(x0, z0, x1, z1, minX, minZ, maxX, maxZ) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dz = z1 - z0;
  for (const [p, d, lo, hi] of [[x0, dx, minX, maxX], [z0, dz, minZ, maxZ]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let a = (lo - p) / d, b = (hi - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}
function segAabb3(a, b, mn, mx) {
  let t0 = 0, t1 = 1;
  for (const k of ['x', 'y', 'z']) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-9) { if (a[k] < mn[k] || a[k] > mx[k]) return false; continue; }
    let u = (mn[k] - a[k]) / d, v = (mx[k] - a[k]) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    if (t0 > t1) return false;
  }
  return true;
}

class CellHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(k, p) {
    const K = this.k, P = this.p;
    let i = K.length;
    K.push(k); P.push(p);
    while (i > 0) {
      const pa = (i - 1) >> 1;
      if (P[pa] <= p) break;
      K[i] = K[pa]; P[i] = P[pa]; i = pa;
    }
    K[i] = k; P[i] = p;
  }
  pop() {
    const K = this.k, P = this.p, top = K[0], lk = K.pop(), lp = P.pop();
    if (K.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= K.length) break;
        if (c + 1 < K.length && P[c + 1] < P[c]) c++;
        if (P[c] >= lp) break;
        K[i] = K[c]; P[i] = P[c]; i = c;
      }
      K[i] = lk; P[i] = lp;
    }
    return top;
  }
}
