// Mochi's face: drawn on a canvas every time the expression changes and wrapped onto the head.

import * as THREE from 'three';
import { Spring } from '../game/anim';

export type EyeMode = 'normal' | 'heart' | 'star' | 'swirl' | 'x' | 'closed';

/** Continuous expression parameters (all spring-smoothed). */
export const FACE_KEYS = [
  'lookX', 'lookY', 'eyeOpen', 'eyeHappy', 'eyeWide', 'pupil', 'browY', 'browAngle', 'browTilt',
  'mouthOpen', 'mouthSmile', 'mouthWide', 'mouthPucker', 'mouthWobble', 'tongue', 'teeth', 'cheeks',
  'blush', 'red', 'green', 'blue', 'soot', 'tears', 'sparkle', 'drool', 'squint',
] as const;
export type FaceKey = (typeof FACE_KEYS)[number];
export type FaceTargets = Partial<Record<FaceKey, number>>;

export const NEUTRAL: Record<FaceKey, number> = {
  lookX: 0, lookY: 0, eyeOpen: 1, eyeHappy: 0, eyeWide: 0, pupil: 1, browY: 0, browAngle: 0, browTilt: 0,
  mouthOpen: 0, mouthSmile: 0.45, mouthWide: 1, mouthPucker: 0, mouthWobble: 0, tongue: 0, teeth: 0, cheeks: 0,
  blush: 0.35, red: 0, green: 0, blue: 0, soot: 0, tears: 0, sparkle: 0, drool: 0, squint: 0,
};

const W = 768, H = 448;

const INK = '#3b2440';
const MOUTH_IN = '#7a2638';
const TONGUE = '#ff7f9a';

