// World sandbox: full island + environment + render pipeline with a free-fly camera, no gameplay modules.
// URL flags: ?time=18.5&weather=fog&preset=high&modules=buildings,vegetation&texres=512&nopost=1
// Debug helpers: window.__game.debugCam(x,y,z,yaw,pitch), setTime(h), setWeather(w), screenshotTour(), worldInfo()
import * as THREE from 'three';
import { ctx } from '../core/GameContext';
import { Engine } from '../core/Engine';
import { EventBus } from '../core/EventBus';
import { Input } from '../core/Input';
import { Settings, type GraphicsPreset } from '../core/Settings';
import { Assets } from '../core/Assets';
import { Physics } from '../core/Physics';
import { InteractionRegistry } from '../core/Interactions';
import { debugState, registerDebug, updateDebugOverlay } from '../core/Debug';
import { Priority } from '../core/Engine';
import type { IUI } from '../core/contracts';
import '../core/events';
import { getWorldRuntime, installWorld } from '../world';

async function main(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const loading = document.createElement('div');
  loading.id = 'wb-loading';
  loading.textContent = 'Generating island…';
  document.body.appendChild(loading);
  ctx.flags = new URLSearchParams(location.search);
  ctx.events = new EventBus();
  ctx.settings = new Settings();
  ctx.settings.attach(ctx.events);
  const preset = ctx.flags.get('preset') as Exclude<GraphicsPreset, 'custom'> | null;
  if (preset) ctx.settings.applyPreset(preset);
  if (ctx.flags.has('nopost')) ctx.settings.update('graphics', { postProcessing: false });
  ctx.engine = new Engine(canvas);
  ctx.scene = ctx.engine.scene;
  ctx.camera = ctx.engine.camera;
  ctx.input = new Input(canvas);
  ctx.engine.onBeforeTick(() => ctx.input.beginTick());
  ctx.assets = new Assets();
  ctx.physics = new Physics();
  ctx.interactions = new InteractionRegistry();
  ctx.player = null;
  const ui: IUI = {
    capturesInput: false,
    showMainMenu() {},
    showHUD() {},
    showResults() {},
    notify(t) { console.log('[notify]', t); },
    setLoading(_p, m) { loading.textContent = m; },
    hideLoading() { loading.remove(); },
  };
  ctx.ui = ui;
  (window as any).THREE = THREE;
  await ctx.physics.init();
  const t0 = performance.now();
  await installWorld(ctx);
  const mods = (ctx.flags.get('modules') ?? '').split(',').filter(Boolean);
  if (mods.includes('buildings')) await (await import('../buildings')).installBuildings(ctx);
  if (mods.includes('vegetation')) await (await import('../vegetation')).installVegetation(ctx);
  console.log(`[sandbox] world ready in ${(performance.now() - t0).toFixed(0)} ms`);
  ctx.engine.addSystem({ name: 'physics', priority: Priority.Physics, fixedUpdate: (dt) => ctx.physics.step(dt) });
  ctx.engine.addSystem({ name: 'debug', priority: Priority.UI + 1, lateUpdate: () => updateDebugOverlay(performance.now()) });
  const rt = getWorldRuntime()!;
  rt.fly.enabled = true;
  debugState.freeCam = true;
  // default view: Volodino from the south-west hills
  (window as any).__game.debugCam(1150, 95, 1620, 225, -14);
  const panel = document.createElement('div');
  panel.id = 'wb-panel';
  document.body.appendChild(panel);
  ctx.engine.addSystem({
    name: 'sandbox-panel',
    priority: Priority.UI,
    lateUpdate: () => {
      const s = ctx.engine.stats;
      const c = ctx.camera.position;
      const w = ctx.world;
      panel.textContent =
        `${s.fps.toFixed(0)} fps  ${s.frameMs.toFixed(1)} ms  draws ${s.drawCalls}  tris ${(s.triangles / 1000).toFixed(0)}k\n` +
        `terrain nodes ${rt.terrain.nodeCount} [${rt.terrain.lodCounts.join(',')}]\n` +
        `cam ${c.x.toFixed(0)} ${c.y.toFixed(0)} ${c.z.toFixed(0)}  ground ${w.getHeight(c.x, c.z).toFixed(1)}  ${w.getSurface(c.x, c.z)}\n` +
        `time ${rt.environment.timeOfDay.toFixed(2)}  ${rt.environment.weather}  vis ${rt.environment.visibility.toFixed(2)}\n` +
        `near: ${w.nearestLocation(c.x, c.z)?.name ?? '-'}\n` +
        `WASD/Space/C fly, drag/click mouse look, wheel speed`;
    },
  });
  registerDebug('ready', true);
  ui.hideLoading();
  ctx.events.emit('game:ready', {});
  ctx.engine.start();
}

main().catch((e) => {
  console.error('[sandbox] fatal', e);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:0;color:#f66;background:#111;padding:20px;z-index:99999;white-space:pre-wrap';
  el.textContent = 'Failed: ' + (e?.stack ?? e);
  document.body.appendChild(el);
});
