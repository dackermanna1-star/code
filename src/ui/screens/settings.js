// Settings: volume sliders (applied live via HW.audio.setVolumes), text speed, display toggles,
// fullscreen and the controls list. Persisted via HW.settings (or localStorage) on close.
// "Pixel-perfect scaling" ON = strict whole-number scale with a black border; OFF (default) fills the
// window with sharp scaling (engine/display.js).
import { HW } from '../../engine/hw.js';
import { Screen } from '../screen.js';
import { C, F, W } from '../theme.js';
import { steelPanel, rect, frame, triangle, keycap, AP, clamp, ease, snap } from '../gfx.js';
import { headerTab, hints } from '../widgets.js';
import { DEFAULT_KEYS, prettyKey } from '../input.js';
import * as svc from '../services.js';

const SPEEDS = [0.5, 0.75, 1, 1.5, 2, 4];
const SPEED_NAMES = ['Slow', 'Calm', 'Normal', 'Brisk', 'Fast', 'Instant'];

const ROWS = [
  { key: 'master', label: 'Master volume', type: 'slider' },
  { key: 'music', label: 'Music', type: 'slider' },
  { key: 'sfx', label: 'Sound effects', type: 'slider' },
  { key: 'ambience', label: 'Ambience', type: 'slider' },
  { key: 'textSpeed', label: 'Text speed', type: 'speed' },
  { key: 'pixelPerfect', label: 'Pixel-perfect scaling', type: 'toggle' },
  { key: 'crt', label: 'CRT scanlines', type: 'toggle' },
  { key: 'grain', label: 'Film grain', type: 'toggle' },
  { key: 'reduceFlashing', label: 'Reduce flashing', type: 'toggle' },
  { key: 'fullscreen', label: 'Fullscreen', type: 'toggle' },
  { key: 'controls', label: 'Controls', type: 'link' },
  { key: 'back', label: 'Back', type: 'link' },
];

const CONTROL_LIST = [
  ['Move', ['up', 'down', 'left', 'right']], ['Interact / advance', ['confirm']], ['Back', ['cancel']], ['Run (loud)', ['run']],
  ['Flashlight', ['flashlight']], ['Bag', ['inventory']], ['Sketchbook', ['sketchbook']], ['Compact mirror', ['compact']], ['Pause', ['pause']],
];

