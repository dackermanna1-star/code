// vhs_frames: raw frames from Leah's camcorder (the UI adds the VHS filter, OSD & timestamp).
// 0 the lobby, 9:51 — the four of them under the Founder's portrait, Danny's bunny ears behind Leah
// 1 Room 103, 10:41 — Tess & Marcus heads-down, from Leah's seat, under the tubes
// 2 a dark mass fills the right of the frame: navy wool, a brass button sunk in a fold, sash fringe
// 3 a huge ringed hand settles on the camera-holder's shoulder (Leah's gray cardigan)
// 4 the camera wrenched sideways: tilted, smeared
// 5 his small serene face at the lens, smiling
// The CG reports frames = 6 (vhs.js then maps the tape's group shot to frame 0).
import { HField } from './colonel_gbuf.js';
import { FACE_EXPR } from './colonel_face.js';
import { Cel, celMat, light, lightCel, quantize, outline, gradeLUT, packTones, packedToCanvas, domePoly, bay, h01, fbm, clamp, quad, inPoly, polyDist } from './colonel_cg_cel.js';
import { CM, sculptHand, detailHand, paintNails, paintRings, sculptCuff, patchLUT } from './colonel_cg_handkit.js';
import { headCel, liftRing } from './colonel_cg_face.js';
import { getPortrait } from './portraits.js';
import { makeCanvas, ctxOf, rng } from './util.js';

const W = 480, H = 270;
export const VHS_FRAMES = 6;

// ---------------------------------------------------------------------------------------- materials
const V = {
  CEIL: 80, WALLC: 81, WALLG: 82, CHALK: 83, WOOD: 84, GLASS: 85, PAPER: 86, DARK: 87, FLOOR1: 88, FLOOR2: 89,
  METAL: 90, CHAIR: 91, OLIVE: 92, BEANIE: 93, DSKIN: 94, JEANS: 95, TUBE: 96, CARD: 97, SASH: 98, MARBLE: 99,
  GILT: 100, UMBER: 101, NAVYP: 102, VELVET: 103, FLESHP: 104, PLAQUE: 105, CHALKW: 106, DENP: 107, DENPD: 108, STITCHP: 109, THAIR: 110, KNIT: 111,
};
const T6 = [0.1, 0.24, 0.42, 0.62, 0.84];
const T7 = [0.08, 0.2, 0.35, 0.53, 0.73, 0.94];
celMat(V.CEIL, { ramp: ['#16140e', '#2e2a20', '#4e4836', '#726a50', '#958c6c', '#b4ab88', '#d2caa6'], th: T7, dith: 0.04, seam: false });
celMat(V.WALLC, { ramp: ['#14120c', '#2c281c', '#4c4632', '#6e664a', '#908764', '#aea47e', '#c8be98'], th: T7, dith: 0.04, seam: false });
celMat(V.WALLG, { ramp: ['#070c09', '#101a13', '#1c2a20', '#2a3d30', '#3c5444', '#536c5a', '#6e8874'], th: T7, dith: 0.04, seam: false });
celMat(V.CHALK, { ramp: ['#05080a', '#0b1210', '#131e19', '#1c2b24', '#283a31', '#364a40'], th: T6, dith: 0.03, seam: false });
celMat(V.CHALKW, { ramp: ['#1a1e1c', '#2e3430', '#46504a', '#5e6a62', '#78847a', '#949e94'], th: T6 });
celMat(V.WOOD, { ramp: ['#0e0806', '#22150c', '#3e2716', '#5c3c22', '#7c5532', '#9c7046'], th: T6, line: 0, gap: 4 });
celMat(V.GLASS, { ramp: ['#020304', '#06080c', '#0c1018', '#141a26', '#22304a'], th: [0.15, 0.35, 0.6, 0.85] });
celMat(V.PAPER, { ramp: ['#18160f', '#3a3626', '#625c44', '#8c8564', '#b4ad8a', '#d8d2b0', '#efe9cc'], th: T7, line: 0, gap: 3 });
celMat(V.DARK, { ramp: ['#030303', '#0a0a0c', '#141418', '#202026'], th: [0.2, 0.5, 0.85] });
celMat(V.FLOOR1, { ramp: ['#080806', '#16140c', '#2a2616', '#403a22', '#5a5230', '#746a40'], th: T6, dith: 0.04, seam: false });
celMat(V.FLOOR2, { ramp: ['#060908', '#0e1410', '#182220', '#24322c', '#324438', '#425646'], th: T6, dith: 0.04, seam: false });
celMat(V.METAL, { ramp: ['#08080a', '#16161a', '#2a2a30', '#44444c', '#666670', '#8e8e98'], th: T6, line: 0, gap: 5 });
celMat(V.CHAIR, { ramp: ['#0c0806', '#20140c', '#382418', '#523626', '#6e4a34', '#8a6244'], th: T6, line: 0, lineLit: 1, gap: 5 });
celMat(V.OLIVE, { ramp: ['#080a06', '#151a0e', '#252c18', '#384024', '#4e5832', '#667244', '#808c58'], th: T7, line: 0, lineLit: 1, gap: 4 });
celMat(V.BEANIE, { ramp: ['#040405', '#0a0a0d', '#121216', '#1c1c22', '#28282f', '#36363e'], th: T6, line: 0, gap: 4 });
celMat(V.DSKIN, { ramp: ['#0c0604', '#1e100a', '#341c10', '#4e2c1a', '#6a4028', '#8a5636'], th: T6, line: 0, gap: 4 });
celMat(V.JEANS, { ramp: ['#040405', '#09090c', '#101016', '#18181f', '#22222a', '#2e2e38'], th: T6, line: 0, gap: 4 });
celMat(V.TUBE, { ramp: ['#8ea292', '#bcd2be', '#e2f2de', '#f8fff6'], th: [0.3, 0.6, 0.85], flat: 1 });
celMat(V.CARD, { ramp: ['#050506', '#0e0e12', '#1a1a20', '#2a2a32', '#3c3c46', '#52525e', '#6c6c78'], th: T7, line: 0, lineLit: 1, gap: 6 });
celMat(V.SASH, { ramp: ['#0e0204', '#2c060c', '#540c18', '#7e1424', '#a42234', '#c8424a'], th: T6, line: 0, gap: 3 });
celMat(V.MARBLE, { ramp: ['#0a0a0a', '#1a1a1a', '#2e2c2a', '#46423e', '#605a54', '#7c766e'], th: T6, dith: 0.04, seam: false });
celMat(V.GILT, { ramp: ['#120c04', '#30220a', '#5a4214', '#86662a', '#b08c44', '#d6b468', '#f0d898'], th: T7, line: 0, gap: 2 });
celMat(V.UMBER, { ramp: ['#060403', '#120c08', '#22160e', '#341f12', '#4a2e1a', '#644024'], th: T6, dith: 0.05, seam: false });
celMat(V.NAVYP, { ramp: ['#030408', '#080b16', '#0f1428', '#18203c', '#243052', '#344470'], th: T6, line: 0, gap: 2 });
celMat(V.VELVET, { ramp: ['#080203', '#180508', '#2c0a10', '#44101a', '#5e1824', '#7a2230'], th: T6 });
celMat(V.FLESHP, { ramp: ['#100c0a', '#2c2420', '#52443c', '#7c6a5e', '#a69282', '#cab8a6'], th: T6, line: 0, gap: 2 });
// Tess's jacket on tape: the portrait's light-wash denim (mid #8ca8c8, shadow #476288), flat planes
celMat(V.DENP, { ramp: ['#182036', '#2a3a58', '#476288', '#6787ad', '#8ca8c8', '#b4c8dc'], th: [0.16, 0.34, 0.54, 0.76, 1.02], line: 0, lineLit: 1, gap: 3, smooth: 1, clean: true, seam: false });
celMat(V.DENPD, { ramp: ['#121a2c', '#22304a', '#3a5274', '#56729a', '#7896b8', '#9cb4cc'], th: [0.14, 0.3, 0.48, 0.68, 0.9], line: 0, gap: 3, smooth: 1, sgroup: V.DENP, clean: true, seam: false });
celMat(V.STITCHP, { ramp: ['#24140c', '#4a2c16', '#7a4c26', '#a26c38', '#c08a4c', '#d8a868'], th: [0.14, 0.3, 0.48, 0.68, 0.9], seam: false });
celMat(V.THAIR, { ramp: ['#260905', '#4e1a0e', '#7c2812', '#973617', '#b2441b', '#e27a38'], th: [0.13, 0.28, 0.45, 0.64, 0.9], line: 0, lineLit: 1, gap: 2, smooth: 1, clean: true, seam: false });
// Leah's charcoal cardigan: a soft knit
celMat(V.KNIT, { ramp: ['#060608', '#101014', '#1c1c22', '#2a2a32', '#3a3a44', '#4e4e5a', '#666674'], th: [0.08, 0.2, 0.35, 0.53, 0.73, 0.94], line: 0, lineLit: 1, gap: 6, smooth: 2, clean: true, seam: false });
celMat(V.PLAQUE, { ramp: ['#100c04', '#2a200c', '#4a3a18', '#6e5828', '#94783a', '#b89a54'], th: T6, line: 0, gap: 2 });

// ---------------------------------------------------------------------------------------- the classroom
// pinhole camera at Leah's seat: x right, y up, z toward the front of the room (metres)
const CAM = { x: 0.62, y: 1.12, z: 0, f: 300, hy: 112 };
const prj = (x, y, z) => [W / 2 + CAM.f * (x - CAM.x) / (z - CAM.z), CAM.hy - CAM.f * (y - CAM.y) / (z - CAM.z)];
const sc = (z) => CAM.f / (z - CAM.z);
const dz = (z) => 600 - z * 60;        // depth → cel height (nearer is higher)

