// First-person viewmodel: arms/fists, the shown tool, the extinguisher hose/nozzle and the
// kicking/stomping boot. All parts are parented to the render camera and drawn in their own
// rendering group with the depth buffer cleared first, so they never clip into walls (the hit
// itself is resolved physically by the tool system's sweeps; the head sphere stops at the wall).
//
// The tool system hands over a camera-space Pose (already interpolated between fixed steps);
// this class adds purely cosmetic motion on top: sway lagging behind mouse look, walk bob and
// idle breathing, charge tremble, recoil kick, pry/spray jitter and the lowered pose (tool
// switch / holding an object). Forearms are solved per frame with two-bone IK from fixed
// shoulders to the wrists so the arms stay attached through every swing.

import { Quaternion, TransformNode, type AbstractMesh, type Scene, type StandardMaterial, type UniversalCamera, type Vector3 } from "@babylonjs/core";
import type { ToolId } from "../../core/context.ts";
import { TOOL_ORDER, TOOL_RIGS } from "./defs.ts";
import type { LegKind } from "./legs.ts";
import { FOREARM_LEN, HOSE_REST, HOSE_START, buildFistModel, buildForearmModel, buildLegModel, buildToolModel, createViewmodelMaterials, type ToolModelParts } from "./models.ts";
import { blendFrame, clamp01, q4, quatFromAxisFace, rotateQ, smoothstep01, v3, type Frame, type Pose, type V3 } from "./swing.ts";

/** Rendering group of the viewmodel (depth is cleared before it renders). */
export const VIEWMODEL_GROUP = 1;

export interface ViewState {
  /** Tool model to show. */
  tool: ToolId;
  /** Camera-space pose of hands/tool (final: swing + pry/spray overrides). */
  pose: Pose;
  /** 0..1 lowered (switching tools / holding an object). */
  lower: number;
  /** Charge level while charging (0 otherwise) and whether it is full (tremble). */
  charge: number;
  fullCharge: boolean;
  /** Crowbar pry stress 0..1 (jitter). */
  stress: number;
  spraying: boolean;
  sprayPressure: number;
  /** 0..1 blend of the extinguisher spray pose (nozzle aimed along the view). */
  sprayBlend: number;
  /** 0..1: the left hand holds the extinguisher nozzle (1) or the nozzle rests on the cylinder (0). */
  nozzleHold: number;
  /** Kick/stomp leg (camera space): visibility weight, foot (sole centre), hip, toe direction hint. */
  leg: { weight: number; foot: V3; dir: V3; kind: LegKind; hip?: V3; toe?: V3 };
  /** Horizontal player speed (m/s) for the walk bob. */
  speed: number;
  /** Recoil impulse to add this frame (0..1). */
  kick: number;
  /** Swing phase name (debug). */
  phase: string;
}

/** Shoulders (camera space) and arm segment lengths for the forearm IK. */
const SHOULDER: readonly [V3, V3] = [v3(0.2, -0.25, -0.06), v3(-0.2, -0.25, -0.06)];
const UPPER_ARM = 0.3;
const FOREARM = 0.27;
/**
 * Elbow pole directions, blended by wrist height: hands low (guard, idle) → elbows down and a bit
 * out (forearms run to the bottom corners); hands raised (overhead swings) → elbows out to the
 * sides so the forearms never cross in front of the lens.
 */
const POLE_LOW: readonly [V3, V3] = [v3(0.45, -1, -0.2), v3(-0.45, -1, -0.2)];
const POLE_HIGH: readonly [V3, V3] = [v3(1, -0.2, -0.25), v3(-1, -0.2, -0.25)];
/** Wrist point in the (right) hand frame; mirrored in x for the left hand. */
const WRIST_LOCAL: V3 = v3(0.018, 0, -0.066);
/** Thigh/shin lengths for the leg IK. */
const THIGH = 0.46;
const SHIN = 0.45;

const SWAY_GAIN = 0.55;
const SWAY_MAX = 0.08;
const SWAY_OMEGA = 13;
const RECOIL_OMEGA = 20;
const RECOIL_ZETA = 0.45;

