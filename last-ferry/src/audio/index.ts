// Public surface of the Last Ferry audio (src/audio): 100% procedural Web Audio.
export { AudioSystem, MAX_VOICES } from './AudioSystem';
export type { AudioGetters, PlayOpts, VoiceHandle } from './AudioSystem';
export type { MusicCue, MusicState } from './Music';
export type { EngineState } from './loops';
export { SOUNDS, SOUND_NAMES } from './sounds';
export type { Bus, SoundDef } from './sounds';
export { bake } from './bake';
