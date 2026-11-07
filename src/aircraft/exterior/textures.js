// =============================================================================
// Procedural canvas textures for the exterior: wing atlas (colour + normal +
// roughness/metalness), nacelle, tyres, spinner swirl, fan blur disc, reverser
// cascades and the stencil decal sheet. All drawn once at init.
// =============================================================================
import * as THREE from 'three';
import { S0, S_RANGE, TIP_S, chordX, KINK_X, LAYOUT as L, SWATCH, station } from './planform.js';

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return c;
}

/** soft value-noise canvas (cells x cells random, upscaled smoothly) */
export function noiseCanvas(w, h, cells, seed, { lo = 0, hi = 255, cellsY = null } = {}) {
  const r = rng(seed);
  const cy = cellsY || cells;
  const small = canvas(cells, cy);
  const sx = small.getContext('2d');
  const img = sx.createImageData(cells, cy);
  for (let i = 0; i < cells * cy; i++) {
    const v = lo + (hi - lo) * r();
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  sx.putImageData(img, 0, 0);
  const big = canvas(w, h);
  const bx = big.getContext('2d');
  bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = 'high';
  bx.drawImage(small, 0, 0, w, h);
  return big;
}

/** Height canvas (grey, 128 = flat) -> tangent-space normal map canvas (OpenGL, +Y up). */
export function heightToNormal(hc, strength = 2.0, wrapX = false) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const ox = out.getContext('2d');
  const img = ox.createImageData(w, h);
  const d = img.data;
  const H = (x, y) => {
    if (wrapX) x = (x + w) % w; else x = x < 0 ? 0 : x >= w ? w - 1 : x;
    y = y < 0 ? 0 : y >= h ? h - 1 : y;
    return src[(y * w + x) * 4];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) / 255 * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) / 255 * strength;
      // canvas y goes down; texture v goes up -> flip dy for OpenGL convention
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const k = (y * w + x) * 4;
      d[k] = (nx / l * 0.5 + 0.5) * 255; d[k + 1] = (ny / l * 0.5 + 0.5) * 255; d[k + 2] = (nz / l * 0.5 + 0.5) * 255; d[k + 3] = 255;
    }
  }
  ox.putImageData(img, 0, 0);
  return out;
}

