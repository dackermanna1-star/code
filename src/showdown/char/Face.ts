import * as THREE from 'three';

export type Expr = 'neutral' | 'smirk' | 'grin' | 'shout' | 'hurt' | 'closed' | 'focus' | 'shock';

export interface FaceStyle {
  skin: string;
  skinShade: string;
  /** upper lash line / brows (Gojo's are white) */
  lash: string;
  lashEdge: string;
  brow: string;
  irisTop: string;
  irisBot: string;
  irisRing: string;
  pupil: string;
  /** how wide (x) and tall (y) the eye opening is, in metres on the face */
  eyeW: number;
  eyeH: number;
  eyeX: number;
  eyeY: number;
  /** outer-corner tilt (radians, + = upturned) */
  tilt: number;
  /** Sukuna's markings under the eyes */
  marks: boolean;
  lips: string;
  /** the Six Eyes glow */
  glow: number;
}

export const FACE_GOJO: FaceStyle = {
  skin: '#f3dccb',
  skinShade: '#e2bfaa',
  lash: '#f4f6fb',
  lashEdge: '#6c7a8e',
  brow: '#eef1f6',
  irisTop: '#1d4fd8',
  irisBot: '#8fe6ff',
  irisRing: '#0a1f6a',
  pupil: '#081638',
  eyeW: 0.031,
  eyeH: 0.0155,
  eyeX: 0.034,
  eyeY: -0.004,
  tilt: 0.05,
  marks: false,
  lips: '#b9776c',
  glow: 1,
};

export const FACE_SUKUNA: FaceStyle = {
  skin: '#efd2bd',
  skinShade: '#d9b19a',
  lash: '#16121a',
  lashEdge: '#000000',
  brow: '#1b1720',
  irisTop: '#5a0610',
  irisBot: '#ff3a3a',
  irisRing: '#2a0006',
  pupil: '#120002',
  eyeW: 0.029,
  eyeH: 0.0118,
  eyeX: 0.033,
  eyeY: -0.004,
  tilt: 0.16,
  marks: true,
  lips: '#a8665a',
  glow: 0.5,
};

/** Head geometry numbers the face texture is projected with (see headGeometry). */
export interface FaceFrame {
  r: number;
  h: number;
  chin: number;
}

const S = 512;

/**
 * Draws anime faces into canvases: one colour texture per expression plus an
 * emissive mask for glowing irises.
 */
export class FaceSet {
  readonly maps = new Map<Expr, THREE.CanvasTexture>();
  readonly glow: THREE.CanvasTexture;

  constructor(
    readonly style: FaceStyle,
    readonly frame: FaceFrame,
  ) {
    const exprs: Expr[] = ['neutral', 'smirk', 'grin', 'shout', 'hurt', 'closed', 'focus', 'shock'];
    for (const e of exprs) this.maps.set(e, this.draw(e, false));
    this.glow = this.draw('neutral', true);
  }

  /** head-local metres → canvas pixels */
  private px(x: number, y: number): [number, number] {
    const f = this.frame;
    const u = 0.5 + x / (2.2 * f.r);
    const v = (y + f.h + f.chin) / (2 * f.h + f.chin + 0.02);
    return [u * S, (1 - v) * S];
  }
  private m(len: number) {
    return (len / (2.2 * this.frame.r)) * S;
  }

