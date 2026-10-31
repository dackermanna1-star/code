// LAST LOOKOUT — procedural pixel-art sprites for the HUD and the shop: cartridges, hit markers,
// rifle / ammo / upgrade / defence icons. Each is drawn once into a small canvas (low resolution,
// shown with image-rendering: pixelated at an integer scale) with an automatic 1-px dark outline.
// Browser only (canvas); nothing runs at import time.

export const PAL = {
  ink: '#0b0c08',
  woodD: '#4a2a14', wood: '#7a4a24', woodL: '#a86c3a',
  metD: '#1d1f21', met: '#3b3f43', metL: '#6d7378', metH: '#a4abb0',
  blk: '#16171a', blkL: '#2e3035',
  oliD: '#33361d', oli: '#565a30', oliL: '#7f8447',
  brassD: '#7c5a1c', brass: '#c49a3c', brassL: '#f0d27a',
  copD: '#7a3c1c', cop: '#c06a38', copL: '#e8a070',
  red: '#b8321e', redL: '#e8573a', redD: '#6e1a10',
  amber: '#ffb43a', amberL: '#ffe08a', amberD: '#9a6a1e',
  bone: '#efe3c4', lens: '#58b6d6', lensL: '#bdf0ff',
  green: '#7fbf4a', greenL: '#c4f07a', greenD: '#3e6a22',
  hot: '#fff6e0', thermal: '#2a1c4a', thermalM: '#a03a7a',
  wire: '#8a8f92', wireL: '#c8ccce',
};

const cache = new Map();

function painter(ctx) {
  const P = {
    ctx,
    r(x, y, w, h, c) {
      if (c) ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
      return P;
    },
    p(x, y, c) {
      if (c) ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
      return P;
    },
    /** Bresenham line. */
    line(x0, y0, x1, y1, c) {
      if (c) ctx.fillStyle = c;
      let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        ctx.fillRect(x0, y0, 1, 1);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x0 += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y0 += sy;
        }
      }
      return P;
    },
    /** Shaded horizontal bar: base fill, light top row, dark bottom row. */
    bar(x, y, w, h, base, light, dark) {
      P.r(x, y, w, h, base);
      if (light) P.r(x, y, w, 1, light);
      if (dark && h > 1) P.r(x, y + h - 1, w, 1, dark);
      return P;
    },
    /** Filled circle (pixel centres inside radius). */
    disc(cx, cy, rad, c) {
      if (c) ctx.fillStyle = c;
      for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) {
        for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
          if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rad * rad) ctx.fillRect(x, y, 1, 1);
        }
      }
      return P;
    },
  };
  return P;
}

