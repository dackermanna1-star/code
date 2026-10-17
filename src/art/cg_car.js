// CG car_interior — the prologue. Inside Leah's mom's '86 Taurus wagon, parked across the lot from the
// school at 9:47 PM. Tess's point of view from the middle of the back seat: Leah (driver, dark bob) and
// Danny (backwards red cap) silhouetted against the windshield; the dark school framed between their
// heads with one faint lit window; steam rising in the lot; rain beading on the glass while the
// intermittent wipers sweep it clear (animated); dashboard glow — teal gauges and the clock at 9:47.
// Leah's eyes find Tess in the rear-view mirror.
import {
  W, PAL, mix, U, Buf, rampStops, shade, bay, h01, fbm, vnoise, clamp01, mixU, makeVapor, makePlumes, once,
  seeds,
} from './cg_kit.js';
import { CAST } from './cg_cast.js';

// ---- ramps ----------------------------------------------------------------------------------
const SKY = rampStops([PAL.night, PAL.blue_dd, PAL.blue_d, mix(PAL.blue_d, PAL.blue, 0.5), PAL.blue_l, PAL.moon], 10);
const SCHOOL = rampStops([PAL.ink, mix(PAL.night, PAL.brick_d, 0.35), mix(PAL.brick_d, PAL.blue_dd, 0.55), mix(PAL.brick_d, PAL.g2, 0.4), mix(PAL.g3, PAL.blue_d, 0.4)], 7);
const LOT = rampStops([PAL.ink, PAL.night, PAL.shadow, mix(PAL.g2, PAL.blue_d, 0.4), mix(PAL.g4, PAL.moon, 0.4)], 8);
const TREE = rampStops([PAL.ink, PAL.night, mix(PAL.g1, PAL.blue_dd, 0.5)], 3);
const PLASTIC = rampStops([PAL.ink, mix(PAL.navy_dd, PAL.night, 0.5), mix(PAL.g1, PAL.navy_d, 0.4), mix(PAL.g2, PAL.blue_d, 0.4), mix(PAL.g3, PAL.blue_l, 0.25), PAL.g4], 9);
const FABRIC = rampStops([PAL.ink, mix(PAL.g1, PAL.blue_dd, 0.6), mix(PAL.g2, PAL.blue_d, 0.5), mix(PAL.g3, PAL.blue_d, 0.4), mix(PAL.g4, PAL.blue_l, 0.3), PAL.g5], 9);
const LINER = rampStops([PAL.ink, PAL.night, mix(PAL.g1, PAL.brown_dd, 0.3), mix(PAL.g2, PAL.brown_d, 0.2), PAL.g3], 7);
const TEAL = rampStops([PAL.green_dd, mix(PAL.green_d, PAL.blue_d, 0.4), mix(PAL.green_l, PAL.crt, 0.3), PAL.crt, mix(PAL.fluor, PAL.white, 0.3)], 7);
const VFD = rampStops([mix(PAL.slate, PAL.blue_dd, 0.5), mix(PAL.green_d, PAL.blue_d, 0.5), mix(PAL.crt, PAL.moon, 0.35), mix(PAL.fluor, PAL.white, 0.35)], 6);
const AMBERD = rampStops([PAL.ink, PAL.amber_dd, PAL.amber_d, PAL.amber], 5);
const LITWIN = U(mix(PAL.mustard, PAL.fluor_d, 0.45)), LITWIN2 = U(mix(PAL.mustard_d, PAL.green_d, 0.5));
const TEAL_RIM = U(mix(PAL.green_d, PAL.crt, 0.35)), BLUE_RIM = U(mix(PAL.blue_d, PAL.blue_l, 0.55));
// a backlit red: near-black maroon body, the red only where the glass rims it
const CAP_BL = rampStops([PAL.ink, mix(PAL.blood_d, PAL.night, 0.5), PAL.blood_d, mix(PAL.blood_d, PAL.red_d, 0.6), PAL.red, mix(PAL.red_l, PAL.moon, 0.25)], 8);
const FACE_DK = rampStops([PAL.ink, mix(PAL.skin_dd, PAL.night, 0.55), PAL.skin_dd, mix(PAL.skin_dd, PAL.skin_d, 0.5)], 6);

// ---- layout -------------------------------------------------------------------------------------
const WS = [[60, 31], [150, 25], [240, 23], [330, 25], [420, 31], [472, 127], [8, 127]];
const GROUND = 113;
const PV = { x0: 212, x1: 264 }, PCX = 238;
const LITWIN_AT = [284, 85];
const LEAH = { cx: 148, cy: 92, rx: 22, ry: 26 };
const DANNY = { ox: 290, oy: 50, w: 92, h: 70 };          // Danny's head sprite box (drawn per frame)
const PIV = [[176, 137], [316, 137]], R0 = 22, R1 = 116, SWEEP = 2.7;   // wipers (radians of sweep)
const CYCLE = 3.6, UP = 0.5;
const CLOCK = { x: 226, y: 134 };

function inPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const mkR = (seed) => { let i = 0; return () => h01(i++, seed, 313); };