function room(cel, r) {
  const back = 7.2;
  const [, t0] = prj(0, 3.2, back), [, b0] = prj(0, 0, back), rail = prj(0, 1.0, back)[1];
  // front wall: nicotine cream over institutional green, a wooden rail between
  cel.poly([[0, 0], [W, 0], [W, H], [0, H]], V.WALLC, { z: dz(back), n: [0, 0, 1], sid: 1 });
  cel.poly([[0, rail], [W, rail], [W, b0], [0, b0]], V.WALLG, { z: dz(back), n: [0, 0, 1], sid: 1 });
  cel.poly([[0, rail - 1], [W, rail - 1], [W, rail + 2], [0, rail + 2]], V.WOOD, { z: dz(back) + 0.1, n: [0, -0.5, 0.85], sid: 2 });
  // stains run down the cream
  for (let k = 0; k < 7; k++) { const x0 = 20 + r() * 440, L = 10 + r() * 40; for (let y = Math.round(t0) + 1; y < t0 + L; y++) { const x = Math.round(x0 + Math.sin(y * 0.2 + k) * 1.5); if (cel.matAt(x, y) === V.WALLC && r() < 0.8) cel.shift(x, y, -1); } }
  // ceiling: acoustic tiles in perspective, a dead tube or two
  for (let y = 0; y < t0; y++) {
    const z = CAM.f * (3.2 - CAM.y) / Math.max(1, CAM.hy - y);
    for (let x = 0; x < W; x++) {
      const xw = CAM.x + (x - W / 2) * z / CAM.f;
      const grid = Math.abs((xw * 1.65) % 1) < 0.035 || Math.abs((z * 1.65) % 1) < 0.045 * (z / 3);
      cel.put(x, y, V.CEIL, { z: dz(z), n: [0, 0.75, 0.66], sid: 3, off: grid ? -2 : (h01(x >> 1, y >> 1, 3) < 0.05 ? -1 : 0) });
    }
  }
  // linoleum checker
  for (let y = Math.ceil(b0); y < H; y++) {
    const z = CAM.f * CAM.y / Math.max(1, y - CAM.hy);
    for (let x = 0; x < W; x++) {
      const xw = CAM.x + (x - W / 2) * z / CAM.f;
      const chk = (Math.floor(xw / 0.3) + Math.floor(z / 0.3)) & 1;
      cel.put(x, y, chk ? V.FLOOR1 : V.FLOOR2, { z: dz(z), n: [0, -0.8, 0.6], sid: 4, off: (fbm(xw * 40, z * 40, 9, 9) > 0.68 && h01(x, y, 7) < 0.5) ? -1 : 0 });
    }
  }
  // the chalkboard and its tray; a ghost of erased writing
  const [cx0, cy0] = prj(-3.6, 2.15, back - 0.02), [cx1, cy1] = prj(0.7, 0.95, back - 0.02);
  cel.poly([[cx0 - 3, cy0 - 3], [cx1 + 3, cy0 - 3], [cx1 + 3, cy1 + 4], [cx0 - 3, cy1 + 4]], V.WOOD, { z: dz(back) + 1, n: [0, 0, 1], sid: 5 });
  cel.poly([[cx0, cy0], [cx1, cy0], [cx1, cy1], [cx0, cy1]], V.CHALK, { z: dz(back) + 1.2, n: [0, 0, 1], sid: 6 });
  for (let k = 0; k < 6; k++) {
    const x = cx0 + 10 + r() * (cx1 - cx0 - 50), y = cy0 + 6 + k * 7;
    cel.stroke([[x, y], [x + 14 + r() * 26, y + (r() - 0.5) * 2]], (px, py) => { if (cel.matAt(px, py) === V.CHALK && r() < 0.7) cel.put(px, py, V.CHALKW, { z: dz(back) + 1.3 }); });
  }
  // the door with its wired window (black: the hall beyond), the clock, the bell schedule
  const [dx0, dy0] = prj(2.6, 2.1, back - 0.02), [dx1, dy1] = prj(3.5, 0, back - 0.02);
  cel.poly([[dx0, dy0], [dx1, dy0], [dx1, dy1], [dx0, dy1]], V.WOOD, { z: dz(back) + 1, n: [0, 0, 1], sid: 7 });
  const [wx0, wy0] = prj(2.85, 1.85, back - 0.03), [wx1, wy1] = prj(3.05, 1.25, back - 0.03);
  cel.poly([[wx0, wy0], [wx1, wy0], [wx1, wy1], [wx0, wy1]], V.GLASS, { z: dz(back) + 1.5, n: [0, 0, 1], sid: 8 });
  const [kx, ky] = prj(1.6, 2.5, back - 0.02), kr = sc(back) * 0.17;
  for (let y = Math.floor(ky - kr - 1); y <= ky + kr + 1; y++) for (let x = Math.floor(kx - kr - 1); x <= kx + kr + 1; x++) {
    const d = Math.hypot(x + 0.5 - kx, y + 0.5 - ky);
    if (d < kr + 1) cel.put(x, y, d > kr - 0.5 ? V.DARK : V.PAPER, { z: dz(back) + 2, n: [0, 0, 1], sid: 9 });
  }
  cel.stroke([[kx, ky], [kx + 2, ky - 3]], (x, y) => cel.put(x, y, V.DARK, { z: dz(back) + 2.1, sid: 9 }));
  cel.stroke([[kx, ky], [kx - 3, ky + 1]], (x, y) => cel.put(x, y, V.DARK, { z: dz(back) + 2.1, sid: 9 }));
  const [px, py] = prj(1.3, 1.6, back - 0.02);
  cel.poly([[px, py], [px + 11, py], [px + 11, py + 15], [px, py + 15]], V.PAPER, { z: dz(back) + 1.5, n: [0, 0, 1], sid: 10, off: -1 });
}

function desk(cel, x, z) {
  // 1970s combo chair-desk seen from behind: laminate top, tubular legs, the chair's back and seat
  const P = (a, b, c) => prj(x + a, b, z + c);
  const top = [P(-0.3, 0.74, -0.2), P(0.32, 0.74, -0.2), P(0.32, 0.74, 0.24), P(-0.3, 0.74, 0.24)];
  const zz = dz(z) + 4, s = sc(z);
  const leg = (a, c, zb) => { const [ax, ay] = P(a, 0.74, c), [bx, by] = P(a, 0, c), r2 = Math.max(0.6, s * 0.012); cel.stroke([[ax, ay], [bx, by]], (px, py) => { for (let k = -Math.floor(r2); k <= Math.floor(r2); k++) cel.put(px + k, py, V.METAL, { z: zb, n: [k / (r2 + 0.5), 0, 1], sid: 1200 + Math.round(z * 10) }); }); };
  for (const [a, c] of [[-0.26, 0.2], [0.28, 0.2]]) leg(a, c, zz - 2);
  cel.poly(top, CM.DESK, { z: zz, n: [0, -0.7, 0.7], sid: 1300 + Math.round(z * 10) });
  const [ex0, ey0] = top[0], [ex1, ey1] = top[1], th = Math.max(1, s * 0.03);
  cel.poly([[ex0, ey0], [ex1, ey1], [ex1, ey1 + th], [ex0, ey0 + th]], CM.DESK_EDGE, { z: zz + 0.2, n: [0, 0, 1], sid: 1300 + Math.round(z * 10) });
  for (const [a, c] of [[-0.26, -0.15], [0.28, -0.15]]) leg(a, c, zz + 1);
  // chair: seat and back (the back hides a student's lower back)
  const seat = [P(-0.2, 0.45, -0.62), P(0.2, 0.45, -0.62), P(0.2, 0.45, -0.3), P(-0.2, 0.45, -0.3)];
  cel.poly(seat, V.CHAIR, { z: dz(z - 0.45), n: [0, -0.8, 0.6], sid: 1400 + Math.round(z * 10) });
  const cb = [P(-0.21, 0.82, -0.52), P(0.21, 0.82, -0.52), P(0.21, 0.6, -0.52), P(-0.21, 0.6, -0.52)];
  return { top, cb, z, zz };
}
function chairBack(cel, d) {
  cel.poly(d.cb, V.CHAIR, { z: dz(d.z - 0.52) + 8, n: [0, 0, 1], sid: 1500 + Math.round(d.z * 10) });
  // the metal spine down to the seat
  const [ax, ay] = [(d.cb[2][0] + d.cb[3][0]) / 2, d.cb[2][1]], s = sc(d.z - 0.52);
  cel.stroke([[ax, ay], [ax, ay + s * 0.15]], (px, py) => cel.put(px, py, V.METAL, { z: dz(d.z - 0.52) + 8, sid: 1600 + Math.round(d.z * 10) }));
}

