// Feature probe: ceiling lamp + wall switch (toggle, bulb pulled out → lightBroken), mains power
// cut (lights/fan), burst pipe (water emitter + events), faucet use toggle, ceiling-fan motor
// (velocity motor via torque) and despawn leak check (lights, emitters).
import { Vector3 } from "@babylonjs/core";
import { makeSim, floorDef, boxPart, round } from "./destruction-util.ts";
import type { AssemblyDef } from "../../src/destruction/model/types.ts";
import { polyCylinder, faceAttr } from "../../src/geom/poly.ts";
import { S } from "../../src/render/surfaces.ts";
import { LightFeature } from "../../src/destruction/features/light.ts";

const I = { x: 0, y: 0, z: 0, w: 1 };

function lampDef(): AssemblyDef {
  const bulbPoly = polyCylinder(0.03, 0.03, 0.08, 10, faceAttr(S.bulb_on, 0xffffff, { smooth: 1 }), faceAttr(S.bulb_on), { p: { x: 0, y: 2.36, z: 0 }, q: I });
  return {
    type: "testLamp",
    name: "Ceiling Lamp",
    category: "fixture",
    value: 60,
    room: "living",
    parts: [
      boxPart("canopy", "steel", "metal_painted", { x: 0.12, y: 0.03, z: 0.12 }, { x: 0, y: 2.685, z: 0 }),
      boxPart("rod", "steel", "metal_black", { x: 0.012, y: 0.24, z: 0.012 }, { x: 0, y: 2.55, z: 0 }),
      boxPart("socket", "plastic", "plastic", { x: 0.04, y: 0.03, z: 0.04 }, { x: 0, y: 2.415, z: 0 }),
      { name: "bulb", mat: "glass", poly: bulbPoly },
    ],
    bonds: [
      { a: "canopy", b: "world", kind: "screw", strength: 200, anchor: { x: 0, y: 2.7, z: 0 } },
      { a: "rod", b: "canopy", kind: "screw", strength: 100 },
      { a: "socket", b: "rod", kind: "screw", strength: 60 },
      { a: "bulb", b: "socket", kind: "press", strength: 3 },
    ],
    features: [{ type: "light", part: "bulb", pos: { x: 0, y: 2.36, z: 0 }, kind: "point", color: 0xffe2b8, intensity: 1, range: 6, mains: true, on: true }],
  };
}

function switchDef(): AssemblyDef {
  return {
    type: "testSwitch",
    name: "Light Switch",
    category: "fixture",
    value: 5,
    parts: [boxPart("plate", "plastic", "plastic", { x: 0.08, y: 0.12, z: 0.01 }, { x: 0, y: 1.1, z: 0 }, { tags: ["switch:living"] })],
    bonds: [{ a: "plate", b: "world", kind: "screw", strength: 40, anchor: { x: 0, y: 1.1, z: 0.005 } }],
  };
}

function pipeDef(): AssemblyDef {
  return {
    type: "testPipe",
    name: "Copper Pipe",
    category: "fixture",
    value: 30,
    parts: [
      boxPart("segA", "copper", "copper", { x: 0.6, y: 0.016, z: 0.016 }, { x: -0.3, y: 0.5, z: 0 }),
      boxPart("segB", "copper", "copper", { x: 0.6, y: 0.016, z: 0.016 }, { x: 0.3, y: 0.5, z: 0 }),
    ],
    bonds: [
      { a: "segA", b: "world", kind: "clip", strength: 300, anchor: { x: -0.5, y: 0.5, z: 0 } },
      { a: "segB", b: "world", kind: "clip", strength: 300, anchor: { x: 0.5, y: 0.5, z: 0 } },
      { a: "segA", b: "segB", kind: "weld", strength: 60, anchor: { x: 0, y: 0.5, z: 0 } },
    ],
    features: [{ type: "water", part: "segB", pos: { x: 0, y: 0.5, z: 0 }, dir: { x: 0, y: 0.3, z: 1 }, pressure: 0.8 }],
  };
}

function faucetDef(): AssemblyDef {
  return {
    type: "testFaucet",
    name: "Faucet",
    category: "fixture",
    value: 90,
    parts: [boxPart("spout", "steel", "chrome", { x: 0.03, y: 0.2, z: 0.03 }, { x: 0, y: 1.0, z: 0 }, { tags: ["faucet"] })],
    bonds: [{ a: "spout", b: "world", kind: "bolt", strength: 300, anchor: { x: 0, y: 0.9, z: 0 } }],
    features: [{ type: "water", part: "spout", pos: { x: 0, y: 1.1, z: 0.02 }, dir: { x: 0, y: -1, z: 0 }, pressure: 0.6 }],
  };
}

