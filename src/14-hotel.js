// Level 5: the hotel. Double-loaded corridors of numbered guest rooms on a five-cell rhythm (a
// corridor, two rooms deep, two rooms deep, the next corridor), cross corridors linking them, an
// elevator lobby at the arrival point, a ballroom with chandeliers and round tables, a lounge
// with a bar, ice alcoves. Most guest rooms are closed: their cells are solid ('void' colliders
// behind a numbered door), so the walkable plan is the corridors, the open rooms and the halls,
// and every walkable cell is reachable. The layout and its colliders extend BackroomsLevel here;
// HotelDressing builds the look (geometry merged by material per 4 x 4-cell chunk, like the
// warehouse), and HOTEL_GLSL is the wallpaper, carpet and plaster for the shared lattice shaders.

// what each cell of the hotel is (level.area)
const HOTEL_AREA = { VOID: 0, HALL: 1, ROOM: 2, LOBBY: 3, BALL: 4, LOUNGE: 5, ALCOVE: 6, DANCE: 7 };
// which lamp a cell's fixture is (level.lampKind; 0: the cell has no fixture)
const HOTEL_LAMP = { NONE: 0, BOWL: 1, CHANDELIER: 2, ROOM: 3, PENDANT: 4 };

// hotel furniture (front is local +z; backs stand against walls). Multi-box defs are
// [w, d, h, x, z, y0, material] in prop space, as for the warehouse
Object.assign(PROP_DEFS, {
  hcart: { w: 1.25, d: 0.56, h: 1.12, material: 'fabric' },   // housekeeping cart: linen, bins, caddy
  trolley: { w: 0.92, d: 0.6, h: 0.98, material: 'wood' },    // room-service trolley: cloth, cloches
  console: { w: 1.2, d: 0.4, h: 0.8, material: 'wood', boxes: [[1.2, 0.4, 0.8, 0, 0, 0], [0.3, 0.3, 0.52, -0.34, 0, 0.8, 'fabric']] },
  plant: { w: 0.5, d: 0.5, h: 0.62, material: 'concrete' },   // the pot; the fronds above are not solid
  bed: { w: 1.6, d: 2.08, h: 0.62, material: 'fabric', boxes: [[1.6, 1.98, 0.62, 0, 0.05, 0], [1.72, 0.1, 1.25, 0, -0.99, 0, 'wood']] },
  bed1: { w: 1.0, d: 2.04, h: 0.6, material: 'fabric', boxes: [[1.0, 1.94, 0.6, 0, 0.05, 0], [1.08, 0.1, 1.1, 0, -0.97, 0, 'wood']] },
  nightstand: { w: 0.48, d: 0.42, h: 0.58, material: 'wood', boxes: [[0.48, 0.42, 0.58, 0, 0, 0], [0.3, 0.3, 0.5, 0, 0, 0.58, 'fabric']] },
  dresser: { w: 1.3, d: 0.5, h: 0.82, material: 'wood', boxes: [[1.3, 0.5, 0.82, 0, 0, 0], [0.62, 0.46, 0.5, 0.25, -0.01, 0.82, 'metal']] },
  wardrobe: { w: 1.0, d: 0.6, h: 2.05, material: 'wood' },
  armchair: { w: 0.82, d: 0.8, h: 0.95, material: 'fabric' },
  settee: { w: 1.9, d: 0.85, h: 0.85, material: 'fabric' },
  lowtable: { w: 1.1, d: 0.6, h: 0.42, material: 'wood' },
  luggage: { w: 1.05, d: 0.62, h: 0.98, material: 'fabric', boxes: [[1.05, 0.62, 0.36, 0, 0, 0, 'metal'], [0.92, 0.5, 0.62, 0, 0, 0.36]] },
  suitcase: { w: 0.7, d: 0.3, h: 0.52, material: 'fabric' },
  // banquet round table (a cross of two boxes follows the round top) and its chairs
  rtable: { w: 1.5, d: 1.5, h: 0.76, material: 'wood', boxes: [[1.5, 0.9, 0.76, 0, 0, 0], [0.9, 1.5, 0.76, 0, 0, 0]] },
  bchair: { w: 0.44, d: 0.44, h: 0.95, material: 'wood', boxes: [[0.44, 0.44, 0.47, 0, 0, 0], [0.44, 0.07, 0.48, 0, -0.185, 0.47]] },
  fallenchair: { w: 0.48, d: 0.95, h: 0.46, material: 'wood' },
  piano: { w: 1.5, d: 1.95, h: 1.0, material: 'wood', boxes: [[1.5, 1.15, 1.0, 0, 0.4, 0], [0.95, 0.8, 1.0, -0.27, -0.57, 0], [0.55, 0.55, 1.0, 0.475, -0.45, 0]] },
  buffet: { w: 2.2, d: 0.78, h: 0.78, material: 'wood' },
  bar: { w: 3.0, d: 0.68, h: 1.1, material: 'wood' },
  backbar: { w: 3.0, d: 0.4, h: 2.1, material: 'wood' },
  stool: { w: 0.4, d: 0.4, h: 0.78, material: 'metal' },
  icemachine: { w: 0.78, d: 0.72, h: 1.65, material: 'metal' },
  lbench: { w: 1.5, d: 0.52, h: 0.48, material: 'fabric' },
  urn: { w: 0.3, d: 0.3, h: 0.72, material: 'metal' },        // sand-topped ashtray by the elevators
});

