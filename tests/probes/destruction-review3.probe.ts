// Reviewer probe 3: timeline of a 0.3 m ceramic brick drop (fracture cascade analysis).
import { makeSim, floorDef, blockDef, round } from "./destruction-util.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";
import { qaxisAngle } from "../../src/geom/vec.ts";

const I = { x: 0, y: 0, z: 0, w: 1 };

export async function probe() {
  const sim = await makeSim();
  const { d } = sim;
  d.spawn(floorDef(16), { p: { x: 0, y: 0, z: 0 }, q: I });
  const h = Number((globalThis as any).DROP_H ?? 0.3);
  sim.log.length = 0;
  const t0 = sim.time.simTime;
  const id = d.spawn({ ...blockDef("ceramic", { x: 0.2, y: 0.06, z: 0.1 }, "brick"), startAsleep: false } as AssemblyDef, { p: { x: 0, y: h, z: 0 }, q: qaxisAngle({ x: 1, y: 0, z: 0.3 }, 0.4) });
  const a = d.assembly(id)!;
  const mass0 = [...a.islands][0].mass;
  sim.step(240);
  const tl = sim.log
    .filter((e) => e.type === "fracture" || (e.type === "impact" && (e.ev as any).energy > 0.3))
    .map((e) => {
      const x = e.ev as any;
      return e.type === "fracture"
        ? `${round(e.t - t0, 100)} FRACTURE E=${round(x.energy, 100)} global=${x.global} pieces=${x.pieces} micro=${x.micro} size=${round(x.size, 1000)}`
        : `${round(e.t - t0, 100)} impact E=${round(x.energy, 100)} J=${round(x.impulse, 100)} mA=${round(x.massA, 1000)} sizeA=${round(x.sizeA, 1000)} matB=${x.matB}`;
    });
  return { mass0, islands: a.islands.size, parts: a.parts.size, timeline: tl.slice(0, 80) };
}
