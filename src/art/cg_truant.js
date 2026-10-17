// CG ending_truant — December, the Pennsylvania Turnpike eastbound, flat white daylight. From the
// driver's side we look across the car: the road and a green sign for PHILADELPHIA through the
// windshield; the bare winter country streaming past the passenger window; Tess, turned away to the
// glass, and her reflection in it looking back. In the deck, Leah's tape — FOR THE DRIVE — its reels
// turning. Animated: the landscape scrolls at three depths, lane dashes, guardrail posts, the reels.
import {
  W, H, PAL, mix, U, Buf, rampStops, shade, bay, h01, fbm, vnoise, clamp01, mixU,
  text35, text35Width, once, lazyGen, seeds,
} from './cg_kit.js';
import { CAST } from './cg_cast.js';

const SKY = rampStops([mix(PAL.g4, PAL.blue_l, 0.25), mix(PAL.g5, PAL.moon, 0.3), PAL.g6, mix(PAL.g6, PAL.white, 0.6), PAL.white], 10);
const RIDGE = rampStops([mix(PAL.g3, PAL.blue_d, 0.4), mix(PAL.g4, PAL.blue_l, 0.35), mix(PAL.g5, PAL.moon, 0.4), mix(PAL.g6, PAL.white, 0.4)], 8);
const FIELD = rampStops([PAL.brown_dd, mix(PAL.brown_d, PAL.g2, 0.4), mix(PAL.tan, PAL.g3, 0.5), mix(PAL.tan_l, PAL.g5, 0.5), mix(PAL.g6, PAL.white, 0.5), PAL.white], 10);
const TREE = rampStops([PAL.ink, mix(PAL.brown_dd, PAL.g1, 0.5), mix(PAL.brown_d, PAL.g3, 0.4), mix(PAL.g4, PAL.tan, 0.3)], 6);
const PINE = rampStops([PAL.green_dd, mix(PAL.green_d, PAL.slate, 0.5), mix(PAL.green, PAL.g3, 0.4)], 5);
const ROAD = rampStops([PAL.g1, PAL.g2, PAL.g3, PAL.g4, PAL.g5, mix(PAL.g6, PAL.white, 0.5)], 10);
const STEEL = rampStops([PAL.g1, PAL.g3, PAL.g4, PAL.g5, PAL.g6, PAL.white], 8);
const TRIM = rampStops([PAL.ink, mix(PAL.g1, PAL.blue_dd, 0.4), mix(PAL.g2, PAL.blue_d, 0.35), mix(PAL.g3, PAL.blue_l, 0.25), PAL.g4, PAL.g5], 10);
const CLOTH = rampStops([PAL.ink, mix(PAL.g1, PAL.navy_d, 0.4), mix(PAL.g2, PAL.navy, 0.35), mix(PAL.g3, PAL.blue_l, 0.25), PAL.g4], 8);
const SIGN = rampStops([mix(PAL.green_dd, PAL.slate, 0.3), PAL.green_d, mix(PAL.green, PAL.slate_l, 0.4), PAL.green_l], 5);

// layout
const WIN = [[180, 34], [452, 26], [468, 150], [166, 160]];          // passenger window (glass)
const WS_R = 140;                                                     // windshield's right edge (A-pillar)
const HOR = 92;                                                       // horizon through the side glass
const DECK = { x: 36, y: 132, w: 116, h: 50 };
const TAPE = { x: 58, y: 138, w: 72, h: 40 };
const REFL = { x: 312, y: 112 };                                      // Tess's reflection, face centre
const TESS = { x: 432, y: 150 };                                      // the real Tess, back of her head

function inPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const mkR = (seed) => { let i = 0; return () => h01(i++, seed, 2213); };