export class Viewmodel {
  readonly root: TransformNode;
  private readonly scene: Scene;
  private readonly camera: UniversalCamera;
  private readonly mats: Record<string, StandardMaterial>;
  private readonly tools: Record<ToolId, ToolModelParts>;
  private readonly fists: Array<{ root: TransformNode }>;
  private readonly arms: Array<{ root: TransformNode }>;
  private readonly leg: { root: TransformNode };
  private readonly allMeshes: AbstractMesh[] = [];
  private shown: ToolId | null = null;
  private time = 0;
  // cosmetic dynamics
  private swayX = 0;
  private swayY = 0;
  private swayVX = 0;
  private swayVY = 0;
  private lastYaw = NaN;
  private lastPitch = NaN;
  private bobPhase = 0;
  private bobAmp = 0;
  private recoil = 0;
  private recoilVel = 0;
  private prePassRef: unknown = null;
  private disposed = false;
  // temporaries
  private readonly t0 = v3();
  private readonly t1 = v3();
  private readonly t2 = v3();
  private readonly t3 = v3();
  private readonly qTmp = q4();
  private readonly restFrame: Frame = { p: v3(), q: q4() };
  private readonly nozzleFrame: Frame = { p: v3(), q: q4() };

  constructor(scene: Scene, camera: UniversalCamera) {
    this.scene = scene;
    this.camera = camera;
    this.mats = createViewmodelMaterials(scene) as unknown as Record<string, StandardMaterial>;
    this.root = new TransformNode("vm_root", scene);
    this.root.parent = camera;
    this.root.rotationQuaternion = new Quaternion();
    const tools = {} as Record<ToolId, ToolModelParts>;
    for (const id of TOOL_ORDER) {
      const parts = buildToolModel(id, scene, this.mats, this.root);
      parts.root.rotationQuaternion = new Quaternion();
      for (const n of [parts.nozzle, parts.hoseA, parts.hoseB]) if (n) n.rotationQuaternion = new Quaternion();
      this.setEnabled(parts, false);
      tools[id] = parts;
      this.allMeshes.push(...parts.meshes);
    }
    this.tools = tools;
    this.fists = [false, true].map((left) => {
      const f = buildFistModel(scene, this.mats, this.root, left);
      f.root.rotationQuaternion = new Quaternion();
      this.allMeshes.push(...f.meshes);
      return f;
    });
    this.arms = [false, true].map((left) => {
      const a = buildForearmModel(scene, this.mats, this.root, left);
      a.root.rotationQuaternion = new Quaternion();
      this.allMeshes.push(...a.meshes);
      return a;
    });
    const leg = buildLegModel(scene, this.mats, this.root);
    leg.root.parent = camera; // the leg does not sway with the arms
    leg.root.rotationQuaternion = new Quaternion();
    leg.root.setEnabled(false);
    this.allMeshes.push(...leg.meshes);
    this.leg = leg;
    for (const m of this.allMeshes) {
      m.renderingGroupId = VIEWMODEL_GROUP;
      m.receiveShadows = false;
      m.isPickable = false;
      m.doNotSyncBoundingInfo = false;
    }
    // depth (and stencil) are cleared before the viewmodel group renders (Babylon's default for
    // groups > 0, set explicitly in case another system changed it)
    scene.setRenderingAutoClearDepthStencil(VIEWMODEL_GROUP, true, true, true);
  }

  /** Show a tool model (the fists are always present; tools add their own model). */
  setTool(id: ToolId): void {
    if (this.shown === id) return;
    if (this.shown) this.setEnabled(this.tools[this.shown], false);
    this.shown = id;
    this.setEnabled(this.tools[id], true);
  }

