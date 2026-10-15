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
  };

  ctx.characters = registry;
  ctx.cameraRig = rig;
  controller.install();
  rig.install(controller);

  ctx.engine.addSystem({
    name: 'characters',
    priority: Priority.Characters,
    fixedUpdate: (dt) => {
      const list = registry.list;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        c.fixedUpdate(dt);
        registry.reindex(c);
      }
    },
  });

  ctx.engine.addSystem({
    name: 'characterAnimation',
    priority: Priority.Animation,
    update: (dt, alpha) => {
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
    },
  });

  // Procedural recoil kick / muzzle timing for the animation layer.
  ctx.events.on('weapon:fired', ({ shooter }) => {
    (shooter as Character).lastShotTime = ctx.engine.simTime;
  });

  installCharacterDebug(ctx, registry, controller, rig);
  void THREE;
}