// ---- outside, through the glass ---------------------------------------------------------------
function paintOutside(b) {
  for (let y = 0; y < GROUND; y++) for (let x = 0; x < W; x++) {
    const c = fbm(x / 60 + y / 200, y / 16, 7, 4);
    const moon = Math.exp(-Math.hypot((x + 40) / 1.6, y + 10) / 90);
    const v = 0.2 + 0.14 * (y / GROUND) + 0.5 * moon * (0.5 + 0.7 * c) + (c - 0.5) * 0.18 + 0.1 * Math.exp(-(GROUND - y) / 10)
      - 0.12 * clamp01((31 - y + Math.abs(x - 240) * 0.03) / 8);                       // the tinted band along the top of the glass
    b.px(x, y, shade(SKY, clamp01(v), x, y));
  }
  // culm banks on the horizon
  for (let x = 0; x < W; x++) {
    const top = Math.round(Math.min(97 + 0.1 * Math.abs(x - 60), 102 + 0.16 * Math.abs(x - 440)) + 2 * vnoise(x / 8, 0, 3));
    for (let y = top; y < GROUND; y++) b.px(x, y, shade(SCHOOL, 0.16 + (y === top ? 0.08 : 0), x, y));
  }
  // the school: wings, pavilion with crenellations and pinnacles
  const lit = (x, y) => 0.18 + 0.08 * (1 - (y - 55) / 60) + (vnoise(x / 2, y / 3, 11) - 0.5) * 0.06;
  const wings = [[104, PV.x0, 77], [PV.x1, 376, 77]];
  for (const [x0, x1, top] of wings) for (let y = top; y < GROUND; y++) for (let x = x0; x < x1; x++) b.px(x, y, shade(SCHOOL, clamp01(lit(x, y)), x, y));
  for (let y = 59; y < GROUND; y++) for (let x = PV.x0; x < PV.x1; x++) b.px(x, y, shade(SCHOOL, clamp01(lit(x, y) + 0.04), x, y));
  for (let mx = PV.x0 + 3; mx < PV.x1 - 4; mx += 7) b.rect(mx, 56, 4, 3, (x, y) => shade(SCHOOL, 0.32, x, y));
  for (const px of [PV.x0, PV.x1 - 4]) { b.rect(px, 50, 4, 63, (x, y) => shade(SCHOOL, x === px ? 0.45 : 0.3, x, y)); b.px(px + 1, 48, shade(SCHOOL, 0.4, 0, 0)); b.px(px + 1, 49, shade(SCHOOL, 0.4, 0, 0)); }
  // cornices catch the sky
  for (const [x0, x1, top] of wings) b.hline(x0, top, x1 - x0, U(mix(PAL.g3, PAL.blue_d, 0.3)));
  b.hline(PV.x0, 59, PV.x1 - PV.x0, U(mix(PAL.g3, PAL.blue_d, 0.2)));
  // windows: dark panes in groups; the great window; the motto band; the doors
  const glass = (x, y) => shade(SKY, 0.08 + (y % 7 < 2 ? 0.08 : 0), x, y);
  for (let gx = 112; gx < 372; gx += 22) {
    if (gx > PV.x0 - 14 && gx < PV.x1 + 2) continue;
    for (const wy of [83, 97]) for (let k = 0; k < 3; k++) b.rect(gx + k * 4, wy, 3, 8, glass);
  }
  b.rect(PCX - 8, 66, 16, 18, glass); b.vline(PCX, 66, 18, shade(SCHOOL, 0.3, 0, 0));
  b.hline(PCX - 9, 65, 18, shade(SCHOOL, 0.32, 0, 0));
  b.rect(PV.x0 + 6, 87, PV.x1 - PV.x0 - 12, 3, (x, y) => shade(SCHOOL, 0.44 + (h01(x, y, 2) < 0.3 ? -0.1 : 0), x, y));
  b.rect(PCX - 6, 95, 12, 18, U(PAL.ink)); b.rect(PCX - 8, 93, 16, 2, shade(SCHOOL, 0.36, 0, 0));
  // the one lit window, smeared a little by the wet glass
  const [lx, ly] = LITWIN_AT;
  b.rect(lx, ly, 2, 7, LITWIN); b.px(lx, ly + 2, LITWIN2); b.px(lx + 1, ly, LITWIN2);
  for (let y = ly - 3; y < ly + 12; y++) for (let x = lx - 3; x < lx + 6; x++) {
    if (x >= lx && x < lx + 3 && y >= ly && y < ly + 8) continue;
    const d = Math.hypot((x - lx - 1) * 1.4, y - ly - 4);
    if (0.6 * clamp01(1 - d / 6) > bay(x, y)) b.px(x, y, mixU(b.get(x, y), LITWIN, 0.35));
  }
  // the lot: wet black with the window and the sky in it
  for (let y = GROUND; y < 130; y++) for (let x = 0; x < W; x++) {
    let v = 0.12 + 0.12 * Math.exp(-(y - GROUND) / 4) + (fbm(x / 30, y / 4, 9, 2) - 0.5) * 0.1;
    v += 0.15 * Math.exp(-Math.abs(x - 40 - (y - GROUND) * 1.5) / 30);
    b.px(x, y, shade(LOT, clamp01(v), x, y));
  }
  for (let y = GROUND + 1; y < 128; y++) if (h01(lx, y, 4) < 0.6) b.px(lx + 1, y, mixU(b.get(lx + 1, y), LITWIN, 0.5 - (y - GROUND) * 0.03));
  // the dead oak at the left edge of the lot
  const r = mkR(9);
  const limb = (x, y, a, len, w, d) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    b.thick(x, y, x2, y2, Math.max(1, w), (i, j) => shade(TREE, w > 2 ? 0.35 : 0.5, i, j));
    if (d > 5 || w < 0.7) return;
    for (let k = 0; k < 2 + (r() < 0.3 ? 1 : 0); k++) limb(x2, y2, a + (k - 0.5) * (0.6 + r() * 0.4) + (r() - 0.5) * 0.3, len * 0.72, w * 0.62, d + 1);
  };
  b.thick(70, GROUND + 2, 72, 74, 5, (i, j) => shade(TREE, 0.3, i, j));
  limb(72, 74, -2.1, 22, 3.5, 0); limb(72, 74, -1.3, 26, 3.5, 0); limb(72, 74, -0.6, 20, 2.5, 1);
  // a ghost of the dash glow reflected low in the windshield
  for (let y = 98; y < 126; y++) for (let x = 84; x < 200; x++) {
    const d = Math.hypot((x - 140) / 3, (y - 118));
    const a = 0.3 * clamp01(1 - d / 14);
    if (a > bay(x, y)) b.px(x, y, mixU(b.get(x, y), TEAL_RIM, 0.35));
  }
}