export class Face {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  readonly springs = {} as Record<FaceKey, Spring>;
  /** Base expression targets (set by reactions); `over` values add transient motion (talking, chewing). */
  base: Record<FaceKey, number> = { ...NEUTRAL };
  over: FaceTargets = {};
  eyeMode: EyeMode = 'normal';
  private blink = 0; // 0..1 blink closure
  private nextBlink = 2.5;
  private redrawAcc = 1;
  private lastSig = '';
  private wobbleT = 0;
  private seed = Math.random() * 10;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    for (const k of FACE_KEYS) {
      const stiff = k === 'lookX' || k === 'lookY' ? 260 : k === 'mouthOpen' ? 420 : 160;
      const damp = k === 'lookX' || k === 'lookY' ? 26 : k === 'mouthOpen' ? 24 : 17;
      this.springs[k] = new Spring(NEUTRAL[k], stiff, damp);
    }
    this.draw();
  }

  set(t: FaceTargets) {
    Object.assign(this.base, t);
  }

  reset(keepLook = true) {
    const lx = this.base.lookX, ly = this.base.lookY;
    this.base = { ...NEUTRAL };
    if (keepLook) {
      this.base.lookX = lx;
      this.base.lookY = ly;
    }
    this.eyeMode = 'normal';
  }

  value(k: FaceKey): number {
    return this.springs[k].value;
  }

  update(dt: number) {
    // blinking
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 1;
      this.nextBlink = Math.random() < 0.2 ? 0.25 : 2 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    this.wobbleT += dt;
    for (const k of FACE_KEYS) {
      const s = this.springs[k];
      s.target = this.base[k] + (this.over[k] ?? 0);
      s.update(dt);
    }
    this.redrawAcc += dt;
    const sig = FACE_KEYS.map((k) => this.springs[k].value.toFixed(2)).join(',') + this.eyeMode + this.blink.toFixed(2) + (this.base.mouthWobble > 0.05 ? Math.floor(this.wobbleT * 12) : '');
    if (sig !== this.lastSig && this.redrawAcc > 1 / 40) {
      this.lastSig = sig;
      this.redrawAcc = 0;
      this.draw();
    }
  }

  private v(k: FaceKey) {
    return this.springs[k].value;
  }

  draw() {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    const v = (k: FaceKey) => this.v(k);
    // skin tints (spicy red, gross green, cold blue) as a soft overlay
    const tint = (col: string, a: number) => {
      if (a <= 0.01) return;
      const g = c.createRadialGradient(W / 2, H * 0.55, 20, W / 2, H * 0.55, W * 0.55);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = Math.min(1, a);
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    };
    tint('rgba(255,70,50,0.75)', v('red'));
    tint('rgba(120,200,90,0.75)', v('green'));
    tint('rgba(120,190,255,0.75)', v('blue'));

    // cheeks
    const blush = v('blush') + v('red') * 0.4;
    for (const side of [-1, 1]) {
      const cx = W / 2 + side * 210, cy = H * 0.66;
      const g = c.createRadialGradient(cx, cy, 4, cx, cy, 62);
      g.addColorStop(0, `rgba(255,120,150,${0.55 * Math.min(1, blush)})`);
      g.addColorStop(1, 'rgba(255,120,150,0)');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(cx, cy, 70, 48, 0, 0, Math.PI * 2);
      c.fill();
      // chewing cheek bulge outline
      const ch = v('cheeks');
      if (ch > 0.05) {
        c.strokeStyle = `rgba(90,50,110,${0.25 * Math.min(1, ch)})`;
        c.lineWidth = 5;
        c.beginPath();
        c.arc(cx + side * 10, cy + 6, 46 + ch * 10, side > 0 ? -1.2 : Math.PI - 0.6, side > 0 ? 0.6 : Math.PI + 1.2);
        c.stroke();
      }
    }

    this.drawEyes();
    this.drawBrows();
    this.drawMouth();

    // soot smudges
    const soot = v('soot');
    if (soot > 0.02) {
      c.globalAlpha = Math.min(0.85, soot);
      c.fillStyle = '#2b2422';
      const blobs = [[-150, 230, 40], [170, 250, 34], [30, 120, 30], [-60, 330, 26], [220, 160, 22], [-230, 140, 24]];
      for (const [dx, y, r] of blobs) {
        c.beginPath();
        c.ellipse(W / 2 + dx, y, r * 1.3, r, 0.3, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    // tears streams
    const tears = v('tears');
    if (tears > 0.05) {
      c.fillStyle = `rgba(120,200,255,${Math.min(0.85, tears)})`;
      for (const side of [-1, 1]) {
        const x = W / 2 + side * 128;
        c.beginPath();
        c.moveTo(x - 10, H * 0.47);
        c.quadraticCurveTo(x - 14 + side * 4, H * 0.47 + 120 * tears, x, H * 0.47 + 150 * tears);
        c.quadraticCurveTo(x + 14 + side * 4, H * 0.47 + 120 * tears, x + 10, H * 0.47);
        c.fill();
      }
    }
    this.texture.needsUpdate = true;
  }

  private drawEyes() {
    const c = this.ctx;
    const v = (k: FaceKey) => this.v(k);
    const open = Math.max(0, Math.min(1.25, v('eyeOpen') * (1 - this.blink) * (1 - v('squint') * 0.55)));
    const happy = Math.min(1, v('eyeHappy'));
    const wide = v('eyeWide');
    const ex = 128, ey = H * 0.44;
    const rx = 62 + wide * 10, ry = 74 + wide * 16;
    for (const side of [-1, 1]) {
      const cx = W / 2 + side * ex;
      const cy = ey;
      c.save();
      if (this.eyeMode === 'heart') {
        drawHeart(c, cx, cy, 70 + wide * 8, '#ff4f7b');
        c.fillStyle = 'rgba(255,255,255,0.8)';
        c.beginPath();
        c.ellipse(cx - 22, cy - 18, 12, 8, -0.5, 0, Math.PI * 2);
        c.fill();
        c.restore();
        continue;
      }
      if (this.eyeMode === 'star') {
        drawStar(c, cx, cy, 72, 30, '#ffc83d', INK);
        c.restore();
        continue;
      }
      if (this.eyeMode === 'x') {
        c.strokeStyle = INK;
        c.lineWidth = 16;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(cx - 40, cy - 40);
        c.lineTo(cx + 40, cy + 40);
        c.moveTo(cx + 40, cy - 40);
        c.lineTo(cx - 40, cy + 40);
        c.stroke();
        c.restore();
        continue;
      }
      if (this.eyeMode === 'swirl') {
        c.strokeStyle = INK;
        c.lineWidth = 11;
        c.lineCap = 'round';
        c.beginPath();
        const rot = this.wobbleT * 6 * side;
        for (let i = 0; i < 70; i++) {
          const t = i / 70;
          const a = rot + t * Math.PI * 5;
          const r = 6 + t * 58;
          c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        c.stroke();
        c.restore();
        continue;
      }
      if (this.eyeMode === 'closed' || happy > 0.6 || open < 0.08) {
        // ^ ^ happy arcs (or closed lids)
        c.strokeStyle = INK;
        c.lineWidth = 15;
        c.lineCap = 'round';
        c.beginPath();
        if (happy > 0.6 || this.eyeMode === 'closed') {
          const up = happy > 0.6 ? 1 : -0.35;
          c.moveTo(cx - 48, cy + 14 * up);
          c.quadraticCurveTo(cx, cy - 46 * up, cx + 48, cy + 14 * up);
        } else {
          c.moveTo(cx - 50, cy + 8);
          c.quadraticCurveTo(cx, cy + 24, cx + 50, cy + 8);
        }
        c.stroke();
        c.restore();
        continue;
      }
      // white of the eye, clipped by the lids
      const lidTop = cy - ry * (2 * Math.min(1, open) - 1) - happy * ry * 0.5;
      c.beginPath();
      c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      c.clip();
      c.fillStyle = '#ffffff';
      c.fillRect(cx - rx, Math.max(cy - ry, lidTop), rx * 2, ry * 2);
      // pupil
      const lx = Math.max(-1, Math.min(1, v('lookX')));
      const ly = Math.max(-1, Math.min(1, v('lookY')));
      const pr = 40 * v('pupil') * (1 - wide * 0.15);
      const px = cx + lx * (rx - pr * 0.75);
      const py = cy - ly * (ry - pr * 0.7) + 6;
      const pg = c.createRadialGradient(px - 8, py - 10, 4, px, py, pr);
      pg.addColorStop(0, '#5a3a78');
      pg.addColorStop(0.55, '#2c1a3c');
      pg.addColorStop(1, '#170d22');
      c.fillStyle = pg;
      c.beginPath();
      c.arc(px, py, pr, 0, Math.PI * 2);
      c.fill();
      // highlights
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(px - pr * 0.35, py - pr * 0.4, pr * 0.32, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(px + pr * 0.35, py + pr * 0.3, pr * 0.14, 0, Math.PI * 2);
      c.fill();
      const sp = v('sparkle');
      if (sp > 0.1) {
        c.globalAlpha = Math.min(1, sp);
        drawStar(c, px + pr * 0.1, py - pr * 0.05, pr * 0.42, pr * 0.15, '#ffffff', null);
        c.globalAlpha = 1;
      }
      // lid shading (skin colour) when the eye is partly closed
      if (open < 0.98 || happy > 0.05) {
        c.fillStyle = '#b5a2ee';
        c.fillRect(cx - rx - 2, cy - ry - 2, rx * 2 + 4, Math.max(0, lidTop - (cy - ry)) + 2);
        c.strokeStyle = INK;
        c.lineWidth = 8;
        c.beginPath();
        c.moveTo(cx - rx, lidTop);
        c.lineTo(cx + rx, lidTop);
        c.stroke();
      }
      // happy lower lid
      if (happy > 0.05) {
        c.fillStyle = '#b5a2ee';
        c.beginPath();
        c.ellipse(cx, cy + ry * (1.5 - happy * 0.55), rx * 1.2, ry * 0.8, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
      // outline
      c.strokeStyle = INK;
      c.lineWidth = 7;
      c.beginPath();
      c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      c.stroke();
      // lashes
      c.lineWidth = 7;
      c.lineCap = 'round';
      for (const k of [-1, 0, 1]) {
        const a = -Math.PI / 2 + side * (0.75 + k * 0.22);
        const x0 = cx + Math.cos(a) * rx, y0 = Math.max(lidTop, cy + Math.sin(a) * ry);
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(x0 + Math.cos(a) * 18, y0 + Math.sin(a) * 18);
        c.stroke();
      }
    }
  }

  private drawBrows() {
    const c = this.ctx;
    const by = H * 0.17 - this.v('browY') * 34 - this.v('eyeWide') * 18;
    const ang = this.v('browAngle');
    const tilt = this.v('browTilt');
    c.strokeStyle = INK;
    c.lineWidth = 15;
    c.lineCap = 'round';
    for (const side of [-1, 1]) {
      const cx = W / 2 + side * 130;
      const inner = cx - side * 46, outer = cx + side * 46;
      const t = tilt * side * 14;
      c.beginPath();
      // positive angle = worried (inner ends up), negative = cross (inner ends down)
      c.moveTo(inner, by - ang * 22 + t);
      c.quadraticCurveTo(cx, by - 14 + t, outer, by + ang * 12 + t);
      c.stroke();
    }
  }

  private drawMouth() {
    const c = this.ctx;
    const v = (k: FaceKey) => this.v(k);
    const open = Math.max(0, v('mouthOpen'));
    const smile = v('mouthSmile');
    const wide = v('mouthWide') * (1 - v('mouthPucker') * 0.62);
    const pucker = v('mouthPucker');
    const wob = v('mouthWobble');
    const cx = W / 2, cy = H * 0.74;
    const hw = 74 * wide;
    // nose
    c.fillStyle = '#ff8fb0';
    c.beginPath();
    c.ellipse(cx, H * 0.6, 20, 13, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.beginPath();
    c.ellipse(cx - 6, H * 0.585, 7, 4, -0.3, 0, Math.PI * 2);
    c.fill();

    const curve = (x: number) => {
      const t = x / hw; // -1..1
      let y = -smile * 26 * (1 - t * t) + (smile * 30) * 0; // smile: centre lower than corners
      y = smile * 26 * (t * t - 1) * -1;
      if (wob > 0.02) y += Math.sin(t * Math.PI * 3 + this.wobbleT * 14) * 9 * wob;
      return y;
    };
    if (open < 0.06 && pucker < 0.3) {
      // closed mouth line
      c.strokeStyle = INK;
      c.lineWidth = 11;
      c.lineCap = 'round';
      c.beginPath();
      for (let i = 0; i <= 24; i++) {
        const x = -hw + (i / 24) * hw * 2;
        const y = cy + curve(x);
        i ? c.lineTo(cx + x, y) : c.moveTo(cx + x, y);
      }
      c.stroke();
      // tongue poking out
      if (v('tongue') > 0.05) this.drawTongue(cx, cy + curve(0) + 4, v('tongue'));
      return;
    }
    if (pucker > 0.3 && open < 0.5) {
      // small round O (sour / blowing)
      const r = 16 + open * 30;
      c.fillStyle = MOUTH_IN;
      c.beginPath();
      c.ellipse(cx, cy + 4, r * 0.9, r, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 9;
      c.stroke();
      return;
    }
    // open mouth: upper lip follows the smile curve, lower lip drops with `open`
    const drop = 20 + open * 95;
    c.beginPath();
    for (let i = 0; i <= 24; i++) {
      const x = -hw + (i / 24) * hw * 2;
      const y = cy + curve(x) - open * 6;
      i ? c.lineTo(cx + x, y) : c.moveTo(cx + x, y);
    }
    for (let i = 24; i >= 0; i--) {
      const x = -hw + (i / 24) * hw * 2;
      const t = x / hw;
      const y = cy + curve(x) + drop * Math.sqrt(Math.max(0, 1 - t * t)) * (smile > 0 ? 1 : 0.8);
      c.lineTo(cx + x, y);
    }
    c.closePath();
    c.save();
    c.fillStyle = MOUTH_IN;
    c.fill();
    c.clip();
    // teeth
    const teeth = v('teeth');
    if (teeth > 0.05) {
      c.fillStyle = '#ffffff';
      const ty = cy + curve(0) - open * 6;
      c.beginPath();
      c.roundRect(cx - hw * 0.62, ty - 4, hw * 1.24, 18 * teeth + 6, 8);
      c.fill();
      if (teeth > 0.6) {
        c.beginPath();
        c.roundRect(cx - hw * 0.5, cy + curve(0) + drop - 20, hw, 18, 8);
        c.fill();
      }
    } else {
      // two cute buck teeth
      c.fillStyle = '#ffffff';
      const ty = cy + curve(0) - open * 6 - 2;
      c.beginPath();
      c.roundRect(cx - 22, ty, 20, 22, 5);
      c.roundRect(cx + 2, ty, 20, 22, 5);
      c.fill();
    }
    // tongue inside
    const tg = c.createRadialGradient(cx, cy + drop * 0.85, 4, cx, cy + drop * 0.85, hw);
    tg.addColorStop(0, '#ff9ab0');
    tg.addColorStop(1, TONGUE);
    c.fillStyle = tg;
    c.beginPath();
    c.ellipse(cx, cy + drop * 0.95 + 10, hw * 0.62, drop * 0.45 + 8, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.strokeStyle = INK;
    c.lineWidth = 10;
    c.lineJoin = 'round';
    c.stroke();
    if (v('tongue') > 0.05) this.drawTongue(cx, cy + curve(0) + drop * 0.7, v('tongue'));
    // drool
    if (v('drool') > 0.1) {
      c.fillStyle = 'rgba(170,220,255,0.85)';
      const x = cx + hw * 0.55;
      c.beginPath();
      c.ellipse(x, cy + 30 + v('drool') * 30, 9, 14 + v('drool') * 14, 0, 0, Math.PI * 2);
      c.fill();
    }
  }

  private drawTongue(x: number, y: number, k: number) {
    const c = this.ctx;
    c.fillStyle = TONGUE;
    c.strokeStyle = INK;
    c.lineWidth = 7;
    c.beginPath();
    c.ellipse(x + 8, y + 22 * k, 30, 30 * k + 6, 0.15, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.strokeStyle = '#e0607a';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(x + 8, y + 4);
    c.lineTo(x + 8, y + 30 * k);
    c.stroke();
  }
}

function drawHeart(c: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  c.fillStyle = color;
  c.strokeStyle = INK;
  c.lineWidth = 7;
  c.beginPath();
  c.moveTo(x, y + s * 0.75);
  c.bezierCurveTo(x - s * 1.2, y - s * 0.05, x - s * 0.7, y - s * 0.95, x, y - s * 0.4);
  c.bezierCurveTo(x + s * 0.7, y - s * 0.95, x + s * 1.2, y - s * 0.05, x, y + s * 0.75);
  c.fill();
  c.stroke();
}

function drawStar(c: CanvasRenderingContext2D, x: number, y: number, R: number, r: number, fill: string, stroke: string | null) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 === 0 ? R : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 7;
    c.lineJoin = 'round';
    c.stroke();
  }
}

export const FACE_ASPECT = W / H;
