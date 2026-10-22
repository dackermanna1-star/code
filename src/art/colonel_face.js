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
  // (close-up CG only) WHO IS OUT OF THEIR SEAT — rage, not shock: the brows driven down and in (scowl), the
  // upper lids pressed down by them and slanting to the nose (lidTilt) so the irises' tops are cut, the lower
  // lids pushed up (eyeSmile), nostrils flared, cheeks bunched; the mouth torn wide and dropped far too far
  // (howl: the upper lip lifted off old teeth on one side)
  fury:       { lidL: 0.74, lidR: 0.78, lidTilt: 0.95, gazeL: [0.1, -0.3], gazeR: [-0.1, -0.3], mouth: 3.4, smile: -0.7, brow: -0.9, iris: 0.95, eyeSmile: 0.36, scowl: 1, howl: { snarl: 1, side: 1 }, jawK: 0.5, glint: false, chopK: 0.5 },
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
    const pcx = X(0), pcy = Y(FCY + 1.0 + mh * 0.35 * (P.jawK ?? 1)), prx = (FRX + 0.3) * s, pry = (FRY - 0.9 + mh * 0.55 * (P.jawK ?? 1)) * s;
    const ph = r() * 6.28, depth = (P.pitDepth ?? 13) * s, soft = 0.3;
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
  // (close-up CGs) dough that laps OVER the face's edge — rolls pressing in on it, soft-maxed into the
  // finished field so they cross the rim the face sits in: P.doughOver({ hf, X, Y, s, fold, lip })
  if (P.doughOver) {
    const smax = (z, b, kk) => { const m = Math.max(z, b); return m + Math.log(Math.exp(kk * (z - m)) + Math.exp(kk * (b - m))) / kk; };
    // lip(rb): the dough's rim raised and pushed in over the face's edge, down to ρ = rb(a) of the face oval
    // (a = angle on the oval, 0 = his left… screen right, π/2 = down); h = how far it swells past the edge
    const cy0 = FCY + mh * 0.25 * (P.jawK ?? 1), ry0 = FRY + mh * 0.5 * (P.jawK ?? 1);
    const lip = (rb, h = 3, lift = 0) => {
      hf.each(X(-FRX * 1.4), Y(cy0 - ry0 * 1.4), X(FRX * 1.4), Y(cy0 + ry0 * 1.4), (x, y, z) => {
        const u = (x + 0.5 - X(0)) / s, v = (y + 0.5 - Y(0)) / s, a = Math.atan2((v - cy0) / ry0, u / FRX), rho = Math.hypot(u / FRX, (v - cy0) / ry0);
        const r0 = rb(a); if (rho < r0 - 0.1 || rho > 1.5) return;
        const fz = FZ0 + FH * Math.sqrt(Math.max(0, 1 - r0 * r0)) + (typeof lift === 'function' ? lift(a) : lift);
        const lz = (fz - 0.8 + h * sst(r0 - 0.06, r0 + 0.16, rho) - 30 * sst(r0 + 0.2, r0 + 0.55, rho)) * s;
        return smax(z, lz, 0.5 / s);
      });
    };
    P.doughOver({ hf, X, Y, s, fold, lip });
  }
  // (close-up fury) folds of fat that run on across the face's edge: carved into the dough here and into
  // the face below, so the rolls cross the rim instead of stopping at it. P.rimFolds: [[pts (face units), w, d]]
  for (const [pts, w, d] of P.rimFolds || []) fold(pts, w, d);
  if (P.doughFolds) P.doughFolds({ hf, X, Y, s, fold }); else {
  fold([[-44, -4], [-35, -11], [-24, -16]], 2.0, 3);                                    // temple rolls
  fold([[23, -15], [34, -9], [44, 0]], 2.0, 3);
  fold([[-15, 31.5 + sag + mh], [0, 35 + sag + mh * 0.8], [15, 31.5 + sag + mh]], 1.8, 4);      // chins (U-shaped, sagging)
  fold([[-25, 40.5 + sag], [-8, 45 + sag], [6, 45.5 + sag], [26, 41 + sag]], 2.2, 5.5);
  fold([[-36, 49 + sag], [-14, 55 + sag], [10, 55.5 + sag], [37, 49.5 + sag]], 2.2, 5);
  // jowl creases running down from the face
  for (const sd of [-1, 1]) hf.groove([[X(sd * 15), Y(20)], [X(sd * 20.5), Y(28)], [X(sd * 25), Y(35)]], 1.3 * s, 1.5 * s);
  }
  // stretch marks radiating from the pit (the close-up CGs build their own folds: P.noStretch)
  if (!P.noStretch) for (let k = 0; k < 9; k++) {
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
  const NK = P.noseK ?? 1, NT = P.noseTip ?? 1, NV = (v) => (NK === 1 ? v : 0.6 + (v - 0.6) * NK);
  const jk = P.jawK ?? 1;
  ff.blob(fx(0), fy(FCY + mh * 0.25 * jk), FRX * s, (FRY + mh * 0.5 * jk) * s, FH * s, { base: FZ0 * s, p: 0.5, mat: M.FACE });
  const sc = HI ? (P.scowl || 0) : 0;   // (close-up fury) brows driven down and in, cheeks bunched, nostrils flared
  for (const sd of [-1, 1]) {
    FB(sd * (6 - 0.9 * sc), -3.6 + 1.1 * sc, 5.6 - 0.4 * sc, 2.6, 1.6 + 1.8 * sc, 0.7);                       // brow ridge (rage: pulled down over the lids)
    FB(sd * 8.2, 8.2 - 1.8 * sc, 5.6, 4.6 - 0.5 * sc, 1.5 + (P.smile > 0 ? 0.5 : 0) + 1.3 * sc, 0.6, M.FACE);  // cheeks (lifted by the smile, bunched by rage)
    FB(sd * (1.9 + 0.6 * sc), NV(7.6 - 0.2 * sc), 1.3 + 0.5 * sc, 1.1 + 0.25 * sc, 3.4 * NT, 0.6);              // nostril wings (flared)
  }
  if (sc) FB(0, -2.4, 2.4, 2.6, 2.4 * sc, 0.6);                 // the knot of muscle between the brows
  ff.tube(fx(0), fy(0.6), 1.0 * s, fx(0), fy(NV(6.4)), 1.7 * s, { z0: faceZ(0, 0.6) * s + 0.8 * s, z1: faceZ(0, NV(6.4)) * s + 2.2 * NT * s, mat: M.FACE, k: 1 });
  FB(0, NV(7.1), 2.1 * NT, 1.7 * NT, 3.9 * NT, 0.6);              // nose tip
  if (!(HI && P.howl)) FB(0, (P.mouthY == null ? 16.4 : P.mouthY + 1.5) + mh, 3.2, 1.2, 0.8, 0.6);   // lower lip (barely)
  FB(0, 16.5 + mh * 0.7 * jk, 8.5, 6.5, 2.6, 0.5);              // the clean-shaven lower face, turned to the light
  FB(0, 19.6 + mh * jk, 5.2, 3.4, 1.6 * (P.chinK ?? 1), 0.7);    // small clean chin
  ff.finalize();
  for (const [pts, w, d] of P.rimFolds || []) ff.fold(pts.map(([u, v]) => [fx(u), fy(v)]), w * s, d * s);
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
    eye(gb, X(sd * 6), Y(0.2), s, lid, L ? P.gazeL : P.gazeR, Z(sd * 6, 0, 0.6), P.glint, sd, P.wet, P.eyeSmile || 0, P.iris ?? 1, P.lidTilt || 0);
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
  const my = P.mouthY ?? 14.9;
  const sm = P.smile ?? 1;
  if (mh < 0.3 && HI) {
    // close-up: the lips are sculpted (faceGrooves); a touch of shadow tucks the corners in
    for (const sd of [-1, 1]) gb.ell(X(sd * 5.3), Y(my - 0.9 * sm), 0.55 * s, 0.5 * s, { mat: M.FACE, mode: 'over', z: Z(5.3, my, 0.5), rz: 0.3 * s, ao: 0.55, clip: (x, y) => gb.matAt(x, y) !== M.HAIR });
  } else if (mh < 0.3) {
    // closed polite smile: the mustache hides the lips; just the corners, lifted, and a soft line
    for (const sd of [-1, 1]) {
      gb.curve(X(sd * 4.0), Y(my + 0.2), X(sd * 4.8), Y(my), X(sd * 5.4), Y(my - 0.9 * sm), (x, y) => gb.dim(x, y, 0.42));
      gb.dim(X(sd * 5.7), Y(my - 1.3 * sm), 0.8);
    }
    gb.curve(X(-3.6), Y(my + 0.3), X(0), Y(my + 0.9), X(3.6), Y(my + 0.3), (x, y) => { if (gb.matAt(x, y) !== M.HAIR) gb.dim(x, y, 0.55); });
  } else if (HI && P.howl) {
    howlMouth(gb, F, P, mh);
  } else if (HI && P.slot) {
    // (close-up fury) the mouth drops open far too far: an uneven slot, wide just under the thin upper lip,
    // narrowing as it falls to the chin; no rim of lip down its sides — stretched skin, a 1-px wet dark-red
    // edge, black inside; the corners dragged down
    const top = Y(my - 0.2), bot = Y(my + 0.4 + mh), H2 = Math.max(1, bot - top), cx0 = X(0);
    const halfAt = (yy) => {
      const t = (yy - top) / H2;
      let hw2 = s * (3.1 - 2.0 * t) * (t < 0.1 ? 0.55 + t * 4.5 : 1) * (t > 0.88 ? Math.sqrt(Math.max(0, (1 - t) / 0.12)) : 1);
      return Math.max(0, hw2 + Math.sin(yy * 0.37) * 0.5 + Math.sin(yy * 0.11 + 1) * 0.7);
    };
    const skew = (yy) => ((yy - top) / H2) * 0.9 * s * 0.4;
    for (let yy = Math.floor(top); yy <= Math.ceil(bot); yy++) {
      const hw2 = halfAt(yy + 0.5), c = cx0 + skew(yy);
      for (let xx = Math.floor(c - hw2 - 2); xx <= Math.ceil(c + hw2 + 2); xx++) {
        const e = Math.abs(xx + 0.5 - c) - hw2;
        if (e < -1) gb.pix(xx, yy, M.MOUTH, { mode: 'any', z: Z(0, my, 1.6), lum: -0.5 });
        else if (e < 0) gb.pix(xx, yy, M.LIP, { mode: 'any', z: Z(0, my, 1.5), lum: -0.45 });            // the wet edge
      }
    }
    // the upper lip: thin, stretched, its corners pulled down past the slot
    for (let xx = Math.floor(cx0 - 5.4 * s); xx <= cx0 + 5.4 * s; xx++) {
      const u = (xx + 0.5 - cx0) / s, ly = Y(my - 0.2 + Math.max(0, Math.abs(u) - 2.6) * 0.55 * Math.abs(sm));
      for (let k = 0; k < 2; k++) if (Math.abs(u) < 3.6 - k * 0.8) gb.pix(xx, Math.round(ly) - 1 - k, M.LIP, { mode: 'any', z: Z(0, my, 1.4), lum: k ? 0.1 : -0.1 });
      if (Math.abs(u) > 3.2) gb.pix(xx, Math.round(ly), M.FACE, { mode: 'over', lum: -0.35 });                  // the corners, dragged down
    }
    // the lower lip, carried down with the jaw: a thin band under the slot's end
    for (let xx = Math.floor(cx0 - 2.4 * s); xx <= cx0 + 2.4 * s; xx++) {
      const u = (xx + 0.5 - cx0) / (2.4 * s), yy = Math.round(bot + 1 - u * u * 1.5);
      gb.pix(xx + Math.round(skew(bot)), yy, M.LIP, { mode: 'any', z: Z(0, my + mh, 1.4), lum: 0.05 });
      gb.pix(xx + Math.round(skew(bot)), yy + 1, M.LIP, { mode: 'any', z: Z(0, my + mh, 1.3), lum: -0.2 });
    }
    // tension: creases fanning from the corners down and out over the stretched cheeks
    for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) {
      const a = [X(sd * (4.6 + k * 0.5)), Y(my + 0.6 + k * 1.6)], c = [X(sd * (6.4 + k * 0.9)), Y(my + 4.2 + k * 2.6)];
      gb.curve(a[0], a[1], (a[0] + c[0]) / 2 + sd * s * 0.4, (a[1] + c[1]) / 2, c[0], c[1], (x, y) => { if (gb.matAt(x, y) === M.FACE) gb.dim(x, y, 0.8); });
    }
  } else {
    // it opens a little too far, vertically: narrow, tall, lightless
    const mw = Math.max(1.6, 2.9 - mh * 0.12) * s, mH = mh * s;
    gb.ell(X(0), Y(my + 0.4 + mh * 0.5), mw + 0.7 * s, mH * 0.5 + 0.9 * s, { mat: M.LIP, z: Z(0, my, 1.4), rz: 1.0 * s, mode: 'on', tol: 3 * s });
    gb.ell(X(0), Y(my + 0.4 + mh * 0.5), mw, mH * 0.5, { mat: M.MOUTH, z: Z(0, my, 1.6), rz: 0.4 * s, mode: 'any' });
    for (const sd of [-1, 1]) gb.curve(X(sd * 2.0), Y(my + 0.6), X(sd * 3.6), Y(my + 0.2), X(sd * 4.8), Y(my - 0.9 * sm), (x, y) => gb.pix(x, y, M.MOUTH, { mode: 'over' }));
    gb.pix(X(0.8), Y(my + 0.6 + mh * 0.95), M.LIP, { mode: 'over', lum: 0.3 }); // wet glint on the lower lip
  }
}

