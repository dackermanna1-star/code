// Props preview — tiny tilemap + prop compositor that mimics the engine's layer order (TECH §3):
// floor → decals → wall faces → wall props + open doors → y-sorted floor props (+ actors) → wall
// tops → over props. Wall kinds follow engine/map.js (face_low / face_high / top), door runs
// become lintels like the engine's auto doors.
import { TILES, LEGEND } from '../../src/data/tiles.js';
import { propDef } from '../../src/data/props.js';
import { hashStr } from '../../src/art/util.js';

export function buildMap(id, rows, legend = {}) {
  const L = { ...LEGEND, ...legend };
  const h = rows.length, w = rows[0].length;
  rows.forEach((r, y) => { if (r.length !== w) throw new Error(`${id}: row ${y} length ${r.length} != ${w}`); });
  const keys = rows.map((r) => [...r].map((ch) => { const k = L[ch]; if (!k) throw new Error(`${id}: char '${ch}'`); return k; }));
  const inB = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const tileAt = (x, y) => (inB(x, y) ? keys[y][x] : 'void');
  const kind = (x, y) => TILES[tileAt(x, y)].kind;
  const isWall = (x, y) => inB(x, y) && (kind(x, y) === 'wall' || kind(x, y) === 'window');
  const isOpen = (x, y) => inB(x, y) && !isWall(x, y) && tileAt(x, y) !== 'void';
  const isDoor = (x, y) => inB(x, y) && kind(x, y) === 'door';
  const wallKind = (x, y) => {
    if (!isWall(x, y)) return null;
    if (isOpen(x, y + 1)) return 'face_low';
    if (isWall(x, y + 1) && isOpen(x, y + 2)) return 'face_high';
    return 'top';
  };
  const wallMask = (x, y) => (isWall(x, y - 1) ? 1 : 0) | (isWall(x + 1, y) ? 2 : 0) | (isWall(x, y + 1) ? 4 : 0) | (isWall(x - 1, y) ? 8 : 0);
  const sameMask = (x, y) => { const k = tileAt(x, y); return (tileAt(x, y - 1) === k ? 1 : 0) | (tileAt(x + 1, y) === k ? 2 : 0) | (tileAt(x, y + 1) === k ? 4 : 0) | (tileAt(x - 1, y) === k ? 8 : 0); };
  const seed = hashStr(id);
  const variantAt = (x, y) => { let hh = Math.imul(x + 7, 374761393) ^ Math.imul(y + 13, 668265263) ^ seed; hh = Math.imul(hh ^ (hh >>> 13), 1274126177); return ((hh ^ (hh >>> 16)) >>> 0) & 0xffff; };
  const lintel = new Set();
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    if (!isDoor(x, y)) continue;
    const y0 = y; while (y + 1 < h && isDoor(x, y + 1)) y++;
    const len = y - y0 + 1;
    if (len === 1 && isWall(x, y0 - 1) && isWall(x, y0 + 1)) continue;
    const top = Math.max(y0, y - 1);
    for (let yy = y0; yy < top; yy++) lintel.add(`${x},${yy}`);
  }
  return { id, w, h, tileAt, wallKind, wallMask, sameMask, variantAt, lintel, isWall };
}

function layer(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; }

/**
 * Render a map + props into one world-px canvas.
 * props: [{ type, x, y, state, dir, variant, clean, params, label, actor? }]
 * actors: [{ sortY, draw(ctx) }] y-sorted with floor props.
 */
