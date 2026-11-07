// =============================================================================
// Fictional liveries (no real airline branding) painted onto the livery atlas:
// fuselage band (top FUS_V of the canvas, u = z, v = angle around) + fin band
// (right side in the left half, left side in the right half).
// =============================================================================
import * as THREE from 'three';
import { AIRCRAFT, WINDOWS, WINDOW, DOORS } from '../../core/constants.js';
import { fuselageShape, phiAt, FUS_V, Z0, Z1, FIN, finStation, MAIN_WELL, NOSE_WELL } from './fuselage.js';
import { canvas, tex, rng, noiseCanvas, heightToNormal } from './textures.js';

/** flat colour swatches painted in an unused corner of the fin band (UV centres) */
export const LSW = { engine: [0.4075, 0.285], ring: [0.4225, 0.285], grey: [0.4375, 0.285], dark: [0.4525, 0.285], metal: [0.4675, 0.285], tyre: [0.4825, 0.285], white: [0.4075, 0.235], glass: [0.4225, 0.235], belly: [0.4375, 0.235], crown: [0.4525, 0.235], light: [0.4675, 0.235] };

export const LIVERIES = {
  halcyon: {
    name: 'Halcyon Airways', title: 'Halcyon', titleFont: 'italic 600 {px}px Georgia, "Times New Roman", serif', titleColor: '#0b2a4a',
    crown: '#f3f1ea', belly: '#0b2a4a', stripes: ['#1f7a8c', '#e8b04b'], style: 'swoosh',
    tail: { bg: '#0b2a4a', art: 'kingfisher', c1: '#1f7a8c', c2: '#e8b04b', c3: '#f3f1ea' },
    engine: '#0b2a4a', engineRing: '#e8b04b', engineRing2: '#1f7a8c', reg: 'N738HY', wingletColor: '#0b2a4a',
  },
  northwind: {
    name: 'Northwind', title: 'NORTHWIND', titleFont: 'bold {px}px "Arial Black", Arial, sans-serif', titleColor: '#24527a',
    crown: '#f5f7f8', belly: '#c3c9ce', stripes: ['#24527a'], style: 'straight',
    tail: { bg: '#24527a', art: 'compass', c1: '#ffffff', c2: '#8fc1e3' },
    engine: '#24527a', engineRing: '#ffffff', reg: 'N417NW', wingletColor: '#24527a',
  },
  solaris: {
    name: 'Solaris', title: 'solaris', titleFont: 'bold {px}px "Trebuchet MS", Arial, sans-serif', titleColor: '#e2591f',
    crown: '#fbfbf9', belly: '#fbfbf9', stripes: ['#f4a11d', '#e2591f'], style: 'band',
    tail: { bg: '#e2591f', art: 'sun', c1: '#f9c22e', c2: '#fff3d0' },
    engine: '#e2591f', engineRing: '#f9c22e', reg: 'N86SL', wingletColor: '#e2591f',
  },
  coral: {
    name: 'Coral Air', title: 'Coral Air', titleFont: '600 {px}px "Segoe UI", Arial, sans-serif', titleColor: '#0f6e78',
    crown: '#ffffff', belly: '#e46a55', stripes: ['#0f6e78'], style: 'swoosh',
    tail: { bg: '#e46a55', art: 'wave', c1: '#ffffff', c2: '#0f6e78' },
    engine: '#ffffff', engineRing: '#e46a55', reg: 'N522CR', wingletColor: '#e46a55',
  },
  'atlas-cargo': {
    name: 'Atlas Cargo', title: 'ATLAS CARGO', titleFont: 'bold {px}px Arial, Helvetica, sans-serif', titleColor: '#3a3f45',
    crown: '#eceeee', belly: '#9aa1a8', stripes: ['#8d1c22'], style: 'straight', cargo: true,
    tail: { bg: '#8d1c22', art: 'globe', c1: '#ffffff', c2: '#d9a3a6' },
    engine: '#9aa1a8', engineRing: '#8d1c22', reg: 'N730AC', wingletColor: '#8d1c22',
  },
  'meridian-blue': {
    name: 'Meridian Blue', title: 'Meridian', titleFont: '300 {px}px "Helvetica Neue", Arial, sans-serif', titleColor: '#1e4fa0',
    crown: '#ffffff', belly: '#1e4fa0', stripes: ['#7fb3e6'], style: 'swoosh',
    tail: { bg: '#1e4fa0', art: 'meridian', c1: '#ffffff', c2: '#7fb3e6' },
    engine: '#1e4fa0', engineRing: '#7fb3e6', reg: 'N264MB', wingletColor: '#1e4fa0',
  },
};

