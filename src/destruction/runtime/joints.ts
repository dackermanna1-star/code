// Joint groups → physics constraints (docs/ARCHITECTURE.md §4.4).
//
// A group's hinge/slider bonds between the same two islands form one constraint: hinges with
// ≥ 2 intact bonds → hinge along the group axis, 1 → ball-and-socket at that hinge (the door
// hangs and sags), 0 → free; sliders → prismatic joint while ≥ 1 runner is intact. A `latch`
// bond holds the joint closed: hinge = position motor at the closed angle with a torque
// derived from the latch strength; slider = limits pinned at the closed position. The use key
// releases the latch temporarily; swinging back near the closed pose re-latches. Self-closing
// springs and velocity motors (ceiling fans) are applied as torques before each physics step.
//
// Frames: pivots/axes are in the shared assembly frame, which is the local frame of every
// island node of the assembly (and of the per-assembly anchor body used for joints bonded to
// "world"), so constraints can be re-created exactly after splits. Hinge angles start at 0 at
// creation (the physics module aligns the perpendicular axes to the creation pose), so when a
// hinge is re-created away from its built pose the current angle is subtracted from its limits
// and motor target (`zeroAtCreation`). Slider travel is the separation of the two pivots along
// the axis; both pivots are the same assembly-frame point, so the travel already reads the
// absolute slide from the built pose (0 = closed) and slider limits are never offset.

import { TransformNode, Quaternion, Vector3, type PhysicsBody } from "@babylonjs/core";
import type { HingeOpts, SliderOpts } from "../../core/context.ts";
import type { Vec3 } from "../../geom/vec.ts";
import { planJointConstraints, type JointBondView } from "./graph.ts";
import type { Assembly, Bond, Island, JointConstraint, JointGroup } from "./types.ts";
import { PULL_CREEP } from "./interact.ts";
import { nodeToWorld, rotate, type World } from "./world.ts";

const TWO_PI = Math.PI * 2;
/** Holding force of hinge/slider bonds under sustained loads (N per J of strength): 90 J hinge ≈ 270 N. */
export const JOINT_HOLD_N_PER_J = 3;
/** Holding force of a latch bolt (N per J): 40 J latch ≈ 160 N at the bolt. */
export const LATCH_HOLD_N_PER_J = 4;
/** Sustained-load window (fixed steps): loads must persist this long to count (≈ 0.2 s). */
const LOAD_WINDOW = 12;
/** Latch torque (N·m) per joule of latch strength. */
const LATCH_TORQUE_PER_J = 30;
/** Hinge counts as closed within this angle (rad) for use/latching. */
const CLOSED_ANGLE = 0.05;
/** Opening beyond this angle (rad) arms automatic re-latching. */
const ARM_ANGLE = 0.14;
const CLOSED_SLIDE = 0.012;
const ARM_SLIDE = 0.04;

/** Optional joint helpers exposed by src/physics/physics.ts (feature-detected). */
interface PhysicsJointExt {
  setHingeMotor?(c: unknown, target: number, maxForce: number): void;
  setSliderLimits?(c: unknown, min: number, max: number): void;
}

/** Optional raw access exposed by src/physics/physics.ts (feature-detected). */
interface PhysicsRawExt {
  hk?: { HP_Constraint_GetAppliedImpulses?(id: unknown): [unknown, number[], number[]] };
  substeps?: number;
}

const IDQ = { x: 0, y: 0, z: 0, w: 1 };
const sA: Vec3 = { x: 0, y: 0, z: 0 };
const sAxis: Vec3 = { x: 0, y: 0, z: 0 };
const sPivot: Vec3 = { x: 0, y: 0, z: 0 };
const sCom: Vec3 = { x: 0, y: 0, z: 0 };
const tV = new Vector3();
const tW = new Vector3();
const tW2 = new Vector3();
const tP = new Vector3();

export class JointSystem {
  private readonly w: World;
  readonly dirty = new Set<JointGroup>();
  readonly springs = new Set<JointGroup>();
  readonly released = new Set<JointGroup>();
  readonly motors = new Set<JointGroup>();
  /** Limits/motor targets are relative to the pose at constraint creation (see header). */
  zeroAtCreation = true;
  /** +1 when the physics hinge angle grows like qaxisAngle(axis, +θ) of moving vs fixed. */
  angleSign = 1;
  /** +1 when the physics slider position grows when the moving body moves along +axis. */
  slideSign = 1;
  constraintCount = 0;

