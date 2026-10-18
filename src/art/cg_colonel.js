// The Colonel's CGs (480×270 pixel-art illustrations): colonel_hand, colonel_face, locker_slits, vhs_frames.
// Painted in the cast's style by the cel pipeline (colonel_cg_cel.js): short ramps, hard bands with a
// 1-px dithered seam, selective outlines, hand-placed detail. The scenes live in colonel_cg_hand.js,
// colonel_cg_face.js, colonel_cg_vhs.js and colonel_cg_locker.js. Their layers are prebuilt in small
// slices in idle time after boot (like cg.js's late CGs); a CG drawn before its build is done finishes
// what it needs on the spot. draw() itself is blits (plus a cheap compose while the hand moves).
// Exports: COLONEL_CG_IDS, initColonelCg(), getColonelCg(id) → { draw(ctx, t, params) }, warmColonelCg(id).
import { faceFrame, blinkPatch, prepFace } from './colonel_cg_face.js';
import { composeHand, prepHand, handReady, handOffset } from './colonel_cg_hand.js';
import { buildLockerInterior, buildLockerOutside, buildSlitFace, LOCKER } from './colonel_cg_locker.js';
import { buildVhsFrame, VHS_FRAMES } from './colonel_cg_vhs.js';
import { hash2 } from './util.js';

export const COLONEL_CG_IDS = ['colonel_hand', 'colonel_face', 'locker_slits', 'vhs_frames'];
const W = 480, H = 270;
const h01 = (a, b, s) => hash2(a, b, s) / 4294967296;

// background preparation: one heavy job per timer tick, so a CG's remaining states (breaths, blinks,
// the next VHS frames) get built after its first draw without one long stall
const jobs = new Map();
let pumping = false;
function later(key, fn) {
  if (jobs.has(key)) return;
  jobs.set(key, fn);
  if (!pumping) { pumping = true; setTimeout(pump, 40); }
}
function pump() {
  const it = jobs.entries().next();
  if (it.done) { pumping = false; return; }
  const [key, fn] = it.value;
  jobs.delete(key);
  try { fn(); } catch (e) { console.error(e); }
  setTimeout(pump, 40);
}

// ------------------------------------------------------------------------------------ colonel_face
// Extreme close-up (colonel_cg_face.js): the small serene face in the vast dough of the head.
// params.lit 0..1 = how much of Tess's flashlight is on him. The eyes blink rarely, and never together.
const FACE_LEVELS = 8;
function blinkState(t) {
  // every ~6.3 s: left lid drops, the right follows a beat late, the left reopens first
  const p = (((t + 3.1) % 6.3) + 6.3) % 6.3;
  if (p < 0.1) return 'l';
  if (p < 0.22) return 'both';
  if (p < 0.34) return 'r';
  return 'open';
}
const patchReady = new Set();
const colonelFace = {
  draw(ctx, t = 0, params = {}) {
    const lit = Math.max(0, Math.min(1, params.lit ?? 1));
    const level = Math.round(lit * (FACE_LEVELS - 1));
    ctx.drawImage(faceFrame(level, FACE_LEVELS), 0, 0);
    // blink patches for this level are prepared in the background; until then the eyes stay open
    const stt = blinkState(t);
    if (stt !== 'open' && patchReady.has(`${stt}|${level}`)) { const p = blinkPatch(stt, level, FACE_LEVELS); ctx.drawImage(p.canvas, p.x, p.y); }
    for (const s2 of ['l', 'both', 'r']) {
      const k = `${s2}|${level}`;
      if (!patchReady.has(k)) later('blink' + k, () => { blinkPatch(s2, level, FACE_LEVELS); patchReady.add(k); });
    }
  },
};

// ------------------------------------------------------------------------------------ colonel_hand
// Tess's desk from just above (colonel_cg_hand.js). params: light 'fluor' (Ch2, default) | 'red' (Ch8,
// the Register under the breaker's fire), reach 0..1 (0 = still out of frame, back along his arm;
// 1 = resting), slack 0..1 (after EXPELLED: the blood leaves it and it withdraws). The tube flickers;
// the hand and cuff swell with a slow breath.
const handOut = new Map();
function flicker(t, red) {
  if (red) { // the fire: frequent small dips
    const k = Math.floor(t * 9);
    return h01(k, 3, 77) > 0.78;
  }
  // mostly steady; short irregular dips like a dying starter
  const k = Math.floor(t * 14);
  const r = h01(k, 7, 31), r2 = h01(Math.floor(t * 3), 9, 31);
  return r2 > 0.72 && r > 0.55;
}
const colonelHand = {
  draw(ctx, t = 0, params = {}) {
    const light = params.light === 'red' ? 'red' : 'fluor';
    const reach = Math.max(0, Math.min(1, params.reach ?? 1)), slack = Math.max(0, Math.min(1, params.slack ?? 0));
    const ph = (Math.sin(t * Math.PI * 2 / 3.6) + 1) / 2;             // ~3.6 s breath
    // if the idle-time build hasn't got this far, the first frame finishes what it needs now and
    // the other breaths follow in the background
    while (!handReady(light, 1)) prepHand(light);
    let swell = slack > 0.3 ? 0 : Math.round(ph * 2);
    if (!handReady(light, swell)) { swell = 1; later('hand|' + light, function step() { if (!prepHand(light)) later('hand|' + light, step); }); }
    const dim = params.dim ?? (slack < 0.95 && flicker(t, light === 'red'));   // params.dim: preview override
    const [ox, oy] = handOffset(reach, slack);
    const key = `${light}|${dim ? 1 : 0}|${swell}|${ox},${oy}|${Math.round(slack * 16)}`;
    let c = handOut.get(key);
    if (!c) {
      c = composeHand({ light, dim, swell, reach, slack: Math.round(slack * 16) / 16 });
      handOut.set(key, c);
      if (handOut.size > 24) handOut.delete(handOut.keys().next().value);
    }
    ctx.drawImage(c, 0, 0);
  },
};

