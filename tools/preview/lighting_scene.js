// Lighting preview — a minimal fake MapRuntime (exactly the TECH §5.7a surface lighting consumes)
// plus a quick flat-ish painter for the world underneath, so lighting can be judged without the
// engine or the (possibly stubbed) art modules. Not shipped.
import { TILES, LEGEND } from '../../src/data/tiles.js';
import { propDef } from '../../src/data/props.js';

const TILE = 16;
const WK = [null, 'top', 'face_high', 'face_low'];

function h2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Fake MapRuntime: tiles, wall kinds, opacity (tiles + opaque props), windows, lights, props. */
export class FakeMap {
  constructor({ id, tiles, data = {}, objects = [], lights = [], doors = {} }) {
    this.id = id;
    this.data = { id, dark: 0.92, ambient: '#0b1020', floor: '1F', ...data };
    this.h = tiles.length;
    this.w = tiles[0].length;
    this.rows = tiles;
    this.opaqueVersion = 0;
    this.lightsVersion = 0;
    this._wk = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this._wk[y * this.w + x] = this._kindOf(x, y);
    this.props = objects.map((o, i) => {
      const def = propDef(o.type);
      return { id: o.id || `${id}_${o.type}_${o.x}_${o.y}_${i}`, type: o.type, def, x: o.x, y: o.y, w: def.w, h: def.h,
        state: o.state || def.states[0], params: o, solid: o.solid ?? def.solid, opaque: o.opaque ?? def.opaque, inst: o };
    });
    // Auto door props at the bottom two cells of each vertical D run in wall rows.
    for (let x = 0; x < this.w; x++) {
      for (let y = 0; y < this.h; y++) {
        if (this.tileAt(x, y) !== 'door' || this.tileAt(x, y + 1) === 'door') continue;
        let top = y;
        while (this.tileAt(x, top - 1) === 'door') top--;
        const run = y - top + 1;
        const o = doors[`${x},${y}`] || {};
        const type = o.type || (run >= 2 ? 'door_class' : 'door_side');
        const def = propDef(type);
        const py = run >= 2 ? y - 1 : y;
        this.props.push({ id: `${id}_door_${x}_${y}`, type, def, x, y: py, w: def.w, h: run >= 2 ? 2 : 1, state: o.state || 'closed',
          params: o, solid: true, opaque: def.opaque, inst: o, door: true });
      }
    }
    this._dataLights = lights;
    this._rebuild();
  }

  _wall(x, y) { const k = TILES[this.tileAt(x, y)].kind; return k === 'wall' || k === 'window'; }
  _open(x, y) { const key = this.tileAt(x, y); const k = TILES[key].kind; return key !== 'void' && k !== 'wall' && k !== 'window'; }
  _kindOf(x, y) {
    if (!this._wall(x, y)) return 0;
    if (this._open(x, y + 1)) return 3;
    if (this._wall(x, y + 1) && this._open(x, y + 2)) return 2;
    return 1;
  }
  _rebuild() {
    this._op = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this._op[y * this.w + x] = TILES[this.tileAt(x, y)].opaque ? 1 : 0;
    for (const p of this.props) {
      p.opaque = (p.inst.opaque ?? p.def.opaque) && !(p.def.interact === 'door' && p.state === 'open');
      if (!p.opaque) continue;
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) this._op[y * this.w + x] = 1;
    }
    this._lightDefs = null;
  }

  tileAt(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 'void';
    return LEGEND[this.rows[y][x]] || 'void';
  }
  wallKind(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : WK[this._wk[y * this.w + x]]; }
  isOpaque(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? true : this._op[y * this.w + x] === 1; }
  isSolid(x, y) { return this.isOpaque(x, y); }
  prop(id) { return this.props.find((p) => p.id === id) || null; }
  setDoor(id, state) { const p = this.prop(id); if (p) { p.state = state; this._rebuild(); this.opaqueVersion++; } }

  get windowCells() {
    if (!this._win) {
      this._win = [];
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        if (this._wk[y * this.w + x] === 3 && TILES[this.tileAt(x, y)].kind === 'window') this._win.push({ tx: x, ty: y });
      }
    }
    return this._win;
  }

  get lightDefs() {
    if (!this._lightDefs) {
      const out = this._dataLights.map((l, i) => ({ id: `${this.id}_light_${i}`, ...l }));
      for (const p of this.props) {
        const spec = p.inst.light ?? p.def.light;
        if (!spec) continue;
        const L = typeof spec === 'string' ? { type: spec } : { ...spec };
        out.push({ ...L, id: `${p.id}_light`, propId: p.id, x: L.x ?? p.x + (p.w - 1) / 2, y: L.y ?? p.y + (p.h - 1) / 2,
          on: L.on ?? !['off', 'dead', 'out'].includes(p.state), flicker: L.flicker ?? (p.state === 'flicker' ? true : undefined) });
      }
      this._lightDefs = out;
    }
    return this._lightDefs;
  }

  los() { return true; }
}

