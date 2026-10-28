// Kick / stomp timeline (PURE, no Babylon). The foot path is a straight line in the PLAYER frame
// (origin at the feet, +X right, +Y up, +Z forward along the horizontal view direction), so the
// leg follows the body if the player moves or turns mid-kick. Timing uses the same physical
// profile as tool swings (StrikePath): the foot reaches its peak speed at the nominal contact.
//
//   idle → raise (knee up / leg chambered) → strike (sweep active) → recover → idle

import type { LegActionDef } from "./defs.ts";
import { StrikePath, clamp01, smoothstep01, smootherstep01, v3, type V3 } from "./swing.ts";
import { EV_STRIKE_END, EV_STRIKE_START, EV_STRIKE_STEP } from "./swing.ts";

export type LegPhase = "idle" | "raise" | "strike" | "recover";
export type LegKind = "kick" | "stomp";

/** Foot rest position in the player frame (under the right hip). */
export const FOOT_REST: Readonly<V3> = { x: 0.12, y: 0.08, z: 0.05 };

export class LegAction {
  kind: LegKind = "kick";
  phase: LegPhase = "idle";
  def: LegActionDef | null = null;
  /** Time in the current phase (s). */
  t = 0;
  readonly path = new StrikePath();
  /** Strike times covered by the last update (EV_STRIKE_STEP). */
  sweepFrom = 0;
  sweepTo = 0;
  /** Hits registered in the current strike. */
  hits = 0;
  /** Strike time-rate (follow-through after breaking something). */
  rate = 1;
  private dur = 0;
  private readonly from = v3();
  private readonly tmp = v3();

  get busy(): boolean {
    return this.phase !== "idle";
  }

  /** Begin a kick/stomp along p0 → p1 (player frame) with nominal contact `contactAt` of the way. */
  start(kind: LegKind, def: LegActionDef, p0: V3, p1: V3): void {
    this.kind = kind;
    this.def = def;
    const L = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
    this.path.buildLine(p0, p1, L * def.contactAt, def.speed);
    this.phase = "raise";
    this.t = 0;
    this.dur = Math.max(def.raise, 1e-3);
    this.hits = 0;
    this.rate = 1;
    this.footAt(0, this.from); // (rest)
  }

  /** Advance dt seconds. Returns EV_* flags (strike start / step / end). */
  update(dt: number): number {
    let ev = 0;
    switch (this.phase) {
      case "idle":
        break;
      case "raise":
        this.t += dt;
        if (this.t >= this.dur) {
          const carry = this.t - this.dur;
          this.phase = "strike";
          this.t = Math.min(carry, this.path.T);
          this.sweepFrom = 0;
          this.sweepTo = this.t;
          ev |= EV_STRIKE_START | EV_STRIKE_STEP;
          if (this.t >= this.path.T) ev |= this.endStrike(this.path.T);
        }
        break;
      case "strike":
        this.sweepFrom = this.t;
        this.t = Math.min(this.path.T, this.t + dt * this.rate);
        this.sweepTo = this.t;
        ev |= EV_STRIKE_STEP;
        if (this.t >= this.path.T) ev |= this.endStrike(this.path.T);
        break;
      case "recover":
        this.t += dt;
        if (this.t >= this.dur) {
          this.phase = "idle";
          this.t = 0;
        }
        break;
    }
    return ev;
  }

  /** The foot was stopped by a hit at strike time tHit (no follow-through). */
  stop(tHit: number): void {
    if (this.phase !== "strike" && this.phase !== "recover") return;
    this.path.headAtS(this.path.sAt(Math.min(Math.max(tHit, 0), this.path.T)), this.from);
    this.phase = "recover";
    this.t = 0;
    this.dur = Math.max(this.def?.recover ?? 0.3, 1e-3);
  }

  /** Keep following through at a reduced speed (after breaking/knocking away a target). */
  slow(factor: number): void {
    if (this.phase === "strike") this.rate = Math.max(0.2, this.rate * clamp01(factor));
  }

  cancel(): void {
    this.phase = "idle";
    this.t = 0;
  }

  /** Foot position (player frame) `extra` seconds after the current fixed-step time. */
  footAt(extra: number, out: V3): V3 {
    const ex = Math.max(0, extra);
    switch (this.phase) {
      case "idle":
        out.x = FOOT_REST.x;
        out.y = FOOT_REST.y;
        out.z = FOOT_REST.z;
        return out;
      case "raise": {
        const u = smoothstep01((this.t + ex) / this.dur);
        this.path.headAtS(0, this.tmp);
        return lerp3(FOOT_REST, this.tmp, u, out);
      }
      case "strike":
        return this.path.headAtS(this.path.sAt(Math.min(this.path.T, this.t + ex * this.rate)), out);
      case "recover": {
        const u = smootherstep01((this.t + ex) / this.dur);
        return lerp3(this.from, FOOT_REST, u, out);
      }
    }
  }

  /** Foot velocity (player frame, m/s) at strike time t. */
  velocityAt(t: number, out: V3): V3 {
    const s = this.path.sAt(t);
    this.path.tangentAtS(s, out);
    const sp = this.path.speedAt(t) * this.rate;
    out.x *= sp;
    out.y *= sp;
    out.z *= sp;
    return out;
  }

  /** 0..1 visibility weight of the leg (fades in while raising, out at the end of recovery). */
  get visibility(): number {
    if (this.phase === "idle") return 0;
    if (this.phase === "raise") return clamp01(this.t / Math.max(this.dur * 0.5, 1e-3));
    if (this.phase === "recover") return clamp01(1 - (this.t - this.dur * 0.6) / Math.max(this.dur * 0.4, 1e-3));
    return 1;
  }

  private endStrike(tEnd: number): number {
    this.path.headAtS(this.path.sAt(tEnd), this.from);
    this.phase = "recover";
    this.t = 0;
    this.dur = Math.max(this.def?.recover ?? 0.3, 1e-3);
    return EV_STRIKE_END;
  }
}

function lerp3(a: V3, b: V3, u: number, out: V3): V3 {
  const ax = a.x,
    ay = a.y,
    az = a.z;
  out.x = ax + (b.x - ax) * u;
  out.y = ay + (b.y - ay) * u;
  out.z = az + (b.z - az) * u;
  return out;
}
