// =============================================================================
// Procedural seat models (economy slimline + business recliner).
//
// Frames (all metres):
//   seat-local     origin on the floor below the seat-pan centre, +X right, +Y up, +Z aft
//   back-local     origin at the recline pivot; +Y up the backrest, +Z aft (rear shell side)
//   armrest-local  origin at the armrest pivot (rear), armrest extends towards -Z
//   tray-local     origin on the tray hinge line (back-local y = hingeY, z = zb)
//   block-local    triple (economy) / pair (business) frame centred between the seats
//
// Every builder returns PartBuilder output: { geometry (groups), keys (material per group) }.
// =============================================================================
import * as THREE from 'three';
import { DEG } from '../../core/constants.js';
import {
  smooth, dip, clamp01, lerp, finalize, boxUV, rbox, box, tube, pipe, loft, superPt, ribbon,
  PartBuilder, mT, mRX, mRY, mRZ, mul,
} from './geom.js';

// ------------------------------------------------------------------------------- dimensions
export const ECON = {
  cls: 'economy',
  cushion: { hw: 0.205, z0: -0.235, z1: 0.212, top: 0.45, bot: 0.352, rF: 0.05, rB: 0.02, re: 0.03 },
  back: {
    pivotY: 0.40, pivotZ: 0.236, tilt: 17 * DEG, H: 0.763, a0: 0.214, aTop: 0.170, taper0: 0.40,
    zf: -0.008, zb: 0.07, zbTop: 0.058, rt: 0.03, yb: -0.05, n: 6,
  },
  screen: { y: 0.645, w: 0.218, h: 0.136, tilt: -10 * DEG, bar: 0.016 },
  tray: { hingeY: 0.302, len: 0.235, w: 0.40, t: 0.019 },
  latchY: 0.548,
  pocket: { y0: 0.035, y1: 0.245, hw: 0.168, bulge: 0.016 },
  arm: { top: 0.63, pivotY: 0.588, pivotZ: 0.17, front: -0.215, w: 0.048, pitch: 0.46 },
  reclineDeg: 8,
  eyeZ: 0.23,
};

export const BUS = {
  cls: 'business',
  cushion: { hw: 0.23, z0: -0.262, z1: 0.24, top: 0.46, bot: 0.345, rF: 0.06, rB: 0.025, re: 0.035 },
  back: {
    pivotY: 0.42, pivotZ: 0.262, tilt: 15 * DEG, H: 0.768, a0: 0.236, aTop: 0.205, taper0: 0.46,
    zf: -0.02, zb: 0.098, zbTop: 0.085, rt: 0.04, yb: -0.06, n: 6,
  },
  screen: { y: 0.625, w: 0.294, h: 0.165, tilt: -12 * DEG, bar: 0.018 },
  pocket: { y0: 0.05, y1: 0.29, hw: 0.19, bulge: 0.02 },
  arm: { top: 0.655, x: 0.55, w: 0.08 },
  legrest: { y: 0.372, z: -0.258, len: 0.31, w: 0.40, t: 0.05, foldDeg: -12, openDeg: 62 },
  pairHalf: 0.28,
  reclineDeg: 18,
  eyeZ: 0.27,
};

// ------------------------------------------------------------------------------- cushion
/** Cushion top-surface height at seat-local (x, z) - also used to drape the belts. */
export function cushionTop(C, x, z) {
  const u = Math.min(1, Math.abs(x) / C.hw);
  const zm = (C.z0 + C.z1) / 2, hd = (C.z1 - C.z0) / 2;
  const zn = (z - zm) / hd;                      // -1 front .. +1 rear
  let y = C.top;
  y -= 0.016 * smooth(0.25, 1.0, zn);            // drops into the backrest crease
  y += 0.006 * smooth(-0.2, -0.85, zn);          // thigh support
  y -= 0.007 * (1 - u * u);                      // dished centre, bolstered sides
  y -= 0.0045 * dip(zn, -0.30, 0.05);            // cross seam
  y -= 0.003 * dip(u, 0.64, 0.035);              // side stitch lines
  return y;
}

