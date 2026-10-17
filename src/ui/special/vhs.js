// 'vhs' — Leah's tape in the camcorder: a frame scrubber (DESIGN §6 II.3, CONTENT §7).
// args (all optional) {
//   frames:   [{ frame?: n (vhs_frames CG index) | group: true, timestamp, counter? }]  (default: the Room 103 tape)
//   start:    first tape frame shown (default 0) · min / max: scrub limits (default the whole tape)
//   autoplay: true → plays forward from `start` (each frame `hold` s, default 1.6) and stops on the last
//   onFrame:  (index, frameDef) => void — fired when a frame first settles (scripts time stingers on it)
//   --- scripted (non-interactive) viewing, v2.2 ---
//   locked:   true → the player's keys do nothing and the key hints are hidden; the tape moves only by
//             `sequence` or by script calls on the live screen (HW.ui.get('vhs'): step(d), goTo(i),
//             lock(on), play(sequence, { end }), unlock()).
//   sequence: [{ frame, hold = 1.6, seek = 0.26 }] — tape indices played in order: seek to `frame`
//             (tracking noise), stay `hold` s once it settles, then the next. The OSD reads ▶ PLAY.
//             `start` defaults to the first entry's frame. min/max limit only the player's scrubbing.
//   end:      what follows the last hold: 'close' (default; resolves { frame, held: 0, done: true }),
//             'unlock' (the player gets the controls, paused on the last frame) or 'stay' (a script
//             closes it: HW.ui.close('vhs', result)).
//   onStep:   (k, entry) => void — fired as sequence entry k begins (before its seek).
//   onEnd:    () => void — fired after the last hold (before `end` applies).
//   strip:    false hides the tape-position notches.
// } → resolves with { frame, held } when ejected (cancel): the frame it stopped on and the longest time
//     the player held still on the face frame.
// ←/→ step a frame (rewind / fast-forward with tracking noise between), Confirm toggles PLAY / STILL.
// Under autoAdvance (tests) a sequence resolves at once: onStep/onFrame fire for every entry in
// order, then { frame: last, held: 0, done: true } (autoVhs below).
//
// Frame 0 of the tape is the lobby group shot (DESIGN). The vhs_frames CG currently starts at the
// heads-down shot (frames 0..4), so unless the CG reports `frames >= 6` the UI composes the group shot
// itself from the party's sprites and tape frame i>0 maps to CG frame i-1.
import { Screen, Z_SPECIAL } from '../screen.js';
import { W, H } from '../theme.js';
import { canvas, ctx2d, rect, dither, AP, clamp, snap } from '../gfx.js';
import { hints } from '../widgets.js';
import { rng } from '../../art/util.js';
import { HW } from '../../engine/hw.js';
import * as svc from '../services.js';
import { vhsFilter, vhsOSD } from '../vhsfx.js';

const LW = 480, LH = 270;
const SEEK = 0.26;          // s of tracking noise between frames
const FACE = 5;             // tape index of the face close-up (default tape)

/** The Room 103 tape (DESIGN §6 II.3). `frame` = vhs_frames CG index; `group` = the lobby shot. */
export const DEFAULT_TAPE = [
  { group: true, timestamp: 'OCT 18 1996 9:51PM', counter: '0:00:04' },
  { frame: 0, timestamp: 'OCT 18 1996 10:41PM', counter: '0:52:10' },
  { frame: 1, timestamp: 'OCT 18 1996 10:41PM', counter: '0:52:31' },
  { frame: 2, timestamp: 'OCT 18 1996 10:42PM', counter: '0:52:47' },
  { frame: 3, timestamp: 'OCT 18 1996 10:42PM', counter: '0:52:49' },
  { frame: 4, timestamp: 'OCT 18 1996 10:42PM', counter: '0:52:50' },
];

