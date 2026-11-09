// Non-physical scenery drawn in world space behind the terrain surface.

import { circle, fillStroke, line, polyPath, roundRectPath, OUTLINE, worldText } from './draw.js';

const DRAW = {
  tree(ctx, d) {
    const s = d.s;
    line(ctx, 0, -0.2, 0, 2.2 * s, OUTLINE, 0.32 * s);
    line(ctx, 0, -0.2, 0, 2.2 * s, '#6b4a2b', 0.24 * s);
    const c = d.v > 0.5 ? '#4f9a3d' : '#5aa846';
    circle(ctx, -0.6 * s, 2.3 * s, 0.85 * s, c);
    circle(ctx, 0.6 * s, 2.4 * s, 0.9 * s, c);
    circle(ctx, 0, 3.0 * s, 1.0 * s, c);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(-0.3 * s, 3.3 * s, 0.4 * s, 0, Math.PI * 2);
    ctx.fill();
  },
  bush(ctx, d) {
    const s = d.s;
    const c = d.v > 0.5 ? '#3f8a32' : '#4c9a3c';
    circle(ctx, -0.35 * s, 0.25 * s, 0.4 * s, c);
    circle(ctx, 0.35 * s, 0.25 * s, 0.42 * s, c);
    circle(ctx, 0, 0.45 * s, 0.45 * s, c);
  },
  flowers(ctx, d) {
    const cols = ['#ff6b8a', '#ffd23f', '#ffffff', '#b28dff'];
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.18;
      const h = 0.25 + ((i * 37) % 10) / 40;
      line(ctx, x, -0.05, x, h, '#3c7f27', 0.025);
      circle(ctx, x, h, 0.06, cols[(i + Math.round(d.v * 4)) % 4], OUTLINE, 0.012);
    }
  },
  rock(ctx, d) {
    const s = d.s;
    polyPath(ctx, [[-0.6 * s, -0.1], [-0.45 * s, 0.35 * s], [0.05 * s, 0.55 * s], [0.55 * s, 0.3 * s], [0.65 * s, -0.1]]);
    fillStroke(ctx, d.theme === 'canyon' ? '#a85f3a' : d.theme === 'inferno' ? '#3a2a2a' : '#8b8579');
  },
  fence(ctx, d) {
    for (let i = 0; i < 4; i++) {
      roundRectPath(ctx, i * 0.6 - 0.95, -0.2, 0.12, 1.1, 0.03);
      fillStroke(ctx, '#d9c3a0');
    }
    roundRectPath(ctx, -1.1, 0.55, 2.2, 0.1, 0.03);
    fillStroke(ctx, '#d9c3a0');
    roundRectPath(ctx, -1.1, 0.2, 2.2, 0.1, 0.03);
    fillStroke(ctx, '#d9c3a0');
  },
  cone(ctx) {
    polyPath(ctx, [[-0.25, 0], [0.25, 0], [0.06, 0.75], [-0.06, 0.75]]);
    fillStroke(ctx, '#ff6a00');
    ctx.fillStyle = '#fff';
    ctx.fillRect(-0.15, 0.3, 0.3, 0.12);
    roundRectPath(ctx, -0.32, -0.05, 0.64, 0.08, 0.02);
    fillStroke(ctx, '#ff6a00');
  },
  barrier(ctx) {
    roundRectPath(ctx, -0.9, 0.5, 1.8, 0.3, 0.04);
    fillStroke(ctx, '#ffffff');
    ctx.save();
    ctx.beginPath();
    ctx.rect(-0.9, 0.5, 1.8, 0.3);
    ctx.clip();
    ctx.fillStyle = '#e53935';
    for (let x = -1.2; x < 1; x += 0.4) {
      ctx.beginPath();
      ctx.moveTo(x, 0.5);
      ctx.lineTo(x + 0.2, 0.5);
      ctx.lineTo(x + 0.5, 0.8);
      ctx.lineTo(x + 0.3, 0.8);
      ctx.fill();
    }
    ctx.restore();
    line(ctx, -0.7, 0, -0.7, 0.5, '#555', 0.06);
    line(ctx, 0.7, 0, 0.7, 0.5, '#555', 0.06);
  },
  pipes(ctx) {
    for (let i = 0; i < 3; i++) {
      circle(ctx, -0.35 + i * 0.35, 0.18, 0.18, '#7a838d');
      circle(ctx, -0.35 + i * 0.35, 0.18, 0.1, '#3c4148');
    }
    circle(ctx, -0.17, 0.48, 0.18, '#7a838d');
    circle(ctx, -0.17, 0.48, 0.1, '#3c4148');
    circle(ctx, 0.17, 0.48, 0.18, '#7a838d');
    circle(ctx, 0.17, 0.48, 0.1, '#3c4148');
  },
  bricks(ctx) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3 - r; c++) {
        roundRectPath(ctx, -0.5 + c * 0.34 + r * 0.17, r * 0.18, 0.32, 0.17, 0.02);
        fillStroke(ctx, '#b5523a', OUTLINE, 0.02);
      }
    }
  },
  warning(ctx) {
    line(ctx, 0, 0, 0, 1.3, '#555', 0.07);
    ctx.save();
    ctx.translate(0, 1.4);
    polyPath(ctx, [[-0.32, -0.25], [0.32, -0.25], [0, 0.32]]);
    fillStroke(ctx, '#ffd000');
    worldText(ctx, '!', 0, -0.04, 0.32, '#111');
    ctx.restore();
  },
  cactus(ctx, d) {
    const s = d.s;
    const c = '#4f8a45';
    roundRectPath(ctx, -0.16 * s, -0.1, 0.32 * s, 2.0 * s, 0.16 * s);
    fillStroke(ctx, c);
    roundRectPath(ctx, -0.6 * s, 0.7 * s, 0.24 * s, 0.75 * s, 0.12 * s);
    fillStroke(ctx, c);
    roundRectPath(ctx, -0.6 * s, 0.7 * s, 0.5 * s, 0.22 * s, 0.1 * s);
    fillStroke(ctx, c);
    roundRectPath(ctx, 0.36 * s, 1.0 * s, 0.24 * s, 0.6 * s, 0.12 * s);
    fillStroke(ctx, c);
    roundRectPath(ctx, 0.1 * s, 1.0 * s, 0.5 * s, 0.2 * s, 0.1 * s);
    fillStroke(ctx, c);
  },
  skull(ctx) {
    circle(ctx, 0, 0.22, 0.2, '#efe6d2');
    roundRectPath(ctx, -0.12, -0.02, 0.24, 0.14, 0.04);
    fillStroke(ctx, '#efe6d2');
    circle(ctx, -0.07, 0.24, 0.05, '#2a2222', null);
    circle(ctx, 0.08, 0.24, 0.05, '#2a2222', null);
  },
  bones(ctx) {
    for (const a of [0.4, -0.5]) {
      ctx.save();
      ctx.rotate(a);
      roundRectPath(ctx, -0.35, 0.02, 0.7, 0.07, 0.03);
      fillStroke(ctx, '#e8dfca', OUTLINE, 0.015);
      circle(ctx, -0.36, 0.06, 0.05, '#e8dfca', OUTLINE, 0.015);
      circle(ctx, 0.36, 0.06, 0.05, '#e8dfca', OUTLINE, 0.015);
      ctx.restore();
    }
    DRAW.skull(ctx);
  },
  deadtree(ctx, d) {
    const s = d.s;
    ctx.strokeStyle = d.theme === 'inferno' ? '#140808' : '#5a4433';
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.18 * s;
    ctx.beginPath();
    ctx.moveTo(0, -0.1);
    ctx.lineTo(0.1 * s, 2.0 * s);
    ctx.moveTo(0.05 * s, 1.1 * s);
    ctx.lineTo(-0.6 * s, 1.8 * s);
    ctx.moveTo(0.08 * s, 1.5 * s);
    ctx.lineTo(0.7 * s, 2.2 * s);
    ctx.stroke();
    ctx.lineWidth = 0.08 * s;
    ctx.beginPath();
    ctx.moveTo(-0.6 * s, 1.8 * s);
    ctx.lineTo(-0.7 * s, 2.2 * s);
    ctx.moveTo(0.1 * s, 2.0 * s);
    ctx.lineTo(0.35 * s, 2.5 * s);
    ctx.stroke();
  },
  pine(ctx, d) {
    const s = d.s;
    line(ctx, 0, -0.2, 0, 0.8 * s, '#5a3a22', 0.22 * s);
    const c = d.v > 0.5 ? '#2f6b45' : '#3a7a50';
    for (let i = 0; i < 3; i++) {
      const y = (0.5 + i * 0.75) * s;
      const w = (1.1 - i * 0.28) * s;
      polyPath(ctx, [[-w, y], [w, y], [0, y + 1.3 * s]]);
      fillStroke(ctx, c);
    }
  },
  snowpine(ctx, d) {
    DRAW.pine(ctx, d);
    const s = d.s;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      const y = (0.5 + i * 0.75) * s;
      const w = (1.1 - i * 0.28) * s;
      polyPath(ctx, [[-w * 0.45, y + 0.75 * s], [w * 0.45, y + 0.75 * s], [0, y + 1.3 * s]]);
      ctx.fill();
    }
  },
  snowman(ctx) {
    circle(ctx, 0, 0.35, 0.38, '#fbfdff');
    circle(ctx, 0, 0.95, 0.27, '#fbfdff');
    circle(ctx, 0, 1.38, 0.2, '#fbfdff');
    polyPath(ctx, [[0.18, 1.38], [0.45, 1.34], [0.18, 1.32]]);
    fillStroke(ctx, '#ff8a00', OUTLINE, 0.012);
    circle(ctx, 0.08, 1.45, 0.025, '#111', null);
    roundRectPath(ctx, -0.18, 1.52, 0.36, 0.06, 0.02);
    fillStroke(ctx, '#222');
    roundRectPath(ctx, -0.12, 1.55, 0.24, 0.28, 0.02);
    fillStroke(ctx, '#222');
  },
  flag(ctx, d) {
    line(ctx, 0, 0, 0, 1.6, '#444', 0.05);
    polyPath(ctx, [[0, 1.6], [0.6, 1.45], [0, 1.3]]);
    fillStroke(ctx, d.v > 0.5 ? '#e53935' : '#1e88e5');
  },
  lamp(ctx, d, time) {
    line(ctx, 0, 0, 0, 3.4, OUTLINE, 0.14);
    line(ctx, 0, 0, 0, 3.4, '#4a515a', 0.09);
    line(ctx, 0, 3.4, 0.6, 3.45, '#4a515a', 0.08);
    roundRectPath(ctx, 0.4, 3.22, 0.45, 0.2, 0.05);
    fillStroke(ctx, '#2b2f36');
    const g = ctx.createRadialGradient(0.62, 3.2, 0, 0.62, 2.0, 3.0);
    g.addColorStop(0, 'rgba(255,220,140,0.45)');
    g.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0.45, 3.22);
    ctx.lineTo(0.8, 3.22);
    ctx.lineTo(2.2, 0);
    ctx.lineTo(-1.0, 0);
    ctx.closePath();
    ctx.fill();
  },
  barrel(ctx) {
    roundRectPath(ctx, -0.28, 0, 0.56, 0.82, 0.05);
    fillStroke(ctx, '#3d6b8c');
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-0.28, 0.25, 0.56, 0.04);
    ctx.fillRect(-0.28, 0.55, 0.56, 0.04);
  },
  crates(ctx) {
    for (const [x, y] of [[-0.4, 0], [0.4, 0], [0, 0.8]]) {
      ctx.beginPath();
      ctx.rect(x - 0.38, y, 0.76, 0.76);
      fillStroke(ctx, '#8a6a46');
      ctx.strokeStyle = '#5c4026';
      ctx.lineWidth = 0.04;
      ctx.strokeRect(x - 0.32, y + 0.06, 0.64, 0.64);
    }
  },
  stump(ctx) {
    roundRectPath(ctx, -0.35, -0.1, 0.7, 0.55, 0.06);
    fillStroke(ctx, '#7a5230');
    ctx.beginPath();
    ctx.ellipse(0, 0.45, 0.35, 0.1, 0, 0, Math.PI * 2);
    fillStroke(ctx, '#c9a06b');
  },
  log(ctx) {
    roundRectPath(ctx, -1.2, 0, 2.4, 0.42, 0.2);
    fillStroke(ctx, '#7a5230');
    ctx.beginPath();
    ctx.ellipse(1.1, 0.21, 0.12, 0.21, 0, 0, Math.PI * 2);
    fillStroke(ctx, '#c9a06b');
  },
  mushroom(ctx, d) {
    line(ctx, 0, 0, 0, 0.3, '#efe6d2', 0.1);
    ctx.beginPath();
    ctx.arc(0, 0.3, 0.22, 0, Math.PI);
    ctx.closePath();
    fillStroke(ctx, d.v > 0.5 ? '#e53935' : '#c97b2a');
    circle(ctx, -0.08, 0.4, 0.03, '#fff', null);
    circle(ctx, 0.07, 0.36, 0.03, '#fff', null);
  },
  spikepole(ctx) {
    line(ctx, 0, 0, 0, 2.2, OUTLINE, 0.12);
    line(ctx, 0, 0, 0, 2.2, '#5a3a22', 0.08);
    polyPath(ctx, [[-0.06, 2.2], [0.06, 2.2], [0, 2.55]]);
    fillStroke(ctx, '#c7cdd4');
    ctx.save();
    ctx.translate(0, 1.95);
    DRAW.skull(ctx);
    ctx.restore();
  },
  house(ctx, d) {
    const s = d.s;
    ctx.beginPath();
    ctx.rect(-1.5 * s, 0, 3 * s, 2.2 * s);
    fillStroke(ctx, '#e8d8b8');
    polyPath(ctx, [[-1.8 * s, 2.2 * s], [1.8 * s, 2.2 * s], [0, 3.6 * s]]);
    fillStroke(ctx, '#b5523a');
    ctx.beginPath();
    ctx.rect(-0.3 * s, 0, 0.6 * s, 1.2 * s);
    fillStroke(ctx, '#7a5230');
    ctx.beginPath();
    ctx.rect(0.6 * s, 1.1 * s, 0.6 * s, 0.6 * s);
    fillStroke(ctx, '#9fd3ff');
  },
};

export function drawDecor(ctx, d, time) {
  const fn = DRAW[d.type];
  if (!fn) return;
  ctx.save();
  ctx.translate(d.x, d.y);
  if (d.flip) ctx.scale(-1, 1);
  fn(ctx, d, time);
  ctx.restore();
}

export const DECOR_TYPES = Object.keys(DRAW);
