/**
 * Mob model turntable / lineup page.
 *   /debug/mobs.html?mobs=zombie,creeper&pose=walk|idle|attack&yaw=30&pitch=-10&dist=6&time=3000&frames=8
 *   &rot=<model yaw deg>  &spacing=1.6  &tx/ty/tz = camera target  &view=normal|albedo (G-buffer debug)
 *   &t=<animation time seconds>  &variant=<per-mob variant list matching mobs>
 */
import * as THREE from 'three';
import { Renderer, type Quality } from '../render/renderer';
import { World } from '../world/world';
import { Chunk } from '../world/chunk';
import { ChunkManager } from '../world/chunkManager';
import { lightChunkLocal } from '../world/light';
import { S } from '../world/blocks/registry';
import '../world/blocks/blocks';
import { generateStubMaterials, StubAtmosphere } from '../render/stubs';
import { ENTITY_SHARED } from '../render/entityMaterial';
import { HeliVisual } from '../entity/vehicles/heliModel';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const info = document.getElementById('info')!;

function flatChunk(cx: number, cz: number, h: number) {
  const c = new Chunk(cx, cz);
  for (let x = 0; x < 16; x++)
    for (let z = 0; z < 16; z++) {
      for (let y = 0; y < h - 1; y++) c.set(x, y, z, y < h - 4 ? S('stone') : S('dirt'));
      c.set(x, h - 1, z, S('grass_block'));
      c.heightmap[z * 16 + x] = h;
      c.grassColor[z * 16 + x] = 0x79c05a;
      c.foliageColor[z * 16 + x] = 0x59ae30;
      c.waterColor[z * 16 + x] = 0x3f76e4;
    }
  lightChunkLocal(c);
  c.status = 'ready';
  return c;
}

async function main() {
  const renderer = new Renderer(canvas, (q.get('quality') as Quality) ?? 'high');
  renderer.resize(canvas.clientWidth, canvas.clientHeight);
  const optional = import.meta.glob(['../render/materials/generator.ts', '../render/sky/index.ts']);
  const load = async (k: string) => (optional[k] ? ((await optional[k]()) as any) : null);
  let mats = null;
  if (q.get('mats') === 'full') {
    const mod = await load('../render/materials/generator.ts');
    if (mod) mats = await mod.generateBlockMaterials(renderer.gl, 64);
  }
  renderer.setMaterials(mats ?? (await generateStubMaterials(renderer.gl, 16)));
  let atmo: any = null;
  if (q.get('sky') === 'full') {
    const mod = await load('../render/sky/index.ts');
    if (mod) atmo = new mod.Atmosphere(renderer.gl, 'medium');
  }
  renderer.setAtmosphere(atmo ?? new StubAtmosphere(renderer.gl));

  renderer.setAtmosphere(atmo ?? new StubAtmosphere(renderer.gl));
  const H = 64;
  const world = new World('overworld', 1);
  const R = 3;
  for (let cx = -R - 1; cx <= R + 1; cx++) for (let cz = -R - 1; cz <= R + 1; cz++) world.addChunk(flatChunk(cx, cz, H));
  const cm = new ChunkManager(world, renderer.chunks, { renderDistance: R, decorations: false, bevels: true });
  const scene = new THREE.Scene();
  const fwd = new THREE.Scene();
  const heli = new HeliVisual(renderer);
  scene.add(heli.root);
  fwd.add(heli.forward);
  const rpm = num('rpm', 0);
  const cam = new THREE.PerspectiveCamera(num('fov', 45), 16 / 9, 0.05, 500);
  const target = new THREE.Vector3(0, H + num('ty', 1.4), 0);
  const yaw = THREE.MathUtils.degToRad(num('yaw', 35)), pitch = THREE.MathUtils.degToRad(num('pitch', -12));
  const dist = num('dist', 13);
  cam.position.set(target.x - Math.sin(yaw) * Math.cos(pitch) * dist, target.y - Math.sin(pitch) * dist, target.z - Math.cos(yaw) * Math.cos(pitch) * dist);
  cam.lookAt(target);
  const angle = (num('time', 3000) / 24000) * Math.PI * 2;
  const sunDir = new THREE.Vector3(Math.cos(angle) * 0.8, Math.sin(angle), -0.45).normalize();
  const frames = num('frames', 10);
  const t0 = performance.now();
  let n = 0, last = t0, time = 0;
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    cm.update(0, 0);
    heli.update({
      com: new THREE.Vector3(0, H + 1.3, 0), quat: new THREE.Quaternion(), dt, time, rpm, n1: rpm, collective: 0.3, stickX: 0, stickY: 0,
      discX: 0, discZ: 0, pedal: 0, load: 0, compression: [0.5, 0.5, 0.5, 0.5], vel: new THREE.Vector3(), powered: rpm > 0, piloted: false, showPilot: false,
      light: world.getLight(0, H + 2, 0), hurt: 0, altitude: 0, airspeed: 0, vspeed: 0, heading: 0, roll: 0, camDist: dist,
    } as any);
    cam.updateMatrixWorld(true);
    ENTITY_SHARED.u_viewInvRot.value.setFromMatrix4(cam.matrixWorld);
    renderer.render({
      camera: cam, time: (now - t0) / 1000, dt,
      sky: { sunDir, moonDir: sunDir.clone().negate(), moonPhase: 0, time: (now - t0) / 1000, rain: 0, thunder: 0, dimension: 'overworld', cameraPosition: cam.position, renderDistance: R * 16 },
      underwater: false, waterFogColor: new THREE.Color(0.02, 0.08, 0.12), wind: 0, nightVision: 0, damage: 0,
      gbufferScenes: [scene], shadowScenes: [scene], forwardScenes: [fwd],
    } as any);
    if (cm.stats.mesh === 0 && ++n >= frames) {
      (window as any).__shotReady = true;
      return;
    }
    requestAnimationFrame(loop);
  };
  loop();
}
main().catch((e) => { console.error(e); info.textContent = String(e?.stack ?? e); });
