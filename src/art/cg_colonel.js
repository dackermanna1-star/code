// The Colonel's CGs (480×270 pixel-art illustrations): colonel_hand, colonel_face, locker_slits, vhs_frames.
// Built on the same sculpt+shade core as his sprite & portraits; heavy layers are generated lazily on
// first draw and cached (a few quantized states each), so draw() itself is just blits.
// Exports: COLONEL_CG_IDS, initColonelCg(), getColonelCg(id) → { draw(ctx, t, params) }.
import { GBuf, rig, shade, imgToCanvas, M } from './colonel_gbuf.js';
import { drawHead, FACE_EXPR } from './colonel_face.js';
import { buildHand, buildDeskScene } from './colonel_cg_scenes.js';
import { buildLockerInterior, buildLockerOutside, buildSlitFace, LOCKER } from './colonel_cg_locker.js';
import { buildVhsFrame } from './colonel_cg_vhs.js';
import { makeCanvas, ctxOf, hash2 } from './util.js';

export const COLONEL_CG_IDS = ['colonel_hand', 'colonel_face', 'locker_slits', 'vhs_frames'];
const W = 480, H = 270;
const h01 = (a, b, s) => hash2(a, b, s) / 4294967296;

// ------------------------------------------------------------------------------------ colonel_face
// Extreme close-up: the small serene face in the vast dough of the head. params.lit 0..1 = how much
// of Tess's flashlight is on him. The eyes blink rarely, and never together.
const FACE_LEVELS = 8;
const faceGB = new Map(), faceImg = new Map();
const BLINKS = { open: null, l: [0, 0.36], both: [0, 0], r: [0.42, 0] };
function faceBuffer(state) {
  if (faceGB.has(state)) return faceGB.get(state);
  const gb = new GBuf(W, H);
  const s = 4.6;
  drawHead(gb, { ...FACE_EXPR.serene, cx: 240, cy: 118, s, seed: 1841, chins: 3, collar: false, blink: BLINKS[state] || undefined });
  gb.folds(1.4 * s, 0.72, 0.9);
  gb.ssao(9, 0.012, 0.35);
  faceGB.set(state, gb);
  return gb;
}
function faceRig(lit) {
  return rig({
    amb: 0.015 + 0.06 * lit, shadowTint: '#4a5070', keyTint: '#ffeedd', exposure: 1.0,
    lights: [
      { p: [170, 250, 520], r: 760, i: 0.25 + 1.15 * lit, fall: 1.3, sh: 26, shK: 0.35 },
      { d: [0.4, -0.9, 0.3], i: 0.08 * lit, spec: 0 },
    ],
    rim: [0.7, -0.7, 0.05 + 0.05 * lit],
  });
}
function faceFrame(state, level) {
  const key = `${state}|${level}`;
  if (faceImg.has(key)) return faceImg.get(key);
  const lit = level / (FACE_LEVELS - 1);
  const img = shade(faceBuffer(state), faceRig(lit), {
    focus: (x, y) => { const d = Math.hypot((x - 240) / 300, (y - 140) / 230); return Math.max(0, 1 - d * d * (1.1 - 0.4 * lit)); },
    bg: '#030305',
  });
  const c = imgToCanvas(img);
  faceImg.set(key, c);
  return c;
}
function blinkState(t) {
  // every ~6.3 s: left lid drops, the right follows a beat late, the left reopens first
  const p = (((t + 3.1) % 6.3) + 6.3) % 6.3;
  if (p < 0.1) return 'l';
  if (p < 0.22) return 'both';
  if (p < 0.34) return 'r';
  return 'open';
}
const colonelFace = {
  draw(ctx, t = 0, params = {}) {
    const lit = Math.max(0, Math.min(1, params.lit ?? 1));
    const level = Math.round(lit * (FACE_LEVELS - 1));
    ctx.drawImage(faceFrame(blinkState(t), level), 0, 0);
  },
};

// ------------------------------------------------------------------------------------ colonel_hand
// Tess's desk from just above: her red hair and denim arms at the bottom, head down; an enormous
// ringed hand resting beside her face. Fluorescent flicker + the hand's slow breathing swell.
const handCache = new Map();
function handFrame(swell, dim) {
  const key = `${swell}|${dim}`;
  if (handCache.has(key)) return handCache.get(key);
  const c = buildDeskScene({ swell: swell / 2, dim });
  handCache.set(key, c);
  return c;
}
function flicker(t) {
  // mostly steady; short irregular dips like a dying starter
  const k = Math.floor(t * 14);
  const r = h01(k, 7, 31), r2 = h01(Math.floor(t * 3), 9, 31);
  return r2 > 0.72 && r > 0.55;
}
const colonelHand = {
  draw(ctx, t = 0) {
    const ph = (Math.sin(t * Math.PI * 2 / 3.6) + 1) / 2; // ~3.6 s breath
    const swell = Math.round(ph * 2);
    ctx.drawImage(handFrame(swell, flicker(t) ? 1 : 0), 0, 0);
  },
};

// ------------------------------------------------------------------------------------ locker_slits
let lockerFG = null, lockerOut = null, slitFace = null;
const lockerSlits = {
  draw(ctx, t = 0, params = {}) {
    const phase = Math.max(0, Math.min(1, params.phase ?? 0)), faceIn = Math.max(0, Math.min(1, params.faceIn ?? 0));
    if (!lockerFG) lockerFG = buildLockerInterior();
    if (!lockerOut) lockerOut = buildLockerOutside();
    // what lies beyond the slits (drawn full-frame; the interior covers all but the slits)
    lockerOut.draw(ctx, t, phase, faceIn);
    if (faceIn > 0) {
      if (!slitFace) slitFace = buildSlitFace();
      const e = faceIn * faceIn * (3 - 2 * faceIn);
      const x = Math.round(LOCKER.eyeX - slitFace.eyeX + (1 - e) * 330), y = Math.round(LOCKER.eyeY - slitFace.eyeY + (1 - e) * 6 + Math.sin(t * 1.3) * 1.2);
      ctx.drawImage(slitFace.canvas, x, y);
    }
    ctx.drawImage(lockerFG, 0, 0);
  },
};

// ------------------------------------------------------------------------------------ vhs_frames
const vhsCache = new Map();
const vhsFrames = {
  draw(ctx, t = 0, params = {}) {
    const f = Math.max(0, Math.min(4, Math.round(params.frame ?? 0)));
    if (!vhsCache.has(f)) vhsCache.set(f, buildVhsFrame(f));
    ctx.drawImage(vhsCache.get(f), 0, 0);
  },
};

const CGS = { colonel_hand: colonelHand, colonel_face: colonelFace, locker_slits: lockerSlits, vhs_frames: vhsFrames };

export async function initColonelCg() {
  // generated lazily on first draw (each CG is used in one or two scenes)
}
export function getColonelCg(id) {
  return CGS[id] || { draw(ctx) { ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, W, H); } };
}
/** Optional: pre-generate one CG's layers ahead of a scene (avoids a first-draw hitch). */
export function warmColonelCg(id) {
  const c = makeCanvas(W, H), x = ctxOf(c);
  const cg = CGS[id]; if (!cg) return;
  if (id === 'vhs_frames') for (let f = 0; f < 5; f++) cg.draw(x, 0, { frame: f });
  else if (id === 'locker_slits') { cg.draw(x, 0, { phase: 0.5, faceIn: 1 }); }
  else cg.draw(x, 0, { lit: 1 });
}