function fanDef(): AssemblyDef {
  return {
    type: "testFan",
    name: "Ceiling Fan",
    category: "fixture",
    value: 150,
    parts: [
      boxPart("housing", "steel", "metal_painted", { x: 0.18, y: 0.12, z: 0.18 }, { x: 0, y: 2.55, z: 0 }),
      boxPart("hub", "steel", "metal_painted", { x: 0.1, y: 0.04, z: 0.1 }, { x: 0, y: 2.47, z: 0 }),
      boxPart("bladeA", "plywood", "wood_walnut", { x: 1.1, y: 0.01, z: 0.12 }, { x: 0, y: 2.46, z: 0 }),
      boxPart("bladeB", "plywood", "wood_walnut", { x: 0.12, y: 0.01, z: 1.1 }, { x: 0, y: 2.462, z: 0 }),
    ],
    bonds: [
      { a: "housing", b: "world", kind: "bolt", strength: 500, anchor: { x: 0, y: 2.7, z: 0 } },
      { a: "bladeA", b: "hub", kind: "screw", strength: 60 },
      { a: "bladeB", b: "hub", kind: "screw", strength: 60 },
      { a: "hub", b: "housing", kind: "hinge", anchor: { x: 0, y: 2.49, z: 0.02 }, joint: { axis: { x: 0, y: 1, z: 0 }, pivot: { x: 0, y: 2.49, z: 0 }, min: -Math.PI * 4, max: Math.PI * 4, friction: 0.02, group: "fan" } },
      { a: "hub", b: "housing", kind: "hinge", anchor: { x: 0, y: 2.49, z: -0.02 }, joint: { axis: { x: 0, y: 1, z: 0 }, pivot: { x: 0, y: 2.49, z: 0 }, min: -Math.PI * 4, max: Math.PI * 4, friction: 0.02, group: "fan" } },
    ],
    features: [{ type: "motor", part: "housing", joint: "fan", speed: 12, mains: true }],
  };
}

function tvDef(): AssemblyDef {
  return {
    type: "testTv",
    name: "Television",
    category: "electronics",
    value: 400,
    parts: [
      boxPart("case", "plastic", "plastic_glossy", { x: 0.9, y: 0.54, z: 0.06 }, { x: 0, y: 1.2, z: -0.03 }, { tint: 0x222222 }),
      boxPart("lcd", "lcd", "lcd_off", { x: 0.84, y: 0.48, z: 0.006 }, { x: 0, y: 1.2, z: 0.003 }),
    ],
    bonds: [
      { a: "lcd", b: "case", kind: "clip", strength: 30 },
      { a: "case", b: "world", kind: "screw", strength: 300, anchor: { x: 0, y: 1.2, z: -0.06 } },
    ],
    features: [{ type: "screen", part: "lcd", content: "tv", on: true }],
  };
}

