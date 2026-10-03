/**
 * Connects game events to the procedural audio engine: block sounds, footsteps, combat,
 * pickups, XP, ambience beds, music mode. Mobs can provide `sounds` on the entity:
 *   entity.sounds = { hurt: 'mob.zombie.hurt', death: 'mob.zombie.death', say: 'mob.zombie.say', step: 'mob.zombie.step' }
 */
import * as THREE from 'three';
import type { Game } from './game';
import type { GameSystem } from './systems';
import { BLOCKS } from '../world/blocks/registry';
import { BIOMES } from '../world/biomes';

export class AudioGlueSystem implements GameSystem {
  readonly name = 'audioGlue';
  private started = false;
  private game!: Game;

  init(game: Game) {
    this.game = game;
    const a = game.audio;
    if (!a) return;
    const start = () => {
      if (this.started) return;
      this.started = true;
      a.init().then(() => {
        a.setMasterVolume?.(game.settings.masterVolume);
        a.setCategoryVolume?.('music', game.settings.musicVolume);
      }).catch((e: any) => console.warn('audio init failed', e));
    };
    window.addEventListener('pointerdown', start, { capture: true });
    window.addEventListener('keydown', start, { capture: true });
    const ev = game.events;
    const at = (x: number, y: number, z: number) => ({ x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    ev.on('blockBroken', ({ x, y, z, state }: any) => a.playBlock(BLOCKS[state >>> 4].sound, 'break', { pos: at(x, y, z) }));
    ev.on('blockPlaced', ({ x, y, z, state }: any) => a.playBlock(BLOCKS[state >>> 4].sound, 'place', { pos: at(x, y, z) }));
    ev.on('blockHitting', ({ x, y, z, state }: any) => a.playBlock(BLOCKS[state >>> 4].sound, 'hit', { pos: at(x, y, z), volume: 0.5 }));
    ev.on('footstep', ({ entity, block }: any) => {
      if (entity.inWater) { a.play('liquid.swim', { pos: entity.pos, volume: 0.35 }); return; }
      if (!block) return;
      const snd = entity.sounds?.step;
      if (snd) a.play(snd, { pos: entity.pos, volume: 0.4 });
      else a.playBlock(BLOCKS[block >>> 4].sound, 'step', { pos: entity.pos, volume: entity === game.player ? 0.3 : 0.25 });
    });
    ev.on('entityFallDamage', ({ entity, damage }: any) => {
      if (entity === game.player) a.play(damage > 4 ? 'game.player.hurt.fall.big' : 'game.player.hurt.fall.small', { pos: entity.pos });
      else a.play(damage > 4 ? 'entity.generic.big_fall' : 'entity.generic.small_fall', { pos: entity.pos });
    });
    ev.on('entityHurt', ({ entity, source }: any) => {
      if (entity === game.player) {
        if (source.type !== 'fall') a.play('game.player.hurt', { pos: entity.pos });
      } else if (entity.sounds?.hurt) a.play(entity.sounds.hurt, { pos: entity.pos });
      if (source.type === 'fire' || source.type === 'lava') a.play('entity.generic.burn', { pos: entity.pos, volume: 0.6 });
    });
    ev.on('entityDeath', ({ entity }: any) => {
      if (entity === game.player) a.play('game.player.die', { pos: entity.pos });
      else if (entity.sounds?.death) a.play(entity.sounds.death, { pos: entity.pos });
    });
    ev.on('playerAttack', ({ player, crit, sweep, strength }: any) => {
      const name = crit ? 'game.player.attack.crit' : sweep ? 'game.player.attack.sweep' : strength > 0.9 ? 'game.player.attack.strong' : 'game.player.attack.weak';
      a.play(name, { pos: player.pos });
    });
    ev.on('playerAttackMiss', ({ player }: any) => a.play('game.player.attack.nodamage', { pos: player.pos, volume: 0.5 }));
    ev.on('itemPickup', ({ player }: any) => a.play('random.pop', { pos: player.pos, volume: 0.25, pitch: 1 + (Math.random() - 0.5) * 0.6 }));
    ev.on('itemDropped', ({ player }: any) => a.play('random.pop', { pos: player.pos, volume: 0.2, pitch: 0.8 }));
    ev.on('levelUp', ({ player }: any) => a.play('random.levelup', { pos: player.pos, volume: 0.8 }));
    ev.on('xpPickup', ({ player }: any) => a.play('random.orb', { pos: player.pos, volume: 0.3, pitch: 0.6 + Math.random() * 0.8 }));
    ev.on('itemBroke', ({ player }: any) => a.play('random.break', { pos: player.pos }));
    ev.on('arrowHit', ({ arrow }: any) => a.play('random.bowhit', { pos: arrow.pos }));
    ev.on('arrowStuck', ({ arrow }: any) => a.play('entity.arrow.hit', { pos: arrow.pos }));
    ev.on('jump', ({ entity }: any) => {
      const b = entity.blockBelow?.();
      if (b && entity === game.player) a.playBlock(BLOCKS[b >>> 4].sound, 'step', { pos: entity.pos, volume: 0.18 });
    });
    ev.on('blockLanded', ({ x, y, z, state }: any) => a.playBlock(BLOCKS[state >>> 4].sound, 'land', { pos: at(x, y, z) }));
    ev.on('anvilLand', ({ x, y, z }: any) => a.play('random.anvil_land', { pos: at(x, y, z) }));
    ev.on('explosion', ({ pos, power }: any) => a.play('random.explode', { pos, volume: Math.max(2, power) }));
    ev.on('dimensionChanged', ({ dimension }: any) => a.setMusicMode?.(dimension === 'nether' ? 'nether' : dimension === 'end' ? 'end' : game.player?.creative ? 'creative' : 'overworld'));
    if (game.world) (game.world as any).systems.fluidFizz = (x: number, y: number, z: number) => a.play('random.fizz', { pos: at(x, y, z), volume: 0.6 });
  }

  onWorldChange(game: Game) {
    if (game.audio) (game.world as any).systems.fluidFizz = (x: number, y: number, z: number) => game.audio.play('random.fizz', { pos: { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, volume: 0.6 });
  }

  private ambT = 0;
  update(game: Game, dt: number) {
    const a = game.audio;
    if (!a || !this.started) return;
    a.update(dt);
    this.ambT += dt;
    if (this.ambT < 0.1) return;
    this.ambT = 0;
    const p = game.player;
    if (!p) return;
    const cam = game.cameraCtl.camera.position;
    const bx = Math.floor(cam.x), by = Math.floor(cam.y), bz = Math.floor(cam.z);
    const sky = game.world.getSkyLight(bx, by, bz);
    const biome = BIOMES[game.world.getBiome(bx, bz)]?.name ?? 'plains';
    const camBlock = game.world.getBlock(bx, by, bz);
    const underwater = camBlock !== 0 && BLOCKS[camBlock >>> 4].liquid === 1;
    a.setAmbience({
      underwater,
      caveFactor: game.dimension === 'overworld' ? THREE.MathUtils.clamp(1 - sky / 12, 0, 1) * (cam.y < 60 ? 1 : 0.7) : 0.6,
      rain: game.weather.rain * (sky > 6 ? 1 : 0.4),
      thunder: game.weather.thunder,
      wind: THREE.MathUtils.clamp((cam.y - 70) / 80, 0, 1) * (sky / 15),
      dimension: game.dimension as any,
      biome,
      timeOfDay: (game.dayTime % 24000) / 24000,
      inLava: p.inLava,
    });
  }
}
