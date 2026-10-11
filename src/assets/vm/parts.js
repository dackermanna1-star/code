// Reusable gun parts (gun frame: grip top at the origin, -Z forward).
import { C } from './kit.js';

// Standard rifle pistol grip at the origin (the right-hand pose expects it).
export function pistolGrip(g, mat = 'polymer', tint = C.black, o = {}) {
  const s = o.scale || 1;
  g.prism(mat, tint, [[0.45, 0.12], [-1.0, 0.12], [-2.05 * s, -3.55 * s], [-1.95 * s, -3.95 * s], [-0.55 * s, -3.95 * s], [0.25, -0.55]].map(([f, y]) => [f + (o.f || 0), y]), o.w || 1.12, { bev: 0.16 });
}

// Trigger guard loop + trigger between f0 and f1 below y0.
export function triggerGuard(g, f0 = -0.3, f1 = 2.6, y0 = 0.1, depth = 1.15, tint = C.black) {
  g.span('metal', tint, f0, f1, y0 - depth, y0 - depth + 0.2, 0.4);
  g.span('metal', tint, f1 - 0.28, f1, y0 - depth, y0, 0.4);
  g.box('metal', C.dark, 0.18, 0.72, 0.22, { p: [0, y0 - 0.45, -(f0 + (f1 - f0) * 0.42)], r: [12, 0, 0] });
}

// Birdcage flash hider / muzzle.
export function flashHider(g, f0, len, y, r = 0.42, tint = C.black) {
  g.tube('metal', tint, f0, f0 + len * 0.25, y, r * 0.85, r * 0.85, { n: 8 });
  g.tube('ribbed', tint, f0 + len * 0.25, f0 + len, y, r, r, { n: 8 });
  g.tube('metal', C.bore, f0 + len, f0 + len + 0.02, y, r * 0.55, r * 0.55, { n: 6 });
}

// Simple muzzle end with a dark bore disc.
export function muzzle(g, f0, len, y, r, tint = C.black, n = 8) {
  g.tube('metal', tint, f0, f0 + len, y, r, r, { n });
  g.tube('metal', C.bore, f0 + len, f0 + len + 0.02, y, r * 0.55, r * 0.55, { n: 6 });
}

// Curved box magazine profile generator (relative to the well): top width w0,
// length len, forward sweep `curve` at the bottom.
export function curvedMag(len, w0, w1, curve, top = 0.5) {
  const N = 4;
  const front = [], back = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = top - t * (len + top);
    const off = curve * t * t;
    const w = w0 + (w1 - w0) * t;
    front.push([w / 2 + off, y]);
    back.push([-w / 2 + off * 0.92, y - t * 0.15]);
  }
  // back edge top -> bottom, then front edge bottom -> top
  return [...back, ...front.reverse()];
}

// Ring sight hood / ring at f, height y.
export function ring(g, f, y, r, thick = 0.12, tint = C.black, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.box('metal', tint, thick, (2 * Math.PI * r) / n + 0.04, 0.3, { p: [Math.cos(a) * r, y + Math.sin(a) * r, -f], r: [0, 0, (a * 180) / Math.PI] });
  }
}
