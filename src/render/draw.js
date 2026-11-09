// Shared vector-drawing helpers. All coordinates are world metres in a y-up frame.

export const OUTLINE = '#1b1712';
export const LW = 0.035;

export function capsulePath(ctx, x0, x1, r) {
  ctx.beginPath();
  ctx.moveTo(x0, -r);
  ctx.lineTo(x1, -r);
  ctx.arc(x1, 0, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x0, r);
  ctx.arc(x0, 0, r, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
}

export function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function polyPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

export function fillStroke(ctx, fill, stroke = OUTLINE, lw = LW) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

export function circle(ctx, x, y, r, fill, stroke = OUTLINE, lw = LW) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  fillStroke(ctx, fill, stroke, lw);
}

export function line(ctx, x0, y0, x1, y1, color = OUTLINE, lw = LW) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** Draw text in world space (handles the y-up flip). `size` is in metres. */
export function worldText(ctx, text, x, y, size, color = '#fff', align = 'center', font = 'Bangers, Impact, sans-serif', stroke) {
  ctx.save();
  ctx.translate(x, y);
  const k = size / 40;
  ctx.scale(k, -k);
  ctx.font = `40px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (stroke) {
    ctx.lineWidth = 6;
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, 0, 0);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** A spoked wheel; ctx in the wheel body's local frame (rotates with it). */
export function drawWheel(ctx, r, opts = {}) {
  const { tire = '#222', rim = '#c9c9c9', hub = '#888', spokes = 8, tireW = 0.22, spokeColor = '#aaa', knobby = false } = opts;
  const rimR = r * (1 - tireW);
  circle(ctx, 0, 0, r, tire);
  if (knobby) {
    ctx.fillStyle = tire;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      ctx.fillRect(r - 0.02, -0.025, 0.045, 0.05);
      ctx.restore();
    }
  }
  circle(ctx, 0, 0, rimR, opts.inner || '#3a3a3a', rim, 0.03);
  ctx.strokeStyle = spokeColor;
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * rimR, Math.sin(a) * rimR);
  }
  ctx.stroke();
  circle(ctx, 0, 0, Math.max(0.03, r * 0.13), hub, OUTLINE, 0.02);
}

export function shade(hex, amt) {
  // amt in [-1, 1]
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const n = parseInt(c, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt < 0) {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  } else {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