// ---- the scrolling world beyond the side glass: three strips, each tiles horizontally ------------
const STRIP_W = 640;
function stripRidges() {
  const b = new Buf(STRIP_W, 60);
  for (let x = 0; x < STRIP_W; x++) {
    const u = (x / STRIP_W) * Math.PI * 2;
    const top = Math.round(18 + 8 * Math.sin(u * 2 + 1) + 5 * Math.sin(u * 5) + 3 * (vnoise(Math.cos(u) * 4 + 9, Math.sin(u) * 4, 3) - 0.5) * 2);
    for (let y = top; y < 60; y++) {
      const snow = vnoise(x / 6, y / 3, 5) > 0.55 + (y - top) * 0.01;
      b.px(x, y, shade(RIDGE, clamp01((snow ? 0.75 : 0.35) - (y - top) * 0.004 + (y === top ? 0.1 : 0)), x, y));
    }
  }
  return b.toCanvas();
}
function stripFields() {
  // rolling fields, hedgerows of bare trees, a red barn, a farmhouse, snow lying in the furrows
  const b = new Buf(STRIP_W, 70);
  const r = mkR(12);
  for (let y = 0; y < 70; y++) for (let x = 0; x < STRIP_W; x++) {
    // mostly snow, corn stubble showing through in rows, a few bare brown patches
    const furrow = (y + Math.round(Math.sin(x / 50) * 3)) % 4 === 0 && h01(x, y, 5) < 0.55;
    const bare = fbm(x / 26, y / 6, 7, 3) < 0.36;
    b.px(x, y, shade(FIELD, clamp01((bare ? 0.42 : 0.8) - (furrow ? (bare ? 0.1 : 0.22) : 0) - y * 0.002), x, y));
  }
  for (let k = 0; k < 9; k++) {                                        // hedgerow tree clumps
    const cx = (k * STRIP_W) / 9 + r() * 40, base = 8 + r() * 20;
    for (let i = 0; i < 7; i++) {
      const tx = Math.round(cx + i * 4 + r() * 3), h = 10 + r() * 14;
      b.line(tx, base, tx, base - h, shade(TREE, 0.4, tx, 0));
      for (let j = 0; j < 5; j++) { const yy = base - h * (0.4 + 0.12 * j); b.line(tx, yy, tx + (j % 2 ? 4 : -4), yy - 4, shade(TREE, 0.55, tx, yy)); }
    }
  }
  for (const [px, py] of [[180, 18], [455, 14]]) {                    // a pine stand
    for (let i = 0; i < 6; i++) { const x0 = px + i * 5, h = 12 + (i * 7) % 6; for (let j = 0; j < h; j++) b.hline(x0 - Math.floor(j / 3), py - j + h, 1 + Math.floor(j / 1.5), shade(PINE, 0.4 + (j % 3 === 0 ? 0.2 : 0), x0, j)); }
  }
  // a barn (faded red) with a snowy roof, and a white farmhouse
  b.rect(300, 12, 22, 12, (x, y) => shade(rampStops([PAL.brick_d, PAL.brick, mix(PAL.brick_l, PAL.g5, 0.3)], 4), 0.45 + (x === 300 ? 0.2 : 0), x, y));
  b.poly([[298, 13], [311, 5], [324, 13]], (x, y) => shade(FIELD, 0.85, x, y));
  b.rect(330, 15, 12, 9, (x, y) => shade(FIELD, 0.78, x, y)); b.poly([[329, 16], [336, 10], [343, 16]], U(PAL.g3));
  b.rect(333, 18, 2, 3, U(PAL.g2)); b.rect(338, 18, 2, 3, U(PAL.g2));
  return b.toCanvas();
}
function stripNear() {
  // the shoulder: dirty snow bank, the steel guardrail on its posts (tiles every 40 px)
  const b = new Buf(STRIP_W, 46);
  for (let y = 0; y < 46; y++) for (let x = 0; x < STRIP_W; x++) {
    const v = y < 22 ? 0.78 - (vnoise(x / 4, y / 3, 3) > 0.6 ? 0.25 : 0) - y * 0.004 : 0.42 + (vnoise(x / 3, y / 2, 4) - 0.5) * 0.2;
    b.px(x, y, shade(y < 22 ? FIELD : ROAD, clamp01(v), x, y));
  }
  for (let x = 0; x < STRIP_W; x++) {                                  // W-beam rail
    for (let y = 8; y < 14; y++) b.px(x, y, shade(STEEL, clamp01([0.5, 0.85, 0.6, 0.35, 0.7, 0.3][y - 8]), x, y));
  }
  for (let px = 10; px < STRIP_W; px += 40) b.rect(px, 9, 3, 24, (x, y) => shade(STEEL, x === px ? 0.5 : 0.25, x, y));
  return b.toCanvas();
}