  constructor(w: World) {
    this.w = w;
  }

  register(asm: Assembly): void {
    for (const g of asm.groups.values()) {
      if ((g.def.spring ?? 0) > 0) this.springs.add(g);
      this.dirty.add(g);
    }
  }

  markDirty(g: JointGroup): void {
    if (g.asm.alive) this.dirty.add(g);
  }

  onBondBroken(b: Bond): void {
    const g = b.group;
    if (!g) return;
    if (b === g.latch) {
      g.released = false;
      this.released.delete(g);
    }
    this.dirty.add(g);
  }

  /** Groups touching an island (via its parts' bonds). */
  groupsOf(island: Island, out: Set<JointGroup> = new Set()): Set<JointGroup> {
    for (const p of island.parts) for (const b of p.bonds) if (b.group) out.add(b.group);
    return out;
  }

  markIsland(island: Island): void {
    for (const g of this.groupsOf(island)) this.dirty.add(g);
  }

  /** Remove every constraint attached to an island (before its body is disposed). */
  detachIsland(island: Island): void {
    const groups = this.groupsOf(island);
    // constraints may also reference the island after its parts left (keeper bookkeeping)
    for (const asmG of island.asm.groups.values()) groups.add(asmG);
    for (const g of groups) {
      let changed = false;
      for (let i = g.constraints.length - 1; i >= 0; i--) {
        const jc = g.constraints[i];
        if (jc.moving !== island && jc.fixed !== island) continue;
        this.removeConstraint(jc);
        g.constraints.splice(i, 1);
        changed = true;
      }
      if (changed) this.dirty.add(g);
    }
  }

  removeGroup(g: JointGroup): void {
    for (const jc of g.constraints) this.removeConstraint(jc);
    g.constraints.length = 0;
    this.dirty.delete(g);
    this.springs.delete(g);
    this.released.delete(g);
    this.motors.delete(g);
  }

  private removeConstraint(jc: JointConstraint): void {
    try {
      this.w.physics.removeConstraint(jc.c);
    } catch (e) {
      this.w.warnOnce("rmc", `removeConstraint failed: ${(e as Error).message}`);
    }
    this.constraintCount--;
  }

  refreshDirty(): void {
    if (!this.dirty.size) return;
    const list = [...this.dirty];
    this.dirty.clear();
    for (const g of list) {
      if (!g.asm.alive) continue;
      try {
        this.refresh(g);
      } catch (e) {
        this.w.warnOnce(`joint:${(e as Error).message}`, `joint refresh failed: ${(e as Error).stack ?? e}`);
      }
    }
  }

  /** Is the latch currently holding this group's joint closed? */
  latched(g: JointGroup): boolean {
    return g.latchIntact && !g.released;
  }

  private refresh(g: JointGroup): void {
    const views: JointBondView[] = [];
    const islands = new Map<number, Island>();
    for (const b of g.bonds) {
      const mi = b.a.island;
      const fi = b.b ? b.b.island : null;
      const alive = b.alive && !!mi && mi.alive && (!b.b || (!!fi && fi.alive));
      if (mi) islands.set(mi.id, mi);
      if (fi) islands.set(fi.id, fi);
      views.push({ alive, moving: mi ? mi.id : -2, fixed: b.b ? (fi ? fi.id : -3) : -1, anchor: b.anchor });
    }
    const plans = planJointConstraints(g.kind, views);
    const latch = g.latch;
    const keep: JointConstraint[] = [];
    const wanted: Array<{ plan: (typeof plans)[number]; sig: string; latched: boolean }> = [];
    for (const plan of plans) {
      const latchedHere =
        this.latched(g) &&
        !!latch &&
        plan.kind !== "ball" &&
        latch.a.island?.id === plan.moving &&
        (latch.b ? latch.b.island?.id === plan.fixed : plan.fixed === -1);
      const moving = islands.get(plan.moving);
      const fixed = plan.fixed >= 0 ? islands.get(plan.fixed) : null;
      // both sides static: nothing to constrain (re-evaluated when one becomes dynamic)
      if (!moving || moving.isStatic) {
        if (!fixed || fixed.isStatic || plan.fixed === -1) continue;
      }
      const sig = `${plan.kind}|${plan.moving}|${plan.fixed}|${plan.bonds.join(",")}|${latchedHere ? 1 : 0}`;
      wanted.push({ plan, sig, latched: latchedHere });
    }
    for (const jc of g.constraints) {
      const ok = jc.moving.alive && (!jc.fixed || jc.fixed.alive);
      let idx = ok ? wanted.findIndex((x) => x.sig === jc.sig) : -1;
      if (idx < 0 && ok) {
        // same joint, only the latch state changed: toggle it in place (no constraint churn —
        // Havok's constraint count never shrinks)
        const base = jc.sig.slice(0, -1);
        const j = wanted.findIndex((x) => x.sig.slice(0, -1) === base);
        if (j >= 0 && this.setLatchInPlace(g, jc, wanted[j].latched)) idx = j;
      }
      if (idx >= 0) {
        keep.push(jc);
        wanted.splice(idx, 1);
      } else this.removeConstraint(jc);
    }
    g.constraints = keep;
    for (const wnt of wanted) {
      const moving = islands.get(wnt.plan.moving)!;
      const fixed = wnt.plan.fixed >= 0 ? islands.get(wnt.plan.fixed)! : null;
      const bonds = wnt.plan.bonds.map((i) => g.bonds[i]);
      const jc = this.create(g, wnt.plan.kind, moving, fixed, wnt.plan.pivot, bonds, wnt.latched, wnt.sig);
      if (jc) g.constraints.push(jc);
    }
    if (g.motorSpeed !== 0) this.motors.add(g);
  }

