/**
 * Explosions caused by mobs (creepers, ghast fireballs, end crystals ...).
 * If an explosion service exists (`game.explosions.explode`) it is used. Otherwise the
 * `explosion {pos, power, source, fire, handle()}` event is emitted, and when no listener
 * claims it via `handle()` a Minecraft-style fallback runs: ray-marched block destruction
 * (blast resistance, 1/power drop chance), exposure-scaled entity damage and knockback, fire.
 */
import * as THREE from 'three';
import { BLOCKS, S } from '../../world/blocks/registry';
import { LivingEntity } from '../living';
import type { Entity } from '../entity';
import { SetFlags } from '../../world/world';
import { lineOfSight } from '../ai/sensing';

export interface ExplodeOpts {
  source?: Entity | null;
  fire?: boolean;
  /** Destroy blocks (mobGriefing for mobs). */
  breakBlocks?: boolean;
}

export function explode(game: any, pos: THREE.Vector3, power: number, o: ExplodeOpts = {}) {
  if (!game) return;
  const breakBlocks = o.breakBlocks ?? game.gamerules?.mobGriefing !== false;
  if (game.explosions?.explode) {
    game.explosions.explode(pos, power, { source: o.source ?? null, fire: !!o.fire, breakBlocks });
    return;
  }
  let handled = false;
  game.events?.emit('explosion', { pos: pos.clone(), power, source: o.source ?? null, fire: !!o.fire, handle: () => { handled = true; } });
  if (!handled) fallbackExplosion(game, pos, power, o.source ?? null, !!o.fire, breakBlocks);
}

export function fallbackExplosion(game: any, pos: THREE.Vector3, power: number, source: Entity | null, fire: boolean, breakBlocks: boolean) {
  const w = game.world;
  const destroyed = new Map<string, [number, number, number]>();
  if (breakBlocks) {
    for (let i = 0; i < 16; i++)
      for (let j = 0; j < 16; j++)
        for (let k = 0; k < 16; k++) {
          if (i !== 0 && i !== 15 && j !== 0 && j !== 15 && k !== 0 && k !== 15) continue;
          let dx = (i / 15) * 2 - 1, dy = (j / 15) * 2 - 1, dz = (k / 15) * 2 - 1;
          const l = Math.hypot(dx, dy, dz);
          dx /= l; dy /= l; dz /= l;
          let f = power * (0.7 + Math.random() * 0.6);
          let x = pos.x, y = pos.y, z = pos.z;
          for (; f > 0; f -= 0.22500001) {
            const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
            const st = w.getBlock(bx, by, bz);
            if (st !== 0) {
              const def = BLOCKS[st >>> 4];
              const res = def.hardness < 0 ? 3600000 : def.resistance;
              f -= (res + 0.3) * 0.3;
              if (f > 0 && def.liquid === 0) destroyed.set(`${bx},${by},${bz}`, [bx, by, bz]);
            }
            x += dx * 0.3; y += dy * 0.3; z += dz * 0.3;
          }
        }
  }
  // entities
  const r = power * 2;
  const list = (game.entities?.list ?? []) as Entity[];
  for (const e of list) {
    if (e.removed) continue;
    const d = e.pos.distanceTo(pos) / r;
    if (d > 1) continue;
    const dir = new THREE.Vector3(e.pos.x - pos.x, e.pos.y + e.height * 0.5 - pos.y, e.pos.z - pos.z);
    const dl = dir.length();
    if (dl < 1e-4) dir.set(0, 1, 0); else dir.divideScalar(dl);
    const exposure = exposureOf(w, pos, e);
    const impact = (1 - d) * exposure;
    if (e instanceof LivingEntity) {
      const dmg = Math.floor(((impact * impact + impact) / 2) * 7 * r + 1);
      e.hurt({ type: 'explosion', explosion: true, attacker: source, direct: source, dir: dir.clone(), impulse: impact * power * 2, point: e.pos.clone() }, dmg);
    }
    const kb = impact * (1 - ((e as any).knockbackResistance ?? 0) * 0);
    e.vel.addScaledVector(dir, kb * 20);
  }
  // blocks
  const drops = 1 / power;
  for (const [bx, by, bz] of destroyed.values()) {
    const st = w.getBlock(bx, by, bz);
    if (!st) continue;
    const def = BLOCKS[st >>> 4];
    if (def.name === 'tnt') { w.setBlock(bx, by, bz, 0, SetFlags.ALL); continue; }
    if (game.breakBlock) game.breakBlock(bx, by, bz, Math.random() < drops, null, null);
    else w.setBlock(bx, by, bz, 0, SetFlags.ALL);
  }
  if (fire) {
    for (const [bx, by, bz] of destroyed.values()) {
      if (Math.random() > 1 / 3) continue;
      if (w.getBlock(bx, by, bz) === 0 && w.getBlock(bx, by - 1, bz) !== 0 && BLOCKS[w.getBlock(bx, by - 1, bz) >>> 4].solid) w.setBlock(bx, by, bz, S('fire'), SetFlags.ALL);
    }
  }
  game.particles?.emit?.('explosion', pos.clone(), { count: Math.ceil(power * 4), spread: power });
}

/** Fraction of sample points of the entity box visible from the explosion centre. */
function exposureOf(w: any, p: THREE.Vector3, e: Entity): number {
  const b = e.box;
  let seen = 0, n = 0;
  for (let i = 0; i <= 2; i++)
    for (let j = 0; j <= 2; j++)
      for (let k = 0; k <= 2; k++) {
        const x = b.minX + ((b.maxX - b.minX) * i) / 2, y = b.minY + ((b.maxY - b.minY) * j) / 2, z = b.minZ + ((b.maxZ - b.minZ) * k) / 2;
        n++;
        if (lineOfSight(w, p.x, p.y, p.z, x, y, z)) seen++;
      }
  return n ? seen / n : 1;
}
