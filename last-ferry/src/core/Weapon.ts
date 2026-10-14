// Weapon state machine: cadence (fractional fire intervals keep their exact
// average), full and per-shell reloads, the outboard's pull-start engine,
// spin and heat.
import type { WeaponId } from '../config/ids';
import { TICK } from '../config/world';
import { OUTBOARD, WEAPONS, type WeaponDef } from '../config/weapons';
import type { WeaponState, WeaponView } from './api';
import type { Player } from './Player';

const EPS = 1e-6;

export class Weapon implements WeaponView {
  readonly id: WeaponId;
  readonly def: WeaponDef;
  state: WeaponState = 'idle';
  ticks = 0;
  bullets: number;
  spin = 0;
  heat = 0;
  /** Seconds until the next round may fire. */
  cooldown = 0;
  /** Reload progress (seconds into the reload, or into the current shell). */
  reloadT = 0;
  reloading = false;
  /** Outboard engine. */
  engine: 'stop' | 'idle' | 'run' = 'stop';
  /** Outboard: stalled from overheating until it cools down. */
  overheated = false;
  private idleT = 0;
  /** World tick of the last discharge (presentation recoil / muzzle flash). */
  lastShotTick = -1000;
  private trigger = false;
  /** Shells to load when the per-shell reload started (progress bar). */
  private reloadNeed = 1;
  private reloadTick = -1;

  constructor(readonly player: Player, id: WeaponId) {
    this.id = id;
    this.def = WEAPONS[id];
    this.bullets = this.def.clip;
  }

  /** 0..1 while reloading (per-shell reloads report the whole reload), else 0. */
  get reloadProgress(): number {
    if (!this.reloading) return 0;
    if (this.def.perShell) {
      const loaded = this.bullets - (this.def.clip - this.reloadNeed);
      return Math.min(1, (loaded + this.reloadT / this.def.reload) / Math.max(1, this.reloadNeed));
    }
    return Math.min(1, this.reloadT / this.def.reload);
  }

  /** Per-shell reloads: shells being loaded in this reload (0 when not reloading or not per-shell). */
  get shellsLoading(): number {
    return this.reloading && this.def.perShell ? this.reloadNeed : 0;
  }

  /** Per-shell reloads: progress of the shell going in now. */
  get shellProgress(): number {
    return this.reloading && this.def.perShell ? Math.min(1, this.reloadT / this.def.reload) : 0;
  }

  /** Seconds since the last shot (presentation). */
  get sinceShot(): number {
    return (this.player.world.tick - this.lastShotTick) * TICK;
  }

  private setState(s: WeaponState): void {
    if (this.state !== s) {
      this.state = s;
      this.ticks = 0;
    }
  }

  /**
   * Advance one tick with the trigger held (`fire`). Returns true when a
   * round was fired (the caller resolves the shot).
   */
  update(fire: boolean): boolean {
    this.ticks++;
    const w = this.player.world;
    const def = this.def;
    const edge = fire && !this.trigger;
    this.trigger = fire;

    if (this.id === 'outboard') {
      if (this.overheated && this.heat <= OUTBOARD.restartHeat) this.overheated = false;
      this.engineTick(fire && !this.reloading && this.bullets > 0 && !this.overheated);
    }

    // Empty once the last round has cycled: reload by itself.
    if (!this.reloading && this.bullets <= 0 && this.cooldown <= EPS) this.reload();

    // Reload progress (not on the tick it started); a per-shell reload is interrupted by the trigger.
    if (this.reloading && this.reloadTick !== w.tick) {
      if (def.perShell && fire && this.bullets >= 1) {
        this.finishReload();
      } else {
        this.reloadT += TICK;
        if (this.reloadT >= def.reload - EPS) {
          if (def.perShell) {
            this.reloadT = 0;
            this.bullets++;
            if (this.bullets >= def.clip) this.finishReload();
          } else {
            this.bullets = def.clip;
            this.finishReload();
          }
        }
      }
    }

    let fired = false;
    const ready = !this.reloading && this.bullets > 0 && this.cooldown <= EPS && (this.id !== 'outboard' || this.spin >= 1 - EPS);
    if (fire && ready) {
      this.bullets--;
      this.cooldown += def.fireInterval;
      this.lastShotTick = w.tick;
      fired = true;
      if (this.id === 'outboard') {
        this.heat = Math.min(1, this.heat + OUTBOARD.heatPerShot);
        if (this.heat >= 1) {
          // Overheated: the engine coughs and dies.
          this.overheated = true;
          this.spin = 0;
          this.stopEngine();
        }
      }
    } else if (edge && this.bullets <= 0) {
      w.events.emit('emptyClick', { playerId: this.player.id, weapon: this.id });
    }
    // The fractional remainder of the interval carries over only while firing continuously.
    this.cooldown -= TICK;
    if (this.cooldown < 0) this.cooldown = fire && !this.reloading && this.bullets > 0 ? Math.max(this.cooldown, -TICK) : 0;
    // The barrel cools while it isn't being worked (released, reloading or stalled).
    if (this.heat > 0 && (!fire || this.reloading || this.overheated)) this.heat = Math.max(0, this.heat - OUTBOARD.coolPerSecond * TICK);

    if (this.reloading) this.setState('reload');
    else if (this.cooldown > EPS) this.setState('fire');
    else if (this.id === 'outboard' && fire && this.spin < 1 - EPS) this.setState('spin');
    else if (this.bullets <= 0) this.setState('empty');
    else this.setState('idle');
    return fired;
  }

