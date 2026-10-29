// Physics probe for the tool system (stub destruction records strike()/pry() calls; real Havok
// sweeps). Verifies: hit timing vs the analytic path, contact point on the surface, head speed ≈
// tool speed at the nominal reach, charged vs normal energies, light dynamic box knocked away
// (impulse along the swing, swing follows through), break-through continuation, kick and stomp
// sweeps, crowbar pry calls until the bond pops, extinguisher spray pushing a light box, painful
// punches, fire not consumed while holding, tool switching.
// Run: node tests/probe.mjs tests/probes/tools-swing.probe.ts
import { Vector3, Color3 } from "@babylonjs/core";
import { makeHarness, r, rv, type Harness } from "./tools-util.ts";
import type { ToolId } from "../../src/core/context.ts";
import { TOOL_DEFS, TOOL_ORDER } from "../../src/player/tools/defs.ts";
import { chargedSpeed, v3 } from "../../src/player/tools/swing.ts";

const canvas = () => document.getElementById("renderCanvas") as HTMLCanvasElement;
type Any = Record<string, unknown>;
const internals = (h: Harness) => h.tools as unknown as { machine: { path: { T: number; tc: number; v: number }; headAt(t: number, o: unknown): { x: number; y: number; z: number }; phase: string; t: number }; lastHit: Any & { speed: number; normalSpeed: number; outcome: string }; hitCount: number; leg: { phase: string } };

/** First strike-path time at which the head sphere touches the plane z = zw (camera at origin facing +Z). */
function predictTouch(h: Harness, zw: number, radius: number): number {
  const m = internals(h).machine;
  const o = v3();
  const T = m.path.T;
  for (let i = 0; i <= 4000; i++) {
    const t = (T * i) / 4000;
    if (m.headAt(t, o).z + radius >= zw) return t;
  }
  return Infinity;
}

async function wallTest(tool: ToolId, power: number): Promise<Any> {
  const h = await makeHarness(canvas());
  const def = TOOL_DEFS[tool];
  const zw = 0.9 * def.reach;
  h.addBox("wall", new Vector3(0, 1.4, zw + 0.1), new Vector3(4, 2.8, 0.2), { mat: "concrete", color: new Color3(0.5, 0.5, 0.5) });
  h.tools.select(tool);
  h.step(30);
  h.shakes.length = 0;
  h.tools.debugSwing(power, h.tc);
  const tTouch = predictTouch(h, zw, def.headRadius);
  const start = h.stepCount;
  for (let k = 0; k < 120 && h.strikes.length === 0; k++) h.step(1);
  const s = h.strikes[0];
  const lh = internals(h).lastHit;
  const swingEv = h.eventsLog.find((e) => e.type === "toolSwing");
  const hitEv = h.eventsLog.find((e) => e.type === "toolHit");
  const res: Any = {
    tool,
    power,
    hit: !!s,
    stepsToHit: s ? s.step - start + 1 : null,
    predictedSteps: Number.isFinite(tTouch) ? Math.ceil(tTouch * 60 - 1e-9) : null,
    pointZ: s ? s.point[2] : null,
    wallZ: r(zw),
    pointYrel: s ? r(s.point[1] - 1.65, 3) : null,
    headSpeed: lh ? r(lh.speed, 2) : null,
    normalSpeed: s ? s.speed : null,
    ratioToRated: lh ? r(lh.speed / chargedSpeed(def, power), 3) : null,
    squareShare: lh && s ? r((s.speed / lh.speed) ** 2, 3) : null,
    energy: s?.energy ?? null,
    mass: s?.mass,
    contactRadius: s?.contactRadius,
    strikerMat: s?.strikerMat,
    source: s?.source,
    outcome: lh?.outcome,
    shake: h.shakes[0] ?? 0,
    hitStop: h.hitStops[0] ?? 0,
    events: { swing: !!swingEv, hit: !!hitEv },
    flashes: h.flashes.length,
  };
  res.ok =
    !!s &&
    Math.abs((s?.point[2] ?? 0) - zw) < 0.004 &&
    Math.abs((res.stepsToHit as number) - (res.predictedSteps as number)) <= 1 &&
    (res.ratioToRated as number) > 0.6 &&
    // a square blow delivers ≥ 80 % of ½·m·v² (fists: the pain-pulled punch is checked separately)
    (tool === "hands" || (res.squareShare as number) >= 0.8) &&
    (res.ratioToRated as number) <= 1.05 &&
    !!swingEv &&
    !!hitEv &&
    (res.shake as number) > 0;
  h.engine.dispose();
  return res;
}

