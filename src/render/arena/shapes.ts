/**
 * Procedural silhouette builders (Path2D) used by the parallax scenery:
 * mountain ranges, columns, arches, towers, spires, floating islands, bamboo, pagodas, statues.
 * Everything is generated in layer coordinates (y down, baseline usually > 0).
 */
import { fbm1, lerp, clamp01 } from '../../core/math';
import type { Rng } from '../../core/rng';
import type { Pt } from './util';

export interface Range {
  path: Path2D;
  top: Pt[];
  minY: number;
}

/** Noise mountain range; `sharp` 0 = rolling hills, 1 = jagged ridged peaks. */
export function mountainRange(rng: Rng, o: { x0: number; x1: number; base: number; amp: number; freq: number; sharp: number; step?: number }): Range {
  const seed = rng.int(0, 99999);
  const step = o.step ?? 8;
  const top: Pt[] = [];
  let minY = Infinity;
  for (let x = o.x0; x <= o.x1 + step; x += step) {
    const n1 = fbm1(x * o.freq, 5, seed);
    const soft = clamp01((n1 + 0.65) / 1.3);
    const ridged = Math.pow(1 - Math.abs(fbm1(x * o.freq * 1.6, 4, seed + 7)), 2.2);
    const shape = lerp(soft, ridged * (0.35 + 0.65 * soft), o.sharp);
    const envelope = 0.5 + 0.5 * clamp01((fbm1(x * o.freq * 0.27, 2, seed + 3) + 0.7) / 1.4);
    const y = o.base - o.amp * shape * envelope;
    top.push({ x, y });
    if (y < minY) minY = y;
  }
  const path = new Path2D();
  path.moveTo(o.x0, o.base + 3000);
  for (const p of top) path.lineTo(p.x, p.y);
  path.lineTo(top[top.length - 1].x, o.base + 3000);
  path.closePath();
  return { path, top, minY };
}

/** Segments of a polyline whose slope faces the light (lightDir -1 = light from the left). */
export function rimPath(top: readonly Pt[], lightDir: number, minSlope = 0.15): Path2D {
  const p = new Path2D();
  for (let i = 0; i < top.length - 1; i++) {
    const a = top[i], b = top[i + 1];
    const slope = (b.y - a.y) / Math.max(1e-3, b.x - a.x);
    // Light from the left lights slopes rising to the right (slope < 0).
    const facing = lightDir < 0 ? slope < -minSlope * 0.2 : slope > minSlope * 0.2;
    if (facing) {
      p.moveTo(a.x, a.y);
      p.lineTo(b.x, b.y);
    }
  }
  return p;
}

/** Add a classical column. `broken` = fraction of height where it snaps (null = intact). */
export function addColumn(path: Path2D, rng: Rng, x: number, base: number, w: number, h: number, broken: number | null): { topY: number } {
  const plinthH = Math.max(6, h * 0.05);
  const pw = w * 1.35;
  // Plinth.
  path.rect(x - pw / 2, base - plinthH, pw, plinthH + 4);
  path.rect(x - pw * 0.44, base - plinthH * 1.6, pw * 0.88, plinthH * 0.7);
  const shaftBase = base - plinthH * 1.6;
  if (broken === null) {
    const capH = Math.max(8, h * 0.06);
    const shaftTop = base - h + capH * 1.8;
    // Slight taper.
    path.moveTo(x - w / 2, shaftBase);
    path.lineTo(x - w * 0.44, shaftTop);
    path.lineTo(x + w * 0.44, shaftTop);
    path.lineTo(x + w / 2, shaftBase);
    path.closePath();
    // Capital (echinus + abacus).
    path.moveTo(x - w * 0.46, shaftTop);
    path.lineTo(x - w * 0.7, shaftTop - capH * 0.9);
    path.lineTo(x + w * 0.7, shaftTop - capH * 0.9);
    path.lineTo(x + w * 0.46, shaftTop);
    path.closePath();
    path.rect(x - w * 0.78, base - h, w * 1.56, capH * 0.95);
    return { topY: base - h };
  }
  const breakY = base - h * broken;
  path.moveTo(x - w / 2, shaftBase);
  path.lineTo(x - w * 0.47, breakY + rng.range(-8, 8));
  // Jagged break.
  const teeth = 4 + rng.int(0, 3);
  for (let i = 1; i < teeth; i++) {
    const t = i / teeth;
    path.lineTo(x - w * 0.47 + w * 0.94 * t, breakY - rng.range(0, h * 0.09) + (i % 2) * rng.range(4, 14));
  }
  path.lineTo(x + w * 0.47, breakY + rng.range(-10, 6));
  path.lineTo(x + w / 2, shaftBase);
  path.closePath();
  return { topY: breakY };
}

