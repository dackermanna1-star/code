// Human rig for 24×32 character sprites. A character spec (sprites_cast.js / sprites_ghosts.js)
// supplies materials, dimensions, head templates and outfit hooks; this module owns geometry
// (poses for idle / walk / run / sit and specials), the shared limbs (arms, legs, shoes) and sheet
// assembly. Coordinates are canonical: front/back views in screen space, side views drawn facing
// LEFT and mirrored by the Painter for 'right' (so the light stays top-left).
import { Painter, FW, FH } from './sprites_paint.js';

export const AX = 12, AY = 30;
export const DIRS = ['down', 'up', 'left', 'right'];

// ---- polyline rasterisation ---------------------------------------------------------------------
export function polyPts(pts) {
  const out = [];
  for (let s = 0; s + 1 < pts.length; s++) {
    let [x0, y0] = pts[s].map(Math.round); const [x1, y1] = pts[s + 1].map(Math.round);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      const l = out[out.length - 1];
      if (!l || l[0] !== x0 || l[1] !== y0) out.push([x0, y0]);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  return out;
}

// ---- head ---------------------------------------------------------------------------------------
/** Head template placement: template is centred on the frame's centre line (between cols 11|12). */
export function drawHead(P, C, h) {
  // 'right' falls back to the canonical left profile (the painter is already mirrored)
  const H = C.heads[h.dir] || (h.dir === 'right' ? C.heads.left : null) || C.heads.down;
  const rows = H.rows;
  const w = rows[0].length;
  const x = 12 - (w >> 1) + (h.dx || 0) + (H.ox || 0);
  const y = (h.y ?? C.dims.headY) + (H.oy || 0);
  // side 'right' heads are authored canonical (facing left) and the painter is flipped already
  P.tpl(rows, { ...C.legend, ...(H.legend || {}) }, x, y, C.headParts || {}, C.headOrder || null);
  return { x, y, w };
}

// ---- limbs --------------------------------------------------------------------------------------
/**
 * Arm: shoulder → elbow → hand polyline, brush width `aw`. The sleeve covers the upper arm and
 * `cover` of the forearm; a pushed-up sleeve gets a bunched cuff. The hand is a small skin block.
 */
export function drawArm(P, C, a, { tone = 2, sep = 1 } = {}) {
  const S = C.sleeve;
  const aw = a.w || C.dims.armW || 2;
  const upper = polyPts([a.sh, a.el]);
  const fore = polyPts([a.el, a.hd]);
  const nCover = Math.round(fore.length * (a.cover ?? S.cover ?? 1));
  const sleevePts = upper.concat(fore.slice(1, Math.max(1, nCover)));
  const skinPts = fore.slice(Math.max(1, nCover));
  const off = -((aw - 1) >> 1);
  if (!a.noSkin && skinPts.length) {
    P.part(C.skinMat || 'skin', { sep: 0, shade: { L: 1, T: 0, R: -1, B: 0 } }, () => {
      for (const [x, y] of skinPts) P.rect(x + off, y + off, aw, aw, tone);
    });
  }
  P.part(S.mat, { sep, shade: S.shade || {} }, () => {
    for (const [x, y] of sleevePts) P.rect(x + off, y + off, aw + (S.wide || 0), aw, tone);
    if (S.cuff && nCover < fore.length) {
      const [cx, cy] = fore[Math.max(0, nCover - 1)];
      P.rect(cx + off - (S.cuffL ?? 0), cy + off, aw + 1 + (S.wide || 0), 1, tone + 1, S.cuffMat || null);
    }
  });
  // hand
  if (!a.noHand) {
    const [hx, hy] = a.hd;
    P.part(C.skinMat || 'skin', { sep: 0, shade: { L: 1, T: 0, R: -1, B: -1 } }, () => {
      if (a.fist) P.rect(hx + off, hy + off, aw, aw, tone);
      else { P.rect(hx + off, hy + off, aw, aw, tone); P.px(hx + off + (a.thumb ?? 0), hy + off + aw, tone); }
    });
  }
}

/** Front/back leg: a column from the hip to the ankle, then a shoe. Seated variants fold it. */
export function drawLegFront(P, C, L, back) {
  const top = L.top, ankle = L.foot - (C.shoe.h - 1);
  const mat = L.mat || C.legMat || 'pants';
  if (L.seatedBack) {
    // legs run forward under the desk: only the seat of the trousers shows below the hem
    P.part(mat, { sep: 0, shade: { L: 1, T: 0, R: -1, B: -1 } }, () => P.rect(L.x, top, L.w + (L.screen === 0 ? 1 : 0), 2, 1));
    return;
  }
  if (L.kneel) {
    P.part(mat, { sep: 0, shade: { L: 1, T: 0, R: -1, B: -1 } }, () => P.rect(L.x, top, L.w, C.dims.ground - top + 1, 2));
    if (!back) P.hl(L.x, C.dims.ground, L.w, 1, mat);
    else { P.hl(L.x, C.dims.ground - 1, L.w, 2, C.shoe.mat); P.hl(L.x, C.dims.ground, L.w, 3, C.shoe.soleMat || C.shoe.mat); }
    return;
  }
  if (L.seatedFront) {
    // thighs come toward us (foreshortened, lit on top), shins drop to the floor
    const kx = L.x + (L.screen === 0 ? -1 : 0);
    P.part(mat, { sep: 0, shade: { L: 1, T: 0, R: -1, B: 0 } }, () => {
      P.rect(kx, top, L.w + 1, 2, 3);
      P.rect(L.x, top + 2, L.w, Math.max(1, ankle - top - 2), 2);
    });
    P.hl(kx, top + 1, L.w + 1, 1, mat);
    C.legDetail?.(P, L, back);
    drawShoeFront(P, C, L, back);
    return;
  }
  if (!L.skirtOnly) {
    P.part(mat, { sep: 0, shade: { L: 1, T: 0, R: -1, B: 0 } }, () => {
      P.rect(L.x, top, L.w, Math.max(0, ankle - top + (C.shoe.overlap || 0)), L.tone ?? 2);
    });
    C.legDetail?.(P, L, back);
  }
  drawShoeFront(P, C, L, back);
}

export function drawShoeFront(P, C, L, back) {
  const S = C.shoe;
  const h = S.h, y0 = L.foot - h + 1;
  const outer = L.screen === 0 ? -1 : 1; // feet splay a touch outward
  const x = L.x + (S.splay ? (outer < 0 ? -S.splay : 0) : 0);
  const w = L.w + (S.wider ?? 1);
  const xx = outer < 0 ? x - (S.wider ?? 1) + (S.splay ? S.splay : 0) : x;
  P.part(S.mat, { sep: 0, shade: { L: 1, T: 0, R: -1, B: 0 } }, () => {
    if (L.lift > 0 && L.toeDown) {
      // raised foot: heel up, toe down → shorter shoe, we see the top
      P.rect(xx, y0, w, h - 1, 2);
    } else {
      P.rect(xx, y0, w, h, 2);
    }
    S.frontDetail?.(P, xx, y0, w, h, L, back, outer);
  });
  S.frontAfter?.(P, xx, y0, w, h, L, back, outer);
}

/** Side leg: hip → knee → ankle polyline (brush lw) + side shoe. tone 1 = far leg. */
export function drawLegSide(P, C, L, tone) {
  const lw = C.dims.legW;
  const pts = polyPts([L.hip, L.knee, L.ankle]);
  const off = -((lw - 1) >> 1);
  if (!L.noPants) {
    P.part(L.mat || C.legMat || 'pants', { sep: 0, shade: { L: 1, T: 0, R: -1, B: 0 } }, () => {
      for (const [x, y] of pts) P.rect(x + off, y + off, lw, lw, tone);
    });
    C.legDetailSide?.(P, L, tone, pts);
  }
  drawShoeSide(P, C, L, tone);
}

/** Side shoe at the ankle, toe pointing left (canonical). L.toeDown tilts a lifted foot. */
export function drawShoeSide(P, C, L, tone) {
  const S = C.shoe;
  const [ax, ay] = L.ankle;
  const tpl = L.toeDown ? (S.sideLift || S.side) : S.side;
  const rows = tpl.rows;
  const x0 = ax + tpl.ox, y0 = ay + tpl.oy;
  P.tpl(rows, S.legend(tone), x0, y0, S.parts || { '*': { shade: { L: 0, T: 1, R: 0, B: 0 } } });
}

// ---- geometry -------------------------------------------------------------------------------------
/**
 * Front/back geometry from a few knobs: bob (whole upper body), breath (shoulders+head only),
 * drop (seated: upper body lowered onto a seat), lift [l, r] (feet raised), hand [[dx,dy],[dx,dy]]
 * (screen-left/right hand offsets), headDy/headDx/headDir.
 */
export function frontGeom(C, dir, o = {}) {
  const D = C.dims;
  const back = dir === 'up';
  const bob = (o.bob || 0) + (o.drop || 0);
  const br = o.breath || 0;
  const sh = D.shY + bob - br, hip = D.hipY + bob;
  const lw = D.legW, gap = D.legGap;
  const lx0 = 12 - (gap >> 1) - (gap & 1) - lw - (D.legOff || 0);
  const lx1 = 12 + (gap >> 1) + (D.legOff || 0);
  const lift = o.lift || [0, 0];
  const legs = [
    { screen: 0, x: lx0, w: lw, top: hip, foot: D.ground - lift[0], lift: lift[0], toeDown: lift[0] > 0 },
    { screen: 1, x: lx1, w: lw, top: hip, foot: D.ground - lift[1], lift: lift[1], toeDown: lift[1] > 0 },
  ];
  const aw = D.armW;
  const ax0 = 12 - (D.shW >> 1) - aw + (D.armIn ?? 1), ax1 = 12 + (D.shW >> 1) - (D.armIn ?? 1);
  const hand = o.hand || [[0, 0], [0, 0]];
  const handY = D.handY + bob - br;
  const elbowY = sh + D.elbowDy;
  const arms = [
    { screen: 0, sh: [ax0, sh + 1], el: [ax0 - (D.elbowOut || 0) + (o.elbow?.[0]?.[0] || 0), elbowY + (o.elbow?.[0]?.[1] || 0)], hd: [ax0 + hand[0][0], handY + hand[0][1]] },
    { screen: 1, sh: [ax1, sh + 1], el: [ax1 + (D.elbowOut || 0) + (o.elbow?.[1]?.[0] || 0), elbowY + (o.elbow?.[1]?.[1] || 0)], hd: [ax1 + hand[1][0], handY + hand[1][1]] },
  ];
  // body sides: facing down, her right is screen-left
  const sideOf = (screen) => (back ? (screen === 0 ? 'L' : 'R') : (screen === 0 ? 'R' : 'L'));
  for (const a of arms) a.side = sideOf(a.screen);
  for (const l of legs) l.side = sideOf(l.screen);
  return {
    view: 'front', dir, back, bob, breath: br, drop: o.drop || 0, sh, hip, hem: D.hem + bob, legs, arms, dx: o.dx || 0, dy: o.dy || 0,
    head: { dir: o.headDir || dir, y: D.headY + bob - br + (o.headDy || 0), dx: o.headDx || 0 },
    arm: (side) => arms.find((a) => a.side === side),
    leg: (side) => legs.find((l) => l.side === side),
    t: o.t || 0, o,
  };
}

/** Side geometry (canonical facing left). stride: foot offsets; o.lean shifts the upper body. */
export function sideGeom(C, dir, o = {}) {
  const D = C.dims;
  const bob = (o.bob || 0) + (o.drop || 0);
  const br = o.breath || 0;
  const lean = o.lean || 0;
  const cx = 12 + (D.sideCx || 0);
  const sh = D.shY + bob - br, hip = D.hipY + bob;
  const ground = D.ground;
  const kneeY = Math.round((hip + ground - C.shoe.h) / 2) + (D.kneeDy || 0);
  const ankleY = ground - C.shoe.h + 1;
  const mk = (f) => {
    const lift = f.lift || 0;
    const fx = cx + (f.x || 0);
    const kx = f.kx !== undefined ? cx + f.kx : Math.round((cx + fx) / 2) - (lift ? 1 : 0);
    return {
      hip: [cx + (D.hipDx || 0), hip], knee: [kx, kneeY + bob - (f.kneeUp || 0)], ankle: [fx, ankleY - lift],
      lift, toeDown: lift > 0 && !f.flat,
    };
  };
  const legs = { near: mk(o.near || {}), far: mk(o.far || {}) };
  const shX = cx + (D.shDx || 0) - lean;
  const armA = (a) => {
    const sw = a.swing || 0; // + = forward (toward facing = -x)
    const bend = a.bend || 0;
    const shp = [shX, sh + 1];
    const el = [shX - Math.round(sw * 0.4) - (bend > 0 ? 1 : 0), sh + D.elbowDy - (bend > 1 ? 1 : 0)];
    const hd = [shX - sw - (bend ? 1 : 0), D.handY + bob - br - Math.abs(sw > 2 ? 1 : 0) - bend * 2];
    return { sh: shp, el: a.el || el, hd: a.hd || hd, cover: a.cover };
  };
  const arms = { near: armA(o.nearArm || {}), far: armA(o.farArm || {}) };
  return {
    view: 'side', dir, flip: dir === 'right', near: dir === 'left' ? 'L' : 'R', far: dir === 'left' ? 'R' : 'L',
    bob, breath: br, drop: o.drop || 0, lean, cx, sh, hip, hem: D.hem + bob, legs, arms, dx: o.dx || 0, dy: o.dy || 0,
    head: { dir: o.headDir || dir, y: D.headY + bob - br + (o.headDy || 0), dx: -lean + (o.headDx || 0) },
    t: o.t || 0, o,
  };
}

// ---- frame assembly -----------------------------------------------------------------------------
/** Draw one frame for geometry g. C.draw (optional) fully overrides; else the default layering. */
export function renderFrame(C, g, mats = C.mats) {
  const P = new Painter(mats, { flip: !!g.flip });
  if (C.draw) C.draw(P, C, g);
  else defaultDraw(P, C, g);
  return P.toCanvas();
}

export function defaultDraw(P, C, g) {
  if (g.view === 'front') {
    const order = g.order || C.orderFront?.(g) || ['under', 'legs', 'torso', 'arms', 'head', 'over'];
    for (const layer of order) { P.ox = layer === 'legs' ? 0 : (g.dx || 0); P.oy = layer === 'legs' ? 0 : (g.dy || 0); layerFront(P, C, g, layer); }
    P.ox = 0; P.oy = 0;
  } else {
    const order = g.order || C.orderSide?.(g) || ['under', 'farArm', 'farLeg', 'nearLeg', 'torso', 'head', 'nearArm', 'over'];
    for (const layer of order) { const lg = layer === 'farLeg' || layer === 'nearLeg'; P.ox = lg ? 0 : (g.dx || 0); P.oy = lg ? 0 : (g.dy || 0); layerSide(P, C, g, layer); }
    P.ox = 0; P.oy = 0;
  }
}

function layerFront(P, C, g, layer) {
  switch (layer) {
    case 'legs': if (C.legsFront) C.legsFront(P, g); else for (const L of g.legs) drawLegFront(P, C, L, g.back); break;
    case 'torso': C.torsoFront(P, g); break;
    case 'arms': for (const a of g.arms) if (!a.hidden && !a.late) (C.armFront || drawArm)(P, C, a, { sep: 1 }); break;
    case 'lateArms': for (const a of g.arms) if (!a.hidden && a.late) (C.armFront || drawArm)(P, C, a, { sep: 1 }); break;
    case 'head': if (!g.noHead) drawHead(P, C, g.head); C.afterHead?.(P, g); break;
    case 'under': C.underFront?.(P, g); break;
    case 'over': C.overFront?.(P, g); break;
    default: C.layers?.[layer]?.(P, g);
  }
}

function layerSide(P, C, g, layer) {
  switch (layer) {
    case 'farArm': if (!g.arms.far.hidden) drawArm(P, C, { ...g.arms.far, side: g.far }, { tone: 1, sep: 0 }); C.afterFarArm?.(P, g); break;
    case 'farLeg': if (C.legSide) C.legSide(P, g, 'far'); else drawLegSide(P, C, g.legs.far, 1); break;
    case 'nearLeg': if (C.legSide) C.legSide(P, g, 'near'); else drawLegSide(P, C, g.legs.near, 2); break;
    case 'torso': C.torsoSide(P, g); break;
    case 'head': if (!g.noHead) drawHead(P, C, g.head); C.afterHead?.(P, g); break;
    case 'nearArm': if (!g.arms.near.hidden) drawArm(P, C, { ...g.arms.near, side: g.near }, { tone: 2, sep: 1 }); C.afterNearArm?.(P, g); break;
    case 'under': C.underSide?.(P, g); break;
    case 'over': C.overSide?.(P, g); break;
    default: C.layers?.[layer]?.(P, g);
  }
}

// ---- standard animations ---------------------------------------------------------------------------
/** Walk cycle knobs per frame: step, pass, step, pass. */
export function walkGeom(C, dir, i, run = false) {
  const R = run;
  if (dir === 'down' || dir === 'up') {
    // 0: screen-left foot planted, right foot pushing off · 1: pass · 2: mirror · 3: pass
    const pass = i % 2 === 1;
    const lift = pass ? (i === 1 ? [0, R ? 2 : 1] : [R ? 2 : 1, 0]) : (i === 0 ? [0, R ? 3 : 2] : [R ? 3 : 2, 0]);
    // the arm opposite the lifted (swinging-forward) foot comes forward
    let sw = pass ? [0, 0] : (i === 0 ? [1, -1] : [-1, 1]);
    if (dir === 'up') sw = [-sw[0], -sw[1]];
    const hand = R
      ? [[1, -2 + (sw[0] > 0 ? 1 : sw[0] < 0 ? -2 : 0)], [-1, -2 + (sw[1] > 0 ? 1 : sw[1] < 0 ? -2 : 0)]]
      : [[0, sw[0] > 0 ? 1 : sw[0] < 0 ? -1 : 0], [0, sw[1] > 0 ? 1 : sw[1] < 0 ? -1 : 0]];
    const elbow = R ? [[-1, 0], [1, 0]] : null;
    const bob = R ? (pass ? -2 : 0) : (pass ? -1 : 0);
    return frontGeom(C, dir, { bob, lift, hand, elbow, run: R, phase: i, swing: sw });
  }
  // side: 0 contact (near leg forward), 1 pass (near supports, far lifted), 2 contact (far forward), 3 pass
  const s = R ? (C.dims.runStride || 5) : (C.dims.stride || 3);
  const fwd = { x: -s, kx: -Math.ceil(s / 2) }, bwd = { x: s - 1, kx: Math.floor(s / 2) - 1 };
  const sup = { x: 0 }, swg = { x: R ? 2 : 1, lift: R ? 3 : 2, kx: R ? -2 : -1, kneeUp: R ? 2 : 1 };
  const legs = [
    { near: fwd, far: bwd }, { near: sup, far: swg }, { near: bwd, far: fwd }, { near: swg, far: sup },
  ][i];
  const as = R ? 3 : 2;
  const arms = [
    { nearArm: { swing: -as, bend: R ? 1 : 0 }, farArm: { swing: as, bend: R ? 1 : 0 } },
    { nearArm: { swing: 0, bend: R ? 1 : 0 }, farArm: { swing: 0, bend: R ? 1 : 0 } },
    { nearArm: { swing: as, bend: R ? 1 : 0 }, farArm: { swing: -as, bend: R ? 1 : 0 } },
    { nearArm: { swing: 0, bend: R ? 1 : 0 }, farArm: { swing: 0, bend: R ? 1 : 0 } },
  ][i];
  const pass = i % 2 === 1;
  return sideGeom(C, dir, { ...legs, ...arms, bob: pass ? -1 : (R ? 1 : 0), lean: R ? 1 : 0, run: R, phase: i });
}

export function idleGeom(C, dir, o = {}) {
  if (dir === 'down' || dir === 'up') return frontGeom(C, dir, o);
  return sideGeom(C, dir, { near: { x: -1 }, far: { x: 1 }, ...o });
}

/** Rotate a frame canvas by quarter turns (pixel exact); returns a new FW×FH canvas, content re-anchored. */
export function rotateFrame(src, quarter, dx = 0, dy = 0) {
  const c = document.createElement('canvas'); c.width = FW; c.height = FH;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.translate(FW / 2 + dx, FH / 2 + dy); x.rotate((quarter * Math.PI) / 2);
  x.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

/** Build an anim record from canvases. */
export const anim = (frames, fps = 6, loop = true) => ({ frames, fps, loop });

/** Expand a frame-index sequence over unique canvases (lets idles hold frames cheaply). */
export const seq = (canvases, order) => order.map((i) => canvases[i]);

export { Painter, FW, FH };
