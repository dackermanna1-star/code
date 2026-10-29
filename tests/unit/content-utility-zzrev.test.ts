import { test } from "node:test";
import { polyVolume } from "../../src/geom/poly.ts";
import { MATERIALS } from "../../src/destruction/model/materials.ts";
import { BATH_OBJECTS } from "../../src/objects/bath/index.ts";
import { UTILITY_OBJECTS } from "../../src/objects/utility/index.ts";
test("dump", () => {
  const ALL: any = { ...BATH_OBJECTS, ...UTILITY_OBJECTS };
  for (const [k, f] of Object.entries(ALL) as any) {
    const d = f();
    const m = d.parts.reduce((s: number, p: any) => s + (p.mass ?? polyVolume(p.poly) * MATERIALS[p.mat].density), 0);
    const feats = (d.features ?? []).map((x: any) => x.type + (x.litres ? `(${x.litres}l)` : "") + "@" + x.part).join(",");
    const kinds: any = {}; for (const b of d.bonds) kinds[b.kind + (b.b === "world" ? "W" : "")] = (kinds[b.kind + (b.b === "world" ? "W" : "")] ?? 0) + 1;
    const mats: any = {}; for (const p of d.parts) mats[p.mat] = (mats[p.mat] ?? 0) + 1;
    console.log(k, d.parts.length, m.toFixed(2), JSON.stringify(kinds), JSON.stringify(mats), feats);
  }
});
