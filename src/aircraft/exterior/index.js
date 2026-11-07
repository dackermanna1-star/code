// =============================================================================
// EXTERIOR AIRCRAFT MODULE
//   * our Boeing 737-800 exterior in app.aircraftRoot (aircraft-local frame):
//     wings with animated high-lift devices, CFM56 nacelles, gear, lights,
//     fuselage + tail + Halcyon livery (fuselage shown in cinematic view only)
//   * createAircraft({ livery, seed, variant, castShadow }) -> { group, update(dt, partial), setState(partial) }
//     cheap LOD aircraft for the airports / traffic (<= 5 draw calls each, shared
//     geometry per variant and material per livery). Same frame convention as ours:
//     origin = floor centreline at the wing quarter chord, -Z = nose; on the ground
//     set group.position.y = AIRCRAFT.groundHeight above the pavement.
//     partial = { n1, gear (0..1), flaps (deg), lights: { nav, beacon, strobe, landing, taxi, logo } }
//     variants: '737-800' (default), '737-900' (+2.6 m), '737-700' (-2.6 m)
// API: { createAircraft, setFuselageVisible(bool), fuselageVisible, liveries (names),
//        liveryInfo, variants, parts (own aircraft parts), own }
// Debug: window.__extStrobeHold = 1 freezes strobes/beacons on (for screenshots).
// =============================================================================
import * as THREE from 'three';
import { buildOwnAircraft } from './aircraft.js';
import { LIVERIES } from './liveries.js';
import { createFactory } from './factory.js';

export async function init(app) {
  if (app.debug?.module === 'noext') return {};
  let own = null;
  try {
    own = buildOwnAircraft(app);
    app.aircraftRoot.add(own.root);
    app.addUpdate((dt) => own.update(dt), 30, 'exterior');
  } catch (e) {
    console.error('[exterior] own aircraft failed', e);
  }
  let factory = null;
  try { factory = createFactory(app); } catch (e) { console.error('[exterior] factory failed', e); }
  const api = {
    own,
    parts: own ? own.parts : {},
    liveries: Object.keys(LIVERIES),
    liveryInfo: LIVERIES,
    variants: factory ? factory.variants : ['737-800'],
    setFuselageVisible(v) { own?.setFuselageVisible(v); },
    get fuselageVisible() { return own ? own.fuselageVisible : false; },
    createAircraft(opts = {}) {
      if (factory) {
        try { return factory.createAircraft(opts); } catch (e) { console.error('[exterior] createAircraft failed', e); }
      }
      return { group: new THREE.Group(), update() {}, setState() {} };
    },
  };
  return api;
}
