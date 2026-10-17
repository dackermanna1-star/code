// Husks: translucent amber child-shells (the kept), hollow and split down the back like the cicada
// shells on the oak — husk_a (~8), husk_b (~11), husk_c (~14), husk_d (~17); and the 1894 breaker boy
// (flat cap, coal-black coat, amber where skin should be, a cap-lamp). Inert: they barely move.
import { PAL, mix } from './palette.js';
import { FW, FH } from './sprites_human.js';
import { buildHumanSheet } from './sprites_anims.js';
import { makeCanvas, ctxOf, rng } from './util.js';

const A = 0.74;
const OUT = { outline: PAL.amber_dd, outlineAlpha: 0.7 };
const HUSK_M = {
  hair: { ramp: [PAL.amber_dd, PAL.amber_d, PAL.amber, PAL.amber_l, PAL.amber_ll], alpha: A, ...OUT },
  skin: { ramp: [PAL.amber, PAL.amber_l, mix(PAL.amber_l, PAL.amber_ll, 0.6), '#f8e2b0', '#fff4d8'], alpha: A, ...OUT },
  shell: { ramp: ['#5a3c16', '#8a5e24', '#b88234', PAL.amber_l, PAL.amber_ll], alpha: A, ...OUT },
  shellD: { ramp: [PAL.amber_dd, PAL.amber_d, '#946a2c', '#b88234', PAL.amber_l], alpha: A, ...OUT },
  hollow: { ramp: ['#140c04', '#22150a', '#34200e', '#4a3016', '#62401e'], alpha: 0.9, ...OUT },
};
const LEG = {
  H: ['hair', 2], h: ['hair', 1], L: ['hair', 3], p: ['hair', 1],
  S: ['skin', 2], s: ['skin', 1], r: ['skin', 2, 'ear'],
  o: ['hollow', 1, 'hole'], x: ['hollow', 0, 'hole'],
};
const PARTS = { hair: { sep: 1 }, skin: { shade: { L: 1, T: -1, R: -1, B: -1 } }, ear: { shade: false }, hole: { shade: false } };
const ORDER = ['skin', 'ear', 'hair', 'hole'];

