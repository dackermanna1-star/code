// Battlefield props. Origin at the base centre on the ground (parachute:
// harness point). Each kind builds a detailed lod0 and a cheap lod1;
// `variant` seeds shape/colour variation deterministically.

import * as THREE from 'three';
import { PROP_KINDS } from '../../sim/specs.js';
import { Part, Piece, box, cyl, lathe, icosphere, loft, prismX, makeRng, makeNoise, hashSeed, TAU } from './geom.js';
import { tyrePiece } from './ground.js';
import { sineField } from './palette.js';

const PI = Math.PI;

function mixHex(a, b, t) {
  const ch = (h, s) => (h >> s) & 255;
  const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}
function scaleHex(a, f) {
  const c = (s) => Math.max(0, Math.min(255, Math.round(((a >> s) & 255) * f)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

function propPalette(seed) {
  const varyF = sineField(seed ^ 0x9e37, 1.8);
  const v = (color, amt = 0.08) => ({ color, vary: amt, varyF });
  return {
    paint: v(0x6a6e58),
    bark: v(0x5b4636, 0.12),
    pineBark: v(0x6b4c37, 0.12),
    deadwood: v(0x7b7166, 0.14),
    rock: v(0x8b8579, 0.12),
    rockDark: v(0x6f6a60, 0.12),
    moss: v(0x5d6a3c, 0.12),
    sandbag: v(0xa8956c, 0.1),
    sandbag2: v(0x988660, 0.1),
    geo: v(0xa39b80, 0.08),
    dirt: v(0x6f5b42, 0.12),
    mesh: 0x3e3f3c,
    concrete: v(0xa6a299, 0.08),
    concreteDark: v(0x87837b, 0.08),
    steel: v(0x5d5d58, 0.08),
    darkSteel: v(0x3e3e3b, 0.06),
    rust: v(0x6e4024, 0.14),
    galv: v(0x8d9194, 0.06),
    olive: v(0x56603a, 0.08),
    oliveDark: v(0x434b2d, 0.08),
    wood: v(0x7a5d3e, 0.12),
    woodDark: v(0x5d4630, 0.12),
    timber: v(0x6c5840, 0.12),
    rope: 0x8d7e5f,
    black: { color: 0x141414, grime: false },
    glass: { color: 0x25303a, grime: false },
    lampGlass: { color: 0xe6e2cf, grime: false, ao: false },
    ceramic: v(0xc9c7bd, 0.04),
    insulGlass: v(0x4f7a62, 0.05),
    red: v(0x8c2a20, 0.06),
    blue: v(0x2f4c74, 0.06),
    white: v(0xd2d2cc, 0.05),
    fabric: v(0x5f6442, 0.06),
    fabric2: v(0x6b704b, 0.06),
    fabricIn: v(0x474b31, 0.06),
    line: 0xb0a88c,
    rubber: 0x1e1e1d,
    rubber2: 0x262624,
    lightGrey: 0xa9adb0,
    lightLens: { color: 0xe8e3cf, grime: false },
    redLens: { color: 0x8a1d14, grime: false },
    amberLens: { color: 0xb7781a, grime: false },
    burnt: v(0x2a2624, 0.15),
    ash: v(0x4b4744, 0.15),
    paintS: v(0x6a6e58),
    darkSteelS: 0x3e3e3b,
  };
}

// ---------------------------------------------------------------------------
// Vegetation

function greens(r, base) {
  const hue = r.range(-0.06, 0.06);
  const bright = r.range(0.85, 1.12);
  const b = scaleHex(base, bright);
  return {
    dark: scaleHex(mixHex(b, hue > 0 ? 0x3a4a1e : 0x203a2c, Math.abs(hue) * 4), 0.62),
    mid: mixHex(b, hue > 0 ? 0x5a6a2a : 0x2e5a40, Math.abs(hue) * 3),
    light: scaleHex(mixHex(b, 0x7f9a4a, 0.25 + hue), 1.12),
  };
}

function pineTree(r, lod) {
  const P = new Part('pineBark');
  const H = r.range(14, 20);
  const lean = [r.range(-0.03, 0.03), r.range(-0.03, 0.03)];
  const g = greens(r, 0x2f4a2c);
  const trunkTop = [lean[0] * H, H * 0.97, lean[1] * H];
  if (lod) {
    P.add(cyl(0.26, H * 0.4, 4, { r2: 0.16, caps: 'none', flat: true }), { at: [0, H * 0.2, 0], c: 'pineBark' });
    const cone = (y0, y1, rad, k) => {
      const ring = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + k;
        ring.push([Math.cos(a) * rad + lean[0] * y0, y0, Math.sin(a) * rad + lean[1] * y0]);
      }
      const apex = [lean[0] * y1, y1, lean[1] * y1];
      const p = new Piece();
      for (let i = 0; i < 7; i++) {
        const a = ring[i], b = ring[(i + 1) % 7];
        p.triF(a, b, apex, [a[0] + b[0], 0.6, a[2] + b[2]], [g.mid, g.mid, g.light]);
        p.triF(a, b, [lean[0] * y0, y0 + 0.6, lean[1] * y0], [0, -1, 0], [g.dark, g.dark, g.dark]);
      }
      P.add(p);
    };
    cone(H * 0.18, H * 0.68, H * 0.2, 0.2);
    cone(H * 0.5, H * 1.0, H * 0.13, 0.7);
    return P;
  }
  P.sweep([[0, -0.2, 0], [lean[0] * H * 0.4, H * 0.4, lean[1] * H * 0.4], trunkTop], (i) => [0.3, 0.18, 0.04][i], 7, { c: 'pineBark' });
  const tiers = r.int(6, 8);
  const bottom = H * r.range(0.18, 0.3);
  for (let t = 0; t < tiers; t++) {
    const u = t / (tiers - 1);
    const y0 = bottom + (H * 0.92 - bottom) * Math.pow(u, 0.9);
    const rad = H * (0.21 - 0.16 * u) * r.range(0.85, 1.12);
    const hgt = Math.min((H - bottom) / tiers * r.range(1.6, 2.0), H - y0);
    const n = 9;
    const cx = lean[0] * y0, cz = lean[1] * y0;
    const rot = r.range(0, TAU);
    const rim = [], mid = [];
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU;
      const rr = rad * (i % 2 ? r.range(0.72, 0.88) : r.range(0.95, 1.12));
      rim.push([cx + Math.cos(a) * rr, y0 - rad * 0.12 * r.range(0.6, 1.4), cz + Math.sin(a) * rr]);
      mid.push([cx + Math.cos(a + 0.2) * rr * 0.55, y0 + hgt * 0.32, cz + Math.sin(a + 0.2) * rr * 0.55]);
    }
    const apex = [lean[0] * (y0 + hgt), y0 + hgt, lean[1] * (y0 + hgt)];
    const under = [cx, y0 + hgt * 0.12, cz];
    const p = new Piece();
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const out = [rim[i][0] + rim[j][0] - 2 * cx, 0.5, rim[i][2] + rim[j][2] - 2 * cz];
      p.triF(rim[i], rim[j], mid[j], out, [g.light, g.light, g.mid]);
      p.triF(rim[i], mid[j], mid[i], out, [g.light, g.mid, g.mid]);
      p.triF(mid[i], mid[j], apex, out, [g.mid, g.mid, t === tiers - 1 ? g.light : g.dark]);
      p.triF(rim[i], rim[j], under, [0, -1, 0], [g.dark, g.dark, scaleHex(g.dark, 0.7)]);
    }
    P.add(p.normals(60));
  }
  return P;
}

