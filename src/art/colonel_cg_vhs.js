// vhs_frames: raw frames from Leah's camcorder in Room 103 (the UI adds the VHS filter & timestamp).
// 0 Tess & Marcus heads-down under the fluorescents · 1 a dark mass enters the frame · 2 a huge hand
// settles on the camera-holder's shoulder (gray cardigan) · 3 tilted, smeared · 4 his small serene
// face very close to the lens, smiling.
import { GBuf, HField, M, rig, shade, imgToCanvas, fbm, hnoise } from './colonel_gbuf.js';
import { drawHead, FACE_EXPR } from './colonel_face.js';
import { SM, buildHand, sinkRings, paintRings, paintNails } from './colonel_cg_scenes.js';
import { makeCanvas, ctxOf, rng } from './util.js';

const W = 480, H = 270;
// pinhole camera at Leah's seat: x right, y up, z toward the front of the room (metres)
const CAM = { x: 0.62, y: 1.12, z: 0, f: 300, hy: 112 };
const prj = (x, y, z) => [W / 2 + CAM.f * (x - CAM.x) / (z - CAM.z), CAM.hy - CAM.f * (y - CAM.y) / (z - CAM.z)];
const sc = (z) => CAM.f / (z - CAM.z); // px per metre at depth z

const FLUOR = (k = 1) => rig({ amb: 0.2 * k + 0.04, shadowTint: '#71877c', keyTint: '#eefff0', exposure: 1.02, gamma: 0.95,
  lights: [{ d: [0.05, -0.85, -0.25], i: 0.78 * k, sh: 18, shK: 0.55 }, { d: [-0.2, -0.3, 0.9], i: 0.32 * k, spec: 0 }] });

