// Tess Dolan — the protagonist sprite. Must read at 1×: copper hair tucked behind her LEFT ear,
// pale face, oversized light-wash denim jacket (sleeves pushed up), black tee, black jeans, black
// high-tops with a white side stripe + white soles, olive bag strap, black Maglite in her right hand.
import { PAL, mix } from './palette.js';
import { polyPts, rotateFrame, renderFrame } from './sprites_human.js';
import { buildHumanSheet } from './sprites_anims.js';

// ---- materials (5-step ramps, dark → light; base tone 2) ------------------------------------------
export const M = {
  hair: [PAL.hair_r_dd, PAL.hair_r_d, mix(PAL.hair_r, PAL.hair_r_l, 0.35), PAL.hair_r_l, PAL.hair_r_ll],
  skin: ['#9a604c', '#c88a6c', '#ebbd9e', '#f6d8c0', '#fff0e2'],
  eye: ['#101414', '#22302a', '#3e5a4a', '#5e7e6a', '#8aa892'],
  freckle: ['#b8765a', '#c98a6c', '#d99c7e', '#e4ae90', '#eec0a4'],
  mouth: ['#7a4038', '#a2584c', '#c27a6a', '#d8988a', '#e8b4a6'],
  jacket: [PAL.denim_d, mix(PAL.denim, PAL.denim_d, 0.25), PAL.denim_l, PAL.denim_ll, '#d2dfec'],
  tee: ['#0e0e12', '#18181e', '#222229', '#30303a', '#3e3e4a'],
  pants: ['#14151c', '#1f2029', '#2b2d38', '#3b3e4c', '#4d5162'],
  shoe: ['#0c0c10', '#16161b', '#202026', '#2e2e36', '#40404a'],
  sole: ['#8a857c', '#b0aa9e', '#dcd6c8', '#eee8dc', '#faf6ee'],
  strap: ['#202110', '#36371b', '#4f4f27', '#6a693a', '#86844f'],
  torch: ['#060608', '#101014', '#1c1c22', '#383842', '#6c6c78'],
  lens: ['#8a8470', '#c8c0a0', '#efe6c6', '#fff8e0', '#ffffff'],
};

// ---- head templates ----------------------------------------------------------------------------
// H/h/d/L/l hair (2/1/0/3/4) · S/s/K skin (2/1/3) · e eye · f freckle · m mouth · r ear
export const LEGEND = {
  H: ['hair', 2], h: ['hair', 1], d: ['hair', 0], L: ['hair', 3], l: ['hair', 4],
  S: ['skin', 2], s: ['skin', 1], K: ['skin', 3], k: ['skin', 0], r: ['skin', 2, 'ear'],
  e: ['eye', 0], E: ['eye', 2], f: ['freckle', 2], m: ['mouth', 1],
};
export const HEAD_PARTS = {
  hair: { sep: 1 },
  skin: { shade: { L: 0, T: -1, R: -1, B: -1 } },
  ear: { shade: false },
  eye: { shade: false }, freckle: { shade: false }, mouth: { shade: false },
};
// head draw order: skin first, then hair over it (bangs cast a 1-px shadow), then the features
export const HEAD_ORDER = ['skin', 'ear', 'hair', 'eye', 'freckle', 'mouth'];

const HEADS = {
  // facing the viewer: her LEFT (screen-right) side tucked behind the ear; right side hangs loose
  down: { rows: [
    '....hH.Hh...',
    '..hHHLHHHh..',
    '.hHLLLLHHHh.',
    '.HLLHHHHHHHh',
    'hHLHHHHHhHHh',
    'hHHhSSShSShh',
    'HHhSeSSSSeSr',
    'HHhSESSSSESr',
    'HhHSfSSSSfs.',
    'hHhsSSmSSs..',
    'hHh.sSSs....',
    '.hH.........',
    '.h..........',
  ] },
  up: { rows: [
    '....hH.Hh...',
    '..hHHLHHHh..',
    '.hHLLLLHHHh.',
    '.HLLHHHHHHHh',
    '.HLHHHHHHHHh',
    'rhHHHHHHHHHH',
    'rhHHHHHHHHHH',
    '.hHHHhHHHHhH',
    '.hHHHhHHHHhH',
    '..hHHhHHHhHh',
    '..hHHhHHHhHH',
    '...hHhHHhHHh',
    '....h.hH.hh.',
  ] },
  // profile, facing left — her LEFT side: ear visible, hair swept back behind it
  left: { rows: [
    '.....hH.Hh..',
    '...hHHLHHHh.',
    '..hHLLLHHHHh',
    '..HLLHHHHHHH',
    '.hHHHHhHHHHH',
    '.HHSSSSShHHH',
    '.SSeSSSrhHHH',
    'SSSSSSSrhHHH',
    '.SSfSSshHHHh',
    '..mSSsshHHh.',
    '...sss..hHh.',
    '.........h..',
  ] },
  // profile drawn canonical (mirrored at write) — her RIGHT side: loose hair over the ear and cheek
  right: { rows: [
    '.....hH.Hh..',
    '...hHHLHHHh.',
    '..hHLLLHHHHh',
    '..HLLHHHHHHH',
    '.hHHHHHHHHHH',
    '.HHSSShHHHHH',
    '.SSeSShHHHHH',
    'SSSSSShHHHHh',
    '.SSfSshHHHHh',
    '..mSshHHHhH.',
    '...sshHHhHh.',
    '.....hHhHh..',
    '.....hH.h...',
  ] },
};

