// The Colonel's head & face rig — shared by the portraits (s≈1), the close-up CGs (s≈3–5) and the
// VHS frame. A small, serene, almost-human face (gray mutton chops joined to the mustache, clean chin,
// half-lidded eyes, polite closed smile) pressed into a vast mass of pale dough. The dough is sculpted
// as a soft-union height field (HField) with a pit the face sits in and a lip of dough lapping over
// its edges; the face is smoother and waxier than the dough; the eyes are never quite in sync.
import { GBuf, HField, M } from './colonel_gbuf.js';
import { rng } from './util.js';

/** Expression presets → rig params. lid: 0 shut … 1 wide. gaze in eye half-widths (x, y). */
export const FACE_EXPR = {
  serene:     { lidL: 0.42, lidR: 0.36, gazeL: [0.05, 0.3], gazeR: [0.22, 0.28], mouth: 0, smile: 1, brow: 0 },
  speaking:   { lidL: 0.42, lidR: 0.36, gazeL: [0.05, 0.25], gazeR: [0.22, 0.22], mouth: 1.55, smile: 0.9, brow: 0 },
  looking:    { lidL: 0.62, lidR: 0.57, gazeL: [0.02, -0.05], gazeR: [-0.02, -0.05], mouth: 0, smile: 1, brow: 0.25, glint: true },
  wrong:      { lidL: 0.68, lidR: 0.2, gazeL: [0.0, -0.05], gazeR: [0.6, -0.5], mouth: 2.7, smile: 1, brow: 0, slide: [2.2, 2.6], zoom: 1.3, glint: true },
  confused:   { lidL: 0.8, lidR: 0.72, gazeL: [-0.6, 0.55], gazeR: [-0.25, 0.7], mouth: 0.6, smile: -0.6, brow: 1.4, old: 1, wet: true },
  dissolving: { lidL: 0.55, lidR: 0.42, gazeL: [-0.35, 0.65], gazeR: [-0.05, 0.75], mouth: 0.55, smile: -0.3, brow: 0.8, old: 1, dissolve: 1 },
};

// face mask geometry (face units; eye line at v = 0)
const FRX = 14.2, FRY = 19.6, FCY = 4.2, FZ0 = 44, FH = 12;
const faceZ = (u, v) => { const d = (u / FRX) ** 2 + ((v - FCY) / FRY) ** 2; return d >= 1 ? FZ0 : FZ0 + FH * Math.sqrt(1 - d); };

/**
 * Draw head mass + face into gb. P: { cx, cy (eye-line centre), s (scale), FACE_EXPR params, chins,
 *   collar (bool), collarY, seed, blink: [l, r] lid overrides, noStrands }
 */