function crownBlob(r, center, rad, detail, g, squash = 0.8) {
  const n = makeNoise(r.int(1, 1e9));
  const P = icosphere(detail, (d) => {
    const k = 1 + 0.28 * n(d[0] * 1.7, d[1] * 1.7, d[2] * 1.7) + 0.12 * n(d[0] * 4, d[1] * 4, d[2] * 4);
    return [center[0] + d[0] * rad * k, center[1] + d[1] * rad * k * squash, center[2] + d[2] * rad * k];
  });
  P.normals(80);
  // colour by height within the blob: lighter crown top, dark underside
  const p = P.p;
  for (let t = 0; t < P.m.length; t++) {
    const cols = [];
    for (let k = 0; k < 3; k++) {
      const y = (p[t * 9 + k * 3 + 1] - center[1]) / rad;
      cols.push(y > 0.35 ? g.light : y > -0.3 ? g.mid : g.dark);
    }
    P.m[t] = cols;
  }
  return P;
}

function broadleafTree(r, lod) {
  const P = new Part('bark');
  const H = r.range(9, 13);
  const g = greens(r, 0x4a6a2e);
  const trunkH = H * r.range(0.32, 0.45);
  const lean = [r.range(-0.04, 0.04), r.range(-0.04, 0.04)];
  if (lod) {
    P.add(cyl(0.3, trunkH + 0.5, 4, { r2: 0.2, caps: 'none', flat: true }), { at: [0, (trunkH + 0.5) / 2 - 0.2, 0], c: 'bark' });
    const blob = crownBlob(r, [lean[0] * H, H * 0.62, lean[1] * H], H * 0.36, 0, g, 0.78);
    P.add(blob);
    return P;
  }
  const top = [lean[0] * trunkH, trunkH, lean[1] * trunkH];
  P.sweep([[0, -0.2, 0], [lean[0] * trunkH * 0.5, trunkH * 0.5, lean[1] * trunkH * 0.5], top], (i) => [0.36, 0.28, 0.2][i], 6, { c: 'bark' });
  const nb = r.int(3, 4);
  const blobs = [];
  for (let b = 0; b < nb; b++) {
    const a = (b / nb) * TAU + r.range(-0.4, 0.4);
    const spread = H * r.range(0.16, 0.26);
    const end = [top[0] + Math.cos(a) * spread, H * r.range(0.6, 0.72), top[2] + Math.sin(a) * spread];
    const midp = [(top[0] + end[0]) / 2, (top[1] + end[1]) / 2 + 0.3, (top[2] + end[2]) / 2];
    P.sweep([top, midp, end], (i) => [0.18, 0.13, 0.07][i], 4, { c: 'bark' });
    blobs.push([end, H * r.range(0.2, 0.26)]);
  }
  blobs.push([[top[0] + lean[0] * H * 0.5, H * r.range(0.74, 0.82), top[2] + lean[1] * H * 0.5], H * r.range(0.24, 0.3)]);
  for (const [c, rad] of blobs) P.add(crownBlob(r, c, rad, 1, g, r.range(0.72, 0.9)));
  return P;
}

function deadTree(r, lod) {
  const P = new Part('deadwood');
  const H = r.range(8.0, 9.8);
  const bend = [r.range(-0.6, 0.6), r.range(-0.6, 0.6)];
  const trunk = [[0, -0.2, 0], [bend[0] * 0.3, H * 0.35, bend[1] * 0.3], [bend[0], H * 0.7, bend[1]], [bend[0] * 1.3, H, bend[1] * 1.3]];
  if (lod) {
    P.sweep([trunk[0], trunk[2], trunk[3]], (i) => [0.3, 0.14, 0.03][i], 3, { c: 'deadwood', flat: true });
    for (let b = 0; b < 3; b++) {
      const a = (b / 3) * TAU + r.range(0, 1);
      const s = trunk[1 + (b % 2)];
      P.tube(s, [s[0] + Math.cos(a) * H * 0.25, s[1] + H * 0.18, s[2] + Math.sin(a) * H * 0.25], 0.09, 0.02, 3, { c: 'deadwood', flat: true });
    }
    return P;
  }
  P.sweep(trunk, (i) => [0.32, 0.24, 0.14, 0.04][i], 7, { c: 'deadwood' });
  const branch = (start, dir, len, rad, depth) => {
    const mid = [start[0] + dir[0] * len * 0.5 + r.range(-0.2, 0.2), start[1] + dir[1] * len * 0.5 + r.range(0, 0.25), start[2] + dir[2] * len * 0.5 + r.range(-0.2, 0.2)];
    const end = [start[0] + dir[0] * len, start[1] + dir[1] * len, start[2] + dir[2] * len];
    P.sweep([start, mid, end], (i) => [rad, rad * 0.6, rad * 0.2][i], depth ? 4 : 5, { c: 'deadwood' });
    if (depth < 1) {
      for (let k = 0; k < 2; k++) {
        const a = r.range(0, TAU);
        const nd = [dir[0] * 0.5 + Math.cos(a) * 0.6, dir[1] * 0.6 + 0.3, dir[2] * 0.5 + Math.sin(a) * 0.6];
        const l = Math.hypot(...nd);
        branch(mid, nd.map((q) => q / l), len * r.range(0.4, 0.6), rad * 0.5, depth + 1);
      }
    }
  };
  const nb = r.int(4, 6);
  for (let b = 0; b < nb; b++) {
    const t = r.range(0.4, 0.9);
    const seg = t < 0.7 ? 1 : 2;
    const s = trunk[seg], e = trunk[seg + 1];
    const u = r.range(0, 1);
    const start = [s[0] + (e[0] - s[0]) * u, s[1] + (e[1] - s[1]) * u, s[2] + (e[2] - s[2]) * u];
    const a = (b / nb) * TAU + r.range(-0.3, 0.3);
    const d = [Math.cos(a) * 0.8, r.range(0.3, 0.7), Math.sin(a) * 0.8];
    const l = Math.hypot(...d);
    branch(start, d.map((q) => q / l), H * r.range(0.2, 0.3), 0.12 * (1.2 - t), 0);
  }
  return P;
}

function bush(r, lod) {
  const P = new Part();
  const g = greens(r, 0x4d6530);
  const s = r.range(0.85, 1.2);
  if (lod) {
    P.add(crownBlob(r, [0, 0.55 * s, 0], 0.85 * s, 0, g, 0.7));
    return P;
  }
  const n = r.int(3, 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r.range(0, 1);
    const d = i === 0 ? 0 : r.range(0.35, 0.6) * s;
    const rad = (i === 0 ? 0.62 : r.range(0.38, 0.52)) * s;
    P.add(crownBlob(r, [Math.cos(a) * d, rad * 0.75, Math.sin(a) * d], rad, 1, g, 0.82));
  }
  return P;
}

