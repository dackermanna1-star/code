// DamageSystem: every hit in the game goes through here (spells, explosions, materials, melee, fire).
// Also owns status effects and stains, which are driven by the materials a creature touches.
import { VoxelWorld, RAY_SOLID } from '../world/world';
import { MaterialSimulation } from '../sim/simulation';
import { MATERIALS, matId, KIND, Kind, AIR, FIRE, LAVA, UNLOADED, FLAMMABILITY } from '../world/materials';
import { Creature, DamageType } from './creature';
import { senseBody, ContactInfo } from './physics';
import { FastRng } from '../core/rng';

export interface DamageEvent {
  target: Creature;
  amount: number;
  type: DamageType;
  source: Creature | null;
  x: number;
  y: number;
  z: number;
  /** Damage caused indirectly by the environment (materials, props, fire): Noita "trick" kills give double gold. */
  trick?: boolean;
  crit?: boolean;
  kx?: number;
  ky?: number;
  kz?: number;
}

export interface DamageHooks {
  hurt?: (ev: DamageEvent, dealt: number) => void;
  death?: (c: Creature, ev: DamageEvent) => void;
  bleed?: (mat: number, x: number, y: number, z: number, vx: number, vy: number, vz: number) => void;
  text?: (x: number, y: number, z: number, text: string, color: string) => void;
  teleport?: (c: Creature) => void;
  /** Return true to cancel a death (Saving Grace / Extra Life). */
  preventDeath?: (c: Creature, ev: DamageEvent, hpBefore: number) => boolean;
}

const STAIN_MAP: Record<string, keyof Creature['status']> = {
  wet: 'wet', bloody: 'bloody', oily: 'oily', slimy: 'slimy', toxic: 'toxic', drunk: 'drunk',
};

export class DamageSystem {
  hooks: DamageHooks = {};
  creatures: Creature[] = [];
  godMode = false;
  rng = new FastRng(0x5eed);
  private contact: ContactInfo = { total: 0, liquid: 0, gas: 0, counts: new Map(), burning: 0, topLiquid: 0 };

  constructor(private world: VoxelWorld, private sim: MaterialSimulation) {}

  /** Apply one damage event. Returns damage actually dealt (negative = healed). */
  apply(ev: DamageEvent): number {
    const t = ev.target;
    if (!t.alive) return 0;
    let mult = t.mult[ev.type] ?? 1;
    if (ev.source && ev.source.status.berserk > 0 && ev.type !== 'healing') mult *= 2;
    let amount = ev.amount;
    if (ev.type === 'healing') {
      const before = t.hp;
      t.hp = Math.min(t.maxHp, t.hp + amount);
      if (t.hp > before) this.hooks.text?.(t.cx, t.headY() + 1, t.cz, `+${(t.hp - before).toFixed(1)}`, '#7cf07c');
      return -(t.hp - before);
    }
    if (mult === 0) return 0;
    amount *= mult;
    if (amount < 0) {
      // heals from this damage type (e.g. Ukko from electricity)
      t.hp = Math.min(t.maxHp, t.hp - amount);
      return amount;
    }
    if (t.isPlayer && this.godMode) amount = 0;
    if (t.isPlayer && (t as unknown as { stainless?: boolean }).stainless && !this.hasStain(t)) amount *= 0.5;
    if (amount <= 0) return 0;
    const hpBefore = t.hp;
    t.hp -= amount;
    t.hurtFlash = 1;
    t.lastHitBy = ev.source ?? t.lastHitBy;
    t.lastHitTrick = !!ev.trick;
    if (ev.kx !== undefined) {
      t.body.vx += ev.kx;
      t.body.vy += ev.ky ?? 0;
      t.body.vz += ev.kz ?? 0;
    }
    // bleed the creature's material as real voxels
    if (ev.type !== 'toxic' && ev.type !== 'curse' && t.bloodMat) {
      const n = Math.min(24, Math.ceil(amount / (t.isPlayer ? 4 : 2)));
      const m = matId(t.bloodMat);
      for (let i = 0; i < n; i++) {
        const a = this.rng.f() * Math.PI * 2;
        const sp = 6 + this.rng.f() * 10;
        this.hooks.bleed?.(m, t.cx, t.cy + this.rng.f() * t.body.h * 0.3, t.cz, Math.cos(a) * sp, 4 + this.rng.f() * 8, Math.sin(a) * sp);
      }
    }
    this.hooks.hurt?.(ev, amount);
    if (!t.isPlayer && amount >= 0.5) this.hooks.text?.(t.cx, t.headY() + 0.5, t.cz, amount >= 10 ? amount.toFixed(0) : amount.toFixed(1), ev.crit ? '#ffdc40' : '#ffffff');
    if (t.hp <= 0) {
      if (this.hooks.preventDeath?.(t, ev, hpBefore)) return amount;
      t.hp = 0;
      t.alive = false;
      this.hooks.death?.(t, ev);
    }
    return amount;
  }