  /** Engage/release a latch on an existing constraint; false if the physics API can't. */
  private setLatchInPlace(g: JointGroup, jc: JointConstraint, latched: boolean): boolean {
    const ext = this.w.physics as unknown as PhysicsJointExt;
    if (jc.kind === "hinge" && typeof ext.setHingeMotor === "function" && g.latch) {
      // the current angle may differ from the creation pose: the motor target is the built pose
      ext.setHingeMotor(jc.c, this.angleSign * (0 - jc.offset), latched ? latchTorque(g.latch.max) : 0);
    } else if (jc.kind === "slider" && typeof ext.setSliderLimits === "function") {
      let min = Number.isFinite(g.def.min) ? g.def.min : 0;
      let max = Number.isFinite(g.def.max) ? g.def.max : 0;
      if (latched) min = max = 0;
      // absolute travel (slider limits are never offset, see header)
      const a = this.slideSign * min,
        b = this.slideSign * max;
      ext.setSliderLimits(jc.c, Math.min(a, b), Math.max(a, b));
    } else return false;
    jc.latched = latched;
    jc.sig = jc.sig.slice(0, -1) + (latched ? "1" : "0");
    return true;
  }

  private anchorBody(asm: Assembly): PhysicsBody {
    if (asm.anchorBody) return asm.anchorBody;
    const node = new TransformNode(`d${asm.id}.anchor`, this.w.scene);
    node.position.set(asm.xf.p.x, asm.xf.p.y, asm.xf.p.z);
    node.rotationQuaternion = new Quaternion(asm.xf.q.x, asm.xf.q.y, asm.xf.q.z, asm.xf.q.w);
    node.rotationQuaternion.normalize();
    node.computeWorldMatrix(true);
    asm.anchorNode = node;
    asm.anchorBody = this.w.physics.createBody(node, "static", false);
    return asm.anchorBody;
  }