function room(gb, r) {
  const back = 7.2;
  // front wall: cream above the chair rail, institutional green below; ceiling tiles; linoleum floor
  const [l0, t0] = prj(-4.5, 3.2, back), [r0, b0] = prj(5.5, 0, back);
  const rail = prj(0, 1.0, back)[1];
  gb.poly([[0, 0], [W, 0], [W, H], [0, H]], { mat: SM.WALL_C, z: -200, n: [0, 0, 1] });
  gb.poly([[0, rail], [W, rail], [W, b0], [0, b0]], { mat: SM.WALL_G, z: -199, n: [0, 0, 1], mode: 'any' });
  gb.line(0, rail, W, rail, SM.WOOD, { mode: 'any', z: -198, n: [0, -0.6, 0.8] });
  // ceiling (above t0): tiles in perspective
  for (let y = 0; y < t0; y++) {
    const z = CAM.f * (3.2 - CAM.y) / Math.max(1, CAM.hy - y);
    for (let x = 0; x < W; x++) {
      const xw = CAM.x + (x - W / 2) * z / CAM.f, i = y * W + x;
      const grid = (Math.abs((xw * 1.65) % 1) < 0.04 || Math.abs((z * 1.65) % 1) < 0.05 * (z / 3));
      gb._put(i, SM.WALL_C, 0, 0.8, 0.6, -150, { mode: 'any', ao: grid ? 0.6 : 1, lum: -0.08 - (hnoise(x >> 1, y >> 1, 3) < 0.05 ? 0.05 : 0) });
    }
  }
  // floor: linoleum checker
  for (let y = Math.ceil(b0); y < H; y++) {
    const z = CAM.f * CAM.y / Math.max(1, y - CAM.hy);
    for (let x = 0; x < W; x++) {
      const xw = CAM.x + (x - W / 2) * z / CAM.f, i = y * W + x;
      const chk = (Math.floor(xw / 0.3) + Math.floor(z / 0.3)) & 1;
      gb._put(i, chk ? SM.FLOOR : SM.WALL_G, 0, -0.85, 0.5, -100, { mode: 'any', ao: 1, lum: (chk ? -0.1 : -0.04) + (fbm(x, y, 8, 9) - 0.5) * 0.08 });
    }
  }
  // chalkboard + tray; ghost of erased writing
  const [cx0, cy0] = prj(-3.6, 2.15, back - 0.02), [cx1, cy1] = prj(0.7, 0.95, back - 0.02);
  gb.poly([[cx0 - 3, cy0 - 3], [cx1 + 3, cy0 - 3], [cx1 + 3, cy1 + 3], [cx0 - 3, cy1 + 3]], { mat: SM.WOOD, z: -190, n: [0, 0, 1], mode: 'any' });
  gb.poly([[cx0, cy0], [cx1, cy0], [cx1, cy1], [cx0, cy1]], { mat: SM.CHALK, z: -189, n: [0, 0, 1], mode: 'any' });
  for (let k = 0; k < 9; k++) { const x = cx0 + 8 + r() * (cx1 - cx0 - 30), y = cy0 + 6 + r() * (cy1 - cy0 - 12); gb.line(x, y, x + 10 + r() * 20, y + (r() - 0.5) * 3, null, { k: 1, lumAdd: 0.06 }); }
  // the door (right), narrow wired-glass window black with the hall beyond
  const [dx0, dy0] = prj(2.6, 2.1, back - 0.02), [dx1, dy1] = prj(3.5, 0, back - 0.02);
  gb.poly([[dx0, dy0], [dx1, dy0], [dx1, dy1], [dx0, dy1]], { mat: SM.WOOD, z: -190, n: [0, 0, 1], mode: 'any' });
  const [wx0, wy0] = prj(2.85, 1.85, back - 0.03), [wx1, wy1] = prj(3.05, 1.25, back - 0.03);
  gb.poly([[wx0, wy0], [wx1, wy0], [wx1, wy1], [wx0, wy1]], { mat: SM.GLASS, z: -189, n: [0, 0, 1], mode: 'any', lum: -0.25 });
  // clock, a flag, the bell-schedule paper
  const [kx, ky] = prj(1.6, 2.5, back - 0.02);
  gb.ell(kx, ky, 8, 8, { mat: M.PAPER, z: -188, rz: 2, mode: 'any' });
  gb.line(kx, ky, kx + 3, ky - 4, M.DARK, { mode: 'any', z: -187 }); gb.line(kx, ky, kx - 4, ky + 1, M.DARK, { mode: 'any', z: -187 });
  const [px, py] = prj(1.3, 1.6, back - 0.02);
  gb.poly([[px, py], [px + 12, py], [px + 12, py + 16], [px, py + 16]], { mat: M.PAPER, z: -188, n: [0, 0, 1], mode: 'any', lum: -0.1 });
}

function desk(gb, x, z, r) {
  // 1970s combo chair-desk seen from behind: laminate top, tubular legs, the chair's back
  const top = [[x - 0.3, 0.74, z - 0.2], [x + 0.32, 0.74, z - 0.2], [x + 0.32, 0.74, z + 0.24], [x - 0.3, 0.74, z + 0.24]].map(([a, b, c]) => prj(a, b, c));
  const zz = -sc(z) * 0.1 - z * 10;
  for (const [lx, lz] of [[-0.26, 0.2], [0.28, 0.2], [-0.26, -0.15], [0.28, -0.15]]) { const [ax, ay] = prj(x + lx, 0.74, z + lz), [bx, by] = prj(x + lx, 0, z + lz); gb.cap(ax, ay, 1.2, bx, by, 1.2, { mat: SM.METAL, z: zz - 1, rzk: 1, mode: 'any' }); }
  gb.poly(top, { mat: SM.DESK, z: zz, n: [0, 0.85, -0.5], mode: 'any' });
  const [ex0, ey0] = top[0], [ex1, ey1] = top[1];
  gb.poly([[ex0, ey0], [ex1, ey1], [ex1, ey1 + sc(z) * 0.03], [ex0, ey0 + sc(z) * 0.03]], { mat: SM.DESK_EDGE, z: zz + 0.1, n: [0, 0, 1], mode: 'any' });
  // chair back
  const cb = [[x - 0.21, 0.8, z - 0.5], [x + 0.21, 0.8, z - 0.5], [x + 0.21, 0.6, z - 0.5], [x - 0.21, 0.6, z - 0.5]].map(([a, b, c]) => prj(a, b, c));
  return { top, chairBack: cb, zz };
}

