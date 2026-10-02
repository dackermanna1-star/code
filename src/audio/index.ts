/**
 * Procedural audio for Minecraft: Photorealistic Physics Edition.
 *
 * Every sound is synthesized at runtime (no audio assets): physical models for impacts and
 * materials, granular textures, formant-synthesized creature voices, FDN / convolution
 * reverbs with procedural impulse responses, and a generative ambient score.
 *
 *   const audio = new AudioEngine();
 *   button.onclick = () => audio.init();             // user gesture
 *   audio.setListener(camPos, camForward, camUp);     // every frame
 *   audio.setAmbience({ ... });                       // every frame
 *   audio.update(dt);                                 // every frame
 *   audio.play('random.pop', { pos });
 *   audio.playBlock(block.sound, 'break', { pos });
 *   const fire = audio.loop('loop.fire', { pos });  … fire.stop();
 *   audio.setMusicMode('overworld');
 */
export { AudioEngine, PREWARM_SOUNDS, PREWARM_GROUPS, type AudioEngineOptions, type AudioStats } from './engine';
export type { Vec3Like, PlayOptions, LoopHandle, AudioCategory, SoundName, LoopName } from './types';
export type { AmbienceState } from './ambience';
export type { MusicMode } from './music';
export type { BlockAction } from './recipes/blocks';
export { SOUND_NAMES, LOOP_NAMES, MUSIC_MODES, AUDIO_CATEGORIES, SOUND_GROUPS, BLOCK_ACTIONS, NOTE_INSTRUMENTS, categoryOf, variationsOf } from './names';
/** Offline synthesis access (tests, tools): render any sound/loop to raw channels. */
export { renderKey, renderSound, renderLoop, renderInstrument, renderIR, type Rendered } from './render';
export { analyze, spectrogram, colormap, type SoundMetrics, type Spectrogram } from './analysis';
export { generatePiece, type Piece } from './music';
