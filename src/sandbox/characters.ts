// Characters sandbox: boots the engine with the test arena (or the real world with ?world=real), spawns the
// player + 6 scripted dummy bots, and exposes automation helpers for tools/characters-*.mjs.
import * as THREE from 'three';
import { ctx } from '../core/GameContext';
import { Engine, Priority } from '../core/Engine';
import { EventBus } from '../core/EventBus';
import { Input } from '../core/Input';
import { Settings } from '../core/Settings';
import { Assets } from '../core/Assets';
import { Physics } from '../core/Physics';
import { InteractionRegistry } from '../core/Interactions';
import { registerDebug, updateDebugOverlay } from '../core/Debug';
import '../core/events';
import { installWorld } from '../world';
import { installBuildings } from '../buildings';
import { installVegetation } from '../vegetation';
import { installFx } from '../fx';
import { installAudio } from '../audio';
import { installItems } from '../items';
import { installCombat } from '../combat';
import { installCharacters } from '../characters';
import { installVehicles } from '../vehicles';
import { installMatch } from '../match';
import { installAI } from '../ai';
import { installUI } from '../ui';
import { installArenaWorld, ARENA, SPOTS, POOL } from './charactersArena';
import { installScriptedBots } from './charactersBots';
import type { Character } from '../characters/Character';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  ctx.flags = new URLSearchParams(location.search);
  ctx.events = new EventBus();
  ctx.settings = new Settings();
  ctx.settings.attach(ctx.events);
  ctx.engine = new Engine(canvas);
  ctx.scene = ctx.engine.scene;
  ctx.camera = ctx.engine.camera;
  ctx.input = new Input(canvas);
  ctx.input.setBindings(ctx.settings.data.controls.bindings);
  ctx.engine.onBeforeTick(() => ctx.input.beginTick());
  ctx.assets = new Assets();
  ctx.physics = new Physics();
  ctx.interactions = new InteractionRegistry();
  (window as any).THREE = THREE;
  if (ctx.flags.has('fpp')) ctx.settings.data.gameplay.perspective = 'fpp';

  await installUI(ctx);
  await ctx.physics.init();
  const realWorld = ctx.flags.get('world') === 'real';
  if (realWorld) await installWorld(ctx);
  else await installArenaWorld(ctx);
  for (const fn of [installBuildings, installVegetation, installFx, installAudio, installItems, installCombat, installCharacters, installVehicles, installMatch, installAI]) {
    await fn(ctx);
  }
  ctx.engine.addSystem({ name: 'physics', priority: Priority.Physics, fixedUpdate: (dt) => ctx.physics.step(dt) });
  ctx.engine.addSystem({ name: 'debug', priority: Priority.UI + 1, lateUpdate: () => updateDebugOverlay(performance.now()) });
  ctx.ui.hideLoading();
  ctx.events.emit('game:ready', {});

  // Player + bots.
  let start = SPOTS.start.clone();
  if (realWorld) {
    const loc = ctx.world.locations[0];
    start = new THREE.Vector3(loc?.x ?? ctx.world.size / 2, 0, loc?.z ?? ctx.world.size / 2);
    start.y = ctx.world.getHeight(start.x, start.z);
  }
  const player = ctx.characters.spawn({ name: 'Player', teamId: 0, isPlayer: true, position: start.clone().setY(start.y + 0.05), yaw: 0 }) as Character;
  if (!ctx.flags.has('nobots')) installScriptedBots(ctx, start);

  // Pointer lock on click (manual play).
  canvas.addEventListener('click', () => ctx.input.requestPointerLock());
  registerDebug('arena', { ARENA, SPOTS, POOL });
  registerDebug('sandboxPlayer', player);
  ctx.engine.start();
  (window as any).__sandboxReady = true;
}

boot().catch((e) => {
  console.error('[sandbox] boot failed', e);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:0;color:#f66;background:#111;padding:20px;z-index:99999;white-space:pre-wrap';
  el.textContent = 'Sandbox failed: ' + (e?.stack ?? e);
  document.body.appendChild(el);
});
