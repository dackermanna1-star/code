// Icons drawn with canvas paths and pixel painting: kill-feed / buy-menu weapon
// silhouettes, the HUD sprites (health cross, kevlar, stopwatch, dollar, ammo
// types, flashlight) and the status icons (buyzone cart, C4, defuse kit).
//
// Everything is authored at the GoldSrc 640 sprite size (hud.txt rectangles:
// numbers 20×25, cross/suit/stopwatch/ammo 24×24, status icons 32×32, kill
// icons ×16 high) as white-on-transparent intensity masks, the way the
// greyscale 640hud*.spr art is tinted and drawn additively by the client.
//
//   import { weaponIcon, drawWeaponIcon, hudSprite, tinted, WEAPON_IDS } from './icons.js';
//   ctx.drawImage(tinted(weaponIcon('ak47'), [255, 80, 0]), x, y);   // kill feed
//   drawWeaponIcon(ctx, 'awp', x, y, { scale: 4, color: [200, 200, 200] });
//   ctx.drawImage(tinted(hudSprite('cross'), [255, 160, 0]), x, y);

import { makeCanvas, PixelSprite, finishSprite, scaleSprite } from './hud/pixel.js';

export { makeCanvas };

export const WEAPON_IDS = [
  'knife', 'glock', 'usp', 'p228', 'deagle', 'elite', 'fiveseven',
  'm3', 'xm1014', 'mac10', 'tmp', 'mp5', 'ump45', 'p90',
  'galil', 'famas', 'ak47', 'm4a1', 'sg552', 'aug', 'scout', 'awp', 'g3sg1', 'sg550', 'm249',
  'hegrenade', 'flashbang', 'smokegrenade', 'c4',
];

// HUD ammo icon used by each weapon (weapon_*.txt "ammo" sprite)
export const WEAPON_AMMO = {
  glock: '9mm', elite: '9mm', mp5: '9mm', tmp: '9mm',
  usp: '45acp', mac10: '45acp', ump45: '45acp',
  p228: '357sig', deagle: '50ae', fiveseven: '57mm', p90: '57mm',
  m3: 'buckshot', xm1014: 'buckshot',
  galil: '556nato', famas: '556nato', m4a1: '556nato', sg552: '556nato', aug: '556nato', sg550: '556nato',
  ak47: '762nato', scout: '762nato', g3sg1: '762nato',
  awp: '338magnum', m249: '556natobox',
  hegrenade: 'hegrenade', flashbang: 'flashbang', smokegrenade: 'smokegrenade', c4: 'c4',
};

// kill-feed sprite widths (hud.txt d_* rectangles, all 16 high)
export const KILL_ICON_W = {
  knife: 48, glock: 32, usp: 32, p228: 32, deagle: 32, elite: 57, fiveseven: 32,
  m3: 48, xm1014: 48, mac10: 34, tmp: 32, mp5: 32, ump45: 48, p90: 48,
  galil: 48, famas: 48, ak47: 48, m4a1: 48, sg552: 48, aug: 44, scout: 48, awp: 48, g3sg1: 48, sg550: 48, m249: 48,
  hegrenade: 32, flashbang: 48, smokegrenade: 48, c4: 32, skull: 32, headshot: 36,
};

// ---------------------------------------------------------------- rasterising

// intensity by distance (in sprite pixels) from the shape edge: [rim, 2nd ring, ..., fill]
export const RAMP_ICON = [1, 0.66, 0.8];
export const RAMP_KILL = [0.95, 0.82, 0.74];
export const RAMP_FLAT = [1];

/**
 * Rasterise a white shape drawn by draw(ctx) in a w×h sprite-pixel box at scale k
 * into a canvas whose alpha is a bevelled intensity (rgb stays white): pixels
 * get ramp[d-1] by their chessboard distance d (in sprite pixels) to the edge.
 * opts.finish applies the sprite corner/glow pass (only meaningful at k = 1).
 */
export function rasterSprite(w, h, k, draw, ramp = RAMP_ICON, opts = {}) {
  const p = rasterPixels(w, h, k, draw, ramp);
  if (opts.finish) finishSprite(p);
  return p.toCanvas();
}

export function rasterPixels(w, h, k, draw, ramp = RAMP_ICON) {
  const W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
  const c = makeCanvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.save();
  g.scale(W / w, H / h);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  draw(g);
  g.restore();
  const a = g.getImageData(0, 0, W, H).data;
  const n = W * H;
  const p = new PixelSprite(W, H);
  if (ramp === RAMP_FLAT) {
    for (let i = 0; i < n; i++) p.v[i] = a[i * 4 + 3] / 255;
    return p;
  }
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = a[i * 4 + 3] >= 128 ? 1e6 : 0;
  // chessboard distance transform (two passes); outside the canvas counts as empty
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : d[y * W + x]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (d[i]) d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x - 1, y - 1) + 1, at(x, y - 1) + 1, at(x + 1, y - 1) + 1);
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (d[i]) d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x + 1, y + 1) + 1, at(x, y + 1) + 1, at(x - 1, y + 1) + 1);
    }
  }
  const kk = Math.max(1, Math.min(W / w, H / h));
  for (let i = 0; i < n; i++) {
    if (d[i] > 0) p.v[i] = ramp[Math.min(Math.ceil(d[i] / kk) - 1, ramp.length - 1)];
    else p.v[i] = Math.min(1, ramp[0] * (a[i * 4 + 3] / 255) * 1.6); // anti-aliased fringe
  }
  return p;
}

