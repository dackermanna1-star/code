// Sound factories: every named sound other packages can audio.play(). Each factory wires a
// pre-rendered buffer (from the bank) into a tiny node graph: BufferSource → Gain. Factories
// also fill in sensible spatial defaults (bus, refDistance, rolloff, reverb send) on the opts
// object when the caller did not specify them — the engine reads the same opts object after
// the factory runs, so a dog far away is audible with a plain play('dog_bark', {pos}).

import { bank } from './bank.js'
import { makeRng } from './dsp.js'
import { CAR_SPEEDS } from './recipes/transport.js'
import { CASHIER_PHRASES, KIOSK_PHRASES, PA_PHRASES } from './recipes/people.js'
import { RINGTONES } from './recipes/ui.js'

const rnd = makeRng(20080114)
const lastVariant = new Map()
const dbg = db => Math.pow(10, db / 20)

/** Random variant of a key, avoiding the one played last time. */
function pickVariant(key) {
  const n = bank.spec(key)?.variants ?? 1
  if (n <= 1) return 0
  const last = lastVariant.get(key) ?? -1
  let v = Math.floor(rnd() * n)
  if (v === last) v = (v + 1 + Math.floor(rnd() * (n - 1))) % n
  lastVariant.set(key, v)
  return v
}

/**
 * Buffer voice: plays bank buffer (key, v). Starts immediately when the buffer is ready;
 * otherwise renders it synchronously (sync=true) or starts as soon as the worker delivers it.
 * o: { loop, rate, gain, offset, delay, sync, maxLate, stopAfter, fadeIn, fadeOut, params }
 */
export function bufferVoice(engine, key, v, o = {}) {
  const ctx = engine.ctx
  const out = ctx.createGain()
  const g = o.gain ?? 1
  const t0 = ctx.currentTime
  let src = null, stopped = false, rate = o.rate ?? 1
  const spec = bank.spec(key)
  const loop = !!o.loop
  const begin = buffer => {
    if (stopped || !buffer) return
    const now = ctx.currentTime
    if (!loop && now - t0 > (o.maxLate ?? 4)) return // too late to be meaningful
    src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = loop
    src.playbackRate.value = rate
    src.connect(out)
    const start = Math.max(now, t0 + (o.delay ?? 0))
    let off = 0
    if (loop) off = ((o.offset ?? rnd() * buffer.duration) % buffer.duration + buffer.duration) % buffer.duration
    else if (o.offset) off = Math.min(o.offset, buffer.duration - 0.05)
    const fi = o.fadeIn ?? (off > 0 ? 0.08 : 0)
    if (fi > 0) { out.gain.setValueAtTime(0, start); out.gain.linearRampToValueAtTime(g, start + fi) } else out.gain.setValueAtTime(g, start)
    src.start(start, off)
    if (o.stopAfter) {
      const end = start + o.stopAfter
      const fo = o.fadeOut ?? 0.05
      out.gain.setValueAtTime(g, Math.max(start + fi, end - fo))
      out.gain.linearRampToValueAtTime(0, end)
      src.stop(end + 0.02)
    }
    src.onended = () => { try { src.disconnect() } catch { /* ignore */ } }
  }
  out.gain.value = 0
  const ready = bank.has(key, v, o.params)
  const sync = o.sync ?? (spec ? spec.prio <= 2 && !spec.lazy : true)
  let buffer = null
  if (ready || sync) {
    buffer = bank.get(key, v, ctx, true, o.params)
    begin(buffer)
  } else {
    bank.request(key, v, true, o.params).then(() => begin(bank.get(key, v, ctx, true, o.params)))
  }
  let duration
  if (!loop) {
    if (o.stopAfter) duration = o.stopAfter + (o.delay ?? 0)
    else if (buffer) duration = buffer.duration / rate + (o.delay ?? 0)
    else duration = (spec?.maxDur ?? 12) / rate + (o.delay ?? 0) + 0.5
  }
  return {
    output: out,
    duration,
    stop(when) {
      stopped = true
      try { src?.stop(when ?? ctx.currentTime) } catch { /* already stopped */ }
    },
    setRate(r) {
      rate = r
      if (src) src.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.15)
    },
  }
}

// ---- spatial defaults per category -------------------------------------------------------------

const UI = { bus: 'ui', reverb: 0, occlude: false }
const NEAR = { bus: 'sfx', refDistance: 3, rolloff: 1.2, reverb: 1 }
const ROOM = { bus: 'ambience', refDistance: 1.5, rolloff: 1.3, reverb: 0.7, maxDistance: 60 }
const MACHINE = { bus: 'ambience', refDistance: 3, rolloff: 1.1, reverb: 0.6, maxDistance: 120 }
const FAR = { bus: 'ambience', refDistance: 30, rolloff: 1, reverb: 0.4, maxDistance: 900 }
const VEHICLE = { bus: 'sfx', refDistance: 8, rolloff: 1, reverb: 0.5, maxDistance: 600 }

