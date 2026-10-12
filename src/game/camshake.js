// Camera shake as "trauma": big moments add to a level (0..1) that drains away over the
// shake's duration, and the view moves by trauma² - a small knock barely registers, a blast
// next to you hits hard, and every shake eases out instead of stopping dead. The motion is a
// sum of sines per axis (incommensurate frequencies), so it rolls smoothly from frame to frame
// instead of jumping to a new random spot each frame.
const TAU = Math.PI * 2;
const MAX = [2.6, 2.6, 1.5]; // degrees at full trauma: pitch, yaw, roll
const AMP_FULL = 16; // a shakeAt amplitude that maxes trauma out (a grenade at your feet is 8)
// per axis: [Hz, weight] x3
const WAVES = [
  [6.7, 0.6, 11.3, 0.3, 16.1, 0.1],
  [5.3, 0.6, 9.7, 0.3, 14.9, 0.1],
  [4.3, 0.7, 8.9, 0.3, 0, 0],
];
const PHASE = [0.3, 2.1, 4.4];

export class CamShake {
  constructor() {
    this.trauma = 0;
    this.rate = 1; // trauma lost per second
    this.t = 0;
    this.out = [0, 0, 0];
  }

  /** A knock of amplitude amp (shakeAt's scale, already scaled for distance) that's gone after dur s. */
  add(amp, dur = 0.8) {
    if (!(amp > 0)) return;
    const k = Math.min(1, Math.sqrt(amp / AMP_FULL));
    const left = this.trauma > 0 ? this.trauma / this.rate : 0; // (the running shake's time to go)
    this.trauma = Math.min(1, Math.max(this.trauma, k) + 0.25 * Math.min(this.trauma, k)); // (knocks pile up)
    this.rate = this.trauma / Math.max(left, dur, 0.05);
  }

  clear() { this.trauma = 0; }

  /** The view offset [pitch, yaw, roll] (degrees) after dt more seconds (0: hold, e.g. paused). */
  offset(dt) {
    const o = this.out;
    if (this.trauma <= 0) { o[0] = o[1] = o[2] = 0; return o; }
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - this.rate * dt);
    const s = this.trauma * this.trauma, t = this.t * TAU;
    for (let i = 0; i < 3; i++) {
      const w = WAVES[i], p = PHASE[i];
      o[i] = MAX[i] * s * (w[1] * Math.sin(t * w[0] + p) + w[3] * Math.sin(t * w[2] + 2 * p) + w[5] * Math.sin(t * w[4] + 3 * p));
    }
    return o;
  }
}