// ---- static frame: windshield view, interior, the deck, Tess -----------------------------------
function paintWindshield(b) {
  // the road ahead, converging; a green gantry sign far off: PHILADELPHIA
  const VPX = 64, VPY = 86;
  for (let y = 0; y < 128; y++) for (let x = 0; x < WS_R + 20; x++) {
    let c;
    if (y < VPY) c = shade(SKY, clamp01(0.55 + y / 220 + (fbm(x / 40, y / 12, 3, 2) - 0.5) * 0.1), x, y);
    else {
      const d = (y - VPY) / (128 - VPY);
      const half = 6 + d * 120, mid = VPX + d * 10;
      if (Math.abs(x - mid) < half) c = shade(ROAD, clamp01(0.42 + (h01(x, y, 2) - 0.5) * 0.06), x, y);
      else c = shade(FIELD, clamp01(0.7 - d * 0.2 - (vnoise(x / 5, y / 2, 8) > 0.6 ? 0.25 : 0)), x, y);
    }
    b.px(x, y, c);
  }
  for (let x = 0; x < WS_R + 20; x++) {                                // ridges on the horizon
    const top = Math.round(VPY - 4 - 3 * Math.sin(x / 17) - 2 * vnoise(x / 6, 0, 4));
    for (let y = top; y < VPY; y++) b.px(x, y, shade(RIDGE, 0.4 + (y === top ? 0.1 : 0), x, y));
  }
  // gantry + sign
  b.line(28, 70, 28, 88, U(PAL.g3)); b.line(104, 70, 104, 90, U(PAL.g3)); b.hline(28, 70, 77, U(PAL.g3));
  b.rect(38, 62, 58, 13, (x, y) => shade(SIGN, x === 38 || y === 62 ? 0.7 : 0.35, x, y));
  b.rect(39, 63, 56, 11, (x, y) => shade(SIGN, 0.3, x, y));
  b.hline(40, 64, 54, U(PAL.g6)); b.hline(40, 72, 54, U(PAL.g6));
  text35(b, 67 - Math.floor(text35Width('PHILADELPHIA') / 2), 66, 'PHILADELPHIA', U(PAL.white));
  // a truck far ahead in the right lane
  b.rect(70, 82, 6, 5, U(PAL.g4)); b.rect(70, 87, 6, 1, U(PAL.g1)); b.px(70, 86, U(PAL.red));
}