  private engineTick(want: boolean): void {
    const w = this.player.world;
    const emit = (state: 'pull' | 'idle' | 'run' | 'stop') => w.events.emit('engine', { playerId: this.player.id, state });
    if (want) {
      this.idleT = 0;
      if (this.engine === 'stop') {
        this.engine = 'idle';
        emit('pull');
      }
      this.spin = Math.min(1, this.spin + TICK / this.def.spinUp);
      if (this.spin >= 1 - EPS && this.engine !== 'run') {
        this.engine = 'run';
        emit('run');
      }
      return;
    }
    if (this.engine === 'run') {
      this.engine = 'idle';
      emit('idle');
    }
    if (this.engine === 'idle') {
      this.spin = Math.max(OUTBOARD.idleSpin, this.spin - TICK * 1.5);
      this.idleT += TICK;
      if (this.idleT >= OUTBOARD.stallSeconds) this.stopEngine();
    } else {
      this.spin = Math.max(0, this.spin - TICK * 1.5);
    }
  }

  /** Switched away / stalled: the outboard's engine dies. */
  stopEngine(): void {
    if (this.engine !== 'stop') {
      this.engine = 'stop';
      this.player.world.events.emit('engine', { playerId: this.player.id, state: 'stop' });
    }
    this.idleT = 0;
  }

  private finishReload(): void {
    this.reloading = false;
    this.reloadT = 0;
    this.player.world.events.emit('reloadEnd', { playerId: this.player.id, weapon: this.id });
  }

  /** Start reloading (R or empty). Returns true if a reload started. */
  reload(): boolean {
    if (this.reloading || this.bullets >= this.def.clip) return false;
    this.reloading = true;
    this.reloadT = 0;
    this.reloadNeed = this.def.clip - this.bullets;
    this.reloadTick = this.player.world.tick;
    if (!this.def.perShell) this.bullets = 0;
    this.setState('reload');
    this.player.world.events.emit('reloadStart', { playerId: this.player.id, weapon: this.id });
    return true;
  }

  /** One tick in the holster: a stowReload weapon (the flare pistol) reloads itself. */
  stowed(): void {
    if (!this.def.stowReload || this.bullets >= this.def.clip) {
      this.stowT = 0;
      return;
    }
    this.stowT += TICK;
    if (this.stowT >= this.def.reload - EPS) {
      this.bullets = this.def.clip;
      this.stowT = 0;
    }
  }
  private stowT = 0;

  /** Put away: a reload in progress is abandoned (per-shell: the shells loaded so far stay). */
  holster(): void {
    if (this.reloading) {
      if (!this.def.perShell) this.bullets = this.def.clip - this.reloadNeed;
      this.reloading = false;
      this.reloadT = 0;
    }
    if (this.id === 'outboard') this.stopEngine();
    this.spin = 0;
    this.trigger = false;
    this.cooldown = Math.max(0, this.cooldown);
    this.setState(this.bullets > 0 ? 'idle' : 'empty');
  }
}
