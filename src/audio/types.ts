// Public types of the Munch Lab audio system (re-exported by ./index.ts).

export type SfxName =
  | 'tap' | 'pop' | 'pickup' | 'drop-soft' | 'drop-hard' | 'drop-squish' | 'drop-liquid' | 'drop-crunchy' | 'drop-metal'
  | 'chop' | 'slice' | 'squish' | 'peel' | 'roll' | 'mash' | 'crack' | 'splash' | 'pour' | 'flip' | 'whoosh' | 'swish'
  | 'boing' | 'ding' | 'click' | 'knob' | 'tick'
  | 'door-open' | 'door-close' | 'drawer-open' | 'drawer-close' | 'fridge-open' | 'fridge-close'
  | 'oven-open' | 'oven-close' | 'microwave-beep' | 'microwave-ding' | 'toaster-down' | 'toaster-pop'
  | 'blender-button' | 'fryer-drop' | 'fryer-lift' | 'ignite' | 'bell' | 'trash'
  | 'sparkle' | 'combine' | 'magic' | 'discover'
  | 'squeeze' | 'shake' | 'spray' | 'sprinkle' | 'plop' | 'bubble' | 'ice' | 'freeze' | 'steam-hiss' | 'fire' | 'poof' | 'explode-pop' | 'popcorn'
  | 'crunch' | 'chew' | 'gulp' | 'slurp' | 'lick' | 'burp' | 'cough' | 'sniff' | 'chomp' | 'hiccup'
  | 'ui-open' | 'ui-close' | 'page' | 'camera';

export type LoopName =
  | 'sizzle' | 'grill' | 'boil' | 'fryer' | 'blender' | 'oven' | 'microwave' | 'toaster' | 'freezer' | 'fridge-hum' | 'pour' | 'room';

export type VoicePhrase =
  | 'yum' | 'mmm' | 'wow' | 'yay' | 'love' | 'ok' | 'hmm' | 'huh' | 'eww' | 'bleh' | 'yuck' | 'spicy' | 'sour' | 'brr'
  | 'hot' | 'giggle' | 'gasp' | 'aah' | 'nom' | 'sigh' | 'hungry' | 'hi' | 'oh-no' | 'uh-oh' | 'ta-da' | 'hehe' | 'ooh' | 'sniff-hmm' | 'cry' | 'cough' | 'burp';

export interface PlayOpts {
  volume?: number;
  /** playback-rate style multiplier, 1 = normal */
  pitch?: number;
  /** -1..1 */
  pan?: number;
  /** seconds */
  delay?: number;
}

export interface LoopHandle {
  setVolume(v: number, rampSeconds?: number): void;
  setPitch(p: number, rampSeconds?: number): void;
  stop(fadeSeconds?: number): void;
  readonly playing: boolean;
}

export interface Audio {
  /** Must be called from a user gesture (pointerdown) — creates/resumes the AudioContext. Safe to call repeatedly. */
  unlock(): void;
  readonly ready: boolean;
  /** fire-and-forget, natural random variation each time */
  play(name: SfxName, opts?: PlayOpts): void;
  /** starts (fades in ~0.15 s) */
  loop(name: LoopName, opts?: { volume?: number; pitch?: number; pan?: number }): LoopHandle;
  /** Mochi's voice */
  voice(phrase: VoicePhrase, opts?: { pitch?: number; volume?: number }): void;
  setSfxEnabled(on: boolean): void;
  setMusicEnabled(on: boolean): void;
  readonly sfxEnabled: boolean;
  readonly musicEnabled: boolean;
  /** Start background music (call after unlock; idempotent). */
  startMusic(): void;
  /** Duck the music (e.g. during a big reaction), 0..1 amount, restores after `seconds`. */
  duckMusic(amount: number, seconds: number): void;
  /** Listener-ish: master volume 0..1. */
  setMasterVolume(v: number): void;
}
