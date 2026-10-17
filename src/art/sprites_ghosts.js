// The school's people: Kevin Hoyt (Safety Patrol), Miss Adair (mirror views only), Denise Webb (the
// lure, faintly glowing), and the faceless 1979 student silhouette used in compact past views.
import { PAL, mix } from './palette.js';
import { polyPts, renderFrame, FW, FH } from './sprites_human.js';
import { buildHumanSheet } from './sprites_anims.js';
import { makeCanvas, ctxOf } from './util.js';

const HEAD_PARTS = {
  hair: { sep: 1 }, shako: { sep: 1 }, plume: { shade: { L: 1, T: 1, R: 0, B: 0 } },
  skin: { shade: { L: 0, T: -1, R: -1, B: -1 } },
  ear: { shade: false }, eye: { shade: false }, mouth: { shade: false }, frame: { shade: false }, gold: { shade: false }, visor: { shade: false },
};
const HEAD_ORDER = ['skin', 'ear', 'hair', 'shako', 'gold', 'visor', 'plume', 'eye', 'mouth', 'frame'];
const BASE_LEGEND = {
  H: ['hair', 2], h: ['hair', 1], d: ['hair', 0], L: ['hair', 3], l: ['hair', 4],
  S: ['skin', 2], s: ['skin', 1], K: ['skin', 3], k: ['skin', 0], r: ['skin', 2, 'ear'],
  e: ['eye', 0], E: ['eye', 2], m: ['mouth', 1], M: ['mouth', 0],
};
const line = (P, mat, pts, tone = 2, w = 1) =>
  P.part(mat, { sep: 1, shade: false }, () => { for (const [x, y] of polyPts(pts)) P.rect(x, y, w, 1, tone); });

/** Soft warm halo around the opaque pixels (Denise's faint glow). */
export function halo(src, color, a1 = 0.32, a2 = 0.14) {
  const w = src.width, h = src.height;
  const c = makeCanvas(w, h);
  const x = ctxOf(c);
  const sd = ctxOf(src).getImageData(0, 0, w, h).data;
  const op = (i, j) => i >= 0 && j >= 0 && i < w && j < h && sd[(j * w + i) * 4 + 3] > 0;
  const [r, g, b] = [1, 3, 5].map((k) => parseInt(color.slice(k, k + 2), 16));
  const img = x.createImageData(w, h);
  const d = img.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (op(i, j)) continue;
    let near = 0;
    for (let dj = -2; dj <= 2 && near < 2; dj++) for (let di = -2; di <= 2; di++) {
      if (!op(i + di, j + dj)) continue;
      const dd = Math.abs(di) + Math.abs(dj);
      near = Math.max(near, dd <= 1 ? 2 : dd <= 2 ? 1 : 0);
    }
    if (!near) continue;
    const k = (j * w + i) * 4;
    d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = Math.round((near === 2 ? a1 : a2) * 255);
  }
  x.putImageData(img, 0, 0);
  x.drawImage(src, 0, 0);
  return c;
}

/** Rotate a canvas about (px, py) by `deg`, nearest-neighbour (crisp). */
export function rotateAbout(src, px, py, deg) {
  const w = src.width, h = src.height;
  const c = makeCanvas(w, h);
  const x = ctxOf(c);
  const sd = ctxOf(src).getImageData(0, 0, w, h).data;
  const img = x.createImageData(w, h);
  const d = img.data;
  const a = (-deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = i + 0.5 - px, dy = j + 0.5 - py;
    const sx = Math.floor(px + dx * ca - dy * sa), sy = Math.floor(py + dx * sa + dy * ca);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
    const s = (sy * w + sx) * 4, k = (j * w + i) * 4;
    d[k] = sd[s]; d[k + 1] = sd[s + 1]; d[k + 2] = sd[s + 2]; d[k + 3] = sd[s + 3];
  }
  x.putImageData(img, 0, 0);
  return c;
}

