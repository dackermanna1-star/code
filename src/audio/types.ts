/** Public audio types (kept in a leaf module so internal files can share them without cycles). */

export type Vec3Like = { x: number; y: number; z: number };

export interface PlayOptions {
  /** World position (blocks). Omit for non-positional sounds (UI, the player's own sounds). */
  pos?: Vec3Like;
  /**
   * Linear gain 0..1 (default 1). Values > 1 keep full loudness and extend the audible range
   * (Minecraft semantics — e.g. explosions use 4 → heard ~4× farther).
   */
  volume?: number;
  /** Playback-rate multiplier (default 1); a small random variation is added per sound. */
  pitch?: number;
  /** 0..1 how muffled (walls/underwater). */
  muffle?: number;
}

export interface LoopHandle {
  setPos(p: Vec3Like): void;
  setVolume(v: number): void;
  stop(fadeSeconds?: number): void;
}

export type AudioCategory = 'master' | 'music' | 'blocks' | 'hostile' | 'neutral' | 'players' | 'ambient' | 'weather' | 'ui';

export type SoundName = string;
export type LoopName = string;
