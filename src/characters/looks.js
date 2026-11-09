// Face & costume drawing primitives. Head drawing coordinates: X = forward (facing
// direction), Y = up, origin at the head centre, R = head radius.

import { circle, fillStroke, OUTLINE, LW, shade, roundRectPath } from '../render/draw.js';

export function headBase(ctx, R, skin) {
  // ear
  circle(ctx, -R * 0.12, -R * 0.02, R * 0.24, shade(skin, -0.08));
  circle(ctx, 0, 0, R, skin);
  circle(ctx, -R * 0.1, -R * 0.02, R * 0.16, shade(skin, -0.12), shade(skin, -0.3), 0.012);
}

export function nose(ctx, R, skin, size = 1) {
  ctx.beginPath();
  ctx.ellipse(R * 0.92, -R * 0.02, R * 0.2 * size, R * 0.17 * size, -0.3, 0, Math.PI * 2);
  fillStroke(ctx, skin);
}

export function eye(ctx, R, expr, opts = {}) {
  const ex = opts.x ?? R * 0.5;
  const ey = opts.y ?? R * 0.22;
  const s = opts.size ?? 1;
  ctx.lineCap = 'round';
  if (expr === 'dead') {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.022;
    const d = R * 0.15 * s;
    ctx.beginPath();
    ctx.moveTo(ex - d, ey - d);
    ctx.lineTo(ex + d, ey + d);
    ctx.moveTo(ex - d, ey + d);
    ctx.lineTo(ex + d, ey - d);
    ctx.stroke();
    return;
  }
  if (expr === 'pain') {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.02;
    const d = R * 0.16 * s;
    ctx.beginPath();
    ctx.moveTo(ex - d, ey + d * 0.8);
    ctx.lineTo(ex + d * 0.7, ey);
    ctx.lineTo(ex - d, ey - d * 0.8);
    ctx.stroke();
    return;
  }
  const big = expr === 'scream' ? 1.25 : 1;
  ctx.beginPath();
  ctx.ellipse(ex, ey, R * 0.2 * s * big, R * 0.25 * s * big, 0, 0, Math.PI * 2);
  fillStroke(ctx, opts.white || '#fff', OUTLINE, 0.018);
  const pr = expr === 'scream' ? 0.06 : 0.1;
  circle(ctx, ex + R * 0.07 * s, ey, R * pr * s, opts.iris || '#1d1d1d', null);
  if (expr === 'grit') {
    ctx.fillStyle = opts.lid || '#d9a77f';
    ctx.fillRect(ex - R * 0.25, ey + R * 0.02, R * 0.5, R * 0.3);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.018;
    ctx.beginPath();
    ctx.moveTo(ex - R * 0.22, ey + R * 0.04);
    ctx.lineTo(ex + R * 0.22, ey + R * 0.02);
    ctx.stroke();
  }
}

export function brow(ctx, R, expr, color = '#3a2a1a', opts = {}) {
  const ex = opts.x ?? R * 0.5;
  const ey = (opts.y ?? R * 0.22) + R * 0.36;
  ctx.strokeStyle = color;
  ctx.lineWidth = opts.w ?? 0.028;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (expr === 'pain' || expr === 'grit') {
    ctx.moveTo(ex - R * 0.22, ey + R * 0.02);
    ctx.lineTo(ex + R * 0.2, ey - R * 0.12);
  } else if (expr === 'scream') {
    ctx.moveTo(ex - R * 0.22, ey + R * 0.02);
    ctx.lineTo(ex + R * 0.2, ey + R * 0.1);
  } else if (expr === 'dead') {
    ctx.moveTo(ex - R * 0.2, ey - R * 0.05);
    ctx.lineTo(ex + R * 0.2, ey - R * 0.05);
  } else {
    ctx.moveTo(ex - R * 0.22, ey);
    ctx.quadraticCurveTo(ex, ey + R * 0.08, ex + R * 0.22, ey - R * 0.02);
  }
  ctx.stroke();
}

export function mouth(ctx, R, expr, opts = {}) {
  const mx = opts.x ?? R * 0.58;
  const my = opts.y ?? -R * 0.45;
  ctx.lineCap = 'round';
  if (expr === 'scream') {
    ctx.beginPath();
    ctx.ellipse(mx, my - R * 0.05, R * 0.17, R * 0.26, 0.15, 0, Math.PI * 2);
    fillStroke(ctx, '#3a0d0d', OUTLINE, 0.018);
    ctx.beginPath();
    ctx.ellipse(mx, my - R * 0.22, R * 0.1, R * 0.07, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#d9576a';
    ctx.fill();
    return;
  }
  if (expr === 'pain' || expr === 'grit') {
    roundRectPath(ctx, mx - R * 0.22, my - R * 0.1, R * 0.4, R * 0.18, R * 0.05);
    fillStroke(ctx, '#fff', OUTLINE, 0.016);
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 0.01;
    ctx.beginPath();
    ctx.moveTo(mx - R * 0.22, my - R * 0.01);
    ctx.lineTo(mx + R * 0.18, my - R * 0.01);
    ctx.stroke();
    return;
  }
  if (expr === 'dead') {
    ctx.beginPath();
    ctx.ellipse(mx, my, R * 0.15, R * 0.1, 0, 0, Math.PI * 2);
    fillStroke(ctx, '#3a0d0d', OUTLINE, 0.016);
    ctx.beginPath();
    ctx.ellipse(mx + R * 0.05, my - R * 0.12, R * 0.08, R * 0.12, -0.3, 0, Math.PI * 2);
    fillStroke(ctx, '#d9576a', OUTLINE, 0.012);
    return;
  }
  ctx.strokeStyle = opts.color || OUTLINE;
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  ctx.moveTo(mx - R * 0.2, my + R * 0.02);
  ctx.quadraticCurveTo(mx, my - R * 0.1, mx + R * 0.18, my + R * 0.06);
  ctx.stroke();
}

export function cheek(ctx, R, color = 'rgba(230,90,90,0.35)') {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(R * 0.42, -R * 0.2, R * 0.16, R * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Standard chest details: collar & buttons. ctx: X = forward, Y = up. */
export function buttons(ctx, w, h, color = '#fff') {
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(w * 0.32, -h * 0.25 + i * h * 0.17, 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
}

export { circle, fillStroke, OUTLINE, LW, shade, roundRectPath };