function rock(r, lod) {
  const P = new Part();
  const n = makeNoise(r.int(1, 1e9));
  const s = [r.range(0.7, 1.0), r.range(0.45, 0.75), r.range(0.6, 0.95)];
  const sc = r.range(0.85, 1.25);
  const disp = (d) => {
    const k = 1 + 0.32 * n(d[0] * 1.3, d[1] * 1.3, d[2] * 1.3) + 0.12 * n(d[0] * 3.3, d[1] * 3.3, d[2] * 3.3);
    // flatten facets a little for a fractured look
    return [d[0] * s[0] * k * sc, Math.max(-0.15, d[1] * s[1] * k * sc + s[1] * sc * 0.55), d[2] * s[2] * k * sc];
  };
  const piece = icosphere(lod ? 0 : 2, disp).normals(0);
  const moss = r() < 0.6;
  const tone = r.pick([0x8b8579, 0x857d70, 0x7d7b74, 0x938a7a]);
  const p = piece.p;
  for (let t = 0; t < piece.m.length; t++) {
    const i = t * 9;
    const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2];
    const vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
    const ny = (uz * vx - ux * vz) / (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) || 1);
    const xc = (p[i] + p[i + 3] + p[i + 6]) / 3, yc = (p[i + 1] + p[i + 4] + p[i + 7]) / 3, zc = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
    const k = n(xc * 1.6 + 5, yc * 1.6, zc * 1.6);
    if (moss && ny > 0.7 && yc > s[1] * sc * 0.55 && k > -0.15) piece.m[t] = 'moss';
    else piece.m[t] = scaleHex(tone, 0.9 + 0.22 * k + 0.08 * ny);
  }
  P.add(piece);
  return P;
}

// ---------------------------------------------------------------------------
// Fortifications

function sandbagPiece(l, h, d, cap) {
  // rounded six-point section, ends pinched where the bag is folded under
  const sec = (x, k) => [[-d / 2, h * 0.35], [-d * 0.3, h], [d * 0.3, h], [d / 2, h * 0.35], [d * 0.3, 0], [-d * 0.3, 0]]
    .map(([z, y]) => [x, y * (k < 1 ? 0.82 : 1), z * k]);
  return loft([sec(-l / 2, 0.7), sec(0, 1), sec(l / 2, 0.7)], { caps: cap ? 'both' : 'none', smooth: 60 });
}

function sandbags(r, lod) {
  const P = new Part('sandbag');
  if (lod) {
    P.prismX([[-0.4, 0], [-0.3, 0.9], [0.3, 0.9], [0.4, 0]], -1.5, 1.5, { c: 'sandbag' });
    return P;
  }
  const rows = 4, bh = 0.235, L = 3.0;
  for (let row = 0; row < rows; row++) {
    const deep = row < 2 ? 2 : 1;
    const per = 5;
    const bl = L / per;
    for (let k = 0; k < deep; k++) {
      const z = deep === 2 ? (k ? -0.2 : 0.2) : r.range(-0.03, 0.03);
      const off = row % 2 ? bl / 2 : 0;
      for (let i = 0; i < per + (row % 2 ? -1 : 0) + (row % 2 ? 0 : 0); i++) {
        const x = -L / 2 + bl / 2 + i * bl + off;
        const piece = sandbagPiece(bl * r.range(0.94, 1.02), bh * r.range(0.95, 1.08), (deep === 2 ? 0.4 : 0.42) * r.range(0.95, 1.05), i === 0 || i === per - 1);
        P.add(piece, { at: [x, row * bh * 0.94, z], rot: [0, r.range(-0.06, 0.06), r.range(-0.03, 0.03)], c: (i + row + k) % 3 ? 'sandbag' : 'sandbag2' });
      }
    }
  }
  return P;
}

function hesco(r, lod) {
  const P = new Part('geo');
  const W = 1.1, H = 1.4, D = 1.1;
  if (lod) {
    P.box(3 * W, H, D, { at: [0, H / 2, 0], noBottom: true, c: 'geo' });
    P.box(3 * W - 0.1, 0.06, D - 0.1, { at: [0, H + 0.01, 0], c: 'dirt' });
    return P;
  }
  for (let c = 0; c < 3; c++) {
    const x = (c - 1) * W;
    const ring = (y, b) => {
      const w = W / 2 + b, d = D / 2 + b, ch = 0.06;
      return [[x + w - ch, y, d], [x + w, y, d - ch], [x + w, y, -d + ch], [x + w - ch, y, -d], [x - w + ch, y, -d], [x - w, y, -d + ch], [x - w, y, d - ch], [x - w + ch, y, d]];
    };
    const bulge = r.range(0.015, 0.04);
    P.loft([ring(0, -0.01), ring(0.35, bulge), ring(H - 0.3, bulge * 0.8), ring(H - 0.02, 0)], { caps: 'none', c: 'geo' });
    // domed dirt fill
    const top = ring(H - 0.04, -0.03);
    const pk = new Piece();
    const apex = [x + r.range(-0.1, 0.1), H + r.range(0.04, 0.1), r.range(-0.1, 0.1)];
    for (let i = 0; i < 8; i++) pk.triF(top[i], top[(i + 1) % 8], apex, [0, 1, 0]);
    P.add(pk.normals(50), { c: 'dirt' });
    // wire mesh frame: corner posts and horizontal wire bands
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      P.box(0.025, H, 0.025, { at: [x + sx * (W / 2 + 0.01), H / 2, sz * (D / 2 + 0.01)], c: 'mesh', noBottom: true });
    }
    for (const y of [0.25, 0.7, 1.15]) {
      const b = ring(y, bulge + 0.006), t2 = ring(y + 0.025, bulge + 0.006);
      P.loft([b, t2], { caps: 'none', c: 'mesh' });
    }
    for (const sx of [-0.25, 0, 0.25]) {
      P.box(0.012, H, 0.01, { at: [x + sx, H / 2, D / 2 + bulge + 0.008], c: 'mesh', noBottom: true });
      P.box(0.012, H, 0.01, { at: [x + sx, H / 2, -D / 2 - bulge - 0.008], c: 'mesh', noBottom: true });
    }
  }
  return P;
}

function jerseyBarrier(r, lod) {
  const P = new Part('concrete');
  const prof = lod
    ? [[-0.3, 0], [-0.3, 0.1], [-0.08, 0.8], [0.08, 0.8], [0.3, 0.1], [0.3, 0]]
    : [[-0.3, 0], [-0.3, 0.075], [-0.2, 0.25], [-0.09, 0.78], [-0.075, 0.8], [0.075, 0.8], [0.09, 0.78], [0.2, 0.25], [0.3, 0.075], [0.3, 0]];
  P.prismX(prof, -1.5, 1.5, { c: 'concrete' });
  if (lod) return P;
  // drainage slots, lifting loops, chipped ends, grime
  for (const x of [-0.9, 0.9]) P.box(0.4, 0.08, 0.62, { at: [x, 0.04, 0], c: 'black' });
  for (const x of [-1.0, 1.0]) P.box(0.04, 0.08, 0.1, { at: [x, 0.83, 0], c: 'rust' });
  P.box(2.96, 0.08, 0.02, { at: [0, 0.12, 0.282], rot: [-0.55, 0, 0], c: 'concreteDark' });
  P.box(2.96, 0.08, 0.02, { at: [0, 0.12, -0.282], rot: [0.55, 0, 0], c: 'concreteDark' });
  return P;
}