  /** Per-frame update. `forward` = gameplay view direction (for sway from mouse look). */
  update(dt: number, vs: ViewState, forward: Vector3): void {
    if (this.disposed) return;
    const h = Math.min(Math.max(dt, 0), 0.1);
    this.time += h;
    if (vs.tool !== this.shown) this.setTool(vs.tool);
    this.excludeFromPrePass();

    // ---- sway: the arms lag behind view rotation (critically damped spring back to centre)
    const yaw = Math.atan2(forward.x, forward.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, -forward.y)));
    if (Number.isFinite(this.lastYaw)) {
      let dy = yaw - this.lastYaw;
      if (dy > Math.PI) dy -= 2 * Math.PI;
      else if (dy < -Math.PI) dy += 2 * Math.PI;
      const dp = pitch - this.lastPitch;
      this.swayX = Math.max(-SWAY_MAX, Math.min(SWAY_MAX, this.swayX - dy * SWAY_GAIN));
      this.swayY = Math.max(-SWAY_MAX, Math.min(SWAY_MAX, this.swayY - dp * SWAY_GAIN));
    }
    this.lastYaw = yaw;
    this.lastPitch = pitch;
    if (h > 0) {
      const w = SWAY_OMEGA;
      this.swayVX += (-w * w * this.swayX - 2 * w * this.swayVX) * h;
      this.swayVY += (-w * w * this.swayY - 2 * w * this.swayVY) * h;
      this.swayX += this.swayVX * h;
      this.swayY += this.swayVY * h;
    }

    // ---- walk bob + idle breathing
    const targetAmp = clamp01(vs.speed / 6);
    this.bobAmp += (targetAmp - this.bobAmp) * Math.min(1, h * 8);
    this.bobPhase += h * (vs.speed / 1.55) * Math.PI;
    const a = this.bobAmp * (1 - 0.7 * vs.lower);
    const bx = Math.sin(this.bobPhase) * 0.011 * a;
    const by = -Math.abs(Math.sin(this.bobPhase)) * 0.009 * a + Math.sin(this.time * 1.5) * 0.0022 * (1 - a);
    const broll = Math.sin(this.bobPhase) * 0.014 * a;

    // ---- recoil spring (impulse from hits / prying pops)
    if (vs.kick > 0) this.recoilVel += vs.kick * 5;
    if (h > 0) {
      this.recoilVel += (-RECOIL_OMEGA * RECOIL_OMEGA * this.recoil - 2 * RECOIL_ZETA * RECOIL_OMEGA * this.recoilVel) * h;
      this.recoil += this.recoilVel * h;
      this.recoil = Math.max(-0.25, Math.min(0.25, this.recoil));
    }

    // ---- tremble at full charge, pry stress jitter, spray buzz
    let jit = 0;
    if (vs.charge > 0.75) jit += 0.0016 * smoothstep01((vs.charge - 0.75) / 0.25) * (vs.fullCharge ? 1.4 : 1);
    jit += 0.0035 * vs.stress;
    if (vs.spraying) jit += 0.0012 * vs.sprayPressure;
    const jx = jit ? (Math.sin(this.time * 71) + Math.sin(this.time * 113)) * 0.5 * jit : 0;
    const jy = jit ? (Math.sin(this.time * 89 + 1.3) + Math.sin(this.time * 131)) * 0.5 * jit : 0;

    // ---- lowered pose (switching / holding)
    const L = smoothstep01(vs.lower);

    // root transform (camera space): sway + bob + recoil + lower + jitter
    const rx = this.swayY + 0.55 * L - this.recoil * 0.6 + jy * 3;
    const ry = this.swayX + jx * 3;
    const rz = broll + this.swayX * 0.4;
    Quaternion.RotationYawPitchRollToRef(ry, rx, rz, this.root.rotationQuaternion!);
    this.root.position.set(bx + jx + 0.02 * L, by + jy - 0.3 * L, -0.06 * L - this.recoil * 0.05);
    this.root.setEnabled(L < 0.999);

    // ---- hands + tool
    const pose = vs.pose;
    const tool = this.tools[vs.tool];
    const isFists = vs.tool === "hands";
    if (!isFists) this.applyFrame(tool.root, pose.right);
    const rig = TOOL_RIGS[vs.tool];
    const twoHanded = isFists || (rig.kind === "curve" && rig.offhand !== 0) || vs.tool === "extinguisher";
    this.applyFrame(this.fists[0].root, pose.right);
    this.applyArm(0, pose.right);
    this.fists[1].root.setEnabled(twoHanded);
    if (twoHanded) {
      this.applyFrame(this.fists[1].root, pose.left);
      this.applyArm(1, pose.left);
    } else this.arms[1].root.setEnabled(false);
    if (vs.tool === "extinguisher") this.updateHose(tool, pose, vs.nozzleHold);

    // ---- leg (kick / stomp)
    this.updateLeg(vs);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.leg.root.dispose(false, false);
    this.root.dispose(false, false);
    const texs = new Set<unknown>();
    for (const m of Object.values(this.mats)) {
      if (m.diffuseTexture) texs.add(m.diffuseTexture);
      m.dispose(false, false);
    }
    for (const t of texs) (t as { dispose(): void }).dispose();
  }

  // ---------------------------------------------------------------- internals

  private setEnabled(parts: ToolModelParts, on: boolean): void {
    parts.root.setEnabled(on);
    parts.nozzle?.setEnabled(on);
    parts.hoseA?.setEnabled(on);
    parts.hoseB?.setEnabled(on);
  }

  private applyFrame(node: TransformNode, f: Frame): void {
    node.position.set(f.p.x, f.p.y, f.p.z);
    node.rotationQuaternion!.set(f.q.x, f.q.y, f.q.z, f.q.w);
  }

  /** Forearm from the wrist towards the IK elbow (shoulder fixed, elbow pointing down/out). */
  private applyArm(side: 0 | 1, hand: Frame): void {
    const s = side === 0 ? 1 : -1;
    const w = rotateQ(this.t0, hand.q, setV(this.t1, WRIST_LOCAL.x * s, WRIST_LOCAL.y, WRIST_LOCAL.z));
    w.x += hand.p.x;
    w.y += hand.p.y;
    w.z += hand.p.z;
    const lift = smoothstep01((w.y - SHOULDER[side].y + 0.02) / 0.28);
    const pl = POLE_LOW[side],
      ph = POLE_HIGH[side];
    const pole = setV(this.t3, pl.x + (ph.x - pl.x) * lift, pl.y + (ph.y - pl.y) * lift, pl.z + (ph.z - pl.z) * lift);
    const elbow = twoBoneElbow(SHOULDER[side], w, UPPER_ARM, FOREARM, pole, this.t2);
    // forearm root at the wrist, local +Z towards the elbow, local +Y roughly up
    const dir = setV(this.t3, elbow.x - w.x, elbow.y - w.y, elbow.z - w.z);
    const node = this.arms[side].root;
    // hide a forearm whose wrist is beside/behind the lens (hands raised overhead / behind)
    const wd = Math.hypot(w.x, w.y, w.z);
    const near = wd < ARM_NEAR + 0.05 || w.z < 0.04;
    node.setEnabled(!near && this.fists[side].root.isEnabled());
    if (near) return;
    // shorten it where it would come closer to the eye than ARM_CLEAR (a sleeve filling the
    // screen reads as a black cone); the hidden part is off-screen anyway
    const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const len = Math.min(FOREARM_LEN, clearLength(w, dir.x / dl, dir.y / dl, dir.z / dl, ARM_CLEAR, FOREARM_LEN));
    node.scaling.z = Math.max(0.05, len / FOREARM_LEN);
    node.position.set(w.x, w.y, w.z);
    quatFromFaceUp(this.qTmp, dir, UP);
    node.rotationQuaternion!.set(this.qTmp.x, this.qTmp.y, this.qTmp.z, this.qTmp.w);
  }

  /** Extinguisher hose from the valve to the nozzle (in the left hand, or clipped to the cylinder during a slam). */
  private updateHose(tool: ToolModelParts, pose: Pose, hold: number): void {
    if (!tool.nozzle || !tool.hoseA || !tool.hoseB) return;
    const tf = pose.right;
    // rest frame: clipped to the cylinder's back, pointing down along it
    const rp = rotateQ(this.t0, tf.q, HOSE_REST as V3);
    this.restFrame.p.x = tf.p.x + rp.x;
    this.restFrame.p.y = tf.p.y + rp.y;
    this.restFrame.p.z = tf.p.z + rp.z;
    const toolAxis = rotateQ(this.t1, tf.q, UP);
    const toolBack = rotateQ(this.t2, tf.q, BACK);
    quatFromAxisFace(this.restFrame.q, toolBack, toolAxis);
    const nf = blendFrame(this.restFrame, pose.left, smoothstep01(hold), this.nozzleFrame);
    this.applyFrame(tool.nozzle, nf);
    // hose: valve outlet → sagging midpoint → nozzle tail
    const a = rotateQ(this.t0, tf.q, HOSE_START as V3);
    a.x += tf.p.x;
    a.y += tf.p.y;
    a.z += tf.p.z;
    const tail = rotateQ(this.t1, nf.q, NOZZLE_TAIL);
    tail.x += nf.p.x;
    tail.y += nf.p.y;
    tail.z += nf.p.z;
    const span = Math.hypot(tail.x - a.x, tail.y - a.y, tail.z - a.z);
    const mid = setV(this.t2, (a.x + tail.x) / 2, (a.y + tail.y) / 2 - 0.03 - 0.12 * Math.max(0, 0.45 - span), (a.z + tail.z) / 2);
    this.stretch(tool.hoseA, a, mid);
    this.stretch(tool.hoseB, mid, tail);
  }

  /** Orient/scale a unit +Z cylinder node to span a → b. */
  private stretch(node: TransformNode, a: V3, b: V3): void {
    const d = setV(this.t3, b.x - a.x, b.y - a.y, b.z - a.z);
    const l = Math.hypot(d.x, d.y, d.z);
    node.position.set(a.x, a.y, a.z);
    node.scaling.set(1, 1, Math.max(l, 1e-4));
    if (l > 1e-6) {
      quatFromFaceUp(this.qTmp, d, UP);
      node.rotationQuaternion!.set(this.qTmp.x, this.qTmp.y, this.qTmp.z, this.qTmp.w);
    }
  }

  private updateLeg(vs: ViewState): void {
    const lg = vs.leg;
    const node = this.leg.root;
    if (!(lg.weight > 0.01)) {
      node.setEnabled(false);
      return;
    }
    node.setEnabled(true);
    const foot = lg.foot;
    // knee from two-bone IK between the hip (below the camera) and the foot, bending forward
    const hip = lg.hip ?? DEFAULT_HIP;
    const knee = twoBoneElbow(hip, foot, THIGH, SHIN, lg.dir, this.t2);
    const legDir = setV(this.t3, knee.x - foot.x, knee.y - foot.y, knee.z - foot.z);
    const toe = lg.toe ?? lg.dir;
    node.position.set(foot.x, foot.y, foot.z);
    quatFromAxisFace(this.qTmp, legDir, toe);
    node.rotationQuaternion!.set(this.qTmp.x, this.qTmp.y, this.qTmp.z, this.qTmp.w);
  }

  /**
   * Keep the viewmodel out of the SSAO/prepass outputs (it lives in its own depth range after the
   * depth clear; letting it write into the prepass would darken the world behind it). Re-checked
   * every frame because the post-processing pipeline may be created/recreated later.
   */
  private excludeFromPrePass(): void {
    const pp = (this.scene as unknown as { prePassRenderer?: { excludedMaterials: unknown[] } | null }).prePassRenderer;
    if (!pp || pp === this.prePassRef) return;
    this.prePassRef = pp;
    for (const m of Object.values(this.mats)) if (!pp.excludedMaterials.includes(m)) pp.excludedMaterials.push(m);
  }
}