const tintCache = new WeakMap();
/** The sprite recoloured to rgb (alpha untouched). Cached per sprite+colour. */
export function tinted(sprite, rgb) {
  let m = tintCache.get(sprite);
  if (!m) tintCache.set(sprite, (m = new Map()));
  const key = `${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0}`;
  let c = m.get(key);
  if (!c) {
    c = makeCanvas(sprite.width, sprite.height);
    const g = c.getContext('2d');
    g.drawImage(sprite, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = `rgb(${key})`;
    g.fillRect(0, 0, c.width, c.height);
    m.set(key, c);
  }
  return c;
}

// ---------------------------------------------------------------- shape ops
// A shape is a list of ops in sprite pixels:
//   ['r', x, y, w, h]            rectangle
//   ['p', x0, y0, x1, y1, ...]   polygon
//   ['c', cx, cy, r]             circle
//   ['e', cx, cy, rx, ry]        ellipse
//   ['l', x0, y0, x1, y1, w]     thick line
//   ['x', <op>]                  cut a hole with the inner op

function pathOp(g, op) {
  g.beginPath();
  switch (op[0]) {
    case 'r': g.rect(op[1], op[2], op[3], op[4]); break;
    case 'p':
      g.moveTo(op[1], op[2]);
      for (let i = 3; i < op.length; i += 2) g.lineTo(op[i], op[i + 1]);
      g.closePath();
      break;
    case 'c': g.arc(op[1], op[2], op[3], 0, Math.PI * 2); break;
    case 'e': g.ellipse(op[1], op[2], op[3], op[4], 0, 0, Math.PI * 2); break;
    case 'l': {
      const [, x0, y0, x1, y1, w] = op;
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
      const nx = (-dy / L) * w / 2, ny = (dx / L) * w / 2;
      g.moveTo(x0 + nx, y0 + ny); g.lineTo(x1 + nx, y1 + ny); g.lineTo(x1 - nx, y1 - ny); g.lineTo(x0 - nx, y0 - ny);
      g.closePath();
      break;
    }
    default: break;
  }
}

export function drawOps(g, ops) {
  for (const op of ops) {
    if (op[0] === 'x') {
      g.globalCompositeOperation = 'destination-out';
      pathOp(g, op[1]);
      g.fill();
      g.globalCompositeOperation = 'source-over';
    } else {
      pathOp(g, op);
      g.fill();
    }
  }
}

// ---------------------------------------------------------------- weapons
// Side profiles, muzzle to the right, authored in a W×16 box and stretched to
// the d_<weapon> sprite width.

const R = (x, y, w, h) => ['r', x, y, w, h];
const P = (...pts) => ['p', ...pts];
const C = (x, y, r) => ['c', x, y, r];
const E = (x, y, rx, ry) => ['e', x, y, rx, ry];
const L = (x0, y0, x1, y1, w) => ['l', x0, y0, x1, y1, w];
const X = (op) => ['x', op];

// pistol parts: rear of slide at x0, muzzle at x0+len
function pistol(x0, len, { slideH = 3.6, grip = 1, bulky = 0, top = 3.5 } = {}) {
  const y = top, gx = x0 + 1.5;
  return [
    R(x0, y, len, slideH),                                 // slide
    R(x0 + 2, y + slideH - 0.5, len - 4, 2 + bulky),        // frame / dust cover
    P(gx, y + slideH, gx + 5.2 * grip, y + slideH, gx + 4.2 * grip - 0.6, y + 11.6, gx - 1.6, y + 11.6, gx - 1.2, y + slideH + 4), // grip
    L(gx + 5, y + slideH + 1.4, gx + 8.8, y + slideH + 3.3, 1.1), // trigger guard
    L(gx + 8.8, y + slideH + 3.3, gx + 9.4, y + slideH + 1.4, 1.1),
  ];
}

const WEAPON_SHAPES = {
  knife: { w: 32, ops: [
    P(1, 9, 3, 7.5, 11, 7.6, 11, 11, 3, 11.2),               // handle
    R(11, 5.5, 2.2, 7.5),                                    // guard
    P(13.2, 7.3, 24, 6.6, 29, 7.4, 31.5, 9.2, 26, 10.4, 13.2, 10.4), // blade
    X(L(14.5, 9, 24, 8.6, 0.7)),                             // blood groove
  ] },
  glock: { w: 26, ops: [...pistol(2.5, 20)] },
  usp: { w: 28, ops: [...pistol(2.5, 22, { slideH: 3.9, bulky: 0.4 }), R(22.5, 4, 2, 2.2)] },
  p228: { w: 26, ops: [...pistol(2.5, 19.5, { slideH: 3.8 }), P(20, 3.5, 22, 3.5, 22, 7.3, 20, 7.3)] },
  deagle: { w: 30, ops: [
    P(2.5, 3.2, 27.5, 3.2, 27.5, 5.6, 25.5, 6.6, 6.5, 7.6, 2.5, 7.6), // slide + barrel (triangular profile)
    R(5, 7, 16, 2.2),
    R(26, 2.3, 1.4, 1.2),
    P(4, 7.4, 10, 7.4, 8.6, 15.2, 1.6, 15.2, 2.2, 11),
    L(9.5, 9, 13.5, 11.2, 1.2), L(13.5, 11.2, 14.3, 9, 1.2),
  ] },
  elite: { w: 32, ops: [
    ...pistol(1, 18, { top: 2 }),
    ...pistol(11, 18.5, { top: 5 }),
  ] },
  fiveseven: { w: 26, ops: [...pistol(2.5, 19, { slideH: 3.4, bulky: 0.6 }), P(21.5, 3.5, 22.5, 4.2, 22.5, 6.9, 21.5, 6.9)] },

  m3: { w: 56, ops: [
    P(1, 6.4, 3, 5.2, 14, 5.6, 17, 6, 17, 9.5, 11, 9.5, 4, 12.6, 1, 12.6), // stock
    R(16.5, 4.6, 11, 5),                                   // receiver
    P(18, 9.5, 21, 9.5, 19.4, 13.6, 16.6, 13.6),           // grip area
    L(21, 9.8, 24.4, 11.2, 1), L(24.4, 11.2, 25.2, 9.6, 1), // trigger guard
    R(27, 5, 27.5, 1.8),                                   // barrel
    R(27, 7.2, 20, 1.8),                                   // magazine tube
    R(31, 6.4, 9, 3.4),                                    // pump
    R(52.5, 4.3, 1.2, 1),                                  // bead
  ] },
  xm1014: { w: 56, ops: [
    P(1, 5.6, 3, 5, 5, 5, 6, 7, 13, 7, 13, 5.4, 17, 5.4, 17, 9.4, 13, 9.4, 7, 9.4, 4, 12.4, 1, 12.4), // stock
    X(P(5, 8, 12, 8, 12, 8.4, 5.6, 10.6)),
    R(16.5, 4.4, 12, 5.2),
    P(18.5, 9.5, 21.5, 9.5, 20, 13.6, 17, 13.6),
    L(21.6, 9.8, 25, 11.2, 1), L(25, 11.2, 25.8, 9.6, 1),
    R(28, 5, 26.5, 1.8),
    R(28, 7.2, 19, 1.9),
    R(28, 6.2, 9, 3.4),
    R(52, 4.2, 1.2, 1.1),
  ] },
  mac10: { w: 28, ops: [
    R(4, 3.8, 15, 5.4),                                    // boxy body
    R(19, 5, 5.5, 2.2),                                    // barrel stub
    P(9.5, 9, 13.6, 9, 13, 15.4, 9.2, 15.4),               // grip + mag
    L(14, 9.4, 17, 10.6, 1), L(17, 10.6, 17.4, 9.2, 1),
    R(1, 3.8, 3.2, 1.1), R(1, 3.8, 1.1, 4.4),              // folded wire stock
    R(5, 2.8, 2, 1.2),
  ] },
  tmp: { w: 34, ops: [
    R(4, 4, 13, 4.6),                                      // body
    R(17, 4.4, 15.5, 3),                                   // suppressor
    P(7.5, 8.4, 11.2, 8.4, 10.4, 15.2, 7, 15.2),           // grip + mag
    L(11.4, 8.8, 14.2, 10.2, 1), L(14.2, 10.2, 14.6, 8.6, 1),
    P(15, 8.4, 17, 8.4, 16.6, 12.6, 15, 12.6),             // fore grip
    P(1, 4.8, 4.2, 4.4, 4.2, 6.8, 2.5, 7.2),               // rear cap
    R(6, 3, 2.4, 1.2), R(14, 3, 1.6, 1.2),
  ] },
  mp5: { w: 42, ops: [
    R(2, 4.4, 1.6, 6), R(2, 5, 10, 1.3), R(2, 8.8, 10, 1.3), // retractable stock
    R(11.5, 4.2, 15, 4.8),                                 // receiver
    P(14, 9, 17.5, 9, 16, 13.8, 12.6, 13.8),               // grip
    L(17.6, 9.3, 20.4, 10.7, 1), L(20.4, 10.7, 20.9, 9.1, 1),
    P(21.5, 9, 24.2, 9, 25.8, 12, 28, 15, 25.4, 15.6, 23, 12.4), // curved mag
    P(26.5, 4.6, 34, 5.2, 34, 8.4, 26.5, 9),               // handguard
    R(34, 5.6, 6.5, 1.6),                                  // barrel
    P(35, 3.4, 37, 3.4, 37.4, 5.6, 35, 5.6),               // front sight hood
    R(13, 3, 3, 1.4),                                      // rear drum
  ] },
  ump45: { w: 42, ops: [
    P(1.5, 4.6, 3.2, 4.6, 3.2, 11.6, 1.5, 11.6), R(1.5, 4.6, 10, 1.4), R(1.5, 10, 10, 1.6), // skeleton stock
    R(11, 4, 18, 5.4),                                     // body
    P(13.5, 9.4, 17, 9.4, 15.6, 14, 12.4, 14),             // grip
    L(17, 9.7, 19.8, 11, 1), L(19.8, 11, 20.4, 9.6, 1),
    P(21.4, 9.4, 25, 9.4, 25.6, 15.4, 22, 15.4),           // straight mag
    P(29, 4.4, 34.5, 4.8, 34.5, 8.4, 29, 9),
    R(34.5, 5.4, 6, 1.7),
    R(14, 2.6, 13, 1.4),                                   // rail
  ] },
  p90: { w: 38, ops: [
    P(1, 5, 4, 3, 30, 3, 33, 4.6, 33, 8.6, 27, 8.6, 25.6, 12.4, 23.6, 12.4, 22.6, 8.6, 16, 8.6, 13, 13.6, 4, 13.6, 1, 10), // body
    X(P(6, 8, 11.6, 8, 10, 11.4, 6.2, 11.4)),              // thumbhole
    X(P(18, 8.6, 21.6, 8.6, 21.6, 10.4, 18.6, 10.4)),
    R(8, 1.6, 22, 1.6),                                    // top magazine
    R(33, 5.4, 4.5, 1.8),                                  // muzzle
  ] },

  galil: { w: 50, ops: [
    R(1.5, 4.8, 1.8, 7), L(2.5, 5.4, 13.5, 5.6, 1.4), L(2.5, 11, 13.5, 8.4, 1.4), // folding skeleton stock
    R(13, 4, 15.5, 5),                                     // receiver
    P(17, 9, 20.4, 9, 18.8, 13.8, 15.6, 13.8),             // grip
    L(20.6, 9.3, 23.4, 10.6, 1), L(23.4, 10.6, 24, 9.1, 1),
    P(24.4, 9, 28, 9, 29.6, 12.4, 31.4, 15, 28.4, 15.8, 26.6, 12.6), // curved mag
    R(28.5, 4.6, 9, 4),                                    // handguard
    R(28.5, 3.4, 9, 1.2),
    R(37.5, 5.4, 10.5, 1.6),
    P(43, 2.6, 44.4, 2.6, 44.8, 5.4, 43, 5.4),
    R(46.5, 5, 2.5, 2.4),
    L(32, 9, 40, 10.4, 0.9),                               // bipod folded
  ] },
  famas: { w: 48, ops: [
    P(1, 4, 4, 4, 4, 13, 1, 13),                           // butt
    P(3.5, 5, 30, 5, 31, 6, 31, 10.4, 3.5, 11.4),          // body
    P(5, 5, 8, 1, 31, 1, 34, 5, 31.6, 5, 29.6, 2.6, 9, 2.6, 7.4, 5), // carry handle
    P(9, 11, 13.4, 11, 13.6, 15.4, 9.4, 15.4),             // mag (behind grip)
    P(18, 10.4, 21.4, 10.4, 20.4, 15, 17.2, 15),           // grip
    L(21.4, 10.8, 24.6, 12, 1), L(24.6, 12, 25.2, 10.6, 1),
    R(31, 6.4, 7.5, 3.6),
    R(38.5, 7, 8.5, 1.6),
    L(30, 10.6, 41, 11, 0.9),                              // bipod folded
  ] },
  ak47: { w: 50, ops: [
    P(1, 6.6, 13.5, 4.8, 13.5, 9.2, 4, 12.6, 1, 12.6),     // wooden stock
    R(13, 4, 15, 5),                                       // receiver
    P(25, 3.2, 27.6, 3.2, 27.6, 4.2, 25, 4.2),             // rear sight
    P(16.8, 9, 20, 9, 18.4, 14.2, 15.2, 14.2),             // grip
    L(20.2, 9.3, 23, 10.7, 1), L(23, 10.7, 23.6, 9.1, 1),  // trigger guard
    P(24, 9, 27.8, 9, 29.6, 12.2, 32.2, 15, 29, 16, 26.4, 12.6), // banana mag
    R(28, 4.8, 8.5, 3.6),                                  // lower handguard
    R(28, 3.8, 9.5, 1.1),                                  // gas tube
    R(36.5, 5.3, 11.5, 1.6),                               // barrel
    P(44, 2.8, 45.2, 2.8, 45.8, 5.4, 44, 5.4),             // front sight
    R(47, 5, 2.2, 2.2),                                    // muzzle
  ] },
  m4a1: { w: 50, ops: [
    P(1.5, 4.6, 10, 4.6, 10, 8.4, 6.5, 8.4, 4, 11.8, 1.5, 11.8), // collapsible stock
    R(9.5, 5.2, 4.5, 1.8),                                 // buffer tube
    R(13.5, 4, 14, 5),                                     // receiver
    P(15, 4, 16.4, 1.6, 23.6, 1.6, 24.6, 4, 23, 4, 22.6, 3.2, 17, 3.2, 16.6, 4), // carry handle
    P(16.4, 9, 19.6, 9, 18.2, 14, 15, 14),                 // grip
    L(19.8, 9.3, 22.6, 10.6, 1), L(22.6, 10.6, 23.2, 9.1, 1),
    P(23.4, 9, 27, 9, 27.6, 15, 24, 15.4),                 // mag
    P(27.5, 4.4, 37, 4.6, 37, 8.6, 27.5, 9),               // handguard
    P(35.6, 1.8, 37, 1.8, 37.6, 4.6, 35.6, 4.6),           // front sight post
    R(37, 5.6, 9.5, 1.5),
    R(46, 5.1, 3, 2.4),                                    // flash hider
  ] },
  sg552: { w: 48, ops: [
    R(1.5, 4.6, 1.8, 7), L(2.4, 5.2, 12.5, 5.4, 1.4), L(2.4, 11, 12.5, 8.6, 1.4),
    R(12, 4.2, 16, 5),
    P(16, 9.2, 19.4, 9.2, 17.8, 14, 14.6, 14),
    L(19.6, 9.5, 22.4, 10.8, 1), L(22.4, 10.8, 23, 9.3, 1),
    P(23.4, 9.2, 26.6, 9.2, 28, 12, 30, 14.6, 27.2, 15.4, 25.4, 12.4),
    R(28, 4.6, 8, 4),
    R(36, 5.4, 9, 1.6),
    R(44.6, 5, 2.4, 2.4),
    // scope
    R(14, 1.2, 12, 2.2), R(12.8, 0.6, 2.2, 3.2), R(24.6, 0.8, 2.6, 3), R(17, 3.2, 1.6, 1.2), R(22, 3.2, 1.6, 1.2),
  ] },
  aug: { w: 48, ops: [
    P(1, 5.6, 3, 4.6, 21, 4.6, 24, 6, 31, 6, 31, 9.4, 24, 9.4, 21, 12.6, 3, 12.6, 1, 10), // bullpup body
    P(7, 12.6, 11.4, 12.6, 11.8, 15.6, 7.8, 15.6),         // mag
    P(19, 9.4, 22, 9.4, 21.2, 14.6, 18.2, 14.6),           // grip
    X(P(14, 9.4, 18.6, 9.4, 18.2, 11.8, 14.4, 11.8)),
    P(27, 9.4, 29.4, 9.4, 29, 14, 26.6, 14),               // fore grip
    R(31, 6.8, 13.5, 1.6),                                 // barrel
    R(44, 6.4, 2.6, 2.4),
    // integrated scope + handle
    P(14, 4.6, 15, 1.4, 25, 1.4, 26, 4.6), X(R(16.4, 3.2, 7.4, 1.4)),
    R(13.4, 1, 2.6, 2.4),
  ] },
  scout: { w: 56, ops: [
    P(1, 6, 4, 5.6, 14, 6.8, 19, 6, 22, 6, 22, 9, 19, 9, 17.4, 12.4, 14.8, 12.4, 15, 9.4, 6, 10.2, 3, 12.6, 1, 12.6), // stock with grip
    R(21.5, 5.2, 9, 3.6),                                  // action
    L(26, 8.8, 27, 10.6, 1.2), C(27, 10.8, 0.9),            // bolt handle
    L(20, 9, 23, 10.4, 0.9), L(23, 10.4, 23.4, 9, 0.9),
    P(24, 8.8, 26.6, 8.8, 26.6, 11.6, 24, 11.6),           // small mag
    P(30.5, 5.4, 40, 6, 40, 8.4, 30.5, 8.8),               // fore stock
    R(40, 6.3, 14.5, 1.5),                                 // barrel
    R(53.5, 6, 1.6, 2.2),
    // scope
    R(20.5, 2, 12, 1.9), P(18, 0.8, 21, 1.6, 21, 4.2, 18, 4.8), P(32, 1.6, 35.6, 0.6, 35.6, 4.8, 32, 4),
    R(23, 3.8, 1.6, 1.4), R(29.4, 3.8, 1.6, 1.4),
  ] },
  awp: { w: 62, ops: [
    P(1, 4.6, 4, 4.4, 9, 5.4, 22, 5.4, 22, 9.4, 15, 9.4, 12.6, 13.4, 3.6, 13.4, 1, 13), // thumbhole stock
    X(P(10, 8, 15.4, 8, 13.8, 11.2, 10.4, 11.2)),
    R(4, 2.8, 4.6, 1.8),                                   // cheek rest
    R(21.5, 4.6, 12, 4.8),                                 // action
    P(26, 9.4, 30.4, 9.4, 30.4, 13.6, 26, 13.6),           // magazine
    L(22.2, 9.6, 25.2, 11, 0.9), L(25.2, 11, 25.6, 9.4, 0.9),
    L(31, 9.2, 32.6, 11, 1.2), C(32.6, 11.2, 1),            // bolt
    P(33.5, 5, 42, 5.4, 42, 8.2, 33.5, 8.8),               // fore stock
    R(42, 5.9, 15.5, 1.9),                                 // barrel
    R(57, 5.2, 4, 3.3),                                    // muzzle brake
    // scope
    R(22, 1.4, 14, 2.4), P(18.6, 0.2, 22, 1, 22, 4.4, 18.6, 5), P(36, 1, 40, 0, 40, 5, 36, 4.2),
    R(25, 3.6, 2, 1.4), R(32, 3.6, 2, 1.4),
  ] },
  g3sg1: { w: 60, ops: [
    P(1, 5.8, 3, 4.4, 8, 4.4, 9, 6, 16, 6, 16, 9.4, 10, 9.4, 4, 13, 1, 13), // stock
    R(4.4, 2.8, 5, 1.8),
    R(15.5, 4.6, 16, 5),
    P(18.6, 9.6, 22, 9.6, 20.4, 14.4, 17.2, 14.4),
    L(22.2, 9.9, 25, 11.2, 1), L(25, 11.2, 25.6, 9.7, 1),
    P(26, 9.6, 29.6, 9.6, 30, 15.2, 26.6, 15.4),           // mag
    P(31.5, 4.8, 44, 5.2, 44, 8.6, 31.5, 9.2),             // handguard
    R(44, 5.8, 12.5, 1.6),
    R(55.6, 5.3, 3, 2.6),
    // scope
    R(18, 1.6, 13, 2.2), P(15.4, 0.4, 18.4, 1.2, 18.4, 4.4, 15.4, 4.8), P(30.6, 1.2, 34, 0.4, 34, 4.8, 30.6, 4),
    R(20.6, 3.6, 1.8, 1.2), R(27.6, 3.6, 1.8, 1.2),
  ] },
  sg550: { w: 60, ops: [
    R(1.5, 4.6, 2, 8), P(1.5, 4.6, 13, 5.4, 13, 7, 3.5, 6.4), P(3, 11, 13, 8.6, 13, 10, 3.5, 12.6), // skeleton stock
    R(4, 2.8, 5, 1.6),
    R(12.5, 4.4, 17, 5),
    P(16, 9.4, 19.4, 9.4, 17.8, 14.2, 14.6, 14.2),
    L(19.6, 9.7, 22.4, 11, 1), L(22.4, 11, 23, 9.5, 1),
    P(23.4, 9.4, 26.6, 9.4, 28, 12, 29.8, 14.6, 27, 15.4, 25.4, 12.4),
    P(29.5, 4.8, 42, 5.2, 42, 8.6, 29.5, 9.2),
    R(42, 5.8, 15, 1.6),
    R(56.4, 5.3, 2.6, 2.6),
    L(36, 9.2, 46, 10.4, 0.9),
    R(16, 1.4, 13, 2.2), P(13.4, 0.2, 16.4, 1, 16.4, 4.2, 13.4, 4.6), P(28.6, 1, 32, 0.2, 32, 4.6, 28.6, 3.8),
    R(18.6, 3.4, 1.8, 1.2), R(25.6, 3.4, 1.8, 1.2),
  ] },
  m249: { w: 58, ops: [
    P(1, 5, 4, 4.6, 14, 5.4, 14, 9.6, 8, 9.6, 4, 12.8, 1, 12.8), // stock
    R(13.5, 4, 17, 5.8),                                   // receiver
    P(17, 9.8, 20.4, 9.8, 18.8, 14.4, 15.6, 14.4),         // grip
    L(20.6, 10, 23.4, 11.4, 1), L(23.4, 11.4, 24, 9.9, 1),
    P(24.6, 9.8, 32, 9.8, 32, 15.6, 24.6, 15.6),           // box mag
    P(16, 4, 17, 2, 27, 2, 28, 4),                         // feed cover / handle
    X(R(18.6, 2.8, 7, 0.8)),
    P(30.5, 4.6, 39, 5, 39, 9, 30.5, 9.4),                 // handguard
    R(39, 5.8, 15, 1.8),                                   // barrel
    R(53.6, 5.2, 3.6, 3),
    L(42, 7.6, 39, 15.4, 1.1), L(43, 7.6, 46, 15.4, 1.1),  // bipod
    P(50.6, 3.6, 52, 3.6, 52.4, 5.8, 50.6, 5.8),
  ] },

  // grenades lie on their side like the d_grenade / d_flashbang sprites
  hegrenade: { w: 32, ops: [
    P(3, 4.6, 5, 3, 20, 3, 21.4, 4.4, 21.4, 12.6, 20, 14, 5, 14, 3, 12.4), // canister
    R(21.4, 5.4, 3, 6.2), R(24.2, 6.4, 2.4, 4.2),          // cap
    P(22, 3.4, 30.6, 5.2, 31, 7, 23, 6.2),                 // spoon
    // "HE" stencil
    X(R(7, 5.6, 1.6, 6)), X(R(10.2, 5.6, 1.6, 6)), X(R(8.4, 8, 2, 1.3)),
    X(R(13.4, 5.6, 1.6, 6)), X(R(14.8, 5.6, 3.6, 1.3)), X(R(14.8, 8, 3, 1.3)), X(R(14.8, 10.3, 3.6, 1.3)),
  ] },
  flashbang: { w: 48, ops: [
    P(6, 4.2, 8, 3, 30, 3, 31.6, 4.4, 31.6, 12.6, 30, 14, 8, 14, 6, 12.6),
    R(31.6, 5.4, 4, 6.2), R(35.4, 6.4, 3, 4.2),
    P(32, 3.4, 42.6, 5, 43, 6.8, 33, 6.2),
    X(R(10, 7.6, 18, 0.9)), X(R(10, 10.2, 18, 0.9)),
  ] },
  smokegrenade: { w: 48, ops: [
    P(6, 4.2, 8, 3, 30, 3, 31.6, 4.4, 31.6, 12.6, 30, 14, 8, 14, 6, 12.6),
    R(31.6, 5.4, 4, 6.2), R(35.4, 6.4, 3, 4.2),
    P(32, 3.4, 42.6, 5, 43, 6.8, 33, 6.2),
    X(C(12, 6.6, 1)), X(C(17, 6.6, 1)), X(C(22, 6.6, 1)), X(C(12, 10.6, 1)), X(C(17, 10.6, 1)), X(C(22, 10.6, 1)),
  ] },
  c4: { w: 32, ops: [
    P(2, 5.4, 3.4, 4, 28.6, 4, 30, 5.4, 30, 13, 28.6, 14.4, 3.4, 14.4, 2, 13), // brick
    X(R(5, 6.4, 9, 3.6)),                                  // display
    X(R(17, 6.4, 2.4, 1.6)), X(R(21, 6.4, 2.4, 1.6)), X(R(25, 6.4, 2.4, 1.6)),
    X(R(17, 9.2, 2.4, 1.6)), X(R(21, 9.2, 2.4, 1.6)), X(R(25, 9.2, 2.4, 1.6)),
    X(R(5, 11.8, 22.4, 0.9)),
    L(6, 4, 9, 1.6, 0.8), L(9, 1.6, 15, 2.2, 0.8),         // wires
  ] },
};


// non-weapon kill icons
const MISC_SHAPES = {
  skull: { w: 32, ops: [
    L(8, 3.5, 24, 14, 2.6), L(24, 3.5, 8, 14, 2.6),        // crossbones
    C(7.4, 3, 1.6), C(8.4, 1.8, 1.4), C(24.6, 3, 1.6), C(23.6, 1.8, 1.4),
    C(7.4, 14.6, 1.6), C(8.6, 15.2, 1.2), C(24.6, 14.6, 1.6), C(23.4, 15.2, 1.2),
    E(16, 6.4, 5.4, 5.2), R(12.4, 9, 7.2, 4.4),            // skull
    X(E(13.8, 6.8, 1.6, 1.8)), X(E(18.2, 6.8, 1.6, 1.8)), X(P(16, 8.6, 16.9, 10.4, 15.1, 10.4)),
    X(R(13.8, 12.2, 0.8, 1.2)), X(R(15.6, 12.2, 0.8, 1.2)), X(R(17.4, 12.2, 0.8, 1.2)),
  ] },
  headshot: { w: 36, ops: [
    E(13, 8, 5, 6.6), P(9.4, 11, 16.6, 11, 15.6, 15.4, 10.4, 15.4),   // head
    X(E(11, 7.4, 1.5, 1.8)), X(E(15, 7.4, 1.5, 1.8)), X(P(13, 9.2, 13.8, 11, 12.2, 11)),
    X(C(17.4, 5.6, 1.1)),                                  // entry hole
    L(19.5, 5.2, 29, 5.2, 0.9), P(29, 3.8, 33, 3.8, 35, 5.2, 33, 6.6, 29, 6.6), // bullet + trace
    L(1, 3.4, 6.4, 5.6, 0.8), L(0.6, 7.4, 6.6, 7.2, 0.8), L(1.4, 11.4, 6.6, 8.8, 0.8), // spray
  ] },
};

export function weaponShape(id) {
  return WEAPON_SHAPES[id] || MISC_SHAPES[id] || MISC_SHAPES.skull;
}

export function weaponIconWidth(id) {
  return KILL_ICON_W[id] || KILL_ICON_W[weaponShape(id) === MISC_SHAPES.skull ? 'skull' : id] || weaponShape(id).w;
}

const killCache = new Map();
/**
 * Weapon silhouette (kill-feed sprite d_<weapon>) at scale k: white canvas with
 * alpha = intensity, (KILL_ICON_W[id] * k) × (16 * k).
 */
export function weaponIcon(id, k = 1, ramp = RAMP_KILL) {
  const key = `${id}|${k}|${ramp.join(',')}`;
  let c = killCache.get(key);
  if (!c) {
    const s = weaponShape(id);
    const tw = weaponIconWidth(id);
    c = rasterSprite(tw, 16, k, (g) => {
      g.scale(tw / s.w, 1);
      drawOps(g, s.ops);
    }, ramp);
    killCache.set(key, c);
  }
  return c;
}

/** Draw a weapon silhouette with its box top-left at (x, y). Returns the drawn width. */
export function drawWeaponIcon(ctx, id, x, y, { scale = 1, color = [255, 255, 255], alpha = 1, ramp = RAMP_KILL } = {}) {
  const spr = tinted(weaponIcon(id, scale, ramp), color);
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * alpha;
  ctx.drawImage(spr, Math.round(x), Math.round(y));
  ctx.globalAlpha = a;
  return spr.width;
}

// ---------------------------------------------------------------- HUD sprites
// Built once at the 640 size, then rescaled per sprite set.

// kevlar shield outline (24×24): scalloped top, straight sides, curved to a point
function shieldPath(g) {
  g.beginPath();
  g.moveTo(3, 3.2);
  g.quadraticCurveTo(4.6, 1.4, 6.2, 2.6);
  g.lineTo(8, 4.6);
  g.quadraticCurveTo(9.4, 2.4, 11, 1.8);
  g.quadraticCurveTo(12, 1.6, 13, 1.8);
  g.quadraticCurveTo(14.6, 2.4, 16, 4.6);
  g.lineTo(17.8, 2.6);
  g.quadraticCurveTo(19.4, 1.4, 21, 3.2);
  g.lineTo(21, 9.5);
  g.bezierCurveTo(21, 15, 17, 20, 12, 23);
  g.bezierCurveTo(7, 20, 3, 15, 3, 9.5);
  g.closePath();
  g.fill();
}

function suit(full, helmet) {
  const fill = full ? 0.6 : 0.33;
  const p = rasterPixels(24, 24, 1, shieldPath, [1, 0.22, fill * 0.85, fill]);
  if (helmet) {
    // helmet inside the shield: dark ring, bright dome, brim and visor band
    const dome = full ? 0.92 : 0.53, ring = full ? 0.12 : 0.08;
    for (let y = 7; y <= 16; y++) {
      for (let x = 7; x <= 16; x++) {
        const dx = (x - 11.5) / 5, dy = (y - 11.6) / 5;
        if (dx * dx + dy * dy <= 1) p.v[y * 24 + x] = ring;
      }
    }
    for (let y = 8; y <= 12; y++) {
      for (let x = 8; x <= 15; x++) {
        const dx = (x - 11.5) / 4.1, dy = (y - 12.4) / 4.4;
        if (dx * dx + dy * dy <= 1) p.v[y * 24 + x] = dome;
      }
    }
    for (let x = 8; x <= 15; x++) {
      p.v[13 * 24 + x] = full ? 0.45 : 0.27;
      p.v[14 * 24 + x] = full ? 0.82 : 0.47;
    }
  }
  return p.toCanvas();
}

function stopwatch() {
  const p = new PixelSprite(24, 24);
  const cx = 12, cy = 14.5;
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 24; x++) {
      const r = Math.hypot(x + 0.5 - (cx + 0.5), y + 0.5 - (cy + 0.5));
      let v = 0;
      if (r <= 8.9) v = r > 6.9 ? 1 : r > 5.9 ? 0.3 : 0.6;
      if (r > 8.9 && r < 9.6) v = 0.35;
      p.v[y * 24 + x] = v;
    }
  }
  // crown + stem
  for (let x = 10; x <= 14; x++) { p.set(x, 2, 0.9); p.set(x, 3, 0.85); }
  for (const x of [9, 15]) { p.set(x, 2, 0.45); p.set(x, 3, 0.4); }
  for (let x = 9; x <= 15; x++) p.set(x, 1, 0.22);
  p.set(11, 4, 0.55); p.set(12, 4, 0.9); p.set(13, 4, 0.5); p.set(12, 5, 0.75);
  // side buttons
  p.line(5, 6, 7, 6, 0.75, 0); p.set(6, 5, 0.3);
  p.line(17, 6, 19, 6, 0.75, 0); p.set(18, 5, 0.3);
  // hand from the centre to upper right
  const hand = [[12, 15], [12, 14], [13, 13], [13, 12], [14, 12], [14, 11], [15, 10]];
  for (const [x, y] of hand) p.v[y * 24 + x] = 0.12;
  return p.toCanvas();
}

