// Tool system: swings, sweeps → destruction.strike, hit feel (recoil / hit-stop / shake / pain),
// kick & stomp, crowbar prying, extinguisher spray and the first-person viewmodel.
//
// Swings are procedural ANIMATION (swing.ts), but every HIT IS PHYSICAL: each fixed step of the
// strike window the tool head sphere is swept with physics.sphereSweep from its previous to its
// current world position (all layers except PLAYER/HELD, ignoring the player). On contact the
// head's world velocity (path derivative × charge + player velocity + a capped share of camera
// turning) is projected on the surface normal and handed to destruction.strike together with the
// tool's effective mass, contact radius, material-dependent sharpness and striker material. The
// response is physical too: the head loses J/m of normal speed (light objects are knocked away and
// the swing follows through, breaking through drywall/glass continues the swing, hard static
// targets bounce the tool back and end the swing, soft ones swallow it).
//
// Owned by the player (`new ToolSystem(ctx)`); contract in src/player/contracts.ts.

import { Vector3, PhysicsMotionType, Matrix, type PhysicsBody } from "@babylonjs/core";
import { Layer, type EmitterHandle, type GameContext, type LoopHandle, type SweepHit, type ToolId, type StrikeResult } from "../../core/context.ts";
import { FIXED_DT } from "../../core/time.ts";
import type { MaterialId } from "../../destruction/model/materials.ts";
import type { IToolSystem, ToolContext, ToolDef } from "../contracts.ts";
import {
  TOOL_DEFS,
  TOOL_RIGS,
  TOOL_ORDER,
  KICK,
  STOMP,
  PRY,
  SPRAY,
  SPRAY_POSE,
  NOZZLE_IDLE,
  sharpnessFor,
  isPainful,
  PAINFUL_PULL,
  HARD_RECOIL,
  MEDIUM_THUD,
  MIN_STRIKE_SPEED,
  MAX_HITS_PER_SWING,
  TURN_SPEED_SHARE,
  DEFAULT_EYE_HEIGHT,
  TOOL_SHAFTS,
  SHAFT_SWEEP_FROM,
  type LegActionDef,
} from "./defs.ts";
import {
  SwingMachine,
  EV_STRIKE_STEP,
  makePose,
  copyPose,
  frameFromDef,
  frameAxis,
  frameFace,
  quatFromAxisFace,
  blendPose,
  blendFrame,
  clamp01,
  smoothstep01,
  v3,
  AIM_SLACK,
  aimVariants,
  makeAimVariant,
  MAX_AIM_VARIANTS,
  type V3,
  type StrikeAim,
  type AimVariant,
} from "./swing.ts";
import { LegAction, type LegKind } from "./legs.ts";
import { Viewmodel, type ViewState } from "./viewmodel.ts";
import { NOZZLE_TIP } from "./models.ts";

/** Sweep/ray filter: everything except the player and the held object. */
const HIT_MASK = Layer.STATIC | Layer.DYNAMIC | Layer.DEBRIS;
/** Seconds to lower / raise the viewmodel when switching tools. */
const SWITCH_LOWER = 0.17;
const SWITCH_RAISE = 0.24;
/** Lowering speed (1/s) while the player holds an object; spray pose blend speed (1/s). */
const HOLD_LOWER_RATE = 5;
const SPRAY_BLEND_RATE = 7;
const NOZZLE_HOLD_RATE = 6;
/** Chest pivot used for the fists' obstruction check (camera space). */
const FIST_PIVOT: V3 = { x: 0, y: -0.25, z: 0 };
/** Right shoulder (camera space) for the crowbar levering pose, and the bar's face hint. */
const SHOULDER_R: V3 = { x: 0.19, y: -0.24, z: -0.02 };
/** Shoulder → grip distance the levering arm can reach (upper arm 0.3 + forearm 0.27, slightly bent). */
const PRY_ARM_REACH = 0.55;
const PRY_FACE_HINT: V3 = { x: -0.5, y: -0.3, z: 0.8 };
/** Floor probe mask (what the player can stand on). */
const FLOOR_MASK = Layer.STATIC | Layer.DYNAMIC;
/** Swing sweeps are split into sub-steps of at most this head path length (m), at most SUB_SWEEP_MAX per step. */
const SUB_SWEEP_LEN = 0.06;
const SUB_SWEEP_MAX = 8;
/** Approach dry run (chooseApproach): from/to these fractions of the contact time, in segments of ≤ SEG_LEN m (≤ MAX_SEGS). */
const APPROACH_FROM = 0.3;
const APPROACH_TO = 1.15;
const APPROACH_SEG_LEN = 0.08;
const APPROACH_MAX_SEGS = 10;
/**
 * The dry run sweeps shafts this much (m) fatter than they are: the real swing samples the path
 * on a different (finer) grid, so a shaft that only just clears a support edge in the dry run can
 * clip it for real. Variants that graze something in front of the target are passed over in
 * favour of one that clears it (e.g. an overhand chop over a shelf edge).
 */
const DRY_SHAFT_MARGIN = 0.012;
/**
 * A variant that reaches the target delivering at least this share of ½·m·v² is taken without
 * trying the others (the most natural swing that gets there wins; only a really glancing first
 * contact — e.g. the head skimming a corner — looks for a squarer way to swing).
 */
const GOOD_SHARE = 0.35;
/** Punches: a slightly raised punch line is barely a different motion, so they look for a square one harder. */
const GOOD_SHARE_PUNCH = 0.7;
/** An obstacle the wound-back tool starts in is ignored for this fraction of the contact time. */
const START_IGNORE = 0.45;
/** Seconds before the crowbar tries to wedge in again after slipping off. */
const PRY_RETRY = 0.4;

interface PryState {
  active: boolean;
  body: PhysicsBody | null;
  /** Wedge point and pull direction in the body's local frame. */
  local: Vector3;
  localDir: Vector3;
  /** Current world wedge point / direction. */
  point: Vector3;
  dir: Vector3;
  stress: number;
  zeroTime: number;
  /** Set when a bond popped: prying stops until alt is released. */
  popped: boolean;
  /** Seconds since the pry started (levering animation ramps in). */
  time: number;
  bondBroke: boolean;
  /** Retry cooldown after slipping off (s). */
  cooldown: number;
}

interface SprayState {
  active: boolean;
  /** Remaining discharge time (s). */
  contents: number;
  emitter: EmitterHandle | null;
  loop: LoopHandle | null;
  k: number;
  pressure: number;
}

export class ToolSystem implements IToolSystem {
  readonly defs: Readonly<Record<ToolId, ToolDef>> = TOOL_DEFS;
  private readonly ctx: GameContext;
  private readonly machines: Record<ToolId, SwingMachine>;
  private _current: ToolId = "hands";
  /** Tool currently shown by the viewmodel (lags `_current` during the switch animation). */
  private shown: ToolId = "hands";
  private switchPhase: "none" | "lower" | "raise" = "none";
  private switchT = 0;
  private holdLower = 0;
  private holding = false;

  // ---- per-step camera (gameplay pose) and previous basis for turn velocity
  private readonly eye = new Vector3();
  private readonly right = new Vector3(1, 0, 0);
  private readonly up = new Vector3(0, 1, 0);
  private readonly fwd = new Vector3(0, 0, 1);
  private readonly prevRight = new Vector3(1, 0, 0);
  private readonly prevUp = new Vector3(0, 1, 0);
  private readonly prevFwd = new Vector3(0, 0, 1);
  private readonly vel = new Vector3();
  private camInit = false;

  // ---- swing sweep state
  private lastStrikeId = 0;
  private readonly prevHead = new Vector3();
  private readonly curHead = new Vector3();
  private swingIgnore: PhysicsBody | null = null;
  /** Strike time until which `swingIgnore` stays ignored (Infinity = rest of the swing). */
  private swingIgnoreUntil = 0;
  private readonly hitCentre = new Vector3();
  private readonly aim: StrikeAim = { point: v3(), normal: v3() };
  private readonly variants: AimVariant[] = Array.from({ length: MAX_AIM_VARIANTS }, makeAimVariant);
  private readonly dryPrev = new Vector3();
  private readonly dryCur = new Vector3();
  /** Shaft sweep scratch (world positions at the start / end of a sweep). */
  private readonly shaftA = new Vector3();
  private readonly shaftB = new Vector3();
  private readonly c2 = v3();