export function drawHead(gb, P) {
  P = { noStrands: true, ...P };
  const s = P.s, X = (u) => P.cx + u * s, Y = (v) => P.cy + v * s;
  const r = rng(P.seed ?? 1996);
  const sag = P.old ? 2.5 : 0;
  const open = Math.max(0, P.mouth || 0), mh = open * 3.2; // mouth opening (face units)
  // ---------------------------------------------------------------- the dough
  const hf = new HField(gb.w, gb.h, (P.doughK ?? 0.13) / s);
  const B = (u, v, rx, ry, hgt, p = 0.5, mat = M.FLESH) => hf.blob(X(u), Y(v), rx * s, ry * s, hgt * s, { p, mat });
  if (P.dough) {
    // a caller-designed dough (the close-up CGs): P.dough({ hf, X, Y, s, B, T }) — T is a tube in face units
    const T = (u0, v0, r0, u1, v1, r1, z0, z1, o = {}) => hf.tube(X(u0), Y(v0), r0 * s, X(u1), Y(v1), r1 * s, { mat: M.FLESH, k: 1, p: 0.5, ...o, z0: z0 * s, z1: z1 * s });
    P.dough({ hf, X, Y, s, B, T });
  } else {
  B(0, -8, 52, 56, 56);                      // cranium
  B(-6, -37, 30, 14, 52, 0.6); B(14, -31, 22, 12, 55, 0.6);   // lumpy scalp
  B(-1, -19.5, 25, 9, 64.5, 0.7);            // brow roll hanging over the little forehead
  B(-21, 15 + sag, 16, 23, 64.5, 0.55);     // jowls swallowing the face's sides (uneven)
  B(20.5, 13.5 + sag, 15.5, 23.5, 63.5, 0.55);
  B(-40, 30 + sag, 18, 22, 49, 0.5); B(40, 28 + sag, 18, 22, 49, 0.5);
  B(0, 28.4 + sag + mh * 0.85, 12.5, 7, 62.5, 0.65);   // wattle tucked under the small chin
  B(0, 37.5 + sag + mh * 0.5, 23, 8.5, 57.5, 0.6);
  B(1, 47.5 + sag, 33, 9, 49.5, 0.6);
  }
  hf.finalize();
  // the pit the face is pressed into (irregular: the dough didn't give evenly)
  {
    const pcx = X(0), pcy = Y(FCY + 1.0 + mh * 0.35), prx = (FRX + 0.3) * s, pry = (FRY - 0.9 + mh * 0.55) * s;
    const ph = r() * 6.28, depth = 13 * s, soft = 0.3;
    hf.each(pcx - prx * 1.3, pcy - pry * 1.3, pcx + prx * 1.3, pcy + pry * 1.3, (x, y, z) => {
      const u = (x + 0.5 - pcx) / prx, v = (y + 0.5 - pcy) / pry, a = Math.atan2(v, u);
      const d = Math.sqrt(u * u + v * v) / (1 + Math.sin(a * 3 + ph) * 0.07 + Math.sin(a * 5 + ph * 1.7) * 0.05 + Math.sin(a * 11 + ph) * 0.015);
      if (d >= 1) return;
      const t = d < 1 - soft ? 1 : (1 - d) / soft;
      return z - depth * t * t * (3 - 2 * t);
    });
  }
  // overhanging folds (left→right strokes drop the side below the stroke)
  const fold = (pts, w, d) => hf.fold(pts.map(([u, v]) => [X(u), Y(v)]), w * s, d * s);
  if (P.doughFolds) P.doughFolds({ hf, X, Y, s, fold }); else {
  fold([[-44, -4], [-35, -11], [-24, -16]], 2.0, 3);                                    // temple rolls
  fold([[23, -15], [34, -9], [44, 0]], 2.0, 3);
  fold([[-15, 31.5 + sag + mh], [0, 35 + sag + mh * 0.8], [15, 31.5 + sag + mh]], 1.8, 4);      // chins (U-shaped, sagging)
  fold([[-25, 40.5 + sag], [-8, 45 + sag], [6, 45.5 + sag], [26, 41 + sag]], 2.2, 5.5);
  fold([[-36, 49 + sag], [-14, 55 + sag], [10, 55.5 + sag], [37, 49.5 + sag]], 2.2, 5);
  // jowl creases running down from the face
  for (const sd of [-1, 1]) hf.groove([[X(sd * 15), Y(20)], [X(sd * 20.5), Y(28)], [X(sd * 25), Y(35)]], 1.3 * s, 1.5 * s);
  }
  // stretch marks radiating from the pit
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.3 + r() * 0.4, ca = Math.cos(a), sa = Math.sin(a);
    const r0 = 1.06 + r() * 0.05, r1 = r0 + 0.22 + r() * 0.3, bend = (r() - 0.5) * 0.25;
    const p0 = [X(ca * FRX * r0), Y(FCY + 1.6 + sa * FRY * r0)], p2 = [X(ca * FRX * r1 - sa * bend * 10), Y(FCY + 1.6 + sa * FRY * r1 + ca * bend * 10)];
    hf.groove([p0, [(p0[0] + p2[0]) / 2 + bend * 4 * s, (p0[1] + p2[1]) / 2], p2], 0.7 * s + 0.2, 1.0 * s);
  }
  // ---------------------------------------------------------------- the face (its own smooth field)
  const sl = P.slide || [0, 0];
  const fx = (u) => X(u + sl[0]), fy = (v) => Y(v + sl[1]);
  const ff = new HField(gb.w, gb.h, 0.5 / s);
  const HI = s >= 2, sink = HI ? 4 : 1.5; // at close-up scale feature volumes must merge without any cliff
  const FB = (u, v, rx, ry, prot, p = 0.6, mat = M.FACE) => ff.blob(fx(u), fy(v), rx * s, ry * s, (prot + sink) * s, { base: (faceZ(u, v) - sink) * s, p, mat });
  // optional (close-up CGs only): a shorter nose (noseK scales its length from the brow), a smaller tip
  const NK = P.noseK ?? 1, NT = P.noseTip ?? 1, NV = (v) => 0.6 + (v - 0.6) * NK;
  ff.blob(fx(0), fy(FCY + mh * 0.25), FRX * s, (FRY + mh * 0.5) * s, FH * s, { base: FZ0 * s, p: 0.5, mat: M.FACE });
  for (const sd of [-1, 1]) {
    FB(sd * 6, -3.6, 5.6, 2.6, 1.6, 0.7);                       // brow ridge
    FB(sd * 8.2, 8.2, 5.6, 4.6, 1.5 + (P.smile > 0 ? 0.5 : 0), 0.6, M.FACE);  // cheeks (lifted by the smile)
    FB(sd * 1.9, NV(7.6), 1.3, 1.1, 3.4 * NT, 0.6);              // nostril wings
  }
  ff.tube(fx(0), fy(0.6), 1.0 * s, fx(0), fy(NV(6.4)), 1.7 * s, { z0: faceZ(0, 0.6) * s + 0.8 * s, z1: faceZ(0, NV(6.4)) * s + 2.2 * NT * s, mat: M.FACE, k: 1 });
  FB(0, NV(7.1), 2.1 * NT, 1.7 * NT, 3.9 * NT, 0.6);              // nose tip
  FB(0, 16.4 + mh, 3.2, 1.2, 0.8, 0.6);                         // lower lip (barely)
  FB(0, 16.5 + mh * 0.7, 8.5, 6.5, 2.6, 0.5);                   // the clean-shaven lower face, turned to the light
  FB(0, 19.6 + mh, 5.2, 3.4, 1.6 * (P.chinK ?? 1), 0.7);         // small clean chin
  ff.finalize();
  for (const sd of [-1, 1]) {
    ff.pit(fx(sd * 6), fy(0.2), 4.4 * s, 2.7 * s, 1.4 * s, 0.6); // sockets
    ff.groove([[fx(sd * 2.4), fy(7.8)], [fx(sd * 4.6), fy(11)], [fx(sd * 5.6), fy(14.5)]], 0.9 * s + 0.2, (P.old ? 1.2 : 0.5) * s);
  }
  if (P.old) {
    for (const sd of [-1, 1]) {
      ff.groove([[fx(sd * 9.2), fy(-1.4)], [fx(sd * 11), fy(0.2)], [fx(sd * 10.6), fy(2.2)]], 0.7 * s + 0.2, 0.6 * s);
      ff.groove([[fx(sd * 3.4), fy(3)], [fx(sd * 6), fy(4.3)], [fx(sd * 8.8), fy(3)]], 0.7 * s + 0.2, 0.7 * s);
    }
    ff.groove([[fx(-4.5), fy(-9.5)], [fx(0), fy(-10.2)], [fx(4.5), fy(-9.5)]], 0.6 * s + 0.2, 0.5 * s);
  }
  if (HI) faceGrooves(ff, fx, fy, s, P, mh);
  // composite: face only where it rises above the pitted dough
  hf.maxWith(ff);
  if (P.slide) { // the gap the face slid out of: raw, darker dough
    const gx = X(0), gy = Y(FCY);
    hf.toGB(gb, { matFn: (x, y, m) => (m === M.FLESH && ((x - gx) / (FRX * s)) ** 2 + ((y - gy) / (FRY * s)) ** 2 < 1.1) ? M.FLESH_D : m });
  } else hf.toGB(gb);
  // blush: a doll's faint paint on the cheeks
  for (const sd of [-1, 1]) {
    const bx = fx(sd * 8.4), by = fy(8.2);
    for (let y = Math.floor(by - 1.6 * s); y <= by + 1.6 * s; y++) for (let x = Math.floor(bx - 2.2 * s); x <= bx + 2.2 * s; x++) {
      if (gb.matAt(x, y) === M.FACE && ((x + 0.5 - bx) / (2.2 * s)) ** 2 + ((y + 0.5 - by) / (1.6 * s)) ** 2 < (HI ? 0.6 : 1) && (HI ? ((x & 1) && (y & 1) && ((x + y) & 2)) : ((x + y) & 1))) gb.mat[y * gb.w + x] = M.BLUSH;
    }
  }
  for (let y = Math.floor(fy(15.6 + mh)); y <= fy(23.5 + mh); y++) for (let x = Math.floor(fx(-5)); x <= fx(5); x++) {
    const m = gb.matAt(x, y);
    if (m === M.FACE) { const i = y * gb.w + x; gb.lum[i] += 0.07 * (P.lowerLum ?? 1); gb.ao[i] = Math.max(gb.ao[i], 0.85); }
  }
  const F = { X: fx, Y: fy, s };
  if (HI) hairStrands(gb, F, P, mh, r);
  drawFeatures(gb, F, P, mh, r);
  if (P.collar !== false) drawCollar(gb, P, X, Y, s);
  // scalp: three thin gray strands combed across the dome, far above the little face
  if (!P.noStrands) {
    for (let k = 0; k < 3; k++) {
      const y0 = -41 - k * 5 + r() * 2, x0 = -24 + r() * 6 + k * 3, x1 = 20 + r() * 8 - k * 2;
      gb.curve(X(x0), Y(y0 + 4), X((x0 + x1) / 2), Y(y0 - 3 - r() * 2), X(x1), Y(y0 + 6), (x, y, t) => {
        if (t > 0.1 + k * 0.05 && t < 0.9 && gb.matAt(x, y) === M.FLESH && ((x * 7 + y * 3 + k) % 11) > 1) gb.pix(x, y, M.HAIR, { mode: 'over', lum: 0.02 });
      });
    }
  }
}

