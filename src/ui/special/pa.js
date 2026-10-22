// 'pa' — the 1970s Rauland intercom console in the main office.
// args { rooms: [{ id, label }], onListen: async (roomId) => void }. Rows of bat-handle toggles with
// label tape, a VU meter whose needle reacts while listening, LISTEN / TALK / ALL CALL switches and
// a red power LED. Resolves when the player steps away (cancel) or a script calls HW.ui.close('pa').
// Scripts can drive it: HW.ui.get('pa').setMode('allcall' | 'listen' | 'talk'), .setRoom(id | null),
// .setLevel(0..1 | null), .setLamp(id, on) (a room's lamp stays lit, e.g. 205 / LIB answering the roll),
// .setLocked(bool) (the console ignores the player while the school has it).
import { HW } from '../../engine/hw.js';
import { Screen, Z_SPECIAL } from '../screen.js';
import { C, F } from '../theme.js';
import { canvas, ctx2d, rect, frame, dither, triangle, AP, clamp, ease, snap } from '../gfx.js';
import { hints } from '../widgets.js';
import { rng, hash2, tinyText } from '../../art/util.js';
import * as svc from '../services.js';

const PER_ROW = 9;
const BODY = { x: 40, y: 34, w: 880, h: 450 };

export class PAScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.z = Z_SPECIAL;
    this.dimWorld = 0.75;
    this.rooms = (args.rooms || []).map((r) => (typeof r === 'string' ? { id: r, label: r } : r));
    this.sel = 0;
    this.active = null;       // room switch flipped up
    this.mode = 'listen';
    this.listening = false;
    this.needle = 0; this.needleV = 0; this.levelOverride = null;
    this.flips = new Map();   // id → 0..1 lever animation
    this.lamps = new Set();   // rooms whose lamp a script lit (roll call answers)
    this.locked = false;
  }
  onOpen() { svc.sfx('ui_open'); svc.sfx('intercom_crackle', { vol: 0.4 }); }

  // ---- script hooks ---------------------------------------------------------------------------------------
  setMode(m) { if (['listen', 'talk', 'allcall'].includes(m)) { this.mode = m; svc.sfx('ui_confirm'); } }
  setRoom(id) { this.active = id; }
  setLevel(v) { this.levelOverride = v == null ? null : clamp(v); }
  setLamp(id, on = true) { if (on) this.lamps.add(id); else this.lamps.delete(id); }
  setLocked(v) { this.locked = !!v; }

  async _listen(room) {
    this.active = room.id;
    this.listening = true;
    svc.sfx('ui_confirm'); svc.sfx('intercom_crackle', { vol: 0.6 });
    try { await this.args.onListen?.(room.id); } catch (e) { console.error('[ui] pa.onListen', e); }
    this.listening = false;
  }

  update(dt, input) {
    // VU needle: spring toward the signal level
    let target = 0.04;
    if (this.levelOverride != null) target = this.levelOverride;
    else if (this.listening || this.mode === 'allcall') {
      let lvl = null;
      try { lvl = HW.audio?.level?.(); } catch { lvl = null; }
      const n = (hash2(Math.floor(this.t * 14), 5) % 100) / 100;
      target = lvl != null ? clamp(lvl) : 0.25 + n * 0.45 + Math.sin(this.t * 3.1) * 0.08;
      if (this.mode === 'allcall') target = Math.max(target, 0.55 + n * 0.3);
    }
    this.needleV += (target - this.needle) * dt * 60 - this.needleV * dt * 9;
    this.needle = clamp(this.needle + this.needleV * dt, 0, 1.05);
    for (const r of this.rooms) {
      const want = r.id === this.active ? 1 : 0;
      this.flips.set(r.id, clamp((this.flips.get(r.id) || 0) + (want ? dt : -dt) / 0.08));
    }
    if (!input || this.listening || this.locked) return;
    const n = this.rooms.length;
    if (n) {
      let s = this.sel;
      if (input.repeat('left')) s = (s + n - 1) % n;
      if (input.repeat('right')) s = (s + 1) % n;
      if (input.repeat('up') && s - PER_ROW >= 0) s -= PER_ROW;
      if (input.repeat('down') && s + PER_ROW < n) s += PER_ROW;
      if (s !== this.sel) { this.sel = s; svc.sfx('ui_move'); }
      if (input.pressed('confirm')) this._listen(this.rooms[this.sel]);
    }
    if (input.pressed('cancel') || input.pressed('pause')) { svc.sfx('ui_close'); this.close(null); }
  }

  render(ctx) {
    const k = ease.out(clamp(this.t / 0.25));
    const oy = snap((1 - k) * 30);
    ctx.save(); ctx.translate(0, oy);
    ctx.drawImage(consoleBody(), BODY.x, BODY.y, BODY.w, BODY.h);
    this._vu(ctx, 120, 72);
    this._speaker(ctx);
    this._power(ctx);
    this._switches(ctx);
    this._modes(ctx);
    ctx.restore();
    hints(ctx, [['STEP AWAY', this.ui.input.keyLabel('cancel')], ['LISTEN', this.ui.input.keyLabel('confirm')]]);
  }

  _vu(ctx, x, y) {
    // cream meter face with a black arc scale, red zone and a thin black needle
    const w = 230, h = 128;
    rect(ctx, x - 6, y - 6, w + 12, h + 12, '#1b1b1f');
    rect(ctx, x, y, w, h, '#e4d9b4');
    dither(ctx, x, y, w, h, '#cfc39a', 0.2);
    const cx = x + w / 2, cy = y + h + 30, R = 132;
    for (let i = 0; i <= 20; i++) {
      const a = -0.62 + (i / 20) * 1.24;
      const red = i >= 15;
      const r0 = R - (i % 5 === 0 ? 18 : 10);
      for (let r = r0; r < R; r += AP) rect(ctx, snap(cx + Math.sin(a) * r), snap(cy - Math.cos(a) * r), AP, AP, red ? '#b3262c' : '#1d1c22');
    }
    for (let r = R - 4; r <= R - 2; r += 2) for (let a = -0.62; a < 0.62; a += 0.01) rect(ctx, snap(cx + Math.sin(a) * r), snap(cy - Math.cos(a) * r), AP, AP, a > 0.32 ? '#b3262c' : '#1d1c22');
    F.small.draw(ctx, 'VU', cx, y + h - 46, '#1d1c22', { align: 'center' });
    F.small.draw(ctx, '-20', x + 14, y + 26, '#1d1c22'); F.small.draw(ctx, '+3', x + w - 34, y + 26, '#b3262c');
    // needle
    const a = -0.62 + this.needle * 1.24;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    for (let r = 0; r < R - 6; r += AP) rect(ctx, snap(cx + Math.sin(a) * r), snap(cy - Math.cos(a) * r), AP, AP, '#121216');
    ctx.restore();
    rect(ctx, x, y + h - 14, w, 14, '#2a2a30');
    F.small.draw(ctx, 'RAULAND', cx, y + h - 16, '#bdb7a6', { align: 'center' });
    // glass glare
    dither(ctx, x + 6, y + 6, 70, 30, 'rgba(255,255,255,0.6)', 0.12);
  }

  _speaker(ctx) {
    const x = 640, y = 66, w = 220, h = 124;
    rect(ctx, x - 4, y - 4, w + 8, h + 8, '#1b1b1f');
    rect(ctx, x, y, w, h, '#4a4a50');
    for (let j = 6; j < h - 4; j += 8) for (let i = 6 + ((j / 8) % 2) * 4; i < w - 4; i += 8) rect(ctx, x + i, y + j, 4, 4, '#121215');
    // the cone behind the grille breathes with the signal
    const live = this.listening || this.mode === 'allcall' || this.levelOverride != null;
    if (live) {
      const r = 26 + Math.round(this.needle * 10) * AP;
      for (let j = -r; j <= r; j += 8) for (let i = -r; i <= r; i += 8) {
        if (i * i + j * j > r * r) continue;
        rect(ctx, snap(x + w / 2 + i), snap(y + h / 2 + j), 4, 4, 'rgba(255,220,170,0.08)');
      }
    }
    F.small.draw(ctx, 'MONITOR', x + w / 2, y + h + 8, '#2a2a30', { align: 'center' });
    if (this.listening && this.active) {
      const room = this.rooms.find((r2) => r2.id === this.active);
      const blink = Math.floor(this.t * 2) % 2 === 0;
      F.small.draw(ctx, `LISTENING — ${room?.label || this.active}`, 420, 182, blink ? '#8a1a14' : '#3a2a26');
    }
  }

  _power(ctx) {
    const x = 420, y = 84;
    F.small.draw(ctx, 'POWER', x, y, '#26262c');
    const on = Math.floor(this.t * 0.7) % 9 !== 0 || this.t < 1;   // the old LED stutters now and then
    rect(ctx, x + 70, y + 2, 16, 16, '#2a0d0b');
    rect(ctx, x + 72, y + 4, 12, 12, on ? '#ff3b2e' : '#6a1a14');
    if (on) dither(ctx, x + 62, y - 6, 32, 32, 'rgba(255,60,40,0.8)', 0.12);
    F.small.draw(ctx, 'VOLUME', x, y + 52, '#26262c');
    // a knob
    const kx = x + 90, ky = y + 60;
    rect(ctx, kx - 18, ky - 18, 36, 36, '#151518'); rect(ctx, kx - 16, ky - 16, 32, 32, '#2e2e34');
    rect(ctx, kx - 2, ky - 16, 4, 12, '#d8d0b8');
  }

  _switches(ctx) {
    // two rows must fit between the ROOM SELECTOR heading and the divider over the mode switches (y 428)
    const cw = 88, rh = 82, top = 264, left = BODY.x + (BODY.w - PER_ROW * cw) / 2;
    this.rooms.forEach((r, i) => {
      const x = left + (i % PER_ROW) * cw, y = top + Math.floor(i / PER_ROW) * rh;
      const flip = ease.out(this.flips.get(r.id) || 0);
      // mounting plate + bat-handle lever (down = off, up = on)
      rect(ctx, x + 30, y, 24, 40, '#2a2a30'); rect(ctx, x + 32, y + 2, 20, 36, '#55555d');
      rect(ctx, x + 38, y + 16, 8, 8, '#1a1a1e');
      const len = 26;
      const dir = flip > 0.5 ? -1 : 1;
      const L = Math.round(len * Math.abs(1 - 2 * flip) / 2) * 2 + 6;
      for (let j = 0; j < L; j += AP) rect(ctx, x + 39, y + 20 + dir * j - (dir < 0 ? AP : 0), 6, AP, '#c9c8cc');
      rect(ctx, x + 37, y + 20 + dir * L - (dir < 0 ? 6 : 0), 10, 6, '#e8e8ea');
      // label tape (embossed white on black)
      const lw = Math.max(48, F.small.width(r.label) + 14);
      rect(ctx, x + 42 - lw / 2, y + 50, lw, 22, '#141417');
      F.small.draw(ctx, r.label, x + 42, y + 51, '#e8e4d8', { align: 'center' });
      // indicator lamp: amber while this room is open
      const lit = this.active === r.id || this.lamps.has(r.id);
      rect(ctx, x + 64, y + 4, 8, 8, lit ? (this.listening && Math.floor(this.t * 6) % 2 ? '#ffd27a' : '#e0a040') : '#3a2a14');
      if (this.lamps.has(r.id)) dither(ctx, x + 56, y - 4, 24, 24, 'rgba(255,190,90,0.9)', 0.18);
      if (i === this.sel && !this.listening && !this.locked) {
        // the cursor points at the lever from inside the frame (above the frame it sat on the row above)
        frame(ctx, x + 4, y - 6, 76, 82, C.red);
        triangle(ctx, x + 12 + (Math.floor(this.t * 3) % 2 ? AP : 0), y + 9, 6, C.red, 'right');
      }
    });
  }

  _modes(ctx) {
    const y = 438, x0 = 110;
    [['listen', 'LISTEN'], ['talk', 'TALK'], ['allcall', 'ALL CALL']].forEach(([id, label], i) => {
      const x = x0 + i * 150;
      const on = this.mode === id;
      rect(ctx, x, y, 120, 36, '#1a1a1e');
      rect(ctx, x + 2, y + 2, 116, 32, on ? (id === 'allcall' ? '#8a1a14' : '#3a3a42') : '#2a2a30');
      if (on && id === 'allcall') dither(ctx, x - 8, y - 8, 136, 52, 'rgba(255,60,40,0.9)', 0.1 + (svc.reduceFlashing() ? 0 : 0.08 * Math.sin(this.t * 8)));
      F.small.draw(ctx, label, x + 60, y + 8, on ? (id === 'allcall' ? '#ffd8cc' : '#e8e4d8') : '#8a8890', { align: 'center' });
    });
  }
}