Object.assign(BackroomsLevel.prototype, {
  // ---- plan ----------------------------------------------------------------------------------
  // Planned in abstract (a, b) cells with corridors running along a; the plan is turned a quarter
  // when `flip` (a runs along z then), so the same code makes both orientations.
  generateHotel() {
    const n = this.n, R = this.rng, mid = (n / 2) | 0, A = HOTEL_AREA, LK = HOTEL_LAMP;
    const flip = (this.hotelFlip = R() < 0.5);
    const at = (a, b) => (flip ? a * n + b : b * n + a);
    const ok = (a, b) => a >= 0 && b >= 0 && a < n && b < n;
    const area = (this.area = new Uint8Array(n * n));
    const owner = (this.owner = new Int32Array(n * n).fill(-1));
    const lamp = (this.lampKind = new Uint8Array(n * n));
    const spaces = (this.spaces = []); // rooms, the lobby, the ballroom, lounges, alcoves
    const entrances = (this.entrances = new Map()); // "c1:c2" (c1 < c2) -> 'ball' | 'lounge'
    const shaft = new Uint8Array(n * n);
    const ekey = (c1, c2) => Math.min(c1, c2) + ':' + Math.max(c1, c2);
    const space = (type, extra = {}) => { const s = { type, cells: [], id: spaces.length, ...extra }; spaces.push(s); return s; };
    const claim = (s, a, b, kind) => { const c = at(a, b); area[c] = kind; owner[c] = s.id; s.cells.push(c); return c; };
    const free = (a, b) => ok(a, b) && area[at(a, b)] === A.VOID && !shaft[at(a, b)];
    this.floorNo = this.depth;
    this.rooms = [];
    this.pillarSpots = [];

    // corridors every five rows, one of them through the arrival point
    const rows = (this.hotelRows = []);
    for (let b = mid % 5; b < n; b += 5) rows.push(b);
    for (const b of rows) for (let a = 0; a < n; a++) area[at(a, b)] = A.HALL;
    // the elevator lobby: the 3 x 3 cells round the arrival point, the shafts behind its walls
    const lobby = space('lobby');
    for (let b = mid - 1; b <= mid + 1; b++) for (let a = mid - 1; a <= mid + 1; a++) claim(lobby, a, b, A.LOBBY);
    for (let a = mid - 1; a <= mid + 1; a++) for (const b of [mid - 2, mid + 2]) shaft[at(a, b)] = 1;
    // cross corridors: two or three spines through every block, one either side of the lobby,
    // and the odd extra link within a block
    const spines = [];
    const spineOk = (a) => a >= 1 && a <= n - 2 && Math.abs(a - mid) > 2 && spines.every((s) => Math.abs(s - a) >= 4);
    for (const [lo, hi] of [[1, mid - 3], [mid + 3, n - 2]]) {
      for (let t = 0; t < 20; t++) { const a = lo + Math.floor(R() * (hi - lo + 1)); if (spineOk(a)) { spines.push(a); break; } }
    }
    if (n >= 24) for (let t = 0; t < 20; t++) { const a = 1 + Math.floor(R() * (n - 2)); if (spineOk(a)) { spines.push(a); break; } }
    const blocks = [];
    for (let k = 0; k + 1 < rows.length; k++) blocks.push([rows[k], rows[k + 1]]);
    // the ballroom fills a whole block away from the lobby; a spine through it becomes an aisle
    const ballBlocks = blocks.filter(([ra, rb]) => rb - ra === 5 && ra !== mid && rb !== mid);
    let ball = null;
    if (ballBlocks.length) {
      const [ra, rb] = ballBlocks[Math.floor(R() * ballBlocks.length)];
      const W = 6, a0 = Math.floor(R() * (n - W + 1));
      ball = space('ball', { a0, b0: ra + 1, w: W, d: 4, ra, rb });
      for (let b = ra + 1; b < rb; b++)
        for (let a = a0; a < a0 + W; a++) {
          const dance = (a === a0 + 2 || a === a0 + 3) && (b === ra + 2 || b === ra + 3);
          claim(ball, a, b, dance ? A.DANCE : A.BALL);
        }
      // entrances from both corridors: wherever a spine meets it, and one more if none did
      for (const r of [ra, rb]) {
        const inner = r === ra ? ra + 1 : rb - 1;
        const cols = spines.filter((s) => s >= a0 && s < a0 + W);
        if (!cols.length) cols.push(a0 + 1 + Math.floor(R() * (W - 2)));
        for (const a of cols) entrances.set(ekey(at(a, r), at(a, inner)), 'ball');
      }
      // a colonnade one cell in from the long walls
      for (const a of [a0 + 1, a0 + W - 1]) for (const b of [ra + 2, ra + 4]) this.pillarSpots.push(flip ? [b, a] : [a, b]);
      for (const a of [a0 + 1, a0 + 3, a0 + 5]) for (const b of [ra + 1, ra + 3]) lamp[at(a, b)] = LK.CHANDELIER;
    }
    for (const [ra, rb] of blocks)
      for (const a of spines) for (let b = ra + 1; b < rb; b++) if (free(a, b)) area[at(a, b)] = A.HALL;
    for (const [ra, rb] of blocks) {
      if (R() > 0.55) continue;
      for (let t = 0; t < 12; t++) {
        const a = 1 + Math.floor(R() * (n - 2));
        if (Math.abs(a - mid) <= 2 || spines.some((s) => Math.abs(s - a) < 3)) continue;
        let clear = true;
        for (let b = ra + 1; b < rb; b++) if (!free(a, b)) clear = false;
        if (!clear) continue;
        for (let b = ra + 1; b < rb; b++) area[at(a, b)] = A.HALL;
        break;
      }
    }
    // lounges: two rows deep off a corridor, open to it through one or two archways
    const nLounge = n >= 26 ? 2 : 1;
    for (let k = 0, t = 0; k < nLounge && t < 60; t++) {
      const r = rows[Math.floor(R() * rows.length)], s = R() < 0.5 ? -1 : 1, L = 3 + (R() < 0.5 ? 1 : 0);
      const a0 = Math.floor(R() * (n - L + 1));
      let clear = true;
      for (let a = a0; a < a0 + L; a++) for (const d of [1, 2]) if (!free(a, r + s * d) || area[at(a, r)] !== A.HALL) clear = false;
      if (!clear) continue;
      const lg = space('lounge', { a0, r, s, w: L });
      for (let a = a0; a < a0 + L; a++) for (const d of [1, 2]) claim(lg, a, r + s * d, A.LOUNGE);
      const m = a0 + Math.floor((L - 1) / 2);
      for (const a of L === 4 ? [m, m + 1] : [m]) entrances.set(ekey(at(a, r), at(a, r + s)), 'lounge');
      for (let a = a0; a < a0 + L; a++) lamp[at(a, r + s)] = lamp[at(a, r + 2 * s)] = LK.PENDANT;
      k++;
    }
    // ice alcoves: one cell off a corridor
    for (let k = 0, t = 0; k < 3 && t < 80; t++) {
      const r = rows[Math.floor(R() * rows.length)], s = R() < 0.5 ? -1 : 1, a = Math.floor(R() * n);
      if (!free(a, r + s) || area[at(a, r)] !== A.HALL || Math.abs(a - mid) <= 2) continue;
      if (spaces.some((sp) => sp.type === 'alcove' && Math.abs(sp.a - a) < 5)) continue;
      const al = space('alcove', { a, r, s });
      claim(al, a, r + s, A.ALCOVE);
      lamp[at(a, r + s)] = LK.BOWL;
      k++;
    }
    // guest rooms on both sides of every corridor, one cell wide and up to two deep; now and
    // then a suite two cells wide. Most are closed (solid behind their door).
    rows.forEach((r, k) => {
      for (const s of [-1, 1])
        for (let a = 0; a < n; a++) {
          if (!free(a, r + s) || area[at(a, r)] !== A.HALL) continue;
          // two deep where the plan allows (corridors are five rows apart: the next two rows
          // belong to the corridor beyond, and are claimed when its turn comes)
          const depth = free(a, r + 2 * s) ? 2 : 1;
          const suite = depth === 2 && R() < 0.12 && free(a + 1, r + s) && free(a + 1, r + 2 * s) && area[at(a + 1, r)] === A.HALL;
          const open = R() < (suite ? 0.5 : 0.24);
          const doorA = suite && R() < 0.5 ? a + 1 : a;
          const num = `${this.floorNo}${k + 1}${String(2 * doorA + (s < 0 ? 1 : 2)).padStart(2, '0')}`;
          const rm = space('room', { open, num, suite, depth, s });
          for (const aa of suite ? [a, a + 1] : [a])
            for (let d = 1; d <= depth; d++) {
              const c = at(aa, r + s * d);
              owner[c] = rm.id;
              rm.cells.push(c);
              if (open) area[c] = A.ROOM;
            }
          rm.door = { room: at(doorA, r + s), hall: at(doorA, r) };
          rm.inner = at(doorA, r + s * depth);
          if (suite) rm.other = at(doorA === a ? a + 1 : a, r + s);
          if (open) for (const c of rm.cells) lamp[c] = LK.ROOM;
          if (suite) a++;
        }
    });
    // ceiling lamps over every other corridor cell (pools of light with sconce-lit stretches
    // between), and over the lobby
    for (let c = 0; c < n * n; c++) {
      const i = c % n, j = (c / n) | 0;
      if (area[c] === A.HALL && (i + j) % 2 === 0) lamp[c] = LK.BOWL;
      if (area[c] === A.LOBBY) lamp[c] = c === mid * n + mid ? LK.CHANDELIER : LK.BOWL;
    }
    this.hotelEdges();
    // whatever cannot be reached from the arrival point is shut (rooms close their door)
    for (let guard = 0; guard < 8; guard++) {
      const d = this.cellDistances(this.cx(mid), this.cx(mid));
      let changed = false;
      for (let c = 0; c < n * n; c++) {
        if (area[c] === A.VOID || d[c] >= 0) continue;
        const sp = spaces[owner[c]];
        if (sp && sp.type === 'room') { sp.open = false; for (const rc of sp.cells) area[rc] = A.VOID; }
        else area[c] = A.VOID;
        lamp[c] = LK.NONE;
        changed = true;
      }
      if (!changed) break;
      this.hotelEdges();
    }
    this.hotelDoors();
  },

  // walls from the plan: open inside a space and along corridors, doorways into open rooms,
  // grand openings into the ballroom and lounges, walls everywhere else
  hotelEdges() {
    const n = this.n, A = HOTEL_AREA, area = this.area, owner = this.owner, sp = this.spaces;
    const V = (this.v = new Uint8Array((n + 1) * n).fill(1));
    const H = (this.h = new Uint8Array(n * (n + 1)).fill(1));
    const edge = (c1, c2) => {
      const a1 = area[c1], a2 = area[c2];
      // between two closed cells no wall: the solid 'void' boxes fill them (a wall there would
      // only be another hidden collider and hidden triangles); nothing walkable reaches them
      if (!a1 && !a2) return 0;
      if (!a1 || !a2) return 1;
      if (owner[c1] >= 0 && owner[c1] === owner[c2]) return 0;
      const h1 = a1 === A.HALL, h2 = a2 === A.HALL;
      if (h1 && h2) return 0;
      if (!h1 && !h2) return 1;
      const oc = h1 ? c2 : c1, hc = h1 ? c1 : c2, other = area[oc];
      if (other === A.LOBBY || other === A.ALCOVE) return 0;
      if (other === A.ROOM) { const rm = sp[owner[oc]]; return rm.door.room === oc && rm.door.hall === hc ? 2 : 1; }
      return this.entrances.has(Math.min(c1, c2) + ':' + Math.max(c1, c2)) ? 0 : 1;
    };
    for (let j = 0; j < n; j++) for (let i = 1; i < n; i++) V[this.vIdx(i, j)] = edge(j * n + i - 1, j * n + i);
    for (let j = 1; j < n; j++) for (let i = 0; i < n; i++) H[this.hIdx(i, j)] = edge((j - 1) * n + i, j * n + i);
  },

  // doors drawn on the walls: guest rooms (closed or open), elevators
  hotelDoors() {
    const n = this.n, A = HOTEL_AREA;
    // dir from cell a to its neighbour b: 0 +x, 1 -x, 2 +z, 3 -z
    const dirOf = (a, b) => (b === a + 1 ? 0 : b === a - 1 ? 1 : b === a + n ? 2 : 3);
    this.guestDoors = [];
    for (const rm of this.spaces) {
      if (rm.type !== 'room' || !rm.door) continue;
      const { room, hall } = rm.door;
      if (this.area[hall] !== A.HALL) continue;
      this.guestDoors.push({ hall, room, dir: dirOf(hall, room), open: rm.open, num: rm.num, rm });
    }
    this.elevators = [];
    for (let c = 0; c < n * n; c++) {
      if (this.area[c] !== A.LOBBY) continue;
      const i = c % n, j = (c / n) | 0;
      for (let d = 0; d < 4; d++) {
        const ni = i + (d === 0 ? 1 : d === 1 ? -1 : 0), nj = j + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (ni < 0 || nj < 0 || ni >= n || nj >= n || this.area[nj * n + ni] !== A.VOID || this.edgeVal(i, j, d) !== 1) continue;
        // the shafts are straight behind the lobby's front and back walls
        const mid = (n / 2) | 0, ok = this.hotelFlip ? Math.abs(i - mid) === 1 && d < 2 : Math.abs(j - mid) === 1 && d >= 2;
        if (ok) this.elevators.push({ cell: c, dir: d, k: this.elevators.length });
      }
    }
  },

  // ---- colliders and furniture -----------------------------------------------------------------
  placeHotelProps() {
    const n = this.n, C = this.cell, H = this.ceiling, t = this.wallT, half = this.half, A = HOTEL_AREA, R = this.rng;
    const mid = (n / 2) | 0;
    this.props = [];
    this.keep = null;
    // closed rooms and shafts are solid: one box per run of void cells along x, carried on down
    // the rows below while they are void over the same run (few, large boxes: every collider is
    // a static body the physics touches each substep)
    const used = new Uint8Array(n * n);
    const voidAt = (i, j) => this.area[j * n + i] === A.VOID && !used[j * n + i];
    for (let j = 0; j < n; j++) {
      let run = -1;
      for (let i = 0; i <= n; i++) {
        const v = i < n && voidAt(i, j);
        if (v && run < 0) run = i;
        if (!v && run >= 0) {
          let j1 = j + 1;
          for (; j1 < n; j1++) {
            let all = true;
            for (let k = run; k < i && all; k++) if (!voidAt(k, j1)) all = false;
            // (the run must end where the row below stops being void too, or that row's
            // remainder would be split into slivers)
            if (!all || (run > 0 && voidAt(run - 1, j1)) || (i < n && voidAt(i, j1))) break;
          }
          for (let jj = j; jj < j1; jj++) for (let k = run; k < i; k++) used[jj * n + k] = 1;
          const x0 = -half + run * C, x1 = -half + i * C, z0 = -half + j * C, z1 = -half + j1 * C;
          this.boxes.push(Lab.boxDef((x0 + x1) / 2, H / 2, (z0 + z1) / 2, x1 - x0, H, z1 - z0, 'void', 'concrete'));
          run = -1;
        }
      }
    }
    // grand openings: pilasters either side and a header over them; the ballroom's double doors
    // stand open against the pilasters
    this.grand = [];
    for (const [key, kind] of this.entrances) {
      const [c1, c2] = key.split(':').map(Number);
      const i1 = c1 % n, j1 = (c1 / n) | 0, i2 = c2 % n;
      const alongZ = i1 !== i2; // the opening is in a wall at constant x: it runs along z
      const ex = alongZ ? -half + Math.max(i1, i2) * C : this.cx(i1), ez = alongZ ? this.cx(j1) : -half + Math.max(j1, ((c2 / n) | 0)) * C;
      const inner = this.area[c1] === A.HALL ? c2 : c1, ic = this.cellCenter(inner);
      const nx = alongZ ? Math.sign(ic.x - ex) : 0, nz = alongZ ? 0 : Math.sign(ic.z - ez); // towards the hall's inside
      const pw = 0.34, pd = t + 0.16, span = C - t - 2 * pw, hy = kind === 'ball' ? 2.62 : 2.5;
      for (const s of [-1, 1]) {
        const o = s * (span / 2 + pw / 2);
        const bx = alongZ ? Lab.boxDef(ex, H / 2, ez + o, pd, H, pw, 'prop', 'drywall') : Lab.boxDef(ex + o, H / 2, ez, pw, H, pd, 'prop', 'drywall');
        this.boxes.push(bx);
        this.props.push({ kind: 'pilaster', x: bx.min.x / 2 + bx.max.x / 2, z: bx.min.z / 2 + bx.max.z / 2, yaw: 0, def: null, box: bx, boxes: [bx] });
      }
      // the header over the opening (overhead: free() and the minimap ignore it)
      const hd = alongZ ? Lab.boxDef(ex, (hy + H) / 2, ez, pd - 0.04, H - hy, span, 'prop', 'drywall') : Lab.boxDef(ex, (hy + H) / 2, ez, span, H - hy, pd - 0.04, 'prop', 'drywall');
      this.boxes.push(hd);
      const g = { kind, x: ex, z: ez, alongZ, nx, nz, span, hy, leaves: [] };
      this.grand.push(g);
      if (kind === 'ball') {
        // two leaves swung in against the pilasters' inner faces
        const lw = span / 2 - 0.02, lt = 0.06;
        for (const s of [-1, 1]) {
          const o = s * (span / 2 - lt / 2 - 0.01), dep = pd / 2 + 0.03 + lw / 2;
          const x = alongZ ? ex + nx * dep : ex + o, z = alongZ ? ez + o : ez + nz * dep;
          const b = alongZ ? Lab.boxDef(x, hy / 2 - 0.03, z, lw, hy - 0.06, lt, 'prop', 'wood') : Lab.boxDef(x, hy / 2 - 0.03, z, lt, hy - 0.06, lw, 'prop', 'wood');
          this.boxes.push(b);
          this.props.push({ kind: 'bleaf', x, z, yaw: 0, def: null, box: b, boxes: [b] });
          g.leaves.push({ x, z, s, box: b });
        }
      }
    }
    // open guest-room doors: the leaf stands open into the room beside the opening
    const door = this.doorWidth();
    for (const gd of this.guestDoors) {
      const rm = gd.rm;
      const hc = this.cellCenter(gd.hall), rc = this.cellCenter(gd.room);
      const ix = Math.sign(rc.x - hc.x), iz = Math.sign(rc.z - hc.z); // inwards
      const lx = -iz, lz = ix;                                            // lateral
      gd.hinge = R() < 0.5 ? -1 : 1;
      rm.frame = { ix, iz, lx, lz, x0: (hc.x + rc.x) / 2, z0: (hc.z + rc.z) / 2, hinge: gd.hinge };
      if (!gd.open) continue;
      const lw = door - 0.08, u = gd.hinge * (door / 2 + 0.035), w = t / 2 + 0.03 + lw / 2;
      const x = rm.frame.x0 + ix * w + lx * u, z = rm.frame.z0 + iz * w + lz * u;
      const b = Lab.boxDef(x, 1.08, z, Math.abs(ix) * lw + Math.abs(lx) * 0.05, 2.14, Math.abs(iz) * lw + Math.abs(lz) * 0.05, 'prop', 'wood');
      this.boxes.push(b);
      this.props.push({ kind: 'leaf', x, z, yaw: 0, def: null, box: b, boxes: [b] });
      gd.leaf = { x, z };
    }
    // floor kept clear: both sides of every doorway and grand opening, the elevator fronts and
    // the arrival cell
    const keep = (this.keep = []);
    const a = door / 2 + 0.35, b = 1.5;
    for (const d of this.doorways) keep.push(d.axis === 'x' ? [d.x - b, d.z - a, d.x + b, d.z + a] : [d.x - a, d.z - b, d.x + a, d.z + b]);
    // (the ballroom's open leaves stand 1.3 m into the room: keep a way round their ends too)
    for (const g of this.grand) {
      const s = C / 2 + (g.kind === 'ball' ? 0.75 : 0);
      keep.push(g.alongZ ? [g.x - 1.9, g.z - s, g.x + 1.9, g.z + s] : [g.x - s, g.z - 1.9, g.x + s, g.z + 1.9]);
    }
    for (const e of this.elevators) {
      // the strip in front of the doors
      const c = this.cellCenter(e.cell), f = C / 2 - t / 2, ax = e.dir < 2;
      const wx = c.x + (e.dir === 0 ? f : e.dir === 1 ? -f : 0), wz = c.z + (e.dir === 2 ? f : e.dir === 3 ? -f : 0);
      keep.push(ax ? [Math.min(wx, c.x), wz - 0.8, Math.max(wx, c.x), wz + 0.8] : [wx - 0.8, Math.min(wz, c.z), wx + 0.8, Math.max(wz, c.z)]);
    }
    const m = this.cellCenter(mid * n + mid);
    keep.push([m.x - C / 2, m.z - C / 2, m.x + C / 2, m.z + C / 2]);
    for (const sp of this.spaces) {
      if (sp.type === 'ball') this.furnishBallroom(sp);
      else if (sp.type === 'lounge') this.furnishLounge(sp);
      else if (sp.type === 'alcove') this.furnishAlcove(sp);
      else if (sp.type === 'lobby') this.furnishLobby(sp);
      else if (sp.type === 'room' && sp.open) this.furnishRoom(sp);
    }
    this.furnishCorridors();
    // the sconces before the prune: their colliders stand out a hand's width at head height
    // (free() counts them), so the floor check has to see them; it never takes one away
    this.placeWallFixtures();
    this.pruneHotelProps();
    this.keepTablesPassable();
    // chandeliers hang to 2.1 m: overhead, but solid to grenades and bullets
    for (let c = 0; c < n * n; c++) {
      if (this.lampKind[c] !== HOTEL_LAMP.CHANDELIER) continue;
      const p = this.cellCenter(c);
      this.boxes.push(Lab.boxDef(p.x, (2.1 + H) / 2, p.z, 1.2, H - 2.1, 1.2, 'prop', 'metal'));
    }
    // A* (findPath) adds crowd[c] * 0.8 to the cost of entering a cell: furnished cells (a banquet
    // table, a bed) cost more, so routes go round them rather than through the chairs
    this.buildSpatial();
    const crowd = (this.crowd = new Float32Array(n * n));
    for (let c = 0; c < n * n; c++) {
      if (!this.area[c] || this.area[c] === A.HALL) continue;
      const ctr = this.cellCenter(c);
      let blocked = 0;
      for (let v = -2; v <= 2; v++) for (let u = -2; u <= 2; u++) if (!this.free(ctr.x + u * 0.55, ctr.z + v * 0.55, 0.3)) blocked++;
      crowd[c] = Math.max(0, blocked / 25 - 0.15) * 5;
    }
  },

  // Furniture must not wall off floor: flood-fill the free floor (a 0.4 m disc on a 0.2 m grid,
  // a little wider than anyone walking) from the arrival point, and while some free floor is not
  // reached, or an open edge between two cells cannot be crossed, take away the piece that seals
  // it off (chairs first).
  pruneHotelProps() {
    const n = this.n, C = this.cell, h = 0.2, R0 = 0.4, N = Math.ceil(this.size / h), x0 = -this.half + h / 2, mid = (n / 2) | 0;
    const fixed = new Set(['leaf', 'bleaf', 'pilaster', 'sconce']);
    const rank = { bchair: 0, fallenchair: 0, stool: 0, suitcase: 1, armchair: 1, lowtable: 2, plant: 2, luggage: 2, trolley: 2, hcart: 2, urn: 2 };
    const okA = new Uint8Array(N * N), seen = new Uint8Array(N * N), q = new Int32Array(N * N);
    // free floor on the grid; after a pass only the grid round the pieces taken away changes
    const fillOk = (x1, z1, x2, z2) => {
      const i0 = Math.max(0, Math.floor((x1 - x0) / h)), i1 = Math.min(N - 1, Math.ceil((x2 - x0) / h));
      const j0 = Math.max(0, Math.floor((z1 - x0) / h)), j1 = Math.min(N - 1, Math.ceil((z2 - x0) / h));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const x = x0 + i * h, z = x0 + j * h, c = this.cellOf(x, z);
          okA[j * N + i] = c >= 0 && this.area[c] && this.free(x, z, R0) ? 1 : 0;
        }
    };
    this.buildSpatial();
    fillOk(-this.half, -this.half, this.half, this.half);
    for (let pass = 0; pass < 16; pass++) {
      seen.fill(0);
      const m = this.cellCenter(mid * n + mid), s0 = Math.round((m.z - x0) / h) * N + Math.round((m.x - x0) / h);
      let qn = 0;
      if (okA[s0]) { q[qn++] = s0; seen[s0] = 1; }
      for (let k = 0; k < qn; k++) {
        const c = q[k], i = c % N, j = (c / N) | 0;
        for (let d = 0; d < 4; d++) {
          const ni = i + (d === 0 ? 1 : d === 1 ? -1 : 0), nj = j + (d === 2 ? 1 : d === 3 ? -1 : 0);
          if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
          const nc = nj * N + ni;
          if (okA[nc] && !seen[nc]) { seen[nc] = 1; q[qn++] = nc; }
        }
      }
      // trouble spots: every pocket (per cell) with the reached floor round it, and every open
      // edge nobody crosses (whatever stands between the two sides is the culprit)
      // (a pocket of a single point is the grid catching a margin, not floor anyone could
      // stand on: it is let be, or the chair or table beside it would go)
      const spots = [], pocket = new Map();
      for (let c0 = 0; c0 < N * N; c0++) {
        if (!okA[c0] || seen[c0]) continue;
        let qe = qn;
        q[qe++] = c0; seen[c0] = 2;
        for (let k = qn; k < qe; k++) {
          const c = q[k], i = c % N, j = (c / N) | 0;
          for (let d = 0; d < 4; d++) {
            const ni = i + (d === 0 ? 1 : d === 1 ? -1 : 0), nj = j + (d === 2 ? 1 : d === 3 ? -1 : 0);
            if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
            const nc = nj * N + ni;
            if (okA[nc] && !seen[nc]) { seen[nc] = 2; q[qe++] = nc; }
          }
        }
        if (qe - qn < 2) continue;
        for (let k = qn; k < qe; k++) {
          const c = q[k], x = x0 + (c % N) * h, z = x0 + ((c / N) | 0) * h, cell = this.cellOf(x, z);
          if (!pocket.has(cell)) pocket.set(cell, []);
          pocket.get(cell).push([x, z]);
        }
      }
      const sample = (pts, k) => { const st = Math.max(1, Math.floor(pts.length / k)), out = []; for (let m = 0; m < pts.length; m += st) out.push(pts[m]); return out; };
      for (const [, pts] of pocket) {
        let mx = 0, mz = 0;
        for (const [x, z] of pts) { mx += x; mz += z; }
        mx /= pts.length; mz /= pts.length;
        const near = [];
        const gi = Math.round((mx - x0) / h), gj = Math.round((mz - x0) / h), rr = Math.round(3 / h);
        for (let j = Math.max(0, gj - rr); j <= Math.min(N - 1, gj + rr); j++)
          for (let i = Math.max(0, gi - rr); i <= Math.min(N - 1, gi + rr); i++) if (seen[j * N + i] === 1) near.push([x0 + i * h, x0 + j * h]);
        spots.push([sample(pts, 24), sample(near, 48)]);
      }
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++)
          for (const d of [0, 2]) {
            if ((d === 0 && i === n - 1) || (d === 2 && j === n - 1) || !this.wallOpen(i, j, d)) continue;
            if (!this.area[j * n + i] || !this.area[(j + (d === 2)) * n + i + (d === 0)]) continue;
            const ex = -this.half + (i + 1) * C, ez = -this.half + (j + 1) * C;
            let cross = false;
            for (let t = 0.1; t < C - 0.1 && !cross; t += 0.1) {
              const px = d === 0 ? ex : -this.half + i * C + t, pz = d === 2 ? ez : -this.half + j * C + t;
              const gi = Math.round((px - x0) / h), gj = Math.round((pz - x0) / h);
              const a = d === 0 ? (gj * N + gi - 1) : ((gj - 1) * N + gi), b = d === 0 ? (gj * N + gi + 1) : ((gj + 1) * N + gi);
              if (seen[a] === 1 && seen[b] === 1) cross = true;
            }
            if (cross) continue;
            // points along the edge
            const pts = [];
            for (let t = 0.3; t < C - 0.2; t += 0.4) pts.push(d === 0 ? [ex, -this.half + j * C + t] : [-this.half + i * C + t, ez]);
            spots.push([pts, null]);
          }
      if (!spots.length) break;
      // the piece to take away is close to the trouble spot and (for a pocket) to the floor that
      // is reached: it is the one sealing the pocket off
      const dist = (p, pts) => {
        let d = Infinity;
        for (const b of p.boxes) for (const [x, z] of pts) d = Math.min(d, Math.hypot(x - clamp(x, b.min.x, b.max.x), z - clamp(z, b.min.z, b.max.z)));
        return d;
      };
      const gone = new Set();
      for (const [pts, near] of spots) {
        let best = null, bs = Infinity;
        // (a piece already going counts: one taken away often opens several spots, so the
        // next pass looks again rather than taking a second piece for the same spot now)
        for (const p of this.props) {
          if (fixed.has(p.kind)) continue;
          const d = dist(p, pts);
          if (d > 1.6) continue;
          const score = d + (near && near.length ? dist(p, near) : 0) + (rank[p.kind] ?? 3) * 0.35;
          if (score < bs) { bs = score; best = p; }
        }
        if (best) gone.add(best);
      }
      if (!gone.size) break;
      this.props = this.props.filter((p) => !gone.has(p));
      const dead = new Set();
      for (const p of gone) for (const b of p.boxes) dead.add(b);
      this.boxes = this.boxes.filter((b) => !dead.has(b));
      this.buildSpatial();
      for (const b of dead) fillOk(b.min.x - R0 - 0.1, b.min.z - R0 - 0.1, b.max.x + R0 + 0.1, b.max.z + R0 + 0.1);
    }
  },

  // A banquet table and its ring of chairs fill most of a cell, and findPath (A* on cells) often
  // routes straight across one: it then steps round the table inside the cell (detour). Keep
  // that way round open on both axes, taking chairs away (the knocked-over ones first) where
  // the ring closes it, else the walkers of that route push into the chairs.
  keepTablesPassable() {
    const C = this.cell, r = 0.34;
    const clear = (a, b, pad) => this.segmentClear(a.x, a.z, b.x, b.z, 1.0, pad, 0.25);
    const remove = (p) => {
      this.props = this.props.filter((q) => q !== p);
      this.boxes = this.boxes.filter((b) => !p.boxes.includes(b));
    };
    // the first free point along an edge, from its middle out (as crossing() picks them)
    const onEdge = (x, z, ax, az) => {
      for (const f of [0, 0.36, -0.36, 0.73, -0.73]) {
        const px = x + az * f, pz = z + ax * f;
        if (this.free(px, pz, r)) return new I(px, 0, pz);
      }
      return null;
    };
    const blocked = (t) => {
      const ctr = this.cellCenter(this.cellOf(t.x, t.z));
      let bad = 0;
      for (const [ax, az] of [[1, 0], [0, 1]]) {
        const a = onEdge(ctr.x - (ax * C) / 2, ctr.z - (az * C) / 2, ax, az), b = onEdge(ctr.x + (ax * C) / 2, ctr.z + (az * C) / 2, ax, az);
        if (!a || !b || clear(a, b, r)) continue; // no way in at all: the edge prune's business
        const pts = [a, ...this.detour(a, b, r), b];
        for (let k = 1; k < pts.length; k++) if (!clear(pts[k - 1], pts[k], 0.2)) { bad++; break; }
      }
      return bad;
    };
    this.buildSpatial();
    for (const t of this.props.filter((p) => p.kind === 'rtable')) {
      const chairs = (t.chairs || []).filter(Boolean).sort((p, q) => (q.kind === 'fallenchair') - (p.kind === 'fallenchair'));
      for (let bad = blocked(t); bad && chairs.length; ) {
        // take away the chair that opens most (try each in turn)
        let best = 0, bb = bad;
        for (let k = 0; k < chairs.length && bb; k++) {
          const keepB = this.boxes, keepP = this.props;
          remove(chairs[k]);
          this.buildSpatial();
          const b = blocked(t);
          this.boxes = keepB;
          this.props = keepP;
          if (b < bb) { bb = b; best = k; }
        }
        remove(chairs[best]);
        chairs.splice(best, 1);
        this.buildSpatial();
        bad = bb < bad ? bb : blocked(t);
      }
    }
  },

  // a wall prop in cell c against side d (0 +x, 1 -x, 2 +z, 3 -z), `along` from the cell centre,
  // `gap` off the wall face; returns the prop or null
  hotelWallProp(kind, c, d, along, gap = 0.04, over = null, yawJitter = 0) {
    const C = this.cell, t = this.wallT, ctr = this.cellCenter(c), def = over ? { ...PROP_DEFS[kind], ...over } : PROP_DEFS[kind];
    const off = C / 2 - t / 2 - def.d / 2 - gap;
    const nx = d === 0 ? 1 : d === 1 ? -1 : 0, nz = d === 2 ? 1 : d === 3 ? -1 : 0;
    const x = ctr.x + nx * off + (d >= 2 ? along : 0), z = ctr.z + nz * off + (d < 2 ? along : 0);
    const yaw = Math.atan2(-nx, -nz) + yawJitter;
    return this.addProp(kind, x, z, yaw, over);
  },

  furnishRoom(rm) {
    const C = this.cell, t = this.wallT, R = this.rng, F = rm.frame;
    // room space: u across (lateral), w inwards from the door wall's centre line
    const P = (u, w) => [F.x0 + F.ix * w + F.lx * u, F.z0 + F.iz * w + F.lz * u];
    const face = (fx, fz) => Math.atan2(fx, fz);
    // (face(dx, dz) turns a prop's front, local +z, towards dx, dz: things against the far wall
    // face the door, their backs, a headboard, to the wall)
    const toDoor = face(-F.ix, -F.iz), hs = F.hinge, inW = C / 2 - t / 2; // half the inside width
    const farW = rm.depth * C - t / 2;
    // suites: the door column is a bedroom like any other, the second column a sitting room
    let side = 0;
    if (rm.suite) {
      const oc = this.cellCenter(rm.other), dc = this.cellCenter(rm.door.room);
      side = Math.sign((oc.x - dc.x) * F.lx + (oc.z - dc.z) * F.lz);
    }
    if (rm.depth === 2) {
      // a queen bed centred on the far wall between two nightstands
      const bs = rm.suite ? -side : R() < 0.5 ? -1 : 1, bedU = 0;
      const bed = PROP_DEFS.bed;
      const [bx, bz] = P(bedU, farW - bed.d / 2 - 0.07);
      this.addProp('bed', bx, bz, toDoor);
      // (snug between the headboard, 0.86 m either side, and the side walls)
      for (const s of [-1, 1]) {
        const [nx, nz] = P(s * (0.86 + 0.025 + 0.24), farW - 0.21 - 0.07);
        this.addProp('nightstand', nx, nz, toDoor, null, 0.02);
      }
      if (R() < 0.6) {
        const [sx, sz] = P(bedU - bs * 0.2 + (R() - 0.5) * 0.4, farW - bed.d - 0.32);
        this.addProp('suitcase', sx, sz, toDoor + (R() - 0.5) * 0.6);
      }
      // by the door: a wardrobe on the hinge side, the dresser and its television opposite
      const [wx, wz] = P(hs * (inW - 0.3 - 0.07), 1.55 + 0.5);
      if (!rm.suite || side !== hs) this.addProp('wardrobe', wx, wz, face(-F.lx * hs, -F.lz * hs));
      const [dx, dz] = P(-hs * (inW - 0.25 - 0.07), 2.2);
      if (!rm.suite || side !== -hs) this.addProp('dresser', dx, dz, face(F.lx * hs, F.lz * hs));
    } else {
      // a single room: the bed across the far wall (along a side wall it would stand in the
      // floor kept clear inside the door), its head to the hinge side so that the floor at its
      // foot stays open to the room, a narrow nightstand at its head
      const b1 = PROP_DEFS.bed1, hw = 1.08 / 2; // (the headboard is the wider part)
      const [bx, bz] = P(hs * (inW - 0.07 - b1.d / 2), farW - 0.07 - hw);
      this.addProp('bed1', bx, bz, face(-F.lx * hs, -F.lz * hs));
      const ns = { w: 0.42, d: 0.4, boxes: [[0.42, 0.4, 0.58, 0, 0, 0], [0.3, 0.3, 0.5, 0, 0, 0.58, 'fabric']] };
      const [nx, nz] = P(hs * (inW - 0.06 - ns.d / 2), farW - 0.07 - 2 * hw - 0.025 - ns.w / 2);
      this.addProp('nightstand', nx, nz, face(-F.lx * hs, -F.lz * hs), ns, 0.02);
    }
    if (rm.suite) {
      // the sitting room: a settee against the far wall, a low table, an armchair
      const S = (u, w) => P(u + side * C, w);
      const [sx, sz] = S(0, farW - 0.425 - 0.07);
      this.addProp('settee', sx, sz, toDoor);
      const [lx, lz] = S(0, farW - 1.3);
      this.addProp('lowtable', lx, lz, toDoor, { d: 0.55 });
      // (clear of the dresser by more than a body, and of the way through the middle of the
      // room: findPath crosses into the far cell within 0.75 m of its middle)
      const [ax, az] = S(0, farW - 2.12);
      this.addProp('armchair', ax, az, toDoor + Math.PI + (R() - 0.5) * 0.3); // facing the settee
      const [dx, dz] = S(side * (inW - 0.25 - 0.07), 1.6);
      this.addProp('dresser', dx, dz, face(-F.lx * side, -F.lz * side));
    }
  },

  furnishBallroom(bl) {
    const n = this.n, R = this.rng, C = this.cell;
    const local = (c) => {
      const i = c % n, j = (c / n) | 0, a = this.hotelFlip ? j : i, b = this.hotelFlip ? i : j;
      return [a - bl.a0, b - bl.b0];
    };
    const nearEntrance = (c) => this.grand.some((g) => Math.hypot(g.x - this.cellCenter(c).x, g.z - this.cellCenter(c).z) < C * 0.8);
    const corners = [];
    for (const c of bl.cells) {
      const [u, v] = local(c);
      if (this.area[c] === HOTEL_AREA.DANCE) continue;
      if ((u + v) % 2 === 1) { if ((u === 0 || u === bl.w - 1) && (v === 0 || v === bl.d - 1)) corners.push(c); continue; }
      if (nearEntrance(c) || R() < 0.22) continue;
      const ctr = this.cellCenter(c), x = ctr.x + (R() - 0.5) * 0.3, z = ctr.z + (R() - 0.5) * 0.3;
      const table = this.addProp('rtable', x, z, 0);
      if (!table) continue;
      table.chairs = []; // (keepTablesPassable may take some away)
      // six chairs round it, some pushed back, some missing, now and then one knocked over
      const k0 = R() * TAU, empty = R() < 0.2;
      for (let k = 0; k < 6; k++) {
        if (empty && R() < 0.6) continue;
        if (R() < 0.08) {
          const ang = k0 + (k * TAU) / 6 + (R() - 0.5) * 0.3, r = 1.45;
          table.chairs.push(this.addProp('fallenchair', x + Math.sin(ang) * r, z + Math.cos(ang) * r, ang + (R() - 0.5) * 1.2, null, 0.02));
          continue;
        }
        const ang = k0 + (k * TAU) / 6, r = 1.12 + (R() < 0.25 ? 0.15 + R() * 0.15 : 0);
        table.chairs.push(this.addProp('bchair', x + Math.sin(ang) * r, z + Math.cos(ang) * r, ang + Math.PI + (R() - 0.5) * 0.4, null, 0.02));
      }
    }
    // a grand piano in one corner, the buffet along a wall
    for (let k = corners.length - 1; k > 0; k--) { const m = Math.floor(R() * (k + 1)); [corners[k], corners[m]] = [corners[m], corners[k]]; }
    // the piano stands tucked into the corner, tail to one wall and keyboard to the room, so the
    // corner cell stays walkable along its open sides (in the middle of the cell it closed both)
    const pc = corners[0] ?? bl.cells[0], ctr = this.cellCenter(pc), pi = pc % n, pj = (pc / n) | 0;
    const walls = [0, 1, 2, 3].filter((d) => this.edgeVal(pi, pj, d) === 1);
    const back = walls.find((d) => walls.some((e) => (e < 2) !== (d < 2)));
    if (back !== undefined) {
      const side = walls.find((e) => (e < 2) !== (back < 2)), pd = PROP_DEFS.piano, off = C / 2 - this.wallT / 2 - 0.12;
      const nx = (d) => (d === 0 ? 1 : d === 1 ? -1 : 0), nz = (d) => (d === 2 ? 1 : d === 3 ? -1 : 0);
      const x = ctr.x + nx(back) * (off - pd.d / 2) + nx(side) * (off - pd.w / 2), z = ctr.z + nz(back) * (off - pd.d / 2) + nz(side) * (off - pd.w / 2);
      this.addProp('piano', x, z, Math.atan2(-nx(back), -nz(back)));
    } else this.addProp('piano', ctr.x, ctr.z, Math.floor(R() * 4) * (Math.PI / 2));
    for (const c of bl.cells) {
      const [u, v] = local(c);
      if ((u + v) % 2 === 0 || R() < 0.4) continue;
      const i = c % n, j = (c / n) | 0;
      for (let d = 0; d < 4; d++) if (this.edgeVal(i, j, d) === 1 && this.hotelWallProp('buffet', c, d, (R() - 0.5) * 0.3, 0.1)) break;
    }
  },

  furnishLounge(lg) {
    const n = this.n, R = this.rng, C = this.cell, at = (a, b) => (this.hotelFlip ? a * n + b : b * n + a);
    // the back row is the one two cells from the corridor; `a` runs along it
    const c0 = this.cellCenter(at(lg.a0, lg.r + 2 * lg.s)), c1 = this.cellCenter(at(lg.a0 + lg.w - 1, lg.r + 2 * lg.s));
    const ax = Math.sign(c1.x - c0.x), az = Math.sign(c1.z - c0.z);
    const ox = this.hotelFlip ? lg.s : 0, oz = this.hotelFlip ? 0 : lg.s;  // away from the corridor
    const wallOff = C / 2 - this.wallT / 2, yawIn = Math.atan2(-ox, -oz); // facing the corridor
    // the bar fills one end cell of the back row: shelves of bottles on the back wall, the
    // counter in front with the bartender's aisle behind it, open towards the room
    const endA = R() < 0.5 ? lg.a0 : lg.a0 + lg.w - 1, es = endA === lg.a0 ? -1 : 1; // towards its side wall
    const e = this.cellCenter(at(endA, lg.r + 2 * lg.s)), len = 2.1, blen = 2.5;
    const bu = es * (wallOff - blen / 2 - 0.07), cu = es * (wallOff - len / 2 - 0.07), cw = wallOff - 0.47 - 0.9 - 0.34;
    const bbx = e.x + ox * (wallOff - 0.27) + ax * bu, bbz = e.z + oz * (wallOff - 0.27) + az * bu;
    this.addProp('backbar', bbx, bbz, yawIn, { w: blen });
    const cx = e.x + ox * cw + ax * cu, cz = e.z + oz * cw + az * cu;
    const bar = this.addProp('bar', cx, cz, yawIn, { w: len });
    lg.bar = { x: cx, z: cz, ax, az, ox, oz, len, back: { x: bbx, z: bbz, len: blen } };
    if (bar) for (let k = 0; k < 3; k++) {
      if (R() < 0.25) continue;
      const u = cu + (k - 1) * 0.68;
      this.addProp('stool', e.x + ox * (cw - 0.7) + ax * u, e.z + oz * (cw - 0.7) + az * u, R() * TAU, null, 0.02);
    }
    for (let a = lg.a0; a < lg.a0 + lg.w; a++) {
      // settees against the rest of the back wall
      if (a !== endA && R() < 0.75) {
        const b = this.cellCenter(at(a, lg.r + 2 * lg.s));
        if (this.addProp('settee', b.x + ox * (wallOff - 0.5), b.z + oz * (wallOff - 0.5), yawIn))
          this.addProp('lowtable', b.x + ox * (wallOff - 1.5), b.z + oz * (wallOff - 1.5), yawIn, { w: 1.0, d: 0.55 });
      }
      // armchairs round low tables in the front row
      const ctr = this.cellCenter(at(a, lg.r + lg.s));
      if (R() < 0.3) continue;
      const x = ctr.x + (R() - 0.5) * 0.4, z = ctr.z + (R() - 0.5) * 0.4;
      if (!this.addProp('lowtable', x, z, Math.atan2(ax, az), { w: 0.75, d: 0.75 })) continue;
      for (const s of [-1, 1]) this.addProp('armchair', x + ax * s * 0.95, z + az * s * 0.95, Math.atan2(-ax * s, -az * s) + (R() - 0.5) * 0.5, null, 0.02);
    }
  },

  furnishAlcove(al) {
    const n = this.n, c = al.cells[0], i = c % n, j = (c / n) | 0;
    for (let d = 0; d < 4; d++) {
      // the back wall is the one facing the corridor
      const opp = d ^ 1, oi = i + (opp === 0 ? 1 : opp === 1 ? -1 : 0), oj = j + (opp === 2 ? 1 : opp === 3 ? -1 : 0);
      if (oi < 0 || oj < 0 || oi >= n || oj >= n || this.area[oj * n + oi] !== HOTEL_AREA.HALL || this.edgeVal(i, j, opp) !== 0) continue;
      this.hotelWallProp('icemachine', c, d, -0.55, 0.07);
      this.hotelWallProp('vending', c, d, 0.5, 0.07);
      al.back = d;
      return;
    }
  },

  furnishLobby(lb) {
    const n = this.n, R = this.rng;
    for (const c of lb.cells) {
      const i = c % n, j = (c / n) | 0;
      for (let d = 0; d < 4; d++) {
        if (this.edgeVal(i, j, d) !== 1 || this.elevators.some((e) => e.cell === c && e.dir === d)) continue;
        // the side walls of the corner cells: a bench under a painting, palms in the corners
        this.hotelWallProp('lbench', c, d, 0, 0.08);
        for (const s of [-1, 1]) this.hotelWallProp('plant', c, d, s * 1.1, 0.12);
      }
    }
    // ashtray urns between the elevators
    for (const e of this.elevators) if (R() < 0.5) this.hotelWallProp('urn', e.cell, e.dir, (R() < 0.5 ? -1 : 1) * 1.15, 0.1);
  },

  // corridor furniture against the walls: housekeeping carts and room-service trolleys (often in
  // front of a door), console tables and palms between the doors, luggage carts
  furnishCorridors() {
    const n = this.n, R = this.rng, C = this.cell, A = HOTEL_AREA;
    for (let c = 0; c < n * n; c++) {
      if (this.area[c] !== A.HALL) continue;
      const i = c % n, j = (c / n) | 0;
      const open = [0, 1, 2, 3].filter((d) => this.wallOpen(i, j, d)).length;
      if (open >= 3 || R() > 0.17) continue;
      const walls = [0, 1, 2, 3].filter((d) => this.edgeVal(i, j, d) === 1);
      if (!walls.length) continue;
      const d = walls[Math.floor(R() * walls.length)];
      // the wall continues into the next cell along it (for things standing between doors)
      const along = (s) => {
        const ni = i + (d >= 2 ? s : 0), nj = j + (d < 2 ? s : 0);
        return ni >= 0 && nj >= 0 && ni < n && nj < n && this.area[nj * n + ni] === A.HALL && this.edgeVal(ni, nj, d) === 1;
      };
      const r = R(), s = R() < 0.5 ? -1 : 1;
      if (r < 0.27) this.hotelWallProp('hcart', c, d, (R() - 0.5) * 1.2, 0.08, null, (R() - 0.5) * 0.2);
      else if (r < 0.47) this.hotelWallProp('trolley', c, d, (R() - 0.5) * 1.2, 0.12 + R() * 0.25, null, (R() - 0.5) * 0.9);
      else if (r < 0.68) { if (along(s)) this.hotelWallProp('console', c, d, s * C / 2, 0.07); }
      else if (r < 0.84) { if (along(s)) this.hotelWallProp('plant', c, d, s * C / 2, 0.06); }
      else this.hotelWallProp('luggage', c, d, (R() - 0.5) * 1.0, 0.1, null, (R() - 0.5) * 0.6);
    }
  },

  // Wall sconces at every other corner along the corridors, the lobby, the ballroom and the
  // lounge (staggered across a corridor), each with a small collider (they stand out a hand's
  // width at head height); paintings and mirrors on stretches of wall without a door.
  placeWallFixtures() {
    const n = this.n, C = this.cell, t = this.wallT, half = this.half, A = HOTEL_AREA;
    this.buildSpatial();
    const group = (a) => (a === A.DANCE ? A.BALL : a);
    const want = new Set([A.HALL, A.LOBBY, A.BALL, A.LOUNGE]);
    const lampNear = (c) => {
      if (this.lampKind[c]) return c;
      const i = c % n, j = (c / n) | 0;
      let best = -1, bd = 9;
      for (let dj = -2; dj <= 2; dj++)
        for (let di = -2; di <= 2; di++) {
          const ii = i + di, jj = j + dj, k = jj * n + ii;
          if (ii < 0 || jj < 0 || ii >= n || jj >= n || !this.lampKind[k] || group(this.area[k]) !== group(this.area[c])) continue;
          const d = Math.abs(di) + Math.abs(dj);
          if (d < bd) { bd = d; best = k; }
        }
      return best;
    };
    const doorEdge = new Set(this.guestDoors.map((g) => g.hall + ':' + g.dir));
    this.sconces = [];
    this.paintings = [];
    for (let c = 0; c < n * n; c++) {
      const a = group(this.area[c]);
      if (!want.has(a)) continue;
      const i = c % n, j = (c / n) | 0, ctr = this.cellCenter(c);
      for (let d = 0; d < 4; d++) {
        if (this.edgeVal(i, j, d) !== 1) continue;
        const nx = d === 0 ? 1 : d === 1 ? -1 : 0, nz = d === 2 ? 1 : d === 3 ? -1 : 0; // towards the wall
        const alongX = d >= 2, f = C / 2 - t / 2;
        // a painting or a mirror in the middle of a plain stretch (no door, nothing tall below)
        if (!doorEdge.has(c + ':' + d) && !this.elevators.some((e) => e.cell === c && e.dir === d) && this.rng() < (a === A.HALL ? 0.55 : 0.8)) {
          const x = ctr.x + nx * f, z = ctr.z + nz * f;
          const tall = this.boxesNear(x - nx * 0.3, z - nz * 0.3, 0.6).some((b) => b.kind === 'prop' && b.max.y > 1.2);
          if (!tall) this.paintings.push({ x, z, nx: -nx, nz: -nz, area: a, mirror: this.rng() < 0.25, cell: c });
        }
        // a sconce at this wall's corner with the next cell along (+x or +z)
        const ni = i + (alongX ? 1 : 0), nj = j + (alongX ? 0 : 1);
        if (ni >= n || nj >= n) continue;
        const nc = nj * n + ni;
        if (group(this.area[nc]) !== a || this.edgeVal(ni, nj, d) !== 1) continue;
        if (((alongX ? i : j) + 1 + d) % 2) continue;
        const x = alongX ? -half + (i + 1) * C : ctr.x + nx * f, z = alongX ? ctr.z + nz * f : -half + (j + 1) * C;
        const bx = x - nx * 0.13, bz = z - nz * 0.13, sx = alongX ? 0.24 : 0.26, sz = alongX ? 0.26 : 0.24;
        const box = Lab.boxDef(bx, 1.765, bz, sx, 0.43, sz, 'prop', 'metal');
        let clash = false;
        for (const o of this.boxesNear(bx, bz, 0.4)) if (o.kind === 'prop' && box.min.y < o.max.y && box.max.y > o.min.y && box.min.x < o.max.x && box.max.x > o.min.x && box.min.z < o.max.z && box.max.z > o.min.z) clash = true;
        if (clash) continue;
        this.boxes.push(box);
        this.props.push({ kind: 'sconce', x: bx, z: bz, yaw: 0, def: null, box, boxes: [box] });
        const lit = lampNear(this.lampKind[c] ? c : this.lampKind[nc] ? nc : c);
        this.sconces.push({ x, z, nx: -nx, nz: -nz, fix: lit, area: a });
      }
    }
  },

  // ---- lamps -----------------------------------------------------------------------------------
  // cells without a lamp keep a dark fixture slot (the lattice and the spot lights skip it)
  hotelLights() {
    for (const f of this.fixtures) {
      const c = f.j * this.n + f.i;
      f.lamp = this.lampKind[c];
      if (!f.lamp) { f.state = 'dead'; f.level = 0; f.none = true; }
    }
  },
});