function drawFeatures(gb, F, P, mh, r) {
  const s = F.s, X = F.X, Y = F.Y, Z = (u, v, d) => (faceZ(u, v) + d) * s;
  // ---- eyes
  for (const sd of [-1, 1]) {
    const L = sd < 0;
    const lid = P.blink ? P.blink[L ? 0 : 1] : (L ? P.lidL : P.lidR);
    eye(gb, X(sd * 6), Y(0.2), s, lid, L ? P.gazeL : P.gazeR, Z(sd * 6, 0, 0.6), P.glint, sd, P.wet, P.eyeSmile || 0);
  }
  const HI = s >= 2;
  // ---- brows: thin, gray, groomed (inner ends lift with P.brow)
  if (!HI) for (const sd of [-1, 1]) {
    const bi = P.brow || 0;
    const o = { mat: M.HAIR, rzk: 0.5, mode: 'z' };
    gb.cap(X(sd * 2.4), Y(-4.3 - bi * 1.4), 0.5 * s + 0.2, X(sd * 6.4), Y(-5.4 - bi * 0.5), 0.72 * s + 0.2, { ...o, z0: Z(2.4, -4.3, 2.2), z1: Z(6.4, -5.4, 2.4) });
    gb.cap(X(sd * 6.4), Y(-5.4 - bi * 0.5), 0.72 * s + 0.2, X(sd * 10.2), Y(-3.9), 0.4 * s + 0.2, { ...o, z0: Z(6.4, -5.4, 2.4), z1: Z(10.2, -3.9, 1.8) });
  }
  // ---- mutton chops (joined to the mustache; chin left clean)
  if (!HI) for (const sd of [-1, 1]) {
    const pts = [[10.6, -8.5], [13.2, -3], [13.6, 4], [12.8, 11], [10.6, 15.4 + mh * 0.25], [7.8, 14.8 + mh * 0.2], [6.4, 12.4], [8.8, 9.0], [9.8, 2], [9.6, -6]];
    gb.poly(pts.map(([u, v]) => [X(sd * u), Y(v)]), {
      mat: M.HAIR, mode: 'on', tol: 2.5 * s, zf: (x, y) => gb.z[y * gb.w + x] + 0.8 * s,
      nf: (x, y) => { const u = (x + 0.5 - X(0)) / s * sd; return [sd * (u - 10.5) / 7, ((y - Y(4)) / s) / 26 - 0.1, 0.85]; },
    });
    for (let k = 0; k < 7; k++) { // combed strands
      const u0 = 9.8 + k * 0.5 + r() * 0.5, v0 = -7 + k * 1.3;
      gb.curve(X(sd * u0), Y(v0), X(sd * (u0 + 2.4)), Y(v0 + 9), X(sd * (u0 - 2.6 - k * 0.5)), Y(v0 + 16), (x, y) => { if (gb.matAt(x, y) === M.HAIR) gb.dim(x, y, 0.8); });
    }
  }
  // ---- mustache: heavy drooping wings that hide the upper lip
  const ml = mh * 0.18;
  if (!HI) for (const sd of [-1, 1]) {
    const o = { mat: M.HAIR, rzk: 0.65, mode: 'z' };
    gb.cap(X(sd * 0.7), Y(10.4 - ml), 1.75 * s, X(sd * 5.2), Y(12.0 - ml), 1.7 * s, { ...o, z0: Z(0.7, 10.3, 2.2), z1: Z(5.2, 11.9, 1.8) });
    gb.cap(X(sd * 5.2), Y(12.0 - ml), 1.7 * s, X(sd * 8.0), Y(14.8 - ml * 0.5), 0.9 * s, { ...o, z0: Z(5.2, 11.9, 1.8), z1: Z(8.2, 14.6, 1.5) });
    for (let k = 0; k < 4; k++) gb.curve(X(sd * (0.5 + k * 0.7)), Y(9.4 - ml), X(sd * (4 + k)), Y(10.5 + k * 0.6 - ml), X(sd * (7 + k * 0.4)), Y(13.2 + k * 0.3 - ml), (x, y) => { if (gb.matAt(x, y) === M.HAIR) gb.dim(x, y, 0.84); });
  }
  if (!HI) gb.line(X(0), Y(9.2 - ml), X(0), Y(11.4 - ml), null, { k: 0.72 });
  // ---- mouth
  const my = 14.9;
  const sm = P.smile ?? 1;
  if (mh < 0.3 && HI) {
    // close-up: the lips are sculpted (faceGrooves); a touch of shadow tucks the corners in
    for (const sd of [-1, 1]) gb.ell(X(sd * 5.3), Y(my - 0.9 * sm), 0.55 * s, 0.5 * s, { mat: M.FACE, mode: 'over', z: Z(5.3, my, 0.5), rz: 0.3 * s, ao: 0.55 });
  } else if (mh < 0.3) {
    // closed polite smile: the mustache hides the lips; just the corners, lifted, and a soft line
    for (const sd of [-1, 1]) {
      gb.curve(X(sd * 4.0), Y(my + 0.2), X(sd * 4.8), Y(my), X(sd * 5.4), Y(my - 0.9 * sm), (x, y) => gb.dim(x, y, 0.42));
      gb.dim(X(sd * 5.7), Y(my - 1.3 * sm), 0.8);
    }
    gb.curve(X(-3.6), Y(my + 0.3), X(0), Y(my + 0.9), X(3.6), Y(my + 0.3), (x, y) => { if (gb.matAt(x, y) !== M.HAIR) gb.dim(x, y, 0.55); });
  } else {
    // it opens a little too far, vertically: narrow, tall, lightless
    const mw = Math.max(1.6, 2.9 - mh * 0.12) * s, mH = mh * s;
    gb.ell(X(0), Y(my + 0.4 + mh * 0.5), mw + 0.7 * s, mH * 0.5 + 0.9 * s, { mat: M.LIP, z: Z(0, my, 1.4), rz: 1.0 * s, mode: 'on', tol: 3 * s });
    gb.ell(X(0), Y(my + 0.4 + mh * 0.5), mw, mH * 0.5, { mat: M.MOUTH, z: Z(0, my, 1.6), rz: 0.4 * s, mode: 'any' });
    for (const sd of [-1, 1]) gb.curve(X(sd * 2.0), Y(my + 0.6), X(sd * 3.6), Y(my + 0.2), X(sd * 4.8), Y(my - 0.9 * sm), (x, y) => gb.pix(x, y, M.MOUTH, { mode: 'over' }));
    gb.pix(X(0.8), Y(my + 0.6 + mh * 0.95), M.LIP, { mode: 'over', lum: 0.3 }); // wet glint on the lower lip
  }
}

