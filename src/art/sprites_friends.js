// Danny, Leah, Marcus — the friends. Four distinct silhouettes next to Tess:
//   Danny  — stocky, backwards red cap (brim sticks out behind), midnight-green Starter jacket, ripped
//            jeans, big white sneakers; bounces when idle.
//   Leah   — shorter, square dark bob + round glasses, oversized gray cardigan, plaid skirt, black
//            tights, cherry-red Docs, camcorder; adjusts her glasses; film_<dir> = camera to her eye.
//   Marcus — tall and lean, black beanie, olive M-65 field jacket, headphones round his neck, wheat
//            work boots; small head-bob while he hums.
import { PAL, mix, hexToRgb, rgbToHex } from './palette.js';
import { polyPts } from './sprites_human.js';
import { buildHumanSheet } from './sprites_anims.js';

const HEAD_PARTS = {
  hair: { sep: 1 }, cap: { sep: 1 }, beanie: { sep: 1 },
  skin: { shade: { L: 0, T: -1, R: -1, B: -1 } },
  ear: { shade: false }, eye: { shade: false }, mouth: { shade: false }, glass: { shade: false }, brim: { shade: { L: 0, T: 1, R: 0, B: -1 } },
};
const HEAD_ORDER = ['skin', 'ear', 'hair', 'cap', 'brim', 'beanie', 'eye', 'mouth', 'glass'];
const BASE_LEGEND = {
  H: ['hair', 2], h: ['hair', 1], d: ['hair', 0], L: ['hair', 3], l: ['hair', 4],
  S: ['skin', 2], s: ['skin', 1], K: ['skin', 3], k: ['skin', 0], r: ['skin', 2, 'ear'],
  e: ['eye', 0], E: ['eye', 2], m: ['mouth', 1], M: ['mouth', 0],
};
const line = (P, mat, pts, tone = 2, opts = { sep: 1, shade: false }) =>
  P.part(mat, opts, () => { for (const [x, y] of polyPts(pts)) P.px(x, y, tone); });

// =============================================================================================
// DANNY
// =============================================================================================
const DANNY_M = {
  hair: ['#2a1a10', '#4a3020', '#6e4a30', '#8e6a48', '#b08a62'],
  skin: ['#8a5440', '#bb7d62', '#e0a888', '#f0c6a8', '#fbe2cc'],
  eye: ['#141012', '#2a2220', '#4a3a30', '#6a5444', '#8a7060'],
  mouth: ['#6a2a26', '#94443c', '#b8665a', '#d08a7c', '#e4ac9e'],
  cap: [PAL.blood_d, PAL.red_d, PAL.red, PAL.red_l, '#e06a5a'],
  jacket: ['#08171a', '#0e2b2c', '#15433f', '#226058', '#3a8075'],
  silver: ['#4a5054', '#727a7e', '#9aa3a6', '#c2c8c8', '#e2e6e2'],
  trim: ['#8e8a82', '#b8b4aa', '#e0dcd2', '#efece4', '#faf8f2'],
  jeans: ['#18233a', '#28395a', '#3a527e', '#56729c', '#7a96bc'],
  rip: ['#a89a88', '#c8baa6', '#e2d6c4', '#efe6d8', '#f8f2e8'],
  shoe: ['#6a665e', '#9a958a', '#cdc7b9', '#e6e1d4', '#f6f3ea'],
  sole: ['#4a4842', '#76736a', '#a6a296', '#c6c2b6', '#dedad0'],
};
const DANNY_HEADS = {
  down: { rows: [
    '...ddddd....',
    '..dCCCCCd...',
    '.cCLLCCCCc..',
    '.CLCCCCCCCc.',
    '.CCCChhCCCC.',
    '.cCChHHhCCc.',
    '.hSSSSSSSSh.',
    '.SSeSSSSeSS.',
    'rSSESSSSESSr',
    '.SSSSSSSSSS.',
    '..sSSMmSSs..',
    '...sSSSSs...',
  ] },
  up: { rows: [
    '...cCCCCc...',
    '..cCLLCCCc..',
    '.cCLCCCCCCc.',
    '.CLCCCCCCCCc',
    '.CCCCCCCCCCc',
    '.cCCCCCCCCc.',
    '.bBBBBBBBBb.',
    'rhbBBBBBBbhr',
    '.hhHHHHHHhh.',
    '..hHHHHHHh..',
    '...sSSSSs...',
  ], legend: { B: ['cap', 1, 'brim'], b: ['cap', 0, 'brim'] } },
  left: { rows: [
    '....cCCCc...',
    '...cCLCCCc..',
    '..cCLCCCCCc.',
    '..CLCCCCCCCbb',
    '.hCCCCCCCCbBb',
    '.hSSSShrhh...',
    '.SSeSSSrhh...',
    'SSSSSSSShh...',
    '.SSSSSSsh....',
    '..MmSSss.....',
    '...sSss......',
  ], ox: 0, legend: { B: ['cap', 1, 'brim'], b: ['cap', 0, 'brim'] } },
};
const DANNY_LEGEND = { ...BASE_LEGEND, C: ['cap', 2], c: ['cap', 1], L: ['cap', 3], d: ['cap', 0, 'brim'] };