function lAngle(len, w, t) {
  const prof = [[0, 0], [w, 0], [w, t], [t, t], [t, w], [0, w]].map(([a, b]) => [a - w / 3, b - w / 3]);
  return loft([prof.map(([x, y]) => [x, y, -len / 2]), prof.map(([x, y]) => [x, y, len / 2])]);
}

function tankTrap(r, lod) {
  const P = new Part('rust');
  const L = 2.2 * r.range(0.95, 1.05);
  const beam = lod ? box(0.1, 0.1, L) : lAngle(L, 0.14, 0.022);
  // orthogonal beams with the (1,1,1) diagonal pointing up -> stands on three ends
  const up = [1, 1, 1].map((q) => q / Math.sqrt(3));
  const yaw = r.range(0, TAU);
  // rotation taking (1,1,1)/sqrt3 to +Y: about axis (1,0,-1) by acos(1/sqrt3)
  const ang = Math.acos(up[1]);
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const h = L * 0.5 * Math.cos(ang);
  P.group({ at: [0, h - 0.02, 0], rot: [0, yaw, 0] }, () => {
    P.group({ m4: axisAngle([1, 0, -1], ang) }, () => {
      P.add(beam, { rot: [0, PI / 2, 0], c: 'rust' });
      P.add(beam, { rot: [PI / 2, 0, 0], c: 'rust' });
      P.add(beam, { c: 'rust' });
      if (!lod) {
        for (const ax of axes) P.box(0.2, 0.2, 0.02, { at: ax.map((q) => q * 0.08), rot: ax[1] ? [PI / 2, 0, 0] : ax[0] ? [0, PI / 2, 0] : [0, 0, 0], c: 'darkSteel' });
      }
    });
  });
  return P;
}

function axisAngle(axis, angle) {
  return new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(...axis).normalize(), angle);
}

function crates(r, lod) {
  const P = new Part('olive');
  const list = [
    [0, 0, 0, 1.2, 0.5, 0.6], [0, 0, 0.65, 1.2, 0.5, 0.6], [1.25, 0, 0.3, 0.9, 0.45, 0.6],
    [0.1, 0.5, 0.3, 1.2, 0.5, 0.6], [1.2, 0.45, 0.25, 0.7, 0.4, 0.5], [0.05, 1.0, 0.25, 0.9, 0.42, 0.55],
    [0.25, 1.42, 0.3, 0.6, 0.35, 0.45], [-0.95, 0, 0.3, 0.6, 0.6, 0.6],
  ];
  const n = lod ? 3 : r.int(6, 8);
  for (let i = 0; i < n; i++) {
    const [x, y, z, w, h, d] = list[i];
    const at = [x - 0.2, y + h / 2, z - 0.3];
    const ry = r.range(-0.08, 0.08);
    const wood = (i + r.int(0, 2)) % 3 === 0;
    const c = wood ? 'wood' : 'olive';
    if (lod) { P.box(w, h, d, { at, rot: [0, ry, 0], c, noBottom: true }); continue; }
    P.group({ at, rot: [0, ry, 0] }, () => {
      P.box(w, h, d, { c, noBottom: true });
      P.box(w + 0.02, 0.04, d + 0.02, { at: [0, h / 2 - 0.03, 0], c: wood ? 'woodDark' : 'oliveDark' });
      P.box(0.06, h - 0.06, d + 0.03, { at: [w / 2 - 0.08, -0.02, 0], c: wood ? 'woodDark' : 'oliveDark' });
      P.box(0.06, h - 0.06, d + 0.03, { at: [-w / 2 + 0.08, -0.02, 0], c: wood ? 'woodDark' : 'oliveDark' });
      P.box(0.14, 0.03, 0.04, { at: [0, 0.05, d / 2 + 0.02], c: 'rope' });
      P.box(0.05, 0.05, 0.04, { at: [w * 0.3, h / 2 - 0.06, d / 2 + 0.015], c: 'darkSteel' });
    });
  }
  return P;
}

function drumPiece(lod) {
  if (lod) return cyl(0.29, 0.88, 4, { caps: 'end', flat: true, phase: PI / 4 }).transform({ at: [0, 0.44, 0] });
  const P = lathe([[0.29, 0], [0.29, 0.86], [0.27, 0.88], [0, 0.875]], 10, { crease: 50 });
  for (const y of [0.3, 0.58]) P.append(cyl(0.302, 0.025, 10, { caps: 'none' }).transform({ at: [0, y, 0] }));
  P.append(cyl(0.03, 0.02, 5, { caps: 'end' }).transform({ at: [0.17, 0.885, 0] }).setMat('darkSteel'));
  return P;
}

function fuelDrums(r, lod) {
  const P = new Part('olive');
  const cols = ['olive', 'olive', 'blue', 'red', 'rust', 'darkSteel'];
  const n = lod ? 5 : r.int(4, 6);
  const spots = [[0, 0], [0.62, 0.05], [-0.6, 0.08], [0.3, -0.58], [-0.3, -0.56], [0.9, -0.6]];
  const piece = drumPiece(lod);
  for (let i = 0; i < n; i++) {
    const [x, z] = spots[i];
    P.add(piece, { at: [x + r.range(-0.04, 0.04), 0, z + r.range(-0.04, 0.04)], rot: [0, r.range(0, TAU), 0], c: r.pick(cols) });
  }
  if (!lod) P.add(piece, { at: [0.1, 0.29, 0.95], rot: [0, r.range(-0.4, 0.4), PI / 2], order: 'YZX', c: r.pick(cols) });
  return P;
}

