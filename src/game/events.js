// The building's "events": distant, ambiguous, mechanical things happening somewhere else.
// Long stretches of nothing are intentional.
import { RNG } from '../core/rng.js';
import { CHUNK } from '../config.js';

const BY_TONE = {
  yellow: [['click', 3], ['creak', 2], ['pipe_knock', 1.5], ['door_close', 1], ['light', 1.4], ['buzz', 2], ['tile_fall', 0.8], ['phone', 0.7], ['hvac', 0.5], ['thud', 0.7]],
  office: [['door_close', 2.5], ['door_slam', 1], ['vending_start', 1.5], ['click', 2], ['phone', 1.4], ['elevator_ding', 1], ['light', 1], ['creak', 1], ['hvac', 0.6], ['clatter', 0.6]],
  industrial: [['pipe_knock', 3], ['water_rush', 2], ['relay', 2], ['clatter', 1.2], ['thud', 1.5], ['door_slam', 1], ['creak', 1], ['hvac', 0.4]],
  hotel: [['door_close', 3], ['elevator_ding', 1.5], ['click', 1.5], ['creak', 1.5], ['phone', 0.8], ['hvac', 0.5]],
  school: [['door_close', 2], ['door_slam', 1.5], ['click', 2], ['clatter', 1], ['creak', 1.5], ['phone', 0.5]],
  dark: [['creak', 2], ['click', 1.5], ['thud', 1.5], ['pipe_knock', 1.5], ['buzz', 1], ['light', 1]],
  water: [['water_rush', 2], ['creak', 2], ['click', 1], ['thud', 1]],
  outdoor: [['creak', 1], ['thud', 1], ['door_close', 1]],
  void: [['thud', 1], ['creak', 1]],
};

export class Events {
  constructor(game) {
    this.game = game;
    this.rng = new RNG((Date.now() & 0x7fffffff) ^ 0x5bd1e995);
    this.timer = 35;
    this.hvacUntil = 0;
    this.phone = null;
    this.eventLight = null;
  }

  reset() { this.timer = 30 + this.rng.range(0, 30); this.phone = null; this.hvacUntil = 0; this.game.flicker.event = 1; }

  update(dt) {
    const g = this.game, r = this.rng, p = g.player;
    this.timer -= dt;
    const t = g.time;
    if (this.hvacUntil && t > this.hvacUntil) { this.hvacUntil = 0; g.audioCall('setHvac', true); }
    if (this.phone) this.updatePhone(dt);
    if (this.timer > 0) return;
    // long, irregular gaps
    this.timer = r.range(28, 95);
    const tone = (g.env && g.env.tone) || 'yellow';
    const kind = r.weighted(BY_TONE[tone] || BY_TONE.yellow);
    const a = r.range(0, Math.PI * 2), d = r.range(18, 42);
    const x = p.x + Math.sin(a) * d, z = p.z - Math.cos(a) * d, y = p.y + 1.6;
    switch (kind) {
      case 'buzz': g.audioCall('humShift', r.range(-0.5, 0.5), r.range(2, 6)); break;
      case 'hvac':
        if (!this.hvacUntil) { g.audioCall('setHvac', false); this.hvacUntil = t + r.range(35, 100); }
        break;
      case 'light': this.toggleEventLight(); break;
      case 'phone': this.startPhone(); break;
      default: g.audioCall('play', kind, x, y, z, { distant: true, vol: r.range(0.5, 1) });
    }
  }

  // lights on flicker channel 13 are wired to "some other switch"
  toggleEventLight() {
    const g = this.game, p = g.player, f = g.flicker;
    let best = null, bd = 0;
    for (const ch of g.world.chunksNear(p.dim, p.x, p.z, 40)) {
      for (const L of ch.data.lights) {
        if (L.ch !== 13) continue;
        const d = Math.hypot(L.x - p.x, L.z - p.z);
        if (d > 8 && d < 40 && d > bd) { bd = d; best = L; }
      }
    }
    f.event = f.event > 0.5 ? 0 : 1;
    const pos = best || { x: p.x + 25, y: p.y + 2.6, z: p.z };
    g.audioCall('play', f.event ? 'light_on' : 'light_off', pos.x, pos.y, pos.z, { distant: !best || bd > 20 });
  }

  // a telephone rings somewhere out of sight, and stops when you get close
  startPhone() {
    const g = this.game, p = g.player;
    const cands = [];
    for (const ch of g.world.chunksNear(p.dim, p.x, p.z, 48)) {
      for (const it of ch.data.interact) {
        if (it.kind !== 'save' || !it.prop || (it.prop.type !== 'phone' && it.prop.type !== 'payphone')) continue;
        const d = Math.hypot(it.x - p.x, it.z - p.z);
        if (d > 14 && d < 48 && Math.abs(it.y - p.y) < 4) cands.push(it);
      }
    }
    const it = cands.length ? this.rng.pick(cands) : null;
    const a = this.rng.range(0, 6.28);
    this.phone = { x: it ? it.x : p.x + Math.sin(a) * 30, y: it ? it.y : p.y + 1, z: it ? it.z : p.z - Math.cos(a) * 30, rings: this.rng.int(3, 8), t: 0, real: !!it };
  }

  updatePhone(dt) {
    const g = this.game, p = g.player, ph = this.phone;
    ph.t -= dt;
    const d = Math.hypot(ph.x - p.x, ph.z - p.z);
    if (d < 6) { this.phone = null; return; }   // it always stops just before you get there
    if (ph.t <= 0) {
      if (ph.rings-- <= 0) { this.phone = null; return; }
      g.audioCall('play', 'phone_ring', ph.x, ph.y, ph.z, { distant: d > 20 });
      ph.t = 4.2;
    }
  }

  // the phone the player picked up was the one ringing
  answered(it) {
    if (!this.phone) return false;
    if (Math.hypot(this.phone.x - it.x, this.phone.z - it.z) < 1) { this.phone = null; return true; }
    return false;
  }
}
void CHUNK;
