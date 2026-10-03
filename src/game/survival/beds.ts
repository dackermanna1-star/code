/**
 * Beds (Minecraft Java 1.20): right-click sets the respawn point, sleeping at night (or during
 * thunderstorms) skips to morning once every player sleeps for 100 ticks and clears the weather.
 * Beds explode in the Nether/End. Also the respawn flow (bed validation, return to overworld).
 * Events: `playerSleep {player, x, y, z}`, `playerWake {player}`, `nightSkipped {dayTime}`,
 * `spawnPointSet {player, x, y, z}`.
 */
import * as THREE from 'three';
import type { Game } from '../game';
import type { GameSystem } from '../systems';
import { addBehavior } from '../../world/blocks/behaviors';
import { BLOCKS, T_FULL_CUBE, T_SOLID } from '../../world/blocks/registry';
import { SetFlags, type World } from '../../world/world';
import { entityCategory } from '../../entity/manager';
import { LivingEntity } from '../../entity/living';
import type { Player } from '../../entity/player';
import { gameFor } from './context';
import { explode } from './explosion';
import { screenFx } from './survivalSystem';

/** Offsets from foot to head per hfacing (S, W, N, E). */
const HEAD_DIR: [number, number][] = [[0, 1], [-1, 0], [0, -1], [1, 0]];

/** Foot and head positions of a bed block. */
export function bedParts(x: number, y: number, z: number, state: number) {
  const [dx, dz] = HEAD_DIR[state & 3];
  const head = (state & 8) !== 0;
  return head ? { foot: [x - dx, y, z - dz], head: [x, y, z] } : { foot: [x, y, z], head: [x + dx, y, z + dz] };
}

function isBed(w: World, x: number, y: number, z: number) {
  const s = w.getBlock(x, y, z);
  return s !== 0 && BLOCKS[s >>> 4].shape === 'bed';
}

function setOccupied(w: World, x: number, y: number, z: number, occ: boolean) {
  const s = w.getBlock(x, y, z);
  if (!s || BLOCKS[s >>> 4].shape !== 'bed') return;
  const { foot, head } = bedParts(x, y, z, s);
  for (const [a, b, c] of [foot, head]) {
    const t = w.getBlock(a, b, c);
    if (t && BLOCKS[t >>> 4].shape === 'bed') w.setBlock(a, b, c, occ ? t | 4 : t & ~4, SetFlags.NONE);
  }
}

/** A free standing position next to a bed (vanilla BedBlock.findStandUpPosition, simplified). */
export function standUpPosition(w: World, x: number, y: number, z: number): THREE.Vector3 | null {
  const free = (a: number, b: number, c: number) => {
    const s0 = w.getBlock(a, b, c), s1 = w.getBlock(a, b + 1, c), below = w.getBlock(a, b - 1, c);
    return !T_SOLID[s0 >>> 4] && !T_SOLID[s1 >>> 4] && T_SOLID[below >>> 4] && BLOCKS[s0 >>> 4].liquid === 0;
  };
  for (let r = 1; r <= 2; r++)
    for (let dy = 0; dy <= 1; dy++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (free(x + dx, y + dy, z + dz)) return new THREE.Vector3(x + dx + 0.5, y + dy, z + dz + 0.5);
        }
  if (!T_SOLID[w.getBlock(x, y + 1, z) >>> 4]) return new THREE.Vector3(x + 0.5, y + 0.5625, z + 0.5);
  return null;
}

export class BedSystem implements GameSystem {
  readonly name = 'beds';
  private bed: [number, number, number] | null = null;

  init(game: Game) {
    const self = this;
    addBehavior('#beds', {
      onUse(world, x, y, z, state, player) {
        const g = gameFor(world);
        if (!g) return false;
        self.useBed(g, world, x, y, z, state, player);
        return true;
      },
      onRemove(world, x, y, z, old) {
        // breaking one half removes the other (also for explosions / pistons)
        const { foot, head } = bedParts(x, y, z, old);
        const [ox, oy, oz] = (old & 8) ? foot : head;
        if (world.getBlock(ox, oy, oz) >>> 4 === old >>> 4) world.setBlock(ox, oy, oz, 0, SetFlags.ALL);
      },
      onEntityFall(_w, _x, _y, _z, _s, e) {
        // beds bounce (fall damage reduction is handled in LivingEntity.onFall)
        if (!e.sneaking && e.vel) e.vel.y = Math.max(e.vel.y, 0);
      },
    });
    game.respawnHandler = (g) => this.respawn(g);
  }