// ---- the car's interior (opaque frame around the glass) ------------------------------------------
function paintBack(b) {
  // headliner, darkening away from the glass; the dome light
  for (let y = 0; y < 60; y++) for (let x = 0; x < W; x++) {
    if (inPoly(WS, x + 0.5, y + 0.5)) continue;
    const edge = Math.max(0, 1 - Math.abs(y - (23 + Math.abs(x - 240) * 0.03)) / 10);
    const v = 0.06 + 0.14 * edge * (1 - Math.abs(x - 240) / 300) + (vnoise(x / 1.5, y / 1.5, 5) - 0.5) * 0.05;
    b.px(x, y, shade(LINER, clamp01(v), x, y));
  }
  b.ellipse(240, 9, 16, 4, (x, y) => shade(LINER, 0.25 + (y < 9 ? 0.06 : 0), x, y));
  b.hline(226, 12, 28, shade(LINER, 0.1, 0, 0));
  // A-pillars with door seals
  const pillar = (pts, lightSide) => b.poly(pts, (x, y) => shade(PLASTIC, clamp01(0.05 + (lightSide(x, y) ? 0.14 : 0) + (vnoise(x, y / 4, 6) - 0.5) * 0.04), x, y));
  pillar([[44, 28], [62, 30], [14, 128], [0, 128], [0, 100]], (x, y) => x > 60 - (y - 30) * 0.48 - 2);
  pillar([[418, 30], [436, 28], [480, 100], [480, 128], [466, 128]], (x, y) => x < 420 + (y - 30) * 0.48 + 2);
  // the side windows beyond (black, with a sliver of streaked rain)
  b.poly([[0, 34], [40, 29], [0, 96]], (x, y) => shade(SKY, 0.1 + (((x * 3 + y) % 11) === 0 ? 0.12 : 0), x, y));
  b.poly([[480, 34], [440, 29], [480, 96]], (x, y) => shade(SKY, 0.08 + (((x * 3 - y) % 13) === 0 ? 0.1 : 0), x, y));
  // sun visors (Leah's has the keys tucked in it)
  for (const [x0, x1, keys] of [[74, 196, true], [284, 406, false]]) {
    b.poly([[x0, 22], [x1, 22], [x1 - 4, 33], [x0 + 4, 33]], (x, y) => shade(LINER, 0.14 + (y > 31 ? 0.08 : 0) + (vnoise(x / 2, y, 8) - 0.5) * 0.05, x, y));
    if (keys) { b.hline(176, 34, 3, U(PAL.g4)); b.px(179, 35, U(PAL.g5)); b.px(177, 35, U(PAL.brass)); b.px(178, 36, U(PAL.gold)); }
  }
  // rear-view mirror: Leah's eyes, behind round wire glasses, find Tess
  b.vline(239, 14, 15, U(PAL.ink)); b.vline(240, 14, 15, shade(PLASTIC, 0.2, 0, 0));
  b.rect(210, 28, 60, 14, (x, y) => shade(PLASTIC, 0.12 + (y === 28 ? 0.2 : 0), x, y));
  paintMirror(b);
  // dashboard: top surface catching the glass, the face beneath it
  b.poly([[0, 127], [480, 127], [480, 150], [0, 150]], (x, y) => {
    const v = y < 131 ? 0.26 - (y - 127) * 0.05 : 0.05 + (y < 134 ? 0.04 : 0);
    return shade(PLASTIC, clamp01(v + (vnoise(x / 3, y, 2) - 0.5) * 0.04), x, y);
  });
  for (let x = 110; x < 380; x += 3) b.px(x, 128, shade(PLASTIC, 0.08, x, 128));          // defroster grille
  // instrument hood + gauges glowing teal
  b.poly([[74, 140], [80, 120], [96, 115], [180, 115], [196, 120], [202, 140]], (x, y) => shade(PLASTIC, y < 118 ? 0.3 : 0.12, x, y));
  // the cluster: dark faces, glowing teal dials where they peek past Leah's headrest
  b.rect(86, 121, 106, 18, (x, y) => {
    const d = Math.min(Math.hypot(x - 99, (y - 131) * 1.1), Math.hypot(x - 190, (y - 129) * 1.1));
    return shade(TEAL, clamp01(0.12 - d * 0.008 + (vnoise(x / 2, y / 2, 4) - 0.5) * 0.04), x, y);
  });
  for (const [gx, gy, gr] of [[99, 132, 8], [190, 130, 6]]) {
    for (let a = Math.PI * 0.95; a < Math.PI * 2.05; a += 0.1) {
      const tick = Math.round(a * 10) % 3 === 0;
      b.px(gx + Math.cos(a) * gr, gy + Math.sin(a) * gr * 0.9, shade(TEAL, tick ? 0.95 : 0.6, 0, 0));
      if (tick) b.px(gx + Math.cos(a) * (gr - 1.5), gy + Math.sin(a) * (gr - 1.5) * 0.9, shade(TEAL, 0.5, 0, 0));
    }
    b.line(gx, gy, gx - gr + 2, gy - 2, U(PAL.orange_l));                                      // needles at rest
    b.px(gx, gy, shade(TEAL, 0.3, 0, 0));
  }
  b.px(88, 124, U(PAL.red_l)); b.px(90, 124, U(PAL.green_l));                                   // idiot lights
  // steering wheel rim (most of it hidden behind Leah's seat)
  for (let a = Math.PI * 1.05; a < Math.PI * 1.98; a += 0.008) {
    const x = 134 + Math.cos(a) * 60, y = 178 + Math.sin(a) * 50;
    for (let k = 0; k < 5; k++) b.px(x, y + k, shade(PLASTIC, k === 0 ? 0.42 : k < 2 ? 0.3 : 0.12, x, y));
  }
  // centre stack: clock pod, radio, climate
  b.rect(206, 131, 68, 70, (x, y) => shade(PLASTIC, 0.07 + (x === 206 ? 0.1 : 0) + (y === 131 ? 0.12 : 0), x, y));
  b.rect(222, 133, 36, 12, (x, y) => shade(VFD, 0.02, x, y));
  b.rect(212, 149, 56, 22, (x, y) => shade(PLASTIC, 0.2 + (y === 149 ? 0.12 : 0) - (y === 170 ? 0.1 : 0), x, y));
  b.rect(230, 153, 20, 4, (x, y) => shade(AMBERD, 0.2, x, y));                               // radio display, off
  b.rect(228, 160, 24, 3, U(PAL.ink)); b.hline(228, 159, 24, shade(PLASTIC, 0.35, 0, 0));  // cassette door
  for (const kx of [218, 262]) { b.ellipse(kx, 158, 3, 3, (x, y) => shade(PLASTIC, y < 157 ? 0.45 : 0.22, x, y)); }
  for (let i = 0; i < 5; i++) b.rect(226 + i * 6, 165, 4, 3, (x, y) => shade(PLASTIC, y === 165 ? 0.4 : 0.26, x, y));
  b.rect(212, 176, 56, 14, (x, y) => shade(PLASTIC, 0.16, x, y));
  for (let i = 0; i < 3; i++) { b.rect(218 + i * 18, 180, 8, 2, shade(PLASTIC, 0.06, 0, 0)); b.rect(220 + i * 18 + (i * 3) % 5, 179, 2, 4, shade(PLASTIC, 0.42, 0, 0)); }
  // the clock reads 9:47 (VFD cyan-green, with a halo on the dark plastic)
  sevenSeg(b, CLOCK.x, CLOCK.y + 2, '9', U(mix(PAL.crt, PAL.white, 0.25)));
  sevenSeg(b, CLOCK.x + 12, CLOCK.y + 2, '4', U(mix(PAL.crt, PAL.white, 0.25)));
  sevenSeg(b, CLOCK.x + 20, CLOCK.y + 2, '7', U(mix(PAL.crt, PAL.white, 0.25)));
  for (let y = CLOCK.y - 4; y < CLOCK.y + 16; y++) for (let x = CLOCK.x - 6; x < CLOCK.x + 34; x++) {
    const o = b.get(x, y);
    if (!o || o === U(mix(PAL.crt, PAL.white, 0.25))) continue;
    const d = Math.hypot((x - (CLOCK.x + 14)) / 2.2, y - (CLOCK.y + 6));
    if (0.5 * clamp01(1 - d / 9) > bay(x, y)) b.px(x, y, mixU(o, U(PAL.crt), 0.18));
  }
  // Leah from behind: the dark bob, backlit by the glass, rimmed teal by the gauges
  paintLeah(b);
}