function cushionProfile(C, x, inset, K) {
  const i = inset;
  const z0 = C.z0 + i, z1 = C.z1 - i, yb = C.bot + i;
  const rF = Math.max(0.006, C.rF - i), rB = Math.max(0.004, C.rB - i), rb = Math.max(0.003, 0.012 - i * 0.5);
  const top = (z) => cushionTop(C, x, z) - i;
  const pts = [];
  const zc = (z0 + z1) / 2;
  const arc = (cz, cy, r, a0, a1, n) => { for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; pts.push([cz + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  // bottom (centre -> front)
  for (let k = 0; k <= 4; k++) pts.push([lerp(zc, z0 + rb, k / 4), yb]);
  arc(z0 + rb, yb + rb, rb, -Math.PI / 2, -Math.PI, 3);
  const ytf = top(z0 + rF);
  // front face up
  for (let k = 1; k <= 3; k++) pts.push([z0, lerp(yb + rb, ytf - rF, k / 3)]);
  arc(z0 + rF, ytf - rF, rF, Math.PI, Math.PI / 2, 8);           // waterfall front edge
  for (let k = 1; k <= 18; k++) { const z = lerp(z0 + rF, z1 - rB, k / 18); pts.push([z, top(z)]); }
  const ytb = top(z1 - rB);
  arc(z1 - rB, ytb - rB, rB, Math.PI / 2, 0, 4);
  for (let k = 1; k <= 3; k++) pts.push([z1, lerp(ytb - rB, yb + rb, k / 3)]);
  arc(z1 - rb, yb + rb, rb, 0, -Math.PI / 2, 3);
  for (let k = 1; k < 4; k++) pts.push([lerp(z1 - rb, zc, k / 4), yb]);
  return resample(pts, K, true);
}

/** Resample a polyline (array of [a,b]) to K points by arc length. */
function resample(pts, K, closed) {
  const P = closed ? [...pts, pts[0]] : pts;
  const L = [0];
  for (let k = 1; k < P.length; k++) L.push(L[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
  const total = L[L.length - 1];
  const out = [];
  let j = 0;
  const N = closed ? K : K - 1;
  for (let k = 0; k < K; k++) {
    const s = total * k / N;
    while (j < L.length - 2 && L[j + 1] < s) j++;
    const t = (s - L[j]) / Math.max(1e-9, L[j + 1] - L[j]);
    out.push([lerp(P[j][0], P[j + 1][0], t), lerp(P[j][1], P[j + 1][1], t)]);
  }
  return out;
}

function buildCushion(C, q) {
  const K = q > 0.7 ? 48 : 32;
  const re = C.re;
  const xs = [];
  const nEnd = q > 0.7 ? 4 : 3, nMid = q > 0.7 ? 10 : 6;
  for (let k = nEnd; k >= 1; k--) { const phi = (Math.PI / 2) * k / nEnd; xs.push([-(C.hw - re + re * Math.sin(phi)), re * (1 - Math.cos(phi))]); }
  for (let k = 0; k <= nMid; k++) xs.push([lerp(-C.hw + re, C.hw - re, k / nMid), 0]);
  for (let k = 1; k <= nEnd; k++) { const phi = (Math.PI / 2) * k / nEnd; xs.push([C.hw - re + re * Math.sin(phi), re * (1 - Math.cos(phi))]); }
  const rings = [];
  const yc = (C.bot + C.top) / 2 - 0.01, zc = (C.z0 + C.z1) / 2;
  rings.push(new Array(K).fill(0).map(() => new THREE.Vector3(-C.hw, yc, zc)));
  for (const [x, inset] of xs) rings.push(cushionProfile(C, x, inset, K).map(([z, y]) => new THREE.Vector3(x, y, z)));
  rings.push(new Array(K).fill(0).map(() => new THREE.Vector3(C.hw, yc, zc)));
  const g = loft(rings, { closedRing: true, flip: true });
  // fabric uv: u around the profile (m), v across (m) -> swap so the weave runs across the seat
  return g;
}

// ------------------------------------------------------------------------------- backrest
function backA(B, y) {
  // half-width with tapered, rounded shoulders
  const t = smooth(B.taper0, B.H, y);
  return B.a0 - (B.a0 - B.aTop) * Math.pow(t, 1.4);
}
function backZb(B, y) { return B.zb - (B.zb - B.zbTop) * smooth(B.H - 0.11, B.H, y); }

/** Shell ring (closed): superellipse around the backrest section, inset for the rounded caps. */
function shellRing(B, y, inset, M) {
  const a = backA(B, y) - inset, zb = backZb(B, y) - inset, zf = B.zf + inset;
  const c = (zb + zf) / 2, b = Math.max(0.0005, (zb - zf) / 2);
  const ring = [];
  for (let k = 0; k < M; k++) {
    const t = (k / M) * Math.PI * 2;
    const [x, z] = superPt(t, Math.max(0.001, a), b, B.n);
    ring.push(new THREE.Vector3(x, y, c + z));
  }
  return ring;
}

function buildShell(B, q) {
  const M = q > 0.7 ? 44 : 28;
  const rings = [];
  const rb = 0.02;
  const yb = B.yb;
  // bottom cap
  rings.push(shellRing(B, yb, Math.min(0.03, (B.zb - B.zf) / 2), M).map((p) => p.setY(yb)));
  for (let k = 1; k <= 3; k++) { const phi = (Math.PI / 2) * k / 3; rings.push(shellRing(B, yb + rb - rb * Math.cos(phi), rb * (1 - Math.sin(phi)) * 0.8, M)); }
  const n = q > 0.7 ? 20 : 12;
  const yTop = B.H - B.rt;
  for (let k = 1; k <= n; k++) rings.push(shellRing(B, lerp(yb + rb, yTop, k / n), 0, M));
  const nc = q > 0.7 ? 5 : 3;
  for (let k = 1; k <= nc; k++) {
    const phi = (Math.PI / 2) * k / nc;
    const y = yTop + B.rt * Math.sin(phi);
    const inset = B.rt * (1 - Math.cos(phi));
    rings.push(shellRing(B, y, Math.min(inset, (backZb(B, y) - B.zf) / 2 - 0.0005), M));
  }
  return loft(rings, { closedRing: true });
}

/** Forward offset of the upholstered front surface (positive = towards the front). */
function frontContour(B, x, y, business) {
  const a = backA(B, y);
  const u = Math.min(1, Math.abs(x) / a);
  let f = 0.006 + 0.004 * (1 - u * u);
  f += (business ? 0.026 : 0.02) * Math.exp(-(((y - 0.2) / 0.11) ** 2)) * (1 - 0.4 * u * u);        // lumbar
  const headY0 = business ? 0.575 : 0.565;
  f += (business ? 0.024 : 0.016) * smooth(0.55, 0.92, u) * (1 - smooth(headY0 - 0.04, headY0, y)); // side bolsters
  f += smooth(headY0 - 0.01, headY0 + 0.04, y) * ((business ? 0.02 : 0.012) + (business ? 0.034 : 0.026) * smooth(0.5, 0.95, u)); // headrest + wings
  f -= 0.006 * dip(y, headY0, 0.014);                                                                 // headrest seam
  if (business) { for (const py of [0.1, 0.19, 0.28, 0.37, 0.46]) f -= 0.0042 * dip(y, py, 0.012) * (1 - smooth(0.7, 0.95, u)); }
  else f -= 0.0035 * dip(u, 0.6, 0.04) * (1 - smooth(headY0 - 0.03, headY0, y));                       // vertical stitch lines
  return f;
}

function buildFront(B, q, business) {
  const M = q > 0.7 ? 32 : 20;
  const d = 0.1;
  const tA = Math.PI + d, tB = 2 * Math.PI - d;
  const y0 = 0.0, y1 = B.H - B.rt - 0.004;
  const n = q > 0.7 ? 34 : 20;
  const rings = [];
  for (let r = 0; r <= n; r++) {
    const y = lerp(y0, y1, r / n);
    const a = backA(B, y), zb = backZb(B, y);
    const c = (zb + B.zf) / 2, b = (zb - B.zf) / 2;
    const tv = smooth(0, 0.035, y - y0) * smooth(0, 0.02, y1 - y);
    const ring = [];
    for (let k = 0; k < M; k++) {
      const t = lerp(tA, tB, k / (M - 1));
      const [x, zz] = superPt(t, a, b, B.n);
      const te = smooth(0, 0.3, Math.min(t - tA, tB - t));
      const w = tv * te;
      const z = c + zz - (frontContour(B, x, y, business) + 0.002) * w + 0.004 * (1 - w);
      ring.push(new THREE.Vector3(x * (1 - 0.01 * (1 - w)), y, z));
    }
    rings.push(ring);
  }
  return loft(rings);
}

/** Headrest cover sheet: front (from coverY0) over the top to the back. uv 0..1 (see textures.coverTexture). */
function buildCover(B, business, q) {
  const hw = business ? 0.17 : 0.148;
  const y0 = business ? 0.588 : 0.578;
  const yTop = B.H - B.rt - 0.004;
  const nx = q > 0.7 ? 18 : 10, nf = q > 0.7 ? 12 : 7, na = 8;
  const rings = [];
  for (let ix = 0; ix <= nx; ix++) {
    const x = lerp(-hw, hw, ix / nx);
    const pts = [];
    const front = (y) => {
      const zb = backZb(B, y), c = (zb + B.zf) / 2, b = (zb - B.zf) / 2;
      const ct = Math.pow(Math.min(1, Math.abs(x) / backA(B, y)), B.n / 2);
      const zz = -b * Math.pow(Math.sqrt(Math.max(0, 1 - ct * ct)), 2 / B.n);
      return c + zz - frontContour(B, x, y, business) - 0.0045;
    };
    for (let k = 0; k <= nf; k++) { const y = lerp(y0, yTop, k / nf); pts.push(new THREE.Vector3(x, y, front(y))); }
    const zF = front(yTop), zB = backZb(B, yTop) + 0.003;
    const zc = (zF + zB) / 2, hd = (zB - zF) / 2, vr = B.H + 0.004 - yTop;
    for (let k = 1; k <= na; k++) { const ps = Math.PI * k / na; pts.push(new THREE.Vector3(x, yTop + vr * Math.sin(ps), zc - hd * Math.cos(ps))); }
    pts.push(new THREE.Vector3(x, yTop - 0.012, zB));
    rings.push(pts);
  }
  const g = loft(rings, { flip: true });
  // normalised uv: u across as seen from the front (mirrored x), v along the meridian
  const P = g.attributes.position, uv = g.attributes.uv;
  const cols = rings[0].length;
  let maxV = 0;
  for (let i = 0; i < uv.count; i++) maxV = Math.max(maxV, uv.getX(i));
  for (let i = 0; i < uv.count; i++) { const x = P.getX(i); uv.setXY(i, (hw - x) / (2 * hw), uv.getX(i) / maxV); }
  void cols;
  return g;
}

/** Seat-back pocket (bulging fabric) + elastic band, on the rear face. */
function buildPocket(B, Pk) {
  const nx = 16, ny = 10;
  const rings = [];
  for (let iy = 0; iy <= ny; iy++) {
    const y = lerp(Pk.y0, Pk.y1, iy / ny);
    const ring = [];
    for (let ix = 0; ix <= nx; ix++) {
      const x = lerp(Pk.hw, -Pk.hw, ix / nx);
      const ex = 1 - Math.pow(Math.abs(x) / Pk.hw, 6);
      const ey = Math.sin(Math.PI * 0.5 * (y - Pk.y0) / (Pk.y1 - Pk.y0)) ** 0.7;
      const sag = 0.003 * Math.sin(Math.PI * (y - Pk.y0) / (Pk.y1 - Pk.y0)) * (1 - Math.abs(x) / Pk.hw);
      ring.push(new THREE.Vector3(x, y - sag * 2, backZb(B, y) + 0.0015 + Pk.bulge * ex * ey));
    }
    rings.push(ring);
  }
  const g = loft(rings);
  const band = [];
  for (let ix = 0; ix <= nx; ix++) {
    const x = lerp(-Pk.hw, Pk.hw, ix / nx);
    const ex = 1 - Math.pow(Math.abs(x) / Pk.hw, 6);
    band.push([x, Pk.y1, backZb(B, Pk.y1) + 0.0015 + Pk.bulge * ex]);
  }
  const bandG = pipe(band, 0.0042, 4, 16);
  return { sheet: g, band: bandG };
}

function plane(w, h, uvRect, flipU = false) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i); const v = uv.getY(i);
    if (flipU) u = 1 - u;
    uv.setXY(i, uvRect[0] + u * uvRect[2], uvRect[1] + v * uvRect[3]);
  }
  return g;
}

/** Seat-pocket literature (front faces + paper edges). */
function addLiterature(pb, B, Pk, lit, business) {
  const zb = backZb(B, Pk.y1);
  const items = business
    ? [['sickbag', -0.15, -0.03, 0.312, 0.0025], ['card', -0.11, 0.1, 0.325, 0.006], ['magazine', -0.06, 0.16, 0.318, 0.0095]]
    : [['sickbag', -0.15, -0.03, 0.262, 0.0025], ['card', -0.11, 0.09, 0.272, 0.0055], ['magazine', -0.07, 0.14, 0.267, 0.0088]];
  const fullH = { magazine: 0.275, card: 0.25, sickbag: 0.25 };
  for (const [name, x0, x1, top, dz] of items) {
    const h = top - (Pk.y0 + 0.03);
    const r = lit.rect(name);
    const frac = h / fullH[name];
    const rect = [r[0], r[1] + r[3] * (1 - frac), r[2], r[3] * frac];
    const g = plane(x1 - x0, h, rect);
    g.translate((x0 + x1) / 2, top - h / 2, zb + dz + 0.0016);
    pb.add('lit', g);
    // paper top edge
    const e = box(x0, top - 0.0015, zb + dz, x1, top, zb + dz + 0.0016);
    pb.add('lit', e, { color: 1 });
    const uv = e.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + 0.01, r[1] + r[3] - 0.01);
  }
}

/** IFE screen housing: bezel frame + "screen off" glass behind the anchor plane. Returns the anchor matrix (back-local). */
function addBezel(pb, B, S) {
  const zb = backZb(B, S.y);
  const anchor = mul(mT(0, S.y, zb + Math.abs(Math.sin(S.tilt)) * S.h * 0.5 + 0.003), mRX(S.tilt));
  const w = S.w, h = S.h, bar = S.bar, d = 0.034, lip = 0.004;
  const W = w + 0.004, Hh = h + 0.004;
  const parts = [
    rbox(W + 2 * bar, bar, d, 0.004, 1, 0, Hh / 2 + bar / 2, lip - d / 2),
    rbox(W + 2 * bar, bar, d, 0.004, 1, 0, -Hh / 2 - bar / 2, lip - d / 2),
    rbox(bar, Hh, d, 0.004, 1, -W / 2 - bar / 2, 0, lip - d / 2),
    rbox(bar, Hh, d, 0.004, 1, W / 2 + bar / 2, 0, lip - d / 2),
  ];
  for (const p of parts) pb.addT('black', p, anchor.clone(), { color: 0.9 });
  const glass = box(-W / 2, -Hh / 2, -0.012, W / 2, Hh / 2, -0.0025);
  pb.addT('glass', glass, anchor.clone(), { color: 1 });
  return anchor;
}

/**
 * Backrest (moves with recline). Returns { geometry, keys, anchor (Matrix4, back-local), dims }.
 */
export function buildBack(D, q, tex) {
  const B = D.back, business = D.cls === 'business';
  const pb = new PartBuilder();
  const upKey = business ? 'leather' : 'fabric';
  // upholstered front
  pb.add(upKey, buildFront(B, q, business), {
    colorFn: (x, y) => 0.78 + 0.22 * smooth(0.0, 0.18, y) - 0.08 * smooth(0.12, 0.2, B.H - y),
  });
  // rear / side shell
  pb.add('shell', buildShell(B, q), {
    colorFn: (x, y, z, nx, ny, nz) => {
      let c = 0.84 + 0.16 * smooth(-0.04, 0.35, y);                       // grime low down
      c *= 1 - 0.06 * Math.max(0, -nz) * (1 - smooth(0.0, 0.05, y));     // AO behind cushion
      // light scuffs where knees and shoes hit the lower shell
      if (nz > 0.3 && y < 0.33) c *= 0.93 + 0.07 * Math.sin(x * 61 + y * 37) * Math.sin(x * 23 - y * 51);
      return c;
    },
  });
  // headrest cover
  pb.add('cloth', buildCover(B, business, q), { color: 1 });
  // pocket
  const Pk = D.pocket;
  const pk = buildPocket(B, Pk);
  pb.add(upKey, pk.sheet, { colorFn: () => (business ? 0.5 : 0.42) });
  pb.add('black', pk.band, { color: 0.8 });
  addLiterature(pb, B, Pk, tex.lit, business);
  // screen housing
  const anchor = addBezel(pb, B, D.screen);
  const S = D.screen;
  // USB / audio plate under the screen (economy: beside the latch; business: centred)
  const plateY = business ? S.y - S.h / 2 - S.bar - 0.026 : S.y - 0.012;
  const plateX = business ? 0 : 0.157;
  const vert = !business;
  pb.add('black', rbox(vert ? 0.022 : 0.085, vert ? 0.085 : 0.022, 0.012, 0.004, 1, plateX, plateY, backZb(B, plateY) + 0.004), { color: 0.8 });
  const usb = plane(0.08, 0.02, tex.plac.rect('usb'));
  if (vert) usb.rotateZ(Math.PI / 2);
  usb.translate(plateX, plateY, backZb(B, plateY) + 0.0105);
  pb.add('placard', usb);
  // coat hook (chrome) with base
  const hx = business ? 0.19 : -0.157, hy = business ? 0.69 : 0.655;
  const zh = backZb(B, hy);
  pb.add('black', rbox(0.026, 0.034, 0.008, 0.003, 1, hx, hy, zh + 0.003), { color: 0.9 });
  pb.add('metal', pipe([[hx, hy + 0.008, zh + 0.004], [hx, hy + 0.008, zh + 0.016], [hx, hy - 0.004, zh + 0.024], [hx, hy - 0.014, zh + 0.02], [hx, hy - 0.012, zh + 0.012]], 0.0032, 5, 10), { color: 1 });
  if (!business) {
    // tray hinge brackets + latch housing
    const T = D.tray;
    for (const s of [-1, 1]) pb.add('black', rbox(0.02, 0.026, 0.024, 0.004, 1, s * (T.w / 2 - 0.012), T.hingeY, backZb(B, T.hingeY) + 0.01), { color: 0.85 });
    pb.add('black', rbox(0.052, 0.018, 0.006, 0.003, 1, 0, D.latchY, backZb(B, D.latchY) + 0.002), { color: 0.85 });
    // exit-row placard slot (label B; transparent for other seats)
    const ex = plane(0.15, 0.019, [0, 0, 1, 1]);
    ex.translate(0, 0.284, backZb(B, 0.284) + 0.0016);
    pb.add('placard', ex, { label: 2 });
  }
  // seat-row labels on both sides of the backrest (label A)
  const ly = business ? 0.52 : 0.5;
  const la = backA(B, ly), lzc = (backZb(B, ly) + B.zf) / 2;
  for (const s of [-1, 1]) {
    const g = plane(0.054, 0.018, [0, 0, 1, 1], false);
    g.rotateY(s * Math.PI / 2);
    g.translate(s * (la + 0.0012), ly, lzc);
    pb.add('placard', g, { label: 1 });
  }
  const built = pb.build(['fabric', 'leather', 'shell', 'black', 'glass', 'metal', 'cloth', 'lit', 'placard']);
  return { ...built, anchor };
}

// ------------------------------------------------------------------------------- tray table (seat back)
/** Tray in tray-local (hinge line at origin, stowed extends +Y, thickness +Z, usable face -Z). */
export function buildTray(D) {
  const T = D.tray;
  const g = rbox(T.w, T.len, T.t, 0.007, 3, 0, 0.006 + T.len / 2, 0.0015 + T.t / 2);
  const P = g.attributes.position, N = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i) - 0.006, nz = N.getZ(i);
    const u = (x + T.w / 2) / T.w, v = y / T.len;
    if (nz < -0.6) uv.setXY(i, u * 0.5, 1 - v);            // usable top surface
    else if (nz > 0.6) uv.setXY(i, 0.5 + u * 0.5, v);      // underside (seen when stowed)
    else uv.setXY(i, 0.5, 0.5);                            // edge strip
  }
  // two short hinge arms
  const pb = new PartBuilder();
  pb.add('tray', g, { color: 1 });
  for (const s of [-1, 1]) pb.add('black', rbox(0.012, 0.05, 0.012, 0.003, 1, s * (T.w / 2 - 0.012), 0.022, 0.012), { color: 0.9 });
  return pb.build(['tray', 'black']);
}

