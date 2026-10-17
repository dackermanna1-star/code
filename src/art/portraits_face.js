// Parametric face features for the portrait rigs: eyes, brows, nose details, mouth, freckles, blush,
// tears, sweat, grime. Everything is driven by an expression parameter object so that every expression of
// a character is the same face with different muscle settings.
import { rng } from './util.js';
import { clamp, lerp, smooth } from './portraits_core.js';

// ---- expression parameters ---------------------------------------------------------------------
export const BASE_EXPR = {
  tilt: 0, hx: 0, hy: 0, pitch: 0, shoulder: 0,
  brow: { y: 0, inner: 0, outer: 0, furrow: 0, nearY: 0, farY: 0, nearInner: 0, farInner: 0 },
  eye: {
    open: 1, nearOpen: 1, farOpen: 1, lower: 0, innerUp: 0, outerDown: 0, angry: 0,
    gx: 0, gy: 0, iris: 1, pupil: 1, shut: null, nearShut: null, farShut: null, wet: 0, glassy: 0,
    noHi: false, diverge: 0, still: false, farGlassy: null, nearGlassy: null,
  },
  mouth: {
    shape: 'line', open: 0, smile: 0, smileN: 0, smileF: 0, width: 1, teeth: 0, lowerTeeth: 0,
    snarl: 0, tremble: 0, tongue: 0, dy: 0, dx: 0, pout: 0, press: 0, bite: 0,
  },
  blush: 0, sweat: 0, tears: 0, pale: 0, darkCircles: 0, noseWrinkle: 0, cheek: 0, gloom: 0,
};
export function mergeExpr(...parts) {
  const out = JSON.parse(JSON.stringify(BASE_EXPR));
  for (const p of parts) {
    if (!p) continue;
    for (const [k, v] of Object.entries(p)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = { ...(out[k] || {}), ...v };
      else out[k] = v;
    }
  }
  return out;
}

// ---- eyes -----------------------------------------------------------------------------------------
/**
 * Draw one eye. style: { w, hu, hl, ri, cIn, cOut, peak, lash, flick, lowerLine, crease, lashMat, irisMat,
 * scleraMat, pupilMat, glintMat, skinMat, uc, y }. side: 'near' (viewer-left) | 'far'.
 */
