// Reviewer probe: bat vs mug — log the raw strike input/result and the body classification.
import { Vector3, type UniversalCamera } from "@babylonjs/core";
import { makeSim, floorDef, boxPart } from "./destruction-util.ts";
import { buildObject } from "../../src/objects/registry.ts";
import { ToolSystem } from "../../src/player/tools/toolSystem.ts";
import type { GameContext } from "../../src/core/context.ts";
import type { ToolContext } from "../../src/player/contracts.ts";
import { FIXED_DT } from "../../src/core/time.ts";

const at = (x: number, y: number, z: number) => ({ p: { x, y, z }, q: { x: 0, y: 0, z: 0, w: 1 } });
export async function probe() {
  const sim = await makeSim();
  sim.d.spawn(floorDef(10), at(0, 0, 0));
  const log: unknown[] = [];
  const d = sim.d as any;
  const orig = d.strike.bind(d);
  d.strike = (s: any) => {
    const r = orig(s);
    let massOf: unknown = null, isStatic: unknown = null, mt: unknown = null;
    try { massOf = d.massOf(s.body); isStatic = d.isStatic(s.body); mt = s.body.getMotionType(); } catch (e) { massOf = String(e); }
    log.push({ in: { mass: s.mass, speed: s.speed, sharp: s.sharpness, mat: s.strikerMat, src: s.source }, out: r, massOf, isStatic, mt, target: d.target(s.body, s.point, s.childIndex)?.assemblyName });
    return r;
  };
  const input = { down: () => false, pressed: () => false, released: () => false } as any;
  const audio = { play() {}, loop: () => ({ setPosition() {}, setGain() {}, stop() {} }) };
  const ctx = { scene: sim.scene, engine: sim.engine, physics: sim.physics, destruction: sim.d, events: sim.events, render: sim.render, time: sim.time, settings: sim.settings, vfx: sim.vfx, audio, input } as unknown as GameContext;
  const tools = new ToolSystem(ctx);
  sim.d.spawn({ type: "testShelf", name: "Shelf", category: "furniture", value: 10, parts: [boxPart("blk", "softwood", "wood_pine", { x: 0.5, y: 1.3, z: 0.4 }, { x: 0, y: 0.65, z: 0 })], bonds: [{ a: "blk", b: "world", kind: "screw", strength: 5000, anchor: { x: 0, y: 0, z: 0 } }] }, at(0.1, 0, 0.85));
  const mugId = sim.d.spawn(buildObject("mug"), at(0.1, 1.3, 0.8));
  sim.step(30);
  tools.select("bat");
  const eye = new Vector3(0, 1.65, 0);
  const yaw = Math.atan2(0.1, 0.8), pitch = Math.atan2(0.3, 0.806);
  const tc: ToolContext = { eye, forward: new Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)), right: new Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), up: new Vector3(), velocity: new Vector3(), ignore: null, holding: false };
  Vector3.CrossToRef(tc.forward, tc.right, tc.up);
  const p0 = sim.d.positionOf(mugId);
  for (let i = 0; i < 30; i++) { tools.fixedUpdate(FIXED_DT, tc); sim.step(1); }
  tools.debugSwing(0.5, tc);
  for (let i = 0; i < 60; i++) { tools.fixedUpdate(FIXED_DT, tc); sim.step(1); }
  const p1 = sim.d.positionOf(mugId);
  return { log, lastHit: tools.lastHit, mugMoved: p0 && p1 ? [p1.x - p0.x, p1.y - p0.y, p1.z - p0.z] : null, list: sim.d.list().map((a: any) => [a.name, a.damage, a.islands]) };
}
