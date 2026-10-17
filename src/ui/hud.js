// HUD: battery meter, compact sparkle, period bell + hall clock, the interaction prompt,
// toasts and "Sketchbook updated" objective notices. Everything is diegetic-leaning and quiet.
import { HW } from '../engine/hw.js';
import { C, F, W } from './theme.js';
import { rect, frame, dither, plate, keycap, paperSheet, triangle, AP, clamp, approach, ease, snap, canvas, ctx2d } from './gfx.js';
import * as svc from './services.js';

const TOAST_LIFE = 2.8, NOTICE_LIFE = 4.6;

export class Hud {
  constructor(ui) {
    this.ui = ui;
    this.t = 0;
    this.alpha = 0;                 // whole-HUD fade (hidden in cutscenes/menus)
    this.battA = 0; this.compactA = 0; this.periodA = 0; this.periodT = 0;
    this.prompt = null;             // { target, verb, a, key }
    this.toasts = [];
    this.notices = [];
  }

  setPrompt(target, verb) {
    if (!target) { if (this.prompt) this.prompt.on = false; return; }
    const key = (target.id ?? '') + '|' + verb;
    if (this.prompt && this.prompt.key === key) { this.prompt.target = target; this.prompt.on = true; return; }
    this.prompt = { target, verb: verb || 'Look', a: 0, on: true, key };
  }

  toast(text) {
    this.toasts.push({ text: String(text), t: 0 });
    if (this.toasts.length > 4) this.toasts.shift();
  }
  notice(text) { this.notices.push({ text: String(text || ''), t: 0 }); if (this.notices.length > 2) this.notices.shift(); }

