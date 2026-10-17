// Tess's sketchbook: a spiral-bound pad with three tabs.
//   Map       — her pencil floor plan of every room she has visited (HW.state.visited), composed from
//               each map's rooms + floor offset, one page per floor, current room circled in red.
//   Notes     — documents she has read (reopen any of them).
//   Objective — the chapter and what she's trying to do, in her handwriting.
import { HW } from '../../engine/hw.js';
import { Screen } from '../screen.js';
import { C, F, W, H, CHAPTERS, handFont } from '../theme.js';
import { font } from '../text.js';
import { FONT } from '../fonts.js';
import { rect, frame, dither, paperSheet, triangle, canvas, ctx2d, AP, clamp, ease, snap } from '../gfx.js';
import { hints, spaced } from '../widgets.js';
import { rng, hashStr } from '../../art/util.js';
import * as svc from '../services.js';

const TABS = [{ id: 'map', label: 'Map' }, { id: 'notes', label: 'Notes' }, { id: 'objective', label: 'To do' }];
const FLOOR_ORDER = ['1F', '2F', 'B', 'B2', 'B3', 'EXT'];
const FLOOR_NAMES = { '1F': 'First floor', '2F': 'Second floor', B: 'Basement', B2: 'Under the stage', B3: 'The breaker', EXT: 'Outside' };
const PAGE = { x: 64, y: 84, w: 832, h: 404 };
const PENCIL = '#4a494f', PENCIL_LT = '#8b8990', RED = '#b2352f';

const pen = () => font({ family: FONT.hand, size: 20, lineHeight: 22, threshold: 0.45 });
const penS = () => font({ family: FONT.hand, size: 16, lineHeight: 18, threshold: 0.45 });

function mapList() {
  const m = HW.data?.maps;
  if (!m) return [];
  return (Array.isArray(m) ? m : Object.values(m)).map((x) => x?.default || x).filter((x) => x && x.id);
}

/** Pencil stroke: 2-px dots with low-frequency wobble and pressure gaps. */
function pencilLine(ctx, x0, y0, x1, y1, color, seed, o = {}) {
  const r = rng(seed);
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.round(len / AP));
  const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
  const amp = o.wobble ?? 1.6;
  const ph = r() * 6.28, fr = 0.02 + r() * 0.03;
  ctx.fillStyle = color;
  const over = o.over ?? 3;   // overshoot at the ends, like a quick sketch
  for (let i = -over; i <= n + over; i++) {
    const t = i / n;
    if (r() < (o.gaps ?? 0.04)) continue;
    const w = Math.sin(ph + i * fr * 6.28) * amp;
    const px = x0 + (x1 - x0) * t + nx * w, py = y0 + (y1 - y0) * t + ny * w;
    ctx.fillRect(snap(px), snap(py), AP, AP);
  }
}

function pencilRect(ctx, x, y, w, h, color, seed) {
  pencilLine(ctx, x, y, x + w, y, color, seed + 1);
  pencilLine(ctx, x + w, y, x + w, y + h, color, seed + 2);
  pencilLine(ctx, x + w, y + h, x, y + h, color, seed + 3);
  pencilLine(ctx, x, y + h, x, y, color, seed + 4);
}

/** A loose red-pencil loop around (cx, cy). */
function scribbleCircle(ctx, cx, cy, rx, ry, color, seed) {
  const r = rng(seed);
  ctx.fillStyle = color;
  const turns = 1.25, steps = Math.round((rx + ry) * 2.4);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2 * turns - 0.6;
    const k = 1 + (i / steps) * 0.12 + Math.sin(i * 0.3) * 0.03;
    ctx.fillRect(snap(cx + Math.cos(a) * rx * k + (r() - 0.5)), snap(cy + Math.sin(a) * ry * k + (r() - 0.5)), AP, AP);
  }
}