/** A capsule (thick segment with round ends) as a polygon. */
function capsule(ax, ay, ra, bx, by, rb, n = 10) {
  const a = Math.atan2(by - ay, bx - ax), pts = [];
  for (let k = 0; k <= n; k++) { const t = a + Math.PI / 2 + (k / n) * Math.PI; pts.push([ax + Math.cos(t) * ra, ay + Math.sin(t) * ra]); }
  for (let k = 0; k <= n; k++) { const t = a - Math.PI / 2 + (k / n) * Math.PI; pts.push([bx + Math.cos(t) * rb, by + Math.sin(t) * rb]); }
  return pts;
}
/** Catmull-Rom through an open chain of points (end points kept). */
function smoothPoly(pts, seg = 4) {
  const out = [], n = pts.length, P = (i) => pts[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < seg; k++) {
      const t = k / seg, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(pts[n - 1]);
  return out;
}
/** Marcus slumped forward, head down on folded arms, seen from behind (clean silhouettes). */
function student(cel, x, z, kind, r) {
  const at = (a, b, c) => prj(x + a, b, z + c);
  const zz = (c) => dz(z + c) + 20;
  const tess = kind === 'tess';
  const jacket = tess ? CM.DENIM : V.OLIVE, sidB = 1700 + (tess ? 0 : 20);
  // upper arms out to the elbows on the desk (behind the back), rounded
  for (const sd of [-1, 1]) {
    const [sx2, sy2] = at(sd * 0.2, 0.85, -0.3), [ex, ey] = at(sd * 0.35, 0.775, -0.06);
    const rA = sc(z - 0.3) * 0.062, rB = sc(z - 0.06) * 0.058;
    domePoly(cel, capsule(sx2, sy2, rA, ex, ey, rB), jacket, { R: Math.min(rA, rB) * 0.9, hgt: rA, z: zz(-0.08), sid: sidB + 1 + (sd > 0 ? 1 : 0), tilt: [sd * 0.15, -0.1] });
  }
  // the head, bowed lower than the shoulders: only its crown shows above them
  const [hx, hy] = at(tess ? 0.03 : 0, 0.905, -0.12), hr = sc(z - 0.12) * 0.108;
  const head = [];
  for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2; head.push([hx + Math.cos(a) * hr, hy + Math.sin(a) * hr * 0.92]); }
  domePoly(cel, head, tess ? CM.HAIR : V.BEANIE, { R: hr * 0.9, hgt: hr, z: zz(-0.1), sid: sidB + 5 });
  // the hunched back and shoulders (nearest), rounded and drawn up around the neck
  const [lx, ly] = at(-0.22, 0.87, -0.3), [rx, ry] = at(0.22, 0.87, -0.3), [nlx, nly] = at(-0.07, 0.915, -0.27), [nrx, nry] = at(0.07, 0.915, -0.27);
  const bs = sc(z - 0.3);
  const ctrl = [[-0.2, 0.6, -0.45], [-0.235, 0.72, -0.38], [-0.245, 0.8, -0.33], [-0.228, 0.858, -0.3], [-0.18, 0.893, -0.29], [-0.1, 0.91, -0.28], [-0.05, 0.922, -0.27],
    [0.05, 0.922, -0.27], [0.1, 0.91, -0.28], [0.18, 0.893, -0.29], [0.228, 0.858, -0.3], [0.245, 0.8, -0.33], [0.235, 0.72, -0.38], [0.2, 0.6, -0.45]].map(([a2, b2, c2]) => at(a2, b2, c2));
  const backPts = smoothPoly(ctrl, 5);
  domePoly(cel, backPts, jacket, { R: bs * 0.2, hgt: bs * 0.14, z: zz(-0.3), sid: sidB, tilt: [0, -0.2] });
  // the nape, bared where the head bows
  const [qx, qy] = at(tess ? 0.03 : 0, 0.905, -0.22);
  const nw = bs * (tess ? 0.035 : 0.045), nh = bs * 0.03;
  domePoly(cel, [[qx - nw, qy + nh], [qx - nw * 0.8, qy - nh], [qx + nw * 0.8, qy - nh], [qx + nw, qy + nh]], tess ? CM.SKIN : V.DSKIN, { R: nw, hgt: nw * 0.6, z: zz(-0.3) + bs * 0.12, sid: sidB + 6 });
  // the collar around it
  const col = quad([nlx - bs * 0.01, nly + 1], [(nlx + nrx) / 2, nly + bs * 0.05], [nrx + bs * 0.01, nry + 1], 16);
  for (const [cx, cy] of col) for (let k = 0; k < Math.max(2, Math.round(bs * 0.025)); k++) {
    const i = cel.idx(cx, cy + k); if (i >= 0 && cel.mat[i] === jacket) { cel.mat[i] = tess ? CM.DENIM_D : V.OLIVE; cel.off[i] = k === 0 ? 1 : -1; cel.z[i] += 2; }
  }
    // Marcus: the rib knit of the beanie, its fold; headphones around his neck
    for (let y = Math.floor(hy - hr); y < hy + hr; y++) for (let x2 = Math.floor(hx - hr); x2 < hx + hr; x2++) if (cel.matAt(x2, y) === V.BEANIE && (x2 & 1)) cel.shift(x2, y, -1);
    cel.stroke([[hx - hr * 0.95, hy + hr * 0.35], [hx + hr * 0.95, hy + hr * 0.35]], (px, py) => cel.shift(px, py, 1));
    const hp = quad([nlx - bs * 0.02, nly + 2], [(nlx + nrx) / 2, nly + bs * 0.07], [nrx + bs * 0.02, nry + 2], 16);
    for (const [cx, cy] of hp) for (let k = 0; k < 2; k++) cel.put(cx, cy + k, V.DARK, { z: zz(-0.3) + bs * 0.2, n: [0, -0.5, 0.8], sid: 1730 });
    for (const [cx, cy] of [hp[0], hp[hp.length - 1]]) for (let k = -2; k <= 2; k++) cel.put(cx + k, cy + 1, V.METAL, { z: zz(-0.3) + bs * 0.21, sid: 1731 });
    // field jacket: the back seam, a pocket flap at the shoulder
    const [m0x, m0y] = at(0, 0.88, -0.3), [m1x, m1y] = at(0, 0.6, -0.45);
    cel.stroke([[m0x, m0y + 4], [m1x, m1y]], (px, py) => { const i = cel.idx(px, py); if (i >= 0 && cel.mat[i] === V.OLIVE) cel.off[i] -= 1; });
  // weave texture
  for (let y = 0; y < H; y++) for (let x2 = 0; x2 < W; x2++) { const i = y * W + x2; if ((cel.mat[i] === CM.DENIM || cel.mat[i] === V.OLIVE) && cel.sid[i] >= sidB && cel.sid[i] < sidB + 10 && ((x2 * 2 + y) % 5 === 0)) cel.off[i] -= 1; }
}

/** Tess from behind, from Leah's seat: head down on her folded arms — hunched shoulders drawn up round the
 * bowed head, the jacket's collar and pointed yoke, shoulder blades under the denim, elbows out on the desk,
 * her copper hair falling forward off the crown and spilling over her forearms. */
