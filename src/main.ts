// Entry point: builds the level, runs the fixed-step simulation and renders.
import { Renderer, Environment, PointLight } from './render/renderer';
import { World } from './world/world';
import { generateTestMap } from './map/testmap';
import { Camera } from './engine/camera';
import { Input } from './engine/input';
import { Game } from './game/game';
import { Destruction } from './game/destruction';
import { Player } from './game/player';
import { Tools, TOOL_NAMES, Tool } from './game/tools';
import { Hud } from './ui/hud';
import { Vec3 } from './engine/math';

function norm(v: number[]): [number, number, number] { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }

export const ENV_PRESETS: Record<string, Environment> = {
  afternoon: {
    sunDir: norm([-0.45, 0.52, -0.33]), sunColor: [3.0, 2.55, 2.1], skyZenith: [0.22, 0.38, 0.72], skyHorizon: [0.72, 0.78, 0.86],
    groundColor: [0.28, 0.25, 0.21], fogColor: [0.62, 0.67, 0.74], fogDensity: 0.0035, fogHeight: 0.03, ambient: 0.85, exposure: 1.0,
  },
  sunset: {
    sunDir: norm([-0.8, 0.13, -0.35]), sunColor: [3.4, 1.75, 0.85], skyZenith: [0.16, 0.22, 0.42], skyHorizon: [0.95, 0.62, 0.42],
    groundColor: [0.22, 0.16, 0.12], fogColor: [0.7, 0.52, 0.42], fogDensity: 0.005, fogHeight: 0.025, ambient: 0.75, exposure: 1.15,
  },
  overcast: {
    sunDir: norm([-0.3, 0.8, 0.2]), sunColor: [0.9, 0.9, 0.92], skyZenith: [0.45, 0.48, 0.52], skyHorizon: [0.66, 0.68, 0.7],
    groundColor: [0.25, 0.24, 0.22], fogColor: [0.6, 0.62, 0.64], fogDensity: 0.008, fogHeight: 0.02, ambient: 1.25, exposure: 1.1,
  },
  night: {
    sunDir: norm([0.35, 0.55, 0.3]), sunColor: [0.12, 0.15, 0.24], skyZenith: [0.01, 0.015, 0.035], skyHorizon: [0.04, 0.05, 0.08],
    groundColor: [0.02, 0.02, 0.025], fogColor: [0.04, 0.05, 0.07], fogDensity: 0.012, fogHeight: 0.03, ambient: 0.35, exposure: 1.6,
  },
};
const ENV_ORDER = ['afternoon', 'sunset', 'overcast', 'night'];

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

