// Public API contract of src/audio/index.ts: exact types (checked by `tsc --noEmit`) and the
// "never throws, silent no-op without Web Audio" behaviour (node has no AudioContext).
import { describe, expect, it } from 'vitest';
import { audio } from '../src/audio';
import type { Audio, LoopHandle, LoopName, PlayOpts, SfxName, VoicePhrase } from '../src/audio';

// ---- the spec, verbatim -----------------------------------------------------------------------
type SpecSfxName = 'tap'|'pop'|'pickup'|'drop-soft'|'drop-hard'|'drop-squish'|'drop-liquid'|'drop-crunchy'|'drop-metal'|'chop'|'slice'|'squish'|'peel'|'roll'|'mash'|'crack'|'splash'|'pour'|'flip'|'whoosh'|'swish'|'boing'|'ding'|'click'|'knob'|'tick'|'door-open'|'door-close'|'drawer-open'|'drawer-close'|'fridge-open'|'fridge-close'|'oven-open'|'oven-close'|'microwave-beep'|'microwave-ding'|'toaster-down'|'toaster-pop'|'blender-button'|'fryer-drop'|'fryer-lift'|'ignite'|'bell'|'trash'|'sparkle'|'combine'|'magic'|'discover'|'squeeze'|'shake'|'spray'|'sprinkle'|'plop'|'bubble'|'ice'|'freeze'|'steam-hiss'|'fire'|'poof'|'explode-pop'|'popcorn'|'crunch'|'chew'|'gulp'|'slurp'|'lick'|'burp'|'cough'|'sniff'|'chomp'|'hiccup'|'ui-open'|'ui-close'|'page'|'camera';
type SpecLoopName = 'sizzle'|'grill'|'boil'|'fryer'|'blender'|'oven'|'microwave'|'toaster'|'freezer'|'fridge-hum'|'pour'|'room';
type SpecVoicePhrase = 'yum'|'mmm'|'wow'|'yay'|'love'|'ok'|'hmm'|'huh'|'eww'|'bleh'|'yuck'|'spicy'|'sour'|'brr'|'hot'|'giggle'|'gasp'|'aah'|'nom'|'sigh'|'hungry'|'hi'|'oh-no'|'uh-oh'|'ta-da'|'hehe'|'ooh'|'sniff-hmm'|'cry'|'cough'|'burp';
interface SpecPlayOpts { volume?: number; pitch?: number; pan?: number; delay?: number }
interface SpecLoopHandle { setVolume(v: number, rampSeconds?: number): void; setPitch(p: number, rampSeconds?: number): void; stop(fadeSeconds?: number): void; readonly playing: boolean }
interface SpecAudio {
  unlock(): void; readonly ready: boolean;
  play(name: SpecSfxName, opts?: SpecPlayOpts): void;
  loop(name: SpecLoopName, opts?: { volume?: number; pitch?: number; pan?: number }): SpecLoopHandle;
  voice(phrase: SpecVoicePhrase, opts?: { pitch?: number; volume?: number }): void;
  setSfxEnabled(on: boolean): void; setMusicEnabled(on: boolean): void;
  readonly sfxEnabled: boolean; readonly musicEnabled: boolean;
  startMusic(): void; duckMusic(amount: number, seconds: number): void; setMasterVolume(v: number): void;
}

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const exact: [
  Equals<SfxName, SpecSfxName>,
  Equals<LoopName, SpecLoopName>,
  Equals<VoicePhrase, SpecVoicePhrase>,
  Equals<PlayOpts, SpecPlayOpts>,
  Equals<LoopHandle, SpecLoopHandle>,
  Equals<Audio, SpecAudio>,
] = [true, true, true, true, true, true];
const audioIsAudio: SpecAudio = audio;

describe('public API without Web Audio (node)', () => {
  it('matches the spec exactly', () => {
    expect(exact.every(Boolean)).toBe(true);
    expect(audioIsAudio).toBe(audio);
  });

  it('every method is a silent no-op that never throws', () => {
    const anyAudio = audio as unknown as Record<string, (...a: unknown[]) => unknown>;
    expect(audio.ready).toBe(false);
    expect(() => {
      audio.unlock();
      audio.unlock();
      audio.play('tap');
      audio.play('chop', { volume: 2, pitch: 0.5, pan: -1, delay: 0.2 });
      audio.voice('yum', { pitch: 1.2, volume: 0.5 });
      audio.startMusic();
      audio.duckMusic(0.5, 2);
      audio.setMasterVolume(0.5);
      audio.setSfxEnabled(false);
      audio.setSfxEnabled(true);
      audio.setMusicEnabled(false);
      audio.setMusicEnabled(true);
      // garbage in: unknown names, NaN, wrong types
      anyAudio.play('no-such-sound', { volume: NaN, pitch: Infinity, pan: 'left', delay: -1 });
      anyAudio.play(undefined);
      anyAudio.voice('no-such-phrase');
      anyAudio.duckMusic(NaN, -5);
      anyAudio.setMasterVolume('loud');
    }).not.toThrow();
    expect(audio.ready).toBe(false);
    expect(audio.sfxEnabled).toBe(true);
    expect(audio.musicEnabled).toBe(true);
  });

  it('loop handles are valid (and inert) without Web Audio', () => {
    const h = audio.loop('sizzle', { volume: 0.5 });
    expect(typeof h.setVolume).toBe('function');
    expect(() => {
      h.setVolume(0.3, 0.1);
      h.setPitch(1.2, 0.2);
      h.stop(0.3);
      h.stop();
    }).not.toThrow();
    expect(h.playing).toBe(false);
    const bad = (audio.loop as (n: unknown) => LoopHandle)('nope');
    expect(bad.playing).toBe(false);
    expect(() => bad.stop()).not.toThrow();
  });
});
