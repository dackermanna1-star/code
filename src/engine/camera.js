// Camera: smooth follow of the player, clamped to the map (centred when the map is smaller than
// the view), scripted pans (g.cam) and the shake offset from FX.
//
// HW.camera.view = { x, y, w: 480, h: 270 } — integer top-left of the view in world px including
// shake; this is the `cam` object passed to every render function. Reused every frame.
import HW from './hw.js';
import { resolvePoint } from './entities.js';

const VIEW_W = 480;
const VIEW_H = 270;
const FOLLOW_RATE = 9;     // 1/s — exponential smoothing toward the follow target
const SNAP_DIST = 240;     // px — jump instead of gliding across the map
const FOCUS_LIFT = 14;     // centre a little above the feet so the character sits mid-screen

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export const camera = {
  x: 0,
  y: 0,
  w: VIEW_W,
  h: VIEW_H,
  view: { x: 0, y: 0, w: VIEW_W, h: VIEW_H },
  /** null = follow the player; otherwise a point spec (anchor | [tx,ty] | entity | {x,y}). */
  focus: null,
  _tween: null,
  _pt: { x: 0, y: 0 },

  _focusPoint() {
    const pt = this._pt;
    if (this.focus) {
      const r = resolvePoint(this.focus);
      if (r) { pt.x = r.x; pt.y = r.y - FOCUS_LIFT; return pt; }
    }
    const p = HW.player;
    if (p) { pt.x = p.x; pt.y = p.y - FOCUS_LIFT; } else { pt.x = VIEW_W / 2; pt.y = VIEW_H / 2; }
    return pt;
  },

  /** Desired top-left for a focus point, clamped to the map. Writes into this._pt. */
  _desired() {
    const pt = this._focusPoint();
    const map = HW.map;
    const past = !this.focus && HW.compact?.active ? HW.compact.current : null;
    if (past && past.rect) return this._pastFrame(pt, past.rect);
    let x = pt.x - VIEW_W / 2;
    let y = pt.y - VIEW_H / 2;
    if (map) {
      x = map.pw <= VIEW_W ? (map.pw - VIEW_W) / 2 : Math.max(0, Math.min(map.pw - VIEW_W, x));
      y = map.ph <= VIEW_H ? (map.ph - VIEW_H) / 2 : Math.max(0, Math.min(map.ph - VIEW_H, y));
    }
    pt.x = x;
    pt.y = y;
    return pt;
  },

  /**
   * Compact past view: frame the remembered room inside the mirror's glass circle. Rooms that fit
   * are centred; larger ones follow the player but never show more than the room allows. The
   * frame hides everything outside the circle, so map clamping doesn't apply here.
   */
  _pastFrame(pt, rect) {
    const circle = HW.ui?.compactCircle || { x: VIEW_W / 2, y: VIEW_H / 2, r: 100 };
    const r = circle.r * 0.8;
    const x0 = rect[0] * 16;
    const y0 = rect[1] * 16;
    const x1 = x0 + rect[2] * 16;
    const y1 = y0 + rect[3] * 16;
    const cx = x1 - x0 <= r * 2 ? (x0 + x1) / 2 : Math.max(x0 + r, Math.min(x1 - r, pt.x));
    const cy = y1 - y0 <= r * 2 ? (y0 + y1) / 2 : Math.max(y0 + r, Math.min(y1 - r, pt.y));
    pt.x = cx - circle.x;
    pt.y = cy - circle.y;
    return pt;
  },

  /** Jump straight to the target (map loads). */
  snap() {
    const d = this._desired();
    this.x = d.x;
    this.y = d.y;
    this._finishTween();
    this._updateView();
  },

  /**
   * Pan to a target (anchor | entity id | [tx,ty] | {x,y}) or back to the player (null) over
   * `time` seconds. Resolves when the pan completes; the camera then stays on the target.
   */
  pan(target, { time = 1 } = {}) {
    this._finishTween();
    if (typeof target === 'string' && HW.entities?.get(target) && !HW.map?.anchors?.[target]) target = `@${target}`;
    this.focus = target ?? null;
    if (time <= 0) { this.snap(); return Promise.resolve(); }
    return new Promise((resolve) => {
      this._tween = { fromX: this.x, fromY: this.y, t: 0, dur: time, resolve };
    });
  },

  _finishTween() {
    const tw = this._tween;
    this._tween = null;
    if (tw) tw.resolve();
  },

  /** Back to following the player immediately (used on map loads and resets). */
  reset() {
    this.focus = null;
    this._finishTween();
  },

  update(dt) {
    if (!HW.map) return;
    const d = this._desired();
    const tw = this._tween;
    if (tw) {
      tw.t += dt;
      const k = ease(Math.min(1, tw.t / tw.dur));
      this.x = tw.fromX + (d.x - tw.fromX) * k;
      this.y = tw.fromY + (d.y - tw.fromY) * k;
      if (tw.t >= tw.dur) this._finishTween();
    } else if (Math.abs(d.x - this.x) > SNAP_DIST || Math.abs(d.y - this.y) > SNAP_DIST) {
      this.x = d.x;
      this.y = d.y;
    } else {
      const k = 1 - Math.exp(-dt * FOLLOW_RATE);
      this.x += (d.x - this.x) * k;
      this.y += (d.y - this.y) * k;
      if (Math.abs(d.x - this.x) < 0.05) this.x = d.x;
      if (Math.abs(d.y - this.y) < 0.05) this.y = d.y;
    }
    this._updateView();
  },

  _updateView() {
    const off = HW.fx?.offset;
    this.view.x = Math.round(this.x + (off ? off.x || 0 : 0));
    this.view.y = Math.round(this.y + (off ? off.y || 0 : 0));
  },

  /** World px → UI-buffer px (960×540), for UI elements anchored to the world. */
  toUI(x, y, out = { x: 0, y: 0 }) {
    out.x = (x - this.view.x) * 2;
    out.y = (y - this.view.y) * 2;
    return out;
  },
};

export default camera;
