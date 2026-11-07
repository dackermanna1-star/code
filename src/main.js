import { App } from './core/app.js';

// =============================================================================
// Bootstrap: create the App, initialise every module in dependency order (each
// isolated in try/catch so one failing module never takes the experience
// down), then start the frame loop.
//
// Each module file exports `async function init(app)` and returns its public
// API, which is stored as app[name].
// =============================================================================
const MODULES = [
  ['environment', () => import('./world/environment/index.js')],   // sky, sun, terrain, water, city
  ['city', () => import('./world/city/index.js')],                 // towns, coastal city, roads, traffic lights
  ['clouds', () => import('./world/clouds/index.js')],             // volumetric clouds + weather
  ['exterior', () => import('./aircraft/exterior/index.js')],      // own wing/engines/gear + aircraft factory
  ['airport', () => import('./world/airport/index.js')],           // both airports + ground traffic
  ['cabin', () => import('./aircraft/cabin/index.js')],            // cabin shell, windows, bins, PSUs, lighting
  ['seats', () => import('./aircraft/seats/index.js')],            // all passenger seats + their interactive parts
  ['galley', () => import('./aircraft/galley/index.js')],          // galleys, lavatories, doors, jumpseats
  ['flight', () => import('./flight/director.js')],                // flight phases + aircraft motion
  ['player', () => import('./player/index.js')],                   // first-person controller + cinematic camera
  ['ife', () => import('./ife/index.js')],                         // seatback entertainment system
  ['audio', () => import('./audio/index.js')],                     // engines, ambience, effects, announcements
  ['hud', () => import('./ui/hud.js')],                            // menus, prompts, captions, progress
];

const loadingEl = document.getElementById('loading');
const loadingBar = document.getElementById('loading-bar');
const loadingText = document.getElementById('loading-text');
function progress(i, n, label) {
  if (loadingBar) loadingBar.style.width = `${Math.round((i / n) * 100)}%`;
  if (loadingText) loadingText.textContent = label;
}

async function boot() {
  const container = document.getElementById('app');
  let app;
  try {
    app = new App(container);
  } catch (e) {
    console.error(e);
    if (loadingText) loadingText.textContent = 'WebGL 2 is required. Please use a recent desktop browser with hardware acceleration enabled.';
    return;
  }
  app.moduleErrors = {};
  const n = MODULES.length + 1;
  for (let i = 0; i < MODULES.length; i++) {
    const [name, loader] = MODULES[i];
    progress(i, n, `Preparing ${name}…`);
    // yield so the loading bar can paint
    await new Promise((r) => setTimeout(r, 0));
    try {
      const mod = await loader();
      const api = await mod.init(app);
      app[name] = api || app[name] || {};
      if (name === 'flight' && api) app.flight = api;
    } catch (e) {
      console.error(`[boot] module "${name}" failed to initialise`, e);
      app.moduleErrors[name] = String(e && e.stack || e);
      if (!app[name]) app[name] = {};
    }
  }
  progress(n - 1, n, 'Loading textures…');
  await app.assets.ready(15000);
  app.resize();
  if (app.debug.colliders) app.colliders.buildDebug(app.scenes.cabin);
  progress(n, n, 'Ready');
  app.ready = true;
  app.events.emit('app:ready', {});
  app.start();
  if (loadingEl) {
    if (app.debug.shot) loadingEl.remove();
    else { loadingEl.classList.add('done'); setTimeout(() => loadingEl.remove(), 900); }
  }
  if (app.debug.autostart) {
    app.started = true;
    app.events.emit('app:start', { auto: true });
  }
  if (app.debug.shot) {
    // signal for scripts/shot.mjs: a number of frames after ready
    const startFrame = app.frame;
    const waitFrames = Number(app.debug.raw.get('frames') || 20);
    const check = () => { if (app.frame - startFrame >= waitFrames) window.__shotReady = true; else requestAnimationFrame(check); };
    requestAnimationFrame(check);
  }
}

boot();
