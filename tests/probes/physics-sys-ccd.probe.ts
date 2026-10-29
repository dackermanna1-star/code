// Physics system: tunnelling robustness for fast small bodies (glass shards, thrown pieces) with adaptive substeps.
// Requirement: a 2 cm piece at 30 m/s must not tunnel through a 5 cm static slab, at reasonable cost.
import { Vector3, Quaternion, type PhysicsBody } from "@babylonjs/core";
import { Layer } from "../../src/core/context.ts";
import { makeWorld, body, staticBox, dynBox, steps, check, r, type World } from "./physics-sys-util.ts";

const ZERO = { x: 0, y: 0, z: 0 };
const IDQ = { x: 0, y: 0, z: 0, w: 1 };

function hullBox(w: World, sx: number, sy: number, sz: number) {
  const p: number[] = [];
  for (const ix of [-0.5, 0.5]) for (const iy of [-0.5, 0.5]) for (const iz of [-0.5, 0.5]) p.push(ix * sx, iy * sy, iz * sz);
  return w.physics.hullShape(p, { density: 2500, layer: Layer.DEBRIS });
}

/** Fire `trials` pieces at a 5 cm static slab at x = 0; count centre crossings. mode: fresh | struck | struckExpect */
async function fire(size: [number, number, number], speed: number, spin: number, mode: "fresh" | "struck" | "struckExpect", opts: { adaptive?: boolean; substeps?: number } = {}) {
  const w = await makeWorld({ gravity: 0, adaptiveSubsteps: opts.adaptive ?? true, substeps: opts.substeps ?? 1 });
  staticBox(w, new Vector3(0, 0, 0), new Vector3(0.05, 6, 6));
  let tunnels = 0;
  let maxSub = 0;
  let thin = false;
  const trials = 10;
  for (let t = 0; t < trials; t++) {
    const rot = Quaternion.RotationYawPitchRoll(t * 0.7 + 0.2, t * 1.3 + 0.3, t * 0.4 + 0.1);
    const b = body(w, "p", new Vector3(-1.2, (t % 5) * 0.8 - 2, Math.floor(t / 5) * 1.5 - 0.75), "dynamic", hullBox(w, ...size), { rot });
    thin = (w.physics as unknown as { recs: WeakMap<PhysicsBody, { thin: boolean }> }).recs.get(b)!.thin;
    if (mode !== "fresh") steps(w, 3); // at rest for a few steps (no longer "fresh")
    b.setLinearVelocity(new Vector3(speed, 0, 0));
    b.setAngularVelocity(new Vector3(spin * 0.6, spin * 0.8, spin * 0.3));
    if (mode === "struckExpect") w.physics.expectFast(b);
    let prev = b.transformNode.position.x;
    let crossed = false;
    for (let i = 0; i < 25; i++) {
      w.physics.step(1 / 60);
      maxSub = Math.max(maxSub, w.physics.debugStats().substepsLast);
      const x = b.transformNode.position.x;
      if (prev < 0 && x > 0) crossed = true;
      prev = x;
    }
    if (crossed) tunnels++;
    const s = b.shape!;
    w.physics.disposeBody(b);
    b.transformNode.dispose();
    w.physics.disposeShape(s);
  }
  w.dispose();
  return { tunnels, maxSub, thin };
}

export async function probe() {
  const out: Record<string, unknown> = {};
  const pieces: Record<string, [number, number, number]> = {
    cube2cm: [0.02, 0.02, 0.02],
    sliver4x2x0_4cm: [0.04, 0.02, 0.004],
    shard10x10x0_5cm: [0.1, 0.1, 0.005],
    shard5x3x0_4cm: [0.05, 0.03, 0.004],
  };
  // ---- C1: fresh pieces (kick velocity set right after creation, like fracture fragments) — adaptive
  const table: Record<string, string> = {};
  let total = 0;
  let worstAt30 = 0;
  for (const [name, size] of Object.entries(pieces)) {
    for (const speed of [10, 30, 60]) {
      for (const spin of [0, 100]) {
        const res = await fire(size, speed, spin, "fresh");
        table[`${name}_v${speed}_spin${spin}`] = `${res.tunnels}/10 substeps≤${res.maxSub} thin=${res.thin}`;
        total += res.tunnels;
        if (speed <= 30) worstAt30 = Math.max(worstAt30, res.tunnels);
      }
    }
  }
  check(out, "C1_freshFragments_adaptive", worstAt30 === 0, { tunnelsTotal: total, table });

  // ---- C2: a resting thin shard struck to 30 m/s between steps: without / with expectFast
  {
    const a = await fire(pieces.sliver4x2x0_4cm, 30, 100, "struck");
    const b = await fire(pieces.sliver4x2x0_4cm, 30, 100, "struckExpect");
    const c = await fire(pieces.shard5x3x0_4cm, 30, 100, "struckExpect");
    check(out, "C2_struckShard", b.tunnels === 0 && c.tunnels === 0, { withoutExpectFast: a, withExpectFast_sliver: b, withExpectFast_shard: c });
  }

  // ---- C3: baseline — fixed 1 substep, adaptive off (what adaptive substepping protects against)
  {
    const res: Record<string, unknown> = {};
    for (const [name, size] of Object.entries(pieces)) res[name] = await fire(size, 30, 100, "fresh", { adaptive: false });
    out.C3_fixed1Substep_noAdaptive_v30_spin100 = res;
  }

  // ---- C4: a resting stack stays calm while flying shards switch the step to 2–4 substeps. Once the shards fly in
  // open space (nothing static within a step's reach: staticWithinReach) the step drops back to 1 substep while they
  // still fly — they cannot tunnel through anything (C1/C2 cover shards approaching a slab).
  {
    const w = await makeWorld();
    staticBox(w, new Vector3(0, -0.1, 0), new Vector3(20, 0.2, 20));
    const stack: PhysicsBody[] = [];
    for (let i = 0; i < 6; i++) stack.push(dynBox(w, new Vector3(3, 0.1 + i * 0.2, 0), new Vector3(0.4, 0.2, 0.3), 500));
    steps(w, 120);
    const before = stack.map((b) => b.transformNode.position.clone());
    let maxSub = 0;
    const shards: PhysicsBody[] = [];
    for (let k = 0; k < 20; k++) {
      const s = body(w, "shard", new Vector3(-3, 1 + (k % 4) * 0.2, (k % 5) * 0.3), "dynamic", hullBox(w, 0.04, 0.02, 0.004));
      s.setLinearVelocity(new Vector3(k % 2 ? 45 : -45, 2, 0));
      shards.push(s);
      for (let i = 0; i < 6; i++) {
        w.physics.step(1 / 60);
        maxSub = Math.max(maxSub, w.physics.debugStats().substepsLast);
      }
    }
    // shards still fly at 45 m/s, 1 m above the floor with nothing ahead: 1 substep; remove them, still 1
    const flyingSub = w.physics.debugStats().substepsLast;
    for (const s of shards) s.transformNode.dispose();
    steps(w, 30);
    let drift = 0;
    stack.forEach((b, i) => (drift = Math.max(drift, Vector3.Distance(b.transformNode.position, before[i]))));
    const idleSub = w.physics.debugStats().substepsLast;
    check(out, "C4_stackStableAcrossSubstepChanges", drift < 0.002 && maxSub >= 3 && flyingSub === 1 && idleSub === 1, { maxDriftM: r(drift, 5), maxSubstepsUsed: maxSub, whileShardsFlyInOpenSpace: flyingSub, substepsWhenIdle: idleSub });
    w.dispose();
  }
  void ZERO;
  void IDQ;
  return out;
}