function dannyTorsoFront(P, g) {
  const { sh, hem, back } = g;
  P.part('jacket', { sep: 1 }, () => {
    P.hl(7, sh, 10, 2);
    P.rect(6, sh + 1, 12, hem - sh, 2);
  });
  // satin sheen streak (upper left), striped knit waistband
  P.vl(8, sh + 2, 3, 3, 'jacket');
  P.hl(6, hem, 12, 3, 'trim'); P.hl(7, hem, 2, 2, 'jacket'); P.hl(15, hem, 2, 2, 'jacket');
  if (!back) {
    // silver raglan yoke + knit collar, snap placket, wing logo on his left chest
    line(P, 'silver', [[7, sh + 1], [9, sh + 3]], 2); line(P, 'silver', [[16, sh + 1], [14, sh + 3]], 2);
    P.hl(10, sh, 4, 3, 'trim'); P.px(10, sh + 1, 2, 'trim'); P.px(13, sh + 1, 2, 'trim');
    P.part('skin', { shade: false }, () => P.hl(11, sh, 2, 1));
    P.vl(12, sh + 2, hem - sh - 2, 1, 'jacket');
    P.hl(14, sh + 4, 2, 3, 'trim'); P.px(15, sh + 3, 3, 'trim');
  } else {
    P.hl(9, sh, 6, 3, 'trim');
    // the EAGLES wing across his back
    P.hl(9, sh + 3, 6, 3, 'silver'); P.hl(8, sh + 4, 3, 2, 'silver'); P.hl(13, sh + 4, 3, 3, 'trim'); P.px(15, sh + 5, 2, 'silver');
  }
}
function dannyTorsoSide(P, g) {
  const { sh, hem, cx } = g;
  const x0 = cx - 5 - g.lean;
  P.part('jacket', { sep: 1 }, () => {
    P.hl(x0 + 1, sh, 8, 2);
    P.rect(x0, sh + 1, 10, hem - sh, 2);
  });
  P.vl(x0 + 2, sh + 2, 3, 3, 'jacket');
  P.hl(x0, hem, 10, 3, 'trim');
  P.hl(x0 + 1, sh, 3, 3, 'trim');
  line(P, 'silver', [[x0 + 5, sh], [x0 + 3, sh + 3]], 2);
  P.vl(x0, sh + 2, hem - sh - 2, 1, 'jacket');
  P.hl(x0 + 1, sh + 4, 2, 3, 'trim');
}
const DANNY = {
  id: 'danny', mats: DANNY_M, legend: DANNY_LEGEND, heads: DANNY_HEADS, headParts: HEAD_PARTS, headOrder: HEAD_ORDER,
  dims: { headY: 3, shY: 15, hipY: 21, hem: 21, ground: 29, shW: 12, legW: 4, legGap: 0, armW: 2, armIn: 1, handY: 22,
    elbowDy: 4, stride: 3, runStride: 5, sideCx: 0 },
  sleeve: { mat: 'jacket', cover: 0.8, cuff: true, cuffMat: 'trim' },
  shoe: {
    mat: 'shoe', h: 3, wider: 1,
    frontDetail(P, x, y0, w, h, L, back, outer) {
      P.hl(x, y0 + h - 1, w, 1, 'sole');
      P.px(x + (outer < 0 ? 1 : w - 2), y0 + 1, 1);
    },
    side: { ox: -3, oy: 0, rows: ['.kkkk.', 'kkKkkk', 'WWWWWW'] },
    legend: (t) => ({ k: ['shoe', t + 1], K: ['shoe', t - 1], W: ['sole', t] }),
    parts: { shoe: { shade: { L: 1, T: 1, R: 0, B: 0 } }, sole: { shade: false } },
  },
  legMat: 'jeans',
  legDetail(P, L) {
    // ripped knees
    if (L.seatedFront || L.seatedBack || L.kneel) return;
    const ky = Math.round((L.top + L.foot) / 2);
    P.px(L.x + 1, ky, 2, 'rip'); P.px(L.x + 2, ky, 3, 'rip'); P.px(L.x + 2, ky + 1, 0, 'rip');
  },
  legDetailSide(P, L, tone) {
    if (tone < 2 || L.seated) return;
    P.px(L.knee[0] - 1, L.knee[1], 2, 'rip'); P.px(L.knee[0] - 1, L.knee[1] + 1, 3, 'rip');
  },
  torsoFront: dannyTorsoFront, torsoSide: dannyTorsoSide,
  idle(dir, X) {
    // he can't stand still: a little bounce on his toes
    const { R, stand } = X;
    const f = [R(stand(dir)), R(stand(dir, { bob: -1, lift: dir === 'left' || dir === 'right' ? [0, 0] : [1, 1] })), R(stand(dir, { bob: 1 }))];
    return X.anim(X.seq(f, [0, 1, 0, 2, 0, 1, 0, 2, 0, 0, 0, 0]), 6);
  },
};

