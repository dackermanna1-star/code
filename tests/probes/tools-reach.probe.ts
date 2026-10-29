// Reach probe: a small (7 cm) object on the crosshair at 0.4 / 0.6 / 0.8 m, resting on a pedestal
// (a mug on a counter / an eye-level shelf, set back from its front edge), for every tool. The swing re-aims at what the crosshair is
// on, so the FIRST strike must land on the object (not the pedestal or nothing), squarely
// (normal share of the head speed reported). Targets beyond a tool's reach + stretch are skipped.
// The screenshot shows the frame right after the first strike for a few representative cases.
// Run: node tests/probe.mjs tests/probes/tools-reach.probe.ts --screenshot /tmp/claude-0/tools-reach.png
import { Vector3, Color3 } from "@babylonjs/core";
import { makeHarness, renderTiles, r } from "./tools-util.ts";
import type { ToolId } from "../../src/core/context.ts";
import { TOOL_DEFS, TOOL_ORDER } from "../../src/player/tools/defs.ts";
import { AIM_STRETCH } from "../../src/player/tools/swing.ts";

const canvas = () => document.getElementById("renderCanvas") as HTMLCanvasElement;
const SIZE = 0.07;
/** Closest a support's front face can be to the eye (player capsule radius 0.3 m + skin). */
const PLAYER_CLEARANCE = 0.32;

async function one(tool: ToolId, d: number, drop: number, cv: HTMLCanvasElement = canvas(), keep = false) {
  const h = await makeHarness(cv);
  const eye = new Vector3(0, 1.65, 0);
  const pitch = Math.asin(drop / (d + SIZE / 2));
  h.setView(eye, 0, pitch);
  // object centre on the view ray, front face ≈ d from the eye
  const c = eye.add(new Vector3(0, -Math.sin(pitch), Math.cos(pitch)).scale(d + SIZE / 2));
  h.addBox("obj", c, new Vector3(SIZE, SIZE, SIZE), { mat: "ceramic", color: new Color3(0.9, 0.9, 0.95) });
  const topY = c.y - SIZE / 2;
  // 40 cm deep support centred under the object, but its front face never closer to the eye than
  // the player's capsule allows (radius 0.3 m): the object sits 8–16.5 cm back from the edge
  const front = Math.max(c.z - 0.2, PLAYER_CLEARANCE),
    back = c.z + 0.2;
  h.addBox("pedestal", new Vector3(0, topY / 2, (front + back) / 2), new Vector3(0.4, topY, back - front), { mat: "softwood", color: new Color3(0.5, 0.4, 0.3) });
  h.tools.select(tool);
  h.step(30);
  h.tools.debugSwing(0, h.tc);
  for (let k = 0; k < 90 && h.strikes.length === 0; k++) h.step(1);
  const s = h.strikes[0];
  const lh = (h.tools as unknown as { lastHit: { speed: number } | null }).lastHit;
  const def = TOOL_DEFS[tool];
  const inReach = d - def.headRadius <= def.reach + AIM_STRETCH;
  const res = { tool, d, drop, inReach, first: s?.bodyName ?? null, vn: s?.speed ?? null, v: lh ? r(lh.speed, 2) : null, share: s && lh ? r((s.speed / lh.speed) ** 2, 2) : null, ok: false };
  res.ok = inReach ? res.first === "obj" && (res.vn ?? 0) >= 1 : true;
  if (keep) {
    await h.renderReady(2);
    return { res, dispose: () => h.engine.dispose() };
  }
  h.engine.dispose();
  return res;
}

export async function probe() {
  const rows = [];
  for (const tool of TOOL_ORDER) for (const d of [0.4, 0.6, 0.8]) for (const drop of [0, 0.3]) rows.push(await one(tool, d, drop));
  // contact frames of representative cases (overhand punch, level side swing, chops onto the object)
  const shots: Array<[ToolId, number, number]> = [
    ["hands", 0.4, 0],
    ["hands", 0.6, 0.3],
    ["crowbar", 0.6, 0],
    ["sledgehammer", 0.6, 0],
    ["axe", 0.6, 0.3],
    ["bat", 0.6, 0],
    ["extinguisher", 0.6, 0.3],
    ["hammer", 0.4, 0.3],
  ];
  await renderTiles(4, 2, shots.length, async (i, cv) => {
    const [t, d, dr] = shots[i];
    const k = (await one(t, d, dr, cv, true)) as unknown as { res: { first: string | null; share: number | null }; dispose: () => void };
    return { label: `${t} d=${d} drop=${dr} first=${k.res.first} share=${k.res.share}`, dispose: k.dispose };
  });
  const fails = rows.filter((x) => !x.ok);
  return { ok: fails.length === 0, fails, rows: rows.map((x) => `${x.ok ? "ok " : "BAD"} ${x.tool} d=${x.d} drop=${x.drop} ${x.inReach ? "" : "(out of reach) "}first=${x.first} vn=${x.vn} v=${x.v} share=${x.share}`) };
}