// ---------------------------------------------------------------------------------------- painter
const C = {
  lino: ['#8b8366', '#6a705a'], hall: ['#5d594b', '#57534a'], wood: ['#9a7247', '#86613b'], carpet: ['#5b3b2d', '#53362a'],
  concrete: ['#5a5852', '#525049'], tile: ['#a9aca2', '#9a9d94'], asphalt: ['#2c2d31', '#27282c'], grass: ['#4e5236', '#454a30'],
  stone: ['#77746c', '#6c6962'],
  cream: '#bcae84', creamD: '#9e9270', green: '#435e49', greenD: '#2a3d30', rail: '#c9bd94', top: '#111117', topHi: '#1d1d25',
  brick: '#6e3226', brickD: '#4a2019', mortar: '#7a6d5e', glass: '#1b2741', glassL: '#2f4a72', frame: '#5d4630', sill: '#8c7a5a',
};

function floorColors(key) {
  switch (key) {
    case 'floor_lino': return C.lino;
    case 'floor_lino_hall': return C.hall;
    case 'floor_wood': case 'floor_planks': return C.wood;
    case 'floor_carpet': return C.carpet;
    case 'floor_tile': return C.tile;
    case 'floor_asphalt': return C.asphalt;
    case 'floor_grass': return C.grass;
    case 'floor_stone': case 'floor_marble': return C.stone;
    case 'door': return C.hall;
    default: return C.concrete;
  }
}

function drawFloor(ctx, key, x, y, sx, sy) {
  const [a, b] = floorColors(key);
  if (key === 'floor_lino') {
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      ctx.fillStyle = (i + j + x * 2 + y * 2) % 2 ? a : b;
      ctx.fillRect(sx + i * 8, sy + j * 8, 8, 8);
    }
  } else if (key === 'floor_wood' || key === 'floor_planks') {
    ctx.fillStyle = a; ctx.fillRect(sx, sy, 16, 16);
    ctx.fillStyle = b;
    for (let j = 0; j < 16; j += 4) ctx.fillRect(sx, sy + j, 16, 1);
    ctx.fillRect(sx + ((y * 7) % 16), sy, 1, 4);
  } else {
    ctx.fillStyle = a; ctx.fillRect(sx, sy, 16, 16);
    ctx.fillStyle = b; ctx.fillRect(sx, sy, 16, 1); ctx.fillRect(sx, sy, 1, 16);
  }
  // grime speckle
  for (let k = 0; k < 6; k++) {
    const r = h2(x * 16 + k, y * 16 + k, 3);
    if (r < 0.5) continue;
    ctx.fillStyle = r > 0.8 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(sx + Math.floor(h2(x, y, k) * 16), sy + Math.floor(h2(y, x, k + 9) * 16), 1, 1);
  }
}