function figure(gb, x, z, kind, r) {
  // a student slumped forward, head down on folded arms on the desk, back to the camera
  const s = sc(z), zz = -s * 0.1 - z * 10 + 2;
  const hf = new HField(W, H, 0.35);
  const at = (a, b, c) => prj(x + a, b, z + c);
  const jacket = kind === 'tess' ? SM.DENIM : SM.OLIVE;
  // back & shoulders (hunched), arms folded on the desk
  { const [ax, ay] = at(0, 0.86, -0.3), [bx, by] = at(0, 0.5, -0.42); hf.tube(ax, ay, s * 0.17, bx, by, s * 0.13, { mat: jacket, z0: zz, z1: zz - s * 0.02, k: 0.7 }); } // the back, hunched
  for (const sd of [-1, 1]) { const [ax, ay] = at(sd * 0.17, 0.86, -0.3); hf.blob(ax, ay, s * 0.09, s * 0.08, s * 0.08, { base: zz + s * 0.06, mat: jacket, p: 0.6 }); } // shoulders
  { const [ax, ay] = at(-0.24, 0.84, -0.06), [bx, by] = at(0.26, 0.84, -0.04); hf.tube(ax, ay, s * 0.065, bx, by, s * 0.065, { mat: jacket, z0: zz + s * 0.04, z1: zz + s * 0.04, k: 0.8 }); } // folded arms
  // head on the arms
  const [hx, hy] = at(kind === 'tess' ? 0.02 : 0.0, 0.92, -0.1);
  if (kind === 'tess') {
    hf.blob(hx, hy, s * 0.135, s * 0.12, s * 0.1, { base: zz + s * 0.14, mat: SM.HAIR_R, p: 0.55 });
    for (let k = 0; k < 7; k++) { const a = Math.PI * (0.15 + k * 0.12); hf.tube(hx + Math.cos(a) * s * 0.06, hy - s * 0.04, s * 0.03, hx + Math.cos(a) * s * 0.15, hy + s * 0.08 + r() * s * 0.04, s * 0.012, { mat: SM.HAIR_R, z0: zz + s * 0.2, z1: zz + s * 0.12, k: 0.7 }); }
  } else {
    hf.blob(hx, hy + s * 0.02, s * 0.11, s * 0.1, s * 0.08, { base: zz + s * 0.12, mat: SM.BEANIE, p: 0.55 });
    hf.blob(hx, hy + s * 0.1, s * 0.07, s * 0.04, s * 0.05, { base: zz + s * 0.13, mat: SM.DSKIN, p: 0.6 });   // nape
    const [nx0, ny0] = at(-0.12, 0.88, -0.2), [nx1, ny1] = at(0.12, 0.88, -0.2);
    hf.tube(nx0, ny0, s * 0.025, nx1, ny1, s * 0.025, { mat: M.DARK, z0: zz + s * 0.2, z1: zz + s * 0.2, k: 0.7 }); // headphones around the neck
  }
  hf.finalize();
  hf.toGB(gb, { mode: 'any' });
  if (kind === 'tess') { // denim seams, the collar
    const [cx, cy] = at(0, 0.98, -0.3);
    gb.curve(cx - s * 0.12, cy, cx, cy + s * 0.04, cx + s * 0.12, cy, (px, py) => gb.dim(px, py, 0.6));
  }
}

