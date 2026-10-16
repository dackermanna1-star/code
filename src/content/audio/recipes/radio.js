// A distant radio: two original late-2000s Russian pop fragments (a dance-pop number and a
// «шансон»-style ballad) built from drum machine, bass, pads, plucked guitar and a formant
// "singer", then squeezed through a cheap kiosk speaker. Seamless 8-bar loops.

import { def } from '../registry.js'
import { buf, Biquad, Reso, Osc, TAU, cheapSpeaker, thump, filt, smooth } from './lib.js'
import { diffuse } from '../dsp.js'

const mf = m => 440 * Math.pow(2, (m - 69) / 12)

/** Sung syllables: notes [{t, dur, m (midi), v (vowel)}], formant singer with vibrato. */
function sing(d, sr, r, notes, { fs = 1.17, gain = 1, breath = 0.06 } = {}) {
  const VF = { 'а': [800, 1250, 2700], 'о': [550, 900, 2600], 'е': [520, 1850, 2650], 'и': [320, 2300, 3000], 'у': [350, 750, 2500], 'ы': [400, 1500, 2500] }
  const o = new Osc(sr, r())
  const f1 = new Reso(sr, 600, 90), f2 = new Reso(sr, 1200, 120), f3 = new Reso(sr, 2700, 180)
  const tilt = new Biquad(sr, 'lp', 2500, 0.5)
  let F = [600, 1200, 2700], pitch = mf(notes[0]?.m ?? 69)
  const fric = new Biquad(sr, 'bp', 4000, 1.5)
  for (const nt of notes) {
    const i0 = Math.floor(nt.t * sr), n = Math.floor(nt.dur * sr)
    const target = VF[nt.v] || VF['а']
    const tp = mf(nt.m)
    const cons = nt.c ?? r.pick(['l', 'n', 'm', 't', 's', 'd', 'v', ''])
    for (let i = 0; i < n && i0 + i < d.length; i++) {
      const t = i / sr
      pitch += (tp - pitch) * 0.004 // portamento
      const vib = t > 0.15 ? 1 + 0.014 * Math.sin(TAU * 5.4 * t) * smooth((t - 0.15) / 0.2) : 1
      for (let k = 0; k < 3; k++) F[k] += (target[k] * fs - F[k]) * 0.003
      if ((i & 3) === 0) { f1.set(F[0], 90); f2.set(F[1], 120); f3.set(F[2], 180) }
      const consPhase = t < 0.05
      const av = consPhase && (cons === 't' || cons === 's' || cons === 'd') ? 0.1 : consPhase && (cons === 'm' || cons === 'n' || cons === 'l') ? 0.45 : 1
      const env = Math.min(1, t / 0.03) * Math.min(1, (nt.dur - t) / 0.06)
      const nz = r.bi()
      const src = tilt.process(o.saw(pitch * vib)) + nz * breath
      let y = f3.process(f2.process(f1.process(src))) * av
      if (consPhase && cons === 's') y += fric.process(nz) * 0.6 * (1 - t / 0.05)
      d[i0 + i] += y * env * gain
    }
  }
}

