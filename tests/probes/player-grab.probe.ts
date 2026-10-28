// Grab / hold / throw / slam / pull probe:
//  - a 2 kg box: grab → lifted to the hold point (held layer), wheel distance, R-rotate,
//    full-charge throw (v = min(√(2E/m), 16) + player velocity), drop, mask restore after delay
//  - an 80 kg crate: can't be lifted (stays on the floor) but can be dragged
//  - a hinged door (static frame + dynamic leaf on a Havok hinge): grabbing near the free edge and
//    turning swings it; destruction.pull gets the hand force every step
//  - a static wall cabinet: grab = pull (force grows with stretch, capped at 450 N), slips at 1.2 m
//  - slam: thrust down/forward; standing on the held object drops it; use key
import { Color3, HingeConstraint, PhysicsMotionType, PhysicsConstraintAxis, PhysicsConstraintAxisLimitMode, PhysicsShapeType, Quaternion, Vector3, type PhysicsBody, type PhysicsShape } from "@babylonjs/core";
import { Layer } from "../../src/core/context.ts";
import { PlayerCore } from "../../src/player/playerCore.ts";
import { LIFT_FORCE } from "../../src/player/interaction.ts";
import { makeWorld, key, r2, r3, v3 } from "./player-util.ts";

function leafMasks(w: { plugin: { _hknp: unknown; _shapes?: Map<bigint, PhysicsShape> } }, body: PhysicsBody): number[] {
  const s = body.shape!;
  if (s.type !== PhysicsShapeType.CONTAINER) return [s.filterMembershipMask];
  const hk = w.plugin._hknp as { HP_Shape_GetChildShape: (a: unknown, i: number) => [unknown, [bigint]] };
  const reg = (w.plugin as unknown as { _shapes: Map<bigint, PhysicsShape> })._shapes;
  const out: number[] = [];
  for (let i = 0; i < s.getNumChildren(); i++) out.push(reg.get(hk.HP_Shape_GetChildShape(s._pluginData, i)[1][0])?.filterMembershipMask ?? -1);
  return out;
}