function drawWall(ctx, map, key, kind, x, y, sx, sy) {
  const brick = key === 'wall_brick' || key === 'window_brick';
  const win = key.startsWith('window');
  if (kind === 'top' || !kind) {
    ctx.fillStyle = C.top; ctx.fillRect(sx, sy, 16, 16);
    if (map.wallKind(x, y + 1) === 'face_high' || map.wallKind(x, y + 1) === 'face_low') { ctx.fillStyle = C.topHi; ctx.fillRect(sx, sy + 14, 16, 2); }
    return;
  }
  if (brick) {
    ctx.fillStyle = C.brick; ctx.fillRect(sx, sy, 16, 16);
    ctx.fillStyle = C.mortar;
    for (let j = 0; j < 16; j += 4) {
      ctx.fillRect(sx, sy + j, 16, 1);
      const off = ((j / 4 + y * 4) % 2) * 4;
      for (let i = off; i < 16; i += 8) ctx.fillRect(sx + i, sy + j, 1, 4);
    }
  } else if (kind === 'face_high') {
    ctx.fillStyle = C.cream; ctx.fillRect(sx, sy, 16, 16);
    ctx.fillStyle = C.creamD; ctx.fillRect(sx, sy, 16, 2);
    if (h2(x, y, 1) > 0.6) { ctx.fillStyle = 'rgba(80,60,30,0.25)'; ctx.fillRect(sx + 3, sy + 5, 5, 7); } // water stain
  } else {
    ctx.fillStyle = C.green; ctx.fillRect(sx, sy, 16, 16);
    ctx.fillStyle = C.rail; ctx.fillRect(sx, sy, 16, 2);
    ctx.fillStyle = C.greenD; ctx.fillRect(sx, sy + 13, 16, 3);
    if (h2(x, y, 2) > 0.5) { ctx.fillStyle = 'rgba(200,190,150,0.35)'; ctx.fillRect(sx + 9, sy + 4, 2, 3); } // peeling
  }
  if (win) {
    // Tall sash window across face_high + face_low.
    const isHigh = kind === 'face_high';
    ctx.fillStyle = C.frame; ctx.fillRect(sx + 1, sy, 14, 16);
    ctx.fillStyle = C.glass; ctx.fillRect(sx + 2, sy + (isHigh ? 2 : 0), 12, isHigh ? 14 : 12);
    ctx.fillStyle = C.glassL; ctx.fillRect(sx + 3, sy + (isHigh ? 3 : 1), 1, 6);
    ctx.fillStyle = C.frame; ctx.fillRect(sx + 7, sy, 2, 16);
    if (!isHigh) { ctx.fillStyle = C.frame; ctx.fillRect(sx + 1, sy, 14, 1); ctx.fillStyle = C.sill; ctx.fillRect(sx, sy + 12, 16, 3); }
  }
}

