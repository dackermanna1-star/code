// Phone sounds, all synthesized with Web Audio: keypad tones, SMS beeps, vibration rattle,
// GSM speaker interference, ringback tone, the operator's "subscriber unavailable" message
// (special-information tones + a crude formant voice), monophonic ringtones and a pocket rustle.
// Registered only when the audio package has not already provided a sound with the same name.

const A4 = 440
const NOTE = { c: -9, 'c#': -8, d: -7, 'd#': -6, e: -5, f: -4, 'f#': -3, g: -2, 'g#': -1, a: 0, 'a#': 1, b: 2 }
function noteFreq(n) {
  const m = /^([a-g]#?)(\d)$/.exec(n)
  if (!m) return 0
  return A4 * Math.pow(2, (NOTE[m[1]] + (parseInt(m[2], 10) - 4) * 12) / 12)
}

/**
 * Original monophonic ringtones (not copies of any real phone's tunes).
 * Format: 'bpm|note:dur note:dur ...' — dur 1,2,4,8,16 (+ '.' dotted), note 'p' = pause.
 */
export const RINGTONES = [
  { ru: 'Позывной', en: 'Call sign', tune: '150|g5:8 c6:8 e6:8 g6:4 e6:8 g6:4. p:4 g5:8 c6:8 e6:8 g6:8 a6:8 g6:8 e6:4 c6:4' },
  { ru: 'Метелица', en: 'Snowstorm', tune: '132|a5:8 e6:8 d6:8 c6:8 b5:8 c6:8 a5:4 p:8 a5:8 e6:8 d6:8 c6:8 b5:8 g5:8 a5:4. p:8 c6:8 b5:8 a5:8 g#5:8 a5:2' },
  { ru: 'Трамвайчик', en: 'Little tram', tune: '168|c6:16 c6:16 g5:8 c6:8 e6:8 d6:16 c6:16 d6:8 g5:8 p:8 e6:16 e6:16 d6:8 e6:8 g6:8 f6:16 e6:16 d6:8 c6:4' },
  { ru: 'Будильник', en: 'Alarm clock', tune: '200|a6:16 p:16 a6:16 p:16 a6:16 p:16 a6:16 p:4 a6:16 p:16 a6:16 p:16 a6:16 p:16 a6:16 p:4' },
  { ru: 'Ностальгия', en: 'Nostalgia', tune: '96|e6:4 d6:8 c6:8 d6:4 g5:4 c6:8 b5:8 a5:8 b5:8 c6:2 p:8 e6:8 f6:8 e6:8 d6:4. c6:8 b5:4 a5:4 g5:2' },
  { ru: 'Электричка', en: 'Suburban train', tune: '144|e6:8 e6:8 p:8 e6:8 p:8 c6:8 e6:4 g6:4 p:4 g5:4 p:4 c6:4. g5:8 p:4 e5:4 p:8 a5:4 b5:4 a#5:8 a5:4' },
]

export function parseTune(str) {
  const [bpmS, body] = str.split('|')
  const beat = 60 / parseFloat(bpmS) // quarter note
  const notes = []
  for (const tok of body.trim().split(/\s+/)) {
    const [n, dS] = tok.split(':')
    const dotted = dS.endsWith('.')
    let dur = beat * 4 / parseInt(dS, 10)
    if (dotted) dur *= 1.5
    notes.push({ f: n === 'p' ? 0 : noteFreq(n), dur })
  }
  return notes
}

// ---- helpers ---------------------------------------------------------------------------------

/** Tiny loudspeaker: band-limited and slightly overdriven. */
function speaker(ctx, lo = 700, hi = 5000, drive = 1.6) {
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = lo; hp.Q.value = 0.8
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = hi; lp.Q.value = 0.9
  const ws = ctx.createWaveShaper()
  const n = 256, curve = new Float32Array(n)
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * drive) / Math.tanh(drive) }
  ws.curve = curve
  hp.connect(lp); lp.connect(ws)
  return { input: hp, output: ws }
}
function muffle(ctx, node, on, freq = 650) {
  if (!on) return node
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq; lp.Q.value = 0.5
  node.connect(lp)
  return lp
}
function stopper(...nodes) {
  return when => { for (const n of nodes) { try { n.stop(when) } catch { /* not started */ } } }
}
let pulseWave = null
function pulse(ctx) {
  if (pulseWave && pulseWave.ctx === ctx) return pulseWave.wave
  // 25% duty pulse wave — the thin, nasal timbre of cheap piezo ringers
  const N = 48, re = new Float32Array(N), im = new Float32Array(N)
  for (let k = 1; k < N; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25) * 1.0
  for (let k = 1; k < N; k++) re[k] = (2 / (k * Math.PI)) * (1 - Math.cos(k * Math.PI * 0.25)) * 0.0
  const wave = ctx.createPeriodicWave(re, im)
  pulseWave = { ctx, wave }
  return wave
}

