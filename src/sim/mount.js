// A weapon instance on a unit: magazine, reserve ammo, rate of fire, bursts,
// pauses between bursts and reloads. The owning AI "pulls the trigger" each
// tick; pull() returns how many rounds leave the barrel this tick.

import { rng } from '../core/rng.js';
import { WEAPONS, chooseAmmo } from './weapons.js';

export class WeaponMount {
  constructor(def, unit, mount = 'gun') {
    this.def = typeof def === 'string' ? WEAPONS[def] : def;
    this.unit = unit;
    this.mount = mount;
    this.mag = this.def.mag ?? 1;
    this.reserve = this.def.ammo === Infinity ? Infinity : Math.max(0, (this.def.ammo ?? 0) - this.mag);
    this.reloadT = 0;
    this.pauseT = 0;
    this.burstLeft = 0;
    this.accum = 0;
    this.ammoType = this.def.ammoTypes ? Object.keys(this.def.ammoTypes)[0] : null;
    this.target = null;
    this.aimT = 0; // seconds spent aiming at the current target
    this.lastShot = -100;
    this.shots = 0;
    this.disabled = false;
  }

  get empty() {
    return this.mag <= 0 && this.reserve <= 0;
  }

  get reloading() {
    return this.reloadT > 0;
  }

  get ready() {
    return !this.disabled && this.reloadT <= 0 && this.pauseT <= 0 && this.mag > 0;
  }

  get totalAmmo() {
    return this.mag + this.reserve;
  }

  selectAmmo(targetClass) {
    const a = chooseAmmo(this.def, targetClass);
    if (a && a !== this.ammoType) {
      this.ammoType = a;
      // Switching ammo on a single-round gun means unloading: short delay.
      if (this.def.mag === 1 && this.reloadT <= 0) this.reloadT = this.def.reload * 0.5;
    }
  }

  startReload() {
    if (this.reloadT > 0 || this.reserve <= 0) return;
    this.reloadT = this.def.reload * rng.range(0.9, 1.15);
  }

  update(dt) {
    if (this.pauseT > 0) this.pauseT -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloadT = 0;
        const need = (this.def.mag ?? 1) - this.mag;
        const take = Math.min(need, this.reserve);
        this.mag += take;
        if (this.reserve !== Infinity) this.reserve -= take;
      }
    }
  }

  // Release the trigger: resets the burst so the next pull starts a new one.
  release() {
    this.burstLeft = 0;
    this.accum = 0;
  }

  pull(dt) {
    if (this.disabled || this.reloadT > 0 || this.pauseT > 0) return 0;
    if (this.mag <= 0) {
      this.startReload();
      return 0;
    }
    const def = this.def;
    if (this.burstLeft <= 0) {
      this.burstLeft = rng.int(def.burst[0], def.burst[1]);
      this.accum = 1; // first round of a burst fires immediately
      this.newBurst = true;
    } else {
      this.accum += (dt * def.rpm) / 60;
    }
    let n = 0;
    while (this.accum >= 1 && this.burstLeft > 0 && this.mag > 0) {
      n++;
      this.accum -= 1;
      this.burstLeft--;
      this.mag--;
    }
    if (this.burstLeft <= 0) {
      this.pauseT = rng.range(def.pause[0], def.pause[1]);
      this.accum = 0;
    }
    if (this.mag <= 0) this.startReload();
    this.shots += n;
    return n;
  }
}