// =============================================================================================
// KEVIN HOYT — 12, Safety Patrol captain. Small; blue windbreaker; the fluorescent orange belt is
// the only saturated thing on him; a pale face with no features you can hold on to.
// =============================================================================================
const KEVIN_M = {
  hair: ['#1a120c', '#2e2016', '#463222', '#5e4632', '#7a5e44'],
  skin: ['#6e6862', '#9a928a', '#c0b8ae', '#d6cfc5', '#e9e3da'],
  jacket: ['#0c1424', '#16243c', '#24385a', '#365078', '#50709a'],
  belt: ['#7a2808', PAL.orange_d, PAL.orange, PAL.orange_l, '#ffc27a'],
  silver: ['#4a4e52', '#7a7e82', '#a8acae', '#d0d2d0', '#f4f4f0'],
  pants: ['#1a120c', '#2c2016', '#3e3022', '#544230', '#6c5640'],
  shoe: ['#0e0e12', '#1a1a20', '#26262e', '#363640', '#4a4a56'],
  sole: ['#3a3a40', '#5a5a62', '#7a7a82', '#9a9aa2', '#b8b8c0'],
};
const KEVIN_HEADS = {
  down: { rows: [
    '..dhHHhd..',
    '.hHLLHHHh.',
    'hHLHHHHHHh',
    'HHHHHHHHHH',
    'HhhhhhhhhH',
    'hSskSSksSh',
    '.SSSSSSSS.',
    '.sSSSSSSs.',
    '..sSSSSs..',
  ] },
  up: { rows: [
    '..dhHHhd..',
    '.hHLLHHHh.',
    'hHLHHHHHHh',
    'HHHHHHHHHH',
    'HHHHHHHHHH',
    'hHHHHHHHHh',
    'rhHHHHHHhr',
    '.hhHHHHhh.',
    '..sSSSSs..',
  ] },
  left: { rows: [
    '...dhHHhd.',
    '..hHLLHHHh',
    '.hHLHHHHHH',
    '.HHHHHHHHH',
    '.hhhHHHHHH',
    '.SkSSrhHHh',
    'SSSSSShHh.',
    '.SSSSshh..',
    '..sSss....',
  ] },
};
function kevinTorsoFront(P, g) {
  const { sh, hem, back } = g;
  P.part('jacket', { sep: 1 }, () => { P.hl(9, sh, 6, 2); P.rect(8, sh + 1, 8, hem - sh, 2); });
  P.hl(8, hem, 8, 1, 'jacket');
  if (!back) {
    P.vl(12, sh + 1, hem - sh - 1, 1, 'jacket');
    P.hl(10, sh, 4, 3, 'jacket');
    // Sam Browne belt: his right shoulder (screen-left) → left hip, plus the waist belt
    line(P, 'belt', [[9, sh + 1], [14, hem - 2]], 2, 2);
    P.part('belt', { sep: 1, shade: false }, () => P.hl(8, hem - 1, 8, 2));
    P.px(10, sh + 2, 4, 'silver'); P.px(9, hem - 1, 3, 'silver');
    // whistle on its lanyard
    P.px(12, sh + 1, 1, 'silver'); P.px(12, sh + 2, 1, 'silver'); P.px(13, sh + 3, 4, 'silver');
  } else {
    line(P, 'belt', [[13, sh + 1], [8, hem - 2]], 2, 2);
    P.part('belt', { sep: 1, shade: false }, () => P.hl(8, hem - 1, 8, 2));
  }
}
function kevinTorsoSide(P, g) {
  const { sh, hem, cx } = g;
  const x0 = cx - 3 - g.lean;
  P.part('jacket', { sep: 1 }, () => { P.hl(x0 + 1, sh, 4, 2); P.rect(x0, sh + 1, 6, hem - sh, 2); });
  P.hl(x0, hem, 6, 1, 'jacket');
  if (g.near === 'L') line(P, 'belt', [[x0, sh + 1], [x0 + 4, hem - 2]], 2, 2);
  else line(P, 'belt', [[x0 + 3, sh], [x0, sh + 3]], 2, 2);
  P.part('belt', { sep: 1, shade: false }, () => P.hl(x0, hem - 1, 6, 2));
  P.px(x0, sh + 2, 4, 'silver');
}
const KEVIN = {
  id: 'kevin', mats: KEVIN_M, legend: BASE_LEGEND, heads: KEVIN_HEADS, headParts: HEAD_PARTS, headOrder: HEAD_ORDER,
  dims: { headY: 8, shY: 17, hipY: 22, hem: 22, ground: 29, shW: 8, legW: 3, legGap: 0, armW: 2, armIn: 1, handY: 23,
    elbowDy: 3, stride: 2, runStride: 3 },
  sleeve: { mat: 'jacket', cover: 1, cuff: true },
  legMat: 'pants',
  shoe: {
    mat: 'shoe', h: 3, wider: 1, soleMat: 'sole',
    frontDetail(P, x, y0, w, h) { P.hl(x, y0 + h - 1, w, 2, 'sole'); },
    side: { ox: -2, oy: 0, rows: ['.kkk.', 'kkkkk', 'WWWWW'] },
    legend: (t) => ({ k: ['shoe', t], W: ['sole', t] }),
    parts: { shoe: { shade: { L: 1, T: 1, R: 0, B: 0 } }, sole: { shade: false } },
  },
  torsoFront: kevinTorsoFront, torsoSide: kevinTorsoSide,
  run: false, headsDown: false, walkFps: 6,
  idle(dir, X) {
    // he does not fidget. A breath, very rarely.
    const f = [X.R(X.stand(dir, { near: { x: 0 }, far: { x: 0 } })), X.R(X.stand(dir, { breath: 1, near: { x: 0 }, far: { x: 0 } }))];
    return X.anim(X.seq(f, [0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0]), 2);
  },
  specials(anims, X) {
    const { R, front } = X;
    // whistle: right hand brings it up to his mouth and holds there
    const wh = (k) => {
      const g = front('down');
      const a = g.arm('R');
      a.el = [a.sh[0] + 1, a.sh[1] + 4];
      a.hd = k === 0 ? [a.sh[0] + 2, a.sh[1] + 2] : [11, g.head.y + 6];
      a.late = true; a.cover = 1;
      g.order = ['legs', 'torso', 'arms', 'head', 'lateArms', 'whistle'];
      g.whistle = k;
      return g;
    };
    anims.whistle_down = X.anim([R(wh(0)), R(wh(1)), R(wh(2))], 6, false);
    // hand out: palm up, held toward whoever approaches ("...pass.")
    const ho = (k) => {
      const g = front('down');
      const a = g.arm('R');
      a.el = [a.sh[0] + 1, a.sh[1] + 4];
      a.hd = k === 0 ? [a.sh[0] + 1, g.hem] : [a.sh[0] + 2, g.hem + 1];
      a.late = true; a.cover = 1; a.palm = k > 0;
      g.order = ['legs', 'torso', 'arms', 'head', 'lateArms', 'palm'];
      return g;
    };
    anims.hand_out_down = X.anim([R(ho(0)), R(ho(1))], 4, false);
  },
  layers: {
    whistle(P, g) {
      if (!g.whistle) return;
      const y = g.head.y + 6;
      P.part('silver', { shade: false }, () => { P.hl(12, y, 2, 3); });
      P.px(13, y, 4, 'silver');
    },
    palm(P, g) {
      const a = g.arm('R');
      if (!a.palm) return;
      const [hx, hy] = a.hd;
      P.part('skin', { shade: { L: 1, T: 1, R: -1, B: -1 } }, () => { P.hl(hx - 1, hy + 1, 4, 2); P.px(hx + 2, hy, 2); });
    },
  },
};