  private create(g: JointGroup, kind: "hinge" | "ball" | "slider", moving: Island, fixed: Island | null, pivot: Vec3, bonds: Bond[], latched: boolean, sig: string): JointConstraint | null {
    const w = this.w;
    if (!moving.body) return null;
    const fixedBody = fixed ? fixed.body : this.anchorBody(g.asm);
    if (!fixedBody) return null;
    const axis = unit(g.def.axis);
    const piv = new Vector3(pivot.x, pivot.y, pivot.z);
    const ax = new Vector3(axis.x, axis.y, axis.z);
    let offset = 0;
    let c;
    if (kind === "ball") {
      c = w.physics.ball(fixedBody, moving.body, piv, piv.clone(), false);
    } else if (kind === "hinge") {
      if (this.zeroAtCreation) offset = this.hingeAngleOf(moving, fixed, g.asm, axis);
      const o: HingeOpts = { pivotA: piv, pivotB: piv.clone(), axisA: ax, axisB: ax.clone(), collideConnected: false };
      const min = g.def.min,
        max = g.def.max;
      const free = !Number.isFinite(min) || !Number.isFinite(max) || max - min >= TWO_PI - 1e-6 || !(max > min);
      if (!free) {
        const a = this.angleSign * (min - offset),
          b = this.angleSign * (max - offset);
        o.min = Math.min(a, b);
        o.max = Math.max(a, b);
      }
      if (g.def.friction && g.def.friction > 0) o.friction = g.def.friction;
      if (latched && g.latch) o.motor = { target: this.angleSign * (0 - offset), maxForce: latchTorque(g.latch.max) };
      c = w.physics.hinge(fixedBody, moving.body, o);
    } else {
      // offset stays 0: the pivot separation measures the absolute slide (see header)
      let min = Number.isFinite(g.def.min) ? g.def.min : 0;
      let max = Number.isFinite(g.def.max) ? g.def.max : 0;
      if (latched) min = max = 0; // pinned closed
      const a = this.slideSign * min,
        b = this.slideSign * max;
      const o: SliderOpts = { pivotA: piv, pivotB: piv.clone(), axisA: ax, axisB: ax.clone(), min: Math.min(a, b), max: Math.max(a, b), collideConnected: false };
      if (g.def.friction && g.def.friction > 0) o.friction = g.def.friction;
      c = w.physics.slider(fixedBody, moving.body, o);
    }
    this.constraintCount++;
    w.physics.wake(moving.body);
    return { c, kind, moving, fixed, bonds, pivot: { ...pivot }, latched, offset, sig, fEma: 0, tAxisEma: 0, tPerpEma: 0, hist: new Float32Array(LOAD_WINDOW * 3), histPos: 0, histCount: 0 };
  }

  // ------------------------------------------------------------------ joint coordinates

  private fixedPose(fixed: Island | null, asm: Assembly): { p: Vec3; q: { x: number; y: number; z: number; w: number } } {
    if (fixed) return { p: fixed.node.position, q: fixed.node.rotationQuaternion ?? { x: 0, y: 0, z: 0, w: 1 } };
    return { p: asm.xf.p, q: asm.xf.q };
  }

  /** Hinge angle of `moving` relative to `fixed` about `axis` (assembly frame), 0 = built pose. */
  hingeAngleOf(moving: Island, fixed: Island | null, asm: Assembly, axis: Vec3): number {
    const qM = moving.node.rotationQuaternion ?? { x: 0, y: 0, z: 0, w: 1 };
    const qF = this.fixedPose(fixed, asm).q;
    // q_rel = conj(qF) ⊗ qM
    const fx = -qF.x,
      fy = -qF.y,
      fz = -qF.z,
      fw = qF.w;
    const rw = fw * qM.w - fx * qM.x - fy * qM.y - fz * qM.z;
    const rx = fw * qM.x + fx * qM.w + fy * qM.z - fz * qM.y;
    const ry = fw * qM.y - fx * qM.z + fy * qM.w + fz * qM.x;
    const rz = fw * qM.z + fx * qM.y - fy * qM.x + fz * qM.w;
    let a = 2 * Math.atan2(rx * axis.x + ry * axis.y + rz * axis.z, rw);
    if (a > Math.PI) a -= TWO_PI;
    else if (a <= -Math.PI) a += TWO_PI;
    return a;
  }

  /** Slider displacement of `moving` relative to `fixed` along `axis` (assembly frame), 0 = built pose. */
  slideOf(moving: Island, fixed: Island | null, asm: Assembly, axis: Vec3): number {
    const f = this.fixedPose(fixed, asm);
    const d = { x: moving.node.position.x - f.p.x, y: moving.node.position.y - f.p.y, z: moving.node.position.z - f.p.z };
    const l = rotate(f.q, d, { x: 0, y: 0, z: 0 }, true);
    return l.x * axis.x + l.y * axis.y + l.z * axis.z;
  }

  /** Current joint coordinate of a group (angle or slide), using its first constraint. */
  coordinate(g: JointGroup): number | null {
    const jc = g.constraints[0];
    if (!jc) return null;
    const axis = unit(g.def.axis);
    return g.kind === "hinge" ? this.hingeAngleOf(jc.moving, jc.fixed, g.asm, axis) : this.slideOf(jc.moving, jc.fixed, g.asm, axis);
  }

  /** World axis and pivot of a constraint (axis fixed to the fixed side). */
  worldAxis(g: JointGroup, jc: JointConstraint): { axis: Vec3; pivot: Vec3 } {
    const axis = { x: 0, y: 0, z: 0 },
      pivot = { x: 0, y: 0, z: 0 };
    this.worldAxisInto(g, jc, axis, pivot);
    return { axis, pivot };
  }

