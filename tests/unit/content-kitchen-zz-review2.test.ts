import { test } from "node:test";
import { KITCHEN_OBJECTS as K } from "../../src/objects/kitchen/index.ts";
import { polyTransform } from "../../src/geom/poly.ts";
import { polyContact } from "../../src/objects/lib/contact.ts";
import { qaxisAngle, qrot, v3, vsub, vadd } from "../../src/geom/vec.ts";
test("door sweep", () => {
  for (const [type, doorKey, extra] of [["dishwasher", "door_", ["btn_", "display", "board_", "handle_"]], ["range", "door_", []]] as const) {
    const def = K[type]({ towel: false });
    const hinge = def.bonds.find((b) => b.kind === "hinge")!;
    const j: any = hinge.joint;
    const moving = new Set<string>();
    // flood fill from hinge.a over non-joint bonds
    const adj = new Map<string, string[]>();
    for (const b of def.bonds) { if (b.b === "world" || b.kind === "hinge" || b.kind === "slider" || b.kind === "latch") continue; (adj.get(b.a) ?? adj.set(b.a, []).get(b.a)!).push(b.b); (adj.get(b.b) ?? adj.set(b.b, []).get(b.b)!).push(b.a); }
    const st = [hinge.a]; while (st.length) { const n = st.pop()!; if (moving.has(n)) continue; moving.add(n); for (const m of adj.get(n) ?? []) st.push(m); }
    const piv = j.pivot; const ax = j.axis;
    console.log(type, "moving parts", moving.size, "axis", JSON.stringify(ax), "pivot", JSON.stringify(piv));
    for (const deg of [40, 50, 60, 70, 80, 88]) {
      const q = qaxisAngle(v3(ax.x, ax.y, ax.z), (deg * Math.PI) / 180);
      const p = vsub(v3(piv.x, piv.y, piv.z), qrot(q, v3(piv.x, piv.y, piv.z)));
      const hits: string[] = [];
      for (const a of def.parts) {
        if (!moving.has(a.name)) continue;
        const pa = polyTransform(a.poly, { p, q });
        for (const b of def.parts) {
          if (moving.has(b.name)) continue;
          const c = polyContact(pa, b.poly, 0.005);
          if (c && c.sep < 0.004) hits.push(`${a.name}x${b.name}(${(c.sep * 1000).toFixed(0)})`);
        }
      }
      console.log(type, deg, hits.slice(0, 30).join(" "));
    }
  }
});