function tessBack(cel, x, z) {
  const at = (a, b, c) => prj(x + a, b, z + c);
  const zz = (c) => dz(z + c) + 20;
  const bs = sc(z - 0.3), D = V.DENP;
  // a surface from a polygon and a height function (metres → px); normals from its own z field
  const surface = (pts, mat, sid, zf, o = {}) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [px, py] of pts) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
    x0 = Math.floor(x0) - 1; y0 = Math.floor(y0) - 1; x1 = Math.ceil(x1) + 1; y1 = Math.ceil(y1) + 1;
    const w = x1 - x0 + 1, h = y1 - y0 + 1, zb = new Float32Array(w * h).fill(-1e9);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const fx = x0 + xx + 0.5, fy = y0 + yy + 0.5; if (inPoly(pts, fx, fy)) zb[yy * w + xx] = zf(fx, fy, polyDist(pts, fx, fy)); }
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const i = yy * w + xx, zc = zb[i]; if (zc < -1e8) continue;
      const g = (j, ok) => (ok && zb[j] > -1e8 ? zb[j] : zc - (o.drop ?? 3));
      const gx = (g(i + 1, xx < w - 1) - g(i - 1, xx > 0)) * 0.5, gy = (g(i + w, yy < h - 1) - g(i - w, yy > 0)) * 0.5;
      cel.put(x0 + xx, y0 + yy, mat, { z: zc, n: [-gx + (o.tilt?.[0] || 0), -gy + (o.tilt?.[1] || 0), 1], sid, fix: -1, off: 0, mode: o.mode || 'any' });
    }
  };
  const round = (d, R, H) => H * Math.sqrt(Math.min(d, R) / R);
  // 1. the upper arms, angled out from the shoulders to the elbows on the desk, and the forearms folded in
  for (const sd of [-1, 1]) {
    const [sx, sy] = at(sd * 0.165, 0.86, -0.29), [ex, ey] = at(sd * 0.285, 0.762, -0.07), [fx, fy] = at(sd * 0.1, 0.772, 0.08);
    const rA = bs * 0.048, rF = sc(z) * 0.04;
    surface(capsule(ex, ey, rF, fx, fy, rF * 0.9), D, 1710 + (sd > 0 ? 1 : 0), (px, py, d) => zz(0.02) + round(d, rF, rF * 0.8));
    surface(capsule(sx, sy, rA, ex, ey, rA * 0.92), D, 1712 + (sd > 0 ? 1 : 0), (px, py, d) => zz(-0.15) + round(d, rA, rA));
    // the elbow's crease: a zig-zag fold where the sleeve bends
    const mx = ex + (sx - ex) * 0.2, my = ey + (sy - ey) * 0.2;
    cel.stroke([[mx - 3, my - 2], [mx, my + 1], [mx + 3, my - 2]], (px, py) => { const i = cel.idx(px, py); if (i >= 0 && cel.mat[i] === D) cel.off[i] = -1; });
  }
  // 2. the head, bowed lower than the shoulders: its crown shows over the collar
  const [hx, hy] = at(0.015, 0.9, -0.15), hr = sc(z - 0.15) * 0.1;
  const head = []; for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; head.push([hx + Math.cos(a) * hr, hy + Math.sin(a) * hr * 0.95]); }
  surface(head, V.THAIR, 1720, (px, py, d) => zz(-0.13) + round(d, hr, hr * 0.9));
  // 3. the back: hunched, shoulders drawn up round the neck; shoulder blades under the denim, the spine's
  // valley between them; narrower than the arms' spread (≈105 px)
  const ctrl = [[-0.17, 0.6, -0.45], [-0.19, 0.72, -0.38], [-0.205, 0.8, -0.34], [-0.2, 0.86, -0.31], [-0.16, 0.9, -0.3], [-0.1, 0.918, -0.29], [-0.06, 0.912, -0.28],
    [0.06, 0.912, -0.28], [0.1, 0.918, -0.29], [0.16, 0.9, -0.3], [0.2, 0.86, -0.31], [0.205, 0.8, -0.34], [0.19, 0.72, -0.38], [0.17, 0.6, -0.45]].map(([a2, b2, c2]) => at(a2, b2, c2));
  const backPts = smoothPoly(ctrl, 5);
  const [bcx] = at(0, 0.8, -0.32), blade = (px, py, sd) => { const [qx, qy] = at(sd * 0.085, 0.8, -0.32); return Math.exp(-(((px - qx) / (bs * 0.06)) ** 2 + ((py - qy) / (bs * 0.07)) ** 2)); };
  surface(backPts, D, 1700, (px, py, d) => zz(-0.3) + round(d, bs * 0.12, bs * 0.1) + (blade(px, py, -1) + blade(px, py, 1)) * bs * 0.012 - Math.exp(-(((px - bcx) / (bs * 0.012)) ** 2)) * bs * 0.008, { tilt: [0, -0.15] });
  // 4. the collar: turned down round the bowed neck, two points
  const [c0x, c0y] = at(-0.1, 0.915, -0.285), [c1x, c1y] = at(0.1, 0.915, -0.285), [cmx, cmy] = at(0, 0.88, -0.29);
  const collar = [[c0x - 2, c0y], [cmx - bs * 0.02, cmy - bs * 0.025], [cmx + bs * 0.02, cmy - bs * 0.025], [c1x + 2, c1y], [c1x - bs * 0.01, c1y + bs * 0.05], [cmx, cmy + bs * 0.012], [c0x + bs * 0.01, c0y + bs * 0.05]];
  surface(collar, D, 1703, (px, py, d) => zz(-0.3) + bs * 0.11 + round(d, 3, 2), { tilt: [0, -0.4] });
  cel.stroke([[cmx, cmy - bs * 0.02], [cmx, cmy + bs * 0.012]], (px, py) => { const i = cel.idx(px, py); if (i >= 0 && cel.sid[i] === 1703) cel.off[i] = -2; });
  // 5. the yoke (pointed at the centre) and the two pleat seams below it, copper topstitching; the shoulder seams
  const seam = (pts, stitch = true) => cel.stroke(pts, (px, py) => {
    const i = cel.idx(px, py); if (i < 0 || cel.mat[i] !== D || cel.sid[i] !== 1700) return;
    cel.mat[i] = V.DENPD;
    const j = cel.idx(px, py + 2); if (stitch && j >= 0 && cel.mat[j] === D && ((px + py) % 3 === 0)) cel.mat[j] = V.STITCHP;
  });
  seam(smoothPoly([at(-0.2, 0.84, -0.32), at(-0.1, 0.835, -0.32), at(0, 0.815, -0.32), at(0.1, 0.835, -0.32), at(0.2, 0.84, -0.32)], 6));
  for (const sd of [-1, 1]) { seam([at(sd * 0.075, 0.8, -0.33), at(sd * 0.09, 0.62, -0.44)]); seam([at(sd * 0.12, 0.905, -0.3), at(sd * 0.2, 0.86, -0.31)], false); }
  // 6. her hair: over the bowed head from a parting at the crown, falling in broad locks down both sides,
  // over the shoulders and onto the forearms by the elbows (strand lines, 1-px partings, pointed ends)
  const ribbon = (pts, w0, w1, sid, zf) => {
    const P = smoothPoly(pts, 8), n = P.length - 1, cum = [0];
    for (let k = 0; k < n; k++) cum.push(cum[k] + Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]));
    const tot = cum[n] || 1, wAt = (t) => (w0 + (w1 - w0) * t) * (t > 0.8 ? Math.max(0.12, (1 - t) / 0.2) : 1);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [px, py] of P) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
    const pad = Math.max(w0, w1) + 2;
    for (let yy = Math.floor(y0 - pad); yy <= y1 + pad; yy++) for (let xx = Math.floor(x0 - pad); xx <= x1 + pad; xx++) {
      let best = 1e9, bt = 0, bs2 = 1, bd = [1, 0];
      for (let k = 0; k < n; k++) {
        const [ax, ay] = P[k], dx = P[k + 1][0] - ax, dy = P[k + 1][1] - ay, L2 = dx * dx + dy * dy || 1e-9;
        let t = ((xx + 0.5 - ax) * dx + (yy + 0.5 - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = xx + 0.5 - ax - dx * t, ey = yy + 0.5 - ay - dy * t, d = Math.hypot(ex, ey);
        if (d < best) { best = d; const L = Math.sqrt(L2); bt = (cum[k] + t * L) / tot; bs2 = dx * ey - dy * ex >= 0 ? 1 : -1; bd = [dx / L, dy / L]; }
      }
      const wv = wAt(bt); if (best > wv) continue;
      const q = bs2 * best / wv;
      const strand = (Math.abs(Math.abs(q) - 0.5) < 0.5 / Math.max(1, wv) || Math.abs(q) < 0.5 / Math.max(1, wv)) && bt > 0.12 && bt < 0.85;
      cel.put(xx, yy, V.THAIR, { z: zf(bt) + (1 - q * q) * 2, n: [-bd[1] * q * 0.6, bd[0] * q * 0.6 - 0.25, 1], sid, fix: -1, off: strand ? -1 : 0, flag: wv < 1.6 ? 1 : 0 });
    }
  };
  const hz = (k) => (t) => zz(-0.3) + bs * 0.12 + 8 + k - t * 3;
  const cr0 = [hx + hr * 0.12, hy - hr * 0.88];       // the top of the parting
  void ribbon;   // (no stray locks on the forearms: at this size they read as slugs)
  // the hair over the bowed head: a rounded crown, parted, falling in two curtains past the ears to the
  // shoulders with uneven pointed ends; between them at the bottom, a sliver of the bared nape
  const hairPts = [];
  for (let k = 0; k <= 16; k++) { const a = Math.PI + (k / 16) * Math.PI; hairPts.push([hx + Math.cos(a) * hr * 1.05, hy + Math.sin(a) * hr * 0.92]); }
  hairPts.push([hx + hr * 1.13, hy + hr * 0.55], [hx + hr * 1.08, hy + hr * 1.2], [hx + hr * 0.82, hy + hr * 0.98], [hx + hr * 0.62, hy + hr * 1.28], [hx + hr * 0.38, hy + hr * 0.96], [hx + hr * 0.18, hy + hr * 1.12],
    [hx - hr * 0.02, hy + hr * 0.98], [hx - hr * 0.22, hy + hr * 1.14], [hx - hr * 0.42, hy + hr * 0.94], [hx - hr * 0.66, hy + hr * 1.24], [hx - hr * 0.86, hy + hr * 0.96], [hx - hr * 1.1, hy + hr * 1.16], [hx - hr * 1.12, hy + hr * 0.5]);
  surface(hairPts, V.THAIR, 1745, (px, py, d) => hz(3)(0) + round(d, hr * 0.9, hr * 0.6) - Math.max(0, py - hy) * 0.15, { tilt: [0, -0.35] });
  // (no bared nape between the curtains: at this size a lit sliver of skin read as a little face)
  // strand lines: from the parting, curving down each side; a sheen across the crown's upper left
  for (const sd of [-1, 1]) for (const k of [0.25, 0.55, 0.85]) {
    cel.stroke(quad([cr0[0] + sd * 1, cr0[1] + 1], [hx + sd * hr * (0.4 + k * 0.7), hy - hr * (0.2 - k * 0.2)], [hx + sd * hr * (0.25 + k * 0.85), hy + hr * (0.75 + k * 0.3)], 14), (px, py, t) => {
      if (t < 0.15 || t > 0.92) return; const i = cel.idx(px, py); if (i >= 0 && cel.sid[i] === 1745) cel.off[i] = -1;
    });
  }
  for (let t = 0; t <= 1; t += 0.04) { const a = 3.75 + t * 0.95, px = hx + Math.cos(a) * hr * 0.72, py = hy + Math.sin(a) * hr * 0.62; const i = cel.idx(px, py); if (i >= 0 && cel.sid[i] === 1745 && cel.off[i] >= 0) cel.off[i] = 1; }
  // the parting: a thin line of scalp at the crown
  cel.stroke([[cr0[0], cr0[1]], [cr0[0] - hr * 0.08, cr0[1] + hr * 0.7]], (px, py) => { const i = cel.idx(px, py); if (i >= 0 && cel.mat[i] === V.THAIR) { cel.mat[i] = CM.SKIN; cel.fix[i] = 3; } });
}

function classroom(r) {
  const cel = new Cel(W, H);
  room(cel, r);
  const desks = [[-1.6, 5.2], [0.0, 5.2], [1.6, 5.2], [-1.6, 3.9], [1.45, 2.8], [-1.0, 2.5], [0.42, 1.62], [2.4, 4.1]];
  desks.sort((a, b) => b[1] - a[1]);           // far → near
  for (const [x, z] of desks) {
    const d = desk(cel, x, z);
    if (x === 1.45) student(cel, x, z, 'marcus', r);
    if (x === 0.42) tessBack(cel, x, z);
    chairBack(cel, d);
  }
  // the fluorescent fixture overhead, just in frame: the source, blown out
  const [fx0, fy0] = prj(-0.6, 3.15, 2.6), [fx1, fy1] = prj(1.9, 3.15, 3.4);
  cel.poly([[fx0, 0], [fx1, 0], [fx1 - 10, fy1 + 2], [fx0 + 10, fy1 + 2]], V.METAL, { z: dz(2.6), n: [0, 0.8, 0.6], sid: 90 });
  cel.poly([[fx0 + 14, 0], [fx1 - 14, 0], [fx1 - 18, fy1 - 2], [fx0 + 18, fy1 - 2]], V.TUBE, { z: dz(2.6) + 1, n: [0, 0, 1], sid: 91 });
  return cel;
}
const FLUOR = (k = 1) => light({ L: [0.05, -0.72, 0.69], amb: 0.24 * k + 0.04, key: 0.74 * k, shadow: 0.5, steps: 0, spec: 0.6,
  falloff: (x, y) => { const d = Math.hypot((x - 220) / 300, (y - 110) / 210); return clamp(1.1 - d * d * 0.7, 0.2, 1.05); } });
