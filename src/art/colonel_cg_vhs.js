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
import { Cel, celMat, light, lightCel, quantize, outline, gradeLUT, packTones, packedToCanvas, domePoly, bay, h01, vn, fbm, clamp, lerp, quad } from './colonel_cg_cel.js';
import { CM, sculptHand, detailHand, paintNails, paintRings, sculptCuff, patchLUT } from './colonel_cg_handkit.js';
import { headCel, liftRing, FM } from './colonel_cg_face.js';
import { getPortrait } from './portraits.js';
import { makeCanvas, ctxOf, rng } from './util.js';

const W = 480, H = 270;
export const VHS_FRAMES = 6;

// ---------------------------------------------------------------------------------------- materials
const V = {
  CEIL: 80, WALLC: 81, WALLG: 82, CHALK: 83, WOOD: 84, GLASS: 85, PAPER: 86, DARK: 87, FLOOR1: 88, FLOOR2: 89,
  METAL: 90, CHAIR: 91, OLIVE: 92, BEANIE: 93, DSKIN: 94, JEANS: 95, TUBE: 96, CARD: 97, SASH: 98, MARBLE: 99,
  GILT: 100, UMBER: 101, NAVYP: 102, VELVET: 103, FLESHP: 104, PLAQUE: 105, CHALKW: 106,
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
celMat(V.CARD, { ramp: ['#08080a', '#18181c', '#2e2e34', '#48484e', '#64646a', '#828286', '#a4a4a6'], th: T7, line: 0, lineLit: 1, gap: 6 });
celMat(V.SASH, { ramp: ['#0e0204', '#2c060c', '#540c18', '#7e1424', '#a42234', '#c8424a'], th: T6, line: 0, gap: 3 });
celMat(V.MARBLE, { ramp: ['#0a0a0a', '#1a1a1a', '#2e2c2a', '#46423e', '#605a54', '#7c766e'], th: T6, dith: 0.04, seam: false });
celMat(V.GILT, { ramp: ['#120c04', '#30220a', '#5a4214', '#86662a', '#b08c44', '#d6b468', '#f0d898'], th: T7, line: 0, gap: 2 });
celMat(V.UMBER, { ramp: ['#060403', '#120c08', '#22160e', '#341f12', '#4a2e1a', '#644024'], th: T6, dith: 0.05, seam: false });
celMat(V.NAVYP, { ramp: ['#030408', '#080b16', '#0f1428', '#18203c', '#243052', '#344470'], th: T6, line: 0, gap: 2 });
celMat(V.VELVET, { ramp: ['#080203', '#180508', '#2c0a10', '#44101a', '#5e1824', '#7a2230'], th: T6 });
celMat(V.FLESHP, { ramp: ['#100c0a', '#2c2420', '#52443c', '#7c6a5e', '#a69282', '#cab8a6'], th: T6, line: 0, gap: 2 });
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
/** A student slumped forward, head down on folded arms, seen from behind (clean silhouettes). */
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
  if (tess) {
    // denim: the yoke seam across the shoulders, two pleat seams down the back, copper stitching
    const [yl, yly] = at(-0.21, 0.82, -0.32), [yr, yry] = at(0.21, 0.82, -0.32);
    cel.stroke(quad([yl, yly], [(yl + yr) / 2, yly + bs * 0.03], [yr, yry], 20), (px, py) => { const i = cel.idx(px, py); if (i >= 0 && cel.mat[i] === CM.DENIM) { cel.mat[i] = CM.DENIM_D; const j = cel.idx(px, py + 2); if (j >= 0 && cel.mat[j] === CM.DENIM && (px & 1)) cel.mat[j] = CM.STITCH; } });
    for (const sd of [-1, 1]) { const [p0x, p0y] = at(sd * 0.1, 0.81, -0.33), [p1x, p1y] = at(sd * 0.12, 0.6, -0.45); cel.stroke([[p0x, p0y + 3], [p1x, p1y]], (px, py) => { const i = cel.idx(px, py); if (i >= 0 && cel.mat[i] === CM.DENIM) cel.mat[i] = CM.DENIM_D; }); }
    // copper hair: parted at the crown, falling forward off the bowed head and over her collar
    const crown = [hx + hr * 0.1, hy - hr * 0.7];
    for (let k = 0; k < 12; k++) {
      const t = k / 11, a = Math.PI * (0.18 + t * 0.64);           // fan from the crown, downward
      const L = hr * (1.25 + r() * 0.35) + (Math.abs(t - 0.5) > 0.3 ? hr * 0.4 : 0);
      const p0 = [crown[0] + Math.cos(a) * hr * 0.15, crown[1] + Math.sin(a) * hr * 0.1];
      const p2 = [crown[0] + Math.cos(a) * L * 1.05, crown[1] + Math.sin(a) * L];
      const p1 = [(p0[0] + p2[0]) / 2 + Math.cos(a) * hr * 0.15, (p0[1] + p2[1]) / 2 - hr * 0.1];
      const pts = quad(p0, p1, p2, 10), w0 = hr * (0.28 + r() * 0.08);
      for (let j = 0; j < pts.length; j++) {
        const tt = j / (pts.length - 1), wv = w0 * (tt < 0.65 ? 1 : Math.max(0.15, 1 - (tt - 0.65) / 0.35));
        const [cx, cy] = pts[j];
        for (let yy = Math.floor(cy - wv); yy <= cy + wv; yy++) for (let xx = Math.floor(cx - wv); xx <= cx + wv; xx++) {
          if (Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy) > wv) continue;
          const i = cel.idx(xx, yy); if (i < 0) continue;
          const onHead = cel.mat[i] === CM.HAIR, zz2 = onHead ? cel.z[i] + 1 : zz(-0.3) + bs * 0.13;
          if (!onHead && cel.mat[i] !== jacket && cel.mat[i] !== CM.SKIN && cel.mat[i] !== CM.DENIM_D && cel.mat[i] !== CM.STITCH) continue;
          const q = ((xx + 0.5 - cx) * Math.sin(a) - (yy + 0.5 - cy) * Math.cos(a)) / wv;
          cel.put(xx, yy, CM.HAIR, { z: zz2 + (1 - tt), n: [q * 0.5 + Math.cos(a) * 0.3, Math.sin(a) * 0.3 - 0.3, 1], sid: 1800 + k, fix: -1, off: 0 });
        }
      }
    }
    // the part: a pale line at the crown
    cel.stroke([[crown[0] - hr * 0.1, crown[1] - hr * 0.2], [crown[0] + hr * 0.05, crown[1] + hr * 0.25]], (px, py) => { const i = cel.idx(px, py); if (i >= 0 && cel.mat[i] === CM.HAIR) { cel.mat[i] = CM.SKIN; cel.fix[i] = 4; } });
  } else {
    // Marcus: the rib knit of the beanie, its fold; headphones around his neck
    for (let y = Math.floor(hy - hr); y < hy + hr; y++) for (let x2 = Math.floor(hx - hr); x2 < hx + hr; x2++) if (cel.matAt(x2, y) === V.BEANIE && (x2 & 1)) cel.shift(x2, y, -1);
    cel.stroke([[hx - hr * 0.95, hy + hr * 0.35], [hx + hr * 0.95, hy + hr * 0.35]], (px, py) => cel.shift(px, py, 1));
    const hp = quad([nlx - bs * 0.02, nly + 2], [(nlx + nrx) / 2, nly + bs * 0.07], [nrx + bs * 0.02, nry + 2], 16);
    for (const [cx, cy] of hp) for (let k = 0; k < 2; k++) cel.put(cx, cy + k, V.DARK, { z: zz(-0.3) + bs * 0.2, n: [0, -0.5, 0.8], sid: 1730 });
    for (const [cx, cy] of [hp[0], hp[hp.length - 1]]) for (let k = -2; k <= 2; k++) cel.put(cx + k, cy + 1, V.METAL, { z: zz(-0.3) + bs * 0.21, sid: 1731 });
    // field jacket: the back seam, a pocket flap at the shoulder
    const [m0x, m0y] = at(0, 0.88, -0.3), [m1x, m1y] = at(0, 0.6, -0.45);
    cel.stroke([[m0x, m0y + 4], [m1x, m1y]], (px, py) => { const i = cel.idx(px, py); if (i >= 0 && cel.mat[i] === V.OLIVE) cel.off[i] -= 1; });
  }
  // weave texture
  for (let y = 0; y < H; y++) for (let x2 = 0; x2 < W; x2++) { const i = y * W + x2; if ((cel.mat[i] === CM.DENIM || cel.mat[i] === V.OLIVE) && cel.sid[i] >= sidB && cel.sid[i] < sidB + 10 && ((x2 * 2 + y) % 5 === 0)) cel.off[i] -= 1; }
}

