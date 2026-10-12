// Procedurally generated palette-indexed art for gore and impact effects:
// blood splats, bullet holes, scorch marks and meat chunks. Everything is
// built from DOOM palette colours so it shades through COLORMAP like the
// original art.

import { IndexedImage } from '../wad/graphics.js';

let seed = 1337;
function rnd() {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return (seed >>> 8) / 16777216;
}

function ramp(res, from, to, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push(res.nearest(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t));
  }
  return out;
}

export const BLOOD_RGB = {
  red: [[176, 16, 8], [64, 0, 0]],
  green: [[60, 150, 40], [10, 40, 6]],
  blue: [[60, 70, 210], [8, 10, 70]],
};

function splat(res, size, colors, opts = {}) {
  const img = new IndexedImage(size, size);
  const c = size / 2;
  const blobs = [];
  const nb = 4 + Math.floor(rnd() * 5);
  for (let i = 0; i < nb; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * size * 0.18;
    blobs.push([c + Math.cos(a) * d, c + Math.sin(a) * d, size * (0.12 + rnd() * 0.16)]);
  }
  // Droplets thrown outward
  const nd = 6 + Math.floor(rnd() * 10);
  for (let i = 0; i < nd; i++) {
    const a = rnd() * Math.PI * 2;
    const d = size * (0.25 + rnd() * 0.22);
    blobs.push([c + Math.cos(a) * d, c + Math.sin(a) * d, 0.6 + rnd() * 1.4]);
  }
  // Drips (walls)
  if (opts.drips) {
    const ndr = 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < ndr; i++) {
      const x = c + (rnd() - 0.5) * size * 0.45;
      const len = size * (0.2 + rnd() * 0.3);
      for (let y = 0; y < len; y += 1) blobs.push([x + (rnd() - 0.5) * 0.4, c + y, Math.max(0.6, 1.4 - y / len)]);
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inside = 0;
      for (const [bx, by, r] of blobs) {
        const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by);
        if (d < r) inside = Math.max(inside, 1 - d / r);
      }
      if (inside > 0) {
        const i = y * size + x;
        const shade = Math.min(colors.length - 1, Math.floor((1 - inside) * colors.length * 0.7 + rnd() * 2.2));
        img.pixels[i] = colors[shade];
        img.mask[i] = 255;
      }
    }
  }
  return img;
}

function hole(res, size, dark, rim) {
  const img = new IndexedImage(size, size);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) + (rnd() - 0.5) * 0.8;
      const i = y * size + x;
      if (d < size * 0.22) { img.pixels[i] = dark[0]; img.mask[i] = 255; } else if (d < size * 0.36) { img.pixels[i] = dark[1]; img.mask[i] = 255; } else if (d < size * 0.5 && rnd() < 0.35) { img.pixels[i] = rim[Math.floor(rnd() * rim.length)]; img.mask[i] = 255; }
    }
  }
  return img;
}

function scorch(res, size, colors) {
  const img = new IndexedImage(size, size);
  const c = size / 2;
  const phase = rnd() * 10;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const a = Math.atan2(dy, dx);
      const wobble = 1 + 0.18 * Math.sin(a * 5 + phase) + 0.1 * Math.sin(a * 11 + phase * 2);
      const d = Math.hypot(dx, dy) / (c * wobble);
      if (d >= 1) continue;
      // Dithered falloff at the edge
      const keep = d < 0.55 || rnd() > (d - 0.55) / 0.45;
      if (!keep) continue;
      const i = y * size + x;
      const k = Math.min(colors.length - 1, Math.floor(d * colors.length * 0.9 + rnd() * 1.5));
      img.pixels[i] = colors[k];
      img.mask[i] = 255;
    }
  }
  return img;
}