export function drawEye(rig, face, side, S, E, opt = {}) {
  const near = side === 'near';
  const uc = near ? -S.uc : S.uc;
  const [ex, ey0] = face.proj(uc, S.y);
  const ey = ey0 + (opt.dy || 0);
  const sc = face.scaleAt(uc, S.y) * (near ? 1 : S.farSq || 1);
  const hw = (S.w / 2) * sc;
  const dir = near ? -1 : 1; // screen x of outer corner relative to centre
  const open = clamp((near ? E.nearOpen : E.farOpen) * E.open * (1 - 0.28 * Math.max(0, E.gy || 0)) * (1 + 0.08 * Math.max(0, -(E.gy || 0))), 0, 1.6);
  const shut = (near ? E.nearShut : E.farShut) || E.shut;
  const glassy = (near ? E.nearGlassy : E.farGlassy) ?? E.glassy;
  const skin = S.skinMat, lashM = S.lashMat;
  const base = (t) => lerp(S.cIn, S.cOut, (t + 1) / 2) - (E.outerDown || 0) * 1.2 * Math.max(0, t) ** 1.5;
  const tp = S.peak ?? -0.15;
  const arch = (t, po = 2) => {
    const s = t < tp ? (t - tp) / (1 + tp) : (t - tp) / (1 - tp);
    return Math.max(0, 1 - Math.abs(s) ** (t < tp ? 2 : po));
  };
  const lashW = (t) => (t < -0.45 ? S.lash[0] : t < 0.15 ? S.lash[1] : S.lash[2]);
  const T = (hx) => (dir * (hx - ex)) / hw;
  const bb = [ex - hw - 4, ey - 9, ex + hw + 4, ey + 7];

  if (shut) {
    // closed lids: a single shaped lash line
    const kind = shut;
    const lineY = (t) => {
      const a = arch(t, 2.2);
      if (kind === 'happy') return base(t) - 1.6 * a + 0.4;
      if (kind === 'squeeze') return base(t) + 0.6 * a + 0.4 + 0.5 * (t > 0 ? t : 0);
      return base(t) + 0.9 * a + 0.2; // 'soft'
    };
    rig.paint(bb, (hx, hy) => {
      const t = T(hx); if (t < -1.02 || t > 1.12) return null;
      const ly = lineY(Math.min(t, 1));
      const dy = hy - ey - ly;
      const th = kind === 'squeeze' ? (t < -0.6 ? 1 : 2) : t < -0.5 || t > 0.9 ? 1 : 2;
      if (dy > -th && dy <= 0) return [lashM, t > 0.2 ? 0 : 1];
      // relaxed lid skin crease above
      if (kind !== 'happy' && dy > -th - 2.2 && dy <= -th - 1.2 && t > -0.5 && t < 0.85) return [skin, -1];
      // squeezed: lower-lid bulge line
      if (kind === 'squeeze' && dy > 1.6 && dy <= 2.6 && t > -0.4 && t < 0.8) return [skin, -1];
      if (kind === 'happy' && dy > 1.8 && dy <= 2.8 && t > -0.2 && t < 0.7 && S.happyLower !== false) return [skin, -1];
      return null;
    });
    if (kind === 'squeeze') {
      // crow's feet wrinkles off the outer corner
      const ox = ex + dir * hw * 1.05, oy = ey + base(1);
      rig.strokeH([[ox + dir * 0.5, oy - 1.5], [ox + dir * 2.6, oy - 2.6]], [skin, -1]);
      rig.strokeH([[ox + dir * 0.8, oy + 0.6], [ox + dir * 2.8, oy + 1.1]], [skin, -1]);
    }
    if (S.flick && kind !== 'squeeze') {
      const ox = ex + dir * hw, oy = ey + lineY(1);
      rig.dotH(ox + dir * 0.9, oy + (kind === 'happy' ? 0.3 : 0.6), lashM, 0);
    }
    return { ex, ey, hw, closed: true };
  }

  // open eye: lid curves
  const hu = S.hu * open, hl = S.hl;
  const lowerK = E.lower || 0;
  const U = (t) => {
    let y = base(t) - hu * arch(t, S.archPow || 2.4);
    // worry: inner part of the upper lid lifts; anger: inner part drops
    const inner = clamp((0.2 - t) / 1.2, 0, 1);
    y -= (E.innerUp || 0) * 1.4 * inner * open;
    y += (E.angry || 0) * 2.0 * inner * Math.min(1, open + 0.3);
    return y;
  };
  const Lw = (t) => base(t) + hl * arch(t, 2) * (1 - 1.5 * lowerK) - (E.cheek || 0) * 0.5 * arch(t, 2);
  // iris centre
  const gx = E.gx + (E.diverge || 0) * (near ? -1 : 1);
  const irx = S.ri * (S.irisW || 0.92) * Math.min(1, sc * 1.05) * E.iris;
  const iry = S.ri * E.iris;
  const ix = ex + gx * Math.max(0.5, hw - irx * 0.75) * 0.85 + (near ? S.irisShiftN || 0 : S.irisShiftF || 0) * sc;
  const iy = ey + (S.irisDy ?? -0.3) + E.gy * 1.6;
  const rp = S.rp * E.pupil * (glassy ? 1.25 : 1);
  const lowerLine = S.lowerLine ?? 0.6;
  const wet = E.wet || 0;

  rig.paint(bb, (hx, hy) => {
    const t = T(hx);
    if (t < -1.05 || t > 1.4) return null;
    const tc = Math.min(1, t);
    const u = U(tc) + ey, l = Lw(tc) + ey;
    if (t <= 1 && hy > u && hy < l && l - u > 0.6) {
      // inside the opening
      const fromTop = hy - u;
      const dxI = (hx - ix) / irx, dyI = (hy - iy) / iry, r2 = dxI * dxI + dyI * dyI;
      if (r2 <= 1) {
        const pr = Math.hypot((hx - ix) / (rp * Math.min(1, sc * 1.1)), (hy - iy) / rp);
        if (pr <= 1 && !(glassy && S.glassyPupil === false)) return [S.pupilMat, glassy ? 1 : 0, glassy ? 1 : 0];
        let off = 0;
        if (fromTop < 1) off = -2; else if (fromTop < 2) off = -1;
        if (r2 > 0.72 && fromTop >= 1) off = Math.min(off, -1);
        if (dyI > 0.35 && r2 < 0.72) off += 1;
        return [glassy ? S.irisGlassMat || S.irisMat : S.irisMat, off];
      }
      let off = 0;
      if (fromTop < 1) off = -2; else if (fromTop < 2 && S.scleraShade !== false) off = -1;
      if (Math.abs(t) > 0.8) off = Math.min(off, -1);
      if (wet > 0.4 && l - hy < 1 && t > -0.6 && t < 0.8) return [S.glintMat, 0, 4];
      return [S.scleraMat, off];
    }
    // upper lash line (+ flick past the outer corner)
    const flickT = 1 + (S.flick || 0) * 0.16;
    if (t <= flickT) {
      const th = lashW(tc);
      let uu = u;
      if (t > 1) uu = ey + U(1) - (t - 1) * (S.flickRise ?? 2.5) * hw * 0.1;
      if (hy <= uu && hy > uu - th) {
        if (t > 1) return [lashM, 0];
        return [lashM, t < -0.55 ? 1 : 0];
      }
      // eyelid crease
      if (S.crease && open > 0.45 && t > -0.55 && t < 0.92 && hy <= uu - th - (S.creaseGap ?? 1.2) && hy > uu - th - (S.creaseGap ?? 1.2) - 1) return [skin, -1];
    }
    // lower lid line (outer part)
    if (t <= 1 && t > 1 - 2 * lowerLine && hy >= l && hy < l + 1 && l - u > 0.6) return [S.lowerMat || skin, S.lowerOff ?? -1];
    return null;
  });
  // catchlights (fixed: they belong to the light source, not the surface)
  if (!E.noHi && !glassy) {
    const ux = ix - irx * 0.42, uy = iy - iry * 0.42;
    const cc = U(Math.max(-1, Math.min(1, T(ux)))) + ey;
    if (uy > cc + 0.2) {
      rig.dotH(ux, uy, S.glintMat, 0, 5);
      if (S.ri > 2.6 && sc > 0.9) rig.dotH(ux + 1, uy, S.glintMat, 0, 5);
    }
    rig.dotH(ix + irx * 0.5, iy + iry * 0.5, S.glintMat, 0, wet > 0.3 ? 5 : 4);
    if (wet > 0.5) rig.dotH(ix + irx * 0.1, iy + iry * 0.75, S.glintMat, 0, 4);
  } else if (glassy) {
    // dull, broad, low highlight: unfocused glass
    rig.dotH(ix - irx * 0.2, iy + iry * 0.55, S.glintMat, 0, 3);
  }
  return { ex, ey, hw, ix, iy, irx, iry, U: (t) => U(t) + ey, L: (t) => Lw(t) + ey, T };
}

