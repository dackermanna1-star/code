/**
 * Mob model turntable / lineup page.
 *   /debug/mobs.html?mobs=zombie,creeper&pose=walk|idle|attack&yaw=30&pitch=-10&dist=6&time=3000&frames=8
 *   &rot=<model yaw deg>  &spacing=1.6  &tx/ty/tz = camera target  &view=normal|albedo (G-buffer debug)
 *   &t=<animation time seconds>  &variant=<per-mob variant list matching mobs>
 */
import * as THREE from 'three';
import { WoundSet, type WoundType } from '../game/gore/wounds';
import { Renderer, type Quality } from '../render/renderer';
import { World } from '../world/world';
import { Chunk } from '../world/chunk';
import { ChunkManager } from '../world/chunkManager';
import { lightChunkLocal } from '../world/light';
import { S } from '../world/blocks/registry';
import '../world/blocks/blocks';
import { generateStubMaterials, StubAtmosphere } from '../render/stubs';
import { ENTITY_SHARED, setEntityLight } from '../render/entityMaterial';
import { createRig, modelSpec } from '../entity/models/catalog';
import { newAnimState } from '../entity/models/anim/common';
import { pendingTextures } from '../entity/models/textures';
import type { Rig } from '../entity/models/rig';
import '../entity/models/register';

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

  const H = 64;
  const world = new World('overworld', 1);
  const R = 3;
  for (let cx = -R - 1; cx <= R + 1; cx++) for (let cz = -R - 1; cz <= R + 1; cz++) world.addChunk(flatChunk(cx, cz, H));
  const cm = new ChunkManager(world, renderer.chunks, { renderDistance: R, decorations: false, bevels: true });

  // lineup
  const names = (q.get('mobs') ?? 'zombie').split(',').filter(Boolean);
  const variants = (q.get('variant') ?? '').split(',');
  const spacing = num('spacing', 1.6);
  const scene = new THREE.Scene();
  const rigs: { rig: Rig; name: string; st: ReturnType<typeof newAnimState>; mem: Record<string, any> }[] = [];
  names.forEach((n, i) => {
    const [model, variant0] = n.split(':');
    const rig = createRig(model, variant0 ?? variants[i] ?? '');
    const x = (i - (names.length - 1) / 2) * spacing;
    rig.root.position.set(x, H, 0);
    rig.root.rotation.y = THREE.MathUtils.degToRad(num('rot', 0));
    scene.add(rig.root);
    const st = newAnimState();
    rigs.push({ rig, name: model, st, mem: {} });
  });
  const pose = q.get('pose') ?? 'idle';
  // ?wounds=1[&woundAge=s]: one wound of each type on the first mob's front (gore shader check)
  if (q.has('wounds')) {
    const set = new WoundSet();
    const W: [WoundType, number, number, number, number, number, number, number][] = [
      ['blunt', -0.15, 1.05, -0.13, 0, 1, 0, 0.6], ['cut', 0.1, 1.25, -0.13, 1, -0.6, 0, 0.8],
      ['pierce', 0.12, 0.95, -0.13, 0, 1, 0, 0.6], ['burn', -0.12, 1.3, -0.13, 0, 1, 0, 0.7], ['blunt', 0, 1.65, -0.26, 0, 1, 0, 0.9],
    ];
    for (const [type, x, y, z, dx, dy, dz, severity] of W) set.add({ type, pos: { x, y, z }, dir: { x: dx, y: dy, z: dz }, severity, size: 0.5 });
    set.tick(num('woundAge', 3));
    const pos = Array.from({ length: 8 }, () => new THREE.Vector4()), dir = Array.from({ length: 8 }, () => new THREE.Vector4());
    const n = set.writeUniforms(pos, dir);
    for (const r of rigs) r.rig.setWounds(pos, dir, n);
  }
  const cam = new THREE.PerspectiveCamera(num('fov', 50), 16 / 9, 0.05, 500);
  const target = new THREE.Vector3(num('tx', 0), H + num('ty', 1.0), num('tz', 0));
  const yaw = THREE.MathUtils.degToRad(num('yaw', 0)), pitch = THREE.MathUtils.degToRad(num('pitch', -8));
  const dist = num('dist', Math.max(4.5, names.length * spacing * 0.9));
  // yaw 0 = viewing the mobs' faces (they face -Z)
  cam.position.set(target.x - Math.sin(yaw) * Math.cos(pitch) * dist, target.y - Math.sin(pitch) * dist, target.z - Math.cos(yaw) * Math.cos(pitch) * dist);
  cam.lookAt(target);
  const time = num('time', 3000);
  const angle = (time / 24000) * Math.PI * 2;
  const sunDir = new THREE.Vector3(Math.cos(angle) * 0.8, Math.sin(angle), -0.45).normalize();
  const frames = num('frames', 8);
  const t0 = performance.now();
  let rendered = 0;
  let animT = num('t', 0);
  let last = performance.now();
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    animT += q.has('t') ? 0 : dt;
    cm.update(0, 0);
    for (const r of rigs) {
      const st = r.st;
      st.time = animT;
      if (pose === 'walk' || pose === 'run') {
        const sp = pose === 'run' ? 5.6 : 2.4;
        st.speed = sp;
        st.limbAmount = Math.min(1, sp / 4.3);
        st.limbSwing = animT * sp * 1.6;
      }
      st.aggressive = pose === 'attack' || q.has('aggressive');
      st.attack = pose === 'attack' ? (animT * 2) % 1 : -1;
      st.headYaw = THREE.MathUtils.degToRad(num('headYaw', 0));
      st.headPitch = THREE.MathUtils.degToRad(num('headPitch', 0));
      for (const [k, v] of q) if (k.startsWith('st.')) st[k.slice(3)] = isNaN(Number(v)) ? v : Number(v);
      modelSpec(r.name).animate(r.rig, st, dt, r.mem);
      for (const m of r.rig.materials) setEntityLight(m, world.getLight(Math.floor(r.rig.root.position.x), H + 1, 0));
    }
    cam.updateMatrixWorld(true);
    ENTITY_SHARED.u_viewInvRot.value.setFromMatrix4(cam.matrixWorld);
    if (q.get('view')) renderer.debugView = q.get('view')!;
    renderer.render({
      camera: cam, time: (now - t0) / 1000, dt,
      sky: { sunDir, moonDir: sunDir.clone().negate(), moonPhase: 0, time: (now - t0) / 1000, rain: 0, thunder: 0, dimension: 'overworld', cameraPosition: cam.position, renderDistance: R * 16 },
      underwater: false, waterFogColor: new THREE.Color(0.02, 0.08, 0.12), wind: 0, nightVision: 0, damage: 0,
      gbufferScenes: [scene], shadowScenes: [scene],
    });
    const ready = pendingTextures() === 0 && cm.stats.mesh === 0 && world.dirtySections.size < 200;
    info.textContent = `tex pending ${pendingTextures()} draws ${renderer.stats.drawCalls} ${renderer.stats.frameMs.toFixed(1)}ms`;
    if (ready || performance.now() - t0 > 120000) rendered++;
    if (rendered >= frames) {
      (window as any).__shotReady = true;
      (window as any).__shotInfo = { draws: renderer.stats.drawCalls, ms: renderer.stats.frameMs, tris: renderer.stats.triangles };
      if (!q.has('live')) return;
    }
    requestAnimationFrame(loop);
  };
  loop();
}
main().catch((e) => {
  console.error(e);
  info.textContent = String(e?.stack ?? e);
});