function dollar() {
  // S and the vertical bar are separate bevelled strokes, combined with max()
  const ramp = [1, 0.33];
  const s = rasterPixels(18, 25, 1, (g) => {
    g.lineWidth = 4.6;
    g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(15.4, 7.6);
    g.bezierCurveTo(14, 4.6, 10.5, 4.2, 8, 4.4);
    g.bezierCurveTo(3.6, 4.8, 2.6, 9.8, 6.6, 11.6);
    g.bezierCurveTo(9, 12.6, 11.8, 12.6, 13.4, 14.2);
    g.bezierCurveTo(16, 17.4, 13.6, 21, 9.4, 20.8);
    g.bezierCurveTo(6.4, 20.6, 3.6, 19.4, 2.6, 16.6);
    g.stroke();
  }, ramp);
  const bar = rasterPixels(18, 25, 1, (g) => g.fillRect(7, 1, 4, 23), ramp);
  for (let i = 0; i < s.v.length; i++) {
    const a = s.v[i], b = bar.v[i];
    // the bar's outline stays visible across the S
    s.v[i] = b >= 0.99 ? 1 : Math.max(a, b);
  }
  finishSprite(s);
  return s.toCanvas();
}

function flashlight(level) {
  // tube (rows 10..19) with highlights, wider head (rows 9..20) and lens
  const p = new PixelSprite(32, 32);
  const tube = [0.35, 0.72, 0.42, 0.84, 0.92, 0.92, 0.84, 0.42, 0.72, 0.35];
  for (let x = 1; x <= 19; x++) tube.forEach((v, j) => p.set(x, 10 + j, v * level * (x === 1 ? 0.5 : 1)));
  for (let x = 20; x <= 27; x++) {
    p.set(x, 9, 0.2 * level); p.set(x, 20, 0.2 * level);
    for (let y = 10; y <= 19; y++) p.set(x, y, (y === 10 || y === 19 ? 0.65 : 0.9) * level);
  }
  for (let y = 11; y <= 18; y++) p.set(29, y, 0.7 * level);
  return p.toCanvas();
}