function paintMirror(b) {
  // the mirror glass shows a strip of the driver's face: bangs, pale skin, two round lenses
  const x0 = 213, y0 = 30, w = 54, h = 10;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    let c;
    const fx = x - x0, fy = y - y0;
    const face = fx > 10 && fx < 44;
    if (!face) c = shade(LINER, 0.06 + (fy < 2 ? 0.05 : 0), x, y);                                    // the dark car behind her
    else if (fy < 3 - (Math.abs(fx - 27) < 10 ? 1 : 0)) c = shade(CAST.leahHair, 0.1 + (fx % 3 === 0 ? 0.08 : 0), x, y); // bangs
    else c = shade(FACE_DK, 0.2 + 0.25 * (1 - Math.abs(fx - 27) / 18) - (fy > 7 ? 0.12 : 0) + (fx > 27 ? 0.08 : 0), x, y);
    if (face && (fx === 11 || fx === 43)) c = shade(CAST.leahHair, 0.1, x, y);
    b.px(x, y, c);
  }
  // round wire glasses with the dash glow in them; eyes looking right at us
  for (const ex of [x0 + 20, x0 + 34]) {
    for (let a = 0; a < Math.PI * 2; a += 0.3) b.px(ex + Math.round(Math.cos(a) * 3.4), y0 + 5 + Math.round(Math.sin(a) * 2.6), U(a > 3.6 && a < 5.6 ? PAL.g3 : PAL.g1));
    b.rect(ex - 1, y0 + 4, 3, 2, U(PAL.ink)); b.px(ex, y0 + 4, U(mix(PAL.green_d, PAL.g2, 0.4)));
    b.px(ex + 2, y0 + 3, U(mix(PAL.crt, PAL.white, 0.2)));                                        // the gauges, glinting in her lenses
  }
  b.hline(x0 + 24, y0 + 4, 6, U(PAL.g2));                                                          // bridge
  b.hline(x0, y0 + h, w, U(PAL.ink));
}

