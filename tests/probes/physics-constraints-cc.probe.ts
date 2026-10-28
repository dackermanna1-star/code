// PhysicsCharacterController basics: defaults, rest height, walk direction/speed, jump apex, crouch, update ordering, cost.
import { Vector3, CharacterSupportedState, PhysicsMotionType, PhysicsCharacterController, type Observer, type Scene } from "@babylonjs/core";
import { makeWorld, makeBox, stepN, r3, v3, newHavok, type CWorld } from "./physics-constraints-util.ts";
import { FpsMover, characterBody, type MoveInput } from "./physics-constraints-ccutil.ts";

const DT = 1 / 60;

async function world(): Promise<CWorld> {
  const w = await makeWorld(await newHavok());
  makeBox(w.scene, "floor", new Vector3(40, 0.2, 40), new Vector3(0, -0.1, 0), { motion: PhysicsMotionType.STATIC });
  return w;
}

function drive(w: CWorld, m: FpsMover, order: "before" | "after", inputAt: (i: number) => MoveInput): { stop(): void; steps(): number } {
  let i = 0;
  const cb = () => { m.step(DT, inputAt(i)); i++; };
  const obs: Observer<Scene> = order === "before" ? w.scene.onBeforePhysicsObservable.add(cb) : w.scene.onAfterPhysicsObservable.add(cb);
  return { stop: () => (order === "before" ? w.scene.onBeforePhysicsObservable : w.scene.onAfterPhysicsObservable).remove(obs), steps: () => i };
}

const idle: MoveInput = { forward: 0, right: 0, yaw: 0, speed: 0, jump: false };