export async function probe() {
  const w = await makeWorld();
  const out: Record<string, unknown> = {};
  w.box("floor", [40, 0.2, 40], [0, -0.1, 0]);
  const p = new PlayerCore(w.ctx, null);
  (w.ctx as { player: unknown }).player = p;
  w.input.setEnabled(true);
  w.input.setFallback(true);
  const it = p.interaction;

  // ---------------------------------------------------------------- light box: grab, hold, throw
  const box = w.box("box", [0.3, 0.3, 0.3], [0, 0.15, 1.2], { motion: PhysicsMotionType.DYNAMIC, mass: 2, container: true, color: new Color3(0.85, 0.5, 0.2) });
  w.destruction.register(box, { name: "Cardboard box", mat: "cardboard", isStatic: false, grabbable: true, usable: null });
  p.teleport({ x: 0, y: 1.65, z: 0 }, 0, Math.atan2(1.65 - 0.15, 1.2)); // look down at the box centre
  w.step(20);
  out.targetBeforeGrab = p.target ? { name: p.target.assemblyName, crosshair: p.crosshair } : null;
  p.debugAction("grab");
  const grabbed = p.holding === box;
  const masksHeld = leafMasks(w as never, box);
  w.step(90);
  const hold = { dist: r2(it.holdDistance), boxPos: v3(box.transformNode.position) };
  // the grab point should sit near the hold target (eye + forward·dist)
  const target = p.position.add(p.forward.scale(it.holdDistance));
  out.hold = {
    grabbed,
    masksHeld,
    heldLayer: Layer.HELD,
    ...hold,
    targetPos: v3(target),
    lifted: box.transformNode.position.y > 0.3,
    canLift: it.canLift,
    events: w.log.grab.length,
  };
  // look up while holding: the box follows
  w.input.addLook(0, -300);
  w.step(40);
  out.followLookUp = { boxY: r2(box.transformNode.position.y), eyeY: r2(p.position.y) };
  // wheel: push away
  const d0 = it.holdDistance;
  w.input.addWheel(4);
  w.step(30);
  out.wheel = { before: r2(d0), after: r2(it.holdDistance), boxDist: r2(Vector3.Distance(box.transformNode.position, p.position)) };
  // R + mouse rotates the held object (camera yaw must not change)
  const yaw0 = p.rig.yaw;
  const q0 = box.transformNode.rotationQuaternion!.clone();
  key("KeyR", true);
  for (let i = 0; i < 20; i++) {
    w.input.addLook(15, 0);
    w.step(1);
  }
  key("KeyR", false);
  const dq = Quaternion.Inverse(q0).multiply(box.transformNode.rotationQuaternion!);
  out.rotate = { cameraYawChanged: r3(p.rig.yaw - yaw0), objectTurnedDeg: r2((2 * Math.acos(Math.min(1, Math.abs(dq.w))) * 180) / Math.PI) };
  // throw at full charge (walking forward → inherits player velocity)
  w.input.addLook(0, 300);
  w.step(20);
  key("KeyW", true);
  w.step(30);
  const pv = p.velocity.clone();
  p.debugAction("throw", 1);
  const given = (w.log.throw[w.log.throw.length - 1] as { energy: number } | undefined)?.energy ?? 0;
  const vAfter = new Vector3();
  box.getLinearVelocityToRef(vAfter);
  key("KeyW", false);
  const expected = Math.min(Math.sqrt((2 * 250) / 2), 16);
  out.throw = {
    energyGiven: r2(given),
    expectedSpeedAlongView: r2(expected),
    playerVel: v3(pv),
    boxVel: v3(vAfter),
    speedAlongView: r2(Vector3.Dot(vAfter.subtract(pv), p.forward)),
    holdingAfter: p.holding !== null,
    event: w.log.throw.length ? w.log.throw[w.log.throw.length - 1] : null,
    masksRightAfter: leafMasks(w as never, box),
  };
  w.step(30);
  out.masksRestoredAfterDelay = leafMasks(w as never, box);

  // ---------------------------------------------------------------- heavy crate: drag only
  const crate = w.box("crate", [0.8, 0.8, 0.8], [6, 0.4, 1.4], { motion: PhysicsMotionType.DYNAMIC, mass: 80, color: new Color3(0.4, 0.3, 0.2) });
  w.destruction.register(crate, { name: "Safe", mat: "steel", isStatic: false, grabbable: true, usable: null });
  p.teleport({ x: 6, y: 1.65, z: 0 }, 0, Math.atan2(1.65 - 0.6, 1.0));
  w.step(15);
  p.debugAction("grab");
  const heavyGrab = p.holding === crate;
  w.step(60);
  const y1 = crate.transformNode.position.y;
  const z1 = crate.transformNode.position.z;
  key("KeyS", true); // walk backwards: drag it along
  w.step(90);
  key("KeyS", false);
  out.heavy = {
    grabbed: heavyGrab,
    canLift: it.canLift,
    maxLiftKg: r2(LIFT_FORCE / 9.81),
    yAfterHold: r2(y1),
    stillHolding: p.holding === crate,
    draggedZ: r2(crate.transformNode.position.z - z1),
    playerSpeedWhileDragging: r2(p.speed),
  };
  p.debugAction("grab"); // drop
  w.step(5);

  // ---------------------------------------------------------------- hinged door
  const frame = w.box("frame", [0.1, 2.1, 0.1], [-6, 1.05, 3], { color: new Color3(0.9, 0.9, 0.88) });
  const door = w.box("door", [0.9, 2.0, 0.04], [-6 + 0.05 + 0.45, 1.05, 3], { motion: PhysicsMotionType.DYNAMIC, mass: 15, color: new Color3(0.75, 0.68, 0.55) });
  door.setAngularDamping(0.5);
  const hinge = new HingeConstraint(new Vector3(0.05, 0, 0), new Vector3(-0.45, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 1, 0), w.scene);
  frame.addConstraint(door, hinge);
  w.plugin.setAxisMode(hinge, PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxisLimitMode.LIMITED);
  w.plugin.setAxisMinLimit(hinge, PhysicsConstraintAxis.ANGULAR_X, (-100 * Math.PI) / 180);
  w.plugin.setAxisMaxLimit(hinge, PhysicsConstraintAxis.ANGULAR_X, (100 * Math.PI) / 180);
  w.destruction.register(door, { name: "Bedroom door", mat: "mdf", isStatic: false, grabbable: true, usable: "door" });
  // stand in front of the door (on -Z side), look at its free edge
  p.teleport({ x: -5.3, y: 1.65, z: 2.1 }, 0, 0.0);
  w.step(10);
  out.doorTarget = p.target ? { name: p.target.assemblyName, usable: p.target.usable, crosshair: p.crosshair } : null;
  const pulls0 = w.destruction.pulls.length;
  p.debugAction("grab");
  const doorGrab = p.holding === door;
  const ang = () => {
    const q = door.transformNode.rotationQuaternion!;
    const xAxis = new Vector3(1, 0, 0).applyRotationQuaternion(q);
    return (Math.atan2(-xAxis.z, xAxis.x) * 180) / Math.PI;
  };
  const a0 = ang();
  // walk backwards: pull the door open towards us
  key("KeyS", true);
  w.step(50);
  key("KeyS", false);
  w.step(10);
  const a1 = ang();
  const doorPulls = w.destruction.pulls.slice(pulls0).filter((q) => q.body === door);
  const maxF = doorPulls.reduce((m, q) => Math.max(m, q.force.length()), 0);
  out.door = {
    grabbed: doorGrab,
    angleBefore: r2(a0),
    angleAfter: r2(a1),
    swung: Math.abs(a1 - a0) > 15,
    pullCalls: doorPulls.length,
    maxPullForceN: r2(maxF),
    stillHolding: p.holding === door,
  };
  p.debugAction("grab");
  w.step(5);

  // ---------------------------------------------------------------- static cabinet: pull
  const cab = w.box("cabinet", [0.8, 0.7, 0.35], [-6, 1.6, -3], { color: new Color3(0.95, 0.95, 0.92) });
  w.destruction.register(cab, { name: "Wall cabinet", mat: "particleboard", isStatic: true, grabbable: true, usable: null });
  p.teleport({ x: -6, y: 1.65, z: -2.1 }, Math.PI, -0.05);
  w.step(10);
  const pulls1 = w.destruction.pulls.length;
  p.debugAction("grab");
  const cabGrab = p.holding === cab;
  w.step(10);
  const fStart = it.handForce;
  key("KeyS", true); // walk away from the cabinet
  const forces: number[] = [];
  let slippedAt = -1;
  for (let i = 0; i < 90; i++) {
    w.step(1);
    forces.push(it.handForce);
    if (p.holding !== cab && slippedAt < 0) slippedAt = i;
  }
  key("KeyS", false);
  const cabPulls = w.destruction.pulls.slice(pulls1).filter((q) => q.body === cab);
  out.cabinet = {
    grabbed: cabGrab,
    mode: cabGrab ? "static" : null,
    forceAtStart: r2(fStart),
    maxForce: r2(Math.max(...forces)),
    capped: Math.max(...forces) <= LIFT_FORCE + 1e-6,
    pullCalls: cabPulls.length,
    pullDirection: cabPulls.length ? v3(cabPulls[cabPulls.length - 1].force.normalizeToNew()) : null,
    slippedAtStep: slippedAt,
    dropEvents: w.log.drop.length,
  };

  // ---------------------------------------------------------------- slam
  const box2 = w.box("box2", [0.35, 0.25, 0.3], [0, 0.125, -5.2], { motion: PhysicsMotionType.DYNAMIC, mass: 12, color: new Color3(0.8, 0.8, 0.82) });
  w.destruction.register(box2, { name: "Microwave", mat: "steelSheet", isStatic: false, grabbable: true, usable: null });
  p.teleport({ x: 0, y: 1.65, z: -4.0 }, Math.PI, Math.atan2(1.65 - 0.125, 1.2));
  w.step(10);
  p.debugAction("grab");
  w.step(30);
  w.input.addLook(0, -350); // look up: lift it to chest height
  w.step(40);
  const heldY = box2.transformNode.position.y;
  p.debugAction("kick"); // F while holding = slam
  let minY = heldY;
  let maxSpeed = 0;
  const v = new Vector3();
  for (let i = 0; i < 12; i++) {
    w.step(1);
    box2.getLinearVelocityToRef(v);
    maxSpeed = Math.max(maxSpeed, v.length());
    minY = Math.min(minY, box2.transformNode.position.y);
  }
  out.slam = { held: p.holding === box2, heldY: r2(heldY), minY: r2(minY), maxSpeed: r2(maxSpeed) };
  w.step(30);

  // ---------------------------------------------------------------- standing on the held object → drop
  const plank = w.box("pallet", [1.2, 0.15, 1.2], [8, 0.075, -6], { motion: PhysicsMotionType.DYNAMIC, mass: 20, color: new Color3(0.6, 0.5, 0.3) });
  w.destruction.register(plank, { name: "Pallet", mat: "softwood", isStatic: false, grabbable: true, usable: null });
  p.teleport({ x: 8, y: 0.15 + 1.65 + 0.02, z: -6.2 }, 0, 1.2);
  w.step(20);
  const standingOn = p.support?.body === plank;
  p.debugAction("grab"); // try to grab what we stand on
  out.standOnHeld = { standingOn, grabbedWhileStanding: p.holding === plank };

  // ---------------------------------------------------------------- use
  const sw = w.box("switch", [0.08, 0.12, 0.02], [10, 1.1, 1.0], { color: new Color3(0.95, 0.95, 0.95) });
  w.destruction.register(sw, { name: "Light switch", mat: "plastic", isStatic: true, grabbable: false, usable: "switch" });
  p.teleport({ x: 10, y: 1.65, z: 0 }, 0, Math.atan2(1.65 - 1.1, 1.0));
  w.step(5);
  const u0 = w.destruction.uses.length;
  key("KeyE", true);
  w.step(1);
  key("KeyE", false);
  w.step(1);
  out.use = { calls: w.destruction.uses.length - u0, body: w.destruction.uses.length > u0 ? (w.destruction.uses[w.destruction.uses.length - 1].body === sw ? "switch" : "other") : null };

  out.nan = [p.position.x, p.position.y, p.position.z].some((x) => !Number.isFinite(x));
  return out;
}
