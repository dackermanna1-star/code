// CG coda_2013 — October 19, 2013. The school's front doors at night, caught in the hard white cone
// of a smartphone flashlight: weathered oak, plywood over the panes sprayed HOLLOW HELL, a chain and a
// padlock, NO TRESPASSING; the motto half-lit above. Over her shoulder, a teenage girl — ponytail,
// hoodie — holds the phone up; its screen lights the edge of her face and shows the doors again, small,
// under a red LIVE. Animated: the handheld beam wobbles, the LIVE dot blinks, the viewer count ticks,
// dust and one moth turn in the light, her breath smokes in the cold.
import {
  W, H, PAL, mix, U, Buf, rampStops, shade, bay, h01, fbm, vnoise, clamp01, mixU,
  text35, text35Width, text57, text57Width, once, lazyGen, seeds, makeVapor,
} from './cg_kit.js';
import { makeCanvas, ctxOf } from './util.js';

const LED = U(mix(PAL.white, PAL.moon_l, 0.35));
const BRICK = rampStops([PAL.ink, mix(PAL.brick_d, PAL.night, 0.6), PAL.brick_d, mix(PAL.brick, PAL.g3, 0.2), mix(PAL.brick_l, PAL.g5, 0.3), mix(PAL.g6, PAL.moon_l, 0.4)], 12);
const STONE = rampStops([PAL.ink, PAL.night, mix(PAL.g1, PAL.blue_dd, 0.3), PAL.g3, PAL.g4, mix(PAL.g5, PAL.moon_l, 0.3), PAL.white], 12);
const OAK = rampStops([PAL.ink, PAL.brown_dd, mix(PAL.wood_d, PAL.g2, 0.3), mix(PAL.wood, PAL.g4, 0.35), mix(PAL.tan, PAL.g5, 0.4), mix(PAL.tan_l, PAL.white, 0.4)], 12);
const PLY = rampStops([PAL.ink, mix(PAL.brown_dd, PAL.g1, 0.5), mix(PAL.tan, PAL.g3, 0.5), mix(PAL.tan_l, PAL.g5, 0.4), mix(PAL.cream_l, PAL.white, 0.4)], 10);
const STEEL = rampStops([PAL.ink, PAL.g1, PAL.g3, PAL.g5, PAL.white], 8);
const LEAF = rampStops([PAL.ink, PAL.brown_dd, PAL.rust, PAL.mustard, PAL.yellow_l], 8);
const HOOD = rampStops([PAL.ink, mix(PAL.night, PAL.velvet_d, 0.4), mix(PAL.g1, PAL.velvet_d, 0.5), mix(PAL.g2, PAL.velvet, 0.35), mix(PAL.g4, PAL.moon, 0.4)], 8);
const KHAIR = rampStops([PAL.ink, PAL.hair_b, PAL.hair_b_l, mix(PAL.hair_b_l, PAL.moon_l, 0.45)], 6);
const KSKIN = rampStops([PAL.ink, PAL.skin_dd, mix(PAL.skin_d, PAL.moon, 0.3), mix(PAL.skin_l, PAL.moon_l, 0.5)], 6);
const SCREEN_GLOW = U(mix(PAL.moon_l, PAL.white, 0.3));

const BEAM = { x: 206, y: 118, r: 64 };
const DOOR = { x0: 160, x1: 252, apex: 52, spring: 64, sill: 196 };
const CX = (DOOR.x0 + DOOR.x1) / 2;
const PHONE = { x: 334, y: 100, w: 20, h: 34 };
const LEVELS = 6;

const mkR = (seed) => { let i = 0; return () => h01(i++, seed, 2013); };
const archY = (x) => {
  const half = (DOOR.x1 - DOOR.x0) / 2, u = (x + 0.5 - CX) / half;
  return DOOR.spring - Math.round((DOOR.spring - DOOR.apex) * Math.sqrt(Math.max(0, 1 - u * u)) ** 0.7);
};