/** Materials the close-up howl paints with (the CG maps them to its own): teeth, gum, tongue, spit. */
export const HOWL_MATS = { TEETH: M.NAIL, GUM: M.RIB_R, TONGUE: M.SASH_D, SPIT: M.SILVER };
const sst = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * (close-up fury) WHO IS OUT OF THEIR SEAT: the mouth torn wide and dropped far too far — the lips hauled
 * back off old teeth (the upper lip lifted on the snarl side, the gum bared), black and wet inside, the
 * tongue low, a string of spit; the corners dragged out and down. The mustache hangs over its top edge,
 * and anything not face (dough lapping over the corners) is left alone.
 * P.howl: { snarl 0..1, side ±1, top, bot, w (face units) }
 */
function howlMouth(gb, F, P, mh) {
  const s = F.s, X = F.X, Y = F.Y, Z = (u, v, d) => (faceZ(u, v) + d) * s, W = gb.w;
  const H = P.howl, sn = H.snarl ?? 1, side = H.side ?? 1;
  const vt = H.top ?? 12.4, vb = H.bot ?? 22.2, W0 = H.w ?? 6.0;
  const T = HOWL_MATS;
  const free = (x, y) => { const m = gb.matAt(x, y); return m === M.FACE || m === M.BLUSH || m === M.LIP; };   // (never over the mustache or the dough)
  // the opening: wide and squared, the lips hauled back off the teeth — the top edge raised (more on the
  // snarl side), the corners stretched out, the bottom edge pulled down too far, near flat across
  const lift = (u) => sn * 1.3 * sst(-1.6, 2.8, u * side) * (1 - sst(4.4, 6.6, u * side));
  const bs = side * 0.45;
  const top = (u) => vt + 1.6 * Math.max(0, Math.abs(u) / W0 - 0.5) ** 2 * 4 - lift(u) + Math.sin(u * 2.9 + 1) * 0.12;
  const bot = (u) => {
    const q = Math.min(1, Math.abs(u - bs) / W0);
    return vt + 1.6 + (vb - vt - 1.6) * Math.pow(Math.max(0, 1 - Math.pow(q, 2.6)), 0.7) + Math.sin(u * 2.3 + 0.4) * 0.14 + Math.sin(u * 0.9) * 0.18;
  };
  const inside = (u, v) => Math.abs(u) < W0 && v >= top(u) && v <= bot(u);
  const skew = () => bs;
  const U = (x) => (x + 0.5 - X(0)) / s, V = (y) => (y + 0.5 - Y(0)) / s;
  const x0 = Math.floor(X(-W0 - 2)), x1 = Math.ceil(X(W0 + 2)), y0 = Math.floor(Y(vt - 3)), y1 = Math.ceil(Y(vb + 3));
  // the upper lip, rolled back thin along the top edge (thicker where it is lifted)
  for (let x = x0; x <= x1; x++) {
    const u = U(x); if (Math.abs(u) > W0 + 0.4) continue;
    const ty = top(u), th = 0.55 + lift(u) * 0.35;
    for (let y = Math.floor(Y(ty - th - 0.2)); y <= Y(ty); y++) { const v = V(y); if (v < ty - th || v > ty + 0.1 || !free(x, y)) continue; gb.pix(x, y, M.LIP, { mode: 'any', z: Z(u, v, 1.3), n: [0, -0.35, 1], lum: v < ty - th * 0.5 ? 0.05 : -0.15 }); }
  }
  // the opening: black, wet, deep
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const u = U(x), v = V(y); if (!inside(u, v) || !free(x, y)) continue;
    const dep = sst(0, 0.5, (v - top(u)) / (vb - vt)) * (1 - Math.abs(u) / (W0 * 1.4));
    gb.pix(x, y, M.MOUTH, { mode: 'any', z: Z(u, v, -2 - 3 * dep), n: [0, 0, 1], lum: -0.25 - 0.4 * dep });
  }
  // the upper teeth: old, yellowed, uneven; one gone; the gum bared over them where the lip is lifted
  const teeth = [[-4.5, 1.25, 0.75], [-3.25, 1.3, 0.95], [-1.95, 1.3, 0], [-0.65, 1.4, 1.25], [0.75, 1.45, 1.3], [2.15, 1.35, 1.1], [3.45, 1.3, 1.05, 'c'], [4.65, 1.2, 0.8], [5.55, 0.9, 0.55]];
  teeth.forEach(([uc, w, h, kind], k) => {
    if (!h) return;
    for (let x = Math.floor(X(uc - w / 2)); x <= X(uc + w / 2); x++) {
      const u = U(x), e = (u - uc) / (w / 2); if (Math.abs(e) > 1) continue;
      const tt = top(u) + lift(u) * 0.55, hh = h * (kind === 'c' ? 1 - 0.25 * Math.abs(e) : 1 - 0.3 * e ** 4) + (k % 3 === 1 ? 0.1 : 0);
      for (let y = Math.floor(Y(tt - 0.3)); y <= Y(tt + hh); y++) {
        const v = V(y); if (v < top(u) + 0.05 || v > tt + hh || !inside(u, v) || gb.matAt(x, y) !== M.MOUTH) continue;
        const gap = Math.abs(e) > 0.82, low = (v - tt) / hh;
        if (v < tt) { gb.pix(x, y, T.GUM, { mode: 'any', z: Z(u, v, 0.4), n: [0, -0.2, 1], lum: -0.1 }); continue; }
        gb.pix(x, y, T.TEETH, { mode: 'any', z: Z(u, v, 0.3), n: [e * 0.35, 0.15 + low * 0.25, 1], lum: (gap ? -0.42 : 0) + (k === 5 ? -0.3 : 0) + (low > 0.8 ? -0.1 : 0) });
      }
    }
  });
  // the lower teeth: a short worn row, low in the dropped jaw, half behind the lower lip
  for (const [uc, w, h] of [[-4.1, 1.0, 0.5], [-2.95, 1.15, 0.75], [-1.75, 1.2, 0.9], [-0.5, 1.2, 0.95], [0.75, 1.2, 0.9], [2.0, 1.2, 0.85], [3.2, 1.1, 0.7], [4.3, 0.95, 0.45]]) {
    for (let x = Math.floor(X(uc - w / 2 + skew(vb))); x <= X(uc + w / 2 + skew(vb)); x++) {
      const u = U(x), e = (u - uc - skew(vb)) / (w / 2); if (Math.abs(e) > 1) continue;
      const b = bot(u), tt = b - h - 0.15;
      for (let y = Math.floor(Y(tt)); y <= Y(b); y++) {
        const v = V(y); if (v < tt || gb.matAt(x, y) !== M.MOUTH) continue;
        gb.pix(x, y, T.TEETH, { mode: 'any', z: Z(u, v, -0.4), n: [e * 0.3, -0.35, 1], lum: Math.abs(e) > 0.78 ? -0.45 : -0.12 });
      }
    }
  }
  // the tongue, heaped low and back in the dark
  {
    const tc = skew(vb) + side * 0.3, tv = vb - 2.3, rx = 3.6, ry = 1.9;
    for (let y = Math.floor(Y(tv - ry)); y <= Y(tv + ry); y++) for (let x = Math.floor(X(tc - rx)); x <= X(tc + rx); x++) {
      const u = U(x), v = V(y), d = ((u - tc) / rx) ** 2 + ((v - tv) / ry) ** 2;
      if (d >= 1 || gb.matAt(x, y) !== M.MOUTH) continue;
      gb.pix(x, y, T.TONGUE, { mode: 'any', z: Z(u, v, -2.4 + (1 - d) * 0.8), n: [(u - tc) * 0.2, -0.9 * Math.sqrt(1 - d) - 0.1, 0.6], lum: -0.2 });
    }
  }
  // wet: a few glints along the tongue's top and the inside of the lower lip
  for (const [u, dv] of [[-1.2, -0.2], [-0.6, -0.15], [1.6, -0.1]]) { const v = bot(u) - 2.3 - 1.9 * 0.95 + dv + 0.4, x = Math.round(X(u) - 0.5), y = Math.round(Y(v) - 0.5); if (gb.matAt(x, y) === T.TONGUE) gb.pix(x, y, T.TONGUE, { mode: 'any', z: Z(u, v, -1.4), n: [-0.4, -0.5, 0.75], lum: 0.7 }); }
  // spit: a string from the upper teeth to the lower lip, sagging; a second one broken
  for (const [ua, ub, sag, brk] of [[-3.6, -2.9, -0.9, [0.55, 0.7]]]) {
    const va = top(ua) + 1.0, vbb = bot(ub) - 0.5;
    for (let k = 0; k <= 60; k++) {
      const t = k / 60; if (brk && t > brk[0] && t < brk[1]) continue;
      const u = ua + (ub - ua) * t + sag * Math.sin(t * Math.PI), v = va + (vbb - va) * t;
      const x = Math.round(X(u) - 0.5), y = Math.round(Y(v) - 0.5), m = gb.matAt(x, y);
      if (m === M.MOUTH || m === T.TONGUE) gb.pix(x, y, T.SPIT, { mode: 'any', z: Z(u, v, 0.6), n: [-0.3, -0.3, 1], lum: -0.2 });
    }
  }
  // the lower lip, stretched down and thin under the opening, wet along its top
  for (let x = x0; x <= x1; x++) {
    const u = U(x); if (Math.abs(u - skew(vb)) > W0 * 0.8) continue;
    const b = bot(u); if (b > vb + 0.9) continue;
    const th = 1.05 * (1 - ((u - skew(vb)) / (W0 * 0.8)) ** 2) + 0.25;
    for (let y = Math.floor(Y(b - 0.1)); y <= Y(b + th); y++) {
      const v = V(y); if (v < b - 0.1 || v > b + th || !free(x, y)) continue;
      gb.pix(x, y, M.LIP, { mode: 'any', z: Z(u, v, 1.6), n: [0, (v - b) / th - 0.6, 1], lum: v < b + th * 0.35 ? 0.15 : -0.05 });
    }
  }
  // the corners, dragged out and down: tension creases fanning over the cheeks and into the chin
  for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) {
    const a = [X(sd * (W0 + 0.2)), Y(top(sd * W0) + 0.9 + k * 0.9)], c = [X(sd * (W0 + 1.6 + k * 0.5)), Y(top(sd * W0) + 4.0 + k * 2.4)];
    gb.curve(a[0], a[1], (a[0] + c[0]) / 2 + sd * s * 0.5, (a[1] + c[1]) / 2, c[0], c[1], (x, y) => { if (gb.matAt(x, y) === M.FACE) gb.dim(x, y, 0.78); });
  }
}

