import * as THREE from 'three';
import { REGION } from './bodyMesh';
import { Outfit, sleeveLength } from './outfit';
import { RNG } from '../core/math';
import { BodySpec, DEFAULT_BODY } from '../anim/skeleton';
import { BOOT_TOP, femFrontU, JACKET_HEM, jacketEase, jacketOpen, lapelWidth, necklineY, SKIRT_TEX_V, torsoV, torsoY } from './femMesh';

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
    case 'uniform': {
      // a security uniform: button placket, breast pockets, a gold badge, a name tag, a shoulder patch
      const dark = shade(o.topColor, -0.35);
      p.line(r, [[0.5, v0], [0.5, 0.97]], dark, 2.5, 0.9);
      for (let v = v0 + 0.06; v < 0.95; v += 0.1) p.ellipse(r, 0.505, v, 0.006, 0.008, '#c8c8c0', 1);
      for (const u of [0.4, 0.6]) {
        p.band(r, 0.66, 0.78, shade(o.topColor, -0.12), u - 0.05, u + 0.05);
        p.line(r, [[u - 0.05, 0.78], [u + 0.05, 0.78]], dark, 2, 0.9);
      }
      // the badge: a gold shield over the left breast
      const [bx, by] = p.px(r, 0.6, 0.8);
      ctx.fillStyle = '#d8b040';
      ctx.beginPath();
      ctx.moveTo(bx - 6, by - 7);
      ctx.lineTo(bx + 6, by - 7);
      ctx.lineTo(bx + 6, by + 1);
      ctx.lineTo(bx, by + 8);
      ctx.lineTo(bx - 6, by + 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7a5a10';
      ctx.fillRect(bx - 2, by - 3, 4, 4);
      // name tag
      p.band(r, 0.82, 0.86, '#e8e8e0', 0.33, 0.45);
      // shoulder patches (sides)
      p.ellipse(r, 0.25, 0.86, 0.025, 0.04, c2, 1);
      p.ellipse(r, 0.75, 0.86, 0.025, 0.04, c2, 1);
      break;
    }
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
    if (top === 'coat') {
      // a lab coat: open over a shirt and tie, lapels, pockets, a pen, a badge on a clip
      p.band(r, beltV, 0.98, o.topColor2, 0.44, 0.56);
      p.line(r, [[0.5, 0.95], [0.5, 0.62]], '#2a3a5a', 4, 0.9);
      const lap = shade(tc, -0.12);
      p.line(r, [[0.42, 1.0], [0.44, 0.7], [0.44, beltV]], lap, 5);
      p.line(r, [[0.58, 1.0], [0.56, 0.7], [0.56, beltV]], lap, 5);
      p.line(r, [[0.44, 0.7], [0.4, 0.82]], shade(tc, -0.25), 2);
      p.line(r, [[0.56, 0.7], [0.6, 0.82]], shade(tc, -0.25), 2);
      for (const u of [0.36, 0.64]) {
        p.band(r, 0.34, 0.44, shade(tc, -0.08), u - 0.06, u + 0.06);
        p.line(r, [[u - 0.06, 0.44], [u + 0.06, 0.44]], shade(tc, -0.3), 1.5);
      }
      p.band(r, 0.7, 0.78, shade(tc, -0.08), 0.6, 0.68);
      p.line(r, [[0.63, 0.78], [0.63, 0.84]], '#1a3a8a', 2.5);
      p.band(r, 0.6, 0.66, '#e8e8f0', 0.37, 0.43);
      p.band(r, 0.63, 0.66, '#3a6ac8', 0.37, 0.43);
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

/** Stitching: a dashed light line. */
function stitch(p: Painter, r: Rect, pts: [number, number][], color: string, width = 1, alpha = 0.55) {
  p.ctx.setLineDash([2.5, 2]);
  p.line(r, pts, color, width, alpha);
  p.ctx.setLineDash([]);
}
/** A zipper: a metal strip with teeth. */
function zipper(p: Painter, r: Rect, pts: [number, number][], width = 2.6) {
  p.line(r, pts, '#2a2a2c', width + 1.2, 1);
  p.line(r, pts, '#b8b8bc', width, 1);
  p.ctx.setLineDash([1, 1.4]);
  p.line(r, pts, '#4a4a4e', width * 0.7, 1);
  p.ctx.setLineDash([]);
}

/**
 * A woman's torso, outfitted: a pleated tartan mini skirt (also under the skirt's own mesh), a
 * fitted top with a scoop neckline under an open leather biker jacket - belt at the hem, zips,
 * seams, epaulettes, a stitched lapel with a snap.
 */
function drawFemTorso(p: Painter, o: Outfit, spec: BodySpec) {
  const r = rect('torso');
  const ctx = p.ctx;
  const vSk = SKIRT_TEX_V;
  const vHem = torsoV(JACKET_HEM);
  // ---------------- skirt: black stretch fabric, a seam and a short zip up the back
  const sc = o.bottomColor;
  p.band(r, 0, vSk + 0.006, sc);
  p.grain({ ...r, y: r.y + r.h * (1 - vSk), h: r.h * vSk }, sc, 0.08, 1.3);
  p.noiseDots({ ...r, y: r.y + r.h * (1 - vSk), h: r.h * vSk }, shade(sc, 0.5), 700, 1, 0.08);
  // pulled taut over the hips: soft highlights on the curves, fine stretch creases at the sides
  for (const u of [0.18, 0.32, 0.68, 0.82]) p.softSpot(r, u, vSk * 0.62, 0.05, vSk * 0.3, shade(sc, 0.45), 0.13);
  for (const u of [0.25, 0.75]) {
    for (let i = 0; i < 5; i++) {
      const v = vSk * (0.45 + i * 0.08);
      p.line(r, [[u - 0.035, v - 0.006], [u, v], [u + 0.035, v - 0.006]], shade(sc, 0.35), 1.1, 0.16);
    }
  }
  for (const u of [0, 1]) {
    p.line(r, [[u, 0], [u, vSk]], shade(sc, -0.5), 1.4, 0.9);
    zipper(p, r, [[u, vSk * 0.62], [u, vSk - 0.01]], 2);
  }
  p.band(r, vSk - 0.026, vSk + 0.006, shade(sc, 0.06));
  stitch(p, r, [[0, vSk - 0.024], [1, vSk - 0.024]], shade(sc, 0.4), 1, 0.35);
  stitch(p, r, [[0, 0.012], [1, 0.012]], shade(sc, 0.4), 1, 0.35);
  p.band(r, 0, 0.006, shade(sc, -0.3));
  // ---------------- the top
  const tc = o.topColor2;
  p.band(r, vHem - 0.004, 1, tc);
  p.grain({ ...r, h: r.h * (1 - vHem) }, tc, 0.1, 1.3);
  // stretched under the bust, bunched where it tucks into the skirt
  for (let i = 0; i < 5; i++) p.line(r, [[0.45 + i * 0.02, torsoV(0.255)], [0.46 + i * 0.02, torsoV(0.265)]], shade(tc, -0.35), 1.2, 0.35);
  for (let i = 0; i < 6; i++) p.line(r, [[0.44 + i * 0.022, torsoV(0.1)], [0.445 + i * 0.022, torsoV(0.13)]], shade(tc, -0.3), 1.2, 0.4);
  p.softSpot(r, 0.5, torsoV(0.33), 0.03, 0.05, shade(tc, 0.18), 0.25);
  // skin above the scoop neckline
  {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 24; i++) {
      const xu = -0.12 + (0.24 * i) / 24;
      const y = Math.min(0.56, necklineY(xu));
      pts.push([femFrontU(spec, y, xu), torsoV(y)]);
    }
    ctx.fillStyle = o.skin;
    ctx.beginPath();
    pts.forEach(([u, v], i) => {
      const [x, y] = p.px(r, u, v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    const [xe, ye] = p.px(r, pts[pts.length - 1][0], 1.02);
    const [xs, ys] = p.px(r, pts[0][0], 1.02);
    ctx.lineTo(xe, ye);
    ctx.lineTo(xs, ys);
    ctx.closePath();
    ctx.fill();
    // the hem of the neckline, the cleavage, the collarbones
    p.line(r, pts, shade(tc, -0.4), 1.6, 0.8);
    p.softSpot(r, 0.5, torsoV(0.418), 0.008, 0.035, shade(o.skin, -0.45), 0.6);
    p.softSpot(r, 0.5, torsoV(0.44), 0.05, 0.03, shade(o.skin, 0.12), 0.25);
    for (const sd of [-1, 1]) p.line(r, [[0.5 + sd * 0.012, torsoV(0.5)], [0.5 + sd * 0.04, torsoV(0.508)], [0.5 + sd * 0.075, torsoV(0.5)]], shade(o.skin, -0.3), 1.4, 0.35);
  }
  if (o.top !== 'leather') return;
  // ---------------- the jacket over it (painted everywhere its panels can show)
  const lc = o.topColor;
  const uEdge = (y: number) => femFrontU(spec, y, jacketOpen(y), jacketEase(y)) - 0.5;
  const steps = 60;
  for (const sd of [-1, 1]) {
    ctx.fillStyle = lc;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const v = lerpN(vHem - 0.002, 1.0, i / steps);
      const y = torsoY(v);
      const ue = y <= 0.5 ? uEdge(y) : femFrontU(spec, y, 0.05 - (0.008 * (y - 0.5)) / 0.065, 0.013) - 0.5;
      const [x, yy] = p.px(r, 0.5 + sd * (ue - 0.0015), v);
      if (i === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    const far = sd > 0 ? 1.0 : 0.0;
    let [x, yy] = p.px(r, far, 1.0);
    ctx.lineTo(x, yy);
    [x, yy] = p.px(r, far, vHem - 0.002);
    ctx.lineTo(x, yy);
    ctx.closePath();
    ctx.fill();
  }
  // the jacket's shadow on the top along its edges
  for (const sd of [-1, 1]) {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 20; i++) {
      const y = lerpN(JACKET_HEM, 0.5, i / 20);
      pts.push([0.5 + sd * (uEdge(y) - 0.006), torsoV(y)]);
    }
    p.line(r, pts, '#000000', 5, 0.35);
  }
  // leather: mottled, worn lighter at the shoulders
  const jr = { ...r, h: r.h * (1 - vHem) };
  p.noiseDots(jr, shade(lc, 0.5), Math.floor(jr.w * jr.h * 0.03), 1, 0.12);
  p.noiseDots(jr, shade(lc, -0.5), Math.floor(jr.w * jr.h * 0.02), 1, 0.2);
  for (let i = 0; i < 14; i++) {
    const u = p.rng.next(), v = lerpN(vHem + 0.05, 0.95, p.rng.next());
    if (Math.abs(u - 0.5) < 0.09) continue;
    p.softSpot(r, u, v, 0.05 + p.rng.next() * 0.05, 0.04, shade(lc, 0.35), 0.1);
  }
  for (const u of [0.25, 0.75]) p.softSpot(r, u, torsoV(0.47), 0.06, 0.05, shade(lc, 0.5), 0.14);
  // seams: the sides, the back panels, the yoke across the shoulder blades
  const seam = shade(lc, -0.6), thread = shade(lc, 0.55);
  for (const u of [0.25, 0.75, 0.1, 0.9]) {
    const top = u === 0.1 || u === 0.9 ? torsoV(0.43) : 0.92;
    p.line(r, [[u, vHem], [u, top]], seam, 1.6, 0.9);
    stitch(p, r, [[u + 0.007, vHem], [u + 0.007, top]], thread, 1, 0.45);
  }
  const yoke: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const u = -0.16 + (0.32 * i) / 12;
    yoke.push([u, torsoV(0.43) - 0.012 * Math.cos((u / 0.16) * (Math.PI / 2))]);
  }
  for (const off of [0, 1]) {
    p.line(r, yoke.map(([u, v]) => [u + off, v] as [number, number]), seam, 1.6, 0.9);
    stitch(p, r, yoke.map(([u, v]) => [u + off, v - 0.012] as [number, number]), thread, 1, 0.45);
  }
  // waist belt round the hem with a buckle on her left front
  const vB = torsoV(0.128);
  p.band(r, vHem - 0.002, vB, shade(lc, 0.08));
  stitch(p, r, [[0, vB - 0.006], [1, vB - 0.006]], thread, 1, 0.5);
  stitch(p, r, [[0, vHem + 0.006], [1, vHem + 0.006]], thread, 1, 0.5);
  for (const u of [0.0, 0.25, 0.75, 1.0]) p.band(r, vHem - 0.002, vB + 0.006, shade(lc, -0.25), u - 0.008, u + 0.008);
  const bu = 0.5 + uEdge(JACKET_HEM + 0.02) + 0.035;
  p.band(r, vHem + 0.004, vB - 0.004, '#b4b4b8', bu - 0.016, bu + 0.016);
  p.band(r, vHem + 0.011, vB - 0.011, lc, bu - 0.01, bu + 0.01);
  // zips: the main one along her left panel's edge, a slanted chest pocket, a slash pocket
  {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 20; i++) {
      const y = lerpN(JACKET_HEM + 0.01, 0.49, i / 20);
      pts.push([0.5 + uEdge(y) + 0.006, torsoV(y)]);
    }
    zipper(p, r, pts, 2.2);
    const cu = 0.5 + uEdge(0.36) + 0.02;
    zipper(p, r, [[cu, torsoV(0.33)], [cu + 0.035, torsoV(0.395)]], 2.2);
    p.band(r, torsoV(0.395) - 0.012, torsoV(0.395) + 0.004, '#c0c0c4', cu + 0.031, cu + 0.04);
    const pu = 0.5 - uEdge(0.17) - 0.018;
    zipper(p, r, [[pu, torsoV(0.15)], [pu - 0.045, torsoV(0.205)]], 2.2);
  }
  // epaulettes with snaps
  for (const u of [0.25, 0.75]) {
    p.band(r, torsoV(0.445), 1, shade(lc, 0.1), u - 0.014, u + 0.014);
    p.line(r, [[u - 0.014, torsoV(0.445)], [u - 0.014, 1]], seam, 1.2, 0.9);
    p.line(r, [[u + 0.014, torsoV(0.445)], [u + 0.014, 1]], seam, 1.2, 0.9);
    p.ellipse(r, u, torsoV(0.53), 0.007, 0.01, '#c4c4c8', 1);
  }
  // the lapels: a stitched outline, a snap at each point
  for (const sd of [-1, 1]) {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 18; i++) {
      const y = lerpN(0.29, 0.475, i / 18);
      const w = lapelWidth(y);
      if (w < 0.006) continue;
      pts.push([femFrontU(spec, y, sd * (jacketOpen(y) + w - 0.005), jacketEase(y) + 0.0042), torsoV(y)]);
    }
    stitch(p, r, pts, thread, 1, 0.55);
    const yt = 0.41;
    p.ellipse(r, femFrontU(spec, yt, sd * (jacketOpen(yt) + lapelWidth(yt) * 0.75), jacketEase(yt) + 0.0042), torsoV(yt), 0.007, 0.011, '#c4c4c8', 1);
  }
  // creases at the waist
  for (let i = 0; i < 10; i++) {
    const u = 0.1 + p.rng.next() * 0.8;
    if (Math.abs(u - 0.5) < 0.12) continue;
    const v = torsoV(0.15 + p.rng.next() * 0.06);
    p.line(r, [[u - 0.03, v], [u, v + 0.006], [u + 0.03, v]], shade(lc, 0.4), 1.2, 0.18);
  }
  p.ushade(r, 0.12);
}

/** Leather sleeves: a seam at the shoulder, creases at the elbow, a zipped cuff. */
function drawFemArm(p: Painter, o: Outfit) {
  const r = rect('arm');
  drawSkin(p, r, o.skin);
  p.ushade(r, 0.15, [0.5]);
  if (o.top !== 'leather') return;
  const lc = o.topColor;
  const vEnd = (sleeveLength(o.top) + 0.12) / 1.12;
  p.band(r, 0, vEnd, lc);
  const sr = { ...r, y: r.y + r.h * (1 - vEnd), h: r.h * vEnd };
  p.noiseDots(sr, shade(lc, 0.5), Math.floor(sr.w * sr.h * 0.03), 1, 0.12);
  p.noiseDots(sr, shade(lc, -0.5), Math.floor(sr.w * sr.h * 0.02), 1, 0.2);
  const thread = shade(lc, 0.55);
  p.line(r, [[0, 0.12], [1, 0.12]], shade(lc, -0.6), 1.5, 0.9);
  stitch(p, r, [[0, 0.135], [1, 0.135]], thread, 1, 0.45);
  // the elbow: bunched creases inside, stretched shine outside
  for (let i = 0; i < 6; i++) {
    const v = 0.5 + (i - 2.5) * 0.022;
    p.line(r, [[0.35, v], [0.5, v + 0.008], [0.65, v]], shade(lc, 0.45), 1.3, 0.22);
  }
  p.softSpot(r, 0.0, 0.53, 0.08, 0.06, shade(lc, 0.5), 0.18);
  p.softSpot(r, 1.0, 0.53, 0.08, 0.06, shade(lc, 0.5), 0.18);
  // cuff: a band and a short zip on the back of the wrist
  p.band(r, vEnd - 0.05, vEnd, shade(lc, 0.08));
  stitch(p, r, [[0, vEnd - 0.05], [1, vEnd - 0.05]], thread, 1, 0.5);
  zipper(p, r, [[0.02, vEnd - 0.12], [0.02, vEnd]], 2.2);
  zipper(p, r, [[0.98, vEnd - 0.12], [0.98, vEnd]], 2.2);
  p.band(r, vEnd - 0.004, vEnd, '#050505');
}

/** Sheer black tights to just under the knee, then glossy knee boots: a rolled lip, a back zip. */
function drawFemLeg(p: Painter, o: Outfit) {
  const r = rect('leg');
  const ctx = p.ctx;
  const legw = o.legwear ?? null;
  const tc = legw ? mix(o.skin, legw, 0.8) : o.skin;
  p.fill(r, tc);
  if (legw) {
    // the knit: fine noise, a faint grid, a reinforced top under the skirt
    p.noiseDots(r, shade(tc, -0.35), Math.floor(r.w * r.h * 0.06), 1, 0.12);
    p.noiseDots(r, shade(tc, 0.25), Math.floor(r.w * r.h * 0.02), 1, 0.08);
    p.band(r, 0, 0.09, shade(legw, 0.05));
    p.vshade(r, [[0.09, '#000000', 0.25], [0.14, '#000000', 0.0], [1, '#000000', 0]]);
    ctx.globalAlpha = 0.07;
    for (let u = 0; u < 1; u += 0.02) p.band(r, 0, 1, '#000000', u, u + 0.005);
    ctx.globalAlpha = 1;
  } else drawSkin(p, r, o.skin);
  p.ushade(r, 0.12, [0.5]);
  if (o.shoes !== 'kneeboots') return;
  const bc = o.shoeColor;
  const vb = (BOOT_TOP + 0.1) / 1.14;
  p.band(r, vb - 0.004, 1, bc);
  const br = { ...r, h: r.h * (1 - vb) };
  p.noiseDots(br, shade(bc, 0.6), Math.floor(br.w * br.h * 0.02), 1, 0.1);
  // the lip: the leather rolled over, stitched under it
  p.band(r, vb - 0.004, vb + 0.004, shade(bc, -0.4));
  stitch(p, r, [[0, vb + 0.034], [1, vb + 0.034]], shade(bc, 0.5), 1, 0.4);
  // a zip up the back of the calf, a seam down each side
  zipper(p, r, [[0.004, vb + 0.03], [0.004, 0.985]], 2.2);
  zipper(p, r, [[0.996, vb + 0.03], [0.996, 0.985]], 2.2);
  p.band(r, vb + 0.03, vb + 0.055, '#c4c4c8', 0.0, 0.016);
  for (const u of [0.25, 0.75]) p.line(r, [[u, vb + 0.03], [u, 1]], shade(bc, -0.6), 1.3, 0.8);
  // painted reflections down the front of the shaft
  for (const u of [0.43, 0.57]) p.softSpot(r, u, 0.76, 0.02, 0.17, shade(bc, 0.8), 0.18);
  p.vshade(r, [[0, '#000000', 0.0], [0.94, '#000000', 0.0], [1, '#000000', 0.2]]);
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
  if (o.top === 'coat') {
    // the coat's skirts hang to the knee
    const tc = o.topColor;
    p.band(r, 0.5, 1.0, tc);
    p.grain({ ...r, h: r.h * 0.5 }, tc, 0.08, 1.2);
    p.band(r, 0.5, 0.53, shade(tc, -0.2));
    p.line(r, [[0.5, 0.53], [0.5, 1.0]], shade(tc, -0.3), 2, 0.6);
  }
  p.vshade(r, [[0, '#000000', 0.0], [0.9, '#000000', 0.0], [1, '#000000', 0.25]]);
  p.ushade(r, 0.2, [0.5]);
}

function drawHead(p: Painter, o: Outfit, r: Rect = rect('head'), res = 1) {
  const sk = o.skin;
  const n2 = res * res;
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
  if (res > 1) {
    // more modelling where there are pixels for it: the nasolabial folds, the philtrum, the jaw
    for (const s of [-1, 1]) p.line(r, [[0.5 + s * 0.022, 0.34], [0.5 + s * 0.036, 0.3], [0.5 + s * 0.04, 0.27]], shade(sk, -0.3), 1.6 * res, 0.25);
    p.line(r, [[0.494, 0.335], [0.495, 0.29]], shade(sk, -0.2), 1.2 * res, 0.3);
    p.line(r, [[0.506, 0.335], [0.505, 0.29]], shade(sk, -0.2), 1.2 * res, 0.3);
    p.softSpot(r, 0.5, 0.17, 0.09, 0.05, shade(sk, -0.25), 0.25);
  }
  // mouth
  const lip = mix(sk, '#7a3030', 0.35);
  p.ellipse(r, 0.5, 0.268, 0.032, 0.011, lip, 0.9);
  p.line(r, [[0.468, 0.27], [0.5, 0.266], [0.532, 0.27]], shade(sk, -0.65), 1.6 * res, 0.95);
  p.softSpot(r, 0.5, 0.235, 0.03, 0.015, dark, 0.3);
  // facial hair
  const hairC = o.hair;
  if (o.facial === 'stubble' || o.facial === 'beard' || o.facial === 'goatee') {
    const dens = o.facial === 'beard' ? 1 : o.facial === 'goatee' ? 0.9 : 0.55;
    p.noiseDots(r, hairC, 2600 * n2, res, 0.55 * dens, (u, v) => {
      const du = Math.abs(u - 0.5);
      if (o.facial === 'goatee') return du < 0.035 && v < 0.29 && v > 0.13 ? 1 : 0;
      const jaw = v < 0.36 && du < 0.15 ? 1 : 0;
      const lipGap = Math.abs(v - 0.268) < 0.012 && du < 0.03 ? 0 : 1;
      return jaw * lipGap * (v > 0.05 ? 1 : 0);
    });
    if (o.facial === 'beard') p.softSpot(r, 0.5, 0.18, 0.12, 0.12, hairC, 0.6);
  }
  if (o.facial === 'mustache') {
    p.line(r, [[0.47, 0.285], [0.5, 0.295], [0.53, 0.285]], hairC, 3.5 * res, 0.9);
  }
  // eyes
  for (const s of [-1, 1]) {
    const u = 0.5 + s * eu;
    p.ellipse(r, u, eyeV, 0.023, 0.011, '#e8e2d8', 1);
    p.ellipse(r, u + s * 0.002, eyeV, 0.011, 0.011, o.eyes, 1);
    if (res > 1) p.ellipse(r, u + s * 0.002, eyeV, 0.0075, 0.0075, shade(o.eyes, 0.25), 0.6);
    p.ellipse(r, u + s * 0.002, eyeV, 0.005, 0.005, '#050505', 1);
    if (res > 1) p.ellipse(r, u + s * 0.002 - 0.003, eyeV + 0.003, 0.002, 0.002, '#ffffff', 0.85);
    // upper lid line
    p.line(r, [[u - 0.025, eyeV + 0.002], [u, eyeV + 0.014], [u + 0.025, eyeV + 0.004]], shade(sk, -0.7), 2.2 * res, 0.95);
    // brow
    const bAng = o.brow * 0.012;
    p.line(r, [[u - s * 0.03, eyeV + 0.042 + bAng], [u + s * 0.004, eyeV + 0.04], [u + s * 0.03, eyeV + 0.034 - bAng * 0.4]].map(([a, b]) => [a, b] as [number, number]), hairC, 3.2 * res, 0.85);
  }
  // scar
  if (o.scar) p.line(r, [[0.555, 0.56], [0.575, 0.47], [0.585, 0.4]], mix(sk, '#ffb0a0', 0.4), 2 * res, 0.9);
  drawScalp(p, o, r, res);
  if (o.head === 'bandana' || o.head === 'headband') {
    const hc2 = o.headColor;
    p.band(r, 0.6, o.head === 'bandana' ? 0.9 : 0.66, hc2);
    if (o.head === 'bandana') p.noiseDots(r, shade(hc2, 0.4), 500 * n2, 2 * res, 0.6, (u, v) => (v > 0.6 && v < 0.9 ? 1 : 0));
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
      p.line(r, [[0.36, 0.42], [0.64, 0.42]], shade(mc, -0.4), 2 * res);
    }
  }
}

