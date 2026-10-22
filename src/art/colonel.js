// The Colonel — world sprite (64×64 frames, feet anchor 32,62). See TECH §12 / DESIGN §3.
// Every frame is sculpted from one parametric pose rig (soft-union masses + hand-placed details),
// lit by a fixed top-left rig and outlined, so proportions & shading stay consistent across all
// animations and directions. Exports: initColonel(), getColonelSprite().
import { GBuf, HField, M, rig, shade, outlineImg, imgToCanvas, fbm, hnoise } from './colonel_gbuf.js';

const FW = 64, FH = 64, AX = 32, AY = 62, GROUND = 62;
const OUTLINE = '#06070c';
const FL = M.SFLESH, NV = M.SNAVY;
export const SPRITE_RIG = rig({
  amb: 0.2, shadowTint: '#9ca0c4', keyTint: '#fff4e2', exposure: 1.02, ditherScale: 0.8,
  lights: [{ d: [-0.62, -0.72, 0.55], i: 0.95, sh: 5, shK: 0.55 }], rim: [-0.55, -0.83, 0.26],
});

// ------------------------------------------------------------------------------------------ pose
// Default standing pose. Positions are frame pixels for the FRONT view; side view uses its own layout
// but reads the same parameters. All fields interpolate (see lerpPose).
export function basePose(dir = 'down') {
  return {
    dir, b: 0,            // breath 0..1 (the body swells; the little face does not move)
    h: 1, w: 1,           // body height / width scale (mound, sink)
    lean: [0, 0],         // torso+head shift
    head: [0, 0],         // extra head offset
    mass: [0, 0],         // dragged lower mass offset
    massW: 1,             // lower mass width scale
    handL: null, handR: null, // hand positions (null = hanging at rest); [x, y]
    openL: 0, openR: 0,   // finger spread
    armZL: 0, armZR: 0,   // arm forward (+) / back (-)
    face: 1,              // face visibility (sunk / turned away)
    faceDY: 0,            // face slides within the head (lectern: looking down)
    look: 0,              // face turn -1..1 (scan)
    lids: [0.45, 0.4],    // eyelids L/R (0 shut … 1 open)
    mouth: 0,             // vertical mouth opening 0..1
    smear: 0,             // lunge stretch toward facing
    clipX: null,          // peek: keep only x < clipX (or > -clipX if negative)
    sinkY: 0,             // pixels pushed below the floor (sink/emerge)
    spill: 0,             // sink/emerge: half-width (px) of the dark stain on the floor
    crumble: 0,           // dissolve 0..1
    coat: 0,              // dissolve: empty-coat heap reveal 0..1
    lectern: false,
    paper: false,
  };
}
export function lerpPose(a, b, t) {
  const o = { ...a };
  for (const k of Object.keys(b)) {
    const va = a[k], vb = b[k];
    if (typeof va === 'number' && typeof vb === 'number') o[k] = va + (vb - va) * t;
    else if (Array.isArray(va) && Array.isArray(vb)) o[k] = va.map((v, i) => v + (vb[i] - v) * t);
    else if (va == null && Array.isArray(vb)) o[k] = t > 0.5 ? vb : va;
    else o[k] = t < 0.5 ? va : vb;
  }
  return o;
}
const ease = (t) => t * t * (3 - 2 * t);

