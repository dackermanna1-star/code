// Physics system: collision events → RawImpact (drop tests, restitution, dynamic targets, normals, noise filtering,
// Babylon-notifier fallback equivalence, structural changes inside handlers, mute).
import { Vector3, Quaternion, type PhysicsBody } from "@babylonjs/core";
import type { RawImpact } from "../../src/core/context.ts";
import { Layer } from "../../src/core/context.ts";
import { makeWorld, floor, body, staticBox, steps, check, r, v3, type World } from "./physics-sys-util.ts";

interface Logged {
  step: number;
  a: string;
  b: string;
  impulse: number;
  started: boolean;
  n: number[];
  p: number[];
  dirOk: boolean;
}

function logImpacts(w: World): Logged[] {
  const log: Logged[] = [];
  w.physics.onImpact((e: RawImpact) => {
    const pa = e.bodyA.transformNode.position, pb = e.bodyB.transformNode.position;
    // the normal must point from A towards B (compare with the centre-to-centre direction)
    const d = pb.subtract(pa);
    log.push({ step: w.physics.stepIndex, a: e.bodyA.transformNode.name, b: e.bodyB.transformNode.name, impulse: r(e.impulse, 4), started: e.started, n: v3(e.normal), p: v3(e.point), dirOk: Vector3.Dot(d, e.normal) > 0 });
  });
  return log;
}