export async function probe() {
  const out: Record<string, unknown> = {};

  // defaults
  {
    const w = await world();
    const cc = new PhysicsCharacterController(new Vector3(0, 1, 0), {}, w.scene);
    const body = characterBody(cc);
    out.defaults = {
      keepDistance: cc.keepDistance, keepContactTolerance: cc.keepContactTolerance, maxCastIterations: cc.maxCastIterations,
      penetrationRecoverySpeed: cc.penetrationRecoverySpeed, staticFriction: cc.staticFriction, dynamicFriction: cc.dynamicFriction,
      maxSlopeCosine: cc.maxSlopeCosine, maxStepHeight: cc.maxStepHeight, footOffset: cc.footOffset, maxCharacterSpeedForSolver: cc.maxCharacterSpeedForSolver,
      up: v3(cc.up), characterStrength: cc.characterStrength, acceleration: cc.acceleration, maxAcceleration: cc.maxAcceleration, characterMass: cc.characterMass,
      shapeOptions: cc.shapeOptions, shapeType: cc.shape.type,
      body: { motion: body.getMotionType(), disablePreStep: body.disablePreStep, nodeName: body.transformNode.name, mass: body.getMassProperties().mass, inertia: v3(body.getMassProperties().inertia!) },
      getPositionIsSameObject: cc.getPosition() === cc.getPosition(),
      shapeFilter: { membership: cc.shape.filterMembershipMask, collide: cc.shape.filterCollideMask },
    };
    cc.dispose();
    w.dispose();
  }

  // rest height + walk + jump, both update orders
  for (const order of ["after", "before"] as const) {
    const w = await world();
    const m = new FpsMover(w.scene, new Vector3(0, 0.3, 0)); // feet 30 cm above floor
    let input: MoveInput = idle;
    const d = drive(w, m, order, () => input);
    stepN(w.scene, 60);
    const restY: number[] = [];
    for (let k = 0; k < 30; k++) { stepN(w.scene, 1); restY.push(m.feetY); }
    const rest = { feetY: r3(m.feetY), feetYJitterMm: r3((Math.max(...restY) - Math.min(...restY)) * 1000), state: m.support.supportedState, normal: v3(m.support.averageSurfaceNormal), vel: v3(m.cc.getVelocity()) };
    // walk forward (yaw 0 => +Z) at 3.6 m/s for 2 s
    const p0 = m.cc.getPosition().clone();
    input = { forward: 1, right: 0, yaw: 0, speed: 3.6, jump: false };
    const speeds: number[] = [];
    for (let k = 0; k < 120; k++) { stepN(w.scene, 1); if (k % 10 === 9) speeds.push(r3(m.cc.getVelocity().length())); }
    const walked = m.cc.getPosition().subtract(p0);
    // strafe right with yaw = 90 deg (looking +X): right = -Z
    input = { forward: 0, right: 1, yaw: Math.PI / 2, speed: 3.6, jump: false };
    const p1 = m.cc.getPosition().clone();
    stepN(w.scene, 60);
    const strafe = m.cc.getPosition().subtract(p1);
    // stop
    input = idle;
    stepN(w.scene, 30);
    const stopV = m.cc.getVelocity().length();
    // jump
    const jy0 = m.feetY;
    input = { ...idle, jump: true };
    stepN(w.scene, 1);
    input = idle;
    let apex = -1, airSteps = 0, landed = -1;
    for (let k = 0; k < 120; k++) {
      stepN(w.scene, 1);
      apex = Math.max(apex, m.feetY - jy0);
      if (m.support.supportedState !== CharacterSupportedState.SUPPORTED) airSteps++;
      else if (airSteps > 0 && landed < 0) landed = k;
    }
    d.stop();
    out[`move_${order}Physics`] = {
      rest, walked2s: v3(walked), speedsEvery10: speeds, strafeRightYaw90_1s: v3(strafe), speedAfterStop0_5s: r3(stopV),
      jump: { apexM: r3(apex), airSteps, landedAtStep: landed, feetYAfter: r3(m.feetY) },
      nodeVsPosition: v3(characterBody(m.cc).transformNode.position.subtract(m.cc.getPosition())),
    };
    m.cc.dispose();
    w.dispose();
  }

  // crouch: setShapeOptions at runtime, pass under a 1.3 m beam, stand-up check
  {
    const w = await world();
    // beam: bottom at y = 1.3, spans z 2..3
    makeBox(w.scene, "beam", new Vector3(4, 0.4, 1), new Vector3(0, 1.5, 2.5), { motion: PhysicsMotionType.STATIC });
    const m = new FpsMover(w.scene, new Vector3(0, 0.05, 0));
    let input: MoveInput = idle;
    const d = drive(w, m, "after", () => input);
    stepN(w.scene, 30);
    input = { forward: 1, right: 0, yaw: 0, speed: 2, jump: false };
    stepN(w.scene, 120);
    const standingZ = m.cc.getPosition().z;
    // crouch
    input = idle; stepN(w.scene, 10);
    const yBefore = m.cc.getPosition().y, feetBefore = m.feetY;
    m.cc.setShapeOptions({ capsuleHeight: 1.1, capsuleRadius: 0.3 });
    const yAfter = m.cc.getPosition().y;
    stepN(w.scene, 10);
    const crouchFeet = m.feetY;
    input = { forward: 1, right: 0, yaw: 0, speed: 1.6, jump: false };
    stepN(w.scene, 60);
    const underZ = m.cc.getPosition().z;
    input = idle; stepN(w.scene, 10);
    // headroom test before standing up: cast the standing capsule upward (proximity) using the plugin
    const standCheckPos = m.cc.getPosition().add(new Vector3(0, (1.8 - 1.1) / 2, 0));
    // try to stand up anyway under the beam
    m.cc.setShapeOptions({ capsuleHeight: 1.8, capsuleRadius: 0.3 });
    const ys: number[] = [];
    for (let k = 0; k < 30; k++) { stepN(w.scene, 1); ys.push(r3(m.cc.getPosition().y)); }
    d.stop();
    out.crouch = {
      standingBlockedAtZ: r3(standingZ), expectBlockedNear: "beam face z=2 minus radius 0.3 minus keepDistance => ~1.65",
      setShapeOptions: { centerYBefore: r3(yBefore), centerYAfter: r3(yAfter), feetBefore: r3(feetBefore), feetAfterSettle: r3(crouchFeet), footOffsetNow: m.cc.footOffset },
      crouchedReachedZ: r3(underZ),
      standUpUnderBeam_centerY: ys.filter((_, k) => k % 5 === 0), standCheckPos: v3(standCheckPos),
    };
    m.cc.dispose();
    w.dispose();
  }

  // cost per controller step (walking on a floor with 50 boxes around)
  {
    const w = await world();
    for (let i = 0; i < 50; i++) makeBox(w.scene, "box" + i, new Vector3(0.5, 0.5, 0.5), new Vector3((i % 10) * 1.2 - 6, 0.25, 4 + Math.floor(i / 10) * 1.2), { mass: 10 });
    const m = new FpsMover(w.scene, new Vector3(0, 0.05, 0));
    stepN(w.scene, 10);
    const input: MoveInput = { forward: 1, right: 0.3, yaw: 0, speed: 3.6, jump: false };
    const t0 = performance.now();
    for (let k = 0; k < 300; k++) m.step(DT, input);
    const tCC = (performance.now() - t0) / 300;
    const t1 = performance.now();
    stepN(w.scene, 300);
    out.cost = { msPerControllerStep: r3(tCC), msPerHavokStepWith50Boxes: r3((performance.now() - t1) / 300), note: "controller steps here run without Havok steps in between (pure query cost)" };
    m.cc.dispose();
    w.dispose();
  }
  return out;
}