/** The doorway scene at light level I (0 = night, 1 = full flashlight). */
const REACH = { x0: 96, x1: 318, y0: 20, y1: 220 };     // where the wobbling beam can ever reach
function paintScene(b, I, full = true) {
  const lift = (v) => clamp01(0.03 + v * I);
  const R = full ? { x0: 0, x1: W, y0: 0, y1: H } : REACH;
  for (let y = R.y0; y < R.y1; y++) for (let x = R.x0; x < R.x1; x++) {
    let c;
    const inSurround = x >= DOOR.x0 - 14 && x < DOOR.x1 + 14 && y >= 28 && y < DOOR.sill;
    const inOpen = x >= DOOR.x0 && x < DOOR.x1 && y >= archY(x) && y < DOOR.sill;
    if (y < 26 && y >= 8 && x > 100 && x < 320) {
      // frieze + motto (only its lower edge reaches the light)
      c = shade(STONE, lift(0.55 + (y === 8 ? 0.1 : 0) - (y === 25 ? 0.25 : 0) + (vnoise(x / 2, y / 2, 3) - 0.5) * 0.1), x, y);
    } else if (inOpen) {
      c = doorPixel(x, y, I);
    } else if (inSurround) {
      const v = 0.55 - ((y - 28) % 14 === 0 ? 0.1 : 0) + (vnoise(x / 2, y / 2, 5) - 0.5) * 0.12 - (fbm(x / 6, y / 12, 6, 2) > 0.6 ? 0.12 : 0);
      c = shade(STONE, lift(v), x, y);
    } else if (y >= DOOR.sill) {
      // the top step: worn stone, leaves blown into the corner
      const leaf = vnoise(x / 3, y / 2, 21) > 0.62 && h01(x, y, 3) < 0.7;
      c = leaf ? shade(LEAF, lift(0.3 + h01(x, y, 4) * 0.5), x, y) : shade(STONE, lift(0.42 - (y - DOOR.sill) * 0.004 + (y === DOOR.sill ? 0.2 : 0) + (vnoise(x / 4, y / 2, 22) - 0.5) * 0.1), x, y);
    } else {
      const course = y % 3, cidx = (y / 3) | 0, joint = (x + (cidx & 1) * 3) % 7 === 0;
      const v = 0.42 + (vnoise(((x + (cidx & 1) * 3) / 7) | 0, cidx, 7) - 0.5) * 0.12 - (course === 0 || joint ? 0.14 : 0) - 0.1 * fbm(x / 4, y / 20, 8, 2);
      c = shade(BRICK, lift(v), x, y);
    }
    b.px(x, y, c);
  }
  const motto = 'NEMO RELINQUATUR';
  const tx = 210 - Math.floor(text57Width(motto, 2) / 2);
  text57(b, tx + 1, 13, motto, (x, y) => shade(STONE, lift(0.85), x, y), { track: 2 });
  text57(b, tx, 12, motto, (x, y) => shade(STONE, lift(0.15), x, y), { track: 2 });
  // graffiti on the plywood: HOLLOW HELL in red, an older silver tag, KR '91 scratched in the oak
  const red = U(I > 0.5 ? PAL.red_l : I > 0.2 ? PAL.red : PAL.blood_d);
  text57(b, 168, 106, 'HOLLOW', (x, y) => (h01(x, y, 9) < 0.15 ? 0 : red), { track: 1, jitter: (k) => [0, (k % 2)] });
  text57(b, 212, 112, 'HELL', (x, y) => (h01(x, y, 10) < 0.15 ? 0 : red), { track: 2, jitter: (k) => [0, -(k % 2)] });
  for (let i = 0; i < 4; i++) b.px(184 + i * 6, 114 + (i % 2), red);                       // drips
  text35(b, 222, 158, "KR '91", (x, y) => shade(OAK, lift(0.15), x, y));
  // NO TRESPASSING sign stapled to the right leaf
  const sx = 182, sy = 168, sw = 49, sh = 15;
  const pap = U(I > 0.45 ? PAL.paper : I > 0.2 ? PAL.paper_d : mix(PAL.paper_d, PAL.night, 0.8));
  b.rect(sx, sy, sw, sh, (x, y) => (x === sx || x === sx + sw - 1 || y === sy || y === sy + sh - 1 ? shade(STONE, lift(0.25), x, y) : pap));
  b.rect(sx + 2, sy + 2, sw - 4, 6, U(I > 0.45 ? PAL.red : I > 0.2 ? PAL.red_d : PAL.blood_d));
  text35(b, sx + 20, sy + 2, 'NO', U(I > 0.3 ? PAL.white : PAL.g2));
  text35(b, sx + 3, sy + 9, 'TRESPASSING', U(I > 0.2 ? PAL.ink : PAL.night));
  b.px(sx + 1, sy + 1, shade(STEEL, lift(0.9), 0, 0)); b.px(sx + sw - 2, sy + 1, shade(STEEL, lift(0.9), 0, 0));   // staples
  // the chain looped through both pulls, and a padlock gone orange with rust
  for (let i = -16; i <= 16; i++) {
    const y = 150 + Math.round((i * i) / 30);
    b.px(CX + i, y, shade(STEEL, lift(i % 2 ? 0.75 : 0.4), 0, 0));
    if (i % 2 === 0) b.px(CX + i, y + 1, shade(STEEL, lift(0.25), 0, 0));
  }
  b.rect(CX - 3, 159, 7, 6, (x, y) => shade(rampStops([PAL.ink, PAL.rust, PAL.orange_d, PAL.tan_l], 6), lift(0.5 + (x === CX - 3 ? 0.2 : 0)), x, y));
  b.rect(CX - 2, 156, 5, 3, (x, y) => (x === CX ? 0 : shade(STEEL, lift(0.5), x, y)));
}
function doorPixel(x, y, I) {
  const lift = (v) => clamp01(0.03 + v * I);
  const leaf = x < CX ? 0 : 1, lx = x - (leaf ? CX : DOOR.x0), lw = (DOOR.x1 - DOOR.x0) / 2;
  if (x === Math.floor(CX) || x === Math.floor(CX) - 1) return shade(OAK, lift(0.05), x, y);
  // boarded panes high in each leaf
  if (y > 94 && y < 124 && lx > 6 && lx < lw - 6) {
    const grain = vnoise(x / 9, y / 1.2, 31);
    return shade(PLY, lift(0.55 + (grain - 0.5) * 0.2 - (y === 95 || y === 123 ? 0.25 : 0)), x, y);
  }
  // oak rails and stiles, paint long gone, split along the grain
  let v = 0.5 + (vnoise(x / 1.5, y / 10, 33) - 0.5) * 0.2;
  if (lx < 5 || lx > lw - 5 || (y > 88 && y < 94) || (y > 128 && y < 134) || y > DOOR.sill - 8) v += 0.08;
  if (lx === 5 || lx === lw - 5 || y === 94 || y === 128) v -= 0.25;
  if (vnoise(x / 2, y / 18, 34) > 0.7) v -= 0.18;                                    // splits
  if (y < archY(x) + 2) v -= 0.25;
  return shade(OAK, lift(v), x, y);
}

