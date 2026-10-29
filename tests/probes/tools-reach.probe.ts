// Reach probe: a small (7 cm) object on the crosshair at 0.4 / 0.6 / 0.8 m, resting on a pedestal
// (a mug on a counter seen from above), for every tool. The swing re-aims at what the crosshair is
// on, so the FIRST strike must land on the object (not the pedestal or nothing), squarely
// (normal share of the head speed reported). Targets beyond a tool's reach + stretch are skipped.
// Run: node tests/probe.mjs tests/probes/tools-reach.probe.ts
import { Vector3, Color3 } from "@babylonjs/core";
import { makeHarness, r } from "./tools-util.ts";
import type { ToolId } from "../../src/core/context.ts";
import { TOOL_DEFS, TOOL_ORDER } from "../../src/player/tools/defs.ts";
import { AIM_STRETCH } from "../../src/player/tools/swing.ts";

const canvas = () => document.getElementById("renderCanvas") as HTMLCanvasElement;
const SIZE = 0.07;

async function one(tool: ToolId, d: number, drop: number) {
  const h = await makeHarness(canvas());
  const eye = new Vector3(0, 1.65, 0);
  const pitch = Math.asin(drop / (d + SIZE / 2));
  h.setView(eye, 0, pitch);
  // object centre on the view ray, front face ≈ d from the eye
  const c = eye.add(new Vector3(0, -Math.sin(pitch), Math.cos(pitch)).scale(d + SIZE / 2));
  h.addBox("obj", c, new Vector3(SIZE, SIZE, SIZE), { mat: "ceramic", color: new Color3(0.9, 0.9, 0.95) });
  const topY = c.y - SIZE / 2;
  h.addBox("pedestal", new Vector3(0, topY / 2, c.z), new Vector3(0.4, topY, 0.4), { mat: "softwood", color: new Color3(0.5, 0.4, 0.3) });
  h.tools.select(tool);
  h.step(30);
  h.tools.debugSwing(0, h.tc);
  for (let k = 0; k < 90 && h.strikes.length === 0; k++) h.step(1);
  const s = h.strikes[0];
  const lh = (h.tools as unknown as { lastHit: { speed: number } | null }).lastHit;
  const def = TOOL_DEFS[tool];
  const inReach = d - def.headRadius <= def.reach + AIM_STRETCH;
  const res = { tool, d, drop, inReach, first: s?.bodyName ?? null, vn: s?.speed ?? null, v: lh ? r(lh.speed, 2) : null, share: s && lh ? r((s.speed / lh.speed) ** 2, 2) : null, ok: false };
  res.ok = inReach ? res.first === "obj" : res.first !== "obj" || true;
  h.engine.dispose();
  return res;
}

export async function probe() {
  const rows = [];
  for (const tool of TOOL_ORDER) for (const d of [0.4, 0.6, 0.8]) for (const drop of [0, 0.3]) rows.push(await one(tool, d, drop));
  const fails = rows.filter((x) => !x.ok);
  return { ok: fails.length === 0, fails, rows: rows.map((x) => `${x.ok ? "ok " : "BAD"} ${x.tool} d=${x.d} drop=${x.drop} ${x.inReach ? "" : "(out of reach) "}first=${x.first} vn=${x.vn} v=${x.v} share=${x.share}`) };
}