const D = {
  headY: 3, shY: 14, hipY: 20, hem: 20, ground: 29,
  shW: 10, legW: 3, legGap: 2, armW: 2, armIn: 1, handY: 21, elbowDy: 4, swingDy: 1, swingIn: 0,
  sideCx: 0, shDx: 0, stride: 3, runStride: 5,
};

// ---- shoes: black high-tops, white jazz stripe, white soles ------------------------------------
const SHOE = {
  mat: 'shoe', h: 4, wider: 1,
  frontDetail(P, x, y0, w, h, L, back, outer) {
    const lifted = L.lift > 0 && L.toeDown;
    const sy = y0 + (lifted ? h - 2 : h - 1);
    P.hl(x, sy, w, 2, 'sole');
    if (lifted && back) P.hl(x, sy - 1, w, 3, 'sole');               // heel up: we see the sole
    const ox = outer < 0 ? x : x + w - 1;
    P.px(ox, sy - 1, 3, 'sole');                                      // side stripe hint
    if (!back) P.px(x + (outer < 0 ? w - 2 : 1), sy - 1, 1, 'sole');  // toe-cap seam
    P.px(x + (outer < 0 ? 1 : w - 2), y0, 3);                         // ankle collar highlight
  },
  side: { ox: -3, oy: 0, rows: [
    '..kkk.',
    '.kkwwk',
    'kwwkkk',
    'WWWWWW',
  ] },
  legend: (t) => ({ k: ['shoe', t], w: ['sole', t + 1], W: ['sole', t] }),
  parts: { shoe: { shade: { L: 1, T: 1, R: 0, B: 0 } }, sole: { shade: false } },
};

// ---- outfit -----------------------------------------------------------------------------------------
function torsoFront(P, g) {
  const { sh, hem, back } = g;
  P.part('jacket', { sep: 1 }, () => {
    P.hl(8, sh, 8, 2);
    P.rect(7, sh + 1, 10, hem - sh, 2);
    P.hl(6, hem - 1, 12, 2); P.hl(6, hem, 12, 1);       // oversized: flares at the hem
  });
  if (!back) {
    P.part('tee', { sep: 0, shade: { L: 0, T: 0, R: 0, B: 0 } }, () => {
      P.rect(11, sh + 1, 2, hem - sh - 1, 2);
      P.px(10, sh + 1, 2); P.px(13, sh + 1, 2);
    });
    // neck in the collar's shadow
    P.part('skin', { shade: false }, () => P.hl(11, sh, 2, 1));
    // collar + lapels (lighter, folded), pocket flaps, waistband
    P.px(9, sh, 4, 'jacket'); P.px(10, sh, 3, 'jacket'); P.px(13, sh, 3, 'jacket'); P.px(14, sh, 4, 'jacket');
    P.px(10, sh + 2, 3, 'jacket'); P.px(13, sh + 2, 3, 'jacket');
    P.hl(8, sh + 3, 2, 1, 'jacket'); P.hl(14, sh + 3, 2, 1, 'jacket');
    P.hl(7, hem, 10, 1, 'jacket');
    // bag strap: her right shoulder (screen-left) → left hip (screen-right)
    P.part('strap', { sep: 1, shade: false }, () => {
      for (const [x, y] of polyPts([[9, sh + 1], [15, hem - 1]])) P.px(x, y, 2);
    });
  } else {
    P.hl(8, sh + 3, 8, 1, 'jacket');                         // back yoke seam
    P.vl(10, sh + 4, hem - sh - 4, 1, 'jacket'); P.vl(13, sh + 4, hem - sh - 4, 1, 'jacket');
    P.hl(7, hem, 10, 1, 'jacket');
    P.hl(9, sh, 6, 3, 'jacket');                              // collar
    P.part('strap', { sep: 1, shade: false }, () => {
      for (const [x, y] of polyPts([[14, sh + 1], [8, hem - 1]])) P.px(x, y, 2);
    });
  }
}