const UP: V3 = { x: 0, y: 1, z: 0 };
const BACK: V3 = { x: 0, y: 0, z: -1 };
/** Forearms whose wrist is closer than this to the eye are hidden; others are cut ARM_CLEAR from it. */
const ARM_NEAR = 0.15;
const ARM_CLEAR = 0.15;
/** Hose attachment on the nozzle (left-hand frame). */
const NOZZLE_TAIL: V3 = { x: 0, y: 0, z: -0.03 };
const DEFAULT_HIP: V3 = { x: 0.1, y: -0.9, z: 0.05 };

/**
 * Length (≤ maxLen) one can travel from p along unit d before coming within `clear` of the eye
 * (origin): first root of |p + d·s| = clear, or maxLen if the ray never gets that close.
 */
function clearLength(p: V3, dx: number, dy: number, dz: number, clear: number, maxLen: number): number {
  const b = p.x * dx + p.y * dy + p.z * dz;
  const c = p.x * p.x + p.y * p.y + p.z * p.z - clear * clear;
  if (c <= 0) return 0;
  const disc = b * b - c;
  if (disc < 0 || b >= 0) return maxLen; // never that close, or moving away
  const s = -b - Math.sqrt(disc);
  return s > 0 ? Math.min(maxLen, s) : maxLen;
}

