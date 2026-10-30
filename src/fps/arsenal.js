import { WEAPONS } from '../game/weapons.js';
import { clamp } from '../physics/math.js';

/**
 * The player's guns: magazine and reserve ammunition, fire rate, reloads (the shotgun one shell at
 * a time), switching, aiming down the sights. The bullets themselves are the sandbox's ballistics
 * (Sandbox.fire); this only decides when a round goes off and how far it may stray.
 *
 * Spread multiplies the weapon's own (WEAPONS[type].spread): aimed ~0.3, from the hip 1, more on the
 * move, much more in the air. Recoil is a kick to the view (pitch up, a little sideways) that the
 * player recovers from.
 */
export const LOADOUT = [
  { type: 'pistol', mag: 15, reserve: 105, reload: 1.35, ads: 1.25, kickUp: 0.022, kickSide: 0.008, adsSpread: 0.35, hipSpread: 2.2 },
  { type: 'rifle', mag: 30, reserve: 210, reload: 2.25, ads: 1.6, kickUp: 0.014, kickSide: 0.007, adsSpread: 0.3, hipSpread: 5.5 },
  { type: 'shotgun', mag: 7, reserve: 49, reload: 0.55, perShell: true, pump: 0.62, ads: 1.3, kickUp: 0.06, kickSide: 0.015, adsSpread: 0.75, hipSpread: 1.25 },
  { type: 'smg', mag: 32, reserve: 224, reload: 1.85, ads: 1.4, kickUp: 0.009, kickSide: 0.008, adsSpread: 0.45, hipSpread: 2.0 },
];

export class Arsenal {
  constructor() {
    this.guns = LOADOUT.map((d) => ({ ...d, w: WEAPONS[d.type], ammo: d.mag, spare: d.reserve, cool: 0 }));
    this.index = 0;
    this.prevIndex = 1;
    this.state = 'equip'; // idle | reload | equip | holster | pump
    this.t = 0;
    this.adsAmount = 0; // 0 hip .. 1 aimed (smoothed)
    this.ads = false;
    this.events = [];
    this.triggerHeld = false;
    this.shotsInBurst = 0;
    this.pending = null; // weapon to draw after the holster
    this.reloadShells = 0;
  }

  get gun() {
    return this.guns[this.index];
  }

  /** Fill everything up (a new game, a wave cleared). `frac` of the full reserve. */
  restock(frac = 1) {
    for (const g of this.guns) {
      g.spare = Math.max(g.spare, Math.round(g.reserve * frac));
      if (frac >= 1) g.ammo = g.mag;
    }
  }

  select(i) {
    if (i === this.index || i < 0 || i >= this.guns.length) return;
    if (this.state === 'holster' || this.state === 'equip') {
      this.pending = i;
      return;
    }
    this.pending = i;
    this.state = 'holster';
    this.t = 0;
    this.events.push({ type: 'holster', gun: this.gun });
  }

  swapLast() {
    this.select(this.prevIndex);
  }

  reload() {
    const g = this.gun;
    if (this.state !== 'idle' || g.ammo >= g.mag || g.spare <= 0) return;
    this.state = 'reload';
    this.t = 0;
    this.reloadShells = 0;
    this.events.push({ type: 'reloadStart', gun: g, empty: g.ammo === 0 });
  }

  /** How far a round strays (multiplier on the weapon's spread) given the stance and motion. */
  spreadScale(player) {
    const g = this.gun;
    const s = clamp(player.speed / 3.3, 0, 1.6);
    let k = g.hipSpread + (g.adsSpread - g.hipSpread) * this.adsAmount;
    k *= 1 + 0.9 * s * (1 - 0.5 * this.adsAmount) + 0.25 * this.shotsInBurst * (g.w.auto ? 0.25 : 0);
    if (!player.onGround) k *= 2.5;
    if (player.crouch > 0.5) k *= 0.75;
    return Math.min(k, 9);
  }

  /**
   * Per frame. Returns true when a round goes off this frame (the caller fires it and applies the
   * recoil from `recoil()`). trigger: held this frame; sprinting: the gun is down while sprinting.
   */
  update(dt, trigger, sprinting) {
    this.events.length = 0;
    this.t += dt;
    const g = this.gun;
    g.cool = Math.max(0, g.cool - dt);
    // aim down the sights (not while sprinting or reloading a long gun's magazine)
    const canAim = !sprinting && this.state !== 'holster' && this.state !== 'equip';
    const want = this.ads && canAim ? 1 : 0;
    const rate = 1 / (g.ads * 0.18);
    this.adsAmount = clamp(this.adsAmount + Math.sign(want - this.adsAmount) * rate * dt, 0, 1);
    let fired = false;
    switch (this.state) {
      case 'equip':
        if (this.t > 0.42) {
          this.state = 'idle';
          // a switch asked for while drawing: carry it out now
          if (this.pending !== null && this.pending !== this.index) {
            this.state = 'holster';
            this.t = 0;
            this.events.push({ type: 'holster', gun: this.gun });
          } else this.pending = null;
        }
        break;
      case 'holster':
        if (this.t > 0.28) {
          this.prevIndex = this.index;
          this.index = this.pending ?? this.index;
          this.pending = null;
          this.state = 'equip';
          this.t = 0;
          this.shotsInBurst = 0;
          this.events.push({ type: 'equip', gun: this.gun });
        }
        break;
      case 'reload':
        if (g.perShell) {
          // one shell at a time; firing breaks the reload off
          if (trigger && g.ammo > 0 && this.t > 0.15) {
            this.state = 'idle';
            break;
          }
          if (this.t > g.reload) {
            this.t = 0;
            g.ammo++;
            g.spare--;
            this.reloadShells++;
            this.events.push({ type: 'shell', gun: g });
            if (g.ammo >= g.mag || g.spare <= 0) {
              this.state = 'pump';
              this.t = 0;
              this.events.push({ type: 'pump', gun: g });
            }
          }
        } else if (this.t > g.reload * (g.ammo === 0 ? 1.12 : 1)) {
          const n = Math.min(g.mag - g.ammo, g.spare);
          g.ammo += n;
          g.spare -= n;
          this.state = 'idle';
          this.events.push({ type: 'reloadEnd', gun: g });
        }
        break;
      case 'pump':
        if (this.t > 0.45) this.state = 'idle';
        break;
      case 'idle':
        if (sprinting) {
          this.shotsInBurst = 0;
          break;
        }
        if (trigger && g.cool <= 0) {
          const semiOk = g.w.auto || !this.triggerHeld;
          if (semiOk) {
            if (g.ammo > 0) {
              g.ammo--;
              g.cool = 60 / g.w.rpm + (g.pump ? g.pump : 0);
              fired = true;
              this.shotsInBurst++;
              if (g.pump && g.ammo > 0) this.events.push({ type: 'pump', gun: g, delay: 0.22 });
            } else if (!this.triggerHeld) {
              this.events.push({ type: 'dry', gun: g });
              if (g.spare > 0) this.reload();
            }
          }
        }
        if (!trigger) this.shotsInBurst = Math.max(0, this.shotsInBurst - dt * 8);
        if (g.ammo === 0 && g.spare > 0 && !trigger && this.state === 'idle') this.reload();
        break;
    }
    this.triggerHeld = trigger;
    return fired;
  }

  /** View kick of the round just fired: { up, side } (rad). */
  recoil(rng = Math.random) {
    const g = this.gun;
    const aim = 1 - 0.35 * this.adsAmount;
    return { up: g.kickUp * aim * (0.8 + 0.4 * rng()), side: g.kickSide * aim * (rng() * 2 - 1) };
  }
}