// ---- factories --------------------------------------------------------------------------------

function keyTone(e, o = {}) {
  const ctx = e.ctx, t = ctx.currentTime
  const out = ctx.createGain()
  const n = ctx.createBufferSource(); n.buffer = e.noise('white', 1, 5)
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.22, t + 0.001); ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.014)
  n.connect(hp); hp.connect(ng); ng.connect(out)
  n.start(t, Math.random() * 0.8); n.stop(t + 0.03)
  const nodes = [n]
  if (o.tone !== false) {
    const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = o.freq ?? 1397
    const sp = speaker(ctx, 900, 4500, 1.2)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.003)
    g.gain.setValueAtTime(0.05, t + 0.04); g.gain.linearRampToValueAtTime(0, t + 0.05)
    osc.connect(sp.input); sp.output.connect(g); g.connect(out)
    osc.start(t); osc.stop(t + 0.06)
    nodes.push(osc)
  }
  return { output: out, duration: 0.08, stop: stopper(...nodes) }
}

function beep(e, o = {}) {
  const ctx = e.ctx, t = ctx.currentTime
  const out = ctx.createGain()
  const seq = o.seq ?? [[o.freq ?? 1760, o.dur ?? 0.07]]
  const osc = ctx.createOscillator(); osc.type = 'square'
  const sp = speaker(ctx, 800, 5000, 1.4)
  const g = ctx.createGain(); g.gain.value = 0
  osc.connect(sp.input); sp.output.connect(g)
  muffle(ctx, g, o.muffled).connect(out)
  let tt = t
  for (const [f, d] of seq) {
    if (f > 0) {
      osc.frequency.setValueAtTime(f, tt)
      g.gain.setValueAtTime(0.0, tt); g.gain.linearRampToValueAtTime(0.11, tt + 0.004)
      g.gain.setValueAtTime(0.11, tt + d * 0.82); g.gain.linearRampToValueAtTime(0, tt + d * 0.86)
    }
    tt += d
  }
  osc.start(t); osc.stop(tt + 0.05)
  return { output: out, duration: tt - t + 0.05, stop: stopper(osc) }
}

function smsAlert(e, o = {}) {
  // three short high beeps, a breath apart
  const seq = [[1865, 0.07], [0, 0.05], [1865, 0.07], [0, 0.05], [2349, 0.09]]
  return beep(e, { ...o, seq })
}

function vibrate(e, o = {}) {
  const ctx = e.ctx, t = ctx.currentTime
  const out = ctx.createGain()
  const pulses = o.pulses ?? [[0, 0.42], [0.62, 0.42]]
  const a = ctx.createOscillator(); a.type = 'sawtooth'; a.frequency.value = 163
  const b = ctx.createOscillator(); b.type = 'square'; b.frequency.value = 171
  const ws = ctx.createWaveShaper()
  const curve = new Float32Array(256)
  for (let i = 0; i < 256; i++) { const x = i / 255 * 2 - 1; curve[i] = Math.sign(x) * Math.pow(Math.abs(x), 0.45) }
  ws.curve = curve
  const mixG = ctx.createGain(); mixG.gain.value = 0.5
  a.connect(mixG); b.connect(mixG); mixG.connect(ws)
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6
  ws.connect(bp)
  const n = ctx.createBufferSource(); n.buffer = e.noise('brown', 2, 9); n.loop = true
  const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 300
  const ng = ctx.createGain(); ng.gain.value = 0.6
  n.connect(nf); nf.connect(ng)
  const env = ctx.createGain(); env.gain.value = 0
  bp.connect(env); ng.connect(env)
  muffle(ctx, env, o.muffled !== false, 900).connect(out)
  let end = t
  for (const [s, d] of pulses) {
    env.gain.setValueAtTime(0, t + s)
    env.gain.linearRampToValueAtTime(0.32, t + s + 0.03)
    env.gain.setValueAtTime(0.32, t + s + d - 0.04)
    env.gain.linearRampToValueAtTime(0, t + s + d)
    end = Math.max(end, t + s + d)
  }
  a.start(t); b.start(t); n.start(t)
  a.stop(end + 0.05); b.stop(end + 0.05); n.stop(end + 0.05)
  return { output: out, duration: end - t + 0.05, stop: stopper(a, b, n) }
}

