// Physics system: container hull bodies (mass/COM from densities, rebuild after removing children), raycast childIndex,
// raycastAll, sphere sweeps, layer filtering (DEBRIS vs PLAYER), live setLayer, small-box→hull, hull robustness and cost,
// startAsleep, min-mass clamp, motion switches, shape ownership on disposal.
import { Vector3, Quaternion, PhysicsShapeType, type PhysicsShape } from "@babylonjs/core";
import { Layer } from "../../src/core/context.ts";
import { makeWorld, floor, body, node, dynBox, steps, check, counts, randomPoints, r, v3 } from "./physics-sys-util.ts";

const ZERO = { x: 0, y: 0, z: 0 };
const IDQ = { x: 0, y: 0, z: 0, w: 1 };

function boxPoints(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): Float32Array {
  const p: number[] = [];
  for (const ix of [-0.5, 0.5]) for (const iy of [-0.5, 0.5]) for (const iz of [-0.5, 0.5]) p.push(cx + ix * sx, cy + iy * sy, cz + iz * sz);
  return new Float32Array(p);
}

export async function probe() {
  const out: Record<string, unknown> = {};

  // ---- S1/S2/S3: container of distinct leaf shapes on a (rotated, translated) static body
  {
    const w = await makeWorld({ gravity: 0 });
    const P = w.physics;
    const A = P.boxShape({ x: -0.3, y: 0, z: 0 }, IDQ, { x: 0.2, y: 0.2, z: 0.2 }, { density: 2500 }); // 20 kg
    const B = P.hullShape(boxPoints(0.2, 0, 0, 0.3, 0.1, 0.2), { density: 700 }); // 4.2 kg
    const C = P.sphereShape({ x: 0, y: 0.25, z: 0 }, 0.1, { density: 1000 }); // 4.18879 kg
    const D = P.boxShape({ x: 0, y: -0.2, z: 0.3 }, IDQ, { x: 0.15, y: 0.15, z: 0.15 }, { density: 1000 }); // 3.375 kg
    const cont = P.containerShape([A, B, C, D]);
    const bodyRot = Quaternion.RotationYawPitchRoll(0.7, 0, 0);
    const b = body(w, "compound", new Vector3(3, 1, -2), "dynamic", cont, { rot: bodyRot });
    const mExp = 20 + 4.2 + (4 / 3) * Math.PI * 0.001 * 1000 + 3.375;
    const comExp = new Vector3(20 * -0.3 + 4.2 * 0.2, (4 / 3) * Math.PI * 0.001 * 1000 * 0.25 + 3.375 * -0.2, 3.375 * 0.3).scale(1 / mExp);
    const mp = b.getMassProperties();
    check(out, "S1_containerMassCOMFromDensities", Math.abs(P.massOf(b) - mExp) / mExp < 0.01 && Vector3.Distance(mp.centerOfMass!, comExp) < 0.005, { mass: r(P.massOf(b), 3), expected: r(mExp, 3), com: v3(mp.centerOfMass!, 4), comExpected: v3(comExp, 4) });

    // raycast childIndex: rays straight down through each child's world centre
    const toWorld = (lx: number, ly: number, lz: number) => new Vector3(lx, ly, lz).applyRotationQuaternion(bodyRot).add(new Vector3(3, 1, -2));
    const centres = [toWorld(-0.3, 0, 0), toWorld(0.2, 0, 0), toWorld(0, 0.25, 0), toWorld(0, -0.2, 0.3)];
    const idx = centres.map((c) => P.raycast(c.add(new Vector3(0, 2, 0)), c.add(new Vector3(0, -2, 0)))?.childIndex ?? -99);
    // raycastAll horizontally through A and B (both on the body's local x axis)
    const dirX = new Vector3(1, 0, 0).applyRotationQuaternion(bodyRot);
    const origin = new Vector3(3, 1, -2);
    const all = P.raycastAll(origin.subtract(dirX.scale(2)), origin.add(dirX.scale(2)));
    check(out, "S3_raycastChildIndex", idx.join(",") === "0,1,2,3" && all.length === 2 && all[0].childIndex === 0 && all[1].childIndex === 1 && all[0].distance < all[1].distance, {
      childIndexPerChild: idx,
      raycastAll: all.map((h) => ({ child: h.childIndex, d: r(h.distance, 3) })),
    });

    // S2a: rebuild WITHOUT child B through a new container (old container is disposed, children survive)
    const before = counts(w);
    const cont2 = P.containerShape([A, C, D]);
    P.setShape(b, cont2);
    const oldDisposed = cont._pluginData === undefined;
    const rayB = P.raycast(centres[1].add(new Vector3(0, 2, 0)), centres[1].add(new Vector3(0, -2, 0)));
    const m2 = P.massOf(b);
    const idxAfter = [0, 2, 3].map((i) => P.raycast(centres[i].add(new Vector3(0, 2, 0)), centres[i].add(new Vector3(0, -2, 0)))?.childIndex ?? -99);
    const afterSwap = counts(w);
    // S2b: in-place removal of C (index 1 in [A, C, D])
    const removed = P.removeChildren(b, [1]);
    const m3 = P.massOf(b);
    const rayC = P.raycast(centres[2].add(new Vector3(0, 2, 0)), centres[2].add(new Vector3(0, -2, 0)));
    const idxD = P.raycast(centres[3].add(new Vector3(0, 2, 0)), centres[3].add(new Vector3(0, -2, 0)))?.childIndex;
    check(out, "S2_rebuildAfterRemovingChildren", oldDisposed && rayB === null && Math.abs(m2 - (mExp - 4.2)) < 0.05 && idxAfter.join(",") === "0,1,2" && removed.length === 1 && removed[0] === C && rayC === null && Math.abs(m3 - (20 + 3.375)) < 0.05 && idxD === 1 && afterSwap.hkShapes === before.hkShapes, {
      oldContainerDisposed: oldDisposed,
      rayThroughRemovedB: rayB ? "HIT" : "miss",
      massAfterB: r(m2, 3),
      childIndexAfterB: idxAfter,
      massAfterC: r(m3, 3),
      rayThroughRemovedC: rayC ? "HIT" : "miss",
      childIndexD: idxD,
      hkShapes: { before: before.hkShapes, afterSwap: afterSwap.hkShapes },
    });
    // single-child container → childIndex 0; leaf → −1
    const single = body(w, "single", new Vector3(-3, 0, 0), "static", P.containerShape([P.boxShape(ZERO, IDQ, { x: 0.5, y: 0.5, z: 0.5 })]));
    const leaf = body(w, "leaf", new Vector3(-5, 0, 0), "static", P.boxShape(ZERO, IDQ, { x: 0.5, y: 0.5, z: 0.5 }));
    const hs = P.raycast(new Vector3(-3, 2, 0), new Vector3(-3, -2, 0));
    const hl = P.raycast(new Vector3(-5, 2, 0), new Vector3(-5, -2, 0));
    check(out, "S3b_singleChildAndLeaf", hs?.body === single && hs.childIndex === 0 && hl?.body === leaf && hl.childIndex === -1, { single: hs?.childIndex, leaf: hl?.childIndex });
    w.dispose();
  }

  // ---- S4: sphere sweep hit point / normal / fraction; raycast normal/distance; ignore + layer masks
  {
    const w = await makeWorld({ gravity: 0 });
    const P = w.physics;
    const wall = body(w, "wall", new Vector3(5, 0, 0), "static", P.boxShape(ZERO, IDQ, { x: 1, y: 1, z: 1 }, { layer: Layer.STATIC }));
    const s = P.sphereSweep(new Vector3(0, 0.2, 0), new Vector3(10, 0.2, 0), 0.1);
    const ray = P.raycast(new Vector3(0, 0.2, 0.1), new Vector3(10, 0.2, 0.1));
    const ignored = P.sphereSweep(new Vector3(0, 0.2, 0), new Vector3(10, 0.2, 0), 0.1, undefined, wall);
    const masked = P.sphereSweep(new Vector3(0, 0.2, 0), new Vector3(10, 0.2, 0), 0.1, Layer.DEBRIS | Layer.DYNAMIC);
    const ok = !!s && Math.abs(s.fraction - 0.44) < 0.003 && Vector3.Distance(s.point, new Vector3(4.5, 0.2, 0)) < 0.01 && Math.abs(s.normal.x + 1) < 1e-3 && Math.abs(s.distance - 4.4) < 0.03 &&
      !!ray && Math.abs(ray.distance - 4.5) < 1e-3 && Math.abs(ray.normal.x + 1) < 1e-3 && ignored === null && masked === null;
    check(out, "S4_sphereSweepAndRaycast", ok, {
      sweep: s && { point: v3(s.point), normal: v3(s.normal), fraction: r(s.fraction, 4), distance: r(s.distance, 4) },
      ray: ray && { point: v3(ray.point), normal: v3(ray.normal), distance: r(ray.distance, 4) },
      ignored: ignored ? "HIT" : null,
      masked: masked ? "HIT" : null,
    });
    w.dispose();
  }

  // ---- S5: layers — DEBRIS / HELD fall through the PLAYER, DYNAMIC lands on it; raycast layer filter
  {
    const w = await makeWorld();
    const P = w.physics;
    floor(w);
    const player = body(w, "player", new Vector3(0, 0.9, 0), "animated", P.boxShape(ZERO, IDQ, { x: 0.6, y: 1.8, z: 0.6 }, { layer: Layer.PLAYER }));
    const debris = dynBox(w, new Vector3(0, 3, 0), new Vector3(0.1, 0.1, 0.1), 600, { layer: Layer.DEBRIS });
    const held = dynBox(w, new Vector3(0.1, 4, 0), new Vector3(0.15, 0.15, 0.15), 600, { layer: Layer.HELD });
    const dyn = dynBox(w, new Vector3(-0.1, 5, 0), new Vector3(0.2, 0.2, 0.2), 600, { layer: Layer.DYNAMIC });
    steps(w, 180);
    const rayStatic = P.raycast(new Vector3(0, 6, 0), new Vector3(0, -1, 0), Layer.STATIC);
    const rayAll = P.raycast(new Vector3(0, 6, 0), new Vector3(0, -1, 0));
    check(out, "S5_layerFiltering", debris.transformNode.position.y < 0.1 && held.transformNode.position.y < 0.1 && dyn.transformNode.position.y > 1.85 && rayStatic?.body !== player && Math.abs((rayStatic?.point.y ?? 9) - 0) < 1e-3 && !!rayAll, {
      debrisY: r(debris.transformNode.position.y, 3),
      heldY: r(held.transformNode.position.y, 3),
      dynamicY: r(dyn.transformNode.position.y, 3),
      rayStaticHitY: rayStatic && r(rayStatic.point.y, 3),
      rayAllHit: rayAll?.body.transformNode.name,
    });
    w.dispose();
  }

  // ---- S6: setLayer applies immediately (root leaf & container), keeps sleep state, HELD keeps awake
  {
    const w = await makeWorld();
    const P = w.physics;
    floor(w);
    const awakeBox = dynBox(w, new Vector3(-2, 0.1, 0), new Vector3(0.2, 0.2, 0.2), 500);
    const sleepyBox = dynBox(w, new Vector3(0, 0.1, 0), new Vector3(0.2, 0.2, 0.2), 500);
    const kids = [P.boxShape({ x: -0.1, y: 0, z: 0 }, IDQ, { x: 0.2, y: 0.2, z: 0.2 }, { density: 500 }), P.boxShape({ x: 0.1, y: 0, z: 0 }, IDQ, { x: 0.2, y: 0.2, z: 0.2 }, { density: 500 })];
    const compound = body(w, "compound", new Vector3(2, 0.1, 0), "dynamic", P.containerShape(kids));
    steps(w, 120); // all asleep
    const sleptBefore = [awakeBox, sleepyBox, compound].map((b) => !P.isAwake(b));
    P.wake(awakeBox);
    P.wake(compound);
    const noStatic = Layer.DYNAMIC | Layer.DEBRIS;
    P.setLayer(awakeBox.shape!, Layer.DEBRIS, noStatic);
    P.setLayer(sleepyBox.shape!, Layer.DEBRIS, noStatic);
    P.setLayer(compound.shape!, Layer.DEBRIS, noStatic);
    const sleepyStillAsleep = !P.isAwake(sleepyBox);
    steps(w, 30);
    const y1 = [awakeBox, sleepyBox, compound].map((b) => r(b.transformNode.position.y, 3));
    P.wake(sleepyBox);
    steps(w, 30);
    const kidLayer = P.layerOf(kids[1]);
    // HELD: never sleeps while held
    const heldBox = dynBox(w, new Vector3(5, 0.1, 0), new Vector3(0.2, 0.2, 0.2), 500);
    P.setLayer(heldBox.shape!, Layer.HELD);
    steps(w, 200);
    const heldAwake = P.isAwake(heldBox);
    P.setLayer(heldBox.shape!, Layer.DYNAMIC);
    steps(w, 200);
    const releasedSleeps = !P.isAwake(heldBox);
    check(out, "S6_setLayerLive", sleptBefore.every(Boolean) && y1[0] < 0 && y1[2] < 0 && y1[1] > 0.09 && sleepyStillAsleep && sleepyBox.transformNode.position.y < 0 && kidLayer.layer === Layer.DEBRIS && heldAwake && releasedSleeps, {
      sleptBefore,
      yAfter30_awake_sleepy_compound: y1,
      sleepyStillAsleepAfterSetLayer: sleepyStillAsleep,
      sleepyYAfterWake: r(sleepyBox.transformNode.position.y, 3),
      childLayer: kidLayer,
      heldAwakeAfter200: heldAwake,
      releasedSleeps,
    });
    w.dispose();
  }

  // ---- S7: small boxes become hulls and do not tunnel; thin large plates stay boxes
  {
    const w = await makeWorld();
    const P = w.physics;
    floor(w);
    const cases: Array<[string, Vector3]> = [
      ["cube2cm", new Vector3(0.02, 0.02, 0.02)],
      ["cube3cm", new Vector3(0.03, 0.03, 0.03)],
      ["stick2x2x30", new Vector3(0.02, 0.3, 0.02)],
      ["pane30x30x0.4", new Vector3(0.3, 0.004, 0.3)],
      ["sliver4x0.4x2", new Vector3(0.04, 0.004, 0.02)],
    ];
    const res: Record<string, unknown> = {};
    let ok = true;
    for (let k = 0; k < cases.length; k++) {
      const [name, size] = cases[k];
      let fell = 0;
      let type = -1;
      for (let t = 0; t < 8; t++) {
        const s = P.boxShape(ZERO, IDQ, size, { density: 2500 });
        type = s.type as number;
        body(w, name, new Vector3(t * 0.8 - 3, 1, k * 0.8 - 2), "dynamic", s, { rot: Quaternion.RotationYawPitchRoll(t * 0.7 + 0.2, t * 1.3 + 0.3, t * 0.4 + 0.1) });
      }
      steps(w, 90);
      for (const n of w.scene.transformNodes) if (n.name === name && n.position.y < -0.02) fell++;
      const expectHull = name !== "pane30x30x0.4";
      res[name] = { shapeType: type === PhysicsShapeType.CONVEX_HULL ? "hull" : type === PhysicsShapeType.BOX ? "box" : type, fellThrough: fell };
      if (fell > 0 || (type === PhysicsShapeType.CONVEX_HULL) !== expectHull) ok = false;
    }
    check(out, "S7_smallBoxesAsHulls_noTunnelling", ok, res);
    w.dispose();
  }

  // ---- S8: hull robustness (degenerate, NaN) and creation cost
  {
    const w = await makeWorld();
    const P = w.physics;
    floor(w);
    const degenerate: Record<string, unknown> = {};
    const inputs: Record<string, number[]> = {
      onePoint: [0, 0, 0],
      twoPoints: [0, 0, 0, 0.1, 0, 0],
      coplanar4: [0, 0, 0, 0.2, 0, 0, 0, 0, 0.2, 0.2, 0, 0.2],
      duplicates: [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, -0.05, -0.05, -0.05, 0.05, -0.05, 0.05],
    };
    let k = 0;
    for (const [name, pts] of Object.entries(inputs)) {
      const s = P.hullShape(pts, { density: 1000 });
      const b = body(w, name, new Vector3(k++ * 0.5, 0.5, 3), "dynamic", s);
      steps(w, 60);
      const y = b.transformNode.position.y;
      degenerate[name] = { y: r(y, 3), mass: r(P.massOf(b), 4), finite: Number.isFinite(y) };
    }
    let nanThrows = false;
    try {
      P.hullShape([0, 0, 0, NaN, 1, 1, 0, 1, 0, 1, 1, 1]);
    } catch {
      nanThrows = true;
    }
    let badLenThrows = false;
    try {
      P.hullShape([0, 0, 0, 1]);
    } catch {
      badLenThrows = true;
    }
    const bench: Record<string, number> = {};
    for (const n of [8, 20, 30, 60]) {
      const made: PhysicsShape[] = [];
      for (let i = 0; i < 10; i++) made.push(P.hullShape(randomPoints(i + 1, n, 0.2))); // warm-up
      const t0 = performance.now();
      for (let i = 0; i < 200; i++) made.push(P.hullShape(randomPoints(i + 100, n, 0.2)));
      bench[`pts${n}_msPerHull`] = r((performance.now() - t0) / 200, 4);
      for (const s of made) P.disposeShape(s);
    }
    const allFinite = Object.values(degenerate).every((d) => (d as { finite: boolean }).finite);
    check(out, "S8_hullRobustnessAndCost", allFinite && nanThrows && badLenThrows, { degenerate, nanThrows, badLenThrows, bench });
    w.dispose();
  }

  // ---- S9: startAsleep bodies stay asleep through their first setShape (hover), wake on demand
  {
    const w = await makeWorld();
    const P = w.physics;
    floor(w);
    const b = w.physics.createBody(node(w, "sleeper", new Vector3(0, 2, 0)), "dynamic", true);
    P.setShape(b, P.boxShape(ZERO, IDQ, { x: 0.3, y: 0.3, z: 0.3 }, { density: 500 }));
    const asleep0 = !P.isAwake(b);
    steps(w, 60);
    const hover = b.transformNode.position.y;
    P.wake(b);
    steps(w, 60);
    check(out, "S9_startAsleep", asleep0 && hover === 2 && b.transformNode.position.y < 0.2, { asleepAfterShape: asleep0, yAfter60Asleep: hover, yAfterWake: r(b.transformNode.position.y, 3) });
    w.dispose();
  }

  // ---- S10: min-mass clamp for tiny shards; released when the shape grows; S11: motion switches
  {
    const w = await makeWorld();
    const P = w.physics;
    floor(w);
    const tiny = P.hullShape(boxPoints(0, 0, 0, 0.005, 0.005, 0.005), { density: 1000 }); // 1.25e-4 kg
    const b = body(w, "tiny", new Vector3(0, 1, 0), "dynamic", tiny);
    const clamped = P.massOf(b);
    const big = P.hullShape(boxPoints(0, 0, 0, 0.2, 0.2, 0.2), { density: 1000 }); // 8 kg
    P.setShape(b, big);
    const grown = P.massOf(b);
    steps(w, 60);
    // static → dynamic → static → animated
    const s = body(w, "flip", new Vector3(3, 3, 0), "static", P.boxShape(ZERO, IDQ, { x: 0.5, y: 0.5, z: 0.5 }, { density: 1000 }));
    steps(w, 30);
    const yStatic = s.transformNode.position.y;
    P.setMotion(s, "dynamic");
    const awakeAfterSwitch = P.isAwake(s);
    steps(w, 30);
    const yDyn = s.transformNode.position.y;
    P.setMotion(s, "static");
    steps(w, 30);
    const yFrozen = s.transformNode.position.y;
    const vFrozen = s.getLinearVelocity().length();
    // animated body driven by setTargetTransform pushes a dynamic box
    const pusher = body(w, "pusher", new Vector3(-3, 0.3, 2), "animated", P.boxShape(ZERO, IDQ, { x: 0.6, y: 0.6, z: 0.6 }));
    const victim = dynBox(w, new Vector3(-2.2, 0.15, 2), new Vector3(0.3, 0.3, 0.3), 300);
    for (let i = 0; i < 60; i++) {
      pusher.setTargetTransform(new Vector3(-3 + (i + 1) * 0.03, 0.3, 2), Quaternion.Identity());
      w.physics.step(1 / 60);
    }
    check(out, "S10_minMassClamp_S11_motionSwitches", Math.abs(clamped - 0.005) < 1e-9 && Math.abs(grown - 8) < 0.01 && yStatic === 3 && awakeAfterSwitch && yDyn < 2.7 && Math.abs(yFrozen - yDyn) < 1e-6 && vFrozen === 0 && victim.transformNode.position.x > -1.5, {
      clampedMass: clamped,
      grownMass: r(grown, 4),
      yStatic,
      awakeAfterSwitch,
      yDynamicAfter30: r(yDyn, 3),
      yFrozen: r(yFrozen, 3),
      pusherX: r(pusher.transformNode.position.x, 3),
      victimX: r(victim.transformNode.position.x, 3),
    });
    w.dispose();
  }

  // ---- S12: shape ownership on disposal
  {
    const w = await makeWorld({ gravity: 0 });
    const P = w.physics;
    const base = counts(w);
    const kids = [P.boxShape({ x: -0.2, y: 0, z: 0 }, IDQ, { x: 0.2, y: 0.2, z: 0.2 }), P.boxShape({ x: 0.2, y: 0, z: 0 }, IDQ, { x: 0.2, y: 0.2, z: 0.2 })];
    const c = P.containerShape(kids);
    const b = body(w, "owned", new Vector3(0, 0, 0), "dynamic", c);
    const withBody = counts(w);
    P.disposeBody(b);
    b.transformNode.dispose();
    const afterBody = counts(w);
    const kidsAlive = kids.every((k) => k._pluginData !== undefined);
    for (const k of kids) P.disposeShape(k);
    const afterKids = counts(w);
    // deep disposal of an unassigned container
    const kids2 = [P.sphereShape(ZERO, 0.1), P.sphereShape({ x: 0.3, y: 0, z: 0 }, 0.1)];
    const c2 = P.containerShape(kids2);
    P.disposeShape(c2, true);
    const afterDeep = counts(w);
    check(out, "S12_shapeOwnership", c._pluginData === undefined && kidsAlive && afterKids.hkShapes === base.hkShapes && afterDeep.hkShapes === base.hkShapes && afterKids.pluginShapes === base.pluginShapes && afterBody.hkBodies === base.hkBodies, {
      base,
      withBody: { hkShapes: withBody.hkShapes, hkBodies: withBody.hkBodies },
      afterBody: { hkShapes: afterBody.hkShapes, hkBodies: afterBody.hkBodies, containerDisposed: c._pluginData === undefined, kidsAlive },
      afterKids: { hkShapes: afterKids.hkShapes, pluginShapes: afterKids.pluginShapes },
      afterDeep: { hkShapes: afterDeep.hkShapes },
    });
    w.dispose();
  }
  return out;
}
