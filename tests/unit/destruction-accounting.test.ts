import { test } from "node:test";
import assert from "node:assert/strict";
import { Accounting } from "../../src/destruction/runtime/accounting.ts";
import { mergeDents } from "../../src/destruction/runtime/polyUtil.ts";
import type { Assembly } from "../../src/destruction/runtime/types.ts";
import type { Dent } from "../../src/geom/meshgen.ts";
import { EventBus, type GameEvents } from "../../src/core/events.ts";
import type { World } from "../../src/destruction/runtime/world.ts";

function fakeAsm(o: Partial<Assembly>): Assembly {
  return { name: "Thing", type: "thing", value: 100, alive: true, initialVolume: 1, initialBonds: 10, brokenVolume: 0, brokenBonds: 0, dentVolume: 0, fraction: 0, reported: 0, ...o } as unknown as Assembly;
}

test("damage fraction combines broken volume, bonds and dents, clamped", () => {
  assert.equal(Accounting.fraction(fakeAsm({})), 0);
  assert.ok(Math.abs(Accounting.fraction(fakeAsm({ brokenVolume: 0.25 })) - 0.25) < 1e-12);
  assert.ok(Math.abs(Accounting.fraction(fakeAsm({ brokenBonds: 5 })) - 0.4) < 1e-12);
  assert.ok(Math.abs(Accounting.fraction(fakeAsm({ dentVolume: 0.05 })) - 0.1) < 1e-12);
  assert.equal(Accounting.fraction(fakeAsm({ brokenVolume: 3, brokenBonds: 10 })), 1);
  assert.equal(Accounting.fraction(fakeAsm({ initialVolume: 0, initialBonds: 0, brokenVolume: 1 })), 0);
  assert.equal(Accounting.fraction(fakeAsm({ brokenVolume: NaN })), 0);
});

test("accounting emits monotonic dollar deltas", () => {
  const events = new EventBus<GameEvents>();
  const got: number[] = [];
  events.on("damage", (e) => got.push(e.valueLost));
  const acc = new Accounting({ events } as unknown as World);
  const asm = fakeAsm({});
  acc.register(asm);
  assert.equal(acc.totalValue, 100);
  asm.brokenBonds = 1; // 0.08
  acc.markDirty(asm);
  acc.update();
  asm.brokenBonds = 1; // unchanged: nothing new
  acc.markDirty(asm);
  acc.update();
  asm.brokenVolume = 0.0005; // +0.0005: below the reporting step, accumulates
  acc.markDirty(asm);
  acc.update();
  asm.brokenVolume = 0.5;
  acc.markDirty(asm);
  acc.update();
  assert.equal(got.length, 2);
  assert.ok(Math.abs(got[0] - 8) < 1e-9);
  assert.ok(Math.abs(got[1] - 50) < 1e-9);
  assert.ok(Math.abs(acc.valueDestroyed - 58) < 1e-9);
  // fraction never decreases even if inputs would
  asm.brokenVolume = 0;
  acc.markDirty(asm);
  acc.update();
  assert.equal(got.length, 2);
  assert.ok(asm.fraction >= 0.58 - 1e-12);
});

test("mergeDents keeps at most max dents and preserves depth", () => {
  const dents: Dent[] = [];
  for (let i = 0; i < 10; i++) dents.push({ p: { x: i * 0.1, y: 0, z: 0 }, dir: { x: 0, y: -1, z: 0 }, r: 0.03, depth: 0.004 + i * 0.001 });
  const deepest = Math.max(...dents.map((d) => d.depth));
  mergeDents(dents, 4);
  assert.equal(dents.length, 4);
  assert.ok(Math.max(...dents.map((d) => d.depth)) >= deepest - 1e-12, "no dent gets shallower");
  for (const d of dents) {
    assert.ok(Number.isFinite(d.p.x) && Number.isFinite(d.r) && d.r > 0);
    assert.ok(Math.abs(Math.hypot(d.dir.x, d.dir.y, d.dir.z) - 1) < 1e-9);
  }
});