// ---- brows ------------------------------------------------------------------------------------------
/** style: { y, uIn, uPk, uOut, pkY, outY, w: [inner, peak, tail], mat }. */
export function drawBrow(rig, face, side, S, B) {
  const near = side === 'near', sg = near ? -1 : 1;
  const sideY = near ? B.nearY : B.farY;
  const sideIn = near ? B.nearInner : B.farInner;
  const yb = S.y - (B.y || 0) * 2.8 - (sideY || 0) * 2.8;
  const inner = (B.inner || 0) + (sideIn || 0);
  const fur = B.furrow || 0;
  const pIn = face.proj(sg * (S.uIn - fur * 0.05), yb - inner * 2.6 + fur * 1.5 + (S.inY || 0));
  const pPk = face.proj(sg * S.uPk, yb + S.pkY - inner * 0.6 + fur * 0.5 - (B.outer || 0) * 0.6);
  const pOut = face.proj(sg * S.uOut, yb + S.outY - (B.outer || 0) * 1.6 + inner * 0.5);
  const pts = [[pIn[0], pIn[1]], [lerp(pIn[0], pPk[0], 0.5), lerp(pIn[1], pPk[1], 0.5) - 0.3], [pPk[0], pPk[1]], [lerp(pPk[0], pOut[0], 0.55), lerp(pPk[1], pOut[1], 0.45)], [pOut[0], pOut[1]]];
  const wsc = near ? 1 : S.farW || 0.9;
  rig.thickH(pts, (t) => (t < 0.35 ? lerp(S.w[0], S.w[1], t / 0.35) : lerp(S.w[1], S.w[2], (t - 0.35) / 0.65)) * wsc,
    (t, dn) => [S.mat, t < 0.1 ? 1 : t > 0.88 ? 1 : dn > 0.55 && t > 0.6 ? 1 : 0], { onlyMat: S.on });
  if (fur > 0.45) {
    // furrow crease between the brows
    const m = face.proj(sg * 0.07, yb + 1.2);
    rig.strokeH([[m[0], m[1] - 1], [m[0] + sg * 0.4, m[1] + 1.4]], [S.skinMat, -1], { onlyMat: S.on });
  }
  return pts;
}