/** Kaylee: ponytail, hood down, arm up with the phone; screen-lit along the edges that face it. */
function paintKaylee(b) {
  const head = { x: 404, y: 132, rx: 22, ry: 26 };
  const shoulder = 186;
  // hoodie body + the hood bunched at the back of her neck
  b.poly([[330, 270], [340, 196], [364, 172], [398, 162], [440, 166], [470, 186], [480, 200], [480, 270]], (x, y) => {
    const edge = x < 352 + (y - 196) * -0.2 + 4 && y < 230;
    return shade(HOOD, clamp01(0.14 + (edge ? 0.3 : 0) + (vnoise(x / 3, y / 3, 3) - 0.5) * 0.06), x, y);
  });
  b.ellipse(414, 170, 34, 12, (x, y) => shade(HOOD, 0.1 + (y < 164 && x < 400 ? 0.12 : 0), x, y));       // the hood
  b.hline(392, 176, 18, shade(HOOD, 0.02, 0, 0));
  // the raised arm: elbow out, forearm up to the phone; the screen lights its upper edge
  b.thick(380, 182, 362, 156, 14, (x, y) => shade(HOOD, clamp01(0.12 + (y < 166 ? 0.12 : 0)), x, y));
  b.thick(362, 158, 348, 132, 11, (x, y) => shade(HOOD, clamp01(0.14 + (x < 352 + (y - 132) * 0.5 ? 0.32 : 0)), x, y));
  b.thick(349, 136, 345, 126, 7, (x, y) => shade(KSKIN, clamp01(0.35 + (x < 347 ? 0.35 : 0)), x, y));  // wrist
  // head from behind-left: hair pulled back into a ponytail; the cheek and an ear lit by the screen
  b.ellipse(head.x, head.y, head.rx, head.ry, (x, y) => {
    const nx = (x - head.x) / head.rx, ny = (y - head.y) / head.ry;
    const strand = ((x - head.x) * 0.6 + (y - head.y) * 0.3 + 40) % 4 < 1 ? -0.06 : 0;
    const rim = nx < -0.72 ? 0.42 : 0;
    return shade(KHAIR, clamp01(0.16 + rim + strand - 0.1 * clamp01(ny)), x, y);
  });
  b.ellipse(head.x - 18, head.y + 8, 4, 8, (x, y) => shade(KSKIN, x < head.x - 19 ? 0.85 : 0.55, x, y));    // cheek's edge
  b.ellipse(head.x - 15, head.y + 2, 3, 4, (x, y) => shade(KSKIN, 0.45, x, y));                              // ear
  b.px(head.x - 15, head.y + 7, U(PAL.white));                                                              // an earring catching it
  b.ellipse(head.x + 6, head.y - 6, 7, 5, (x, y) => shade(KHAIR, 0.22, x, y));                              // the elastic + knot
  b.poly([[head.x + 6, head.y - 8], [head.x + 22, head.y + 4], [head.x + 26, head.y + 30], [head.x + 18, head.y + 44], [head.x + 14, head.y + 26], [head.x + 6, head.y + 4]],
    (x, y) => shade(KHAIR, clamp01(0.18 + (((x + y) % 5) === 0 ? 0.1 : 0)), x, y));                         // ponytail
  b.hline(head.x + 2, head.y - 8, 8, shade(HOOD, 0.4, 0, 0));
  // the hand round the phone
  b.ellipse(348, 128, 6, 8, (x, y) => shade(KSKIN, clamp01(0.42 + (x < 346 ? 0.3 : 0)), x, y));
}