// close-up scale: lid creases, lower lids and the line of the lips are carved into the face's surface
function faceGrooves(ff, fx, fy, s, P, mh) {
  const G = (pts, w, d) => ff.groove(pts.map(([u, v]) => [fx(u), fy(v)]), w * s, d * s);
  for (const sd of [-1, 1]) {
    const lid = P.blink ? P.blink[sd < 0 ? 0 : 1] : (sd < 0 ? P.lidL : P.lidR);
    const ex = sd * 6, ey = 0.2, hw = 3.45, hh = 2.1;
    const lidY = ey - hh + (1 - lid) * hh * 2, cy = Math.min(lidY - 1.1, ey - hh * 1.25);
    G([[ex - hw * 0.95, cy + 0.8], [ex - hw * 0.3, cy - 0.35], [ex + hw * 0.4, cy - 0.3], [ex + hw, cy + 0.7]], 0.85, 0.55);
    const es = P.eyeSmile || 0;
    G([[ex - hw * 0.8, ey + hh * (0.85 - es * 0.5)], [ex, ey + hh * (1.45 - es * 0.75)], [ex + hw * 0.8, ey + hh * (0.85 - es * 0.5)]], 0.75, 0.28 + es * 0.3);
  }
  const my = 14.9, sm = P.smile ?? 1;
  if (mh < 0.3) {
    G([[-6.6, my - 1.6 * sm], [-5.2, my - 0.4 * sm], [-3.6, my + 0.3], [0, my + 0.9], [3.6, my + 0.3], [5.2, my - 0.4 * sm], [6.6, my - 1.6 * sm]], 0.55, 0.75);
    G([[-3.0, my + 2.5], [0, my + 3.2], [3.0, my + 2.5]], 0.75, 0.35); // under the lower lip
  }
  if (sm > 0.5) for (const sd of [-1, 1]) G([[sd * 3.0, 7.2], [sd * 5.6, 9.4], [sd * 7.4, 12.4]], 0.85, 0.45 * sm); // smile lines past the whiskers
}