export function renderScene(art, m, props = [], { clean = false, t = 0, actors = [] } = {}) {
  const W = m.w * 16, H = m.h * 16;
  const [F, f] = layer(W, H), [A, a] = layer(W, H), [T, tp] = layer(W, H);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const key = m.tileAt(x, y), def = TILES[key];
    const o = { kind: undefined, mask: 0, variant: m.variantAt(x, y), clean, t: 0 };
    let c = f;
    if (def.kind === 'wall' || def.kind === 'window') { o.kind = m.wallKind(x, y); o.mask = m.wallMask(x, y); c = o.kind === 'top' ? tp : a; }
    else if (def.kind === 'door') { if (m.lintel.has(`${x},${y}`)) { o.kind = 'top'; o.mask = m.wallMask(x, y); } }
    else if (key === 'railing' || key === 'stage_front') { o.mask = m.sameMask(x, y); c = a; }
    else if (key === 'pit') o.mask = m.sameMask(x, y);
    try { art.drawTile(c, key, x * 16, y * 16, o); } catch (e) { c.fillStyle = '#333'; c.fillRect(x * 16, y * 16, 16, 16); }
  }
  const [out, ctx] = layer(W, H);
  ctx.drawImage(F, 0, 0);
  const decals = [], wall = [], ys = [], over = [];
  for (const p of props) {
    const def = propDef(p.type);
    const it = { ...p, def, clean: p.clean ?? clean };
    if (def.mount === 'decal') decals.push(it);
    else if (def.mount === 'wall') wall.push(it);
    else if (def.mount === 'over') over.push(it);
    else if (def.interact === 'door' && p.state === 'open') wall.push(it);
    else ys.push({ sortY: (p.y + def.h) * 16, prop: it });
  }
  // engine rule (map.js): small non-solid floor props resting on solid furniture sort just after it
  for (const e of ys) {
    if (!e.prop || e.prop.def.solid) continue;
    const under = ys.find((u) => u.prop && u !== e && u.prop.def.solid && e.prop.x >= u.prop.x && e.prop.x < u.prop.x + u.prop.def.w && e.prop.y + e.prop.def.h - 1 >= u.prop.y && e.prop.y + e.prop.def.h - 1 < u.prop.y + u.prop.def.h);
    if (under) e.sortY = Math.max(e.sortY, under.sortY + 0.5);
  }
  const draw = (it) => {
    const params = { ...(it.params || {}), state: it.state, dir: it.dir, variant: it.variant, clean: it.clean, label: it.label };
    if (it.def.dynamic) { art.drawPropDynamic(ctx, it.type, it.x * 16, it.y * 16, params, t); return; }
    const r = art.prop(it.type, { state: it.state, dir: it.dir, variant: it.variant, clean: it.clean, label: it.label, params: it.params || {}, sitDir: it.sitDir });
    ctx.drawImage(r.canvas, it.x * 16 + r.ox, it.y * 16 + r.oy);
  };
  decals.forEach(draw);
  ctx.drawImage(A, 0, 0);
  wall.forEach(draw);
  for (const a2 of actors) ys.push(a2);
  ys.sort((p, q) => p.sortY - q.sortY);
  for (const e of ys) { if (e.prop) draw(e.prop); else e.draw(ctx); }
  ctx.drawImage(T, 0, 0);
  over.forEach(draw);
  return out;
}

/** Cheap darkness pass for value checks: multiply a night tint, then add soft pools of light. */
export function darkPass(src, lights = [], { dark = 0.9, tint = [11, 16, 32] } = {}) {
  const [c, x] = layer(src.width, src.height);
  x.drawImage(src, 0, 0);
  const [lm, l] = layer(src.width, src.height);
  const amb = 1 - dark;
  l.fillStyle = `rgb(${Math.round(tint[0] + 255 * amb * 0.6)},${Math.round(tint[1] + 255 * amb * 0.6)},${Math.round(tint[2] + 255 * amb * 0.7)})`;
  l.fillRect(0, 0, lm.width, lm.height);
  l.globalCompositeOperation = 'lighter';
  for (const L of lights) {
    const g = l.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
    g.addColorStop(0, L.color || 'rgba(255,240,214,0.95)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    l.fillStyle = g; l.beginPath();
    if (L.cone) { l.moveTo(L.x, L.y); l.arc(L.x, L.y, L.r, L.cone[0], L.cone[1]); l.closePath(); } else l.arc(L.x, L.y, L.r, 0, Math.PI * 2);
    l.fill();
  }
  x.globalCompositeOperation = 'multiply';
  x.drawImage(lm, 0, 0);
  return c;
}