function defaults(opts, d) {
  if (!opts || typeof opts !== 'object') return
  try {
    for (const k in d) if (opts[k] === undefined) opts[k] = d[k]
  } catch { /* frozen opts: fine */ }
}

/**
 * Sound table. key: recipe (string or fn(opts) → [key, variant]), db: level of the normalized
 * buffer, loop: plays as a loop until stopped, rate: random playback-rate range, sp: spatial defaults.
 */
const S = {}
const one = (name, db, sp, extra = {}) => { S[name] = { key: name, db, sp, loop: false, rate: [0.97, 1.03], ...extra } }
const loop = (name, db, sp, extra = {}) => { S[name] = { key: name, db, sp, loop: true, rate: [1, 1], ...extra } }

// UI / phone
one('click', -14, UI, { rate: [0.95, 1.05] })
one('paper', -12, UI, { rate: [0.9, 1.1] })
one('phone_key', -16, UI, { rate: [1, 1] })
one('phone_sms', -14, UI, { rate: [1, 1] })
one('phone_vibrate', -12, UI, { rate: [0.98, 1.02], pick: o => (o.loop ? ['phone_vibrate_loop', 0, true] : null) })
loop('phone_ring_out', -16, UI, { prefetch: ['phone_unavailable'] })
loop('phone_busy', -16, UI, { cycles: 0.8 })
loop('payphone_dial', -18, UI)
one('phone_unavailable', -13, UI, { rate: [1, 1] })
one('dial_pulse', -12, UI, { rate: [1, 1], pick: o => ['dial_pulse', o.digit === undefined ? Math.floor(rnd() * 10) : ((+o.digit || 10) - 1 + 10) % 10] })
one('gsm_interference', -16, { ...UI, bus: 'sfx' }, { rate: [1, 1] })
loop('phone_ringtone', -12, UI, { pick: o => ['phone_ringtone', ((o.melody ?? 0) % RINGTONES.length + RINGTONES.length) % RINGTONES.length, o.loop !== false] })

// doors & buildings
one('door_metal_open', -6, NEAR)
one('door_metal_slam', -2, { ...NEAR, refDistance: 4 })
one('door_magnet_lock', -7, NEAR)
one('door_wood', -7, NEAR, { rate: [0.92, 1.08] })
one('intercom_beep', -13, NEAR, { rate: [1, 1], pick: o => ['intercom_beep', { ok: 3, accept: 3, open: 4, unlock: 4, error: 5, wrong: 5 }[o.kind] ?? Math.floor(rnd() * 3)] })
loop('intercom_call', -14, NEAR)
one('doorbell', -10, { ...NEAR, refDistance: 2 }, { rate: [1, 1], pick: o => ['doorbell', o.kind ? ({ trill: 0, bell: 1, chime: 2 }[o.kind] ?? 0) : o.seed !== undefined ? Math.floor(Math.abs(+o.seed) * 997) % 3 : 0] })
one('elevator_call', -6, NEAR, { prefetch: ['elevator_doors', 'elevator_motor', 'elevator_stop'] })
one('elevator_doors', -7, NEAR, { pick: o => ['elevator_doors', (o.dir === 'close' || o.close ? 1 : 0) + (rnd() < 0.5 ? 2 : 0)] })
loop('elevator_motor', -9, MACHINE)
one('elevator_stop', -5, NEAR)
one('garbage_chute', -9, { ...MACHINE, refDistance: 4 })
one('radiator_knock', -11, { ...MACHINE, refDistance: 4 }, { pick: o => ['radiator_knock', o.kind === 'tick' ? 3 : Math.floor(rnd() * 3)] })
loop('water_pipe', -14, ROOM)

// ambient emitters (loops)
loop('tv_muffled', -12, ROOM, { pick: o => ['tv_muffled', o.variant === 'show' || o.variant === 1 ? 1 : o.variant === 'news' || o.variant === 0 ? 0 : Math.floor(rnd() * 2), true] })
loop('voices_muffled', -12, ROOM)
loop('fridge_hum', -17, { ...ROOM, refDistance: 1.2 })
loop('fluorescent_buzz', -19, { ...ROOM, refDistance: 1.5 }, { pick: o => ['fluorescent_buzz', o.failing || o.flicker ? 1 : 0, true] })
loop('transformer_hum', -13, MACHINE)
loop('boiler_hum', -9, { ...MACHINE, refDistance: 6 })
loop('ventilation', -11, { ...MACHINE, refDistance: 4 })
loop('escalator_loop', -11, { ...MACHINE, refDistance: 5 })
loop('car_idle', -11, { ...MACHINE, refDistance: 2.5 }, { pick: o => ['car_idle', o.variant ?? Math.floor(rnd() * 2), true] })
loop('radio_distant', -12, { ...MACHINE, refDistance: 3 }, { fragment: true })
loop('swing_creak', -14, { ...MACHINE, refDistance: 3 }, { rateLoop: [0.92, 1.08] })
loop('shop_ambience', -9, { ...MACHINE, refDistance: 5 })
loop('wires_hum', -18, { ...MACHINE, refDistance: 6 })

