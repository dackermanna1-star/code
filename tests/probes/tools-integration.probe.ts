// End-to-end: the ToolSystem against the REAL physics (createPhysics) and REAL destruction
// (Destruction + damage model), using the destruction agent's probe doubles for render/vfx
// (tests/probes/destruction-util.ts). Scenarios: hammer through a window pane, sledgehammer into a
// drywall sheet, axe into a pine table top, stomp on a microwave, kick a chair, crowbar pry on a
// door. Reports strike outcomes and the destruction events each produced.
// Run: node tests/probe.mjs tests/probes/tools-integration.probe.ts --screenshot /tmp/claude-0/tools-int.png
import { Vector3, type UniversalCamera } from "@babylonjs/core";
import { makeSim, floorDef, paneDef, tableDef, doorDef, boxPart, type Sim } from "./destruction-util.ts";
import { buildObject } from "../../src/objects/registry.ts";
import { ToolSystem } from "../../src/player/tools/toolSystem.ts";
import type { GameContext, ToolId, Action } from "../../src/core/context.ts";
import type { ToolContext } from "../../src/player/contracts.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";
import { FIXED_DT } from "../../src/core/time.ts";

const r = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

class Input {
  private d = new Set<Action>();
  private p = new Set<Action>();
  private rl = new Set<Action>();
  readonly move = { x: 0, y: 0 };
  readonly locked = true;
  press(a: Action) {
    if (!this.d.has(a)) this.p.add(a);
    this.d.add(a);
  }
  release(a: Action) {
    if (this.d.has(a)) this.rl.add(a);
    this.d.delete(a);
  }
  down(a: Action) {
    return this.d.has(a);
  }
  pressed(a: Action) {
    const x = this.p.has(a);
    this.p.delete(a);
    return x;
  }
  released(a: Action) {
    const x = this.rl.has(a);
    this.rl.delete(a);
    return x;
  }
  consumeLook() {
    return { dx: 0, dy: 0 };
  }
  consumeWheel() {
    return 0;
  }
  requestLock() {}
  exitLock() {}
  update() {}
}

interface Rig {
  sim: Sim;
  tools: ToolSystem;
  tc: ToolContext;
  input: Input;
  setView(eye: Vector3, yaw: number, pitch: number): void;
  step(n: number): void;
}

async function rig(): Promise<Rig> {
  const sim = await makeSim();
  sim.d.spawn(floorDef(10), { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } });
  const input = new Input();
  const audio = { play() {}, loop: () => ({ setPosition() {}, setGain() {}, stop() {} }) };
  const ctx = { scene: sim.scene, engine: sim.engine, physics: sim.physics, destruction: sim.d, events: sim.events, render: sim.render, time: sim.time, settings: sim.settings, vfx: sim.vfx, audio, input } as unknown as GameContext;
  const tools = new ToolSystem(ctx);
  const tc: ToolContext = { eye: new Vector3(0, 1.65, 0), forward: new Vector3(0, 0, 1), right: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0), velocity: new Vector3(), ignore: null, holding: false };
  const cam = sim.render.camera as unknown as UniversalCamera;
  const R: Rig = {
    sim,
    tools,
    tc,
    input,
    setView(eye, yaw, pitch) {
      tc.eye.copyFrom(eye);
      tc.forward.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      tc.right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      Vector3.CrossToRef(tc.forward, tc.right, tc.up);
      cam.position.copyFrom(eye);
      cam.rotation.set(pitch, yaw, 0);
      cam.fov = (75 * Math.PI) / 180;
      cam.minZ = 0.03;
    },
    step(n) {
      for (let i = 0; i < n; i++) {
        tools.fixedUpdate(FIXED_DT, tc);
        sim.step(1);
        tools.update(FIXED_DT, tc);
      }
    },
  };
  R.setView(new Vector3(0, 1.65, 0), 0, 0);
  return R;
}

const at = (x: number, y: number, z: number, yaw = 0) => ({ p: { x, y, z }, q: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) } });

function drywallDef(): AssemblyDef {
  return {
    type: "testDrywall",
    name: "Drywall Sheet",
    category: "structure",
    value: 30,
    parts: [boxPart("sheet", "gypsum", "paint_wall", { x: 1.2, y: 2.4, z: 0.0125 }, { x: 0, y: 1.2, z: 0 }, { supported: true } as never)],
    bonds: [
      { a: "sheet", b: "world", kind: "screw", strength: 400, anchor: { x: -0.6, y: 1.2, z: 0 } },
      { a: "sheet", b: "world", kind: "screw", strength: 400, anchor: { x: 0.6, y: 1.2, z: 0 } },
      { a: "sheet", b: "world", kind: "screw", strength: 400, anchor: { x: 0, y: 2.4, z: 0 } },
      { a: "sheet", b: "world", kind: "screw", strength: 400, anchor: { x: 0, y: 0, z: 0 } },
    ],
  };
}

function summary(R: Rig, ev0: Record<string, number>) {
  const ev: Record<string, number> = {};
  for (const [k, v] of Object.entries(R.sim.ev)) if (v - (ev0[k] ?? 0) > 0) ev[k] = v - (ev0[k] ?? 0);
  const lh = R.tools.lastHit;
  return { hits: R.tools.hitCount, last: lh ? { who: lh.who, v: r(lh.speed), vn: r(lh.normalSpeed), E: r(lh.energy, 1), hard: r(lh.hardness), broke: lh.broke, outcome: lh.outcome } : null, events: ev };
}

