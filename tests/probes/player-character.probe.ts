// Character controller probe: spawn/settle, walk / sprint / crouch speeds, jump apex, step-up
// (0.15 m climbs, 0.5 m blocks), crouch under a low ceiling (can't stand up), slopes (30° walk,
// 60° slide), stomp detection when landing on a destructible body, footsteps + debris crunch,
// pushing loose furniture, and the camera eye height.
import { PhysicsMotionType, Quaternion, Vector3, Color3 } from "@babylonjs/core";
import { Layer } from "../../src/core/context.ts";
import { PlayerCore, PLAYER } from "../../src/player/playerCore.ts";
import { makeWorld, key, r2, r3, v3 } from "./player-util.ts";

export async function probe() {
  const w = await makeWorld();
  const out: Record<string, unknown> = {};
  // floor (top at y = 0) and obstacles
  w.box("floor", [40, 0.2, 40], [0, -0.1, 0]);
  w.box("step15", [1.2, 0.15, 1.2], [0, 0.075, 6]); // 15 cm step, ahead on +Z
  w.box("block50", [3, 0.5, 1], [6, 0.25, 4]); // 50 cm block (x lane 6)
  w.box("ceiling", [3, 0.2, 3], [-6, 1.5, 4]); // underside at y = 1.4 (x lane -6)
  w.box("ceilPostA", [0.2, 1.4, 0.2], [-7.4, 0.7, 2.6]);
  const rampRot30 = Quaternion.RotationAxis(new Vector3(1, 0, 0), (-30 * Math.PI) / 180);
  w.box("ramp30", [2, 0.2, 6], [12, 1.4, 6], { rot: rampRot30 });
  const rampRot60 = Quaternion.RotationAxis(new Vector3(1, 0, 0), (-60 * Math.PI) / 180);
  w.box("ramp60", [2, 0.2, 4], [-12, 1.6, 4], { rot: rampRot60 });
  const crate = w.box("crate", [0.8, 0.5, 0.8], [3, 0.25, -6], { motion: PhysicsMotionType.DYNAMIC, mass: 25, color: new Color3(0.6, 0.4, 0.2) });
  w.destruction.register(crate, { name: "Crate", mat: "plywood", isStatic: false, grabbable: true, usable: null });
  // a trail of glass shards (debris layer) across the walking lane
  const shards = new Set<unknown>();
  for (let i = 0; i < 14; i++) {
    const sh = w.box("shard" + i, [0.12, 0.02, 0.1], [(i % 3) * 0.1 - 0.1, 0.01, -2.4 - i * 0.18], { motion: PhysicsMotionType.DYNAMIC, mass: 0.15, layer: Layer.DEBRIS, color: new Color3(0.7, 0.85, 0.9) });
    w.destruction.register(sh, { name: "Glass shard", mat: "glass", isStatic: false, grabbable: true, usable: null });
    shards.add(sh);
  }
  const chair = w.box("chair", [0.5, 0.9, 0.5], [-3, 0.45, -1.2], { motion: PhysicsMotionType.DYNAMIC, mass: 6, color: new Color3(0.3, 0.5, 0.7) });
  const sofa = w.box("sofa", [2.0, 0.8, 0.9], [-3, 0.4, -5], { motion: PhysicsMotionType.DYNAMIC, mass: 120, color: new Color3(0.4, 0.3, 0.5) });

  const p = new PlayerCore(w.ctx, null);
  (w.ctx as { player: unknown }).player = p;
  w.input.setEnabled(true);
  w.input.setFallback(true); // headless: no pointer lock

  const t0 = performance.now();
  // ---------------------------------------------------------------- settle
  p.teleport({ x: 0, y: 1.65, z: 0 }, 0, 0);
  w.step(40);
  out.settle = { grounded: p.grounded, foot: v3(p.foot), eye: v3(p.position), eyeAboveFloor: r3(p.position.y) };

  // ---------------------------------------------------------------- walk / sprint / crouch speeds
  const measureSpeed = (keys: string[], steps: number) => {
    for (const k of keys) key(k, true);
    const start = p.foot.clone();
    let maxV = 0;
    let t90 = -1;
    for (let i = 0; i < steps; i++) {
      w.step(1);
      const s = Math.hypot(p.velocity.x, p.velocity.z);
      maxV = Math.max(maxV, s);
    }
    const s = Math.hypot(p.velocity.x, p.velocity.z);
    for (const k of keys) key(k, false);
    const dist = Math.hypot(p.foot.x - start.x, p.foot.z - start.z);
    let stopSteps = 0;
    while (Math.hypot(p.velocity.x, p.velocity.z) > 0.05 && stopSteps < 120) {
      w.step(1);
      stopSteps++;
    }
    void t90;
    return { speed: r2(s), maxV: r2(maxV), dist: r2(dist), stopSeconds: r2(stopSteps / 60) };
  };
  // walking along -Z lane (away from obstacles): face -Z (yaw = π)
  p.teleport({ x: 0, y: 1.65, z: 0 }, Math.PI, 0);
  w.step(10);
  const fs0 = p.footsteps.count;
  out.walk = measureSpeed(["KeyW"], 90);
  out.walkFootsteps = p.footsteps.count - fs0;
  p.teleport({ x: 1.5, y: 1.65, z: 0 }, Math.PI, 0);
  w.step(10);
  out.sprint = measureSpeed(["KeyW", "ShiftLeft"], 90);
  p.teleport({ x: 1.5, y: 1.65, z: 0 }, Math.PI, 0);
  w.step(10);
  key("KeyC", true);
  w.step(20);
  const crouchEye = r3(p.position.y);
  out.crouch = { ...measureSpeed(["KeyW"], 90), eyeY: crouchEye, crouched: p.crouched };
  key("KeyC", false);
  w.step(30);
  out.uncrouch = { crouched: p.crouched, eyeY: r3(p.position.y) };
  // strafe (D = +X when facing +Z)
  p.teleport({ x: 0, y: 1.65, z: 0 }, 0, 0);
  w.step(10);
  const sx = p.foot.x;
  key("KeyD", true);
  w.step(30);
  key("KeyD", false);
  out.strafeRight_dx = r2(p.foot.x - sx);

  // ---------------------------------------------------------------- jump apex
  p.teleport({ x: 0, y: 1.65, z: -2 }, 0, 0);
  w.step(20);
  const baseFoot = p.foot.y;
  key("Space", true);
  w.step(1);
  key("Space", false);
  let apex = baseFoot;
  let airSteps = 0;
  for (let i = 0; i < 90; i++) {
    w.step(1);
    apex = Math.max(apex, p.foot.y);
    if (!p.grounded) airSteps++;
  }
  out.jump = { apex: r3(apex - baseFoot), airTime: r2(airSteps / 60), landedGrounded: p.grounded, landEvents: w.log.land.length };

  // ---------------------------------------------------------------- step-up 15 cm, block 50 cm
  p.teleport({ x: 0, y: 1.65, z: 4 }, 0, 0);
  w.step(10);
  key("KeyW", true);
  let maxFootY = 0;
  for (let i = 0; i < 50; i++) {
    w.step(1);
    maxFootY = Math.max(maxFootY, p.foot.y);
  }
  key("KeyW", false);
  out.stepUp15 = { footYOnStep: r3(maxFootY), z: r2(p.foot.z) };
  p.teleport({ x: 6, y: 1.65, z: 2 }, 0, 0);
  w.step(10);
  key("KeyW", true);
  w.step(70);
  key("KeyW", false);
  out.block50 = { z: r2(p.foot.z), footY: r3(p.foot.y), blocked: p.foot.z < 4 - 0.5 + 0.05 };

  // ---------------------------------------------------------------- crouch under a low ceiling
  p.teleport({ x: -6, y: 1.65, z: 0.5 }, 0, 0);
  w.step(10);
  key("KeyC", true);
  w.step(10);
  key("KeyW", true);
  w.step(130); // walk under the slab (underside 1.4 m)
  key("KeyW", false);
  key("KeyC", false);
  w.step(30);
  const underCeiling = { crouched: p.crouched, z: r2(p.foot.z), eyeY: r3(p.position.y) };
  key("KeyS", true);
  w.step(120); // back out
  key("KeyS", false);
  w.step(30);
  out.lowCeiling = { underCeiling, afterLeaving: { crouched: p.crouched, z: r2(p.foot.z), eyeY: r3(p.position.y) } };

  // ---------------------------------------------------------------- slopes
  p.teleport({ x: 12, y: 1.65, z: 2 }, 0, 0);
  w.step(10);
  key("KeyW", true);
  let maxY30 = 0;
  for (let i = 0; i < 120; i++) {
    w.step(1);
    maxY30 = Math.max(maxY30, p.foot.y);
  }
  key("KeyW", false);
  out.slope30 = { maxFootY: r2(maxY30), z: r2(p.foot.z) };
  p.teleport({ x: -12, y: 1.65, z: 1.2 }, 0, 0);
  w.step(10);
  key("KeyW", true);
  let maxY60 = 0;
  for (let i = 0; i < 120; i++) {
    w.step(1);
    maxY60 = Math.max(maxY60, p.foot.y);
  }
  key("KeyW", false);
  out.slope60 = { maxFootY: r2(maxY60), z: r2(p.foot.z) };

  // ---------------------------------------------------------------- stomp: fall onto the crate
  w.step(5);
  const strikesBefore = w.destruction.strikes.length;
  const landsBefore = w.log.land.length;
  p.teleport({ x: 3, y: 0.5 + 2.2 + 1.65, z: -6 }, 0, 0); // feet 2.2 m above the crate top (≈6.5 m/s)
  for (let i = 0; i < 60; i++) w.step(1);
  const stomps = w.destruction.strikes.slice(strikesBefore).filter((s) => s.source === "stomp" && s.body === crate);
  out.stomp = {
    count: stomps.length,
    speed: stomps.length ? r2(stomps[0].speed) : null,
    mass: stomps.length ? stomps[0].mass : null,
    pointY: stomps.length ? r3(stomps[0].point.y) : null,
    land: w.log.land.slice(landsBefore).map((e) => ({ speed: r2((e as { speed: number }).speed), mat: (e as { mat: string }).mat })),
    onCrate: p.grounded && p.foot.y > 0.4,
    shakes: w.shakes.length,
  };
  // a hop in place on the crate lands at the jump speed (≈4.4 m/s) → an ordinary landing, no stomp
  const sb2 = w.destruction.strikes.length;
  key("Space", true);
  w.step(1);
  key("Space", false);
  w.step(80);
  out.hopOnCrate_stomps = w.destruction.strikes.slice(sb2).filter((s) => s.source === "stomp" && s.body === crate).length;
  // a small drop (0.25 m → ≈2.2 m/s) does not
  const sb3a = w.destruction.strikes.length;
  p.teleport({ x: 3, y: 0.5 + 0.25 + 1.65, z: -6 }, 0, 0);
  w.step(60);
  out.smallDrop_noStomp = w.destruction.strikes.slice(sb3a).filter((s) => s.source === "stomp" && s.speed > PLAYER.stompSpeed).length === 0;

  // ---------------------------------------------------------------- debris: walk through, crunch
  p.teleport({ x: 0, y: 1.65, z: -1.6 }, Math.PI, 0);
  w.step(10);
  const sb3 = w.destruction.strikes.length;
  const fs1 = w.log.footstep.length;
  key("KeyW", true);
  let minZ = 0;
  for (let i = 0; i < 70; i++) {
    w.step(1);
    minZ = Math.min(minZ, p.foot.z);
  }
  key("KeyW", false);
  const crunch = w.destruction.strikes.slice(sb3).filter((s) => shards.has(s.body));
  out.debris = {
    passedOver: minZ < -3.6,
    footY: r3(p.foot.y),
    crunchStrikes: crunch.length,
    footsteps: w.log.footstep.length - fs1,
    footstepMats: Array.from(new Set(w.log.footstep.slice(fs1).map((e) => (e as { mat: string }).mat))),
  };

  // ---------------------------------------------------------------- pushing furniture
  const chairStart = chair.transformNode.position.clone();
  p.teleport({ x: -3, y: 1.65, z: 1 }, Math.PI, 0);
  w.step(10);
  key("KeyW", true);
  w.step(90);
  key("KeyW", false);
  out.pushChair = { chairMoved: r2(Vector3.Distance(chairStart, chair.transformNode.position)), playerZ: r2(p.foot.z) };
  const sofaStart = sofa.transformNode.position.clone();
  p.teleport({ x: -3, y: 1.65, z: -3 }, Math.PI, 0);
  w.step(10);
  key("KeyW", true);
  w.step(90);
  key("KeyW", false);
  out.pushSofa120kg = { sofaMoved: r2(Vector3.Distance(sofaStart, sofa.transformNode.position)), playerZ: r2(p.foot.z) };

  // ---------------------------------------------------------------- the capsule body follows the player
  // (dynamic bodies collide with the controller's kinematic capsule: a box dropped on the head rests on it)
  p.teleport({ x: -8, y: 1.65, z: -8 }, 0, 0);
  w.step(20);
  key("KeyW", true);
  w.step(30); // walk somewhere first: the kinematic body must have moved along
  key("KeyW", false);
  w.step(20);
  const hx = p.foot.x, hz = p.foot.z;
  const headBox = w.box("headBox", [0.3, 0.3, 0.3], [hx, 2.6, hz], { motion: PhysicsMotionType.DYNAMIC, mass: 3 });
  w.step(90);
  out.boxOnHead = { boxY: r2(headBox.transformNode.position.y), restsOnHead: headBox.transformNode.position.y > 1.75 };

  // ---------------------------------------------------------------- render interpolation at 144 Hz
  // (fixed steps at 60 Hz; the rendered camera must move on every frame, smoothly)
  p.teleport({ x: 0, y: 1.65, z: 0 }, 0, 0);
  w.step(10);
  key("KeyD", true);
  w.step(40); // reach full strafe speed
  {
    const xs: number[] = [];
    let acc = 0;
    const fdt = 1 / 144;
    for (let f = 0; f < 144; f++) {
      acc += fdt;
      while (acc >= 1 / 60) {
        acc -= 1 / 60;
        w.step(1);
      }
      p.update(fdt);
      xs.push(w.ctx.render.camera.position.x);
    }
    // (skip the first frames: the probe stepped headless before, the accumulator mirror resyncs)
    const d = xs.slice(1).map((x, i) => x - xs[i]).slice(6);
    const still = d.filter((v) => Math.abs(v) < 1e-5).length;
    const mean = d.reduce((a2, b2) => a2 + b2, 0) / d.length;
    // frame-to-frame change of the step (judder shows as 0 / 60 mm alternation: |Δ| ≈ 25–35 mm)
    const jerk = Math.max(...d.slice(1).map((v, i) => Math.abs(v - d[i])));
    out.interp144 = { frames: d.length, stillFrames: still, meanStepMm: r3(mean * 1000), maxStepChangeMm: r3(jerk * 1000), smooth: still === 0 && jerk < 0.006 };
  }
  key("KeyD", false);
  w.step(30);
  // pause: camera springs freeze with the simulation
  {
    const t = w.ctx.time as { scale: number };
    p.rig.land(6);
    t.scale = 0;
    p.update(1 / 60);
    const y0 = w.ctx.render.camera.position.y;
    for (let i = 0; i < 30; i++) p.update(1 / 60);
    const y1 = w.ctx.render.camera.position.y;
    t.scale = 1;
    for (let i = 0; i < 5; i++) p.update(1 / 60);
    const y2 = w.ctx.render.camera.position.y;
    out.pauseFreezesDip = { frozen: Math.abs(y1 - y0) < 1e-3, resumes: Math.abs(y2 - y1) > 1e-3 };
    w.step(60);
  }

  // ---------------------------------------------------------------- look & camera
  p.teleport({ x: 0, y: 1.65, z: 0 }, 0, 0);
  w.step(5);
  w.input.addLook(100, -50);
  w.step(1);
  p.update(1 / 60);
  out.look = { yaw: r3(p.rig.yaw), pitch: r3(p.rig.pitch), forward: v3(p.forward), camRot: v3(w.ctx.render.camera.rotation), camPos: v3(w.ctx.render.camera.position) };
  w.input.addLook(0, 100000);
  w.step(1);
  out.pitchClamp = r3((p.rig.pitch * 180) / Math.PI);

  // ---------------------------------------------------------------- fall-out respawn
  p.teleport({ x: 30, y: 1.65, z: 30 }, 0, 0); // off the 40 m floor edge? floor spans ±20: place beyond it
  p.teleport({ x: 25, y: 1.65, z: 25 }, 0, 0);
  w.step(200);
  out.fallRespawn = { foot: v3(p.foot), toast: (w.log.toast ?? []).slice(-1) };

  out.ms = Math.round(performance.now() - t0);
  out.nan = [p.position.x, p.position.y, p.position.z, p.velocity.x, p.velocity.y, p.velocity.z].some((x) => !Number.isFinite(x));
  w.engine.runRenderLoop(() => w.scene.render());
  p.teleport({ x: 0, y: 1.65, z: 2.5 }, Math.PI * 0.9, 0.25);
  w.step(5);
  p.update(1 / 60);
  return out;
}