// =============================================================================================
// LEAH
// =============================================================================================
const LEAH_M = {
  hair: ['#060508', '#141016', '#231d24', '#3e3644', '#625a6e'],
  skin: ['#946052', '#c48a72', '#e8b89c', '#f4d4bc', '#fdeadc'],
  eye: ['#0e0c10', '#1e1a20', '#3a3238', '#5a5056', '#7a7076'],
  mouth: ['#743a3a', '#9c5450', '#bc766c', '#d4988c', '#e8b8aa'],
  glass: ['#3a3a42', '#6a6c78', '#9aa2ae', '#dce6ee', '#ffffff'],
  cardigan: ['#232227', '#3a393f', '#56545b', '#77747a', '#98949a'],
  blouse: [PAL.cream_d, mix(PAL.cream_d, PAL.cream, 0.5), PAL.cream, PAL.cream_l, '#efe6c6'],
  skirt: ['#141822', '#202a36', '#2c3a44', '#3e4e52', '#566460'],
  plaid: ['#3a1416', '#5a2020', '#7a3a2a', '#9a5a3a', '#b87a4c'],
  tights: ['#0b0a0e', '#141218', '#1e1b23', '#2b2731', '#3b3642'],
  docs: [PAL.velvet_d, PAL.red_d, PAL.red, PAL.red_l, '#e06a5e'],
  sole: ['#0a0808', '#141010', '#1e1818', '#2a2222', '#3a3030'],
  stitch: ['#5a4a1c', '#8a7430', '#b49a44', '#d4bc62', '#ecd88a'],
  cam: ['#0c0c0e', '#18181c', '#26262c', '#3a3a42', '#56565e'],
  led: ['#5a0a06', '#a01810', '#ff2a1a', '#ff7a5a', '#ffc8b0'],
};
// glasses: G rim catching light, W glint
const LEAH_LEGEND = { ...BASE_LEGEND, G: ['glass', 2], W: ['glass', 4], g: ['glass', 1] };
const LEAH_HEADS = {
  down: { rows: [
    '...dhHHhd...',
    '..hHLLHHHh..',
    '.hHLLHHHHHh.',
    '.HLHHHHHHHH.',
    '.HHHHHHHHHHh',
    '.HHhhhhhhHHh',
    '.HHgggSgggHh',
    '.HhSeWSSeWhh',
    '.HhSSSSSSShh',
    '.HHsSSmSShHh',
    '.hdHsSSsHdh.',
  ] },
  up: { rows: [
    '...dhHHhd...',
    '..hHLLHHHh..',
    '.hHLLHHHHHh.',
    '.HLHHHHHHHH.',
    '.HHHHHHHHHHh',
    '.HHHHHHHHHHh',
    '.HHHHHHHHHHh',
    '.HHHHHHHHHHh',
    '.HHhHHHHhHHh',
    '.dHHHHHHHHd.',
    '..ddhhhhdd..',
  ] },
  left: { rows: [
    '....dhHHhd..',
    '...hHLLHHHh.',
    '..hHLHHHHHHh',
    '..HLHHHHHHHH',
    '.hHHHHHHHHHH',
    '.HhhhhHHHHHH',
    '.gggSShHHHHh',
    '.WeSSShHHHHh',
    'SSSSSshHHHHh',
    '..mSsshHHHH.',
    '...sss.dhhd.',
  ] },
};