// close-up scale: lid creases, lower lids and the line of the lips are carved into the face's surface
function faceGrooves(ff, fx, fy, s, P, mh) {
  const G = (pts, w, d) => ff.groove(pts.map(([u, v]) => [fx(u), fy(v)]), w * s, d * s);
  for (const sd of [-1, 1]) {
    const lid = P.blink ? P.blink[sd < 0 ? 0 : 1] : (sd < 0 ? P.lidL : P.lidR);
    const ex = sd * 6, ey = 0.2, hw = 3.45, hh = 2.1;
    const lidY = ey - hh + (1 - lid) * hh * 2, cy = Math.min(lidY - 1.1, ey - hh * 1.25);
    if (!P.scowl) G([[ex - hw * 0.95, cy + 0.8], [ex - hw * 0.3, cy - 0.35], [ex + hw * 0.4, cy - 0.3], [ex + hw, cy + 0.7]], 0.85, 0.55);   // (a scowl's brow buries it)
    const es = P.eyeSmile || 0;
    G([[ex - hw * 0.8, ey + hh * (0.85 - es * 0.5)], [ex, ey + hh * (1.45 - es * 0.75)], [ex + hw * 0.8, ey + hh * (0.85 - es * 0.5)]], 0.75, 0.28 + es * 0.3);
  }
  const my = P.mouthY ?? 14.9, sm = P.smile ?? 1;
  if (mh < 0.3) {
    G([[-6.6, my - 1.6 * sm], [-5.2, my - 0.4 * sm], [-3.6, my + 0.3], [0, my + 0.9], [3.6, my + 0.3], [5.2, my - 0.4 * sm], [6.6, my - 1.6 * sm]], 0.55, 0.75);
    G([[-3.0, my + 2.5], [0, my + 3.2], [3.0, my + 2.5]], 0.75, 0.35); // under the lower lip
  }
  if (sm > 0.5) for (const sd of [-1, 1]) G([[sd * 3.0, 7.2], [sd * 5.6, 9.4], [sd * 7.4, 12.4]], 0.85, 0.45 * sm); // smile lines past the whiskers
  if (P.scowl) {
    // rage: the knot between the brows cut by deep vertical furrows; the bridge crushed into creases; the
    // nose wrinkled; the nasolabial folds dug deep from the flared nostrils past the stretched mouth
    const k = P.scowl;
    for (const sd of [-1, 1]) {
      G([[sd * 1.5, -6.8], [sd * 1.1, -4.4], [sd * 0.9, -1.8]], 0.55, 1.1 * k);
      G([[sd * 3.0, -5.6], [sd * 2.6, -4.0], [sd * 2.2, -2.4]], 0.4, 0.45 * k);
      G([[sd * 1.2, 2.0], [sd * 2.1, 2.7], [sd * 2.8, 3.8]], 0.6, 0.25 * k);      // the nose wrinkled along its sides
      G([[sd * 2.9, 6.9], [sd * 5.0, 9.4], [sd * 6.9, 13.2], [sd * 7.6, 17.8], [sd * 7.4, 21]], 1.0, 1.3 * k);
      G([[sd * 7.2, 4.4], [sd * 9.4, 5.6], [sd * 11.0, 7.4]], 0.6, 0.5 * k);       // the bunched cheek's upper crease
    }
    G([[-1.8, -0.9], [0, -0.4], [1.8, -0.9]], 0.5, 0.7 * k);
    G([[-1.4, 0.4], [0, 0.8], [1.4, 0.4]], 0.4, 0.4 * k);
  } else if ((P.brow ?? 0) < -0.5) {
    // fury: the knot between the brows — two short vertical furrows, and the bridge's crease
    for (const sd of [-1, 1]) G([[sd * 1.3, -6.4], [sd * 0.9, -4.2], [sd * 0.8, -2.6]], 0.45, 0.7);
    G([[-1.6, -1.6], [0, -1.2], [1.6, -1.6]], 0.45, 0.45);
  }
}