function flashBeam() {
  const p = new PixelSprite(16, 32);
  for (let x = 0; x < 16; x++) {
    const half = 5 + x * 0.75;
    for (let y = 0; y < 32; y++) {
      const dy = Math.abs(y - 14.5);
      if (dy > half) continue;
      p.set(x, y, (1 - x / 16) * (0.55 + 0.45 * (1 - dy / half)));
    }
  }
  return p.toCanvas();
}

function buyzone() {
  const p = new PixelSprite(32, 32);
  const L1 = (x0, y0, x1, y1, a = 0.9) => p.line(x0, y0, x1, y1, a, 0.45);
  L1(28, 6, 24, 10); L1(27, 6, 23, 10, 0.6);                // handle
  L1(2, 11, 24, 11);                                       // basket rim
  L1(3, 12, 5, 18);                                        // basket front edge
  L1(4, 15, 24, 15);                                       // middle rail
  L1(5, 18, 24, 18);                                       // basket bottom
  for (const x of [7, 11, 15, 19]) L1(x, 12, x + 1, 17, 0.75);
  L1(24, 11, 24, 22);                                      // rear post
  L1(6, 21, 24, 21); L1(6, 22, 23, 22);                    // base
  for (const x of [8, 21]) { p.set(x, 24, 0.75); p.set(x + 1, 24, 0.75); p.set(x, 25, 0.9); p.set(x + 1, 25, 0.9); p.set(x, 26, 0.6); }
  return p.toCanvas();
}