/** 5×9 seven-segment digit. */
function sevenSeg(b, x, y, ch, c) {
  const S = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' }[ch] || '';
  if (S.includes('a')) b.hline(x + 1, y, 3, c);
  if (S.includes('b')) b.vline(x + 4, y + 1, 3, c);
  if (S.includes('c')) b.vline(x + 4, y + 5, 3, c);
  if (S.includes('d')) b.hline(x + 1, y + 8, 3, c);
  if (S.includes('e')) b.vline(x, y + 5, 3, c);
  if (S.includes('f')) b.vline(x, y + 1, 3, c);
  if (S.includes('g')) b.hline(x + 1, y + 4, 3, c);
}

function paintLeah(b) {
  const { cx, cy, rx, ry } = LEAH;
  // bob: a dome that drops straight to a blunt cut at the jaw, a little wider at the cut
  const inBob = (x, y) => {
    if (y < cy - ry || y > cy + 20) return false;
    const yy = Math.min(y, cy) - cy;
    const half = y <= cy ? rx * Math.sqrt(Math.max(0, 1 - (yy * yy) / (ry * ry))) : rx + (y - cy) * 0.12;
    return Math.abs(x + 0.5 - cx) <= half;
  };
  for (let y = cy - ry; y <= cy + 20; y++) for (let x = cx - rx - 4; x <= cx + rx + 4; x++) {
    if (!inBob(x, y)) continue;
    const nx = (x + 0.5 - cx) / rx, ny = (y - cy) / ry;
    const edge = !inBob(x - 2, y) || !inBob(x + 2, y) || !inBob(x, y - 2);
    const strand = vnoise(x * 0.8 + nx * 4, y * 0.15 - Math.abs(nx) * 2, 21);
    let v = 0.08 + (strand - 0.5) * 0.14 + (ny < -0.5 ? 0.06 * (1 - Math.abs(nx)) : 0);
    if (edge && y < cy) v += 0.4 * (0.6 + 0.4 * (1 - ny));                     // the glass behind her rims her hair blue
    let c = shade(CAST.leahHair, clamp01(v), x, y);
    if (edge && y >= cy - 6 && nx > 0.5) c = mixU(c, TEAL_RIM, 0.5);                // the gauges rim her right side teal
    if (edge && y < cy - 4) c = mixU(c, BLUE_RIM, 0.35);
    b.px(x, y, c);
  }
  // the temple arm of her glasses, glinting where it leaves the hair
  b.hline(cx + rx - 1, cy - 1, 3, U(PAL.g5)); b.px(cx + rx + 2, cy - 1, U(mix(PAL.crt, PAL.white, 0.3)));
  b.hline(cx - rx - 2, cy - 1, 2, U(PAL.g3));
  // the gray cardigan collar where the bob ends
  b.poly([[cx - 18, cy + 21], [cx + 18, cy + 21], [cx + 26, cy + 30], [cx - 26, cy + 30]], (x, y) => shade(CAST.cardigan, 0.12 + (x > cx + 14 ? 0.2 : 0), x, y));
}

