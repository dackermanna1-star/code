import { fmtDuration, rgba } from './dom';

/** Win-probability-over-time chart for the results screen (canvas, DPR-aware, animated reveal). */

export interface ChartData {
  timeline: { t: number; p: number }[];
  moments: { t: number; text: string; side?: 'left' | 'right' }[];
  duration: number;
  leftColor: string;
  rightColor: string;
  leftName: string;
  rightName: string;
}

export interface ChartHandle {
  /** Returns the moment index under a CSS-pixel point, or -1. */
  hit(x: number, y: number): number;
  /** CSS-pixel position of a moment marker. */
  markerPos(i: number): { x: number; y: number } | null;
  cancel(): void;
}

const PAD = { l: 14, r: 14, t: 18, b: 24 };

function probAt(tl: { t: number; p: number }[], t: number): number {
  if (tl.length === 0) return 0.5;
  if (t <= tl[0].t) return tl[0].p;
  for (let i = 1; i < tl.length; i++) {
    if (tl[i].t >= t) {
      const a = tl[i - 1], b = tl[i];
      const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return a.p + (b.p - a.p) * k;
    }
  }
  return tl[tl.length - 1].p;
}

export function renderWinChart(canvas: HTMLCanvasElement, d: ChartData, revealMs = 1100): ChartHandle {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = Math.max(120, canvas.clientWidth || 600);
  const cssH = Math.max(80, canvas.clientHeight || 200);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  const markers: { x: number; y: number }[] = [];
  const dur = Math.max(1, d.duration || (d.timeline.length ? d.timeline[d.timeline.length - 1].t : 1));
  const tl = d.timeline.length >= 2 ? d.timeline : [{ t: 0, p: 0.5 }, { t: dur, p: d.timeline[0]?.p ?? 0.5 }];
  const x0 = PAD.l, x1 = cssW - PAD.r, y0 = PAD.t, y1 = cssH - PAD.b;
  const tx = (t: number) => x0 + (Math.min(dur, Math.max(0, t)) / dur) * (x1 - x0);
  const ty = (p: number) => y0 + (1 - Math.min(1, Math.max(0, p))) * (y1 - y0);
  const midY = ty(0.5);
  for (const m of d.moments) markers.push({ x: tx(m.t), y: ty(probAt(tl, m.t)) });

  let raf = 0;
  let cancelled = false;
  const start = performance.now();

  const draw = (k: number) => {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    // Grid.
    ctx.lineWidth = 1;
    for (const p of [0.25, 0.75]) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(x0, ty(p) + 0.5);
      ctx.lineTo(x1, ty(p) + 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(x0, midY + 0.5);
    ctx.lineTo(x1, midY + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    // Time ticks.
    const step = dur > 150 ? 60 : dur > 70 ? 30 : dur > 30 ? 15 : 5;
    ctx.fillStyle = 'rgba(220,226,255,0.5)';
    ctx.font = '600 10px Rajdhani, "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let t = 0; t <= dur + 0.01; t += step) {
      const x = tx(t);
      ctx.fillRect(x, y1 + 2, 1, 4);
      ctx.fillText(fmtDuration(t), x, y1 + 8);
    }
    // Side labels.
    ctx.textAlign = 'left';
    ctx.font = '700 10px Rajdhani, "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = rgba(d.leftColor, 0.95);
    ctx.textBaseline = 'top';
    ctx.fillText(`▲ ${d.leftName.toUpperCase()}`, x0 + 4, y0 - 14);
    ctx.fillStyle = rgba(d.rightColor, 0.95);
    ctx.textBaseline = 'bottom';
    ctx.fillText(`▼ ${d.rightName.toUpperCase()}`, x0 + 4, y1 + 0);

    // Reveal clip.
    const revealX = x0 + (x1 - x0) * k;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, revealX + 1, cssH);
    ctx.clip();

    // Smooth path.
    const pts = tl.map((q) => ({ x: tx(q.t), y: ty(q.p) }));
    const path = new Path2D();
    path.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[Math.max(0, i - 2)], p1 = pts[i - 1], p2 = pts[i], p3 = pts[Math.min(pts.length - 1, i + 1)];
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      path.bezierCurveTo(c1x, Math.min(y1, Math.max(y0, c1y)), c2x, Math.min(y1, Math.max(y0, c2y)), p2.x, p2.y);
    }
    const area = new Path2D(path);
    area.lineTo(pts[pts.length - 1].x, midY);
    area.lineTo(pts[0].x, midY);
    area.closePath();
    // Upper (left fighter ahead).
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0 - 2, x1 - x0, midY - y0 + 2);
    ctx.clip();
    const gu = ctx.createLinearGradient(0, y0, 0, midY);
    gu.addColorStop(0, rgba(d.leftColor, 0.55));
    gu.addColorStop(1, rgba(d.leftColor, 0.06));
    ctx.fillStyle = gu;
    ctx.fill(area);
    ctx.restore();
    // Lower (right fighter ahead).
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, midY, x1 - x0, y1 - midY + 2);
    ctx.clip();
    const gl = ctx.createLinearGradient(0, midY, 0, y1);
    gl.addColorStop(0, rgba(d.rightColor, 0.06));
    gl.addColorStop(1, rgba(d.rightColor, 0.55));
    ctx.fillStyle = gl;
    ctx.fill(area);
    ctx.restore();
    // Line.
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.65)';
    ctx.shadowBlur = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke(path);
    ctx.restore();
    ctx.restore();

    // Markers (appear once revealed).
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = '700 9px Rajdhani, "Segoe UI", system-ui, sans-serif';
    markers.forEach((m, i) => {
      if (m.x > revealX) return;
      const side = d.moments[i].side;
      const col = side === 'left' ? d.leftColor : side === 'right' ? d.rightColor : '#ffffff';
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#0b0d16';
      ctx.fillRect(-5, -5, 10, 10);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.strokeRect(-4, -4, 8, 8);
      ctx.restore();
      ctx.fillStyle = 'rgba(240,244,255,0.85)';
      ctx.fillText(String(i + 1), m.x, m.y - 8);
    });
    // End dot.
    if (k >= 1) {
      const last = pts[pts.length - 1];
      const g = ctx.createRadialGradient(last.x, last.y, 0, last.x, last.y, 9);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(last.x, last.y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const frame = () => {
    if (cancelled) return;
    const k = Math.min(1, (performance.now() - start) / Math.max(1, revealMs));
    const e = 1 - Math.pow(1 - k, 3);
    draw(e);
    if (k < 1) raf = requestAnimationFrame(frame);
  };
  if (revealMs <= 0) draw(1);
  else frame();

  return {
    hit(x: number, y: number) {
      let best = -1, bd = 14 * 14;
      markers.forEach((m, i) => {
        const dd = (m.x - x) ** 2 + (m.y - y) ** 2;
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      });
      return best;
    },
    markerPos(i: number) {
      return markers[i] ?? null;
    },
    cancel() {
      cancelled = true;
      cancelAnimationFrame(raf);
    },
  };
}
