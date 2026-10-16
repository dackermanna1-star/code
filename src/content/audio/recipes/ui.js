// UI and telephone recipes: clicks, paper, the period mobile phone, Russian line tones
// (425 Hz), SIT + operator phrase, GSM interference, monophonic ringtones.

import { def } from '../registry.js'
import { speak } from '../speech.js'
import { tones, phoneBand, filt, addBurst, addModes, buf, thump, Biquad, Osc, TAU, softClip } from './lib.js'

def('click', {
  sr: 32000, variants: 4, prio: 0, norm: { peak: 0.8 },
  gen(r, sr) {
    const d = buf(0.09, sr)
    const a = Math.floor(0.002 * sr), b = a + Math.floor(r.range(0.018, 0.03) * sr)
    addBurst(d, sr, a, 0.004, r, { f: r.range(3000, 4200), q: 1.5, gain: 1, tau: 0.0008 })
    addModes(d, sr, a, [[r.range(1800, 2400), 0.25, 0.006], [r.range(5200, 6200), 0.12, 0.004]], 1, r)
    addBurst(d, sr, b, 0.003, r, { f: r.range(2400, 3400), q: 1.5, gain: 0.45, tau: 0.0007 })
    thump(d, sr, a, { f: 300, dur: 0.004, gain: 0.25 })
    return d
  },
})

def('paper', {
  sr: 32000, variants: 3, prio: 1, norm: { peak: 0.75 },
  gen(r, sr) {
    const len = r.range(0.5, 0.75)
    const d = buf(len, sr)
    // 2–3 handling gestures, each a swell of rustle with crackle grains
    const g = r.int(2, 3)
    for (let k = 0; k < g; k++) {
      const t0 = (k / g) * len * 0.8 + r.range(0, 0.05)
      const gl = r.range(0.12, 0.25)
      const bp = new Biquad(sr, 'bp', r.range(2500, 4000), 0.6)
      const n = Math.floor(gl * sr), off = Math.floor(t0 * sr)
      for (let i = 0; i < n && off + i < d.length; i++) {
        const u = i / n
        d[off + i] += bp.process(r.bi()) * Math.sin(Math.PI * u) ** 2 * 0.35 * (0.6 + 0.4 * Math.sin(TAU * 31 * u))
      }
      const nc = r.int(15, 35)
      for (let c = 0; c < nc; c++) addBurst(d, sr, off + Math.floor(r() * n), r.range(0.0005, 0.002), r, { f: r.range(2000, 8000), q: 1, gain: r.range(0.1, 0.6) * r(), tau: 0.0005 })
    }
    return filt(d, sr, [['hp', 600, 0.7]])
  },
})

/** Small phone speaker: tiny driver, no bass, peaky. */
function phoneSpeaker(d, sr) {
  return filt(d, sr, [['hp', 700, 0.8], ['hp', 600, 0.7], ['peak', 2400, 1.5, 6], ['lp', 6000, 0.7]])
}

def('phone_key', {
  sr: 32000, variants: 3, prio: 0, norm: { peak: 0.6 },
  gen(r, sr) {
    const d = buf(0.08, sr)
    addBurst(d, sr, 0, 0.002, r, { f: 3500, q: 1, gain: 0.5, tau: 0.0006 }) // key dome click
    tones(d, sr, [{ t: 0.004, dur: 0.045, f: 1870 * r.range(0.998, 1.002), gain: 0.5 }], { attack: 0.002, release: 0.006 })
    return phoneSpeaker(d, sr)
  },
})

def('phone_sms', {
  sr: 32000, prio: 1, norm: { peak: 0.7 },
  gen(r, sr) {
    // Morse "SMS"  · · ·   — —   · · ·
    const dot = 0.075, dash = dot * 3, gap = dot, lgap = dot * 3
    const notes = []
    let t = 0.02
    const sym = s => { notes.push({ t, dur: s, f: 1720, gain: 0.55 }); t += s + gap }
    for (const s of [dot, dot, dot]) sym(s)
    t += lgap - gap
    for (const s of [dash, dash]) sym(s)
    t += lgap - gap
    for (const s of [dot, dot, dot]) sym(s)
    const d = buf(t + 0.1, sr)
    tones(d, sr, notes, { attack: 0.003, release: 0.006, pw: 0.5 })
    return phoneSpeaker(d, sr)
  },
})

