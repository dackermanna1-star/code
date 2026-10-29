// Physics system: review fixes — hull decimation (cost, surface error), box detection, degenerate inputs, resting gap,
// teleport baseline, pre-step velocity cache, same-step impacts, adaptive event masks, substep-summed constraint
// impulses, setAutoSleep, hull stats.
import { Vector3, Quaternion, PhysicsShape, PhysicsShapeType, type PhysicsBody } from "@babylonjs/core";
import { Layer } from "../../src/core/context.ts";
import type { RawImpact } from "../../src/core/context.ts";
import type { Physics } from "../../src/physics/physics.ts";
import { makeWorld, body, staticBox, floor, dynBox, steps, check, r, randomPoints, type World } from "./physics-sys-util.ts";

const ZERO = { x: 0, y: 0, z: 0 };
const IDQ = { x: 0, y: 0, z: 0, w: 1 };

/** Undecimated reference hull straight from Havok (what hullShape did before decimation). */
function fullHull(p: Physics, pts: Float32Array): PhysicsShape {
  const hk = p.hk;
  const ptr = hk._malloc(pts.length * 4);
  new Float32Array(hk.HEAPU8.buffer, ptr, pts.length).set(pts);
  const res = hk.HP_Shape_CreateConvexHull(ptr, pts.length / 3);
  hk._free(ptr);
  const s = new PhysicsShape({ pluginData: res[1] }, p.scene);
  (s as unknown as { _type: PhysicsShapeType })._type = PhysicsShapeType.CONVEX_HULL;
  (p.plugin as unknown as { _shapes: Map<bigint, PhysicsShape> })._shapes.set(res[1][0], s);
  hk.HP_Shape_SetFilterInfo(res[1], [Layer.STATIC, 0xffff]);
  return s;
}

/** Max / mean inward surface deviation of shape B (at +X offset) vs shape A (at origin) along rays towards the centre. */
function rayDeviation(w: World, a: PhysicsBody, b: PhysicsBody, offset: number, radius: number): { max: number; mean: number; misses: number } {
  let max = 0, sum = 0, cnt = 0, misses = 0;
  const m = 300;
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < m; k++) {
    const y = 1 - (2 * (k + 0.5)) / m;
    const rr = Math.sqrt(1 - y * y);
    const d = new Vector3(Math.cos(ga * k) * rr, y, Math.sin(ga * k) * rr).scale(radius);
    const ha = w.physics.raycast(d, Vector3.Zero(), undefined, b);
    const hb = w.physics.raycast(d.add(new Vector3(offset, 0, 0)), new Vector3(offset, 0, 0), undefined, a);
    if (!ha || !hb) {
      misses++;
      continue;
    }
    const dev = hb.distance - ha.distance;
    max = Math.max(max, dev);
    sum += dev;
    cnt++;
  }
  return { max, mean: cnt ? sum / cnt : NaN, misses };
}

function boxCorners(sx: number, sy: number, sz: number, q: Quaternion, c: Vector3): number[] {
  const p: number[] = [];
  for (const ix of [-0.5, 0.5]) for (const iy of [-0.5, 0.5]) for (const iz of [-0.5, 0.5]) {
    const v = new Vector3(ix * sx, iy * sy, iz * sz).applyRotationQuaternion(q).add(c);
    p.push(v.x, v.y, v.z);
  }
  return p;
}