/** Hairline / buzz cut painted on the scalp (also under the hair shells). */
function drawScalp(p: Painter, o: Outfit, r: Rect, res: number) {
  if (o.hairStyle === 'bald') return;
  const ctx = p.ctx;
  const hc = o.hair;
  // scalp region: v > 0.68 (front) and lower at back
  for (let i = 0; i <= 64; i++) {
    const u = i / 64;
    const front = Math.max(0, Math.cos((u - 0.5) * Math.PI * 2)); // 1 at front, 0 at sides
    const vLine = (o.hairStyle === 'longwave' ? 0.84 : 0.8) - (1 - front) * 0.3;
    ctx.fillStyle = hc;
    const [x, y] = p.px(r, u, 1);
    const [, y2] = p.px(r, u, vLine);
    ctx.globalAlpha = o.hairStyle === 'buzz' ? 0.85 : 1;
    ctx.fillRect(x - 3 * res, y, 7 * res, y2 - y);
  }
  ctx.globalAlpha = 1;
  p.noiseDots(r, shade(hc, 0.25), 1500 * res * res, res, 0.3, (u, v) => (v > 0.7 ? 1 : 0));
}

/** A woman's made-up face: almond eyes with liner and lashes, arched brows, red lips, blush, freckles. */
function drawFemFace(p: Painter, o: Outfit, r: Rect, res: number) {
  const sk = o.skin;
  const mk = o.makeup ?? { lips: '#9a2a30', liner: 0.6, blush: 0.4, freckles: 0, shadow: '#7a5a50' };
  const ctx = p.ctx;
  const n2 = res * res;
  drawSkin(p, r, sk);
  p.noiseDots(r, shade(sk, 0.12), Math.floor(r.w * r.h * 0.004), 1, 0.06);
  p.ushade(r, 0.15, [0.5]);
  const eyeV = 0.505, eu = 0.066;
  // structure: a highlight down the nose, under-cheekbone shading, highlights on the cheekbones
  p.softSpot(r, 0.5, 0.42, 0.012, 0.075, shade(sk, 0.2), 0.32);
  p.softSpot(r, 0.5, 0.345, 0.032, 0.014, shade(sk, -0.35), 0.45);
  for (const sd of [-1, 1]) p.softSpot(r, 0.5 + sd * 0.017, 0.4, 0.008, 0.05, shade(sk, -0.25), 0.16);
  p.softSpot(r, 0.5, 0.365, 0.011, 0.01, shade(sk, 0.22), 0.35);
  for (const s of [-1, 1]) {
    p.softSpot(r, 0.5 + s * 0.11, 0.37, 0.05, 0.05, shade(sk, -0.2), 0.1);
    p.softSpot(r, 0.5 + s * 0.088, 0.445, 0.04, 0.025, shade(sk, 0.18), 0.3);
    p.softSpot(r, 0.5 + s * 0.092, 0.405, 0.045, 0.035, '#e0707a', 0.3 * mk.blush);
    // the eye socket under the brow, the lid
    p.softSpot(r, 0.5 + s * eu, eyeV + 0.004, 0.036, 0.026, shade(sk, -0.28), 0.2);
    p.softSpot(r, 0.5 + s * (eu + 0.004), eyeV + 0.012, 0.034, 0.02, mk.shadow, 0.75);
    p.softSpot(r, 0.5 + s * (eu + 0.02), eyeV + 0.006, 0.022, 0.016, shade(mk.shadow, -0.5), 0.6);
    p.softSpot(r, 0.5 + s * (eu + 0.006), eyeV - 0.012, 0.026, 0.008, shade(mk.shadow, -0.3), 0.35);
    // nostrils
    p.ellipse(r, 0.5 + s * 0.0095, 0.351, 0.0048, 0.0032, shade(sk, -0.55), 0.75, s * 0.4);
  }
  // the jaw and chin
  p.softSpot(r, 0.5, 0.17, 0.08, 0.04, shade(sk, -0.18), 0.12);
  p.softSpot(r, 0.5, 0.215, 0.022, 0.014, shade(sk, 0.15), 0.25);
  // freckles over the nose and cheeks
  if (mk.freckles > 0) {
    p.noiseDots(r, '#a8603e', 1400 * n2, 1.1 * res, 0.42 * mk.freckles, (u, v) => {
      const du = Math.abs(u - 0.5);
      const band = Math.exp(-(((v - 0.42) / 0.05) ** 2)) * (du < 0.14 ? 1 : 0) * (du > 0.012 || v > 0.38 ? 1 : 0.5);
      return band * (Math.abs(v - eyeV) > 0.025 ? 1 : 0);
    });
    p.noiseDots(r, '#c07850', 500 * n2, 0.8 * res, 0.3 * mk.freckles, (u, v) => (Math.abs(u - 0.5) < 0.16 && v > 0.3 && v < 0.47 ? 1 : 0));
  }
  // lips: a cupid's bow over a full lower lip
  {
    const P = (u: number, v: number) => p.px(r, u, v);
    const lc = mk.lips;
    ctx.fillStyle = lc;
    ctx.beginPath();
    let [x, y] = P(0.457, 0.268);
    ctx.moveTo(x, y);
    let c1 = P(0.472, 0.278), c2 = P(0.484, 0.29);
    [x, y] = P(0.4915, 0.2895);
    ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], x, y);
    [x, y] = P(0.5, 0.2835);
    ctx.lineTo(x, y);
    [x, y] = P(0.5085, 0.2895);
    ctx.lineTo(x, y);
    c1 = P(0.516, 0.29); c2 = P(0.528, 0.278);
    [x, y] = P(0.543, 0.268);
    ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], x, y);
    c1 = P(0.532, 0.25); c2 = P(0.515, 0.24);
    [x, y] = P(0.5, 0.2395);
    ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], x, y);
    c1 = P(0.485, 0.24); c2 = P(0.468, 0.25);
    [x, y] = P(0.457, 0.268);
    ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], x, y);
    ctx.fill();
    // shading: darker upper lip, the parting, a highlight on the lower lip
    p.softSpot(r, 0.5, 0.279, 0.034, 0.008, shade(lc, -0.2), 0.3);
    p.line(r, [[0.459, 0.268], [0.482, 0.2662], [0.5, 0.2678], [0.518, 0.2662], [0.541, 0.268]], shade(lc, -0.55), 1.1 * res, 0.8);
    p.softSpot(r, 0.504, 0.2525, 0.014, 0.0055, shade(lc, 0.5), 0.6);
    p.softSpot(r, 0.5, 0.234, 0.03, 0.008, shade(sk, -0.3), 0.3);
    // the philtrum above
    p.softSpot(r, 0.5, 0.305, 0.006, 0.014, shade(sk, -0.15), 0.35);
  }
  // eyes: almond, lifted at the outer corner
  for (const s of [-1, 1]) {
    const c = 0.5 + s * eu;
    const inner = 0.5 + s * (eu - 0.025), outer = 0.5 + s * (eu + 0.026);
    const P = (u: number, v: number) => p.px(r, u, v);
    const almond = () => {
      ctx.beginPath();
      let [x, y] = P(inner, eyeV - 0.001);
      ctx.moveTo(x, y);
      let c1 = P(c - s * 0.012, eyeV + 0.0135), c2 = P(c + s * 0.012, eyeV + 0.0145);
      [x, y] = P(outer, eyeV + 0.0045);
      ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], x, y);
      c1 = P(c + s * 0.012, eyeV - 0.0095); c2 = P(c - s * 0.012, eyeV - 0.009);
      [x, y] = P(inner, eyeV - 0.001);
      ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], x, y);
    };
    ctx.save();
    almond();
    ctx.fillStyle = '#ece4dc';
    ctx.fill();
    ctx.clip();
    // the iris: a dark limbal ring, the colour lighter round the pupil, flecks
    const ic = o.eyes;
    p.ellipse(r, c + s * 0.0015, eyeV + 0.0015, 0.0112, 0.0158, shade(ic, -0.55), 1);
    p.ellipse(r, c + s * 0.0015, eyeV + 0.0015, 0.0094, 0.0132, ic, 1);
    p.ellipse(r, c + s * 0.0015, eyeV + 0.0015, 0.0056, 0.0079, shade(ic, 0.3), 0.7);
    p.noiseDots(r, shade(ic, 0.45), 60 * n2, res, 0.5, (u, v) => (Math.hypot((u - c) / 0.0094, (v - eyeV) / 0.0132) < 1 ? 1 : 0));
    p.ellipse(r, c + s * 0.0015, eyeV + 0.0015, 0.0042, 0.006, '#040404', 1);
    // the lid's shadow over the top of the eye
    p.softSpot(r, c, eyeV + 0.012, 0.03, 0.008, '#3a2420', 0.55);
    ctx.restore();
    p.ellipse(r, c + s * 0.0015 - 0.0035, eyeV + 0.0055, 0.0022, 0.003, '#ffffff', 0.9);
    // liner along the upper lash line, flicked into a wing
    const lw = (1.4 + 1.6 * mk.liner) * res;
    p.line(r, [[inner, eyeV], [c - s * 0.012, eyeV + 0.012], [c + s * 0.008, eyeV + 0.0135], [outer, eyeV + 0.005], [outer + s * 0.011, eyeV + 0.0125]], '#0c0808', lw, 0.95);
    p.line(r, [[c + s * 0.012, eyeV + 0.0115], [outer + s * 0.008, eyeV + 0.0105]], '#0c0808', lw * 0.8, 0.9);
    // lower lash line, softer
    p.line(r, [[c - s * 0.006, eyeV - 0.0088], [c + s * 0.014, eyeV - 0.0068], [outer, eyeV + 0.003]], '#3a2622', 1.1 * res, 0.75);
    // lashes
    for (let i = 0; i < 9; i++) {
      const t = 0.15 + i * 0.1;
      const lu = lerpN(inner, outer, t), lv = eyeV + 0.003 + Math.sin(Math.PI * t) * 0.011;
      const len = 0.004 + t * 0.005;
      p.line(r, [[lu, lv], [lu + s * len * 0.6, lv + len * 1.3]], '#080606', 0.9 * res, 0.85);
    }
    // the crease above the lid
    p.line(r, [[inner + s * 0.004, eyeV + 0.012], [c, eyeV + 0.0245], [outer - s * 0.002, eyeV + 0.016]], shade(sk, -0.4), 1.2 * res, 0.35);
    // brows: a slim lifted arch, darker than her hair
    const bc = shade(o.hair, -0.42);
    const b0: [number, number] = [0.5 + s * 0.031, eyeV + 0.034], b1: [number, number] = [0.5 + s * 0.072, eyeV + 0.048], b2: [number, number] = [0.5 + s * 0.094, eyeV + 0.036];
    p.line(r, [b0, [lerpN(b0[0], b1[0], 0.5), (b0[1] + b1[1]) / 2 + 0.002], b1, b2], bc, 3.1 * res, 0.88);
    p.line(r, [b0, [lerpN(b0[0], b1[0], 0.5), (b0[1] + b1[1]) / 2 + 0.0035]], bc, 3.4 * res, 0.55);
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const bu = t < 0.65 ? lerpN(b0[0], b1[0], t / 0.65) : lerpN(b1[0], b2[0], (t - 0.65) / 0.35);
      const bv = t < 0.65 ? lerpN(b0[1], b1[1], t / 0.65) : lerpN(b1[1], b2[1], (t - 0.65) / 0.35);
      p.line(r, [[bu, bv - 0.003], [bu + s * 0.006, bv + 0.002]], bc, 0.8 * res, 0.6);
    }
  }
  drawScalp(p, o, r, res);
}
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

