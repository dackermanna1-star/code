// Stick figures, held weapons, props and projectiles. Positions are
// interpolated between the last two simulation steps for smooth slow motion.

import { mix } from './palettes.js';
import { HEAD, NECK, PELVIS, ELB_A, HAND_A, ELB_B, HAND_B, KNEE_A, FOOT_A, KNEE_B, FOOT_B, NJ } from '../fighter/skeleton.js';

const J = new Float64Array(NJ * 2);
const TAU = Math.PI * 2;

export function interpJoints(f, alpha, out = J) {
  const p = f.rag.p;
  for (let i = 0; i < NJ; i++) {
    const q = p[i];
    out[i * 2] = q.ox + (q.x - q.ox) * alpha;
    out[i * 2 + 1] = q.oy + (q.y - q.oy) * alpha;
  }
  return out;
}

export function drawShadow(ctx, f, alpha, P) {
  if (f.ragdolled || !f.grounded || f.removed) return;
  const s = f.scale;
  const x = f.rag.p[PELVIS].ox + (f.rag.p[PELVIS].x - f.rag.p[PELVIS].ox) * alpha;
  ctx.fillStyle = P.shadow;
  ctx.beginPath();
  ctx.ellipse(x, f.y + 1, 22 * s, 4.5 * s, 0, 0, TAU);
  ctx.fill();
}

// opts: { t, light (0..1), rim, trails }
export function drawFighter(ctx, f, alpha, opts) {
  const j = interpJoints(f, alpha);
  const d = f.dims;
  const lw = d.lw;
  let col = f.color;
  let far = f.colorFar;
  if (opts.light !== undefined && opts.light < 1) {
    const k = (1 - opts.light) * 0.5;
    col = mix(col, '#0b0d16', k);
    far = mix(far, '#0b0d16', k);
  }
  if (f.flash > 0) {
    col = mix(col, '#ffffff', Math.min(1, f.flash) * 0.75);
    far = mix(far, '#ffffff', Math.min(1, f.flash) * 0.7);
  }
  if (opts.solid) {
    col = opts.solid;
    far = opts.solid;
  }
  const zap = f.state === 'zap' && f.zapT > 0 && !opts.solid;
  if (zap && Math.sin(opts.t * 70 + f.id) > 0) {
    col = '#fff6b0';
    far = '#f0e290';
  }
  const fade = f.fading ? Math.max(0, Math.min(1, f.fading)) : 1;
  if (fade < 1) ctx.globalAlpha = fade;

  if (opts.trails && f.trail.length >= 4) drawTrail(ctx, f, col);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (opts.rim) {
    ctx.strokeStyle = opts.rim;
    ctx.lineWidth = lw + 3.5;
    strokeBody(ctx, j, true);
    ctx.fillStyle = opts.rim;
    ctx.beginPath();
    ctx.arc(j[HEAD * 2], j[HEAD * 2 + 1], d.headR + 1.75, 0, TAU);
    ctx.fill();
  }
  // far limbs
  ctx.strokeStyle = far;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(j[PELVIS * 2], j[PELVIS * 2 + 1]);
  ctx.lineTo(j[KNEE_B * 2], j[KNEE_B * 2 + 1]);
  ctx.lineTo(j[FOOT_B * 2], j[FOOT_B * 2 + 1]);
  ctx.moveTo(j[NECK * 2], j[NECK * 2 + 1]);
  ctx.lineTo(j[ELB_B * 2], j[ELB_B * 2 + 1]);
  ctx.lineTo(j[HAND_B * 2], j[HAND_B * 2 + 1]);
  ctx.stroke();
  if (f.gore && opts.gore) drawWounds(ctx, f, j, col, false);
  // torso with a slight spine curve, then the neck into the head
  const px = j[PELVIS * 2];
  const py = j[PELVIS * 2 + 1];
  const nx = j[NECK * 2];
  const ny = j[NECK * 2 + 1];
  const hx = j[HEAD * 2];
  const hy = j[HEAD * 2 + 1];
  const mx = (px + nx) * 0.5;
  const my = (py + ny) * 0.5;
  const tx = nx - px;
  const ty = ny - py;
  const bend = 0.06 * (f.ragdolled ? 0 : 1);
  const cx = mx - ty * bend * f.facing;
  const cy = my + tx * bend * f.facing;
  ctx.strokeStyle = col;
  ctx.lineWidth = lw * 1.1;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.quadraticCurveTo(cx, cy, nx, ny);
  ctx.lineTo(nx + (hx - nx) * 0.35, ny + (hy - ny) * 0.35);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(hx, hy, d.headR, 0, TAU);
  ctx.fill();
  // near limbs
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(j[KNEE_A * 2], j[KNEE_A * 2 + 1]);
  ctx.lineTo(j[FOOT_A * 2], j[FOOT_A * 2 + 1]);
  ctx.moveTo(nx, ny);
  ctx.lineTo(j[ELB_A * 2], j[ELB_A * 2 + 1]);
  ctx.lineTo(j[HAND_A * 2], j[HAND_A * 2 + 1]);
  ctx.stroke();
  if (f.gore && opts.gore) drawWounds(ctx, f, j, col, true);
  if (f.weapon) drawHeldWeapon(ctx, f, j);
  if (zap) drawSkeletonGlow(ctx, j, d, opts.t);
  if (fade < 1) ctx.globalAlpha = 1;
}