function paintInterior(b) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (inPoly(WIN, x + 0.5, y + 0.5)) continue;
    if (x < WS_R && y < 120) continue;                                  // windshield
    let c;
    // headliner along the top, A-pillar, door top rail, B-pillar at the right edge
    if (y < 30 && x >= WS_R) c = shade(CLOTH, 0.42 - y * 0.006 + (vnoise(x / 2, y / 2, 3) - 0.5) * 0.04, x, y);
    else if (x >= WS_R && x < 186 && y < 160) c = shade(TRIM, clamp01(0.3 + (x - WS_R < 3 ? 0.18 : 0) - (x > 176 ? 0.1 : 0)), x, y);
    else if (x > 456 && y < 170) c = shade(TRIM, 0.28 + (x < 459 ? 0.15 : 0), x, y);
    else if (y >= 120 && x < 200) c = shade(TRIM, clamp01(0.22 + (y < 124 ? 0.25 : 0) + (vnoise(x / 3, y / 3, 5) - 0.5) * 0.04), x, y);   // dash
    else c = shade(CLOTH, clamp01(0.36 - (y - 150) * 0.002 + (y > 196 && y < 200 ? -0.08 : 0) + (vnoise(x / 1.5, y / 1.5, 6) - 0.5) * 0.06), x, y); // door panel
    b.px(x, y, c);
  }
  // window seal (black rubber) round the glass
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = WIN[i], [bx, by] = WIN[(i + 1) % 4];
    b.line(ax, ay, bx, by, U(PAL.ink));
  }
  // the window crank and the door pull: 1986, no power anything
  b.ellipse(250, 190, 5, 5, (x, y) => shade(STEEL, y < 189 ? 0.6 : 0.35, x, y));
  b.thick(250, 190, 266, 182, 2, (x, y) => shade(STEEL, 0.5, x, y));
  b.rect(264, 178, 4, 6, (x, y) => shade(TRIM, 0.45, x, y));
  b.rect(320, 170, 40, 4, (x, y) => shade(TRIM, y === 170 ? 0.5 : 0.18, x, y));
  // dash vent + the deck in the centre stack
  b.rect(20, 124, 60, 4, (x, y) => shade(TRIM, (x % 3) ? 0.08 : 0.3, x, y));
  const { x, y, w, h } = DECK;
  b.rect(x - 2, y - 2, w + 4, h + 4, U(PAL.ink));
  b.rect(x, y, w, h, (i, j) => shade(TRIM, 0.3 + (j === y ? 0.2 : 0) + (i === x ? 0.1 : 0), i, j));
  // knobs, buttons, the station display (dark: tape mode), a red TAPE lamp
  for (const kx of [x + 10, x + w - 10]) { b.ellipse(kx, y + 24, 5, 5, U(PAL.ink)); b.ellipse(kx, y + 23, 4, 4, (i, j) => shade(STEEL, j < y + 22 ? 0.5 : 0.3, i, j)); }
  for (let i = 0; i < 5; i++) b.rect(x + 24 + i * 14, y + h - 7, 11, 4, (ii, jj) => shade(TRIM, jj === y + h - 7 ? 0.6 : 0.4, ii, jj));
  text35(b, x + w - 38, y + 3, 'TAPE', U(PAL.red_l)); b.px(x + w - 41, y + 5, U(PAL.exit_red));
  b.rect(x + 22, y + 2, 40, 2, U(PAL.ink));
}

function paintTape(b) {
  // the cassette in the deck's window: smoke shell, Leah's label, the tape between the hubs
  const { x, y, w, h } = TAPE;
  b.rect(x - 1, y - 1, w + 2, h + 2, U(PAL.ink));
  b.rect(x, y, w, h, (i, j) => shade(TRIM, 0.18 + (j === y ? 0.25 : 0) + (i === x ? 0.1 : 0), i, j));
  // label (cream paper, ruled, a red band) with the handwriting
  const lx = x + 4, ly = y + 3, lw = w - 8, lh = 24;
  b.rect(lx, ly, lw, lh, (i, j) => U(j < ly + 7 ? PAL.red_d : j % 5 === 0 && j > ly + 16 ? mix(PAL.paper, PAL.blue_l, 0.25) : PAL.paper));
  text35(b, lx + 2, ly + 1, 'TDK', U(PAL.paper)); text35(b, lx + lw - 18, ly + 1, 'SA90', U(PAL.gold));
  const msg = 'FOR THE DRIVE';
  const tx = lx + Math.floor((lw - text35Width(msg)) / 2);
  // Leah's hand: block caps, each letter a pixel off the line
  text35(b, tx, ly + 10, msg, (i, j) => U(PAL.ink));
  b.line(tx, ly + 16, tx + text35Width(msg) - 1, ly + 17, U(PAL.ink));            // underlined, a little crooked
  text35(b, lx + lw - 6, ly + 18, 'A', U(PAL.red_d));
  // the window strip with the hubs
  b.rect(x + 14, y + 29, w - 28, 8, U(PAL.ink));
  b.rect(x + 22, y + 30, w - 44, 6, U(mix(PAL.brown_d, PAL.amber_dd, 0.5)));   // tape pack showing
}
// the hubs turn (drawn per frame)
function drawHubs(ctx, t) {
  const { x, y, w } = TAPE;
  for (const [hx, sp] of [[x + 20, 1], [x + w - 21, 1]]) {
    ctx.fillStyle = '#e4dbc2';
    ctx.fillRect(hx - 3, y + 30, 7, 6);
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(hx - 1, y + 32, 3, 2);
    const a = t * 2.4 * sp;
    for (let k = 0; k < 3; k++) {
      const ang = a + (k * Math.PI * 2) / 3;
      ctx.fillRect(Math.round(hx + Math.cos(ang) * 2.4), Math.round(y + 33 + Math.sin(ang) * 2.2), 1, 1);
    }
  }
}