function classroom(r) {
  const gb = new GBuf(W, H);
  room(gb, r);
  const desks = [[-1.6, 5.2], [0.0, 5.2], [1.6, 5.2], [-1.6, 3.7], [1.3, 3.6], [-1.2, 2.3], [0.15, 2.05], [2.3, 2.6]];
  // draw far → near so nearer desks overlap
  desks.sort((a, b) => b[1] - a[1]);
  for (const [x, z] of desks) {
    const d = desk(gb, x, z, r);
    if (x === 1.3) figure(gb, x, z, 'marcus', r);
    if (x === 0.15) figure(gb, x, z, 'tess', r);
    gb.poly(d.chairBack, { mat: SM.WOOD, z: d.zz + 0.5, n: [0, 0, 1], mode: 'any', lum: -0.05 }); // the seat back hides the lower back
  }
  // the fluorescent fixture overhead (just in frame) — the light source, blown out
  const [fx0, fy0] = prj(-0.6, 3.15, 2.6), [fx1, fy1] = prj(1.9, 3.15, 3.4);
  gb.poly([[fx0, 0], [fx1, 0], [fx1 - 10, fy1 + 2], [fx0 + 10, fy1 + 2]], { mat: SM.METAL, z: -50, n: [0, 0.8, 0.6], mode: 'any' });
  gb.poly([[fx0 + 14, 0], [fx1 - 14, 0], [fx1 - 18, fy1 - 2], [fx0 + 18, fy1 - 2]], { mat: M.PAPER, z: -49, n: [0, 0, 1], mode: 'any', lum: 0.9 });
  return gb;
}

// ------------------------------------------------------------------------------------- frames
const VIG = { focus: (x, y) => { const d = Math.hypot((x - 220) / 300, (y - 120) / 200); return 1 - Math.min(1, d * d) * 0.6; } };
function frame0() {
  const r = rng(1031);
  const gb = classroom(r);
  gb.folds(2, 0.7, 0.9);
  return imgToCanvas(shade(gb, FLUOR(1), VIG));
}