// Bruises (dark blotches on coloured limbs), cuts and blood. The near pass
// covers head, torso and near limbs; the far pass the limbs behind the body.
// Positions along each bone are fixed per fighter so marks do not crawl.
const BONES_NEAR = [
  [2, NECK, ELB_A, HAND_A],
  [4, PELVIS, KNEE_A, FOOT_A],
];
const BONES_FAR = [
  [3, NECK, ELB_B, HAND_B],
  [5, PELVIS, KNEE_B, FOOT_B],
];

function drawWounds(ctx, f, j, col, near) {
  const g = f.gore;
  const w = g.w;
  const d = f.dims;
  const lw = d.lw;
  const hero = f.isHero;
  const bruiseCol = hero ? null : mix(col, '#260818', 0.62);
  const bones = near ? BONES_NEAR : BONES_FAR;
  for (const [slot, a, b, c] of bones) {
    const lvl = w[slot];
    if (lvl < 0.1) continue;
    const marks = lvl > 0.8 ? 3 : lvl > 0.4 ? 2 : 1;
    for (let k = 0; k < marks; k++) {
      const u = 0.15 + (((f.id * 37 + slot * 11 + k * 29) % 100) / 100) * 1.7;
      const [s0, s1] = u < 1 ? [a, b] : [b, c];
      const t = u < 1 ? u : u - 1;
      const x0 = j[s0 * 2];
      const y0 = j[s0 * 2 + 1];
      const x1 = j[s1 * 2];
      const y1 = j[s1 * 2 + 1];
      const px = x0 + (x1 - x0) * t;
      const py = y0 + (y1 - y0) * t;
      const dx = (x1 - x0) * 0.12;
      const dy = (y1 - y0) * 0.12;
      if (bruiseCol) {
        ctx.strokeStyle = bruiseCol;
        ctx.globalAlpha = Math.min(0.9, lvl * 1.1);
        ctx.lineWidth = lw * 0.72;
        ctx.beginPath();
        ctx.moveTo(px - dx, py - dy);
        ctx.lineTo(px + dx, py + dy);
        ctx.stroke();
      }
      if (lvl > 0.35 || hero) {
        // a cut across the limb
        const l = Math.hypot(dx, dy) || 1;
        const nx = (-dy / l) * lw * 0.45;
        const ny = (dx / l) * lw * 0.45;
        ctx.strokeStyle = '#c4141f';
        ctx.globalAlpha = Math.min(1, 0.4 + lvl * 0.6);
        ctx.lineWidth = Math.max(1.2, lw * 0.22);
        ctx.beginPath();
        ctx.moveTo(px - nx + dx * 0.4, py - ny + dy * 0.4);
        ctx.lineTo(px + nx - dx * 0.4, py + ny - dy * 0.4);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
  if (!near) return;
  const hx = j[HEAD * 2];
  const hy = j[HEAD * 2 + 1];
  const nx = j[NECK * 2];
  const ny = j[NECK * 2 + 1];
  const r = d.headR;
  const fc = f.ragdolled ? 1 : f.facing;
  // torso: bruising, and blood running down the chest
  const tw = w[1];
  if (tw > 0.12) {
    const px = j[PELVIS * 2];
    const py = j[PELVIS * 2 + 1];
    if (bruiseCol) {
      ctx.strokeStyle = bruiseCol;
      ctx.globalAlpha = Math.min(0.85, tw);
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      ctx.moveTo(nx + (px - nx) * 0.3, ny + (py - ny) * 0.3);
      ctx.lineTo(nx + (px - nx) * (0.45 + Math.min(0.3, tw * 0.25)), ny + (py - ny) * (0.45 + Math.min(0.3, tw * 0.25)));
      ctx.stroke();
    }
  }
  const hw = w[0];
  if (g.bleed > 0.35 || hw > 0.5) {
    const px = j[PELVIS * 2];
    const py = j[PELVIS * 2 + 1];
    const run = Math.min(0.75, (g.bleed + hw) * 0.3);
    ctx.strokeStyle = '#b5121c';
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = Math.max(1.5, lw * 0.32);
    ctx.beginPath();
    ctx.moveTo(nx + fc * lw * 0.2, ny);
    ctx.lineTo(nx + (px - nx) * run + fc * lw * 0.2, ny + (py - ny) * run);
    ctx.stroke();
  }
  // head: a swollen eye, then a cut with blood trickling down the face
  if (hw > 0.12) {
    if (bruiseCol) {
      ctx.fillStyle = bruiseCol;
      ctx.globalAlpha = Math.min(0.9, hw * 1.1);
      ctx.beginPath();
      ctx.arc(hx + fc * r * 0.42, hy - r * 0.05, r * (0.3 + Math.min(0.2, hw * 0.15)), 0, TAU);
      ctx.fill();
    }
    if (hw > 0.3 || hero) {
      ctx.globalAlpha = Math.min(1, 0.45 + hw * 0.55);
      ctx.strokeStyle = '#c4141f';
      ctx.lineWidth = Math.max(1.6, r * 0.22);
      const sx = hx + fc * r * 0.55;
      const sy = hy - r * 0.45;
      const len = r * (0.8 + Math.min(1.4, hw * 1.2));
      // trickle follows gravity in screen space
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + fc * r * 0.12, sy + len);
      ctx.stroke();
      if (hw > 0.7) {
        ctx.beginPath();
        ctx.moveTo(hx - fc * r * 0.1, hy - r * 0.7);
        ctx.lineTo(hx - fc * r * 0.05, hy + r * 0.2);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}

function strokeBody(ctx, j) {
  ctx.beginPath();
  ctx.moveTo(j[PELVIS * 2], j[PELVIS * 2 + 1]);
  ctx.lineTo(j[KNEE_B * 2], j[KNEE_B * 2 + 1]);
  ctx.lineTo(j[FOOT_B * 2], j[FOOT_B * 2 + 1]);
  ctx.moveTo(j[PELVIS * 2], j[PELVIS * 2 + 1]);
  ctx.lineTo(j[KNEE_A * 2], j[KNEE_A * 2 + 1]);
  ctx.lineTo(j[FOOT_A * 2], j[FOOT_A * 2 + 1]);
  ctx.moveTo(j[PELVIS * 2], j[PELVIS * 2 + 1]);
  ctx.lineTo(j[NECK * 2], j[NECK * 2 + 1]);
  ctx.moveTo(j[HAND_B * 2], j[HAND_B * 2 + 1]);
  ctx.lineTo(j[ELB_B * 2], j[ELB_B * 2 + 1]);
  ctx.lineTo(j[NECK * 2], j[NECK * 2 + 1]);
  ctx.lineTo(j[ELB_A * 2], j[ELB_A * 2 + 1]);
  ctx.lineTo(j[HAND_A * 2], j[HAND_A * 2 + 1]);
  ctx.stroke();
}

function drawSkeletonGlow(ctx, j, d, t) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(190,230,255,0.85)';
  ctx.lineWidth = d.lw * 0.35;
  strokeBody(ctx, j);
  ctx.strokeStyle = 'rgba(160,210,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const a = t * 40 + k * 2.1;
    ctx.moveTo(j[HEAD * 2], j[HEAD * 2 + 1]);
    ctx.lineTo(j[HEAD * 2] + Math.cos(a) * 18, j[HEAD * 2 + 1] + Math.sin(a) * 18);
  }
  ctx.stroke();
  ctx.restore();
}

function drawTrail(ctx, f, col) {
  const tr = f.trail;
  const n = tr.length / 2;
  ctx.lineCap = 'round';
  for (let i = 1; i < n; i++) {
    const a = i / n;
    ctx.globalAlpha = a * a * 0.38;
    ctx.strokeStyle = col;
    ctx.lineWidth = f.dims.lw * (0.25 + a * 0.9);
    ctx.beginPath();
    ctx.moveTo(tr[(i - 1) * 2], tr[(i - 1) * 2 + 1]);
    ctx.lineTo(tr[i * 2], tr[i * 2 + 1]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const WEAPON_STYLE = {
  pipe: { color: '#8f959c', edge: '#41464c', w: 4.5 },
  bat: { color: '#b98a52', edge: '#5a3c1c', w: 4 },
  crowbar: { color: '#b8322a', edge: '#4a1410', w: 3.5 },
  plank: { color: '#cfa66c', edge: '#6a4a24', w: 6 },
};

function drawHeldWeapon(ctx, f, j) {
  const w = f.weapon;
  const hx = j[HAND_A * 2];
  const hy = j[HAND_A * 2 + 1];
  let dx = hx - j[ELB_A * 2];
  let dy = hy - j[ELB_A * 2 + 1];
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= l;
  dy /= l;
  const a = -0.35 * f.facing;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const rx = dx * c - dy * s;
  const ry = dx * s + dy * c;
  const len = w.len * f.scale;
  drawStickShape(ctx, w.kind, hx - rx * 6, hy - ry * 6, hx + rx * len, hy + ry * len);
}

export function drawStickShape(ctx, kind, x0, y0, x1, y1) {
  const st = WEAPON_STYLE[kind] || WEAPON_STYLE.plank;
  ctx.lineCap = kind === 'plank' ? 'butt' : 'round';
  ctx.strokeStyle = st.edge;
  ctx.lineWidth = st.w + 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = st.color;
  ctx.lineWidth = st.w;
  ctx.stroke();
  if (kind === 'bat') {
    // thicker barrel end
    const mx = x0 + (x1 - x0) * 0.55;
    const my = y0 + (y1 - y0) * 0.55;
    ctx.strokeStyle = st.edge;
    ctx.lineWidth = st.w + 5;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = st.color;
    ctx.lineWidth = st.w + 3;
    ctx.stroke();
  } else if (kind === 'crowbar') {
    const ux = (x1 - x0) * 0.12;
    const uy = (y1 - y0) * 0.12;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(x1 + ux - uy * 0.9, y1 + uy + ux * 0.9, x1 - uy * 1.3, y1 + ux * 1.3);
    ctx.stroke();
  }
  ctx.lineCap = 'round';
}

// ----------------------------------------------------------------- props
function boxGeom(b, alpha) {
  const p = b.p;
  let cx = 0;
  let cy = 0;
  for (const q of p) {
    cx += q.ox + (q.x - q.ox) * alpha;
    cy += q.oy + (q.y - q.oy) * alpha;
  }
  cx /= 4;
  cy /= 4;
  const ax = p[1].ox + (p[1].x - p[1].ox) * alpha - (p[0].ox + (p[0].x - p[0].ox) * alpha);
  const ay = p[1].oy + (p[1].y - p[1].oy) * alpha - (p[0].oy + (p[0].y - p[0].oy) * alpha);
  return [cx, cy, Math.atan2(ay, ax)];
}

export function drawBox(ctx, b, alpha, t, P) {
  const [cx, cy, ang] = boxGeom(b, alpha);
  const w = b.w;
  const h = b.h;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.lineJoin = 'round';
  if (b.kind === 'crate') {
    ctx.fillStyle = '#c8955a';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = '#7a5226';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 1; k < 3; k++) {
      ctx.moveTo(-w / 2, -h / 2 + (h * k) / 3);
      ctx.lineTo(w / 2, -h / 2 + (h * k) / 3);
    }
    ctx.stroke();
    ctx.strokeStyle = '#8c5f2e';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 4, -h / 2 + 4);
    ctx.lineTo(w / 2 - 4, h / 2 - 4);
    ctx.stroke();
    ctx.strokeStyle = P.outline;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8);
  } else if (b.kind === 'box') {
    ctx.fillStyle = '#c9a87a';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = '#e2cfa8';
    ctx.fillRect(-4, -h / 2, 8, h);
    ctx.strokeStyle = P.outline;
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
  } else if (b.kind === 'barrel') {
    ctx.fillStyle = '#3f6e8c';
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 3, -h / 2);
    ctx.lineTo(w / 2 - 3, -h / 2);
    ctx.quadraticCurveTo(w / 2 + 3, 0, w / 2 - 3, h / 2);
    ctx.lineTo(-w / 2 + 3, h / 2);
    ctx.quadraticCurveTo(-w / 2 - 3, 0, -w / 2 + 3, -h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = P.outline;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = '#2c5068';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 6);
    ctx.lineTo(w / 2, -h / 6);
    ctx.moveTo(-w / 2, h / 6);
    ctx.lineTo(w / 2, h / 6);
    ctx.stroke();
  } else if (b.kind === 'grenade') {
    // olive body, segmented, spoon lever on top, a blinking light that
    // speeds up as the fuse burns down
    ctx.fillStyle = '#4f5a2c';
    ctx.beginPath();
    ctx.ellipse(0, 1.5, w / 2, h / 2 - 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2b3216';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 1, 1.5);
    ctx.lineTo(w / 2 - 1, 1.5);
    ctx.moveTo(0, -h / 2 + 2);
    ctx.lineTo(0, h / 2);
    ctx.stroke();
    ctx.strokeStyle = P.outline;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 1.5, w / 2, h / 2 - 1, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#7d7f80';
    ctx.fillRect(-2.5, -h / 2 - 2.5, 5, 3.5);
    ctx.strokeStyle = '#9a9c9e';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(2.5, -h / 2 - 1);
    ctx.quadraticCurveTo(w / 2 + 3, -h / 2 + 1, w / 2, 2);
    ctx.stroke();
    const rate = b.fuse < 0.6 ? 26 : b.fuse < 1.2 ? 14 : 7;
    if (b.fuse >= 0 && Math.sin(t * rate) > 0) {
      ctx.fillStyle = '#ff3b2f';
      ctx.beginPath();
      ctx.arc(0, -1.5, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,80,60,0.35)';
      ctx.beginPath();
      ctx.arc(0, -1.5, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (b.kind === 'canister') {
    const hot = b.fuse >= 0 && Math.sin(t * 30) > 0;
    ctx.fillStyle = hot ? '#ffffff' : '#d8362a';
    ctx.beginPath();
    ctx.moveTo(-w / 2, h / 2);
    ctx.lineTo(-w / 2, -h / 2 + 8);
    ctx.quadraticCurveTo(0, -h / 2 - 4, w / 2, -h / 2 + 8);
    ctx.lineTo(w / 2, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = P.outline;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.fillRect(-4, -h / 2 - 7, 8, 7);
    ctx.fillStyle = '#f2c230';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-8, 8);
    ctx.lineTo(8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(-1.2, -2, 2.4, 6);
  }
  ctx.restore();
}

export function drawStick(ctx, s, alpha) {
  const a = s.p[0];
  const b = s.p[1];
  const x0 = a.ox + (a.x - a.ox) * alpha;
  const y0 = a.oy + (a.y - a.oy) * alpha;
  const x1 = b.ox + (b.x - b.ox) * alpha;
  const y1 = b.oy + (b.y - b.oy) * alpha;
  if (s.debris) ctx.globalAlpha = Math.min(1, s.life);
  drawStickShape(ctx, s.weapon ? s.weapon.kind : 'plank', x0, y0, x1, y1);
  ctx.globalAlpha = 1;
}

export function drawProjectile(ctx, pr, alpha) {
  const q = pr.p;
  const x = q.ox + (q.x - q.ox) * alpha;
  const y = q.oy + (q.y - q.oy) * alpha;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(pr.spin);
  if (pr.kind === 'bottle') {
    ctx.fillStyle = 'rgba(70,140,80,0.9)';
    ctx.fillRect(-3, -8, 6, 12);
    ctx.fillRect(-1.5, -12, 3, 5);
  } else {
    ctx.fillStyle = '#a24a35';
    ctx.fillRect(-7, -4, 14, 8);
    ctx.strokeStyle = '#5a2418';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-7, -4, 14, 8);
  }
  ctx.restore();
}