/** Danny, from behind: backwards red cap (front panel + brim toward us), Eagles collar. Own sprite. */
function buildDanny() {
  const b = new Buf(DANNY.w, DANNY.h);
  const cx = 44, cy = 36;
  // neck + ears in shadow, short brown hair at the nape
  b.ellipse(cx, cy + 20, 15, 12, (x, y) => shade(CAST.skin, 0.02 + (x > cx + 11 ? 0.08 : 0), x, y));
  for (const ex of [cx - 22, cx + 21]) b.ellipse(ex, cy + 8, 3, 5, (x, y) => shade(CAST.skin, ex > cx ? 0.2 : 0.04, x, y));
  b.ellipse(cx, cy + 12, 20, 12, (x, y) => shade(CAST.dannyHair, 0.04 + (vnoise(x, y / 2, 3) - 0.5) * 0.08 + (x > cx + 15 ? 0.12 : 0), x, y));
  // cap crown (the front panel faces us), backlit; a pale 'P' on it
  const inCap = (x, y) => ((x + 0.5 - cx) / 23) ** 2 + ((y - cy) / 21) ** 2 <= 1 && y <= cy + 9;
  for (let y = cy - 22; y <= cy + 9; y++) for (let x = cx - 24; x <= cx + 24; x++) {
    if (!inCap(x, y)) continue;
    const edge = !inCap(x - 2, y) || !inCap(x + 2, y) || !inCap(x, y - 2);
    const nx = (x + 0.5 - cx) / 23, ny = (y - cy) / 21;
    // backlit: the panel facing us sits in shadow; the crown's top and sides catch the glass
    let v = 0.06 + 0.1 * clamp01(-ny - 0.2) + (vnoise(x / 2, y / 2, 13) - 0.5) * 0.05;
    if (edge && y < cy) v += 0.42 * (0.5 + 0.5 * clamp01(-ny));
    let c = shade(CAP_BL, clamp01(v + 0.12), x, y);
    if (edge && nx > 0.55 && y > cy - 12) c = mixU(c, TEAL_RIM, 0.35);
    if ((Math.abs(x - cx) === 9 || Math.abs(x - cx) === 17) && y < cy - 2 && !edge) c = shade(CAP_BL, clamp01(v + 0.04), x, y);
    b.px(x, y, c);
  }
  b.px(cx, cy - 21, shade(CAP_BL, 0.85, 0, 0)); b.px(cx + 1, cy - 21, shade(CAP_BL, 0.6, 0, 0)); // button
  const pc = U(mix(PAL.blood_d, PAL.g3, 0.35));
  for (const [x, y] of [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 0], [2, 1], [1, 2]]) b.px(cx - 1 + x, cy - 8 + y, pc);
  // the brim pointing back at us: a flat band under the crown, its edge lit by the dash
  b.poly([[cx - 21, cy + 6], [cx + 21, cy + 6], [cx + 17, cy + 12], [cx - 17, cy + 12]], (x, y) => shade(CAP_BL, y < cy + 7 ? 0.48 : 0.2, x, y));
  b.hline(cx - 17, cy + 12, 35, U(PAL.ink));
  // Eagles jacket collar: midnight green with a silver stripe
  b.poly([[cx - 26, cy + 26], [cx + 26, cy + 26], [cx + 36, cy + 34], [cx - 36, cy + 34]], (x, y) => shade(CAST.eagles, 0.18 + (x > cx + 20 ? 0.22 : 0), x, y));
  b.hline(cx - 28, cy + 28, 57, shade(CAST.silver, 0.25, 0, 0));
  b.hline(cx + 18, cy + 28, 12, shade(CAST.silver, 0.6, 0, 0));
  return b.toCanvas();
}