export class VhsScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.z = Z_SPECIAL;
    this.fadeIn = 0.3; this.fadeOut = 0.35;
    this.tape = Array.isArray(args.frames) && args.frames.length ? args.frames : DEFAULT_TAPE;
    const n = this.tape.length;
    this.min = clamp(Number(args.min) || 0, 0, n - 1);
    this.max = clamp(args.max == null ? n - 1 : Number(args.max), this.min, n - 1);
    this.i = clamp(Number(args.start) || 0, this.min, this.max);
    this.seek = 0;            // > 0 while seeking between frames
    this.seekDir = 1;
    this.playing = !!args.autoplay;
    this.hold = Number(args.hold) || 1.6;
    this.onT = 0;             // time on the current frame
    this.faceHeld = 0;
    this.settled = new Set();
    this.src = canvas(LW, LH); this.out = canvas(LW, LH); this.tmp = canvas(LW, LH);
    this.cgFrames = Number(svc.cgArt('vhs_frames')?.frames) || 5;
    this.locked = !!args.locked;
    this._seq = null;         // { list, k, end } while a scripted sequence plays
    if (Array.isArray(args.sequence) && args.sequence.length) {
      if (args.start == null) this.i = this._clampAll(Number(args.sequence[0]?.frame) || 0);
      this.play(args.sequence, { end: args.end, _first: true });
    }
  }

  _clampAll(i) { return clamp(Math.round(i), 0, this.tape.length - 1); }

  // ---- script control (HW.ui.get('vhs')) -----------------------------------------------------------
  /** Step d frames (respects min/max, like the player's ←/→). */
  step(d = 1) { this._step(d); }
  /** Seek straight to tape index i (any frame; tracking noise unless it is already showing). */
  goTo(i, { seek = SEEK } = {}) {
    const j = this._clampAll(i);
    if (j === this.i) { this.onT = 0; return; }
    this.seekDir = j > this.i ? 1 : -1;
    this.i = j; this.seek = seek; this.onT = 0;
    svc.sfx('camcorder_whir', { vol: 0.5 });
  }
  lock(on = true) { this.locked = !!on; }
  unlock() { this.locked = false; }
  /** Play a sequence [{ frame, hold, seek }]; end: 'close' | 'unlock' | 'stay'. */
  play(sequence, { end, _first = false } = {}) {
    const list = (sequence || []).filter((e) => e && Number.isFinite(Number(e.frame)));
    if (!list.length) return;
    this._seq = { list, k: -1, end: end || this.args.end || 'close' };
    this.playing = true;
    this._seqNext(_first);
  }
  get frame() { return this.i; }

  _seqNext(first = false) {
    const q = this._seq;
    q.k++;
    if (q.k >= q.list.length) {
      this._seq = null;
      try { this.args.onEnd?.(); } catch (e) { console.error('[ui] vhs.onEnd', e); }
      if (q.end === 'unlock') { this.locked = false; this.playing = false; }
      else if (q.end === 'stay') this.playing = false;
      else this.close({ frame: this.i, held: 0, done: true });
      return;
    }
    const e = q.list[q.k];
    try { this.args.onStep?.(q.k, e); } catch (err) { console.error('[ui] vhs.onStep', err); }
    if (first && this._clampAll(e.frame) === this.i) { this.onT = 0; return; }
    this.goTo(e.frame, { seek: e.seek ?? SEEK });
  }
  onOpen() { svc.sfx('camcorder_click'); svc.sfx('tape_play', { vol: 0.5 }); }

  /** CG frame for a tape entry (or 'group'). */
  _cgFrame(def) {
    if (def.group) return this.cgFrames >= 6 ? 0 : 'group';
    return this.cgFrames >= 6 ? def.frame + 1 : def.frame;
  }

  _step(d) {
    const j = clamp(this.i + d, this.min, this.max);
    if (j === this.i) { svc.sfx('ui_cancel', { vol: 0.4 }); return; }
    this.i = j; this.seek = SEEK; this.seekDir = d; this.onT = 0;
    svc.sfx('camcorder_whir', { vol: 0.5 });
  }

  update(dt, input) {
    if (this.seek > 0) this.seek = Math.max(0, this.seek - dt);
    else {
      this.onT += dt;
      if (!this.settled.has(this.i)) {
        this.settled.add(this.i);
        try { this.args.onFrame?.(this.i, this.tape[this.i]); } catch (e) { console.error('[ui] vhs.onFrame', e); }
      }
      if (this._isFace() && !this.playing) this.faceHeld = Math.max(this.faceHeld, this.onT);
      if (this._seq) {
        const e = this._seq.list[this._seq.k];
        if (this.onT >= (Number(e?.hold) >= 0 ? Number(e.hold) : 1.6)) this._seqNext();
      } else if (this.playing && this.onT >= this.hold) {
        if (this.i < this.max) this._step(1);
        else this.playing = false;
      }
    }
    if (!input || this.locked || this.closing) return;
    if (input.repeat('left')) { this.playing = false; this._step(-1); }
    else if (input.repeat('right')) { this.playing = false; this._step(1); }
    if (input.pressed('confirm')) { this.playing = !this.playing; svc.sfx('camcorder_click', { vol: 0.6 }); }
    if (input.pressed('cancel') || input.pressed('pause')) {
      svc.sfx('camcorder_click');
      this.close({ frame: this.i, held: Math.round(this.faceHeld * 10) / 10 });
    }
  }

  _isFace() {
    const d = this.tape[this.i];
    return this.tape === DEFAULT_TAPE ? this.i === FACE : d.frame === 4;
  }

  render(ctx) {
    rect(ctx, 0, 0, W, H, '#000');
    const def = this.tape[this.i];
    const cf = this._cgFrame(def);
    const sx = ctx2d(this.src);
    sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalAlpha = 1; sx.globalCompositeOperation = 'source-over';
    if (cf === 'group') sx.drawImage(groupShot(), 0, 0);
    else {
      rect(sx, 0, 0, LW, LH, '#000');
      try { svc.cgArt('vhs_frames')?.draw?.(sx, this.t, { frame: cf }); } catch (e) { svc.warnOnce('vhs.cg', e); }
    }
    const seeking = this.seek > 0;
    vhsFilter(this.src, this.out, this.tmp, this.t, { strength: seeking ? 2 : 1, pause: !this.playing && !seeking });
    if (seeking) {
      // search noise: the picture tears into bands while the heads find the next frame
      const ox = ctx2d(this.out);
      const k = this.seek / SEEK;
      const r = rng(Math.floor(this.t * 60));
      for (let y = 0; y < LH; y += 3) if (r() < 0.35 * k + 0.1) { ox.globalAlpha = 0.5 + r() * 0.5; ox.drawImage(this.src, 0, y, LW, 3, Math.round((r() - 0.5) * 40 * k) * this.seekDir, y, LW, 3); }
      ox.globalAlpha = 1;
      dither(ox, 0, Math.floor((this.t * 400) % LH), LW, 18, 'rgba(240,240,240,1)', 0.35 * k, 1);
    }
    ctx.drawImage(this.out, 0, 0, W, H);
    const mode = seeking ? (this.seekDir < 0 ? 'rew' : 'ff') : this.playing ? 'play' : 'pause';
    vhsOSD(ctx, this.t, { mode, timestamp: def.timestamp, counter: def.counter });
    if (this.args.strip !== false) this._strip(ctx);
    if (!this.locked) hints(ctx, [['EJECT', this.ui.input.keyLabel('cancel')], [this.playing ? 'STILL' : 'PLAY', this.ui.input.keyLabel('confirm')], ['FRAME', '← →']], H - 30, W - 24, '#a8a8a0');
  }

  /** Tape position: one notch per frame, the current one lit. */
  _strip(ctx) {
    const n = this.tape.length, gap = 26, x0 = snap(W / 2 - ((n - 1) * gap) / 2), y = H - 34;
    for (let i = 0; i < n; i++) {
      const on = i === this.i;
      const out = i < this.min || i > this.max;
      rect(ctx, x0 + i * gap - 4 + AP, y + AP, 8, on ? 14 : 8, '#101010');
      rect(ctx, x0 + i * gap - 4, y, 8, on ? 14 : 8, out ? '#3a3a3a' : on ? '#f4f4ec' : '#8a8a84');
    }
  }
}