// ---- nose ---------------------------------------------------------------------------------------------
export function drawNose(rig, face, S, E) {
  const y = S.y;
  const tip = face.proj(0.02, y, S.e);
  const farN = face.proj(0.13, y + 1.4, S.e - 2.5);
  const nearN = face.proj(-0.1, y + 1.5, S.e - 2.6);
  // far nostril wing curve + nostril
  rig.strokeH([[tip[0] + 0.6, tip[1] + 1.2], [farN[0], farN[1] + 0.2]], [S.skinMat, -1], { onlyMat: S.on });
  rig.dotH(farN[0] - 0.6, farN[1] + 0.4, S.skinMat, -2, -1, { onlyMat: S.on });
  if (S.nearNostril) rig.dotH(nearN[0], nearN[1] + 0.3, S.skinMat, S.nearNostril, -1, { onlyMat: S.on });
  if (E.noseWrinkle > 0.3) {
    const b = face.proj(0.0, y - 6);
    rig.strokeH([[b[0] - 1.5, b[1]], [b[0] + 1.2, b[1] - 0.6]], [S.skinMat, -1], { onlyMat: S.on });
    rig.strokeH([[b[0] - 1, b[1] + 2], [b[0] + 1.5, b[1] + 1.5]], [S.skinMat, -1], { onlyMat: S.on });
  }
}

// ---- mouth -----------------------------------------------------------------------------------------------
/**
 * S: { y, hw (surface half width in u), lipMat, skinMat, mouthMat, teethMat, tongueMat, lowerLip }
 * M: expression mouth params.
 */