function vibrateBurst(d, sr, r, off, len) {
  const n = Math.floor(len * sr)
  const rp = new Biquad(sr, 'bp', 320, 3), rp2 = new Biquad(sr, 'bp', 1100, 4), lp = new Biquad(sr, 'lp', 2500, 0.7)
  let ph = 0
  const f = r.range(150, 175)
  for (let i = 0; i < n && off + i < d.length; i++) {
    const t = i / sr, u = i / n
    ph += (f * (1 + 0.03 * Math.sin(TAU * 3 * t))) / sr
    const motor = Math.sin(TAU * ph) + 0.5 * Math.sin(TAU * ph * 2)
    const rattle = (ph % 1) < 0.18 ? r.bi() : 0
    const e = Math.min(1, t / 0.04, (len - t) / 0.05) * (0.85 + 0.15 * Math.sin(TAU * 9 * t))
    const x = motor * 0.3 + rattle * 0.9
    d[off + i] += lp.process(rp.process(x) * 1.2 + rp2.process(x) * 0.6 + x * 0.15) * e
    void u
  }
}
def('phone_vibrate', {
  sr: 22050, prio: 1, norm: { peak: 0.6 },
  gen(r, sr) {
    const d = buf(1.65, sr)
    vibrateBurst(d, sr, r, Math.floor(0.01 * sr), 0.78)
    return d
  },
})
def('phone_vibrate_loop', {
  sr: 22050, prio: 6, norm: { peak: 0.6 }, loop: 0.01,
  gen(r, sr) {
    const d = buf(1.6 + 0.01, sr)
    vibrateBurst(d, sr, r, Math.floor(0.02 * sr), 0.8)
    return d
  },
})

/** Line tone helper: 425 Hz sine with faint line hum/hiss, through the earpiece band. */
function lineTone(r, sr, len, on) {
  const d = buf(len, sr)
  let ph = 0
  const hum = new Biquad(sr, 'lp', 900, 0.7)
  for (let i = 0; i < d.length; i++) {
    const t = i / sr
    ph += (TAU * 425) / sr
    const g = on(t)
    d[i] = Math.sin(ph) * g * 0.6 + hum.process(r.bi()) * 0.012 + Math.sin(TAU * 50 * t) * 0.004
  }
  return phoneBand(d, sr, r, 0.002)
}
const ramp = (t, a, b, edge = 0.008) => (t < a || t > b ? 0 : Math.min(1, (t - a) / edge, (b - t) / edge))

def('phone_ring_out', {
  sr: 16000, prio: 2, norm: { peak: 0.6 }, loop: 0.02, dc: 0,
  gen(r, sr) { return lineTone(r, sr, 5.02, t => ramp(t, 0.05, 1.05)) },
})
def('phone_busy', {
  sr: 16000, prio: 3, norm: { peak: 0.6 }, loop: 0.004, dc: 0,
  gen(r, sr) { return lineTone(r, sr, 0.804, t => ramp(t, 0.0, 0.4, 0.006)) },
})
def('payphone_dial', {
  sr: 16000, prio: 3, norm: { peak: 0.55 }, loop: 0.02, dc: 0,
  gen(r, sr) { return lineTone(r, sr, 2.02, () => 1) },
})

def('phone_unavailable', {
  sr: 16000, prio: 3, maxDur: 7.5, norm: { peak: 0.7 },
  gen(r, sr) {
    // SIT: 950 / 1400 / 1800 Hz, 330 ms each — then the operator's recorded voice
    const voice = speak('Аппара+т абоне+нта вы+ключен, и+ли нахо+дится вне зо+ны де+йствия се+ти.', sr, 'female', r, { rate: 5.6, range: 0.8, pitchJitter: 0.3 })
    const sitLen = 0.03 + 3 * 0.36
    const d = buf(sitLen + 0.35 + voice.length / sr + 0.4, sr)
    tones(d, sr, [950, 1400, 1800].map((f, i) => ({ t: 0.03 + i * 0.36, dur: 0.33, f, gain: 0.32, wave: 'sine' })), { attack: 0.005, release: 0.005 })
    const off = Math.floor((sitLen + 0.35) * sr)
    let vp = 0
    for (let i = 0; i < voice.length; i++) vp = Math.max(vp, Math.abs(voice[i]))
    for (let i = 0; i < voice.length && off + i < d.length; i++) d[off + i] += (voice[i] / (vp || 1)) * 0.55
    return phoneBand(d, sr, r, 0.003)
  },
})