// close-up scale: whiskers as soft volumes combed with fine, irregular flow grooves
function hairStrands(gb, F, P, mh, r) {
  const s = F.s, X = F.X, Y = F.Y;
  const hf = new HField(gb.w, gb.h, 0.35 / s).finalize(); // hard-max union: chained strokes must not bulge at joints
  const quad = (a, b, c, n = 9) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, q = 1 - t; o.push([q * q * a[0] + 2 * q * t * b[0] + t * t * c[0], q * q * a[1] + 2 * q * t * b[1] + t * t * c[1]]); } return o; };
  const vol = (pts, rads, lifts) => {
    for (let k = 0; k + 1 < pts.length; k++) {
      const t0 = k / (pts.length - 1), t1 = (k + 1) / (pts.length - 1);
      const ra = rads(t0), rb = rads(t1);
      const [u0, v0] = pts[k], [u1, v1] = pts[k + 1];
      hf.tube(X(u0), Y(v0), ra * s, X(u1), Y(v1), rb * s, { mat: M.HAIR, z0: (faceZ(u0, v0) + lifts(t0) - ra * 0.5) * s, z1: (faceZ(u1, v1) + lifts(t1) - rb * 0.5) * s, k: 0.7, p: 0.6 });
    }
  };
  const combs = [];
  const ml = mh * 0.18;
  for (const sd of [-1, 1]) {
    // mutton chop: temple → down the cheek → sweeping in to the mustache
    vol(quad([sd * 11.1, -8.2], [sd * 13.4, 4.5], [sd * 8.6, 14.2 + mh * 0.25]), (t) => 1.5 + Math.sin(t * Math.PI) * 1.3, (t) => 2.6 + Math.sin(t * Math.PI) * 1.0);
    for (let j = 0; j < 34; j++) {
      const t = r(), jit = () => (r() - 0.5) * 0.6;
      combs.push(quad([sd * (10.2 + t * 2.4 + jit()), -8 + jit() + t], [sd * (11.4 + t * 3.4 + jit()), 4 + jit()], [sd * (7.4 + t * 3.2 + jit()), 13.4 + t * 2 + mh * 0.25 + jit()]));
    }
    // mustache wing, drooping past the mouth corners
    const lift = (P.smile ?? 1) > 0.5 ? 0.9 + (P.eyeSmile || 0) * 2.4 : 0;
    vol(quad([sd * 0.4, 10.1 - ml], [sd * 4.6, 10.9 - ml - lift * 0.3], [sd * 7.8, 14.4 - ml * 0.5 - lift]), (t) => 1.75 - t * 0.95, (t) => 3.6 - t * 1.2);
    for (let j = 0; j < 20; j++) {
      const t = r(), jit = () => (r() - 0.5) * 0.45;
      combs.push(quad([sd * (0.3 + t * 1.2), 9.4 + t * 1.6 - ml + jit() * 0.4], [sd * (4.2 + jit()), 10.4 + t * 1.6 - ml + jit()], [sd * (7.6 + t * 0.9 + jit()), 13.6 + t * 1.6 - ml * 0.5 + jit()]));
    }
    // brows: thin, groomed (inner ends lift with P.brow)
    const bi = P.brow || 0;
    vol(quad([sd * 2.3, -4.3 - bi * 1.4], [sd * 6.2, -5.9 - bi * 0.5], [sd * 10.2, -3.9], 6), (t) => 0.62 - t * 0.25, () => 1.9);
    for (let j = 0; j < 2; j++) combs.push(quad([sd * 2.6, -4.3 - bi * 1.4 + j * 0.35 - 0.2], [sd * 6.2, -5.9 - bi * 0.5 + j * 0.35 - 0.2], [sd * 9.8, -4 + j * 0.3], 6));
  }
  for (const c of combs) hf.groove(c.map(([u, v]) => [X(u), Y(v)]), 0.24 * s, (0.3 + r() * 0.3) * s);
  hf.toGB(gb, { mode: 'z' });
  // stray whiskers past the edge of each mass
  for (let j = 0; j < 10; j++) {
    const sd = j & 1 ? 1 : -1, t = r();
    const u = sd * (8.2 + t * 6), v = 4 + t * 10 + (r() - 0.5) * 6;
    const x0 = X(u), y0 = Y(v), x1 = x0 + sd * (0.4 + r()) * s * 0.6, y1 = y0 + (0.8 + r()) * s * 0.7;
    gb.line(x0, y0, x1, y1, M.HAIR, { mode: 'on', tol: 3 * s, z: (faceZ(u, v) + 1.8) * s, n: [sd * 0.3, -0.2, 0.9], lum: 0.04 });
  }
}