function propArt(ctx, p, sx, sy) {
  const t = p.type;
  const st = p.state;
  switch (t) {
    case 'door_class': case 'door_double': case 'door_metal': case 'door_front': {
      const w = p.w * 16;
      if (st === 'open') { ctx.fillStyle = '#0c0c10'; ctx.fillRect(sx + 1, sy - 2, w - 2, 34); ctx.fillStyle = '#4a3220'; ctx.fillRect(sx + 1, sy - 2, 3, 34); return; }
      ctx.fillStyle = '#3a2618'; ctx.fillRect(sx, sy - 2, w, 34);
      ctx.fillStyle = '#6b4a2c'; ctx.fillRect(sx + 1, sy - 1, w - 2, 33);
      ctx.fillStyle = '#20283a'; ctx.fillRect(sx + 5, sy + 3, w - 10, 9);
      ctx.fillStyle = '#c9a548'; ctx.fillRect(sx + w - 4, sy + 17, 2, 2);
      return;
    }
    case 'door_side': ctx.fillStyle = st === 'open' ? '#0c0c10' : '#6b4a2c'; ctx.fillRect(sx + 6, sy - 10, 4, 26); return;
    case 'desk_student': {
      ctx.fillStyle = '#3d3a35'; ctx.fillRect(sx + 3, sy + 9, 1, 6); ctx.fillRect(sx + 12, sy + 9, 1, 6);
      ctx.fillStyle = '#b29262'; ctx.fillRect(sx + 2, sy + 2, 12, 7);
      ctx.fillStyle = '#8e7148'; ctx.fillRect(sx + 2, sy + 8, 12, 2);
      ctx.fillStyle = '#6b5a45'; ctx.fillRect(sx + 4, sy + 11, 8, 3);
      return;
    }
    case 'desk_teacher': case 'office_desk': case 'janitor_desk': {
      const w = p.w * 16;
      ctx.fillStyle = '#5b625c'; ctx.fillRect(sx + 1, sy - 2, w - 2, 9);
      ctx.fillStyle = '#454b46'; ctx.fillRect(sx + 1, sy + 7, w - 2, 8);
      ctx.fillStyle = '#e4dbc2'; ctx.fillRect(sx + 5, sy, 6, 4);
      return;
    }
    case 'locker': {
      ctx.fillStyle = '#3e4630'; ctx.fillRect(sx + 1, sy - 14, 14, 30);
      ctx.fillStyle = '#58613f'; ctx.fillRect(sx + 2, sy - 13, 12, 28);
      ctx.fillStyle = '#2f3524'; for (let j = 0; j < 3; j++) ctx.fillRect(sx + 5, sy - 10 + j * 2, 6, 1);
      ctx.fillStyle = '#9a9d88'; ctx.fillRect(sx + 11, sy, 1, 3);
      return;
    }
    case 'bookshelf_tall': {
      const w = p.w * 16;
      ctx.fillStyle = '#3a2416'; ctx.fillRect(sx, sy - 16, w, 32);
      ctx.fillStyle = '#5e3c22'; ctx.fillRect(sx + 1, sy - 15, w - 2, 30);
      const cols = ['#7a2a22', '#2f4a72', '#5a6e3a', '#9d812e', '#6a1720', '#3a5276'];
      for (let r = 0; r < 4; r++) {
        ctx.fillStyle = '#2a1a10'; ctx.fillRect(sx + 2, sy - 13 + r * 7, w - 4, 6);
        for (let i = 2; i < w - 2; i += 2) { ctx.fillStyle = cols[Math.floor(h2(i, r, p.x) * cols.length)]; ctx.fillRect(sx + i, sy - 12 + r * 7, 2, 5); }
      }
      return;
    }
    case 'chalkboard': {
      const w = p.w * 16;
      ctx.fillStyle = '#5e4630'; ctx.fillRect(sx, sy - 14, w, 13);
      ctx.fillStyle = '#26332d'; ctx.fillRect(sx + 1, sy - 13, w - 2, 10);
      ctx.fillStyle = '#7e8c84'; ctx.fillRect(sx + 5, sy - 10, 14, 1); ctx.fillRect(sx + 7, sy - 7, 20, 1);
      return;
    }
    case 'exit_sign': ctx.fillStyle = '#2a0808'; ctx.fillRect(sx + 3, sy - 14, 10, 6); ctx.fillStyle = st === 'dead' ? '#4a1010' : '#ff5a44'; ctx.fillRect(sx + 4, sy - 13, 8, 4); return;
    case 'lamp_banker': ctx.fillStyle = '#c9aa47'; ctx.fillRect(sx + 7, sy - 4, 1, 5); ctx.fillStyle = '#2e6b3a'; ctx.fillRect(sx + 4, sy - 7, 8, 3); return;
    case 'computer_desk': {
      ctx.fillStyle = '#5b625c'; ctx.fillRect(sx + 1, sy + 2, 14, 12);
      ctx.fillStyle = '#c8c4b4'; ctx.fillRect(sx + 3, sy - 8, 10, 9);
      ctx.fillStyle = st === 'on' ? '#7fc89a' : '#1c2620'; ctx.fillRect(sx + 4, sy - 7, 8, 6);
      return;
    }
    case 'cage_bulb': ctx.fillStyle = '#5a5850'; ctx.fillRect(sx + 6, sy - 6, 4, 5); ctx.fillStyle = '#ffd59a'; ctx.fillRect(sx + 7, sy - 5, 2, 3); return;
    case 'candle': ctx.fillStyle = '#2b2a2e'; ctx.fillRect(sx + 7, sy - 4, 2, 18); ctx.fillStyle = '#e4dbc2'; ctx.fillRect(sx + 7, sy - 8, 2, 4); ctx.fillStyle = '#ffb04a'; ctx.fillRect(sx + 7, sy - 10, 2, 2); return;
    case 'lamp_miner': ctx.fillStyle = '#5e4a1c'; ctx.fillRect(sx + 5, sy + 4, 6, 6); ctx.fillStyle = '#ffc070'; ctx.fillRect(sx + 7, sy + 5, 2, 2); return;
    case 'boiler': {
      ctx.fillStyle = '#2a2a2e'; ctx.fillRect(sx, sy - 10, 64, 58);
      ctx.fillStyle = '#3e3d42'; ctx.fillRect(sx + 2, sy - 8, 60, 54);
      ctx.fillStyle = '#ff7a2a'; ctx.fillRect(sx + 26, sy + 34, 12, 8);
      ctx.fillStyle = '#ffb04a'; ctx.fillRect(sx + 28, sy + 36, 8, 4);
      return;
    }
    case 'lamp_post': ctx.fillStyle = '#26262a'; ctx.fillRect(sx + 7, sy - 26, 2, 40); ctx.fillStyle = '#3a3a40'; ctx.fillRect(sx + 4, sy - 28, 8, 3); return;
    case 'car_wagon': {
      ctx.fillStyle = '#3d3a3a'; ctx.fillRect(sx + 2, sy - 6, 60, 36);
      ctx.fillStyle = '#6e5a4a'; ctx.fillRect(sx + 4, sy - 4, 56, 30);
      ctx.fillStyle = '#1b2741'; ctx.fillRect(sx + 10, sy, 44, 10);
      ctx.fillStyle = '#7a5a3a'; ctx.fillRect(sx + 4, sy + 16, 56, 4);
      return;
    }
    case 'bench': ctx.fillStyle = '#7a5a36'; ctx.fillRect(sx + 1, sy + 4, 30, 6); ctx.fillStyle = '#4e3a22'; ctx.fillRect(sx + 1, sy + 10, 30, 3); return;
    case 'aud_seat': ctx.fillStyle = '#6a1720'; ctx.fillRect(sx + 3, sy + 2, 10, 10); ctx.fillStyle = '#3d0d14'; ctx.fillRect(sx + 3, sy + 10, 10, 3); return;
    case 'lectern': ctx.fillStyle = '#664427'; ctx.fillRect(sx + 3, sy - 6, 10, 20); ctx.fillStyle = '#8c643b'; ctx.fillRect(sx + 2, sy - 8, 12, 3); return;
    case 'pa_console': ctx.fillStyle = '#4a4a50'; ctx.fillRect(sx + 1, sy, 30, 12); ctx.fillStyle = '#ff2a1a'; ctx.fillRect(sx + 26, sy + 3, 1, 1); return;
    case 'mat_stack': ctx.fillStyle = '#2f4a72'; ctx.fillRect(sx + 1, sy, 30, 14); return;
    default: ctx.fillStyle = '#555'; ctx.fillRect(sx + 3, sy + 3, 10, 10);
  }
}

