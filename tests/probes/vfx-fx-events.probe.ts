// Probe: event reactions end-to-end in a dim room. Synthetic gameplay events go through the
// real EventBus (as destruction/player would emit them): glass pane shatter, drywall breakout,
// pine board snap, PCB crack, steel-on-concrete impact, sledgehammer hit on concrete, weld bond
// break, bulb pop, footsteps through glass debris. Records what each event spawned and the
// cost of a 300-event storm in one frame. Screenshot ~0.3 s after the events.
import type { GameEvents } from "../../src/core/events.ts";
import type { ImpactEv, FractureEv } from "../../src/core/events.ts";
import { S } from "../../src/render/surfaces.ts";
import { makeFxScene, makeGroundProbe, makeVfx, renderUntil, addPointLight, stats, gpuSync, tryWorldMaterial } from "./vfx-fx-util.ts";

export async function probe(): Promise<any> {
  const W = 2.4;
  const { engine, scene } = makeFxScene({ wallZ: W, cam: [0, 1.45, -1.9], target: [0, 0.9, 1.6], dark: true });
  addPointLight(scene, 0.2, 2.3, 0.6, 1.4);
  const wm = await tryWorldMaterial(scene);
  const { vfx, events } = makeVfx(scene, makeGroundProbe(), wm.material);
  const out: any = { worldMaterial: wm.info };
  out.ready = await renderUntil(scene, () => Object.values(vfx.fx.groups).every((g) => g.ps.isReady()) && scene.isReady());
  const v = (x: number, y: number, z: number) => ({ x, y, z });
  const frac = (o: Partial<FractureEv>): FractureEv => ({
    pos: v(0, 1, W), dir: v(0, 0, 1), mat: "gypsum", mode: "crumble", energy: 60, volume: 1.4e-4, pieces: 3, micro: 10, global: false, size: 0.3, assembly: "probe", ...o,
  });
  const imp = (o: Partial<ImpactEv>): ImpactEv => ({
    pos: v(0, 0, 1), normal: v(0, 1, 0), energy: 50, impulse: 10, speed: 6, matA: "steel", matB: "concrete", sizeA: 0.3, sizeB: 3, massA: 4, massB: Infinity, idA: 1, idB: -1, ...o,
  });
  const script: Array<[number, () => void, string]> = [
    [0.35, () => events.emit("fracture", frac({ pos: v(-1.3, 1.25, W), dir: v(0, 0, 1), mat: "glass", mode: "shatter", energy: 70, volume: 4.8e-3, global: true, size: 1.0 })), "glass pane shatter"],
    [0.35, () => { for (let i = 0; i < 160; i++) vfx.micro("glass", v(-1.3 + (Math.random() - 0.5) * 0.6, 1.0 + Math.random() * 0.5, W - 0.03), v((Math.random() - 0.5) * 1.5, Math.random() * 1.2, -Math.random() * 2.2), 0.006 + Math.random() * 0.016, S.glass, 0xffffff); }, "glass micro debris"],
    [1.0, () => events.emit("fracture", frac({ pos: v(-0.2, 1.0, W), dir: v(0, 0, 1) })), "drywall breakout (punch)"],
    [0.3, () => events.emit("fracture", frac({ pos: v(1.3, 0.75, 1.4), dir: v(0, -1, 0), mat: "softwood", mode: "splinter", energy: 300, volume: 6e-4, global: true, size: 1.2 })), "pine board snap"],
    [0.25, () => events.emit("fracture", frac({ pos: v(0.6, 0.9, 1.0), dir: v(0, 0, 1), mat: "pcb", mode: "crack", energy: 40, volume: 2e-5, size: 0.2 })), "pcb crack"],
    [0.12, () => events.emit("impact", imp({ pos: v(-0.6, 0.0, 1.0), energy: 80, speed: 9 })), "steel on concrete impact"],
    [0.1, () => events.emit("toolHit", { tool: "sledgehammer", pos: v(0.5, 1.4, W), normal: v(0, 0, -1), mat: "concrete", energy: 220, hard: true }), "sledge on concrete"],
    [0.2, () => events.emit("bondBreak", { pos: v(0.2, 0.5, 1.3), kind: "weld", matA: "steelSheet", matB: "steelSheet", energy: 70 }), "weld break"],
    [0.18, () => events.emit("feature", { kind: "lightBroken", pos: v(0.9, 2.2, 1.6) }), "bulb pop"],
    [0.05, () => { for (let i = 0; i < 4; i++) events.emit("footstep", { pos: v(-1.3, 0, 1.6 - i * 0.25), mat: "tile", speed: 3.6 }); }, "footsteps through glass"],
  ];
  const spawned: Record<string, { particles: number; micro: number }> = {};
  const FPS = 60;
  const total = Math.round(1.1 * FPS);
  for (let f = 0; f < total; f++) {
    const t = total - f;
    for (const [at, fn, name] of script) {
      if (Math.round(at * FPS) !== t) continue;
      const p0 = vfx.fx.queuedCount + vfx.fx.particleCount,
        m0 = vfx.microCount;
      fn();
      spawned[name] = { particles: vfx.fx.queuedCount + vfx.fx.particleCount - p0, micro: vfx.microCount - m0 };
    }
    engine.setHardwareScalingLevel(f >= total - 2 ? 1 : 4);
    vfx.fixedUpdate(1 / 60);
    vfx.update(1 / 60);
    scene.render();
    gpuSync(engine);
  }
  engine.setHardwareScalingLevel(1);
  out.spawned = spawned;
  out.stats = vfx.stats();
  // event storm: 300 mixed events in one frame → reaction cost + budget behaviour
  const storm: number[] = [];
  const before = vfx.fx.queuedCount + vfx.fx.particleCount;
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) {
    const x = -2 + (i % 20) * 0.2;
    const t1 = performance.now();
    events.emit("impact", imp({ pos: v(x, 0, 1.5), energy: 20 + i, matA: "hardwood", matB: "tile" }));
    events.emit("fracture", frac({ pos: v(x, 1.0, W) }));
    events.emit("toolHit", { tool: "hammer", pos: v(x, 1.2, W), normal: v(0, 0, -1), mat: "gypsum", energy: 70, hard: false });
    storm.push(performance.now() - t1);
  }
  out.storm = { totalMs: +(performance.now() - t0).toFixed(2), perTripleMs: stats(storm), particlesAdded: vfx.fx.queuedCount + vfx.fx.particleCount - before, budget: vfx.fx.budget };
  // one more frame to consume the storm (do not render at full res: keep the screenshot of the scripted scene)
  vfx.update(0);
  out.afterStorm = vfx.fx.stats;
  return out;
}
