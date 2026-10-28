// Why does a 1000-hull pile never sleep? + event-mask cost reduction
import { Vector3, Quaternion, TransformNode, PhysicsBody, PhysicsMotionType, PhysicsShape, PhysicsShapeBox, NullEngine, Scene, HavokPlugin, FreeCamera, PhysicsEventType } from "@babylonjs/core";
import HavokPhysics, { type HavokPhysicsWithBindings } from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { r3 } from "./physics-bodies-util";

async function freshWorld() {
  const hk = await HavokPhysics({ locateFile: () => havokWasmUrl });
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera("c", new Vector3(0, 5, -10), scene);
  const plugin = new HavokPlugin(true, hk);
  scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
  return { hk, engine, scene, plugin };
}
type W = Awaited<ReturnType<typeof freshWorld>>;
function staticBox(w: W, c: Vector3, e: Vector3) {
  const b = new PhysicsBody(new TransformNode("s", w.scene), PhysicsMotionType.STATIC, false, w.scene);
  b.shape = new PhysicsShapeBox(c, Quaternion.Identity(), e, w.scene);
  return b;
}
function hull(w: W, seed: number, npts: number, size: number): PhysicsShape {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pts = new Float32Array(npts * 3);
  for (let i = 0; i < pts.length; i++) pts[i] = (rnd() - 0.5) * size;
  const ptr = w.hk._malloc(pts.length * 4);
  new Float32Array(w.hk.HEAPU8.buffer, ptr, pts.length).set(pts);
  const res = w.hk.HP_Shape_CreateConvexHull(ptr, npts);
  w.hk._free(ptr);
  return new PhysicsShape({ pluginData: res[1] }, w.scene);
}
/** embind enum -> numeric value (d.ts declares them as TS enums, runtime objects carry .value) */
const ev = (e: unknown) => (e as { value: number }).value;
const asleep = (hk: HavokPhysicsWithBindings, bodies: PhysicsBody[]) => bodies.reduce((n, b) => n + (hk.HP_Body_GetActivationState(b._pluginData.hpBodyId)[1] === hk.ActivationState.INACTIVE ? 1 : 0), 0);
const maxSpeed = (bodies: PhysicsBody[]) => r3(Math.max(...bodies.map((b) => b.getLinearVelocity().length())));
const maxAng = (bodies: PhysicsBody[]) => r3(Math.max(...bodies.map((b) => b.getAngularVelocity().length())));

const RUN_BASE = false;
async function run(kind: "hull" | "box", n: number, layout: "pile" | "spread", walls: boolean, steps: number[], mitigation?: "damping" | "forceSleep" | "freezeStatic") {
  const w = await freshWorld();
  staticBox(w, new Vector3(0, -0.5, 0), new Vector3(200, 1, 200));
  const half = 3;
  if (walls) {
    staticBox(w, new Vector3(half + 0.5, 3, 0), new Vector3(1, 6, half * 2));
    staticBox(w, new Vector3(-half - 0.5, 3, 0), new Vector3(1, 6, half * 2));
    staticBox(w, new Vector3(0, 3, half + 0.5), new Vector3(half * 2, 6, 1));
    staticBox(w, new Vector3(0, 3, -half - 0.5), new Vector3(half * 2, 6, 1));
  }
  const bodies: PhysicsBody[] = [];
  const boxShape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.25, 0.25, 0.25), w.scene);
  for (let i = 0; i < n; i++) {
    const tn = new TransformNode("h" + i, w.scene);
    if (layout === "pile") tn.position.set(-2.7 + (i % 10) * 0.6, 0.4 + Math.floor(i / 100) * 0.6, -2.7 + (Math.floor(i / 10) % 10) * 0.6);
    else tn.position.set(-60 + (i % 60) * 2, 0.5, -60 + Math.floor(i / 60) * 2);
    tn.rotationQuaternion = Quaternion.RotationYawPitchRoll(i, i * 0.37, i * 0.11);
    tn.computeWorldMatrix(true);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, w.scene);
    b.shape = kind === "hull" ? hull(w, i + 1, 20, 0.35) : boxShape;
    bodies.push(b);
  }
  if (mitigation === "damping") for (const b of bodies) { b.setLinearDamping(0.3); b.setAngularDamping(0.6); }
  const slowFor = new Int32Array(bodies.length);
  const tmpV = new Vector3();
  let frozen = 0;
  const res: Record<string, unknown> = {};
  let done = 0;
  const times: number[] = [];
  for (const s of steps) {
    for (; done < s; done++) {
      const t0 = performance.now();
      w.scene._advancePhysicsEngineStep(1000 / 60);
      times.push(performance.now() - t0);
      if ((mitigation === "forceSleep" || mitigation === "freezeStatic") && done % 10 === 0) {
        for (let i = 0; i < bodies.length; i++) {
          const b = bodies[i];
          if (b.getMotionType() === PhysicsMotionType.STATIC) continue;
          b.getLinearVelocityToRef(tmpV);
          const lin = tmpV.length();
          b.getAngularVelocityToRef(tmpV);
          const slow = lin < 0.15 && tmpV.length() < 0.6;
          slowFor[i] = slow ? slowFor[i] + 10 : 0;
          if (slowFor[i] >= 60) { // slow for 1 s
            if (mitigation === "forceSleep") w.hk.HP_Body_SetActivationState(b._pluginData.hpBodyId, w.hk.ActivationState.INACTIVE);
            else { b.setMotionType(PhysicsMotionType.STATIC); frozen++; }
          }
        }
      }
    }
    if (mitigation && s === steps[steps.length - 1]) {
      // responsiveness: drop a heavy box onto the (forced-asleep / frozen) pile
      const before = bodies.map((b) => b.transformNode.position.clone());
      const dn = new TransformNode("dropper", w.scene);
      dn.position.set(0, 3, 0);
      const db = new PhysicsBody(dn, PhysicsMotionType.DYNAMIC, false, w.scene);
      db.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.8, 0.8, 0.8), w.scene);
      db.setMassProperties({ mass: 200 });
      for (let k = 0; k < 90; k++) w.scene._advancePhysicsEngineStep(1000 / 60);
      res.dropTest = { dropperRestY: r3(dn.position.y), pileBodiesMovedOver1cm: bodies.filter((b, i) => b.transformNode.position.subtract(before[i]).length() > 0.01).length, asleepAfterDrop: asleep(w.hk, bodies) };
    }
    const last = times.slice(-120);
    res["step" + s] = { asleep: asleep(w.hk, bodies), frozenStatic: frozen, maxSpeed: maxSpeed(bodies), maxAng: maxAng(bodies), avgStepMsLast120: r3(last.reduce((a, c) => a + c, 0) / last.length) };
  }
  w.engine.dispose();
  return res;
}

