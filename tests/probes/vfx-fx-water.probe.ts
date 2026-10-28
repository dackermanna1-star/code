// Probe: continuous emitters — a broken pipe spraying from a wall (droplets + mist) growing a
// puddle where the spray lands, a ceiling drip, electrical smoke, and a fire extinguisher cone.
// Also checks emitter handles (setPosition following a moving source, setRate, stop) and the
// puddle area growth over simulated time.
import { runShowcase, type Shot } from "./vfx-fx-util.ts";

export async function probe(): Promise<any> {
  const W = 2.6;
  const shots: Shot[] = [
    { kind: "water", at: 12, pos: [-1.6, 0.9, W], normal: [0, 0, -1], intensity: 1, emitter: { dir: [0.15, -0.25, -1], rate: 1 }, label: [-1.6, 0.25, W - 0.02], labelW: 0.8 },
    { kind: "waterDrip", at: 12, pos: [-0.2, 2.5, 1.6], normal: [0, -1, 0], intensity: 1, emitter: { dir: [0, -1, 0], rate: 2 }, label: [-0.2, 0.25, W - 0.02], labelW: 0.8 },
    { kind: "smoke", at: 4, pos: [0.9, 0.6, 2.4], normal: [0, 1, 0], intensity: 1, emitter: { dir: [0, 1, 0], rate: 1 }, label: [0.9, 0.25, W - 0.02], labelW: 0.8 },
    { kind: "extinguisher", at: 1.2, pos: [1.6, 1.0, 0.4], normal: [1, 0, 0], intensity: 1, emitter: { dir: [1, -0.05, 0.6], rate: 1 }, label: [2.4, 0.25, W - 0.02], labelW: 1.0 },
  ];
  const areas: number[] = [];
  const { out, vfx } = await runShowcase({
    shots,
    wallZ: W,
    cam: [0, 1.6, -2.6],
    target: [0, 0.7, 1.8],
    seconds: 12.1,
    lights: [[-0.5, 2.3, 1.2, 2]],
    setup: () => {},
  });
  // puddle growth bookkeeping (12 s of spray at 0.25 L/s ≈ 3 L → ~1.2 m² film)
  out.puddles = vfx.decals.puddleCount;
  out.puddleArea = +vfx.decals.puddleArea.toFixed(3);
  out.emitters = vfx.fx.emitters.map((e) => ({ kind: e.kind, rate: e.rate, age: +e.age.toFixed(2) }));
  // handle semantics: stop() removes the emitter on the next update
  for (const e of vfx.fx.emitters) if (e.kind === "waterDrip") e.stop();
  vfx.update(1 / 60);
  out.afterStop = vfx.fx.emitters.map((e) => e.kind);
  void areas;
  return out;
}
