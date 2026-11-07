// FLIGHT MAP (overview / zoom / 3D) and FLIGHT INFO pages.
import { C, text, fillRR, rr, ease, clamp01, withShadow } from '../ui/kit.js';
import { icon } from '../ui/icons.js';

const VIEWS = [
  { id: 'overview', label: 'Overview', ic: 'map' },
  { id: 'zoom', label: 'Zoomed', ic: 'zoom' },
  { id: '3d', label: '3D view', ic: 'cube' },
];

function infoRows(d) {
  return [
    ['Ground speed', d.groundSpeed],
    ['Altitude', d.altitude],
    ['Outside temp.', d.outsideTemp],
    ['Heading', d.heading],
    ['Distance to dest.', d.distance],
    ['Time to dest.', d.timeToGo],
    [`Local time ${d.originCode}`, d.timeOrigin],
    [`Local time ${d.destCode}`, d.timeDest],
  ];
}

export function mapPage() {
  return {
    id: 'map',
    view: 'overview',
    panel: true,
    _vt: 0,
    onEnter(params) { if (params?.view) this.view = params.view; this._vt = this.ui.now; },
    fps(ui) { return ui.now - this._vt < 0.5 ? 30 : (this.view === '3d' ? 8 : 5); },
    draw(ui, ctx, x, y, w, h) {
      const host = ui.host, st = host.app.flight?.state, d = host.data();
      const pw = this.panel ? 330 : 0;
      const mw = w - pw;
      const fade = ease.outCubic(clamp01((ui.now - this._vt) / 0.4));
      ctx.save();
      ctx.globalAlpha *= 0.3 + 0.7 * fade;
      host.map.draw(ctx, x, y, mw, h, { view: this.view, st, units: d.units, t: ui.now });
      ctx.restore();
      // view switcher
      const bw = 156, bh = 54;
      const sx = x + (mw - VIEWS.length * bw - 8) / 2, sy = y + h - bh - 22;
      withShadow(ctx, 16, 'rgba(0,0,0,0.5)', () => fillRR(ctx, sx - 6, sy - 6, VIEWS.length * bw + 20, bh + 12, (bh + 12) / 2, 'rgba(6,18,32,0.88)'));
      VIEWS.forEach((v, i) => {
        const bx = sx + i * (bw + 4);
        const s = ui.hit(`view:${v.id}`, bx, sy, bw, bh, { onClick: () => { this.view = v.id; this._vt = ui.now; }, radius: bh / 2 });
        const on = this.view === v.id;
        if (on || s.hover) fillRR(ctx, bx, sy, bw, bh, bh / 2, on ? C.gold : 'rgba(255,255,255,0.12)');
        icon(ctx, v.ic, bx + 22, sy + 15, 24, on ? '#1a1407' : C.text);
        text(ctx, v.label, bx + 56, sy + 34, { size: 18, weight: 700, color: on ? '#1a1407' : C.text });
      });
      // panel toggle
      const tb = ui.hit('map:panel', x + mw - 64, y + h - 76, 52, 52, { onClick: () => { this.panel = !this.panel; }, radius: 26 });
      if (this.view !== 'overview' || !this.panel) { /* keep the north arrow visible */ }
      fillRR(ctx, x + mw - 64, y + h - 76, 52, 52, 26, tb.hover ? 'rgba(255,255,255,0.25)' : 'rgba(6,18,32,0.8)');
      icon(ctx, this.panel ? 'chevron' : 'info', x + mw - 52, y + h - 64, 28, C.text);
      if (!this.panel) {
        // compact ticker
        fillRR(ctx, x + 24, y + 22, 520, 56, 28, 'rgba(6,18,32,0.82)');
        text(ctx, `${d.timeToGo} to ${d.destCity}`, x + 50, y + 58, { size: 20, weight: 700 });
        text(ctx, `${d.distance}  ·  ${d.groundSpeed}`, x + 300, y + 58, { size: 18, color: C.muted, maxWidth: 230 });
        return;
      }
      // info panel
      const px = x + mw;
      const g = ctx.createLinearGradient(px, 0, px + pw, 0);
      g.addColorStop(0, 'rgba(7,22,40,0.98)'); g.addColorStop(1, 'rgba(5,15,28,0.98)');
      ctx.fillStyle = g; ctx.fillRect(px, y, pw, h);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(px, y, 1, h);
      text(ctx, d.destCity, px + 28, y + 50, { size: 28, weight: 800, maxWidth: pw - 56 });
      text(ctx, `${d.phaseLabel}`, px + 28, y + 80, { size: 17, color: C.gold, weight: 600 });
      // progress
      const by = y + 108;
      fillRR(ctx, px + 28, by, pw - 56, 6, 3, 'rgba(255,255,255,0.18)');
      fillRR(ctx, px + 28, by, (pw - 56) * d.progress, 6, 3, C.gold);
      ctx.save(); ctx.translate(px + 28 + (pw - 56) * d.progress, by + 3); ctx.rotate(Math.PI / 2); icon(ctx, 'plane', -13, -13, 26, '#fff'); ctx.restore();
      text(ctx, d.originCode, px + 28, by + 34, { size: 15, weight: 700, color: C.muted });
      text(ctx, d.destCode, px + pw - 28, by + 34, { size: 15, weight: 700, color: C.muted, align: 'right' });
      const rows = infoRows(d);
      const rh = Math.min(64, (h - 170) / rows.length);
      rows.forEach(([k, v], i) => {
        const ry = y + 166 + i * rh;
        if (i) { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(px + 28, ry - 6, pw - 56, 1); }
        text(ctx, k.toUpperCase(), px + 28, ry + 16, { size: 13, weight: 700, color: C.faint, spacing: 1.2 });
        text(ctx, v, px + 28, ry + 44, { size: 23, weight: 600 });
      });
      void rr;
    },
  };
}