// one-shots in the world
one('dog_bark', -4, FAR, { rate: [0.94, 1.06], pick: o => ['dog_bark', o.howl ? 5 : o.dog !== undefined ? (+o.dog % 5) : Math.floor(rnd() * 5)] })
one('crow_caw', -6, { ...FAR, refDistance: 20 }, { rate: [0.95, 1.05], pick: o => ['crow_caw', o.jackdaw ? 4 : Math.floor(rnd() * 4)] })
one('crows_takeoff', -6, { ...FAR, refDistance: 12 })
one('car_pass', -5, VEHICLE, { pick: carPick('car_pass', 'car_drive') })
one('bus_pass', -3, VEHICLE, { pick: o => (o.loop ? ['bus_drive', 0, true] : null) })
one('trolleybus_pass', -3, VEHICLE, { pick: o => (o.loop ? ['trolleybus_drive', 0, true] : null) })
one('trolleybus_depart', -2, { ...VEHICLE, refDistance: 6 }, { rate: [0.98, 1.02] })
one('pantograph_spark', -9, { ...VEHICLE, refDistance: 10 })
one('train_pass', -2, { ...FAR, refDistance: 60 })
one('train_horn', -3, { ...FAR, refDistance: 80, maxDistance: 1500 }, { rate: [0.97, 1.03] })
one('metro_rumble', -1, { ...FAR, refDistance: 20, reverb: 0.5 }, { pick: o => (o.loop ? ['metro_rumble_loop', 0, true] : null) })
one('metro_train_arrive', -1, { ...VEHICLE, refDistance: 12, reverb: 0.8 }, { rate: [0.98, 1.02], prefetch: ['metro_doors', 'metro_train_depart'] })
one('metro_train_depart', -1, { ...VEHICLE, refDistance: 12, reverb: 0.8 }, { rate: [0.98, 1.02] })
one('metro_doors', -3, { ...NEAR, refDistance: 10, reverb: 0.7 }, { rate: [1, 1] })
one('metro_chime', -8, { ...NEAR, refDistance: 12, reverb: 0.8 }, { rate: [1, 1] })
one('metro_station_announce', -4, { ...NEAR, refDistance: 6, reverb: 0.5 }, { rate: [1, 1], pick: o => ['metro_station_announce', o.terminus ? 1 : 0] })
one('announcement', -4, { ...NEAR, refDistance: 15, reverb: 0.8 }, { rate: [1, 1], pick: o => ['announcement', o.phrase !== undefined ? (+o.phrase % PA_PHRASES.length) : Math.floor(rnd() * PA_PHRASES.length)] })
one('escalator_step', -10, NEAR)
one('turnstile', -7, NEAR, { pick: o => ['turnstile', { slam: 1, gate: 2 }[o.kind] ?? 0] })
one('snow_shovel', -6, { ...FAR, refDistance: 15 }, { rate: [0.92, 1.08] })
one('snow_fall_branch', -9, { ...NEAR, refDistance: 4, reverb: 0.4 })
one('car_alarm', -6, { ...FAR, refDistance: 35 }, { rate: [0.99, 1.01] })
one('distant_door_slam', -4, { ...FAR, refDistance: 25 })
one('footsteps_phantom', -6, { ...NEAR, refDistance: 5, reverb: 0.6 }, { pick: o => (o.indoor || o.surface === 'indoor' ? ['footsteps_phantom_indoor', Math.floor(rnd() * 2)] : null) })
one('cashier_voice', -7, { ...NEAR, refDistance: 2.5 }, { rate: [1, 1], pick: o => ['cashier_voice', o.random ? Math.floor(rnd() * CASHIER_PHRASES.length) : (+(o.phrase ?? 0) % CASHIER_PHRASES.length)] })
one('kiosk_voice', -8, { ...NEAR, refDistance: 2.5 }, { rate: [1, 1], pick: o => ['kiosk_voice', o.phrase !== undefined ? (+o.phrase % KIOSK_PHRASES.length) : Math.floor(rnd() * KIOSK_PHRASES.length)] })
one('shop_bell', -10, NEAR, { key: 'metro_chime', rate: [1.18, 1.22] }) // IR door chime «дин-дон» (E5→C5) a little higher
one('ice_crack', -8, { ...NEAR, refDistance: 5 }, { rate: [0.9, 1.1] })
one('breath', -24, { ...UI, bus: 'sfx' }, { rate: [0.92, 1.06] })