/**
 * Paint the livery atlas. opts: { W, H, stretchFwd, stretchAft, detail }
 * Returns { map, roughnessMap, normalMap? }.
 */
export function paintLivery(liv, { W = 4096, H = 2048, stretchFwd = 0, stretchAft = 0, detail = 2, windows = true, normals = true } = {}) {
  const c = canvas(W, H), x = c.getContext('2d');
  const rc = canvas(W >> 1, H >> 1), r = rc.getContext('2d');
  const hc = normals ? canvas(W >> 1, H >> 1) : null, h = hc && hc.getContext('2d');
  const sh = fuselageShape(stretchFwd, stretchAft);
  const z0 = Z0 - stretchFwd, z1 = Z1 + stretchAft;
  const FH = FUS_V * H;
  const R = rng(liv.reg.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  const X = (z) => (z - z0) / (z1 - z0) * W;
  const Yphi = (phi) => phi / (Math.PI * 2) * FH;
  const pxPerM = W / (z1 - z0);
  const pxPerRad = FH / (Math.PI * 2);
  const winShift = (z) => (z < -6 ? z - stretchFwd : z > 8 ? z + stretchAft : z);

  // ---------------------------------------------------------------- base colours
  x.fillStyle = liv.crown; x.fillRect(0, 0, W, FH);
  r.fillStyle = 'rgb(255,85,0)'; r.fillRect(0, 0, W >> 1, H >> 1);   // gloss paint
  if (h) { h.fillStyle = 'rgb(128,128,128)'; h.fillRect(0, 0, W >> 1, H >> 1); }

  // boundary helper: fill between phi(z, yTop(z)) on each side and the keel
  const fillBelow = (yFn, color, sides = [1, -1]) => {
    x.fillStyle = color;
    for (const side of sides) {
      x.beginPath();
      const step = 2;
      const pts = [];
      for (let px = 0; px <= W; px += step) {
        const z = z0 + (px / W) * (z1 - z0);
        const s = sh.sec(Math.min(z1 - 0.01, Math.max(z0 + 0.01, z)));
        const y = yFn(z);
        let phi = phiAt(s, y, side);
        pts.push([px, Yphi(phi)]);
      }
      const keel = Yphi(Math.PI);
      x.moveTo(pts[0][0], keel);
      for (const [px, py] of pts) x.lineTo(px, py);
      x.lineTo(W, keel); x.closePath(); x.fill();
    }
  };
  const zn = AIRCRAFT.noseZ - stretchFwd, zt = AIRCRAFT.tailZ + stretchAft;
  const L = zt - zn;
  // cheatline / belly boundary heights (side view), z normalised along the fuselage
  let bellyY, stripeYs = [];
  if (liv.style === 'swoosh') {
    bellyY = (z) => { const t = (z - zn) / L; return -0.15 + 0.55 * smooth(0.0, 0.3, t) - 0.25 * smooth(0.3, 0.55, t) + 1.85 * Math.pow(smooth(0.55, 1.0, t), 1.4); };
    stripeYs = liv.stripes.map((_, k) => (z) => bellyY(z) + 0.11 + k * 0.13 + 0.25 * k * smooth(0.5, 1, (z - zn) / L));
  } else if (liv.style === 'band') {
    bellyY = () => -5;
    stripeYs = liv.stripes.map((_, k) => (z) => { const t = (z - zn) / L; return 0.25 + k * 0.28 + 1.1 * smooth(0.55, 1.0, t) * (1 + k * 0.4); });
  } else {
    bellyY = () => -0.25;
    stripeYs = liv.stripes.map((_, k) => () => -0.05 + k * 0.12);
  }
  const thick = liv.style === 'band' ? 0.26 : 0.1;
  for (let k = stripeYs.length - 1; k >= 0; k--) {
    fillBelow((z) => stripeYs[k](z) + thick, liv.stripes[k]);
    fillBelow((z) => stripeYs[k](z), liv.crown);
  }
  fillBelow(bellyY, liv.belly);
  // belly fairing region: slightly grey-ish (composite fairing panels painted belly colour – keep)

  // --------------------------------------------------------------- nose radome & cockpit windows
  {
    // radome: painted (often dull grey/black) – keep crown/belly but add the radome seam line
    const zr = AIRCRAFT.noseZ - stretchFwd + 1.25;
    seamCol(zr, 0, Math.PI * 2, 2.5, 0.35);
    // windshield panes as (z, phi-from-top) quads per side
    const panes = [
      [[-18.2, 0.15], [-17.76, 0.15], [-17.82, 0.6], [-18.27, 0.66]],
      [[-17.66, 0.66], [-17.12, 0.69], [-17.15, 0.96], [-17.7, 0.97]],
      [[-17.0, 0.74], [-16.6, 0.75], [-16.62, 0.95], [-17.03, 0.96]],
    ];
    for (const side of [1, -1]) {
      for (const pane of panes) {
        const pts = pane.map(([z, ph]) => [X(z - stretchFwd), Yphi(side > 0 ? ph : Math.PI * 2 - ph)]);
        // frame
        x.fillStyle = '#c9ccce';
        x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath();
        x.lineWidth = 5; x.strokeStyle = 'rgba(60,64,70,0.8)'; x.stroke();
        const g = x.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
        g.addColorStop(0, '#16191d'); g.addColorStop(0.5, '#262b31'); g.addColorStop(1, '#0d0f12');
        x.fillStyle = g; x.fill();
        r.fillStyle = 'rgb(255,18,0)';
        r.beginPath(); pts.forEach(([a, b], i) => (i ? r.lineTo(a / 2, b / 2) : r.moveTo(a / 2, b / 2))); r.closePath(); r.fill();
      }
    }
  }

  // --------------------------------------------------------------- passenger windows
  if (windows && !liv.cargo) {
    const wpx = WINDOW.paneWidth * pxPerM;
    const s = sh.sec(0);
    for (const w of WINDOWS) {
      if (w.inHatch) continue;
      const side = w.side === 'right' ? 1 : -1;
      const zc = winShift(w.z);
      const phi = phiAt(s, WINDOW.centerY, side);
      const cx = X(zc), cy = Yphi(phi);
      const hpx = WINDOW.paneHeight / 1.88 * pxPerRad;
      // frame ring (slightly darker paint ring)
      x.fillStyle = 'rgba(80,85,92,0.55)'; rrect(x, cx - wpx / 2 - 3, cy - hpx / 2 - 3, wpx + 6, hpx + 6, wpx * 0.45); x.fill();
      const g = x.createLinearGradient(cx, cy - hpx / 2, cx, cy + hpx / 2);
      g.addColorStop(0, '#20262d'); g.addColorStop(0.4, '#14181d'); g.addColorStop(1, '#0b0d10');
      x.fillStyle = g; rrect(x, cx - wpx / 2, cy - hpx / 2, wpx, hpx, wpx * 0.42); x.fill();
      r.fillStyle = 'rgb(255,14,0)'; rrect(r, (cx - wpx / 2) / 2, (cy - hpx / 2) / 2, wpx / 2, hpx / 2, wpx * 0.2); r.fill();
    }
    // over-wing exit hatches with their windows
    for (const id of ['OWL1', 'OWL2', 'OWR1', 'OWR2']) {
      const d = DOORS[id];
      const side = d.side === 'right' ? 1 : -1;
      const ph0 = phiAt(s, d.sillY + d.height, side), ph1 = phiAt(s, d.sillY, side);
      const a = X(d.z - d.width / 2), b = X(d.z + d.width / 2);
      outline(Math.min(a, b), Math.min(Yphi(ph0), Yphi(ph1)), Math.abs(b - a), Math.abs(Yphi(ph1) - Yphi(ph0)), 10);
      const phw = phiAt(s, WINDOW.centerY, side);
      const cx = X(d.z), cy = Yphi(phw), hpx = WINDOW.paneHeight / 1.88 * pxPerRad;
      x.fillStyle = '#12161b'; rrect(x, cx - wpx / 2, cy - hpx / 2, wpx, hpx, wpx * 0.42); x.fill();
      r.fillStyle = 'rgb(255,14,0)'; rrect(r, (cx - wpx / 2) / 2, (cy - hpx / 2) / 2, wpx / 2, hpx / 2, wpx * 0.2); r.fill();
    }
  }
  // --------------------------------------------------------------- doors
  {
    const s = sh.sec(0);
    for (const id of ['L1', 'R1', 'L2', 'R2']) {
      const d = DOORS[id];
      const side = d.side === 'right' ? 1 : -1;
      const zc = winShift(d.z);
      const ph0 = phiAt(s, 0.02 + d.height + 0.04, side), ph1 = phiAt(s, 0.02, side);
      const a = X(zc - d.width / 2 - 0.04), b = X(zc + d.width / 2 + 0.04);
      outline(a, Math.min(Yphi(ph0), Yphi(ph1)), b - a, Math.abs(Yphi(ph1) - Yphi(ph0)), 16);
      if (!liv.cargo) {
        // small door window
        const phw = phiAt(s, 1.45, side);
        const cx = X(zc), cy = Yphi(phw);
        x.fillStyle = '#12161b'; rrect(x, cx - 9, cy - 13, 18, 26, 8); x.fill();
      }
      // handle & arrow decal
      const phh = phiAt(s, 1.0, side);
      x.fillStyle = 'rgba(40,40,40,0.6)'; x.fillRect(X(zc) - 14, Yphi(phh) - 3, 28, 6);
    }
    // cargo doors (right side, lower lobe)
    for (const zc of [winShift(-9.4), winShift(7.1)]) {
      const ph0 = phiAt(sh.sec(zc), -0.18, 1), ph1 = phiAt(sh.sec(zc), -1.08, 1);
      const a = X(zc - 0.61), b = X(zc + 0.61);
      outline(a, Yphi(ph0), b - a, Yphi(ph1) - Yphi(ph0), 12);
    }
    if (liv.cargo) {
      // main deck cargo door (left, forward)
      const ph0 = phiAt(sh.sec(-11), 2.15, -1), ph1 = phiAt(sh.sec(-11), 0.1, -1);
      const a = X(winShift(-13.2)), b = X(winShift(-9.7));
      outline(a, Math.min(Yphi(ph0), Yphi(ph1)), b - a, Math.abs(Yphi(ph1) - Yphi(ph0)), 14);
    }
  }
  // --------------------------------------------------------------- titles & registration
  {
    const s = sh.sec(-6);
    const titleH = 0.62 * (liv.title.length > 9 ? 0.8 : 1);
    for (const side of [1, -1]) {
      const phi = phiAt(s, 1.86, side);
      const cz = winShift(-7.6);
      drawSide(side, X(cz), Yphi(phi), (g) => {
        const px = Math.round(titleH * pxPerRad / 1.88);
        g.font = liv.titleFont.replace('{px}', px);
        g.fillStyle = liv.titleColor; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(liv.title, 0, 0);
      });
      // registration on the aft fuselage
      const sr = sh.sec(winShift(15.6));
      const phr = phiAt(sr, 1.45, side);
      drawSide(side, X(winShift(15.6)), Yphi(phr), (g) => {
        g.font = `bold ${Math.round(0.24 * pxPerRad / 1.6)}px Arial, Helvetica, sans-serif`;
        g.fillStyle = luminance(liv.crown) > 0.5 ? '#2a2e33' : '#f0f0f0'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(liv.reg, 0, 0);
      });
      // small flag / stencils near the L1 door
      const ps = phiAt(s, 2.05, side);
      drawSide(side, X(winShift(-12.6)), Yphi(ps), (g) => {
        g.font = `${Math.round(0.07 * pxPerRad / 1.88)}px Arial`; g.fillStyle = '#555'; g.textAlign = 'center';
        g.fillText(liv.name.toUpperCase(), 0, 0);
      });
    }
  }
  // --------------------------------------------------------------- panel lines (skin laps)
  for (let zz = -15; zz < 18; zz += 0.508 * 4) seamCol(winShift(zz), 0.25, Math.PI * 2 - 0.25, 1, 0.07);
  for (const ph of [0.5, 1.15, 1.95, 2.6, 3.68, 4.33, 5.13, 5.78]) seamRow(ph, X(winShift(-15)), X(winShift(17)), 0.05);
  // main wheel wells: dark recess paint
  {
    for (const sx of [-1, 1]) {
      const ph = phiAt(sh.sec(MAIN_WELL.z), -1.2, sx);
      // approximate the ellipse in canvas: width in z, height in phi
      const cx = X(MAIN_WELL.z), cy = Yphi(ph);
      const rx = MAIN_WELL.r * pxPerM * 1.02, ry = MAIN_WELL.r / 1.7 * pxPerRad * 1.05;
      const g = x.createRadialGradient(cx, cy, 2, cx, cy, Math.max(rx, ry));
      g.addColorStop(0, '#1b1c1e'); g.addColorStop(0.75, '#26282b'); g.addColorStop(1, '#3a3d41');
      x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fill();
      r.fillStyle = 'rgb(255,190,0)'; r.beginPath(); r.ellipse(cx / 2, cy / 2, rx / 2, ry / 2, 0, 0, Math.PI * 2); r.fill();
    }
  }
  // nose wheel well (dark)
  {
    const a = X(NOSE_WELL.z0 - stretchFwd), b = X(NOSE_WELL.z1 - stretchFwd);
    const ph = 0.23;
    x.fillStyle = '#1e1f21'; x.fillRect(a, Yphi(Math.PI - ph), b - a, Yphi(Math.PI + ph) - Yphi(Math.PI - ph));
  }
  // --------------------------------------------------------------- weathering
  {
    x.globalAlpha = 0.07; x.globalCompositeOperation = 'multiply';
    x.drawImage(noiseCanvas(W, FH, 64, 3, { lo: 150, hi: 255, cellsY: 16 }), 0, 0);
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    // streaks below doors & behind drains, belly grime towards the tail
    for (let i = 0; i < 160; i++) {
      const zz = zn + 2 + R() * (L - 4), side = R() > 0.5 ? 1 : -1;
      const s = sh.sec(zz);
      const ph = phiAt(s, -0.2 - R() * 0.9, side);
      const len = (0.6 + R() * 2.5) * pxPerM;
      const gg = x.createLinearGradient(X(zz), 0, X(zz) + len, 0);
      gg.addColorStop(0, 'rgba(40,38,34,0.10)'); gg.addColorStop(1, 'rgba(40,38,34,0)');
      x.fillStyle = gg; x.fillRect(X(zz), Yphi(ph), len, 2 + R() * 4);
    }
    const gb = x.createLinearGradient(X(8), 0, X(zt), 0);
    gb.addColorStop(0, 'rgba(30,28,25,0)'); gb.addColorStop(1, 'rgba(30,28,25,0.22)');
    x.fillStyle = gb; x.fillRect(X(8), Yphi(Math.PI * 0.72), X(zt) - X(8), Yphi(Math.PI * 1.28) - Yphi(Math.PI * 0.72));
  }

  // =============================================================== FIN
  paintFin(x, r, liv, W, H, FH, stretchAft);
  // swatches (factory LOD aircraft sample these)
  {
    const cols = { engine: liv.engine, ring: liv.engineRing || liv.engine, grey: '#c4c7ca', dark: '#2c2e31', metal: '#b9bdc2', tyre: '#1b1c1e', white: '#f1f1ee', glass: '#15191e', belly: liv.belly, crown: liv.crown, light: '#ffffff' };
    for (const k of Object.keys(LSW)) {
      const [u, v] = LSW[k];
      const cx = u * W, cy = (1 - v) * H;
      x.fillStyle = cols[k]; x.fillRect(cx - 0.0075 * W, cy - 0.025 * H, 0.015 * W, 0.05 * H);
      r.fillStyle = k === 'metal' ? 'rgb(255,70,0)' : k === 'tyre' ? 'rgb(255,230,0)' : k === 'glass' ? 'rgb(255,20,0)' : 'rgb(255,110,0)';
      r.fillRect((cx - 0.0075 * W) / 2, (cy - 0.025 * H) / 2, 0.0075 * W, 0.025 * H);
    }
  }

  function seamCol(z, ph0, ph1, w = 1.5, a = 0.18) {
    x.fillStyle = `rgba(30,32,36,${a})`; x.fillRect(X(z) - w / 2, Yphi(ph0), w, Yphi(ph1) - Yphi(ph0));
    if (h) { h.fillStyle = 'rgb(90,90,90)'; h.fillRect(X(z) / 2 - 0.5, Yphi(ph0) / 2, 1, (Yphi(ph1) - Yphi(ph0)) / 2); }
  }
  function seamRow(ph, xa, xb, a = 0.05) {
    x.fillStyle = `rgba(30,32,36,${a})`; x.fillRect(xa, Yphi(ph) - 0.5, xb - xa, 1);
    if (h) { h.fillStyle = 'rgb(105,105,105)'; h.fillRect(xa / 2, Yphi(ph) / 2 - 0.5, (xb - xa) / 2, 1); }
  }
  function outline(ax, ay, aw, ah, rad) {
    x.strokeStyle = 'rgba(40,44,50,0.55)'; x.lineWidth = 2.2; rrect(x, ax, ay, aw, ah, rad); x.stroke();
    if (h) { h.strokeStyle = 'rgb(60,60,60)'; h.lineWidth = 1.5; rrect(h, ax / 2, ay / 2, aw / 2, ah / 2, rad / 2); h.stroke(); }
  }
  /** draw in "side view" orientation at canvas point (cx, cy) */
  function drawSide(side, cx, cy, fn) {
    x.save(); x.translate(cx, cy);
    if (side > 0) x.scale(-1, 1); else x.scale(1, -1);
    fn(x);
    x.restore();
  }

  const out = { map: tex(c, { aniso: 8 }), roughnessMap: tex(rc, { srgb: false }) };
  if (h) out.normalMap = tex(heightToNormal(hc, 2.0), { srgb: false });
  out.canvas = c;
  return out;
}

function paintFin(x, r, liv, W, H, FH, stretchAft) {
  const T = liv.tail;
  const top = FH, bandH = H - FH;
  const Hh = FIN.tipY - FIN.rootY;
  const zMin = FIN.dorsalZ - 0.2 + stretchAft, zMax = FIN.rootLE + Hh * FIN.sweep + FIN.tipChord + 0.2 + stretchAft;
  // fin side regions: right side (u 0..0.5, nose to the right), left side (u .5..1, nose to the left)
  for (const side of [1, -1]) {
    const ox = side > 0 ? 0 : W / 2;
    x.save();
    x.beginPath(); x.rect(ox, top, W / 2, bandH); x.clip();
    // local coordinate system: (a = metres from the fin LE root towards the TE, b = height above root)
    // canvas: right side flips so the nose is on the right
    const toC = (z, y) => {
      const hz = (z - zMin) / (zMax - zMin), hv = (y - FIN.rootY) / Hh;
      const u = side > 0 ? 1 - hz : hz;
      return [ox + u * W / 2, top + (1 - hv) * bandH];
    };
    // background
    x.fillStyle = T.bg; x.fillRect(ox, top, W / 2, bandH);
    r.fillStyle = 'rgb(255,80,0)'; r.fillRect(ox / 2, top / 2, W / 4, bandH / 2);
    // artwork in fin space: we draw in metres (z, y) through toC
    const P = (z, y) => toC(z + stretchAft, y);
    const poly = (pts, color) => { x.fillStyle = color; x.beginPath(); pts.forEach(([z, y], i) => { const [a, b] = P(z, y); if (i) x.lineTo(a, b); else x.moveTo(a, b); }); x.closePath(); x.fill(); };
    const circle = (z, y, rad, color) => {
      const [a, b] = P(z, y); const [a2] = P(z + rad, y); const [, b2] = P(z, y + rad);
      x.fillStyle = color; x.beginPath(); x.ellipse(a, b, Math.abs(a2 - a), Math.abs(b2 - b), 0, 0, Math.PI * 2); x.fill();
    };
    const ycen = 6.0;
    const zc = FIN.rootLE + (ycen - FIN.rootY) * FIN.sweep + 1.6;
    if (T.art === 'kingfisher') {
      // stylised diving kingfisher: head low & forward, body/tail rising aft along the fin sweep
      const H0 = [15.95, 3.55];
      const A = [0.5, 0.866], Pp = [0.866, -0.5];            // along (head->tail), across (aft-down)
      const L = (a, c) => [H0[0] + A[0] * a + Pp[0] * c, H0[1] + A[1] * a + Pp[1] * c];
      const shape = (pts, color) => poly(pts.map(([a, c]) => L(a, c)), color);
      const ell = (a0, c0, ra, rc, color, n = 28, from = 0, to = Math.PI * 2) => {
        const pts = [];
        for (let k = 0; k <= n; k++) { const t = from + (to - from) * k / n; pts.push([a0 + Math.cos(t) * ra, c0 + Math.sin(t) * rc]); }
        shape(pts, color);
      };
      // wings swept back (two layered feathers)
      shape([[1.0, 0.25], [2.2, 0.45], [3.7, 1.75], [3.2, 1.9], [1.9, 1.05], [0.95, 0.55]], T.c1);
      shape([[1.3, 0.3], [2.4, 0.5], [3.3, 1.25], [2.9, 1.3], [1.9, 0.85]], '#16506a');
      // body
      ell(1.35, 0.0, 1.45, 0.48, T.c1);
      // breast (gold), lower/forward side of the body
      ell(1.1, -0.12, 1.05, 0.34, T.c2, 28, Math.PI * 0.05, Math.PI * 1.05);
      // tail feathers
      shape([[2.6, -0.2], [3.9, -0.55], [4.0, -0.25], [2.75, 0.15]], T.c1);
      shape([[2.7, -0.05], [3.75, -0.12], [3.7, 0.1], [2.75, 0.18]], T.c2);
      // head
      ell(-0.05, 0.02, 0.5, 0.46, T.c1);
      // cheek patch and eye
      ell(0.05, -0.18, 0.2, 0.13, T.c2);
      ell(-0.12, 0.15, 0.085, 0.085, T.c3);
      // long beak pointing down-forward
      shape([[-0.42, 0.18], [-1.55, 0.04], [-0.42, -0.12]], T.c3);
      // gold rule along the fin root
      poly([[FIN.dorsalZ, 2.25], [FIN.rootLE + 1.4, 2.95], [FIN.rootLE + 9, 2.95], [FIN.rootLE + 9, 2.78], [FIN.rootLE + 1.5, 2.78], [FIN.dorsalZ + 0.6, 2.25]], T.c2);
    } else if (T.art === 'compass') {
      const pts = [];
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, rr = k % 2 ? 0.55 : 1.9; pts.push([zc + Math.sin(a) * rr, ycen + Math.cos(a) * rr * 1.1]); }
      poly(pts, T.c1);
      circle(zc, ycen, 0.35, T.c2);
    } else if (T.art === 'sun') {
      circle(zc, ycen, 1.7, T.c1);
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; poly([[zc + Math.sin(a) * 1.9, ycen + Math.cos(a) * 1.9], [zc + Math.sin(a + 0.1) * 2.6, ycen + Math.cos(a + 0.1) * 2.6], [zc + Math.sin(a + 0.22) * 1.9, ycen + Math.cos(a + 0.22) * 1.9]], T.c2); }
    } else if (T.art === 'wave') {
      for (let k = 0; k < 3; k++) {
        const pts = [];
        for (let i = 0; i <= 20; i++) { const zz = FIN.dorsalZ + i * 0.6; pts.push([zz, 3.2 + k * 1.4 + 0.45 * Math.sin(i * 0.7 + k)]); }
        for (let i = 20; i >= 0; i--) { const zz = FIN.dorsalZ + i * 0.6; pts.push([zz, 3.2 + k * 1.4 + 0.45 * Math.sin(i * 0.7 + k) + 0.45]); }
        poly(pts, k === 1 ? T.c2 : T.c1);
      }
    } else if (T.art === 'globe') {
      x.strokeStyle = T.c1; x.lineWidth = 6;
      const [a, b] = P(zc, ycen); const [a2] = P(zc + 1.9, ycen); const [, b2] = P(zc, ycen + 1.9);
      const rx = Math.abs(a2 - a), ry = Math.abs(b2 - b);
      x.beginPath(); x.ellipse(a, b, rx, ry, 0, 0, Math.PI * 2); x.stroke();
      for (const f of [0.35, 0.7]) { x.beginPath(); x.ellipse(a, b, rx * f, ry, 0, 0, Math.PI * 2); x.stroke(); }
      for (const f of [-0.5, 0, 0.5]) { x.beginPath(); x.moveTo(a - rx * Math.sqrt(1 - f * f), b + f * ry); x.lineTo(a + rx * Math.sqrt(1 - f * f), b + f * ry); x.stroke(); }
    } else if (T.art === 'meridian') {
      x.strokeStyle = T.c1; x.lineWidth = 9;
      for (let k = 0; k < 4; k++) {
        const [a, b] = P(zc + 3.5, 1.5); const [a2] = P(zc + 3.5 - 2 - k * 0.9, 1.5);
        x.beginPath(); x.ellipse(a, b, Math.abs(a2 - a), (5.4 + k * 0.6) / Hh * bandH, 0, Math.PI, Math.PI * 1.5); x.stroke();
      }
    }
    // fin edge & rudder hinge line
    const zh = (y) => { const st = finStation(y, 0); return st.le + 0.7 * st.chord; };
    x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 2;
    x.beginPath(); for (let y = FIN.rootY + 0.2; y <= FIN.tipY; y += 0.25) { const [a, b] = P(zh(y), y); if (y === FIN.rootY + 0.2) x.moveTo(a, b); else x.lineTo(a, b); } x.stroke();
    x.restore();
  }
}

function smooth(a, b, v) { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
function luminance(hex) { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
