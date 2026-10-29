// Probe: regression checks for the reviewer findings (each result carries `ok`):
//  1. bits/sparks from a burst on a counter re-probe their ground and fall past the edge
//  2. decals are removed when their support goes away (drop/grab/fracture → deferred re-check)
//     and wall decals inside a broken-out region disappear
//  3. a wall fracture's dust patch sits on the room side of the wall line
//  4. extinguisher emitter created with the tools' 220 particles/s → strength 1, scales with setRate
//  5. overlapping dust patches merge (one patch, thicker) instead of stacking
//  6. a slow drip gathers water before a (small) wet spot appears
//  7. micro-debris either side of the living-room/bedroom-2 wall go into different zone meshes
import { makeFxScene, makeGroundProbe, makeVfx, renderUntil, stepFrames, type Box } from "./vfx-fx-util.ts";
import type { Particle } from "@babylonjs/core";
import type { ParticleProfile } from "../../src/vfx/profiles.ts";
import { MIN_PUDDLE_LITRES } from "../../src/vfx/decals.ts";
import { MICRO_KIND_INDEX } from "../../src/vfx/microSim.ts";

export async function probe(): Promise<any> {
  const W = 2.4;
  const { scene } = makeFxScene({ wallZ: W, cam: [2.2, 1.9, -1.8], target: [0, 0.6, 1.0] });
  const counter: Box = { min: [-0.6, 0, 0.5], max: [0.5, 0.9, 1.3] };
  const table: Box = { min: [1.2, 0, 0.4], max: [2.0, 0.75, 1.2] };
  const boxes: Box[] = [counter, table];
  const { vfx, events } = makeVfx(scene, makeGroundProbe(boxes));
  const out: any = {};
  await renderUntil(scene, () => scene.isReady() && vfx.fx.groups.bits.ps.isReady() && vfx.fx.groups.spark.ps.isReady());
  for (let i = 0; i < 3; i++) {
    stepFrames(vfx, scene, 1);
    await new Promise((r) => setTimeout(r, 0));
  }

  // 1. burst on the counter near its +x edge
  vfx.burst("splinters", { x: 0.4, y: 0.9, z: 0.9 }, { x: 0, y: 1, z: 0 }, 3, { dir: { x: 1, y: 0.6, z: 0 } });
  vfx.burst("sparks", { x: 0.4, y: 0.92, z: 0.9 }, { x: 0, y: 1, z: 0 }, 2, { dir: { x: 1, y: 0.4, z: 0 } });
  const scan = () => {
    let past = 0,
      hovering = 0,
      onFloor = 0;
    for (const id of ["bits", "spark"] as const) {
      for (const p of vfx.fx.groups[id].ps.particles as Particle[]) {
        const prof = p.metadata as ParticleProfile | null;
        if (!prof || prof.collide === 0) continue;
        if (p.position.x < 0.65) continue; // only particles clearly past the counter edge
        past++;
        // resting at the counter height although nothing is below (the old invisible plane)
        if (p.position.y > 0.88 && p.position.y < 0.97 && Math.abs(p.direction.y) < 0.05) hovering++;
        if (p.position.y < 0.15) onFloor++;
      }
    }
    return { past, hovering, onFloor };
  };
  let emitted = 0;
  stepFrames(vfx, scene, 50, () => {
    emitted = Math.max(emitted, vfx.fx.groups.bits.live + vfx.fx.groups.spark.live);
  });
  const s1 = scan();
  stepFrames(vfx, scene, 20);
  const s2 = scan();
  // control: the same bursts with re-probing disabled (the old behaviour) must show hovering
  stepFrames(vfx, scene, 90); // let the first bursts die
  const fxAny = vfx.fx as unknown as { reprobe: (x: number, y: number, z: number) => number };
  const reprobe = fxAny.reprobe;
  fxAny.reprobe = () => NaN;
  vfx.burst("splinters", { x: 0.4, y: 0.9, z: 0.9 }, { x: 0, y: 1, z: 0 }, 3, { dir: { x: 1, y: 0.6, z: 0 } });
  vfx.burst("sparks", { x: 0.4, y: 0.92, z: 0.9 }, { x: 0, y: 1, z: 0 }, 2, { dir: { x: 1, y: 0.4, z: 0 } });
  stepFrames(vfx, scene, 50);
  const control = scan();
  fxAny.reprobe = reprobe;
  out.counterBurst = {
    peakLive: emitted,
    at0_83s: s1,
    at1_17s: s2,
    controlWithoutReprobe: control,
    ok: s1.past > 5 && s1.hovering === 0 && s2.hovering === 0 && s2.onFloor > 0 && control.hovering > 3,
  };

  // 2. decals lose their support
  const d = vfx.decals;
  d.add("dust", 1.6, 0.75, 0.8, 0, 1, 0, 0.5, { tint: 0xdedbd3 });
  d.add("impact", 1.6, 0, 1.6, 0, 1, 0, 0.3); // floor mark nearby: must survive
  d.add("scorch", 0.3, 1.2, W, 0, 0, -1, 0.3); // wall mark in the breakout region
  d.add("crack", -1.4, 1.2, W, 0, 0, -1, 0.3); // wall mark far away: must survive
  const before = d.debugList().length;
  boxes.splice(boxes.indexOf(table), 1); // the table is carried away
  events.emit("grab", { pos: { x: 1.6, y: 0.5, z: 0.8 } } as never);
  events.emit("fracture", { pos: { x: 0.3, y: 1.25, z: W }, dir: { x: 0, y: 0, z: 1 }, mat: "gypsum", mode: "crumble", energy: 120, volume: 4e-4, pieces: 3, micro: 10, global: false, size: 1.2, assembly: "wall" });
  stepFrames(vfx, scene, 60);
  const after = d.debugList();
  const kinds = after.map((x) => x.kind);
  out.support = {
    before,
    after: after.map((x) => `${x.kind}@${x.x.toFixed(2)},${x.y.toFixed(2)},${x.z.toFixed(2)}`),
    ok: !after.some((x) => x.kind === "dust" && x.y > 0.5) && !kinds.includes("scorch") && kinds.includes("crack") && kinds.includes("impact"),
  };

  // 3. wall fracture dust patch on the room side (wall face at z = W, room at z < W)
  d.clear();
  events.emit("fracture", { pos: { x: -0.8, y: 1.0, z: W }, dir: { x: 0, y: 0, z: 1 }, mat: "gypsum", mode: "crumble", energy: 400, volume: 0.036, pieces: 8, micro: 40, global: true, size: 2.4, assembly: "wall" });
  const patch = d.debugList().find((x) => x.kind === "dust");
  out.wallPatch = { patch, ok: !!patch && patch.z + patch.r * 0.85 <= W + 1e-3 && patch.r <= 0.5 + 1e-6 };

  // 4. extinguisher emitter rate contract
  const em = vfx.emitter("extinguisher", { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 220) as unknown as { rate: number; setRate(r: number): void; stop(): void };
  const r0 = em.rate;
  em.setRate(44);
  const r1 = em.rate;
  em.stop();
  out.emitterRate = { at220: r0, at44: r1, ok: Math.abs(r0 - 1) < 1e-9 && Math.abs(r1 - 0.2) < 1e-9 };

  // 5. dust patches merge
  d.clear();
  for (let i = 0; i < 6; i++) d.add("dust", -0.5 + i * 0.03, 0, 0.2, 0, 1, 0, 0.8, { tint: 0xdedbd3 });
  const dusts = d.debugList().filter((x) => x.kind === "dust");
  out.dustMerge = { n: dusts.length, r: dusts[0]?.r, density: dusts[0]?.density, ok: dusts.length === 1 && dusts[0].density <= 1 && dusts[0].r > 0.4 && dusts[0].r <= 1.1 };

  // 6. slow drip
  d.clear();
  const drip = 0.0006 * 0.25; // FLOW.waterDrip × 0.25 s at strength 1
  d.water(1.0, 0, -0.5, drip, 0.3);
  const first = d.puddleCount;
  let feeds = 1;
  while (d.puddleCount === 0 && feeds < 1000) {
    d.water(1.0, 0, -0.5, drip, 0.3);
    feeds++;
  }
  const pud = d.debugList().find((x) => x.kind === "puddle");
  out.drip = { firstPuddles: first, secondsToWetSpot: feeds * 0.25, minLitres: +MIN_PUDDLE_LITRES.toFixed(5), r: pud?.r, ok: first === 0 && feeds * 0.25 > 5 && !!pud && pud.r < 0.05 };

  // 7. zones across the living / bedroom-2 wall (x = 9.2)
  const sp = { kind: MICRO_KIND_INDEX.wood, y: 0.5, z: 2, vx: 0, vy: 0, vz: 0, size: 0.01, r: 1, g: 1, b: 1, a: 1, s0: 0, s1: 0, s2: 0, s3: 0 };
  const binsBefore = vfx.sim.activeBins.length;
  vfx.sim.spawn({ ...sp, x: 9.0 });
  vfx.sim.spawn({ ...sp, x: 9.4 });
  const newBins = vfx.sim.activeBins.slice(binsBefore).map((b) => b.zone);
  out.zones = { newBins, ok: newBins.length === 2 && newBins[0] !== newBins[1] };

  stepFrames(vfx, scene, 2);
  out.allOk = Object.values(out).every((v: any) => v.ok);
  return out;
}