export async function probe() {
  const out: Record<string, unknown> = {};

  // ---- F1: decimation: ≤ 16 points, cost, surface error vs the undecimated hull
  {
    const w = await makeWorld({ gravity: 0 });
    const P = w.physics;
    const rows: Record<string, unknown> = {};
    let ok = true;
    // JIT warm-up (timings below are per hull, after warm-up; CPU timings noisy on the shared machine)
    for (let i = 0; i < 40; i++) P.disposeShape(P.hullShape(randomPoints(900 + i, 20 + i * 5, 0.2)));
    for (let i = 0; i < 10; i++) P.disposeShape(fullHull(P, randomPoints(950 + i, 30, 0.2)));
    for (const n of [16, 30, 64, 256, 1024]) {
      const pts = randomPoints(11 + n, n, 0.2);
      // round-ish cloud (dented part buffers are closer to this than to a cube)
      for (let i = 0; i < n; i++) {
        const l = Math.hypot(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]) || 1;
        const s = 0.2 * (0.85 + 0.15 * ((i * 7919) % 13) / 13) / l;
        pts[i * 3] *= s;
        pts[i * 3 + 1] *= s;
        pts[i * 3 + 2] *= s;
      }
      const shapes: PhysicsShape[] = [];
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) shapes.push(P.hullShape(pts, { layer: Layer.STATIC }));
      const ms = (performance.now() - t0) / 20;
      const outPts = P.debugStats().hullPointsOutLast;
      const t1 = performance.now();
      const refs: PhysicsShape[] = [];
      for (let i = 0; i < 5; i++) refs.push(fullHull(P, pts));
      const fullMs = (performance.now() - t1) / 5;
      const a = body(w, "full", Vector3.Zero(), "static", refs[0]);
      const b = body(w, "dec", new Vector3(3, 0, 0), "static", shapes[0]);
      const dev = rayDeviation(w, a, b, 3, 1);
      rows[`n${n}`] = { msPerHull: r(ms, 3), undecimatedMs: r(fullMs, 3), pointsOut: outPts, devMaxMm: r(dev.max * 1000, 1), devMeanMm: r(dev.mean * 1000, 2), devMaxPctOfRadius: r((dev.max / 0.2) * 100, 1), misses: dev.misses };
      // ≤ 16 points always; the decimated hull must be clearly cheaper than the full one for big inputs
      if (outPts > 16 || dev.misses > 0 || (n >= 256 && ms > fullMs)) ok = false;
      a.transformNode.dispose();
      b.transformNode.dispose();
      for (const s of [...shapes, ...refs]) P.disposeShape(s);
    }
    const st = P.debugStats();
    check(out, "F1_hullDecimation", ok && st.hullCount >= 100 && st.hullMsAvg > 0, { rows, hullCount: st.hullCount, hullMsAvg: r(st.hullMsAvg, 4) });
    w.dispose();
  }

  // ---- F2: box-like inputs become boxes (rotated corners + interior/face points; dented plank buffer)
  {
    const w = await makeWorld({ gravity: 0 });
    const P = w.physics;
    const q = Quaternion.RotationYawPitchRoll(0.4, 0.9, -0.3);
    const c = new Vector3(0.05, -0.02, 0.1);
    const pts = boxCorners(0.6, 0.25, 0.4, q, c);
    // interior + face points (a dented render buffer: dents push face points inwards, corners stay)
    for (let i = 0; i < 40; i++) {
      const v = new Vector3(((i * 37) % 11) / 11 - 0.5, ((i * 17) % 7) / 7 - 0.5, i % 2 ? 0.5 : -0.5).multiplyByFloats(0.6, 0.25, 0.4 * (0.8 + 0.2 * (i % 3) / 2)).applyRotationQuaternion(q).add(c);
      pts.push(v.x, v.y, v.z);
    }
    const b0 = P.debugStats().hullBoxes;
    const s = P.hullShape(pts, { density: 500 });
    const isBox = P.debugStats().hullBoxes === b0 + 1;
    const bd = body(w, "plank", Vector3.Zero(), "dynamic", s);
    const mass = P.massOf(bd);
    const expected = 0.6 * 0.25 * 0.4 * 500;
    // ray along the box's local +X axis from outside hits the face at 0.3 from the centre
    const ax = new Vector3(1, 0, 0).applyRotationQuaternion(q);
    const hit = P.raycast(c.add(ax.scale(2)), c, undefined, null);
    const faceDist = hit ? 2 - hit.distance : NaN;
    // the same box given as its 8 corners in the body axes (cube: principal frame arbitrary)
    const b1 = P.debugStats().hullBoxes;
    const cube = P.hullShape(boxCorners(0.3, 0.3, 0.3, Quaternion.Identity(), Vector3.Zero()), { density: 1000 });
    const cubeIsBox = P.debugStats().hullBoxes === b1 + 1;
    const cb = body(w, "cube", new Vector3(5, 0, 0), "dynamic", cube);
    check(out, "F2_boxDetection", isBox && cubeIsBox && Math.abs(mass - expected) / expected < 0.02 && Math.abs(faceDist - 0.3) < 0.005 && Math.abs(P.massOf(cb) - 27) < 0.5, {
      isBox,
      cubeIsBox,
      mass: r(mass, 3),
      expected: r(expected, 3),
      faceDist: r(faceDist, 4),
      cubeMass: r(P.massOf(cb), 3),
    });
    w.dispose();
  }

  // ---- F3: degenerate inputs get a plausible mass (thickened to minHullThickness = 1 mm)
  {
    const w = await makeWorld();
    const P = w.physics;
    floor(w);
    const cases: Record<string, { pts: number[]; expect: number }> = {
      coplanar4: { pts: [0, 0, 0, 0.1, 0, 0, 0, 0.1, 0, 0.1, 0.1, 0], expect: 0.01 },
      nearlyFlat: { pts: [0, 0, 0, 0.1, 0, 0, 0, 0.1, 0, 0.1, 0.1, 0, 0, 0, 1e-5, 0.1, 0.1, 1e-5], expect: 0.01 },
      tiltedPlanarTriangle: { pts: [0, 0, 0, 0.2, 0.2, 0, 0, 0.1, 0.1], expect: -1 },
      twoPoints: { pts: [0, 0, 0, 0.1, 0, 0], expect: 0.005 },
      onePoint: { pts: [0, 0, 0], expect: 0.005 },
      planar40: { pts: Array.from(randomPoints(5, 40, 0.1)).map((v, i) => (i % 3 === 2 ? 0 : v)), expect: -1 },
    };
    const res: Record<string, unknown> = {};
    let ok = true;
    for (const [k, c] of Object.entries(cases)) {
      const s = P.hullShape(c.pts, { density: 1000 });
      const bd = body(w, k, new Vector3(0, 0.5, 0), "dynamic", s);
      steps(w, 60);
      const m = P.massOf(bd);
      const y = bd.transformNode.position.y;
      const finite = Number.isFinite(y);
      const good = finite && y > -0.05 && y < 0.3 && (c.expect < 0 ? m >= 0.005 && m < 0.05 : Math.abs(m - c.expect) / c.expect < 0.1);
      if (!good) ok = false;
      res[k] = { mass: r(m, 5), restY: r(y, 4), outPts: P.debugStats().hullPointsOutLast, good };
      bd.transformNode.dispose();
      P.disposeShape(s);
    }
    check(out, "F3_degenerateHulls", ok && P.debugStats().hullThickened >= 4, { res, thickened: P.debugStats().hullThickened });
    w.dispose();
  }

  // ---- F4: resting gap of hulls / boxes / spheres on a static floor
  {
    const w = await makeWorld();
    const P = w.physics;
    floor(w);
    const items: Array<{ name: string; b: PhysicsBody; half: number }> = [];
    let x = -3;
    for (const sz of [0.01, 0.02, 0.05, 0.2]) {
      const p: number[] = [];
      for (const ix of [-0.5, 0.5]) for (const iy of [-0.5, 0.5]) for (const iz of [-0.5, 0.5]) p.push(ix * sz * 1.3, iy * sz, iz * sz * 0.9);
      // a non-box hull of similar size (box corners + an off-centre bulge so the box detection does not apply)
      p.push(sz * 0.7, 0, 0);
      items.push({ name: `hull${sz * 100}cm`, b: body(w, "h", new Vector3((x += 0.6), sz / 2 + 0.005, 0), "dynamic", P.hullShape(p, { density: 800, layer: Layer.DEBRIS })), half: sz / 2 });
      items.push({ name: `box${sz * 100}cm`, b: body(w, "b", new Vector3((x += 0.6), sz / 2 + 0.005, 0), "dynamic", P.boxShape(ZERO, IDQ, { x: sz, y: sz, z: sz }, { density: 800 })), half: sz / 2 });
    }
    items.push({ name: "sphere5cm", b: body(w, "s", new Vector3((x += 0.6), 0.03, 0), "dynamic", P.sphereShape(ZERO, 0.025, { density: 800 })), half: 0.025 });
    steps(w, 120);
    const gaps: Record<string, number> = {};
    let worst = 0;
    for (const it of items) {
      const g = it.b.transformNode.position.y - it.half;
      gaps[it.name + "_mm"] = r(g * 1000, 2);
      worst = Math.max(worst, Math.abs(g));
    }
    check(out, "F4_restingGap", worst < 0.0015, { gaps, worstMm: r(worst * 1000, 2) });
    w.dispose();
  }

  // ---- F5: teleport re-seeds the sync baseline (no forced substeps, velocity cache zero)
  {
    const w = await makeWorld();
    const P = w.physics;
    floor(w);
    const p: number[] = [];
    for (const ix of [-0.5, 0.5]) for (const iy of [-0.5, 0.5]) for (const iz of [-0.5, 0.5]) p.push(ix * 0.04, iy * 0.004, iz * 0.02);
    p.push(0.025, 0, 0);
    const s = body(w, "sliver", new Vector3(0, 0.003, 0), "dynamic", P.hullShape(p, { density: 2500, layer: Layer.DEBRIS }));
    steps(w, 120);
    P.teleport(s, { x: 5, y: 0.003, z: 0 });
    P.step(1 / 60);
    const sub1 = P.debugStats().substepsLast;
    P.step(1 / 60);
    const sub2 = P.debugStats().substepsLast;
    const v = P.preStepVelocity(s, new Vector3());
    check(out, "F5_teleportBaseline", sub1 === 1 && sub2 === 1 && v.length() < 0.5 && Math.abs(s.transformNode.position.x - 5) < 0.01, { sub1, sub2, preStepSpeed: r(v.length(), 4), x: r(s.transformNode.position.x, 4) });
    w.dispose();
  }

  // ---- F6: velocity cache = Havok's velocity at the start of the step (COM offset, spin; with and without gravity —
  // under gravity Havok's integrator lags the end velocity by 0.375·|g|·dt ≈ 0.06 m/s, a documented bias)
  {
    const res: Record<string, unknown> = {};
    let ok = true;
    for (const gravity of [0, -9.81]) {
      const w = await makeWorld({ gravity });
      const P = w.physics;
      const pts = randomPoints(3, 12, 0.1).map((v, i) => v + (i % 3 === 0 ? 0.3 : i % 3 === 1 ? -0.1 : 0.05)); // COM far from the origin
      const b = body(w, "spinner", new Vector3(0, 20, 0), "dynamic", P.hullShape(pts, { density: 700 }));
      P.setDamping(b, 0, 0);
      b.setLinearVelocity(new Vector3(3, 2, -1));
      b.setAngularVelocity(new Vector3(4, -7, 2));
      let maxLin = 0, maxAng = 0;
      const lin = new Vector3(), ang = new Vector3();
      for (let i = 0; i < 20; i++) {
        const hv = b.getLinearVelocity().clone();
        const hw = b.getAngularVelocity().clone();
        P.step(1 / 60);
        P.preStepVelocity(b, lin, ang);
        maxLin = Math.max(maxLin, lin.subtract(hv).length());
        maxAng = Math.max(maxAng, ang.subtract(hw).length());
      }
      const tol = gravity === 0 ? 0.01 : 0.075;
      if (!(maxLin < tol && maxAng < 0.02)) ok = false;
      res[`g${gravity}`] = { maxLinErr: r(maxLin, 5), maxAngErr: r(maxAng, 5), linTol: tol };
      w.dispose();
    }
    check(out, "F6_velocityCache", ok, res);
  }

  // ---- F7: same-step started impacts (10 m/s ball into a static wall, e = 0 / 0.5; 1 kg drop onto a resting box)
  {
    const res: Record<string, unknown> = {};
    let ok = true;
    for (const e of [0, 0.5]) {
      const w = await makeWorld({ gravity: 0 });
      staticBox(w, new Vector3(0, 0, 0), new Vector3(0.1, 4, 4), { restitution: e });
      const ball = body(w, "ball", new Vector3(-1, 0, 0), "dynamic", w.physics.sphereShape(ZERO, 0.05, { density: 1000, restitution: e }));
      ball.setLinearVelocity(new Vector3(10, 0, 0));
      const m = w.physics.massOf(ball);
      let changed = -1, delivered = -1, imp = 0, vxAtDelivery = NaN;
      const pre = new Vector3();
      let preVx = NaN;
      w.physics.onImpact((ev: RawImpact) => {
        if (delivered < 0) {
          delivered = w.physics.stepIndex;
          imp = ev.impulse;
          vxAtDelivery = ball.getLinearVelocity().x;
          preVx = w.physics.preStepVelocity(ball, pre).x;
        }
      });
      for (let i = 0; i < 40; i++) {
        w.physics.step(1 / 60);
        if (changed < 0 && ball.getLinearVelocity().x < 9) changed = w.physics.stepIndex;
      }
      const expected = (1 + e) * m * 10;
      const good = delivered === changed && Math.abs(imp - expected) / expected < 0.15 && Math.abs(preVx - 10) < 0.2;
      if (!good) ok = false;
      res[`e${e}`] = { velocityChangedAfterStep: changed, impactDeliveredAfterStep: delivered, impulse: r(imp, 4), expected: r(expected, 4), vxAtDelivery: r(vxAtDelivery, 3), preStepVxAtDelivery: r(preVx, 3) };
      w.dispose();
    }
    check(out, "F7_sameStepImpacts", ok, res);
  }

  // ---- F8: adaptive event masks: a settled pile is cold (few events), hits still register; vs all-events
  {
    const res: Record<string, unknown> = {};
    for (const adaptive of [true, false]) {
      const w = await makeWorld({ adaptiveEvents: adaptive });
      const P = w.physics;
      floor(w);
      const boxes: PhysicsBody[] = [];
      for (let i = 0; i < 200; i++) {
        const b = dynBox(w, new Vector3((i % 10) * 0.32 - 1.6, 0.15 + Math.floor(i / 100) * 0.31, (Math.floor(i / 10) % 10) * 0.32 - 1.6), new Vector3(0.3, 0.3, 0.3), 400);
        P.setKeepAwake(b, true); // worst case: awake resting contacts
        boxes.push(b);
      }
      steps(w, 90);
      const st = P.debugStats();
      let impacts = 0;
      P.onImpact(() => impacts++);
      const dropped = dynBox(w, new Vector3(0, 2, 0), new Vector3(0.2, 0.2, 0.2), 500);
      steps(w, 60);
      res[adaptive ? "adaptive" : "allEvents"] = { eventsPerStepSettled: st.eventsLastStep, hotBodies: st.hotBodies, stepMs: r(st.stepMs, 3), impactsFromDrop: impacts, droppedY: r(dropped.transformNode.position.y, 3) };
      w.dispose();
    }
    const a = res.adaptive as { eventsPerStepSettled: number; impactsFromDrop: number; hotBodies: number };
    const f = res.allEvents as { eventsPerStepSettled: number };
    check(out, "F8_adaptiveEventMasks", a.eventsPerStepSettled * 10 < f.eventsPerStepSettled && a.impactsFromDrop >= 1 && a.hotBodies < 20, res);
  }

  // ---- F9: constraint impulses summed over substeps (hanging 10 kg on a ball joint, 3 fixed substeps)
  {
    const w = await makeWorld({ substeps: 3, adaptiveSubsteps: false });
    const P = w.physics;
    const b = dynBox(w, new Vector3(0, 2, 0), new Vector3(0.2, 0.2, 0.2), 1250);
    const c = P.ball(P.worldBody, b, new Vector3(0, 2.3, 0), new Vector3(0, 0.3, 0));
    steps(w, 120);
    const first = P.appliedImpulse(c); // untracked: last substep × 3
    P.step(1 / 60);
    const summed = P.appliedImpulse(c); // tracked: Σ substeps
    const load = P.constraintLoad(c);
    const mg = P.massOf(b) * 9.81;
    const okSum = Math.abs(summed.linear.length() - mg / 60) / (mg / 60) < 0.05 && Math.abs(first.linear.length() - mg / 60) / (mg / 60) < 0.05;
    check(out, "F9_constraintImpulseSubsteps", okSum && Math.abs(load.force - mg) / mg < 0.05 && Math.abs(summed.dt - 1 / 60) < 1e-9, {
      mg: r(mg, 2),
      firstQueryNs: r(first.linear.length(), 4),
      summedNs: r(summed.linear.length(), 4),
      expectedNs: r(mg / 60, 4),
      loadForce: r(load.force, 2),
    });
    w.dispose();
  }

  // ---- F10: setAutoSleep off keeps a pile awake; on puts it to sleep; a woken pile re-sleeps quickly
  {
    const w = await makeWorld();
    const P = w.physics;
    floor(w);
    const boxes: PhysicsBody[] = [];
    for (let i = 0; i < 120; i++) {
      const s = P.hullShape(randomPoints(i + 3, 14, 0.12), { density: 600, layer: Layer.DEBRIS });
      boxes.push(body(w, "p", new Vector3((i % 6) * 0.22 - 0.6, 0.15 + Math.floor(i / 36) * 0.25, (Math.floor(i / 6) % 6) * 0.22 - 0.6), "dynamic", s));
    }
    P.setAutoSleep(false);
    steps(w, 240);
    const awakeOff = boxes.filter((b) => P.isAwake(b)).length;
    P.setAutoSleep(true, { linear: 0.08, angular: 0.2, seconds: 0.6 });
    steps(w, 240);
    const awakeOn = boxes.filter((b) => P.isAwake(b)).length;
    // wake the whole pile with a light tap on one body, then count steps until most are asleep again
    boxes[0].applyImpulse(new Vector3(0, 0.05, 0), boxes[0].transformNode.position);
    P.step(1 / 60);
    let reSleepSteps = -1;
    for (let i = 0; i < 300; i++) {
      P.step(1 / 60);
      if (boxes.filter((b) => P.isAwake(b)).length <= 6) {
        reSleepSteps = i + 1;
        break;
      }
    }
    check(out, "F10_autoSleep", awakeOff > 30 && awakeOn <= 6 && reSleepSteps > 0 && reSleepSteps < 120, { awakeOff, awakeOn, reSleepSteps, forcedSleeps: P.debugStats().forcedSleeps });
    w.dispose();
  }

  // ---- F11: bodies put to sleep by the sleep assist fall when their support goes away (no floating)
  {
    const res: Record<string, unknown> = {};
    let ok = true;
    for (const mode of ["disposeDynamicSupport", "disposeStaticSupport", "removeContainerChild"]) {
      const w = await makeWorld();
      const P = w.physics;
      staticBox(w, new Vector3(0, -0.1, 0), new Vector3(20, 0.2, 20));
      let support: PhysicsBody;
      if (mode === "disposeDynamicSupport") support = dynBox(w, new Vector3(0, 0.5, 0), new Vector3(1, 1, 1), 300);
      else if (mode === "removeContainerChild") {
        const a = P.boxShape(ZERO, IDQ, { x: 1, y: 1, z: 1 }, { layer: Layer.STATIC });
        const b = P.boxShape({ x: 3, y: 0, z: 0 }, IDQ, { x: 1, y: 1, z: 1 }, { layer: Layer.STATIC });
        support = body(w, "pillars", new Vector3(0, 0.5, 0), "static", P.containerShape([a, b]));
      } else support = staticBox(w, new Vector3(0, 0.5, 0), new Vector3(1, 1, 1));
      const top = dynBox(w, new Vector3(0, 1.1, 0), new Vector3(0.3, 0.2, 0.3), 500);
      steps(w, 240);
      const asleep = !P.isAwake(top);
      if (mode === "removeContainerChild") P.removeChildren(support, [0]);
      else support.transformNode.dispose();
      const y0 = top.transformNode.position.y;
      steps(w, 60);
      const y1 = top.transformNode.position.y;
      const fell = y1 < y0 - 0.5;
      if (!asleep || !fell) ok = false;
      res[mode] = { asleepBefore: asleep, y0: r(y0, 3), y1: r(y1, 3), fell };
      w.dispose();
    }
    check(out, "F11_noFloatingAfterSupportRemoval", ok, res);
  }
  return out;
}
