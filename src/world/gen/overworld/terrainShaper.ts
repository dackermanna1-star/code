/**
 * Terrain shaping splines (port of Minecraft 1.18+ `TerrainProvider`): offset (base height),
 * factor (how strongly the 3D noise is damped) and jaggedness (peak spikes) as functions of
 * continentalness (C), erosion (E), weirdness/ridges (R) and peaks-and-valleys (PV).
 */
import { spline, evalSpline, type CubicSpline } from '../common/spline';

export const P_C = 0;
export const P_E = 1;
export const P_R = 2;
export const P_PV = 3;

const lerp = (t: number, a: number, b: number) => a + t * (b - a);

export function peaksAndValleys(w: number): number {
  return -(Math.abs(Math.abs(w) - 0.6666667) - 0.33333334) * 3;
}

function mountainContinentalness(x: number, m: number, threshold: number): number {
  const f2 = 1 - (1 - m) * 0.5;
  const f3 = 0.5 * (1 - m);
  const f4 = (x + 1.17) * 0.46082947;
  const f5 = f4 * f2 - f3;
  return x < threshold ? Math.max(f5, -0.2222) : Math.max(f5, 0);
}

function zeroPoint(m: number): number {
  const f2 = 1 - (1 - m) * 0.5;
  const f3 = 0.5 * (1 - m);
  return f3 / (0.46082947 * f2) - 1.17;
}

const slope = (y1: number, y2: number, x1: number, x2: number) => (y2 - y1) / (x2 - x1);

function mountainRidge(m: number, flag: boolean): CubicSpline {
  const b = spline(P_PV);
  const f2 = mountainContinentalness(-1, m, -0.7);
  const f4 = mountainContinentalness(1, m, -0.7);
  const f5 = zeroPoint(m);
  if (-0.65 < f5 && f5 < 1) {
    const f14 = mountainContinentalness(-0.65, m, -0.7);
    const f9 = mountainContinentalness(-0.75, m, -0.7);
    const f10 = slope(f2, f9, -1, -0.75);
    b.p(-1, f2, f10).p(-0.75, f9).p(-0.65, f14);
    const f11 = mountainContinentalness(f5, m, -0.7);
    const f12 = slope(f11, f4, f5, 1);
    b.p(f5 - 0.01, f11).p(f5, f11, f12).p(1, f4, f12);
  } else {
    const f7 = slope(f2, f4, -1, 1);
    if (flag) b.p(-1, Math.max(0.2, f2)).p(0, lerp(0.5, f2, f4), f7);
    else b.p(-1, f2, f7);
    b.p(1, f4, f7);
  }
  return b.build();
}

function ridgeSpline(y1: number, y2: number, y3: number, y4: number, y5: number, minSlope: number): CubicSpline {
  const f = Math.max(0.5 * (y2 - y1), minSlope);
  const f1 = 5 * (y3 - y2);
  return spline(P_PV)
    .p(-1, y1, f)
    .p(-0.4, y2, Math.min(f, f1))
    .p(0, y3, f1)
    .p(0.4, y4, 2 * (y4 - y3))
    .p(1, y5, 0.7 * (y5 - y4))
    .build();
}

function erosionOffset(a: number, b: number, c: number, d: number, e: number, f: number, extended: boolean, flag: boolean): CubicSpline {
  const s0 = mountainRidge(lerp(d, 0.6, 1.5), flag);
  const s1 = mountainRidge(lerp(d, 0.6, 1.0), flag);
  const s2 = mountainRidge(d, flag);
  const s3 = ridgeSpline(a - 0.15, 0.5 * d, 0.5 * d, 0.5 * d, 0.6 * d, 0.5);
  const s4 = ridgeSpline(a, e * d, b * d, 0.5 * d, 0.6 * d, 0.5);
  const s5 = ridgeSpline(a, e, e, b, c, 0.5);
  const s6 = ridgeSpline(a, e, e, b, c, 0.5);
  const s7 = spline(P_PV).p(-1, a).p(-0.4, s5).p(0, c + 0.07).build();
  const s8 = ridgeSpline(-0.02, f, f, b, c, 0);
  const B = spline(P_E).p(-0.85, s0).p(-0.7, s1).p(-0.4, s2).p(-0.35, s3).p(-0.1, s4).p(0.2, s5);
  if (extended) B.p(0.4, s6).p(0.45, s7).p(0.55, s7).p(0.58, s6);
  B.p(0.7, s8);
  return B.build();
}

