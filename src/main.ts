// Entry point (development harness: renderer + free camera over the test map).
import { Renderer, Environment } from './render/renderer';
import { World } from './world/world';
import { RegionMeshes } from './world/meshmanager';
import { generateTestMap } from './map/testmap';
import { Camera } from './engine/camera';
import { Input } from './engine/input';
import { Physics } from './physics/physics';
import { Body } from './physics/body';
import { BodyMeshes } from './game/bodymeshes';
import { P } from './world/materials';
import { Rng } from './engine/math';

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
  const physics = new Physics(world);
  const bodyMeshes = new BodyMeshes(renderer);
  const rng = new Rng(7);
  const spawn = () => {
    for (let i = 0; i < 40; i++) {
      const sx = rng.int(2, 12), sy = rng.int(2, 10), sz = rng.int(2, 12);
      const vox = new Uint8Array(sx * sy * sz).fill(rng.pick([P.crate, P.concrete, P.brick, P.steel, P.plank, P.paintRed]));
      const b = new Body(sx, sy, sz, vox);
      b.computeMass(); b.buildSamples();
      b.pos.set(28 + rng.range(-3, 3), 6 + i * 0.8, 40 + rng.range(-3, 3));
      b.rot.setAxisAngle(0.3, 0.8, 0.5, rng.range(0, 3)).normalize();
      b.ang.set(rng.range(-2, 2), rng.range(-2, 2), rng.range(-2, 2));
      physics.add(b);
    }
  };
  if (params.has('phys')) spawn();
  let acc = 0;
  const input = new Input(canvas);
  canvas.addEventListener('click', () => input.requestLock());
  let last = performance.now();
  const g = (window as any);
  g.__game = { world, meshes, renderer, cam, ready: false, frames: 0, physics,
    extraStats: () => ({ phys: physics.stats, bodies: physics.bodies.length, sleeping: physics.bodies.filter((b) => b.sleeping).length,
      ys: physics.bodies.slice(0, 8).map((b) => +b.pos.y.toFixed(2)) }) };
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
    if (input.wasPressed('KeyP')) spawn();
    if (g.__game.ready || params.has('physnow')) {
      acc += dt;
      let steps = 0;
      while (acc >= 1 / 60 && steps < 3) { physics.step(1 / 60); acc -= 1 / 60; steps++; }
      if (steps === 3) acc = 0;
    }
    bodyMeshes.update(physics.bodies, Math.min(1, acc * 60));
    meshes.update(cam.x, cam.y, cam.z);
    if (!g.__game.ready && meshes.pending > 0 && g.__game.frames > 2) { g.__game.frames++; input.endFrame(); requestAnimationFrame(frame); return; }
    cam.update(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    renderer.render(cam, env, [], meshes, bodyMeshes.draws, dt);
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
