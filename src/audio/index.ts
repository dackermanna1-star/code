// Munch Lab audio — public entry point.
//
//   import { audio } from '../audio';
//   audio.unlock();                       // from a user gesture (pointerdown); safe to repeat
//   audio.play('chop', { pitch: 1.1 });   // fire-and-forget one-shot with natural variation
//   const h = audio.loop('sizzle');       // h.setVolume(0.5, 0.1); h.stop(0.3)
//   audio.voice('yum');                   // Mochi
//   audio.startMusic();                   // generative café music
//
// Everything is synthesised procedurally (no audio files): see sfx.ts, loops.ts, voice.ts,
// music.ts for the sound design and engine.ts for the runtime. Every method is a safe no-op
// before unlock(), when Web Audio is unavailable, or for unknown names, and never throws.

import type { Audio, LoopHandle } from './types';
import { Engine } from './engine';

export type { SfxName, LoopName, VoicePhrase, PlayOpts, LoopHandle, Audio } from './types';

const SILENT_LOOP: LoopHandle = Object.freeze({ setVolume() {}, setPitch() {}, stop() {}, playing: false });

/** Used only if the engine itself cannot be constructed. */
const SILENT: Audio = Object.freeze({
  unlock() {},
  ready: false,
  play() {},
  loop: () => SILENT_LOOP,
  voice() {},
  setSfxEnabled() {},
  setMusicEnabled() {},
  sfxEnabled: true,
  musicEnabled: true,
  startMusic() {},
  duckMusic() {},
  setMasterVolume() {},
});

function createAudio(): Audio {
  try {
    return new Engine();
  } catch {
    return SILENT;
  }
}

export const audio: Audio = createAudio();