function fuelTank(r, lod) {
  const P = new Part('olive');
  const col = r.pick(['olive', 'white', 'galv']);
  const R = 1.3, L = 8, cy = 1.55;
  if (lod) {
    P.add(cyl(R, L, 8, { axis: 'x', flat: false }), { at: [0, cy, 0], c: col });
    P.box(0.5, cy - 0.6, 2.2, { at: [0, (cy - 0.6) / 2, 0], c: 'concrete', noBottom: true });
    return P;
  }
  P.add(lathe([[0, -L / 2 - 0.35], [R * 0.6, -L / 2 - 0.25], [R * 0.92, -L / 2 - 0.08], [R, -L / 2 + 0.05], [R, L / 2 - 0.05], [R * 0.92, L / 2 + 0.08], [R * 0.6, L / 2 + 0.25], [0, L / 2 + 0.35]], 16, { axis: 'x', crease: 35 }), { at: [0, cy, 0], c: col });
  for (const x of [-3.4, 0, 3.4]) P.add(cyl(R + 0.015, 0.08, 16, { axis: 'x', caps: 'none' }), { at: [x, cy, 0], c: 'darkSteel' });
  // concrete saddles
  for (const x of [-2.6, 2.6]) {
    const prof = [[-1.0, 0], [1.0, 0], [1.0, 0.75]];
    for (let k = 0; k <= 6; k++) {
      const a = PI * (0.18 + 0.64 * (k / 6));
      prof.push([Math.cos(a) * -R * 1.0 * 0.98 + 0, cy - Math.sin(a) * R * 0.99]);
    }
    prof.push([-1.0, 0.75]);
    const pts = prof.map(([z, y]) => [z, y]);
    P.add(prismX(pts.map(([z, y]) => [z, y]), x - 0.25, x + 0.25), { c: 'concrete' });
  }
  // manhole, vent, ladder, valve pipe
  P.add(cyl(0.3, 0.12, 10, { caps: 'end' }), { at: [0.8, cy + R + 0.04, 0], c: 'darkSteel' });
  P.add(cyl(0.05, 0.4, 6), { at: [-1.5, cy + R + 0.15, 0], c: 'darkSteel' });
  const rail = (x, t) => [x, (cy + R * 0.85) * t, R + 0.3 - (R * 0.5 - 0) * t * 0.0 - (R + 0.3 - R * 0.5) * t];
  for (const x of [1.8, 2.25]) P.tube(rail(x, 0), rail(x, 1), 0.025, 0.025, 4, { c: 'darkSteel' });
  for (let i = 1; i < 7; i++) P.tube(rail(1.8, i / 7), rail(2.25, i / 7), 0.015, 0.015, 3, { c: 'darkSteel' });
  P.tube([L / 2 + 0.3, cy - 0.6, 0], [L / 2 + 0.3, 0.3, 0], 0.07, 0.07, 6, { c: 'darkSteel' });
  P.box(0.25, 0.25, 0.25, { at: [L / 2 + 0.3, 0.35, 0], c: 'red' });
  return P;
}

// ---------------------------------------------------------------------------
// Structures

function radioMast(r, lod) {
  const P = new Part('galv');
  const H = 30, s = 0.45;
  const legPts = [0, 1, 2].map((k) => {
    const a = (k / 3) * TAU + PI / 2;
    return [Math.cos(a) * s / Math.sqrt(3), Math.sin(a) * s / Math.sqrt(3)];
  });
  if (lod) {
    P.add(cyl(0.3, H, 3, { r2: 0.2, caps: 'none', flat: true }), { at: [0, H / 2, 0], c: 'galv' });
    P.tube([0, H, 0], [0, H + 3, 0], 0.03, 0.02, 3, { c: 'darkSteel' });
    return P;
  }
  for (const [x, z] of legPts) P.tube([x, 0, z], [x, H, z], 0.035, 0.03, 3, { c: 'galv' });
  const bay = 1.5;
  for (let i = 0; i < H / bay; i++) {
    for (let k = 0; k < 3; k++) {
      const a = legPts[k], b = legPts[(k + 1) % 3];
      const y0 = i * bay, y1 = (i + 1) * bay;
      if (i % 2) P.tube([a[0], y0, a[1]], [b[0], y1, b[1]], 0.012, 0.012, 3, { c: 'galv' });
      else P.tube([b[0], y0, b[1]], [a[0], y1, a[1]], 0.012, 0.012, 3, { c: 'galv' });
    }
  }
  // top antennas, platform, aviation light housing
  P.box(0.9, 0.05, 0.9, { at: [0, H, 0], c: 'darkSteel' });
  P.tube([0, H, 0], [0, H + 3.5, 0], 0.04, 0.015, 4, { c: 'darkSteel' });
  for (const a of [0, 2.1, 4.2]) P.tube([Math.cos(a) * 0.3, H - 1.5, Math.sin(a) * 0.3], [Math.cos(a) * 1.4, H - 1.4, Math.sin(a) * 1.4], 0.015, 0.01, 3, { c: 'darkSteel' });
  P.box(0.5, 0.8, 0.12, { at: [0.35, H - 4, 0.3], rot: [0, 0.6, 0], c: 'lightGrey' });
  P.box(0.12, 0.12, 0.12, { at: [0, H + 0.1, 0.3], c: 'red' });
  // guy wires at two levels to three anchors, base plate, equipment box
  for (const k of [0, 1, 2]) {
    const a = (k / 3) * TAU + 0.3;
    const anchor = [Math.cos(a) * 14, 0.15, Math.sin(a) * 14];
    for (const y of [12, 26]) P.tube(anchor, [legPts[k][0], y, legPts[k][1]], 0.008, 0.008, 3, { c: 'darkSteel' });
    P.box(0.5, 0.3, 0.5, { at: [anchor[0], 0.1, anchor[2]], c: 'concrete' });
  }
  P.box(1.2, 0.25, 1.2, { at: [0, 0.1, 0], c: 'concrete' });
  P.box(0.8, 1.2, 0.5, { at: [1.3, 0.6, -0.8], c: 'olive' });
  return P;
}

function guardTower(r, lod) {
  const P = new Part('timber');
  const deck = 5.4, half = 1.0, foot = 1.35;
  const legs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  if (lod) {
    for (const [sx, sz] of legs) P.tube([sx * foot, 0, sz * foot], [sx * half, deck, sz * half], 0.1, 0.1, 4, { c: 'timber', flat: true });
    P.box(2.6, 1.9, 2.6, { at: [0, deck + 0.95, 0], c: 'timber' });
    P.add(lathe([[1.8, 0], [0, 1.0]], 4, { phase: PI / 4 }), { at: [0, deck + 1.9, 0], c: 'darkSteel' });
    return P;
  }
  for (const [sx, sz] of legs) P.tube([sx * foot, 0, sz * foot], [sx * half, deck, sz * half], 0.11, 0.1, 4, { c: 'timber', flat: true });
  // bracing: horizontal ring beams and diagonals on each side
  for (const y of [1.8, 3.6]) {
    const w = foot + (half - foot) * (y / deck);
    for (let k = 0; k < 4; k++) {
      const a = legs[[0, 1, 3, 2][k]], b = legs[[0, 1, 3, 2][(k + 1) % 4]];
      P.tube([a[0] * w, y, a[1] * w], [b[0] * w, y, b[1] * w], 0.06, 0.06, 4, { c: 'timber', flat: true });
    }
  }
  for (let k = 0; k < 4; k++) {
    const a = legs[[0, 1, 3, 2][k]], b = legs[[0, 1, 3, 2][(k + 1) % 4]];
    const w0 = foot + (half - foot) * (0.2 / deck), w1 = foot + (half - foot) * (1.8 / deck);
    const w2 = foot + (half - foot) * (3.6 / deck), w3 = foot + (half - foot) * (deck - 0.1) / deck;
    P.tube([a[0] * w0, 0.2, a[1] * w0], [b[0] * w1, 1.8, b[1] * w1], 0.045, 0.045, 3, { c: 'woodDark', flat: true });
    P.tube([a[0] * w1, 1.8, a[1] * w1], [b[0] * w2, 3.6, b[1] * w2], 0.045, 0.045, 3, { c: 'woodDark', flat: true });
    P.tube([a[0] * w2, 3.6, a[1] * w2], [b[0] * w3, deck - 0.1, b[1] * w3], 0.045, 0.045, 3, { c: 'woodDark', flat: true });
  }
  // cabin: floor, half-height walls, corner posts, window band, hip roof
  P.box(2.8, 0.15, 2.8, { at: [0, deck + 0.05, 0], c: 'woodDark' });
  for (const [x, z, w, d] of [[0, 1.3, 2.6, 0.08], [0, -1.3, 2.6, 0.08], [1.3, 0, 0.08, 2.6], [-1.3, 0, 0.08, 2.6]]) {
    P.box(w, 1.05, d, { at: [x, deck + 0.65, z], c: 'timber' });
  }
  for (const [sx, sz] of legs) P.box(0.12, 2.0, 0.12, { at: [sx * 1.3, deck + 1.1, sz * 1.3], c: 'woodDark' });
  P.add(lathe([[2.05, 0], [0, 1.0]], 4, { phase: PI / 4 }), { at: [0, deck + 2.1, 0], c: 'darkSteel' });
  P.add(cyl(2.05, 0.06, 4, { caps: 'both', phase: PI / 4, flat: true }), { at: [0, deck + 2.08, 0], c: 'darkSteel' });
  // sandbags on the floor, searchlight, ladder
  P.box(2.2, 0.35, 0.4, { at: [0, deck + 0.3, 1.0], c: 'sandbag' });
  P.add(cyl(0.18, 0.3, 8, { axis: 'z', caps: 'both', capMat: 'lampGlass' }), { at: [0.9, deck + 1.35, 1.3], c: 'darkSteel' });
  const lz = foot + 0.25;
  for (const sx of [-0.25, 0.25]) P.tube([sx, 0, lz], [sx, deck, half + 0.2], 0.035, 0.035, 4, { c: 'timber', flat: true });
  for (let i = 1; i < 11; i++) {
    const t = i / 11;
    const z = lz + (half + 0.2 - lz) * t;
    P.tube([-0.25, deck * t, z], [0.25, deck * t, z], 0.02, 0.02, 3, { c: 'woodDark', flat: true });
  }
  return P;
}