// =============================================================================================
// MISS RUTH ADAIR — 1979 music teacher. Brown hair pinned up, cat-eye glasses, mustard cardigan over a
// pointed-collar blouse, long brown skirt. Only ever drawn inside mirrors / glass.
// =============================================================================================
const ADAIR_M = {
  hair: ['#120a06', '#2a1a10', '#46301c', '#62452c', '#7e5e40'],
  skin: ['#8a5848', '#b67e66', '#d8a68c', '#ecc6ae', '#f8e0cc'],
  eye: ['#0c0806', '#1c140e', '#34261a', '#4c3a28', '#66503a'],
  mouth: ['#6a3030', '#8e4a46', '#b06a62', '#c88a80', '#dcaa9e'],
  frame: ['#0e0806', '#1c120a', '#2e1e12', '#46301c', '#5e4228'],
  cardigan: ['#2a2008', '#45380f', '#66551e', '#87732e', '#a68f42'],
  blouse: ['#7a7058', '#a49a80', '#cfc4a6', '#e4dabe', '#f2eadb'],
  skirt: ['#1a100a', '#2e1e14', '#46301e', '#5e432a', '#78583a'],
  stocking: ['#4a342c', '#6a4e40', '#8a6a58', '#a4846e', '#be9e86'],
  shoe: ['#0e0806', '#1a120c', '#2a1c12', '#3c2a1c', '#523c28'],
};
const ADAIR_LEGEND = { ...BASE_LEGEND, g: ['frame', 1] };
const ADAIR_HEADS = {
  down: { rows: [
    '....hHHh....',
    '...hHLLHh...',
    '..hHLLHHHh..',
    '.hHLHHHHHHh.',
    '.HHHHhhHHHH.',
    '.HgSSSSSSgH.',
    '.hggSSSSggh.',
    '.hSeSSSSeSh.',
    '..SSSSSSSS..',
    '..sSSmmSSs..',
    '...sSSSSs...',
  ] },
  up: { rows: [
    '....hHHh....',
    '...hHLLHh...',
    '..hHLLHHHh..',
    '.hHLHHHHHHh.',
    '.HHHHHHHHHH.',
    '.HHHhHHhHHH.',
    '.rHHHHHHHHr.',
    '..hHHHHHHh..',
    '...sSSSSs...',
    '...sSSSSs...',
  ] },
  left: { rows: [
    '......hHHh..',
    '....hHHLLHh.',
    '...hHLLHHHHh',
    '..hHLHHHHHHh',
    '..HHHhhHHHh.',
    '.gSSSSShHHh.',
    '.gggSSSrhh..',
    'SeSSSSSrh...',
    '.SSSSSSs....',
    '..mSSss.....',
    '...sss......',
  ] },
};
function adairSkirt(P, g, x0, w) {
  const sway = g.o.phase === 0 ? 1 : g.o.phase === 2 ? -1 : 0;
  const bottom = g.seated ? g.hip + 3 : 27;
  P.part('skirt', { sep: 1 }, () => {
    P.poly([[x0, g.hip], [x0 + w, g.hip], [x0 + w + 1 + (sway > 0 ? 1 : 0), bottom + 1], [x0 - 1 + (sway < 0 ? -1 : 0), bottom + 1]], 2);
  });
  P.vl(x0 + (w >> 1), g.hip + 3, bottom - g.hip - 2, 1, 'skirt');
  P.hl(x0 - 1, bottom, w + 2, 1, 'skirt');
}
function adairTorsoFront(P, g) {
  const { sh, hem, back } = g;
  if (g.seated !== 'up') adairSkirt(P, g, 7, 10);
  P.part('cardigan', { sep: 1 }, () => { P.hl(8, sh, 8, 2); P.rect(7, sh + 1, 10, hem - sh, 2); });
  P.hl(7, hem, 10, 1, 'cardigan');
  if (!back) {
    P.part('blouse', { shade: { L: 1, T: 0, R: -1, B: 0 } }, () => { P.rect(11, sh, 2, hem - sh - 2, 2); });
    // pointed collar over the cardigan
    P.part('blouse', { shade: false }, () => { P.px(10, sh, 3); P.px(10, sh + 1, 3); P.px(9, sh + 1, 2); P.px(13, sh, 3); P.px(13, sh + 1, 3); P.px(14, sh + 1, 2); });
    P.part('skin', { shade: false }, () => P.hl(11, sh, 2, 1));
    P.px(10, sh + 3, 4, 'cardigan'); P.px(10, sh + 5, 4, 'cardigan');
  } else {
    P.hl(9, sh, 6, 3, 'blouse');
  }
}
function adairTorsoSide(P, g) {
  const { sh, hem, cx } = g;
  const x0 = cx - 4 - g.lean;
  if (!g.seated) adairSkirt(P, g, x0, 8);
  else P.part('skirt', { sep: 1 }, () => P.rect(x0 - 4, g.hip - 1, 12, 3, 2));
  P.part('cardigan', { sep: 1 }, () => { P.hl(x0 + 1, sh, 6, 2); P.rect(x0, sh + 1, 8, hem - sh, 2); });
  P.hl(x0, hem, 8, 1, 'cardigan');
  P.part('blouse', { shade: false }, () => { P.vl(x0, sh, 4, 2); P.px(x0 + 1, sh, 3); });
}
const ADAIR = {
  id: 'adair', mats: ADAIR_M, legend: ADAIR_LEGEND, heads: ADAIR_HEADS, headParts: HEAD_PARTS, headOrder: HEAD_ORDER,
  dims: { headY: 1, shY: 12, hipY: 19, hem: 19, ground: 29, shW: 10, legW: 2, legGap: 2, armW: 2, armIn: 1, handY: 20,
    elbowDy: 4, stride: 2, runStride: 3 },
  sleeve: { mat: 'cardigan', cover: 1, cuff: false },
  legMat: 'stocking',
  shoe: {
    mat: 'shoe', h: 2, wider: 0,
    frontDetail() {},
    side: { ox: -2, oy: 0, rows: ['.kkk', 'kkkk'] },
    legend: (t) => ({ k: ['shoe', t] }),
    parts: { shoe: { shade: { L: 1, T: 1, R: 0, B: 0 } } },
  },
  torsoFront: adairTorsoFront, torsoSide: adairTorsoSide,
  run: false, headsDown: false, walkFps: 5,
  specials(anims, X) {
    const { R } = X;
    // point_<dir>: right arm out toward something, index finger extended
    for (const d of ['down', 'up', 'left', 'right']) {
      const mk = (k) => {
        const g = X.stand(d);
        if (g.view === 'front') {
          const a = g.arm('R');
          const out = a.screen === 0 ? -1 : 1;
          if (d === 'down') { a.el = [a.sh[0] + out, a.sh[1] + 3]; a.hd = [a.sh[0] + out * (2 + k), a.sh[1] + 5]; }
          else { a.el = [a.sh[0] + out, a.sh[1] - 1]; a.hd = [a.sh[0] + out * (1 + k), a.sh[1] - 5]; a.late = true; g.order = ['legs', 'torso', 'arms', 'head', 'lateArms', 'finger']; }
          a.cover = 1; a.point = d === 'down' ? [out, 1] : [0, -1];
        } else {
          const a = g.arms.near;
          a.el = [a.sh[0] - 3, a.sh[1] + 1];
          a.hd = [a.sh[0] - 6 - k, a.sh[1] + 1];
          a.cover = 1; a.point = [-1, 0];
          g.order = ['farArm', 'farLeg', 'nearLeg', 'torso', 'head', 'nearArm', 'finger'];
        }
        return g;
      };
      anims[`point_${d}`] = X.anim([R(mk(0)), R(mk(1))], 3, false);
    }
    // write: a fingertip in the fog on the glass between us, word by word
    const wr = (k) => {
      const g = X.stand('down');
      const a = g.arm('R');
      a.el = [a.sh[0] - 1, a.sh[1] + 3];
      a.hd = [8 + [0, 2, 4, 2][k], g.head.y + 9 + [0, -1, 0, 1][k]];
      a.cover = 1; a.late = true;
      g.order = ['legs', 'torso', 'arms', 'head', 'lateArms'];
      return g;
    };
    anims.write = X.anim([0, 1, 2, 3].map((k) => R(wr(k))), 4);
  },
  layers: {},
  afterNearArm(P, g) { ADAIR.layers.finger?.(P, g, 'near'); },
};
ADAIR.layers.finger = (P, g, which) => {
  const a = g.view === 'front' ? g.arm('R') : g.arms[which || 'near'];
  if (!a?.point) return;
  const [hx, hy] = a.hd;
  const [fx, fy] = a.point;
  const x = fx < 0 ? hx - 1 : fx > 0 ? hx + 2 : hx;
  const y = fy < 0 ? hy - 1 : fy > 0 ? hy + 2 : hy;
  P.part('skin', { shade: false }, () => P.px(x, y, 3));
};

