// =============================================================================
// CABIN MODULE — Boeing 737-800 Sky Interior pressure-hull interior.
//
// Entry point: init(app) -> API (docs/ARCHITECTURE.md §6):
//   windows: [{ index, z, side, inHatch, shade (0 open..1 closed), setShade(v), toggle(), mesh, instanceId, position }]
//   bins:    [{ id, side, cls, zMin, zMax, open, amount, setOpen(bool), toggle(), position }]
//   setReadingLight(seatId, on), toggleCall(seatId), setGasper(seatId, open), psuForSeat(seatId)
//   lights:  { mode, level, transition, override }   (+ setLightsOverride({mode, level}|null))
//   curtain: { open, setOpen(bool) }
//
// Files: profile.js (cross-section), geom.js (builder), bake.js (light-map values),
// materials.js / textures.js, shell.js (lining, floor, bulkheads, blocker, colliders),
// windows.js (reveals, panes, shades, hatches), bins.js, psu.js, fixtures.js, lighting.js.
// =============================================================================
import * as THREE from 'three';
import { createTextures } from './textures.js';
import { createMaterials } from './materials.js';
import { createShell } from './shell.js';
import { createWindows } from './windows.js';
import { createLighting } from './lighting.js';

export async function init(app) {
  const root = new THREE.Group();
  root.name = 'cabin';
  app.cabinRoot.add(root);
  const errors = [];
  const safe = (name, fn) => { try { return fn(); } catch (e) { console.error(`[cabin] ${name} failed`, e); errors.push(name); return null; } };

  const tex = createTextures(app);
  const M = createMaterials(app, tex);
  const lighting = createLighting(app, M, root);
  const shell = safe('shell', () => createShell(app, M, tex, root));
  const windows = safe('windows', () => createWindows(app, M, tex, root));
  // optional parts are loaded lazily so that a failure in one never takes the cabin down
  const mods = await Promise.allSettled([import('./bins.js'), import('./psu.js'), import('./fixtures.js')]);
  const bins = mods[0].status === 'fulfilled' ? safe('bins', () => mods[0].value.createBins(app, M, tex, root)) : null;
  const psu = mods[1].status === 'fulfilled' ? safe('psu', () => mods[1].value.createPSUs(app, M, tex, root, lighting)) : null;
  const fixtures = mods[2].status === 'fulfilled' ? safe('fixtures', () => mods[2].value.createFixtures(app, M, tex, root, { psu })) : null;
  for (const m of mods) if (m.status === 'rejected') console.error('[cabin] submodule failed to load', m.reason);

  // the cabin lining blocks interaction rays (cheap proxies only: bulkheads are boxes)
  app.addUpdate((dt) => {
    lighting.update(dt);
    lighting.updateSpots(dt);
    windows?.update(dt);
    bins?.update(dt);
    psu?.update(dt);
    fixtures?.update(dt);
  }, 40, 'cabin');

  // curtain follows the cabin service: closed in cruise, open for take-off / landing
  app.events.on('flight:phase', ({ phase }) => {
    const c = fixtures?.curtain;
    if (!c) return;
    if (phase === 'cruise') setTimeout(() => { if (app.flight?.state?.phase === 'cruise') c.setOpen(false); }, 45000);
    if (phase === 'descent' || phase === 'approach' || phase === 'gate' || phase === 'taxi_in' || phase === 'arrived') c.setOpen(true);
  });

  // Shades: crew require them open for takeoff and landing; a passenger sitting
  // at a window raises the shade(s) beside them so the view is there.
  const openAll = (instant) => { for (const w of windows?.list || []) if (w.shade > 0) w.setShade(0, { sound: false, instant }); };
  app.events.on('flight:phase', ({ phase }) => {
    if (phase === 'lineup' || phase === 'approach') openAll(false);
  });
  app.events.on('flight:skip', ({ to } = {}) => { if (['takeoff', 'climb', 'approach', 'landing'].includes(to)) openAll(true); });
  app.events.on('player:sit', ({ seatId } = {}) => {
    const seat = app.seats?.byId?.(seatId);
    if (!seat || !seat.isWindow) return;
    for (const w of windows?.list || []) {
      if (w.side === seat.side && Math.abs(w.z - seat.z) < 0.75 && w.shade > 0) w.setShade(0, { sound: true });
    }
  });
  app.events.on('app:ready', () => {
    const ph = app.flight?.state?.phase;
    if (['lineup', 'takeoff', 'climb', 'approach', 'landing'].includes(ph)) openAll(true);
    const sid = app.player?.seat;
    if (sid) { const seat = app.seats?.byId?.(sid); if (seat?.isWindow) for (const w of windows?.list || []) if (w.side === seat.side && Math.abs(w.z - seat.z) < 0.75) w.setShade(0, { sound: false, instant: true }); }
  });

  const api = {
    root, materials: M, textures: tex, errors,
    windows: windows?.list || [],
    bins: bins?.list || [],
    curtain: fixtures?.curtain || null,
    lights: lighting.api,
    setLightsOverride: (o) => lighting.setOverride(o),
    setReadingLight: (seatId, on) => psu?.setReadingLight(seatId, on) ?? false,
    toggleCall: (seatId) => psu?.toggleCall(seatId) ?? false,
    setGasper: (seatId, open) => psu?.setGasper(seatId, open) ?? false,
    psuForSeat: (seatId) => psu?.psuForSeat(seatId) ?? null,
    get anyCall() { return !!psu?.anyCall; },
    windowAt(side, z) {
      let best = null, bd = Infinity;
      for (const w of api.windows) { if (w.side !== side) continue; const d = Math.abs(w.z - z); if (d < bd) { bd = d; best = w; } }
      return best;
    },
    _internal: { shell, windows, bins, psu, fixtures, lighting },
  };
  return api;
}
