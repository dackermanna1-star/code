// Character controller vs dynamic bodies: pushing (strength), step-up (maxStepHeight), debris layer filter,
// standing on a dynamic body (characterMass, support info), jumping off it, a box dropped on the head, trigger observable.
import { Vector3, PhysicsMotionType, HingeConstraint, CharacterSupportedState, type PhysicsBody } from "@babylonjs/core";
import { makeWorld, makeBox, stepN, relAngle, r3, v3, deg, newHavok, type CWorld } from "./physics-constraints-util.ts";
import { FpsMover, supportContacts, characterBody, type MoveInput } from "./physics-constraints-ccutil.ts";

const DT = 1 / 60;
const L = { STATIC: 1, DYNAMIC: 2, DEBRIS: 4, PLAYER: 8, HELD: 16 };
const idle: MoveInput = { forward: 0, right: 0, yaw: 0, speed: 0, jump: false };
const walk: MoveInput = { forward: 1, right: 0, yaw: 0, speed: 3.6, jump: false };

async function world(): Promise<CWorld> {
  const w = await makeWorld(await newHavok());
  makeBox(w.scene, "floor", new Vector3(40, 0.2, 40), new Vector3(0, -0.1, 0), { motion: PhysicsMotionType.STATIC, friction: 0.5, membership: L.STATIC });
  return w;
}

function run(w: CWorld, m: FpsMover, n: number, inp: MoveInput, after?: () => void) {
  for (let k = 0; k < n; k++) { m.step(DT, inp); stepN(w.scene, 1); after?.(); }
}