export function drawMouth(rig, face, S, M, seed = 1) {
  const my = S.y + (M.dy || 0);
  const wk = M.width ?? 1;
  const uw = S.hw * wk;
  const sN = (M.smile || 0) + (M.smileN || 0), sF = (M.smile || 0) + (M.smileF || 0);
  const du = M.dx || 0;
  const pL = face.proj(-uw + du, my - sN * 3.0);
  const pR = face.proj(uw * (S.farK || 1) + du, my - sF * 3.0);
  const pC = face.proj(du, my);
  const xL = pL[0], xR = pR[0];
  const yL = pL[1], yR = pR[1];
  const avgS = (sN + sF) / 2;
  const centerDip = avgS > 0 ? avgS * 0.7 : avgS * 0.55; // smile: centre lower than corners
  const r = rng(seed);
  const trem = M.tremble || 0;
  // baseline through corners & centre
  const base = (s) => { // s 0..1 from near corner to far corner
    const yl = lerp(yL, yR, s);
    const bow = 4 * s * (1 - s);
    let y = yl + (pC[1] + centerDip - (yL + yR) / 2) * bow;
    if (trem) y += Math.sin(s * Math.PI * 5 + 0.7) * trem * 0.45 * bow;
    return y;
  };
  const sOf = (hx) => (hx - xL) / (xR - xL);
  const open = M.open || 0;
  const shape = M.shape;
  if (open < 0.08 || shape === 'line') {
    // closed mouth: lip line
    const pts = [];
    for (let k = 0; k <= 14; k++) { const s = k / 14; pts.push([lerp(xL, xR, s), base(s)]); }
    rig.strokeH(pts, (t) => {
      const e = Math.abs(t - 0.5) * 2; // 0 centre .. 1 corners
      if (e > 0.94 && avgS < 0.25) return null;
      return [S.lipMat, e < 0.5 ? -3 : -2];
    }, { onlyMat: S.on });
    // press: lips thinned, line darker and longer; pout: lower lip bulge
    // corners: smile creases / frown ticks
    const tick = (x, y, s, sd) => {
      if (s > 0.28) rig.dotH(x + sd * 0.8, y - 0.6, S.skinMat, -1, -1, { onlyMat: S.on });
      else if (s < -0.3) rig.dotH(x + sd * 0.7, y + 0.8, S.skinMat, -1, -1, { onlyMat: S.on });
    };
    tick(xL, yL, sN, -1); tick(xR, yR, sF, 1);
    // lower lip shading + highlight
    if (S.lowerLip !== false) {
      const c = [lerp(xL, xR, 0.5), base(0.5)];
      const ll = M.pout ? 2.4 : 1.6;
      const hw = M.press ? 1.2 : 2;
      rig.strokeH([[c[0] - hw, c[1] + ll], [c[0] + hw * 0.8, c[1] + ll]], [S.lowerLipMat || S.skinMat, -1], { onlyMat: S.on });
    }
    if (M.bite) {
      const c = [lerp(xL, xR, 0.35), base(0.35)];
      rig.dotH(c[0], c[1] + 1, S.teethMat, 0, 4, { onlyMat: S.on });
      rig.dotH(c[0] + 1, c[1] + 1, S.teethMat, 0, 4, { onlyMat: S.on });
    }
    return { xL, xR, yL, yR };
  }
  // open mouth region between top(s) and bottom(s)
  const H = S.h || 5;
  const prof = (s, p) => Math.pow(Math.max(0, 4 * s * (1 - s)), p);
  let top, bot;
  switch (shape) {
    case 'O': top = (s) => base(s) - open * 1.4 * prof(s, 0.5); bot = (s) => base(s) + open * H * 0.8 * prof(s, 0.5); break;
    case 'scream': top = (s) => base(s) - open * 1.0 * prof(s, 0.35); bot = (s) => base(s) + open * H * 1.25 * prof(s, 0.28); break;
    case 'grin': top = (s) => base(s) - 0.2 * prof(s, 1); bot = (s) => base(s) + open * H * 0.9 * prof(s, 0.7); break;
    case 'laugh': top = (s) => base(s) - 0.4 * prof(s, 1); bot = (s) => base(s) + open * H * 1.2 * prof(s, 0.55); break;
    case 'grimace': top = (s) => base(s) - open * 1.0 * prof(s, 0.2); bot = (s) => base(s) + open * H * 0.55 * prof(s, 0.18); break;
    case 'frown': top = (s) => base(s) - open * 1.2 * prof(s, 0.9); bot = (s) => base(s) + open * H * 0.6 * prof(s, 0.6); break;
    default: top = (s) => base(s) - open * 0.6 * prof(s, 0.8); bot = (s) => base(s) + open * H * 0.7 * prof(s, 0.6); // talk
  }
  const teeth = M.teeth || (shape === 'talk' && open > 0.45 ? 0.6 : 0), lteeth = M.lowerTeeth || 0;
  const bb = [Math.min(xL, xR) - 2, Math.min(yL, yR, pC[1]) - 5, Math.max(xL, xR) + 2, Math.max(yL, yR, pC[1]) + H * 1.6 + 4];
  rig.paint(bb, (hx, hy) => {
    const s = sOf(hx); if (s < 0 || s > 1) return null;
    const t = top(s), b = bot(s);
    if (b - t < 0.5) {
      if (hy >= t - 0.5 && hy < t + 0.5) return [S.lipMat, 0];
      return null;
    }
    if (hy >= t && hy < b) {
      const ft = hy - t, fb = b - hy;
      if (shape === 'grimace' && teeth) {
        const mid = (t + b) / 2;
        if (Math.abs(hy - mid) < 0.5) return [S.mouthMat, 0];
        return [S.teethMat, hy < mid ? (ft < 1 ? 0 : 1) : 0];
      }
      if (teeth && ft < (S.teethH || 1.6) * teeth + 0.2 && b - t > 1.6) return [S.teethMat, ft < 1 ? 0 : 0];
      if (lteeth && fb < 1.3 * lteeth && b - t > 2.6) return [S.teethMat, -1];
      if ((M.tongue || (open > (shape === 'talk' ? 0.8 : 0.55) && shape !== 'grimace')) && fb < 1.6 && Math.abs(s - 0.5) < 0.3) return [S.tongueMat, -1];
      return [S.mouthMat, ft < 1 ? -1 : 0];
    }
    // lips: line on top edge, lower lip shade below
    if (hy >= t - 1 && hy < t && s > 0.06 && s < 0.94) return [S.lipMat, -2];
    if (hy >= b && hy < b + 1 && s > 0.18 && s < 0.82) return [S.lipMat, -1];
    return null;
  }, { onlyMat: S.on });
  // corners
  rig.dotH(xL - 0.2, base(0) + 0.2, S.lipMat, -3, -1, { onlyMat: S.on });
  rig.dotH(xR + 0.2, base(1) + 0.2, S.lipMat, -3, -1, { onlyMat: S.on });
  if (M.snarl) {
    // upper lip raised on the near side: crease from nose wing
    const c = face.proj(-uw * 0.55, my - 3.2);
    rig.strokeH([[c[0] - 0.5, c[1] - 1.2], [c[0] - 1.6, c[1] + 1.4]], [S.skinMat, -1], { onlyMat: S.on });
  }
  return { xL, xR, yL, yR };
}