// =============================================================================================
// DENISE WEBB — 15, 1979 marching band: green & gold, shako with a white plume, clarinet. She glows,
// faintly. sit_play on the bleachers; 'wrong' = the head keeps tilting past where a head can go.
// =============================================================================================
const DENISE_M = {
  hair: ['#050303', '#0d0807', '#18110c', '#2a1e16', '#3e2e22'],
  skin: ['#2a1610', '#4a2a1b', '#6a4028', '#8a5a3a', '#a8764e'],
  eye: ['#050303', '#0c0706', '#1a100a', '#2a1a10', '#3e2818'],
  mouth: ['#1e0c0a', '#341812', '#4a2418', '#603424', '#7a4630'],
  shako: ['#0a1610', '#122419', '#1c3624', '#284c32', '#3c6848'],
  uni: ['#0c1a12', '#14291c', '#1f3c29', '#2c5238', '#40704e'],
  gold: ['#3a2c0e', PAL.brass_d, PAL.brass, PAL.gold, PAL.gold_l],
  plume: ['#8a8478', '#b8b2a6', '#e2ddd2', '#f2eee6', '#ffffff'],
  glove: ['#8a8478', '#b8b2a6', '#e2ddd2', '#f2eee6', '#ffffff'],
  visor: ['#050506', '#0c0c0e', '#16161a', '#2a2a30', '#5a5a64'],
  clar: ['#08080a', '#16161a', '#26262c', '#3e3e48', '#62626e'],
  silver: ['#4a4e52', '#7a7e82', '#a8acae', '#d0d2d0', '#f4f4f0'],
  shoe: ['#060608', '#0e0e12', '#18181e', '#26262e', '#3a3a44'],
};
const DENISE_LEGEND = {
  ...BASE_LEGEND, C: ['shako', 2], c: ['shako', 1], X: ['shako', 3], o: ['gold', 2, 'gold'], O: ['gold', 3, 'gold'],
  v: ['visor', 2, 'visor'], w: ['plume', 2, 'plume'], W: ['plume', 4, 'plume'],
};
const DENISE_HEADS = {
  down: { rows: [
    '.....wW.....',
    '....wWw.....',
    '...cCCCCc...',
    '...cXCCCc...',
    '...cCCCCc...',
    '...oOOOOo...',
    '..vvvvvvvv..',
    '..hSSSSSSh..',
    '..hSeSSeSh..',
    '..hSSSSSSh..',
    '...sSmmSs...',
    '....sSSs....',
  ] },
  up: { rows: [
    '.....wW.....',
    '....wWw.....',
    '...cCCCCc...',
    '...cXCCCc...',
    '...cCCCCc...',
    '...oOOOOo...',
    '..hHHHHHHh..',
    '..rHHHHHHr..',
    '..hHHHHHHh..',
    '...hHHHHh...',
    '....sSSs....',
  ] },
  left: { rows: [
    '......wW....',
    '.....wWw....',
    '....cCCCCc..',
    '....cXCCCc..',
    '....cCCCCc..',
    '....oOOOOo..',
    '..vvvhHHHh..',
    '..SSSSrhHh..',
    '..SeSSrhHh..',
    '.SSSSSShh...',
    '..mSSss.....',
    '...sss......',
  ] },
};
function deniseTorsoFront(P, g) {
  const { sh, hem, back } = g;
  P.part('uni', { sep: 1 }, () => { P.hl(8, sh, 8, 2); P.rect(7, sh + 1, 10, hem - sh, 2); });
  P.hl(7, hem, 10, 1, 'uni');
  // gold: high collar, epaulettes, braid across the chest (back: crossed braid)
  P.part('gold', { shade: false }, () => {
    P.hl(10, sh, 4, back ? 2 : 3);
    P.px(7, sh + 1, 3); P.px(8, sh, 3); P.px(16, sh + 1, 2); P.px(15, sh, 2);
    if (!back) for (const y of [sh + 2, sh + 4]) P.hl(9, y, 6, y === sh + 2 ? 3 : 2);
    else { P.hl(9, sh + 3, 6, 2); }
  });
  if (!back) { P.px(11, sh + 3, 4, 'gold'); P.px(12, sh + 5, 3, 'gold'); }
}
function deniseTorsoSide(P, g) {
  const { sh, hem, cx } = g;
  const x0 = cx - 4 - g.lean;
  P.part('uni', { sep: 1 }, () => { P.hl(x0 + 1, sh, 6, 2); P.rect(x0, sh + 1, 8, hem - sh, 2); });
  P.hl(x0, hem, 8, 1, 'uni');
  P.part('gold', { shade: false }, () => { P.hl(x0 + 1, sh, 3, 3); P.hl(x0, sh + 2, 3, 3); P.hl(x0, sh + 4, 2, 2); P.px(x0 + 4, sh, 3); });
}
/** Clarinet: playing (mouthpiece at her lips, bell at the waist) or resting across her lap. */
function clarinet(P, g) {
  if (g.view !== 'front' || g.back || g.clar === 'none') return;
  const y0 = g.head.y + 10, y1 = g.hip + (g.seated ? 0 : 1);
  if (g.clar === 'lap') {
    P.part('clar', { sep: 1, shade: { L: 0, T: 1, R: 0, B: -1 } }, () => { for (const [x, y] of polyPts([[7, g.hip - 1], [17, g.hip]])) P.rect(x, y, 1, 2, 2); });
    P.px(17, g.hip, 3, 'silver'); P.px(10, g.hip - 1, 4, 'silver');
    return;
  }
  P.part('clar', { sep: 1, shade: { L: 1, T: 0, R: -1, B: 0 } }, () => {
    P.rect(11, y0, 2, y1 - y0, 2);
    P.hl(10, y1, 4, 2); P.hl(11, y1 - 1, 2, 2);
  });
  P.px(11, y0 + 2, 4, 'silver'); P.px(12, y0 + 4, 3, 'silver'); P.px(11, y0 + 6, 4, 'silver');
  // gloved hands on the keys (the lower one walks the fingers)
  const f = g.fingers || 0;
  P.part('glove', { shade: { L: 1, T: 0, R: -1, B: -1 } }, () => {
    P.rect(10, y0 + 2, 2, 2, 2);
    P.rect(12, y0 + 5 + f, 2, 2, 2);
  });
}
const DENISE = {
  id: 'denise', mats: DENISE_M, legend: DENISE_LEGEND, heads: DENISE_HEADS, headParts: HEAD_PARTS, headOrder: HEAD_ORDER,
  skinMat: 'glove',
  dims: { headY: 1, shY: 13, hipY: 20, hem: 20, ground: 29, shW: 10, legW: 3, legGap: 2, armW: 2, armIn: 1, handY: 21,
    elbowDy: 4, stride: 2, runStride: 3 },
  sleeve: { mat: 'uni', cover: 1, cuff: true, cuffMat: 'gold' },
  legMat: 'uni',
  legDetail(P, L) { if (!L.seatedBack) P.vl(L.screen === 0 ? L.x : L.x + L.w - 1, L.top + (L.seatedFront ? 2 : 1), Math.max(1, L.foot - L.top - 4), 2, 'gold'); },
  shoe: {
    mat: 'shoe', h: 3, wider: 1,
    frontDetail(P, x, y0, w) { P.px(x + 1, y0 + 1, 3); },
    side: { ox: -3, oy: 0, rows: ['..kk.', '.kkkk', 'kkkkk'] },
    legend: (t) => ({ k: ['shoe', t] }),
    parts: { shoe: { shade: { L: 1, T: 1, R: 0, B: 0 } } },
  },
  torsoFront: deniseTorsoFront, torsoSide: deniseTorsoSide,
  orderFront: (g) => ['legs', 'torso', 'arms', 'head', 'clar', 'over'],
  layers: { clar: clarinet },
  run: false, headsDown: false, walkFps: 5,
  post: (c) => halo(c, '#e8cf8a', 0.2, 0.08),
};
/** Arms for playing: both forearms come in to the clarinet. */
function playArms(g) {
  g.clar = 'play';
  for (const a of g.arms) {
    const inw = a.screen === 0 ? 1 : -1;
    a.el = [a.sh[0] - inw, a.sh[1] + 4];
    a.hd = [12 + (inw > 0 ? -2 : 0), a.screen === 0 ? g.head.y + 12 : g.head.y + 15 + (g.fingers || 0)];
    a.noHand = true; a.cover = 1;
  }
  return g;
}
DENISE.specials = (anims, X) => {
  const { R } = X;
  const play = (o = {}, f = 0) => { const g = X.sit('down', o); g.fingers = f; return playArms(g); };
  anims.sit_play = X.anim(X.seq([R(play()), R(play({}, 1)), R(play({ headDx: 1 }, 0)), R(play({ breath: 1 }, 1))], [0, 1, 0, 1, 2, 3, 2, 3]), 4);
  // standing: the clarinet held in front, a slow sway
  const st = (o = {}) => { const g = X.stand('down', o); g.fingers = 0; return playArms(g); };
  anims.idle_down = X.anim(X.seq([R(st()), R(st({ dx: 1 })), R(st({ dx: -1 }))], [0, 0, 1, 1, 0, 0, 2, 2]), 2);
  // wrong: the instrument lowers to her lap, then the head tilts... and keeps going
  const body = X.sit('down');
  body.clar = 'lap'; body.noHead = true;
  for (const a of body.arms) { const inw = a.screen === 0 ? 1 : -1; a.hd = [a.sh[0] + inw * 2, body.hip - 1]; }
  const headOnly = X.sit('down');
  headOnly.order = ['head'];
  const bodyC = renderFrame(DENISE, body), headC = renderFrame(DENISE, headOnly);
  const neck = [12, headOnly.head.y + 12];
  const frame = (deg, dy = 0) => {
    const c = makeCanvas(FW, FH); const x = ctxOf(c);
    x.drawImage(bodyC, 0, 0);
    x.drawImage(rotateAbout(headC, neck[0], neck[1], deg), 0, dy);
    const out = DENISE.post(c); out.__post = true;
    return out;
  };
  anims.wrong = X.anim([frame(0), frame(14), frame(38), frame(66, 1), frame(84, 1)], 3, false);
};

