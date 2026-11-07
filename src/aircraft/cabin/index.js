// =============================================================================
// CABIN MODULE — Boeing 737-800 Sky Interior pressure-hull interior.
// Entry point: init(app) -> API (see docs/ARCHITECTURE.md §6).
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
  const tex = createTextures(app);
  const M = createMaterials(app, tex);
  const lighting = createLighting(app, M, root);
  const shell = createShell(app, M, tex, root);
  const windows = createWindows(app, M, tex, root);

  app.addUpdate((dt) => {
    lighting.update(dt);
    lighting.updateSpots(dt);
    windows.update(dt);
  }, 40, 'cabin');

  const api = {
    root, materials: M,
    windows: windows.list,
    bins: [],
    lights: lighting.api,
    setReadingLight() {}, toggleCall() {}, psuForSeat() { return null; },
  };
  return api;
}
