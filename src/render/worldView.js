// Builds all static world geometry from WorldData and animates dynamic pieces (doors, fence
// cuts, TV screens, windows tinted by time of day).
import { BABYLON } from './babylon.js';
import { GeoBatch } from './geometry.js';
import { WALL_T, BARS_T } from '../world/worldData.js';
import { CELL_H, SIGNS, BUILDING } from '../world/layout.js';
import { buildFurniture } from './furnitureView.js';
import { makeTextTexture } from './textures.js';
import { RNG } from '../core/random.js';

// Vertical paint layers per wall style: [material, fromY, toY|'top'].
const WALL_STYLES = {
  institution: [['paintGreen', 0, 1.25], ['trim', 1.25, 1.36], ['paintCream', 1.36, 'top']],
  cell: [['paintGreen', 0, 1.1], ['trim', 1.1, 1.2], ['paintCream', 1.2, 'top']],
  clinic: [['paintMint', 0, 1.2], ['trim', 1.2, 1.3], ['paintWhite', 1.3, 'top']],
  office: [['woodPanel', 0, 1.15], ['trim', 1.15, 1.25], ['wallpaper', 1.25, 'top']],
  staff: [['paintSlate', 0, 1.25], ['trim', 1.25, 1.35], ['paintGray', 1.35, 'top']],
  grim: [['grimWall', 0, 'top']],
  kitchen: [['tileWhite', 0, 2.0], ['trim', 2.0, 2.08], ['paintCream', 2.08, 'top']],
  mess: [['paintOrange', 0, 1.3], ['trim', 1.3, 1.4], ['paintCream', 1.4, 'top']],
  rec: [['paintBlue', 0, 1.3], ['trim', 1.3, 1.4], ['paintCream', 1.4, 'top']],
  library: [['woodPanel', 0, 1.2], ['trim', 1.2, 1.3], ['wallpaper', 1.3, 'top']],
  tile: [['tileWhite', 0, 2.4], ['paintWhite', 2.4, 'top']],
  gym: [['paintRed', 0, 1.3], ['trim', 1.3, 1.4], ['paintGray', 1.4, 'top']],
  workshop: [['paintYellow', 0, 1.0], ['trim', 1.0, 1.1], ['paintGray', 1.1, 'top']],
  exterior: [['brick', 0, 'top']],
};

export class WorldView {
  constructor(scene, world, materials, lighting) {
    this.scene = scene;
    this.world = world;
    this.materials = materials;
    this.lighting = lighting;
    this.doorViews = [];
    this.fenceCuts = new Map();
    this.windowMats = [];
    this.screens = [];
    this.static = [];
    this._build();
  }

  _build() {
    // Structural geometry only receives shadows; furniture, fences and doors also cast them.
    const batch = new GeoBatch(this.materials);
    this._floors(batch);
    this._walls(batch);
    this._ceilings(batch);
    this._cellBlockDetails(batch);
    this._exterior(batch);
    this.static.push(...batch.build(this.scene, 'world'));
    const props = new GeoBatch(this.materials);
    this._fences(props);
    for (const f of this.world.furniture) buildFurniture(props, f, this);
    const propMeshes = props.build(this.scene, 'props');
    this.static.push(...propMeshes);
    this._signs();
    this._doors();
    for (const m of this.static) this.lighting?.addShadowReceiver(m);
    for (const m of propMeshes) if (!/glow|screen|fence|razor|courtLines/.test(m.metadata.mat)) this.lighting?.addShadowCaster(m);
  }