function chunk(res, w, h, colors, hi) {
  const img = new IndexedImage(w, h);
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x + 0.5 - cx) / (w / 2), (y + 0.5 - cy) / (h / 2)) + (rnd() - 0.5) * 0.35;
      if (d > 1) continue;
      const i = y * w + x;
      let k = Math.min(colors.length - 1, Math.floor(d * colors.length + rnd()));
      img.pixels[i] = (y < cy - 1 && x < cx && rnd() < 0.3) ? hi : colors[k];
      img.mask[i] = 255;
    }
  }
  return img;
}

export function buildFxImages(res) {
  seed = 1337;
  const out = { splat: {}, wallSplat: {}, small: {}, holes: [], scorch: [], plasmaBurn: [], chunks: {} };
  for (const [name, [from, to]] of Object.entries(BLOOD_RGB)) {
    const colors = ramp(res, from, to, 6);
    out.splat[name] = [];
    out.wallSplat[name] = [];
    out.small[name] = [];
    for (let i = 0; i < 6; i++) out.splat[name].push(res.addImage(splat(res, 28 + Math.floor(rnd() * 16), colors), `fx-splat-${name}-${i}`));
    for (let i = 0; i < 6; i++) out.wallSplat[name].push(res.addImage(splat(res, 24 + Math.floor(rnd() * 14), colors, { drips: true }), `fx-wsplat-${name}-${i}`));
    for (let i = 0; i < 4; i++) out.small[name].push(res.addImage(splat(res, 10 + Math.floor(rnd() * 6), colors), `fx-small-${name}-${i}`));
    const meat = ramp(res, from.map((v, k) => Math.min(255, v + [60, 40, 40][k])), to, 5);
    const hi = res.nearest(230, 150, 140);
    out.chunks[name] = [];
    for (let i = 0; i < 6; i++) {
      const w = 4 + Math.floor(rnd() * 5), h = 3 + Math.floor(rnd() * 4);
      out.chunks[name].push(res.addImage(chunk(res, w, h, meat, name === 'red' ? hi : meat[0]), `fx-chunk-${name}-${i}`));
    }
  }
  const dark = [res.nearest(8, 8, 8), res.nearest(30, 28, 26)];
  const rim = ramp(res, [90, 86, 80], [50, 48, 44], 3);
  for (let i = 0; i < 4; i++) out.holes.push(res.addImage(hole(res, 5 + (i & 1), dark, rim), `fx-hole-${i}`));
  const soot = ramp(res, [6, 6, 6], [60, 52, 44], 6);
  for (let i = 0; i < 3; i++) out.scorch.push(res.addImage(scorch(res, 56 + i * 8, soot), `fx-scorch-${i}`));
  const burn = [res.nearest(200, 220, 255), res.nearest(80, 100, 220), res.nearest(20, 20, 60), res.nearest(10, 10, 20)];
  for (let i = 0; i < 2; i++) out.plasmaBurn.push(res.addImage(scorch(res, 18 + i * 4, burn), `fx-pburn-${i}`));
  // Colour ramps for particles.
  out.ramps = {
    red: ramp(res, BLOOD_RGB.red[0], BLOOD_RGB.red[1], 6),
    green: ramp(res, BLOOD_RGB.green[0], BLOOD_RGB.green[1], 6),
    blue: ramp(res, BLOOD_RGB.blue[0], BLOOD_RGB.blue[1], 6),
    spark: ramp(res, [255, 255, 200], [255, 120, 0], 6),
    fire: ramp(res, [255, 240, 120], [140, 20, 0], 8),
    smoke: ramp(res, [140, 140, 140], [40, 40, 40], 6),
    dust: ramp(res, [150, 140, 120], [70, 64, 56], 5),
    plasma: ramp(res, [220, 230, 255], [40, 60, 220], 6),
    bfg: ramp(res, [220, 255, 200], [20, 140, 20], 6),
    brass: ramp(res, [230, 190, 80], [120, 80, 20], 3),
    shell: ramp(res, [200, 30, 20], [100, 10, 5], 2),
    shellBase: ramp(res, [220, 190, 90], [140, 100, 40], 2),
    mag: ramp(res, [70, 70, 70], [30, 30, 30], 2),
  };
  return out;
}