function c4Icon() {
  const p = rasterPixels(32, 32, 1, (g) => {
    g.beginPath();
    g.roundRect(1, 9, 30, 15, 3);
    g.fill();
  }, [0.85, 0.45, 0.52]);
  // front panel and lid line
  for (let x = 3; x <= 28; x++) { p.v[18 * 32 + x] = 0.75; for (let y = 19; y <= 21; y++) p.v[y * 32 + x] = 0.3; }
  // D-shaped label + dark slot
  for (let y = 11; y <= 17; y++) {
    for (let x = 13; x <= 23; x++) {
      const inD = x <= 19 || ((x - 19) / 4.5) ** 2 + ((y - 14) / 3.6) ** 2 <= 1;
      if (inD) p.v[y * 32 + x] = 0.78;
    }
  }
  for (let x = 9; x <= 12; x++) { p.v[12 * 32 + x] = 0.08; p.v[13 * 32 + x] = 0.08; }
  p.set(10, 13, 0.9);
  return p.toCanvas();
}

function defuser() {
  return rasterSprite(32, 32, 1, (g) => {
    g.lineCap = 'round';
    g.lineWidth = 3.2;
    g.beginPath();
    g.moveTo(4.5, 20);
    g.quadraticCurveTo(10, 12.5, 18.5, 11.2);
    g.quadraticCurveTo(23.5, 9.6, 27.5, 6.4);
    g.stroke();
    g.beginPath();
    g.moveTo(20.5, 2.5);
    g.quadraticCurveTo(19.5, 7, 18.5, 11.2);
    g.quadraticCurveTo(17, 19, 15.5, 28);
    g.stroke();
    g.beginPath();
    g.arc(18.5, 11.2, 2, 0, Math.PI * 2);
    g.fill();
  }, [0.8, 0.62], { finish: true });
}