/** Bat vs a box on a pedestal: momentum goes into the box along the swing; light boxes let the bat follow through. */
async function dynamicBoxTest(): Promise<Any> {
  const run = async (mass: number) => {
    const h = await makeHarness(canvas());
    h.tools.select("bat");
    h.addBox("pedestal", new Vector3(0.12, 0.7, 0.85), new Vector3(0.3, 1.4, 0.3), { mat: "steel" });
    const box = h.addBox("box", new Vector3(0.12, 1.55, 0.85), new Vector3(0.25, 0.3, 0.25), { mass, mat: "softwood", color: new Color3(0.7, 0.5, 0.3) });
    h.step(40);
    h.tools.debugSwing(0, h.tc);
    for (let k = 0; k < 60 && h.strikes.length === 0; k++) h.step(1);
    const s = h.strikes[0];
    const v = box.body.getLinearVelocity().clone();
    const lh = internals(h).lastHit;
    const phaseAfter = internals(h).machine.phase;
    const expectedV = s ? s.impulse / mass : 0;
    const dirDot = s ? (v.x * s.dir[0] + v.y * s.dir[1] + v.z * s.dir[2]) / Math.max(v.length(), 1e-6) : 0;
    h.engine.dispose();
    return { mass, strike: s ?? null, boxSpeed: r(v.length(), 2), expectedSpeed: r(expectedV, 2), velAlongStrike: r(dirDot, 3), outcome: lh?.outcome, phaseAfter, okMomentum: !!s && Math.abs(v.length() - expectedV) < 0.25 * expectedV + 0.2 && dirDot > 0.8 };
  };
  const light = await run(0.4);
  const heavy = await run(3);
  return { light, heavy, ok: light.okMomentum && heavy.okMomentum && light.outcome === "continue" && light.phaseAfter === "strike" && heavy.outcome === "stop" };
}

async function breakThroughTest(): Promise<Any> {
  const h = await makeHarness(canvas());
  h.tools.select("sledgehammer");
  // drywall sheet (breaks at 10 J in the stub) with a crate right behind it
  h.addBox("drywall", new Vector3(0, 1.4, 0.75 + 0.00625), new Vector3(3, 2.8, 0.0125), { mat: "gypsum", breakAt: 10, color: new Color3(0.9, 0.9, 0.88) });
  h.addBox("crate", new Vector3(0, 1.2, 1.05), new Vector3(0.6, 0.6, 0.3), { mat: "softwood", color: new Color3(0.6, 0.45, 0.3) });
  h.step(30);
  h.tools.debugSwing(0.5, h.tc);
  for (let k = 0; k < 90 && h.strikes.length < 2; k++) h.step(1);
  const out: Any = { strikes: h.strikes.map((s) => ({ body: s.bodyName, speed: s.speed, energy: s.energy, step: s.step })) };
  out.ok = h.strikes.length >= 2 && h.strikes[0].bodyName === "drywall" && h.strikes[1].bodyName === "crate" && h.strikes[1].speed < h.strikes[0].speed * 1.2;
  h.engine.dispose();
  return out;
}

async function kickTest(): Promise<Any> {
  const h = await makeHarness(canvas());
  h.addBox("crate", new Vector3(0, 0.3, 0.95), new Vector3(0.6, 0.6, 0.4), { mat: "softwood" });
  h.setView(new Vector3(0, 1.65, 0), 0, 0.5);
  h.step(10);
  h.tools.kick(h.tc);
  const busy = h.tools.busy;
  for (let k = 0; k < 50 && h.strikes.length === 0; k++) h.step(1);
  const s = h.strikes[0];
  const out: Any = { strike: s ?? null, busyDuringKick: busy, height: s ? r(s.point[1], 2) : null, headSpeed: r(internals(h).lastHit?.speed ?? 0, 2) };
  out.ok = !!s && s.source === "kick" && s.mass === 6 && s.point[1] >= 0.25 && s.point[1] <= 0.95 && (out.headSpeed as number) > 5 && (out.headSpeed as number) < 9 && busy;
  h.engine.dispose();
  return out;
}