const CAMGRADE = { lit: '#f4fff0', litGain: 1, dark: '#7a9086', darkGain: 0.85, desat: 0.12 };

function render(cel, lt, grade = CAMGRADE, o = {}) {
  const lev = lightCel(cel, lt, { noCast: true });
  const sh = outline(cel, quantize(cel, lev), { lit: 0.7 });
  return packedToCanvas(packTones(cel, sh.tone), W, H, o.lut || patchLUT(gradeLUT(grade), false));
}

// ---------------------------------------------------------------------------------------- frame 0
/** The lobby, 9:51: "Everybody say Hollow Hell." The four of them under the Founder's portrait. */
function frame0() {
  const r = rng(1018);
  const cel = new Cel(W, H);
  // the lobby wall: cream above dark green wainscot, the marble floor at their feet
  cel.poly([[0, 0], [W, 0], [W, H], [0, H]], V.WALLC, { z: 0, n: [0, 0, 1], sid: 1 });
  cel.poly([[0, 168], [W, 168], [W, H], [0, H]], V.WALLG, { z: 0, n: [0, 0, 1], sid: 1 });
  cel.poly([[0, 165], [W, 165], [W, 169], [0, 169]], V.WOOD, { z: 1, n: [0, -0.6, 0.8], sid: 2 });
  for (let x = 20; x < W; x += 44) cel.stroke([[x, 172], [x, H]], (px, py) => cel.shift(px, py, -1));
  // the Founder: gilt frame, varnished umber ground, the seated mass
  const fx = 166, fy = 6, fw = 148, fh = 142;
  cel.poly([[fx, fy], [fx + fw, fy], [fx + fw, fy + fh], [fx, fy + fh]], V.GILT, { z: 4, n: [0, 0, 1], sid: 10 });
  for (let k = 0; k < 7; k++) {   // the frame's carved mouldings: bevels catching the light
    const inset = k + 1, nrm = k < 3 ? [-0.5, -0.5, 0.7] : k < 5 ? [0.5, 0.5, 0.7] : [0, 0, 1];
    cel.stroke([[fx + inset, fy + inset], [fx + fw - inset, fy + inset]], (x, y) => cel.put(x, y, V.GILT, { z: 4 + k * 0.1, n: [nrm[0] * 0.3, -0.7, 0.7], sid: 10 }));
    cel.stroke([[fx + inset, fy + inset], [fx + inset, fy + fh - inset]], (x, y) => cel.put(x, y, V.GILT, { z: 4 + k * 0.1, n: [-0.7, 0, 0.7], sid: 10 }));
    cel.stroke([[fx + fw - inset, fy + inset], [fx + fw - inset, fy + fh - inset]], (x, y) => cel.put(x, y, V.GILT, { z: 4 + k * 0.1, n: [0.7, 0, 0.7], sid: 10 }));
    cel.stroke([[fx + inset, fy + fh - inset], [fx + fw - inset, fy + fh - inset]], (x, y) => cel.put(x, y, V.GILT, { z: 4 + k * 0.1, n: [0, 0.7, 0.7], sid: 10 }));
  }
  const ix0 = fx + 9, iy0 = fy + 9, ix1 = fx + fw - 9, iy1 = fy + fh - 9;
  cel.poly([[ix0, iy0], [ix1, iy0], [ix1, iy1], [ix0, iy1]], V.UMBER, { z: 3, n: [0, 0, 1], sid: 11 });
  // the memorial board (right) and the brass plaque (left)
  cel.poly([[384, 38], [470, 38], [470, 106], [384, 106]], V.WOOD, { z: 4, n: [0, 0, 1], sid: 20 });
  for (let i = 0; i < 9; i++) { const x = 391 + (i % 3) * 26, y = 45 + Math.floor(i / 3) * 20; cel.poly([[x, y], [x + 18, y], [x + 18, y + 14], [x, y + 14]], V.PAPER, { z: 5, n: [0, 0, 1], sid: 21 + i, off: i % 2 ? -1 : 0 }); }
  cel.poly([[34, 64], [96, 64], [96, 104], [34, 104]], V.PLAQUE, { z: 4, n: [0, -0.3, 0.95], sid: 31 });
  for (let i = 0; i < 4; i++) cel.stroke([[40, 72 + i * 8], [90, 72 + i * 8]], (x, y) => cel.shift(x, y, -2));
  // their flashlights on the wall: warm pools; the rest of the lobby falls into the dark
  const lt = light({ L: [0, 0.15, 0.99], amb: 0.06, key: 0.95, shadow: 0, steps: 0,
    falloff: (x, y) => {
      let v = 0.18;
      for (const [px, py, rr] of [[120, 120, 120], [270, 110, 150], [400, 130, 110]]) { const d = Math.hypot(x - px, (y - py) * 1.2) / rr; v = Math.max(v, 1.05 - d * d * 0.8); }
      return clamp(v, 0, 1.05);
    } });
  const c = render(cel, lt, { lit: '#ffe4b8', litGain: 1.04, dark: '#3a3448', darkGain: 0.7, desat: 0.15, crush: 0.4, abyss: '#060508' });
  const x = ctxOf(c);
  paintFounder(x, ix0, iy0, ix1 - ix0, iy1 - iy0);
  // the four of them, waist up (their portraits' rigs), shoulders overlapping, heads at different
  // heights, Danny leaning in — and graded by the same warm flashlight as the wall behind them
  const cast = [['danny', 'smug', 76, 155, false, 0], ['marcus', 'soft_smile', 312, 143, true, 0], ['leah', 'smirk', 152, 150, false, 0], ['tess', 'smile', 232, 146, true, 0]];
  for (const [id, ex, bx, by, mir, lean] of cast) {
    let b = null; try { b = getPortrait(id, ex, { light: 'normal', mirror: mir }); } catch { b = null; }
    if (id === 'leah') dannyHand(x, bx + 42, by - 7);            // Danny's arm reaching behind her head, his V over it
    if (b) x.drawImage(gradeBust(b, bx, by, lean), bx, by);
  }
  return c;
}
/** A portrait bust lit like the wall: a warm flashlight tint, falling off in dithered steps toward the
 * frame's edges and the bottom; `lean` shears the head toward the group (pixel rows, no resampling). */
function gradeBust(src, bx, by, lean = 0) {
  const w = src.width, h = src.height, out = makeCanvas(w + Math.abs(lean), h), o = ctxOf(out);
  const sd = ctxOf(src).getImageData(0, 0, w, h).data, img = o.createImageData(w + Math.abs(lean), h), d = img.data, ow = w + Math.abs(lean);
  const pools = [[120, 120, 130], [270, 110, 160], [400, 130, 120]];
  const light = (fx, fy) => {
    let v = 1.02 - (((fx - 244) / 230) ** 2) * 0.55;
    for (const [px, py, rr] of pools) { const q = Math.hypot(fx - px, (fy - py) * 1.1) / rr; v = Math.max(v, 1.05 - q * q * 0.75); }
    return v;
  };
  // the face keeps the portrait's clean cel tones: one value for the whole head (no bands across it)
  const vHead = Math.min(1, light(bx + w / 2, by + h * 0.35) + 0.04);
  const steps = [1, 0.86, 0.72, 0.58, 0.44];
  for (let y = 0; y < h; y++) {
    const sh = Math.round(lean * Math.max(0, 1 - y / (h * 0.75)));
    for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 4; if (!sd[j + 3]) continue;
      // below the chin the chest falls into the dark in hard steps (a 1-px dithered seam between them)
      const chest = clamp((y - h * 0.62) / (h * 0.4));
      const v = vHead * (1 - chest * 0.5);
      const kk = (1 - v) * 4.4 + (chest > 0 ? (bay(bx + x, by + y) - 0.5) * 0.18 : 0);
      const f = steps[Math.max(0, Math.min(steps.length - 1, Math.floor(kk + 0.5)))];
      const oi = (y * ow + x + sh) * 4;
      d[oi] = Math.min(255, sd[j] * f * 1.02); d[oi + 1] = Math.min(255, sd[j + 1] * f * 0.93); d[oi + 2] = Math.min(255, sd[j + 2] * f * 0.78); d[oi + 3] = 255;
    }
  }
  o.putImageData(img, 0, 0);
  return out;
}

/**
 * The painted Founder (an old varnished oil, dark): a high carved chair whose arms the coat spills over,
 * the vast navy mass dragging past the seat to the frame's edge, sash, epaulettes, buttons; fat hands
 * on the chair arms (knuckles, a ring's glint); up at the top, in a pale dome of head, the small face —
 * half-lidded, gray chops and moustache.
 */