// =============================================================================================
// FIGURE79 — a faceless 1979 student: warm sepia, soft edges, feathered hair, flared jeans.
// =============================================================================================
const SEP = (k) => ['#2a1c12', '#47311f', '#694b31', '#8f6c49', '#b59166'].map((c) => mix(c, '#000000', k));
const SOFT = { outline: '#2a1c12', outlineAlpha: 0.38, alpha: 0.9 };
const F79_M = {
  hair: { ramp: SEP(0.25), ...SOFT },
  skin: { ramp: ['#5a4030', '#7e5c42', '#a07a56', '#bc9670', '#d2ae88'], ...SOFT },
  shirt: { ramp: SEP(0), ...SOFT },
  pants: { ramp: SEP(0.35), ...SOFT },
  shoe: { ramp: SEP(0.5), ...SOFT },
};
const F79_HEADS = {
  down: { rows: [
    '...hHHHHh...',
    '..hHLLHHHh..',
    '.hHLHHHHHHh.',
    '.HLHHSSHHHH.',
    'hHHHSSSSHHHh',
    'hHHSSSSSSHHh',
    'HHhSSSSSShHH',
    'HHhSSSSSShHH',
    'hH.sSSSSs.Hh',
    '.h..sSSs..h.',
  ] },
  up: { rows: [
    '...hHHHHh...',
    '..hHLLHHHh..',
    '.hHLHHHHHHh.',
    '.HLHHHHHHHH.',
    'hHHHHHHHHHHh',
    'hHHHHHHHHHHh',
    'HHHHHHHHHHHH',
    'HHhHHHHHHhHH',
    'hHhHHHHHHhHh',
    '.h.hHHHHh.h.',
  ] },
  left: { rows: [
    '....hHHHh...',
    '...hHLLHHh..',
    '..hHLHHHHHh.',
    '..HLHHHHHHHh',
    '.hHSSSHHHHHh',
    '.SSSSSHHHHHH',
    '.SSSSShHHHHH',
    'SSSSSShHHHHh',
    '.SSSSshhHHh.',
    '..sss...hh..',
  ] },
};
function f79TorsoFront(P, g) {
  const { sh, hem, back } = g;
  P.part('shirt', { sep: 1 }, () => { P.hl(8, sh, 8, 2); P.rect(7, sh + 1, 10, hem - sh, 2); });
  if (!back) { P.hl(10, sh, 4, 3, 'shirt'); P.px(10, sh + 1, 3, 'shirt'); P.px(13, sh + 1, 3, 'shirt'); P.vl(12, sh + 2, hem - sh - 2, 1, 'shirt'); }
  P.hl(7, hem, 10, 1, 'shirt');
}
function f79TorsoSide(P, g) {
  const { sh, hem, cx } = g;
  const x0 = cx - 4 - g.lean;
  P.part('shirt', { sep: 1 }, () => { P.hl(x0 + 1, sh, 6, 2); P.rect(x0, sh + 1, 8, hem - sh, 2); });
  P.hl(x0, hem, 8, 1, 'shirt');
}
const FIGURE79 = {
  id: 'figure79', mats: F79_M, legend: BASE_LEGEND, heads: F79_HEADS, headParts: HEAD_PARTS, headOrder: HEAD_ORDER,
  dims: { headY: 3, shY: 14, hipY: 20, hem: 20, ground: 29, shW: 10, legW: 3, legGap: 2, armW: 2, armIn: 1, handY: 21,
    elbowDy: 4, stride: 3, runStride: 4 },
  sleeve: { mat: 'shirt', cover: 0.6, cuff: false },
  legMat: 'pants',
  // flares: the jeans bell out over the shoes
  legDetail(P, L) { if (!L.seatedBack && !L.seatedFront) P.part('pants', { shade: false }, () => P.hl(L.x - (L.screen === 0 ? 1 : 0), L.foot - 3, L.w + 1, 2)); },
  shoe: {
    mat: 'shoe', h: 3, wider: 1,
    frontDetail() {},
    side: { ox: -3, oy: 0, rows: ['.kkkk', 'kkkkk', 'kkkkk'] },
    legend: (t) => ({ k: ['shoe', t] }),
    parts: { shoe: { shade: { L: 1, T: 1, R: 0, B: 0 } } },
  },
  torsoFront: f79TorsoFront, torsoSide: f79TorsoSide,
  run: false, headsDown: false, walkFps: 5,
};

/** Apply a spec's post-process (e.g. glow) to every frame of a built sheet, preserving shared frames. */
function postSheet(sheet, fn) {
  if (!fn) return sheet;
  const done = new Map();
  for (const a of Object.values(sheet.anims)) {
    a.frames = a.frames.map((f) => { if (f.__post) return f; if (!done.has(f)) { const c = fn(f); c.__post = true; done.set(f, c); } return done.get(f); });
  }
  return sheet;
}

export const buildKevin = () => buildHumanSheet(KEVIN);
export const buildAdair = () => buildHumanSheet(ADAIR);
export const buildDenise = () => postSheet(buildHumanSheet(DENISE), DENISE.post);
export const buildFigure79 = () => buildHumanSheet(FIGURE79);