function eye(gb, ex, ey, s, lid, gz, ez, glint, sd, wet, es = 0) {
  const hw = 3.45 * s, hh = 2.1 * s;
  const inAlmond = (x, y) => {
    const u = (x + 0.5 - ex) / hw, v = (y + 0.5 - ey) / hh, w = v - sd * u * 0.14, lim = 1 - u * u;
    return w < 0 ? -w < lim : w < lim * (1 - 0.6 * es); // a smile pushes the lower lid up
  };
  gb.ell(ex, ey, hw, hh * 1.05, { mat: M.EYE, z: ez, rz: 1.5 * s, mode: 'any', clip: inAlmond, ao: 0.95 });
  const ix = ex + gz[0] * hw * 0.55, iy = ey + gz[1] * hh * 0.45;
  gb.ell(ix, iy, 1.5 * s, 1.65 * s, { mat: M.IRIS, z: ez + 0.5 * s, rz: 1.3 * s, mode: 'any', clip: inAlmond });
  gb.ell(ix, iy, 0.62 * s, 0.7 * s, { mat: M.DARK, z: ez + 0.6 * s, rz: 1 * s, mode: 'any', clip: inAlmond });
  if (glint) { const gy = Math.max(iy - 0.7 * s, ey - hh + (1 - lid) * hh * 2 + 0.5 * s + 1); gb.ell(ix - 0.6 * s, gy, Math.max(0.5, 0.28 * s), Math.max(0.5, 0.24 * s), { mat: M.EYE, mode: 'any', z: ez + 1.5 * s, rz: 0.2 * s, lum: 1.0, clip: (x, y) => inAlmond(x, y) }); }
  if (wet) for (let k = -1; k <= 1; k++) gb.pix(ex + k * hw * 0.45, ey + hh * 0.82, M.EYE, { mode: 'any', lum: 0.55, n: [0, -0.3, 1] }); // watery old eyes
  // the heavy upper lid comes down to `lid`
  const lidY = ey - hh + (1 - lid) * hh * 2;
  gb.ell(ex, ey - hh * 0.3, hw * 1.12, hh * 1.3, {
    mat: M.FACE, z: ez + 1.0 * s, rz: 1.4 * s, mode: 'any', tilt: [0, -0.4],
    clip: (x, y) => y + 0.5 < lidY && (inAlmond(x, y) || inAlmond(x, y + 1)),
  });
  // lash line (dark, slightly heavier at the outer corner)
  for (let x = Math.floor(ex - hw); x <= Math.ceil(ex + hw); x++) {
    for (let y = Math.floor(lidY - 1); y <= Math.ceil(lidY + 1); y++) {
      if (!inAlmond(x, y)) continue;
      const outer = (x + 0.5 - ex) * sd > hw * 0.35;
      if (Math.abs(y + 0.5 - lidY) < 0.5 + 0.1 * s + (outer ? 0.15 * s : 0)) gb.pix(x, y, M.DARK, { mode: 'any', z: ez + 1.2 * s });
    }
  }
  if (s >= 2) { // a few lashes at the outer corner
    for (let k = 0; k < 4; k++) { const lx = ex + sd * hw * (0.45 + k * 0.15), ly = lidY + (sd * (lx - ex) / hw) * hh * 0.14 * sd; gb.line(lx, ly, lx + sd * s * 0.35, ly + s * (0.55 + k * 0.05), M.DARK, { mode: 'any', z: ez + 1.3 * s }); }
    return;
  }
  // lid crease & lower lid
  const cy = Math.min(lidY - 1.0 * s, ey - hh * 1.2);
  gb.curve(ex - hw * 0.9, cy + 0.7 * s, ex, cy - 0.5 * s, ex + hw * 0.95, cy + 0.6 * s, (x, y) => gb.dim(x, y, 0.74));
  gb.curve(ex - hw * 0.8, ey + hh * 0.7, ex, ey + hh * 1.35, ex + hw * 0.8, ey + hh * 0.7, (x, y) => { if (gb.matAt(x, y) !== M.EYE) gb.dim(x, y, 0.86); });
}