function paintFounder(ctx, X0, Y0, IW, IH) {
  const img = ctx.getImageData(X0, Y0, IW, IH), d = img.data;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= IW || y >= IH) return; const i = (y * IW + x) * 4, v = hex(c); d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = 255; };
  const P = {
    ground: ['#120c07', '#1a120a', '#22170c', '#2c1e10'], velvet: ['#1e070a', '#300c10', '#441418'], wood: ['#140c06', '#22160a', '#342210', '#4a3218'],
    navy: ['#07080f', '#0d1019', '#141a28', '#1e2638', '#2a3550'], sash: ['#300709', '#4c0e10', '#681a18', '#86281e'],
    gilt: ['#3e2c0e', '#6a5020', '#967434', '#bc9a50', '#d6ba72'], flesh: ['#3a2c26', '#5a4840', '#7c685a', '#9c8872', '#b8a488', '#ccbc9e'],
    gray: ['#2e2a26', '#4a4640', '#6c675e', '#8e887a', '#aaa494'], dark: '#0c0805',
  };
  const lx = (u) => u, ly = (v) => v;
  const cx = IW / 2;
  // the ground: dark umber, a dull glow behind the head
  for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) {
    const g = Math.hypot((x - cx + 4) / 46, (y - 30) / 36), t = clamp(1.25 - g) * 3 + (bay(x + X0, y + Y0) - 0.5) * 0.7;
    set(x, y, P.ground[Math.max(0, Math.min(3, Math.round(t)))]);
  }
  const fill = (inside, color) => { for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) { const c = inside(x + 0.5, y + 0.5); if (c) set(x, y, typeof c === 'string' ? c : color(x, y)); } };
  const inP = (pts) => (x, y) => inPoly(pts, x, y);
  // the chair: velvet back with gilt studs, carved dark arms with scroll ends
  const back = [[cx - 34, 10], [cx - 24, 3], [cx + 24, 3], [cx + 34, 10], [cx + 36, 78], [cx - 36, 78]];
  fill(inP(back), (x, y) => P.velvet[x < cx - 20 ? 2 : x > cx + 22 ? 0 : 1]);
  for (let t = 0; t <= 1.0001; t += 1 / 14) { const x = cx - 32 + t * 64, y = 9 - Math.sin(t * Math.PI) * 5.5; set(x, y, P.gilt[3]); }
  for (const sd of [-1, 1]) {
    const a0 = cx + sd * 30, a1 = cx + sd * 58;
    for (let x = Math.min(a0, a1); x <= Math.max(a0, a1); x++) for (let y = 74; y <= 80; y++) set(x, y, y === 74 ? P.wood[3] : y >= 79 ? P.wood[0] : P.wood[sd < 0 ? 2 : 1]);
    // the scroll at the arm's end
    const ex = a1; for (let k = 0; k < 7; k++) { set(ex + sd * (k < 4 ? 0 : 1), 73 + k, P.wood[k < 2 ? 3 : 1]); set(ex + sd * 1, 74 + k * 0.6, P.wood[2]); }
    for (let y = 81; y < IH; y++) { set(ex, y, P.wood[1]); set(ex - sd, y, P.wood[0]); }     // the arm's post
  }
  // the coat: a vast mass, wider than the chair, spilling over its arms and dragging past the seat —
  // the belly pushing forward into the light, the tails slumped over the seat's edge (no bell)
  const coat = [[cx - 12, 30], [cx - 30, 34], [cx - 40, 46], [cx - 43, 60], [cx - 46, 70], [cx - 55, 73], [cx - 57, 79], [cx - 50, 86], [cx - 49, 96], [cx - 55, 104], [cx - 52, 112], [cx - 58, 118], [cx - 54, 124],
    [cx + 64, 124], [cx + 60, 116], [cx + 51, 112], [cx + 54, 101], [cx + 50, 92], [cx + 54, 84], [cx + 58, 78], [cx + 55, 72], [cx + 45, 69], [cx + 43, 58], [cx + 39, 44], [cx + 30, 34], [cx + 12, 30]];
  fill(inP(coat), (x, y) => {
    const e = polyDist(coat, x + 0.5, y + 0.5), side = (x - cx) / 60;
    const belly = Math.hypot((x - cx - 2) / 42, (y - 90) / 24);                    // the belly, pushing into the light
    let k = side < -0.5 ? 2 : side < 0.4 ? 1 : 0;
    if (belly < 1) k = (x - cx) < 6 - (y - 90) * 0.4 && belly < 0.75 ? 3 : 2;
    if (belly >= 1 && belly < 1.15 && bay(x + X0, y + Y0) < 0.5) k = Math.max(k, 2);
    if (e < 1.6 && side < -0.2 && y < 104) k = 4;                                   // the lit edge
    // strain folds: shallow arcs across the belly, and the tails' long folds below it
    const arc = (y - 90 - ((x - cx) / 42) ** 2 * 10);
    if (belly < 0.95 && (Math.abs(arc + 12) < 0.6 || Math.abs(arc - 2) < 0.6 || Math.abs(arc - 13) < 0.6)) k = Math.max(0, k - 1);
    if (y > 108 && Math.abs(Math.sin((x - cx) * 0.3 + y * 0.03)) > 0.92) k = Math.max(0, k - 1);
    return P.navy[k];
  });
  // the sash: left shoulder to right hip, over the belly
  for (let y = 36; y < 108; y++) for (let x = 0; x < IW; x++) {
    const t = (y - 36) - (x - (cx - 28)) * 1.02; if (Math.abs(t) > 6) continue;
    if (!inPoly(coat, x + 0.5, y + 0.5)) continue;
    set(x, y, P.sash[Math.abs(t) > 4.8 ? 0 : t < -2 ? 3 : t < 1.5 ? 2 : 1]);
  }
  for (let k = 0; k < 7; k++) { const y = 42 + k * 10, x = cx + 3 + Math.max(0, k - 3) * 1.2; set(x, y, P.gilt[4]); set(x + 1, y, P.gilt[2]); set(x, y + 1, P.gilt[1]); }   // buttons, straining over the belly
  for (const sd of [-1, 1]) {
    // epaulettes: gilt crescents, bullion fringe
    for (let k = 0; k < 15; k++) { const x = cx + sd * (22 + k), y = 33 + Math.abs(k - 7) * 0.25; set(x, y, P.gilt[k < 7 === sd < 0 ? 4 : 2]); set(x, y + 1, P.gilt[1]); }
    for (let k = 0; k < 6; k++) for (let j = 0; j < 6; j++) set(cx + sd * (23 + k * 2.4), 35 + j, (j + k) % 3 === 0 ? P.gilt[1] : P.gilt[3 - (j > 3 ? 1 : 0)]);
    // his hands, draped over the chair's arms: the fat back of the hand lying on the scroll, four short
    // fat fingers hanging over its front edge, pressed together (only a dark line between them), a ring
    const hx = cx + sd * 52, hy = 73;
    for (let y = hy - 5; y <= hy; y++) for (let x = hx - 8; x <= hx + 8; x++) {
      const u = (x + 0.5 - hx) / 8.2, v = (y + 0.5 - hy) / 5; if (u * u + v * v > 1) continue;
      set(x, y, P.flesh[v < -0.55 ? 4 : u * sd < -0.45 ? 4 : u * sd > 0.55 ? 2 : 3]);
    }
    for (let k = 0; k < 4; k++) set(hx - 5 + k * 3.4, hy - 3, P.flesh[5]);                                  // the knuckles' shine
    for (let f = 0; f < 4; f++) {
      const fx = hx - 7 + f * 3.6, len = f === 1 || f === 2 ? 6 : 5;
      for (let j = 0; j < len; j++) {
        const tip = j === len - 1;
        set(fx, hy + 1 + j, P.flesh[tip ? 3 : 4]); set(fx + 1, hy + 1 + j, P.flesh[tip ? 2 : 3]); set(fx + 2, hy + 1 + j, P.flesh[tip ? 1 : 2]);
        if (j < len - 1) set(fx + 3, hy + 1 + j, P.flesh[0]);                                             // the line between two fingers
      }
      set(fx + 1, hy + 3, P.flesh[2]);                                                                        // a joint crease
    }
    { const rx = hx - 7 + 2 * 3.6; set(rx, hy + 2, P.gilt[4]); set(rx + 1, hy + 2, P.gilt[3]); set(rx + 2, hy + 2, P.gilt[1]); }   // the ring sunk in a finger, one glint
  }
  // the head: a bald, varnished dome, too big, its jowls sagging onto the collar; at the bottom of it, the
  // small face, set low, tight grey chops hugging its jaw (no hair anywhere else)
  const hcx = cx - 1, hcy = 17;
  const dome = (x, y) => ((x + 0.5 - hcx) / 15) ** 2 + ((y + 0.5 - hcy) / 15) ** 2;
  const jowl = (x, y, sd) => ((x + 0.5 - hcx - sd * 9.5) / 8) ** 2 + ((y + 0.5 - 27) / 5.6) ** 2;
  for (let y = 0; y < 34; y++) for (let x = 0; x < IW; x++) {
    const inD = dome(x, y) < 1, inJ = jowl(x, y, -1) < 1 || jowl(x, y, 1) < 1;
    if (!inD && !inJ) continue;
    const u = (x + 0.5 - hcx) / 15, v = (y + 0.5 - hcy) / 15;
    let k = 3;
    if (u > 0.45) k = 2; if (u > 0.78 || (inJ && !inD && u > 0.2)) k = 1;
    if (u < -0.25 && v < 0.2) k = 4;
    if (inJ && !inD && v > 0.85) k = Math.min(k, 2);
    set(x, y, P.flesh[k]);
  }
  // the varnish's sheen on the dome: a hard curved streak, upper left
  for (let t = 0; t <= 1; t += 0.06) { const a = 3.55 + t * 0.9, x = hcx + Math.cos(a) * 10.5, y = hcy + Math.sin(a) * 10.5; set(x, y, P.flesh[5]); if (t > 0.25 && t < 0.75) set(x + 1, y + 1, P.flesh[5]); }
  for (let x = hcx - 14; x <= hcx + 14; x++) { const y = 32 + Math.round(((x - hcx) / 14) ** 2 * 1.5); set(x, y, P.flesh[0]); }   // the jowls' crease over the collar
  // the collar: standing, navy, a gilt edge
  for (let x = hcx - 13; x <= hcx + 13; x++) { set(x, 33 + (Math.abs(x - hcx) > 10 ? 1 : 0), P.gilt[3]); set(x, 35, P.navy[2]); }
  // the face: smaller, smoother, paler than the head, set low in it
  const fcx = hcx, fcy = 22;
  for (let y = fcy - 6; y <= fcy + 6; y++) for (let x = fcx - 5; x <= fcx + 5; x++) {
    const u = (x + 0.5 - fcx) / 5.2, v = (y + 0.5 - fcy) / 6.6; if (u * u + v * v >= 1) continue;
    set(x, y, P.flesh[u < -0.2 ? 5 : u > 0.5 ? 3 : 4]);
  }
  for (let y = fcy - 6; y <= fcy + 6; y++) for (let x = fcx - 6; x <= fcx + 6; x++) {          // its rim, pressed into the dome
    const u = (x + 0.5 - fcx) / 5.2, v = (y + 0.5 - fcy) / 6.6, e = u * u + v * v;
    if (e >= 1 && e < 1.35 && v < 0.4) set(x, y, P.flesh[2]);
  }
  for (const sd of [-1, 1]) {
    // tight grey chops hugging the jaw, from the temple to the moustache
    for (let y = fcy - 3; y <= fcy + 4; y++) { const x = fcx + sd * (5 - (y > fcy + 2 ? 1 : 0)); set(x, y, P.gray[sd < 0 ? 3 : 2]); set(x + sd, y, P.gray[1]); }
    // half-lidded eyes: the heavy lid, the lash line, a sliver of iris
    const ex = fcx + sd * 2, ey = fcy - 2;
    set(ex, ey - 1, P.flesh[3]); set(ex - 1, ey, P.flesh[2]); set(ex, ey, P.dark); set(ex + 1, ey, P.flesh[2]);
    set(ex, ey - 3, P.gray[3]); set(ex + sd, ey - 3, P.gray[2]);                                    // thin grey brows
  }
  set(fcx, fcy, P.flesh[5]); set(fcx, fcy + 1, P.flesh[4]); set(fcx + 1, fcy + 1, P.flesh[2]);             // the nose
  for (let k = -3; k <= 3; k++) { const y = fcy + 3 + (Math.abs(k) > 1 ? 1 : 0); set(fcx + k, y, P.gray[Math.abs(k) < 2 ? 4 : 3]); if (Math.abs(k) === 3) set(fcx + k, y + 1, P.gray[2]); }   // the moustache, drooping
  set(fcx - 1, fcy + 5, P.flesh[2]); set(fcx, fcy + 5, P.flesh[2]);                                          // the mouth, closed
  // varnish: yellowed, crazed (sparse)
  for (let i = 0; i < d.length; i += 4) { d[i] = Math.min(255, d[i] * 1.04); d[i + 2] = d[i + 2] * 0.86; }
  for (let k = 0; k < 40; k++) { const x = (k * 37 + 11) % IW, y = (k * 53 + 7) % IH, i = (y * IW + x) * 4; d[i] *= 0.82; d[i + 1] *= 0.82; d[i + 2] *= 0.82; }
  ctx.putImageData(img, X0, Y0);
  void lx; void ly;
}