export function infoPage() {
  return {
    id: 'info',
    fps: () => 2,
    draw(ui, ctx, x, y, w, h) {
      const d = ui.host.data();
      const pad = 34;
      text(ctx, 'Flight information', x + pad, y + 58, { size: 38, weight: 800 });
      text(ctx, `HN 482  ·  ${d.aircraft}  ·  ${d.originName} to ${d.destName}`, x + pad, y + 90, { size: 18, color: C.muted, maxWidth: w - 2 * pad });
      // route progress band
      const by = y + 130, bh = 130;
      fillRR(ctx, x + pad, by, w - 2 * pad, bh, 18, 'rgba(255,255,255,0.06)');
      text(ctx, d.originCode, x + pad + 30, by + 58, { size: 40, weight: 800 });
      text(ctx, d.originCity, x + pad + 30, by + 88, { size: 17, color: C.muted });
      text(ctx, d.destCode, x + w - pad - 30, by + 58, { size: 40, weight: 800, align: 'right' });
      text(ctx, d.destCity, x + w - pad - 30, by + 88, { size: 17, color: C.muted, align: 'right' });
      const lx = x + pad + 170, lw = w - 2 * pad - 340, ly = by + 48;
      ctx.setLineDash([8, 8]); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + lw, ly); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = C.gold; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + lw * d.progress, ly); ctx.stroke();
      ctx.save(); ctx.translate(lx + lw * d.progress, ly); ctx.rotate(Math.PI / 2); icon(ctx, 'plane', -22, -22, 44, '#fff'); ctx.restore();
      text(ctx, `${d.flown} flown`, lx, ly + 52, { size: 17, color: C.muted });
      text(ctx, `${d.distance} to go`, lx + lw, ly + 52, { size: 17, color: C.muted, align: 'right' });
      text(ctx, d.phaseLabel, lx + lw / 2, ly + 52, { size: 17, weight: 700, color: C.gold, align: 'center' });
      // cards
      const cards = [
        ['Time to destination', d.timeToGo, 'clock'], ['Ground speed', d.groundSpeed, 'plane'], ['Altitude', d.altitude, 'layers'], ['Outside temperature', d.outsideTemp, 'brightness'],
        [`Local time ${d.originCity}`, d.timeOrigin, 'clock'], [`Local time ${d.destCity}`, d.timeDest, 'clock'], ['Heading', d.heading, 'map'], ['Estimated arrival', d.eta, 'info'],
      ];
      const cols = 4, gap = 18;
      const cw = (w - 2 * pad - gap * (cols - 1)) / cols;
      const top = by + bh + 24;
      const ch = Math.min(150, (h - (top - y) - 30 - gap) / 2);
      cards.forEach(([k, v, ic], i) => {
        const cx = x + pad + (i % cols) * (cw + gap), cy = top + Math.floor(i / cols) * (ch + gap);
        fillRR(ctx, cx, cy, cw, ch, 16, 'rgba(255,255,255,0.06)');
        icon(ctx, ic, cx + 22, cy + 22, 24, C.gold);
        text(ctx, k.toUpperCase(), cx + 58, cy + 41, { size: 13, weight: 700, color: C.faint, spacing: 1.1, maxWidth: cw - 70 });
        text(ctx, v, cx + 22, cy + ch - 30, { size: 32, weight: 700, maxWidth: cw - 40 });
      });
    },
  };
}