// ------------------------------------------------------------------------------------ locker_slits
let lockerFG = null, lockerOut = null, slitFace = null;
const lockerSlits = {
  draw(ctx, t = 0, params = {}) {
    const phase = Math.max(0, Math.min(1, params.phase ?? 0)), faceIn = Math.max(0, Math.min(1, params.faceIn ?? 0));
    if (!lockerFG) lockerFG = buildLockerInterior();
    if (!lockerOut) lockerOut = buildLockerOutside(later);
    if (!slitFace && phase > 0.3) later('slitface', () => { if (!slitFace) slitFace = buildSlitFace(); });
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
// frames: 0 the lobby group shot · 1 heads-down · 2 the mass · 3 the hand on her shoulder · 4 wrenched ·
// 5 the face. `frames` tells the vhs screen the group shot is ours (it then maps tape frame k → k + 1).
const vhsCache = new Map();
const vhsFrames = {
  frames: VHS_FRAMES,
  draw(ctx, t = 0, params = {}) {
    const f = Math.max(0, Math.min(VHS_FRAMES - 1, Math.round(params.frame ?? 0)));
    if (!vhsCache.has(f)) vhsCache.set(f, buildVhsFrame(f));
    for (let k = 0; k < VHS_FRAMES; k++) if (!vhsCache.has(k)) later(`v${k}`, () => { if (!vhsCache.has(k)) vhsCache.set(k, buildVhsFrame(k)); });
    ctx.drawImage(vhsCache.get(f), 0, 0);
  },
};

const CGS = { colonel_hand: colonelHand, colonel_face: colonelFace, locker_slits: lockerSlits, vhs_frames: vhsFrames };

// idle-time prebuild, in the order the story needs them: Ch2's hand and tape first, the locker (Ch6),
// then the close-up. (The hand under the Register's red light is built when Ch8 asks for it.)
const PREBUILD = [
  () => prepHand('fluor'),
  ...Array.from({ length: VHS_FRAMES }, (_, k) => () => { if (!vhsCache.has(k)) vhsCache.set(k, buildVhsFrame(k)); return true; }),
  () => { if (!lockerFG) lockerFG = buildLockerInterior(); return true; },
  () => { if (!lockerOut) lockerOut = buildLockerOutside(later); return true; },
  () => { if (!slitFace) slitFace = buildSlitFace(); return true; },
  () => prepFace(FACE_LEVELS),
];
let prebuildStarted = false;
function prebuild({ delay = 6000 } = {}) {
  if (prebuildStarted || typeof window === 'undefined') return;
  prebuildStarted = true;
  const ric = typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn, { timeout: 2000 }) : (fn) => setTimeout(() => fn({ timeRemaining: () => 50 }), 120);
  let k = 0;
  const tick = (dl) => {
    if (k >= PREBUILD.length) return;
    // only start a slice when the browser has a real idle period in hand
    if (dl && dl.timeRemaining && dl.timeRemaining() < 30 && !dl.didTimeout) { ric(tick); return; }
    try { if (PREBUILD[k]()) k++; } catch (e) { console.error('[cg] colonel prebuild failed', e); k++; }
    ric(tick);
  };
  setTimeout(() => ric(tick), delay);
}

export async function initColonelCg() {
  prebuild();
}
export function getColonelCg(id) {
  return CGS[id] || { draw(ctx) { ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, W, H); } };
}
/** Optional: finish one CG's layers now, ahead of the scene that shows it (no first-draw hitch). */
export function warmColonelCg(id, params = {}) {
  const cg = CGS[id]; if (!cg) return;
  if (id === 'colonel_hand') { const light = params.light === 'red' ? 'red' : 'fluor'; while (!prepHand(light)); return; }
  if (id === 'vhs_frames') { for (let k = 0; k < VHS_FRAMES; k++) if (!vhsCache.has(k)) vhsCache.set(k, buildVhsFrame(k)); return; }
  if (id === 'locker_slits') { if (!lockerFG) lockerFG = buildLockerInterior(); if (!lockerOut) lockerOut = buildLockerOutside(); if (!slitFace) slitFace = buildSlitFace(); return; }
  if (id === 'colonel_face') { while (!prepFace(FACE_LEVELS)); }
}
