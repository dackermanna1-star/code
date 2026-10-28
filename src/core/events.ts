// Typed event bus: destruction/player emit gameplay events; audio, VFX and HUD react.
// Payload vectors are plain {x,y,z} snapshots (safe to keep), never live engine objects.

import type { Vec3 } from "../geom/vec.ts";
import type { MaterialId, FailureMode } from "../destruction/model/materials.ts";
import type { BondKind } from "../destruction/model/types.ts";

export interface ImpactEv {
  pos: Vec3;
  normal: Vec3;
  /** Energy dissipated in the contact (J). */
  energy: number;
  /** Normal impulse (N·s). */
  impulse: number;
  /** Relative normal speed estimate (m/s). */
  speed: number;
  matA: MaterialId;
  matB: MaterialId | null;
  /** Characteristic sizes (m) of the colliding parts (largest extent) — drives pitch. */
  sizeA: number;
  sizeB: number;
  massA: number;
  massB: number;
  /** Stable ids of the two islands (for per-body rate limiting); -1 = world/unknown. */
  idA: number;
  idB: number;
}

export interface FractureEv {
  pos: Vec3;
  dir: Vec3;
  mat: MaterialId;
  mode: FailureMode;
  energy: number;
  /** Volume of material that broke loose (m³). */
  volume: number;
  /** Physical fragments created (with bodies). */
  pieces: number;
  /** Micro-debris particles spawned. */
  micro: number;
  /** True if the whole part failed (snap/shatter), false for a local breakout. */
  global: boolean;
  /** Largest extent of the broken part (m). */
  size: number;
  assembly: string;
}

export interface GameEvents {
  impact: ImpactEv;
  fracture: FractureEv;
  chip: { pos: Vec3; normal: Vec3; mat: MaterialId; energy: number };
  crack: { pos: Vec3; normal: Vec3; mat: MaterialId; severity: number; size: number };
  dent: { pos: Vec3; normal: Vec3; mat: MaterialId; depth: number; energy: number; size: number };
  bondBreak: { pos: Vec3; kind: BondKind; matA: MaterialId; matB: MaterialId | null; energy: number };
  /** An island became dynamic / split off (for creaks and settling sounds). */
  split: { pos: Vec3; mass: number; pieces: number };
  toolSwing: { tool: string; pos: Vec3; power: number };
  toolHit: { tool: string; pos: Vec3; normal: Vec3; mat: MaterialId | null; energy: number; hard: boolean };
  footstep: { pos: Vec3; mat: MaterialId | null; speed: number };
  land: { pos: Vec3; speed: number; mat: MaterialId | null };
  grab: { pos: Vec3; mass: number };
  throw: { pos: Vec3; energy: number; mass: number };
  drop: { pos: Vec3 };
  /** Creak/strain while prying or pulling a bond (0..1 stress). */
  strain: { pos: Vec3; stress: number; kind: BondKind; mat: MaterialId };
  feature: {
    kind: "lightBroken" | "lightFlicker" | "screenBroken" | "waterStart" | "waterStop" | "sparks" | "powerOut" | "powerOn" | "alarm" | "motorStop";
    pos: Vec3;
    intensity?: number;
  };
  /** Assembly damage changed (HUD repair bill). valueLost = additional dollars destroyed. */
  damage: { assembly: string; type: string; valueLost: number; fraction: number };
  /** A body fell out of the world (off the balcony) — distant crash. */
  fellOut: { pos: Vec3; mass: number; mat: MaterialId };
}

type Handler<T> = (ev: T) => void;

export class EventBus<M extends object = GameEvents> {
  private handlers: { [K in keyof M]?: Handler<M[K]>[] } = {};

  on<K extends keyof M>(type: K, fn: Handler<M[K]>): () => void {
    const list = (this.handlers[type] ??= []);
    list.push(fn);
    return () => {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  emit<K extends keyof M>(type: K, ev: M[K]): void {
    const list = this.handlers[type];
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](ev);
      } catch (e) {
        console.error(`event handler for '${String(type)}' failed`, e);
      }
    }
  }

  clear(): void {
    this.handlers = {};
  }
}