function setV(o: V3, x: number, y: number, z: number): V3 {
  o.x = x;
  o.y = y;
  o.z = z;
  return o;
}

/** Quaternion whose local +Z maps exactly to `face` and local +Y to `up` orthogonalised against it. */
function quatFromFaceUp(o: { x: number; y: number; z: number; w: number }, face: V3, up: V3): void {
  // axis = up − face·(up·face)/|face|²  (falls back inside quatFromAxisFace when degenerate)
  const fl = Math.hypot(face.x, face.y, face.z) || 1;
  const fx = face.x / fl,
    fy = face.y / fl,
    fz = face.z / fl;
  const d = up.x * fx + up.y * fy + up.z * fz;
  _ax.x = up.x - fx * d;
  _ax.y = up.y - fy * d;
  _ax.z = up.z - fz * d;
  if (Math.hypot(_ax.x, _ax.y, _ax.z) < 1e-4) {
    // face ∥ up: use camera forward/back as the up hint
    _ax.x = 0;
    _ax.y = 0;
    _ax.z = fy > 0 ? -1 : 1;
  }
  _fc.x = fx;
  _fc.y = fy;
  _fc.z = fz;
  // quatFromAxisFace orthogonalises the FACE against the axis; here the axis is already ⊥ face
  quatFromAxisFace(o, _ax, _fc);
}
const _ax = v3();
const _fc = v3();