function leahTorsoFront(P, g) {
  const { sh, hem, back } = g;
  // skirt first (under the cardigan's hem), swaying a pixel with the walk
  const sway = g.o.phase === 0 ? 1 : g.o.phase === 2 ? -1 : 0;
  const sk = g.hip + 3;
  if (!g.seated || g.seated === 'down') {
    P.part('skirt', { sep: 1 }, () => {
      P.rect(7, g.hip, 10, sk - g.hip, 2);
      P.hl(6 + sway, sk, 12, 2);
    });
    // plaid: crossing lines
    for (let x = 7; x <= 16; x += 3) P.vl(x + (sway > 0 ? 1 : 0), g.hip + 1, sk - g.hip, 1, 'plaid');
    P.hl(7, g.hip + 2, 10, 1, 'plaid');
  } else {
    P.part('skirt', { sep: 1 }, () => P.rect(7, g.hip, 10, 2, 1));
  }
  // oversized cardigan: long, shapeless, past the hips
  P.part('cardigan', { sep: 1 }, () => {
    P.hl(8, sh, 8, 2);
    P.rect(7, sh + 1, 10, hem - sh, 2);
    P.hl(6, hem - 1, 12, 2);
  });
  P.hl(6, hem, 12, 1, 'cardigan');
  if (!back) {
    P.part('blouse', { shade: { L: 1, T: 0, R: -1, B: 0 } }, () => { P.rect(11, sh + 1, 2, hem - sh - 3, 2); P.px(10, sh, 3); P.px(13, sh, 3); });
    P.hl(11, sh, 2, 1, 'blouse');
    P.px(10, sh + 3, 3, 'cardigan'); P.px(13, sh + 4, 3, 'cardigan'); // buttons on the edge
    P.vl(10, sh + 1, hem - sh - 1, 1, 'cardigan'); P.vl(13, sh + 1, hem - sh - 1, 1, 'cardigan');
    // knit ribbing at the hem
    for (let x = 7; x < 17; x += 2) P.px(x, hem, 1, 'cardigan');
  } else {
    P.hl(9, sh, 6, 1, 'cardigan');
    for (let x = 7; x < 17; x += 2) P.px(x, hem, 1, 'cardigan');
  }
}
function leahTorsoSide(P, g) {
  const { sh, hem, cx } = g;
  const x0 = cx - 4 - g.lean;
  const sk = g.hip + 3;
  if (!g.seated) {
    const flare = g.o.run ? 1 : 0;
    P.part('skirt', { sep: 1 }, () => { P.rect(x0, g.hip, 8, sk - g.hip, 2); P.hl(x0 - 1 - flare, sk, 10 + flare, 2); });
    P.vl(x0 + 2, g.hip + 1, sk - g.hip, 1, 'plaid'); P.vl(x0 + 5, g.hip + 1, sk - g.hip, 1, 'plaid'); P.hl(x0, g.hip + 2, 8, 1, 'plaid');
  } else {
    P.part('skirt', { sep: 1 }, () => { P.rect(x0 - 3, g.hip - 1, 11, 3, 2); });
    P.vl(x0, g.hip, 2, 1, 'plaid'); P.vl(x0 + 4, g.hip, 2, 1, 'plaid');
  }
  P.part('cardigan', { sep: 1 }, () => {
    P.hl(x0 + 1, sh, 6, 2);
    P.rect(x0, sh + 1, 8, hem - sh, 2);
  });
  P.part('blouse', { shade: false }, () => P.vl(x0, sh + 1, 3, 2));
  for (let x = x0; x < x0 + 8; x += 2) P.px(x, hem, 1, 'cardigan');
}

/** Camcorder in her right hand (at her side), or raised to her eye when filming. */
function camAtSide(P, g) {
  if (g.noCam) return;
  if (g.view === 'front') {
    const a = g.arm('R');
    const [hx, hy] = a.hd;
    if (!g.back) {
      P.part('cam', { sep: 0 }, () => { P.rect(hx - 1, hy + 1, 3, 2, 2); });
      P.px(hx - 1, hy + 1, 4, 'cam');
    } else P.part('cam', { sep: 0, under: true }, () => P.rect(hx, hy - 1, 3, 2, 1));
  }
}
function camSide(P, g, which) {
  if (g.noCam) return;
  const a = g.arms[which];
  const [hx, hy] = a.hd;
  const t = which === 'far' ? 1 : 2;
  P.part('cam', { sep: 0, shade: { L: 0, T: 1, R: 0, B: -1 } }, () => P.rect(hx - 2, hy + 1, 4, 2, t));
  P.px(hx - 2, hy + 2, 0, 'cam');
}

