// Public helpers of the audio package. Other packages can simply call
// ctx.audio.play('<name>', {...}); these helpers add conveniences on top.

import { bank } from './bank.js'
import { SOUND_NAMES, keysOf, bufferVoice } from './sounds.js'
import { STEP_SOUNDS } from './footsteps.js'
import { CASHIER_PHRASES, KIOSK_PHRASES, PA_PHRASES } from './recipes/people.js'
import { hashStr, makeRng } from './dsp.js'
import { SURF } from '../../core/materials.js'

const rnd = makeRng(0x2008)

let ENGINE = null
let DIRECTOR = null
/** @internal set by the package entry */
export function _bind(engine, director) { ENGINE = engine; if (director) DIRECTOR = director }

export { SOUND_NAMES, CASHIER_PHRASES, KIOSK_PHRASES, PA_PHRASES }

const eng = o => (o && o.engine) || ENGINE

/** play(name) at a world position: playAt('dog_bark', [x, y, z], { gain }). Returns the emitter or null. */
export function playAt(name, pos, opts = {}) {
  const e = eng(opts)
  if (!e?.ready) return null
  return e.play(name, { ...opts, pos })
}

const SURF_NAMES = Object.fromEntries(Object.entries(SURF).map(([k, v]) => [v, k.toLowerCase()]))
/**
 * Someone else's footstep at a position (NPCs, the stray dog's owner…).
 * surface: SURF.* number or name ('snow', 'snow_packed', 'tile', …).
 */
export function playStep(surface, pos, opts = {}) {
  const e = eng(opts)
  if (!e?.ready) return null
  let key = typeof surface === 'number' ? STEP_SOUNDS[surface]?.[0] : 'step_' + String(surface).toLowerCase()
  if (!key || !e.has(key)) key = 'step_' + (SURF_NAMES[surface] || 'snow')
  if (!e.has(key)) key = 'step_snow'
  return e.play(key, { gain: 0.8, ...opts, pos })
}

/**
 * A fragment (8–18 s) of a late-2000s pop song from a cheap radio somewhere (a kiosk, an open
 * форточка, a parked car), with a burst of tuning static. Returns the emitter or null.
 * opts: { duration, gain, variant (0 dance-pop, 1 шансон), refDistance, static: false }
 */
export function playRadioFragment(pos, opts = {}) {
  const e = eng(opts)
  if (!e?.ready) return null
  const em = e.play('radio_distant', { refDistance: 4, ...opts, pos, fragment: true })
  if (em && opts.static !== false) {
    try {
      const ctx = e.ctx
      const n = ctx.createBufferSource()
      n.buffer = e.noise('white', 2, 11)
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 0.6
      const g = ctx.createGain()
      const t = ctx.currentTime
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.05, t + 0.05)
      g.gain.setTargetAtTime(0, t + 0.35, 0.15)
      n.connect(bp); bp.connect(g); g.connect(em.gain)
      n.start(t, rnd() * 1.5)
      n.stop(t + 1.4)
      n.onended = () => { try { g.disconnect() } catch { /* ignore */ } }
    } catch { /* static is optional */ }
  }
  return em
}

/**
 * Speak any Russian text (synthesized, deliberately unintelligible but with the right rhythm and
 * intonation). Rendered asynchronously, starts ~0.1–0.4 s later. Mark stress with '+' after a vowel.
 * opts: { voice: 'male'|'female'|'old'|'child'|'anchor', chain: 'pa'|'wall'|'phone'|'radio'|'muffled'|'none',
 *         pos, gain, bus, refDistance, ... } → emitter
 */
export function playSpeech(text, opts = {}) {
  const e = eng(opts)
  if (!e?.ready || !text) return null
  const chain = opts.chain ?? 'none'
  const voice = opts.voice ?? 'male'
  const params = { id: (hashStr(text + '|' + voice + '|' + chain) >>> 0).toString(36), text, voice, chain, rate: opts.rate, f0: opts.f0 }
  const src = bufferVoice(e, 'speech', 0, { params, sync: false, gain: Math.pow(10, -6 / 20), maxLate: 6 })
  src.duration = text.length * 0.075 + 2.5
  return e.connectSource(src, { bus: chain === 'phone' ? 'ui' : 'sfx', refDistance: 3, reverb: chain === 'phone' ? 0 : 0.7, ...opts })
}

/** Ask the worker to render the buffers of these sounds now (e.g. before a scripted moment). */
export function preload(names) {
  const list = Array.isArray(names) ? names : [names]
  return Promise.all(list.flatMap(n => keysOf(n).map(k => bank.requestAll(k))))
}

/** Trigger a silence event now (the world fades to near-silence for `seconds`). */
export function requestSilence(seconds = 30) { DIRECTOR?.startSilence(seconds) }
/** True while a silence event or a silence zone is muting the world. */
export function isSilent() { return !!(DIRECTOR && (DIRECTOR.silence.state === 'fading' || DIRECTOR.silence.state === 'silent' || DIRECTOR.env.silenceZone > 0.5)) }
/** Start an ambient music piece now (if none is playing). */
export function playMusicNow(seed) { return DIRECTOR?.playMusic(seed) ?? null }
/** Debug snapshot of the ambience director and the buffer bank. */
export function audioStats() { return DIRECTOR?.stats() ?? { bank: { ...bank.stats, pending: bank.pending() } } }
