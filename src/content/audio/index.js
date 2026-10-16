// Audio package: every sound in the city is synthesized (Web Audio, no files).
//  build — registers ~90 named sounds with the engine and starts rendering the buffers in a
//          worker (interactive / likely-early sounds first);
//  init  — installs the footstep synthesizer and the ambience director (beds, far one-shots,
//          silence events, sparse ambient music) as an AudioEngine controller.
// See docs/catalog/audio.md.

import { registerSounds, SOUND_NAMES } from './sounds.js'
import { installFootsteps } from './footsteps.js'
import { Director } from './director.js'
import { bank } from './bank.js'
import * as api from './api.js'

let director = null
let warmed1 = false
let warmed2 = false
let clock = 0

export default {
  name: 'audio',
  order: 5,
  build(ctx) {
    registerSounds(ctx.audio)
    api._bind(ctx.audio, null)
    // interactive + spawn-area sounds first, rendered off the main thread while the city builds
    bank.warmAll((key, spec) => spec.prio <= 2)
  },
  init(ctx) {
    const audio = ctx.audio
    installFootsteps(audio)
    director = new Director(ctx)
    audio.addController(director)
    api._bind(audio, director)
    ctx.registry.audio = {
      sounds: SOUND_NAMES,
      director,
      playAt: api.playAt,
      playStep: api.playStep,
      playRadioFragment: api.playRadioFragment,
      playSpeech: api.playSpeech,
      preload: api.preload,
      requestSilence: api.requestSilence,
      isSilent: api.isSilent,
    }
    // dev: ?audio=silence | music to trigger the director's events a few seconds in
    try {
      const q = new URLSearchParams(location.search).get('audio')
      if (q) director.debug.force = q
    } catch { /* no location */ }
  },
  update(dt) {
    clock += dt
    // after a minute of walking, render the second tier (shop, metro, people) in the background
    if (!warmed1 && clock > 8) { warmed1 = true; bank.warmAll((key, spec) => spec.prio === 3) }
    if (!warmed2 && clock > 45) { warmed2 = true; bank.warmAll((key, spec) => spec.prio >= 4 && spec.prio <= 6) }
    if (director?.debug.force && director.started && clock > 3) {
      const f = director.debug.force
      director.debug.force = null
      if (f === 'silence') director.startSilence(25)
      else if (f === 'music') director.playMusic()
    }
  },
}