// ------------------------------------------------------------------------------------------ build
function buildFront(P, back) {
  const gb = new GBuf(FW, FH);
  const s = P.w, hs = P.h, b = P.b;
  const cx = 32 + P.lean[0], ly = P.lean[1];
  const Y = (y) => GROUND - (GROUND - y) * hs; // vertical squash about the floor
  const X = (x) => 32 + (x - 32) * s + P.lean[0];
  // ---- lower mass (dragged), belly, chest, shoulders, head: one soft field
  const hf = new HField(FW, FH, 0.42);
  const mx = 32 + P.mass[0], my = 55.5 + P.mass[1];
  hf.blob(mx, my, 22.5 * s * P.massW, 7.2, 12, { mat: NV, p: 0.5 });
  hf.blob(mx - 12 * s, my + 2, 6.5 * s, 4.2, 10, { mat: FL, p: 0.6 });        // flesh spilling from under the hem
  hf.blob(mx + 13 * s, my + 1.5, 7 * s, 4.2, 10.5, { mat: FL, p: 0.6 });
  hf.blob(X(32), Y(41 - b * 0.6) + ly * 0.5, (19.5 + b * 1.8) * s, (14 + b * 1.0) * hs, 19 + b * 1.5, { mat: NV, p: 0.5 }); // belly
  hf.blob(X(32), Y(28.5 - b * 1.0) + ly * 0.8, (17.5 + b * 1.1) * s, 9.5 * hs, 16, { mat: NV, p: 0.5 });              // chest
  for (const sd of [-1, 1]) hf.blob(X(32 + sd * (16.5 + b * 0.5)), Y(24.5 - b * 1.2) + ly * 0.8, 8 * s, 6.5 * hs, 13, { mat: NV, p: 0.5 });
  // the head: a dough dome sitting straight on the shoulders, jowls hanging over the collar
  const hx = X(32) + P.head[0] + (back ? -0.6 : 0.6), hy = Y(16 - b * 0.6) + ly + P.head[1];
  const hsx = Math.max(s, 0.6), hsy = Math.max(hs, 0.8);
  hf.blob(hx, hy - 0.3 * hsy, (11 + b * 0.4) * hsx, 11 * hsy, 13, { mat: FL, p: 0.55 });
  hf.blob(hx, hy + 9 * hsy, 8.5 * hsx, 3.8 * hsy, 14.5, { mat: FL, p: 0.6 });                     // wattle
  for (const sd of [-1, 1]) hf.blob(hx + sd * 6.5 * hsx, hy + 7.5 * hsy, 5.5 * hsx, 4 * hsy, 14.5, { mat: FL, p: 0.6 }); // jowls (low and flat: chin fat, not locks of hair)
  hf.finalize();
  // folds: under the chin, under the belly, at the hem
  hf.fold([[hx - 11 * s, hy + 9 * hs], [hx - 6 * s, hy + 12.2 * hs], [hx, hy + 13 * hs], [hx + 6 * s, hy + 12.2 * hs], [hx + 11 * s, hy + 9 * hs]], 1.2, 4.5);
  hf.fold([[X(16), Y(50) + ly * 0.4], [X(32), Y(53.5) + ly * 0.4], [X(48), Y(50) + ly * 0.4]], 1.3, 3);
  if (back) {
    hf.groove([[hx - 8 * s, hy + 3 * hs], [hx, hy + 5 * hs], [hx + 8 * s, hy + 3 * hs]], 1.1, 1.5); // nape rolls
    hf.groove([[hx - 9 * s, hy + 6.5 * hs], [hx, hy + 8.5 * hs], [hx + 9 * s, hy + 6.5 * hs]], 1.1, 1.8);
  }
  hf.toGB(gb);
  // a crisp shine on the bald dome (flesh, not wool)
  for (const [dx, dy, l] of [[-5, -6, 0.2], [-4, -7, 0.24], [-3, -7, 0.2], [-4, -6, 0.12], [-2, -8, 0.1]]) { const x = Math.round(hx + dx * hsx), y = Math.round(hy + dy * hsy); if (gb.matAt(x, y) === FL) gb.dim(x, y, 1, l); }
  // ---- coat details painted on the surface
  const belly = (x, y) => gb.matAt(x, y) === NV;
  if (!back) {
    // double-breasted chest, still buttoned: two rows of brass, straining
    for (let k = 0; k < 3; k++) for (const sd of [-1, 1]) {
      if (k === 2 && sd > 0) continue; // one popped off
      const bx = Math.round(X(32) + sd * (4.5 + k * 0.4 + b * 0.4)), by = Math.round(Y(27.5 + k * 3.4 - b * 0.5) + ly * 0.8);
      if (belly(bx, by)) { gb.pix(bx, by, M.BRASS, { n: [-0.25, -0.35, 1] }); gb.dim(bx + 1, by + 1, 0.65); gb.dim(bx, by + 1, 0.85); }
    }
    for (let y = Math.round(Y(25.5) + ly * 0.8); y < Y(35.5) + ly * 0.7; y++) gb.dim(Math.round(X(32)), y, 0.68);
    // below the chest the coat has burst: a lens of pale belly bulges out, the sash straining across it
    const gy0 = Y(35) + ly * 0.7, gy1 = Y(52) + ly * 0.4;
    for (let y = Math.floor(gy0); y <= gy1; y++) {
      const t = (y - gy0) / (gy1 - gy0), half = (3.6 + b * 0.9) * Math.pow(Math.sin(Math.PI * t), 0.75);
      for (let x = Math.round(X(32) - half); x <= Math.round(X(32) + half - 0.01); x++) {
        if (!belly(x, y)) continue;
        const i = y * FW + x, u = (x + 0.5 - X(32)) / (half + 0.5);
        gb._put(i, FL, u * 0.75, (t - 0.42) * 1.1, 1, gb.z[i] + 1.2, { mode: 'any', ao: 1, lum: 0 });
      }
      for (const sd of [-1, 1]) {
        const ex = Math.round(X(32) + sd * (half + 0.6));
        if (belly(ex, y)) gb.dim(ex, y, 0.5);
        if (Math.abs(t - 0.22) < 0.04 || Math.abs(t - 0.75) < 0.04) { const tx = Math.round(X(32) + sd * (half + 1.6)); if (belly(tx, y)) gb.pix(tx, y, M.DARK, { n: [0, 0, 1] }); } // torn button threads
      }
    }
    // medals pinned straight into the exposed skin
    const my0 = Math.round(gy0 + 2.5);
    const medal = (x, y, rib) => { gb.pix(x, y, rib, { n: [0, -0.3, 1] }); gb.pix(x, y + 1, M.GOLD, { n: [-0.5, -0.4, 0.8] }); gb.dim(x + 1, y + 1, 0.7); gb.dim(x, y + 2, 0.8); };
    medal(Math.round(X(31)), my0, M.RIB_R); medal(Math.round(X(33)), my0 + 1, M.RIB_B);
  } else {
    // back: the center seam has split in places; two buttons at the waist
    const oy0 = Y(28) + ly * 0.8, oy1 = Y(50) + ly * 0.4;
    for (let y = Math.floor(oy0); y <= oy1; y++) {
      const row = Math.round(y - oy0), open = (row > 3 && row < 9) || (row > 12 && row < 15);
      const x = Math.round(X(32));
      if (!belly(x, y)) continue;
      if (open) { const i = y * FW + x; gb._put(i, FL, 0, 0, 1, gb.z[i] + 0.5, { mode: 'any', ao: 0.9 }); gb.dim(x - 1, y, 0.6); gb.dim(x + 1, y, 0.75); }
      else gb.dim(x, y, 0.65);
    }
    for (const sd of [-1, 1]) { const bx = Math.round(X(32) + sd * 3), by = Math.round(Y(41.5) + ly * 0.5); gb.pix(bx, by, M.BRASS, { n: [-0.25, -0.35, 1] }); gb.dim(bx + 1, by + 1, 0.65); }
  }
  // crimson sash straining across the belly (front) / around the waist (back)
  const sy = Y(45) + ly * 0.45;
  for (let x = Math.floor(X(12)); x <= Math.ceil(X(52)); x++) {
    const u = (x - X(32)) / (20 * s);
    const yc = sy - (u * u) * 3.2 * hs + b * 0.3;
    for (let y = Math.round(yc - 2.2); y <= Math.round(yc + 1.8); y++) {
      const m = gb.matAt(x, y);
      if (m !== NV && m !== FL) continue;
      if (m === FL && Math.abs(x - X(32)) > 5) continue;
      const i = y * FW + x;
      const edge = y === Math.round(yc - 2.2) || y === Math.round(yc + 1.8);
      gb._put(i, edge ? M.SASH_D : M.SASH, gb.nx[i], gb.ny[i] - 0.15, gb.nz[i], gb.z[i] + 0.6, { mode: 'any', ao: 1, lum: ((x + y * 2) % 5 === 0) ? -0.06 : 0 });
    }
  }
  // sash knot & tassels at his left hip (screen right from the front, screen left from the back)
  const kx = X(back ? 17 : 47), ky = sy - 1;
  gb.ell(kx, ky, 3, 2.4, { mat: M.SASH, z: 24, rz: 3, mode: 'z' });
  gb.cap(kx - 1, ky + 2, 1.1, kx - 2, ky + 9 * hs, 1.2, { mat: M.SASH_D, z0: 23, z1: 22, rzk: 1, mode: 'z' });
  gb.cap(kx + 1, ky + 2, 1.1, kx + 1.5, ky + 8 * hs, 1.2, { mat: M.SASH, z0: 23, z1: 22, rzk: 1, mode: 'z' });
  // collar: a dark band peeking under the wattle
  for (let x = Math.round(hx - 8 * s); x <= Math.round(hx + 8 * s); x++) {
    const y = Math.round(hy + 12.5 * hs);
    if (gb.matAt(x, y) === NV) { gb.dim(x, y, 0.6); if (gb.matAt(x, y - 1) === NV) gb.pix(x, y - 1, M.GOLD, { n: [0, -0.6, 0.8] }); }
  }
  // ---- arms (own field: crisp against the body)
  arms(gb, P, X, Y, ly, back);
  // ---- boots, split open, splayed under the mass
  boots(gb, P, back);
  // epaulettes half-swallowed at the shoulders + bullion fringe
  for (const sd of [-1, 1]) {
    const ex = X(32 + sd * 18.5), ey = Y(21.5 - b * 1.1) + ly * 0.8;
    gb.ell(ex, ey, 6 * s, 3.1, { mat: M.GOLD, z: 28, rz: 3, mode: 'any', tilt: [sd * 0.25, -0.5] });
    gb.ell(ex + sd * 0.5, ey - 0.3, 2.4 * s, 1.2, { mat: M.SILVER, z: 31, rz: 1, mode: 'any', tilt: [0, -0.3] }); // the eagle
    for (let k = -4; k <= 4; k += 2) {
      const fx = Math.round(ex + k * 1.3 * s);
      for (let j = 0; j < 3; j++) gb.pix(fx, Math.round(ey + 2.6 + j), M.GOLD, { n: [0, 0.1 + j * 0.25, 1], z: 29, lum: -j * 0.08 });
    }
    gb.ell(X(32 + sd * 13.5) + P.head[0] * 0.3, Y(21.2 - b * 0.9) + ly * 0.9, 3.4 * s, 2.4, { mat: FL, z: 30, rz: 2.5, mode: 'z' }); // flesh swallowing its inner end
    gb.dim(Math.round(X(32 + sd * 13.5)), Math.round(Y(23.4 - b * 0.9) + ly * 0.9), 0.6);
  }

  // ---- the face
  if (!back && P.face > 0) faceFront(gb, P, hx, hy, hs);
  return gb;
}

function restHand(P, sd, X, Y, ly, back) {
  const low = (sd < 0) !== back; // one arm always hangs a little lower — the body is not level
  return [X(32 + sd * (23.5 + (low ? 0.6 : 0))), Y(low ? 51.5 : 49) + ly * 0.3];
}

