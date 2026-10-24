// Parametric car body shape. The same functions drive the physics node
// lattice and the visual mesh so collision nodes sit on the rendered skin.
//
// Vehicle-local frame: +Z forward, +Y up, +X to the LEFT (right = -X).

import { clamp, smoothstep } from '../math.ts';

/** Monotone cubic (PCHIP) interpolation through (x, y) control points. */
export class Curve {
  readonly xs: number[];
  readonly ys: number[];
  private ms: number[];

  constructor(points: [number, number][]) {
    const pts = [...points].sort((a, b) => a[0] - b[0]);
    this.xs = pts.map((p) => p[0]);
    this.ys = pts.map((p) => p[1]);
    const n = pts.length;
    const d: number[] = [];
    const h: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      h[i] = this.xs[i + 1] - this.xs[i];
      d[i] = (this.ys[i + 1] - this.ys[i]) / (h[i] || 1e-9);
    }
    const m: number[] = new Array(n).fill(0);
    if (n === 1) {
      this.ms = m;
      return;
    }
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) m[i] = 0;
      else {
        const w1 = 2 * h[i] + h[i - 1];
        const w2 = h[i] + 2 * h[i - 1];
        m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
      }
    }
    this.ms = m;
  }

  at(x: number): number {
    const xs = this.xs, ys = this.ys, n = xs.length;
    if (n === 1) return ys[0];
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] > x) hi = mid;
      else lo = mid;
    }
    const h = xs[hi] - xs[lo];
    const t = (x - xs[lo]) / h;
    const t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return h00 * ys[lo] + h10 * h * this.ms[lo] + h01 * ys[hi] + h11 * h * this.ms[hi];
  }
}

export type BodyStyle = 'hatch' | 'sedan' | 'coupe' | 'muscle' | 'pickup' | 'suv' | 'van' | 'truck';

export interface ShapeParams {
  style: BodyStyle;
  length: number;
  width: number;
  zFrontAxle: number;
  zRearAxle: number;
  /** Track width (wheel center to wheel center). */
  track: number;
  wheelRadius: number;
  wheelWidth: number;
  archRadius: number;
  /** Rest height of wheel centers above ground. */
  wheelY: number;
  /** Centerline top silhouette (z, y), front positive. */
  top: [number, number][];
  /** Shoulder / belt crease height (z, y). */
  shoulder: [number, number][];
  /** Bottom of the body sides (z, y), before wheel arches. */
  bottom: [number, number][];
  /** Greenhouse window: windshield base, roof front, roof rear, rear window base (z). */
  zWindshieldBase: number;
  zRoofFront: number;
  zRoofRear: number;
  zRearWindowBase: number;
  /** Roof half width at the roof edge. */
  roofHalfWidth: number;
  /** Half width of the flat front and rear faces (plan view). */
  frontFaceHalfWidth: number;
  rearFaceHalfWidth: number;
  /** Plan-view corner lengths at front and rear. */
  frontCornerLen: number;
  rearCornerLen: number;
  shoulderInset: number;
  sillInset: number;
  hoodCrown: number;
  roofCrown: number;
  /** Pickup only: cab rear z and bed floor height. */
  zCabRear?: number;
  bedFloorY?: number;
  /** Door layout: list of [zFront, zRear] spans per side. */
  doors: [number, number][];
  /** Height where the front/rear bumper ends (top of bumper). */
  bumperTopFront: number;
  bumperTopRear: number;
  /** Length of the bumper region along z. */
  bumperLen: number;
}

export interface Section {
  /** Key points P0..P5 (left side, x >= 0). */
  x: Float64Array;
  y: Float64Array;
  g: number;
}

export class BodyShape {
  readonly p: ShapeParams;
  readonly zFront: number;
  readonly zRear: number;
  private topC: Curve;
  private shoulderC: Curve;
  private bottomC: Curve;

  constructor(p: ShapeParams) {
    this.p = p;
    this.zFront = p.length / 2;
    this.zRear = -p.length / 2;
    this.topC = new Curve(p.top);
    this.shoulderC = new Curve(p.shoulder);
    this.bottomC = new Curve(p.bottom);
  }

