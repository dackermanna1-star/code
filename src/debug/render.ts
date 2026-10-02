/**
 * Renderer test page: /debug/render.html?time=6000&x=0&y=90&z=0&yaw=0&pitch=-20&frames=12&rd=4
 */
import * as THREE from 'three';
import { Renderer, type Quality } from '../render/renderer';
import { World } from '../world/world';
import { ChunkManager } from '../world/chunkManager';
import { generateStubMaterials, StubAtmosphere } from '../render/stubs';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const info = document.getElementById('info')!;

async function main() {
  if (q.get('dbg')) (globalThis as any).__DEBUG_G = q.get('dbg');
  const renderer = new Renderer(canvas, (q.get('quality') as Quality) ?? 'high');
  renderer.resize(canvas.clientWidth, canvas.clientHeight);
  let mats;
  const optional = import.meta.glob(['../render/materials/generator.ts', '../render/sky/index.ts']);
  const load = async (k: string) => (optional[k] ? ((await optional[k]()) as any) : null);
  if (q.get('mats') === 'full') {
    const mod = await load('../render/materials/generator.ts');
    mats = mod ? await mod.generateBlockMaterials(renderer.gl, num('texsize', 64)) : await generateStubMaterials(renderer.gl, 16);
  } else mats = await generateStubMaterials(renderer.gl, 16);
  renderer.setMaterials(mats);
  let atmo: any;
  if (q.get('sky') === 'full') {
    const mod = await load('../render/sky/index.ts');
    atmo = mod ? new mod.Atmosphere(renderer.gl, 'medium') : new StubAtmosphere(renderer.gl);
  } else atmo = new StubAtmosphere(renderer.gl);
  renderer.setAtmosphere(atmo);
  const seed = num('seed', 12345);
  const world = new World('overworld', seed);
  const rd = num('rd', 4);
  const cm = new ChunkManager(world, renderer.chunks, { renderDistance: rd, decorations: q.get('deco') !== '0', bevels: q.get('bevel') !== '0' });
  const cam = new THREE.PerspectiveCamera(num('fov', 70), 16 / 9, 0.05, 1000);
  const x = num('x', 0.5), z = num('z', 0.5);
  let y = num('y', NaN);
  cam.position.set(x, isNaN(y) ? 90 : y, z);
  cam.rotation.order = 'YXZ';
  cam.rotation.y = THREE.MathUtils.degToRad(num('yaw', 0));
  cam.rotation.x = THREE.MathUtils.degToRad(num('pitch', -15));
  const time = num('time', 3000);
  const frames = num('frames', 8);
  const angle = (time / 24000) * Math.PI * 2;
  const sunDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), -0.25).normalize();
  const t0 = performance.now();
  let rendered = 0;
  const loop = () => {
    cm.update(cam.position.x, cam.position.z);
    const ready = (cm.pendingAround() === 0 && cm.nearReady(Math.min(rd - 1, 3)) && cm.stats.mesh === 0) || performance.now() - t0 > num('maxwait', 60000);
    if (q.get('view')) renderer.debugView = q.get('view')!;
    renderer.render({
      camera: cam, time: (performance.now() - t0) / 1000, dt: 1 / 30,
      sky: { sunDir, moonDir: sunDir.clone().negate(), moonPhase: 0, time: (performance.now() - t0) / 1000, rain: num('rain', 0), thunder: 0, dimension: 'overworld', cameraPosition: cam.position, renderDistance: rd * 16 },
      underwater: false, waterFogColor: new THREE.Color(0.02, 0.08, 0.12), wind: 0, nightVision: 0, damage: 0,
    });
    info.textContent = `chunks ${world.chunks.size} sections ${renderer.chunks.sectionCount} verts ${renderer.chunks.vertexCount} draws ${renderer.stats.drawCalls} ${renderer.stats.frameMs.toFixed(1)}ms ${JSON.stringify(cm.stats)}`;
    if (ready) rendered++;
    if (rendered === 1) {
      const g = renderer.gl.getContext();
      const err = g.getError();
      if (err) console.error('GL error', err);
    }
    if (rendered >= frames) {
      (window as any).__shotReady = true;
      (window as any).__shotInfo = { chunks: world.chunks.size, sections: renderer.chunks.sectionCount, verts: renderer.chunks.vertexCount, draws: renderer.stats.drawCalls, ms: renderer.stats.frameMs };
      return;
    }
    requestAnimationFrame(loop);
  };
  loop();
}
main().catch((e) => { console.error(e); info.textContent = String(e?.stack ?? e); });