const HEADS = {
  a: {
    down: { rows: ['..hHHHHh..', '.hHLHHHHh.', 'hHHHHHHHHh', 'HHhSSSShHH', 'pHSoSSoSHp', 'pHSSSSSSHp', 'p.sSSSSs.p', '...sSSs...'] },
    up: { rows: ['..hHHHHh..', '.hHLHHHHh.', 'hHHHxHHHHh', 'HHHHxHHHHH', 'pHHHxHHHHp', 'pHHHHHHHHp', 'p.hHHHHh.p', '...sSSs...'] },
    left: { rows: ['...hHHHh..', '..hHLHHHh.', '.hHHHHHHHh', '.SSShHHHHH', '.SoSSrHHHp', 'SSSSSHHH.p', '.sSSsh...p', '..ss......'] },
  },
  b: {
    down: { rows: ['..hHHHHh..', '.hHLLHHHh.', 'hHLHHHHHHh', 'HHHHHHHHHH', 'HhSSSSSShH', 'hSoSSSSoSh', '.SSSSSSSS.', '.sSSSSSSs.', '..sSSSSs..'] },
    up: { rows: ['..hHHHHh..', '.hHLLHHHh.', 'hHLHxHHHHh', 'HHHHxHHHHH', 'HHHHxHHHHH', 'hHHHHHHHHh', 'rhHHHHHHhr', '.hhHHHHhh.', '..sSSSSs..'] },
    left: { rows: ['...hHHHHh.', '..hHLLHHHh', '.hHLHHHHHH', '.HHHHHHHHH', 'hhSSShHHHH', 'SoSSSrhHHh', 'SSSSSShHh.', '.SSSSshh..', '..sSss....'] },
  },
  c: {
    down: { rows: ['...hHHHHh...', '..hHLLHHHh..', '.hHLHHHHHHh.', '.HHHHHHHHHH.', '.HhSSSSSShH.', '.HSoSSSSoSH.', '.HSSSSSSSSH.', '.HhSSSSSShH.', '.Hh.sSSs.hH.', '..h......h..'] },
    up: { rows: ['...hHHHHh...', '..hHLLHHHh..', '.hHLHxHHHHh.', '.HHHHxHHHHH.', '.HHHHxHHHHH.', '.HHHHxHHHHH.', '.HHHHHHHHHH.', '.HhHHHHHHhH.', '.Hh.sSSs.hH.', '..h......h..'] },
    left: { rows: ['....hHHHh...', '...hHLLHHh..', '..hHLHHHHHh.', '..HHHHHHHHHh', '.hSSShHHHHHH', '.SoSSShHHHHH', 'SSSSSShHHHHh', '.SSSSshHHHh.', '..sss.hHHh..', '.......hh...'] },
  },
  d: {
    down: { rows: ['...hHHHHh...', '..hHLLHHHh..', '.hHLHHHHHHh.', '.HHHHHHHHHH.', '.HHhhHHhhHH.', '.hSSSSSSSSh.', '.SSoSSSSoSS.', 'rSSSSSSSSSSr', '.SSSSSSSSSS.', '..sSSSSSSs..', '...sSSSSs...'] },
    up: { rows: ['...hHHHHh...', '..hHLLHHHh..', '.hHLHxHHHHh.', '.HHHHxHHHHH.', '.HHHHxHHHHH.', '.HHHHxHHHHH.', '.hHHHHHHHHh.', 'rhHHHHHHHHhr', '.hhHHHHHHhh.', '..hHHHHHHh..', '...sSSSSs...'] },
    left: { rows: ['....hHHHHh..', '...hHLLHHHh.', '..hHLHHHHHHh', '..HHHHHHHHHH', '..hhhHHHHHHH', '.hSSSShHHHHh', '.SoSSSrhHHHh', 'SSSSSSrhHHh.', '.SSSSSSsh...', '..sSSSss....', '...ssss.....'] },
  },
};
const DIMS = {
  a: { headY: 11, shY: 19, hipY: 24, hem: 24, ground: 29, shW: 6, legW: 2, legGap: 0, armW: 2, armIn: 1, handY: 24, elbowDy: 2, sitDropUp: 3, sitDropDown: 2, thigh: 3 },
  b: { headY: 8, shY: 17, hipY: 22, hem: 22, ground: 29, shW: 8, legW: 3, legGap: 0, armW: 2, armIn: 1, handY: 23, elbowDy: 3, sitDropUp: 4, sitDropDown: 3, thigh: 3 },
  c: { headY: 5, shY: 15, hipY: 21, hem: 21, ground: 29, shW: 8, legW: 3, legGap: 1, armW: 2, armIn: 1, handY: 22, elbowDy: 4 },
  d: { headY: 3, shY: 14, hipY: 20, hem: 20, ground: 29, shW: 10, legW: 3, legGap: 2, armW: 2, armIn: 1, handY: 21, elbowDy: 4 },
};