/** GSM "дрр-дрр-тр-тр": 217 Hz TDMA bursts leaking into speakers right before a call or SMS. */
function gsmBuzz(e, o = {}) {
  const ctx = e.ctx, t = ctx.currentTime
  const out = ctx.createGain()
  const dur = o.duration ?? 1.6
  const buf = e.makeBuffer(dur, (i, tt) => {
    const burst = (Math.floor(tt * 8) % 4 < 2 || (tt > dur * 0.55 && Math.floor(tt * 16) % 2 === 0)) ? 1 : 0
    const phase = (tt * 217) % 1
    const pulseOn = phase < 0.125 ? 1 : 0
    return burst * (pulseOn ? 0.6 : -0.08) * (Math.min(1, tt * 6) * Math.min(1, (dur - tt) * 6))
  })
  const src = ctx.createBufferSource(); src.buffer = buf
  const sp = speaker(ctx, 180, 3200, 2.2)
  src.connect(sp.input)
  const g = ctx.createGain(); g.gain.value = 0.35
  sp.output.connect(g); g.connect(out)
  src.start(t)
  return { output: out, duration: dur, stop: stopper(src) }
}

/** Earpiece band 300–3400 Hz (the phone held to the ear). */
function earpiece(ctx) { return speaker(ctx, 300, 3400, 1.3) }

/** Outgoing call: a little GSM chatter, then two long Russian ringback tones (425 Hz). */
function ringOut(e, o = {}) {
  const ctx = e.ctx, t = ctx.currentTime
  const out = ctx.createGain()
  const ep = earpiece(ctx)
  ep.output.connect(out)
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 425
  const g = ctx.createGain(); g.gain.value = 0
  osc.connect(g); g.connect(ep.input)
  const rings = o.rings ?? [[1.5, 0.8], [4.7, 0.8]]
  let end = t
  for (const [s, d] of rings) {
    g.gain.setValueAtTime(0, t + s); g.gain.linearRampToValueAtTime(0.16, t + s + 0.02)
    g.gain.setValueAtTime(0.16, t + s + d - 0.02); g.gain.linearRampToValueAtTime(0, t + s + d)
    end = Math.max(end, t + s + d)
  }
  // line hiss and a couple of digital clicks while connecting
  const n = ctx.createBufferSource(); n.buffer = e.noise('pink', 4, 13); n.loop = true
  const ng = ctx.createGain(); ng.gain.value = 0.012
  n.connect(ng); ng.connect(ep.input)
  const total = (o.total ?? 6.1)
  osc.start(t); n.start(t)
  osc.stop(t + total); n.stop(t + total)
  return { output: out, duration: total, stop: stopper(osc, n) }
}

// ---- a crude formant voice for the operator's recorded message ------------------------------

const VOW = {
  а: [760, 1300, 2600], о: [520, 900, 2500], у: [360, 760, 2400], э: [520, 1800, 2600], е: [460, 2000, 2700],
  и: [300, 2300, 3000], ы: [360, 1550, 2500], я: [700, 1600, 2600], ё: [500, 1100, 2500], ю: [340, 1300, 2400],
}
const SON = { м: [260, 1100, 2300], н: [260, 1500, 2500], л: [360, 1100, 2500], р: [450, 1300, 2400], й: [300, 2200, 2900], в: [320, 1200, 2300] }
const FRIC = { с: 6200, ш: 2900, щ: 3400, ф: 4200, х: 1600, з: 5800, ж: 2800, ц: 6000, ч: 3600 }
const STOP = { п: 1200, т: 4000, к: 2200, б: 900, д: 3200, г: 1800 }
const VOICED_FRIC = new Set(['з', 'ж'])

/**
 * Schedule a phrase on a formant synth. Stressed vowels are marked with '+' after them.
 * Returns the end time.
 */
