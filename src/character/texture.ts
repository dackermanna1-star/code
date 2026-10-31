import * as THREE from 'three';
import { REGION } from './bodyMesh';
import { Outfit, sleeveLength } from './outfit';
import { RNG } from '../core/math';

const SIZE = 512;

function shade(hex: string, f: number) {
  const c = new THREE.Color(hex);
  if (f >= 0) c.lerp(new THREE.Color(1, 1, 1), f);
  else c.multiplyScalar(1 + f);
  return '#' + c.getHexString();
}
function mix(a: string, b: string, t: number) {
  const c = new THREE.Color(a).lerp(new THREE.Color(b), t);
  return '#' + c.getHexString();
}

type Rect = { x: number; y: number; w: number; h: number };
function rect(name: keyof typeof REGION): Rect {
  const [u0, v0, w, h] = REGION[name];
  return { x: u0 * SIZE, y: (1 - v0 - h) * SIZE, w: w * SIZE, h: h * SIZE };
}

class Painter {
  ctx: CanvasRenderingContext2D;
  rng: RNG;
  constructor(public canvas: HTMLCanvasElement, seed: number) {
    this.ctx = canvas.getContext('2d')!;
    this.rng = new RNG(seed);
  }
  /** Map region-local (u, v) in [0,1] (v up) to canvas px. */
  px(r: Rect, u: number, v: number): [number, number] {
    return [r.x + u * r.w, r.y + (1 - v) * r.h];
  }
  fill(r: Rect, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  band(r: Rect, v0: number, v1: number, color: string, u0 = 0, u1 = 1) {
    const [x0, y1] = this.px(r, u0, v0);
    const [x1, y0] = this.px(r, u1, v1);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  /** Fabric grain: many short faint strokes. */
  grain(r: Rect, base: string, amount = 0.08, density = 1.0, len = 3) {
    const ctx = this.ctx;
    const n = Math.floor(r.w * r.h * 0.02 * density);
    for (let i = 0; i < n; i++) {
      const x = r.x + this.rng.next() * r.w;
      const y = r.y + this.rng.next() * r.h;
      const f = (this.rng.next() - 0.5) * 2 * amount;
      ctx.strokeStyle = shade(base, f);
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (this.rng.next() - 0.5) * len, y + (this.rng.next() - 0.5) * len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  noiseDots(r: Rect, color: string, count: number, size: number, alpha: number, area?: (u: number, v: number) => number) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const u = this.rng.next();
      const v = this.rng.next();
      const a = area ? area(u, v) : 1;
      if (a <= 0 || this.rng.next() > a) continue;
      const [x, y] = this.px(r, u, v);
      ctx.globalAlpha = alpha * (0.5 + this.rng.next() * 0.5);
      ctx.fillRect(x, y, size, size);
    }
    ctx.globalAlpha = 1;
  }
  /** Vertical gradient shading inside region (v up). */
  vshade(r: Rect, stops: [number, string, number][]) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, r.y + r.h, 0, r.y);
    for (const [v, c, a] of stops) {
      const col = new THREE.Color(c);
      g.addColorStop(v, `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},${a})`);
    }
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  /** Horizontal (around) shading: darker at back/sides to fake AO. */
  ushade(r: Rect, dark: number, centers = [0.5]) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      let d = 1;
      for (const c of centers) d = Math.min(d, Math.abs(u - c));
      const a = Math.min(1, d * 2.2) * dark;
      g.addColorStop(u, `rgba(0,0,0,${a.toFixed(3)})`);
    }
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  line(r: Rect, pts: [number, number][], color: string, width: number, alpha = 1) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    pts.forEach(([u, v], i) => {
      const [x, y] = this.px(r, u, v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ellipse(r: Rect, u: number, v: number, ru: number, rv: number, color: string, alpha = 1, rot = 0) {
    const ctx = this.ctx;
    const [x, y] = this.px(r, u, v);
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.ellipse(x, y, ru * r.w, rv * r.h, rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  softSpot(r: Rect, u: number, v: number, ru: number, rv: number, color: string, alpha: number) {
    const ctx = this.ctx;
    const [x, y] = this.px(r, u, v);
    const rad = Math.max(ru * r.w, rv * r.h);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const c = new THREE.Color(color);
    const rgb = `${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0}`;
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale((ru * r.w) / rad, (rv * r.h) / rad);
    ctx.translate(-x, -y);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawSkin(p: Painter, r: Rect, skin: string) {
  p.fill(r, skin);
  p.noiseDots(r, shade(skin, -0.25), Math.floor(r.w * r.h * 0.01), 1, 0.12);
  p.noiseDots(r, shade(skin, 0.2), Math.floor(r.w * r.h * 0.006), 1, 0.08);
}

function drawPattern(p: Painter, r: Rect, o: Outfit, v0: number, v1: number) {
  const ctx = p.ctx;
  const c2 = o.topColor2;
  switch (o.topPattern) {
    case 'stripes':
      for (let v = v0 + 0.04; v < v1; v += 0.09) p.band(r, v, v + 0.035, c2);
      break;
    case 'flannel': {
      ctx.globalAlpha = 0.35;
      for (let u = 0; u < 1; u += 0.08) p.band(r, v0, v1, c2, u, u + 0.025);
      for (let v = v0; v < v1; v += 0.08) p.band(r, v, v + 0.025, c2);
      ctx.globalAlpha = 0.2;
      for (let u = 0.04; u < 1; u += 0.08) p.band(r, v0, v1, '#000000', u, u + 0.008);
      ctx.globalAlpha = 1;
      break;
    }
    case 'camo':
      for (let i = 0; i < 70; i++) {
        const u = p.rng.next();
        const v = v0 + p.rng.next() * (v1 - v0);
        p.ellipse(r, u, v, 0.03 + p.rng.next() * 0.04, 0.02 + p.rng.next() * 0.03, p.rng.chance(0.5) ? c2 : shade(o.topColor, -0.35), 0.9, p.rng.next() * 3);
      }
      break;
    case 'logo': {
      // chest logo on the front (u ~ 0.5)
      p.ellipse(r, 0.5, 0.66, 0.05, 0.06, c2, 1);
      p.ellipse(r, 0.5, 0.66, 0.03, 0.035, o.topColor, 1);
      p.line(r, [[0.47, 0.62], [0.53, 0.7]], c2, 3);
      break;
    }
    case 'number': {
      ctx.fillStyle = c2;
      const [x, y] = p.px(r, 0.0, 0.75);
      ctx.font = `bold ${Math.floor(r.h * 0.16)}px Arial`;
      ctx.fillText(String(10 + (o.seed % 89)), x + r.w * 0.04, y);
      const [x2, y2] = p.px(r, 0.45, 0.75);
      ctx.font = `bold ${Math.floor(r.h * 0.1)}px Arial`;
      ctx.fillText(String(10 + (o.seed % 89)), x2, y2);
      break;
    }
    case 'panel':
      p.band(r, v0, v1, c2, 0.2, 0.3);
      p.band(r, v0, v1, c2, 0.7, 0.8);
      break;
  }
}

/** Torso: u 0=back, .25 right side, .5 front, .75 left side. v 0=crotch, 1=neck base. */
function drawTorso(p: Painter, o: Outfit) {
  const r = rect('torso');
  const beltV = 0.27;
  // pants part
  p.fill(r, o.bottomColor);
  p.grain(r, o.bottomColor, 0.12, 1.2);
  // crotch seam / fly
  p.line(r, [[0.5, 0.0], [0.5, beltV]], shade(o.bottomColor, -0.35), 2, 0.7);
  if (o.bottom === 'jeans') {
    p.line(r, [[0.43, beltV - 0.01], [0.45, 0.12], [0.5, 0.08]], shade(o.bottomColor, 0.25), 1, 0.6);
    p.line(r, [[0.12, beltV], [0.38, beltV]], shade(o.bottomColor, 0.3), 1, 0.4);
  }
  const top = o.top;
  if (top === 'bare') {
    drawSkin(p, { ...r, h: r.h * (1 - beltV), y: r.y }, o.skin);
    // muscle definition
    const d = shade(o.skin, -0.3);
    p.softSpot(r, 0.43, 0.66, 0.07, 0.07, d, 0.25);
    p.softSpot(r, 0.57, 0.66, 0.07, 0.07, d, 0.25);
    p.line(r, [[0.5, 0.75], [0.5, 0.3]], d, 1.5, 0.35);
    for (const v of [0.36, 0.44, 0.52]) p.line(r, [[0.46, v], [0.54, v]], d, 1.2, 0.25);
    p.line(r, [[0.36, 0.6], [0.5, 0.56], [0.64, 0.6]], d, 1.5, 0.35); // pec lower edge
    p.softSpot(r, 0.25, 0.7, 0.05, 0.1, d, 0.3); // armpits
    p.softSpot(r, 0.75, 0.7, 0.05, 0.1, d, 0.3);
    p.line(r, [[0.0, 0.85], [0.08, 0.6], [0.02, 0.35]], d, 1.2, 0.2); // spine/back
    p.line(r, [[1.0, 0.85], [0.92, 0.6], [0.98, 0.35]], d, 1.2, 0.2);
    if (o.tattoo) {
      const tc = '#1d2a3a';
      p.line(r, [[0.62, 0.78], [0.66, 0.7], [0.63, 0.62], [0.68, 0.55]], tc, 3, 0.7);
      p.line(r, [[0.06, 0.8], [0.12, 0.7], [0.08, 0.6]], tc, 4, 0.6);
      p.ellipse(r, 0.1, 0.55, 0.03, 0.04, tc, 0.5);
    }
  } else {
    const tc = o.topColor;
    p.band(r, beltV - 0.02, 1, tc);
    p.grain({ ...r, h: r.h * (1 - beltV) }, tc, 0.12, 1.4);
    drawPattern(p, r, o, beltV, 0.95);
    // fold shading
    p.softSpot(r, 0.25, 0.7, 0.05, 0.12, '#000000', 0.35);
    p.softSpot(r, 0.75, 0.7, 0.05, 0.12, '#000000', 0.35);
    for (let i = 0; i < 6; i++) {
      const u = 0.35 + p.rng.next() * 0.3;
      const v = 0.3 + p.rng.next() * 0.25;
      p.line(r, [[u, v], [u + 0.04, v + 0.03]], shade(tc, -0.3), 2, 0.25);
    }
    // hem
    p.band(r, beltV - 0.02, beltV + 0.005, shade(tc, -0.25));
    if (top === 'tank' || top === 'vest') {
      // arm holes & low neckline -> skin
      for (const u of [0.25, 0.75]) p.ellipse(r, u, 0.86, 0.075, 0.16, o.skin, 1);
      p.ellipse(r, 0.5, 1.0, 0.11, 0.1, o.skin, 1);
      p.ellipse(r, 0.0, 1.0, 0.08, 0.05, o.skin, 1);
      p.ellipse(r, 1.0, 1.0, 0.08, 0.05, o.skin, 1);
      if (top === 'vest') {
        p.line(r, [[0.5, beltV], [0.5, 0.9]], shade(tc, -0.4), 3, 0.9);
        p.line(r, [[0.47, 0.9], [0.4, 1.0]], shade(tc, 0.2), 2, 0.6);
        p.line(r, [[0.53, 0.9], [0.6, 1.0]], shade(tc, 0.2), 2, 0.6);
      }
    } else {
      // collar
      p.ellipse(r, 0.5, 1.0, 0.07, 0.05, shade(tc, -0.3), 1);
    }
    if (top === 'hoodie') {
      p.band(r, 0.33, 0.47, shade(tc, -0.12), 0.4, 0.6); // pocket
      p.line(r, [[0.4, 0.47], [0.6, 0.47]], shade(tc, -0.35), 1.5);
      p.line(r, [[0.48, 0.97], [0.47, 0.82]], '#dddddd', 1.5, 0.8);
      p.line(r, [[0.52, 0.97], [0.53, 0.82]], '#dddddd', 1.5, 0.8);
      p.band(r, 0.92, 1.0, shade(tc, -0.2), 0.0, 1.0);
    }
    if (top === 'jacket' || top === 'tracktop') {
      // open front showing inner shirt, zipper, collar
      const inner = top === 'jacket' ? o.topColor2 : shade(tc, -0.2);
      if (top === 'jacket') p.band(r, beltV, 0.98, inner, 0.46, 0.54);
      p.line(r, [[0.46, beltV], [0.46, 0.98]], shade(tc, -0.45), 2);
      p.line(r, [[0.54, beltV], [0.54, 0.98]], shade(tc, -0.45), 2);
      if (top === 'tracktop') {
        p.band(r, beltV, 1, o.topColor2, 0.2, 0.235);
        p.band(r, beltV, 1, o.topColor2, 0.765, 0.8);
        p.line(r, [[0.5, beltV], [0.5, 0.98]], '#bbbbbb', 1.5);
      }
      p.band(r, 0.93, 1.0, shade(tc, -0.25));
    }
    if (top === 'gi') {
      // crossing lapels
      const lap = shade(tc, -0.15);
      p.line(r, [[0.38, 1.0], [0.52, 0.45]], lap, 7);
      p.line(r, [[0.62, 1.0], [0.48, 0.45]], lap, 7);
      p.ellipse(r, 0.5, 0.86, 0.05, 0.11, o.skin, 1);
      p.line(r, [[0.0, 0.98], [1.0, 0.98]], lap, 5);
    }
  }
  // belt
  if (o.extras.includes('belt') || o.top === 'gi' || o.extras.includes('sash')) {
    const bc = o.top === 'gi' ? o.topColor2 : o.extras.includes('sash') ? o.extraColor : '#1a1410';
    p.band(r, beltV - 0.03, beltV + 0.03, bc);
    if (o.top !== 'gi') p.band(r, beltV - 0.025, beltV + 0.025, '#a08850', 0.47, 0.53);
  }
  // AO at bottom & back
  p.vshade(r, [[0, '#000000', 0.35], [0.12, '#000000', 0.0], [1, '#000000', 0]]);
  p.ushade(r, 0.22);
}

function drawArm(p: Painter, o: Outfit) {
  const r = rect('arm');
  const sl = sleeveLength(o.top);
  drawSkin(p, r, o.skin);
  // elbow crease & forearm shading
  p.softSpot(r, 0.5, 0.56, 0.12, 0.04, shade(o.skin, -0.3), 0.35);
  p.ushade(r, 0.18, [0.5]);
  if (o.tattoo && sl < 0.5) {
    for (let i = 0; i < 6; i++) p.line(r, [[0.3 + i * 0.07, 0.2], [0.33 + i * 0.07, 0.4], [0.3 + i * 0.07, 0.48]], '#1d2a3a', 3, 0.55);
  }
  if (sl > 0) {
    // arm v: 0 at the shoulder, 1 at the wrist. The sleeve covers [0, vEnd].
    const vEnd = (sl + 0.12) / 1.12;
    p.band(r, 0, vEnd, o.topColor);
    p.grain({ ...r, y: r.y + r.h * (1 - vEnd), h: r.h * vEnd }, o.topColor, 0.12, 1.3);
    p.band(r, vEnd - 0.03, vEnd, shade(o.topColor, -0.3));
    if (o.top === 'tracktop') p.band(r, 0, vEnd, o.topColor2, 0.47, 0.53);
    if (o.topPattern === 'flannel' || o.topPattern === 'camo' || o.topPattern === 'stripes') drawPattern(p, r, o, 0, vEnd - 0.03);
    // redraw skin beyond sleeve (pattern may overflow)
    const skinR = { ...r, h: r.h * (1 - vEnd) };
    drawSkin(p, skinR, o.skin);
    p.softSpot(r, 0.5, 0.56, 0.12, 0.04, shade(o.skin, -0.3), sl < 0.5 ? 0.35 : 0);
    p.ushade(r, 0.15, [0.5]);
  }
  if (o.extras.includes('bracers')) p.band(r, 0.68, 0.88, o.extraColor);
}

function drawLeg(p: Painter, o: Outfit) {
  const r = rect('leg');
  const pc = o.bottomColor;
  p.fill(r, pc);
  p.grain(r, pc, 0.12, 1.4);
  // seams on the sides
  p.line(r, [[0.25, 0], [0.25, 1]], shade(pc, -0.35), 1.5, 0.6);
  p.line(r, [[0.75, 0], [0.75, 1]], shade(pc, -0.35), 1.5, 0.6);
  // knee creases (v ~ 0.52)
  for (let i = 0; i < 4; i++) p.line(r, [[0.38 + i * 0.07, 0.5], [0.42 + i * 0.07, 0.53]], shade(pc, -0.3), 2, 0.4);
  if (o.bottom === 'jeans') {
    p.noiseDots(r, shade(pc, 0.35), 900, 1, 0.25, (u, v) => (Math.abs(u - 0.5) < 0.15 && v > 0.35 && v < 0.65 ? 1 : 0.2));
    p.band(r, 0.95, 1.0, shade(pc, -0.2));
  }
  if (o.bottom === 'cargo') {
    p.band(r, 0.55, 0.7, shade(pc, -0.12), 0.1, 0.3);
    p.band(r, 0.55, 0.7, shade(pc, -0.12), 0.7, 0.9);
    p.line(r, [[0.1, 0.7], [0.3, 0.7]], shade(pc, -0.4), 1.5);
    p.line(r, [[0.7, 0.7], [0.9, 0.7]], shade(pc, -0.4), 1.5);
  }
  if (o.bottom === 'track') {
    p.band(r, 0, 1, o.topColor2, 0.23, 0.27);
    p.band(r, 0, 1, o.topColor2, 0.73, 0.77);
  }
  if (o.bottom === 'shorts') {
    const sk = { ...r, y: r.y + r.h * 0.42, h: r.h * 0.58 };
    drawSkin(p, sk, o.skin);
    p.band(r, 1 - 0.42, 1 - 0.38, shade(pc, -0.3));
  }
  if (o.extras.includes('kneepads')) p.band(r, 0.45, 0.6, o.extraColor, 0.3, 0.7);
  p.vshade(r, [[0, '#000000', 0.0], [0.9, '#000000', 0.0], [1, '#000000', 0.25]]);
  p.ushade(r, 0.2, [0.5]);
}

function drawHead(p: Painter, o: Outfit) {
  const r = rect('head');
  const sk = o.skin;
  drawSkin(p, r, sk);
  const dark = shade(sk, -0.35);
  // side/back darkening
  p.ushade(r, 0.18, [0.5]);
  // eye sockets
  const eyeV = 0.505;
  const eu = 0.062;
  for (const s of [-1, 1]) {
    p.softSpot(r, 0.5 + s * eu, eyeV, 0.035, 0.03, dark, 0.45);
  }
  // nose shading
  p.softSpot(r, 0.5, 0.38, 0.03, 0.05, shade(sk, 0.15), 0.4);
  p.softSpot(r, 0.5, 0.345, 0.04, 0.018, dark, 0.55);
  p.ellipse(r, 0.488, 0.352, 0.006, 0.006, shade(sk, -0.6), 0.8);
  p.ellipse(r, 0.512, 0.352, 0.006, 0.006, shade(sk, -0.6), 0.8);
  // cheeks
  p.softSpot(r, 0.43, 0.38, 0.04, 0.05, shade(sk, -0.15), 0.25);
  p.softSpot(r, 0.57, 0.38, 0.04, 0.05, shade(sk, -0.15), 0.25);
  // mouth
  const lip = mix(sk, '#7a3030', 0.35);
  p.ellipse(r, 0.5, 0.268, 0.032, 0.011, lip, 0.9);
  p.line(r, [[0.468, 0.27], [0.5, 0.266], [0.532, 0.27]], shade(sk, -0.65), 1.6, 0.95);
  p.softSpot(r, 0.5, 0.235, 0.03, 0.015, dark, 0.3);
  // facial hair
  const hairC = o.hair;
  if (o.facial === 'stubble' || o.facial === 'beard' || o.facial === 'goatee') {
    const dens = o.facial === 'beard' ? 1 : o.facial === 'goatee' ? 0.9 : 0.55;
    p.noiseDots(r, hairC, 2600, 1, 0.55 * dens, (u, v) => {
      const du = Math.abs(u - 0.5);
      if (o.facial === 'goatee') return du < 0.035 && v < 0.29 && v > 0.13 ? 1 : 0;
      const jaw = v < 0.36 && du < 0.15 ? 1 : 0;
      const lipGap = Math.abs(v - 0.268) < 0.012 && du < 0.03 ? 0 : 1;
      return jaw * lipGap * (v > 0.05 ? 1 : 0);
    });
    if (o.facial === 'beard') p.softSpot(r, 0.5, 0.18, 0.12, 0.12, hairC, 0.6);
  }
  if (o.facial === 'mustache') {
    p.line(r, [[0.47, 0.285], [0.5, 0.295], [0.53, 0.285]], hairC, 3.5, 0.9);
  }
  // eyes
  for (const s of [-1, 1]) {
    const u = 0.5 + s * eu;
    p.ellipse(r, u, eyeV, 0.023, 0.011, '#e8e2d8', 1);
    p.ellipse(r, u + s * 0.002, eyeV, 0.011, 0.011, o.eyes, 1);
    p.ellipse(r, u + s * 0.002, eyeV, 0.005, 0.005, '#050505', 1);
    // upper lid line
    p.line(r, [[u - 0.025, eyeV + 0.002], [u, eyeV + 0.014], [u + 0.025, eyeV + 0.004]], shade(sk, -0.7), 2.2, 0.95);
    // brow
    const bAng = o.brow * 0.012;
    p.line(r, [[u - s * 0.03, eyeV + 0.042 + bAng], [u + s * 0.004, eyeV + 0.04], [u + s * 0.03, eyeV + 0.034 - bAng * 0.4]].map(([a, b]) => [a, b] as [number, number]), hairC, 3.2, 0.85);
  }
  // scar
  if (o.scar) p.line(r, [[0.555, 0.56], [0.575, 0.47], [0.585, 0.4]], mix(sk, '#ffb0a0', 0.4), 2, 0.9);
  // hairline / buzzcut on the scalp texture (also under hair shells)
  if (o.hairStyle !== 'bald') {
    const ctx = p.ctx;
    const hc = o.hair;
    // scalp region: v > 0.68 (front) and lower at back
    for (let i = 0; i <= 64; i++) {
      const u = i / 64;
      const front = Math.max(0, Math.cos((u - 0.5) * Math.PI * 2)); // 1 at front, 0 at sides
      const vLine = 0.8 - (1 - front) * 0.3;
      ctx.fillStyle = hc;
      const [x, y] = p.px(r, u, 1);
      const [, y2] = p.px(r, u, vLine);
      ctx.globalAlpha = o.hairStyle === 'buzz' ? 0.85 : 1;
      ctx.fillRect(x - 3, y, 7, y2 - y);
    }
    ctx.globalAlpha = 1;
    p.noiseDots(r, shade(hc, 0.25), 1500, 1, 0.3, (u, v) => (v > 0.7 ? 1 : 0));
  }
  if (o.head === 'bandana' || o.head === 'headband') {
    const hc2 = o.headColor;
    p.band(r, 0.6, o.head === 'bandana' ? 0.9 : 0.66, hc2);
    if (o.head === 'bandana') p.noiseDots(r, shade(hc2, 0.4), 500, 2, 0.6, (u, v) => (v > 0.6 && v < 0.9 ? 1 : 0));
  }
  if (o.head === 'balaclava' || o.head === 'mask') {
    const mc = o.headColor;
    const ctx = p.ctx;
    ctx.fillStyle = mc;
    if (o.head === 'balaclava') {
      ctx.fillRect(r.x, r.y, r.w, r.h);
      p.grain(r, mc, 0.15, 1.5);
      // eye slit
      p.band(r, eyeV - 0.03, eyeV + 0.03, sk, 0.42, 0.58);
      for (const s of [-1, 1]) {
        const u = 0.5 + s * eu;
        p.ellipse(r, u, eyeV, 0.018, 0.0085, '#e8e2d8', 1);
        p.ellipse(r, u, eyeV, 0.0085, 0.0085, o.eyes, 1);
      }
    } else {
      // lower face mask
      p.band(r, 0.12, 0.42, mc, 0.36, 0.64);
      p.line(r, [[0.36, 0.42], [0.64, 0.42]], shade(mc, -0.4), 2);
    }
  }
}

function drawHair(p: Painter, o: Outfit) {
  const r = rect('hair');
  const hc = o.hair;
  p.fill(r, hc);
  const ctx = p.ctx;
  for (let i = 0; i < 900; i++) {
    const u = p.rng.next();
    const v = p.rng.next();
    const [x, y] = p.px(r, u, v);
    ctx.strokeStyle = shade(hc, (p.rng.next() - 0.4) * 0.6);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (p.rng.next() - 0.5) * 3, y + 4 + p.rng.next() * 6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  p.vshade(r, [[0, '#000000', 0.45], [0.4, '#000000', 0.1], [1, '#ffffff', 0.05]]);
}

function drawGear(p: Painter, o: Outfit) {
  const r = rect('gear');
  let gc = o.headColor;
  if (o.head === 'none' || o.head === 'bandana' || o.head === 'headband' || o.head === 'mask' || o.head === 'balaclava') gc = o.extraColor;
  p.fill(r, gc);
  p.grain(r, gc, 0.15, 1.5);
  if (o.head === 'beanie') for (let v = 0.05; v < 0.3; v += 0.05) p.band(r, v, v + 0.015, shade(gc, -0.2));
  if (o.head === 'cap') p.ellipse(r, 0.5, 0.55, 0.06, 0.08, o.topColor2, 1);
  if (o.head === 'helmet') p.vshade(r, [[0, '#000000', 0.3], [1, '#ffffff', 0.25]]);
  if (o.head === 'hood') {
    // inner shadow at the opening (front)
    p.softSpot(r, 0.5, 0.25, 0.2, 0.3, '#000000', 0.7);
  }
  p.vshade(r, [[0, '#000000', 0.25], [1, '#000000', 0]]);
}

function drawHands(p: Painter, o: Outfit) {
  const r = rect('hand');
  if (o.hands === 'gloves') {
    p.fill(r, o.handColor);
    p.grain(r, o.handColor, 0.2, 2);
  } else {
    drawSkin(p, r, o.skin);
    p.ushade(r, 0.15, [0.5]);
    // knuckle marks
    for (let i = 0; i < 4; i++) p.ellipse(r, 0.3 + i * 0.13, 0.85, 0.04, 0.03, shade(o.skin, -0.2), 0.5);
    if (o.hands === 'wraps' || o.hands === 'fingerless') {
      const wc = o.hands === 'wraps' ? '#d8d2c4' : o.handColor;
      for (let v = 0; v < 0.7; v += 0.12) p.line(r, [[0, v], [1, v + 0.08]], wc, 7, 0.95);
      p.band(r, 0, 0.25, wc);
    }
  }
}

function drawFeet(p: Painter, o: Outfit) {
  const r = rect('foot');
  // u: 0 = sole (bottom), .5 = top; v: heel(0) -> toe(1)
  if (o.shoes === 'barefoot') {
    drawSkin(p, r, o.skin);
    p.band(r, 0, 1, shade(o.skin, -0.3), 0, 0.15);
    p.band(r, 0, 1, shade(o.skin, -0.3), 0.85, 1);
    return;
  }
  if (o.shoes === 'wraps') {
    drawSkin(p, r, o.skin);
    for (let v = 0.0; v < 0.6; v += 0.1) p.line(r, [[0, v], [1, v + 0.06]], '#d8d2c4', 6, 0.95);
    return;
  }
  const sc = o.shoeColor;
  p.fill(r, sc);
  p.grain(r, sc, 0.15, 1.5);
  const sole = o.shoes === 'boots' ? '#1a1612' : o.shoes === 'slippers' ? '#222222' : '#e8e4dc';
  p.band(r, 0, 1, sole, 0, 0.2);
  p.band(r, 0, 1, sole, 0.8, 1);
  if (o.shoes === 'sneakers') {
    p.band(r, 0.3, 0.75, '#f4f4f0', 0.44, 0.56);
    for (let v = 0.35; v < 0.7; v += 0.07) p.line(r, [[0.43, v], [0.57, v + 0.02]], '#888888', 1.5, 0.9);
    p.line(r, [[0.25, 0.1], [0.32, 0.5], [0.25, 0.85]], o.topColor2, 3, 0.9);
    p.line(r, [[0.75, 0.1], [0.68, 0.5], [0.75, 0.85]], o.topColor2, 3, 0.9);
  }
  if (o.shoes === 'boots') {
    for (let v = 0.1; v < 0.5; v += 0.08) p.line(r, [[0.44, v], [0.56, v + 0.02]], '#222222', 2);
  }
}

function drawNeck(p: Painter, o: Outfit) {
  const r = rect('neck');
  if (o.top === 'hoodie' || o.head === 'balaclava') {
    p.fill(r, o.head === 'balaclava' ? o.headColor : o.topColor);
    p.grain(r, o.topColor, 0.15, 1.2);
  } else {
    drawSkin(p, r, o.skin);
    p.vshade(r, [[0, '#000000', 0.3], [0.6, '#000000', 0.05], [1, '#000000', 0.2]]);
    if (o.facial === 'beard') p.vshade(r, [[0.5, o.hair, 0], [1, o.hair, 0.8]]);
  }
}

export const CHAR_TEX_SIZE = SIZE;

/** Paint an outfit into a canvas (SIZE x SIZE). */
export function paintCharacterCanvas(o: Outfit): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const p = new Painter(canvas, o.seed * 7919 + 13);
  p.fill({ x: 0, y: 0, w: SIZE, h: SIZE }, o.skin);
  drawTorso(p, o);
  drawArm(p, o);
  drawLeg(p, o);
  drawHead(p, o);
  drawHair(p, o);
  drawGear(p, o);
  drawHands(p, o);
  drawFeet(p, o);
  drawNeck(p, o);
  const ar = rect('acc');
  p.fill(ar, o.extraColor);
  p.grain(ar, o.extraColor, 0.2, 2);
  return canvas;
}

/** Build a texture array from canvases (rows flipped so v=0 is the bottom). */
export function buildTextureArray(canvases: HTMLCanvasElement[]): THREE.DataArrayTexture {
  const n = Math.max(1, canvases.length);
  const data = new Uint8Array(SIZE * SIZE * 4 * n);
  canvases.forEach((c, layer) => {
    const ctx = c.getContext('2d')!;
    const img = ctx.getImageData(0, 0, SIZE, SIZE).data;
    const base = layer * SIZE * SIZE * 4;
    for (let y = 0; y < SIZE; y++) {
      const src = (SIZE - 1 - y) * SIZE * 4;
      data.set(img.subarray(src, src + SIZE * 4), base + y * SIZE * 4);
    }
  });
  const tex = new THREE.DataArrayTexture(data, SIZE, SIZE, n);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