function box(w: World, name: string, pos: Vector3, size: number, mass: number, opts: { restitution?: number; rot?: Quaternion; layer?: number } = {}): PhysicsBody {
  const density = mass / (size * size * size);
  return body(w, name, pos, "dynamic", w.physics.boxShape({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, { x: size, y: size, z: size }, { density, restitution: opts.restitution ?? 0, layer: opts.layer }), { rot: opts.rot });
}

function ball(w: World, name: string, pos: Vector3, radius: number, mass: number, restitution: number): PhysicsBody {
  const density = mass / ((4 / 3) * Math.PI * radius ** 3);
  return body(w, name, pos, "dynamic", w.physics.sphereShape({ x: 0, y: 0, z: 0 }, radius, { density, restitution }));
}

export async function probe() {
  const out: Record<string, unknown> = {};
  const g = 9.81;

  // ---- D1: 1 kg box dropped 1 m onto a static floor, e = 0 → one started impact ≈ m·v, normal A→B
  const d1 = async (externalObserver: boolean) => {
    const w = await makeWorld();
    floor(w).transformNode.name = "floor";
    const b = box(w, "box", new Vector3(0, 1.1, 0), 0.2, 1);
    let externalEvents = 0;
    if (externalObserver) w.physics.plugin.onCollisionObservable.add(() => externalEvents++);
    const log = logImpacts(w);
    steps(w, 150);
    w.dispose();
    return { log, externalEvents, mass: 1 };
  };
  {
    const { log } = await d1(false);
    const started = log.filter((l) => l.started);
    const v = Math.sqrt(2 * g * 1);
    const ok = started.length === 1 && log.length === 1 && Math.abs(started[0].impulse - v) / v < 0.1 && started[0].dirOk && Math.abs(Math.abs(started[0].n[1]) - 1) < 0.01 && Math.abs(started[0].p[1]) < 0.06;
    check(out, "D1_drop1kg_1m_static", ok, { expected_mv: r(v, 3), impacts: log });
    // ---- D5: same scene with an external Babylon collision observer → Babylon notifier path, same result
    const fb = await d1(true);
    const same = fb.log.length === log.length && fb.log.every((l, i) => Math.abs(l.impulse - log[i].impulse) < 1e-3 && l.started === log[i].started && l.step === log[i].step);
    check(out, "D5_babylonNotifierFallback_equivalent", same && fb.externalEvents > 0, { externalEvents: fb.externalEvents, impacts: fb.log });
  }

  // ---- D2: restitution 0.5 ball → first impact ≈ (1+e_eff)·m·v (rebound impulse merged), one started impact per bounce
  {
    const w = await makeWorld();
    floor(w).transformNode.name = "floor";
    const b = ball(w, "ball", new Vector3(0, 1.1, 0), 0.1, 1, 0.5);
    const log = logImpacts(w);
    let vDown = 0;
    let vUp = 0;
    let bounced = false;
    for (let i = 0; i < 240; i++) {
      w.physics.step(1 / 60);
      const vy = b.getLinearVelocity().y;
      if (!bounced) {
        if (vy < vDown) vDown = vy;
        if (vy > 0.05) bounced = true;
      }
      if (bounced && vUp === 0 && vy < b.getLinearVelocity().y + 1e-9) vUp = vy; // first post-bounce sample
    }
    const e = vUp / -vDown;
    const first = log.find((l) => l.started);
    const expected = (1 + e) * -vDown * 1;
    const ok = !!first && Math.abs(first.impulse - expected) / expected < 0.12 && first.dirOk;
    check(out, "D2_bounce_restitution", ok, { vDown: r(vDown, 3), vUp: r(vUp, 3), e_eff: r(e, 3), expected_1pe_mv: r(expected, 3), startedImpacts: log.filter((l) => l.started).length, impacts: log.slice(0, 6) });
    w.dispose();
  }

  // ---- D3: dynamic targets: 1 kg box onto a resting 5 kg box; head-on dynamic–dynamic in zero g
  {
    const w = await makeWorld();
    floor(w).transformNode.name = "floor";
    const big = box(w, "big", new Vector3(0, 0.2, 0), 0.4, 5);
    steps(w, 60); // settle (and sleep)
    const small = box(w, "small", new Vector3(0, 0.4 + 1.0 + 0.1, 0), 0.2, 1);
    const log = logImpacts(w);
    steps(w, 120);
    const pair = log.filter((l) => (l.a === "small" && l.b === "big") || (l.a === "big" && l.b === "small"));
    const startedPair = pair.filter((l) => l.started);
    const v = Math.sqrt(2 * g * 1);
    check(out, "D3a_onto_resting_dynamic", startedPair.length === 1 && Math.abs(startedPair[0].impulse - v) / v < 0.2 && startedPair[0].dirOk, { expected_mv: r(v, 3), pairImpacts: pair, otherImpacts: log.filter((l) => !pair.includes(l)) });
    w.dispose();
  }
  {
    const w = await makeWorld({ gravity: 0 });
    const a = box(w, "a", new Vector3(-1, 0, 0), 0.3, 2);
    const b = box(w, "b", new Vector3(1, 0, 0), 0.3, 2);
    a.setLinearVelocity(new Vector3(3, 0, 0));
    const log = logImpacts(w);
    steps(w, 60);
    const st = log.filter((l) => l.started);
    // e = 0: Δv_rel = 3 m/s, μ = 1 kg → J = 3 N·s
    check(out, "D3b_headOn_dynamic_dynamic", st.length === 1 && Math.abs(st[0].impulse - 3) < 0.3 && st[0].dirOk && Math.abs(Math.abs(st[0].n[0]) - 1) < 0.01, { impacts: log, vA: v3(a.getLinearVelocity()), vB: v3(b.getLinearVelocity()) });
    w.dispose();
  }

  // ---- D4: resting, sliding and heavy-spawned-in-contact bodies produce no impacts
  {
    const w = await makeWorld();
    floor(w).transformNode.name = "floor";
    const rest = box(w, "rest", new Vector3(-2, 0.1, 0), 0.2, 1);
    const crate = box(w, "crate", new Vector3(2, 0.25, 0), 0.5, 30); // spawned exactly in contact
    const slider = box(w, "slider", new Vector3(0, 0.1, -3), 0.2, 1);
    slider.setLinearVelocity(new Vector3(0, 0, 4));
    w.physics.setKeepAwake(rest, true); // keep producing resting CONTINUED events the whole time
    const log = logImpacts(w);
    steps(w, 180);
    check(out, "D4_noRestingSlidingSpawnNoise", log.length === 0, { impacts: log, sliderZ: r(slider.transformNode.position.z, 3), crateY: r(crate.transformNode.position.y, 3), events: w.physics.debugStats().eventsLastStep });
    w.dispose();
  }

  // ---- D6: dispose + create bodies inside onImpact handlers (fracture-like) — no errors, no misattribution
  {
    const w = await makeWorld();
    floor(w).transformNode.name = "floor";
    for (let i = 0; i < 20; i++) box(w, "victim" + i, new Vector3((i % 5) * 0.6 - 1.2, 1 + Math.floor(i / 5) * 0.3, 0), 0.2, 1);
    const dead = new Set<PhysicsBody>();
    let errors = 0;
    let deliveredDisposed = 0;
    let impactsOnDead = 0;
    let frags = 0;
    let fragImpacts = 0;
    w.physics.onImpact((e) => {
      try {
        for (const bd of [e.bodyA, e.bodyB]) {
          if (bd.isDisposed) deliveredDisposed++;
          if (dead.has(bd)) impactsOnDead++;
          if (bd.transformNode.name === "frag") fragImpacts++;
        }
        for (const bd of [e.bodyA, e.bodyB]) {
          if (!bd.transformNode.name.startsWith("victim") || bd.isDisposed) continue;
          const p = bd.transformNode.position.clone();
          dead.add(bd);
          w.physics.disposeBody(bd);
          bd.transformNode.dispose();
          // two fragments in its place: Havok reuses the freed body id immediately
          for (let k = 0; k < 2; k++) {
            const f = box(w, "frag", p.add(new Vector3(k * 0.12 - 0.06, 0.05, 0)), 0.1, 0.12);
            w.physics.muteImpacts(f, 4);
            frags++;
          }
        }
      } catch (err) {
        errors++;
        console.error(err);
      }
    });
    steps(w, 150);
    check(out, "D6_structuralChangesInsideHandlers", errors === 0 && deliveredDisposed === 0 && impactsOnDead === 0 && dead.size === 20 && frags === 40, {
      victimsReplaced: dead.size,
      errors,
      deliveredDisposed,
      impactsOnDead,
      fragImpacts,
      stats: { bodies: w.physics.stats().bodies, own: w.physics.debugStats().ownBodies, pairs: w.physics.debugStats().contactPairs },
    });
    w.dispose();
  }

  // ---- D7: 25 boxes from different heights → exactly one started impact each, impulse ≈ m·√(2gh)
  {
    const w = await makeWorld();
    floor(w).transformNode.name = "floor";
    const hs: number[] = [];
    for (let i = 0; i < 25; i++) {
      const h = 0.3 + (i % 5) * 0.4 + Math.floor(i / 5) * 0.07;
      hs.push(h);
      box(w, "b" + i, new Vector3((i % 5) * 0.8 - 1.6, h + 0.1, Math.floor(i / 5) * 0.8 - 1.6), 0.2, 1 + (i % 3));
    }
    const log = logImpacts(w);
    steps(w, 180);
    const errs: number[] = [];
    let okAll = true;
    for (let i = 0; i < 25; i++) {
      const mine = log.filter((l) => l.started && (l.a === "b" + i || l.b === "b" + i));
      const expected = (1 + (i % 3)) * Math.sqrt(2 * g * hs[i]);
      if (mine.length !== 1) okAll = false;
      else errs.push(r((mine[0].impulse - expected) / expected, 3));
    }
    const maxErr = Math.max(...errs.map(Math.abs));
    check(out, "D7_25drops_oneStartedEach", okAll && maxErr < 0.12, { maxRelErr: maxErr, relErrs: errs, totalImpacts: log.length });
    w.dispose();
  }

  // ---- D8: thrown sideways into a wall at 8 m/s (zero g): normal ±X; impulse = m·Δvx (flat hit: ≈ m·v; a corner
  //          hit converts part of the energy into spin, so its normal impulse is smaller — physically right)
  for (const tilted of [false, true]) {
    const w = await makeWorld({ gravity: 0 });
    staticBox(w, new Vector3(2, 0, 0), new Vector3(0.2, 3, 3)).transformNode.name = "wall";
    const b = box(w, "thrown", new Vector3(0, 0, 0), 0.2, 1.5, { rot: tilted ? Quaternion.RotationYawPitchRoll(0.3, 0.2, 0.1) : undefined });
    b.setLinearVelocity(new Vector3(8, 0, 0));
    const log = logImpacts(w);
    steps(w, 60);
    const st = log.filter((l) => l.started);
    const vxAfter = b.getLinearVelocity().x;
    const expected = 1.5 * (8 - vxAfter);
    const ok = st.length === 1 && Math.abs(st[0].impulse - expected) / expected < 0.1 && Math.abs(Math.abs(st[0].n[0]) - 1) < 0.05 && st[0].dirOk && (tilted || Math.abs(expected - 12) < 0.6);
    check(out, tilted ? "D8b_thrownIntoWall_cornerFirst" : "D8a_thrownIntoWall_flat", ok, { expected_mDvx: r(expected, 3), vxAfter: r(vxAfter, 3), spin: v3(b.getAngularVelocity()), impacts: log });
    w.dispose();
  }

  // ---- D9: mute — overlapping fragments spawned in contact are not reported while muted
  {
    const w = await makeWorld();
    floor(w).transformNode.name = "floor";
    const a = box(w, "fa", new Vector3(0, 0.5, 0), 0.2, 1);
    const b = box(w, "fb", new Vector3(0.12, 0.5, 0), 0.2, 1); // 8 cm interpenetration
    w.physics.muteImpacts(a, 20);
    w.physics.muteImpacts(b, 20);
    const log = logImpacts(w);
    steps(w, 18);
    const duringMute = log.length;
    steps(w, 60);
    check(out, "D9_mute", duringMute === 0, { duringMute, after: log.slice(0, 4) });
    w.dispose();
  }

  // ---- D10: debris shower: 150 small hull shards dropped onto a floor: one started impact per landing shard
  {
    const w = await makeWorld();
    floor(w).transformNode.name = "floor";
    const n = 150;
    for (let i = 0; i < n; i++) {
      const pts = new Float32Array([0.02, 0, 0, -0.015, 0.01, 0.01, 0, -0.012, 0.015, 0.005, 0.004, -0.02, -0.01, -0.008, -0.008]);
      const s = w.physics.hullShape(pts, { density: 2500, layer: Layer.DEBRIS });
      body(w, "shard", new Vector3((i % 15) * 0.15 - 1, 0.8 + Math.floor(i / 15) * 0.05, (i % 7) * 0.1), "dynamic", s, { rot: Quaternion.RotationYawPitchRoll(i, i * 0.3, i * 0.7) });
    }
    const log = logImpacts(w);
    let peakImpacts = 0;
    let peakEvents = 0;
    for (let i = 0; i < 150; i++) {
      w.physics.step(1 / 60);
      const s = w.physics.debugStats();
      peakImpacts = Math.max(peakImpacts, s.impactsLastStep);
      peakEvents = Math.max(peakEvents, s.eventsLastStep);
    }
    const shardFloorStarted = log.filter((l) => l.started && ((l.a === "shard" && l.b === "floor") || (l.a === "floor" && l.b === "shard"))).length;
    check(out, "D10_debrisShower", shardFloorStarted >= n * 0.9, { shardFloorStarted, totalImpacts: log.length, shardShard: log.filter((l) => l.a === "shard" && l.b === "shard").length, peakImpactsPerStep: peakImpacts, peakEventsPerStep: peakEvents });
    w.dispose();
  }
  return out;
}
