/**
 * Explosion entry point for survival mechanics (beds in the Nether/End). Uses `game.explode`
 * when the physics workstream provides one; otherwise a simple vanilla-like fallback that
 * destroys blocks by blast resistance, damages entities and optionally starts fires.
 */
import * as THREE from 'three';
import type { Game } from '../game';
import { BLOCKS, BLOCK_BY_NAME, T_FULL_CUBE, stateOf } from '../../world/blocks/registry';
import { SetFlags } from '../../world/world';
import { LivingEntity } from '../../entity/living';

export function explode(game: Game, x: number, y: number, z: number, power: number, fire = false, source: any = null) {
  const g: any = game;
  if (typeof g.explode === 'function') {
    g.explode(new THREE.Vector3(x, y, z), power, { fire, source });
    return;
  }
  explodeFallback(game, x, y, z, power, fire, source);
}

/** Simple block-destroying explosion (fallback when no physics explosion is installed). */
export function explodeFallback(game: Game, x: number, y: number, z: number, power: number, fire = false, source: any = null) {
  const w = game.world;
  const pos = new THREE.Vector3(x, y, z);
  game.events.emit('explosion', { pos, power, fire, source });
  // rays from the centre lose strength by distance and blast resistance (vanilla Explosion)
  const hit = new Set<string>();
  const n = 16;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++) {
        if (i !== 0 && i !== n - 1 && j !== 0 && j !== n - 1 && k !== 0 && k !== n - 1) continue;
        let dx = i / (n - 1) * 2 - 1, dy = j / (n - 1) * 2 - 1, dz = k / (n - 1) * 2 - 1;
        const l = Math.hypot(dx, dy, dz);
        dx /= l; dy /= l; dz /= l;
        let f = power * (0.7 + Math.random() * 0.6);
        let px = x, py = y, pz = z;
        while (f > 0) {
          const bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz);
          const st = w.getBlock(bx, by, bz);
          if (st) {
            const d = BLOCKS[st >>> 4];
            const res = d.hardness < 0 ? 3600000 : d.resistance;
            f -= (res + 0.3) * 0.3;
            if (f > 0 && d.liquid === 0) hit.add(`${bx},${by},${bz}`);
          }
          px += dx * 0.3; py += dy * 0.3; pz += dz * 0.3;
          f -= 0.225;
        }
      }
  for (const key of hit) {
    const [bx, by, bz] = key.split(',').map(Number);
    game.breakBlock(bx, by, bz, Math.random() < 1 / power, null, null);
  }
  if (fire) {
    const fireState = stateOf(BLOCK_BY_NAME.get('fire')!.id, 0);
    for (const key of hit) {
      const [bx, by, bz] = key.split(',').map(Number);
      if (Math.random() < 1 / 3 && w.getBlock(bx, by, bz) === 0 && T_FULL_CUBE[w.getBlock(bx, by - 1, bz) >>> 4]) w.setBlock(bx, by, bz, fireState, SetFlags.ALL);
    }
  }
  // entity damage
  const r = power * 2;
  for (const e of game.entities.list) {
    if (e.removed || !(e instanceof LivingEntity)) continue;
    const d = e.pos.distanceTo(pos);
    if (d > r) continue;
    const impact = 1 - d / r;
    const dmg = Math.floor(((impact * impact + impact) / 2) * 7 * r + 1);
    const dir = e.pos.clone().sub(pos).normalize();
    e.hurt({ type: 'explosion', explosion: true, attacker: source, dir, impulse: impact * power, point: pos.clone() }, dmg);
    e.vel.addScaledVector(dir, impact * 20);
  }
  try {
    game.audio?.play?.('random.explode', { pos, volume: Math.max(2, power) });
  } catch {
    /* audio optional */
  }
}
