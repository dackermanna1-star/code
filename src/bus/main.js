import * as THREE from 'three';
import { App } from '../core/app.js';
import { BUS_ANCHORS } from './world/geo.js';
import { getRoute } from './world/route.js';
import { createTripState } from './trip/state.js';
import { COACH } from './core/constants.js';

// =============================================================================
// Coach road trip bootstrap (bus.html). Reuses the flight-sim core (App,
// render pipeline, input, interactions, colliders, assets) and the world
// modules (environment, clouds, city) with the bus geography (the import map
// in bus.html remaps src/world/geo.js -> src/bus/world/geo.js).
// =============================================================================
const MODULES = [
  ['environment', () => import('../world/environment/index.js')],   // sky, sun, atmosphere, terrain, water (reused)
  ['road', () => import('./road/index.js')],                          // road surface, markings, roadside, tunnels, bridges, road field
  ['city', () => import('../world/city/index.js')],                   // towns & Port Solano (reused, keeps clear of the road)
  ['clouds', () => import('../world/clouds/index.js')],               // volumetric clouds (reused)
  ['weather', () => import('./weather/index.js')],                    // rain, wet roads, raindrops on glass, mist
  ['stations', () => import('./stations/index.js')],                  // bus stations, Ridgefield stop, Hollow Pass rest area
  ['traffic', () => import('./traffic/index.js')],                    // other vehicles
  ['exterior', () => import('./exterior/index.js')],                  // our coach's exterior, wheels, mirrors, wipers, lights
  ['interior', () => import('./interior/index.js')],                  // coach cabin shell, glazing, racks, lighting, toilet, doors
  ['seats', () => import('./seats/index.js')],                        // passenger seats + driver cockpit
  ['trip', () => import('./trip/index.js')],                          // trip director + vehicle dynamics + driver mode
  ['player', () => import('./player/index.js')],                      // first-person passenger, cinematic camera
  ['info', () => import('./info/index.js')],                          // onboard info screens + the player's phone
  ['audio', () => import('./audio/index.js')],                        // engine, road, rain, foley, announcements
  ['hud', () => import('./ui/hud.js')],                               // menus, prompts, captions, progress
];

const loadingBar = document.getElementById('loading-bar');
const loadingText = document.getElementById('loading-text');
const loadingEl = document.getElementById('loading');
const progress = (i, n, label) => { if (loadingBar) loadingBar.style.width = `${Math.round((i / n) * 100)}%`; if (loadingText) loadingText.textContent = label; };

async function boot() {
  let app;
  try { app = new App(document.getElementById('app')); } catch (e) {
    console.error(e);
    if (loadingText) loadingText.textContent = 'WebGL 2 is required. Please use a recent desktop browser with hardware acceleration enabled.';
    return;
  }
  app.kind = 'bus';
  app.vehicleRoot = app.aircraftRoot;   // our coach's exterior parts (bus-local space)
  app.moduleErrors = {};
  // bus-world anchors & route (the route registers the road corridor with the geography)
  app.world.departureOrigin.set(BUS_ANCHORS.dep.x, 0, BUS_ANCHORS.dep.z);
  app.world.arrivalOrigin.set(BUS_ANCHORS.arr.x, 0, BUS_ANCHORS.arr.z);
  app.route = getRoute();
  // placeholder trip state until the trip module replaces it (parked at the first stop)
  const st = createTripState();
  const p = app.route.pointAt(0, 1.75);
  st.position.set(p.x, p.y - COACH.roadY, p.z);
  st.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -app.route.sample(0).heading * Math.PI / 180);
  st.altitude = st.position.y;
  app.trip = { state: st, stub: true };
  app.flight = app.trip;  // reused world modules read app.flight.state
  app.cabinBounds.set(new THREE.Vector3(-1.32, -1.45, -6.6), new THREE.Vector3(1.32, 2.4, 6.6));
  app.outsideShadowRadius = 30;

  const n = MODULES.length + 1;
  for (let i = 0; i < MODULES.length; i++) {
    const [name, loader] = MODULES[i];
    progress(i, n, `Preparing ${name}…`);
    await new Promise((r) => setTimeout(r, 0));
    try {
      const mod = await loader();
      const api = await mod.init(app);
      app[name] = api || app[name] || {};
      if (name === 'trip' && api && api.state) { app.trip = api; app.flight = api; }
    } catch (e) {
      console.error(`[boot] module "${name}" failed to initialise`, e);
      app.moduleErrors[name] = String((e && e.stack) || e);
      if (!app[name]) app[name] = {};
    }
  }
  progress(n - 1, n, 'Loading textures…');
  await app.assets.ready(15000);
  app.resize();
  app._syncWorld?.();
  if (app.debug.colliders) app.colliders.buildDebug(app.scenes.cabin);
  progress(n, n, 'Ready');
  app.ready = true;
  app.events.emit('app:ready', {});
  app.start();
  if (loadingEl) {
    if (app.debug.shot) loadingEl.remove();
    else { loadingEl.classList.add('done'); setTimeout(() => loadingEl.remove(), 900); }
  }
  if (app.debug.autostart) { app.started = true; app.events.emit('app:start', { auto: true }); }
  if (app.debug.shot) {
    const startFrame = app.frame;
    const waitFrames = Number(app.debug.raw.get('frames') || 20);
    const check = () => { if (app.frame - startFrame >= waitFrames) window.__shotReady = true; else requestAnimationFrame(check); };
    requestAnimationFrame(check);
  }
}
boot();
