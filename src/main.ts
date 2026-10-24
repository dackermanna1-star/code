// Entry point: builds the level, runs the fixed-step simulation and renders.
import { Renderer, Environment, PointLight } from './render/renderer';
import { World } from './world/world';
import { RegionMeshes } from './world/meshmanager';
import { generateTestMap } from './map/testmap';
import { generateFactory, MAP } from './map/factory';
import { makeProp } from './map/props';
import { Rng } from './engine/math';
import { Camera } from './engine/camera';
import { Input } from './engine/input';
import { Game } from './game/game';
import { Destruction } from './game/destruction';
import { Player } from './game/player';
import { Tools, TOOL_NAMES, Tool } from './game/tools';
import { Hud } from './ui/hud';
import { Vec3 } from './engine/math';
import { Fire } from './game/fire';
import { Audio } from './engine/audio';
import { PAL_MAT, Mat } from './world/materials';
import { ViewModel } from './game/viewmodel';
import { raycastWorld, RayHit } from './physics/raycast';

function norm(v: number[]): [number, number, number] { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }

export const ENV_PRESETS: Record<string, Environment> = {
  afternoon: {
    sunDir: norm([-0.45, 0.52, -0.33]), sunColor: [3.0, 2.55, 2.1], skyZenith: [0.22, 0.38, 0.72], skyHorizon: [0.72, 0.78, 0.86],
    groundColor: [0.28, 0.25, 0.21], fogColor: [0.62, 0.67, 0.74], fogDensity: 0.0024, fogHeight: 0.03, ambient: 0.85, exposure: 0.95,
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
  const useTest = params.has('testmap');
  const world = useTest ? new World(1024, 384, 1024, 40) : new World(MAP.sx, MAP.sy, MAP.sz, MAP.G);
  const t0 = performance.now();
  const mapResult = useTest ? null : generateFactory(world);
  if (useTest) generateTestMap(world);
  const genMs = performance.now() - t0;
  console.log(`level generated in ${genMs.toFixed(0)} ms, dense chunks ${(world.denseBytes() / 1048576).toFixed(1)} MB`);
  const workers = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
  const game = new Game(renderer, world, env, workers);
  const destruction = new Destruction(game);
  game.destruction = destruction;
  game.onImpactHook = (e) => destruction.impact(e.a, e.b, e.x, e.y, e.z, e.nx, e.ny, e.nz, e.speed, e.meff, e.matB);
  const fire = new Fire(game);
  destruction.ignite = (x, y, z) => fire.ignite(x, y, z);
  destruction.igniteSurface = (x, y, z) => fire.igniteSurface(x, y, z);
  const audio = new Audio();
  destruction.onExplosion = (x, y, z, p) => {
    audio.explosion(x, y, z, p);
    // camera shake + knockback/damage depending on distance
    const d = Math.hypot(x - player.pos.x, y - (player.pos.y + 1), z - player.pos.z);
    game.shake = Math.max(game.shake, Math.min(1.2, (p * 2.5) / (1 + d * 0.35)));
    renderer.flash = Math.max(renderer.flash, Math.min(1.5, p / (1 + d * d * 0.05)));
    const r = 1.35 * Math.cbrt(p) + 0.25;
    if (d < r * 3.2 && !player.noclip) {
      player.damage(Math.max(0, (r * 3.2 - d) / (r * 3.2)) * 70 * Math.min(1, p / 3));
      const k = Math.max(0, 1 - d / (r * 3.2)) * 9 * Math.min(1.5, p / 3);
      player.vel.x += ((player.pos.x - x) / (d || 1)) * k; player.vel.y += 2.5 * k * 0.4; player.vel.z += ((player.pos.z - z) / (d || 1)) * k;
    }
  };
  destruction.onBreak = (x, y, z, m, n) => audio.breakMat(x, y, z, m, n);
  destruction.onImpactSound = (x, y, z, palA, palB, e) => audio.impact(x, y, z, PAL_MAT[palA || palB] as Mat, e);
  game.onCrumble = (x, y, z) => audio.crumble(x, y, z);
  fire.onBurnSound = () => { /* loop volume handled per frame */ };
  const player = new Player(game);
  if (mapResult) {
    player.spawn.set(mapResult.spawn.x, mapResult.spawn.y, mapResult.spawn.z);
    player.yaw = mapResult.spawn.yaw;
    // dynamic props (start asleep)
    hud.loading(0.06, 'Placing props\u2026');
    await nextFrame();
    const rng = new Rng(12345);
    let propVox = 0;
    for (const p of mapResult.props) {
      const grid = makeProp(p.kind, p.seed !== undefined ? new Rng(p.seed) : rng).rotY(p.rot);
      const body = game.spawnGrid(grid.vox, grid.sx, grid.sy, grid.sz, p.x, p.y, p.z, undefined, true);
      if (body) propVox += body.count;
    }
    console.log(`props: ${mapResult.props.length} bodies, ${propVox} voxels`);
    for (const L of mapResult.lamps) game.lamps.push({ light: { x: (L.x + 0.5) * 0.1, y: (L.y - 0.6) * 0.1, z: (L.z + 0.5) * 0.1, radius: L.radius, r: L.r, g: L.g, b: L.b }, vx: L.x, vy: L.y, vz: L.z, on: true });
  } else player.spawn.set(25, 4.05, 48);
  player.respawn();
  const tools = new Tools(game, player);
  game.keepClear = player.pos;
  const viewModel = new ViewModel();
  const vmHit = new RayHit();
  const vmFwd = new Vec3();
  tools.onIgnite = (x, y, z) => { if (!fire.ignite(x, y, z)) fire.igniteAt((x + 0.5) * 0.1, (y + 0.5) * 0.1, (z + 0.5) * 0.1, 0.15); };
  tools.onSound = (name, x, y, z, vol) => {
    if (name === 'shotgun' || name === 'rifle' || name === 'rocket') audio.shot(name, x, y, z);
    else if (x === 0 && y === 0 && z === 0) audio.ui(name);
    else audio.ui(name, x, y, z, vol);
  };
  player.onStep = () => audio.ui('step', player.pos.x, player.pos.y, player.pos.z, 0.35);
  player.onLand = (sp) => audio.ui('land', player.pos.x, player.pos.y, player.pos.z, Math.min(1, sp / 8));
  const input = new Input(canvas);
  const cam = new Camera();
  applyQuality(renderer, game.meshes, params.get('quality') || 'high');
  // initial meshing
  world.markBoxDirty(0, 0, 0, world.sx - 1, world.sy - 1, world.sz - 1);
  const total = world.dirtyQueue.length;
  while (game.meshes.pending > 0) {
    game.meshes.update(player.pos.x, player.pos.y, player.pos.z);
    // the main thread is mostly idle while workers mesh: analyse intact structures meanwhile
    game.stress.baselineStep(Math.floor(player.pos.x * 10), Math.floor(player.pos.z * 10), 25);
    hud.loading(0.1 + 0.9 * (1 - game.meshes.pending / Math.max(1, total)), `Meshing ${total - game.meshes.pending} / ${total} regions…`);
    await nextFrame();
  }
  hud.doneLoading();
  const autoplay = params.has('autoplay');
  let playing = autoplay;
  hud.showMenu(!autoplay);
  hud.onStart = () => { audio.start(); input.requestLock(); };
  input.onLockChange = (locked) => { playing = locked || autoplay; hud.showMenu(!playing); };
  let showStats = params.has('stats') || autoplay;
  hud.showStats(showStats);
  hud.setOption('quality', params.get('quality') || 'high');
  hud.setOption('env', envName);
  hud.onSetting = (k, v) => {
    if (k === 'stats') { showStats = !!v; hud.showStats(showStats); }
    if (k === 'quality') applyQuality(renderer, game.meshes, v as string);
    if (k === 'env' && ENV_PRESETS[v as string]) { envName = v as string; Object.assign(env, ENV_PRESETS[envName]); }
  };

  // flashlight
  let flashlight = false;
  const flashL: PointLight = { x: 0, y: 0, z: 0, radius: 18, r: 0, g: 0, b: 0 };
  let timeScale = 1;
  const fixedDt = params.has('fixeddt');
  let acc = 0;
  let last = performance.now();
  let fps = 60, frameMs = 16;
  const timing = { sim: 0, mesh: 0, render: 0, player: 0, simMax: 0 };
  const g = window as any;
  g.__game = {
    game, world, renderer, player, tools, cam, input, fire, audio, viewModel, meshes: game.meshes, ready: true, frames: 0,
    setEnv: (n: string) => { Object.assign(env, ENV_PRESETS[n]); envName = n; },
    extraStats: () => ({ fires: fire.count, bodies: game.physics.bodies.length, phys: game.physics.stats, debris: game.particles.dn, bb: game.particles.bn, removed: destruction.totalRemoved, detached: game.stats.detached, genMs, timing, structure: game.structure.stats, stress: game.stress.stats, gprof: game.prof, dprof: destruction.prof }),
  };

  function frame() {
    const now = performance.now();
    // ?fixeddt: every frame advances exactly 1/60 s (deterministic headless captures)
    const rawDt = fixedDt ? 1 / 60 : Math.min(0.1, (now - last) / 1000);
    last = now;
    frameMs = frameMs * 0.9 + rawDt * 1000 * 0.1;
    fps = 1000 / frameMs;
    const dt = rawDt * timeScale;
    const enabled = playing;
    if (enabled) {
      if (input.wasPressed('KeyV')) player.noclip = !player.noclip;
      if (input.wasPressed('KeyF')) flashlight = !flashlight;
      if (input.wasPressed('F3')) { showStats = !showStats; hud.showStats(showStats); }
      if (input.wasPressed('KeyR')) timeScale = timeScale === 1 ? 0.25 : 1;
      if (input.wasPressed('KeyT')) { const i = (ENV_ORDER.indexOf(envName) + 1) % ENV_ORDER.length; envName = ENV_ORDER[i]; Object.assign(env, ENV_PRESETS[envName]); hud.setOption('env', envName); }
    }
    const tp = performance.now();
    if (g.__game.frames % 3 === 0) game.stress.baselineStep(Math.floor(player.pos.x * 10), Math.floor(player.pos.z * 10), 4);
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
      fire.update(h);
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
    cam.forward(vmFwd);
    const wallDist = raycastWorld(world, cam.x, cam.y, cam.z, vmFwd.x, vmFwd.y, vmFwd.z, 1.2, vmHit) ? vmHit.dist : 1.2;
    const vm = viewModel.update(cam, tools.current, tools.anim, tools.recoil, player.bob, rawDt, input.mouseDX, input.mouseDY, tools.torchActive, wallDist);
    game.bodyMeshes.update(game.physics.bodies, alpha, enabled ? vm : null);
    timing.mesh = performance.now() - tm;
    (game.particles as any).prepare(alpha);
    const lights = game.gatherLights(cam.x, cam.y, cam.z, 40);
    audio.setListener(cam.x, cam.y, cam.z, cam.yaw);
    audio.setLoops(fire.count > 0 ? Math.min(1, fire.count / 150) : 0, tools.torchActive, cam.y);
    renderer.flash = Math.max(0, renderer.flash - rawDt * 4);
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
      `voxels destroyed ${destruction.totalRemoved}  detached ${game.stats.detached}  fires ${fire.count}\n` +
      `stress ${game.stress.stats.analyses} (${game.stress.stats.ms.toFixed(1)} ms) failures ${game.stress.stats.failures}\n` +
      `${TOOL_NAMES[tools.current]}${player.noclip ? '  [fly]' : ''}${timeScale < 1 ? '  [slow-mo]' : ''}  ${envName}`);
    input.endFrame();
    g.__game.frames++;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function applyQuality(r: Renderer, meshes: RegionMeshes, q: string): void {
  const s = r.settings;
  switch (q) {
    case 'low': s.scale = 0.6; s.shadows = true; s.shadowSize = 1024; s.ssao = false; s.taa = true; s.bloom = false; s.volumetrics = false; s.ssr = false; meshes.lodDist = [40, 90]; break;
    case 'medium': s.scale = 0.8; s.shadows = true; s.shadowSize = 2048; s.ssao = false; s.taa = true; s.bloom = true; s.volumetrics = false; s.ssr = false; meshes.lodDist = [50, 110]; break;
    case 'high': s.scale = 1.0; s.shadows = true; s.shadowSize = 2048; s.ssao = true; s.taa = true; s.bloom = true; s.volumetrics = true; s.ssr = true; meshes.lodDist = [60, 130]; break;
    case 'ultra': s.scale = 1.0; s.shadows = true; s.shadowSize = 4096; s.ssao = true; s.taa = true; s.bloom = true; s.volumetrics = true; s.ssr = true; meshes.lodDist = [90, 180]; break;
  }
  meshes.refreshLod();
  r.invalidateHistory();
}

main().catch((e) => {
  console.error(e);
  document.getElementById('hud')!.innerHTML = `<pre style="color:#f88;padding:20px;white-space:pre-wrap;font:13px monospace">${String((e && e.stack) || e)}</pre>`;
});

export { Tool };