function paintFront(b) {
  // seat backs in blue-gray velour; headrests; inner edges lit by the console glow
  const seat = (pts, inner, topY) => b.poly(pts, (x, y) => {
    const tex = (vnoise(x / 1.4, y / 1.4, 17) - 0.5) * 0.05;
    const rim = Math.max(0, 1 - Math.abs(x - inner) / 7) * clamp01(1 - (y - 150) / 70);
    const top = Math.max(0, 1 - (y - topY(x)) / 5);
    const v = 0.03 + 0.2 * rim + 0.18 * top + tex - 0.03 * clamp01((y - 200) / 60);
    const c = shade(FABRIC, clamp01(v), x, y);
    return rim > 0.4 && y < 200 ? mixU(c, TEAL_RIM, 0.25) : c;
  });
  // the floor console between the seats, door panels at the edges (all deep in shadow)
  b.rect(200, 196, 80, 74, (x, y) => shade(PLASTIC, 0.08 + (y === 196 ? 0.12 : 0) + (x === 200 || x === 279 ? -0.05 : 0), x, y));
  b.rect(226, 204, 28, 10, (x, y) => shade(PLASTIC, 0.04, x, y));
  b.ellipse(240, 206, 5, 4, (x, y) => shade(PLASTIC, y < 205 ? 0.4 : 0.2, x, y));               // shifter knob
  b.vline(240, 210, 6, shade(PLASTIC, 0.15, 0, 0));
  b.poly([[0, 128], [16, 128], [80, 150], [80, 270], [0, 270]], (x, y) => shade(PLASTIC, 0.05 + (y < 132 ? 0.1 : 0) + ((y - 150) % 40 === 0 ? 0.05 : 0), x, y));
  b.poly([[480, 128], [464, 128], [400, 150], [400, 270], [480, 270]], (x, y) => shade(PLASTIC, 0.05 + (y < 132 ? 0.1 : 0) + ((y - 150) % 40 === 0 ? 0.05 : 0), x, y));
  seat([[40, 270], [50, 166], [62, 146], [96, 139], [190, 141], [204, 150], [210, 270]], 206, (x) => (x < 96 ? 146 - (x - 62) * 0.2 : 140));
  seat([[270, 270], [276, 150], [290, 141], [384, 139], [418, 146], [430, 166], [440, 270]], 274, (x) => (x > 384 ? 139 + (x - 384) * 0.2 : 140));
  // stitched seams down the backs
  for (const sx of [126, 354]) for (let y = 152; y < 270; y += 2) b.px(sx + Math.round((y - 150) * (sx < 240 ? -0.04 : 0.04)), y, shade(FABRIC, 0.02, sx, y));
  const rest = (x0, x1, y0, y1, inner) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const nx = (x + 0.5 - (x0 + x1) / 2) / ((x1 - x0) / 2), ny = (y + 0.5 - (y0 + y1) / 2) / ((y1 - y0) / 2);
      if (nx * nx * nx * nx + ny * ny * ny * ny > 1) continue;
      const top = ny < -0.72 ? 0.26 : ny < -0.55 ? 0.1 : 0;
      const rim = Math.max(0, 1 - Math.abs(x - inner) / 5) * 0.2;
      const c = shade(FABRIC, clamp01(0.03 + top + rim + (vnoise(x / 1.3, y / 1.3, 19) - 0.5) * 0.04), x, y);
      b.px(x, y, rim > 0.08 ? mixU(c, TEAL_RIM, 0.2) : c);
    }
    for (const px of [x0 + 18, x1 - 20]) b.vline(px, y1, 3, U(PAL.g3));                        // posts
  };
  rest(112, 186, 106, 140, 186);
  rest(296, 372, 104, 138, 296);
}

