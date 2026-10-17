// 'vhs' — Leah's tape in the camcorder: a frame scrubber (DESIGN §6 II.3, CONTENT §7).
// args (all optional) {
//   frames:   [{ frame?: n (vhs_frames CG index) | group: true, timestamp, counter? }]  (default: the Room 103 tape)
//   start:    first tape frame shown (default 0) · min / max: scrub limits (default the whole tape)
//   autoplay: true → plays forward from `start` (each frame `hold` s, default 1.6) and stops on the last
//   onFrame:  (index, frameDef) => void — fired when a frame first settles (scripts time stingers on it)
// } → resolves with { frame, held } when ejected (cancel): the frame it stopped on and the longest time
//     the player held still on the face frame.
// ←/→ step a frame (rewind / fast-forward with tracking noise between), Confirm toggles PLAY / STILL.
//
// Frame 0 of the tape is the lobby group shot (DESIGN). The vhs_frames CG currently starts at the
// heads-down shot (frames 0..4), so unless the CG reports `frames >= 6` the UI composes the group shot
// itself from the party's sprites and tape frame i>0 maps to CG frame i-1.
import { Screen, Z_SPECIAL } from '../screen.js';
import { C, F, W, H } from '../theme.js';
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
      if (this.playing && this.onT >= this.hold) {
        if (this.i < this.max) this._step(1);
        else this.playing = false;
      }
    }
    if (!input) return;
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
    this._strip(ctx);
    hints(ctx, [['EJECT', this.ui.input.keyLabel('cancel')], [this.playing ? 'STILL' : 'PLAY', this.ui.input.keyLabel('confirm')], ['FRAME', '← →']], H - 30, W - 24, '#a8a8a0');
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
  // the portrait over their heads: gilt frame, a seated dark mass, a crimson sash, a small pale face
  const px = 176, py = 8, pw = 128, ph = 120;
  rect(x, px - 6, py - 6, pw + 12, ph + 12, '#5a4318'); rect(x, px - 4, py - 4, pw + 8, ph + 8, '#9a7a34'); rect(x, px - 2, py - 2, pw + 4, ph + 4, '#3a2a10');
  rect(x, px, py, pw, ph, '#1a1712');
  for (let j = 0; j < 80; j++) { const w = 30 + Math.round(Math.sin(j / 80 * Math.PI) * 40); rect(x, px + pw / 2 - w, py + 34 + j, w * 2, 1, j % 3 ? '#1c2234' : '#202840'); }
  rect(x, px + 40, py + 70, 52, 4, '#7a1622'); rect(x, px + 38, py + 74, 56, 2, '#5a0f18');
  rect(x, px + 58, py + 22, 12, 13, '#c9b9a0'); rect(x, px + 56, py + 30, 3, 6, '#8a8478'); rect(x, px + 69, py + 30, 3, 6, '#8a8478');
  rect(x, px + 50, py + 44, 4, 3, '#b08a3a'); rect(x, px + 76, py + 44, 4, 3, '#b08a3a');
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
  for (const [id, cx] of cast) {
    const sp = sprite(id);
    if (!sp) continue;
    const { img, s } = sp;
    const dx = cx - (s.ax ?? 12) * S, dy = feetY - (s.ay ?? 30) * S;
    // soft contact shadow
    dither(x, cx - 30, feetY - 6, 60, 10, 'rgba(0,0,0,1)', 0.5);
    x.drawImage(img, dx, dy, img.width * S, img.height * S);
  }
  // Danny's bunny ears behind Leah's head
  const lx = 176, ly = feetY - 30 * S - 10;
  for (const [ox, lean] of [[-4, -1], [5, 1]]) for (let k = 0; k < 7; k++) rect(x, lx + ox + lean * Math.floor(k / 2), ly + 10 - k * 3, 3, 3, '#e0b08c');
  rect(x, lx - 6, ly + 10, 14, 5, '#e0b08c');
  // their flashlights + the lobby dark: warm centre, heavy falloff
  const g = x.createRadialGradient(LW / 2, 170, 30, LW / 2, 170, 300);
  g.addColorStop(0, 'rgba(255,214,150,0.22)'); g.addColorStop(0.5, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
  x.fillStyle = g; x.fillRect(0, 0, LW, LH);
  return (groupCanvas = c);
}