/** Bag on her LEFT hip: screen-right facing down, screen-left facing up. */
function bagFront(P, g) {
  const x = g.back ? 5 : 16, y = g.hem - 2;
  P.part('strap', { sep: 1 }, () => { P.rect(x, y, 3, 4, 2); P.hl(x, y, 3, 3); });
}

function torsoSide(P, g) {
  const { sh, hem, cx } = g;
  const l = g.lean;
  const x0 = cx - 4 - l;
  P.part('jacket', { sep: 1 }, () => {
    P.hl(x0 + 1, sh, 6, 2);
    P.rect(x0, sh + 1, 8, hem - sh - 1, 2);
    P.hl(x0 + (l ? 1 : 0), hem - 1, 9, 2); P.hl(x0 + (l ? 1 : 0), hem, 9, 2);
  });
  // open front: a sliver of black tee at the chest
  P.part('tee', { shade: false }, () => P.vl(x0, sh + 2, hem - sh - 4, 2));
  P.px(x0 + 1, sh, 4, 'jacket'); P.px(x0 + 2, sh, 3, 'jacket'); P.px(x0 + 1, sh + 1, 3, 'jacket');
  P.hl(x0 + 1, hem, 8, 1, 'jacket');
  // strap: facing left the near side is her left → strap comes over the far shoulder to the near hip
  if (g.near === 'L') {
    P.part('strap', { sep: 1, shade: false }, () => { for (const [x, y] of polyPts([[x0 + 1, sh + 1], [x0 + 5, hem - 2]])) P.px(x, y, 2); });
  } else {
    P.part('strap', { sep: 1, shade: false }, () => { for (const [x, y] of polyPts([[x0 + 5, sh], [x0 + 1, sh + 5]])) P.px(x, y, 2); });
  }
}

function bagSide(P, g) {
  const x0 = g.cx - 4 - g.lean;
  if (g.near === 'L') P.part('strap', { sep: 1 }, () => { P.rect(x0 + 4, g.hem - 2, 4, 4, 2); P.hl(x0 + 4, g.hem - 2, 4, 3); });
  else P.part('strap', { sep: 0, under: true }, () => P.rect(x0 + 7, g.hem - 1, 2, 3, 1));
}

/** Maglite: in the right hand, aimed down-forward where she faces (the beam itself is lighting's). */
function torchFront(P, g) {
  const a = g.arm('R');
  if (!a || a.hidden || g.noTorch) return;
  const [hx, hy] = a.hd;
  if (!g.back) {
    P.part('torch', { sep: 0, shade: { L: 1, T: 0, R: -1, B: 0 } }, () => P.rect(hx, hy + 2, 2, 2, 2));
    P.px(hx, hy + 3, 4, 'torch'); P.px(hx + 1, hy + 3, 3, 'torch');
  } else {
    P.part('torch', { sep: 0, under: true }, () => P.rect(hx + (hx < 12 ? 0 : 0), hy - 3, 2, 4, 1));
  }
}
function torchSide(P, g, which) {
  const a = g.arms[which];
  const [hx, hy] = a.hd;
  const t = which === 'far' ? 1 : 2;
  P.part('torch', { sep: 0, shade: { L: 0, T: 1, R: 0, B: -1 } }, () => {
    P.hl(hx - 3, hy + 1, 3, t);
    P.hl(hx - 4, hy + 1, 1, t + 1); P.hl(hx - 4, hy + 2, 1, t);
  });
  P.px(hx - 5, hy + 1, 3, 'lens'); P.px(hx - 5, hy + 2, 1, 'lens');
}

