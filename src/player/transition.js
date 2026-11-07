import * as THREE from 'three';
import { clamp } from '../core/util.js';
import { easeInOutCubic, easeInOutSine } from './springs.js';

// =============================================================================
// Eased camera path used for sitting down / standing up / walking into a row.
// The eye follows a centripetal Catmull-Rom spline (arc-length parameterised,
// eased), yaw/pitch follow key frames (unwrapped angles, so the caller chooses
// the turning direction), and timed callbacks fire sounds / state changes.
// =============================================================================

function evalKeys(keys, u) {
  if (!keys || keys.length === 0) return 0;
  if (u <= keys[0].u) return keys[0].v;
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (u <= b.u) {
      const a = keys[i - 1];
      const t = (u - a.u) / Math.max(1e-6, b.u - a.u);
      return a.v + (b.v - a.v) * easeInOutSine(t);
    }
  }
  return keys[keys.length - 1].v;
}

export class PathTransition {
  constructor() {
    this.active = false;
    this.eye = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.u = 0;
    this.kind = null;
  }

  /**
   * @param {object} o
   * @param {THREE.Vector3[]} o.points eye path (>= 2 points)
   * @param {number} o.duration seconds
   * @param {{u:number, v:number}[]} o.yaw  key frames (radians, unwrapped)
   * @param {{u:number, v:number}[]} o.pitch
   * @param {{u:number, fn:Function}[]} [o.events]
   * @param {Function} [o.onDone]
   * @param {string} [o.kind]
   */
  start(o) {
    const pts = o.points;
    this.curve = pts.length >= 3 ? new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5) : new THREE.LineCurve3(pts[0], pts[pts.length - 1]);
    this.duration = Math.max(0.05, o.duration);
    this.yawKeys = o.yaw;
    this.pitchKeys = o.pitch;
    this.events = (o.events || []).map((e) => ({ ...e, done: false })).sort((a, b) => a.u - b.u);
    this.onDone = o.onDone || null;
    this.ease = o.ease || easeInOutCubic;
    this.kind = o.kind || null;
    this.t = 0;
    this.u = 0;
    this.active = true;
    this._sample(0);
  }

  _sample(u) {
    const e = clamp(this.ease(u), 0, 1);
    this.curve.getPointAt(e, this.eye);
    this.yaw = evalKeys(this.yawKeys, u);
    this.pitch = evalKeys(this.pitchKeys, u);
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const u = clamp(this.t / this.duration, 0, 1);
    this.u = u;
    this._sample(u);
    for (const ev of this.events) {
      if (!ev.done && u >= ev.u) { ev.done = true; try { ev.fn(); } catch (e) { console.warn('[player] transition event failed', e); } }
    }
    if (u >= 1) this.finish();
  }

  /** Jump to the end (fires the remaining events and onDone). */
  finish() {
    if (!this.active) return;
    this._sample(1);
    for (const ev of this.events) if (!ev.done) { ev.done = true; try { ev.fn(); } catch (e) { console.warn(e); } }
    this.active = false;
    const cb = this.onDone; this.onDone = null;
    if (cb) { try { cb(); } catch (e) { console.warn('[player] transition onDone failed', e); } }
  }

  cancel() { this.active = false; this.onDone = null; }
}