export async function probe() {
  const sim = await makeSim({ camPos: new Vector3(3, 2.2, -3), camTarget: new Vector3(0, 1.6, 0) });
  const { d } = sim;
  const out: Record<string, unknown> = {};
  const base = sim.counts();
  const floorId = d.spawn(floorDef(), { p: { x: 0, y: 0, z: 0 }, q: I });
  const lampId = d.spawn(lampDef(), { p: { x: 0, y: 0, z: 0 }, q: I });
  const swId = d.spawn(switchDef(), { p: { x: 1.5, y: 0, z: 1 }, q: I });
  const pipeId = d.spawn(pipeDef(), { p: { x: -1.5, y: 0, z: 1 }, q: I });
  const faucetId = d.spawn(faucetDef(), { p: { x: 1.5, y: 0, z: -1 }, q: I });
  const fanId = d.spawn(fanDef(), { p: { x: -1.5, y: 0, z: -1.5 }, q: I });
  const meshesBeforeTv = sim.scene.meshes.length;
  const tvId = d.spawn(tvDef(), { p: { x: 0.2, y: 0, z: 1.6 }, q: { x: 0, y: 1, z: 0, w: 0 } });
  const tv = d.assembly(tvId)!;
  const tvIsl = [...tv.islands][0];
  const tvp = d.world.toWorldVec(tvIsl, { x: 0, y: 1.2, z: 0.01 });
  const tvTarget = d.target(tvIsl.body!, new Vector3(tvp.x, tvp.y, tvp.z), -1);
  const screenMeshes = sim.scene.meshes.length - meshesBeforeTv - 1;
  const tu1 = d.use(tvIsl.body!, new Vector3(tvp.x, tvp.y, tvp.z), new Vector3(0, 1.6, 0));
  const tvOff = (d.features as unknown as { all: Set<{ state?: string }> }).all;
  const tvState1 = [...tvOff].find((f) => (f as { def?: { type: string } }).def?.type === "screen")?.state;
  const tu2 = d.use(tvIsl.body!, new Vector3(tvp.x, tvp.y, tvp.z), new Vector3(0, 1.6, 0));
  const tvState2 = [...tvOff].find((f) => (f as { def?: { type: string } }).def?.type === "screen")?.state;
  out.tv = { usable: tvTarget?.usable, screenMeshes, tu1, tvState1, tu2, tvState2 };
  const lightOf = () => [...d.features.all].find((f) => f instanceof LightFeature) as LightFeature;
  out.spawned = { lights: sim.render.lights.length, light: !!lightOf().light, sceneLights: sim.scene.lights.length };

  // ---- wall switch toggles the room's lights
  const sw = d.assembly(swId)!;
  const swIsl = [...sw.islands][0];
  const sp = d.world.toWorldVec(swIsl, { x: 0, y: 1.1, z: -0.005 });
  const t1 = d.use(swIsl.body!, new Vector3(sp.x, sp.y, sp.z), new Vector3(sp.x, 1.6, sp.z - 1));
  const off = { lights: sim.render.lights.length, on: lightOf().on };
  const t2 = d.use(swIsl.body!, new Vector3(sp.x, sp.y, sp.z), new Vector3(sp.x, 1.6, sp.z - 1));
  out.switch = { t1, off, t2, on: { lights: sim.render.lights.length, on: lightOf().on }, target: d.target(swIsl.body!, new Vector3(sp.x, sp.y, sp.z), -1)?.usable };

  // ---- fan motor spin-up
  sim.step(120);
  const fan = d.assembly(fanId)!;
  const fg = fan.groups.get("fan")!;
  const hubIsl = fan.byName.get("hub")!.island!;
  const w = new Vector3();
  hubIsl.body!.getAngularVelocityToRef(w);
  out.fanSpin = { constraints: fg.constraints.map((c) => c.kind), motorOn: fg.motorOn, omegaY: round(w.y, 100), motors: d.joints.motors.size };

  // ---- pull the bulb out of its socket → light dies (pop + sparks event)
  const lamp = d.assembly(lampId)!;
  const bulb = lamp.byName.get("bulb")!;
  const press = bulb.bonds.find((b) => b.kind === "press")!;
  d.world.breakBond(press);
  d.world.flushTopology();
  out.bulbOut = { lightBroken: sim.log.filter((e) => e.type === "feature" && (e.ev as { kind: string }).kind === "lightBroken").length, lights: sim.render.lights.length, alive: lightOf().alive, bulbIsland: bulb.island?.isStatic === false ? "dynamic" : "?" };
  sim.step(60);

  // ---- burst pipe: weld snaps → spray
  const pipe = d.assembly(pipeId)!;
  const weld = pipe.byName.get("segA")!.bonds.find((b) => b.kind === "weld")!;
  d.world.breakBond(weld);
  d.world.flushTopology();
  sim.step(30);
  out.pipe = { emitters: sim.vfx.emitters, live: sim.vfx.liveEmitters, waterStart: sim.log.filter((e) => e.type === "feature" && (e.ev as { kind: string }).kind === "waterStart").length };

  // ---- faucet use
  const fau = d.assembly(faucetId)!;
  const fIsl = [...fau.islands][0];
  const fp = d.world.toWorldVec(fIsl, { x: 0, y: 1.05, z: -0.015 });
  const tgt = d.target(fIsl.body!, new Vector3(fp.x, fp.y, fp.z), -1);
  const u1 = d.use(fIsl.body!, new Vector3(fp.x, fp.y, fp.z), new Vector3(0, 1.6, -2));
  const liveOn = sim.vfx.liveEmitters;
  const u2 = d.use(fIsl.body!, new Vector3(fp.x, fp.y, fp.z), new Vector3(0, 1.6, -2));
  out.faucet = { usable: tgt?.usable, u1, liveOn, u2, liveOff: sim.vfx.liveEmitters };

  // ---- power cut: fan motor stops, mains lights off
  d.features.setPower(false, { x: 0, y: 1.5, z: 0 });
  sim.step(180);
  hubIsl.body!.getAngularVelocityToRef(w);
  out.powerOut = { renderPower: sim.render.power, motorOn: fg.motorOn, omegaY: round(w.y, 100), powerOutEvents: sim.log.filter((e) => e.type === "feature" && (e.ev as { kind: string }).kind === "powerOut").length, motorStop: sim.log.filter((e) => e.type === "feature" && (e.ev as { kind: string }).kind === "motorStop").length };

  // rip the LCD out of its case: screen goes dead (quad stays, black)
  const lcd = tv.byName.get("lcd")!;
  for (const b of lcd.bonds.slice()) d.world.breakBond(b);
  d.world.flushTopology();
  const tvState3 = [...tvOff].find((f) => (f as { def?: { type: string } }).def?.type === "screen")?.state;
  out.tvRipped = { state: tvState3, screenBroken: sim.log.filter((e) => e.type === "feature" && (e.ev as { kind: string }).kind === "screenBroken").length };
  await sim.renderReady(2);
  out.events = { ...sim.ev };
  for (const id of [floorId, lampId, swId, pipeId, faucetId, fanId, tvId]) d.despawn(id);
  sim.step(2);
  const fin = sim.counts();
  out.leak = { ...Object.fromEntries(Object.entries(fin).map(([k, v]) => [k, v - (base as Record<string, number>)[k]])), liveEmitters: sim.vfx.liveEmitters, renderLights: sim.render.lights.length };
  return out;
}