function paintPhone(b, scene) {
  const { x, y, w, h } = PHONE;
  // case + bezel, the screen showing the doors again, small (a live preview)
  b.rect(x - 2, y - 2, w + 4, h + 4, U(mix(PAL.velvet, PAL.g2, 0.5)));
  b.rect(x - 1, y - 1, w + 2, h + 2, U(PAL.ink));
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const sx = 150 + Math.floor((i / w) * 112), sy = 30 + Math.floor((j / h) * 180);
    b.px(x + i, y + j, mixU(scene.get(sx, sy), U(PAL.moon_l), 0.12));
  }
  b.rect(x, y, w, 4, U(mix(PAL.ink, PAL.g1, 0.5)));                                       // status bar
  b.px(x + w - 3, y + 1, U(PAL.white)); b.px(x + w - 2, y + 1, U(PAL.white));
  b.rect(x + 1, y + h - 5, w - 2, 4, U(mix(PAL.ink, PAL.g1, 0.5)));                       // controls
  b.px(x + w / 2, y + h - 3, U(PAL.white));
  // her thumb over the corner
  b.rect(x + w - 4, y + h - 10, 5, 7, (i, j) => shade(KSKIN, 0.6 + (i === x + w - 4 ? 0.2 : 0), i, j));
}

const layers = lazyGen(function* () {
  // the doorway at LEVELS light levels; the beam picks between them per pixel per frame
  const lv = [];
  for (let k = 0; k < LEVELS; k++) { const b = new Buf(); paintScene(b, k === 0 ? 0.035 : 0.1 + 0.9 * (k / (LEVELS - 1)) ** 1.2, k === 0 || k === LEVELS - 1); lv.push(b.d); yield; }
  const lit = new Buf(); lit.d.set(lv[LEVELS - 1]);
  const fg = new Buf();
  paintKaylee(fg);
  paintPhone(fg, lit);
  const frame = new Buf();
  frame.d.set(lv[0]);
  const cnv = makeCanvas(W, H);
  // LED falloff by radius (r in 1/64ths of the beam radius): hot core, hard-ish edge, faint spill ring
  const kw = Math.ceil(BEAM.r * 1.35 * 1.15) * 2 + 2, kh = Math.ceil(BEAM.r * 1.35) * 2 + 2;
  const km = new Uint8Array(kw * kh);
  for (let j = 0; j < kh; j++) for (let i = 0; i < kw; i++) {
    const r = Math.hypot((i - kw / 2) / 1.15, j - kh / 2) / BEAM.r;
    const I = r < 0.3 ? 1 : r < 1 ? 1 - 0.6 * ((r - 0.3) / 0.7) ** 1.6 : r < 1.35 ? 0.28 * (1 - (r - 1) / 0.35) : 0;
    km[j * kw + i] = I > 0 ? Math.min(LEVELS - 1, (I * (LEVELS - 1) + bay(i, j)) | 0) : 0;
  }
  return { lv, km, kw, kh, prev: [0, 0, 0, 0], primed: false, fg: fg.toCanvas(), frame, cnv, cx: ctxOf(cnv), motes: seeds(18, 3), breath: makeVapor(300, 80, 120, 80, [mix(PAL.g2, PAL.blue_d, 0.4), mix(PAL.g3, PAL.moon, 0.3)]) };
});