  update(dt, show) {
    this.t += dt;
    this.alpha = approach(this.alpha, show ? 1 : 0, dt / 0.25);
    const s = svc.state();
    const batt = Number(s.battery ?? 100);
    this.battA = approach(this.battA, (s.flashlightOn || batt < 25) ? 1 : 0, dt / 0.3);
    let past = false;
    try { const c = HW.compact; past = !!(typeof c?.hasPastHere === 'function' ? c.hasPastHere() : c?.hasPastHere); } catch { past = false; }
    const hasCompact = !!(s.inv?.compact) && (s.flags?.compact_unlocked ?? true);
    this.compactA = approach(this.compactA, past && hasCompact ? 1 : 0, dt / 0.5);
    const per = !!HW.periods?.active;
    if (per && this.periodA === 0) this.periodT = 0;
    this.periodT += dt;
    this.periodA = approach(this.periodA, per ? 1 : 0, dt / 0.4);
    if (this.prompt) {
      this.prompt.a = approach(this.prompt.a, this.prompt.on ? 1 : 0, dt / 0.12);
      if (!this.prompt.on && this.prompt.a <= 0) this.prompt = null;
    }
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < TOAST_LIFE);
    for (const n of this.notices) n.t += dt;
    this.notices = this.notices.filter((n) => n.t < NOTICE_LIFE);
  }

  /** World-anchored + corner HUD (under dialogue). */
  render(ctx) {
    if (this.alpha <= 0) return;
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * this.alpha;
    if (this.prompt && this.prompt.a > 0) this._prompt(ctx);
    if (this.battA > 0) this._battery(ctx);
    if (this.compactA > 0) this._compact(ctx);
    if (this.periodA > 0) this._period(ctx);
    ctx.globalAlpha = a0;
  }

  /** Toasts + notices (above everything but title/game over). */
  renderTop(ctx) {
    this.toasts.forEach((t, i) => this._toast(ctx, t, i));
    this.notices.forEach((n, i) => this._notice(ctx, n, i));
  }

  // ---- pieces -------------------------------------------------------------------------------------
  _anchor(target) {
    // tile prop from the map runtime ({ x, y in tiles, def: { w, h }, type }) — or an entity (feet, world px)
    let wx, wy;
    if (target.def && target.kind !== 'entity') {
      const w = target.w ?? target.def?.w ?? 1;
      wx = (target.x + w / 2) * 16;
      let top = target.y * 16 - 6;
      try {
        const art = HW.art?.prop?.(target.type, { state: target.state, dir: target.dir, variant: target.variant });
        if (art?.canvas) top = target.y * 16 + (art.oy || 0) - 4;
      } catch { /* keep the fallback */ }
      wy = top;
    } else {
      wx = target.x; wy = target.y - 36;
    }
    if (typeof target.promptX === 'number') wx = target.promptX;
    if (typeof target.promptY === 'number') wy = target.promptY;
    return svc.worldToUI(wx, wy);
  }

  _prompt(ctx) {
    const p = this.prompt;
    const pos = this._anchor(p.target);
    if (!pos) return;
    const f = F.small;
    const verb = String(p.verb).toUpperCase();
    const key = this.ui.input.keyLabel('confirm');
    const kw = Math.max(f.lineHeight, f.width(key) + 4 * AP);
    const w = kw + f.width(verb) + 22, h = 28;
    const bob = Math.floor(this.t * 2.4) % 2 ? 0 : -AP;
    let x = snap(pos.x - w / 2), y = snap(pos.y - h - 6 + bob - (1 - ease.out(p.a)) * 8);
    x = Math.max(8, Math.min(W - w - 8, x)); y = Math.max(8, Math.min(540 - h - 8, y));
    const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * p.a;
    rect(ctx, x - AP, y - AP, w + 2 * AP, h + 2 * AP, 'rgba(0,0,0,0.55)');
    rect(ctx, x, y, w, h, 'rgba(12,13,16,0.9)');
    rect(ctx, x, y, w, AP, C.panelHi);
    keycap(ctx, x + 4, y + 4, key, f);
    f.draw(ctx, verb, x + kw + 12, y + 4, C.text);
    // little tail pointing at the target
    triangle(ctx, snap(x + w / 2 - 6), y + h, 4, 'rgba(12,13,16,0.9)', 'down');
    ctx.globalAlpha = a0;
  }

  _battery(ctx) {
    const s = svc.state();
    const v = clamp((s.battery ?? 100) / 100);
    const low = v < 0.2;
    if (low && Math.floor(this.t * 3) % 2 === 0 && v < 0.1) return;
    const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * this.battA;
    const x = 24, y = 22;
    // flashlight glyph (side view Maglite) + D-cell meter
    const col = low ? C.red : v < 0.4 ? '#c9aa47' : '#cfc6ab';
    rect(ctx, x, y + 6, 22, 10, '#1a1a1f'); rect(ctx, x + 22, y + 2, 10, 18, '#1a1a1f');
    rect(ctx, x + 2, y + 8, 18, 6, '#55545c'); rect(ctx, x + 24, y + 4, 6, 14, '#6d6c74');
    rect(ctx, x + 2, y + 8, 18, 2, '#77767e');
    if (s.flashlightOn) rect(ctx, x + 32, y + 6, 4, 10, '#fff1d6');
    // cell outline + segments
    const bx = x + 46, by = y + 4, bw = 64, bh = 14;
    rect(ctx, bx - AP, by - AP, bw + 2 * AP, bh + 2 * AP, '#0b0b0e');
    frame(ctx, bx, by, bw, bh, '#8c887c');
    rect(ctx, bx + bw + AP, by + 4, 4, 6, '#8c887c');
    const segs = 5, filled = Math.ceil(v * segs - 0.001);
    for (let i = 0; i < segs; i++) {
      const sx = bx + 4 + i * 12;
      rect(ctx, sx, by + 4, 8, bh - 8, i < filled ? col : '#2a2a30');
    }
    ctx.globalAlpha = a0;
  }

  _compact(ctx) {
    const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * this.compactA;
    const x = 152, y = 18;
    // round compact (closed): brass rim, pale glass, sparkle that twinkles
    rect(ctx, x + 4, y, 16, 24, '#7a6c48'); rect(ctx, x, y + 4, 24, 16, '#7a6c48');
    rect(ctx, x + 2, y + 2, 20, 20, '#7a6c48');
    rect(ctx, x + 4, y + 4, 16, 16, '#a9b8c4'); rect(ctx, x + 6, y + 4, 12, 2, '#d8e2ea');
    rect(ctx, x + 4, y + 2, 16, 2, '#d8cfae');
    const tw = (Math.sin(this.t * 3.1) + 1) / 2;
    const sx = x + 22, sy = y - 2, L = tw > 0.5 ? 8 : 4;
    rect(ctx, sx - AP / 2, sy - L, AP, L * 2, '#fff6dc'); rect(ctx, sx - L, sy - AP / 2, L * 2, AP, '#fff6dc');
    if (tw > 0.7) rect(ctx, sx - 2, sy - 2, 4, 4, '#ffffff');
    F.small.draw(ctx, this.ui.input.keyLabel('compact'), x + 30, y + 4, '#bfb7a0');
    ctx.globalAlpha = a0;
  }

  _period(ctx) {
    const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * this.periodA;
    const cx = W - 52, cy = 46, r = 24;
    // hall clock: cream face, black rim, cage guard; minute hand sweeps toward the dismissal bell
    const P = HW.periods;
    const len = P?.length || P?.duration || P?.total || 0;
    const left = P?.timeLeft ?? 0;
    const prog = len ? clamp(1 - left / len) : (this.periodT / 80) % 1;
    for (let j = -r; j <= r; j += AP) for (let i = -r; i <= r; i += AP) {
      const d = Math.hypot(i + 1, j + 1);
      if (d > r) continue;
      ctx.fillStyle = d > r - 4 ? '#151519' : d > r - 6 ? '#6a6860' : '#d6ccb0';
      ctx.fillRect(cx + i, cy + j, AP, AP);
    }
    for (let k = 0; k < 12; k++) {
      const an = k / 12 * Math.PI * 2;
      rect(ctx, snap(cx + Math.sin(an) * (r - 9)) - 1, snap(cy - Math.cos(an) * (r - 9)) - 1, AP, AP, '#3b3a36');
    }
    const hand = (ang, L, col) => {
      for (let s = 0; s < L; s += AP) rect(ctx, snap(cx + Math.sin(ang) * s) - 1, snap(cy - Math.cos(ang) * s) - 1, AP, AP, col);
    };
    hand(-Math.PI / 6 + prog * Math.PI / 6, r - 12, '#1a1a1e');     // hour hand creeps toward 3:15
    hand(prog * Math.PI * 2, r - 6, '#1a1a1e');
    hand(this.periodT * 2 * Math.PI / 60 * 6, r - 7, '#9a2229');   // sweeping red second hand
    // cage guard bars
    for (let i = -r + 4; i < r; i += 10) rect(ctx, cx + i, cy - r + 2, AP, (r - 2) * 2, 'rgba(30,30,34,0.45)');
    // bell: rings (wiggles) for the first seconds of a period
    const ring = this.periodT < 2.5 ? Math.sin(this.periodT * 40) : 0;
    const bx = cx - 74 + snap(ring * 3), by = cy - 16;
    rect(ctx, bx + 6, by, 4, 4, '#3b3a36');
    rect(ctx, bx + 2, by + 4, 12, 4, '#9a7d34'); rect(ctx, bx, by + 8, 16, 12, '#9a7d34');
    rect(ctx, bx + 2, by + 8, 4, 10, '#cfae55'); rect(ctx, bx - 2, by + 20, 20, 4, '#5e4a1c');
    rect(ctx, bx + 6, by + 24, 4, 4, '#3b3a36');
    if (ring) { rect(ctx, bx - 10, by + 6, 4, AP, '#cfc6ab'); rect(ctx, bx + 22, by + 6, 4, AP, '#cfc6ab'); }
    ctx.globalAlpha = a0;
  }

  _toast(ctx, t, i) {
    const f = F.small;
    const k = ease.out(clamp(t.t / 0.2)) * (1 - clamp((t.t - TOAST_LIFE + 0.4) / 0.4));
    if (k <= 0) return;
    const w = snap(f.width(t.text) + 36), h = 28;
    const x = snap(W / 2 - w / 2), y = snap(16 + i * 36 - (1 - k) * 10);
    const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * k;
    rect(ctx, x - AP, y - AP, w + 2 * AP, h + 2 * AP, 'rgba(0,0,0,0.6)');
    rect(ctx, x, y, w, h, 'rgba(14,15,19,0.92)');
    rect(ctx, x, y, AP * 2, h, C.red);
    rect(ctx, x, y, w, AP, C.panelHi);
    f.draw(ctx, t.text, x + 20, y + 4, C.text);
    ctx.globalAlpha = a0;
  }

  _notice(ctx, n, i) {
    // a torn sketchbook strip slides in from the right: "Sketchbook updated" + the objective
    const k = ease.out(clamp(n.t / 0.35)) * (1 - clamp((n.t - NOTICE_LIFE + 0.5) / 0.5));
    if (k <= 0) return;
    const fh = F.handS, fl = F.small;
    const lines = fh.wrap(n.text, 300).slice(0, 3);
    const w = 340, h = snap(48 + lines.length * fh.lineHeight);
    const x = snap(W - 18 - w + (1 - k) * 80), y = 92 + i * (h + 12);
    const paper = paperSheet(w, h, { torn: 'bottom', seed: 'notice', stains: 0, ruled: { top: 40, gap: 24 } });
    const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * k;
    dither(ctx, x + 6, y + 6, w, h, 'rgba(0,0,0,0.9)', 0.5);
    ctx.drawImage(paper, x, y);
    fl.draw(ctx, 'S K E T C H B O O K   U P D A T E D', x + 16, y + 8, '#5c5a60');
    rect(ctx, x + 16, y + 32, 120, AP, C.red);
    lines.forEach((l, j) => fh.draw(ctx, l, x + 16, y + 36 + j * fh.lineHeight, C.pencil));
    ctx.globalAlpha = a0;
  }
}