// ---- surfaces ----------------------------------------------------------------------------------
// Wallpaper, carpet and plaster for the shared wall, floor and ceiling shaders (11-level-view.js
// splices these in as their uStyle 6 branch). What a cell is comes from the fixture texture's
// blue channel (HotelDressing writes the area codes there; the lattice only reads red and green),
// whether it has a lamp from its alpha.
const HOTEL_GLSL = {
  head: /* glsl */ `
float hotelRough = 0.85;
int hotelAreaAt(vec3 P, vec3 N) {
  ivec2 c = ivec2(floor((P.xz + N.xz * 0.12 - uGrid.x) / uGrid.y));
  int nn = int(uGrid.z);
  if (c.x < 0 || c.y < 0 || c.x >= nn || c.y >= nn) return 0;
  return int(texelFetch(uFix, c, 0).b + 0.5);
}
float hAA(float d, float px) { return 1.0 - smoothstep(-px, px, d); }
float hEll(vec2 p, vec2 r) { return (length(p / r) - 1.0) * min(r.x, r.y); }
vec2 hRot(vec2 p, float a) { float s = sin(a), c = cos(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
// tone-on-tone damask: how much of the motif covers wall point w (metres along, up)
float hDamask(vec2 w, float px) {
  vec2 s = vec2(0.3, 0.4);
  vec2 q = w / s;
  q.y += mod(floor(q.x), 2.0) * 0.5;
  vec2 p = (fract(q) - 0.5) * vec2(0.42, 0.56);
  p.x = abs(p.x);
  float d = hEll(p - vec2(0.0, -0.01), vec2(0.05, 0.12));
  d = min(d, abs(hEll(p, vec2(0.1, 0.2))) - 0.007);
  d = min(d, hEll(hRot(p - vec2(0.1, -0.15), 0.8), vec2(0.026, 0.07)));
  d = min(d, hEll(hRot(p - vec2(0.115, 0.13), -0.65), vec2(0.02, 0.055)));
  d = min(d, length(p - vec2(0.0, 0.245)) - 0.02);
  d = min(d, hEll(p - vec2(0.0, -0.245), vec2(0.014, 0.028)));
  d = min(d, abs(length(p - vec2(0.21, 0.0)) - 0.045) - 0.006);
  d = min(d, length(p - vec2(0.21, 0.0)) - 0.012);
  px *= 1.4;
  return mix(hAA(d, px), 0.2, smoothstep(0.003, 0.009, px)); // its average far away (no moire)
}
`,
  wall: /* glsl */ `
    int ar = hotelAreaAt(P, N);
    float y = P.y, u = uv.x, H = uGrid.w;
    float px = max(max(fwidth(uv.x), fwidth(uv.y)), 1e-4);
    bool ball = ar == 4 || ar == 7;
    // dark polished walnut with a vertical grain (ivory paint in the ballroom)
    vec3 wood = uTrim * (0.8 + 0.35 * brN(vec2(u * 9.0, y * 0.8) + 3.0)) * (0.9 + 0.2 * brN(vec2(u * 70.0, y * 2.0)));
    if (ball) wood = vec3(0.62, 0.55, 0.43) * (0.95 + 0.08 * fine);
    // wainscot below the chair rail: a raised panel in every 0.62 m bay
    float pitch = 0.62;
    vec2 pp = vec2(fract(u / pitch) * pitch - pitch * 0.5, y - 0.56);
    vec2 dq = abs(pp) - vec2(pitch * 0.5 - 0.075, 0.27);
    float e = max(dq.x, dq.y);
    float panel = hAA(e, px);
    float groove = hAA(abs(e + 0.012) - 0.006, px);
    float bev = smoothstep(-0.045, -0.012, e) * panel;
    vec3 lower = wood * (1.0 + 0.1 * panel) * (1.0 - 0.45 * groove) * (1.0 + bev * (pp.y > 0.0 ? 0.22 : -0.22));
    float rough = ball ? 0.55 : 0.42;
    vec3 upper;
    float urough = 0.8;
    if (ar == 2) {
      // guest rooms: striped paper, dusky rose and old gold with a fine pinstripe
      float s = fract(u / 0.19);
      upper = mix(vec3(0.40, 0.22, 0.16), vec3(0.52, 0.37, 0.22), hAA(abs(s - 0.25) - 0.25, px / 0.19));
      upper = mix(upper, vec3(0.6, 0.43, 0.19), hAA(abs(s - 0.75) - 0.012, px / 0.19) * 0.8);
      urough = 0.75;
    } else if (ball) {
      // the ballroom: ivory panels framed in gilt moulding
      upper = vec3(0.64, 0.56, 0.44);
      float bw = 1.5, y0 = 1.15, y1 = H - 0.4;
      vec2 bp = vec2(fract(u / bw) * bw - bw * 0.5, y - (y0 + y1) * 0.5);
      vec2 bd = abs(bp) - vec2(bw * 0.5 - 0.16, (y1 - y0) * 0.5);
      float fe = max(bd.x, bd.y), gilt = hAA(abs(fe) - 0.014, px);
      upper = mix(upper, upper * 0.86, hAA(fe, px));
      upper = mix(upper, vec3(0.78, 0.56, 0.2), gilt);
      urough = mix(0.6, 0.3, gilt);
    } else if (ar == 5) {
      // the lounge: dark boards to the crown
      float bd = fract(u / 0.24);
      upper = uTrim * 1.7 * (0.85 + 0.3 * brN(vec2(u * 7.0, y * 0.6))) * (1.0 - 0.4 * hAA(abs(bd - 0.5) - 0.48, px / 0.24));
      urough = 0.45;
    } else {
      // corridors and the lobby: burgundy damask (gold in the lobby)
      float m = hDamask(vec2(u, y), px);
      vec3 motif = mix(uWallCol * 1.4, uWallAlt, 0.45);
      if (ar == 3) motif = mix(motif, vec3(0.55, 0.38, 0.16), 0.5);
      upper = mix(uWallCol * (0.92 + 0.12 * grime), motif, m);
      urough = mix(0.82, 0.45, m);
    }
    upper *= 0.96 + 0.06 * fine;
    // water damage running down from the crown
    float run = smoothstep(0.62, 0.86, brN(vec2(u * 3.0, y * 0.35) + 7.0 + uSeed * 13.0)) * smoothstep(0.9, 2.6, y);
    upper *= 1.0 - 0.3 * run;
    float above = step(0.98, y);
    col = mix(lower, upper, above);
    hotelRough = mix(rough, urough, above);
    col = mix(col, wood * 0.7, step(y, 0.16)); // skirting (the geometry stands proud of it)
`,
  floor: /* glsl */ `
    float C = uGrid.y;
    vec2 g = (xz - uGrid.x) / C;
    ivec2 c = ivec2(floor(g));
    int nn = int(uGrid.z), ar = 0;
    vec4 w = vec4(1.0);
    if (c.x >= 0 && c.y >= 0 && c.x < nn && c.y < nn) { ar = int(texelFetch(uFix, c, 0).b + 0.5); w = texelFetch(uWalls, c, 0); }
    vec2 lp = (g - vec2(c)) * C;
    vec4 ds = vec4(C - lp.x, lp.x, C - lp.y, lp.y);
    // distance to the nearest closed side of the cell (doorways count: the border runs past them)
    float dw = 9.0; int kw = 0;
    for (int k = 0; k < 4; k++) if (w[k] > 0.5 && ds[k] < dw) { dw = ds[k]; kw = k; }
    float px = max(fwidth(xz.x), fwidth(xz.y)) + 1e-4;
    vec3 gold = vec3(0.50, 0.33, 0.11), ink = vec3(0.075, 0.018, 0.016);
    hotelRough = 0.95;
    if (ar == 3) {
      // the lobby: cream and black marble laid on the diagonal, brass strips between
      vec2 r = vec2(xz.x + xz.y, xz.x - xz.y) * 0.7071 / 0.6;
      vec2 f = fract(r) - 0.5;
      float chk = mod(floor(r.x) + floor(r.y), 2.0);
      float vein = smoothstep(0.9, 1.0, 1.0 - abs(sin((xz.x * 1.3 - xz.y * 0.4 + brF(xz * 1.4) * 3.0) * 3.14159)));
      vec3 cream = vec3(0.46, 0.385, 0.29) * (0.9 + 0.15 * brF(xz * 2.0)) * (1.0 - 0.25 * vein);
      vec3 black = vec3(0.075, 0.06, 0.055) * (0.85 + 0.4 * brF(xz * 2.3 + 4.0)) + vec3(0.1) * vein;
      col = mix(cream, black, chk);
      float seam = hAA(0.5 - max(abs(f.x), abs(f.y)) - 0.018, px / 0.6);
      col = mix(col, gold * 1.3, seam);
      hotelRough = mix(0.14, 0.3, seam);
    } else if (ar == 7 || ar == 5) {
      // parquet (the dance floor, and the lounge under its rug): basket weave of oak strips
      vec2 q = xz / 0.6, cq = floor(q), f = fract(q);
      float alt = mod(cq.x + cq.y, 2.0);
      float acr = alt > 0.5 ? f.y : f.x, alo = alt > 0.5 ? f.x : f.y;
      float pl = floor(acr * 4.0);
      vec3 oak = mix(vec3(0.34, 0.19, 0.08), vec3(0.48, 0.29, 0.13), brH(cq * 4.0 + pl)) * (0.85 + 0.25 * brN(vec2(alo * 18.0, pl * 3.1 + cq.x)));
      if (ar == 5) oak *= 0.8;
      float seam = max(hAA(min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) - 0.004, px / 0.6), hAA(abs(fract(acr * 4.0) - 0.5) - 0.48, px * 4.0 / 0.6));
      col = oak * (1.0 - 0.5 * seam);
      hotelRough = 0.32;
      if (ar == 5) {
        // a rug over the middle of the lounge, dark chocolate with a gold border
        float rug = hAA(0.6 - dw, px);
        float bd = hAA(abs(dw - 0.82) - 0.14, px);
        vec2 rq = fract(xz / 0.5) - 0.5;
        float mot = hAA(abs(rq.x) + abs(rq.y) - 0.18, px / 0.5);
        vec3 rc = mix(vec3(0.24, 0.09, 0.055), gold * 0.8, mot * 0.45);
        rc = mix(rc, mix(ink * 1.5, gold, hAA(abs(fract((kw < 2 ? xz.y : xz.x) / 0.25) - 0.5) - 0.2, px / 0.25)), bd);
        col = mix(col, rc * (0.85 + 0.25 * fib), rug);
        hotelRough = mix(0.32, 0.95, rug);
      }
    } else if (ar == 4) {
      // the ballroom carpet: great medallions on a diamond trellis
      vec2 f = fract(xz / 1.5) - 0.5;
      float sp = px / 1.5, r = length(f), a = atan(f.y, f.x);
      float pet = r - (0.2 + 0.05 * cos(8.0 * a));
      col = uCarpet * 0.95;
      col = mix(col, ink, hAA(pet, sp) * 0.75);
      col = mix(col, gold, min(1.0, hAA(abs(pet) - 0.012, sp) + hAA(r - 0.06, sp) + 0.8 * hAA(abs(abs(f.x) + abs(f.y) - 0.5) - 0.012, sp)));
      col *= 0.85 + 0.25 * fib;
    } else if (ar == 2) {
      // guest rooms: wine-red carpet with a small gold trellis
      vec2 f = fract(xz / 0.32) - 0.5;
      float sp = px / 0.32;
      col = uCarpet * vec3(0.78, 0.8, 0.9);
      col = mix(col, gold * 0.8, hAA(length(f) - 0.06, sp) * 0.8 + hAA(abs(abs(f.x) + abs(f.y) - 0.5) - 0.02, sp) * 0.35);
      col = mix(col, uCarpet * 0.78 + gold * 0.06, smoothstep(0.006, 0.02, px) * 0.8);
      col *= 0.85 + 0.25 * fib;
    } else {
      // corridors: a maroon field with a gold trellis and dark quatrefoils, bordered along the walls
      vec2 f = fract(xz / 0.62) - 0.5;
      float sp = px / 0.62, r = length(f), a = atan(f.y, f.x);
      float quat = r - (0.12 + 0.045 * cos(4.0 * a));
      col = uCarpet;
      col = mix(col, gold, hAA(abs(abs(f.x) + abs(f.y) - 0.5) - 0.02, sp) * 0.75);
      col = mix(col, ink, hAA(quat, sp));
      col = mix(col, gold * 0.9, min(1.0, hAA(abs(quat + 0.025) - 0.01, sp) + hAA(r - 0.035, sp)));
      float alongW = kw < 2 ? xz.y : xz.x;
      float band = hAA(abs(dw - 0.3) - 0.16, px);
      float bm = abs(fract(alongW / 0.3) - 0.5) * 0.3;
      vec3 bcol = mix(ink * 1.3, gold * 0.9, hAA(bm + abs(dw - 0.3) - 0.075, px));
      col = mix(col, bcol, band);
      col = mix(col, gold, min(1.0, hAA(abs(dw - 0.12) - 0.01, px) + hAA(abs(dw - 0.48) - 0.01, px)) * 0.9);
      col = mix(col, uCarpet * 0.9 + gold * 0.07, smoothstep(0.008, 0.03, px) * 0.75);
      col *= 0.84 + 0.28 * fib;
    }
    // wear down the middle, old stains (some of them recent)
    col = mix(col, col * vec3(1.12, 1.04, 0.96), smoothstep(0.55, 0.8, brF(xz * 0.35 + 9.0)) * 0.25);
    float stain = smoothstep(0.7, 0.82, brF(xz * 0.6 + 2.7 + uSeed * 5.0));
    col = mix(col, col * vec3(0.45, 0.3, 0.25), stain * 0.7);
    floorWet = stain * 0.2;
`,
  ceiling: /* glsl */ `
    int nn = int(uGrid.z), ar = 0;
    float hasLamp = 0.0;
    if (c.x >= 0 && c.y >= 0 && c.x < nn && c.y < nn) { vec4 fx = texelFetch(uFix, c, 0); ar = int(fx.b + 0.5); hasLamp = fx.a; }
    float px = max(fwidth(xz.x), fwidth(xz.y)) + 1e-4;
    col *= 0.9 + 0.12 * brF(xz * 0.9 + 1.7);
    if (ar == 3 || ar == 4 || ar == 7) {
      // coffers between beams on a 1.5 m grid, gilt at the edges
      float s = cellSz * 0.5;
      vec2 gq = abs(fract(xz / s + 0.5) - 0.5) * s;
      float e = min(gq.x, gq.y);
      col = mix(col * 0.72, col * 1.04, hAA(e - 0.11, px));
      col = mix(col, vec3(0.75, 0.55, 0.22), hAA(abs(e - 0.11) - 0.012, px));
    }
    // a plaster rose round every lamp, soot above it, water stains
    float r = length(local);
    col *= 1.0 + 0.06 * hasLamp * hAA(r - 0.42, px);
    col *= 1.0 - 0.25 * hasLamp * min(1.0, hAA(abs(r - 0.38) - 0.01, px) + hAA(abs(r - 0.25) - 0.008, px) + hAA(abs(r - 0.32) - 0.006, px));
    col *= 1.0 - hasLamp * 0.22 * smoothstep(0.7, 0.15, r);
    col = mix(col, col * vec3(0.66, 0.52, 0.36), smoothstep(0.62, 0.8, brF(xz * 0.3 + uSeed * 11.0)) * 0.6);
`,
};