export const prepCoda = layers;

export const coda2013 = {
  draw(ctx, t = 0) {
    const L = layers();
    // handheld: the beam drifts a little and breathes
    const bx = BEAM.x + Math.sin(t * 1.3) * 2.5 + Math.sin(t * 3.1) * 0.8, by = BEAM.y + Math.sin(t * 0.9 + 1) * 1.8;
    const d = L.frame.d, dark = L.lv[0], km = L.km, KW = L.kw, KH = L.kh;
    const ox = Math.round(bx) - (KW >> 1), oy = Math.round(by) - (KH >> 1);
    const x0 = Math.max(0, ox), x1 = Math.min(W, ox + KW), y0 = Math.max(0, oy), y1 = Math.min(H, oy + KH);
    // restore last frame's lit rect to the dark scene, then stamp this frame's cone (a precomputed,
    // pre-dithered level map — the dither travels with the beam, as a real cone's would)
    const P = L.prev;
    for (let y = P[1]; y < P[3]; y++) d.set(dark.subarray(y * W + P[0], y * W + P[2]), y * W + P[0]);
    for (let y = y0; y < y1; y++) {
      const row = y * W, krow = (y - oy) * KW - ox;
      for (let x = x0; x < x1; x++) { const k = km[krow + x]; if (k) d[row + x] = L.lv[k][row + x]; }
    }
    const ux0 = Math.min(x0, P[0]), uy0 = Math.min(y0, P[1]), ux1 = Math.max(x1, P[2]), uy1 = Math.max(y1, P[3]);
    if (!L.primed) { L.cx.putImageData(L.frame.img, 0, 0); L.primed = true; }
    else if (ux1 > ux0 && uy1 > uy0) L.cx.putImageData(L.frame.img, 0, 0, ux0, uy0, ux1 - ux0, uy1 - uy0);
    L.prev = [x0, y0, x1, y1];
    ctx.drawImage(L.cnv, 0, 0);
    // dust and a moth turning in the light
    const m = L.motes;
    for (let i = 0; i < 18; i++) {
      const a = t * (0.3 + m[i * 4] * 0.5) + m[i * 4 + 1] * 6.28;
      const x = bx + Math.cos(a) * (20 + m[i * 4 + 2] * 60), y = by + Math.sin(a * 0.8) * (16 + m[i * 4 + 3] * 40) - 10;
      ctx.fillStyle = i === 0 ? 'rgba(240,236,226,0.95)' : 'rgba(220,226,236,0.55)';
      ctx.fillRect(x | 0, y | 0, i === 0 && Math.sin(t * 22) > 0 ? 2 : 1, 1);
    }
    // breath, now and then
    const br = L.breath;
    br.clear();
    const ph = (t % 3.4) / 3.4;
    if (ph < 0.6) br.splat(378 - ph * 34, 144 - ph * 22, 4 + ph * 16, 0.5 * Math.sin(Math.PI * ph / 0.6));
    br.render(ctx);
    ctx.drawImage(L.fg, 0, 0);
    // the screen glow lights the edge of her hand and face (cheap: a few pixels pulsing with exposure)
    const { x, y, w } = PHONE;
    // LIVE badge + blinking dot + viewer count
    ctx.fillStyle = '#c8423b'; ctx.fillRect(x + 1, y + 5, 11, 5);
    ctx.fillStyle = '#f0ece2';
    const L5 = [[0, 0], [0, 1], [0, 2], [1, 2], [3, 0], [3, 1], [3, 2], [5, 0], [5, 1], [6, 2], [7, 0], [7, 1], [9, 0], [9, 1], [9, 2], [10, 0], [10, 2]];
    for (const [i, j] of L5) ctx.fillRect(x + 1 + (i >> 0) * 1, y + 6 + j, 1, 1);
    if ((t % 1) < 0.6) { ctx.fillStyle = '#ff3b2e'; ctx.fillRect(x + w - 4, y + 6, 2, 2); }
    const viewers = 2 + Math.floor(t / 2.7) % 6;
    ctx.fillStyle = '#f0ece2';
    const digit = { 2: '110001010100111', 3: '110001010001110', 4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010' }[viewers];
    for (let k = 0; k < 15; k++) if (digit[k] === '1') ctx.fillRect(x + 2 + (k % 3), y + 12 + Math.floor(k / 3), 1, 1);
  },
};