function arms(gb, P, X, Y, ly, back) {
  const af = new HField(FW, FH, 0.6);
  const hs = P.h;
  for (const sd of [-1, 1]) {
    const L = sd < 0;
    const slump = (sd < 0) !== back ? 1.2 : 0;
    const sx = X(32 + sd * 19.5), sy = Y(25 + slump - P.b * 0.8) + ly * 0.8;
    const rest = restHand(P, sd, X, Y, ly, back);
    const hand = (L ? P.handL : P.handR) || rest;
    const zf = (L ? P.armZL : P.armZR) || 0;
    const ex = (sx + hand[0]) / 2 + sd * 2.2, ey = (sy + hand[1]) / 2;
    // sleeve: upper arm + forearm (heavy, sagging)
    af.tube(sx, sy, 5.8, ex, ey, 5.4, { mat: NV, z0: 20 + zf, z1: 21 + zf, k: 0.9 });
    af.tube(ex, ey, 5.4, hand[0], hand[1] - 3.5, 4.8, { mat: NV, z0: 21 + zf, z1: 22 + zf * 1.4, k: 0.9 });
    // the hand: swollen palm + sausage fingers
    const op = (L ? P.openL : P.openR) || 0;
    af.blob(hand[0], hand[1], 5.6, 5.2, 6.5, { base: 20 + zf * 1.4, mat: FL, p: 0.6 });
    for (let f = 0; f < 4; f++) {
      const a = (f - 1.5) * (0.28 + op * 0.35) + Math.PI / 2 + sd * 0.12;
      const fx0 = hand[0] + Math.cos(a) * 3 + (f - 1.5) * 1.9, fy0 = hand[1] + Math.sin(a) * 3;
      const len = 4.5 + (f === 1 || f === 2 ? 1 : 0) - op * 0.5;
      af.tube(fx0, fy0, 1.8, fx0 + Math.cos(a) * len, fy0 + Math.sin(a) * len, 1.6, { mat: FL, z0: 22 + zf * 1.4, z1: 21.5 + zf * 1.4, k: 1 });
    }
  }
  af.finalize();
  af.toGB(gb);
  for (const sd of [-1, 1]) {
    const L = sd < 0;
    const hand = (L ? P.handL : P.handR) || restHand(P, sd, X, Y, ly, back);
    for (let x = Math.round(hand[0] - 5); x <= hand[0] + 5; x++) {
      const y = Math.round(hand[1] - 4);
      if (gb.matAt(x, y) === NV && gb.matAt(x, y + 1) === FL) { gb.dim(x, y, 0.65); if ((x & 1) === 0) gb.pix(x, y - 1, M.GOLD, { n: [0, -0.4, 0.9], lum: -0.05 }); }
    }
    // rings sunk into the fingers: gold glints with flesh bulging around them
    const rx = Math.round(hand[0] + sd * 1.5), ry = Math.round(hand[1] + 3);
    if (gb.matAt(rx, ry) === FL) { gb.pix(rx, ry, M.GOLD, { n: [-0.5, -0.5, 0.7], lum: 0.1 }); gb.dim(rx, ry + 1, 0.75); }
    const rx2 = Math.round(hand[0] - sd * 1.6), ry2 = Math.round(hand[1] + 4);
    if (gb.matAt(rx2, ry2) === FL) gb.pix(rx2, ry2, M.GOLD, { n: [-0.3, -0.6, 0.7] });
  }
}

function boots(gb, P, back) {
  const off = P.mass[0], oy = P.mass[1];
  for (const sd of [-1, 1]) {
    const bx = 32 + off + sd * 10 * P.w * P.massW, by = 60.5 + oy * 0.3;
    // cavalry boot: shaft half-buried in the mass, foot splayed out; split up the side
    gb.cap(bx, by - 4.5, 2.4, bx + sd * 0.6, by - 1, 2.3, { mat: M.BOOT, z0: 14, z1: 14, rzk: 0.8, mode: 'z' });
    gb.cap(bx + sd * 0.6, by, 1.8, bx + sd * 3.6, by + 0.6, 1.5, { mat: M.BOOT, z0: 13, z1: 12, rzk: 0.8, mode: 'z' });
    gb.pix(Math.round(bx + sd * 1.2), Math.round(by - 4), FL, { n: [-0.3, -0.5, 0.8], z: 16, mode: 'any' });
    gb.pix(Math.round(bx + sd * 1.6), Math.round(by - 3), FL, { n: [-0.3, -0.2, 0.9], z: 16, mode: 'any', lum: -0.1 });
    gb.pix(Math.round(bx + sd * 1.2), Math.round(by - 2), FL, { n: [0, 0.3, 0.9], z: 16, mode: 'any', lum: -0.2 });
  }
}

function faceFront(gb, P, hx, hy, hs) {
  // the small serene face, set too small in the middle of the head (it does not breathe)
  const fx = Math.round(32 + P.lean[0] + P.head[0] + P.look * 2.2), fy = Math.round(GROUND - (GROUND - 17) * hs + P.lean[1] + P.head[1] + P.faceDY);
  const vis = P.face;
  const put = (dx, dy, mat, o = {}) => { const x = fx + dx, y = fy + dy; if (gb.matAt(x, y)) gb.pix(x, y, mat, { mode: 'any', ...o }); };
  const rows = P.faceRows || (vis >= 0.99 ? [-3, 5] : [Math.round(-3 + (1 - vis) * 8), 5]);
  // mask
  for (let dy = rows[0]; dy <= rows[1]; dy++) for (let dx = -3; dx <= 3; dx++) {
    const e = (dx / 3.6) ** 2 + ((dy - 0.8) / 4.6) ** 2;
    if (e > 1) continue;
    put(dx, dy, M.FACE, { n: [dx * 0.12 - 0.05, (dy - 0.5) * 0.12 - 0.08, 1], lum: 0.02 });
  }
  // pressed-in rim: only its lower lip (a dark arch above the face read as a hairline / a hood's opening)
  for (let dy = rows[0] - 1; dy <= rows[1] + 1; dy++) for (let dx = -5; dx <= 5; dx++) {
    const e = (dx / 3.6) ** 2 + ((dy - 0.8) / 4.6) ** 2;
    if (e > 1 && e < 1.55 && gb.matAt(fx + dx, fy + dy) === FL && dy > 3) gb.dim(fx + dx, fy + dy, 0.8);
  }
  const vis_ = (dy) => dy >= rows[0] && dy <= rows[1];
  // brows
  if (vis_(-2)) { put(-3, -2, M.HAIR); put(-2, -2, M.HAIR); put(1, -2, M.HAIR); put(2, -2, M.HAIR); }
  // eyes: half-lidded, never quite in sync
  const eyeRow = (dxs, lid) => {
    if (!vis_(-1)) return;
    if (lid <= 0.08) { for (const dx of dxs) put(dx, 0, M.DARK); return; }
    for (const dx of dxs) put(dx, -1, M.DARK);
    if (lid > 0.3) put(dxs[0] + (P.look < -0.3 ? 0 : 1) - (dxs[0] < 0 ? 1 : 0), 0, M.IRIS, { lum: lid > 0.7 ? 0.05 : 0 });
    if (lid > 0.7) put(dxs[0] < 0 ? -3 : 3, 0, M.EYE);
  };
  eyeRow([-3, -2], P.lids[0]);
  eyeRow([1, 2], P.lids[1]);
  // nose
  if (vis_(1)) { put(0, 0, M.FACE, { lum: 0.08, n: [-0.3, -0.3, 0.9] }); put(0, 1, M.FACE, { lum: 0.0, n: [-0.2, 0.4, 0.9] }); put(1, 1, M.FACE, { n: [0.4, 0.4, 0.8], lum: -0.12 }); }
  // mutton chops into the mustache
  if (vis_(2)) {
    for (const dx of [-3, 3]) { put(dx, 1, M.HAIR); put(dx, 2, M.HAIR); }
    put(-2, 2, M.HAIR); put(-1, 2, M.HAIR); put(1, 2, M.HAIR); put(2, 2, M.HAIR); put(0, 2, M.HAIR, { lum: -0.1 });
    put(-3, 3, M.HAIR, { lum: -0.05 }); put(3, 3, M.HAIR, { lum: -0.05 });
  }
  // mouth: a polite closed smile … or a slot that opens too far, vertically
  if (vis_(3)) {
    if (P.mouth > 0.2) {
      const n = Math.round(1 + P.mouth * 3);
      for (let k = 0; k < n; k++) put(0, 3 + k, M.MOUTH);
      put(-1, 3, M.MOUTH); put(1, 3, M.MOUTH);
    } else {
      put(-1, 3, M.FACE, { lum: -0.22 }); put(0, 3, M.FACE, { lum: -0.18 }); put(1, 3, M.FACE, { lum: -0.22 });
      put(-2, 3, M.FACE, { lum: -0.3 }); put(2, 3, M.FACE, { lum: -0.3 });
    }
  }
}