// ---- rain on the glass ---------------------------------------------------------------------------
const easeIO = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u);
const easeInv = (s) => Math.acos(1 - 2 * clamp01(s)) / Math.PI;
function wiperAngle(t) {
  const tau = ((t % CYCLE) + CYCLE) % CYCLE;
  if (tau < UP) return SWEEP * easeIO(tau / UP);
  if (tau < 2 * UP) return SWEEP * (1 - easeIO((tau - UP) / UP));
  return 0;
}
function buildBeads() {
  const n = 340, out = [];
  const s = seeds(n * 3, 1986);
  for (let i = 0, k = 0; out.length < n && i < n * 3; i++) {
    const x = 12 + s[i * 4] * 458, y = 26 + s[i * 4 + 1] * 100;
    if (!inPoly(WS, x, y)) continue;
    let tu = -1, td = -1;
    for (const [px, py] of PIV) {
      const dx = x - px, dy = py - y, d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      if (d >= R0 && d <= R1 && a >= 0 && a <= SWEEP) { tu = UP * easeInv(a / SWEEP); td = UP + UP * easeInv(1 - a / SWEEP); break; }
    }
    const size = s[i * 4 + 2] < 0.6 ? 0 : s[i * 4 + 2] < 0.9 ? 1 : 2;
    out.push({ x: x | 0, y: y | 0, tu, td, delay: 0.15 + s[i * 4 + 3] * 3.0, size, k: k++ });
  }
  return out;
}
function drawBeads(ctx, beads, t) {
  const tau = ((t % CYCLE) + CYCLE) % CYCLE;
  for (const bd of beads) {
    if (bd.tu >= 0) {
      const last = tau >= bd.td ? bd.td : tau >= bd.tu ? bd.tu : bd.td - CYCLE;
      if (tau - last < bd.delay) continue;
    }
    const { x, y } = bd;
    // a bead is a tiny lens: dark belly, the sky caught in its top, one glint
    if (bd.size === 0) { ctx.fillStyle = (bd.k & 1) ? 'rgba(10,12,22,0.5)' : 'rgba(88,120,159,0.55)'; ctx.fillRect(x, y, 1, 1); continue; }
    ctx.fillStyle = 'rgba(8,10,18,0.6)'; ctx.fillRect(x, y + 1, bd.size + 1, 1);
    ctx.fillStyle = 'rgba(70,96,130,0.6)'; ctx.fillRect(x, y, bd.size + 1, 1);
    if (bd.k % 3 === 0) { ctx.fillStyle = 'rgba(196,212,230,0.6)'; ctx.fillRect(x, y, 1, 1); }
    if (bd.size === 2) { ctx.fillStyle = 'rgba(8,10,18,0.5)'; ctx.fillRect(x + 1, y + 2, 2, 1); }
  }
}
/** A few fat drops creeping down the glass, wiped like the rest. */
function drawRivulets(ctx, t, s) {
  const ang = wiperAngle(t);
  for (let i = 0; i < 9; i++) {
    const per = 7 + s[i * 4] * 6;
    const ph = ((t + s[i * 4 + 1] * per) % per) / per;
    const x = 30 + Math.round(s[i * 4 + 2] * 420), y = Math.round(32 + ph * 92);
    if (!inPoly(WS, x, y)) continue;
    if (ang > 0.05) continue;     // the blades are on the glass: skip the fiddly ones this frame
    ctx.fillStyle = 'rgba(88,120,159,0.35)'; ctx.fillRect(x, y - 6, 1, 6);
    ctx.fillStyle = 'rgba(196,212,230,0.8)'; ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = 'rgba(8,10,18,0.6)'; ctx.fillRect(x, y + 1, 2, 1);
  }
}
function drawWipers(ctx, t) {
  const a = wiperAngle(t);
  if (a < 0.02) return;
  const ca = Math.cos(a), sa = -Math.sin(a);
  for (const [px, py] of PIV) {
    // arm (thin) to the blade's midpoint, then the blade (2 px rubber) along its length
    ctx.fillStyle = '#0a0a0f';
    for (let r = R0 - 6; r <= R1; r += 0.7) {
      const x = Math.round(px + ca * r), y = Math.round(py + sa * r);
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.fillStyle = 'rgba(117,115,124,0.7)';
    for (const r of [R1 - 30, R1 - 29, R1 - 8]) ctx.fillRect(Math.round(px + ca * r), Math.round(py + sa * r) - 1, 1, 1);
  }
}
function drawRainBehind(ctx, t, s) {
  ctx.fillStyle = 'rgba(120,140,170,0.35)';
  for (let i = 0; i < 90; i++) {
    const sp = 120 + s[i * 4 + 2] * 60;
    const y = 24 + ((s[i * 4 + 1] * 100 + t * sp) % 100);
    const x = 10 + ((s[i * 4] * 460 + y * 0.2) % 460);
    ctx.fillRect(x | 0, y | 0, 1, 2);
  }
}

// ---- assemble -------------------------------------------------------------------------------------
const layers = once(() => {
  const out = new Buf(); paintOutside(out);
  const back = new Buf(); paintBack(back);
  const front = new Buf(); paintFront(front);
  return {
    outside: out.toCanvas(), back: back.toCanvas(), front: front.toCanvas(), danny: buildDanny(),
    beads: buildBeads(), riv: seeds(9, 77), rain: seeds(90, 78), blink: seeds(8, 79),
    vapor: makeVapor(90, 40, 300, 90, [mix(PAL.g2, PAL.blue_d, 0.4), mix(PAL.g3, PAL.blue_d, 0.3), mix(PAL.g4, PAL.moon, 0.2)]),
    plumes: makePlumes([
      { x: 186, y: 118, rise: 40, r0: 2, r1: 12, life: 8, a: 0.4, w: 6, wind: 10, spread: 3 },
      { x: 262, y: 120, rise: 44, r0: 2, r1: 13, life: 9, a: 0.36, w: 8, wind: 12, spread: 3 },
      { x: 300, y: 117, rise: 30, r0: 2, r1: 9, life: 7, a: 0.3, w: 4, wind: 9, spread: 2 },
    ], 12, 12),
  };
});

export function prepCar() { layers(); }

export const carInterior = {
  draw(ctx, t = 0) {
    const L = layers();
    ctx.drawImage(L.outside, 0, 0);
    L.vapor.clear(); L.plumes(L.vapor, t + 20); L.vapor.render(ctx);
    drawRainBehind(ctx, t, L.rain);
    drawBeads(ctx, L.beads, t);
    drawRivulets(ctx, t, L.riv);
    drawWipers(ctx, t);
    ctx.drawImage(L.back, 0, 0);
    // the clock's colon blinks once a second
    if ((t % 1) < 0.5) { ctx.fillStyle = '#d1e6d4'; ctx.fillRect(CLOCK.x + 8, CLOCK.y + 4, 1, 1); ctx.fillRect(CLOCK.x + 8, CLOCK.y + 8, 1, 1); }
    // Leah blinks in the mirror now and then
    const bk = Math.floor(t / 4.3);
    if ((t % 4.3) > 3.0 + L.blink[bk % 8] && (t % 4.3) < 3.14 + L.blink[bk % 8]) {
      ctx.fillStyle = '#a96f56'; ctx.fillRect(231, 33, 5, 3); ctx.fillRect(245, 33, 5, 3);
    }
    // Danny never keeps still
    const dk = Math.floor(t / 1.7), dd = h01(dk, 0, 5);
    const dx = dd < 0.3 ? 1 : dd < 0.45 ? -1 : 0, dy = h01(dk, 1, 5) < 0.25 ? 1 : 0;
    ctx.drawImage(L.danny, DANNY.ox + dx, DANNY.oy + dy);
    ctx.drawImage(L.front, 0, 0);
  },
};
