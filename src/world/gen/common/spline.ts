/**
 * Minecraft-style cubic (Hermite) splines over climate coordinates.
 * A spline maps one coordinate (an index into a parameter array) to a value; values at control
 * points may themselves be splines (evaluated on another coordinate), giving the nested
 * terrain-shaping functions of Minecraft 1.18+.
 */
export interface CubicSpline {
  readonly coord: number;
  readonly locs: number[];
  readonly vals: (number | CubicSpline)[];
  readonly ders: number[];
}

export class SplineBuilder {
  private readonly locs: number[] = [];
  private readonly vals: (number | CubicSpline)[] = [];
  private readonly ders: number[] = [];
  constructor(private readonly coord: number) {}
  p(loc: number, val: number | CubicSpline, der = 0): this {
    if (this.locs.length && loc <= this.locs[this.locs.length - 1]) throw new Error('spline points must be ascending');
    this.locs.push(loc);
    this.vals.push(val);
    this.ders.push(der);
    return this;
  }
  build(): CubicSpline {
    return { coord: this.coord, locs: this.locs, vals: this.vals, ders: this.ders };
  }
}

export const spline = (coord: number) => new SplineBuilder(coord);

const valueOf = (v: number | CubicSpline, p: ArrayLike<number>): number => (typeof v === 'number' ? v : evalSpline(v, p));

export function evalSpline(s: CubicSpline, p: ArrayLike<number>): number {
  const f = p[s.coord];
  const locs = s.locs;
  const n = locs.length;
  let i = -1;
  while (i + 1 < n && f >= locs[i + 1]) i++;
  if (i < 0) {
    const v = valueOf(s.vals[0], p);
    const d = s.ders[0];
    return d === 0 ? v : v + d * (f - locs[0]);
  }
  if (i === n - 1) {
    const v = valueOf(s.vals[n - 1], p);
    const d = s.ders[n - 1];
    return d === 0 ? v : v + d * (f - locs[n - 1]);
  }
  const x0 = locs[i], x1 = locs[i + 1];
  const t = (f - x0) / (x1 - x0);
  const y0 = valueOf(s.vals[i], p);
  const y1 = valueOf(s.vals[i + 1], p);
  const dx = x1 - x0;
  const a = s.ders[i] * dx - (y1 - y0);
  const b = -s.ders[i + 1] * dx + (y1 - y0);
  return y0 + t * (y1 - y0) + t * (1 - t) * (a + t * (b - a));
}
