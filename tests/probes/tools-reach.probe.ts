// Reach probe: a small (7 cm) object on the crosshair, really resting on a support (a mug on a
// counter / a chest-height shelf / a wall shelf), set 8 cm back from the support's front face,
// for every tool and both a normal and a charged swing. The swing re-aims at what the crosshair is
// on, so the FIRST strike must land on the object (not the support or nothing) with a real normal
// speed. The support's front face is never closer to the eye than the player's capsule allows
// (0.32 m); where it would be, the object (i.e. the eye) moves back along the view instead.
// Scenes:
//   grid    object at view distance d ∈ {0.4, 0.6, 0.8} m and drop ∈ {0, 0.3} m below the eye
//   shelf   support at the capsule limit, shelf top 1.20 … 1.50 m (eye 1.65 m)
//   mugs    shelf top 1.40, neighbouring mugs 13 cm to each side, object at d = 0.45
//   wall    25 cm deep wall shelf, object at its back, d = 0.6
// Targets beyond a tool's reach + stretch are skipped.
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
/** Object's front face this far behind the support's front face. */
const SETBACK = 0.08;
const EYE_Y = 1.65;

interface Scene {
  label: string;
  /** Object centre (world; eye at (0, EYE_Y, 0) looking +Z). */
  c: Vector3;
  /** Support depth behind its front face (m). */
  depth: number;
  /** Lateral offsets (m) of neighbouring objects. */
  neighbours?: number[];
  /** Object front face this far behind the support's front face (default SETBACK). */
  setback?: number;
}

/** Object centre on the view ray at distance d (to its front face) with `drop` below the eye, pushed back so it rests SETBACK behind a front face ≥ PLAYER_CLEARANCE. */
function gridScene(d: number, drop: number): Scene {
  let dist = d + SIZE / 2;
  let pitch = Math.asin(drop / dist);
  let c = new Vector3(0, EYE_Y - Math.sin(pitch) * dist, Math.cos(pitch) * dist);
  const minZ = PLAYER_CLEARANCE + SETBACK + SIZE / 2;
  if (c.z < minZ) {
    // keep the object's height, move it back (= the eye steps back)
    c = new Vector3(0, c.y, minZ);
    dist = Math.hypot(EYE_Y - c.y, c.z);
    pitch = Math.asin((EYE_Y - c.y) / dist);
  }
  return { label: `grid d=${d} drop=${drop}`, c, depth: 0.4 };
}

/** Object resting on a top at `top` m, SETBACK behind a front face at the capsule limit. */
const shelfScene = (top: number, setback = SETBACK): Scene => ({
  label: `shelf top=${top} back=${setback}`,
  c: new Vector3(0, top + SIZE / 2, PLAYER_CLEARANCE + setback + SIZE / 2),
  depth: 0.4,
  setback,
});

function scenes(): Scene[] {
  const out: Scene[] = [];
  for (const d of [0.4, 0.6, 0.8]) for (const drop of [0, 0.3]) out.push(gridScene(d, drop));
  for (const top of [1.2, 1.25, 1.3, 1.35, 1.4, 1.45, 1.5]) for (const sb of [SETBACK, SETBACK - SIZE / 2]) out.push(shelfScene(top, sb));
  // neighbouring mugs: object front face at d = 0.45 along the view
  {
    const top = 1.4,
      cy = top + SIZE / 2;
    const dz = Math.sqrt(Math.max(0, (0.45 + SIZE / 2) ** 2 - (EYE_Y - cy) ** 2));
    out.push({ label: "mugs d=0.45 top=1.4", c: new Vector3(0, cy, dz), depth: 0.4, neighbours: [-0.13, 0.13] });
  }
  // 25 cm wall shelf at 1.35, object at the back, front face at d = 0.6
  {
    const top = 1.35,
      cy = top + SIZE / 2;
    const cz = Math.sqrt(Math.max(0, (0.6 + SIZE / 2) ** 2 - (EYE_Y - cy) ** 2));
    out.push({ label: "wall d=0.6 top=1.35", c: new Vector3(0, cy, cz), depth: 0.25 });
  }
  return out;
}