// ------------------------------------------------------------------------------------------ side
function buildSide(P) {
  // facing LEFT; 'right' mirrors the geometry (lighting stays top-left)
  const gb = new GBuf(FW, FH);
  const s = P.w, hs = P.h, b = P.b;
  const Y = (y) => GROUND - (GROUND - y) * hs;
  const X = (x) => 32 + (x - 32) * s + P.lean[0];
  const ly = P.lean[1];
  const hf = new HField(FW, FH, 0.42);
  const mx = 35 + P.mass[0], my = 55.5 + P.mass[1];
  hf.blob(mx, my, 22 * s * P.massW, 7.2, 12, { mat: NV, p: 0.5 });          // dragged bulk trailing behind
  hf.blob(mx + 14 * s, my + 1.5, 8 * s, 4.5, 10, { mat: FL, p: 0.6 });
  hf.blob(X(37), Y(37.5), 13 * s, 15.5 * hs, 17, { mat: NV, p: 0.5 });                     // back mass
  hf.blob(X(27 - b * 0.6), Y(41 - b * 0.3) + ly * 0.5, (17.5 + b * 1.2) * s, (14 + b * 0.6) * hs, 19 + b, { mat: NV, p: 0.5 }); // belly (forward)
  hf.blob(X(31), Y(28.5 - b * 0.6) + ly * 0.8, 14.5 * s, 9.5 * hs, 16, { mat: NV, p: 0.5 });
  hf.blob(X(34), Y(24 - b * 0.8) + ly * 0.8, 9 * s, 7 * hs, 15, { mat: NV, p: 0.5 });       // near shoulder
  const hx = X(26.5) + P.head[0], hy = Y(16.3 - b * 0.6) + ly + P.head[1];
  hf.blob(hx, hy, 11.2 * s, 10.6 * hs, 13, { mat: FL, p: 0.55 });
  hf.blob(hx + 2 * s, hy - 1 * hs, 9 * s, 9 * hs, 14, { mat: FL, p: 0.55 });
  hf.blob(hx - 1 * s, hy + 8.5 * hs, 9 * s, 4.5 * hs, 15, { mat: FL, p: 0.6 });          // wattle
  hf.blob(hx + 7 * s, hy + 6 * hs, 6 * s, 6 * hs, 14, { mat: FL, p: 0.6 });             // nape roll
  hf.finalize();
  hf.fold([[hx - 9 * s, hy + 11.5 * hs], [hx - 3, hy + 13 * hs], [hx + 6 * s, hy + 11 * hs]], 1.2, 3);
  hf.fold([[X(11), Y(49)], [X(22), Y(53.5)], [X(36), Y(52)]], 1.3, 3);
  hf.groove([[hx + 4 * s, hy + 2], [hx + 8 * s, hy + 5], [hx + 10 * s, hy + 9]], 1, 1.4);
  hf.toGB(gb);
  // a crisp shine on the bald dome (flesh, not wool)
  for (const [dx, dy, l] of [[-3, -7, 0.2], [-2, -8, 0.24], [-1, -8, 0.2], [-2, -7, 0.12], [0, -9, 0.1]]) { const x = Math.round(hx + dx * s), y = Math.round(hy + dy * hs); if (gb.matAt(x, y) === FL) gb.dim(x, y, 1, l); }
  // coat front opening along the belly's leading edge (flesh straining through)
  const oy0 = Y(28) + ly * 0.8, oy1 = Y(52) + ly * 0.4;
  for (let y = Math.floor(oy0); y <= oy1; y++) {
    const t = (y - oy0) / (oy1 - oy0);
    // leading edge x of the belly at this row
    let lx = -1; for (let x = 2; x < 40; x++) if (gb.matAt(x, y) === NV) { lx = x; break; }
    if (lx < 0) continue;
    const wpx = Math.round(1 + 2.2 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + b * 0.6);
    for (let x = lx; x < lx + wpx; x++) { const i = y * FW + x; gb._put(i, FL, gb.nx[i] * 0.7 - 0.2, gb.ny[i] * 0.7, 1, gb.z[i] + 0.5, { mode: 'any', ao: 1, lum: 0.03 }); }
    if (gb.matAt(lx + wpx, y) === NV) gb.dim(lx + wpx, y, 0.55);
    if (Math.round(y - oy0) % 4 === 1 && Math.round(y - oy0) < 20) gb.pix(lx + wpx + 2, y, M.BRASS, { n: [-0.5, -0.5, 0.7] });
  }
  // sash band wrapping the belly
  const sy = Y(45) + ly * 0.45;
  for (let x = 0; x < FW; x++) {
    const u = (x - X(27)) / (18 * s);
    const yc = sy + u * 1.5 - u * u * 2;
    for (let y = Math.round(yc - 2.2); y <= Math.round(yc + 1.8); y++) {
      const m = gb.matAt(x, y); if (m !== NV && m !== FL) continue;
      if (x > X(46)) continue;
      const i = y * FW + x, edge = y === Math.round(yc - 2.2) || y === Math.round(yc + 1.8);
      gb._put(i, edge ? M.SASH_D : M.SASH, gb.nx[i], gb.ny[i] - 0.15, gb.nz[i], gb.z[i] + 0.6, { mode: 'any', ao: 1, lum: ((x + y * 2) % 5 === 0) ? -0.06 : 0 });
    }
  }
  if (!P.mirror) { // knot on his left hip faces us when he faces left
    const kx = X(36), ky = sy;
    gb.ell(kx, ky, 2.8, 2.3, { mat: M.SASH, z: 24, rz: 3, mode: 'z' });
    gb.cap(kx, ky + 2, 1.1, kx + 1, ky + 8 * hs, 1.2, { mat: M.SASH_D, z0: 23, z1: 22, rzk: 1, mode: 'z' });
    gb.cap(kx + 2, ky + 2, 1.1, kx + 3, ky + 7 * hs, 1.2, { mat: M.SASH, z0: 23, z1: 22, rzk: 1, mode: 'z' });
  }
  // coat tails dragging behind
  gb.poly([[X(40), Y(46)], [X(50), Y(50)], [X(54), Y(58)], [X(44), Y(56)]], { mat: M.NAVY_D, z: 8, mode: 'under', n: [0.3, -0.4, 0.8] });
  // far arm (behind) then near arm
  sideArms(gb, P, X, Y, ly);
  // epaulette on the near shoulder, swallowed
  const ex = X(35), ey = Y(21 - b * 0.8) + ly * 0.8;
  gb.ell(ex, ey, 5.5 * s, 2.5, { mat: M.GOLD, z: 40, rz: 3, mode: 'any', tilt: [0, -0.4] });
  for (let k = -3; k <= 3; k += 2) { gb.pix(Math.round(ex + k * 1.4), Math.round(ey + 2.5), M.GOLD, { n: [0, 0.2, 1], z: 41 }); gb.pix(Math.round(ex + k * 1.4), Math.round(ey + 3.5), M.GOLD, { n: [0, 0.5, 0.8], z: 41 }); }
  gb.ell(X(29.5) + P.head[0] * 0.4, Y(21.5) + ly * 0.9, 3.8 * s, 2.6, { mat: FL, z: 42, rz: 2.5, mode: 'any' });
  // boots: one dragged forward, one trailing
  gb.cap(X(20) + P.mass[0] * 0.3, 58.5, 2.6, X(16) + P.mass[0] * 0.3, 61.5, 2.3, { mat: M.BOOT, z0: 10, z1: 11, rzk: 0.9, mode: 'z' });
  gb.pix(Math.round(X(20) + P.mass[0] * 0.3), 58, FL, { n: [-0.3, -0.5, 0.8], z: 12, mode: 'any' });
  gb.cap(48 + P.mass[0], 59.5 + P.mass[1] * 0.3, 2.4, 53 + P.mass[0], 61.5, 2.1, { mat: M.BOOT, z0: 9, z1: 9, rzk: 0.9, mode: 'z' });
  gb.pix(Math.round(49 + P.mass[0]), 59, FL, { n: [0.3, -0.5, 0.8], z: 11, mode: 'any' });
  if (P.face > 0) faceSide(gb, P, hx, hy, hs);
  return gb;
}