export function buildLatch() {
  const pb = new PartBuilder();
  pb.add('shell', rbox(0.042, 0.011, 0.026, 0.004, 1, 0, 0, 0.013), { color: 0.7 });
  pb.add('metal', rbox(0.012, 0.006, 0.004, 0.0015, 1, 0, 0, 0.0262), { color: 0.8 });
  return pb.build(['shell', 'metal']);
}

// ------------------------------------------------------------------------------- armrests
/** Economy armrest in armrest-local (pivot at origin). */
export function buildArmrest(bulk = false) {
  const A = ECON.arm;
  const pb = new PartBuilder();
  const len = A.pivotZ - A.front + 0.04;
  const zc = 0.04 - len / 2;
  const topRel = A.top - A.pivotY;
  // soft pad on top
  pb.add('shell', rbox(A.w, 0.024, len, 0.011, 3, 0, topRel - 0.012, zc, (v) => {
    if (v.y > topRel - 0.006) v.y += 0.003 * (1 - (v.z / len) ** 2);   // slight crown
  }), { color: 0.62 });
  // body (tapers at the front end)
  pb.add('shell', rbox(A.w - 0.004, 0.03, len - 0.01, 0.008, 2, 0, topRel - 0.034, zc + 0.003, (v) => {
    const f = smooth(-0.25, -0.38, v.z);
    v.y += f * 0.012 * (v.y < topRel - 0.034 ? 1 : 0);
  }), { color: 1 });
  // pivot boss
  pb.add('shell', tube([-A.w / 2 - 0.002, 0, 0], [A.w / 2 + 0.002, 0, 0], 0.022, 16), { color: 0.9 });
  if (bulk) {
    // bulkhead row: deep housing for the stowed tray table
    pb.add('shell', rbox(A.w + 0.004, 0.26, 0.4, 0.01, 2, 0, -0.12, -0.18), { colorFn: (x, y) => 0.82 + 0.18 * smooth(-0.25, 0.0, y) });
    pb.add('black', box(-0.009, topRel + 0.0005, -0.36, 0.009, topRel + 0.002, -0.08), { color: 0.6 });
  }
  return pb.build(['shell', 'black']);
}