async function main() {
  const params = new URLSearchParams(location.search);
  const hud = new Hud();
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const renderer = new Renderer(canvas);
  hud.loading(0.03, 'Generating the factory…');
  await nextFrame();
  let envName = params.get('env') || 'afternoon';
  const env = { ...ENV_PRESETS[envName] };
  const world = new World(1024, 384, 1024, 40);
  const t0 = performance.now();
  generateTestMap(world);
  const genMs = performance.now() - t0;
  const workers = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
  const game = new Game(renderer, world, env, workers);
  const destruction = new Destruction(game);
  game.destruction = destruction;
  game.onImpactHook = (e) => destruction.impact(e.a, e.b, e.x, e.y, e.z, e.nx, e.ny, e.nz, e.speed, e.meff, e.matB);
  const player = new Player(game);
  player.spawn.set(25, 4.05, 48);
  player.respawn();
  player.yaw = 0.6;
  const tools = new Tools(game, player);
  const input = new Input(canvas);
  const cam = new Camera();
  // initial meshing
  world.markBoxDirty(0, 0, 0, world.sx - 1, world.sy - 1, world.sz - 1);
  const total = world.dirtyQueue.length;
  while (game.meshes.pending > 0) {
    game.meshes.update(player.pos.x, player.pos.y, player.pos.z);
    hud.loading(0.1 + 0.9 * (1 - game.meshes.pending / Math.max(1, total)), `Meshing ${total - game.meshes.pending} / ${total} regions…`);
    await nextFrame();
  }
  hud.doneLoading();
  const autoplay = params.has('autoplay');
  let playing = autoplay;
  hud.showMenu(!autoplay);
  hud.onStart = () => input.requestLock();
  input.onLockChange = (locked) => { playing = locked || autoplay; hud.showMenu(!playing); };
  let showStats = true;
  hud.onSetting = (k, v) => {
    if (k === 'stats') { showStats = !!v; hud.showStats(showStats); }
    if (k === 'quality') applyQuality(renderer, v as string);
  };
  applyQuality(renderer, params.get('quality') || 'high');

  // flashlight
  let flashlight = false;
  const flashL: PointLight = { x: 0, y: 0, z: 0, radius: 18, r: 0, g: 0, b: 0 };
  let timeScale = 1;
  let acc = 0;
  let last = performance.now();
  let fps = 60, frameMs = 16;
  const timing = { sim: 0, mesh: 0, render: 0, player: 0, simMax: 0 };
  const g = window as any;
  g.__game = {
    game, world, renderer, player, tools, cam, input, meshes: game.meshes, ready: true, frames: 0,
    setEnv: (n: string) => { Object.assign(env, ENV_PRESETS[n]); envName = n; },
    extraStats: () => ({ bodies: game.physics.bodies.length, phys: game.physics.stats, debris: game.particles.dn, bb: game.particles.bn, removed: destruction.totalRemoved, detached: game.stats.detached, genMs, timing, structure: game.structure.stats, gprof: game.prof, dprof: destruction.prof }),
  };

  function frame() {
    const now = performance.now();
    const rawDt = Math.min(0.1, (now - last) / 1000);
    last = now;
    frameMs = frameMs * 0.9 + rawDt * 1000 * 0.1;
    fps = 1000 / frameMs;
    const dt = rawDt * timeScale;
    const enabled = playing;
    if (enabled) {
      if (input.wasPressed('KeyV')) player.noclip = !player.noclip;
      if (input.wasPressed('KeyF')) flashlight = !flashlight;
      if (input.wasPressed('KeyR')) timeScale = timeScale === 1 ? 0.25 : 1;
      if (input.wasPressed('KeyT')) { const i = (ENV_ORDER.indexOf(envName) + 1) % ENV_ORDER.length; envName = ENV_ORDER[i]; Object.assign(env, ENV_PRESETS[envName]); }
    }
    const tp = performance.now();
    player.update(Math.min(dt, 0.05), input, enabled);
    tools.update(dt, input, enabled);
    timing.player = performance.now() - tp;
    const ts = performance.now();
    // fixed step simulation
    acc += dt;
    let steps = 0;
    const h = 1 / 60;
    while (acc >= h && steps < 4) {
      game.step(h);
      destruction.update(h);
      acc -= h;
      steps++;
    }
    if (steps === 4) acc = 0;
    timing.sim = performance.now() - ts;
    timing.simMax = Math.max(timing.simMax * 0.995, timing.sim);
    const alpha = Math.min(1, acc / h);
    // camera
    game.shake = Math.max(0, game.shake - dt * 1.8);
    const sk = game.shake * game.shake;
    cam.x = player.pos.x; cam.y = player.eyeY + Math.sin(player.bob * 2) * 0.03; cam.z = player.pos.z;
    cam.yaw = player.yaw; cam.pitch = player.pitch + tools.recoil;
    cam.shakeX = (Math.random() - 0.5) * sk * 0.15; cam.shakeY = (Math.random() - 0.5) * sk * 0.15;
    cam.roll = Math.sin(player.bob) * 0.004;
    cam.update(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    const tm = performance.now();
    game.meshes.update(cam.x, cam.y, cam.z);
    game.bodyMeshes.update(game.physics.bodies, alpha);
    timing.mesh = performance.now() - tm;
    game.particles.prepare(alpha);
    const lights = game.gatherLights(cam.x, cam.y, cam.z, 40);
    if (flashlight) {
      const f = new Vec3(); cam.forward(f);
      flashL.x = cam.x + f.x * 1.5; flashL.y = cam.y + f.y * 1.5; flashL.z = cam.z + f.z * 1.5;
      flashL.r = 4; flashL.g = 3.8; flashL.b = 3.4;
      lights.unshift(flashL);
    }
    renderer.damage = player.hurtFlash * 0.6;
    const tr = performance.now();
    renderer.render(cam, env, lights, game.meshes, game.bodyMeshes.draws, rawDt);
    timing.render = performance.now() - tr;
    hud.update(rawDt, tools.current, player.health, () =>
      `${fps.toFixed(0)} fps  ${frameMs.toFixed(1)} ms\n` +
      `bodies ${game.physics.bodies.length} (awake ${game.physics.stats.awake})  phys ${game.physics.stats.ms.toFixed(1)} ms\n` +
      `contacts ${game.physics.stats.contacts}  debris ${game.particles.dn}  fx ${game.particles.bn}\n` +
      `quads ${(renderer.stats.quads / 1000).toFixed(0)}k  draws ${renderer.stats.drawn}  remesh ${game.meshes.pending}\n` +
      `voxels destroyed ${destruction.totalRemoved}  detached ${game.stats.detached}\n` +
      `${TOOL_NAMES[tools.current]}${player.noclip ? '  [fly]' : ''}${timeScale < 1 ? '  [slow-mo]' : ''}  ${envName}`);
    input.endFrame();
    g.__game.frames++;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function applyQuality(r: Renderer, q: string): void {
  const s = r.settings;
  switch (q) {
    case 'low': s.scale = 0.6; s.shadows = true; s.shadowSize = 1024; s.ssao = false; s.taa = true; s.bloom = false; break;
    case 'medium': s.scale = 0.8; s.shadows = true; s.shadowSize = 2048; s.ssao = false; s.taa = true; s.bloom = true; break;
    case 'high': s.scale = 1.0; s.shadows = true; s.shadowSize = 2048; s.ssao = true; s.taa = true; s.bloom = true; break;
    case 'ultra': s.scale = 1.0; s.shadows = true; s.shadowSize = 4096; s.ssao = true; s.taa = true; s.bloom = true; break;
  }
  r.invalidateHistory();
}

main().catch((e) => {
  console.error(e);
  document.getElementById('hud')!.innerHTML = `<pre style="color:#f88;padding:20px;white-space:pre-wrap;font:13px monospace">${String((e && e.stack) || e)}</pre>`;
});

export { Tool };