  // ---- floors ----------------------------------------------------------------------------
  _floors(b) {
    for (const r of this.world.rooms) {
      if (r.under || r.cell) continue;
      const [x0, z0, x1, z1] = r.rect;
      if (r.indoor) b.boxMinMax(r.floor, x0, -0.2, z0, x1, 0, z1);
    }
    for (const c of this.world.cells) { const [x0, z0, x1, z1] = c.rect; b.boxMinMax('concrete', x0, -0.19, z0, x1, 0.002, z1, { uvOffset: [0.37, 0.11] }); }
    for (const id of ['H1', 'H2', 'H3']) { const r = this.world.roomById.get(id); const [x0, z0, x1, z1] = r.rect; b.boxMinMax('concreteDark', x0, -0.19, z0, x1, 0.002, z1); }
    // Yard surfaces
    b.boxMinMax('grass', -10, -0.2, 66, 86, 0, 102);
    b.boxMinMax('asphalt', 1, -0.19, 71, 27, 0.012, 89);           // basketball court
    b.boxMinMax('gravel', -10, -0.19, 66, 86, 0.006, 70.5);          // strip by the building
    b.boxMinMax('dirt', 55, -0.19, 71, 77, 0.01, 80);                // weight pit
    b.boxMinMax('gravel', 30, -0.19, 90, 50, 0.008, 100);            // bleacher pad
    this._track(b);
    b.floorQuad('courtLines', 14, 0.03, 80, 24.5, 16.5, { yaw: 0 });
    // Perimeter & outside
    b.boxMinMax('gravel', -16, -0.25, 102, 92, -0.01, 108);
    b.boxMinMax('gravel', -16, -0.25, 60, -10, -0.01, 102);
    b.boxMinMax('gravel', 86, -0.25, 60, 92, -0.01, 102);
    b.boxMinMax('ground', -120, -0.3, -80, 200, -0.02, 240, { color: [0.95, 0.95, 0.9] });
    b.boxMinMax('road', -120, -0.29, 112, 200, -0.005, 118);
  }
  _track(b) {
    // Oval dirt running track around the yard centre (approximated with segments).
    const cx = 48, cz = 86, rx = 16, rz = 9, w = 1.6, n = 48;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const x0 = cx + Math.cos(a0) * rx, z0 = cz + Math.sin(a0) * rz, x1 = cx + Math.cos(a1) * rx, z1 = cz + Math.sin(a1) * rz;
      const len = Math.hypot(x1 - x0, z1 - z0) + 0.15;
      b.box('dirt', (x0 + x1) / 2, 0.004, (z0 + z1) / 2, w, 0.02, len, { yaw: Math.atan2(x1 - x0, z1 - z0) });
    }
  }

  // ---- walls -----------------------------------------------------------------------------
  _styleFor(room, exterior) {
    if (!room || !room.indoor) return 'exterior';
    return room.wall || 'institution';
  }
  _walls(b) {
    for (const w of this.world.walls) {
      if (w.type === 'bars') { this._bars(b, w.orient, w.line, w.from, w.to, 0, CELL_H); continue; }
      const half = WALL_T / 2;
      for (const [side, room] of [[-1, w.sideA], [1, w.sideB]]) {
        const style = WALL_STYLES[this._styleFor(room)] || WALL_STYLES.institution;
        const top = room && room.indoor ? Math.min(w.h, this._ceilFor(room) + 0.05) : w.h;
        for (const [mat, y0, y1raw] of style) {
          const y1 = y1raw === 'top' ? top : Math.min(y1raw, top);
          if (y1 <= y0) continue;
          const inset = mat === 'trim' ? 0.012 : 0;
          if (w.orient === 'h') b.boxMinMax(mat, w.from, y0, w.line + (side < 0 ? -half - inset : 0), w.to, y1, w.line + (side < 0 ? 0 : half + inset));
          else b.boxMinMax(mat, w.line + (side < 0 ? -half - inset : 0), y0, w.from, w.line + (side < 0 ? 0 : half + inset), y1, w.to);
        }
        // Above a lower room's ceiling the wall continues (hidden) up to the full height.
        if (room && room.indoor && top < w.h) {
          if (w.orient === 'h') b.boxMinMax('dark', w.from, top, w.line + (side < 0 ? -half : 0), w.to, w.h, w.line + (side < 0 ? 0 : half));
          else b.boxMinMax('dark', w.line + (side < 0 ? -half : 0), top, w.from, w.line + (side < 0 ? 0 : half), w.h, w.to);
        }
      }
      // Lintels over door openings are handled by the openings' neighbours; add a header strip.
    }
    // Lintels above every opening (doors and archways) so walls look continuous.
    this._lintels(b);
  }
  _ceilFor(room) {
    if (room.cell && room.parent) return Math.max(room.ceil, this.world.roomById.get(room.parent).ceil);
    return room.ceil;
  }
  _lintels(b) {
    const openings = [];
    for (const d of this.world.doors) if (d.style !== 'cell') openings.push({ orient: d.orient, line: d.line, from: d.from, to: d.to, h: 2.7 });
    // Archways: detect gaps between collinear wall runs in indoor boundaries.
    const key = (w) => `${w.orient}|${w.line}`;
    const byLine = new Map();
    for (const w of this.world.walls) { if (w.type !== 'wall') continue; if (!byLine.has(key(w))) byLine.set(key(w), []); byLine.get(key(w)).push(w); }
    for (const list of byLine.values()) {
      list.sort((a, c) => a.from - c.from);
      for (let i = 0; i < list.length - 1; i++) {
        const a = list[i], c = list[i + 1];
        const gap = c.from - a.to;
        if (gap > 0.6 && gap < 11) {
          const isDoor = this.world.doors.some((d) => d.orient === a.orient && Math.abs(d.line - a.line) < 0.01 && d.from >= a.to - 0.01 && d.to <= c.from + 0.01);
          if (!isDoor) openings.push({ orient: a.orient, line: a.line, from: a.to, to: c.from, h: gap > 3.5 ? 3.4 : 2.7, sideA: a.sideA, sideB: a.sideB, hTop: Math.min(a.h, c.h) });
        }
      }
    }
    for (const o of openings) {
      const [ra, rb] = this._roomsBeside(o);
      const hTop = Math.max(this._wallTopFor(ra), this._wallTopFor(rb));
      if (hTop <= o.h) continue;
      const half = WALL_T / 2;
      for (const [side, room] of [[-1, ra], [1, rb]]) {
        const top = room && room.indoor ? Math.min(hTop, this._ceilFor(room) + 0.05) : hTop;
        const style = WALL_STYLES[this._styleFor(room)] || WALL_STYLES.institution;
        const mat = style[style.length - 1][0];
        if (top <= o.h) continue;
        if (o.orient === 'h') b.boxMinMax(mat, o.from, o.h, o.line + (side < 0 ? -half : 0), o.to, top, o.line + (side < 0 ? 0 : half));
        else b.boxMinMax(mat, o.line + (side < 0 ? -half : 0), o.h, o.from, o.line + (side < 0 ? 0 : half), top, o.to);
      }
      // Door frame trim
      const ft = 0.08;
      if (o.orient === 'h') { b.boxMinMax('steel', o.from - ft, 0, o.line - half - 0.02, o.from, o.h, o.line + half + 0.02, { color: [0.45, 0.5, 0.48] }); b.boxMinMax('steel', o.to, 0, o.line - half - 0.02, o.to + ft, o.h, o.line + half + 0.02, { color: [0.45, 0.5, 0.48] }); b.boxMinMax('steel', o.from - ft, o.h, o.line - half - 0.02, o.to + ft, o.h + ft, o.line + half + 0.02, { color: [0.45, 0.5, 0.48] }); }
      else { b.boxMinMax('steel', o.line - half - 0.02, 0, o.from - ft, o.line + half + 0.02, o.h, o.from, { color: [0.45, 0.5, 0.48] }); b.boxMinMax('steel', o.line - half - 0.02, 0, o.to, o.line + half + 0.02, o.h, o.to + ft, { color: [0.45, 0.5, 0.48] }); b.boxMinMax('steel', o.line - half - 0.02, o.h, o.from - ft, o.line + half + 0.02, o.h + ft, o.to + ft, { color: [0.45, 0.5, 0.48] }); }
    }
  }
  _roomsBeside(o) {
    const mid = (o.from + o.to) / 2;
    return o.orient === 'h'
      ? [this.world.roomAtExact(mid, o.line - 0.12), this.world.roomAtExact(mid, o.line + 0.12)]
      : [this.world.roomAtExact(o.line - 0.12, mid), this.world.roomAtExact(o.line + 0.12, mid)];
  }
  _wallTopFor(room) { if (!room || !room.indoor) return BUILDING.height; return this._ceilFor(room); }

  /** Barred section along a line, from y0 to y1. */
  _bars(b, orient, line, from, to, y0, y1, opts = {}) {
    const spacing = opts.spacing || 0.15, r = opts.r || 0.022;
    const len = to - from;
    const n = Math.max(1, Math.round(len / spacing));
    for (let i = 0; i <= n; i++) {
      const t = from + (len * i) / n;
      if (orient === 'h') b.cyl('iron', t, y0, line, r, y1 - y0, { segs: 6 });
      else b.cyl('iron', line, y0, t, r, y1 - y0, { segs: 6 });
    }
    for (const yy of opts.bands || [y0 + 0.08, y0 + 1.15, y1 - 0.12]) {
      if (orient === 'h') b.boxMinMax('iron', from, yy - 0.035, line - 0.035, to, yy + 0.035, line + 0.035);
      else b.boxMinMax('iron', line - 0.035, yy - 0.035, from, line + 0.035, yy + 0.035, to);
    }
  }

  // ---- ceilings & lights ------------------------------------------------------------------
  _ceilings(b) {
    for (const r of this.world.rooms) {
      if (!r.indoor) continue;
      const [x0, z0, x1, z1] = r.rect;
      const mat = r.cell ? 'concreteDark' : r.id === 'solitary' ? 'concreteDark' : 'ceiling';
      b.boxMinMax(mat, x0, r.ceil, z0, x1, r.ceil + 0.25, z1);
      if (r.cell) {
        // Single caged bulb
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        b.box('glowWarm', cx, r.ceil - 0.08, cz, 0.18, 0.12, 0.18);
        continue;
      }
      // Fluorescent fixtures on a grid
      const sx = r.id === 'hall' ? 4 : 4.5, sz = 5;
      const nx = Math.max(1, Math.floor((x1 - x0) / sx)), nz = Math.max(1, Math.floor((z1 - z0) / sz));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const cx = x0 + (x1 - x0) * (i + 0.5) / nx, cz = z0 + (z1 - z0) * (j + 0.5) / nz;
        if (r.id === 'blockA' || r.id === 'blockB') { if (cz < z0 + 5.5 || cz > z1 - 5.5) continue; }
        b.box('steel', cx, r.ceil - 0.06, cz, 0.35, 0.08, 1.35, { color: [0.85, 0.86, 0.84] });
        b.box('glow', cx, r.ceil - 0.105, cz, 0.24, 0.02, 1.25);
      }
    }
  }

  // ---- cell blocks: upper tier facade, catwalk and railing --------------------------------
  _cellBlockDetails(b) {
    for (const blockId of ['blockA', 'blockB']) {
      const blk = this.world.roomById.get(blockId);
      const [bx0, , bx1] = blk.rect;
      const cells = this.world.cells.filter((c) => c.parent === blockId);
      for (const front of ['S', 'N']) {
        const row = cells.filter((c) => c.front === front);
        if (!row.length) continue;
        const line = front === 'S' ? row[0].rect[3] : row[0].rect[1];
        const dir = front === 'S' ? 1 : -1; // toward the hall
        const x0 = Math.min(...row.map((c) => c.rect[0])), x1 = Math.max(...row.map((c) => c.rect[2]));
        // Catwalk slab
        b.boxMinMax('concrete', bx0 + 0.15, CELL_H, Math.min(line, line + dir * 1.4), bx1 - 0.15, CELL_H + 0.18, Math.max(line, line + dir * 1.4), { color: [0.85, 0.85, 0.82] });
        // Railing
        const rl = line + dir * 1.35;
        b.boxMinMax('iron', bx0 + 0.2, CELL_H + 1.0, rl - 0.03, bx1 - 0.2, CELL_H + 1.06, rl + 0.03, { color: [0.6, 0.65, 0.6] });
        for (let x = bx0 + 0.4; x < bx1 - 0.2; x += 1.2) b.cyl('iron', x, CELL_H + 0.18, rl, 0.025, 0.85, { segs: 5, color: [0.6, 0.65, 0.6] });
        b.boxMinMax('paintGreen', bx0 + 0.15, CELL_H - 0.12, Math.min(line, line + dir * 1.4) - 0.01, bx1 - 0.15, CELL_H, Math.max(line, line + dir * 1.4) + 0.01);
        // Upper cells: bars with doors (closed), bunks visible behind.
        for (const c of row) {
          this._bars(b, 'h', line, c.rect[0] + 0.15, c.rect[2] - 0.15, CELL_H + 0.18, 6.4, { bands: [CELL_H + 0.3, CELL_H + 1.4, 6.3] });
          const midx = (c.rect[0] + c.rect[2]) / 2;
          const back = front === 'S' ? c.rect[1] + 0.2 : c.rect[3] - 0.2;
          b.boxMinMax('steel', c.rect[0] + 0.2, CELL_H + 0.18, Math.min(back, back + dir * 2.0), c.rect[0] + 1.1, CELL_H + 0.7, Math.max(back, back + dir * 2.0), { color: [0.55, 0.6, 0.65] });
          b.box('paint', midx + 1.2, CELL_H + 1.8, back, 0.6, 0.8, 0.02, { color: [0.4 + 0.3 * Math.sin(midx), 0.3, 0.25] });
          // Cell number plate above the lower door
          b.box('paint', midx, CELL_H - 0.35, line + dir * 0.09, 0.5, 0.22, 0.03, { color: [0.95, 0.92, 0.82] });
        }
        // Stairs at the block ends (decorative, gated off)
        const sx = blockId === 'blockA' ? bx0 + 0.9 : bx1 - 0.9;
        for (let s = 0; s < 12; s++) {
          const zz = line + dir * (1.6 + s * 0.28 + 0.14);
          b.box('steel', sx, (s + 1) * (CELL_H / 12) - 0.05, zz, 1.3, 0.08, 0.3, { color: [0.5, 0.52, 0.5] });
        }
        b.boxMinMax('iron', sx - 0.7, 0, line + dir * 1.45 - 0.03, sx + 0.7, 1.1, line + dir * 1.45 + 0.03);
      }
    }
  }

  // ---- exterior: roof, parapet, windows, landscape -----------------------------------------
  _exterior(b) {
    const { x0, z0, x1, z1, height } = BUILDING;
    b.boxMinMax('roof', x0 - 0.3, height, z0 - 0.3, x1 + 0.3, height + 0.3, z1 + 0.3);
    b.boxMinMax('brick', x0 - 0.4, height + 0.3, z0 - 0.4, x1 + 0.4, height + 0.9, z0 - 0.1);
    b.boxMinMax('brick', x0 - 0.4, height + 0.3, z1 + 0.1, x1 + 0.4, height + 0.9, z1 + 0.4);
    b.boxMinMax('brick', x0 - 0.4, height + 0.3, z0 - 0.4, x0 - 0.1, height + 0.9, z1 + 0.4);
    b.boxMinMax('brick', x1 + 0.1, height + 0.3, z0 - 0.4, x1 + 0.4, height + 0.9, z1 + 0.4);
    // Rooftop clutter
    b.box('steel', 20, height + 0.9, 30, 3, 1.2, 2, { color: [0.6, 0.62, 0.6] });
    b.box('steel', 58, height + 0.8, 44, 2.5, 1.0, 2.5, { color: [0.6, 0.62, 0.6] });
    // High windows on exterior walls: interior glows with daylight, exterior dark glass + bars.
    const winMat = this._windowMaterial();
    const addWindow = (orient, line, t, outward) => {
      const wy = 4.3;
      if (orient === 'h') {
        b.box('windowSky', t, wy, line - outward * (WALL_T / 2 + 0.005), 1.1, 0.7, 0.01);
        b.box('glass', t, wy, line + outward * (WALL_T / 2 + 0.01), 1.1, 0.7, 0.02);
        for (let k = -2; k <= 2; k++) b.cyl('iron', t + k * 0.22, wy - 0.35, line + outward * (WALL_T / 2 + 0.04), 0.015, 0.7, { segs: 4 });
      } else {
        b.box('windowSky', line - outward * (WALL_T / 2 + 0.005), wy, t, 0.01, 0.7, 1.1);
        b.box('glass', line + outward * (WALL_T / 2 + 0.01), wy, t, 0.02, 0.7, 1.1);
        for (let k = -2; k <= 2; k++) b.cyl('iron', line + outward * (WALL_T / 2 + 0.04), wy - 0.35, t + k * 0.22, 0.015, 0.7, { segs: 4 });
      }
    };
    for (const w of this.world.walls) {
      if (!w.exterior || w.type !== 'wall') continue;
      const outward = (!w.sideA || !w.sideA.indoor) ? -1 : 1;
      const inner = outward < 0 ? w.sideB : w.sideA;
      if (!inner || inner.cell || inner.ceil < 4.4) continue;
      for (let t = w.from + 2; t < w.to - 1.5; t += 4) addWindow(w.orient, w.line, t, outward);
    }
    void winMat;
    // Landscape beyond the walls: hills, tree line, town silhouette.
    const rng = new RNG(77);
    for (let i = 0; i < 70; i++) {
      const ang = rng.range(0, Math.PI * 2), dist = rng.range(70, 120);
      const x = 38 + Math.cos(ang) * dist, z = 55 + Math.sin(ang) * dist * 1.1;
      if (z > 104 && z < 126 && x > -30 && x < 106 && rng.chance(0.6)) continue;
      const h = rng.range(5, 11);
      b.cyl('paint', x, -0.2, z, 0.25, h * 0.4, { segs: 5, color: [0.35, 0.27, 0.2] });
      b.cyl('paint', x, h * 0.3, z, rng.range(1.6, 2.8), h * 0.8, { segs: 7, rTop: 0.1, color: [0.22 + rng.range(0, 0.08), 0.33 + rng.range(0, 0.1), 0.2] });
    }
    for (let i = 0; i < 14; i++) {
      const x = -60 + i * 18 + rng.range(-4, 4), z = 150 + rng.range(-8, 8);
      b.box('paint', x, 0, z, rng.range(8, 14), rng.range(6, 22), rng.range(8, 12), { color: [0.42, 0.44, 0.48] });
    }
    for (let i = 0; i < 9; i++) {
      const x = -100 + i * 40, z = -60 + rng.range(-10, 10);
      b.sphere('paint', x, -8, z, rng.range(30, 45), { sy: 0.35, segs: 10, rings: 6, color: [0.3, 0.4, 0.27] });
    }
    // Power poles along the road
    for (let x = -40; x < 140; x += 22) { b.cyl('paint', x, 0, 119.5, 0.15, 8, { segs: 5, color: [0.35, 0.28, 0.2] }); b.box('paint', x, 7.6, 119.5, 2.2, 0.12, 0.12, { color: [0.35, 0.28, 0.2] }); }
  }
  _windowMaterial() {
    const m = new BABYLON.StandardMaterial('m_windowSky', this.scene);
    m.disableLighting = true;
    m.emissiveColor = new BABYLON.Color3(0.75, 0.85, 0.95);
    m.diffuseColor = BABYLON.Color3.Black();
    this.materials.register('windowSky', m, 1);
    this.windowMat = m;
    return m;
  }

  // ---- fences -------------------------------------------------------------------------------
  _fences(b) {
    const cutBatch = new GeoBatch(this.materials, { split: false });
    for (const f of this.world.fences) {
      const tb = f.cut ? cutBatch : b;
      const [ax, az] = f.a, [bx, bz] = f.b;
      const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      // Mesh panel: a thin two-sided quad with chain-link alpha texture.
      tb.quad('fence', mx, 1.8, mz, len, 3.6, { yaw: yaw + Math.PI / 2, doubleSided: true, uvRepeat: [len / 1.2, 3.6 / 1.2] });
      if (!f.cut) {
        for (let t = 0; t <= len + 0.01; t += 3) {
          const px = ax + ((bx - ax) * t) / len, pz = az + ((bz - az) * t) / len;
          b.cyl('steel', px, 0, pz, 0.05, 4.0, { segs: 6, color: [0.6, 0.62, 0.62] });
          b.rod('steel', px, 3.6, pz, px + Math.cos(yaw) * 0.0, 4.1, pz, 0.03, { color: [0.6, 0.62, 0.62] });
        }
        b.rod('steel', ax, 3.6, az, bx, 3.6, bz, 0.035, { color: [0.6, 0.62, 0.62] });
        // Razor wire coil on top
        b.quad('razor', mx, 4.05, mz, len, 0.55, { yaw: yaw + Math.PI / 2, doubleSided: true, uvRepeat: [len / 0.9, 1] });
      }
    }
    const meshes = cutBatch.build(this.scene, 'fenceCuts', { freeze: false });
    for (const m of meshes) this.fenceCutMesh = m;
    // Separate per-cut meshes so each can be hidden when cut.
    for (const f of this.world.fences.filter((x) => x.cut)) {
      const single = new GeoBatch(this.materials, { split: false });
      const [ax, az] = f.a, [bx, bz] = f.b;
      const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
      single.quad('fence', (ax + bx) / 2, 1.8, (az + bz) / 2, len, 3.6, { yaw: yaw + Math.PI / 2, doubleSided: true, uvRepeat: [len / 1.2, 3] });
      const [mesh] = single.build(this.scene, `cut_${f.id}`);
      this.fenceCuts.set(f.id, mesh);
    }
    for (const m of meshes) m.dispose();
  }
  setFenceCut(id) {
    const m = this.fenceCuts.get(id);
    if (m) m.setEnabled(false);
  }

  // ---- signs --------------------------------------------------------------------------------
  _signs() {
    const all = [...SIGNS];
    for (const f of this.world.furniture) {
      if (['blockSign', 'messSign', 'gymSign', 'yardSign'].includes(f.type)) {
        all.push({ text: f.text, x: f.x, z: f.z, yaw: f.yaw, y: f.type === 'blockSign' ? CELL_H + 1.6 : f.type === 'yardSign' ? 5.5 : 3.6, big: true, outdoor: f.type === 'yardSign' });
      }
    }
    for (const s of all) {
      const w = Math.max(1.6, s.text.length * (s.big ? 0.36 : 0.27));
      const h = s.big ? 0.65 : 0.45;
      const tex = makeTextTexture(this.scene, s.text, { w: 1024, h: Math.round(1024 * h / w), size: Math.round(1024 * h / w * 0.6), bg: s.warn ? '#8a1f17' : s.big ? '#23302a' : '#2c3a33', fg: '#f3ecd6' });
      const mat = new BABYLON.StandardMaterial(`sign_${s.text}`, this.scene);
      mat.diffuseTexture = tex;
      mat.emissiveColor = new BABYLON.Color3(0.35, 0.35, 0.35);
      mat.specularColor = BABYLON.Color3.Black();
      const plane = BABYLON.MeshBuilder.CreatePlane(`signp_${s.text}`, { width: w, height: h, sideOrientation: BABYLON.Mesh.FRONTSIDE }, this.scene);
      plane.material = mat;
      // Planes face -z by default in Babylon; rotate so the text faces along `yaw`.
      plane.rotation.y = s.yaw + Math.PI;
      const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      plane.position.set(s.x + fx * 0.19, s.y, s.z + fz * 0.19);
      plane.isPickable = false;
      plane.freezeWorldMatrix();
      this.static.push(plane);
    }
  }

  // ---- doors -----------------------------------------------------------------------------------
  _doors() {
    for (const d of this.world.doors) {
      const b = new GeoBatch(this.materials, { split: false });
      const w = d.to - d.from;
      const h = d.style === 'gate' ? 3.4 : d.style === 'cell' ? CELL_H - 0.05 : 2.6;
      // Build in a local frame where x runs along the door, centred at origin.
      if (d.style === 'cell' || d.style === 'gate') {
        const n = Math.round(w / 0.15);
        for (let i = 0; i <= n; i++) b.cyl('iron', -w / 2 + (w * i) / n, 0.02, 0, 0.024, h - 0.05, { segs: 6 });
        for (const yy of [0.1, 1.1, 1.2, h - 0.15]) b.box('iron', 0, yy, 0, w, 0.07, 0.07);
        b.box('iron', 0, 1.15, 0.05, 0.25, 0.25, 0.06); // lock box
      } else {
        const col = d.style === 'office' ? [0.55, 0.38, 0.22] : [0.42, 0.47, 0.52];
        b.box(d.style === 'office' ? 'wood' : 'steel', 0, h / 2, 0, w - 0.04, h, 0.08, { color: col });
        b.box('glass', 0, h * 0.68, 0, w * 0.35, 0.45, 0.1);
        b.box('steel', w * 0.38, 1.05, 0.07, 0.06, 0.25, 0.05, { color: [0.8, 0.8, 0.75] });
        if (d.style === 'staff') b.box('paint', 0, h * 0.45, 0.05, w * 0.6, 0.18, 0.01, { color: [0.75, 0.15, 0.1] });
      }
      const [mesh] = b.build(this.scene, `door_${d.id}`, { freeze: false });
      const [cx, cz] = d.center();
      // Babylon: local +x maps to world (cos yaw, -sin yaw); for 'h' doors we want local x along world x.
      const yaw = d.orient === 'h' ? 0 : -Math.PI / 2;
      mesh.rotation.y = yaw;
      const ox = d.orient === 'h' ? 0 : (d.style === 'cell' ? 0 : 0), oz = 0;
      mesh.position.set(cx + ox, 0, cz + oz);
      // Sliding direction along the wall; cell doors slide on the hall side.
      const along = d.orient === 'h' ? [1, 0] : [0, 1];
      let off = [0, 0];
      if (d.style === 'cell') { const cell = this.world.roomById.get(d.cell); const hallSide = cell.front === 'S' ? 1 : -1; off = [0, hallSide * 0.12]; }
      this.doorViews.push({ door: d, mesh, base: [cx + off[0], cz + off[1]], along, width: w });
      this.lighting?.addShadowCaster(mesh);
      mesh.receiveShadows = true;
    }
  }

  update(dt, timeOfDay) {
    for (const v of this.doorViews) {
      const a = v.door.amount, s = v.width * 0.95;
      v.mesh.position.x = v.base[0] + v.along[0] * a * s;
      v.mesh.position.z = v.base[1] + v.along[1] * a * s;
    }
    for (const f of this.world.fences) if (f.cutState && this.fenceCuts.has(f.id)) this.setFenceCut(f.id);
    if (this.windowMat && timeOfDay) this.windowMat.emissiveColor.copyFrom(timeOfDay.windowColor);
  }
}