/** Adds a 1-px outline (4-neighbour) of colour `col` around every opaque pixel. */
function outlineCanvas(cv, col) {
  const ctx = cv.getContext('2d');
  const { width: w, height: h } = cv;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  const c = parseInt(col.slice(1), 16);
  const R = (c >> 16) & 255, Gc = (c >> 8) & 255, B = c & 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (solid[i]) continue;
      if ((x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) || (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w])) {
        d[i * 4] = R;
        d[i * 4 + 1] = Gc;
        d[i * 4 + 2] = B;
        d[i * 4 + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * A cached sprite canvas. `draw(P, w, h)` paints in sprite pixels; opts.outline: colour or
 * false. The canvas has the sprite's native size; scale it with CSS (image-rendering: pixelated).
 */
export function sprite(key, w, h, draw, opts = {}) {
  let cv = cache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  draw(painter(ctx), w, h);
  if (opts.outline !== false) outlineCanvas(cv, opts.outline || PAL.ink);
  cache.set(key, cv);
  return cv;
}

/** A fresh <canvas> element showing a cached sprite at an integer CSS scale. */
export function spriteElement(src, scale = 2, cls = '') {
  const cv = document.createElement('canvas');
  cv.width = src.width;
  cv.height = src.height;
  cv.getContext('2d').drawImage(src, 0, 0);
  cv.className = cls;
  cv.style.width = `${src.width * scale}px`;
  cv.style.height = `${src.height * scale}px`;
  cv.style.imageRendering = 'pixelated';
  return cv;
}

// ---------------------------------------------------------------------------------------------
// Cartridges (the magazine display)

const TIP = {
  fmj: [PAL.cop, PAL.copL, PAL.copD],
  hp: [PAL.cop, PAL.copL, PAL.copD, PAL.blk],
  ap: [PAL.blkL, PAL.metL, PAL.blk],
  ex: [PAL.red, PAL.redL, PAL.redD, PAL.amber],
};
/** Cartridge proportions per rifle: [case length, width, bullet length]. */
const CART = { m91: [10, 5, 6], sr10: [9, 5, 5], whisper: [12, 5, 7], anvil: [14, 7, 8] };

export function cartridgeSize(rifle) {
  const c = CART[rifle] || CART.m91;
  return { w: c[1] + 2, h: c[0] + c[2] + 2 };
}

/** Upright cartridge sprite (bullet up) for `rifle`, tip coloured by `ammo`; spent: a dim slot. */
export function cartridge(rifle = 'm91', ammo = 'fmj', spent = false) {
  const [cl, cw, bl] = CART[rifle] || CART.m91;
  const tip = TIP[ammo] || TIP.fmj;
  const w = cw + 2, h = cl + bl + 2;
  return sprite(`cart:${rifle}:${ammo}:${spent ? 1 : 0}`, w, h, (P) => {
    const x0 = 1, y0 = 1;
    if (spent) {
      // empty slot: a faint outline of the round
      P.r(x0, y0 + Math.floor(bl * 0.4), cw, cl + bl - Math.floor(bl * 0.4), 'rgba(255,180,58,0.13)');
      P.r(x0 + 1, y0 + Math.floor(bl * 0.4) + 1, cw - 2, cl + bl - Math.floor(bl * 0.4) - 2, 'rgba(0,0,0,0.35)');
      return;
    }
    // bullet: ogive narrowing to the tip
    for (let i = 0; i < bl; i++) {
      const t = i / Math.max(1, bl - 1);
      const half = Math.max(0.5, (cw / 2 - 0.5) * Math.min(1, 0.35 + t * 1.1));
      const xa = Math.round(x0 + cw / 2 - half), xb = Math.round(x0 + cw / 2 + half);
      P.r(xa, y0 + i, Math.max(1, xb - xa), 1, tip[0]);
      P.p(xa, y0 + i, tip[1]);
      if (xb - xa > 2) P.p(xb - 1, y0 + i, tip[2]);
    }
    if (tip[3] && ammo === 'hp') P.p(x0 + Math.floor(cw / 2), y0, tip[3]);
    if (tip[3] && ammo === 'ex') P.r(x0 + 1, y0 + bl - 2, cw - 2, 1, tip[3]);
    // case: brass with a shoulder, highlight on the left, shadow on the right, rim at the base
    const cy = y0 + bl;
    P.r(x0, cy, cw, cl, PAL.brass);
    P.r(x0, cy, 1, cl, PAL.brassL);
    P.r(x0 + cw - 1, cy, 1, cl, PAL.brassD);
    P.r(x0 + 1, cy, cw - 2, 1, PAL.brassD); // case mouth
    P.r(x0, cy + cl - 2, cw, 1, PAL.brassD); // extractor groove
    P.r(x0, cy + cl - 1, cw, 1, PAL.brassL);
  });
}

// ---------------------------------------------------------------------------------------------
// Hit markers and the hip crosshair

/** kind: 'hit' | 'head' | 'kill' | 'headkill'. 21×21 sprite, centre at (10, 10). */
export function hitMarker(kind) {
  return sprite(`hm:${kind}`, 21, 21, (P) => {
    const col = kind === 'hit' ? PAL.bone : kind === 'head' ? PAL.amber : PAL.redL;
    const inner = kind === 'hit' ? 4 : 3;
    const len = kind === 'hit' ? 3 : kind === 'head' ? 4 : 6;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      for (let i = 0; i < len; i++) {
        const d = inner + i;
        P.p(10 + sx * d, 10 + sy * d, col);
        if (kind !== 'hit') P.p(10 + sx * (d + 1), 10 + sy * d, col); // 2 px thick
      }
    }
    if (kind === 'head' || kind === 'headkill') {
      // small diamond at the centre: the skull was hit
      P.p(10, 8, col).p(9, 9, col).p(11, 9, col).p(8, 10, col).p(12, 10, col).p(9, 11, col).p(11, 11, col).p(10, 12, col);
    }
  });
}

/** Tiny skull for kill feed / kill markers (7×7). */
export function skull() {
  return sprite('skull', 9, 9, (P) => {
    P.r(2, 1, 5, 4, PAL.bone).r(1, 2, 7, 3, PAL.bone).r(3, 5, 3, 2, PAL.bone);
    P.r(2, 3, 2, 2, PAL.ink).r(5, 3, 2, 2, PAL.ink).p(4, 5, PAL.ink);
    P.p(3, 7, PAL.bone).p(5, 7, PAL.bone);
  });
}

/** The unscoped (hip) aiming mark: a dot with four short ticks. */
export function hipReticle() {
  return sprite('hip', 15, 15, (P) => {
    const c = PAL.bone;
    P.r(7, 7, 1, 1, c);
    P.r(7, 2, 1, 3, c).r(7, 10, 1, 3, c).r(2, 7, 3, 1, c).r(10, 7, 3, 1, c);
  }, { outline: '#000000' });
}

// ---------------------------------------------------------------------------------------------
// Small HUD glyph icons (12×12)

export function hudIcon(id) {
  return sprite(`hud:${id}`, 12, 12, (P) => {
    const A = PAL.amber, D = PAL.amberD;
    if (id === 'gate') {
      P.r(1, 2, 10, 9, D).r(2, 3, 3, 7, A).r(7, 3, 3, 7, A).r(1, 5, 10, 1, PAL.amberL);
    } else if (id === 'cabin') {
      P.r(5, 1, 2, 2, A).r(3, 3, 6, 1, A).r(2, 4, 8, 1, A).r(3, 5, 6, 6, D).r(5, 7, 2, 4, A);
    } else if (id === 'lungs') {
      P.r(5, 1, 2, 5, A).r(2, 4, 3, 6, A).r(7, 4, 3, 6, A).r(1, 6, 1, 3, D).r(10, 6, 1, 3, D).r(3, 3, 2, 1, D).r(7, 3, 2, 1, D);
    } else if (id === 'focus') {
      P.r(2, 1, 8, 1, A).r(2, 10, 8, 1, A).r(3, 2, 6, 2, D).r(4, 4, 4, 1, D).r(5, 5, 2, 2, A).r(4, 7, 4, 1, D).r(3, 8, 6, 2, A);
    } else if (id === 'cash') {
      P.r(1, 3, 10, 6, PAL.greenD).r(2, 4, 8, 4, PAL.green).r(5, 4, 2, 4, PAL.greenD).p(3, 5, PAL.greenL).p(8, 6, PAL.greenL);
    } else if (id === 'skull') {
      P.r(3, 1, 6, 5, PAL.bone).r(2, 2, 8, 4, PAL.bone).r(4, 6, 4, 3, PAL.bone).r(3, 3, 2, 2, PAL.ink).r(7, 3, 2, 2, PAL.ink).p(5, 6, PAL.ink).p(6, 6, PAL.ink);
    } else if (id === 'sun') {
      // low sun sitting on the horizon
      P.r(4, 4, 4, 1, PAL.amberL).r(3, 5, 6, 2, A).r(2, 7, 8, 1, A).r(1, 9, 10, 1, D).r(3, 10, 6, 1, D);
      P.p(1, 4, D).p(10, 4, D).p(6, 1, D).p(6, 2, D);
    } else if (id === 'moon') {
      P.r(4, 1, 4, 1, PAL.bone).r(2, 2, 4, 1, PAL.bone).r(1, 3, 4, 6, PAL.bone).r(2, 9, 4, 1, PAL.bone).r(4, 10, 4, 1, PAL.bone);
      P.r(5, 3, 1, 1, PAL.khaki || PAL.bone).p(2, 5, PAL.metL).p(3, 7, PAL.metL);
      P.p(9, 2, PAL.bone).p(10, 6, PAL.amberL);
    } else if (id === 'wind') {
      P.r(1, 3, 7, 1, A).r(8, 2, 2, 1, A).r(10, 3, 1, 1, A).r(1, 6, 9, 1, A).r(1, 9, 5, 1, A).r(6, 8, 2, 1, A);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Shop icons. Rifles 64×20, everything else 24×20 (shown at 3×).

const RIFLE_ART = {
  m91(P) {
    // stock and wrist
    P.r(2, 8, 2, 8, PAL.woodD);
    P.bar(4, 9, 12, 6, PAL.wood, PAL.woodL, PAL.woodD);
    P.bar(16, 9, 7, 4, PAL.wood, PAL.woodL, PAL.woodD);
    P.bar(23, 9, 4, 3, PAL.wood, PAL.woodL, PAL.woodD);
    // receiver, magazine, trigger, bolt
    P.bar(27, 8, 11, 3, PAL.met, PAL.metL, PAL.metD);
    P.r(28, 11, 6, 2, PAL.met).r(28, 11, 6, 1, PAL.metL);
    P.r(25, 12, 1, 2, PAL.metD).r(25, 14, 4, 1, PAL.metD);
    P.r(35, 11, 1, 2, PAL.metL).r(34, 13, 2, 2, PAL.metH);
    // fore-end, barrel, bands
    P.bar(38, 9, 17, 3, PAL.wood, PAL.woodL, PAL.woodD);
    P.r(38, 8, 24, 1, PAL.met).r(55, 9, 7, 1, PAL.metD);
    P.r(62, 7, 1, 2, PAL.metL);
    P.r(45, 8, 1, 4, PAL.metL).r(52, 8, 1, 4, PAL.metL);
    // scope
    P.r(29, 7, 1, 1, PAL.metD).r(36, 7, 1, 1, PAL.metD);
    P.bar(27, 5, 12, 2, PAL.metD, PAL.met);
    P.r(25, 4, 2, 4, PAL.met).r(39, 4, 3, 4, PAL.met).r(39, 4, 3, 1, PAL.metL);
    P.p(41, 5, PAL.lens).p(41, 6, PAL.lensL);
  },
  sr10(P) {
    P.r(2, 7, 2, 8, PAL.blk);
    P.bar(4, 8, 13, 3, PAL.blkL, PAL.met, PAL.blk);
    P.r(4, 11, 9, 3, PAL.blk).r(12, 11, 5, 1, PAL.blk);
    P.r(7, 6, 8, 2, PAL.blkL);
    P.bar(17, 7, 17, 4, PAL.blkL, PAL.met, PAL.blk);
    P.r(17, 6, 22, 1, PAL.met);
    for (let x = 18; x < 39; x += 2) P.p(x, 6, PAL.metL);
    // grip, trigger guard, magazine (slightly curved)
    P.r(21, 11, 3, 4, PAL.blk).r(20, 14, 3, 2, PAL.blk);
    P.r(24, 13, 4, 1, PAL.blkL);
    P.r(28, 11, 4, 4, PAL.blkL).r(29, 15, 4, 2, PAL.blkL).r(28, 11, 1, 4, PAL.met);
    // handguard with vents, barrel, flash hider
    P.bar(34, 7, 14, 4, PAL.blk, PAL.blkL, PAL.blk);
    for (let x = 36; x < 47; x += 3) P.r(x, 8, 1, 2, PAL.met);
    P.r(48, 8, 12, 2, PAL.met).r(48, 8, 12, 1, PAL.metL);
    P.r(60, 7, 3, 4, PAL.metD).p(61, 8, PAL.met);
    // scope
    P.r(22, 5, 1, 1, PAL.met).r(31, 5, 1, 1, PAL.met);
    P.bar(21, 3, 13, 2, PAL.blk, PAL.blkL);
    P.r(19, 2, 2, 4, PAL.blkL).r(34, 1, 4, 6, PAL.blkL).r(34, 1, 4, 1, PAL.met);
    P.p(37, 3, PAL.lens).p(37, 4, PAL.lensL);
    P.r(26, 2, 2, 1, PAL.met);
  },
  whisper(P) {
    P.r(2, 7, 2, 9, PAL.oliD);
    P.bar(4, 7, 14, 2, PAL.oli, PAL.oliL, PAL.oliD);
    P.bar(4, 13, 10, 2, PAL.oli, PAL.oliL, PAL.oliD);
    P.r(13, 9, 2, 4, PAL.oli);
    P.r(8, 5, 7, 2, PAL.oliD);
    P.bar(17, 7, 17, 4, PAL.oli, PAL.oliL, PAL.oliD);
    P.r(21, 11, 3, 4, PAL.oliD).r(20, 14, 3, 2, PAL.oliD);
    P.r(24, 13, 4, 1, PAL.oliD);
    P.r(27, 11, 4, 3, PAL.metD);
    P.r(31, 11, 1, 2, PAL.metL).r(31, 13, 2, 1, PAL.metH);
    P.bar(34, 7, 9, 4, PAL.oli, PAL.oliL, PAL.oliD);
    P.r(36, 11, 7, 1, PAL.met);
    // suppressor can with rings
    P.bar(43, 6, 19, 5, PAL.met, PAL.metL, PAL.metD);
    for (let x = 46; x < 62; x += 4) P.r(x, 6, 1, 5, PAL.metD);
    P.r(62, 7, 1, 3, PAL.metD);
    // big scope with turrets
    P.r(22, 5, 1, 1, PAL.oliD).r(31, 5, 1, 1, PAL.oliD);
    P.bar(20, 2, 16, 3, PAL.oliD, PAL.oli);
    P.r(18, 1, 2, 5, PAL.oli).r(36, 0, 5, 7, PAL.oli).r(36, 0, 5, 1, PAL.oliL);
    P.p(40, 2, PAL.lens).p(40, 3, PAL.lensL).p(40, 4, PAL.lens);
    P.r(26, 1, 3, 1, PAL.oliL).r(27, 0, 1, 1, PAL.oliL);
  },
  anvil(P) {
    P.r(1, 7, 3, 9, PAL.metD);
    P.bar(4, 8, 15, 4, PAL.met, PAL.metL, PAL.metD);
    P.r(9, 12, 1, 5, PAL.metD).r(8, 17, 3, 1, PAL.metD);
    P.bar(19, 6, 19, 6, PAL.met, PAL.metL, PAL.metD);
    P.r(19, 5, 19, 1, PAL.metD);
    P.r(22, 12, 3, 4, PAL.blk).r(21, 15, 3, 2, PAL.blk);
    P.r(25, 13, 4, 1, PAL.metD);
    P.bar(29, 12, 6, 6, PAL.met, PAL.metL, PAL.metD);
    // heavy barrel, muzzle brake with ports, bipod
    P.bar(38, 7, 19, 3, PAL.met, PAL.metL, PAL.metD);
    P.bar(57, 5, 6, 7, PAL.metD, PAL.met, PAL.blk);
    P.r(58, 7, 1, 3, PAL.ink).r(60, 7, 1, 3, PAL.ink);
    P.line(45, 10, 41, 18, PAL.metD).line(46, 10, 50, 18, PAL.metD);
    P.r(40, 18, 2, 1, PAL.metL).r(50, 18, 2, 1, PAL.metL);
    // scope
    P.r(24, 4, 1, 1, PAL.metD).r(33, 4, 1, 1, PAL.metD);
    P.bar(22, 1, 15, 3, PAL.blk, PAL.blkL);
    P.r(20, 0, 2, 5, PAL.blkL).r(37, 0, 4, 5, PAL.blkL).r(37, 0, 4, 1, PAL.met);
    P.p(40, 1, PAL.lens).p(40, 2, PAL.lensL);
  },
};

function cartridgeArt(P, x, y, tipKey, len = 13) {
  const tip = TIP[tipKey] || TIP.fmj;
  P.r(x + 1, y, 2, 1, tip[1]).r(x, y + 1, 4, 3, tip[0]).r(x, y + 1, 1, 3, tip[1]).r(x + 3, y + 1, 1, 3, tip[2]);
  if (tipKey === 'hp') P.r(x + 1, y, 2, 1, PAL.blk);
  if (tipKey === 'ex') P.r(x, y + 3, 4, 1, PAL.amber);
  if (tipKey === 'ap') P.r(x, y + 3, 4, 1, PAL.red);
  P.r(x, y + 4, 4, len - 4, PAL.brass).r(x, y + 4, 1, len - 4, PAL.brassL).r(x + 3, y + 4, 1, len - 4, PAL.brassD);
  P.r(x, y + len - 2, 4, 1, PAL.brassD).r(x, y + len - 1, 4, 1, PAL.brassL);
}

const AMMO_ART = {
  fmj(P) { for (let i = 0; i < 4; i++) cartridgeArt(P, 2 + i * 5, 3, 'fmj', 15); P.r(1, 15, 22, 2, PAL.met).r(1, 15, 22, 1, PAL.metL); },
  hp(P) { for (let i = 0; i < 4; i++) cartridgeArt(P, 2 + i * 5, 3, 'hp', 15); P.r(1, 15, 22, 2, PAL.met).r(1, 15, 22, 1, PAL.metL); },
  ap(P) { for (let i = 0; i < 4; i++) cartridgeArt(P, 2 + i * 5, 3, 'ap', 15); P.r(1, 15, 22, 2, PAL.met).r(1, 15, 22, 1, PAL.metL); },
  ex(P) { for (let i = 0; i < 4; i++) cartridgeArt(P, 2 + i * 5, 3, 'ex', 15); P.r(1, 15, 22, 2, PAL.met).r(1, 15, 22, 1, PAL.metL); },
};

const UPGRADE_ART = {
  optics(P) {
    P.bar(4, 8, 14, 4, PAL.met, PAL.metL, PAL.metD);
    P.r(1, 6, 4, 8, PAL.metD).r(17, 5, 6, 10, PAL.met).r(17, 5, 6, 1, PAL.metL);
    P.r(19, 7, 3, 6, PAL.lens).r(19, 7, 1, 3, PAL.lensL);
    P.r(9, 6, 3, 2, PAL.metL).r(10, 12, 2, 2, PAL.metD);
  },
  thermal(P) {
    P.r(2, 2, 20, 16, PAL.thermal);
    P.r(3, 3, 18, 14, '#3a2464');
    // a hot body glowing white
    P.r(10, 4, 4, 4, PAL.hot).r(8, 8, 8, 6, PAL.hot).r(9, 14, 2, 3, PAL.hot).r(13, 14, 2, 3, PAL.hot);
    P.r(6, 9, 2, 4, PAL.amberL).r(16, 9, 2, 4, PAL.amberL);
    P.r(8, 8, 1, 6, PAL.amber).r(15, 8, 1, 6, PAL.amber);
  },
  steady(P) {
    P.bar(1, 5, 22, 3, PAL.met, PAL.metL, PAL.metD);
    P.r(10, 8, 4, 2, PAL.metD);
    P.line(11, 10, 5, 18, PAL.metL).line(12, 10, 18, 18, PAL.metL);
    P.r(3, 18, 4, 1, PAL.met).r(17, 18, 4, 1, PAL.met);
  },
  lungs(P) {
    P.r(11, 1, 2, 7, PAL.bone);
    P.r(9, 7, 2, 2, PAL.bone).r(13, 7, 2, 2, PAL.bone);
    P.r(4, 6, 6, 11, PAL.red).r(14, 6, 6, 11, PAL.red);
    P.r(3, 9, 1, 7, PAL.red).r(20, 9, 1, 7, PAL.red);
    P.r(5, 7, 2, 6, PAL.redL).r(15, 7, 2, 6, PAL.redL);
    P.r(8, 14, 2, 3, PAL.redD).r(18, 14, 2, 3, PAL.redD);
  },
  action(P) {
    P.bar(2, 8, 15, 4, PAL.metL, PAL.metH, PAL.met);
    P.r(16, 7, 3, 6, PAL.met).r(12, 12, 2, 4, PAL.met).r(11, 15, 4, 3, PAL.metH);
    P.r(19, 6, 3, 1, PAL.amber).r(20, 9, 3, 1, PAL.amber).r(19, 12, 3, 1, PAL.amber);
  },
  magazine(P) {
    P.r(6, 2, 9, 4, PAL.met).r(6, 6, 10, 6, PAL.met).r(7, 12, 10, 6, PAL.met);
    P.r(6, 2, 1, 10, PAL.metL).r(7, 12, 1, 6, PAL.metL);
    P.r(8, 0, 5, 2, PAL.brass).r(8, 0, 2, 1, PAL.cop);
    P.r(17, 8, 6, 2, PAL.amber).r(19, 6, 2, 6, PAL.amber);
  },
  rangefinder(P) {
    P.bar(2, 6, 14, 9, PAL.blkL, PAL.met, PAL.blk);
    P.r(4, 8, 4, 4, PAL.lens).r(4, 8, 2, 2, PAL.lensL);
    P.r(10, 8, 3, 2, PAL.red);
    P.r(16, 9, 7, 1, PAL.redL).p(22, 8, PAL.redL).p(22, 10, PAL.redL);
    P.r(9, 11, 5, 2, PAL.amberD);
  },
  focus(P) {
    P.r(4, 1, 16, 2, PAL.woodL).r(4, 17, 16, 2, PAL.woodL);
    P.r(6, 3, 12, 2, PAL.lensL).r(7, 5, 10, 2, PAL.lensL).r(9, 7, 6, 2, PAL.lensL).r(11, 9, 2, 2, PAL.lensL);
    P.r(9, 11, 6, 2, PAL.lensL).r(7, 13, 10, 2, PAL.lensL).r(6, 15, 12, 2, PAL.lensL);
    P.r(8, 6, 8, 1, PAL.amber).r(10, 8, 4, 1, PAL.amber).r(11, 10, 2, 3, PAL.amber).r(8, 14, 8, 3, PAL.amber).r(10, 13, 4, 1, PAL.amber);
  },
};

const DEFENCE_ART = {
  repair(P) {
    P.bar(1, 11, 22, 4, PAL.wood, PAL.woodL, PAL.woodD);
    P.p(4, 13, PAL.metL).p(19, 13, PAL.metL);
    P.line(6, 3, 15, 10, PAL.metL).line(7, 3, 16, 10, PAL.metL);
    P.r(3, 2, 4, 3, PAL.metL).r(4, 2, 1, 1, PAL.ink);
    P.r(15, 9, 4, 3, PAL.metL).r(17, 10, 1, 1, PAL.ink);
  },
  wire(P) {
    for (let i = 0; i < 4; i++) {
      const x = 2 + i * 5;
      P.r(x, 6, 5, 1, PAL.wire).r(x, 14, 5, 1, PAL.wire).r(x, 6, 1, 9, PAL.wire).r(x + 4, 6, 1, 9, PAL.wireL);
    }
    P.r(1, 10, 22, 1, PAL.wireL);
    for (let x = 3; x < 22; x += 4) P.p(x, 9, PAL.wireL).p(x + 1, 11, PAL.wireL);
    P.r(1, 17, 1, 2, PAL.woodD).r(22, 17, 1, 2, PAL.woodD);
  },
  mine(P) {
    P.r(3, 11, 18, 5, PAL.oliD).r(4, 10, 16, 1, PAL.oli).r(3, 11, 18, 1, PAL.oliL);
    P.r(8, 8, 8, 3, PAL.oli).r(8, 8, 8, 1, PAL.oliL).r(10, 6, 4, 2, PAL.met).r(11, 6, 2, 1, PAL.metL);
    P.r(3, 16, 18, 1, PAL.woodD);
    P.p(6, 13, PAL.amber).p(17, 13, PAL.amber);
  },
  barrel(P) {
    P.r(6, 2, 12, 17, PAL.red).r(6, 2, 2, 17, PAL.redL).r(16, 2, 2, 17, PAL.redD);
    P.r(5, 5, 14, 1, PAL.redD).r(5, 15, 14, 1, PAL.redD);
    P.r(8, 8, 8, 4, PAL.amber).r(10, 9, 4, 2, PAL.ink);
    P.r(7, 1, 10, 1, PAL.met);
  },
  floodlight(P) {
    P.r(11, 10, 2, 9, PAL.met).r(7, 18, 10, 1, PAL.metD);
    P.r(4, 3, 9, 7, PAL.metD).r(5, 4, 7, 5, PAL.amberL).r(5, 4, 3, 2, PAL.hot);
    P.line(14, 4, 22, 1, PAL.amber).line(14, 6, 23, 6, PAL.amber).line(14, 8, 22, 11, PAL.amber);
  },
  sentry(P) {
    P.line(12, 11, 5, 18, PAL.metL).line(12, 11, 19, 18, PAL.metL).r(11, 11, 2, 8, PAL.met);
    P.bar(5, 5, 12, 6, PAL.oli, PAL.oliL, PAL.oliD);
    P.r(17, 7, 6, 2, PAL.met).r(17, 7, 6, 1, PAL.metL);
    P.r(7, 11, 3, 3, PAL.brass).r(7, 11, 1, 3, PAL.brassL);
    P.r(9, 3, 4, 2, PAL.oliD);
  },
  steelGate(P) {
    P.r(1, 2, 22, 17, PAL.metD);
    P.r(2, 3, 9, 15, PAL.met).r(13, 3, 9, 15, PAL.met);
    P.r(2, 3, 9, 1, PAL.metL).r(13, 3, 9, 1, PAL.metL);
    P.r(2, 9, 20, 2, PAL.metL).r(2, 10, 20, 1, PAL.metD);
    for (const [x, y] of [[3, 4], [9, 4], [14, 4], [20, 4], [3, 16], [9, 16], [14, 16], [20, 16]]) P.p(x, y, PAL.metH);
  },
};

/** Shop card icon for a catalog id (rifle 64×20, others 24×20); null if there is none. */
export function shopIcon(kind, id) {
  if (kind === 'rifle' && RIFLE_ART[id]) return sprite(`rifle:${id}`, 64, 20, RIFLE_ART[id]);
  const art = kind === 'ammo' ? AMMO_ART[id] : kind === 'upgrade' ? UPGRADE_ART[id] : kind === 'defence' ? DEFENCE_ART[id] : null;
  if (!art) return null;
  return sprite(`${kind}:${id}`, 24, 20, art);
}

/** Rubber-stamp wear mask: mostly opaque with clumped holes (data URL, generated once). */
export function grungeTile(size = 64, seed = 23) {
  const key = `grunge:${size}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  const holes = new Float32Array(size * size);
  for (let k = 0; k < 40; k++) {
    const cx = rnd() * size, cy = rnd() * size, r = 0.6 + rnd() * 2.6;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let dx = Math.abs(x - cx), dy = Math.abs(y - cy);
        dx = Math.min(dx, size - dx);
        dy = Math.min(dy, size - dy);
        const d = Math.hypot(dx, dy * 1.6) / r;
        if (d < 1) holes[y * size + x] = Math.max(holes[y * size + x], 1 - d);
      }
    }
  }
  for (let i = 0; i < size * size; i++) {
    const a = holes[i] > 0.15 + rnd() * 0.5 || rnd() < 0.06 ? 0 : 255;
    img.data[i * 4 + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  const url = cv.toDataURL();
  cache.set(key, url);
  return url;
}

/** 1×N noise / scanline tile as a data URL, for CSS backgrounds (generated once). */
export function noiseTile(size = 96, seed = 7, alpha = 0.09) {
  const key = `noise:${size}:${seed}:${alpha}`;
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < size * size; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const v = (s >>> 0) / 4294967296;
    const on = v > 0.5;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = on ? 255 : 0;
    img.data[i * 4 + 3] = Math.round(255 * alpha * Math.abs(v - 0.5) * 2);
  }
  ctx.putImageData(img, 0, 0);
  const url = cv.toDataURL();
  cache.set(key, url);
  return url;
}