function tessArt(ctx, x, y, dir) {
  // A 12×26 stand-in for Tess (feet at x,y): copper hair, denim jacket, black jeans, high-tops.
  const sx = Math.round(x) - 6;
  const sy = Math.round(y) - 26;
  ctx.fillStyle = '#0a0a0f'; ctx.fillRect(sx + 1, sy, 10, 27);
  ctx.fillStyle = '#b2441b'; ctx.fillRect(sx + 2, sy + 1, 8, 7);
  ctx.fillStyle = '#dc6f2c'; ctx.fillRect(sx + 3, sy + 1, 4, 2);
  if (dir !== 'up') { ctx.fillStyle = '#d39a7a'; ctx.fillRect(sx + 3, sy + 4, 6, 4); ctx.fillStyle = '#b2441b'; ctx.fillRect(sx + 2, sy + 3, 2, 6); }
  ctx.fillStyle = '#82a0c2'; ctx.fillRect(sx + 2, sy + 9, 8, 8);
  ctx.fillStyle = '#56769e'; ctx.fillRect(sx + 2, sy + 15, 8, 2);
  ctx.fillStyle = '#17120f'; ctx.fillRect(sx + 3, sy + 17, 6, 7);
  ctx.fillStyle = '#f0ece2'; ctx.fillRect(sx + 2, sy + 24, 3, 2); ctx.fillRect(sx + 7, sy + 24, 3, 2);
}