// 3x5 pixel font for the calibre labels on the ammo sprites
const MICRO = {
  0: ['111', '101', '101', '101', '111'], 1: ['11', '01', '01', '01', '01'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '001', '010', '010'], 8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'], '.': ['0', '0', '0', '0', '1'], m: ['00000', '11110', '10101', '10101', '10101'],
  G: ['111', '100', '101', '101', '111'], F: ['111', '100', '110', '100', '100'], B: ['110', '101', '110', '101', '110'],
  H: ['101', '101', '111', '101', '101'], E: ['111', '100', '110', '100', '111'], C: ['111', '100', '100', '100', '111'],
  S: ['111', '100', '111', '001', '111'],
};
function microText(p, str, x, y, a = 1) {
  for (const ch of str) {
    const gl = MICRO[ch];
    if (!gl) { x += 2; continue; }
    gl.forEach((row, j) => [...row].forEach((b, i) => { if (b === '1') p.v[(y + j) * p.w + x + i] = a; }));
    x += gl[0].length + 1;
  }
}

// diagonal round from bottom-left (x0, y0) toward the upper right, shaded like a cylinder
function bulletOps(x0, y0, len, w, flat = false) {
  const c = Math.SQRT1_2;
  const nx = c * w / 2, ny = c * w / 2;
  const caseL = flat ? len : len * 0.64;
  const ex = x0 + c * caseL, ey = y0 - c * caseL;
  const tx = x0 + c * len, ty = y0 - c * len;
  const ops = [P(x0 - nx, y0 - ny, ex - nx, ey - ny, ex + nx, ey + ny, x0 + nx, y0 + ny)];
  if (!flat) ops.push(P(ex - nx * 0.9, ey - ny * 0.9, tx - nx * 0.25, ty - ny * 0.25, tx + nx * 0.25, ty + ny * 0.25, ex + nx * 0.9, ey + ny * 0.9));
  ops.push(X(L(x0 + c * 1.8 - nx, y0 - c * 1.8 - ny, x0 + c * 1.8 + nx, y0 - c * 1.8 + ny, 0.8)));
  return ops;
}