  /** Allocation-free worldAxis(). */
  worldAxisInto(g: JointGroup, jc: JointConstraint, axisOut: Vec3, pivotOut: Vec3): void {
    const fixed = jc.fixed;
    const q = fixed ? (fixed.node.rotationQuaternion ?? IDQ) : g.asm.xf.q;
    const p = fixed ? fixed.node.position : g.asm.xf.p;
    const a = g.def.axis;
    const l = Math.hypot(a.x, a.y, a.z) || 1;
    sA.x = a.x / l;
    sA.y = a.y / l;
    sA.z = a.z / l;
    rotate(q, sA, axisOut, false);
    rotate(q, jc.pivot, pivotOut, false);
    pivotOut.x += p.x;
    pivotOut.y += p.y;
    pivotOut.z += p.z;
  }

  /** The joint group in which `island` is the moving side (door/drawer), if any. */
  movingGroupOf(island: Island): JointGroup | null {
    for (const p of island.parts) {
      for (const b of p.bonds) {
        const g = b.group;
        if (!g || b.a !== p || !b.alive || b === g.latch) continue;
        if (g.constraints.some((c) => c.moving === island)) return g;
      }
    }
    return null;
  }

  // ------------------------------------------------------------------------- latches

  release(g: JointGroup): void {
    if (!g.latchIntact || g.released) return;
    g.released = true;
    g.armed = false;
    g.releaseTime = this.w.now;
    this.released.add(g);
    // Re-create without the motor. (Setting the motor type to NONE is ignored by Havok once a
    // motor was set — docs/api-notes/physics-constraints-character.md — so no in-place release.)
    this.dirty.add(g);
    this.refreshDirty();
  }

  // ---------------------------------------------------------------------------- use

