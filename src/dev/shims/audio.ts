// DEV-ONLY silent stand-in for src/audio.
export type SfxName = string;
export type LoopName = string;
export type VoicePhrase = string;
export interface PlayOpts { volume?: number; pitch?: number; pan?: number; delay?: number }
export interface LoopHandle { setVolume(v: number, r?: number): void; setPitch(p: number, r?: number): void; stop(f?: number): void; readonly playing: boolean }
export interface Audio { unlock(): void; readonly ready: boolean; play(n: SfxName, o?: PlayOpts): void; loop(n: LoopName, o?: object): LoopHandle; voice(p: VoicePhrase, o?: object): void; setSfxEnabled(on: boolean): void; setMusicEnabled(on: boolean): void; readonly sfxEnabled: boolean; readonly musicEnabled: boolean; startMusic(): void; duckMusic(a: number, s: number): void; setMasterVolume(v: number): void }
const handle: LoopHandle = { setVolume() {}, setPitch() {}, stop() {}, playing: false };
export const audio: Audio = { unlock() {}, ready: false, play() {}, loop: () => handle, voice() {}, setSfxEnabled() {}, setMusicEnabled() {}, sfxEnabled: true, musicEnabled: true, startMusic() {}, duckMusic() {}, setMasterVolume() {} };