  /** Plan-view half width at z. */
  halfWidth(z: number): number {
    const p = this.p, W = p.width / 2;
    const zf = this.zFront, zr = this.zRear;
    if (z > zf - p.frontCornerLen) {
      const t = clamp((z - (zf - p.frontCornerLen)) / p.frontCornerLen, 0, 1);
      return p.frontFaceHalfWidth + (W - p.frontFaceHalfWidth) * Math.pow(1 - Math.pow(t, 2.2), 1 / 2.2);
    }
    if (z < zr + p.rearCornerLen) {
      const t = clamp((zr + p.rearCornerLen - z) / p.rearCornerLen, 0, 1);
      return p.rearFaceHalfWidth + (W - p.rearFaceHalfWidth) * Math.pow(1 - Math.pow(t, 2.4), 1 / 2.4);
    }
    return W;
  }

  topY(z: number): number {
    return this.topC.at(z);
  }

  shoulderY(z: number): number {
    return Math.min(this.shoulderC.at(z), this.topY(z) - 0.01);
  }

  /** Sill / lower edge without arches. */
  sillY(z: number): number {
    return this.bottomC.at(z);
  }

  /** Wheel arch top height at z, or -Infinity outside arches. */
  archY(z: number): number {
    const p = this.p;
    let best = -Infinity;
    for (const za of [p.zFrontAxle, p.zRearAxle]) {
      const dz = z - za;
      const r = p.archRadius;
      if (Math.abs(dz) < r) {
        const y = p.wheelY + 0.025 + Math.sqrt(r * r - dz * dz);
        if (y > best) best = y;
      }
    }
    return best;
  }

  /** Bottom edge of the side skin including arch cutouts. */
  bottomY(z: number): number {
    return Math.max(this.sillY(z), this.archY(z));
  }

  /** Greenhouse factor: 0 over hood/deck, 1 under the roof. */
  greenhouse(z: number): number {
    const p = this.p;
    if (z >= p.zRoofRear && z <= p.zRoofFront) return 1;
    if (z > p.zRoofFront) return 1 - smoothstep(p.zRoofFront, p.zWindshieldBase, z);
    return smoothstep(p.zRearWindowBase, p.zRoofRear, z);
  }

  /** True when z lies in the open pickup bed. */
  inBed(z: number): boolean {
    return this.p.style === 'pickup' && this.p.zCabRear !== undefined && z < this.p.zCabRear - 0.02;
  }

  /** Compute key points of the cross-section at z (left half). */
  section(z: number, out: Section): Section {
    const p = this.p;
    const hw = this.halfWidth(z);
    const top = this.topY(z);
    const sh = this.shoulderY(z);
    const bot = this.bottomY(z);
    const g = this.greenhouse(z);
    out.g = g;
    const x = out.x, y = out.y;
    // P0 sill
    x[0] = hw - p.sillInset;
    y[0] = bot;
    // P1 widest point
    x[1] = hw;
    y[1] = bot + 0.38 * (sh - bot);
    // P2 just under shoulder
    x[2] = hw - 0.01;
    y[2] = sh - Math.min(0.06, 0.3 * (sh - bot));
    // P3 shoulder crease
    const x3 = hw - p.shoulderInset;
    x[3] = x3;
    y[3] = sh;
    // P4 roof edge / hood side
    const hoodX = x3 * 0.68;
    const roofX = Math.min(p.roofHalfWidth * (hw / (p.width / 2)), x3 - 0.02);
    const x4 = hoodX + (roofX - hoodX) * g;
    const crown = p.hoodCrown + (p.roofCrown - p.hoodCrown) * g;
    let y4 = top - crown * (x4 / Math.max(x3, 0.01)) * (x4 / Math.max(x3, 0.01));
    if (y4 < sh) y4 = sh + 0.005;
    x[4] = x4;
    y[4] = y4;
    // P5 center
    x[5] = 0;
    y[5] = Math.max(top, y4 + 0.002);
    return out;
  }

  newSection(): Section {
    return { x: new Float64Array(6), y: new Float64Array(6), g: 0 };
  }

  /** Which door span (index) contains z, or -1. */
  doorAt(z: number): number {
    const d = this.p.doors;
    for (let i = 0; i < d.length; i++) if (z <= d[i][0] && z >= d[i][1]) return i;
    return -1;
  }

  isHood(z: number): boolean {
    return z > this.p.zWindshieldBase + 0.02 && z < this.zFront - 0.12;
  }

  isDeck(z: number): boolean {
    if (this.p.style === 'pickup' || this.p.style === 'van' || this.p.style === 'hatch' || this.p.style === 'suv' || this.p.style === 'truck') return false;
    return z < this.p.zRearWindowBase - 0.02 && z > this.zRear + 0.1;
  }
}
