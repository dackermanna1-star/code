// Weapon state machine, ported from the original weapons.py:
// idle -> fire (fireTicks) -> idle | reload (reloadTicks) -> idle.
import { SHOTGUN_PUMP_TICK, VINTAGE_FIRE_DELAY, WEAPONS, type WeaponDef, type WeaponId } from '../config/weapons';
import type { Player } from './Player';

export type WeaponState = 'idle' | 'fire' | 'reload';

/** Distance of the muzzle in front of the hunter (metres, toward -x) in the hold pose. */
export const MUZZLE_FORWARD: Record<WeaponId, number> = {
  pistol: 0.55,
  magnum: 0.62,
  mp5: 0.72,
  grenades: 0.3,
  shotgun: 1.02,
  mac10: 0.6,
  flunk: 0.78,
  m4: 0.98,
  awp: 1.35,
  vintage: 1.65,
  minigun: 1.25,
};

export class Weapon {
  readonly def: WeaponDef;
  readonly id: WeaponId;
  readonly player: Player;
  state: WeaponState = 'idle';
  ticks = 0;
  bullets: number;
  fireTicks: number;
  /** Minigun heat 0..20 (spins up the fire rate). */
  heat = 0;
  /** Minigun barrel angle (render). */
  spin = 0;
  /** Logic tick of the last discharge (render recoil). */
  lastShotTick = -1000;
  /** Ticks this weapon has been the active one. */
  usageTicks = 0;

  constructor(player: Player, id: WeaponId) {
    this.player = player;
    this.id = id;
    this.def = WEAPONS[id];
    this.bullets = this.def.clip;
    this.fireTicks = this.def.fireTicks;
  }

  get reloadProgress(): number {
    return this.state === 'reload' ? Math.min(1, this.ticks / this.def.reloadTicks) : -1;
  }

  canFire(): boolean {
    if (this.state === 'reload') return false;
    if (this.state === 'fire' && this.ticks < this.fireTicks) return false;
    return this.bullets >= 1;
  }

  /**
   * Pull the trigger. Returns true if the weapon discharged this tick (the
   * caller applies recoil). The punt gun discharges later (VINTAGE_FIRE_DELAY).
   */
  pull(): boolean {
    if (!this.canFire()) {
      if (this.state === 'idle' && this.bullets < 1) this.reload();
      return false;
    }
    this.state = 'fire';
    this.ticks = 0;
    if (this.id === 'vintage') {
      this.player.world.events.emit('weaponCock', { playerId: this.player.id, weapon: this.id, step: 0 });
      return false;
    }
    if (this.id === 'grenades') {
      // The grenade leaves the hand at the end of the throw animation.
      this.bullets -= 1;
      return false;
    }
    this.bullets -= this.def.perShot;
    this.discharge();
    return true;
  }

  private discharge(): void {
    const w = this.player.world;
    this.lastShotTick = w.tick;
    if (this.def.kind === 'hitscan') w.combat.fireHitscan(this.player, this);
    else if (this.def.kind === 'launcher') w.combat.launchRound(this.player, this);
    if (this.def.shell !== 'none' && this.id !== 'shotgun' && this.id !== 'vintage') {
      w.events.emit('shellEject', { playerId: this.player.id, weapon: this.id, count: 1 });
    }
  }

  tick(): void {
    this.ticks++;
    this.usageTicks++;
    const w = this.player.world;

    if (this.id === 'minigun') {
      if (this.state === 'fire') {
        if (this.ticks % 3 === 2 || this.ticks === this.fireTicks - 1) this.heat = Math.min(20, this.heat + 1);
      } else if (this.ticks % 5 === 4) {
        this.heat = Math.max(0, this.heat - 1);
      }
      this.fireTicks = this.def.fireTicks - Math.floor(this.heat / 2);
      this.spin += (0.12 + this.heat * 0.055) * (this.state === 'fire' ? 1 : 0.55 * (this.heat / 20));
    }

    if (this.state === 'fire') {
      if (this.id === 'vintage') {
        if (this.ticks === 15) w.events.emit('weaponCock', { playerId: this.player.id, weapon: this.id, step: 1 });
        if (this.ticks === VINTAGE_FIRE_DELAY) {
          this.bullets -= this.def.perShot;
          this.player.applyRecoil(this.def.recoilX, this.def.recoilUp);
          this.discharge();
          w.events.emit('shellEject', { playerId: this.player.id, weapon: this.id, count: 2 });
        }
      } else if (this.id === 'shotgun' && this.ticks === SHOTGUN_PUMP_TICK) {
        w.events.emit('shellEject', { playerId: this.player.id, weapon: this.id, count: 1 });
      } else if (this.id === 'grenades' && this.ticks === this.fireTicks - 1) {
        this.lastShotTick = w.tick;
        w.combat.throwGrenade(this.player, this);
      }
      if (this.ticks >= this.fireTicks) {
        this.state = 'idle';
        this.ticks = 0;
        if (this.bullets <= 0) this.reload();
      }
    } else if (this.state === 'reload') {
      if (this.ticks >= this.def.reloadTicks) {
        this.state = 'idle';
        this.ticks = 0;
        this.bullets = this.def.clip;
        w.events.emit('reloadEnd', { playerId: this.player.id, weapon: this.id });
      }
    }
  }

  /** Start reloading. Returns true if a reload started. */
  reload(): boolean {
    if (this.state === 'fire' || this.state === 'reload' || this.bullets >= this.def.clip) return false;
    this.state = 'reload';
    this.ticks = 0;
    const w = this.player.world;
    w.events.emit('reloadStart', { playerId: this.player.id, weapon: this.id });
    if (this.def.clipKind !== 'none') w.events.emit('clipDrop', { playerId: this.player.id, weapon: this.id });
    if (this.id === 'magnum') w.events.emit('shellEject', { playerId: this.player.id, weapon: this.id, count: this.def.clip });
    return true;
  }
}
