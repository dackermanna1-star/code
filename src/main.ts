// Entry point (development harness: renderer + free camera over the test map).
import { Renderer, Environment } from './render/renderer';
import { World } from './world/world';
import { RegionMeshes } from './world/meshmanager';
import { generateTestMap } from './map/testmap';
import { Camera } from './engine/camera';
import { Input } from './engine/input';

const env: Environment = {
  sunDir: norm([-0.45, 0.52, -0.33]),
  sunColor: [3.0, 2.55, 2.1],
  skyZenith: [0.22, 0.38, 0.72],
  skyHorizon: [0.72, 0.78, 0.86],
  groundColor: [0.28, 0.25, 0.21],
  fogColor: [0.62, 0.67, 0.74],
  fogDensity: 0.0035,
  fogHeight: 0.03,
  ambient: 0.85,
  exposure: 1.0,
};

function norm(v: number[]): [number, number, number] { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }

async function main() {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const renderer = new Renderer(canvas);
  const world = new World(1024, 384, 1024, 40);
  const t0 = performance.now();
  generateTestMap(world);
  console.log('map generated in', (performance.now() - t0).toFixed(0), 'ms');
  world.markBoxDirty(0, 0, 0, world.sx - 1, world.sy - 1, world.sz - 1);
  const workers = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
  const meshes = new RegionMeshes(world, renderer.pool, workers);
  const cam = new Camera();
  cam.x = 25; cam.y = 9; cam.z = 48; cam.yaw = 0.6; cam.pitch = -0.15;
  const params = new URLSearchParams(location.search);
  if (params.has('cam')) {
    const [x, y, z, yaw, pitch] = params.get('cam')!.split(',').map(Number);
    cam.x = x; cam.y = y; cam.z = z; cam.yaw = yaw; cam.pitch = pitch;
  }
  const input = new Input(canvas);
  canvas.addEventListener('click', () => input.requestLock());
  let last = performance.now();
  const g = (window as any);
  g.__game = { world, meshes, renderer, cam, ready: false, frames: 0 };
  function frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    cam.yaw -= input.mouseDX * input.sensitivity;
    cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch - input.mouseDY * input.sensitivity));
    const sp = (input.isDown('ShiftLeft') ? 30 : 8) * dt;
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    if (input.isDown('KeyW')) { cam.x += fx * sp; cam.z += fz * sp; }
    if (input.isDown('KeyS')) { cam.x -= fx * sp; cam.z -= fz * sp; }
    if (input.isDown('KeyA')) { cam.x += fz * sp; cam.z -= fx * sp; }
    if (input.isDown('KeyD')) { cam.x -= fz * sp; cam.z += fx * sp; }
    if (input.isDown('Space')) cam.y += sp;
    if (input.isDown('KeyC')) cam.y -= sp;
    meshes.update(cam.x, cam.y, cam.z);
    if (!g.__game.ready && meshes.pending > 0 && g.__game.frames > 2) { g.__game.frames++; input.endFrame(); requestAnimationFrame(frame); return; }
    cam.update(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    renderer.render(cam, env, [], meshes, [], dt);
    input.endFrame();
    g.__game.frames++;
    if (meshes.pending === 0) g.__game.ready = true;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  document.getElementById('hud')!.innerHTML = `<pre style="color:#f88;padding:20px;white-space:pre-wrap">${String(e && e.stack || e)}</pre>`;
});