// close-up scale (CGs only): the whiskers as separate tufts — each a tapering lock rooted in the skin,
// dark at the root, white-grey at the tip; the mustache drooping in tufts past the mouth corners with a few
// wisps over the lip, the chops a row of tufts down the jaw (no smooth tube, no outline round them)
function hairStrands(gb, F, P, mh, r) {
  const s = F.s, X = F.X, Y = F.Y, W = gb.w, H = gb.h;
  const hf = new HField(W, H, 0.35 / s).finalize(); // hard-max union
  const tag = new Float32Array(W * H).fill(-1), edge = new Float32Array(W * H), tid = new Int16Array(W * H).fill(-1);
  let nT = 0;
  const quad = (a, b, c, n = 10) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, q = 1 - t; o.push([q * q * a[0] + 2 * q * t * b[0] + t * t * c[0], q * q * a[1] + 2 * q * t * b[1] + t * t * c[1]]); } return o; };
  /** One tuft along a curve (face units, root → tip), width w0 at the root (face units), lift above the face. */
  const kind = [], clump = [];
  const tuft = (pts, w0, lift = 2.2, kd = '', cl = -1) => {
    const id = nT++; kind[id] = kd; clump[id] = cl < 0 ? id + 1000 : cl;
    const P2 = pts.map(([u, v]) => [X(u), Y(v)]), n = P2.length - 1;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of P2) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const pad = w0 * s + 2;
    for (let y = Math.max(0, Math.floor(y0 - pad)); y <= Math.min(H - 1, y1 + pad); y++) for (let x = Math.max(0, Math.floor(x0 - pad)); x <= Math.min(W - 1, x1 + pad); x++) {
      let best = 1e9, bt = 0;
      for (let k = 0; k < n; k++) {
        const [ax, ay] = P2[k], dx = P2[k + 1][0] - ax, dy = P2[k + 1][1] - ay, L2 = dx * dx + dy * dy || 1e-9;
        let t = ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(x + 0.5 - ax - dx * t, y + 0.5 - ay - dy * t);
        if (d < best) { best = d; bt = (k + t) / n; }
      }
      const wv = (w0 * s) * Math.pow(1 - bt, 0.45) * (bt < 0.12 ? 0.75 + bt * 2 : 1) + 0.4;
      if (best > wv) continue;
      const u = (x + 0.5 - X(0)) / s, v = (y + 0.5 - Y(0)) / s, q = best / wv;
      const zz = (faceZ(u, v) + lift + (1 - bt) * 0.8) * s + Math.sqrt(1 - q * q) * wv * 0.5;
      const i = y * W + x;
      if (zz > hf.z[i]) { hf.z[i] = zz; hf.mat[i] = M.HAIR; tag[i] = bt; edge[i] = q; tid[i] = id; }
    }
  };
  const ml = mh * 0.18, J = (a) => (r() - 0.5) * a;
  for (const sd of [-1, 1]) {
    // the chops: wide tufts layered down the jaw from the temple, overlapping, combed down and in
    const chops = [[-8.4, 11.0, 12.0, -2.8], [-5.6, 12.3, 12.8, 0.8], [-2.4, 12.9, 13.0, 4.4], [1.0, 13.2, 12.6, 8.0], [4.4, 13.0, 11.6, 11.4], [7.6, 12.2, 10.2, 13.8], [10.4, 10.8, 8.4, 15.2 + mh * 0.25]];
    chops.forEach(([v0, u0, u1, v1], k) => {
      const a = [sd * (u0 + J(0.4)), v0 + J(0.5)], c = [sd * (u1 + J(0.6)), v1 + J(0.9)], b = [(a[0] + c[0]) / 2 + sd * (0.7 + J(0.4)), (a[1] + c[1]) / 2];
      tuft(quad(a, b, c), (2.1 + J(0.3)) * (P.chopK ?? 1), (1.6 + k * 0.06) * (P.chopK ?? 1));   // (chopK < 1: sunk in the fat)
    });
    // the mustache: FINE strands (≈1.5 px), pale, combed from under the nose out and down past the corners of
    // the mouth — longer toward the corners, each ending at its own length (a ragged lower edge), the outer
    // ones running on into the chops; the lower ones lie on top
    const lift = (P.smile ?? 1) > 0.5 ? 0.6 + (P.eyeSmile || 0) * 1.6 : 0;
    const sw = 1.3 / s;
    const clumps = [[0.35, 9.5, 2.9, 3.6], [1.4, 9.8, 3.4, 4.2], [2.5, 10.1, 3.8, 4.8], [3.7, 10.5, 4.0, 5.3], [4.9, 10.9, 4.1, 5.8], [6.0, 11.4, 3.5, 5.4]];
    clumps.forEach(([cu, cv, du, dv], c) => {
      const sn = P.howl && sd === (P.howl.side ?? 1) ? (P.howl.snarl ?? 1) : 0;   // (a snarl hauls up its side)
      const cid = 100 + c + (sd > 0 ? 10 : 0), dl = lift * c * 0.07 + sn * (0.5 + c * 0.22);   // (a smile barely lifts it: it droops into the chops)
      for (let k = 0; k < 5; k++) {
        const o = (k - 2) * 0.34 + J(0.12), L = 0.82 + J(0.36) + (k === 2 ? 0.12 : 0);
        const u0 = cu + o * 0.4, v0 = cv - ml + o * 0.85;
        const u1 = u0 + du * L, v1 = v0 + dv * L - dl;
        tuft(quad([sd * u0, v0], [sd * (u0 + du * 0.62 * L + 0.4), v0 + dv * 0.3 * L - dl * 0.5], [sd * (u1 + J(0.3)), v1 + J(0.4)]), sw * (1 + J(0.25)), 2.0 + c * 0.1 + k * 0.02, 'm', cid);
      }
    });
    // brows: thin, groomed (inner ends lift with P.brow)
    const bi = P.brow || 0;
    if (P.scowl) {
      // rage: bushy and driven down hard — a V over the eyes, the inner ends knotted down onto the nose,
      // a few wiry hairs standing out of them
      tuft(quad([sd * 1.35, -1.0], [sd * 5.4, -3.2], [sd * 10.9, -6.0], 8), 1.25, 2.1, 'b', 320 + (sd > 0 ? 1 : 0));          // the brow's mass
      tuft(quad([sd * 1.6, -2.2], [sd * 5.6, -4.3], [sd * 9.8, -6.4], 8), 0.7, 2.5, 'b', 330 + (sd > 0 ? 1 : 0));           // its upper edge, ruffled up
      for (let k = 0; k < 5; k++) { const u0 = 2.4 + k * 1.8 + J(0.6), v0 = -2.5 - u0 * 0.42 + J(0.3); tuft(quad([sd * u0, v0], [sd * (u0 + 1.2), v0 - 1.1 + J(0.5)], [sd * (u0 + 2.0 + J(0.6)), v0 - 0.7 + J(1.2)], 6), 0.24, 3.0, 'm'); }   // wiry hairs standing out
    } else tuft(quad([sd * 2.3, -4.3 - bi * 1.4], [sd * 6.2, -5.9 - bi * 0.5], [sd * 10.2, -3.9], 8), 0.62, 1.9);
  }
  hf.toGB(gb, { mode: 'z' });
  // roots dark, tips white-grey, the edge of each tuft a step down (they part from each other)
  for (let i = W; i < W * H - W; i++) {
    if (tag[i] < 0 || gb.mat[i] !== M.HAIR) continue;
    const fine = kind[tid[i]] === 'm';
    gb.lum[i] = fine ? 0.22 + tag[i] * 0.3 : (tag[i] - 0.5) * 0.46;    // the mustache's fine strands: pale, paler at the tips
    // where this tuft slips under the next: a 1-px parting line; a strand line down its middle. The
    // mustache's strands part only between their clumps; inside a clump each strand's edge is a step down
    let under = false, inClump = false;
    for (const j of [i - 1, i + 1, i - W, i + W]) if (tid[j] >= 0 && tid[j] !== tid[i] && hf.z[j] > hf.z[i] + 0.2) { if (clump[tid[j]] === clump[tid[i]]) inClump = true; else under = true; }
    if (under) gb.lum[i] = fine ? -0.34 : -0.4;
    else if (fine && (inClump || edge[i] > 0.8)) gb.lum[i] -= 0.16;
    else if (!fine && edge[i] < 0.14 && tag[i] > 0.15 && tag[i] < 0.85) gb.lum[i] -= 0.14;
    // (rage brows, kind 'b') wiry: combed strand lines along the brow, broken here and there, ragged tips
    if (kind[tid[i]] === 'b' && !under) {
      const x = i % W, y = (i / W) | 0, e = edge[i], q = (e * 4.2 + tag[i] * 1.3 + ((x * 7 + y * 3) % 5) * 0.05) % 1;
      if (q < 0.24 && e > 0.18 && ((x + y * 3) % 7)) gb.lum[i] -= 0.2;
      else if (q > 0.7 && tag[i] > 0.4) gb.lum[i] += 0.08;
    }
  }
}