function mass(gb, x0, k) {
  // the edge of something enormous: navy wool, a brass button, the fringe of the sash
  const hf = new HField(W, H, 0.05);
  hf.blob(x0 + 200, 150, 230, 230, 160, { mat: SM.NAVY_CUFF, p: 0.55 });
  hf.blob(x0 + 80, 220, 120, 90, 140, { mat: SM.NAVY_CUFF, p: 0.6 });
  hf.finalize();
  hf.groove([[x0 + 40, 0], [x0 + 70, 120], [x0 + 50, H]], 10, 18);
  hf.groove([[x0 + 120, 0], [x0 + 140, 140], [x0 + 110, H]], 12, 14);
  hf.toGB(gb, { mode: 'any' });
  const bx = x0 + 96, by = 118;
  if (gb.matAt(bx, by)) { const bz = gb.z[by * W + bx]; gb.ell(bx, by, 9, 9, { mat: M.BRASS, z: bz + 2, rz: 4, mode: 'any' }); gb.ell(bx - 2, by - 2, 3, 3, { mat: M.BRASS, z: bz + 4, rz: 2, mode: 'any' }); }
  for (let k2 = 0; k2 < 9; k2++) { const fx = x0 + 30 + k2 * 6, fy = 236; gb.cap(fx, fy, 2.2, fx + 2, fy + 34, 1.8, { mat: M.SASH, z0: 180, z1: 178, rzk: 1, mode: 'any' }); }
}
function frame1() {
  const r = rng(1031);
  const gb = classroom(r);
  mass(gb, 300);
  gb.folds(2, 0.7, 0.9);
  return imgToCanvas(shade(gb, FLUOR(0.85), VIG));
}
function frame2() {
  const r = rng(1031);
  const gb = classroom(r);
  mass(gb, 380);
  // Leah's shoulder in the near frame: gray cardigan knit
  const hf = new HField(W, H, 0.06);
  hf.blob(410, 290, 170, 120, 120, { base: 120, mat: SM.CARDIGAN, p: 0.55 });
  hf.finalize();
  for (let k = 0; k < 10; k++) hf.groove([[260 + k * 22, 200], [270 + k * 22, 240], [262 + k * 24, H]], 3, 4);
  hf.toGB(gb, { mode: 'any' });
  // the hand settling over it from above and behind
  const hand = buildHand(W, H, { cx: 370, cy: 120, fwd: [-0.38, 0.92], s: 0.95, curl: 0.55, z: 250, thumbSide: -1, mat: 62 });
  const rings = sinkRings(hand.hf, hand, [0, 2]);
  const cuff = new HField(W, H, 0.1);
  { const [ax, ay] = hand.P(-260, 0), [bx, by] = hand.P(-130, 0); cuff.tube(ax, ay, 84, bx, by, 76, { mat: SM.NAVY_CUFF, z0: 250, z1: 252, k: 0.6 }); }
  cuff.finalize();
  hand.hf.maxWith(cuff);
  hand.hf.toGB(gb, { mode: 'z' });
  paintRings(gb, rings);
  paintNails(gb, hand.nails);
  gb.folds(2, 0.7, 0.9);
  return imgToCanvas(shade(gb, FLUOR(0.6), VIG));
}
function frame3(src) {
  // the camera wrenched sideways: tilted, with hard ghost copies trailing the motion (no soft blur)
  const out = makeCanvas(W, H), x = ctxOf(out);
  const s = ctxOf(src).getImageData(0, 0, W, H).data, img = x.createImageData(W, H), d = img.data;
  const a = -0.42, ca = Math.cos(a), sa = Math.sin(a), cx = W / 2 + 40, cy = H / 2;
  const taps = [[0, 0.5], [16, 0.3], [34, 0.2]];
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    let rr = 0, gg = 0, bb = 0;
    const jit = ((y >> 2) * 7 % 5) * 2; // ragged scanline tearing
    for (const [off, wgt] of taps) {
      const u = (xx - cx + off + jit) * ca - (y - cy) * sa + cx, v = (xx - cx + off + jit) * sa + (y - cy) * ca + cy;
      const ui = Math.max(0, Math.min(W - 1, Math.round(u))), vi = Math.max(0, Math.min(H - 1, Math.round(v))), j = (vi * W + ui) * 4;
      rr += s[j] * wgt; gg += s[j + 1] * wgt; bb += s[j + 2] * wgt;
    }
    const o = (y * W + xx) * 4, k = 0.75;
    d[o] = Math.round(rr * k / 10) * 10; d[o + 1] = Math.round(gg * k / 10) * 10; d[o + 2] = Math.round(bb * k / 10) * 10; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return out;
}
function frame4() {
  // his face at the lens: the small serene face, smiling, filling the frame (barrel-distorted)
  const gb = new GBuf(W, H);
  const s = 6.4;
  drawHead(gb, { ...FACE_EXPR.looking, lidL: 0.5, lidR: 0.46, brow: 0.55, eyeSmile: 0.4, gazeL: [0.02, 0.15], gazeR: [-0.04, 0.12], cx: 236, cy: 112, s, seed: 1841, chins: 2, collar: false });
  gb.folds(1.4 * s, 0.72, 0.9);
  gb.ssao(10, 0.01, 0.35);
  const flat = shade(gb, rig({ amb: 0.1, shadowTint: '#5e7266', keyTint: '#f4fff6', exposure: 1.0, gamma: 0.95,
    lights: [{ d: [0.05, -0.88, 0.45], i: 0.82, sh: 30, shK: 0.4 }, { p: [240, 160, 300], r: 560, i: 0.4, spec: 0.4 }] }), { bg: '#020203', focus: (x, y) => { const d = Math.hypot((x - 236) / 300, (y - 140) / 220); return 1 - Math.min(1, d * d) * 0.45; } });
  const out = makeCanvas(W, H), x = ctxOf(out), img = x.createImageData(W, H), d = img.data, sd = flat.data;
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    const nx = (xx - W / 2) / (W / 2), ny = (y - H / 2) / (W / 2), r2 = nx * nx + ny * ny, k = 1 - 0.22 * r2;
    const u = Math.round(W / 2 + nx * k * W / 2), v = Math.round(H / 2 + ny * k * W / 2);
    const o = (y * W + xx) * 4;
    if (u < 0 || v < 0 || u >= W || v >= H) { d[o + 3] = 255; continue; }
    const j = (v * W + u) * 4; d[o] = sd[j]; d[o + 1] = sd[j + 1]; d[o + 2] = sd[j + 2]; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return out;
}

let f2cache = null;
export function buildVhsFrame(f) {
  if (f === 0) return frame0();
  if (f === 1) return frame1();
  if (f === 2) return (f2cache = f2cache || frame2());
  if (f === 3) return frame3(f2cache = f2cache || frame2());
  return frame4();
}