function kick(d, sr, at, g = 1) {
  const n = Math.floor(0.3 * sr)
  let ph = 0
  for (let i = 0; i < n && at + i < d.length; i++) {
    const t = i / sr
    const f = 50 + 110 * Math.exp(-t / 0.03)
    ph += (TAU * f) / sr
    d[at + i] += Math.sin(ph) * Math.exp(-t / 0.12) * g
  }
}
function snare(d, sr, r, at, g = 1, f = 1800) {
  const bp = new Biquad(sr, 'bp', f, 0.8)
  const n = Math.floor(0.2 * sr)
  for (let i = 0; i < n && at + i < d.length; i++) {
    const t = i / sr
    d[at + i] += (bp.process(r.bi()) * Math.exp(-t / 0.06) + Math.sin(TAU * 190 * t) * Math.exp(-t / 0.04) * 0.5) * g
  }
}
function hat(d, sr, r, at, g = 1, len = 0.04) {
  const hp = new Biquad(sr, 'hp', 5500, 0.7)
  const n = Math.floor(len * 2 * sr)
  for (let i = 0; i < n && at + i < d.length; i++) d[at + i] += hp.process(r.bi()) * Math.exp(-i / sr / len) * g
}
function synthNote(d, sr, r, t, dur, m, { gain = 0.2, detune = 0.006, voices = 3, cutoff = 2200, attack = 0.01, release = 0.1, wave = 'saw' } = {}) {
  const os = Array.from({ length: voices }, () => new Osc(sr, r()))
  const lp = new Biquad(sr, 'lp', cutoff, 0.8)
  const i0 = Math.floor(t * sr), n = Math.floor((dur + release) * sr)
  const f = mf(m)
  for (let i = 0; i < n && i0 + i < d.length; i++) {
    const tt = i / sr
    const e = Math.min(1, tt / attack) * (tt > dur ? Math.max(0, 1 - (tt - dur) / release) : 1)
    let s = 0
    for (let k = 0; k < voices; k++) {
      const ff = f * (1 + (k - (voices - 1) / 2) * detune)
      s += wave === 'saw' ? os[k].saw(ff) : wave === 'square' ? os[k].square(ff, 0.4) : os[k].tri(ff)
    }
    d[i0 + i] += lp.process(s / voices) * e * gain
  }
}
function pluck(d, sr, r, t, m, gain = 0.3, decay = 0.996) {
  const N = Math.max(2, Math.round(sr / mf(m)))
  const line = new Float32Array(N)
  for (let i = 0; i < N; i++) line[i] = r.bi()
  const i0 = Math.floor(t * sr), n = Math.floor(1.6 * sr)
  let p = 0, last = 0
  for (let i = 0; i < n && i0 + i < d.length; i++) {
    const cur = line[p]
    const nv = 0.5 * (cur + last) * decay
    last = cur
    line[p] = nv
    p = (p + 1) % N
    d[i0 + i] += cur * gain * Math.min(1, i / 20)
  }
}

const SONGS = [
  {
    // dance-pop, A minor, 124 bpm: Am F C G
    bpm: 124,
    chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
    roots: [45, 41, 48, 43],
    mel: [
      [[76, 1, 'а'], [76, 0.5, 'е'], [74, 0.5, 'и'], [72, 1, 'а'], [69, 1, 'о']],
      [[72, 1, 'е'], [72, 0.5, 'а'], [74, 0.5, 'у'], [72, 2, 'а']],
      [[76, 1, 'о'], [76, 0.5, 'и'], [79, 0.5, 'а'], [76, 1, 'е'], [74, 1, 'а']],
      [[74, 3, 'а'], [0, 1]],
      [[76, 1, 'а'], [81, 1, 'о'], [79, 0.5, 'и'], [76, 0.5, 'е'], [74, 1, 'а']],
      [[72, 1, 'у'], [74, 1, 'а'], [76, 2, 'е']],
      [[79, 1, 'а'], [76, 0.5, 'и'], [74, 0.5, 'е'], [72, 1, 'а'], [74, 1, 'о']],
      [[71, 2, 'а'], [0, 2]],
    ],
    style: 'dance',
  },
  {
    // «шансон»-style ballad, D minor, 92 bpm: Dm Gm C F → Dm Gm A Dm
    bpm: 92,
    chords: [[62, 65, 69], [55, 58, 62], [60, 64, 67], [53, 57, 60]],
    roots: [38, 43, 48, 41],
    mel: [
      [[57, 0.5, 'а'], [57, 0.5, 'е'], [57, 0.5, 'и'], [55, 0.5, 'о'], [53, 1, 'а'], [52, 1, 'е']],
      [[50, 1, 'о'], [55, 1, 'а'], [58, 2, 'е']],
      [[57, 0.5, 'и'], [55, 0.5, 'а'], [52, 1, 'е'], [55, 1, 'у'], [57, 1, 'а']],
      [[53, 3, 'а'], [0, 1]],
      [[62, 0.5, 'а'], [62, 0.5, 'е'], [60, 0.5, 'и'], [58, 0.5, 'о'], [57, 1, 'а'], [55, 1, 'е']],
      [[55, 1, 'о'], [58, 1, 'а'], [57, 2, 'е']],
      [[57, 1, 'и'], [61, 1, 'а'], [64, 1, 'е'], [61, 1, 'у']],
      [[62, 3, 'а'], [0, 1]],
    ],
    style: 'chanson',
  },
]