function sideArms(gb, P, X, Y, ly) {
  const af = new HField(FW, FH, 0.6);
  const hs = P.h;
  // far arm: shorter, behind the belly
  const fsx = X(26), fsy = Y(26) + ly * 0.8, fh = P.handL || [X(15), Y(48) + ly * 0.3];
  af.tube(fsx, fsy, 5, fh[0] + 1, fh[1] - 3, 4.4, { mat: M.NAVY_D, z0: 12, z1: 13, k: 0.8 });
  af.blob(fh[0], fh[1], 4.2, 4.2, 5, { base: 12, mat: FL, p: 0.6 });
  for (let f = 0; f < 3; f++) af.tube(fh[0] - 2 + f * 1.6, fh[1] + 2, 1.4, fh[0] - 3 + f * 1.6, fh[1] + 5.5, 1.2, { mat: FL, z0: 13, z1: 13, k: 1 });
  af.finalize();
  af.toGB(gb);
  const nf = new HField(FW, FH, 0.6);
  const sx = X(35), sy = Y(25.5 - P.b * 0.8) + ly * 0.8;
  const hand = P.handR || [X(24), Y(50.5) + ly * 0.3];
  const zf = P.armZR || 0;
  const ex = (sx + hand[0]) / 2 + 2.5, ey = (sy + hand[1]) / 2 + 1;
  nf.tube(sx, sy, 6, ex, ey, 5.5, { mat: NV, z0: 24 + zf, z1: 26 + zf, k: 0.9 });
  nf.tube(ex, ey, 5.5, hand[0] + 1, hand[1] - 3.5, 4.8, { mat: NV, z0: 26 + zf, z1: 27 + zf * 1.4, k: 0.9 });
  const op = P.openR || 0;
  nf.blob(hand[0], hand[1], 5.8, 5.3, 6.5, { base: 25 + zf * 1.4, mat: FL, p: 0.6 });
  for (let f = 0; f < 4; f++) {
    const a = Math.PI * 0.62 + (f - 1.5) * (0.22 + op * 0.3);
    const fx0 = hand[0] + Math.cos(a) * 2.4 - 0.5 + (f - 1.5) * 0.9, fy0 = hand[1] + Math.sin(a) * 2.4;
    nf.tube(fx0, fy0, 1.8, fx0 + Math.cos(a) * 5, fy0 + Math.sin(a) * 5, 1.6, { mat: FL, z0: 27 + zf * 1.4, z1: 26.5 + zf * 1.4, k: 1 });
  }
  nf.finalize();
  nf.toGB(gb);
  for (let x = Math.round(hand[0] - 5); x <= hand[0] + 6; x++) {
    const y = Math.round(hand[1] - 4);
    if (gb.matAt(x, y) === NV && gb.matAt(x, y + 1) === FL) { gb.dim(x, y, 0.65); if ((x & 1) === 0) gb.pix(x, y - 1, M.GOLD, { n: [0, -0.4, 0.9], lum: -0.05 }); }
  }
  const rx = Math.round(hand[0] - 1), ry = Math.round(hand[1] + 3);
  if (gb.matAt(rx, ry) === FL) { gb.pix(rx, ry, M.GOLD, { n: [-0.5, -0.5, 0.7], lum: 0.1 }); gb.dim(rx, ry + 1, 0.75); }
}

function faceSide(gb, P, hx, hy, hs) {
  // the little face seen from the side, near the front of the dome; the dough bulges past it
  const fx = Math.round(hx - 7.5 * P.w), fy = Math.round(hy + 0.5 + P.faceDY);
  const put = (dx, dy, mat, o = {}) => { const x = fx + dx, y = fy + dy; if (gb.matAt(x, y)) gb.pix(x, y, mat, { mode: 'any', ...o }); };
  for (let dy = -3; dy <= 5; dy++) for (let dx = -2; dx <= 2; dx++) {
    const e = ((dx + 0.3) / 2.6) ** 2 + ((dy - 0.8) / 4.6) ** 2;
    if (e <= 1) put(dx, dy, M.FACE, { n: [-0.45 + dx * 0.1, (dy - 0.5) * 0.12 - 0.08, 0.9] });
  }
  for (let dy = 2; dy <= 6; dy++) { if (gb.matAt(fx + 3, fy + dy) === FL) gb.dim(fx + 3, fy + dy, 0.82); }   // a short jaw crease (a full-height line read as a hood's edge)
  put(-1, -2, M.HAIR); put(0, -2, M.HAIR);                       // brow
  put(-1, -1, M.DARK); put(0, -1, M.DARK);                       // lid
  if (P.lids[0] > 0.3) put(-1, 0, M.IRIS);
  // nose barely clearing the dough
  const nx = fx - 3, ny = fy + 1;
  if (!gb.matAt(nx, ny) || gb.matAt(nx, ny) === FL) gb.pix(nx, ny, M.FACE, { mode: 'any', n: [-0.6, -0.2, 0.7], z: 30 });
  put(-2, 2, M.HAIR); put(-1, 2, M.HAIR); put(0, 2, M.HAIR); put(1, 1, M.HAIR); put(1, 2, M.HAIR); put(1, 0, M.HAIR); // mustache → chop
  put(-2, 3, M.HAIR, { lum: -0.08 });
  if (P.mouth > 0.2) { const n = Math.round(1 + P.mouth * 3); for (let k = 0; k < n; k++) put(-1, 3 + k, M.MOUTH); }
  else put(-1, 3, M.FACE, { lum: -0.25 });
}

// ------------------------------------------------------------------------------------------ render
function mirrorGB(gb) {
  const o = new GBuf(FW, FH);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const i = y * FW + x, j = y * FW + (FW - 1 - x);
    o.mat[j] = gb.mat[i]; o.nx[j] = -gb.nx[i]; o.ny[j] = gb.ny[i]; o.nz[j] = gb.nz[i]; o.z[j] = gb.z[i]; o.ao[j] = gb.ao[i]; o.lum[j] = gb.lum[i];
  }
  return o;
}

const FWD = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

function buildGB(P) {
  let gb;
  if (P.coatHeap) gb = buildCoatHeap(P);
  else if (P.dir === 'left' || P.dir === 'right') {
    gb = buildSide({ ...P, mirror: P.dir === 'right' });
    if (P.dir === 'right') gb = mirrorGB(gb);
  } else gb = buildFront(P, P.dir === 'up');
  if (P.paper) paperRoll(gb, P);
  if (P.crumble > 0) crumbleGB(gb, P);
  if (P.clipX != null) peekClip(gb, P);
  if (P.sinkY > 0) sinkShift(gb, Math.round(P.sinkY));
  if (P.spill > 0) spillGB(gb, P); // after the floor clip: the stain he goes into stays visible
  return gb;
}

export function renderPose(P) {
  const gb = buildGB(P);
  gb.folds(1.6, 0.6, 0.86);
  const img = shade(gb, SPRITE_RIG);
  if (P.dust) dustImg(img, P);
  outlineImg(img, OUTLINE);
  if (P.smear) smearImg(img, P);
  return imgToCanvas(img);
}

// lunge: dithered dark after-images left behind him (he moves faster than he should be able to)
const BAY = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
function smearImg(img, P) {
  const [fx, fy] = FWD[P.dir], d = img.data, src = new Uint8ClampedArray(d);
  const n = Math.round(P.smear);
  for (let k = 1; k <= n; k++) {
    const dens = 0.62 - k * 0.13, off = k * 3;
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const i = (y * FW + x) * 4; if (d[i + 3]) continue;
      const sx = x + fx * off, sy = y + fy * off;
      if (sx < 0 || sy < 0 || sx >= FW || sy >= FH) continue;
      const j = (sy * FW + sx) * 4; if (!src[j + 3]) continue;
      if (BAY[y & 3][x & 3] / 16 >= dens) continue;
      const g = 0.32 - k * 0.05;
      d[i] = src[j] * g; d[i + 1] = src[j + 1] * g; d[i + 2] = src[j + 2] * g + 8; d[i + 3] = 255;
    }
  }
}

// peek: everything past the door-frame edge is hidden; fingers wrap around the frame
function peekClip(gb, P) {
  const cx = P.clipX, keepLeft = cx > 0, edge = Math.abs(cx);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (keepLeft ? x >= edge : x < edge) gb.mat[y * FW + x] = 0;
  }
  // the hand gripping the frame edge
  const hy = P.gripY ?? 34, ex = keepLeft ? edge - 1 : edge;
  for (let k = 0; k < 4; k++) {
    const y = hy + k * 2;
    for (let j = 0; j < 2; j++) gb.pix(ex - (keepLeft ? j : -j), y, FL, { mode: 'any', n: [keepLeft ? 0.5 : -0.5, -0.3 + k * 0.1, 0.8], z: 40, ao: 1, lum: j ? -0.05 : 0.05 });
    gb.pix(ex - (keepLeft ? 2 : -2), y, FL, { mode: 'any', n: [0, 0, 1], z: 39, ao: 0.7 });
    if (k === 1) gb.pix(ex - (keepLeft ? 1 : -1), y, M.GOLD, { mode: 'any', n: [-0.4, -0.5, 0.8], z: 41 });
  }
}

// sink: the whole mass is pulled down through the floor line (everything below it is gone)
function sinkShift(gb, dy) {
  const src = gb.clone();
  gb.clear();
  for (let y = 0; y <= GROUND; y++) {
    const sy = y - dy; if (sy < 0) continue;
    for (let x = 0; x < FW; x++) {
      const i = y * FW + x, j = sy * FW + x; if (!src.mat[j]) continue;
      gb.mat[i] = src.mat[j]; gb.nx[i] = src.nx[j]; gb.ny[i] = src.ny[j]; gb.nz[i] = src.nz[j]; gb.z[i] = src.z[j]; gb.ao[i] = src.ao[j]; gb.lum[i] = src.lum[j];
    }
  }
  for (let x = 0; x < FW; x++) if (gb.mat[GROUND * FW + x]) gb.ao[GROUND * FW + x] *= 0.5; // the lip where he meets the floor
}