  private useBed(g: Game, w: World, x: number, y: number, z: number, state: number, player: Player) {
    const { head } = bedParts(x, y, z, state);
    const [hx, hy, hz] = head;
    if (g.dimension !== 'overworld') {
      // beds explode outside the overworld (power 5, with fire)
      const { foot } = bedParts(x, y, z, state);
      w.setBlock(foot[0], foot[1], foot[2], 0, SetFlags.ALL);
      w.setBlock(hx, hy, hz, 0, SetFlags.ALL);
      explode(g, hx + 0.5, hy + 0.5, hz + 0.5, 5, true);
      return;
    }
    if (player.sleeping) return;
    const p = player.pos;
    const inRange = (a: number, b: number, c: number) => Math.abs(p.x - (a + 0.5)) <= 3 && Math.abs(p.y - b) <= 2 && Math.abs(p.z - (c + 0.5)) <= 3;
    const { foot } = bedParts(x, y, z, state);
    if (!inRange(hx, hy, hz) && !inRange(foot[0], foot[1], foot[2])) { g.message('You may not rest now; the bed is too far away'); return; }
    if (T_FULL_CUBE[w.getBlock(hx, hy + 1, hz) >>> 4]) { g.message('This bed is obstructed'); return; }
    // respawn point (set even during the day, Java 1.15+)
    const prev = player.data.bedPos as number[] | undefined;
    if (!prev || prev[0] !== hx || prev[1] !== hy || prev[2] !== hz || player.spawnDimension !== 'overworld') {
      player.data.bedPos = [hx, hy, hz];
      player.spawnPoint = standUpPosition(w, hx, hy, hz) ?? new THREE.Vector3(hx + 0.5, hy + 0.5625, hz + 0.5);
      player.spawnDimension = 'overworld';
      g.message('Respawn point set');
      g.events.emit('spawnPointSet', { player, x: hx, y: hy, z: hz });
    }
    if (g.isDay && !g.weather.thundering) { g.message('You can sleep only at night or during thunderstorms'); return; }
    if (state & 4) { g.message('This bed is occupied'); return; }
    if (!player.creative) {
      const near = g.entities.list.some((e) => e instanceof LivingEntity && !e.dead && !e.removed && entityCategory(e.type) === 'monster'
        && Math.abs(e.pos.x - (hx + 0.5)) <= 8 && Math.abs(e.pos.y - hy) <= 5 && Math.abs(e.pos.z - (hz + 0.5)) <= 8);
      if (near) { g.message('You may not rest now; there are monsters nearby'); return; }
    }
    player.sleeping = true;
    player.sleepTicks = 0;
    player.sprinting = false;
    player.vel.set(0, 0, 0);
    player.setPos(hx + 0.5, hy + 0.5625, hz + 0.5);
    const yawByFacing = [Math.PI, -Math.PI / 2, 0, Math.PI / 2];
    player.yaw = yawByFacing[state & 3] + Math.PI;
    setOccupied(w, hx, hy, hz, true);
    this.bed = [hx, hy, hz];
    player.stats.timeSinceRest = 0;
    g.events.emit('playerSleep', { player, x: hx, y: hy, z: hz });
  }

  private wake(g: Game) {
    const p = g.player;
    p.sleeping = false;
    p.sleepTicks = 0;
    if (this.bed) {
      const [x, y, z] = this.bed;
      setOccupied(g.world, x, y, z, false);
      const pos = isBed(g.world, x, y, z) ? standUpPosition(g.world, x, y, z) : null;
      if (pos && !p.dead) p.setPos(pos.x, pos.y, pos.z);
      this.bed = null;
    }
    g.events.emit('playerWake', { player: p });
  }

  tick(g: Game) {
    const p = g.player;
    if (!p) return;
    if (!p.sleeping) {
      if (this.bed) this.wake(g);
      if (!p.creative && !p.spectator && !p.dead) p.stats.timeSinceRest = (p.stats.timeSinceRest ?? 0) + 1;
      screenFx.sleep = Math.max(0, screenFx.sleep - 0.1);
      return;
    }
    p.sleepTicks++;
    p.stats.timeSinceRest = 0;
    if (this.bed) {
      const [x, y, z] = this.bed;
      if (!isBed(g.world, x, y, z)) { this.wake(g); return; }
      p.setPos(x + 0.5, y + 0.5625, z + 0.5);
      p.vel.set(0, 0, 0);
    }
    screenFx.sleep = Math.min(1, p.sleepTicks / 100);
    const leave = g.input.isDown('sneak') || g.input.isDown('jump');
    if ((leave && p.sleepTicks > 10) || (g.isDay && !g.weather.thundering && p.sleepTicks < 100) || p.dead) { this.wake(g); return; }
    // all players (single player) asleep for 100 ticks: skip the night
    if (p.sleepTicks >= 100) {
      if (g.gamerules.doDaylightCycle !== false) g.dayTime = (Math.floor(g.dayTime / 24000) + 1) * 24000;
      if (g.gamerules.doWeatherCycle !== false && (g.weather.raining || g.weather.thundering)) {
        g.weather.raining = false;
        g.weather.thundering = false;
        g.weather.rainTime = 12000 + Math.floor(Math.random() * 168000);
        g.weather.thunderTime = 12000 + Math.floor(Math.random() * 168000);
        g.weather.rain = 0;
        g.weather.thunder = 0;
      }
      g.events.emit('nightSkipped', { dayTime: g.dayTime });
      this.wake(g);
    }
  }

  onWorldChange() {
    this.bed = null;
  }

  /** Respawn: at a valid bed in the overworld, otherwise at world spawn. */
  private async respawn(g: Game) {
    const p = g.player;
    let target: THREE.Vector3 | null = null;
    const bed = p.data.bedPos as number[] | undefined;
    if (p.spawnPoint && p.spawnDimension === 'overworld') {
      if (bed && g.dimension === 'overworld' && g.world.isLoaded(bed[0], bed[2])) {
        target = isBed(g.world, bed[0], bed[1], bed[2]) ? standUpPosition(g.world, bed[0], bed[1], bed[2]) : null;
        if (!target) {
          p.spawnPoint = null;
          delete p.data.bedPos;
          g.message('You have no home bed or charged respawn anchor, or it was obstructed');
        }
      } else target = p.spawnPoint.clone();
    }
    const at = target ?? p.pos;
    p.respawn(at.x, at.y, at.z);
    if (g.dimension !== 'overworld') {
      await g.enterDimension('overworld', target);
      return;
    }
    if (!target) {
      const s = await g.chunks.findSpawn();
      p.setPos(s.x, s.y, s.z);
    }
  }
}