  private draw(e: Expr, glowOnly: boolean) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d')!;
    const st = this.style;
    if (glowOnly) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, S, S);
    } else {
      g.fillStyle = st.skin;
      g.fillRect(0, 0, S, S);
      // soft shading under the cheekbones and around the jaw
      const [cx, cy] = this.px(0, -0.06);
      const grd = g.createRadialGradient(cx, cy, this.m(0.02), cx, cy, this.m(0.11));
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, st.skinShade);
      g.globalAlpha = 0.35;
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
      g.globalAlpha = 1;
    }
    for (const side of [-1, 1]) this.eye(g, side, e, glowOnly);
    if (glowOnly) {
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }
    for (const side of [-1, 1]) this.brow(g, side, e);
    if (st.marks) for (const side of [-1, 1]) this.marks(g, side);
    this.nose(g);
    this.mouth(g, e);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  private eye(g: CanvasRenderingContext2D, side: number, e: Expr, glowOnly: boolean) {
    const st = this.style;
    const w = this.m(st.eyeW);
    let h = this.m(st.eyeH);
    if (e === 'focus') h *= 0.62;
    if (e === 'shock') h *= 1.25;
    if (e === 'hurt') h *= 0.7;
    const [cx, cy] = this.px(side * st.eyeX, st.eyeY);
    g.save();
    g.translate(cx, cy);
    g.scale(side, 1);
    // +x points to the outer corner from here on
    g.rotate(-st.tilt);
    if (e === 'closed') {
      if (!glowOnly) {
        g.strokeStyle = st.lashEdge;
        g.lineWidth = this.m(0.0026);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-w * 0.5, 0);
        g.quadraticCurveTo(0, h * 0.45, w * 0.55, -h * 0.05);
        g.stroke();
        g.strokeStyle = st.lash;
        g.lineWidth = this.m(0.0016);
        g.stroke();
      }
      g.restore();
      return;
    }
    // eye opening: an almond, flatter on the bottom
    const almond = () => {
      g.beginPath();
      g.moveTo(-w * 0.5, h * 0.05);
      g.bezierCurveTo(-w * 0.25, -h * 0.72, w * 0.3, -h * 0.78, w * 0.55, -h * 0.12);
      g.bezierCurveTo(w * 0.35, h * 0.55, -w * 0.25, h * 0.6, -w * 0.5, h * 0.05);
      g.closePath();
    };
    if (!glowOnly) {
      almond();
      g.fillStyle = '#fbfbff';
      g.fill();
    }
    g.save();
    almond();
    g.clip();
    // iris: tall ellipse
    const ir = w * (e === 'shock' ? 0.2 : 0.27);
    const ih = h * 0.82;
    const ix = w * 0.02;
    const iy = h * 0.04;
    const grad = g.createLinearGradient(0, iy - ih, 0, iy + ih);
    grad.addColorStop(0, st.irisTop);
    grad.addColorStop(1, st.irisBot);
    g.beginPath();
    g.ellipse(ix, iy, ir, ih, 0, 0, Math.PI * 2);
    g.fillStyle = grad;
    g.fill();
    if (!glowOnly) {
      g.lineWidth = this.m(0.0011);
      g.strokeStyle = st.irisRing;
      g.stroke();
      // pupil and highlights
      g.beginPath();
      g.ellipse(ix, iy - ih * 0.08, ir * (e === 'shock' ? 0.25 : 0.42), ih * (e === 'shock' ? 0.25 : 0.42), 0, 0, Math.PI * 2);
      g.fillStyle = st.pupil;
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath();
      g.ellipse(ix - ir * 0.35, iy - ih * 0.42, ir * 0.22, ih * 0.16, -0.4, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(ix + ir * 0.35, iy + ih * 0.35, ir * 0.1, 0, Math.PI * 2);
      g.fill();
      // shadow of the upper lid across the white
      g.fillStyle = 'rgba(60,70,110,0.28)';
      g.fillRect(-w, -h * 1.2, w * 2, h * 0.55);
    } else {
      // Six Eyes: inner light
      g.globalCompositeOperation = 'lighter';
      g.beginPath();
      g.ellipse(ix, iy + ih * 0.2, ir * 0.7, ih * 0.6, 0, 0, Math.PI * 2);
      g.fillStyle = st.irisBot;
      g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
    if (!glowOnly) {
      // upper lash line: a heavy ink stroke that flicks out at the corner
      g.beginPath();
      g.moveTo(-w * 0.56, h * 0.12);
      g.bezierCurveTo(-w * 0.3, -h * 0.8, w * 0.32, -h * 0.92, w * 0.66, -h * 0.28);
      g.lineTo(w * 0.78, -h * 0.4);
      g.lineTo(w * 0.6, -h * 0.05);
      g.bezierCurveTo(w * 0.3, -h * 0.62, -w * 0.25, -h * 0.55, -w * 0.5, h * 0.18);
      g.closePath();
      g.fillStyle = st.lash;
      g.fill();
      g.lineWidth = this.m(0.0009);
      g.strokeStyle = st.lashEdge;
      g.stroke();
      // lower lash
      g.beginPath();
      g.moveTo(-w * 0.3, h * 0.42);
      g.quadraticCurveTo(w * 0.15, h * 0.62, w * 0.5, h * 0.1);
      g.lineWidth = this.m(0.0009);
      g.strokeStyle = st.lashEdge;
      g.stroke();
      // a double-lid crease
      g.beginPath();
      g.moveTo(-w * 0.2, -h * 0.95);
      g.quadraticCurveTo(w * 0.2, -h * 1.2, w * 0.52, -h * 0.7);
      g.lineWidth = this.m(0.0007);
      g.strokeStyle = this.style.skinShade;
      g.stroke();
    }
    g.restore();
  }

  private brow(g: CanvasRenderingContext2D, side: number, e: Expr) {
    const st = this.style;
    const [cx, cy] = this.px(side * (st.eyeX + 0.002), st.eyeY + st.eyeH * 1.55 + (e === 'shock' ? 0.006 : 0) - (e === 'focus' ? 0.002 : 0));
    const w = this.m(st.eyeW * 1.15);
    g.save();
    g.translate(cx, cy);
    g.scale(side, 1);
    let ang = -st.tilt * 0.6;
    if (e === 'focus' || e === 'shout') ang = 0.22;
    if (e === 'hurt') ang = -0.25;
    if (e === 'grin' && st.marks) ang = 0.12;
    g.rotate(ang);
    g.beginPath();
    g.moveTo(-w * 0.5, w * 0.03);
    g.quadraticCurveTo(0, -w * 0.12, w * 0.5, -w * 0.02);
    g.lineTo(w * 0.45, w * 0.05);
    g.quadraticCurveTo(0, -w * 0.02, -w * 0.48, w * 0.1);
    g.closePath();
    g.fillStyle = st.brow;
    g.fill();
    g.lineWidth = this.m(0.0008);
    g.strokeStyle = st.lashEdge;
    g.stroke();
    g.restore();
  }

  /**
   * Sukuna's markings: the lower pair of eyes (a lidded slit under each eye)
   * and one bold stripe across each cheek toward the ear.
   */
  private marks(g: CanvasRenderingContext2D, side: number) {
    const st = this.style;
    const w = this.m(st.eyeW);
    const u = (v: number) => this.m(v);
    g.fillStyle = '#0d0b10';
    g.save();
    const [cx, cy] = this.px(side * (st.eyeX + 0.001), st.eyeY - st.eyeH * 1.18);
    g.translate(cx, cy);
    g.scale(side, 1);
    g.rotate(-st.tilt * 0.9);
    g.beginPath();
    g.moveTo(-w * 0.4, u(0.0004));
    g.bezierCurveTo(-w * 0.12, -u(0.0034), w * 0.26, -u(0.0036), w * 0.5, -u(0.0012));
    g.lineTo(w * 0.64, -u(0.0026));
    g.lineTo(w * 0.5, u(0.0013));
    g.bezierCurveTo(w * 0.24, u(0.0003), -w * 0.12, u(0.0009), -w * 0.4, u(0.0004));
    g.closePath();
    g.fill();
    // the slit's lower lid
    g.beginPath();
    g.moveTo(-w * 0.2, u(0.0026));
    g.quadraticCurveTo(w * 0.12, u(0.0048), w * 0.38, u(0.0024));
    g.lineWidth = u(0.0008);
    g.strokeStyle = '#0d0b10';
    g.stroke();
    g.restore();
    g.save();
    const [sx, sy] = this.px(side * (st.eyeX + st.eyeW * 0.3), st.eyeY - st.eyeH * 2.75);
    g.translate(sx, sy);
    g.scale(side, 1);
    g.rotate(0.16);
    g.beginPath();
    g.moveTo(-u(0.002), -u(0.0026));
    g.quadraticCurveTo(u(0.012), -u(0.0038), u(0.029), -u(0.0012));
    g.lineTo(u(0.031), u(0.0002));
    g.quadraticCurveTo(u(0.013), u(0.0024), -u(0.002), u(0.0028));
    g.quadraticCurveTo(-u(0.0045), u(0.0001), -u(0.002), -u(0.0026));
    g.closePath();
    g.fill();
    g.restore();
  }

  private nose(g: CanvasRenderingContext2D) {
    const [x, y] = this.px(0.004, -0.042);
    g.beginPath();
    g.moveTo(x, y - this.m(0.008));
    g.lineTo(x + this.m(0.0035), y);
    g.lineTo(x - this.m(0.001), y + this.m(0.001));
    g.lineWidth = this.m(0.0012);
    g.strokeStyle = this.style.skinShade;
    g.stroke();
  }

  private mouth(g: CanvasRenderingContext2D, e: Expr) {
    const st = this.style;
    const [x, y] = this.px(0, -0.072);
    const w = this.m(0.024);
    g.save();
    g.translate(x, y);
    g.lineCap = 'round';
    g.strokeStyle = '#4a2a28';
    g.lineWidth = this.m(0.0013);
    if (e === 'neutral' || e === 'focus' || e === 'closed') {
      g.beginPath();
      g.moveTo(-w * 0.45, 0);
      g.quadraticCurveTo(0, this.m(0.0015), w * 0.45, -this.m(0.0005));
      g.stroke();
    } else if (e === 'smirk') {
      g.beginPath();
      g.moveTo(-w * 0.45, this.m(0.001));
      g.quadraticCurveTo(w * 0.1, this.m(0.003), w * 0.55, -this.m(0.005));
      g.stroke();
    } else if (e === 'grin' || e === 'shout' || e === 'hurt' || e === 'shock') {
      const open = e === 'shout' ? 0.018 : e === 'grin' ? 0.009 : e === 'shock' ? 0.012 : 0.006;
      const ww = e === 'grin' ? w * 1.3 : w;
      g.beginPath();
      if (e === 'grin') {
        // wide crescent full of teeth
        g.moveTo(-ww * 0.5, -this.m(0.004));
        g.quadraticCurveTo(0, this.m(open * 1.6), ww * 0.5, -this.m(0.004));
        g.quadraticCurveTo(0, this.m(0.002), -ww * 0.5, -this.m(0.004));
      } else {
        g.ellipse(0, this.m(open * 0.4), ww * 0.42, this.m(open * 0.75), 0, 0, Math.PI * 2);
      }
      g.closePath();
      g.fillStyle = '#3a0c10';
      g.fill();
      g.save();
      g.clip();
      g.fillStyle = '#fbf6ee';
      g.fillRect(-ww, -this.m(0.012), ww * 2, this.m(open * 0.55) + this.m(0.006));
      if (e === 'grin') {
        // the gaps between Sukuna's teeth
        g.strokeStyle = 'rgba(80,40,40,0.6)';
        g.lineWidth = this.m(0.0005);
        for (let i = -4; i <= 4; i++) {
          g.beginPath();
          g.moveTo((i / 9) * ww, -this.m(0.006));
          g.lineTo((i / 9) * ww * 0.96, this.m(open * 0.9));
          g.stroke();
        }
      }
      g.restore();
      g.strokeStyle = '#2a1010';
      g.stroke();
    }
    g.restore();
    void st;
  }
}