export async function probe() {
  const out: Record<string, unknown> = {};
  if (RUN_BASE) {
    out.hull1000_pile_walls = await run("hull", 1000, "pile", true, [300, 600, 1200]);
    out.box1000_pile_walls = await run("box", 1000, "pile", true, [300, 600, 1200]);
    out.hull100_pile_walls = await run("hull", 100, "pile", true, [300, 600, 1200]);
    out.hull1000_spread = await run("hull", 1000, "spread", false, [300, 600]);
    out.hull300_pile_noWalls = await run("hull", 300, "pile", false, [300, 600, 1200]);
  }
  out.mitigation_forceSleep = await run("hull", 1000, "pile", true, [300, 600], "forceSleep");
  out.mitigation_freezeStatic = await run("hull", 1000, "pile", true, [300, 600], "freezeStatic");
  // event mask: STARTED only vs all
  {
    const w = await freshWorld();
    staticBox(w, new Vector3(0, -0.5, 0), new Vector3(200, 1, 200));
    const bodies: PhysicsBody[] = [];
    for (let i = 0; i < 200; i++) {
      const tn = new TransformNode("e" + i, w.scene);
      tn.position.set((i % 20) * 0.5 - 5 + (i >= 100 ? 50 : 0), 0.5 + Math.floor(i / 20) * 0.4, 0);
      const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, w.scene);
      b.shape = hull(w, i + 7, 16, 0.3);
      if (i < 100) b.setCollisionCallbackEnabled(true); // STARTED|CONTINUED|FINISHED
      else b.setEventMask(ev(w.hk.EventType.COLLISION_STARTED)); // STARTED only
      bodies.push(b);
    }
    const counts: Record<string, number> = {};
    const startedImpulses: number[] = [];
    w.plugin.onCollisionObservable.add((ev) => {
      const who = (bodies.indexOf(ev.collider) >= 100 || bodies.indexOf(ev.collidedAgainst) >= 100) ? "maskStartedOnly" : "allEvents";
      counts[who + ":" + ev.type] = (counts[who + ":" + ev.type] ?? 0) + 1;
      if (ev.type === PhysicsEventType.COLLISION_STARTED && startedImpulses.length < 2000) startedImpulses.push(ev.impulse);
    });
    w.plugin.onCollisionEndedObservable.add((ev) => { counts["ended:" + ev.type] = (counts["ended:" + ev.type] ?? 0) + 1; });
    for (let i = 0; i < 300; i++) w.scene._advancePhysicsEngineStep(1000 / 60);
    const nz = startedImpulses.filter((x) => x > 0).length;
    out.eventMask = {
      counts300steps: counts,
      eventTypeValues: { STARTED: ev(w.hk.EventType.COLLISION_STARTED), CONTINUED: ev(w.hk.EventType.COLLISION_CONTINUED), FINISHED: ev(w.hk.EventType.COLLISION_FINISHED) },
      startedEvents_withNonZeroImpulse: `${nz}/${startedImpulses.length}`,
      startedImpulseMax: r3(Math.max(...startedImpulses)),
    };
    w.engine.dispose();
  }
  return out;
}
