// Stickers ("slaps"): name labels with marker tags, printed stickers, shipping-label
// style, peeling corners, torn residue. Paper mask = 255.

import { rgba, PAINT, mix, jitter, weather } from '../core/color.js';
import { addPolygon, addCircle, plainStrokes } from '../paint/spray.js';
import { buildTagGeometry } from './tag.js';
import { rotateAround, jaggedLine } from '../core/geom.js';
import { Rng } from '../core/rng.js';

const PAPER_WHITE = [238, 236, 228];

function fakeTextBars(ctx, x, y, w, h, rows, rng) {
  const rh = h / (rows * 1.7);
  for (let r = 0; r < rows; r++) {
    let cx = x;
    const yy = y + r * rh * 1.7;
    const lw = w * rng.range(0.7, 1);
    while (cx < x + lw) {
      const ww = Math.min(x + w - cx, rh * rng.range(1.5, 6));
      ctx.fillRect(cx, yy, ww, rh);
      cx += ww + rh * rng.range(0.5, 1.2);
    }
  }
}

/**
 * o: { x, y (center), size (long side, m), writer, age (0 fresh .. 1 old), kind }
 */
export function renderSticker(P, rng, o) {
  const ctx = P.ctx;
  const kind = o.kind || rng.pickW([['name', 5], ['plain', 3], ['printed', 3], ['label', 2], ['round', 1.5], ['residue', 2.5]]);
  const w = o.size;
  const h = kind === 'round' ? w : w * rng.range(0.55, 0.8);
  const rot = rng.gaussC(0, 0.18);
  const fade = o.age ?? 0;
  const wall = P.wallTone;
  const age = (c) => (fade > 0 ? weather(c, fade * 0.8, wall) : c);
  const bbox = { x0: o.x - w * 0.7, y0: o.y - w * 0.7, x1: o.x + w * 0.7, y1: o.y + w * 0.7 };

  if (kind === 'residue') {
    const scrap = new Path2D();
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const sx = o.x + rng.range(-0.3, 0.3) * w, sy = o.y + rng.range(-0.3, 0.3) * h;
      const sw = w * rng.range(0.2, 0.6), sh = h * rng.range(0.2, 0.6);
      const pts = [];
      jaggedLine(sx - sw / 2, sy - sh / 2, sx + sw / 2, sy - sh / 2, rng, sh * 0.15, sw / 4, pts);
      jaggedLine(sx + sw / 2, sy - sh / 2, sx + sw / 2, sy + sh / 2, rng, sw * 0.12, sh / 3, pts);
      jaggedLine(sx + sw / 2, sy + sh / 2, sx - sw / 2, sy + sh / 2, rng, sh * 0.15, sw / 4, pts);
      addPolygon(scrap, rotateAround(pts, o.x, o.y, rot));
    }
    ctx.fillStyle = rgba(age(mix(PAPER_WHITE, [200, 195, 180], rng.next() * 0.5)), 0.9);
    ctx.fill(scrap);
    P.matFill(scrap, 0, 10, 255, 0.9);
    return bbox;
  }

  // body outline in local coords (corner may be peeled: cut off and folded back)
  const ca = Math.cos(rot), sa = Math.sin(rot);
  const toW = (x, y) => [o.x + x * ca - y * sa, o.y + x * sa + y * ca];
  let flap = null;
  const local = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  if (kind !== 'round' && rng.chance(0.3 + fade * 0.4)) {
    const k = rng.int(0, 3);
    const c = local[k], nx = local[(k + 1) % 4], px = local[(k + 3) % 4];
    const f = rng.range(0.15, 0.4);
    const a = [c[0] + (nx[0] - c[0]) * f, c[1] + (nx[1] - c[1]) * f];
    const b = [c[0] + (px[0] - c[0]) * f, c[1] + (px[1] - c[1]) * f];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const fx = mx + (mx - c[0]) * 0.8, fy = my + (my - c[1]) * 0.8;
    flap = [a, b, [fx, fy]];
    local.splice(k, 1, b, a); // corner replaced by the fold line (prev -> b -> a -> next)
  }
  const path = new Path2D();
  if (kind === 'round') addCircle(path, o.x, o.y, w / 2);
  else addPolygon(path, local.flatMap(([x, y]) => toW(x, y)));

  let base, band = null;
  switch (kind) {
    case 'name':
      base = PAPER_WHITE;
      band = PAINT[rng.pick(['red', 'blue', 'green', 'red', 'orange', 'purple', 'black'])];
      break;
    case 'plain':
      base = rng.pickW([[PAPER_WHITE, 6], [[236, 214, 84], 1], [[240, 190, 196], 0.6], [[180, 214, 236], 0.6], [[30, 30, 32], 0.6]]);
      break;
    case 'label':
      base = [242, 240, 232];
      break;
    default:
      base = jitter(PAINT[rng.pick(['yellow', 'red', 'blue', 'black', 'white', 'teal', 'orange', 'pink', 'skyBlue'])], rng, 8);
  }
  const vinyl = rng.chance(0.4);
  ctx.fillStyle = rgba(age(base), 0.98);
  ctx.fill(path);
  const detail = P.ppm * w > 10; // skip print details when the sticker is only a few pixels
  const dr = new Rng(rng.u32()); // keeps the main stream resolution-independent
  if (detail) {
    const rng = dr;
    ctx.save();
    ctx.clip(path);
    ctx.translate(o.x, o.y);
    ctx.rotate(rot);
    if (kind === 'name') {
      ctx.fillStyle = rgba(age(band), 0.97);
      ctx.fillRect(-w / 2, -h / 2, w, h * 0.34);
      ctx.fillStyle = rgba(age([245, 245, 240]), 0.95);
      fakeTextBars(ctx, -w * 0.32, -h * 0.42, w * 0.64, h * 0.16, 1, rng);
      ctx.fillStyle = rgba(age(band), 0.97);
      ctx.fillRect(-w * 0.5, h * 0.4, w, h * 0.1);
    } else if (kind === 'label') {
      ctx.strokeStyle = rgba(age([40, 40, 40]), 0.8);
      ctx.lineWidth = h * 0.02;
      ctx.strokeRect(-w * 0.45, -h * 0.42, w * 0.9, h * 0.84);
      ctx.beginPath();
      ctx.moveTo(-w * 0.45, -h * 0.1); ctx.lineTo(w * 0.45, -h * 0.1);
      ctx.stroke();
      ctx.fillStyle = rgba(age([50, 50, 50]), 0.7);
      fakeTextBars(ctx, -w * 0.4, -h * 0.36, w * 0.6, h * 0.18, 2, rng);
      let bx = w * 0.05;
      ctx.fillStyle = rgba(age([30, 30, 30]), 0.85);
      while (bx < w * 0.4) {
        const bw = h * rng.range(0.008, 0.03);
        ctx.fillRect(bx, h * 0.2, bw, h * 0.16);
        bx += bw + h * rng.range(0.01, 0.03);
      }
    } else if (kind === 'round' || kind === 'printed') {
      const ink = rng.pick([PAINT.black, PAINT.white, PAINT.red, PAINT.navy, [250, 220, 60]]);
      ctx.fillStyle = rgba(age(ink), 0.9);
      const motif = rng.int(0, 3);
      if (motif === 0) { ctx.beginPath(); ctx.arc(0, 0, h * 0.3, 0, Math.PI * 2); ctx.fill(); }
      else if (motif === 1) fakeTextBars(ctx, -w * 0.4, -h * 0.3, w * 0.8, h * 0.6, 3, rng);
      else if (motif === 2) ctx.fillRect(-w * 0.4, -h * 0.12, w * 0.8, h * 0.24);
      else { ctx.beginPath(); ctx.moveTo(-w * 0.3, h * 0.3); ctx.lineTo(0, -h * 0.35); ctx.lineTo(w * 0.3, h * 0.3); ctx.closePath(); ctx.fill(); }
    }
    ctx.restore();
  }
  // marker tag on the sticker (writer's name)
  if ((kind === 'name' || kind === 'plain' || kind === 'label') && o.writer && rng.chance(0.85)) {
    const geo = buildTagGeometry(o.writer, h * 0.36, rng, { decoScale: 0.4 });
    const gw = geo.box.x1 - geo.box.x0;
    const s = Math.min(1, (w * 0.82) / Math.max(gw, 1e-3));
    const gcx = (geo.box.x0 + geo.box.x1) / 2, gcy = (geo.box.y0 + geo.box.y1) / 2;
    const ty = kind === 'name' ? h * 0.1 : 0;
    const strokes = geo.strokes.map((p) => {
      const q = new Array(p.length);
      for (let i = 0; i < p.length; i += 2) {
        const [X, Y] = toW((p[i] - gcx) * s, (p[i + 1] - gcy) * s + ty);
        q[i] = X;
        q[i + 1] = Y;
      }
      return q;
    });
    const dark = base[0] + base[1] + base[2] > 300;
    const ink = dark ? (rng.chance(0.75) ? PAINT.black : rng.pick([PAINT.red, PAINT.blue, PAINT.purple, PAINT.green])) : PAINT.white;
    plainStrokes(ctx, strokes, Math.max(0.0015, h * 0.045 * s), rgba(age(ink), 0.92));
  }
  if (flap) {
    const fp = new Path2D();
    addPolygon(fp, flap.flatMap(([x, y]) => toW(x, y)));
    ctx.fillStyle = rgba(age([214, 210, 198]), 0.96);
    ctx.fill(fp);
    ctx.strokeStyle = rgba([40, 36, 32], 0.25);
    ctx.lineWidth = Math.max(0.0008, h * 0.015);
    ctx.stroke(fp);
    P.matFill(fp, 0, 12, 255, 0.96);
  }
  P.matFill(path, 0, vinyl ? 70 : 12, 255, 0.98);
  return bbox;
}

/** A cluster of stickers around a point. */
export function renderStickerCluster(P, rng, o, writers) {
  let box = null;
  for (let i = 0; i < o.count; i++) {
    const x = o.x + rng.gauss() * o.spread;
    const y = o.y + rng.gauss() * o.spread * 0.6;
    const b = renderSticker(P, rng, { x, y, size: rng.range(0.06, 0.15), writer: rng.pick(writers), age: o.age });
    box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b;
  }
  return box;
}
