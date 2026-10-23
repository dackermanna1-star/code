import * as THREE from 'three';
import { Pipeline } from './engine/pipeline.js';
import { U } from './engine/uniforms.js';
import { AdaptiveResolution } from './engine/adaptiveResolution.js';
import { Settings, PRESETS } from './settings.js';
import { Game, SPAWN } from './game.js';
import { heightAt, getOasis, OASIS_CELL } from './world/heightfield.js';
import { AudioEngine } from './audio/audio.js';
import { UI } from './ui/ui.js';

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) ? parseFloat(params.get(k)) : d);
const RESUME_KEY = 'sahara-wanderer-resume';

function readResume() {
  try {
    const raw = window.sessionStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(RESUME_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function snapshot(game) {
  const p = game.player;
  return {
    x: p.feet.x,
    z: p.feet.z,
    yaw: p.headingDeg,
    pitch: (p.pitch * 180) / Math.PI,
    time: game.world.timeOfDay,
    weather: game.weather.mode,
  };
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function boot(hotData = {}) {
  const canvas = document.getElementById('scene');
  const loaderStatus = document.getElementById('load-status');
  const setLoading = (p, t) => {
    document.getElementById('load-bar').style.width = `${Math.round(p * 100)}%`;
    if (t) loaderStatus.textContent = t;
  };
  setLoading(0.08, 'Preparing the renderer…');
  await nextFrame();

  let pipeline;
  try {
    pipeline = new Pipeline(canvas, { preserveDrawingBuffer: params.has('capture') });
  } catch (e) {
    loaderStatus.textContent = 'This browser could not start WebGL 2, which the desert needs. Try a recent Chrome, Edge, Firefox or Safari, with hardware acceleration enabled.';
    loaderStatus.classList.add('error');
    console.error(e);
    return;
  }
  const settings = new Settings();
  const requested = params.get('q') || settings.get('quality');
  let presetName = requested === 'auto' || !PRESETS[requested] ? Settings.detectPreset(pipeline.renderer) : requested;
  const quality = { ...PRESETS[presetName] };
  for (const [k, v] of params) {
    if (!k.startsWith('set.')) continue;
    quality[k.slice(4)] = v === 'true' ? true : v === 'false' ? false : Number.isNaN(Number(v)) ? v : Number(v);
  }
  pipeline.configure({
    renderScale: quality.renderScale,
    maxPixelRatio: quality.maxPixelRatio,
    msaa: quality.msaa,
    fxaa: quality.fxaa,
    bloomLevels: quality.bloomLevels,
  });

  setLoading(0.25, 'Shaping the dunes…');
  await nextFrame();
  const game = new Game({ pipeline, settings, quality, presetName, canvas });
  const resume = { ...readResume(), ...hotData };
  game.world.exposureBias = settings.get('exposureBias') || 0;
  game.world.setTimeOfDay(num('time', resume.time ?? 16.8));
  if (params.has('time')) game.timeSpeed = 0;
  if (params.has('weather')) game.weather.setMode(params.get('weather'), true);
  else if (resume.weather) game.weather.setMode(resume.weather, true);
  game.world.terrainMaterial.uniforms.uDebugView.value = num('dbg', 0);
  const sx = num('x', resume.x ?? SPAWN.x);
  const sz = num('z', resume.z ?? SPAWN.z);
  game.player.setPosition(sx, sz, num('yaw', resume.yaw ?? SPAWN.yaw), num('pitch', resume.pitch ?? -4));
  if (params.has('h')) {
    game.player.photoMode = true;
    game.player.feet.y = heightAt(sx, sz) + num('h', 2);
  }

  const audio = new AudioEngine();
  audio.setVolume(settings.get('volume'));
  game.player.on('step', (e) => audio.footstep(e));
  game.player.on('land', (e) => audio.land(e.impact));

  const ui = new UI(game, settings, audio, {
    presetName,
    requestedQuality: requested,
    onQualityChange: () => {
      try {
        window.sessionStorage.setItem(RESUME_KEY, JSON.stringify(snapshot(game)));
      } catch {
        // Fine: we just restart at the spawn point.
      }
      location.reload();
    },
  });

  const adaptive = new AdaptiveResolution(pipeline, { min: 0.5, max: quality.renderScale });
  adaptive.onChange = () => game.resize();

  // Compile every shader up front so the first steps don't hitch.
  setLoading(0.45, 'Compiling shaders…');
  await nextFrame();
  try {
    game.step(0.016);
    if (pipeline.renderer.compileAsync) await pipeline.renderer.compileAsync(game.scene, game.camera);
  } catch (e) {
    console.warn('Shader warm-up failed', e);
  }
  setLoading(0.8, 'Raising the sun…');
  for (let i = 0; i < 3; i++) {
    game.step(0.016);
    await nextFrame();
  }

  const camFwd = new THREE.Vector3();
  const audioState = {
    listener: { pos: game.camera.position, fwd: camFwd },
    oasis: null,
    oasisDistance: 1e9,
  };
  const oasisPos = new THREE.Vector3();
  game.onFrame((dt) => {
    if (settings.get('autoResolution') && ui.state === 'playing') adaptive.update(game.rawDt);
    ui.update(dt);
    game.camera.getWorldDirection(camFwd);
    const p = game.player;
    const o = getOasis(Math.floor(p.feet.x / OASIS_CELL), Math.floor(p.feet.z / OASIS_CELL)) || game.oases.active[0] || null;
    if (o) oasisPos.set(o.x, o.waterLevel + 1, o.z);
    const w = U.uWindDir.value;
    // Wind arriving from the player's right pans the wind bed to the right.
    const rightX = Math.cos(p.yaw);
    const rightZ = Math.sin(p.yaw);
    Object.assign(audioState, {
      wind: game.weather.windSpeed,
      gust: game.weather.gust,
      storm: U.uStorm.value,
      windRelX: -(w.x * rightX + w.y * rightZ),
      sliding: p.sliding > 0.02 && p.grounded,
      onLee: p.ground.lee,
      speed: p.speed,
      oasis: o ? oasisPos : null,
      oasisDistance: o ? Math.hypot(o.x - p.feet.x, o.z - p.feet.z) : 1e9,
      day: Math.max(0, Math.min(1, game.world.sunDir.y * 6)),
      night: game.world.night,
    });
    audio.update(dt, audioState);
  });

  window.__sahara = {
    game,
    ui,
    audio,
    U,
    preset: presetName,
    get frames() {
      return game.frames;
    },
    debugInfo() {
      const r = (v) => Math.round(v * 1e4) / 1e4;
      const b = new Float32Array(4);
      const at = game.world.atmosphere;
      pipeline.renderer.readRenderTargetPixels(at.exposureRT[at.exposureIndex], 0, 0, 1, 1, b);
      return {
        preset: presetName,
        frames: game.frames,
        exposure: r(b[0]),
        sun: game.world.sunDir.toArray().map(r),
        nodes: game.world.terrain.stats.nodes,
        veg: game.vegetation.stats,
        oases: game.oases.active.length,
        weather: game.weather.state,
        cam: game.camera.position.toArray().map((v) => Math.round(v * 10) / 10),
      };
    },
  };
  if (params.has('validate')) {
    import('./dev/validateHeightfield.js').then(({ validateHeightfield }) => {
      window.__sahara.validation = validateHeightfield(pipeline.renderer);
    });
  }

  // Keep the walk going across live updates in the Claude artifact viewer.
  window.claude?.hot?.snapshot?.(() => snapshot(game));

  setLoading(1, 'Ready');
  game.start();
  ui.finishLoading();
  if (params.has('play')) ui.play();
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready((data) => boot(data || {}));
else boot(hot?.data ?? {});
