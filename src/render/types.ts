import type { HazardKind, PropState } from '../sim/arena';

/**
 * Rendering contracts shared by every renderer module.
 *
 * World space: x grows right, y grows DOWN (canvas convention). The arena floor is y = 0,
 * so everything above the ground has negative y. The arena spans x in [-halfWidth, +halfWidth].
 * A standing fighter is ~120 world units tall.
 */

export interface CameraView {
  /** World point at the centre of the screen. */
  x: number;
  y: number;
  /** Screen pixels per world unit (already includes resolution scaling). */
  zoom: number;
  /** Dutch-angle rotation in radians (applied around the screen centre). */
  rotation: number;
  /** Render target size in device pixels. */
  width: number;
  height: number;
  /** Current shake offset in screen pixels (already included in transforms). */
  shakeX: number;
  shakeY: number;
  /** World -> screen pixel position. */
  worldToScreen(x: number, y: number): { x: number; y: number };
  /** Screen pixel -> world position. */
  screenToWorld(sx: number, sy: number): { x: number; y: number };
  /**
   * Set ctx's transform so that subsequent drawing uses world coordinates.
   * `parallax` in [0,1]: 1 = moves with the world (default), 0 = fixed to the screen.
   * Parallax layers also scale less with zoom: effective zoom = lerp(1, zoom, parallax) * baseScale.
   */
  applyTransform(ctx: CanvasRenderingContext2D, parallax?: number): void;
  /** Visible world-space rectangle (axis-aligned, ignoring rotation; padded slightly). */
  visibleWorldRect(parallax?: number): { left: number; right: number; top: number; bottom: number };
}

/* ------------------------------------------------------------------ */
/* Arena / environment renderer contract                              */
/* ------------------------------------------------------------------ */


/** What the arena renderer needs to know about an environmental hazard instance. */
export interface HazardView {
  id: number;
  kind: HazardKind;
  /** World x of the strike. */
  x: number;
  /** Strike radius in world units. */
  radius: number;
  /** 0..1 progress of the warning/telegraph phase (1 = strike now). */
  warn: number;
  /** True during the damaging strike phase. */
  striking: boolean;
  /** Seconds since the strike started (0 while warning). */
  strikeAge: number;
}

export interface IArenaRenderer {
  /** Advance ambient animation, weather, debris. dt in (time-scaled) seconds. */
  update(dt: number, cam: CameraView, props: readonly PropState[], hazards: readonly HazardView[]): void;
  /** Sky gradient, celestial body, clouds, far + mid parallax silhouettes. Draw first. */
  drawBackground(ctx: CanvasRenderingContext2D, cam: CameraView): void;
  /** Destructible props standing on the fight plane (behind fighters). */
  drawProps(ctx: CanvasRenderingContext2D, cam: CameraView, props: readonly PropState[]): void;
  /** Ground surface, edge highlight, and persistent decals (craters, cracks, scorch marks). */
  drawGround(ctx: CanvasRenderingContext2D, cam: CameraView): void;
  /** Hazard telegraphs and strikes (lightning bolts, lava geysers, icicles, void rifts, starfall). */
  drawHazards(ctx: CanvasRenderingContext2D, cam: CameraView, hazards: readonly HazardView[]): void;
  /** Weather, fog, foreground silhouettes, prop debris chunks in front of everything. Draw last. */
  drawForeground(ctx: CanvasRenderingContext2D, cam: CameraView): void;

  /* ---------- event hooks (called by the director) ---------- */
  onPropHit(prop: PropState, x: number, y: number, power: number): void;
  onPropDestroyed(prop: PropState, dir: number): void;
  addCrater(x: number, radius: number): void;
  addCrack(x: number, length: number): void;
  addScorch(x: number, radius: number, color: string): void;
  /** Momentary world lighting flash (illuminates sky/props), e.g. from a beam or explosion. */
  lightFlash(color: string, intensity: number, x?: number): void;
  /** 0..1 escalation of the late-fight "Divine Collapse" (sky cracks, falling rubble, tint). */
  setCollapse(level: number): void;
  /** Time-stop look (frozen weather, inverted sky accents). */
  setTimeStop(active: boolean): void;
  /** 0..1 dramatic darkening of the environment (ultimates, last stand). */
  setDarken(amount: number): void;
}
