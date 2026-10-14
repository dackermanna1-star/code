// Test helpers: quiet worlds (no scheduled spawns), lane geometry, stepping.
import { World, type WorldOptions } from '../src/core/World';
import type { Zombie } from '../src/core/Zombie';
import { CAMERA_POS } from '../src/config/view';
import { HUNTER, TICK_RATE } from '../src/config/world';
import { MUZZLE_Z } from '../src/config/weapons';
import type { EventName, GameEvents } from '../src/core/events';

/** A world with the chapter's spawn schedule switched off, already playing. */
export function quiet(opts: WorldOptions = {}): World {
  return new World({ seed: 7, quiet: true, skipSplash: true, ...opts });
}

/** Step `seconds` of game time. */
export function run(w: World, seconds: number): void {
  const n = Math.round(seconds * TICK_RATE);
  for (let i = 0; i < n; i++) w.step();
}

/** Step until `cond` or `maxSeconds`; returns true if the condition was met. */
export function until(w: World, cond: () => boolean, maxSeconds = 60): boolean {
  const n = Math.round(maxSeconds * TICK_RATE);
  for (let i = 0; i < n; i++) {
    if (cond()) return true;
    w.step();
  }
  return cond();
}

/** Freeze a zombie in place (tests aim at it). */
export function hold<T extends Zombie>(z: T): T {
  z.speed = 0;
  z.vx = 0;
  z.vz = 0;
  return z;
}

/** Depth zc at which a gun line at height y0 in lane z0 appears to cross height h. */
export function depthFor(z0: number, h: number, y0 = HUNTER.muzzleHeight): number {
  return CAMERA_POS.z + ((z0 - CAMERA_POS.z) * (h - CAMERA_POS.y)) / (y0 - CAMERA_POS.y);
}

/** Put the hunter so that his current weapon's gun line runs along lane z0. */
export function aimLane(w: World, z0: number, x = 14): void {
  const p = w.player;
  p.x = x;
  p.z = z0 - MUZZLE_Z[p.weapon.id];
  p.vx = p.vz = 0;
}

/** Hold the trigger for one tick. */
export function fireOnce(w: World): void {
  w.player.input.fire = true;
  w.step();
  w.player.input.fire = false;
}

/** Hold the trigger until a round goes off (waits out reloads), then release. */
export function shoot(w: World, maxSeconds = 5): boolean {
  let fired = false;
  const off = w.events.on('shot', () => (fired = true));
  w.player.input.fire = true;
  const n = Math.round(maxSeconds * TICK_RATE);
  for (let i = 0; i < n && !fired; i++) w.step();
  w.player.input.fire = false;
  off();
  return fired;
}

/** Record every emission of an event. */
export function record<K extends EventName>(w: World, name: K): Array<GameEvents[K]> {
  const out: Array<GameEvents[K]> = [];
  w.events.on(name, (e) => out.push(e));
  return out;
}

/** Give the hunter weapons (free) and select the last. */
export function arm(w: World, ...ids: Array<Parameters<World['player']['buy']>[0]>): void {
  const p = w.player;
  const m = p.money;
  p.money = 1e9;
  for (const id of ids) p.buy(id);
  p.money = m;
}
