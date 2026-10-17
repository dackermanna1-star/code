// TILES (art) — initTiles(), drawTile(ctx, key, px, py, { kind, mask, variant, clean, t }).
//
// How it works
// - Floors, wall faces, wall tops, pits and door thresholds are WORLD-SPACE textures (toroidal, a
//   multiple of 16 px): a cell draws the 16×16 window under its world position, so boards, cracks,
//   stains and peeling run across cell boundaries. Floors repeat every 32×16 tiles, faces every 32
//   tiles (wider than the 30-tile screen). The engine prerenders layers with px = tx*16, py = ty*16;
//   any other px still yields a valid tile. Decay is clustered (damage maps), not sprinkled.
// - Wall faces: one 512×32 strip per material (rows 0–15 face_high, 16–31 face_low) so a wall's two
//   face rows are one continuous surface. Open E/W sides get a corner arris; face_low also draws a
//   4-px translucent contact-shadow "spill" onto the floor below it (faces layer → under characters).
// - Wall-top lips follow the engine's wallMask (N1 E2 S4 W8 = neighbour is wall/window). The engine
//   counts void as NOT wall, so tops facing void get a lip too — it outlines the building mass.
// - Cells that need edge treatment (wall-top lips, face corners, pit rims, windows, railings,
//   stage front) are composed once and cached per (key, kind, edge mask, texture window, clean).
// - floor_water is self-contained per variant (map.drawAnimatedTiles redraws it every frame in
//   screen space), with a slow 4-frame shimmer driven by opts.t; numeric cache, no per-frame garbage.
// - Optional engine extension (not required): pass mask = sameMask | 16 for floor_water (shorelines)
//   and floor_stairs_* (stringers at the ends of a run). Bit 16 marks the mask as valid.
// - Everything is generated lazily and deterministically; initTiles() only prewarms the commonest.
import { TILES } from '../data/tiles.js';
import { FLOOR_GEN, TW, TH, concreteTexture } from './tiles_floors.js';
import { FACE_GEN, FW, TS, MAT, topTex, applyTopLips, drawWindow, genSpill } from './tiles_walls.js';
import {
  PIT_S, pitTex, pitEdges, DROP_S, dropTex, dropEdges, railingCell, stageCell, DOOR_S, doorTex, doorJambs, stairsCell, waterCell, WATER_FRAMES,
} from './tiles_special.js';

const mod = (a, n) => ((a % n) + n) % n;
const lt255 = (c) => [Math.min(255, c[0] + 24), Math.min(255, c[1] + 24), Math.min(255, c[2] + 24)];
const WATER = []; // animated water cells by numeric index

// ---- caches ---------------------------------------------------------------------------------
const TEX = new Map();   // name|c → { pb, cv }
const CELL = new Map();  // composed cell key → canvas
function tex(name, clean, gen) {
  const k = `${name}|${clean ? 1 : 0}`;
  let t = TEX.get(k);
  if (!t) { const pb = gen(clean); t = { pb, cv: pb.canvas() }; TEX.set(k, t); }
  return t;
}
function cell(key, make) {
  let c = CELL.get(key);
  if (!c) { c = make().canvas(); CELL.set(key, c); }
  return c;
}

const floorTex = (key, clean) => tex(key, clean, FLOOR_GEN[key]);
const faceTex = (mat, clean) => tex(`face_${mat}`, clean, FACE_GEN[mat]);
const spillTex = (mat, clean) => tex(`spill_${mat}`, clean, (c) => genSpill(mat, c));
const topTexOf = (mat, clean) => tex(`top_${mat}`, clean, (c) => topTex(mat, c));
const WINDOW_MAT = { window_plaster: 'wall_plaster', window_brick: 'wall_brick' };

// ---- public API -----------------------------------------------------------------------------
export async function initTiles() {
  // Prewarm what nearly every map uses; the rest is built on first draw (a few ms each).
  const t0 = performance.now();
  for (const k of ['floor_lino', 'floor_lino_hall']) floorTex(k, false);
  for (const m of ['wall_plaster', 'wall_brick']) { faceTex(m, false); topTexOf(m, false); spillTex(m, false); }
  initTiles.ms = Math.round(performance.now() - t0);
}

export function drawTile(ctx, key, px, py, opts = {}) {
  const def = TILES[key];
  if (!def) { ctx.fillStyle = '#f0f'; ctx.fillRect(px, py, 16, 16); return; }
  const clean = !!opts.clean;
  const mask = opts.mask | 0;
  const tx = Math.floor(px / 16), ty = Math.floor(py / 16);
  switch (def.kind) {
    case 'floor':
      if (key === 'floor_water') return drawWater(ctx, px, py, opts.variant | 0, clean, opts.t, mask);
      return drawFloor(ctx, key, px, py, tx, ty, clean);
    case 'wall':
      return drawWall(ctx, key, opts.kind || 'top', mask, px, py, tx, ty, clean);
    case 'window':
      if (opts.kind === 'face_high' || opts.kind === 'face_low') return drawWindowCell(ctx, key, opts.kind, mask, px, py, tx, clean, opts.variant | 0);
      return drawWall(ctx, WINDOW_MAT[key], 'top', mask, px, py, tx, ty, clean);
    case 'door':
      return drawDoor(ctx, opts.kind, mask, px, py, tx, ty, clean);
    default:
      return drawSpecial(ctx, key, mask, px, py, tx, ty, clean, opts.variant | 0);
  }
}

