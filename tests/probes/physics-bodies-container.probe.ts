// Q3 (PhysicsShapeContainer live edits), Q7 (collision filtering)
import {
  Vector3, Quaternion, TransformNode, PhysicsBody, PhysicsMotionType, PhysicsShape, PhysicsShapeBox, PhysicsShapeContainer,
  MeshBuilder, type PhysicsMassProperties,
} from "@babylonjs/core";
import { makeWorld, stepN, r3, v3 } from "./physics-bodies-util";

export async function probe() {
  const out: Record<string, unknown> = {};
  const { scene, hk } = await makeWorld();
  const pe = scene.getPhysicsEngine()!;
  const unit = (s = 1) => new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(s, s, s), scene);
  const mp = (p: PhysicsMassProperties) => ({ mass: r3(p.mass!), com: v3(p.centerOfMass!), inertia: v3(p.inertia!) });
  const rayDown = (x: number, z: number) => {
    const r = pe.raycast(new Vector3(x, 10, z), new Vector3(x, -10, z));
    return r.hasHit ? r3(r.hitPointWorld.y) : null;
  };

  // ---------------- Q3: container live edits ----------------
  {
    const c = new PhysicsShapeContainer(scene);
    const left = unit(), right = unit();
    c.addChild(left, new Vector3(-1, 0, 0));
    c.addChild(right, new Vector3(1, 0, 0));
    const tn = new TransformNode("cont", scene);
    tn.position.set(0, 0, 0);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
    b.shape = c;
    b.setGravityFactor(0);
    const before = { mass: mp(b.getMassProperties()), rayRight: rayDown(1, 0), n: c.getNumChildren() };
    const childIdsBefore = [0, 1].map((i) => String(hk.HP_Shape_GetChildShape(c._pluginData, i)[1][0]));
    c.removeChild(1);
    const afterRemove = { mass: mp(b.getMassProperties()), rayRight: rayDown(1, 0), rayLeft: rayDown(-1, 0), n: c.getNumChildren() };
    stepN(scene, 1);
    const afterRemoveAndStep = { mass: mp(b.getMassProperties()), rayRight: rayDown(1, 0) };
    b.shape = c; // re-assign same container
    const afterReassign = { mass: mp(b.getMassProperties()), rayRight: rayDown(1, 0) };
    // add a child after assignment
    const far = unit();
    c.addChild(far, new Vector3(0, 0, 3));
    const afterAdd = { mass: mp(b.getMassProperties()), rayFar: rayDown(0, 3), n: c.getNumChildren() };
    stepN(scene, 1);
    const afterAddStep = { rayFar: rayDown(0, 3) };
    b.shape = c;
    const afterAddReassign = { mass: mp(b.getMassProperties()), rayFar: rayDown(0, 3) };
    // index shifting
    const c2 = new PhysicsShapeContainer(scene);
    const kids = [unit(), unit(), unit()];
    kids.forEach((k, i) => c2.addChild(k, new Vector3(i * 2, 0, 0)));
    c2.removeChild(0);
    const idsAfter = [0, 1].map((i) => String(hk.HP_Shape_GetChildShape(c2._pluginData, i)[1][0]));
    out.q3_container_live = {
      before, childIdsBefore, afterRemove, afterRemoveAndStep, afterReassign, afterAdd, afterAddStep, afterAddReassign,
      removeIndex0_remainingChildIds: idsAfter, expectedIfShift: [String(kids[1]._pluginData[0]), String(kids[2]._pluginData[0])],
    };
    b.dispose(); tn.dispose();
  }
  // child scale + addChildFromParent
  {
    const c = new PhysicsShapeContainer(scene);
    c.addChild(unit(), new Vector3(0, 0, 0), Quaternion.Identity(), new Vector3(2, 1, 1));
    const bbScaled = c.getBoundingBox();
    const parentNode = new TransformNode("pn", scene);
    parentNode.position.set(10, 0, 0);
    const childMesh = MeshBuilder.CreateBox("cm", { size: 1 }, scene);
    childMesh.parent = parentNode;
    childMesh.position.set(0, 2, 0);
    childMesh.rotation.z = Math.PI / 2;
    const c2 = new PhysicsShapeContainer(scene);
    c2.addChildFromParent(parentNode, unit(), childMesh);
    const bb2 = c2.getBoundingBox();
    out.q3_childScale_and_addChildFromParent = {
      scaled2x1x1: { min: v3(bbScaled.minimum), max: v3(bbScaled.maximum) },
      fromParent_child_at_0_2_0: { min: v3(bb2.minimum), max: v3(bb2.maximum) },
      extraHpFunctionsAtRuntime: ["HP_Shape_GetChildQSTransform", "HP_Shape_SetChildQSTransform", "HP_Body_GetWorld", "HP_Shape_CastRay", "HP_World_GetGravity", "HP_Shape_PathIterator_GetNext"].filter((f) => typeof (hk as unknown as Record<string, unknown>)[f] === "function"),
    };
  }
  // rebuild cost: 50 children container, rebuild without one child
  {
    const kids: PhysicsShape[] = [];
    for (let i = 0; i < 50; i++) kids.push(unit(0.2));
    const build = (skip: number) => {
      const c = new PhysicsShapeContainer(scene);
      for (let i = 0; i < kids.length; i++) if (i !== skip) c.addChild(kids[i], new Vector3((i % 10) * 0.2, Math.floor(i / 10) * 0.2, 0));
      return c;
    };
    const tn = new TransformNode("big", scene);
    tn.position.set(0, 5, 20);
    const b = new PhysicsBody(tn, PhysicsMotionType.DYNAMIC, false, scene);
    let c = build(-1);
    b.shape = c;
    const t0 = performance.now();
    const N = 50;
    for (let k = 0; k < N; k++) {
      const nc = build(k % 50);
      b.shape = nc;
      c.dispose(); // old container (children are shared and stay alive)
      c = nc;
    }
    const tRebuild = (performance.now() - t0) / N;
    const t1 = performance.now();
    for (let k = 0; k < N; k++) { c.removeChild(0); c.addChild(kids[0], Vector3.Zero()); b.shape = c; }
    const tEditReassign = (performance.now() - t1) / N;
    out.q3_rebuildCost_ms = { newContainer50children_plus_assign: r3(tRebuild), removeAdd_plus_reassignSame: r3(tEditReassign), massAfter: mp(b.getMassProperties()) };
    b.dispose(); tn.dispose();
  }

  // ---------------- Q7: filtering ----------------
  {
    const WORLD = 1, PLAYER = 2, DEBRIS = 4;
    const ground = new PhysicsBody(new TransformNode("ground", scene), PhysicsMotionType.STATIC, false, scene);
    const gs = new PhysicsShapeBox(new Vector3(0, -0.5, 0), Quaternion.Identity(), new Vector3(200, 1, 200), scene);
    gs.filterMembershipMask = WORLD; // collide mask stays ~0 (all)
    ground.shape = gs;
    const mkBox = (name: string, x: number, y: number, size: number, motion: PhysicsMotionType, membership: number, collide: number) => {
      const tn = new TransformNode(name, scene);
      tn.position.set(x, y, 50);
      const b = new PhysicsBody(tn, motion, false, scene);
      const s = unit(size);
      s.filterMembershipMask = membership;
      s.filterCollideMask = collide;
      b.shape = s;
      return { tn, b, s };
    };
    // player: a 1 m static-ish (dynamic) block standing on the ground
    const player = mkBox("player", 0, 0.5, 1, PhysicsMotionType.DYNAMIC, PLAYER, WORLD | PLAYER);
    // debris that should ignore the player but land on the world
    const debris = mkBox("debris", 0, 3, 0.3, PhysicsMotionType.DYNAMIC, DEBRIS, WORLD | DEBRIS);
    // asymmetric: debris2 wants to hit player, player does not want debris
    const player2 = mkBox("player2", 5, 0.5, 1, PhysicsMotionType.DYNAMIC, PLAYER, WORLD | PLAYER);
    const debris2 = mkBox("debris2", 5, 3, 0.3, PhysicsMotionType.DYNAMIC, DEBRIS, WORLD | DEBRIS | PLAYER);
    // control: default masks collide with player
    const debris3 = mkBox("debris3", 10, 3, 0.3, PhysicsMotionType.DYNAMIC, -1, -1);
    const player3 = mkBox("player3", 10, 0.5, 1, PhysicsMotionType.DYNAMIC, PLAYER, -1);
    // debris vs debris still collide: drop debris4 on top of debris (after it lands)
    // container: membership set only on container vs only on children
    const contOnly = new PhysicsShapeContainer(scene);
    contOnly.addChild(unit(0.3));
    contOnly.filterMembershipMask = DEBRIS;
    contOnly.filterCollideMask = WORLD | DEBRIS;
    const player4 = mkBox("player4", 15, 0.5, 1, PhysicsMotionType.DYNAMIC, PLAYER, WORLD | PLAYER);
    const tnC = new TransformNode("contOnly", scene); tnC.position.set(15, 3, 50);
    const bC = new PhysicsBody(tnC, PhysicsMotionType.DYNAMIC, false, scene); bC.shape = contOnly;
    const childOnly = new PhysicsShapeContainer(scene);
    const ch = unit(0.3); ch.filterMembershipMask = DEBRIS; ch.filterCollideMask = WORLD | DEBRIS;
    childOnly.addChild(ch);
    const player5 = mkBox("player5", 20, 0.5, 1, PhysicsMotionType.DYNAMIC, PLAYER, WORLD | PLAYER);
    const tnC2 = new TransformNode("childOnly", scene); tnC2.position.set(20, 3, 50);
    const bC2 = new PhysicsBody(tnC2, PhysicsMotionType.DYNAMIC, false, scene); bC2.shape = childOnly;
    stepN(scene, 120);
    const debris4 = mkBox("debris4", 0, 2, 0.3, PhysicsMotionType.DYNAMIC, DEBRIS, WORLD | DEBRIS);
    stepN(scene, 120);
    // raycast filtering
    const rayAll = pe.raycast(new Vector3(0, 10, 50), new Vector3(0, -10, 50));
    const rayWorldOnly = pe.raycast(new Vector3(0, 10, 50), new Vector3(0, -10, 50), { collideWith: WORLD });
    const rayMemberPlayer = pe.raycast(new Vector3(0, 10, 50), new Vector3(0, -10, 50), { membership: PLAYER });
    out.q7_filter = {
      debrisY_expected015_onGround: r3(debris.tn.position.y),
      playerY_expected05: r3(player.tn.position.y),
      debris4Y_expected045_onDebris: r3(debris4.tn.position.y),
      asymmetric_debris2Y: r3(debris2.tn.position.y),
      control_debris3Y_expected115_onPlayer: r3(debris3.tn.position.y),
      containerMaskOnly_Y: r3(tnC.position.y),
      childMaskOnly_Y: r3(tnC2.position.y),
      masksReadBack: { membership: debris.s.filterMembershipMask, collide: debris.s.filterCollideMask },
      raycast: {
        all_hitY: rayAll.hasHit ? r3(rayAll.hitPointWorld.y) : null, all_body: rayAll.body?.transformNode.name,
        collideWithWORLD_hitY: rayWorldOnly.hasHit ? r3(rayWorldOnly.hitPointWorld.y) : null, collideWithWORLD_body: rayWorldOnly.body?.transformNode.name,
        membershipPLAYER_body: rayMemberPlayer.body?.transformNode.name,
        resultShapeDefined: rayAll.shape !== undefined,
      },
    };
    void player2; void player3; void player4; void player5;
  }
  return out;
}