// ---------------------------------------------------------------------------
// Vehicles: civilian sedan and burnt wreck

const CAR_COLOURS = [0xd9d9d5, 0xa9adb1, 0x8c1d1b, 0x24426d, 0x1d1e20, 0xbdae8c, 0x3d5838, 0x5a5f66, 0xd2a21f, 0x6b2f45];

function carBody(P, wreck, r) {
  const sec = (z, yb, yt, w, wt) => [[w * 0.92, yb], [w, yb + 0.12], [w, yt - 0.1], [wt, yt]];
  const rings = (sections) => sections.map(([z, half]) => {
    const ring = half.map(([x, y]) => [x, y, z]);
    for (let i = half.length - 1; i >= 0; i--) ring.push([-half[i][0], half[i][1], z]);
    return ring;
  });
  const drop = wreck ? -0.16 : 0;
  const n = wreck ? makeNoise(r.int(1, 1e9)) : null;
  const dent = (p) => (n ? [p[0] + n(p[0] * 2, p[1] * 2, p[2] * 2) * 0.05, p[1] + n(p[2] * 2, p[0] * 2, p[1] * 2) * 0.05, p[2]] : p);
  // lower body: bumper to bumper, beltline ~0.95
  const lower = loft(rings([
    [2.25, sec(2.25, 0.32, 0.72, 0.8, 0.7)],
    [2.1, sec(2.1, 0.28, 0.8, 0.88, 0.76)],
    [1.2, sec(1.2, 0.28, 0.9, 0.9, 0.8)],
    [-1.4, sec(-1.4, 0.28, 0.96, 0.9, 0.82)],
    [-2.05, sec(-2.05, 0.3, 0.96, 0.88, 0.78)],
    [-2.25, sec(-2.25, 0.34, 0.86, 0.82, 0.72)],
  ]));
  lower.normals(38);
  if (wreck) lower.map((p) => dent([p[0], p[1] + drop, p[2]])).normals(38);
  P.add(lower, { c: wreck ? 'burnt' : 'paint' });
  // greenhouse: pillars + roof (wreck: no glass, sagging roof)
  const gh = (z, y0, y1, w0, w1) => [[w0, y0, z], [w1, y1, z], [-w1, y1, z], [-w0, y0, z]];
  const ghRings = [gh(1.15, 0.9, 0.95, 0.8, 0.78), gh(0.45, 0.92, 1.42, 0.8, 0.66), gh(-0.85, 0.94, 1.44, 0.82, 0.66), gh(-1.85, 0.96, 1.0, 0.8, 0.74)];
  if (!wreck) {
    const cab = loft(ghRings, { caps: 'none' });
    // windows on the glass bands, pillars as body colour
    cab.normals(25);
    for (let t = 0; t < cab.m.length; t++) cab.m[t] = 'glass';
    P.add(cab);
    P.box(1.36, 0.05, 1.32, { at: [0, 1.44, -0.2], c: 'paint' });
    for (const z of [0.42, -0.2, -0.86]) P.mirrorX(() => P.box(0.07, 0.5, 0.08, { at: [0.74, 1.18, z], rot: [0, 0, 0.25], c: z === -0.2 ? 'black' : 'paint' }));
  } else {
    const sag = (q) => [q[0], q[1] - (q[1] > 1.2 ? r.range(0.12, 0.3) : 0) + drop, q[2]];
    for (const [i, j] of [[0, 1], [1, 2], [2, 3]]) {
      P.mirrorX(() => P.tube(sag(ghRings[i][0]), sag(ghRings[j][1]), 0.04, 0.04, 4, { c: 'rust' }));
    }
    const roof = new Piece().quadF(sag(ghRings[1][1]), sag(ghRings[2][1]), sag(ghRings[2][2]), sag(ghRings[1][2]), [0, 1, 0]);
    roof.append(new Piece().quadF(sag(ghRings[1][1]), sag(ghRings[2][1]), sag(ghRings[2][2]), sag(ghRings[1][2]), [0, -1, 0]));
    P.add(roof.map(dent).normals(0), { c: 'burnt' });
    // charred interior
    P.box(1.5, 0.35, 2.6, { at: [0, 0.75 + drop, -0.35], c: 'ash' });
    P.box(1.3, 0.5, 0.15, { at: [0, 1.0 + drop, -0.1], rot: [0.3, 0, 0], c: 'rust' });
  }
  return drop;
}

