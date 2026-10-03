/**
 * PhysicsSystem: loads Rapier once, owns the PhysicsWorld (`game.physics`), steps it at the
 * fixed 60 Hz physics rate and turns rigid-body impacts into sounds / `physicsImpact` events.
 *
 * `game.physics` API (see PhysicsWorld): addBody, removeBody, applyImpulse, setVelocity,
 * teleport, raycast, queryBox, querySphere, wakeAround, stats, R (the Rapier module), rw
 * (the Rapier world). Bodies' owners: ItemEntity, PrimedTntEntity, debris, ragdolls.
 */
import type { Game } from '../game/game';
import type { GameSystem } from '../game/systems';
import type { World } from '../world/world';
import { PhysicsWorld, type PhysBody, type RapierModule } from './rapierWorld';
import { BLOCKS } from '../world/blocks/registry';

let rapierPromise: Promise<RapierModule> | null = null;
/** Load and initialise Rapier once (shared by every PhysicsWorld). */
export function loadRapier(): Promise<RapierModule> {
  if (!rapierPromise) {
    rapierPromise = import('@dimforge/rapier3d-compat').then(async (m: any) => {
      const R = (m.default ?? m) as RapierModule;
      await R.init();
      return R;
    });
  }
  return rapierPromise;
}

export class PhysicsSystem implements GameSystem {
  readonly name = 'physics';
  R: RapierModule | null = null;
  private sounds: number[] = [];
  private game!: Game;
  private errors = 0;

  async init(game: Game) {
    this.game = game;
    try {
      this.R = await loadRapier();
    } catch (e) {
      console.warn('Rapier unavailable, rigid-body physics disabled', e);
      return;
    }
    if (game.world) this.onWorldChange(game, game.world);
  }

  onWorldChange(game: Game, world: World) {
    if (!this.R) return;
    let pw = game.physics as PhysicsWorld | null;
    if (!pw) {
      pw = new PhysicsWorld(this.R, world);
      pw.onImpact = (b, speed, other) => this.impact(b, speed, other);
      pw.onLost = (b) => b.owner?.onPhysicsLost?.(b);
      game.physics = pw;
      // warm up the solver (first step allocates)
      pw.step(1 / 60);
    } else pw.attach(world);
  }

  physics(game: Game, dt: number) {
    const pw = game.physics as PhysicsWorld | null;
    if (!pw || !this.R) return;
    try {
      pw.step(dt);
    } catch (e) {
      if (this.errors++ < 5) console.error('physics step failed', e);
    }
  }

  private impact(b: PhysBody, speed: number, other: PhysBody | null) {
    const g = this.game;
    g.events.emit('physicsImpact', { body: b, other, speed, pos: b.pos.clone(), kind: b.kind });
    const a = g.audio;
    if (!a?.playBlock || b.kind === 'ragdoll' && speed < 3) return;
    // global limiter: at most 8 impact sounds per 0.25 s
    const now = performance.now();
    while (this.sounds.length && now - this.sounds[0] > 250) this.sounds.shift();
    if (this.sounds.length >= 8) return;
    const p = g.player?.pos;
    if (p && p.distanceToSquared(b.pos) > 32 * 32) return;
    this.sounds.push(now);
    let group: string = b.userData.sound;
    if (!group) {
      const st = g.world.getBlock(Math.floor(b.pos.x), Math.floor(b.pos.y - b.half.y - 0.1), Math.floor(b.pos.z));
      group = st ? BLOCKS[st >>> 4].sound : 'stone';
    }
    if (group === 'none' || group === 'liquid') group = 'stone';
    const vol = Math.min(1, (speed - 1) / 8) * Math.min(1, 0.25 + b.mass / 20);
    a.playBlock(group, b.mass > 30 ? 'land' : 'step', { pos: b.pos, volume: Math.max(0.05, vol), pitch: b.mass < 2 ? 1.5 : b.mass < 20 ? 1.15 : 0.8 });
  }
}
