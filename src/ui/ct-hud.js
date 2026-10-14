// Chinatown's HUD (tools/ct/SPEC.md section 10), drawn over every HUD style
// (classic, fullscreen, minimal) from what the map script reports
// (CtLevel.hud()): the objective line top left, a progress bar for
// hold-use actions (welding, cranking), the rescue / extraction countdown
// top right, short centred messages, carried key items (CTIGAS, CTIPLG,
// CTITOR, or their names when the WAD lacks the icons), the ladder fade
// and the mission-failed notice. The automap marker is in automap.js.

import { drawText, keyName } from './menu-util.js';

const TICRATE = 35;
const ITEM_NAMES = ['GAS', 'PLUG', 'TORCH'];
const ICONS = ['CTIGAS', 'CTIPLG', 'CTITOR'];
const GOLD = 2;
const GRAY = 1;

export class CtHud {
  constructor(hud) {
    this.hud = hud;
    this.app = hud.app;
    this.colors = null;
  }

  // The map script's HUD state, or null off Chinatown's maps.
  info() {
    const g = this.app.game;
    const w = g && g.world;
    return w && w.ct ? w.ct.hud() : null;
  }

  color(name) {
    if (!this.colors) {
      const res = this.app.res;
      const n = (r, g, b) => (res.nearest ? res.nearest(r, g, b) : 0);
      this.colors = { frame: n(24, 24, 24), back: n(60, 52, 40), fill: n(240, 190, 40), full: n(80, 220, 60), red: n(200, 30, 20) };
    }
    return this.colors[name];
  }

  // Everything but the key items (those go where each HUD style keeps keys).
  draw(r, p, rect, mode, info) {
    const hud = this.hud;
    const font = hud.font;
    const { left, right } = hud.edges(r);
    const viewBottom = rect.h / r.vScaleY;
    if (info.fade >= 0) {
      // Ladder top out of reach: the view fades out before coming up there.
      r.shadeRect(rect.x, rect.y, rect.w, rect.h, Math.min(31, Math.round(info.fade * 3)));
    }
    // Countdown top right: on the objective's line when both fit, else
    // under it (or under the automap's stats).
    let countdown = null;
    if (info.countdown) {
      const secs = Math.ceil(info.countdown.tics / TICRATE);
      const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      const label = `${info.countdown.label} `;
      countdown = { time, label, warn: secs <= 10 && (hud.clock & 16), width: font.width(label) + font.width(time) };
    }
    // Objective line, shrunk to fit narrow screens.
    const avail = right - left - 8;
    let oneLine = true;
    if (info.objective) {
      const label = 'OBJECTIVE: ';
      const text = info.objective;
      const full = font.width(label) + font.width(text);
      if (countdown && full + countdown.width + 12 > avail) oneLine = false;
      const scale = Math.max(0.6, Math.min(1, avail / full));
      const x = left + 3;
      const lw = drawText(r, font, label, x, 2, { trans: GOLD, scale });
      drawText(r, font, text, x + lw, 2, { scale });
    }
    if (countdown) {
      const am = this.app.automap && this.app.automap.active;
      const y = am ? 42 : oneLine ? 2 : 12;
      const w = drawText(r, font, countdown.time, right - 3, y, { align: 'right', trans: countdown.warn ? 8 : 0 });
      drawText(r, font, countdown.label, right - 3 - w, y, { align: 'right', trans: GOLD });
    }
    // Hold-use progress, under the crosshair.
    if (info.progress) {
      const frac = Math.max(0, Math.min(1, info.progress.frac));
      const bw = 100, bh = 5;
      const vx = 160 - bw / 2, vy = Math.round(viewBottom * 0.62);
      const sx = r.vScaleX, sy = r.vScaleY;
      const bx = r.vLeft + vx * sx, by = vy * sy;
      r.fillRect(bx - sx, by - sy, (bw + 2) * sx, (bh + 2) * sy, this.color('frame'));
      r.fillRect(bx, by, bw * sx, bh * sy, this.color('back'));
      if (frac > 0) r.fillRect(bx, by, Math.max(1, bw * frac * sx), bh * sy, this.color(frac >= 1 ? 'full' : 'fill'));
      drawText(r, font, `${info.progress.label} ${Math.floor(frac * 100)}%`, 160, vy - 10, { align: 'center', trans: GOLD });
    }
    // Centred message (objective changes, "the generator is out of fuel").
    if (info.center) {
      const a = Math.min(1, info.center.tics / 12, (info.center.total - info.center.tics + 1) / 4);
      drawText(r, font, info.center.text, 160, Math.round(viewBottom * 0.22), { align: 'center', trans: GOLD, alpha: a });
    }
    // Rescue missed.
    if (info.failed && p.playerstate === 'live') {
      drawText(r, font, 'MISSION FAILED', 160, Math.round(viewBottom * 0.4), { align: 'center', scale: 2 });
      const keys = this.app.settings.get('binds').use || [];
      const name = keys.length ? keyName(keys[0]).toLowerCase() : 'use';
      const alpha = 0.65 + 0.35 * Math.sin(hud.clock * 0.12);
      const y = Math.round(viewBottom - (mode === 'classic' ? 14 : 34));
      drawText(r, font, `press ${name} to restart`, 160, y, { align: 'center', trans: GRAY, alpha });
    }
  }

  // Classic status bar: carried items in the key boxes (Chinatown has no
  // keycards), one per slot.
  drawItemsClassic(r, info) {
    const font = this.hud.font;
    let slot = 0;
    info.items.forEach((have, i) => {
      if (!have) return;
      const y = 171 + slot * 10;
      const pt = this.hud.patch(ICONS[i]);
      if (pt) {
        const scale = Math.min(12 / pt.width, 9 / pt.height, 1);
        r.drawPatch(pt, 243 - (pt.width * scale) / 2, y + 4 - (pt.height * scale) / 2, { noOffset: true, scale });
      } else {
        drawText(r, font, ITEM_NAMES[i][0], 243, y, { align: 'center', trans: GOLD });
      }
      slot++;
    });
  }

  // Fullscreen / minimal: a right-aligned row ending at rightX with its
  // bottom at bottomY; returns the height used (0 when nothing is carried).
  drawItemsRow(r, info, rightX, bottomY) {
    const font = this.hud.font;
    let x = rightX;
    let used = 0;
    for (let i = info.items.length - 1; i >= 0; i--) {
      if (!info.items[i]) continue;
      const pt = this.hud.patch(ICONS[i]);
      if (pt) {
        const w = this.hud.drawIcon(r, ICONS[i], x, bottomY, 16);
        x -= w + 3;
        used = Math.max(used, Math.min(16, pt.height));
      } else {
        const w = drawText(r, font, ITEM_NAMES[i], x, bottomY - 8, { align: 'right', trans: GOLD });
        x -= w + 5;
        used = Math.max(used, 8);
      }
    }
    return used;
  }
}
