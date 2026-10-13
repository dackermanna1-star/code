import { REACH } from '../../shared/constants';
import { itemDef, tryItemDef } from '../../shared/data/items';
import { dirFromAngles } from '../../shared/math';
import { removeItem } from '../../shared/sim/inventory';
import { dayPhase, sunElevation } from '../../shared/sim/time';
import { applyFood, MAX_HEALTH, restoreVitals, tickVitals } from '../../shared/sim/vitals';
import { LIQUID, OPAQUE } from '../../shared/world/blocks';
import { Biome } from '../../shared/world/biomes';
import { raycastVoxels } from '../../shared/world/raycast';
import type { Game } from '../game';
import type { Player } from '../player';

/** Server side of the survival model: environment sampling, consumables, drinking. */
export class Survival {
  private acc = 0;
  private exertion = new Map<number, number>();

  constructor(private game: Game) {}

  exert(p: Player, amount: number) {
    this.exertion.set(p.id, (this.exertion.get(p.id) ?? 0) + amount);
  }

  airTemperature(x: number, y: number, z: number): number {
    const g = this.game;
    const base = g.world.gen.climateTempC(x, y, z);
    const phase = dayPhase(g.time, g.config.dayLengthMin);
    const sun = sunElevation(phase, g.config.nightFraction);
    const sheltered = this.sheltered(x, y, z);
    let t = base + sun * 4 - (sun < 0 ? 6 : 0) - g.weather * 5;
    if (sheltered) t = t * 0.7 + 12 * 0.3; // indoors / caves dampen extremes
    return t;
  }

  /** True if there is an opaque block within 12 blocks above the head. */
  sheltered(x: number, y: number, z: number): boolean {
    const w = this.game.world;
    for (let dy = 2; dy < 14; dy++) if (OPAQUE[w.getBlock(Math.floor(x), Math.floor(y) + dy, Math.floor(z))]) return true;
    return false;
  }

  tick(dt: number) {
    this.acc += dt;
    for (const p of this.game.players.values()) this.tickUse(p);
    if (this.acc < 0.5) return;
    const step = this.acc;
    this.acc = 0;
    const g = this.game;
    for (const p of g.players.values()) {
      if (!p.alive) continue;
      const ex = this.exertion.get(p.id) ?? 0;
      this.exertion.set(p.id, 0);
      const res = tickVitals(p.vitals, {
        airTemp: this.airTemperature(p.x, p.y, p.z),
        warmth: p.warmth(),
        nearFire: g.tiles.fireNear(p.x, p.y, p.z),
        inWater: p.move.inWater,
        raining: g.weather > 0.3 && !this.sheltered(p.x, p.y, p.z),
        radZone: g.world.gen.pois.radiationAt(p.x, p.y, p.z),
        radProtection: p.radProtection(),
        exertion: Math.min(1, ex / (6 * step)),
        metabolismRate: g.config.metabolismRate,
      }, step);
      p.flags = res.flags;
      if (p.god) {
        restoreVitals(p.vitals);
        p.flags = ['god'];
      }
      p.bp = g.building.privilegeState(p);
      if (p.bp === 2) p.flags.push('blocked');
      else if (p.bp === 1) p.flags.push('privilege');
      for (const [type, amount] of res.damage) if (amount > 0) g.combat.damagePlayer(p, amount, type, null);
      // drowning: head under water
      const head = g.world.getBlock(Math.floor(p.x), Math.floor(p.y + 1.6), Math.floor(p.z));
      if (LIQUID[head]) {
        p.underwater = (p.underwater ?? 0) + step;
        if (p.underwater > 15) g.combat.damagePlayer(p, 4 * step, 'drown', null);
      } else p.underwater = 0;
    }
  }

  replicate(p: Player) {
    const v = p.vitals;
    const sig = `${Math.round(v.hp)}|${Math.round(v.cal)}|${Math.round(v.hyd)}|${Math.round(v.temp)}|${Math.round(v.rad)}|${Math.round(v.bleed)}|${Math.round(v.wet * 10)}|${p.flags.join(',')}|${p.bp}`;
    if (sig === p.vitalsSig) return;
    p.vitalsSig = sig;
    p.link?.send({ t: 'vitals', hp: v.hp, cal: v.cal, hyd: v.hyd, temp: v.temp, rad: v.rad, bleed: v.bleed, wet: v.wet, fx: p.flags, bp: p.bp });
  }

  /** Use the held consumable (eat / drink / heal). Medical items take time. */
  useHeld(p: Player) {
    const held = p.held();
    if (!held) return;
    const def = itemDef(held.id);
    if (def.food) {
      if (!applyFood(p.vitals, def.food)) return this.game.msg(p, 'You are full', 'error');
      removeItem([p.inv.belt], held.id, 1);
      this.game.fx('eat', p.x, p.y + 1.5, p.z, 12);
      return;
    }
    if (def.medical) {
      if (p.pendingUse) return;
      if (def.medical.heal > 0 && p.vitals.hp >= MAX_HEALTH && !p.vitals.bleed && !def.medical.radRemove) return this.game.msg(p, 'Already at full health', 'error');
      p.pendingUse = { item: held.id, slot: p.sel, until: this.game.now + def.medical.useTime };
      this.game.fx('bandage', p.x, p.y + 1.5, p.z, 12);
    }
  }

  private tickUse(p: Player) {
    const u = p.pendingUse;
    if (!u || this.game.now < u.until) return;
    p.pendingUse = null;
    if (!p.alive || p.sel !== u.slot) return;
    const held = p.held();
    if (!held || held.id !== u.item) return;
    const m = tryItemDef(u.item)?.medical;
    if (!m) return;
    if (!removeItem([p.inv.belt], u.item, 1)) return;
    p.vitals.hp = Math.min(MAX_HEALTH, p.vitals.hp + m.heal);
    if (m.healOverTime) p.vitals.hot += m.healOverTime;
    if (m.stopBleed) p.vitals.bleed = 0;
    if (m.radRemove) p.vitals.rad = Math.max(0, p.vitals.rad - m.radRemove);
  }

  /** Drink from fresh water you are looking at; ocean water is salty. */
  drink(p: Player, yaw: number, pitch: number) {
    const now = this.game.now;
    if (now - (p.lastDrink ?? 0) < 0.8) return;
    const [ex, ey, ez] = p.eye();
    const d = dirFromAngles(yaw, pitch);
    const hit = raycastVoxels(this.game.world, ex, ey, ez, d.x, d.y, d.z, REACH, (id) => id !== 0);
    if (!hit || !LIQUID[hit.id]) return;
    p.lastDrink = now;
    const biome = this.game.world.gen.column(hit.x, hit.z).biome;
    if (biome === Biome.Ocean || biome === Biome.Beach || biome === Biome.StoneBeach) {
      p.vitals.hyd = Math.max(0, p.vitals.hyd - 5);
      this.game.msg(p, 'Salt water! It makes you thirstier. Find a river or lake.', 'error');
    } else {
      p.vitals.hyd = Math.min(250, p.vitals.hyd + 30);
    }
    this.game.fx('drink', hit.x + 0.5, hit.y + 0.9, hit.z + 0.5, 15);
  }
}