function car(r, lod, variant, wreck) {
  const P = new Part('paint');
  const drop = wreck ? -0.16 : 0;
  if (lod) {
    P.box(1.78, 0.62, 4.5, { at: [0, 0.6 + drop, 0], c: wreck ? 'burnt' : 'paint', noBottom: true });
    P.loft([
      [[0.8, 0.9 + drop, 1.1], [0.8, 0.9 + drop, -1.85], [-0.8, 0.9 + drop, -1.85], [-0.8, 0.9 + drop, 1.1]],
      [[0.66, 1.42 + drop, 0.45], [0.66, 1.42 + drop, -0.9], [-0.66, 1.42 + drop, -0.9], [-0.66, 1.42 + drop, 0.45]],
    ], { caps: 'end', c: wreck ? 'burnt' : 'glass' });
    for (const [x, z] of [[0.76, 1.35], [-0.76, 1.35], [0.76, -1.35], [-0.76, -1.35]]) P.box(0.22, 0.6, 0.6, { at: [x, 0.3 + drop * 0.5, z], c: wreck ? 'rust' : 'rubber', noBottom: true, noTop: true });
    return P;
  }
  carBody(P, wreck, r);
  // wheels (wreck: bare rims)
  const t = wreck ? null : tyrePiece(0.31, 0.2, 12, { rim: 0.6, hubMat: 'lightGrey', lugs: false });
  P.mirrorX(() => {
    for (const z of [1.38, -1.4]) {
      if (t) P.add(t, { at: [0.8, 0.31, z] });
      else P.add(cyl(0.2, 0.16, 8, { axis: 'x' }), { at: [0.76, 0.2 + drop * 0.3, z], rot: [0.3, 0, 0], c: 'rust' });
      P.box(0.06, 0.12, 0.85, { at: [0.88, 0.62 + drop, z], c: wreck ? 'burnt' : 'black' });
    }
    // lights, mirrors, door seams
    P.box(0.34, 0.12, 0.05, { at: [0.55, 0.68 + drop, 2.24], c: wreck ? 'black' : 'lightLens' });
    P.box(0.26, 0.14, 0.05, { at: [0.6, 0.78 + drop, -2.25], c: wreck ? 'black' : 'redLens' });
    if (!wreck) {
      P.box(0.16, 0.1, 0.06, { at: [0.95, 1.0, 0.95], c: 'paint' });
      P.box(0.01, 0.55, 0.02, { at: [0.905, 0.62, 0.0], c: 'black' });
      P.box(0.01, 0.55, 0.02, { at: [0.905, 0.62, -1.05], c: 'black' });
      P.box(0.02, 0.03, 0.14, { at: [0.91, 0.8, -0.3], c: 'black' });
    }
  });
  P.box(1.6, 0.16, 0.12, { at: [0, 0.4 + drop, 2.28], c: wreck ? 'rust' : 'black' });
  P.box(1.6, 0.16, 0.12, { at: [0, 0.42 + drop, -2.28], c: wreck ? 'rust' : 'black' });
  P.box(0.7, 0.16, 0.04, { at: [0, 0.6 + drop, 2.26], c: 'black' });
  return P;
}

function streetLamp(r, lod) {
  const P = new Part('steel');
  const H = 7;
  if (lod) {
    P.add(cyl(0.12, H, 4, { r2: 0.07, caps: 'none', flat: true }), { at: [0, H / 2, 0], c: 'steel' });
    P.tube([0, H, 0], [0, H + 0.1, 1.4], 0.05, 0.05, 3, { c: 'steel', flat: true });
    P.box(0.3, 0.12, 0.6, { at: [0, H + 0.05, 1.6], c: 'steel' });
    return P;
  }
  P.box(0.4, 0.5, 0.4, { at: [0, 0.25, 0], c: 'concrete' });
  P.add(cyl(0.11, H - 0.5, 8, { r2: 0.065, caps: 'none' }), { at: [0, 0.5 + (H - 0.5) / 2, 0], c: 'steel' });
  P.add(cyl(0.15, 0.6, 8, { caps: 'none' }), { at: [0, 0.8, 0], c: 'steel' });
  P.sweep([[0, H - 0.3, 0], [0, H + 0.05, 0.3], [0, H + 0.12, 0.9], [0, H + 0.1, 1.45]], 0.045, 6, { c: 'steel' });
  P.add(lathe([[0.02, -0.12], [0.2, -0.1], [0.24, 0.0], [0.15, 0.08], [0, 0.1]], 8, { crease: 50 }).transform({ s: [1, 1, 1.9] }), { at: [0, H + 0.08, 1.7], c: 'steel' });
  P.box(0.28, 0.02, 0.6, { at: [0, H - 0.03, 1.7], c: 'lampGlass' });
  P.box(0.25, 0.35, 0.12, { at: [0, 2.4, -0.13], c: 'darkSteel' });
  return P;
}

function powerPole(r, lod) {
  const P = new Part('wood');
  const H = 9;
  const lean = [r.range(-0.08, 0.08), r.range(-0.08, 0.08)];
  if (lod) {
    P.tube([0, 0, 0], [lean[0], H, lean[1]], 0.15, 0.11, 4, { c: 'woodDark', flat: true });
    P.box(2.4, 0.1, 0.1, { at: [lean[0], H - 0.6, lean[1]], c: 'woodDark' });
    return P;
  }
  P.tube([0, -0.1, 0], [lean[0], H, lean[1]], 0.16, 0.11, 8, { c: 'woodDark' });
  const top = [lean[0], H - 0.6, lean[1]];
  P.box(2.4, 0.12, 0.12, { at: top, c: 'wood' });
  P.mirrorX(() => P.tube([lean[0] * 0.9 + 0.02, H - 1.3, lean[1] * 0.9], [lean[0] + 0.7, H - 0.66, lean[1]], 0.03, 0.03, 4, { c: 'darkSteel' }));
  const ins = lathe([[0.015, 0], [0.06, 0.02], [0.06, 0.05], [0.04, 0.07], [0.055, 0.09], [0.055, 0.12], [0.03, 0.14], [0, 0.15]], 8, { crease: 50 });
  const glass = r() < 0.5;
  for (const x of [-1.05, -0.35, 1.05]) {
    P.add(ins, { at: [top[0] + x, top[1] + 0.06, top[2]], c: glass ? 'insulGlass' : 'ceramic' });
    P.tube([top[0] + x, top[1] + 0.2, top[2] - 0.6], [top[0] + x, top[1] + 0.2, top[2] + 0.6], 0.008, 0.008, 3, { c: 'black' });
  }
  if (r() < 0.45) {
    P.add(cyl(0.3, 0.8, 10, { caps: 'both' }), { at: [lean[0] * 0.75 + 0.36, H * 0.72, lean[1] * 0.75], c: 'galv' });
    P.box(0.08, 0.25, 0.25, { at: [lean[0] * 0.75 + 0.12, H * 0.72, lean[1] * 0.75], c: 'darkSteel' });
  }
  for (let i = 0; i < 6; i++) {
    const y = 2.2 + i * 0.55;
    const s = i % 2 ? 1 : -1;
    P.box(0.025, 0.025, 0.22, { at: [lean[0] * (y / H) + s * 0.05, y, lean[1] * (y / H)], rot: [0, s * 0.5 + PI / 2, 0], c: 'darkSteel' });
  }
  return P;
}