function drawHair(p: Painter, o: Outfit) {
  const r = rect('hair');
  const hc = o.hair;
  p.fill(r, hc);
  const ctx = p.ctx;
  if (o.hairStyle === 'longwave') {
    // long strands down the length, waving bands of light, darker underneath and at the roots
    ctx.lineCap = 'round';
    for (let i = 0; i < 1600; i++) {
      const u = p.rng.next();
      const v = p.rng.next();
      const [x, y] = p.px(r, u, v);
      const f = (p.rng.next() - 0.45) * 0.7;
      ctx.strokeStyle = f > 0.2 ? mix(hc, '#e8844a', f) : shade(hc, f);
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 0.6 + p.rng.next() * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const len = 8 + p.rng.next() * 18;
      ctx.quadraticCurveTo(x + (p.rng.next() - 0.5) * 4, y + len * 0.5, x + (p.rng.next() - 0.5) * 3, y + len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // highlights riding the waves
    for (let k = 0; k < 7; k++) {
      const v0 = 0.08 + k * 0.08;
      const pts: [number, number][] = [];
      for (let i = 0; i <= 24; i++) pts.push([i / 24, v0 + 0.018 * Math.sin(i * 1.7 + k)]);
      p.line(r, pts, '#f09a5a', 3, 0.16);
      p.line(r, pts.map(([u, v]) => [u, v - 0.02] as [number, number]), '#3a0c04', 3, 0.14);
    }
    p.vshade(r, [[0, '#000000', 0.15], [0.5, '#000000', 0.0], [0.6, '#000000', 0.05], [1, '#000000', 0.22]]);
    return;
  }
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
    if (o.hands === 'fingerless' && o.makeup) {
      // fingerless leather gloves: the fingers bare, a strap round the wrist, padded knuckles
      const gc = o.handColor;
      p.band(r, 0.22, 1, gc);
      p.noiseDots({ ...r, h: r.h * 0.78 }, shade(gc, 0.5), 300, 1, 0.12);
      p.band(r, 0.22, 0.27, shade(gc, -0.4));
      for (let i = 0; i < 4; i++) p.ellipse(r, 0.3 + i * 0.13, 0.33, 0.045, 0.035, shade(gc, 0.2), 0.6);
      p.band(r, 0.82, 0.9, shade(gc, 0.12));
      p.band(r, 0.84, 0.88, '#b8b8bc', 0.45, 0.55);
      // red nails on the fingertips
      for (let i = 0; i < 4; i++) p.ellipse(r, 0.3 + i * 0.13, 0.04, 0.03, 0.02, '#8a1020', 0.9);
    } else if (o.hands === 'wraps' || o.hands === 'fingerless') {
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
  if (o.shoes === 'kneeboots') {
    // glossy leather, a toe cap seam, a thin sole; the heel's patch (u ~0.02, v < 0.1) black
    p.noiseDots(r, shade(sc, 0.6), Math.floor(r.w * r.h * 0.02), 1, 0.1);
    p.band(r, 0, 1, '#070707', 0, 0.075);
    p.band(r, 0, 1, '#070707', 0.925, 1);
    p.band(r, 0, 0.1, '#0a0a0b', 0, 0.06);
    p.line(r, [[0.12, 0.7], [0.3, 0.76], [0.5, 0.78], [0.7, 0.76], [0.88, 0.7]], shade(sc, -0.6), 1.3, 0.8);
    stitch(p, r, [[0.12, 0.72], [0.5, 0.8], [0.88, 0.72]], shade(sc, 0.6), 1, 0.35);
    for (const u of [0.38, 0.62]) p.softSpot(r, u, 0.5, 0.03, 0.2, shade(sc, 0.8), 0.16);
    return;
  }
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

/** A layer of the character atlas: colour, and a finish mask (its red channel goes to alpha). */
export interface PaintedLayer {
  color: HTMLCanvasElement;
  mask: HTMLCanvasElement;
}

const canvas512 = () => {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  return c;
};
/** Finish codes (the atlas alpha; see the character material). */
const FIN = {
  matte: '#ffffff',
  gloss: (g: number) => grey(1 - g * 0.5),
  sheer: (k: number) => grey(0.5 - k * 0.25),
  metal: '#0a0a0a',
};
function grey(a: number) {
  const h = Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
  return '#' + h + h + h;
}

/** What each part of the body is made of: leather and patent shine, tights, metal, wet eyes and lips. */
function paintMask(m: Painter, o: Outfit, spec: BodySpec, faceOnly: Rect | null) {
  const eyes = (r: Rect) => {
    for (const sd of [-1, 1]) m.ellipse(r, 0.5 + sd * (o.makeup ? 0.066 : 0.062), 0.505, 0.026, 0.014, FIN.gloss(0.9), 1);
    m.ellipse(r, 0.5, 0.264, 0.04, 0.024, FIN.gloss(o.makeup ? 0.38 : 0.25), 1);
  };
  if (faceOnly) {
    m.fill(faceOnly, FIN.matte);
    eyes(faceOnly);
    if (o.hairStyle !== 'bald') m.band(faceOnly, 0.84, 1, FIN.gloss(0.25));
    return;
  }
  m.fill({ x: 0, y: 0, w: SIZE, h: SIZE }, FIN.matte);
  eyes(rect('head'));
  // the hair's sheen
  m.fill(rect('hair'), FIN.gloss(o.hairStyle === 'longwave' ? 0.4 : 0.22));
  // shoes
  const fr = rect('foot');
  if (o.shoes === 'kneeboots') {
    m.fill(fr, FIN.gloss(0.9));
    m.band(fr, 0.1, 1, FIN.gloss(0.15), 0, 0.075);
    m.band(fr, 0.1, 1, FIN.gloss(0.15), 0.925, 1);
  } else if (o.shoes === 'boots') m.fill(fr, FIN.gloss(0.45));
  else if (o.shoes === 'sneakers') m.fill(fr, FIN.gloss(0.15));
  if (o.hands === 'gloves') m.fill(rect('hand'), FIN.gloss(0.35));
  if (o.hands === 'fingerless' && o.makeup) m.band(rect('hand'), 0.22, 1, FIN.gloss(0.6));
  if (o.head === 'helmet' || o.head === 'cap') m.fill(rect('gear'), FIN.gloss(o.head === 'helmet' ? 0.55 : 0.1));
  if (o.extras.includes('chestarmor') || o.extras.includes('shoulderpads') || o.extras.includes('kneepads')) m.fill(rect('gear'), FIN.gloss(0.35));
  if (o.extras.includes('chain')) m.fill(rect('gear'), FIN.metal);
  if (o.extras.includes('belt') && o.top !== 'gi') m.band(rect('torso'), 0.24, 0.3, FIN.gloss(0.4));
  if (o.top === 'jacket') m.band(rect('torso'), 0.27, 1, FIN.gloss(0.22));
  if (o.top === 'leather') {
    const tr = rect('torso');
    const vHem = torsoV(JACKET_HEM);
    m.band(tr, vHem - 0.002, 1, FIN.gloss(0.7));
    // the top under it (in the opening) is matte, with skin above
    const ctx = m.ctx;
    ctx.fillStyle = FIN.matte;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const y = lerpN(JACKET_HEM, 0.545, i / 40);
      const ue = femFrontU(spec, Math.min(y, 0.5), jacketOpen(Math.min(y, 0.5)), jacketEase(y)) - 0.5;
      const [x, yy] = m.px(tr, 0.5 - ue + 0.002, torsoV(y));
      if (i === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    for (let i = 40; i >= 0; i--) {
      const y = lerpN(JACKET_HEM, 0.545, i / 40);
      const ue = femFrontU(spec, Math.min(y, 0.5), jacketOpen(Math.min(y, 0.5)), jacketEase(y)) - 0.5;
      const [x, yy] = m.px(tr, 0.5 + ue - 0.002, torsoV(y));
      ctx.lineTo(x, yy);
    }
    ctx.closePath();
    ctx.fill();
    // metal: the main zip, the pockets, the buckle, the snaps
    const uEdge = (y: number) => femFrontU(spec, y, jacketOpen(y), jacketEase(y)) - 0.5;
    const zp: [number, number][] = [];
    for (let i = 0; i <= 20; i++) {
      const y = lerpN(JACKET_HEM + 0.01, 0.49, i / 20);
      zp.push([0.5 + uEdge(y) + 0.006, torsoV(y)]);
    }
    m.line(tr, zp, FIN.metal, 3.2, 1);
    const cu = 0.5 + uEdge(0.36) + 0.02;
    m.line(tr, [[cu, torsoV(0.33)], [cu + 0.035, torsoV(0.395)]], FIN.metal, 3.2, 1);
    const pu = 0.5 - uEdge(0.17) - 0.018;
    m.line(tr, [[pu, torsoV(0.15)], [pu - 0.045, torsoV(0.205)]], FIN.metal, 3.2, 1);
    const bu = 0.5 + uEdge(JACKET_HEM + 0.02) + 0.035;
    m.band(tr, vHem + 0.004, torsoV(0.128) - 0.004, FIN.metal, bu - 0.016, bu + 0.016);
    for (const u of [0.25, 0.75]) m.ellipse(tr, u, torsoV(0.53), 0.008, 0.011, FIN.metal, 1);
    for (const sd of [-1, 1]) {
      const yt = 0.41;
      m.ellipse(tr, femFrontU(spec, yt, sd * (jacketOpen(yt) + lapelWidth(yt) * 0.75), jacketEase(yt) + 0.0042), torsoV(yt), 0.008, 0.012, FIN.metal, 1);
    }
    // sleeves, collar and edges
    const ar = rect('arm');
    const vEnd = (sleeveLength(o.top) + 0.12) / 1.12;
    m.band(ar, 0, vEnd, FIN.gloss(0.7));
    for (const u of [0.02, 0.98]) m.line(ar, [[u, vEnd - 0.12], [u, vEnd]], FIN.metal, 3.2, 1);
    m.fill(rect('gear'), FIN.gloss(0.7));
  }
  if (o.bottom === 'skirt') {
    const tr = rect('torso');
    const vSk = SKIRT_TEX_V;
    m.band(tr, 0, vSk, FIN.gloss(0.22));
    for (const u of [0, 1]) m.line(tr, [[u, vSk * 0.62], [u, vSk - 0.01]], FIN.metal, 3, 1);
  }
  // tights and boots
  const lr = rect('leg');
  if (o.legwear) m.fill(lr, FIN.sheer(0.92));
  if (o.shoes === 'kneeboots') {
    const vb = (BOOT_TOP + 0.1) / 1.14;
    m.band(lr, vb - 0.004, 1, FIN.gloss(0.88));
    m.band(lr, vb - 0.008, vb + 0.006, FIN.gloss(0.25));
    for (const u of [0.004, 0.996]) m.line(lr, [[u, vb + 0.03], [u, 0.985]], FIN.metal, 3.2, 1);
  }
  if (o.extras.includes('earrings')) m.band(rect('acc'), 0, 1, FIN.metal, 0.62, 1);
}

/** Paint an outfit: the body's layer, and (hiFace) a second layer holding the head at twice the detail. */
export function paintCharacter(o: Outfit, spec: BodySpec = DEFAULT_BODY, hiFace = false): PaintedLayer[] {
  const canvas = canvas512();
  const p = new Painter(canvas, o.seed * 7919 + 13);
  const fem = spec.fem > 0.5;
  p.fill({ x: 0, y: 0, w: SIZE, h: SIZE }, o.skin);
  if (fem) drawFemTorso(p, o, spec);
  else drawTorso(p, o);
  if (fem) drawFemArm(p, o);
  else drawArm(p, o);
  if (fem) drawFemLeg(p, o);
  else drawLeg(p, o);
  if (o.makeup) drawFemFace(p, o, rect('head'), 1);
  else drawHead(p, o);
  drawHair(p, o);
  drawGear(p, o);
  drawHands(p, o);
  drawFeet(p, o);
  drawNeck(p, o);
  const ar = rect('acc');
  if (o.bottom === 'skirt') {
    // the skirt's lining, and gold for the earrings
    p.fill(ar, shade(o.bottomColor, -0.35));
    p.band(ar, 0, 1, o.extraColor, 0.62, 1);
  } else {
    p.fill(ar, o.extraColor);
    p.grain(ar, o.extraColor, 0.2, 2);
  }
  if (o.top === 'leather') {
    // the collar and the jacket's edges: leather with a stitched roll
    const gr = rect('gear');
    p.fill(gr, o.topColor);
    p.noiseDots(gr, shade(o.topColor, 0.5), 600, 1, 0.12);
    stitch(p, gr, [[0, 0.82], [1, 0.82]], shade(o.topColor, 0.55), 1, 0.5);
    p.vshade(gr, [[0, '#000000', 0.25], [0.5, '#000000', 0], [1, '#ffffff', 0.05]]);
  }
  const mask = canvas512();
  paintMask(new Painter(mask, 1), o, spec, null);
  const out: PaintedLayer[] = [{ color: canvas, mask }];
  if (hiFace) {
    const fc = canvas512();
    const fp = new Painter(fc, o.seed * 7919 + 29);
    const full: Rect = { x: 0, y: 0, w: SIZE, h: SIZE };
    if (o.makeup) drawFemFace(fp, o, full, 2);
    else drawHead(fp, o, full, 2);
    const fm = canvas512();
    paintMask(new Painter(fm, 2), o, spec, full);
    out.push({ color: fc, mask: fm });
  }
  return out;
}

/** The body's colour layer alone (debug views). */
export function paintCharacterCanvas(o: Outfit): HTMLCanvasElement {
  return paintCharacter(o)[0].color;
}

/** Build a texture array from painted layers (rows flipped so v=0 is the bottom; the mask's red is alpha). */
export function buildTextureArray(layers: (PaintedLayer | HTMLCanvasElement)[]): THREE.DataArrayTexture {
  const n = Math.max(1, layers.length);
  const data = new Uint8Array(SIZE * SIZE * 4 * n);
  layers.forEach((l, layer) => {
    const color = l instanceof HTMLCanvasElement ? l : l.color;
    const img = color.getContext('2d')!.getImageData(0, 0, SIZE, SIZE).data;
    const mk = l instanceof HTMLCanvasElement ? null : l.mask.getContext('2d')!.getImageData(0, 0, SIZE, SIZE).data;
    const base = layer * SIZE * SIZE * 4;
    for (let y = 0; y < SIZE; y++) {
      const src = (SIZE - 1 - y) * SIZE * 4;
      const dst = base + y * SIZE * 4;
      data.set(img.subarray(src, src + SIZE * 4), dst);
      if (mk) for (let x = 0; x < SIZE; x++) data[dst + x * 4 + 3] = mk[src + x * 4];
      else for (let x = 0; x < SIZE; x++) data[dst + x * 4 + 3] = 255;
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