  // ---- legs
  private readonly leg = new LegAction();
  private legDef: LegActionDef = KICK;
  private readonly legFeet = new Vector3();
  private readonly legRight = new Vector3(1, 0, 0);
  private readonly legFwd = new Vector3(0, 0, 1);
  private legEyeHeight = DEFAULT_EYE_HEIGHT;
  private readonly prevFoot = new Vector3();
  private readonly curFoot = new Vector3();
  private legIgnore: PhysicsBody | null = null;

  // ---- alt actions
  private readonly pry: PryState = {
    active: false,
    body: null,
    local: new Vector3(),
    localDir: new Vector3(),
    point: new Vector3(),
    dir: new Vector3(),
    stress: 0,
    zeroTime: 0,
    popped: false,
    time: 0,
    bondBroke: false,
    cooldown: 0,
  };
  private readonly spray: SprayState = { active: false, contents: SPRAY.duration, emitter: null, loop: null, k: 0, pressure: 1 };

  /** Debug/test record of the most recent strike (full head speed vs. the normal component used). */
  lastHit: { who: string; speed: number; normalSpeed: number; energy: number; hardness: number; broke: boolean; outcome: string; point: V3; time: number } | null = null;
  /** Number of strikes delivered since construction. */
  hitCount = 0;

  // ---- viewmodel
  private readonly viewmodel: Viewmodel | null;
  private readonly pose = makePose();
  private readonly pose2 = makePose();
  private readonly sprayPose = makePose();
  private readonly nozzleIdle = makePose();
  private sinceFixed = 0;
  private recoilKick = 0;
  private readonly view: ViewState;