async function one(tool: ToolId, sc: Scene, power: number, cv: HTMLCanvasElement = canvas(), keep = false) {
  const h = await makeHarness(cv);
  const eye = new Vector3(0, EYE_Y, 0);
  const c = sc.c;
  const dist = Math.hypot(EYE_Y - c.y, c.z);
  h.setView(eye, 0, Math.asin((EYE_Y - c.y) / dist));
  h.addBox("obj", c, new Vector3(SIZE, SIZE, SIZE), { mat: "ceramic", color: new Color3(0.9, 0.9, 0.95) });
  for (const [i, x] of (sc.neighbours ?? []).entries()) h.addBox(`mug${i}`, new Vector3(x, c.y, c.z), new Vector3(SIZE, SIZE, SIZE), { mat: "ceramic", color: new Color3(0.8, 0.85, 0.9) });
  const topY = c.y - SIZE / 2;
  let front: number, back: number;
  if (sc.depth < 0.3) {
    // wall shelf: object at the back, a wall right behind it
    back = c.z + SIZE / 2 + 0.01;
    front = Math.max(back - sc.depth, PLAYER_CLEARANCE);
    h.addBox("wall", new Vector3(0, 1.3, back + 0.05), new Vector3(1.2, 2.6, 0.1), { mat: "drywall", color: new Color3(0.8, 0.8, 0.75) });
    h.addBox("support", new Vector3(0, topY - 0.01, (front + back) / 2), new Vector3(0.8, 0.02, back - front), { mat: "softwood", color: new Color3(0.5, 0.4, 0.3) });
  } else {
    front = Math.max(c.z - SIZE / 2 - (sc.setback ?? SETBACK), PLAYER_CLEARANCE);
    back = front + sc.depth;
    h.addBox("support", new Vector3(0, topY / 2, (front + back) / 2), new Vector3(0.6, topY, back - front), { mat: "softwood", color: new Color3(0.5, 0.4, 0.3) });
  }
  h.tools.select(tool);
  h.step(30);
  h.tools.debugSwing(power, h.tc);
  for (let k = 0; k < 90 && h.strikes.length === 0; k++) h.step(1);
  const s = h.strikes[0];
  const lh = (h.tools as unknown as { lastHit: { speed: number } | null }).lastHit;
  const def = TOOL_DEFS[tool];
  const d = dist - SIZE / 2;
  const inReach = d - def.headRadius <= def.reach + AIM_STRETCH;
  const res = { tool, scene: sc.label, power, d: r(d, 2), inReach, first: s?.bodyName ?? null, vn: s ? r(s.speed, 2) : null, v: lh ? r(lh.speed, 2) : null, share: s && lh ? r((s.speed / lh.speed) ** 2, 2) : null, ok: false };
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
  const all = scenes();
  for (const tool of TOOL_ORDER) for (const sc of all) for (const power of [0, 1]) rows.push(await one(tool, sc, power));
  // contact frames of representative cases
  const pick = (label: string) => all.find((s) => s.label === label)!;
  const shots: Array<[ToolId, string]> = [
    ["hands", "grid d=0.4 drop=0"],
    ["hands", "grid d=0.6 drop=0.3"],
    ["crowbar", "shelf top=1.4 back=0.08"],
    ["crowbar", "mugs d=0.45 top=1.4"],
    ["crowbar", "wall d=0.6 top=1.35"],
    ["sledgehammer", "grid d=0.6 drop=0"],
    ["axe", "grid d=0.6 drop=0.3"],
    ["bat", "shelf top=1.3 back=0.045"],
  ];
  await renderTiles(4, 2, shots.length, async (i, cv) => {
    const [t, l] = shots[i];
    const k = (await one(t, pick(l), 0, cv, true)) as unknown as { res: { first: string | null; share: number | null }; dispose: () => void };
    return { label: `${t} ${l} first=${k.res.first} share=${k.res.share}`, dispose: k.dispose };
  });
  const fails = rows.filter((x) => !x.ok);
  return {
    ok: fails.length === 0,
    fails: fails.map((x) => `${x.tool} ${x.scene} p=${x.power} first=${x.first} vn=${x.vn}`),
    rows: rows.map((x) => `${x.ok ? "ok " : "BAD"} ${x.tool} ${x.scene} p=${x.power} d=${x.d} ${x.inReach ? "" : "(out of reach) "}first=${x.first} vn=${x.vn} v=${x.v} share=${x.share}`),
  };
}