/** Recline button (chrome) in its own local frame, axis +X. */
export function buildButton() {
  const pb = new PartBuilder();
  pb.add('metal', tube([0, 0, 0], [0.006, 0, 0], 0.0085, 16), { color: 1 });
  pb.add('metal', tube([-0.002, 0, 0], [0.001, 0, 0], 0.011, 16), { color: 0.6 });
  return pb.build(['metal']);
}

// ------------------------------------------------------------------------------- static seat parts
/** Per-seat static parts (cushion, seat pan, life-vest pouch). */
export function buildSeatStatic(D, q, tex) {
  const C = D.cushion, business = D.cls === 'business';
  const pb = new PartBuilder();
  pb.add(business ? 'leather' : 'fabric', buildCushion(C, q), {
    colorFn: (x, y, z) => 0.7 + 0.3 * smooth(C.bot, C.bot + 0.06, y) - 0.06 * smooth(C.z1 - 0.06, C.z1, z),
  });
  // seat pan under the cushion
  pb.add('shell', rbox(C.hw * 2 - 0.01, 0.03, C.z1 - C.z0 - 0.012, 0.008, 2, 0, C.bot - 0.012, (C.z0 + C.z1) / 2 + 0.004), { color: 0.75 });
  if (business) {
    // front skirt + leg rest housing
    pb.add('shell', rbox(C.hw * 2 - 0.02, 0.11, 0.03, 0.01, 2, 0, C.bot - 0.06, C.z0 + 0.03), { colorFn: (x, y) => 0.7 + 0.3 * smooth(0.22, 0.34, y) });
  } else {
    // life vest pouch under the seat pan + placard
    pb.add('fabric', rbox(0.25, 0.038, 0.13, 0.012, 2, 0, 0.3, -0.115), { color: 0.38 });
    const lv = plane(0.15, 0.028, tex.plac.rect('lifevest'));
    lv.rotateY(Math.PI);
    lv.translate(0, 0.3, -0.1815);
    pb.add('placard', lv);
  }
  return pb.build(['fabric', 'leather', 'shell', 'placard']);
}

