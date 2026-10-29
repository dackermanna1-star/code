// "Must not break" interaction checks for tests/idle.mjs (--checks): run in the same page after the
// idle phase, non-destructive ones first. Each check is { name, run(page) } → { ok, why?, details }.
// Page helpers: window.__idle (H), window.__sim (sim), window.__game (g) — see installHelpers in
// tests/idle.mjs.

/** Run `fn(sim, H, g, arg)` in the page. */
const inPage = (page, fn, arg) => page.evaluate(([src, a]) => (0, eval)(src)(window.__sim, window.__idle, window.__game, a), [fn.toString(), arg ?? null]);

export const CHECKS = [
  {
    name: "bin-quiet",
    group: "idle",
    async run(page) {
      const d = await inPage(page, (sim, H) => {
        const bin = H.asm("Pedal Bin");
        const isl = H.dyn(bin);
        const p0 = isl.map(H.pos);
        const e0 = sim.eventCount();
        sim.step(300);
        const imp = H.impactsOn(e0, isl.map((i) => i.id));
        const moved = Math.max(...isl.map((i, k) => H.dist(H.pos(i), p0[k])));
        return { islands: isl.length, awake: isl.filter(H.awake).length, impacts: imp.n, maxJ: imp.maxJ, movedMm: Math.round(moved * 10000) / 10 };
      });
      const ok = d.awake === 0 && d.impacts === 0 && d.movedMm < 1;
      return { ok, why: ok ? undefined : "pedal bin still restless", details: d };
    },
  },
  {
    name: "fan-spins",
    group: "idle",
    async run(page) {
      const d = await inPage(page, (sim, H) => {
        const fan = H.asm('Ceiling Fan 52"');
        const g = [...fan.groups.values()].find((x) => x.motorSpeed !== 0);
        const jc = g.constraints[0];
        const rotor = jc.moving;
        const w = () => {
          const v = rotor.body.getAngularVelocity();
          return Math.round(Math.hypot(v.x, v.y, v.z) * 100) / 100;
        };
        const w0 = w();
        sim.step(300);
        return { motorOn: g.motorOn, target: g.motorSpeed, w0, w1: w(), awake: H.awake(rotor) };
      });
      const ok = d.motorOn && d.w0 > 3 && d.w1 > 3 && d.awake;
      return { ok, why: ok ? undefined : "ceiling fan not spinning", details: d };
    },
  },
  {
    name: "no-sag",
    group: "idle",
    async run(page) {
      // jointed things must not sag or creep over time (laptop lid, desk lamp, office chair casters/seat)
      const d = await inPage(page, (sim, H) => {
        const J = H.ctx.destruction.joints;
        const names = ["Laptop", "Desk Lamp", "Office Chair", "Wardrobe", "Refrigerator"];
        const snap = () =>
          names.map((n) => {
            const a = H.asm(n);
            return {
              n,
              // hinge/slider coordinates (ball joints have none: a caster ball just rolls)
              coords: [...a.groups.values()].filter((g) => g.constraints.some((c) => c.kind !== "ball")).map((g) => J.coordinate(g)).filter((x) => x !== null),
              // COM heights of the pieces heavier than 1 kg: sag is vertical (node origins of rolling caster balls swing
              // around their centres; whole pieces of furniture may slide a little each time they wake — the desk under
              // the laptop and lamp creeps ~0.5 mm per wake on its plastic glides)
              pos: H.dyn(a).filter((i) => i.mass > 1).map((i) => ({ x: 0, y: H.com(i).y, z: 0 })),
            };
          });
        const s0 = snap();
        // woken again and again (as by footsteps or nearby hits): joints must hold their pose while awake too
        for (let k = 0; k < 10; k++) {
          for (const n of names) for (const i of H.dyn(H.asm(n))) H.ph.wake(i.body);
          sim.step(60);
        }
        const s1 = snap();
        return s0.map((a, k) => {
          const b = s1[k];
          const dc = Math.max(0, ...a.coords.map((c, i) => Math.abs(c - b.coords[i])));
          const dp = Math.max(0, ...a.pos.map((p, i) => H.dist(p, b.pos[i])));
          return { n: a.n, maxAngleDeg: Math.round(((dc * 180) / Math.PI) * 100) / 100, maxDropMm: Math.round(dp * 10000) / 10 };
        });
      });
      const bad = d.filter((x) => x.maxAngleDeg > 0.5 || x.maxDropMm > 1);
      return { ok: bad.length === 0, why: bad.length ? `sagging: ${bad.map((x) => x.n).join(", ")}` : undefined, details: d };
    },
  },
  {
    name: "bump-wakes",
    group: "idle",
    async run(page) {
      // walking into a sleeping dining chair moves it
      const d = await inPage(page, (sim, H) => {
        const chairs = H.asms("Dining Chair").map((a) => H.dyn(a)[0]);
        const chair = chairs.reduce((b, c) => (H.com(c).x < H.com(b).x ? c : b));
        const c = H.com(chair);
        const asleep0 = !H.awake(chair);
        const tp = sim.teleport({ x: c.x - 0.75, y: 1.65, z: c.z }, Math.PI / 2, 0.2, { strict: true });
        if (!tp.ok) return { error: `teleport blocked by ${tp.overlaps}` };
        sim.step(5);
        const p0 = H.pos(chair);
        H.keys(["KeyW"]);
        sim.step(40);
        H.keys([]);
        sim.step(20);
        return { asleepBefore: asleep0, movedMm: Math.round(H.dist(H.pos(chair), p0) * 10000) / 10 };
      });
      const ok = !d.error && d.asleepBefore && d.movedMm > 10;
      return { ok, why: ok ? undefined : d.error ?? "bumped chair did not move", details: d };
    },
  },
  {
    name: "door-use",
    group: "idle",
    async run(page) {
      // E on a latched interior door: opens, comes to rest open (and sleeps), E again closes and re-latches,
      // a push on the latched door does not open it
      const d = await inPage(page, (sim, H) => {
        const J = H.ctx.destruction.joints;
        const a = H.asm("Stud Wall (Bedroom 2 / Foyer)");
        const g = [...a.groups.values()].find((x) => x.kind === "hinge" && x.latch);
        const door = g.constraints[0].moving;
        const tp = sim.teleport({ x: 10.05, y: 1.65, z: 5.2 }, Math.PI, 0.1, { strict: true });
        if (!tp.ok) return { error: `teleport blocked by ${tp.overlaps}` };
        sim.step(5);
        const handle = () => {
          const w = H.dw.toWorldVec(door, g.latch.anchor);
          return new (H.ph.tv0.constructor)(w.x, w.y, w.z);
        };
        const eye = H.ctx.player.position;
        const out = { asleep0: !H.awake(door), latched0: J.latched(g), a0: J.coordinate(g) };
        out.use1 = H.ctx.destruction.use(door.body, handle(), eye);
        sim.step(90);
        out.aOpen = J.coordinate(g);
        sim.step(240);
        out.aRest = J.coordinate(g);
        out.asleepOpen = !H.awake(door);
        out.use2 = H.ctx.destruction.use(door.body, handle(), eye);
        let k = 0;
        for (; k < 300 && !(J.latched(g) && Math.abs(J.coordinate(g)) < 0.05); k += 10) sim.step(10);
        out.closeSteps = k;
        out.latched1 = J.latched(g);
        out.a1 = J.coordinate(g);
        sim.step(120);
        out.asleepClosed = !H.awake(door);
        // push the latched door (≈ a shove at the handle)
        const h = handle();
        const c = H.com(door);
        const n = { x: h.x - c.x, y: 0, z: h.z - c.z };
        // tangential push: horizontal, perpendicular to the door's plane (try both senses)
        const ax = { x: 0, y: 1, z: 0 };
        const t = { x: ax.y * n.z - ax.z * n.y, y: 0, z: ax.x * n.y - ax.y * n.x };
        const tl = Math.hypot(t.x, t.z) || 1;
        for (const s of [1, -1]) {
          door.body.applyImpulse(new (h.constructor)((s * 8 * t.x) / tl, 0, (s * 8 * t.z) / tl), h);
          sim.step(60);
        }
        out.aPushed = J.coordinate(g);
        out.latchedPushed = J.latched(g);
        for (const k2 of ["a0", "aOpen", "aRest", "a1", "aPushed"]) out[k2] = Math.round(out[k2] * 1000) / 1000;
        return out;
      });
      const ok = !d.error && d.use1 && Math.abs(d.aOpen) > 0.3 && Math.abs(d.aRest - d.aOpen) < 1.5 && d.asleepOpen && d.use2 && d.latched1 && Math.abs(d.a1) < 0.05 && d.latchedPushed && Math.abs(d.aPushed) < 0.05 && d.asleepClosed;
      return { ok, why: ok ? undefined : d.error ?? "door use/latch misbehaved", details: d };
    },
  },
  {
    name: "drawer-use",
    group: "idle",
    async run(page) {
      const d = await inPage(page, (sim, H) => {
        const J = H.ctx.destruction.joints;
        const a = H.asm("Kitchen Island");
        const g = [...a.groups.values()].find((x) => x.kind === "slider" && x.constraints.length);
        const drawer = g.constraints[0].moving;
        const c = H.com(drawer);
        const tp = sim.teleport({ x: c.x, y: 1.65, z: c.z - 0.9 }, 0, 0.5, { strict: true });
        const eye = H.ctx.player.position;
        const P = (p) => new (H.ph.tv0.constructor)(p.x, p.y, p.z);
        const out = { teleport: tp.ok, asleep0: !H.awake(drawer), s0: J.coordinate(g) };
        out.use1 = H.ctx.destruction.use(drawer.body, P(H.com(drawer)), eye);
        sim.step(60);
        out.sOpen = J.coordinate(g);
        sim.step(120);
        out.asleepOpen = !H.awake(drawer);
        out.use2 = H.ctx.destruction.use(drawer.body, P(H.com(drawer)), eye);
        sim.step(90);
        out.s1 = J.coordinate(g);
        sim.step(120);
        out.asleepClosed = !H.awake(drawer);
        for (const k of ["s0", "sOpen", "s1"]) out[k] = Math.round(out[k] * 1000) / 1000;
        return out;
      });
      const ok = d.use1 && Math.abs(d.sOpen) > 0.1 && d.asleepOpen && d.use2 && Math.abs(d.s1) < 0.03 && d.asleepClosed;
      return { ok, why: ok ? undefined : "drawer use misbehaved", details: d };
    },
  },
  {
    name: "door-rip",
    group: "idle",
    async run(page) {
      // a sustained hard pull on a (sleeping, latched) cabinet door tears it off its hinges
      const d = await inPage(page, (sim, H) => {
        const a = H.asms("Kitchen Wall Cabinet").find((x) => [...x.groups.values()].some((g) => g.kind === "hinge" && g.latch && g.constraints.length));
        const g = [...a.groups.values()].find((x) => x.kind === "hinge" && x.latch);
        const door = g.constraints[0].moving;
        const out = { asleep0: !H.awake(door), hinges0: g.bonds.filter((b) => b.alive).length };
        const e0 = sim.eventCount();
        const V = H.ph.tv0.constructor;
        // pull horizontally away from the wall plane at the door's centre (both senses alternate per second)
        let k = 0;
        for (; k < 600 && g.bonds.some((b) => b.alive); k++) {
          const c = H.com(door);
          const f = new V(0, 300, (Math.floor(k / 60) % 2 ? 1 : -1) * 1200);
          H.ctx.destruction.pull(door.body, new V(c.x, c.y, c.z), f, 1 / 60);
          door.body.applyForce(f.scale(0.2), new V(c.x, c.y, c.z));
          H.fixed(1);
        }
        out.steps = k;
        out.hinges1 = g.bonds.filter((b) => b.alive).length;
        out.constraints = g.constraints.length;
        out.events = H.evCount(e0);
        const y0 = H.com(door).y;
        sim.step(60);
        out.fellMm = Math.round((y0 - H.com(door).y) * 1000);
        return out;
      });
      const ok = d.hinges1 === 0 && d.constraints === 0;
      return { ok, why: ok ? undefined : "door not ripped off", details: d };
    },
  },
  {
    name: "strike-wakes",
    group: "idle",
    async run(page) {
      // a hammer blow on a sleeping mug breaks it; a mug thrown at a sleeping lamp moves it
      const d = await inPage(page, (sim, H) => {
        const mug = H.asms("Mug").find((a) => H.dyn(a).length && !H.awake(H.dyn(a)[0]));
        const out = { mug: mug ? mug.name + " #" + mug.id : null };
        if (!mug) return out;
        const c = H.com(H.dyn(mug)[0]);
        const tp = sim.teleport({ x: c.x, y: 1.65, z: c.z - 0.8 }, 0, 0.6);
        out.tp = tp.ok;
        const e0 = sim.eventCount();
        const r = sim.hit({ id: mug.id, tool: "hammer", power: 1, dir: { x: 0, y: -1, z: 0 } });
        out.energy = r.energy;
        sim.step(1);
        out.awakeAfter1 = H.dyn(mug).some(H.awake);
        sim.step(30);
        out.events = H.evCount(e0);
        // throw
        const lamp = H.asm("Ceramic Table Lamp");
        const li = H.dyn(lamp)[0];
        const lc = H.com(li);
        out.lampAsleep = !H.awake(li);
        sim.teleport({ x: lc.x - 1.8, y: 1.65, z: lc.z }, Math.PI / 2, 0.3);
        sim.step(3);
        const l0 = H.pos(li);
        const e1 = sim.eventCount();
        out.throw = sim.throwAt(lamp.id, 12, "mug");
        sim.step(40);
        out.lampMovedMm = Math.round(H.dist(H.pos(li), l0) * 10000) / 10;
        out.lampImpacts = H.impactsOn(e1, H.dyn(lamp).map((i) => i.id)).n;
        return out;
      });
      const ok = !!d.mug && d.awakeAfter1 && ((d.events.fracture ?? 0) > 0 || (d.events.bondBreak ?? 0) > 0) && d.lampAsleep && (d.lampMovedMm > 2 || d.lampImpacts > 0);
      return { ok, why: ok ? undefined : "strike/throw did not wake or break", details: d };
    },
  },
  {
    name: "rug-stand",
    group: "rug",
    async run(page) {
      // standing still on the rug for 5 s: neither the rug nor the glass coffee table on it moves
      const d = await inPage(page, (sim, H) => {
        const rug = H.dyn(H.asm("Area Rug"))[0];
        const table = H.dyn(H.asm("Glass Coffee Table"))[0];
        const tp = sim.teleport({ x: 5.75, y: 1.65, z: 2.35 }, Math.PI / 2, 0.2, { strict: true });
        if (!tp.ok) return { error: `teleport blocked by ${tp.overlaps}` };
        const r0 = H.pos(rug), t0 = H.pos(table);
        const e0 = sim.eventCount();
        sim.step(300);
        const ev = H.evCount(e0);
        const imp = H.impactsOn(e0, [rug.id, table.id]);
        return {
          rugMm: Math.round(H.dist(H.pos(rug), r0) * 10000) / 10,
          tableMm: Math.round(H.dist(H.pos(table), t0) * 10000) / 10,
          impacts: imp.n,
          maxJ: imp.maxJ,
          damage: ev.damage ?? 0,
          fracture: ev.fracture ?? 0,
          rugAwake: H.awake(rug),
          tableAwake: H.awake(table),
          player: sim.player().pos,
        };
      });
      const ok = !d.error && d.rugMm < 5 && d.tableMm < 1 && d.fracture === 0 && d.damage === 0 && d.maxJ < 0.5;
      return { ok, why: ok ? undefined : d.error ?? "rug or coffee table moved / impacts while standing still", details: d };
    },
  },
  {
    name: "rug-walk",
    group: "rug",
    async run(page) {
      // walking across the rug and back: at most a gentle nudge, the coffee table stays intact
      const d = await inPage(page, (sim, H) => {
        const rug = H.dyn(H.asm("Area Rug"))[0];
        const table = H.dyn(H.asm("Glass Coffee Table"))[0];
        const tp = sim.teleport({ x: 5.75, y: 1.65, z: 1.0 }, 0, 0.2, { strict: true });
        if (!tp.ok) return { error: `teleport blocked by ${tp.overlaps}` };
        sim.step(10);
        const r0 = H.pos(rug), t0 = H.pos(table);
        const e0 = sim.eventCount();
        H.keys(["KeyW"]);
        sim.step(36);
        H.keys([]);
        sim.step(30);
        const mid = sim.player().pos;
        H.keys(["KeyS"]);
        sim.step(36);
        H.keys([]);
        sim.step(60);
        const ev = H.evCount(e0);
        const impT = H.impactsOn(e0, [table.id]);
        const impR = H.impactsOn(e0, [rug.id]);
        sim.step(180);
        return {
          walkedTo: mid,
          back: sim.player().pos,
          rugMm: Math.round(H.dist(H.pos(rug), r0) * 10000) / 10,
          tableMm: Math.round(H.dist(H.pos(table), t0) * 10000) / 10,
          rugImpacts: impR.n,
          rugMaxJ: impR.maxJ,
          tableImpacts: impT.n,
          tableMaxJ: impT.maxJ,
          damage: ev.damage ?? 0,
          fracture: ev.fracture ?? 0,
          footsteps: ev.footstep ?? 0,
          rugAsleepAfter: !H.awake(rug),
          tableAsleepAfter: !H.awake(table),
        };
      });
      const ok = !d.error && d.walkedTo.z > 2.6 && d.rugMm < 30 && d.tableMm < 3 && d.fracture === 0 && d.tableMaxJ < 0.5 && d.rugAsleepAfter;
      return { ok, why: ok ? undefined : d.error ?? "walking on the rug dragged it / shook the coffee table", details: d };
    },
  },
  {
    name: "support-removed",
    group: "support",
    async run(page) {
      // remove a dynamic support (dining table) and a static one (wall wire shelf): everything on them falls
      const d = await inPage(page, (sim, H) => {
        const res = {};
        sim.step(120); // everything asleep first: the case Havok does not handle by itself
        for (const [name, kind] of [["Oak Dining Table", "dynamic"], ["Wall Wire Shelf", "static"]]) {
          const sup = H.asm(name);
          const isl = [...sup.islands];
          // items resting on it: dynamic islands whose COM lies over its footprint, above its bottom
          const box = { lo: { x: Infinity, y: Infinity, z: Infinity }, hi: { x: -Infinity, y: -Infinity, z: -Infinity } };
          for (const i of isl) {
            const b = i.bounds;
            for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
              const w = H.dw.toWorldVec(i, { x, y, z });
              for (const k of ["x", "y", "z"]) {
                box.lo[k] = Math.min(box.lo[k], w[k]);
                box.hi[k] = Math.max(box.hi[k], w[k]);
              }
            }
          }
          const items = [];
          for (const a of H.dw.assemblies.values())
            for (const i of a.islands) {
              if (!i.alive || i.isStatic || a === sup) continue;
              const c = H.com(i);
              if (c.x > box.lo.x && c.x < box.hi.x && c.z > box.lo.z && c.z < box.hi.z && c.y > box.lo.y + 0.1 && c.y < box.hi.y + 0.4) items.push({ a, i, y0: c.y, asleep: !H.awake(i) });
            }
          H.ctx.destruction.despawn(sup.id);
          sim.step(90);
          const floating = H.floating(items.map((x) => x.i));
          const drops = items.map((x) => Math.round((x.y0 - H.com(x.i).y) * 1000));
          res[kind] = { name, items: items.length, asleepBefore: items.filter((x) => x.asleep).length, minDropMm: Math.min(...drops), drops, floating };
        }
        return res;
      });
      const bad = Object.values(d).filter((r) => r.items === 0 || r.asleepBefore === 0 || r.minDropMm < 100 || r.floating.length);
      return { ok: bad.length === 0, why: bad.length ? `items did not fall: ${bad.map((r) => `${r.name} (min drop ${r.minDropMm} mm, floating ${r.floating.join(", ")})`).join("; ")}` : undefined, details: d };
    },
  },
  {
    name: "support-fracture",
    group: "support",
    async run(page) {
      // shatter the glass top of the coffee table: what stood on it falls, nothing floats
      const d = await inPage(page, (sim, H) => {
        const table = H.asm("Glass Coffee Table");
        const ti = H.dyn(table)[0];
        const tb = H.com(ti);
        const items = [];
        for (const a of H.dw.assemblies.values())
          for (const i of a.islands) {
            if (!i.alive || i.isStatic || a === table) continue;
            const c = H.com(i);
            if (Math.abs(c.x - tb.x) < 0.3 && Math.abs(c.z - tb.z) < 0.55 && c.y > 0.42 && c.y < 0.7) items.push({ a, i, y0: c.y, asleep: !H.awake(i) });
          }
        sim.teleport({ x: tb.x - 1.0, y: 1.65, z: tb.z }, Math.PI / 2, 0.5);
        sim.step(3);
        const e0 = sim.eventCount();
        // strike the glass top next to the items
        let r;
        for (let k = 0; k < 4; k++) {
          r = sim.hit({ point: { x: tb.x + 0.12, y: 0.44, z: tb.z + 0.35 - 0.1 * k }, tool: "hammer", power: 1, dir: { x: 0, y: -1, z: 0 } });
          sim.step(15);
        }
        sim.step(150);
        const floating = H.floating(items.map((x) => x.i));
        return {
          items: items.length,
          asleepBefore: items.filter((x) => x.asleep).length,
          events: H.evCount(e0),
          dropped: items.map((x) => ({ n: x.a.name, dy: Math.round((x.y0 - H.com(x.i).y) * 1000) })),
          floating,
        };
      });
      const fell = d.dropped.filter((x) => x.dy > 10).length;
      const ok = (d.events.fracture ?? 0) > 0 && d.floating.length === 0 && fell >= Math.ceil(d.items / 2);
      return { ok, why: ok ? undefined : `glass top: fracture ${d.events.fracture ?? 0}, fell ${fell}/${d.items}, floating ${d.floating.join(", ")}`, details: d };
    },
  },
];