export class SettingsScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.pausesGame = true; this.singleton = true;
    this.dimWorld = 0.7;
    this.sel = 0; this.showControls = false;
  }
  onOpen() { svc.sfx('ui_open'); }
  onClose() { svc.settings.save(); }
  /** Fullscreen shows the live state (a stored value can't be restored without a gesture, and Esc /
   *  F11 leave it behind the settings' back). */
  _get(k) { return k === 'fullscreen' && HW.display ? !!HW.display.fullscreen : svc.settings.get(k); }
  _adjust(row, dir) {
    const k = row.key;
    if (row.type === 'slider') {
      const v = clamp(Math.round((Number(this._get(k)) || 0) * 10 + dir) / 10);
      svc.settings.set(k, v);
      svc.sfx('ui_move', { vol: Math.max(0.2, v) });
    } else if (row.type === 'speed') {
      const cur = Number(this._get(k)) || 1;
      let i = SPEEDS.reduce((bi, s, j) => (Math.abs(s - cur) < Math.abs(SPEEDS[bi] - cur) ? j : bi), 0);
      i = Math.max(0, Math.min(SPEEDS.length - 1, i + dir));
      svc.settings.set(k, SPEEDS[i]); svc.sfx('ui_move');
    } else if (row.type === 'toggle') {
      svc.settings.set(k, !this._get(k)); svc.sfx('ui_confirm');
    }
  }
  update(dt, input) {
    if (!input) return;
    if (this.showControls) {
      if (input.pressed('cancel') || input.pressed('confirm') || input.pressed('pause')) { this.showControls = false; svc.sfx('ui_cancel'); }
      return;
    }
    const n = ROWS.length;
    if (input.repeat('up')) { this.sel = (this.sel + n - 1) % n; svc.sfx('ui_move'); }
    if (input.repeat('down')) { this.sel = (this.sel + 1) % n; svc.sfx('ui_move'); }
    const row = ROWS[this.sel];
    if (input.repeat('left')) this._adjust(row, -1);
    if (input.repeat('right')) this._adjust(row, +1);
    if (input.pressed('confirm')) {
      if (row.type === 'toggle') this._adjust(row, 1);
      else if (row.key === 'controls') { this.showControls = true; svc.sfx('ui_confirm'); }
      else if (row.key === 'back') { svc.sfx('ui_close'); this.close(null); }
    } else if (input.pressed('cancel') || input.pressed('pause')) { svc.sfx('ui_close'); this.close(null); }
  }
  render(ctx) {
    const k = ease.out(clamp(this.t / 0.2));
    const x = 150, y = snap(44 + (1 - k) * 20), w = 660, h = 452;
    steelPanel(ctx, x, y, w, h, { fill: 'rgba(10,11,14,0.96)', rivets: true, seed: 21 });
    headerTab(ctx, x + 24, y - 14, 'Settings');
    const f = F.small;
    const rowH = 34;
    ROWS.forEach((row, i) => {
      const ry = y + 30 + i * rowH + (i >= 10 ? 10 : 0);
      const on = i === this.sel;
      if (on) { rect(ctx, x + 12, ry - 4, w - 24, rowH - 4, 'rgba(232,224,200,0.07)'); rect(ctx, x + 12, ry - 4, AP, rowH - 4, C.red); }
      f.draw(ctx, row.label, x + 40, ry + 2, on ? C.textHi : C.textDim);
      const vx = x + 380;
      if (row.type === 'slider') this._slider(ctx, vx, ry + 4, Number(this._get(row.key)) || 0, on);
      else if (row.type === 'speed') {
        const cur = Number(this._get(row.key)) || 1;
        const i2 = SPEEDS.reduce((bi, s, j) => (Math.abs(s - cur) < Math.abs(SPEEDS[bi] - cur) ? j : bi), 0);
        for (let j = 0; j < SPEEDS.length; j++) rect(ctx, vx + j * 28, ry + 6, 20, 12, j <= i2 ? (on ? '#d8cfb4' : '#8f897a') : '#2a2a31');
        f.draw(ctx, SPEED_NAMES[i2], vx + 180, ry + 2, on ? C.text : C.textMute);
      } else if (row.type === 'toggle') {
        const v = !!this._get(row.key);
        // a little steel toggle switch
        rect(ctx, vx, ry + 2, 56, 20, '#1a1a20'); frame(ctx, vx, ry + 2, 56, 20, '#4b4c57');
        rect(ctx, v ? vx + 30 : vx + 4, ry + 6, 22, 12, v ? (on ? '#d8cfb4' : '#a39c88') : '#55545c');
        f.draw(ctx, v ? 'ON' : 'OFF', vx + 70, ry + 2, v ? (on ? C.text : C.textDim) : C.textMute);
      } else if (row.key === 'controls' && on) triangle(ctx, vx, ry + 6, 5, C.textDim, 'right');
      if (on && (row.type === 'slider' || row.type === 'speed')) {
        triangle(ctx, vx - 22, ry + 6, 5, C.red, 'left');
        triangle(ctx, vx + (row.type === 'slider' ? 214 : 168), ry + 6, 5, C.red, 'right');
      }
    });
    if (this.showControls) this._controls(ctx);
    hints(ctx, [['BACK', this.ui.input.keyLabel('cancel')], ['ADJUST', '← →']]);
  }
  _slider(ctx, x, y, v, on) {
    // a fader on a slotted steel plate, ten notches
    rect(ctx, x, y + 6, 200, 4, '#0c0c10');
    for (let i = 0; i <= 10; i++) rect(ctx, x + i * 20, y + 12, AP, i % 5 === 0 ? 6 : 4, '#4b4c57');
    const fx = snap(x + v * 200 - 6);
    rect(ctx, fx, y - 2, 12, 20, on ? '#d8cfb4' : '#8f897a');
    rect(ctx, fx, y - 2, 12, AP, '#f2ead2'); rect(ctx, fx + 4, y + 6, 4, 4, '#3a3a40');
    F.small.draw(ctx, String(Math.round(v * 100)), x + 268, y - 2, on ? C.text : C.textMute, { align: 'right' });
  }
  _controls(ctx) {
    const x = 210, y = 80, w = 540, h = 380;
    steelPanel(ctx, x, y, w, h, { fill: 'rgba(8,9,12,0.98)', rivets: true, seed: 22 });
    headerTab(ctx, x + 24, y - 14, 'Controls');
    const f = F.small;
    CONTROL_LIST.forEach(([label, acts], i) => {
      const ry = y + 30 + i * 36;
      f.draw(ctx, label, x + 36, ry + 4, C.textDim);
      let kx = x + 260;
      const keys = this._keysFor(acts);
      keys.forEach((kname) => { kx += keycap(ctx, kx, ry, kname, f) + 8; });
    });
  }
  _keysFor(acts) {
    const eng = this.ui.input.engine;
    const out = [];
    for (const a of acts) {
      const list = eng?.bindings?.[a] || eng?.keys?.[a] || DEFAULT_KEYS[a] || [];
      const pk = list.map(prettyKey);
      if (acts.length > 1) { if (pk[0]) out.push(pk[0]); } else out.push(...pk.slice(0, 3));
    }
    if (acts.length > 1) out.push('/', 'W A S D');
    return out;
  }
}