function parachute(r, lod) {
  const P = new Part('fabric');
  const G = lod ? 6 : 16;
  const R = 3.75;
  const apexY = 7.0, skirtY = 4.65;
  const profile = lod
    ? [[0.3, apexY], [R * 0.8, apexY - 1.0], [R, skirtY]]
    : [[0.32, apexY], [R * 0.45, apexY - 0.3], [R * 0.75, apexY - 0.95], [R * 0.93, apexY - 1.7], [R, skirtY]];
  const pt = (rad, y, a, bulge) => [Math.cos(a) * rad * bulge, y, Math.sin(a) * rad * bulge];
  const outer = new Piece(), inner = new Piece();
  for (let g = 0; g < G; g++) {
    const a0 = (g / G) * TAU, a1 = ((g + 1) / G) * TAU, am = (a0 + a1) / 2;
    const shade = g % 2 ? 'fabric' : 'fabric2';
    for (let i = 0; i < profile.length - 1; i++) {
      const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
      const b0 = 1 + 0.06 * (i / profile.length), b1 = 1 + 0.08 * ((i + 1) / profile.length);
      const A = pt(r0, y0, a0, 1), B = pt(r0, y0, am, b0), C = pt(r1, y1, am, b1), D = pt(r1, y1, a0, 1);
      const E = pt(r0, y0, a1, 1), F = pt(r1, y1, a1, 1);
      const o0 = [Math.cos(am), 0.6, Math.sin(am)];
      const i0 = [-o0[0], -0.6, -o0[2]];
      if (lod) {
        outer.quadF(A, E, F, D, o0, shade);
        inner.quadF(A, E, F, D, i0, 'fabricIn');
        continue;
      }
      outer.quadF(A, B, C, D, o0, shade);
      outer.quadF(B, E, F, C, o0, shade);
      inner.quadF(A, B, C, D, i0, 'fabricIn');
      inner.quadF(B, E, F, C, i0, 'fabricIn');
    }
  }
  P.add(outer.normals(45));
  P.add(inner.normals(45));
  // suspension lines from the skirt seams to the risers above the harness
  const riser = [0, 0.9, 0];
  for (let g = 0; g < G; g += lod ? 2 : 1) {
    const a = (g / G) * TAU;
    const s = pt(R, skirtY, a, 1);
    if (lod) P.add(new Piece().triF(s, [0, 0, 0], [s[0] * 0.98 + 0.03, s[1], s[2] * 0.98], [Math.sin(a), 0, -Math.cos(a)]).normals(0), { c: 'line' });
    else P.tube(s, riser, 0.012, 0.012, 3, { c: 'line' });
  }
  if (!lod) {
    for (const [x, z] of [[0.15, 0.1], [-0.15, 0.1], [0.15, -0.1], [-0.15, -0.1]]) P.tube([x, 0.0, z], [x * 0.2, 0.9, z * 0.2], 0.02, 0.02, 3, { c: 'olive' });
  }
  return P;
}

function debrisConcrete(r, lod) {
  const P = new Part('concrete');
  const n = makeNoise(r.int(1, 1e9));
  const s = [r.range(0.28, 0.38), r.range(0.14, 0.24), r.range(0.22, 0.32)];
  const disp = (d) => {
    const m = Math.max(Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2]));
    const q = d.map((c) => c / m);
    const k = 1 + 0.22 * n(d[0] * 2.2, d[1] * 2.2, d[2] * 2.2);
    return [q[0] * s[0] * k, q[1] * s[1] * k + s[1] * 0.8, q[2] * s[2] * k];
  };
  const piece = icosphere(lod ? 0 : 1, disp).normals(0);
  for (let t = 0; t < piece.m.length; t++) piece.m[t] = t % 4 ? 'concrete' : 'concreteDark';
  P.add(piece);
  if (!lod) {
    for (let i = 0; i < 3; i++) {
      const a = r.range(0, TAU);
      const st = [Math.cos(a) * s[0] * 0.6, s[1] * 0.9, Math.sin(a) * s[2] * 0.6];
      const mid = [st[0] * 1.6, st[1] + r.range(0.05, 0.2), st[2] * 1.6];
      const end = [mid[0] + r.range(-0.15, 0.15), mid[1] + r.range(-0.1, 0.25), mid[2] + r.range(-0.15, 0.15)];
      P.sweep([st, mid, end], 0.008, 3, { c: 'rust' });
    }
  }
  return P;
}

function debrisMetal(r, lod) {
  const P = new Part('burnt');
  const n = makeNoise(r.int(1, 1e9));
  const nx = lod ? 1 : 5, nz = lod ? 1 : 4;
  const W = r.range(0.7, 0.9), D = r.range(0.45, 0.6), T = 0.012;
  const twist = r.range(-0.9, 0.9), bend = r.range(-0.4, 0.4);
  const at = (u, v, side) => {
    const x = (u - 0.5) * W, z = (v - 0.5) * D;
    const ang = twist * (u - 0.5);
    const y = bend * (u - 0.5) ** 2 * 2 + 0.12 * n(u * 2.3, v * 2.3, 0.5) + 0.12;
    const zz = z * Math.cos(ang), yy = y + z * Math.sin(ang);
    return [x, yy + side * T, zz];
  };
  const top = new Piece(), bot = new Piece();
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const u0 = i / nx, u1 = (i + 1) / nx, v0 = j / nz, v1 = (j + 1) / nz;
      const mat = n(u0 * 3, v0 * 3, 7.7) > 0.1 ? 'rust' : 'burnt';
      top.quadF(at(u0, v0, 1), at(u1, v0, 1), at(u1, v1, 1), at(u0, v1, 1), [0, 1, 0], mat);
      bot.quadF(at(u0, v0, -1), at(u1, v0, -1), at(u1, v1, -1), at(u0, v1, -1), [0, -1, 0], 'rust');
    }
  }
  P.add(top.normals(35));
  P.add(bot.normals(35));
  if (!lod) {
    const edge = new Piece();
    for (let i = 0; i < nx; i++) {
      for (const v of [0, 1]) {
        const a = at(i / nx, v, 1), b = at((i + 1) / nx, v, 1), c = at((i + 1) / nx, v, -1), d = at(i / nx, v, -1);
        edge.quadF(a, b, c, d, [0, 0, v ? 1 : -1], 'rust');
      }
    }
    P.add(edge.normals(0));
  }
  return P;
}

// ---------------------------------------------------------------------------

const BUILDERS = {
  tree_pine: pineTree,
  tree_broadleaf: broadleafTree,
  tree_dead: deadTree,
  bush,
  rock,
  sandbags,
  hesco,
  jersey_barrier: jerseyBarrier,
  tank_trap: tankTrap,
  crates,
  fuel_drums: fuelDrums,
  fuel_tank: fuelTank,
  radio_mast: radioMast,
  guard_tower: guardTower,
  car: (r, lod, v) => car(r, lod, v, false),
  car_wreck: (r, lod, v) => car(r, lod, v, true),
  street_lamp: streetLamp,
  power_pole: powerPole,
  parachute,
  debris_concrete: debrisConcrete,
  debris_metal: debrisMetal,
};

export function buildPropLods(kind, variant = 0) {
  const b = BUILDERS[kind];
  if (!b || !PROP_KINDS.includes(kind)) throw new Error(`models: unknown prop kind '${kind}'`);
  const seed = hashSeed('prop', kind, variant);
  const pal = propPalette(seed);
  if (kind === 'car') pal.paint = { color: CAR_COLOURS[((variant % CAR_COLOURS.length) + CAR_COLOURS.length) % CAR_COLOURS.length], vary: 0.03, varyF: pal.paint.varyF };
  const lods = {};
  for (const lod of [0, 1]) {
    const part = b(makeRng(seed), lod, variant);
    lods[lod ? 'lod1' : 'lod0'] = part.toGeometry(pal, { aoDown: 0.35 });
  }
  return lods;
}