export const TESS = {
  id: 'tess', mats: M, dims: D, legend: LEGEND, heads: HEADS, headParts: HEAD_PARTS, headOrder: HEAD_ORDER,
  sleeve: { mat: 'jacket', cover: 0.2, cuff: true, wide: 0 },
  shoe: { ...SHOE, soleMat: 'sole' }, legMat: 'pants',
  torsoFront, torsoSide,
  orderFront: (g) => g.back
    ? ['legs', 'torchBack', 'torso', 'bag', 'arms', 'head', 'over']
    : ['legs', 'torso', 'bag', 'arms', 'head', 'torch', 'over'],
  orderSide: (g) => ['farArm', 'farLeg', 'nearLeg', 'torso', 'bag', 'head', 'nearArm', 'over'],
  layers: {
    bag: (P, g) => (g.view === 'front' ? bagFront(P, g) : bagSide(P, g)),
    torch: (P, g) => torchFront(P, g),
    torchBack: (P, g) => torchFront(P, g),
  },
  afterFarArm(P, g) { if (g.far === 'R' && !g.noTorch) torchSide(P, g, 'far'); },
  afterNearArm(P, g) { if (g.near === 'R' && !g.noTorch) torchSide(P, g, 'near'); },
};

/** The torch arm holds steady (aimed), the other arm swings. Adjust a geometry in place. */
export function aimTorch(g) {
  if (g.noAim || g.seated) return g;
  if (g.view === 'front') {
    const a = g.arm('R');
    if (!g.back) a.hd = [a.sh[0] - 1, 19 + g.bob - (g.breath || 0)];
    else a.hd = [a.sh[0], 20 + g.bob - (g.breath || 0)];
  } else {
    const which = g.near === 'R' ? 'near' : 'far';
    const a = g.arms[which];
    const [sx, sy] = a.sh;
    const bounce = g.o.run ? (g.o.phase % 2 ? -1 : 0) : 0;
    a.el = [sx, sy + 4];
    a.hd = [sx - 3, sy + 5 + bounce];
    a.cover = 0;
  }
  return g;
}


// ---- sheet ------------------------------------------------------------------------------------------
TESS.adjust = aimTorch;

/** Left hand in the jacket pocket (her idle habit). */
function pocket(g) {
  const a = g.view === 'front' ? g.arm('L') : g.arms[g.near === 'L' ? 'near' : 'far'];
  if (g.view === 'front') { a.hd = [a.sh[0], g.hem - 1]; a.noHand = true; }
  else { a.el = [a.sh[0] + 1, a.sh[1] + 3]; a.hd = [a.sh[0] - 1, g.hem - 1]; a.noHand = true; }
  return g;
}
/** Left hand pushing hair back behind the (tucked) left ear: k = 1 halfway, 2 at the ear. */
function hairPush(g, k) {
  g.order = g.view === 'front'
    ? (g.back ? ['legs', 'torchBack', 'torso', 'bag', 'head', 'arms', 'over'] : ['legs', 'torso', 'bag', 'head', 'arms', 'torch', 'over'])
    : ['farArm', 'farLeg', 'nearLeg', 'torso', 'bag', 'head', 'nearArm', 'over'];
  if (g.view === 'front') {
    const a = g.arm('L');
    const out = a.screen === 0 ? -1 : 1;
    a.el = [a.sh[0] + out * 2, a.sh[1] + (k === 1 ? 3 : 2)];
    a.hd = k === 1 ? [a.sh[0] + out, a.sh[1]] : [a.sh[0] + (out > 0 ? 1 : -1), g.head.y + 6];
    a.cover = 0.2;
  } else {
    const a = g.arms.near;
    a.el = [a.sh[0] - 2, a.sh[1] + (k === 1 ? 3 : 2)];
    a.hd = k === 1 ? [a.sh[0] - 2, a.sh[1]] : [a.sh[0], g.head.y + 6];
    a.cover = 0.2;
  }
  return g;
}

function tessIdle(dir, X) {
  const { R, stand } = X;
  const g = (o) => pocket(stand(dir, o));
  const A = R(g()), B = R(g({ breath: 1 }));
  if (dir === 'down' || dir === 'up') {
    const sh = dir === 'down' ? 1 : -1;
    const C = R(g({ dx: sh, lift: dir === 'down' ? [1, 0] : [0, 1] }));
    const Cb = R(g({ dx: sh, lift: dir === 'down' ? [1, 0] : [0, 1], breath: 1 }));
    const P1 = R(hairPush(stand(dir), 1)), P2 = R(hairPush(stand(dir), 2));
    const f = [A, B, C, Cb, P1, P2];
    return X.anim(X.seq(f, [0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 2, 2, 2, 2, 3, 3, 3, 2, 2, 0, 0, 0, 4, 5, 5, 5, 4, 0, 0, 1, 1, 1]), 4);
  }
  if (dir === 'left') {
    const P1 = R(hairPush(stand(dir), 1)), P2 = R(hairPush(stand(dir), 2));
    return X.anim(X.seq([A, B, P1, P2], [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 2, 3, 3, 3, 2, 0, 1, 1]), 4);
  }
  const C = R(g({ dx: 1 }));
  return X.anim(X.seq([A, B, C], [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 2, 2, 2, 2, 0, 0, 1, 1, 1]), 4);
}