function speak(ctx, e, dest, text, t0, f0 = 225) {
  const src = ctx.createOscillator(); src.type = 'sawtooth'
  const voiced = ctx.createGain(); voiced.gain.value = 0
  src.connect(voiced)
  const formants = [0, 1, 2].map(i => {
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = [7, 11, 13][i]
    const g = ctx.createGain(); g.gain.value = [1.0, 0.55, 0.25][i]
    voiced.connect(f); f.connect(g); g.connect(dest)
    return f
  })
  const nz = ctx.createBufferSource(); nz.buffer = e.noise('white', 2, 21); nz.loop = true
  const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.Q.value = 1.6
  const ng = ctx.createGain(); ng.gain.value = 0
  nz.connect(nf); nf.connect(ng); ng.connect(dest)
  const chars = [...text.toLowerCase()]
  const nVow = chars.filter(c => VOW[c]).length || 1
  let t = t0, vi = 0
  const setF = (fs, at, tc = 0.018) => formants.forEach((f, i) => f.frequency.setTargetAtTime(fs[i], at, tc))
  src.frequency.setValueAtTime(f0, t0)
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    const stressed = chars[i + 1] === '+'
    if (c === '+') continue
    if (c === ' ') { voiced.gain.setTargetAtTime(0.0, t, 0.01); t += 0.03; continue }
    if (c === ',' || c === '.') { voiced.gain.setTargetAtTime(0, t, 0.02); ng.gain.setTargetAtTime(0, t, 0.01); t += 0.22; continue }
    if (VOW[c]) {
      const prog = vi++ / nVow
      const pitch = f0 * (1.05 - 0.22 * prog) * (stressed ? 1.16 : 1) * (prog > 0.9 ? 0.92 : 1)
      const d = stressed ? 0.15 : 0.075
      if ('яёюе'.includes(c) && (i === 0 || VOW[chars[i - 1]] || chars[i - 1] === ' ' || 'ьъ'.includes(chars[i - 1]))) {
        setF(SON.й, t, 0.01); voiced.gain.setTargetAtTime(0.5, t, 0.01); t += 0.035
      }
      src.frequency.setTargetAtTime(pitch, t, 0.04)
      setF(VOW[c], t)
      voiced.gain.setTargetAtTime(stressed ? 1.0 : 0.75, t, 0.015)
      ng.gain.setTargetAtTime(0, t, 0.01)
      t += d
    } else if (SON[c]) {
      setF(SON[c], t, 0.012)
      voiced.gain.setTargetAtTime(c === 'м' || c === 'н' ? 0.35 : 0.5, t, 0.012)
      if (c === 'р') { voiced.gain.setTargetAtTime(0.2, t + 0.02, 0.005); voiced.gain.setTargetAtTime(0.5, t + 0.035, 0.005) }
      t += 0.055
    } else if (FRIC[c]) {
      nf.frequency.setValueAtTime(FRIC[c], t)
      ng.gain.setTargetAtTime(c === 'ф' || c === 'х' ? 0.18 : 0.3, t, 0.01)
      voiced.gain.setTargetAtTime(VOICED_FRIC.has(c) ? 0.3 : 0, t, 0.01)
      t += c === 'ц' || c === 'ч' ? 0.07 : 0.08
      ng.gain.setTargetAtTime(0, t, 0.012)
    } else if (STOP[c]) {
      voiced.gain.setTargetAtTime('бдг'.includes(c) ? 0.12 : 0, t, 0.006)
      t += 0.045
      nf.frequency.setValueAtTime(STOP[c], t)
      ng.gain.setValueAtTime(0.35, t)
      ng.gain.setTargetAtTime(0, t + 0.004, 0.008)
      t += 0.02
    } else {
      t += 0.01 // ь, ъ, unknown
    }
  }
  voiced.gain.setTargetAtTime(0, t, 0.03)
  ng.gain.setTargetAtTime(0, t, 0.01)
  src.start(t0); nz.start(t0)
  src.stop(t + 0.3); nz.stop(t + 0.3)
  return { end: t + 0.3, nodes: [src, nz] }
}

export const UNAVAILABLE_RU = 'Абонент недоступен или находится вне зоны действия сети'
export const UNAVAILABLE_EN = 'The subscriber is unavailable or out of network coverage'