def('radio_distant', {
  sr: 11025, variants: 2, prio: 8, lazy: true, norm: { rms: 0.14, ceiling: 0.9 }, loop: 0.25,
  gen(r, sr, v) {
    const S = SONGS[v]
    const beat = 60 / S.bpm
    const bars = 8
    const len = bars * 4 * beat, x = 0.25
    const d = buf(len + x + 0.01, sr)
    const voc = buf(len + x + 0.01, sr)
    const chordsSeq = v === 0 ? [0, 1, 2, 3, 0, 1, 2, 3] : [0, 1, 2, 3, 0, 1, 2, 0]
    // render bars 0..8 (bar 8 == bar 0 so the loop cross-fade is musical)
    for (let b = 0; b <= bars; b++) {
      const bi = b % bars
      const t0 = b * 4 * beat
      if (t0 > len + x) break
      const ci = chordsSeq[bi]
      let ch = S.chords[ci], root = S.roots[ci]
      if (v === 1 && bi === 6) { ch = [57, 61, 64]; root = 45 } // A major (harmonic minor turn)
      for (let q = 0; q < 4; q++) {
        const tb = t0 + q * beat
        if (S.style === 'dance') {
          kick(d, sr, Math.floor(tb * sr), 0.9)
          if (q % 2 === 1) snare(d, sr, r, Math.floor(tb * sr), 0.5, 1700)
          hat(d, sr, r, Math.floor((tb + beat / 2) * sr), 0.25, 0.06)
          for (const k of [0, 0.5]) synthNote(d, sr, r, tb + k * beat, beat * 0.45, root + (k ? 12 : 0), { gain: 0.35, voices: 1, cutoff: 700, release: 0.03 })
          // off-beat chord stabs
          for (const m of ch) synthNote(d, sr, r, tb + beat * 0.5, beat * 0.35, m + 12, { gain: 0.07, cutoff: 2600, release: 0.08 })
        } else {
          if (q % 2 === 0) kick(d, sr, Math.floor(tb * sr), 0.7)
          else snare(d, sr, r, Math.floor(tb * sr), 0.35, 1500)
          hat(d, sr, r, Math.floor(tb * sr), 0.12, 0.03); hat(d, sr, r, Math.floor((tb + beat / 2) * sr), 0.08, 0.03)
          synthNote(d, sr, r, tb, beat * 0.8, root + (q % 2 ? 7 : 0), { gain: 0.35, voices: 1, cutoff: 600, release: 0.05, wave: 'tri' })
          // plucked guitar arpeggio
          for (let e = 0; e < 2; e++) pluck(d, sr, r, tb + e * beat / 2, ch[(q * 2 + e) % 3] + (e ? 12 : 0), 0.18)
        }
      }
      // pad
      for (const m of ch) synthNote(d, sr, r, t0, 4 * beat, m, { gain: v ? 0.06 : 0.045, cutoff: 1600, attack: 0.3, release: 0.4, detune: 0.008 })
      // vocal line
      let tm = t0
      const notes = []
      for (const [m, bt, vow] of S.mel[bi]) {
        if (m) notes.push({ t: tm, dur: bt * beat * 0.95, m, v: vow })
        tm += bt * beat
      }
      if (notes.length) sing(voc, sr, r, notes, v ? { fs: 1.0, gain: 0.5, breath: 0.05 } : { fs: 1.17, gain: 0.5 })
    }
    diffuse(voc, sr, 1.2, 3000, 0.3)
    for (let i = 0; i < d.length; i++) d[i] = d[i] * 0.8 + voc[i] * 0.5
    filt(d, sr, [['hp', 60, 0.7]])
    return cheapSpeaker(d.subarray(0, Math.floor((len + x) * sr)).slice(), sr, r, 1.6)
  },
})
void thump