export function tex(c, { srgb = true, repeat = null, wrap = THREE.ClampToEdgeWrapping, aniso = 8, flipY = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = wrap;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.flipY = flipY;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// ============================================================================
// WING ATLAS
// ============================================================================
export function wingAtlas(size = 2048, aniso = 8, liv = null) {
  const W = size, H = size;
  const col = canvas(W, H), hgt = canvas(W, H), rm = canvas(W, H);
  const c = col.getContext('2d'), h = hgt.getContext('2d'), r = rm.getContext('2d');
  const R = rng(738);
  const X = (s) => (s - S0) / S_RANGE * 0.97 * W;
  const Y = (f, side) => (side > 0 ? 0.5 - 0.5 * f : 0.5 + 0.5 * f) * H;
  const fOf = (s, m) => m / chordX(Math.min(s, TIP_S));          // metres from LE -> chord fraction
  const sMaxStraight = TIP_S;

  // --- base layers ---------------------------------------------------------------
  c.fillStyle = '#c4c7ca'; c.fillRect(0, 0, W, H);
  h.fillStyle = 'rgb(128,128,128)'; h.fillRect(0, 0, W, H);
  // roughness (G) / metalness (B)
  r.fillStyle = 'rgb(255,108,0)'; r.fillRect(0, 0, W, H);

  // lower surface slightly different grey, a touch darker & more matte
  c.fillStyle = '#b9bcbf'; c.fillRect(0, H / 2, W, H / 2);
  r.fillStyle = 'rgb(255,122,0)'; r.fillRect(0, H / 2, W, H / 2);

  // large soft paint tone variation
  c.globalAlpha = 0.10; c.globalCompositeOperation = 'multiply';
  c.drawImage(noiseCanvas(W, H, 24, 11, { lo: 170, hi: 255 }), 0, 0);
  c.globalAlpha = 0.06; c.drawImage(noiseCanvas(W, H, 96, 12, { lo: 190, hi: 255 }), 0, 0);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;

  // --- per-panel shading: skins between ribs have slightly different tones -------
  const ribs = [];
  for (let s = 1.9; s < sMaxStraight; s += 0.62 + R() * 0.05) ribs.push(s);
  for (let i = 0; i < ribs.length - 1; i++) {
    for (const side of [1, -1]) {
      const tone = (R() - 0.5) * 10;
      c.fillStyle = tone > 0 ? `rgba(255,255,255,${tone / 255 * 2})` : `rgba(0,0,0,${-tone / 255 * 2})`;
      const fa = 0.16, fb = side > 0 ? 0.62 : 0.70;
      const y0 = Y(fa, side), y1 = Y(fb, side);
      c.fillRect(X(ribs[i]), Math.min(y0, y1), X(ribs[i + 1]) - X(ribs[i]), Math.abs(y1 - y0));
    }
  }

  // --- leading-edge band: bare aluminium (slats + fixed LE) ------------------------
  {
    const fLE = 0.17;
    const yA = Y(fLE, 1), yB = Y(fLE, -1);
    const g = c.createLinearGradient(0, yA, 0, yB);
    g.addColorStop(0, '#c9ccce'); g.addColorStop(0.08, '#d5d8da'); g.addColorStop(0.5, '#cfd2d4'); g.addColorStop(0.92, '#d2d5d7'); g.addColorStop(1, '#c4c7c9');
    c.fillStyle = g; c.fillRect(0, yA, X(sMaxStraight + 0.4), yB - yA);
    // brushing streaks along the span
    for (let i = 0; i < 2600; i++) {
      const y = yA + R() * (yB - yA);
      const x = R() * X(sMaxStraight);
      const len = 30 + R() * 260;
      c.fillStyle = R() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(60,65,70,0.05)';
      c.fillRect(x, y, len, 1);
      r.fillStyle = `rgba(255,${40 + R() * 60},255,0.35)`;
      r.fillRect(x, y, len, 1);
    }
    r.globalAlpha = 1;
    r.fillStyle = 'rgba(255,58,255,0.65)'; r.fillRect(0, yA, X(sMaxStraight + 0.4), yB - yA);
    // erosion / bug residue right at the stagnation line (lower side of the nose)
    c.globalAlpha = 0.35;
    for (let i = 0; i < 1400; i++) {
      const s = S0 + R() * (sMaxStraight - S0);
      const f = 0.003 + Math.pow(R(), 2) * 0.03;
      c.fillStyle = R() > 0.3 ? '#7d7466' : '#5a5650';
      c.fillRect(X(s), Y(f, -1), 1 + R() * 2, 1 + R() * 1.5);
    }
    c.globalAlpha = 1;
    // slat panel seams (spanwise lines at the slat trailing edges are geometry; add rivet rows)
  }

  // --- panel lines & rivets ---------------------------------------------------------
  const line = (x0, y0, x1, y1, w = 1.5, depth = 60) => {
    h.strokeStyle = `rgb(${128 - depth},${128 - depth},${128 - depth})`; h.lineWidth = w;
    h.beginPath(); h.moveTo(x0, y0); h.lineTo(x1, y1); h.stroke();
    c.strokeStyle = 'rgba(70,74,80,0.28)'; c.lineWidth = w * 0.8;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  };
  const rivetRow = (x0, y0, x1, y1, spacingPx, bright = 0.12) => {
    const n = Math.max(1, Math.floor(Math.hypot(x1 - x0, y1 - y0) / spacingPx));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      h.fillStyle = 'rgb(141,141,141)'; h.fillRect(x - 0.5, y - 0.5, 1.4, 1.4);
      c.fillStyle = `rgba(${R() > 0.5 ? '255,255,255' : '90,95,100'},${bright * 0.6})`; c.fillRect(x - 0.5, y - 0.5, 1.2, 1.2);
    }
  };
  const pxPerM = 0.97 * W / S_RANGE;
  // spar lines (front ~15%, rear ~62% / 70% lower) along the whole straight wing
  for (const side of [1, -1]) {
    for (const f of [0.17, 0.155]) {
      line(X(S0), Y(f, side), X(sMaxStraight), Y(f, side), 1.2, f === 0.17 ? 70 : 25);
    }
    // stringer rivet rows (constant chord fraction lines between the spars)
    for (let k = 0; k <= 11; k++) {
      const f = 0.19 + k * (0.41 / 11);
      for (let s = 1.9; s < sMaxStraight; s += 1.0) {
        rivetRow(X(s), Y(f, side), X(Math.min(sMaxStraight, s + 1.0)), Y(f, side), pxPerM * 0.09, 0.07);
      }
    }
  }
  // ribs: chordwise rivet rows + faint lap joints
  for (const s of ribs) {
    for (const side of [1, -1]) {
      const c0 = chordX(s);
      rivetRow(X(s), Y(0.17, side), X(s), Y(side > 0 ? 0.62 : 0.70, side), (H / 2) * 0.05 / c0, 0.09);
    }
  }
  // skin splice lines (a few long chordwise seams)
  for (const s of [4.3, 7.9, 11.6, 14.6]) {
    for (const side of [1, -1]) line(X(s), Y(0.17, side), X(s + 0.12), Y(side > 0 ? 0.62 : 0.70, side), 1.3, 45);
  }

  // --- access panels ----------------------------------------------------------------
  const panel = (s, fm, wm, hm, side, { round = 0.3, depth = 55, screws = true } = {}) => {
    // s: span centre, fm: chordwise centre (metres from LE), wm/hm: size in metres (span x chord)
    const cc = chordX(Math.min(s, TIP_S));
    const x = X(s), y = Y(fm / cc, side);
    const w = wm * pxPerM, hh = hm / cc * H / 2;
    h.strokeStyle = `rgb(${128 - depth},${128 - depth},${128 - depth})`; h.lineWidth = 1.6;
    rr(h, x - w / 2, y - hh / 2, w, hh, Math.min(w, hh) * round); h.stroke();
    c.strokeStyle = 'rgba(60,64,70,0.32)'; c.lineWidth = 1.1;
    rr(c, x - w / 2, y - hh / 2, w, hh, Math.min(w, hh) * round); c.stroke();
    if (screws) {
      const n = Math.max(4, Math.round((w + hh) * 2 / 9));
      for (let i = 0; i < n; i++) {
        const t = i / n;
        let px, py;
        const per = 2 * (w + hh), d = t * per;
        if (d < w) { px = x - w / 2 + d; py = y - hh / 2 + 3; } else if (d < w + hh) { px = x + w / 2 - 3; py = y - hh / 2 + (d - w); } else if (d < 2 * w + hh) { px = x + w / 2 - (d - w - hh); py = y + hh / 2 - 3; } else { px = x - w / 2 + 3; py = y + hh / 2 - (d - 2 * w - hh); }
        h.fillStyle = 'rgb(112,112,112)'; h.fillRect(px - 0.7, py - 0.7, 1.6, 1.6);
        c.fillStyle = 'rgba(80,84,90,0.3)'; c.fillRect(px - 0.6, py - 0.6, 1.3, 1.3);
      }
    }
  };
  // upper: small slat-track / LE access panels just aft of the front spar
  for (let s = 6.2; s < 16.4; s += 1.35) panel(s, chordX(s) * 0.2, 0.32, 0.18, 1, { round: 0.2 });
  for (let s = 2.4; s < 15; s += 1.1 + R() * 0.3) panel(s, chordX(s) * 0.55, 0.42, 0.24, 1, { round: 0.25, depth: 40 });
  // lower: oval fuel tank access doors in each rib bay + drain masts
  for (let i = 0; i < ribs.length - 1; i++) {
    const s = (ribs[i] + ribs[i + 1]) / 2;
    if (s > 15.8) break;
    const cc = chordX(s);
    panel(s, cc * 0.38, 0.46, Math.min(0.32, cc * 0.11), -1, { round: 0.5, depth: 70 });
  }
  for (let s = 2.2; s < 15.5; s += 2.2) panel(s, chordX(s) * 0.62, 0.6, 0.3, -1, { round: 0.15, depth: 45 });

  // fuel filler cap (upper surface, outboard)
  {
    const s = 12.9, cc = chordX(s), x = X(s), y = Y(0.42, 1);
    const rx = 0.07 * pxPerM, ry = 0.07 / cc * H / 2;
    c.fillStyle = '#9fa3a6'; ell(c, x, y, rx * 1.4, ry * 1.4); c.fill();
    c.fillStyle = '#8c9094'; ell(c, x, y, rx, ry); c.fill();
    c.strokeStyle = 'rgba(40,40,40,0.6)'; c.lineWidth = 1; ell(c, x, y, rx * 1.4, ry * 1.4); c.stroke();
    h.fillStyle = 'rgb(150,150,150)'; ell(h, x, y, rx * 1.4, ry * 1.4); h.fill();
    h.strokeStyle = 'rgb(70,70,70)'; h.lineWidth = 1.5; ell(h, x, y, rx, ry); h.stroke();
    r.fillStyle = 'rgb(255,70,180)'; ell(r, x, y, rx * 1.4, ry * 1.4); r.fill();
  }

  // --- over-wing escape route & walkway (upper, near the root) -------------------------
  {
    const sA = 1.95, sB = 3.55;
    const fA = 0.24, fB = 0.6;
    const xa = X(sA), xb = X(sB), ya = Y(fB, 1), yb = Y(fA, 1);
    // non-slip walkway area: darker grey, very rough
    c.fillStyle = '#9da1a5'; c.fillRect(xa, ya, xb - xa, yb - ya);
    c.globalAlpha = 0.25; c.globalCompositeOperation = 'multiply';
    c.drawImage(noiseCanvas(Math.ceil(xb - xa), Math.ceil(yb - ya), 120, 21, { lo: 150, hi: 255 }), xa, ya);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    r.fillStyle = 'rgb(255,215,0)'; r.fillRect(xa, ya, xb - xa, yb - ya);
    // black border lines (escape path) + arrow towards the trailing edge
    c.strokeStyle = '#1b1d20'; c.lineWidth = 0.05 * pxPerM;
    c.strokeRect(xa, ya, xb - xa, yb - ya);
    const ax = (xa + xb) / 2;
    c.fillStyle = '#1b1d20';
    for (const fy of [0.33, 0.46]) {
      const y = Y(fy, 1), sz = 0.18 * pxPerM;
      c.beginPath(); c.moveTo(ax, y - sz * 0.9); c.lineTo(ax - sz * 0.6, y); c.lineTo(ax - sz * 0.2, y); c.lineTo(ax - sz * 0.2, y + sz * 0.6);
      c.lineTo(ax + sz * 0.2, y + sz * 0.6); c.lineTo(ax + sz * 0.2, y); c.lineTo(ax + sz * 0.6, y); c.closePath(); c.fill();
    }
  }
  // --- trailing-edge region (flaps / spoilers / aileron) ---------------------------------
  {
    // spoilers & flaps upper surface: a little darker, hydraulic grime streaking aft
    const yS0 = Y(0.6, 1), yTE = Y(1.0, 1);
    c.globalAlpha = 1;
    for (let i = 0; i < 900; i++) {
      const s = 1.9 + R() * (TIP_S - 2.1);
      const x = X(s);
      const f0 = 0.62 + R() * 0.25;
      const y0 = Y(f0, 1);
      const len = (0.05 + R() * 0.22) * H / 2;
      const a = 0.02 + R() * 0.05;
      const grd = c.createLinearGradient(0, y0, 0, y0 - len);
      grd.addColorStop(0, `rgba(70,64,56,${a})`); grd.addColorStop(1, 'rgba(70,64,56,0)');
      c.fillStyle = grd; c.fillRect(x, y0 - len, 1 + R() * 3, len);
    }
    // gentle darkening towards the TE
    const g = c.createLinearGradient(0, yS0, 0, yTE);
    g.addColorStop(0, 'rgba(60,58,55,0)'); g.addColorStop(1, 'rgba(60,58,55,0.12)');
    c.fillStyle = g; c.fillRect(0, yTE, X(TIP_S), yS0 - yTE);
    r.fillStyle = 'rgba(255,150,0,0.35)'; r.fillRect(0, yTE, X(TIP_S), yS0 - yTE);
    // lower surface: engine exhaust & hydraulic grime behind the nacelle on the flaps
    const yl0 = Y(0.55, -1), yl1 = Y(1.0, -1);
    const xe = X(4.93);
    const ge = c.createRadialGradient(xe, yl1, 4, xe, yl1, 2.2 * pxPerM);
    ge.addColorStop(0, 'rgba(40,36,32,0.35)'); ge.addColorStop(1, 'rgba(40,36,32,0)');
    c.fillStyle = ge; c.fillRect(xe - 2.4 * pxPerM, yl0, 4.8 * pxPerM, yl1 - yl0);
    for (let i = 0; i < 500; i++) {
      const s = 1.9 + R() * (TIP_S - 2.1);
      const y0 = Y(0.3 + R() * 0.4, -1);
      const len = (0.08 + R() * 0.3) * H / 2;
      const grd = c.createLinearGradient(0, y0, 0, y0 + len);
      const a = 0.02 + R() * 0.05;
      grd.addColorStop(0, `rgba(55,50,44,${a})`); grd.addColorStop(1, 'rgba(55,50,44,0)');
      c.fillStyle = grd; c.fillRect(X(s), y0, 1 + R() * 3, len);
    }
  }

  // --- winglet: painted in the livery colour, emblem on the inboard (upper) face -------
  {
    const xw = X(TIP_S + 0.12), xe = X(TIP_S + 4);
    const wc = (liv && liv.wingletColor) || '#c7cacc';
    const grd = c.createLinearGradient(X(TIP_S - 0.05), 0, xw + 6, 0);
    grd.addColorStop(0, '#c4c7ca'); grd.addColorStop(1, wc);
    c.fillStyle = grd; c.fillRect(X(TIP_S - 0.05), 0, xw + 6 - X(TIP_S - 0.05), H);
    c.fillStyle = wc; c.fillRect(xw, 0, xe - xw, H);
    r.fillStyle = 'rgb(255,80,0)'; r.fillRect(X(TIP_S), 0, xe - X(TIP_S), H);
    if (liv && liv.tail) {
      // emblem: ring + bird-like chevron in the accent colours, on both faces
      for (const side of [1, -1]) {
        const cx = X(TIP_S + 1.65), cy = Y(0.45, side);
        c.save(); c.translate(cx, cy); c.scale(pxPerM, H / 2 / 0.85);
        const rad = 0.27;
        c.fillStyle = liv.tail.c2 || '#e8b04b'; c.beginPath(); c.arc(0, 0, rad, 0, Math.PI * 2); c.fill();
        c.fillStyle = wc; c.beginPath(); c.arc(0, 0, rad * 0.8, 0, Math.PI * 2); c.fill();
        c.fillStyle = liv.tail.c1 || '#1f7a8c';
        c.beginPath(); c.moveTo(-rad * 0.5, rad * 0.55); c.quadraticCurveTo(0, -rad * 0.1, rad * 0.55, -rad * 0.6);
        c.quadraticCurveTo(rad * 0.15, rad * 0.1, -rad * 0.1, rad * 0.65); c.closePath(); c.fill();
        c.restore();
      }
    }
    // winglet leading-edge erosion strip (bare)
    c.fillStyle = '#cfd2d4';
    c.fillRect(xw, Y(0.05, 1), xe - xw, Y(0.05, -1) - Y(0.05, 1));
    r.fillStyle = 'rgb(255,70,255)';
    r.fillRect(xw, Y(0.04, 1), xe - xw, Y(0.04, -1) - Y(0.04, 1));
  }

  // --- swatch column ---------------------------------------------------------------------
  {
    const x0 = 0.975 * W;
    const sw = (v, color, rough, metal = 0) => {
      const y = (1 - v) * H;
      c.fillStyle = color; c.fillRect(x0, y - 0.06 * H, W - x0, 0.12 * H);
      r.fillStyle = `rgb(255,${rough},${metal})`; r.fillRect(x0, y - 0.06 * H, W - x0, 0.12 * H);
      h.fillStyle = 'rgb(128,128,128)'; h.fillRect(x0, y - 0.06 * H, W - x0, 0.12 * H);
    };
    sw(SWATCH.cove[1], '#5d6166', 170);
    sw(SWATCH.under[1], '#a9adb1', 140);
    // canoe: vertical gradient grey with grime
    const yc = (1 - SWATCH.canoe[1]) * H;
    const gc = c.createLinearGradient(0, yc - 0.12 * H, 0, yc + 0.1 * H);
    gc.addColorStop(0, '#b6b9bc'); gc.addColorStop(0.7, '#a6a9ac'); gc.addColorStop(1, '#7e7f7e');
    c.fillStyle = gc; c.fillRect(x0, yc - 0.12 * H, W - x0, 0.22 * H);
    r.fillStyle = 'rgb(255,165,0)'; r.fillRect(x0, yc - 0.12 * H, W - x0, 0.22 * H);
    h.fillStyle = 'rgb(128,128,128)'; h.fillRect(x0, yc - 0.12 * H, W - x0, 0.22 * H);
    sw(SWATCH.vg[1], '#b8bbbe', 140);
    sw(SWATCH.wick[1], '#222326', 150);
    sw(SWATCH.light[1], '#e8eaec', 40, 0);
  }

  const normal = heightToNormal(hgt, 3.0);
  return {
    map: tex(col, { aniso }),
    normalMap: tex(normal, { srgb: false, aniso }),
    roughnessMap: tex(rm, { srgb: false, aniso }),
    canvases: { col, normal, rm },
  };
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function ell(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2); }
export { rr, ell };

// ============================================================================
// STENCIL DECAL SHEET  (white background transparent; RGBA)
//   rows of text items, each in its own cell; returns cell UV rects
// ============================================================================
export function stencilSheet() {
  const W = 1024, Hh = 512;
  const c = canvas(W, Hh);
  const x = c.getContext('2d');
  x.clearRect(0, 0, W, Hh);
  const cells = {};
  const put = (id, cx, cy, cw, ch, draw) => {
    x.save(); x.translate(cx, cy); draw(x, cw, ch); x.restore();
    cells[id] = { u0: cx / W, v0: 1 - (cy + ch) / Hh, u1: (cx + cw) / W, v1: 1 - cy / Hh, aspect: cw / ch };
  };
  const text = (str, color, font, cw, ch, opts = {}) => (g) => {
    g.fillStyle = color; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (opts.box) { g.strokeStyle = color; g.lineWidth = opts.box; g.strokeRect(opts.box, opts.box, cw - opts.box * 2, ch - opts.box * 2); }
    g.fillText(str, cw / 2, ch / 2 + 2);
  };
  put('nostep', 0, 0, 256, 64, text('NO STEP', '#b3191c', 'bold 40px Arial, Helvetica, sans-serif', 256, 64));
  put('nostepBlack', 256, 0, 256, 64, text('NO STEP', '#202226', 'bold 40px Arial, Helvetica, sans-serif', 256, 64));
  put('exit', 512, 0, 256, 64, text('EXIT', '#202226', 'bold 44px Arial, Helvetica, sans-serif', 256, 64, { box: 4 }));
  put('fuel', 768, 0, 256, 64, (g) => {
    g.fillStyle = '#202226'; g.font = 'bold 22px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('FUEL  JET A', 128, 22); g.font = '16px Arial, Helvetica, sans-serif'; g.fillText('CAP 40 IN-LB', 128, 46);
  });
  put('walk', 0, 64, 512, 64, text('DO NOT WALK OUTSIDE THIS AREA', '#1b1d20', 'bold 30px Arial, Helvetica, sans-serif', 512, 64));
  put('jack', 512, 64, 256, 64, text('JACK POINT', '#202226', 'bold 30px Arial, Helvetica, sans-serif', 256, 64));
  put('static', 768, 64, 256, 64, text('STATIC PORT', '#202226', 'bold 28px Arial, Helvetica, sans-serif', 256, 64));
  put('slat', 0, 128, 256, 64, text('SLAT', '#202226', 'bold 34px Arial, Helvetica, sans-serif', 256, 64));
  put('danger', 256, 128, 512, 64, (g) => {
    g.fillStyle = '#b3191c'; g.fillRect(0, 8, 512, 48);
    g.fillStyle = '#ffffff'; g.font = 'bold 28px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('DANGER  -  ENGINE INTAKE', 256, 34);
  });
  put('chevron', 768, 128, 128, 64, (g) => {
    g.fillStyle = '#b3191c';
    g.beginPath(); g.moveTo(8, 8); g.lineTo(70, 32); g.lineTo(8, 56); g.lineTo(28, 32); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(58, 8); g.lineTo(120, 32); g.lineTo(58, 56); g.lineTo(78, 32); g.closePath(); g.fill();
  });
  put('reg', 0, 192, 512, 96, text('N738HY', '#202226', 'bold 70px Arial, Helvetica, sans-serif', 512, 96));
  put('fan', 512, 192, 512, 96, (g) => {
    g.fillStyle = '#e8b04b'; g.font = 'bold 34px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('STAND CLEAR OF INTAKE', 256, 48);
  });
  put('rev', 0, 288, 512, 64, text('REVERSER  -  DO NOT OPEN', '#e6e6e6', 'bold 26px Arial, Helvetica, sans-serif', 512, 64));
  put('rev2', 512, 288, 512, 64, text('THRUST REVERSER', '#e6e6e6', 'bold 30px Arial, Helvetica, sans-serif', 512, 64));
  const t = tex(c, { srgb: true });
  return { texture: t, cells };
}

// ============================================================================
// NACELLE (u = around (0 top, .25 outboard-right...), v = along length 0 inlet .. 1 aft)
// ============================================================================
export function nacelleTexture(livery, size = 1024) {
  const W = size, H = size / 2;
  const col = canvas(W, H), rm = canvas(W, H), hgt = canvas(W, H);
  const c = col.getContext('2d'), r = rm.getContext('2d'), h = hgt.getContext('2d');
  const R = rng(55);
  const base = livery.engine || '#0b2a4a';
  // canvas x = around, canvas y = along (v=0 inlet at bottom since flipY -> y = (1-v)H)
  const Y = (v) => (1 - v) * H;
  c.fillStyle = base; c.fillRect(0, 0, W, H);
  r.fillStyle = 'rgb(255,92,0)'; r.fillRect(0, 0, W, H);
  h.fillStyle = 'rgb(128,128,128)'; h.fillRect(0, 0, W, H);
  // subtle tonal noise
  c.globalAlpha = 0.12; c.globalCompositeOperation = 'overlay';
  c.drawImage(noiseCanvas(W, H, 32, 9, { lo: 60, hi: 200 }), 0, 0);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  // accent ring near the inlet
  if (livery.engineRing) {
    c.fillStyle = livery.engineRing; c.fillRect(0, Y(0.105), W, Y(0.085) - Y(0.105));
    if (livery.engineRing2) { c.fillStyle = livery.engineRing2; c.fillRect(0, Y(0.122), W, Y(0.112) - Y(0.122)); }
  }
  // fan cowl / thrust reverser split line & latch line along the bottom
  const seam = (v, w = 2, d = 70) => {
    h.fillStyle = `rgb(${128 - d},${128 - d},${128 - d})`; h.fillRect(0, Y(v) - w / 2, W, w);
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, Y(v) - w / 2, W, w * 0.7);
  };
  seam(0.075); seam(0.47, 3, 80); seam(0.56, 2);
  for (const u of [0.5 - 0.004, 0.5 + 0.004]) { h.fillStyle = 'rgb(60,60,60)'; h.fillRect(u * W - 1, Y(0.47), 2, Y(0.075) - Y(0.47)); }
  // latches on the bottom
  for (const v of [0.18, 0.28, 0.38]) {
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0.5 * W - 10, Y(v) - 4, 20, 8);
    h.fillStyle = 'rgb(90,90,90)'; h.fillRect(0.5 * W - 10, Y(v) - 4, 20, 8);
  }
  // access panels (both sides)
  for (const u of [0.3, 0.7]) {
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1.5; c.strokeRect(u * W - 26, Y(0.3), 52, Y(0.2) - Y(0.3));
    h.strokeStyle = 'rgb(70,70,70)'; h.lineWidth = 1.5; h.strokeRect(u * W - 26, Y(0.3), 52, Y(0.2) - Y(0.3));
  }
  // grime: streaks along the lower half running aft, darker at the aft end
  for (let i = 0; i < 380; i++) {
    const u = 0.25 + R() * 0.5;
    const v0 = 0.1 + R() * 0.5, len = 0.05 + R() * 0.3;
    const g = c.createLinearGradient(0, Y(v0), 0, Y(v0 + len));
    const a = 0.03 + R() * 0.06;
    g.addColorStop(0, 'rgba(25,22,20,0)'); g.addColorStop(0.3, `rgba(25,22,20,${a})`); g.addColorStop(1, 'rgba(25,22,20,0)');
    c.fillStyle = g; c.fillRect(u * W, Y(v0 + len), 1 + R() * 3, Y(v0) - Y(v0 + len));
  }
  const ga = c.createLinearGradient(0, Y(0.55), 0, Y(1));
  ga.addColorStop(0, 'rgba(20,18,16,0)'); ga.addColorStop(1, 'rgba(20,18,16,0.35)');
  c.fillStyle = ga; c.fillRect(0, Y(1), W, Y(0.55) - Y(1));
  r.fillStyle = 'rgba(255,170,0,0.4)'; r.fillRect(0, Y(1), W, Y(0.6) - Y(1));
  const normal = heightToNormal(hgt, 2.5, true);
  return { map: tex(col, { wrap: THREE.RepeatWrapping }), normalMap: tex(normal, { srgb: false, wrap: THREE.RepeatWrapping }), roughnessMap: tex(rm, { srgb: false, wrap: THREE.RepeatWrapping }) };
}

