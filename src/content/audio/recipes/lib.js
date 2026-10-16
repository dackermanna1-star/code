// Shared recipe building blocks: impact layers, tone sequences, transmission chains
// (through a wall, a phone earpiece, a PA horn, a cheap radio speaker), distance treatment.

import { Biquad, SVF, Osc, OnePole, TAU, addBurst, addModes, echoes, softClip, filt, smooth, buf, Brown, Pink } from '../dsp.js'

export * from '../dsp.js'

/** Low thump (sine with a quick pitch drop) — heel strikes, door booms. */
export function thump(d, sr, off, { f = 90, dur = 0.05, gain = 1, drop = 1.6, attack = 0.004 } = {}) {
  const n = Math.min(d.length - off, Math.floor(dur * 6 * sr))
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const fr = f * (1 + (drop - 1) * Math.exp(-t / (dur * 0.35)))
    ph += (TAU * fr) / sr
    const e = (t < attack ? t / attack : 1) * Math.exp(-Math.max(0, t - attack) / dur)
    d[off + i] += Math.sin(ph) * e * gain
  }
  return d
}

/** Sparse crackle grains (grit, sand, salt) between t0 and t0+dur. */
export function grit(d, sr, off, r, { dur = 0.04, count = 12, f = 4500, q = 1.2, gain = 0.4, glen = 0.0012 } = {}) {
  for (let k = 0; k < count; k++) {
    const at = off + Math.floor(r() * dur * sr)
    addBurst(d, sr, at, glen * r.range(0.6, 1.6), r, { f: f * r.range(0.7, 1.4), q, gain: gain * Math.pow(r(), 1.6), tau: glen * 0.3 })
  }
  return d
}

/** Crunch: many short bandpassed noise grains with a bell-shaped density over dur. */
export function crunch(d, sr, off, r, { dur = 0.25, count = 40, fLo = 1200, fHi = 2600, q = 2, gain = 1, gl = [0.001, 0.003], skew = 0.4 } = {}) {
  for (let k = 0; k < count; k++) {
    // bell-ish distribution skewed early (snow compresses fast, then settles)
    let u = (r() + r() + r()) / 3
    u = Math.pow(u, 1 + skew)
    const at = off + Math.floor(u * dur * sr)
    const a = gain * (0.15 + 0.85 * Math.pow(r(), 2.2))
    const len = r.range(gl[0], gl[1])
    addBurst(d, sr, at, len, r, { f: r.range(fLo, fHi), q: q * r.range(0.7, 1.4), gain: a, tau: len * 0.35 })
  }
  return d
}

/** Stick-slip squeak (cold snow «скрип», hinges, rubber): pulse train through a resonance. */
export function squeak(d, sr, off, r, { dur = 0.045, rate = 300, rateEnd = null, f = 2200, q = 12, gain = 0.5, noise = 0.3 } = {}) {
  const n = Math.min(d.length - off, Math.floor(dur * sr))
  const bp = new Biquad(sr, 'bp', f, q)
  const bp2 = new Biquad(sr, 'bp', f * r.range(1.45, 1.6), q * 0.8)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr, u = t / dur
    const rt = rateEnd ? rate + (rateEnd - rate) * u : rate * (1 + 0.15 * Math.sin(TAU * 7 * t))
    ph += rt / sr
    let x = 0
    if (ph >= 1) { ph -= 1; x = 1 + r.bi() * 0.4 }
    x += r.bi() * noise * 0.1
    const e = Math.sin(Math.PI * Math.min(1, u)) ** 1.5
    d[off + i] += (bp.process(x) + bp2.process(x) * 0.35) * e * gain * 3
  }
  return d
}

/** Short tonal chirp (squelch, drops, gurgles). */
export function chirp(d, sr, off, { f0 = 900, f1 = 300, dur = 0.02, gain = 0.5, shape = 'sine' } = {}) {
  const n = Math.min(d.length - off, Math.floor(dur * sr))
  let ph = 0
  for (let i = 0; i < n; i++) {
    const u = i / n
    const f = f0 * Math.pow(f1 / f0, u)
    ph += (TAU * f) / sr
    const e = Math.sin(Math.PI * u)
    d[off + i] += (shape === 'sine' ? Math.sin(ph) : Math.sin(ph) + 0.3 * Math.sin(2 * ph)) * e * gain
  }
  return d
}