function eye(gb, ex, ey, s, lid, gz, ez, glint, sd, wet, es = 0, isc = 1, tilt = 0) {
  const hw = 3.45 * s, hh = 2.1 * s;
  const inAlmond = (x, y) => {
    const u = (x + 0.5 - ex) / hw, v = (y + 0.5 - ey) / hh, w = v - sd * u * 0.14, lim = 1 - u * u;
    return w < 0 ? -w < lim : w < lim * (1 - 0.6 * es); // a smile pushes the lower lid up
  };
  gb.ell(ex, ey, hw, hh * 1.05, { mat: M.EYE, z: ez, rz: 1.5 * s, mode: 'any', clip: inAlmond, ao: 0.95 });
  const ix = ex + gz[0] * hw * 0.55, iy = ey + gz[1] * hh * 0.45;
  gb.ell(ix, iy, 1.5 * s * isc, 1.65 * s * isc, { mat: M.IRIS, z: ez + 0.5 * s, rz: 1.3 * s, mode: 'any', clip: inAlmond });
  gb.ell(ix, iy, 0.62 * s * isc * isc, 0.7 * s * isc * isc, { mat: M.DARK, z: ez + 0.6 * s, rz: 1 * s, mode: 'any', clip: inAlmond });
  // the heavy upper lid comes down to `lid`; tilt (rage) slants it down toward the nose
  const lidY = ey - hh + (1 - lid) * hh * 2, lidAt = tilt ? (x) => lidY + tilt * hh * Math.max(0, Math.min(1, (1 - sd * (x + 0.5 - ex) / hw) / 2)) : () => lidY;
  if (glint) { const gy = Math.max(iy - 0.7 * s, lidAt(ix) + 0.5 * s + 1); gb.ell(ix - 0.6 * s, gy, Math.max(0.5, 0.28 * s), Math.max(0.5, 0.24 * s), { mat: M.EYE, mode: 'any', z: ez + 1.5 * s, rz: 0.2 * s, lum: 1.0, clip: (x, y) => inAlmond(x, y) }); }
  if (wet) for (let k = -1; k <= 1; k++) gb.pix(ex + k * hw * 0.45, ey + hh * 0.82, M.EYE, { mode: 'any', lum: 0.55, n: [0, -0.3, 1] }); // watery old eyes
  gb.ell(ex, ey - hh * 0.3, hw * 1.12, hh * 1.3, {
    mat: M.FACE, z: ez + 1.0 * s, rz: 1.4 * s, mode: 'any', tilt: [0, -0.4],
    clip: (x, y) => y + 0.5 < lidAt(x) && (inAlmond(x, y) || inAlmond(x, y + 1)),
  });
  // lash line (dark, slightly heavier at the outer corner)
  for (let x = Math.floor(ex - hw); x <= Math.ceil(ex + hw); x++) {
    const ly = lidAt(x);
    for (let y = Math.floor(ly - 1); y <= Math.ceil(ly + 1); y++) {
      if (!inAlmond(x, y)) continue;
      const outer = (x + 0.5 - ex) * sd > hw * 0.35;
      if (Math.abs(y + 0.5 - ly) < 0.5 + 0.1 * s + (outer ? 0.15 * s : 0)) gb.pix(x, y, M.DARK, { mode: 'any', z: ez + 1.2 * s });
    }
  }
  if (s >= 2) { // a few lashes at the outer corner
    for (let k = 0; k < 4; k++) { const lx = ex + sd * hw * (0.45 + k * 0.15), ly = lidAt(lx) + (sd * (lx - ex) / hw) * hh * 0.14 * sd; gb.line(lx, ly, lx + sd * s * 0.35, ly + s * (0.55 + k * 0.05), M.DARK, { mode: 'any', z: ez + 1.3 * s }); }
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
    eye(gb, X(sd * 6), Y(0.2), s, lid, L ? P.gazeL : P.gazeR, Z(sd * 6, 0, 0.6), P.glint, sd, P.wet, P.eyeSmile || 0, P.iris ?? 1, P.lidTilt || 0);
  }
}

/** Convenience: new GBuf with a head drawn into it. */
export function headBuffer(w, h, P) {
  const gb = new GBuf(w, h);
  drawHead(gb, P);
  return gb;
}