/** Danny's arm reaching behind Leah's head (his green sleeve), his hand making a V over it: a fist of
 * curled fingers with the thumb across them, knuckles on top, two fingers up and apart. */
function dannyHand(x, cx, top) {
  const SK = ['#4a2418', '#7c4634', '#a8664c', '#cc8a6a', '#e8ae8c'], SL = ['#0e1a12', '#1a2c1e', '#26402a', '#345638'];
  const px = (xx, yy, c) => { x.fillStyle = c; x.fillRect(Math.round(xx), Math.round(yy), 1, 1); };
  // the forearm in its sleeve, from his shoulder (left, behind Leah) up to the wrist
  for (let t = 0; t <= 1; t += 0.015) {
    const ax = cx - 40 + t * 36, ay = top + 66 - t * 46, hw = 5 - t * 1.2;
    for (let k = -hw; k <= hw; k++) px(ax + k * 0.45, ay + k * 0.9, SL[k < -hw + 1.2 ? 3 : k > hw - 1.2 ? 0 : k < 0 ? 2 : 1]);
  }
  // the fist (back of the hand toward us): curled ring & little fingers, the thumb across them
  const fx = cx - 5, fy = top + 12;
  for (let yy = 0; yy < 9; yy++) for (let xx = 0; xx < 11; xx++) {
    const e = ((xx - 5) / 5.6) ** 2 + ((yy - 4.2) / 4.6) ** 2; if (e > 1) continue;
    px(fx + xx, fy + yy, SK[e > 0.75 ? (xx > 5 ? 1 : 2) : xx < 4 ? 3 : 2]);
  }
  for (const [xx, yy] of [[2, 1], [5, 0], [8, 1]]) { px(fx + xx, fy + yy, SK[4]); px(fx + xx + 1, fy + yy, SK[3]); }   // knuckles
  for (let k = 0; k < 7; k++) px(fx + 2 + k, fy + 5 + (k > 4 ? 1 : 0), SK[1]);                                       // the curled fingers' fold
  for (let k = 0; k < 6; k++) { px(fx + 1 + k, fy + 6, SK[3]); px(fx + 1 + k, fy + 7, SK[2]); }                     // the thumb lying across
  px(fx + 7, fy + 6, SK[4]); px(fx + 7, fy + 7, SK[3]);                                                             // its tip
  // the V: index and middle fingers, up and apart, a crease at each joint, nails at the tips
  const finger = (x0, y0, x1, y1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= n; i++) {
      const t = i / n, ax = x0 + (x1 - x0) * t, ay = y0 + (y1 - y0) * t;
      px(ax - 1, ay, SK[3]); px(ax, ay, SK[2]); px(ax + 1, ay, SK[1]);
      if (i === Math.round(n * 0.45) || i === Math.round(n * 0.75)) { px(ax - 1, ay, SK[2]); px(ax, ay, SK[1]); }
    }
    px(x1 - 1, y1 - 1, SK[2]); px(x1, y1 - 1, SK[3]); px(x1, y1, SK[4]);
  };
  finger(fx + 3, fy + 1, fx - 2, fy - 15);
  finger(fx + 7, fy + 1, fx + 11, fy - 14);
}

// ---------------------------------------------------------------------------------------- frames 1–3
let roomCel = null;
function baseRoom() { return roomCel || (roomCel = classroom(rng(1031))); }
const roomCopy = () => baseRoom().clone();
function frame1() { return render(baseRoom(), FLUOR(1)); }

/** The edge of something enormous, close to the lens and against the light: hanging navy wool,
 * soft drapery folds, a brass button glinting in a fold, the dark crimson sash, its fringe. */
function mass(cel, x0) {
  const edge = (y) => x0 + 70 - Math.pow(Math.max(0, y) / H, 1.4) * 96 + Math.sin(y * 0.07) * 4 + Math.sin(y * 0.19) * 2;
  const pts = []; for (let y = -4; y <= H + 4; y += 4) pts.push([edge(y), y]); pts.push([W + 10, H + 4], [W + 10, -4]);
  // relief: the flank's dome plus broad hanging folds that spread as they fall
  domePoly(cel, pts, CM.WOOL, { R: 70, hgt: 90, z: 700, sid: 300, tilt: [0.1, 0.25],
    zf: (x, y, d) => 700 + 90 * Math.sqrt(Math.min(d, 70) / 70) + Math.sin((x - x0) * 0.11 - y * 0.012 * ((x - x0) / 120)) * 7 + Math.sin((x - x0) * 0.043 + 1) * 5 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (cel.mat[i] !== CM.WOOL) continue;
    cel.lum[i] = -0.22;                                                 // its own shadow: the light is behind it
    if (fbm(x, y, 20, 41) > 0.62) cel.mat[i] = CM.WOOL_W;
    if (h01(x >> 1, y, 42) < 0.06) cel.off[i] -= 1;                     // the weave
  }
  // the sash, low across it: dark crimson, pleated
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = 40 + (x - x0) * 0.95 + Math.sin(x * 0.04) * 4, d = y - c;
    if (Math.abs(d) > 26) continue;
    const i = y * W + x; if (cel.mat[i] !== CM.WOOL && cel.mat[i] !== CM.WOOL_W) continue;
    const pleat = Math.sin((y - (x - x0) * 0.95) * 0.22);
    cel.mat[i] = V.SASH; cel.sid[i] = 310; cel.z[i] += 3; cel.lum[i] = -0.12;
    cel.off[i] = Math.abs(d) > 23 ? -2 : pleat > 0.7 ? 1 : pleat < -0.75 ? -1 : 0;
  }
  // a brass button sunk in a fold: only its lower half, and one hard glint
  const bx = Math.round(x0 + 58), by = 214, br = 6;
  for (let y = by - br - 2; y <= by + br + 2; y++) for (let x = bx - br - 2; x <= bx + br + 2; x++) {
    const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by) / br, i = cel.idx(x, y);
    if (i < 0 || (cel.mat[i] !== CM.WOOL && cel.mat[i] !== CM.WOOL_W)) continue;
    const over = by - 1 + Math.sin((x - bx) * 0.4);
    if (d > 1) { if (d < 1.35 && y > over) cel.fix[i] = 0; continue; }
    if (y < over) continue;
    const dome = Math.sqrt(1 - d * d);
    cel.put(x, y, d > 0.7 && d < 0.86 ? CM.VERD : CM.BRASS, { z: cel.z[i] + 3, n: [(x - bx) / br, (y - by) / br, dome + 0.3], sid: 301, fix: -1, off: y < over + 2 ? -2 : 0 });
  }
  // the bullion fringe swinging at the sash's end
  for (let k = 0; k < 11; k++) {
    const fx = Math.round(x0 + 118 + k * 6), fy = 214 + (k % 3) + k * 2;
    for (let y = fy; y < H; y++) {
      const xx = fx + Math.round(Math.sin(y * 0.15 + k) * 1.2);
      for (let w2 = 0; w2 < 3; w2++) cel.put(xx + w2, y, ((y >> 1) + w2) % 3 === 0 ? CM.GOLD : V.SASH, { z: 1000, n: [(w2 - 1) * 0.6, 0, 1], sid: 320 + k, fix: -1, off: 0 });
    }
  }
}
function frame2() {
  const cel = roomCopy();
  mass(cel, 300);
  return render(cel, { ...FLUOR(0.85), rim: [-0.95, -0.3, 0.75] });
}