async function stompTest(): Promise<Any> {
  const out: Any = {};
  // (a) box under the crosshair within reach
  {
    const h = await makeHarness(canvas());
    h.addBox("microwave", new Vector3(0, 0.15, 0.7), new Vector3(0.5, 0.3, 0.38), { mat: "steel" });
    h.setView(new Vector3(0, 1.65, 0), 0, 1.05);
    h.step(5);
    h.tools.stomp(h.tc);
    for (let k = 0; k < 50 && h.strikes.length === 0; k++) h.step(1);
    const s = h.strikes[0];
    out.underCrosshair = { strike: s ?? null };
    out.okA = !!s && s.bodyName === "microwave" && s.source === "stomp" && s.mass === 20 && Math.abs(s.point[1] - 0.3) < 0.01 && s.speed > 2.5 && s.speed < 5;
    h.engine.dispose();
  }
  // (b) looking ahead: stomp straight down under the feet → the floor
  {
    const h = await makeHarness(canvas());
    h.step(5);
    h.tools.stomp(h.tc);
    for (let k = 0; k < 50 && h.strikes.length === 0; k++) h.step(1);
    const s = h.strikes[0];
    out.underFeet = { strike: s ?? null };
    out.okB = !!s && s.bodyName === "floor" && Math.abs(s.point[1]) < 0.01 && Math.hypot(s.point[0], s.point[2]) < 0.35;
    h.engine.dispose();
  }
  out.ok = !!out.okA && !!out.okB;
  return out;
}

async function pryTest(): Promise<Any> {
  const h = await makeHarness(canvas());
  h.tools.select("crowbar");
  h.addBox("board", new Vector3(0, 1.3, 0.85), new Vector3(1.2, 0.8, 0.05), { mat: "softwood" });
  h.setView(new Vector3(0, 1.65, 0), 0, 0.35);
  h.step(30);
  // stress ramps up, bond pops at 1
  h.pryScript = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0, 0.3, 0.3, 0.3];
  h.input.press("alt");
  h.step(12);
  const callsWhileHeld = h.pries.length;
  h.input.release("alt");
  h.step(2);
  h.pryScript = [0.2, 0.2, 0.2];
  h.input.press("alt");
  h.step(3);
  h.input.release("alt");
  const p0 = h.pries[0];
  const out: Any = { callsUntilPop: callsWhileHeld, totalCalls: h.pries.length, first: p0 ?? null, forces: [...new Set(h.pries.map((p) => p.force))] };
  // dir = the board's surface normal pointing back at the player (−Z)
  out.ok = callsWhileHeld === 7 && h.pries.length === 10 && !!p0 && p0.force === 3000 && p0.dir[2] < -0.9 && Math.abs(p0.point[2] - 0.825) < 0.01;
  h.engine.dispose();
  return out;
}

async function sprayTest(): Promise<Any> {
  const h = await makeHarness(canvas());
  h.tools.select("extinguisher");
  // 100 g plastic cup on the floor ~1.3 m from the nozzle, under the crosshair
  const cup = h.addBox("cup", new Vector3(0.0, 0.06, 1.0), new Vector3(0.08, 0.12, 0.08), { mass: 0.1, mat: "plastic" });
  h.setView(new Vector3(0, 1.65, 0), 0, 1.0);
  h.step(30);
  const z0 = cup.mesh.position.z;
  h.input.press("alt");
  h.step(120);
  const z1 = cup.mesh.position.z;
  const level = (h.tools as unknown as { extinguisherLevel: number }).extinguisherLevel;
  const em = h.emitters[0];
  h.input.release("alt");
  h.step(2);
  const out: Any = { cupMoved: r(Math.hypot(cup.mesh.position.x, z1 - z0), 3), dz: r(z1 - z0, 3), level: r(level, 3), emitter: em ? { kind: em.kind, updates: em.positions.length, stopped: em.stopped } : null, loops: h.loops.map((l) => l) };
  out.ok = !!em && em.kind === "extinguisher" && em.positions.length > 100 && em.stopped && h.loops.length === 1 && h.loops[0].stopped && z1 - z0 > 0.05 && level < 0.85 && level > 0.75;
  h.engine.dispose();
  return out;
}