function ammo(ops, label, labelX) {
  const p = rasterPixels(24, 24, 1, (g) => drawOps(g, ops), [0.9, 0.5, 0.78, 0.62]);
  if (label) {
    for (let y = 17; y <= 23; y++) for (let x = labelX - 1; x < 24; x++) p.v[y * 24 + x] = Math.min(p.v[y * 24 + x], 0.05);
    microText(p, label, labelX, 18, 1);
  }
  return p.toCanvas();
}

function grenadeAmmo(label, holes) {
  const ops = [
    P(2, 9.5, 3.4, 8, 14, 8, 15, 9.4, 15, 15, 14, 16.4, 3.4, 16.4, 2, 15),
    R(15, 9.6, 2.6, 5.2), R(17.4, 10.6, 2, 3.2),
    P(15.4, 8.4, 22.6, 9.6, 23, 11, 16.4, 10.6),
  ];
  if (holes) for (const x of [5, 8.5, 11.5]) ops.push(X(C(x, 12.2, 0.9)));
  return ammo(ops, label, 2);
}

const HUD_BUILDERS = {
  cross: () => rasterSprite(24, 24, 1, (g) => { g.fillRect(7, 2, 10, 20); g.fillRect(2, 7, 20, 10); }, [1, 0, 0.6], { finish: true }),
  suit_full: () => suit(true, false),
  suit_empty: () => suit(false, false),
  suithelmet_full: () => suit(true, true),
  suithelmet_empty: () => suit(false, true),
  stopwatch,
  dollar,
  plus: () => rasterSprite(17, 23, 1, (g) => { g.fillRect(5, 3, 6, 16); g.fillRect(0, 8, 16, 6); }, [1, 0.33], { finish: true }),
  minus: () => rasterSprite(13, 23, 1, (g) => g.fillRect(2, 8, 10, 6), [1, 0.33], { finish: true }),
  flash_full: () => flashlight(1),
  flash_empty: () => flashlight(0.5),
  flash_beam: flashBeam,
  buyzone,
  c4: c4Icon,
  defuser,
  ammo_buckshot: () => ammo(bulletOps(4, 17, 15, 8, true), '12G', 9),
  ammo_50ae: () => ammo(bulletOps(3, 18, 19, 9.4), '.50', 12),
  ammo_9mm: () => ammo(bulletOps(3, 17, 18, 7.6), '9mm', 9),
  ammo_762nato: () => ammo(bulletOps(2, 18, 23, 5.4), '7.62', 9),
  ammo_45acp: () => ammo(bulletOps(3, 18, 19, 9), '.45', 13),
  ammo_357sig: () => ammo(bulletOps(3, 17, 20, 5.4), '.357', 9),
  ammo_556nato: () => ammo(bulletOps(1, 19, 25, 4.4), '5.56', 9),
  ammo_338magnum: () => ammo(bulletOps(1, 19, 26, 5.4), '.338', 9),
  ammo_57mm: () => ammo(bulletOps(2, 18, 23, 4), '5.7', 13),
  ammo_556natobox: () => ammo([R(3, 6, 18, 10), X(R(5, 8, 14, 0.9)), X(R(5, 12.5, 14, 0.9)), R(7, 3, 2, 3), R(11, 3, 2, 3), R(15, 3, 2, 3)], '5.56', 9),
  ammo_flashbang: () => grenadeAmmo('FB', false),
  ammo_hegrenade: () => grenadeAmmo('HE', false),
  ammo_smokegrenade: () => grenadeAmmo('SG', true),
  ammo_c4: () => ammo([P(1, 9.6, 2.6, 8, 21.4, 8, 23, 9.6, 23, 15.4, 21.4, 17, 2.6, 17, 1, 15.4), X(R(4, 9.6, 6, 3)), X(R(3.4, 14, 17, 0.8))], 'C4', 2),
};

const hudBase = new Map();
const hudCache = new Map();
/**
 * HUD sprite by name at sprite scale k (cross, suit_empty, suit_full,
 * suithelmet_empty/full, stopwatch, dollar, plus, minus, ammo_<type>,
 * flash_empty/full/beam, buyzone, c4, defuser). White canvas, alpha = intensity,
 * size = hud.txt rectangle × k.
 */
export function hudSprite(name, k = 1) {
  const key = `${name}|${k}`;
  let c = hudCache.get(key);
  if (c) return c;
  let b = hudBase.get(name);
  if (!b) {
    b = (HUD_BUILDERS[name] || HUD_BUILDERS.ammo_9mm)();
    hudBase.set(name, b);
  }
  c = scaleSprite(b, k);
  hudCache.set(key, c);
  return c;
}

export function ammoSpriteName(weaponId) {
  const t = WEAPON_AMMO[weaponId];
  return t ? 'ammo_' + t : null;
}