const LEAH = {
  id: 'leah', mats: LEAH_M, legend: LEAH_LEGEND, heads: LEAH_HEADS, headParts: HEAD_PARTS, headOrder: HEAD_ORDER,
  dims: { headY: 4, shY: 15, hipY: 21, hem: 21, ground: 29, shW: 10, legW: 2, legGap: 4, armW: 2, armIn: 1, handY: 21,
    elbowDy: 4, stride: 3, runStride: 4 },
  sleeve: { mat: 'cardigan', cover: 0.9, cuff: true },
  legMat: 'tights',
  shoe: {
    mat: 'docs', h: 4, wider: 1, soleMat: 'sole',
    frontDetail(P, x, y0, w, h, L, back, outer) {
      P.hl(x, y0 + h - 1, w, 2, 'sole');
      P.px(x + (outer < 0 ? 0 : w - 1), y0 + h - 2, 2, 'stitch');
      P.px(x + 1, y0 + 1, 3); // toe shine
    },
    side: { ox: -3, oy: 0, rows: ['..kkk.', '.kkkkk', 'kKkkkk', 'yWWWWy'] },
    legend: (t) => ({ k: ['docs', t], K: ['docs', t + 1], W: ['sole', t], y: ['stitch', t] }),
    parts: { docs: { shade: { L: 1, T: 1, R: 0, B: 0 } }, sole: { shade: false }, stitch: { shade: false } },
  },
  torsoFront: leahTorsoFront, torsoSide: leahTorsoSide,
  orderFront: (g) => ['legs', 'torso', 'arms', 'head', 'cam', 'over'],
  layers: { cam: camAtSide },
  afterFarArm(P, g) { if (g.far === 'R') camSide(P, g, 'far'); },
  afterNearArm(P, g) { if (g.near === 'R') camSide(P, g, 'near'); },
};

/** film_<dir>: the camcorder up at her right eye, red LED blinking. */
function filmGeom(X, dir, led) {
  const g = X.stand(dir);
  g.noCam = true; g.film = { led };
  if (g.view === 'front') {
    for (const a of g.arms) {
      const inw = a.screen === 0 ? 1 : -1;
      a.el = [a.sh[0] - inw, a.sh[1] + 4];
      a.hd = [a.sh[0] + inw * 2, g.head.y + 7];
      a.cover = 1; a.late = true;
    }
    g.order = g.back ? ['legs', 'torso', 'arms', 'head', 'lateArms', 'film'] : ['legs', 'torso', 'arms', 'head', 'film', 'lateArms'];
  } else {
    const n = g.arms.near, f = g.arms.far;
    n.el = [n.sh[0] + 1, n.sh[1] + 4]; n.hd = [n.sh[0] - 3, g.head.y + 7]; n.cover = 1;
    f.el = [f.sh[0] - 1, f.sh[1] + 4]; f.hd = [f.sh[0] - 4, g.head.y + 8]; f.cover = 1;
    g.order = ['farArm', 'farLeg', 'nearLeg', 'torso', 'head', 'film', 'nearArm'];
  }
  return g;
}
LEAH.layers.film = (P, g) => {
  const led = g.film.led;
  if (g.view === 'front') {
    const y = g.head.y + 5;
    if (!g.back) {
      // the camera covers her right eye (screen-left); lens toward us
      P.part('cam', { sep: 1 }, () => { P.rect(7, y, 6, 4, 2); P.rect(8, y - 1, 3, 1, 2); });
      P.part('glass', { shade: false }, () => { P.rect(8, y + 1, 2, 2, 0); P.px(8, y + 1, 3); });
      if (led) P.px(12, y, 2, 'led');
    } else {
      P.part('cam', { sep: 0, under: true }, () => P.rect(13, y + 1, 3, 2, 1));
    }
  } else {
    const y = g.head.y + 6, x = 12 - 6 + 1 - g.lean;
    P.part('cam', { sep: 1, shade: { L: 0, T: 1, R: 0, B: -1 } }, () => { P.rect(x - 4, y, 6, 3, 2); P.rect(x - 2, y - 1, 3, 1, 2); });
    P.px(x - 5, y + 1, 1, 'cam'); P.px(x - 4, y + 1, 3, 'glass');
    if (led) P.px(x, y - 1, 2, 'led');
  }
};
LEAH.idle = (dir, X) => {
  const { R, stand } = X;
  const base = R(stand(dir)), br = R(stand(dir, { breath: 1 }));
  // pushes her glasses up her nose with a knuckle (right hand, camera in the left meanwhile)
  const fix = (k) => {
    const g = stand(dir);
    g.noCam = true;
    if (g.view === 'front') {
      const a = g.arm(g.back ? 'R' : 'L');
      const inw = a.screen === 0 ? 1 : -1;
      a.el = [a.sh[0] - inw, a.sh[1] + 4];
      a.hd = k === 1 ? [a.sh[0] + inw * 2, a.sh[1] + 1] : [12 - (inw > 0 ? 1 : 0) - (inw > 0 ? 0 : 0), g.head.y + 6];
      a.late = true; a.cover = 1;
      g.order = ['legs', 'torso', 'arms', 'head', 'lateArms'];
    } else {
      const a = g.arms.near;
      a.el = [a.sh[0] + 1, a.sh[1] + 4];
      a.hd = k === 1 ? [a.sh[0] - 2, a.sh[1] + 1] : [a.sh[0] - 5, g.head.y + 6];
      a.cover = 1;
    }
    return g;
  };
  const f = [base, br, R(fix(1)), R(fix(2))];
  return X.anim(X.seq(f, [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 2, 3, 3, 3, 2, 0, 1, 1, 1]), 4);
};
LEAH.specials = (anims, X) => {
  for (const d of ['down', 'up', 'left', 'right']) anims[`film_${d}`] = X.anim([X.R(filmGeom(X, d, true)), X.R(filmGeom(X, d, false))], 2);
};