// ------------------------------------------------------------------------------- economy triple frame
function legPlate(width, mat, pb, x) {
  const s = new THREE.Shape();
  const pts = [[-0.205, 0.335], [0.175, 0.335], [0.315, 0.03], [0.315, 0.0], [0.245, 0.0], [0.11, 0.255], [-0.125, 0.255], [-0.165, 0.0], [-0.24, 0.0], [-0.24, 0.035]];
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -width / 2);
  g.applyMatrix4(mRY(-Math.PI / 2));
  g.translate(x, 0, 0);
  g.computeVertexNormals();
  boxUV(g, 1);
  pb.add(mat, g, { colorFn: (xx, y) => 0.8 + 0.2 * smooth(0, 0.3, y) });
}

/** Economy triple-seat frame (block-local: centre seat at x = 0). */
export function buildEconBlock(tex) {
  const pb = new PartBuilder();
  const P = ECON.arm.pitch, A = ECON.arm;
  const xe = P * 1.5;        // outer armrest stations
  for (const x of [-0.3, 0.3]) {
    legPlate(0.016, 'metal', pb, x);
    // track fittings (front & rear studs)
    pb.add('metal', rbox(0.03, 0.022, 0.09, 0.004, 1, x, 0.011, -0.2), { color: 0.7 });
    pb.add('metal', rbox(0.03, 0.022, 0.09, 0.004, 1, x, 0.011, 0.28), { color: 0.7 });
    pb.add('black', tube([x, 0.022, 0.25], [x, 0.022, 0.31], 0.006, 8), { color: 1 });
  }
  // beam tubes
  pb.add('metal', tube([-xe, 0.315, -0.165], [xe, 0.315, -0.165], 0.019, 14), { color: 0.95 });
  pb.add('metal', tube([-xe, 0.315, 0.13], [xe, 0.315, 0.13], 0.019, 14), { color: 0.95 });
  // baggage restraint bar
  pb.add('metal', tube([-xe + 0.02, 0.088, -0.2], [xe - 0.02, 0.088, -0.2], 0.0075, 10), { color: 1 });
  for (const x of [-xe + 0.02, -0.3, 0.3, xe - 0.02]) pb.add('metal', tube([x, 0.088, -0.2], [x, 0.24, -0.17], 0.006, 8), { color: 0.9 });
  // armrest supports at the four stations + pivot caps
  for (const x of [-xe, -P / 2, P / 2, xe]) {
    pb.add('shell', rbox(0.026, 0.27, 0.11, 0.008, 2, x, 0.46, 0.165, (v) => { v.z += (v.y - 0.46) * 0.12; }), { colorFn: (xx, y) => 0.75 + 0.25 * smooth(0.33, 0.55, y) });
  }
  // end-bay shrouds (outboard ends)
  for (const s of [-1, 1]) {
    pb.add('shell', rbox(0.014, 0.25, 0.37, 0.007, 2, s * (xe + 0.014), 0.41, -0.005), { colorFn: (xx, y) => 0.78 + 0.22 * smooth(0.28, 0.5, y) });
  }
  // power outlets on the front beam between seats + under-seat power box
  for (const x of [-P / 2, P / 2]) {
    pb.add('black', rbox(0.06, 0.034, 0.03, 0.005, 2, x, 0.272, -0.175), { color: 0.9 });
    const p = plane(0.054, 0.028, tex.plac.rect('power'));
    p.rotateY(Math.PI);
    p.translate(x, 0.272, -0.1905);
    pb.add('placard', p);
  }
  pb.add('black', rbox(0.26, 0.06, 0.12, 0.01, 2, 0.0, 0.25, 0.06), { color: 0.75 });
  void A;
  return pb.build(['metal', 'shell', 'black', 'placard']);
}

