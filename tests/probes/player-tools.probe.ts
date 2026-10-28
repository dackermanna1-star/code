// Player ⇄ ToolSystem integration (real src/player/tools/toolSystem.ts): slots by key and wheel,
// holster (Q), fire routed to tools (swing → destruction.strike), charge meter value, kick (F) and
// stomp (G), crowbar pry (debug), tools lowered while holding (LMB throws instead of swinging),
// viewmodel screenshot.
import { Color3, PhysicsMotionType } from "@babylonjs/core";
import { Player } from "../../src/player/player.ts";
import { makeWorld, buildBackdrop, key, renderFrames } from "./player-util.ts";

export async function probe() {
  const w = await makeWorld();
  const { crate } = buildBackdrop(w);
  const wall = w.scene.getTransformNodeByName("wallN")!.physicsBody!;
  w.destruction.register(wall, { name: "Partition wall", mat: "gypsum", isStatic: true, grabbable: false, usable: null });
  const floor = w.scene.getTransformNodeByName("floor")!.physicsBody!;
  w.destruction.register(floor, { name: "Laminate floor", mat: "hardwood", isStatic: true, grabbable: false, usable: null });
  const p = new Player(w.ctx);
  (w.ctx as { player: unknown }).player = p;
  w.input.setEnabled(true);
  w.input.setFallback(true);
  const out: Record<string, unknown> = { hasTools: !!p.tools, initialTool: p.tool };
  const strikesBy = (src: string, from: number) => w.destruction.strikes.slice(from).filter((s) => s.source === src);

  // ---- slots
  p.teleport({ x: 0.2, y: 1.65, z: 2.6 }, 0, 0); // facing the north wall (z = 3.9), 1.3 m away
  w.step(5, true);
  key("Digit3", true);
  w.step(1, true);
  key("Digit3", false);
  w.step(30, true);
  out.afterDigit3 = p.tool;
  w.input.addWheel(-1); // wheel back = next slot
  w.step(30, true);
  out.afterWheelBack = p.tool;
  key("KeyQ", true);
  w.step(1, true);
  key("KeyQ", false);
  w.step(30, true);
  out.afterQ = p.tool;

  // ---- swing with the hammer at the wall (fire held briefly), 0.6 m from it
  p.teleport({ x: 0.2, y: 1.65, z: 3.3 }, 0, 0.05);
  p.setTool("hammer");
  w.step(40, true);
  const s0 = w.destruction.strikes.length;
  w.input.hold("fire", 0.05);
  w.step(60, true);
  const swing = strikesBy("tool", s0);
  out.hammerSwing = { strikes: swing.length, tool: swing[0]?.tool, speed: swing[0] ? Math.round(swing[0].speed * 100) / 100 : null, mass: swing[0]?.mass, body: swing[0]?.body === wall ? "wall" : swing[0] ? "other" : null };

  // ---- charge (hold fire ~0.8 s): HUD charge meter value comes from the tool system
  p.setTool("sledgehammer");
  w.step(50, true);
  const s1 = w.destruction.strikes.length;
  w.input.hold("fire", 0.9);
  let maxCharge = -1;
  const t0 = performance.now();
  while (performance.now() - t0 < 1300) {
    w.step(1, true);
    maxCharge = Math.max(maxCharge, p.charge);
    await new Promise((r) => setTimeout(r, 8));
  }
  w.step(60, true);
  const charged = strikesBy("tool", s1);
  out.sledgeCharged = { maxChargeSeen: Math.round(maxCharge * 100) / 100, strikes: charged.length, speed: charged[0] ? Math.round(charged[0].speed * 100) / 100 : null, tool: charged[0]?.tool };

  // ---- kick and stomp
  const s2 = w.destruction.strikes.length;
  p.teleport({ x: 0.2, y: 1.65, z: 3.1 }, 0, 0.2);
  w.step(10, true);
  key("KeyF", true);
  w.step(1, true);
  key("KeyF", false);
  w.step(40, true);
  key("KeyG", true);
  w.step(1, true);
  key("KeyG", false);
  w.step(60, true);
  out.kick = strikesBy("kick", s2).length;
  out.stomp = strikesBy("stomp", s2).length;

  // ---- pry (debug action selects the crowbar and holds alt)
  p.teleport({ x: 0.2, y: 1.65, z: 2.9 }, 0, 0.1);
  w.step(5, true);
  const pr0 = w.destruction.pries.length;
  p.debugAction("pry", 0.6);
  const t1 = performance.now();
  while (performance.now() - t1 < 900) {
    w.step(1, true);
    await new Promise((r) => setTimeout(r, 8));
  }
  out.pry = { tool: p.tool, calls: w.destruction.pries.length - pr0, force: w.destruction.pries[pr0]?.force ?? null };

  // ---- holding: tools lowered, LMB throws
  p.setTool("bat");
  w.step(30, true);
  p.teleport({ x: 0.2, y: 1.65, z: 0.4 }, 0, Math.atan2(1.65 - 0.15, 1.2));
  w.step(10, true);
  p.debugAction("grab");
  const holding = p.holding === crate;
  w.step(30, true);
  const s3 = w.destruction.strikes.length;
  const th0 = w.log.throw.length;
  w.input.tap("fire");
  w.step(30, true);
  out.holdingFire = { grabbed: holding, toolStrikes: strikesBy("tool", s3).length, thrown: w.log.throw.length - th0, holdingAfter: p.holding !== null };

  // ---- screenshot: sledgehammer viewmodel in front of the wall
  p.setTool("sledgehammer");
  p.teleport({ x: -0.6, y: 1.65, z: 2.2 }, 0.25, 0.12);
  w.step(50, true);
  await renderFrames(w, 4, () => p.update(1 / 60));
  return out;
}
