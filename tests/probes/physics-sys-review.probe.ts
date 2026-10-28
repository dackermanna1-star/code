// Reviewer probe (adversarial checks): sleep-assist floating, impact latency, CCD of small non-thin pieces,
// degenerate hull inputs, hull cost without decimation.
import { Vector3, Quaternion, type PhysicsBody } from "@babylonjs/core";
import { Layer } from "../../src/core/context.ts";
import type { RawImpact } from "../../src/core/context.ts";
import { makeWorld, body, staticBox, dynBox, steps, r, randomPoints, type World } from "./physics-sys-util.ts";

function hullBox(w: World, sx: number, sy: number, sz: number, layer = Layer.DEBRIS) {
  const p: number[] = [];
  for (const ix of [-0.5, 0.5]) for (const iy of [-0.5, 0.5]) for (const iz of [-0.5, 0.5]) p.push(ix * sx, iy * sy, iz * sz);
  return w.physics.hullShape(p, { density: 2500, layer });
}

async function sleepFloat() {
  const out: Record<string, unknown> = {};
  // A) box resting on dynamic slab on floor; both forced asleep; dispose the slab
  for (const mode of ["disposeDynSupport", "disposeStaticSupport", "removeChildSupport", "staticSupportToDynamicThenDispose"]) {
    const w = await makeWorld();
    staticBox(w, new Vector3(0, -0.1, 0), new Vector3(20, 0.2, 20));
    let support: PhysicsBody;
    if (mode === "disposeDynSupport") support = dynBox(w, new Vector3(0, 0.5, 0), new Vector3(1, 1, 1), 300);
    else if (mode === "removeChildSupport") {
      // static container: 2 children (left pillar under the box, right pillar elsewhere)
      const a = w.physics.boxShape({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 1, y: 1, z: 1 }, { layer: Layer.STATIC });
      const b = w.physics.boxShape({ x: 3, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 1, y: 1, z: 1 }, { layer: Layer.STATIC });
      support = body(w, "pill", new Vector3(0, 0.5, 0), "static", w.physics.containerShape([a, b]));
    } else support = staticBox(w, new Vector3(0, 0.5, 0), new Vector3(1, 1, 1));
    const top = dynBox(w, new Vector3(0, 1.1, 0), new Vector3(0.3, 0.2, 0.3), 500);
    steps(w, 60 * 4);
    const asleepBefore = w.physics.isAwake(top) === false;
    const forced = w.physics.debugStats().forcedSleeps;
    if (mode === "disposeDynSupport" || mode === "disposeStaticSupport") support.transformNode.dispose();
    else if (mode === "removeChildSupport") w.physics.removeChildren(support, [0]);
    else {
      w.physics.setMotion(support, "dynamic");
      steps(w, 1);
      support.transformNode.dispose();
    }
    const y0 = top.transformNode.position.y;
    steps(w, 60);
    const y1 = top.transformNode.position.y;
    out[mode] = { asleepBefore, forcedSleeps: forced, yBefore: r(y0, 3), yAfter1s: r(y1, 3), FLOATS: y1 > y0 - 0.05 };
    w.dispose();
  }
  return out;
}

async function latency() {
  const out: Record<string, unknown> = {};
  for (const e of [0, 0.5]) {
    const w = await makeWorld({ gravity: 0 });
    staticBox(w, new Vector3(0, 0, 0), new Vector3(0.1, 4, 4), { restitution: e });
    const ball = body(w, "ball", new Vector3(-1, 0, 0), "dynamic", w.physics.sphereShape({ x: 0, y: 0, z: 0 }, 0.05, { density: 1000, restitution: e }));
    ball.setLinearVelocity(new Vector3(10, 0, 0));
    let hitStep = -1;
    let impStep = -1;
    let vAtImpact = NaN;
    let imp = 0;
    w.physics.onImpact((ev: RawImpact) => {
      if (impStep < 0) {
        impStep = w.physics.stepIndex;
        vAtImpact = ball.getLinearVelocity().x;
        imp = ev.impulse;
      }
    });
    for (let i = 0; i < 40; i++) {
      w.physics.step(1 / 60);
      if (hitStep < 0 && ball.getLinearVelocity().x < 9) hitStep = w.physics.stepIndex;
    }
    out[`e${e}`] = { velocityChangedAtStep: hitStep, impactDeliveredAfterStep: impStep, delaySteps: impStep - hitStep, ballVxWhenImpactDelivered: r(vAtImpact, 3), impulse: r(imp, 3), mass: r(w.physics.massOf(ball), 4) };
    w.dispose();
  }
  // heavy on light: 20 kg box dropped 0.5 m onto 0.3 kg mug on floor
  {
    const w = await makeWorld();
    staticBox(w, new Vector3(0, -0.1, 0), new Vector3(20, 0.2, 20));
    const mug = dynBox(w, new Vector3(0, 0.05, 0), new Vector3(0.08, 0.1, 0.08), 600);
    steps(w, 30);
    const box = dynBox(w, new Vector3(0, 0.75, 0), new Vector3(0.4, 0.4, 0.4), 312);
    let first = -1;
    const evs: unknown[] = [];
    const t0 = w.physics.stepIndex;
    let contactStep = -1;
    w.physics.onImpact((ev) => {
      if (first < 0) first = w.physics.stepIndex - t0;
      evs.push({ at: w.physics.stepIndex - t0, imp: r(ev.impulse, 2), started: ev.started });
    });
    for (let i = 0; i < 60; i++) {
      w.physics.step(1 / 60);
      if (contactStep < 0 && box.getLinearVelocity().y > -0.5 && i > 3) contactStep = w.physics.stepIndex - t0;
    }
    out.heavyOnLight = { boxStoppedAtStep: contactStep, firstImpactAt: first, evs: evs.slice(0, 6) };
    w.dispose();
  }
  return out;
}