/**
 * autoAdvance result for 'vhs' (ui.js): a scripted sequence "plays" instantly — onStep / onFrame fire
 * for every entry in order — and resolves { frame, held: 0, done: true }; anything else resolves null.
 */
export function autoVhs(args = {}) {
  const seq = Array.isArray(args.sequence) ? args.sequence.filter((e) => e && Number.isFinite(Number(e.frame))) : [];
  if (!seq.length) return null;
  const tape = Array.isArray(args.frames) && args.frames.length ? args.frames : DEFAULT_TAPE;
  const seen = new Set();
  let last = 0;
  const settle = (i) => {
    if (seen.has(i)) return;
    seen.add(i);
    try { args.onFrame?.(i, tape[i]); } catch (e) { console.error('[ui] vhs.onFrame', e); }
  };
  if (args.start != null) settle(clamp(Number(args.start) || 0, 0, tape.length - 1));
  seq.forEach((e, k) => {
    try { args.onStep?.(k, e); } catch (err) { console.error('[ui] vhs.onStep', err); }
    last = clamp(Math.round(Number(e.frame)), 0, tape.length - 1);
    settle(last);
  });
  try { args.onEnd?.(); } catch (e) { console.error('[ui] vhs.onEnd', e); }
  return { frame: last, held: 0, done: true };
}

