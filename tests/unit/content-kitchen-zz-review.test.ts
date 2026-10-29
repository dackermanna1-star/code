// THROWAWAY review test
import { test } from "node:test";
import { kitchenLayout } from "../../src/world/furnish/kitchen.ts";
import { polyTransform } from "../../src/geom/poly.ts";
import { polyContact, aabbOf } from "../../src/objects/lib/contact.ts";

test("cross-module overlaps", async () => {
  const K = kitchenLayout().placements;
  const others: any[] = [];
  for (const [mod, fn] of [["living", "furnishLiving"], ["fixtures", "furnishFixtures"], ["utility", "furnishUtility"]]) {
    try {
      const m = await import(`../../src/world/furnish/${mod}.ts`);
      const f = m[fn] ?? Object.values(m).find((v: any) => typeof v === "function" && /^furnish/.test(v.name));
      const ps = (f as any)();
      for (const p of ps) others.push({ mod, ...p });
    } catch (e) { console.log("fail", mod, String(e).slice(0, 200)); }
  }
  const W = (p: any) => p.def.parts.map((q: any) => { const poly = polyTransform(q.poly, p.xf); return { n: q.name, poly, box: aabbOf(poly) }; });
  const ov = (a: any, b: any) => a.min.x < b.max.x && b.min.x < a.max.x && a.min.y < b.max.y && b.min.y < a.max.y && a.min.z < b.max.z && b.min.z < a.max.z;
  const kw = K.map(W);
  const bad: string[] = [];
  for (const o of others) {
    const ow = W(o);
    for (let i = 0; i < K.length; i++) for (const a of kw[i]) for (const b of ow) {
      if (!ov(a.box, b.box)) continue;
      const c = polyContact(a.poly, b.poly, 0);
      if (c && c.sep < -0.0003) bad.push(`${K[i].type}.${a.n} x ${o.mod}:${o.type}.${b.n} ${(c.sep*1000).toFixed(1)}mm`);
    }
  }
  console.log("others", others.length, "overlaps", bad.length, bad.slice(0, 20).join("\n"));
  // what's near the kitchen from other modules
  for (const o of others) { const p = o.xf.p; if (p.x > 3.9 && p.x < 9.3 && p.z > 4.6 && p.z < 8.9) console.log("near", o.mod, o.type, p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2)); }
});
