// (1) hinge reaction under impacts (breakable joints), reading a disposed joint; (2) character: update order with dynamic
// bodies, crouch headroom check with a shape proximity query, support body for footsteps.
import {
  Vector3,
  Quaternion,
  HingeConstraint,
  PhysicsMotionType,
  PhysicsShapeCapsule,
  ProximityCastResult,
  type PhysicsConstraint,
  type Observer,
  type Scene,
} from "@babylonjs/core";
import { makeWorld, makeBox, stepN, localToWorld, relAngle, appliedImpulses, r3, v3, deg, newHavok, type CWorld } from "./physics-constraints-util.ts";
import { FpsMover, supportContacts, characterBody, type MoveInput } from "./physics-constraints-ccutil.ts";

const DT = 1 / 60;
const idle: MoveInput = { forward: 0, right: 0, yaw: 0, speed: 0, jump: false };

function load(w: CWorld, c: PhysicsConstraint) { const i = appliedImpulses(w.hk, c); return { F: i.lin.length() / DT, T: i.ang.length() / DT }; }

export async function probe() {
  const out: Record<string, unknown> = {};

  // ---------- (1) door hit by a 10 kg box at 5 m/s, and by a 1 kg box at 10 m/s; per-step hinge load
  for (const [m, v] of [[10, 5], [1, 10], [30, 3]]) {
    const w = await makeWorld(await newHavok());
    const frame = makeBox(w.scene, "frame", new Vector3(0.1, 2.1, 0.1), new Vector3(-0.5, 1.05, 0), { motion: PhysicsMotionType.STATIC });
    const door = makeBox(w.scene, "door", new Vector3(0.9, 2.0, 0.06), new Vector3(0, 1.05, 0), { mass: 20 });
    const h = new HingeConstraint(new Vector3(0.05, 0, 0), new Vector3(-0.45, 0, 0), Vector3.Up(), Vector3.Up(), w.scene);
    frame.addConstraint(door, h);
    const box = makeBox(w.scene, "proj", new Vector3(0.25, 0.25, 0.25), new Vector3(0.3, 1.3, -1), { mass: m });
    box.setGravityFactor(0);
    stepN(w.scene, 5);
    const rest = load(w, h);
    box.setLinearVelocity(new Vector3(0, 0, v));
    const Fs: number[] = [], Ts: number[] = [];
    for (let k = 0; k < 40; k++) { stepN(w.scene, 1); const l = load(w, h); Fs.push(r3(l.F)); Ts.push(r3(l.T)); }
    const peakF = Math.max(...Fs), peakT = Math.max(...Ts);
    out[`impact_${m}kg_${v}mps`] = { restF: r3(rest.F), restT: r3(rest.T), peakF: r3(peakF), peakT: r3(peakT), stepsAbove2xRest: Fs.filter((f) => f > 2 * rest.F).length, firstSteps: Fs.slice(0, 12), doorAngle: deg(relAngle(frame, door, Vector3.Up(), new Vector3(1, 0, 0))) };
    // reading a disposed joint
    h.dispose();
    let disposedRead: unknown;
    try { disposedRead = appliedImpulses(w.hk, h); } catch (e) { disposedRead = "throws: " + String(e).slice(0, 80); }
    out[`impact_${m}kg_${v}mps`] = { ...(out[`impact_${m}kg_${v}mps`] as object), readAfterDispose: typeof disposedRead === "string" ? disposedRead : "returned" };
    w.dispose();
  }

  // ---------- (2a) update order with dynamic bodies: push a 20 kg box, stand on a 50 kg crate
  for (const order of ["before", "after"] as const) {
    const w = await makeWorld(await newHavok());
    makeBox(w.scene, "floor", new Vector3(40, 0.2, 40), new Vector3(0, -0.1, 0), { motion: PhysicsMotionType.STATIC });
    const box = makeBox(w.scene, "box", new Vector3(0.5, 0.5, 0.5), new Vector3(0, 0.25, 2), { mass: 20 });
    const m = new FpsMover(w.scene, new Vector3(0, 0.05, 0));
    m.cc.characterStrength = 600; m.cc.characterMass = 80;
    m.cc.keepDistance = 0.02; m.cc.keepContactTolerance = 0.03;
    let input: MoveInput = idle;
    const cb = () => m.step(DT, input);
    const obs: Observer<Scene> = order === "before" ? w.scene.onBeforePhysicsObservable.add(cb) : w.scene.onAfterPhysicsObservable.add(cb);
    stepN(w.scene, 20);
    input = { forward: 1, right: 0, yaw: 0, speed: 3.6, jump: false };
    const gaps: number[] = [];
    for (let k = 0; k < 120; k++) { stepN(w.scene, 1); if (k > 60) gaps.push(box.transformNode.position.z - 0.25 - (m.cc.getPosition().z + 0.3)); }
    const crate = makeBox(w.scene, "crate", new Vector3(0.8, 0.6, 0.8), new Vector3(10, 0.3, 0), { mass: 50 });
    stepN(w.scene, 10);
    input = idle;
    m.cc.setPosition(new Vector3(10, 0.6 + 0.02 + 0.9, 0));
    m.cc.setVelocity(Vector3.Zero());
    const feet: number[] = [];
    for (let k = 0; k < 90; k++) { stepN(w.scene, 1); if (k > 30) feet.push(m.feetY); }
    const sc = supportContacts(m.cc);
    (order === "before" ? w.scene.onBeforePhysicsObservable : w.scene.onAfterPhysicsObservable).remove(obs);
    out[`order_${order}`] = {
      pushGapMm: { min: r3(Math.min(...gaps) * 1000), max: r3(Math.max(...gaps) * 1000) }, boxZ: r3(box.transformNode.position.z), charSpeed: r3(m.cc.getVelocity().length()),
      onCrate: { feetMin: r3(Math.min(...feet)), feetMax: r3(Math.max(...feet)), crateY: r3(crate.transformNode.position.y), support: sc.map((s) => s.body.transformNode.name), grounded: m.grounded },
    };
    m.cc.dispose(); w.dispose();
  }

  // ---------- (2b) crouch headroom check via plugin.shapeProximity with a standing-size capsule
  {
    const w = await makeWorld(await newHavok());
    makeBox(w.scene, "floor", new Vector3(40, 0.2, 40), new Vector3(0, -0.1, 0), { motion: PhysicsMotionType.STATIC });
    makeBox(w.scene, "beam", new Vector3(4, 0.4, 1), new Vector3(0, 1.5, 2.5), { motion: PhysicsMotionType.STATIC }); // underside y = 1.3
    const m = new FpsMover(w.scene, new Vector3(0, 0.02, 0));
    m.cc.keepDistance = 0.02; m.cc.keepContactTolerance = 0.03;
    const standProbe = new PhysicsShapeCapsule(new Vector3(0, 0.9 - 0.3, 0), new Vector3(0, -0.9 + 0.3, 0), 0.3, w.scene);
    standProbe.filterMembershipMask = 8; standProbe.filterCollideMask = 1 | 2; // like the player: STATIC | DYNAMIC
    const canStand = (): { ok: boolean; dist: number } => {
      const feet = m.cc.getPosition().y - m.cc.footOffset;
      const centre = new Vector3(m.cc.getPosition().x, feet + 0.9 + 0.01, m.cc.getPosition().z); // 1 cm above the floor
      const a = new ProximityCastResult(), b = new ProximityCastResult();
      w.plugin.shapeProximity({ shape: standProbe, position: centre, rotation: Quaternion.Identity(), maxDistance: 0, shouldHitTriggers: false, ignoreBody: characterBody(m.cc) }, a, b);
      return { ok: !b.hasHit, dist: b.hasHit ? r3(b.hitDistance) : 0 };
    };
    for (let k = 0; k < 20; k++) { m.step(DT, idle); stepN(w.scene, 1); }
    const openArea = canStand();
    m.cc.setShapeOptions({ capsuleHeight: 1.1, capsuleRadius: 0.3 });
    for (let k = 0; k < 90; k++) { m.step(DT, { forward: 1, right: 0, yaw: 0, speed: 1.6, jump: false }); stepN(w.scene, 1); }
    const underBeam = canStand();
    out.headroom = { openArea, underBeam, charZ: r3(m.cc.getPosition().z), feetY: r3(m.feetY) };
    m.cc.dispose(); w.dispose();
  }
  return out;
}