async function ccd() {
  const out: Record<string, unknown> = {};
  for (const size of [0.02, 0.025, 0.03, 0.05]) {
    for (const speed of [30, 45]) {
      for (const mode of ["fresh", "struck"]) {
        const w = await makeWorld({ gravity: 0 });
        staticBox(w, new Vector3(0, 0, 0), new Vector3(0.05, 6, 6));
        let tunnels = 0;
        let maxSub = 0;
        let thin = false;
        for (let t = 0; t < 10; t++) {
          const rot = Quaternion.RotationYawPitchRoll(t * 0.7 + 0.2, t * 1.3 + 0.3, t * 0.4 + 0.1);
          const b = body(w, "p", new Vector3(-1.2, (t % 5) * 0.8 - 2, Math.floor(t / 5) * 1.5 - 0.75), "dynamic", w.physics.boxShape({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, { x: size, y: size, z: size }, { density: 2500, layer: Layer.DEBRIS }), { rot });
          thin = (w.physics as unknown as { recs: WeakMap<PhysicsBody, { thin: boolean }> }).recs.get(b)!.thin;
          if (mode === "struck") steps(w, 3);
          b.setLinearVelocity(new Vector3(speed, 0, 0));
          b.setAngularVelocity(new Vector3(30, 50, 20));
          let prev = b.transformNode.position.x;
          let crossed = false;
          for (let i = 0; i < 25; i++) {
            w.physics.step(1 / 60);
            maxSub = Math.max(maxSub, w.physics.debugStats().substepsLast);
            const x = b.transformNode.position.x;
            if (prev < 0 && x > 0) crossed = true;
            prev = x;
          }
          if (crossed) tunnels++;
          const s = b.shape!;
          b.transformNode.dispose();
          w.physics.disposeShape(s);
        }
        out[`cube${size * 100}cm_v${speed}_${mode}`] = `${tunnels}/10 maxSub=${maxSub} thin=${thin}`;
        w.dispose();
      }
    }
  }
  return out;
}

async function hulls() {
  const out: Record<string, unknown> = {};
  const w = await makeWorld();
  const cases: Record<string, number[]> = {
    onePoint: [0, 0, 0],
    twoPoints: [0, 0, 0, 0.1, 0, 0],
    threePoints: [0, 0, 0, 0.1, 0, 0, 0, 0.1, 0],
    coplanar4: [0, 0, 0, 0.1, 0, 0, 0, 0.1, 0, 0.1, 0.1, 0],
    nearlyFlat: [0, 0, 0, 0.1, 0, 0, 0, 0.1, 0, 0.1, 0.1, 0, 0, 0, 1e-5, 0.1, 0.1, 1e-5],
  };
  for (const [k, pts] of Object.entries(cases)) {
    try {
      const s = w.physics.hullShape(pts, { density: 1000 });
      const b = body(w, k, new Vector3(0, 2, 0), "dynamic", s);
      steps(w, 5);
      const p = b.transformNode.position;
      out[k] = { ok: true, mass: w.physics.massOf(b), finite: Number.isFinite(p.x + p.y + p.z) };
      b.transformNode.dispose();
      w.physics.disposeShape(s);
    } catch (e) {
      out[k] = { threw: String(e).slice(0, 120) };
    }
  }
  for (const n of [16, 64, 256]) {
    const pts = randomPoints(7, n, 0.2);
    const t0 = performance.now();
    const shapes = [];
    for (let i = 0; i < 20; i++) shapes.push(w.physics.hullShape(pts));
    out[`hull${n}pts_ms`] = r((performance.now() - t0) / 20, 3);
    for (const s of shapes) w.physics.disposeShape(s);
  }
  w.dispose();
  return out;
}

async function teleportSubsteps() {
  const w = await makeWorld();
  staticBox(w, new Vector3(0, -0.1, 0), new Vector3(20, 0.2, 20));
  const s = body(w, "sliver", new Vector3(0, 0.01, 0), "dynamic", hullBox(w, 0.04, 0.02, 0.004));
  steps(w, 120);
  w.physics.teleport(s, { x: 5, y: 0.01, z: 0 });
  w.physics.step(1 / 60);
  w.physics.step(1 / 60);
  const sub = w.physics.debugStats().substepsLast;
  w.dispose();
  return { substepsAfterTeleportOfRestingSliver: sub };
}

export async function probe() {
  return { sleepFloat: await sleepFloat(), latency: await latency(), hulls: await hulls(), teleport: await teleportSubsteps(), ccd: await ccd() };
}