// ---- marks ----------------------------------------------------------------------------------------------
export function drawFreckles(rig, face, S, seed) {
  const r = rng(seed);
  const pts = [];
  let guard = 0;
  while (pts.length < S.n && guard++ < 400) {
    const u = (r() * 2 - 1) * S.uSpread;
    const y = S.y0 + r() * (S.y1 - S.y0);
    // denser over the nose bridge & upper cheeks, keep off the nose tip & eyes
    const nearNose = Math.abs(u) < 0.14 && y > S.y1 - 3;
    if (nearNose) continue;
    if (r() > 1 - Math.abs(u) * 0.55) continue;
    if (pts.some(([pu, py]) => Math.abs(pu - u) * 22 < 2.2 && Math.abs(py - y) < 2.2)) continue;
    pts.push([u, y]);
  }
  for (const [u, y] of pts) {
    const p = face.proj(u, y);
    rig.dotH(p[0], p[1], S.mat, 0, -1, { onlyMat: S.on });
  }
}
export function drawBlush(rig, face, S, amt) {
  if (amt <= 0) return;
  for (const sg of [-1, 1]) {
    const c = face.proj(sg * S.u, S.y);
    const k = 0.55 + amt * 0.6;
    const rx = S.rx * face.scaleAt(sg * S.u, S.y) * k, ry = S.ry * k;
    rig.paint([c[0] - rx - 1, c[1] - ry - 1, c[0] + rx + 1, c[1] + ry + 1], (hx, hy, x, y) => {
      const d = ((hx - c[0]) / rx) ** 2 + ((hy - c[1]) / ry) ** 2;
      if (d > 1) return null;
      // solid core, ordered-dither rim
      if (d < 0.45) return [S.mat, 0];
      return bayer4(x, y) < (1 - d) * 1.4 ? [S.mat, 0] : null;
    }, { onlyMat: S.on });
  }
}
const B4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const bayer4 = (x, y) => (B4[y & 3][x & 3] + 0.5) / 16;
export function drawTears(rig, eye, S, amt, side) {
  if (amt <= 0 || !eye) return;
  const dir = side === 'near' ? -1 : 1;
  const x0 = eye.ex + dir * eye.hw * 0.55, y0 = (eye.L ? eye.L(0.55) : eye.ey + 2) + 0.8;
  const len = 4 + amt * 9;
  const pts = [];
  for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push([x0 + dir * Math.sin(t * 1.4) * 1.6 - dir * t * 0.6, y0 + t * len]); }
  rig.strokeH(pts, (t) => [S.mat, 0, t < 0.25 ? 4 : 3], { onlyMat: S.on });
  const end = pts[pts.length - 1];
  rig.dotH(end[0], end[1] + 1, S.mat, 0, 4, { onlyMat: S.on });
  rig.dotH(end[0] + 1, end[1] + 1, S.mat, 0, 3, { onlyMat: S.on });
  rig.dotH(end[0], end[1] + 2, S.mat, 0, 2, { onlyMat: S.on });
}
export function drawSweat(rig, x, y, S) {
  // a translucent bead: soft rim, mid body, one bright point (fixed tones so it survives any light)
  const P = [[0, 0, 3], [-1, 1, 2], [0, 1, 5], [1, 1, 3], [-1, 2, 2], [0, 2, 4], [1, 2, 3], [0, 3, 2]];
  for (const [dx, dy, k] of P) rig.dotH(x + dx, y + dy, S.mat, 0, k, { onlyMat: S.on });
}
export function drawUnderEye(rig, eye, S, amt, side) {
  if (amt <= 0 || !eye || !eye.L) return;
  const dir = side === 'near' ? -1 : 1;
  for (let t = -0.7; t <= 0.95; t += 0.08) {
    const hx = eye.ex + dir * t * eye.hw;
    const ly = eye.L(t);
    rig.dotH(hx, ly + 1.2, S.mat, 0, -1, { onlyMat: S.on });
    if (amt > 0.6 && t > -0.3 && t < 0.7) rig.dotH(hx, ly + 2.2, S.mat, 1, -1, { onlyMat: S.on });
  }
}
/** Dirt smudges: list of [hx, hy, rx, ry, strength] in head space, dithered. */
export function drawSmudges(rig, list, S) {
  for (const [cx, cy, rx, ry, k] of list) {
    rig.paint([cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1], (hx, hy, x, y) => {
      const d = ((hx - cx) / rx) ** 2 + ((hy - cy) / ry) ** 2;
      if (d > 1) return null;
      const v = k * (1 - d);
      const b = (((x * 7 + y * 13) % 5) + 0.5) / 5;
      return b < v ? [S.mat, 0] : null;
    }, { onlyMat: S.on });
  }
}
export { smooth };