// ------------------------------------------------------------------------------- business pair frame
/** Business pair (block-local: seats at x = ±pairHalf). */
export function buildBusBlock(tex) {
  const pb = new PartBuilder();
  const h = BUS.pairHalf, A = BUS.arm;
  for (const x of [-h, h]) {
    legPlate(0.02, 'metal', pb, x - 0.1);
    legPlate(0.02, 'metal', pb, x + 0.1);
    for (const dx of [-0.1, 0.1]) {
      pb.add('metal', rbox(0.034, 0.022, 0.09, 0.004, 1, x + dx, 0.011, -0.2), { color: 0.7 });
      pb.add('metal', rbox(0.034, 0.022, 0.09, 0.004, 1, x + dx, 0.011, 0.28), { color: 0.7 });
    }
  }
  pb.add('metal', tube([-A.x, 0.315, -0.165], [A.x, 0.315, -0.165], 0.022, 14), { color: 0.95 });
  pb.add('metal', tube([-A.x, 0.315, 0.13], [A.x, 0.315, 0.13], 0.022, 14), { color: 0.95 });
  // outer armrests (shell body + leather pad + tray slot)
  for (const s of [-1, 1]) {
    const x = s * A.x;
    pb.add('shell', rbox(A.w, 0.31, 0.5, 0.02, 3, x, 0.475, -0.005), { colorFn: (xx, y) => 0.72 + 0.28 * smooth(0.33, 0.55, y) });
    pb.add('leather', rbox(A.w + 0.006, 0.04, 0.48, 0.016, 3, x, A.top - 0.02, -0.005, (v) => { if (v.y > A.top - 0.01) v.y += 0.004 * (1 - (v.z / 0.24) ** 2); }), { color: 0.95 });
    pb.add('black', box(x - s * 0.012 - 0.008, A.top + 0.0035, -0.225, x - s * 0.012 + 0.008, A.top + 0.0052, 0.03), { color: 0.6 });
    // seat-row label on the outer face (label A)
    const g = plane(0.07, 0.024, [0, 0, 1, 1]);
    g.rotateY(s * Math.PI / 2);
    g.translate(x + s * (A.w / 2 + 0.0012), 0.56, -0.1);
    pb.add('placard', g, { label: 1 });
  }
  // centre console with cocktail table + cup holder
  pb.add('shell', rbox(0.1, 0.32, 0.47, 0.02, 3, 0, 0.47, -0.02), { colorFn: (xx, y) => 0.72 + 0.28 * smooth(0.33, 0.55, y) });
  pb.add('leather', rbox(0.104, 0.035, 0.3, 0.014, 3, 0, 0.638, 0.06), { color: 0.95 });
  pb.add('shell', rbox(0.19, 0.016, 0.2, 0.007, 2, 0, 0.646, -0.18), { color: 1.25 });
  pb.add('black', tube([0, 0.646, -0.235], [0, 0.6555, -0.235], 0.036, 20), { color: 0.7 });
  pb.add('metal', tube([0, 0.6555, -0.235], [0, 0.656, -0.235], 0.033, 20), { color: 0.5 });
  const ctl = plane(0.06, 0.03, tex.plac.rect('controls'));
  ctl.rotateX(-Math.PI / 2);
  ctl.translate(0, 0.6565, 0.02);
  pb.add('placard', ctl);
  // under-seat shrouds
  for (const x of [-h, h]) pb.add('shell', rbox(0.4, 0.05, 0.4, 0.015, 2, x, 0.3, 0.0), { color: 0.6 });
  return pb.build(['metal', 'shell', 'leather', 'black', 'placard']);
}

