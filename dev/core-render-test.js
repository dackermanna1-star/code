import * as THREE from 'three';
import { World, SURFACE } from '../src/world/World.js';
import { B } from '../src/world/blocks.js';
import { ChunkRenderer } from '../src/world/ChunkRenderer.js';
import { Renderer } from '../src/render/Renderer.js';
import { Sky } from '../src/render/Sky.js';
import { Weather } from '../src/render/Weather.js';
import { getBlockTextures } from '../src/render/textureArray.js';
import { globalUniforms } from '../src/render/materials.js';
import { makeRng, makeNoise2D } from '../src/core/rng.js';

const params = new URLSearchParams(location.search); console.warn('params', location.search);
const hour = parseFloat(params.get('hour') || '10');
const flash = params.get('flash') === '1';
const world = new World(256, 64, 256);
const n2 = makeNoise2D(1);
for (let z = 0; z < 256; z++) for (let x = 0; x < 256; x++) {
  const h = SURFACE + Math.round(n2(x / 40, z / 40) * 3 * Math.min(1, Math.max(0, (x - 120) / 40)));
  world.fill(x, 0, z, x, h - 4, z, B.stone);
  world.fill(x, h - 3, z, x, h - 1, z, B.dirt);
  world.set(x, h, z, B.grass);
  if ((x * 7 + z * 13) % 11 === 0 && x > 130) world.set(x, h + 1, z, B.tall_grass);
}
// road
world.fill(0, SURFACE, 100, 255, SURFACE, 108, B.asphalt);
world.fill(0, SURFACE, 104, 255, SURFACE, 104, B.road_yellow_x);
// house
const hx = 100, hz = 80;
world.fill(hx, SURFACE, hz, hx + 10, SURFACE, hz + 8, B.floor_wood);
world.walls(hx, SURFACE + 1, hz, hx + 10, SURFACE + 4, hz + 8, B.siding_blue);
world.fill(hx - 1, SURFACE + 5, hz - 1, hx + 11, SURFACE + 5, hz + 9, B.roof_dark);
world.set(hx + 3, SURFACE + 2, hz + 8, B.glass); world.set(hx + 3, SURFACE + 3, hz + 8, B.glass);
world.set(hx + 7, SURFACE + 2, hz + 8, B.glass); world.set(hx + 7, SURFACE + 3, hz + 8, B.glass);
world.placeDoor(hx + 5, SURFACE + 1, hz + 8, 0, 'door_wood');
world.place(hx + 1, SURFACE + 1, hz + 1, 'fridge', 0);
world.place(hx + 2, SURFACE + 1, hz + 1, 'stove', 0);
world.place(hx + 3, SURFACE + 1, hz + 1, 'kitchen_cabinet', 0);
world.place(hx + 8, SURFACE + 1, hz + 3, 'stairs_wood', 0);
world.place(hx + 12, SURFACE + 1, hz + 9, 'fence_picket', 0);
world.place(hx + 13, SURFACE + 1, hz + 9, 'fence_picket', 0);
world.set(hx + 14, SURFACE + 1, hz + 3, B.campfire);
// trees
const rng = makeRng(5);
for (let i = 0; i < 40; i++) {
  const tx = rng.int(130, 250), tz = rng.int(10, 240);
  const ty = world.height[tz * 256 + tx] || SURFACE;
  let gy = SURFACE; while (world.get(tx, gy + 1, tz)) gy++;
  for (let y = 1; y <= 5; y++) world.set(tx, gy + y, tz, B.log_oak);
  const leaf = rng.pick([B.leaves_oak, B.leaves_autumn, B.leaves_autumn_red]);
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 4; dy <= 7; dy++) {
    if (Math.abs(dx) + Math.abs(dz) + Math.max(0, dy - 6) * 2 > 3) continue;
    if (!world.get(tx + dx, gy + dy, tz + dz)) world.set(tx + dx, gy + dy, tz + dz, leaf);
  }
}
// water pond
world.fill(60, SURFACE - 2, 30, 80, SURFACE, 50, B.water);
world.computeHeightmap();
world.generated = true;
await world.computeAllLight();

const r = new Renderer(document.getElementById('game'));
const tex = getBlockTextures();
const chunks = new ChunkRenderer(world, r.scene, tex);
chunks.radius = 10;
r.initShadows(chunks.group, tex.texture);
const sky = new Sky(r.scene);
const weather = new Weather(r.scene, world, makeRng(2));
const w = params.get('weather') || 'clear';
weather.set(w, true);
const cam = r.camera;
cam.position.set(hx + 5.5, SURFACE + 2.6, hz + 16);
cam.rotation.set(-0.12, 0.25, 0);
if (params.get('cam')) { const c = params.get('cam').split(',').map(Number); cam.position.set(c[0], c[1], c[2]); cam.rotation.set(c[4], c[3], 0); }
if (params.get('inside')) { cam.position.set(hx + 5, SURFACE + 2.6, hz + 6); cam.rotation.set(-0.2, Math.PI * 0.8, 0); }
await chunks.prebuild(cam.position.x, cam.position.z, 10);
let t = 0;
function frame() {
  t += 1 / 60;
  globalUniforms.uTime.value = t;
  globalUniforms.uCamPos.value.copy(cam.position);
  sky.update(hour, weather.params, 1);
  weather.update(1 / 60, 0, hour, 1);
  globalUniforms.uFlashOn.value = flash ? 1 : 0;
  cam.updateMatrixWorld();
  globalUniforms.uFlashPos.value.copy(cam.position);
  cam.getWorldDirection(globalUniforms.uFlashDir.value);
  chunks.update(cam.position);
  r.render(null, cam.position);
  window.__frames = (window.__frames || 0) + 1;
  requestAnimationFrame(frame);
}
frame();
window.__ready = true;