// sink/emerge: the dark stain on the floor he goes down into / comes up out of
function spillGB(gb, P) {
  const rx = P.spill, ry = Math.max(1.5, rx * 0.2), cy = GROUND - 0.5;
  for (let y = Math.floor(cy - ry); y < FH; y++) for (let x = Math.floor(32 - rx); x <= Math.ceil(32 + rx); x++) {
    if (x < 0 || x >= FW || ((x - 32) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1 || gb.mat[y * FW + x]) continue;
    gb.pix(x, y, M.DARK, { mode: 'any', n: [0, 0, 1], z: 1, ao: 1, lum: -0.25 });
  }
}

// lectern: the long roll of names in his hands, draped over the lectern's edge
function paperRoll(gb, P) {
  const hl = P.handL, hr = P.handR; if (!hl || !hr) return;
  const cx = (hl[0] + hr[0]) / 2, x0 = Math.round(cx - 5), x1 = Math.round(cx + 4), y0 = Math.round(Math.min(hl[1], hr[1]) - 1);
  for (let x = x0; x <= x1; x++) {
    const drop = 13 + ((x * 7) % 3) + (P.pageLift ? (x > cx ? -4 : 0) : 0);
    for (let y = y0; y <= y0 + drop; y++) {
      const ny = y === y0 ? -0.8 : 0.1;
      gb.pix(x, y, M.PAPER, { mode: 'any', n: [(x - (x0 + x1) / 2) * 0.05, ny, 1], z: 45, ao: 1, lum: ((y - y0) % 3 === 1 && x > x0 + 1 && x < x1 - 1 && (x + y) % 4) ? -0.25 : 0 });
    }
  }
}

// dissolve: flesh goes to coal and falls away from the top down; wool goes sodden and slumps
function crumbleGB(gb, P) {
  const c = P.crumble;
  const top = GROUND - (GROUND - 4) * (1 - c * 0.2);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const i = y * FW + x, m = gb.mat[i]; if (!m) continue;
    const isFlesh = m === FL || m === M.FACE || m === M.HAIR || m === M.DARK || m === M.IRIS || m === M.MOUTH || m === M.EYE;
    const n = fbm(x, y, 3.5, 31) * 0.7 + hnoise(x, y, 5) * 0.3;
    const fromTop = 1 - (y - top) / (GROUND - top);
    const e = c * 1.55 + fromTop * 0.55 * c + n * 0.5 - 0.75 - (m === M.FACE ? 0.15 : 0);
    if (isFlesh) {
      if (e > 0.45) { gb.mat[i] = 0; continue; }
      if (e > 0.12) { gb.mat[i] = M.COAL; gb.lum[i] -= 0.05; }
    } else if (m === NV || m === M.NAVY_D) {
      if (e > 0.25) gb.mat[i] = M.WOOL_WET;
    }
  }
}
function dustImg(img, P) {
  // coal dust sifting down beside him
  const d = img.data;
  for (let k = 0; k < P.dust; k++) {
    const x = 8 + Math.floor(hnoise(k, 3, 17) * 48), y0 = 6 + Math.floor(hnoise(k, 4, 17) * 50) + Math.round(P.dustFall * 6);
    for (let j = 0; j < 3; j++) {
      const y = y0 + j * 3; if (y >= FH - 1) break;
      const i = (y * FW + x) * 4; if (d[i + 3]) continue;
      const v = 14 + (k % 3) * 10; d[i] = v; d[i + 1] = v; d[i + 2] = v + 6; d[i + 3] = 255;
    }
  }
}

// the empty uniform left behind: sodden coat in a heap, sash, epaulettes, a drift of coal
function buildCoatHeap(P) {
  const gb = new GBuf(FW, FH);
  const t = P.heapT ?? 1;
  const hf = new HField(FW, FH, 0.45);
  hf.blob(32, 57, 25, 6.5, 6, { mat: M.COAL, p: 0.5 });                                     // coal dust drift
  hf.blob(31, 54 - 4 * (1 - t), 19 + 3 * (1 - t), 7 + 6 * (1 - t), 9 + 9 * (1 - t), { mat: M.WOOL_WET, p: 0.5 });  // the coat, collapsing
  hf.blob(24, 50 - 7 * (1 - t), 9, 5, 11 + 6 * (1 - t), { mat: NV, p: 0.55 });               // a shoulder, still holding shape
  hf.blob(41, 52 - 5 * (1 - t), 8, 4, 10 + 5 * (1 - t), { mat: NV, p: 0.55 });
  hf.tube(14, 52, 3.5, 6, 58, 3, { mat: M.WOOL_WET, z0: 6, z1: 4 });                        // empty sleeves
  hf.tube(48, 54, 3.5, 57, 58, 3, { mat: M.WOOL_WET, z0: 6, z1: 4 });
  hf.finalize();
  hf.fold([[18, 52], [30, 55], [44, 53]], 1.2, 2);
  hf.toGB(gb);
  // sash lying across the heap
  for (let x = 16; x <= 46; x++) {
    const yc = 56 - Math.sin((x - 16) / 30 * Math.PI) * 4;
    for (let y = Math.round(yc - 1); y <= Math.round(yc + 1); y++) if (gb.matAt(x, y)) gb.pix(x, y, y === Math.round(yc + 1) ? M.SASH_D : M.SASH, { n: [0, -0.4, 0.9] });
  }
  gb.cap(45, 56, 1.1, 48, 61, 1.1, { mat: M.SASH, z0: 20, z1: 18, rzk: 1, mode: 'z' });
  // epaulettes, buttons glinting in the black
  gb.ell(21, 48.5 - 7 * (1 - t), 4.5, 2.2, { mat: M.GOLD, z: 22, rz: 2, mode: 'any', tilt: [0, -0.5] });
  gb.ell(44, 50.5 - 5 * (1 - t), 4, 2, { mat: M.GOLD, z: 22, rz: 2, mode: 'any', tilt: [0.2, -0.5] });
  for (const [x, y] of [[29, 51], [33, 52], [30, 54], [35, 55]]) gb.pix(x, y, M.BRASS, { n: [-0.3, -0.4, 0.9], z: 25 });
  // the boots, empty, toppled
  gb.cap(18, 60, 2.2, 13, 61.5, 2, { mat: M.BOOT, z0: 6, z1: 6, rzk: 0.8, mode: 'z' });
  gb.cap(46, 60.5, 2.2, 51, 61, 2, { mat: M.BOOT, z0: 6, z1: 6, rzk: 0.8, mode: 'z' });
  return gb;
}

// ------------------------------------------------------------------------------------------ anims
const DIRS = ['down', 'up', 'left', 'right'];
const isSide = (d) => d === 'left' || d === 'right';
function seq(dir, n, fn) { const out = []; for (let i = 0; i < n; i++) { const P = basePose(dir); fn(P, i, i / n); out.push(renderPose(P)); } return out; }

function idleAnim(dir) {
  return { frames: seq(dir, 12, (P, i, t) => {
    P.b = (1 - Math.cos(t * Math.PI * 2)) / 2;
    if (i === 7) P.lids = [0, 0.4];      // the eyes never quite blink together
    if (i === 8) P.lids = [0.3, 0];
  }), fps: 4, loop: true };
}

function dragAnim(dir) {
  // alternating arm pulls: reach, plant, haul (the body lurches), settle
  return { frames: seq(dir, 6, (P, i) => {
    const ph = i % 3, A = i < 3;
    const lurch = [0.5, 1.5, 2.6][ph], trail = [-2.2, -1.4, 0][ph];
    P.b = [0.35, 0.55, 0.9, 0.35, 0.55, 0.9][i];
    P.lids = [0.45, 0.4];
    if (dir === 'down') {
      P.lean = [(A ? -1 : 1) * [0.5, 1, 0.5][ph], lurch]; P.head = [0, lurch * 0.3]; P.mass = [0, trail]; P.massW = 1 + ph * 0.03;
      const reach = [[9, 55], [10, 57.5], [13, 54]][ph];
      if (A) P.handL = [reach[0], reach[1]]; else P.handR = [64 - reach[0], reach[1]];
    } else if (dir === 'up') {
      P.lean = [(A ? -1 : 1) * [0.5, 1, 0.5][ph], -lurch * 0.55]; P.head = [0, -lurch * 0.15]; P.mass = [0, -trail * 0.6]; P.massW = 1 + ph * 0.03;
      const reach = [[7, 40], [8, 37], [10, 44]][ph];
      if (A) P.handL = reach; else P.handR = [64 - reach[0], reach[1]];
    } else {
      const sg = 1; // authored facing left; mirrored for right
      P.lean = [-lurch * sg, [0.5, 1, 0][ph]]; P.head = [-lurch * 0.4, 0]; P.mass = [-trail * 1.4, 0]; P.massW = 1 - trail * 0.03;
      if (A) P.handR = [[16, 53], [12, 55], [17, 54]][ph]; else P.handL = [[10, 49], [8, 52], [12, 51]][ph];
    }
  }), fps: 6, loop: true };
}