function buildOffset(): CubicSpline {
  const coast = erosionOffset(-0.15, 0.0, 0.0, 0.1, 0.0, -0.03, false, false);
  const near = erosionOffset(-0.1, 0.03, 0.1, 0.1, 0.01, -0.03, false, false);
  const mid = erosionOffset(-0.1, 0.03, 0.1, 0.7, 0.01, -0.03, true, true);
  const far = erosionOffset(-0.05, 0.03, 0.1, 1.0, 0.01, 0.01, true, true);
  return spline(P_C)
    .p(-1.1, 0.044)
    .p(-1.02, -0.2222)
    .p(-0.51, -0.2222)
    .p(-0.44, -0.12)
    .p(-0.18, -0.12)
    .p(-0.16, coast)
    .p(-0.15, coast)
    .p(-0.1, near)
    .p(0.25, mid)
    .p(1.0, far)
    .build();
}

function erosionFactor(v: number, extended: boolean): CubicSpline {
  const s = spline(P_R).p(-0.2, 6.3).p(0.2, v).build();
  const B = spline(P_E)
    .p(-0.6, s)
    .p(-0.5, spline(P_R).p(-0.05, 6.3).p(0.05, 2.67).build())
    .p(-0.35, s)
    .p(-0.25, s)
    .p(-0.1, spline(P_R).p(-0.05, 2.67).p(0.05, 6.3).build())
    .p(0.03, s);
  if (extended) {
    const s1 = spline(P_R).p(0, v).p(0.1, 0.625).build();
    const s2 = spline(P_PV).p(-0.9, v).p(-0.69, s1).build();
    B.p(0.35, v).p(0.45, s2).p(0.55, s2).p(0.62, v);
  } else {
    const s3 = spline(P_PV).p(-0.7, s).p(-0.15, 1.37).build();
    const s4 = spline(P_PV).p(0.45, s).p(0.7, 1.56).build();
    B.p(0.05, s4).p(0.4, s4).p(0.45, s3).p(0.55, s3).p(0.58, v);
  }
  return B.build();
}

function buildFactor(): CubicSpline {
  return spline(P_C)
    .p(-0.19, 3.95)
    .p(-0.15, erosionFactor(6.25, true))
    .p(-0.1, erosionFactor(5.47, true))
    .p(0.03, erosionFactor(5.08, true))
    .p(0.06, erosionFactor(4.69, false))
    .build();
}

function weirdJag(v: number): CubicSpline {
  return spline(P_R).p(-0.01, 0.63 * v).p(0.01, 0.3 * v).build();
}

function ridgeJag(high: number, mid: number): CubicSpline {
  const f = peaksAndValleys(0.4);
  const f1 = peaksAndValleys(0.56666666);
  const f2 = (f + f1) / 2;
  const b = spline(P_PV).p(f, 0);
  b.p(f2, mid > 0 ? weirdJag(mid) : 0);
  b.p(1, high > 0 ? weirdJag(high) : 0);
  return b.build();
}

function erosionJag(a: number, b: number, c: number, d: number): CubicSpline {
  const s = ridgeJag(a, c);
  const s1 = ridgeJag(b, d);
  return spline(P_E).p(-1, s).p(-0.78, s1).p(-0.5775, s1).p(-0.375, 0).build();
}

function buildJaggedness(): CubicSpline {
  return spline(P_C).p(-0.11, 0).p(0.03, erosionJag(1, 0.5, 0, 0)).p(0.65, erosionJag(1, 1, 1, 0)).build();
}

const OFFSET = buildOffset();
const FACTOR = buildFactor();
const JAGGEDNESS = buildJaggedness();

/** params = [C, E, R, PV] */
export const terrainOffset = (p: ArrayLike<number>) => evalSpline(OFFSET, p);
export const terrainFactor = (p: ArrayLike<number>) => evalSpline(FACTOR, p);
export const terrainJaggedness = (p: ArrayLike<number>) => evalSpline(JAGGEDNESS, p);
