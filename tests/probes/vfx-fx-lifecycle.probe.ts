// Probe: VFX lifecycle and robustness — garbage inputs never throw or poison buffers with NaN,
// dt = 0 (pause) freezes particles and debris, quality changes resize the debris cap, emitter
// handles behave, and dispose() returns the scene to its baseline (no leaked meshes, materials,
// textures, particle systems or observers).
import { S } from "../../src/render/surfaces.ts";
import { makeFxScene, makeGroundProbe, makeVfx, renderUntil, gpuSync } from "./vfx-fx-util.ts";

export async function probe(): Promise<any> {
  const { engine, scene } = makeFxScene({});
  await renderUntil(scene, () => scene.isReady());
  const base = { meshes: scene.meshes.length, materials: scene.materials.length, textures: scene.textures.length, ps: scene.particleSystems.length, obsAfterParticles: scene.onAfterParticlesRenderingObservable.observers.length };
  const { vfx, settings } = makeVfx(scene, makeGroundProbe());
  const out: any = { base };
  out.ready = await renderUntil(scene, () => Object.values(vfx.fx.groups).every((g) => g.ps.isReady()));
  const errors: string[] = [];
  const tryIt = (name: string, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      errors.push(`${name}: ${String(e)}`);
    }
  };
  const N = NaN,
    I = Infinity;
  // ---- garbage inputs
  tryIt("burst NaN pos", () => vfx.burst("dust", { x: N, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 1));
  tryIt("burst NaN normal", () => vfx.burst("dust", { x: 0, y: 1, z: 0 }, { x: N, y: N, z: N }, 1));
  tryIt("burst zero normal", () => vfx.burst("sparks", { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, 1));
  tryIt("burst unknown kind", () => vfx.burst("bogus" as never, { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 1));
  tryIt("burst intensity NaN/Inf/neg", () => {
    vfx.burst("dust", { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, N);
    vfx.burst("dust", { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, I);
    vfx.burst("dust", { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, -3);
  });
  tryIt("burst bad tint/dir", () => vfx.burst("liquid", { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 1, { tint: N, dir: { x: N, y: 0, z: 0 } }));
  tryIt("emitter garbage", () => {
    const e = vfx.emitter("water", { x: N, y: N, z: N }, { x: 0, y: 0, z: 0 }, N);
    e.setPosition({ x: I, y: 0, z: 0 });
    e.setDirection({ x: 0, y: 0, z: 0 });
    e.setRate(-5);
    e.stop();
    e.stop();
  });
  tryIt("emitter unknown kind", () => vfx.emitter("bogus" as never, { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 1).stop());
  tryIt("micro garbage", () => {
    vfx.micro("glass", { x: N, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0.01, S.glass, 0xffffff);
    vfx.micro("glass", { x: 0, y: 1, z: 0 }, { x: N, y: I, z: 0 }, 0.01, -5, N);
    vfx.micro("wood", { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, N, 99999, 0xffffff);
    vfx.micro("none", { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, 0.01, 0, 0);
    vfx.micro("bogus" as never, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, 0.01, 0, 0);
    vfx.micro("metal", { x: 0, y: 1, z: 0 }, { x: 1e6, y: 0, z: 0 }, 5, S.steel_brushed, 0xffffff);
  });
  tryIt("decal garbage", () => {
    vfx.decal("impact", { x: 0, y: 0, z: 0 }, { x: N, y: 0, z: 0 }, 0.2);
    vfx.decal("scorch", { x: N, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 0.2);
    vfx.decal("puddle", { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, -1);
    vfx.decal("crack", { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, I);
  });
  tryIt("update garbage dt", () => {
    vfx.update(N);
    vfx.update(-1);
    vfx.update(I);
    vfx.fixedUpdate(N);
    vfx.fixedUpdate(-1);
    vfx.fixedUpdate(I);
  });
  // ---- valid activity
  for (let i = 0; i < 6; i++) vfx.burst(["dust", "sparks", "glassGlitter", "woodChips", "water", "feathers"][i] as never, { x: -1 + i * 0.4, y: 1, z: 1 }, { x: 0, y: 1, z: 0 }, 1.5);
  for (let i = 0; i < 300; i++) vfx.micro("ceramic", { x: 0, y: 1, z: 1 }, { x: Math.cos(i), y: 1, z: Math.sin(i) }, 0.01, S.ceramic_glaze, 0xffffff);
  const em = vfx.emitter("smoke", { x: 0, y: 0.5, z: 1 }, { x: 0, y: 1, z: 0 }, 1);
  for (let f = 0; f < 30; f++) {
    vfx.fixedUpdate(1 / 60);
    vfx.update(1 / 60);
    scene.render();
  }
  em.setPosition({ x: 0.5, y: 0.5, z: 1 });
  // ---- pause: dt = 0 freezes particles and debris
  const snap = () => vfx.fx.groups.puff.ps.particles.slice(0, 20).map((p) => p.position.x + p.position.y + p.position.z);
  const before = snap();
  const microBefore = vfx.sim.debugSlot(0).y;
  for (let f = 0; f < 10; f++) {
    vfx.update(0);
    scene.render();
  }
  const after = snap();
  out.pauseFrozen = before.length > 0 && before.every((v, i) => v === after[i]) && vfx.sim.debugSlot(0).y === microBefore;
  // ---- NaN scan over every particle and every debris instance
  let nanP = 0,
    nanM = 0;
  for (const g of Object.values(vfx.fx.groups)) for (const p of g.ps.particles) if (!Number.isFinite(p.position.x + p.position.y + p.position.z + p.size + p.color.a)) nanP++;
  for (const sb of vfx.sim.activeBins) for (let k = 0; k < sb.count * 16; k++) if (!Number.isFinite(sb.mat[k])) nanM++;
  out.nan = { particles: nanP, microFloats: nanM };
  out.errors = errors;
  out.counts = { particles: vfx.particleCount, micro: vfx.microCount, rejected: vfx.sim.rejected, decals: vfx.decals.count, emitters: vfx.fx.emitters.length };
  // ---- quality change resizes the debris cap
  settings.set("quality", "low");
  out.capLow = vfx.sim.capacity;
  settings.set("quality", "ultra");
  out.capUltra = vfx.sim.capacity;
  settings.set("quality", "high");
  // ---- dispose → back to baseline
  vfx.dispose();
  vfx.dispose(); // idempotent
  vfx.burst("dust", { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 1); // ignored after dispose
  vfx.update(1 / 60);
  scene.render();
  gpuSync(engine);
  await new Promise((r) => setTimeout(r, 10)); // Babylon unregisters observers on a deferred timeout
  out.afterDispose = { meshes: scene.meshes.length, materials: scene.materials.length, textures: scene.textures.length, ps: scene.particleSystems.length, obsAfterParticles: scene.onAfterParticlesRenderingObservable.observers.length };
  out.leakFree =
    out.afterDispose.meshes === base.meshes &&
    out.afterDispose.materials === base.materials &&
    out.afterDispose.textures === base.textures &&
    out.afterDispose.ps === base.ps &&
    out.afterDispose.obsAfterParticles === base.obsAfterParticles;
  return out;
}