// ============================================================================
// SPINNER (u around, v from tip (0) to base (1)) with the white swirl mark
// ============================================================================
export function spinnerTexture() {
  const W = 512, H = 256;
  const c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#3c3f43'; x.fillRect(0, 0, W, H);
  // spiral: a curved band starting near the tip winding out to the base
  x.fillStyle = '#f2f2f0';
  x.beginPath();
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const v = 0.06 + t * 0.94;
    const u = 0.0 + t * 0.62;
    const w = 0.018 + 0.05 * t;
    pts.push([u, v, w]);
  }
  for (const [u, v, w] of pts) x.lineTo((u - w) * W, (1 - v) * H);
  for (let i = pts.length - 1; i >= 0; i--) { const [u, v, w] = pts[i]; x.lineTo((u + w) * W, (1 - v) * H); }
  x.closePath(); x.fill();
  // wrap copy (the band crosses u = 0)
  x.fillStyle = '#f2f2f0';
  x.beginPath();
  for (const [u, v, w] of pts) x.lineTo((u - w - 1) * W, (1 - v) * H);
  for (let i = pts.length - 1; i >= 0; i--) { const [u, v, w] = pts[i]; x.lineTo((u + w - 1) * W, (1 - v) * H); }
  x.closePath(); x.fill();
  return tex(c, { wrap: THREE.RepeatWrapping });
}

