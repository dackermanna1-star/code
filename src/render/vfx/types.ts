import type { AspectId } from '../../core/ids';
import type { Simulation } from '../../sim/simulation';
import type { CameraView } from '../types';

/**
 * VFX contract: particles, impact effects, and rendering of simulation entities
 * (projectiles, beams, ability zones, decoys). All positions are WORLD space unless noted
 * (x right, y DOWN, ground y = 0). Colours are '#rrggbb'.
 *
 * Layering (called by the game each frame, in this order around fighters):
 *   drawBack  → behind fighters (ground telegraphs, dust, smoke, back debris, decoys)
 *   [fighters are drawn here by FighterRenderer]
 *   drawMid   → projectiles, beams, ability zone strikes, sequence visuals at fighter depth
 *   drawFront → sparks, flashes, slashes, rings, foreground particles, damage numbers
 *   drawScreen→ screen-space overlays (anime speed/focus lines) — ctx transform is identity here
 */
export type ShatterStyle = 'ash' | 'light' | 'petals' | 'ice' | 'sparks' | 'void' | 'clock';

export interface IVfx {
  /** Advance particles/effects. dt = time-scaled seconds (0 during freezes). realDt = wall-clock seconds. */
  update(dt: number, realDt: number, sim: Simulation): void;
  drawBack(ctx: CanvasRenderingContext2D, cam: CameraView, sim: Simulation): void;
  drawMid(ctx: CanvasRenderingContext2D, cam: CameraView, sim: Simulation): void;
  drawFront(ctx: CanvasRenderingContext2D, cam: CameraView, sim: Simulation): void;
  drawScreen(ctx: CanvasRenderingContext2D, width: number, height: number): void;
  /** Remove everything (new battle). */
  clear(): void;

  /* ---------------- impact & combat effects ---------------- */
  /** Hit spark burst. level 1..4 scales size; dirX = direction of the blow (+1 = rightward). */
  hitSpark(x: number, y: number, dirX: number, level: number, color: string, opts?: { cut?: boolean; counter?: boolean }): void;
  /** Blocked strike: bright deflection sparks + small shield arc in the defender's colour. */
  blockSpark(x: number, y: number, dirX: number, color: string, heavy: boolean): void;
  /** Parry: crisp star flash + ring; perfect = bigger, with radial lines. */
  parryFlash(x: number, y: number, perfect: boolean, color: string): void;
  /** Weapon clash: two-colour spark fountain + white core + shock ring. */
  clashBurst(x: number, y: number, heavy: boolean, colorA: string, colorB: string): void;
  /** Continuous sparks while blades grind (call every ~6 frames during a blade lock). */
  grindSparks(x: number, y: number, colorA: string, colorB: string): void;
  /** Big decisive slash line across space (counters, finishers). angle in radians. */
  slashLine(x: number, y: number, angle: number, length: number, color: string, width?: number): void;
  /** Expanding ring in world space. */
  shockRing(x: number, y: number, radius: number, color: string, thickness?: number, duration?: number): void;
  /** Explosion with fireball/energy core, smoke, debris and ring. aspect null = neutral (white/orange). */
  explosion(x: number, y: number, radius: number, aspect: AspectId | null): void;
  /** Ground dust puff (landings, dashes, slams). dir = horizontal bias. */
  dust(x: number, y: number, amount: number, dir?: number): void;
  /** Rock / rubble chunks with physics. */
  debris(x: number, y: number, amount: number, color: string, power?: number): void;
  /** Teleport vanish (out=true) / appear flash with inward/outward streaks. */
  teleportFlash(x: number, y: number, color: string, out: boolean): void;
  /** Aura flare burst around a fighter (power-ups, bursts, last stand). */
  auraBurst(x: number, y: number, color: string, power: number): void;
  /** Rising aura flames — call every frame or two while a fighter is charged/ascended. */
  aura(x: number, y: number, color: string, intensity: number): void;
  /** Inward-converging energy motes (charging). Call every frame while charging. */
  chargeMotes(x: number, y: number, color: string, intensity: number): void;
  /** Lightning bolt between two points (jagged, branching), lasts ~0.25s. */
  lightning(x1: number, y1: number, x2: number, y2: number, color: string, width?: number): void;
  /** Death dissolve / shatter of a defeated fighter around (x,y) (centre of body). */
  shatter(x: number, y: number, style: ShatterStyle, color: string): void;
  /** Floating damage number. */
  damageNumber(x: number, y: number, amount: number, color: string, big: boolean): void;
  /** Speed-line streaks around a moving body (dashes) for ~0.2s. */
  dashLines(x: number, y: number, dirX: number, color: string): void;
  /** Screen-space anime focus lines converging on a screen point (px), strength 0..1, for `duration` s. */
  focusLines(screenX: number, screenY: number, strength: number, duration: number): void;
  /** Elemental flourish when two projectiles of different aspects collide. */
  elementalClash(x: number, y: number, a: AspectId, b: AspectId): void;
  /** Generic burst of elemental particles (fire embers, ice shards, leaves, sparks, void motes, light, clock glyphs). */
  elementBurst(x: number, y: number, aspect: AspectId, power: number): void;
  /** Glass-like guard shatter (guard break). */
  guardShatter(x: number, y: number, color: string): void;
  /** Time-stop visual pulse (clock face ring) centred at (x,y); active=false ends it. */
  timeStop(x: number, y: number, color: string, active: boolean): void;
  /** Rewind ghost trail from (x1,y1) to (x2,y2). */
  rewindTrail(x1: number, y1: number, x2: number, y2: number, color: string): void;
  /** Heal sparkles rising around (x,y). */
  healGlow(x: number, y: number, color: string): void;
  /** Finisher-only big set pieces. */
  meteorStrike(x: number, y: number, color: string): void;
  lightPillar(x: number, color: string, duration: number): void;
  singularity(x: number, y: number, color: string, duration: number): void;
  thorns(x: number, color: string): void;
  pyre(x: number, color: string): void;
  freezeSolid(x: number, y: number): void;
  bladesConverge(x: number, y: number, color: string, count: number, converge: boolean): void;
  /** Persistent beam used by finishers (not a sim beam): from (x,y) in direction dir (+1/-1), for duration s. */
  finisherBeam(x: number, y: number, dir: number, color: string, duration: number): void;
}