let bodyCanvas = null;
/** Cabinet at art resolution (440×225, drawn ×2): walnut cheeks, brushed-aluminium faceplate. */
function consoleBody() {
  if (bodyCanvas) return bodyCanvas;
  const w = BODY.w / 2, h = BODY.h / 2;
  const c = canvas(w, h); const x = ctx2d(c);
  const r = rng(1979);
  rect(x, 0, 0, w, h, '#2a1810');
  for (let j = 0; j < h; j++) { x.fillStyle = r() < 0.5 ? '#4a2c1a' : '#3c2214'; x.fillRect(0, j, 18, 1); x.fillRect(w - 18, j, 18, 1); }
  for (let k = 0; k < 40; k++) { x.fillStyle = '#5c3a22'; x.fillRect(Math.floor(r() * 18), Math.floor(r() * h), 1, 3 + Math.floor(r() * 8)); x.fillRect(w - 18 + Math.floor(r() * 18), Math.floor(r() * h), 1, 3 + Math.floor(r() * 8)); }
  // faceplate
  rect(x, 18, 4, w - 36, h - 8, '#9d9b95');
  for (let j = 4; j < h - 4; j++) if (r() < 0.45) { x.fillStyle = r() < 0.5 ? '#a9a7a1' : '#8f8d87'; x.fillRect(18, j, w - 36, 1); }
  rect(x, 18, 4, w - 36, 1, '#cfcdc6'); rect(x, 18, h - 5, w - 36, 1, '#5d5b56');
  // section dividers & engraved headings
  rect(x, 24, 100, w - 48, 1, '#6d6b66'); rect(x, 24, 101, w - 48, 1, '#c3c1ba');
  rect(x, 24, 197, w - 48, 1, '#6d6b66'); rect(x, 24, 198, w - 48, 1, '#c3c1ba');
  tinyText(x, 30, 105, 'ROOM SELECTOR', '#3a3934');
  tinyText(x, w - 86, 206, 'HALLOWELL C.S.', '#3a3934');
  // screws
  for (const [sx, sy] of [[22, 8], [w - 26, 8], [22, h - 12], [w - 26, h - 12]]) { rect(x, sx, sy, 4, 4, '#55534e'); rect(x, sx + 1, sy + 1, 2, 1, '#2a2925'); }
  // nicotine haze toward the top
  x.fillStyle = 'rgba(120,100,50,0.08)'; x.fillRect(18, 4, w - 36, 40);
  return (bodyCanvas = c);
}