/**
 * Two-bone IK: elbow position for shoulder s, wrist w, bone lengths a (upper) and b (lower), with
 * the elbow bending towards `pole`. Out of reach → the arm straightens (elbow on the line).
 */
export function twoBoneElbow(s: V3, w: V3, a: number, b: number, pole: V3, out: V3): V3 {
  let dx = w.x - s.x,
    dy = w.y - s.y,
    dz = w.z - s.z;
  let dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-6) {
    dx = 0;
    dy = -1;
    dz = 0;
    dist = 1e-6;
  }
  const nx = dx / dist,
    ny = dy / dist,
    nz = dz / dist;
  const d = Math.min(Math.max(dist, Math.abs(a - b) + 1e-3), a + b - 1e-3);
  const x = (a * a - b * b + d * d) / (2 * d);
  const hgt = Math.sqrt(Math.max(0, a * a - x * x));
  // pole component perpendicular to the shoulder→wrist line
  const pd = pole.x * nx + pole.y * ny + pole.z * nz;
  let px = pole.x - nx * pd,
    py = pole.y - ny * pd,
    pz = pole.z - nz * pd;
  const pl = Math.hypot(px, py, pz);
  if (pl < 1e-6) {
    px = 0;
    py = -1;
    pz = 0;
  } else {
    px /= pl;
    py /= pl;
    pz /= pl;
  }
  // with the wrist beyond reach, keep the forearm length by placing the elbow b before the wrist
  if (dist > a + b - 1e-3) {
    out.x = w.x - nx * b + px * 0.02;
    out.y = w.y - ny * b + py * 0.02;
    out.z = w.z - nz * b + pz * 0.02;
    return out;
  }
  out.x = s.x + nx * x + px * hgt;
  out.y = s.y + ny * x + py * hgt;
  out.z = s.z + nz * x + pz * hgt;
  return out;
}