  // ---- temporaries (no per-step allocation in steady state)
  private readonly c0 = v3();
  private readonly c1 = v3();
  private readonly w0 = new Vector3();
  private readonly w1 = new Vector3();
  private readonly w2 = new Vector3();
  private readonly w3 = new Vector3();
  private readonly m0 = new Matrix();
  private readonly sprayDir = new Vector3(0, 0, 1);
  private readonly nozzleOut = v3();
  private readonly unsubs: Array<() => void> = [];

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    const m = {} as Record<ToolId, SwingMachine>;
    for (const id of TOOL_ORDER) m[id] = new SwingMachine(TOOL_DEFS[id], TOOL_RIGS[id]);
    this.machines = m;
    frameFromDef(SPRAY_POSE.right, this.sprayPose.right);
    frameFromDef(SPRAY_POSE.left, this.sprayPose.left);
    frameFromDef(NOZZLE_IDLE, this.nozzleIdle.left);
    this.view = {
      tool: "hands",
      pose: this.pose,
      lower: 0,
      charge: 0,
      fullCharge: false,
      stress: 0,
      spraying: false,
      sprayPressure: 0,
      leg: { weight: 0, foot: v3(), dir: v3(0, 0, 1), kind: "kick", hip: v3(0.1, -0.9, 0.05), toe: v3(0, 0, 1) },
      speed: 0,
      kick: 0,
      phase: "idle",
      sprayBlend: 0,
      nozzleHold: 1,
    };
    let vm: Viewmodel | null = null;
    try {
      if (ctx.scene && ctx.render?.camera) vm = new Viewmodel(ctx.scene, ctx.render.camera);
    } catch (e) {
      console.warn("tools: viewmodel unavailable", e);
    }
    this.viewmodel = vm;
    this.viewmodel?.setTool(this.shown);
    // A bond breaking right next to the crowbar's wedge = the pry popped it.
    if (ctx.events) {
      this.unsubs.push(
        ctx.events.on("bondBreak", (e) => {
          const p = this.pry;
          if (!p.active) return;
          const dx = e.pos.x - p.point.x,
            dy = e.pos.y - p.point.y,
            dz = e.pos.z - p.point.z;
          if (dx * dx + dy * dy + dz * dz < 0.35 * 0.35) p.bondBroke = true;
        }),
      );
    }
  }

  // ======================================================================== IToolSystem

  get current(): ToolId {
    return this._current;
  }

  /** True while a swing or a body action is in progress (the player may slow down). */
  get busy(): boolean {
    return this.machine.busy || this.leg.busy;
  }

  /** HUD charge meter: 0..1 while charging a swing (hold fire after the wind-up), 0 otherwise. */
  get charge(): number {
    const m = this.machine;
    return m.phase === "charge" ? m.charge : 0;
  }

  /** Remaining extinguisher contents 0..1 (HUD). */
  get extinguisherLevel(): number {
    return clamp01(this.spray.contents / SPRAY.duration);
  }

  /** Current pry stress 0..1 (HUD crosshair). */
  get pryStress(): number {
    return this.pry.active ? this.pry.stress : 0;
  }

  select(id: ToolId): void {
    if (!(id in TOOL_DEFS) || id === this._current) return;
    this.machine.cancel();
    this.endPry(false);
    this.stopSpray();
    this._current = id;
    // strike ids are per machine: re-sync so the new tool's counter is not mistaken for a new strike
    this.lastStrikeId = this.machines[id].strikeId;
    // lower → swap model → raise (resumes from the current lowering point if switching again)
    if (this.switchPhase === "raise") this.switchT = SWITCH_LOWER * (1 - this.switchT / SWITCH_RAISE);
    else if (this.switchPhase === "none") this.switchT = 0;
    this.switchPhase = "lower";
  }

  fixedUpdate(dt: number, tc: ToolContext): void {
    if (!(dt > 0)) return;
    this.cacheCamera(tc);
    this.sinceFixed = 0;
    this.holding = tc.holding;
    this.stepSwitch(dt);
    const input = this.ctx.input;
    const m = this.machine;

    let fireDown = false;
    if (tc.holding) {
      // fire belongs to the player's throw while holding: do not consume it here
      if (m.phase !== "idle" && m.phase !== "recover") m.cancel();
      this.endPry(false);
      this.stopSpray();
    } else {
      const pressed = input.pressed("fire");
      const released = input.released("fire");
      fireDown = input.down("fire");
      const altPressed = input.pressed("alt");
      input.released("alt");
      const altDown = input.down("alt");
      const blocked = this.switchPhase !== "none" || this.leg.busy || this.pry.active || this.spray.active;
      if (pressed && !blocked) m.press();
      if (released) m.release();
      if (blocked && m.phase === "windup" && this.leg.busy) m.cancel();
      // alternate actions
      const def = this.defs[this._current];
      if (def.alt === "pry") this.stepPry(dt, tc, altPressed, altDown && this.switchPhase === "none" && !m.busy);
      else if (this.pry.active) this.endPry(false);
      if (def.alt === "spray") this.stepSpray(dt, tc, altPressed, altDown && this.switchPhase === "none" && !m.busy);
      else if (this.spray.active) this.stopSpray();
    }

    const ev = m.update(dt, fireDown);
    if (m.strikeId !== this.lastStrikeId) this.beginStrikeSweep(tc);
    if (ev & EV_STRIKE_STEP) this.sweepStrike(tc);

    this.stepLeg(dt, tc);
    this.prevRight.copyFrom(this.right);
    this.prevUp.copyFrom(this.up);
    this.prevFwd.copyFrom(this.fwd);
  }

  update(dt: number, tc: ToolContext): void {
    const scale = this.ctx.time ? this.ctx.time.scale : 1;
    this.sinceFixed = Math.min(FIXED_DT, this.sinceFixed + Math.max(0, dt) * scale);
    this.holding = tc.holding;
    // lowering while holding an object (smooth, frame-rate based)
    this.holdLower = clamp01(this.holdLower + (tc.holding ? 1 : -1) * HOLD_LOWER_RATE * Math.max(0, dt));
    if (!this.viewmodel) return;
    if (!this.camInit) this.cacheCamera(tc);
    this.composeView(tc, Math.max(0, dt));
    this.viewmodel.update(dt, this.view, tc.forward);
    this.recoilKick = 0;
  }

  kick(tc: ToolContext): void {
    this.startLeg("kick", tc);
  }

  stomp(tc: ToolContext): void {
    this.startLeg("stomp", tc);
  }

  debugSwing(power: number, tc: ToolContext): void {
    if (tc.holding) return;
    this.cacheCamera(tc);
    this.endPry(false);
    this.stopSpray();
    if (this.switchPhase !== "none") {
      this.switchPhase = "none";
      this.shown = this._current;
      this.viewmodel?.setTool(this.shown);
    }
    this.leg.cancel();
    this.machine.forceStrike(Number.isFinite(power) ? clamp01(power) : 0);
  }

  /** Release meshes, materials, emitters, loops and event subscriptions. */
  dispose(): void {
    this.stopSpray();
    this.endPry(false);
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    this.viewmodel?.dispose();
  }

  // ======================================================================== internals: camera

  private get machine(): SwingMachine {
    return this.machines[this._current];
  }

  private cacheCamera(tc: ToolContext): void {
    this.eye.copyFrom(tc.eye);
    this.right.copyFrom(tc.right);
    this.up.copyFrom(tc.up);
    this.fwd.copyFrom(tc.forward);
    this.vel.copyFrom(tc.velocity);
    if (!this.camInit) {
      this.prevRight.copyFrom(this.right);
      this.prevUp.copyFrom(this.up);
      this.prevFwd.copyFrom(this.fwd);
      this.camInit = true;
    }
  }

  /** Camera-space point → world (gameplay camera of this step). */
  private toWorld(c: V3, out: Vector3): Vector3 {
    const r = this.right,
      u = this.up,
      f = this.fwd,
      e = this.eye;
    return out.set(e.x + r.x * c.x + u.x * c.y + f.x * c.z, e.y + r.y * c.x + u.y * c.y + f.y * c.z, e.z + r.z * c.x + u.z * c.y + f.z * c.z);
  }

  private dirToWorld(c: V3, out: Vector3): Vector3 {
    const r = this.right,
      u = this.up,
      f = this.fwd;
    return out.set(r.x * c.x + u.x * c.y + f.x * c.z, r.y * c.x + u.y * c.y + f.y * c.z, r.z * c.x + u.z * c.y + f.z * c.z);
  }

  private toCam(w: Vector3, out: V3): V3 {
    const dx = w.x - this.eye.x,
      dy = w.y - this.eye.y,
      dz = w.z - this.eye.z;
    out.x = dx * this.right.x + dy * this.right.y + dz * this.right.z;
    out.y = dx * this.up.x + dy * this.up.y + dz * this.up.z;
    out.z = dx * this.fwd.x + dy * this.fwd.y + dz * this.fwd.z;
    return out;
  }

  /** Velocity of a camera-space point caused by the camera turning since the last step. */
  private turnVelocity(c: V3, out: Vector3): Vector3 {
    const r = this.right,
      u = this.up,
      f = this.fwd,
      pr = this.prevRight,
      pu = this.prevUp,
      pf = this.prevFwd;
    return out.set(
      ((r.x - pr.x) * c.x + (u.x - pu.x) * c.y + (f.x - pf.x) * c.z) / FIXED_DT,
      ((r.y - pr.y) * c.x + (u.y - pu.y) * c.y + (f.y - pf.y) * c.z) / FIXED_DT,
      ((r.z - pr.z) * c.x + (u.z - pu.z) * c.y + (f.z - pf.z) * c.z) / FIXED_DT,
    );
  }

  // ======================================================================== internals: swings

  private beginStrikeSweep(tc: ToolContext): void {
    const m = this.machine;
    this.lastStrikeId = m.strikeId;
    this.swingIgnore = null;
    this.swingIgnoreUntil = 0;
    const def = this.defs[this._current];
    // square up to what the crosshair is on: re-aim the contact along the view line at its surface
    // The wound-back head may be inside something behind/above the player (a wall, the ceiling):
    // start the swing from where the tool is actually blocked and ignore that obstacle while the
    // head moves away from it (first part of the path towards the contact point). The path start
    // (the wound pose) does not depend on the aim, so this is resolved first.
    m.headAt(0, this.c0);
    this.toWorld(this.c0, this.prevHead);
    const rig = TOOL_RIGS[this._current];
    this.toWorld(rig.kind === "curve" ? SHOULDER_R : FIST_PIVOT, this.w0);
    const block = this.safeSweep(this.w0, this.prevHead, def.headRadius, tc.ignore, null);
    if (block) {
      this.prevHead.copyFrom(this.hitCentre);
      this.swingIgnore = block.body;
    }
    this.w1.copyFrom(this.fwd).scaleInPlace(def.reach + def.headRadius + AIM_SLACK).addInPlace(this.eye);
    const target = this.safeRay(this.eye, this.w1, tc.ignore);
    if (target && Number.isFinite(target.distance)) {
      this.toCam(target.point, this.aim.point);
      const n = target.normal;
      this.aim.normal.x = n.x * this.right.x + n.y * this.right.y + n.z * this.right.z;
      this.aim.normal.y = n.x * this.up.x + n.y * this.up.y + n.z * this.up.z;
      this.aim.normal.z = n.x * this.fwd.x + n.y * this.fwd.y + n.z * this.fwd.z;
      this.chooseApproach(target.body, tc);
    }
    if (this.swingIgnore) this.swingIgnoreUntil = m.path.tc * START_IGNORE;
    // whoosh (audio) — position of the head at the start of the strike
    this.ctx.events?.emit("toolSwing", { tool: this._current, pos: { x: this.prevHead.x, y: this.prevHead.y, z: this.prevHead.z }, power: m.charge });
  }

  /**
   * Pick how to swing at the aimed target: try the aim variants in order of naturalness (squared
   * up, chopping down onto it, the swing plane rolled, along the view; overhand punches) and keep
   * the first whose head and shaft would reach the target before touching anything else (dry-run
   * sweeps along the approach) — e.g. chop down onto a mug rather than drive the handle into the
   * counter edge in front of it. Falls back to the variant that gets furthest.
   */
  private chooseApproach(target: PhysicsBody, tc: ToolContext): void {
    const m = this.machine;
    // world down in camera space
    this.c1.x = -this.right.y;
    this.c1.y = -this.up.y;
    this.c1.z = -this.fwd.y;
    const n = aimVariants(m.rig, this.aim, this.c1, this.variants);
    const good = 1 + (m.rig.kind === "jab" ? GOOD_SHARE_PUNCH : GOOD_SHARE);
    let best = -1,
      bestScore = -Infinity,
      built = -1;
    for (let i = 0; i < n; i++) {
      // (out of reach: every variant is refused and the nominal swing is kept)
      if (!m.aimStrike(this.aim, this.variants[i])) continue;
      built = i;
      const score = this.approachScore(target, tc);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
      // reaches the target first, squarely enough: take it (else keep looking for a squarer one)
      if (score >= good) break;
    }
    if (best >= 0 && best !== built) m.aimStrike(this.aim, this.variants[best]);
  }

  /**
   * Dry-run sweep of the head (and shaft) along the current strike path's approach (honouring the
   * start-of-swing ignore like sweepStrike does): 1 + the share of ½·m·v² the blow would deliver
   * (cos² of travel vs. surface normal) when the first thing touched is `target`, 0.99 when
   * nothing is touched, else the fraction of the approach that was clear (< 0.99).
   */
  private approachScore(target: PhysicsBody, tc: ToolContext): number {
    const m = this.machine;
    const def = this.defs[this._current];
    const path = m.path;
    const shaft = TOOL_SHAFTS[this._current];
    const shaftFrom = SHAFT_SWEEP_FROM * path.tc;
    const t0 = APPROACH_FROM * path.tc;
    const t1 = Math.min(path.T, path.tc * APPROACH_TO);
    const arc = path.sAt(t1) - path.sAt(t0);
    const n = Math.min(APPROACH_MAX_SEGS, Math.max(1, Math.ceil(arc / APPROACH_SEG_LEN)));
    this.toWorld(m.headAt(t0, this.c0), this.dryPrev);
    for (let k = 1; k <= n; k++) {
      const ta = t0 + ((t1 - t0) * (k - 1)) / n,
        tb = t0 + ((t1 - t0) * k) / n;
      this.toWorld(m.headAt(tb, this.c0), this.dryCur);
      const ignore = this.swingIgnore && ta < START_IGNORE * path.tc ? this.swingIgnore : null;
      let hit = this.safeSweep(this.dryPrev, this.dryCur, def.headRadius, tc.ignore, ignore);
      let tHit = hit ? ta + (tb - ta) * hit.fraction : Infinity;
      if (shaft && tb > shaftFrom) {
        const ts = Math.max(ta, shaftFrom);
        for (const off of shaft.offsets) {
          this.toWorld(m.toolPointAt(ts, off, this.c2), this.shaftA);
          this.toWorld(m.toolPointAt(tb, off, this.c2), this.shaftB);
          const sh = this.safeSweep(this.shaftA, this.shaftB, shaft.radius + DRY_SHAFT_MARGIN, tc.ignore, ignore);
          if (!sh) continue;
          const tS = ts + (tb - ts) * sh.fraction;
          if (tS < tHit) {
            hit = sh;
            tHit = tS;
          }
        }
      }
      if (hit) {
        if (hit.body !== target) return Math.min(0.98, Math.max(0, (tHit - t0) / Math.max(path.tc - t0, 1e-4)));
        const dir = this.dirToWorld(path.tangentAtS(path.sAt(tHit), this.c0), this.w2);
        const c = -(dir.x * hit.normal.x + dir.y * hit.normal.y + dir.z * hit.normal.z);
        return 1 + (c > 0 ? c * c : 0);
      }
      this.dryPrev.copyFrom(this.dryCur);
    }
    return 0.99;
  }

  private sweepStrike(tc: ToolContext): void {
    const m = this.machine;
    const def = this.defs[this._current];
    const t0 = m.sweepFrom;
    const t1 = m.sweepTo;
    m.headAt(t1, this.c0);
    this.toWorld(this.c0, this.curHead);
    const shaft = TOOL_SHAFTS[this._current];
    const shaftFrom = SHAFT_SWEEP_FROM * m.path.tc;
    // The head covers up to ~35 cm per step on a curved path: sweep it (and the shaft) in sub-steps
    // along the actual curve, so a contact's time — hence its velocity — is the true one (a single
    // chord would put a hit near the apex of the arc at the wrong time / direction).
    const arc = m.path.sAt(t1) - m.path.sAt(t0);
    const n = Math.min(SUB_SWEEP_MAX, Math.max(1, Math.ceil(arc / SUB_SWEEP_LEN)));
    const dtSub = (t1 - t0) / n;
    let ta = t0;
    // a few hits per step are possible when the head breaks through (glass → stuff behind it)
    for (let guard = 0; ta < t1 - 1e-9 && guard < n + MAX_HITS_PER_SWING + 2; guard++) {
      // strike budget used up: no more strikes, but static things still stop the head
      const spent = m.hits >= MAX_HITS_PER_SWING;
      const tb = Math.min(t1, ta + dtSub);
      const subEnd = tb >= t1 - 1e-9 ? this.curHead : this.toWorld(m.headAt(tb, this.c0), this.w0);
      const ignore = this.swingIgnore && ta < this.swingIgnoreUntil ? this.swingIgnore : null;
      let hit = this.safeSweep(this.prevHead, subEnd, def.headRadius, tc.ignore, ignore);
      let frac = hit ? hit.fraction : 1;
      let tHit = hit ? ta + (tb - ta) * hit.fraction : Infinity;
      let shaftOff = -1;
      // the shaft (handle / barrel) sweeps too, from late in the approach on: earliest contact wins
      if (shaft && tb > shaftFrom) {
        const ts = Math.max(ta, shaftFrom);
        for (const off of shaft.offsets) {
          this.toWorld(m.toolPointAt(ts, off, this.c2), this.shaftA);
          this.toWorld(m.toolPointAt(tb, off, this.c2), this.shaftB);
          const sh = this.safeSweep(this.shaftA, this.shaftB, shaft.radius, tc.ignore, ignore);
          if (!sh) continue;
          const tS = ts + (tb - ts) * sh.fraction;
          if (tS < tHit) {
            hit = sh;
            tHit = tS;
            shaftOff = off;
          }
        }
      }
      if (!hit) {
        this.prevHead.copyFrom(subEnd);
        ta = tb;
        continue;
      }
      // the head's position at the contact time (on the head's own sweep for head hits)
      if (shaftOff >= 0) this.toWorld(m.headAt(tHit, this.c0), this.hitCentre);
      else {
        frac = Math.min(1, Math.max(0, frac));
        this.hitCentre.set(
          this.prevHead.x + (subEnd.x - this.prevHead.x) * frac,
          this.prevHead.y + (subEnd.y - this.prevHead.y) * frac,
          this.prevHead.z + (subEnd.z - this.prevHead.z) * frac,
        );
      }
      const centre = this.shaftA.copyFrom(this.hitCentre);
      let outcome: "continue" | "stop" | "recoil";
      if (!spent) outcome = shaftOff >= 0 ? this.resolveShaftHit(hit, tHit, shaftOff, def) : this.resolveSwingHit(hit, tHit, def);
      else if (this.bodyIsStatic(hit.body)) {
        m.hit("stop", tHit, 1, 1, false);
        outcome = "stop";
      } else outcome = "continue"; // pushes past loose things without another strike
      this.prevHead.copyFrom(centre);
      if (outcome !== "continue") return;
      // follow through: ignore this body for the rest of the swing, continue from the contact
      this.swingIgnore = hit.body;
      this.swingIgnoreUntil = Infinity;
      ta = tHit;
      if (m.phase !== "strike") break;
    }
    this.prevHead.copyFrom(this.curHead);
  }

  /** A blow with the shaft: its point velocity (finite difference along the path) and a reduced effective mass. */
  private resolveShaftHit(hit: SweepHit, tHit: number, off: number, def: ToolDef): "continue" | "stop" | "recoil" {
    const m = this.machine;
    const shaft = TOOL_SHAFTS[this._current]!;
    const h = 0.002;
    const ta = Math.max(0, tHit - h),
      tb = Math.min(m.path.T, tHit + h);
    m.toolPointAt(ta, off, this.c1);
    m.toolPointAt(tb, off, this.c2);
    const k = tb > ta ? m.rate / (tb - ta) : 0;
    this.c0.x = (this.c2.x - this.c1.x) * k;
    this.c0.y = (this.c2.y - this.c1.y) * k;
    this.c0.z = (this.c2.z - this.c1.z) * k;
    const v = this.dirToWorld(this.c0, this.w1);
    const pathSpeed = v.length();
    m.toolPointAt(tHit, off, this.c1);
    const turn = this.turnVelocity(this.c1, this.w2);
    const tl = turn.length(),
      tmax = TURN_SPEED_SHARE * Math.max(pathSpeed, def.speed * 0.5);
    if (tl > tmax) turn.scaleInPlace(tmax / tl);
    v.addInPlace(turn).addInPlace(this.vel);
    return this.applyStrike(hit, v, def.mass * shaft.massScale, shaft.radius * 0.6, this._current, tHit, shaft.mat);
  }

  /**
   * Sphere sweep honouring up to two ignored bodies (the physics API takes one). Writes the sphere
   * centre at impact into `hitCentre`. Zero-length sweeps return null.
   */
  private safeSweep(from: Vector3, to: Vector3, radius: number, ignoreA: PhysicsBody | null, ignoreB: PhysicsBody | null): SweepHit | null {
    const dx = to.x - from.x,
      dy = to.y - from.y,
      dz = to.z - from.z;
    if (dx * dx + dy * dy + dz * dz < 1e-10) return null;
    const phys = this.ctx.physics;
    let hit: SweepHit | null = null;
    try {
      hit = phys.sphereSweep(from, to, radius, HIT_MASK, ignoreB ?? ignoreA);
      if (hit && ignoreB && hit.body === ignoreA) hit = phys.sphereSweep(from, to, radius, HIT_MASK, ignoreA);
      if (hit && (hit.body === ignoreA || hit.body === ignoreB)) hit = null;
    } catch (e) {
      console.warn("tools: sphere sweep failed", e);
      return null;
    }
    if (!hit || !(hit.fraction >= 0)) return null;
    const f = Math.min(1, hit.fraction);
    this.hitCentre.set(from.x + dx * f, from.y + dy * f, from.z + dz * f);
    return hit;
  }

  /** Physical response of a swing hit. Returns how the swing goes on. */
  private resolveSwingHit(hit: SweepHit, tHit: number, def: ToolDef): "continue" | "stop" | "recoil" {
    const m = this.machine;
    // head world velocity at impact: path derivative (× charge, × follow-through rate) + player + turning
    m.velocityAt(tHit, this.c0);
    const v = this.dirToWorld(this.c0, this.w1);
    const pathSpeed = v.length();
    m.headAt(tHit, this.c1);
    const turn = this.turnVelocity(this.c1, this.w2);
    const tl = turn.length(),
      tmax = TURN_SPEED_SHARE * Math.max(pathSpeed, def.speed * 0.5);
    if (tl > tmax) turn.scaleInPlace(tmax / tl);
    v.addInPlace(turn).addInPlace(this.vel);
    return this.applyStrike(hit, v, def.mass, def.contactRadius, this._current, tHit);
  }

  /**
   * Shared strike resolution for swings and legs. `v` = striker world velocity (m/s, modified).
   * Returns the swing/leg continuation.
   */
  private applyStrike(
    hit: SweepHit,
    v: Vector3,
    mass: number,
    contactRadius: number,
    who: ToolId | LegKind,
    tHit: number,
    shaftMat: MaterialId | null = null,
  ): "continue" | "stop" | "recoil" {
    const n = hit.normal;
    const speedTotal = v.length();
    const vn = -(v.x * n.x + v.y * n.y + v.z * n.z); // closing speed along the surface normal
    const isLeg = who === "kick" || who === "stomp";
    // `struck` = this contact delivered a strike (refreshes lastHit and uses up the hit budget)
    const legOrMachineHit = (kind: "continue" | "stop" | "recoil", factor = 1, strength = 1, struck = true) => {
      if (struck && this.lastHit) this.lastHit.outcome = kind;
      if (isLeg) {
        if (kind === "continue") this.leg.slow(factor);
        else this.leg.stop(tHit);
        if (struck) this.leg.hits++;
      } else this.machine.hit(kind, tHit, factor, strength, struck);
      return kind;
    };
    if (!(vn >= MIN_STRIKE_SPEED)) {
      // grazing contact or a nearly stopped head: glide past fast grazes, otherwise rest against it
      if (speedTotal > 2) return legOrMachineHit("continue", 0.85, 1, false);
      return legOrMachineHit("stop", 1, 1, false);
    }
    const d = this.ctx.destruction;
    let preMat: MaterialId | null = null;
    try {
      preMat = d.materialAt(hit.body, hit.point, hit.childIndex);
    } catch {
      preMat = null;
    }
    // you instinctively pull a bare-knuckle punch into concrete or steel (boots don't flinch)
    const painful = who === "hands" && isPainful(preMat);
    const speed = painful ? vn * PAINFUL_PULL : vn;
    // direction of travel into the surface (blend towards -n for glancing blows)
    const dir = this.w3.copyFrom(v);
    if (speedTotal > 1e-6) dir.scaleInPlace(1 / speedTotal);
    if (vn < 0.45 * speedTotal) {
      dir.set(dir.x - n.x * 0.6, dir.y - n.y * 0.6, dir.z - n.z * 0.6);
      dir.normalize();
    }
    const def: ToolDef | null = isLeg ? null : this.defs[who as ToolId];
    const source = isLeg ? (who as "kick" | "stomp") : who === "hands" ? "fist" : "tool";
    let res: StrikeResult;
    try {
      res = d.strike({
        point: hit.point,
        dir: dir.clone(),
        body: hit.body,
        childIndex: hit.childIndex,
        mass,
        speed,
        sharpness: isLeg || shaftMat ? 1 : sharpnessFor(who as ToolId, preMat),
        contactRadius,
        strikerMat: isLeg ? "flesh" : (shaftMat ?? (def as ToolDef).strikerMat),
        source,
        tool: isLeg ? undefined : (who as ToolId),
      });
    } catch (e) {
      console.warn("tools: destruction.strike failed", e);
      return legOrMachineHit("stop", 1, 1, false);
    }
    const energy = Number.isFinite(res.energy) ? Math.max(0, res.energy) : 0;
    const hardness = Number.isFinite(res.hardness) ? clamp01(res.hardness) : 0.5;
    this.feel(hit, energy, hardness, res.targetMat ?? preMat, who, painful);
    this.hitCount++;
    const rec = (this.lastHit ??= { who: "", speed: 0, normalSpeed: 0, energy: 0, hardness: 0, broke: false, outcome: "", point: v3(), time: 0 });
    rec.who = who;
    rec.speed = speedTotal;
    rec.normalSpeed = speed;
    rec.energy = energy;
    rec.hardness = hardness;
    rec.broke = res.broke;
    rec.point.x = hit.point.x;
    rec.point.y = hit.point.y;
    rec.point.z = hit.point.z;
    rec.time = this.ctx.time ? this.ctx.time.simTime : 0;

    // ---- continuation (momentum): the head loses J/m of normal speed
    const dvHead = Number.isFinite(res.impulse) ? Math.max(0, res.impulse) / Math.max(mass, 1e-3) : speed;
    const vnAfter = speed - dvHead;
    let targetMass = Infinity;
    try {
      const tm = d.massOf(hit.body);
      if (tm !== null) targetMass = tm;
    } catch {
      /* unknown body: treat as static */
    }
    const isStatic = this.bodyIsStatic(hit.body);
    const ke = 0.5 * mass * speedTotal * speedTotal;
    if (res.broke) {
      // broke through (drywall, glass, a mug…): keep swinging with the energy that is left
      return legOrMachineHit("continue", Math.sqrt(Math.max(0.12, 1 - energy / Math.max(ke, 1e-3))));
    }
    if (!isStatic && targetMass < Infinity) {
      // a movable target took the momentum: follow through with what is left, or stop with it
      // (the head only bounces off things that do not give way)
      if (vnAfter > 0.25 * speed) return legOrMachineHit("continue", Math.max(0.3, vnAfter / Math.max(speed, 1e-3)));
      if (vnAfter > -0.1 * speed) return legOrMachineHit("stop");
    }
    if (vn < 0.35 * speedTotal) return legOrMachineHit("continue", 0.7); // glancing blow
    const rel = clamp01(speed / Math.max(def ? def.speed : 6, 1e-3));
    if (hardness >= HARD_RECOIL) return legOrMachineHit("recoil", 1, clamp01(hardness * (0.4 + 0.6 * rel)));
    if (hardness >= MEDIUM_THUD) return legOrMachineHit("recoil", 1, 0.3 * rel);
    return legOrMachineHit("stop");
  }

  /** Static/anchored target (destruction's view; plain physics bodies by motion type; unknown → static). */
  private bodyIsStatic(body: PhysicsBody): boolean {
    try {
      if (this.ctx.destruction.massOf(body) !== null) return this.ctx.destruction.isStatic(body);
      return body.getMotionType() !== PhysicsMotionType.DYNAMIC;
    } catch {
      return true;
    }
  }

  /** Camera shake, hit-stop, pain flash, viewmodel jolt and the toolHit event. */
  private feel(hit: SweepHit, energy: number, hardness: number, mat: MaterialId | null, who: ToolId | LegKind, painful: boolean): void {
    const ctx = this.ctx;
    const s = ctx.settings?.data;
    const shakeScale = s ? (Number.isFinite(s.cameraShake) ? s.cameraShake : 1) : 1;
    const trauma = Math.min(0.85, 0.04 + 0.6 * Math.sqrt(energy / 350)) * (0.45 + 0.55 * hardness) * shakeScale;
    if (trauma > 0.01) {
      try {
        ctx.render?.shake(trauma);
      } catch {
        /* render not ready */
      }
    }
    if ((s?.hitStop ?? true) && energy >= 70 && ctx.time) {
      const dur = (0.02 + 0.07 * clamp01((energy - 70) / 280)) * (0.5 + 0.5 * hardness);
      ctx.time.hitStop(dur, 0.12);
    }
    if (painful) {
      try {
        ctx.render?.flash(0.22, 0xff2a1a);
      } catch {
        /* ignore */
      }
    }
    this.recoilKick = Math.max(this.recoilKick, clamp01(Math.sqrt(energy / 300)) * (0.35 + 0.65 * hardness));
    const p = hit.point,
      n = hit.normal;
    ctx.events?.emit("toolHit", {
      tool: who,
      pos: { x: p.x, y: p.y, z: p.z },
      normal: { x: n.x, y: n.y, z: n.z },
      mat,
      energy,
      hard: hardness >= 0.6,
    });
  }

  // ======================================================================== internals: kick / stomp

  private startLeg(kind: LegKind, tc: ToolContext): void {
    if (this.leg.busy) return;
    this.cacheCamera(tc);
    const m = this.machine;
    if (m.phase === "strike" || m.phase === "recoil") return; // can't kick mid-swing
    if (m.phase === "windup" || m.phase === "charge") m.cancel();
    const def = kind === "kick" ? KICK : STOMP;
    this.legDef = def;
    // player frame: feet below the eye, yaw-aligned horizontal axes
    const eyeH = this.measureEyeHeight(tc);
    this.legEyeHeight = eyeH;
    this.playerAxes(this.legRight, this.legFwd);
    this.legFeet.set(this.eye.x, this.eye.y - eyeH, this.eye.z);
    const p0 = this.c0,
      p1 = this.c1;
    if (kind === "kick") {
      // aim the kick at what the crosshair is on (height and distance), else from the pitch
      let h = KICK.minHeight + (KICK.maxHeight - KICK.minHeight) * clamp01((this.fwd.y + 0.6) / 0.9);
      let reach = KICK.reach;
      this.w0.copyFrom(this.fwd).scaleInPlace(2.2).addInPlace(this.eye);
      const hit = this.safeRay(this.eye, this.w0, tc.ignore);
      if (hit) {
        const hx = hit.point.x - this.legFeet.x,
          hz = hit.point.z - this.legFeet.z;
        const hd = Math.hypot(hx, hz);
        const hy = hit.point.y - this.legFeet.y;
        if (hd <= KICK.reach + 0.2 && hy > 0.1 && hy < 1.15) {
          h = Math.min(KICK.maxHeight, Math.max(KICK.minHeight, hy));
          reach = Math.min(KICK.reach, Math.max(0.6, hd + 0.15));
        }
      }
      p0.x = 0.1;
      p0.y = KICK.hipHeight;
      p0.z = KICK.startForward;
      p1.x = 0.03;
      p1.y = h;
      p1.z = reach;
    } else {
      // stomp: the surface under the crosshair (≤ 1.2 m away, below knee height) or under the feet
      let tx = 0.05,
        ty = 0,
        tz = 0.18;
      this.w0.copyFrom(this.fwd).scaleInPlace(2.6).addInPlace(this.eye);
      const hit = this.safeRay(this.eye, this.w0, tc.ignore);
      if (hit && hit.normal.y > 0.3) {
        const rx = hit.point.x - this.legFeet.x,
          ry = hit.point.y - this.legFeet.y,
          rz = hit.point.z - this.legFeet.z;
        const lx = rx * this.legRight.x + rz * this.legRight.z;
        const lz = rx * this.legFwd.x + rz * this.legFwd.z;
        if (Math.hypot(lx, lz) <= STOMP.reach && ry <= STOMP.maxTargetHeight && ry > -0.5) {
          tx = lx;
          ty = ry;
          tz = lz;
        }
      }
      p0.x = tx;
      p0.y = Math.min(ty + STOMP.lift, Math.max(ty + 0.25, 1.05));
      p0.z = tz * 0.85;
      p1.x = tx;
      p1.y = ty - STOMP.overshoot;
      p1.z = tz;
    }
    this.leg.start(kind, def, p0, p1);
    this.legIgnore = null;
    this.legToWorld(this.leg.path.head[0], this.leg.path.head[1], this.leg.path.head[2], this.prevFoot);
  }

  private stepLeg(dt: number, tc: ToolContext): void {
    const leg = this.leg;
    if (!leg.busy) return;
    // the leg moves with the body: refresh the player frame
    this.playerAxes(this.legRight, this.legFwd);
    this.legFeet.set(this.eye.x, this.eye.y - this.legEyeHeight, this.eye.z);
    const ev = leg.update(dt);
    if (!(ev & EV_STRIKE_STEP) || leg.hits >= 2) return;
    const path = leg.path;
    let t0 = leg.sweepFrom;
    const t1 = leg.sweepTo;
    path.headAtS(path.sAt(t0), this.c0);
    this.legToWorld(this.c0.x, this.c0.y, this.c0.z, this.prevFoot);
    path.headAtS(path.sAt(t1), this.c0);
    this.legToWorld(this.c0.x, this.c0.y, this.c0.z, this.curFoot);
    for (let iter = 0; iter < 2; iter++) {
      const hit = this.safeSweep(this.prevFoot, this.curFoot, this.legDef.footRadius, tc.ignore, this.legIgnore);
      if (!hit) break;
      const tHit = t0 + (t1 - t0) * hit.fraction;
      leg.velocityAt(tHit, this.c1);
      // player frame → world velocity, plus the player's own velocity
      const v = this.w1.set(
        this.legRight.x * this.c1.x + this.legFwd.x * this.c1.z,
        this.c1.y,
        this.legRight.z * this.c1.x + this.legFwd.z * this.c1.z,
      );
      v.addInPlace(this.vel);
      const r = this.applyStrike(hit, v, this.legDef.mass, this.legDef.contactRadius, leg.kind, tHit);
      if (r !== "continue" || leg.phase !== "strike") break;
      this.legIgnore = hit.body;
      this.prevFoot.copyFrom(this.hitCentre);
      t0 = tHit;
    }
  }

  private legToWorld(x: number, y: number, z: number, out: Vector3): Vector3 {
    const r = this.legRight,
      f = this.legFwd,
      o = this.legFeet;
    return out.set(o.x + r.x * x + f.x * z, o.y + y, o.z + r.z * x + f.z * z);
  }

  /** Horizontal right/forward axes of the player (robust when looking straight up/down). */
  private playerAxes(r: Vector3, f: Vector3): void {
    r.set(this.right.x, 0, this.right.z);
    const l = r.length();
    if (l > 1e-6) r.scaleInPlace(1 / l);
    else r.set(1, 0, 0);
    // f = r × worldUp
    f.set(-r.z, 0, r.x);
    // keep the forward sense consistent with the view direction (left-handed Babylon basis)
    if (f.x * this.fwd.x + f.z * this.fwd.z < 0 && Math.abs(this.fwd.y) < 0.98) f.scaleInPlace(-1);
  }

  private measureEyeHeight(tc: ToolContext): number {
    this.w2.set(this.eye.x, this.eye.y - 2.2, this.eye.z);
    const hit = this.safeRay(this.eye, this.w2, tc.ignore, FLOOR_MASK);
    if (!hit) return DEFAULT_EYE_HEIGHT;
    return Math.min(1.7, Math.max(0.9, this.eye.y - hit.point.y));
  }

  private safeRay(from: Vector3, to: Vector3, ignore: PhysicsBody | null, mask: number = HIT_MASK) {
    try {
      return this.ctx.physics.raycast(from, to, mask, ignore);
    } catch (e) {
      console.warn("tools: raycast failed", e);
      return null;
    }
  }

  // ======================================================================== internals: crowbar pry

  private stepPry(dt: number, tc: ToolContext, altPressed: boolean, altDown: boolean): void {
    const p = this.pry;
    if (!altDown) {
      if (p.active) this.endPry(false);
      p.popped = false;
      return;
    }
    if (p.popped) return;
    if (!p.active) {
      // keep trying to wedge the bar in while alt is held (re-pressing retries immediately)
      p.cooldown -= dt;
      if (altPressed) p.cooldown = 0;
      if (p.cooldown > 0) return;
      this.beginPry(tc);
      if (!p.active) return;
    }
    const body = p.body;
    if (!body || body.isDisposed || !body.transformNode) {
      this.endPry(false);
      p.cooldown = PRY_RETRY;
      return;
    }
    // current wedge point and pull direction (they move with the body)
    const wm = body.transformNode.computeWorldMatrix(true);
    Vector3.TransformCoordinatesToRef(p.local, wm, p.point);
    Vector3.TransformNormalToRef(p.localDir, wm, p.dir);
    p.dir.normalize();
    const dx = p.point.x - this.eye.x,
      dy = p.point.y - this.eye.y,
      dz = p.point.z - this.eye.z;
    const dist = Math.hypot(dx, dy, dz);
    const cosA = dist > 1e-6 ? (dx * this.fwd.x + dy * this.fwd.y + dz * this.fwd.z) / dist : 1;
    if (this.shoulderDistance(p.point) > PRY.slipDistance || cosA < Math.cos(PRY.slipAngle)) {
      this.endPry(false); // the bar slipped out
      p.cooldown = PRY_RETRY;
      return;
    }
    p.time += dt;
    p.bondBroke = false;
    let stress = 0;
    try {
      stress = this.ctx.destruction.pry(body, p.point, p.dir, PRY.force, dt);
    } catch (e) {
      console.warn("tools: destruction.pry failed", e);
      this.endPry(false);
      return;
    }
    stress = Number.isFinite(stress) ? clamp01(stress) : 0;
    const last = p.stress;
    p.stress = stress;
    if (stress <= 0) {
      p.zeroTime += dt;
      if (p.zeroTime >= PRY.slipAfter) {
        this.endPry(false); // nothing to lever here: the bar slips off
        p.cooldown = PRY_RETRY;
      }
      return;
    }
    p.zeroTime = 0;
    if (p.bondBroke || stress >= 0.999 || (last >= 0.5 && stress < last - 0.35)) this.endPry(true);
  }

  private beginPry(tc: ToolContext): void {
    const p = this.pry;
    this.w0.copyFrom(this.fwd).scaleInPlace(PRY.rayLength).addInPlace(this.eye);
    const hit = this.safeRay(this.eye, this.w0, tc.ignore);
    // the bar must reach it from the shoulder (arm + bar length)
    if (!hit || this.shoulderDistance(hit.point) > PRY.reach) return;
    let ours = false;
    try {
      ours = this.ctx.destruction.massOf(hit.body) !== null;
    } catch {
      ours = false;
    }
    if (!ours || !hit.body.transformNode) return;
    const wm = hit.body.transformNode.computeWorldMatrix(true);
    wm.invertToRef(this.m0);
    Vector3.TransformCoordinatesToRef(hit.point, this.m0, p.local);
    Vector3.TransformNormalToRef(hit.normal, this.m0, p.localDir);
    p.localDir.normalize();
    p.point.copyFrom(hit.point);
    p.dir.copyFrom(hit.normal);
    p.body = hit.body;
    p.active = true;
    p.stress = 0;
    p.zeroTime = 0;
    p.time = 0;
    p.bondBroke = false;
  }

  /**
   * Distance (m) from the right shoulder to a world point. The shoulder is placed in the BODY frame
   * (yaw only: it does not swing back when the player looks down, unlike a camera-attached point).
   */
  private shoulderDistance(w: Vector3): number {
    this.playerAxes(this.bodyRight, this.bodyFwd);
    const r = this.bodyRight,
      f = this.bodyFwd,
      e = this.eye;
    const sx = e.x + r.x * SHOULDER_R.x + f.x * SHOULDER_R.z,
      sy = e.y + SHOULDER_R.y,
      sz = e.z + r.z * SHOULDER_R.x + f.z * SHOULDER_R.z;
    return Math.hypot(w.x - sx, w.y - sy, w.z - sz);
  }
  private readonly bodyRight = new Vector3(1, 0, 0);
  private readonly bodyFwd = new Vector3(0, 0, 1);

  private endPry(popped: boolean): void {
    const p = this.pry;
    if (p.active && popped) {
      p.popped = true;
      this.recoilKick = Math.max(this.recoilKick, 0.6);
    }
    p.active = false;
    p.body = null;
    p.stress = 0;
    p.time = 0;
  }

  // ======================================================================== internals: extinguisher

  private stepSpray(dt: number, tc: ToolContext, altPressed: boolean, altDown: boolean): void {
    const s = this.spray;
    if (!altDown) {
      if (s.active) this.stopSpray();
      return;
    }
    if (s.contents <= 0) {
      if (s.active) this.stopSpray();
      if (altPressed) this.safeAudioPlay("ui.click", this.eye, 0.6); // empty: the lever just clicks
      return;
    }
    const nozzle = this.nozzleWorld(this.w0);
    // the nozzle is aimed at what the crosshair is on (the jet converges on it)
    const aim = this.sprayAim(tc, nozzle);
    if (!s.active) {
      s.active = true;
      s.k = 0;
      try {
        s.emitter = this.ctx.vfx?.emitter("extinguisher", { x: nozzle.x, y: nozzle.y, z: nozzle.z }, { x: aim.x, y: aim.y, z: aim.z }, SPRAY.rate) ?? null;
      } catch {
        s.emitter = null;
      }
      try {
        // no dedicated extinguisher sample in the bank: a pressurised hiss = the spray loop pitched up
        s.loop = this.ctx.audio?.loop("water.spray", { x: nozzle.x, y: nozzle.y, z: nozzle.z }, { gain: 1, pitch: 1.55 }) ?? null;
      } catch {
        s.loop = null;
      }
    }
    s.contents = Math.max(0, s.contents - dt);
    // pressure sags during the last ~15 % of the charge
    s.pressure = Math.max(0.2, Math.min(1, s.contents / (0.15 * SPRAY.duration)));
    const np = this.nozzleOut;
    np.x = nozzle.x;
    np.y = nozzle.y;
    np.z = nozzle.z;
    try {
      s.emitter?.setPosition(np);
      s.emitter?.setDirection({ x: aim.x, y: aim.y, z: aim.z });
      s.emitter?.setRate(SPRAY.rate * s.pressure);
      s.loop?.setPosition(np);
      s.loop?.setGain(0.4 + 0.6 * s.pressure);
    } catch {
      /* ignore presentation failures */
    }
    this.sprayPush(dt, nozzle, aim, tc, s.pressure);
    if (s.contents <= 0) this.stopSpray();
  }

  /** Unit spray direction from the nozzle towards the crosshair target (≤ spray range). */
  private sprayAim(tc: ToolContext, nozzle: Vector3): Vector3 {
    this.w2.copyFrom(this.fwd).scaleInPlace(SPRAY.range).addInPlace(this.eye);
    const hit = this.safeRay(this.eye, this.w2, tc.ignore);
    const d = hit ? Math.max(0.4, hit.distance) : SPRAY.range;
    const a = this.sprayDir.set(this.eye.x + this.fwd.x * d - nozzle.x, this.eye.y + this.fwd.y * d - nozzle.y, this.eye.z + this.fwd.z * d - nozzle.z);
    const l = a.length();
    if (l > 1e-6) a.scaleInPlace(1 / l);
    else a.copyFrom(this.fwd);
    return a;
  }

  /** The jet pushes light dynamic bodies inside a cone around the aim direction (momentum flux of the jet). */
  private sprayPush(dt: number, nozzle: Vector3, aim: Vector3, tc: ToolContext, pressure: number): void {
    const s = this.spray;
    const n = SPRAY.raysPerStep;
    const fPerRay = (SPRAY.thrust * pressure) / n;
    const from = this.w1.copyFrom(nozzle);
    for (let i = 0; i < n; i++) {
      // golden-angle spiral over the cone, rotating every step
      const k = s.k++;
      const a = k * 2.399963 + i * 0.37;
      const r = SPRAY.coneHalfAngle * Math.pow(((k % 17) + 0.5) / 17, SPRAY.coreExp);
      const sr = Math.sin(r),
        cr = Math.cos(r),
        ca = Math.cos(a),
        sa = Math.sin(a);
      const dx = aim.x * cr + (this.right.x * ca + this.up.x * sa) * sr;
      const dy = aim.y * cr + (this.right.y * ca + this.up.y * sa) * sr;
      const dz = aim.z * cr + (this.right.z * ca + this.up.z * sa) * sr;
      const to = this.w2.set(from.x + dx * SPRAY.range, from.y + dy * SPRAY.range, from.z + dz * SPRAY.range);
      const hit = this.safeRay(from, to, tc.ignore);
      if (!hit) continue;
      const body = hit.body;
      let dynamic = false;
      try {
        dynamic = body.getMotionType() === PhysicsMotionType.DYNAMIC;
      } catch {
        dynamic = false;
      }
      if (!dynamic) continue;
      const j = fPerRay * dt * Math.exp(-hit.distance / SPRAY.decay);
      try {
        body.applyImpulse(this.w3.set(dx * j, dy * j, dz * j), hit.point);
      } catch {
        /* body disposed meanwhile */
      }
    }
  }

  private stopSpray(): void {
    const s = this.spray;
    if (!s.active) return;
    s.active = false;
    try {
      s.emitter?.stop();
    } catch {
      /* ignore */
    }
    try {
      s.loop?.stop(0.15);
    } catch {
      /* ignore */
    }
    s.emitter = null;
    s.loop = null;
  }

  /** World position of the extinguisher nozzle tip (spray pose). */
  private nozzleWorld(out: Vector3): Vector3 {
    const f = this.sprayPose.left;
    const fa = frameFace(this.c1, f);
    const ax = frameAxis(this.c0, f);
    const t = NOZZLE_TIP;
    this.c0.x = f.p.x + fa.x * t.z + ax.x * t.y;
    this.c0.y = f.p.y + fa.y * t.z + ax.y * t.y;
    this.c0.z = f.p.z + fa.z * t.z + ax.z * t.y;
    return this.toWorld(this.c0, out);
  }

  private safeAudioPlay(id: string, p: Vector3, gain: number): void {
    try {
      this.ctx.audio?.play(id, { x: p.x, y: p.y, z: p.z }, { gain });
    } catch {
      /* audio unavailable */
    }
  }

  // ======================================================================== internals: switching + view

  private stepSwitch(dt: number): void {
    if (this.switchPhase === "lower") {
      this.switchT += dt;
      if (this.switchT >= SWITCH_LOWER) {
        this.shown = this._current;
        this.viewmodel?.setTool(this.shown);
        this.switchPhase = "raise";
        this.switchT = 0;
      }
    } else if (this.switchPhase === "raise") {
      this.switchT += dt;
      if (this.switchT >= SWITCH_RAISE) {
        this.switchPhase = "none";
        this.switchT = 0;
      }
    }
  }

  private switchLower(extra: number): number {
    if (this.switchPhase === "lower") return smoothstep01((this.switchT + extra) / SWITCH_LOWER);
    if (this.switchPhase === "raise") return 1 - smoothstep01((this.switchT + extra) / SWITCH_RAISE);
    return 0;
  }

  /** Build the per-frame view state: interpolated swing pose + pry/spray overrides + legs. */
  private composeView(tc: ToolContext, dt: number): void {
    const ex = this.sinceFixed;
    const vs = this.view;
    const shownMachine = this.machines[this.shown];
    shownMachine.poseAt(this.shown === this._current ? ex : 0, this.pose);
    vs.phase = shownMachine.phase;
    // crowbar levering pose: bar wedged at the pry point, hand pulling back with the stress
    if (this.shown === "crowbar" && this.pry.active) this.composePryPose(ex);
    // extinguisher spray pose: blend in/out
    if (this.shown === "extinguisher") {
      const target = this.spray.active && this.holdLower < 0.5 ? 1 : 0;
      const step = SPRAY_BLEND_RATE * dt;
      this.sprayBlend = target > this.sprayBlend ? Math.min(target, this.sprayBlend + step) : Math.max(target, this.sprayBlend - step);
      const u = smoothstep01(this.sprayBlend);
      if (this.sprayBlend > 0.002) {
        copyPose(this.pose2, this.pose);
        blendPose(this.pose2, this.sprayPose, u, shownMachine.toolLen, 0, this.pose);
      }
      // the left hand holds the hose nozzle (aimed along the view while spraying) except during
      // a slam, when it grips the bottom of the cylinder and the nozzle rests clipped to it
      const ph = shownMachine.phase;
      const holdTarget = ph === "idle" || (ph === "recover" && shownMachine.t > 0.45 * this.defs.extinguisher.recover) || this.spray.active ? 1 : 0;
      const hs = NOZZLE_HOLD_RATE * dt;
      this.nozzleHold = holdTarget > this.nozzleHold ? Math.min(1, this.nozzleHold + hs) : Math.max(0, this.nozzleHold - hs);
      blendFrame(this.nozzleIdle.left, this.sprayPose.left, u, this.nozzleFrame);
      blendFrame(this.pose.left, this.nozzleFrame, smoothstep01(this.nozzleHold), this.pose.left);
    } else {
      this.sprayBlend = 0;
      this.nozzleHold = 1;
    }
    vs.sprayBlend = this.sprayBlend;
    vs.nozzleHold = this.nozzleHold;
    vs.tool = this.shown;
    vs.lower = Math.max(this.switchLower(ex), this.holdLower);
    vs.charge = shownMachine.phase === "charge" ? shownMachine.charge : 0;
    vs.fullCharge = shownMachine.phase === "charge" && shownMachine.charge >= 1;
    vs.stress = this.pry.active ? this.pry.stress : 0;
    vs.spraying = this.spray.active;
    vs.sprayPressure = this.spray.active ? this.spray.pressure : 0;
    vs.speed = Math.hypot(tc.velocity.x, tc.velocity.z);
    vs.kick = this.recoilKick;
    // leg (kick/stomp) in camera space
    const lw = this.leg.visibility;
    vs.leg.weight = lw;
    if (lw > 0) {
      this.leg.footAt(ex, this.c0);
      this.legToWorld(this.c0.x, this.c0.y, this.c0.z, this.w0);
      this.toCam(this.w0, vs.leg.foot);
      vs.leg.kind = this.leg.kind;
      // knee bends forward (player forward in camera space); hip under the right side of the body
      const fx = this.legFwd.x,
        fz = this.legFwd.z;
      vs.leg.dir.x = fx * this.right.x + fz * this.right.z;
      vs.leg.dir.y = fx * this.up.x + fz * this.up.z;
      vs.leg.dir.z = fx * this.fwd.x + fz * this.fwd.z;
      this.legToWorld(0.12, 0.92, 0.0, this.w1);
      this.toCam(this.w1, vs.leg.hip!);
      // boot toes: up for a push kick (sole forward), forward for a stomp — camera space
      const toe = vs.leg.toe!;
      if (this.leg.kind === "kick") {
        toe.x = this.right.y;
        toe.y = this.up.y;
        toe.z = this.fwd.y; // world up expressed in camera axes
      } else {
        toe.x = vs.leg.dir.x;
        toe.y = vs.leg.dir.y;
        toe.z = vs.leg.dir.z;
      }
    }
  }

  private sprayBlend = 0;
  private nozzleHold = 1;
  private readonly nozzleFrame = { p: v3(), q: { x: 0, y: 0, z: 0, w: 1 } };

  private composePryPose(ex: number): void {
    const p = this.pry;
    const tip = this.toCam(p.point, this.c0);
    const m = this.machines.crowbar;
    const len = m.toolLen;
    // grip on the line from the shoulder to the wedge point, one bar-length back from the tip
    let ax = tip.x - SHOULDER_R.x,
      ay = tip.y - SHOULDER_R.y,
      az = tip.z - SHOULDER_R.z;
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al;
    ay /= al;
    az /= al;
    // levering: the hand pulls back/down as the stress builds (ramps in over 0.25 s)
    const lever = 0.05 * smoothstep01((p.time + ex) / 0.25) * (0.35 + 0.65 * p.stress);
    const pr = this.pose.right;
    // the grip stays within the arm's reach of the shoulder: for a wedge point at the edge of the
    // pry reach the bar end stops a little short of it rather than the hand floating off the arm
    const gripDist = Math.min(Math.max(al - len, 0.12), PRY_ARM_REACH);
    pr.p.x = SHOULDER_R.x + ax * gripDist;
    pr.p.y = SHOULDER_R.y + ay * gripDist - lever;
    pr.p.z = SHOULDER_R.z + az * gripDist - lever * 0.6;
    // re-aim the bar from the moved hand to the tip
    this.c1.x = tip.x - pr.p.x;
    this.c1.y = tip.y - pr.p.y;
    this.c1.z = tip.z - pr.p.z;
    const bl = Math.hypot(this.c1.x, this.c1.y, this.c1.z) || 1;
    const ux = this.c1.x / bl,
      uy = this.c1.y / bl,
      uz = this.c1.z / bl;
    // the bar pivots on the wedge: slide the hand along it to one bar length from the tip when the
    // arm can reach there (otherwise keep the hand and let the bar end short of the point)
    const gx = tip.x - ux * len,
      gy = tip.y - uy * len,
      gz = tip.z - uz * len;
    if (Math.hypot(gx - SHOULDER_R.x, gy - SHOULDER_R.y, gz - SHOULDER_R.z) <= PRY_ARM_REACH) {
      pr.p.x = gx;
      pr.p.y = gy;
      pr.p.z = gz;
    }
    quatFromAxisFace(pr.q, this.c1, PRY_FACE_HINT);
    this.pose.head.x = pr.p.x + ux * len;
    this.pose.head.y = pr.p.y + uy * len;
    this.pose.head.z = pr.p.z + uz * len;
    this.pose.left.p.x = pr.p.x;
    this.pose.left.p.y = pr.p.y;
    this.pose.left.p.z = pr.p.z;
    Object.assign(this.pose.left.q, pr.q);
  }
}