/** Render a tone sequence: notes [{t, dur, f, f1?, gain?, wave}] into d. Square/saw/sine/tri. */
export function tones(d, sr, notes, { attack = 0.004, release = 0.01, wave = 'square', pw = 0.5 } = {}) {
  for (const nt of notes) {
    const o = new Osc(sr)
    const i0 = Math.floor(nt.t * sr), n = Math.floor(nt.dur * sr)
    const a = Math.max(1, (nt.attack ?? attack) * sr), rl = Math.max(1, (nt.release ?? release) * sr)
    const w = nt.wave ?? wave
    for (let i = 0; i < n && i0 + i < d.length; i++) {
      const f = nt.f1 ? nt.f * Math.pow(nt.f1 / nt.f, i / n) : nt.f
      let v = w === 'square' ? o.square(f, nt.pw ?? pw) : w === 'saw' ? o.saw(f) : w === 'tri' ? o.tri(f) : o.sine(f)
      const e = Math.min(1, i / a, (n - i) / rl)
      d[i0 + i] += v * e * (nt.gain ?? 1)
    }
  }
  return d
}

/** Through a reinforced-concrete panel wall: two cascaded lowpasses ~300 Hz + slight body. */
export function wall(d, sr, f = 320) {
  return filt(d, sr, [['lp', f, 0.7], ['lp', f * 1.15, 0.6], ['peak', 140, 1.2, 3], ['hp', 60, 0.7]])
}
/** Phone earpiece / GSM codec band (300–3400 Hz), slight grit. */
export function phoneBand(d, sr, r, grit = 0.004) {
  filt(d, sr, [['hp', 320, 0.7], ['hp', 300, 0.7], ['lp', 3300, 0.7], ['lp', 3400, 0.7], ['peak', 1500, 1, 3]])
  if (grit) for (let i = 0; i < d.length; i++) d[i] += r.bi() * grit
  return d
}
/** Station / platform PA horn: bandpass 300–3500, saturation, horn honk resonance. */
export function paHorn(d, sr, drive = 2.2) {
  filt(d, sr, [['hp', 330, 0.8], ['hp', 300, 0.6], ['lp', 3600, 0.8], ['peak', 1100, 1.4, 5], ['peak', 2400, 2, 3]])
  let p = 0
  for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i]))
  if (p > 0) for (let i = 0; i < d.length; i++) d[i] /= p
  softClip(d, drive)
  return filt(d, sr, [['lp', 4200, 0.7]])
}
/** Cheap transistor-radio / kiosk speaker. */
export function cheapSpeaker(d, sr, r, drive = 1.8) {
  filt(d, sr, [['hp', 380, 0.8], ['hp', 300, 0.6], ['lp', 3800, 0.9], ['peak', 1300, 1.2, 6], ['peak', 700, 2, 2]])
  let p = 0
  for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i]))
  if (p > 0) for (let i = 0; i < d.length; i++) d[i] /= p
  softClip(d, drive)
  const hiss = new Biquad(sr, 'hp', 2000, 0.7)
  for (let i = 0; i < d.length; i++) d[i] += hiss.process(r.bi()) * 0.01
  return d
}
/** Distance: lowpass by metres (fc ≈ 16000/(1+d/40)) plus courtyard flutter echoes. */
export function distant(d, sr, metres, { echo = true, taps = null } = {}) {
  const fc = Math.max(500, 16000 / (1 + metres / 40))
  filt(d, sr, [['lp', fc, 0.6], ['lp', fc * 1.4, 0.6]])
  if (echo) echoes(d, sr, taps || [[0.26, 0.32], [0.53, 0.18], [0.79, 0.09]], Math.min(2500, fc))
  return d
}

/** Brown/pink noise filler (mono). */
export function noiseFill(d, r, color = 'brown', gain = 1) {
  const g = color === 'brown' ? new Brown() : new Pink()
  for (let i = 0; i < d.length; i++) d[i] += g.next(r.bi()) * gain
  return d
}