function shellTorsoFront(P, g, C) {
  const { sh, hem, back } = g;
  const w = C.dims.shW, x0 = 12 - (w >> 1);
  P.part('shell', { sep: 1 }, () => { P.hl(x0 + 1, sh, w - 2, 2); P.rect(x0, sh + 1, w, hem - sh, 2); });
  // segment ridges, like the abdomen of a shed skin
  for (let y = sh + 2; y < hem; y += 2) P.hl(x0 + 1, y, w - 2, 1, 'shell');
  if (!back) { P.hl(x0 + (w >> 1) - 1, sh, 2, 3, 'shell'); return; }
  // the split down the back: hollow seam, lighter curled lips either side
  const top = sh, bot = Math.min(hem - 1, sh + 6);
  P.part('hollow', { shade: false }, () => { P.rect(11, top, 2, 2, 0); P.vl(11 + ((bot - top) & 1), top + 2, bot - top - 1, 0); P.px(12, top + 3, 1); });
  for (let y = top; y <= bot; y++) { P.px(10, y, y % 2 ? 4 : 3, 'shell'); if (y < bot - 1) P.px(13, y, y % 2 ? 3 : 4, 'shell'); }
}
function shellTorsoSide(P, g, C) {
  const { sh, hem, cx } = g;
  const w = Math.max(5, C.dims.shW - 2), x0 = cx - (w >> 1) - g.lean;
  P.part('shell', { sep: 1 }, () => { P.hl(x0 + 1, sh, w - 2, 2); P.rect(x0, sh + 1, w, hem - sh, 2); });
  for (let y = sh + 2; y < hem; y += 2) P.hl(x0, y, w - 1, 1, 'shell');
  // the split shows as a ragged lip along the back
  P.part('hollow', { shade: false }, () => P.vl(x0 + w - 1, sh, 4, 0));
  P.vl(x0 + w - 2, sh, 4, 4, 'shell');
}

function huskSpec(k) {
  const C = {
    id: `husk_${k}`, mats: HUSK_M, legend: LEG, heads: HEADS[k], headParts: PARTS, headOrder: ORDER,
    dims: { ...DIMS[k], stride: 2, runStride: 3 },
    sleeve: { mat: 'shell', cover: 0.7, cuff: false },
    legMat: 'shellD',
    shoe: {
      mat: 'shellD', h: 2, wider: 1,
      frontDetail() {},
      side: { ox: -2, oy: 0, rows: ['.kkk', 'kkkk'] },
      legend: (t) => ({ k: ['shellD', t] }),
      parts: { shellD: { shade: { L: 1, T: 1, R: 0, B: 0 } } },
    },
    run: false, walk: false, headsDown: false,
  };
  C.torsoFront = (P, g) => shellTorsoFront(P, g, C);
  C.torsoSide = (P, g) => shellTorsoSide(P, g, C);
  C.idle = (dir, X) => X.anim([X.R(X.stand(dir))], 1);
  C.specials = (anims, X) => {
    const sitUp = X.R(X.sit('up'));
    anims.sit_up = X.anim([sitUp], 1);
    anims.sit_down = X.anim([X.R(X.sit('down'))], 1);
    // turned: the head comes round on a body that doesn't move — profile, then the face
    const tr = (hd, dx = 0) => { const g = X.sit('up'); g.head.dir = hd; g.head.dx = dx; return X.R(g); };
    anims.turned = X.anim([sitUp, tr('left'), tr('down')], 2, false);
    anims.crumble = X.anim(crumble(sitUp, k), 6, false);
  };
  return C;
}

