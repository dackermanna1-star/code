// Game bootstrap: creates core services, installs every subsystem in dependency order,
// and starts matches. Subsystem agents implement installX() in their module's index.ts.
import * as THREE from 'three';
import { ctx } from '../core/GameContext';
import { Engine, Priority } from '../core/Engine';
import { EventBus } from '../core/EventBus';
import { Input } from '../core/Input';
import { Settings } from '../core/Settings';
import { Assets } from '../core/Assets';
import { Physics } from '../core/Physics';
import { InteractionRegistry } from '../core/Interactions';
import { updateDebugOverlay } from '../core/Debug';
import type { MatchConfig } from '../core/contracts';
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

export async function bootGame(): Promise<void> {
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
  ctx.assets.maxAnisotropy = Math.min(8, ctx.engine.renderer.capabilities.getMaxAnisotropy());
  ctx.physics = new Physics();
  ctx.interactions = new InteractionRegistry();
  (window as any).THREE = THREE;

  // UI first so the loading screen is visible during the rest of the install.
  await installUI(ctx);
  const steps: [string, (c: typeof ctx) => Promise<void>][] = [
    ['Physics', async () => ctx.physics.init()],
    ['World', installWorld],
    ['Buildings', installBuildings],
    ['Vegetation', installVegetation],
    ['Effects', installFx],
    ['Audio', installAudio],
    ['Items', installItems],
    ['Combat', installCombat],
    ['Characters', installCharacters],
    ['Vehicles', installVehicles],
    ['Match', installMatch],
    ['AI', installAI],
  ];
  for (let i = 0; i < steps.length; i++) {
    const [name, fn] = steps[i];
    ctx.ui.setLoading(i / steps.length, `Loading ${name}…`);
    await new Promise((r) => setTimeout(r, 0));
    const t0 = performance.now();
    await fn(ctx);
    console.log(`[boot] ${name} installed in ${(performance.now() - t0).toFixed(0)} ms`);
  }

  // Physics steps after gameplay systems moved kinematic bodies.
  ctx.engine.addSystem({ name: 'physics', priority: Priority.Physics, fixedUpdate: (dt) => ctx.physics.step(dt) });
  ctx.engine.addSystem({ name: 'debug', priority: Priority.UI + 1, lateUpdate: () => updateDebugOverlay(performance.now()) });
  ctx.ui.hideLoading();
  ctx.events.emit('game:ready', {});
  ctx.engine.start();

  if (ctx.flags.has('quick') || ctx.flags.has('autostart')) {
    await startMatch({ quickStart: ctx.flags.has('quick') });
  } else {
    ctx.ui.showMainMenu();
  }
}

/** Default match config merged with overrides (and ?seed=, ?bots=, ?mode= URL flags). */
export function makeMatchConfig(over: Partial<MatchConfig> = {}): MatchConfig {
  const f = ctx.flags;
  const s = ctx.settings.data;
  return {
    mode: (f.get('mode') as MatchConfig['mode']) ?? 'solo',
    totalPlayers: Number(f.get('players') ?? 80),
    difficulty: (f.get('difficulty') as MatchConfig['difficulty']) ?? 'normal',
    perspective: s.gameplay.perspective,
    timeOfDay: Number(f.get('time') ?? 13.5),
    weather: (f.get('weather') as MatchConfig['weather']) ?? 'clear',
    seed: Number(f.get('seed') ?? Math.floor(Math.random() * 1e9)),
    ...over,
  };
}

export async function startMatch(over: Partial<MatchConfig>): Promise<void> {
  const config = makeMatchConfig(over);
  console.log('[game] starting match', config);
  await ctx.match.start(config);
}