/** Rounded arch between two piers (outer silhouette with an open arch). */
export function addArch(path: Path2D, x0: number, x1: number, base: number, h: number, thick: number, brokenSide: -1 | 0 | 1 = 0): void {
  const cx = (x0 + x1) / 2;
  const span = (x1 - x0) / 2;
  const springY = base - h + span;
  // Left pier.
  if (brokenSide !== -1) path.rect(x0 - thick, springY, thick, base - springY);
  else path.rect(x0 - thick, springY + h * 0.35, thick, base - springY - h * 0.35);
  if (brokenSide !== 1) path.rect(x1, springY, thick, base - springY);
  else path.rect(x1, springY + h * 0.4, thick, base - springY - h * 0.4);
  // Arch ring.
  const a0 = brokenSide === -1 ? Math.PI * 1.35 : Math.PI;
  const a1 = brokenSide === 1 ? Math.PI * 1.62 : Math.PI * 2;
  path.moveTo(cx + Math.cos(a0) * (span + thick), springY + Math.sin(a0) * (span + thick));
  path.arc(cx, springY, span + thick, a0, a1);
  path.lineTo(cx + Math.cos(a1) * span, springY + Math.sin(a1) * span);
  path.arc(cx, springY, span, a1, a0, true);
  path.closePath();
}

/** Tower with a pointed (conical) roof; returns window anchor positions. */
export function addTower(path: Path2D, x: number, base: number, w: number, h: number, roofH: number, crenel = false): Pt[] {
  const topY = base - h;
  path.rect(x - w / 2, topY, w, h + 4);
  if (crenel) {
    const n = Math.max(3, Math.round(w / 14));
    const cw = w / (n * 2 - 1);
    for (let i = 0; i < n; i++) path.rect(x - w / 2 + i * 2 * cw, topY - cw * 1.1, cw, cw * 1.2);
  } else {
    path.moveTo(x - w * 0.62, topY);
    path.lineTo(x, topY - roofH);
    path.lineTo(x + w * 0.62, topY);
    path.closePath();
  }
  const wins: Pt[] = [];
  const rows = Math.max(1, Math.floor(h / 70));
  for (let r = 0; r < rows; r++) wins.push({ x, y: topY + 30 + r * 64 });
  return wins;
}

/** Narrow jagged rock spire. */
export function addSpire(path: Path2D, rng: Rng, x: number, base: number, w: number, h: number): Pt[] {
  const pts: Pt[] = [];
  const n = 7;
  pts.push({ x: x - w / 2, y: base + 6 });
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push({ x: x - (w / 2) * (1 - t) + rng.range(-w * 0.08, w * 0.08), y: base - h * t * rng.range(0.92, 1.0) });
  }
  pts.push({ x: x + rng.range(-w * 0.06, w * 0.06), y: base - h });
  for (let i = n - 1; i >= 1; i--) {
    const t = i / n;
    pts.push({ x: x + (w / 2) * (1 - t) + rng.range(-w * 0.08, w * 0.08), y: base - h * t * rng.range(0.9, 1.0) });
  }
  pts.push({ x: x + w / 2, y: base + 6 });
  path.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
  path.closePath();
  return pts;
}

