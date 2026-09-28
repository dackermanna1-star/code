// Runtime weapon state machine (fire cadence, bursts, reload / shell reload,
// pump, spread bloom). Shared by humans and bots.
import { WEAPONS } from './weaponDefs.js';
import { clamp, randRange } from '../core/math.js';

export class Weapon {
  constructor(type, opts = {}) {
    this.type = type;
    this.def = WEAPONS[type];
    if (!this.def) throw new Error('Unknown weapon ' + type);
    this.dual = !!opts.dual;
    this.clip = opts.clip ?? this.maxClip;
    this.reserve = opts.reserve ?? this.def.reserve;
    this.cool = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.reloadPhase = 0; // shell reload: 0 start,1 shells,2 end
    this.pumpT = 0;
    this.bloom = 0; // added spread (degrees)
    this.burstLeft = 0;
    this.burstT = 0;
    this.zoomed = false;
    this.clickBuffer = 0;
    this.dualSide = 0;
    this.drawT = 0.5;
    this.events = [];
    this.lastFire = -10;
    this.heat = 0;
    // L4D2 extras: chainsaw fuel (0..def.fuel), laser sight (tighter spread +
    // visible beam) and special ammo loaded from an upgrade crate
    // (upgrade = { type: 'incendiary' | 'explosive', rounds }).
    this.fuel = this.def.chainsaw ? opts.fuel ?? this.def.fuel : 0;
    this.cutting = false; // chainsaw: revved and cutting this frame
    this.laser = !!opts.laser;
    this.upgrade = opts.upgrade ? { type: opts.upgrade.type, rounds: opts.upgrade.rounds } : null;
    this.shotUp = null; // upgrade type of the round being fired (read by combat.fireWeapon)
  }
  // state carried by a dropped / saved weapon
  state() {
    return { clip: this.clip, reserve: this.reserve, fuel: this.def.chainsaw ? this.fuel : undefined, laser: this.laser || undefined, upgrade: this.upgrade || undefined, dual: this.dual || undefined };
  }
  // load special rounds (one magazine's worth, as in L4D2)
  loadUpgrade(type) {
    if (this.def.melee || this.def.slot !== 0) return false;
    this.upgrade = { type, rounds: Math.max(1, Math.min(this.maxClip, 60)) };
    return true;
  }
  get maxClip() { return this.dual && this.def.dualClip ? this.def.dualClip : this.def.clip; }
  get melee() { return !!this.def.melee; }
  get name() { return this.dual ? 'Dual Pistols' : this.def.name; }
  canFire() {
    return this.cool <= 0 && this.pumpT <= 0 && this.drawT <= 0 && (!this.reloading || (this.def.shellReload && this.clip > 0));
  }
  startReload() {
    const d = this.def;
    if (d.melee || d.noReload || this.reloading) return false;
    if (this.clip >= this.maxClip || this.reserve <= 0) return false;
    this.reloading = true;
    this.reloadEmpty = this.clip === 0; // empty reloads also rack the slide / charging handle
    this.zoomed = false;
    if (d.shellReload) {
      this.reloadPhase = 0;
      this.reloadT = d.reloadStart;
    } else {
      this.reloadT = d.reload * (this.dual ? 1.35 : 1);
    }
    this.events.push('reload');
    return true;
  }
  cancelReload() {
    if (!this.reloading) return;
    this.reloading = false;
    this.events.push('reloadCancel');
  }
  // Returns the current spread cone in degrees.
  spread(owner) {
    const d = this.def;
    let base = d.spread;
    const sp = owner ? Math.hypot(owner.phys.vx, owner.phys.vz) : 0;
    if (owner && !owner.phys.onGround) base = d.spreadAir;
    else if (sp > 1) base = d.spread + (d.spreadMove - d.spread) * clamp((sp - 1) / 3.5, 0, 1);
    if (owner && owner.crouching) base *= 0.65;
    if (this.zoomed && d.zoomSpread != null) base = d.zoomSpread + (sp > 1 ? d.spreadMove * 0.5 : 0);
    // laser sight: markedly tighter cone and less bloom (shotguns a bit less)
    if (this.laser) return (base + this.bloom * 0.7) * (d.kind === 'shotgun' ? 0.72 : 0.55);
    return base + this.bloom;
  }
  // Update; cmd: {fire, firePressed, reload}. Returns number of shots fired this tick (for bursts).
  update(dt, owner, cmd, fireFn) {
    const d = this.def;
    this.cool -= dt;
    this.drawT -= dt;
    if (this.pumpT > 0) {
      this.pumpT -= dt;
    }
    this.bloom = Math.max(0, this.bloom - d.spreadRecover * dt * (this.cool > 0 ? 0.35 : 1));
    if (cmd.firePressed) this.clickBuffer = 0.12;
    else this.clickBuffer -= dt;
    this.heat = Math.max(0, this.heat - dt * 0.35);

    // Reload progression
    if (this.reloading) {
      this.reloadT -= dt;
      if (d.shellReload) {
        if ((cmd.firePressed || this.clickBuffer > 0) && this.clip > 0 && this.reloadPhase === 1) {
          // interrupt shell reload to fire
          this.reloading = false;
          this.events.push('reloadEnd');
        } else if (this.reloadT <= 0) {
          if (this.reloadPhase === 0) { this.reloadPhase = 1; this.reloadT = d.reload; this.events.push('shellStart'); }
          else if (this.reloadPhase === 1) {
            this.clip++;
            this.reserve--;
            this.events.push('shell');
            if (this.clip >= this.maxClip || this.reserve <= 0) { this.reloadPhase = 2; this.reloadT = d.reloadEnd; }
            else this.reloadT = d.reload;
          } else {
            this.reloading = false;
            this.events.push('reloadEnd');
            if (d.pump && this.needPump) { this.needPump = false; }
          }
        }
      } else if (this.reloadT <= 0) {
        const need = this.maxClip - this.clip;
        const take = Math.min(need, this.reserve);
        this.clip += take;
        if (this.reserve !== Infinity) this.reserve -= take;
        this.reloading = false;
        this.events.push('reloadEnd');
      }
    }
    if (cmd.reload && !this.reloading) this.startReload();

    // Burst continuation
    if (this.burstLeft > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0 && this.clip > 0) {
        this._shoot(owner, fireFn);
        this.burstLeft--;
        this.burstT = d.interval;
        if (this.burstLeft === 0) this.cool = d.burstInterval;
      } else if (this.clip <= 0) this.burstLeft = 0;
      return;
    }

