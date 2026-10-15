// Characters module: Character (player & bots), movement, animation, hitboxes, camera rig, player controller.
import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import { Priority } from '../core/Engine';
import { CharacterRegistry } from './CharacterRegistry';
import { PlayerController } from './player/PlayerController';
import { CameraRig } from './camera/CameraRig';
import type { Character } from './Character';
import { createVisual, preloadCharacterAssets } from './anim/visualFactory';
import { installCharacterDebug } from './debug';

export { Character } from './Character';
export type { CharacterRegistry } from './CharacterRegistry';

let warnedAnim = false;

/** CPU timings (ms, exponentially smoothed) for the debug overlay / perf tests. */
export const characterPerf = { simMs: 0, animMs: 0, ticks: 0, animated: 0 };

export async function installCharacters(ctx: GameContext): Promise<void> {
  const registry = new CharacterRegistry();
  const controller = new PlayerController();
  const rig = new CameraRig();

  // Start loading the character model + animation library (non-blocking: characters spawn with a
  // placeholder and upgrade when the model arrives).
  void preloadCharacterAssets(ctx);

  registry.onSpawn = (c) => {
    c.visual = createVisual(c);
    ctx.scene.add(c.visual.root);
    if (c.isPlayer) {
      ctx.player = c;
      if (rig.mode === 'menu') rig.setMode('player');
    }
  };
  registry.onRemove = (c) => {
    if (ctx.player === c) ctx.player = null;
    // A removed character can no longer be spectated (its visual is disposed): fall back until the match
    // picks another target.
    if (rig.mode === 'spectate' && rig.followed === c) rig.spectate(null);
  };

  ctx.characters = registry;
  ctx.cameraRig = rig;
  controller.install();
  rig.install(controller);

  ctx.engine.addSystem({
    name: 'characters',
    priority: Priority.Characters,
    fixedUpdate: (dt) => {
      const t0 = performance.now();
      const list = registry.list;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        c.fixedUpdate(dt);
        registry.reindex(c);
      }
      characterPerf.simMs += (performance.now() - t0 - characterPerf.simMs) * 0.05;
      characterPerf.ticks++;
    },
  });

  // Seated characters follow their vehicle *after* it moved this tick (vehicles run after characters, physics
  // later): without this, seat, eye and hitboxes lag one tick (≈0.5 m at 110 km/h). Synced right after the
  // vehicles system (before combat ray-tests hitboxes) and again post-physics (vehicles driven by rigid bodies
  // publish their new transform after the step).
  const syncSeats = () => {
    const list = registry.list;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.mode !== 'vehicle') continue;
      c.syncSeat();
      registry.reindex(c);
    }
  };
  ctx.engine.addSystem({ name: 'characterSeats', priority: Priority.Vehicles + 1, fixedUpdate: syncSeats });
  ctx.engine.addSystem({ name: 'characterSeatsPost', priority: Priority.PostPhysics + 1, fixedUpdate: syncSeats });

  ctx.engine.addSystem({
    name: 'characterAnimation',
    priority: Priority.Animation,
    update: (dt, alpha) => {
      const t0 = performance.now();
      const list = registry.list;
      for (let i = 0; i < list.length; i++) {
        try {
          list[i].visual?.update(dt, alpha);
        } catch (e) {
          if (!warnedAnim) {
            warnedAnim = true;
            console.error('[characters] visual update failed', e);
          }
        }
      }
      characterPerf.animMs += (performance.now() - t0 - characterPerf.animMs) * 0.05;
    },
  });

  // Procedural recoil kick / muzzle timing for the animation layer.
  ctx.events.on('weapon:fired', ({ shooter }) => {
    (shooter as Character).lastShotTime = ctx.engine.simTime;
  });

  installCharacterDebug(ctx, registry, controller, rig);

  // Quick-start convenience while the match module is still a stub: with ?quick=1 and no player spawned by
  // the match after a short delay, spawn a debug player on land near the first named location.
  ctx.events.once('game:ready', () => {
    if (!ctx.flags.has('quick')) return;
    setTimeout(() => {
      const state = ctx.match?.state;
      if (ctx.player || state === 'playing' || state === 'plane') return;
      const pos = findSpawn(ctx);
      console.warn('[characters] no player spawned by the match module — spawning a debug player at', pos.toArray().map((v) => v.toFixed(1)).join(','));
      registry.spawn({ name: 'Player', teamId: 0, isPlayer: true, position: pos, yaw: 0, variant: 0 });
    }, 2500);
  });
}

/** A land spot near the first location (physics ground height, avoids water). */
function findSpawn(ctx: GameContext): THREE.Vector3 {
  const w = ctx.world;
  const loc = w.locations[0];
  const cx = loc?.x ?? w.size / 2, cz = loc?.z ?? w.size / 2;
  for (let r = 0; r < 400; r += 8) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!w.isLand(x, z)) continue;
      if (w.getWaterHeight(x, z) !== null && w.getWaterHeight(x, z)! > w.getHeight(x, z) - 0.2) continue;
      const hit = ctx.physics.groundBelow(new THREE.Vector3(x, w.getHeight(x, z) + 60, z), 120);
      const y = hit ? hit.point.y : w.getHeight(x, z);
      return new THREE.Vector3(x, y + 0.1, z);
    }
  }
  return new THREE.Vector3(cx, w.getHeight(cx, cz) + 0.5, cz);
}