/** Floating island centred at (0,0): flat-ish top, jagged hanging underside. Returns crystal anchors on top. */
export function islandPath(rng: Rng, w: number, h: number): { path: Path2D; crystals: Pt[]; top: Pt[] } {
  const path = new Path2D();
  const top: Pt[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    top.push({ x: -w / 2 + w * t, y: -rng.range(0, h * 0.12) - Math.sin(t * Math.PI) * h * 0.08 });
  }
  path.moveTo(top[0].x, top[0].y);
  for (const p of top) path.lineTo(p.x, p.y);
  // Underside: inverted jagged cone.
  const m = 9;
  for (let i = 1; i < m; i++) {
    const t = i / m;
    const depth = Math.sin(t * Math.PI) * h * rng.range(0.75, 1.05) + (i % 2) * h * 0.1;
    path.lineTo(w / 2 - w * t + rng.range(-w * 0.04, w * 0.04), depth);
  }
  path.closePath();
  const crystals: Pt[] = [];
  const cc = rng.int(1, 3);
  for (let i = 0; i < cc; i++) {
    const p = top[rng.int(2, n - 2)];
    crystals.push({ x: p.x, y: p.y });
  }
  return { path, crystals, top };
}

/** Crystal cluster silhouette at (x, base). */
export function addCrystalCluster(path: Path2D, rng: Rng, x: number, base: number, size: number): void {
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const ang = (rng.next() - 0.5) * 0.9;
    const len = size * rng.range(0.55, 1.1);
    const wd = size * rng.range(0.14, 0.24);
    const ox = x + (i - n / 2) * wd * 0.9;
    const s = Math.sin(ang), c = Math.cos(ang);
    // Hexagonal prism, pointed tip.
    const pts = [
      [-wd / 2, 0], [-wd / 2, -len * 0.78], [0, -len], [wd / 2, -len * 0.78], [wd / 2, 0],
    ];
    pts.forEach(([px, py], k) => {
      const rx = ox + px * c - py * s;
      const ry = base + px * s + py * c;
      if (k === 0) path.moveTo(rx, ry); else path.lineTo(rx, ry);
    });
    path.closePath();
  }
}

/** Bamboo stalk as a thin tapered polygon with node bumps. Returns node positions + top. */
export function addBamboo(path: Path2D, rng: Rng, x: number, base: number, h: number, w: number, lean: number): { nodes: Pt[]; tip: Pt } {
  const segs = 10;
  const left: Pt[] = [], right: Pt[] = [], nodes: Pt[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const cx = x + lean * h * t * t;
    const y = base - h * t;
    const ww = w * (1 - t * 0.45) * (i % 2 === 0 ? 1.12 : 1);
    left.push({ x: cx - ww / 2, y });
    right.push({ x: cx + ww / 2, y });
    if (i > 0 && i < segs) nodes.push({ x: cx, y });
  }
  path.moveTo(left[0].x, left[0].y + 6);
  for (const p of left) path.lineTo(p.x, p.y);
  for (let i = right.length - 1; i >= 0; i--) path.lineTo(right[i].x, right[i].y);
  path.lineTo(right[0].x, right[0].y + 6);
  path.closePath();
  return { nodes, tip: { x: x + lean * h, y: base - h } };
}

/** Narrow bamboo leaf at p pointing at angle. */
export function addLeaf(path: Path2D, x: number, y: number, ang: number, len: number, wid: number): void {
  const c = Math.cos(ang), s = Math.sin(ang);
  const tx = x + c * len, ty = y + s * len;
  const mx = x + c * len * 0.45, my = y + s * len * 0.45;
  const nx = -s * wid, ny = c * wid;
  path.moveTo(x, y);
  path.quadraticCurveTo(mx + nx, my + ny, tx, ty);
  path.quadraticCurveTo(mx - nx, my - ny, x, y);
  path.closePath();
}

