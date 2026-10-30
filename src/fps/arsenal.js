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

/** Melee items: no ammunition; LMB attacks (bat and fists: hold to wind up a power blow). */
const MELEE_ITEMS = {
  knife: { type: 'knife', melee: true, w: { label: 'Combat knife', rpm: 0, auto: false, spread: 0, recoil: 0 }, ads: 1, light: 'slash', alt: 'stab' },
  bat: { type: 'bat', melee: true, charge: true, w: { label: 'Baseball bat', rpm: 0, auto: false, spread: 0, recoil: 0 }, ads: 1, light: 'swing', heavy: 'swing' },
  fists: { type: 'fists', melee: true, charge: true, w: { label: 'Fists', rpm: 0, auto: false, spread: 0, recoil: 0 }, ads: 1, light: 'jab', heavy: 'haymaker' },
};

/** The sandbox's first-person kit: every gun, then the melee items (keys 1-9). */
export const SANDBOX_LOADOUT = [
  LOADOUT[0],
  { type: 'revolver', mag: 6, reserve: 60, reload: 2.4, ads: 1.3, kickUp: 0.045, kickSide: 0.012, adsSpread: 0.3, hipSpread: 2.2 },
  LOADOUT[2],
  LOADOUT[3],
  LOADOUT[1],
  { type: 'sniper', mag: 5, reserve: 40, reload: 2.7, ads: 2.2, kickUp: 0.055, kickSide: 0.01, adsSpread: 0.1, hipSpread: 14, bolt: true },
  MELEE_ITEMS.knife,
  MELEE_ITEMS.bat,
  MELEE_ITEMS.fists,
];

/**
 * Timing of the melee moves (s): wind-up, strike (when it can connect), recovery. The view model
 * module may supply its own (setMoves) so the animation and the hit window agree.
 */
export const DEFAULT_MOVES = {
  slash: { windup: 0.08, strike: 0.14, recover: 0.28 },
  stab: { windup: 0.12, strike: 0.12, recover: 0.3 },
  swing: { windup: 0.22, strike: 0.2, recover: 0.45, chargeTime: 0.9 },
  jab: { windup: 0.06, strike: 0.1, recover: 0.22 },
  haymaker: { windup: 0.22, strike: 0.14, recover: 0.42, chargeTime: 0.7 },
  stomp: { windup: 0.22, strike: 0.14, recover: 0.38 },
  kick: { windup: 0.2, strike: 0.14, recover: 0.36 },
};