// ---- the lobby group shot (fallback until the CG has it) ------------------------------------------------
let groupCanvas = null;
/**
 * "Everybody say Hollow Hell." The camcorder on the lobby bench: the four of them under the portrait,
 * lit by their flashlights; Danny doing bunny ears behind Leah. Built once, from the party sprites.
 */
function groupShot() {
  if (groupCanvas) return groupCanvas;
  const c = canvas(LW, LH); const x = ctx2d(c);
  const r = rng(1018);
  // wall: nicotine cream above a dark green wainscot, marble floor
  rect(x, 0, 0, LW, LH, '#6e6450');
  for (let i = 0; i < 900; i++) { x.fillStyle = r() < 0.5 ? '#766b55' : '#665c49'; x.fillRect(Math.floor(r() * LW), Math.floor(r() * 150), 1 + Math.floor(r() * 3), 1); }
  rect(x, 0, 150, LW, 70, '#2c3a30');
  rect(x, 0, 150, LW, 3, '#5c4a2c');
  for (let i = 0; i < LW; i += 40) rect(x, i, 156, 1, 64, '#24302a');
  rect(x, 0, 220, LW, 50, '#4a4842');
  for (let i = 0; i < 300; i++) { x.fillStyle = r() < 0.5 ? '#55534c' : '#403e39'; x.fillRect(Math.floor(r() * LW), 220 + Math.floor(r() * 50), 2 + Math.floor(r() * 6), 1); }
  // the portrait over their heads: gilt frame; inside, the Founder seated — a vast navy mass, gold
  // epaulettes, a crimson sash, brass buttons, and a small pale face with gray chops
  const px = 168, py = 6, pw = 144, ph = 128;
  rect(x, px - 8, py - 6, pw + 16, ph + 14, '#3a2a0e');
  rect(x, px - 6, py - 4, pw + 12, ph + 10, '#9a7a34');
  rect(x, px - 4, py - 2, pw + 8, ph + 6, '#c8a24c');
  rect(x, px - 2, py, pw + 4, ph + 2, '#5a4318');
  for (let j = 0; j < ph; j++) rect(x, px, py + j, pw, 1, j < ph * 0.6 ? '#2a2418' : '#221c12');
  rect(x, px + 30, py + 30, 84, 90, '#3a1416');                       // the chair's red velvet back
  const cx = px + pw / 2;
  for (let j = 0; j < 92; j++) {                                        // the body: a swollen pear
    const t = j / 92;
    const half = Math.round(18 + Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62) * 44);
    rect(x, cx - half, py + 34 + j, half * 2, 1, (j + (j >> 2)) % 7 === 0 ? '#121a2c' : '#1c2540');
  }
  for (let j = 0; j < 46; j++) rect(x, cx - 40 + j * 1.5, py + 52 + j, 6, 2, j % 9 === 0 ? '#5a0f18' : '#8a1a26'); // sash
  for (const ex of [-1, 1]) { rect(x, cx + ex * 34 - 7, py + 34, 14, 5, '#b8923e'); rect(x, cx + ex * 34 - 5, py + 39, 10, 3, '#8a6a2a'); }
  for (let j = 0; j < 4; j++) rect(x, cx - 1, py + 64 + j * 10, 3, 3, '#c8a24c');                        // buttons
  rect(x, cx - 7, py + 18, 14, 16, '#cbbca2'); rect(x, cx - 7, py + 30, 14, 3, '#9a8c78');               // the small face
  rect(x, cx - 10, py + 22, 3, 10, '#8a8478'); rect(x, cx + 7, py + 22, 3, 10, '#8a8478');               // mutton chops
  rect(x, cx - 4, py + 24, 2, 1, '#3a3028'); rect(x, cx + 2, py + 24, 2, 1, '#3a3028'); rect(x, cx - 2, py + 29, 4, 1, '#7a5a4a');
  rect(x, cx - 7, py + 17, 14, 2, '#a8a094');
  x.fillStyle = 'rgba(40,24,6,0.18)'; x.fillRect(px, py, pw, ph);         // old varnish
  // memorial board on the right, plaque on the left
  rect(x, 382, 40, 84, 64, '#4a3420'); rect(x, 386, 44, 76, 56, '#8a6a44');
  for (let i = 0; i < 9; i++) rect(x, 392 + (i % 3) * 24, 50 + Math.floor(i / 3) * 17, 14, 11, i % 2 ? '#cfc6ae' : '#b7ae96');
  rect(x, 40, 66, 60, 40, '#6a5424'); rect(x, 43, 69, 54, 34, '#a08440');
  for (let i = 0; i < 4; i++) rect(x, 49, 75 + i * 7, 42, 2, '#6a5424');
  // the four of them, from the party sprites, scaled ×3 and standing on the marble
  const S = 3;
  const cast = [['danny', 96], ['leah', 176], ['tess', 256], ['marcus', 336]];
  const sprite = (id) => {
    try {
      const s = HW.art?.sprite?.(id);
      const a = s?.anims?.idle_down || s?.anims?.[Object.keys(s?.anims || {})[0]];
      return a?.frames?.[0] ? { img: a.frames[0], s } : null;
    } catch { return null; }
  };
  x.imageSmoothingEnabled = false;
  const feetY = 262;
  // Danny's bunny ears behind Leah's head (drawn first: her head covers his hand)
  const lx = 176, ly = feetY - 30 * S + 4;
  for (const [ox, lean] of [[-4, -1], [5, 1]]) for (let k = 0; k < 7; k++) rect(x, lx + ox + lean * Math.floor(k / 2), ly + 10 - k * 3, 3, 3, '#e0b08c');
  rect(x, lx - 6, ly + 10, 14, 5, '#e0b08c');
  for (const [id, cx] of cast) {
    const sp = sprite(id);
    if (!sp) continue;
    const { img, s } = sp;
    const dx = cx - (s.ax ?? 12) * S, dy = feetY - (s.ay ?? 30) * S;
    // soft contact shadow
    dither(x, cx - 30, feetY - 6, 60, 10, 'rgba(0,0,0,1)', 0.5);
    x.drawImage(img, dx, dy, img.width * S, img.height * S);
  }
  // their flashlights + the lobby dark: warm centre, heavy falloff
  const g = x.createRadialGradient(LW / 2, 170, 30, LW / 2, 170, 300);
  g.addColorStop(0, 'rgba(255,214,150,0.24)'); g.addColorStop(0.45, 'rgba(0,0,0,0.32)'); g.addColorStop(1, 'rgba(0,0,0,0.9)');
  x.fillStyle = g; x.fillRect(0, 0, LW, LH);
  return (groupCanvas = c);
}