// ---- floors ---------------------------------------------------------------------------------
function drawFloor(ctx, key, px, py, tx, ty, clean) {
  const t = floorTex(key, clean);
  ctx.drawImage(t.cv, mod(tx, TW / 16) * 16, mod(ty, TH / 16) * 16, 16, 16, px, py, 16, 16);
}

// floor_water mask: the engine currently passes 0. If it passes sameMask | 16 (bit 16 = "mask
// valid"), cells get wet shorelines on sides whose neighbour is not water.
function drawWater(ctx, px, py, v, clean, t, mask) {
  if (clean) { // 1979: the basement was dry — a self-contained window of clean concrete
    const ct = tex('dry_concrete', true, () => concreteTexture(true, 'dry'));
    const k = v % 36, sx = 16 + (k % 6) * 16, sy = 16 + Math.floor(k / 6) * 16;
    ctx.drawImage(ct.cv, sx, sy, 16, 16, px, py, 16, 16);
    return;
  }
  // called every frame for visible water: numeric cache index, no allocation once warm
  const vv = v & 15;
  const f = t ? Math.floor(t * 2.2 + ((v >> 4) & 3)) % WATER_FRAMES : 0;
  const shore = mask & 16 ? (~mask & 15) : 0;
  const i = (shore * 16 + vv) * WATER_FRAMES + f;
  let c = WATER[i];
  if (!c) c = WATER[i] = waterCell(vv, f, shore).canvas();
  ctx.drawImage(c, px, py);
}

// ---- walls ----------------------------------------------------------------------------------
function drawWall(ctx, key, kind, mask, px, py, tx, ty, clean) {
  if (kind === 'top') {
    const t = topTexOf(key, clean);
    const sx = mod(tx, TS / 16) * 16, sy = mod(ty, TS / 16) * 16;
    if ((mask & 15) === 15) { ctx.drawImage(t.cv, sx, sy, 16, 16, px, py, 16, 16); return; }
    ctx.drawImage(cell(`top|${key}|${sx}|${sy}|${mask & 15}|${clean ? 1 : 0}`, () => {
      const c = t.pb.sub(sx, sy, 16, 16);
      applyTopLips(c, key, mask);
      return c;
    }), px, py);
    return;
  }
  const t = faceTex(key, clean);
  const sx = mod(tx, FW / 16) * 16, sy = kind === 'face_high' ? 0 : 16;
  const edges = faceEdges(kind, mask);
  if (!edges) ctx.drawImage(t.cv, sx, sy, 16, 16, px, py, 16, 16);
  else {
    ctx.drawImage(cell(`face|${key}|${kind}|${sx}|${edges}|${clean ? 1 : 0}`, () => {
      const c = t.pb.sub(sx, sy, 16, 16);
      applyFaceEdges(c, key, kind, edges, MAT[key].lip, sx);
      return c;
    }), px, py);
  }
  if (kind === 'face_low') ctx.drawImage(spillTex(key, clean).cv, sx, 0, 16, 4, px, py + 16, 16, 4);
}

/** Edge bits for a face: 1 = open west, 2 = open east, 4 = no wall above (cap needed). */
function faceEdges(kind, mask) {
  return (mask & 8 ? 0 : 1) | (mask & 2 ? 0 : 2) | (mask & 1 ? 0 : 4);
}
function applyFaceEdges(c, key, kind, edges, lip, sx) {
  const rubble = key === 'wall_rubble';
  if (edges & 4) {
    // nothing above this face: give it the top's lip and a short shadow (face_high already has one)
    if (kind === 'face_low') for (let x = 0; x < 16; x++) { c.set(x, 0, lip); c.tint(x, 1, 'ink', 0.5); c.tint(x, 2, 'ink', 0.25); }
  }
  for (let y = 0; y < 16; y++) {
    if (edges & 1) {
      if (rubble) { const d = 1 + ((y * 7 + sx) % 3); for (let k = 0; k < d; k++) c.tint(k, y, 'ink', 0.6 - k * 0.15); }
      else { c.tint(0, y, 'ink', 0.6); c.tint(1, y, [255, 255, 255], 0.14); }
    }
    if (edges & 2) {
      if (rubble) { const d = 1 + ((y * 5 + sx) % 3); for (let k = 0; k < d; k++) c.tint(15 - k, y, 'ink', 0.65 - k * 0.15); }
      else { c.tint(15, y, 'ink', 0.65); c.tint(14, y, 'ink', 0.28); }
    }
  }
  if ((edges & 1) && !rubble && kind === 'face_high') c.set(0, 0, lt255(lip));
}