// Tess, real, in the corner: back of her head, copper hair, the denim collar; and her face in the glass
function paintTess(b) {
  const { x, y } = TESS;
  b.poly([[x - 40, 270], [x - 34, y + 40], [x - 10, y + 30], [x + 30, y + 30], [x + 50, y + 50], [x + 60, 270]], (i, j) => shade(CAST.denim, clamp01(0.42 - (i - x) * 0.004 + (j < y + 36 ? 0.12 : 0) + (vnoise(i / 2, j / 3, 4) - 0.5) * 0.08), i, j));
  b.poly([[x - 20, y + 36], [x - 6, y + 26], [x + 16, y + 26], [x + 26, y + 36], [x + 4, y + 40]], (i, j) => shade(CAST.denim, 0.62, i, j));    // collar
  const HR = rampStops([PAL.hair_r_dd, PAL.hair_r_d, PAL.hair_r, PAL.hair_r_l, PAL.hair_r_ll], 8);
  for (let j = y - 40; j < y + 36; j++) for (let i = x - 30; i < x + 34; i++) {
    const nx = (i - x) / 28, ny = (j - (y - 6)) / 36;
    const r = nx * nx + ny * ny * (ny < 0 ? 1 : 0.55);
    if (r > 1 + 0.1 * Math.sin(i * 1.3 + j * 0.2)) continue;
    const lane = Math.floor((i - x) / 3 + Math.sin(j / 9) * 1.5);
    let v = 0.42 + 0.3 * (ny < -0.6 ? 1 : 0) * (1 - Math.abs(nx)) - 0.2 * clamp01(nx) - (lane % 3 === 0 ? 0.14 : 0);
    if (r > 0.86 && nx < 0) v += 0.22;                                       // the window light rims her hair
    b.px(i, j, shade(HR, clamp01(v + (vnoise(i, j / 3, 9) - 0.5) * 0.08), i, j));
  }
}

// her reflection: a pale face in the glass, turned to look back toward us, eyes lowered. Built as a
// small value map (0 = nothing, up to 1 = brightest), then laid on the glass as a translucent lift.
function reflectionLayer() {
  const b = new Buf();
  const { x, y } = REFL;
  const put = (i, j, hex, a) => { if (a > 0) b.px(i, j, U(hex, Math.round(Math.min(1, a) * 255))); };
  for (let j = y - 26; j < y + 36; j++) for (let i = x - 24; i < x + 24; i++) {
    const fx = (i - x) / 11.5, fy = (j - y) / 15;
    const inFace = fx * fx + fy * fy <= 1;
    const hx = (i - x - 1) / 18, hy = (j - y + 3) / 20;
    const inHair = hx * hx + hy * hy <= 1 || (j > y - 2 && j < y + 30 && Math.abs(i - x) > 8 && Math.abs(i - x) < 18 - (j - y) * 0.15 + Math.sin(j * 0.9) * 1.5);
    if (inFace && j > y - 11) {
      // the window light falls on the side of her face nearest it
      const lit = 0.42 + 0.22 * clamp01(-fx) - 0.12 * clamp01(fy - 0.5);
      put(i, j, PAL.skin_l, lit);
    } else if (inHair) {
      const strand = ((i - x + Math.round(j * 0.3)) % 3 === 0) ? 0.1 : 0;
      put(i, j, PAL.hair_r_l, 0.3 - strand + (Math.abs(i - x) > 12 ? -0.06 : 0));
    }
  }
  // features: lowered lids, brows, the nose's shadow, a closed mouth; her collar below
  for (const ex of [x - 6, x + 3]) {
    put(ex, y - 2, PAL.ink, 0.6); put(ex + 1, y - 2, PAL.ink, 0.6); put(ex + 2, y - 2, PAL.ink, 0.35);
    put(ex, y - 5, PAL.hair_r_d, 0.6); put(ex + 1, y - 5, PAL.hair_r_d, 0.6); put(ex + 2, y - 6, PAL.hair_r_d, 0.5);
  }
  put(x, y + 1, PAL.skin_d, 0.5); put(x, y + 2, PAL.skin_d, 0.5); put(x - 1, y + 3, PAL.skin_d, 0.4);
  for (let k = -2; k <= 2; k++) put(x + k - 1, y + 7, PAL.skin_dd, 0.55);
  for (const [fx, fy] of [[x - 5, y + 2], [x - 7, y + 1], [x + 4, y + 2], [x + 6, y + 3]]) put(fx, fy, PAL.freckle, 0.35);
  for (let i = -14; i <= 14; i++) for (let j = 0; j < 6; j++) if (Math.abs(i) > 4 - j) put(x + i, y + 17 + j + Math.round(Math.abs(i) * 0.25), PAL.denim_ll, 0.22);
  return b.toCanvas();
}