// =============================================================================================
// MARCUS
// =============================================================================================
const MARCUS_M = {
  skin: [PAL.dskin_dd, '#3e2416', PAL.dskin, PAL.dskin_l, '#b2805a'],
  eye: ['#070404', '#120a08', '#24160e', '#3a2416', '#5a3a26'],
  white: ['#6e625a', '#a0948a', '#cfc4b8', '#e6dcd0', '#f6efe4'],
  mouth: ['#1e0e0a', '#341a12', '#4e2a1c', '#6a3a28', '#865038'],
  beanie: ['#08080b', '#121216', '#1c1c22', '#2c2c34', '#40404a'],
  jacket: ['#1c1d0f', '#30311a', '#484826', '#626034', '#7e7c46'],
  shirt: ['#0e0e12', '#18181e', '#232329', '#30303a', '#3e3e4a'],
  phones: ['#060608', '#101014', '#1c1c22', '#5a5a64', '#a0a0aa'],
  pants: ['#16161a', '#222329', '#30313a', '#41424c', '#54555f'],
  boot: ['#3a250e', '#5e4019', '#8a6228', '#ad823c', '#c89f58'],
  sole: ['#1a120a', '#2a1e12', '#3e2e1c', '#523e28', '#6a5236'],
};
const MARCUS_LEGEND = { ...BASE_LEGEND, B: ['beanie', 2], b: ['beanie', 1], c: ['beanie', 0], L: ['beanie', 3], w: ['white', 2] };
const MARCUS_HEADS = {
  down: { rows: [
    '...bBBBBb...',
    '..bBLLBBBb..',
    '.bBLBBBBBBb.',
    '.BLBBBBBBBBb',
    '.bBcBcBcBcB.',
    '.cBcBcBcBcB.',
    '.sSSSSSSSSs.',
    '.SSweSSewSS.',
    'rSSSSSSSSSSr',
    '.SSSSkkSSSS.',
    '..sSSMMSSs..',
    '...sSSSSs...',
  ] },
  up: { rows: [
    '...bBBBBb...',
    '..bBLLBBBb..',
    '.bBLBBBBBBb.',
    '.BLBBBBBBBBb',
    '.BBBBBBBBBBb',
    '.bBcBcBcBcB.',
    '.cBcBcBcBcB.',
    'rsSSSSSSSSsr',
    '.sSSSSSSSSs.',
    '..sSSSSSSs..',
    '...sSSSSs...',
  ] },
  left: { rows: [
    '....bBBBb...',
    '...bBLBBBb..',
    '..bBLBBBBBb.',
    '..BLBBBBBBBb',
    '.bBcBcBcBcB.',
    '.cBcBcBcBcB.',
    '.SSSSSSSs...',
    '.SewSSSrs...',
    'SSSSSSSrs...',
    '.SSSSSSss...',
    '..MSSsss....',
    '...sSss.....',
  ] },
};