function lungeAnim(dir) {
  return { frames: seq(dir, 3, (P, i) => {
    const [fx, fy] = FWD[dir];
    P.lids = [0.7, 0.62];
    if (i === 0) { // gathering: squashed, drawn back
      P.h = 0.92; P.w = 1.07; P.lean = [-fx * 2, -fy * 1.5]; P.b = 1;
      if (!isSide(dir)) { P.handL = [12, 46]; P.handR = [52, 46]; } else { P.handR = [30, 50]; P.handL = [22, 47]; }
    } else if (i === 1) { // the smear
      P.h = isSide(dir) ? 0.94 : 1.02; P.w = isSide(dir) ? 1.18 : 0.94;
      P.lean = [fx * 5, fy * (dir === 'up' ? 1.5 : 3)]; P.head = [fx * 2, fy * (dir === 'up' ? 0.5 : 2)]; P.smear = dir === 'down' ? 3 : 4; P.mouth = 1;
      if (dir === 'down') { P.handL = [14, 61]; P.handR = [50, 61]; P.openL = 1; P.openR = 1; }
      else if (dir === 'up') { P.handL = [10, 30]; P.handR = [54, 30]; }
      else { P.handR = [7, 44]; P.handL = [6, 40]; P.openR = 1; }
    } else { // landing, arms out
      P.lean = [fx * 3, fy * (dir === 'up' ? 1 : 2.5)]; P.head = [fx, dir === 'up' ? 0 : fy]; P.mouth = 0.6; P.smear = 1;
      if (dir === 'down') { P.handL = [12, 59]; P.handR = [52, 59]; P.openL = 0.6; P.openR = 0.6; }
      else if (dir === 'up') { P.handL = [9, 36]; P.handR = [55, 36]; }
      else { P.handR = [8, 48]; P.handL = [7, 45]; P.openR = 0.6; }
    }
  }), fps: 8, loop: true };
}

function reachAnim(dir) {
  return { frames: seq(dir, 4, (P, i) => {
    const [fx, fy] = FWD[dir];
    P.lids = [0.62, 0.58]; P.b = 0.6;
    P.lean = [fx * [0, 1.5, 2.5, 2.5][i], fy * [0, 1, 2, 2][i]];
    const open = [0.3, 1, 0.7, 0][i];
    if (dir === 'down') { P.handR = [[52, 47], [44, 58], [40, 61], [41, 60]][i]; P.armZR = [2, 8, 10, 10][i]; P.openR = open; }
    else if (dir === 'up') { P.handR = [[54, 40], [52, 28], [49, 23], [49, 24]][i]; P.openR = open; }
    else { P.handR = [[22, 46], [11, 42], [8, 41], [9, 41]][i]; P.openR = open; P.armZR = 4; }
  }), fps: 6, loop: false };
}

function peekAnim(dir) {
  // half his bulk leaning around a door frame; the rest of him is hidden behind the wall
  return { frames: seq(dir, 4, (P, i) => {
    const k = [0.2, 0.55, 0.85, 1][i];
    P.lids = i >= 2 ? [0.6, 0.55] : [0.45, 0.4]; P.b = 0.4;
    if (dir === 'down' || dir === 'up') {
      P.lean = [-1 * k, (dir === 'down' ? 1.5 : -1) * k]; P.head = [-2 * k, 0]; P.look = dir === 'down' ? -0.6 * k : 0;
      P.clipX = Math.round(30 + 8 * k); P.gripY = 30;
    } else {
      P.lean = [-5 * k, 1 * k]; P.head = [-2 * k, 0.5 * k];
      P.clipX = Math.round(26 + 10 * k); P.gripY = 31;
      if (dir === 'right') P.clipX = -(64 - Math.round(26 + 10 * k));
    }
  }), fps: 4, loop: false };
}

// mound: seated on the floor like a heap. Folded rolls of dark wool — it could pass for a stack of
// gym mats — with the top of the dough head sunk among them and only a sliver of the face showing.
function buildMound(P) {
  const gb = new GBuf(FW, FH);
  const b = P.b, lift = P.lift || 0, plant = P.plant || 0;
  const hf = new HField(FW, FH, 0.5);
  hf.blob(32, 55.5, 26, 7.5, 10, { mat: NV, p: 0.5 });
  hf.blob(31, 50.5 - lift * 1.5, 23 + b * 0.8, 6.2, 15 + b, { mat: NV, p: 0.55 });
  hf.blob(33, 45.5 - lift * 2.5, 19 + b * 0.6, 5.6, 18 + b, { mat: NV, p: 0.55 });
  hf.blob(31, 41 - lift * 3.5, 14.5, 5, 19, { mat: NV, p: 0.55 });
  hf.blob(32, 36.5 - lift * 5, 9.5, 7.2, 21, { mat: FL, p: 0.55 });                      // the head, sunk forward
  hf.finalize();
  hf.fold([[8, 52.5], [30, 54.5 - lift], [56, 52]], 1.1, 3);
  hf.fold([[11, 47.5 - lift], [32, 49.5 - lift * 1.5], [53, 47]], 1.1, 3);
  hf.fold([[15, 43 - lift * 2], [32, 45 - lift * 2.5], [49, 43]], 1.1, 3);
  hf.fold([[21, 39 - lift * 3], [33, 41.5 - lift * 3.5], [45, 39 - lift * 3]], 1.0, 2.5);
  hf.toGB(gb);
  // the face, barely: brows and the line of the lids peeking over the top roll
  const fx = 33, fy = Math.round(38 - lift * 5);
  const put = (dx, dy, mat, o = {}) => { const m0 = gb.matAt(fx + dx, fy + dy); if (m0 === FL || m0 === M.FACE) gb.pix(fx + dx, fy + dy, mat, { mode: 'any', ...o }); };
  for (let dy = -2; dy <= (lift > 0.5 ? 2 : 0); dy++) for (let dx = -3; dx <= 3; dx++) if ((dx / 3.6) ** 2 + ((dy + 0.3) / 3.2) ** 2 <= 1) put(dx, dy, M.FACE, { n: [dx * 0.1, -0.1, 1] });
  put(-3, -2, M.HAIR); put(-2, -2, M.HAIR); put(1, -2, M.HAIR); put(2, -2, M.HAIR);
  const open = P.lids[0] > 0.5;
  put(-3, -1, M.DARK); put(-2, -1, M.DARK); put(1, -1, M.DARK); put(2, -1, M.DARK);
  if (open) { put(-2, 0, M.IRIS); put(1, 0, M.IRIS); }
  if (lift > 0.5) { put(-1, 1, M.HAIR); put(0, 1, M.HAIR); put(1, 1, M.HAIR); put(-2, 1, M.HAIR); put(2, 1, M.HAIR); }
  // a hand limp on the floor, a boot tip, one brass glint, a tassel end — little else gives it away
  const hl = [10 + plant * 2, 59 - plant * 1], hr = [55 - plant * 2, 59.5 - plant];
  const af = new HField(FW, FH, 0.6);
  af.blob(hl[0], hl[1], 4.6, 3.2, 4, { base: 8, mat: FL, p: 0.6 });
  for (let f = 0; f < 3; f++) af.tube(hl[0] - 3 + f * 1.8, hl[1] + 1, 1.4, hl[0] - 5 + f * 1.8, hl[1] + 2.5, 1.2, { mat: FL, z0: 9, z1: 9 });
  if (plant > 0) { af.blob(hr[0], hr[1], 4.6, 3.2, 4, { base: 8, mat: FL, p: 0.6 }); af.tube(hr[0] - 6, hr[1] - 5, 3.5, hr[0] - 1, hr[1] - 2, 3.2, { mat: NV, z0: 12, z1: 10 }); }
  af.tube(hl[0] + 6, hl[1] - 5, 3.5, hl[0] + 1, hl[1] - 2, 3.2, { mat: NV, z0: 12, z1: 10 });
  af.finalize(); af.toGB(gb);
  gb.cap(53, 60, 2.2, 57, 61.3, 1.8, { mat: M.BOOT, z0: 9, z1: 9, rzk: 0.8, mode: 'z' });
  gb.pix(53, 59, FL, { n: [0, -0.5, 0.8], z: 12, mode: 'any', lum: -0.1 });
  gb.pix(39, Math.round(46 - lift * 2.5), M.BRASS, { n: [-0.3, -0.4, 0.9], z: 40, mode: 'any' });
  gb.pix(17, Math.round(48.5 - lift * 1.5), M.GOLD, { n: [-0.3, -0.4, 0.9], z: 40, mode: 'any', lum: -0.1 });
  gb.pix(18, Math.round(48.5 - lift * 1.5), M.GOLD, { n: [0, 0, 1], z: 40, mode: 'any', lum: -0.2 });
  gb.pix(44, 60, M.SASH_D, { n: [0, 0, 1], z: 30, mode: 'any' }); gb.pix(44, 61, M.SASH_D, { n: [0, 0.4, 0.9], z: 30, mode: 'any' });
  return gb;
}
function renderMound(P) {
  const gb = buildMound(P);
  gb.folds(1.6, 0.6, 0.86);
  const img = shade(gb, SPRITE_RIG);
  outlineImg(img, OUTLINE);
  return imgToCanvas(img);
}
function moundAnim() {
  return { frames: [0, 1, 2, 3].map((i) => { const P = basePose('down'); P.b = 0.5 + 0.5 * Math.sin(i / 4 * Math.PI * 2); P.lids = [0.35, 0.3]; return renderMound(P); }), fps: 2, loop: true };
}
function riseAnim() {
  // the first full-body reveal: the face lifts out of the heap first, then the mass heaves up and unfurls
  const frames = [];
  let P = basePose('down'); P.lids = [0.35, 0.3]; frames.push(renderMound(P));
  P = basePose('down'); P.lids = [0.62, 0.58]; P.lift = 0.6; P.b = 0.8; frames.push(renderMound(P));
  P = basePose('down'); P.lids = [0.62, 0.58]; P.lift = 1; P.plant = 1; P.b = 1; frames.push(renderMound(P));
  const steps = [
    { h: 0.66, w: 1.12, massW: 1.15, handL: [8, 59], handR: [56, 59], b: 1 },
    { h: 0.84, w: 1.05, massW: 1.08, handL: [9, 57], handR: [55, 57], b: 1 },
    { h: 1.035, w: 0.97, b: 1 },
    { h: 1.0, b: 0.7 },
    { h: 1.0, b: 0.4 },
  ];
  for (const st of steps) { const Q = Object.assign(basePose('down'), st); Q.lids = [0.62, 0.58]; frames.push(renderPose(Q)); }
  return { frames, fps: 5, loop: false };
}