function tessSpecials(anims, X) {
  const { R, front } = X;
  const D = TESS.dims;
  // flinch: shoulders up, hands up to the face, a hop back
  const fl = (o, hands) => {
    const g = front('down', { ...o });
    g.noAim = true;
    g.order = ['legs', 'torso', 'bag', 'head', 'arms', 'torch', 'over'];
    for (const a of g.arms) {
      const inw = a.screen === 0 ? 1 : -1;
      a.el = [a.sh[0] - inw, a.sh[1] + 3];
      a.hd = [a.sh[0] + inw * 2, hands];
      a.cover = 0.3;
    }
    return g;
  };
  anims.flinch_down = X.anim([
    R(fl({ breath: 1, headDy: 1 }, D.shY + 3)),
    R(fl({ bob: -1, headDy: 1, lift: [1, 1] }, D.shY - 2)),
    R(fl({ headDy: 1 }, D.shY - 1)),
    R(fl({ headDy: 1, breath: 1 }, D.shY - 1)),
  ], 10, false);

  // pickup: bend, crouch, reach the floor with the left hand, back up
  const pk = (stage) => {
    const drop = [0, 2, 5][stage];
    const g = front('down', { drop, headDy: stage ? 1 : 0 });
    if (stage === 2) for (const l of g.legs) l.seatedFront = true;
    const a = g.arm('L');
    if (stage) { a.el = [a.sh[0] + 1, a.sh[1] + 3]; a.hd = [a.sh[0] - 2, stage === 1 ? g.hip + 3 : 27]; a.cover = 0.3; }
    return g;
  };
  const P0 = R(pk(0)), P1 = R(pk(1)), P2 = R(pk(2));
  anims.pickup_down = X.anim([P0, P1, P2, P2, P1, P0], 8, false);

  // collapse (game over): stagger, knees, slump onto the hands, then crumpled on her side
  const c0 = front('down', { drop: 2, headDy: 1, lift: [0, 2], dx: -1 });
  c0.noAim = true;
  for (const a of c0.arms) a.hd = [a.sh[0], a.hd[1] + 1];
  const c1 = front('down', { drop: 6, headDy: 2 });
  c1.noAim = true;
  for (const l of c1.legs) l.kneel = true;
  for (const a of c1.arms) { a.hd = [a.sh[0] + (a.screen === 0 ? -1 : 1), 27]; a.el = [a.sh[0], a.sh[1] + 4]; }
  const c2 = front('down', { drop: 8, headDy: 4, headDir: 'up' });
  c2.noAim = true;
  for (const l of c2.legs) l.kneel = true;
  c2.order = ['legs', 'torso', 'bag', 'arms', 'head', 'torch', 'over'];
  for (const a of c2.arms) { const out = a.screen === 0 ? -1 : 1; a.el = [a.sh[0] + out, a.sh[1] + 3]; a.hd = [a.sh[0] + out, 28]; a.cover = 0.3; }
  const lyingSrc = (() => {
    const g = X.sit('left', { headDy: 2 });
    g.noTorch = true;
    for (const k of ['near', 'far']) { const L = g.legs[k]; L.knee[0] += 1; L.ankle = [L.knee[0] + 3, L.ankle[1] - 2]; }
    return renderFrame(TESS, g);
  })();
  const lie = rotateFrame(lyingSrc, -1, -4, 7);
  const lie2 = rotateFrame(lyingSrc, -1, -4, 7);
  const torchOnFloor = (src) => {
    const c = document.createElement('canvas'); c.width = 24; c.height = 32;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0);
    x.fillStyle = M.torch[0]; x.fillRect(15, 14, 6, 3);
    x.fillStyle = M.torch[2]; x.fillRect(16, 15, 4, 1);
    x.fillStyle = M.lens[3]; x.fillRect(15, 15, 1, 1);
    return c;
  };
  anims.collapse = X.anim([R(c0), R(c1), R(c2), lie, torchOnFloor(lie2)], 5, false);
}

TESS.idle = tessIdle;
TESS.specials = tessSpecials;
export function buildTess() { return buildHumanSheet(TESS); }