export class Arsenal {
  /** opts.infinite: reserves never run out (the sandbox). */
  constructor(loadout = LOADOUT, opts = {}) {
    this.guns = loadout.map((d) => (d.melee ? { ...d, ammo: 0, spare: 0, mag: 0, cool: 0 } : { ...d, w: WEAPONS[d.type], ammo: d.mag, spare: d.reserve, cool: 0 }));
    this.infinite = !!opts.infinite;
    this.moves = { ...DEFAULT_MOVES };
    this.melee = null; // the melee move under way: { move, phase, t, charge, power, hit, side }
    this.meleeSide = 1;
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

  /** Timing of the melee moves (see DEFAULT_MOVES), e.g. from the view model. */
  setMoves(moves) {
    for (const k in moves) this.moves[k] = { ...this.moves[k], ...moves[k] };
  }

  /** Start a melee move now (wind-up first); `charge` 0..1 for a held power blow. */
  startMove(move, charge = 0) {
    this.melee = { move, phase: 'windup', t: 0, charge, power: 0.45 + 0.55 * charge, hit: false, side: (this.meleeSide = -this.meleeSide) };
    this.events.push({ type: 'meleeStart', move, charge });
  }

  /** A kick (or a stomp on someone lying in front) - with any weapon in hand. */
  kick(stomp = false) {
    if (this.melee || this.state === 'holster' || this.state === 'equip') return false;
    if (this.state === 'reload') this.state = 'idle';
    this.startMove(stomp ? 'stomp' : 'kick', 0.6);
    return true;
  }

  /** Advance the melee move under way (strike phase: the host sweeps the striking point). */
  updateMelee(dt, trigger, alt) {
    const g = this.gun;
    let M = this.melee;
    if (!M) {
      if (!g.melee || this.state !== 'idle') return;
      const press = trigger && !this.triggerHeld, altPress = alt && !this.altHeld;
      if (g.type === 'knife') {
        if (press) this.startMove('slash');
        else if (altPress) this.startMove('stab');
      } else if (press) {
        // hold to wind up a power blow; a tap is a quick one
        this.melee = M = { move: g.heavy, phase: 'charge', t: 0, charge: 0, power: 0.45, hit: false, side: (this.meleeSide = -this.meleeSide), held: 0 };
        this.events.push({ type: 'meleeCharge', move: g.heavy });
      }
      return;
    }
    // (a blow that lands slows the rest of the swing down, or stops it dead: the host sets M.rate)
    M.t += M.phase === 'strike' ? dt * (M.rate ?? 1) : dt;
    const T = this.moves[M.move] || DEFAULT_MOVES.swing;
    if (M.phase === 'charge') {
      M.held += dt;
      const ct = this.moves[g.heavy] ? this.moves[g.heavy].chargeTime || 0.8 : 0.8;
      M.charge = clamp((M.held - 0.12) / ct, 0, 1);
      if (!trigger) {
        // a quick tap: a jab (fists) or a light swing; held: the full wind-up's power
        if (g.light !== g.heavy && M.held < 0.16) M.move = g.light;
        M.power = 0.45 + 0.55 * M.charge;
        M.phase = 'windup';
        M.t = 0;
        this.events.push({ type: 'meleeStart', move: M.move, charge: M.charge });
      }
      return;
    }
    if (M.phase === 'windup' && M.t >= T.windup) {
      M.phase = 'strike';
      M.t = 0;
      this.events.push({ type: 'meleeStrike', move: M.move, power: M.power });
    } else if (M.phase === 'strike' && (M.t >= T.strike || M.done)) {
      M.phase = 'recover';
      M.t = 0;
    } else if (M.phase === 'recover' && M.t >= T.recover) {
      this.melee = null;
      this.events.push({ type: 'meleeEnd', move: M.move });
    }
  }

  reload() {
    const g = this.gun;
    if (g.melee || this.melee) return;
    if (this.state !== 'idle' || g.ammo >= g.mag || g.spare <= 0) return;
    this.state = 'reload';
    this.t = 0;
    this.reloadShells = 0;
    this.events.push({ type: 'reloadStart', gun: g, empty: g.ammo === 0 });
  }

  /** How far a round strays (multiplier on the weapon's spread) given the stance and motion. */
  spreadScale(player) {
    const g = this.gun;
    if (g.melee) return 0;
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
  update(dt, trigger, sprinting, alt = false) {
    this.events.length = 0;
    this.t += dt;
    const g = this.gun;
    g.cool = Math.max(0, g.cool - dt);
    if (this.infinite && !g.melee) g.spare = Math.max(g.spare, g.mag * 3);
    // melee: its own little state machine (kicks and stomps run with any weapon in hand)
    if (this.melee || g.melee) {
      this.adsAmount = Math.max(0, this.adsAmount - dt * 6);
      if (this.state === 'idle' || this.melee) this.updateMelee(dt, trigger && !sprinting, alt && !sprinting);
      this.triggerHeld = trigger;
      this.altHeld = alt;
      if (this.melee || this.state === 'idle') return false;
    }
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
    this.altHeld = alt;
    return fired;
  }

  /** View kick of the round just fired: { up, side } (rad). */
  recoil(rng = Math.random) {
    const g = this.gun;
    if (g.melee) return { up: 0, side: 0 };
    const aim = 1 - 0.35 * this.adsAmount;
    return { up: g.kickUp * aim * (0.8 + 0.4 * rng()), side: g.kickSide * aim * (rng() * 2 - 1) };
  }
}
