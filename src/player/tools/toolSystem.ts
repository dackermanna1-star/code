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
  sharpnessFor,
  isPainful,
  PAINFUL_PULL,
  HARD_RECOIL,
  MEDIUM_THUD,
  MIN_STRIKE_SPEED,
  MAX_HITS_PER_SWING,
  TURN_SPEED_SHARE,
  DEFAULT_EYE_HEIGHT,
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
  type V3,
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
/** Chest pivot used for the fists' obstruction check (camera space). */
const FIST_PIVOT: V3 = { x: 0, y: -0.25, z: 0 };
/** Right shoulder (camera space) for the crowbar levering pose, and the bar's face hint. */
const SHOULDER_R: V3 = { x: 0.19, y: -0.24, z: -0.02 };
const PRY_FACE_HINT: V3 = { x: -0.5, y: -0.3, z: 0.8 };
/** Floor probe mask (what the player can stand on). */
const FLOOR_MASK = Layer.STATIC | Layer.DYNAMIC;
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

  // ---- viewmodel
  private readonly viewmodel: Viewmodel | null;
  private readonly pose = makePose();
  private readonly pose2 = makePose();
  private readonly sprayPose = makePose();
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
  private readonly unsubs: Array<() => void> = [];

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    const m = {} as Record<ToolId, SwingMachine>;
    for (const id of TOOL_ORDER) m[id] = new SwingMachine(TOOL_DEFS[id], TOOL_RIGS[id]);
    this.machines = m;
    frameFromDef(SPRAY_POSE.right, this.sprayPose.right);
    frameFromDef(SPRAY_POSE.left, this.sprayPose.left);
    this.view = {
      tool: "hands",
      pose: this.pose,
      lower: 0,
      charge: 0,
      fullCharge: false,
      stress: 0,
      spraying: false,
      sprayPressure: 0,
      leg: { weight: 0, foot: v3(), dir: v3(0, 0, 1), kind: "kick" },
      speed: 0,
      kick: 0,
      phase: "idle",
      sprayBlend: 0,
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

  /** HUD charge meter: 0..1 while winding up / charging a swing (0 otherwise). */
  get charge(): number {
    const m = this.machine;
    if (m.phase === "charge") return m.charge;
    if (m.phase === "windup") return 0.001;
    return 0;
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
    m.headAt(0, this.c0);
    this.toWorld(this.c0, this.prevHead);
    // The wound-back head may be inside something behind/above the player (a wall, the ceiling):
    // start the swing from where the tool is actually blocked and ignore that obstacle while the
    // head moves away from it (first part of the path towards the contact point).
    const rig = TOOL_RIGS[this._current];
    this.toWorld(rig.kind === "arc" ? rig.pivot : FIST_PIVOT, this.w0);
    const def = this.defs[this._current];
    const block = this.safeSweep(this.w0, this.prevHead, def.headRadius, tc.ignore, null);
    if (block) {
      this.prevHead.copyFrom(this.hitCentre);
      this.swingIgnore = block.body;
      this.swingIgnoreUntil = m.path.tc * 0.45;
    }
    // whoosh (audio) — position of the head at the start of the strike
    this.ctx.events?.emit("toolSwing", { tool: this._current, pos: { x: this.prevHead.x, y: this.prevHead.y, z: this.prevHead.z }, power: m.charge });
  }

  private sweepStrike(tc: ToolContext): void {
    const m = this.machine;
    const def = this.defs[this._current];
    let t0 = m.sweepFrom;
    const t1 = m.sweepTo;
    m.headAt(t1, this.c0);
    this.toWorld(this.c0, this.curHead);
    // a few hits per step are possible when the head breaks through (glass → stuff behind it)
    for (let iter = 0; iter < MAX_HITS_PER_SWING; iter++) {
      if (m.hits >= MAX_HITS_PER_SWING) break;
      const ignore = this.swingIgnore && t0 < this.swingIgnoreUntil ? this.swingIgnore : null;
      const hit = this.safeSweep(this.prevHead, this.curHead, def.headRadius, tc.ignore, ignore);
      if (!hit) break;
      const tHit = t0 + (t1 - t0) * hit.fraction;
      const outcome = this.resolveSwingHit(hit, tHit, def);
      if (outcome !== "continue") {
        this.prevHead.copyFrom(this.hitCentre);
        return;
      }
      // follow through: ignore this body for the rest of the swing, continue from the contact
      this.swingIgnore = hit.body;
      this.swingIgnoreUntil = Infinity;
      this.prevHead.copyFrom(this.hitCentre);
      t0 = tHit;
      if (m.phase !== "strike") break;
    }
    this.prevHead.copyFrom(this.curHead);
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
  private applyStrike(hit: SweepHit, v: Vector3, mass: number, contactRadius: number, who: ToolId | LegKind, tHit: number): "continue" | "stop" | "recoil" {
    const n = hit.normal;
    const speedTotal = v.length();
    const vn = -(v.x * n.x + v.y * n.y + v.z * n.z); // closing speed along the surface normal
    const isLeg = who === "kick" || who === "stomp";
    const legOrMachineHit = (kind: "continue" | "stop" | "recoil", factor = 1, strength = 1) => {
      if (isLeg) {
        if (kind === "continue") this.leg.slow(factor);
        else this.leg.stop(tHit);
        this.leg.hits++;
      } else this.machine.hit(kind, tHit, factor, strength);
      return kind;
    };
    if (!(vn >= MIN_STRIKE_SPEED)) {
      // grazing contact or a nearly stopped head: glide past fast grazes, otherwise rest against it
      if (speedTotal > 2) return legOrMachineHit("continue", 0.85);
      return legOrMachineHit("stop");
    }
    const d = this.ctx.destruction;
    let preMat: MaterialId | null = null;
    try {
      preMat = d.materialAt(hit.body, hit.point, hit.childIndex);
    } catch {
      preMat = null;
    }
    const fleshy = who === "hands" || isLeg;
    const painful = fleshy && isPainful(preMat);
    // you instinctively pull a punch/kick into concrete or steel
    const speed = painful ? vn * (who === "hands" ? PAINFUL_PULL : 0.8) : vn;
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
        sharpness: isLeg ? 1 : sharpnessFor(who as ToolId, preMat),
        contactRadius,
        strikerMat: isLeg ? "flesh" : (def as ToolDef).strikerMat,
        source,
        tool: isLeg ? undefined : (who as ToolId),
      });
    } catch (e) {
      console.warn("tools: destruction.strike failed", e);
      return legOrMachineHit("stop");
    }
    const energy = Number.isFinite(res.energy) ? Math.max(0, res.energy) : 0;
    const hardness = Number.isFinite(res.hardness) ? clamp01(res.hardness) : 0.5;
    this.feel(hit, energy, hardness, res.targetMat ?? preMat, who, painful);

    // ---- continuation (momentum): the head loses J/m of normal speed
    const dvHead = Number.isFinite(res.impulse) ? Math.max(0, res.impulse) / Math.max(mass, 1e-3) : speed;
    const vnAfter = speed - dvHead;
    let targetMass = Infinity;
    let isStatic = true;
    try {
      const tm = d.massOf(hit.body);
      isStatic = d.isStatic(hit.body);
      if (tm !== null) targetMass = tm;
      else isStatic = hit.body.getMotionType() !== PhysicsMotionType.DYNAMIC;
    } catch {
      /* unknown body: treat as static */
    }
    const ke = 0.5 * mass * speedTotal * speedTotal;
    if (res.broke) {
      // broke through (drywall, glass, a mug…): keep swinging with the energy that is left
      return legOrMachineHit("continue", Math.sqrt(Math.max(0.12, 1 - energy / Math.max(ke, 1e-3))));
    }
    if (!isStatic && targetMass < 3 * mass && vnAfter > 0.25 * speed) {
      return legOrMachineHit("continue", Math.max(0.3, vnAfter / Math.max(speed, 1e-3)));
    }
    if (vn < 0.35 * speedTotal) return legOrMachineHit("continue", 0.7); // glancing blow
    const rel = clamp01(speed / Math.max(def ? def.speed : 6, 1e-3));
    if (hardness >= HARD_RECOIL) return legOrMachineHit("recoil", 1, clamp01(hardness * (0.4 + 0.6 * rel)));
    if (hardness >= MEDIUM_THUD) return legOrMachineHit("recoil", 1, 0.3 * rel);
    return legOrMachineHit("stop");
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
        ctx.render?.flash(who === "hands" ? 0.22 : 0.12, 0xff2a1a);
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
    if (dist > PRY.slipDistance || cosA < Math.cos(PRY.slipAngle)) {
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
    this.w0.copyFrom(this.fwd).scaleInPlace(PRY.reach).addInPlace(this.eye);
    const hit = this.safeRay(this.eye, this.w0, tc.ignore);
    if (!hit) return;
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
    if (!s.active) {
      s.active = true;
      s.k = 0;
      try {
        s.emitter = this.ctx.vfx?.emitter("extinguisher", { x: nozzle.x, y: nozzle.y, z: nozzle.z }, { x: this.fwd.x, y: this.fwd.y, z: this.fwd.z }, SPRAY.rate) ?? null;
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
    const np = { x: nozzle.x, y: nozzle.y, z: nozzle.z };
    try {
      s.emitter?.setPosition(np);
      s.emitter?.setDirection({ x: this.fwd.x, y: this.fwd.y, z: this.fwd.z });
      s.emitter?.setRate(SPRAY.rate * s.pressure);
      s.loop?.setPosition(np);
      s.loop?.setGain(0.4 + 0.6 * s.pressure);
    } catch {
      /* ignore presentation failures */
    }
    this.sprayPush(dt, nozzle, tc, s.pressure);
    if (s.contents <= 0) this.stopSpray();
  }

  /** The jet pushes light dynamic bodies inside a cone along the view (momentum flux of the jet). */
  private sprayPush(dt: number, nozzle: Vector3, tc: ToolContext, pressure: number): void {
    const s = this.spray;
    const n = SPRAY.raysPerStep;
    const fPerRay = (SPRAY.thrust * pressure) / n;
    const from = this.w1.copyFrom(nozzle);
    for (let i = 0; i < n; i++) {
      // golden-angle spiral over the cone, rotating every step
      const k = s.k++;
      const a = k * 2.399963 + i * 0.37;
      const r = SPRAY.coneHalfAngle * Math.sqrt(((k % 17) + 0.5) / 17);
      const sr = Math.sin(r),
        cr = Math.cos(r),
        ca = Math.cos(a),
        sa = Math.sin(a);
      const dx = this.fwd.x * cr + (this.right.x * ca + this.up.x * sa) * sr;
      const dy = this.fwd.y * cr + (this.right.y * ca + this.up.y * sa) * sr;
      const dz = this.fwd.z * cr + (this.right.z * ca + this.up.z * sa) * sr;
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
      const falloff = 1 / (1 + (hit.distance / SPRAY.falloff) ** 2);
      const j = fPerRay * dt * falloff;
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
      if (this.sprayBlend > 0.002) {
        const u = smoothstep01(this.sprayBlend);
        copyPose(this.pose2, this.pose);
        blendPose(this.pose2, this.sprayPose, u, shownMachine.toolLen, 0, this.pose);
        // the left hand holds the nozzle; it does not follow the handle
        blendFrame(this.pose2.left, this.sprayPose.left, u, this.pose.left);
      }
    } else this.sprayBlend = 0;
    vs.sprayBlend = this.sprayBlend;
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
      // the boot points along the leg's travel (kick) or forward (stomp), camera space
      const fx = this.legFwd.x,
        fz = this.legFwd.z;
      vs.leg.dir.x = fx * this.right.x + fz * this.right.z;
      vs.leg.dir.y = fx * this.up.x + fz * this.up.z;
      vs.leg.dir.z = fx * this.fwd.x + fz * this.fwd.z;
    }
  }

  private sprayBlend = 0;

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
    pr.p.x = tip.x - ax * len;
    pr.p.y = tip.y - ay * len - lever;
    pr.p.z = tip.z - az * len - lever * 0.6;
    // re-aim the bar from the moved hand to the tip
    this.c1.x = tip.x - pr.p.x;
    this.c1.y = tip.y - pr.p.y;
    this.c1.z = tip.z - pr.p.z;
    quatFromAxisFace(pr.q, this.c1, PRY_FACE_HINT);
    this.pose.head.x = tip.x;
    this.pose.head.y = tip.y;
    this.pose.head.z = tip.z;
    this.pose.left.p.x = pr.p.x;
    this.pose.left.p.y = pr.p.y;
    this.pose.left.p.z = pr.p.z;
    Object.assign(this.pose.left.q, pr.q);
  }
}