async function painTest(): Promise<Any> {
  const h = await makeHarness(canvas());
  h.addBox("pillar", new Vector3(0, 1.4, 0.5 + 0.1), new Vector3(1, 2.8, 0.2), { mat: "concrete" });
  h.step(10);
  h.tools.debugSwing(0, h.tc);
  for (let k = 0; k < 30 && h.strikes.length === 0; k++) h.step(1);
  const lh = internals(h).lastHit;
  const out: Any = { flashes: h.flashes, normalSpeed: r(lh?.normalSpeed ?? 0, 2), headSpeed: r(lh?.speed ?? 0, 2), outcome: lh?.outcome };
  out.ok = h.flashes.length === 1 && (h.flashes[0].c ?? 0) === 0xff2a1a && (lh?.normalSpeed ?? 99) < (lh?.speed ?? 0) * 0.65 && lh?.outcome === "recoil";
  h.engine.dispose();
  return out;
}

async function holdingAndSwitchTest(): Promise<Any> {
  const h = await makeHarness(canvas());
  h.step(5);
  // holding an object: fire belongs to the player's throw (not consumed, no swing)
  h.tc.holding = true;
  h.input.press("fire");
  h.step(3);
  const stillPressed = h.input.pressed("fire");
  h.input.release("fire");
  h.step(10);
  const noSwing = internals(h).machine.phase === "idle" && h.strikes.length === 0;
  h.tc.holding = false;
  h.step(20);
  // switching: current changes immediately, swings are blocked while the viewmodel lowers/raises
  h.tools.select("sledgehammer");
  const cur = h.tools.current;
  h.input.press("fire");
  h.step(1);
  const blocked = internals(h).machine.phase === "idle";
  h.input.release("fire");
  h.step(30);
  h.input.press("fire");
  h.step(1);
  const swingsAfter = internals(h).machine.phase === "windup";
  h.input.release("fire");
  h.step(60);
  const out: Any = { fireNotConsumedWhileHolding: stillPressed, noSwingWhileHolding: noSwing, currentAfterSelect: cur, blockedDuringSwitch: blocked, swingsAfterSwitch: swingsAfter };
  out.ok = stillPressed && noSwing && cur === "sledgehammer" && blocked && swingsAfter;
  h.engine.dispose();
  return out;
}

export async function probe() {
  const walls: Any[] = [];
  for (const t of TOOL_ORDER) {
    walls.push(await wallTest(t, 0));
    walls.push(await wallTest(t, 1));
  }
  const energyRatios = TOOL_ORDER.map((t) => {
    const n = walls.find((w) => w.tool === t && w.power === 0),
      c = walls.find((w) => w.tool === t && w.power === 1);
    const ratio = n && c && n.energy && c.energy ? r((c.energy as number) / (n.energy as number), 2) : null;
    return { tool: t, normal: n?.energy, charged: c?.energy, ratio, expected: r(TOOL_DEFS[t].chargeSpeedMul ** 2, 2) };
  });
  const results: Any = {
    walls: walls.map((w) => ({ ok: w.ok, tool: w.tool, p: w.power, share: w.squareShare, steps: `${w.stepsToHit}/${w.predictedSteps}`, z: `${w.pointZ}/${w.wallZ}`, y: w.pointYrel, v: w.headSpeed, vn: w.normalSpeed, ratio: w.ratioToRated, E: w.energy, out: w.outcome, shake: w.shake, stop: w.hitStop, fl: w.flashes, src: w.source, mat: w.strikerMat })),
    energyRatios,
    dynamicBox: await dynamicBoxTest(),
    breakThrough: await breakThroughTest(),
    kick: await kickTest(),
    stomp: await stompTest(),
    pry: await pryTest(),
    spray: await sprayTest(),
    pain: await painTest(),
    holdingAndSwitch: await holdingAndSwitchTest(),
  };
  const oks: Record<string, boolean> = { walls: walls.every((w) => w.ok), charged: energyRatios.every((e) => e.ratio !== null && e.ratio > 1.2) };
  for (const k of ["dynamicBox", "breakThrough", "kick", "stomp", "pry", "spray", "pain", "holdingAndSwitch"]) oks[k] = !!(results[k] as Any).ok;
  return { allOk: Object.values(oks).every(Boolean), oks, ...results };
}