// extras
one('drip', -13, { ...NEAR, refDistance: 2, reverb: 1.2 }, { rate: [0.85, 1.2] })
one('kids_sledding', -6, { ...FAR, refDistance: 20 })
one('snowplow_pass', -3, VEHICLE)
one('traffic_far', -4, { ...FAR, refDistance: 40, reverb: 0.3 }, { rate: [0.95, 1.05] })
one('stamp_snow', -10, NEAR)
one('metro_station_announce_terminus', -4, { ...NEAR, refDistance: 6, reverb: 0.5 }, { key: 'metro_station_announce', rate: [1, 1], pick: () => ['metro_station_announce', 1] })
loop('car_drive', -6, VEHICLE, { rateLoop: [0.97, 1.03] })
loop('bus_drive', -4, VEHICLE)
loop('trolleybus_drive', -4, VEHICLE)
loop('metro_rumble_loop', -6, { ...NEAR, refDistance: 3, reverb: 0.4 })
loop('phone_vibrate_loop', -12, UI)
for (const s of ['snow', 'snow_packed', 'ice', 'slush', 'concrete', 'asphalt', 'tile', 'linoleum', 'wood', 'gravel', 'carpet', 'metal', 'metal_grate']) {
  one('step_' + s, -12, { ...NEAR, refDistance: 2, rolloff: 1.4, reverb: 0.8 }, { rate: [0.92, 1.08] })
}

function carPick(passKey, loopKey) {
  return o => {
    if (o.loop) return [loopKey, Math.floor(rnd() * 2), true]
    // opts.speed in km/h → nearest rendered class; playback rate covers the rest
    const kmh = +(o.speed ?? 50)
    const cls = kmh < 47 ? 0 : 1
    o._rate = Math.min(1.3, Math.max(0.75, Math.sqrt(kmh / CAR_SPEEDS[cls])))
    return [passKey, cls * 2 + Math.floor(rnd() * 2)]
  }
}

/** Factory for a sound-table entry. */
function factory(name, e) {
  return (engine, opts = {}) => {
    defaults(opts, e.sp)
    let key = e.key, v = null, isLoop = e.loop
    const p = e.pick ? e.pick(opts) : null
    if (p) { key = p[0]; v = p[1]; if (p[2] !== undefined) isLoop = p[2] }
    if (v === null) v = opts.variant !== undefined && typeof opts.variant === 'number' ? opts.variant % (bank.spec(key)?.variants ?? 1) : pickVariant(key)
    if (e.loop && opts.loop === false && !e.fragment && !e.cycles) isLoop = false
    const rr = isLoop ? e.rateLoop || [1, 1] : e.rate
    let rate = (opts._rate ?? 1) * (opts.rate ?? (rr[0] + (rr[1] - rr[0]) * rnd()))
    const gain = dbg(e.db)
    if (e.prefetch) for (const k of e.prefetch) bank.requestAll(k)
    const o = { loop: isLoop, rate, gain }
    // finite versions of looping sounds
    if (e.cycles && opts.cycles) { o.stopAfter = e.cycles * opts.cycles; o.offset = 0; o.fadeIn = 0.005; o.fadeOut = 0.01 }
    if (e.fragment && (opts.fragment || opts.loop === false)) {
      o.stopAfter = opts.duration ?? 8 + rnd() * 10
      o.fadeIn = 0.6; o.fadeOut = 2.0
      o.offset = rnd() * 15
    }
    if (isLoop && opts.offset !== undefined) o.offset = opts.offset
    return bufferVoice(engine, key, v, o)
  }
}

export const SOUND_NAMES = Object.keys(S)
export const SOUND_TABLE = S

/** Register every sound with the engine. */
export function registerSounds(engine) {
  for (const [name, e] of Object.entries(S)) engine.register(name, factory(name, e))
}

/** Bank keys a sound may use (for preloading). */
export function keysOf(name) {
  const e = S[name]
  if (!e) return []
  const ks = new Set([e.key])
  if (name === 'car_pass') ks.add('car_drive')
  if (name === 'bus_pass') ks.add('bus_drive')
  if (name === 'trolleybus_pass') ks.add('trolleybus_drive')
  if (name === 'metro_rumble') ks.add('metro_rumble_loop')
  if (name === 'phone_vibrate') ks.add('phone_vibrate_loop')
  if (name === 'footsteps_phantom') ks.add('footsteps_phantom_indoor')
  return [...ks]
}