// seated on the floor, facing them (Ch6 gym, the last light bank): rise frame 3's pose, breathing — so
// rise_seated (rise from frame 3) takes over from it without a seam
function sitFloorAnim() {
  return { frames: [1, 0.6].map((b) => {
    const Q = Object.assign(basePose('down'), { h: 0.66, w: 1.12, massW: 1.15, handL: [8, 59], handR: [56, 59], b });
    Q.lids = [0.62, 0.58];
    return renderPose(Q);
  }), fps: 1, loop: true };
}

// from the seated pose he rises — slowly (DESIGN VI.4: ~2 s): rise's last five poses with in-betweens, so the
// heave takes most of the two seconds instead of snapping up in two frames (frame 0 = sitfloor's frame 0)
function riseSeatedAnim() {
  const A = { h: 0.66, w: 1.12, massW: 1.15, handL: [8, 59], handR: [56, 59], b: 1 };
  const Bk = { h: 0.84, w: 1.05, massW: 1.08, handL: [9, 57], handR: [55, 57], b: 1 };
  const C = { h: 1.035, w: 0.97, massW: 1, handL: [8.4, 51.4], handR: [55.6, 49], b: 1 };   // (≈ the hands' rest)
  const keys = [[A, A, 0], [A, Bk, 0.5], [Bk, Bk, 0], [Bk, C, 0.5], [C, C, 0], [{ ...C, handL: null, handR: null }, { h: 1, w: 1, b: 0.7 }, 0.5], [{ h: 1, w: 1, massW: 1, b: 0.7 }, null, 0], [{ h: 1, w: 1, massW: 1, b: 0.4 }, null, 0]];
  return { frames: keys.map(([a, c, t]) => {
    const Q = Object.assign(basePose('down'), c ? lerpPose(Object.assign(basePose('down'), a), Object.assign(basePose('down'), a, c), t) : a);
    Q.lids = [0.62, 0.58];
    return renderPose(Q);
  }), fps: 4, loop: false };
}

function lecternAnim(scan) {
  const n = scan ? 8 : 4;
  return { frames: seq('down', n, (P, i, t) => {
    P.handL = [24, 41]; P.handR = [40, 41]; P.paper = true;
    P.b = (1 - Math.cos(t * Math.PI * 2)) / 2 * 0.7;
    if (!scan) { P.head = [0, 2]; P.faceDY = 2.5; P.lids = [0.12, 0.1]; P.pageLift = i === 3; }
    else { P.head = [0, -0.5]; P.lids = [0.64, 0.6]; P.look = [0, -0.6, -1, -1, 0, 0.6, 1, 1][i]; P.faceDY = -0.5; }
  }), fps: scan ? 3 : 2, loop: true };
}

function sinkFrames() {
  // he goes down through the floor at full width, head last, into a stain that closes after him
  // (emerge = reversed: a stain spreads, then the dome of the head, the epaulettes, the mass come up out of it)
  return seq('down', 8, (P, i) => {
    const t = i / 7;
    P.w = 1 - 0.12 * t; P.massW = 1 - 0.08 * t; P.h = 1 - 0.3 * t * t; P.b = 1;
    P.sinkY = ease(t) * 60;                              // wholly under the floor line from t ≈ 0.75
    P.head = [0, t * 3];
    P.lids = [0.45 - 0.3 * t, 0.4];
    P.spill = t > 0.4 ? 4 + 20 * (1 - t) : 0;           // 4 px as the floor closes → ~15 px while he is half under
    if (t > 0.85) P.face = 0;
  });
}

function dissolveAnim() {
  // on the stage edge: he comes apart into coal dust and wet wool; the empty uniform remains
  const frames = [];
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    let P = basePose('down');
    P.lids = [0.8, 0.7]; P.look = -0.3; P.mouth = 0.3; P.b = 0.2;
    if (t < 0.8) {
      P.crumble = t / 0.8; P.h = 1 - 0.5 * ease(t / 0.8); P.w = 1 + 0.12 * t; P.massW = 1 + 0.2 * t;
      P.handL = [8 - 2 * t, 51 + 8 * t]; P.handR = [56 + 2 * t, 50 + 9 * t];
      P.dust = Math.round(40 * Math.sin(t * Math.PI)); P.dustFall = i;
    } else { P = basePose('down'); P.coatHeap = true; P.heapT = Math.min(1, (t - 0.8) / 0.18); P.dust = i < 11 ? 10 : 0; P.dustFall = i; }
    frames.push(renderPose(P));
  }
  return { frames, fps: 5, loop: false };
}

let sheet = null;
export async function initColonel() { getColonelSprite(); }
export function getColonelSprite() {
  if (sheet) return sheet;
  const anims = {};
  for (const d of DIRS) {
    anims[`idle_${d}`] = idleAnim(d);
    anims[`drag_${d}`] = dragAnim(d);
    anims[`lunge_${d}`] = lungeAnim(d);
    anims[`reach_${d}`] = reachAnim(d);
    anims[`peek_${d}`] = peekAnim(d);
  }
  anims.mound = moundAnim();
  anims.rise = riseAnim();
  anims.sitfloor = sitFloorAnim();
  anims.rise_seated = riseSeatedAnim();
  anims.lectern_down = lecternAnim(false);
  anims.lectern_scan = lecternAnim(true);
  const sink = sinkFrames();
  anims.sink = { frames: sink, fps: 6, loop: false };
  anims.emerge = { frames: sink.slice().reverse(), fps: 6, loop: false };
  anims.dissolve = dissolveAnim();
  sheet = { fw: FW, fh: FH, ax: AX, ay: AY, anims };
  return sheet;
}
