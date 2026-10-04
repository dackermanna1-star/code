/**
 * Alien ship viewer: /debug/aliens.html?ship=fighter|bomber|destroyer|mother|fleet
 *   &yaw=35&pitch=-12&dist=40&ty=0 (camera orbit around the ship)  &time=5000 (day time)
 *   &sky=full (real atmosphere)  &dmg=0..1  &n=300 (fleet size)
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
import { fighterGeometry, bomberGeometry, bomberRingGeometry, destroyerGeometry, mothershipGeometry } from '../game/aliens/shipDesigns';
import { hullMaterial, BillboardPool, BB_GLOW, SHARED_TIME } from '../game/aliens/alienRender';

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
  renderer.setMaterials(await generateStubMaterials(renderer.gl, 16));
  let atmo: any = null;
  if (q.get('sky') === 'full') {
    const mod = await load('../render/sky/index.ts');
    if (mod) atmo = new mod.Atmosphere(renderer.gl, 'medium');
  }
  renderer.setAtmosphere(atmo ?? new StubAtmosphere(renderer.gl));
  const H = 64;
  const world = new World('overworld', 1);
  const R = 3;
  for (let cx = -R - 1; cx <= R + 1; cx++) for (let cz = -R - 1; cz <= R + 1; cz++) world.addChunk(flatChunk(cx, cz, H));
  const cm = new ChunkManager(world, renderer.chunks, { renderDistance: R, decorations: false, bevels: true });
  const scene = new THREE.Scene();
  const fwd = new THREE.Scene();
  const kind = q.get('ship') ?? 'fighter';
  const dmg = num('dmg', 0);
  const glows = new BillboardPool(renderer, 4000, false);
  fwd.add(glows.mesh);
  const shipY = H + num('alt', 20);
  let fleet: { m: THREE.Matrix4[]; geo: THREE.BufferGeometry; extra?: THREE.BufferGeometry } | null = null;
  if (kind === 'mother') {
    const parts = mothershipGeometry();
    const mat = hullMaterial(renderer, false, 6);
    for (const g of [parts.hull, parts.core, parts.ring]) {
      const m = new THREE.Mesh(g, mat);
      m.position.set(0, shipY, 0);
      m.frustumCulled = false;
      fwd.add(m);
    }
  } else {
    const geo = kind === 'bomber' ? bomberGeometry() : kind === 'destroyer' ? destroyerGeometry() : fighterGeometry();
    const n = kind === 'fleet' ? num('n', 400) : 1;
    const g = kind === 'fleet' ? fighterGeometry() : geo;
    const mesh = new THREE.InstancedMesh(g, hullMaterial(renderer, true, 6), n);
    const state = new Float32Array(n * 4);
    const rnd = (i: number) => { const x = Math.sin(i * 91.7) * 43758.5; return x - Math.floor(x); };
    for (let i = 0; i < n; i++) {
      const m = new THREE.Matrix4();
      if (n === 1) m.makeRotationY(0).setPosition(0, shipY, 0);
      else m.makeRotationY(Math.PI + (rnd(i) - 0.5) * 0.3).setPosition((rnd(i + 1) - 0.5) * 900, shipY + rnd(i + 2) * 300, -100 - rnd(i + 3) * 1500);
      mesh.setMatrixAt(i, m);
      state[i * 4] = dmg; state[i * 4 + 1] = 1; state[i * 4 + 2] = rnd(i);
    }
    mesh.geometry.setAttribute('a_state', new THREE.InstancedBufferAttribute(state, 4));
    mesh.frustumCulled = false;
    fwd.add(mesh);
    if (kind === 'bomber') {
      const ring = new THREE.InstancedMesh(bomberRingGeometry(), hullMaterial(renderer, true, 6), 1);
      ring.setMatrixAt(0, new THREE.Matrix4().makeRotationZ(0.3).setPosition(0, shipY, 0));
      ring.geometry.setAttribute('a_state', new THREE.InstancedBufferAttribute(new Float32Array([dmg, 1, 0.3, 0]), 4));
      ring.frustumCulled = false;
      fwd.add(ring);
    }
    if (n > 1) {
      fleet = { m: [], geo: g };
      for (let i = 0; i < n; i++) { const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m); fleet.m.push(m); }
    }
  }
  const cam = new THREE.PerspectiveCamera(num('fov', 50), 16 / 9, 0.1, 9000);
  const target = new THREE.Vector3(0, shipY + num('ty', 0), 0);
  const yaw = THREE.MathUtils.degToRad(num('yaw', 35)), pitch = THREE.MathUtils.degToRad(num('pitch', -12));
  const dist = num('dist', 40);
  cam.position.set(target.x - Math.sin(yaw) * Math.cos(pitch) * dist, target.y - Math.sin(pitch) * dist, target.z - Math.cos(yaw) * Math.cos(pitch) * dist);
  if (q.has('camy')) cam.position.y = num('camy', 70);
  cam.lookAt(target);
  const angle = (num('time', 5000) / 24000) * Math.PI * 2;
  const sunDir = new THREE.Vector3(Math.cos(angle) * 0.8, Math.sin(angle), -0.45).normalize();
  const frames = num('frames', 10);
  const t0 = performance.now();
  let n = 0, last = t0, time = 0;
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    SHARED_TIME.value = time;
    cm.update(0, 0);
    glows.begin();
    if (fleet) for (const m of fleet.m) { const p = new THREE.Vector3().setFromMatrixPosition(m); glows.push(p.x, p.y, p.z + 7, 1.2, 1.2, 0.3 * 8, 0.95 * 8, 1 * 8, 1, BB_GLOW); }
    glows.commit();
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
main().catch((e) => { console.error(e); info.textContent = String(e?.stack ?? e); (window as any).__shotReady = true; });