/** Crumble to flakes: falling-sand pass over the frame, top first; ends as a low pile + loose flakes. */
function crumble(src, seed) {
  const w = FW, h = FH;
  const sd = ctxOf(src).getImageData(0, 0, w, h).data;
  const R = rng(`crumble_${seed}`);
  const grid = new Int32Array(w * h).fill(-1);
  const parts = [];
  let minY = h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (sd[i + 3] < 40) continue;
    minY = Math.min(minY, y);
    parts.push({ x, y, r: sd[i], g: sd[i + 1], b: sd[i + 2], a: sd[i + 3], rel: 0, alive: true });
  }
  const span = Math.max(1, h - minY);
  for (const p of parts) p.rel = (p.y - minY) / span * 0.7 + R() * 0.45; // the head goes first
  parts.forEach((p, i) => { grid[p.y * w + p.x] = i; });
  const frames = [src];
  const STEPS = 5;
  for (let s = 1; s <= STEPS; s++) {
    const thr = s / STEPS * 1.15;
    for (let it = 0; it < 7; it++) {
      for (let k = parts.length - 1; k >= 0; k--) {
        const p = parts[k];
        if (!p.alive || p.rel > thr) continue;
        const below = (yy, xx) => yy < h - 1 && xx >= 0 && xx < w && grid[yy * w + xx] < 0;
        let nx = p.x, ny = p.y;
        if (p.y >= h - 2) continue; // resting on the floor line
        if (below(p.y + 1, p.x)) ny = p.y + 1;
        else {
          const d = R() < 0.5 ? -1 : 1;
          if (below(p.y + 1, p.x + d)) { nx = p.x + d; ny = p.y + 1; }
          else if (below(p.y + 1, p.x - d)) { nx = p.x - d; ny = p.y + 1; }
        }
        if (nx !== p.x || ny !== p.y) { grid[p.y * w + p.x] = -1; p.x = nx; p.y = ny; grid[ny * w + nx] = k; }
      }
    }
    // some flakes are lost to the air each step (turned to motes)
    for (const p of parts) if (p.alive && p.rel <= thr && R() < 0.12 * s / STEPS) { p.alive = false; grid[p.y * w + p.x] = -1; }
    const c = makeCanvas(w, h);
    const x = ctxOf(c);
    const img = x.createImageData(w, h);
    const d = img.data;
    for (const p of parts) {
      if (!p.alive) continue;
      const i = (p.y * w + p.x) * 4;
      const fallen = p.rel <= thr;
      const dk = fallen ? 0.82 : 1;
      d[i] = p.r * dk; d[i + 1] = p.g * dk; d[i + 2] = p.b * dk; d[i + 3] = fallen ? Math.min(p.a, 170) : p.a;
    }
    x.putImageData(img, 0, 0);
    frames.push(c);
  }
  return frames;
}