function classroom(r) {
  const cel = new Cel(W, H);
  room(cel, r);
  const desks = [[-1.6, 5.2], [0.0, 5.2], [1.6, 5.2], [-1.6, 3.9], [1.45, 2.8], [-1.0, 2.5], [0.42, 1.62], [2.4, 4.1]];
  desks.sort((a, b) => b[1] - a[1]);           // far → near
  for (const [x, z] of desks) {
    const d = desk(cel, x, z);
    if (x === 1.45) student(cel, x, z, 'marcus', r);
    if (x === 0.42) student(cel, x, z, 'tess', r);
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
  const cx = (ix0 + ix1) / 2;
  for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) { const d = Math.hypot((x - cx) / 50, (y - iy0 - 40) / 40); if (d < 1) cel.shift(x, y, d < 0.6 ? 2 : 1); }   // the halo behind him
  // the painted Founder, lit from the upper left as portraits are: the carved chair, the vast seated
  // coat spilling past its arms, the sash, a row of buttons, epaulettes, his hands on the arms, and
  // up at the top of all that, the small pale face
  const tY = iy0 + 14, bY = iy1 - 4;
  domePoly(cel, [[cx - 40, tY + 6], [cx - 34, tY - 4], [cx + 34, tY - 4], [cx + 40, tY + 6], [cx + 44, bY - 30], [cx - 44, bY - 30]], V.VELVET, { R: 6, hgt: 3, z: 3.4, sid: 12 });
  for (let x = cx - 33; x <= cx + 33; x += 4) cel.put(x, tY - 4, V.GILT, { z: 3.6, sid: 12, fix: 4 });
  for (const sd of [-1, 1]) domePoly(cel, [[cx + sd * 62, bY - 34], [cx + sd * 42, bY - 34], [cx + sd * 42, bY - 28], [cx + sd * 62, bY - 28]], V.WOOD, { R: 2, hgt: 2, z: 3.6, sid: 19 });
  const body = smoothPoly([[cx - 16, tY + 26], [cx - 34, tY + 34], [cx - 50, tY + 56], [cx - 58, tY + 86], [cx - 62, bY - 10], [cx - 50, bY], [cx + 50, bY], [cx + 62, bY - 10], [cx + 58, tY + 86], [cx + 50, tY + 56], [cx + 34, tY + 34], [cx + 16, tY + 26]], 4);
  domePoly(cel, body, V.NAVYP, { R: 26, hgt: 18, z: 4, sid: 13, tilt: [-0.25, -0.2] });
  for (let k = 0; k < 6; k++) { const x0 = cx - 44 + k * 17; cel.stroke(quad([x0, tY + 60], [x0 + 4, tY + 90], [x0 - 2 + (k - 2.5) * 3, bY - 2], 12), (x, y) => cel.shift(x, y, -1)); }   // the coat's folds
  // the sash, left shoulder to right hip
  for (let y = tY + 28; y < bY; y++) for (let x = cx - 60; x < cx + 60; x++) {
    const d = (y - (tY + 34)) - (x - (cx - 30)) * 0.95; if (Math.abs(d) > 7) continue;
    const i = cel.idx(x, y); if (i < 0 || cel.mat[i] !== V.NAVYP) continue;
    cel.mat[i] = V.SASH; cel.off[i] = Math.abs(d) > 5.5 ? -1 : d < -2 ? 1 : 0; cel.sid[i] = 14;
  }
  for (let k = 0; k < 6; k++) { const y = tY + 38 + k * 12; cel.put(cx + 2, y, V.GILT, { z: 41, sid: 15, fix: 5 }); cel.put(cx + 3, y, V.GILT, { z: 41, sid: 15, fix: 3 }); cel.put(cx + 2, y + 1, V.GILT, { z: 41, sid: 15, fix: 2 }); }
  for (const sd of [-1, 1]) {
    domePoly(cel, capsule(cx + sd * 22, tY + 30, 4, cx + sd * 40, tY + 34, 5), V.GILT, { R: 3, hgt: 3, z: 42, sid: 16 + (sd > 0 ? 1 : 0) });
    for (let k = 0; k < 5; k++) cel.stroke([[cx + sd * (24 + k * 4), tY + 36], [cx + sd * (24 + k * 4), tY + 42]], (x, y) => cel.put(x, y, V.GILT, { z: 42, sid: 16, fix: (y & 1) ? 2 : 4 }));
    domePoly(cel, capsule(cx + sd * 50, bY - 36, 6, cx + sd * 56, bY - 33, 6), V.FLESHP, { R: 4, hgt: 4, z: 43, sid: 18 + (sd > 0 ? 1 : 0) });   // his hands on the chair arms
    cel.put(cx + sd * 51, bY - 37, V.GILT, { z: 44, sid: 19, fix: 5 });
  }
  // the high collar, and the small pale face set too far up in all that
  domePoly(cel, [[cx - 14, tY + 22], [cx + 14, tY + 22], [cx + 12, tY + 30], [cx - 12, tY + 30]], V.NAVYP, { R: 3, hgt: 3, z: 44, sid: 20 });
  cel.stroke([[cx - 13, tY + 22], [cx + 13, tY + 22]], (x, y) => cel.put(x, y, V.GILT, { z: 45, sid: 20, fix: 4 }));
  domePoly(cel, smoothPoly([[cx - 7, tY + 6], [cx - 8, tY + 13], [cx - 6, tY + 20], [cx, tY + 23], [cx + 6, tY + 20], [cx + 8, tY + 13], [cx + 7, tY + 6], [cx, tY + 3]], 3).concat([[cx - 7, tY + 6]]), V.FLESHP, { R: 4, hgt: 4, z: 46, sid: 17, tilt: [-0.2, -0.1] });
  for (const sd of [-1, 1]) {
    domePoly(cel, [[cx + sd * 7, tY + 9], [cx + sd * 10, tY + 11], [cx + sd * 9, tY + 21], [cx + sd * 4, tY + 23]], V.CHALKW, { R: 2, hgt: 2, z: 47, sid: 21 + (sd > 0 ? 1 : 0) });
    cel.put(cx + sd * 3, tY + 12, V.DARK, { z: 48, sid: 17 }); cel.put(cx + sd * 4, tY + 12, V.DARK, { z: 48, sid: 17 });
  }
  cel.stroke([[cx - 4, tY + 18], [cx + 4, tY + 18]], (x, y) => cel.put(x, y, V.CHALKW, { z: 48, sid: 21, fix: 2 }));
  cel.stroke([[cx - 5, tY + 4], [cx + 5, tY + 4]], (x, y) => cel.put(x, y, V.CHALKW, { z: 48, sid: 23, fix: 3 }));
  // varnish crackle
  for (let k = 0; k < 120; k++) { const x = ix0 + r() * (ix1 - ix0), y = iy0 + r() * (iy1 - iy0); cel.shift(Math.round(x), Math.round(y), -1); }
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
  // the four of them, waist up (their portraits' rigs, lit by flashlights)
  const x = ctxOf(c);
  const cast = [['danny', 'grin', 30, false], ['leah', 'smirk', 128, false], ['tess', 'smile', 252, true], ['marcus', 'soft_smile', 352, true]];
  const busts = cast.map(([id, ex, bx, mir]) => { try { return [getPortrait(id, ex, { light: 'normal', mirror: mir }), bx]; } catch { return [null, bx]; } });
  // Danny's bunny ears behind Leah's head (drawn first: her hair covers his knuckles)
  bunnyEars(x, 128 + 46, 150);
  busts.forEach(([b, bx], k) => { if (b) x.drawImage(b, bx, 150 + (k === 0 ? 2 : 0)); });
  return c;
}
function bunnyEars(x, cx, top) {
  // two fingers in a V over her head, his hand behind it
  const skin = ['#5a3024', '#8c5442', '#bb7b60', '#dca084', '#f0c4a6'];
  const finger = (x0, y0, x1, y1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= n; i++) {
      const t = i / n, px = Math.round(x0 + (x1 - x0) * t), py = Math.round(y0 + (y1 - y0) * t);
      x.fillStyle = skin[0]; x.fillRect(px - 3, py, 7, 1);
      x.fillStyle = skin[2]; x.fillRect(px - 2, py, 5, 1);
      x.fillStyle = skin[3]; x.fillRect(px - 1, py, 2, 1);
      if (i === 0) { x.fillStyle = skin[0]; x.fillRect(px - 2, py - 1, 5, 1); x.fillStyle = skin[4]; x.fillRect(px - 1, py, 2, 1); }
      if (i % 9 === 5) { x.fillStyle = skin[1]; x.fillRect(px - 2, py, 4, 1); }
    }
  };
  finger(cx - 9, top - 4, cx - 4, top + 26);
  finger(cx + 8, top - 2, cx + 4, top + 26);
  x.fillStyle = skin[0]; x.fillRect(cx - 9, top + 22, 20, 10); x.fillStyle = skin[2]; x.fillRect(cx - 8, top + 23, 18, 8); x.fillStyle = skin[3]; x.fillRect(cx - 6, top + 24, 10, 3);
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
  // Leah's shoulder, close: gray cardigan, a rib-knit texture
  const sh = new HField(W, H, 0.06);
  sh.blob(404, 300, 176, 118, 130, { base: 820, mat: V.CARD, p: 0.55 });
  sh.finalize();
  for (let k = 0; k < 9; k++) sh.groove([[262 + k * 24, 196], [272 + k * 24, 236], [264 + k * 26, H]], 3, 5);
  cel.fromHF(sh, { sid: 400, mode: 'any' });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (cel.mat[i] === V.CARD && ((x + (y >> 1)) % 3 === 0)) cel.off[i] -= 1; }
  // a fall of her dark bob at the frame's edge: it is her shoulder
  for (let k = 0; k < 9; k++) {
    const x0 = 452 + k * 4, sway = (k - 4) * 0.8;
    cel.stroke(quad([x0, 150], [x0 + sway + 4, 210], [x0 + sway * 2, 272], 16), (x, y, tt) => {
      for (let w2 = 0; w2 < 5; w2++) cel.put(x + w2, y, V.BEANIE, { z: 960 + k, n: [(w2 - 2) * 0.3, -0.2, 1], sid: 450 + k, fix: -1, off: w2 === 2 && tt > 0.2 ? 1 : 0 });
    });
  }
  // the hand, from above and behind her, fingers curling over the shoulder toward the lens
  const S = sculptHand(cel, { C: [368, 150], ang: Math.atan2(0.95, -0.32), s: 0.88, curl: 0.55, z0: 900, side: -1, rings: { 3: 'signet', 2: 'stone' },
    bends: [[0.1, 0.15, 0.1], [0.08, 0.12, 0.08], [0.12, 0.16, 0.1], [0.18, 0.24, 0.14]] });
  sculptCuff(cel, S, { back: -330, rise: 80 });
  detailHand(cel, S, { seed: 77, L: [0.05, -0.72, 0.69] });
  paintRings(cel, S, { L: [0.05, -0.72, 0.69] });
  paintNails(cel, S, { L: [0.05, -0.72, 0.69], long: 0.3 });
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
  B(0, -8, 52, 56, 56);
  B(-6, -37, 30, 14, 52, 0.6); B(14, -31, 22, 12, 55, 0.6);
  B(-1, -19.5, 25, 9, 64.5, 0.7);
  B(-21, 15, 16, 23, 64.5, 0.55); B(22, 11, 17, 25, 63, 0.5);
  B(-38, 34, 20, 20, 50, 0.5); B(44, 18, 16, 30, 52, 0.5);
  B(0, 30, 13, 7, 61, 0.65); B(2, 39, 24, 8.5, 56, 0.6);
}
function frame5() {
  // his face at the lens: the small serene face, smiling now, lit by the camcorder's lamp (a little from
  // the side, so the nose is a plane, not an outline), barrel-distorted
  const P = { ...FACE_EXPR.looking, lidL: 0.5, lidR: 0.46, brow: 0.55, eyeSmile: 0.4, gazeL: [0.02, 0.15], gazeR: [-0.04, 0.12], cx: 236, cy: 112, s: 6.4, seed: 1841, chins: 2, collar: false,
    noseK: 0.78, noseTip: 0.78, chinK: 0.35, lowerLum: -0.6, dough: doughAtLens };
  const cel = headCel(P, { sweat: 8, hairs: 18, L: [-0.38, 0.1, 0.92] });
  // the mouth: one closed line right under the moustache (the upper lip lies in its shadow), corners
  // lifted a little; below it the lip and the skin in shadow — not a pale band of teeth. The chin's
  // underside turns away into the dough (it stays inside the face, not a ball of its own).
  { const X = (u) => P.cx + u * P.s, Y = (v) => P.cy + v * P.s;
    const isFace = (m) => m === FM.FACE || m === FM.LIP || m === FM.BLUSH || m === FM.FACE_V;
    for (let x = Math.floor(X(-6.2)); x <= X(6.2); x++) {
      const u = (x + 0.5 - X(0)) / P.s;
      // find the moustache's lower edge in this column
      let y = Math.floor(Y(8)), y1 = Math.ceil(Y(17));
      while (y < y1 && cel.mat[cel.idx(x, y)] !== FM.WHISK) y++;
      while (y < y1 && cel.mat[cel.idx(x, y)] === FM.WHISK) y++;
      if (y >= y1) continue;
      const au = Math.abs(u), lift = Math.max(0, au - 3.4) * 0.6;            // the corners turn up a little
      const lineY = Math.round(y + 1 - lift), lipH = au < 4.2 ? Math.round(2.6 - au * 0.25) : 0;
      for (let yy = y; yy < Math.round(Y(17.4)); yy++) {
        const i = cel.idx(x, yy); if (i < 0 || !(isFace(cel.mat[i]) || cel.mat[i] === FM.MOUTH)) continue;
        if (yy < lineY) { cel.mat[i] = FM.FACE; cel.fix[i] = 3; }                                       // in the moustache's shadow
        else if (yy === lineY && au < 5.8) { cel.mat[i] = FM.MOUTH; cel.fix[i] = 3; }                   // the closed line
        else if (yy <= lineY + lipH) { cel.mat[i] = FM.LIP; cel.fix[i] = yy === lineY + 1 && au < 1.2 ? 5 : 3; }   // the lower lip
        else if (yy <= lineY + lipH + 2 && au < 4.6) { cel.mat[i] = FM.FACE; cel.fix[i] = 4; }          // the shadow under it
        else if (au < 6.2) { cel.mat[i] = FM.FACE; cel.fix[i] = -1; cel.off[i] = 0; }                    // (the rig's own lip and groove: gone)
      }
    }
    for (let y = Math.floor(Y(20.6)); y <= Y(26); y++) for (let x = Math.floor(X(-9)); x <= X(9); x++) {
      const i = cel.idx(x, y); if (i < 0 || !isFace(cel.mat[i])) continue;
      const v = (y + 0.5 - Y(0)) / P.s; cel.off[i] = Math.min(cel.off[i], v > 22.2 ? -2 : -1);
    } }
  const lt = light({ L: [-0.38, 0.1, 0.92], amb: 0.06, key: 0.95, shadow: 0.5, steps: 20, spec: 1.1,
    falloff: (x, y) => { const d = Math.hypot((x - 232) / 290, (y - 136) / 210); return clamp(1.15 - d * d * 1.0, 0.06, 1.1); } });
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