function marcusTorsoFront(P, g) {
  const { sh, hem, back } = g;
  P.part('jacket', { sep: 1 }, () => {
    P.hl(8, sh, 8, 2);
    P.rect(7, sh + 1, 10, hem - sh, 2);
  });
  P.hl(7, hem, 10, 1, 'jacket');
  if (!back) {
    // half-zipped over a dark shirt; four flap pockets; epaulettes
    P.part('shirt', { shade: false }, () => { P.rect(11, sh, 2, 3, 2); P.px(10, sh, 2); P.px(13, sh, 2); });
    P.vl(12, sh + 3, hem - sh - 3, 1, 'jacket');
    P.hl(8, sh + 2, 3, 1, 'jacket'); P.hl(13, sh + 2, 3, 1, 'jacket');
    P.hl(8, hem - 3, 3, 1, 'jacket'); P.hl(13, hem - 3, 3, 1, 'jacket');
    P.px(9, sh + 3, 3, 'jacket'); P.px(14, sh + 3, 3, 'jacket');
    P.hl(8, sh, 2, 3, 'jacket'); P.hl(14, sh, 2, 3, 'jacket');
  } else {
    P.hl(9, sh, 6, 1, 'jacket');
    P.hl(8, sh + 4, 8, 1, 'jacket');
    P.vl(12, sh + 5, hem - sh - 5, 1, 'jacket');
  }
}
function marcusTorsoSide(P, g) {
  const { sh, hem, cx } = g;
  const x0 = cx - 4 - g.lean;
  P.part('jacket', { sep: 1 }, () => {
    P.hl(x0 + 1, sh, 6, 2);
    P.rect(x0, sh + 1, 8, hem - sh, 2);
  });
  P.hl(x0, hem, 8, 1, 'jacket');
  P.hl(x0, sh + 2, 3, 1, 'jacket'); P.hl(x0, hem - 3, 3, 1, 'jacket');
  P.hl(x0 + 2, sh, 3, 3, 'jacket');
  P.part('shirt', { shade: false }, () => P.vl(x0, sh, 2, 2));
}
/** Headphones round his neck: band over the collar, cups on the collarbones. */
function phones(P, g) {
  const y = g.sh;
  if (g.view === 'front') {
    if (!g.back) {
      P.part('phones', { sep: 1, shade: false }, () => { P.rect(9, y, 2, 2, 2); P.rect(13, y, 2, 2, 2); P.hl(11, y + 1, 2, 1); });
      P.px(9, y, 4, 'phones'); P.px(14, y + 1, 3, 'phones');
    } else {
      P.part('phones', { sep: 1, shade: false }, () => { P.hl(10, y - 1, 4, 2); P.px(9, y, 2); P.px(14, y, 2); });
    }
  } else {
    const x0 = g.cx - 4 - g.lean;
    P.part('phones', { sep: 1, shade: false }, () => { P.rect(x0 + 1, y, 2, 2, 2); P.hl(x0 + 3, y - 1, 3, 1); });
    P.px(x0 + 1, y, 4, 'phones');
  }
}
const MARCUS = {
  id: 'marcus', mats: MARCUS_M, legend: MARCUS_LEGEND, heads: MARCUS_HEADS, headParts: HEAD_PARTS, headOrder: HEAD_ORDER,
  skinMat: 'skin', darkSkin: true,
  dims: { headY: 1, shY: 13, hipY: 20, hem: 20, ground: 29, shW: 10, legW: 3, legGap: 2, armW: 2, armIn: 1, handY: 22,
    elbowDy: 5, stride: 4, runStride: 6 },
  sleeve: { mat: 'jacket', cover: 1, cuff: false },
  legMat: 'pants',
  shoe: {
    mat: 'boot', h: 4, wider: 1, soleMat: 'sole',
    frontDetail(P, x, y0, w, h, L, back) {
      P.hl(x, y0 + h - 1, w, 1, 'sole');
      P.hl(x, y0, w, 1, 'boot'); // padded collar
      if (!back) P.px(x + 1, y0 + 1, 3); // laces
    },
    side: { ox: -3, oy: 0, rows: ['..kKk.', '.kkkkk', 'kkkkkk', 'WWWWWW'] },
    legend: (t) => ({ k: ['boot', t], K: ['boot', t - 1], W: ['sole', t] }),
    parts: { boot: { shade: { L: 1, T: 1, R: 0, B: 0 } }, sole: { shade: false } },
  },
  torsoFront: marcusTorsoFront, torsoSide: marcusTorsoSide,
  orderFront: () => ['legs', 'torso', 'arms', 'phones', 'head', 'over'],
  orderSide: () => ['farArm', 'farLeg', 'nearLeg', 'torso', 'phones', 'head', 'nearArm', 'over'],
  layers: { phones },
  idle(dir, X) {
    // hands in his jacket pockets, a small head-bob while he hums
    const { R, stand } = X;
    const pk = (o) => {
      const g = stand(dir, o);
      if (g.view === 'front') for (const a of g.arms) { a.hd = [a.sh[0] + (a.screen === 0 ? 1 : -1), g.hem - 2]; a.noHand = true; }
      else { g.arms.near.el = [g.arms.near.sh[0] + 1, g.arms.near.sh[1] + 4]; g.arms.near.hd = [g.arms.near.sh[0] - 1, g.hem - 2]; g.arms.near.noHand = true; }
      return g;
    };
    const f = [R(pk()), R(pk({ headDy: 1 })), R(pk({ breath: 1 })), R(pk({ breath: 1, headDy: 1 }))];
    return X.anim(X.seq(f, [0, 0, 1, 0, 0, 1, 2, 2, 3, 2, 0, 1, 0, 0, 0, 0]), 4);
  },
};