export async function probe() {
  const out: Record<string, unknown> = {};

  // ---------- pushing boxes
  for (const [strength, cmass] of [[1e38, 0], [600, 80]]) {
    for (const mass of [2, 200]) {
      const w = await world();
      const size = mass === 2 ? 0.4 : 0.8;
      const box = makeBox(w.scene, "box", new Vector3(size, size, size), new Vector3(0, size / 2, 2), { mass, friction: 0.5 });
      const m = new FpsMover(w.scene, new Vector3(0, 0.05, 0));
      m.cc.characterStrength = strength; m.cc.characterMass = cmass;
      let pushes = 0, maxImp = 0;
      m.cc.onTriggerCollisionObservable.add((e) => { pushes++; maxImp = Math.max(maxImp, e.impulse.length()); });
      run(w, m, 20, idle);
      run(w, m, 180, walk);
      out[`push_${mass}kg_strength${strength > 1e30 ? "default" : strength}`] = {
        boxMoved: r3(box.transformNode.position.z - 2), charZ: r3(m.cc.getPosition().z), charSpeedEnd: r3(m.cc.getVelocity().length()),
        boxSpeed: r3(box.getLinearVelocity().length()), observableCalls: pushes, maxImpulseNs: r3(maxImp),
      };
      m.cc.dispose(); w.dispose();
    }
  }

  // ---------- step-up over static slabs
  for (const msh of [0, 0.35]) {
    const res: Record<string, unknown> = {};
    for (const h of [0.03, 0.05, 0.1, 0.2, 0.35, 0.5]) {
      const w = await world();
      makeBox(w.scene, "slab", new Vector3(3, h, 1), new Vector3(0, h / 2, 2), { motion: PhysicsMotionType.STATIC, membership: L.STATIC });
      const m = new FpsMover(w.scene, new Vector3(0, 0.05, 0));
      m.cc.maxStepHeight = msh;
      run(w, m, 20, idle);
      let maxFeet = -1;
      run(w, m, 120, walk, () => { maxFeet = Math.max(maxFeet, m.feetY); });
      res[`h${h}`] = { finalZ: r3(m.cc.getPosition().z), maxFeetY: r3(maxFeet), crossed: m.cc.getPosition().z > 3 };
      m.cc.dispose(); w.dispose();
    }
    out[`stepUp_maxStepHeight${msh}`] = res;
  }

  // ---------- small DYNAMIC debris on the floor: default masks vs layer-filtered capsule
  for (const filtered of [false, true]) {
    const w = await world();
    const debris: PhysicsBody[] = [];
    for (let i = 0; i < 5; i++) debris.push(makeBox(w.scene, "deb" + i, new Vector3(0.3, 0.05, 0.2), new Vector3((i - 2) * 0.12, 0.025, 1.5 + i * 0.25), { mass: 1.5, membership: L.DEBRIS, collide: L.STATIC | L.DYNAMIC | L.DEBRIS | (filtered ? 0 : L.PLAYER) }));
    const m = new FpsMover(w.scene, new Vector3(0, 0.05, 0));
    if (filtered) { m.cc.shape.filterMembershipMask = L.PLAYER; m.cc.shape.filterCollideMask = L.STATIC | L.DYNAMIC; }
    m.cc.maxStepHeight = 0.35;
    run(w, m, 20, idle);
    const d0 = debris.map((d) => d.transformNode.position.clone());
    let maxFeet = -1;
    run(w, m, 120, walk, () => { maxFeet = Math.max(maxFeet, m.feetY); });
    out[`debris_${filtered ? "filtered" : "defaultMasks"}`] = {
      finalZ: r3(m.cc.getPosition().z), maxFeetY: r3(maxFeet),
      debrisMoved: debris.map((d, i) => r3(d.transformNode.position.subtract(d0[i]).length())),
    };
    m.cc.dispose(); w.dispose();
  }

  // ---------- standing on a dynamic crate; jumping off it; support info
  {
    const w = await world();
    const crate = makeBox(w.scene, "crate", new Vector3(0.8, 0.6, 0.8), new Vector3(0, 0.3, 0), { mass: 50, friction: 0.6 });
    const m = new FpsMover(w.scene, new Vector3(0, 0.62, 0));
    m.cc.characterMass = 80;
    run(w, m, 60, idle);
    const sc = supportContacts(m.cc);
    const info = {
      state: m.support.supportedState, isSurfaceDynamic: m.support.isSurfaceDynamic, surfaceVel: v3(m.support.averageSurfaceVelocity),
      feetY: r3(m.feetY), supportBodies: sc.map((c) => ({ name: c.body.transformNode.name, point: v3(c.point), normalY: r3(c.normal.y) })),
    };
    // crate pushed sideways while standing on it: does the character ride along?
    crate.applyImpulse(new Vector3(50 * 2, 0, 0), crate.transformNode.position); // 2 m/s
    run(w, m, 20, idle);
    const ride = { crateX: r3(crate.transformNode.position.x), charX: r3(m.cc.getPosition().x), surfaceVel: v3(m.support.averageSurfaceVelocity), isDyn: m.support.isSurfaceDynamic };
    run(w, m, 60, idle);
    const y0 = m.feetY;
    m.step(DT, { ...idle, jump: true }); stepN(w.scene, 1);
    let apex = 0;
    run(w, m, 70, idle, () => { apex = Math.max(apex, m.feetY - y0); });
    out.standOnCrate = { info, ride, jumpApexFromCrate: r3(apex), finalFeetY: r3(m.feetY), crateY: r3(crate.transformNode.position.y) };
    m.cc.dispose(); w.dispose();
  }

  // ---------- seesaw: does characterMass load dynamic bodies?
  for (const cmass of [0, 80]) {
    const w = await world();
    const pivot = makeBox(w.scene, "pivot", new Vector3(0.2, 0.5, 0.2), new Vector3(0, 0.25, 0), { motion: PhysicsMotionType.STATIC });
    const plank = makeBox(w.scene, "plank", new Vector3(4, 0.06, 0.8), new Vector3(0, 0.53, 0), { mass: 20 });
    const h = new HingeConstraint(new Vector3(0, 0.25, 0), new Vector3(0, -0.03, 0), new Vector3(0, 0, 1), new Vector3(0, 0, 1), w.scene);
    pivot.addConstraint(plank, h);
    const m = new FpsMover(w.scene, new Vector3(1.5, 0.62, 0));
    m.cc.characterMass = cmass;
    run(w, m, 120, idle);
    out[`seesaw_characterMass${cmass}`] = { plankTiltDeg: deg(relAngle(pivot, plank, new Vector3(0, 0, 1), new Vector3(1, 0, 0))), charFeetY: r3(m.feetY), state: m.support.supportedState };
    m.cc.dispose(); w.dispose();
  }

  // ---------- box dropped on the character's head; character's own body in raycasts
  {
    const w = await world();
    const m = new FpsMover(w.scene, new Vector3(0, 0.05, 0));
    run(w, m, 20, idle);
    const box = makeBox(w.scene, "falling", new Vector3(0.3, 0.3, 0.3), new Vector3(0, 3, 0), { mass: 10 });
    box.setCollisionCallbackEnabled(true);
    let hits = 0;
    box.getCollisionObservable().add((e) => { if (e.collidedAgainst === characterBody(m.cc) || e.collider === characterBody(m.cc)) hits++; });
    run(w, m, 60, idle);
    const restY = box.transformNode.position.y;
    run(w, m, 60, walk);
    const pe = w.phys;
    const ray = pe.raycast(new Vector3(0, 0.9, -2), new Vector3(0, 0.9, 5));
    out.boxOnHead = {
      boxRestY: r3(restY), headTop: r3(m.cc.getPosition().y + 0.9), eventsWithCharBody: hits,
      afterWalking1s: { box: v3(box.transformNode.position), char: v3(m.cc.getPosition()) },
      rayHitsCharBody: ray.hasHit ? ray.body === characterBody(m.cc) : false,
    };
    m.cc.dispose(); w.dispose();
  }
  return out;
}
