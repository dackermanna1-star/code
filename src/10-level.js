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
    // a storage warehouse after hours: block-walled halls with roller-door openings, rows of
    // pallet racking under a steel roof, sodium high-bay lamps hanging over the aisles
    id: 'warehouse', code: 'LEVEL 1', title: 'THE WAREHOUSE',
    blurb: 'Sodium lamps hum over aisles of stock nobody ordered. The forklifts are still warm. The night shift never clocked out.',
    layout: 'warehouse',
    cell: 4.8, cells: 14, ceiling: 7.0, wallT: 0.3,
    door: 2.6, lintel: 3.4, wallMat: 'concrete', pillarR: 0.21, pillarMat: 'metal',
    braid: 0, doorways: 0, rooms: 0, roomMin: 2, roomMax: 4, pillars: 0.85, props: 0.3,
    outage: 0.06, flicker: 0.06, darkZones: 1,
    wall: [0.74, 0.62, 0.45], wallAlt: [0.42, 0.13, 0.07], carpet: [0.43, 0.37, 0.30], ceilingCol: [0.36, 0.33, 0.29],
    lightCol: [1.0, 0.65, 0.33], lightPow: 1.25, ambient: 0.15, fog: [0.2, 0.12, 0.06], fogDensity: 0.026,
    trim: [0.85, 0.58, 0.05], style: 4,
    // high-bay lamps hang well below the roof: their height, falloff, reach, bounce, the share of
    // light thrown sideways and up, how tightly the reflector throws the rest down, and the
    // shadow-casting spot lights' strength and range
    lamp: { y: 5.45, fall: 0.09, win: 15, bounce: 0.06, up: 0.06, beam: 3, spot: 42, spotDist: 13, bias: -0.0012, normalBias: 0.06 },
    rack: { depth: 1.1, height: 5.35 },
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
  // warehouse stock and machines (placed by placeWarehouseProps; sizes may vary per instance)
  load: { w: 1.2, d: 1.0, h: 1.45, material: 'goods', wall: false },      // shrink-wrapped pallet load
  pallets: { w: 1.2, d: 1.0, h: 0.6, material: 'wood', wall: false },     // stack of empty pallets
  drums: { w: 1.2, d: 1.0, h: 1.04, material: 'metal', wall: false },     // four drums on a pallet
  cartons: { w: 1.1, d: 0.9, h: 1.2, material: 'cardboard', wall: false },
  stack: { w: 2.4, d: 2.0, h: 2.6, material: 'goods', wall: false },      // block-stacked bulk storage
  jack: { w: 0.56, d: 1.6, h: 0.3, material: 'metal', wall: false },      // pallet jack (handle is open)
  cone: { w: 0.36, d: 0.36, h: 0.5, material: 'cardboard', wall: false },
  bollard: { w: 0.24, d: 0.24, h: 1.1, material: 'metal', wall: false },
  // packing bench, and the cartons left on it ([w, d, h, x, z, y0] boxes in prop space)
  bench: { w: 1.8, d: 0.8, h: 0.92, material: 'wood', wall: true,
    boxes: [[1.8, 0.8, 0.92, 0, 0, 0], [0.46, 0.38, 0.52, -0.5, -0.05, 0.92, 'cardboard']] },
  bin: { w: 0.62, d: 0.62, h: 1.0, material: 'metal', wall: true },       // wheelie bin
  // forklift: solid body to seat height, the mast and the forks; the overhead guard is an open cage
  forklift: { w: 1.16, d: 3.4, h: 2.25, material: 'metal', wall: false,
    boxes: [[1.16, 1.95, 1.25, 0, -0.18, 0], [0.9, 0.3, 2.25, 0, 0.98, 0], [0.74, 1.08, 0.07, 0, 1.66, 0]] },
};
const THEME_PROPS = {
  lobby: ['cabinet', 'boxes', 'desk', 'sofa', 'partition', 'vending', 'crate'],
  warehouse: ['load', 'pallets', 'cartons', 'drums', 'crate', 'load', 'jack', 'barrel'], // placed per hall type (placeWarehouseProps)
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
    if (this.theme.layout === 'warehouse') this.generateWarehouse();
    else this.generateMaze();
    // the centre cell is the arrival point: keep it open
    const n = this.n, mid = (n / 2) | 0;
    this.v[this.vIdx(mid, mid)] = this.v[this.vIdx(mid + 1, mid)] = 0;
    this.h[this.hIdx(mid, mid)] = this.h[this.hIdx(mid, mid + 1)] = 0;
    if (this.theme.layout === 'warehouse') {
      this.connectAll();
      this.placeWallRacks(); // after every opening in the walls is final
    }

    this.buildBoxes();
    if (this.theme.layout === 'warehouse') this.placeWarehouseProps();
    else this.placeProps();
    this.placeFixtures();
    this.buildSpatial();
  }

  generateMaze() {
    const n = this.n, R = this.rng, th = this.theme;
    // 1 = wall, 2 = wall with doorway, 3 = pallet racking (closed like a wall), 0 = open
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
  }

  // ---- Level 1: the warehouse ------------------------------------------------------------
  // The floor is split into a few halls by block walls with roller-door openings. Rack halls get
  // rows of pallet racking on the interior grid lines (edge value 3), so every aisle is one cell
  // wide and the cell graph stays truthful for navigation, light reach and spawning; cross-aisles
  // run along both ends of the rows (and through the middle of long ones). Open halls are dock
  // and bulk-storage floor on a grid of steel columns.
  generateWarehouse() {
    const n = this.n, R = this.rng, mid = (n / 2) | 0;
    const V = (this.v = new Uint8Array((n + 1) * n));
    const Hz = (this.h = new Uint8Array(n * (n + 1)));
    for (let j = 0; j < n; j++) V[this.vIdx(0, j)] = V[this.vIdx(n, j)] = 1;
    for (let i = 0; i < n; i++) Hz[this.hIdx(i, 0)] = Hz[this.hIdx(i, n)] = 1;
    this.rooms = [];
    this.pillarSpots = [];
    this.dividers = []; // every edge of the walls between halls: [alongZ, line, k]
    const halls = (this.halls = []);
    // a block wall along the shared border of two halls, with doorways and open bays in it
    const divide = (alongZ, line, from, to) => {
      const idx = (k) => (alongZ ? this.vIdx(line, k) : this.hIdx(k, line));
      const arr = alongZ ? V : Hz;
      for (let k = from; k < to; k++) { arr[idx(k)] = 1; this.dividers.push([alongZ, line, k]); }
      const len = to - from, gaps = 2 + (len >= 10 ? 1 : 0);
      const used = [];
      for (let g = 0, tries = 0; g < gaps && tries < 40; tries++) {
        const k = from + Math.floor(R() * len);
        if (used.some((u) => Math.abs(u - k) < 3)) continue;
        used.push(k);
        g++;
        if (R() < 0.6) arr[idx(k)] = 2; // roller-door opening
        else {
          arr[idx(k)] = 0; // an open bay, sometimes two cells wide
          if (R() < 0.4 && k + 1 < to) arr[idx(k + 1)] = 0;
        }
      }
    };
    const split = (r, depth) => {
      const canX = r.w >= 9, canZ = r.d >= 9;
      if ((!canX && !canZ) || depth >= 2 || (depth > 0 && R() < 0.35)) { halls.push(r); return; }
      const cutX = canX && canZ ? R() < 0.5 : canX; // a wall at constant x splits the width
      const span = cutX ? r.w : r.d;
      const p = 4 + Math.floor(R() * (span - 7));
      if (cutX) {
        divide(true, r.i0 + p, r.j0, r.j0 + r.d);
        split({ i0: r.i0, j0: r.j0, w: p, d: r.d }, depth + 1);
        split({ i0: r.i0 + p, j0: r.j0, w: r.w - p, d: r.d }, depth + 1);
      } else {
        divide(false, r.j0 + p, r.i0, r.i0 + r.w);
        split({ i0: r.i0, j0: r.j0, w: r.w, d: p }, depth + 1);
        split({ i0: r.i0, j0: r.j0 + p, w: r.w, d: r.d - p }, depth + 1);
      }
    };
    split({ i0: 0, j0: 0, w: n, d: n }, 0);
    // what each hall holds: the arrival hall is open dock floor unless it is most of the
    // building, one other hall may be bulk storage, the rest are racking
    const inHall = (hl, i, j) => i >= hl.i0 && i < hl.i0 + hl.w && j >= hl.j0 && j < hl.j0 + hl.d;
    const midHall = halls.find((hl) => inHall(hl, mid, mid));
    for (const hl of halls) hl.type = 'racks';
    if (midHall && midHall.w * midHall.d <= 72) midHall.type = 'dock';
    const others = halls.filter((hl) => hl !== midHall).sort((a, b) => a.w * a.d - b.w * b.d);
    if (others.length >= 2 && R() < 0.5) others[0].type = 'bulk'; // the smallest hall
    halls.forEach((hl, k) => (hl.letter = 'ABCDEFGH'[k]));
    // the cells around the arrival point stay clear of racking
    const plaza = (i, j) => Math.abs(i - mid) <= 1 && Math.abs(j - mid) <= 1;
    for (const hl of halls) {
      if (hl.type !== 'racks') continue;
      // rows run along the long side of the hall
      const alongX = hl.w > hl.d || (hl.w === hl.d && R() < 0.5);
      const len = alongX ? hl.w : hl.d, rows = alongX ? hl.d : hl.w;
      const cross = new Set([0, len - 1]);
      if (len >= 8) cross.add(Math.floor(len / 2) - 1 + Math.floor(R() * 2));
      hl.alongX = alongX;
      hl.cross = cross;
      for (let k = 1; k < rows; k++)
        for (let a = 0; a < len; a++) {
          if (cross.has(a) || R() < 0.06) continue; // cross-aisles, and the odd missing bay
          if (alongX) {
            const i = hl.i0 + a, j = hl.j0 + k;
            if (!plaza(i, j - 1) && !plaza(i, j)) Hz[this.hIdx(i, j)] = 3;
          } else {
            const i = hl.i0 + k, j = hl.j0 + a;
            if (!plaza(i - 1, j) && !plaza(i, j)) V[this.vIdx(i, j)] = 3;
          }
        }
    }
    // steel columns on a two-cell grid across the open halls
    for (const hl of halls) {
      if (hl.type === 'racks') continue;
      for (let i = hl.i0 + 2; i < hl.i0 + hl.w; i += 2)
        for (let j = hl.j0 + 2; j < hl.j0 + hl.d; j += 2) {
          // all four edges meeting at the corner must be open floor
          if (V[this.vIdx(i, j - 1)] || V[this.vIdx(i, j)] || Hz[this.hIdx(i - 1, j)] || Hz[this.hIdx(i, j)]) continue;
          if (R() < this.theme.pillars) this.pillarSpots.push([i, j]);
        }
    }
  }

  // single-sided racking along the solid stretches of the rack halls' long walls (run once the
  // openings are final, so no rack ever stands across a doorway or bay)
  placeWallRacks() {
    const mid = (this.n / 2) | 0;
    const plaza = (i, j) => Math.abs(i - mid) <= 1 && Math.abs(j - mid) <= 1;
    this.wallRacks = [];
    for (const hl of this.halls) {
      if (hl.type !== 'racks') continue;
      const alongX = hl.alongX, cross = hl.cross, len = alongX ? hl.w : hl.d;
      for (const side of [0, 1]) {
        const line = alongX ? (side ? hl.j0 + hl.d : hl.j0) : side ? hl.i0 + hl.w : hl.i0;
        const row = side ? line - 1 : line; // the row of cells the rack stands in
        let run = -1;
        for (let a = 0; a <= len; a++) {
          const i = alongX ? hl.i0 + a : row, j = alongX ? row : hl.j0 + a;
          const solid = a < len && !cross.has(a) && !plaza(i, j) &&
            (alongX ? this.h[this.hIdx(i, line)] === 1 : this.v[this.vIdx(line, j)] === 1);
          if (solid && run < 0) run = a;
          if (!solid && run >= 0) {
            this.wallRacks.push({ alongX, line, side: side ? -1 : 1, from: (alongX ? hl.i0 : hl.j0) + run, to: (alongX ? hl.i0 : hl.j0) + a });
            run = -1;
          }
        }
      }
    }
  }

  // open walls (as doorways) or racking until every cell can be reached from the arrival point
  connectAll() {
    const n = this.n, mid = (n / 2) | 0;
    for (let guard = 0; guard < n * n; guard++) {
      const d = this.cellDistances(this.cx(mid), this.cx(mid));
      let fixed = false;
      for (let c = 0; c < n * n && !fixed; c++) {
        if (d[c] >= 0) continue;
        const i = c % n, j = (c / n) | 0;
        for (let dir = 0; dir < 4 && !fixed; dir++) {
          const ni = i + (dir === 0 ? 1 : dir === 1 ? -1 : 0), nj = j + (dir === 2 ? 1 : dir === 3 ? -1 : 0);
          if (ni < 0 || nj < 0 || ni >= n || nj >= n || d[nj * n + ni] < 0) continue;
          const arr = dir < 2 ? this.v : this.h;
          const k = dir === 0 ? this.vIdx(i + 1, j) : dir === 1 ? this.vIdx(i, j) : dir === 2 ? this.hIdx(i, j + 1) : this.hIdx(i, j);
          arr[k] = arr[k] === 1 ? 2 : 0;
          fixed = true;
        }
      }
      if (!fixed) return;
    }
  }

  // ---- colliders -------------------------------------------------------------------------
  buildBoxes() {
    const n = this.n, C = this.cell, H = this.ceiling, t = this.wallT, half = this.half, th = this.theme;
    const boxes = (this.boxes = []);
    this.wallBoxes = [];
    this.doorways = [];
    const door = this.doorWidth(), lintel = th.lintel || Math.min(2.15, H - 0.35);
    const wallMat = th.wallMat || 'drywall';
    const wall = (x0, z0, x1, z1, kind = 'wall', y0 = 0, y1 = H, material = wallMat) => {
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
          wall(x - t / 2, -half + run * C - t / 2, x + t / 2, -half + j * C + t / 2, 'wall', 0, H, boundary ? 'concrete' : wallMat);
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
          wall(-half + run * C - t / 2, z - t / 2, -half + i * C + t / 2, z + t / 2, 'wall', 0, H, boundary ? 'concrete' : wallMat);
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
    const p = th.pillarR || 0.24;
    for (const [i, j] of this.pillarSpots) {
      const x = -half + i * C, z = -half + j * C;
      this.pillars.push({ x, z });
      boxes.push(Lab.boxDef(x, H / 2, z, p * 2, H, p * 2, 'pillar', th.pillarMat || 'concrete'));
    }
    if (th.rack) this.buildRackBoxes();
    // ceiling slab (grenades bounce off it, bullets puff on it)
    boxes.push(Lab.boxDef(0, H + 0.15, 0, this.size + 1, 0.3, this.size + 1, 'ceiling', 'ceiling'));
  }

  doorWidth() { return this.theme.door || Math.min(1.25, this.cell * 0.42); }

  // pallet racking: one collider per straight run (loaded racks are solid to the top pallets;
  // 'goods' stop most rounds). Runs on grid lines stand centred on the line; wall racks stand
  // against a wall inside the row of cells next to it.
  buildRackBoxes() {
    const n = this.n, C = this.cell, half = this.half, t = this.wallT, rk = this.theme.rack;
    this.racks = [];
    const add = (alongX, a0, a1, c, depth) => {
      // uprights from a0 to a1; the collider includes the end guards
      const L = a1 - a0 + 0.2, m = (a0 + a1) / 2;
      const box = alongX ? Lab.boxDef(m, rk.height / 2, c, L, rk.height, depth, 'prop', 'goods') : Lab.boxDef(c, rk.height / 2, m, depth, rk.height, L, 'prop', 'goods');
      this.boxes.push(box);
      this.racks.push({ alongX, a0, a1, c, depth, height: rk.height, box });
    };
    const inset = 0.42;
    for (let j = 1; j < n; j++) {
      let run = -1;
      for (let i = 0; i <= n; i++) {
        const r = i < n && this.h[this.hIdx(i, j)] === 3;
        if (r && run < 0) run = i;
        if (!r && run >= 0) { add(true, -half + run * C + inset, -half + i * C - inset, -half + j * C, rk.depth); run = -1; }
      }
    }
    for (let i = 1; i < n; i++) {
      let run = -1;
      for (let j = 0; j <= n; j++) {
        const r = j < n && this.v[this.vIdx(i, j)] === 3;
        if (r && run < 0) run = j;
        if (!r && run >= 0) { add(false, -half + run * C + inset, -half + j * C - inset, -half + i * C, rk.depth); run = -1; }
      }
    }
    // single-sided racks against walls: shallower, back to the wall
    const d1 = rk.depth - 0.1;
    for (const w of this.wallRacks || []) {
      const c = -half + w.line * C + w.side * (t / 2 + 0.04 + d1 / 2);
      add(w.alongX, -half + w.from * C + inset, -half + w.to * C - inset, c, d1);
      this.racks[this.racks.length - 1].wallSide = w.side;
    }
  }

  wallOpen(i, j, dir) {
    // is the edge of cell (i,j) in direction dir (0:+x 1:-x 2:+z 3:-z) passable?
    const val = this.edgeVal(i, j, dir);
    return val !== 1 && val !== 3;
  }

  // raw edge value of cell (i,j) in direction dir: 0 open, 1 wall, 2 doorway, 3 racking
  edgeVal(i, j, dir) {
    return dir === 0 ? this.v[this.vIdx(i + 1, j)] : dir === 1 ? this.v[this.vIdx(i, j)] : dir === 2 ? this.h[this.hIdx(i, j + 1)] : this.h[this.hIdx(i, j)];
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

  // ---- warehouse stock ---------------------------------------------------------------------
  // a prop made of the def's collider boxes (or one box of its footprint) turned by a quarter-
  // turn yaw; refused when it would leave the building, stand in floor that is kept clear or
  // overlap anything already placed
  addProp(kind, x, z, yaw, over = null, pad = 0.05) {
    const def = over ? { ...PROP_DEFS[kind], ...over } : PROP_DEFS[kind];
    const c = Math.cos(yaw), s = Math.sin(yaw), ac = Math.abs(c), as = Math.abs(s);
    const lim = this.half - this.wallT / 2;
    const boxes = [];
    for (const [w, d, h, ox, oz, y0 = 0, mat] of def.boxes || [[def.w, def.d, def.h, 0, 0, 0]]) {
      const b = Lab.boxDef(x + ox * c + oz * s, y0 + h / 2, z - ox * s + oz * c, w * ac + d * as, h, w * as + d * ac, 'prop', mat || def.material);
      if (b.min.x < -lim || b.max.x > lim || b.min.z < -lim || b.max.z > lim) return null;
      for (const [x0, z0, x1, z1] of this.keep || []) if (b.min.x < x1 && b.max.x > x0 && b.min.z < z1 && b.max.z > z0) return null;
      for (const o of this.boxes) {
        if (o.kind === 'ceiling') continue;
        if (b.min.x < o.max.x + pad && b.max.x > o.min.x - pad && b.min.z < o.max.z + pad && b.max.z > o.min.z - pad && b.min.y < o.max.y && b.max.y > o.min.y) return null;
      }
      boxes.push(b);
    }
    const p = { kind, x, z, yaw, def, box: boxes[0], boxes, seed: (this.rng() * 1e9) | 0 };
    for (const b of boxes) this.boxes.push(b);
    this.props.push(p);
    return p;
  }

  placeWarehouseProps() {
    const n = this.n, mid = (n / 2) | 0, C = this.cell;
    this.props = this.racks.map((r) => ({ kind: 'rack', x: (r.box.min.x + r.box.max.x) / 2, z: (r.box.min.z + r.box.max.z) / 2, yaw: 0, def: null, box: r.box, boxes: [r.box], rack: r }));
    // floor kept clear of stock ([x0, z0, x1, z1]): the approach to each roller door and open
    // bay between halls, so no doorway opens onto a wall of pallets
    const keep = (this.keep = []);
    const a = this.doorWidth() / 2 + 0.35, b = 2.2;
    for (const d of this.doorways) keep.push(d.axis === 'x' ? [d.x - b, d.z - a, d.x + b, d.z + a] : [d.x - a, d.z - b, d.x + a, d.z + b]);
    for (const [alongZ, line, k] of this.dividers) {
      if ((alongZ ? this.v[this.vIdx(line, k)] : this.h[this.hIdx(k, line)]) !== 0) continue;
      const p = -this.half + line * C, q0 = -this.half + k * C + 0.3, q1 = q0 + C - 0.6;
      keep.push(alongZ ? [p - 1.6, q0, p + 1.6, q1] : [q0, p - 1.6, q1, p + 1.6]);
    }
    // the loading-dock doors first: they claim their stretch of outside wall and an apron
    this.placeDockDoors();
    for (const hl of this.halls)
      for (let j = hl.j0; j < hl.j0 + hl.d; j++)
        for (let i = hl.i0; i < hl.i0 + hl.w; i++) {
          if (Math.abs(i - mid) <= 1 && Math.abs(j - mid) <= 1) continue; // the arrival floor stays clear
          if (hl.type === 'racks') this.stockAisle(hl, i, j);
          else if (hl.type === 'bulk') this.stockBulk(i, j);
          else this.stockDock(i, j);
        }
    for (const hl of this.halls) if (hl.type !== 'racks') this.placeBreakCorner(hl);
  }

  // somebody's corner against a wall: vending machines, a packing bench, a bin
  placeBreakCorner(hl) {
    const R = this.rng, C = this.cell, t = this.wallT, n = this.n, mid = (n / 2) | 0;
    const spots = [];
    for (let j = hl.j0; j < hl.j0 + hl.d; j++)
      for (let i = hl.i0; i < hl.i0 + hl.w; i++) {
        if (Math.abs(i - mid) <= 1 && Math.abs(j - mid) <= 1) continue;
        for (let d = 0; d < 4; d++) if (this.edgeVal(i, j, d) === 1) spots.push([i, j, d]);
      }
    for (let tries = 0; tries < 6 && spots.length; tries++) {
      const [i, j, d] = spots[Math.floor(R() * spots.length)];
      const cx = this.cx(i), cz = this.cx(j);
      // along the wall (unit vector) and into the room
      const ax = d < 2 ? 0 : 1, az = d < 2 ? 1 : 0, nx = d === 0 ? -1 : d === 1 ? 1 : 0, nz = d === 2 ? -1 : d === 3 ? 1 : 0;
      const yaw = d === 0 ? -Math.PI / 2 : d === 1 ? Math.PI / 2 : d === 2 ? Math.PI : 0;
      const at = (along, kind) => {
        const off = C / 2 - t / 2 - PROP_DEFS[kind].d / 2 - 0.07;
        return [cx - nx * off + ax * along, cz - nz * off + az * along];
      };
      const [vx, vz] = at(-1.5, 'vending');
      if (!this.addProp('vending', vx, vz, yaw)) continue;
      if (R() < 0.5) { const [x2, z2] = at(-0.55, 'vending'); this.addProp('vending', x2, z2, yaw); }
      const [bx, bz] = at(0.9, 'bench');
      this.addProp('bench', bx, bz, yaw);
      const [ix, iz] = at(2.1, 'bin');
      if (R() < 0.7) this.addProp('bin', ix, iz, yaw);
      return;
    }
  }

  // racking aisles: the odd load, pallet stack or jack left against a rack face, forklifts
  // parked in the cross-aisles
  stockAisle(hl, i, j) {
    const R = this.rng, C = this.cell, cx = this.cx(i), cz = this.cx(j), Q = Math.PI / 2;
    const a = hl.alongX ? i - hl.i0 : j - hl.j0;
    const yawAlong = hl.alongX ? 0 : Q; // a prop's width (local x) along the aisle
    if (hl.cross.has(a)) {
      // a forklift's length (local z) runs along the cross-aisle
      if (R() < 0.14) this.addProp('forklift', cx + (R() - 0.5) * 0.6, cz + (R() - 0.5) * 0.6, yawAlong + (R() < 0.5 ? Math.PI : 0));
      else if (R() < 0.12) {
        const kind = R() < 0.5 ? 'pallets' : 'load';
        this.addProp(kind, cx + (R() - 0.5) * 1.6, cz + (R() - 0.5) * 1.6, yawAlong + Q, this.loadSize(kind));
      }
      return;
    }
    if (R() > 0.22) return;
    const kind = ['load', 'load', 'pallets', 'cartons', 'jack', 'drums', 'load'][Math.floor(R() * 7)];
    const over = this.loadSize(kind), def = { ...PROP_DEFS[kind], ...over };
    // against one rack face, leaving the middle of the aisle clear (a jack lies lengthways)
    const face = (C - this.theme.rack.depth) / 2, depth = kind === 'jack' ? def.w : def.d;
    const off = (R() < 0.5 ? -1 : 1) * (face - depth / 2 - 0.1), along = (R() - 0.5) * 2.4;
    const yaw = kind === 'jack' ? yawAlong + Q : yawAlong + (R() < 0.5 ? Math.PI : 0);
    this.addProp(kind, hl.alongX ? cx + along : cx + off, hl.alongX ? cz + off : cz + along, yaw, over);
  }

  // bulk storage: block stacks of pallet loads with lanes between them
  stockBulk(i, j) {
    const R = this.rng, cx = this.cx(i), cz = this.cx(j), Q = Math.PI / 2;
    const r = R();
    if (r < 0.72) {
      const [w, d] = [[2.5, 2.1], [2.5, 1.05], [1.25, 2.1], [2.5, 2.1]][Math.floor(R() * 4)];
      const tiers = R() < 0.65 ? 2 : 1;
      this.addProp('stack', cx + (R() - 0.5) * 0.4, cz + (R() - 0.5) * 0.4, R() < 0.5 ? 0 : Q, { w, d, h: tiers * 1.3, tiers });
    } else if (r < 0.86) this.addProp('pallets', cx + (R() - 0.5) * 1.2, cz + (R() - 0.5) * 1.2, Math.floor(R() * 4) * Q, this.loadSize('pallets'));
    else if (r < 0.92) this.addProp('jack', cx + (R() - 0.5) * 1.2, cz + (R() - 0.5) * 1.2, Math.floor(R() * 4) * Q);
  }

  // dock floor: forklifts, staged loads, pallets, drums and cones on open concrete
  stockDock(i, j) {
    const R = this.rng, cx = this.cx(i), cz = this.cx(j), Q = Math.PI / 2;
    const yaw = () => Math.floor(R() * 4) * Q;
    const r = R();
    if (r > 0.52) return;
    if (r < 0.08) this.addProp('forklift', cx + (R() - 0.5) * 0.6, cz + (R() - 0.5) * 0.6, yaw());
    else if (r > 0.42) {
      // a staging lane: loads and a pallet stack in a line
      const alongX = R() < 0.5;
      for (let m = -1; m <= 1; m++) {
        const o = m * 1.35, kind = R() < 0.75 ? 'load' : 'pallets';
        this.addProp(kind, cx + (alongX ? o : 0), cz + (alongX ? 0 : o), alongX ? 0 : Q, this.loadSize(kind));
      }
    } else if (r < 0.19) {
      // a short row of staged loads
      const k = 1 + Math.floor(R() * 3), alongX = R() < 0.5;
      for (let m = 0; m < k; m++) {
        const o = (m - (k - 1) / 2) * 1.3;
        this.addProp('load', cx + (alongX ? o : 0), cz + (alongX ? 0 : o), alongX ? 0 : Q, this.loadSize('load'));
      }
    } else if (r < 0.26) this.addProp('pallets', cx + (R() - 0.5) * 1.4, cz + (R() - 0.5) * 1.4, yaw(), this.loadSize('pallets'));
    else if (r < 0.31) this.addProp('drums', cx + (R() - 0.5) * 1.4, cz + (R() - 0.5) * 1.4, yaw());
    else if (r < 0.35) this.addProp('cartons', cx + (R() - 0.5) * 1.4, cz + (R() - 0.5) * 1.4, yaw(), this.loadSize('cartons'));
    else if (r < 0.38) this.addProp('jack', cx + (R() - 0.5) * 1.4, cz + (R() - 0.5) * 1.4, yaw());
    else if (r < 0.40) this.addProp(R() < 0.5 ? 'crate' : 'barrel', cx + (R() - 0.5) * 1.4, cz + (R() - 0.5) * 1.4, yaw());
    else {
      const k = 2 + Math.floor(R() * 3);
      for (let m = 0; m < k; m++) this.addProp('cone', cx + (R() - 0.5) * 2.4, cz + (R() - 0.5) * 2.4, 0);
    }
  }

  // per-instance heights for stock that comes in different sizes
  loadSize(kind) {
    const R = this.rng;
    if (kind === 'pallets') { const k = 1 + Math.floor(R() * 6); return { h: k * 0.145, count: k }; }
    if (kind === 'load') return { h: 1.2 + R() * 0.45 };
    if (kind === 'cartons') return { h: 0.7 + R() * 0.6 };
    return null;
  }

  // closed loading-dock doors along the outside walls of the open halls, with bollards
  placeDockDoors() {
    const n = this.n, half = this.half, t = this.wallT, R = this.rng;
    this.dockDoors = [];
    for (const hl of this.halls) {
      if (hl.type === 'racks') continue;
      const sides = [];
      if (hl.j0 === 0) sides.push([0, 1, (k) => [hl.i0 + k, 0], hl.w]);
      if (hl.j0 + hl.d === n) sides.push([0, -1, (k) => [hl.i0 + k, n - 1], hl.w]);
      if (hl.i0 === 0) sides.push([1, 0, (k) => [0, hl.j0 + k], hl.d]);
      if (hl.i0 + hl.w === n) sides.push([-1, 0, (k) => [n - 1, hl.j0 + k], hl.d]);
      for (const [nx, nz, cell, len] of sides)
        for (let k = 1; k < len - 1; k += 2) {
          if (R() < 0.3) continue;
          const [i, j] = cell(k);
          // the door sits on the outside wall at the middle of this cell's edge
          const x = nx ? -nx * half + nx * (t / 2) : this.cx(i), z = nz ? -nz * half + nz * (t / 2) : this.cx(j);
          for (const s of [-1, 1]) this.addProp('bollard', x + nx * 0.4 + (nz ? s * 1.85 : 0), z + nz * 0.4 + (nx ? s * 1.85 : 0), 0);
          this.dockDoors.push({ x, z, nx, nz, num: this.dockDoors.length + 1 });
          // an apron in front of the door stays clear (no vending machine parked across it)
          const x2 = x + nx * 1.8, z2 = z + nz * 1.8;
          if (this.keep) this.keep.push(nx ? [Math.min(x, x2), z - 2.05, Math.max(x, x2), z + 2.05] : [x - 2.05, Math.min(z, z2), x + 2.05, Math.max(z, z2)]);
        }
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
    const open = (val === 2 ? this.doorWidth() / 2 : this.cell / 2 - 0.3) - r - 0.05;
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