// ---- dressing ----------------------------------------------------------------------------------
const HCOL = {
  walnut: 0x4a2412, walnutDark: 0x33190c, teak: 0x6e3c1c, mahogany: [0x6a2814, 0x5c2412, 0x733018, 0x5a2a16], oak: 0x6b4426,
  brass: 0xc79a3e, gilt: 0xd6aa4c, cream: 0xd9cdb2, ivory: 0xe6dcc6, plaster: 0xd8ccb0, marble: 0xe2d8c4,
  linen: 0xe6e0d2, towel: [0xeeeae0, 0xe2d8c4, 0xf0ece4],
  velvet: [0x6e1216, 0x5a1020, 0x7a2a12, 0x4a1a30, 0x8a6a2a], leaf: [0x3a6426, 0x2e5420, 0x47732e],
  black: 0x0e0d0c, steel: 0xa09e98, silver: 0xc8c8c2, porcelain: 0xf2eee6, cart: 0x4a3a2c,
  bottle: [0x8a5410, 0x2e5a22, 0xb08020, 0x6a1a10, 0xd8c8a0, 0x3a4a20],
  leather: [0x4a2a16, 0x2a2a38, 0x5a1a14, 0x6a5030, 0x1e2a22],
  shade: 0xffc27e, bulb: 0xffe2b0, flame: 0xffb050, crystal: 0xfff0d6,
};