/** Paint the fake world in TECH §3 order (floors → faces → wall props → y-sorted → tops). */
export function drawScene(ctx, map, cam, actors = []) {
  const x0 = Math.max(0, Math.floor(cam.x / TILE));
  const y0 = Math.max(0, Math.floor(cam.y / TILE));
  const x1 = Math.min(map.w - 1, Math.ceil((cam.x + 480) / TILE));
  const y1 = Math.min(map.h - 1, Math.ceil((cam.y + 270) / TILE) + 2);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 480, 270);
  const tops = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const key = map.tileAt(x, y);
      const def = TILES[key];
      const sx = x * TILE - cam.x;
      const sy = y * TILE - cam.y;
      if (key === 'void') continue;
      if (def.kind === 'wall' || def.kind === 'window') {
        const k = map.wallKind(x, y);
        if (k === 'top') tops.push([key, x, y, sx, sy]);
        else drawWall(ctx, map, key, k, x, y, sx, sy);
      } else if (key === 'railing') {
        drawFloor(ctx, 'floor_stone', x, y, sx, sy);
        ctx.fillStyle = '#2a2a30'; ctx.fillRect(sx, sy + 6, 16, 2);
      } else drawFloor(ctx, key, x, y, sx, sy);
    }
  }
  const ys = [];
  for (const p of map.props) {
    const m = p.def.mount;
    if (m === 'wall' || (p.door && p.state === 'open')) propArt(ctx, p, p.x * TILE - cam.x, p.y * TILE - cam.y);
    else ys.push({ key: (p.y + p.h) * TILE, draw: () => propArt(ctx, p, p.x * TILE - cam.x, p.y * TILE - cam.y) });
  }
  for (const a of actors) ys.push({ key: a.y, draw: () => tessArt(ctx, a.x - cam.x, a.y - cam.y, a.dir) });
  ys.sort((a, b) => a.key - b.key);
  for (const it of ys) it.draw();
  for (const [key, x, y, sx, sy] of tops) drawWall(ctx, map, key, 'top', x, y, sx, sy);
}