def('dial_pulse', {
  // v = number of pulses − 1 (digit 1 → 1 pulse … 0 → 10 pulses), 10 pps, heard in the earpiece
  sr: 16000, variants: 10, prio: 4, norm: { peak: 0.6 },
  gen(r, sr, v) {
    const pulses = v + 1
    const d = buf(0.08 + pulses * 0.1 + 0.15, sr)
    for (let k = 0; k < pulses; k++) {
      const b = Math.floor((0.05 + k * 0.1) * sr), m = b + Math.floor(0.06 * sr)
      addBurst(d, sr, b, 0.006, r, { type: 'hp', f: 300, gain: 0.8, tau: 0.0015 })
      addModes(d, sr, b, [[r.range(900, 1100), 0.12, 0.01]], 1, r)
      addBurst(d, sr, m, 0.004, r, { type: 'hp', f: 400, gain: 0.45, tau: 0.001 })
    }
    return phoneBand(d, sr, r, 0.002)
  },
})

// GSM interference (217 Hz TDMA bursts) leaking into a nearby speaker: «дрр-дрр-тр-тр»
def('gsm_interference', {
  sr: 16000, variants: 3, prio: 7, lazy: true, norm: { peak: 0.6 }, maxDur: 2.7,
  gen(r, sr) {
    const len = r.range(1.3, 2.6)
    const d = buf(len, sr)
    const pw = 0.000577 * sr
    const period = sr / 217
    // gating pattern: bursts at ~8 Hz with irregular pauses
    const gates = []
    let t = 0.02
    while (t < len - 0.1) {
      const run = r.int(2, 5)
      for (let k = 0; k < run && t < len - 0.1; k++) { gates.push([t, t + r.range(0.06, 0.1)]); t += 0.125 }
      t += r.range(0.1, 0.35)
    }
    let gi = 0
    for (let i = 0; i < d.length; i++) {
      const tt = i / sr
      while (gi < gates.length && tt > gates[gi][1]) gi++
      const on = gi < gates.length && tt >= gates[gi][0]
      if (on && (i % period) < pw) d[i] = 1
    }
    filt(d, sr, [['hp', 150, 0.7], ['peak', 1200, 1, 4], ['lp', 5000, 0.7]])
    return softClip(d, 1.5)
  },
})

// Original monophonic ringtones (not real melodies), square 25 % pulse through a phone speaker.
const N = n => 440 * Math.pow(2, (n - 69) / 12)
export const RINGTONES = [
  { name: 'Утро', bpm: 150, notes: [[84, 1], [88, 1], [91, 1], [96, 2], [95, 1], [91, 1], [88, 1], [91, 2], [89, 1], [86, 1], [81, 1], [86, 1], [88, 3], [0, 1]] },
  { name: 'Вальсок', bpm: 170, notes: [[81, 1], [84, 1], [88, 1], [93, 2], [88, 1], [79, 1], [83, 1], [86, 1], [91, 2], [86, 1], [77, 1], [81, 1], [84, 1], [89, 2], [84, 1], [76, 1], [80, 1], [83, 1], [88, 3], [0, 3]] },
  { name: 'Дискотека', bpm: 132, notes: [[86, 0.5], [86, 0.5], [89, 0.5], [86, 0.5], [91, 0.5], [86, 0.5], [84, 0.5], [86, 0.5], [86, 0.5], [93, 0.5], [86, 0.5], [94, 0.5], [93, 0.5], [89, 0.5], [86, 0.5], [93, 0.5], [98, 0.5], [86, 0.5], [84, 0.5], [84, 0.5], [81, 0.5], [88, 0.5], [86, 1.5], [0, 2]] },
  { name: 'Звонок', bpm: 240, notes: [[93, 1], [89, 1], [93, 1], [89, 1], [93, 1], [89, 1], [93, 1], [89, 1], [0, 4], [93, 1], [89, 1], [93, 1], [89, 1], [93, 1], [89, 1], [93, 1], [89, 1], [0, 8]] },
]
def('phone_ringtone', {
  sr: 16000, variants: RINGTONES.length, prio: 8, lazy: true, norm: { peak: 0.6 }, loop: 0.002, dc: 0,
  gen(r, sr, v) {
    const m = RINGTONES[v]
    const beat = 60 / m.bpm / 2
    const notes = []
    let t = 0
    for (const [n, b] of m.notes) { if (n) notes.push({ t, dur: b * beat * 0.82, f: N(n), gain: 0.5 }); t += b * beat }
    const d = buf(t + 0.002, sr)
    tones(d, sr, notes, { attack: 0.002, release: 0.008, pw: 0.25 })
    return phoneSpeaker(d, sr)
  },
})
void Osc