  hasStain(c: Creature): boolean {
    const s = c.status;
    return s.wet > 0.02 || s.bloody > 0.02 || s.oily > 0.02 || s.slimy > 0.02 || s.toxic > 0.02 || s.drunk > 0.02;
  }

  /** Can this creature catch fire right now? Wet, bloody, slimy and toxic stains prevent ignition. */
  canIgnite(c: Creature): boolean {
    const s = c.status;
    if ((c.mult.fire ?? 1) === 0) return false;
    if (s.oily > 0.05) return true;
    return !(s.wet > 0.05 || s.bloody > 0.05 || s.slimy > 0.05 || s.toxic > 0.05);
  }

  setOnFire(c: Creature, seconds: number): void {
    if (!this.canIgnite(c)) {
      // fire consumes the protective stain instead
      c.status.wet = Math.max(0, c.status.wet - 0.2);
      return;
    }
    const dur = c.status.oily > 0.05 ? seconds * 3 : seconds;
    c.status.onFire = Math.max(c.status.onFire, dur);
  }

  /**
   * Explosion damage to creatures: falloff with distance, blocked by terrain (line of sight), knockback.
   */
  explosion(x: number, y: number, z: number, radius: number, damage: number, source: Creature | null, opts: { fire?: boolean; trick?: boolean } = {}): void {
    const R = radius * 1.5 + 2;
    for (const c of this.creatures) {
      if (!c.alive) continue;
      const dx = c.cx - x, dy = c.cy - y, dz = c.cz - z;
      const d = Math.hypot(dx, dy, dz);
      if (d > R) continue;
      let f = 1 - d / R;
      if (!this.world.lineOfSight(x, y, z, c.cx, c.cy, c.cz) && !this.world.lineOfSight(x, y, z, c.cx, c.headY(), c.cz)) f *= 0.2;
      if (f <= 0.01) continue;
      const inv = d > 0.01 ? 1 / d : 0;
      const kb = 40 * f * Math.min(2, radius / 6);
      this.apply({
        target: c, amount: damage * f, type: 'explosion', source, x, y, z, trick: opts.trick,
        kx: dx * inv * kb, ky: Math.max(0.3, dy * inv) * kb * 0.8, kz: dz * inv * kb,
      });
      if (opts.fire && this.rng.f() < f) this.setOnFire(c, 3);
    }
  }

