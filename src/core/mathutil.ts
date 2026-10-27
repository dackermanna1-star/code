export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const saturate = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => (x - a) / (b - a);
export function smoothstep(a: number, b: number, x: number): number {
  const t = saturate((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
export const fract = (x: number) => x - Math.floor(x);
export const mod = (x: number, m: number) => x - m * Math.floor(x / m);
export const DEG = Math.PI / 180;

/** Format a distance in metres into a human-readable astronomical unit string. */
export function formatDistance(m: number): string {
  const a = Math.abs(m);
  if (a < 1) return `${(m * 100).toFixed(1)} cm`;
  if (a < 1e3) return `${m.toFixed(1)} m`;
  if (a < 1e7) return `${(m / 1e3).toFixed(a < 1e5 ? 2 : 1)} km`;
  if (a < 1.495978707e10) return `${(m / 1e3).toExponential(2).replace('e+', '×10^')} km`;
  if (a < 9.4607e15 * 0.05) return `${(m / 1.495978707e11).toFixed(a < 1.5e12 ? 3 : 2)} AU`;
  if (a < 9.4607e15 * 1e5) return `${(m / 9.4607304725808e15).toFixed(a < 9.46e16 ? 3 : 1)} ly`;
  if (a < 3.0857e22 * 0.5) return `${(m / 3.0856775814913673e19).toFixed(1)} kpc`;
  if (a < 3.0857e22 * 1e4) return `${(m / 3.0856775814913673e22).toFixed(2)} Mpc`;
  return `${(m / 3.0856775814913673e25).toFixed(2)} Gpc`;
}

export function formatSpeed(mps: number): string {
  const a = Math.abs(mps);
  const c = 299792458;
  if (a < 1000) return `${mps.toFixed(1)} m/s`;
  if (a < 0.01 * c) return `${(mps / 1000).toFixed(a < 1e5 ? 2 : 1)} km/s`;
  if (a < 1e3 * c) return `${(mps / c).toFixed(a < c ? 4 : 2)} c`;
  const lyps = mps / 9.4607304725808e15;
  if (lyps < 1e3) return `${lyps.toPrecision(3)} ly/s`;
  return `${(mps / 3.0856775814913673e22).toPrecision(3)} Mpc/s`;
}

export function formatDuration(s: number): string {
  const a = Math.abs(s);
  if (a < 60) return `${s.toFixed(1)} s`;
  if (a < 3600) return `${(s / 60).toFixed(1)} min`;
  if (a < 86400 * 2) return `${(s / 3600).toFixed(2)} h`;
  if (a < 86400 * 365.25 * 2) return `${(s / 86400).toFixed(2)} d`;
  const y = s / (86400 * 365.25);
  if (y < 1e6) return `${y.toFixed(2)} yr`;
  if (y < 1e9) return `${(y / 1e6).toFixed(2)} Myr`;
  return `${(y / 1e9).toFixed(2)} Gyr`;
}

export function sci(x: number, digits = 3): string {
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e-2 && a < 1e5) return x.toPrecision(digits);
  const e = Math.floor(Math.log10(a));
  const m = x / Math.pow(10, e);
  return `${m.toFixed(digits - 1)}×10${superscript(e)}`;
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
export function superscript(n: number): string {
  return String(n).split('').map((c) => SUP[c] ?? c).join('');
}
