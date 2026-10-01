// Flicker channel animation (uFlick uniform). 0 is always steady.
import { rand2 } from '../core/rng.js';
import { FLICK_CHANNELS } from '../config.js';

export class Flicker {
  constructor() {
    this.v = new Float32Array(FLICK_CHANNELS).fill(1);
    this.prev = new Float32Array(FLICK_CHANNELS).fill(1);
    this.event = 1;        // channel 13 driven by events
    this.heartbeat = 0;    // channel 15
  }
  update(t) {
    const v = this.v;
    this.prev.set(v);
    v[0] = 1;
    for (let ch = 1; ch <= 4; ch++) {
      // mostly steady; occasional stutter bursts
      const slot = Math.floor(t * 0.35 + ch * 3.7);
      const burst = rand2(slot, ch, 11) > 0.8;
      if (burst) {
        const ph = (t * 0.35 + ch * 3.7) - slot;
        if (ph < 0.22) v[ch] = rand2(Math.floor(t * 22), ch, 12) > 0.45 ? 1 : 0.12;
        else v[ch] = 1;
      } else v[ch] = 1;
    }
    for (let ch = 5; ch <= 8; ch++) {
      const slow = rand2(Math.floor(t * 0.5 + ch), ch, 21);
      if (slow > 0.75) v[ch] = 0.08;
      else v[ch] = rand2(Math.floor(t * 14), ch, 22) > 0.32 ? 1 : 0.1;
    }
    for (let ch = 9; ch <= 10; ch++) v[ch] = 0.72 + 0.28 * Math.sin(t * (0.6 + ch * 0.07) + ch) * Math.sin(t * 0.23 + ch * 2);
    for (let ch = 11; ch <= 12; ch++) {
      const slot = Math.floor(t * 9);
      v[ch] = rand2(slot, ch, 31) > 0.94 ? 1 : 0.04;
    }
    v[13] = this.event;
    v[14] = Math.floor(t * 2.7) % 2 ? 1 : 0.55;
    const hb = (t * 0.95) % 1;
    v[15] = 0.35 + 0.65 * (Math.exp(-hb * 18) + 0.6 * Math.exp(-Math.max(0, hb - 0.22) * 18) * (hb > 0.22 ? 1 : 0));
  }
  // channel switched off->on or on->off this frame
  toggled(ch) { return (this.prev[ch] > 0.5) !== (this.v[ch] > 0.5); }
}