/** Business leg rest in legrest-local (hinge at origin, panel hangs down, front face -Z). */
export function buildLegrest() {
  const L = BUS.legrest;
  const pb = new PartBuilder();
  pb.add('leather', rbox(L.w, L.len, L.t, 0.018, 3, 0, -L.len / 2, L.t / 2 - 0.004, (v) => { if (v.z < 0) v.z -= 0.006 * (1 - (v.x / (L.w / 2)) ** 2) * Math.sin(Math.PI * Math.min(1, Math.max(0, -v.y / L.len))); }), { colorFn: (x, y) => 0.8 + 0.2 * smooth(-L.len, -0.1, y) });
  pb.add('shell', rbox(L.w - 0.02, 0.02, L.t + 0.004, 0.006, 2, 0, -L.len + 0.004, L.t / 2 - 0.004), { color: 0.7 });
  return pb.build(['leather', 'shell']);
}

// ------------------------------------------------------------------------------- arm tray (bi-fold half)
export const ARMTRAY = { wHalf: 0.21, depth: 0.25, t: 0.013 };
/** One half of a bi-fold armrest tray, centred at the origin (x across, z depth, y thickness). */
export function buildArmTrayHalf(second) {
  const T = ARMTRAY;
  const g = rbox(T.wHalf - 0.002, T.t, T.depth, 0.005, 2, 0, 0, 0);
  const P = g.attributes.position, N = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < P.count; i++) {
    const u = (P.getX(i) / T.wHalf + 0.5) * 0.25 + (second ? 0.25 : 0), v = (P.getZ(i) / T.depth + 0.5);
    if (N.getY(i) > 0.6) uv.setXY(i, u, v); else uv.setXY(i, 0.5, 0.5);
  }
  const pb = new PartBuilder();
  pb.add('tray', g, { color: 1 });
  return pb.build(['tray']);
}

// ------------------------------------------------------------------------------- seat belts
function beltPaths(C) {
  const top = (x, z) => cushionTop(C, x, z);
  const L = (x, z, h) => [x, top(x, z) + h, z];
  const hw = C.hw;
  const loose = {
    left: [[-hw + 0.012, top(-hw, C.z1) - 0.05, C.z1 - 0.012], [-hw + 0.022, top(-hw + 0.02, C.z1 - 0.05) + 0.002, C.z1 - 0.055], L(-0.15, 0.09, 0.003), L(-0.07, 0.01, 0.0032), L(0.02, -0.06, 0.0032), L(0.075, -0.105, 0.0032)],
    right: [[hw - 0.012, top(hw, C.z1) - 0.05, C.z1 - 0.012], [hw - 0.022, top(hw - 0.02, C.z1 - 0.05) + 0.002, C.z1 - 0.055], L(0.15, 0.09, 0.003), L(0.07, 0.01, 0.0052), L(0.0, -0.045, 0.0078), L(-0.07, -0.1, 0.0045), L(-0.1, -0.125, 0.0042)],
  };
  const fastened = {
    left: [[-hw + 0.012, top(-hw, C.z1) - 0.05, C.z1 - 0.012], [-hw + 0.02, C.top + 0.03, C.z1 - 0.05], [-0.16, C.top + 0.11, 0.1], [-0.1, C.top + 0.155, 0.04], [-0.04, C.top + 0.165, 0.018]],
    right: [[hw - 0.012, top(hw, C.z1) - 0.05, C.z1 - 0.012], [hw - 0.02, C.top + 0.03, C.z1 - 0.05], [0.16, C.top + 0.11, 0.1], [0.1, C.top + 0.155, 0.04], [0.04, C.top + 0.165, 0.018]],
  };
  return { loose, fastened };
}

function basis(side, up, fwd, pos) {
  const m = new THREE.Matrix4().makeBasis(side, up, fwd);
  m.setPosition(pos);
  return m;
}
/** Buckle body (with lift lever) in its local frame: x across the strap, y up, z along (strap enters at -z). */
function buckleBody(pb, m) {
  pb.addT('metal', rbox(0.054, 0.011, 0.072, 0.004, 2, 0, 0, 0.036), m.clone(), { color: 0.85 });
  pb.addT('metal', rbox(0.048, 0.004, 0.058, 0.0018, 1, 0, 0.0065, 0.04, (v) => { v.y += 0.004 * smooth(0.02, 0.07, v.z); }), m.clone(), { color: 1.05 });
}
function latchPlate(pb, m) {
  pb.addT('metal', rbox(0.05, 0.004, 0.02, 0.0015, 1, 0, 0, 0.01), m.clone(), { color: 0.8 });
  pb.addT('metal', rbox(0.03, 0.0025, 0.045, 0.001, 1, 0, 0, 0.042), m.clone(), { color: 1 });
}

