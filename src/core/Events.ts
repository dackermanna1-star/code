/**
 * Tiny typed event bus. Systems talk to each other through these events
 * instead of importing each other, which keeps modules decoupled.
 */
import type { Vector3 } from "@babylonjs/core";

export type RunEndReason = "fuel" | "wrecked" | "evac";

export interface GameEvents {
  /** A zombie was hit by the car (or weapon). `force` is impact speed in m/s. */
  zombieHit: { position: Vector3; force: number; killed: boolean; type: string };
  /** A body part was torn off. */
  limbSevered: { position: Vector3; direction: Vector3 };
  /** Car hit something solid (not a zombie). `force` is relative speed in m/s. */
  carImpact: { position: Vector3; force: number; normal: Vector3 };
  /** Car scraped the ground/wall with its body (sparks). */
  carScrape: { position: Vector3; velocity: Vector3 };
  /** Something exploded. */
  explosion: { position: Vector3; radius: number; power: number };
  /** Car became airborne / landed. */
  airborne: { position: Vector3 };
  landed: { position: Vector3; airTime: number; clean: boolean; flips: number };
  /** A stunt was completed; `bonus` is cash awarded. */
  stunt: { name: string; bonus: number };
  /** A survivor was rescued. */
  survivor: { id: string };
  /** Request a short slow-motion moment. */
  slowmo: { scale: number; duration: number };
  /** Request camera shake (0..1 intensity). */
  shake: { intensity: number };
  /** The run ended. */
  runEnd: { reason: RunEndReason };
  /** Weapon fired (for muzzle flash/audio). */
  weaponFired: { position: Vector3; direction: Vector3; weapon: string };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<any>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const events = new EventBus();
