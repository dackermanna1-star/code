// Capture zones. Control ranges -1..1 (positive = Coalition, negative =
// Federation). A side present alone in the zone pushes control toward itself;
// contested zones freeze. Owners change at full control; crossing zero
// neutralises the zone.

import { clamp } from '../core/math.js';

const _units = [];

export class Objective {
  constructor(o) {
    this.id = o.id;
    this.letter = o.letter;
    this.name = o.name;
    this.x = o.x;
    this.y = o.y || 0;
    this.z = o.z;
    this.radius = o.radius;
    this.owner = o.owner ?? -1;
    this.control = this.owner === 0 ? 1 : this.owner === 1 ? -1 : 0;
    this.counts = [0, 0];
    this.contested = false;
    this.pos = { x: this.x, z: this.z };
    this.lastOwnerChange = -100;
    this.value = 1;
  }

  update(dt, world) {
    world.unitGrid.queryRadius(this.x, this.z, this.radius, _units);
    let a = 0;
    let b = 0;
    for (let i = 0; i < _units.length; i++) {
      const u = _units[i];
      if (!u.alive || u.hidden || u.cat === 'air') continue;
      const w = u.cat === 'veh' ? 2 : 1;
      if (u.faction === 0) a += w;
      else b += w;
    }
    this.counts[0] = a;
    this.counts[1] = b;
    this.contested = a > 0 && b > 0;
    if (this.contested || (a === 0 && b === 0)) return;
    const n = a > 0 ? a : b;
    const dir = a > 0 ? 1 : -1;
    const rate = 0.022 * Math.min(3.5, 0.8 + n * 0.22);
    const prev = this.control;
    this.control = clamp(this.control + dir * rate * dt, -1, 1);
    if (prev > 0 !== this.control > 0 && this.owner !== -1 && Math.sign(this.control) !== (this.owner === 0 ? 1 : -1)) {
      const lost = this.owner;
      this.owner = -1;
      world.emit({ t: 'objective', obj: this, faction: lost, kind: 'neutralized' });
    }
    if (this.control >= 1 && this.owner !== 0) {
      this.owner = 0;
      this.lastOwnerChange = world.time;
      world.emit({ t: 'objective', obj: this, faction: 0, kind: 'captured' });
    } else if (this.control <= -1 && this.owner !== 1) {
      this.owner = 1;
      this.lastOwnerChange = world.time;
      world.emit({ t: 'objective', obj: this, faction: 1, kind: 'captured' });
    }
  }

  // Capture progress toward a faction in 0..1.
  progressFor(f) {
    return f === 0 ? (this.control + 1) / 2 : (1 - this.control) / 2;
  }
}