/** Multi-tier pagoda silhouette. Returns lit-window anchor. */
export function addPagoda(path: Path2D, x: number, base: number, scale: number, tiers = 5): Pt {
  let y = base;
  let w = 120 * scale;
  const tierH = 34 * scale;
  path.rect(x - w * 0.62, y - 10 * scale, w * 1.24, 12 * scale);
  let win: Pt = { x, y: y - tierH * 0.6 };
  for (let i = 0; i < tiers; i++) {
    const bodyW = w * 0.62;
    path.rect(x - bodyW / 2, y - tierH, bodyW, tierH + 2);
    if (i === 1) win = { x, y: y - tierH * 0.55 };
    // Curved roof with upturned eaves.
    const ry = y - tierH;
    const rw = w * 0.95;
    path.moveTo(x - rw / 2 - 10 * scale, ry - 6 * scale);
    path.quadraticCurveTo(x - rw * 0.3, ry + 2 * scale, x - rw * 0.18, ry - 12 * scale);
    path.lineTo(x, ry - 20 * scale);
    path.lineTo(x + rw * 0.18, ry - 12 * scale);
    path.quadraticCurveTo(x + rw * 0.3, ry + 2 * scale, x + rw / 2 + 10 * scale, ry - 6 * scale);
    path.lineTo(x + rw / 2, ry + 3 * scale);
    path.lineTo(x - rw / 2, ry + 3 * scale);
    path.closePath();
    y = ry - 14 * scale;
    w *= 0.83;
  }
  // Spire.
  path.rect(x - 2.5 * scale, y - 46 * scale, 5 * scale, 46 * scale);
  for (let k = 0; k < 4; k++) path.rect(x - 7 * scale, y - 12 * scale - k * 9 * scale, 14 * scale, 3 * scale);
  return win;
}

/** Robed guardian statue silhouette on a pedestal (centre x, base). Returns eye position. */
export function addGuardian(path: Path2D, x: number, base: number, h: number, facing = 1): Pt {
  const s = h / 300;
  const pedH = 46 * s;
  path.rect(x - 52 * s, base - pedH, 104 * s, pedH + 4);
  path.rect(x - 60 * s, base - pedH - 10 * s, 120 * s, 12 * s);
  const fb = base - pedH - 10 * s;
  // Robe.
  path.moveTo(x - 44 * s, fb);
  path.lineTo(x - 30 * s, fb - 150 * s);
  path.lineTo(x - 38 * s, fb - 196 * s);
  path.lineTo(x - 22 * s, fb - 214 * s);
  path.lineTo(x + 22 * s, fb - 214 * s);
  path.lineTo(x + 38 * s, fb - 196 * s);
  path.lineTo(x + 30 * s, fb - 150 * s);
  path.lineTo(x + 44 * s, fb);
  path.closePath();
  // Hooded head.
  path.moveTo(x + 17 * s, fb - 214 * s);
  path.ellipse(x, fb - 232 * s, 17 * s, 21 * s, 0, 0, Math.PI * 2);
  // Sword planted in front, hands on the pommel.
  const sx = x + 12 * s * facing;
  path.rect(sx - 3 * s, fb - 160 * s, 6 * s, 160 * s);
  path.rect(sx - 16 * s, fb - 166 * s, 32 * s, 6 * s);
  path.ellipse(sx, fb - 176 * s, 11 * s, 9 * s, 0, 0, Math.PI * 2);
  return { x: x + 6 * s * facing, y: fb - 234 * s };
}

/** Rotated rectangle polygon (e.g. fallen column drum). */
export function addRotRect(path: Path2D, cx: number, cy: number, w: number, h: number, ang: number): void {
  const c = Math.cos(ang), s = Math.sin(ang);
  const hw = w / 2, hh = h / 2;
  const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  pts.forEach(([px, py], i) => {
    const x = cx + px * c - py * s, y = cy + px * s + py * c;
    if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
  });
  path.closePath();
}