    if (d.chainsaw) {
      // engine idles while drawn; held fire revs and cuts every interval, burning fuel
      const want = cmd.fire && this.drawT <= 0 && this.fuel > 0;
      if (want && !this.cutting) this.events.push('sawRev');
      else if (!want && this.cutting) this.events.push('sawIdle');
      this.cutting = want;
      if (want) {
        this.fuel = Math.max(0, this.fuel - d.fuelBurn * dt);
        if (this.cool <= 0) { this.cool = d.interval; this.lastFire = performance.now(); fireFn(this, 'melee'); }
        if (this.fuel <= 0) { this.cutting = false; this.events.push('fuelOut'); }
      }
      return;
    }
    if (d.melee) {
      if ((d.auto ? cmd.fire : (cmd.fire && this.cool <= -0.05) || this.clickBuffer > 0) && this.cool <= 0 && this.drawT <= 0) {
        this.clickBuffer = 0;
        this.cool = d.interval;
        this.events.push('swing');
        this.swingPending = d.windup;
      }
      if (this.swingPending != null) {
        this.swingPending -= dt;
        if (this.swingPending <= 0) {
          this.swingPending = null;
          fireFn(this, 'melee');
        }
      }
      return;
    }

    const want = d.auto ? cmd.fire : (cmd.firePressed || this.clickBuffer > 0);
    if (want && this.canFire()) {
      if (this.clip <= 0) {
        if (cmd.firePressed) this.events.push('dry');
        this.clickBuffer = 0;
        this.cool = 0.25;
        if (this.reserve > 0) this.startReload();
        return;
      }
      if (this.reloading) { this.reloading = false; this.events.push('reloadEnd'); }
      this.clickBuffer = 0;
      if (d.burst) {
        this._shoot(owner, fireFn);
        this.burstLeft = d.burst - 1;
        this.burstT = d.interval;
        this.cool = d.interval;
        return;
      }
      this._shoot(owner, fireFn);
      this.cool = d.interval * (this.dual ? 0.72 : 1);
      if (d.pump && this.clip > 0) { this.pumpT = d.interval * 0.85; this.events.push('pump'); }
    } else if (!this.reloading && this.clip <= 0 && this.reserve > 0 && this.cool <= -0.3 && !d.noReload) {
      this.startReload();
    }
  }
  _shoot(owner, fireFn) {
    const d = this.def;
    this.clip--;
    this.lastFire = performance.now();
    this.bloom = Math.min(d.spreadMax, this.bloom + d.spreadPerShot * randRange(0.8, 1.2));
    this.dualSide = 1 - this.dualSide;
    this.shotUp = null;
    if (this.upgrade) {
      this.shotUp = this.upgrade.type;
      if (--this.upgrade.rounds <= 0) { this.upgrade = null; this.events.push('upgradeOut'); }
    }
    this.events.push('fire');
    fireFn(this, 'fire');
    if (this.clip <= 0 && d.noReload) this.events.push('depleted');
  }
  refill() {
    if (this.def.reserve === Infinity || this.def.noReload) return false;
    const maxReserve = this.def.reserve;
    if (this.reserve >= maxReserve) return false;
    this.reserve = maxReserve;
    return true;
  }
  consumeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