/** Special-information tones (950 / 1400 / 1800 Hz), then the recorded voice. ~6 s. */
function unavailable(e, o = {}) {
  const ctx = e.ctx, t = ctx.currentTime
  const out = ctx.createGain()
  const ep = earpiece(ctx)
  ep.output.connect(out)
  const osc = ctx.createOscillator(); osc.type = 'sine'
  const g = ctx.createGain(); g.gain.value = 0
  osc.connect(g); g.connect(ep.input)
  let tt = t + 0.25
  for (const f of [950, 1400, 1800]) {
    osc.frequency.setValueAtTime(f, tt)
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.12, tt + 0.01)
    g.gain.setValueAtTime(0.12, tt + 0.31); g.gain.linearRampToValueAtTime(0, tt + 0.33)
    tt += 0.36
  }
  osc.start(t); osc.stop(tt + 0.05)
  const voice = ctx.createGain(); voice.gain.value = 0.32
  voice.connect(ep.input)
  const s = speak(ctx, e, voice, 'Або+нент недосту+пен, и+ли нахо+дится вне зо+ны де+йствия се+ти.', tt + 0.35, o.f0 ?? 228)
  return { output: out, duration: s.end - t + 0.2, stop: stopper(osc, ...s.nodes) }
}

function ringtone(e, o = {}) {
  const ctx = e.ctx, t = ctx.currentTime
  const out = ctx.createGain()
  const def = typeof o.tune === 'string' ? o.tune : (RINGTONES[o.tune ?? 0] ?? RINGTONES[0]).tune
  const notes = parseTune(def)
  const osc = ctx.createOscillator()
  osc.setPeriodicWave(pulse(ctx))
  const sp = speaker(ctx, 700, 5000, 1.8)
  const g = ctx.createGain(); g.gain.value = 0
  osc.connect(sp.input); sp.output.connect(g)
  muffle(ctx, g, o.muffled, 1200).connect(out)
  const reps = o.repeat ?? 1
  let tt = t + 0.02
  for (let r = 0; r < reps; r++) {
    for (const n of notes) {
      if (n.f > 0) {
        osc.frequency.setValueAtTime(n.f, tt)
        g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.1, tt + 0.004)
        g.gain.setValueAtTime(0.1, tt + n.dur * 0.78); g.gain.linearRampToValueAtTime(0, tt + n.dur * 0.82)
      }
      tt += n.dur
    }
    tt += 0.5
  }
  osc.start(t); osc.stop(tt)
  return { output: out, duration: tt - t, stop: stopper(osc) }
}

function pocket(e, o = {}) {
  const ctx = e.ctx, t = ctx.currentTime
  const out = ctx.createGain()
  const n = ctx.createBufferSource(); n.buffer = e.noise('pink', 2, 31)
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.7
  const g = ctx.createGain(); g.gain.value = 0
  n.connect(bp); bp.connect(g); g.connect(out)
  const swishes = o.out ? [[0, 0.09, 0.5], [0.1, 0.14, 0.8], [0.27, 0.06, 0.3]] : [[0, 0.12, 0.7], [0.15, 0.1, 0.5]]
  let end = t
  for (const [s, d, a] of swishes) {
    g.gain.setValueAtTime(0, t + s); g.gain.linearRampToValueAtTime(0.5 * a, t + s + d * 0.4); g.gain.linearRampToValueAtTime(0, t + s + d)
    bp.frequency.setValueAtTime(1800 + a * 1600, t + s)
    end = Math.max(end, t + s + d)
  }
  n.start(t, Math.random()); n.stop(end + 0.05)
  return { output: out, duration: end - t + 0.05, stop: stopper(n) }
}

export const PHONE_SOUNDS = {
  phone_key: keyTone,
  phone_beep: beep,
  phone_sms: smsAlert,
  phone_vibrate: vibrate,
  phone_gsm: gsmBuzz,
  phone_ring_out: ringOut,
  phone_unavailable: unavailable,
  phone_ringtone: ringtone,
  phone_pocket: pocket,
}

/** Register every phone sound the audio package has not defined itself. */
export function registerPhoneSounds(audio) {
  if (!audio?.register) return
  for (const [name, f] of Object.entries(PHONE_SOUNDS)) if (!audio.has?.(name)) audio.register(name, f)
}
