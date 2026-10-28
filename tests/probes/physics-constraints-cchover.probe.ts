// Character controller: hover height after landing (keepDistance/keepContactTolerance), jump with grace, ledges and ramps.
import { Vector3, Quaternion, PhysicsMotionType, CharacterSupportedState } from "@babylonjs/core";
import { makeWorld, makeBox, stepN, r3, v3, newHavok, type CWorld } from "./physics-constraints-util.ts";
import { FpsMover, type MoveInput } from "./physics-constraints-ccutil.ts";

const DT = 1 / 60;
const idle: MoveInput = { forward: 0, right: 0, yaw: 0, speed: 0, jump: false };

async function world(): Promise<CWorld> {
  const w = await makeWorld(await newHavok());
  makeBox(w.scene, "floor", new Vector3(40, 0.2, 40), new Vector3(0, -0.1, 0), { motion: PhysicsMotionType.STATIC });
  return w;
}

export async function probe() {
  const out: Record<string, unknown> = {};
  // rest height vs drop height and settings
  const rest: unknown[] = [];
  for (const [kd, tol] of [[0.05, 0.1], [0.02, 0.03], [0.01, 0.02]]) {
    for (const drop of [0.0, 0.03, 0.08, 0.12, 0.3, 1.0]) {
      const w = await world();
      const m = new FpsMover(w.scene, new Vector3(0, kd + drop, 0));
      m.cc.keepDistance = kd; m.cc.keepContactTolerance = tol;
      for (let k = 0; k < 90; k++) { m.step(DT, idle); stepN(w.scene, 1); }
      rest.push({ keepDistance: kd, tol, startFeet: r3(kd + drop), restFeet: r3(m.feetY), state: m.support.supportedState });
      m.cc.dispose(); w.dispose();
    }
  }
  out.restHeight = rest;

  // jump with grace + walking jump, then walking off a 0.3 m ledge and down a 20 deg ramp
  for (const [kd, tol] of [[0.05, 0.1], [0.02, 0.03]]) {
    const w = await world();
    makeBox(w.scene, "platform", new Vector3(4, 0.3, 4), new Vector3(0, 0.15, 10), { motion: PhysicsMotionType.STATIC });
    // ramp 20 deg going down along +X from the platform... separate: ramp from y=0.3 at x=2 down to 0 at x=2+0.82
    const ang = 20 * Math.PI / 180;
    makeBox(w.scene, "ramp", new Vector3(3, 0.1, 2), new Vector3(10, 0.5, 0), { motion: PhysicsMotionType.STATIC, rot: Quaternion.RotationAxis(new Vector3(0, 0, 1), -ang) });
    const m = new FpsMover(w.scene, new Vector3(0, kd, 0));
    m.cc.keepDistance = kd; m.cc.keepContactTolerance = tol;
    for (let k = 0; k < 30; k++) { m.step(DT, idle); stepN(w.scene, 1); }
    const y0 = m.feetY;
    m.step(DT, { ...idle, jump: true }); stepN(w.scene, 1);
    let apex = 0, air = 0;
    for (let k = 0; k < 90; k++) { m.step(DT, idle); stepN(w.scene, 1); apex = Math.max(apex, m.feetY - y0); if (!m.grounded) air++; }
    // running jump forward
    const p0 = m.cc.getPosition().clone();
    for (let k = 0; k < 30; k++) { m.step(DT, { forward: 1, right: 0, yaw: Math.PI, speed: 6, jump: false }); stepN(w.scene, 1); }
    m.step(DT, { forward: 1, right: 0, yaw: Math.PI, speed: 6, jump: true }); stepN(w.scene, 1);
    let air2 = 0, apex2 = 0; const yb = m.feetY;
    for (let k = 0; k < 60; k++) { m.step(DT, { forward: 1, right: 0, yaw: Math.PI, speed: 6, jump: false }); stepN(w.scene, 1); apex2 = Math.max(apex2, m.feetY - yb); if (!m.grounded) air2++; }
    // walk onto the platform? (0.3 m high -> blocked without step-up) then teleport onto it and walk off the edge
    m.cc.setPosition(new Vector3(0, 0.3 + kd + 0.9, 10));
    m.cc.setVelocity(Vector3.Zero());
    for (let k = 0; k < 20; k++) { m.step(DT, idle); stepN(w.scene, 1); }
    const onPlat = m.feetY;
    const ledge: number[] = []; let ledgeAir = 0;
    for (let k = 0; k < 90; k++) { m.step(DT, { forward: 1, right: 0, yaw: 0, speed: 3.6, jump: false }); stepN(w.scene, 1); if (k % 6 === 0) ledge.push(r3(m.feetY)); if (!m.grounded) ledgeAir++; }
    // ramp: start on top of the ramp area walking down (+X), record grounded fraction
    m.cc.setPosition(new Vector3(8.8, 1.5, 0));
    m.cc.setVelocity(Vector3.Zero());
    for (let k = 0; k < 40; k++) { m.step(DT, idle); stepN(w.scene, 1); }
    const rampStart = m.cc.getPosition().clone();
    let rampAir = 0; const rampY: number[] = [];
    for (let k = 0; k < 40; k++) { m.step(DT, { forward: 1, right: 0, yaw: Math.PI / 2, speed: 3.6, jump: false }); stepN(w.scene, 1); if (!m.grounded) rampAir++; if (k % 5 === 0) rampY.push(r3(m.feetY)); }
    out[`moves_kd${kd}_tol${tol}`] = {
      standingJump: { apex: r3(apex), airSteps: air },
      runningJump: { apex: r3(apex2), airSteps: air2, travelled: v3(m.cc.getPosition().subtract(p0)) },
      platform: { feetOnPlatform: r3(onPlat), walkOffFeetY: ledge, airSteps: ledgeAir },
      rampDown20deg: { start: v3(rampStart), airSteps: rampAir, feetY: rampY, end: v3(m.cc.getPosition()) },
    };
    m.cc.dispose(); w.dispose();
  }

  // landing: does the character land at keepDistance after a real fall (cast-based) ?
  {
    const w = await world();
    const m = new FpsMover(w.scene, new Vector3(0, 2, 0));
    const states: number[] = [];
    for (let k = 0; k < 90; k++) { m.step(DT, idle); stepN(w.scene, 1); if (k > 20 && k < 50) states.push(m.support.supportedState); }
    out.fall2m = { restFeet: r3(m.feetY), stateCounts: { sup: states.filter((s) => s === CharacterSupportedState.SUPPORTED).length, uns: states.filter((s) => s === CharacterSupportedState.UNSUPPORTED).length } };
    m.cc.dispose(); w.dispose();
  }
  return out;
}
