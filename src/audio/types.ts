import type { AspectId } from '../core/ids';

/**
 * Audio contract. The implementation (AudioEngine.ts) synthesises EVERYTHING procedurally
 * with the WebAudio API — no external sample files — so the game is a single self-contained page.
 */

export type SfxId =
  // movement
  | 'whoosh_light' | 'whoosh_heavy' | 'whoosh_blade' | 'dash' | 'jump' | 'land' | 'land_heavy' | 'footstep'
  | 'teleport_out' | 'teleport_in'
  // melee impacts
  | 'hit_light' | 'hit_medium' | 'hit_heavy' | 'hit_crit' | 'slash_hit'
  | 'block' | 'guard_break' | 'parry' | 'perfect_parry' | 'clash' | 'clash_heavy' | 'grab' | 'throw_slam'
  // energy & abilities
  | 'charge_release' | 'projectile_fire' | 'projectile_hit' | 'beam_fire'
  | 'explosion_small' | 'explosion_big' | 'shockwave'
  | 'thunder' | 'lightning_zap' | 'fire_burst' | 'ice_shatter' | 'void_pulse' | 'radiant_chime' | 'earth_rumble' | 'nature_burst' | 'chrono_tick'
  | 'meteor_fall' | 'meteor_impact'
  | 'time_stop' | 'time_resume' | 'rewind'
  | 'shield_up' | 'shield_hit' | 'shield_break' | 'reflect'
  | 'chains' | 'gravity' | 'blade_summon' | 'spatial_cut' | 'heal'
  | 'transform' | 'ultimate_cutin' | 'aura_flare' | 'burst'
  // drama
  | 'last_stand' | 'heartbeat' | 'ko' | 'finisher_slash' | 'finish_boom' | 'dramatic_hit' | 'slowmo_in' | 'slowmo_out'
  // environment
  | 'wall_splat' | 'pillar_break' | 'debris' | 'rumble'
  // ui
  | 'ui_select' | 'ui_vs' | 'ui_fight' | 'victory' | 'countdown';

/** Continuous sounds controlled through a handle. */
export type LoopId =
  | 'charge'          // energy charging aura (intensity: charge level)
  | 'beam'            // beam sustain (intensity: beam power)
  | 'beam_struggle'   // two beams colliding (intensity: struggle tension)
  | 'blade_lock'      // weapons grinding in a clash lock
  | 'aura'            // transformed aura hum
  | 'timestop'        // eerie drone while time is frozen
  | 'wind'            // ambience wind (intensity: gustiness)
  | 'rain'            // ambience rain
  | 'lava'            // ambience lava rumble
  | 'void_hum';       // ambience for the void arena

export interface SfxParams {
  /** Stereo pan -1 (left) .. 1 (right). */
  pan?: number;
  /** Linear gain multiplier (default 1). */
  volume?: number;
  /** Pitch multiplier (default 1). */
  pitch?: number;
  /** 0..1 scales "size" of the sound (heavier, longer, more low end). */
  intensity?: number;
  /** Elemental flavour for ability sounds. */
  aspect?: AspectId;
}

export interface LoopHandle {
  /** 0..1 */
  setIntensity(v: number): void;
  setPan(p: number): void;
  stop(fadeSeconds?: number): void;
  readonly active: boolean;
}

export type MusicStinger = 'clash' | 'transform' | 'laststand' | 'ko' | 'victory' | 'ultimate' | 'phase';

export interface IAudioEngine {
  /** Must be called from a user gesture before audio is audible (browser autoplay policy). */
  resume(): Promise<void>;
  readonly ready: boolean;

  play(id: SfxId, params?: SfxParams): void;
  loop(id: LoopId, params?: SfxParams): LoopHandle;
  stopAllLoops(fadeSeconds?: number): void;

  /** 0..1 master volume. */
  setMasterVolume(v: number): void;
  setMuted(m: boolean): void;
  readonly muted: boolean;

  /**
   * Slow-motion feel: 0 = normal, 1 = deep slow motion (SFX bus low-passed and pitched down,
   * music filtered). Called every frame by the director.
   */
  setSlowmo(amount: number): void;

  /* ---------- adaptive procedural music ---------- */
  /** Start a new piece; the seed picks key, tempo, progression, instrumentation. */
  startMusic(seed: number, mood?: 'epic' | 'dark' | 'ethereal' | 'frantic'): void;
  /** 0..1 battle intensity: adds/removes layers (drums, bass, arps, choir) smoothly. */
  setMusicIntensity(v: number): void;
  /** Momentary musical punctuation. */
  musicStinger(kind: MusicStinger): void;
  /** Drop the music to near silence for `seconds` (dramatic pause), then bring it back. */
  musicSilence(seconds: number): void;
  /** Temporarily lower music volume (0..1 amount) for `seconds`. */
  duckMusic(amount: number, seconds: number): void;
  stopMusic(fadeSeconds?: number): void;
}