  /** E on a door/drawer island: open (releasing the latch) or close. */
  use(g: JointGroup, island: Island, point: Vec3, from: Vec3): boolean {
    const jc = g.constraints.find((c) => c.moving === island) ?? g.constraints[0];
    if (!jc || !island.body || island.isStatic) return false;
    const { axis, pivot } = this.worldAxis(g, jc);
    const m = island.mass;
    if (g.kind === "hinge" && jc.kind !== "slider") {
      const theta = this.hingeAngleOf(jc.moving, jc.fixed, g.asm, unit(g.def.axis));
      const r = { x: point.x - pivot.x, y: point.y - pivot.y, z: point.z - pivot.z };
      const t = cross(axis, r);
      const tl = Math.hypot(t.x, t.y, t.z);
      if (tl < 1e-4) return false;
      const lo = Number.isFinite(g.def.min) ? g.def.min : -Math.PI,
        hi = Number.isFinite(g.def.max) ? g.def.max : Math.PI;
      let sign: number;
      if (Math.abs(theta) < 0.08 || this.latched(g)) {
        this.release(g);
        const canPos = hi > 0.05,
          canNeg = lo < -0.05;
        if (canPos && !canNeg) sign = 1;
        else if (canNeg && !canPos) sign = -1;
        else {
          // two-way door: push away from the player
          const away = { x: point.x - from.x, y: point.y - from.y, z: point.z - from.z };
          sign = t.x * away.x + t.y * away.y + t.z * away.z >= 0 ? 1 : -1;
        }
      } else {
        sign = theta > 0 ? -1 : 1;
        if (g.released) g.armed = true;
      }
      // impulse for a natural push: ω ≈ 1.4 rad/s about the hinge (I ≈ m(d² + L²/12))
      const c = this.w.toWorldVec(island, island.com);
      const rc = { x: c.x - pivot.x, y: c.y - pivot.y, z: c.z - pivot.z };
      const al = rc.x * axis.x + rc.y * axis.y + rc.z * axis.z;
      const d2 = (rc.x - al * axis.x) ** 2 + (rc.y - al * axis.y) ** 2 + (rc.z - al * axis.z) ** 2;
      const inertia = m * (d2 + (island.extent * island.extent) / 12);
      const J = Math.min(80, Math.max(0.5, (inertia * 1.4) / tl));
      const k = (sign * J) / tl;
      tV.set(t.x * k, t.y * k, t.z * k);
      tP.set(point.x, point.y, point.z);
      island.body.applyImpulse(tV, tP);
      this.w.physics.wake(island.body);
      return true;
    }
    if (g.kind === "slider") {
      const s = this.slideOf(jc.moving, jc.fixed, g.asm, unit(g.def.axis));
      const lo = Number.isFinite(g.def.min) ? g.def.min : 0,
        hi = Number.isFinite(g.def.max) ? g.def.max : 0;
      const openDir = hi > Math.abs(lo) ? 1 : -1;
      const span = Math.max(Math.abs(hi), Math.abs(lo), 1e-3);
      const isOpen = Math.abs(s) > span * 0.4;
      if (!isOpen) this.release(g);
      else if (g.released) g.armed = true;
      const sign = isOpen ? -Math.sign(s || openDir) : openDir;
      const J = Math.min(40, Math.max(0.3, m * 0.6));
      tV.set(axis.x * sign * J, axis.y * sign * J, axis.z * sign * J);
      tP.set(point.x, point.y, point.z);
      island.body.applyImpulse(tV, tP);
      this.w.physics.wake(island.body);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------- before physics

  beforePhysics(dt: number): void {
    if (this.released.size) this.checkRelatch();
    if (this.springs.size) for (const g of this.springs) this.applySpring(g, dt);
    if (this.motors.size) for (const g of this.motors) this.applyMotor(g, dt);
  }

  /** True when joint bonds are loaded from the solver's constraint reactions (see jointLoads). */
  get loadsActive(): boolean {
    const raw = this.w.physics as unknown as PhysicsRawExt;
    return !!raw.hk && typeof raw.hk.HP_Constraint_GetAppliedImpulses === "function";
  }

  /**
   * Sustained constraint reactions damage joint bonds (call after each physics step): the
   * solver's applied impulses give the load the joint resists from steady forces — things piled
   * on an open drawer or lid, the player standing on a door or drawer, a door hanging by its
   * last hinge. The raw Havok read covers the last substep (force = impulse / substep dt, the
   * same as the step average for steady loads). The player's grab is a motor constraint solved
   * in every substep, so its hand force IS in these reactions — and Interactions.pull() models
   * that same hand force against the joint bonds. To count it once, constraints whose moving
   * island was pulled this step take no damage here (their load history is still recorded).
   * Only SUSTAINED load counts: the minimum over the last LOAD_WINDOW steps (slams and kicks are
   * spikes, left to the damage model). Per bond:
   *   F_b = F/n + τ⊥/spacing (+ τ_axis/(n·0.25 m) when forced against a limit, unlatched)
   *   hold = max(JOINT_HOLD·strength, 2 × the share of the moving part's own weight)
   *   latch: F = τ_axis / r_latch while latched, hold = LATCH_HOLD·strength
   *   damage rate = max(0, F_b − hold) × PULL_CREEP.
   */
  jointLoads(dt: number): void {
    const raw = this.w.physics as unknown as PhysicsRawExt;
    const hk = raw.hk;
    if (!hk || typeof hk.HP_Constraint_GetAppliedImpulses !== "function") return;
    const h = dt / Math.max(1, raw.substeps ?? 1);
    let broke = false;
    for (const asm of this.w.assemblies.values()) {
      if (!asm.groups.size) continue;
      for (const g of asm.groups.values()) {
        for (const jc of g.constraints) {
          const pd = (jc.c as unknown as { _pluginData?: unknown[] })._pluginData;
          if (!pd || !pd.length || !jc.moving.body || jc.moving.isStatic) continue;
          const r = hk.HP_Constraint_GetAppliedImpulses(pd[0]);
          const lin = r[1],
            ang = r[2];
          if (!lin || !ang) continue;
          this.worldAxisInto(g, jc, sAxis, sPivot);
          const axis = sAxis,
            pivot = sPivot;
          const F = Math.hypot(lin[0], lin[1], lin[2]) / h;
          const ta = (ang[0] * axis.x + ang[1] * axis.y + ang[2] * axis.z) / h;
          const tp = Math.hypot(ang[0] / h - ta * axis.x, ang[1] / h - ta * axis.y, ang[2] / h - ta * axis.z);
          if (!Number.isFinite(F) || !Number.isFinite(ta) || !Number.isFinite(tp)) continue;
          // sustained load = minimum over the window (ring buffer, 3 metrics)
          const H = jc.hist;
          const slot = (jc.histPos = (jc.histPos + 1) % LOAD_WINDOW) * 3;
          H[slot] = F;
          H[slot + 1] = Math.abs(ta);
          H[slot + 2] = tp;
          if (jc.histCount < LOAD_WINDOW) {
            jc.histCount++;
            continue;
          }
          let sF = Infinity,
            sA = Infinity,
            sP = Infinity;
          for (let i = 0; i < LOAD_WINDOW * 3; i += 3) {
            if (H[i] < sF) sF = H[i];
            if (H[i + 1] < sA) sA = H[i + 1];
            if (H[i + 2] < sP) sP = H[i + 2];
          }
          jc.fEma = sF;
          jc.tAxisEma = sA;
          jc.tPerpEma = sP;
          // the hand force of a pull this step is already applied by Interactions.pull()
          if (jc.moving.pulledStep === this.w.stepIndex) continue;
          const bonds = jc.bonds;
          let alive = 0;
          let spacing = 0.1;
          for (let i = 0; i < bonds.length; i++) {
            if (!bonds[i].alive) continue;
            alive++;
            for (let j = i + 1; j < bonds.length; j++) {
              if (!bonds[j].alive) continue;
              const a = bonds[i].anchor,
                b = bonds[j].anchor;
              spacing = Math.max(spacing, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
            }
          }
          const n = Math.max(1, alive);
          const latchHolds = jc.latched && !!g.latch && g.latch.alive;
          let perBond = sF / n + (jc.kind === "ball" ? 0 : sP / spacing);
          if (!latchHolds && jc.kind === "hinge") perBond += sA / (n * 0.25);
          // the joint must carry the moving part's own weight forever: never fail below 2× that
          const m = jc.moving;
          const com = nodeToWorld(m.node, m.com, sCom);
          const rx = com.x - pivot.x,
            ry = com.y - pivot.y,
            rz = com.z - pivot.z;
          const along = rx * axis.x + ry * axis.y + rz * axis.z;
          const dPerp = Math.hypot(rx - along * axis.x, ry - along * axis.y, rz - along * axis.z);
          const weight = m.mass * 9.81;
          const staticShare = weight / n + (jc.kind === "ball" ? 0 : (weight * dPerp) / spacing);
          for (const b of bonds) {
            if (!b.alive) continue;
            const hold = Math.max(JOINT_HOLD_N_PER_J * b.max, 2 * staticShare);
            const excess = perBond - hold;
            if (excess > 0 && this.w.damageBond(b, excess * PULL_CREEP * dt)) broke = true;
          }
          if (latchHolds && g.latch) {
            const la = g.latch.anchor;
            const ax = unit(g.def.axis);
            const d = { x: la.x - jc.pivot.x, y: la.y - jc.pivot.y, z: la.z - jc.pivot.z };
            const al = d.x * ax.x + d.y * ax.y + d.z * ax.z;
            const rL = Math.max(0.05, Math.hypot(d.x - al * ax.x, d.y - al * ax.y, d.z - al * ax.z));
            const excess = sA / rL - LATCH_HOLD_N_PER_J * g.latch.max;
            if (excess > 0 && this.w.damageBond(g.latch, excess * PULL_CREEP * dt)) broke = true;
          }
        }
      }
    }
    if (broke) this.refreshDirty();
  }

  private checkRelatch(): void {
    const now = this.w.now;
    for (const g of [...this.released]) {
      if (!g.latchIntact || !g.asm.alive) {
        g.released = false;
        this.released.delete(g);
        continue;
      }
      const x = this.coordinate(g);
      if (x === null) continue;
      const ax = Math.abs(x);
      const arm = g.kind === "hinge" ? ARM_ANGLE : ARM_SLIDE;
      const closed = g.kind === "hinge" ? CLOSED_ANGLE : CLOSED_SLIDE;
      if (!g.armed && ax > arm) g.armed = true;
      if ((g.armed || now - g.releaseTime > 8) && ax < closed) {
        g.released = false;
        this.released.delete(g);
        this.dirty.add(g);
      }
    }
    if (this.dirty.size) this.refreshDirty();
  }

  private relAngVel(jc: JointConstraint, axis: Vec3): number {
    let wx = 0,
      wy = 0,
      wz = 0;
    if (jc.moving.body && !jc.moving.isStatic) {
      jc.moving.body.getAngularVelocityToRef(tW);
      wx = tW.x;
      wy = tW.y;
      wz = tW.z;
    }
    if (jc.fixed && jc.fixed.body && !jc.fixed.isStatic) {
      jc.fixed.body.getAngularVelocityToRef(tW2);
      wx -= tW2.x;
      wy -= tW2.y;
      wz -= tW2.z;
    }
    return wx * axis.x + wy * axis.y + wz * axis.z;
  }

  private applyTorque(jc: JointConstraint, axis: Vec3, tau: number, dt: number): void {
    const imp = tau * dt;
    if (!(Math.abs(imp) > 1e-7) || !Number.isFinite(imp)) return;
    if (jc.moving.body && !jc.moving.isStatic) {
      tW.set(axis.x * imp, axis.y * imp, axis.z * imp);
      jc.moving.body.applyAngularImpulse(tW);
    }
    if (jc.fixed && jc.fixed.body && !jc.fixed.isStatic) {
      tW.set(-axis.x * imp, -axis.y * imp, -axis.z * imp);
      jc.fixed.body.applyAngularImpulse(tW);
    }
  }

  /**
   * Self-closing spring (+ light damping) towards the built pose. Applied continuously while the
   * joint is awake, never to a sleeping one: the sleep assist only puts a joint to sleep once the
   * spring is in equilibrium with whatever holds it (gravity, a limit, friction), anything that
   * moves it again wakes it first, and an impulse every step would keep it awake forever. (The
   * former dead zone near the closed pose made a sprung pedal hanging under gravity chatter
   * around the zone's edge instead of settling.)
   */
  private applySpring(g: JointGroup, dt: number): void {
    const jc = g.constraints[0];
    const k = g.def.spring ?? 0;
    if (!jc || !(k > 0) || !jc.moving.body || jc.moving.isStatic || jc.latched) return;
    const ph = this.w.physics;
    if (!ph.isAwake(jc.moving.body) && (!jc.fixed || jc.fixed.isStatic || !jc.fixed.body || !ph.isAwake(jc.fixed.body))) return;
    this.worldAxisInto(g, jc, sAxis, sPivot);
    const axis = sAxis;
    if (g.kind === "hinge") {
      const theta = this.hingeAngleOf(jc.moving, jc.fixed, g.asm, unit(g.def.axis));
      const tau = -k * theta - 0.15 * k * this.relAngVel(jc, axis);
      this.applyTorque(jc, axis, tau, dt);
    } else {
      const s = this.slideOf(jc.moving, jc.fixed, g.asm, unit(g.def.axis));
      jc.moving.body.getLinearVelocityToRef(tV);
      const v = tV.x * axis.x + tV.y * axis.y + tV.z * axis.z;
      const F = -k * s - 0.15 * k * v;
      const imp = F * dt;
      tV.set(axis.x * imp, axis.y * imp, axis.z * imp);
      const c = this.w.toWorldVec(jc.moving, jc.moving.com);
      tP.set(c.x, c.y, c.z);
      jc.moving.body.applyImpulse(tV, tP);
    }
  }

  /**
   * Velocity motor (fan): torque-limited drive towards the target spin, plus quadratic air drag
   * on the rotor (sized so drag = half the motor torque at full speed) so an unpowered fan
   * coasts down over ~10 s instead of spinning forever.
   */
  private applyMotor(g: JointGroup, dt: number): void {
    if (g.kind !== "hinge") return;
    const jc = g.constraints.find((c) => c.kind === "hinge");
    if (!jc || !jc.moving.body || jc.moving.isStatic) {
      if (!g.motorOn) this.motors.delete(g);
      return;
    }
    this.worldAxisInto(g, jc, sAxis, sPivot);
    const axis = sAxis;
    const wRel = this.relAngVel(jc, axis);
    const tmax = Math.max(0.05, g.motorTorque);
    const target = Math.abs(g.motorSpeed) > 0.1 ? Math.abs(g.motorSpeed) : 10;
    const kDrag = (0.5 * tmax) / (target * target);
    let tau = -kDrag * wRel * Math.abs(wRel);
    if (g.motorOn) tau += Math.max(-tmax, Math.min(tmax, (tmax / 1.5) * (g.motorSpeed - wRel)));
    else if (Math.abs(wRel) < 0.05) {
      this.motors.delete(g); // stopped: no more per-step work until powered again
      return;
    }
    this.applyTorque(jc, axis, tau, dt);
    if (g.motorOn && Math.abs(g.motorSpeed - wRel) > 0.2) this.w.physics.wake(jc.moving.body);
  }
}

export function latchTorque(strength: number): number {
  return Math.max(150, Math.min(15000, strength * LATCH_TORQUE_PER_J));
}

function unit(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return l > 1e-12 ? { x: v.x / l, y: v.y / l, z: v.z / l } : { x: 0, y: 1, z: 0 };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