// ---------------------------------------------------------------------------------------- scenes
/** A school corridor with three rooms north of it (classroom, computer room, office). */
export function corridorMap() {
  const tiles = [
    '                                                ', //  0
    ' ############################################## ', //  1 top
    ' ##W###W###W####W###W###W###W####W###W###W##### ', //  2 face_high (windows)
    ' ##W###W###W####W###W###W###W####W###W###W##### ', //  3 face_low
    ' #.............#.............#"""""""""""""""# ', //  4  classroom | computer room | office
    ' #.............#.............#"""""""""""""""# ',
    ' #.............#.............#"""""""""""""""# ',
    ' #.............D.............#"""""""""""""""# ', //  7 side door A↔B
    ' #.............#.............#"""""""""""""""# ',
    ' #.............#.............#"""""""""""""""# ', //  9
    ' #####D###############D##########D############# ', // 10 hall north wall: top
    ' #####D###############D##########D############# ', // 11 face_high
    ' #####D###############D##########D############# ', // 12 face_low
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,# ', // 13 hall
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,# ',
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,# ',
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,# ',
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,# ', // 17
    ' ############################################## ', // 18
    '                                                ', // 19
  ];
  const objects = [
    // classroom
    { type: 'chalkboard', x: 5, y: 3 }, { type: 'desk_teacher', x: 3, y: 4 }, { type: 'lamp_banker', x: 4, y: 4 },
    ...[3, 5, 7, 9, 11].flatMap((x) => [{ type: 'desk_student', x, y: 6 }, { type: 'desk_student', x, y: 8 }]),
    { type: 'bookshelf_tall', x: 12, y: 5 },
    // computer room
    { type: 'computer_desk', x: 17, y: 5, state: 'on', light: { type: 'crt' } },
    { type: 'computer_desk', x: 20, y: 5, state: 'on', light: { type: 'crt' } },
    { type: 'computer_desk', x: 23, y: 5, state: 'off' },
    { type: 'desk_teacher', x: 25, y: 8 },
    // office
    { type: 'office_desk', x: 33, y: 5 }, { type: 'pa_console', x: 40, y: 4 },
    { type: 'cage_bulb', x: 43, y: 3 },
    // hall
    ...[8, 9, 10, 11, 12, 13, 25, 26, 27, 28].map((x) => ({ type: 'locker', x, y: 13 })),
    { type: 'exit_sign', x: 4, y: 12, state: 'on' }, { type: 'exit_sign', x: 31, y: 12, state: 'flicker' },
    { type: 'bench', x: 37, y: 16 },
  ];
  const lights = [
    { type: 'fluor', x: 7, y: 15, group: 'period' }, { type: 'fluor', x: 18, y: 15, group: 'period' },
    { type: 'fluor', x: 29, y: 15, group: 'period' }, { type: 'fluor', x: 40, y: 15, group: 'period' },
    { type: 'fluor', x: 5, y: 6, group: 'period' }, { type: 'fluor', x: 11, y: 6, group: 'period' },
    { type: 'fluor', x: 21, y: 7, group: 'period' },
  ];
  return new FakeMap({
    id: 'pv_corridor', tiles, objects, lights, data: { dark: 0.94, ambient: '#0b1020' },
    doors: { '5,12': { state: 'open' }, '21,12': { state: 'closed' }, '32,12': { state: 'open' }, '14,7': { state: 'open', type: 'door_side' } },
  });
}

/** One plain room per preset (gallery). */
export function presetRoomMap(lightDef, extraObjects = [], floor = '.') {
  const row = (c) => ` #${c.repeat(26)}# `;
  const tiles = [
    '                              ',
    ' ############################ ',
    ' ####W#######W######W#######W ',
    ' ####W#######W######W#######W ',
    ...Array.from({ length: 11 }, () => row(floor)),
    ' ############################ ',
    '                              ',
  ].map((r) => r.padEnd(30, ' ').slice(0, 30));
  return new FakeMap({ id: 'pv_room', tiles, objects: extraObjects, lights: lightDef ? [lightDef] : [], data: { dark: 0.94, ambient: '#0b1020', moon: 0 } });
}

/** Exterior: brick facade with windows, steps, wet lot, streetlamps, the wagon with headlights. */
export function exteriorMap() {
  const tiles = [
    '                                        ',
    ' BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB ',
    ' BUBBBUBBBUBBBUBBBDDBBUBBBBUBBBUBBBUBBB ',
    ' BUBBBUBBBUBBBUBBBDDBBUBBBBUBBBUBBBUBBB ',
    ' ssssssssssssssssssssssssssssssssssssss ',
    ' gggggggggggssssssssssssssssggggggggggg ',
    ' gggggggggggssssssssssssssssggggggggggg ',
    ...Array.from({ length: 10 }, () => ' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa '),
    '                                        ',
  ];
  const objects = [
    { type: 'lamp_post', x: 8, y: 9, state: 'on' }, { type: 'lamp_post', x: 30, y: 9, state: 'flicker' },
    { type: 'car_wagon', x: 17, y: 12, state: 'on', light: { type: 'headlights', angle: -Math.PI / 2, x: 18.5, y: 11.6 } },
  ];
  return new FakeMap({ id: 'pv_exterior', tiles, objects, lights: [], data: { dark: 0.8, ambient: '#1b2741', floor: 'EXT' },
    doors: { '18,3': { state: 'closed' }, '19,3': { state: 'closed' } } });
}