/** Fan face blur disc: radial gradient with faint blade streaks (u,v standard disc UV). */
export function fanBlurTexture() {
  const S = 256, c = canvas(S, S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(70,72,76,1)'); g.addColorStop(0.5, 'rgba(92,95,99,1)'); g.addColorStop(0.92, 'rgba(110,113,117,1)'); g.addColorStop(1, 'rgba(40,40,42,1)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.globalAlpha = 0.08;
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    x.strokeStyle = i % 2 ? '#000' : '#fff'; x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(S / 2 + Math.cos(a) * S * 0.18, S / 2 + Math.sin(a) * S * 0.18);
    x.lineTo(S / 2 + Math.cos(a + 0.25) * S * 0.5, S / 2 + Math.sin(a + 0.25) * S * 0.5); x.stroke();
  }
  return tex(c);
}

/** Thrust reverser cascade vanes (grid of dark slots). */
export function cascadeTexture() {
  const W = 512, H = 128, c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#2c2e31'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 48; i++) {
    for (let j = 0; j < 6; j++) {
      const px = i * (W / 48) + 1.5, py = j * (H / 6) + 2;
      const g = x.createLinearGradient(0, py, 0, py + H / 6 - 4);
      g.addColorStop(0, '#5a5d61'); g.addColorStop(0.5, '#141517'); g.addColorStop(1, '#0a0a0b');
      x.fillStyle = g; x.fillRect(px, py, W / 48 - 3, H / 6 - 4);
    }
  }
  return tex(c, { wrap: THREE.RepeatWrapping });
}

/** Tyre sidewall + tread: u around the tyre, v across (sidewall-tread-sidewall). */
export function tyreTexture() {
  const W = 512, H = 128, c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#1d1e20'; x.fillRect(0, 0, W, H);
  // tread grooves (circumferential)
  for (const v of [0.38, 0.46, 0.54, 0.62]) { x.fillStyle = '#0d0d0e'; x.fillRect(0, v * H - 1.5, W, 3); }
  // worn tread band lighter
  x.fillStyle = 'rgba(80,80,82,0.25)'; x.fillRect(0, 0.33 * H, W, 0.34 * H);
  // sidewall lettering hints
  x.fillStyle = 'rgba(120,120,122,0.35)'; x.font = 'bold 10px Arial';
  for (let i = 0; i < 6; i++) { x.fillText('H44.5x16.5-21  26PR', i * 86, 0.15 * H); x.fillText('RETREAD', i * 86 + 30, 0.88 * H); }
  return tex(c, { wrap: THREE.RepeatWrapping });
}