// =============================================================================================
// BREAKER BOY (1894): flat cap with a cap-lamp, oversized coal-black coat, amber where skin should be.
// Seated on the picking bench, hunched over the chute.
// =============================================================================================
const BB_M = {
  cap: ['#08080a', '#121214', '#1e1e22', '#2c2c30', '#404046'],
  coat: ['#08080a', '#121113', '#1c1a1c', '#2a2726', '#3e3a36'],
  dust: ['#2a2828', '#3c3a38', '#54524e', '#6e6a64', '#8a8680'],
  pants: ['#0c0b0c', '#161416', '#211e1e', '#2e2a28', '#3e3934'],
  boot: ['#060506', '#0e0c0c', '#181414', '#241e1c', '#342c28'],
  skin: { ramp: [PAL.amber_d, PAL.amber, PAL.amber_l, PAL.amber_ll, '#f8e4b4'], alpha: 0.8, outline: PAL.amber_dd, outlineAlpha: 0.75 },
  hollow: { ramp: ['#140c04', '#22150a', '#34200e', '#4a3016', '#62401e'], alpha: 0.9 },
  lamp: ['#3a2c0e', PAL.brass_d, PAL.brass, PAL.gold, PAL.gold_l],
  flame: [PAL.fire_d, PAL.fire, PAL.fire_l, PAL.ember, '#fff0c0'],
};
const BB_LEG = {
  C: ['cap', 2], c: ['cap', 1], V: ['cap', 0, 'brim'], S: ['skin', 2], s: ['skin', 1], o: ['hollow', 1, 'hole'],
  b: ['lamp', 2, 'lampp'], f: ['flame', 3, 'flamep'],
};
const BB_PARTS = { cap: { sep: 1 }, brim: { shade: false }, skin: { shade: { L: 1, T: -1, R: -1, B: -1 } }, hole: { shade: false }, lampp: { shade: false }, flamep: { shade: false } };
const BB_HEADS = {
  down: { rows: ['...f......', '..cbCCCc..', '.cCCCCCCc.', 'cCCCCCCCCc', 'VVVVVVVVVV', '.sSSSSSSs.', '.SoSSSSoS.', '.sSSSSSSs.', '..sSSSSs..'] },
  up: { rows: ['....f.....', '..cCCCCc..', '.cCCCCCCc.', 'cCCCCCCCCc', 'cCCCCCCCCc', '.cCCCCCCc.', '.sSSSSSSs.', '..sSSSSs..', '...sSSs...'] },
  left: { rows: ['f.........', 'bbcCCCCc..', 'VcCCCCCCc.', 'VVCCCCCCCc', '.SSSSCCCC.', 'SoSSSSsss.', 'SSSSSSs...', '.SSSss....', '..sss.....'] },
};
function bbTorsoFront(P, g) {
  const { sh, back } = g;
  const hem = g.seated ? g.hip + 1 : g.hem;
  P.part('coat', { sep: 1 }, () => { P.hl(8, sh, 8, 2); P.rect(7, sh + 1, 10, hem - sh, 2); });
  // coal dust on the shoulders, patched elbows
  P.px(9, sh, 3, 'dust'); P.px(14, sh + 1, 3, 'dust'); P.px(8, sh + 4, 2, 'dust');
  if (!back) { P.vl(12, sh + 2, hem - sh - 2, 1, 'coat'); P.px(11, sh + 3, 3, 'dust'); }
  else P.vl(12, sh + 3, hem - sh - 3, 1, 'coat');
}
function bbTorsoSide(P, g) {
  const { sh, cx } = g;
  const hem = g.seated ? g.hip + 1 : g.hem;
  const x0 = cx - 4 - g.lean;
  P.part('coat', { sep: 1 }, () => { P.poly([[x0 + 1, sh], [x0 + 7, sh], [x0 + 9, hem + 1], [x0 + 2, hem + 1]], 2); });
  P.px(x0 + 3, sh, 3, 'dust'); P.px(x0 + 5, sh + 3, 3, 'dust');
}
const BREAKER = {
  id: 'breakerboy', mats: BB_M, legend: BB_LEG, heads: BB_HEADS, headParts: BB_PARTS, headOrder: ['skin', 'cap', 'brim', 'hole', 'lampp', 'flamep'],
  dims: { headY: 8, shY: 17, hipY: 22, hem: 23, ground: 29, shW: 10, legW: 3, legGap: 0, armW: 2, armIn: 1, handY: 23, elbowDy: 3, sitDropUp: 3, sitDropDown: 3, thigh: 3 },
  sleeve: { mat: 'coat', cover: 0.85, cuff: false },
  legMat: 'pants',
  shoe: {
    mat: 'boot', h: 2, wider: 1,
    frontDetail() {},
    side: { ox: -2, oy: 0, rows: ['.kkk', 'kkkk'] },
    legend: (t) => ({ k: ['boot', t] }),
    parts: { boot: { shade: { L: 1, T: 1, R: 0, B: 0 } } },
  },
  torsoFront: bbTorsoFront, torsoSide: bbTorsoSide,
  walk: false, run: false, sit: false, headsDown: false,
  idle: (dir, X) => X.anim([X.R(X.stand(dir))], 1),
  specials(anims, X) {
    // hunched over the chute, hands down among the coal, picking slate; the lamp gutters
    const pick = (dir, k) => {
      const g = X.sit(dir, { headDy: 1, lean: dir === 'up' ? 0 : 2 });
      if (g.view === 'side') {
        g.head.dx -= 1;
        g.arms.near.el = [g.cx - 3, g.sh + 3]; g.arms.near.hd = [g.cx - 6, g.hip + 1 + k];
        g.arms.far.el = [g.cx - 2, g.sh + 3]; g.arms.far.hd = [g.cx - 5, g.hip + 2 - k];
      } else {
        g.head.y += 1;
        for (const a of g.arms) { a.el = [a.sh[0] + (a.screen ? 1 : -1), a.sh[1] + 2]; a.hd = [a.sh[0], a.sh[1] + 3 + (a.screen ? k : 1 - k)]; }
      }
      g.flame = k;
      return g;
    };
    for (const d of ['left', 'right', 'up']) anims[`sit_${d}`] = X.anim([X.R(pick(d, 0)), X.R(pick(d, 1))], 2);
  },
  adjust(g) { return g; },
};

export const buildHusk = (k) => () => buildHumanSheet(huskSpec(k));
export const buildBreakerBoy = () => buildHumanSheet(BREAKER);