/** The hand settling on Leah's shoulder — her gray cardigan in the near frame. */
function frame3() {
  const cel = roomCopy();
  mass(cel, 390);
  // Leah's shoulder, close: her charcoal cardigan — a soft knit, one fold where it bunches at the seam
  const sh = new HField(W, H, 0.06);
  sh.blob(404, 300, 176, 118, 130, { base: 820, mat: V.KNIT, p: 0.55 });
  sh.finalize();
  sh.fold([[262, 236], [330, 214], [420, 205], [492, 214]], 9, 7);                 // where the sleeve's seam bunches the knit
  cel.fromHF(sh, { sid: 400, mode: 'any' });
  // the knit: soft rib columns following the curve of the shoulder, broken (no stripes), only where it's lit
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (cel.mat[i] !== V.KNIT) continue;
    const c = x - (y - 190) * 0.18 + Math.sin(y * 0.09) * 2.5;
    const col = ((Math.floor(c / 4) % 2) + 2) % 2, row = Math.floor((y + (col ? 2 : 0)) / 4);
    if (((c % 4) + 4) % 4 < 1 && (row & 1) === 0) cel.off[i] -= 1;                // the rib's valley, every other stitch row
  }
  // her bob: a few black locks lying over the shoulder's left edge
  for (let k = 0; k < 4; k++) {
    const x0 = 262 + k * 6, y0 = 206 + k * 4;
    cel.stroke(quad([x0, y0], [x0 - 4 + k, y0 + 30], [x0 - 14 + k * 2, 274], 16), (x, y, tt) => {
      const wv = Math.max(2, Math.round((k === 1 ? 7 : 5) * (1 - tt * 0.45)));
      for (let w2 = 0; w2 < wv; w2++) {
        const i = cel.idx(x + w2, y); if (i < 0) continue;
        const onShoulder = cel.mat[i] === V.KNIT || cel.mat[i] === V.BEANIE;
        if (!onShoulder && !(cel.matAt(x + w2 + 3, y) === V.KNIT)) continue;
        cel.put(x + w2, y, V.BEANIE, { z: 960 + k, n: [(w2 - wv / 2) * 0.35 - 0.3, -0.25, 1], sid: 450 + k, fix: -1, off: w2 === 1 && tt > 0.15 && tt < 0.7 ? 2 : 0 });
      }
    });
  }
  // the hand, from above and behind her, fingers curling over the shoulder toward the lens
  const S = sculptHand(cel, { C: [368, 150], ang: Math.atan2(0.95, -0.32), s: 0.88, curl: 0.55, z0: 900, side: -1, rings: { 3: 'signet', 2: 'stone' },
    bends: [[0.1, 0.15, 0.1], [0.08, 0.12, 0.08], [0.12, 0.16, 0.1], [0.18, 0.24, 0.14]] });
  sculptCuff(cel, S, { back: -330, rise: 80 });
  detailHand(cel, S, { seed: 77, L: [0.05, -0.72, 0.69], mottle: [], spots: [[-110, -18, 2, 1.6], [-90, 20, 1.6, 1.3]], hairs: 4 });
  paintRings(cel, S, { L: [0.05, -0.72, 0.69] });
  paintNails(cel, S, { L: [0.05, -0.72, 0.69], long: 0.3 });
  // at this distance the nails mustn't be the brightest thing (they'd read as claws): two steps down
  for (let i = 0; i < W * H; i++) if (cel.mat[i] === CM.NAIL && cel.fix[i] >= 0) cel.fix[i] = Math.max(1, cel.fix[i] - 2);
  const lt = FLUOR(0.62);
  return render(cel, { ...lt, rim: [-0.95, -0.3, 0.6], falloff: (x, y) => lt.falloff(x, y) * (1 - clamp((x - 300) / 300) * 0.35) });
}

// ---------------------------------------------------------------------------------------- frame 4
function frame4(src) {
  // the camera wrenched sideways: tilted, hard ghost copies trailing the motion (no soft blur)
  const out = makeCanvas(W, H), x = ctxOf(out);
  const s = ctxOf(src).getImageData(0, 0, W, H).data, img = x.createImageData(W, H), d = img.data;
  const a = -0.42, ca = Math.cos(a), sa = Math.sin(a), cx = W / 2 + 40, cy = H / 2;
  const taps = [[0, 0.55], [14, 0.27], [30, 0.18]];
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    let rr = 0, gg = 0, bb = 0;
    const jit = ((y >> 2) * 7 % 5) * 2;
    for (const [off, wgt] of taps) {
      const u = (xx - cx + off + jit) * ca - (y - cy) * sa + cx, v = (xx - cx + off + jit) * sa + (y - cy) * ca + cy;
      const ui = Math.max(0, Math.min(W - 1, Math.round(u))), vi = Math.max(0, Math.min(H - 1, Math.round(v))), j = (vi * W + ui) * 4;
      rr += s[j] * wgt; gg += s[j + 1] * wgt; bb += s[j + 2] * wgt;
    }
    const o = (y * W + xx) * 4, k = 0.78;
    d[o] = Math.round(rr * k / 12) * 12; d[o + 1] = Math.round(gg * k / 12) * 12; d[o + 2] = Math.round(bb * k / 12) * 12; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return out;
}

// ---------------------------------------------------------------------------------------- frame 5
// his head at the lens: an uneven dough (no second pair of "eyes" flanking the face)
function doughAtLens({ B }) {
  B(0, -6, 60, 60, 54, 0.4);
  B(-6, -37, 30, 14, 52, 0.6); B(14, -31, 22, 12, 55, 0.6);
  B(-1, -19.5, 25, 8, 62, 0.6);                                       // the brow roll's swell
  B(-22, 12, 13, 22, 60, 0.5); B(23, 9, 14, 24, 59, 0.5);            // the cheeks' swell (uneven)
  B(-30, 40, 30, 14, 52, 0.45); B(38, -2, 12, 30, 56, 0.5);           // uneven: a slope below-left, a heavy roll at the right
  B(0, 30, 18, 9, 59, 0.5);                                           // the jowls' swell
}
// stacked horizontal creases (no radiating marks, no vertical cheek rims)
function creasesAtLens({ fold }) {
  fold([[-24, -12.6], [-12, -14], [0, -14.4], [12, -14], [24, -12.2]], 1.4, 3);
  for (const [u0, u1, v] of [[-34, -14, 2], [-35, -14, 12], [-31, -13, 22]]) fold([[u0, v - 1.6], [(u0 + u1) / 2, v + 0.8], [u1, v]], 1.2, 2.6);
  for (const [u0, u1, v] of [[14, 34, 6], [14, 36, 18]]) fold([[u0, v], [(u0 + u1) / 2, v + 1], [u1, v - 1.8]], 1.2, 2.6);
  fold([[-15, 26.5], [-5, 28.4], [6, 28.4], [16, 26.2]], 1.3, 2.6);
  fold([[-26, 34], [-9, 37], [8, 37.2], [27, 34.2]], 1.4, 2.8);
}
function frame5() {
  // his face at the lens: the small serene face, smiling now, lit by the camcorder's lamp (a little from
  // the side, so the nose is a plane, not an outline), barrel-distorted
  const P = { ...FACE_EXPR.looking, lidL: 0.5, lidR: 0.46, brow: 0.55, eyeSmile: 0.4, gazeL: [0.02, 0.15], gazeR: [-0.04, 0.12], cx: 236, cy: 112, s: 6.4, seed: 1841, chins: 2, collar: false,
    noseK: 0.78, noseTip: 0.78, chinK: 0.35, lowerLum: -0.6, mouthY: 12.5, noStretch: true, pitDepth: 8, dough: doughAtLens, doughFolds: creasesAtLens };
  const cel = headCel(P, { sweat: 8, hairs: 18, L: [-0.38, 0.1, 0.92] });
  const lt = light({ L: [-0.38, 0.1, 0.92], amb: 0.06, key: 0.95, shadow: 0.5, steps: 20, spec: 0.45,
    falloff: (x, y) => { const d = Math.hypot((x - 236) / 250, (y - 128) / 190); return clamp(1.15 - d * d * 1.15, 0.05, 1.1); } });
  const lev = lightCel(cel, lt);
  liftRing(cel, lev);
  const sh = outline(cel, quantize(cel, lev), { lit: 0.6 });
  const flat = packedToCanvas(packTones(cel, sh.tone), W, H, gradeLUT({ lit: '#f6fff4', litGain: 1.02, dark: '#5e7266', darkGain: 0.8, desat: 0.15, crush: 0.5, abyss: '#020203' }));
  const sd = ctxOf(flat).getImageData(0, 0, W, H).data;
  const out = makeCanvas(W, H), x = ctxOf(out), img = x.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    const nx = (xx - W / 2) / (W / 2), ny = (y - H / 2) / (W / 2), r2 = nx * nx + ny * ny, k = 1 - 0.22 * r2;
    const u = Math.round(W / 2 + nx * k * W / 2), v = Math.round(H / 2 + ny * k * W / 2);
    const o = (y * W + xx) * 4;
    d[o + 3] = 255;
    if (u < 0 || v < 0 || u >= W || v >= H) continue;
    const j = (v * W + u) * 4;
    if (sd[j + 3]) { d[o] = sd[j]; d[o + 1] = sd[j + 1]; d[o + 2] = sd[j + 2]; } else { d[o] = 2; d[o + 1] = 2; d[o + 2] = 3; }
  }
  x.putImageData(img, 0, 0);
  return out;
}

let f3cache = null;
export function buildVhsFrame(f) {
  if (f === 0) return frame0();
  if (f === 1) return frame1();
  if (f === 2) return frame2();
  if (f === 3) return (f3cache = f3cache || frame3());
  if (f === 4) return frame4(f3cache = f3cache || frame3());
  return frame5();
}