function drawCollar(gb, P, X, Y, s) {
  // the frock coat's standing collar, buried under the chins; epaulettes half-swallowed at the shoulders
  const yb = P.collarY ?? 50;
  const hf = new HField(gb.w, gb.h, 0.25 / s);
  hf.blob(X(0), Y(yb + 44), 96 * s, 46 * s, 30 * s, { mat: M.NAVY, p: 0.5 });              // coat body
  for (const sd of [-1, 1]) {
    hf.blob(X(sd * 45), Y(yb + 5), 14 * s, 6.5 * s, 9 * s, { base: 27 * s, mat: M.GOLD, p: 0.45 }); // epaulette crescent
    hf.blob(X(sd * 31), Y(yb + 1.5), 15 * s, 8.5 * s, 37 * s, { mat: M.FLESH, p: 0.6 });          // shoulder flesh over it
  }
  hf.finalize();
  for (const sd of [-1, 1]) { // braid rows on the crescent
    for (let k = 1; k <= 3; k++) hf.groove([[X(sd * 45 - 13 + k), Y(yb + 5)], [X(sd * 45), Y(yb + 5 - 6.5 + k * 1.6)], [X(sd * 45 + 13 - k), Y(yb + 5)]].map(([x, y]) => [x, y]), 0.6 * s, 0.8 * s);
  }
  hf.toGB(gb);
  // collar band + gold edge, mostly under the chins
  gb.poly([[X(-38), Y(yb - 3)], [X(38), Y(yb - 3)], [X(42), Y(yb + 6)], [X(-42), Y(yb + 6)]], { mat: M.NAVY_D, z: 18 * s, mode: 'z', n: [0, -0.3, 1] });
  gb.line(X(-38), Y(yb - 3), X(38), Y(yb - 3), M.GOLD, { mode: 'z', z: 19 * s, n: [0, -0.7, 0.7] });
  // bullion fringe hanging off the crescents (twisted: alternate dim pixels)
  for (const sd of [-1, 1]) for (let k = 0; k < 9; k++) {
    const fx = X(sd * 45 + (k - 4) * 2.7), y0 = Y(yb + 9.5), y1 = Y(yb + 20);
    gb.cap(fx, y0, 1.15 * s, fx + sd * 0.5 * s, y1, 1.0 * s, { mat: M.GOLD, z0: 30 * s, z1: 26 * s, rzk: 0.9, mode: 'z' });
    for (let y = Math.round(y0); y < y1; y += 2) gb.dim(Math.round(fx + ((y >> 1) & 1)), y, 0.6);
  }
  // a silver eagle on each strap (a colonel's rank), just a glint at this size
  for (const sd of [-1, 1]) gb.ell(X(sd * 47), Y(yb + 3.5), 1.8 * s, 1.1 * s, { mat: M.SILVER, z: 37 * s, rz: 1 * s, mode: 'z' });
}

/** Repaint only the eyes (new lids) on a buffer that already holds this head — cheap blink states. */
export function repaintEyes(gb, P) {
  const s = P.s, sl = P.slide || [0, 0];
  const X = (u) => P.cx + (u + sl[0]) * s, Y = (v) => P.cy + (v + sl[1]) * s, Z = (u, v, d) => (faceZ(u, v) + d) * s;
  for (const sd of [-1, 1]) {
    const L = sd < 0;
    const lid = P.blink ? P.blink[L ? 0 : 1] : (L ? P.lidL : P.lidR);
    eye(gb, X(sd * 6), Y(0.2), s, lid, L ? P.gazeL : P.gazeR, Z(sd * 6, 0, 0.6), P.glint, sd, P.wet, P.eyeSmile || 0);
  }
}

/** Convenience: new GBuf with a head drawn into it. */
export function headBuffer(w, h, P) {
  const gb = new GBuf(w, h);
  drawHead(gb, P);
  return gb;
}
