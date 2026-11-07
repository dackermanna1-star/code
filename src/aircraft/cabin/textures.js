// Procedural canvas textures for airline-specific artwork: sidewall panel seams,
// dado louvres, PSU faces, passenger signs, EXIT signs, placards, pane scratches,
// floor AO (soft contact shadows under the seat rows).
import * as THREE from 'three';
import { ROWS, SEAT, SEAT_LIST, ZONES, AIRLINE } from '../../core/constants.js';
import { rng } from '../../core/util.js';

export const FONT = "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif";
export const FONT_COND = "'Arial Narrow', 'Helvetica Neue', Helvetica, Arial, 'Liberation Sans Narrow', 'Liberation Sans', sans-serif";

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { srgb = true, repeat = null, wrap = THREE.ClampToEdgeWrapping, aniso = 8, mip = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = wrap;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.generateMipmaps = mip;
  if (!mip) t.minFilter = THREE.LinearFilter;
  return t;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function speckle(ctx, w, h, n, r, color, alpha, seed) {
  const R = rng(seed);
  ctx.save(); ctx.fillStyle = color;
  for (let i = 0; i < n; i++) { ctx.globalAlpha = alpha * R(); ctx.beginPath(); ctx.arc(R() * w, R() * h, r * (0.3 + R()), 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
function scuff(ctx, x, y, len, ang, width, alpha, color = '#3a3a3a') {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); ctx.stroke(); ctx.restore();
}

// ---------------------------------------------------------------- sidewall (2 panels wide)
function sidewallTex(maxAniso) {
  const W = 1024, H = 1024, c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  // broad, soft mottling
  const R = rng(5);
  for (let i = 0; i < 40; i++) {
    const g = x.createRadialGradient(R() * W, R() * H, 0, R() * W, R() * H, 80 + R() * 200);
    g.addColorStop(0, `rgba(${200 + R() * 20},${198 + R() * 20},${195 + R() * 20},0.05)`); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  // panel seams (one every two window bays): u = 0 and u = 1 (wrap) -> seam at the left edge
  for (const sx of [0, W]) {
    x.fillStyle = 'rgba(70,72,76,0.55)'; x.fillRect(sx - 2, 0, 4, H);
    x.fillStyle = 'rgba(40,42,45,0.25)'; x.fillRect(sx - 6, 0, 12, H);
    x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillRect(sx + 2, 0, 2, H);
  }
  // fastener caps along the seam
  for (let i = 0; i < 4; i++) {
    const yy = 90 + i * 280;
    for (const sx of [10, W - 10]) {
      x.fillStyle = 'rgba(120,122,126,0.45)'; x.beginPath(); x.arc(sx, yy, 5, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.5)'; x.beginPath(); x.arc(sx - 1, yy - 1, 2.5, 0, Math.PI * 2); x.fill();
    }
  }
  // elbow / shoulder smudges near the window sill (v ~ 0.45-0.55 measured from the bottom)
  for (let i = 0; i < 26; i++) {
    const cx = R() * W, cy = H * (0.38 + R() * 0.22);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, 20 + R() * 45);
    g.addColorStop(0, `rgba(150,140,128,${0.04 + R() * 0.05})`); g.addColorStop(1, 'rgba(150,140,128,0)');
    x.fillStyle = g; x.fillRect(cx - 80, cy - 80, 160, 160);
  }
  // scuffs on the lower panel (feet, bags)
  for (let i = 0; i < 22; i++) scuff(x, R() * W, H * (0.86 + R() * 0.12), 8 + R() * 40, -0.3 + R() * 0.6, 1 + R() * 2.5, 0.05 + R() * 0.12, '#5a5650');
  speckle(x, W, H, 600, 1.2, '#8c8a86', 0.12, 9);
  const t = tex(c, { wrap: THREE.RepeatWrapping, aniso: maxAniso });
  return t;
}

// ---------------------------------------------------------------- ceiling (panel seams along z)
function ceilingTex(maxAniso) {
  const W = 512, H = 1024, c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  const R = rng(17);
  for (let i = 0; i < 25; i++) {
    const g = x.createRadialGradient(R() * W, R() * H, 0, R() * W, R() * H, 60 + R() * 160);
    g.addColorStop(0, 'rgba(205,205,205,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  // seam at v = 0 (texture repeats once per ceiling panel)
  x.fillStyle = 'rgba(60,62,66,0.6)'; x.fillRect(0, 0, W, 3); x.fillRect(0, H - 2, W, 2);
  x.fillStyle = 'rgba(40,40,40,0.18)'; x.fillRect(0, 3, W, 5);
  speckle(x, W, H, 300, 1, '#999', 0.08, 3);
  return tex(c, { wrap: THREE.RepeatWrapping, aniso: maxAniso });
}

// ---------------------------------------------------------------- dado: louvred air-return grille
function dadoTex(maxAniso) {
  const W = 1024, H = 256, c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  // v = 0 at the floor, 1 at the dado top (canvas y flipped: top of canvas = top of dado)
  // grille area: y from 0.25 to 0.62 of the height above the floor
  const gy0 = H * (1 - 0.66), gy1 = H * (1 - 0.22);
  x.fillStyle = '#c9cbce'; roundRect(x, 30, gy0 - 6, W - 60, gy1 - gy0 + 12, 8); x.fill();
  for (let i = 0; i < 64; i++) {
    const sx = 44 + i * ((W - 88) / 64);
    x.fillStyle = '#1c1e21'; x.fillRect(sx, gy0, 8, gy1 - gy0);
    x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillRect(sx + 8, gy0, 2, gy1 - gy0);
  }
  // panel seam
  x.fillStyle = 'rgba(40,40,40,0.6)'; x.fillRect(0, 0, 3, H); x.fillRect(W - 2, 0, 2, H);
  // kick scuffs near the floor
  const R = rng(31);
  for (let i = 0; i < 40; i++) scuff(x, R() * W, H * (0.8 + R() * 0.18), 6 + R() * 30, -0.4 + R() * 0.8, 1 + R() * 3, 0.08 + R() * 0.2, '#2a2a2a');
  speckle(x, W, H, 400, 1.3, '#555', 0.15, 32);
  return tex(c, { wrap: THREE.RepeatWrapping, aniso: maxAniso });
}

// ---------------------------------------------------------------- PSU faces (economy / business)
// PSU local layout (metres): a along z (-0.23..0.23), b across (-0.15 inboard .. 0.15 outboard)
export const PSU_LAYOUT = {
  len: 0.46, wid: 0.30,
  economy: { lights: [-0.175, -0.115, -0.055], gaspers: [0.03, 0.09, 0.15] },
  business: { lights: [-0.165, -0.085], gaspers: [0.05, 0.13] },
  lensB: -0.098, buttonB: -0.045, gasperB: -0.075,
  callA: 0.205, callB: -0.105, callLightA: 0.205, callLightB: -0.045,
  sign: { a0: -0.205, a1: -0.045, b0: 0.035, b1: 0.115 },
  oxy: { a0: -0.02, a1: 0.212, b0: 0.012, b1: 0.138 },
  speaker: { a: -0.005, b: -0.075, r: 0.022 },
};
function psuTex(maxAniso) {
  // two regions: economy (top half), business (bottom half); each 1024 x 668 (a -> x, b -> y)
  const W = 1024, RH = 668, c = canvas(W, RH * 2), x = c.getContext('2d');
  const L = PSU_LAYOUT;
  const draw = (oy, cfg) => {
    const sx = W / L.len, sy = RH / L.wid;
    const P = (a, b) => [(a + L.len / 2) * sx, oy + (b + L.wid / 2) * sy];
    x.fillStyle = '#e4e5e7'; x.fillRect(0, oy, W, RH);
    // subtle gradient & edge bevel
    const g = x.createLinearGradient(0, oy, 0, oy + RH); g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0.05)');
    x.fillStyle = g; x.fillRect(0, oy, W, RH);
    x.strokeStyle = 'rgba(60,60,60,0.55)'; x.lineWidth = 6; x.strokeRect(3, oy + 3, W - 6, RH - 6);
    // inboard control strip (slightly darker grey inset)
    const [ix0, iy0] = P(-0.215, -0.14), [ix1, iy1] = P(0.222, -0.01);
    x.fillStyle = '#d3d5d8'; roundRect(x, ix0, iy0, ix1 - ix0, iy1 - iy0, 14); x.fill();
    x.strokeStyle = 'rgba(70,72,76,0.5)'; x.lineWidth = 2.5; x.stroke();
    // lens bezels + buttons
    cfg.lights.forEach((a, i) => {
      const [lx, ly] = P(a, L.lensB);
      x.fillStyle = '#9fa3a8'; x.beginPath(); x.arc(lx, ly, 0.034 * sx, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#6a6e73'; x.beginPath(); x.arc(lx, ly, 0.029 * sx, 0, Math.PI * 2); x.fill();
      const [bx, by] = P(a, L.buttonB);
      x.fillStyle = '#b9bcc0'; roundRect(x, bx - 0.014 * sx, by - 0.014 * sy, 0.028 * sx, 0.028 * sy, 6); x.fill();
      x.strokeStyle = 'rgba(40,40,40,0.6)'; x.lineWidth = 2; x.stroke();
      // reading-light icon (bulb rays) next to the button
      x.strokeStyle = '#3b3e42'; x.lineWidth = 3;
      const ix = bx + 0.024 * sx, iy = by;
      x.beginPath(); x.arc(ix, iy, 7, 0, Math.PI * 2); x.stroke();
      for (let k = 0; k < 6; k++) { const an = k * Math.PI / 3; x.beginPath(); x.moveTo(ix + Math.cos(an) * 10, iy + Math.sin(an) * 10); x.lineTo(ix + Math.cos(an) * 15, iy + Math.sin(an) * 15); x.stroke(); }
    });
    // gasper bezels
    cfg.gaspers.forEach((a) => {
      const [gx, gy] = P(a, L.gasperB);
      x.fillStyle = '#8c9095'; x.beginPath(); x.arc(gx, gy, 0.031 * sx, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#5a5e63'; x.beginPath(); x.arc(gx, gy, 0.026 * sx, 0, Math.PI * 2); x.fill();
    });
    // speaker perforations
    const [spx, spy] = P(L.speaker.a, L.speaker.b);
    x.fillStyle = '#c5c8cc'; x.beginPath(); x.arc(spx, spy, L.speaker.r * sx, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#2b2d30';
    for (let r = 4; r < L.speaker.r * sx - 4; r += 9) {
      const n = Math.max(1, Math.round((2 * Math.PI * r) / 10));
      for (let k = 0; k < n; k++) { const an = (k / n) * Math.PI * 2; x.beginPath(); x.arc(spx + Math.cos(an) * r, spy + Math.sin(an) * r, 2.2, 0, Math.PI * 2); x.fill(); }
    }
    // call button bezel + attendant icon
    const [cx, cy] = P(L.callA, L.callB);
    x.fillStyle = '#9da1a6'; x.beginPath(); x.arc(cx, cy, 0.022 * sx, 0, Math.PI * 2); x.fill();
    const [clx, cly] = P(L.callLightA, L.callLightB);
    x.fillStyle = '#8a8d91'; x.beginPath(); x.arc(clx, cly, 0.016 * sx, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#3b3e42'; x.font = `bold 18px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    // stylised attendant figure
    const fx = cx - 0.036 * sx, fy = cy;
    x.beginPath(); x.arc(fx, fy - 9, 5, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(fx - 8, fy + 12); x.lineTo(fx, fy - 3); x.lineTo(fx + 8, fy + 12); x.closePath(); x.fill();
    // sign window frame
    const [s0x, s0y] = P(L.sign.a0, L.sign.b0), [s1x, s1y] = P(L.sign.a1, L.sign.b1);
    x.fillStyle = '#2a2c2f'; roundRect(x, s0x - 6, s0y - 6, s1x - s0x + 12, s1y - s0y + 12, 10); x.fill();
    // oxygen door: seam + latch slot + placard
    const [o0x, o0y] = P(L.oxy.a0, L.oxy.b0), [o1x, o1y] = P(L.oxy.a1, L.oxy.b1);
    x.strokeStyle = 'rgba(45,47,50,0.75)'; x.lineWidth = 3; roundRect(x, o0x, o0y, o1x - o0x, o1y - o0y, 10); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 1.5; roundRect(x, o0x + 3, o0y + 3, o1x - o0x - 6, o1y - o0y - 6, 8); x.stroke();
    x.fillStyle = '#4a4d51'; roundRect(x, (o0x + o1x) / 2 - 30, o0y + 10, 60, 9, 4); x.fill();
    x.fillStyle = '#55585c'; x.font = `600 15px ${FONT}`;
    x.fillText('OXYGEN', (o0x + o1x) / 2, (o0y + o1y) / 2 + 4);
    x.font = `12px ${FONT}`; x.fillText('MASKS DROP AUTOMATICALLY', (o0x + o1x) / 2, (o0y + o1y) / 2 + 26);
    // screws
    for (const [a, b] of [[-0.218, -0.138], [0.218, -0.138], [-0.218, 0.138], [0.218, 0.138]]) {
      const [qx, qy] = P(a, b);
      x.fillStyle = '#8f9297'; x.beginPath(); x.arc(qx, qy, 6, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#4b4e52'; x.lineWidth = 2; x.beginPath(); x.moveTo(qx - 4, qy); x.lineTo(qx + 4, qy); x.stroke();
    }
    speckle(x, W, RH, 200, 1, '#777', 0.1, oy + 3);
    x.save(); x.translate(0, oy); speckle(x, W, RH, 120, 1.5, '#555', 0.08, 41); x.restore();
  };
  draw(0, L.economy);
  draw(RH, L.business);
  return tex(c, { aniso: maxAniso });
}

// ---------------------------------------------------------------- passenger signs
function signTex(kind) {
  const W = 256, H = 256, c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#000000'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#ffffff'; x.fillStyle = '#ffffff'; x.lineCap = 'round'; x.lineJoin = 'round';
  const cx = W / 2, cy = H / 2;
  if (kind === 'belt') {
    // seated passenger with fastened belt (Boeing pictogram)
    x.lineWidth = 14;
    x.beginPath(); x.arc(cx - 6, cy - 62, 17, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(cx - 14, cy - 36); x.lineTo(cx - 20, cy + 18); x.lineTo(cx + 34, cy + 18); x.lineTo(cx + 40, cy + 74); x.stroke();
    x.beginPath(); x.moveTo(cx - 14, cy - 28); x.lineTo(cx + 22, cy - 6); x.stroke();
    x.lineWidth = 10; x.beginPath(); x.moveTo(cx - 52, cy + 4); x.quadraticCurveTo(cx - 10, cy + 40, cx + 52, cy + 2); x.stroke();
    x.fillRect(cx - 8, cy + 10, 22, 14);
    x.lineWidth = 8; x.beginPath(); x.moveTo(cx - 48, cy - 70); x.lineTo(cx - 48, cy + 80); x.stroke();
  } else {
    // no smoking / no e-cigarettes: cigarette in a crossed circle
    x.lineWidth = 12; x.beginPath(); x.arc(cx, cy, 92, 0, Math.PI * 2); x.stroke();
    x.fillRect(cx - 62, cy + 6, 96, 22); x.fillRect(cx + 40, cy + 6, 18, 22);
    x.lineWidth = 6; x.beginPath(); x.moveTo(cx + 52, cy - 4); x.bezierCurveTo(cx + 40, cy - 26, cx + 64, cy - 34, cx + 50, cy - 56); x.stroke();
    x.lineWidth = 14; x.beginPath(); x.moveTo(cx - 65, cy - 65); x.lineTo(cx + 65, cy + 65); x.stroke();
  }
  return tex(c, { aniso: 4 });
}

// ---------------------------------------------------------------- EXIT sign (front + arrows variants)
function exitTex() {
  // 3 rows: 'EXIT' plain, '< EXIT', 'EXIT >' and '< EXIT >'
  const W = 512, H = 512, c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#101010'; x.fillRect(0, 0, W, H);
  const rows = [['', ''], ['◀', ''], ['', '▶'], ['◀', '▶']];
  rows.forEach(([l, r], i) => {
    const y0 = i * 128;
    x.fillStyle = '#f2efe8'; x.fillRect(4, y0 + 6, W - 8, 116);
    x.fillStyle = '#d0141c'; x.font = `bold 84px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('EXIT', W / 2, y0 + 68);
    x.font = `bold 56px ${FONT}`;
    if (l) x.fillText(l, 52, y0 + 66);
    if (r) x.fillText(r, W - 52, y0 + 66);
  });
  return tex(c, { aniso: 8 });
}

// ---------------------------------------------------------------- window shade + pane scratches
function shadeTex() {
  const W = 256, H = 512, c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  // fine horizontal grain + soft vertical gradient; finger grip at the bottom (v = 0 bottom)
  const R = rng(51);
  for (let i = 0; i < H; i += 2) { x.fillStyle = `rgba(0,0,0,${0.012 + R() * 0.02})`; x.fillRect(0, i, W, 1); }
  const g = x.createLinearGradient(0, H - 70, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
  x.fillStyle = g; x.fillRect(0, H - 70, W, 70);
  // fingerprints near the grip
  for (let i = 0; i < 6; i++) {
    const cx = W * (0.3 + R() * 0.4), cy = H - 40 - R() * 50;
    const gg = x.createRadialGradient(cx, cy, 0, cx, cy, 14 + R() * 10);
    gg.addColorStop(0, 'rgba(120,110,100,0.10)'); gg.addColorStop(1, 'rgba(120,110,100,0)');
    x.fillStyle = gg; x.fillRect(cx - 30, cy - 30, 60, 60);
  }
  return tex(c, { aniso: 4 });
}
function paneScratchTex() {
  // r: scratches / crazing, g: breather hole
  const W = 512, H = 512, c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#000000'; x.fillRect(0, 0, W, H);
  const R = rng(61);
  x.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const cx = R() * W, cy = R() * H, len = 10 + R() * 120, a = (R() - 0.5) * 0.6 + (R() < 0.5 ? 0 : Math.PI / 2);
    x.strokeStyle = `rgba(255,0,0,${0.08 + R() * 0.25})`; x.lineWidth = 0.6 + R() * 1.2;
    x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(cx + Math.cos(a) * len * 0.5 + (R() - 0.5) * 10, cy + Math.sin(a) * len * 0.5, cx + Math.cos(a) * len, cy + Math.sin(a) * len); x.stroke();
  }
  // wipe arcs (cleaning marks)
  for (let i = 0; i < 8; i++) {
    x.strokeStyle = `rgba(255,0,0,${0.03 + R() * 0.04})`; x.lineWidth = 8 + R() * 14;
    x.beginPath(); x.arc(R() * W, R() * H, 80 + R() * 160, R() * 6, R() * 6 + 1.2); x.stroke();
  }
  // breather hole: lower centre of the inner pane (uv y=0 bottom => canvas bottom)
  x.fillStyle = 'rgba(0,255,0,1)'; x.beginPath(); x.arc(W * 0.5, H * 0.86, 5, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(255,255,0,0.6)'; x.lineWidth = 2; x.beginPath(); x.arc(W * 0.5, H * 0.86, 8, 0, Math.PI * 2); x.stroke();
  return tex(c, { srgb: false, aniso: 4 });
}

// ---------------------------------------------------------------- bulkhead laminate + logo panel
function bulkheadTex(maxAniso) {
  const W = 1024, H = 1024, c = canvas(W, H), x = c.getContext('2d');
  // fine woven laminate (light warm grey)
  x.fillStyle = '#e3e0da'; x.fillRect(0, 0, W, H);
  const R = rng(71);
  for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '120,115,108'},${0.03 + R() * 0.05})`; x.fillRect(R() * W, R() * H, 2 + R() * 6, 1); }
  for (let i = 0; i < 25; i++) {
    const g = x.createRadialGradient(R() * W, R() * H, 0, R() * W, R() * H, 100 + R() * 200);
    g.addColorStop(0, 'rgba(180,175,168,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  // kick strip at the bottom (v 0..0.12) darker grey
  x.fillStyle = '#7d8086'; x.fillRect(0, H * 0.9, W, H * 0.1);
  x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, H * 0.9, W, 3);
  for (let i = 0; i < 30; i++) scuff(x, R() * W, H * (0.91 + R() * 0.08), 6 + R() * 30, -0.4 + R() * 0.8, 1 + R() * 3, 0.1 + R() * 0.2, '#2c2c2c');
  return tex(c, { wrap: THREE.RepeatWrapping, aniso: maxAniso });
}

// ---------------------------------------------------------------- placard atlas
/**
 * 2048 x 2048 atlas. Cells of 256x64 for the 64 bin row labels (rows 0..7 of the
 * atlas), then larger misc placards. Returns { texture, rect(name) -> [u0,v0,u1,v1] }.
 */
function placardAtlas(maxAniso) {
  const W = 2048, H = 2048, c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#e9e8e4'; x.fillRect(0, 0, W, H);
  const rects = {};
  const put = (name, px, py, pw, ph) => { rects[name] = [px / W, 1 - (py + ph) / H, (px + pw) / W, 1 - py / H]; };
  // --- bin row labels: dark grey strip with white row number + seat letters
  let k = 0;
  const label = (row, letters, side) => {
    const cx = (k % 8) * 256, cy = Math.floor(k / 8) * 64;
    k++;
    x.fillStyle = '#ebeae6'; x.fillRect(cx, cy, 256, 64);
    x.fillStyle = '#5b5f66'; roundRect(x, cx + 6, cy + 8, 244, 48, 10); x.fill();
    x.fillStyle = '#ffffff'; x.font = `bold 36px ${FONT}`; x.textBaseline = 'middle'; x.textAlign = 'left';
    x.fillText(String(row), cx + 22, cy + 33);
    // seat icons + letters
    const lx0 = cx + 96;
    letters.forEach((L, i) => {
      const lx = lx0 + i * 50;
      x.fillStyle = 'rgba(255,255,255,0.85)';
      roundRect(x, lx, cy + 16, 14, 26, 4); x.fill();
      x.fillStyle = '#ffffff'; x.font = `bold 26px ${FONT}`; x.fillText(L, lx + 19, cy + 33);
    });
    put(`row-${row}-${side}`, cx, cy, 256, 64);
  };
  for (const r of ROWS) {
    label(r.row, r.letters.filter((L) => r.x[L] < 0), 'L');
    label(r.row, r.letters.filter((L) => r.x[L] > 0), 'R');
  }
  // --- misc placards in the lower part
  const box = (name, px, py, pw, ph, fn) => { x.save(); x.translate(px, py); fn(pw, ph); x.restore(); put(name, px, py, pw, ph); };
  const Y0 = 512;
  // EXIT (red on white) small locator placard
  box('exit-red', 0, Y0, 512, 160, (w, h) => {
    x.fillStyle = '#f4f2ec'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#c8101a'; x.font = `bold 120px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('EXIT', w / 2, h / 2 + 6);
  });
  // hatch: emergency exit operating instructions (pictogram strip)
  box('hatch-instr', 512, Y0, 512, 700, (w, h) => {
    x.fillStyle = '#f3f1ea'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#c8101a'; x.lineWidth = 10; x.strokeRect(5, 5, w - 10, h - 10);
    x.fillStyle = '#c8101a'; x.font = `bold 64px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'top';
    x.fillText('EMERGENCY', w / 2, 24); x.fillText('EXIT', w / 2, 92);
    x.fillStyle = '#222'; x.font = `bold 34px ${FONT}`;
    const steps = ['1  PULL HANDLE DOWN', '2  LIFT HATCH IN', '3  THROW HATCH OUT', '4  STEP ONTO WING'];
    steps.forEach((s, i) => {
      const yy = 190 + i * 120;
      x.fillStyle = '#e1ded6'; x.fillRect(24, yy, w - 48, 100);
      x.fillStyle = '#222'; x.textAlign = 'left'; x.fillText(s, 40, yy + 30);
      // tiny pictogram: arrow
      x.strokeStyle = '#c8101a'; x.lineWidth = 8; x.beginPath();
      const ax = w - 90, ay = yy + 50; x.moveTo(ax - 30, ay); x.lineTo(ax + 30, ay); x.moveTo(ax + 14, ay - 16); x.lineTo(ax + 30, ay); x.lineTo(ax + 14, ay + 16); x.stroke();
    });
  });
  // handle cover placard 'PULL'
  box('pull', 1024, Y0, 256, 128, (w, h) => {
    x.fillStyle = '#c8101a'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffffff'; x.font = `bold 70px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('PULL', w / 2, h / 2 + 4);
  });
  // 'EXIT' + arrow down (bin face above exit rows)
  box('exit-bin', 1280, Y0, 512, 160, (w, h) => {
    x.fillStyle = '#f4f2ec'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#c8101a'; x.font = `bold 96px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('EXIT', w / 2 - 50, h / 2 + 6);
    x.beginPath(); x.moveTo(w - 150, 40); x.lineTo(w - 70, 40); x.lineTo(w - 110, 120); x.closePath(); x.fill();
  });
  // forward attendant panel (FAP)
  box('fap', 0, Y0 + 720, 768, 512, (w, h) => {
    x.fillStyle = '#3b3f45'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#4a4f56'; x.fillRect(12, 12, w - 24, h - 24);
    x.fillStyle = '#e8e6df'; x.font = `bold 26px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('FORWARD ATTENDANT PANEL', w / 2, 40);
    const labels = ['ENTRY', 'CABIN', 'WORK', 'NIGHT', 'BOARD', 'BRIGHT', 'DIM', 'OFF'];
    labels.forEach((l, i) => {
      const bx = 40 + (i % 4) * 175, by = 90 + Math.floor(i / 4) * 120;
      x.fillStyle = '#2a2d31'; roundRect(x, bx, by, 150, 90, 10); x.fill();
      x.fillStyle = i === 4 ? '#7fd38a' : '#9aa0a8'; x.fillRect(bx + 60, by + 12, 30, 8);
      x.fillStyle = '#e8e6df'; x.font = `bold 24px ${FONT}`; x.fillText(l, bx + 75, by + 58);
    });
    x.fillStyle = '#1d1f22'; x.fillRect(40, 340, w - 80, 120);
    x.fillStyle = '#62c3ff'; x.font = `22px ${FONT}`; x.textAlign = 'left';
    x.fillText('CABIN TEMP  FWD 23°C   AFT 24°C', 60, 380); x.fillText('DOORS  L1 OPEN  R1 CLSD  L2 CLSD  R2 CLSD', 60, 420);
  });
  // airline logo panel for the front bulkhead
  box('logo', 768, Y0 + 720, 1024, 512, (w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, AIRLINE.colors.primary); g.addColorStop(1, '#071a2e');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // kingfisher-like swoosh
    x.strokeStyle = AIRLINE.colors.accent; x.lineWidth = 14; x.lineCap = 'round';
    x.beginPath(); x.moveTo(w * 0.18, h * 0.62); x.quadraticCurveTo(w * 0.35, h * 0.2, w * 0.62, h * 0.38); x.stroke();
    x.strokeStyle = AIRLINE.colors.secondary; x.lineWidth = 10;
    x.beginPath(); x.moveTo(w * 0.22, h * 0.7); x.quadraticCurveTo(w * 0.42, h * 0.38, w * 0.72, h * 0.5); x.stroke();
    x.fillStyle = AIRLINE.colors.light; x.font = `300 92px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('HALCYON', w / 2, h * 0.76);
    x.font = `400 34px ${FONT}`; x.fillText('A I R W A Y S', w / 2, h * 0.9);
  });
  // emergency equipment / misc small labels
  box('lifevest', 0, Y0 + 1240, 512, 128, (w, h) => {
    x.fillStyle = '#f2f0ea'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#222'; x.font = `bold 30px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('LIFE VEST UNDER YOUR SEAT', w / 2, h / 2);
  });
  box('handset', 512, Y0 + 1240, 512, 128, (w, h) => {
    x.fillStyle = '#2d3035'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e8e6df'; x.font = `bold 28px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('ATTENDANT HANDSET', w / 2, h / 2 - 16); x.font = `20px ${FONT}`; x.fillText('PA  ·  INTERPHONE  ·  CAPT', w / 2, h / 2 + 22);
  });
  box('nosmoking-lav', 1024, Y0 + 1240, 512, 128, (w, h) => {
    x.fillStyle = '#f2f0ea'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#222'; x.font = `bold 24px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('FIRE EXTINGUISHER', w / 2, h / 2 - 16); x.fillStyle = '#c8101a'; x.fillText('IN OVERHEAD BIN ABOVE', w / 2, h / 2 + 18);
  });
  box('smoke-det', 1536, Y0 + 1240, 256, 128, (w, h) => {
    x.fillStyle = '#f2f0ea'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#333'; x.font = `bold 22px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('SMOKE', w / 2, h / 2 - 12); x.fillText('DETECTOR', w / 2, h / 2 + 14);
  });
  box('white', 1800, Y0 + 1240, 64, 64, (w, h) => { x.fillStyle = '#f2f1ec'; x.fillRect(0, 0, w, h); });
  box('red', 1880, Y0 + 1240, 64, 64, (w, h) => { x.fillStyle = '#c8101a'; x.fillRect(0, 0, w, h); });
  box('dark', 1960, Y0 + 1240, 64, 64, (w, h) => { x.fillStyle = '#2b2e33'; x.fillRect(0, 0, w, h); });
  const t = tex(c, { aniso: maxAniso });
  return { texture: t, rect: (n) => rects[n] || rects.white };
}

// ---------------------------------------------------------------- floor AO (soft shadows under seats)
function floorAO() {
  const x0 = -1.75, x1 = 1.75, z0 = -16.1, z1 = 14.15;
  const W = 128, H = 1024, c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  const px = (X) => ((X - x0) / (x1 - x0)) * W, pz = (Z) => ((Z - z0) / (z1 - z0)) * H;
  x.filter = 'blur(3px)';
  for (const s of SEAT_LIST) {
    const d = s.cls === 'business' ? SEAT.business : SEAT.economy;
    const w = d.width * 0.98;
    x.fillStyle = 'rgba(0,0,0,0.42)';
    x.fillRect(px(s.x - w / 2), pz(s.z - 0.24), px(s.x + w / 2) - px(s.x - w / 2), pz(s.z + 0.34) - pz(s.z - 0.24));
  }
  x.filter = 'blur(2px)';
  // wall/floor junction & bulkheads
  const g1 = x.createLinearGradient(0, 0, px(-1.35), 0); g1.addColorStop(0, 'rgba(0,0,0,0.5)'); g1.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g1; x.fillRect(0, 0, px(-1.35), H);
  const g2 = x.createLinearGradient(W, 0, px(1.35), 0); g2.addColorStop(0, 'rgba(0,0,0,0.5)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g2; x.fillRect(px(1.35), 0, W - px(1.35), H);
  for (const Z of [ZONES.businessFrontBulkheadZ, ZONES.classDividerZ]) {
    for (const [a, b] of [[x0, -0.44], [0.44, x1]]) {
      const g = x.createLinearGradient(0, pz(Z - 0.25), 0, pz(Z + 0.25));
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(px(a), pz(Z - 0.25), px(b) - px(a), pz(Z + 0.25) - pz(Z - 0.25));
    }
  }
  x.filter = 'none';
  const t = tex(c, { srgb: false });
  t.flipY = false;
  return { texture: t, rect: new THREE.Vector4(x0, z0, 1 / (x1 - x0), 1 / (z1 - z0)) };
}

export function createTextures(app) {
  const an = app.assets?.maxAnisotropy || 4;
  const placards = placardAtlas(an);
  const fao = floorAO();
  return {
    sidewall: sidewallTex(an), ceiling: ceilingTex(an), dado: dadoTex(an), psu: psuTex(an),
    signBelt: signTex('belt'), signSmoke: signTex('smoke'), exitSign: exitTex(), shade: shadeTex(),
    paneInner: paneScratchTex(), bulkhead: bulkheadTex(an), placards: placards.texture, placardRect: placards.rect,
    floorAO: fao.texture, floorAORect: fao.rect,
  };
}