const layers = lazyGen(function* () {
  const b = new Buf();
  paintWindshield(b);
  paintInterior(b); yield;
  paintTape(b);
  paintTess(b); yield;
  // the glass: a mask canvas the moving world is clipped to (drawn under the frame)
  const sky = new Buf();
  for (let y = 20; y < 165; y++) for (let x = 150; x < 470; x++) sky.px(x, y, shade(SKY, clamp01(0.35 + (y - 20) / 160 + (fbm(x / 60, y / 16, 6, 3) - 0.5) * 0.14), x, y));
  yield;
  const ridges = stripRidges(); yield;
  const fields = stripFields(); yield;
  const near = stripNear(); yield;
  return { frame: b.toCanvas(), sky: sky.toCanvas(), ridges, fields, near, refl: reflectionLayer(), dash: seeds(6, 4) };
});

export const prepTruant = layers;

function tile(ctx, img, off, y) {
  const o = ((Math.round(off) % STRIP_W) + STRIP_W) % STRIP_W;
  ctx.drawImage(img, -o + 150, y);
  ctx.drawImage(img, -o + 150 + STRIP_W, y);
}
export const endingTruant = {
  draw(ctx, t = 0) {
    const L = layers();
    // the world going by the passenger window (we drive east: scenery slides toward the back = right)
    ctx.drawImage(L.sky, 0, 0);
    tile(ctx, L.ridges, -t * 3, HOR - 32);
    tile(ctx, L.fields, -t * 24, HOR + 2);
    tile(ctx, L.near, -t * 170, HOR + 50);
    // telephone poles whipping by
    ctx.fillStyle = '#383946';
    for (let k = 0; k < 2; k++) {
      const px = 150 + (((-t * 260 + k * 360) % 720) + 720) % 720;
      if (px < 470) { ctx.fillRect(px | 0, 26, 3, 130); ctx.fillRect((px - 6) | 0, 34, 15, 2); }
    }
    // her reflection rides the glass while the world moves behind it
    ctx.drawImage(L.refl, 0, 0);
    ctx.drawImage(L.frame, 0, 0);
    // lane dashes sliding toward us through the windshield (above the dash line)
    ctx.fillStyle = '#c4bdb0';
    for (let k = 0; k < 6; k++) {
      const d = (((t * 0.9 + k / 6) % 1) + 1) % 1;
      const yy = 86 + d * d * 42, xx = 64 + d * 10 + d * 36, len = Math.min(1 + d * 7, 119 - yy);
      if (len >= 1) ctx.fillRect(xx | 0, yy | 0, Math.max(1, (d * 3) | 0), len | 0);
    }
    drawHubs(ctx, t);
  },
};