class HotelDressing {
  constructor(view) {
    this.view = view;
    const L = (this.level = view.level);
    this.rng = Lab.rng(((L.seed * 2654435761) ^ 0x4073) >>> 0);
    this.bins = new Map();
    this.colors = new Map();
    this.chunk = L.cell * 6;
    this.nChunk = Math.ceil(L.size / this.chunk);
    this.textures = [];
    this.halo = { pos: [], ctr: [], fix: [], size: [], idx: [] };
    this.wash = [];
    this.signs = [];
    this.writeAreas();
    this.makeMaterials();
    this.buildTrim();
    this.buildGuestDoors();
    this.buildElevators();
    this.buildEntrances();
    this.buildColumns();
    this.buildLamps();
    this.buildSconces();
    this.buildFurniture();
    this.buildWallArt();
    this.buildDeadEnds();
    this.buildDirections();
    this.buildSigns();
    this.buildGlows();
    this.flush();
  }

  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }

  // what each cell is (blue) and whether it has a lamp (alpha), for the surface shaders
  writeAreas() {
    const L = this.level, d = this.view.fixData;
    for (let k = 0; k < L.n * L.n; k++) { d[k * 4 + 2] = L.area[k]; d[k * 4 + 3] = L.lampKind[k] ? 1 : 0; }
    this.view.fixTex.needsUpdate = true;
  }

  // the fixture whose level a lamp-lit thing at (x, z) follows (a table lamp, a sconce)
  fixNear(x, z) {
    const L = this.level, n = L.n, c = L.cellOf(x, z);
    if (c < 0) return -1;
    if (L.lampKind[c]) return c;
    const i = c % n, j = (c / n) | 0;
    let best = -1, bd = 9;
    for (let dj = -2; dj <= 2; dj++)
      for (let di = -2; di <= 2; di++) {
        const ii = i + di, jj = j + dj, k = jj * n + ii;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n || !L.lampKind[k]) continue;
        const d = Math.abs(di) + Math.abs(dj);
        if (d < bd) { bd = d; best = k; }
      }
    return best;
  }

  // ---- materials ---------------------------------------------------------------------------
  makeMaterials() {
    const sh = this.view.shared, th = this.level.theme;
    const noise = /* glsl */ `
      float htH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float htN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(htH(i), htH(i + vec3(1.0, 0.0, 0.0)), f.x), mix(htH(i + vec3(0.0, 1.0, 0.0)), htH(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
                   mix(mix(htH(i + vec3(0.0, 0.0, 1.0)), htH(i + vec3(1.0, 0.0, 1.0)), f.x), mix(htH(i + vec3(0.0, 1.0, 1.0)), htH(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }`;
    const std = (key, o, color = '') => patchLattice(new T3.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, ...o }), sh, { key: 'ht-' + key, fragmentHead: noise, color });
    const wood = std('wood', { roughness: 0.42 }, /* glsl */ `{
      // grain along the length of each face
      vec3 N = normalize(vLatN);
      vec3 sc = abs(N.y) > 0.5 ? vec3(2.5, 30.0, 30.0) : vec3(30.0, 2.5, 30.0);
      diffuseColor.rgb *= 0.78 + 0.28 * htN(vLatP * sc) + 0.14 * htN(vLatP * sc * 3.1);
    }`);
    this.mats = {
      wood,
      trim: wood,
      // velvet and linen: a soft rim where the cloth turns away
      fabric: std('fabric', { roughness: 0.95 }, /* glsl */ `{
        vec3 N = normalize(vLatN), V = normalize(cameraPosition - vLatP);
        diffuseColor.rgb *= (0.84 + 0.45 * pow(1.0 - abs(dot(N, V)), 2.0)) * (0.92 + 0.12 * htN(vLatP * 150.0));
      }`),
      brass: std('brass', { roughness: 0.3, metalness: 0.55 }, 'diffuseColor.rgb *= 0.84 + 0.22 * htN(vLatP * 40.0);'),
      paint: std('paint', { roughness: 0.55 }),
      lacquer: std('lacquer', { roughness: 0.12, metalness: 0.05 }),
    };
    this.cast = { wood: true, trim: false, fabric: true, brass: false, paint: true, lacquer: true, glow: false, sign: false, signGlow: false };
    // lamp shades, bulbs and candles: unlit, following their fixture's level (flicker, outages,
    // blackouts); aFix < 0 stays on
    const glow = new T3.MeshBasicMaterial({ vertexColors: true, side: T3.DoubleSide });
    glow.color.setRGB(1.7, 1.7, 1.7);
    glow.onBeforeCompile = (s) => {
      s.uniforms.uFix = sh.uFix;
      s.uniforms.uGrid = sh.uGrid;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFix; uniform sampler2D uFix; uniform vec4 uGrid; varying float vLvl;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ int nn = int(uGrid.z); int k = int(aFix + 0.5); vLvl = aFix < -0.5 ? 1.0 : texelFetch(uFix, ivec2(k % nn, k / nn), 0).r; }');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vLvl;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.05, 1.0, vLvl);');
    };
    glow.customProgramCacheKey = () => 'ht-glow';
    this.mats.glow = glow;
    // soft glow round lamps in the haze (camera-facing quads, as in the warehouse)
    const lc = new T3.Color(...th.lightCol);
    const fixLevel = 'float fixLevel() { if (aFix < -0.5) return 1.0; int nn = int(uGrid.z); int k = int(aFix + 0.5); return texelFetch(uFix, ivec2(k % nn, k / nn), 0).r; }';
    this.mats.halo = new T3.ShaderMaterial({
      uniforms: { uFix: sh.uFix, uGrid: sh.uGrid, uFogD: { value: th.fogDensity }, uCol: { value: lc.clone().multiplyScalar(0.5) } },
      vertexShader: /* glsl */ `
        attribute float aFix; attribute vec3 aCenter; attribute float aSize;
        uniform sampler2D uFix; uniform vec4 uGrid; uniform float uFogD;
        varying float vA; varying vec2 vC;
        ${fixLevel}
        void main() {
          vec4 mv = viewMatrix * vec4(aCenter, 1.0);
          float dist = -mv.z;
          mv.xy += position.xy * aSize;
          vC = position.xy * 2.0;
          vA = fixLevel() * smoothstep(0.6, 3.0, dist) * exp(-uFogD * uFogD * dist * dist);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol; varying float vA; varying vec2 vC;
        void main() {
          float r2 = dot(vC, vC);
          if (r2 > 1.0) discard;
          gl_FragColor = vec4(uCol * (exp(-r2 * 9.0) * 0.8 + exp(-r2 * 3.0) * 0.25 * (1.0 - r2)) * vA, 1.0);
        }`,
      blending: T3.AdditiveBlending, transparent: true, depthWrite: false,
    });
    // the scallops of light a sconce throws up and down the wall: multiplies what is there
    // (the paper keeps its pattern), fading with distance in the haze
    this.mats.wash = new T3.ShaderMaterial({
      uniforms: { uFix: sh.uFix, uGrid: sh.uGrid, uFogD: { value: th.fogDensity }, uK: { value: 4.0 } },
      vertexShader: /* glsl */ `
        attribute float aFix; attribute vec2 aQ;
        uniform sampler2D uFix; uniform vec4 uGrid; uniform float uFogD;
        varying vec2 vQ; varying float vA;
        ${fixLevel}
        void main() {
          vQ = aQ;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = -mv.z;
          vA = fixLevel() * exp(-uFogD * uFogD * dist * dist);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uK; varying vec2 vQ; varying float vA;
        void main() {
          float lx = vQ.x, dy = vQ.y; // metres across and up from the shade
          float su = 0.07 + max(dy, 0.0) * 0.45, sd = 0.09 + max(-dy, 0.0) * 0.55;
          float a = dy > 0.0 ? exp(-lx * lx / (su * su)) * exp(-dy * 0.75) : 0.65 * exp(-lx * lx / (sd * sd)) * exp(dy * 1.4);
          a += 0.7 * exp(-(lx * lx + dy * dy) / 0.025);
          gl_FragColor = vec4(vec3(1.0, 0.8, 0.58) * a * vA * uK, 1.0);
        }`,
      // three.js CustomBlending (5), AddEquation (100), DstColorFactor (208), OneFactor (201): dst * (1 + src)
      blending: 5, blendEquation: 100, blendSrc: 208, blendDst: 201,
      transparent: true, depthWrite: false,
    });
  }

  // ---- geometry bins -----------------------------------------------------------------------
  rgb(hex) {
    let c = this.colors.get(hex);
    if (!c) { const k = new T3.Color(hex); c = [k.r, k.g, k.b]; this.colors.set(hex, c); }
    return c;
  }

  // a world-space part: coloured, binned by material and chunk (glowing parts carry the index
  // of the fixture they follow)
  add(key, geo, hex = 0xffffff, fix = -1) {
    if (key === 'trim') key = 'wood'; // trim is wood too (one bin, fewer draw calls)
    const n = geo.attributes.position.count, [r, g, b] = this.rgb(hex), col = new Float32Array(n * 3);
    if (!geo.index) geo.setIndex(Array.from({ length: n }, (_, i) => i)); // polyhedra come unindexed
    for (let i = 0; i < n; i++) { col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; }
    geo.setAttribute('color', new T3.BufferAttribute(col, 3));
    if (key === 'glow') geo.setAttribute('aFix', new T3.BufferAttribute(new Float32Array(n).fill(fix), 1));
    if (key !== 'sign' && key !== 'signGlow') geo.deleteAttribute('uv');
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
      mesh.receiveShadow = key !== 'glow' && key !== 'signGlow';
      this.view.scene.add(mesh);
    }
    this.bins.clear();
  }

  // a part placer for a frame turned by yaw about (x0, z0): local x across, +z forward (out of
  // a wall, or a prop's front), y up
  placer(x0, z0, yaw, pre = null) {
    const m = new T3.Matrix4().makeRotationY(yaw).setPosition(x0, 0, z0);
    if (pre) m.multiply(pre);
    const put = (key, geo, hex, fix) => this.add(key, geo.applyMatrix4(m), hex, fix);
    put.B = (key, hex, w, h, d, x, y, z, fix) => put(key, whBox(w, h, d, x, y, z), hex, fix);
    put.C = (key, hex, rt, rb, h, x, y, z, seg = 12, fix) => put(key, whCyl(rt, rb, h, seg, x, y, z), hex, fix);
    put.S = (key, hex, ax, ay, az, bx, by, bz, t, fix) => put(key, whStrut(ax, ay, az, bx, by, bz, t), hex, fix);
    put.m = m;
    return put;
  }

  // world position of local (u, y, w) in a wall frame at (x, z) facing (ox, oz)
  static wp(x, z, ox, oz, u, w) { return [x + oz * u + ox * w, z - ox * u + oz * w]; }

  glowAt(x, y, z, size, fix) {
    const h = this.halo, b = h.pos.length / 3;
    for (const [cx, cy] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      h.pos.push(cx, cy, 0);
      h.ctr.push(x, y, z);
      h.fix.push(fix);
      h.size.push(size);
    }
    h.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  // ---- skirting, chair rail and crown along every wall face that borders walkable floor ------
  buildTrim() {
    const L = this.level, C = L.cell, A = HOTEL_AREA;
    const group = (a) => (a === A.DANCE ? A.BALL : a);
    for (const b of L.boxes) {
      if (b.kind !== 'wall' && b.kind !== 'lintel') continue;
      const alongX = b.max.x - b.min.x > b.max.z - b.min.z;
      const a0 = alongX ? b.min.x : b.min.z, a1 = alongX ? b.max.x : b.max.z;
      for (const s of [-1, 1]) {
        const f = alongX ? (s < 0 ? b.min.z : b.max.z) : (s < 0 ? b.min.x : b.max.x);
        // runs of the face over cells of one kind
        const cuts = [a0];
        for (let k = Math.floor((a0 + L.half) / C) + 1; -L.half + k * C < a1; k++) cuts.push(-L.half + k * C);
        cuts.push(a1);
        let r0 = null, ra = 0;
        for (let k = 0; k <= cuts.length - 1; k++) {
          let ar = 0;
          if (k < cuts.length - 1) {
            const m = (cuts[k] + cuts[k + 1]) / 2, px = alongX ? m : f + s * 0.3, pz = alongX ? f + s * 0.3 : m, c = L.cellOf(px, pz);
            ar = c < 0 ? 0 : group(L.area[c]);
          }
          if (r0 !== null && ar !== ra) { this.trimRun(b, alongX, f, s, r0, cuts[k], ra); r0 = null; }
          if (r0 === null && ar) { r0 = cuts[k]; ra = ar; }
        }
      }
    }
  }

  // a moulding along a wall face: only its front, top and underside (the back is against the
  // wall, the ends butt into frames and corners)
  static strip(alongX, f, s, u0, u1, y0, y1, proud) {
    const pos = [], nrm = [], idx = [];
    const P = (u, y, w) => (alongX ? [u, y, f + s * w] : [f + s * w, y, u]);
    const quad = (a, b, c, d, n) => {
      const k = pos.length / 3;
      for (const v of [a, b, c, d]) { pos.push(...v); nrm.push(...n); }
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] >= 0) idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
      else idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
    };
    const out = alongX ? [0, 0, s] : [s, 0, 0];
    quad(P(u0, y0, proud), P(u1, y0, proud), P(u1, y1, proud), P(u0, y1, proud), out);
    quad(P(u0, y1, 0), P(u1, y1, 0), P(u1, y1, proud), P(u0, y1, proud), [0, 1, 0]);
    if (y0 > 0.01) quad(P(u0, y0, 0), P(u1, y0, 0), P(u1, y0, proud), P(u0, y0, proud), [0, -1, 0]);
    const g = new T3.BufferGeometry();
    g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T3.Float32BufferAttribute(nrm, 3));
    g.setIndex(idx);
    return g;
  }

  trimRun(b, alongX, f, s, u0, u1, ar) {
    const L = this.level, H = L.ceiling, A = HOTEL_AREA, len = u1 - u0, m = (u0 + u1) / 2;
    const piece = (key, hex, y0, y1, proud) => this.add(key, HotelDressing.strip(alongX, f, s, u0, u1, y0, y1, proud), hex);
    void len; void m;
    const ball = ar === A.BALL, wood = ball ? HCOL.ivory : HCOL.walnutDark;
    if (b.kind === 'wall') {
      piece('trim', wood, 0, 0.18, 0.022);
      piece(ball ? 'brass' : 'trim', ball ? HCOL.gilt : HCOL.walnut, 0.925, 0.985, 0.032);
    }
    // the crown: plaster (wood in the lounge, gilt edge in the ballroom)
    const crown = ar === A.LOUNGE ? HCOL.walnutDark : HCOL.plaster;
    piece(ar === A.LOUNGE ? 'trim' : 'paint', crown, H - 0.18, H, 0.05);
    if (ball) piece('brass', HCOL.gilt, H - 0.235, H - 0.215, 0.03);
    void A;
  }

  // ---- guest-room doors ----------------------------------------------------------------------
  // a panelled door in a frame (x across, y up, z out of the wall face at z = 0)
  doorLeaf(put, w, h, col, z0, both) {
    put.B('wood', col, w, h, 0.045, 0, h / 2, z0);
    // four raised panels a shade lighter than the leaf
    const raised = new T3.Color(col).multiplyScalar(1.35).getHex();
    for (const zs of both ? [-1, 1] : [1])
      for (const [py, ph] of [[0.52, 0.62], [1.48, 0.94]])
        for (const sx of [-1, 1]) put.B('wood', raised, w * 0.33, ph, 0.012, sx * w * 0.22, py, z0 + zs * 0.028);
  }

  architrave(put, door, lintel) {
    for (const s of [-1, 1]) put.B('trim', HCOL.walnutDark, 0.1, lintel + 0.08, 0.03, s * (door / 2 + 0.05), (lintel + 0.08) / 2, 0.015);
    put.B('trim', HCOL.walnutDark, door + 0.3, 0.12, 0.035, 0, lintel + 0.06, 0.0175);
    put.B('trim', HCOL.walnutDark, door + 0.38, 0.04, 0.06, 0, lintel + 0.14, 0.03);
  }

  buildGuestDoors() {
    const L = this.level, C = L.cell, t = L.wallT, R = this.rng, door = L.doorWidth(), lintel = L.theme.lintel;
    const lw = door - 0.03, lh = lintel - 0.05;
    for (const gd of L.guestDoors) {
      const hc = L.cellCenter(gd.hall), d = gd.dir;
      const nx = d === 0 ? 1 : d === 1 ? -1 : 0, nz = d === 2 ? 1 : d === 3 ? -1 : 0; // into the room
      const f = C / 2 - t / 2, x = hc.x + nx * f, z = hc.z + nz * f, ox = -nx, oz = -nz;
      const put = this.placer(x, z, Math.atan2(ox, oz));
      const latch = -gd.hinge, col = this.pick(HCOL.mahogany);
      this.architrave(put, door, lintel);
      // the number beside the latch
      const [sx, sz] = HotelDressing.wp(x, z, ox, oz, latch * (door / 2 + 0.24), 0.012);
      this.signs.push({ text: gd.num, style: 'plaque', pos: [sx, 1.55, sz], nx: ox, nz: oz, w: 0.17, h: 0.085 });
      put.B('brass', HCOL.brass, 0.19, 0.105, 0.008, latch * (door / 2 + 0.24), 1.55, 0.004);
      if (!gd.open) {
        this.doorLeaf(put, lw, lh, col, 0.0225, false);
        const hu = latch * (lw / 2 - 0.09);
        put.B('brass', HCOL.brass, 0.05, 0.11, 0.012, hu, 1.0, 0.05);
        put.B('brass', HCOL.brass, 0.13, 0.022, 0.022, hu - latch * 0.055, 1.02, 0.075);
        put.B('brass', HCOL.brass, lw - 0.12, 0.2, 0.006, 0, 0.12, 0.048);
        // light under some doors; a do-not-disturb card; a tray left out
        if (R() < 0.22) put.B('glow', 0xffb060, lw - 0.12, 0.012, 0.004, 0, 0.007, 0.047, -1);
        if (R() < 0.12) put.B('paint', 0x8a1410, 0.075, 0.2, 0.004, hu - latch * 0.02, 0.86, 0.09);
        if (R() < 0.08) this.tray(this.placer(...HotelDressing.wp(x, z, ox, oz, latch * (door / 2 + 0.55), 0.32), Math.atan2(ox, oz) + (R() - 0.5) * 0.6));
        continue;
      }
      // an open door: frame on the room side too, linings through the opening, and the leaf
      // standing open into the room (its collider is the level's)
      const xr = hc.x + nx * (C / 2 + t / 2), zr = hc.z + nz * (C / 2 + t / 2);
      this.architrave(this.placer(xr, zr, Math.atan2(nx, nz)), door, lintel);
      for (const s of [-1, 1]) put.B('trim', HCOL.walnut, 0.025, lintel, t + 0.01, s * (door / 2 - 0.0125), lintel / 2, -t / 2);
      put.B('trim', HCOL.walnut, door, 0.025, t + 0.01, 0, lintel - 0.0125, -t / 2);
      const F = gd.rm.frame;
      const lp = this.placer(gd.leaf.x, gd.leaf.z, Math.atan2(F.lx, F.lz));
      this.doorLeaf(lp, lw - 0.05, lh, col, 0, true);
      for (const s of [-1, 1]) lp.B('brass', HCOL.brass, 0.13, 0.022, 0.022, (lw - 0.05) / 2 - 0.12, 1.02, s * 0.055);
    }
  }

  tray(put) {
    put.B('brass', HCOL.silver, 0.44, 0.02, 0.32, 0, 0.01, 0);
    put.C('paint', HCOL.porcelain, 0.11, 0.1, 0.012, -0.08, 0.026, 0, 14);
    put(  'brass', new T3.SphereGeometry(0.095, 12, 6, 0, TAU, 0, Math.PI / 2).translate(-0.08, 0.03, 0), HCOL.silver);
    put.C('paint', 0xe8e0d0, 0.03, 0.025, 0.09, 0.13, 0.065, 0.06, 8);
    put.B('paint', HCOL.linen, 0.12, 0.008, 0.14, 0.14, 0.024, -0.07);
  }

  // ---- elevators -------------------------------------------------------------------------------
  buildElevators() {
    const L = this.level, C = L.cell, t = L.wallT, R = this.rng;
    const ajar = L.elevators.length ? Math.floor(R() * L.elevators.length) : -1;
    for (const e of L.elevators) {
      const c = L.cellCenter(e.cell), d = e.dir;
      const nx = d === 0 ? 1 : d === 1 ? -1 : 0, nz = d === 2 ? 1 : d === 3 ? -1 : 0;
      const f = C / 2 - t / 2, x = c.x + nx * f, z = c.z + nz * f, ox = -nx, oz = -nz;
      const put = this.placer(x, z, Math.atan2(ox, oz));
      // a walnut surround with a gilt bead, bronze doors in panels, the floor dial in the head
      for (const s of [-1, 1]) {
        put.B('wood', HCOL.walnutDark, 0.18, 2.42, 0.06, s * 0.8, 1.21, 0.03);
        put.B('brass', HCOL.gilt, 0.025, 2.32, 0.07, s * 0.715, 1.16, 0.035);
      }
      put.B('wood', HCOL.walnutDark, 1.86, 0.5, 0.07, 0, 2.64, 0.035);
      put.B('brass', HCOL.gilt, 1.43, 0.025, 0.08, 0, 2.33, 0.04);
      put.B('brass', HCOL.gilt, 1.92, 0.04, 0.1, 0, 2.91, 0.05);
      const gap = e.k === ajar ? 0.07 : 0.004, bronze = 0x7a5c2c, inlay = 0x4a3418;
      for (const s of [-1, 1]) {
        const u = s * (0.35 + gap / 2), lw = 0.7 - gap;
        put.B('brass', bronze, lw, 2.3, 0.03, u, 1.15, 0.016);
        for (const [py, ph] of [[0.62, 1.0], [1.72, 0.92]]) {
          put.B('brass', inlay, lw - 0.16, ph, 0.004, u, py, 0.033);
          put.B('brass', 0x8e6c34, lw - 0.24, ph - 0.08, 0.006, u, py, 0.035);
        }
        put.B('brass', HCOL.gilt, lw, 0.05, 0.01, u, 1.2, 0.035);
      }
      if (e.k === ajar) put.B('lacquer', 0x020202, gap * 2 + 0.02, 2.3, 0.004, 0, 1.15, 0.003);
      // call buttons to one side
      const bu = (R() < 0.5 ? -1 : 1) * 1.05;
      put.B('brass', HCOL.brass, 0.1, 0.24, 0.012, bu, 1.15, 0.006);
      put.C('glow', R() < 0.5 ? 0xffb050 : 0x6a4a2a, 0.018, 0.018, 0.012, bu, 1.21, 0.015, 10, -1);
      put.C('glow', 0x6a4a2a, 0.018, 0.018, 0.012, bu, 1.09, 0.015, 10, -1);
      // the dial: a needle that has stopped somewhere it should not be
      const [dx, dz] = HotelDressing.wp(x, z, ox, oz, 0, 0.075);
      this.signs.push({ style: 'dial', text: '', pos: [dx, 2.64, dz], nx: ox, nz: oz, w: 0.5, h: 0.25, glow: true, needle: R() });
      put.B('brass', HCOL.gilt, 0.56, 0.025, 0.02, 0, 2.505, 0.075);
    }
  }

  // ---- grand openings: pilasters, header, the ballroom's padded double doors ------------------
  buildEntrances() {
    const L = this.level, H = L.ceiling;
    for (const p of L.props) {
      if (p.kind !== 'pilaster') continue;
      const b = p.box, w = b.max.x - b.min.x, d = b.max.z - b.min.z, x = (b.min.x + b.max.x) / 2, z = (b.min.z + b.max.z) / 2;
      this.add('paint', whBox(w + 0.01, H - 0.4, d + 0.01, x, H / 2 - 0.05, z), HCOL.cream);
      this.add('trim', whBox(w + 0.06, 0.26, d + 0.06, x, 0.13, z), HCOL.walnutDark);
      this.add('brass', whBox(w + 0.07, 0.05, d + 0.07, x, 0.28, z), HCOL.gilt);
      this.add('brass', whBox(w + 0.08, 0.16, d + 0.08, x, H - 0.33, z), HCOL.gilt);
    }
    for (const g of L.grand) {
      const pd = L.wallT + 0.16 - 0.04;
      const hb = g.alongZ ? whBox(pd + 0.01, H - g.hy, g.span + 0.01, g.x, (g.hy + H) / 2, g.z) : whBox(g.span + 0.01, H - g.hy, pd + 0.01, g.x, (g.hy + H) / 2, g.z);
      this.add('paint', hb, HCOL.cream);
      this.add('brass', g.alongZ ? whBox(pd + 0.03, 0.05, g.span, g.x, g.hy + 0.025, g.z) : whBox(g.span, 0.05, pd + 0.03, g.x, g.hy + 0.025, g.z), HCOL.gilt);
      // the name over the corridor side
      const ox = -g.nx, oz = -g.nz, off = pd / 2 + 0.008;
      this.signs.push({ text: g.kind === 'ball' ? 'GRAND BALLROOM' : 'THE LOUNGE', style: 'name', pos: [g.x + ox * off, (g.hy + H) / 2 + 0.02, g.z + oz * off], nx: ox, nz: oz, w: Math.min(1.9, g.span - 0.2), h: 0.3 });
      for (const lf of g.leaves) {
        const b = lf.box, x = (b.min.x + b.max.x) / 2, z = (b.min.z + b.max.z) / 2, sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
        this.add('wood', whBox(sx, sy, sz, x, (b.min.y + b.max.y) / 2, z), HCOL.walnut);
        // padded leather panels on both faces with a brass push plate
        const thinX = sx < sz;
        for (const s of [-1, 1]) {
          const px = thinX ? x + s * (sx / 2 + 0.012) : x, pz = thinX ? z : z + s * (sz / 2 + 0.012);
          this.add('fabric', thinX ? whBox(0.024, sy - 0.3, sz - 0.18, px, sy / 2 + 0.02, pz) : whBox(sx - 0.18, sy - 0.3, 0.024, px, sy / 2 + 0.02, pz), 0x5a0e12);
          const qx = thinX ? x + s * (sx / 2 + 0.028) : x, qz = thinX ? z : z + s * (sz / 2 + 0.028);
          this.add('brass', thinX ? whBox(0.008, 0.36, 0.1, qx, 1.2, qz) : whBox(0.1, 0.36, 0.008, qx, 1.2, qz), HCOL.brass);
        }
      }
    }
  }

  // ---- ballroom columns -------------------------------------------------------------------------
  buildColumns() {
    const L = this.level, H = L.ceiling;
    for (const { x, z } of L.pillars) {
      this.add('lacquer', whBox(0.62, 0.22, 0.62, x, 0.11, z), HCOL.marble);
      this.add('brass', whBox(0.54, 0.05, 0.54, x, 0.245, z), HCOL.gilt);
      this.add('lacquer', whCyl(0.2, 0.22, H - 0.75, 20, x, 0.27 + (H - 0.75) / 2, z), HCOL.marble);
      this.add('brass', whCyl(0.3, 0.21, 0.2, 20, x, H - 0.38, z), HCOL.gilt);
      this.add('brass', whBox(0.62, 0.1, 0.62, x, H - 0.23, z), HCOL.gilt);
      this.add('paint', whBox(0.66, 0.18, 0.66, x, H - 0.09, z), HCOL.plaster);
    }
  }

  // ---- lamps -------------------------------------------------------------------------------------
  buildLamps() {
    const L = this.level, H = L.ceiling, R = this.rng, LK = HOTEL_LAMP;
    L.fixtures.forEach((f, k) => {
      if (!f.lamp) return;
      const { x, z } = f, put = this.placer(x, z, 0);
      if (f.lamp === LK.BOWL || f.lamp === LK.ROOM) {
        // a frosted bowl on three chains under a brass rose (flush in the guest rooms)
        const drop = f.lamp === LK.ROOM ? 0.05 : 0.2, yr = H - drop;
        put('brass', whCyl(0.12, 0.13, 0.03, 8, 0, H - 0.015, 0, true), HCOL.brass);
        if (drop > 0.1) for (let a = 0; a < 3; a++) {
          const ang = (a * TAU) / 3;
          put.S('brass', HCOL.brass, Math.sin(ang) * 0.05, H - 0.03, Math.cos(ang) * 0.05, Math.sin(ang) * 0.2, yr, Math.cos(ang) * 0.2, 0.01);
        }
        put('brass', whCyl(0.255, 0.25, 0.035, 12, 0, yr, 0, true), HCOL.brass);
        put('glow', new T3.SphereGeometry(0.245, 10, 2, 0, TAU, Math.PI / 2, Math.PI / 2).scale(1, 0.55, 1).translate(0, yr - 0.015, 0), 0xffd9a0, k);
        this.glowAt(x, yr - 0.06, z, f.lamp === LK.ROOM ? 1.2 : 1.7, k);
      } else if (f.lamp === LK.CHANDELIER) this.chandelier(put, H, k, x, z);
      else if (f.lamp === LK.PENDANT) {
        // a drum shade on a rod over the lounge
        put.C('brass', HCOL.brass, 0.06, 0.07, 0.03, 0, H - 0.015, 0, 12);
        put.C('brass', HCOL.brass, 0.008, 0.008, 0.62, 0, H - 0.33, 0, 6);
        put('fabric', whCyl(0.3, 0.3, 0.26, 20, 0, 2.36, 0, true), 0x5a1810);
        put('glow', whCyl(0.29, 0.29, 0.24, 20, 0, 2.36, 0, true), 0xd08040, k);
        put('glow', whCyl(0.28, 0.28, 0.01, 20, 0, 2.25, 0), 0xffd090, k);
        this.glowAt(x, 2.25, z, 1.4, k);
      }
      void R;
    });
  }

  chandelier(put, H, k, x, z) {
    // canopy, chain and body
    put.C('brass', HCOL.gilt, 0.14, 0.16, 0.06, 0, H - 0.03, 0, 16);
    put.C('brass', HCOL.gilt, 0.012, 0.012, H - 2.62, 0, (H + 2.62) / 2, 0, 6);
    put('brass', new T3.SphereGeometry(0.1, 12, 8).translate(0, 2.55, 0), HCOL.gilt);
    put.C('brass', HCOL.gilt, 0.17, 0.05, 0.12, 0, 2.4, 0, 16);
    put.C('brass', HCOL.gilt, 0.03, 0.03, 0.3, 0, 2.2, 0, 8);
    // two tiers of arms with candle bulbs, crystal drops beneath
    for (const [cnt, r, y, a0] of [[8, 0.56, 2.38, 0], [6, 0.32, 2.6, 0.3]]) {
      for (let a = 0; a < cnt; a++) {
        const ang = a0 + (a * TAU) / cnt, s = Math.sin(ang), c = Math.cos(ang);
        put.S('brass', HCOL.gilt, s * 0.08, y + 0.02, c * 0.08, s * r * 0.75, y - 0.06, c * r * 0.75, 0.016);
        put.S('brass', HCOL.gilt, s * r * 0.75, y - 0.06, c * r * 0.75, s * r, y + 0.06, c * r, 0.016);
        put.C('brass', HCOL.gilt, 0.038, 0.022, 0.04, s * r, y + 0.08, c * r, 6);
        put.C('glow', HCOL.linen, 0.012, 0.012, 0.06, s * r, y + 0.13, c * r, 6, k);
        put('glow', new T3.SphereGeometry(0.016, 4, 2).scale(1, 1.5, 1).translate(s * r, y + 0.18, c * r), HCOL.flame, k);
        put('glow', new T3.SphereGeometry(0.014, 4, 2).scale(1, 2.2, 1).translate(s * r * 0.8, y - 0.14, c * r * 0.8), 0x8a7a68, k);
      }
    }
    for (let a = 0; a < 12; a++) {
      const ang = (a * TAU) / 12;
      put('glow', new T3.SphereGeometry(0.012, 4, 2).scale(1, 2, 1).translate(Math.sin(ang) * 0.24, 2.2, Math.cos(ang) * 0.24), 0x7a6c5c, k);
    }
    put('glow', new T3.SphereGeometry(0.024, 4, 2).scale(1, 2.2, 1).translate(0, 2.02, 0), 0x9a8a74, k);
    this.glowAt(x, 2.45, z, 2.8, k);
  }

  // ---- sconces ---------------------------------------------------------------------------------
  buildSconces() {
    for (const s of this.level.sconces) {
      const put = this.placer(s.x, s.z, Math.atan2(s.nx, s.nz)), k = s.fix;
      put.B('brass', HCOL.brass, 0.08, 0.22, 0.02, 0, 1.7, 0.01);
      put.S('brass', HCOL.brass, 0, 1.68, 0.02, 0, 1.66, 0.15, 0.018);
      put.S('brass', HCOL.brass, 0, 1.66, 0.15, 0, 1.75, 0.17, 0.018);
      put('glow', whCyl(0.065, 0.105, 0.15, 10, 0, 1.86, 0.17, true), HCOL.shade, k);
      const [hx, hz] = HotelDressing.wp(s.x, s.z, s.nx, s.nz, 0, 0.17);
      this.glowAt(hx, 1.86, hz, 0.8, k);
      this.wash.push({ s, k });
    }
  }

  // ---- furniture ---------------------------------------------------------------------------------
  buildFurniture() {
    const L = this.level, R = this.rng;
    for (const p of L.props) {
      const put = this.placer(p.x, p.z, p.yaw), B = put.B, Cy = put.C, def = p.def;
      if (!def) continue;
      const { w, d, h } = def;
      switch (p.kind) {
        case 'hcart': {
          const fr = HCOL.cart;
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            B('paint', fr, 0.03, h - 0.1, 0.03, sx * (w / 2 - 0.03), (h - 0.1) / 2 + 0.1, sz * (d / 2 - 0.03));
            put('paint', whCyl(0.05, 0.05, 0.03, 10, 0, 0, 0).rotateZ(Math.PI / 2).translate(sx * (w / 2 - 0.08), 0.05, sz * (d / 2 - 0.08)), HCOL.black);
          }
          for (const y of [0.13, 0.56, h - 0.02]) B('paint', fr, w, 0.025, d, 0, y, 0);
          // linen stacks on two shelves, the laundry bag at one end, the caddy on top
          for (const y of [0.145, 0.575]) for (let m = 0; m < 2; m++) {
            const hh = 0.18 + R() * 0.2;
            B('fabric', this.pick(HCOL.towel), 0.34, hh, d - 0.1, 0.1 + m * 0.38, y + hh / 2, 0);
          }
          B('fabric', 0xc8b89a, 0.42, 0.8, d - 0.04, -w / 2 + 0.23, 0.55, 0);
          B('paint', 0x2a2a2a, 0.36, 0.14, 0.24, 0.25, h + 0.06, 0);
          for (let m = 0; m < 4; m++) Cy('paint', this.pick([0x2a5a8a, 0xe0d8c8, 0x7a2a2a, 0x3a6a3a]), 0.025, 0.025, 0.18, 0.12 + m * 0.07, h + 0.09, 0.05, 8);
          break;
        }
        case 'trolley': {
          // white cloth over a brass frame, cloches, a wine bottle, a rose
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            B('brass', HCOL.brass, 0.025, 0.24, 0.025, sx * (w / 2 - 0.06), 0.13, sz * (d / 2 - 0.06));
            put('paint', whCyl(0.04, 0.04, 0.025, 8, 0, 0, 0).rotateZ(Math.PI / 2).translate(sx * (w / 2 - 0.06), 0.04, sz * (d / 2 - 0.06)), HCOL.black);
          }
          B('fabric', HCOL.linen, w, 0.03, d, 0, 0.755, 0);
          B('fabric', HCOL.linen, w, 0.52, 0.012, 0, 0.5, d / 2 - 0.006);
          B('fabric', HCOL.linen, w, 0.52, 0.012, 0, 0.5, -d / 2 + 0.006);
          for (const sx of [-1, 1]) B('fabric', HCOL.linen, 0.012, 0.52, d, sx * (w / 2 - 0.006), 0.5, 0);
          for (const sx of [-1, 1]) {
            Cy('paint', HCOL.porcelain, 0.14, 0.13, 0.012, sx * 0.22, 0.776, 0.04, 16);
            put('brass', new T3.SphereGeometry(0.115, 14, 6, 0, TAU, 0, Math.PI / 2).translate(sx * 0.22, 0.78, 0.04), HCOL.silver);
          }
          Cy('lacquer', 0x16220e, 0.034, 0.034, 0.14, 0, 0.84, -0.18, 10);
          Cy('lacquer', 0x16220e, 0.012, 0.016, 0.06, 0, 0.94, -0.18, 8);
          Cy('paint', HCOL.silver, 0.03, 0.02, 0.12, 0.12, 0.83, -0.2, 8);
          Cy('paint', 0x2a5a22, 0.004, 0.004, 0.16, -0.12, 0.85, -0.18, 4);
          put('fabric', new T3.SphereGeometry(0.03, 8, 6).translate(-0.12, 0.94, -0.18), 0x8a0a10);
          break;
        }
        case 'console': {
          const wd = HCOL.walnut, fx = this.fixNear(p.x, p.z);
          B('wood', wd, w, 0.04, d, 0, h - 0.02, 0);
          B('wood', wd, w - 0.08, 0.1, d - 0.06, 0, h - 0.09, 0);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) B('wood', wd, 0.04, h - 0.04, 0.04, sx * (w / 2 - 0.05), (h - 0.04) / 2, sz * (d / 2 - 0.05));
          B('wood', wd, w - 0.12, 0.025, d - 0.1, 0, 0.16, 0);
          // a lamp on the left, flowers on the right
          Cy('brass', HCOL.brass, 0.08, 0.09, 0.03, -0.34, h + 0.015, 0, 14);
          Cy('brass', HCOL.brass, 0.014, 0.014, 0.26, -0.34, h + 0.16, 0, 6);
          Cy('glow', HCOL.shade, 0.09, 0.15, 0.2, -0.34, h + 0.39, 0, 16, fx);
          this.glowAt(...this.local(put, -0.34, h + 0.36, 0), 0.7, fx);
          Cy('lacquer', HCOL.porcelain, 0.05, 0.065, 0.22, 0.32, h + 0.11, 0, 12);
          for (let m = 0; m < 7; m++) put('fabric', new T3.SphereGeometry(0.035, 6, 4).translate(0.32 + (R() - 0.5) * 0.14, h + 0.26 + R() * 0.12, (R() - 0.5) * 0.12), this.pick([0x7a0a10, 0x9a1a18, 0x5a0a0e]));
          break;
        }
        case 'plant': this.plant(put, w, h); break;
        case 'bed': case 'bed1': this.bed(put, p, w, d); break;
        case 'nightstand': {
          B('wood', HCOL.teak, w, 0.56, d, 0, 0.28, 0);
          B('trim', HCOL.walnutDark, w - 0.06, 0.012, 0.005, 0, 0.42, d / 2 + 0.002);
          Cy('brass', HCOL.brass, 0.012, 0.012, 0.02, 0, 0.48, d / 2 + 0.01, 6);
          const fx = this.fixNear(p.x, p.z);
          Cy('brass', HCOL.brass, 0.06, 0.07, 0.25, 0, 0.7, 0, 8);
          put('glow', whCyl(0.09, 0.14, 0.2, 10, 0, 0.92, 0, true), HCOL.shade, fx);
          this.glowAt(...this.local(put, 0, 0.9, 0), 0.6, fx);
          break;
        }
        case 'dresser': {
          B('wood', HCOL.teak, w, 0.78, d, 0, 0.4, 0);
          B('wood', HCOL.walnutDark, w + 0.04, 0.03, d + 0.03, 0, 0.805, 0);
          for (let r = 0; r < 3; r++) {
            B('trim', HCOL.walnutDark, w - 0.06, 0.01, 0.005, 0, 0.27 + r * 0.22, d / 2 + 0.002);
            for (const sx of [-1, 1]) B('brass', HCOL.brass, 0.1, 0.018, 0.02, sx * w * 0.25, 0.17 + r * 0.22, d / 2 + 0.01);
          }
          // an old television: some of them are on
          B('lacquer', 0x1c1a18, 0.62, 0.46, 0.44, 0.25, 0.82 + 0.23, -0.01);
          if (R() < 0.3) B('glow', 0x8aa0b8, 0.46, 0.34, 0.006, 0.22, 1.05, 0.215, -1);
          else B('lacquer', 0x0c0d0e, 0.46, 0.34, 0.006, 0.22, 1.05, 0.215);
          break;
        }
        case 'wardrobe':
          B('wood', HCOL.teak, w, h - 0.06, d, 0, (h - 0.06) / 2, 0);
          B('wood', HCOL.walnutDark, w + 0.05, 0.06, d + 0.04, 0, h - 0.03, 0);
          B('trim', HCOL.walnutDark, 0.01, h - 0.2, 0.005, 0, h / 2, d / 2 + 0.002);
          for (const sx of [-1, 1]) Cy('brass', HCOL.brass, 0.015, 0.015, 0.03, sx * 0.05, 1.1, d / 2 + 0.015, 8);
          break;
        case 'armchair': case 'settee': this.upholstered(put, w, d, this.pick(HCOL.velvet)); break;
        case 'lowtable':
          B('wood', HCOL.walnut, w, 0.04, d, 0, h - 0.02, 0);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) B('wood', HCOL.walnutDark, 0.04, h - 0.04, 0.04, sx * (w / 2 - 0.05), (h - 0.04) / 2, sz * (d / 2 - 0.05));
          if (R() < 0.5) Cy('paint', HCOL.porcelain, 0.06, 0.04, 0.03, (R() - 0.5) * w * 0.5, h + 0.015, (R() - 0.5) * d * 0.4, 10);
          break;
        case 'luggage': {
          // a brass bird-cage cart with suitcases and a garment bag
          B('brass', HCOL.brass, w, 0.06, d, 0, 0.22, 0);
          B('fabric', 0x6a1014, w - 0.06, 0.02, d - 0.06, 0, 0.26, 0);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) put('paint', whCyl(0.05, 0.05, 0.03, 10, 0, 0, 0).rotateZ(Math.PI / 2).translate(sx * (w / 2 - 0.08), 0.06, sz * (d / 2 - 0.1)), HCOL.black);
          for (const sx of [-1, 1]) Cy('brass', HCOL.brass, 0.018, 0.018, 1.55, sx * (w / 2 - 0.03), 1.02, 0, 8);
          put('brass', whCyl(0.018, 0.018, w - 0.06, 8, 0, 0, 0).rotateZ(Math.PI / 2).translate(0, 1.8, 0), HCOL.brass);
          let y = 0.27;
          for (let m = 0; m < 2 + (R() < 0.5 ? 1 : 0) && y < h - 0.12; m++) {
            const hh = Math.min(h - y, 0.2 + R() * 0.15), ww = 0.6 + R() * 0.3;
            B('fabric', this.pick(HCOL.leather), ww, hh, d - 0.12 - R() * 0.1, (R() - 0.5) * (w - ww - 0.06), y + hh / 2, 0);
            y += hh;
          }
          B('fabric', 0x1a1a22, 0.5, 0.75, 0.08, 0.15, 1.38, 0);
          break;
        }
        case 'suitcase':
          B('fabric', this.pick(HCOL.leather), w, h, d, 0, h / 2, 0);
          B('brass', HCOL.brass, 0.18, 0.03, 0.04, 0, h + 0.015, 0);
          break;
        case 'rtable': this.banquetTable(put, p); break;
        case 'bchair': this.chair(put); break;
        case 'fallenchair': this.chair(this.placer(p.x, p.z, p.yaw, new T3.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, 0.22, 0.47))); break;
        case 'piano': this.piano(put); break;
        case 'buffet': {
          B('fabric', HCOL.linen, w, 0.03, d, 0, h - 0.015, 0);
          B('fabric', HCOL.linen, w, h - 0.06, 0.012, 0, (h - 0.03) / 2, d / 2 - 0.006);
          for (const sx of [-1, 1]) B('fabric', HCOL.linen, 0.012, h - 0.06, d, sx * (w / 2 - 0.006), (h - 0.03) / 2, 0);
          for (const sx of [-0.7, 0, 0.7]) {
            B('brass', HCOL.silver, 0.5, 0.1, 0.34, sx, h + 0.05, 0);
            put('brass', new T3.SphereGeometry(0.2, 12, 4, 0, TAU, 0, Math.PI / 2).scale(1.2, 0.5, 0.8).translate(sx, h + 0.1, 0), HCOL.silver);
          }
          const fx = this.fixNear(p.x, p.z);
          for (const sx of [-1, 1]) {
            Cy('brass', HCOL.gilt, 0.05, 0.07, 0.3, sx * 0.98, h + 0.15, 0, 10);
            Cy('glow', HCOL.linen, 0.012, 0.012, 0.12, sx * 0.98, h + 0.36, 0, 6, fx);
            put('glow', new T3.SphereGeometry(0.014, 4, 2).scale(1, 1.6, 1).translate(sx * 0.98, h + 0.44, 0), HCOL.flame, fx);
          }
          break;
        }
        case 'bar': this.barCounter(put, w, d, h); break;
        case 'backbar': this.backBar(put, p, w, d, h); break;
        case 'stool':
          Cy('brass', HCOL.brass, 0.18, 0.2, 0.025, 0, 0.0125, 0, 16);
          Cy('brass', HCOL.brass, 0.025, 0.025, 0.7, 0, 0.37, 0, 8);
          Cy('fabric', 0x6a1014, 0.2, 0.19, 0.08, 0, 0.74, 0, 16);
          put('brass', whCyl(0.16, 0.16, 0.02, 16, 0, 0.32, 0, true), HCOL.brass);
          break;
        case 'icemachine':
          B('paint', HCOL.steel, w, h, d, 0, h / 2, 0);
          B('lacquer', 0x1a1a1a, w * 0.5, 0.3, 0.02, 0, 0.95, d / 2 + 0.005);
          B('paint', 0x7a7a76, w * 0.5, 0.02, 0.08, 0, 0.8, d / 2 + 0.03);
          B('glow', 0x3a7aaa, 0.05, 0.02, 0.006, w * 0.3, 1.45, d / 2 + 0.004, -1);
          this.signs.push({ text: 'ICE', style: 'name', pos: [...this.local(put, 0, 1.38, d / 2 + 0.004)], nx: Math.sin(p.yaw), nz: Math.cos(p.yaw), w: 0.4, h: 0.12 });
          break;
        case 'vending': {
          B('lacquer', 0x4a1010, w, h, d, 0, h / 2, 0);
          B('glow', 0xf3dcb4, w * 0.6, h * 0.55, 0.012, -w * 0.12, h * 0.56, d / 2 + 0.006, -1);
          for (let k = 0; k < 5; k++) {
            const sy = h * 0.32 + k * h * 0.105;
            B('paint', 0x2a2622, w * 0.58, 0.018, 0.02, -w * 0.12, sy, d / 2 + 0.016);
            for (let m = 0; m < 5; m++) B('paint', this.pick([0xd9d2c3, 0x9e2c1f, 0x2c517c, 0x3f6b3c, 0xd8a531]), 0.07, 0.11, 0.012, -w * 0.12 + (m - 2) * w * 0.11, sy + 0.065, d / 2 + 0.014);
          }
          B('paint', 0x2a2622, w * 0.18, h * 0.3, 0.02, w * 0.33, h * 0.62, d / 2 + 0.01);
          break;
        }
        case 'lbench':
          this.upholstered(put, w, d, 0x6e1216, true);
          break;
        case 'urn':
          Cy('brass', HCOL.brass, 0.13, 0.15, h - 0.04, 0, (h - 0.04) / 2, 0, 16);
          Cy('paint', 0xd8cfb8, 0.12, 0.12, 0.02, 0, h - 0.03, 0, 16);
          Cy('brass', HCOL.brass, 0.15, 0.15, 0.04, 0, h - 0.02, 0, 16, -1);
          break;
      }
    }
  }

  // world position of a local point of a placer (for glows and signs)
  local(put, x, y, z) {
    const v = new T3.Vector3(x, y, z).applyMatrix4(put.m);
    return [v.x, v.y, v.z];
  }

  plant(put, w, h) {
    put.C('brass', HCOL.brass, w / 2 - 0.02, w / 2 - 0.08, h - 0.04, 0, (h - 0.04) / 2, 0, 16);
    put.C('brass', HCOL.gilt, w / 2, w / 2, 0.04, 0, h - 0.02, 0, 16);
    put.C('paint', 0x1a120c, w / 2 - 0.03, w / 2 - 0.03, 0.01, 0, h - 0.02, 0, 12);
    // a kentia palm: arching fronds of broad, flat leaflets
    const R = this.rng, n = 8;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + R() * 0.5, s = Math.sin(a), c = Math.cos(a), len = 0.7 + R() * 0.35, rise = 0.5 + R() * 0.5;
      const x1 = s * len * 0.45, z1 = c * len * 0.45, y1 = h + rise, x2 = s * len, z2 = c * len, y2 = h + rise * 0.6;
      put.S('fabric', HCOL.leaf[1], 0, h, 0, x1, y1, z1, 0.014);
      put('fabric', HotelDressing.blade(x1, y1, z1, x2, y2, z2, 0.012), HCOL.leaf[1]);
      for (let m = 0; m < 4; m++) {
        const t = 0.15 + m * 0.24, px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t, pz = z1 + (z2 - z1) * t, l = 0.3 * (1 - t * 0.45);
        for (const side of [-1, 1]) put('fabric', HotelDressing.blade(px, py, pz, px + c * side * l + s * 0.08, py - 0.1 - t * 0.08, pz - s * side * l + c * 0.08, 0.07), this.pick(HCOL.leaf));
      }
    }
  }

  // a flat strip from a to b, width w, lying as flat as it can
  static blade(ax, ay, az, bx, by, bz, w) {
    const Y = new T3.Vector3(bx - ax, by - ay, bz - az), len = Y.length();
    Y.multiplyScalar(1 / len);
    const X = new T3.Vector3().crossVectors(Y, new T3.Vector3(0, 1, 0));
    if (X.lengthSq() < 1e-6) X.set(1, 0, 0);
    X.normalize();
    const Z = new T3.Vector3().crossVectors(X, Y);
    const m = new T3.Matrix4().makeBasis(X, Y, Z).setPosition((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    return new T3.BoxGeometry(w, len, 0.006).applyMatrix4(m);
  }

  bed(put, p, w, d) {
    const R = this.rng, B = put.B, single = p.kind === 'bed1';
    const bw = w, bl = d - 0.1, z0 = 0.05, cover = single ? this.pick([0xe6e0d2, 0x6e1216]) : this.pick([0x6e1216, 0xa8823a, 0xe6e0d2, 0xa8823a]);
    B('wood', HCOL.teak, bw, 0.3, bl, 0, 0.15, z0);
    B('fabric', HCOL.linen, bw - 0.04, 0.22, bl - 0.04, 0, 0.41, z0);
    B('fabric', cover, bw + 0.04, 0.08, bl * 0.72, 0, 0.55, z0 + bl * 0.14);
    for (const s of [-1, 1]) B('fabric', cover, 0.012, 0.32, bl * 0.72, s * (bw / 2 + 0.026), 0.43, z0 + bl * 0.14);
    B('fabric', cover, bw + 0.04, 0.32, 0.012, 0, 0.43, z0 + bl * 0.5 + 0.006);
    for (const s of single ? [0] : [-1, 1]) B('fabric', HCOL.linen, single ? 0.6 : 0.62, 0.15, 0.36, s * 0.38, 0.595, z0 - bl / 2 + 0.24);
    // made up the hotel way, so it reads as a bed on the dark carpet: the top sheet turned down
    // over the cover, a scarf across the foot
    B('fabric', HCOL.linen, bw + 0.05, 0.09, 0.24, 0, 0.552, z0 - bl * 0.22 + 0.12);
    const scarf = cover === 0xa8823a || cover === 0xe6e0d2 ? 0x6e1216 : 0xa8823a;
    B('fabric', scarf, bw + 0.06, 0.094, 0.42, 0, 0.553, z0 + bl * 0.5 - 0.36);
    for (const s of [-1, 1]) B('fabric', scarf, 0.012, 0.3, 0.42, s * (bw / 2 + 0.034), 0.45, z0 + bl * 0.5 - 0.36);
    // the headboard, padded and framed (as tall as its collider); now and then the covers are
    // not empty
    const hb = single ? 1.1 : 1.25;
    B('fabric', this.pick(HCOL.velvet), bw + 0.06, hb - 0.66, 0.08, 0, (0.6 + hb - 0.06) / 2, -d / 2 + 0.05);
    B('wood', HCOL.walnutDark, bw + 0.12, 0.08, 0.1, 0, hb - 0.04, -d / 2 + 0.05);
    for (const s of [-1, 1]) B('wood', HCOL.walnutDark, 0.06, hb, 0.1, s * (bw / 2 + 0.03), hb / 2, -d / 2 + 0.05);
    if (R() < 0.12) put('fabric', new T3.SphereGeometry(0.5, 8, 4).scale(0.42, 0.2, 1.5).translate(bw * 0.12, 0.6, z0 + 0.05), cover);
  }

  upholstered(put, w, d, col, bench = false) {
    const B = put.B;
    if (bench) {
      B('fabric', col, w, 0.16, d, 0, 0.38, 0);
      B('trim', HCOL.walnutDark, w - 0.04, 0.12, d - 0.04, 0, 0.26, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B('wood', HCOL.walnutDark, 0.05, 0.2, 0.05, sx * (w / 2 - 0.06), 0.1, sz * (d / 2 - 0.06));
      for (let k = 1; k < 4; k++) B('fabric', new T3.Color(col).multiplyScalar(0.7).getHex(), 0.006, 0.005, d - 0.04, -w / 2 + (k * w) / 4, 0.462, 0);
      return;
    }
    const arm = 0.13;
    B('fabric', col, w - 2 * arm, 0.17, d - 0.2, 0, 0.36, 0.08);
    B('fabric', col, w, 0.22, d, 0, 0.19, 0);
    B('fabric', col, w, 0.55, 0.16, 0, 0.6, -d / 2 + 0.08);
    for (const s of [-1, 1]) B('fabric', col, arm, 0.3, d - 0.06, s * (w / 2 - arm / 2), 0.45, 0.03);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B('wood', HCOL.walnutDark, 0.05, 0.08, 0.05, sx * (w / 2 - 0.06), 0.04, sz * (d / 2 - 0.06));
    if (w > 1.4) B('fabric', new T3.Color(col).multiplyScalar(0.75).getHex(), 0.008, 0.172, d - 0.22, 0, 0.362, 0.08);
  }

  chair(put) {
    // a gilt Chiavari chair with an ivory seat pad
    const B = put.B, g = HCOL.gilt;
    for (const sx of [-1, 1]) {
      B('brass', g, 0.025, 0.45, 0.025, sx * 0.19, 0.225, 0.19);
      B('brass', g, 0.025, 0.95, 0.025, sx * 0.19, 0.475, -0.19);
    }
    B('brass', g, 0.4, 0.03, 0.4, 0, 0.45, 0);
    B('fabric', this.rng() < 0.7 ? HCOL.ivory : 0x6e1216, 0.38, 0.05, 0.38, 0, 0.49, 0.01);
    for (const y of [0.64, 0.76, 0.9]) B('brass', g, 0.38, 0.022, 0.022, 0, y, -0.19);
    for (const y of [0.16]) for (const s of [-1, 1]) B('brass', g, 0.02, 0.02, 0.36, s * 0.19, y, 0);
  }

  banquetTable(put, p) {
    const R = this.rng, fx = this.fixNear(p.x, p.z);
    // floor-length cloth over a round top
    put.C('fabric', HCOL.linen, 0.75, 0.75, 0.03, 0, 0.755, 0, 28);
    put('fabric', whCyl(0.76, 0.8, 0.72, 28, 0, 0.38, 0, true), HCOL.linen);
    // a candelabra, place settings, a fallen glass
    put.C('brass', HCOL.gilt, 0.1, 0.12, 0.03, 0, 0.785, 0, 14);
    put.C('brass', HCOL.gilt, 0.02, 0.025, 0.36, 0, 0.98, 0, 8);
    for (let a = 0; a < 3; a++) {
      const ang = (a * TAU) / 3, s = Math.sin(ang) * 0.14, c = Math.cos(ang) * 0.14;
      put.S('brass', HCOL.gilt, 0, 1.1, 0, s, 1.16, c, 0.014);
      put.C('glow', HCOL.linen, 0.012, 0.012, 0.12, s, 1.23, c, 6, fx);
      put('glow', new T3.SphereGeometry(0.014, 4, 2).scale(1, 1.6, 1).translate(s, 1.31, c), HCOL.flame, fx);
    }
    this.glowAt(...this.local(put, 0, 1.3, 0), 0.9, fx);
    const k0 = R() * TAU;
    for (let k = 0; k < 6; k++) {
      if (R() < 0.2) continue;
      const a = k0 + (k * TAU) / 6, s = Math.sin(a), c = Math.cos(a);
      put.C('paint', HCOL.porcelain, 0.13, 0.11, 0.012, s * 0.55, 0.776, c * 0.55, 14);
      if (R() < 0.85) put.C('paint', 0xe8e4dc, 0.03, 0.022, 0.1, s * 0.5 + c * 0.16, 0.82, c * 0.5 - s * 0.16, 8);
      else put('paint', whCyl(0.03, 0.022, 0.1, 8, 0, 0, 0).rotateZ(Math.PI / 2).translate(s * 0.5 + c * 0.16, 0.8, c * 0.5 - s * 0.16), 0xe8e4dc);
    }
  }

  piano(put) {
    // a grand piano, lid shut: the case, its curved side, three legs, the keyboard at the front
    const B = put.B, k = HCOL.black;
    B('lacquer', k, 1.5, 0.34, 1.15, 0, 0.82, 0.4);
    B('lacquer', k, 0.95, 0.34, 0.8, -0.27, 0.82, -0.57);
    put('lacquer', new T3.CylinderGeometry(0.545, 0.545, 0.34, 14, 1, false, Math.PI / 2, Math.PI / 2).translate(0.205, 0.82, -0.175), k);
    B('lacquer', 0x1a1a1a, 1.5, 0.02, 1.15, 0, 1.0, 0.4);
    for (const [x, z] of [[-0.6, 0.85], [0.6, 0.85], [-0.27, -0.85]]) put.C('lacquer', k, 0.05, 0.04, 0.65, x, 0.33, z, 10);
    B('paint', 0xeeeae2, 1.3, 0.035, 0.16, 0, 0.72, 0.89);
    for (let m = 0; m < 22; m++) if (m % 7 !== 2 && m % 7 !== 6) B('lacquer', k, 0.022, 0.02, 0.09, -0.62 + m * 0.059, 0.75, 0.86);
    B('lacquer', k, 1.4, 0.06, 0.06, 0, 0.76, 0.94);
    B('lacquer', k, 0.7, 0.2, 0.02, 0, 1.1, 0.7);
    put.C('brass', HCOL.gilt, 0.02, 0.02, 0.2, 0, 0.12, 0.6, 6);
  }

  barCounter(put, w, d, h) {
    const B = put.B;
    B('wood', HCOL.walnut, w, h - 0.06, d - 0.08, 0, (h - 0.06) / 2, -0.04);
    for (let x = -w / 2 + 0.25; x < w / 2 - 0.1; x += 0.5) B('wood', HCOL.walnutDark, 0.42, h - 0.32, 0.02, x + 0.0, h / 2 - 0.02, d / 2 - 0.07);
    B('lacquer', 0x1a0c06, w + 0.04, 0.06, d, 0, h - 0.03, 0);
    put('brass', whCyl(0.022, 0.022, w - 0.1, 10, 0, 0, 0).rotateZ(Math.PI / 2).translate(0, 0.2, d / 2 - 0.01), HCOL.brass);
    for (let x = -w / 2 + 0.1; x < w / 2; x += 0.9) put.B('brass', HCOL.brass, 0.02, 0.2, 0.06, x, 0.1, d / 2 - 0.04);
    for (const x of [-0.5, 0.2]) {
      put.C('brass', HCOL.brass, 0.03, 0.03, 0.2, x, h + 0.1, -0.1, 10);
      put.C('lacquer', HCOL.black, 0.012, 0.012, 0.12, x, h + 0.26, -0.1, 6);
    }
  }

  backBar(put, p, w, d, h) {
    const B = put.B, R = this.rng, fx = this.fixNear(p.x, p.z);
    B('wood', HCOL.walnut, w, 0.9, d, 0, 0.45, 0);
    B('lacquer', 0x16100c, w, h - 0.9, 0.02, 0, 0.9 + (h - 0.9) / 2, -d / 2 + 0.01);
    for (const y of [1.25, 1.65]) B('wood', HCOL.walnutDark, w, 0.03, d - 0.05, 0, y, 0.02);
    B('wood', HCOL.walnutDark, w + 0.04, 0.08, d, 0, h - 0.04, 0);
    for (const sx of [-1, 1]) B('wood', HCOL.walnutDark, 0.05, h - 0.9, d, sx * (w / 2 - 0.025), 0.9 + (h - 0.9) / 2, 0);
    // backlit bottles on the counter and the shelves
    for (const y of [0.9, 1.265, 1.665]) for (let x = -w / 2 + 0.12; x < w / 2 - 0.1; x += 0.1 + R() * 0.06) {
      if (R() < 0.12) continue;
      const bh = 0.2 + R() * 0.12, col = this.pick(HCOL.bottle);
      put.C('glow', col, 0.035, 0.035, bh, x, y + bh / 2, 0.02, 8, fx);
      put.C('glow', col, 0.012, 0.016, 0.07, x, y + bh + 0.035, 0.02, 6, fx);
    }
  }

  // ---- paintings and mirrors -------------------------------------------------------------------
  buildWallArt() {
    const L = this.level, A = HOTEL_AREA;
    for (const pt of L.paintings) {
      const big = pt.area === A.BALL, w = big ? 1.1 : pt.area === A.LOBBY ? 1.0 : 0.85, h = big ? 1.4 : pt.mirror ? 1.05 : 0.65;
      const y = big ? 1.95 : 1.68;
      const put = this.placer(pt.x, pt.z, Math.atan2(pt.nx, pt.nz));
      const fw = 0.07;
      for (const s of [-1, 1]) {
        put.B('brass', HCOL.gilt, w + 2 * fw, fw, 0.045, 0, y + s * (h / 2 + fw / 2), 0.0225);
        put.B('brass', HCOL.gilt, fw, h, 0.045, s * (w / 2 + fw / 2), y, 0.0225);
      }
      if (pt.mirror) put.B('lacquer', 0x15130f, w, h, 0.01, 0, y, 0.01);
      else this.signs.push({ style: 'painting', text: '', pos: [...this.local(put, 0, y, 0.012)], nx: pt.nx, nz: pt.nz, w, h, seed: this.rng(), tall: h > w });
    }
  }

  // ---- corridor ends: a fire exit or a curtained window ------------------------------------------
  buildDeadEnds() {
    const L = this.level, n = L.n, C = L.cell, t = L.wallT, A = HOTEL_AREA, R = this.rng;
    for (let c = 0; c < n * n; c++) {
      if (L.area[c] !== A.HALL) continue;
      const i = c % n, j = (c / n) | 0, open = [0, 1, 2, 3].filter((d) => L.wallOpen(i, j, d));
      if (open.length !== 1) continue;
      const d = open[0] ^ 1;
      if (L.edgeVal(i, j, d) !== 1) continue;
      const ctr = L.cellCenter(c), nx = d === 0 ? 1 : d === 1 ? -1 : 0, nz = d === 2 ? 1 : d === 3 ? -1 : 0;
      const x = ctr.x + nx * (C / 2 - t / 2), z = ctr.z + nz * (C / 2 - t / 2), ox = -nx, oz = -nz;
      const put = this.placer(x, z, Math.atan2(ox, oz));
      if (R() < 0.5) {
        // a steel fire door with a push bar and a wired window, EXIT over it
        put.B('paint', 0x5a1a14, 1.0, 2.1, 0.04, 0, 1.05, 0.02);
        put.B('paint', 0x2a2420, 1.12, 2.16, 0.02, 0, 1.08, 0.01);
        put.B('lacquer', 0x050506, 0.22, 0.5, 0.006, 0.2, 1.55, 0.043);
        put.B('brass', HCOL.silver, 0.8, 0.05, 0.07, 0, 1.0, 0.07);
        this.signs.push({ text: 'EXIT', style: 'exit', pos: [...this.local(put, 0, 2.45, 0.04)], nx: ox, nz: oz, w: 0.44, h: 0.2, glow: true });
        put.B('paint', 0x1a0806, 0.5, 0.25, 0.06, 0, 2.45, 0.008);
        this.signs.push({ text: 'STAIRS', style: 'name', pos: [...this.local(put, 0.75, 1.55, 0.01)], nx: ox, nz: oz, w: 0.36, h: 0.11 });
      } else {
        // a tall window onto nothing, heavy drapes either side
        put.B('lacquer', 0x05070b, 1.2, 1.9, 0.01, 0, 1.55, 0.01);
        put.B('paint', HCOL.ivory, 1.3, 0.08, 0.06, 0, 0.58, 0.03);
        for (const s of [-1, 1]) put.B('paint', HCOL.ivory, 0.05, 1.9, 0.03, s * 0.62, 1.55, 0.015);
        put.B('paint', HCOL.ivory, 0.03, 1.9, 0.02, 0, 1.55, 0.015);
        put.B('paint', HCOL.ivory, 1.2, 0.03, 0.02, 0, 1.9, 0.015);
        for (const s of [-1, 1]) put.B('fabric', 0x5a0e12, 0.5, 2.7, 0.14, s * 0.85, 1.38, 0.09);
        put.B('fabric', 0x5a0e12, 2.2, 0.3, 0.16, 0, 2.86, 0.1);
        put('brass', whCyl(0.02, 0.02, 2.3, 8, 0, 0, 0).rotateZ(Math.PI / 2).translate(0, 2.75, 0.18), HCOL.brass);
      }
    }
  }

  // ---- direction signs where a cross corridor meets a row of rooms: which numbers lie which way
  buildDirections() {
    const L = this.level, n = L.n, C = L.cell, t = L.wallT, A = HOTEL_AREA;
    const hall = (i, j) => i >= 0 && j >= 0 && i < n && j < n && L.area[j * n + i] === A.HALL;
    for (let c = 0; c < n * n; c++) {
      if (L.area[c] !== A.HALL) continue;
      const i = c % n, j = (c / n) | 0;
      for (const [d, along] of [[2, 'x'], [3, 'x'], [0, 'z'], [1, 'z']]) {
        // a row running along `along`, this side closed, the opposite side open onto a cross corridor
        const ax = along === 'x';
        if (!(ax ? hall(i - 1, j) && hall(i + 1, j) : hall(i, j - 1) && hall(i, j + 1))) continue;
        const od = d ^ 1, oi = i + (od === 0 ? 1 : od === 1 ? -1 : 0), oj = j + (od === 2 ? 1 : od === 3 ? -1 : 0);
        if (L.edgeVal(i, j, d) !== 1 || L.edgeVal(i, j, od) !== 0 || !hall(oi, oj)) continue;
        const ctr = L.cellCenter(c), nx = d === 0 ? 1 : d === 1 ? -1 : 0, nz = d === 2 ? 1 : d === 3 ? -1 : 0;
        const x = ctr.x + nx * (C / 2 - t / 2), z = ctr.z + nz * (C / 2 - t / 2), ox = -nx, oz = -nz;
        // the doors along this row, left and right as seen facing the sign
        const left = [], right = [];
        for (const g of L.guestDoors) {
          const h = L.cellCenter(g.hall);
          if (ax ? Math.abs(h.z - ctr.z) > 0.1 : Math.abs(h.x - ctr.x) > 0.1) continue;
          const u = (h.x - x) * oz - (h.z - z) * ox;
          if (Math.abs(u) > 0.5) (u > 0 ? right : left).push(+g.num); // not the door under the sign
        }
        const span = (a) => (a.length ? `${Math.min(...a)}–${Math.max(...a)}` : '');
        const text = [left.length ? `← ${span(left)}` : '', right.length ? `${span(right)} →` : ''].filter(Boolean).join('     ');
        if (!text) continue;
        const [sx, sz] = HotelDressing.wp(x, z, ox, oz, 0, 0.015);
        this.signs.push({ text, style: 'dir', pos: [sx, 2.6, sz], nx: ox, nz: oz, w: text.length > 14 ? 1.3 : 0.7, h: 0.17 });
        this.placer(x, z, Math.atan2(ox, oz)).B('brass', HCOL.gilt, (text.length > 14 ? 1.3 : 0.7) + 0.04, 0.21, 0.012, 0, 2.6, 0.006);
      }
    }
  }

  // ---- signs: one canvas atlas per level (room numbers, names, dials, exits, paintings) --------
  buildSigns() {
    const signs = this.signs;
    if (!signs.length) return;
    const size = (s) => (s.style === 'plaque' ? [128, 64] : s.style === 'painting' ? (s.tall ? [192, 256] : [256, 192]) : s.style === 'dial' ? [256, 128] : s.style === 'exit' ? [128, 64] : [Math.min(640, Math.round((96 * s.w) / s.h / 8) * 8), 96]);
    // shelf packing into a 2048-wide canvas
    const W = 2048;
    let x = 0, y = 0, rowH = 0;
    for (const s of signs) {
      const [w, h] = size(s);
      if (x + w > W) { x = 0; y += rowH; rowH = 0; }
      s.px = [x, y, w, h];
      x += w;
      rowH = Math.max(rowH, h);
    }
    const Hc = y + rowH;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = Hc;
    const g = cv.getContext('2d');
    const serif = 'Georgia, "Times New Roman", "DejaVu Serif", serif';
    for (const s of signs) {
      const [x0, y0, w, h] = s.px;
      g.save();
      g.translate(x0, y0);
      g.beginPath(); g.rect(0, 0, w, h); g.clip();
      if (s.style === 'plaque') {
        const gr = g.createLinearGradient(0, 0, w, h);
        gr.addColorStop(0, '#e7c46a'); gr.addColorStop(0.5, '#b8892e'); gr.addColorStop(1, '#d9b04e');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#5a3c10'; g.lineWidth = 3; g.strokeRect(5, 5, w - 10, h - 10);
        g.fillStyle = '#1e1206';
        g.font = `700 40px ${serif}`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(s.text, w / 2, h / 2 + 2, w - 16);
      } else if (s.style === 'name') {
        g.fillStyle = '#1c0c06'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#c9a046'; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12);
        g.lineWidth = 1; g.strokeRect(12, 12, w - 24, h - 24);
        g.fillStyle = '#e0bc62';
        g.font = `600 ${s.text.length > 6 ? 46 : 56}px ${serif}`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(s.text.split('').join(String.fromCharCode(8202)), w / 2, h / 2 + 3, w - 40);
      } else if (s.style === 'dir') {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#d8b25a'); gr.addColorStop(1, '#a8802e');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#4a3010'; g.lineWidth = 3; g.strokeRect(5, 5, w - 10, h - 10);
        g.fillStyle = '#1e1206';
        g.font = `700 50px ${serif}`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(s.text, w / 2, h / 2 + 3, w - 30);
      } else if (s.style === 'exit') {
        g.fillStyle = '#160404'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#ff3424';
        g.font = `900 44px Arial, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('EXIT', w / 2, h / 2 + 2, w - 12);
      } else if (s.style === 'dial') {
        // a floor indicator: an arc of numbers and a needle
        g.fillStyle = '#1a1208'; g.fillRect(0, 0, w, h);
        const cx = w / 2, cy = h - 10, r = h - 26;
        g.fillStyle = '#f0c070';
        g.beginPath(); g.arc(cx, cy, r + 10, Math.PI, 0); g.fill();
        g.fillStyle = '#2a1a0a';
        g.font = `700 17px ${serif}`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        const labels = ['L', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        labels.forEach((t, k) => { const a = Math.PI + (k / (labels.length - 1)) * Math.PI; g.fillText(t, cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6)); });
        const a = Math.PI + (s.needle * 1.25 - 0.12) * Math.PI;
        g.strokeStyle = '#3a0a04'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (r - 22), cy + Math.sin(a) * (r - 22)); g.stroke();
        g.fillStyle = '#3a2a10'; g.beginPath(); g.arc(cx, cy, 8, 0, TAU); g.fill();
      } else if (s.style === 'painting') this.paint(g, w, h, s.seed);
      g.restore();
    }
    const tex = new T3.CanvasTexture(cv);
    tex.colorSpace = T3.SRGBColorSpace;
    tex.anisotropy = 4;
    this.textures.push(tex);
    this.mats.sign = patchLattice(new T3.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.15 }), this.view.shared, { key: 'ht-sign' });
    this.mats.signGlow = new T3.MeshBasicMaterial({ map: tex });
    this.mats.signGlow.color.setRGB(1.9, 1.7, 1.6);
    for (const s of signs) {
      const geo = new T3.PlaneGeometry(s.w, s.h), uv = geo.attributes.uv, [x0, y0, w, h] = s.px;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * w) / W, 1 - (y0 + (1 - uv.getY(i)) * h) / Hc);
      geo.rotateY(Math.atan2(s.nx, s.nz)).translate(...s.pos);
      this.add(s.glow ? 'signGlow' : 'sign', geo);
    }
  }

  // a small dark oil painting: a dusk landscape, a sea, a house at night, or a sitter with no face
  paint(g, w, h, seed) {
    const R = Lab.rng((seed * 1e9) | 0), kind = Math.floor(R() * 4);
    const sky = g.createLinearGradient(0, 0, 0, h);
    const tones = [['#4a2a12', '#b06a2a', '#e8a85a'], ['#1c2230', '#4a5468', '#9a8a6a'], ['#2a1210', '#6a3018', '#c0703a']][Math.floor(R() * 3)];
    sky.addColorStop(0, tones[0]); sky.addColorStop(0.65, tones[1]); sky.addColorStop(1, tones[2]);
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    if (kind === 3) {
      // a portrait: dark ground, shoulders, a pale blank oval
      g.fillStyle = '#2a1a10'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#4a2416'; g.beginPath(); g.ellipse(w / 2, h * 1.02, w * 0.42, h * 0.38, 0, 0, TAU); g.fill();
      g.fillStyle = '#c8b090'; g.beginPath(); g.ellipse(w / 2, h * 0.42, w * 0.15, h * 0.17, 0, 0, TAU); g.fill();
      g.fillStyle = '#1a0e08'; g.beginPath(); g.ellipse(w / 2, h * 0.3, w * 0.18, h * 0.1, 0, Math.PI, 0); g.fill();
    } else {
      // hills or a sea horizon, a building or a moon
      g.fillStyle = 'rgba(240, 220, 180, 0.7)'; g.beginPath(); g.arc(w * (0.2 + R() * 0.6), h * (0.15 + R() * 0.2), 6 + R() * 8, 0, TAU); g.fill();
      for (let layer = 0; layer < 3; layer++) {
        g.fillStyle = ['#4a3420', '#2e2014', '#160e08'][layer];
        g.beginPath(); g.moveTo(0, h);
        const base = h * (0.55 + layer * 0.12) + (kind === 1 ? 0 : 0);
        for (let x = 0; x <= w; x += 8) g.lineTo(x, base - (kind === 1 ? (layer === 0 ? 0 : R() * 4) : Math.sin(x * 0.02 + layer * 2 + R() * 0.3) * 18 + R() * 6));
        g.lineTo(w, h); g.fill();
      }
      if (kind === 2) {
        // a house on the hill, one window lit
        const bx = w * (0.3 + R() * 0.4), by = h * 0.6;
        g.fillStyle = '#080404'; g.fillRect(bx - 26, by - 30, 52, 34);
        g.beginPath(); g.moveTo(bx - 32, by - 30); g.lineTo(bx, by - 52); g.lineTo(bx + 32, by - 30); g.fill();
        g.fillStyle = '#e8b050'; g.fillRect(bx + 6, by - 20, 8, 10);
      }
    }
    // varnish and craquelure
    g.fillStyle = 'rgba(90, 50, 0, 0.12)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0, 0, 0, 0.12)'; g.lineWidth = 1;
    for (let k = 0; k < 40; k++) { g.beginPath(); const x = R() * w, y = R() * h; g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 30, y + (R() - 0.5) * 30); g.stroke(); }
  }

  // ---- glows: halos round every lamp, and the sconces' light on the walls -----------------------
  buildGlows() {
    const h = this.halo;
    if (h.idx.length) {
      const hg = new T3.BufferGeometry();
      hg.setAttribute('position', new T3.Float32BufferAttribute(h.pos, 3));
      hg.setAttribute('aCenter', new T3.Float32BufferAttribute(h.ctr, 3));
      hg.setAttribute('aFix', new T3.Float32BufferAttribute(h.fix, 1));
      hg.setAttribute('aSize', new T3.Float32BufferAttribute(h.size, 1));
      hg.setIndex(h.idx);
      const hm = new T3.Mesh(hg, this.mats.halo);
      hm.frustumCulled = false; // vertices move in the shader
      hm.renderOrder = 6;
      this.view.scene.add(hm);
      this.glow = [hm];
    }
    if (this.wash.length) {
      // a quad 1.9 m wide from 0.2 m up to the ceiling, 1 cm off the wall, per sconce
      const pos = [], q = [], fix = [], idx = [], H = this.level.ceiling, ys = 1.86;
      for (const { s, k } of this.wash) {
        const b = pos.length / 3;
        for (const [u, y] of [[-0.95, 0.2], [0.95, 0.2], [0.95, H], [-0.95, H]]) {
          const [x, z] = HotelDressing.wp(s.x, s.z, s.nx, s.nz, u, 0.012);
          pos.push(x, y, z);
          q.push(u, y - ys);
          fix.push(k);
        }
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      const wg = new T3.BufferGeometry();
      wg.setAttribute('position', new T3.Float32BufferAttribute(pos, 3));
      wg.setAttribute('aQ', new T3.Float32BufferAttribute(q, 2));
      wg.setAttribute('aFix', new T3.Float32BufferAttribute(fix, 1));
      wg.setIndex(idx);
      wg.computeBoundingSphere();
      const wm = new T3.Mesh(wg, this.mats.wash);
      wm.renderOrder = 4;
      this.view.scene.add(wm);
      (this.glow ||= []).push(wm);
    }
  }

  // ---- per frame -------------------------------------------------------------------------------
  update() {
    const fog = this.view.scene.fog;
    for (const m of this.glow || []) m.material.uniforms.uFogD.value = fog ? fog.density : 0;
  }

  dispose() { for (const t of this.textures) t.dispose(); }
}
