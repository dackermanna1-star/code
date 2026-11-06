// Block-breaking crack overlays destroy_1..4 (black cracks on transparent, alpha 0/255, increasing coverage).
// All stages share one crack network that grows outward, so each stage contains the previous one.
import { Img, makeRng, seedFromString } from './core.js';

let network = null;
function buildNetwork() {
  if (network) return network;
  const r = makeRng(seedFromString('destroy_cracks'));
  const pts = []; // [x, y, t] with t in 0..1 = when the pixel appears
  const grow = (x, y, ang, len, t0, t1, depth) => {
    let fx = x, fy = y;
    for (let s = 0; s < len; s++) {
      const t = t0 + (t1 - t0) * (s / len);
      pts.push([Math.floor(fx), Math.floor(fy), t]);
      if (depth < 3 && r.next() < 0.16) grow(fx, fy, ang + (r.next() < 0.5 ? -1 : 1) * r.range(0.5, 1.1), Math.floor(len * 0.55), t, Math.min(1, t + 0.45), depth + 1);
      ang += (r.next() - 0.5) * 0.7;
      fx += Math.cos(ang); fy += Math.sin(ang);
    }
  };
  const arms = 6;
  for (let k = 0; k < arms; k++) {
    const ang = (k / arms) * Math.PI * 2 + r.range(-0.3, 0.3);
    grow(7.5 + r.range(-1, 1), 7.5 + r.range(-1, 1), ang, r.int(7, 10), k < 3 ? 0 : 0.2, k < 3 ? 0.65 : 0.9, 0);
  }
  // late secondary fractures from the edges
  for (let k = 0; k < 4; k++) {
    const side = k;
    const p = r.range(3, 12);
    const [x, y, ang] = side === 0 ? [p, 0, Math.PI / 2] : side === 1 ? [15, p, Math.PI] : side === 2 ? [p, 15, -Math.PI / 2] : [0, p, 0];
    grow(x, y, ang + r.range(-0.4, 0.4), r.int(4, 6), 0.7, 1, 2);
  }
  network = pts;
  return pts;
}

function stage(img, n) {
  img.fill([0, 0, 0], 0);
  const limit = [0.28, 0.52, 0.76, 1.01][n - 1];
  for (const [x, y, t] of buildNetwork()) {
    if (t > limit || x < 0 || y < 0 || x > 15 || y > 15) continue;
    img.set(x, y, t < limit - 0.2 ? [8, 8, 8] : [24, 24, 24], 255);
  }
  return img;
}

export function overlayGenerator(name) {
  const m = /^destroy_(\d)$/.exec(name);
  if (!m) return null;
  const n = Math.max(1, Math.min(4, +m[1]));
  return (img) => stage(img, n);
}
export const OVERLAYS = {};