function drawWindowCell(ctx, key, kind, mask, px, py, tx, clean, variant) {
  const mat = WINDOW_MAT[key];
  const t = faceTex(mat, clean);
  const sx = mod(tx, FW / 16) * 16;
  const v = clean ? 0 : variant % 7;
  const edges = faceEdges(kind, mask) & 3;
  ctx.drawImage(cell(`win|${key}|${kind}|${sx}|${v}|${edges}|${clean ? 1 : 0}`, () => {
    const full = t.pb.sub(sx, 0, 16, 32);
    drawWindow(full, mat === 'wall_brick' ? 'brick' : 'plaster', clean, v);
    const c = full.sub(0, kind === 'face_high' ? 0 : 16, 16, 16);
    if (edges) applyFaceEdges(c, mat, kind, edges, MAT[mat].lip, sx);
    return c;
  }), px, py);
  if (kind === 'face_low') ctx.drawImage(spillTex(mat, clean).cv, sx, 0, 16, 4, px, py + 16, 16, 4);
}

// ---- door threshold ---------------------------------------------------------------------------
function drawDoor(ctx, kind, mask, px, py, tx, ty, clean) {
  const t = tex('door', clean, doorTex);
  const sx = mod(tx, DOOR_S / 16) * 16, sy = mod(ty, DOOR_S / 16) * 16;
  if (kind !== 'top' || !(mask & 10)) { ctx.drawImage(t.cv, sx, sy, 16, 16, px, py, 16, 16); return; }
  ctx.drawImage(cell(`door|${sx}|${sy}|${mask & 10}|${clean ? 1 : 0}`, () => {
    const c = t.pb.sub(sx, sy, 16, 16);
    doorJambs(c, mask);
    return c;
  }), px, py);
}

// ---- specials ---------------------------------------------------------------------------------
function drawSpecial(ctx, key, mask, px, py, tx, ty, clean, v) {
  const c1 = clean ? 1 : 0;
  switch (key) {
    case 'void':
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(px, py, 16, 16);
      return;
    case 'pit': {
      const t = tex('pit', false, pitTex);
      const sx = mod(tx, PIT_S / 16) * 16, sy = mod(ty, PIT_S / 16) * 16;
      if ((mask & 15) === 15) { ctx.drawImage(t.cv, sx, sy, 16, 16, px, py, 16, 16); return; }
      ctx.drawImage(cell(`pit|${sx}|${sy}|${mask & 15}`, () => { const c = t.pb.sub(sx, sy, 16, 16); pitEdges(c, mask); return c; }), px, py);
      return;
    }
    case 'drop': {
      const t = tex('drop', false, dropTex);
      const sx = mod(tx, DROP_S / 16) * 16, sy = mod(ty, DROP_S / 16) * 16;
      if ((mask & 15) === 15) { ctx.drawImage(t.cv, sx, sy, 16, 16, px, py, 16, 16); return; }
      ctx.drawImage(cell(`drop|${sx}|${sy}|${mask & 15}`, () => { const c = t.pb.sub(sx, sy, 16, 16); dropEdges(c, mask); return c; }), px, py);
      return;
    }
    case 'railing':
      ctx.drawImage(cell(`rail|${mask & 15}|${c1}`, () => railingCell(mask & 15, clean)), px, py);
      return;
    case 'railing_wood':
      ctx.drawImage(cell(`railw|${mask & 15}|${c1}`, () => railingCell(mask & 15, clean, true)), px, py);
      return;
    case 'stage_front':
      ctx.drawImage(cell(`stage|${mask & 10}|${v & 3}|${c1}`, () => stageCell(mask & 10, clean, v & 3)), px, py);
      return;
    case 'floor_stairs_up':
    case 'floor_stairs_down': {
      // mask is 0 from the engine today; sameMask | 16 would add stringers where the run ends
      const dir = key === 'floor_stairs_up' ? 'up' : 'down';
      const sides = mask & 16 ? (~mask & 10) : 0;
      ctx.drawImage(cell(`stairs|${dir}|${v % 5}|${sides}|${c1}`, () => stairsCell(dir, clean, v % 5, sides)), px, py);
      return;
    }
    default:
      ctx.fillStyle = '#f0f';
      ctx.fillRect(px, py, 16, 16);
  }
}

/** Preview/QA helper (not part of the facade): ms spent generating, cache sizes. */
export function tileStats() {
  return { textures: TEX.size, cells: CELL.size, initMs: initTiles.ms };
}