export class SketchbookScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.pausesGame = true; this.singleton = true;
    this.dimWorld = 0.7;
    this.tab = Math.max(0, TABS.findIndex((t) => t.id === args.tab));
    this.noteSel = 0; this.noteTop = 0;
    this.busy = false;
    this._floors();
    const here = this._currentMap();
    const fi = this.floors.indexOf(here?.floor);
    this.floor = fi >= 0 ? fi : 0;
    this.flip = 1;
  }
  onOpen() { svc.sfx('paper_rustle'); }

  _currentMap() {
    const id = HW.map?.id || svc.state().map;
    return mapList().find((m) => m.id === id) || null;
  }
  _floors() {
    const visited = svc.state().visited || {};
    const have = new Set();
    for (const m of mapList()) if ((m.rooms || []).some((r) => visited[r.id])) have.add(m.floor || '1F');
    const cur = this._currentMap();
    if (cur) have.add(cur.floor || '1F');
    this.floors = FLOOR_ORDER.filter((f) => have.has(f));
    for (const f of have) if (!this.floors.includes(f)) this.floors.push(f);
  }
  _notes() {
    const read = svc.state().docs || {};
    const all = svc.docs();
    return Object.keys(read).filter((id) => read[id] && all[id]).map((id) => ({ id, ...all[id] }));
  }

  update(dt, input) {
    this.flip = Math.min(1, this.flip + dt / 0.2);
    if (!input || this.busy) return;
    if (input.repeat('left')) { this.tab = (this.tab + TABS.length - 1) % TABS.length; this.flip = 0; svc.sfx('page_turn'); }
    else if (input.repeat('right')) { this.tab = (this.tab + 1) % TABS.length; this.flip = 0; svc.sfx('page_turn'); }
    const tab = TABS[this.tab].id;
    if (tab === 'map' && input.pressed('confirm')) { this.zoom = !this.zoom; svc.sfx('page_turn', { vol: 0.5 }); }
    if (tab === 'map' && this.floors.length > 1) {
      if (input.repeat('up')) { this.floor = (this.floor + this.floors.length - 1) % this.floors.length; svc.sfx('ui_move'); }
      if (input.repeat('down')) { this.floor = (this.floor + 1) % this.floors.length; svc.sfx('ui_move'); }
    }
    if (tab === 'notes') {
      const n = this._notes().length;
      if (n) {
        if (input.repeat('up')) { this.noteSel = (this.noteSel + n - 1) % n; svc.sfx('ui_move'); }
        if (input.repeat('down')) { this.noteSel = (this.noteSel + 1) % n; svc.sfx('ui_move'); }
        if (input.pressed('confirm')) {
          const d = this._notes()[this.noteSel];
          svc.sfx('ui_confirm');
          this.busy = true;
          this.open('doc', { id: d.id }).then(() => { this.busy = false; });
          return;
        }
      }
    }
    if (input.pressed('cancel') || input.pressed('sketchbook') || input.pressed('pause')) { svc.sfx('book_close'); this.close(null); }
  }

  render(ctx) {
    const k = ease.out(clamp(this.t / 0.22));
    const oy = snap((1 - k) * 26);
    this._book(ctx, oy);
    ctx.save();
    ctx.translate(0, oy);
    const tab = TABS[this.tab].id;
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * (0.3 + 0.7 * ease.out(this.flip));
    if (tab === 'map') this._map(ctx);
    else if (tab === 'notes') this._notesPage(ctx);
    else this._objective(ctx);
    ctx.globalAlpha = a0;
    ctx.restore();
    const hk = [['CLOSE', this.ui.input.keyLabel('cancel')], ['TABS', '← →']];
    if (tab === 'map' && this.floors.length > 1) hk.push(['FLOOR', '↑ ↓']);
    if (tab === 'map') hk.push([this.zoom ? 'WHOLE FLOOR' : 'ZOOM', this.ui.input.keyLabel('confirm')]);
    if (tab === 'notes') hk.push(['READ', this.ui.input.keyLabel('confirm')]);
    hints(ctx, hk);
  }

  _book(ctx, oy) {
    const { x, y, w, h } = PAGE;
    // cover board behind the pad, then tabs, paper, spiral
    dither(ctx, x - 6, y - 10 + oy, w + 24, h + 28, 'rgba(0,0,0,1)', 0.5);
    rect(ctx, x - 12, y - 22 + oy, w + 24, h + 34, '#1d1b1a');
    rect(ctx, x - 12, y - 22 + oy, w + 24, AP, '#3a3532');
    TABS.forEach((t, i) => {
      const on = i === this.tab;
      const tw = 128, tx = x + 40 + i * (tw + 12), th = on ? 34 : 28, ty = y - 58 - (on ? 6 : 0) + oy;
      const col = ['#c9b45a', '#c47a74', '#7e9cb5'][i];
      rect(ctx, tx, ty, tw, th + 10, on ? col : mixDark(col));
      rect(ctx, tx, ty, tw, AP, 'rgba(255,255,255,0.25)');
      pen().draw(ctx, t.label, tx + tw / 2, ty + 4, on ? '#2a2620' : '#3a352e', { align: 'center' });
    });
    ctx.drawImage(paperSheet(w, h, { seed: 'sketchbook', tone: '#e2dbc6', hi: '#ebe6d6', lo: '#cfc6ad', stains: 1, edge: '#b5aa8c' }), x, y + oy);
    // spiral binding across the top
    for (let sx = x + 18; sx < x + w - 10; sx += 22) {
      rect(ctx, sx, y - 10 + oy, 6, 22, '#1a1a1d');
      rect(ctx, sx + 2, y - 12 + oy, 4, 18, '#8c8b90');
      rect(ctx, sx + 2, y - 12 + oy, 2, 8, '#c9c8cc');
      rect(ctx, sx, y + 12 + oy, 6, 4, '#121214');
    }
  }

  // ---- Map ---------------------------------------------------------------------------------------------
  /** The pencil plan is thousands of 2-px dots: draw it once per (floor, zoom, visits, position). */
  _map(ctx) {
    const visited = svc.state().visited || {};
    const p = HW.player;
    const key = [this.floor, this.floors.join(), this.zoom ? 1 : 0, Object.keys(visited).length, HW.map?.id,
      p ? Math.round(p.x / 4) : '', p ? Math.round(p.y / 4) : ''].join('|');
    if (!this._mapCache || this._mapCache.key !== key) {
      const c = this._mapCache?.c || canvas(W, H);
      const x = ctx2d(c);
      x.clearRect(0, 0, W, H);
      this._mapDraw(x);
      this._mapCache = { key, c };
    }
    ctx.drawImage(this._mapCache.c, 0, 0);
  }

  _mapDraw(ctx) {
    const { x, y, w, h } = PAGE;
    const visited = svc.state().visited || {};
    if (!this.floors.length) {
      handFont('tess').font.draw(ctx, "Haven't drawn anything yet.", x + 60, y + 80, PENCIL);
      return;
    }
    const floor = this.floors[this.floor];
    const maps = mapList().filter((m) => (m.floor || '1F') === floor);
    const rooms = [];
    for (const m of maps) for (const r of m.rooms || []) {
      if (!visited[r.id] || !r.rect) continue;
      const [ox, oy] = m.offset || [0, 0];
      rooms.push({ ...r, map: m.id, fx: ox + r.rect[0], fy: oy + r.rect[1], fw: r.rect[2], fh: r.rect[3] });
    }
    // floor selector (top-left)
    const pf = pen();
    this.floors.forEach((f, i) => {
      const fx = x + 34 + i * 54, fy = y + 22;
      pf.draw(ctx, f, fx, fy, i === this.floor ? '#2a2830' : PENCIL_LT);
      if (i === this.floor) scribbleCircle(ctx, fx + pf.width(f) / 2, fy + 12, pf.width(f) / 2 + 12, 15, PENCIL, 7 + i);
    });
    handFont('tess').font.draw(ctx, FLOOR_NAMES[floor] || floor, x + w - 40, y + 18, PENCIL, { align: 'right' });
    if (!rooms.length) { handFont('tess').font.draw(ctx, 'Nothing here yet.', x + 60, y + 120, PENCIL_LT); return; }
    // fit the floor to the page, or zoom in around Tess (confirm toggles)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rooms) { x0 = Math.min(x0, r.fx); y0 = Math.min(y0, r.fy); x1 = Math.max(x1, r.fx + r.fw); y1 = Math.max(y1, r.fy + r.fh); }
    const area = { x: x + 36, y: y + 70, w: w - 72, h: h - 110 };
    const fitSc = Math.min(area.w / (x1 - x0), area.h / (y1 - y0), 9);
    const curMap0 = this._currentMap();
    let cx0 = (x0 + x1) / 2, cy0 = (y0 + y1) / 2, sc = fitSc;
    if (this.zoom && fitSc < 8) {
      sc = Math.min(9, fitSc * 2.4);
      const p = HW.player;
      if (p && curMap0 && (curMap0.floor || '1F') === floor) { cx0 = (curMap0.offset?.[0] || 0) + p.x / 16; cy0 = (curMap0.offset?.[1] || 0) + p.y / 16; }
    }
    const ox = area.x + area.w / 2 - cx0 * sc, oy = area.y + area.h / 2 - cy0 * sc;
    const P = (tx, ty) => [snap(ox + tx * sc), snap(oy + ty * sc)];
    ctx.save(); ctx.beginPath(); ctx.rect(x + 8, y + 56, w - 16, h - 64); ctx.clip();
    // where is Tess?
    const curMap = this._currentMap();
    let curRoom = null, me = null;
    try {
      const p = HW.player;
      if (p && curMap && (curMap.floor || '1F') === floor) {
        curRoom = HW.map?.roomAt?.(p.x, p.y) || null;
        me = P((curMap.offset?.[0] || 0) + p.x / 16, (curMap.offset?.[1] || 0) + p.y / 16);
      }
    } catch { /* no player */ }
    // halls first (hatched), then rooms
    const sorted = rooms.slice().sort((a, b) => (a.kind === 'hall' ? -1 : 0) - (b.kind === 'hall' ? -1 : 0));
    for (const r of sorted) {
      const [rx, ry] = P(r.fx, r.fy), [rx2, ry2] = P(r.fx + r.fw, r.fy + r.fh);
      const rw = rx2 - rx, rh = ry2 - ry;
      const seed = hashStr(r.id);
      if (r.kind === 'hall') {
        // light diagonal hatching for corridors
        ctx.fillStyle = 'rgba(80,78,86,0.35)';
        for (let d = -rh; d < rw; d += 10) for (let t = 0; t < rh; t += AP) {
          const hx = rx + d + t;
          if (hx >= rx && hx < rx + rw) ctx.fillRect(snap(hx), ry + t, AP, AP);
        }
      } else rect(ctx, rx, ry, rw, rh, 'rgba(255,252,240,0.35)');
      pencilRect(ctx, rx, ry, rw, rh, PENCIL, seed);
      if ((seed & 3) === 0) pencilLine(ctx, rx + 2, ry - 2, rx + rw * 0.6, ry - 1, PENCIL_LT, seed + 9, { wobble: 1 }); // overdraw
    }
    // labels
    for (const r of sorted) {
      const [rx, ry] = P(r.fx, r.fy), [rx2, ry2] = P(r.fx + r.fw, r.fy + r.fh);
      const rw = rx2 - rx, rh = ry2 - ry;
      let label = String(r.name || '').replace(/^Room\s+/i, '');
      let f = pen();
      if (f.width(label) > rw - 6) f = penS();
      if (f.width(label) > rw - 4 && label.includes(' ')) label = label.split(' ').map((s) => s[0]).join('');
      if (f.width(label) > rw + 8 || rh < 14) continue;
      const cx = rx + rw / 2, cy = ry + rh / 2 - f.lineHeight / 2;
      f.draw(ctx, label, cx, cy, r.kind === 'hall' ? PENCIL_LT : '#34333a', { align: 'center' });
      if (curRoom && curRoom.id === r.id) scribbleCircle(ctx, cx, cy + f.lineHeight / 2, Math.max(18, f.width(label) / 2 + 12), 16, RED, 99);
    }
    if (me) {
      // red X where Tess is standing
      for (let i = -6; i <= 6; i += AP) { rect(ctx, me[0] + i, me[1] + i, AP * 2, AP, RED); rect(ctx, me[0] + i, me[1] - i, AP * 2, AP, RED); }
      penS().draw(ctx, 'me', me[0] + 10, me[1] - 22, RED);
    }
    ctx.restore();
    // compass doodle + disclaimer
    const nx = x + w - 54, ny = y + h - 70;
    pencilLine(ctx, nx, ny + 30, nx, ny, PENCIL, 3, { wobble: 0.5, over: 0 });
    triangle(ctx, nx - 6, ny - 6, 4, PENCIL, 'up');
    pen().draw(ctx, 'N', nx + 10, ny - 6, PENCIL);
    penS().draw(ctx, '(not to scale. obviously.)', x + 36, y + h - 34, PENCIL_LT);
  }

  // ---- Notes ---------------------------------------------------------------------------------------------
  _notesPage(ctx) {
    const { x, y, w, h } = PAGE;
    const hf = handFont('tess');
    const notes = this._notes();
    hf.font.draw(ctx, 'Things I found', x + 40, y + 20, '#2a2830');
    pencilLine(ctx, x + 40, y + 52, x + 260, y + 52, PENCIL, 5);
    if (!notes.length) { hf.font.draw(ctx, '(nothing yet)', x + 60, y + 90, PENCIL_LT); return; }
    const rowH = 34, rows = 9;
    if (this.noteSel < this.noteTop) this.noteTop = this.noteSel;
    if (this.noteSel >= this.noteTop + rows) this.noteTop = this.noteSel - rows + 1;
    notes.slice(this.noteTop, this.noteTop + rows).forEach((d, i) => {
      const idx = this.noteTop + i;
      const ry = y + 70 + i * rowH;
      const on = idx === this.noteSel;
      pencilLine(ctx, x + 52, ry + 16, x + 64, ry + 16, PENCIL, 20 + idx, { wobble: 0.3, over: 0 });
      hf.font.draw(ctx, d.title || d.id, x + 76, ry, on ? '#1f1e24' : '#55535a');
      if (d.date) penS().draw(ctx, d.date, x + w - 60, ry + 6, PENCIL_LT, { align: 'right' });
      if (on) {
        triangle(ctx, x + 24 + (Math.floor(this.t * 3) % 2 ? AP : 0), ry + 8, 5, RED, 'right');
        pencilLine(ctx, x + 76, ry + 28, x + 76 + hf.font.width(d.title || d.id), ry + 28, RED, 40 + idx, { wobble: 0.8 });
      }
    });
    if (notes.length > rows) penS().draw(ctx, `${this.noteSel + 1}/${notes.length}`, x + w - 60, y + h - 34, PENCIL_LT, { align: 'right' });
  }

  // ---- Objective --------------------------------------------------------------------------------------------
  _objective(ctx) {
    const { x, y, w } = PAGE;
    const s = svc.state();
    const [num, name] = CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, s.chapter | 0))];
    const hf = handFont('tess');
    const big = font({ family: FONT.hand, size: 34, lineHeight: 42, threshold: 0.45 });
    const title = name ? `${num}. ${name}` : num;
    big.draw(ctx, title, x + 60, y + 30, '#2a2830');
    pencilLine(ctx, x + 60, y + 72, x + 60 + big.width(title), y + 74, PENCIL, 11);
    pencilLine(ctx, x + 64, y + 78, x + 40 + big.width(title), y + 78, PENCIL_LT, 12);
    hf.font.draw(ctx, 'What I have to do:', x + 60, y + 104, PENCIL);
    const lines = big.wrap(s.objective || "Get out. Get everyone out.", w - 160).slice(0, 5);
    lines.forEach((l, i) => {
      big.draw(ctx, l, x + 104, y + 146 + i * 46, '#26252b');
    });
    // box tick doodle beside the objective
    pencilRect(ctx, x + 64, y + 160, 20, 20, PENCIL, 77);
    // a small doodle in the corner: the bell
    const bx = x + w - 150, by = y + 260;
    pencilLine(ctx, bx, by + 60, bx + 70, by + 60, PENCIL_LT, 31);
    pencilLine(ctx, bx + 6, by + 60, bx + 16, by + 14, PENCIL_LT, 32);
    pencilLine(ctx, bx + 64, by + 60, bx + 54, by + 14, PENCIL_LT, 33);
    pencilLine(ctx, bx + 16, by + 14, bx + 54, by + 14, PENCIL_LT, 34);
    pencilLine(ctx, bx + 35, by + 14, bx + 35, by + 2, PENCIL_LT, 35);
    penS().draw(ctx, "don't be in the hall", bx - 40, by + 74, PENCIL_LT);
  }
}

function mixDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * 0.62).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}
