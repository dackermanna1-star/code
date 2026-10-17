// 'breath' — hold your breath in the locker. args { seconds } → 'held' | 'failed'.
// Press and hold confirm; a lung meter drains while a heartbeat speeds up and the dark closes in.
// Letting go early fails; never starting (within a few seconds) fails too.
import { Screen, Z_SPECIAL } from '../screen.js';
import { C, F, W, H } from '../theme.js';
import { rect, frame, dither, vignette, keycap, AP, clamp, snap, keycapWidth } from '../gfx.js';
import { spaced } from '../widgets.js';
import { hash2 } from '../../art/util.js';
import * as svc from '../services.js';

const START_WINDOW = 3.5;

export class BreathScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.z = Z_SPECIAL;
    this.fadeIn = 0.3; this.fadeOut = 0.5;
    this.seconds = Math.max(1, Number(args.seconds) || 6);
    this.held = 0; this.started = false; this.beatT = 0; this.done = false;
    this.flash = 0;
  }
  onOpen() { svc.sfx('heartbeat', { vol: 0.5 }); }
  _end(res) {
    if (this.done) return;
    this.done = true;
    svc.sfx('breath_release', { vol: res === 'held' ? 0.6 : 1 }); // a held breath let go — or a gasp
    if (res === 'failed') this.flash = 1;
    this.after(res === 'held' ? 0.25 : 0.5, () => this.close(res));
  }
  update(dt, input) {
    this.flash = Math.max(0, this.flash - dt * 2);
    if (this.done) return;
    const down = input ? input.down('confirm') : false;
    if (!this.started) {
      if (down) { this.started = true; svc.sfx('breath_hold'); }
      else if (this.t > START_WINDOW) this._end('failed');
      return;
    }
    if (!down) { this._end('failed'); return; }
    this.held += dt;
    // heartbeat accelerates from ~60 to ~150 bpm
    const p = this.held / this.seconds;
    const interval = 60 / (60 + p * 90);
    this.beatT += dt;
    if (this.beatT >= interval) { this.beatT = 0; svc.sfx('heartbeat', { vol: 0.5 + p * 0.5, rate: 1 + p * 0.25 }); }
    if (this.held >= this.seconds) this._end('held');
  }
  render(ctx) {
    const p = clamp(this.held / this.seconds);
    const beat = this.started ? Math.max(0, 1 - this.beatT * 6) : 0;
    // the dark closes in with each heartbeat
    vignette(ctx, 0.75 + p * 0.25, Math.round((0.7 - p * 0.35 - beat * 0.04) * 20) / 20);
    if (p > 0.5) dither(ctx, 0, 0, W, H, 'rgba(40,0,6,1)', (p - 0.5) * 0.3 + beat * 0.05);
    // lung meter
    const mw = 360, mh = 18;
    const shake = p > 0.65 ? ((hash2(Math.floor(this.t * 30), 4) % 3) - 1) * AP * (p > 0.85 ? 2 : 1) : 0;
    const mx = snap(W / 2 - mw / 2) + shake, my = 470;
    rect(ctx, mx - 4, my - 4, mw + 8, mh + 8, 'rgba(0,0,0,0.8)');
    frame(ctx, mx - 2, my - 2, mw + 4, mh + 4, '#5a5860');
    const left = 1 - p;
    const col = left < 0.25 ? C.red : left < 0.5 ? '#c9aa47' : '#cfc6ab';
    rect(ctx, mx, my, snap(mw * left), mh, col);
    for (let i = 1; i < 12; i++) rect(ctx, mx + snap(mw * i / 12), my, AP, mh, 'rgba(0,0,0,0.45)');
    const f = F.small;
    if (!this.started) {
      const a = 0.5 + 0.5 * Math.abs(Math.sin(this.t * 4));
      const key = this.ui.input.keyLabel('confirm');
      const label = spaced('Hold your breath');
      const lw = f.width(label), kw = keycapWidth(key, f);
      const x0 = snap(W / 2 - (lw + kw + 16) / 2);
      keycap(ctx, x0, my - 40, key, f);
      f.draw(ctx, label, x0 + kw + 16, my - 40, '#e8e0c8', { alpha: a });
    } else f.draw(ctx, spaced(p > 0.8 ? "Don't breathe" : 'Hold it'), W / 2, my - 36, p > 0.8 ? C.red : '#a39c88', { align: 'center' });
    if (this.flash > 0 && !svc.reduceFlashing()) rect(ctx, 0, 0, W, H, `rgba(120,10,16,${this.flash * 0.35})`);
  }
}