export function buildBelts() {
  const C = ECON.cushion;
  const P = beltPaths(C);
  const up = () => [0, 1, 0];
  const W = 0.047, T = 0.0024;
  const mk = (state) => {
    const pb = new PartBuilder();
    const L = P[state].left, R = P[state].right;
    pb.add('webbing', ribbon(L, W, T, up), { color: 1 });
    pb.add('webbing', ribbon(R, W, T, up), { color: 1 });
    // webbing uv: normalise u across the strap so the stitched edges line up
    if (state === 'loose') {
      const endDir = (pts) => { const a = new THREE.Vector3(...pts[pts.length - 2]), b = new THREE.Vector3(...pts[pts.length - 1]); return b.clone().sub(a).setY(0).normalize(); };
      const fL = endDir(L), fR = endDir(R);
      const upV = new THREE.Vector3(0, 1, 0);
      const pL = new THREE.Vector3(...L[L.length - 1]), pR = new THREE.Vector3(...R[R.length - 1]);
      const sL = new THREE.Vector3().crossVectors(upV, fL).normalize(), sR = new THREE.Vector3().crossVectors(upV, fR).normalize();
      latchPlate(pb, basis(sL, upV, fL, pL.clone().addScaledVector(fL, -0.012).add(new THREE.Vector3(0, 0.0005, 0))));
      buckleBody(pb, basis(sR, upV, fR, pR.clone().addScaledVector(fR, -0.02).add(new THREE.Vector3(0, 0.004, 0))));
    } else {
      // buckle centred on the lap, facing up/aft towards the passenger
      const along = new THREE.Vector3(-1, 0, 0), upB = new THREE.Vector3(0, 0.94, 0.34).normalize();
      const side = new THREE.Vector3().crossVectors(upB, along).normalize();
      const pos = new THREE.Vector3(0.035, C.top + 0.168, 0.018);
      buckleBody(pb, basis(side, upB, along, pos));
      const along2 = new THREE.Vector3(1, 0, 0), side2 = new THREE.Vector3().crossVectors(upB, along2).normalize();
      latchPlate(pb, basis(side2, upB, along2, new THREE.Vector3(-0.045, C.top + 0.166, 0.018)));
    }
    return pb.build(['webbing', 'metal']);
  };
  return { loose: mk('loose'), fastened: mk('fastened') };
}

// ------------------------------------------------------------------------------- bulkhead screen mount
export function buildMount(tex) {
  const pb = new PartBuilder();
  pb.add('black', rbox(0.36, 0.22, 0.028, 0.012, 3, 0, 0, -0.014), { color: 0.9 });
  for (const s of [-1, 1]) {
    pb.add('metal', rbox(0.05, 0.03, 0.03, 0.006, 2, s * 0.13, -0.17, 0.0), { color: 0.9 });
    pb.add('black', tube([s * 0.13, -0.17, 0.0], [s * 0.13, -0.17, 0.016], 0.007, 10), { color: 0.6 });
  }
  const p = plane(0.16, 0.026, tex.plac.rect('bassinet'));
  p.translate(0, -0.215, 0.0005);
  pb.add('placard', p);
  return pb.build(['black', 'metal', 'placard']);
}

// ------------------------------------------------------------------------------- dressing
export function buildPillow() {
  const pb = new PartBuilder();
  pb.add('pillow', rbox(0.34, 0.1, 0.24, 0.045, 5, 0, 0, 0, (v) => {
    const ex = 1 - Math.min(1, Math.abs(v.x) / 0.17) ** 4, ez = 1 - Math.min(1, Math.abs(v.z) / 0.12) ** 4;
    v.y *= 0.35 + 0.65 * ex * ez;
  }), { color: 1 });
  return pb.build(['pillow']);
}
export function buildBlanket() {
  const pb = new PartBuilder();
  pb.add('blanket', rbox(0.3, 0.05, 0.21, 0.018, 3, 0, 0, 0, (v) => { v.y += 0.004 * Math.sin(v.x * 30) * (v.y > 0 ? 1 : 0); }), {
    colorFn: (x, y, z) => (Math.abs(z) > 0.085 && y > -0.02 ? 1.7 : 1) * (0.85 + 0.15 * smooth(-0.025, 0.025, y)),
  });
  return pb.build(['blanket']);
}
export function buildNewspaper(tex) {
  const pb = new PartBuilder();
  const g = rbox(0.29, 0.008, 0.38, 0.003, 1, 0, 0, 0, (v) => { v.y += 0.004 * Math.cos(v.x * 8); });
  const P = g.attributes.position, uv = g.attributes.uv, r = tex.paper.rect('news');
  for (let i = 0; i < P.count; i++) uv.setXY(i, r[0] + (P.getX(i) / 0.29 + 0.5) * r[2], r[1] + (0.5 - P.getZ(i) / 0.38) * r[3]);
  pb.add('paper', g, { color: 1 });
  const h = rbox(0.12, 0.035, 0.16, 0.004, 1, 0.0, 0.0, 0.0);
  const P2 = h.attributes.position, uv2 = h.attributes.uv, r2 = tex.paper.rect('box');
  for (let i = 0; i < P2.count; i++) uv2.setXY(i, r2[0] + (P2.getX(i) / 0.12 + 0.5) * r2[2], r2[1] + (0.5 - P2.getZ(i) / 0.16) * r2[3]);
  return { news: pb.build(['paper']), box: (() => { const b = new PartBuilder(); b.add('paper', h, { color: 1 }); return b.build(['paper']); })() };
}
export function buildBottle() {
  const pb = new PartBuilder();
  const pts = [];
  const prof = [[0, 0], [0.03, 0], [0.032, 0.005], [0.032, 0.14], [0.026, 0.16], [0.014, 0.18], [0.013, 0.19], [0, 0.19]];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 16);
  boxUV(g, 1);
  pb.add('bottle', g, { color: 1 });
  pb.add('cap', tube([0, 0.188, 0], [0, 0.206, 0], 0.0145, 14), { color: 1 });
  pb.add('cap', tube([0, 0.07, 0], [0, 0.11, 0], 0.0325, 16, false), { color: 1.6 });
  return pb.build(['bottle', 'cap']);
}

export { finalize, clamp01 };