  /** Per-tick status effects, stains and material contact. */
  updateCreature(c: Creature, dt: number): void {
    if (!c.alive) return;
    const s = c.status;
    const b = c.body;
    const contact = senseBody(this.world, b, this.contact);
    // ---- material contact
    let ignite = false;
    for (const [m, n] of contact.counts) {
      const def = MATERIALS[m];
      if (!def) continue;
      if (def.damage && def.damageType) {
        this.apply({ target: c, amount: def.damage * n * dt, type: def.damageType as DamageType, source: null, x: c.cx, y: c.cy, z: c.cz, trick: true });
      }
      if (def.stain) {
        const frac = n / Math.max(1, contact.total);
        switch (def.stain) {
          case 'wet':
          case 'bloody':
          case 'oily':
          case 'slimy':
          case 'toxic':
          case 'drunk': {
            const key = STAIN_MAP[def.stain];
            if (!(def.stain === 'toxic' && (c.mult.toxic ?? 1) === 0)) (s[key] as number) = Math.min(1, (s[key] as number) + frac * dt * 3 + 0.02);
            if (def.stain === 'wet') {
              // water washes other stains off
              s.oily = Math.max(0, s.oily - dt * 0.8);
              s.slimy = Math.max(0, s.slimy - dt * 0.8);
              s.toxic = Math.max(0, s.toxic - dt * 0.8);
              s.bloody = Math.max(0, s.bloody - dt * 0.5);
            }
            break;
          }
          case 'healing':
            s.regen = Math.max(s.regen, 1.5);
            break;
          case 'mana':
            s.manaRegen = Math.max(s.manaRegen, 1.5);
            break;
          case 'teleport':
            s.teleportitis = Math.max(s.teleportitis, 3);
            break;
          case 'berserk':
            s.berserk = Math.max(s.berserk, 5);
            break;
          case 'polymorph':
            s.polymorph = Math.max(s.polymorph, 0.5);
            break;
        }
      }
      if (def.ignitesEntities || m === FIRE) ignite = true;
    }
    if (contact.burning > 0) ignite = true;
    if (ignite) this.setOnFire(c, m2s(contact.counts.has(LAVA) ? 6 : 3));
    // entering liquid puts out fire
    if (s.onFire > 0 && contact.liquid > contact.total * 0.25 && !contact.counts.has(LAVA)) s.onFire = 0;
    if (s.onFire > 0 && (s.wet > 0.2 || s.slimy > 0.3) && !ignite) s.onFire = 0;

    // ---- burning
    if (s.onFire > 0) {
      s.onFire -= dt;
      this.apply({ target: c, amount: c.maxHp * 0.02 * dt + 0.6 * dt, type: 'fire', source: null, x: c.cx, y: c.cy, z: c.cz, trick: true });
      // a burning creature sets flammable surroundings alight
      if (this.rng.f() < dt * 6) {
        const fx = Math.floor(c.cx + (this.rng.f() - 0.5) * b.hw * 3);
        const fy = Math.floor(b.y + this.rng.f() * b.h);
        const fz = Math.floor(c.cz + (this.rng.f() - 0.5) * b.hw * 3);
        const m = this.world.get(fx, fy, fz);
        if (m === AIR) this.world.set(fx, fy, fz, FIRE);
        else if (FLAMMABILITY[m] > 0) this.sim.ignite(fx, fy, fz);
        const under = this.world.get(Math.floor(c.cx), Math.floor(b.y - 0.5), Math.floor(c.cz));
        if (FLAMMABILITY[under] > 0) this.sim.ignite(Math.floor(c.cx), Math.floor(b.y - 0.5), Math.floor(c.cz));
      }
    }
    // ---- toxic stain / poison: drains HP but cannot kill on its own
    if ((s.toxic > 0.02 || s.poisoned > 0) && (c.mult.toxic ?? 1) !== 0) {
      const floor = c.maxHp * 0.05;
      if (c.hp > floor) {
        c.hp = Math.max(floor, c.hp - c.maxHp * 0.02 * dt);
        c.hurtFlash = Math.max(c.hurtFlash, 0.15);
      }
      s.poisoned = Math.max(0, s.poisoned - dt);
    }
    // ---- regeneration (Healthium): 10% of max HP per second
    if (s.regen > 0) {
      s.regen -= dt;
      c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.1 * dt);
    }
    // ---- stains fade
    const fade = dt * (contact.liquid > 0 ? 0 : 0.05);
    s.wet = Math.max(0, s.wet - fade * 1.5);
    s.bloody = Math.max(0, s.bloody - fade);
    s.oily = Math.max(0, s.oily - fade * 0.7);
    s.slimy = Math.max(0, s.slimy - fade);
    s.toxic = Math.max(0, s.toxic - fade);
    s.drunk = Math.max(0, s.drunk - fade * 0.6);
    for (const k of ['frozen', 'stunned', 'berserk', 'manaRegen', 'cursed', 'levitationDisabled', 'invuln'] as const) s[k] = Math.max(0, s[k] - dt);
    if (s.teleportitis > 0) {
      s.teleportitis -= dt;
      if (this.rng.f() < dt * 0.6) this.hooks.teleport?.(c);
    }
    if (s.polymorph > 0) s.polymorph -= dt;
    if (s.cursed > 0) this.apply({ target: c, amount: 2 * dt, type: 'curse', source: null, x: c.cx, y: c.cy, z: c.cz });
    c.hurtFlash = Math.max(0, c.hurtFlash - dt * 3);
  }

  /** Find a random open position near a creature for teleportitis. */
  randomTeleportTarget(c: Creature, range: number): [number, number, number] | null {
    const b = c.body;
    for (let i = 0; i < 40; i++) {
      const x = b.x + (this.rng.f() - 0.5) * 2 * range;
      const y = b.y + (this.rng.f() - 0.3) * range;
      const z = b.z + (this.rng.f() - 0.5) * 2 * range;
      if (this.world.boxHasSolid(x - b.hw, y, z - b.hw, x + b.hw, y + b.h, z + b.hw)) continue;
      if (this.world.get(Math.floor(x), Math.floor(y), Math.floor(z)) === UNLOADED) continue;
      if (!this.world.lineOfSight(b.x, b.y + b.h * 0.5, b.z, x, y + b.h * 0.5, z) && i < 30) continue;
      return [x, y, z];
    }
    return null;
  }

  isLiquidAt(x: number, y: number, z: number): boolean {
    return KIND[this.world.get(Math.floor(x), Math.floor(y), Math.floor(z))] === Kind.LIQUID;
  }

  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    return !this.world.raycast(ax, ay, az, bx - ax, by - ay, bz - az, Math.hypot(bx - ax, by - ay, bz - az), RAY_SOLID).hit;
  }
}

function m2s(v: number): number {
  return v;
}
