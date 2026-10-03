/**
 * Experience orbs (vanilla ExperienceOrb): split into standard orb sizes, merge, follow the
 * nearest player within 8 blocks, mending repairs, pickup with a 2-tick delay.
 * Handles the game's `spawnXp` event. Emits `xpPickup {player, orb, amount}` and
 * `xpMending {player, stack, repaired, xp}`.
 */
import * as THREE from 'three';
import { Entity } from '../../entity/entity';
import { registerEntity } from '../../entity/manager';
import { createEntityMaterial, setEntityLight } from '../../render/entityMaterial';
import type { Game } from '../game';
import type { GameSystem } from '../systems';
import type { ItemStack } from '../items/registry';
import { splitXp } from './food';

const GEO = new THREE.IcosahedronGeometry(1, 1);

export class XpOrb extends Entity {
  readonly type = 'xp_orb';
  value = 1;
  count = 1;
  lifetime = 6000;
  private mat: THREE.RawShaderMaterial | null = null;
  private phase = Math.random() * 10;

  constructor(value = 1) {
    super();
    this.value = value;
    this.width = 0.5;
    this.height = 0.5;
    this.mass = 0.05;
  }

  override init(game: any, world: any) {
    super.init(game, world);
    this.mat = createEntityMaterial({ color: 0xb8ff40, emissive: 0.6, roughness: 0.3, sss: 0.4 });
    const m = new THREE.Mesh(GEO, this.mat);
    const s = 0.06 + Math.min(0.12, Math.log2(this.value + 1) * 0.02);
    m.scale.setScalar(s);
    const g = new THREE.Group();
    g.add(m);
    this.model = g;
    this.model.userData.entity = this;
  }

  override tick() {
    super.tick();
    if (this.age >= this.lifetime) { this.remove(); return; }
    if (this.age % 20 === 1) this.mergeNearby();
  }

  private mergeNearby() {
    const ents = (this.game as any).entities;
    if (!ents) return;
    for (const e of ents.query(this.box.grow(0.5), (o: Entity) => o !== this && o.type === 'xp_orb')) {
      const o = e as XpOrb;
      if (o.removed || o.value !== this.value) continue;
      this.count += o.count;
      this.age = Math.min(this.age, o.age);
      o.remove();
    }
  }

  override physicsStep(dt: number) {
    this.prevPos.copy(this.pos);
    this.updateEnvironment();
    const v = this.vel;
    const k = dt * 20; // fraction of a game tick
    if (this.inWater) v.y += (0.06 * 20 - v.y) * (1 - Math.pow(0.8, k));
    else if (!this.noGravity) v.y -= 0.03 * 400 * dt;
    if (this.inLava) { v.y = 0.2 * 20; v.x += (Math.random() - 0.5) * 4; v.z += (Math.random() - 0.5) * 4; }
    // follow the player
    const p = (this.game as any).player;
    if (p && !p.dead && !p.spectator) {
      const tx = p.pos.x - this.pos.x, ty = p.pos.y + p.eyeHeight / 2 - this.pos.y, tz = p.pos.z - this.pos.z;
      const d2 = tx * tx + ty * ty + tz * tz;
      if (d2 < 64) {
        const d = Math.sqrt(d2) || 1;
        const e = 1 - d / 8;
        const a = e * e * 0.1 * 400; // per tick 0.1 b/t -> b/s^2
        v.x += (tx / d) * a * dt;
        v.y += (ty / d) * a * dt;
        v.z += (tz / d) * a * dt;
      }
    }
    this.move(v.x * dt, v.y * dt, v.z * dt);
    const fr = Math.pow(this.onGround ? 0.98 * 0.6 : 0.98, k);
    v.x *= fr;
    v.z *= fr;
    v.y *= Math.pow(0.98, k);
  }

  override updateVisual(alpha: number, dt: number) {
    if (!this.model) return;
    this.phase += dt;
    const p = this.renderPos(alpha);
    this.model.position.set(p.x, p.y + 0.15 + Math.sin(this.phase * 4) * 0.03, p.z);
    this.model.rotation.set(this.phase * 1.3, this.phase * 2.1, 0);
    if (this.mat) {
      setEntityLight(this.mat, this.world.getLight(Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z)));
      const c = (Math.sin(this.phase * 6) + 1) / 2;
      (this.mat.uniforms.u_color.value as THREE.Color).setRGB(0.55 + c * 0.35, 1, 0.15 + c * 0.1);
    }
  }

  override serialize() {
    return { ...super.serialize(), xv: this.value, xc: this.count, age: this.age };
  }
  override deserialize(o: any) {
    super.deserialize(o);
    this.value = o.xv ?? 1;
    this.count = o.xc ?? 1;
    this.age = o.age ?? 0;
  }
}
registerEntity('xp_orb', XpOrb, 'misc');

/** Spawn orbs worth `amount` XP at a position. */
export function spawnXpOrbs(game: Game, pos: THREE.Vector3, amount: number) {
  for (const v of splitXp(amount)) {
    const o = new XpOrb(v);
    o.vel.set((Math.random() * 0.2 - 0.1) * 2 * 20, Math.random() * 0.2 * 2 * 20, (Math.random() * 0.2 - 0.1) * 2 * 20);
    game.spawn(o, pos.x, pos.y, pos.z);
  }
}

export class XpSystem implements GameSystem {
  readonly name = 'xp';
  private takeDelay = 0;

  init(game: Game) {
    game.events.on('spawnXp', (e: any) => {
      if (!game.entities || e.amount <= 0) return;
      e.handle();
      spawnXpOrbs(game, e.pos, e.amount);
    });
  }

  tick(game: Game) {
    const p = game.player;
    if (!p || p.dead || p.spectator) return;
    if (this.takeDelay > 0) { this.takeDelay--; return; }
    const box = p.box.grow(1).expand(0, 0.5, 0);
    for (const e of game.entities.query(box, (o) => o.type === 'xp_orb')) {
      const orb = e as XpOrb;
      if (orb.removed) continue;
      this.takeDelay = 2;
      let value = orb.value;
      value = this.mend(game, p, value);
      if (value > 0) p.addXp(value);
      game.events.emit('xpPickup', { player: p, orb, amount: orb.value });
      if (--orb.count <= 0) orb.remove();
      break;
    }
  }

  /** Mending: repair a random damaged mending item (2 durability per XP). Returns the XP left. */
  private mend(game: Game, p: any, value: number): number {
    const slots = [p.inventory.selected, 40, 36, 37, 38, 39];
    const cands: { slot: number; s: ItemStack }[] = [];
    for (const slot of slots) {
      const s = p.inventory.get(slot);
      if (s && s.damage > 0 && (s.ench?.mending ?? 0) > 0) cands.push({ slot, s });
    }
    if (!cands.length) return value;
    const { s } = cands[Math.floor(Math.random() * cands.length)];
    const repaired = Math.min(value * 2, s.damage);
    s.damage -= repaired;
    p.inventory.changed();
    game.events.emit('xpMending', { player: p, stack: s, repaired, xp: value });
    const left = value - Math.ceil(repaired / 2);
    return left > 0 ? this.mend(game, p, left) : 0;
  }
}