// =============================================================================================
// ENTRANCED ("enrolled"): pale, desaturated, slack; sit_up = the writing loop, idle_down = slow sway
// =============================================================================================
function drain(hex, skin, dark) {
  const [r, g, b] = hexToRgb(skin ? mix(hex, dark ? '#9a8a80' : '#d4cfc8', dark ? 0.22 : 0.45) : hex);
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  const k = skin ? (dark ? 0.5 : 0.22) : 0.3;
  const R = l + (r - l) * k, G = l + (g - l) * k, B = l + (b - l) * k;
  // a faint cold cast in the shadows, faint amber in the lights (the husk is coming)
  const t = l / 255;
  return rgbToHex(R * 0.96 + (t > 0.5 ? 8 : -2), G * 0.97 + (t > 0.5 ? 4 : 0), B + (t > 0.5 ? -6 : 6));
}
function entranced(C, writeLoop) {
  const mats = {};
  for (const [k, m] of Object.entries(C.mats)) mats[k] = m.map((c) => drain(c, k === 'skin', !!C.darkSkin));
  if (mats.led) mats.led = C.mats.led;
  const E = { ...C, id: `${C.id}_e`, mats, run: false, walkFps: 4 };
  const slack = (g) => { g.head.y += 1; if (g.view === 'front') for (const a of g.arms) if (!a.noHand && !g.seated) a.hd = [a.hd[0], a.hd[1] + 1]; return g; };
  E.adjust = (g) => slack(C.adjust ? C.adjust(g) || g : g);
  E.idle = (dir, X) => {
    const { R, stand } = X;
    if (dir !== 'down') return X.anim([R(stand(dir)), R(stand(dir, { breath: 1 }))], 1);
    // a slow sway, the head lolling a beat behind the body
    const f = [R(stand(dir)), R(stand(dir, { dx: 1, headDx: 0 })), R(stand(dir, { dx: 1, headDx: 1 })), R(stand(dir, { dx: -1, headDx: 0 })), R(stand(dir, { dx: -1, headDx: -1 }))];
    return X.anim(X.seq(f, [0, 1, 2, 2, 1, 0, 3, 4, 4, 3]), 2.5);
  };
  E.specials = (anims, X) => { anims.sit_up = writeLoop(X); };
  E.layers = { ...(C.layers || {}), cam: () => {} };
  return E;
}
/** Writing loop at a desk (back view): the writing arm's elbow works, the head is bowed. */
function writing(X, { other = null, frames = [0, 1, 2, 1] } = {}) {
  const mk = (k, j) => {
    const g = X.sit('up', { headDy: 1 });
    const a = g.arm('R');
    a.el = [a.sh[0] + 1 + (k === 2 ? 1 : 0), a.sh[1] + 3 - (k === 1 ? 1 : 0)];
    a.hd = [a.sh[0] - 2 + k, a.sh[1] + 2];
    if (k) g.head.dx = 0;
    if (other) other(g, j);
    return g;
  };
  return mk;
}
function dannyWrite(X) {
  const mk = writing(X);
  const f = [0, 1, 2].map((k) => X.R(mk(k, 0)));
  return X.anim(X.seq(f, [0, 1, 2, 1, 0, 1, 2, 1, 0, 0]), 5);
}
function leahWrite(X) {
  // writes her own name on a card, then slides it onto the pile at her left
  const mk = writing(X, {
    other: (g, j) => { if (j) { const a = g.arm('L'); a.el = [a.sh[0] - 2, a.sh[1] + 2]; a.hd = [a.sh[0] - 4, a.sh[1] + 1]; a.noHand = false; } },
  });
  const f = [X.R(mk(0, 0)), X.R(mk(1, 0)), X.R(mk(2, 0)), X.R(mk(0, 1))];
  return X.anim(X.seq(f, [0, 1, 2, 1, 0, 1, 2, 1, 0, 3, 3, 0]), 5);
}
function marcusHold(X) {
  // his left hand held out to the side — holding the husk's hand in the next seat
  const mk = (k) => {
    const g = X.sit('up', { headDy: 1, headDx: k === 2 ? -1 : 0 });
    const a = g.arm('L');
    a.el = [a.sh[0] - 3, a.sh[1] + 3];
    a.hd = [a.sh[0] - 6, a.sh[1] + 5 + (k === 1 ? 1 : 0)];
    a.noHand = false; a.cover = 0.6;
    return g;
  };
  const f = [X.R(mk(0)), X.R(mk(1)), X.R(mk(2))];
  return X.anim(X.seq(f, [0, 0, 0, 1, 0, 0, 0, 0, 2, 2, 2, 0]), 3);
}

export const FRIENDS = { danny: DANNY, leah: LEAH, marcus: MARCUS };
export const buildDannyE = () => buildHumanSheet(entranced(DANNY, dannyWrite));
export const buildLeahE = () => buildHumanSheet(entranced({ ...LEAH, specials: null }, leahWrite));
export const buildMarcusE = () => buildHumanSheet(entranced(MARCUS, marcusHold));
export const buildDanny = () => buildHumanSheet(DANNY);
export const buildLeah = () => buildHumanSheet(LEAH);
export const buildMarcus = () => buildHumanSheet(MARCUS);
