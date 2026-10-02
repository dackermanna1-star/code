/**
 * Bootstrap: UI, game, systems, title screen with a live world panorama, world lifecycle.
 *
 * Test harness URL parameters (skip menus):
 *   ?autostart=1&seed=123&mode=creative&time=6000&x=..&y=..&z=..&yaw=..&pitch=..&frames=30&rd=6&quality=high
 */
import * as THREE from 'three';
import { Game, type WorldInfo } from './game/game';
import { UI } from './ui/ui';
import { titleScreen, loadingScreen, pauseScreen, deathScreen, type MenuCallbacks } from './ui/menus';
import { createSystems } from './game/systemList';
import { loadSettings } from './game/settings';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);

async function boot() {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;
  const settings = loadSettings();
  if (q.has('rd')) settings.renderDistance = num('rd', settings.renderDistance);
  if (q.has('quality')) settings.quality = q.get('quality') as any;
  if (q.has('texsize')) settings.textureSize = num('texsize', settings.textureSize);
  const ui = new UI(uiRoot);
  const loading = loadingScreen();
  ui.open(loading);
  const game = new Game(canvas, settings);
  (window as any).game = game;
  (window as any).THREE = THREE;
  ui.attach(game);
  for (const s of createSystems()) game.addSystem(s);
  await game.initGraphics((msg, f) => loading.set(msg, f));
  loading.set('Initialising systems', 1);
  await game.initSystems();
  ui.close(loading);

  let panorama = false;
  let panoramaYaw = 0;
  const cb: MenuCallbacks = {
    async play(info: WorldInfo, saved?: any) {
      panorama = false;
      await startWorld(info, saved);
    },
    async listWorlds() {
      return (await game.saver?.listWorlds?.()) ?? [];
    },
    async loadWorld(id: string) {
      return (await game.saver?.loadWorld?.(id)) ?? null;
    },
    async deleteWorld(id: string) {
      await game.saver?.deleteWorld?.(id);
    },
    async saveAndQuit() {
      await game.saver?.saveAll?.(game);
      await showTitle();
    },
  };
  ui.pauseFactory = (u) => pauseScreen(u, cb);

  async function startWorld(info: WorldInfo, saved?: any) {
    const ls = loadingScreen();
    ui.closeAll();
    ui.open(ls);
    ls.set('Generating terrain', 0);
    game.stop();
    await game.startWorld(info, saved);
    game.start();
    await new Promise<void>((resolve) => {
      const total = Math.max(1, game.chunks.pendingAround());
      const iv = setInterval(() => {
        const pend = game.chunks.pendingAround();
        ls.set(game.loading ? 'Building terrain' : 'Ready', 1 - pend / total);
        if (!game.loading) {
          clearInterval(iv);
          resolve();
        }
      }, 100);
    });
    ui.close(ls);
    if (!q.has('autostart')) game.input.requestLock();
  }

  async function showTitle() {
    panorama = true;
    const info = Game.createInfo('Panorama', q.get('menuseed') ?? '1912', 'spectator', 'peaceful');
    await game.startWorld(info);
    game.player.flying = true;
    game.gamerules.doMobSpawning = false;
    game.start();
    ui.closeAll();
    ui.open(titleScreen(ui, cb));
  }

  // death handling
  game.events.on('entityDeath', ({ entity }: any) => {
    if (entity !== game.player) return;
    setTimeout(() => {
      game.input.exitLock();
      ui.open(deathScreen(ui, () => {
        const sp = game.player.spawnPoint;
        const p = sp ?? game.player.pos;
        game.player.respawn(p.x, p.y + (sp ? 0 : 1), p.z);
        if (!sp) game.chunks.findSpawn().then((s) => game.player.setPos(s.x, s.y, s.z));
        game.input.requestLock();
      }, () => showTitle()));
    }, 900);
  });

  // per-frame UI & panorama camera
  game.onFrame = (dt) => {
    ui.update(dt);
    if (panorama && game.player && !game.loading) {
      panoramaYaw += dt * 0.035;
      game.player.yaw = panoramaYaw;
      game.player.pitch = -0.12;
    }
  };

  if (q.has('autostart')) {
    const info = Game.createInfo('Test', q.get('seed') ?? '12345', (q.get('mode') as any) ?? 'creative', 'peaceful');
    await startWorld(info);
    const p = game.player;
    if (q.has('time')) { game.dayTime = num('time', 6000); game.gamerules.doDaylightCycle = false; }
    if (q.has('rain')) { game.weather.raining = true; game.weather.rain = num('rain', 1); game.gamerules.doWeatherCycle = false; }
    if (q.has('x') || q.has('z') || q.has('y')) {
      p.flying = p.mayFly;
      p.setPos(num('x', p.pos.x), num('y', p.pos.y), num('z', p.pos.z));
      game.chunks.update(p.pos.x, p.pos.z);
      game.loading = true; // wait for terrain at the new spot
    }
    p.yaw = THREE.MathUtils.degToRad(num('yaw', 0));
    p.pitch = THREE.MathUtils.degToRad(num('pitch', -10));
    const frames = num('frames', 20);
    let n = 0;
    const prev = game.onFrame;
    game.onFrame = (dt) => {
      prev?.(dt);
      if (game.loading || game.chunks.stats.mesh > 0) return;
      if (++n === frames) {
        (window as any).__shotReady = true;
        (window as any).__shotInfo = { fps: game.fps, draws: game.renderer.stats.drawCalls, chunks: game.world.chunks.size, verts: game.renderer.chunks.vertexCount, pos: p.pos.toArray().map((v) => +v.toFixed(1)) };
      }
    };
    return;
  }
  await showTitle();
}

boot().catch((e) => {
  console.error(e);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:0;color:#f88;background:#100;padding:20px;white-space:pre-wrap;font:13px monospace;z-index:99';
  el.textContent = `Failed to start: ${e?.stack ?? e}`;
  document.body.appendChild(el);
});