async function swingAt(tool: ToolId, def: AssemblyDef, xf: ReturnType<typeof at>, view: { eye: Vector3; yaw: number; pitch: number }, power: number, steps = 70) {
  const R = await rig();
  R.sim.d.spawn(def, xf);
  R.sim.step(20); // settle
  R.tools.select(tool);
  R.setView(view.eye, view.yaw, view.pitch);
  R.step(30);
  const ev0 = { ...R.sim.ev };
  R.tools.debugSwing(power, R.tc);
  R.step(steps);
  const out = summary(R, ev0);
  R.sim.engine.dispose();
  return out;
}

export async function probe() {
  const res: Record<string, unknown> = {};
  const eye = new Vector3(0, 1.65, 0);
  // 1. claw hammer (charged) into a window pane 0.62 m ahead (glass spans y 1.0..2.1)
  res.hammerPane = await swingAt("hammer", paneDef(), at(0, 1.0, 0.64), { eye, yaw: 0, pitch: 0 }, 1);
  // 2. sledgehammer (charged) into a drywall sheet 0.86 m ahead
  res.sledgeDrywall = await swingAt("sledgehammer", drywallDef(), at(0, 0, 0.86), { eye, yaw: 0, pitch: 0 }, 1);
  // 3. axe (charged) down onto a pine table top in front (looking down)
  res.axeTable = await swingAt("axe", tableDef(), at(0, 0, 0.75), { eye, yaw: 0, pitch: 0.75 }, 1);
  // 4. bat into a mug standing on a shelf block at chest height, 0.8 m ahead
  {
    const R = await rig();
    R.sim.d.spawn({ type: "testShelf", name: "Shelf", category: "furniture", value: 10, parts: [boxPart("blk", "softwood", "wood_pine", { x: 0.5, y: 1.3, z: 0.4 }, { x: 0, y: 0.65, z: 0 })], bonds: [{ a: "blk", b: "world", kind: "screw", strength: 5000, anchor: { x: 0, y: 0, z: 0 } }] }, at(0.1, 0, 0.85));
    R.sim.d.spawn(buildObject("mug"), at(0.1, 1.3, 0.8));
    R.sim.step(30);
    R.tools.select("bat");
    // look at the mug (≈ 0.35 m below eye level, 0.8 m ahead)
    R.setView(eye, Math.atan2(0.1, 0.8), Math.atan2(0.3, 0.806));
    R.step(30);
    const ev0 = { ...R.sim.ev };
    R.tools.debugSwing(0.5, R.tc);
    R.step(60);
    res.batMug = summary(R, ev0);
    R.sim.engine.dispose();
  }
  // 5. stomp on a microwave on the floor
  {
    const R = await rig();
    R.sim.d.spawn(buildObject("microwave"), at(0, 0, 0.75, Math.PI));
    R.sim.step(30);
    R.setView(eye, 0, 1.05);
    R.step(5);
    const ev0 = { ...R.sim.ev };
    for (let k = 0; k < 3; k++) {
      R.tools.stomp(R.tc);
      R.step(45);
    }
    res.stompMicrowave = summary(R, ev0);
    R.sim.engine.dispose();
  }
  // 6. kick a chair
  {
    const R = await rig();
    const id = R.sim.d.spawn(buildObject("chair"), at(0, 0, 0.9, Math.PI));
    R.sim.step(30);
    const p0 = R.sim.d.positionOf(id);
    R.setView(eye, 0, 0.5);
    R.step(5);
    const ev0 = { ...R.sim.ev };
    R.tools.kick(R.tc);
    R.step(60);
    const p1 = R.sim.d.positionOf(id);
    res.kickChair = { ...summary(R, ev0), moved: p0 && p1 ? r(Math.hypot(p1.x - p0.x, p1.z - p0.z)) : null };
    R.sim.engine.dispose();
  }
  // 7. crowbar pry at the door slab edge (latched door), hold alt 3 s
  {
    const R = await rig();
    R.sim.d.spawn(doorDef({ latch: 40 }), at(0, 0, 0.9));
    R.sim.step(30);
    R.tools.select("crowbar");
    // aim at the latch edge of the slab (door at z 0.9, latch at x 0.4, y 1.0), standing within
    // levering reach of it (arm + bar ≈ 1.05 m from the shoulder)
    const pe = new Vector3(0, 1.65, 0.1);
    R.setView(pe, Math.atan2(0.37, 0.78), Math.atan2(0.65, Math.hypot(0.37, 0.78)));
    R.step(30);
    const ev0 = { ...R.sim.ev };
    R.input.press("alt");
    let maxStress = 0;
    for (let k = 0; k < 180; k++) {
      R.step(1);
      maxStress = Math.max(maxStress, R.tools.pryStress);
    }
    R.input.release("alt");
    R.step(5);
    res.pryDoor = { ...summary(R, ev0), maxStress: r(maxStress, 3) };
    // keep this world for the screenshot
    await R.sim.renderReady(2);
  }
  return res;
}
